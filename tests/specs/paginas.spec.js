// Testes de página: links do menu, celular/tablet, screenshots, SEO e acessibilidade básica (28 ferramentas + home).
const { test, expect } = require('@playwright/test');
const path = require('path');
const { abrir, semErros } = require('../helpers');
const { FERRAMENTAS, PAGINAS } = require('../ferramentas');

const SITE = 'https://wardenfinance.com.br';
const PASTA_SCREENSHOTS = path.join(__dirname, '..', 'screenshots');

/* ===== LINKS DO MENU ===== */
test.describe('geral', () => {
  test('links: as 29 ferramentas estão disponíveis no nav.js e batem com a lista dos testes', async ({ page }) => {
    await abrir(page, '/index.html');
    const doMenu = await page.evaluate(() => window.WARDEN_FERRAMENTAS.flatMap(c => c.itens.map(i => ({ url: i.url, disponivel: i.disponivel }))));
    expect(doMenu.filter(i => !i.disponivel), 'itens indisponíveis').toEqual([]);
    const urlsTestes = FERRAMENTAS.map(f => f.area ? '/#calculadora' : f.url).sort();
    expect(doMenu.map(i => i.url).sort()).toEqual(urlsTestes);
  });

  test('links: todo link do mega-menu e do menu mobile abre uma página que existe (nenhum 404)', async ({ page, request }) => {
    await abrir(page, '/index.html');
    const links = await page.evaluate(() => [...document.querySelectorAll('#mega-menu a, #mobile-menu a, nav a')].map(a => a.getAttribute('href')));
    const unicos = [...new Set(links)].filter(Boolean);
    expect(unicos.length).toBeGreaterThan(29);
    const quebrados = [];
    for (const href of unicos) {
      const [caminho, ancora] = href.split('#');
      const url = caminho ? caminho : '/index.html';
      const r = await request.get(url);
      if (r.status() !== 200) { quebrados.push(`${href} → HTTP ${r.status()}`); continue; }
      if (ancora) {   // âncoras da home (#cobranca, #calculadora) precisam existir
        const html = await r.text();
        if (!html.includes(`id="${ancora}"`)) quebrados.push(`${href} → âncora #${ancora} não existe`);
      }
    }
    expect(quebrados, quebrados.join('\n')).toEqual([]);
  });
});

/* ===== POR PÁGINA ===== */
// elementos visíveis que passam da borda direita da tela (fora de áreas com rolagem própria, como tabelas)
async function cortados(page) {
  return page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const rolaveis = el => { for (let p = el.parentElement; p; p = p.parentElement) { const ox = getComputedStyle(p).overflowX; if (ox !== 'visible') return true; } return false; };
    return [...document.querySelectorAll('body *')].filter(el => {
      const r = el.getBoundingClientRect();
      if (!r.width || r.right <= W + 1) return false;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || el.closest('[hidden], #mega-menu, #mobile-menu, .mega-overlay, iframe')) return false;
      return !rolaveis(el);
    }).slice(0, 5).map(el => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} (direita em ${Math.round(el.getBoundingClientRect().right)}px, tela ${W}px)`);
  });
}

// contraste WCAG: texto visível com contraste abaixo de 4,5:1 (3:1 para texto grande)
async function contrasteBaixo(page) {
  return page.evaluate(() => {
    const rgba = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const mistura = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
    // fundo efetivo: compõe os fundos dos ancestrais (do body para dentro); null se houver imagem/gradiente
    function fundo(el) {
      const pilha = [];
      for (let p = el; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
        const c = rgba(cs.backgroundColor);
        if (c && c.a > 0) { pilha.push(c); if (c.a >= 1) break; }
      }
      let bg = { r: 0, g: 0, b: 0, a: 1 };   // fundo da página (preto)
      for (let i = pilha.length - 1; i >= 0; i--) bg = mistura(pilha[i], bg);
      return bg;
    }
    const opacidade = el => { let o = 1; for (let p = el; p; p = p.parentElement) o *= parseFloat(getComputedStyle(p).opacity); return o; };
    const ruins = [];
    const vistos = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (!n.textContent.trim()) continue;
      const el = n.parentElement;
      if (!el || vistos.has(el)) continue;
      vistos.add(el);
      if (el.closest('script, style, svg, [hidden], [aria-hidden="true"], #mega-menu, #mobile-menu, button:disabled, a[aria-disabled="true"], select option, iframe')) continue;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none') continue;
      const bg = fundo(el);
      if (!bg) continue;
      const fg = rgba(cs.color); if (!fg) continue;
      const cor = mistura({ ...fg, a: fg.a * opacidade(el) }, bg);
      const L1 = lum(cor), L2 = lum(bg);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const px = parseFloat(cs.fontSize), negrito = parseInt(cs.fontWeight, 10) >= 700;
      const grande = px >= 24 || (px >= 18.66 && negrito);
      if (ratio < (grande ? 3 : 4.5)) ruins.push(`"${n.textContent.trim().slice(0, 40)}" (${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}) contraste ${ratio.toFixed(2)}:1`);
    }
    return ruins.slice(0, 10);
  });
}

const vistosSEO = { titulos: new Map(), descricoes: new Map() };

for (const p of PAGINAS) {
  test.describe(p.slug, () => {
    for (const largura of [375, 768]) {
      test(`celular: em ${largura}px não rola para o lado, nada cortado e o menu hambúrguer abre`, async ({ page }) => {
        await page.setViewportSize({ width: largura, height: 900 });
        const erros = await abrir(page, p.url);
        const larguras = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, tela: document.documentElement.clientWidth }));
        expect(larguras.doc, `rolagem horizontal: página com ${larguras.doc}px numa tela de ${larguras.tela}px`).toBeLessThanOrEqual(larguras.tela);
        const c = await cortados(page);
        expect(c, 'elementos cortados:\n' + c.join('\n')).toEqual([]);
        // menu hambúrguer
        await page.locator('#nav-burger').click();
        await expect(page.locator('#mobile-menu')).toHaveClass(/open/);
        await page.locator('#mobile-menu details summary').first().click();
        await expect(page.locator('#mobile-menu details[open] a').first()).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator('#mobile-menu')).not.toHaveClass(/open/);
        semErros(erros);
      });
    }

    test('celular: screenshots em 375px e 1440px', async ({ page }) => {
      for (const largura of [375, 1440]) {
        await page.setViewportSize({ width: largura, height: 900 });
        await abrir(page, p.url);
        await page.screenshot({ path: path.join(PASTA_SCREENSHOTS, `${p.slug}-${largura}.png`), fullPage: true });
      }
    });

    test('seo: title, description, um h1, canonical e JSON-LD válidos', async ({ page }) => {
      const erros = await abrir(page, p.url);
      const info = await page.evaluate(() => ({
        title: document.title,
        desc: (document.querySelector('meta[name=description]') || {}).content || '',
        h1: document.querySelectorAll('h1').length,
        canonical: (document.querySelector('link[rel=canonical]') || {}).href || '',
        jsonld: [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => { try { return JSON.parse(s.textContent)['@type']; } catch (e) { return 'INVÁLIDO: ' + e.message; } })
      }));
      expect(info.title.length, 'title').toBeGreaterThan(10);
      expect(info.title.length, 'title com até 70 caracteres').toBeLessThanOrEqual(70);
      expect(info.desc.length, 'meta description').toBeGreaterThan(50);
      expect(info.desc.length, 'meta description com até 170 caracteres').toBeLessThanOrEqual(170);
      expect(info.h1, 'exatamente um <h1>').toBe(1);
      const esperado = p.slug === 'home' ? SITE + '/' : SITE + p.url;
      expect(info.canonical, 'canonical').toBe(esperado);
      expect(info.jsonld.filter(t => String(t).startsWith('INVÁLIDO')), 'JSON-LD inválido').toEqual([]);
      if (p.slug !== 'home') {
        expect(info.jsonld, 'schemas da ferramenta').toEqual(expect.arrayContaining(['WebApplication', 'BreadcrumbList', 'FAQPage']));
        const faq = await page.evaluate(() => JSON.parse([...document.querySelectorAll('script[type="application/ld+json"]')].map(s => s.textContent).find(t => t.includes('FAQPage'))));
        expect(faq.mainEntity.length, 'perguntas no FAQ').toBeGreaterThanOrEqual(3);
        for (const q of faq.mainEntity) { expect(q.name.length).toBeGreaterThan(5); expect(q.acceptedAnswer.text.length).toBeGreaterThan(30); }
      }
      semErros(erros);
    });

    test('acessibilidade: todo campo com rótulo, todo botão com nome e contraste legível', async ({ page }) => {
      // sem animação: o texto que entra ao rolar (.fade-up) aparece já no estado final, que é o que se mede
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const erros = await abrir(page, p.url);
      const semRotulo = await page.evaluate(() => [...document.querySelectorAll('input:not([type=hidden]), select, textarea')].filter(el => {
        if (el.closest('[hidden]') || getComputedStyle(el).display === 'none') return false;
        const temLabel = (el.id && document.querySelector(`label[for="${el.id}"]`)) || el.closest('label') || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title');
        return !temLabel;
      }).map(el => `${el.tagName.toLowerCase()}#${el.id || '?'}`));
      expect(semRotulo, 'campos sem rótulo: ' + semRotulo.join(', ')).toEqual([]);
      const botoesMudos = await page.evaluate(() => [...document.querySelectorAll('button, [role=button], a.btn')].filter(b => {
        const nome = (b.getAttribute('aria-label') || b.textContent || b.getAttribute('title') || '').trim();
        return !nome;
      }).map(b => b.outerHTML.slice(0, 80)));
      expect(botoesMudos, 'botões sem nome: ' + botoesMudos.join(' | ')).toEqual([]);
      const ruins = await contrasteBaixo(page);
      expect(ruins, 'texto com contraste baixo:\n' + ruins.join('\n')).toEqual([]);
      semErros(erros);
    });
  });
}

// títulos e descriptions únicos entre todas as páginas
test.describe('geral', () => {
  // title e description estão no HTML estático: lê o arquivo direto, sem abrir as 29 páginas no navegador
  test('seo: title e meta description são únicos entre as 29 páginas', async ({ request }) => {
    const titulos = {}, descs = {};
    for (const p of PAGINAS) {
      const html = await (await request.get(p.url)).text();
      const t = ((html.match(/<title>([^<]*)<\/title>/) || [])[1] || '').trim();
      const d = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
      expect(t, 'title em ' + p.slug).not.toBe('');
      expect(d, 'description em ' + p.slug).not.toBe('');
      (titulos[t] = titulos[t] || []).push(p.slug);
      (descs[d] = descs[d] || []).push(p.slug);
    }
    const repetidos = [...Object.entries(titulos), ...Object.entries(descs)].filter(([, s]) => s.length > 1).map(([v, s]) => `"${v.slice(0, 60)}" em ${s.join(', ')}`);
    expect(repetidos, repetidos.join('\n')).toEqual([]);
  });
});
