/*
 * WARDEN CONTROL — Orientador: dicas e respostas por REGRAS LOCAIS (sem IA, sem sair do aparelho). Sem tela: o app.js desenha.
 * Cada regra: { id, prioridade, tom: 'alerta'|'aviso'|'info' (ou (dado) → tom), quando(ctx) → dado | null, texto(dado, ctx) → string (no máximo 2 frases),
 *               acao: { rotulo, executar(api) } ou (dado, ctx) → { rotulo, executar(api) } }.
 * `api` é quem executa na tela (o app.js passa): { filtrar(status | { status, categoriaId, tipo }), irPara(tela), abrirDetalhe(id), novo(), abrirLink(url) }.
 * Exposto em window.ControlOrientador.
 */
(function () {
  'use strict';
  const N = window.ControlNucleo;
  const brl = (c, o) => N.formatBRL(c, o);
  const dm = iso => N.dataBR(iso).slice(0, 5);
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const porVenc = (a, b) => a.vencimento.localeCompare(b.vencimento) || a.descricao.localeCompare(b.descricao);
  const SEMANA_LONGA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const nomeDoMes = ym => N.MESES[Number(ym.slice(5, 7)) - 1];
  /** 'hoje' | 'amanhã' | 'em 3 dias (05/10)' */
  function quando(venc, ref) {
    const n = N.diffDias(ref, venc);
    return n === 0 ? 'hoje' : n === 1 ? 'amanhã' : `em ${n} dias (${dm(venc)})`;
  }
  function diaSP(iso) {
    const d = new Date(iso);
    return isNaN(d) ? null : N.hoje(d);
  }

  // no grátis (Etapa 5), 1 dica por dia; o app passa o limite em dicas(ctx, { limite })
  const LIMITE_GRATIS = 1;
  const DIAS_SEM_LANCAR = 7;

  /** tudo que as regras e as respostas precisam, calculado uma vez com as funções do núcleo */
  function contexto(db, perfil = 'tudo', ref = N.hoje(), agora = new Date()) {
    const contas = db.contas.filter(c => perfil === 'tudo' || c.perfil === perfil);
    const abertas = contas.filter(c => !N.quitada(c));
    const ym = N.mesDe(ref);
    const rel = N.dadosRelatorio(db, perfil, ym, ref);
    // os 3 meses anteriores que tiveram algum pagamento (meses antes de a pessoa começar não puxam a média para baixo)
    const hist = [1, 2, 3].map(k => N.resumoMes(db, perfil, N.addMesYM(ym, -k))).filter(r => r.pago > 0);
    const somaCat = new Map();
    hist.forEach(r => r.porCategoria.forEach(c => somaCat.set(c.id, { nome: c.nome, valor: ((somaCat.get(c.id) || {}).valor || 0) + c.valor })));
    const mediaCat = [...somaCat].map(([id, c]) => ({ id, nome: c.nome, media: Math.round(c.valor / hist.length) }));
    // última vez que a pessoa anotou ou deu baixa (contas geradas sozinhas não contam)
    let ultima = null;
    for (const c of contas) {
      if (!c.recorrenciaId && !c.modeloId) { const d = diaSP(c.criadoEm); if (d && (!ultima || d > ultima)) ultima = d; }
      for (const b of c.baixas) { const d = diaSP(b.criadoEm) || b.data; if (d && (!ultima || d > ultima)) ultima = d; }
    }
    return {
      db, perfil, ref, ym, hora: N.horaSP(agora), contas, abertas,
      atrasadas: abertas.filter(c => c.vencimento < ref).sort(porVenc),
      em3: abertas.filter(c => c.vencimento >= ref && c.vencimento <= N.addDias(ref, 3)).sort(porVenc),
      semana: abertas.filter(c => c.vencimento >= ref && c.vencimento <= N.addDias(ref, 7)).sort(porVenc),
      rel, serie: N.serieFluxo(db, perfil, N.HORIZONTE_DIAS, ref),
      mesesHistorico: hist.length,
      mediaGastos: hist.length ? Math.round(hist.reduce((s, r) => s + r.pago, 0) / hist.length) : 0,
      mediaCat,
      diasSemLancar: ultima ? N.diffDias(ultima, ref) : null
    };
  }

  const AGENTE_REGRAS = [
    {
      id: 'atrasadas', prioridade: 100, tom: 'alerta',
      quando: ctx => ctx.atrasadas.length ? { contas: ctx.atrasadas, total: ctx.atrasadas.reduce((s, c) => s + N.restante(c), 0) } : null,
      texto: d => {
        if (d.contas.length > 1) return `Você tem ${d.contas.length} contas atrasadas, somando ${brl(d.total)}. Comece pela mais antiga para evitar mais juros e multa.`;
        const c = d.contas[0];
        return c.tipo === 'receber'
          ? `${c.descricao} (${brl(N.restante(c))}) deveria ter entrado em ${dm(c.vencimento)}. Vale lembrar quem vai pagar.`
          : `${c.descricao} (${brl(N.restante(c))}) venceu em ${dm(c.vencimento)}. Pagar logo evita mais juros e multa.`;
      },
      acao: d => d.contas.length > 1
        ? { rotulo: 'Ver atrasadas', executar: api => api.filtrar('atrasadas') }
        : { rotulo: d.contas[0].tipo === 'receber' ? 'Ver a conta' : 'Dar baixa', executar: api => api.abrirDetalhe(d.contas[0].id) }
    },
    {
      id: 'vermelho', prioridade: 90, tom: d => (d.tipo === 'saldo' ? 'alerta' : 'aviso'),
      quando: ctx => {
        const neg = ctx.serie.negativo, fim = N.fimDoMes(ctx.ref);
        if (neg && neg.data <= fim) return { tipo: 'saldo', data: neg.data, saldo: neg.saldo };
        const r = ctx.rel, previsto = (r.recebido + r.aReceber) - (r.pago + r.aPagar);
        return previsto < 0 ? { tipo: 'resultado', falta: -previsto, ym: ctx.ym } : null;
      },
      texto: (d, ctx) => d.tipo === 'saldo'
        ? `Se tudo for pago como previsto, seu saldo fica em ${brl(d.saldo)} ${d.data === ctx.ref ? 'hoje' : 'em ' + dm(d.data)}. Dá tempo de ajustar: adie um gasto ou antecipe um recebimento.`
        : `Em ${nomeDoMes(d.ym)}, o que sai passa o que entra em ${brl(d.falta)}. Veja no Fluxo onde dá para adiar um gasto ou antecipar um recebimento.`,
      acao: { rotulo: 'Abrir Fluxo', executar: api => api.irPara('fluxo') }
    },
    {
      id: 'vence-logo', prioridade: 80, tom: 'aviso',
      quando: ctx => ctx.em3.length ? { contas: ctx.em3 } : null,
      texto: (d, ctx) => {
        const cs = d.contas;
        if (cs.length === 1) {
          const c = cs[0];
          return c.tipo === 'receber'
            ? `${c.descricao} (${brl(N.restante(c))}) deve entrar ${quando(c.vencimento, ctx.ref)}. Quando cair, marque como recebida.`
            : `${c.descricao} (${brl(N.restante(c))}) vence ${quando(c.vencimento, ctx.ref)}. Se já pagou, dê baixa para o saldo ficar certo.`;
        }
        const pagar = cs.filter(c => c.tipo === 'pagar').reduce((s, c) => s + N.restante(c), 0);
        const receber = cs.filter(c => c.tipo === 'receber').reduce((s, c) => s + N.restante(c), 0);
        const partes = [pagar && `${brl(pagar)} a pagar`, receber && `${brl(receber)} a receber`].filter(Boolean).join(' e ');
        return `${cs.length} contas vencem até ${dm(N.addDias(ctx.ref, 3))}: ${partes}. Confira se o saldo dá conta.`;
      },
      acao: d => d.contas.length === 1
        ? { rotulo: d.contas[0].tipo === 'receber' ? 'Ver a conta' : 'Dar baixa', executar: api => api.abrirDetalhe(d.contas[0].id) }
        : { rotulo: 'Ver próximas', executar: api => api.filtrar('semana') }
    },
    {
      id: 'reserva', prioridade: 60, tom: 'info',
      quando: ctx => {
        const saldo = ctx.rel.saldoHoje;
        return ctx.mediaGastos > 0 && saldo < ctx.mediaGastos ? { saldo, media: ctx.mediaGastos } : null;
      },
      // tom de parceiro: sem alarme, sem cobrança, sem culpa
      texto: d => `Seu caixa (${brl(d.saldo)}) está mais apertado que a sua média de gastos do mês (${brl(d.media)}). Vale guardar um pouco este mês, no seu ritmo.`,
      acao: { rotulo: 'Calcular minha reserva', executar: api => api.abrirLink('/ferramentas/reserva-de-emergencia.html') }
    },
    {
      id: 'categoria', prioridade: 50, tom: 'info',
      quando: ctx => {
        if (ctx.mesesHistorico < 2) return null;
        let pior = null;
        for (const c of ctx.rel.porCategoria) {
          const m = ctx.mediaCat.find(x => x.id === c.id);
          if (!m || !m.media) continue;
          const excesso = c.valor - m.media;
          if (c.valor > m.media * 1.3 && excesso >= 5000 && (!pior || excesso > pior.excesso)) pior = { id: c.id, nome: c.nome, atual: c.valor, media: m.media, excesso };
        }
        return pior ? { ...pior, ym: ctx.ym } : null;
      },
      texto: d => `Em ${nomeDoMes(d.ym)}, você já gastou ${brl(d.atual)} com ${d.nome}, ${Math.round((d.atual / d.media - 1) * 100)}% acima da sua média (${brl(d.media)}). Vale olhar o que pesou mais.`,
      acao: d => ({ rotulo: `Ver ${d.nome}`, executar: api => api.filtrar({ status: 'todas', categoriaId: d.id, tipo: 'pagar' }) })
    },
    {
      id: 'sem-lancar', prioridade: 40, tom: 'info',
      quando: ctx => ctx.diasSemLancar != null && ctx.diasSemLancar >= DIAS_SEM_LANCAR ? { dias: ctx.diasSemLancar } : null,
      texto: d => `Faz ${d.dias} dias desde o último lançamento. Se algo entrou ou saiu nesse tempo, anotar agora deixa o seu saldo certinho.`,
      acao: { rotulo: 'Novo lançamento', executar: api => api.novo() }
    }
  ];

  /** dicas que valem agora, da mais importante para a menos; { limite } corta (grátis = LIMITE_GRATIS) */
  function dicas(ctx, { limite = Infinity } = {}) {
    return AGENTE_REGRAS.map(r => {
      const dado = r.quando(ctx);
      if (!dado) return null;
      return { id: r.id, prioridade: r.prioridade, tom: typeof r.tom === 'function' ? r.tom(dado) : r.tom, texto: r.texto(dado, ctx), acao: typeof r.acao === 'function' ? r.acao(dado, ctx) : r.acao };
    }).filter(Boolean).sort((a, b) => b.prioridade - a.prioridade).slice(0, limite);
  }

  /** boas-vindas do dia: saudação + o resumo em uma frase */
  function boasVindas(ctx) {
    const saud = ctx.hora < 12 ? 'Bom dia' : ctx.hora < 18 ? 'Boa tarde' : 'Boa noite';
    const [, m, d] = ctx.ref.split('-').map(Number);
    const abre = `${saud}! Hoje é ${SEMANA_LONGA[N.diaSemana(ctx.ref)]}, ${d} de ${N.MESES[m - 1]}.`;
    if (!ctx.contas.length) return `${abre} Anote sua primeira conta e eu começo a te ajudar.`;
    const hoje = ctx.abertas.filter(c => c.vencimento === ctx.ref).length, atr = ctx.atrasadas.length;
    if (atr || hoje) return `${abre} Hoje pede atenção: ${[atr && plural(atr, 'conta atrasada', 'contas atrasadas'), hoje && plural(hoje, 'vencendo hoje', 'vencendo hoje')].filter(Boolean).join(' e ')}.`;
    const sem = ctx.semana.length;
    return `${abre} ${sem ? `Nada atrasado; ${plural(sem, 'conta vence', 'contas vencem')} nos próximos 7 dias.` : 'Tudo em dia, e nada vence nos próximos 7 dias.'}`;
  }

  // ---------- atalhos de chat (respostas por regra) ----------
  const ATALHOS = [
    { id: 'mes', pergunta: 'Como estou este mês?' },
    { id: 'semana', pergunta: 'O que vence esta semana?' },
    { id: 'gastos', pergunta: 'Onde mais gastei?' }
  ];
  /** resposta: { texto, linhas: [], acao } */
  function responder(id, ctx) {
    const r = ctx.rel, mes = nomeDoMes(ctx.ym);
    if (id === 'mes') {
      const fim = r.fimMes;
      return {
        texto: `Em ${mes}, entrou ${brl(r.recebido)} e saiu ${brl(r.pago)} até agora (resultado de ${brl(r.resultado, { sinal: true })}).`
          + (fim ? ` Se tudo correr como previsto, você fecha o mês com ${brl(fim.saldo)} de saldo.` : ''),
        linhas: [], acao: { rotulo: 'Abrir Relatório', executar: api => api.irPara('relatorio') }
      };
    }
    if (id === 'semana') {
      const cs = ctx.semana, ate = N.addDias(ctx.ref, 7);
      const atr = ctx.atrasadas.length ? ` Fora isso, ${plural(ctx.atrasadas.length, 'conta está atrasada', 'contas estão atrasadas')}.` : '';
      if (!cs.length) return { texto: `Nada vence até ${dm(ate)}.${atr || ' Aproveite a folga.'}`, linhas: [], acao: null };
      const pagar = cs.filter(c => c.tipo === 'pagar').reduce((s, c) => s + N.restante(c), 0);
      const receber = cs.filter(c => c.tipo === 'receber').reduce((s, c) => s + N.restante(c), 0);
      const partes = [pagar && `${brl(pagar)} a pagar`, receber && `${brl(receber)} a receber`].filter(Boolean).join(' e ');
      return {
        texto: `Até ${dm(ate)}, ${plural(cs.length, 'conta vence', 'contas vencem')}: ${partes}.${atr}`,
        linhas: cs.slice(0, 8).map(c => `${N.rotuloDia(c.vencimento, ctx.ref)} · ${c.descricao} · ${c.tipo === 'receber' ? '+' : '−'} ${brl(N.restante(c))}`)
          .concat(cs.length > 8 ? [`e mais ${cs.length - 8}`] : []),
        acao: { rotulo: 'Ver na lista', executar: api => api.filtrar('semana') }
      };
    }
    if (id === 'gastos') {
      if (!r.porCategoria.length) return { texto: `Ainda não saiu dinheiro em ${mes}.`, linhas: [], acao: null };
      const top = r.porCategoria[0];
      return {
        texto: `Em ${mes}, o que mais pesou foi ${top.nome}: ${brl(top.valor)} (${Math.round(top.valor / r.pago * 100)}% do que saiu).`,
        linhas: r.porCategoria.slice(0, 3).map(c => `${c.nome} · ${brl(c.valor)}`),
        acao: { rotulo: 'Abrir Relatório', executar: api => api.irPara('relatorio') }
      };
    }
    return null;
  }
  /** pergunta escrita → id do atalho (por palavras-chave) ou null */
  function interpretar(texto) {
    const t = N.semAcento(texto);
    if (/venc|semana|proxim|a pagar|boleto/.test(t)) return 'semana';
    if (/gast|categoria|pesou|onde/.test(t)) return 'gastos';
    if (/como estou|\bmes\b|sobr|saldo|resultado|fech/.test(t)) return 'mes';
    return null;
  }
  /**
   * TODO (Etapa 2 do projeto): responder perguntas livres com IA pelo servidor (a chave nunca fica no navegador),
   * mandando só a pergunta e um resumo do ctx. Hoje devolve null e o app mostra o que o Orientador já sabe responder.
   */
  async function responderComIA(pergunta, ctx) { return null; }   // eslint-disable-line no-unused-vars

  window.ControlOrientador = { AGENTE_REGRAS, LIMITE_GRATIS, DIAS_SEM_LANCAR, ATALHOS, contexto, dicas, boasVindas, responder, interpretar, responderComIA };
})();
