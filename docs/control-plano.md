# Warden Control — plano e estado

App pago da Warden (R$ 9,90/mês), refeito do zero em `/control/` (o antigo foi perdido, nunca esteve no GitHub).
Este arquivo é a fonte da verdade para continuar o trabalho em outra conversa: leia junto com o `CLAUDE.md`.

## Regras de trabalho (valem para todas as etapas)

- **Branch `warden-v2`. Nunca push na `main`.**
- **Ao fim de CADA etapa: rodar só os testes da área (`cd tests && npx playwright test control`), commit e `git push origin warden-v2`.** Se o push falhar, parar e avisar.
- Etapas marcadas **[REVISÃO]**: parar ao terminar e mostrar screenshots em **390px e 1440px** (ver "Screenshots" abaixo). Só seguir com o OK do dono.
- Uma etapa por vez, na ordem.
- **Não mexer** no site, nas ferramentas, na Cobrança, no hero nem no `app.html` (Control Finance antigo, ainda no menu). Exceção autorizada: a Etapa 7 acrescenta um botão em Pix, Recibo e Cobrança (sem mudar o que já existe). Ligar o Control ao menu só quando o dono pedir (ver "Como ligar ao menu").
- **O Control não reproduz nada de `/ferramentas`** (calculadoras, simuladores, cobrança, MEI, Pix). Ele guarda e organiza a vida financeira; as ferramentas calculam.
- Mobile-first, performance boa, **dinheiro sempre em centavos inteiros**, `localStorage` com chave versionada, `prefers-reduced-motion` respeitado.
- Identidade Warden: preto, `--accent` verde-limão como único destaque (exceção: vermelho/amarelo/verde suaves dos status e prazos), Fraunces nos títulos, Inter com números tabulares, visual de "extrato de banco premium".
- O `package-lock.json` solto na raiz não entra nos commits (criado sem querer).
- Git desta máquina (Ubuntu): identidade configurada só no repositório (`Warden Finance <196851893+ricksalen23@users.noreply.github.com>`), igual aos commits anteriores. `gh` logado como `ricksalen23`.

## Estado atual

| Etapa | Situação |
|---|---|
| 1. Núcleo "Recebi / Paguei" [REVISÃO] | **Concluída e aprovada** — commit `50b2b67` |
| 2. "Meu mês" [REVISÃO] | próxima |
| 3. Relatório + WhatsApp | pendente |
| 4. Orientador [REVISÃO] | pendente |
| 5. Plano e assinatura (demonstração) | pendente |
| 6. Efeitos visuais | pendente |
| 7. "Salvar no Control" | pendente |
| Fechamento | pendente |

### Arquivos

- `control/index.html` — esqueleto: barra lateral (desktop), barra do topo (logo no celular, seletor de perfil, Desfazer, "Novo lançamento" no desktop), `<main id="tela">`, navegação inferior + botão flutuante (celular), toast, janelas `<dialog>` (`#dlg-lanc` novo/editar, `#dlg-detalhe`, `#dlg-saldo`, `#dlg-confirmar`). `noindex` enquanto não for lançado.
- `control/control.css` — estilos do app (prefixo `.ctl-`), mobile-first; desktop a partir de 900px.
- `control/nucleo.js` — **regras sem tela** em `window.ControlNucleo`: datas, dinheiro, migração/validação, status, criar/editar/baixar/excluir, recorrências, fluxo, resumo do mês, CSV, backup. Regra nova de dinheiro/data entra aqui.
- `control/app.js` — telas e interações; expõe `window.WardenControl = { db, render, desfazer, toast, abrirLancamento, abrirDetalhe }` (testes e próximas etapas).
- `tests/specs/control.spec.js` — 19 testes (todos passando na Etapa 1).
- `tests/playwright.config.js` — no Linux usa o Chromium do Playwright (`npx playwright install chromium` uma vez; `npm ci` em `tests/`); no Windows/Mac, o Chrome instalado. `PW_CHANNEL` força um canal.

### Decisões tomadas

- **O Control não carrega o `/assets/nav.js`** (nem nav do site, nem faixa de cotações): é um app com barra lateral/inferior própria. Usa o `/assets/warden.css` para cores, fontes e `.btn`. Não usar `<nav>` nem `<section>` no app (o `warden.css` estiliza esses elementos para o site); usar `<div role="navigation">`.
- **Arquivos próprios em `/control/`** (pedido do dono), em vez de tudo dentro do `.html`.
- **Dados:** `localStorage` chave `warden:control:v1`, objeto com `versao: 1`. `migrar()` limpa e valida tudo que vem do armazenamento ou de um backup, mantém campos desconhecidos (de etapas futuras) e recusa backup de versão mais nova. Dados corrompidos → começa vazio, sem quebrar.
- **Dinheiro:** centavos inteiros em todo lugar. `parseCentavos("1.500,50")` → `150050`, sem passar por float (aceita "1.500", "150.00", "12,5"; saldo inicial aceita sinal de menos no app). `formatBRL` usa o menos tipográfico (`− R$ 1,00`). Parcelas: `repartir(total, n)`, a sobra de centavos vai para as primeiras.
- **Datas:** texto `aaaa-mm-dd` no calendário de `America/Sao_Paulo` (`hoje()` usa `Intl` com o fuso); contas de dias em UTC. `addMeses` mantém o dia de origem (31 → último dia do mês).
- **Baixa:** cada baixa é `{ id, data, valor (dinheiro que mexeu), desconto, juros }`; abate da conta `valor + desconto − juros`. `restante = valor − soma dos abatimentos`. Não deixa abater mais do que falta (juros vão no campo próprio). Status: `paga` | `parcial` (com `atrasada` à parte) | `atrasada` | `hoje` | `previsto` (rótulo "Prevista"/"Recebida" para receber).
- **Círculo da linha:** conta em aberto → baixa total hoje com o que falta; conta paga → reabre (remove as baixas). Ambos com toast "Desfazer" de 5 s.
- **Desfazer:** toda mudança passa por `mudar(rotulo, fn)` / `substituirDb(rotulo, novo)` no `app.js`, que guardam a cópia anterior (pilha de até 30, só na memória). O botão da barra desfaz a última; Ctrl/Cmd+Z também. Trocar o perfil e "Ocultar primeiros passos" não entram na pilha.
- **Recorrência:** modelo em `db.recorrencias` (`freq` mensal/semanal/anual, `inicio`, `dia`, `fim`, `excluidas`). `gerarRecorrencias(db, hoje)` cria as contas até **hoje + 90 dias**, sem duplicar (chave = recorrência + data original `ocorrencia`). Roda ao abrir, ao importar backup e quando o dia vira com o app aberto. Excluir "só esta" grava em `excluidas`; "esta e as próximas" define `fim`. Editar com "Aplicar também às próximas" muda o modelo e as próximas sem baixa.
- **Parcelamento:** N contas com o mesmo `grupoId` e `parcela: { n, total }`; o valor digitado é o total. Excluir "esta e as próximas" apaga as seguintes sem baixa.
- **Perfis:** cada conta é `pessoal` ou `negocio`; o seletor (Tudo/Pessoal/Negócio) filtra tudo e fica em `config.perfil`. Saldo inicial separado por perfil (`config.saldoInicial = { pessoal, negocio }`).
- **Saldo de hoje** = saldo inicial + todas as baixas de receber até hoje − todas as de pagar. **Fluxo:** contas em aberto entram no vencimento; atrasadas entram hoje. Alerta no primeiro dia em que o saldo previsto fica negativo (até 90 dias).
- **Relatório (tela):** pelo dia em que o dinheiro mexeu (data da baixa): recebido, pago, resultado, "onde mais gastou" (pagamentos por categoria), em aberto no mês. A Etapa 3 acrescenta PDF/imagem/texto/WhatsApp.
- **"UM botão Novo lançamento por tela":** no desktop fica na barra do topo; no celular é o flutuante. Some no estado vazio (que tem os dois botões grandes "Tenho uma conta a pagar" / "Tenho algo a receber") e em Ajustes (`body[data-sem-novo]`).
- **Filtros** só aparecem quando há contas; padrão "Em aberto". Busca ignora acento e não perde o foco (só a lista é redesenhada).
- **Categorias padrão** (`CATEGORIAS_PADRAO` no núcleo) têm `icone` (chave do SVG em `app.js`, objeto `P`), para o "Meu mês" usar. Excluir categoria move as contas para "Outros…" do mesmo tipo.
- **Backup:** `{ app: 'warden-control', versao, exportadoEm, dados }`; importar substitui tudo (com confirmação e Desfazer). **CSV:** `;` e vírgula decimal, com BOM, para o Excel em português.

### Modelo de dados (v1)

```js
{
  versao: 1, criadoEm, atualizadoEm,
  config: { saldoInicial: { pessoal, negocio }, saldoDefinido, perfil: 'tudo'|'pessoal'|'negocio',
            primeirosPassosOcultos, ultimoPerfil, categorias: [{ id, nome, tipo: 'pagar'|'receber', icone }] },
  contas: [{ id, tipo, descricao, valor, vencimento, categoriaId, contato, forma, obs, perfil,
             grupoId, parcela: { n, total } | null, recorrenciaId, ocorrencia, modeloId,
             baixas: [{ id, data, valor, desconto, juros, criadoEm }], criadoEm, atualizadoEm }],
  recorrencias: [{ id, tipo, descricao, valor, categoriaId, contato, forma, obs, perfil,
                   freq, inicio, dia, fim, excluidas: [], criadoEm }]
}
```

`modeloId` já existe na conta (reservado para o "Meu mês"). Campo novo de etapa futura: adicionar em `limparConta`/`migrar` no núcleo e no `dbVazio()`. Se a estrutura mudar de forma incompatível, subir para `versao: 2`, com migração da v1.

### Testes e screenshots

- Rodar: `cd tests && npx playwright test control` (nunca a bateria completa mais de uma vez por tarefa). Relógio fixo em **02/10/2026 12:00** (`helpers.js`).
- No spec: `base({ contas, recorrencias, saldo, config })` monta um db pronto; `abrirCom(page, db, tela)` semeia o `localStorage` uma vez por aba; `lerDb(page)`; `linha(page, 'Descrição')`. Depois de confirmar uma janela (`#dlg-confirmar`), ler o db com `expect.poll` (a resposta chega no evento `close`).
- **Screenshots** para as revisões vão em `tests/capturas/control/etapaN/` (fora do git). No celular, a captura foi feita com a janela de 390px esticada até a altura da página (assim a navegação inferior fica no pé, e não no meio); no desktop, `fullPage`. Usar um conjunto de dados de exemplo realista (aluguel e salário recorrentes, luz atrasada, internet vencendo hoje, celular 12x com 4 pagas, freela parcial, fornecedor grande que deixa o saldo negativo em 20/10).

---

## Etapa 2 [REVISÃO] — "Meu mês" (checklist de contas fixas)

**Requisitos**
- Modelos de conta fixa cadastrados **uma vez**: nome, valor padrão, dia, pagar/receber, categoria, perfil.
- Todo mês a lista se gera sozinha, **sem duplicar**, tudo desmarcado.
- Checkbox grande: marcar = baixa total hoje; desmarcar = reabrir; ambos com Desfazer.
- Barra de progresso: "5 de 8 pagas · faltam R$ X".
- Valor variável (luz, água): sugerir o valor do mês anterior e ajustar **só aquele mês**.
- Prazo ao lado de cada item, em pílula colorida:
  - atrasada: vermelho suave, "venceu dia X · N dias de atraso";
  - hoje: amarelo;
  - até 3 dias: amarelo claro, "vence dia X · em N dias";
  - futura: cinza;
  - paga: verde, "paga dia X" com a data real da baixa.
  - Para receber: "recebe dia X" / "recebida dia X".
  - Calendário local `America/Sao_Paulo`, sem erro de fuso.
- Grupos: "Atrasadas", "Esta semana", "Mais adiante", "Pagas" (recolhido).
- Ícone por categoria em SVG inline; checkbox ≥ 44px com animação de carimbo; confete discreto **uma vez por mês** ao quitar tudo (sem animação com `prefers-reduced-motion`).
- Itens gerados por modelo **não contam** no limite de 30 lançamentos do plano grátis (o limite em si chega na Etapa 5; marcar os itens com `modeloId` já resolve).

**Como encaixar (sugestão)**
- Nova tela `#mes` ("Meu mês") no menu lateral/inferior. Com 6 itens a navegação inferior fica apertada: avaliar trocar "Relatório" de lugar ou juntar Relatório dentro de Fluxo no celular (decidir na revisão).
- `db.modelos = [{ id, tipo, descricao, valor, dia, categoriaId, perfil, variavel, ativo, criadoEm }]` (adicionar em `migrar`/`dbVazio`).
- `gerarMes(db, 'aaaa-mm')` no núcleo: cria as contas do mês com `modeloId` e `ocorrencia = aaaa-mm-dia` (dia 31 → último dia do mês), chave modelo + mês para não duplicar. Chamar ao abrir e na virada do mês. Valor variável: usar o valor do mês anterior desse modelo (se houver), senão o padrão.
- As contas geradas são contas normais (aparecem em Contas, no Fluxo e no Relatório).
- Confete: guardar o mês já comemorado em `config.confeteMes`.

**Testes**
- Geração mensal sem duplicar (abrir/recarregar várias vezes).
- Marcar/desmarcar (baixa total hoje / reabrir) com Desfazer.
- Valor variável: sugere o do mês anterior; ajustar muda só aquele mês.
- Prazos: atrasada, hoje, em 2 dias, futura, paga (textos das pílulas, inclusive para receber).
- Virada de mês (mudar o relógio para o mês seguinte → nova lista desmarcada; o mês anterior fica intacto).
- Progresso "N de M pagas · faltam R$ X".

## Etapa 3 — Relatório + WhatsApp

**Requisitos**
- Relatório mensal com: recebido, pago, resultado, saldo de hoje, previsto no fim do mês, onde mais gastou, próximas contas (30 dias).
- Saídas: **PDF** (jsPDF 2.5.1 do cdnjs), **imagem** (desenhada em `<canvas>`, sem html2canvas) e **texto**.
- Botão "Enviar pelo WhatsApp": `wa.me` com texto pronto (sem número fixo) e Web Share API com o arquivo quando o aparelho suportar (`navigator.canShare({ files })`).
- Função isolada `enviarRelatorio(canal)` (`'whatsapp' | 'compartilhar' | 'pdf' | 'imagem' | 'texto'`), com **TODO** claro: envio automático pelo servidor (Etapa 2 do projeto).

**Notas**
- Dá para usar `Warden.novoPdf()`/`textoPdf`/`rodapePdf` do `/assets/tools.js` (padrão da marca) carregando o `tools.js` só quando precisar, ou montar o PDF no próprio Control; manter a faixa verde-limão e "Gerado com Warden · wardenfinance.com.br".
- Valores do relatório vêm de `resumoMes`, `saldoAtual`, `serieFluxo`, `proximas` (núcleo); acrescentar ao núcleo uma função `dadosRelatorio(db, perfil, ym)` testável.

**Testes**
- `dadosRelatorio` com números conferidos à mão.
- Texto do WhatsApp (link `wa.me/?text=` interceptado, sem número), PDF baixado (nome do arquivo e tamanho > 0), imagem gerada.
- Web Share: com `navigator.share`/`canShare` simulados, recebe o arquivo; sem eles, cai no `wa.me`.

## Etapa 4 [REVISÃO] — Orientador (agente)

**Requisitos**
- Painel lateral no desktop; gaveta no celular.
- Regras locais numa lista `AGENTE_REGRAS` (sem IA externa): contas atrasadas, vencimentos em 3 dias, gasto acima da média da categoria, mês no vermelho, reserva baixa, muitos dias sem lançar.
- No máximo **2 frases por dica**, tom de parceiro para iniciante, **botão de ação em cada dica** (ex.: "Ver atrasadas", "Dar baixa", "Abrir Fluxo").
- Boas-vindas do dia e atalhos de chat ("como estou este mês?", "o que vence esta semana?") respondidos por regras.
- Ponto de extensão `responderComIA()` marcado para o futuro (TODO).

**Notas**
- Cada regra: `{ id, prioridade, quando(ctx) → dado | null, texto(dado) → string, acao: { rotulo, executar } }`; `ctx` montado com funções do núcleo. Regras testáveis sem tela (`orientador.js` separado do `app.js`).
- Respeitar o limite do grátis da Etapa 5 (1 dica por dia) já deixando o ponto de corte preparado.

**Testes**
- Cada regra dispara com o dado certo e fica quieta sem ele.
- Dicas com ≤ 2 frases e com botão; o botão leva à ação.
- Atalhos de chat respondem com números corretos.

## Etapa 5 — Plano e assinatura (só demonstração local)

**Requisitos**
- **Grátis:** 30 lançamentos/mês (parcelamento de 12x conta como **1**; recorrência automática e itens de modelo **não contam**), 1 perfil, sem relatório no WhatsApp, 1 dica do Orientador por dia.
- **Pro (R$ 9,90/mês):** ilimitado, relatório no WhatsApp, Orientador completo, Pessoal + Negócio, CSV. **Teste de 7 dias.**
- **Backup JSON liberado para todos.**
- Página `/assinar.html` (marca Warden Pro, benefícios, preço, FAQ, garantia, links para Termos e Privacidade) com `PLANO = { preco: "9,90", checkoutUrl: "" }`; **botão desabilitado se a URL for vazia**.
- Termos e Privacidade deixam claro que o **pagamento é processado pela Kiwify** e que **os dados ficam no aparelho do usuário** (e citar a chave `warden:control:v1` e `warden:control-entrada` na Política, regra do CLAUDE.md).
- Estados do plano são locais e de demonstração; **TODO claro**: a liberação real virá do servidor (webhook verificado) na Etapa 2 do projeto. **Não reutilizar nada do backend antigo.**

**Notas**
- Contagem de lançamentos do mês: contas criadas pela pessoa no mês (pela `criadoEm` no fuso de SP), agrupando parcelas pelo `grupoId`, ignorando `recorrenciaId` (exceto a criação da própria recorrência, que conta 1) e `modeloId`.
- Ao passar do limite: abrir um modal do Pro (no estilo da vitrine do Cobrança), sem perder o que a pessoa digitou.
- `/assinar.html` é página institucional da raiz (mesmo `<head>` das institucionais, `nav.js`, schema `WebPage`/`Product`) e entra no `sitemap.xml`.

**Testes**
- Limite de 30 (o 31º bloqueia; 12x conta 1; recorrência e modelo não contam).
- Pro/teste de 7 dias liberam tudo; fim do teste volta ao grátis sem apagar dados.
- `/assinar.html`: botão desabilitado com `checkoutUrl` vazio, habilitado com URL.

## Etapa 6 — Efeitos visuais

**Requisitos**
- Count-up nos números, anel animado de saúde financeira, gráfico de fluxo com transição suave, cards com brilho que segue o cursor/toque, transições de aba, micro-interações, skeleton ao carregar, gradiente vivo no topo do Início.
- **60fps no celular, sem biblioteca pesada** (CSS + Web Animations + `requestAnimationFrame`; só `transform`/`opacity`).
- Tudo desligado com `prefers-reduced-motion`.

**Testes**
- Com `reducedMotion: 'reduce'`: números aparecem já no valor final, sem animações.
- Count-up termina no valor exato (centavos).
- Nada quebra a largura em 390px.

## Etapa 7 — "Salvar no Control"

**Requisitos**
- Pix (`/ferramentas/gerador-qr-code-pix.html`), Recibo (`/ferramentas/gerador-de-recibo.html`) e Cobrança (`/cobranca/`) ganham um botão "Salvar no Control" que grava numa caixa de entrada `localStorage` **`warden:control-entrada`**.
- O Control **valida e importa ao abrir** (e limpa a entrada importada).
- **Juros compostos NÃO ganha esse botão.**

**Notas**
- Entrada: lista de `{ id, origem: 'pix'|'recibo'|'cobranca', tipo, descricao, valor (centavos), vencimento, contato, criadoEm }`. Validar com as mesmas regras do núcleo (`validarLancamento`); item inválido é descartado sem quebrar. Mostrar toast "N lançamentos chegaram do Pix/Recibo/Cobrança" com Desfazer.
- Código compartilhado entre as 3 páginas (montar e gravar a entrada) vai para `/assets/` (regra do CLAUDE.md), ex.: função no `tools.js`.
- Atualizar a Política de Privacidade (nova chave no `localStorage`).

**Testes**
- Em cada uma das 3 páginas, o botão grava a entrada certa; Juros compostos não tem o botão.
- O Control importa ao abrir, não importa duas vezes e descarta item inválido.

## Fechamento

- Testes Playwright da área (`control.spec.js`) passando.
- Screenshots em 390px e 1440px.
- `CLAUDE.md` atualizado (Control no "O que já existe", inclusive a regra "commit + push a cada etapa").
- Resumo curto com os **TODOs da Etapa 2 do projeto**: servidor seguro, login, webhook Kiwify verificado, WhatsApp automático.

## Como ligar ao menu (quando o dono pedir)

1. Em `/assets/nav.js`, trocar `href="/app.html"` por `href="/control/"` nos links com `data-control-finance` (nav e menu mobile; linhas ~232 e ~263) e ajustar o tratamento de clique em `data-control-finance` (hoje chama `abrirControlFinance` da home, que pede login).
2. Em `/assets/footer.js`, o mesmo link (linha ~61).
3. Renomear o texto "Control Finance" para "Warden Control", se for o nome final.
4. No `/control/index.html`, tirar o `noindex`; incluir `/control/` (e `/assinar.html`) no `sitemap.xml`.
5. Decidir o destino do `app.html` antigo (redirecionar para `/control/` ou remover).
6. Rodar os testes de `home`, `rodape` e `control`.
