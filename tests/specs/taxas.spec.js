// Taxas do Banco Central quando a API oficial (SGS) falha:
// plano B no site do BC (Selic e IPCA; CDI estimado = Selic − 0,10), último valor bom de até 7 dias e, por fim,
// o valor de referência — as páginas avisam de onde veio cada taxa e não quebram.
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
  test('taxas: só o plano B responde → simulador usa Selic e IPCA do site do BC e CDI estimado (Selic − 0,10), e diz isso', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/simulador-renda-fixa.html', { taxas: 'site' });
    await expect(page.locator('#v-selic')).toHaveText('13,25%');
    await expect(page.locator('#v-cdi')).toHaveText('13,15%');
    await expect(page.locator('#v-ipca')).toHaveText('4,10%');
    await expect(page.locator('#d-cdi')).toHaveText('estimado: Selic − 0,10');
    await expect(page.locator('#d-ipca')).toHaveText('acumulado em 12 meses');
    await expect(page.locator('#taxas-status')).toContainText('Fonte: Banco Central · atualizado em 02/10/2026');
    await expect(page.locator('#taxas-status')).toContainText('CDI estimado pela Selic menos 0,10 ponto');
    semErros(erros);
  });

  test('taxas: só o plano B responde → reserva diz que o CDI é estimado; rentabilidade real usa o IPCA do site', async ({ page }) => {
    let erros = await abrir(page, '/ferramentas/reserva-de-emergencia.html', { taxas: 'site' });
    await expect(page.locator('#res-obs')).toContainText('13,15% ao ano, estimado pela Selic do Banco Central menos 0,10 ponto, atualizado em 02/10/2026');
    semErros(erros);
    erros = await abrir(page, '/ferramentas/rentabilidade-real.html', { taxas: 'site' });
    await expect(page.locator('#inflacao')).toHaveValue('4.1');
    await expect(page.locator('#inflacao-dica')).toHaveText('IPCA de 12 meses (Banco Central, 02/10/2026) · pode mudar');
    semErros(erros);
  });

  test('taxas: BC todo fora do ar → usa o último valor bom por até 7 dias (com a data); depois, o valor de referência', async ({ page }) => {
    // dia 1: API oficial responde (valores ficam guardados)
    let erros = await abrir(page, '/ferramentas/simulador-renda-fixa.html', { taxas: 'site' });
    await expect(page.locator('#v-selic')).toHaveText('13,25%');
    semErros(erros);
    // dias depois: SGS e site do BC fora do ar; o cache de 12h some
    await page.route('**/www.bcb.gov.br/**', route => route.abort());
    await page.evaluate(() => localStorage.removeItem('warden:taxas-bcb'));
    await page.clock.setFixedTime(new Date('2026-10-08T12:00:00-03:00'));   // 6 dias depois
    await page.goto('/ferramentas/simulador-renda-fixa.html');
    await expect(page.locator('#v-selic')).toHaveText('13,25%');
    await expect(page.locator('#v-ipca')).toHaveText('4,10%');
    await expect(page.locator('#v-cdi')).toHaveText('13,15%');   // estimado a partir da Selic guardada
    await expect(page.locator('#taxas-status')).toContainText('atualizado em 02/10/2026 (último valor obtido');
    await page.goto('/ferramentas/reserva-de-emergencia.html');
    await expect(page.locator('#res-obs')).toContainText('estimado pela Selic do Banco Central');
    await page.clock.setFixedTime(new Date('2026-10-10T12:00:00-03:00'));   // 8 dias depois: passou da validade
    await page.goto('/ferramentas/simulador-renda-fixa.html');
    await expect(page.locator('#taxas-status')).toContainText('Valores de referência');
    await expect(page.locator('#v-selic')).toHaveText('13,75%');
  });
});
