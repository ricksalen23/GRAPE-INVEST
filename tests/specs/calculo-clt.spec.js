// Testes de cálculo: Trabalho (CLT). Tabelas de 2026 (assets/tabelas-2026.js).
const { test, expect } = require('@playwright/test');
const { abrir, preencher, escolher, card, demonstrativo, esperarReais, semErros } = require('../helpers');

test.describe('salario-liquido', () => {
  const casos = [
    // [bruto, INSS, IR devido, líquido]
    [4000, 368.60, 0, 3631.40],
    [6000, 641.51, 385.10, 4973.39],
    [10000, 988.09, 1569.55, 7442.36]
  ];
  for (const [bruto, inss, ir, liquido] of casos) {
    test(`calculo: R$ ${bruto} sem dependentes → INSS ${inss} | IR ${ir} | líquido ${liquido}`, async ({ page }) => {
      const erros = await abrir(page, '/ferramentas/salario-liquido.html');
      await preencher(page, '#bruto', String(bruto));
      await preencher(page, '#dependentes', '0');
      const d = await demonstrativo(page, '#cascata');
      esperarReais(d['INSS'], -inss, 0.01, 'INSS');
      esperarReais(d['Imposto de Renda'], -ir, 0.01, 'IR');
      esperarReais(d['Salário líquido'], liquido, 0.01, 'líquido');
      semErros(erros);
    });
  }
  test('calculo: R$ 6.000 → IR pela tabela 564,85 e redução 179,75', async ({ page }) => {
    await abrir(page, '/ferramentas/salario-liquido.html');
    await preencher(page, '#bruto', '6000');
    const d = await demonstrativo(page, '#cascata');
    esperarReais(d['IR pela tabela'], 564.85, 0.01, 'IR tabela');
    esperarReais(d['Redução de 2026'], -179.75, 0.01, 'redução');
  });
  test('calculo: 1 salário mínimo (R$ 1.621) → INSS 121,58', async ({ page }) => {
    await abrir(page, '/ferramentas/salario-liquido.html');
    await preencher(page, '#bruto', '1621');
    esperarReais((await demonstrativo(page, '#cascata'))['INSS'], -121.58, 0.01, 'INSS (1.621 × 7,5% = 121,575 → 121,58)');
  });
});

test.describe('decimo-terceiro', () => {
  test('calculo: R$ 4.000, 12 meses → 1ª parcela 2.000,00 | 2ª parcela 1.631,40', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/decimo-terceiro.html');
    await preencher(page, '#salario', '4000');
    await preencher(page, '#meses', '12');
    await preencher(page, '#dependentes', '0');
    esperarReais((await card(page, '1ª parcela')).valor, 2000, 0.01, '1ª parcela');
    esperarReais((await card(page, '2ª parcela')).valor, 1631.40, 0.01, '2ª parcela');
    semErros(erros);
  });
});

test.describe('ferias', () => {
  // Conta à mão, salário R$ 4.000, 30 dias, sem dependentes:
  //  férias 4.000 + 1/3 1.333,33 = 5.333,33
  //  INSS progressivo sobre 5.333,33: 121,575 + 115,3656 + 174,1716 + (5.333,33 − 4.354,27) × 14% = 548,18
  //  IR: dedução = maior entre simplificado 607,20 e INSS 548,18 → base 4.726,13 → × 27,5% − 908,73 = 390,96
  //  redução (bruto entre 5.000 e 7.350): 978,62 − 0,133145 × 5.333,33 = 268,51 → IR 122,45
  //  líquido = 5.333,33 − 548,18 − 122,45 = 4.662,70
  test('calculo: R$ 4.000, 30 dias → férias + 1/3 5.333,33, líquido 4.662,70', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/ferias.html');
    await preencher(page, '#salario', '4000');
    await preencher(page, '#dependentes', '0');
    await page.locator('input[name=modo][value="30"]').check();
    const d = await demonstrativo(page, '#demo');
    esperarReais(d['Férias (30 dias)'], 4000, 0.01, 'férias');
    esperarReais(d['1/3 constitucional'], 1333.33, 0.01, '1/3');
    esperarReais(d['INSS'], -548.18, 0.01, 'INSS');
    esperarReais(d['IR pela tabela'], 390.96, 0.01, 'IR tabela');
    esperarReais(d['Redução de 2026'], -268.51, 0.01, 'redução');
    esperarReais(d['Férias líquidas'], 4662.70, 0.01, 'líquido');
    semErros(erros);
  });
  // Vendendo 10 dias: 20 dias = 2.666,67 + 1/3 888,89 (com INSS e IR); abono 1.333,33 + 1/3 444,44 (sem impostos)
  test('calculo: vendendo 10 dias → abono 1.333,33 + 1/3 444,44 sem impostos', async ({ page }) => {
    await abrir(page, '/ferramentas/ferias.html');
    await preencher(page, '#salario', '4000');
    await page.locator('input[name=modo][value="abono"]').check();
    const d = await demonstrativo(page, '#demo');
    esperarReais(d['Férias (20 dias)'], 2666.67, 0.01, 'férias 20 dias');
    esperarReais(d['Abono pecuniário (10 dias)'], 1333.33, 0.01, 'abono');
    esperarReais(d['1/3 do abono'], 444.44, 0.01, '1/3 do abono');
  });
});

test.describe('hora-extra', () => {
  test('calculo: 2.200, 220h, 10h a 50%, 25 úteis, 5 domingos/feriados → 150,00 + DSR 30,00 = 180,00', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/hora-extra.html');
    await preencher(page, '#salario', '2200');
    await preencher(page, '#jornada', '220');
    await preencher(page, '#h50', '10');
    await preencher(page, '#h100', '0');
    await preencher(page, '#uteis', '25');
    await preencher(page, '#descansos', '5');
    esperarReais((await card(page, 'Valor da hora')).valor, 10, 0.01, 'valor da hora');
    const he = await card(page, 'Horas extras');
    esperarReais(he.valor, 150, 0.01, 'horas extras');
    esperarReais(he.linhas['Reflexo no DSR'], 30, 0.01, 'DSR');
    esperarReais((await card(page, 'Total a receber')).valor, 180, 0.01, 'total');
    semErros(erros);
  });
});

test.describe('rescisao', () => {
  test('calculo: sem justa causa, 3.000, 01/03/2024 a 30/09/2026, aviso indenizado', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/rescisao.html');
    await page.locator('input[name=tipo][value="sem-justa"]').check();
    await preencher(page, '#salario', '3000');
    await preencher(page, '#admissao', '2024-03-01');
    await preencher(page, '#desligamento', '2026-09-30');
    await escolher(page, '#aviso', 'indenizado');
    await page.locator('#vencidas').uncheck();
    const d = await demonstrativo(page, '#verbas');
    esperarReais(d['Aviso prévio indenizado (36 dias)'], 3600, 0.01, 'aviso 36 dias');
    esperarReais(d['13º proporcional (10/12)'], 2500, 0.01, '13º 10/12');
    esperarReais(d['Férias proporcionais (8/12)'], 2000, 0.01, 'férias 8/12');
    esperarReais(d['1/3 das férias proporcionais'], 666.67, 0.01, '1/3');
    esperarReais(d['Saldo de salário'], 3000, 0.01, 'saldo de salário');
    expect((await card(page, 'Seguro-desemprego')).valor).toBe('Sim');
    semErros(erros);
  });
});

test.describe('clt-x-pj', () => {
  // Conta à mão (salário 8.000, 0 dependentes, sem benefícios):
  //  mês: INSS 921,51; IR base 7.078,49 × 27,5% − 908,73 = 1.037,85 (sem redução, acima de 7.350) → líquido 6.040,64
  //  férias (8.000 + 1/3 = 10.666,67): INSS 988,09 (teto); IR base 9.678,58 → 1.752,88 → líquido 7.925,70
  //  13º 8.000 (tributação exclusiva): líquido 6.040,64
  //  FGTS 8% × (12 × 8.000 + 8.000 + 2.666,67) = 8.533,33
  //  pacote CLT = 11 × 6.040,64 + 7.925,70 + 6.040,64 + 8.533,33 = 88.946,71
  //  PJ 12.000: imposto 6% 720 + contador 300 + INSS 11% × 1.621 = 178,31 → líquido 10.801,69/mês = 129.620,28/ano
  //  empate: (88.946,71 ÷ 12 + 300 + 178,31) ÷ 0,94 = 8.394,19
  test('calculo: CLT 8.000 sem benefícios x PJ 12.000 → pacote 88.946,71, PJ 10.801,69/mês, empate 8.394,19', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/clt-x-pj.html');
    await preencher(page, '#salario', '8000');
    await preencher(page, '#dependentes', '0');
    for (const id of ['#vr', '#plano', '#outros']) await preencher(page, id, '');
    await preencher(page, '#faturamento', '12000');
    await preencher(page, '#imposto', '6');
    await preencher(page, '#contador', '300');
    await preencher(page, '#prolabore', '1621');
    await preencher(page, '#inss', '11');
    esperarReais((await card(page, 'Pacote CLT')).linhas['No ano'], 88946.71, 0.02, 'pacote CLT no ano');
    esperarReais((await card(page, 'PJ')).valor, 10801.69, 0.01, 'PJ líquido por mês');
    esperarReais((await card(page, 'Faturamento que empata')).valor, 8394.19, 0.02, 'empate');
    semErros(erros);
  });
});
