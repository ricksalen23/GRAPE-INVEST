// Home: hero em vídeo (ligado/desligado pela config HERO_VIDEO), título h1 e capricho no celular (375 e 390px).
const { test, expect } = require('@playwright/test');
const { abrir, preparar, semErros } = require('../helpers');

// PNG 1×1 para o poster e um "vídeo" vazio: só interessa o que a página pede e monta
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

// abre a home com HERO_VIDEO trocado (o HTML é reescrito na rota) e registra os pedidos de vídeo e de poster
// conexao: o que navigator.connection devolve (ex.: { saveData: true }, { effectiveType: '2g' })
async function abrirComHero(page, cfg, { largura = 1440, altura = 900, movimento = 'no-preference', conexao = null } = {}) {
  const erros = await preparar(page);
  const pedidos = [];
  page.on('request', r => { const m = r.url().match(/\/assets\/video\/(.+)$/); if (m) pedidos.push(m[1]); });
  await page.route('**/assets/video/**', route => /\.png$/.test(route.request().url())
    ? route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
    : route.fulfill({ status: 200, contentType: 'video/mp4', body: Buffer.alloc(0) }));
  await page.route(/\/index\.html$/, async route => {
    const resp = await route.fetch();
    const html = (await resp.text()).replace(/const HERO_VIDEO = \{[\s\S]*?\};/, 'const HERO_VIDEO = ' + JSON.stringify(cfg) + ';');
    await route.fulfill({ response: resp, body: html });
  });
  if (conexao) await page.addInitScript(c => Object.defineProperty(Navigator.prototype, 'connection', { get: () => c }), conexao);
  await page.emulateMedia({ reducedMotion: movimento });
  await page.setViewportSize({ width: largura, height: altura });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('load', { timeout: 20_000 }).catch(() => {});
  const videos = () => [...new Set(pedidos.filter(p => !/\.png$/.test(p)))];
  const posters = () => [...new Set(pedidos.filter(p => /\.png$/.test(p)))];
  return { erros, videos, posters };
}
const COMPLETO = {
  ativo: true, titulo: 'Seu dinheiro tem um guardião.', destaque: 'guardião',
  desktop: { webm: '/assets/video/d.webm', mp4: '/assets/video/d.mp4', poster: '/assets/video/d.png' },
  mobile: { webm: '/assets/video/m.webm', mp4: '/assets/video/m.mp4', poster: '/assets/video/m.png' }
};

const h1s = page => page.locator('h1').evaluateAll(l => l.map(h => ({ texto: h.textContent.trim(), oculto: h.classList.contains('sr-only') })));
const lerVideo = page => page.locator('#inicio video').evaluate(el => ({
  autoplay: el.autoplay, muted: el.muted, loop: el.loop, inline: el.playsInline, preload: el.getAttribute('preload'), poster: el.getAttribute('poster'),
  fontes: [...el.querySelectorAll('source')].map(s => [s.getAttribute('src'), s.type])
}));
const VIDEO_DESKTOP = { autoplay: true, muted: true, loop: true, inline: true, preload: 'metadata', poster: '/assets/video/d.png',
  fontes: [['/assets/video/d.webm', 'video/webm'], ['/assets/video/d.mp4', 'video/mp4']] };
const VIDEO_MOBILE = { ...VIDEO_DESKTOP, poster: '/assets/video/m.png', fontes: [['/assets/video/m.webm', 'video/webm'], ['/assets/video/m.mp4', 'video/mp4']] };

test.describe('home', () => {
  test('hero: a config de hoje está ligada, com título, e os 6 arquivos de /assets/video/ existem e são leves', async ({ page }) => {
    const erros = await abrir(page, '/index.html');
    const cfg = await page.evaluate(() => HERO_VIDEO);
    expect(cfg).toMatchObject({ ativo: true, titulo: 'Seu dinheiro tem um guardião.', destaque: 'guardião' });
    const arquivos = { 'desktop.webm': cfg.desktop.webm, 'desktop.mp4': cfg.desktop.mp4, 'desktop.poster': cfg.desktop.poster,
      'mobile.webm': cfg.mobile.webm, 'mobile.mp4': cfg.mobile.mp4, 'mobile.poster': cfg.mobile.poster };
    for (const [qual, url] of Object.entries(arquivos)) {
      expect(url, qual).toMatch(/^\/assets\/video\/hero-[\w-]+\.(webm|mp4|jpg)$/);
      const r = await page.request.get(url);
      expect(r.status(), `${qual}: ${url}`).toBe(200);
      const limite = url.endsWith('.jpg') ? 300 * 1024 : 4 * 1024 * 1024;
      expect((await r.body()).length, `${qual}: ${url} até ${limite} bytes`).toBeLessThanOrEqual(limite);
    }
    semErros(erros);
  });

  test('hero: com HERO_VIDEO.ativo = false a seção não existe (nem espaço) e o h1 é o oculto', async ({ page }) => {
    const { erros, videos, posters } = await abrirComHero(page, { ativo: false });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    expect([...videos(), ...posters()], 'nada de /assets/video/ é pedido').toEqual([]);
    expect(await page.locator('#inicio, .hero-video, #hero-video-tpl, video').count()).toBe(0);
    expect(await page.evaluate(() => [...document.querySelectorAll('body > section')].map(s => s.id))).toEqual(['cobranca']);
    expect(await h1s(page)).toEqual([{ texto: 'Warden: ferramentas financeiras gratuitas e cobrança automática no WhatsApp', oculto: true }]);
    // a Cobrança vira a 1ª seção e começa abaixo do nav + faixa
    const r = await page.evaluate(() => ({ recuo: parseFloat(getComputedStyle(document.getElementById('cobranca')).paddingTop), topo: document.getElementById('topo-fixo').getBoundingClientRect().bottom, titulo: document.querySelector('#cobranca .section-label').getBoundingClientRect().top }));
    expect(r.recuo).toBeGreaterThanOrEqual(r.topo);
    expect(r.titulo).toBeGreaterThan(r.topo);
    semErros(erros);
  });

  test('hero: no desktop → vídeo desktop (autoplay, muted, loop, playsinline, preload metadata, webm + mp4, poster), só ele é baixado, 85vh, título vira o h1', async ({ page }) => {
    const { erros, videos, posters } = await abrirComHero(page, COMPLETO);
    expect(await page.evaluate(() => [...document.querySelectorAll('body > section')].map(s => s.id))).toEqual(['inicio', 'cobranca']);
    expect(await lerVideo(page)).toEqual(VIDEO_DESKTOP);
    await expect.poll(videos, { message: 'o vídeo desktop é pedido' }).toContain('d.webm');
    expect(videos().filter(v => v.startsWith('m.')), 'nada da versão mobile').toEqual([]);
    expect(posters().filter(p => p.startsWith('m.')), 'nem o poster mobile').toEqual([]);
    const r = await page.evaluate(() => ({
      altura: document.getElementById('inicio').getBoundingClientRect().height, tela: innerHeight,
      enquadramento: getComputedStyle(document.querySelector('#inicio video')).objectPosition,
      midiaOculta: document.querySelector('#inicio .hero-video-midia').getAttribute('aria-hidden')
    }));
    expect(Math.abs(r.altura - r.tela * 0.85), `altura ${r.altura}px numa tela de ${r.tela}px`).toBeLessThanOrEqual(1);
    expect(r.enquadramento).toBe('40% 50%');
    expect(r.midiaOculta).toBe('true');
    await expect(page.locator('#inicio .hero-video-sombra')).toHaveCount(1);
    // título (único h1) com "guardião" em destaque, subtítulo e os dois botões
    expect(await h1s(page)).toEqual([{ texto: 'Seu dinheiro tem um guardião.', oculto: false }]);
    await expect(page.locator('#inicio h1')).toBeVisible();
    const titulo = await page.locator('#inicio h1').evaluate(h => ({
      fonte: getComputedStyle(h).fontFamily, destaque: h.querySelector('em').textContent,
      cor: getComputedStyle(h.querySelector('em')).color, acento: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    }));
    expect(titulo.fonte).toMatch(/^"?Fraunces/);
    expect(titulo.destaque).toBe('guardião');
    expect(titulo.cor).toBe('rgb(200, 242, 107)');   // --accent #C8F26B
    expect(titulo.acento.toUpperCase()).toBe('#C8F26B');
    await expect(page.locator('#inicio .hero-video-sub')).toHaveText('Bem-vindo à Warden Finance.');
    const conhecer = page.locator('#inicio a.btn-primary');
    await expect(conhecer).toHaveText('Conhecer o Warden Cobrança');
    expect(await conhecer.getAttribute('href')).toBe('/cobranca/');
    // texto e botões na parte de baixo do hero
    const caixa = await page.evaluate(() => {
      const s = document.getElementById('inicio').getBoundingClientRect(), c = document.querySelector('#inicio .hero-video-conteudo').getBoundingClientRect();
      return { meio: s.top + s.height / 2, topoTexto: c.top, fimTexto: c.bottom, fimHero: s.bottom };
    });
    expect(caixa.topoTexto).toBeGreaterThan(caixa.meio - 100);
    expect(caixa.fimHero - caixa.fimTexto).toBeLessThanOrEqual(80);
    // a Cobrança vem depois com a linha de separação
    expect(await page.locator('#cobranca').evaluate(el => getComputedStyle(el).borderTopStyle)).toBe('solid');
    semErros(erros);
  });

  test('hero: no celular (390px) o vídeo toca na versão mobile (só ela é baixada), centralizado e com 75svh', async ({ page }) => {
    const { erros, videos, posters } = await abrirComHero(page, COMPLETO, { largura: 390, altura: 844 });
    expect(await lerVideo(page)).toEqual(VIDEO_MOBILE);
    await expect.poll(videos, { message: 'o vídeo mobile é pedido' }).toContain('m.webm');
    expect(videos().filter(v => v.startsWith('d.')), 'nada da versão desktop').toEqual([]);
    expect(posters().filter(p => p.startsWith('d.')), 'nem o poster desktop').toEqual([]);
    const r = await page.evaluate(() => ({
      altura: document.getElementById('inicio').getBoundingClientRect().height, tela: innerHeight,
      enquadramento: getComputedStyle(document.querySelector('#inicio video')).objectPosition
    }));
    expect(Math.abs(r.altura - r.tela * 0.75), `altura ${r.altura}px numa tela de ${r.tela}px`).toBeLessThanOrEqual(1);
    expect(r.enquadramento).toBe('50% 50%');
    semErros(erros);
  });

  test('hero: ao mudar o tamanho da tela, troca de versão (desktop ↔ mobile) e baixa só a nova', async ({ page }) => {
    const { erros, videos } = await abrirComHero(page, COMPLETO);
    await expect.poll(videos).toContain('d.webm');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => lerVideo(page)).toEqual(VIDEO_MOBILE);
    await expect.poll(videos, { message: 'a versão mobile é pedida depois da troca' }).toContain('m.webm');
    expect(await page.locator('#inicio video').count(), 'continua um vídeo só').toBe(1);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(() => lerVideo(page)).toEqual(VIDEO_DESKTOP);
    semErros(erros);
  });

  for (const [caso, opcoes, poster] of [
    ['com prefers-reduced-motion', { movimento: 'reduce' }, 'd.png'],
    ['com prefers-reduced-motion no celular', { movimento: 'reduce', largura: 390, altura: 844 }, 'm.png'],
    ['com economia de dados (saveData)', { conexao: { saveData: true } }, 'd.png'],
    ['com conexão 2g', { conexao: { effectiveType: '2g' }, largura: 390, altura: 844 }, 'm.png'],
    ['com conexão slow-2g', { conexao: { effectiveType: 'slow-2g' } }, 'd.png']
  ]) {
    test(`hero: ${caso} → só o poster da versão da tela, e o vídeo nem é baixado`, async ({ page }) => {
      const { erros, videos, posters } = await abrirComHero(page, COMPLETO, opcoes);
      await page.waitForTimeout(500);
      expect(await page.locator('#inicio video').count()).toBe(0);
      expect(await page.locator('#inicio .hero-video-midia img').getAttribute('src')).toBe('/assets/video/' + poster);
      expect(videos(), 'pedidos de vídeo').toEqual([]);
      expect(posters()).toEqual([poster]);
      semErros(erros);
    });
  }

  test('hero: com conexão 3g/4g o vídeo toca normalmente', async ({ page }) => {
    const { erros, videos } = await abrirComHero(page, COMPLETO, { conexao: { effectiveType: '3g', saveData: false } });
    expect(await lerVideo(page)).toEqual(VIDEO_DESKTOP);
    await expect.poll(videos).toContain('d.webm');
    semErros(erros);
  });

  for (const [largura, painel] of [[1440, '#mega-menu'], [390, '#mobile-menu']]) {
    test(`hero: "Explorar ferramentas" abre o mapa de ferramentas (${largura}px: ${painel})`, async ({ page }) => {
      const { erros } = await abrirComHero(page, COMPLETO, { largura, altura: largura > 500 ? 900 : 844 });
      const botao = page.locator('#inicio button', { hasText: 'Explorar ferramentas' });
      await expect(botao).toHaveClass(/btn-secondary/);
      await botao.click();
      await expect(page.locator(painel)).toHaveClass(/open/);
      await page.keyboard.press('Escape');
      await expect(page.locator(painel)).not.toHaveClass(/open/);
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

  test('links: "Quero usar", "Cobrança" do nav, "Conhecer" do mega-menu/menu mobile, rodapé, ponte das ferramentas e contato levam a /cobranca/', async ({ page }) => {
    let erros = await abrir(page, '/index.html');
    expect(await page.locator('#cobranca a.btn', { hasText: 'Quero usar o Warden Cobrança' }).getAttribute('href')).toBe('/cobranca/');
    expect(await page.locator('nav a.nav-cobranca').getAttribute('href')).toBe('/cobranca/');
    expect(await page.locator('#mega-menu .cobranca-card-btn').getAttribute('href')).toBe('/cobranca/');
    expect(await page.locator('#mobile-menu .cobranca-card-btn').getAttribute('href')).toBe('/cobranca/');
    // nenhum link da home abre o WhatsApp de suporte nem aponta para a seção antiga
    expect(await page.locator('a[href*="wa.me"], a[href="#cobranca"], a[href="/#cobranca"]').count()).toBe(0);
    semErros(erros);
    erros = await abrir(page, '/ferramentas/sac-x-price.html');
    expect(await page.locator('.tool-bridge .cobranca-card-btn').getAttribute('href')).toBe('/cobranca/');
    semErros(erros);
    erros = await abrir(page, '/contato.html');
    expect(await page.locator('article a', { hasText: 'Warden Cobrança' }).getAttribute('href')).toBe('/cobranca/');
    semErros(erros);
    const r = await page.request.get('/cobranca/');
    expect(r.status()).toBe(200);
  });
});
