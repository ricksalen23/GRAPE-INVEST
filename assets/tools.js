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
 *   <div class="tool-rendimento" data-rendimento></div>  → seletor de rendimento (CDI líquido de IR / outra taxa / sem);
 *                                                           ligue com Warden.campoRendimento(el, calcular)
 * Funções: formatBRL, formatBRLCompacto, formatPct, formatNumero, parseNumero, campoBRL,
 *          getTaxasBCB (+ TAXAS_REFERENCIA, fonteTaxa), IR_REGRESSIVO, aliquotaIR, liquidaDeIR,
 *          taxaMensal, taxaMensalDe, parcelaPrice, aporteNecessario, serieAcumulacao,
 *          campoRendimento, copiarTexto, cardResultado, estiloGrafico.
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

  // de onde veio a taxa, para mostrar ao usuário: "Banco Central, 01/10/2026" / "valor de referência (set/2026)…"
  // t sem `fonte` (ainda carregando, ex.: TAXAS_REFERENCIA) → "buscando no Banco Central…"
  function fonteTaxa(t) {
    if (t.fonte === 'bcb') return `Banco Central, ${t.datas.cdi.data}`;
    if (t.fonte === 'referencia') return `valor de referência de ${TAXAS_REFERENCIA.mes}, porque não foi possível buscar a taxa de hoje`;
    return 'buscando a taxa de hoje no Banco Central…';
  }

  /* ===== IMPOSTO DE RENDA (renda fixa: CDB, Tesouro) =====
   * Tabela regressiva sobre o RENDIMENTO. Cada faixa vale para aplicações de "até X dias corridos".
   * Regras mudam: atualize AQUI e todas as ferramentas acompanham. Mantenha em ordem crescente. */
  const IR_REGRESSIVO = Object.freeze([
    { ateDias: 180,      aliquota: 0.225 },  // até 180 dias: 22,5%
    { ateDias: 360,      aliquota: 0.20  },  // 181 a 360 dias: 20%
    { ateDias: 720,      aliquota: 0.175 },  // 361 a 720 dias: 17,5%
    { ateDias: Infinity, aliquota: 0.15  }   // acima de 720 dias: 15%
  ]);
  const aliquotaIR = dias => IR_REGRESSIVO.find(f => dias <= f.ateDias).aliquota;
  // meses → dias corridos aproximados (ano de 365,25 dias): 6 meses = 183, 12 = 365, 24 = 731
  const diasDeMeses = meses => Math.round(meses * 365.25 / 12);

  // Taxa mensal LÍQUIDA de IR, de forma conservadora: usa a alíquota do prazo total e tira o IR do rendimento
  // de todo mês: i_líquida = i_bruta × (1 − alíquota). Dá um pouco menos do que cobrar o IR só no resgate,
  // e mantém a conta dos depósitos mensais (aporteNecessario) simples. → { i, aliquota, dias }
  function liquidaDeIR(iMensalBruta, meses) {
    const dias = diasDeMeses(meses);
    const aliquota = aliquotaIR(dias);
    return { i: iMensalBruta * (1 - aliquota), aliquota, dias };
  }

  /* ===== MATEMÁTICA FINANCEIRA ===== */
  // taxa anual em % → taxa mensal equivalente (decimal). 12% a.a. → 0,009489
  const taxaMensal = anualPct => Math.pow(1 + anualPct / 100, 1 / 12) - 1;
  // taxa digitada (%) com o período escolhido num <select> ('am' = ao mês, 'aa' = ao ano) → taxa mensal (decimal)
  const taxaMensalDe = (valorPct, periodo) => periodo === 'aa' ? taxaMensal(valorPct) : valorPct / 100;

  // Tabela Price: parcela fixa = PV × i ÷ (1 − (1 + i)^−n). Sem juros (i = 0): PV ÷ n.
  function parcelaPrice(pv, i, n) {
    if (n <= 0) return 0;
    return i === 0 ? pv / n : pv * i / (1 - Math.pow(1 + i, -n));
  }

  // Aporte mensal (no fim de cada mês) para sair de `atual` e chegar a `meta` em `n` meses, com juros `i` ao mês (decimal):
  //   aporte = (meta − atual·(1+i)^n) · i / ((1+i)^n − 1)        sem juros (i = 0): (meta − atual) / n
  // Retorna 0 se o que já existe (com rendimento) já cobre a meta.
  function aporteNecessario(meta, atual, i, n) {
    if (n <= 0) return Math.max(0, meta - atual);
    if (i === 0) return Math.max(0, (meta - atual) / n);
    const f = Math.pow(1 + i, n);
    return Math.max(0, (meta - atual * f) * i / (f - 1));
  }

  // Evolução mês a mês (para gráficos): começa com `atual`, rende `i` ao mês e recebe `aporte` no fim de cada mês.
  // → { saldo: [mês 0 … meses], depositado: [mês 0 … meses] }  (depositado = atual + aportes, sem juros)
  function serieAcumulacao(atual, aporte, i, meses) {
    const saldo = [atual], depositado = [atual];
    for (let m = 1; m <= meses; m++) {
      saldo.push(saldo[m - 1] * (1 + i) + aporte);
      depositado.push(depositado[m - 1] + aporte);
    }
    return { saldo, depositado };
  }

  /* ===== SELETOR DE RENDIMENTO =====
   * <div class="tool-rendimento" data-rendimento></div> dentro do formulário (um por página; os ids são fixos).
   * O kit desenha: "Rendimento" (CDI de hoje / Sem rendimento / Outra taxa) + taxa com período (% ao mês/ano)
   * + caixa "Descontar Imposto de Renda" (só em Outra taxa; o CDI sempre desconta).
   * Na página: const rend = Warden.campoRendimento(el, calcular);   // calcular roda a cada mudança e quando o CDI chega
   *            const { i, ir, texto } = rend.ler(meses);             // i = taxa mensal (decimal) já líquida de IR quando for o caso */
  const HTML_RENDIMENTO = `
        <div class="tool-field">
          <label for="rendimento">Rendimento</label>
          <div class="tool-input">
            <select id="rendimento" class="tool-rendimento-tipo">
              <option value="cdi" selected>CDI de hoje</option>
              <option value="zero">Sem rendimento</option>
              <option value="outra">Outra taxa</option>
            </select>
          </div>
          <span class="tool-hint" id="rendimento-dica"></span>
        </div>
        <div class="tool-field" id="campo-taxa" hidden>
          <label for="taxa">Taxa</label>
          <div class="tool-input">
            <input type="number" id="taxa" value="1" min="0" max="100" step="0.01" inputmode="decimal">
            <select id="taxa-unidade" aria-label="Período da taxa">
              <option value="am" selected>% ao mês</option>
              <option value="aa">% ao ano</option>
            </select>
          </div>
          <span class="tool-hint" id="taxa-dica"></span>
        </div>
        <label class="tool-ir" id="linha-ir" hidden>
          <input type="checkbox" id="taxa-ir" checked>
          <span><strong>Descontar Imposto de Renda</strong> (CDB, Tesouro). Desmarque para LCI, LCA e poupança, que são isentas, ou se a taxa já for líquida.</span>
        </label>
      `;

  function montarRendimentos() {
    document.querySelectorAll('[data-rendimento]').forEach(el => { el.innerHTML = HTML_RENDIMENTO; });
  }

  function campoRendimento(el, aoMudar) {
    const q = id => el.querySelector('#' + id);
    let taxas = { ...TAXAS_REFERENCIA };
    ['taxa'].forEach(id => q(id).addEventListener('input', aoMudar));
    ['rendimento', 'taxa-unidade', 'taxa-ir'].forEach(id => q(id).addEventListener('change', aoMudar));
    getTaxasBCB().then(t => { taxas = t; aoMudar(); });

    // taxa mensal conforme a opção; IR: alíquota da tabela regressiva para `meses`, descontada do rendimento de todo mês
    function ler(meses) {
      const tipo = q('rendimento').value;
      q('campo-taxa').hidden = q('linha-ir').hidden = tipo !== 'outra';
      q('rendimento-dica').textContent = tipo === 'cdi' ? `${formatPct(taxas.cdi)} ao ano` : '';
      if (tipo === 'zero') return { i: 0, bruta: 0, ir: false, aliquota: 0, tipo, texto: 'Sem rendimento: o dinheiro fica parado.' };

      let bruta, texto;
      if (tipo === 'cdi') {
        bruta = taxaMensal(taxas.cdi);
        texto = `CDI de ${formatPct(taxas.cdi)} ao ano (${fonteTaxa(taxas)})`;
      } else {
        const v = Math.max(0, parseFloat(q('taxa').value) || 0);
        if (q('taxa-unidade').value === 'am') {
          bruta = v / 100;
          q('taxa-dica').textContent = `Equivale a ${formatPct((Math.pow(1 + bruta, 12) - 1) * 100)} ao ano`;
          texto = `taxa informada de ${formatPct(v)} ao mês`;
        } else {
          bruta = taxaMensal(v);
          q('taxa-dica').textContent = `Equivale a ${formatPct(bruta * 100)} ao mês`;
          texto = `taxa informada de ${formatPct(v)} ao ano ≈ ${formatPct(bruta * 100)} ao mês`;
        }
      }

      if (tipo !== 'cdi' && !q('taxa-ir').checked) return { i: bruta, bruta, ir: false, aliquota: 0, tipo, texto: `Rendimento: ${texto}, sem desconto de IR.` };
      const liq = liquidaDeIR(bruta, meses);
      return {
        i: liq.i, bruta, ir: true, aliquota: liq.aliquota, tipo,
        texto: `Rendimento líquido de IR: ${texto}, menos ${formatPct(liq.aliquota * 100, { curto: true })} de Imposto de Renda (alíquota para ${meses} ${meses === 1 ? 'mês' : 'meses'}) = ${formatPct(liq.i * 100)} ao mês.`
      };
    }
    return { ler };
  }

  /* ===== COPIAR TEXTO ===== */
  // Copia para a área de transferência; em navegadores sem permissão/API, usa um <textarea> temporário.
  // A API pode ficar esperando uma permissão que nunca chega: depois de 1,5 s, desiste e usa o plano B.
  // Retorna Promise<boolean> (true = copiou).
  async function copiarTexto(texto) {
    try {
      await Promise.race([
        navigator.clipboard.writeText(texto),
        new Promise((_, falhar) => setTimeout(() => falhar(new Error('clipboard sem resposta')), 1500))
      ]);
      return true;
    } catch (err) {
      const ta = document.createElement('textarea');
      ta.value = texto;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { /* sem cópia */ }
      ta.remove();
      return ok;
    }
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
  montarRendimentos();
  montarPontes();
  montarAvisos();
  montarFaq();

  window.Warden = {
    formatBRL, formatBRLCompacto, formatNumero, formatPct, parseNumero, campoBRL,
    TAXAS_REFERENCIA, getTaxasBCB, fonteTaxa,
    IR_REGRESSIVO, aliquotaIR, liquidaDeIR,
    taxaMensal, taxaMensalDe, parcelaPrice, aporteNecessario, serieAcumulacao,
    campoRendimento, copiarTexto,
    cardResultado, estiloGrafico
  };
})();
