/*
 * WARDEN — rodapé do site. Carregado pelo /assets/nav.js (não precisa de <script> na página).
 * Monta o <footer> no fim do <body>: marca + redes (só as preenchidas), colunas de ferramentas (da lista FERRAMENTAS
 * do nav.js, itens com `rodape: 1..4`), coluna "Warden" e a linha final (©, + razão social/CNPJ se preenchidos).
 * O aviso educativo fica dentro de cada ferramenta, não no rodapé.
 *
 * FOOTER_CONFIG: preencha aqui. Campo vazio não aparece em lugar nenhum (nem link, nem linha de CNPJ).
 *   instagram / tiktok / youtube → @usuário ou link completo (ícones no rodapé)
 *   whatsapp → só números, com DDI e DDD (usado na página de contato; não aparece no rodapé)
 *   email → contato@… · cnpj → "00.000.000/0000-00" · razaoSocial → nome empresarial
 * As páginas também podem mostrar esses dados (privacidade, contato…):
 *   <span data-config="email"></span>              → texto do campo
 *   <a data-config-link="whatsapp|email" data-mensagem="…"> → vira link (wa.me com a mensagem / mailto)
 *   <… data-config-se="cnpj">…</…>                  → o elemento some se o campo estiver vazio
 */
const FOOTER_CONFIG = { instagram: "", tiktok: "", youtube: "", whatsapp: "5564993342646", email: "", cnpj: "", razaoSocial: "" };

(function () {
  const C = FOOTER_CONFIG;
  window.WARDEN_CONFIG = C;
  const isHome = !!(document.currentScript && document.currentScript.dataset.page === 'home');
  const link = url => (isHome && url.startsWith('/#')) ? url.slice(1) : url;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const MSG_WHATSAPP = 'Olá! Vim pelo site da Warden.';

  const linkWhatsApp = (msg = MSG_WHATSAPP) => C.whatsapp ? `https://wa.me/${C.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}` : '';
  // "@warden" ou "warden" → perfil; link completo → usa como está
  const perfil = (valor, base) => {
    if (!valor) return '';
    if (/^https?:\/\//.test(valor)) return valor;
    return base + valor.replace(/^@/, '');
  };
  const REDES = [
    { id: 'instagram', nome: 'Instagram', url: perfil(C.instagram, 'https://www.instagram.com/'),
      svg: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6" fill="currentColor"/>' },
    { id: 'tiktok', nome: 'TikTok', url: perfil(C.tiktok, 'https://www.tiktok.com/@'),
      svg: '<path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3c.4 2.6 2.1 4.3 5 4.6"/>' },
    { id: 'youtube', nome: 'YouTube', url: perfil(C.youtube, 'https://www.youtube.com/@'),
      svg: '<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="M10 9.2v5.6l4.8-2.8z"/>' }
  ].filter(r => r.url);
  const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const chev = '<svg class="rodape-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';

  // colunas de ferramentas: mesma lista do mega-menu
  const colunas = (window.WARDEN_FERRAMENTAS || []).map(cat => {
    const itens = cat.itens.filter(f => f.disponivel && f.rodape).sort((a, b) => a.rodape - b.rodape);
    return `
      <details class="rodape-col">
        <summary><h2 class="rodape-titulo">${esc(cat.curto || cat.categoria)}</h2>${chev}</summary>
        <ul>
          ${itens.map(f => `<li><a href="${link(f.url)}">${esc(f.nome)}</a></li>`).join('')}
          <li><button type="button" class="rodape-todas" data-ver-todas aria-controls="mega-menu">Ver todas</button></li>
        </ul>
      </details>`;
  }).join('');
  const colunaWarden = `
      <details class="rodape-col">
        <summary><h2 class="rodape-titulo">Warden</h2>${chev}</summary>
        <ul>
          <li><a href="/cobranca/">Warden Cobrança</a></li>
          <li><a href="/app.html" data-control-finance>Control Finance</a></li>
          <li><a href="/sobre.html">Sobre</a></li>
          <li><a href="/contato.html">Contato</a></li>
          <li><a href="/privacidade.html">Política de Privacidade</a></li>
          <li><a href="/termos.html">Termos de Uso</a></li>
        </ul>
      </details>`;

  const ano = new Date().getFullYear();
  const empresa = [C.razaoSocial && esc(C.razaoSocial), C.cnpj && `CNPJ ${esc(C.cnpj)}`].filter(Boolean).join(' · ');
  const html = `
<footer class="rodape" id="rodape">
  <div class="rodape-inner">
    <div class="rodape-marca">
      <a class="rodape-logo" href="${isHome ? '#' : '/'}"><img src="/warden-logo-cropped-transparent.png" alt="Warden Finance" width="190" height="36" loading="lazy"></a>
      ${REDES.length ? `<ul class="rodape-redes">${REDES.map(r => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener" aria-label="${r.nome} da Warden" data-rede="${r.id}">${svg(r.svg)}</a></li>`).join('')}</ul>` : ''}
    </div>
    <div class="rodape-links" role="navigation" aria-label="Rodapé">${colunas}${colunaWarden}
    </div>
  </div>
  <div class="rodape-base">
    <p>© ${ano} Warden Finance. Todos os direitos reservados.${empresa ? ` <span class="rodape-empresa">${empresa}</span>` : ''}</p>
  </div>
</footer>`;

  function montar() {
    if (document.getElementById('rodape')) return;
    document.body.insertAdjacentHTML('beforeend', html);
    const rodape = document.getElementById('rodape');

    // desktop: colunas sempre abertas (o summary vira só título); celular: acordeão, começa fechado
    const desktop = window.matchMedia('(min-width: 901px)');
    const cols = rodape.querySelectorAll('.rodape-col');
    const ajustar = () => cols.forEach(d => { d.open = desktop.matches; });
    ajustar();
    desktop.addEventListener('change', ajustar);
    cols.forEach(d => d.querySelector('summary').addEventListener('click', e => { if (desktop.matches) e.preventDefault(); }));

    // "Ver todas": o mesmo mega-menu do nav (no celular, o menu mobile)
    rodape.querySelectorAll('[data-ver-todas]').forEach(b => b.addEventListener('click', e => {
      if (typeof window.abrirFerramentas === 'function') window.abrirFerramentas(e);
    }));

    preencherConfig();
  }

  // dados do FOOTER_CONFIG nas páginas (privacidade, termos, contato…)
  function preencherConfig() {
    document.querySelectorAll('[data-config-se]').forEach(el => { if (!C[el.dataset.configSe]) el.remove(); });
    document.querySelectorAll('[data-config]').forEach(el => { el.textContent = C[el.dataset.config] || ''; });
    document.querySelectorAll('[data-config-link]').forEach(el => {
      const campo = el.dataset.configLink;
      const url = campo === 'whatsapp' ? linkWhatsApp(el.dataset.mensagem || MSG_WHATSAPP)
        : campo === 'email' && C.email ? `mailto:${C.email}` : '';
      if (!url) { el.remove(); return; }
      el.href = url;
      if (campo === 'whatsapp') { el.target = '_blank'; el.rel = 'noopener'; }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar, { once: true });
  else montar();
})();
