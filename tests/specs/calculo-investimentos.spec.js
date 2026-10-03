// Testes de cálculo: Investimentos (juros compostos da home, simulador, poupança, viver de renda,
// dividendos, rentabilidade real, conversor). Taxas do BC fixas (Selic 13,75 / CDI 13,65 / IPCA 4,22) e data fixa 02/10/2026.
const { test, expect } = require('@playwright/test');
const { abrir, preencher, escolher, card, numero, esperarReais, semErros } = require('../helpers');

test.describe('juros-compostos', () => {
  test('calculo: R$ 1.000 + R$ 200/mês a 1% a.m. por 12 meses = 3.663,33 (aporte no fim do mês)', async ({ page }) => {
    const erros = await abrir(page, '/index.html');
    await preencher(page, '#calc-inicial', '1000');
    await preencher(page, '#calc-aporte', '200');
    await preencher(page, '#calc-taxa', '1');
    await preencher(page, '#calc-periodo', '12');
    await escolher(page, '#calc-periodo-unidade', 'meses');
    // aporte no FIM do mês (anuidade postecipada): 1000 × 1,01^12 + 200 × (1,01^12 − 1) ÷ 0,01
    const esperado = 1000 * 1.01 ** 12 + 200 * (1.01 ** 12 - 1) / 0.01;   // 3.663,33
    esperarReais(await page.locator('#calc-total').textContent(), esperado, 0.01, 'valor final');
    esperarReais(esperado, 3663.33, 0.01, 'conta de referência');
    // a convenção precisa estar escrita na página
    await expect(page.locator('#calculadora')).toContainText(/fim de cada mês/i);
    semErros(erros);
  });
});

test.describe('simulador-renda-fixa', () => {
  test('calculo: R$ 10.000 por 2 anos, CDB 100% e LCI 90% (LCI é a melhor)', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/simulador-renda-fixa.html');
    await preencher(page, '#valor-inicial', '10000');
    await preencher(page, '#aporte', '0');
    await preencher(page, '#prazo', '2');
    await escolher(page, '#prazo-unidade', 'anos');
    await preencher(page, '#pct-cdb', '100');
    await preencher(page, '#pct-lci', '90');
    const [p, c, l, t] = await Promise.all(['Poupança', 'CDB', 'LCI/LCA', 'Tesouro Selic'].map(n => card(page, n)));
    esperarReais(p.valor, 11271.60, 0.01, 'Poupança');
    esperarReais(c.valor, 12482.72, 0.01, 'CDB');
    esperarReais(l.valor, 12611.92, 0.01, 'LCI/LCA');
    esperarReais(t.valor, 12463.38, 5, 'Tesouro Selic (tolerância R$ 5: depende da data)');
    expect(l.destaque, 'LCI marcada como melhor opção').toBe(true);
    await expect(page.locator('#taxas-status')).toContainText('Banco Central');
    semErros(erros);
  });
});

test.describe('poupanca-x-cdb-x-tesouro', () => {
  // Conta à mão (02/10/2026 + 2 anos = 731 dias corridos, 2028 é bissexto):
  //  poupança: 10.000 × 1,005^24 (Selic > 8,5% → 0,5% ao mês, isenta)        = 11.271,60
  //  CDB 100% do CDI: bruto 10.000 × 1,1365^(731/365); IR 15% (mais de 720 dias) sobre o ganho
  //  perda = CDB líquido − poupança
  test('calculo: R$ 10.000 por 2 anos → perda na poupança = CDB líquido − poupança', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/poupanca-x-cdb-x-tesouro.html');
    await preencher(page, '#valor', '10000');
    await preencher(page, '#prazo', '2');
    await escolher(page, '#prazo-unidade', 'anos');
    const poup = 10000 * 1.005 ** 24;
    const cdbBruto = 10000 * 1.1365 ** (731 / 365);
    const cdb = cdbBruto - (cdbBruto - 10000) * 0.15;
    esperarReais((await card(page, 'Poupança')).valor, poup, 0.01, 'poupança');
    esperarReais((await card(page, 'CDB 100% do CDI')).valor, cdb, 0.01, 'CDB líquido');
    const frase = await page.locator('#veredito').textContent();
    expect(frase).toContain('você perde');
    esperarReais(frase.split('você perde')[1], cdb - poup, 0.01, 'perda');
    semErros(erros);
  });
});

test.describe('viver-de-renda', () => {
  test('calculo: R$ 5.000/mês a 0,5% a.m. → para sempre 1.000.000,00; 30 anos ≈ 833.958', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/viver-de-renda.html');
    await preencher(page, '#renda', '5000');
    await escolher(page, '#taxa-periodo', 'am');
    await preencher(page, '#taxa', '0,5'.replace(',', '.'));
    await preencher(page, '#anos', '30');
    esperarReais((await card(page, 'Renda para sempre')).valor, 1000000, 0.01, 'para sempre');
    // 5.000 × (1 − 1,005^−360) ÷ 0,005
    esperarReais((await card(page, 'Gastando em 30 anos')).valor, 5000 * (1 - 1.005 ** -360) / 0.005, 0.01, 'gastando em 30 anos');
    esperarReais((await card(page, 'Gastando em 30 anos')).valor, 833958, 1, '≈ 833.958');
    semErros(erros);
  });
});

test.describe('dividendos-e-preco-teto', () => {
  test('calculo: dividendos R$ 1,20 e yield 6% → preço teto R$ 20,00', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/dividendos-e-preco-teto.html');
    await preencher(page, '#dividendos', '1,20');
    await preencher(page, '#yield', '6');
    esperarReais((await card(page, 'Preço teto')).valor, 20, 0.01, 'preço teto');
    semErros(erros);
  });
  // Conta à mão: cotação R$ 16 → margem (20 − 16) ÷ 20 = 20%; dividend yield 1,20 ÷ 16 = 7,5%.
  // Renda de R$ 1.000/mês = 12.000/ano ÷ 1,20 por ação = 10.000 ações × R$ 16 = R$ 160.000.
  test('calculo: cotação R$ 16 e renda R$ 1.000/mês → margem 20%, 10.000 ações, R$ 160.000', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/dividendos-e-preco-teto.html');
    await preencher(page, '#dividendos', '1,20');
    await preencher(page, '#yield', '6');
    await preencher(page, '#cotacao', '16');
    await preencher(page, '#renda', '1000');
    const c = await card(page, 'Cotação de hoje');
    expect(c.valor).toBe('20,0%');
    expect(c.linhas['Dividend yield nesse preço']).toBe('7,50%');
    const r = await card(page, 'Renda de');
    expect(r.valor).toBe('10.000 ações');
    esperarReais(r.linhas['Investimento necessário'], 160000, 0.01, 'investimento');
    semErros(erros);
  });
});

test.describe('rentabilidade-real', () => {
  test('calculo: 13,65% nominal e 4,22% de inflação → ≈ 9,05% real (Fisher)', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/rentabilidade-real.html');
    await preencher(page, '#nominal', '13.65');
    await preencher(page, '#inflacao', '4.22');
    const c = await card(page, 'Rentabilidade real');
    expect(c.valor).toBe('+9,05%');
    expect(Math.abs(numero(c.valor) - ((1.1365 / 1.0422 - 1) * 100))).toBeLessThan(0.005);
    semErros(erros);
  });
});

test.describe('conversor-de-taxas', () => {
  test('calculo: 1% a.m. → 12,68% a.a.; 12% a.a. → 0,9489% a.m.', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/conversor-de-taxas.html');
    await preencher(page, '#valor', '1');
    await escolher(page, '#de', 'am');
    await escolher(page, '#para', 'aa');
    expect(await page.locator('#resultado').textContent()).toMatch(/^12,68\d*% ao ano$/);
    await preencher(page, '#valor', '12');
    await escolher(page, '#de', 'aa');
    await escolher(page, '#para', 'am');
    expect(await page.locator('#resultado').textContent()).toBe('0,9489% ao mês');
    semErros(erros);
  });
});
