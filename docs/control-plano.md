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
| 2. "Meu mês" [REVISÃO] | **Concluída e aprovada** (as 3 decisões da revisão ficaram como estão: menu inferior com 6 itens, atrasadas de meses anteriores no "Meu mês", editar conta fixa vale só para os próximos meses) |
| 3. Relatório + WhatsApp | **Concluída** |
| 4. Orientador [REVISÃO] | **Concluída e aprovada**, com 3 ajustes do dono: painel aberto na 1ª visita e depois lembra a escolha; "mês no vermelho" com duas cores; "reserva baixa" em tom de parceiro (sem alarme, sem cobrança, nunca culpar a pessoa — vale para toda dica nova) |
| 5. Plano e assinatura (demonstração) | **Concluída** (+ ajuste do modal do Pro pedido pelo dono: um botão principal "Testar 7 dias grátis", "Assinar o Pro"/"Agora não" como links, "menos de R$ 0,34 por dia", `COPY_TESTE` em `/assets/warden-pro.js`) |
| 6. Efeitos visuais | **Concluída** |
| 7. "Salvar no Control" | **Concluída** |
| Fechamento | **Concluído** — bateria completa: 445 de 445 testes passando (13/10/2026); screenshots finais em `tests/capturas/control/final/` |

### Arquivos

- `control/index.html` — esqueleto: barra lateral (desktop), barra do topo (logo no celular, seletor de perfil, Desfazer, "Novo lançamento" no desktop), `<main id="tela">`, navegação inferior + botão flutuante (celular), toast, janelas `<dialog>` (`#dlg-lanc` novo/editar, `#dlg-modelo` conta fixa, `#dlg-detalhe`, `#dlg-saldo`, `#dlg-pro` vitrine do Pro, `#dlg-confirmar`), o painel `<aside id="orientador">`, o esqueleto inicial e o botão "Orientador" na barra. Scripts nesta ordem: `/assets/warden-pro.js`, `nucleo.js`, `relatorio.js`, `orientador.js`, `efeitos.js`, `app.js`. `noindex` enquanto não for lançado.
- `control/control.css` — estilos do app (prefixo `.ctl-`), mobile-first; desktop a partir de 900px.
- `control/nucleo.js` — **regras sem tela** em `window.ControlNucleo`: datas, dinheiro, migração/validação, status, criar/editar/baixar/excluir, recorrências, fluxo, resumo do mês, CSV, backup. Regra nova de dinheiro/data entra aqui.
- `control/app.js` — telas e interações; expõe `window.WardenControl = { db, render, desfazer, toast, abrirLancamento, abrirDetalhe }` (testes e próximas etapas).
- `control/relatorio.js` — saídas do relatório em `window.ControlRelatorio`: `pdf(d)` (jsPDF 2.5.1 + `Warden.novoPdf`/`textoPdf`/`rodapePdf`, carregados só ao pedir), `imagem(d)` (PNG 1080 px de largura em `<canvas>`, sem html2canvas), `nomeArquivo(d, ext)`, `carregarKit()`. Carregado entre o `nucleo.js` e o `app.js`.
- `control/orientador.js` — Orientador sem tela em `window.ControlOrientador`: `AGENTE_REGRAS`, `contexto(db, perfil, ref)`, `dicas(ctx, { limite })`, `boasVindas(ctx)`, `ATALHOS`, `responder(id, ctx)`, `interpretar(texto)`, `responderComIA()` (TODO), `LIMITE_GRATIS`. Carregado depois do `relatorio.js`, antes do `app.js`.
- `assinar.html` (raiz) — vitrine do Warden Pro (ver CLAUDE.md, páginas institucionais). Entrou no `sitemap.xml` e em `INSTITUCIONAIS` de `tests/ferramentas.js` (os testes de SEO, celular, faixa e rodapé valem para ela: `npx playwright test -g assinar`).
- `control/efeitos.js` — efeitos visuais em `window.ControlEfeitos` (`aplicar(raiz)` depois de cada desenho, `entrarTela(raiz)` ao trocar de aba). Carregado antes do `app.js`.
- `assets/warden-pro.js` — `window.WARDEN_PRO.COPY_TESTE` ("Sem cartão para testar. Cancele quando quiser."), usado no modal do Pro e na `/assinar.html`; muda conforme a regra da Kiwify.
- `tests/specs/control.spec.js` — 52 testes (19 da Etapa 1 + 7 do "Meu mês" + 4 do relatório + 5 do Orientador + 4 do plano + 6 dos efeitos e da saúde financeira + 5 do "Salvar no Control" + 2 da `/assinar.html` e textos legais, todos passando). Os do "Salvar no Control" abrem também o Pix, o Recibo, o Cobrança e o Juros compostos; ao mexer nessas páginas, rode ainda `npx playwright test cobranca botoes-e-campos`. Os testes que usam recursos do Pro semeiam `config: PRO`; sem isso o db começa no grátis.
- `control/index.html` também tem `#dlg-modelo` (nova/editar conta fixa do "Meu mês").
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
- **Relatório (tela):** pelo dia em que o dinheiro mexeu (data da baixa): recebido, pago, resultado, "onde mais gastou" (pagamentos por categoria), em aberto no mês, saldo de hoje, saldo no fim do mês e próximas contas (30 dias a partir de hoje).
- **Relatório (Etapa 3):** números em `dadosRelatorio(db, perfil, ym, ref)` e texto em `textoRelatorio(d)` (núcleo, testáveis). Fim do mês: mês que já passou = saldo real no último dia (`previsto: false`); mês corrente/próximo = fluxo previsto; além de 90 dias = `null` ("Longe demais para prever"). Botões: "Enviar pelo WhatsApp", PDF, Imagem, Copiar texto, todos via `enviarRelatorio(canal)` no `app.js` (`'whatsapp' | 'compartilhar' | 'pdf' | 'imagem' | 'texto'`). WhatsApp: com `navigator.canShare({ files })` manda a imagem + o texto pela folha de compartilhar; sem, abre `wa.me/?text=` (sem número); cancelar a folha não abre o wa.me. Arquivos: `warden-relatorio-aaaa-mm[-pessoal|-negocio].pdf/.png`. **TODO** marcado: envio automático pelo servidor (Etapa 2 do projeto). O limite do grátis (sem relatório no WhatsApp) entra na Etapa 5.
- **"UM botão Novo lançamento por tela":** no desktop fica na barra do topo; no celular é o flutuante. Some no estado vazio (que tem os dois botões grandes "Tenho uma conta a pagar" / "Tenho algo a receber") e em Ajustes (`body[data-sem-novo]`).
- **Filtros** só aparecem quando há contas; padrão "Em aberto". Busca ignora acento e não perde o foco (só a lista é redesenhada).
- **Categorias padrão** (`CATEGORIAS_PADRAO` no núcleo) têm `icone` (chave do SVG em `app.js`, objeto `P`), para o "Meu mês" usar. Excluir categoria move as contas para "Outros…" do mesmo tipo.
- **"Meu mês" (Etapa 2):** tela `#mes`, 2º item do menu (a navegação inferior ficou com 6 itens, fonte .66rem; reavaliar na revisão). Modelos em `db.modelos`; `gerarMes(db, 'aaaa-mm')` só gera o **mês corrente** (ao abrir, ao importar backup e quando o dia vira), chave modelo + mês; dia 31 → último dia. Valor variável = valor da conta mais recente do modelo. Tocar num item variável em aberto abre "Valor deste mês" (`ajustarValor`, muda só aquela conta); os outros abrem o detalhe. Editar o modelo vale só para os próximos meses. Excluir a conta de um mês grava o mês em `modelo.excluidos` (não volta). Excluir o modelo mantém as contas já geradas. Contas de modelo de **meses anteriores ainda em aberto** aparecem em "Atrasadas" (não somem na virada), mas não entram no progresso do mês. Grupos: Atrasadas / Esta semana (hoje + 7 dias) / Mais adiante / Pagas (`<details>` recolhido). Checkbox quadrado de 32px em área de 52px; "carimbo" anima só no item recém-marcado. Pílula de prazo fica embaixo do nome (texto longo no celular). Quitou tudo: cartão "Mês fechado!" + confete uma vez (`config.confeteMes`), sem confete com `prefers-reduced-motion`.
- **Orientador (Etapa 4):** botão "Orientador" (lâmpada) na barra do topo, com selo do número de dicas até a pessoa abrir o painel no dia (`config.orientadorVisto`). Desktop: coluna fixa de 360px à direita (grade da `.ctl-app`), aberta na primeira visita; depois lembra a última escolha (`config.orientadorAberto`, que nem o Desfazer muda). Celular: gaveta de baixo, com fundo escuro, Esc fecha, foco no título ao abrir e de volta no botão ao fechar; a ação de uma dica fecha a gaveta e navega. Regras (prioridade): atrasadas 100, mês no vermelho 90 (saldo previsto negativo dentro do mês = alerta vermelho; só "sai mais do que entra" = aviso amarelo), vence em até 3 dias 80, reserva baixa 60 (saldo de hoje < média de pagamentos dos meses anteriores com movimento; tom de parceiro, cor de dica e não de aviso; botão leva à ferramenta Reserva de emergência), gasto acima da média da categoria 50 (precisa de 2+ meses de histórico; > 130% da média e ao menos R$ 50 a mais), 7+ dias sem lançar 40 (contas geradas sozinhas não contam). As ações recebem uma `api` do app (`filtrar`, `irPara`, `abrirDetalhe`, `novo`, `abrirLink`). Atalhos: "Como estou este mês?", "O que vence esta semana?", "Onde mais gastei?"; a caixa de texto entende palavras-chave e, sem resposta, chama `responderComIA()` (hoje `null`) e mostra o que ele sabe responder. Conversa só na memória (some ao recarregar). No grátis, 1 dica por dia (ver Plano).
- **Plano (Etapa 5, demonstração local):** `config.plano = { tipo: 'gratis'|'pro', testeInicio }`; `planoAtual(db, ref)` → `gratis | teste | pro` + `recursos` (`RECURSOS` no núcleo). Teste de 7 dias contando o dia de início (começou 02/10 → vale até 08/10). Limite do grátis: `lancamentosNoMes` (pela `criadoEm` no fuso de SP; parcelamento = 1; contas de recorrência e do "Meu mês" não contam; criar a recorrência conta 1); o 31º abre o `#dlg-pro` por cima do formulário, que continua aberto com o que foi digitado. Grátis: 1 perfil (o seletor fica em "Tudo" e escolher Pessoal/Negócio abre o Pro; os blocos de perfil dos formulários somem; nada é escondido quando o teste acaba), WhatsApp do relatório e CSV abrem o Pro (PDF, imagem, texto e backup liberados), Orientador com 1 dica por dia (a primeira do dia fica em `config.dicaDoDia`; se ela se resolver, as outras não entram no lugar; o painel diz quantas há no Pro). Fim do teste: aviso único (`config.avisoFimTeste`). Ajustes tem o cartão "Seu plano" e uma área recolhida "Demonstração do plano" (simular assinatura / voltar ao grátis / encerrar o teste) — **TODO** marcado para sair quando o servidor liberar o plano (webhook verificado da Kiwify). Plano, painel do Orientador, dica do dia e aviso de fim de teste **não voltam com o Desfazer nem com importar backup/apagar tudo** (`PREFS_CONTA`/`PREFS` no `app.js`); perfil, primeiros passos e confete também não voltam com o Desfazer.
- **Efeitos (Etapa 6):** só `transform`/`opacity` (Web Animations e `requestAnimationFrame`, sem biblioteca); com `prefers-reduced-motion` nada se mexe e os números já nascem no valor final. Contagem: `data-contar="<centavos>"` (+ `data-formato="sinal"|"int"`, `data-chave`) nos números grandes de Início, Fluxo e Relatório; anima só quando o valor muda (o último valor de cada chave fica na memória; na primeira vez, sobe do zero) e o último quadro escreve o valor exato. Anel "Saúde financeira" no Início (nunca chamar de "score"; aviso pequeno: "Indicador do Warden. Não tem relação com Serasa, SPC ou score de crédito."): `saudeFinanceira(db, perfil, ref)` no núcleo, 0 a 100, **só pesa o que já aconteceu** (anotar conta futura nunca baixa; testado): contas em dia 30 (−10 por atrasada); mês no azul até agora 30 (recebido − pago no mês, até hoje); saldo de hoje positivo 20; caixa cobre um mês de gastos 20, proporcional à média de pagamentos dos meses anteriores que existem de fato (até 3, a partir do primeiro mês com movimento; o texto diz "média de N meses"; sem mês completo, fica neutro e não tira pontos). Sem conta ou sem nenhum dinheiro que já mexeu: `{ suficiente: false }` e o cartão mostra "Ainda não dá para calcular. Anote suas contas do mês." no lugar do número. Rótulos Ótima ≥ 80, Boa ≥ 60, Pede atenção ≥ 40, Apertada; o arco gira até o lugar e aparece. Gráfico do fluxo: a curva (`g[data-curva]`) entra suave quando o período ou os dados mudam. Brilho que segue o cursor (e acende no toque por 650 ms) em `.ctl-card`/`.ctl-saldo` via `::before` com `transform`. Troca de aba: conteúdo sobe de leve e o ícone da aba dá um pulinho. Aperto (`scale(.96)`) nos botões. Esqueleto no `<main>` até a 1ª tela. Gradiente vivo (`.ctl-aurora`, 3 manchas em `transform`) atrás do topo do Início, com máscara nas bordas.
- **"Salvar no Control" (Etapa 7):** botão nos geradores de Pix e de recibo (junto das ações que já existiam) e em cada cobrança da aba Cobranças do Warden Cobrança. Grava pela função compartilhada `Warden.salvarNoControl` (`/assets/tools.js`) na caixa `warden:control-entrada`: `{ id, origem, tipo, descricao, valor (centavos), vencimento, contato, forma, pagoEm, criadoEm }` (`forma` e `pagoEm` acrescentados ao modelo do plano: o recibo e a cobrança paga entram já quitados na data). Pix → "Pix: <descrição>" (ou "Pix a receber") a receber hoje, exige valor; Recibo → "<Referente>" recebido na data do recibo, contato = quem pagou; Cobrança → descrição, vencimento e cliente, perfil Negócio. O Control importa ao abrir, ao voltar para a aba e quando outra aba grava a caixa (evento `storage`): esvazia a caixa na hora (não importa duas vezes), descarta item inválido (`entradaValida` = mesmas regras de `validarLancamento` + origem conhecida), anota "Veio do …" na observação e mostra "N lançamentos chegaram do Pix, do Recibo e da Cobrança" com Desfazer. Os importados contam no limite do grátis como lançamentos da pessoa.
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
                   freq, inicio, dia, fim, excluidas: [], criadoEm }],
  modelos: [{ id, tipo, descricao, valor, dia, categoriaId, perfil, variavel, ativo, excluidos: ['aaaa-mm'], criadoEm }]
}
// config também tem: confeteMes 'aaaa-mm'|null, plano { tipo: 'gratis'|'pro', testeInicio }, avisoFimTeste,
//                     orientadorAberto, orientadorVisto, dicaDoDia { data, id }, ultimoPerfil
```

Conta gerada pelo "Meu mês": `modeloId` + `ocorrencia` (a data original). Campo novo de etapa futura: adicionar em `limparConta`/`migrar` no núcleo e no `dbVazio()`. Se a estrutura mudar de forma incompatível, subir para `versao: 2`, com migração da v1.

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

## Fechamento (concluído)

- Bateria completa (site + Control) rodada uma vez em 13/10/2026: **445 de 445 testes passando** (13 arquivos, 7,2 min). Rodou com `--reporter=line`, então o `tests/RELATORIO.md` não foi regenerado nessa rodada; na próxima tarefa que pedir a bateria, use `npm test` (que gera o relatório).
- Screenshots finais de todas as telas em 390px e 1440px em `tests/capturas/control/final/` (fora do git), com o conjunto de dados de exemplo.
- `CLAUDE.md` atualizado: Control no "O que já existe" (telas, arquivos, dados, como abrir no Live Server), regra de commit + push a cada etapa.
- No mesmo fechamento, a pedido do dono: o título do hero da home ficou todo na cor clara (`destaque: ""` no `HERO_VIDEO`).

## Pendentes — Etapa 2 do projeto (servidor e lançamento)

Hoje o Control é 100% local: dados no aparelho, plano Pro em demonstração. Antes de cobrar de verdade e de abrir para o público:

1. **Servidor seguro.** API própria (HTTPS, sem reaproveitar nada do backend antigo do Control Finance), com banco de dados, backup e registro de acesso. Os dados continuam podendo ficar no aparelho; o servidor guarda a conta, o plano e, se a pessoa quiser, a sincronização (o modelo de dados já tem ids e datas em todo registro, e `versao` para migrar).
2. **Login.** Conta com e-mail (link mágico ou senha + recuperação), sessão segura (cookie `HttpOnly`/`Secure`), e só então o plano passa a valer em mais de um aparelho. Substituir o login simulado (`localStorage`) do site.
3. **Webhook da Kiwify verificado.** A liberação do Pro só pelo servidor, a partir do webhook da Kiwify com assinatura conferida (e consulta à API da Kiwify em caso de dúvida), tratando compra, renovação, cancelamento, reembolso e atraso. Então: preencher `checkoutUrl` em `/assinar.html`, apagar a área "Demonstração do plano" de Ajustes (`demo-pro`/`demo-gratis`/`demo-fim-teste` no `app.js`) e fazer `planoAtual` ler o plano vindo do servidor (TODO marcado no `nucleo.js`). O teste de 7 dias também passa a ser registrado no servidor (hoje é por aparelho). Conferir `COPY_TESTE` (`/assets/warden-pro.js`), Termos e Privacidade contra as regras configuradas na Kiwify; revisar com advogado.
4. **WhatsApp automático.** Envio do relatório mensal (e, se fizer sentido, lembretes de vencimento) pela API oficial do WhatsApp Business, a partir do servidor, com número confirmado e consentimento da pessoa (TODO em `enviarRelatorio` no `app.js`). Atualizar a Política de Privacidade (dados que passam a sair do aparelho).
5. **Orientador com IA (opcional).** `responderComIA()` no `orientador.js` (TODO): perguntas livres respondidas por IA no servidor, mandando só a pergunta e um resumo, nunca a chave no navegador.
6. **Ligar o Control ao menu do site.** Hoje o menu e o rodapé ainda apontam para `/app.html` (Control Finance antigo) e `/control/` está com `noindex` e fora do sitemap. Passo a passo abaixo; fazer só quando o dono pedir, de preferência junto com o lançamento do Pro.

## Como ligar ao menu (quando o dono pedir)

1. Em `/assets/nav.js`, trocar `href="/app.html"` por `href="/control/"` nos links com `data-control-finance` (nav e menu mobile; linhas ~232 e ~263) e ajustar o tratamento de clique em `data-control-finance` (hoje chama `abrirControlFinance` da home, que pede login).
2. Em `/assets/footer.js`, o mesmo link (linha ~61).
3. Renomear o texto "Control Finance" para "Warden Control", se for o nome final.
4. No `/control/index.html`, tirar o `noindex` e incluir `/control/` no `sitemap.xml` (a `/assinar.html` já está). Atenção: o teste de sitemap (`rodape.spec.js`) compara o sitemap com `PAGINAS` de `tests/ferramentas.js`, e os testes de página esperam o `nav.js` (menu hambúrguer, faixa, rodapé), que o Control não carrega de propósito: acrescentar `/control/` como exceção no teste do sitemap, e não em `PAGINAS`.
5. Decidir o destino do `app.html` antigo (redirecionar para `/control/` ou remover).
6. Rodar os testes de `home`, `rodape` e `control`.
