## Revisão — o que foi encontrado

### Problemas corrigidos (um commit cada)

| Commit | O que era |
|---|---|
| `44090af` | **Bug real no kit:** o campo de R$ (`Warden.campoBRL`) lia "1500.50" como R$ 150.050,00 quando o texto chegava de uma vez (preenchimento automático, ditado, alguns teclados de celular). Afetava todos os campos de dinheiro. Agora o texto inteiro é tratado como colado. |
| `00c8277` | Juros compostos (home) não dizia a convenção do aporte. A conta usa **aporte no fim do mês** (1.000 + 200/mês a 1% por 12 meses = R$ 3.663,33; no início daria 3.688,70). Agora está escrito abaixo do resultado. |
| `f68b53b` | Home sem `<link rel="canonical">`. |
| `ad0ffd6` | Home: o seletor meses/anos da calculadora não tinha rótulo para leitor de tela. |
| `59a7369` | SEO: descriptions do simulador (173 caracteres) e do Pix (187) passavam do limite que o Google mostra; title da aposentadoria (72) perdia o "\| Warden". |
| `b75fa37` | Contraste: lacunas cinza da prévia do recibo e do orçamento (2,4:1) e rodapé "Gerado com Warden" da prévia em papel (3,6:1) abaixo do mínimo de 4,5:1. |
| `9e08c21` | Contraste na home: "Cursos chegando em breve" e "Notícias indisponíveis no momento" (2,8:1 sobre o preto). |
| `9ee9bd5` | Simulador e Pix (as duas páginas anteriores ao modelo) não tinham o bloco de Perguntas frequentes nem o schema FAQPage. Cada uma ganhou 4 perguntas. |

### Erros de cálculo

**Nenhum.** Todos os valores de referência pedidos bateram (dentro de R$ 0,01, e R$ 5 no Tesouro Selic), inclusive o CRC `E9B5` do Pix e as tabelas de INSS/IR de 2026. As ferramentas sem valor dado foram conferidas com contas feitas à mão, explicadas no próprio teste (`specs/calculo-*.spec.js`).

### Observações

- **São 29 ferramentas, não 30:** todas em `/ferramentas` (os juros compostos saíram da home e viraram página própria em outubro/2026). É o que está no `FERRAMENTAS` do `nav.js` e todas estão com `disponivel: true`.
- **Taxas do BC:** os testes injetam Selic 13,75 / CDI 13,65 / IPCA 4,22 para os números serem fixos. Um teste à parte bloqueia a API e confirma que as páginas mostram "valores de referência" e continuam calculando.
- **Data fixa:** os testes rodam como se fosse 02/10/2026 12h (Brasília), para prazos, validade de orçamento e rescisão não mudarem com o dia.

### Limites desta revisão

- "Mensagem amigável" foi verificada como ausência de `NaN`, `Infinity`, `undefined`, `[object …]` e notação científica na página, sem erro no console. O texto de cada aviso não foi lido um por um.
- Acessibilidade é a básica automática: rótulos, nome dos botões e contraste do texto visível. Não substitui um teste com leitor de tela de verdade.
- Botões de compartilhar: o link do WhatsApp e o conteúdo copiado são conferidos, mas o WhatsApp não é aberto. PDF e PNG são baixados e conferidos pelo nome e pelo cabeçalho do arquivo, não pelo visual.
- Screenshots (375px e 1440px) ficam em `tests/screenshots/`, fora do git, para olhar à mão.
- A home carrega o widget do TradingView (iframe de terceiros). Com várias páginas abertas ao mesmo tempo, o carregamento completo dela passou de 1 minuto nesta máquina (que também tem um antivírus injetando scripts nas páginas). Por isso os testes esperam o `load` por no máximo 20 s e seguem a partir do momento em que os scripts da página já rodaram.

### Como rodar

```
cd tests
npm install        # uma vez
npm test           # roda tudo e reescreve este RELATORIO.md
```

Usa o Chrome instalado na máquina (não baixa navegador) e sobe um servidor local na porta 8765.
