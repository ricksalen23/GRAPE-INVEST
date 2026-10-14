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
// plano Pro (demonstração) para os testes que usam recursos do Pro
const PRO = { plano: { tipo: 'pro', testeInicio: null } };
const nucleo = (page, fn, ...args) => page.evaluate(([f, a]) => window.ControlNucleo[f](...a), [fn, args]);

// área Dívidas: o caso real do dono (4 dívidas, 3 propostas de desconto, renda de R$ 2.431,50)
const divida = (id, credor, total, extra = {}) => ({ id, credor, total, parcela: null, parcelas: null, dia: null, taxa: null, obs: '', perfil: 'pessoal',
  proposta: null, pagoAntes: 0, excluidas: [], quitadaEm: null, criadoEm: '2026-10-01T12:00:00.000Z', ...extra });
const CASO_REAL = () => [
  divida('dA', 'Banco Alfa', 1200000, { parcela: 80000, parcelas: 15, dia: 10, proposta: { valor: 700000, validade: '2026-10-06' } }),   // vence em 4 dias
  divida('dB', 'Loja Beta', 165000),                                                                                                     // à vista, sem desconto
  divida('dC', 'Cartão Gama', 914188, { parcela: 41554, parcelas: 22, dia: 15, proposta: { valor: 814500, validade: '2026-11-30' } }),
  divida('dD', 'Financeira Delta', 1378748, { parcela: 33628, parcelas: 41, dia: 20, proposta: { valor: 1056800, validade: '2026-12-31' } })
];
const comDividas = (extra = {}) => ({ ...base({ config: { ...PRO, rendaMensal: 243150 } }), dividas: CASO_REAL(), ...extra });

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
    await abrirCom(page, base({ config: PRO, saldo: { pessoal: 10000, negocio: 50000 }, contas: [
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
    await abrirCom(page, base({ config: PRO, contas: [conta('c1', 'pagar', 'Aluguel; sala "A"', 180000, '2026-10-05', { obs: 'linha 1' })] }), 'ajustes');
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

  // ---------- relatório: números, PDF, imagem, texto e WhatsApp ----------
  test.describe('relatório e envio', () => {
    const b = (data, valor) => [{ id: 'b' + data + valor, data, valor, desconto: 0, juros: 0 }];
    const dados = () => base({ config: PRO, saldo: { pessoal: 100000, negocio: 0 }, contas: [
      conta('sal', 'receber', 'Salário', 500000, '2026-10-01', { baixas: b('2026-10-01', 500000), categoriaId: 'cat_salario' }),
      conta('mer', 'pagar', 'Mercado', 80000, '2026-10-01', { baixas: b('2026-10-01', 80000), categoriaId: 'cat_alimentacao' }),
      conta('far', 'pagar', 'Farmácia', 20000, '2026-09-30', { baixas: b('2026-10-02', 20000), categoriaId: 'cat_saude' }),
      conta('ant', 'pagar', 'Antiga', 99900, '2026-09-10', { baixas: b('2026-09-10', 99900) }),
      conta('luz', 'pagar', 'Luz', 15000, '2026-09-28'),                 // atrasada: entra hoje
      conta('alu', 'pagar', 'Aluguel', 180000, '2026-10-05'),
      conta('cli', 'receber', 'Cliente', 30000, '2026-10-20'),
      conta('via', 'pagar', 'Viagem', 50000, '2026-11-15')               // depois dos 30 dias
    ] });

    test('dadosRelatorio: números conferidos à mão (mês atual, passado e longe demais)', async ({ page }) => {
      const erros = await abrirCom(page, dados(), 'relatorio');
      const d = await page.evaluate(() => window.ControlNucleo.dadosRelatorio(window.WardenControl.db, 'tudo', '2026-10', '2026-10-02'));
      expect(d).toMatchObject({ recebido: 500000, pago: 100000, resultado: 400000, aPagar: 180000, aReceber: 30000 });
      expect(d.porCategoria.map(c => [c.nome, c.valor])).toEqual([['Alimentação', 80000], ['Saúde', 20000]]);
      // saldo de hoje: 1.000 − 999 (set) + 5.000 − 800 − 200 = 4.001
      expect(d.saldoHoje).toBe(400100);
      // fim do mês: 4.001 − 150 (luz atrasada) − 1.800 + 300 = 2.351
      expect(d.fimMes).toEqual({ data: '2026-10-31', saldo: 235100, previsto: true });
      expect(d.proximas.map(c => [c.descricao, c.valor, c.atrasada])).toEqual([['Luz', 15000, true], ['Aluguel', 180000, false], ['Cliente', 30000, false]]);
      const set = await page.evaluate(() => window.ControlNucleo.dadosRelatorio(window.WardenControl.db, 'tudo', '2026-09', '2026-10-02'));
      expect(set).toMatchObject({ recebido: 0, pago: 99900, fimMes: { data: '2026-09-30', saldo: 100, previsto: false } });
      const longe = await page.evaluate(() => window.ControlNucleo.dadosRelatorio(window.WardenControl.db, 'tudo', '2027-03', '2026-10-02'));
      expect(longe.fimMes).toBeNull();
      // a tela mostra os mesmos números
      await expect(page.locator('[data-rel="saldo-hoje"]')).toHaveText('R$ 4.001,00');
      await expect(page.locator('[data-rel="fim-mes"]')).toHaveText('R$ 2.351,00');
      await expect(page.locator('.ctl-bloco .ctl-linha')).toHaveCount(3);
      semErros(erros);
    });

    test('WhatsApp sem Web Share: abre o wa.me com o texto pronto e sem número', async ({ page }) => {
      await page.addInitScript(() => {
        delete Navigator.prototype.share; delete Navigator.prototype.canShare;
        window.open = u => { window.__aberto = u; return null; };
      });
      const erros = await abrirCom(page, dados(), 'relatorio');
      await page.locator('[data-acao="relatorio"][data-canal="whatsapp"]').click();
      await expect.poll(() => page.evaluate(() => window.__aberto || '')).toMatch(/^https:\/\/wa\.me\/\?text=/);
      const url = await page.evaluate(() => window.__aberto);
      const texto = decodeURIComponent(url.split('?text=')[1]);
      expect(texto.split('\n').slice(0, 2)).toEqual(['*Relatório de outubro de 2026*', 'Warden Control · Pessoal + Negócio']);
      expect(texto).toContain('Recebido: R$ 5.000,00');
      expect(texto).toContain('Resultado: + R$ 4.000,00');
      expect(texto).toContain('Saldo de hoje (02/10/2026): R$ 4.001,00');
      expect(texto).toContain('Previsto em 31/10/2026: R$ 2.351,00');
      expect(texto).toContain('1. Alimentação: R$ 800,00');
      expect(texto).toContain('28/09 Luz: − R$ 150,00 (atrasada)');
      expect(texto).toContain('20/10 Cliente: + R$ 300,00');
      expect(texto).not.toContain('Viagem');
      expect(texto.trim().endsWith('Gerado com Warden · wardenfinance.com.br')).toBe(true);
      semErros(erros);
    });

    test('WhatsApp com Web Share: manda a imagem do relatório e o texto pela folha de compartilhar', async ({ page }) => {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'canShare', { configurable: true, value: d => !!(d && d.files && d.files.length) });
        Object.defineProperty(navigator, 'share', { configurable: true, value: async d => {
          const f = d.files[0];
          window.__compartilhado = { n: d.files.length, nome: f.name, tipo: f.type, tamanho: f.size, texto: d.text };
        } });
        window.open = u => { window.__aberto = u; return null; };
      });
      const erros = await abrirCom(page, dados(), 'relatorio');
      await page.locator('[data-acao="relatorio"][data-canal="whatsapp"]').click();
      await expect.poll(() => page.evaluate(() => window.__compartilhado), { timeout: 15000 }).toBeTruthy();
      const s = await page.evaluate(() => window.__compartilhado);
      expect(s).toMatchObject({ n: 1, nome: 'warden-relatorio-2026-10.png', tipo: 'image/png' });
      expect(s.tamanho).toBeGreaterThan(5000);
      expect(s.texto).toContain('*Relatório de outubro de 2026*');
      expect(await page.evaluate(() => window.__aberto)).toBeUndefined();
      semErros(erros);
    });

    test('PDF e imagem baixam com o nome certo; copiar texto', async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      const erros = await abrirCom(page, dados(), 'relatorio');
      const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.locator('[data-canal="pdf"]').click()]);
      expect(pdf.suggestedFilename()).toBe('warden-relatorio-2026-10.pdf');
      const bytesPdf = require('fs').readFileSync(await pdf.path());
      expect(bytesPdf.length).toBeGreaterThan(1000);
      expect(bytesPdf.toString('latin1', 0, 4)).toBe('%PDF');
      const [png] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.locator('[data-canal="imagem"]').click()]);
      expect(png.suggestedFilename()).toBe('warden-relatorio-2026-10.png');
      const bytesPng = require('fs').readFileSync(await png.path());
      expect(bytesPng.slice(1, 4).toString()).toBe('PNG');
      expect(bytesPng.readUInt32BE(16)).toBe(1080);   // largura no cabeçalho IHDR
      // com o perfil Negócio, o nome do arquivo diz o perfil
      await page.locator('#perfil').selectOption('negocio');
      const [pdfN] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.locator('[data-canal="pdf"]').click()]);
      expect(pdfN.suggestedFilename()).toBe('warden-relatorio-2026-10-negocio.pdf');
      await page.locator('#perfil').selectOption('tudo');
      await page.locator('[data-canal="texto"]').click();
      await expect(page.locator('#toast')).toContainText('copiado');
      const copiado = await page.evaluate(() => navigator.clipboard.readText());
      expect(copiado).toContain('Resultado: + R$ 4.000,00');
      semErros(erros);
    });
  });

  // ---------- Orientador (regras locais) ----------
  test.describe('orientador', () => {
    const ANTIGO = '2026-09-20T12:00:00.000Z';
    const bx = (data, valor) => [{ id: 'b' + data + valor, data, valor, desconto: 0, juros: 0, criadoEm: ANTIGO }];
    const velha = (id, tipo, desc, valor, venc, extra = {}) => conta(id, tipo, desc, valor, venc, { criadoEm: ANTIGO, ...extra });
    // roda uma regra sem tela: { dado, texto, rotulo } ou null
    const regra = (page, d, id) => page.evaluate(([d, id]) => {
      const N = window.ControlNucleo, O = window.ControlOrientador;
      const ctx = O.contexto(N.migrar(d), 'tudo', '2026-10-02', new Date('2026-10-02T12:00:00-03:00'));
      const r = O.AGENTE_REGRAS.find(x => x.id === id), dado = r.quando(ctx);
      if (!dado) return null;
      const acao = typeof r.acao === 'function' ? r.acao(dado, ctx) : r.acao;
      return { dado, texto: r.texto(dado, ctx), rotulo: acao.rotulo };
    }, [d, id]);
    const frases = t => t.split(/[.!?](?=\s|$)/).filter(s => s.trim()).length;
    // um db em que as 6 regras disparam
    const tudoDispara = () => base({ saldo: { pessoal: 500000, negocio: 0 }, contas: [
      velha('ago', 'pagar', 'Mercado agosto', 200000, '2026-08-10', { baixas: bx('2026-08-10', 200000), categoriaId: 'cat_alimentacao' }),
      velha('set', 'pagar', 'Mercado setembro', 200000, '2026-09-10', { baixas: bx('2026-09-10', 200000), categoriaId: 'cat_alimentacao' }),
      velha('out', 'pagar', 'Mercado outubro', 300000, '2026-10-01', { baixas: bx('2026-10-01', 300000), categoriaId: 'cat_alimentacao' }),
      velha('luz', 'pagar', 'Luz', 15000, '2026-09-28'),
      velha('net', 'pagar', 'Internet', 11990, HOJE)
    ] });

    test('cada regra dispara com o dado certo e fica quieta sem ele', async ({ page }) => {
      await abrirCom(page, base(), 'inicio');
      // atrasadas
      let r = await regra(page, base({ contas: [velha('luz', 'pagar', 'Luz', 15000, '2026-09-28')] }), 'atrasadas');
      expect(r.texto).toBe('Luz (R$ 150,00) venceu em 28/09. Pagar logo evita mais juros e multa.');
      expect(r.rotulo).toBe('Dar baixa');
      r = await regra(page, base({ contas: [velha('luz', 'pagar', 'Luz', 15000, '2026-09-28'), velha('agua', 'pagar', 'Água', 9000, '2026-09-30')] }), 'atrasadas');
      expect(r.texto).toBe('Você tem 2 contas atrasadas, somando R$ 240,00. Comece pela mais antiga para evitar mais juros e multa.');
      expect(r.rotulo).toBe('Ver atrasadas');
      expect(await regra(page, base({ contas: [velha('luz', 'pagar', 'Luz', 15000, '2026-09-28', { baixas: bx('2026-09-28', 15000) })] }), 'atrasadas')).toBeNull();
      // mês no vermelho: saldo previsto negativo dentro do mês…
      r = await regra(page, base({ contas: [velha('f', 'pagar', 'Fornecedor', 50000, '2026-10-20')] }), 'vermelho');
      expect(r.texto).toContain('seu saldo fica em − R$ 500,00 em 20/10');
      expect(r.rotulo).toBe('Abrir Fluxo');
      // …ou o mês sai mais do que entra
      r = await regra(page, base({ saldo: { pessoal: 9000000, negocio: 0 }, contas: [velha('m', 'pagar', 'Mercado', 30000, '2026-10-01', { baixas: bx('2026-10-01', 30000) })] }), 'vermelho');
      expect(r.texto).toBe('Em outubro, o que sai passa o que entra em R$ 300,00. Veja no Fluxo onde dá para adiar um gasto ou antecipar um recebimento.');
      expect(await regra(page, base({ saldo: { pessoal: 100000, negocio: 0 }, contas: [
        velha('s', 'receber', 'Salário', 500000, '2026-10-01', { baixas: bx('2026-10-01', 500000) }), velha('f', 'pagar', 'Fornecedor', 50000, '2026-10-20')] }), 'vermelho')).toBeNull();
      // vence em até 3 dias
      r = await regra(page, base({ contas: [velha('net', 'pagar', 'Internet', 11990, HOJE)] }), 'vence-logo');
      expect(r.texto).toBe('Internet (R$ 119,90) vence hoje. Se já pagou, dê baixa para o saldo ficar certo.');
      r = await regra(page, base({ contas: [velha('net', 'pagar', 'Internet', 11990, HOJE), velha('cli', 'receber', 'Cliente', 30000, '2026-10-05')] }), 'vence-logo');
      expect(r.texto).toBe('2 contas vencem até 05/10: R$ 119,90 a pagar e R$ 300,00 a receber. Confira se o saldo dá conta.');
      expect(r.rotulo).toBe('Ver próximas');
      expect(await regra(page, base({ contas: [velha('a', 'pagar', 'Aluguel', 180000, '2026-10-06')] }), 'vence-logo')).toBeNull();
      // reserva baixa: saldo de hoje menor que a média de gastos dos meses anteriores
      const hist = [velha('ago', 'pagar', 'Ago', 200000, '2026-08-10', { baixas: bx('2026-08-10', 200000) }), velha('set', 'pagar', 'Set', 200000, '2026-09-10', { baixas: bx('2026-09-10', 200000) })];
      r = await regra(page, base({ saldo: { pessoal: 500000, negocio: 0 }, contas: hist }), 'reserva');
      expect(r.texto).toBe('Seu caixa (R$ 1.000,00) está mais apertado que a sua média de gastos do mês (R$ 2.000,00). Vale guardar um pouco este mês, no seu ritmo.');
      expect(r.rotulo).toBe('Calcular minha reserva');
      expect(await regra(page, base({ saldo: { pessoal: 1000000, negocio: 0 }, contas: hist }), 'reserva')).toBeNull();
      expect(await regra(page, base({ saldo: { pessoal: 0, negocio: 0 } }), 'reserva')).toBeNull();   // sem histórico, sem dica
      // gasto acima da média da categoria
      const cat = (out) => base({ saldo: { pessoal: 9000000, negocio: 0 }, contas: [
        velha('ago', 'pagar', 'Ago', 50000, '2026-08-10', { baixas: bx('2026-08-10', 50000), categoriaId: 'cat_alimentacao' }),
        velha('set', 'pagar', 'Set', 50000, '2026-09-10', { baixas: bx('2026-09-10', 50000), categoriaId: 'cat_alimentacao' }),
        velha('out', 'pagar', 'Out', out, '2026-10-01', { baixas: bx('2026-10-01', out), categoriaId: 'cat_alimentacao' })] });
      r = await regra(page, cat(90000), 'categoria');
      expect(r.texto).toBe('Em outubro, você já gastou R$ 900,00 com Alimentação, 80% acima da sua média (R$ 500,00). Vale olhar o que pesou mais.');
      expect(r.rotulo).toBe('Ver Alimentação');
      expect(await regra(page, cat(60000), 'categoria')).toBeNull();
      // muitos dias sem lançar (conta gerada sozinha não conta como atividade)
      r = await regra(page, base({ contas: [velha('a', 'pagar', 'Aluguel', 1000, '2026-10-20'), conta('r', 'pagar', 'Gerada', 1000, '2026-10-25', { recorrenciaId: 'x', ocorrencia: '2026-10-25' })] }), 'sem-lancar');
      expect(r.texto).toBe('Faz 12 dias desde o último lançamento. Se algo entrou ou saiu nesse tempo, anotar agora deixa o seu saldo certinho.');
      expect(r.rotulo).toBe('Novo lançamento');
      expect(await regra(page, base({ contas: [conta('a', 'pagar', 'Aluguel', 1000, '2026-10-20')] }), 'sem-lancar')).toBeNull();
    });

    test('dicas: no máximo 2 frases, com botão que leva à ação; ordem por prioridade e corte do grátis', async ({ page }) => {
      await abrirCom(page, base(), 'inicio');
      const r = await page.evaluate(d => {
        const N = window.ControlNucleo, O = window.ControlOrientador;
        const ctx = O.contexto(N.migrar(d), 'tudo', '2026-10-02', new Date('2026-10-02T12:00:00-03:00'));
        const lista = O.dicas(ctx), chamadas = [];
        const api = { filtrar: f => chamadas.push(['filtrar', f]), irPara: t => chamadas.push(['irPara', t]), abrirDetalhe: id => chamadas.push(['abrirDetalhe', id]),
          novo: () => chamadas.push(['novo']), abrirLink: u => chamadas.push(['abrirLink', u]) };
        lista.forEach(x => x.acao.executar(api));
        return { ids: lista.map(x => x.id), textos: lista.map(x => x.texto), rotulos: lista.map(x => x.acao.rotulo), chamadas,
          gratis: O.dicas(ctx, { limite: O.LIMITE_GRATIS }).map(x => x.id) };
      }, tudoDispara());
      expect(r.ids).toEqual(['atrasadas', 'vermelho', 'vence-logo', 'reserva', 'categoria', 'sem-lancar']);
      r.textos.forEach(t => expect(frases(t), t).toBeLessThanOrEqual(2));
      r.rotulos.forEach(t => expect(t.length).toBeGreaterThan(0));
      expect(r.chamadas).toEqual([
        ['abrirDetalhe', 'luz'], ['irPara', 'fluxo'], ['abrirDetalhe', 'net'], ['abrirLink', '/ferramentas/reserva-de-emergencia.html'],
        ['filtrar', { status: 'todas', categoriaId: 'cat_alimentacao', tipo: 'pagar' }], ['novo']
      ]);
      expect(r.gratis).toEqual(['atrasadas']);
    });

    test('desktop: painel lateral com boas-vindas, dicas e botão que leva à lista certa', async ({ page }) => {
      const erros = await abrirCom(page, base({ contas: [velha('luz', 'pagar', 'Luz', 15000, '2026-09-28'), velha('agua', 'pagar', 'Água', 9000, '2026-09-30')] }), 'inicio');
      const painel = page.locator('#orientador');
      await expect(painel).toBeVisible();
      await expect(painel.locator('[data-ori-ola]')).toHaveText('Boa tarde! Hoje é sexta, 2 de outubro. Hoje pede atenção: 2 contas atrasadas.');
      await expect(page.locator('#ori-selo')).toBeHidden();
      const dica = painel.locator('[data-dica="atrasadas"]');
      await expect(dica).toContainText('Você tem 2 contas atrasadas');
      await dica.getByRole('button', { name: 'Ver atrasadas' }).click();
      await expect(page).toHaveURL(/#contas$/);
      await expect(page.locator('[data-acao="filtro-status"][data-v="atrasadas"]')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#tela .ctl-linha')).toHaveCount(2);
      // fechar fica lembrado
      await painel.locator('[data-ori="fechar"]').click();
      await expect(painel).toBeHidden();
      await page.reload();
      await expect(page.locator('#orientador')).toBeHidden();
      await expect(page.locator('#ori-selo')).toBeHidden();   // as dicas de hoje já foram vistas (o painel abriu hoje)
      semErros(erros);
    });

    test('atalhos de chat respondem com os números certos; pergunta livre sem resposta mostra o que ele sabe', async ({ page }) => {
      const b = (data, valor) => [{ id: 'b' + data + valor, data, valor, desconto: 0, juros: 0 }];
      await abrirCom(page, base({ saldo: { pessoal: 100000, negocio: 0 }, contas: [
        conta('sal', 'receber', 'Salário', 500000, '2026-10-01', { baixas: b('2026-10-01', 500000), categoriaId: 'cat_salario' }),
        conta('mer', 'pagar', 'Mercado', 80000, '2026-10-01', { baixas: b('2026-10-01', 80000), categoriaId: 'cat_alimentacao' }),
        conta('far', 'pagar', 'Farmácia', 20000, '2026-09-30', { baixas: b('2026-10-02', 20000), categoriaId: 'cat_saude' }),
        conta('luz', 'pagar', 'Luz', 15000, '2026-09-28'),
        conta('alu', 'pagar', 'Aluguel', 180000, '2026-10-05'),
        conta('cli', 'receber', 'Cliente', 30000, '2026-10-08')
      ] }), 'inicio');
      const painel = page.locator('#orientador'), ultima = () => painel.locator('.ctl-ori-msg.ori').last();
      await painel.getByRole('button', { name: 'Como estou este mês?' }).click();
      await expect(ultima()).toContainText('Em outubro, entrou R$ 5.000,00 e saiu R$ 1.000,00 até agora (resultado de + R$ 4.000,00). Se tudo correr como previsto, você fecha o mês com R$ 3.350,00 de saldo.');
      await painel.getByRole('button', { name: 'O que vence esta semana?' }).click();
      await expect(ultima()).toContainText('Até 09/10, 2 contas vencem: R$ 1.800,00 a pagar e R$ 300,00 a receber. Fora isso, 1 conta está atrasada.');
      await expect(ultima().locator('li')).toHaveText(['seg, 5 out · Aluguel · − R$ 1.800,00', 'qui, 8 out · Cliente · + R$ 300,00']);
      await painel.getByRole('button', { name: 'Onde mais gastei?' }).click();
      await expect(ultima()).toContainText('Em outubro, o que mais pesou foi Alimentação: R$ 800,00 (80% do que saiu).');
      // escrita livre: palavra-chave → atalho; sem palavra conhecida → o que ele sabe responder
      await page.locator('#ori-pergunta').fill('quanto gastei e com o quê?');
      await page.locator('#ori-pergunta').press('Enter');
      await expect(ultima()).toContainText('o que mais pesou foi Alimentação');
      await page.locator('#ori-pergunta').fill('qual a capital da França?');
      await page.locator('#ori-pergunta').press('Enter');
      await expect(ultima()).toContainText('Ainda não sei responder isso');
      // o botão da resposta leva à ação
      await painel.getByRole('button', { name: 'O que vence esta semana?' }).click();
      await ultima().getByRole('button', { name: 'Ver na lista' }).click();
      await expect(page.locator('[data-acao="filtro-status"][data-v="semana"]')).toHaveAttribute('aria-pressed', 'true');
    });

    test.describe('celular', () => {
      test.use({ viewport: { width: 390, height: 844 } });
      test('gaveta: começa fechada com selo, abre, a ação fecha e navega; Esc fecha', async ({ page }) => {
        const erros = await abrirCom(page, base({ config: PRO, contas: [conta('f', 'pagar', 'Fornecedor', 50000, '2026-10-20'), conta('net', 'pagar', 'Internet', 11990, HOJE)] }), 'inicio');
        const painel = page.locator('#orientador');
        await expect(painel).toBeHidden();
        await expect(page.locator('#ori-selo')).toHaveText('2');
        await page.locator('#btn-orientador').click();
        await expect(painel).toBeVisible();
        await expect(page.locator('#ori-titulo')).toBeFocused();
        await expect(page.locator('#ori-selo')).toBeHidden();
        expect((await lerDb(page)).config.orientadorVisto).toBe(HOJE);
        await painel.getByRole('button', { name: 'Abrir Fluxo' }).click();
        await expect(painel).toBeHidden();
        await expect(page).toHaveURL(/#fluxo$/);
        await page.locator('#btn-orientador').click();
        await expect(painel).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(painel).toBeHidden();
        await expect(page.locator('#btn-orientador')).toBeFocused();
        // barra do topo com Desfazer visível continua cabendo em 390px
        await page.locator('a[href="#contas"]:visible').click();
        await linha(page, 'Internet').locator('.ctl-check').click();
        await expect(page.locator('#desfazer')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
        semErros(erros);
      });
    });
  });

  // ---------- plano: grátis, teste de 7 dias e Pro (demonstração local) ----------
  test.describe('plano', () => {
    const GRATIS = { plano: { tipo: 'gratis', testeInicio: null } };
    const recorrencia = (id, criadoEm) => ({ id, tipo: 'pagar', descricao: 'Academia', valor: 9990, categoriaId: '', contato: '', forma: '', obs: '', perfil: 'pessoal',
      freq: 'mensal', inicio: '2026-10-10', dia: 10, fim: null, excluidas: [], criadoEm });

    test('grátis: 30 lançamentos no mês; o 31º abre o Pro sem perder o que foi digitado; parcela, recorrência e "Meu mês" contam certo', async ({ page }) => {
      const soltas = Array.from({ length: 27 }, (_, i) => conta('s' + i, 'pagar', 'Conta ' + i, 1000, '2026-10-20'));
      const venc = i => { const m = 9 + i; return `${2026 + Math.floor(m / 12)}-${String(m % 12 + 1).padStart(2, '0')}-15`; };   // 15/10/2026 a 15/09/2027
      const parcelas = Array.from({ length: 12 }, (_, i) => conta('p' + i, 'pagar', 'Celular', 5000, venc(i), { grupoId: 'g1', parcela: { n: i + 1, total: 12 } }));
      const antiga = conta('velha', 'pagar', 'De setembro', 1000, '2026-09-20', { criadoEm: '2026-09-15T12:00:00.000Z' });
      const erros = await abrirCom(page, base({ config: GRATIS, contas: [...soltas, ...parcelas, antiga],
        recorrencias: [recorrencia('r1', '2026-10-01T12:00:00.000Z')], modelos: [modelo('m1', 'pagar', 'Aluguel', 180000, 5)] }), 'contas');
      // 27 soltas + 1 parcelamento de 12x + 1 recorrência = 29 (as geradas pela recorrência e pelo "Meu mês" não contam; a de setembro também não)
      expect(await page.evaluate(() => window.ControlNucleo.lancamentosNoMes(window.WardenControl.db, '2026-10'))).toBe(29);
      const db0 = await lerDb(page);
      expect(db0.contas.some(c => c.recorrenciaId)).toBe(true);
      expect(db0.contas.some(c => c.modeloId)).toBe(true);
      // o 30º passa, com aviso de que era o último
      await novoLancamento(page, { valor: '20', descricao: 'Trigésima', vencimento: HOJE });
      await expect(page.locator('#toast')).toContainText('Era o último do grátis este mês');
      const total = (await lerDb(page)).contas.length;
      // o 31º: abre o Pro por cima e o formulário continua com o que foi digitado
      await page.locator('[data-novo]:visible').first().click();
      await preencher(page, '#lanc-valor', '12,50');
      await preencher(page, '#lanc-desc', 'Padaria');
      await page.locator('#lanc-salvar').click();
      const pro = page.locator('#dlg-pro');
      await expect(pro).toBeVisible();
      await expect(pro.locator('[data-pro-motivo]')).toContainText('30 lançamentos deste mês');
      // um só botão principal; o texto do teste vem da constante única (/assets/warden-pro.js)
      await expect(pro.locator('.btn-primary')).toHaveCount(1);
      await expect(pro.locator('.btn-primary')).toHaveText('Testar 7 dias grátis');
      const copy = await page.evaluate(() => window.WARDEN_PRO.COPY_TESTE);
      expect(copy).toBe('Sem cartão para testar. Cancele quando quiser.');
      await expect(pro.locator('[data-copy-teste]')).toHaveText(copy);
      await expect(pro.locator('[data-pro-dia]')).toHaveText('menos de R$ 0,34 por dia');
      await expect(pro.locator('.ctl-pro-links').getByRole('link', { name: 'Assinar o Pro' })).toHaveAttribute('href', '/assinar.html');
      await pro.getByRole('button', { name: 'Agora não' }).click();
      await expect(pro).toBeHidden();
      await expect(page.locator('#dlg-lanc')).toBeVisible();
      await expect(page.locator('#lanc-desc')).toHaveValue('Padaria');
      await expect(page.locator('#lanc-valor')).toHaveValue('12,50');
      expect((await lerDb(page)).contas.length).toBe(total);
      // testar o Pro ali mesmo e salvar o que estava digitado
      await page.locator('#lanc-salvar').click();
      await pro.getByRole('button', { name: 'Testar 7 dias grátis' }).click();
      await expect(pro).toBeHidden();
      await page.locator('#lanc-salvar').click();
      await expect(page.locator('#dlg-lanc')).toBeHidden();
      const db = await lerDb(page);
      expect(db.contas.length).toBe(total + 1);
      expect(db.config.plano).toEqual({ tipo: 'gratis', testeInicio: HOJE });
      semErros(erros);
    });

    test('teste de 7 dias libera tudo; quando acaba, volta ao grátis sem apagar nada', async ({ page }) => {
      await page.addInitScript(() => { window.open = u => { window.__aberto = u; return null; }; delete Navigator.prototype.share; delete Navigator.prototype.canShare; });
      const erros = await abrirCom(page, base({ config: GRATIS, contas: [
        conta('p', 'pagar', 'Escola', 1000, '2026-10-10'), conta('n', 'pagar', 'Fornecedor', 2000, '2026-10-12', { perfil: 'negocio' })] }), 'ajustes');
      await expect(page.locator('.ctl-plano')).toHaveAttribute('data-plano', 'gratis');
      await page.locator('.ctl-plano [data-acao="pro-teste"]').click();
      await expect(page.locator('.ctl-plano')).toHaveAttribute('data-plano', 'teste');
      await expect(page.locator('.ctl-plano')).toContainText('até 08/10/2026');
      await expect(page.locator('#toast')).toContainText('Teste do Pro ativado');
      // perfis, WhatsApp e CSV liberados
      await page.locator('#perfil').selectOption('negocio');
      await page.locator('a[href="#contas"]:visible').first().click();
      await expect(page.locator('#tela .ctl-linha')).toHaveCount(1);
      await page.locator('a[href="#relatorio"]:visible').first().click();
      await page.locator('[data-canal="whatsapp"]').click();
      await expect.poll(() => page.evaluate(() => window.__aberto || '')).toMatch(/^https:\/\/wa\.me\//);
      // o último dia do teste é 08/10; no dia 09 volta ao grátis
      const dias = await page.evaluate(() => ['2026-10-08', '2026-10-09'].map(d => window.ControlNucleo.planoAtual(window.WardenControl.db, d).codigo));
      expect(dias).toEqual(['teste', 'gratis']);
      await page.clock.setFixedTime(new Date('2026-10-09T12:00:00-03:00'));
      await page.reload();
      await expect(page.locator('#toast')).toContainText('Seu teste do Pro terminou. Seus dados continuam todos aqui');
      await expect(page.locator('#perfil')).toHaveValue('tudo');
      await page.locator('a[href="#contas"]:visible').first().click();
      await expect(page.locator('#tela .ctl-linha')).toHaveCount(2);   // nada some: o Negócio aparece junto
      expect((await lerDb(page)).contas).toHaveLength(2);
      // de volta ao grátis: WhatsApp e CSV abrem o Pro (sem oferecer outro teste)
      await page.locator('a[href="#relatorio"]:visible').first().click();
      await page.evaluate(() => { window.__aberto = ''; });
      await page.locator('[data-canal="whatsapp"]').click();
      const pro = page.locator('#dlg-pro');
      await expect(pro.locator('[data-pro-motivo]')).toContainText('relatório pelo WhatsApp é do Pro');
      await expect(pro.getByRole('button', { name: 'Testar 7 dias grátis' })).toHaveCount(0);
      await expect(pro.getByRole('link', { name: 'Assinar o Pro' })).toHaveAttribute('href', '/assinar.html');
      await expect(pro.locator('.btn-primary')).toHaveText('Assinar o Pro');   // sem teste para oferecer, o principal é assinar
      await expect(pro.locator('[data-copy-teste]')).toHaveCount(0);
      expect(await page.evaluate(() => window.__aberto)).toBe('');
      await pro.getByRole('button', { name: 'Agora não' }).click();
      await page.locator('a[href="#ajustes"]:visible').first().click();
      await page.locator('[data-acao="exportar-csv"]').click();
      await expect(pro.locator('[data-pro-motivo]')).toContainText('planilha (CSV) é do Pro');
      await pro.getByRole('button', { name: 'Agora não' }).click();
      // o backup continua liberado
      const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-acao="exportar-json"]').click()]);
      expect(dl.suggestedFilename()).toContain('warden-control-backup');
      semErros(erros);
    });

    test('grátis: 1 perfil e 1 dica do Orientador por dia; a demonstração do Pro libera tudo e o Desfazer não mexe no plano', async ({ page }) => {
      const erros = await abrirCom(page, base({ config: GRATIS, contas: [
        conta('luz', 'pagar', 'Luz', 15000, '2026-09-28'), conta('agua', 'pagar', 'Água', 9000, '2026-09-30'), conta('net', 'pagar', 'Internet', 11990, HOJE)] }), 'inicio');
      const painel = page.locator('#orientador');
      await expect(painel.locator('.ctl-ori-dica')).toHaveCount(1);
      await expect(painel.locator('[data-dica="atrasadas"]')).toBeVisible();
      await expect(painel.locator('.ctl-ori-mais')).toContainText('Tem mais 2 dicas para hoje no Pro');
      expect((await lerDb(page)).config.dicaDoDia).toEqual({ data: HOJE, id: 'atrasadas' });
      // resolveu a dica do dia: as outras não entram no lugar
      await page.locator('a[href="#contas"]:visible').first().click();
      await linha(page, 'Luz').locator('.ctl-check').click();
      await linha(page, 'Água').locator('.ctl-check').click();
      await expect(painel.locator('.ctl-ori-dica')).toHaveCount(0);
      await expect(painel.locator('.ctl-ori-vazio')).toContainText('A dica de hoje já foi resolvida');
      // 1 perfil: o seletor abre o Pro e fica em "Tudo"; o formulário não pergunta o perfil
      await page.locator('#perfil').selectOption('negocio');
      await expect(page.locator('#dlg-pro [data-pro-motivo]')).toContainText('Pessoal e Negócio é do Pro');
      await expect(page.locator('#perfil')).toHaveValue('tudo');
      await page.locator('#dlg-pro').getByRole('button', { name: 'Agora não' }).click();
      await page.locator('[data-novo]:visible').first().click();
      await expect(page.locator('#lanc-perfil-bloco')).toBeHidden();
      await page.locator('#dlg-lanc [data-fechar]').first().click();
      // demonstração: assinatura ativa libera tudo; o Desfazer de uma conta não volta o plano
      await page.locator('a[href="#ajustes"]:visible').first().click();
      await page.locator('.ctl-demo summary').click();
      await page.locator('[data-acao="demo-pro"]').click();
      await expect(page.locator('.ctl-plano')).toHaveAttribute('data-plano', 'pro');
      await expect(painel.locator('.ctl-ori-dica')).toHaveCount(2);
      await expect(painel.locator('.ctl-ori-mais')).toHaveCount(0);
      await page.locator('#desfazer').click();   // desfaz a baixa da Água
      expect((await lerDb(page)).config.plano.tipo).toBe('pro');
      await page.locator('#perfil').selectOption('pessoal');
      await expect(page.locator('#perfil')).toHaveValue('pessoal');
      await expect(page.locator('#dlg-pro')).toBeHidden();
      semErros(erros);
    });

    test('desktop: o Orientador abre na primeira visita e depois lembra a escolha (nem o Desfazer muda isso)', async ({ page }) => {
      await abrirCom(page, base({ contas: [conta('luz', 'pagar', 'Luz', 15000, '2026-09-28')] }), 'contas');
      const painel = page.locator('#orientador');
      await expect(painel).toBeVisible();   // primeira visita
      await linha(page, 'Luz').locator('.ctl-check').click();   // uma ação que entra no Desfazer
      await painel.locator('[data-ori="fechar"]').click();
      await page.locator('#desfazer').click();
      await page.reload();
      await expect(painel).toBeHidden();   // fechou: continua fechado
      await page.locator('#btn-orientador').click();
      await page.reload();
      await expect(painel).toBeVisible();   // abriu de novo: continua aberto
    });
  });

  // ---------- efeitos visuais ----------
  test.describe('efeitos', () => {
    // amostra o texto do saldo a cada quadro desde o começo da página (para ver a contagem acontecer)
    const amostrar = page => page.addInitScript(() => {
      window.__amostras = [];
      const t0 = performance.now();
      const passo = () => {
        const el = document.querySelector('[data-valor="saldo"]');
        if (el) { const t = el.textContent; if (window.__amostras[window.__amostras.length - 1] !== t) window.__amostras.push(t); }
        if (performance.now() - t0 < 4000) requestAnimationFrame(passo);
      };
      requestAnimationFrame(passo);
    });
    const centavos = t => { const s = t.replace(/\s/g, ''); const v = Number(s.replace(/[^\d]/g, '')); return /^[−-]/.test(s) ? -v : v; };

    test('contagem: o saldo sobe até o valor exato (centavos) e anima de novo só quando o valor muda', async ({ page }) => {
      await amostrar(page);
      const erros = await abrirCom(page, base({ saldo: { pessoal: 12345678, negocio: 0 }, contas: [conta('c1', 'pagar', 'Internet', 11990, HOJE)] }), 'inicio');
      await expect(page.locator('[data-valor="saldo"]')).toHaveText('R$ 123.456,78');
      await expect.poll(() => page.evaluate(() => window.__amostras.length)).toBeGreaterThan(3);
      const a = await page.evaluate(() => window.__amostras);
      expect(a[a.length - 1]).toBe('R$ 123.456,78');
      const vals = a.map(centavos);
      vals.forEach((v, i) => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(12345678); if (i) expect(v).toBeGreaterThanOrEqual(vals[i - 1]); });
      // pagar a internet: o saldo desce animando e para no centavo certo
      await linha(page, 'Internet').locator('.ctl-check').click();
      await expect(page.locator('[data-valor="saldo"]')).toHaveText('R$ 123.336,88');
      // redesenhar sem mudar o valor não reanima
      await page.evaluate(() => { window.__amostras = []; window.WardenControl.render(); });
      await page.waitForTimeout(300);
      const depois = await page.evaluate(() => [...new Set([...window.__amostras, document.querySelector('[data-valor="saldo"]').textContent])]);
      expect(depois).toEqual(['R$ 123.336,88']);
      semErros(erros);
    });

    test('com prefers-reduced-motion: números já no valor final, sem animações nem gradiente que se mexe', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await amostrar(page);
      const erros = await abrirCom(page, base({ saldo: { pessoal: 12345678, negocio: 0 }, contas: [conta('c1', 'pagar', 'Internet', 11990, HOJE)] }), 'inicio');
      await expect(page.locator('[data-valor="saldo"]')).toHaveText('R$ 123.456,78');
      await page.waitForTimeout(400);
      expect(await page.evaluate(() => window.__amostras)).toEqual(['R$ 123.456,78']);
      const rodando = () => page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length);
      expect(await rodando()).toBe(0);
      expect(await page.locator('.ctl-aurora span').first().evaluate(el => getComputedStyle(el).animationName)).toBe('none');
      expect(await page.locator('.ctl-saldo').evaluate(el => getComputedStyle(el, '::before').display)).toBe('none');
      // trocar de aba, mudar o período do gráfico e dar baixa também não animam
      await page.locator('a[href="#fluxo"]:visible').first().click();
      await page.locator('[data-acao="periodo"][data-v="90"]').click();
      expect(await rodando()).toBe(0);
      await expect(page.locator('[data-valor="saldo-fluxo"]')).toHaveText('R$ 123.456,78');
      await page.locator('a[href="#contas"]:visible').first().click();
      await linha(page, 'Internet').locator('.ctl-check').click();
      expect(await rodando()).toBe(0);
      semErros(erros);
    });

    test('anel de saúde financeira: pontos conferidos à mão e o brilho segue o cursor', async ({ page }) => {
      const bx = (data, valor) => [{ id: 'b' + data, data, valor, desconto: 0, juros: 0 }];
      const erros = await abrirCom(page, base({ saldo: { pessoal: 100000, negocio: 0 }, contas: [
        conta('set', 'pagar', 'Setembro', 200000, '2026-09-10', { baixas: bx('2026-09-10', 200000) }),   // média de gastos: R$ 2.000
        conta('luz', 'pagar', 'Luz', 15000, '2026-09-28'),                                                 // 1 atrasada
        conta('sal', 'receber', 'Salário', 500000, '2026-10-05')
      ] }), 'inicio');
      // 1 atrasada → 20; outubro sem movimento → resultado 0, no azul → 30; saldo hoje 1.000 − 2.000 = −1.000 → 0;
      // caixa: média de 1 mês (setembro, R$ 2.000) e saldo negativo → 0. O salário de 05/10 (futuro) não entra em nada.
      const s = await page.evaluate(() => window.ControlNucleo.saudeFinanceira(window.WardenControl.db, 'tudo', '2026-10-02'));
      expect(s.itens.map(i => [i.id, i.estado, i.pontos])).toEqual([['em-dia', 'nao', 20], ['resultado', 'ok', 30], ['saldo', 'nao', 0], ['folga', 'nao', 0]]);
      expect(s).toMatchObject({ suficiente: true, pontos: 50, rotulo: 'Pede atenção' });
      await expect(page.locator('.ctl-anel')).toHaveAttribute('aria-label', 'Saúde financeira: 50 de 100, Pede atenção');
      await expect(page.locator('.ctl-anel-num strong')).toHaveText('50');
      await expect(page.locator('[data-criterio="folga"]')).toHaveText('Caixa cobre um mês de gastos (média de 1 mês)');
      await expect(page.locator('.ctl-saude li.ok')).toHaveCount(1);
      // "score" só aparece no aviso de que o indicador não tem relação com score de crédito
      await expect(page.locator('[data-saude-aviso]')).toHaveText('Indicador do Warden. Não tem relação com Serasa, SPC ou score de crédito.');
      expect(await page.evaluate(() => (document.body.innerText.match(/score/gi) || []).length)).toBe(1);
      // brilho: passa o mouse no cartão do saldo
      const card = page.locator('.ctl-saldo');
      const box = await card.boundingBox();
      await page.mouse.move(box.x + 40, box.y + 30);
      await page.mouse.move(box.x + 120, box.y + 60);
      await expect(card).toHaveClass(/aceso/);
      await expect.poll(() => card.evaluate(el => el.style.getPropertyValue('--mx'))).toBe('120px');
      semErros(erros);
    });

    test('saúde financeira: anotar conta futura nunca baixa o indicador', async ({ page }) => {
      const bx = (data, valor) => [{ id: 'b' + data + valor, data, valor, desconto: 0, juros: 0 }];
      const erros = await abrirCom(page, base({ saldo: { pessoal: 300000, negocio: 0 }, contas: [
        conta('ago', 'pagar', 'Agosto', 100000, '2026-08-10', { baixas: bx('2026-08-10', 100000) }),
        conta('set', 'pagar', 'Setembro', 100000, '2026-09-10', { baixas: bx('2026-09-10', 100000) }),
        conta('sal', 'receber', 'Salário', 400000, '2026-10-01', { baixas: bx('2026-10-01', 400000) })
      ] }), 'inicio');
      const antes = await page.evaluate(() => window.ControlNucleo.saudeFinanceira(window.WardenControl.db, 'tudo', '2026-10-02'));
      expect(antes.pontos).toBe(100);
      // contas futuras de todo tipo: enorme ainda este mês, no mês que vem, parcelada e que se repete
      const depois = await page.evaluate(() => {
        const N = window.ControlNucleo, d = JSON.parse(JSON.stringify(window.WardenControl.db));
        N.criarLancamento(d, { tipo: 'pagar', descricao: 'Reforma', valor: 99999900, vencimento: '2026-10-30', repeticao: 'unica', ref: '2026-10-02' });
        N.criarLancamento(d, { tipo: 'pagar', descricao: 'IPTU', valor: 500000, vencimento: '2026-11-10', repeticao: 'parcelada', parcelas: 10, ref: '2026-10-02' });
        N.criarLancamento(d, { tipo: 'pagar', descricao: 'Academia', valor: 15000, vencimento: '2026-10-03', repeticao: 'recorrente', freq: 'mensal', ref: '2026-10-02' });
        N.criarLancamento(d, { tipo: 'receber', descricao: 'Cliente', valor: 1000, vencimento: '2026-10-20', repeticao: 'unica', ref: '2026-10-02' });
        return N.saudeFinanceira(d, 'tudo', '2026-10-02');
      });
      expect(depois.pontos).toBe(antes.pontos);
      expect(depois.itens).toEqual(antes.itens);
      // e pela tela: anotar uma conta futura deixa o anel no mesmo número
      await expect(page.locator('.ctl-anel-num strong')).toHaveText('100');
      await novoLancamento(page, { valor: '9.000', descricao: 'Viagem', vencimento: '2026-10-25' });
      await page.locator('a[href="#inicio"]:visible').first().click();
      await expect(page.locator('.ctl-anel-num strong')).toHaveText('100');
      // só o que já venceu pesa: no dia seguinte ao vencimento, a conta atrasada tira 10
      const atrasou = await page.evaluate(() => window.ControlNucleo.saudeFinanceira(window.WardenControl.db, 'tudo', '2026-10-26'));
      expect(atrasou.itens.find(i => i.id === 'em-dia').pontos).toBe(20);
      semErros(erros);
    });

    test('saúde financeira: sem dados suficientes mostra o convite; caixa neutro sem mês completo; média só dos meses que existem', async ({ page }) => {
      const bx = (data, valor) => [{ id: 'b' + data + valor, data, valor, desconto: 0, juros: 0 }];
      const erros = await abrirCom(page, null, 'inicio');
      const cartao = page.locator('.ctl-saude');
      await expect(cartao).toHaveAttribute('data-saude', 'sem-dados');
      await expect(cartao).toContainText('Ainda não dá para calcular. Anote suas contas do mês.');
      await expect(cartao.locator('.ctl-anel-num')).toHaveCount(0);
      await expect(cartao.locator('[data-saude-aviso]')).toBeVisible();
      const calc = d => page.evaluate(([d]) => window.ControlNucleo.saudeFinanceira(window.ControlNucleo.migrar(d), 'tudo', '2026-10-02'), [d]);
      // só contas futuras (nenhum dinheiro mexeu ainda): ainda sem dados
      expect(await calc(base({ contas: [conta('a', 'pagar', 'Aluguel', 180000, '2026-10-05')] }))).toEqual({ suficiente: false });
      // só movimento neste mês: o critério do caixa fica neutro (não tira pontos)
      let s = await calc(base({ saldo: { pessoal: 0, negocio: 0 }, contas: [conta('s', 'receber', 'Salário', 400000, '2026-10-01', { baixas: bx('2026-10-01', 400000) })] }));
      expect(s.itens.find(i => i.id === 'folga')).toMatchObject({ estado: 'neutro', pontos: 20 });
      expect(s.pontos).toBe(100);
      // começou em agosto: julho não existe para a média → média de 2 meses (R$ 1.500 e R$ 500 = R$ 1.000)
      s = await calc(base({ saldo: { pessoal: 250000, negocio: 0 }, contas: [
        conta('ago', 'pagar', 'Agosto', 150000, '2026-08-10', { baixas: bx('2026-08-10', 150000) }),
        conta('set', 'pagar', 'Setembro', 50000, '2026-09-10', { baixas: bx('2026-09-10', 50000) })] }));
      expect(s.itens.find(i => i.id === 'folga')).toMatchObject({ meses: 2, media: 100000, texto: 'Caixa cobre um mês de gastos (média de 2 meses)', pontos: 10 });
      // na tela, anotar e pagar uma conta passa a mostrar o número
      await novoLancamento(page, { tipo: 'receber', valor: '100', descricao: 'Venda', vencimento: HOJE, jaPaga: true });
      await expect(cartao).toHaveAttribute('data-saude', '100');
      await expect(page.locator('.ctl-anel-num strong')).toHaveText('100');
      semErros(erros);
    });

    test.describe('celular (390px)', () => {
      test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
      test('com os efeitos rodando, nada fica mais largo que a tela; o toque acende o brilho', async ({ page }) => {
        const erros = await abrirCom(page, base({ config: PRO, saldo: { pessoal: 98765432, negocio: 0 }, contas: [
          conta('c1', 'pagar', 'Conta com um nome bem comprido para ver se corta direitinho', 123456789, HOJE),
          conta('c2', 'receber', 'Cliente', 50000, '2026-10-12')] }), 'inicio');
        await expect(page.locator('.ctl-esqueleto')).toHaveCount(0);
        await expect(page.locator('.ctl-aurora')).toHaveCount(1);
        for (const t of ['inicio', 'mes', 'contas', 'dividas', 'fluxo', 'relatorio', 'ajustes']) {
          await page.locator(`.ctl-inferior a[href="#${t}"]`).click();
          await page.waitForTimeout(500);
          expect(await page.evaluate(() => document.documentElement.scrollWidth), `tela ${t}`).toBeLessThanOrEqual(390);
        }
        await page.locator('.ctl-inferior a[href="#inicio"]').click();
        await page.locator('.ctl-saude').tap();
        await expect(page.locator('.ctl-saude')).toHaveClass(/aceso/);
        semErros(erros);
      });
    });
  });

  // ---------- "Salvar no Control" (Pix, Recibo e Cobrança → caixa de entrada → Control) ----------
  test.describe('salvar no control', () => {
    const ENTRADA = 'warden:control-entrada';
    const lerEntrada = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), ENTRADA);
    const botao = page => page.getByRole('button', { name: 'Salvar no Control' });

    test('salvar no control: o gerador de Pix grava um Pix a receber (sem duplicar)', async ({ page }) => {
      const erros = await abrir(page, '/ferramentas/gerador-qr-code-pix.html');
      await preencher(page, '#chave', 'loja@exemplo.com');
      await preencher(page, '#nome', 'Ana Souza');
      await preencher(page, '#cidade', 'Sao Paulo');
      await preencher(page, '#descricao', 'Pedido123');
      await expect(page.locator('#pix-resultado')).toBeVisible();
      // sem valor: avisa e não grava
      await botao(page).click();
      await expect(page.locator('#pix-status')).toContainText('Informe um valor');
      expect(await lerEntrada(page)).toBeNull();
      await preencher(page, '#valor', '150,00');
      await botao(page).click();
      await expect(page.locator('#pix-status')).toContainText('Salvo no Warden Control');
      let e = await lerEntrada(page);
      expect(e).toHaveLength(1);
      expect(e[0]).toMatchObject({ origem: 'pix', tipo: 'receber', descricao: 'Pix: Pedido123', valor: 15000, vencimento: HOJE, contato: '', pagoEm: null });
      expect(e[0].id).toMatch(/^e_/);
      await botao(page).click();
      await expect(page.locator('#pix-status')).toContainText('já está esperando no Control');
      expect(await lerEntrada(page)).toHaveLength(1);
      semErros(erros);
    });

    test('salvar no control: o gerador de recibo grava um recebimento já recebido na data do recibo', async ({ page }) => {
      const erros = await abrir(page, '/ferramentas/gerador-de-recibo.html');
      await expect(botao(page)).toBeDisabled();
      await preencher(page, '#rec-nome', 'Ana Souza');
      await preencher(page, '#rec-doc', '52998224725');
      await preencher(page, '#pag-nome', 'Padaria Pão Bom');
      await preencher(page, '#valor', '1234,56');
      await preencher(page, '#referente', 'criação de logotipo');
      await preencher(page, '#cidade', 'São Paulo');
      await preencher(page, '#data', '2026-09-30');
      await expect(botao(page)).toBeEnabled();
      await botao(page).click();
      await expect(page.locator('#falta')).toContainText('Salvo no Warden Control como recebido');
      const e = await lerEntrada(page);
      expect(e).toHaveLength(1);
      expect(e[0]).toMatchObject({ origem: 'recibo', tipo: 'receber', descricao: 'Criação de logotipo', valor: 123456, vencimento: '2026-09-30', pagoEm: '2026-09-30', contato: 'Padaria Pão Bom' });
      semErros(erros);
    });

    test('salvar no control: o Warden Cobrança grava a cobrança (paga entra como recebida)', async ({ page }) => {
      const cobranca = {
        versao: 1, criadoEm: '2026-10-01T12:00:00.000Z', atualizadoEm: '2026-10-01T12:00:00.000Z',
        clientes: [{ id: 'k1', nome: 'Carla Dias', whatsapp: '11987654321', obs: '', criadoEm: '2026-10-01T12:00:00.000Z', atualizadoEm: '2026-10-01T12:00:00.000Z' }],
        cobrancas: [
          { id: 'b1', clienteId: 'k1', valor: 180, descricao: 'Mensalidade', vencimento: '2026-10-10', diaVencimento: 10, recorrencia: 'unica', status: 'pendente', pagaEm: null, proximaId: null, origemId: null, historico: [], criadoEm: '2026-10-01T12:00:00.000Z', atualizadoEm: '2026-10-01T12:00:00.000Z' },
          { id: 'b2', clienteId: 'k1', valor: 99.9, descricao: 'Avaliação', vencimento: '2026-09-25', diaVencimento: 25, recorrencia: 'unica', status: 'paga', pagaEm: '2026-09-26', proximaId: null, origemId: null, historico: [], criadoEm: '2026-09-20T12:00:00.000Z', atualizadoEm: '2026-09-26T12:00:00.000Z' }
        ],
        config: { pronto: true, negocio: 'Studio Bem-Estar', pix: { tipo: 'email', chave: 'teste@warden.com.br', digitada: 'teste@warden.com.br' }, recebedor: 'WARDEN FINANCE', cidade: 'SAO PAULO', modelos: {} }
      };
      await page.addInitScript(d => { if (!sessionStorage.getItem('s')) { localStorage.setItem('warden:cobranca', JSON.stringify(d)); sessionStorage.setItem('s', 1); } }, cobranca);
      const erros = await abrir(page, '/cobranca/');
      await page.locator('#tab-cobrancas').click();
      await page.locator('[data-acao="salvar-control"][data-id="b1"]').click();
      await expect(page.locator('#cb-status')).toContainText('Cobrança salva no Warden Control');
      await page.locator('input[name="filtro"][value="pagas"]').check({ force: true });
      await page.locator('[data-acao="salvar-control"][data-id="b2"]').click();
      const e = await lerEntrada(page);
      expect(e.map(x => [x.origem, x.descricao, x.valor, x.vencimento, x.contato, x.pagoEm])).toEqual([
        ['cobranca', 'Mensalidade', 18000, '2026-10-10', 'Carla Dias', null],
        ['cobranca', 'Avaliação', 9990, '2026-09-25', 'Carla Dias', '2026-09-26']
      ]);
      semErros(erros);
    });

    test('salvar no control: o Juros compostos não tem o botão', async ({ page }) => {
      await abrir(page, '/ferramentas/juros-compostos.html');
      await expect(botao(page)).toHaveCount(0);
      expect(await page.content()).not.toContain('Salvar no Control');
    });

    test('salvar no control: o Control importa ao abrir, uma vez só, descarta o inválido e recebe o que chega com ele aberto', async ({ page, context }) => {
      const item = (id, origem, extra) => ({ id, origem, tipo: 'receber', descricao: 'Item ' + id, valor: 1000, vencimento: '2026-10-10', contato: '', forma: '', pagoEm: null, criadoEm: '2026-10-02T10:00:00.000Z', ...extra });
      await page.addInitScript(([k, lista]) => { if (!sessionStorage.getItem('entrada')) { localStorage.setItem(k, JSON.stringify(lista)); sessionStorage.setItem('entrada', 1); } }, [ENTRADA, [
        item('a', 'pix', { descricao: 'Pix: Pedido123', valor: 15000, vencimento: HOJE }),
        item('b', 'recibo', { descricao: 'Criação de logotipo', valor: 123456, vencimento: '2026-09-30', pagoEm: '2026-09-30', contato: 'Padaria Pão Bom', forma: 'Pix' }),
        item('c', 'pix', { valor: -5 }),                      // inválido: valor negativo
        item('d', 'site-estranho', {}),                        // inválido: origem desconhecida
        { lixo: true }
      ]]);
      const erros = await abrirCom(page, base({ config: PRO }), 'contas');
      await expect(page.locator('#toast')).toContainText('2 lançamentos chegaram do Pix e do Recibo');
      let db = await lerDb(page);
      expect(db.contas).toHaveLength(2);
      const pix = db.contas.find(c => c.descricao === 'Pix: Pedido123'), rec = db.contas.find(c => c.descricao === 'Criação de logotipo');
      expect(pix).toMatchObject({ tipo: 'receber', valor: 15000, vencimento: HOJE, perfil: 'pessoal', baixas: [] });
      expect(pix.obs).toBe('Veio do gerador de Pix.');
      expect(rec).toMatchObject({ valor: 123456, contato: 'Padaria Pão Bom', forma: 'Pix' });
      expect(rec.baixas).toMatchObject([{ data: '2026-09-30', valor: 123456 }]);
      expect(await lerEntrada(page)).toBeNull();
      // recarregar não importa de novo
      await page.reload();
      expect((await lerDb(page)).contas).toHaveLength(2);
      // com o Control aberto, outra aba salva uma cobrança: chega sozinha, com Desfazer
      const pagina2 = await context.newPage();
      await pagina2.goto('/ferramentas/gerador-qr-code-pix.html');
      await pagina2.evaluate(() => window.Warden.salvarNoControl({ origem: 'cobranca', tipo: 'receber', descricao: 'Mensalidade', valor: 18000, vencimento: '2026-10-10', contato: 'Carla Dias' }));
      await expect(page.locator('#toast')).toContainText('1 lançamento chegou da Cobrança');
      db = await lerDb(page);
      expect(db.contas).toHaveLength(3);
      expect(db.contas.find(c => c.descricao === 'Mensalidade')).toMatchObject({ perfil: 'negocio', contato: 'Carla Dias', obs: 'Veio do Warden Cobrança.' });
      await page.locator('#toast button').click();   // Desfazer
      await expect.poll(async () => (await lerDb(page)).contas.length).toBe(2);
      await pagina2.close();
      semErros(erros);
    });
  });

  // ---------- Consultas do Orientador (análises com os números do próprio usuário) ----------
  test.describe('consultas', () => {
    const bx = (data, valor) => [{ id: 'b' + data + valor, data, valor, desconto: 0, juros: 0 }];
    // agosto e setembro: recebe `entra` e paga `sai` em cada mês (sobra média = entra − sai)
    const historico = (entra, sai) => ['2026-08', '2026-09'].flatMap(m => [
      conta('r' + m, 'receber', 'Salário ' + m, entra, m + '-05', { baixas: bx(m + '-05', entra) }),
      conta('p' + m, 'pagar', 'Contas ' + m, sai, m + '-10', { baixas: bx(m + '-10', sai) })]);
    const AVISO = 'Isto é uma análise dos seus próprios números, não é recomendação de investimento nem consultoria financeira.';
    const PROIBIDO = /(faça|não faça|vale a pena|você deve|deveria|recomendo|recomendamos|o ideal é)/i;
    const consultar = (page, id, d, entrada = {}) => page.evaluate(([id, d, e]) =>
      window.ControlConsultas.consultar(id, window.ControlNucleo.migrar(d), 'tudo', '2026-10-02', e), [id, d, entrada]);
    // regra de tom em toda resposta: nada de mandar, aviso sempre, "a decisão é sua" quando há análise
    const tom = r => {
      [...r.paragrafos, r.risco || ''].forEach(t => expect(t, t).not.toMatch(PROIBIDO));
      expect(r.aviso).toBe(AVISO);
      expect(r.decisao).toBe(r.suficiente ? 'A decisão é sua.' : null);
      if (r.suficiente) expect(r.risco).toMatch(/^O risco: /);
    };
    const semNada = () => { const d = base(); d.config.saldoDefinido = false; return d; };
    const dividas = () => [
      conta('cartao', 'pagar', 'Cartão', 300000, '2026-10-15', { divida: { taxa: 899 } }),
      ...Array.from({ length: 6 }, (_, i) => conta('emp' + i, 'pagar', 'Empréstimo', 100000, `2026-${String(10 + i > 12 ? i - 2 : 10 + i).padStart(2, '0')}-20`.replace(/^2026-0(\d)/, '2027-0$1'),
        { grupoId: 'gemp', parcela: { n: i + 1, total: 6 }, divida: { taxa: 250 } })),
      conta('loja', 'pagar', 'Loja', 50000, '2026-09-20')   // atrasada, sem taxa
    ];

    test('consultas: "Essa parcela cabe no meu bolso?" com sobra boa, no limite, no vermelho e sem dados', async ({ page }) => {
      await abrirCom(page, base(), 'inicio');
      // sobra boa: R$ 2.000/mês, saldo de hoje R$ 4.000; 10x de R$ 300 a partir de 02/11
      let r = await consultar(page, 'parcela', base({ contas: historico(500000, 300000) }), { valor: 30000, parcelas: 10 });
      expect(r).toMatchObject({ suficiente: true, situacao: 'folga', rotuloSituacao: 'Com folga' });
      expect(r.numeros).toMatchObject({ sobraMedia: 200000, mesesSobra: 2, pctSobra: 15, total: 300000, primeira: '2026-11-02', menorSaldo: 340000, menorData: '2026-12-02' });
      expect(r.numeros.saldos.map(s => [s.dias, s.data, s.sem, s.com])).toEqual([[30, '2026-11-01', 400000, 400000], [60, '2026-12-01', 400000, 370000], [90, '2026-12-31', 400000, 340000]]);
      expect(r.paragrafos.join(' ')).toContain('A parcela ocuparia 15% dessa sobra.');
      expect(r.paragrafos.join(' ')).toContain('O momento mais apertado seria em 02/12, com R$ 3.400,00 de saldo. Nesse ponto, a folga seria de R$ 3.400,00.');
      tom(r);
      // no limite: sobra R$ 500/mês, parcela de R$ 400 (80%)
      r = await consultar(page, 'parcela', base({ contas: historico(350000, 300000) }), { valor: 40000, parcelas: 6 });
      expect(r).toMatchObject({ situacao: 'limite', numeros: { pctSobra: 80, menorSaldo: 20000 } });
      tom(r);
      // no vermelho: sai mais do que entra
      r = await consultar(page, 'parcela', base({ saldo: { pessoal: 500000, negocio: 0 }, contas: historico(200000, 300000) }), { valor: 20000, parcelas: 3 });
      expect(r).toMatchObject({ situacao: 'vermelho', numeros: { sobraMedia: -100000, pctSobra: null } });
      expect(r.paragrafos.join(' ')).toContain('saiu mais do que entrou: em média R$ 1.000,00 a menos por mês');
      tom(r);
      // sem dados: diz o que falta e como anotar
      r = await consultar(page, 'parcela', base(), { valor: 20000, parcelas: 3 });
      expect(r.suficiente).toBe(false);
      expect(r.paragrafos[0]).toBe('Ainda não dá para responder com os seus números.');
      expect(r.paragrafos.join(' ')).toContain('Falta um mês completo com o que entrou e o que saiu');
      tom(r);
      // entrada inválida
      r = await consultar(page, 'parcela', base({ contas: historico(500000, 300000) }), { valor: 0, parcelas: 3 });
      expect(r.erro).toContain('Informe o valor da parcela');
    });

    test('consultas: "Como saio das dívidas?" com dois caminhos, no limite, no vermelho e sem dados', async ({ page }) => {
      await abrirCom(page, base(), 'inicio');
      let r = await consultar(page, 'dividas', base({ contas: [...historico(500000, 300000), ...dividas()] }));
      expect(r).toMatchObject({ suficiente: true, situacao: 'folga', rotuloSituacao: 'Prazo curto' });
      expect(r.numeros).toMatchObject({ total: 950000, atrasadas: 1, semTaxa: 1, sobraMedia: 200000 });
      expect(r.numeros.dividas.map(d => [d.nome, d.total, d.taxa, d.contas])).toEqual([['Cartão', 300000, 899, 1], ['Empréstimo', 600000, 250, 6], ['Loja', 50000, null, 1]]);
      const { custo, menores } = r.numeros.caminhos;
      expect(custo.ordem).toEqual(['Cartão', 'Empréstimo', 'Loja']);
      expect(menores.ordem).toEqual(['Loja', 'Cartão', 'Empréstimo']);
      expect(custo.meses).toBeLessThanOrEqual(24);
      expect(custo.juros).toBeLessThan(menores.juros);   // maior custo primeiro paga menos juros
      expect(menores.primeira).toEqual({ nome: 'Loja', mes: 1 });   // e a menor sai da lista logo
      const texto = r.paragrafos.join(' ');
      expect(texto).toContain('Quitar primeiro as de juros mais altos');
      expect(texto).toContain('Quitar primeiro as menores');
      expect(texto).toContain('falta a taxa de juros');
      tom(r);
      // no limite: uma dívida grande a 1% ao mês e sobra de R$ 300 → mais de 2 anos
      r = await consultar(page, 'dividas', base({ contas: [...historico(330000, 300000), conta('fin', 'pagar', 'Financiamento', 800000, '2026-10-20', { divida: { taxa: 100 } })] }));
      expect(r.situacao).toBe('limite');
      expect(r.numeros.caminhos.custo.meses).toBeGreaterThan(24);
      tom(r);
      // no vermelho: sem sobra por mês…
      r = await consultar(page, 'dividas', base({ contas: [...historico(200000, 300000), ...dividas()] }));
      expect(r).toMatchObject({ situacao: 'vermelho', numeros: { caminhos: null } });
      expect(r.paragrafos.join(' ')).toContain('não há valor livre para abater as dívidas');
      tom(r);
      // …ou juros maiores que a sobra: não termina
      r = await consultar(page, 'dividas', base({ contas: [...historico(330000, 300000), conta('agi', 'pagar', 'Agiota', 500000, '2026-10-20', { divida: { taxa: 1000 } })] }));
      expect(r.situacao).toBe('vermelho');
      expect(r.paragrafos.join(' ')).toContain('as dívidas não terminam');
      tom(r);
      // sem dados: sem dívidas / com dívidas mas sem mês completo
      r = await consultar(page, 'dividas', base());
      expect(r.suficiente).toBe(false);
      expect(r.paragrafos.join(' ')).toContain('Não há contas atrasadas nem contas marcadas como dívida.');
      tom(r);
      r = await consultar(page, 'dividas', base({ contas: dividas() }));
      expect(r.suficiente).toBe(false);
      expect(r.paragrafos.join(' ')).toContain('Falta um mês completo');
      tom(r);
    });

    test('consultas: "Como saio das dívidas?" com o cadastro de Dívidas: pagando normal e qual proposta à vista economiza mais', async ({ page }) => {
      await abrirCom(page, base(), 'inicio');
      let r = await consultar(page, 'dividas', comDividas());
      expect(r).toMatchObject({ suficiente: true, situacao: 'limite', rotuloSituacao: 'Prazo longo' });
      expect(r.numeros).toMatchObject({ modo: 'cadastradas', dividas: 4, total: 3657936, compromisso: 155182, renda: 243150, sobra: 87968, fonteSobra: 'renda',
        normal: { meses: 41, custo: 3657936, semFim: [], avista: [{ nome: 'Loja Beta', valor: 165000 }] } });
      // maior economia primeiro; meses para juntar o valor à vista com R$ 879,68 por mês
      expect(r.numeros.opcoes.map(o => [o.nome, o.vista, o.economia, o.pct, o.mesesJuntar, o.libera, o.venceAntes])).toEqual([
        ['Banco Alfa', 700000, 500000, 41.7, 8, 80000, true],
        ['Financeira Delta', 1056800, 321948, 23.4, 13, 33628, true],
        ['Cartão Gama', 814500, 99688, 10.9, 10, 41554, true],
        ['Loja Beta', 165000, 0, 0, 2, 0, false]]);
      expect(r.numeros.melhor).toMatchObject({ nome: 'Banco Alfa', economia: 500000 });
      const texto = r.paragrafos.join(' ');
      expect(texto).toContain('Você tem 4 dívidas em aberto, somando R$ 36.579,36. As parcelas somam R$ 1.551,82 por mês.');
      expect(texto).toContain('Pagando normal, a última parcela sai daqui a 41 meses e o custo total fica em R$ 36.579,36. "Loja Beta" não tem parcelas: são R$ 1.650,00 à vista, sem data marcada.');
      expect(texto).toContain('Com a renda de R$ 2.431,50, sobram R$ 879,68 por mês depois das parcelas.');
      expect(texto).toContain('"Banco Alfa": à vista por R$ 7.000,00 (proposta até 06/10). Economiza R$ 5.000,00 (41,7%) em relação a pagar as parcelas até o fim. Juntando a sobra, leva 8 meses; depois, libera R$ 800,00 por mês. A proposta vale até 06/10, antes de dar para juntar esse valor.');
      expect(texto).toContain('Pelos números, a escolha que mais economiza é "Banco Alfa": R$ 5.000,00 a menos.');
      tom(r);
      // a renda não cobre as parcelas: vermelho
      r = await consultar(page, 'dividas', comDividas({ config: { ...PRO, rendaMensal: 150000 } }));
      expect(r).toMatchObject({ situacao: 'vermelho', rotuloSituacao: 'Sem folga para as dívidas', numeros: { sobra: -5182 } });
      expect(r.paragrafos.join(' ')).toContain('A renda de R$ 1.500,00 não cobre as parcelas: faltam R$ 51,82 por mês.');
      tom(r);
      // sem renda e sem histórico: diz o que falta; com histórico, usa a sobra média
      r = await consultar(page, 'dividas', { ...comDividas(), config: { ...base().config, ...PRO } });
      expect(r.suficiente).toBe(false);
      expect(r.paragrafos.join(' ')).toContain('Falta a sua renda mensal');
      tom(r);
      r = await consultar(page, 'dividas', { ...comDividas(), config: { ...base().config, ...PRO }, contas: historico(500000, 300000) });
      expect(r.numeros).toMatchObject({ fonteSobra: 'historico', sobra: 200000 });
      expect(r.paragrafos.join(' ')).toContain('A renda mensal não foi informada em Dívidas, então a conta usa essa média.');
      tom(r);
      // "Quito ou guardo" também enxerga as dívidas cadastradas (pelo que falta hoje)
      r = await consultar(page, 'quitar', comDividas(), { cdiAnual: 13.65 });
      expect(r.opcoes.map(o => [o.nome, o.total]).sort()).toEqual([['Banco Alfa', 1200000], ['Cartão Gama', 914188], ['Financeira Delta', 1378748], ['Loja Beta', 165000]]);
    });

    test('consultas: "Quito a dívida ou guardo o dinheiro?" compara com o CDI e pede a taxa quando falta', async ({ page }) => {
      await abrirCom(page, base(), 'inicio');
      const cartao = () => conta('cartao', 'pagar', 'Cartão', 300000, '2026-10-15', { divida: { taxa: 899 } });
      const rende = Math.round(300000 * (Math.pow(1.1365, 1 / 12) - 1));
      // folga cobre a dívida
      let r = await consultar(page, 'quitar', base({ saldo: { pessoal: 1000000, negocio: 0 }, contas: [cartao()] }), { cdiAnual: 13.65 });
      expect(r).toMatchObject({ suficiente: true, situacao: 'folga', numeros: { custoMes: 26970, rendeMes: rende, diferencaMes: 26970 - rende, folga: 700000, pctQuitavel: 100 } });
      expect(r.paragrafos.join(' ')).toContain('Num mês, isso soma cerca de R$ 269,70 de juros.');
      expect(r.paragrafos.join(' ')).toContain('cobriria a dívida inteira');
      expect(r.links).toEqual([{ rotulo: 'Simular em vários meses na calculadora de juros compostos', href: '/ferramentas/juros-compostos.html' }]);
      tom(r);
      // no limite: a folga cobre só uma parte
      r = await consultar(page, 'quitar', base({ saldo: { pessoal: 400000, negocio: 0 }, contas: [cartao()] }), { cdiAnual: 13.65 });
      expect(r).toMatchObject({ situacao: 'limite', numeros: { folga: 100000, pctQuitavel: 33 } });
      tom(r);
      // no vermelho: sem folga
      r = await consultar(page, 'quitar', base({ saldo: { pessoal: 100000, negocio: 0 }, contas: [cartao()] }), { cdiAnual: 13.65 });
      expect(r).toMatchObject({ situacao: 'vermelho', rotuloSituacao: 'Sem folga', numeros: { folga: -200000 } });
      tom(r);
      // sem dados: sem dívida; dívida sem taxa → diz onde achar
      r = await consultar(page, 'quitar', base(), { cdiAnual: 13.65 });
      expect(r.suficiente).toBe(false);
      tom(r);
      r = await consultar(page, 'quitar', base({ contas: [conta('loja', 'pagar', 'Loja', 50000, '2026-09-20')] }), { cdiAnual: 13.65 });
      expect(r.suficiente).toBe(false);
      expect(r.paragrafos.join(' ')).toContain('Falta a taxa de juros de "Loja".');
      expect(r.paragrafos.join(' ')).toContain('fatura');
      tom(r);
      // com duas dívidas, dá para escolher qual comparar
      r = await consultar(page, 'quitar', base({ saldo: { pessoal: 1000000, negocio: 0 }, contas: [cartao(), conta('emp', 'pagar', 'Empréstimo', 200000, '2026-10-20', { divida: { taxa: 250 } })] }), { cdiAnual: 13.65, divida: 'emp' });
      expect(r.numeros.nome).toBe('Empréstimo');
      expect(r.opcoes.map(o => o.nome)).toEqual(['Cartão', 'Empréstimo']);
    });

    test('consultas: "Posso gastar R$ X este mês?" com folga, no limite, no vermelho e sem dados', async ({ page }) => {
      await abrirCom(page, base(), 'inicio');
      const d = () => base({ saldo: { pessoal: 500000, negocio: 0 }, contas: [conta('alu', 'pagar', 'Aluguel', 180000, '2026-10-05')] });
      let r = await consultar(page, 'gasto', d(), { valor: 50000 });
      expect(r).toMatchObject({ suficiente: true, situacao: 'folga', numeros: { aPagar: 180000, fimSem: 320000, fimCom: 270000, menorCom: 270000, menorData: '2026-10-05' } });
      expect(r.paragrafos.join(' ')).toContain('Até o fim do mês (31/10), ainda vencem R$ 1.800,00 a pagar.');
      tom(r);
      r = await consultar(page, 'gasto', d(), { valor: 300000 });
      expect(r).toMatchObject({ situacao: 'limite', numeros: { menorCom: 20000 } });
      tom(r);
      r = await consultar(page, 'gasto', d(), { valor: 400000 });
      expect(r).toMatchObject({ situacao: 'vermelho', numeros: { menorCom: -80000 } });
      tom(r);
      r = await consultar(page, 'gasto', semNada(), { valor: 10000 });
      expect(r.suficiente).toBe(false);
      expect(r.paragrafos.join(' ')).toContain('Falta saber quanto você tem hoje.');
      tom(r);
      // com contas mas sem saldo inicial: analisa e avisa
      const s = d(); s.config.saldoDefinido = false;
      r = await consultar(page, 'gasto', s, { valor: 1000 });
      expect(r.suficiente).toBe(true);
      expect(r.paragrafos.join(' ')).toContain('O saldo inicial ainda não foi informado');
      // ponto da IA marcado: hoje não escreve nada
      expect(await page.evaluate(() => window.ControlConsultas.escreverComIA({}))).toBeNull();
    });

    test('consultas por plano: grátis vê 1 liberada e 3 em vitrine; o teste de 7 dias libera as 4; no fim do teste volta ao grátis sem apagar nada', async ({ page }) => {
      const erros = await abrirCom(page, base({ saldo: { pessoal: 300000, negocio: 0 }, contas: [...historico(500000, 300000),
        conta('cartao', 'pagar', 'Cartão', 300000, '2026-10-15', { divida: { taxa: 899 } })] }), 'inicio');
      const painel = page.locator('#orientador'), chips = painel.locator('.ctl-ori-consultas .ctl-chip'), vitrine = painel.locator('.ctl-ori-vitrine li');
      // grátis: a da parcela liberada; as outras três com o que respondem e "Ver no Pro" (sem cadeado)
      await expect(chips).toHaveText(['Essa parcela cabe no meu bolso?']);
      await expect(vitrine).toHaveCount(3);
      await expect(vitrine.locator('strong')).toHaveText(['Como saio das dívidas?', 'Quito a dívida ou guardo o dinheiro?', 'Posso gastar R$ X este mês?']);
      await expect(painel.locator('[data-vitrine="dividas"] p')).toHaveText('Mostra quanto tempo e quanto custa pagar normal e qual proposta à vista economiza mais com a sua sobra.');
      await expect(vitrine.getByRole('button', { name: /^Ver no Pro/ })).toHaveCount(3);
      // a liberada abre normalmente
      await chips.first().click();
      await expect(page.locator('#dlg-consulta')).toBeVisible();
      await page.locator('#dlg-consulta [data-fechar]').click();
      // "Ver no Pro" (e qualquer outro caminho para uma consulta do Pro) abre a vitrine do Pro
      await painel.getByRole('button', { name: 'Ver no Pro: Como saio das dívidas?' }).click();
      const pro = page.locator('#dlg-pro');
      await expect(pro.locator('[data-pro-motivo]')).toContainText('No grátis, a consulta "Essa parcela cabe no meu bolso?" é liberada');
      await expect(pro.locator('.ctl-pro-tabela')).toContainText('Consultas com os seus números');
      await pro.getByRole('button', { name: 'Agora não' }).click();
      await page.evaluate(() => window.WardenControl.abrirConsulta('gasto'));
      await expect(pro).toBeVisible();
      await expect(page.locator('#dlg-consulta')).toBeHidden();
      // teste de 7 dias: as quatro liberadas
      await pro.getByRole('button', { name: 'Testar 7 dias grátis' }).click();
      await expect(chips).toHaveCount(4);
      await expect(vitrine).toHaveCount(0);
      await painel.getByRole('button', { name: 'Como saio das dívidas?' }).click();
      await expect(page.locator('#dlg-consulta .ctl-consulta-texto')).toContainText('Quitar primeiro as de juros mais altos');
      await page.locator('#dlg-consulta [data-fechar]').click();
      const antes = (await lerDb(page)).contas.length;
      // acabou o teste: volta ao grátis, com a vitrine, e nada se perde
      await page.clock.setFixedTime(new Date('2026-10-09T12:00:00-03:00'));
      await page.reload();
      await expect(page.locator('#orientador .ctl-ori-consultas .ctl-chip')).toHaveText(['Essa parcela cabe no meu bolso?']);
      await expect(page.locator('#orientador .ctl-ori-vitrine li')).toHaveCount(3);
      expect((await lerDb(page)).contas.length).toBe(antes);
      semErros(erros);
    });

    test('dívida com juros: marcar no lançamento (vale para o parcelamento), validar a taxa e mostrar no detalhe', async ({ page }) => {
      const erros = await abrirCom(page, base(), 'contas');
      await page.locator('.ctl-vazio [data-acao="novo"][data-tipo="pagar"]').click();
      await preencher(page, '#lanc-valor', '900');
      await preencher(page, '#lanc-desc', 'Cartão Nubank');
      await page.locator('input[name="repeticao"][value="parcelada"]').check({ force: true });
      await preencher(page, '#lanc-parcelas', '3');
      await page.locator('#lanc-mais summary').click();
      await expect(page.locator('#lanc-taxa-bloco')).toBeHidden();
      await page.locator('#lanc-divida').check();
      await expect(page.locator('#lanc-taxa-bloco')).toBeVisible();
      await preencher(page, '#lanc-taxa', 'abc');
      await page.locator('#lanc-salvar').click();
      await expect(page.locator('#dlg-lanc [data-campo="taxa"]')).toHaveClass(/erro/);
      await preencher(page, '#lanc-taxa', '8,99');
      await page.locator('#lanc-salvar').click();
      await expect(page.locator('#dlg-lanc')).toBeHidden();
      let db = await lerDb(page);
      expect(db.contas.map(c => c.divida)).toEqual([{ taxa: 899 }, { taxa: 899 }, { taxa: 899 }]);
      await expect(linha(page, 'Cartão Nubank').first().locator('.ctl-linha-meta')).toContainText('dívida 8,99% a.m.');
      await linha(page, 'Cartão Nubank').first().locator('.ctl-linha-corpo').click();
      await expect(page.locator('.ctl-det-info')).toContainText('8,99% ao mês');
      // tirar a marca numa parcela tira de todas; conta a receber não mostra a opção
      await page.locator('[data-acao="det-editar"]').click();
      await page.locator('#lanc-divida').uncheck();
      await page.locator('#lanc-salvar').click();
      db = await lerDb(page);
      expect(db.contas.map(c => c.divida)).toEqual([null, null, null]);
      await page.locator('[data-novo]:visible').first().click();
      await page.locator('input[name="tipo"][value="receber"]').check({ force: true });
      await expect(page.locator('#lanc-divida-bloco')).toBeHidden();
      semErros(erros);
    });

    test('consultas na tela: atalhos no Orientador abrem a análise com números, situação, decisão e aviso', async ({ page }) => {
      const erros = await abrirCom(page, base({ config: PRO, saldo: { pessoal: 1000000, negocio: 0 }, contas: [...historico(500000, 300000),
        conta('cartao', 'pagar', 'Cartão', 300000, '2026-10-15', { divida: { taxa: 899 } })] }), 'inicio');
      const painel = page.locator('#orientador'), dlg = page.locator('#dlg-consulta');
      await painel.getByRole('button', { name: 'Essa parcela cabe no meu bolso?' }).click();
      await expect(dlg).toBeVisible();
      await preencher(page, '#cons-valor', '300');
      await preencher(page, '#cons-parcelas', '10');
      await dlg.getByRole('button', { name: 'Analisar com os meus números' }).click();
      await expect(dlg.locator('[data-consulta-situacao]')).toHaveText('Com folga');
      await expect(dlg.locator('.ctl-consulta-numeros')).toContainText('15%');
      await expect(dlg.locator('[data-consulta-decisao]')).toHaveText('A decisão é sua.');
      await expect(dlg.locator('[data-consulta-aviso]')).toHaveText(AVISO);
      await dlg.locator('[data-fechar]').click();
      // quitar ou guardar: usa o CDI do Banco Central (13,65% ao ano nos testes) e leva à calculadora de juros compostos
      await painel.getByRole('button', { name: 'Quito a dívida ou guardo o dinheiro?' }).click();
      await expect(dlg.locator('.ctl-consulta-texto')).toContainText('13,65% ao ano');
      await expect(dlg.getByRole('link', { name: /juros compostos/ })).toHaveAttribute('href', '/ferramentas/juros-compostos.html');
      await dlg.locator('[data-fechar]').click();
      // dívidas e gasto
      await painel.getByRole('button', { name: 'Como saio das dívidas?' }).click();
      await expect(dlg.locator('.ctl-consulta-texto')).toContainText('Quitar primeiro as de juros mais altos');
      await dlg.locator('[data-fechar]').click();
      await painel.getByRole('button', { name: 'Posso gastar R$ X este mês?' }).click();
      // saldo R$ 14.000 (10.000 + 4.000 de sobra) − cartão R$ 3.000 = R$ 11.000: gastar R$ 9.000 deixa R$ 2.000 (no limite); R$ 12.000, falta
      await preencher(page, '#cons-valor', '9.000');
      await dlg.getByRole('button', { name: 'Analisar com os meus números' }).click();
      await expect(dlg.locator('[data-consulta-situacao]')).toHaveText('No limite');
      await preencher(page, '#cons-valor', '12.000');
      await dlg.getByRole('button', { name: 'Analisar com os meus números' }).click();
      await expect(dlg.locator('[data-consulta-situacao]')).toHaveText('No vermelho');
      semErros(erros);
    });
  });

  // ---------- Dívidas (área do Pro): cadastro + resumo; as parcelas entram no fluxo e no "Meu mês" ----------
  test.describe('dividas', () => {
    const cartao = (page, credor) => page.locator('.ctl-div', { has: page.locator('h3', { hasText: credor }) });

    test('dívidas: o caso real — resumo, ordem pela maior economia e proposta que vence em 7 dias em destaque', async ({ page }) => {
      const erros = await abrirCom(page, comDividas(), 'dividas');
      const res = page.locator('[data-dividas="resumo"]');
      await expect(res.locator('[data-div="total"]')).toHaveText('R$ 36.579,36');
      await expect(res.locator('[data-div="vista"]')).toHaveText('R$ 27.363,00');
      await expect(res.locator('[data-div="economia"]')).toHaveText('R$ 9.216,36');
      await expect(res.locator('[data-div="economia-pct"]')).toHaveText('25,2% do total');
      await expect(res.locator('[data-div="compromisso"]')).toHaveText('R$ 1.551,82');
      await expect(res.locator('[data-div="pct-renda"]')).toHaveText('63,8% da renda');
      await expect(res.locator('[data-div="sobra"]')).toHaveText('R$ 879,68');
      await expect(res.locator('[data-div="renda"]')).toHaveText('R$ 2.431,50');
      // maior economia primeiro (R$ 5.000 · R$ 3.219,48 · R$ 996,88 · sem desconto)
      await expect(page.locator('.ctl-div h3')).toHaveText(['Banco Alfa', 'Financeira Delta', 'Cartão Gama', 'Loja Beta']);
      await expect(cartao(page, 'Banco Alfa').locator('[data-div-eco]')).toHaveText('Economia de R$ 5.000,00 (41,7%)');
      await expect(cartao(page, 'Financeira Delta').locator('[data-div-eco]')).toHaveText('Economia de R$ 3.219,48 (23,4%)');
      await expect(cartao(page, 'Cartão Gama').locator('[data-div-eco]')).toHaveText('Economia de R$ 996,88 (10,9%)');
      await expect(cartao(page, 'Loja Beta').locator('.ctl-div-proposta')).toContainText('Sem desconto');
      await expect(cartao(page, 'Banco Alfa')).toContainText('Parcela R$ 800,00 · dia 10 · faltam 15');
      // a proposta que vence em até 7 dias fica em destaque (cartão e aviso no topo); as outras, não
      await expect(cartao(page, 'Banco Alfa')).toHaveClass(/vencendo/);
      await expect(cartao(page, 'Banco Alfa').locator('[data-proposta-vence]')).toHaveText('Vence em 4 dias');
      await expect(page.locator('.ctl-div.vencendo')).toHaveCount(1);
      await expect(page.locator('[data-div-vencendo]')).toContainText('A proposta de Banco Alfa vence em 4 dias (06/10)');
      // os mesmos números no núcleo
      const r = await page.evaluate(() => window.ControlNucleo.resumoDividas(window.WardenControl.db, 'tudo', '2026-10-02'));
      expect(r).toMatchObject({ totalDevido: 3657936, totalVista: 2736300, economia: 921636, pctEconomia: 25.2, compromisso: 155182, renda: 243150, pctRenda: 63.8, sobra: 87968 });
      // a proposta vencida não entra no total à vista
      await page.clock.setFixedTime(new Date('2026-10-07T12:00:00-03:00'));
      await page.reload();
      await expect(page.locator('[data-div="vista"]')).toHaveText('R$ 32.363,00');
      await expect(cartao(page, 'Banco Alfa').locator('.ctl-div-proposta')).toContainText('A proposta de R$ 7.000,00 venceu em 06/10/2026');
      await expect(page.locator('[data-div-vencendo]')).toHaveCount(0);
      semErros(erros);
    });

    test('dívidas: as parcelas entram sozinhas no fluxo e no "Meu mês", sem duplicar e sem contar no limite do grátis', async ({ page }) => {
      const erros = await abrirCom(page, comDividas(), 'mes');
      let db = await lerDb(page);
      const geradas = db.contas.filter(c => c.dividaId);
      // até 31/12 (hoje + 90 dias): 3 parcelas de cada dívida com parcela; a "à vista" não gera nada
      expect(geradas.map(c => [c.descricao, c.vencimento, c.valor]).sort()).toEqual([
        ['Banco Alfa', '2026-10-10', 80000], ['Banco Alfa', '2026-11-10', 80000], ['Banco Alfa', '2026-12-10', 80000],
        ['Cartão Gama', '2026-10-15', 41554], ['Cartão Gama', '2026-11-15', 41554], ['Cartão Gama', '2026-12-15', 41554],
        ['Financeira Delta', '2026-10-20', 33628], ['Financeira Delta', '2026-11-20', 33628], ['Financeira Delta', '2026-12-20', 33628]]);
      expect(geradas.every(c => c.tipo === 'pagar' && c.categoriaId === 'cat_dividas')).toBe(true);
      expect(await page.evaluate(() => window.ControlNucleo.lancamentosNoMes(window.WardenControl.db, '2026-10'))).toBe(0);
      await page.reload();
      expect((await lerDb(page)).contas).toHaveLength(9);
      // "Meu mês": as parcelas de outubro, com o número da parcela
      await expect(page.locator('.ctl-mes .ctl-linha-desc')).toHaveText(['Banco Alfa', 'Cartão Gama', 'Financeira Delta']);
      await expect(doMes(page, 'Banco Alfa')).toContainText('parcela 1/15 da dívida');
      await expect(page.locator('[data-mes="progresso"]')).toHaveText('0 de 3 pagas · faltam R$ 1.551,82');
      // pagar a parcela abate do que falta e do prazo
      await doMes(page, 'Banco Alfa').locator('.ctl-check').click();
      await page.locator('.ctl-lateral a[href="#dividas"]').click();
      await expect(cartao(page, 'Banco Alfa').locator('[data-div-devido]')).toHaveText('R$ 11.200,00');
      await expect(cartao(page, 'Banco Alfa')).toContainText('faltam 14');
      await expect(page.locator('[data-div="total"]')).toHaveText('R$ 35.779,36');
      // fluxo: as parcelas estão nos próximos movimentos
      await page.locator('.ctl-lateral a[href="#fluxo"]').click();
      await page.locator('[data-acao="periodo"][data-v="90"]').click();
      await expect(page.locator('.ctl-mov .ctl-linha-desc', { hasText: 'Cartão Gama' })).toHaveCount(3);
      // excluir uma parcela: ela não volta ao recarregar
      await page.locator('.ctl-lateral a[href="#contas"]').click();
      await linha(page, 'Financeira Delta').first().locator('.ctl-linha-corpo').click();
      await expect(page.locator('.ctl-det-info')).toContainText('Parcela 1/41 da dívida (Financeira Delta, em Dívidas)');
      await page.locator('[data-acao="det-excluir"]').click();
      await page.locator('#dlg-confirmar').getByRole('button', { name: 'Excluir' }).click();
      await expect.poll(async () => (await lerDb(page)).contas.filter(c => c.dividaId === 'dD').length).toBe(2);
      await page.reload();
      db = await lerDb(page);
      expect(db.contas.filter(c => c.dividaId === 'dD').map(c => c.vencimento)).toEqual(['2026-11-20', '2026-12-20']);
      expect(db.dividas.find(d => d.id === 'dD').excluidas).toEqual(['2026-10-20']);
      semErros(erros);
    });

    test('dívidas: cadastrar com proposta (economia na hora), validar, editar, quitar e excluir, com Desfazer', async ({ page }) => {
      const erros = await abrirCom(page, base({ config: PRO }), 'dividas');
      await expect(page.locator('.ctl-vazio h2')).toHaveText('Suas dívidas num lugar só');
      await expect(page.locator('[data-novo]:visible')).toHaveCount(0);   // aqui o botão é "Nova dívida"
      await page.locator('.ctl-div-nova').click();
      const dlg = page.locator('#dlg-divida');
      await expect(dlg).toBeVisible();
      await expect(page.locator('#divida-origem-bloco')).toBeHidden();
      await preencher(page, '#divida-credor', 'Banco Alfa');
      await preencher(page, '#divida-total', '12.000');
      await expect(page.locator('#divida-prazo-bloco')).toBeHidden();
      await preencher(page, '#divida-parcela', '800');
      await expect(page.locator('#divida-prazo-bloco')).toBeVisible();
      await expect(page.locator('#divida-dica')).toContainText('15 parcelas');
      await preencher(page, '#divida-parcelas', '15');
      await preencher(page, '#divida-dia', '10');
      await preencher(page, '#divida-vista', '13.000');
      await expect(page.locator('#divida-eco')).toHaveText('A proposta não é menor que o total devido.');
      await page.locator('#divida-salvar').click();
      await expect(dlg.locator('[data-campo="proposta"]')).toHaveClass(/erro/);
      await preencher(page, '#divida-vista', '7.000');
      await expect(page.locator('#divida-eco')).toHaveText('Economia de R$ 5.000,00 (41,7%) sobre o total devido.');
      await preencher(page, '#divida-validade', '2026-10-20');
      await page.locator('#divida-salvar').click();
      await expect(dlg).toBeHidden();
      let db = await lerDb(page);
      expect(db.dividas[0]).toMatchObject({ credor: 'Banco Alfa', total: 1200000, parcela: 80000, parcelas: 15, dia: 10, inicio: '2026-10-10', proposta: { valor: 700000, validade: '2026-10-20' } });
      expect(db.contas.map(c => c.vencimento)).toEqual(['2026-10-10', '2026-11-10', '2026-12-10']);
      await expect(page.locator('[data-div="pct-renda"]')).toHaveText('Informe a renda para ver o peso');
      // renda mensal
      await page.locator('[data-dividas="resumo"] [data-acao="renda"]').click();
      await preencher(page, '#conf-campo', '2.431,50');
      await page.locator('#dlg-confirmar').getByRole('button', { name: 'Salvar renda' }).click();
      await expect(page.locator('[data-div="sobra"]')).toHaveText('R$ 1.631,50');
      // editar: parcela e prazo novos refazem as parcelas em aberto
      await cartao(page, 'Banco Alfa').getByRole('button', { name: 'Editar Banco Alfa' }).click();
      await expect(page.locator('#divida-total')).toHaveValue('12.000,00');
      await expect(page.locator('#divida-parcelas')).toHaveValue('15');
      await preencher(page, '#divida-parcela', '1.000');
      await preencher(page, '#divida-parcelas', '12');
      await page.locator('#divida-salvar').click();
      await expect(dlg).toBeHidden();
      db = await lerDb(page);
      expect(db.contas.map(c => [c.vencimento, c.valor])).toEqual([['2026-10-10', 100000], ['2026-11-10', 100000], ['2026-12-10', 100000]]);
      await expect(cartao(page, 'Banco Alfa')).toContainText('Parcela R$ 1.000,00 · dia 10 · faltam 12');
      // quitei: com o valor da proposta, as parcelas saem e o pagamento entra pago hoje
      await cartao(page, 'Banco Alfa').getByRole('button', { name: 'Quitei Banco Alfa' }).click();
      await expect(page.locator('#conf-campo')).toHaveValue('7.000,00');
      await page.locator('#dlg-confirmar').getByRole('button', { name: 'Quitei' }).click();
      await expect(page.locator('.ctl-div-quitadas')).toContainText('Quitada em 02/10/2026');
      await expect(page.locator('[data-div="total"]')).toHaveText('R$ 0,00');
      db = await lerDb(page);
      expect(db.contas.map(c => [c.descricao, c.valor, c.baixas.length])).toEqual([['Quitação: Banco Alfa', 700000, 1]]);
      // Desfazer volta tudo
      await page.locator('#toast button').click();
      await expect(page.locator('.ctl-div h3')).toHaveText(['Banco Alfa']);
      expect((await lerDb(page)).contas).toHaveLength(3);
      // excluir: sai o cadastro e as parcelas sem baixa
      await cartao(page, 'Banco Alfa').getByRole('button', { name: 'Excluir Banco Alfa' }).click();
      await page.locator('#dlg-confirmar').getByRole('button', { name: 'Excluir' }).click();
      await expect.poll(async () => (await lerDb(page)).dividas.length).toBe(0);
      expect((await lerDb(page)).contas).toHaveLength(0);
      semErros(erros);
    });

    test('dívidas: nasce de uma conta marcada como dívida, sem duplicar as parcelas', async ({ page }) => {
      const emp = [1, 2, 3].map(n => conta('e' + n, 'pagar', 'Empréstimo Zeta', 50000, `2026-${9 + n}-20`, { grupoId: 'gz', parcela: { n, total: 3 }, divida: { taxa: 250 } }));
      const erros = await abrirCom(page, base({ config: PRO, contas: emp }), 'dividas');
      await expect(page.locator('[data-div-de-conta]')).toContainText('Você tem 1 conta marcada como dívida');
      await page.locator('.ctl-div-nova').click();
      await expect(page.locator('#divida-origem-bloco')).toBeVisible();
      await page.locator('#divida-origem').selectOption('e1');
      await expect(page.locator('#divida-credor')).toHaveValue('Empréstimo Zeta');
      await expect(page.locator('#divida-total')).toHaveValue('1.500,00');
      await expect(page.locator('#divida-parcela')).toHaveValue('500,00');
      await expect(page.locator('#divida-parcelas')).toHaveValue('3');
      await expect(page.locator('#divida-dia')).toHaveValue('20');
      await expect(page.locator('#divida-taxa')).toHaveValue('2,5');
      await page.locator('#divida-salvar').click();
      await expect(page.locator('#dlg-divida')).toBeHidden();
      const db = await lerDb(page);
      expect(db.contas.map(c => [c.descricao, c.vencimento, c.valor, !!c.dividaId])).toEqual([
        ['Empréstimo Zeta', '2026-10-20', 50000, true], ['Empréstimo Zeta', '2026-11-20', 50000, true], ['Empréstimo Zeta', '2026-12-20', 50000, true]]);
      expect(db.dividas[0]).toMatchObject({ credor: 'Empréstimo Zeta', total: 150000, parcelas: 3, taxa: 250, origem: 'gz' });
      await expect(page.locator('[data-div-de-conta]')).toHaveCount(0);
      semErros(erros);
    });

    test('dívidas: no grátis é vitrine do Pro; o teste de 7 dias libera a área', async ({ page }) => {
      const erros = await abrirCom(page, base(), 'dividas');
      const vit = page.locator('[data-dividas="vitrine"]');
      await expect(vit).toBeVisible();
      await expect(vit.locator('.ctl-selo-pro')).toHaveText('Pro');
      await expect(vit).toContainText('quanto as parcelas somam por mês, o peso delas na sua renda e quanto sobra');
      await expect(page.locator('.ctl-lateral a[href="#dividas"]')).toHaveAttribute('aria-current', 'page');
      await vit.getByRole('button', { name: 'Conhecer o Pro' }).click();
      const pro = page.locator('#dlg-pro');
      await expect(pro.locator('[data-pro-motivo]')).toContainText('A área Dívidas é do Pro');
      await expect(pro.locator('.ctl-pro-tabela')).toContainText('Dívidas e propostas de desconto');
      await pro.getByRole('button', { name: 'Agora não' }).click();
      await page.evaluate(() => window.WardenControl.abrirDivida());
      await expect(pro).toBeVisible();
      await expect(page.locator('#dlg-divida')).toBeHidden();
      await pro.getByRole('button', { name: 'Testar 7 dias grátis' }).click();
      await expect(vit).toHaveCount(0);
      await expect(page.locator('.ctl-div-nova')).toBeVisible();
      semErros(erros);
    });

    test.describe('celular (390px)', () => {
      test.use({ viewport: { width: 390, height: 844 } });
      test('dívidas no celular: resumo e lista sem passar da largura da tela; consulta pelo botão da área', async ({ page }) => {
        const erros = await abrirCom(page, comDividas(), 'dividas');
        await expect(page.locator('.ctl-inferior a[href="#dividas"]')).toHaveAttribute('aria-current', 'page');
        await expect(page.locator('[data-div="sobra"]')).toHaveText('R$ 879,68');
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
        await page.getByRole('button', { name: 'Como saio das dívidas?' }).click();
        await expect(page.locator('#dlg-consulta [data-consulta-situacao]')).toHaveText('Prazo longo');
        await expect(page.locator('#dlg-consulta .ctl-consulta-numeros')).toContainText('41 meses');
        semErros(erros);
      });
    });
  });

  // ---------- janelas: conteúdo rola por dentro, rodapé sempre visível, aviso ao fechar sem salvar ----------
  test.describe('janelas', () => {
    // preenche a dívida inteira (o formulário cresce ao digitar a parcela)
    async function dividaCompleta(page) {
      await page.locator('.ctl-div-nova').click();
      await expect(page.locator('#dlg-divida')).toBeVisible();
      await preencher(page, '#divida-credor', 'Banco Alfa');
      await preencher(page, '#divida-total', '12.000');
      await preencher(page, '#divida-parcela', '800');
      // o campo que apareceu fica à vista dentro da janela
      await expect(page.locator('#divida-parcelas')).toBeInViewport();
      await preencher(page, '#divida-parcelas', '15');
      await preencher(page, '#divida-dia', '10');
      await preencher(page, '#divida-taxa', '2,5');
      await preencher(page, '#divida-vista', '7.000');
      await preencher(page, '#divida-validade', '2026-10-20');
      await preencher(page, '#divida-obs', 'Contrato 123');
    }
    // o botão está inteiro dentro da tela, sem rolar a página
    async function visivelSemRolar(page, sel) {
      const btn = page.locator(sel), vp = page.viewportSize(), box = await btn.boundingBox();
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height, `${sel} dentro da tela`).toBeLessThanOrEqual(vp.height);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    }
    for (const [nome, vp] of [['celular 390px', { width: 390, height: 844 }], ['janela baixa 1280x600', { width: 1280, height: 600 }]]) {
      test.describe(nome, () => {
        // rolagem instantânea: o teste confere ONDE o campo novo fica, sem depender do tempo da animação suave
        test.use({ viewport: vp, reducedMotion: 'reduce' });
        test(`janelas (${nome}): dívida completa, o miolo rola por dentro e o Salvar continua à vista`, async ({ page }) => {
          const erros = await abrirCom(page, base({ config: PRO }), 'dividas');
          await dividaCompleta(page);
          const miolo = page.locator('#dlg-divida .ctl-dlg-miolo');
          expect(await miolo.evaluate(m => m.scrollHeight > m.clientHeight)).toBe(true);   // o conteúdo é maior que a janela…
          await visivelSemRolar(page, '#divida-salvar');                                   // …e o rodapé não sai da tela
          await visivelSemRolar(page, '#dlg-divida [data-fechar].btn');
          const dlgBox = await page.locator('#dlg-divida').boundingBox();
          expect(dlgBox.height).toBeLessThanOrEqual(vp.height * 0.9 + 1);
          await page.locator('#divida-salvar').click();
          await expect(page.locator('#dlg-divida')).toBeHidden();
          expect((await lerDb(page)).dividas[0]).toMatchObject({ credor: 'Banco Alfa', parcelas: 15, taxa: 250, obs: 'Contrato 123', proposta: { valor: 700000 } });
          // o novo lançamento parcelado, com "Mais detalhes" aberto, também
          await page.evaluate(() => window.WardenControl.abrirLancamento());
          await page.locator('input[name="repeticao"][value="parcelada"]').check({ force: true });
          await expect(page.locator('#lanc-parcelas')).toBeInViewport();
          await page.locator('#lanc-mais summary').click();
          await page.locator('#lanc-divida').check();
          await expect(page.locator('#lanc-taxa')).toBeInViewport();
          await visivelSemRolar(page, '#lanc-salvar');
          semErros(erros);
        });
      });
    }

    test('janelas: fechar com dados não salvos pergunta antes; sem nada digitado, fecha direto', async ({ page }) => {
      const erros = await abrirCom(page, base({ config: PRO }), 'dividas');
      const dlg = page.locator('#dlg-divida'), conf = page.locator('#dlg-confirmar');
      // nada digitado: fecha sem perguntar
      await page.locator('.ctl-div-nova').click();
      await dlg.getByRole('button', { name: 'Cancelar' }).click();
      await expect(dlg).toBeHidden();
      await expect(conf).toBeHidden();
      // digitou: Cancelar pergunta; "Continuar editando" volta com tudo lá
      await page.locator('.ctl-div-nova').click();
      await preencher(page, '#divida-credor', 'Banco Alfa');
      await dlg.getByRole('button', { name: 'Cancelar' }).click();
      await expect(conf.locator('h2')).toHaveText('Descartar o que você digitou?');
      await conf.getByRole('button', { name: 'Continuar editando' }).click();
      await expect(dlg).toBeVisible();
      await expect(page.locator('#divida-credor')).toHaveValue('Banco Alfa');
      // o X e o Esc também perguntam
      await dlg.getByRole('button', { name: 'Fechar' }).click();
      await expect(conf).toBeVisible();
      await conf.getByRole('button', { name: 'Continuar editando' }).click();
      await page.locator('#divida-credor').press('Escape');
      await expect(conf).toBeVisible();
      await expect(dlg).toBeVisible();
      // descartar fecha e não salva nada
      await conf.getByRole('button', { name: 'Descartar' }).click();
      await expect(dlg).toBeHidden();
      expect((await lerDb(page)).dividas || []).toHaveLength(0);
      // vale também para o novo lançamento
      await page.evaluate(() => window.WardenControl.abrirLancamento());
      await preencher(page, '#lanc-valor', '150');
      await page.locator('#dlg-lanc').getByRole('button', { name: 'Cancelar' }).click();
      await expect(conf.locator('h2')).toHaveText('Descartar o que você digitou?');
      await conf.getByRole('button', { name: 'Descartar' }).click();
      await expect(page.locator('#dlg-lanc')).toBeHidden();
      // salvar não pergunta nada
      await page.evaluate(() => window.WardenControl.abrirLancamento());
      await preencher(page, '#lanc-valor', '150');
      await preencher(page, '#lanc-desc', 'Aluguel');
      await page.locator('#lanc-salvar').click();
      await expect(page.locator('#dlg-lanc')).toBeHidden();
      await expect(conf).toBeHidden();
      semErros(erros);
    });
  });

  // ---------- mini calculadora da barra lateral (só desktop) ----------
  test.describe('calculadora', () => {
    // aperta as teclas na lógica pura e devolve { visor, centavos, erro }
    const contas = (page, teclas) => page.evaluate(t => {
      const c = window.ControlCalculadora.criar();
      let e;
      for (const k of t) e = c.tecla(k);
      return { visor: e.visor, erro: e.erro, centavos: c.centavos() };
    }, teclas);

    test('calculadora: contas exatas, sem erro de arredondamento, e centavos com meio centavo para cima', async ({ page }) => {
      await abrirCom(page, base(), 'inicio');
      expect(await contas(page, ['0', '.', '1', '+', '0', '.', '2', '='])).toEqual({ visor: '0,3', erro: '', centavos: 30 });
      expect(await contas(page, ['1', '÷', '3', '×', '3', '='])).toEqual({ visor: '1', erro: '', centavos: 100 });
      expect(await contas(page, ['1', '0', '÷', '3', '='])).toMatchObject({ visor: '3,33333333', centavos: 333 });
      expect(await contas(page, ['2', '.', '6', '7', '5'])).toMatchObject({ visor: '2,675', centavos: 268 });
      expect(await contas(page, ['2', '+', '3', '×', '4', '='])).toMatchObject({ visor: '20', centavos: 2000 });   // executa na hora, como no celular
      expect(await contas(page, ['1', '2', '5', '0', '−', '2', '0', '0', '0', '='])).toMatchObject({ visor: '−750', centavos: -75000 });
      expect(await contas(page, ['1', '2', '3', '4', '5', '6', '7', '.', '5'])).toMatchObject({ visor: '1.234.567,5', centavos: 123456750 });
      expect(await contas(page, ['5', '÷', '0', '='])).toEqual({ visor: 'Erro', erro: 'Não dá para dividir por zero.', centavos: null });
      expect(await contas(page, ['5', '÷', '0', '=', 'C'])).toMatchObject({ visor: '0', erro: '' });
    });

    test('calculadora: na barra lateral do desktop, teclado no visor e "Usar este valor" preenche o novo lançamento', async ({ page }) => {
      const erros = await abrirCom(page, base(), 'contas');
      const calc = page.locator('#calc'), visor = page.locator('#calc-visor');
      await expect(calc).toBeVisible();
      // fica entre o menu (depois de Ajustes) e o "Seus dados ficam só neste aparelho"
      const y = sel => page.locator(sel).evaluate(el => el.getBoundingClientRect().top);
      expect(await y('#calc')).toBeGreaterThan(await y('.ctl-lateral a[href="#ajustes"]'));
      expect(await y('#calc')).toBeLessThan(await y('.ctl-lateral-pe'));
      // cliques: 1250,5 × 2 = 2.501
      for (const k of ['1', '2', '5', '0', '.', '5', '×', '2', '=']) await page.locator(`#calc [data-calc="${k}"]`).click();
      await expect(visor).toHaveText('2.501');
      await page.locator('#calc-usar').click();
      await expect(page.locator('#dlg-lanc')).toBeVisible();
      await expect(page.locator('#lanc-valor')).toHaveValue('2.501,00');
      await preencher(page, '#lanc-desc', 'Compra da semana');
      await page.locator('#lanc-salvar').click();
      expect((await lerDb(page)).contas[0]).toMatchObject({ descricao: 'Compra da semana', valor: 250100 });
      // teclado com o visor focado: números, operadores, Enter = igual, Esc = limpar; "n" não abre o novo lançamento
      await page.locator('#calc-visor-box').focus();
      await page.keyboard.type('0.1+0.2');
      await expect(page.locator('#calc-expr')).toHaveText('0,1 +');
      await page.keyboard.press('Enter');
      await expect(visor).toHaveText('0,3');
      await page.locator('#calc-usar').click();
      await expect(page.locator('#lanc-valor')).toHaveValue('0,30');
      await page.locator('#dlg-lanc [data-fechar]').first().click();
      await page.locator('#calc-visor-box').focus();
      await page.keyboard.press('Escape');
      await expect(visor).toHaveText('0');
      await page.keyboard.press('n');
      await expect(page.locator('#dlg-lanc')).toBeHidden();
      // zero não vira lançamento
      await page.locator('#calc-usar').click();
      await expect(page.locator('#calc-msg')).toHaveText('O valor precisa ser maior que zero.');
      await expect(page.locator('#dlg-lanc')).toBeHidden();
      // recolher fica lembrado
      await page.locator('#calc-alternar').click();
      await expect(page.locator('#calc-corpo')).toBeHidden();
      await expect(page.locator('#calc-alternar')).toHaveAttribute('aria-expanded', 'false');
      await page.reload();
      await expect(page.locator('#calc-corpo')).toBeHidden();
      expect((await lerDb(page)).config.calcRecolhida).toBe(true);
      await page.locator('#calc-alternar').click();
      await expect(page.locator('#calc-corpo')).toBeVisible();
      semErros(erros);
    });

    test('calculadora: não aparece abaixo de 960px (nem em 940px, com a barra lateral, nem no celular)', async ({ page }) => {
      await page.setViewportSize({ width: 940, height: 900 });
      await abrirCom(page, base(), 'inicio');
      await expect(page.locator('.ctl-lateral')).toBeVisible();
      await expect(page.locator('#calc')).toBeHidden();
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.locator('#calc')).toBeHidden();
      await expect(page.getByRole('button', { name: 'Usar este valor' })).toHaveCount(0);   // fora da árvore acessível
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    });
  });

  // ---------- página /assinar.html e textos legais ----------
  test.describe('assinar', () => {
    test('assinar: preço, botão desabilitado sem checkoutUrl e habilitado com a URL; links de Termos e Privacidade', async ({ page }) => {
      const erros = await abrir(page, '/assinar.html');
      await expect(page.locator('[data-preco]')).toContainText('R$ 9,90');
      const btn = page.locator('#assinar-btn');
      await expect(btn).toBeDisabled();
      await expect(btn).toHaveText('Assinatura em breve');
      await expect(page.locator('#assinar-nota a[href="/termos.html"]')).toBeVisible();
      await expect(page.locator('#assinar-nota a[href="/privacidade.html"]')).toBeVisible();
      await expect(page.locator('#assinar-nota')).toContainText('processado pela Kiwify');
      // o texto do teste grátis vem da mesma constante do Control
      const copy = await page.evaluate(() => window.WARDEN_PRO.COPY_TESTE);
      await expect(page.locator('[data-copy-teste]').first()).toHaveText(copy);
      await expect(page.locator('.tool-faq')).toContainText(copy);
      expect(await page.evaluate(() => window.WardenAssinar.PLANO)).toEqual({ preco: '9,90', checkoutUrl: '' });
      await page.evaluate(() => window.WardenAssinar.aplicarPlano({ preco: '9,90', checkoutUrl: 'https://pay.kiwify.com.br/exemplo' }));
      await expect(btn).toBeEnabled();
      await expect(btn).toHaveAttribute('href', 'https://pay.kiwify.com.br/exemplo');
      await expect(btn).toHaveText('Assinar por R$ 9,90/mês');
      // link que não é https não vira botão
      await page.evaluate(() => window.WardenAssinar.aplicarPlano({ preco: '9,90', checkoutUrl: 'javascript:alert(1)' }));
      await expect(page.locator('#assinar-btn')).toBeDisabled();
      // schema: WebPage com o Product (preço) dentro
      const ld = await page.evaluate(() => JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent));
      expect(ld['@type']).toBe('WebPage');
      expect(ld.mainEntity).toMatchObject({ '@type': 'Product', offers: { price: '9.90', priceCurrency: 'BRL' } });
      semErros(erros);
    });

    test('assinar: Privacidade e Termos falam do pagamento pela Kiwify, dos dados no aparelho e das chaves do Control', async ({ request }) => {
      const priv = await (await request.get('/privacidade.html')).text();
      expect(priv).toContain('warden:control:v1');
      expect(priv).toContain('warden:control-entrada');
      expect(priv).toMatch(/pagamento do Pro é processado pela <strong>Kiwify<\/strong>/);
      expect(priv).toContain('Tudo isso fica guardado só no navegador do seu aparelho');
      const termos = await (await request.get('/termos.html')).text();
      expect(termos).toContain('6. Warden Control e assinatura do Warden Pro');
      expect(termos).toContain('O pagamento é processado pela <strong>Kiwify</strong>');
      expect(termos).toContain('guarda as suas contas <strong>só no seu aparelho</strong>');
    });
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

    // conta quantas vezes o confete foi criado (ele some sozinho em 2,4 s; contar não depende do tempo)
    const contarConfetes = page => page.addInitScript(() => {
      window.__confetes = 0;
      new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.classList && n.classList.contains('ctl-confete')) window.__confetes++; })))
        .observe(document, { childList: true, subtree: true });   // o <html> ainda não existe quando este script roda
    });
    const confetes = page => page.evaluate(() => window.__confetes);

    test('cadastrar, editar e excluir conta fixa; confete uma vez por mês ao quitar tudo', async ({ page }) => {
      await contarConfetes(page);
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
      await page.locator('#dlg-confirmar').getByRole('button', { name: 'Descartar' }).click();   // tinha coisa digitada
      await expect(dlg).toBeHidden();
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
      await expect.poll(() => confetes(page)).toBe(1);
      expect((await lerDb(page)).config.confeteMes).toBe('2026-10');
      await grupo(page, 'Pagas').locator('summary').click();
      await doMes(page, 'Academia').locator('.ctl-check').click();   // reabre
      await expect(page.locator('.ctl-mes-fim')).toHaveCount(0);
      await doMes(page, 'Academia').locator('.ctl-check').click();   // quita de novo
      await expect(page.locator('.ctl-mes-fim')).toContainText('Mês fechado!');
      await page.waitForTimeout(300);
      expect(await confetes(page)).toBe(1);   // não comemora de novo no mesmo mês
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
      await contarConfetes(page);
      await abrirCom(page, base({ modelos: [modelo('m1', 'pagar', 'Aluguel', 180000, 5)] }), 'mes');
      await doMes(page, 'Aluguel').locator('.ctl-check').click();
      await expect(page.locator('.ctl-mes-fim')).toBeVisible();
      await page.waitForTimeout(300);
      expect(await confetes(page)).toBe(0);
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
      for (const t of ['inicio', 'mes', 'contas', 'dividas', 'fluxo', 'relatorio', 'ajustes']) {
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
