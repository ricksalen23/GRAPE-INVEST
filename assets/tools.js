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
 *          campoRendimento, copiarTexto, cardResultado, estiloGrafico,
 *          validarCpf/validarCnpj/validarDocumento + máscaras, valorPorExtenso, formatDataLonga, linkWhatsApp,
 *          novoPdf/textoPdf/rodapePdf (jsPDF) e imprimir(elemento),
 *          calcINSS/calcIRRF/salarioLiquido/impostos13/impostosFerias (precisam de /assets/tabelas-2026.js).
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
      // colar, arrastar, preenchimento automático, valor vindo de script (sem inputType) ou texto inserido de uma vez
      // (ditado, sugestão do teclado do celular: insertText com mais de 1 caractere): interpreta o texto inteiro
      // ("1500.50" é mil e quinhentos e cinquenta centavos, não 150.050); só a digitação tecla a tecla passa pela máscara
      const textoInteiro = e.inputType === 'insertText' && e.data && e.data.length > 1;
      if (!e.inputType || textoInteiro || e.inputType === 'insertFromPaste' || e.inputType === 'insertFromDrop' || e.inputType === 'insertReplacementText') {
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

  /* ===== MOTOR DE RENDA FIXA (simulador de renda fixa, poupança x CDB x Tesouro) =====
   * Poupança, CDB, LCI/LCA e Tesouro Selic com prazos em dias corridos reais a partir de hoje, aportes no mesmo dia
   * de cada mês ("mesversário"), IR regressivo por depósito e rentabilidade real pelo IPCA.
   * Uso: const RF = Warden.rendaFixa;
   *      const p = RF.prazo(2, 'anos');                                   // { dias, fim, cal }
   *      const deps = RF.depositos({ inicial: 10000, aporte: 0, ...p });
   *      const ops = RF.opcoes(taxas, { pctCdb: 100, pctLci: 90 });       // taxas = { selic, cdi, ipca } em % a.a.
   *      const r = RF.simular(ops[0], deps, p.dias, p.cal, taxas);        // { liquido, ir, rendimento, real, … } */
  const RENDA_FIXA = {
    // IOF: resgates com menos de X dias pagam IOF regressivo. As ferramentas só mostram um aviso.
    iofDiasMinimos: 30,
    poupanca: {
      limiteSelic: 8.5,             // Selic (% a.a.) acima da qual vale o rendimento fixo
      rendimentoMensalFixo: 0.005,  // 0,5% ao mês (+ TR, que ignoramos)
      fracaoDaSelic: 0.70,          // Selic até o limite: 70% da Selic ao ano (+ TR)
      isentaIR: true
    },
    lciLca: { isentaIR: true },     // isenção vale para pessoa física
    tesouroSelic: {
      custodiaAA: 0.20,             // taxa de custódia da B3, em pontos percentuais ao ano (descontada da Selic)
      isentaIR: false
    },
    cdb: { isentaIR: false }
  };

  /* calendário: prazos em dias corridos reais, contados a partir de hoje. Meses e anos são somados à data de hoje
   * e convertidos em dias pela diferença entre as datas (2 anos a partir de 02/10/2026 = 731 dias, porque 2028 é bissexto).
   * Tudo em UTC para não sofrer com horário de verão / fuso. */
  const DIA_MS = 86400000;
  const HOJE = (() => { const d = new Date(); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); })();
  // hoje + n meses; se o dia não existe no mês de destino (ex.: 31/01 + 1 mês), usa o último dia desse mês
  function somarMeses(n) {
    const d = new Date(HOJE);
    const ano = d.getUTCFullYear(), mes = d.getUTCMonth() + n, dia = d.getUTCDate();
    const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
    return Date.UTC(ano, mes, Math.min(dia, ultimoDia));
  }
  const diasAte = data => Math.round((data - HOJE) / DIA_MS);
  const fmtDataUTC = data => new Date(data).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  // dias corridos de hoje até cada "mesversário" (0, 1, 2… meses); o último item já passa do prazo
  function calendarioMeses(diasPrazo) {
    const cal = [0];
    while (cal[cal.length - 1] <= diasPrazo) cal.push(diasAte(somarMeses(cal.length)));
    return cal;
  }
  // índice do último mesversário que cai até o "dia" informado (busca binária: cal é crescente)
  function ultimoMesAte(cal, dia) {
    let lo = 0, hi = cal.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (cal[mid] <= dia) lo = mid; else hi = mid - 1; }
    return lo;
  }

  // prazo digitado (quantidade + 'dias' | 'meses' | 'anos') → { dias, fim, cal }; limita a 50 anos, mínimo 1 dia
  function prazoRendaFixa(quantidade, unidade) {
    const limite = { dias: 18263, meses: 600, anos: 50 }[unidade];
    const q = Math.min(Math.max(quantidade, 1), limite);
    const meses = unidade === 'anos' ? Math.round(q * 12) : unidade === 'meses' ? Math.round(q) : null;
    const dias = Math.max(meses === null ? Math.round(q) : diasAte(somarMeses(meses)), 1);
    return { dias, fim: HOJE + dias * DIA_MS, cal: calendarioMeses(dias) };
  }

  // depósitos: valor inicial hoje + um aporte em cada mesversário (mesmo dia do mês) dentro do prazo
  function depositosRendaFixa({ inicial, aporte, dias, cal }) {
    const lista = [];
    if (inicial > 0) lista.push({ dia: 0, mes: 0, valor: inicial });
    if (aporte > 0) for (let k = 0; cal[k] < dias; k++) lista.push({ dia: cal[k], mes: k, valor: aporte });
    return lista;
  }

  // as quatro opções com as taxas do dia (% a.a.); pctCdb/pctLci = % do CDI de cada uma
  function opcoesRendaFixa(taxas, { pctCdb = 100, pctLci = 90 } = {}) {
    const C = RENDA_FIXA, p = C.poupanca;
    const pct = v => formatPct(v), curto = v => formatNumero(v, { curto: true });
    const regraFixa = taxas.selic > p.limiteSelic;
    const poupMensal = regraFixa ? p.rendimentoMensalFixo : Math.pow(1 + p.fracaoDaSelic * taxas.selic / 100, 1 / 12) - 1;
    const cdbAA = taxas.cdi * pctCdb / 100;
    const lciAA = taxas.cdi * pctLci / 100;
    const tesouroAA = Math.max(0, taxas.selic - C.tesouroSelic.custodiaAA);
    return [
      { id: 'poupanca', nome: 'Poupança', mensal: poupMensal, ir: !p.isentaIR,
        desc: (regraFixa ? '0,5% ao mês' : `70% da Selic · ${pct(p.fracaoDaSelic * taxas.selic)} a.a.`) + ' · isenta de IR' },
      { id: 'cdb', nome: 'CDB', anual: cdbAA, ir: !C.cdb.isentaIR,
        desc: `${curto(pctCdb)}% do CDI · ${pct(cdbAA)} a.a.` },
      { id: 'lci', nome: 'LCI/LCA', anual: lciAA, ir: !C.lciLca.isentaIR,
        desc: `${curto(pctLci)}% do CDI · ${pct(lciAA)} a.a. · isenta de IR` },
      { id: 'tesouro', nome: 'Tesouro Selic', anual: tesouroAA, ir: !C.tesouroSelic.isentaIR,
        desc: `Selic − ${curto(C.tesouroSelic.custodiaAA)} p.p. de custódia · ${pct(tesouroAA)} a.a.` }
    ];
  }

  // valor de cada depósito no "dia" informado: juros compostos por dia corrido (poupança: só mesversários completos);
  // IR calculado por depósito, conforme os dias corridos reais que cada um ficou aplicado (é assim que a corretora faz)
  function simularRendaFixa(op, deps, dia, cal, taxas) {
    const inflacao = 1 + taxas.ipca / 100;
    const mesAtual = ultimoMesAte(cal, dia);
    let bruto = 0, investido = 0, ir = 0, investidoHoje = 0;
    const aliquotas = new Set();
    for (const d of deps) {
      if (d.dia >= dia && d.dia !== 0) continue;
      const tempo = dia - d.dia;
      const fator = op.mensal !== undefined
        ? Math.pow(1 + op.mensal, mesAtual - d.mes)
        : Math.pow(1 + op.anual / 100, tempo / 365);
      const valor = d.valor * fator;
      bruto += valor;
      investido += d.valor;
      if (op.ir && tempo > 0) { const a = aliquotaIR(tempo); ir += (valor - d.valor) * a; aliquotas.add(a); }
      investidoHoje += d.valor / Math.pow(inflacao, d.dia / 365);   // tudo trazido para o poder de compra de hoje
    }
    const liquido = bruto - ir;
    const real = investidoHoje > 0 ? (liquido / Math.pow(inflacao, dia / 365)) / investidoHoje - 1 : 0;
    return { bruto, investido, ir, liquido, rendimento: liquido - investido, real: real * 100, aliquotas: [...aliquotas] };
  }

  const rendaFixa = {
    CONFIG: RENDA_FIXA, HOJE, DIA_MS, somarMeses, diasAte, fmtData: fmtDataUTC, calendarioMeses, ultimoMesAte,
    prazo: prazoRendaFixa, depositos: depositosRendaFixa, opcoes: opcoesRendaFixa, simular: simularRendaFixa
  };

  /* ===== TRABALHO (CLT): INSS e IRRF =====
   * Todos os números (faixas, alíquotas, deduções, redução de 2026) vêm de /assets/tabelas-2026.js → window.WARDEN_TABELAS.
   * Nada de valor de lei escrito aqui. A página carrega tabelas-2026.js ANTES deste arquivo. */
  const tabelas = () => {
    if (!window.WARDEN_TABELAS) throw new Error('Carregue /assets/tabelas-2026.js antes de /assets/tools.js');
    return window.WARDEN_TABELAS;
  };
  // arredonda para centavos, meio centavo para cima (121,575 → 121,58). O toFixed(6) limpa o erro do ponto flutuante
  // (121,575 fica guardado como 121,57499999… na memória e arredondaria errado para baixo)
  const centavos = v => Math.round(Number((v * 100).toFixed(6))) / 100;

  // INSS do empregado, progressivo: cada alíquota só sobre a parte do salário dentro da faixa; limitado ao teto
  function calcINSS(bruto) {
    const t = tabelas().inss;
    let inss = 0, anterior = 0;
    for (const f of t.faixas) {
      if (bruto <= anterior) break;
      inss += (Math.min(bruto, f.ate) - anterior) * f.aliquota;
      anterior = f.ate;
    }
    return centavos(Math.min(inss, t.contribuicaoMaxima));
  }

  // IRRF do mês. bruto = rendimento tributável; inss = já arredondado (calcINSS); dependentes = quantidade.
  // opções: simplificado (usar o maior entre desconto simplificado e INSS + dependentes), reducao (redução de 2026).
  // → { base, deducao, usouSimplificado, aliquota, impostoTabela, reducao, irDevido }
  function calcIRRF(bruto, inss = 0, dependentes = 0, { simplificado = true, reducao = true } = {}) {
    const t = tabelas().irrf;
    const legais = inss + dependentes * t.deducaoPorDependente;
    const usouSimplificado = simplificado && t.descontoSimplificado > legais;
    const deducao = usouSimplificado ? t.descontoSimplificado : legais;
    const base = Math.max(0, bruto - deducao);
    const faixa = t.faixas.find(f => base <= f.ate);
    const impostoTabela = centavos(Math.max(0, base * faixa.aliquota - faixa.deduzir));
    // redução de 2026: sobre o BRUTO do mês, limitada ao imposto
    let red = 0;
    if (reducao) {
      const r = t.reducao;
      if (bruto <= r.ateBruto) red = Math.min(r.valorMaximo, impostoTabela);
      else if (bruto <= r.faixaDecrescenteAte) red = Math.min(Math.max(0, r.constante - r.fatorBruto * bruto), impostoTabela);
    }
    red = centavos(red);
    return { base: centavos(base), deducao: centavos(deducao), usouSimplificado, aliquota: faixa.aliquota,
             impostoTabela, reducao: red, irDevido: centavos(impostoTabela - red) };
  }

  // salário do mês: INSS + IRRF (com simplificado e redução) → { inss, ir, liquido }  (outros descontos à parte)
  function salarioLiquido(bruto, dependentes = 0) {
    const inss = calcINSS(bruto);
    const ir = calcIRRF(bruto, inss, dependentes);
    return { bruto, inss, ir, liquido: centavos(bruto - inss - ir.irDevido) };
  }

  // 13º (tributação exclusiva) e férias (em separado): mesmas funções, com as regras de cada um nas tabelas
  function impostos13(bruto13, dependentes = 0) {
    const t = tabelas().irrf;
    const inss = calcINSS(bruto13);
    const ir = calcIRRF(bruto13, inss, dependentes, { simplificado: t.simplificadoNo13, reducao: t.reducaoNo13 });
    return { inss, ir, liquido: centavos(bruto13 - inss - ir.irDevido) };
  }
  function impostosFerias(brutoFerias, dependentes = 0) {
    const t = tabelas().irrf;
    const inss = calcINSS(brutoFerias);
    const ir = calcIRRF(brutoFerias, inss, dependentes, { simplificado: t.simplificadoEmFerias, reducao: t.reducaoEmFerias });
    return { inss, ir, liquido: centavos(brutoFerias - inss - ir.irDevido) };
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

  /* ===== DOCUMENTOS: CPF / CNPJ ===== */
  const soDigitos = v => String(v == null ? '' : v).replace(/\D/g, '');

  // dígitos verificadores do CPF (11 dígitos; rejeita sequências repetidas como 111.111.111-11)
  function validarCpf(v) {
    const d = soDigitos(v);
    if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
    for (const n of [9, 10]) {
      let soma = 0;
      for (let i = 0; i < n; i++) soma += +d[i] * (n + 1 - i);
      if ((soma * 10) % 11 % 10 !== +d[n]) return false;
    }
    return true;
  }

  // dígitos verificadores do CNPJ (14 dígitos, pesos 2 a 9 da direita para a esquerda)
  function validarCnpj(v) {
    const d = soDigitos(v);
    if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
    for (const n of [12, 13]) {
      let soma = 0;
      for (let i = 0; i < n; i++) soma += +d[i] * ((n - 1 - i) % 8 + 2);
      const dv = soma % 11 < 2 ? 0 : 11 - (soma % 11);
      if (dv !== +d[n]) return false;
    }
    return true;
  }

  // máscaras progressivas (funcionam enquanto a pessoa digita): 000.000.000-00 / 00.000.000/0000-00
  const mascaraCpf = v => soDigitos(v).slice(0, 11)
    .replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
  const mascaraCnpj = v => soDigitos(v).slice(0, 14)
    .replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4').replace(/\/(\d{4})(\d{1,2})$/, '/$1-$2');
  // campo que aceita CPF ou CNPJ: até 11 dígitos é CPF, acima disso vira CNPJ
  const mascaraDocumento = v => soDigitos(v).length <= 11 ? mascaraCpf(v) : mascaraCnpj(v);

  // → { vazio, ok, tipo: 'CPF' | 'CNPJ' | null, erro }
  function validarDocumento(v) {
    const d = soDigitos(v);
    if (!d) return { vazio: true, ok: false, tipo: null, erro: '' };
    if (d.length < 11) return { vazio: false, ok: false, tipo: null, erro: 'CPF tem 11 números e CNPJ tem 14' };
    if (d.length === 11) return validarCpf(d) ? { vazio: false, ok: true, tipo: 'CPF', erro: '' } : { vazio: false, ok: false, tipo: 'CPF', erro: 'CPF inválido: confira os números' };
    if (d.length < 14) return { vazio: false, ok: false, tipo: 'CNPJ', erro: 'CNPJ incompleto' };
    return validarCnpj(d) ? { vazio: false, ok: true, tipo: 'CNPJ', erro: '' } : { vazio: false, ok: false, tipo: 'CNPJ', erro: 'CNPJ inválido: confira os números' };
  }

  /* ===== TEXTO: VALOR POR EXTENSO E DATAS ===== */
  const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze',
                    'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  // escalas de 3 em 3 dígitos: [singular, plural]
  const ESCALAS = [['', ''], ['mil', 'mil'], ['milhão', 'milhões'], ['bilhão', 'bilhões'], ['trilhão', 'trilhões']];

  // 0 a 999 por extenso ("cem" sozinho, "cento e um", "duzentos e trinta e quatro")
  function extenso999(n) {
    if (n === 100) return 'cem';
    const c = Math.floor(n / 100), resto = n % 100;
    const partes = [];
    if (c) partes.push(CENTENAS[c]);
    if (resto) partes.push(resto < 20 ? UNIDADES[resto] : DEZENAS[Math.floor(resto / 10)] + (resto % 10 ? ' e ' + UNIDADES[resto % 10] : ''));
    return partes.join(' e ');
  }

  // inteiro por extenso: "mil duzentos e trinta e quatro", "um milhão e duzentos mil", "dois mil e quinhentos"
  function inteiroPorExtenso(n) {
    if (n === 0) return 'zero';
    const grupos = [];   // [valor do grupo, escala], do maior para o menor
    for (let e = 0; n > 0; e++, n = Math.floor(n / 1000)) if (n % 1000) grupos.unshift([n % 1000, e]);
    return grupos.map(([g, e], k) => {
      const nome = e === 1 && g === 1 ? 'mil' : (extenso999(g) + (e ? ' ' + ESCALAS[e][g === 1 ? 0 : 1] : ''));
      if (k === 0) return nome;
      // "e" antes do último grupo quando ele é menor que 100 ou centena redonda (mil e cem, mil e vinte); senão vírgula/espaço
      const ultimo = k === grupos.length - 1;
      const sep = ultimo && (g < 100 || g % 100 === 0) ? ' e ' : e === 0 ? ' ' : ', ';
      return sep + nome;
    }).join('');
  }

  // R$ por extenso: 1234.56 → "mil duzentos e trinta e quatro reais e cinquenta e seis centavos"
  //                  1 → "um real" · 0.5 → "cinquenta centavos" · 1000000 → "um milhão de reais"
  function valorPorExtenso(valor) {
    const centavosTotal = Math.round(Math.abs(Number(valor) || 0) * 100);
    const reais = Math.floor(centavosTotal / 100), centavos = centavosTotal % 100;
    const partes = [];
    if (reais > 0) {
      // "de reais" quando termina em milhão/bilhão redondo: "um milhão de reais", mas "um milhão e duzentos mil reais"
      const de = reais >= 1e6 && reais % 1e6 === 0 ? ' de' : '';
      partes.push(inteiroPorExtenso(reais) + de + (reais === 1 ? ' real' : ' reais'));
    }
    if (centavos > 0) partes.push(inteiroPorExtenso(centavos) + (centavos === 1 ? ' centavo' : ' centavos'));
    return partes.length ? partes.join(' e ') : 'zero real';
  }

  // Date ou 'aaaa-mm-dd' (data local, sem fuso) → "2 de outubro de 2026"
  function formatDataLonga(data) {
    const d = typeof data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data)
      ? new Date(+data.slice(0, 4), +data.slice(5, 7) - 1, +data.slice(8, 10))
      : new Date(data);
    return isNaN(d) ? '' : d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  /* ===== WHATSAPP ===== */
  // link que abre o WhatsApp com a mensagem pronta; sem número, a pessoa escolhe o contato
  const linkWhatsApp = (texto, numero = '') => `https://wa.me/${soDigitos(numero)}?text=${encodeURIComponent(texto)}`;

  /* ===== PDF (jsPDF) E IMPRESSÃO =====
   * A página carrega o jsPDF: <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
   * const doc = Warden.novoPdf();  … doc.text(Warden.textoPdf('…'), x, y) …;  Warden.rodapePdf(doc);  doc.save('nome.pdf')
   * Medidas em mm, A4 retrato (210 × 297). Fontes padrão do PDF (Helvetica): passe todo texto por textoPdf. */
  const PDF = { largura: 210, altura: 297, margem: 20 };
  function novoPdf() {
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    doc.setFillColor(200, 242, 107);           // faixa no verde-limão da marca (--accent)
    doc.rect(0, 0, PDF.largura, 4, 'F');
    doc.setTextColor(20, 20, 18);
    return doc;
  }
  // as fontes padrão do PDF só têm o alfabeto latino básico: troca o espaço estreito pelo não separável (que a fonte tem e evita quebrar "R$ 10" no meio), travessões, aspas curvas etc.
  const textoPdf = s => String(s)
    .replace(/\u202f/g, '\u00a0').replace(/[–—−]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
    .replace(/…/g, '...').replace(/→/g, '->').replace(/•/g, '-');
  // rodapé discreto em todas as páginas
  function rodapePdf(doc) {
    const n = doc.getNumberOfPages();
    for (let p = 1; p <= n; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(138, 136, 126);
      doc.text(textoPdf('Gerado com Warden · wardenfinance.com.br' + (n > 1 ? `   ·   ${p}/${n}` : '')), PDF.largura / 2, PDF.altura - 10, { align: 'center' });
    }
    doc.setTextColor(20, 20, 18);
  }

  // Imprime só um elemento (ex.: a prévia .tool-papel): copia para um contêiner no topo do body e
  // esconde o resto só durante a impressão (ver .tool-impressao no warden.css). Evita páginas em branco.
  function imprimir(elemento) {
    const alvo = document.createElement('div');
    alvo.className = 'tool-impressao';
    alvo.appendChild(elemento.cloneNode(true));
    document.body.appendChild(alvo);
    document.body.classList.add('imprimindo');
    const limpar = () => { alvo.remove(); document.body.classList.remove('imprimindo'); window.removeEventListener('afterprint', limpar); };
    window.addEventListener('afterprint', limpar);
    window.print();
    setTimeout(limpar, 1000);   // navegadores que não disparam afterprint
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

  // Demonstrativo linha a linha (.tool-demo). linhas: [{ rotulo, valor, tipo, nota, tag, texto }]
  // tipo: 'mais' (soma), 'menos' (desconto, mostra "− R$"), 'info' (só informação), 'subtotal', 'total'. texto substitui o valor.
  function demonstrativo(linhas) {
    return linhas.filter(Boolean).map(l => {
      const tipo = l.tipo || 'mais';
      const val = l.texto !== undefined ? l.texto : (tipo === 'menos' ? '− ' : '') + formatBRL(Math.abs(l.valor));
      return `<li class="${tipo}"><span class="rot">${l.rotulo}${l.tag ? `<span class="tag">${l.tag}</span>` : ''}${l.nota ? `<small>${l.nota}</small>` : ''}</span><span class="val">${val}</span></li>`;
    }).join('');
  }

  // Barra de composição (.tool-barra + .tool-barra-legenda). partes: [{ nome, valor, cor }]; total = soma (ou informado).
  // → { barra, legenda } (HTML). Partes zeradas ficam de fora.
  function barraComposicao(partes, total) {
    const ps = partes.filter(p => p.valor > 0.005);
    const t = total || ps.reduce((s, p) => s + p.valor, 0);
    return {
      barra: ps.map(p => `<span style="width:${t > 0 ? p.valor / t * 100 : 0}%;background:${p.cor}" title="${p.nome}"></span>`).join(''),
      legenda: ps.map(p => `<li style="--cor:${p.cor}">${p.nome}<strong>${formatBRL(p.valor)}</strong>${t > 0 ? formatPct(p.valor / t * 100, { casas: 1 }) : ''}</li>`).join('')
    };
  }

  // <span data-tabela="irrf.reducao.ateBruto" data-formato="brl"></span> → valor das tabelas oficiais (tabelas-2026.js)
  // formatos: brl (R$), pct (decimal → %), int (número inteiro), texto (como está). Textos explicativos nunca escrevem valor de lei.
  function montarTabelasNoTexto() {
    const els = document.querySelectorAll('[data-tabela]');
    if (!els.length || !window.WARDEN_TABELAS) return;
    els.forEach(el => {
      const v = el.dataset.tabela.split('.').reduce((o, k) => (o == null ? o : o[k]), window.WARDEN_TABELAS);
      if (v == null) return;
      const f = el.dataset.formato;
      el.textContent = f === 'brl' ? formatBRL(v) : f === 'pct' ? formatPct(v * 100, { curto: true }) : f === 'int' ? formatNumero(v, { casas: 0 }) : String(v);
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
  montarTabelasNoTexto();
  montarRendimentos();
  montarPontes();
  montarAvisos();
  montarFaq();

  window.Warden = {
    formatBRL, formatBRLCompacto, formatNumero, formatPct, parseNumero, campoBRL,
    TAXAS_REFERENCIA, getTaxasBCB, fonteTaxa,
    IR_REGRESSIVO, aliquotaIR, liquidaDeIR, rendaFixa,
    calcINSS, calcIRRF, salarioLiquido, impostos13, impostosFerias, centavos,
    taxaMensal, taxaMensalDe, parcelaPrice, aporteNecessario, serieAcumulacao,
    campoRendimento, copiarTexto,
    validarCpf, validarCnpj, validarDocumento, mascaraCpf, mascaraCnpj, mascaraDocumento,
    valorPorExtenso, formatDataLonga, linkWhatsApp,
    PDF, novoPdf, textoPdf, rodapePdf, imprimir,
    cardResultado, estiloGrafico, demonstrativo, barraComposicao
  };
})();
