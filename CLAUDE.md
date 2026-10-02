# Warden — regras do projeto

Site estático (HTML/CSS/JS puro, sem build), publicado em wardenfinance.com.br (GitHub Pages, ver `CNAME`).

## Onde fica cada código

- **Regra geral:** o que é de uma página só fica dentro do próprio `.html` (CSS no `<style>`, JS no `<script>`).
- **Exceção — código compartilhado entre páginas fica em `/assets/`:**
  - `/assets/warden.css` — variáveis do `:root` (cores, `--accent`, `--accent-ink`), reset, tipografia (`section`, `.section-label`, `.section-title`), botões (`.btn`, `.btn-primary`, `.btn-secondary`), nav, perfil/avatar, mega-menu, menu mobile e os estilos do modelo de ferramenta (`.tool-*`, `.result-card`).
  - `/assets/nav.js` — monta o nav + mega-menu + menu mobile e contém a lista `FERRAMENTAS` (fonte única do mapa do hub).
  - `/assets/tools.js` — kit das ferramentas (objeto global `Warden`), ver abaixo.
  - Nunca copie esses estilos/scripts para dentro de uma página; se algo passar a ser usado por 2+ páginas, mova para `/assets/`.
- Use **caminhos absolutos** (`/assets/...`, `/warden-logo-cropped-transparent.png`) para funcionar tanto na raiz quanto em `/ferramentas/`.

## Como montar uma página nova

```html
<head>
  <!-- fontes Google (Fraunces, Inter, IBM Plex Mono) -->
  <link rel="stylesheet" href="/assets/warden.css">
  <style>/* só o que é desta página */</style>
</head>
<body>
  <script src="/assets/nav.js"></script>   <!-- primeiro item do body, sem async/defer -->
  <section>…</section>
</body>
```

- Na home o nav é carregado com `data-page="home"` (links viram `#secao` em vez de `/#secao`).
- A primeira `<section>` do body recebe automaticamente o recuo do nav fixo.

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
- **Taxas:** `await Warden.getTaxasBCB()` → `{ selic, cdi, ipca, fonte: 'bcb'|'referencia' }` (API SGS, cache 12h, nunca falha). Renderize primeiro com `Warden.TAXAS_REFERENCIA` e atualize quando a promessa resolver; mostre ao usuário de onde veio a taxa. Os valores de reserva ficam só no `tools.js`. Para o texto da fonte use `fonteTaxa(t)`.
- **Matemática:** `taxaMensal(anualPct)`, `aporteNecessario(meta, atual, iMensal, meses)` (depósitos no fim do mês), `serieAcumulacao(atual, aporte, iMensal, meses)` (série mês a mês para gráfico).
- **Componentes:** `cardResultado({ titulo, descricao, rotulo, valor, linhas, destaque, selo })` (HTML do `.result-card`); `estiloGrafico()` (cores, tooltip, legenda, `prefers-reduced-motion` do Chart.js: o destaque é sempre `--accent`, o resto em `--text`/`--muted`/`neutros`).
- **Classes prontas (warden.css):** `.result-grid` (grade de cards), `.tool-progress` + `.tool-progress-legenda` (barra de progresso), `.tool-pillset`/`.tool-pills`/`.tool-pill` (escolha em pílulas), `.tool-chart` + `.tool-chart-box` (card de gráfico), `.tool-note` (aviso), `.tool-obs` (nota pequena), `<span class="opc">(opcional)</span>` no rótulo.
- **Componentes declarados no HTML** (o kit completa ao carregar): `data-crumbs` (+ schema BreadcrumbList), `data-ponte-cobranca`, `data-aviso-educativo` ("Simulação educativa. Não é recomendação de investimento." + texto do elemento), `data-faq` (gera o schema FAQPage a partir dos `<details>`; o texto fica no HTML para o Google).

### Conteúdo

- Linguagem de iniciante, sem jargão sem explicação. Explique a fórmula/regra usada.
- Ferramenta de investimento/planejamento: aviso educativo obrigatório.
- Ponte para o Cobrança sempre no fim, com texto ligado ao tema da página.
- Links internos entre ferramentas relacionadas (ex.: reserva → simulador de renda fixa).

## O que já existe (branch `warden-v2`)

- **Home (`index.html`)**, seções em ordem: `#inicio` (hero), `#cobranca` (Warden Cobrança), `#mercado`, `#noticias`, `#grafico`, `#calculadora` (juros compostos). Usa `/assets/warden.css` + `nav.js` com `data-page="home"`.
- **Nav / mega-menu / menu mobile:** gerados por `/assets/nav.js` (inclui o card "Warden Cobrança" do mega-menu e o link "Cobrança" com selo "Novo").
- **Ferramentas lançadas:** veja os itens com `disponivel: true` em `FERRAMENTAS` (`/assets/nav.js`) — é a lista oficial.
- **Páginas legadas, fora da base compartilhada:** `app.html` (Control Finance), `escola.html`, `obrigado.html` — não carregam `warden.css`/`nav.js`; só migrar se for pedido.

## Outras regras

- Login ainda é simulado (localStorage). O modal de login só existe na home e só abre por clique (sem abrir por hash/parâmetro de URL).
- Cor de acento única: `--accent` (verde-limão). Não introduza outras cores de destaque.
- Respeitar `prefers-reduced-motion` em toda animação.
- Testar com o Live Server abrindo a **pasta do projeto** como raiz (os caminhos absolutos dependem disso).
