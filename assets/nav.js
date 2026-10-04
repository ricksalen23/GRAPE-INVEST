/*
 * WARDEN — nav compartilhado (logo, Ferramentas + mega-menu, Cobrança,
 * Control Finance, Login/avatar, hambúrguer + menu mobile) + faixa de cotações logo abaixo dele.
 * Nav e faixa ficam juntos num contêiner fixo (.topo-fixo); a altura total está em --topo-h (warden.css).
 *
 * Uso: coloque como PRIMEIRO elemento do <body>, sem async/defer:
 *   <script src="/assets/nav.js" data-page="home"></script>      ← na home (index.html)
 *   <script src="/assets/nav.js"></script>                       ← em qualquer outra página
 * O script insere o nav no lugar onde está, então o HTML existe antes dos scripts da página rodarem.
 *
 * Login: o modal de login só existe na home. Em outras páginas, "Login" leva para a home
 * (o modal não abre por hash/parâmetro de URL — decisão do projeto).
 */

/* ============================================================
 * FERRAMENTAS — fonte única do mapa (mega-menu desktop + acordeão mobile).
 * Para lançar uma ferramenta: crie a página em `url` e mude `disponivel` para true.
 * O pontinho verde, a cor e o contador "1/7" se atualizam sozinhos.
 * `detalhe` (opcional) aparece numa segunda linha menor.
 * ============================================================ */
const FERRAMENTAS = [
  { categoria: 'Investimentos', icone: 'invest', itens: [
    { nome: 'Juros compostos', url: '/#calculadora', disponivel: true },
    { nome: 'Simulador renda fixa', detalhe: 'CDB, LCI, Tesouro', url: '/ferramentas/simulador-renda-fixa.html', disponivel: true },
    { nome: 'Poupança x CDB x Tesouro', url: '/ferramentas/poupanca-x-cdb-x-tesouro.html', disponivel: true },
    { nome: 'Viver de renda', url: '/ferramentas/viver-de-renda.html', disponivel: true },
    { nome: 'Dividendos e preço teto', url: '/ferramentas/dividendos-e-preco-teto.html', disponivel: true },
    { nome: 'Rentabilidade real', url: '/ferramentas/rentabilidade-real.html', disponivel: true },
    { nome: 'Conversor de taxas', url: '/ferramentas/conversor-de-taxas.html', disponivel: true }
  ] },
  { categoria: 'Trabalho (CLT)', icone: 'clt', itens: [
    { nome: 'Salário líquido', url: '/ferramentas/salario-liquido.html', disponivel: true },
    { nome: 'Rescisão', url: '/ferramentas/rescisao.html', disponivel: true },
    { nome: 'Férias', url: '/ferramentas/ferias.html', disponivel: true },
    { nome: '13º salário', url: '/ferramentas/decimo-terceiro.html', disponivel: true },
    { nome: 'Hora extra', url: '/ferramentas/hora-extra.html', disponivel: true },
    { nome: 'CLT x PJ', url: '/ferramentas/clt-x-pj.html', disponivel: true }
  ] },
  { categoria: 'MEI e autônomo', icone: 'mei', itens: [
    { nome: 'Quanto cobrar por hora', url: '/ferramentas/quanto-cobrar-por-hora.html', disponivel: true },
    { nome: 'Markup e margem', url: '/ferramentas/markup-e-margem.html', disponivel: true },
    { nome: 'Ponto de equilíbrio', url: '/ferramentas/ponto-de-equilibrio.html', disponivel: true },
    { nome: 'Gerador de recibo', url: '/ferramentas/gerador-de-recibo.html', disponivel: true },
    { nome: 'Gerador de QR Code Pix', url: '/ferramentas/gerador-qr-code-pix.html', disponivel: true },
    { nome: 'Gerador de orçamento', url: '/ferramentas/gerador-de-orcamento.html', disponivel: true }
  ] },
  { categoria: 'Dívidas e consumo', icone: 'dividas', itens: [
    { nome: 'Plano de quitação', url: '/ferramentas/plano-de-quitacao.html', disponivel: true },
    { nome: 'SAC x Price', url: '/ferramentas/sac-x-price.html', disponivel: true },
    { nome: 'Consórcio x financiamento', url: '/ferramentas/consorcio-x-financiamento.html', disponivel: true },
    { nome: 'Juros do cartão', url: '/ferramentas/juros-do-cartao.html', disponivel: true },
    { nome: 'À vista ou parcelado?', url: '/ferramentas/a-vista-ou-parcelado.html', disponivel: true },
    { nome: 'Custo real em horas', url: '/ferramentas/custo-real-em-horas.html', disponivel: true }
  ] },
  { categoria: 'Planejamento', icone: 'plano', itens: [
    { nome: 'Reserva de emergência', url: '/ferramentas/reserva-de-emergencia.html', disponivel: true },
    { nome: 'Regra 50-30-20', url: '/ferramentas/regra-50-30-20.html', disponivel: true },
    { nome: 'Meta mensal', url: '/ferramentas/meta-mensal.html', disponivel: true },
    { nome: 'Aposentadoria', url: '/ferramentas/aposentadoria.html', disponivel: true }
  ] }
];
window.WARDEN_FERRAMENTAS = FERRAMENTAS;

/* ===== PERFIL (indicador de login persistente) — globais, usadas pelo login da home ===== */
function getInitials(nome) {
  if (!nome) return '';
  const partes = nome.trim().split(/\s+/);
  return (partes[0][0] + (partes[1] ? partes[1][0] : '')).toUpperCase();
}

function renderNavAuthState() {
  const logado = localStorage.getItem('wardenLoggedIn') === 'true';
  const loginBtn = document.getElementById('nav-login-btn');
  const profile = document.getElementById('nav-profile');
  if (!logado) {
    loginBtn.classList.remove('hidden');
    profile.classList.add('hidden');
    return;
  }
  loginBtn.classList.add('hidden');
  profile.classList.remove('hidden');
  const nome = localStorage.getItem('wardenUserName') || '';
  const foto = localStorage.getItem('wardenUserPhoto');
  document.getElementById('profile-dropdown-name').textContent = nome || 'Minha conta';
  const avatarEl = document.getElementById('nav-avatar-content');
  if (foto) {
    avatarEl.innerHTML = `<img src="${foto}" alt="${nome || 'Foto de perfil'}">`;
  } else if (nome) {
    avatarEl.innerHTML = `<span class="nav-avatar-initials">${getInitials(nome)}</span>`;
  } else {
    avatarEl.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.5-7 8-7s8 3 8 7"/>
      </svg>`;
  }
}

function toggleProfileMenu(e) {
  e.stopPropagation();
  document.getElementById('profile-dropdown').classList.toggle('hidden');
}

function alterarFotoPerfil(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    localStorage.setItem('wardenUserPhoto', ev.target.result);
    renderNavAuthState();
  };
  reader.readAsDataURL(file);
}

function fazerLogout() {
  localStorage.removeItem('wardenLoggedIn');
  document.getElementById('profile-dropdown').classList.add('hidden');
  renderNavAuthState();
}

/* ===== MONTAGEM + COMPORTAMENTO DO NAV ===== */
(function () {
  const script = document.currentScript;
  const isHome = script && script.dataset.page === 'home';
  // na home os links de seção são "#cobranca"; nas outras páginas, "/#cobranca"
  const H = isHome ? '' : '/';
  const link = url => (isHome && url.startsWith('/#')) ? url.slice(1) : url;
  const paginaAtual = location.pathname.replace(/\/index\.html$/, '/');

  const ICONES = {
    invest: '<polyline points="3 17 9 11 13 15 21 7"/><polyline points="15 7 21 7 21 13"/>',
    clt: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>',
    mei: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>',
    dividas: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/>',
    plano: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M9 12h6"/>',
    chev: '<polyline points="6 9 12 15 18 9"/>'
  };
  const svgIcone = (nome, cls = '') =>
    `<svg ${cls ? `class="${cls}" ` : ''}viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nome]}</svg>`;

  // disponível vira link; futura vira texto (fora do Tab, sem hover) com title "Em breve"
  const itemFerramenta = f => {
    const detalhe = f.detalhe ? `<span class="tool-detail">${f.detalhe}</span>` : '';
    if (!f.disponivel) {
      return `<li><span class="tool-item off" title="Em breve" aria-disabled="true">${f.nome}${detalhe}</span></li>`;
    }
    const atual = f.url === paginaAtual ? ' aria-current="page"' : '';
    return `<li><a class="tool-item on" href="${link(f.url)}"${atual}>${f.nome}${detalhe}</a></li>`;
  };
  const contador = cat => {
    const ativos = cat.itens.filter(f => f.disponivel).length;
    return `<span class="tool-count" aria-label="${ativos} de ${cat.itens.length} disponíveis">${ativos}/${cat.itens.length}</span>`;
  };
  const cobrancaCard = `
    <div class="cobranca-card">
      <div class="cobranca-card-icon">${svgIcone('chat')}</div>
      <div class="cobranca-card-text">
        <h4>Warden Cobrança</h4>
        <p>Cobre seus clientes no WhatsApp, com Pix, no automático.</p>
      </div>
      <a class="cobranca-card-btn" href="${H}#cobranca">Conhecer →</a>
    </div>`;

  const megaCols = FERRAMENTAS.map(cat => `
    <div class="mega-col">
      <div class="mega-col-head">${svgIcone(cat.icone)}<p class="section-label">${cat.categoria}</p>${contador(cat)}</div>
      <ul>${cat.itens.map(itemFerramenta).join('')}</ul>
    </div>`).join('');
  const mobileCats = FERRAMENTAS.map(cat => `
    <details class="mobile-cat">
      <summary>${svgIcone(cat.icone)}<span class="section-label">${cat.categoria}</span>${contador(cat)}${svgIcone('chev', 'chev')}</summary>
      <ul>${cat.itens.map(itemFerramenta).join('')}</ul>
    </details>`).join('');

  /* ===== FAIXA DE COTAÇÕES: itens e formatação ===== */
  // moedas e cripto: AwesomeAPI (uma chamada só); taxas: Banco Central via Warden.getTaxasBCB() do kit
  const COTACOES = [
    { id: 'USD', sigla: 'USD/BRL', tipo: 'moeda' },
    { id: 'EUR', sigla: 'EUR/BRL', tipo: 'moeda' },
    { id: 'GBP', sigla: 'GBP/BRL', tipo: 'moeda' },
    { id: 'BTC', sigla: 'BTC/BRL', tipo: 'cripto' },
    { id: 'ETH', sigla: 'ETH/BRL', tipo: 'cripto' },
    { id: 'selic', sigla: 'SELIC', tipo: 'taxa' },
    { id: 'cdi', sigla: 'CDI', tipo: 'taxa' },
    { id: 'ipca', sigla: 'IPCA 12M', tipo: 'taxa' }
  ];
  const num2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const num0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  // R$ 5,22 · cripto acima de R$ 1.000 sem centavos (R$ 444.303) · taxas em % (13,75%)
  function textoValor(c, v) {
    if (typeof v !== 'number' || !isFinite(v)) return '—';
    if (c.tipo === 'taxa') return num2.format(v) + '%';
    return 'R$ ' + (c.tipo === 'cripto' && v > 1000 ? num0 : num2).format(v);
  }
  // ▲ 0,35% (alta) · ▼ 0,35% (queda) · 0,00% em cinza; sem dado (ou taxa) → vazio
  function variacao(p) {
    if (typeof p !== 'number' || !isFinite(p)) return { texto: '', classe: '' };
    const r = Math.round(p * 100) / 100;
    if (r === 0) return { texto: num2.format(0) + '%', classe: 'zero' };
    return { texto: (r > 0 ? '▲ ' : '▼ ') + num2.format(Math.abs(r)) + '%', classe: r > 0 ? 'alta' : 'queda' };
  }
  const itemFaixa = c => `<li class="faixa-item" data-cot="${c.id}"><span class="faixa-sigla">${c.sigla}</span><span class="faixa-valor">—</span>${c.tipo === 'taxa' ? '' : '<span class="faixa-var"></span>'}</li>`;
  const listaFaixa = COTACOES.map(itemFaixa).join('');
  // a segunda cópia só existe para o loop sem emenda: escondida de leitores de tela
  const faixaHtml = `
<div class="faixa-cotacoes" id="faixa-cotacoes" role="region" aria-label="Cotações">
  <div class="faixa-trilho" id="faixa-trilho">
    <ul class="faixa-lista">${listaFaixa}</ul>
    <ul class="faixa-lista" aria-hidden="true">${listaFaixa}</ul>
  </div>
</div>`;

  const html = `
<div class="topo-fixo" id="topo-fixo">
<nav>
  <a href="${isHome ? '#' : '/'}"><img src="/warden-logo-cropped-transparent.png" alt="Warden Finance" class="logo-img"></a>
  <div class="nav-links">
    <div class="nav-tools" id="nav-tools">
      <button type="button" class="nav-tools-btn" id="nav-tools-btn" aria-expanded="false" aria-controls="mega-menu">
        Ferramentas
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="mega-menu" id="mega-menu" role="region" aria-label="Mapa de ferramentas">
        <div class="mega-cols" id="mega-cols">${megaCols}</div>
        <div class="mega-foot">
          ${cobrancaCard}
        </div>
      </div>
    </div>
    <a class="nav-item nav-cobranca" href="${H}#cobranca">Cobrança <span class="badge-novo">Novo</span></a>
    <a class="nav-item" href="/app.html" data-control-finance>Control Finance</a>
    <button class="nav-login-btn" id="nav-login-btn">Login</button>
    <div id="nav-profile" class="nav-profile hidden">
      <button class="nav-avatar-btn" onclick="toggleProfileMenu(event)" aria-label="Minha conta">
        <span id="nav-avatar-content"></span>
      </button>
      <div id="profile-dropdown" class="profile-dropdown hidden">
        <p class="profile-dropdown-name" id="profile-dropdown-name"></p>
        <button type="button" class="profile-dropdown-item" onclick="document.getElementById('profile-avatar-input').click()">Alterar foto</button>
        <input type="file" id="profile-avatar-input" accept="image/*" onchange="alterarFotoPerfil(event)" hidden>
        <button type="button" class="profile-dropdown-item danger" onclick="fazerLogout()">Sair</button>
      </div>
    </div>
    <button type="button" class="nav-burger" id="nav-burger" aria-expanded="false" aria-controls="mobile-menu" aria-label="Abrir menu">
      <svg class="icon-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
      <svg class="icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
  </div>
</nav>
${faixaHtml}
</div>

<!-- Escurece a página enquanto o mega-menu de Ferramentas está aberto; clicar fecha -->
<div class="mega-overlay" id="mega-overlay" aria-hidden="true"></div>

<!-- Menu-mapa mobile (abaixo de 900px) — fica fora do <nav> porque o backdrop-filter do nav prenderia o position:fixed -->
<div class="mobile-menu" id="mobile-menu" aria-label="Menu">
  <div class="mobile-menu-inner">
    ${cobrancaCard}
    <div id="mobile-cats">${mobileCats}</div>
    <div class="mobile-links">
      <a href="/app.html" data-control-finance>Control Finance</a>
    </div>
  </div>
</div>`;

  script.insertAdjacentHTML('beforebegin', html);

  // --- Login e Control Finance: usam o fluxo da home quando ele existe; senão levam para a home ---
  document.getElementById('nav-login-btn').addEventListener('click', () => {
    if (typeof window.toggleLoginModal === 'function') window.toggleLoginModal();
    else location.href = '/';
  });
  document.querySelectorAll('[data-control-finance]').forEach(a => a.addEventListener('click', e => {
    if (typeof window.abrirControlFinance === 'function') return window.abrirControlFinance(e);
    if (localStorage.getItem('wardenLoggedIn') !== 'true') { e.preventDefault(); location.href = '/'; }
  }));

  // --- desktop: mega-menu ---
  const topoEl = document.getElementById('topo-fixo');
  const navTools = document.getElementById('nav-tools');
  const toolsBtn = document.getElementById('nav-tools-btn');
  const megaMenu = document.getElementById('mega-menu');
  const megaOverlay = document.getElementById('mega-overlay');
  const temHover = window.matchMedia('(hover: hover) and (pointer: fine)');
  let megaTimer = null;
  let abertoPorHover = false;

  function setMega(aberto) {
    clearTimeout(megaTimer);
    // overlay começa exatamente na borda inferior do topo fixo (nav + faixa; a altura muda com o breakpoint)
    if (aberto) megaOverlay.style.top = topoEl.getBoundingClientRect().bottom + 'px';
    megaMenu.classList.toggle('open', aberto);
    megaOverlay.classList.toggle('open', aberto);
    toolsBtn.setAttribute('aria-expanded', String(aberto));
    if (!aberto) abertoPorHover = false;
  }
  navTools.addEventListener('mouseenter', () => {
    if (!temHover.matches) return;
    clearTimeout(megaTimer);
    if (!megaMenu.classList.contains('open')) { abertoPorHover = true; setMega(true); }
  });
  navTools.addEventListener('mouseleave', () => {
    if (!temHover.matches) return;
    megaTimer = setTimeout(() => setMega(false), 150);
  });
  toolsBtn.addEventListener('click', () => {
    // se o hover acabou de abrir, o clique "fixa" em vez de fechar
    if (abertoPorHover) { abertoPorHover = false; return; }
    setMega(!megaMenu.classList.contains('open'));
  });
  navTools.addEventListener('focusout', e => {
    if (!navTools.contains(e.relatedTarget)) setMega(false);
  });
  megaMenu.addEventListener('click', e => {
    if (e.target.closest('a')) setMega(false);
  });

  // --- mobile: painel em tela cheia ---
  const burger = document.getElementById('nav-burger');
  const mobileMenu = document.getElementById('mobile-menu');
  function setMobile(aberto) {
    mobileMenu.classList.toggle('open', aberto);
    burger.setAttribute('aria-expanded', String(aberto));
    burger.setAttribute('aria-label', aberto ? 'Fechar menu' : 'Abrir menu');
    document.body.classList.toggle('menu-open', aberto);
  }
  burger.addEventListener('click', () => setMobile(!mobileMenu.classList.contains('open')));
  mobileMenu.addEventListener('click', e => {
    if (e.target.closest('a')) setMobile(false);
  });
  window.matchMedia('(min-width: 901px)').addEventListener('change', e => { if (e.matches) setMobile(false); });

  // usado por botões da página (ex.: "Explorar ferramentas" do hero): mesmo mega-menu do nav (ou o painel mobile abaixo de 900px)
  window.abrirFerramentas = function (e) {
    if (e) e.stopPropagation(); // senão o "clique fora" do document fecha na hora
    if (window.matchMedia('(max-width: 900px)').matches) {
      setMobile(true);
      return;
    }
    abertoPorHover = false;
    setMega(true);
    // teclado: leva o foco para o primeiro link do painel
    if (e && e.detail === 0) {
      const primeiro = megaMenu.querySelector('a');
      if (primeiro) setTimeout(() => primeiro.focus(), 0);
    }
  };

  // fecha ao clicar fora / Esc
  document.addEventListener('click', e => {
    if (!navTools.contains(e.target)) setMega(false);
    const profile = document.getElementById('nav-profile');
    if (profile && !profile.contains(e.target)) {
      document.getElementById('profile-dropdown').classList.add('hidden');
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (megaMenu.classList.contains('open')) { setMega(false); toolsBtn.focus(); }
    if (mobileMenu.classList.contains('open')) { setMobile(false); burger.focus(); }
  });

  renderNavAuthState();
  iniciarFaixa();

  /* ===== FAIXA DE COTAÇÕES: dados + rolagem infinita ===== */
  function iniciarFaixa() {
    const faixa = document.getElementById('faixa-cotacoes');
    const trilho = document.getElementById('faixa-trilho');
    const lista = trilho.querySelector('.faixa-lista');
    const CACHE = 'warden:cotacoes';
    const URL_MOEDAS = 'https://economia.awesomeapi.com.br/last/' + COTACOES.filter(c => c.tipo !== 'taxa').map(c => c.id + '-BRL').join(',');
    const VELOCIDADE = 40;   // px por segundo
    const ATUALIZAR_MS = 60000;

    // --- dados: últimos valores bons ficam no localStorage para a faixa aparecer cheia ao abrir outra página ---
    // { USD: { v: 5.22, p: 0.35 }, …, selic: { v: 13.75, atualizado: '03/10/2026', ts }, … }
    // taxas do BC valem até 7 dias (mesma regra do kit); sem valor, o item da taxa some da faixa
    const TAXA_VALIDA_MS = 7 * 86400000;
    let dados = {};
    try { dados = JSON.parse(localStorage.getItem(CACHE)) || {}; } catch (e) { dados = {}; }
    COTACOES.filter(c => c.tipo === 'taxa').forEach(c => {
      const d = dados[c.id];
      if (d && !(d.ts && Date.now() - d.ts < TAXA_VALIDA_MS)) delete dados[c.id];
    });
    function salvar() {
      try { localStorage.setItem(CACHE, JSON.stringify(dados)); } catch (e) { /* sem cache, tudo bem */ }
    }
    // só troca textos, classes e visibilidade (as duas cópias): a animação não é reiniciada
    function pintar() {
      COTACOES.forEach(c => {
        const d = dados[c.id] || {};
        const valor = textoValor(c, d.v);
        const vr = variacao(d.p);
        const some = c.tipo === 'taxa' && valor === '—';
        const dica = c.tipo === 'taxa' && d.atualizado ? `Banco Central · atualizado em ${d.atualizado}` : '';
        faixa.querySelectorAll(`[data-cot="${c.id}"]`).forEach(li => {
          if (li.hidden !== some) li.hidden = some;
          if (li.title !== dica) li.title = dica;
          const v = li.querySelector('.faixa-valor');
          if (v.textContent !== valor) v.textContent = valor;
          const p = li.querySelector('.faixa-var');
          if (p && p.textContent !== vr.texto) { p.textContent = vr.texto; p.className = 'faixa-var ' + vr.classe; }
        });
      });
    }

    async function buscarMoedas() {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      try {
        const resp = await fetch(URL_MOEDAS, { signal: ctrl.signal });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const json = await resp.json();
        let mudou = false;
        COTACOES.filter(c => c.tipo !== 'taxa').forEach(c => {
          const d = json[c.id + 'BRL'];
          const v = d ? parseFloat(d.bid) : NaN;
          if (!isFinite(v)) return;   // item sem dado: mantém o último valor bom
          const p = parseFloat(d.pctChange);
          dados[c.id] = { v, p: isFinite(p) ? p : null };
          mudou = true;
        });
        if (mudou) { salvar(); pintar(); }
      } catch (e) {
        /* API fora do ar: fica com o cache (ou "—") */
      } finally {
        clearTimeout(timer);
      }
    }

    // o kit (/assets/tools.js) tem o getTaxasBCB; nas páginas que não o carregam (a home), ele é injetado
    let promessaKit = null;
    function carregarKit() {
      if (!promessaKit) promessaKit = new Promise(resolve => {
        const pronto = () => {
          if (window.Warden) return resolve(window.Warden);
          const s = document.createElement('script');
          s.src = '/assets/tools.js';
          s.onload = () => resolve(window.Warden || null);
          s.onerror = () => resolve(null);
          document.body.appendChild(s);
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pronto, { once: true });
        else pronto();
      });
      return promessaKit;
    }
    async function buscarTaxas() {
      try {
        const W = await carregarKit();
        if (!W) return;
        const t = await W.getTaxasBCB();
        if (!t.datas) return;
        // só dado do BC (API, site ou último valor de até 7 dias); CDI estimado e valor de referência não viram cotação
        let mudou = false;
        ['selic', 'cdi', 'ipca'].forEach(n => {
          const d = t.datas[n];
          if (!['sgs', 'site', 'cache'].includes(d.origem)) return;
          // validade conta do dia em que o valor foi obtido ('dd/mm/aaaa'), não de agora
          const [dia, mes, ano] = String(d.atualizado || '').split('/').map(Number);
          const ts = ano ? new Date(ano, mes - 1, dia, 12).getTime() : Date.now();
          dados[n] = { v: d.valor, atualizado: d.atualizado, ts };
          mudou = true;
        });
        if (mudou) { salvar(); pintar(); }
      } catch (e) { /* idem */ }
    }

    function atualizar() { return Promise.all([buscarMoedas(), buscarTaxas()]); }
    window.WardenFaixa = { atualizar };   // usado pelos testes

    pintar();
    atualizar();
    setInterval(atualizar, ATUALIZAR_MS);

    // --- rolagem: Web Animations de 0 a -50% (a 2ª cópia toma o lugar da 1ª), velocidade pela largura real ---
    const semAnimacao = window.matchMedia('(prefers-reduced-motion: reduce)');
    let anim = null;
    let pausas = 0;   // mouse em cima e/ou dedo na tela
    function duracao() { return lista.getBoundingClientRect().width / VELOCIDADE * 1000; }
    function ajustar() {
      if (semAnimacao.matches) {
        if (anim) { anim.cancel(); anim = null; }
        faixa.tabIndex = 0;   // rolagem manual também pelo teclado
        return;
      }
      faixa.removeAttribute('tabindex');
      const d = duracao();
      if (!d) return;
      if (!anim) {
        anim = trilho.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-50%)' }],
          { duration: d, iterations: Infinity, easing: 'linear' });
        if (pausas) anim.pause();
      } else {
        // largura mudou (valores chegaram, fonte carregou): mantém ~40px/s sem reiniciar nem pular
        anim.updatePlaybackRate(anim.effect.getTiming().duration / d);
      }
    }
    function pausar(sim) {
      pausas = Math.max(0, pausas + (sim ? 1 : -1));
      if (!anim) return;
      if (pausas) anim.pause(); else anim.play();
    }
    let mouseDentro = false, dedoNaTela = false;
    faixa.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse' && !mouseDentro) { mouseDentro = true; pausar(true); } });
    faixa.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && mouseDentro) { mouseDentro = false; pausar(false); } });
    faixa.addEventListener('touchstart', () => { if (!dedoNaTela) { dedoNaTela = true; pausar(true); } }, { passive: true });
    const soltar = () => { if (dedoNaTela) { dedoNaTela = false; pausar(false); } };
    faixa.addEventListener('touchend', soltar);
    faixa.addEventListener('touchcancel', soltar);

    if ('ResizeObserver' in window) new ResizeObserver(ajustar).observe(lista);
    else window.addEventListener('load', ajustar);
    semAnimacao.addEventListener('change', ajustar);
    ajustar();
  }
})();
