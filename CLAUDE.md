# Warden — regras do projeto

Site estático (HTML/CSS/JS puro, sem build), publicado em wardenfinance.com.br (GitHub Pages, ver `CNAME`).

## Onde fica cada código

- **Regra geral:** o que é de uma página só fica dentro do próprio `.html` (CSS no `<style>`, JS no `<script>`).
- **Exceção — código compartilhado entre páginas fica em `/assets/`:**
  - `/assets/warden.css` — variáveis do `:root` (cores, `--accent`, `--accent-ink`), reset, tipografia (`section`, `.section-label`, `.section-title`), botões (`.btn`, `.btn-primary`, `.btn-secondary`), nav, perfil/avatar, mega-menu, menu mobile e os estilos do modelo de ferramenta (`.tool-*`, `.result-card`).
  - `/assets/nav.js` — monta o nav + mega-menu + menu mobile + **faixa de cotações** (embaixo do nav, todas as páginas) e contém a lista `FERRAMENTAS` (fonte única do mapa do hub).
  - `/assets/footer.js` — rodapé do site, carregado pelo `nav.js` (nenhuma página precisa de tag). `FOOTER_CONFIG` no topo (redes, WhatsApp, e-mail, CNPJ, razão social): campo vazio não aparece; o WhatsApp não vai para o rodapé (só para a página de contato). Colunas de ferramentas vêm do `FERRAMENTAS` (itens com `rodape: 1..4`, nome da coluna em `curto` ou `categoria`). Páginas mostram esses dados com `data-config`, `data-config-link="whatsapp|email"` e `data-config-se`.
  - `/assets/tools.js` — kit das ferramentas (objeto global `Warden`), ver abaixo.
  - `/assets/tabelas-2026.js` — **único lugar** com números de lei do ano (INSS, IRRF e redução, salário mínimo, FGTS, multas, aviso prévio, 1/3 de férias, VT, hora extra, prazos), com vigência e fonte, em `window.WARDEN_TABELAS` (congelado). Nenhuma página nem o kit escrevem esses valores; textos explicativos usam `<span data-tabela="caminho" data-formato="brl|pct|int">`. Na virada do ano, só este arquivo muda.
  - Nunca copie esses estilos/scripts para dentro de uma página; se algo passar a ser usado por 2+ páginas, mova para `/assets/`.
- Use **caminhos absolutos** (`/assets/...`, `/warden-logo-cropped-transparent.png`) para funcionar tanto na raiz quanto em `/ferramentas/`.

## Como montar uma página nova

```html
<head>
  <!-- fontes Google (Fraunces e Inter) -->
  <link rel="stylesheet" href="/assets/warden.css">
  <style>/* só o que é desta página */</style>
</head>
<body>
  <script src="/assets/nav.js"></script>   <!-- primeiro item do body, sem async/defer -->
  <section>…</section>
</body>
```

- Na home o nav é carregado com `data-page="home"` (links viram `#secao` em vez de `/#secao`).
- Nav e faixa de cotações ficam num contêiner fixo (`.topo-fixo`); a altura total está em `--topo-h` (`--nav-h` + `--faixa-h`, em `warden.css`). A primeira `<section>` do body recebe esse recuo automaticamente; qualquer outro deslocamento abaixo do topo deve usar essas variáveis, nunca px fixos.

## Ferramentas do hub — modelo obrigatório

Cada ferramenta é uma página em `/ferramentas/<slug>.html`. Para lançar: crie a página e, em `/assets/nav.js`, mude `disponivel: true` no item (o `url` já está lá; o nome do arquivo tem que bater com ele). Menu, pontinho verde, contador e a trilha (breadcrumb) se atualizam sozinhos.

**Referências prontas:** `simulador-renda-fixa.html` (taxas do BC, cards, gráfico) e `gerador-qr-code-pix.html` (formulário + saída).

### Estrutura da página (nesta ordem)

```html
<head>
  <title>Nome claro: benefício | Warden</title>
  <meta name="description" content="…até ~160 caracteres, com a palavra-chave…">
  <link rel="canonical" href="https://wardenfinance.com.br/ferramentas/<slug>.html">
  <!-- og:type/title/description/url, theme-color, ícones, fontes, /assets/warden.css -->
  <script type="application/ld+json">{ "@type": "WebApplication", … }</script>  <!-- copiar de uma página existente -->
</head>
<body>
  <script src="/assets/nav.js"></script>
  <section class="tool-top"><div class="section-inner">
    <header class="tool-head">
      <div class="tool-crumbs" data-crumbs></div>          <!-- "Início / Ferramentas / <categoria>" automático -->
      <h1 class="tool-title">…</h1>
      <p class="tool-lead">…</p>
    </header>
    <!-- entradas em .tool-card com .tool-fields/.tool-field/.tool-input; resultado atualiza enquanto digita -->
  </div></section>
  <section class="tool-prose-section"><div class="section-inner">
    <article class="tool-prose">…explicação para iniciante (h2/h3)…
      <p class="tool-disclaimer" data-aviso-educativo>ressalvas específicas</p>
    </article>
    <div class="tool-faq" data-faq><h2>Perguntas frequentes</h2>
      <details><summary>Pergunta?</summary><div><p>Resposta.</p></div></details>  <!-- 3+ perguntas -->
    </div>
  </div></section>
  <section class="tool-bridge"><div class="section-inner">
    <div data-ponte-cobranca data-titulo="…" data-texto="…"></div>   <!-- SEMPRE: ponte para o Warden Cobrança -->
  </div></section>
  <script src="/assets/tools.js"></script>             <!-- antes do script da página -->
  <!-- Chart.js se tiver gráfico: https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js -->
  <script>/* lógica da página */</script>
</body>
```

### Kit `/assets/tools.js` (`Warden.*`)

- **Formatação:** `formatBRL`, `formatBRLCompacto` (eixos), `formatPct(v, {casas, curto, sinal})`, `formatNumero`, `parseNumero` (aceita "1.500,50", "1.500", "150.00").
- **Campos de dinheiro:** `<input type="text">` + `Warden.campoBRL(input)` (máscara de R$), lido com `parseNumero(input.value)`. Chame antes de registrar os listeners da página.
- **Taxas:** `await Warden.getTaxasBCB()` → `{ selic, cdi, ipca, fonte: 'bcb'|'referencia', datas }` (nunca falha; cache 12h). Ordem, taxa a taxa: API SGS (`api.bcb.gov.br`) → plano B no site do BC (`www.bcb.gov.br/api/servico/sitebcb/`: Meta Selic e IPCA 12m; não documentado, com parâmetro anti-cache por causa do CORS da CDN) → último valor bom de até 7 dias (`warden:taxas-ultimas`) → CDI estimado = Selic − 0,10 → `TAXAS_REFERENCIA`. `datas.<taxa>` = `{ valor, data, atualizado, origem: 'sgs'|'site'|'cache'|'estimado'|'referencia' }` (`data` pode ser `null`: o IPCA do site não traz o mês). `fonte` é `'bcb'` quando nenhuma taxa é a de referência. Renderize primeiro com `Warden.TAXAS_REFERENCIA` e atualize quando a promessa resolver; mostre ao usuário de onde veio a taxa. Os valores de reserva ficam só no `tools.js`. Para o texto da fonte use `fonteTaxa(t, qual = 'cdi')` (diz a data e se é último valor guardado ou estimado).
- **Imposto de Renda:** `IR_REGRESSIVO` e `aliquotaIR(dias)` (tabela única, usada também pelo simulador); `liquidaDeIR(iMensalBruta, meses)` → taxa mensal líquida conservadora (alíquota do prazo total descontada do rendimento de todo mês). Ferramentas que usam rendimento de CDB/Tesouro mostram o resultado líquido de IR e dizem isso na nota.
- **Renda fixa (motor do simulador):** `Warden.rendaFixa` → `prazo(qtd, 'dias'|'meses'|'anos')`, `depositos({ inicial, aporte, dias, cal })`, `opcoes(taxas, { pctCdb, pctLci })` (poupança, CDB, LCI/LCA, Tesouro Selic), `simular(op, deps, dias, cal, taxas)` (IR por depósito, rentabilidade real), `CONFIG` (regras da poupança, custódia, IOF). Usado pelo simulador e por "Poupança x CDB x Tesouro"; regra nova de renda fixa entra só aqui.
- **Trabalho (CLT):** a página carrega `/assets/tabelas-2026.js` **antes** do `tools.js`. `calcINSS(bruto)` (progressivo, com teto), `calcIRRF(bruto, inss, dependentes, { simplificado, reducao })` → `{ base, impostoTabela, reducao, irDevido, … }`, `salarioLiquido(bruto, dependentes)`, `impostos13(bruto13, dep)` e `impostosFerias(bruto, dep)` (aplicam as flags de interpretação das tabelas), `centavos(v)` (arredonda meio centavo para cima, sem erro de ponto flutuante). O INSS é arredondado antes de entrar na base do IR.
- **Rendimento escolhido pela pessoa:** `<div class="tool-rendimento" data-rendimento></div>` no formulário + `const rend = Warden.campoRendimento(el, calcular)` → `rend.ler(meses)` devolve `{ i, ir, texto }` (CDI do dia líquido de IR / outra taxa com caixa "Descontar IR" / sem rendimento). Use sempre que a ferramenta depender de quanto o dinheiro rende; mostre `texto` numa `.tool-obs`.
- **Pix (BR Code):** `Warden.pix` → `montarPayload({ chave, nome, cidade, valor, descricao, txid })` (Pix copia e cola com CRC16), `validarChave(tipo, texto)` (cpf|cnpj|celular|email|aleatoria), `validarValor`, `limparNome`/`limparDescricao`, `mascaraChave`, `TIPOS_CHAVE`, `desenharQR(canvas, payload, px)` (precisa da qrcodejs 1.0.0 do cdnjs). Usado pelo gerador de Pix e pelo Warden Cobrança; regra de Pix nova entra só aqui.
- **Telefone/WhatsApp:** `validarTelefone(texto)` → `{ vazio, ok, numero, erro }` (DDD válido; celular com 9 ou fixo), `mascaraTelefone` ("(11) 98765-4321").
- **Documentos e textos:** `validarCpf`, `validarCnpj`, `validarDocumento(v)` → `{ vazio, ok, tipo, erro }`, `mascaraCpf`/`mascaraCnpj`/`mascaraDocumento` (CPF ou CNPJ pelo tamanho), `valorPorExtenso(valor)` ("mil duzentos e trinta e quatro reais e cinquenta e seis centavos"), `formatDataLonga('aaaa-mm-dd')` ("2 de outubro de 2026"), `linkWhatsApp(texto)` (wa.me sem número).
- **PDF e impressão:** a página carrega o jsPDF 2.5.1 (cdnjs); `const doc = Warden.novoPdf()` (A4 em mm, faixa verde-limão), todo texto via `textoPdf(s)`, `rodapePdf(doc)` ("Gerado com Warden · wardenfinance.com.br"), `doc.save(nome)`. Imagens com `addImage(..., 'FAST')` para comprimir. `Warden.imprimir(elemento)` imprime só a prévia `.tool-papel`.
- **Copiar/compartilhar:** `await Warden.copiarTexto(texto)` → `true`/`false` (com plano B e limite de tempo); se `false`, diga à pessoa para copiar manualmente.
- **Matemática:** `taxaMensalDe(valorPct, 'am'|'aa')` (campo de juros com select de período), `parcelaPrice(pv, i, n)`, `taxaMensal(anualPct)`, `aporteNecessario(meta, atual, iMensal, meses)` (depósitos no fim do mês), `serieAcumulacao(atual, aporte, iMensal, meses)` (série mês a mês para gráfico).
- **Componentes:** `cardResultado({ titulo, descricao, rotulo, valor, linhas, destaque, selo })` (HTML do `.result-card`); `demonstrativo([{ rotulo, valor, tipo: 'mais'|'menos'|'info'|'subtotal'|'total', nota, tag }])` (HTML das linhas de um `<ul class="tool-demo">`: holerite, 13º, férias, rescisão); `barraComposicao([{ nome, valor, cor }], total)` → `{ barra, legenda }` para `.tool-barra` + `.tool-barra-legenda`; `estiloGrafico()` (cores, tooltip, legenda, `prefers-reduced-motion` do Chart.js: o destaque é sempre `--accent`, o resto em `--text`/`--muted`/`neutros`).
- **Classes prontas (warden.css):** `.result-grid` (grade de cards), `.tool-progress` + `.tool-progress-legenda` (barra de progresso), `.tool-pillset`/`.tool-pills`/`.tool-pill` (escolha em pílulas), `.tool-chart` + `.tool-chart-box` (card de gráfico), `.tool-details` + `.tool-table-wrap` + `.tool-table` (tabela recolhível, ex.: amortização; `tr.destaque` marca uma linha), `.tool-doc` + `.tool-doc-previa` (formulário à esquerda, prévia em papel à direita) com `.tool-papel` + `.tool-papel-rodape`, `.tool-acoes` (botões de ação; `disabled`/`aria-disabled` já estilizados), `.tool-add`/`.tool-remover` (listas editáveis), `.tool-veredito` (a resposta numa frase grande, com `<em>` em destaque), `.tool-note` (aviso), `.tool-obs` (nota pequena), `<span class="opc">(opcional)</span>` no rótulo.
- **Componentes declarados no HTML** (o kit completa ao carregar): `data-tabela` (valor das tabelas oficiais no texto; num `<summary>` do FAQ, envolva a pergunta toda num `<span>`), `data-crumbs` (+ schema BreadcrumbList), `data-ponte-cobranca`, `data-aviso-educativo` ("Simulação educativa. Não é recomendação de investimento." + texto do elemento), `data-faq` (gera o schema FAQPage a partir dos `<details>`; o texto fica no HTML para o Google).

### Conteúdo

- Linguagem de iniciante, sem jargão sem explicação. Explique a fórmula/regra usada.
- Ferramenta de investimento/planejamento: aviso educativo obrigatório.
- Ponte para o Cobrança sempre no fim, com texto ligado ao tema da página.
- Links internos entre ferramentas relacionadas (ex.: reserva → simulador de renda fixa).

## O que já existe (branch `warden-v2`)

- **Home (`index.html`)**, seções em ordem: `#inicio` (hero em vídeo, só se ativado) e `#cobranca` (Warden Cobrança; o botão leva a `/cobranca/` e o link discreto "Ver planos" a `/cobranca/#planos`). Os juros compostos são uma ferramenta como as outras (`/ferramentas/juros-compostos.html`). O `<h1>` é oculto (`.sr-only`: "Warden: ferramentas financeiras gratuitas e cobrança automática no WhatsApp"); com o hero ativo e com título, o título do vídeo vira o `<h1>` e o oculto sai. Usa `/assets/warden.css` + `nav.js` com `data-page="home"`.
- **Nav / mega-menu / menu mobile:** gerados por `/assets/nav.js` (links: Ferramentas, Cobrança com selo "Novo", Control Finance, Login; o rodapé do mega-menu é só o card "Warden Cobrança", na largura toda). **Todo link para o Warden Cobrança aponta para `/cobranca/`** (nav, "Conhecer" do mega-menu e do menu mobile, rodapé, ponte `data-ponte-cobranca` das ferramentas, contato); nenhum abre o WhatsApp de suporte. No celular, hambúrguer, Login e logo têm área de toque de 44px.
- **Faixa de cotações:** USD, EUR, GBP, BTC e ETH (AwesomeAPI, uma chamada) + SELIC, CDI e IPCA 12M (`Warden.getTaxasBCB`; o `nav.js` injeta o `tools.js` nas páginas que não o carregam). Atualiza a cada 60 s, cache em `localStorage` (`warden:cotacoes`). Moeda sem dado mostra "—"; taxa só aparece com dado do BC (API, site ou último valor de até 7 dias), com a data no `title` — CDI estimado e valor de referência não aparecem, o item some. Rolagem por Web Animations (0 → -50%, ~40 px/s, pausa com mouse/toque, sem animação com `prefers-reduced-motion`). Verde/vermelho de alta/queda são a única exceção à cor de acento.
- **Warden Cobrança grátis (`/cobranca/index.html`):** funciona 100% no navegador. Dados em `localStorage` (`warden:cobranca`, estrutura `{ versao: 1, clientes, cobrancas, config }` com ids e datas em todo registro, pensada para sincronizar com uma conta no futuro); exportar/importar backup JSON (também no 1º passo). Onboarding em 3 passos (negócio, chave Pix, recebedor/cidade), abas Painel / Clientes / Cobranças / Configurações ("Ajustes" no celular). Enviar = mensagem no tom escolhido (Gentil/Neutro/Firme, modelos editáveis com `{nome}` `{valor}` `{vencimento}` `{descricao}` `{negocio}` `{pix}`) + Pix da cobrança (`Warden.pix`, txid por cobrança) → link `wa.me/55NÚMERO` do cliente; registra o lembrete no histórico. Mensagens do plano grátis terminam com "Enviado pelo Warden Cobrança · wardenfinance.com.br/cobranca" (sempre por último, fora dos modelos editáveis); com `PLANO = 'premium'` (constante no script; hoje sempre `'gratis'`, no futuro virá da conta) a linha não entra. Mensal paga gera a do mês seguinte uma vez (dia 31 → último dia do mês). Limite grátis: 5 clientes (o 6º abre o modal do Premium). **Vitrine do Premium:** seção `#planos` e modal com a mesma tabela Grátis x Premium (`htmlPlanos`); `PREMIUM = { preco: "", ativo: false }` no topo do script da página: com `ativo: false`, botão "Em breve" desabilitado e "O Premium está chegando"; com `ativo: true`, mostra `preco` e "Quero o Premium" (leva ao contato). Não invente preço. Atrasadas em vermelho (#EF4444), exceção pedida à cor de acento, como a alta/queda da faixa.
- **Ferramentas lançadas:** veja os itens com `disponivel: true` em `FERRAMENTAS` (`/assets/nav.js`) — é a lista oficial.
- **Rodapé:** marca + redes (só as preenchidas; sem nenhuma, o espaço some), 5 colunas de ferramentas + "Warden" (Cobrança, Control Finance, Sobre, Contato, Privacidade, Termos) e a linha final "© ano Warden Finance. Todos os direitos reservados." (+ razão social/CNPJ se preenchidos). O aviso educativo fica em cada ferramenta, não no rodapé. Desktop: colunas abertas; até 900px: acordeão (`<details>`).
- **Páginas institucionais** (raiz, mesmo visual das ferramentas, sem o modelo de ferramenta, schema `WebPage`): `sobre.html` (bloco `#historia` para a história), `contato.html`, `privacidade.html` e `termos.html` (rascunhos: revisar com advogado). Geradas com o mesmo `<head>`; ao mudar o site (novo serviço de terceiros, nova chave no `localStorage`, nova coleta de dados), atualize a Política de Privacidade.
- **SEO:** `sitemap.xml` (home, /cobranca/, 29 ferramentas e 4 institucionais) e `robots.txt`. Página nova entra no sitemap.
- **Não use `<nav>` dentro do conteúdo:** `warden.css` estiliza `nav` como o menu do topo. Para trilhas e listas de links, use `<div role="navigation" aria-label="…">`.
- **Páginas legadas, fora da base compartilhada:** `app.html` (Control Finance), `escola.html`, `obrigado.html` — não carregam `warden.css`/`nav.js`; só migrar se for pedido.

## Hero em vídeo (home)

Pronto e desligado. Para ativar, no topo do `index.html`:

```js
const HERO_VIDEO = { ativo: true, mp4: "/assets/video/hero.mp4", webm: "/assets/video/hero.webm", poster: "/assets/video/hero.jpg", titulo: "" };
```

- **Arquivos** em `/assets/video/` (caminhos absolutos). Vídeo de **até ~4 MB**, **1080p**, **10–20 s em loop**, **sem áudio**; mande MP4 (H.264) e, se possível, WebM (menor, tem prioridade). O **poster** (JPG, mesmo enquadramento, ~200 KB) é obrigatório na prática: é o que aparece no celular, com `prefers-reduced-motion` ou com economia de dados (`navigator.connection.saveData`) — nesses casos o vídeo nem é baixado.
- **titulo** (opcional): frase curta sobre o vídeo; vira o `<h1>` da home. Vazio = sem texto, e o `<h1>` oculto continua.
- `ativo: false` = a seção não existe (nem espaço). A sobreposição escura em gradiente já garante a leitura do título e do nav.

## Outras regras

- Login ainda é simulado (localStorage). O modal de login só existe na home e só abre por clique (sem abrir por hash/parâmetro de URL).
- Cor de acento única: `--accent` (verde-limão). Não introduza outras cores de destaque.
- Números: Inter com `font-variant-numeric: tabular-nums` (já vale no `body` e nos campos). Não use fonte monoespaçada.
- Respeitar `prefers-reduced-motion` em toda animação.
- Testar com o Live Server abrindo a **pasta do projeto** como raiz (os caminhos absolutos dependem disso).

## Testes automáticos (Playwright, pasta `tests/`)

- **Durante o desenvolvimento, rode só os testes da área mexida**, de dentro de `tests/`: `npx playwright test cobranca` (o filtro é o nome do arquivo em `tests/specs/`, ex.: `home`, `rodape`, `calculo-clt`). Assim o `RELATORIO.md` não é reescrito com uma rodada parcial.
- **A bateria completa (`npm test`, que também gera o `RELATORIO.md`) só antes de lançar ou quando for pedido.** Nunca rode a bateria completa mais de uma vez por tarefa.
- O servidor dos testes usa a porta 8765; se uma rodada travar, confira se sobrou `node.exe`/`chrome.exe` escutando nela antes de rodar de novo.
