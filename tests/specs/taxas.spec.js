// API do Banco Central bloqueada e SEM injeção: as páginas usam o valor de referência, avisam e não quebram.
const { test, expect } = require('@playwright/test');
const { abrir, card, semErros } = require('../helpers');

test.describe('geral', () => {
  test('taxas: API do BC fora do ar → simulador mostra "valores de referência" e calcula normalmente', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/simulador-renda-fixa.html', { taxas: 'bloqueada' });
    await expect(page.locator('#taxas-status')).toContainText('Valores de referência');
    await expect(page.locator('#v-cdi')).not.toHaveText('—');
    const c = await card(page, 'CDB');
    expect(c.valor).toMatch(/^R\$\s[\d.]+,\d{2}$/);
    semErros(erros);
  });
  test('taxas: API do BC fora do ar → poupança x CDB e meta mostram que usaram a referência', async ({ page }) => {
    let erros = await abrir(page, '/ferramentas/poupanca-x-cdb-x-tesouro.html', { taxas: 'bloqueada' });
    await expect(page.locator('#pp-obs')).toContainText('valor de referência');
    semErros(erros);
    erros = await abrir(page, '/ferramentas/meta-mensal.html', { taxas: 'bloqueada' });
    await expect(page.locator('#meta-obs')).toContainText('valor de referência');
    semErros(erros);
  });
});
