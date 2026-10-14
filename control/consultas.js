/*
 * WARDEN CONTROL — Consultas do Orientador: análises com os números do PRÓPRIO usuário (não é calculadora genérica;
 * isso é das ferramentas). Determinísticas, sem IA, sem tela. Exposto em window.ControlConsultas.
 *
 * Cada consulta tem duas partes:
 *   calcular… (db, perfil, ref, entrada) → { id, suficiente, situacao: 'folga'|'limite'|'vermelho', numeros, faltas }
 *   redigir(resultado) → acrescenta { paragrafos, risco, decisao, aviso, links } com texto fixo a partir dos números.
 * Regra de tom: nunca mandar (nada de "faça", "não faça", "vale a pena"); sempre o que os números mostram + o risco +
 * "A decisão é sua.", em linguagem simples. Faltou dado: diz o que falta e como anotar, sem chutar.
 */
(function () {
  'use strict';
  const N = window.ControlNucleo;
  const brl = (c, o) => N.formatBRL(c, o);
  const dm = iso => N.dataBR(iso).slice(0, 5);
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const doPerfil = perfil => c => perfil === 'tudo' || c.perfil === perfil;

  const AVISO = 'Isto é uma análise dos seus próprios números, não é recomendação de investimento nem consultoria financeira.';
  const DECISAO = 'A decisão é sua.';
  const SITUACAO = { folga: 'Com folga', limite: 'No limite', vermelho: 'No vermelho' };

  const FALTA = {
    contas: { texto: 'Ainda não há contas anotadas para analisar.', comoAnotar: 'Para isso, é só anotar o que você recebe e o que paga no mês (botão "Novo lançamento") e marcar como pago ou recebido quando o dinheiro mexer.' },
    mes: { texto: 'Falta um mês completo com o que entrou e o que saiu para saber quanto costuma sobrar por mês.', comoAnotar: 'Anotando os recebimentos e os pagamentos deste mês e marcando cada um quando acontecer, no começo do mês que vem a conta já sai.' },
    saldo: { texto: 'Falta saber quanto você tem hoje.', comoAnotar: 'Em Ajustes, informe o saldo inicial (o que tem no banco e em dinheiro) e anote o que ainda vence este mês.' },
    dividas: { texto: 'Não há contas atrasadas nem contas marcadas como dívida.', comoAnotar: 'Se você tem cartão, empréstimo ou financiamento, anote como conta a pagar e marque "É uma dívida com juros" em "Mais detalhes", com os juros ao mês se souber.' },
    renda: { texto: 'Falta a sua renda mensal para saber quanto sobra depois das parcelas.', comoAnotar: 'Em Dívidas, toque em "Informar renda mensal" e coloque quanto entra por mês (salário, vendas e outras entradas).' },
    taxa: nome => ({ texto: `Falta a taxa de juros de "${nome}".`, comoAnotar: 'Ela aparece na fatura ou no contrato como "juros ao mês", "taxa de juros mensal" ou "CET mensal" (no cartão, fica perto do valor do rotativo e do parcelamento da fatura). Abra a conta, toque em "Editar" e preencha "Juros ao mês".' })
  };

  // ---------- bases comuns ----------
  /** sobra média por mês (recebido − pago, pela data em que o dinheiro mexeu) nos meses completos anteriores que existem (até 3) */
  function sobraMedia(db, perfil, ref) {
    const baixas = db.contas.filter(doPerfil(perfil))
      .flatMap(c => c.baixas.filter(b => b.data <= ref).map(b => ({ mes: N.mesDe(b.data), v: c.tipo === 'receber' ? b.valor : -b.valor })));
    if (!baixas.length) return null;
    const ym = N.mesDe(ref), primeiro = baixas.reduce((m, b) => (b.mes < m ? b.mes : m), ym);
    const meses = [1, 2, 3].map(k => N.addMesYM(ym, -k)).filter(m => m >= primeiro);
    if (!meses.length) return null;
    const soma = baixas.filter(b => meses.includes(b.mes)).reduce((s, b) => s + b.v, 0);
    return { valor: Math.round(soma / meses.length), meses: meses.length };
  }
  const menorPonto = pontos => pontos.reduce((m, p) => (p.saldo < m.saldo ? p : m), pontos[0]);
  const temContas = (db, perfil) => db.contas.some(doPerfil(perfil));

  /**
   * dívidas: as cadastradas em Dívidas (pelo que falta hoje) + contas a pagar em aberto marcadas como dívida + as atrasadas;
   * parcelas do mesmo parcelamento viram uma só. As parcelas geradas pelas Dívidas já estão no cadastro.
   */
  function listaDividas(db, perfil, ref) {
    const grupos = new Map();
    for (const x of N.resumoDividas(db, perfil, ref).lista) {
      grupos.set('dv:' + x.id, { id: 'dv:' + x.id, nome: x.credor, total: x.devido, taxa: x.taxa, divida: true, atrasada: false, contas: 0 });
    }
    for (const c of db.contas.filter(doPerfil(perfil))) {
      if (c.tipo !== 'pagar' || c.dividaId || N.quitada(c) || !(c.divida || c.vencimento < ref)) continue;
      const chave = c.grupoId || c.id;
      const g = grupos.get(chave) || { id: chave, nome: c.descricao, total: 0, taxa: null, divida: false, atrasada: false, contas: 0 };
      g.total += N.restante(c); g.contas++;
      if (c.divida) { g.divida = true; if (c.divida.taxa != null) g.taxa = Math.max(g.taxa || 0, c.divida.taxa); }
      if (c.vencimento < ref) g.atrasada = true;
      grupos.set(chave, g);
    }
    return [...grupos.values()].sort((a, b) => (b.taxa ?? -1) - (a.taxa ?? -1) || b.total - a.total);
  }

  // ---------- 1) "Essa parcela cabe no meu bolso?" ----------
  function calcularParcela(db, perfil, ref, { valor, parcelas, primeira } = {}) {
    const base = { id: 'parcela', entrada: { valor, parcelas } };
    if (!Number.isSafeInteger(valor) || valor <= 0 || !Number.isInteger(parcelas) || parcelas < 1 || parcelas > 120) return { ...base, erro: 'Informe o valor da parcela e quantas parcelas são (de 1 a 120).' };
    const sobra = sobraMedia(db, perfil, ref);
    if (!temContas(db, perfil) || !sobra) return { ...base, suficiente: false, faltas: temContas(db, perfil) ? [FALTA.mes] : [FALTA.contas, FALTA.mes] };
    const inicio = primeira && N.dataValida(primeira) ? primeira : N.addMeses(ref, 1);
    const extras = Array.from({ length: parcelas }, (_, i) => ({
      id: 'simulada' + i, tipo: 'pagar', valor, vencimento: N.addMeses(inicio, i, Number(inicio.slice(8))), perfil: perfil === 'tudo' ? 'pessoal' : perfil, baixas: []
    }));
    const sem = N.serieFluxo(db, perfil, 90, ref).pontos, com = N.serieFluxo({ ...db, contas: [...db.contas, ...extras] }, perfil, 90, ref).pontos;
    const menor = menorPonto(com);
    const pctSobra = sobra.valor > 0 ? Math.round(valor / sobra.valor * 100) : null;
    const situacao = menor.saldo < 0 || sobra.valor <= 0 || pctSobra > 100 ? 'vermelho' : pctSobra > 50 || menor.saldo < valor ? 'limite' : 'folga';
    return { ...base, suficiente: true, situacao, faltas: [], numeros: {
      valor, parcelas, total: valor * parcelas, primeira: inicio, sobraMedia: sobra.valor, mesesSobra: sobra.meses, pctSobra,
      saldos: [30, 60, 90].map(d => ({ dias: d, data: com[d].data, sem: sem[d].saldo, com: com[d].saldo })),
      menorSaldo: menor.saldo, menorData: menor.data
    } };
  }
  function redigirParcela(r) {
    const n = r.numeros, p = [];
    p.push(`${plural(n.parcelas, 'parcela', 'parcelas')} de ${brl(n.valor)} ${n.parcelas === 1 ? 'é' : 'somam'} ${brl(n.total)}, com a primeira em ${dm(n.primeira)}.`);
    const meses = plural(n.mesesSobra, 'mês', 'meses');
    p.push(n.sobraMedia > 0
      ? `Nos últimos ${meses}, sobraram em média ${brl(n.sobraMedia)} por mês. A parcela ocuparia ${n.pctSobra}% dessa sobra.`
      : `Nos últimos ${meses}, saiu mais do que entrou: em média ${brl(-n.sobraMedia)} a menos por mês. Uma parcela nova somaria a essa diferença.`);
    const [a, b, c] = n.saldos;
    p.push(`Com ela, o saldo previsto fica em ${brl(a.com)} em 30 dias, ${brl(b.com)} em 60 e ${brl(c.com)} em 90 (sem ela: ${brl(a.sem)}, ${brl(b.sem)} e ${brl(c.sem)}).`);
    p.push(`O momento mais apertado seria em ${dm(n.menorData)}, com ${brl(n.menorSaldo)} de saldo. ${n.menorSaldo >= 0 ? `Nesse ponto, a folga seria de ${brl(n.menorSaldo)}.` : `Nesse ponto, faltariam ${brl(-n.menorSaldo)}.`}`);
    const risco = {
      folga: 'O risco: imprevistos e gastos que ainda não estão anotados comem essa folga ao longo das parcelas.',
      limite: 'O risco: a folga fica curta; um gasto fora do previsto pode fazer faltar dinheiro em algum mês.',
      vermelho: 'O risco: pelos números de hoje, o saldo ficaria negativo, o que costuma levar a cheque especial ou atraso de contas, que têm juros altos.'
    }[r.situacao];
    return { paragrafos: p, risco, links: [] };
  }

  // ---------- 2) "Como saio das dívidas?" ----------
  /** juros ao mês sobre o que falta e toda a sobra indo para as dívidas, na ordem dada. meses null = não termina em 50 anos */
  function simularQuitacao(ordem, sobra) {
    const saldos = ordem.map(d => d.total), taxas = ordem.map(d => (d.taxa || 0) / 10000), quitadaEm = ordem.map(() => null);
    let mes = 0, pago = 0;
    while (saldos.some(s => s > 0) && mes < 600) {
      mes++;
      for (let i = 0; i < saldos.length; i++) if (saldos[i] > 0) saldos[i] = Math.round(saldos[i] * (1 + taxas[i]));
      let resto = sobra;
      for (let i = 0; i < saldos.length && resto > 0; i++) {
        if (saldos[i] <= 0) continue;
        const v = Math.min(resto, saldos[i]);
        saldos[i] -= v; resto -= v; pago += v;
        if (!saldos[i]) quitadaEm[i] = mes;
      }
    }
    const termina = !saldos.some(s => s > 0), original = ordem.reduce((s, d) => s + d.total, 0);
    const primeira = quitadaEm.map((m, i) => ({ nome: ordem[i].nome, mes: m })).filter(x => x.mes != null).sort((a, b) => a.mes - b.mes)[0] || null;
    return { ordem: ordem.map(d => d.nome), meses: termina ? mes : null, totalPago: termina ? pago : null, juros: termina ? pago - original : null, primeira };
  }
  function calcularDividas(db, perfil, ref) {
    const base = { id: 'dividas' };
    // com dívidas cadastradas na área Dívidas, a consulta usa o cadastro (parcelas, prazos e propostas de desconto)
    if (N.resumoDividas(db, perfil, ref).lista.length) return calcularDividasCadastradas(db, perfil, ref);
    const lista = listaDividas(db, perfil, ref);
    if (!lista.length) return { ...base, suficiente: false, faltas: [FALTA.dividas] };
    const sobra = sobraMedia(db, perfil, ref);
    const total = lista.reduce((s, d) => s + d.total, 0);
    const numeros = { dividas: lista, total, atrasadas: lista.filter(d => d.atrasada).length, semTaxa: lista.filter(d => d.taxa == null).length,
      sobraMedia: sobra ? sobra.valor : null, mesesSobra: sobra ? sobra.meses : 0, caminhos: null };
    if (!sobra) return { ...base, suficiente: false, faltas: [FALTA.mes], numeros };
    if (sobra.valor > 0) {
      const porCusto = [...lista].sort((a, b) => (b.taxa ?? -1) - (a.taxa ?? -1) || b.total - a.total);
      const porTamanho = [...lista].sort((a, b) => a.total - b.total);
      numeros.caminhos = { custo: simularQuitacao(porCusto, sobra.valor), menores: simularQuitacao(porTamanho, sobra.valor) };
    }
    const c = numeros.caminhos;
    const situacao = !c || c.custo.meses == null ? 'vermelho' : c.custo.meses > 24 ? 'limite' : 'folga';
    return { ...base, suficiente: true, situacao, faltas: [], numeros };
  }
  /**
   * com o cadastro de Dívidas: pagando normal (quanto tempo e quanto custa) e, usando a sobra do mês para juntar e quitar
   * UMA dívida à vista, quanto cada escolha economiza (contra as parcelas que faltam) e em quantos meses dá para juntar.
   * Sobra = renda informada − parcelas; sem renda, a sobra média dos meses anteriores; sem nenhuma, falta dado.
   */
  function calcularDividasCadastradas(db, perfil, ref) {
    const base = { id: 'dividas' }, res = N.resumoDividas(db, perfil, ref), lista = res.lista;
    let sobra = null, fonteSobra = null, mesesSobra = 0;
    if (res.sobra != null) { sobra = res.sobra; fonteSobra = 'renda'; }
    else { const h = sobraMedia(db, perfil, ref); if (h) { sobra = h.valor; fonteSobra = 'historico'; mesesSobra = h.meses; } }
    const semFim = lista.filter(x => x.normal.semFim).map(x => x.credor);
    const normal = {
      meses: semFim.length ? null : lista.reduce((m, x) => Math.max(m, x.normal.meses || 0), 0),
      custo: semFim.length ? null : lista.reduce((s, x) => s + x.normal.custo, 0),
      semFim, avista: lista.filter(x => x.normal.avista).map(x => ({ nome: x.credor, valor: x.devido }))
    };
    // dá para quitar à vista: as que têm proposta válida e as que não têm parcela (o valor cheio)
    const opcoes = lista.filter(x => (x.proposta && !x.proposta.vencida) || !x.parcela).map(x => {
      const economia = x.normal.custo != null ? x.normal.custo - x.vista : null;
      const mesesJuntar = sobra > 0 ? Math.ceil(x.vista / sobra) : null;
      const validade = x.proposta && !x.proposta.vencida ? x.proposta.validade : null;
      return {
        id: x.id, nome: x.credor, vista: x.vista, proposta: !!(x.proposta && !x.proposta.vencida), validade, economia,
        pct: economia != null && x.normal.custo ? Math.round(economia * 1000 / x.normal.custo) / 10 : null, mesesJuntar, libera: x.parcela || 0,
        venceAntes: !!(validade && mesesJuntar != null && N.addMeses(ref, mesesJuntar) > validade)
      };
    }).sort((a, b) => (b.economia ?? -1) - (a.economia ?? -1) || (a.mesesJuntar ?? 1e9) - (b.mesesJuntar ?? 1e9));
    const melhor = opcoes.find(o => o.economia > 0) || null;
    const numeros = { modo: 'cadastradas', dividas: lista.length, total: res.totalDevido, compromisso: res.compromisso, renda: res.renda,
      sobra, fonteSobra, mesesSobra, normal, opcoes, melhor };
    if (sobra == null) return { ...base, suficiente: false, faltas: [FALTA.renda], numeros };
    const situacao = sobra <= 0 || semFim.length ? 'vermelho' : normal.meses > 24 ? 'limite' : 'folga';
    return { ...base, suficiente: true, situacao, faltas: [], numeros,
      rotulos: { folga: 'Prazo curto', limite: 'Prazo longo', vermelho: 'Sem folga para as dívidas' } };
  }
  function redigirDividasCadastradas(r) {
    const n = r.numeros, p = [], nm = x => `"${x}"`;
    p.push(`Você tem ${plural(n.dividas, 'dívida', 'dívidas')} em aberto, somando ${brl(n.total)}.${n.compromisso ? ` As parcelas somam ${brl(n.compromisso)} por mês.` : ''}`);
    const avista = n.normal.avista.length ? ` ${n.normal.avista.map(a => `${nm(a.nome)} não tem parcelas: são ${brl(a.valor)} à vista, sem data marcada`).join('; ')}.` : '';
    if (n.normal.semFim.length) p.push(`Pagando normal, ${n.normal.semFim.map(nm).join(', ')} não ${n.normal.semFim.length === 1 ? 'termina' : 'terminam'}: os juros de cada mês são maiores que a parcela.${avista}`);
    else if (n.normal.meses) p.push(`Pagando normal, a última parcela sai daqui a ${plural(n.normal.meses, 'mês', 'meses')} e o custo total fica em ${brl(n.normal.custo)}.${avista}`);
    else p.push(`Nenhuma delas tem parcelas: o total à vista é ${brl(n.normal.custo)}.${avista}`);
    if (n.fonteSobra === 'renda') p.push(n.sobra > 0 ? `Com a renda de ${brl(n.renda)}, sobram ${brl(n.sobra)} por mês depois das parcelas.`
      : `A renda de ${brl(n.renda)} não cobre as parcelas: faltam ${brl(-n.sobra)} por mês.`);
    else p.push(n.sobra > 0 ? `Nos últimos ${plural(n.mesesSobra, 'mês', 'meses')}, sobraram em média ${brl(n.sobra)} por mês. A renda mensal não foi informada em Dívidas, então a conta usa essa média.`
      : `Nos últimos ${plural(n.mesesSobra, 'mês', 'meses')}, saiu mais do que entrou: em média ${brl(-n.sobra)} a menos por mês.`);
    if (n.sobra > 0 && n.opcoes.length) {
      p.push('Usando essa sobra para juntar e quitar uma dívida à vista:');
      n.opcoes.forEach(o => {
        const de = o.proposta ? ` (proposta${o.validade ? ` até ${dm(o.validade)}` : ' sem validade anotada'})` : ' (sem desconto)';
        const eco = o.economia == null ? 'Pagando só a parcela, ela não termina, então a economia não dá para medir.'
          : o.economia > 0 ? `Economiza ${brl(o.economia)} (${N.formatPct(o.pct)}) em relação a pagar as parcelas até o fim.` : 'Não tem desconto: o valor é o mesmo.';
        p.push(`${nm(o.nome)}: à vista por ${brl(o.vista)}${de}. ${eco} Juntando a sobra, leva ${plural(o.mesesJuntar, 'mês', 'meses')}${o.libera ? `; depois, libera ${brl(o.libera)} por mês` : ''}.${o.venceAntes ? ` A proposta vale até ${dm(o.validade)}, antes de dar para juntar esse valor.` : ''}`);
      });
      p.push(n.melhor ? `Pelos números, a escolha que mais economiza é ${nm(n.melhor.nome)}: ${brl(n.melhor.economia)} a menos.` : 'Pelos números, nenhuma das opções à vista tem desconto.');
      p.push('Conta simplificada: a sobra guardada todo mês, sem rendimento, as parcelas pagas em dia enquanto isso e a proposta pelo mesmo valor até lá.');
    } else if (n.sobra > 0) {
      p.push('Nenhuma dívida tem proposta de quitação registrada. Em Dívidas, dá para anotar o valor à vista e a validade de cada proposta para comparar.');
    }
    const risco = r.situacao === 'vermelho'
      ? 'O risco: sem sobra depois das parcelas, qualquer imprevisto vira atraso, e atraso soma multa e juros.'
      : 'O risco: proposta de desconto tem prazo e pode mudar até você juntar o valor; e guardar toda a sobra deixa pouco espaço para imprevistos.';
    return { paragrafos: p, risco, links: [] };
  }
  function redigirDividas(r) {
    if (r.numeros.modo === 'cadastradas') return redigirDividasCadastradas(r);
    const n = r.numeros, p = [];
    p.push(`Você tem ${plural(n.dividas.length, 'dívida', 'dívidas')} em aberto, somando ${brl(n.total)}${n.atrasadas ? `, ${n.atrasadas === 1 ? 'uma delas atrasada' : `${n.atrasadas} delas atrasadas`}` : ''}.`);
    if (n.semTaxa) p.push(`Para ${n.semTaxa === 1 ? 'uma delas' : `${n.semTaxa} delas`} falta a taxa de juros; sem ela, a conta trata essa dívida como sem juros, então o tempo real pode ser maior. A taxa aparece na fatura ou no contrato como "juros ao mês" ou "CET mensal".`);
    const c = n.caminhos;
    if (n.sobraMedia <= 0) p.push(`Nos últimos ${plural(n.mesesSobra, 'mês', 'meses')}, saiu mais do que entrou (em média ${brl(-n.sobraMedia)} a menos por mês). Sem sobra por mês, não há valor livre para abater as dívidas, e o prazo não dá para estimar.`);
    else if (c.custo.meses == null) p.push(`Com a sobra média de ${brl(n.sobraMedia)} por mês, os juros crescem mais rápido do que o pagamento: nesse ritmo, as dívidas não terminam.`);
    else {
      p.push(`Usando a sobra média de ${brl(n.sobraMedia)} por mês, toda ela indo para as dívidas, há dois caminhos:`);
      p.push(`Quitar primeiro as de juros mais altos (${c.custo.ordem.join(', ')}): termina em ${plural(c.custo.meses, 'mês', 'meses')} e paga ${brl(c.custo.totalPago)} no total, ${brl(c.custo.juros)} de juros. De bom: é o caminho que costuma pagar menos juros. De ruim: a primeira dívida pode demorar a sumir, e o avanço demora a aparecer.`);
      const prim = c.menores.primeira;
      p.push(`Quitar primeiro as menores (${c.menores.ordem.join(', ')}): termina em ${plural(c.menores.meses, 'mês', 'meses')} e paga ${brl(c.menores.totalPago)} no total, ${brl(c.menores.juros)} de juros. De bom: ${prim ? `"${prim.nome}" sai da lista em ${plural(prim.mes, 'mês', 'meses')}, o que libera fôlego mais cedo` : 'contas pequenas saem da lista logo'}. De ruim: costuma pagar mais juros no total.`);
      p.push('Conta simplificada: juros ao mês sobre o que falta e toda a sobra indo para as dívidas, sem contar multas e o calendário fixo das parcelas.');
    }
    const risco = r.situacao === 'vermelho'
      ? 'O risco: com o dinheiro do mês não cobrindo as contas, as dívidas tendem a crescer com juros e multas a cada mês.'
      : 'O risco: usar toda a sobra para as dívidas deixa pouco para imprevistos; contas atrasadas somam multa e juros enquanto esperam.';
    return { paragrafos: p, risco, links: [] };
  }

  // ---------- 3) "Quito a dívida ou guardo o dinheiro?" ----------
  /** cdiAnual em % ao ano (ex.: 13.65), vindo das taxas do Banco Central que o app já usa */
  function calcularQuitarOuGuardar(db, perfil, ref, { divida, cdiAnual } = {}) {
    const base = { id: 'quitar' };
    const lista = listaDividas(db, perfil, ref);
    if (!lista.length) return { ...base, suficiente: false, faltas: [FALTA.dividas], opcoes: [] };
    const d = lista.find(x => x.id === divida) || lista[0];
    const opcoes = lista.map(x => ({ id: x.id, nome: x.nome, total: x.total, taxa: x.taxa }));
    if (d.taxa == null) return { ...base, suficiente: false, faltas: [FALTA.taxa(d.nome)], opcoes, escolhida: d.id };
    if (!(cdiAnual > 0)) return { ...base, suficiente: false, faltas: [{ texto: 'Falta a taxa de referência (CDI) para comparar.', comoAnotar: 'Ela vem do Banco Central quando há internet; tente de novo em instantes.' }], opcoes, escolhida: d.id };
    const serie = N.serieFluxo(db, perfil, 90, ref), menor = menorPonto(serie.pontos);
    const cdiMes = Math.pow(1 + cdiAnual / 100, 1 / 12) - 1;
    const custoMes = Math.round(d.total * d.taxa / 10000), rendeMes = Math.round(d.total * cdiMes);
    const folga = menor.saldo;
    const situacao = folga <= 0 ? 'vermelho' : folga < d.total ? 'limite' : 'folga';
    return { ...base, suficiente: true, situacao, faltas: [], opcoes, escolhida: d.id, numeros: {
      nome: d.nome, total: d.total, taxa: d.taxa, cdiAnual, cdiMesPct: Math.round(cdiMes * 10000) / 100, custoMes, rendeMes, diferencaMes: custoMes - rendeMes,
      folga, folgaData: menor.data, pctQuitavel: folga > 0 ? Math.min(100, Math.round(folga / d.total * 100)) : 0, saldoHoje: serie.pontos[0].saldo
    } };
  }
  function redigirQuitarOuGuardar(r) {
    const n = r.numeros, p = [];
    p.push(`"${n.nome}" tem ${brl(n.total)} em aberto, com juros de ${N.formatTaxa(n.taxa)}% ao mês. Num mês, isso soma cerca de ${brl(n.custoMes)} de juros.`);
    p.push(`O mesmo valor guardado, rendendo como o CDI de hoje (${String(n.cdiAnual).replace('.', ',')}% ao ano, perto de ${String(n.cdiMesPct).replace('.', ',')}% ao mês), daria cerca de ${brl(n.rendeMes)} no mês, antes do imposto.`);
    p.push(n.diferencaMes > 0
      ? `Pelos números, a dívida custa ${brl(n.diferencaMes)} a mais por mês do que o dinheiro guardado renderia.`
      : `Pelos números, a dívida custa menos do que o dinheiro guardado renderia: uma diferença de ${brl(-n.diferencaMes)} por mês.`);
    p.push(n.folga <= 0
      ? `Pelos seus números, não há folga prevista nos próximos 90 dias: em ${dm(n.folgaData)} o saldo chega a ${brl(n.folga)}, mesmo sem quitar nem guardar.`
      : n.folga >= n.total
        ? `Sua folga prevista nos próximos 90 dias (o menor saldo, em ${dm(n.folgaData)}) é de ${brl(n.folga)}, o que cobriria a dívida inteira.`
        : `Sua folga prevista nos próximos 90 dias (o menor saldo, em ${dm(n.folgaData)}) é de ${brl(n.folga)}, o que cobriria cerca de ${n.pctQuitavel}% dela.`);
    const risco = r.situacao === 'vermelho'
      ? 'O risco: sem folga, tanto quitar quanto guardar podem deixar faltar dinheiro para as contas do dia a dia.'
      : 'O risco: usar toda a folga para quitar deixa você sem reserva para imprevistos; guardar e manter a dívida deixa os juros correndo.';
    return { paragrafos: p, risco, links: [{ rotulo: 'Simular em vários meses na calculadora de juros compostos', href: '/ferramentas/juros-compostos.html' }] };
  }

  // ---------- 4) "Posso gastar R$ X este mês?" ----------
  function calcularGasto(db, perfil, ref, { valor } = {}) {
    const base = { id: 'gasto', entrada: { valor } };
    if (!Number.isSafeInteger(valor) || valor <= 0) return { ...base, erro: 'Informe quanto quer gastar.' };
    if (!temContas(db, perfil) && !db.config.saldoDefinido) return { ...base, suficiente: false, faltas: [FALTA.saldo] };
    const fim = N.fimDoMes(ref), dias = N.diffDias(ref, fim);
    const pontos = N.serieFluxo(db, perfil, dias, ref).pontos, menor = menorPonto(pontos);
    let aPagar = 0, aReceber = 0;
    for (const c of db.contas.filter(doPerfil(perfil))) {
      if (N.quitada(c) || c.vencimento > fim) continue;
      if (c.tipo === 'pagar') aPagar += N.restante(c); else aReceber += N.restante(c);
    }
    const fimSem = pontos[pontos.length - 1].saldo, menorCom = menor.saldo - valor;
    const situacao = menorCom < 0 ? 'vermelho' : menorCom < valor ? 'limite' : 'folga';
    return { ...base, suficiente: true, situacao, faltas: db.config.saldoDefinido ? [] : [FALTA.saldo], numeros: {
      valor, fim, aPagar, aReceber, saldoHoje: pontos[0].saldo, fimSem, fimCom: fimSem - valor, menorSem: menor.saldo, menorCom, menorData: menor.data,
      pctFim: fimSem > 0 ? Math.round(valor / fimSem * 100) : null
    } };
  }
  function redigirGasto(r) {
    const n = r.numeros, p = [];
    p.push(`Até o fim do mês (${dm(n.fim)}), ainda ${n.aPagar ? `vencem ${brl(n.aPagar)} a pagar` : 'não vence nada a pagar'}${n.aReceber ? ` e devem entrar ${brl(n.aReceber)}` : ''}.`);
    p.push(`Sem esse gasto, o saldo previsto no fim do mês é de ${brl(n.fimSem)}; com os ${brl(n.valor)}, ficaria em ${brl(n.fimCom)}.`);
    p.push(`O momento mais apertado do mês seria em ${dm(n.menorData)}: ${brl(n.menorCom)} de saldo, já contando o gasto.`);
    if (r.faltas.length) p.push('O saldo inicial ainda não foi informado em Ajustes, então o saldo de hoje pode estar diferente do que você tem de verdade.');
    const risco = {
      folga: 'O risco: gastos que ainda não estão anotados diminuem essa folga.',
      limite: 'O risco: sobra pouco depois do gasto; qualquer imprevisto no mês pode fazer faltar.',
      vermelho: 'O risco: pelos números de hoje, o saldo ficaria negativo antes do fim do mês, o que costuma levar a cheque especial ou atraso de contas.'
    }[r.situacao];
    return { paragrafos: p, risco, links: [] };
  }

  // ---------- catálogo e texto ----------
  const CONSULTAS = [
    // plano: 'gratis' = liberada para todos; 'pro' = no grátis aparece em vitrine com o `resumo` (o que ela responde)
    { id: 'parcela', plano: 'gratis', pergunta: 'Essa parcela cabe no meu bolso?', calcular: calcularParcela, redigir: redigirParcela },
    // nas consultas de dívida, a situação fala do prazo e da folga (o mesmo "com folga" da parcela confundiria)
    { id: 'dividas', plano: 'pro', pergunta: 'Como saio das dívidas?', resumo: 'Mostra quanto tempo e quanto custa pagar normal e qual proposta à vista economiza mais com a sua sobra.',
      calcular: calcularDividas, redigir: redigirDividas,
      rotulos: { folga: 'Prazo curto', limite: 'Prazo longo', vermelho: 'Sem prazo com a sobra atual' } },
    { id: 'quitar', plano: 'pro', pergunta: 'Quito a dívida ou guardo o dinheiro?', resumo: 'Compara os juros da sua dívida com o que o mesmo dinheiro renderia guardado.',
      calcular: calcularQuitarOuGuardar, redigir: redigirQuitarOuGuardar,
      rotulos: { folga: 'A folga cobre a dívida', limite: 'A folga cobre parte', vermelho: 'Sem folga' } },
    { id: 'gasto', plano: 'pro', pergunta: 'Posso gastar R$ X este mês?', resumo: 'Mostra como fica o seu fim de mês se você gastar esse valor agora.',
      calcular: calcularGasto, redigir: redigirGasto }
  ];
  /** completa o resultado com o texto fixo (ou o que falta), a decisão e o aviso */
  function redigir(r) {
    const q = CONSULTAS.find(c => c.id === r.id);
    const comum = { titulo: q.pergunta, aviso: AVISO, rotuloSituacao: r.situacao ? (r.rotulos || q.rotulos || SITUACAO)[r.situacao] : null };
    if (r.erro) return { ...r, ...comum, paragrafos: [], risco: null, decisao: null, links: [] };
    if (!r.suficiente) {
      return { ...r, ...comum, paragrafos: ['Ainda não dá para responder com os seus números.', ...r.faltas.map(f => `${f.texto} ${f.comoAnotar}`)], risco: null, decisao: null, links: [] };
    }
    return { ...r, ...comum, ...q.redigir(r), decisao: DECISAO };
  }
  /**
   * TODO (Etapa 2 do projeto): a IA do servidor poderá escrever o texto em cima de `resultado.numeros`, que já chegam
   * calculados aqui. Ela só reescreve (mesma regra de tom, mesmo aviso); nunca calcula nem inventa número.
   * Hoje devolve null e vale o texto fixo de redigir().
   */
  async function escreverComIA(resultado) { return null; }   // eslint-disable-line no-unused-vars

  /** consultar('parcela', db, perfil, ref, { valor, parcelas }) → resultado com números e texto */
  function consultar(id, db, perfil = 'tudo', ref = N.hoje(), entrada = {}) {
    const q = CONSULTAS.find(c => c.id === id);
    if (!q) throw new Error('Consulta desconhecida: ' + id);
    return redigir(q.calcular(db, perfil, ref, entrada));
  }

  window.ControlConsultas = {
    AVISO, DECISAO, SITUACAO, FALTA, CONSULTAS, consultar, redigir, escreverComIA, sobraMedia, listaDividas, simularQuitacao,
    calcularParcela, calcularDividas, calcularQuitarOuGuardar, calcularGasto
  };
})();
