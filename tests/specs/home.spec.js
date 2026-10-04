// Home: hero em vídeo (ligado/desligado pela config HERO_VIDEO), título h1 e capricho no celular (375 e 390px).
const { test, expect } = require('@playwright/test');
const { abrir, preparar, semErros } = require('../helpers');

// PNG 1×1 para o poster e um "vídeo" vazio: só interessa o que a página pede e monta
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

// abre a home com HERO_VIDEO trocado (o HTML é reescrito na rota) e registra os pedidos de vídeo
async function abrirComHero(page, cfg, { largura = 1440, altura = 900, movimento = 'no-preference', economia = false } = {}) {
  const erros = await preparar(page);
  const videos = [];
  page.on('request', r => { if (/\/assets\/video\//.test(r.url()) && !/\.png$/.test(r.url())) videos.push(r.url()); });
  await page.route('**/assets/video/**', route => /\.png$/.test(route.request().url())
    ? route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
    : route.fulfill({ status: 200, contentType: 'video/mp4', body: Buffer.alloc(0) }));
  await page.route(/\/index\.html$/, async route => {
    const resp = await route.fetch();
    const html = (await resp.text()).replace(/const HERO_VIDEO = \{[^}]*\};/, 'const HERO_VIDEO = ' + JSON.stringify(cfg) + ';');
    await route.fulfill({ response: resp, body: html });
  });
  if (economia) await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'connection', { get: () => ({ saveData: true }) }));
  await page.emulateMedia({ reducedMotion: movimento });
  await page.setViewportSize({ width: largura, height: altura });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('load', { timeout: 20_000 }).catch(() => {});
  return { erros, videos };
}
const COMPLETO = { ativo: true, mp4: '/assets/video/hero.mp4', webm: '/assets/video/hero.webm', poster: '/assets/video/hero.png', titulo: 'Seu dinheiro trabalhando por você' };

const h1s = page => page.locator('h1').evaluateAll(l => l.map(h => ({ texto: h.textContent.trim(), oculto: h.classList.contains('sr-only') })));

test.describe('home', () => {
  test('hero: com HERO_VIDEO.ativo = false a seção não existe (nem espaço) e o h1 é o oculto', async ({ page }) => {
    const erros = await abrir(page, '/index.html');
    expect(await page.locator('#inicio, .hero-video, #hero-video-tpl, video').count()).toBe(0);
    expect(await page.evaluate(() => [...document.querySelectorAll('body > section')].map(s => s.id))).toEqual(['cobranca', 'calculadora']);
    expect(await h1s(page)).toEqual([{ texto: 'Warden: ferramentas financeiras gratuitas e cobrança automática no WhatsApp', oculto: true }]);
    // a Cobrança vira a 1ª seção e começa abaixo do nav + faixa
    const r = await page.evaluate(() => ({ recuo: parseFloat(getComputedStyle(document.getElementById('cobranca')).paddingTop), topo: document.getElementById('topo-fixo').getBoundingClientRect().bottom, titulo: document.querySelector('#cobranca .section-label').getBoundingClientRect().top }));
    expect(r.recuo).toBeGreaterThanOrEqual(r.topo);
    expect(r.titulo).toBeGreaterThan(r.topo);
    semErros(erros);
  });

  test('hero: ativo no desktop → vídeo de fundo (autoplay, muted, loop, playsinline, webm + mp4, poster) e o título vira o h1', async ({ page }) => {
    const { erros, videos } = await abrirComHero(page, COMPLETO);
    expect(await page.evaluate(() => [...document.querySelectorAll('body > section')].map(s => s.id))).toEqual(['inicio', 'cobranca', 'calculadora']);
    const v = await page.locator('#inicio video').evaluate(el => ({
      autoplay: el.autoplay, muted: el.muted, loop: el.loop, inline: el.playsInline, poster: el.getAttribute('poster'),
      fontes: [...el.querySelectorAll('source')].map(s => [s.getAttribute('src'), s.type]), oculto: el.getAttribute('aria-hidden')
    }));
    expect(v).toEqual({ autoplay: true, muted: true, loop: true, inline: true, poster: '/assets/video/hero.png',
      fontes: [['/assets/video/hero.webm', 'video/webm'], ['/assets/video/hero.mp4', 'video/mp4']], oculto: 'true' });
    expect(videos.length, 'o vídeo é pedido').toBeGreaterThan(0);
    await expect(page.locator('#inicio .hero-video-sombra')).toHaveCount(1);
    expect(await h1s(page)).toEqual([{ texto: 'Seu dinheiro trabalhando por você', oculto: false }]);
    await expect(page.locator('#inicio h1')).toBeVisible();
    // hero começa embaixo do topo fixo com o título visível; a Cobrança vem depois com a linha de separação
    expect(await page.locator('#cobranca').evaluate(el => getComputedStyle(el).borderTopStyle)).toBe('solid');
    semErros(erros);
  });

  for (const [caso, opcoes] of [
    ['no celular (390px)', { largura: 390, altura: 844 }],
    ['com prefers-reduced-motion', { movimento: 'reduce' }],
    ['com economia de dados (saveData)', { economia: true }]
  ]) {
    test(`hero: ${caso} → só o poster, e o vídeo nem é baixado`, async ({ page }) => {
      const { erros, videos } = await abrirComHero(page, COMPLETO, opcoes);
      await page.waitForTimeout(500);
      expect(await page.locator('#inicio video').count()).toBe(0);
      expect(await page.locator('#inicio .hero-video-midia img').getAttribute('src')).toBe('/assets/video/hero.png');
      expect(videos, 'pedidos de vídeo').toEqual([]);
      semErros(erros);
    });
  }

  test('hero: ativo sem título → continua com o h1 oculto', async ({ page }) => {
    const { erros } = await abrirComHero(page, { ...COMPLETO, titulo: '' });
    await expect(page.locator('#inicio')).toHaveCount(1);
    expect(await h1s(page)).toEqual([{ texto: 'Warden: ferramentas financeiras gratuitas e cobrança automática no WhatsApp', oculto: true }]);
    semErros(erros);
  });

  for (const [largura, altura] of [[375, 667], [390, 844]]) {
    test(`celular: em ${largura}px — toques de 44px, parágrafos de 16px, nada encostando nas bordas, mockup inteiro depois do texto`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });   // tudo no estado final (sem fade)
      await page.setViewportSize({ width: largura, height: altura });
      const erros = await abrir(page, '/index.html');
      const r = await page.evaluate(() => {
        const W = document.documentElement.clientWidth, H = innerHeight;
        const visivel = el => {
          const b = el.getBoundingClientRect(), cs = getComputedStyle(el);
          return b.width && b.height && cs.visibility !== 'hidden' && cs.display !== 'none' &&
            !el.closest('[hidden], .sr-only, #mobile-menu, #mega-menu, .faixa-cotacoes, .phone, [aria-hidden="true"]');
        };
        const toque = [...document.querySelectorAll('a, button, input, select')].filter(visivel);
        const pequenos = [...document.querySelectorAll('a, button, input, select')].filter(visivel)
          .filter(el => { const b = el.getBoundingClientRect(); return b.height < 44 || b.width < 44; })
          .map(el => { const b = el.getBoundingClientRect(); return `${el.tagName.toLowerCase()}#${el.id || ''}.${el.className} (${Math.round(b.width)}×${Math.round(b.height)})`; });
        const fontes = [...document.querySelectorAll('section p, section li')].filter(visivel).filter(el => !el.matches('.section-label'))
          .filter(el => parseFloat(getComputedStyle(el).fontSize) < 16)
          .map(el => `"${el.textContent.trim().slice(0, 30)}" ${getComputedStyle(el).fontSize}`);
        const bordas = [...document.querySelectorAll('section *')].filter(visivel)
          .filter(el => { const b = el.getBoundingClientRect(); return b.left < 16 || W - b.right < 16; })
          .map(el => `${el.tagName.toLowerCase()}.${el.className}`);
        const phone = document.querySelector('.phone').getBoundingClientRect();
        const copia = document.querySelector('.cobranca-copy').getBoundingClientRect();
        const topo = document.getElementById('topo-fixo').getBoundingClientRect().bottom;
        return { toque: toque.length, pequenos, fontes, bordas, cabe: phone.height <= H - topo, depois: phone.top >= copia.bottom,
          centro: Math.abs(phone.left - (W - phone.right)), largura: phone.width };
      });
      expect(r.toque, 'há elementos tocáveis').toBeGreaterThan(3);
      expect(r.pequenos, 'área de toque menor que 44px').toEqual([]);
      expect(r.fontes, 'parágrafos menores que 16px').toEqual([]);
      expect(r.bordas, 'encostando nas bordas (menos de 16px)').toEqual([]);
      expect(r.depois, 'mockup depois de título, passos e botão').toBe(true);
      expect(r.cabe, 'mockup inteiro na tela').toBe(true);
      expect(r.centro, 'mockup centralizado').toBeLessThanOrEqual(2);
      // faixa legível: pelo menos 12px
      expect(await page.locator('.faixa-valor').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
      semErros(erros);
    });
  }
});
