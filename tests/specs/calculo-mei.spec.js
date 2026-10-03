// Testes de cálculo: MEI e autônomo (quanto cobrar, markup, ponto de equilíbrio, recibo, Pix, orçamento).
const { test, expect } = require('@playwright/test');
const { abrir, preencher, card, esperarReais, semErros } = require('../helpers');

// CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF), escrito de novo aqui, independente do código da página
function crc16(texto) {
  let crc = 0xFFFF;
  for (const byte of Buffer.from(texto, 'latin1')) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

test.describe('quanto-cobrar-por-hora', () => {
  test('calculo: 5.000 + 1.000 de custos, 20 dias × 6h, 100% faturável, 0 férias → R$ 50,00/h', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/quanto-cobrar-por-hora.html');
    await preencher(page, '#renda', '5000');
    await preencher(page, '#custos', '1000');
    await preencher(page, '#dias', '20');
    await preencher(page, '#horas', '6');
    await preencher(page, '#faturavel', '100');
    await preencher(page, '#ferias', '0');
    esperarReais((await card(page, 'Por hora')).valor, 50, 0.01, 'valor por hora');
    semErros(erros);
  });
});

test.describe('markup-e-margem', () => {
  test('calculo: custo 100, margem 30%, demais 0% → preço 142,86 e markup 1,4286', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/markup-e-margem.html');
    await preencher(page, '#custo', '100');
    await preencher(page, '#margem', '30');
    for (const id of ['#impostos', '#taxas', '#comissao']) await preencher(page, id, '0');
    const c = await card(page, 'Preço de venda');
    esperarReais(c.valor, 142.86, 0.01, 'preço');
    expect(c.linhas['Markup (multiplicador)']).toBe('1,4286');
    semErros(erros);
  });
});

test.describe('ponto-de-equilibrio', () => {
  test('calculo: fixos 5.000, preço 100, variável 60 → 125 unidades e R$ 12.500,00', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/ponto-de-equilibrio.html');
    await preencher(page, '#fixos', '5000');
    await preencher(page, '#preco', '100');
    await preencher(page, '#variavel', '60');
    const c = await card(page, 'Ponto de equilíbrio');
    expect(c.valor).toBe('125 unidades');
    esperarReais(c.linhas['Em faturamento'], 12500, 0.01, 'faturamento');
    semErros(erros);
  });
});

test.describe('gerador-de-recibo', () => {
  const casos = [
    ['1234,56', 'mil duzentos e trinta e quatro reais e cinquenta e seis centavos'],
    ['1,00', 'um real'],
    ['0,50', 'cinquenta centavos'],
    ['1000000', 'um milhão de reais'],
    ['2,01', 'dois reais e um centavo']
  ];
  for (const [valor, extenso] of casos) {
    test(`calculo: extenso de ${valor} → "${extenso}"`, async ({ page }) => {
      const erros = await abrir(page, '/ferramentas/gerador-de-recibo.html');
      await preencher(page, '#valor', valor);
      await expect(page.locator('#extenso')).toHaveText(extenso);
      semErros(erros);
    });
  }
});

test.describe('gerador-qr-code-pix', () => {
  async function gerar(page, { tipo, chave, nome, cidade, valor, descricao = '' }) {
    await page.locator(`input[name=tipo][value="${tipo}"]`).check();
    await preencher(page, '#chave', chave);
    await page.locator('#chave').blur();
    await preencher(page, '#nome', nome);
    await preencher(page, '#cidade', cidade);
    await preencher(page, '#valor', valor);
    await preencher(page, '#descricao', descricao);
    await page.locator('#descricao').blur();
    return page.locator('#copia-cola').inputValue();
  }
  test('calculo: e-mail teste@warden.com.br, R$ 150 → CRC confere com recálculo independente', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/gerador-qr-code-pix.html');
    const payload = await gerar(page, { tipo: 'email', chave: 'teste@warden.com.br', nome: 'WARDEN FINANCE', cidade: 'SAO PAULO', valor: '150,00' });
    expect(payload).toBe('00020126410014br.gov.bcb.pix0119teste@warden.com.br5204000053039865406150.005802BR5914WARDEN FINANCE6009SAO PAULO62070503***6304' + crc16(payload.slice(0, -4)));
    expect(payload.slice(-4)).toBe('5B94');
    semErros(erros);
  });
  test('calculo: CPF 71260055124, IAN JOSE, PALESTINA, R$ 1,00, descrição fth → CRC E9B5', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/gerador-qr-code-pix.html');
    const payload = await gerar(page, { tipo: 'cpf', chave: '71260055124', nome: 'IAN JOSE', cidade: 'PALESTINA', valor: '1,00', descricao: 'fth' });
    expect(crc16(payload.slice(0, -4)), 'CRC recalculado fora da página').toBe(payload.slice(-4));
    expect(payload.slice(-4), 'payload: ' + payload).toBe('E9B5');
    semErros(erros);
  });
});

test.describe('gerador-de-orcamento', () => {
  // Conta à mão: 1 × 1.200 + 2 × 150 = 1.500; desconto 10% = 150 → total 1.350,00
  // ("mil trezentos e cinquenta reais"); emitido em 02/10/2026 com validade de 15 dias → 17/10/2026.
  test('calculo: 1.200 + 2 × 150 com 10% de desconto → total 1.350,00, válido até 17/10/2026', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/gerador-de-orcamento.html');
    await preencher(page, '#pre-nome', 'Ana Design');
    await preencher(page, '#cli-nome', 'Padaria');
    const l1 = page.locator('.oc-item').nth(0);
    await l1.locator('.i-desc').fill('Logotipo'); await l1.locator('.i-qtd').fill('1'); await l1.locator('.i-valor').fill('1200');
    await page.locator('#btn-add').click();
    const l2 = page.locator('.oc-item').nth(1);
    await l2.locator('.i-desc').fill('Cartão de visita'); await l2.locator('.i-qtd').fill('2'); await l2.locator('.i-valor').fill('150');
    await preencher(page, '#desconto', '10');
    await preencher(page, '#validade', '15');
    esperarReais(await page.locator('#t-sub').textContent(), 1500, 0.01, 'subtotal');
    esperarReais(await page.locator('#t-total').textContent(), 1350, 0.01, 'total');
    await expect(page.locator('.oc-papel-extenso')).toHaveText('mil trezentos e cinquenta reais');
    await expect(page.locator('#validade-dica')).toHaveText('Válido até 17/10/2026');
    semErros(erros);
  });
});
