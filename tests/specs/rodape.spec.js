// Rodapé do site (/assets/footer.js, carregado pelo nav.js) e páginas institucionais (sobre, contato, privacidade, termos).
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { abrir, semErros } = require('../helpers');
const { PAGINAS } = require('../ferramentas');

const RAIZ = path.join(__dirname, '..', '..');
const SITE = 'https://wardenfinance.com.br';

// ferramentas escolhidas para o rodapé, na ordem pedida
const COLUNAS_ESPERADAS = {
  'Investimentos': ['Juros compostos', 'Simulador renda fixa', 'Poupança x CDB x Tesouro', 'Viver de renda'],
  'Trabalho': ['Salário líquido', 'Rescisão', 'Férias', '13º salário'],
  'MEI e autônomo': ['Gerador de QR Code Pix', 'Quanto cobrar por hora', 'Gerador de recibo', 'Gerador de orçamento'],
  'Dívidas': ['Plano de quitação', 'Juros do cartão', 'À vista ou parcelado?', 'Custo real em horas'],
  'Planejamento': ['Reserva de emergência', 'Regra 50-30-20', 'Meta mensal', 'Aposentadoria']
};
const WARDEN = ['Warden Cobrança', 'Control Finance', 'Sobre', 'Contato', 'Política de Privacidade', 'Termos de Uso'];

const lerRodape = page => page.evaluate(() => {
  const f = document.querySelectorAll('footer.rodape');
  const r = f[0];
  if (!r) return { quantos: 0 };
  return {
    quantos: f.length,
    noFim: r.getBoundingClientRect().bottom + window.scrollY >= document.documentElement.scrollHeight - 1,
    colunas: [...r.querySelectorAll('.rodape-col')].map(c => ({
      titulo: c.querySelector('.rodape-titulo').textContent.trim(),
      aberta: c.open,
      links: [...c.querySelectorAll('a')].map(a => a.textContent.trim()),
      verTodas: !!c.querySelector('[data-ver-todas]')
    })),
    marca: [...r.querySelector('.rodape-marca').children].map(el => el.className),
    textoMarca: r.querySelector('.rodape-marca').textContent.trim(),
    logo: r.querySelector('.rodape-logo img').getAttribute('src'),
    base: r.querySelector('.rodape-base').innerText,
    rolagem: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});

for (const p of PAGINAS) {
  test.describe(p.slug, () => {
    test('rodape: aparece no fim da página, com marca, 6 colunas e linha final (desktop e celular)', async ({ page }) => {
      const erros = await abrir(page, p.url);
      // desktop: colunas abertas (o título não abre/fecha)
      const d = await lerRodape(page);
      expect(d.quantos, 'um rodapé').toBe(1);
      expect(d.noFim, 'rodapé no fim da página').toBe(true);
      expect(d.logo).toBe('/warden-logo-cropped-transparent.png');
      expect(d.marca, 'marca: só a logo (sem frase embaixo)').toEqual(['rodape-logo']);
      expect(d.textoMarca, 'nenhum texto embaixo da logo').toBe('');
      expect(d.colunas.map(c => c.titulo)).toEqual([...Object.keys(COLUNAS_ESPERADAS), 'Warden']);
      expect(d.colunas.every(c => c.aberta), 'colunas abertas no desktop').toBe(true);
      expect(d.base).toContain('© 2026 Warden Finance. Todos os direitos reservados.');
      expect(d.base.trim(), 'linha final só com o ©').toBe('© 2026 Warden Finance. Todos os direitos reservados.');
      // celular: acordeão fechado, abre ao tocar, toques de 44px, margens de 16px, sem rolagem lateral
      await page.setViewportSize({ width: 375, height: 800 });
      await expect.poll(async () => (await lerRodape(page)).colunas.every(c => !c.aberta), { message: 'acordeão começa fechado no celular' }).toBe(true);
      const m = await lerRodape(page);
      expect(m.rolagem, 'rolagem horizontal').toBeLessThanOrEqual(0);
      const col = page.locator('.rodape-col').first();
      await col.locator('summary').click();
      await expect(col).toHaveAttribute('open', '');
      await page.waitForTimeout(300);   // a seta gira ao abrir: mede depois da animação
      const medidas = await page.evaluate(() => {
        const W = document.documentElement.clientWidth;
        const alvos = [...document.querySelectorAll('.rodape summary, .rodape-col[open] a, .rodape-col[open] button, .rodape-redes a, .rodape-logo')];
        return {
          pequenos: alvos.map(el => { const b = el.getBoundingClientRect(); return { t: el.textContent.trim().slice(0, 25) || el.getAttribute('aria-label'), h: b.height, w: b.width }; })
            .filter(x => x.h < 44 || x.w < 44).map(x => `${x.t} (${Math.round(x.w)}×${Math.round(x.h)})`),
          bordas: [...document.querySelectorAll('.rodape *')].filter(el => { const b = el.getBoundingClientRect(); return b.width && (b.left < 15.5 || W - b.right < 15.5); })
            .map(el => el.tagName.toLowerCase() + '.' + el.getAttribute('class'))
        };
      });
      expect(medidas.pequenos, 'toques menores que 44px').toEqual([]);
      expect(medidas.bordas, 'encostando nas bordas').toEqual([]);
      semErros(erros);
    });
  });
}

test.describe('geral', () => {
  test('rodape: colunas saem da lista FERRAMENTAS do nav.js (itens com rodape: 1..4, na ordem) + coluna Warden', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/ferias.html');
    const d = await lerRodape(page);
    const daLista = await page.evaluate(() => window.WARDEN_FERRAMENTAS.map(c => ({
      titulo: c.curto || c.categoria,
      links: c.itens.filter(f => f.disponivel && f.rodape).sort((a, b) => a.rodape - b.rodape).map(f => f.nome)
    })));
    expect(d.colunas.slice(0, 5).map(c => ({ titulo: c.titulo, links: c.links }))).toEqual(daLista);
    for (const c of d.colunas.slice(0, 5)) {
      expect(c.links, c.titulo).toEqual(COLUNAS_ESPERADAS[c.titulo]);
      expect(c.verTodas, `"Ver todas" em ${c.titulo}`).toBe(true);
    }
    expect(d.colunas[5].links).toEqual(WARDEN);
    semErros(erros);
  });

  test('rodape: todo link interno abre uma página que existe; o da Cobrança leva à seção da home', async ({ page, request }) => {
    const erros = await abrir(page, '/ferramentas/ferias.html');
    const hrefs = await page.locator('footer.rodape a').evaluateAll(l => l.map(a => a.getAttribute('href')));
    const internos = [...new Set(hrefs.filter(h => h.startsWith('/') || h.startsWith('#')))];
    expect(internos).toContain('/cobranca/');
    expect(internos).toContain('/ferramentas/juros-compostos.html');
    for (const h of internos) {
      const [caminho, ancora] = h.split('#');
      const r = await request.get(caminho || '/index.html');
      expect(r.status(), h).toBe(200);
      if (ancora) expect(await r.text(), h).toContain(`id="${ancora}"`);
    }
    // na home também: Cobrança e juros compostos são páginas próprias
    await abrir(page, '/index.html');
    expect(await page.locator('footer.rodape a', { hasText: 'Warden Cobrança' }).getAttribute('href')).toBe('/cobranca/');
    expect(await page.locator('footer.rodape a', { hasText: 'Juros compostos' }).getAttribute('href')).toBe('/ferramentas/juros-compostos.html');
    semErros(erros);
  });

  test('rodape: "Ver todas" abre o mega-menu no desktop e o menu mobile no celular', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/rescisao.html');
    await page.locator('.rodape-col').nth(1).locator('[data-ver-todas]').click();
    await expect(page.locator('#mega-menu')).toHaveClass(/open/);
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 844 });
    const col = page.locator('.rodape-col').nth(2);
    await col.locator('summary').click();
    await col.locator('[data-ver-todas]').click();
    await expect(page.locator('#mobile-menu')).toHaveClass(/open/);
    semErros(erros);
  });

  test('rodape: links em cinza ficam brancos no hover', async ({ page }) => {
    const erros = await abrir(page, '/ferramentas/meta-mensal.html');
    const a = page.locator('.rodape-col a').first();
    const cor = () => a.evaluate(el => getComputedStyle(el).color);
    const muted = await page.evaluate(() => { const s = document.createElement('span'); s.style.color = 'var(--muted)'; document.body.appendChild(s); const c = getComputedStyle(s).color; s.remove(); return c; });
    expect(await cor()).toBe(muted);
    await a.hover();
    await expect.poll(cor).toBe('rgb(255, 255, 255)');
    semErros(erros);
  });

  test('rodape: com o FOOTER_CONFIG de hoje (sem redes) o espaço dos ícones some; WhatsApp não aparece no rodapé; campos vazios somem', async ({ page }) => {
    let erros = await abrir(page, '/ferramentas/ferias.html');
    expect(await page.locator('.rodape-redes').count(), 'bloco de redes').toBe(0);
    expect(await page.locator('footer.rodape a[href*="wa.me"]').count(), 'WhatsApp no rodapé').toBe(0);
    // sem redes e sem frase, a logo é o único item da coluna da marca
    expect(await page.locator('.rodape-marca > *').evaluateAll(l => l.map(el => el.className))).toEqual(['rodape-logo']);
    expect(await page.locator('.rodape-frase').count(), 'frase da marca').toBe(0);
    expect(await page.locator('.rodape-base').innerText()).not.toMatch(/CNPJ\s*\d/);
    semErros(erros);
    erros = await abrir(page, '/contato.html');
    const zap = await page.locator('#contato-whatsapp').getAttribute('href');
    expect(zap).toBe('https://wa.me/5564993342646?text=' + encodeURIComponent('Olá! Vim pelo site da Warden e queria falar com vocês.'));
    expect(await page.locator('#contato-email').count(), 'botão de e-mail sem e-mail').toBe(0);
    semErros(erros);
    erros = await abrir(page, '/privacidade.html');
    const texto = await page.locator('article').innerText();
    expect(texto, 'CNPJ da empresa').not.toMatch(/CNPJ\s*\d/);
    expect(texto).not.toMatch(/e-mail\s*\./);
    semErros(erros);
  });

  test('rodape: com o FOOTER_CONFIG preenchido, redes (sem WhatsApp), e-mail, razão social e CNPJ aparecem no rodapé e nas páginas', async ({ page }) => {
    // valores de teste, trocados na rota (o arquivo do site não muda)
    const cfg = { instagram: '@exemplo', tiktok: 'https://www.tiktok.com/@exemplo', youtube: 'exemplo', whatsapp: '5511999990000', email: 'contato@exemplo.com', cnpj: '00.000.000/0001-00', razaoSocial: 'Exemplo Ltda' };
    await page.route('**/assets/footer.js', async route => {
      const resp = await route.fetch();
      const js = (await resp.text()).replace(/const FOOTER_CONFIG = \{[^}]*\};/, 'const FOOTER_CONFIG = ' + JSON.stringify(cfg) + ';');
      await route.fulfill({ response: resp, body: js });
    });
    let erros = await abrir(page, '/ferramentas/ferias.html');
    const redes = await page.locator('.rodape-redes a').evaluateAll(l => l.map(a => [a.dataset.rede, a.getAttribute('href')]));
    expect(redes).toEqual([
      ['instagram', 'https://www.instagram.com/exemplo'],
      ['tiktok', 'https://www.tiktok.com/@exemplo'],
      ['youtube', 'https://www.youtube.com/@exemplo']
    ]);
    // ícones em SVG de linha (sem emoji)
    const icones = await page.locator('.rodape-redes a svg').evaluateAll(l => l.map(s => [s.getAttribute('fill'), s.getAttribute('stroke')]));
    expect(icones).toEqual(Array(3).fill(['none', 'currentColor']));
    // sem a frase, os ícones vêm logo abaixo da logo, com um respiro (não colados)
    const vao = await page.evaluate(() => document.querySelector('.rodape-redes').getBoundingClientRect().top - document.querySelector('.rodape-logo').getBoundingClientRect().bottom);
    expect(vao).toBeGreaterThanOrEqual(12);
    expect(await page.locator('.rodape-base').innerText()).toContain('Exemplo Ltda · CNPJ 00.000.000/0001-00');
    semErros(erros);
    erros = await abrir(page, '/contato.html');
    expect(await page.locator('#contato-email').getAttribute('href')).toBe('mailto:contato@exemplo.com');
    await expect(page.locator('#contato-email')).toContainText('contato@exemplo.com');
    semErros(erros);
    erros = await abrir(page, '/privacidade.html');
    await expect(page.locator('article')).toContainText('Warden Finance (Exemplo Ltda, CNPJ 00.000.000/0001-00)');
    await expect(page.locator('article')).toContainText('ou pelo e-mail contato@exemplo.com');
    semErros(erros);
  });

  test('rodape: "Control Finance" no rodapé leva à página inicial quando não há login', async ({ page }) => {
    await abrir(page, '/ferramentas/ferias.html');
    await page.locator('footer.rodape a', { hasText: 'Control Finance' }).click();
    await expect(page).toHaveURL(/\/(index\.html)?$/);
  });

  test('paginas: privacidade e termos têm o aviso de rascunho no código; sobre tem o espaço da história', async ({ request }) => {
    for (const arq of ['/privacidade.html', '/termos.html']) {
      expect(await (await request.get(arq)).text(), arq).toContain('<!-- Rascunho — revisar com advogado antes de lançar a Cobrança -->');
    }
    const sobre = await (await request.get('/sobre.html')).text();
    expect(sobre).toContain('id="historia"');
    expect(sobre).toContain('ESCREVA AQUI A SUA HISTÓRIA');
  });

  test('seo: sitemap.xml tem todas as páginas do site (e só elas) e o robots.txt aponta para ele', async ({ request }) => {
    const xml = fs.readFileSync(path.join(RAIZ, 'sitemap.xml'), 'utf8');
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]).sort();
    const esperadas = PAGINAS.map(p => p.slug === 'home' ? SITE + '/' : SITE + p.url).sort();
    expect(locs).toEqual(esperadas);
    for (const u of locs) expect((await request.get(u.replace(SITE, '') || '/')).status(), u).toBe(200);
    const robots = fs.readFileSync(path.join(RAIZ, 'robots.txt'), 'utf8');
    expect(robots).toContain(`Sitemap: ${SITE}/sitemap.xml`);
  });
});
