/*
 * WARDEN CONTROL — núcleo (sem tela): dados, datas, dinheiro, status, parcelas, recorrência e fluxo de caixa.
 * Regras da casa:
 *  - Dinheiro SEMPRE em centavos inteiros (number inteiro). Nada de float em conta; reais só na hora de mostrar.
 *  - Datas são textos 'aaaa-mm-dd' no calendário de São Paulo; a conta de dias é feita em UTC (sem horário de verão).
 *  - Este arquivo não lê nem escreve a tela; o app.js usa as funções daqui. Exposto em window.ControlNucleo.
 */
(function () {
  'use strict';

  const CHAVE = 'warden:control:v1';
  const VERSAO = 1;
  const FUSO = 'America/Sao_Paulo';
  const HORIZONTE_DIAS = 90;   // recorrências são geradas até hoje + 90 dias (o fluxo de caixa vai até aí)

  // ---------- datas ----------
  const fmtHoje = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });
  const fmtHora = new Intl.DateTimeFormat('en-GB', { timeZone: FUSO, hour: '2-digit', hourCycle: 'h23' });
  const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

  /** hoje no calendário de São Paulo, 'aaaa-mm-dd' (independe do fuso do aparelho) */
  function hoje(agora = new Date()) { return fmtHoje.format(agora); }
  function horaSP(agora = new Date()) { return Number(fmtHora.format(agora)); }

  function partes(iso) { const [a, m, d] = iso.split('-').map(Number); return { a, m, d }; }
  function utc(iso) { const { a, m, d } = partes(iso); return Date.UTC(a, m - 1, d); }
  function deUtc(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function diasNoMes(a, m) { return new Date(Date.UTC(a, m, 0)).getUTCDate(); }   // m de 1 a 12
  function pad(n) { return String(n).padStart(2, '0'); }

  function addDias(iso, n) { return deUtc(utc(iso) + n * 86400000); }
  /** soma meses mantendo o dia "de origem"; dia 31 vira o último dia do mês quando ele não existe */
  function addMeses(iso, n, diaBase) {
    const { a, m, d } = partes(iso);
    const total = (a * 12 + (m - 1)) + n;
    const na = Math.floor(total / 12), nm = total % 12 + 1;
    return `${na}-${pad(nm)}-${pad(Math.min(diaBase || d, diasNoMes(na, nm)))}`;
  }
  function diffDias(de, ate) { return Math.round((utc(ate) - utc(de)) / 86400000); }
  function mesDe(iso) { return iso.slice(0, 7); }
  function fimDoMes(iso) { const { a, m } = partes(iso); return `${a}-${pad(m)}-${pad(diasNoMes(a, m))}`; }
  function addMesYM(ym, n) { return addMeses(ym + '-01', n, 1).slice(0, 7); }
  function dataValida(iso) {
    if (!RE_DATA.test(String(iso))) return false;
    const { a, m, d } = partes(iso);
    return m >= 1 && m <= 12 && d >= 1 && d <= diasNoMes(a, m);
  }

  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  function diaSemana(iso) { return new Date(utc(iso)).getUTCDay(); }
  /** '2026-10-02' → '02/10/2026' */
  function dataBR(iso) { const { a, m, d } = partes(iso); return `${pad(d)}/${pad(m)}/${a}`; }
  /** '2026-10-02' → '2 out' */
  function dataCurta(iso) { const { m, d } = partes(iso); return `${d} ${MESES_CURTOS[m - 1]}`; }
  /** '2026-10' → 'outubro de 2026' */
  function nomeMes(ym) { const [a, m] = ym.split('-').map(Number); return `${MESES[m - 1]} de ${a}`; }
  /** rótulo do dia num extrato: Hoje / Amanhã / Ontem / 'sex, 9 out' */
  function rotuloDia(iso, ref) {
    const n = diffDias(ref, iso);
    if (n === 0) return 'Hoje';
    if (n === 1) return 'Amanhã';
    if (n === -1) return 'Ontem';
    const { a } = partes(iso);
    return `${SEMANA[diaSemana(iso)]}, ${dataCurta(iso)}${a !== partes(ref).a ? ' ' + a : ''}`;
  }

  // ---------- dinheiro (centavos) ----------
  /**
   * Texto digitado → centavos inteiros (ou null se não der para entender).
   * Aceita "1.500,50", "1500,5", "1.500", "150.00", "R$ 12". Nunca passa por float.
   */
  function parseCentavos(texto) {
    let s = String(texto == null ? '' : texto).replace(/R\$|\s/g, '').replace(/^\+/, '');
    if (!s) return null;
    if (/[^\d.,]/.test(s)) return null;
    let inteiro = s, dec = '';
    if (s.includes(',')) {
      const i = s.lastIndexOf(',');
      inteiro = s.slice(0, i).replace(/\./g, ''); dec = s.slice(i + 1);
      if (dec.includes('.') || inteiro.includes(',')) return null;
    } else if (/^\d+\.\d{1,2}$/.test(s)) {           // "150.00" / "12.5": ponto decimal
      [inteiro, dec] = s.split('.');
    } else {
      inteiro = s.replace(/\./g, '');                  // "1.500" = mil e quinhentos
    }
    if (!/^\d*$/.test(inteiro) || !/^\d{0,2}$/.test(dec)) return null;
    if (!inteiro && !dec) return null;
    const c = Number(inteiro || '0') * 100 + Number((dec + '00').slice(0, 2));
    return Number.isSafeInteger(c) ? c : null;
  }

  /** centavos → "R$ 1.234,56" (sinal: true mostra "+"; negativos usam o menos tipográfico) */
  function formatBRL(c, { sinal = false, semSimbolo = false } = {}) {
    c = Math.round(Number(c) || 0);
    const neg = c < 0, abs = Math.abs(c);
    const reais = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const txt = (semSimbolo ? '' : 'R$ ') + reais + ',' + pad(abs % 100);
    if (neg) return '− ' + txt;
    if (sinal && c > 0) return '+ ' + txt;
    return txt;
  }
  /** centavos → "1234,56" (CSV e campos) */
  function centavosTexto(c) { const neg = c < 0, abs = Math.abs(c); return (neg ? '-' : '') + Math.floor(abs / 100) + ',' + pad(abs % 100); }
  /** reparte um total em n partes inteiras; a sobra de centavos vai para as primeiras */
  function repartir(total, n) {
    const base = Math.floor(total / n), sobra = total - base * n;
    return Array.from({ length: n }, (_, i) => base + (i < sobra ? 1 : 0));
  }

  // ---------- ids ----------
  let seq = 0;
  function novoId(pref) { seq = (seq + 1) % 1296; return `${pref}_${Date.now().toString(36)}${seq.toString(36).padStart(2, '0')}${Math.random().toString(36).slice(2, 5)}`; }
  function agoraISO() { return new Date().toISOString(); }

  // ---------- catálogos ----------
  const FORMAS = ['Pix', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito', 'Boleto', 'Transferência', 'Outra'];
  const PERFIS = { pessoal: 'Pessoal', negocio: 'Negócio' };
  // icone: chave do ícone SVG desenhado pelo app (Etapa 2 usa no "Meu mês")
  const CATEGORIAS_PADRAO = [
    ['moradia', 'Moradia', 'pagar', 'casa'], ['contas-casa', 'Luz, água e internet', 'pagar', 'raio'],
    ['alimentacao', 'Alimentação', 'pagar', 'cesta'], ['transporte', 'Transporte', 'pagar', 'carro'],
    ['saude', 'Saúde', 'pagar', 'coracao'], ['educacao', 'Educação', 'pagar', 'livro'],
    ['lazer', 'Lazer', 'pagar', 'estrela'], ['cartao', 'Cartão de crédito', 'pagar', 'cartao'],
    ['assinaturas', 'Assinaturas', 'pagar', 'repetir'], ['impostos', 'Impostos e taxas', 'pagar', 'documento'],
    ['fornecedores', 'Fornecedores', 'pagar', 'caixa'], ['dividas', 'Dívidas e empréstimos', 'pagar', 'cartao'],
    ['outros-pagar', 'Outros gastos', 'pagar', 'ponto'],
    ['salario', 'Salário', 'receber', 'carteira'], ['vendas', 'Vendas', 'receber', 'sacola'],
    ['servicos', 'Serviços prestados', 'receber', 'ferramenta'], ['aluguel-receber', 'Aluguel recebido', 'receber', 'casa'],
    ['outros-receber', 'Outras entradas', 'receber', 'ponto']
  ].map(([id, nome, tipo, icone]) => ({ id: 'cat_' + id, nome, tipo, icone }));

  function dbVazio() {
    const t = agoraISO();
    return {
      versao: VERSAO, criadoEm: t, atualizadoEm: t,
      config: {
        saldoInicial: { pessoal: 0, negocio: 0 }, saldoDefinido: false,
        perfil: 'tudo', primeirosPassosOcultos: false, confeteMes: null, plano: { tipo: 'gratis', testeInicio: null },
        categorias: CATEGORIAS_PADRAO.map(c => ({ ...c }))
      },
      contas: [], recorrencias: [], modelos: [], dividas: []
    };
  }

  // ---------- validação / migração ----------
  const TIPOS = ['pagar', 'receber'];
  const inteiro = v => Number.isSafeInteger(v);
  const txt = (v, max = 200) => String(v == null ? '' : v).slice(0, max);

  function limparBaixa(b) {
    if (!b || !dataValida(b.data) || !inteiro(b.valor) || b.valor < 0) return null;
    const desconto = inteiro(b.desconto) && b.desconto > 0 ? b.desconto : 0;
    const juros = inteiro(b.juros) && b.juros > 0 ? b.juros : 0;
    return { id: txt(b.id, 60) || novoId('b'), data: b.data, valor: b.valor, desconto, juros, criadoEm: txt(b.criadoEm, 40) || agoraISO() };
  }
  /**
   * "dívida com juros" (cartão, empréstimo, financiamento): { taxa } com os juros AO MÊS em centésimos de ponto
   * percentual (899 = 8,99% a.m.), ou taxa null quando a pessoa não sabe. Conta comum: divida = null.
   */
  function limparDivida(d) {
    if (!d || typeof d !== 'object') return null;
    return { taxa: inteiro(d.taxa) && d.taxa > 0 && d.taxa <= 10000 ? d.taxa : null };
  }
  /** "8,99" / "8.99%" / "8" → 899 (centésimos de ponto percentual); null se não entender */
  function parseTaxa(texto) { return parseCentavos(String(texto == null ? '' : texto).replace(/%/g, '')); }
  /** 899 → "8,99" ; 800 → "8" */
  function formatTaxa(t) { return (t / 100).toFixed(2).replace('.', ',').replace(/,00$/, '').replace(/(,\d)0$/, '$1'); }

  function limparConta(c) {
    if (!c || !TIPOS.includes(c.tipo) || !inteiro(c.valor) || c.valor <= 0 || !dataValida(c.vencimento)) return null;
    const p = c.parcela && inteiro(c.parcela.n) && inteiro(c.parcela.total) && c.parcela.n >= 1 && c.parcela.n <= c.parcela.total
      ? { n: c.parcela.n, total: c.parcela.total } : null;
    return {
      id: txt(c.id, 60) || novoId('c'), tipo: c.tipo, descricao: txt(c.descricao, 120) || 'Sem descrição', valor: c.valor,
      vencimento: c.vencimento, categoriaId: txt(c.categoriaId, 60), contato: txt(c.contato, 120), forma: txt(c.forma, 40),
      obs: txt(c.obs, 1000), perfil: PERFIS[c.perfil] ? c.perfil : 'pessoal',
      grupoId: c.grupoId ? txt(c.grupoId, 60) : null, parcela: p,
      recorrenciaId: c.recorrenciaId ? txt(c.recorrenciaId, 60) : null,
      ocorrencia: dataValida(c.ocorrencia) ? c.ocorrencia : null,
      modeloId: c.modeloId ? txt(c.modeloId, 60) : null,
      dividaId: c.dividaId ? txt(c.dividaId, 60) : null,
      divida: limparDivida(c.divida),
      baixas: Array.isArray(c.baixas) ? c.baixas.map(limparBaixa).filter(Boolean) : [],
      criadoEm: txt(c.criadoEm, 40) || agoraISO(), atualizadoEm: txt(c.atualizadoEm, 40) || agoraISO()
    };
  }
  function limparRecorrencia(r) {
    if (!r || !TIPOS.includes(r.tipo) || !inteiro(r.valor) || r.valor <= 0 || !dataValida(r.inicio)) return null;
    if (!['mensal', 'semanal', 'anual'].includes(r.freq)) return null;
    return {
      id: txt(r.id, 60) || novoId('r'), tipo: r.tipo, descricao: txt(r.descricao, 120) || 'Sem descrição', valor: r.valor,
      categoriaId: txt(r.categoriaId, 60), contato: txt(r.contato, 120), forma: txt(r.forma, 40), obs: txt(r.obs, 1000),
      perfil: PERFIS[r.perfil] ? r.perfil : 'pessoal', freq: r.freq, inicio: r.inicio,
      dia: inteiro(r.dia) && r.dia >= 1 && r.dia <= 31 ? r.dia : partes(r.inicio).d,
      fim: dataValida(r.fim) ? r.fim : null,
      excluidas: Array.isArray(r.excluidas) ? r.excluidas.filter(dataValida) : [],
      criadoEm: txt(r.criadoEm, 40) || agoraISO()
    };
  }

  function limparModelo(m) {
    if (!m || !TIPOS.includes(m.tipo) || !inteiro(m.valor) || m.valor <= 0 || !inteiro(m.dia) || m.dia < 1 || m.dia > 31) return null;
    return {
      id: txt(m.id, 60) || novoId('m'), tipo: m.tipo, descricao: txt(m.descricao, 120) || 'Sem descrição', valor: m.valor, dia: m.dia,
      categoriaId: txt(m.categoriaId, 60), perfil: PERFIS[m.perfil] ? m.perfil : 'pessoal',
      variavel: !!m.variavel, ativo: m.ativo !== false,
      excluidos: Array.isArray(m.excluidos) ? m.excluidos.filter(x => /^\d{4}-\d{2}$/.test(x)) : [],
      criadoEm: txt(m.criadoEm, 40) || agoraISO()
    };
  }

  /** aceita o db salvo ou um backup (com ou sem envelope) e devolve um db limpo, ou lança um Error com a explicação */
  function migrar(bruto) {
    let d = bruto && bruto.app === 'warden-control' && bruto.dados ? bruto.dados : bruto;
    if (!d || typeof d !== 'object' || !Array.isArray(d.contas)) throw new Error('Este arquivo não é um backup do Warden Control.');
    if (inteiro(d.versao) && d.versao > VERSAO) throw new Error('Este backup é de uma versão mais nova do Warden Control. Atualize a página e tente de novo.');
    const base = dbVazio(), cfg = d.config || {};
    const si = cfg.saldoInicial || {};
    const cats = Array.isArray(cfg.categorias) ? cfg.categorias
      .filter(c => c && c.id && c.nome && TIPOS.includes(c.tipo))
      .map(c => ({ id: txt(c.id, 60), nome: txt(c.nome, 60), tipo: c.tipo, icone: txt(c.icone, 30) || 'ponto' })) : [];
    return {
      ...d,   // mantém campos de etapas futuras (ex.: modelos do "Meu mês") que esta versão não conhece
      versao: VERSAO, criadoEm: txt(d.criadoEm, 40) || base.criadoEm, atualizadoEm: txt(d.atualizadoEm, 40) || base.atualizadoEm,
      config: {
        ...cfg,
        saldoInicial: { pessoal: inteiro(si.pessoal) ? si.pessoal : 0, negocio: inteiro(si.negocio) ? si.negocio : 0 },
        saldoDefinido: !!cfg.saldoDefinido,
        perfil: ['pessoal', 'negocio', 'tudo'].includes(cfg.perfil) ? cfg.perfil : 'tudo',
        primeirosPassosOcultos: !!cfg.primeirosPassosOcultos,
        confeteMes: /^\d{4}-\d{2}$/.test(cfg.confeteMes) ? cfg.confeteMes : null,
        plano: limparPlano(cfg.plano),
        rendaMensal: inteiro(cfg.rendaMensal) && cfg.rendaMensal > 0 ? cfg.rendaMensal : null,
        categorias: cats.length ? cats : base.config.categorias
      },
      contas: d.contas.map(limparConta).filter(Boolean),
      recorrencias: Array.isArray(d.recorrencias) ? d.recorrencias.map(limparRecorrencia).filter(Boolean) : [],
      modelos: Array.isArray(d.modelos) ? d.modelos.map(limparModelo).filter(Boolean) : [],
      dividas: Array.isArray(d.dividas) ? d.dividas.map(limparRegistroDivida).filter(Boolean) : []
    };
  }

  // ---------- armazenamento ----------
  function carregar() {
    try {
      const s = localStorage.getItem(CHAVE);
      if (!s) return dbVazio();
      return migrar(JSON.parse(s));
    } catch (e) { return dbVazio(); }
  }
  /** grava; devolve false se o navegador recusar (modo privado, sem espaço) */
  function salvar(db) {
    try { db.atualizadoEm = agoraISO(); localStorage.setItem(CHAVE, JSON.stringify(db)); return true; }
    catch (e) { return false; }
  }

  // ---------- conta: valores e status ----------
  /** quanto da conta uma baixa abate: o que entrou/saiu + desconto − juros */
  function abatido(b) { return b.valor + b.desconto - b.juros; }
  function totalAbatido(c) { return c.baixas.reduce((s, b) => s + abatido(b), 0); }
  /** dinheiro que de fato entrou/saiu do caixa por esta conta */
  function totalMovido(c) { return c.baixas.reduce((s, b) => s + b.valor, 0); }
  function restante(c) { return Math.max(0, c.valor - totalAbatido(c)); }
  function quitada(c) { return restante(c) === 0; }
  function ultimaBaixa(c) { return c.baixas.reduce((u, b) => (!u || b.data >= u.data ? b : u), null); }

  /**
   * status: 'paga' | 'parcial' | 'atrasada' | 'hoje' | 'previsto'
   * (parcial vencida continua 'parcial', com atrasada = true para a tela avisar)
   */
  function status(c, ref) {
    const atrasada = c.vencimento < ref;
    if (quitada(c)) return { codigo: 'paga', atrasada: false };
    if (c.baixas.length) return { codigo: 'parcial', atrasada };
    if (atrasada) return { codigo: 'atrasada', atrasada: true };
    if (c.vencimento === ref) return { codigo: 'hoje', atrasada: false };
    return { codigo: 'previsto', atrasada: false };
  }
  function rotuloStatus(c, ref) {
    const s = status(c, ref);
    return {
      paga: c.tipo === 'receber' ? 'Recebida' : 'Paga',
      parcial: s.atrasada ? 'Parcial · atrasada' : 'Parcial',
      atrasada: 'Atrasada', hoje: 'Vence hoje', previsto: 'Prevista'
    }[s.codigo];
  }

  const doPerfil = perfil => x => perfil === 'tudo' || x.perfil === perfil;

  // ---------- criar / editar / baixar ----------
  function contaBase(dados) {
    const t = agoraISO();
    return {
      id: novoId('c'), tipo: dados.tipo, descricao: txt(dados.descricao, 120).trim() || 'Sem descrição', valor: dados.valor,
      vencimento: dados.vencimento, categoriaId: dados.categoriaId || '', contato: txt(dados.contato, 120).trim(),
      forma: txt(dados.forma, 40), obs: txt(dados.obs, 1000).trim(), perfil: PERFIS[dados.perfil] ? dados.perfil : 'pessoal',
      grupoId: null, parcela: null, recorrenciaId: null, ocorrencia: null, modeloId: null, dividaId: null, divida: dados.tipo === 'pagar' ? limparDivida(dados.divida) : null,
      baixas: [], criadoEm: t, atualizadoEm: t
    };
  }

  /** erros de um lançamento (lista de { campo, msg }); vazia = ok */
  function validarLancamento(d) {
    const e = [];
    if (!TIPOS.includes(d.tipo)) e.push({ campo: 'tipo', msg: 'Escolha se é para pagar ou receber.' });
    if (!txt(d.descricao).trim()) e.push({ campo: 'descricao', msg: 'Dê um nome para a conta (ex.: Aluguel).' });
    if (!inteiro(d.valor) || d.valor <= 0) e.push({ campo: 'valor', msg: 'Digite um valor maior que zero.' });
    if (!dataValida(d.vencimento)) e.push({ campo: 'vencimento', msg: 'Escolha a data de vencimento.' });
    if (d.repeticao === 'parcelada' && !(inteiro(d.parcelas) && d.parcelas >= 2 && d.parcelas <= 120)) e.push({ campo: 'parcelas', msg: 'De 2 a 120 parcelas.' });
    if (d.repeticao === 'parcelada' && inteiro(d.valor) && inteiro(d.parcelas) && d.parcelas > 0 && d.valor < d.parcelas) e.push({ campo: 'valor', msg: 'O valor é pequeno demais para tantas parcelas.' });
    if (d.repeticao === 'recorrente' && !['mensal', 'semanal', 'anual'].includes(d.freq)) e.push({ campo: 'freq', msg: 'Escolha de quanto em quanto tempo repete.' });
    if (d.divida && d.divida.taxa != null && !(inteiro(d.divida.taxa) && d.divida.taxa > 0 && d.divida.taxa <= 10000)) e.push({ campo: 'taxa', msg: 'Use só números, como 8,99 (até 100% ao mês).' });
    return e;
  }

  /**
   * Cria um lançamento. dados: { tipo, descricao, valor (centavos; na parcelada é o TOTAL), vencimento, categoriaId, contato,
   * forma, obs, perfil, repeticao: 'unica'|'parcelada'|'recorrente', parcelas, freq, jaPaga, ref }
   * Devolve a lista de contas criadas (na recorrente: as ocorrências geradas até o horizonte).
   */
  function criarLancamento(db, dados) {
    const erros = validarLancamento(dados);
    if (erros.length) throw Object.assign(new Error(erros[0].msg), { erros });
    const ref = dados.ref || hoje();
    let criadas = [];
    if (dados.repeticao === 'parcelada') {
      const grupoId = novoId('g'), dia = partes(dados.vencimento).d;
      criadas = repartir(dados.valor, dados.parcelas).map((v, i) => ({
        ...contaBase(dados), valor: v, vencimento: addMeses(dados.vencimento, i, dia), grupoId, parcela: { n: i + 1, total: dados.parcelas }
      }));
      db.contas.push(...criadas);
    } else if (dados.repeticao === 'recorrente') {
      const b = contaBase(dados);
      const rec = {
        id: novoId('r'), tipo: b.tipo, descricao: b.descricao, valor: b.valor, categoriaId: b.categoriaId, contato: b.contato,
        forma: b.forma, obs: b.obs, perfil: b.perfil, freq: dados.freq, inicio: dados.vencimento, dia: partes(dados.vencimento).d,
        fim: null, excluidas: [], criadoEm: agoraISO()
      };
      db.recorrencias.push(rec);
      criadas = gerarRecorrencias(db, ref).filter(c => c.recorrenciaId === rec.id);
    } else {
      criadas = [contaBase(dados)];
      db.contas.push(...criadas);
    }
    // "já está paga": só a primeira (a de agora); parcelas e repetições futuras continuam em aberto
    if (dados.jaPaga && criadas.length) baixaTotal(db, criadas[0].id, ref);
    return criadas;
  }

  /** data da k-ésima ocorrência de uma recorrência */
  function dataOcorrencia(rec, k) {
    if (rec.freq === 'semanal') return addDias(rec.inicio, 7 * k);
    return addMeses(rec.inicio, rec.freq === 'anual' ? 12 * k : k, rec.dia);
  }
  /**
   * Gera as contas das recorrências até ref + 90 dias, sem duplicar (a chave é recorrência + data original da ocorrência,
   * então mudar o vencimento de uma ocorrência não faz ela nascer de novo). Devolve as contas novas.
   */
  function gerarRecorrencias(db, ref = hoje()) {
    const ate = addDias(ref, HORIZONTE_DIAS), novas = [];
    const existentes = new Set(db.contas.filter(c => c.recorrenciaId).map(c => c.recorrenciaId + '|' + c.ocorrencia));
    for (const rec of db.recorrencias) {
      const excl = new Set(rec.excluidas);
      for (let k = 0; k < 5000; k++) {
        const data = dataOcorrencia(rec, k);
        if (data > ate || (rec.fim && data > rec.fim)) break;
        const chave = rec.id + '|' + data;
        if (existentes.has(chave) || excl.has(data)) continue;
        const c = {
          ...contaBase({ ...rec, vencimento: data }), recorrenciaId: rec.id, ocorrencia: data
        };
        db.contas.push(c); novas.push(c); existentes.add(chave);
      }
    }
    return novas;
  }

  // ---------- "Meu mês": contas fixas (modelos) ----------
  function validarModelo(d) {
    const e = [];
    if (!TIPOS.includes(d.tipo)) e.push({ campo: 'tipo', msg: 'Escolha se é para pagar ou receber.' });
    if (!txt(d.descricao).trim()) e.push({ campo: 'descricao', msg: 'Dê um nome para a conta (ex.: Aluguel).' });
    if (!inteiro(d.valor) || d.valor <= 0) e.push({ campo: 'valor', msg: 'Digite um valor maior que zero.' });
    if (!inteiro(d.dia) || d.dia < 1 || d.dia > 31) e.push({ campo: 'dia', msg: 'Escolha um dia de 1 a 31.' });
    return e;
  }
  function camposModelo(dados) {
    return {
      tipo: dados.tipo, descricao: txt(dados.descricao, 120).trim(), valor: dados.valor, dia: dados.dia,
      categoriaId: dados.categoriaId || '', perfil: PERFIS[dados.perfil] ? dados.perfil : 'pessoal', variavel: !!dados.variavel
    };
  }
  function criarModelo(db, dados) {
    const erros = validarModelo(dados);
    if (erros.length) throw Object.assign(new Error(erros[0].msg), { erros });
    const m = { id: novoId('m'), ...camposModelo(dados), ativo: true, excluidos: [], criadoEm: agoraISO() };
    db.modelos.push(m);
    return m;
  }
  /** muda só o modelo: os meses já gerados ficam como estão (cada um se edita na própria conta) */
  function editarModelo(db, id, dados) {
    const m = db.modelos.find(x => x.id === id);
    if (!m) throw new Error('Conta fixa não encontrada.');
    const erros = validarModelo(dados);
    if (erros.length) throw Object.assign(new Error(erros[0].msg), { erros });
    return Object.assign(m, camposModelo(dados));
  }
  /** tira o modelo; as contas já geradas continuam (com o modeloId) */
  function excluirModelo(db, id) {
    const antes = db.modelos.length;
    db.modelos = db.modelos.filter(m => m.id !== id);
    return antes - db.modelos.length;
  }

  /**
   * Gera as contas do mês 'aaaa-mm' a partir dos modelos ativos, sem duplicar (chave = modelo + mês da ocorrência).
   * Dia 31 vira o último dia do mês. Valor variável: o valor da conta mais recente desse modelo, senão o padrão.
   * Devolve as contas novas.
   */
  function gerarMes(db, ym = mesDe(hoje())) {
    const [a, m] = ym.split('-').map(Number), novas = [];
    const feitos = new Set(db.contas.filter(c => c.modeloId && c.ocorrencia).map(c => c.modeloId + '|' + mesDe(c.ocorrencia)));
    for (const mod of db.modelos) {
      if (!mod.ativo || feitos.has(mod.id + '|' + ym) || mod.excluidos.includes(ym)) continue;
      const data = `${ym}-${pad(Math.min(mod.dia, diasNoMes(a, m)))}`;
      let valor = mod.valor;
      if (mod.variavel) {
        const anterior = db.contas.filter(c => c.modeloId === mod.id && c.ocorrencia && c.ocorrencia < data)
          .sort((x, y) => y.ocorrencia.localeCompare(x.ocorrencia))[0];
        if (anterior) valor = anterior.valor;
      }
      const c = { ...contaBase({ ...mod, valor, vencimento: data }), modeloId: mod.id, ocorrencia: data };
      db.contas.push(c); novas.push(c); feitos.add(mod.id + '|' + ym);
    }
    return novas;
  }
  /** muda o valor só desta conta (ex.: a luz deste mês); o modelo e os outros meses não mudam */
  function ajustarValor(db, id, valor) {
    const c = acharConta(db, id);
    if (!c) throw new Error('Conta não encontrada.');
    if (!inteiro(valor) || valor <= 0) throw new Error('Digite um valor maior que zero.');
    if (valor < totalAbatido(c)) throw new Error(`Esta conta já tem ${formatBRL(totalAbatido(c))} de baixa; o valor não pode ser menor que isso.`);
    c.valor = valor; c.atualizadoEm = agoraISO();
    return c;
  }
  /** contas do "Meu mês" em 'aaaa-mm': as geradas pelos modelos e as parcelas das dívidas */
  function contasMes(db, perfil, ym) {
    return db.contas.filter(doPerfil(perfil)).filter(c => (c.modeloId || c.dividaId) && c.ocorrencia && mesDe(c.ocorrencia) === ym);
  }


  // ---------- Dívidas (área do Pro): registro + resumo com os números da própria pessoa (não é calculadora) ----------
  /*
   * db.dividas: [{ id, credor, total (centavos devidos quando foi informado), parcela (centavos | null = sem parcela: à vista ou em aberto),
   *   parcelas (quantas faltam a partir de `inicio` | null = sem prazo), dia (1–31), inicio ('aaaa-mm-dd' da 1ª parcela gerada),
   *   taxa (juros ao mês em centésimos de ponto | null), obs, perfil, proposta: { valor, validade | null } | null,
   *   pagoAntes (o que já tinha sido pago nas parcelas quando o total foi informado), excluidas: ['aaaa-mm-dd'], quitadaEm, origem,
   *   criadoEm, atualizadoEm }]
   * As parcelas viram contas a pagar normais com dividaId + ocorrencia (como as recorrências), geradas até hoje + 90 dias:
   * entram em Contas, no Fluxo, no Relatório e no "Meu mês". Devido hoje = total − o que foi pago nas parcelas depois disso.
   */
  /** primeira data com o dia `dia` a partir de ref (inclusive); dia 31 vira o último dia do mês */
  function proximaData(dia, ref) {
    const { a, m } = partes(ref), este = `${a}-${pad(m)}-${pad(Math.min(dia, diasNoMes(a, m)))}`;
    return este >= ref ? este : addMeses(`${a}-${pad(m)}-01`, 1, dia);
  }
  function limparRegistroDivida(d) {
    if (!d || !inteiro(d.total) || d.total <= 0) return null;
    const parcela = inteiro(d.parcela) && d.parcela > 0 ? d.parcela : null;
    const dia = parcela ? (inteiro(d.dia) && d.dia >= 1 && d.dia <= 31 ? d.dia : 1) : null;
    const p = d.proposta && inteiro(d.proposta.valor) && d.proposta.valor > 0
      ? { valor: d.proposta.valor, validade: dataValida(d.proposta.validade) ? d.proposta.validade : null } : null;
    return {
      id: txt(d.id, 60) || novoId('d'), credor: txt(d.credor, 120) || 'Sem nome', total: d.total, parcela,
      parcelas: parcela && inteiro(d.parcelas) && d.parcelas >= 1 && d.parcelas <= 600 ? d.parcelas : null, dia,
      inicio: parcela ? (dataValida(d.inicio) ? d.inicio : proximaData(dia, hoje())) : null,
      taxa: inteiro(d.taxa) && d.taxa > 0 && d.taxa <= 10000 ? d.taxa : null, obs: txt(d.obs, 1000), perfil: PERFIS[d.perfil] ? d.perfil : 'pessoal',
      proposta: p, pagoAntes: inteiro(d.pagoAntes) && d.pagoAntes > 0 ? d.pagoAntes : 0,
      excluidas: Array.isArray(d.excluidas) ? d.excluidas.filter(dataValida) : [],
      quitadaEm: dataValida(d.quitadaEm) ? d.quitadaEm : null, origem: d.origem ? txt(d.origem, 60) : null,
      criadoEm: txt(d.criadoEm, 40) || agoraISO(), atualizadoEm: txt(d.atualizadoEm, 40) || agoraISO()
    };
  }
  /** erros de uma dívida digitada (lista de { campo, msg }); parcela null = sem parcela; parcelas null = sem prazo */
  function validarDivida(d) {
    const e = [];
    if (!txt(d.credor).trim()) e.push({ campo: 'credor', msg: 'Diga com quem é a dívida (ex.: banco, cartão, loja).' });
    if (!inteiro(d.total) || d.total <= 0) e.push({ campo: 'total', msg: 'Digite quanto falta pagar hoje.' });
    if (d.parcela != null) {
      if (!inteiro(d.parcela) || d.parcela <= 0) e.push({ campo: 'parcela', msg: 'Digite o valor da parcela, ou deixe em branco se não tem parcela.' });
      else if (inteiro(d.total) && d.parcela > d.total) e.push({ campo: 'parcela', msg: 'A parcela não pode ser maior que o total devido.' });
      if (!inteiro(d.dia) || d.dia < 1 || d.dia > 31) e.push({ campo: 'dia', msg: 'Escolha um dia de 1 a 31.' });
      if (d.parcelas != null && !(inteiro(d.parcelas) && d.parcelas >= 1 && d.parcelas <= 600)) e.push({ campo: 'parcelas', msg: 'De 1 a 600 parcelas, ou marque "Sem prazo".' });
    }
    if (d.taxa != null && !(inteiro(d.taxa) && d.taxa > 0 && d.taxa <= 10000)) e.push({ campo: 'taxa', msg: 'Use só números, como 8,99 (até 100% ao mês).' });
    if (d.proposta) {
      if (!inteiro(d.proposta.valor) || d.proposta.valor <= 0) e.push({ campo: 'proposta', msg: 'Digite o valor para quitar à vista.' });
      else if (inteiro(d.total) && d.proposta.valor >= d.total) e.push({ campo: 'proposta', msg: 'Para ter desconto, a proposta precisa ser menor que o total devido.' });
      if (d.proposta.validade != null && !dataValida(d.proposta.validade)) e.push({ campo: 'validade', msg: 'Escolha até quando a proposta vale.' });
    }
    return e;
  }
  function camposDivida(dados) {
    const parcela = dados.parcela == null ? null : dados.parcela;
    return {
      credor: txt(dados.credor, 120).trim(), total: dados.total, parcela, parcelas: parcela ? dados.parcelas ?? null : null,
      dia: parcela ? dados.dia : null, taxa: dados.taxa ?? null, obs: txt(dados.obs, 1000).trim(), perfil: PERFIS[dados.perfil] ? dados.perfil : 'pessoal',
      proposta: dados.proposta ? { valor: dados.proposta.valor, validade: dataValida(dados.proposta.validade) ? dados.proposta.validade : null } : null
    };
  }
  const catDividas = db => (db.config.categorias.some(c => c.id === 'cat_dividas') ? 'cat_dividas' : '');
  const parcelasDa = (db, id) => db.contas.filter(c => c.dividaId === id && c.ocorrencia);
  /** dinheiro que já saiu nas parcelas geradas desta dívida */
  function pagoNaDivida(db, id) { return parcelasDa(db, id).reduce((s, c) => s + totalMovido(c), 0); }
  /** quanto falta pagar hoje: o total informado − o que foi pago nas parcelas depois disso (0 se quitada) */
  function devidoHoje(db, d) { return d.quitadaEm ? 0 : Math.max(0, d.total - (pagoNaDivida(db, d.id) - d.pagoAntes)); }
  /** quantas parcelas faltam (null = sem prazo): as do prazo informado − as já quitadas desde o início */
  function parcelasFaltam(db, d) {
    if (!d.parcela || d.parcelas == null) return null;
    return Math.max(0, d.parcelas - parcelasDa(db, d.id).filter(c => c.ocorrencia >= d.inicio && quitada(c)).length);
  }

  /**
   * Gera as parcelas das dívidas até ref + 90 dias, sem duplicar (chave = dívida + data original). Respeita o prazo,
   * as parcelas excluídas e a quitação. Sem prazo: gera enquanto ainda há o que pagar. Devolve as contas novas.
   */
  function gerarDividas(db, ref = hoje()) {
    const ate = addDias(ref, HORIZONTE_DIAS), novas = [];
    const existentes = new Set(db.contas.filter(c => c.dividaId && c.ocorrencia).map(c => c.dividaId + '|' + c.ocorrencia));
    for (const d of db.dividas || []) {
      if (d.quitadaEm || !d.parcela || !d.inicio) continue;
      const excl = new Set(d.excluidas);
      // sem prazo: só até cobrir o que falta (sem contar juros), contando as parcelas que já estão na lista em aberto
      let resta = d.parcelas == null ? devidoHoje(db, d) - parcelasDa(db, d.id).filter(c => !quitada(c)).reduce((s, c) => s + restante(c), 0) : Infinity;
      for (let k = 0; k < (d.parcelas ?? 600); k++) {
        const data = addMeses(d.inicio, k, d.dia);
        if (data > ate) break;
        const chave = d.id + '|' + data;
        if (existentes.has(chave) || excl.has(data)) continue;
        if (resta <= 0) break;
        const c = {
          ...contaBase({ tipo: 'pagar', descricao: d.credor, valor: d.parcela, vencimento: data, categoriaId: catDividas(db), perfil: d.perfil }),
          dividaId: d.id, ocorrencia: data
        };
        db.contas.push(c); novas.push(c); existentes.add(chave);
        resta -= d.parcela;
      }
    }
    return novas;
  }

  /**
   * dados para começar uma dívida a partir de uma conta marcada como dívida (ou de um parcelamento inteiro):
   * só as contas em aberto e sem baixa entram (são elas que a dívida passa a gerar). null se não houver nenhuma.
   */
  function dadosDeConta(db, contaId) {
    const c = acharConta(db, contaId);
    if (!c || c.tipo !== 'pagar' || c.dividaId) return null;
    const grupo = c.grupoId ? db.contas.filter(o => o.grupoId === c.grupoId) : [c];
    const abertas = grupo.filter(o => !o.baixas.length).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    if (!abertas.length) return null;
    const primeira = c.grupoId ? [...grupo].sort((a, b) => (a.parcela ? a.parcela.n : 0) - (b.parcela ? b.parcela.n : 0))[0] : c;
    return {
      origem: c.id, credor: c.descricao, total: abertas.reduce((s, o) => s + o.valor, 0), parcela: abertas[abertas.length - 1].valor,
      parcelas: abertas.length, dia: partes(primeira.vencimento).d, inicio: abertas[0].vencimento,
      taxa: c.divida ? c.divida.taxa : null, perfil: c.perfil, obs: c.obs
    };
  }
  /** contas a pagar marcadas como dívida que ainda podem virar um cadastro em Dívidas (parcelamento = uma só) */
  function contasParaDivida(db, perfil = 'tudo') {
    const vistos = new Set(), lista = [];
    for (const c of db.contas.filter(doPerfil(perfil))) {
      if (c.tipo !== 'pagar' || !c.divida || c.dividaId) continue;
      const chave = c.grupoId || c.id;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      const dd = dadosDeConta(db, c.id);
      if (dd) lista.push({ id: c.id, nome: c.descricao, total: dd.total, parcelas: dd.parcelas });
    }
    return lista;
  }

  function criarDivida(db, dados, ref = hoje()) {
    const erros = validarDivida(dados);
    if (erros.length) throw Object.assign(new Error(erros[0].msg), { erros });
    const t = agoraISO();
    const d = limparRegistroDivida({ ...camposDivida(dados), id: novoId('d'), inicio: null, criadoEm: t, atualizadoEm: t });
    // nasce de uma conta marcada como dívida: as contas dela em aberto e sem baixa saem, e as parcelas passam a vir daqui
    let inicio = null;
    if (dados.origem) {
      const dd = dadosDeConta(db, dados.origem), c = acharConta(db, dados.origem);
      if (dd && c) {
        const grupo = c.grupoId ? db.contas.filter(o => o.grupoId === c.grupoId) : [c];
        const sai = new Set(grupo.filter(o => !o.baixas.length).map(o => o.id));
        db.contas = db.contas.filter(o => !sai.has(o.id));
        d.origem = c.grupoId || c.id;
        if (d.parcela && d.dia === dd.dia) inicio = dd.inicio;
      }
    }
    d.inicio = d.parcela ? inicio || proximaData(d.dia, ref) : null;
    db.dividas.push(d);
    gerarDividas(db, ref);
    return d;
  }
  /**
   * edita. Mudou parcela, dia ou prazo: as parcelas de hoje em diante em aberto e sem baixa saem e são geradas de novo
   * (as atrasadas e as pagas ficam). O total digitado é o que falta hoje: o que já foi pago nas parcelas fica de fora dele.
   */
  function editarDivida(db, id, dados, ref = hoje()) {
    const d = (db.dividas || []).find(x => x.id === id);
    if (!d) throw new Error('Dívida não encontrada.');
    const erros = validarDivida(dados);
    if (erros.length) throw Object.assign(new Error(erros[0].msg), { erros });
    const novo = camposDivida(dados);
    const refazer = novo.parcela !== d.parcela || novo.dia !== d.dia || novo.parcelas !== parcelasFaltam(db, d);
    if (novo.total !== devidoHoje(db, d)) d.pagoAntes = pagoNaDivida(db, d.id);
    else novo.total = d.total;   // o total não mudou: continua descontando o que for pago
    if (!refazer) novo.parcelas = d.parcelas;   // o prazo guardado conta desde o início, não desde hoje
    Object.assign(d, novo, { atualizadoEm: agoraISO() });
    const abertas = parcelasDa(db, d.id).filter(c => !c.baixas.length && c.vencimento >= ref);
    if (refazer) {
      const sai = new Set(abertas.map(c => c.id));
      db.contas = db.contas.filter(c => !sai.has(c.id));
      d.excluidas = [];
      if (d.parcela) {
        let ini = proximaData(d.dia, ref);
        // a parcela deste mês já existe (paga ou atrasada): as que faltam começam no mês seguinte
        if (parcelasDa(db, d.id).some(c => mesDe(c.ocorrencia) === mesDe(ini))) ini = addMeses(ini, 1, d.dia);
        d.inicio = ini;   // o prazo digitado (as que faltam) conta a partir daqui
      } else d.inicio = null;
    } else {
      abertas.forEach(c => { c.descricao = d.credor; c.perfil = d.perfil; c.atualizadoEm = agoraISO(); });
    }
    gerarDividas(db, ref);
    return d;
  }
  /** apaga o cadastro e as parcelas ainda sem baixa; as pagas ficam no histórico. Devolve quantas contas saíram. */
  function excluirDivida(db, id) {
    const antes = db.contas.length;
    db.dividas = (db.dividas || []).filter(d => d.id !== id);
    db.contas = db.contas.filter(c => !(c.dividaId === id && c.ocorrencia && !c.baixas.length));
    return antes - db.contas.length;
  }
  /** quitou (com ou sem desconto): as parcelas sem baixa saem e o pagamento entra como uma conta paga na data */
  function quitarDivida(db, id, { valor, data } = {}) {
    const d = (db.dividas || []).find(x => x.id === id);
    if (!d) throw new Error('Dívida não encontrada.');
    if (!inteiro(valor) || valor <= 0) throw new Error('Digite quanto você pagou para quitar.');
    if (!dataValida(data)) throw new Error('Escolha a data do pagamento.');
    db.contas = db.contas.filter(c => !(c.dividaId === id && c.ocorrencia && !c.baixas.length));
    const c = { ...contaBase({ tipo: 'pagar', descricao: `Quitação: ${d.credor}`, valor, vencimento: data, categoriaId: catDividas(db), perfil: d.perfil }), dividaId: d.id };
    c.baixas.push({ id: novoId('b'), data, valor, desconto: 0, juros: 0, criadoEm: agoraISO() });
    db.contas.push(c);
    d.quitadaEm = data; d.atualizadoEm = agoraISO();
    return c;
  }

  /** 25.2 → "25,2%"; 10 → "10%" */
  function formatPct(v) { return v == null ? '—' : String(v.toFixed(1)).replace('.', ',').replace(/,0$/, '') + '%'; }
  const pctDe = (parte, todo) => (todo > 0 ? Math.round(parte * 1000 / todo) / 10 : null);
  /**
   * pagando só as parcelas: { meses, custo } que ainda saem do bolso. Sem parcela: o valor inteiro, sem data (meses null).
   * Sem prazo: juros ao mês sobre o que falta até zerar; se a parcela não cobre os juros, { semFim: true }.
   */
  function pagandoNormal(d, devido, faltam) {
    if (!d.parcela) return { meses: null, custo: devido, avista: true };
    if (faltam != null) return { meses: faltam, custo: faltam ? d.parcela * faltam : devido };
    const i = (d.taxa || 0) / 10000;
    let saldo = devido, meses = 0, custo = 0;
    while (saldo > 0 && meses < 600) {
      const comJuros = Math.round(saldo * (1 + i)), v = Math.min(d.parcela, comJuros);
      if (comJuros - v >= saldo) return { meses: null, custo: null, semFim: true };
      saldo = comJuros - v; custo += v; meses++;
    }
    return saldo > 0 ? { meses: null, custo: null, semFim: true } : { meses, custo };
  }
  /** uma dívida com os números do dia: devido, à vista (com a proposta válida), economia, parcelas que faltam, pagando normal */
  function infoDivida(db, d, ref = hoje()) {
    const devido = devidoHoje(db, d), faltam = parcelasFaltam(db, d);
    let proposta = null;
    if (d.proposta) {
      const venceEm = d.proposta.validade ? diffDias(ref, d.proposta.validade) : null, vencida = venceEm != null && venceEm < 0;
      proposta = { valor: d.proposta.valor, validade: d.proposta.validade, venceEm, vencida, vencendo: venceEm != null && venceEm >= 0 && venceEm <= 7 };
    }
    const vista = proposta && !proposta.vencida ? Math.min(proposta.valor, devido) : devido;
    return {
      id: d.id, credor: d.credor, perfil: d.perfil, taxa: d.taxa, parcela: d.parcela, dia: d.dia, faltam, semPrazo: !!d.parcela && d.parcelas == null,
      devido, vista, economia: devido - vista, pctEconomia: pctDe(devido - vista, devido), proposta, obs: d.obs,
      normal: pagandoNormal(d, devido, faltam), quitadaEm: d.quitadaEm, ativa: !d.quitadaEm && devido > 0
    };
  }
  /**
   * resumo da área Dívidas. Lista em ordem de maior economia da proposta (depois, maior dívida).
   * Compromisso mensal = soma das parcelas das dívidas ativas que ainda têm parcela; sobra = renda − compromisso.
   * Proposta vencida não entra no total à vista.
   */
  function resumoDividas(db, perfil = 'tudo', ref = hoje()) {
    const todas = (db.dividas || []).filter(doPerfil(perfil)).map(d => infoDivida(db, d, ref));
    const lista = todas.filter(x => x.ativa).sort((a, b) => b.economia - a.economia || b.devido - a.devido || a.credor.localeCompare(b.credor));
    const soma = k => lista.reduce((s, x) => s + x[k], 0);
    const totalDevido = soma('devido'), totalVista = soma('vista');
    const compromisso = lista.filter(x => x.parcela && x.faltam !== 0).reduce((s, x) => s + x.parcela, 0);
    const renda = inteiro(db.config.rendaMensal) && db.config.rendaMensal > 0 ? db.config.rendaMensal : null;
    return {
      lista, quitadas: todas.filter(x => !x.ativa), totalDevido, totalVista, economia: totalDevido - totalVista, pctEconomia: pctDe(totalDevido - totalVista, totalDevido),
      compromisso, renda, pctRenda: renda ? pctDe(compromisso, renda) : null, sobra: renda != null ? renda - compromisso : null,
      vencendo: lista.filter(x => x.proposta && x.proposta.vencendo)
    };
  }

  // ---------- "Salvar no Control": caixa de entrada vinda do Pix, do Recibo e da Cobrança ----------
  const CHAVE_ENTRADA = 'warden:control-entrada';
  const ORIGENS = { pix: 'gerador de Pix', recibo: 'gerador de recibo', cobranca: 'Warden Cobrança' };
  /** item da caixa de entrada que pode virar conta (as mesmas regras de um lançamento digitado) */
  function entradaValida(e) {
    return !!e && typeof e === 'object' && !!ORIGENS[e.origem] && typeof e.descricao === 'string'
      && validarLancamento({ ...e, repeticao: 'unica' }).length === 0;
  }
  /**
   * cria as contas dos itens válidos (inválidos são descartados sem quebrar). Com pagoEm, a conta já entra quitada nessa data.
   * Cobrança entra no perfil Negócio; Pix e Recibo, no Pessoal. Devolve { importadas, descartadas, porOrigem: { pix: n, … } }.
   */
  function importarEntrada(db, lista) {
    const importadas = [], porOrigem = {};
    let descartadas = 0;
    for (const e of Array.isArray(lista) ? lista : []) {
      if (!entradaValida(e)) { descartadas++; continue; }
      const c = contaBase({
        tipo: e.tipo, descricao: e.descricao, valor: e.valor, vencimento: e.vencimento, contato: e.contato, forma: e.forma,
        obs: `Veio do ${ORIGENS[e.origem]}.`, perfil: e.origem === 'cobranca' ? 'negocio' : 'pessoal', categoriaId: ''
      });
      if (dataValida(e.pagoEm)) c.baixas.push({ id: novoId('b'), data: e.pagoEm, valor: c.valor, desconto: 0, juros: 0, criadoEm: agoraISO() });
      db.contas.push(c); importadas.push(c);
      porOrigem[e.origem] = (porOrigem[e.origem] || 0) + 1;
    }
    return { importadas, descartadas, porOrigem };
  }

  function acharConta(db, id) { return db.contas.find(c => c.id === id) || null; }

  /** baixa com ajustes. b: { valor (o que entrou/saiu), data, desconto, juros }. Lança Error com a explicação se não couber. */
  function darBaixa(db, id, b) {
    const c = acharConta(db, id);
    if (!c) throw new Error('Conta não encontrada.');
    const baixa = { id: novoId('b'), data: b.data, valor: Number(b.valor) || 0, desconto: Number(b.desconto) || 0, juros: Number(b.juros) || 0, criadoEm: agoraISO() };
    if (!dataValida(baixa.data)) throw new Error('Escolha a data do pagamento.');
    if ([baixa.valor, baixa.desconto, baixa.juros].some(v => !inteiro(v) || v < 0)) throw new Error('Os valores não podem ser negativos.');
    const ab = abatido(baixa), falta = restante(c);
    if (ab <= 0) throw new Error('Esta baixa não abate nada da conta. Confira o valor, o desconto e os juros.');
    if (ab > falta) throw new Error(`Esta baixa abate ${formatBRL(ab)}, mas só faltam ${formatBRL(falta)}. Se teve juros, coloque no campo de juros.`);
    c.baixas.push(baixa); c.atualizadoEm = agoraISO();
    return c;
  }
  /** baixa total em 1 toque: hoje, o valor que falta */
  function baixaTotal(db, id, ref = hoje()) {
    const c = acharConta(db, id);
    if (!c || quitada(c)) return c;
    return darBaixa(db, id, { valor: restante(c), data: ref, desconto: 0, juros: 0 });
  }
  /** desfaz todas as baixas (volta a ficar em aberto) */
  function reabrir(db, id) {
    const c = acharConta(db, id);
    if (c) { c.baixas = []; c.atualizadoEm = agoraISO(); }
    return c;
  }
  function removerBaixa(db, id, baixaId) {
    const c = acharConta(db, id);
    if (c) { c.baixas = c.baixas.filter(b => b.id !== baixaId); c.atualizadoEm = agoraISO(); }
    return c;
  }

  /** edita os dados de uma conta; com aplicarSerie e recorrência, muda o modelo e as próximas em aberto também */
  function editarConta(db, id, dados, { aplicarSerie = false } = {}) {
    const c = acharConta(db, id);
    if (!c) throw new Error('Conta não encontrada.');
    const erros = validarLancamento({ ...dados, repeticao: 'unica' });
    if (erros.length) throw Object.assign(new Error(erros[0].msg), { erros });
    if (dados.valor < totalAbatido(c)) throw new Error(`Esta conta já tem ${formatBRL(totalAbatido(c))} de baixa; o valor não pode ser menor que isso.`);
    const campos = ['tipo', 'descricao', 'valor', 'vencimento', 'categoriaId', 'contato', 'forma', 'obs', 'perfil'];
    const limpo = contaBase(dados);
    campos.forEach(k => { c[k] = limpo[k]; });
    // dívida com juros vale para o parcelamento inteiro
    if ('divida' in dados) (c.grupoId ? db.contas.filter(o => o.grupoId === c.grupoId) : [c]).forEach(o => { o.divida = limpo.divida; });
    c.atualizadoEm = agoraISO();
    if (aplicarSerie && c.recorrenciaId) {
      const rec = db.recorrencias.find(r => r.id === c.recorrenciaId);
      if (rec) {
        ['tipo', 'descricao', 'valor', 'categoriaId', 'contato', 'forma', 'obs', 'perfil'].forEach(k => { rec[k] = limpo[k]; });
        db.contas.filter(o => o.recorrenciaId === rec.id && o.id !== c.id && o.ocorrencia > c.ocorrencia && !o.baixas.length)
          .forEach(o => { ['tipo', 'descricao', 'valor', 'categoriaId', 'contato', 'forma', 'obs', 'perfil'].forEach(k => { o[k] = limpo[k]; }); o.atualizadoEm = agoraISO(); });
      }
    }
    return c;
  }

  /**
   * exclui. escopo 'esta' | 'proximas' (parcelas seguintes ainda sem baixa / encerra a recorrência a partir desta).
   * Devolve quantas contas saíram.
   */
  function excluir(db, id, escopo = 'esta') {
    const c = acharConta(db, id);
    if (!c) return 0;
    let sai = new Set([c.id]);
    if (c.modeloId && c.ocorrencia) {
      // a conta do mês saiu: o "Meu mês" não gera de novo neste mês
      const mod = (db.modelos || []).find(m => m.id === c.modeloId);
      if (mod && !mod.excluidos.includes(mesDe(c.ocorrencia))) mod.excluidos.push(mesDe(c.ocorrencia));
    }
    if (c.dividaId && c.ocorrencia) {
      // a parcela saiu: a dívida não gera de novo esta data
      const dv = (db.dividas || []).find(x => x.id === c.dividaId);
      if (dv && !dv.excluidas.includes(c.ocorrencia)) dv.excluidas.push(c.ocorrencia);
    }
    if (c.recorrenciaId) {
      const rec = db.recorrencias.find(r => r.id === c.recorrenciaId);
      if (rec && escopo === 'proximas') {
        rec.fim = addDias(c.ocorrencia, -1);
        db.contas.filter(o => o.recorrenciaId === rec.id && o.ocorrencia >= c.ocorrencia && !o.baixas.length).forEach(o => sai.add(o.id));
        // sem nenhuma ocorrência antes do fim, a recorrência não serve mais
        if (rec.fim < rec.inicio) db.recorrencias = db.recorrencias.filter(r => r !== rec);
      } else if (rec) {
        rec.excluidas.push(c.ocorrencia);
      }
    } else if (c.grupoId && c.parcela && escopo === 'proximas') {
      db.contas.filter(o => o.grupoId === c.grupoId && o.parcela && o.parcela.n >= c.parcela.n && !o.baixas.length).forEach(o => sai.add(o.id));
    }
    const antes = db.contas.length;
    db.contas = db.contas.filter(o => !sai.has(o.id));
    return antes - db.contas.length;
  }

  // ---------- leituras ----------
  function categoria(db, id) { return db.config.categorias.find(c => c.id === id) || null; }
  function nomeCategoria(db, id) { const c = categoria(db, id); return c ? c.nome : 'Sem categoria'; }
  const semAcento = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  /**
   * filtro da lista. f: { perfil, tipo: 'todas'|'pagar'|'receber', status: 'aberto'|'atrasadas'|'semana'|'pagas'|'todas', busca, categoriaId }
   * Ordena: em aberto por vencimento; pagas pela data da última baixa (mais recente primeiro).
   */
  function filtrar(db, f, ref = hoje()) {
    const q = semAcento(f.busca || '').trim();
    const lista = db.contas.filter(doPerfil(f.perfil || 'tudo')).filter(c => {
      if (f.tipo && f.tipo !== 'todas' && c.tipo !== f.tipo) return false;
      if (f.categoriaId && c.categoriaId !== f.categoriaId) return false;
      const st = status(c, ref).codigo;
      switch (f.status || 'aberto') {
        case 'aberto': if (st === 'paga') return false; break;
        case 'atrasadas': if (st === 'paga' || c.vencimento >= ref) return false; break;
        case 'semana': if (st === 'paga' || c.vencimento > addDias(ref, 7)) return false; break;
        case 'pagas': if (st !== 'paga') return false; break;
      }
      if (q) {
        const alvo = semAcento([c.descricao, c.contato, c.obs, nomeCategoria(db, c.categoriaId), c.forma].join(' '));
        if (!q.split(/\s+/).every(p => alvo.includes(p))) return false;
      }
      return true;
    });
    if (f.status === 'pagas') return lista.sort((a, b) => (ultimaBaixa(b).data).localeCompare(ultimaBaixa(a).data) || a.descricao.localeCompare(b.descricao));
    return lista.sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.tipo.localeCompare(b.tipo) || a.descricao.localeCompare(b.descricao));
  }

  function saldoInicial(db, perfil) {
    const si = db.config.saldoInicial;
    return perfil === 'tudo' ? si.pessoal + si.negocio : si[perfil] || 0;
  }
  /** saldo de hoje: saldo inicial + tudo que entrou − tudo que saiu (baixas até hoje) */
  function saldoAtual(db, perfil = 'tudo', ref = hoje()) {
    let s = saldoInicial(db, perfil);
    for (const c of db.contas.filter(doPerfil(perfil))) {
      for (const b of c.baixas) if (b.data <= ref) s += c.tipo === 'receber' ? b.valor : -b.valor;
    }
    return s;
  }

  /**
   * saldo dia a dia daqui a `dias` dias, se tudo for pago/recebido no vencimento.
   * O que já venceu e está em aberto entra hoje (ainda precisa sair/entrar).
   * Devolve { pontos: [{ data, saldo, entradas, saidas }], negativo: primeiro ponto < 0 ou null }
   */
  function serieFluxo(db, perfil = 'tudo', dias = HORIZONTE_DIAS, ref = hoje()) {
    const porDia = new Map();
    for (const c of db.contas.filter(doPerfil(perfil))) {
      const falta = restante(c);
      if (!falta) continue;
      const d = c.vencimento < ref ? ref : c.vencimento;
      if (diffDias(ref, d) > dias) continue;
      const m = porDia.get(d) || { entradas: 0, saidas: 0 };
      if (c.tipo === 'receber') m.entradas += falta; else m.saidas += falta;
      porDia.set(d, m);
    }
    // baixas com data futura (agendadas) também mexem no saldo no dia delas
    for (const c of db.contas.filter(doPerfil(perfil))) {
      for (const b of c.baixas) {
        if (b.data <= ref || diffDias(ref, b.data) > dias) continue;
        const m = porDia.get(b.data) || { entradas: 0, saidas: 0 };
        if (c.tipo === 'receber') m.entradas += b.valor; else m.saidas += b.valor;
        porDia.set(b.data, m);
      }
    }
    let saldo = saldoAtual(db, perfil, ref), negativo = null;
    const pontos = [];
    for (let i = 0; i <= dias; i++) {
      const data = addDias(ref, i), m = porDia.get(data) || { entradas: 0, saidas: 0 };
      saldo += m.entradas - m.saidas;
      const p = { data, saldo, entradas: m.entradas, saidas: m.saidas };
      pontos.push(p);
      if (!negativo && saldo < 0) negativo = p;
    }
    return { pontos, negativo };
  }
  /** resumo de previsão em N dias: { saldo, entradas, saidas } */
  function previsao(db, perfil, dias, ref = hoje()) {
    const { pontos } = serieFluxo(db, perfil, dias, ref);
    return pontos.reduce((r, p) => ({ saldo: p.saldo, entradas: r.entradas + p.entradas, saidas: r.saidas + p.saidas }), { saldo: 0, entradas: 0, saidas: 0 });
  }
  /** contas em aberto em ordem de vencimento até ref + dias (com as atrasadas), para a lista de movimentos previstos */
  function proximas(db, perfil, dias, ref = hoje()) {
    const ate = addDias(ref, dias);
    return db.contas.filter(doPerfil(perfil)).filter(c => !quitada(c) && c.vencimento <= ate)
      .sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.descricao.localeCompare(b.descricao));
  }

  /**
   * resumo do mês 'aaaa-mm' (pelo dia em que o dinheiro entrou/saiu):
   * { recebido, pago, resultado, porCategoria: [{ id, nome, valor }], aPagar, aReceber (em aberto com vencimento no mês) }
   */
  function resumoMes(db, perfil, ym) {
    let recebido = 0, pago = 0, aPagar = 0, aReceber = 0;
    const cats = new Map();
    for (const c of db.contas.filter(doPerfil(perfil))) {
      for (const b of c.baixas) {
        if (mesDe(b.data) !== ym) continue;
        if (c.tipo === 'receber') recebido += b.valor;
        else { pago += b.valor; cats.set(c.categoriaId, (cats.get(c.categoriaId) || 0) + b.valor); }
      }
      if (mesDe(c.vencimento) === ym && !quitada(c)) { if (c.tipo === 'receber') aReceber += restante(c); else aPagar += restante(c); }
    }
    const porCategoria = [...cats].map(([id, valor]) => ({ id, nome: nomeCategoria(db, id), valor })).sort((a, b) => b.valor - a.valor);
    return { recebido, pago, resultado: recebido - pago, porCategoria, aPagar, aReceber };
  }

  const NOME_PERFIL = { tudo: 'Pessoal + Negócio', pessoal: 'Pessoal', negocio: 'Negócio' };

  /**
   * "Saúde financeira" de 0 a 100 (o anel do Início). Indicador do próprio Warden, sem relação com birôs de crédito.
   * Só pesa o que já aconteceu: anotar uma conta futura nunca baixa o indicador. Pesos fixos:
   *   contas em dia 30 (−10 por conta atrasada) · mês no azul até agora 30 (recebido − pago no mês, até hoje) ·
   *   saldo de hoje positivo 20 · caixa cobre um mês de gastos 20 (proporcional à média de pagamentos dos meses
   *   anteriores que existem de fato, até 3; sem nenhum mês completo para comparar, fica neutro: não tira pontos).
   * Sem dados suficientes (nenhuma conta ou nenhum dinheiro que já entrou/saiu): { suficiente: false }.
   * Senão: { suficiente: true, pontos, rotulo, itens: [{ id, texto, estado: 'ok'|'nao'|'neutro', pontos }] }
   */
  function saudeFinanceira(db, perfil = 'tudo', ref = hoje()) {
    const contas = db.contas.filter(doPerfil(perfil));
    const baixas = contas.flatMap(c => c.baixas.filter(b => b.data <= ref).map(b => ({ ...b, tipo: c.tipo })));
    if (!contas.length || !baixas.length) return { suficiente: false };
    const ym = mesDe(ref);
    const atrasadas = contas.filter(c => !quitada(c) && c.vencimento < ref).length;
    const resultado = baixas.filter(b => mesDe(b.data) === ym).reduce((s, b) => s + (b.tipo === 'receber' ? b.valor : -b.valor), 0);
    const saldo = saldoAtual(db, perfil, ref);
    // meses anteriores (até 3) a partir do primeiro mês em que o dinheiro mexeu; um mês sem pagamento entra como zero
    const primeiro = baixas.reduce((m, b) => (mesDe(b.data) < m ? mesDe(b.data) : m), ym);
    const meses = [1, 2, 3].map(k => addMesYM(ym, -k)).filter(m => m >= primeiro);
    const pagos = meses.map(m => baixas.filter(b => b.tipo === 'pagar' && mesDe(b.data) === m).reduce((s, b) => s + b.valor, 0));
    const media = meses.length ? pagos.reduce((s, v) => s + v, 0) / meses.length : 0;
    let folga;
    if (!meses.length) folga = { id: 'folga', texto: 'Caixa x gastos: ainda falta um mês completo para comparar', estado: 'neutro', pontos: 20 };
    else {
      const fonte = `média de ${meses.length} ${meses.length === 1 ? 'mês' : 'meses'}`;
      const p = media > 0 ? Math.round(20 * Math.max(0, Math.min(1, saldo / media))) : (saldo >= 0 ? 20 : 0);
      folga = { id: 'folga', texto: `Caixa cobre um mês de gastos (${fonte})`, estado: p === 20 ? 'ok' : 'nao', pontos: p, meses: meses.length, media: Math.round(media) };
    }
    const itens = [
      { id: 'em-dia', texto: 'Contas em dia', estado: atrasadas ? 'nao' : 'ok', pontos: Math.max(0, 30 - atrasadas * 10) },
      { id: 'resultado', texto: 'Mês no azul até agora', estado: resultado >= 0 ? 'ok' : 'nao', pontos: resultado >= 0 ? 30 : 0 },
      { id: 'saldo', texto: 'Saldo de hoje positivo', estado: saldo >= 0 ? 'ok' : 'nao', pontos: saldo >= 0 ? 20 : 0 },
      folga
    ];
    const pontos = itens.reduce((s, i) => s + i.pontos, 0);
    return { suficiente: true, pontos, rotulo: pontos >= 80 ? 'Ótima' : pontos >= 60 ? 'Boa' : pontos >= 40 ? 'Pede atenção' : 'Apertada', itens };
  }

  /**
   * tudo o que o relatório mensal mostra (tela, PDF, imagem e texto):
   * números do mês 'aaaa-mm' (pela data da baixa) + saldo de hoje, saldo no fim do mês e próximas contas (30 dias a partir de hoje).
   * fimMes: { data, saldo, previsto } — previsto = true se o fim do mês ainda não chegou (fluxo de caixa); null além do horizonte.
   */
  function dadosRelatorio(db, perfil = 'tudo', ym = mesDe(hoje()), ref = hoje()) {
    const res = resumoMes(db, perfil, ym), fim = fimDoMes(ym + '-01');
    let fimMes = null;
    if (fim < ref) fimMes = { data: fim, saldo: saldoAtual(db, perfil, fim), previsto: false };
    else if (diffDias(ref, fim) <= HORIZONTE_DIAS) {
      const { pontos } = serieFluxo(db, perfil, diffDias(ref, fim), ref);
      fimMes = { data: fim, saldo: pontos[pontos.length - 1].saldo, previsto: true };
    }
    const prox = proximas(db, perfil, 30, ref).map(c => ({
      id: c.id, tipo: c.tipo, descricao: c.descricao, valor: restante(c), vencimento: c.vencimento, atrasada: c.vencimento < ref
    }));
    return { ym, perfil, ref, ...res, saldoHoje: saldoAtual(db, perfil, ref), fimMes, proximas: prox };
  }

  /** texto pronto (WhatsApp / copiar), com *negrito* do WhatsApp */
  function textoRelatorio(d, { maxProximas = 10 } = {}) {
    const L = [`*Relatório de ${nomeMes(d.ym)}*`, `Warden Control · ${NOME_PERFIL[d.perfil]}`, '',
      `Recebido: ${formatBRL(d.recebido)}`, `Pago: ${formatBRL(d.pago)}`, `Resultado: ${formatBRL(d.resultado, { sinal: true })}`, '',
      `Saldo de hoje (${dataBR(d.ref)}): ${formatBRL(d.saldoHoje)}`];
    if (d.fimMes) L.push(`${d.fimMes.previsto ? 'Previsto' : 'Saldo'} em ${dataBR(d.fimMes.data)}: ${formatBRL(d.fimMes.saldo)}`);
    if (d.porCategoria.length) {
      L.push('', '*Onde mais gastou*');
      d.porCategoria.slice(0, 5).forEach((c, i) => L.push(`${i + 1}. ${c.nome}: ${formatBRL(c.valor)}`));
    }
    L.push('', '*Próximas contas (30 dias)*');
    if (!d.proximas.length) L.push('Nada vencendo nos próximos 30 dias.');
    d.proximas.slice(0, maxProximas).forEach(c => L.push(
      `${dataBR(c.vencimento).slice(0, 5)} ${c.descricao}: ${c.tipo === 'receber' ? '+' : '−'} ${formatBRL(c.valor)}${c.atrasada ? ' (atrasada)' : ''}`));
    if (d.proximas.length > maxProximas) L.push(`e mais ${d.proximas.length - maxProximas}`);
    L.push('', 'Gerado com Warden · wardenfinance.com.br');
    return L.join('\n');
  }

  /** CSV (separador ; e vírgula decimal, como o Excel em português) */
  function csv(db, perfil = 'tudo', ref = hoje()) {
    const q = v => { const s = String(v == null ? '' : v); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const cab = ['Tipo', 'Descrição', 'Valor', 'Vencimento', 'Status', 'Pago/recebido', 'Restante', 'Última baixa', 'Categoria', 'Perfil', 'Contato', 'Forma de pagamento', 'Parcela', 'Observação'];
    const linhas = db.contas.filter(doPerfil(perfil)).sort((a, b) => a.vencimento.localeCompare(b.vencimento)).map(c => {
      const u = ultimaBaixa(c);
      return [c.tipo === 'receber' ? 'A receber' : 'A pagar', c.descricao, centavosTexto(c.valor), dataBR(c.vencimento), rotuloStatus(c, ref),
        centavosTexto(totalMovido(c)), centavosTexto(restante(c)), u ? dataBR(u.data) : '', nomeCategoria(db, c.categoriaId),
        PERFIS[c.perfil], c.contato, c.forma, c.parcela ? `${c.parcela.n}/${c.parcela.total}` : '', c.obs].map(q).join(';');
    });
    return '﻿' + [cab.join(';'), ...linhas].join('\r\n');
  }

  // ---------- plano (DEMONSTRAÇÃO LOCAL) ----------
  // TODO (Etapa 2 do projeto): o plano de verdade vem do servidor, liberado só por webhook verificado da Kiwify.
  // Hoje config.plano é só uma demonstração neste aparelho: { tipo: 'gratis'|'pro', testeInicio: 'aaaa-mm-dd'|null }.
  const DIAS_TESTE = 7;
  const RECURSOS = {
    // consultasPro: as consultas do Orientador marcadas como 'pro' (no grátis, só a da parcela)
    // dividas: a área Dívidas (no grátis, vitrine; o que já foi cadastrado no teste continua gerando as parcelas)
    gratis: { lancamentosMes: 30, perfis: 1, whatsapp: false, dicasDia: 1, csv: false, backup: true, consultasPro: false, dividas: false },
    pro: { lancamentosMes: Infinity, perfis: 2, whatsapp: true, dicasDia: Infinity, csv: true, backup: true, consultasPro: true, dividas: true }
  };
  function limparPlano(p) {
    p = p || {};
    return { tipo: p.tipo === 'pro' ? 'pro' : 'gratis', testeInicio: dataValida(p.testeInicio) ? p.testeInicio : null };
  }
  /** { codigo: 'gratis'|'teste'|'pro', diasRestantes, testeUsado, testeFim (último dia do teste), recursos } */
  function planoAtual(db, ref = hoje()) {
    const p = limparPlano(db.config.plano);
    let codigo = p.tipo === 'pro' ? 'pro' : 'gratis', diasRestantes = 0;
    if (codigo === 'gratis' && p.testeInicio) {
      const n = diffDias(p.testeInicio, ref);
      if (n >= 0 && n < DIAS_TESTE) { codigo = 'teste'; diasRestantes = DIAS_TESTE - n; }
    }
    return {
      codigo, diasRestantes, testeUsado: !!p.testeInicio, testeFim: p.testeInicio ? addDias(p.testeInicio, DIAS_TESTE - 1) : null,
      recursos: RECURSOS[codigo === 'gratis' ? 'gratis' : 'pro']
    };
  }
  function diaDe(iso) { const d = new Date(iso); return isNaN(d) ? null : hoje(d); }
  /**
   * lançamentos que a pessoa criou no mês 'aaaa-mm' (pela criadoEm, no fuso de SP), para o limite do grátis:
   * um parcelamento conta 1 (grupoId); contas geradas por recorrência, pelo "Meu mês" e pelas Dívidas não contam, mas criar a recorrência conta 1.
   */
  function lancamentosNoMes(db, ym = mesDe(hoje())) {
    const grupos = new Set();
    let n = 0;
    for (const c of db.contas) {
      if (c.modeloId || c.recorrenciaId || c.dividaId) continue;
      const d = diaDe(c.criadoEm);
      if (!d || mesDe(d) !== ym) continue;
      if (c.grupoId) { if (grupos.has(c.grupoId)) continue; grupos.add(c.grupoId); }
      n++;
    }
    for (const r of db.recorrencias) { const d = diaDe(r.criadoEm); if (d && mesDe(d) === ym) n++; }
    return n;
  }
  /** cabe mais um lançamento no plano de hoje? */
  function podeLancar(db, ref = hoje()) { return lancamentosNoMes(db, mesDe(ref)) < planoAtual(db, ref).recursos.lancamentosMes; }

  function backup(db) { return { app: 'warden-control', versao: VERSAO, exportadoEm: agoraISO(), dados: db }; }

  window.ControlNucleo = {
    CHAVE, VERSAO, FUSO, HORIZONTE_DIAS, FORMAS, PERFIS, NOME_PERFIL, CATEGORIAS_PADRAO, MESES,
    hoje, horaSP, addDias, addMeses, addMesYM, diffDias, mesDe, fimDoMes, dataValida, dataBR, dataCurta, nomeMes, rotuloDia, diaSemana,
    parseCentavos, formatBRL, centavosTexto, repartir, novoId, semAcento,
    dbVazio, migrar, carregar, salvar, backup,
    abatido, totalAbatido, totalMovido, restante, quitada, ultimaBaixa, status, rotuloStatus,
    validarLancamento, criarLancamento, gerarRecorrencias, acharConta,
    validarModelo, criarModelo, editarModelo, excluirModelo, gerarMes, contasMes, ajustarValor,
    validarDivida, criarDivida, editarDivida, excluirDivida, quitarDivida, gerarDividas, devidoHoje, parcelasFaltam, dadosDeConta, contasParaDivida,
    infoDivida, resumoDividas, pagandoNormal, formatPct,
    CHAVE_ENTRADA, ORIGENS, entradaValida, importarEntrada, limparDivida, parseTaxa, formatTaxa, darBaixa, baixaTotal, reabrir, removerBaixa, editarConta, excluir,
    categoria, nomeCategoria, filtrar, saldoInicial, saldoAtual, serieFluxo, previsao, proximas, resumoMes, dadosRelatorio, textoRelatorio, saudeFinanceira, csv,
    DIAS_TESTE, RECURSOS, planoAtual, lancamentosNoMes, podeLancar
  };
})();
