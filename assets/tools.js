/*
 * WARDEN — kit das ferramentas (/ferramentas/*). Tudo fica no objeto global `Warden`.
 *
 * Uso: no fim do <body>, ANTES do <script> da página (e depois do nav.js, que vem no topo):
 *   <script src="/assets/tools.js"></script>
 *   <script> const { formatBRL, parseNumero } = Warden; … </script>
 *
 * Ao carregar, o kit completa sozinho os componentes declarados no HTML:
 *   <div class="tool-crumbs" data-crumbs></div>          → trilha "Início / Ferramentas / <categoria>" (categoria vem do FERRAMENTAS do nav.js)
 *                                                           + schema.org BreadcrumbList
 *   <div data-ponte-cobranca data-titulo="…" data-texto="…"></div>   → card verde do Warden Cobrança (link /#cobranca)
 *   <p class="tool-disclaimer" data-aviso-educativo>texto extra</p>  → começa com "Simulação educativa. Não é recomendação…"
 *   <div class="tool-faq" data-faq><details><summary>Pergunta</summary><div>Resposta</div></details>…</div>
 *                                                         → perguntas ficam no HTML; o kit gera o schema.org FAQPage
 * Funções: formatBRL, formatBRLCompacto, formatPct, formatNumero, parseNumero, campoBRL,
 *          getTaxasBCB (+ TAXAS_REFERENCIA), taxaMensal, aporteNecessario, cardResultado, estiloGrafico.
 */
(function () {
  /* ===== FORMATAÇÃO ===== */
  const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtBRLCompacto = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
  const fmtFixo = {};   // cache de formatadores por número de casas
  const fmtCurto = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

  // R$ 1.234,56
  const formatBRL = v => fmtBRL.format(v);
  // R$ 12,5 mil (eixos de gráfico)
  const formatBRLCompacto = v => fmtBRLCompacto.format(v);

  // 1.234,56 · { casas: 0 } → 1.235 · { curto: true } → 17,5 / 100 (sem zeros sobrando, até 2 casas)
  function formatNumero(v, { casas = 2, curto = false } = {}) {
    if (curto) return fmtCurto.format(v);
    fmtFixo[casas] = fmtFixo[casas] || new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
    return fmtFixo[casas].format(v);
  }

  // 13,65% · { sinal: true } → +3,76% · { curto: true } → 17,5% · { casas: 1 } → 13,7%
  function formatPct(v, { casas = 2, curto = false, sinal = false } = {}) {
    return (sinal && v > 0 ? '+' : '') + formatNumero(v, { casas, curto }) + '%';
  }

  // texto digitado → número. Aceita "1.500,50", "1500,5", "1.500" (mil e quinhentos), "150.00" e "R$ 10". Inválido → NaN.
  function parseNumero(valor) {
    if (typeof valor === 'number') return valor;
    let s = String(valor == null ? '' : valor).trim();
    const negativo = /^-/.test(s);
    s = s.replace(/[^\d.,]/g, '');
    if (!s) return NaN;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const n = parseFloat(s);
    return isFinite(n) ? (negativo ? -n : n) : NaN;
  }

  // Máscara de R$ num <input>: separa milhar enquanto digita (sem o cursor pular), ponto digitado vira vírgula,
  // no máximo `casas` decimais; ao sair do campo completa as casas (150 → 150,00). Leia com parseNumero(input.value).
  // Chame ANTES de registrar os listeners da página, para a máscara rodar primeiro.
  function campoBRL(input, { casas = 2 } = {}) {
    input.type = 'text';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    const completo = n => formatNumero(n, { casas });

    input.addEventListener('input', e => {
      let v = input.value;
      const pos = input.selectionStart == null ? v.length : input.selectionStart;
      // colar, arrastar, preenchimento automático ou valor vindo de script (sem inputType): interpreta o texto inteiro
      // ("150.00" é cento e cinquenta, não quinze mil); só digitação/apagar passa pela máscara tecla a tecla
      if (!e.inputType || e.inputType === 'insertFromPaste' || e.inputType === 'insertFromDrop' || e.inputType === 'insertReplacementText') {
        const n = parseNumero(v);
        input.value = isFinite(n) && n >= 0 ? completo(n) : '';
        return;
      }
      if (e.data === '.' && v[pos - 1] === '.') v = v.slice(0, pos - 1) + ',' + v.slice(pos);
      const antes = v.slice(0, pos).replace(/[^\d,]/g, '').length;   // dígitos/vírgula antes do cursor
      let limpo = v.replace(/[^\d,]/g, '');
      const virgula = limpo.indexOf(',');
      if (virgula >= 0) limpo = limpo.slice(0, virgula + 1) + limpo.slice(virgula + 1).replace(/,/g, '').slice(0, casas);
      let [inteiro, dec] = limpo.split(',');
      inteiro = inteiro.replace(/^0+(?=\d)/, '');
      if (dec !== undefined && inteiro === '') inteiro = '0';
      const novo = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (dec !== undefined && casas > 0 ? ',' + dec : '');
      if (novo === input.value) return;
      input.value = novo;
      let p = 0, c = 0;
      while (p < novo.length && c < antes) { if (/[\d,]/.test(novo[p])) c++; p++; }
      try { input.setSelectionRange(p, p); } catch (err) { /* sem foco */ }
    });
    input.addEventListener('blur', () => {
      const n = parseNumero(input.value);
      if (input.value && isFinite(n)) input.value = completo(n);
    });
    if (input.value) { const n = parseNumero(input.value); if (isFinite(n)) input.value = completo(n); }
  }

  /* ===== TAXAS DO BANCO CENTRAL (Selic, CDI, IPCA) =====
   * getTaxasBCB() → Promise<{ selic, cdi, ipca, fonte: 'bcb' | 'referencia', datas? }>
   * Busca na API SGS do Banco Central, guarda 12h no localStorage e, se a API não responder,
   * devolve TAXAS_REFERENCIA (fonte 'referencia'). Nunca rejeita. Várias chamadas na mesma página = uma busca só. */
  // Valores de reserva: atualize de tempos em tempos. Selic e CDI em % ao ano; IPCA acumulado em 12 meses (%).
  const TAXAS_REFERENCIA = Object.freeze({ selic: 13.75, cdi: 13.65, ipca: 4.22, mes: 'set/2026' });
  // Séries do SGS: Selic meta, CDI anualizado e IPCA acumulado em 12 meses
  const SERIES_BCB = { selic: 432, cdi: 4389, ipca: 13522 };
  const CACHE_TAXAS = 'warden:taxas-bcb';
  const CACHE_HORAS = 12;

  async function buscarSerie(codigo) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const resp = await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados/ultimos/1?formato=json`, { signal: ctrl.signal });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const json = await resp.json();
      const valor = parseFloat(String(json[0].valor).replace(',', '.'));
      if (!isFinite(valor)) throw new Error('valor inválido');
      return { valor, data: json[0].data };
    } finally {
      clearTimeout(timer);
    }
  }

  function lerCacheTaxas() {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_TAXAS));
      if (c && Date.now() - c.ts < CACHE_HORAS * 3600 * 1000) return c;
    } catch (e) { /* localStorage indisponível ou corrompido: ignora */ }
    return null;
  }
  function salvarCacheTaxas(dados) {
    try { localStorage.setItem(CACHE_TAXAS, JSON.stringify({ ...dados, ts: Date.now() })); } catch (e) { /* sem cache, tudo bem */ }
  }

  let promessaTaxas = null;
  function getTaxasBCB() {
    if (!promessaTaxas) promessaTaxas = (async () => {
      let dados = lerCacheTaxas();
      if (!dados) {
        try {
          const [selic, cdi, ipca] = await Promise.all([buscarSerie(SERIES_BCB.selic), buscarSerie(SERIES_BCB.cdi), buscarSerie(SERIES_BCB.ipca)]);
          dados = { selic, cdi, ipca };
          salvarCacheTaxas(dados);
        } catch (e) {
          return { ...TAXAS_REFERENCIA, fonte: 'referencia' };
        }
      }
      return { selic: dados.selic.valor, cdi: dados.cdi.valor, ipca: dados.ipca.valor, fonte: 'bcb', datas: dados };
    })();
    return promessaTaxas;
  }

  /* ===== MATEMÁTICA FINANCEIRA ===== */
  // taxa anual em % → taxa mensal equivalente (decimal). 12% a.a. → 0,009489
  const taxaMensal = anualPct => Math.pow(1 + anualPct / 100, 1 / 12) - 1;

  // Aporte mensal (no fim de cada mês) para sair de `atual` e chegar a `meta` em `n` meses, com juros `i` ao mês (decimal):
  //   aporte = (meta − atual·(1+i)^n) · i / ((1+i)^n − 1)        sem juros (i = 0): (meta − atual) / n
  // Retorna 0 se o que já existe (com rendimento) já cobre a meta.
  function aporteNecessario(meta, atual, i, n) {
    if (n <= 0) return Math.max(0, meta - atual);
    if (i === 0) return Math.max(0, (meta - atual) / n);
    const f = Math.pow(1 + i, n);
    return Math.max(0, (meta - atual * f) * i / (f - 1));
  }

  /* ===== COMPONENTES ===== */
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Card de resultado (HTML). destaque: borda e valor em --accent; selo: etiqueta no topo (ex.: "Melhor opção").
  // linhas: [[rótulo, valor], …] → lista de detalhes no rodapé do card. Textos entram como HTML (vêm do código, não do usuário).
  function cardResultado({ titulo, descricao = '', rotulo = '', valor, linhas = [], destaque = false, selo = '' }) {
    return `
        <article class="result-card${destaque ? ' destaque' : ''}">
          ${selo ? `<span class="result-selo">${selo}</span>` : ''}
          <h3>${titulo}</h3>
          <p class="result-desc">${descricao}</p>
          <p class="result-label">${rotulo}</p>
          <p class="result-valor">${valor}</p>
          ${linhas.length ? `<dl>
            ${linhas.map(([dt, dd]) => `<div><dt>${dt}</dt><dd>${dd}</dd></div>`).join('\n            ')}
          </dl>` : ''}
        </article>`;
  }

  // Configuração visual comum dos gráficos (Chart.js): fontes, cores do tema, tooltip, legenda e prefers-reduced-motion.
  // Também redesenha os gráficos quando as fontes da página terminam de carregar: o Chart.js mede legenda e eixos
  // na criação, e se a Inter ainda não chegou, a medida sai com a fonte reserva (legenda fica deslocada).
  let redesenhoAgendado = false;
  function estiloGrafico() {
    const css = getComputedStyle(document.documentElement);
    const cor = v => css.getPropertyValue(v).trim();
    const semAnimacao = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (window.Chart) {
      Chart.defaults.font.family = "'Inter', sans-serif";
      Chart.defaults.color = cor('--muted');
      if (!redesenhoAgendado && document.fonts) {
        redesenhoAgendado = true;
        document.fonts.ready.then(() => Object.values(Chart.instances).forEach(c => c.update('none')));
      }
    }
    return {
      cor,
      semAnimacao,
      animacao: semAnimacao ? false : { duration: 400 },
      grade: 'rgba(243,241,234,0.08)',
      neutros: ['#B4B2A7', '#6F6D64'],   // tons para séries que não são o destaque (o destaque é sempre --accent)
      legenda: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'line', boxWidth: 24, padding: 18 } },
      tooltip: {
        backgroundColor: cor('--surface2'), borderColor: cor('--border'), borderWidth: 1,
        titleColor: cor('--text'), bodyColor: cor('--text'), padding: 12,
        bodyFont: { family: "'IBM Plex Mono', monospace" }
      }
    };
  }

  const SITE = 'https://wardenfinance.com.br';
  function addJsonLd(obj) {
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.textContent = JSON.stringify(obj);
    document.head.appendChild(s);
  }
  const ICONE_CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M9 12h6"/></svg>';

  // ferramenta atual no FERRAMENTAS do nav.js (compara pelo nome do arquivo, funciona em qualquer pasta)
  function ferramentaAtual() {
    const arquivo = location.pathname.split('/').pop();
    for (const cat of window.WARDEN_FERRAMENTAS || [])
      for (const f of cat.itens)
        if (f.url.split('/').pop() === arquivo) return { categoria: cat.categoria, ...f };
    return null;
  }

  function montarCrumbs() {
    const el = document.querySelector('[data-crumbs]');
    if (!el) return;
    const f = ferramentaAtual();
    el.setAttribute('role', 'navigation');
    el.setAttribute('aria-label', 'Você está em');
    el.innerHTML = `<a href="/">Início</a><span aria-hidden="true">/</span><span>Ferramentas</span>` +
      (f ? `<span aria-hidden="true">/</span><span>${esc(f.categoria)}</span>` : '');
    const canonical = document.querySelector('link[rel="canonical"]');
    addJsonLd({
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Início', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: f ? f.nome : document.title, item: canonical ? canonical.href : location.href }
      ]
    });
  }

  function montarPontes() {
    document.querySelectorAll('[data-ponte-cobranca]').forEach(el => {
      el.classList.add('cobranca-card');
      el.innerHTML = `
      <div class="cobranca-card-icon">${ICONE_CHAT}</div>
      <div class="cobranca-card-text">
        <h2>${esc(el.dataset.titulo || 'Cansado de cobrar cliente?')}</h2>
        <p>${esc(el.dataset.texto || 'O Warden Cobrança cobra seus clientes no WhatsApp, com Pix, no automático.')}</p>
      </div>
      <a class="cobranca-card-btn" href="/#cobranca">${esc(el.dataset.botao || 'Conhecer o Warden Cobrança →')}</a>`;
    });
  }

  function montarAvisos() {
    document.querySelectorAll('[data-aviso-educativo]').forEach(el => {
      el.insertAdjacentHTML('afterbegin', '<strong>Simulação educativa. Não é recomendação de investimento.</strong> ');
      el.normalize();   // junta o espaço inserido ao texto da página num nó só (senão o navegador espaça diferente)
    });
  }

  function montarFaq() {
    const perguntas = [...document.querySelectorAll('[data-faq] details')].map(d => {
      const q = d.querySelector('summary');
      const resposta = [...d.children].filter(c => c !== q).map(c => c.textContent.trim()).join(' ');
      return { '@type': 'Question', name: q.textContent.trim(), acceptedAnswer: { '@type': 'Answer', text: resposta.replace(/\s+/g, ' ') } };
    });
    if (perguntas.length) addJsonLd({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: perguntas });
  }

  montarCrumbs();
  montarPontes();
  montarAvisos();
  montarFaq();

  window.Warden = {
    formatBRL, formatBRLCompacto, formatNumero, formatPct, parseNumero, campoBRL,
    TAXAS_REFERENCIA, getTaxasBCB,
    taxaMensal, aporteNecessario,
    cardResultado, estiloGrafico
  };
})();
