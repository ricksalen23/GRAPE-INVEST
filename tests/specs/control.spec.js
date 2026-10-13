// Warden Control (/control/): contas a pagar e a receber, tudo no navegador (localStorage warden:control:v1).
// Relógio fixo em 02/10/2026 12:00 (helpers). Dinheiro sempre em centavos inteiros.
const { test, expect } = require('@playwright/test');
const { abrir, preencher, semErros } = require('../helpers');

const URL = '/control/';
const CHAVE = 'warden:control:v1';
const HOJE = '2026-10-02';

// db pronto (pula a tela vazia); semeado uma vez por aba, para recarregar não apagar mudanças
function base({ contas = [], recorrencias = [], modelos = [], saldo = { pessoal: 0, negocio: 0 }, config = {} } = {}) {
  const t = '2026-10-01T12:00:00.000Z';
  return { versao: 1, criadoEm: t, atualizadoEm: t, contas, recorrencias, modelos,
    config: { saldoInicial: saldo, saldoDefinido: true, perfil: 'tudo', primeirosPassosOcultos: false, ...config } };   // sem categorias: o app completa
}
const conta = (id, tipo, descricao, valor, vencimento, extra = {}) => ({ id, tipo, descricao, valor, vencimento, categoriaId: '', contato: '', forma: '', obs: '',
  perfil: 'pessoal', grupoId: null, parcela: null, recorrenciaId: null, ocorrencia: null, baixas: [], criadoEm: '2026-10-01T12:00:00.000Z', atualizadoEm: '2026-10-01T12:00:00.000Z', ...extra });

// conta fixa do "Meu mês"
const modelo = (id, tipo, descricao, valor, dia, extra = {}) => ({ id, tipo, descricao, valor, dia, categoriaId: '', perfil: 'pessoal', variavel: false, ativo: true,
  excluidos: [], criadoEm: '2026-09-01T12:00:00.000Z', ...extra });
const doMes = (page, desc) => page.locator('.ctl-mes .ctl-linha', { has: page.locator('.ctl-linha-desc', { hasText: desc }) });
const grupo = (page, nome) => page.locator(`.ctl-mes [data-grupo="${nome}"]`);

async function abrirCom(page, dados, tela = 'contas', opcoes) {
  if (dados) {
    await page.addInitScript(([chave, d]) => {
      if (!sessionStorage.getItem('semeado')) { localStorage.setItem(chave, JSON.stringify(d)); sessionStorage.setItem('semeado', '1'); }
    }, [CHAVE, dados]);
  }
  return abrir(page, URL + '#' + tela, opcoes);
}
const lerDb = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), CHAVE);
const linha = (page, desc) => page.locator('.ctl-linha', { has: page.locator('.ctl-linha-desc', { hasText: desc }) });
const nucleo = (page, fn, ...args) => page.evaluate(([f, a]) => window.ControlNucleo[f](...a), [fn, args]);

async function novoLancamento(page, { tipo = 'pagar', valor, descricao, vencimento, repeticao, parcelas, freq, jaPaga }) {
  await page.locator('[data-novo]:visible, [data-acao="novo"]:visible').first().click();
  const dlg = page.locator('#dlg-lanc');
  await expect(dlg).toBeVisible();
  await dlg.locator(`input[name="tipo"][value="${tipo}"]`).check({ force: true });
  await preencher(page, '#lanc-valor', valor);
  await preencher(page, '#lanc-desc', descricao);
  if (vencimento) await preencher(page, '#lanc-venc', vencimento);
  if (repeticao) await dlg.locator(`input[name="repeticao"][value="${repeticao}"]`).check({ force: true });
  if (parcelas) await preencher(page, '#lanc-parcelas', parcelas);
  if (freq) await page.locator('#lanc-freq').selectOption(freq);
  if (jaPaga) await page.locator('#lanc-paga').check();
  await page.locator('#lanc-salvar').click();
  await expect(dlg).toBeHidden();
}

test.describe('control', () => {
  test('estado vazio: dois botões grandes, sem filtros e sem botão de novo lançamento solto', async ({ page }) => {
    const erros = await abrirCom(page, null, 'contas');
    await expect(page.locator('.ctl-vazio')).toBeVisible();
    await expect(page.locator('.ctl-vazio [data-acao="novo"]')).toHaveCount(2);
    await expect(page.locator('.ctl-filtros')).toHaveCount(0);
    await expect(page.locator('[data-novo]:visible')).toHaveCount(0);
    // com uma conta: filtros aparecem e há UM botão de novo lançamento visível
    await page.locator('.ctl-vazio [data-acao="novo"][data-tipo="pagar"]').click();
    await preencher(page, '#lanc-valor', '150,00');
    await preencher(page, '#lanc-desc', 'Aluguel');
    await page.locator('#lanc-salvar').click();
    await expect(page.locator('.ctl-filtros')).toBeVisible();
    await expect(page.locator('[data-novo]:visible')).toHaveCount(1);
    const db = await lerDb(page);
    expect(db.versao).toBe(1);
    expect(db.contas[0]).toMatchObject({ tipo: 'pagar', descricao: 'Aluguel', valor: 15000, vencimento: HOJE });
    semErros(erros);
  });

  test('valores digitados viram centavos inteiros', async ({ page }) => {
    await abrirCom(page, base());
    const casos = await page.evaluate(() => ['1.500,50', '150.00', '1.500', '12,5', '0,10', 'R$ 3.588,00', 'abc', '1,2,3'].map(window.ControlNucleo.parseCentavos));
    expect(casos).toEqual([150050, 15000, 150000, 1250, 10, 358800, null, null]);
    expect(await nucleo(page, 'formatBRL', -123456)).toBe('− R$ 1.234,56');
  });

  test('baixa total em 1 toque, com Desfazer no toast', async ({ page }) => {
    const erros = await abrirCom(page, base({ contas: [conta('c1', 'pagar', 'Internet', 11990, HOJE)] }));
    const l = linha(page, 'Internet');
    await expect(l.locator('.ctl-pill')).toHaveText('Vence hoje');
    await l.locator('.ctl-check').click();
    await expect(page.locator('#toast')).toContainText('Internet: paga');
    let db = await lerDb(page);
    expect(db.contas[0].baixas).toHaveLength(1);
    expect(db.contas[0].baixas[0]).toMatchObject({ valor: 11990, data: HOJE, desconto: 0, juros: 0 });
    await expect(l).toHaveCount(0);   // filtro padrão "Em aberto"
    await page.locator('#toast button').click();
    await expect(linha(page, 'Internet')).toBeVisible();
    db = await lerDb(page);
    expect(db.contas[0].baixas).toHaveLength(0);
    semErros(erros);
  });

  test('o Desfazer do toast some depois de 5 segundos', async ({ page }) => {
    await abrirCom(page, base({ contas: [conta('c1', 'pagar', 'Internet', 11990, HOJE)] }));
    await linha(page, 'Internet').locator('.ctl-check').click();
    await expect(page.locator('#toast button')).toBeVisible();
    await expect(page.locator('#toast')).not.toHaveClass(/on/, { timeout: 7000 });
    // o botão Desfazer da barra continua valendo para a última ação
    await page.locator('#desfazer').click();
    expect((await lerDb(page)).contas[0].baixas).toHaveLength(0);
  });

  test('baixa parcial: R$ 100 com R$ 40 de baixa deixa R$ 60', async ({ page }) => {
    const erros = await abrirCom(page, base({ contas: [conta('c1', 'pagar', 'Dentista', 10000, '2026-10-10')] }));
    await linha(page, 'Dentista').locator('.ctl-linha-corpo').click();
    const dlg = page.locator('#dlg-detalhe');
    await dlg.locator('[data-acao="det-ajustes"]').click();
    await preencher(page, '#aj-valor', '40');
    await expect(page.locator('#aj-res')).toContainText('Ficam faltando R$ 60,00');
    await dlg.locator('#form-ajuste button[type="submit"]').click();
    await expect(dlg.locator('[data-det="restante"]')).toContainText('R$ 60,00');
    await expect(dlg.locator('.ctl-pill')).toHaveText('Parcial');
    let db = await lerDb(page);
    expect(db.contas[0].baixas[0].valor).toBe(4000);
    expect(await page.evaluate(() => window.ControlNucleo.restante(window.WardenControl.db.contas[0]))).toBe(6000);
    // na lista: mostra o que falta
    await dlg.locator('[data-fechar]').click();
    await expect(linha(page, 'Dentista').locator('.ctl-num')).toHaveText('− R$ 60,00');
    await expect(linha(page, 'Dentista').locator('.de')).toContainText('R$ 100,00');
    // o círculo quita o resto
    await linha(page, 'Dentista').locator('.ctl-check').click();
    db = await lerDb(page);
    expect(db.contas[0].baixas.map(b => b.valor)).toEqual([4000, 6000]);
    semErros(erros);
  });

  test('baixa com desconto, juros e data; não deixa abater mais do que falta', async ({ page }) => {
    await abrirCom(page, base({ contas: [conta('c1', 'pagar', 'Boleto escola', 50000, '2026-09-30')] }));
    await linha(page, 'Boleto escola').locator('.ctl-linha-corpo').click();
    await expect(page.locator('#dlg-detalhe .ctl-pill')).toHaveText('Atrasada');
    await page.locator('[data-acao="det-ajustes"]').click();
    await preencher(page, '#aj-valor', '600');
    await expect(page.locator('#aj-res')).toHaveClass(/erro/);
    await preencher(page, '#aj-valor', '510');
    await preencher(page, '#aj-juros', '10');
    await preencher(page, '#aj-data', '2026-10-01');
    await expect(page.locator('#aj-res')).toContainText('Quita a conta');
    await page.locator('#form-ajuste button[type="submit"]').click();
    const db = await lerDb(page);
    expect(db.contas[0].baixas[0]).toMatchObject({ valor: 51000, juros: 1000, desconto: 0, data: '2026-10-01' });
    await expect(page.locator('#dlg-detalhe .ctl-pill')).toHaveText('Paga');
  });

  test('status: prevista, vence hoje, atrasada, parcial e paga', async ({ page }) => {
    const pagaB = [{ id: 'b1', data: '2026-10-01', valor: 1000, desconto: 0, juros: 0 }];
    const parcB = [{ id: 'b2', data: '2026-10-01', valor: 500, desconto: 0, juros: 0 }];
    await abrirCom(page, base({ contas: [
      conta('a', 'pagar', 'Futura', 1000, '2026-10-20'), conta('b', 'pagar', 'Hoje', 1000, HOJE), conta('c', 'pagar', 'Vencida', 1000, '2026-09-20'),
      conta('d', 'pagar', 'Metade', 1000, '2026-10-20', { baixas: parcB }), conta('e', 'receber', 'Recebida', 1000, '2026-10-01', { baixas: pagaB })
    ] }));
    await page.locator('[data-acao="filtro-status"][data-v="todas"]').click();
    await expect(linha(page, 'Futura').locator('.ctl-pill')).toHaveText('Prevista');
    await expect(linha(page, 'Hoje').locator('.ctl-pill')).toHaveText('Vence hoje');
    await expect(linha(page, 'Vencida').locator('.ctl-pill')).toHaveText('Atrasada');
    await expect(linha(page, 'Metade').locator('.ctl-pill')).toHaveText('Parcial');
    await expect(linha(page, 'Recebida').locator('.ctl-pill')).toHaveText('Recebida');
    // filtros
    await page.locator('[data-acao="filtro-status"][data-v="atrasadas"]').click();
    await expect(page.locator('.ctl-linha')).toHaveCount(1);
    await page.locator('[data-acao="filtro-status"][data-v="pagas"]').click();
    await expect(page.locator('.ctl-linha')).toHaveCount(1);
    await page.locator('[data-acao="filtro-status"][data-v="aberto"]').click();
    await expect(page.locator('.ctl-linha')).toHaveCount(4);
    await page.locator('#busca').fill('metade');
    await expect(page.locator('.ctl-linha')).toHaveCount(1);
    await expect(page.locator('#busca')).toBeFocused();
  });

  test('parcelamento: 3x de um total que não divide exato, dia 31 vira o último dia do mês', async ({ page }) => {
    const erros = await abrirCom(page, base());
    await novoLancamento(page, { valor: '1.000,00', descricao: 'Geladeira', vencimento: '2026-10-31', repeticao: 'parcelada', parcelas: 3 });
    const db = await lerDb(page);
    const ps = db.contas.filter(c => c.descricao === 'Geladeira').sort((a, b) => a.parcela.n - b.parcela.n);
    expect(ps.map(p => p.valor)).toEqual([33334, 33333, 33333]);
    expect(ps.reduce((s, p) => s + p.valor, 0)).toBe(100000);
    expect(ps.map(p => p.vencimento)).toEqual(['2026-10-31', '2026-11-30', '2026-12-31']);
    expect(new Set(ps.map(p => p.grupoId)).size).toBe(1);
    await expect(linha(page, 'Geladeira').first().locator('.ctl-linha-meta')).toContainText('parcela 1/3');
    // excluir "esta e as próximas" a partir da 2ª
    await linha(page, 'Geladeira').nth(1).locator('.ctl-linha-corpo').click();
    await page.locator('[data-acao="det-excluir"]').click();
    await page.locator('#dlg-confirmar [data-v="proximas"]').click();
    await expect.poll(async () => (await lerDb(page)).contas.map(c => c.parcela.n)).toEqual([1]);
    semErros(erros);
  });

  test('recorrência mensal: gera até 90 dias, sem duplicar ao recarregar', async ({ page }) => {
    const erros = await abrirCom(page, base());
    await novoLancamento(page, { valor: '1800', descricao: 'Aluguel', vencimento: '2026-10-05', repeticao: 'recorrente', freq: 'mensal' });
    let db = await lerDb(page);
    expect(db.recorrencias).toHaveLength(1);
    expect(db.contas.map(c => c.vencimento).sort()).toEqual(['2026-10-05', '2026-11-05', '2026-12-05']);
    await page.reload();
    await page.reload();
    db = await lerDb(page);
    expect(db.contas).toHaveLength(3);
    // passa o tempo: em 10/11 o horizonte chega a 08/02 → mais 2 ocorrências, nenhuma repetida
    const novas = await page.evaluate(() => { const N = window.ControlNucleo, d = window.WardenControl.db; return N.gerarRecorrencias(d, '2026-11-10').map(c => c.vencimento); });
    expect(novas).toEqual(['2027-01-05', '2027-02-05']);
    semErros(erros);
  });

  test('recorrência semanal e anual; excluir uma ocorrência não faz ela voltar', async ({ page }) => {
    await abrirCom(page, base());
    const r = await page.evaluate(() => {
      const N = window.ControlNucleo, d = N.dbVazio();
      N.criarLancamento(d, { tipo: 'pagar', descricao: 'Feira', valor: 8000, vencimento: '2026-10-03', repeticao: 'recorrente', freq: 'semanal', ref: '2026-10-02' });
      N.criarLancamento(d, { tipo: 'pagar', descricao: 'IPVA', valor: 150000, vencimento: '2026-02-28', repeticao: 'recorrente', freq: 'anual', ref: '2026-10-02' });
      const semanal = d.contas.filter(c => c.descricao === 'Feira');
      const segunda = semanal[1];
      N.excluir(d, segunda.id, 'esta');
      const antes = d.contas.length;
      N.gerarRecorrencias(d, '2026-10-02');
      return { semanas: semanal.length, primeira: semanal[0].vencimento, segunda: segunda.vencimento, ipva: d.contas.filter(c => c.descricao === 'IPVA').map(c => c.vencimento), igual: antes === d.contas.length };
    });
    expect(r.semanas).toBe(13);   // 03/10 a 26/12 (90 dias)
    expect(r.primeira).toBe('2026-10-03');
    expect(r.segunda).toBe('2026-10-10');
    expect(r.ipva).toEqual(['2026-02-28']);   // a de 2027 só entra quando faltar menos de 90 dias
    expect(r.igual).toBe(true);
  });

  test('fluxo de caixa: saldo atual, previsto 30/60/90 e alerta de saldo negativo', async ({ page }) => {
    const erros = await abrirCom(page, base({
      saldo: { pessoal: 100000, negocio: 0 },
      contas: [
        conta('pago', 'pagar', 'Mercado', 20000, '2026-10-01', { baixas: [{ id: 'b', data: '2026-10-01', valor: 20000, desconto: 0, juros: 0 }] }),
        conta('atr', 'pagar', 'Luz', 10000, '2026-09-28'),               // atrasada: entra hoje
        conta('rec', 'receber', 'Cliente', 50000, '2026-10-20'),
        conta('alu', 'pagar', 'Aluguel', 150000, '2026-10-25'),          // aqui o saldo fica negativo
        conta('n60', 'receber', 'Projeto', 200000, '2026-11-20'),
        conta('n90', 'pagar', 'Viagem', 30000, '2026-12-20')
      ]
    }), 'fluxo');
    // saldo de hoje: 1.000 − 200 = 800
    await expect(page.locator('[data-valor="saldo-fluxo"]')).toHaveText('R$ 800,00');
    // 30 dias: 800 − 100 + 500 − 1.500 = −300
    await expect(page.locator('[data-previsto="30"] .ctl-num')).toHaveText('− R$ 300,00');
    await expect(page.locator('[data-previsto="60"] .ctl-num')).toHaveText('R$ 1.700,00');
    await expect(page.locator('[data-previsto="90"] .ctl-num')).toHaveText('R$ 1.400,00');
    await expect(page.locator('.ctl-alerta[role="alert"]')).toContainText('25/10/2026');
    await expect(page.locator('.ctl-alerta[role="alert"]')).toContainText('− R$ 300,00');
    const p = await page.evaluate(() => window.ControlNucleo.previsao(window.WardenControl.db, 'tudo', 30, '2026-10-02'));
    expect(p).toEqual({ saldo: -30000, entradas: 50000, saidas: 160000 });
    // trocar o período do gráfico
    await page.locator('[data-acao="periodo"][data-v="90"]').click();
    await expect(page.locator('.ctl-mov .ctl-linha')).toHaveCount(5);
    semErros(erros);
  });

  test('perfis: Pessoal, Negócio e Tudo separam contas e saldo', async ({ page }) => {
    await abrirCom(page, base({ saldo: { pessoal: 10000, negocio: 50000 }, contas: [
      conta('p', 'pagar', 'Escola', 1000, '2026-10-10'), conta('n', 'pagar', 'Fornecedor', 2000, '2026-10-10', { perfil: 'negocio' })
    ] }), 'inicio');
    await expect(page.locator('[data-valor="saldo"]')).toHaveText('R$ 600,00');
    await page.locator('#perfil').selectOption('negocio');
    await expect(page.locator('[data-valor="saldo"]')).toHaveText('R$ 500,00');
    await page.locator('a[href="#contas"]:visible').first().click();
    await expect(page.locator('.ctl-linha')).toHaveCount(1);
    await expect(linha(page, 'Fornecedor')).toBeVisible();
    expect((await lerDb(page)).config.perfil).toBe('negocio');
  });

  test('saldo inicial e primeiros passos', async ({ page }) => {
    const erros = await abrirCom(page, null, 'inicio');
    const passos = page.locator('.ctl-passos');
    await expect(passos).toContainText('0 de 3');
    await passos.locator('[data-acao="saldo"]').click();
    await preencher(page, '#saldo-pessoal', '2.450,00');
    await preencher(page, '#saldo-negocio', '-100');
    await page.locator('#form-saldo button[type="submit"]').click();
    await expect(page.locator('[data-valor="saldo"]')).toHaveText('R$ 2.350,00');
    await expect(passos).toContainText('1 de 3');
    await novoLancamento(page, { valor: '50', descricao: 'Padaria', vencimento: HOJE });
    await expect(passos).toContainText('2 de 3');
    await linha(page, 'Padaria').locator('.ctl-check').click();
    await expect(page.locator('.ctl-passos')).toHaveCount(0);   // os três feitos: o cartão sai
    expect((await lerDb(page)).config.saldoInicial).toEqual({ pessoal: 245000, negocio: -10000 });
    semErros(erros);
  });

  test('editar e excluir, com Desfazer', async ({ page }) => {
    await abrirCom(page, base({ contas: [conta('c1', 'pagar', 'Academia', 9990, '2026-10-10')] }));
    await linha(page, 'Academia').locator('.ctl-linha-corpo').click();
    await page.locator('[data-acao="det-editar"]').click();
    await expect(page.locator('#lanc-titulo')).toHaveText('Editar conta');
    await preencher(page, '#lanc-valor', '119,90');
    await page.locator('#lanc-salvar').click();
    expect((await lerDb(page)).contas[0].valor).toBe(11990);
    await linha(page, 'Academia').locator('.ctl-linha-corpo').click();
    await page.locator('[data-acao="det-excluir"]').click();
    await page.locator('#dlg-confirmar [data-v="sim"]').click();
    await expect.poll(async () => (await lerDb(page)).contas.length).toBe(0);
    await page.locator('#toast button').click();
    expect((await lerDb(page)).contas[0].valor).toBe(11990);
  });

  test('categorias editáveis', async ({ page }) => {
    await abrirCom(page, base({ contas: [conta('c1', 'pagar', 'Ração', 15000, '2026-10-10', { categoriaId: 'cat_lazer' })] }), 'ajustes');
    await preencher(page, '#cat-nome', 'Pet');
    await page.locator('#form-cat button[type="submit"]').click();
    let db = await lerDb(page);
    expect(db.config.categorias.some(c => c.nome === 'Pet' && c.tipo === 'pagar')).toBe(true);
    // excluir "Lazer": a conta vai para "Outros gastos"
    await page.locator('[data-acao="cat-excluir"][data-id="cat_lazer"]').click();
    await page.locator('#dlg-confirmar [data-v="sim"]').click();
    await expect.poll(async () => (await lerDb(page)).config.categorias.some(c => c.id === 'cat_lazer')).toBe(false);
    db = await lerDb(page);
    expect(db.contas[0].categoriaId).toBe('cat_outros-pagar');
  });

  test('backup JSON (exportar e importar) e planilha CSV', async ({ page }) => {
    await abrirCom(page, base({ contas: [conta('c1', 'pagar', 'Aluguel; sala "A"', 180000, '2026-10-05', { obs: 'linha 1' })] }), 'ajustes');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-acao="exportar-json"]').click()]);
    expect(dl.suggestedFilename()).toBe(`warden-control-backup-${HOJE}.json`);
    const backup = JSON.parse(require('fs').readFileSync(await dl.path(), 'utf8'));
    expect(backup).toMatchObject({ app: 'warden-control', versao: 1 });
    expect(backup.dados.contas[0].valor).toBe(180000);

    const [csv] = await Promise.all([page.waitForEvent('download'), page.locator('[data-acao="exportar-csv"]').click()]);
    const texto = require('fs').readFileSync(await csv.path(), 'utf8');
    expect(texto.charCodeAt(0)).toBe(0xFEFF);
    expect(texto).toContain('"Aluguel; sala ""A"""');
    expect(texto).toContain(';1800,00;05/10/2026;');

    // importar: troca os dados (apaga, depois importa o backup)
    await page.evaluate(k => localStorage.removeItem(k), CHAVE);
    backup.dados.contas[0].descricao = 'Do backup';
    await page.locator('#arquivo-backup').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
    await page.locator('#dlg-confirmar [data-v="sim"]').click();
    await expect.poll(async () => ((await lerDb(page)) || { contas: [{}] }).contas[0].descricao).toBe('Do backup');
    // arquivo inválido: avisa e não mexe em nada
    await page.locator('#arquivo-backup').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"oi":1}') });
    await expect(page.locator('#toast')).toContainText('não é um backup');
    expect((await lerDb(page)).contas[0].descricao).toBe('Do backup');
  });

  test('relatório do mês: recebido, pago, resultado e onde mais gastou', async ({ page }) => {
    const b = (data, valor) => [{ id: 'b' + valor, data, valor, desconto: 0, juros: 0 }];
    await abrirCom(page, base({ contas: [
      conta('a', 'receber', 'Salário', 500000, '2026-10-05', { baixas: b('2026-10-01', 500000), categoriaId: 'cat_salario' }),
      conta('m', 'pagar', 'Mercado', 80000, '2026-10-01', { baixas: b('2026-10-01', 80000), categoriaId: 'cat_alimentacao' }),
      conta('s', 'pagar', 'Farmácia', 20000, '2026-09-30', { baixas: b('2026-10-02', 20000), categoriaId: 'cat_saude' }),
      conta('v', 'pagar', 'Antiga', 99900, '2026-09-10', { baixas: b('2026-09-10', 99900) })
    ] }), 'relatorio');
    await expect(page.locator('[data-rel="recebido"]')).toHaveText('R$ 5.000,00');
    await expect(page.locator('[data-rel="pago"]')).toHaveText('R$ 1.000,00');
    await expect(page.locator('[data-rel="resultado"]')).toHaveText('+ R$ 4.000,00');
    await expect(page.locator('.ctl-barras li').first()).toContainText('Alimentação');
    await page.locator('[data-acao="mes"][data-v="-1"]').click();
    await expect(page.locator('[data-rel="pago"]')).toHaveText('R$ 999,00');
  });

  test('dados corrompidos ou de outra versão não derrubam o app', async ({ page }) => {
    await page.addInitScript(k => { if (!sessionStorage.getItem('x')) { localStorage.setItem(k, '{quebrado'); sessionStorage.setItem('x', 1); } }, CHAVE);
    const erros = await abrir(page, URL);
    await expect(page.locator('.ctl-vazio')).toBeVisible();
    const msg = await page.evaluate(() => { try { window.ControlNucleo.migrar({ versao: 99, contas: [] }); return 'ok'; } catch (e) { return e.message; } });
    expect(msg).toContain('versão mais nova');
    semErros(erros);
  });

  // ---------- Meu mês (contas fixas) ----------
  test.describe('meu mês', () => {
    const tres = () => [
      modelo('m1', 'pagar', 'Aluguel', 180000, 5, { categoriaId: 'cat_moradia' }),
      modelo('m2', 'pagar', 'Internet', 11990, 15, { categoriaId: 'cat_contas-casa' }),
      modelo('m3', 'receber', 'Salário', 450000, 31, { categoriaId: 'cat_salario' })
    ];

    test('a lista do mês se gera sozinha, uma vez só, tudo desmarcado (dia 31 → último dia do mês)', async ({ page }) => {
      const erros = await abrirCom(page, base({ modelos: tres() }), 'mes');
      await expect(page.locator('.ctl-mes .ctl-linha')).toHaveCount(3);
      await expect(page.locator('.ctl-mes .ctl-check[aria-pressed="true"]')).toHaveCount(0);
      await page.reload();
      await page.reload();
      const db = await lerDb(page);
      expect(db.contas).toHaveLength(3);
      expect(db.contas.map(c => [c.modeloId, c.vencimento, c.baixas.length]).sort()).toEqual([
        ['m1', '2026-10-05', 0], ['m2', '2026-10-15', 0], ['m3', '2026-10-31', 0]
      ]);
      expect(db.contas.every(c => c.ocorrencia === c.vencimento)).toBe(true);
      // ícone da categoria em cada item
      await expect(doMes(page, 'Aluguel').locator('.ctl-linha-icone svg')).toHaveCount(1);
      // novembro: dia 31 vira 30/11; rodar de novo não duplica
      const nov = await page.evaluate(() => {
        const N = window.ControlNucleo, d = JSON.parse(JSON.stringify(window.WardenControl.db));
        const a = N.gerarMes(d, '2026-11').map(c => c.vencimento), b = N.gerarMes(d, '2026-11').length;
        return { a, b };
      });
      expect(nov.a.sort()).toEqual(['2026-11-05', '2026-11-15', '2026-11-30']);
      expect(nov.b).toBe(0);
      // as contas geradas são contas normais: aparecem em Contas
      await page.locator('a[href="#contas"]:visible').first().click();
      await expect(linha(page, 'Aluguel')).toBeVisible();
      semErros(erros);
    });

    test('marcar = baixa total hoje, desmarcar = reabrir, ambos com Desfazer; progresso "N de M pagas · faltam R$ X"', async ({ page }) => {
      const erros = await abrirCom(page, base({ modelos: tres() }), 'mes');
      const prog = page.locator('[data-mes="progresso"]');
      await expect(prog).toHaveText('0 de 3 pagas · faltam R$ 6.419,90');
      await doMes(page, 'Aluguel').locator('.ctl-check').click();
      await expect(prog).toHaveText('1 de 3 pagas · faltam R$ 4.619,90');
      let db = await lerDb(page);
      expect(db.contas.find(c => c.modeloId === 'm1').baixas).toMatchObject([{ valor: 180000, data: HOJE }]);
      // Desfazer no toast
      await expect(page.locator('#toast')).toContainText('Aluguel: paga');
      await page.locator('#toast button').click();
      await expect(prog).toHaveText('0 de 3 pagas · faltam R$ 6.419,90');
      expect((await lerDb(page)).contas.find(c => c.modeloId === 'm1').baixas).toHaveLength(0);
      // marca de novo; o item vai para "Pagas" (recolhido)
      await doMes(page, 'Aluguel').locator('.ctl-check').click();
      const pagas = grupo(page, 'Pagas');
      await expect(pagas).not.toHaveAttribute('open', '');
      await pagas.locator('summary').click();
      await expect(doMes(page, 'Aluguel').locator('.ctl-pill')).toHaveText('Paga dia 02/10');
      // desmarcar reabre, com Desfazer
      await doMes(page, 'Aluguel').locator('.ctl-check').click();
      await expect(page.locator('#toast')).toContainText('Aluguel: reaberta');
      expect((await lerDb(page)).contas.find(c => c.modeloId === 'm1').baixas).toHaveLength(0);
      await page.locator('#toast button').click();
      db = await lerDb(page);
      expect(db.contas.find(c => c.modeloId === 'm1').baixas).toHaveLength(1);
      semErros(erros);
    });

    test('valor variável: sugere o do mês anterior e o ajuste muda só aquele mês', async ({ page }) => {
      const set = conta('set', 'pagar', 'Luz', 18750, '2026-09-28', { modeloId: 'luz', ocorrencia: '2026-09-28',
        baixas: [{ id: 'b', data: '2026-09-28', valor: 18750, desconto: 0, juros: 0 }] });
      const erros = await abrirCom(page, base({ modelos: [modelo('luz', 'pagar', 'Luz', 15000, 28, { variavel: true, categoriaId: 'cat_contas-casa' })], contas: [set] }), 'mes');
      const out = () => lerDb(page).then(d => d.contas.find(c => c.modeloId === 'luz' && c.ocorrencia === '2026-10-28'));
      expect((await out()).valor).toBe(18750);   // o de setembro, não o padrão
      await expect(doMes(page, 'Luz').locator('.ctl-linha-meta')).toContainText('ajustar valor');
      await doMes(page, 'Luz').locator('.ctl-linha-corpo').click();
      const dlg = page.locator('#dlg-confirmar');
      await expect(dlg).toContainText('R$ 187,50');
      await preencher(page, '#conf-campo', '210,40');
      await dlg.locator('[data-v="ok"]').click();
      await expect.poll(async () => (await out()).valor).toBe(21040);
      const db = await lerDb(page);
      expect(db.contas.find(c => c.id === 'set').valor).toBe(18750);
      expect(db.modelos[0].valor).toBe(15000);
      await expect(doMes(page, 'Luz').locator('.ctl-num')).toHaveText('− R$ 210,40');
      // novembro sugere o valor ajustado de outubro
      const nov = await page.evaluate(() => { const d = JSON.parse(JSON.stringify(window.WardenControl.db)); return window.ControlNucleo.gerarMes(d, '2026-11')[0].valor; });
      expect(nov).toBe(21040);
      // Desfazer volta o valor sugerido
      await page.locator('#toast button').click();
      expect((await out()).valor).toBe(18750);
      semErros(erros);
    });

    test('prazos em pílulas: atrasada, hoje, em 2 dias, futura, paga (e para receber)', async ({ page }) => {
      // 'ant' (só a de setembro) está pausado: não gera outubro
      const ms = ['a', 'h', 'd2', 'f', 'p', 'r', 'rr', 'ant'].map((id, i) => modelo(id, 'pagar', id, 1000, 1 + i, { ativo: id !== 'ant' }));
      const c = (id, desc, venc, extra = {}) => conta('c' + id, 'pagar', desc, 1000, venc, { modeloId: id, ocorrencia: venc, ...extra });
      const pago = d => ({ baixas: [{ id: 'b' + d, data: d, valor: 1000, desconto: 0, juros: 0 }] });
      await abrirCom(page, base({ modelos: ms, contas: [
        c('a', 'Atrasada', '2026-10-01'), c('h', 'Hoje', HOJE), c('d2', 'Em dois', '2026-10-04'), c('f', 'Futura', '2026-10-20'),
        c('p', 'Paga', '2026-10-05', pago('2026-10-01')), c('r', 'Cliente', '2026-10-10', { tipo: 'receber' }),
        c('rr', 'Recebida', '2026-10-03', { tipo: 'receber', ...pago(HOJE) }), c('ant', 'Do mês passado', '2026-09-28')
      ] }), 'mes');
      const pill = d => doMes(page, d).locator('.ctl-pill');
      await expect(pill('Atrasada')).toHaveText('Venceu dia 01/10 · 1 dia de atraso');
      await expect(pill('Atrasada')).toHaveClass(/atrasada/);
      await expect(pill('Do mês passado')).toHaveText('Venceu dia 28/09 · 4 dias de atraso');
      await expect(pill('Hoje')).toHaveText('Vence hoje');
      await expect(pill('Hoje')).toHaveClass(/hoje/);
      await expect(pill('Em dois')).toHaveText('Vence dia 04/10 · em 2 dias');
      await expect(pill('Em dois')).toHaveClass(/breve/);
      await expect(pill('Futura')).toHaveText('Vence dia 20/10');
      await expect(pill('Futura')).toHaveClass(/^ctl-pill\s*$/);
      await expect(pill('Cliente')).toHaveText('Recebe dia 10/10');
      await grupo(page, 'Pagas').locator('summary').click();
      await expect(pill('Paga')).toHaveText('Paga dia 01/10');
      await expect(pill('Paga')).toHaveClass(/paga/);
      await expect(pill('Recebida')).toHaveText('Recebida dia 02/10');
      // grupos
      await expect(grupo(page, 'Atrasadas').locator('.ctl-linha')).toHaveCount(2);
      await expect(grupo(page, 'Esta semana').locator('.ctl-linha')).toHaveCount(2);
      await expect(grupo(page, 'Mais adiante').locator('.ctl-linha')).toHaveCount(2);
      await expect(grupo(page, 'Pagas').locator('.ctl-linha')).toHaveCount(2);
      // o progresso é só do mês (a de setembro não conta): 2 de 7
      await expect(page.locator('[data-mes="progresso"]')).toContainText('2 de 7 pagas');
    });

    test('virada do mês: lista nova desmarcada e o mês anterior intacto', async ({ page }) => {
      await abrirCom(page, base({ modelos: tres() }), 'mes');
      await doMes(page, 'Aluguel').locator('.ctl-check').click();
      await doMes(page, 'Salário').locator('.ctl-check').click();
      await page.clock.setFixedTime(new Date('2026-11-02T12:00:00-03:00'));
      await page.reload();
      await expect(page.locator('.ctl-tela-cab h1 + p')).toHaveText('Novembro de 2026');
      await expect(page.locator('[data-mes="progresso"]')).toHaveText('0 de 3 pagas · faltam R$ 6.419,90');
      const db = await lerDb(page);
      expect(db.contas).toHaveLength(6);
      const out = db.contas.filter(c => c.ocorrencia < '2026-11-01');
      expect(out.filter(c => c.baixas.length).map(c => c.descricao).sort()).toEqual(['Aluguel', 'Salário']);
      expect(db.contas.filter(c => c.ocorrencia >= '2026-11-01').every(c => !c.baixas.length)).toBe(true);
      // a internet de outubro, que ficou em aberto, continua aparecendo em "Atrasadas"
      await expect(grupo(page, 'Atrasadas').locator('.ctl-linha')).toHaveCount(1);
      await expect(grupo(page, 'Atrasadas')).toContainText('Venceu dia 15/10');
    });

    test('cadastrar, editar e excluir conta fixa; confete uma vez por mês ao quitar tudo', async ({ page }) => {
      const erros = await abrirCom(page, null, 'mes');
      await expect(page.locator('[data-novo]:visible')).toHaveCount(0);
      await page.locator('.ctl-vazio [data-acao="novo-modelo"]').click();
      const dlg = page.locator('#dlg-modelo');
      await preencher(page, '#modelo-desc', 'Academia');
      await preencher(page, '#modelo-valor', '99,90');
      await preencher(page, '#modelo-dia', '31');
      await page.locator('#modelo-salvar').click();
      await expect(dlg).toBeHidden();
      await expect(doMes(page, 'Academia')).toBeVisible();
      let db = await lerDb(page);
      expect(db.modelos[0]).toMatchObject({ descricao: 'Academia', valor: 9990, dia: 31, tipo: 'pagar', variavel: false });
      expect(db.contas[0]).toMatchObject({ modeloId: db.modelos[0].id, vencimento: '2026-10-31', valor: 9990 });
      // erro de validação
      await page.locator('.ctl-modelos [data-acao="novo-modelo"]').click();
      await preencher(page, '#modelo-desc', 'X');
      await preencher(page, '#modelo-dia', '40');
      await page.locator('#modelo-salvar').click();
      await expect(dlg.locator('[data-campo="valor"]')).toHaveClass(/erro/);
      await expect(dlg.locator('[data-campo="dia"]')).toHaveClass(/erro/);
      await dlg.locator('.ctl-dlg-pe [data-fechar]').click();
      // editar o modelo não mexe na conta deste mês
      await page.locator('[data-acao="modelo-editar"]').click();
      await preencher(page, '#modelo-valor', '120');
      await page.locator('#modelo-salvar').click();
      db = await lerDb(page);
      expect(db.modelos[0].valor).toBe(12000);
      expect(db.contas[0].valor).toBe(9990);
      // quitou tudo: "Mês fechado!" e confete, uma vez por mês
      await doMes(page, 'Academia').locator('.ctl-check').click();
      await expect(page.locator('.ctl-mes-fim')).toContainText('Mês fechado!');
      await expect(page.locator('.ctl-confete')).toHaveCount(1);
      expect((await lerDb(page)).config.confeteMes).toBe('2026-10');
      await expect(page.locator('.ctl-confete')).toHaveCount(0, { timeout: 4000 });
      await grupo(page, 'Pagas').locator('summary').click();
      await doMes(page, 'Academia').locator('.ctl-check').click();   // reabre
      await doMes(page, 'Academia').locator('.ctl-check').click();   // quita de novo
      await page.waitForTimeout(200);
      await expect(page.locator('.ctl-confete')).toHaveCount(0);
      // excluir a conta deste mês não faz ela voltar ao recarregar
      await doMes(page, 'Academia').locator('.ctl-linha-corpo').click();
      await page.locator('[data-acao="det-excluir"]').click();
      await page.locator('#dlg-confirmar [data-v="sim"]').click();
      await expect.poll(async () => (await lerDb(page)).contas.length).toBe(0);
      await page.reload();
      expect((await lerDb(page)).contas).toHaveLength(0);
      // excluir o modelo
      await page.locator('[data-acao="modelo-excluir"]').click();
      await page.locator('#dlg-confirmar [data-v="sim"]').click();
      await expect.poll(async () => (await lerDb(page)).modelos.length).toBe(0);
      await expect(page.locator('.ctl-vazio [data-acao="novo-modelo"]')).toBeVisible();
      semErros(erros);
    });

    test('sem animação com prefers-reduced-motion: nada de confete', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await abrirCom(page, base({ modelos: [modelo('m1', 'pagar', 'Aluguel', 180000, 5)] }), 'mes');
      await doMes(page, 'Aluguel').locator('.ctl-check').click();
      await expect(page.locator('.ctl-mes-fim')).toBeVisible();
      await page.waitForTimeout(200);
      await expect(page.locator('.ctl-confete')).toHaveCount(0);
      expect((await lerDb(page)).config.confeteMes).toBe('2026-10');
    });
  });

  test.describe('celular (390px)', () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test('navegação inferior, botão flutuante e nada mais largo que a tela', async ({ page }) => {
      const erros = await abrirCom(page, base({ contas: [conta('c1', 'pagar', 'Conta com um nome bem comprido para ver se corta direitinho', 123456789, HOJE)] }), 'inicio');
      await expect(page.locator('.ctl-inferior')).toBeVisible();
      await expect(page.locator('.ctl-lateral')).toBeHidden();
      await expect(page.locator('.ctl-fab')).toBeVisible();
      await expect(page.locator('[data-novo]:visible')).toHaveCount(1);
      for (const t of ['inicio', 'mes', 'contas', 'fluxo', 'relatorio', 'ajustes']) {
        await page.locator(`.ctl-inferior a[href="#${t}"]`).click();
        await expect(page.locator(`.ctl-inferior a[href="#${t}"]`)).toHaveAttribute('aria-current', 'page');
        const largura = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(largura, `tela ${t}`).toBeLessThanOrEqual(390);
      }
      // círculo de baixa com área de toque >= 44px
      await page.locator('.ctl-inferior a[href="#contas"]').click();
      const box = await page.locator('.ctl-check').first().boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      semErros(erros);
    });
  });
});
