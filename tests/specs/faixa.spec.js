// Faixa de cotações (montada pelo /assets/nav.js embaixo do nav, em todas as páginas).
// AwesomeAPI e Banco Central respondem com dados fixos (helpers.js): USD 5,40 +0,50% · EUR 6,10 −0,20% ·
// GBP 7,0512 +0,001% (vira 0,00%) · BTC 444.303,45 +1,20% · ETH 18.250,90 −0,8% · Selic 13,75 · CDI 13,65 · IPCA 4,22.
const { test, expect } = require('@playwright/test');
const { abrir, preparar, semErros } = require('../helpers');
const { PAGINAS } = require('../ferramentas');

// valor de cada item: R$ com 2 casas, cripto sem centavos, taxa em %, ou "—" (moeda sem dado; taxa sem dado some)
const FORMATO_VALOR = /^(R\$ \d{1,3}(\.\d{3})*(,\d{2})?|\d{1,3},\d{2}%|—)$/;

const lerFaixa = page => page.evaluate(() => {
  const topo = document.getElementById('topo-fixo').getBoundingClientRect();
  const nav = document.querySelector('nav').getBoundingClientRect();
  const faixa = document.getElementById('faixa-cotacoes').getBoundingClientRect();
  const secao = document.querySelector('body > section');
  return {
    fixo: getComputedStyle(document.getElementById('topo-fixo')).position,
    navBase: nav.bottom, faixaTopo: faixa.top, faixaAltura: faixa.height, topoBase: topo.bottom,
    recuoSecao: parseFloat(getComputedStyle(secao).paddingTop),
    itens: [...document.querySelectorAll('#faixa-trilho .faixa-lista:first-child .faixa-item:not([hidden])')].map(li => li.querySelector('.faixa-valor').textContent),
    // números em Inter com algarismos de largura fixa; IBM Plex Mono não é mais carregada
    fonte: getComputedStyle(document.querySelector('.faixa-valor')).fontFamily,
    numeros: getComputedStyle(document.querySelector('.faixa-valor')).fontVariantNumeric,
    numerosBody: getComputedStyle(document.body).fontVariantNumeric,
    plex: [...document.querySelectorAll('link[href*="fonts.googleapis"]')].some(l => /Plex/i.test(l.href)) ||
      [...document.querySelectorAll('*')].some(el => /Plex/i.test(getComputedStyle(el).fontFamily)),
    copias: document.querySelectorAll('#faixa-trilho .faixa-lista').length,
    rolagem: { doc: document.documentElement.scrollWidth, tela: document.documentElement.clientWidth }
  };
});

for (const p of PAGINAS) {
  test.describe(p.slug, () => {
    test('faixa: aparece colada embaixo do nav, fixa, com os 8 itens, números em Inter e sem rolagem lateral (375px e 1440px)', async ({ page }) => {
      const erros = await abrir(page, p.url);
      for (const [largura, altura] of [[1440, 36], [375, 32]]) {
        await page.setViewportSize({ width: largura, height: 900 });
        const f = await lerFaixa(page);
        expect(f.fixo, 'nav + faixa num contêiner fixo').toBe('fixed');
        expect(Math.abs(f.faixaTopo - f.navBase), 'faixa colada no nav').toBeLessThanOrEqual(1);
        expect(f.faixaAltura, `altura da faixa em ${largura}px`).toBe(altura);
        expect(f.recuoSecao, 'a 1ª seção começa abaixo do nav + faixa').toBeGreaterThanOrEqual(f.topoBase);
        expect(f.copias, 'lista duplicada para o loop').toBe(2);
        expect(f.itens).toHaveLength(8);
        for (const v of f.itens) expect(v, 'valor de um item da faixa').toMatch(FORMATO_VALOR);
        expect(f.fonte, 'fonte dos números').toMatch(/^"?Inter/);
        expect(f.numeros).toBe('tabular-nums');
        expect(f.numerosBody, 'tabular-nums na página toda').toBe('tabular-nums');
        expect(f.plex, 'IBM Plex Mono carregada ou usada').toBe(false);
        expect(f.rolagem.doc, `rolagem horizontal em ${largura}px`).toBeLessThanOrEqual(f.rolagem.tela);
      }
      // ao rolar a página, o conjunto continua no topo
      await page.mouse.wheel(0, 1500);
      await page.waitForTimeout(300);
      expect((await lerFaixa(page)).faixaTopo).toBe((await page.evaluate(() => document.querySelector('nav').getBoundingClientRect().bottom)));
      semErros(erros);
    });
  });
}

test.describe('geral', () => {
  const item = (page, id) => page.locator(`#faixa-trilho .faixa-lista:first-child [data-cot="${id}"]`);

  test('faixa: valores em pt-BR (moedas 2 casas, cripto sem centavos, variação com seta e cor, taxas do BC em %)', async ({ page }) => {
    // na home o kit (tools.js) não vem na página: a faixa o injeta para buscar as taxas do BC
    const erros = await abrir(page, '/index.html');
    const esperado = [
      ['USD', 'R$ 5,40', '▲ 0,50%', 'alta'],
      ['EUR', 'R$ 6,10', '▼ 0,20%', 'queda'],
      ['GBP', 'R$ 7,05', '0,00%', 'zero'],
      ['BTC', 'R$ 444.303', '▲ 1,20%', 'alta'],
      ['ETH', 'R$ 18.251', '▼ 0,80%', 'queda']
    ];
    for (const [id, valor, vari, classe] of esperado) {
      await expect(item(page, id).locator('.faixa-valor')).toHaveText(valor);
      await expect(item(page, id).locator('.faixa-var')).toHaveText(vari);
      await expect(item(page, id).locator('.faixa-var')).toHaveClass(new RegExp(classe));
      await expect(item(page, id).locator('.faixa-sigla')).toHaveText(id + '/BRL');
    }
    for (const [id, sigla, valor] of [['selic', 'SELIC', '13,75%'], ['cdi', 'CDI', '13,65%'], ['ipca', 'IPCA 12M', '4,22%']]) {
      await expect(item(page, id).locator('.faixa-valor')).toHaveText(valor);
      await expect(item(page, id).locator('.faixa-sigla')).toHaveText(sigla);
      await expect(item(page, id).locator('.faixa-var'), 'taxa sem seta').toHaveCount(0);
    }
    // cores: verde na alta, vermelho na queda, cinza no zero
    const cor = id => item(page, id).locator('.faixa-var').evaluate(el => getComputedStyle(el).color);
    expect(await cor('USD')).toBe('rgb(34, 197, 94)');
    expect(await cor('EUR')).toBe('rgb(239, 68, 68)');
    expect(await cor('GBP')).toBe(await item(page, 'GBP').locator('.faixa-sigla').evaluate(el => getComputedStyle(el).color));
    // as duas cópias mostram o mesmo texto (senão o loop "pularia")
    const [a, b] = await page.locator('#faixa-trilho .faixa-lista').allInnerTexts();
    expect(b).toBe(a);
    // sem título nem rótulo visível: só os itens
    expect(await page.locator('#faixa-cotacoes > :not(.faixa-trilho)').count()).toBe(0);
    semErros(erros);
  });

  test('faixa: rola a ~40px/s de 0 a -50%, pausa com mouse e toque e não reinicia ao atualizar os valores', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/conversor-de-taxas.html');
    await expect(page.locator('[data-cot="USD"] .faixa-valor').first()).toHaveText('R$ 5,40');
    const info = await page.evaluate(() => {
      const trilho = document.getElementById('faixa-trilho');
      const a = trilho.getAnimations()[0];
      window.__anim = a;
      const lista = trilho.querySelector('.faixa-lista').getBoundingClientRect().width;
      const kf = a.effect.getKeyframes();
      return { n: trilho.getAnimations().length, lista, trilho: trilho.getBoundingClientRect().width,
        dur: a.effect.getTiming().duration, rate: a.playbackRate, iter: a.effect.getTiming().iterations,
        easing: a.effect.getTiming().easing, de: kf[0].transform, ate: kf.at(-1).transform, estado: a.playState };
    });
    expect(info.n).toBe(1);
    expect(info.de).toMatch(/^translateX\(0(px)?\)$/);
    expect(info.ate).toBe('translateX(-50%)');
    expect(info.iter).toBe(Infinity);
    expect(info.easing).toBe('linear');
    expect(Math.abs(info.trilho - 2 * info.lista), 'trilho = 2 cópias iguais, sem espaço entre elas').toBeLessThanOrEqual(1);
    const pxPorSegundo = info.lista / (info.dur / info.rate) * 1000;
    expect(pxPorSegundo).toBeGreaterThan(38);
    expect(pxPorSegundo).toBeLessThan(42);
    expect(info.estado).toBe('running');

    // atualizar os valores não troca nem reinicia a animação
    const t0 = await page.evaluate(() => window.__anim.currentTime);
    await page.evaluate(() => window.WardenFaixa.atualizar());
    await page.waitForTimeout(300);
    const depois = await page.evaluate(() => ({ mesma: document.getElementById('faixa-trilho').getAnimations()[0] === window.__anim, t: window.__anim.currentTime }));
    expect(depois.mesma).toBe(true);
    expect(depois.t).toBeGreaterThan(t0);

    // mouse em cima pausa; saindo, volta
    const estado = () => page.evaluate(() => window.__anim.playState);
    await page.locator('#faixa-cotacoes').hover();
    expect(await estado()).toBe('paused');
    await page.mouse.move(700, 600);
    expect(await estado()).toBe('running');
    // dedo na tela pausa; soltando, volta
    await page.locator('#faixa-cotacoes').dispatchEvent('touchstart');
    expect(await estado()).toBe('paused');
    await page.locator('#faixa-cotacoes').dispatchEvent('touchend');
    expect(await estado()).toBe('running');
    semErros(erros);
  });

  test('faixa: sem animação (prefers-reduced-motion) vira rolagem horizontal manual', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 375, height: 800 });
    const erros = await abrir(page, '/ferramentas/salario-liquido.html');
    const r = await page.evaluate(() => {
      const faixa = document.getElementById('faixa-cotacoes');
      const antes = faixa.scrollLeft;
      faixa.scrollLeft = 120;
      return { anims: document.getElementById('faixa-trilho').getAnimations().length, overflow: getComputedStyle(faixa).overflowX,
        copia: getComputedStyle(document.querySelectorAll('#faixa-trilho .faixa-lista')[1]).display, antes, depois: faixa.scrollLeft,
        doc: document.documentElement.scrollWidth, tela: document.documentElement.clientWidth };
    });
    expect(r.anims).toBe(0);
    expect(r.overflow).toBe('auto');
    expect(r.copia).toBe('none');
    expect(r.antes).toBe(0);
    expect(r.depois).toBeGreaterThan(0);
    expect(r.doc).toBeLessThanOrEqual(r.tela);
    semErros(erros);
  });

  const visiveis = page => page.locator('#faixa-trilho .faixa-lista:first-child .faixa-item:not([hidden]) .faixa-sigla').allTextContents();

  test('faixa: APIs fora do ar e sem cache → moedas com "—" e taxas do BC somem, sem quebrar', async ({ page }) => {
    const erros = await preparar(page, { taxas: 'bloqueada' });
    await page.route('**/economia.awesomeapi.com.br/**', route => route.abort());
    await page.goto('/ferramentas/meta-mensal.html');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    expect(await visiveis(page)).toEqual(['USD/BRL', 'EUR/BRL', 'GBP/BRL', 'BTC/BRL', 'ETH/BRL']);
    const valores = await page.locator('#faixa-trilho .faixa-lista:first-child .faixa-item:not([hidden]) .faixa-valor').allTextContents();
    expect(valores).toEqual(Array(5).fill('—'));
    expect(await page.locator('#faixa-trilho .faixa-lista:first-child .faixa-var').allTextContents()).toEqual(Array(5).fill(''));
    // a cópia do loop segue igual
    expect(await page.locator('#faixa-trilho .faixa-lista:last-child .faixa-item[hidden]').count()).toBe(3);
    semErros(erros);
  });

  test('faixa: só o plano B (site do BC) responde → SELIC e IPCA do site; CDI (que seria estimado) não aparece', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/salario-liquido.html', { taxas: 'site' });
    await expect(page.locator('[data-cot="selic"] .faixa-valor').first()).toHaveText('13,25%');
    await expect(page.locator('[data-cot="ipca"] .faixa-valor').first()).toHaveText('4,10%');
    expect(await visiveis(page)).toEqual(['USD/BRL', 'EUR/BRL', 'GBP/BRL', 'BTC/BRL', 'ETH/BRL', 'SELIC', 'IPCA 12M']);
    // a data da última atualização fica no title do item
    expect(await page.locator('[data-cot="selic"]').first().getAttribute('title')).toBe('Banco Central · atualizado em 02/10/2026');
    semErros(erros);
  });

  test('faixa: APIs fora do ar com cache → mantém os últimos valores por até 7 dias (inclusive ao abrir outra página)', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/rentabilidade-real.html');
    await expect(page.locator('[data-cot="selic"] .faixa-valor').first()).toHaveText('13,75%');
    await expect(page.locator('[data-cot="BTC"] .faixa-valor').first()).toHaveText('R$ 444.303');
    semErros(erros);
    // agora tudo cai (API oficial, site do BC e AwesomeAPI) e o cache de 12h do kit some
    await page.route('**/economia.awesomeapi.com.br/**', route => route.abort());
    await page.route('**/api.bcb.gov.br/**', route => route.abort());
    await page.route('**/www.bcb.gov.br/**', route => route.abort());
    await page.evaluate(() => localStorage.removeItem('warden:taxas-bcb'));
    // 3 dias depois: tudo continua vindo do cache
    await page.clock.setFixedTime(new Date('2026-10-05T12:00:00-03:00'));
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    // já no primeiro instante (antes de qualquer resposta) os valores vêm do cache
    expect(await page.locator('[data-cot="USD"] .faixa-valor').first().textContent()).toBe('R$ 5,40');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await expect(page.locator('[data-cot="USD"] .faixa-valor').first()).toHaveText('R$ 5,40');
    await expect(page.locator('[data-cot="USD"] .faixa-var').first()).toHaveText('▲ 0,50%');
    await expect(page.locator('[data-cot="selic"] .faixa-valor').first()).toHaveText('13,75%');
    await expect(page.locator('[data-cot="ipca"] .faixa-valor').first()).toHaveText('4,22%');
    expect(await page.locator('[data-cot="selic"]').first().getAttribute('title')).toBe('Banco Central · atualizado em 02/10/2026');
    // 8 dias depois: taxas passaram da validade e somem; moedas ficam com o último valor
    await page.clock.setFixedTime(new Date('2026-10-10T12:00:00-03:00'));
    await page.goto('/ferramentas/ferias.html', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    expect(await visiveis(page)).toEqual(['USD/BRL', 'EUR/BRL', 'GBP/BRL', 'BTC/BRL', 'ETH/BRL']);
    await expect(page.locator('[data-cot="USD"] .faixa-valor').first()).toHaveText('R$ 5,40');
    expect(erros.filter(e => e.startsWith('erro de JS')), 'erros de JS').toEqual([]);
  });

  test('links: nav, mega-menu e menu mobile sem "Gráfico" e "Notícias"; home sem notícias, gráfico, Mercado e TradingView', async ({ page }) => {
    const pedidos = [];
    page.on('request', r => pedidos.push(r.url()));
    const erros = await abrir(page, '/index.html');
    for (const id of ['#mercado', '#noticias', '#grafico']) expect(await page.locator(id).count(), id).toBe(0);
    expect(await page.locator('a[href*="#mercado"], a[href*="#noticias"], a[href*="#grafico"]').count()).toBe(0);
    expect(await page.locator('nav, #mega-menu, #mobile-menu').getByText(/^(Gráfico|Notícias|Mercado)/).count()).toBe(0);
    expect(await page.locator('.mega-quick').count(), 'bloco "Acesso rápido"').toBe(0);
    expect(pedidos.filter(u => /tradingview|rss2json/.test(u)), 'scripts de notícias/gráfico').toEqual([]);
    // card do Warden Cobrança ocupa a largura toda do rodapé do mega-menu
    await page.locator('#nav-tools-btn').click();
    const larguras = await page.evaluate(() => ({ card: document.querySelector('.mega-foot .cobranca-card').getBoundingClientRect().width, foot: document.querySelector('.mega-foot').getBoundingClientRect().width }));
    expect(Math.abs(larguras.card - larguras.foot)).toBeLessThanOrEqual(1);
    semErros(erros);
  });
});
