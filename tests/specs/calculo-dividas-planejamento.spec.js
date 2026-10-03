// Testes de cálculo: Dívidas e consumo + Planejamento.
const { test, expect } = require('@playwright/test');
const { abrir, preencher, escolher, card, numero, esperarReais, semErros } = require('../helpers');

test.describe('sac-x-price', () => {
  test('calculo: 10.000 a 1% a.m. em 12x → Price 888,49 (juros 661,85); SAC 933,33 → 841,67 (juros 650,00)', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/sac-x-price.html');
    await preencher(page, '#valor', '10000');
    await preencher(page, '#juros', '1');
    await escolher(page, '#juros-periodo', 'am');
    await preencher(page, '#prazo', '12');
    const p = await card(page, 'Tabela Price'), s = await card(page, 'SAC');
    esperarReais(p.valor, 888.49, 0.01, 'parcela Price');
    esperarReais(p.linhas['Juros totais'], 661.85, 0.01, 'juros Price');
    esperarReais(s.linhas['Primeira parcela'], 933.33, 0.01, '1ª SAC');
    esperarReais(s.linhas['Última parcela'], 841.67, 0.01, 'última SAC');
    esperarReais(s.linhas['Juros totais'], 650, 0.01, 'juros SAC');
    semErros(erros);
  });
});

test.describe('a-vista-ou-parcelado', () => {
  test('calculo: 1.100 à vista x 12 de 100 (1ª em 1 mês) a 1% a.m. → VP 1.125,51, à vista vence', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/a-vista-ou-parcelado.html');
    await page.locator('input[name=modo][value=valor]').check();
    await preencher(page, '#avista', '1100');
    await preencher(page, '#n', '12');
    await preencher(page, '#parcela', '100');
    await page.locator('input[name=primeira][value="1"]').check();
    await escolher(page, '#rendimento', 'outra');
    await preencher(page, '#taxa', '1');
    await escolher(page, '#taxa-unidade', 'am');
    await page.locator('#taxa-ir').uncheck();
    esperarReais((await card(page, 'Parcelado')).valor, 1125.51, 0.01, 'valor presente');
    await expect(page.locator('#veredito')).toContainText('Pague à vista');
    semErros(erros);
  });
});

test.describe('consorcio-x-financiamento', () => {
  test('calculo: carta 100.000, adm 15%, fundo 2%, 100 meses → parcela 1.170,00', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/consorcio-x-financiamento.html');
    await preencher(page, '#valor', '100000');
    await preencher(page, '#prazo', '100');
    await preencher(page, '#adm', '15');
    await preencher(page, '#fundo', '2');
    esperarReais((await card(page, 'Consórcio')).valor, 1170, 0.01, 'parcela do consórcio');
    semErros(erros);
  });
});

test.describe('juros-do-cartao', () => {
  for (const taxa of ['3', '14', '30', '100']) {
    test(`calculo: com ${taxa}% a.m., juros + encargos nunca passam de 100% da dívida original`, async ({ page }) => {
      const erros = await abrir(page, '/ferramentas/juros-do-cartao.html');
      await preencher(page, '#fatura', '2000');
      await preencher(page, '#pago', '300');
      await preencher(page, '#juros', taxa);
      const original = 1700;
      const dividas = await page.locator('#tabela tr td:nth-child(3)').allTextContents();
      expect(dividas.length).toBe(12);
      for (const d of dividas) expect(numero(d), `mês com dívida ${d}`).toBeLessThanOrEqual(original * 2 + 0.005);
      expect(numero((await card(page, 'Em 12 meses')).valor)).toBeLessThanOrEqual(original * 2 + 0.005);
      semErros(erros);
    });
  }
});

test.describe('custo-real-em-horas', () => {
  test('calculo: renda 3.000, 220h, preço 1.000 → ≈ 73,3 horas', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/custo-real-em-horas.html');
    await preencher(page, '#renda', '3000');
    await preencher(page, '#horas', '220');
    await preencher(page, '#preco', '1000');
    // 1.000 ÷ (3.000 ÷ 220) = 73,33 horas
    expect((await card(page, 'Em tempo')).valor).toBe('73,3');
    semErros(erros);
  });
});

test.describe('plano-de-quitacao', () => {
  // Conta à mão: uma dívida de 1.000 a 10% a.m., parcela mínima 0, pagando 600 por mês.
  //  mês 1: 1.000 + 100 de juros = 1.100 − 600 = 500;  mês 2: 500 + 50 = 550 − 550 = 0.
  //  livre em 2 meses, juros 150,00, total pago 1.150,00 (as duas estratégias empatam com uma dívida só).
  test('calculo: 1.000 a 10% a.m. pagando 600/mês → 2 meses, juros 150, total 1.150', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/plano-de-quitacao.html');
    // deixa uma linha só
    while (await page.locator('.pq-divida').count() > 1) await page.locator('.tool-remover').last().click();
    const l = page.locator('.pq-divida').first();
    await l.locator('.d-nome').fill('Cartão');
    await l.locator('.d-saldo').fill('1000');
    await l.locator('.d-juros').fill('10');
    await l.locator('.d-min').fill('0');
    await preencher(page, '#orcamento', '600');
    const a = await card(page, 'Avalanche');
    expect(a.linhas['Tempo']).toBe('2 meses');
    esperarReais(a.linhas['Juros pagos'], 150, 0.01, 'juros');
    esperarReais(a.linhas['Total pago'], 1150, 0.01, 'total pago');
    semErros(erros);
  });
  // Conta à mão: 1.000 a 10% a.m. gera 100 de juros no 1º mês; pagando 100 a dívida nunca cai → aviso forte.
  test('calculo: pagamento que não cobre os juros → aviso claro e sem resultado', async ({ page }) => {
    await abrir(page, '/ferramentas/plano-de-quitacao.html');
    while (await page.locator('.pq-divida').count() > 1) await page.locator('.tool-remover').last().click();
    const l = page.locator('.pq-divida').first();
    await l.locator('.d-saldo').fill('1000'); await l.locator('.d-juros').fill('10'); await l.locator('.d-min').fill('0');
    await preencher(page, '#orcamento', '100');
    await expect(page.locator('#alerta-texto')).toContainText('não cobre nem os juros');
    await expect(page.locator('#pq-resultado')).toBeHidden();
  });
});

test.describe('regra-50-30-20', () => {
  test('calculo: renda 5.000 → 2.500 / 1.500 / 1.000', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/regra-50-30-20.html');
    await preencher(page, '#renda', '5000');
    esperarReais((await card(page, 'Necessidades')).valor, 2500, 0.01, 'necessidades');
    esperarReais((await card(page, 'Desejos')).valor, 1500, 0.01, 'desejos');
    esperarReais((await card(page, 'Futuro')).valor, 1000, 0.01, 'futuro');
    semErros(erros);
  });
});

test.describe('meta-mensal', () => {
  test('calculo: 20.000 em 24 meses a 1% a.m. fixo, do zero → 741,47', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/meta-mensal.html');
    await preencher(page, '#meta', '20000');
    await preencher(page, '#prazo', '24');
    await escolher(page, '#prazo-unidade', 'meses');
    await preencher(page, '#atual', '');
    await escolher(page, '#rendimento', 'outra');
    await preencher(page, '#taxa', '1');
    await escolher(page, '#taxa-unidade', 'am');
    await page.locator('#taxa-ir').uncheck();
    esperarReais((await card(page, 'Guardar por mês')).valor, 741.47, 0.01, 'aporte');
    semErros(erros);
  });
});

test.describe('aposentadoria', () => {
  test('calculo: renda 5.000 e retirada 4% → patrimônio 1.500.000,00', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/aposentadoria.html');
    await preencher(page, '#renda', '5000');
    await preencher(page, '#retirada', '4');
    esperarReais((await card(page, 'Patrimônio necessário')).valor, 1500000, 0.01, 'patrimônio');
    semErros(erros);
  });
});

test.describe('reserva-de-emergencia', () => {
  // Conta à mão: gastos 3.000, CLT (6 meses) → reserva 18.000; guardado 2.000 → falta 16.000.
  // Por mês: 100% do CDI (13,65% a.a. → (1,1365)^(1/12) − 1 ao mês) líquido de IR de 17,5% (12 meses = 365 dias),
  // i = 0,0107194 × 0,825; aporte = (18.000 − 2.000 × (1+i)^12) × i ÷ ((1+i)^12 − 1) ≈ 1.252,03.
  test('calculo: gastos 3.000, CLT, guardado 2.000, 12 meses → reserva 18.000, falta 16.000, ≈ 1.252,03/mês', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/reserva-de-emergencia.html');
    await page.locator('input[name=perfil][value="6"]').check();
    await preencher(page, '#gastos', '3000');
    await preencher(page, '#guardado', '2000');
    await preencher(page, '#prazo', '12');
    const i = (1.1365 ** (1 / 12) - 1) * (1 - 0.175), f = (1 + i) ** 12;
    esperarReais((await card(page, 'Reserva ideal')).valor, 18000, 0.01, 'reserva');
    esperarReais((await card(page, 'Quanto falta')).valor, 16000, 0.01, 'falta');
    esperarReais((await card(page, 'Guardar por mês')).valor, (18000 - 2000 * f) * i / (f - 1), 0.01, 'por mês');
    semErros(erros);
  });
});
