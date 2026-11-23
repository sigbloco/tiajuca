# Revisão visual — Área 3: área dos integrantes

Data: 23/11/2026. Só leitura: nada foi corrigido.

**Esta etapa é a 3a (Integrante) mais as causas comuns da área toda.** A área tem cerca de 18 mil linhas em uns 100 arquivos (rotas `/:org/*`), grande demais para uma conversa; ficou dividida em 3a (Integrante), 3b (Professor/Monitor) e 3c (Direção/Titular), como combinado. 3b e 3c estão no fim, como "a fazer", com os indícios que a varredura do código já encontrou.

**Nada foi visto na tela.** O navegador embutido não tinha sessão aberta (nem em 5173, 5174 ou 5175) e a revisão seguiu sem login, só pelo código. Todo achado abaixo é **"não verificado na tela"**: as larguras são deduzidas das classes do Tailwind (ex.: `h-9` = 36 px), não medidas. Para saber o que o papel Integrante vê, consultei no banco (só leitura) as permissões do papel e a liberação de páginas (`role_permissions`, `page_releases`) e o tema do bloco (`organizations.theme`), para calcular os contrastes.

Telas cobertas (código): moldura do app (`AppShell`: menu lateral, barra inferior do celular, "Mais", barra fixa do topo, "Voltar", caminho de navegação, seletor de ciclo, aviso de inativo, "Sem acesso", "Página ainda não liberada", "Nenhuma página liberada"), carregamento (`LoadingScreen`), erro (`RouteError`), sem organização (`NoOrganizationPage`), Início (`HomePage`), Meu perfil (`ProfilePage`, `MyData`, `MySensitiveData`, `MyParticipation`, `ExtraEmails`, `MemberPhotoEditor`, `InactiveNotice`), Integrantes na visão do integrante (`MemberDirectory`), Naipes e Organograma em modo leitura (`NaipesPage`, `NaipesTabs`, `Organogram`), Calendário (`EventsPage`, `EventCard`, `MergedEventCard`, `Highlights`, `EventSheet` em modo leitura), Repertório em modo leitura (`RepertoirePage`, `RepertoireDetailPage`, `SongSheet`), Financeiro do integrante (`FinanceHome`, `MyBilling`). Componentes compartilhados lidos: `primitives.tsx`, `Breadcrumbs`, `BulletTrail`, `LoadMore`, `Paged`, `Pager`, `StickySave`, `TrashGroup`, `DialogHost`, `BalancedGrid`, `ButtonRow`, `ActionRow`, `LabelFitRow`, `FitButton`, `Collapsible`, `FilterBar`, `ReadMore`, `StepNav`, `PageLink`, `MemberLink`.

## O que o papel Integrante tem hoje (banco de produção)

- Permissões: `attendance.read:own`, `billing.read:own`, `drive.read:org`, `events.read:org`, `members.read:own`, `repertoire.read:org` (Colaborador é igual).
- Liberação de páginas para "Integrante ativo": **liberadas** Início, Meu perfil, Calendário, Integrantes, Naipes; **não liberadas** Financeiro, Cobranças, Repertório, Google Drive. Para "inativo": só Início e Meu perfil.
- Menu resultante (celular): barra inferior com Início, Calendário, **Repertório apagado** e Mais; em "Mais": Início, Meu perfil, Calendário, Financeiro (apagado), Integrantes, Repertório (apagado), Naipes.

## Resumo: os problemas mais importantes

1. **(alta, 375 px) Botões minúsculos no Meu perfil.** "Pedir mudança", "Pedir para sair" e "Abrir mão" com 20 px de altura e texto de 12 px; o seletor de nível com 24 px; os "+" de adicionar rede social e e-mail com 20×20 px; o X de remover e-mail com cerca de 22 px. São as ações que o integrante mais usa no perfil e ficam coladas no texto. `MyParticipation.tsx:82,103,109,122`, `MyData.tsx:186`, `ExtraEmails.tsx:73,88`.
2. **(alta, 375 px) Alvos abaixo de 44 px em todo o app (mesma causa das áreas 1 e 2):** `Button` 40/36 px, `Input`/`Select` 40 px, "Ver mais" 36 px, e aqui ainda os botões do topo fixo ("Visitar site", "Acessar loja", "Sair": 36 px), o seletor de ciclo (32 px), o "Voltar para…" (texto de 14 px sem altura mínima, cerca de 20 px), o X de fechar painel (28 px), os dias do calendário (36 px de altura e cerca de 42 px de largura), o "•••" do caminho (24 px) e os botões da lixeira (32 px).
3. **(alta, todas) A barra inferior do celular gasta um dos quatro lugares com uma página apagada.** Para o Integrante ativo, "Repertório" não está liberado e aparece na barra com 40 % de opacidade e sem link; "Meu perfil" (com a bolinha de perfil incompleto) fica escondido em "Mais". Os itens apagados também aparecem no menu "Mais" e no menu lateral sem dizer por quê (o motivo está só no `title`, que não existe no toque). `AppShell.tsx:31,222,295`.
4. **(média, todas) O quadro "Mensalidade" do Início leva a uma página que o integrante não pode abrir e mostra outra conta.** O link vai para `/cobrancas`, hoje não liberada para Integrante ativo (cai em "Página ainda não liberada"); e o quadro soma **todas** as cobranças em aberto (de qualquer ciclo), enquanto "Minhas mensalidades" só mostra as do ciclo escolhido, sem seletor de ciclo para o integrante. Quem tem uma pendência antiga vê "R$ X · 2 em aberto" no Início e não a encontra na lista. `HomePage.tsx:179-181,202`, `BillingPage.tsx:337-339`, `SelectedCycle.tsx:39`.
5. **(média, todas) "Minhas mensalidades" mostra a cobrança pendente sem nenhum caminho para pagar.** O cartão diz "Pendente · Vence em …" e só; não há botão de pagamento (o link InfinitePay só existe no painel da direção), nem Pix, nem "fale com …". Pode ser regra de negócio (o link vai pelo WhatsApp); se for, falta dizer isso na tela. `BillingPage.tsx:348-363`.
6. **(média, 375 px) Início: quadros de situação com texto de 8 a 11 px.** "Ciclo", "Status", "Frequência", "Mensalidade" numa linha só de quatro caixas de cerca de 84 px; título com 11 px, linha de apoio com 10 px que encolhe até 8 px (`FitText min={8}`), valor que pode cair a 9 px; rótulos abreviados ("Freq.", "Mensal.", "Pgto."). Ilegível em celular pequeno. `HomePage.tsx:28-33,198-209`.
7. **(média, todas) "À confirmar" com crase errada em todo o Calendário** (o certo é "A confirmar", sem crase antes de verbo). Aparece no botão de filtro, nos cartões, no destaque ("à confirmar") e no detalhe do evento. Junta-se a vários "evento(s)", "Aniversariante(s)", "lotado(s)", "bolsa(s) integral(is)" no lugar da concordância calculada. `EventsPage.tsx:174`, `EventCard.tsx:46`, `MergedEventCard.tsx:19`, `Highlights.tsx:25`, `EventSheet.tsx:155,159,184`; lista dos "(s)" em "Causas repetidas".
8. **(média, todas) Selos amarelos e verdes ilegíveis.** "Pendente", "Aguardando a direção", "À confirmar", "aguardando a direção" (e-mail) usam `text-warning` sobre `bg-warning/15`: **2,72:1**; "Pago"/"Aprovado" `text-success` sobre `bg-success/15`: **3,57:1**; texto laranja sobre branco: 3,19:1. Todos abaixo de 4,5:1 e em 12 a 14 px. `billing/service.ts:8` (`src/modules/billing/service.ts`), `MyParticipation.tsx:25`, `ExtraEmails.tsx:79`, `EventCard.tsx:46`.
9. **(média, todas) Listas cortadas ou fora do 5 em 5:** "Carregar mais..." de 3 em 3, com reticências, nos próximos eventos do Início (`HomePage.tsx:153`); "Em destaque" com até 12 itens sem "Ver mais" (Início e Calendário, `HomePage.tsx:124`, `EventsPage.tsx:116`); "Meus pedidos" no perfil corta em 5 sem "Ver mais" (os outros somem, `MyParticipation.tsx:155`).
10. **(média, todas) O Calendário não lista os eventos do mês.** Sem um dia tocado, a página mostra só a grade (pontinhos coloridos sem legenda) e "Em destaque"; para ver um ensaio é preciso adivinhar o dia e tocar nele. O "Ver agenda" do Início leva para cá. `EventsPage.tsx:127,246`.

## O que não deu para verificar

- **Tudo na tela.** Sem login no navegador embutido, nenhuma tela foi aberta: não medi rolagem horizontal, sobreposição, alvos reais, contraste renderizado, foco, nem como os componentes que medem a si mesmos (`FitText`, `FitButton`, `ButtonRow`, `LabelFitRow`, `ActionRow`, `BulletTrail`, `Breadcrumbs`) se resolvem em 375, 768 e 1280 px. Na próxima etapa, entrar no `localhost:5173` com Google antes de começar.
- **Papel Integrante com dados reais:** frequência, mensalidade, pedidos de participação, consentimentos e e-mails adicionais dependem do cadastro de quem entra.
- **Integrante inativo**, **colaborador**, **pessoa sem organização** e **inscrição em avaliação** (`NoOrganizationPage`): só pelo código.
- **Toasts, desfazer, diálogos de confirmação** (`DialogHost`) e o aviso "Salvar as alterações?" ao sair de um painel: só pelo código.
- **Contrastes:** calculados a partir das cores do tema (primário `#E2301D` da paleta, os demais os padrões de `styles/index.css`, já que o bloco não define cores para a área do sistema); não medidos na tela.
- **Tema escuro:** não existe na área dos integrantes.

## Achados por tela (3a: Integrante)

### Moldura do app (todas as telas) — `AppShell.tsx`, `navigation.ts`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| A1 | alta | 375 | Barra inferior com página não liberada ocupando lugar (ver resumo 3). A barra é fixa em `MOBILE_PRIMARY` (Início, Calendário, Oficina, Repertório) e não leva em conta o que está liberado; Meu perfil, que tem a bolinha de pendência, fica em "Mais". | `AppShell.tsx:31,233,294-306` |
| A2 | média | todas | Itens não liberados ficam no menu com 40 % de opacidade (contraste 1,75:1) e sem explicação visível; o "Ainda não liberado para o seu perfil" está só em `title`. No celular a pessoa toca e nada acontece. | `AppShell.tsx:222,295`, `Hub.tsx:264` |
| A3 | média | 375 | Topo fixo alto: barra de 48 px (site, loja, sair) + seletor de ciclo (32 px) + "Voltar para…" + caminho de navegação, mais a barra inferior de cerca de 52 px. No celular sobram perto de 60 % da altura para o conteúdo (mesma causa do F4 da área 1). Para quem está inativo, o aviso amarelo de inatividade entra no topo de **toda** página. | `AppShell.tsx:254-283,286` |
| A4 | média | 375 | "Visitar site" e "Acessar loja" usam `truncate`: em tela estreita o texto vira "Visitar s…" (regra: sem texto truncado). Além disso, cada um é um `<Link>` com um `<button>` dentro (dois elementos interativos aninhados, duas paradas de foco). | `AppShell.tsx:170-171`, também `AppShell.tsx:156-157` |
| A5 | média | 375 | "Voltar para …" do topo: texto cinza de 14 px, sem altura mínima nem borda, com `BulletTrail` limitado a uma linha; é o principal meio de voltar no celular e tem cerca de 20 px de altura. Já o `BackButton` compartilhado tem `min-h-11`: dois desenhos para o mesmo conceito. | `AppShell.tsx:267-279`, `BackButton.tsx:8` |
| A6 | baixa | todas | Item ativo da barra inferior só muda a cor do texto (vermelho 4,49:1 sobre branco, 12 px); "Mais" nunca fica marcado, mesmo quando a página aberta só existe nele (Perfil, Integrantes, Naipes). | `AppShell.tsx:302,307` |
| A7 | baixa | 1280 | O app fica numa coluna de 1024 px (`max-w-5xl`) com menu de 240 px; o conteúdo útil tem cerca de 720 px e o resto da tela é cinza. | `AppShell.tsx:239,243` |
| A8 | baixa | todas | Abertura do app: a tela de carregando é segurada por no mínimo 3 s depois da logo carregar (até 2,5 s de espera pela logo), com contagem de 0 a 100 %. Em toda recarga a pessoa espera de 3 a 5,5 s mesmo com tudo pronto. Decisão a confirmar. | `LoadingScreen.tsx:19-31`, `AppShell.tsx:142` |
| A9 | baixa | todas | Primeira visita (sem tema guardado no aparelho): tela de carregando nas cores padrão, sem o vermelho e amarelo do bloco (mesma causa do FO5 da área 1). | `LoadingScreen.tsx:71-73` |
| A10 | baixa | todas | "Sem acesso" e "Página ainda não liberada": bem resolvidos (ícone, título, texto, "Voltar ao início"), mas o link de voltar é texto vermelho de 14 px sem altura mínima (4,23:1 sobre o fundo creme). | `AppShell.tsx:43,54` |
| A11 | baixa | todas | `RouteError` usa botões feitos à mão (sem `focus-visible:ring`), diferentes do `Button` compartilhado. | `RouteError.tsx:16-19` |

Bem resolvido: "Sem acesso" em vez de página vazia quando a URL é digitada; aviso específico para página não liberada; tela própria quando nenhuma página está liberada (com loja, site e Sair); "Voltar" que nomeia o destino ("Voltar para Início • Calendário"); barra inferior respeita a área segura do iPhone.

### Início (`/:org`) — `HomePage.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| I1 | média | 375 | Quadros de situação com texto de 8 a 11 px e rótulos abreviados (ver resumo 6). Em 768 px ou mais cabem com folga e a fonte volta ao normal; o problema é o celular. | `HomePage.tsx:28-33,198-209` |
| I2 | média | todas | Quadro "Mensalidade" leva a `/cobrancas` (não liberada) e soma pendências de todos os ciclos (ver resumo 4). O quadro inteiro é um link sem nada que pareça link (sem seta, sem sublinhado). | `HomePage.tsx:179-181,202-209` |
| I3 | média | todas | "Carregar mais..." de 3 em 3, com reticências (regra 3 e regra de reticências). Os outros "Ver mais" do app são de 5. | `HomePage.tsx:99,153` |
| I4 | média | todas | "Em destaque" mostra até 12 eventos de uma vez, sem "Ver mais". | `HomePage.tsx:124,146-151` |
| I5 | baixa | todas | Se a consulta da situação falhar, o esqueleto cinza fica para sempre (`if (!data) return <Skeleton>`), sem mensagem de erro. O mesmo para os próximos eventos (só o esqueleto e depois nada). | `HomePage.tsx:192`, `HomePage.tsx:142` |
| I6 | baixa | 375 | "Ver agenda" é texto vermelho de 14 px ao lado do título, sem altura mínima. | `HomePage.tsx:141` |
| I7 | baixa | todas | "Aniversariante(s) do dia:" em vez de singular/plural calculado. | `HomePage.tsx:87` |
| I8 | baixa | todas | Os cartões de evento alternam fundo branco e cinza (zebra), como linhas de tabela; num cartão isolado ou em dias diferentes a alternância parece aleatória. | `EventCard.tsx:41`, `MergedEventCard.tsx:9` |

Bem resolvido: convite "Termine seu perfil" com link para o perfil; aniversariantes com `MemberLink` (vira texto para quem não pode abrir fichas, que é o caso do integrante); "hoje" antes dos destaques.

### Meu perfil (`/:org/perfil`) — `ProfilePage.tsx`, `MyData.tsx`, `MyParticipation.tsx`, `ExtraEmails.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| P1 | alta | 375 | Ações de 20 a 24 px (ver resumo 1): "Pedir mudança", "Pedir para sair", "Abrir mão", nível (`Select h-6`), "+" de rede social e de e-mail, X do e-mail adicional. | `MyParticipation.tsx:82,103,109,122`, `MyData.tsx:186`, `ExtraEmails.tsx:73,88` |
| P2 | média | todas | Dois jeitos de salvar na mesma página: dados, dados sensíveis e "Outras informações" esperam o "Salvar" fixo da base; nível da atividade, pedidos, "Abrir mão", e-mails adicionais e foto gravam na hora (no Professor/Monitor, também a chave Pix, que grava ao sair do campo). Quem mexe no nível e depois toca em "Salvar" não sabe o que já valeu. A regra pede um ou outro por página. | `ProfilePage.tsx:56,139`, `MyParticipation.tsx:103`, `ExtraEmails.tsx:15` |
| P3 | média | 375 | Avisos em letra de 9,6 px: "conta Google: só a direção altera" e "sujeito à aprovação da direção" usam `text-[clamp(0.6rem,2.7vw,0.75rem)]` com `whitespace-nowrap`. | `MyData.tsx:171`, `ExtraEmails.tsx:75` |
| P4 | média | todas | "Meus pedidos" mostra só os 5 primeiros, sem "Ver mais" (regra 3). | `MyParticipation.tsx:155` |
| P5 | média | todas | Selos de pedido "Aguardando a direção" e e-mail "aguardando a direção" em amarelo sobre amarelo claro (2,72:1) e laranja sobre branco (3,19:1). | `MyParticipation.tsx:25`, `ExtraEmails.tsx:79` |
| P6 | baixa | todas | "Dados pessoais sensíveis" abre e fecha com um botão próprio (seta + título), não com o `Collapsible` usado no resto do app: outro desenho para "grupo recolhível". | `MyData.tsx:268-271` |
| P7 | baixa | todas | Data de nascimento usa o `input type="date"` do navegador (no celular abre o calendário nativo; formato varia por aparelho), enquanto a data de fundação do perfil do bloco usa o `DateInput` com máscara. | `MyData.tsx:200` vs `MyData.tsx:133` |
| P8 | baixa | todas | "Pedir" (adicionar atividade ou colaboração) fica desabilitado e mudo até escolher a opção (regra 4: avisar o que falta). | `MyParticipation.tsx:74` |
| P9 | baixa | todas | "Não se aplica" é um link sublinhado de 12 px abaixo do campo; "nenhum" (e-mails adicionais) em minúscula solta. | `MyData.tsx:45`, `ExtraEmails.tsx:82` |
| P10 | baixa | todas | Se a participação não carregar, o cartão "Minha participação" some sem aviso (`if (!d) return null`). | `MyParticipation.tsx:63` |
| P11 | baixa | todas | Campo de recado do pedido de volta (inativo) sem rótulo, só com placeholder "Quer deixar um recado?". | `Reactivation.tsx:63` |
| P12 | baixa | todas | O aviso de inativo diz que o acesso fica limitado "ao seu perfil, à sua frequência e às suas mensalidades", mas Cobranças/Financeiro não estão liberadas para "inativo" hoje: a promessa não bate com o menu. | `Reactivation.tsx:56` |

Bem resolvido: "Salvar" fixo na base (`StickySave` + `SaveButton`); "Nome completo" com asterisco e aviso de telefone inválido junto do campo; dados sensíveis recolhidos e com texto explicativo; consentimentos de 5 em 5; foto com confirmação antes de remover; pedido de volta com estado "Pedido em análise".

### Integrantes (visão do integrante) — `MemberDirectory.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| M1 | baixa | todas | Linhas da lista com `bg-card` sem borda nem sombra (os cartões do resto do app têm borda e sombra) e o vazio num `Card p-8`, não no `EmptyState` tracejado usado em 39 arquivos. | `MemberDirectory.tsx:48,54` |
| M2 | baixa | todas | Os nomes são texto comum (sem ficha para o integrante, conforme a regra D13); só o próprio nome é link para "Meu perfil", em vermelho, o que destoa da lista. Nada indica por que um nome é link e os outros não. | `MemberDirectory.tsx:49` |

Bem resolvido: busca com rótulo, contagem "N integrantes ativos", 5 em 5, link para Meu perfil com `PageLink`.

### Naipes e Organograma (modo leitura) — `NaipesPage.tsx`, `NaipesTabs.tsx`, `Organogram.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| N1 | média | 768+ | Organograma em grade de 2 colunas sem esticar a última linha: com número ímpar de naipes o último cartão fica com meia largura (regra 5; mesma causa do F1 da área 1). | `Organogram.tsx:55` |
| N2 | média | todas | "Para mudar, vá a Naipes." cita a página sem `PageLink` (regra 6) e aparece para quem não pode mudar nada. | `Organogram.tsx:52` |
| N3 | baixa | todas | Nota administrativa ("Itens desativados somem das novas escolhas… Só dá para excluir o que nunca foi usado.") aparece para o integrante, que não edita. | `NaipesPage.tsx:428` |
| N4 | baixa | todas | As abas usam `role="tablist"`/`role="tab"` em links que trocam de página (leitor de tela anuncia abas e espera setas). | `NaipesTabs.tsx:22,27` |
| N5 | baixa | todas | Organograma sem `h1` (o título some porque repete a aba, como manda a regra, mas não sobra título nem para leitor de tela). Nomes da equipe em `Badge` de 12 px com ícones de 12 px. | `Organogram.tsx:50`, `Organogram.tsx:38-41` |

### Calendário (`/:org/eventos`) — `EventsPage.tsx`, `EventCard.tsx`, `Highlights.tsx`, `EventSheet.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| C1 | média | 375 | Dias com 36 px de altura e cerca de 42 px de largura, número em 12 px; até quatro pontinhos de 6 px e um bolo de 12 px por dia. | `EventsPage.tsx:201,210-217` |
| C2 | média | todas | Sem legenda para as cores dos pontos, a estrela (evento especial), o ponto vazado (a confirmar), o bolo e o número em vermelho (feriado). | `EventsPage.tsx:211-218` |
| C3 | média | todas | Lista do mês só aparece depois de tocar num dia (ver resumo 10). | `EventsPage.tsx:127,246` |
| C4 | média | todas | "À confirmar"/"à confirmar" com crase errada (ver resumo 7). | `EventsPage.tsx:174`, `EventCard.tsx:46`, `Highlights.tsx:25`, `EventSheet.tsx:155,159` |
| C5 | média | todas | "Em destaque" com até 12 itens, sem "Ver mais". | `EventsPage.tsx:116`, `Highlights.tsx:18-28` |
| C6 | baixa | todas | Hoje (anel vermelho) e feriado (número em pílula vermelha) usam a mesma cor; o dia escolhido usa `bg-muted`, a mesma cor das semanas alternadas, e só se distingue pelo anel. | `EventsPage.tsx:202-205,210` |
| C7 | baixa | todas | "FALTAM N DIAS" em vermelho, 12 px, maiúsculas (4,19:1 sobre o fundo rosado do cartão). | `Highlights.tsx:25` |
| C8 | baixa | todas | Rótulo para leitor de tela "N evento(s)", "N aniversário(s)". | `EventsPage.tsx:208` |
| C9 | baixa | todas | Erro ao carregar eventos não aparece (só some a lista). | `EventsPage.tsx:52-56` |

Bem resolvido: cada dia tem `aria-label` completo (data, feriado, eventos, aniversários); navegação de mês com `StepNav` de 40 px de largura total; aniversários com `MemberLink`; detalhe do evento sem botões para quem não gerencia; aviso "Data, horário ou local ainda podem mudar" no detalhe.

### Repertório (modo leitura; hoje não liberado para Integrante ativo) — `RepertoirePage.tsx`, `RepertoireDetailPage.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| R1 | média | todas | Filtro com "Situação: Ativos e inativos / Somente ativos / Somente inativos" no repertório de quem só lê, mas a lista já mostra só as músicas ativas: "Somente inativos" dá sempre "Nenhuma música encontrada". | `RepertoireDetailPage.tsx:76,78` |
| R2 | média | 375 | Três "voltar" empilhados: o "Voltar para…" do topo, o caminho de navegação e um botão de seta só com ícone ao lado do título (mesma causa do H2 da área 2). | `RepertoireDetailPage.tsx:63` |
| R3 | baixa | todas | Os repertórios aparecem todos de uma vez (grade), sem 5 em 5. Com poucos repertórios não aparece; vigiar. | `RepertoirePage.tsx:107` |
| R4 | baixa | todas | `ButtonRow` vazio ao lado do título para quem não gerencia (deixa um espaço à direita do "Repertório"). | `RepertoirePage.tsx:100-103` |

### Financeiro do integrante (`/:org/financeiro`, `/:org/cobrancas`; hoje não liberados) — `Hub.tsx`, `BillingPage.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| F1 | média | todas | Cobrança pendente sem caminho para pagar (ver resumo 5). | `BillingPage.tsx:348-363` |
| F2 | média | todas | Só o ciclo escolhido e sem seletor de ciclo para o integrante (ver resumo 4): mensalidades de ciclos anteriores ficam inacessíveis. | `BillingPage.tsx:337-339`, `SelectedCycle.tsx:39` |
| F3 | média | todas | Selos "Pendente" (2,72:1) e "Pago" (3,57:1) com contraste baixo. | `billing/service.ts:8` (`src/modules/billing/service.ts`) |
| F4 | baixa | todas | O menu diz "Financeiro" e a página abre com "Minhas mensalidades" em `h2`, sem `h1`; o Início manda para `/cobrancas`, o menu para `/financeiro`: dois endereços para a mesma lista. | `Hub.tsx:285-293`, `BillingPage.tsx:342` |

## Causas repetidas (um achado só, com a lista de onde ocorre)

- **Alvo de toque abaixo de 44 px (mesma causa das áreas 1 e 2):** `Button` `h-10`/`h-9`/`icon h-10` e `Input`/`Select` `h-10` (`primitives.tsx:28,47,184`). Na área dos integrantes piora porque muitos lugares encolhem ainda mais por conta própria: `h-8 w-8` em 27 arquivos (ex.: `NaipesPage.tsx:127-132,391-393`, `TrashGroup.tsx:21-24`, `ViewAsBar.tsx:133,155`, `SelectedCycle.tsx:121`), `h-6`/`h-5` no perfil (ver P1), `Breadcrumbs.tsx:83` (24 px), X do painel `primitives.tsx:148` (28 px). "Ver mais" tem duas alturas: 36 px no `useProgressive` (`LoadMore.tsx:15`) e 40 px no `ShowMore` (`Paged.tsx:14`).
- **Dois componentes para "Ver mais":** `useProgressive`/`ProgressiveList` (`LoadMore.tsx`) e `usePaged`/`ShowMore` (`Paged.tsx`), com tamanhos diferentes; e um terceiro feito à mão no Início ("Carregar mais...", `HomePage.tsx:153`).
- **Última linha de grade que não estica (mesma causa da área 1):** `BalancedGrid` resolve, mas há grades fixas com quantidade variável: `Organogram.tsx:55`, `EventSettingsPage.tsx:102,106` (`ProgressiveList` em `sm:grid-cols-2`: 5 tipos viram 2+2+1), e a conferir na 3c: `DistributionPage.tsx:306`, `SubmissionsTab.tsx:215`, `DriveFoldersPage.tsx`, `ReportsPage.tsx:163`.
- **Contraste de selos e textos coloridos:** `text-warning` sobre `bg-warning/15` (2,72:1) e sobre branco (3,19:1), `text-success` sobre `bg-success/15` (3,57:1), `text-primary` em texto de 12 a 14 px (4,23:1 sobre o fundo creme, 4,49:1 sobre branco, 3,88:1 sobre `bg-muted`). Aqui o `text-muted-foreground` passa (5,04:1 sobre o creme, 4,62:1 sobre `bg-muted`), ao contrário da loja.
- **Foco de teclado (mesma causa das áreas 1 e 2):** `Button` e campos têm `focus-visible:ring-2`; botões feitos à mão não têm (itens do menu lateral e da barra inferior, "Voltar para…", `Collapsible`, `HighlightCards`, dias do calendário, botões do perfil, `RouteError`). Não testado por teclado.
- **Plural com "(s)" em vez de concordância:** `HomePage.tsx:87,257,261,262`, `EventsPage.tsx:208`, `BillingPage.tsx:187,305`, `AuditPage.tsx:128`, `RecurrencesSettings.tsx:147`, `DistributionPage.tsx:232`, `FieldSheet.tsx:317`, `FieldsTab.tsx:60`, `FormsPage.tsx:128,141`, `SubmissionsTab.tsx:224,233`, `PickupPointsTab.tsx:112`, `ProductSheet.tsx:129,371`, `ProductsTab.tsx:22`.
- **"Voltar" repetido:** o "Voltar para…" do topo e o caminho de navegação já existem em toda página; botões de voltar próprios repetem (`RepertoireDetailPage.tsx:63`; conferir outras páginas de detalhe na 3b/3c).
- **Estados de erro silenciosos:** várias consultas mostram esqueleto ou nada quando falham (`HomePage.tsx:142,192`, `MyParticipation.tsx:63`, `EventsPage.tsx:52`). Onde há erro tratado, o desenho é um `Card` com texto vermelho (`MemberDirectory.tsx:41`).
- **Vazio com dois desenhos:** `EmptyState` (tracejado, 39 arquivos) e `Card p-8 text-center` (`MemberDirectory.tsx:54`, `MembersPage.tsx`).
- **Carregamento de rota (`LoadingScreen`) sem as cores do bloco na primeira visita:** mesma causa do FO5 da área 1.

## Indícios para 3b e 3c (da varredura do código; não revisados a fundo)

- **"(opcional)" escrito** (proibido pela regra 4): placeholder "Descrição (opcional)" em `FormListsPage.tsx:145`, `CatalogEditor.tsx:186`, `OrgPages.tsx:101`.
- **Caixa do navegador** em vez do `DialogHost`: `window.prompt`/`window.alert` ao inserir link no editor de texto rico (`RichText.tsx:86,88`).
- **Botão de adicionar no topo fora do padrão** (regra 7): "Novo naipe" é um ícone `h-8 w-8` com contorno, não o `variant="add"` tracejado com "+" e texto (`NaipesPage.tsx:391`); "Novo repertório" fica ao lado do título, não abaixo em 100 % (`RepertoirePage.tsx:98-103`).
- **Tabela larga:** `PageReleasesTab.tsx:81` (`min-w-[34rem]` com rolagem horizontal) no celular.
- **Barra "Visualizar como"** (`ViewAsBar.tsx`): seletores de 32 px, texto de explicação de 12 px que aumenta o topo fixo.
- **Barra "Página liberada para"** (`PageReleaseBar.tsx`): caixas de 32 px de altura e marca de 16 px; o motivo de cada caixa desabilitada fica só no `title`.
- **Abreviação "Config."** no `SettingsButton` quando falta espaço (`SettingsButton.tsx:6`): texto encurtado, a confirmar com a regra de texto sem truncar.
- **Texto pequeno fixo:** `text-[11px]` no roteiro do evento (`EventSheet.tsx:172`) e em `ItineraryEditor.tsx:18`.
- **Chamada de presença** (`AttendanceRosterPage.tsx:259`): contadores fixos em `grid-cols-4` sob o topo fixo; conferir altura total no celular.

## Próxima etapa

**3b: Professor/Monitor** (Oficina, Presença e chamada, Relatórios, Lista de espera, Vagas, Fornecedores, Integrantes do grupo e ficha, Pix e "Pagamentos que recebo" no perfil). Abra uma conversa nova e, **antes**, entre com o Google no navegador embutido em `http://localhost:5173` com uma conta de Professor/Monitor (ou como Titular, usando "Visualizar como" → Professor/Monitor), para a revisão ser feita na tela e também confirmar os achados desta 3a. Depois, **3c: Direção/Titular**.
