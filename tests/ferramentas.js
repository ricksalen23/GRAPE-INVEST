// As 29 ferramentas do hub (todas em /ferramentas) e as demais páginas testadas.
// O teste de páginas confere que esta lista bate com o FERRAMENTAS do /assets/nav.js (fonte oficial do menu).
const FERRAMENTAS = [
  // Investimentos
  { slug: 'juros-compostos', url: '/ferramentas/juros-compostos.html', nome: 'Juros compostos' },
  { slug: 'simulador-renda-fixa', url: '/ferramentas/simulador-renda-fixa.html', nome: 'Simulador renda fixa' },
  { slug: 'poupanca-x-cdb-x-tesouro', url: '/ferramentas/poupanca-x-cdb-x-tesouro.html', nome: 'Poupança x CDB x Tesouro' },
  { slug: 'viver-de-renda', url: '/ferramentas/viver-de-renda.html', nome: 'Viver de renda' },
  { slug: 'dividendos-e-preco-teto', url: '/ferramentas/dividendos-e-preco-teto.html', nome: 'Dividendos e preço teto' },
  { slug: 'rentabilidade-real', url: '/ferramentas/rentabilidade-real.html', nome: 'Rentabilidade real' },
  { slug: 'conversor-de-taxas', url: '/ferramentas/conversor-de-taxas.html', nome: 'Conversor de taxas' },
  // Trabalho (CLT)
  { slug: 'salario-liquido', url: '/ferramentas/salario-liquido.html', nome: 'Salário líquido' },
  { slug: 'rescisao', url: '/ferramentas/rescisao.html', nome: 'Rescisão' },
  { slug: 'ferias', url: '/ferramentas/ferias.html', nome: 'Férias' },
  { slug: 'decimo-terceiro', url: '/ferramentas/decimo-terceiro.html', nome: '13º salário' },
  { slug: 'hora-extra', url: '/ferramentas/hora-extra.html', nome: 'Hora extra' },
  { slug: 'clt-x-pj', url: '/ferramentas/clt-x-pj.html', nome: 'CLT x PJ' },
  // MEI e autônomo
  { slug: 'quanto-cobrar-por-hora', url: '/ferramentas/quanto-cobrar-por-hora.html', nome: 'Quanto cobrar por hora' },
  { slug: 'markup-e-margem', url: '/ferramentas/markup-e-margem.html', nome: 'Markup e margem' },
  { slug: 'ponto-de-equilibrio', url: '/ferramentas/ponto-de-equilibrio.html', nome: 'Ponto de equilíbrio' },
  { slug: 'gerador-de-recibo', url: '/ferramentas/gerador-de-recibo.html', nome: 'Gerador de recibo' },
  { slug: 'gerador-qr-code-pix', url: '/ferramentas/gerador-qr-code-pix.html', nome: 'Gerador de QR Code Pix' },
  { slug: 'gerador-de-orcamento', url: '/ferramentas/gerador-de-orcamento.html', nome: 'Gerador de orçamento' },
  // Dívidas e consumo
  { slug: 'plano-de-quitacao', url: '/ferramentas/plano-de-quitacao.html', nome: 'Plano de quitação' },
  { slug: 'sac-x-price', url: '/ferramentas/sac-x-price.html', nome: 'SAC x Price' },
  { slug: 'consorcio-x-financiamento', url: '/ferramentas/consorcio-x-financiamento.html', nome: 'Consórcio x financiamento' },
  { slug: 'juros-do-cartao', url: '/ferramentas/juros-do-cartao.html', nome: 'Juros do cartão' },
  { slug: 'a-vista-ou-parcelado', url: '/ferramentas/a-vista-ou-parcelado.html', nome: 'À vista ou parcelado?' },
  { slug: 'custo-real-em-horas', url: '/ferramentas/custo-real-em-horas.html', nome: 'Custo real em horas' },
  // Planejamento
  { slug: 'reserva-de-emergencia', url: '/ferramentas/reserva-de-emergencia.html', nome: 'Reserva de emergência' },
  { slug: 'regra-50-30-20', url: '/ferramentas/regra-50-30-20.html', nome: 'Regra 50-30-20' },
  { slug: 'meta-mensal', url: '/ferramentas/meta-mensal.html', nome: 'Meta mensal' },
  { slug: 'aposentadoria', url: '/ferramentas/aposentadoria.html', nome: 'Aposentadoria' }
];

// páginas institucionais (rodapé): sem o modelo de ferramenta (sem WebApplication/FAQ)
const INSTITUCIONAIS = [
  { slug: 'sobre', url: '/sobre.html', nome: 'Sobre', tipo: 'institucional' },
  { slug: 'contato', url: '/contato.html', nome: 'Contato', tipo: 'institucional' },
  { slug: 'privacidade', url: '/privacidade.html', nome: 'Política de Privacidade', tipo: 'institucional' },
  { slug: 'termos', url: '/termos.html', nome: 'Termos de Uso', tipo: 'institucional' }
];
// páginas para os testes de página (SEO, celular, faixa, rodapé): a home, o Warden Cobrança, as 29 ferramentas e as 4 institucionais
const PAGINAS = [{ slug: 'home', url: '/index.html', nome: 'Home' }, { slug: 'cobranca', url: '/cobranca/', nome: 'Warden Cobrança' }, ...FERRAMENTAS, ...INSTITUCIONAIS];

module.exports = { FERRAMENTAS, PAGINAS, INSTITUCIONAIS };
