// Utilidades compartilhadas pelos testes.
const { expect } = require('@playwright/test');

// Taxas fixas injetadas no lugar da API do Banco Central (resultados iguais todos os dias)
const TAXAS = { selic: 13.75, cdi: 13.65, ipca: 4.22 };
const SERIES = { 432: TAXAS.selic, 4389: TAXAS.cdi, 13522: TAXAS.ipca };   // códigos SGS usados pelo kit
// Data fixa do relógio do navegador: os simuladores contam prazos a partir de "hoje"
const DATA_FIXA = new Date('2026-10-02T12:00:00-03:00');
const CORS = { 'access-control-allow-origin': '*' };

// hosts externos cujas mensagens/falhas não são erro do site (fontes do Google, widget de gráfico da home)
const HOSTS_TOLERADOS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'tradingview.com', 'tradingview-widget.com'];

/**
 * Prepara a página antes de abrir: relógio fixo, API do BC com taxas fixas (ou bloqueada),
 * cotações e notícias da home com dados fixos, e coleta de erros do console.
 * @param {'fixas'|'bloqueada'} taxas
 * @returns {string[]} lista viva de erros (pageerror + console.error)
 */
async function preparar(page, { taxas = 'fixas', data = DATA_FIXA } = {}) {
  const erros = [];
  page.on('pageerror', e => {
    // erros lançados pelo próprio widget de terceiros (ex.: 'Loading chunk failed' do TradingView com internet lenta)
    if (HOSTS_TOLERADOS.some(h => (e.message + ' ' + (e.stack || '')).includes(h))) return;
    erros.push('erro de JS: ' + e.message);
  });
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const url = (m.location() && m.location().url) || '';
    if (HOSTS_TOLERADOS.some(h => url.includes(h))) return;
    if (taxas === 'bloqueada' && /net::ERR_FAILED/.test(m.text())) return;   // a própria API bloqueada de propósito
    erros.push('console: ' + m.text() + (url ? ` (${url})` : ''));
  });
  await page.clock.setFixedTime(data);

  await page.route('**/api.bcb.gov.br/**', route => {
    if (taxas === 'bloqueada') return route.abort();
    const serie = (route.request().url().match(/sgs\.(\d+)/) || [])[1];
    return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS,
      body: JSON.stringify([{ data: '01/10/2026', valor: String(SERIES[serie]) }]) });
  });
  // home: cotações e notícias (APIs de terceiros) com respostas fixas
  await page.route('**/economia.awesomeapi.com.br/**', route => route.fulfill({ status: 200, contentType: 'application/json', headers: CORS,
    body: JSON.stringify({
      USDBRL: { bid: '5.40', pctChange: '0.50', high: '5.45', low: '5.35' },
      EURBRL: { bid: '6.10', pctChange: '-0.20', high: '6.15', low: '6.05' },
      BTCBRL: { bid: '350000', pctChange: '1.20', high: '355000', low: '345000' }
    }) }));
  await page.route('**/api.rss2json.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', headers: CORS,
    body: JSON.stringify({ status: 'ok', items: [] }) }));
  return erros;
}

// abre a página e espera o kit montar tudo (trilha, componentes) e as taxas chegarem
async function abrir(page, url, opcoes) {
  const erros = await preparar(page, opcoes);
  await page.goto(url);
  // a home tem um widget de gráfico que nunca para de usar a rede: espera no máximo 10 s pelo "silêncio"
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  return erros;
}

// "R$ 1.234,56" / "− R$ 10,00" / "12,68% ao ano" → número (o sinal de menos tipográfico conta)
function numero(texto) {
  const s = String(texto).replace(/\s/g, '');
  const neg = /^[−-]/.test(s);
  const m = s.replace(/[^\d,.]/g, '').replace(/\./g, '').replace(',', '.');
  const v = parseFloat(m);
  return neg ? -v : v;
}

// preenche um campo como uma pessoa (dispara input/change)
async function preencher(page, seletor, valor) {
  const el = page.locator(seletor);
  await el.fill(String(valor));
  await el.dispatchEvent('change');
}
async function escolher(page, seletor, valor) {
  await page.locator(seletor).selectOption(String(valor));
}

// lê um card de resultado pelo título: { valor, desc, linhas: { rótulo: valor } }
async function card(page, titulo) {
  return page.evaluate(t => {
    const c = [...document.querySelectorAll('.result-card')].find(x => x.querySelector('h3').textContent.trim().startsWith(t));
    if (!c) return null;
    const linhas = {};
    c.querySelectorAll('dl div').forEach(d => { linhas[d.querySelector('dt').textContent.trim()] = d.querySelector('dd').textContent.trim(); });
    return { valor: c.querySelector('.result-valor').textContent.trim(), desc: c.querySelector('.result-desc').textContent.trim(), linhas, destaque: c.classList.contains('destaque') };
  }, titulo);
}

// lê um demonstrativo (.tool-demo) como { rótulo: valor }
async function demonstrativo(page, seletor) {
  return page.evaluate(sel => {
    const r = {};
    document.querySelectorAll(sel + ' li').forEach(li => { r[li.querySelector('.rot').childNodes[0].textContent.trim()] = li.querySelector('.val').textContent.trim(); });
    return r;
  }, seletor);
}

// compara valores em reais com tolerância (padrão: 1 centavo)
function esperarReais(obtido, esperado, tolerancia = 0.01, rotulo = '') {
  const v = typeof obtido === 'number' ? obtido : numero(obtido);
  expect(Math.abs(v - esperado), `${rotulo}: esperado ${esperado}, obtido ${obtido}`).toBeLessThanOrEqual(tolerancia + 1e-9);
}

// sem erros no console
function semErros(erros) {
  expect(erros, 'erros no console:\n' + erros.join('\n')).toEqual([]);
}

module.exports = { TAXAS, DATA_FIXA, preparar, abrir, numero, preencher, escolher, card, demonstrativo, esperarReais, semErros };
