# Warden — regras do projeto

Site estático (HTML/CSS/JS puro, sem build), publicado em wardenfinance.com.br (GitHub Pages, ver `CNAME`).

## Onde fica cada código

- **Regra geral:** o que é de uma página só fica dentro do próprio `.html` (CSS no `<style>`, JS no `<script>`).
- **Exceção — código compartilhado entre páginas fica em `/assets/`:**
  - `/assets/warden.css` — variáveis do `:root` (cores, `--accent`, `--accent-ink`), reset, tipografia (`section`, `.section-label`, `.section-title`), botões (`.btn`, `.btn-primary`, `.btn-secondary`), nav, perfil/avatar, mega-menu e menu mobile.
  - `/assets/nav.js` — monta o nav + mega-menu + menu mobile e contém a lista `FERRAMENTAS` (fonte única do mapa do hub).
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

## Ferramentas do hub

- Cada ferramenta é uma página em `/ferramentas/<slug>.html`.
- Para lançar uma: crie a página e, em `/assets/nav.js`, mude `disponivel: true` no item (o `url` já está lá). Menu, pontinho verde e contador se atualizam sozinhos.

## O que já existe (branch `warden-v2`)

- **Home (`index.html`)**, seções em ordem: `#inicio` (hero), `#cobranca` (Warden Cobrança), `#mercado`, `#noticias`, `#grafico`, `#calculadora` (juros compostos). Usa `/assets/warden.css` + `nav.js` com `data-page="home"`.
- **Nav / mega-menu / menu mobile:** gerados por `/assets/nav.js` (inclui o card "Warden Cobrança" do mega-menu e o link "Cobrança" com selo "Novo").
- **Ferramentas lançadas:** Juros compostos (`/#calculadora`, na home) e Simulador de renda fixa (`/ferramentas/simulador-renda-fixa.html`). As demais estão em `FERRAMENTAS` com `disponivel: false`.
- **Páginas legadas, fora da base compartilhada:** `app.html` (Control Finance), `escola.html`, `obrigado.html` — não carregam `warden.css`/`nav.js`; só migrar se for pedido.

## Outras regras

- Login ainda é simulado (localStorage). O modal de login só existe na home e só abre por clique (sem abrir por hash/parâmetro de URL).
- Cor de acento única: `--accent` (verde-limão). Não introduza outras cores de destaque.
- Respeitar `prefers-reduced-motion` em toda animação.
- Testar com o Live Server abrindo a **pasta do projeto** como raiz (os caminhos absolutos dependem disso).
