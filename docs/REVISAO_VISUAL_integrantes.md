# Revisão visual — Área 3: área dos integrantes

Data: 23/11/2026. Só leitura: nada foi corrigido.

**Feitas: 3a (Integrante) mais as causas comuns da área toda, só pelo código; e 3b (Professor/Monitor), vista na tela (seção "Etapa 3b", mais abaixo).** A área tem cerca de 18 mil linhas em uns 100 arquivos (rotas `/:org/*`), grande demais para uma conversa; ficou dividida em 3a (Integrante), 3b (Professor/Monitor) e 3c (Direção/Titular), como combinado. A 3c está no fim, como "a fazer", com os indícios já encontrados.

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
| A8 | baixa | todas | Abertura do app: a tela de carregando é segurada por no mínimo 3 s depois da logo carregar (até 2,5 s de espera pela logo), com contagem de 0 a 100 %. Em toda recarga a pessoa espera de 3 a 5,5 s mesmo com tudo pronto. **Substituído pelo L1 da 3b** (medido na tela; o usuário pediu uma barra só, de no máximo 2 s). | `LoadingScreen.tsx:19-31`, `AppShell.tsx:142` |
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

## Etapa 3b: Professor/Monitor (vista na tela)

Data: 23/11/2026. Só leitura: nada foi corrigido.

**Como foi feita.** Logado como Titular no site publicado (`tiajuca.cordaodatiajuca.workers.dev`, que roda o código da `main`: o login do Google volta para lá, não para o `localhost`), com "Visualizar como → Professor/Monitor" numa monitora de pernalta. Larguras 375 px (prioridade), 768 px e 1280 px; os tamanhos citados foram **medidos na página** (`getBoundingClientRect`), não deduzidos das classes. Nada foi gravado: não toquei em Presente/Ausente/Justificado, não digitei chave Pix, não decidi pedido de volta; só abri listas, fichas e painéis de leitura. No fim, a visualização voltou para "Titular (eu mesmo)".

**Limite do "Visualizar como".** Menus, telas e permissões seguem o perfil, mas **os dados continuam os do Titular** (o próprio aviso da barra diz isso). Por isso a lista de Integrantes mostrou 62 pessoas (um Professor/Monitor de verdade vê só o grupo), e "Meus alunos" e o atalho da Presença usaram o naipe do Titular. O que depende dos dados do grupo está marcado **"a conferir com conta real"**.

Telas cobertas: carregamento, Início, Oficina, Presença do dia (`AttendanceListPage`, `ActivityCard`), chamada (`AttendanceRosterPage`), Integrantes do grupo e ficha (`MembersPage`, `MemberDetailSheet`), Vagas (`CapacityPage`), Naipes, Fornecedores, Calendário com painel do evento, Meu perfil (Pix e "Pagamentos que recebo"); pedidos de volta (`ReactivationRequests`) só pelo código.

### O que o Professor/Monitor tem hoje (banco de produção)

- Permissões: `attendance.read:group`, `attendance.record:group`, `billing.read:own`, `capacity.read:org`, `drive.read:org`, `events.read:org`, `member_cycles.read:group`, `members.read:group`, `pix.manage:own`, `repertoire.read:org`, `staff_payments.read:own`, `suppliers.read:org`.
- Páginas liberadas para "Professor/Monitor": Início, Meu perfil, Calendário, Integrantes, Naipes (com Vagas), Oficina, Presença. **Não liberadas:** Lista de espera, Relatórios de presença, Fornecedores, Repertório, Financeiro/Cobranças.
- Consequência na tela: das quatro entradas da Oficina, duas aparecem apagadas; Financeiro e Repertório aparecem apagados no menu lateral e na barra inferior; Fornecedores abre "Página ainda não liberada". Metade das permissões próprias do papel (lista de espera, relatórios, fornecedores) não tem página aberta. É configuração (Acesso e papéis), não código, mas enche a tela de entradas mortas.

### Resumo 3b: os problemas mais importantes

1. **(alta, todas) Barra de carregamento com duas animações e quase 4 s (observação do usuário, confirmada).** Medido numa recarga: de 0,2 a 0,6 s uma barrinha que corre sem parar (o `Loading` das rotas, sem `fillMs`); depois a barra que enche em 3 s (`AppShell`, `fillMs={3000}`), que só começa quando a logo carrega (até 2,5 s de tela só com o fundo); o app aparece em cerca de 4 s. O número corre à frente da barra (74 % com a barra em 67 %; numa carga, 94 % com a barra em cerca de dois terços). O pedido é uma barra só, de 0 a 100 % em no máximo 2 s. Substitui o A8 da 3a. `routes.tsx:65-76,80`, `AppShell.tsx:95,142`, `LoadingScreen.tsx:7-31,37-50,80-83`, `tailwind.config.ts:40-41`.
2. **(alta, 375 px) Chamada de presença com botões pequenos.** Presente/Ausente/Justificado com **36 px** de altura (o comentário do próprio código promete "botões grandes, uso com uma mão no celular"); filtros de naipe com 32 px; contadores com 52 px. É a tela que o professor usa em pé, no ensaio, com uma mão. `AttendanceRosterPage.tsx:29,215,318`.
3. **(alta, 375 e 768 px) Fileiras de filtros que caem para um botão por linha.** O `ButtonRow` com 5 itens pula as 2 colunas (deixaria um sozinho) e, quando 3 não cabem, vai direto para 1 coluna. Em Integrantes, os 5 tipos (Alunos … Sêniors) viram 5 linhas de 29 px em 375 **e** em 768 px; na chamada, os 4 naipes viram 4 linhas em 375 px porque o chip "Professores + Monitores" é medido com o texto por extenso (o `FitChoice` só encolhe depois). Em 1280 px ficam 3+2 e 2+2. `ButtonRow.tsx:29-33`, `MembersPage.tsx:44`, `AttendanceRosterPage.tsx:236-246`.
4. **(média, todas) Chave Pix salva sozinha ao sair do campo, numa página com "Salvar" fixo na base.** Dois jeitos de salvar na mesma tela (regra de salvar): quem digita a chave e toca em "Salvar" grava a chave pelo `onBlur`, e um toque fora com a chave pela metade também grava. Campo e tipo sem rótulo visível (só o placeholder "Digite a nova chave"); "PIX" em maiúsculas (o nome é "Pix"). `ProfilePage.tsx:42,47-58`.
5. **(média, todas) Integrantes: lápis "Editar ficha de …" para quem só pode ver.** O Professor/Monitor abre a ficha em modo leitura, mas o ícone e o `aria-label` prometem edição; na ficha, a "Situação" do ciclo é um seletor desabilitado a 50 % de opacidade em vez de texto. `MembersPage.tsx:308`, `MemberDetailSheet.tsx:96`.
6. **(média, todas) Calendário: o cartão que junta eventos no mesmo horário não tem "Presença".** Nas segundas (três eventos às 19:30) o professor perde o atalho que o cartão de evento único tem e precisa abrir cada evento (o painel do evento tem o botão). `MergedEventCard.tsx:6-27` (comparar com `EventCard.tsx:69`).
7. **(média, todas) Vagas difícil de ler.** A capacidade aparece duas vezes ("10" e "2/10"); "lotado" é só uma borda vermelha fraca (sem texto, só cor); "∞" sem explicação (só no `title`); em 1280 px a última linha tem 1 cartão de 174 px numa grade de 718 px (regra 5); em 375 px é um cartão por linha com o conteúdo num terço dele. `CapacityPage.tsx:101-113,153`.
8. **(média, todas) Início do Professor/Monitor: quadro "Pagamento" diz "Em dia" e leva a uma página não liberada.** O quadro mostra o próximo pagamento **a receber**, mas sem nada pendente diz "Em dia" (soa como mensalidade) e é um link para `/cobrancas`, que não está liberada para o papel; os pagamentos recebidos ficam em Meu perfil → "Pagamentos que recebo". `HomePage.tsx:202-205` (quadro na linha 204).
9. **(média, todas) Português: "Sêniors"** no filtro de Integrantes (o plural é "Seniores") e "Seniors" no Financeiro; "Músico convidado" no singular entre plurais (vem do nome da categoria). `MembersPage.tsx:44,117`, `BillingPage.tsx:27`.
10. **(média, 375 px) Topo do Titular no "Visualizar como" come metade da tela.** Barra laranja (cerca de 115 px) + "Página liberada para" (cerca de 150 px) + seletor de ciclo + "Voltar": o conteúdo começa perto de 330 px; no Meu perfil, com o "Salvar" fixo e a barra inferior, sobram cerca de 300 dos 812 px. Os seletores ficam cortados ("Professor/" e o nome da pessoa pela metade) e, ao recarregar, mostram "Titular (eu mesmo)" por um instante com a barra já laranja. É experiência da Direção/Titular (3c), mas atrapalha toda revisão feita assim. `ViewAsBar.tsx:96-98,121-140`, `app/PageReleaseBar.tsx`.

### O que não deu para verificar (3b)

- **Conta real de Professor/Monitor:** lista restrita ao grupo, "Meus alunos", o atalho Oficina → Alunos (abriu com Performance/Pernalta e "Meus alunos" e deu 0 integrantes com os dados do Titular), e qual evento o cartão "Presença" da Oficina abre (com os dados do Titular, abriu direto a chamada de 27/11, não o ensaio de hoje).
- **Gravações:** marcar presença, o campo de motivo do "Justificado", reativar inativo do grupo ("Pedidos para voltar"), salvar a chave Pix, desfazer. Só pelo código.
- **Lista de espera e Relatórios de presença:** não liberadas para o papel; ficam para a 3c (Direção vê).
- **Foco por teclado e leitor de tela:** não testados; só conferi `aria-pressed` e `aria-label` pelo DOM.
- **Larguras 768 e 1280 px:** medidas por script; as capturas de tela do painel cortam em 375 px de largura, então nessas larguras não há imagem.

### Achados por tela (3b: Professor/Monitor)

#### Carregamento — `LoadingScreen.tsx`, `routes.tsx`, `AppShell.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| L1 | alta | todas | Duas animações seguidas e cerca de 4 s até o app (ver resumo 1). A primeira é a barrinha indeterminada do `Loading` (sessão e vínculos carregando); a segunda é a barra que enche, montada pelo `AppShell` enquanto `membership`, liberações ou o tempo mínimo de 3 s (`useSplashHold`) não terminam. | `routes.tsx:65-76,80`, `AppShell.tsx:95,142`, `LoadingScreen.tsx:20-31` |
| L2 | média | todas | O número e a barra não andam juntos: o número vem de `requestAnimationFrame` e a barra de uma animação CSS de largura dentro de uma moldura com `p-0.5`; na medição o texto ficou de 7 a 25 pontos à frente. | `LoadingScreen.tsx:37-50,80-86` |
| L3 | baixa | todas | Antes da logo carregar, a tela fica só com o fundo (sem barra nem texto) por até 2,5 s. | `LoadingScreen.tsx:7-15,71` |

#### Início (`/:org`) — `HomePage.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| H1 | média | todas | Quadro "Pagamento" com "Em dia" e link para `/cobrancas` não liberada (ver resumo 8). Para o Professor/Monitor some o quadro "Frequência" e ficam três caixas. | `HomePage.tsx:200-205` |
| H2 | média | 375 | Quadros com rótulo e valor de 11 px (medido; confirma o I1 da 3a). | `HomePage.tsx:28-33` |
| H3 | baixa | todas | O roteiro de um evento com um item só aparece numerado ("**1.** 19:30 – 21:30 · Ensaio"); vale para a 3a também. | `EventCard.tsx:57` |

#### Oficina (`/:org/oficina`) — `Hub.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| O1 | média | todas | Duas das quatro entradas (Lista de espera, Relatórios de presença) aparecem apagadas, com o motivo só no `title` (mesma causa do A2 da 3a). | `Hub.tsx:44` |
| O2 | baixa | todas | "Presença" ("Chamada dos ensaios e das aulas") abre direto a chamada de um evento quando há um só do naipe no dia, sem dizer qual; ao voltar, a pessoa cai na Oficina, não na lista do dia. Comportamento pensado para o celular, mas o cartão não avisa. A conferir com conta real. | `AttendanceListPage.tsx:61-62` |

#### Presença do dia (`/:org/presenca?dia=`) — `AttendanceListPage.tsx`, `ActivityCard.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| PR1 | média | 375 | Atalhos de instrumento com 32 px de altura, larguras desiguais e quebra livre: a última linha deixa um sozinho ("Xequerê 0/1"). | `ActivityCard.tsx:109-117` |
| PR2 | baixa | todas | Instrumento sem ninguém aparece como "0/0" (ex.: Clarinete, Sax Alto). | `ActivityCard.tsx:117` |

Bem resolvido: setas de dia anterior/seguinte com 40 px e rótulo para leitor de tela; selo "Hoje"; contagem "presentes/total" por instrumento.

#### Chamada (`/:org/presenca/:id`) — `AttendanceRosterPage.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| CH1 | alta | 375 | Botões Presente/Ausente/Justificado com 36 px (ver resumo 2). Em 375 px cada um tem 100 × 36 px. | `AttendanceRosterPage.tsx:318` |
| CH2 | alta | 375 | Filtros de naipe um por linha (ver resumo 3): 4 naipes + o instrumento = 5 linhas de 32 px antes dos contadores. | `AttendanceRosterPage.tsx:236-253` |
| CH3 | média | 375 | "Justificado" abre um campo com placeholder "Motivo da justificativa *" (asterisco dentro do placeholder, sem rótulo) e o ✓ fica desabilitado e mudo enquanto o campo está vazio (regra 4). Não exercitado. | `AttendanceRosterPage.tsx:335,337` |
| CH4 | baixa | todas | Rótulo dos contadores é o nome do status + "s" (`{s.name}s`): certo para Presente/Ausente/Justificado, errado para status com outro plural. | `AttendanceRosterPage.tsx:263` |
| CH5 | baixa | todas | Topo da chamada aberta pela Oficina: "Voltar para Oficina" e, logo abaixo, o caminho "Calendário • Ensaio de reposição • Presença" (evento que não é aula usa o caminho do Calendário). Dois caminhos diferentes para a mesma tela. | `AttendanceRosterPage.tsx:219-223` |

Bem resolvido: contadores fixos que também filtram (`aria-pressed`), busca por nome, professores e monitores separados dos integrantes, nomes clicáveis, naipe do professor já marcado, instrumento único travado; em 768 e 1280 px os botões de status dividem a largura por igual.

#### Integrantes do grupo e ficha (`/:org/membros`) — `MembersPage.tsx`, `MemberDetailSheet.tsx`, `Reactivation.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| IG1 | alta | 375, 768 | Os 5 tipos um por linha, com 29 px de altura e texto de 12 px (ver resumo 3). | `MembersPage.tsx:44`, `ButtonRow.tsx:29-33` |
| IG2 | média | 375 | Seletor de atividade desabilitado mostra "Escolha o naipe an…" cortado (regra: sem texto truncado). | `MembersPage.tsx:392` |
| IG3 | média | todas | Lápis "Editar ficha" para quem só vê; "Situação" como seletor desabilitado a 50 % (ver resumo 5). | `MembersPage.tsx:308`, `MemberDetailSheet.tsx:96` |
| IG4 | média | todas | "Sêniors" e "Músico convidado" (ver resumo 9). | `MembersPage.tsx:44,117` |
| IG5 | média | todas | Pedidos para voltar: "Recusar" num toque, sem confirmação e sem campo de motivo (`p_note` vai sempre vazio), embora o integrante veja o motivo da recusa; "Autorizar exceção" (vaga lotada) existe só como ação dentro de um aviso que some. Botões de 36 px. Não exercitado. | `Reactivation.tsx:86-116`, `Reactivation.tsx:58` |
| IG6 | baixa | 375 | A ficha (painel) ocupa de 1 a 374 px, com o título a 9 px da borda, menos que os 16 px da página; X de fechar com 28 px (mesma causa da 3a). | `primitives.tsx:148` |
| IG7 | baixa | 375 | Selos ao lado do nome quebram linha ("Monitor" numa linha, "Sênior" na outra); cabeçalhos de instrumento recolhíveis com 28 px. | `MembersPage.tsx:295-297` |

Bem resolvido: grupos por naipe e instrumento recolhíveis, "Ver mais 5" dentro de cada instrumento, WhatsApp com rótulo para leitor de tela, contagem por naipe.

#### Vagas (`/:org/vagas`) — `CapacityPage.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| V1 | média | todas | Capacidade duas vezes, "lotado" só por cor, "∞" sem explicação (ver resumo 7). | `CapacityPage.tsx:103-111` |
| V2 | média | 1280 | Grade `auto-fill` de 4 colunas com 9 cartões: última linha com 1 cartão de 174 px em 718 px (regra 5; mesma causa da área 1). | `CapacityPage.tsx:101` |
| V3 | baixa | 375 | Um cartão por linha (a grade pede 168 px por coluna e sobram 341 px): nome e número ocupam um terço do cartão. | `CapacityPage.tsx:101` |
| V4 | baixa | 375 | Abas Naipes/Vagas/Organograma só com ícone no celular (o nome fica no `aria-label`); "Lista de espera" desabilitada com o motivo só no `title`. | `structure/NaipesTabs.tsx`, `CapacityPage.tsx:152` |

#### Naipes e Fornecedores

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| NF1 | baixa | todas | Texto de administração para quem só lê: "Itens desativados somem das novas escolhas… Só dá para excluir o que nunca foi usado." aparece para o Professor/Monitor. | `NaipesPage.tsx:428` |
| NF2 | baixa | todas | Fornecedores: o caminho começa em "Organização", área que o papel não tem no menu; o link leva a uma página que ele não abre. | `navigation.ts:17`, `AppShell.tsx` (caminho) |
| NF3 | baixa | todas | "Voltar para Naipes e instrumentos • Vagas" na própria página Naipes (o "Voltar" nomeia o caminho da página anterior): lido rápido, parece apontar para a página atual. | `AppShell.tsx:200-215` |

#### Calendário (visão do Professor/Monitor) — `MergedEventCard.tsx`, `EventsPage.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| CL1 | média | todas | Cartão de eventos juntos sem "Presença" (ver resumo 6). | `MergedEventCard.tsx:6-27` |
| CL2 | média | 375 | A grade desce cerca de 16 px quando o seletor de ciclo termina de carregar: um toque feito logo depois de abrir cai no dia errado (aconteceu na revisão: o toque no dia 23 marcou o 16). | `EventsPage.tsx`, `SelectedCycle.tsx` |
| CL3 | baixa | todas | Enquanto carrega, "Em destaque" mostra "0" e a grade aparece sem pontos, como se o mês estivesse vazio. | `EventsPage.tsx:226` |

Confirmados na tela, da 3a: C1 (dias com 36 px), C2 (pontos sem legenda), C3 (lista só depois de tocar num dia), C5 (destaque), I3 ("Carregar mais..." no Início), A1 (Repertório apagado na barra inferior, também para o Professor/Monitor), A3 (topo alto).

#### Meu perfil (Professor/Monitor) — `ProfilePage.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| PF1 | média | todas | Pix salva no `onBlur` numa página com "Salvar" fixo (ver resumo 4). | `ProfilePage.tsx:47-58` |
| PF2 | média | todas | Campo da chave e tipo sem rótulo visível; "PIX" em maiúsculas no título, no aviso e na mensagem de sucesso. | `ProfilePage.tsx:21,42,47,51-54` |
| PF3 | baixa | todas | "Pagamentos que recebo": selos de situação com as cores de selo de baixo contraste (mesma causa da 3a). Não havia pagamentos na pessoa visualizada. | `ProfilePage.tsx:124-132` |

#### "Visualizar como" e "Página liberada para" (o que o Titular vê ao revisar; detalhar na 3c)

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| VA1 | média | 375 | Topo de cerca de 330 px (ver resumo 10). As duas barras ficam fixas ao rolar. | `ViewAsBar.tsx:121`, `app/PageReleaseBar.tsx` |
| VA2 | média | 375 | Seletores de 32 px cortam o texto ("Professor/" e o nome da pessoa pela metade); o rótulo "Visualizando como" some no celular. | `ViewAsBar.tsx:126,133,147` |
| VA3 | baixa | todas | Ao recarregar, o seletor mostra "Titular (eu mesmo)" enquanto a lista de pessoas carrega, com a barra já laranja e o aviso de visualização. | `ViewAsBar.tsx:96-98` |
| VA4 | média | todas | "Página liberada para" com caixas que gravam ao toque, no topo de toda página: um toque sem querer ao rolar muda a liberação para um papel inteiro (não testado, para não gravar). | `app/PageReleaseBar.tsx` |

### Causas repetidas novas (3b)

- **`ButtonRow` com 5 itens vai para 1 coluna** quando 3 não cabem (pula 2+2+1 e não tenta 3+2 com fonte menor): Integrantes (tipos), e onde houver 5 botões longos. `ButtonRow.tsx:29-33`.
- **`FitChoice` dentro de `ButtonRow`:** a medida usa a opção mais longa, então o chip nunca deixa a fileira caber, mesmo tendo versões curtas ("Profs. + Mons."). `AttendanceRosterPage.tsx:244`.
- **Ícone de edição para quem só lê:** lápis em Integrantes; conferir na 3c outras listas com `Pencil` sem checar permissão.
- **Configuração de liberação deixando entradas mortas:** Oficina, menu e barra inferior mostram páginas com permissão e sem liberação. Sugestão para a 3c: rever a matriz de liberação junto com a matriz de permissões.

### Indícios para 3c (vistos de passagem)

- `ActivityCard.tsx:103,121`: cancelar evento (32 px) e cancelar instrumento (ícone de 14 px com `p-1`, cerca de 22 px), só para a direção.
- `BillingPage.tsx:27`: "Seniors".
- `app/PageReleaseBar.tsx`: caixas de liberação gravando ao toque (VA4).

## Próxima etapa

**3c: Direção/Titular** (Estrutura e Naipes em edição, Ciclos, Categorias, Valores, Bolsas, Cobranças, Financeiro, Formulários, Loja, Site, Interface, Acesso e papéis, liberação de páginas, Auditoria e backups, Lista de espera e Relatórios de presença). Pode ser feita com o mesmo login de Titular, já que é o próprio papel; o login do Google volta para o site publicado, então a revisão segue nele, só olhando. Ela é a maior das três: se não couber numa conversa, dividir em 3c-1 (pessoas, ciclos, presença e estrutura), 3c-2 (dinheiro: valores, bolsas, cobranças, financeiro) e 3c-3 (formulários, loja, site, interface, acesso, auditoria).
