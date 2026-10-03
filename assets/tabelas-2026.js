/*
 * WARDEN — TABELAS OFICIAIS DE 2026 (trabalho / CLT / impostos)
 *
 * ÚNICO lugar com estes números. Nenhuma ferramenta escreve faixas, alíquotas ou valores de lei fora deste arquivo:
 * as páginas e o kit (/assets/tools.js → Warden.calcINSS, Warden.calcIRRF…) leem tudo daqui.
 * Para atualizar no ano que vem: copie este arquivo como tabelas-2027.js, troque os valores, a vigência e as fontes,
 * e aponte as páginas de trabalho para o arquivo novo (ou mantenha o nome e só troque o conteúdo).
 *
 * Uso: <script src="/assets/tabelas-2026.js"></script> ANTES de <script src="/assets/tools.js"></script>.
 * Valores em reais; alíquotas em decimal (0,075 = 7,5%).
 */
(() => {
// congela tudo, inclusive as faixas internas: nenhuma página consegue alterar um valor de lei por engano
const congelar = o => { Object.values(o).forEach(v => { if (v && typeof v === 'object') congelar(v); }); return Object.freeze(o); };

window.WARDEN_TABELAS = congelar({
  ano: 2026,

  /* ===== SALÁRIO MÍNIMO ===== */
  salarioMinimo: {
    valor: 1621.00,
    vigencia: 'a partir de 01/01/2026',
    fonte: 'Decreto do salário mínimo de 2026'
  },

  /* ===== INSS DO EMPREGADO (progressivo: cada alíquota vale só para a parte do salário dentro da faixa) ===== */
  inss: {
    vigencia: 'competências a partir de janeiro/2026',
    fonte: 'Portaria Interministerial MPS/MF nº 13/2026',
    faixas: [
      { ate: 1621.00, aliquota: 0.075 },   // até 1.621,00
      { ate: 2902.84, aliquota: 0.09 },    // 1.621,01 a 2.902,84
      { ate: 4354.27, aliquota: 0.12 },    // 2.902,85 a 4.354,27
      { ate: 8475.55, aliquota: 0.14 }     // 4.354,28 a 8.475,55
    ],
    teto: 8475.55,                // salário de contribuição máximo
    contribuicaoMaxima: 988.09    // INSS máximo por mês (o que se paga com salário igual ou acima do teto)
  },

  /* ===== IMPOSTO DE RENDA RETIDO NA FONTE (tabela mensal) ===== */
  irrf: {
    vigencia: 'rendimentos pagos a partir de janeiro/2026',
    fonte: 'Lei nº 15.270/2025',
    // base de cálculo "até" → alíquota e parcela a deduzir; a última faixa vale para tudo acima
    faixas: [
      { ate: 2428.80, aliquota: 0,     deduzir: 0 },        // isento
      { ate: 2826.65, aliquota: 0.075, deduzir: 182.16 },
      { ate: 3751.05, aliquota: 0.15,  deduzir: 394.16 },
      { ate: 4664.68, aliquota: 0.225, deduzir: 675.49 },
      { ate: Infinity, aliquota: 0.275, deduzir: 908.73 }
    ],
    deducaoPorDependente: 189.59,
    // desconto simplificado mensal: usa-se o MAIOR entre ele e (INSS + dependentes)
    descontoSimplificado: 607.20,

    // REDUÇÃO de 2026: calculada sobre o RENDIMENTO BRUTO tributável do mês (não sobre a base), limitada ao imposto
    reducao: {
      ateBruto: 5000.00,              // bruto até 5.000,00 → redução de até 312,89 (o IR fica zero)
      valorMaximo: 312.89,
      faixaDecrescenteAte: 7350.00,   // 5.000,01 a 7.350,00 → redução = 978,62 − 0,133145 × bruto
      constante: 978.62,
      fatorBruto: 0.133145
                                      // acima de 7.350,00 → sem redução
    },

    // INTERPRETAÇÕES ADOTADAS (podem mudar com normas da Receita; ajuste aqui):
    reducaoNo13: true,                // a redução também vale para o 13º (tributação exclusiva)
    reducaoEmFerias: true,            // interpretação adotada: a redução também vale para férias + 1/3 (tributadas em separado)
    simplificadoNo13: false,          // 13º: tributação exclusiva, deduz INSS e dependentes (sem o desconto simplificado mensal)
    simplificadoEmFerias: true        // férias: calculadas pela tabela mensal, em separado; adotamos o mesmo critério do salário
  },

  /* ===== REGRAS DA CLT USADAS NOS CÁLCULOS ===== */
  clt: {
    fonte: 'CLT (Decreto-Lei nº 5.452/1943), Lei nº 8.036/1990 (FGTS), Lei nº 12.506/2011 (aviso prévio), Lei nº 7.418/1985 (vale-transporte), Constituição Federal art. 7º',
    fgts: 0.08,                        // depósito mensal do FGTS sobre a remuneração
    multaFgts: 0.40,                   // dispensa sem justa causa
    multaFgtsAcordo: 0.20,             // acordo (art. 484-A da CLT)
    saqueFgtsAcordo: 0.80,             // no acordo, pode sacar 80% do saldo
    tercoFerias: 1 / 3,                // adicional de 1/3 sobre férias
    diasAbonoPecuniario: 10,           // dias de férias que podem ser vendidos
    avisoPrevio: { diasBase: 30, diasPorAno: 3, diasMaximo: 90 },   // Lei 12.506/2011
    diasMinimosParaContarMes: 15,      // 13º e férias proporcionais: o mês conta com 15 dias ou mais
    jornadaMensalPadrao: 220,          // 44 horas semanais
    adicionalHoraExtra: 0.50,          // mínimo constitucional (dias úteis)
    adicionalHoraExtraDomingo: 1.00,   // domingos e feriados (convenção mais comum)
    descontoValeTransporte: 0.06,      // até 6% do salário-base
    // prazos de pagamento
    prazo13PrimeiraParcela: '30 de novembro',
    prazo13SegundaParcela: '20 de dezembro',
    diasAntecedenciaPagamentoFerias: 2,
    diasPagamentoRescisao: 10          // art. 477 da CLT: rescisão paga até 10 dias corridos após o término
  },

  /* ===== PADRÕES DO CLT x PJ (sugestões editáveis na página, não são lei) ===== */
  pj: {
    impostoPadrao: 0.06,              // alíquota inicial do Simples Nacional (Anexo III) como ponto de partida
    inssProprioPadrao: 0.11           // contribuição sobre o pró-labore no Simples
  }
});
})();
