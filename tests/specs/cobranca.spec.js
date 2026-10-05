// Warden Cobrança grátis (/cobranca/): tudo no navegador, dados no localStorage do aparelho.
// Relógio fixo em 02/10/2026 12:00 (helpers). Nada é aberto de verdade: wa.me é interceptado.
const { test, expect } = require('@playwright/test');
const { abrir, preparar, preencher, semErros } = require('../helpers');

const URL = '/cobranca/';
const CHAVE = 'warden:cobranca';
const ASSINATURA = 'Enviado pelo Warden Cobrança · wardenfinance.com.br/cobranca';

// CRC16-CCITT feito à parte (não usa o código do site), para conferir o Pix que vai na mensagem
function crc16(texto) {
  let crc = 0xFFFF;
  for (const byte of Buffer.from(texto, 'latin1')) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
// lê os campos EMV de nível 1 do payload: { '00': '01', '26': '…', … }
function campos(payload) {
  const r = {};
  for (let i = 0; i < payload.length;) {
    const id = payload.slice(i, i + 2), n = Number(payload.slice(i + 2, i + 4));
    r[id] = payload.slice(i + 4, i + 4 + n);
    i += 4 + n;
  }
  return r;
}

// dados prontos (pula o onboarding); semeados uma vez só por aba, para o recarregar não apagar mudanças
function base({ clientes = [], cobrancas = [] } = {}) {
  const t = '2026-10-01T12:00:00.000Z';
  return {
    versao: 1, criadoEm: t, atualizadoEm: t, clientes, cobrancas,
    config: { pronto: true, negocio: 'Studio Bem-Estar', pix: { tipo: 'email', chave: 'teste@warden.com.br', digitada: 'teste@warden.com.br' },
      recebedor: 'WARDEN FINANCE', cidade: 'SAO PAULO',
      modelos: {} }   // vazio: o app completa com os modelos padrão
  };
}
const cli = (id, nome, whatsapp) => ({ id, nome, whatsapp, obs: '', criadoEm: '2026-10-01T12:00:00.000Z', atualizadoEm: '2026-10-01T12:00:00.000Z' });
const cob = (id, clienteId, valor, vencimento, extra = {}) => ({ id, clienteId, valor, descricao: 'Mensalidade', vencimento, diaVencimento: Number(vencimento.slice(8)),
  recorrencia: 'unica', status: 'pendente', pagaEm: null, proximaId: null, origemId: null, historico: [], criadoEm: '2026-10-01T12:00:00.000Z', atualizadoEm: '2026-10-01T12:00:00.000Z', ...extra });

async function abrirCom(page, dados, opcoes) {
  await page.addInitScript(([chave, d]) => {
    if (!sessionStorage.getItem('semeado')) { localStorage.setItem(chave, JSON.stringify(d)); sessionStorage.setItem('semeado', '1'); }
  }, [CHAVE, dados]);
  return abrir(page, URL, opcoes);
}
const lerDb = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), CHAVE);
const aba = (page, nome) => page.locator(`#tab-${nome}`).click();

// onboarding pela interface
async function onboarding(page) {
  await preencher(page, '#onb-negocio', 'Studio Bem-Estar');
  await page.locator('#onb-seguir').click();
  await page.locator('input[name="onb-tipo"][value="email"]').check();
  await preencher(page, '#onb-chave', 'teste@warden.com.br');
  await page.locator('#onb-seguir').click();
  await preencher(page, '#onb-recebedor', 'Warden Finance');
  await preencher(page, '#onb-cidade', 'São Paulo');
  await page.locator('#onb-seguir').click();
  await expect(page.locator('#app')).toBeVisible();
}
async function novoCliente(page, nome, whats) {
  await aba(page, 'clientes');
  await page.locator('#btn-novo-cliente').click();
  await preencher(page, '#cli-nome', nome);
  await preencher(page, '#cli-whats', whats);
  await page.locator('#cliente-form button[type="submit"]').click();
}
async function novaCobranca(page, { cliente, valor, descricao, vencimento, mensal = false }) {
  await aba(page, 'cobrancas');
  await page.locator('#aba-cobrancas [data-acao="nova-cobranca"]').click();
  await page.locator('#cob-cliente').selectOption({ label: cliente });
  await preencher(page, '#cob-valor', valor);
  await preencher(page, '#cob-descricao', descricao);
  await page.locator('#cob-vencimento').fill(vencimento);
  if (mensal) await page.locator('input[name="cob-rec"][value="mensal"]').check({ force: true });
  await page.locator('#cobranca-form button[type="submit"]').click();
  await expect(page.locator('#dlg-cobranca')).not.toBeVisible();
}

test.describe('cobranca', () => {
  test('cobranca: primeira vez em 3 passos (negócio, chave Pix validada, recebedor e cidade) e aviso de dados no aparelho', async ({ page }) => {
    const erros = await abrir(page, URL);
    await expect(page.getByText('Seus dados ficam salvos neste aparelho.')).toBeVisible();
    await expect(page.locator('#onb')).toBeVisible();
    await expect(page.locator('#app')).toBeHidden();
    // passo 1 exige o nome
    await page.locator('#onb-seguir').click();
    await expect(page.locator('#onb-negocio-msg')).toHaveText('Diga o nome do seu negócio');
    await preencher(page, '#onb-negocio', 'Studio Bem-Estar');
    await page.locator('#onb-seguir').click();
    // passo 2: mesma validação do gerador de Pix
    await expect(page.getByText('Passo 2 de 3')).toBeVisible();
    await page.locator('input[name="onb-tipo"][value="cpf"]').check();
    await preencher(page, '#onb-chave', '12345678900');
    await page.locator('#onb-seguir').click();
    await expect(page.locator('#onb-chave-msg')).toHaveText('CPF inválido: confira os números');
    await page.locator('input[name="onb-tipo"][value="email"]').check();
    await preencher(page, '#onb-chave', 'teste@warden.com.br');
    await expect(page.locator('#onb-chave-msg')).toContainText('Chave válida');
    await page.locator('#onb-seguir').click();
    // passo 3: nome e cidade limpos como o padrão Pix exige
    await preencher(page, '#onb-recebedor', 'Warden Finance');
    await preencher(page, '#onb-cidade', 'São Paulo');
    await expect(page.locator('#onb-cidade')).toHaveValue('SAO PAULO');
    await page.locator('#onb-seguir').click();
    await expect(page.locator('#app')).toBeVisible();
    const db = await lerDb(page);
    expect(db.versao).toBe(1);
    expect(db.config).toMatchObject({ pronto: true, negocio: 'Studio Bem-Estar', pix: { tipo: 'email', chave: 'teste@warden.com.br' }, recebedor: 'WARDEN FINANCE', cidade: 'SAO PAULO' });
    expect(Object.keys(db.config.modelos).sort()).toEqual(['firme', 'gentil', 'neutro']);
    semErros(erros);
  });

  test('cobranca: cadastro de cliente com WhatsApp validado (DDD), busca, edição e persistência ao recarregar', async ({ page }) => {
    const erros = await abrir(page, URL);
    await onboarding(page);
    await aba(page, 'clientes');
    await page.locator('#btn-novo-cliente').click();
    await preencher(page, '#cli-nome', 'Mariana Souza');
    await preencher(page, '#cli-whats', '20987654321');
    await page.locator('#cliente-form button[type="submit"]').click();
    await expect(page.locator('#cli-whats-msg')).toHaveText('DDD 20 não existe');
    await preencher(page, '#cli-whats', '1198765432');
    await page.locator('#cliente-form button[type="submit"]').click();
    await expect(page.locator('#cli-whats-msg')).toHaveText('Número incompleto: celular tem 9 dígitos depois do DDD');
    await preencher(page, '#cli-whats', '11987654321');
    await expect(page.locator('#cli-whats')).toHaveValue('(11) 98765-4321');
    await page.locator('#cliente-form button[type="submit"]').click();
    await expect(page.locator('#dlg-cliente')).not.toBeVisible();
    await novoCliente(page, 'João Lima', '(21) 3456-7890');   // fixo também vale (WhatsApp Business)
    await expect(page.locator('#lista-clientes .cb-item')).toHaveCount(2);
    await expect(page.locator('#clientes-contagem')).toHaveText('2 de 5 clientes no plano grátis');
    // busca
    await preencher(page, '#busca-cliente', 'mari');
    await expect(page.locator('#lista-clientes .cb-item')).toHaveCount(1);
    await expect(page.locator('#lista-clientes')).toContainText('(11) 98765-4321');
    await preencher(page, '#busca-cliente', '');
    // edição
    await page.locator('#lista-clientes .cb-item', { hasText: 'João Lima' }).locator('[data-acao="editar-cliente"]').click();
    await preencher(page, '#cli-obs', 'paga no dia 10');
    await page.locator('#cliente-form button[type="submit"]').click();
    const db = await lerDb(page);
    expect(db.clientes.map(c => [c.nome, c.whatsapp, c.obs]).sort()).toEqual([['João Lima', '2134567890', 'paga no dia 10'], ['Mariana Souza', '11987654321', '']]);
    expect(db.clientes.every(c => c.id && c.criadoEm && c.atualizadoEm)).toBe(true);
    // recarregar: tudo continua aqui
    await page.reload();
    await aba(page, 'clientes');
    await expect(page.locator('#lista-clientes .cb-item')).toHaveCount(2);
    await expect(page.locator('#lista-clientes')).toContainText('paga no dia 10');
    semErros(erros);
  });

  test('cobranca: nova cobrança aparece em "Cobrar hoje"; Enviar gera o link do WhatsApp do cliente com a mensagem e o Pix (CRC conferido)', async ({ page }) => {
    await page.route('**/wa.me/**', r => r.abort());
    const erros = await abrir(page, URL);
    await onboarding(page);
    await novoCliente(page, 'Mariana Souza', '11987654321');
    await novaCobranca(page, { cliente: 'Mariana Souza', valor: '150', descricao: 'mensalidade de outubro', vencimento: '2026-10-05' });
    const [c] = (await lerDb(page)).cobrancas;
    expect(c).toMatchObject({ valor: 150, descricao: 'mensalidade de outubro', vencimento: '2026-10-05', status: 'pendente', recorrencia: 'unica' });

    await aba(page, 'painel');
    const item = page.locator('#lista-hoje .cb-item');
    await expect(item).toHaveCount(1);
    await expect(item).toContainText('Vence em 3 dias');
    await item.locator('[data-acao="enviar"]').click();
    await expect(page.locator('#dlg-enviar')).toBeVisible();
    await expect(page.locator('input[name="tom"][value="gentil"]')).toBeChecked();   // antes do vencimento: gentil

    const href = await page.locator('#btn-enviar-whatsapp').getAttribute('href');
    expect(href.startsWith('https://wa.me/5511987654321?text=')).toBe(true);
    const texto = decodeURIComponent(href.split('?text=')[1]);
    expect(texto).toBe(await page.locator('#msg-previa').textContent());
    expect(texto.startsWith('Oi, Mariana! Tudo bem?')).toBe(true);
    expect(texto).toContain('pagamento de mensalidade de outubro, no valor de R$ 150,00, com vencimento em 05/10/2026');
    expect(texto).toContain('\nStudio Bem-Estar\n');
    expect(texto.endsWith('\n\n' + ASSINATURA)).toBe(true);

    // o Pix dentro da mensagem: estrutura, valor, chave e CRC
    const payload = texto.match(/^000201.*$/m)[0];   // o código vai numa linha própria (tem espaços no nome e na cidade)
    expect(crc16(payload.slice(0, -4))).toBe(payload.slice(-4));
    const f = campos(payload);
    expect(f['54']).toBe('150.00');
    expect(f['53']).toBe('986');
    expect(f['59']).toBe('WARDEN FINANCE');
    expect(f['60']).toBe('SAO PAULO');
    expect(f['26']).toContain('0014br.gov.bcb.pix0119teste@warden.com.br');
    expect(f['62']).toMatch(/^05\d\dWC[A-Za-z0-9]+$/);   // identificador da cobrança

    // trocar o tom muda o texto e o link
    await page.locator('input[name="tom"][value="firme"]').check({ force: true });
    const texto2 = decodeURIComponent((await page.locator('#btn-enviar-whatsapp').getAttribute('href')).split('?text=')[1]);
    expect(texto2.startsWith('Olá, Mariana.\nO pagamento de mensalidade de outubro')).toBe(true);
    expect(texto2).toContain(payload);

    // enviar: abre em nova aba (interceptada) e registra no histórico
    const [aba2] = await Promise.all([page.waitForEvent('popup'), page.locator('#btn-enviar-whatsapp').click()]);
    await aba2.close();
    await expect(page.locator('#enviar-status')).toContainText('Lembrete enviado em 02/10 12:00');
    await page.locator('#dlg-enviar [data-fechar]').first().click();
    await expect(page.locator('#lista-hoje')).toContainText('Lembrete enviado em 02/10 12:00');
    const hist = (await lerDb(page)).cobrancas[0].historico.filter(h => h.tipo === 'lembrete');
    expect(hist).toHaveLength(1);
    expect(hist[0].tom).toBe('firme');
    semErros(erros);
  });

  test('cobranca: copiar mensagem e mostrar QR Code do Pix', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const erros = await abrirCom(page, base({ clientes: [cli('c1', 'Mariana Souza', '11987654321')], cobrancas: [cob('k1', 'c1', 150, '2026-10-02')] }));
    await page.locator('#lista-hoje [data-acao="enviar"]').click();
    await expect(page.locator('input[name="tom"][value="neutro"]')).toBeChecked();   // vence hoje: neutro
    await page.locator('#btn-copiar-msg').click();
    await expect(page.locator('#enviar-status')).toHaveText('Mensagem copiada.');
    // a área de transferência do Windows devolve as quebras de linha como \r\n
    expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(await page.locator('#msg-previa').textContent());
    await page.locator('#btn-mostrar-qr').click();
    await expect(page.locator('#enviar-qr')).toBeVisible();
    expect(await page.locator('#qr-canvas').evaluate(c => c.width > 100 && !!c._modelo)).toBe(true);
    semErros(erros);
  });

  test('cobranca: marcar como pago (com data) e a mensal gera a do mês seguinte, uma vez só; 31 vira o último dia do mês', async ({ page }) => {
    const erros = await abrirCom(page, base({
      clientes: [cli('c1', 'Mariana Souza', '11987654321'), cli('c2', 'João Lima', '21987654321')],
      cobrancas: [
        cob('k1', 'c1', 150, '2026-10-05', { recorrencia: 'mensal' }),
        cob('k2', 'c2', 80, '2026-10-31', { recorrencia: 'mensal' }),
        cob('k3', 'c2', 50, '2026-10-03')
      ]
    }));
    // mensal do dia 5: paga em 03/10
    await page.locator('#lista-hoje .cb-item', { hasText: 'Mariana' }).locator('[data-acao="pago"]').click();
    await expect(page.locator('#pago-data')).toHaveValue('2026-10-02');
    await page.locator('#pago-data').fill('2026-10-03');
    await page.locator('#pago-form button[type="submit"]').click();
    await expect(page.locator('#cb-status')).toContainText('A próxima, com vencimento em 05/11/2026, já foi criada.');
    let db = await lerDb(page);
    const k1 = db.cobrancas.find(c => c.id === 'k1');
    expect(k1).toMatchObject({ status: 'paga', pagaEm: '2026-10-03' });
    const prox = db.cobrancas.find(c => c.id === k1.proximaId);
    expect(prox).toMatchObject({ clienteId: 'c1', valor: 150, vencimento: '2026-11-05', status: 'pendente', recorrencia: 'mensal', origemId: 'k1' });
    // desfazer e pagar de novo não duplica a próxima
    await aba(page, 'cobrancas');
    await page.locator('input[name="filtro"][value="pagas"]').check({ force: true });
    await page.locator('#lista-cobrancas .cb-item', { hasText: 'Mariana' }).locator('[data-acao="desfazer"]').click();
    await page.locator('input[name="filtro"][value="pendentes"]').check({ force: true });
    await page.locator('#lista-cobrancas [data-cobranca="k1"] [data-acao="pago"]').click();
    await page.locator('#pago-form button[type="submit"]').click();
    db = await lerDb(page);
    expect(db.cobrancas.filter(c => c.clienteId === 'c1')).toHaveLength(2);

    // dia 31: outubro → 30/11 → 31/12
    await page.locator('#lista-cobrancas [data-cobranca="k2"] [data-acao="pago"]').click();
    await page.locator('#pago-form button[type="submit"]').click();
    db = await lerDb(page);
    const nov = db.cobrancas.find(c => c.origemId === 'k2');
    expect(nov.vencimento).toBe('2026-11-30');
    await page.locator(`#lista-cobrancas [data-cobranca="${nov.id}"] [data-acao="pago"]`).click();
    await page.locator('#pago-form button[type="submit"]').click();
    db = await lerDb(page);
    expect(db.cobrancas.find(c => c.origemId === nov.id).vencimento).toBe('2026-12-31');
    // a única não gera nada
    await page.locator('#lista-cobrancas [data-cobranca="k3"] [data-acao="pago"]').click();
    await page.locator('#pago-form button[type="submit"]').click();
    db = await lerDb(page);
    expect(db.cobrancas.filter(c => c.origemId === 'k3')).toHaveLength(0);
    // painel: recebido em outubro (pela data do pagamento) = 150 + 80 + 80 (a de novembro, paga hoje) + 50
    await aba(page, 'painel');
    await expect(page.locator('#num-recebido .cb-num-valor')).toHaveText('R$ 360,00');
    await expect(page.locator('#num-recebido .cb-num-qtd')).toHaveText('4 cobranças');
    semErros(erros);
  });

  test('cobranca: painel com A receber no mês, Recebido e Atrasado; atrasadas em vermelho e filtros', async ({ page }) => {
    const erros = await abrirCom(page, base({
      clientes: [cli('c1', 'Ana', '11987654321'), cli('c2', 'Bruno', '11987654322'), cli('c3', 'Carla', '11987654323')],
      cobrancas: [
        cob('a', 'c1', 100, '2026-09-28'),                                          // atrasada (setembro)
        cob('b', 'c2', 200, '2026-10-01'),                                          // atrasada (outubro)
        cob('c', 'c3', 300, '2026-10-02'),                                          // vence hoje
        cob('d', 'c1', 400, '2026-10-20'),                                          // futura (outubro)
        cob('e', 'c2', 500, '2026-11-02'),                                          // novembro
        cob('f', 'c3', 60, '2026-09-30', { status: 'paga', pagaEm: '2026-10-01' }) // paga em outubro
      ]
    }));
    await expect(page.locator('#num-receber .cb-num-valor')).toHaveText('R$ 900,00');   // b + c + d
    await expect(page.locator('#num-receber .cb-num-qtd')).toHaveText('3 cobranças');
    await expect(page.locator('#num-recebido .cb-num-valor')).toHaveText('R$ 60,00');
    await expect(page.locator('#num-atrasado .cb-num-valor')).toHaveText('R$ 300,00');   // a + b
    await expect(page.locator('#num-atrasado .cb-num-qtd')).toHaveText('2 cobranças');
    // cobrar hoje: atrasadas primeiro, depois o que vence hoje; a de 20/10 não entra
    expect(await page.locator('#lista-hoje .cb-item-nome').allTextContents()).toEqual(['Ana', 'Bruno', 'Carla']);
    const vermelho = 'rgb(239, 68, 68)';
    expect(await page.locator('#lista-hoje [data-cobranca="a"] .cb-badge').first().evaluate(el => getComputedStyle(el).color)).toBe(vermelho);
    await expect(page.locator('#lista-hoje [data-cobranca="a"] .cb-badge').first()).toHaveText('Atrasada há 4 dias');
    expect(await page.locator('#num-atrasado .cb-num-valor').evaluate(el => getComputedStyle(el).color)).toBe(vermelho);
    // filtros
    await aba(page, 'cobrancas');
    await expect(page.locator('#lista-cobrancas .cb-item')).toHaveCount(5);
    await page.locator('input[name="filtro"][value="atrasadas"]').check({ force: true });
    expect(await page.locator('#lista-cobrancas .cb-item').evaluateAll(l => l.map(e => e.dataset.cobranca))).toEqual(['a', 'b']);
    await page.locator('input[name="filtro"][value="pagas"]').check({ force: true });
    expect(await page.locator('#lista-cobrancas .cb-item').evaluateAll(l => l.map(e => e.dataset.cobranca))).toEqual(['f']);
    semErros(erros);
  });

  test('cobranca: com 5 clientes, o 6º abre o modal do Premium (Em breve, desabilitado) e não é criado', async ({ page }) => {
    const cinco = ['Ana', 'Bruno', 'Carla', 'Davi', 'Eva'].map((n, i) => cli('c' + i, n, '1198765432' + i));
    const erros = await abrirCom(page, base({ clientes: cinco }));
    await aba(page, 'clientes');
    await expect(page.locator('#clientes-contagem')).toHaveText('5 de 5 clientes no plano grátis');
    await page.locator('#btn-novo-cliente').click();
    await expect(page.locator('#dlg-premium')).toBeVisible();
    await expect(page.locator('#dlg-cliente')).toBeHidden();
    await expect(page.locator('#premium-motivo')).toHaveText('O plano grátis vai até 5 clientes. Com o Premium, você cadastra quantos quiser.');
    const botao = page.locator('#dlg-premium [data-premium-botao]');
    await expect(botao).toHaveText('Em breve');
    await expect(botao).toBeDisabled();
    await expect(page.locator('#dlg-premium')).toContainText('O Premium está chegando');
    await expect(page.locator('#dlg-premium')).toContainText('Clientes ilimitados');
    await expect(page.locator('#dlg-premium')).toContainText('Até 5 clientes');
    await page.keyboard.press('Escape');
    expect((await lerDb(page)).clientes).toHaveLength(5);
    semErros(erros);
  });

  test('cobranca: exportar backup (JSON) e importar em outro aparelho, já no primeiro passo; arquivo inválido é recusado', async ({ page, browser }) => {
    const dados = base({ clientes: [cli('c1', 'Mariana Souza', '11987654321')], cobrancas: [cob('k1', 'c1', 150, '2026-10-05')] });
    const erros = await abrirCom(page, dados);
    await aba(page, 'config');
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-exportar').click()]);
    expect(download.suggestedFilename()).toBe('warden-cobranca-2026-10-02.json');
    const caminho = await download.path();
    const exportado = JSON.parse(require('fs').readFileSync(caminho, 'utf8'));
    expect(exportado.versao).toBe(1);
    expect(exportado.clientes).toEqual(dados.clientes);
    expect(exportado.cobrancas).toEqual(dados.cobrancas);
    expect(exportado.config).toMatchObject({ pronto: true, negocio: 'Studio Bem-Estar', pix: { chave: 'teste@warden.com.br' } });
    expect(Object.keys(exportado.config.modelos).sort()).toEqual(['firme', 'gentil', 'neutro']);   // completados pelo app
    semErros(erros);

    // outro "aparelho": navegador limpo, importa no onboarding
    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    const erros2 = await preparar(p2);
    await p2.goto(URL, { waitUntil: 'domcontentloaded' });
    await expect(p2.locator('#onb')).toBeVisible();
    // inválido primeiro
    await p2.locator('#arquivo-backup').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"oi":1}') });
    await expect(p2.locator('#cb-status')).toHaveText('Esse arquivo não é um backup válido do Warden Cobrança (versão 1).');
    await p2.locator('#arquivo-backup').setInputFiles(caminho);
    await expect(p2.locator('#confirmar-texto')).toContainText('pelos do backup (1 clientes, 1 cobranças)');
    await p2.locator('#confirmar-sim').click();
    await expect(p2.locator('#app')).toBeVisible();
    await expect(p2.locator('#lista-hoje')).toContainText('Mariana Souza');
    expect(await p2.evaluate(k => JSON.parse(localStorage.getItem(k)).clientes.length, CHAVE)).toBe(1);
    semErros(erros2);
    await ctx.close();
  });

  test('cobranca: configurações salvam negócio, Pix e modelos (com variáveis), e restaurar volta ao padrão', async ({ page }) => {
    const erros = await abrirCom(page, base({ clientes: [cli('c1', 'Mariana Souza', '11987654321')], cobrancas: [cob('k1', 'c1', 99.9, '2026-10-02')] }));
    await aba(page, 'config');
    await expect(page.locator('#cfg-negocio')).toHaveValue('Studio Bem-Estar');
    await expect(page.locator('#cfg-chave')).toHaveValue('teste@warden.com.br');
    await preencher(page, '#cfg-negocio', 'Ateliê da Mari');
    await page.locator('#cfg-form button[type="submit"]').click();
    await expect(page.locator('#cb-status')).toHaveText('Dados do negócio e do Pix salvos.');
    await preencher(page, '#modelo-neutro', 'Oi {nome}, {descricao} de {valor} vence {vencimento}. Pix: {pix} — {negocio}');
    await page.locator('#modelos-form button[type="submit"]').click();
    await aba(page, 'painel');
    await page.locator('#lista-hoje [data-acao="enviar"]').click();
    const texto = await page.locator('#msg-previa').textContent();
    expect(texto).toMatch(/^Oi Mariana, Mensalidade de R\$ 99,90 vence 02\/10\/2026\. Pix: 000201.+? — Ateliê da Mari\n\nEnviado pelo Warden Cobrança/);
    await page.keyboard.press('Escape');
    await aba(page, 'config');
    await page.locator('#modelos-padrao').click();
    await page.locator('#confirmar-sim').click();
    await expect(page.locator('#modelo-neutro')).toHaveValue(/^Olá, \{nome\}\./);
    semErros(erros);
  });

  test('cobranca: no Premium (PLANO = "premium") a mensagem termina no modelo, sem a linha "Enviado pelo Warden Cobrança"', async ({ page }) => {
    await page.route('**/cobranca/', async route => {
      const resp = await route.fetch();
      const html = (await resp.text()).replace("const PLANO = 'gratis';", "const PLANO = 'premium';");
      await route.fulfill({ response: resp, body: html });
    });
    const erros = await abrirCom(page, base({ clientes: [cli('c1', 'Mariana Souza', '11987654321')], cobrancas: [cob('k1', 'c1', 99.9, '2026-10-02')] }));
    await page.locator('#lista-hoje [data-acao="enviar"]').click();
    const texto = await page.locator('#msg-previa').textContent();
    expect(texto).not.toContain('Enviado pelo Warden Cobrança');
    expect(texto.endsWith('\nStudio Bem-Estar')).toBe(true);   // último trecho do modelo Neutro (vence hoje)
    const href = await page.locator('#btn-enviar-whatsapp').getAttribute('href');
    expect(decodeURIComponent(href.split('?text=')[1])).toBe(texto);
    semErros(erros);
  });

  test('celular: em 375px, onboarding, abas, listas e a janela de envio sem rolagem lateral', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    const rolagem = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    let erros = await abrir(page, URL);
    expect(await rolagem(), 'onboarding').toBeLessThanOrEqual(0);
    semErros(erros);
    await page.evaluate(k => localStorage.removeItem(k), CHAVE);
    const dados = base({
      clientes: [cli('c1', 'Mariana Souza de Albuquerque Figueiredo', '11987654321'), cli('c2', 'João', '21987654321')],
      cobrancas: [cob('k1', 'c1', 1234567.89, '2026-09-20'), cob('k2', 'c2', 80, '2026-10-02', { recorrencia: 'mensal' })]
    });
    await page.evaluate(([k, d]) => localStorage.setItem(k, JSON.stringify(d)), [CHAVE, dados]);
    await page.reload();
    for (const a of ['painel', 'clientes', 'cobrancas', 'config']) {
      await aba(page, a);
      expect(await rolagem(), `aba ${a}`).toBeLessThanOrEqual(0);
    }
    // as 4 abas cabem na tela, com área de toque de pelo menos 44px
    const abas = await page.locator('.cb-aba').evaluateAll(l => l.map(b => { const r = b.getBoundingClientRect(); return [r.left, r.right, r.height]; }));
    for (const [l, r, h] of abas) { expect(l).toBeGreaterThanOrEqual(0); expect(r).toBeLessThanOrEqual(375); expect(h).toBeGreaterThanOrEqual(44); }
    await aba(page, 'painel');
    await page.locator('#lista-hoje [data-acao="enviar"]').first().click();
    await page.locator('#btn-mostrar-qr').click();
    expect(await rolagem(), 'janela de envio').toBeLessThanOrEqual(0);
    const dlg = await page.locator('#dlg-enviar').evaluate(d => { const r = d.getBoundingClientRect(); return [r.left, r.right]; });
    expect(dlg[0]).toBeGreaterThanOrEqual(15);
    expect(dlg[1]).toBeLessThanOrEqual(360);
  });
});

/* ===== VITRINE DO PREMIUM ===== */
const GRATIS = ['Até 5 clientes', 'Você toca em Enviar', 'Marca o pago na mão', 'Painel básico'];
const PREMIUM_ITENS = ['Clientes ilimitados', 'Envio 100% automático (antes, no dia e depois do vencimento)', 'Baixa automática do Pix', 'Relatórios em PDF e Excel', 'Seus dados na nuvem, em qualquer aparelho', 'Sem a marca Warden nas mensagens'];
const lerPlanos = (page, onde) => page.locator(`[data-planos="${onde}"] .cb-plano`).evaluateAll(l => l.map(p => ({
  nome: p.querySelector('h3').childNodes[0].textContent.trim(),
  preco: p.querySelector('.cb-plano-preco').textContent.trim(),
  itens: [...p.querySelectorAll('li')].map(li => li.textContent.trim())
})));

test.describe('cobranca', () => {
  test('cobranca: seção Planos com a tabela Grátis x Premium; Premium "Em breve" desabilitado e "O Premium está chegando"', async ({ page }) => {
    const erros = await abrir(page, URL);
    const secao = page.locator('#planos');
    await expect(secao.locator('h2')).toHaveText('Grátis para começar. Premium para cobrar no automático.');
    expect(await lerPlanos(page, 'vitrine')).toEqual([
      { nome: 'Grátis', preco: 'R$ 0', itens: GRATIS },
      { nome: 'Premium', preco: 'O Premium está chegando', itens: PREMIUM_ITENS }
    ]);
    const botao = secao.locator('[data-premium-botao]');
    await expect(botao).toHaveText('Em breve');
    await expect(botao).toBeDisabled();
    // "Usar grátis" leva de volta à ferramenta
    expect(await secao.locator('a', { hasText: 'Usar grátis' }).getAttribute('href')).toBe('#ferramenta');
    // o modal mostra a mesma tabela (mesma função), com o selo "Seu plano"
    await page.evaluate(() => document.getElementById('dlg-premium').showModal());
    expect(await lerPlanos(page, 'modal')).toEqual(await lerPlanos(page, 'vitrine'));
    await expect(page.locator('#dlg-premium .cb-selo.neutro')).toHaveText('Seu plano');
    semErros(erros);
  });

  test('cobranca: com PREMIUM = { preco, ativo: true }, aparece o preço e o botão "Quero o Premium"', async ({ page }) => {
    await page.route('**/cobranca/', async route => {
      const resp = await route.fetch();
      const html = (await resp.text()).replace(/const PREMIUM = \{[^}]*\};/, 'const PREMIUM = { preco: "R$ 19,90 por mês", ativo: true };');
      await route.fulfill({ response: resp, body: html });
    });
    const erros = await abrir(page, URL);
    const premium = page.locator('[data-planos="vitrine"] .cb-plano.premium');
    await expect(premium.locator('.cb-plano-preco')).toHaveText('R$ 19,90 por mês');
    await expect(premium.locator('.cb-selo')).toHaveCount(0);
    const botao = premium.locator('[data-premium-botao]');
    await expect(botao).toHaveText('Quero o Premium');
    await expect(botao).toBeEnabled();
    expect(await botao.getAttribute('href')).toBe('/contato.html');
    semErros(erros);
  });

  test('cobranca: "Ver planos" da home leva à seção Planos; em 375px a vitrine não rola para o lado', async ({ page }) => {
    let erros = await abrir(page, '/index.html');
    const link = page.locator('#cobranca a.cobranca-planos');
    await expect(link).toHaveText('Ver planos');
    expect(await link.getAttribute('href')).toBe('/cobranca/#planos');
    semErros(erros);
    await page.setViewportSize({ width: 375, height: 800 });
    erros = await abrir(page, '/cobranca/#planos');
    await expect(page.locator('#planos')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    semErros(erros);
  });
});
