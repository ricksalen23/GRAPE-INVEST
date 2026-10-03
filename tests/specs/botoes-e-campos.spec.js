// Botões (copiar, compartilhar, PDF, PNG, imprimir, WhatsApp) e a máscara de R$ dos campos de dinheiro.
// Nada é aberto de verdade: downloads são capturados, links do WhatsApp são lidos, a impressão é interceptada.
const { test, expect } = require('@playwright/test');
const { abrir, preencher, demonstrativo, numero, semErros } = require('../helpers');

test.describe('geral', () => {
  // campoBRL: qualquer jeito de digitar 1.500,50 tem que dar R$ 1.500,50
  const entradas = [
    ['1500.50', 'de uma vez, com ponto (preenchimento automático, ditado)'],
    ['1500,50', 'de uma vez, com vírgula'],
    ['1.500,50', 'com separador de milhar'],
    ['1500.5', 'ponto com uma casa']
  ];
  for (const [v, como] of entradas) {
    test(`robustez: campo de R$ entende "${v}" (${como}) como 1.500,50`, async ({ page }) => {
      const erros = await abrir(page, '/ferramentas/salario-liquido.html');
      await page.locator('#bruto').fill(v);
      expect(numero((await demonstrativo(page, '#cascata'))['Salário bruto'])).toBe(1500.5);
      semErros(erros);
    });
  }
  test('robustez: campo de R$ digitado tecla a tecla ("1500.50") também dá 1.500,50', async ({ page }) => {
    await abrir(page, '/ferramentas/salario-liquido.html');
    await page.locator('#bruto').fill('');
    await page.locator('#bruto').pressSequentially('1500.50');
    expect(await page.locator('#bruto').inputValue()).toBe('1.500,50');
  });
});

test.describe('gerador-qr-code-pix', () => {
  test('botoes: copiar, baixar PNG e WhatsApp com o código certo', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const erros = await abrir(page, '/ferramentas/gerador-qr-code-pix.html');
    await page.locator('input[name=tipo][value=email]').check();
    await preencher(page, '#chave', 'teste@warden.com.br'); await page.locator('#chave').blur();
    await preencher(page, '#nome', 'Warden Finance');
    await preencher(page, '#cidade', 'Sao Paulo');
    await preencher(page, '#valor', '150,00');
    const payload = await page.locator('#copia-cola').inputValue();
    // copiar
    await page.locator('#btn-copiar').click();
    await expect(page.locator('#btn-copiar')).toHaveText('Copiado!');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(payload);
    // baixar PNG
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-baixar').click()]);
    expect(download.suggestedFilename()).toBe('qrcode-pix-150-00.png');
    // WhatsApp: link sem número, com o código copia e cola
    const href = await page.locator('#btn-whatsapp').getAttribute('href');
    expect(href.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(href.split('text=')[1])).toContain(payload);
    semErros(erros);
  });
});

test.describe('custo-real-em-horas', () => {
  test('botoes: compartilhar copia a frase pronta com o link da página', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const erros = await abrir(page, '/ferramentas/custo-real-em-horas.html');
    await preencher(page, '#item', 'um celular');
    await preencher(page, '#preco', '3000');
    await page.locator('#btn-compartilhar').click();
    await expect(page.locator('#status')).toContainText('Frase copiada');
    const copiado = await page.evaluate(() => navigator.clipboard.readText());
    expect(copiado).toContain('Um celular de R$');
    expect(copiado).toContain('https://wardenfinance.com.br/ferramentas/custo-real-em-horas.html');
    semErros(erros);
  });
});

test.describe('gerador-de-recibo', () => {
  test('botoes: PDF baixa com nome certo e imprimir manda só o recibo', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/gerador-de-recibo.html');
    await expect(page.locator('#btn-pdf')).toBeDisabled();
    await preencher(page, '#rec-nome', 'Ana Souza');
    await preencher(page, '#rec-doc', '52998224725');
    await preencher(page, '#pag-nome', 'Padaria Pão Bom');
    await preencher(page, '#valor', '1234,56');
    await preencher(page, '#referente', 'criação de logotipo');
    await preencher(page, '#cidade', 'São Paulo');
    await preencher(page, '#data', '2026-10-02');
    await expect(page.locator('#btn-pdf')).toBeEnabled();
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-pdf').click()]);
    expect(download.suggestedFilename()).toBe('recibo-padaria-pao-bom-2026-10-02.pdf');
    const conteudo = await (await download.createReadStream()).toArray();
    expect(Buffer.concat(conteudo).toString('latin1').startsWith('%PDF')).toBe(true);
    // imprimir: intercepta window.print e confere o que estaria na folha
    await page.evaluate(() => { window.print = () => { window.__impresso = document.querySelector('.tool-impressao') && document.querySelector('.tool-impressao').innerText; }; });
    await page.locator('#btn-imprimir').click();
    const impresso = await page.evaluate(() => window.__impresso);
    expect(impresso).toContain('RECIBO');
    expect(impresso).toContain('mil duzentos e trinta e quatro reais');
    semErros(erros);
  });
});

test.describe('gerador-de-orcamento', () => {
  test('botoes: PDF baixa e WhatsApp leva o resumo do orçamento', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/gerador-de-orcamento.html');
    await preencher(page, '#pre-nome', 'Ana Design');
    await preencher(page, '#cli-nome', 'Padaria');
    const l = page.locator('.oc-item').first();
    await l.locator('.i-desc').fill('Logotipo'); await l.locator('.i-qtd').fill('1'); await l.locator('.i-valor').fill('1200');
    const href = await page.locator('#btn-whatsapp').getAttribute('href');
    const msg = decodeURIComponent(href.split('text=')[1]);
    expect(msg).toContain('*Orçamento nº 0001* · Ana Design');
    expect(msg).toContain('*Total: R$');
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-pdf').click()]);
    expect(download.suggestedFilename()).toBe('orcamento-0001.pdf');
    // o número foi registrado: recarregando, o próximo é 0002
    await page.reload(); await page.waitForLoadState('load');
    await expect(page.locator('#numero')).toHaveValue('0002');
    semErros(erros);
  });
});

test.describe('simulador-renda-fixa', () => {
  test('botoes: editar taxas muda o cálculo e "restaurar" volta às taxas do dia', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/simulador-renda-fixa.html');
    const antes = await page.locator('#resultados').innerText();
    await page.locator('#taxas-editar').click();
    await page.locator('#taxa-cdi').fill('10');
    expect(await page.locator('#resultados').innerText()).not.toBe(antes);
    await page.locator('#taxas-editar').click();
    await page.locator('#taxas-restaurar').click();
    expect(await page.locator('#resultados').innerText()).toBe(antes);
    semErros(erros);
  });
});

test.describe('plano-de-quitacao', () => {
  test('botoes: adicionar e remover dívidas (a última não pode ser removida)', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/plano-de-quitacao.html');
    const n = await page.locator('.pq-divida').count();
    await page.locator('#btn-add').click();
    await expect(page.locator('.pq-divida')).toHaveCount(n + 1);
    while (await page.locator('.pq-divida').count() > 1) await page.locator('.tool-remover').last().click();
    await expect(page.locator('.tool-remover')).toBeDisabled();
    semErros(erros);
  });
});
