/*
 * WARDEN CONTROL — telas e interações. Regras e contas ficam no nucleo.js (window.ControlNucleo).
 * Telas por hash: #inicio, #mes, #contas, #dividas, #fluxo, #relatorio, #ajustes. Tudo é redesenhado a partir do `db` depois de cada mudança.
 * Toda mudança passa por mudar()/substituirDb(): guardam uma cópia antes (pilha do Desfazer), gravam e redesenham.
 */
(function () {
  'use strict';
  const N = window.ControlNucleo;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = (c, o) => N.formatBRL(c, o);
  // texto com valores: "R$ 1.919,90" e "− R$ 10,00" não quebram de linha no meio
  const semQuebra = s => esc(s).replace(/([−+]) R\$ /g, '$1&nbsp;R$$&nbsp;').replace(/R\$ /g, 'R$$&nbsp;');
  const ref = () => N.hoje();

  let db = N.carregar();
  let diaCarregado = ref();
  const pilha = [];           // Desfazer: [{ id, rotulo, antes (JSON) }]
  let seqAcao = 0;
  const estado = {
    tela: 'inicio',
    filtro: { tipo: 'todas', status: 'aberto', busca: '', categoriaId: '' },
    periodo: 30,
    mesRel: null,
    pagasAbertas: false,
    orientador: false,
    chat: []                 // conversa com o Orientador (só nesta visita): [{ quem: 'voce'|'ori', texto, linhas, acao }]
  };

  // ---------- ícones (SVG inline, traço) ----------
  const P = {
    casa: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
    lista: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
    grafico: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
    documento: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    ajustes: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    alerta: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.01"/>',
    ok: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    pagar: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
    receber: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    busca: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    baixar: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    subir: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
    tabela: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>',
    lixo: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    lapis: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    mais: '<path d="M12 5v14M5 12h14"/>',
    esq: '<path d="m15 6-6 6 6 6"/>',
    dir: '<path d="m9 6 6 6-6 6"/>',
    carteira: '<path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1z"/><path d="M4 7V6a2 2 0 0 1 2-2h10v3M16 13.5h.01"/>',
    raio: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    cesta: '<path d="M3 9h18l-2 11H5z"/><path d="m8 9 4-6 4 6"/>',
    carro: '<path d="m4 13 2-6h12l2 6v5H4z"/><path d="M4 13h16M8 16h.01M16 16h.01"/>',
    coracao: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
    livro: '<path d="M4 19V5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2z"/>',
    estrela: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
    cartao: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/>',
    repetir: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"/>',
    caixa: '<path d="m3 7 9-4 9 4v10l-9 4-9-4z"/><path d="m3 7 9 4 9-4M12 11v10"/>',
    ponto: '<circle cx="12" cy="12" r="3"/>',
    sacola: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
    ferramenta: '<path d="M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3z"/>',
    lampada: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    enviar: '<path d="M4 12 20 4l-6 16-3-7z"/><path d="m11 13 9-9"/>',
    mensagem: '<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z"/>',
    imagem: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    copiar: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="m9 15 2 2 4-4"/>',
    divida: '<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>'
  };
  const ic = (nome, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${P[nome] || P.ponto}</svg>`;

  const TELAS = [
    { id: 'inicio', nome: 'Início', icone: 'casa' },
    { id: 'mes', nome: 'Meu mês', icone: 'calendario' },
    { id: 'contas', nome: 'Contas', icone: 'lista' },
    { id: 'dividas', nome: 'Dívidas', icone: 'divida' },
    { id: 'fluxo', nome: 'Fluxo de caixa', curto: 'Fluxo', icone: 'grafico' },
    { id: 'relatorio', nome: 'Relatório', icone: 'documento' },
    { id: 'ajustes', nome: 'Ajustes', icone: 'ajustes' }
  ];

  // ---------- gravação, Desfazer, toast ----------
  // estado da conta e escolhas de tela não voltam com o Desfazer nem com importar backup / apagar tudo
  const PREFS_CONTA = ['plano', 'avisoFimTeste', 'orientadorAberto', 'orientadorVisto', 'dicaDoDia', 'calcRecolhida'];
  const PREFS = [...PREFS_CONTA, 'perfil', 'primeirosPassosOcultos', 'confeteMes'];
  function manter(novo, chaves) {
    chaves.forEach(k => { if (db.config[k] !== undefined) novo.config[k] = db.config[k]; });
    return novo;
  }
  function gravar() {
    if (!N.salvar(db)) toast('Não consegui salvar neste navegador (modo anônimo ou sem espaço). Exporte um backup em Ajustes.');
  }
  /** aplica uma mudança com Desfazer. Se fn lançar erro, nada muda e o erro sobe. Devolve { valor, acao }. */
  function mudar(rotulo, fn) {
    const antes = JSON.stringify(db);
    let valor;
    try { valor = fn(db); } catch (e) { db = N.migrar(JSON.parse(antes)); throw e; }
    const acao = ++seqAcao;
    pilha.push({ id: acao, rotulo, antes });
    if (pilha.length > 30) pilha.shift();
    gravar(); render();
    return { valor, acao };
  }
  function substituirDb(rotulo, novo) {
    const antes = JSON.stringify(db);
    db = manter(novo, PREFS_CONTA);
    const acao = ++seqAcao;
    pilha.push({ id: acao, rotulo, antes });
    gravar(); render();
    return acao;
  }
  function desfazer(acao) {
    const topo = pilha[pilha.length - 1];
    if (!topo || (acao && topo.id !== acao)) return false;
    pilha.pop();
    db = manter(N.migrar(JSON.parse(topo.antes)), PREFS);
    gravar(); render();
    toast(`Desfeito: ${topo.rotulo.toLowerCase()}`);
    return true;
  }

  let toastTimer = 0;
  /** mensagem curta embaixo; com { desfazer: acao } mostra o botão Desfazer por 5 s */
  function toast(msg, { desfazer: acao = 0, ms } = {}) {
    const el = $('#toast'), btn = $('button', el), dur = ms || (acao ? 5000 : 3200);
    $('.msg', el).textContent = msg;
    btn.hidden = !acao;
    btn.onclick = () => { hideToast(); desfazer(acao); };
    el.style.setProperty('--dur', dur + 'ms');
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, dur);
  }
  function hideToast() { clearTimeout(toastTimer); $('#toast').classList.remove('on'); }

  // ---------- plano (demonstração local; ver planoAtual no núcleo) ----------
  const PRO = { nome: 'Warden Pro', preco: '9,90' };
  const plano = () => N.planoAtual(db, ref());
  const recursos = () => plano().recursos;

  // ---------- recortes por perfil ----------
  // no grátis há 1 perfil: tudo aparece junto (nada fica escondido quando o teste do Pro acaba)
  const perfil = () => (recursos().perfis > 1 ? db.config.perfil : 'tudo');
  const doPerfil = c => perfil() === 'tudo' || c.perfil === perfil();
  const contasPerfil = () => db.contas.filter(doPerfil);
  const nomePerfil = () => ({ tudo: 'Pessoal + Negócio', pessoal: 'Pessoal', negocio: 'Negócio' }[perfil()]);

  // ---------- pedaços de tela ----------
  function sinal(c, valor) { return (c.tipo === 'receber' ? '+ ' : '− ') + brl(valor); }
  function classePill(cod) { return { paga: 'paga', parcial: 'parcial', atrasada: 'atrasada', hoje: 'hoje', previsto: '' }[cod]; }

  /** uma linha do extrato: círculo (baixa total) + corpo (abre o detalhe) */
  function linha(c, { hojeRef = ref(), saldoApos = null, pilula = null, icone = false, acaoCorpo = 'abrir', carimbo = false, meta: metaExtra = '' } = {}) {
    const st = N.status(c, hojeRef), falta = N.restante(c), paga = st.codigo === 'paga';
    const meta = [metaExtra || N.nomeCategoria(db, c.categoriaId)];
    if (c.contato) meta.push(c.contato);
    if (c.parcela) meta.push(`parcela ${c.parcela.n}/${c.parcela.total}`);
    if (c.divida) meta.push(c.divida.taxa != null ? `dívida ${N.formatTaxa(c.divida.taxa)}% a.m.` : 'dívida');
    if (c.dividaId) meta.push(rotuloParcelaDivida(c));
    if (c.recorrenciaId) meta.push({ mensal: 'todo mês', semanal: 'toda semana', anual: 'todo ano' }[(db.recorrencias.find(r => r.id === c.recorrenciaId) || {}).freq] || 'repete');
    if (perfil() === 'tudo') meta.push(N.PERFIS[c.perfil]);
    const pct = c.valor ? Math.round(N.totalAbatido(c) / c.valor * 100) : 0;
    const rotCheck = paga ? `Reabrir ${c.descricao}` : `Dar baixa total em ${c.descricao}: ${brl(falta)} hoje`;
    return `<li class="ctl-linha ${c.tipo} ${st.codigo}${st.atrasada ? ' atrasada' : ''}${carimbo && paga ? ' carimbo' : ''}" data-id="${esc(c.id)}"${st.codigo === 'parcial' ? ` style="--p:${pct}%"` : ''}>
      <button type="button" class="ctl-check" data-acao="baixar" data-id="${esc(c.id)}" aria-label="${esc(rotCheck)}" aria-pressed="${paga}" data-foco="check-${esc(c.id)}"><span class="aro">${ic('check', 'stroke-width="3"')}</span></button>
      <button type="button" class="ctl-linha-corpo" data-acao="${acaoCorpo}" data-id="${esc(c.id)}" data-foco="abrir-${esc(c.id)}">
        ${icone ? `<span class="ctl-linha-icone">${ic((N.categoria(db, c.categoriaId) || {}).icone)}</span>` : ''}
        <span class="ctl-linha-txt"><span class="ctl-linha-desc">${esc(c.descricao)}</span>${pilula
          ? `<span class="ctl-linha-prazo"><span class="ctl-pill ${pilula.cls}">${esc(pilula.texto)}</span>${metaExtra ? `<span class="ctl-linha-meta">${esc(metaExtra)}</span>` : ''}</span>`
          : `<span class="ctl-linha-meta">${esc(meta.join(' · '))}</span>`}</span>
        <span class="ctl-linha-dir">
          <span class="ctl-num">${sinal(c, paga ? N.totalMovido(c) : falta)}</span>
          ${st.codigo === 'parcial' ? `<span class="de">faltam, de ${brl(c.valor)}</span>` : ''}
          ${saldoApos != null ? `<span class="saldo-apos${saldoApos < 0 ? ' neg' : ''}">saldo ${brl(saldoApos)}</span>` : pilula ? '' : `<span class="ctl-pill ${classePill(st.codigo)}">${esc(N.rotuloStatus(c, hojeRef))}</span>`}
        </span>
      </button>
    </li>`;
  }

  /** "parcela 3/15 da dívida" (pelo mês desde o início do cadastro) ou só "parcela da dívida" */
  function rotuloParcelaDivida(c) {
    const d = (db.dividas || []).find(x => x.id === c.dividaId);
    if (!c.ocorrencia) return 'quitação da dívida';
    if (!d || d.parcelas == null || !d.inicio || c.ocorrencia < d.inicio) return 'parcela da dívida';
    const mes = iso => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7));
    return `parcela ${mes(c.ocorrencia) - mes(d.inicio) + 1}/${d.parcelas} da dívida`;
  }

  /** extrato agrupado por dia (atrasadas juntas no topo). modo 'pagas' agrupa pela data da baixa. */
  function extrato(contas, { modo = 'venc' } = {}) {
    const r = ref(), grupos = [];
    let atual = null;
    for (const c of contas) {
      let chave, titulo, cls = '';
      if (modo === 'pagas') { const d = N.ultimaBaixa(c).data; chave = d; titulo = N.rotuloDia(d, r); }
      else if (!N.quitada(c) && c.vencimento < r) { chave = 'atrasadas'; titulo = 'Atrasadas'; cls = 'atrasadas'; }
      else { chave = c.vencimento; titulo = N.rotuloDia(c.vencimento, r); }
      if (!atual || atual.chave !== chave) { atual = { chave, titulo, cls, itens: [] }; grupos.push(atual); }
      atual.itens.push(c);
    }
    return `<div class="ctl-extrato">${grupos.map(g => {
      const tot = g.itens.reduce((s, c) => s + (c.tipo === 'receber' ? 1 : -1) * (modo === 'pagas' || N.quitada(c) ? N.totalMovido(c) : N.restante(c)), 0);
      return `<div class="ctl-dia ${g.cls}"><span>${esc(g.titulo)}</span><span class="tot">${brl(tot, { sinal: true })}</span></div>
        <ul>${g.itens.map(c => linha(c, { hojeRef: r })).join('')}</ul>`;
    }).join('')}</div>`;
  }

  function vazio({ pequeno = false } = {}) {
    return `<div class="ctl-vazio${pequeno ? ' pequeno' : ''}">
      <div class="ic">${ic('carteira')}</div>
      <h2>Vamos colocar suas contas em ordem?</h2>
      <p>Comece pelo que vence primeiro. Você anota uma vez e o Control lembra, soma e mostra quanto vai sobrar.</p>
      <div class="ctl-vazio-botoes">
        <button type="button" class="btn btn-primary" data-acao="novo" data-tipo="pagar">${ic('pagar')} Tenho uma conta a pagar</button>
        <button type="button" class="btn btn-secondary" data-acao="novo" data-tipo="receber">${ic('receber')} Tenho algo a receber</button>
      </div>
    </div>`;
  }

  function primeirosPassos() {
    if (db.config.primeirosPassosOcultos) return '';
    const passos = [
      { feito: db.config.saldoDefinido, t: 'Informe quanto você tem hoje', acao: 'saldo', btn: 'Informar' },
      { feito: db.contas.length > 0, t: 'Anote sua primeira conta', acao: 'novo', btn: 'Anotar' },
      { feito: db.contas.some(c => c.baixas.length), t: 'Dê baixa em uma conta (toque no círculo)', acao: 'ir', tela: 'contas', btn: 'Ver contas' }
    ];
    const feitos = passos.filter(p => p.feito).length;
    if (feitos === passos.length) return '';
    return `<div class="ctl-card ctl-passos">
      <div class="ctl-bloco-cab" style="margin:0"><h2>Primeiros passos</h2><span class="ctl-rotulo">${feitos} de ${passos.length}</span></div>
      <p class="sub">Três coisas rápidas e o Control já começa a trabalhar por você.</p>
      <div class="ctl-progresso" role="progressbar" aria-label="Primeiros passos" aria-valuemin="0" aria-valuemax="${passos.length}" aria-valuenow="${feitos}"><span style="width:${feitos / passos.length * 100}%"></span></div>
      <ol>${passos.map(p => `<li class="${p.feito ? 'feito' : ''}">
        <span class="marca">${p.feito ? ic('check', 'stroke-width="3"') : ''}</span><span class="t">${p.t}</span>
        ${p.feito ? '<span class="sr-only">feito</span>' : `<button type="button" class="btn btn-secondary" data-acao="${p.acao}"${p.tela ? ` data-tela="${p.tela}"` : ''}${p.acao === 'ir' && !db.contas.length ? ' disabled' : ''}>${p.btn}</button>`}
      </li>`).join('')}</ol>
      <button type="button" class="ctl-link" data-acao="ocultar-passos">Ocultar</button>
    </div>`;
  }

  function alertaNegativo(serie, { mostrarOk = false } = {}) {
    if (serie.negativo) {
      const n = serie.negativo;
      return `<div class="ctl-alerta" role="alert">${ic('alerta')}<p><strong>Atenção: ${n.data === ref() ? 'hoje' : 'em ' + N.dataBR(n.data)} seu saldo fica em ${brl(n.saldo)}</strong> se tudo for pago como previsto. Dá tempo de ajustar: adie um gasto ou antecipe um recebimento.</p></div>`;
    }
    return mostrarOk ? `<div class="ctl-alerta ok">${ic('ok')}<p>Seu saldo continua positivo nos próximos ${N.HORIZONTE_DIAS} dias, se tudo correr como previsto.</p></div>` : '';
  }

  function cabecalho(titulo, sub) {
    return `<div class="ctl-tela-cab"><div><h1>${titulo}</h1>${sub ? `<p>${sub}</p>` : ''}</div></div>`;
  }

  /** anel de saúde financeira (0 a 100) com os 4 critérios ao lado; sem dados suficientes, só o convite para anotar */
  const AVISO_SAUDE = 'Indicador do Warden. Não tem relação com Serasa, SPC ou score de crédito.';
  function cartaoSaude(s) {
    const aviso = `<p class="ctl-saude-aviso" data-saude-aviso>${AVISO_SAUDE}</p>`;
    if (!s.suficiente) {
      return `<div class="ctl-card ctl-saude vazio" data-saude="sem-dados">
        <div class="ctl-anel" aria-hidden="true"><svg viewBox="0 0 120 120"><circle class="trilho" cx="60" cy="60" r="50"/></svg></div>
        <div class="ctl-saude-txt"><span class="ctl-rotulo">Saúde financeira</span>
          <p class="ctl-saude-vazio">Ainda não dá para calcular. Anote suas contas do mês.</p>${aviso}</div>
      </div>`;
    }
    const icone = { ok: ic('check', 'stroke-width="3"'), nao: ic('ponto'), neutro: ic('relogio') };
    return `<div class="ctl-card ctl-saude" data-saude="${s.pontos}">
      <div class="ctl-anel" data-anel="${s.pontos}" role="img" aria-label="Saúde financeira: ${s.pontos} de 100, ${esc(s.rotulo)}">
        <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="trilho" cx="60" cy="60" r="50"/>
          <circle class="arco" cx="60" cy="60" r="50" pathLength="100" stroke-dasharray="${s.pontos} 100" transform="rotate(-90 60 60)"/></svg>
        <span class="ctl-anel-num" aria-hidden="true"><strong data-contar="${s.pontos}" data-formato="int" data-chave="saude">${s.pontos}</strong><small>de 100</small></span>
      </div>
      <div class="ctl-saude-txt"><span class="ctl-rotulo">Saúde financeira</span><h2 data-saude-rotulo>${esc(s.rotulo)}</h2>
        <ul>${s.itens.map(i => `<li class="${i.estado}" data-criterio="${i.id}">${icone[i.estado]}<span>${esc(i.texto)}</span></li>`).join('')}</ul>${aviso}</div>
    </div>`;
  }

  // ---------- telas ----------
  function telaInicio() {
    const r = ref(), h = N.horaSP();
    const saudacao = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
    const dia = new Intl.DateTimeFormat('pt-BR', { timeZone: N.FUSO, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
    const serie = N.serieFluxo(db, perfil(), N.HORIZONTE_DIAS, r);
    const fim = N.fimDoMes(r), pFim = serie.pontos[N.diffDias(r, fim)];
    let aReceber = 0, aPagar = 0;
    for (const c of contasPerfil()) if (!N.quitada(c) && c.vencimento <= fim) { if (c.tipo === 'receber') aReceber += N.restante(c); else aPagar += N.restante(c); }
    const saldo = N.saldoAtual(db, perfil(), r);
    const temContas = contasPerfil().length > 0;
    document.body.toggleAttribute('data-sem-novo', !temContas);

    let lista = '';
    if (temContas) {
      const prox = N.proximas(db, perfil(), 7, r);
      lista = `<div class="ctl-bloco">
        <div class="ctl-bloco-cab"><h2>Próximos 7 dias</h2><button type="button" class="ctl-link" data-acao="ir" data-tela="contas">Ver todas</button></div>
        ${prox.length ? extrato(prox.slice(0, 8)) + (prox.length > 8 ? `<p class="ctl-dica" style="margin-top:8px">E mais ${prox.length - 8} em Contas.</p>` : '')
          : `<div class="ctl-alerta ok">${ic('ok')}<p>Nada vencendo nos próximos 7 dias. Aproveite a folga.</p></div>`}
      </div>`;
    }
    const saude = N.saudeFinanceira(db, perfil(), r);
    return `<div class="ctl-aurora" aria-hidden="true"><span></span><span></span><span></span></div>
      ${cabecalho(`${saudacao}!`, dia.charAt(0).toUpperCase() + dia.slice(1))}
      <div class="ctl-saldo">
        <span class="ctl-rotulo">Saldo de hoje · ${esc(nomePerfil())}</span>
        <div class="ctl-num g${saldo < 0 ? ' neg' : ''}" data-valor="saldo" data-contar="${saldo}">${brl(saldo)}</div>
        ${db.config.saldoDefinido ? '' : `<button type="button" class="ctl-link" data-acao="saldo">Informar quanto tenho hoje</button>`}
        <div class="ctl-saldo-pe">
          <div><span class="ctl-rotulo">A receber até ${N.dataCurta(fim)}</span><span class="v" data-contar="${aReceber}" data-chave="inicio-receber">${brl(aReceber)}</span></div>
          <div><span class="ctl-rotulo">A pagar até ${N.dataCurta(fim)}</span><span class="v" data-contar="${aPagar}" data-chave="inicio-pagar">${brl(aPagar)}</span></div>
          <div><span class="ctl-rotulo">Previsto em ${N.dataCurta(fim)}</span><span class="v${pFim.saldo < 0 ? ' ctl-num neg' : ''}" data-contar="${pFim.saldo}" data-chave="inicio-fim">${brl(pFim.saldo)}</span></div>
        </div>
      </div>
      ${cartaoSaude(saude)}
      ${alertaNegativo(serie)}
      ${primeirosPassos()}
      ${temContas ? lista : `<div class="ctl-bloco">${vazio()}</div>`}`;
  }

  /** pílula de prazo do "Meu mês" (texto e cor pelo vencimento e pela data real da baixa) */
  function pilulaMes(c, r) {
    const rec = c.tipo === 'receber', dia = N.dataBR(c.vencimento).slice(0, 5);
    if (N.quitada(c)) return { cls: 'paga', texto: `${rec ? 'Recebida' : 'Paga'} dia ${N.dataBR(N.ultimaBaixa(c).data).slice(0, 5)}` };
    const n = N.diffDias(r, c.vencimento);
    const prazo = n < 0 ? `Venceu dia ${dia} · ${-n} ${n === -1 ? 'dia' : 'dias'} de atraso`
      : n === 0 ? (rec ? 'Recebe hoje' : 'Vence hoje')
      : `${rec ? 'Recebe' : 'Vence'} dia ${dia}${n <= 3 ? ` · em ${n} ${n === 1 ? 'dia' : 'dias'}` : ''}`;
    if (c.baixas.length) return { cls: n < 0 ? 'atrasada' : 'parcial', texto: `Parcial · ${prazo}` };
    return { cls: n < 0 ? 'atrasada' : n === 0 ? 'hoje' : n <= 3 ? 'breve' : '', texto: prazo };
  }

  let carimbar = null;   // id da conta recém-marcada no "Meu mês" (anima o carimbo só nela)
  function confete() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const host = document.createElement('div');
    host.className = 'ctl-confete'; host.setAttribute('aria-hidden', 'true');
    const cores = ['#C8F26B', '#F3F1EA', '#C8F26B', '#8A887E'];
    for (let i = 0; i < 36; i++) {
      const p = document.createElement('i');
      p.style.cssText = `left:${(i * 37) % 100}%;background:${cores[i % 4]};--x:${(i % 7 - 3) * 14}px;--r:${(i * 53) % 360}deg;animation-delay:${(i % 9) * 45}ms`;
      host.appendChild(p);
    }
    document.body.appendChild(host);
    setTimeout(() => host.remove(), 2400);
  }

  function telaMes() {
    const r = ref(), ym = N.mesDe(r), nomeMes = N.nomeMes(ym).replace(/^./, l => l.toUpperCase());
    const modelos = db.modelos.filter(doPerfil);
    const todas = N.contasMes(db, perfil(), ym).sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.descricao.localeCompare(b.descricao));
    const temDividas = todas.some(c => c.dividaId);
    document.body.toggleAttribute('data-sem-novo', !modelos.length && !temDividas);
    if (!modelos.length && !temDividas) {
      return `${cabecalho('Meu mês', nomeMes)}
        <div class="ctl-vazio"><div class="ic">${ic('calendario')}</div>
          <h2>Suas contas fixas, prontas todo mês</h2>
          <p>Cadastre uma vez o aluguel, a luz, a internet, o salário… Todo mês o Control monta a lista sozinho, tudo desmarcado, e você vai marcando o que pagou.</p>
          <div class="ctl-vazio-botoes um"><button type="button" class="btn btn-primary" data-acao="novo-modelo">${ic('mais')} Cadastrar conta fixa</button></div>
        </div>`;
    }
    const pagas = todas.filter(N.quitada), abertas = todas.filter(c => !N.quitada(c));
    const semana = N.addDias(r, 7);
    // de meses anteriores, só o que ficou em aberto (o mês passado em si fica intacto; a conta não some da lista)
    const antigas = contasPerfil().filter(c => (c.modeloId || c.dividaId) && c.ocorrencia && N.mesDe(c.ocorrencia) < ym && !N.quitada(c))
      .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    const grupos = [
      ['Atrasadas', [...antigas, ...abertas.filter(c => c.vencimento < r)], 'atrasadas'],
      ['Esta semana', abertas.filter(c => c.vencimento >= r && c.vencimento <= semana), ''],
      ['Mais adiante', abertas.filter(c => c.vencimento > semana), '']
    ];
    const faltam = abertas.reduce((s, c) => s + N.restante(c), 0);
    const tudo = todas.length > 0 && !abertas.length;
    if (tudo && db.config.confeteMes !== ym) { db.config.confeteMes = ym; gravar(); setTimeout(confete, 60); }

    const variavel = c => (db.modelos.find(m => m.id === c.modeloId) || {}).variavel;
    const lista = itens => `<div class="ctl-extrato"><ul>${itens.map(c => linha(c, {
      hojeRef: r, icone: true, pilula: pilulaMes(c, r), acaoCorpo: 'mes-abrir', carimbo: c.id === carimbar,
      meta: variavel(c) && !N.quitada(c) ? 'ajustar valor' : c.dividaId ? rotuloParcelaDivida(c) : ''
    })).join('')}</ul></div>`;

    return `${cabecalho('Meu mês', nomeMes)}
      ${!todas.length ? '' : `<div class="ctl-card ctl-mes-prog${tudo ? ' tudo' : ''}">
        ${tudo ? `<div class="ctl-mes-fim">${ic('ok')}<div><strong>Mês fechado!</strong><span>Todas as contas fixas de ${N.MESES[Number(ym.slice(5)) - 1]} estão em dia.</span></div></div>`
          : `<p class="ctl-mes-prog-txt" data-mes="progresso"><strong>${pagas.length} de ${todas.length}</strong> pagas · faltam <strong class="ctl-num">${brl(faltam)}</strong></p>`}
        <div class="ctl-progresso" role="progressbar" aria-label="Contas fixas do mês em dia" aria-valuemin="0" aria-valuemax="${todas.length}" aria-valuenow="${pagas.length}"><span style="width:${pagas.length / todas.length * 100}%"></span></div>
      </div>`}
      <div class="ctl-mes">
        ${grupos.filter(g => g[1].length).map(([t, itens, cls]) => `<div class="ctl-bloco" data-grupo="${esc(t)}">
          <div class="ctl-bloco-cab"><h2 class="${cls}">${t}</h2><span class="ctl-rotulo">${itens.length}</span></div>${lista(itens)}</div>`).join('')}
        ${pagas.length ? `<details class="ctl-bloco ctl-mes-pagas" data-grupo="Pagas"${estado.pagasAbertas ? ' open' : ''}>
          <summary class="ctl-bloco-cab"><h2>Pagas</h2><span class="ctl-rotulo">${pagas.length} ${ic('dir')}</span></summary>${lista(pagas)}</details>` : ''}
      </div>
      <div class="ctl-card ctl-modelos">
        <div class="ctl-bloco-cab" style="margin:0"><h2>Contas fixas</h2><button type="button" class="btn btn-secondary" data-acao="novo-modelo">${ic('mais')} Nova</button></div>
        <p class="sub">Cadastradas uma vez, viram um item novo, desmarcado, todo mês. Mudar aqui vale para os próximos meses.${temDividas ? ' As parcelas das dívidas entram sozinhas, a partir do cadastro em Dívidas.' : ''}</p>
        <ul class="ctl-cats">${[...modelos].sort((a, b) => a.dia - b.dia || a.descricao.localeCompare(b.descricao)).map(m => `<li>
          <span class="ic">${ic((N.categoria(db, m.categoriaId) || {}).icone)}</span>
          <span class="nome">${esc(m.descricao)}<small>${m.tipo === 'receber' ? '+ ' : ''}${brl(m.valor)} · todo dia ${m.dia}${m.variavel ? ' · varia' : ''}</small></span>
          <button type="button" class="ctl-icone-btn" data-acao="modelo-editar" data-id="${esc(m.id)}" aria-label="Editar ${esc(m.descricao)}">${ic('lapis')}</button>
          <button type="button" class="ctl-icone-btn" data-acao="modelo-excluir" data-id="${esc(m.id)}" aria-label="Excluir ${esc(m.descricao)}">${ic('lixo')}</button></li>`).join('')}</ul>
      </div>`;
  }

  function telaContas() {
    const todas = contasPerfil();
    document.body.toggleAttribute('data-sem-novo', !todas.length);
    if (!todas.length) return cabecalho('Contas', 'Tudo o que você tem a pagar e a receber.') + vazio();
    const f = estado.filtro, r = ref();
    const base = { ...f, perfil: perfil(), busca: '', status: 'todas' };
    const cont = st => N.filtrar(db, { ...base, status: st }, r).length;
    const chips = [['aberto', 'Em aberto'], ['atrasadas', 'Atrasadas'], ['semana', 'Próximos 7 dias'], ['pagas', 'Pagas'], ['todas', 'Todas']];
    const cats = db.config.categorias.filter(c => f.tipo === 'todas' || c.tipo === f.tipo);
    return `${cabecalho('Contas', `${todas.length} ${todas.length === 1 ? 'lançamento' : 'lançamentos'} · ${esc(nomePerfil())}`)}
      <div class="ctl-filtros">
        <div class="ctl-seg" role="group" aria-label="Tipo">
          ${[['todas', 'Todas'], ['pagar', 'A pagar'], ['receber', 'A receber']].map(([v, t]) => `<button type="button" data-acao="filtro-tipo" data-v="${v}" aria-pressed="${f.tipo === v}" data-foco="tipo-${v}">${t}</button>`).join('')}
        </div>
        <div class="ctl-chips" role="group" aria-label="Situação">
          ${chips.map(([v, t]) => `<button type="button" class="ctl-chip" data-acao="filtro-status" data-v="${v}" aria-pressed="${f.status === v}" data-foco="st-${v}">${t}<span class="n">${cont(v)}</span></button>`).join('')}
        </div>
        <div class="ctl-busca-linha">
          <label class="ctl-busca ctl-campo"><span class="sr-only">Buscar</span>${ic('busca')}<input type="search" id="busca" placeholder="Buscar por nome, contato, categoria…" value="${esc(f.busca)}" autocomplete="off"></label>
          <label class="ctl-campo ctl-filtro-cat"><span class="sr-only">Categoria</span><select id="filtro-cat"><option value="">Todas as categorias</option>${cats.map(c => `<option value="${esc(c.id)}"${c.id === f.categoriaId ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></label>
        </div>
      </div>
      <div id="lista-contas">${listaContas()}</div>`;
  }
  function listaContas() {
    const f = estado.filtro, r = ref();
    const lista = N.filtrar(db, { ...f, perfil: perfil() }, r);
    if (!lista.length) {
      const algum = f.busca || f.categoriaId || f.tipo !== 'todas' || f.status !== 'aberto';
      return `<div class="ctl-vazio pequeno"><div class="ic">${ic(f.status === 'aberto' ? 'ok' : 'busca')}</div>
        <h2>${f.status === 'aberto' && !f.busca && !f.categoriaId ? 'Tudo em dia por aqui' : 'Nenhuma conta encontrada'}</h2>
        <p>${f.status === 'aberto' && !f.busca && !f.categoriaId ? 'Não há nada em aberto com esses filtros.' : 'Tente outra busca ou mude os filtros.'}</p>
        ${algum ? '<div class="ctl-acoes" style="justify-content:center"><button type="button" class="btn btn-secondary" data-acao="limpar-filtros">Limpar filtros</button></div>' : ''}</div>`;
    }
    let pagar = 0, receber = 0;
    for (const c of lista) { const v = N.quitada(c) ? N.totalMovido(c) : N.restante(c); if (c.tipo === 'receber') receber += v; else pagar += v; }
    const rot = f.status === 'pagas' ? ['Pago', 'Recebido'] : ['A pagar', 'A receber'];
    return `<p class="ctl-resumo-lista" aria-live="polite"><span>${lista.length} ${lista.length === 1 ? 'conta' : 'contas'}</span>
        ${f.tipo !== 'receber' ? `<span>${rot[0]}: <strong>${brl(pagar)}</strong></span>` : ''}
        ${f.tipo !== 'pagar' ? `<span>${rot[1]}: <strong>${brl(receber)}</strong></span>` : ''}</p>
      ${extrato(lista, { modo: f.status === 'pagas' ? 'pagas' : 'venc' })}`;
  }

  function graficoFluxo(pontos) {
    const W = 600, H = 200, pad = 8;
    const vals = pontos.map(p => p.saldo);
    const min = Math.min(0, ...vals), max = Math.max(0, ...vals), amp = (max - min) || 1;
    const x = i => (i / Math.max(1, pontos.length - 1)) * W;
    const y = v => pad + (1 - (v - min) / amp) * (H - pad * 2);
    const linhaD = pontos.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.saldo).toFixed(1)}`).join('');
    const area = `${linhaD}L${W},${y(Math.max(min, 0)).toFixed(1)}L0,${y(Math.max(min, 0)).toFixed(1)}Z`;
    const iMin = vals.indexOf(Math.min(...vals));
    return `<div class="ctl-grafico">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Saldo previsto dia a dia: começa em ${esc(brl(vals[0]))} e termina em ${esc(brl(vals[vals.length - 1]))}">
        <defs><linearGradient id="g-fluxo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C8F26B" stop-opacity=".28"/><stop offset="1" stop-color="#C8F26B" stop-opacity="0"/></linearGradient></defs>
        ${min < 0 ? `<line x1="0" x2="${W}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" stroke="#F87171" stroke-dasharray="4 4" stroke-width="1" vector-effect="non-scaling-stroke"/>` : ''}
        <g data-curva><path d="${area}" fill="url(#g-fluxo)"/>
        <path d="${linhaD}" fill="none" stroke="#C8F26B" stroke-width="2.2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></g>
      </svg>
      <div class="ctl-grafico-legenda"><span>Hoje</span><span>Menor saldo: <strong class="${vals[iMin] < 0 ? 'ctl-num neg' : ''}">${brl(vals[iMin])}</strong> em ${N.dataCurta(pontos[iMin].data)}</span><span>${N.dataCurta(pontos[pontos.length - 1].data)}</span></div>
    </div>`;
  }

  function telaFluxo() {
    document.body.removeAttribute('data-sem-novo');
    const r = ref(), serie = N.serieFluxo(db, perfil(), N.HORIZONTE_DIAS, r);
    const saldo = N.saldoAtual(db, perfil(), r);
    const cards = [30, 60, 90].map(d => {
      const pts = serie.pontos.slice(0, d + 1);
      const ent = pts.reduce((s, p) => s + p.entradas, 0), sai = pts.reduce((s, p) => s + p.saidas, 0), fim = pts[pts.length - 1].saldo;
      return `<div class="ctl-card ctl-prev" data-previsto="${d}"><div class="topo"><span class="ctl-rotulo">Em ${d} dias · ${N.dataCurta(pts[pts.length - 1].data)}</span>
        <div class="ctl-num m${fim < 0 ? ' neg' : ''}" data-contar="${fim}" data-chave="previsto-${d}">${brl(fim)}</div></div>
        <p class="sub">Entra ${brl(ent)} · Sai ${brl(sai)}</p></div>`;
    }).join('');
    const per = estado.periodo, pts = serie.pontos.slice(0, per + 1);
    // movimentos do período com o saldo depois de cada um (atrasadas entram hoje)
    let corrente = saldo;
    const movs = N.proximas(db, perfil(), per, r).map(c => { corrente += (c.tipo === 'receber' ? 1 : -1) * N.restante(c); return linha(c, { hojeRef: r, saldoApos: corrente }); });
    return `${cabecalho('Fluxo de caixa', 'Quanto você vai ter nos próximos dias, se tudo for pago e recebido no vencimento.')}
      <div class="ctl-grade g2">
        <div class="ctl-saldo" style="grid-column:1/-1"><span class="ctl-rotulo">Saldo de hoje · ${esc(nomePerfil())}</span><div class="ctl-num g${saldo < 0 ? ' neg' : ''}" data-valor="saldo-fluxo" data-contar="${saldo}">${brl(saldo)}</div>
          <p class="sub" style="color:var(--muted);font-size:.86rem">Saldo inicial ${brl(N.saldoInicial(db, perfil()))} + o que entrou − o que saiu.</p></div>
      </div>
      <div class="ctl-grade g3" style="margin-top:12px;gap:8px">${cards}</div>
      ${alertaNegativo(serie, { mostrarOk: true })}
      <div class="ctl-card" style="margin-top:14px">
        <div class="ctl-bloco-cab" style="flex-wrap:wrap"><h2>Saldo dia a dia</h2>
          <div class="ctl-seg" role="group" aria-label="Período">${[30, 60, 90].map(d => `<button type="button" data-acao="periodo" data-v="${d}" aria-pressed="${per === d}" data-foco="per-${d}">${d} dias</button>`).join('')}</div></div>
        ${graficoFluxo(pts)}
      </div>
      <div class="ctl-bloco ctl-mov"><div class="ctl-bloco-cab"><h2>Próximos movimentos</h2><span class="ctl-rotulo">${per} dias</span></div>
        ${movs.length ? `<div class="ctl-extrato"><ul>${movs.join('')}</ul></div>` : `<div class="ctl-vazio pequeno"><div class="ic">${ic('grafico')}</div><h2>Nada previsto para os próximos ${per} dias</h2><p>Anote suas contas a pagar e a receber para ver a previsão.</p></div>`}
      </div>`;
  }

  function telaRelatorio() {
    document.body.removeAttribute('data-sem-novo');
    const r = ref(), ym = estado.mesRel || N.mesDe(r);
    const res = N.dadosRelatorio(db, perfil(), ym, r);
    const maxCat = res.porCategoria.length ? res.porCategoria[0].valor : 1;
    const prox = N.proximas(db, perfil(), 30, r);
    const fm = res.fimMes;
    return `${cabecalho('Relatório', 'O que entrou e o que saiu no mês, pela data em que o dinheiro mexeu.')}
      <div class="ctl-rel-topo">
        <div class="ctl-mes-nav" role="group" aria-label="Mês do relatório">
          <button type="button" data-acao="mes" data-v="-1" aria-label="Mês anterior">${ic('esq')}</button>
          <strong aria-live="polite">${N.nomeMes(ym).replace(/^./, l => l.toUpperCase())}</strong>
          <button type="button" data-acao="mes" data-v="1" aria-label="Próximo mês"${ym >= N.addMesYM(N.mesDe(r), 12) ? ' disabled' : ''}>${ic('dir')}</button>
        </div>
        <div class="ctl-rel-acoes" role="group" aria-label="Enviar ou baixar o relatório">
          <button type="button" class="btn btn-primary" data-acao="relatorio" data-canal="whatsapp">${ic('mensagem')} Enviar pelo WhatsApp</button>
          <button type="button" class="btn btn-secondary" data-acao="relatorio" data-canal="pdf">${ic('documento')} PDF</button>
          <button type="button" class="btn btn-secondary" data-acao="relatorio" data-canal="imagem">${ic('imagem')} Imagem</button>
          <button type="button" class="btn btn-secondary" data-acao="relatorio" data-canal="texto">${ic('copiar')} Copiar<span class="ctl-so-largo">&nbsp;texto</span></button>
        </div>
      </div>
      <div class="ctl-grade g3" style="margin-top:14px">
        <div class="ctl-card"><span class="ctl-rotulo">Recebido</span><div class="ctl-num m" style="margin-top:6px" data-rel="recebido" data-contar="${res.recebido}">${brl(res.recebido)}</div></div>
        <div class="ctl-card"><span class="ctl-rotulo">Pago</span><div class="ctl-num m" style="margin-top:6px" data-rel="pago" data-contar="${res.pago}">${brl(res.pago)}</div></div>
        <div class="ctl-card"><span class="ctl-rotulo">Resultado</span><div class="ctl-num m ${res.resultado < 0 ? 'neg' : res.resultado > 0 ? 'pos' : ''}" style="margin-top:6px" data-rel="resultado" data-contar="${res.resultado}" data-formato="sinal">${brl(res.resultado, { sinal: true })}</div></div>
      </div>
      <div class="ctl-grade g2" style="margin-top:12px">
        <div class="ctl-card"><h2>Onde mais gastou</h2>
          ${res.porCategoria.length ? `<ul class="ctl-barras">${res.porCategoria.slice(0, 6).map(c => `<li><div class="l"><span>${esc(c.nome)}</span><strong class="ctl-num">${brl(c.valor)}</strong></div><div class="b"><span style="width:${Math.max(3, c.valor / maxCat * 100)}%"></span></div></li>`).join('')}</ul>`
            : '<p class="sub" style="margin-top:8px">Nenhum pagamento neste mês ainda.</p>'}
        </div>
        <div class="ctl-card"><h2>Ainda em aberto neste mês</h2>
          <p class="sub">Contas com vencimento em ${N.nomeMes(ym)} que ainda não foram quitadas.</p>
          <div class="ctl-saldo-pe" style="border-top:none;padding-top:0">
            <div><span class="ctl-rotulo">A receber</span><span class="v">${brl(res.aReceber)}</span></div>
            <div><span class="ctl-rotulo">A pagar</span><span class="v">${brl(res.aPagar)}</span></div>
          </div>
        </div>
      </div>
      <div class="ctl-grade g2" style="margin-top:12px">
        <div class="ctl-card"><span class="ctl-rotulo">Saldo de hoje · ${N.dataCurta(r)}</span><div class="ctl-num m${res.saldoHoje < 0 ? ' neg' : ''}" style="margin-top:6px" data-rel="saldo-hoje" data-contar="${res.saldoHoje}">${brl(res.saldoHoje)}</div></div>
        <div class="ctl-card"><span class="ctl-rotulo">${fm ? `${fm.previsto ? 'Previsto' : 'Saldo'} em ${N.dataCurta(fm.data)}` : 'Fim do mês'}</span>
          ${fm ? `<div class="ctl-num m${fm.saldo < 0 ? ' neg' : ''}" style="margin-top:6px" data-rel="fim-mes" data-contar="${fm.saldo}">${brl(fm.saldo)}</div>${fm.previsto ? '<p class="sub" style="margin-top:4px">Se tudo for pago e recebido no vencimento.</p>' : ''}`
            : `<p class="sub" style="margin-top:6px">Longe demais para prever (o fluxo vai até ${N.HORIZONTE_DIAS} dias).</p>`}</div>
      </div>
      <div class="ctl-bloco"><div class="ctl-bloco-cab"><h2>Próximas contas</h2><span class="ctl-rotulo">30 dias a partir de hoje</span></div>
        ${prox.length ? extrato(prox) : `<div class="ctl-alerta ok">${ic('ok')}<p>Nada vencendo nos próximos 30 dias.</p></div>`}
      </div>`;
  }

  // ---------- Dívidas (área do Pro): cadastro + resumo; as contas ficam no núcleo ----------
  const pct = v => N.formatPct(v);
  function vitrineDividas() {
    const p = plano(), salvas = (db.dividas || []).filter(d => !d.quitadaEm).length;
    return `${cabecalho('Dívidas', 'O que você deve, as propostas de desconto e quanto as parcelas pesam no mês.')}
      <div class="ctl-vazio ctl-div-vitrine" data-dividas="vitrine">
        <div class="ic">${ic('divida')}</div>
        <span class="ctl-selo-pro">Pro</span>
        <h2>Todas as suas dívidas num lugar só</h2>
        <p>Anote cada dívida uma vez: com quem é, quanto falta, a parcela e as propostas de desconto para quitar à vista. O Control mostra:</p>
        <ul>
          <li>o total devido hoje e quanto seria à vista com os descontos;</li>
          <li>quanto você economiza, em reais e em porcentagem;</li>
          <li>quanto as parcelas somam por mês, o peso delas na sua renda e quanto sobra;</li>
          <li>as propostas que vencem nos próximos 7 dias;</li>
          <li>as parcelas entrando sozinhas no fluxo de caixa e no "Meu mês".</li>
        </ul>
        ${salvas ? `<p class="ctl-dica" data-dividas-salvas>Suas ${salvas === 1 ? 'dívida continua salva' : `${salvas} dívidas continuam salvas`}, e as parcelas seguem em Contas, no Fluxo e no "Meu mês".</p>` : ''}
        <div class="ctl-vazio-botoes">
          ${p.testeUsado ? '' : '<button type="button" class="btn btn-primary" data-acao="pro-teste">Testar 7 dias grátis</button>'}
          <button type="button" class="btn btn-secondary" data-acao="pro" data-motivo="dividas">Conhecer o Pro</button>
        </div>
      </div>`;
  }
  /** "Parcela R$ 800,00 · dia 10 · faltam 15" / "Sem parcela (à vista)" */
  function linhaParcela(x) {
    if (!x.parcela) return 'Sem parcela (à vista)';
    const prazo = x.semPrazo ? 'sem prazo' : `${x.faltam === 1 ? 'falta 1' : `faltam ${x.faltam}`}`;
    return `Parcela ${brl(x.parcela)} · dia ${x.dia} · ${prazo}${x.taxa != null ? ` · ${N.formatTaxa(x.taxa)}% a.m.` : ''}`;
  }
  function cartaoDivida(x) {
    const pr = x.proposta;
    let proposta;
    if (pr && !pr.vencida) {
      const prazo = pr.venceEm == null ? '' : pr.venceEm === 0 ? 'Vence hoje' : `Vence em ${pr.venceEm} ${pr.venceEm === 1 ? 'dia' : 'dias'}`;
      proposta = `<p>À vista por <strong class="ctl-num">${brl(x.vista)}</strong>${pr.validade ? ` até ${N.dataBR(pr.validade).slice(0, 5)}` : ''}
          ${pr.vencendo ? `<span class="ctl-pill hoje" data-proposta-vence>${prazo}</span>` : ''}</p>
        <p class="eco" data-div-eco>Economia de <strong class="ctl-num">${brl(x.economia)}</strong> (${pct(x.pctEconomia)})</p>`;
    } else if (pr) proposta = `<p class="sem">A proposta de ${brl(pr.valor)} venceu em ${N.dataBR(pr.validade)}. Ela não entra no total à vista.</p>`;
    else proposta = `<p class="sem">${x.parcela ? 'Sem proposta de desconto anotada.' : 'Sem desconto: o valor à vista é o que falta.'}</p>`;
    return `<li class="ctl-card ctl-div${pr && pr.vencendo ? ' vencendo' : ''}" data-divida="${esc(x.id)}">
      <div class="ctl-div-topo">
        <div class="nome"><h3>${esc(x.credor)}</h3><p>${esc(linhaParcela(x))}${perfil() === 'tudo' ? ` · ${N.PERFIS[x.perfil]}` : ''}</p></div>
        <div class="dir"><span class="ctl-rotulo">Falta</span><strong class="ctl-num" data-div-devido>${brl(x.devido)}</strong></div>
      </div>
      <div class="ctl-div-proposta">${proposta}</div>
      <div class="ctl-div-acoes">
        <button type="button" class="btn btn-secondary" data-acao="divida-proposta" data-id="${esc(x.id)}" aria-label="${pr ? 'Proposta de' : 'Anotar proposta de'} ${esc(x.credor)}">Proposta</button>
        <button type="button" class="btn btn-secondary" data-acao="divida-editar" data-id="${esc(x.id)}" aria-label="Editar ${esc(x.credor)}">${ic('lapis')} Editar</button>
        <button type="button" class="btn btn-secondary" data-acao="divida-quitar" data-id="${esc(x.id)}" aria-label="Quitei ${esc(x.credor)}">${ic('check')} Quitei</button>
        <button type="button" class="ctl-icone-btn" data-acao="divida-excluir" data-id="${esc(x.id)}" aria-label="Excluir ${esc(x.credor)}">${ic('lixo')}</button>
      </div>
    </li>`;
  }
  function telaDividas() {
    document.body.setAttribute('data-sem-novo', '');
    if (!recursos().dividas) return vitrineDividas();
    const r = ref(), res = N.resumoDividas(db, perfil(), r), daConta = N.contasParaDivida(db, perfil());
    const cab = `<div class="ctl-tela-cab"><div><h1>Dívidas</h1><p>O que você deve, as propostas de desconto e quanto as parcelas pesam no mês.</p></div>
      <button type="button" class="btn btn-primary ctl-div-nova" data-acao="divida-nova">${ic('mais')} Nova dívida</button></div>`;
    const deContas = daConta.length ? `<p class="ctl-dica" data-div-de-conta>${daConta.length === 1 ? 'Você tem 1 conta marcada como dívida' : `Você tem ${daConta.length} contas marcadas como dívida`}; dá para começar o cadastro por ${daConta.length === 1 ? 'ela' : 'elas'} em "Nova dívida".</p>` : '';
    if (!res.lista.length && !res.quitadas.length) {
      return `${cab}<div class="ctl-vazio"><div class="ic">${ic('divida')}</div>
        <h2>Suas dívidas num lugar só</h2>
        <p>Anote cada dívida uma vez: com quem é, quanto falta, a parcela e as propostas de desconto. As parcelas entram sozinhas no fluxo de caixa e no "Meu mês".</p>
        <div class="ctl-vazio-botoes um"><button type="button" class="btn btn-primary" data-acao="divida-nova">${ic('mais')} Cadastrar dívida</button></div>
        ${deContas}</div>`;
    }
    const semRenda = res.renda == null;
    const usoRenda = semRenda ? 0 : Math.min(100, res.pctRenda);
    const resumo = `<div class="ctl-saldo ctl-div-resumo" data-dividas="resumo">
        <span class="ctl-rotulo">Total devido hoje · ${esc(nomePerfil())}</span>
        <div class="ctl-num g" data-div="total" data-contar="${res.totalDevido}" data-chave="div-total">${brl(res.totalDevido)}</div>
        <div class="ctl-div-grade">
          <div><span class="ctl-rotulo">À vista com os descontos</span><span class="v ctl-num" data-div="vista">${brl(res.totalVista)}</span></div>
          <div class="eco"><span class="ctl-rotulo">Economia</span><span class="v ctl-num" data-div="economia">${brl(res.economia)}</span><small data-div="economia-pct">${pct(res.pctEconomia)} do total</small></div>
          <div><span class="ctl-rotulo">Parcelas por mês</span><span class="v ctl-num" data-div="compromisso">${brl(res.compromisso)}</span><small data-div="pct-renda">${semRenda ? 'Informe a renda para ver o peso' : `${pct(res.pctRenda)} da renda`}</small></div>
          <div><span class="ctl-rotulo">Sobra por mês depois das parcelas</span>${semRenda ? `<button type="button" class="ctl-link" data-acao="renda">Informar renda mensal</button>`
            : `<span class="v ctl-num${res.sobra < 0 ? ' neg' : ''}" data-div="sobra">${brl(res.sobra)}</span>`}</div>
        </div>
        ${semRenda ? '' : `<div class="ctl-div-barra" role="img" aria-label="As parcelas ocupam ${pct(res.pctRenda)} da renda mensal"><span style="width:${usoRenda}%"></span></div>
        <p class="ctl-div-renda">Renda mensal <strong class="ctl-num" data-div="renda">${brl(res.renda)}</strong> <button type="button" class="ctl-link" data-acao="renda">Alterar</button></p>`}
      </div>`;
    const alerta = res.vencendo.length ? `<div class="ctl-alerta aviso" data-div-vencendo>${ic('relogio')}<div>${res.vencendo.map(x => {
        const n = x.proposta.venceEm;
        return `<p>A proposta de <strong>${esc(x.credor)}</strong> ${n === 0 ? 'vence hoje' : `vence em ${n} ${n === 1 ? 'dia' : 'dias'} (${N.dataBR(x.proposta.validade).slice(0, 5)})`}: ${semQuebra(brl(x.vista))} à vista.</p>`;
      }).join('')}</div></div>` : '';
    const consulta = recursos().consultasPro && res.lista.length
      ? `<div class="ctl-acoes"><button type="button" class="btn btn-secondary" data-acao="consulta" data-id="dividas">${ic('lampada')} Como saio das dívidas?</button></div>` : '';
    return `${cab}${resumo}${alerta}${consulta}
      <div class="ctl-bloco"><div class="ctl-bloco-cab"><h2>Em aberto</h2><span class="ctl-rotulo">Maior economia primeiro</span></div>
        ${res.lista.length ? `<ul class="ctl-div-lista">${res.lista.map(cartaoDivida).join('')}</ul>` : `<div class="ctl-alerta ok">${ic('ok')}<p>Nenhuma dívida em aberto.</p></div>`}
        <p class="ctl-dica" style="margin-top:10px">As parcelas entram sozinhas em Contas, no Fluxo de caixa e no "Meu mês", até ${N.HORIZONTE_DIAS} dias à frente. Proposta vencida não entra no total à vista.</p>
        ${deContas}
      </div>
      ${res.quitadas.length ? `<details class="ctl-bloco ctl-div-quitadas"><summary class="ctl-bloco-cab"><h2>Quitadas</h2><span class="ctl-rotulo">${res.quitadas.length} ${ic('dir')}</span></summary>
        <ul class="ctl-cats">${res.quitadas.map(x => `<li><span class="ic">${ic('check')}</span><span class="nome">${esc(x.credor)}<small>${x.quitadaEm ? `Quitada em ${N.dataBR(x.quitadaEm)}` : 'Parcelas pagas'}</small></span>
          <button type="button" class="ctl-icone-btn" data-acao="divida-excluir" data-id="${esc(x.id)}" aria-label="Excluir ${esc(x.credor)}">${ic('lixo')}</button></li>`).join('')}</ul></details>` : ''}`;
  }

  function cartaoPlano() {
    const p = plano(), r = ref(), lim = N.RECURSOS.gratis.lancamentosMes, usados = N.lancamentosNoMes(db, N.mesDe(r));
    let corpo;
    if (p.codigo === 'pro') {
      corpo = `<p class="sub">Tudo liberado: lançamentos ilimitados, Pessoal + Negócio, Dívidas, relatório no WhatsApp, Orientador completo com as 4 consultas e planilha.</p>`;
    } else if (p.codigo === 'teste') {
      corpo = `<p class="sub">Tudo do Pro liberado até <strong>${N.dataBR(p.testeFim)}</strong> (${p.diasRestantes === 1 ? 'último dia' : `faltam ${p.diasRestantes} dias`}). Depois, se não assinar, volta para o grátis sem perder nada.</p>
        <div class="ctl-acoes"><a class="btn btn-primary" href="/assinar.html">Assinar o Pro · R$ ${PRO.preco}/mês</a><button type="button" class="btn btn-secondary" data-acao="pro">Ver o que muda</button></div>`;
    } else {
      corpo = `<p class="sub">Até ${lim} lançamentos por mês, 1 perfil, 1 dica do Orientador por dia e a consulta da parcela. Backup liberado.${p.testeUsado ? ` Seu teste do Pro terminou em ${N.dataBR(p.testeFim)}; seus dados continuam todos aqui.` : ''}</p>
        <p class="ctl-plano-uso" data-plano-uso><strong>${Math.min(usados, lim)} de ${lim}</strong> lançamentos este mês</p>
        <div class="ctl-progresso" role="progressbar" aria-label="Lançamentos do mês no plano grátis" aria-valuemin="0" aria-valuemax="${lim}" aria-valuenow="${Math.min(usados, lim)}"><span style="width:${Math.min(100, usados / lim * 100)}%"></span></div>
        <div class="ctl-acoes">${p.testeUsado ? '' : '<button type="button" class="btn btn-primary" data-acao="pro-teste">Testar o Pro por 7 dias</button>'}
          <button type="button" class="btn btn-secondary" data-acao="pro">Conhecer o Pro</button></div>`;
    }
    return `<div class="ctl-card largo ctl-plano" data-plano="${p.codigo}">
      <div class="ctl-bloco-cab" style="margin:0"><h2>${{ gratis: 'Plano grátis', teste: 'Teste do Pro', pro: PRO.nome }[p.codigo]}</h2>${p.codigo === 'gratis' ? '' : '<span class="ctl-selo-pro">Pro</span>'}</div>
      ${corpo}
      <details class="ctl-mais ctl-demo"><summary><span>Demonstração do plano <span class="opc">(sem pagamento de verdade)</span></span>${ic('dir')}</summary>
        <div><p class="ctl-dica">A assinatura ainda não está ligada a nenhum pagamento. Estes botões só mudam o plano neste aparelho, para você testar como fica.</p>
          <div class="ctl-acoes" style="margin-top:0">
            <button type="button" class="btn btn-secondary" data-acao="demo-pro">Simular assinatura ativa</button>
            <button type="button" class="btn btn-secondary" data-acao="demo-gratis">Voltar ao grátis</button>
            ${p.testeUsado && p.codigo !== 'pro' ? '<button type="button" class="btn btn-secondary" data-acao="demo-fim-teste">Encerrar o teste agora</button>' : ''}
          </div></div></details>
    </div>`;
  }

  function telaAjustes() {
    document.body.setAttribute('data-sem-novo', '');
    const si = db.config.saldoInicial;
    const cats = [...db.config.categorias].sort((a, b) => a.tipo.localeCompare(b.tipo) || a.nome.localeCompare(b.nome));
    return `${cabecalho('Ajustes', 'Seu plano, saldo inicial, categorias e seus dados.')}
      <div class="ctl-ajustes">
        ${cartaoPlano()}
        <div class="ctl-card"><h2>Saldo inicial</h2><p class="sub">Quanto você tinha quando começou a usar o Control. É a base do saldo de hoje.</p>
          <div class="ctl-saldo-pe" style="border-top:none;padding-top:0">
            <div><span class="ctl-rotulo">Pessoal</span><span class="v" data-saldo-ini="pessoal">${brl(si.pessoal)}</span></div>
            <div><span class="ctl-rotulo">Negócio</span><span class="v" data-saldo-ini="negocio">${brl(si.negocio)}</span></div>
          </div>
          <div class="ctl-acoes"><button type="button" class="btn btn-secondary" data-acao="saldo">${ic('lapis')} Alterar saldo inicial</button></div>
        </div>
        <div class="ctl-card"><h2>Seus dados</h2><p class="sub">Tudo fica salvo só neste aparelho e neste navegador. Exporte um backup de vez em quando e guarde o arquivo; com ele você restaura tudo em outro aparelho.</p>
          <div class="ctl-acoes">
            <button type="button" class="btn btn-secondary" data-acao="exportar-json">${ic('baixar')} Exportar backup</button>
            <button type="button" class="btn btn-secondary" data-acao="importar-json">${ic('subir')} Importar backup</button>
            <button type="button" class="btn btn-secondary" data-acao="exportar-csv">${ic('tabela')} Planilha (CSV)${recursos().csv ? '' : ' <span class="ctl-selo-pro">Pro</span>'}</button>
          </div>
        </div>
        <div class="ctl-card largo"><h2>Categorias</h2><p class="sub">Use os nomes que fazem sentido para você. Ao excluir uma categoria, as contas dela vão para "Outros".</p>
          <form class="ctl-busca-linha" id="form-cat" style="margin-top:12px" novalidate>
            <label class="ctl-campo" style="flex:1"><span class="sr-only">Nome da nova categoria</span><input id="cat-nome" type="text" maxlength="60" placeholder="Nova categoria (ex.: Pet)" autocomplete="off"></label>
            <label class="ctl-campo" style="flex:0 0 130px"><span class="sr-only">Tipo</span><select id="cat-tipo"><option value="pagar">A pagar</option><option value="receber">A receber</option></select></label>
            <button type="submit" class="btn btn-primary">${ic('mais')}<span class="sr-only">Adicionar categoria</span></button>
          </form>
          <ul class="ctl-cats">${cats.map(c => `<li><span class="ic">${ic(c.icone)}</span><span class="nome">${esc(c.nome)}</span><span class="tipo">${c.tipo === 'pagar' ? 'A pagar' : 'A receber'}</span>
            <button type="button" class="ctl-icone-btn" data-acao="cat-renomear" data-id="${esc(c.id)}" aria-label="Renomear ${esc(c.nome)}">${ic('lapis')}</button>
            <button type="button" class="ctl-icone-btn" data-acao="cat-excluir" data-id="${esc(c.id)}" aria-label="Excluir ${esc(c.nome)}">${ic('lixo')}</button></li>`).join('')}</ul>
        </div>
        <div class="ctl-card ctl-perigo largo"><h2>Recomeçar do zero</h2><p class="sub">Apaga todas as contas, categorias e o saldo deste aparelho. Exporte um backup antes.</p>
          <div class="ctl-acoes"><button type="button" class="btn btn-perigo" data-acao="apagar-tudo">${ic('lixo')} Apagar todos os dados</button></div>
        </div>
      </div>`;
  }

  // ---------- desenho geral ----------
  const RENDER = { inicio: telaInicio, mes: telaMes, contas: telaContas, dividas: telaDividas, fluxo: telaFluxo, relatorio: telaRelatorio, ajustes: telaAjustes };

  function menu() {
    const item = (t, cls) => `<a href="#${t.id}" class="${cls}"${estado.tela === t.id ? ' aria-current="page"' : ''}>${ic(t.icone)}<span>${t.nome}</span></a>`;
    $('[data-menu="lateral"]').innerHTML = TELAS.map(t => item(t, 'ctl-menu-item')).join('');
    $('[data-menu="inferior"]').innerHTML = TELAS.map(t => `<a href="#${t.id}"${estado.tela === t.id ? ' aria-current="page"' : ''}>${ic(t.icone)}<span>${t.curto || t.nome}</span></a>`).join('');
  }
  function barra() {
    $('#perfil').value = perfil();
    const p = plano();
    $('[data-plano-lateral]').innerHTML = p.codigo === 'pro' ? `<span class="ctl-selo-pro">Pro</span> ${PRO.nome}`
      : p.codigo === 'teste' ? `<span class="ctl-selo-pro">Pro</span> Teste até ${N.dataCurta(p.testeFim)}`
      : `Plano grátis · <button type="button" class="ctl-link" data-acao="pro">Conhecer o Pro</button>`;
    const topo = pilha[pilha.length - 1], btn = $('#desfazer');
    btn.hidden = !topo;
    if (topo) { btn.setAttribute('aria-label', `Desfazer: ${topo.rotulo}`); btn.title = `Desfazer: ${topo.rotulo}`; }
  }
  function render() {
    const foco = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.foco : null;
    $('#tela').innerHTML = RENDER[estado.tela]();
    carimbar = null;
    menu(); barra(); desenharOrientador();
    document.title = `${TELAS.find(t => t.id === estado.tela).nome} · Warden Control`;
    if (foco) { const el = $(`[data-foco="${CSS.escape(foco)}"]`); if (el) el.focus({ preventScroll: true }); }
    window.ControlEfeitos.aplicar($('#tela'));
    if ($('#dlg-detalhe').open && detalheId) desenharDetalhe();
  }
  function irPara(tela) {
    if (!RENDER[tela]) tela = 'inicio';
    if (location.hash !== '#' + tela) { location.hash = tela; return; }   // hashchange chama de novo
    estado.tela = tela;
    render();
  }
  function rotaAtual() {
    const t = location.hash.replace('#', '');
    estado.tela = RENDER[t] ? t : 'inicio';
    render();
    window.ControlEfeitos.entrarTela($('#tela'));
    window.scrollTo(0, 0);
    $('#tela').focus({ preventScroll: true });
  }

  // ---------- campos de dinheiro ----------
  function lerDinheiro(input, { negativo = false } = {}) {
    let s = input.value.trim(), neg = false;
    if (negativo && /^[−-]/.test(s)) { neg = true; s = s.replace(/^[−-]\s*/, ''); }
    if (!s) return 0;
    const c = N.parseCentavos(s);
    return c == null ? null : (neg ? -c : c);
  }
  function formatarCampo(input, { negativo = false } = {}) {
    const c = lerDinheiro(input, { negativo });
    if (c != null && input.value.trim()) input.value = (c < 0 ? '-' : '') + N.formatBRL(Math.abs(c), { semSimbolo: true });
  }
  function erroCampo(form, campo, msg) {
    const el = $(`[data-campo="${campo}"]`, form);
    if (!el) return;
    el.classList.toggle('erro', !!msg);
    const m = $('.msg', el); if (m) m.textContent = msg || '';
  }
  function limparErros(form) { $$('.ctl-campo.erro', form).forEach(el => { el.classList.remove('erro'); const m = $('.msg', el); if (m) m.textContent = ''; }); }

  // ---------- novo lançamento / editar ----------
  const dlgLanc = $('#dlg-lanc'), formLanc = $('#form-lanc');
  let editandoId = null;
  const val = nome => (formLanc.querySelector(`input[name="${nome}"]:checked`) || {}).value;

  function preencherCategorias(tipo, selecionada) {
    const cats = db.config.categorias.filter(c => c.tipo === tipo);
    const sel = $('#lanc-cat');
    sel.innerHTML = '<option value="">Sem categoria</option>' + cats.map(c => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join('');
    sel.value = cats.some(c => c.id === selecionada) ? selecionada : '';
  }
  function atualizarFormLanc() {
    const tipo = val('tipo'), rep = val('repeticao');
    $('#lanc-paga-rot').textContent = tipo === 'receber' ? 'Já recebi (dá baixa hoje)' : 'Já paguei (dá baixa hoje)';
    $('#lanc-contato-rot').textContent = tipo === 'receber' ? 'Quem vai pagar' : 'Para quem';
    $('#lanc-divida-bloco').hidden = tipo !== 'pagar';
    revelar($('#lanc-taxa-bloco'), tipo === 'pagar' && $('#lanc-divida').checked);
    revelar($('#lanc-parcelas-bloco'), rep === 'parcelada');
    revelar($('#lanc-freq-bloco'), rep === 'recorrente');
    $('#lanc-valor-rot').textContent = rep === 'parcelada' ? 'Valor total' : 'Valor';
    const dica = $('#lanc-rep-dica'), v = lerDinheiro($('#lanc-valor')), n = Number($('#lanc-parcelas').value), venc = $('#lanc-venc').value;
    if (rep === 'parcelada' && v > 0 && n >= 2 && n <= 120) {
      const partes = N.repartir(v, n), ultima = N.dataValida(venc) ? N.addMeses(venc, n - 1) : null;
      dica.innerHTML = `<strong>${n}x de ${brl(partes[partes.length - 1])}</strong>${partes[0] !== partes[partes.length - 1] ? ` (a 1ª com ${brl(partes[0])})` : ''}${ultima ? `, a última vence em ${N.dataBR(ultima)}` : ''}.`;
      dica.hidden = false;
    } else if (rep === 'recorrente') {
      const f = $('#lanc-freq').value;
      dica.innerHTML = `As próximas aparecem sozinhas ${{ mensal: 'todo mês', semanal: 'toda semana', anual: 'todo ano' }[f]}, sempre com até 90 dias de antecedência.`;
      dica.hidden = false;
    } else dica.hidden = true;
  }
  function datalists() {
    const uniq = arr => [...new Set(arr.filter(Boolean))].slice(-200);
    $('#lista-descricoes').innerHTML = uniq(db.contas.map(c => c.descricao)).map(d => `<option value="${esc(d)}">`).join('');
    $('#lista-contatos').innerHTML = uniq(db.contas.map(c => c.contato)).map(d => `<option value="${esc(d)}">`).join('');
  }
  function abrirLancamento({ tipo, id } = {}) {
    editandoId = id || null;
    const c = id ? N.acharConta(db, id) : null;
    formLanc.reset(); limparErros(formLanc);
    $('#lanc-forma').innerHTML = '<option value="">Não informar</option>' + N.FORMAS.map(f => `<option>${esc(f)}</option>`).join('');
    const t = c ? c.tipo : (tipo || (estado.tela === 'contas' && estado.filtro.tipo !== 'todas' ? estado.filtro.tipo : 'pagar'));
    formLanc.querySelector(`input[name="tipo"][value="${t}"]`).checked = true;
    const umPerfil = recursos().perfis < 2;
    const pf = c ? c.perfil : umPerfil ? 'pessoal' : (perfil() === 'tudo' ? (db.config.ultimoPerfil || 'pessoal') : perfil());
    formLanc.querySelector(`input[name="perfil"][value="${pf}"]`).checked = true;
    $('#lanc-perfil-bloco').hidden = umPerfil;
    preencherCategorias(t, c ? c.categoriaId : '');
    $('#lanc-titulo').textContent = c ? 'Editar conta' : 'Novo lançamento';
    $('#lanc-salvar').textContent = c ? 'Salvar alterações' : 'Salvar';
    $('#lanc-rep-bloco').hidden = !!c;
    $('#lanc-paga-bloco').hidden = !!c;
    $('#lanc-serie-bloco').hidden = !(c && c.recorrenciaId);
    if (c) {
      $('#lanc-valor').value = N.formatBRL(c.valor, { semSimbolo: true });
      $('#lanc-desc').value = c.descricao;
      $('#lanc-venc').value = c.vencimento;
      $('#lanc-contato').value = c.contato; $('#lanc-forma').value = c.forma; $('#lanc-obs').value = c.obs;
      $('#lanc-divida').checked = !!c.divida;
      $('#lanc-taxa').value = c.divida && c.divida.taxa != null ? N.formatTaxa(c.divida.taxa) : '';
      $('#lanc-mais').open = !!(c.contato || c.forma || c.obs || c.divida);
    } else {
      $('#lanc-venc').value = ref();
      $('#lanc-mais').open = false;
    }
    datalists(); atualizarFormLanc();
    abrirModal(dlgLanc);
    setTimeout(() => $('#lanc-valor').focus(), 30);
  }
  formLanc.addEventListener('change', e => {
    if (e.target.name === 'tipo') preencherCategorias(val('tipo'), $('#lanc-cat').value);
    atualizarFormLanc();
  });
  formLanc.addEventListener('input', e => { if (['lanc-valor', 'lanc-parcelas'].includes(e.target.id)) atualizarFormLanc(); });
  $('#lanc-valor').addEventListener('blur', e => formatarCampo(e.target));
  formLanc.addEventListener('submit', e => {
    e.preventDefault();
    limparErros(formLanc);
    const valor = lerDinheiro($('#lanc-valor'));
    const dados = {
      tipo: val('tipo'), descricao: $('#lanc-desc').value, valor: valor == null ? NaN : valor, vencimento: $('#lanc-venc').value,
      categoriaId: $('#lanc-cat').value, perfil: val('perfil'), contato: $('#lanc-contato').value, forma: $('#lanc-forma').value, obs: $('#lanc-obs').value,
      repeticao: editandoId ? 'unica' : val('repeticao'), parcelas: Number($('#lanc-parcelas').value), freq: $('#lanc-freq').value,
      jaPaga: !editandoId && $('#lanc-paga').checked, ref: ref(),
      divida: val('tipo') === 'pagar' && $('#lanc-divida').checked
        ? { taxa: $('#lanc-taxa').value.trim() ? (N.parseTaxa($('#lanc-taxa').value) ?? NaN) : null } : null
    };
    const erros = N.validarLancamento(dados);
    if (valor == null) erros.unshift({ campo: 'valor', msg: 'Não entendi esse valor. Use só números, como 1.250,90.' });
    if (erros.length) {
      erros.forEach(er => erroCampo(formLanc, er.campo, er.msg));
      if (erros.some(er => er.campo === 'taxa')) $('#lanc-mais').open = true;
      const primeiro = $(`[data-campo="${erros[0].campo}"] input, [data-campo="${erros[0].campo}"] select`, formLanc);
      if (primeiro) primeiro.focus();
      return;
    }
    // limite do grátis: abre a vitrine do Pro por cima, sem fechar o formulário (nada do que foi digitado se perde)
    if (!editandoId && !N.podeLancar(db, ref())) { abrirPro('lancar'); return; }
    try {
      if (editandoId) {
        const { acao } = mudar('Editar conta', d => N.editarConta(d, editandoId, dados, { aplicarSerie: $('#lanc-serie').checked }));
        dlgLanc.close();
        toast('Alterações salvas', { desfazer: acao });
      } else {
        const { valor: criadas, acao } = mudar('Novo lançamento', d => { d.config.ultimoPerfil = dados.perfil; return N.criarLancamento(d, dados); });
        dlgLanc.close();
        const msg = dados.repeticao === 'parcelada' ? `${criadas.length} parcelas criadas`
          : dados.repeticao === 'recorrente' ? `Conta que se repete criada (${criadas.length} já na lista)`
          : dados.jaPaga ? (dados.tipo === 'receber' ? 'Lançado como recebido' : 'Lançado como pago') : 'Conta anotada';
        const lim = recursos().lancamentosMes, resta = lim - N.lancamentosNoMes(db, N.mesDe(ref()));
        toast(lim !== Infinity && resta <= 5 ? `${msg}. ${resta ? `Faltam ${resta} no grátis este mês` : 'Era o último do grátis este mês'}` : msg, { desfazer: acao });
      }
    } catch (err) {
      (err.erros || [{ campo: 'valor', msg: err.message }]).forEach(er => erroCampo(formLanc, er.campo, er.msg));
    }
  });

  // ---------- detalhe ----------
  const dlgDet = $('#dlg-detalhe');
  let detalheId = null, ajusteAberto = false;
  function abrirDetalhe(id) {
    detalheId = id; ajusteAberto = false;
    desenharDetalhe();
    if (!dlgDet.open) dlgDet.showModal();
  }
  function desenharDetalhe() {
    const c = N.acharConta(db, detalheId);
    if (!c) { dlgDet.close(); return; }
    const r = ref(), st = N.status(c, r), falta = N.restante(c), paga = st.codigo === 'paga';
    const rec = c.recorrenciaId ? db.recorrencias.find(x => x.id === c.recorrenciaId) : null;
    const info = [
      ['Vencimento', N.dataBR(c.vencimento)], ['Categoria', N.nomeCategoria(db, c.categoriaId)], ['Perfil', N.PERFIS[c.perfil]],
      c.contato && [c.tipo === 'receber' ? 'Quem paga' : 'Para quem', c.contato], c.forma && ['Forma de pagamento', c.forma],
      c.parcela && ['Parcela', `${c.parcela.n} de ${c.parcela.total}`],
      rec && ['Repete', { mensal: 'Todo mês', semanal: 'Toda semana', anual: 'Todo ano' }[rec.freq]],
      c.dividaId && ['Dívida', `${rotuloParcelaDivida(c).replace(/^./, l => l.toUpperCase())}${(db.dividas || []).some(x => x.id === c.dividaId) ? ` (${(db.dividas.find(x => x.id === c.dividaId)).credor}, em Dívidas)` : ''}`],
      c.divida && ['Dívida com juros', c.divida.taxa != null ? `${N.formatTaxa(c.divida.taxa)}% ao mês` : 'Juros não informados'],
      c.obs && ['Observação', c.obs, 'largo']
    ].filter(Boolean);
    const verbo = c.tipo === 'receber' ? 'recebimento' : 'pagamento';
    dlgDet.innerHTML = `
      <div class="ctl-dlg-cab"><h2 id="det-titulo">${c.tipo === 'receber' ? 'A receber' : 'A pagar'}</h2>
        <button type="button" class="ctl-icone-btn" data-fechar aria-label="Fechar">${ic('x')}</button></div>
      <div class="ctl-dlg-miolo">
        <div class="ctl-det-topo"><span class="ctl-pill ${classePill(st.codigo)}">${esc(N.rotuloStatus(c, r))}</span></div>
        <p class="ctl-det-desc">${esc(c.descricao)}</p>
        <div class="ctl-num g ctl-det-valor" data-det="valor">${brl(c.valor)}</div>
        ${c.baixas.length && !paga ? `<p class="ctl-dica" data-det="restante">Faltam <strong>${brl(falta)}</strong></p>` : ''}
        <dl class="ctl-det-info">${info.map(([k, v, cls]) => `<div class="${cls || ''}"><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        ${c.baixas.length ? `<span class="ctl-rotulo">Baixas</span><ul class="ctl-baixas">${[...c.baixas].sort((a, b) => a.data.localeCompare(b.data)).map(b => `<li>
          <span class="info"><strong class="ctl-num">${brl(b.valor)}</strong> em ${N.dataBR(b.data)}${b.desconto || b.juros ? `<small>${[b.desconto ? 'desconto ' + brl(b.desconto) : '', b.juros ? 'juros/multa ' + brl(b.juros) : ''].filter(Boolean).join(' · ')}</small>` : ''}</span>
          <button type="button" class="ctl-icone-btn" data-acao="det-remover-baixa" data-baixa="${esc(b.id)}" aria-label="Remover esta baixa">${ic('x')}</button></li>`).join('')}</ul>` : ''}
        ${!paga && ajusteAberto ? `<form class="ctl-ajuste" id="form-ajuste" novalidate>
          <div class="duas" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">
            <div class="ctl-campo"><label for="aj-valor">Valor ${c.tipo === 'receber' ? 'recebido' : 'pago'}</label><div class="ctl-dinheiro"><span>R$</span><input id="aj-valor" type="text" inputmode="decimal" autocomplete="off" value="${N.formatBRL(falta, { semSimbolo: true })}"></div></div>
            <div class="ctl-campo"><label for="aj-data">Data</label><input id="aj-data" type="date" value="${r}"></div>
            <div class="ctl-campo"><label for="aj-desconto">Desconto <span class="opc">(opcional)</span></label><div class="ctl-dinheiro"><span>R$</span><input id="aj-desconto" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00"></div></div>
            <div class="ctl-campo"><label for="aj-juros">Juros/multa <span class="opc">(opcional)</span></label><div class="ctl-dinheiro"><span>R$</span><input id="aj-juros" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00"></div></div>
          </div>
          <p class="ctl-ajuste-res" id="aj-res" aria-live="polite"></p>
          <button type="submit" class="btn btn-primary">Confirmar ${verbo}</button>
        </form>` : ''}
      </div>
      <div class="ctl-dlg-pe" style="display:block">
        <div class="ctl-det-acoes">
          ${paga ? `<button type="button" class="btn btn-secondary largo" data-acao="det-reabrir">Reabrir (desfazer as baixas)</button>`
            : `<button type="button" class="btn btn-primary largo" data-acao="det-baixa-total">${ic('check')} Dar baixa total · ${brl(falta)}</button>
               ${ajusteAberto ? '' : `<button type="button" class="btn btn-secondary largo" data-acao="det-ajustes">Dar baixa com ajustes</button>`}`}
          <button type="button" class="btn btn-secondary" data-acao="det-editar">${ic('lapis')} Editar</button>
          <button type="button" class="btn btn-secondary" data-acao="det-excluir">${ic('lixo')} Excluir</button>
        </div>
      </div>`;
    if (ajusteAberto && !paga) atualizarAjuste();
  }
  function lerAjuste() {
    return { valor: lerDinheiro($('#aj-valor')), desconto: lerDinheiro($('#aj-desconto')), juros: lerDinheiro($('#aj-juros')), data: $('#aj-data').value };
  }
  function atualizarAjuste() {
    const c = N.acharConta(db, detalheId), a = lerAjuste(), res = $('#aj-res');
    if (!c || !res) return true;
    let erro = '';
    if ([a.valor, a.desconto, a.juros].some(v => v == null)) erro = 'Não entendi algum valor. Use só números, como 1.250,90.';
    else if (!N.dataValida(a.data)) erro = 'Escolha a data.';
    const ab = erro ? 0 : a.valor + a.desconto - a.juros, falta = N.restante(c);
    if (!erro && ab <= 0) erro = 'Esta baixa não abate nada da conta.';
    if (!erro && ab > falta) erro = `Isso abate ${brl(ab)}, mas só faltam ${brl(falta)}. Juros e multa vão no campo próprio.`;
    res.classList.toggle('erro', !!erro);
    res.innerHTML = erro ? esc(erro) : ab === falta ? `Quita a conta${a.desconto ? ` com ${brl(a.desconto)} de desconto` : ''}${a.juros ? ` e ${brl(a.juros)} de juros/multa` : ''}.`
      : `Abate <strong>${brl(ab)}</strong>. Ficam faltando <strong>${brl(falta - ab)}</strong>.`;
    return !erro;
  }
  dlgDet.addEventListener('input', e => { if (e.target.closest('#form-ajuste')) atualizarAjuste(); });
  dlgDet.addEventListener('focusout', e => { if (e.target.matches('#form-ajuste input[inputmode]')) formatarCampo(e.target); });
  dlgDet.addEventListener('submit', e => {
    if (e.target.id !== 'form-ajuste') return;
    e.preventDefault();
    if (!atualizarAjuste()) return;
    const c = N.acharConta(db, detalheId), a = lerAjuste();
    try {
      const { acao } = mudar(N.restante(c) === a.valor + a.desconto - a.juros ? 'Baixa' : 'Baixa parcial', d => N.darBaixa(d, c.id, a));
      ajusteAberto = false; desenharDetalhe();
      const c2 = N.acharConta(db, detalheId);
      toast(N.quitada(c2) ? `${c2.descricao}: quitada` : `Baixa registrada. Faltam ${brl(N.restante(c2))}`, { desfazer: acao });
    } catch (err) { const res = $('#aj-res'); res.classList.add('erro'); res.textContent = err.message; }
  });

  // ---------- perguntas (confirmar / escolher / renomear) ----------
  const dlgConf = $('#dlg-confirmar');
  /** abre uma janela com botões; devolve a promessa do valor escolhido (null = cancelou). campo: { rotulo, valor } pede um texto. */
  let perguntaAberta = null;   // { fim } da pergunta que está na tela
  function perguntar({ titulo, texto = '', campo = null, botoes, cancelar = 'Cancelar' }) {
    if (perguntaAberta) perguntaAberta.fim(null);
    return new Promise(resolve => {
      dlgConf.innerHTML = `<form method="dialog" novalidate>
        <div class="ctl-dlg-cab"><h2 id="conf-titulo">${esc(titulo)}</h2><button type="button" class="ctl-icone-btn" data-fechar aria-label="Fechar">${ic('x')}</button></div>
        <div class="ctl-dlg-miolo ctl-form">${texto ? `<p class="ctl-dica" style="font-size:.92rem">${texto}</p>` : ''}
          ${campo ? `<div class="ctl-campo"><label for="conf-campo">${esc(campo.rotulo)}</label>${campo.dinheiro
            ? `<div class="ctl-dinheiro grande"><span>R$</span><input id="conf-campo" type="text" inputmode="decimal" value="${esc(campo.valor || '')}" autocomplete="off"></div>`
            : `<input id="conf-campo" type="text" maxlength="60" value="${esc(campo.valor || '')}" autocomplete="off">`}</div>` : ''}
          <div class="ctl-escolhas">${botoes.map((b, i) => `<button type="${i === 0 ? 'submit' : 'button'}" class="btn ${b.classe || 'btn-secondary'}" data-v="${esc(b.valor)}">${esc(b.rotulo)}</button>`).join('')}
            <button type="button" class="btn btn-secondary" data-fechar>${esc(cancelar)}</button></div>
        </div></form>`;
      let feito = false;
      const fim = v => {
        if (feito) return;
        feito = true;
        dlgConf.removeEventListener('close', aoFechar);
        if (perguntaAberta && perguntaAberta.fim === fim) perguntaAberta = null;
        resolve(v);
      };
      // o evento close chega numa tarefa depois do close(): o de uma pergunta anterior pode chegar com esta já aberta
      const aoFechar = () => { if (!dlgConf.open) fim(null); };
      dlgConf.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', ev => {
        ev.preventDefault();
        fim(campo ? { valor: b.dataset.v, texto: $('#conf-campo').value } : b.dataset.v);
        dlgConf.close();
      }));
      dlgConf.addEventListener('close', aoFechar);
      perguntaAberta = { fim };
      dlgConf.showModal();
      if (campo) setTimeout(() => $('#conf-campo').select(), 30);
    });
  }

  // ---------- janelas: abrir guardando o estado, não perder o que foi digitado, mostrar o campo que apareceu ----------
  const fotoForm = f => JSON.stringify([...f.elements].filter(el => el.id || el.name)
    .map(el => (el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value)));
  /** abre a janela de formulário e guarda como ela começou (para saber se a pessoa digitou algo) */
  function abrirModal(dlg) {
    const f = $('form', dlg);
    dlg.showModal();
    if (f) dlg.dataset.foto = fotoForm(f);
  }
  function sujo(dlg) { const f = $('form', dlg); return !!(f && dlg.dataset.foto && fotoForm(f) !== dlg.dataset.foto); }
  /** fechar sem salvar: com campos mudados, pergunta antes (Cancelar, X, fundo escuro e Esc) */
  async function tentarFechar(dlg) {
    if (!dlg || !dlg.open) return;
    if (!sujo(dlg)) { dlg.close(); return; }
    const r = await perguntar({ titulo: 'Descartar o que você digitou?', texto: 'O que você preencheu ainda não foi salvo.',
      botoes: [{ rotulo: 'Descartar', valor: 'sim', classe: 'btn-perigo' }], cancelar: 'Continuar editando' });
    if (r) dlg.close();
  }
  $$('.ctl-dlg').forEach(dlg => dlg.addEventListener('cancel', e => { if (sujo(dlg)) { e.preventDefault(); tentarFechar(dlg); } }));
  /** rola o miolo da janela, suave, até o campo que acabou de aparecer (o rodapé não sai do lugar) */
  function mostrarNoMiolo(el) {
    const m = el && el.closest('.ctl-dlg-miolo');
    if (!m || el.hidden) return;
    const a = el.getBoundingClientRect(), b = m.getBoundingClientRect(), folga = 12;
    const desce = a.bottom + folga - b.bottom, sobe = a.top - folga - b.top;
    const delta = desce > 0 ? Math.min(desce, Math.max(0, sobe)) : 0;
    if (delta > 0) m.scrollBy({ top: delta, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  /** mostra/esconde um bloco; se ele acabou de aparecer, rola até ele */
  function revelar(el, visivel) {
    const apareceu = el.hidden && visivel;
    el.hidden = !visivel;
    if (apareceu) requestAnimationFrame(() => mostrarNoMiolo(el));
  }
  // teclado do celular: a altura visível vira a altura máxima das janelas, e a folha de baixo sobe acima do teclado
  if (window.visualViewport) {
    const vv = window.visualViewport, raiz = document.documentElement;
    const medir = () => {
      raiz.style.setProperty('--vv-h', vv.height + 'px');
      raiz.style.setProperty('--teclado', Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) + 'px');
    };
    vv.addEventListener('resize', medir); vv.addEventListener('scroll', medir); medir();
  }
  // campo focado no celular (tela de toque): fica à vista dentro do miolo depois que o teclado abre
  document.addEventListener('focusin', e => { if (matchMedia('(pointer: coarse)').matches && e.target.closest('.ctl-dlg-miolo') && e.target.matches('input, select, textarea')) setTimeout(() => mostrarNoMiolo(e.target.closest('.ctl-campo') || e.target), 250); });

  // ---------- ações ----------
  function baixarPeloCirculo(id) {
    const c = N.acharConta(db, id);
    if (!c) return;
    if (N.quitada(c)) {
      const { acao } = mudar('Reabrir conta', d => N.reabrir(d, id));
      toast(`${c.descricao}: reaberta`, { desfazer: acao });
    } else {
      const falta = N.restante(c);
      carimbar = id;
      const { acao } = mudar(c.tipo === 'receber' ? 'Recebimento' : 'Pagamento', d => N.baixaTotal(d, id, ref()));
      toast(`${c.descricao}: ${c.tipo === 'receber' ? 'recebida' : 'paga'} · ${brl(falta)}`, { desfazer: acao });
    }
  }
  async function excluirConta(id) {
    const c = N.acharConta(db, id);
    if (!c) return;
    let escopo = 'esta';
    if (c.parcela || c.recorrenciaId) {
      const r = await perguntar({
        titulo: 'Excluir', texto: c.parcela ? `Esta é a parcela ${c.parcela.n} de ${c.parcela.total} de <strong>${esc(c.descricao)}</strong>.` : `<strong>${esc(c.descricao)}</strong> se repete.`,
        botoes: [{ rotulo: 'Só esta', valor: 'esta', classe: 'btn-perigo' }, { rotulo: c.parcela ? 'Esta e as próximas parcelas em aberto' : 'Esta e as próximas (encerra a repetição)', valor: 'proximas', classe: 'btn-perigo' }]
      });
      if (!r) return;
      escopo = r;
    } else {
      const r = await perguntar({ titulo: 'Excluir conta?', texto: `<strong>${esc(c.descricao)}</strong> (${brl(c.valor)}) sai da lista. Dá para desfazer logo depois.`, botoes: [{ rotulo: 'Excluir', valor: 'sim', classe: 'btn-perigo' }] });
      if (!r) return;
    }
    const { valor: n, acao } = mudar('Excluir', d => N.excluir(d, id, escopo));
    dlgDet.close();
    toast(n > 1 ? `${n} contas excluídas` : 'Conta excluída', { desfazer: acao });
  }

  function baixarArquivo(nome, conteudo, tipo) {
    const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
    const a = Object.assign(document.createElement('a'), { href: url, download: nome });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function categoriaRenomear(id) {
    const cat = N.categoria(db, id);
    const r = await perguntar({ titulo: 'Renomear categoria', campo: { rotulo: 'Nome', valor: cat.nome }, botoes: [{ rotulo: 'Salvar', valor: 'ok', classe: 'btn-primary' }] });
    const nome = r && r.texto.trim();
    if (!nome || nome === cat.nome) return;
    const { acao } = mudar('Renomear categoria', d => { N.categoria(d, id).nome = nome.slice(0, 60); });
    toast('Categoria renomeada', { desfazer: acao });
  }
  async function categoriaExcluir(id) {
    const cat = N.categoria(db, id), usadas = db.contas.filter(c => c.categoriaId === id).length;
    const outros = db.config.categorias.find(c => c.tipo === cat.tipo && c.id !== id && /^outr/i.test(c.nome));
    const r = await perguntar({
      titulo: 'Excluir categoria?', texto: `<strong>${esc(cat.nome)}</strong>${usadas ? ` está em ${usadas} ${usadas === 1 ? 'conta, que vai' : 'contas, que vão'} para "${esc(outros ? outros.nome : 'Sem categoria')}"` : ' não está em nenhuma conta'}.`,
      botoes: [{ rotulo: 'Excluir', valor: 'sim', classe: 'btn-perigo' }]
    });
    if (!r) return;
    const { acao } = mudar('Excluir categoria', d => {
      d.config.categorias = d.config.categorias.filter(c => c.id !== id);
      d.contas.forEach(c => { if (c.categoriaId === id) c.categoriaId = outros ? outros.id : ''; });
      d.recorrencias.forEach(c => { if (c.categoriaId === id) c.categoriaId = outros ? outros.id : ''; });
    });
    toast('Categoria excluída', { desfazer: acao });
  }

  const ACOES = {
    baixar: el => baixarPeloCirculo(el.dataset.id),
    abrir: el => abrirDetalhe(el.dataset.id),
    novo: el => abrirLancamento({ tipo: el.dataset.tipo }),
    saldo: () => abrirSaldo(),
    ir: el => irPara(el.dataset.tela),
    'ocultar-passos': () => { db.config.primeirosPassosOcultos = true; gravar(); render(); },
    'filtro-tipo': el => { estado.filtro.tipo = el.dataset.v; if (estado.filtro.categoriaId && (N.categoria(db, estado.filtro.categoriaId) || {}).tipo !== el.dataset.v && el.dataset.v !== 'todas') estado.filtro.categoriaId = ''; render(); },
    'filtro-status': el => { estado.filtro.status = el.dataset.v; render(); },
    'limpar-filtros': () => { estado.filtro = { tipo: 'todas', status: 'aberto', busca: '', categoriaId: '' }; render(); },
    periodo: el => { estado.periodo = Number(el.dataset.v); render(); },
    mes: el => { estado.mesRel = N.addMesYM(estado.mesRel || N.mesDe(ref()), Number(el.dataset.v)); render(); },
    'exportar-json': () => { baixarArquivo(`warden-control-backup-${ref()}.json`, JSON.stringify(N.backup(db), null, 2), 'application/json'); toast('Backup exportado. Guarde o arquivo em um lugar seguro.'); },
    'importar-json': () => $('#arquivo-backup').click(),
    'exportar-csv': () => { if (!recursos().csv) { abrirPro('csv'); return; } baixarArquivo(`warden-control-contas-${ref()}.csv`, N.csv(db, perfil(), ref()), 'text/csv;charset=utf-8'); toast('Planilha exportada.'); },
    'apagar-tudo': async () => {
      const r = await perguntar({ titulo: 'Apagar todos os dados?', texto: 'Todas as contas, categorias e o saldo deste aparelho somem. Você ainda pode desfazer logo depois; depois disso, só com um backup.', botoes: [{ rotulo: 'Apagar tudo', valor: 'sim', classe: 'btn-perigo' }] });
      if (!r) return;
      const acao = substituirDb('Apagar tudo', N.dbVazio());
      toast('Dados apagados', { desfazer: acao });
    },
    relatorio: async el => {
      const botoes = $$('[data-acao="relatorio"]');
      botoes.forEach(b => { b.disabled = true; });
      el.setAttribute('aria-busy', 'true');
      try { await enviarRelatorio(el.dataset.canal); }
      finally { botoes.forEach(b => { b.disabled = false; }); el.removeAttribute('aria-busy'); }
    },
    pro: el => abrirPro(el.dataset.motivo),
    'pro-teste': () => mudarPlano(p => { p.testeInicio = ref(); }, `Teste do Pro ativado: tudo liberado até ${N.dataBR(N.addDias(ref(), N.DIAS_TESTE - 1))}.`),
    // TODO (Etapa 2 do projeto): sair daqui. A assinatura de verdade é liberada pelo servidor (webhook verificado da Kiwify).
    'demo-pro': () => mudarPlano(p => { p.tipo = 'pro'; }, 'Demonstração: assinatura do Pro ativa neste aparelho.'),
    'demo-gratis': () => mudarPlano(p => { p.tipo = 'gratis'; }, 'Demonstração: de volta ao plano grátis. Nenhum dado foi apagado.'),
    'demo-fim-teste': () => { mudarPlano(p => { p.tipo = 'gratis'; p.testeInicio = N.addDias(ref(), -N.DIAS_TESTE); }); avisarFimTeste(); },
    'divida-nova': () => abrirDivida(),
    'divida-editar': el => abrirDivida({ id: el.dataset.id }),
    'divida-proposta': el => abrirDivida({ id: el.dataset.id, foco: 'proposta' }),
    'divida-quitar': el => quitarDivida(el.dataset.id),
    'divida-excluir': el => excluirDivida(el.dataset.id),
    renda: () => informarRenda(),
    consulta: el => abrirConsulta(el.dataset.id),
    'novo-modelo': () => abrirModelo(),
    'modelo-editar': el => abrirModelo(el.dataset.id),
    'modelo-excluir': el => excluirModelo(el.dataset.id),
    'mes-abrir': el => abrirItemMes(el.dataset.id),
    'cat-renomear': el => categoriaRenomear(el.dataset.id),
    'cat-excluir': el => categoriaExcluir(el.dataset.id),
    'det-baixa-total': () => { const id = detalheId; dlgDet.close(); baixarPeloCirculo(id); },
    'det-ajustes': () => { ajusteAberto = true; desenharDetalhe(); setTimeout(() => { const i = $('#aj-valor'); if (i) { i.focus(); i.select(); } }, 30); },
    'det-reabrir': () => { const c = N.acharConta(db, detalheId); const { acao } = mudar('Reabrir conta', d => N.reabrir(d, c.id)); toast(`${c.descricao}: reaberta`, { desfazer: acao }); },
    'det-remover-baixa': el => { const { acao } = mudar('Remover baixa', d => N.removerBaixa(d, detalheId, el.dataset.baixa)); toast('Baixa removida', { desfazer: acao }); },
    'det-editar': () => { const id = detalheId; dlgDet.close(); abrirLancamento({ id }); },
    'det-excluir': () => excluirConta(detalheId)
  };

  document.addEventListener('click', e => {
    const fechar = e.target.closest('[data-fechar]');
    if (fechar) { tentarFechar(fechar.closest('dialog')); return; }
    if (e.target.tagName === 'DIALOG') { tentarFechar(e.target); return; }   // clique no fundo escuro
    const novo = e.target.closest('[data-novo]');
    if (novo) { abrirLancamento(); return; }
    const el = e.target.closest('[data-acao]');
    if (el && !el.disabled && ACOES[el.dataset.acao]) ACOES[el.dataset.acao](el);
  });
  dlgDet.addEventListener('close', () => { detalheId = null; });
  document.addEventListener('toggle', e => {
    if (e.target.matches && e.target.matches('.ctl-mes-pagas')) estado.pagasAbertas = e.target.open;
    if (e.target.matches && e.target.matches('.ctl-dlg .ctl-mais') && e.target.open) requestAnimationFrame(() => mostrarNoMiolo(e.target));
  }, true);

  // busca e categoria: só a lista é redesenhada (o campo não perde o foco)
  document.addEventListener('input', e => {
    if (e.target.id === 'busca') { estado.filtro.busca = e.target.value; $('#lista-contas').innerHTML = listaContas(); }
  });
  document.addEventListener('change', e => {
    if (e.target.id === 'filtro-cat') { estado.filtro.categoriaId = e.target.value; $('#lista-contas').innerHTML = listaContas(); }
    if (e.target.id === 'perfil') {
      if (recursos().perfis < 2 && e.target.value !== 'tudo') { e.target.value = 'tudo'; abrirPro('perfis'); return; }
      db.config.perfil = e.target.value; gravar(); render();
    }
  });
  document.addEventListener('submit', e => {
    if (e.target.id !== 'form-cat') return;
    e.preventDefault();
    const nome = $('#cat-nome').value.trim(), tipo = $('#cat-tipo').value;
    if (!nome) { $('#cat-nome').focus(); return; }
    if (db.config.categorias.some(c => c.tipo === tipo && N.semAcento(c.nome) === N.semAcento(nome))) { toast('Já existe uma categoria com esse nome.'); return; }
    const { acao } = mudar('Nova categoria', d => { d.config.categorias.push({ id: N.novoId('cat'), nome: nome.slice(0, 60), tipo, icone: 'ponto' }); });
    toast('Categoria criada', { desfazer: acao });
    setTimeout(() => $('#cat-nome') && $('#cat-nome').focus(), 0);
  });
  $('#desfazer').addEventListener('click', () => { hideToast(); desfazer(); });

  // importar backup
  $('#arquivo-backup').addEventListener('change', async e => {
    const arq = e.target.files[0];
    e.target.value = '';
    if (!arq) return;
    let novo;
    try { novo = N.migrar(JSON.parse(await arq.text())); }
    catch (err) { toast(err instanceof SyntaxError ? 'Este arquivo não é um backup válido (JSON).' : err.message, { ms: 5000 }); return; }
    const r = await perguntar({
      titulo: 'Importar backup?', texto: `O arquivo tem <strong>${novo.contas.length} ${novo.contas.length === 1 ? 'conta' : 'contas'}</strong>. Ele substitui tudo o que está neste aparelho agora (${db.contas.length} ${db.contas.length === 1 ? 'conta' : 'contas'}).`,
      botoes: [{ rotulo: 'Substituir pelos dados do backup', valor: 'sim', classe: 'btn-primary' }]
    });
    if (!r) return;
    N.gerarRecorrencias(novo, ref());
    N.gerarMes(novo, N.mesDe(ref()));
    N.gerarDividas(novo, ref());
    const acao = substituirDb('Importar backup', novo);
    toast('Backup importado', { desfazer: acao });
  });

  // saldo inicial
  const dlgSaldo = $('#dlg-saldo'), formSaldo = $('#form-saldo');
  function abrirSaldo() {
    limparErros(formSaldo);
    const si = db.config.saldoInicial, f = v => v ? (v < 0 ? '-' : '') + N.formatBRL(Math.abs(v), { semSimbolo: true }) : '';
    $('#saldo-pessoal').value = f(si.pessoal); $('#saldo-negocio').value = f(si.negocio);
    abrirModal(dlgSaldo);
    setTimeout(() => $('#saldo-pessoal').focus(), 30);
  }
  formSaldo.addEventListener('focusout', e => { if (e.target.matches('input')) formatarCampo(e.target, { negativo: true }); });
  formSaldo.addEventListener('submit', e => {
    e.preventDefault();
    limparErros(formSaldo);
    const p = lerDinheiro($('#saldo-pessoal'), { negativo: true }), n = lerDinheiro($('#saldo-negocio'), { negativo: true });
    if (p == null) erroCampo(formSaldo, 'pessoal', 'Não entendi esse valor. Ex.: 1.250,90');
    if (n == null) erroCampo(formSaldo, 'negocio', 'Não entendi esse valor. Ex.: 1.250,90');
    if (p == null || n == null) return;
    const { acao } = mudar('Saldo inicial', d => { d.config.saldoInicial = { pessoal: p, negocio: n }; d.config.saldoDefinido = true; });
    dlgSaldo.close();
    toast('Saldo inicial salvo', { desfazer: acao });
  });

  // ---------- Warden Pro: vitrine, teste de 7 dias e demonstração ----------
  const MOTIVOS_PRO = {
    lancar: 'Você chegou aos 30 lançamentos deste mês no plano grátis. O que você digitou continua aqui.',
    perfis: 'Separar as contas em Pessoal e Negócio é do Pro.',
    whatsapp: 'Mandar o relatório pelo WhatsApp é do Pro. PDF, imagem e texto continuam liberados.',
    csv: 'A planilha (CSV) é do Pro. O backup continua liberado para todos.',
    dicas: 'No grátis, o Orientador traz 1 dica por dia. No Pro, todas as dicas, sempre que aparecerem.',
    dividas: 'A área Dívidas é do Pro: o total devido, as propostas de desconto, a economia e quanto as parcelas pesam na sua renda.',
    consultas: 'No grátis, a consulta "Essa parcela cabe no meu bolso?" é liberada. No Pro, as quatro: também o plano de saída das dívidas, quitar ou guardar e quanto dá para gastar no mês.'
  };
  const LINHAS_PRO = [
    ['Lançamentos por mês', '30', 'Ilimitados'], ['Pessoal + Negócio', false, true], ['Relatório no WhatsApp', false, true],
    ['Dívidas e propostas de desconto', false, true], ['Orientador', '1 dica por dia', 'Completo'], ['Consultas com os seus números', '1 de 4', 'As 4'], ['Planilha (CSV)', false, true], ['Backup', true, true]
  ];
  const celulaPro = v => v === true ? `${ic('check')}<span class="sr-only">Sim</span>` : v === false ? '<span aria-hidden="true">—</span><span class="sr-only">Não</span>' : esc(v);
  function abrirPro(motivo = 'plano') {
    const p = plano(), dlg = $('#dlg-pro'), teste = p.codigo === 'gratis' && !p.testeUsado;
    // "menos de R$ 0,34 por dia": o preço do mês dividido por 30, arredondado para o centavo de cima
    const porDia = N.formatBRL(Math.floor(N.parseCentavos(PRO.preco) / 30) + 1);
    const agoraNao = `<button type="button" class="ctl-link" data-fechar>${p.codigo === 'pro' ? 'Fechar' : 'Agora não'}</button>`;
    const pe = p.codigo === 'pro' ? `<div class="ctl-pro-links">${agoraNao}</div>`
      : `${teste ? '<button type="button" class="btn btn-primary ctl-pro-cta" data-acao="pro-teste">Testar 7 dias grátis</button>'
          : '<a class="btn btn-primary ctl-pro-cta" href="/assinar.html">Assinar o Pro</a>'}
        ${teste ? `<p class="ctl-pro-copy" data-copy-teste>${esc(window.WARDEN_PRO.COPY_TESTE)}</p>` : ''}
        <div class="ctl-pro-links">${teste ? '<a class="ctl-link" href="/assinar.html">Assinar o Pro</a><span aria-hidden="true">·</span>' : ''}${agoraNao}</div>`;
    dlg.innerHTML = `
      <div class="ctl-dlg-cab"><h2 id="pro-titulo">${PRO.nome}</h2><button type="button" class="ctl-icone-btn" data-fechar aria-label="Fechar">${ic('x')}</button></div>
      <div class="ctl-dlg-miolo ctl-pro">
        ${MOTIVOS_PRO[motivo] ? `<p class="ctl-pro-motivo" data-pro-motivo>${MOTIVOS_PRO[motivo]}</p>` : ''}
        <p class="ctl-pro-preco"><strong class="ctl-num">R$ ${PRO.preco}</strong> por mês <span class="ctl-pro-dia" data-pro-dia>menos de ${porDia} por dia</span>${p.codigo === 'teste' ? `<span class="ctl-pro-dia">Você está no teste até ${N.dataBR(p.testeFim)}.</span>` : ''}</p>
        <table class="ctl-pro-tabela"><thead><tr><th scope="col"><span class="sr-only">Recurso</span></th><th scope="col">Grátis</th><th scope="col">Pro</th></tr></thead>
          <tbody>${LINHAS_PRO.map(([r, g, pr]) => `<tr><th scope="row">${r}</th><td>${celulaPro(g)}</td><td class="pro">${celulaPro(pr)}</td></tr>`).join('')}</tbody></table>
        <p class="ctl-dica">Parcelamento conta como 1 lançamento; contas que se repetem e as do "Meu mês" não contam. Em qualquer plano, seus dados ficam neste aparelho.</p>
      </div>
      <div class="ctl-dlg-pe ctl-pro-pe">${pe}</div>`;
    if (!dlg.open) dlg.showModal();
  }
  /** muda o plano de demonstração (não entra no Desfazer: é estado da conta, não dado) */
  function mudarPlano(fn, msg) {
    db.config.plano = { tipo: 'gratis', testeInicio: null, ...(db.config.plano || {}) };
    fn(db.config.plano);
    gravar(); render();
    if ($('#dlg-pro').open) $('#dlg-pro').close();
    if (msg) toast(msg, { ms: 5000 });
  }
  function avisarFimTeste() {
    const p = plano(), inicio = db.config.plano && db.config.plano.testeInicio;
    if (p.codigo !== 'gratis' || !p.testeUsado || db.config.avisoFimTeste === inicio) return;
    db.config.avisoFimTeste = inicio; gravar();
    toast('Seu teste do Pro terminou. Seus dados continuam todos aqui, no plano grátis.', { ms: 6000 });
  }

  // ---------- relatório: enviar / baixar ----------
  /**
   * Envia ou baixa o relatório do mês que está na tela. canal: 'whatsapp' | 'compartilhar' | 'pdf' | 'imagem' | 'texto'.
   * 'whatsapp' e 'compartilhar': com Web Share de arquivos (celular), vai a imagem + o texto pela folha de compartilhar;
   * sem ela, abre o wa.me com o texto pronto (sem número: a pessoa escolhe o contato). Devolve o que de fato aconteceu.
   * TODO (Etapa 2 do projeto): envio automático pelo servidor — o relatório chega sozinho no WhatsApp da pessoa todo mês
   * (precisa de login, número confirmado e da API oficial do WhatsApp). Hoje tudo sai deste aparelho, pela própria pessoa.
   */
  async function enviarRelatorio(canal) {
    const R = window.ControlRelatorio, r = ref();
    const d = N.dadosRelatorio(db, perfil(), estado.mesRel || N.mesDe(r), r), texto = N.textoRelatorio(d);
    if ((canal === 'whatsapp' || canal === 'compartilhar') && !recursos().whatsapp) { abrirPro('whatsapp'); return 'bloqueado'; }
    try {
      if (canal === 'texto') {
        const ok = await (await R.carregarKit()).copiarTexto(texto);
        toast(ok ? 'Texto do relatório copiado. É só colar na conversa.' : 'Não consegui copiar aqui. Use o botão do WhatsApp.');
        return ok ? 'texto' : 'erro';
      }
      if (canal === 'pdf') { (await R.pdf(d)).save(R.nomeArquivo(d, 'pdf')); toast('PDF do relatório baixado.'); return 'pdf'; }
      if (canal === 'imagem') { baixarArquivo(R.nomeArquivo(d, 'png'), await R.imagem(d), 'image/png'); toast('Imagem do relatório baixada.'); return 'imagem'; }
      if (navigator.share && navigator.canShare) {
        const arquivo = new File([await R.imagem(d)], R.nomeArquivo(d, 'png'), { type: 'image/png' });
        if (navigator.canShare({ files: [arquivo] })) {
          try { await navigator.share({ files: [arquivo], title: `Relatório de ${N.nomeMes(d.ym)}`, text: texto }); return 'compartilhar'; }
          catch (e) { if (e && e.name === 'AbortError') return 'cancelado'; }   // outro erro: cai no wa.me
        }
      }
      window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank', 'noopener');
      return 'whatsapp';
    } catch (err) {
      toast(err.message || 'Não deu certo agora. Tente de novo.', { ms: 5000 });
      return 'erro';
    }
  }

  // ---------- "Meu mês": contas fixas ----------
  const dlgModelo = $('#dlg-modelo'), formModelo = $('#form-modelo');
  let editandoModeloId = null;
  const valModelo = nome => (formModelo.querySelector(`input[name="${nome}"]:checked`) || {}).value;
  function categoriasModelo(tipo, selecionada) {
    const cats = db.config.categorias.filter(c => c.tipo === tipo), sel = $('#modelo-cat');
    sel.innerHTML = '<option value="">Sem categoria</option>' + cats.map(c => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join('');
    sel.value = cats.some(c => c.id === selecionada) ? selecionada : '';
  }
  function abrirModelo(id = null) {
    const m = id ? db.modelos.find(x => x.id === id) : null;
    editandoModeloId = m ? m.id : null;
    formModelo.reset(); limparErros(formModelo);
    const tipo = m ? m.tipo : 'pagar';
    formModelo.querySelector(`input[name="modelo-tipo"][value="${tipo}"]`).checked = true;
    const umPerfil = recursos().perfis < 2;
    const pf = m ? m.perfil : umPerfil ? 'pessoal' : (perfil() === 'tudo' ? (db.config.ultimoPerfil || 'pessoal') : perfil());
    formModelo.querySelector(`input[name="modelo-perfil"][value="${pf}"]`).checked = true;
    $('#modelo-perfil-bloco').hidden = umPerfil;
    categoriasModelo(tipo, m ? m.categoriaId : '');
    $('#modelo-titulo').textContent = m ? 'Editar conta fixa' : 'Nova conta fixa';
    $('#modelo-salvar').textContent = m ? 'Salvar alterações' : 'Salvar';
    $('#modelo-desc').value = m ? m.descricao : '';
    $('#modelo-valor').value = m ? N.formatBRL(m.valor, { semSimbolo: true }) : '';
    $('#modelo-dia').value = m ? m.dia : Number(ref().slice(8));
    $('#modelo-variavel').checked = m ? m.variavel : false;
    $('#modelo-aviso').hidden = !m;
    abrirModal(dlgModelo);
    setTimeout(() => $('#modelo-desc').focus(), 30);
  }
  formModelo.addEventListener('change', e => { if (e.target.name === 'modelo-tipo') categoriasModelo(e.target.value, $('#modelo-cat').value); });
  $('#modelo-valor').addEventListener('blur', e => formatarCampo(e.target));
  formModelo.addEventListener('submit', e => {
    e.preventDefault();
    limparErros(formModelo);
    const valor = lerDinheiro($('#modelo-valor'));
    const dados = {
      tipo: valModelo('modelo-tipo'), descricao: $('#modelo-desc').value, valor: valor == null ? NaN : valor, dia: Number($('#modelo-dia').value),
      categoriaId: $('#modelo-cat').value, perfil: valModelo('modelo-perfil'), variavel: $('#modelo-variavel').checked
    };
    const erros = N.validarModelo(dados);
    if (valor == null) erros.unshift({ campo: 'valor', msg: 'Não entendi esse valor. Use só números, como 1.250,90.' });
    if (erros.length) {
      erros.forEach(er => erroCampo(formModelo, er.campo, er.msg));
      const primeiro = $(`[data-campo="${erros[0].campo}"] input`, formModelo);
      if (primeiro) primeiro.focus();
      return;
    }
    if (editandoModeloId) {
      const { acao } = mudar('Editar conta fixa', d => N.editarModelo(d, editandoModeloId, dados));
      dlgModelo.close();
      toast('Conta fixa alterada. Vale a partir do próximo mês.', { desfazer: acao });
    } else {
      const { acao } = mudar('Nova conta fixa', d => { d.config.ultimoPerfil = dados.perfil; N.criarModelo(d, dados); N.gerarMes(d, N.mesDe(ref())); });
      dlgModelo.close();
      toast('Conta fixa cadastrada. Já está na lista deste mês.', { desfazer: acao });
    }
  });
  async function excluirModelo(id) {
    const m = db.modelos.find(x => x.id === id);
    if (!m) return;
    const r = await perguntar({ titulo: 'Excluir conta fixa?', texto: `<strong>${esc(m.descricao)}</strong> deixa de aparecer nos próximos meses. As contas já lançadas continuam em Contas.`, botoes: [{ rotulo: 'Excluir', valor: 'sim', classe: 'btn-perigo' }] });
    if (!r) return;
    const { acao } = mudar('Excluir conta fixa', d => N.excluirModelo(d, id));
    toast('Conta fixa excluída', { desfazer: acao });
  }
  /** toque no item do "Meu mês": valor variável em aberto pergunta o valor deste mês; o resto abre o detalhe */
  async function abrirItemMes(id) {
    const c = N.acharConta(db, id), m = c && db.modelos.find(x => x.id === c.modeloId);
    if (!c || !m || !m.variavel || N.quitada(c)) { abrirDetalhe(id); return; }
    const mes = N.MESES[Number(c.vencimento.slice(5, 7)) - 1];
    const r = await perguntar({
      titulo: `${c.descricao} de ${mes}`,
      texto: `Sugerimos <strong>${brl(c.valor)}</strong>, o valor do mês anterior. Se a conta deste mês veio diferente, ajuste aqui: muda só ${mes}.`,
      campo: { rotulo: 'Valor deste mês', valor: N.formatBRL(c.valor, { semSimbolo: true }), dinheiro: true },
      botoes: [{ rotulo: 'Salvar valor', valor: 'ok', classe: 'btn-primary' }, { rotulo: 'Ver detalhes da conta', valor: 'detalhe' }]
    });
    if (!r) return;
    if (r.valor === 'detalhe') { abrirDetalhe(id); return; }
    const v = N.parseCentavos(r.texto);
    if (v == null || v <= 0) { toast('Não entendi esse valor. Use só números, como 1.250,90.'); return; }
    if (v === c.valor) return;
    try {
      const { acao } = mudar('Ajustar valor', d => N.ajustarValor(d, id, v));
      toast(`${c.descricao} de ${mes}: ${brl(v)}`, { desfazer: acao });
    } catch (err) { toast(err.message, { ms: 5000 }); }
  }

  // ---------- Dívidas: cadastro, proposta, quitar, excluir, renda ----------
  const dlgDiv = $('#dlg-divida'), formDiv = $('#form-divida');
  let editandoDividaId = null;
  function preencherDivida(x) {
    $('#divida-credor').value = x.credor || '';
    $('#divida-total').value = x.total ? N.formatBRL(x.total, { semSimbolo: true }) : '';
    $('#divida-parcela').value = x.parcela ? N.formatBRL(x.parcela, { semSimbolo: true }) : '';
    $('#divida-semprazo').checked = !!x.parcela && x.parcelas == null;
    $('#divida-parcelas').value = x.parcelas != null ? x.parcelas : '';
    $('#divida-dia').value = x.dia || Number(ref().slice(8));
    $('#divida-taxa').value = x.taxa != null ? N.formatTaxa(x.taxa) : '';
    $('#divida-obs').value = x.obs || '';
    formDiv.querySelector(`input[name="divida-perfil"][value="${x.perfil || 'pessoal'}"]`).checked = true;
  }
  function abrirDivida({ id = null, foco = null } = {}) {
    if (!recursos().dividas) { abrirPro('dividas'); return; }
    const d = id ? db.dividas.find(x => x.id === id) : null, info = d ? N.infoDivida(db, d, ref()) : null;
    editandoDividaId = d ? d.id : null;
    formDiv.reset(); limparErros(formDiv);
    $('#divida-titulo').textContent = d ? 'Editar dívida' : 'Nova dívida';
    $('#divida-salvar').textContent = d ? 'Salvar alterações' : 'Salvar';
    const umPerfil = recursos().perfis < 2;
    $('#divida-perfil-bloco').hidden = umPerfil;
    const daConta = d ? [] : N.contasParaDivida(db, perfil());
    $('#divida-origem-bloco').hidden = !daConta.length;
    $('#divida-origem').innerHTML = '<option value="">Não, é uma dívida nova</option>' + daConta.map(c =>
      `<option value="${esc(c.id)}">${esc(c.nome)} · ${esc(brl(c.total))}${c.parcelas > 1 ? ` em ${c.parcelas} parcelas` : ''}</option>`).join('');
    const pf = umPerfil ? 'pessoal' : (perfil() === 'tudo' ? (db.config.ultimoPerfil || 'pessoal') : perfil());
    preencherDivida(d ? { ...d, total: info.devido, parcelas: info.faltam } : { perfil: pf });
    $('#divida-vista').value = d && d.proposta ? N.formatBRL(d.proposta.valor, { semSimbolo: true }) : '';
    $('#divida-validade').value = d && d.proposta && d.proposta.validade ? d.proposta.validade : '';
    $('#divida-aviso').hidden = !d;
    atualizarFormDivida();
    abrirModal(dlgDiv);
    setTimeout(() => { const el = foco === 'proposta' ? $('#divida-vista') : $('#divida-credor'); el.focus(); if (foco === 'proposta') el.scrollIntoView({ block: 'center' }); }, 30);
  }
  function atualizarFormDivida() {
    const total = lerDinheiro($('#divida-total')), parcela = lerDinheiro($('#divida-parcela')), temParcela = $('#divida-parcela').value.trim() !== '';
    revelar($('#divida-prazo-bloco'), temParcela);
    $('#divida-parcelas').disabled = $('#divida-semprazo').checked;
    const dica = $('#divida-dica');
    if (temParcela && total > 0 && parcela > 0 && !$('#divida-semprazo').checked && !$('#divida-parcelas').value) {
      dica.innerHTML = `${brl(total)} ÷ ${brl(parcela)}: <strong>${Math.ceil(total / parcela)} parcelas</strong>. Confira no contrato ou no boleto quantas faltam.`;
      dica.hidden = false;
    } else dica.hidden = true;
    const vista = lerDinheiro($('#divida-vista')), eco = $('#divida-eco');
    if ($('#divida-vista').value.trim() && total > 0 && vista > 0) {
      const ok = vista < total;
      eco.classList.toggle('erro', !ok);
      eco.innerHTML = ok ? `Economia de <strong>${brl(total - vista)}</strong> (${pct(Math.round((total - vista) * 1000 / total) / 10)}) sobre o total devido.` : 'A proposta não é menor que o total devido.';
      revelar(eco, true);
    } else eco.hidden = true;
  }
  formDiv.addEventListener('input', atualizarFormDivida);
  formDiv.addEventListener('change', e => {
    if (e.target.id === 'divida-origem' && e.target.value) {
      const dd = N.dadosDeConta(db, e.target.value);
      if (dd) { preencherDivida(dd); $('#divida-validade').value = ''; $('#divida-vista').value = ''; }
    }
    atualizarFormDivida();
  });
  formDiv.addEventListener('focusout', e => { if (['divida-total', 'divida-parcela', 'divida-vista'].includes(e.target.id)) formatarCampo(e.target); });
  formDiv.addEventListener('submit', e => {
    e.preventDefault();
    limparErros(formDiv);
    const total = lerDinheiro($('#divida-total')), temParcela = $('#divida-parcela').value.trim() !== '', temVista = $('#divida-vista').value.trim() !== '';
    const parcela = temParcela ? lerDinheiro($('#divida-parcela')) : null, vista = temVista ? lerDinheiro($('#divida-vista')) : null;
    const validade = $('#divida-validade').value;
    const dados = {
      credor: $('#divida-credor').value, total: total == null || !$('#divida-total').value.trim() ? NaN : total,
      parcela: temParcela ? (parcela == null ? NaN : parcela) : null,
      parcelas: $('#divida-semprazo').checked ? null : Number($('#divida-parcelas').value), dia: Number($('#divida-dia').value),
      taxa: $('#divida-taxa').value.trim() ? (N.parseTaxa($('#divida-taxa').value) ?? NaN) : null,
      perfil: (formDiv.querySelector('input[name="divida-perfil"]:checked') || {}).value, obs: $('#divida-obs').value,
      proposta: temVista || validade ? { valor: vista == null ? NaN : vista, validade: validade || null } : null,
      origem: editandoDividaId ? null : $('#divida-origem').value || null
    };
    const erros = N.validarDivida(dados);
    if (erros.length) {
      erros.forEach(er => erroCampo(formDiv, er.campo, er.msg));
      const primeiro = $(`[data-campo="${erros[0].campo}"] input`, formDiv);
      if (primeiro) primeiro.focus();
      return;
    }
    try {
      if (editandoDividaId) {
        const { acao } = mudar('Editar dívida', d => N.editarDivida(d, editandoDividaId, dados, ref()));
        dlgDiv.close();
        toast('Dívida atualizada', { desfazer: acao });
      } else {
        const { valor: d, acao } = mudar('Nova dívida', db2 => { db2.config.ultimoPerfil = dados.perfil; return N.criarDivida(db2, dados, ref()); });
        dlgDiv.close();
        toast(d.parcela ? 'Dívida anotada. As parcelas já estão no fluxo de caixa.' : 'Dívida anotada', { desfazer: acao });
      }
    } catch (err) {
      (err.erros || [{ campo: 'total', msg: err.message }]).forEach(er => erroCampo(formDiv, er.campo, er.msg));
    }
  });
  async function quitarDivida(id) {
    const d = db.dividas.find(x => x.id === id);
    if (!d) return;
    const x = N.infoDivida(db, d, ref());
    const r = await perguntar({
      titulo: `Quitar ${d.credor}`,
      texto: `Anote quanto você pagou para quitar tudo${x.vista < x.devido ? ` (a proposta é de <strong>${brl(x.vista)}</strong>)` : ''}. As parcelas em aberto saem do fluxo e o pagamento entra como pago hoje.`,
      campo: { rotulo: 'Valor pago', valor: N.formatBRL(x.vista, { semSimbolo: true }), dinheiro: true },
      botoes: [{ rotulo: 'Quitei', valor: 'ok', classe: 'btn-primary' }]
    });
    if (!r) return;
    const v = N.parseCentavos(r.texto);
    if (v == null || v <= 0) { toast('Não entendi esse valor. Use só números, como 1.250,90.'); return; }
    const { acao } = mudar('Quitar dívida', db2 => N.quitarDivida(db2, id, { valor: v, data: ref() }));
    toast(`${d.credor}: quitada`, { desfazer: acao });
  }
  async function excluirDivida(id) {
    const d = db.dividas.find(x => x.id === id);
    if (!d) return;
    const r = await perguntar({ titulo: 'Excluir dívida?', texto: `<strong>${esc(d.credor)}</strong> sai de Dívidas, e as parcelas que ainda não foram pagas saem do fluxo. As já pagas continuam em Contas.`, botoes: [{ rotulo: 'Excluir', valor: 'sim', classe: 'btn-perigo' }] });
    if (!r) return;
    const { acao } = mudar('Excluir dívida', db2 => N.excluirDivida(db2, id));
    toast('Dívida excluída', { desfazer: acao });
  }
  async function informarRenda() {
    const atual = db.config.rendaMensal;
    const r = await perguntar({
      titulo: 'Renda mensal',
      texto: 'Quanto entra por mês, somando salário, vendas e outras entradas. É a base para ver o peso das parcelas e quanto sobra.',
      campo: { rotulo: 'Renda por mês', valor: atual ? N.formatBRL(atual, { semSimbolo: true }) : '', dinheiro: true },
      botoes: [{ rotulo: 'Salvar renda', valor: 'ok', classe: 'btn-primary' }]
    });
    if (!r) return;
    const v = r.texto.trim() ? N.parseCentavos(r.texto) : null;
    if (r.texto.trim() && (v == null || v <= 0)) { toast('Não entendi esse valor. Use só números, como 2.500,00.'); return; }
    const { acao } = mudar('Renda mensal', db2 => { db2.config.rendaMensal = v; });
    toast(v ? `Renda mensal: ${brl(v)}` : 'Renda mensal apagada', { desfazer: acao });
  }

  // ---------- Orientador (painel lateral no desktop, gaveta no celular) ----------
  const O = window.ControlOrientador;
  const painelOri = $('#orientador'), fundoOri = $('#ori-fundo'), btnOri = $('#btn-orientador');
  const desktop = matchMedia('(min-width: 900px)');
  let acoesOri = new Map();
  const ctxOri = () => O.contexto(db, perfil(), ref());
  /**
   * dicas que a pessoa vê hoje. No grátis, 1 por dia: a primeira que aparece no dia fica guardada em config.dicaDoDia
   * e é a única do dia (se ela se resolver, as outras não entram no lugar). { lista, ocultas }
   */
  function dicasDeHoje(ctx) {
    const todas = O.dicas(ctx), max = recursos().dicasDia;
    if (max === Infinity) return { lista: todas, ocultas: 0 };
    let reg = db.config.dicaDoDia;
    if ((!reg || reg.data !== ctx.ref) && todas.length) { reg = { data: ctx.ref, id: todas[0].id }; db.config.dicaDoDia = reg; gravar(); }
    const lista = reg && reg.data === ctx.ref ? todas.filter(d => d.id === reg.id).slice(0, max) : [];
    return { lista, ocultas: todas.length - lista.length, resolvida: !!reg && reg.data === ctx.ref && !lista.length };
  }

  /** quem executa as ações das dicas e das respostas */
  const apiOri = {
    filtrar: f => {
      estado.filtro = { tipo: 'todas', status: 'aberto', busca: '', categoriaId: '', ...(typeof f === 'string' ? { status: f } : f) };
      fecharOriCelular(); irPara('contas');
    },
    irPara: tela => { fecharOriCelular(); irPara(tela); },
    abrirDetalhe: id => { fecharOriCelular(); abrirDetalhe(id); },
    novo: () => { fecharOriCelular(); abrirLancamento(); },
    abrirLink: url => { location.href = url; }
  };

  function desenharOrientador() {
    const ctx = ctxOri(), { lista, ocultas, resolvida } = dicasDeHoje(ctx);
    // selo no botão: quantas dicas há hoje, até a pessoa abrir o painel
    const selo = $('#ori-selo');
    selo.hidden = estado.orientador || db.config.orientadorVisto === ref() || !lista.length;
    selo.textContent = lista.length;
    btnOri.setAttribute('aria-label', `Orientador${selo.hidden ? '' : `: ${lista.length} ${lista.length === 1 ? 'dica nova' : 'dicas novas'}`}`);
    btnOri.setAttribute('aria-expanded', String(estado.orientador));
    document.body.toggleAttribute('data-orientador', estado.orientador);
    painelOri.hidden = !estado.orientador;
    fundoOri.hidden = !estado.orientador || desktop.matches;
    if (!estado.orientador) return;

    const rascunho = ($('#ori-pergunta') || {}).value || '';
    acoesOri = new Map();
    const botaoAcao = (chave, acao) => { acoesOri.set(chave, acao.executar); return `<button type="button" class="btn btn-secondary" data-ori="acao" data-k="${esc(chave)}">${esc(acao.rotulo)}</button>`; };
    const icTom = { alerta: 'alerta', aviso: 'relogio', info: 'lampada' };
    const t = semQuebra;
    painelOri.innerHTML = `
      <div class="ctl-ori-cab"><h2 id="ori-titulo" tabindex="-1">${ic('lampada')} Orientador</h2>
        <button type="button" class="ctl-icone-btn" data-ori="fechar" aria-label="Fechar o Orientador">${ic('x')}</button></div>
      <div class="ctl-ori-miolo" id="ori-miolo">
        <p class="ctl-ori-ola" data-ori-ola>${t(O.boasVindas(ctx))}</p>
        <h3 class="ctl-rotulo">Dicas de hoje</h3>
        ${lista.length ? `<ul class="ctl-ori-dicas">${lista.map(d => `<li class="ctl-ori-dica ${d.tom}" data-dica="${esc(d.id)}">
            <span class="ic">${ic(icTom[d.tom])}</span>
            <div><p>${t(d.texto)}</p>${botaoAcao('dica-' + d.id, d.acao)}</div></li>`).join('')}</ul>`
          : `<p class="ctl-ori-vazio">${ic('ok')} ${resolvida ? 'A dica de hoje já foi resolvida. Amanhã tem outra.' : 'Nenhum alerta por aqui. Bom sinal!'}</p>`}
        ${ocultas ? `<p class="ctl-ori-mais">${ocultas === 1 ? 'Tem mais 1 dica' : `Tem mais ${ocultas} dicas`} para hoje no Pro.
          <button type="button" class="ctl-link" data-ori="pro">Conhecer o Pro</button></p>` : ''}
        <h3 class="ctl-rotulo">Consultas com os seus números</h3>
        ${listaConsultas()}
        <h3 class="ctl-rotulo">Pergunte</h3>
        <div class="ctl-ori-atalhos">${O.ATALHOS.map(a => `<button type="button" class="ctl-chip" data-ori="perguntar" data-id="${a.id}">${esc(a.pergunta)}</button>`).join('')}</div>
        <div class="ctl-ori-chat" aria-live="polite">${estado.chat.map((m, i) => `<div class="ctl-ori-msg ${m.quem}">
            <p>${t(m.texto)}</p>${m.linhas && m.linhas.length ? `<ul>${m.linhas.map(l => `<li>${t(l)}</li>`).join('')}</ul>` : ''}
            ${m.acao ? botaoAcao('chat-' + i, m.acao) : ''}</div>`).join('')}</div>
        <form class="ctl-ori-form" id="ori-form" novalidate>
          <label class="sr-only" for="ori-pergunta">Sua pergunta</label>
          <input id="ori-pergunta" type="text" maxlength="200" autocomplete="off" placeholder="Pergunte sobre suas contas…" data-foco="ori-pergunta" value="${esc(rascunho)}">
          <button type="submit" class="ctl-icone-btn" aria-label="Perguntar">${ic('enviar')}</button>
        </form>
        <p class="ctl-ori-pe">Dicas feitas aqui no aparelho, a partir dos seus lançamentos. Sem inteligência artificial e sem enviar seus dados.</p>
      </div>`;
  }

  function abrirOrientador() {
    estado.orientador = true;
    db.config.orientadorVisto = ref();
    if (desktop.matches) db.config.orientadorAberto = true;
    gravar();
    desenharOrientador();
    if (!desktop.matches) { document.body.setAttribute('data-ori-gaveta', ''); $('#ori-titulo').focus(); }
  }
  function fecharOrientador({ devolverFoco = true } = {}) {
    estado.orientador = false;
    if (desktop.matches) { db.config.orientadorAberto = false; gravar(); }
    document.body.removeAttribute('data-ori-gaveta');
    desenharOrientador();
    if (devolverFoco) btnOri.focus();
  }
  function fecharOriCelular() { if (estado.orientador && !desktop.matches) fecharOrientador({ devolverFoco: false }); }

  async function perguntarOri(texto, id) {
    const ctx = ctxOri();
    estado.chat.push({ quem: 'voce', texto });
    let r = id ? O.responder(id, ctx) : null;
    if (!r && !id) {
      const ia = await O.responderComIA(texto, ctx);
      r = ia || { texto: 'Ainda não sei responder isso. Por enquanto entendo: como estou este mês, o que vence esta semana e onde mais gastei.', linhas: [], acao: null };
    }
    estado.chat.push({ quem: 'ori', ...r });
    if (estado.chat.length > 20) estado.chat.splice(0, estado.chat.length - 20);
    desenharOrientador();
    const miolo = $('#ori-miolo');
    if (miolo) { const ult = $$('.ctl-ori-msg', miolo).pop(); if (ult) ult.scrollIntoView({ block: 'nearest' }); }
  }

  btnOri.addEventListener('click', () => (estado.orientador ? fecharOrientador() : abrirOrientador()));
  fundoOri.addEventListener('click', () => fecharOrientador());
  painelOri.addEventListener('click', e => {
    const el = e.target.closest('[data-ori]');
    if (!el) return;
    const tipo = el.dataset.ori;
    if (tipo === 'fechar') fecharOrientador();
    else if (tipo === 'acao') { const fn = acoesOri.get(el.dataset.k); if (fn) fn(apiOri); }
    else if (tipo === 'perguntar') perguntarOri(el.textContent, el.dataset.id);
    else if (tipo === 'pro') abrirPro('dicas');
    else if (tipo === 'consulta') { fecharOriCelular(); abrirConsulta(el.dataset.id); }
    else if (tipo === 'consulta-pro') { fecharOriCelular(); abrirPro('consultas'); }
  });
  painelOri.addEventListener('submit', e => {
    if (e.target.id !== 'ori-form') return;
    e.preventDefault();
    const campo = $('#ori-pergunta'), texto = campo.value.trim();
    if (!texto) { campo.focus(); return; }
    campo.value = '';
    perguntarOri(texto, O.interpretar(texto));
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && estado.orientador && !desktop.matches && !document.querySelector('dialog[open]')) fecharOrientador(); });
  desktop.addEventListener('change', () => {
    estado.orientador = desktop.matches && db.config.orientadorAberto !== false;
    document.body.removeAttribute('data-ori-gaveta');
    desenharOrientador();
  });
  estado.orientador = desktop.matches && db.config.orientadorAberto !== false;
  if (estado.orientador) db.config.orientadorVisto = ref();

  // ---------- Consultas do Orientador (números no consultas.js; aqui só a janela) ----------
  const CQ = window.ControlConsultas, dlgCons = $('#dlg-consulta');
  const consulta = { id: null, cdi: null };
  const CLASSE_SITUACAO = { folga: 'paga', limite: 'hoje', vermelho: 'atrasada' };
  function camposConsulta(id) {
    const valor = rot => `<div class="ctl-campo"><label for="cons-valor">${rot}</label><div class="ctl-dinheiro"><span>R$</span><input id="cons-valor" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00"></div></div>`;
    if (id === 'parcela') return `<form class="ctl-form" id="form-consulta" novalidate><div class="duas">${valor('Valor da parcela')}
      <div class="ctl-campo"><label for="cons-parcelas">Número de parcelas</label><input id="cons-parcelas" type="number" inputmode="numeric" min="1" max="120" value="10"></div></div>
      <button type="submit" class="btn btn-primary">Analisar com os meus números</button></form>`;
    if (id === 'gasto') return `<form class="ctl-form" id="form-consulta" novalidate>${valor('Quanto quer gastar')}<button type="submit" class="btn btn-primary">Analisar com os meus números</button></form>`;
    if (id === 'quitar') return `<form class="ctl-form" id="form-consulta" novalidate><div class="ctl-campo" id="cons-divida-campo" hidden><label for="cons-divida">Qual dívida</label><select id="cons-divida"></select></div></form>`;
    return '';
  }
  function destaquesConsulta(r) {
    const n = r.numeros;
    if (!r.suficiente || !n) return [];
    const meses = m => (m == null ? 'não termina' : `${m} ${m === 1 ? 'mês' : 'meses'}`);
    // uma função por consulta: só a da consulta aberta é calculada (os números de cada uma são diferentes)
    return {
      parcela: () => [['Da sobra do mês', n.pctSobra != null ? `${n.pctSobra}%` : '—'], ['Menor saldo', brl(n.menorSaldo)], ['Saldo em 90 dias', brl(n.saldos[2].com)]],
      dividas: () => (n.modo === 'cadastradas'
        ? [['Pagando normal', n.normal.meses != null ? meses(n.normal.meses) : 'não termina'], ['Custo total', n.normal.custo != null ? brl(n.normal.custo) : '—'], ['Maior economia à vista', n.melhor ? brl(n.melhor.economia) : '—']]
        : [['Total das dívidas', brl(n.total)], ['Juros mais altos primeiro', n.caminhos ? meses(n.caminhos.custo.meses) : '—'], ['Menores primeiro', n.caminhos ? meses(n.caminhos.menores.meses) : '—']]),
      quitar: () => [['Juros da dívida no mês', brl(n.custoMes)], ['Guardado renderia', brl(n.rendeMes)], ['Folga em 90 dias', brl(n.folga)]],
      gasto: () => [['Fim do mês com o gasto', brl(n.fimCom)], ['Menor saldo do mês', brl(n.menorCom)], ['Ainda vence no mês', brl(n.aPagar)]]
    }[r.id]();
  }
  function mostrarConsulta(r) {
    const alvo = $('#consulta-res');
    if (!alvo) return;
    if (r.erro) { alvo.innerHTML = `<p class="ctl-consulta-erro" role="alert">${esc(r.erro)}</p>`; return; }
    const d = destaquesConsulta(r);
    alvo.innerHTML = `<div class="ctl-consulta-res" data-situacao="${r.suficiente ? r.situacao : 'sem-dados'}">
      ${r.suficiente ? `<span class="ctl-pill ${CLASSE_SITUACAO[r.situacao]}" data-consulta-situacao>${esc(r.rotuloSituacao)}</span>` : ''}
      ${d.length ? `<div class="ctl-consulta-numeros">${d.map(([k, v]) => `<div><span class="ctl-rotulo">${k}</span><strong class="ctl-num">${semQuebra(v)}</strong></div>`).join('')}</div>` : ''}
      <div class="ctl-consulta-texto">${r.paragrafos.map(p => `<p>${semQuebra(p)}</p>`).join('')}</div>
      ${r.risco ? `<p class="ctl-consulta-risco">${semQuebra(r.risco)}</p>` : ''}
      ${r.decisao ? `<p class="ctl-consulta-decisao" data-consulta-decisao>${esc(r.decisao)}</p>` : ''}
      ${r.links.length ? `<div class="ctl-acoes">${r.links.map(l => `<a class="btn btn-secondary" href="${esc(l.href)}">${esc(l.rotulo)}</a>`).join('')}</div>` : ''}
      <p class="ctl-consulta-aviso" data-consulta-aviso>${esc(r.aviso)}</p>
    </div>`;
    // na comparação com a dívida, a pessoa escolhe qual dívida
    const sel = $('#cons-divida');
    if (sel && r.opcoes) {
      $('#cons-divida-campo').hidden = r.opcoes.length < 2;
      sel.innerHTML = r.opcoes.map(o => `<option value="${esc(o.id)}">${esc(o.nome)} · ${esc(brl(o.total))}${o.taxa != null ? ` · ${N.formatTaxa(o.taxa)}% a.m.` : ''}</option>`).join('');
      sel.value = r.escolhida || '';
    }
  }
  function entradaConsulta(id) {
    if (id === 'parcela') return { valor: lerDinheiro($('#cons-valor')), parcelas: Number($('#cons-parcelas').value) };
    if (id === 'gasto') return { valor: lerDinheiro($('#cons-valor')) };
    if (id === 'quitar') return { divida: ($('#cons-divida') || {}).value || null, cdiAnual: consulta.cdi };
    return {};
  }
  function analisarConsulta() {
    if (!consulta.id) return;
    mostrarConsulta(CQ.consultar(consulta.id, db, perfil(), ref(), entradaConsulta(consulta.id)));
  }
  /** CDI de hoje, das mesmas taxas do Banco Central que o site usa (o kit das ferramentas vem sob demanda) */
  async function cdiDeHoje() {
    if (consulta.cdi) return;
    try { const W = await window.ControlRelatorio.carregarKit(); consulta.cdi = (await W.getTaxasBCB()).cdi; } catch (e) { consulta.cdi = null; }
  }
  /** consultas no painel: liberadas como atalho; as do Pro, no grátis, em vitrine com o que respondem */
  function listaConsultas() {
    const pro = recursos().consultasPro;
    const livres = window.ControlConsultas.CONSULTAS.filter(q => pro || q.plano !== 'pro');
    const vitrine = window.ControlConsultas.CONSULTAS.filter(q => !pro && q.plano === 'pro');
    return `<div class="ctl-ori-atalhos ctl-ori-consultas">${livres.map(q => `<button type="button" class="ctl-chip" data-ori="consulta" data-id="${q.id}">${esc(q.pergunta)}</button>`).join('')}</div>
      ${vitrine.length ? `<ul class="ctl-ori-vitrine" aria-label="Consultas do Warden Pro">${vitrine.map(q => `<li data-vitrine="${q.id}">
          <div><strong>${esc(q.pergunta)}</strong><p>${esc(q.resumo)}</p></div>
          <button type="button" class="ctl-link" data-ori="consulta-pro" data-id="${q.id}" aria-label="Ver no Pro: ${esc(q.pergunta)}">Ver no Pro</button></li>`).join('')}</ul>` : ''}`;
  }
  async function abrirConsulta(id) {
    const q = CQ.CONSULTAS.find(x => x.id === id);
    if (!q) return;
    if (q.plano === 'pro' && !recursos().consultasPro) { abrirPro('consultas'); return; }
    consulta.id = id;
    dlgCons.innerHTML = `<div class="ctl-dlg-cab"><h2 id="consulta-titulo">${esc(q.pergunta)}</h2><button type="button" class="ctl-icone-btn" data-fechar aria-label="Fechar">${ic('x')}</button></div>
      <div class="ctl-dlg-miolo ctl-consulta">${camposConsulta(id)}<div id="consulta-res" aria-live="polite"></div></div>`;
    if (!dlgCons.open) dlgCons.showModal();
    if (id === 'parcela' || id === 'gasto') { setTimeout(() => $('#cons-valor') && $('#cons-valor').focus(), 30); return; }
    if (id === 'quitar') { $('#consulta-res').innerHTML = '<p class="ctl-dica">Buscando a taxa do CDI de hoje…</p>'; await cdiDeHoje(); }
    analisarConsulta();
  }
  dlgCons.addEventListener('submit', e => { if (e.target.id !== 'form-consulta') return; e.preventDefault(); analisarConsulta(); });
  dlgCons.addEventListener('change', e => { if (e.target.id === 'cons-divida') analisarConsulta(); });
  dlgCons.addEventListener('focusout', e => { if (e.target.id === 'cons-valor') formatarCampo(e.target); });
  dlgCons.addEventListener('close', () => { consulta.id = null; });

  // ---------- mini calculadora da barra lateral (só desktop; contas no calculadora.js) ----------
  const calc = window.ControlCalculadora.criar(), visorCalc = $('#calc-visor-box');
  function desenharCalc() {
    const e = calc.estado();
    $('#calc-visor').textContent = e.visor;
    $('#calc-expr').textContent = e.expressao;
    $('#calc-msg').textContent = e.erro;
  }
  function calcAberta(aberta) {
    $('#calc-corpo').hidden = !aberta;
    $('#calc-alternar').setAttribute('aria-expanded', String(aberta));
  }
  $('#calc-alternar').addEventListener('click', () => {
    const aberta = $('#calc-corpo').hidden;
    calcAberta(aberta);
    db.config.calcRecolhida = !aberta; gravar();   // lembra a escolha (não entra no Desfazer)
  });
  $('#calc-teclas').addEventListener('click', e => {
    const b = e.target.closest('[data-calc]');
    if (!b) return;
    calc.tecla(b.dataset.calc); desenharCalc();
    if (e.detail > 0) visorCalc.focus({ preventScroll: true });   // clique com o mouse: o teclado continua valendo
  });
  visorCalc.addEventListener('keydown', e => {
    const k = window.ControlCalculadora.teclaDoTeclado(e);
    if (!k) return;
    e.preventDefault(); e.stopPropagation();
    calc.tecla(k); desenharCalc();
  });
  $('#calc-usar').addEventListener('click', () => {
    const c = calc.centavos();
    if (c == null || c <= 0) { $('#calc-msg').textContent = 'O valor precisa ser maior que zero.'; return; }
    abrirLancamento();
    $('#lanc-valor').value = N.formatBRL(c, { semSimbolo: true });
    atualizarFormLanc();
    dlgLanc.dataset.foto = fotoForm(formLanc);   // o valor veio da calculadora: fechar sem mexer não pergunta nada
  });
  calcAberta(!db.config.calcRecolhida);
  desenharCalc();

  // atalhos: N = novo lançamento, Ctrl/Cmd+Z = desfazer (fora de campos de texto)
  document.addEventListener('keydown', e => {
    if (document.querySelector('dialog[open]') || e.target.closest('input, textarea, select, .ctl-calc-visor')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { if (desfazer()) e.preventDefault(); return; }
    if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); abrirLancamento(); }
  });

  // outra aba mexeu nos dados: recarrega
  window.addEventListener('storage', e => { if (e.key === N.CHAVE) { db = N.carregar(); render(); } });
  // virou o dia com o app aberto: gera as recorrências novas e redesenha
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || ref() === diaCarregado) return;
    diaCarregado = ref();
    if (gerarTudo()) gravar();
    render();
    avisarFimTeste();
  });

  // ---------- "Salvar no Control": o que veio do Pix, do Recibo e da Cobrança ----------
  const DE_ORIGEM = { pix: 'do Pix', recibo: 'do Recibo', cobranca: 'da Cobrança' };
  /** importa a caixa de entrada (e já a esvazia, para nada entrar duas vezes); item inválido é descartado */
  function importarDoSite() {
    let bruto = null;
    try { bruto = localStorage.getItem(N.CHAVE_ENTRADA); } catch (e) { return; }
    if (bruto === null) return;
    try { localStorage.removeItem(N.CHAVE_ENTRADA); } catch (e) { /* segue: no pior caso, importa de novo na próxima */ }
    let lista;
    try { lista = JSON.parse(bruto); } catch (e) { return; }
    if (!Array.isArray(lista) || !lista.some(N.entradaValida)) return;
    const { valor: r, acao } = mudar('Lançamentos do site', d => N.importarEntrada(d, lista));
    const n = r.importadas.length, origens = Object.keys(r.porOrigem).map(o => DE_ORIGEM[o]);
    const de = origens.length > 1 ? `${origens.slice(0, -1).join(', ')} e ${origens[origens.length - 1]}` : origens[0];
    toast(`${n} ${n === 1 ? 'lançamento chegou' : 'lançamentos chegaram'} ${de}`, { desfazer: acao, ms: 6000 });
  }
  window.addEventListener('storage', e => { if (e.key === N.CHAVE_ENTRADA && e.newValue) importarDoSite(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') importarDoSite(); });

  // recorrências e parcelas das dívidas até o horizonte + a lista do "Meu mês" do mês corrente (virada do mês = lista nova, desmarcada)
  function gerarTudo() {
    const r = ref();
    return N.gerarRecorrencias(db, r).length + N.gerarMes(db, N.mesDe(r)).length + N.gerarDividas(db, r).length;
  }

  // ---------- início ----------
  if (gerarTudo()) gravar();
  window.addEventListener('hashchange', rotaAtual);
  rotaAtual();
  avisarFimTeste();
  importarDoSite();

  // para os testes e para as próximas etapas
  window.WardenControl = { get db() { return db; }, render, desfazer, toast, abrirLancamento, abrirDetalhe, enviarRelatorio, abrirPro, abrirConsulta, abrirDivida };
})();
