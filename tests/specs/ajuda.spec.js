// Central de ajuda (/ajuda/): busca local, artigos em acordeão com link direto e o Bip (3D preguiçoso ou imagem estática).
// Os testes de página (SEO, acessibilidade, celular, faixa e rodapé) valem para ela pela lista INSTITUCIONAIS: npx playwright test -g ajuda
const { test, expect } = require('@playwright/test');
const { abrir, semErros } = require('../helpers');

const URL = '/ajuda/';
const TOTAL = 25;   // artigos na página
const visiveis = page => page.locator('.aj-artigo:not([hidden])');
const artigo = (page, id) => page.locator(`#${id}`);

test.describe('ajuda', () => {
  test('ajuda: a busca filtra enquanto digita, sem acento, e avisa quantos artigos achou', async ({ page }) => {
    const erros = await abrir(page, URL);
    await expect(page.locator('.aj-artigo')).toHaveCount(TOTAL);
    await expect(page.getByLabel('Buscar na ajuda')).toBeVisible();
    const status = page.locator('#aj-status');
    await expect(status).toHaveAttribute('role', 'status');
    await expect(status).toHaveText('');
    // "backup": só os artigos que falam de backup; os grupos sem resultado somem
    await page.getByLabel('Buscar na ajuda').fill('backup');
    const ids = await visiveis(page).evaluateAll(els => els.map(e => e.id));
    expect(ids).toEqual(expect.arrayContaining(['fazer-backup', 'restaurar', 'trocar-de-celular']));
    expect(ids).not.toContain('virada-do-mes');
    await expect(status).toHaveText(`${ids.length} artigos encontrados.`);
    await expect(page.locator('#meu-mes')).toBeHidden();
    await expect(page.locator('#seus-dados')).toBeVisible();
    // sem acento e com mais de uma palavra
    await page.getByLabel('Buscar na ajuda').fill('divida validade');
    await expect(visiveis(page)).toHaveCount(1);
    await expect(visiveis(page).locator('h3')).toHaveText('Registrar uma proposta de quitação com desconto');
    await expect(status).toHaveText('1 artigo encontrado.');
    // nada encontrado: diz e aponta para o contato
    await page.getByLabel('Buscar na ajuda').fill('xyzabc');
    await expect(visiveis(page)).toHaveCount(0);
    await expect(status).toHaveText('Nenhum artigo encontrado.');
    await expect(page.locator('#aj-vazio')).toBeVisible();
    await expect(page.locator('#aj-vazio a')).toHaveAttribute('href', '/contato.html');
    // limpar a busca volta tudo
    await page.getByLabel('Buscar na ajuda').fill('');
    await expect(visiveis(page)).toHaveCount(TOTAL);
    await expect(status).toHaveText('');
    await expect(page.locator('#aj-vazio')).toBeHidden();
    // Enter abre o primeiro resultado
    await page.getByLabel('Buscar na ajuda').fill('saldo inicial');
    await page.getByLabel('Buscar na ajuda').press('Enter');
    await expect(artigo(page, 'saldo-inicial')).toHaveAttribute('open', '');
    semErros(erros);
  });

  test('ajuda: os artigos abrem e fecham pelo clique e pelo teclado, com link direto por #ancora', async ({ page }) => {
    const erros = await abrir(page, URL);
    const a = artigo(page, 'desfazer');
    await expect(a.locator('.aj-corpo')).toBeHidden();
    await a.locator('summary').click();
    await expect(a.locator('.aj-corpo')).toBeVisible();
    expect(new globalThis.URL(page.url()).hash).toBe('#desfazer');   // dá para copiar o link do artigo aberto
    await a.locator('summary').click();
    await expect(a.locator('.aj-corpo')).toBeHidden();
    expect(new globalThis.URL(page.url()).hash).toBe('');
    // teclado: Tab chega no título, Enter e Espaço abrem e fecham
    const b = artigo(page, 'gerar-pdf');
    await b.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(b).toHaveAttribute('open', '');
    await page.keyboard.press('Space');
    await expect(b).not.toHaveAttribute('open', '');
    // os títulos dos artigos são h3 dentro dos grupos (h2)
    await expect(page.locator('.aj-grupo > h2')).toHaveText(['Começar', 'Meu mês', 'Dívidas', 'Relatório', 'Orientador e consultas', 'Plano e assinatura', 'Seus dados', 'Problemas comuns']);
    // link direto: abre o artigo e leva até ele
    await page.goto(URL + '#fazer-backup');
    await expect(artigo(page, 'fazer-backup')).toHaveAttribute('open', '');
    await expect(artigo(page, 'fazer-backup').locator('.aj-corpo')).toBeInViewport();
    // link dentro de um artigo para outro artigo
    await artigo(page, 'trocar-de-celular').locator('summary').click();
    await artigo(page, 'trocar-de-celular').getByRole('link', { name: 'restaure o backup' }).click();
    await expect(artigo(page, 'restaurar')).toHaveAttribute('open', '');
    // "Não achou?" leva ao contato
    await expect(page.locator('#nao-achou a')).toHaveAttribute('href', '/contato.html');
    semErros(erros);
  });

  test('ajuda: o Bip em 3D carrega depois do conteúdo, só nesta página, com o canvas escondido dos leitores de tela', async ({ page }) => {
    const pedidos = [];
    page.on('request', r => { if (r.url().includes('three.min.js')) pedidos.push(r.url()); });
    // anota quando a página terminou de carregar e quando o script do three.js entrou na página
    await page.addInitScript(() => {
      addEventListener('load', () => { window.__carregou = performance.now(); });
      new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
        if (n.tagName === 'SCRIPT' && /three/.test(n.src || '')) window.__three = performance.now();
      }))).observe(document, { childList: true, subtree: true });
    });
    const erros = await abrir(page, URL);
    const bip = page.locator('#aj-bip');
    await expect(bip).toHaveAttribute('data-bip', '3d', { timeout: 20_000 });
    expect(pedidos).toEqual(['https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js']);
    // o three.js só começa a baixar depois que a página terminou de carregar
    const ordem = await page.evaluate(() => ({ carregou: window.__carregou, three: window.__three }));
    expect(ordem.carregou).toBeGreaterThan(0);
    expect(ordem.three).toBeGreaterThanOrEqual(ordem.carregou);
    expect(await page.evaluate(() => document.querySelectorAll('script[src*="three"]').length)).toBe(1);
    await expect(bip.locator('canvas')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('#aj-bip-desc')).not.toHaveAttribute('hidden', '');
    await expect(bip.locator('figcaption')).toHaveText('Bip, o ajudante da Warden');
    await expect(bip.locator('.aj-bip-dica')).toBeVisible();
    // tocar acena e arrastar gira, sem erro
    const box = await bip.locator('canvas').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.move(box.x + 40, box.y + 60); await page.mouse.down(); await page.mouse.move(box.x + 160, box.y + 60, { steps: 6 }); await page.mouse.up();
    // outras páginas não carregam o three.js
    pedidos.length = 0;
    await abrir(page, '/contato.html');
    await page.waitForTimeout(800);
    expect(pedidos).toEqual([]);
    semErros(erros);
  });

  test.describe('movimento reduzido', () => {
    test.use({ reducedMotion: 'reduce' });
    test('ajuda: com prefers-reduced-motion o Bip é uma imagem estática, o three.js nem é baixado e a página funciona igual', async ({ page }) => {
      const pedidos = [];
      page.on('request', r => { if (r.url().includes('three.min.js')) pedidos.push(r.url()); });
      const erros = await abrir(page, URL);
      await page.waitForTimeout(1000);
      const bip = page.locator('#aj-bip');
      await expect(bip).toHaveAttribute('data-bip', 'imagem');
      await expect(bip).toHaveAttribute('data-motivo', 'movimento-reduzido');
      expect(pedidos).toEqual([]);
      const img = bip.locator('img');
      await expect(img).toBeVisible();
      expect(await img.getAttribute('alt')).toMatch(/^Bip, o ajudante da Warden/);
      expect(await img.evaluate(i => i.complete && i.naturalWidth > 0)).toBe(true);
      await expect(page.locator('#aj-bip-desc')).toHaveAttribute('hidden', '');   // a descrição já está no alt
      await page.getByLabel('Buscar na ajuda').fill('cancelar');
      await expect(page.locator('#aj-status')).toHaveText('1 artigo encontrado.');
      semErros(erros);
    });
  });

  test.describe('economia de dados', () => {
    test('ajuda: com economia de dados ou conexão lenta, imagem estática', async ({ page }) => {
      await page.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { saveData: true, effectiveType: '4g' } }));
      const erros = await abrir(page, URL);
      await page.waitForTimeout(800);
      await expect(page.locator('#aj-bip')).toHaveAttribute('data-motivo', 'economia-de-dados');
      await expect(page.locator('#aj-bip')).toHaveAttribute('data-bip', 'imagem');
      semErros(erros);
    });
  });

  test.describe('celular (390px)', () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test('ajuda no celular: Bip menor e acima do título, sem rolagem horizontal', async ({ page }) => {
      const erros = await abrir(page, URL);
      const palco = await page.locator('.aj-bip-palco').boundingBox(), h1 = await page.locator('h1').boundingBox();
      expect(palco.height).toBeLessThanOrEqual(200);
      expect(palco.y + palco.height).toBeLessThanOrEqual(h1.y);
      for (const id of ['comecar', 'dividas', 'problemas']) await page.locator(`#${id} .aj-artigo`).first().locator('summary').click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      // o título de cada artigo é uma área de toque confortável
      expect((await page.locator('.aj-artigo summary').first().boundingBox()).height).toBeGreaterThanOrEqual(44);
      semErros(erros);
    });
  });

  test('ajuda: link no rodapé do site e em Ajustes do Control', async ({ page }) => {
    const erros = await abrir(page, '/contato.html');
    await expect(page.locator('footer.rodape a[href="/ajuda/"]')).toHaveText('Central de ajuda');
    await abrir(page, '/control/#ajustes');
    await expect(page.locator('[data-ajuda] a[href="/ajuda/"]')).toContainText('Central de ajuda');
    semErros(erros);
  });
});
