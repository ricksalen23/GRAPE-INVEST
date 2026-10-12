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
    ['fornecedores', 'Fornecedores', 'pagar', 'caixa'], ['outros-pagar', 'Outros gastos', 'pagar', 'ponto'],
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
        perfil: 'tudo', primeirosPassosOcultos: false,
        categorias: CATEGORIAS_PADRAO.map(c => ({ ...c }))
      },
      contas: [], recorrencias: []
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
        categorias: cats.length ? cats : base.config.categorias
      },
      contas: d.contas.map(limparConta).filter(Boolean),
      recorrencias: Array.isArray(d.recorrencias) ? d.recorrencias.map(limparRecorrencia).filter(Boolean) : []
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
      grupoId: null, parcela: null, recorrenciaId: null, ocorrencia: null, modeloId: null, baixas: [], criadoEm: t, atualizadoEm: t
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

  function backup(db) { return { app: 'warden-control', versao: VERSAO, exportadoEm: agoraISO(), dados: db }; }

  window.ControlNucleo = {
    CHAVE, VERSAO, FUSO, HORIZONTE_DIAS, FORMAS, PERFIS, CATEGORIAS_PADRAO, MESES,
    hoje, horaSP, addDias, addMeses, addMesYM, diffDias, mesDe, fimDoMes, dataValida, dataBR, dataCurta, nomeMes, rotuloDia, diaSemana,
    parseCentavos, formatBRL, centavosTexto, repartir, novoId, semAcento,
    dbVazio, migrar, carregar, salvar, backup,
    abatido, totalAbatido, totalMovido, restante, quitada, ultimaBaixa, status, rotuloStatus,
    validarLancamento, criarLancamento, gerarRecorrencias, acharConta, darBaixa, baixaTotal, reabrir, removerBaixa, editarConta, excluir,
    categoria, nomeCategoria, filtrar, saldoInicial, saldoAtual, serieFluxo, previsao, proximas, resumoMes, csv
  };
})();
