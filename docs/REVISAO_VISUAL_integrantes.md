# Revisão visual — Área 3: área dos integrantes

Data: 23/11/2026. Só leitura: nada foi corrigido.

**Feitas: 3a (Integrante) mais as causas comuns da área toda, só pelo código; 3b (Professor/Monitor) e 3c (Direção/Titular, em três partes: pessoas, ciclos, presença e estrutura; dinheiro; formulários, loja, site, interface, acesso e auditoria), vistas na tela (seções "Etapa 3b" e "Etapa 3c", mais abaixo). A área 3 está concluída; a ordem sugerida de correção fica no fim da 3c.** A área tem cerca de 18 mil linhas em uns 100 arquivos (rotas `/:org/*`), grande demais para uma conversa; ficou dividida em 3a (Integrante), 3b (Professor/Monitor) e 3c (Direção/Titular), como combinado. A 3c está no fim, como "a fazer", com os indícios já encontrados.

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
| IG1 | alta | 375, 768 | Os 5 tipos um por linha, com 29 px de altura e texto de 12 px (ver resumo 3). **Corrigido em 23/11/2026** (ver "o que atacar primeiro", item 6). | `MembersPage.tsx:44`, `ButtonRow.tsx:29-33` |
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

- **`ButtonRow` com 5 itens vai para 1 coluna** quando 3 não cabem (pula 2+2+1 e não tenta 3+2 com fonte menor): Integrantes (tipos), e onde houver 5 botões longos. `ButtonRow.tsx:29-33`. **Corrigido em 23/11/2026** (ver "o que atacar primeiro", item 6).
- **`FitChoice` dentro de `ButtonRow`:** a medida usa a opção mais longa, então o chip nunca deixa a fileira caber, mesmo tendo versões curtas ("Profs. + Mons."). `AttendanceRosterPage.tsx:244`. **Corrigido em 23/11/2026** (ver "o que atacar primeiro", item 6).
- **Ícone de edição para quem só lê:** lápis em Integrantes; conferir na 3c outras listas com `Pencil` sem checar permissão.
- **Configuração de liberação deixando entradas mortas:** Oficina, menu e barra inferior mostram páginas com permissão e sem liberação. Sugestão para a 3c: rever a matriz de liberação junto com a matriz de permissões.

### Indícios para 3c (vistos de passagem)

- `ActivityCard.tsx:103,121`: cancelar evento (32 px) e cancelar instrumento (ícone de 14 px com `p-1`, cerca de 22 px), só para a direção.
- `BillingPage.tsx:27`: "Seniors".
- `app/PageReleaseBar.tsx`: caixas de liberação gravando ao toque (VA4).

## Etapa 3c: Direção/Titular

A 3c é grande demais para uma conversa e ficou dividida em três partes: **3c-1** (pessoas, ciclos, presença e estrutura), **3c-2** (dinheiro) e **3c-3** (formulários, loja, site, interface, acesso e auditoria, mais Calendário e Repertório em modo de edição), todas abaixo.

### Etapa 3c-1: pessoas, ciclos, presença e estrutura (vista na tela)

Data: 23/11/2026. Só leitura: nada foi corrigido.

**Como foi feita.** Logado como Titular no site publicado (`tiajuca.cordaodatiajuca.workers.dev`, código da `main`), com "Titular (eu mesmo)"; a Direção foi vista pelo "Visualizar como → Direção" e, no fim, a visualização voltou para "Titular (eu mesmo)". Larguras 375 px (prioridade), 768 px e 1280 px; os tamanhos citados foram **medidos na página** (`getBoundingClientRect`). Nada foi gravado: não toquei nas caixas da "Página liberada para", em seletores de situação ou categoria, em campos que gravam ao sair, em "Encerrar", "Desativar", "Copiar do ciclo", cancelar aula, "Sincronizar acesso" nem "Testar conexão". Só abri listas, grupos recolhíveis, a ficha de um integrante e o formulário "Editar dados" dela, que fechei com o X de cancelar. Os números de linha são da `main` (`c7ca45a`); o site publicado pode estar um pouco atrás dela.

Telas cobertas: moldura do Titular ("Visualizar como" e "Página liberada para"), Início (bloco "Visão da direção"), Integrantes em modo de gestão e a ficha (`MembersPage`, `MemberDetailSheet`, `ArtisticLinks`, `MemberBilling`), Naipes em edição, Configurações de naipes (`NaipesSettings`, `CatalogEditor`), Organograma, Vagas em edição, Organização, Ciclos, Categorias (`funcoes`, `OrgPages`), Fornecedores, Google Drive, Oficina, Presença do dia (com os botões de cancelar), Lista de espera e Relatórios de presença.

#### Resumo 3c-1: os problemas mais importantes

1. **(alta, todas) Ações que gravam num toque, sem confirmação nem desfazer, ao lado de botões inofensivos.** Na ficha, o "Encerrar" vínculo (X vermelho de 32 px, logo ao lado do lápis de editar) encerra a participação artística, colaborativa ou a regência na hora. Em Configurações de naipes, o "Desativar" faz o mesmo. A Categoria principal e a Situação do ciclo, na ficha, gravam ao trocar a opção. E as caixas da "Página liberada para" (ver item 3) também gravam na hora. `ArtisticLinks.tsx:220,230`, `CatalogEditor.tsx:156-158`, `MemberDetailSheet.tsx:96`, `MemberBilling.tsx:281`.
2. **(alta, 375 px) O topo fixo do Titular toma quase metade da tela, mesmo sem "Visualizar como".** São 45 px da linha do "Visualizar como", 152 px de site, loja, Sair e "Página liberada para", e 97 px de ciclo, "Voltar" e caminho: **294 px fixos**, mais 55 px da barra inferior. Sobram 463 dos 812 px (57 %). O título de Integrantes começa a 283 px; com "Visualizar como" ativo, a 335 px. A ficha aberta começa a 306 px. O VA1 da 3b vale também para o uso normal. `AppShell.tsx:253-283`, `ViewAsBar.tsx:121-163`, `app/PageReleaseBar.tsx:28-48`.
3. **(alta, todas) "Página liberada para": caixas que gravam ao toque, fixas no topo de toda página** (confirma o VA4 da 3b). São rótulos de 168 × 32 px com a marca de 16 × 16 px, numa área por onde o polegar passa ao rolar. Mudam a liberação de um papel inteiro sem confirmação nem desfazer, e aparecem até no Início (desmarcar "Integrante inativo" ali esconderia o Início de quem está inativo). O motivo das caixas desabilitadas fica só no `title`. `app/PageReleaseBar.tsx:36-43`.
4. **(alta, 375 px) Alvos minúsculos nas telas de gestão.** Na ficha, os "+" têm 20 × 20 px (Adicionar ciclo, Adicionar participação artística, colaborativa e remunerada, Acumular outra categoria) e o lápis, a lixeira e o X de fechar têm 28 × 28 px. Nas Configurações de naipes, Subir/Descer têm **28 × 20 px**. Na Presença, o X "Cancelar a aula de …" tem **22 × 22 px** e fica colado ao atalho do instrumento. Em Naipes são quatro botões de 32 px por linha. `MemberDetailSheet.tsx:169,408-409`, `ArtisticLinks.tsx:207`, `MemberBilling.tsx:141`, `CatalogEditor.tsx:139-142`, `ActivityCard.tsx:103,120-121`, `NaipesPage.tsx:127-132`.
5. **(média, todas) Botão de adicionar fora da regra 7, em cinco desenhos diferentes.** "Novo integrante" é um "+" de 28 px com contorno, sem texto. "Novo naipe" e "Copiar do ciclo" são ícones de 32 px; o "Copiar do ciclo" é uma ação grande (copia estrutura, oficinas, vagas e equipe) explicada só no `title`. "Adicionar em …" (Categorias) é um "+" de 28 px no cabeçalho do grupo. Fornecedores tem um "+" sem nome em cada categoria. Já Ciclos, Drive e Fornecedores usam o `variant="add"`, mas ao lado do título e não ocupando 100 % da largura abaixo dele. `MembersPage.tsx:359`, `NaipesPage.tsx:391-394`, `OrgPages.tsx:131`, `SuppliersPage.tsx:211,219`, `CyclesPage.tsx:149`, `DriveFoldersPage.tsx:250`.
6. **(média, 375 px) Fornecedores: o botão "Novo" sai da margem.** A fileira Filtrar/Categorias/Novo é um `flex` sem quebra de linha. Em 375 px, o "Novo" vai de 279 a 375 px, encostado na borda e sem os 16 px de respiro; o tracejado fica cortado. `SuppliersPage.tsx:207-212`.
7. **(média, todas) Ficha do integrante com dois jeitos de salvar e sem marca de campo obrigatório.** "Editar dados" abre um formulário de 2153 px. O Salvar e o Cancelar são só ícones (40 × 36 e 42 × 36 px), ficam no meio dele (a 1332 px do topo da ficha) e não na base fixa. "Nome completo" é obrigatório (`required`), mas não tem asterisco. Logo abaixo, Situação e Categoria principal gravam sozinhas (regras 4 e de salvar). `MemberDetailSheet.tsx:286-314`.
8. **(média, todas) Categorias: a página inteira grava ao sair do campo e repete texto.** Nome, descrição, Tipo e Naipe gravam ao sair do campo. O placeholder diz "Descrição (opcional)" (regra 4). A mesma ajuda ("Com um naipe, só quem toca nele…") aparece 8 vezes, uma por categoria contribuinte. Os grupos mostram tudo de uma vez, sem 5 em 5 (Contribuintes tem 8). "Monitor" e "Produção" aparecem em Remuneradas e em Colaborativas sem nada que as diferencie. `OrgPages.tsx:95-114`.
9. **(média, todas) Setas de reordenar em dois desenhos (regra 2).** Em Naipes, as setas ficam à direita, ao lado do lápis e da lixeira, longe da alça de arrastar (à esquerda). Nas Configurações de naipes, o desenho segue a regra (seta, alça, seta), mas com setas de 20 px de altura. `NaipesPage.tsx:118-136`, `CatalogEditor.tsx:138-143`.
10. **(média, todas) Início, bloco "Visão da direção": números soltos.** As caixas não levam a lugar nenhum (nem "Lista de espera" nem "Pendente"). "Integrantes 191" não diz o que conta (ativos 62 + inativos 18 = 80; o resto são cadastros de outros ciclos). Os plurais vêm com "(s)": "5 lotado(s)", "0 inadimplente(s)", "≈ 4 bolsa(s) integral(is)". `HomePage.tsx:240-263`.

#### O que não deu para verificar (3c-1)

- **Gravações e o que vem depois delas:** salvar a ficha, encerrar vínculo, adicionar ciclo ou participação, excluir integrante e a lixeira de Integrantes (não apareceu: provavelmente vazia), criar, editar ou excluir naipe, instrumento, ciclo, categoria e fornecedor, "Copiar do ciclo", desativar nome de naipe, mudar o limite de vagas, cancelar aula ou evento (os diálogos não foram abertos), "Sincronizar acesso", "Testar conexão", adicionar à lista de espera e promover dela. Toasts, desfazer e mensagens de erro dessas ações: só pelo código.
- **Painéis de criação** ("Novo integrante", "Novo ciclo", "Novo fornecedor", "Adicionar pasta"): não abertos.
- **Lista de espera com gente:** estava vazia neste ciclo; só o vazio foi visto.
- **Estados de erro:** só pelo código. Das 13 telas, só Integrantes, Ciclos, Drive e Relatórios tratam erro de consulta; nas demais, falha vira esqueleto ou lista vazia (mesma causa da 3a).
- **Direção de verdade:** visto pelo "Visualizar como", que troca menus e permissões, mas não a barra de liberação (ver DX2). Colaborador, que não tem categoria na barra de liberação: não verificado.
- **Calendário e Repertório em modo de edição** (`EventSheet`, `eventos/configuracoes`, edição de músicas): fora da lista da 3c. Sugiro incluir na 3c-3.
- **Teclado e leitor de tela:** só `aria-label`, `aria-pressed` e `title` conferidos pelo DOM.

#### Achados por tela (3c-1)

##### Moldura do Titular: "Visualizar como" e "Página liberada para" — `ViewAsBar.tsx`, `app/PageReleaseBar.tsx`, `AppShell.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| DT1 | alta | 375 | Topo fixo de 294 px sem "Visualizar como" e de cerca de 350 px com ele (ver resumo 2). Em 768 px a barra de liberação vira uma linha só (65 px). **Corrigido em 23/11/2026** (ver "o que atacar primeiro", item 4). | `AppShell.tsx:253-283`, `app/PageReleaseBar.tsx:31` |
| DT2 | alta | todas | Caixas de liberação que gravam ao toque, também no Início (ver resumo 3). | `app/PageReleaseBar.tsx:36-43` |
| DT3 | média | todas | O motivo das caixas desabilitadas ("… não tem acesso a esta página em Acesso e papéis", "Libere primeiro a área…", "Só o Titular altera.") está só no `title`: no celular, a caixa apagada não explica nada (mesma causa do A2 da 3a). | `app/PageReleaseBar.tsx:37-41` |
| DT4 | média | todas | "Visualizar como" tem Colaborador, mas a barra de liberação só tem 4 categorias (Direção, Professor/Monitor, Integrante ativo e inativo): a tela não diz que regra vale para o Colaborador. | `access/pageReleases.ts:9-14`, `ViewAsBar.tsx` |
| DT5 | baixa | 375 | Dois "Sair" lado a lado com sentidos diferentes: o da barra laranja sai da visualização e o ícone da barra de cima sai da conta. No celular, o primeiro diz só "Sair" (o "Voltar a mim" aparece só a partir de 640 px). | `ViewAsBar.tsx:156`, `AppShell.tsx:258` |
| DT6 | baixa | 375 | Seletores de categoria e pessoa com 117 × 32 px (confirma o VA2 da 3b). | `ViewAsBar.tsx:126-149` |

##### Início, bloco "Visão da direção" — `HomePage.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| DI1 | média | todas | Caixas sem link e "Integrantes 191" sem explicação (ver resumo 10). | `HomePage.tsx:241-245` |
| DI2 | baixa | todas | Plurais com "(s)": "lotado(s)", "inadimplente(s)", "bolsa(s) integral(is)" (mesma causa da 3a). | `HomePage.tsx:257,261,262` |
Bem resolvido: 2 colunas no celular e 4 a partir de 1024 px, sem linha incompleta; barras por naipe com o número ao lado; os números em verde (`text-success` sobre branco, 4,3:1) passam por serem texto grande (20 px em negrito).

##### Integrantes em modo de gestão e ficha — `MembersPage.tsx`, `MemberDetailSheet.tsx`, `ArtisticLinks.tsx`, `MemberBilling.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| DM1 | alta | todas | "Encerrar" vínculo grava num toque (ver resumo 1). O X vermelho de 32 px fica a 4 px do lápis "Editar vínculo", também de 32 px (`gap-1`). | `ArtisticLinks.tsx:218-220,230` |
| DM2 | alta | 375 | "+" de 20 × 20 px; lápis, lixeira e X de 28 × 28 px (ver resumo 4). | `MemberDetailSheet.tsx:169,408-409`, `ArtisticLinks.tsx:207`, `MemberBilling.tsx:141`, `primitives.tsx:148` |
| DM3 | média | todas | Dois jeitos de salvar na ficha; Salvar e Cancelar só com ícone, no meio do formulário; "Nome completo" sem asterisco (ver resumo 7). | `MemberDetailSheet.tsx:286-314`, `MemberDetailSheet.tsx:96`, `MemberBilling.tsx:281` |
| DM4 | média | todas | "Novo integrante" é um "+" de 28 px ao lado do título (regra 7). | `MembersPage.tsx:359` |
| DM5 | média | todas | "Ativos" e "Inativos" parecem abas, mas somam: tocar em "Inativos" leva a lista de 62 para 80 (os dois marcados), não para os 18 inativos. Nada na tela diz isso. Chips de 29 px. | `MembersPage.tsx:368-369` |
| DM6 | média | 375 | Com a ficha aberta, sobram cerca de 460 px de tela; o formulário "Editar dados" tem 2153 px de altura. | `primitives.tsx:92`, `MemberDetailSheet.tsx:286` |
| DM7 | baixa | todas | "Também é:" aparece vazio, seguido só do "+"; resposta vazia vira "em branco" em itálico de 12 px, cinza a 70 % de opacidade. | `MemberBilling.tsx:134-141`, `MemberDetailSheet.tsx:321` |
| DM8 | baixa | todas | A mesma lista de instrumentos em duas ordens: alfabética em Integrantes, a do catálogo em Naipes, Organograma e Vagas (Agogô, Surdo, Caixa de guerra…). | `MembersPage.tsx`, `NaipesPage.tsx` |
| DM9 | baixa | todas | O nome da categoria vem do cadastro e destoa do resto da tela: "Senior" e "Senior (sopro)" sem acento, ao lado do selo "Sênior". | dado (Categorias), `MemberBilling.tsx:281` |

Bem resolvido: excluir integrante pede confirmação e explica que o cadastro vai para a lixeira; a ficha mostra a idade e os contatos como botões (WhatsApp, copiar e-mail); "Isento pela categoria Monitor" explica por que a pessoa não é cobrada.

##### Naipes em edição, Configurações, Organograma e Vagas — `NaipesPage.tsx`, `CatalogEditor.tsx`, `Organogram.tsx`, `CapacityPage.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| DN1 | média | todas | Setas de reordenar ao lado do lápis, longe da alça (ver resumo 9). | `NaipesPage.tsx:118-136` |
| DN2 | média | 375 | Quatro botões de 32 px por naipe e por instrumento (Editar, Excluir, Subir, Descer). A lixeira desabilitada ("Tem (ou teve) integrantes neste ciclo…") explica o motivo só no `title`. | `NaipesPage.tsx:127-132` |
| DN3 | média | todas | "Novo naipe" e "Copiar do ciclo" como ícones de 32 px ao lado do título (ver resumo 5). | `NaipesPage.tsx:391-394` |
| DN4 | baixa | todas | A confirmação repete a ideia: "Tirar o naipe “X” do ciclo Y e tirar deste ciclo?". | `NaipesPage.tsx:353` |
| DN5 | média | 375 | Configurações de naipes: Subir e Descer com 28 × 20 px; "Desativar" grava num toque; placeholder "Descrição (opcional)". | `CatalogEditor.tsx:139-142,156-158,186`, `StructureManagers.tsx:63` |
| DN6 | média | todas | Organograma: "Para mudar, vá a Naipes." continua sem `PageLink`, também para a Direção, que pode mudar (confirma o N2 da 3a). Em 768 px, 2 colunas com 3 naipes e Sopro sozinho com 216 px (confirma o N1). | `Organogram.tsx:52,55` |
| DN7 | média | todas | Vagas em edição: o campo do limite (52 × 40 px) não tem rótulo visível; aparece "10" ao lado de "2/10" sem dizer qual é o limite, e grava ao sair do campo. Em 768 px, 2 colunas: Performance com um cartão de 220 px e Percussão e Sopro com 9 cartões, o último sozinho (regra 5; mesma causa do V2 da 3b). | `CapacityPage.tsx:56-62,101` |
| DN8 | baixa | 375 | "Voltar para Naipes e instrumentos • Organograma" quebra em duas linhas no topo (mesma causa do NF3 da 3b). | `AppShell.tsx:267-279` |

##### Organização, Ciclos e Categorias — `Hub.tsx`, `CyclesPage.tsx`, `OrgPages.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| DC1 | média | todas | Ciclos: "Novo ciclo" (`variant="add"`) ao lado do título, com 132 px, e não em 100 % abaixo dele. Editar e Excluir com 40 px aqui, 32 px em Naipes e 28 px na ficha: três tamanhos para o mesmo par de ações. | `CyclesPage.tsx:149,175-177` |
| DC2 | média | todas | O ciclo atual ("Principal") tem lixeira na lista, com confirmação só de texto; o painel tem "Apagar tudo isso e o ciclo". São ações destrutivas a um toque da lista. Não exercitado. | `CyclesPage.tsx:108-109,176-177` |
| DK1 | média | todas | Categorias: tudo grava ao sair do campo, com "(opcional)", ajuda repetida 8 vezes, sem 5 em 5 e nomes repetidos entre grupos (ver resumo 8). | `OrgPages.tsx:95-114` |
| DK2 | média | 375 | "Adicionar em Remuneradas, Colaborativas, Contribuintes": "+" de 28 px dentro do cabeçalho recolhível (29 px), colado na área que abre e fecha o grupo. | `OrgPages.tsx:131` |
| DK3 | baixa | todas | Texto com maiúscula irregular: "(por exemplo, direção e Regência)". A página não tem `h1`. | `OrgPages.tsx:124` |

Bem resolvido: Organização com cartões que explicam cada página; Ciclos agrupados por data (Atual, Próximos, Passados) sem status manual; "Financeiro → Valores" em Categorias é `PageLink`; Categorias tem lixeira recolhível no fim.

##### Fornecedores e Google Drive — `SuppliersPage.tsx`, `DriveFoldersPage.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| DF1 | média | 375 | "Novo" sai da margem direita (ver resumo 6). **Corrigido em 23/11/2026** (ver "o que atacar primeiro", item 6). | `SuppliersPage.tsx:207-212` |
| DF2 | média | todas | O "+" de cada categoria (42 × 36 px) não tem `aria-label` nem `title`: o leitor de tela anuncia só "botão". | `SuppliersPage.tsx:219` |
| DF3 | baixa | todas | "Novo", sem dizer o quê (o painel se chama "Novo fornecedor"); "Filtrar" com 36 px. | `SuppliersPage.tsx:211` |
| DD1 | baixa | todas | Falta ponto: "…documentos, atas Adicione quantas quiser…". | `DriveFoldersPage.tsx:254` |
| DD2 | baixa | 375 | "Abrir no Drive" (138 × 36 px) e "Sincronizar acesso" (184 × 40 px) quebram em duas linhas com larguras e alturas diferentes (regra 2). O "Abrir no Drive" é um link feito à mão, sem o anel de foco do `Button`. | `DriveFoldersPage.tsx:275-282` |
| DD3 | baixa | todas | "Busca de partituras (Repertório)" usa o `<details>` do navegador (triângulo preto), um terceiro desenho de grupo recolhível, com "Salvar" dentro do bloco, não na base fixa. | `DriveFoldersPage.tsx:302` |

Bem resolvido: Fornecedores agrupados por categoria, com telefone, WhatsApp e site como botões; Drive com estado "Ainda não sincronizada com o Drive" e lixeira recolhível.

##### Oficina, Presença, Lista de espera e Relatórios — `Hub.tsx`, `ActivityCard.tsx`, `WaitlistPage.tsx`, `ReportsPage.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| DP1 | alta | 375 | Presença do dia na visão da direção: o X "Cancelar a aula de …" tem 22 × 22 px e fica dentro do atalho do instrumento (32 px); "Cancelar aula" (o evento) tem 32 px. | `ActivityCard.tsx:103,120-121` |
| DP2 | média | todas | A caixa de cancelar a aula de um instrumento tem título "Cancelar" e botões "Cancelar" (confirma) e "Voltar": "Cancelar" significa o contrário do habitual. A do evento usa "Cancelar o evento", que é claro. Não aberta. | `ActivityCard.tsx:47` (comparar com `:105`) |
| DL1 | baixa | todas | Lista de espera: "Adicionar" fica desabilitado e mudo até escolher a pessoa (regra 4). | `WaitlistPage.tsx:104` |
| DL2 | baixa | todas | "Instrumento desejado" na ordem do catálogo, com os naipes misturados (Agogô, Flauta, Pernalta, Surdo…). | `WaitlistPage.tsx:101` |
| DR1 | média | 375 | Relatórios: os 5 filtros (De, Até, Ordenar, Agrupar, Filtrar) ocupam a primeira tela inteira; o total aparece a cerca de 860 px e o primeiro nome mais abaixo. | `ReportsPage.tsx:117-139` |
| DR2 | baixa | todas | "0 presenças em 1 registros" (concordância); nomes em três formatos na mesma lista (nome completo, "Apelido ou Outro", apelido de duas letras com link de 11 × 18 px). | `ReportsPage.tsx:150-154,181` |
| DR3 | baixa | todas | "Filtrar" mistura naipes e instrumentos numa lista só, sem grupo. A página não tem `h1`. | `ReportsPage.tsx:125-136` |

Bem resolvido: Oficina com as quatro entradas acesas para a direção; Lista de espera vazia com `EmptyState` e link para Vagas; Relatórios com "Ver mais 5", porcentagem e total do período, e "Percentual (%)" com asterisco.

##### Diferenças entre Direção e Titular (F)

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| DX1 | — | todas | Nas telas da 3c-1, Direção e Titular veem o mesmo menu e os mesmos botões de gestão (Integrantes, Naipes, Ciclos, Categorias, Drive, Lista de espera). A diferença está na barra de liberação (a Direção só vê) e em Acesso e papéis (3c-3). | `navigation.ts` |
| DX2 | média | todas | "Visualizar como → Direção" não mostra a barra de liberação como a Direção a vê: ela usa o papel real, e o Titular continua com as caixas ativas (para a Direção elas aparecem desabilitadas, com "Só o Titular altera."). | `app/PageReleaseBar.tsx:15-18,36` |
| DX3 | baixa | todas | O aviso da visualização diz "você ainda é direção" também para o Titular. | `ViewAsBar.tsx:163` |

#### Causas repetidas novas (3c-1)

- **Gravar num toque, sem confirmar nem desfazer**, em botões que parecem de navegação ou ao lado de botões de leitura: "Encerrar" vínculo, "Desativar", caixas da "Página liberada para" e `OkSelect` de situação e categoria. A regra de salvar permite o automático, mas não diz nada sobre ações que tiram coisas. Vale combinar um padrão (confirmação ou toast com desfazer).
- **Três tamanhos de botão-ícone e cinco desenhos de "adicionar"** na mesma área: ações com 28 px (ficha), 32 px (Naipes, Categorias) e 40 px (Ciclos, Drive, Fornecedores); "+" de 20 px (`h-5`), de 28 px (`h-7`), ícone de 32 px (`h-8`), "+" sem nome e `variant="add"`.
- **Cabeçalho de página em `flex` sem `flex-wrap`:** os botões passam da margem em 375 px (Fornecedores). Conferir os demais cabeçalhos com dois ou três botões na 3c-2 e na 3c-3.
- **Recolhível em três desenhos:** `Collapsible`, botão próprio (perfil, 3a) e `<details>` nativo (Drive).
- **"(opcional)" confirmado** em `CatalogEditor.tsx:186` e `OrgPages.tsx:101` (já listado nos indícios; falta `FormListsPage.tsx:145`, para a 3c-3).

### Etapa 3c-2: dinheiro (vista na tela)

Data: 23/11/2026. Só leitura: nada foi corrigido.

**Como foi feita.** Como na 3c-1: logado como Titular no site publicado, em 375, 768 e 1280 px, com as medidas tiradas na página. Nada foi gravado. Não gerei cobrança, pagamento nem link; não marquei nada como pago; não toquei em valores, percentuais, horas nem bolsas (todos gravam ao sair do campo). Abri só listas, grupos, a navegação de mês (que só muda o que se vê), o painel de uma cobrança isenta, o de um pagamento da equipe e o de uma bolsa, e o formulário "Nova despesa", fechados pelo X. No meio da revisão a página recarregou sozinha uma vez (de `/financeiro` foi para `/receitas`), e o "Voltar" ficou sem destino ("Voltar"). Os números de linha são da `main`.

Telas cobertas: Financeiro (página inicial), Receitas, Despesas (com o formulário), Distribuição (grupos e regras), Pagamentos (lista e painel), Valores, Cobranças (resumo, filtros, grupos, painel; novembro e julho de 2026), Bolsas (resumo, lista e painel) e o bloco "Contribuição mensal" da ficha (`MemberBilling`).

#### Resumo 3c-2: os problemas mais importantes

1. **(alta, todas) Registros de dinheiro feitos num toque, sem confirmação.**
   - "Marcar como pago" registra o pagamento na hora, com a data de hoje já preenchida, tanto na cobrança quanto no pagamento da equipe.
   - "Gerar pagamentos do mês" (Distribuição) cria os pagamentos da equipe sem perguntar.
   - "Ajustar valor" grava sozinho ao sair do campo quando valor e motivo estão preenchidos, e esse ajuste invalida o link de pagamento.
   - "Replicar" copia os valores do ciclo anterior sem perguntar.

   Já "Gerar cobranças", "Cancelar cobrança" e "Cancelar pagamento" pedem confirmação. `BillingPage.tsx:120,127-129`, `StaffTab.tsx:100`, `DistributionPage.tsx:317`, `ContributionsEditor.tsx:100`.
2. **(alta, todas) Distribuição: o resumo esconde o déficit.** Em novembro entraram R$ 200,00 de mensalidades e a hora-aula soma R$ 640,00 ("Professores R$ 640,00 / R$ 200,00 (320%)"). O resumo mostra "Não distribuído (fica no caixa) R$ 0,00" e "Total previsto no mês: R$ 640,00", e o "Gerar pagamentos do mês" continua ativo. O aviso vermelho do topo fala do estouro, mas o quadro final, que é o que se lê antes de gerar, não mostra a diferença de R$ 440,00. `DistributionPage.tsx:306-318`.
3. **(média, todas) Campos de dinheiro que gravam sozinhos, pequenos e sem rótulo.**
   - Valores: o campo de valor de cada categoria não tem nome acessível (o leitor de tela lê "R$ 150,00") e grava ao sair do campo.
   - Distribuição: o % do grupo, o "Sobre" e as "horas no mês" têm 32 px de altura e gravam ao sair.
   - Bolsas: o painel tem só Percentual e Motivo, sem Salvar nem Remover; para tirar a bolsa, digita-se 0 %. Na ficha, os mesmos campos têm 32 px; no painel de Bolsas, 40 px.

   `ContributionsEditor.tsx:41`, `DistributionRules.tsx:158-161,196-205`, `MemberBilling.tsx:194-202`, `ScholarshipsPage.tsx:99-103`.
4. **(média, 375 e 768 px) Cobranças: a busca fica espremida.** A fileira busca + naipe + status é um `flex` sem quebra. Em 375 px a busca tem 50 px (só a lupa aparece) e o seletor mostra "Todos os naipe" cortado; em 768 px, 95 px. O campo não tem rótulo (só o placeholder). `BillingPage.tsx:255-258`.
5. **(média, todas) Navegação de mês em dois tamanhos.** Na Distribuição, as setas têm **22 × 40 px** em todas as larguras (o `MonthNav` está dentro de um `flex flex-wrap` que não dá largura às setas). Nas outras páginas, as setas têm 83 px em 375 px e 271 px em 1280 px. `DistributionPage.tsx:281`, `MonthNav.tsx:12`, `StepNav.tsx:17-19`.
6. **(média, todas) Valores mostra a variável técnica em cada linha.** "{valor:Aluno (percussão)}", em fonte mono de 12 px, quebra em duas ou três linhas no celular; só o `title` explica que é "Variável para usar nos textos dos formulários". Para quem ajusta valores, é ruído; o lugar dela seria o editor de formulários. `ContributionsEditor.tsx:38`.
7. **(média, 375 e 768 px) Cartões de resumo com a última linha incompleta (regra 5).** Receitas e Despesas têm 3 caixas em 2 colunas: "Saldo do mês" fica sozinho, com meia largura (168 px em 375, 220 px em 768). Em 1280 px, a terceira caixa tem o dobro da largura das outras (355 contra 174 px). `LedgerTab.tsx:104`.
8. **(média, todas) Cobranças: três níveis de grupo e valores sem nome.**
   - A lista é naipe → categoria → pessoa; em 375 px, os cartões das pessoas ficam com 213 px.
   - O valor ao lado do naipe e da categoria não diz o que soma (é o previsto).
   - Isentos aparecem com "bolsa 100% · vence 10/11/2026", e o painel deles mostra "Valor base R$ 0,00 · Bolsa (100%) − R$ 0,00".
   - "24 cobrança(s)" fica no fim.

   `BillingPage.tsx:262-305`.
9. **(média, todas) Números que não batem entre páginas (a conferir).** Em novembro, Bolsas diz "Impacto mensal estimado R$ 300,00" e Cobranças, "Impacto das bolsas R$ 450,00". Em Cobranças, "Total isento" e "Impacto das bolsas" deram o mesmo valor nos dois meses vistos (R$ 450,00 e R$ 400,00). Pode ser regra (um é estimado, o outro é das cobranças geradas), mas a tela não diz a diferença. `BillingPage.tsx:243-244`, `ScholarshipsPage.tsx:75`.
10. **(baixa, todas) O Financeiro abre com "Minhas mensalidades" para a própria direção.** "Você não possui mensalidades. Se isso estiver errado, fale com a direção." aparece acima dos 7 cartões para quem é a direção. `Hub.tsx:70`, `BillingPage.tsx:346`.

#### O que não deu para verificar (3c-2)

- **Painel de uma cobrança pendente** (link de pagamento, "Gerar link", "Marcar como pago", aviso de divergência da InfinitePay): em novembro não havia pendentes e, em julho, as pendentes não estavam entre as primeiras de cada grupo. Visto só pelo código.
- **Todas as gravações:** gerar cobranças, link, pagamentos; marcar como pago; ajustar; cancelar e reabrir; replicar valores; regras de distribuição (criar, editar, remover); bolsas; despesas e receitas avulsas; "Copiar inadimplentes" (copia para a área de transferência, não aberto). Toasts e erros: só pelo código.
- **Lista de Receitas e Despesas avulsas com itens:** não havia lançamentos em novembro; só o vazio ("Nada registrado neste mês.").
- **Direção:** pelo código, tem `finance.read` e as mesmas telas; não há diferença de tela entre Direção e Titular no Financeiro.

#### Achados por tela (3c-2)

##### Financeiro (página inicial), Receitas e Despesas — `Hub.tsx`, `LedgerPage.tsx`, `LedgerTab.tsx`, `ReceiptsByGroup.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| FN1 | baixa | todas | "Minhas mensalidades" vazio para a direção, acima dos cartões (ver resumo 10). | `Hub.tsx:70` |
| FN2 | média | 375, 768 | Três caixas em duas colunas, com "Saldo do mês" sozinho em meia largura (ver resumo 7). | `LedgerTab.tsx:104` |
| FN3 | média | 375 | Receitas, "Mensalidades por naipe": o total do naipe ("R$ 100,00 de R$ 100,00") some no celular (`hidden sm:inline`); fechado, o grupo só mostra o número de pessoas. | `ReceiptsByGroup.tsx:105` |
| FN4 | baixa | todas | "Mensalidades por naipe" diz que quem não contribui "não aparece aqui", mas os isentos por categoria aparecem com "R$ 0,00 Isento". Os nomes saem em formatos diferentes (nome completo, nome com apelido). | `ReceiptsByGroup.tsx` |
| FN5 | baixa | todas | "Pagamentos da equipe" aparece em Despesas e tem página própria (Pagamentos): o mesmo número em dois lugares, sem link de um para o outro. | `LedgerTab.tsx:104` |

Bem resolvido: o formulário "Nova despesa" segue as regras (asterisco vermelho nos obrigatórios, "(obrigatório)" só para o leitor de tela, aviso do que falta ao registrar, "Registrar" em 100 % da largura, explicação de que as mensalidades entram sozinhas); o vazio "Nada registrado neste mês."; "Saldo do mês (receitas − despesas)" com a conta explicada.

##### Distribuição — `DistributionPage.tsx`, `DistributionRules.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| DB1 | alta | todas | O resumo final mostra "Não distribuído R$ 0,00" com déficit de R$ 440,00, e "Gerar pagamentos do mês" grava sem confirmar (ver resumos 1 e 2). **Corrigido em 23/11/2026.** | `DistributionPage.tsx:306-318` |
| DB2 | média | todas | Setas do mês com 22 × 40 px (ver resumo 5). | `DistributionPage.tsx:281` |
| DB3 | média | 375 | "Nova regra" é um "+" de 20 × 20 px; Editar e Remover regra têm 32 px; o % do grupo tem 48 × 32 px e as "horas no mês", 80 × 32 px, e os dois gravam ao sair (ver resumo 3). | `DistributionPage.tsx:267`, `DistributionRules.tsx:158-170,202` |
| DB4 | baixa | todas | "4 dia(s) de aula no mês"; "R$ 0,00 para cada (2)" com três professores listados (o terceiro é pago por hora-aula, mas a tela não diz por que ficou fora da conta). | `DistributionPage.tsx:232`, `DistributionRules.tsx:211` |

Bem resolvido: aviso vermelho no topo quando a hora-aula passa das mensalidades; o resumo mostra a conta passo a passo; "Remover regra" pede confirmação; "Financeiro → Pagamentos" é `PageLink`.

##### Pagamentos — `PaymentsPage.tsx`, `StaffTab.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| PG1 | alta | todas | "Marcar como pago" grava num toque, com a data de hoje já preenchida (ver resumo 1). | `StaffTab.tsx:56,100` |
| PG2 | média | todas | Selos "Pendente" em amarelo sobre amarelo claro (2,72:1; mesma causa da 3a). | `billing/service.ts:8` |
| PG3 | baixa | todas | "Equipe" repetido em cada linha (é o destino da distribuição, igual para todos); "PIX" em maiúsculas no painel, no aviso, na mensagem e na forma de pagamento (mesma causa do PF2 da 3b). | `StaffTab.tsx:57,80,90,93,98` |

Bem resolvido: "Ver mais 5"; totais Pago e Pendente no topo; a chave Pix da pessoa no painel, com "Copiar"; "Cancelar pagamento" com confirmação.

##### Valores — `ValuesPage.tsx`, `ContributionsEditor.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| VL1 | média | todas | Variável técnica "{valor:…}" em cada linha (ver resumo 6). | `ContributionsEditor.tsx:38` |
| VL2 | média | todas | Campo de valor sem rótulo, gravando ao sair do campo (ver resumo 3). | `ContributionsEditor.tsx:41` |
| VL3 | baixa | todas | "Replicar" valores do ciclo anterior sem confirmação (só aparece em ciclo sem valores; não visto na tela). | `ContributionsEditor.tsx:97-101` |
| VL4 | baixa | todas | Os nomes vêm do cadastro: "Senior (percussão)" sem acento (mesma causa do DM9 da 3c-1). Na lista de isentos, os nomes repetidos ganham qualificação ("Monitor (remunerado)", "Monitor (colaborativo)"), o que falta na página Categorias (DK1). | dado, `ContributionsEditor.tsx:118` |

Bem resolvido: o texto do topo explica que cobranças já geradas não mudam e onde se define a categoria de cada pessoa; "Organização → Categorias" é `PageLink`.

##### Cobranças (visão da direção) — `BillingPage.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| CB1 | alta | todas | No painel da cobrança pendente, "Marcar como pago" grava num toque e "Ajustar valor" grava sozinho (o ajuste também invalida o link); os dois ficam logo abaixo de "Gerar link de pagamento" (ver resumo 1). Pelo código. | `BillingPage.tsx:103-131` |
| CB2 | média | 375, 768 | Busca de 50 px, "Todos os naipe" cortado e busca sem rótulo (ver resumo 4). **Corrigido em 23/11/2026** (ver "o que atacar primeiro", item 6). | `BillingPage.tsx:255-258` |
| CB3 | média | todas | Três níveis de grupo, valor do grupo sem nome, isentos com "bolsa 100% · vence …" (ver resumo 8). | `BillingPage.tsx:262-305` |
| CB4 | média | todas | "Impacto das bolsas" diferente do "Impacto mensal estimado" de Bolsas e igual ao "Total isento" (ver resumo 9). | `BillingPage.tsx:243-244` |
| CB5 | baixa | todas | "Motivo do ajuste (obrigatório)" escrito no placeholder, e não com asterisco; o campo de valor do ajuste não tem rótulo. | `BillingPage.tsx:127-128` |
| CB6 | baixa | 375 | "Gerar cobranças" é o maior botão da página (vermelho, 341 × 40 px), entre o resumo e os filtros, para uma ação de uma vez por mês; o dia a dia (buscar, abrir uma cobrança) vem abaixo dele. | `BillingPage.tsx:249-252` |
| CB7 | baixa | todas | "24 cobrança(s)" e, no aviso de geração, "cobrança(s) criada(s)" (concordância). | `BillingPage.tsx:187,305` |

Bem resolvido: seis caixas de resumo sem linha incompleta (2 colunas no celular e 3 a partir de 1024 px); "Gerar cobranças" pede confirmação e avisa que não duplica; "Ver mais 5" em cada categoria; o painel explica o que o ajuste registra e que o link antigo deixa de dar baixa.

##### Bolsas e bloco de contribuição da ficha — `ScholarshipsPage.tsx`, `MemberBilling.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| BL1 | média | todas | O painel da bolsa tem só Percentual e Motivo, que gravam ao sair, sem Salvar nem Remover; "0% remove a bolsa do ciclo" está só na descrição (ver resumo 3). | `ScholarshipsPage.tsx:99-103`, `MemberBilling.tsx:194-202` |
| BL2 | baixa | todas | Os mesmos campos têm 40 px no painel de Bolsas e 32 px na ficha do integrante. | `MemberBilling.tsx:199-202` |
| BL3 | baixa | todas | "Importado da planilha de controle 2026/27" como motivo da bolsa, no lugar do motivo de verdade (dado da migração). | dado |
| BL4 | baixa | 375 | "Nova bolsa" (`variant="add"`) ao lado do título, e não em 100 % abaixo dele (mesma causa do DC1 da 3c-1). | `ScholarshipsPage.tsx:69` |

Bem resolvido: quatro caixas de resumo (pessoas, soma, equivalente em bolsas integrais, impacto) com a conta explicada ("soma ÷ 100"); lista de 5 em 5.

#### Causas repetidas novas (3c-2)

- **Dinheiro gravado sem confirmação:** "Marcar como pago" (duas telas), "Gerar pagamentos do mês", "Replicar" e o ajuste automático. Na mesma área, "Gerar cobranças" e os cancelamentos pedem confirmação. Vale um padrão só para ações que criam ou mudam valores: confirmação com o resumo ("Registrar R$ 640,00 pago em 23/11 via Pix?") ou toast com desfazer.
- **Campo de valor (`MoneyInput`) sem rótulo:** Valores, ajuste da cobrança. O componente não recebe `aria-label` nem `id` nesses usos.
- **Fileira de filtros em `flex` sem quebra** (Cobranças), mesma causa do DF1 da 3c-1 (Fornecedores).
- **`MonthNav` dentro de um contêiner sem largura:** as setas encolhem para 22 px (Distribuição).

### Etapa 3c-3: formulários, loja, site, interface, acesso e auditoria (vista na tela)

Data: 23/11/2026. Só leitura: nada foi corrigido.

**Como foi feita.** Como na 3c-1 e na 3c-2: logado como Titular no site publicado, em 375, 768 e 1280 px, com as medidas tiradas na página. Nada foi gravado. Não publiquei nem arquivei formulário, não mexi em seletor da matriz de permissões, em caixa de liberação, em papel de ninguém, em cor, foto, controle deslizante do site, cupom nem configuração da loja; não criei, baixei, carreguei nem restaurei backup. Abri só abas, listas, o painel de um evento e a lixeira do Calendário, fechados pelo X. Em Auditoria, uma recarga da página (só leitura) serviu para ver as requisições. Também entraram o Calendário e o Repertório em modo de edição, que tinham ficado fora da lista. Os números de linha são da `main`.

Telas cobertas: Formulários (lista; editor com Configurações, Cabeçalho, Campos, Envio e Respostas; Seções modelo, Listas do cadastro e Textos padrão), Loja (`gerenciar-loja`: Pedidos, Produtos, Kits, Estoque, Retiradas, Cupons e Configurações), Site, Interface (Cores de fábrica, Sistema, Site e Loja), Acesso e papéis (Pessoas, Permissões dos papéis, Liberação de páginas), Auditoria e backups, Calendário da direção (botões do topo, lixeira, painel do evento), Configurações do Calendário (Tipos de evento) e Repertório.

#### Resumo 3c-3: os problemas mais importantes

1. **(alta, todas) A Auditoria não carrega em produção e a tela finge que está vazia.** A consulta a `audit_logs` voltou com **erro 500** nas duas tentativas (recarga às 23/11, conferida pelas requisições da página). Durante as novas tentativas automáticas, por cerca de 20 s, a tela mostra "0 registro(s)" e "1 / 1", sem esqueleto e sem a mensagem de vazio; só depois aparece "Algo deu errado. Tente novamente.", e o "0 registro(s)" continua embaixo. A causa está no banco (não investigada: esta fase é só de tela), e é a principal ferramenta de LGPD da direção. `AuditPage.tsx:65-79,110-128`.
2. **(alta, todas) Mudanças de acesso e publicações num toque, sem confirmação.**
   - "Publicar" um formulário (que abre o link ao público) grava na hora; só "Apagar" pede confirmação.
   - Na matriz de permissões, cada seletor "Ver/Editar" grava ao trocar, para o papel inteiro.
   - Em Pessoas, dar Direção ou Professor/Monitor a alguém é um toque; só tirar a Direção confirma.
   - Em Interface, "× Tirar" uma cor grava sozinho; tirar a "Principal" troca a cor dos botões do sistema, do site e da loja de uma vez.
   - No Site, tudo grava 0,8 s depois da mudança, inclusive os controles deslizantes, e vai direto para a página pública.
   - Na Loja, o cupom (ativo, desconto, validade e limite) grava a cada mudança; a validade usa o `type="date"` do navegador e grava a cada dígito.

   `SettingsTab.tsx:118`, `PermissionsMatrix.tsx:96-121`, `PeopleTab.tsx:126-131`, `InterfacePage.tsx:46-50,57`, `SiteSettings.tsx:85`, `CouponsTab.tsx:133-148`.
3. **(alta, 375 px) Acesso e papéis: a frase do titular quebra no meio da palavra.** "O bloco tem um **titular**: só ele concede…" é um `<p>` em `flex`, então cada pedaço vira uma coluna: "O bloco / tem um", "titul / ar" e ": só ele concede / ou remove a direção." O "titular" parte em "titul" e "ar" (regra: palavra não se quebra). `PeopleTab.tsx:146`.
4. **(alta, todas) A barra "Página liberada para" aparece nas subpáginas e muda a página-mãe.** A chave vem só do primeiro trecho do endereço. Nas Configurações do Calendário, de Formulários e de Naipes, no editor de um formulário e na chamada, as caixas valem para Calendário, Formulários ou Naipes inteiros. Nas Configurações do Calendário, "Integrante ativo" aparece marcado e ativo: um toque ali tira o Calendário de todos os integrantes (DT2 da 3c-1). `access/pageReleases.ts:60-65`, `app/PageReleaseBar.tsx:22`.
5. **(média, todas) Três jeitos de salvar na mesma área de configuração.**
   - Liberação de páginas marca e espera o "Salvar" fixo (o padrão certo), enquanto a barra do topo grava ao toque.
   - Interface: "Cores de fábrica" grava sozinha ("As mudanças são salvas sozinhas."); Sistema, Site e Loja esperam o "Salvar" fixo.
   - O editor de formulário tem "Salvar" fixo e, no meio da página, "Publicar" e "Arquivar". Na aba Cabeçalho, o texto diz "Vale na hora, sem republicar. Salve para aplicar.", que se contradiz.

   `PageReleasesTab.tsx:35-55`, `InterfacePage.tsx:57,146`, `SettingsTab.tsx:118-121,156`.
6. **(média, 375 px) Liberação de páginas no celular.**
   - A tabela tem 544 px numa área de 339 px: só aparecem "Página", "Dir." e metade de "Prof./Mon.", com rolagem lateral.
   - O "Desmarcar tudo (todas as categorias, menos Direção)" tem o texto mais largo que o botão: as letras passam por cima das duas bordas.
   - "Marcar tudo" tem 84 × 22 px; as 116 caixas têm 20 × 20 px.

   Em 768 px ainda há rolagem (445 de 544 px); em 1280 px cabe. `PageReleasesTab.tsx:76,81,93-95,116`.
7. **(média, 375 px) Alvos minúsculos nas telas de configuração.**
   - Interface: "× Tirar" tem **39 × 16 px**.
   - Loja → Configurações: "Remover" pessoa de contato tem **18 × 40 px**.
   - Subir/Descer: 28 × 20 px em Formulários (seções e modelos), 28 × 24 px no Site, 32 × 28 px em Produtos e Kits, 40 × 40 px no Repertório.
   - Formulários → Envio: as dezenas de botões de variável têm 22 px de altura (o mesmo painel se repete em cada caixa de texto).
   - Os controles deslizantes do Site e do Cabeçalho têm 16 px de altura.

   `InterfacePage.tsx:48`, `PaymentsTab.tsx:155`, `StructureManagers.tsx:63`, `SendSection.tsx`.
8. **(média, todas) Respostas de formulário e Auditoria paginam de 20 e 25, com "1 / 1".** As duas usam "Página anterior/Próxima página", e não o "Ver mais 5" (regra 3). Com zero itens, mostram "Nenhuma resposta.", "0 resposta(s)" e "1 / 1" ao mesmo tempo. `SubmissionsTab.tsx:18,204,234`, `AuditPage.tsx:13,92,128-129`.
9. **(média, todas) Painel do evento: ações só com ícone e duas sem nome.** Em 375 px, a fileira Presença/Editar/Cancelar/Apagar vira quatro ícones de 79 × 40 px (o `ActionRow` esconde todos os rótulos quando um não cabe). "Presença" e "Cancelar" não têm `aria-label` nem `title`: o leitor de tela lê só "link" e "botão". `EventSheet.tsx:179-197`, `ActionRow.tsx:27`.
10. **(baixa, todas) Textos desatualizados ou com "(s)".**
    - A confirmação de apagar formulário diz "vai para a lixeira (em Inscrições)", mas a página se chama Formulários.
    - "0 resposta(s)", "15 kit(s) possível(is)", "0 registro(s)" e "1 músicas".
    - Os backups mostram "4.1 MB" com ponto, e não "4,1 MB".

    `SettingsTab.tsx:121`, `FormsPage.tsx:128,141`, `ProductsTab.tsx:22`, `AuditPage.tsx:128`, `BackupsTab.tsx:15-17`.

#### Causa do erro 500 da Auditoria (investigada depois, só leitura)

- **O que acontece:** o banco cancela a consulta por tempo esgotado ("canceling statement due to statement timeout", nos logs do Postgres às 22:29 a 22:33 de 23/11; o papel `authenticated` tem `statement_timeout=8s`). O PostgREST devolve 500.
- **Por quê:** a política `audit_select` é `using (has_permission(organization_id, 'audit.read'))`. `has_permission` → `permission_scope_of` → `member_is_inactive` são `security definer` com `search_path` fixo, então o Postgres não as embute na consulta e roda tudo **uma vez por linha**. A tela pede o total exato (`count: 'exact'`), o que obriga a passar pelas 15.439 linhas. Medido como o Titular, numa transação desfeita no fim: **17,7 s** só a contagem (cerca de 1,1 ms por linha).
- **Correção testada (sem aplicar):** avaliar a permissão uma vez por organização, com `organization_id in (select … organizações em que eu tenho a permissão)`. A mesma contagem caiu para **7 ms**. Proposta: uma função `orgs_with_permission(p_perm)` (`security definer`, `search_path` fixo, só para `authenticated`) e a política `using (organization_id in (select public.orgs_with_permission('audit.read')))`. O resultado é o mesmo da regra atual.
- **Mesma armadilha, ainda abaixo do limite:** `event_attendance` (cerca de 4.300 linhas, `ea_select`) e `monthly_charges` (cerca de 1.600, `mc_charges_select`) usam `has_permission`/`permission_scope_of` por linha. Uma consulta que varra a tabela inteira de presença já gastaria uns 5 s; vale corrigir junto.
- **Aplicada em 23/11/2026** (versão `20261123225937`, `supabase/migrations/20261123225937_rls_permissao_por_organizacao.sql`). Depois de aplicar, a Auditoria abriu na tela com os 15.442 registros e resposta em 89 ms, e a contagem com a política real levou 7 ms. As funções novas só aparecem no aviso de segurança já conhecido (função `security definer` executável por `authenticated`, o mesmo de `has_permission`), não no de `anon`. A tela também já foi corrigida (ver o próximo item).
- **Migration:** funções `my_orgs_with_scope` e `my_member_ids` e as três políticas por `alter policy`. Antes de aplicar, testada sem alterar o banco: zero diferença de linhas visíveis em relação à regra atual para Titular, Direção, Professor/Monitor e integrante ativo (não havia integrante inativo com login para testar). Tempos com o Titular: Auditoria de 17,7 s para 7 ms, presença de 4,9 s para 2 ms e cobranças de 1,6 s para 2 ms.
- **Na tela (corrigido em 23/11/2026):** enquanto o React Query tentava de novo, a página mostrava "0 registro(s)" e "1 / 1". Agora, sem dados carregados, aparece só o esqueleto; no erro, só o aviso com "Tentar de novo", sem contagem, lista nem paginação.

#### O que não deu para verificar (3c-3)
- **Todas as gravações:** publicar e arquivar formulário, salvar campos e textos, respostas (aprovar, rejeitar, CSV, retenção), pedidos da loja (mudar status, retirada, PDF, arquivar), produtos, kits, estoque, cupons, configurações da loja, site, cores, papéis, matriz, liberação, transferência de titularidade, criar, baixar, carregar, restaurar e excluir backup, criar, editar, cancelar e apagar evento, tipos de evento, repertório. Toasts e erros: só pelo código.
- **Respostas de formulário com itens:** os três formulários estão em rascunho, sem respostas.
- **Painéis de produto, kit, pedido e evento em edição:** não abertos (o de pedido mostra dados de clientes).
- **Recorrências, Checklists e Feriados** das Configurações do Calendário, e o detalhe de um repertório em edição: não abertos.
- **Direção:** pelo código, a única diferença de tela nesta parte é em Pessoas (a Direção não concede nem tira Direção: o botão vem desabilitado, com cadeado e o motivo no `title`) e na barra de liberação (DX2 da 3c-1).

#### Achados por tela (3c-3)

##### Formulários — `FormsPage.tsx`, `FormEditorPage.tsx`, `SettingsTab.tsx`, `FieldsTab.tsx`, `SendSection.tsx`, `SubmissionsTab.tsx`, `SectionTemplatesPage.tsx`, `FormListsPage.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| FO1 | alta | todas | "Publicar" grava num toque (ver resumo 2). | `SettingsTab.tsx:118` |
| FO2 | média | todas | Editor com "Salvar" fixo, mais "Publicar" e "Arquivar" no meio da página e "Vale na hora, sem republicar. Salve para aplicar." (ver resumo 5). | `SettingsTab.tsx:118-121,156` |
| FO3 | média | todas | Respostas de 20 em 20, com página e "1 / 1" mesmo vazia (ver resumo 8). | `SubmissionsTab.tsx:18,204,234` |
| FO4 | média | 375 | Envio: quatro caixas de texto, cada uma com a barra de formatação (32 px) e o painel "Inserir variável", que abre dezenas de botões de 22 px; em Textos padrão, o mesmo painel se repete. | `SendSection.tsx` |
| FO5 | média | 375 | Campos e Seções modelo: Subir/Descer com 28 × 20 px; Duplicar e Restaurar com 28 × 28 px; três botões ("Salvar … como modelo", "Ocultar", "Apagar") de 101 × 36 px por seção. | `FieldsTab.tsx`, `SectionTemplatesPage.tsx` |
| FO6 | baixa | 375 | Abas do editor em 2+3 (Configurações e Cabeçalho em cima; Campos, Envio e Respostas embaixo); a regra pede 3+2. | `FormSettingsTabs.tsx` |
| FO7 | baixa | todas | Dois "voltar": o "Voltar para Formulários" do topo e uma seta de 40 px ao lado do título (mesma causa do R2 da 3a). | `FormEditorPage.tsx` |
| FO8 | baixa | 375 | Na lista, o link completo de cada formulário ocupa três linhas, partido no meio das palavras (`break-all`), em vermelho. | `FormsPage.tsx:122` |
| FO9 | baixa | todas | Listas do cadastro mostra as 6 listas de uma vez (regra 3) e a lixeira aparece vazia ("Lixeira 0"), enquanto nas outras páginas ela some quando está vazia. | `FormListsPage.tsx` |
| FO10 | baixa | todas | Confirmação com "(em Inscrições)" e "resposta(s)" (ver resumo 10). | `SettingsTab.tsx:121`, `FormsPage.tsx:128,141` |

Bem resolvido: Configurações e "Novo formulário" em 2 colunas iguais sob o título; "Apagar" vai para a lixeira, com confirmação; "Vale para todos os ciclos" no lugar do seletor de ciclo; aviso de que mudar o endereço quebra links já divulgados; "Seções modelo" com "Ver mais 1".

##### Loja (`gerenciar-loja`) — `ShopAdminPage.tsx`, `OrdersTab.tsx`, `ProductsTab.tsx`, `StockTab.tsx`, `PickupPointsTab.tsx`, `CouponsTab.tsx`, `PaymentsTab.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| LJ1 | média | todas | Cupom grava a cada mudança, e a validade a cada dígito, pelo `type="date"` do navegador (o resto do app usa o `DateInput` com máscara) (ver resumo 2). | `CouponsTab.tsx:133-148` |
| LJ2 | média | 375 | Configurações: "Remover" pessoa de contato com 18 × 40 px; a tabela de taxas tem 12 campos de 88 px. | `PaymentsTab.tsx:155` |
| LJ3 | média | 375 | Pedidos: "Exportar PDF", "Arquivar encerrados" e cinco filtros empilhados (cerca de 340 px) antes do primeiro pedido. | `OrdersTab.tsx:52-60` |
| LJ4 | baixa | todas | "Configurações" é uma engrenagem com `role="tab"` fora da fileira de abas (`tablist`): para o leitor de tela, é uma aba solta. | `ShopAdminPage.tsx:48,62` |
| LJ5 | baixa | 375 | Produtos e Kits: alça de 28 px, Subir/Descer de 32 × 28 px e "Mover para a lixeira" de 64 × 32 px; selo "KIT" de 10,4 px. | `ProductsTab.tsx` |
| LJ6 | baixa | todas | "15 kit(s) possível(is)"; "0 reservado" (com zero, o plural é "0 reservados"). | `ProductsTab.tsx:22`, `StockTab.tsx:103` |

Bem resolvido: as seis abas em 3+3 com 44 px de altura (as maiores da área); "Arquivar encerrados" com confirmação; "Ver mais 5" nos pedidos; Configurações com asterisco nos obrigatórios e "Salvar" fixo; Estoque explica o que cada item consome.

##### Site e Interface — `SiteSettings.tsx`, `InterfacePage.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| SI1 | média | todas | Site: tudo grava 0,8 s depois de mudar, até o arrastar de um controle deslizante, e vai direto para a página pública, sem prévia nem desfazer (ver resumo 2). | `SiteSettings.tsx:85,196-203` |
| SI2 | média | 375 | Site: Subir/Descer item com 28 × 24 px; controles deslizantes com 16 px de altura; caixas de marcar espremidas a 12 × 20 e 14 × 20 px. | `SiteSettings.tsx` |
| IN1 | média | todas | Interface com dois jeitos de salvar (ver resumo 5); "× Tirar" a cor grava sozinho, e tirar a "Principal" troca a cor dos botões em todo lugar (ver resumo 2). | `InterfacePage.tsx:46-50,57,146` |
| IN2 | média | 375 | "× Tirar" com 39 × 16 px (ver resumo 7). | `InterfacePage.tsx:48` |
| IN3 | baixa | 375 | Sistema, Site e Loja: 10 linhas de cor, cada uma com 6 amostras de 28 × 28 px e um "+": 70 alvos pequenos por aba. | `InterfacePage.tsx` |

Bem resolvido: prévia ao vivo das cores, que dá para tocar para escolher; "Restaurar cores de fábrica"; o Site diz "Tudo salvo automaticamente" no topo e "Salvando…" enquanto grava.

##### Acesso e papéis — `AccessPage.tsx`, `PeopleTab.tsx`, `PermissionsMatrix.tsx`, `PageReleasesTab.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| AC1 | alta | 375 | "titul / ar": a frase do titular em colunas (ver resumo 3). **Corrigido em 23/11/2026** (ver "o que atacar primeiro", item 6). | `PeopleTab.tsx:146` |
| AC2 | alta | todas | Papéis e matriz gravam num toque (ver resumo 2). | `PeopleTab.tsx:126-131`, `PermissionsMatrix.tsx:96-121` |
| AC3 | média | 375 | As três abas (Pessoas, Permissões dos papéis, Liberação de páginas) ficam uma por linha, com 38 px (mesma causa do `ButtonRow` da 3b). **Corrigido em 23/11/2026** (ver "o que atacar primeiro", item 6). | `AccessPage.tsx:73-78` |
| AC4 | média | 375 | Liberação de páginas: tabela com rolagem lateral, "Desmarcar tudo" com texto vazando do botão, "Marcar tudo" de 84 × 22 px (ver resumo 6). **Corrigido em 23/11/2026** (ver "o que atacar primeiro", item 6). | `PageReleasesTab.tsx:76,81,93-95` |
| AC5 | média | 375 | Matriz: 19 seletores de 32 px por papel, que gravam ao trocar. | `PermissionsMatrix.tsx:118` |
| AC6 | baixa | todas | Pessoas: "Direção" (77 px) e "Professor/Monitor" (151 px) lado a lado, com larguras desiguais e 36 px de altura (regra 2). | `PeopleTab.tsx:123-136` |

Bem resolvido: Liberação de páginas marca e espera o "Salvar" fixo, avisa ao sair sem salvar (`UnsavedGuard`) e explica que só vale para quem tem acesso em Permissões; tirar a Direção pede confirmação; a matriz mostra "Só a direção" com cadeado nas permissões travadas.

##### Auditoria e backups — `AuditBackupsPage.tsx`, `AuditPage.tsx`, `BackupsTab.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| AU1 | alta | todas | Auditoria com erro 500 e "0 registro(s)" na tela (ver resumo 1). **Corrigido em 23/11/2026** (banco e tela). | `AuditPage.tsx:65-79,110-128` |
| AU2 | média | todas | Paginação de 25 em 25 com "1 / 1" (ver resumo 8). | `AuditPage.tsx:13,129` |
| AU3 | baixa | 375 | Cada backup tem "Baixar" (92 px), "Restaurar" (115 px) e a lixeira (40 px) com larguras desiguais (regra 2). | `BackupsTab.tsx:113-121` |
| AU4 | baixa | todas | "4.1 MB" com ponto e "1 músicas" (ver resumo 10). | `BackupsTab.tsx:15-17` |

Bem resolvido: o texto "Como funciona" explica o que o restore faz e o cuidado com a LGPD; restaurar e excluir backup pedem confirmação; "Ver mais 4" nos backups.

##### Calendário e Repertório em modo de edição — `EventsPage.tsx`, `EventSheet.tsx`, `EventSettingsPage.tsx`, `RepertoirePage.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| CE1 | média | todas | Painel do evento com ações só com ícone, e "Presença" e "Cancelar" sem nome (ver resumo 9). | `EventSheet.tsx:179-197` |
| CE2 | média | todas | A barra "Página liberada para" nas Configurações do Calendário muda o Calendário inteiro (ver resumo 4). | `access/pageReleases.ts:60-65` |
| CE3 | baixa | todas | "Lixeira" é um botão do topo, ao lado de "Novo evento", "Cancelados" e "Configurações", e abre um painel; a regra pede a lixeira como grupo recolhível no fim da página (`TrashGroup`). | `EventsPage.tsx:134-150` |
| CE4 | baixa | 375 | Tipos de evento: 6 amostras de cor de 30 × 30 px por tipo (36 no total) e "Desativar" de 32 px. | `EventSettingsPage.tsx` |
| CE5 | baixa | todas | Repertório: Subir/Descer de 40 × 40 px aqui, contra 20 a 32 px nas outras listas (mesma causa do DC1 da 3c-1). | `RepertoirePage.tsx` |

Bem resolvido: "Novo evento" no padrão tracejado; a lixeira vazia diz o que guarda ("Eventos apagados ficam aqui até você restaurar…"); apagar e cancelar evento pedem confirmação, e o cancelamento pede o motivo.

#### Causas repetidas novas (3c-3)

- **Erro de consulta que parece lista vazia:** a contagem ("0 registro(s)", "0 resposta(s)") e a paginação aparecem mesmo sem dados carregados, e o erro só aparece depois das novas tentativas automáticas. Vale um padrão: enquanto não há `data`, mostrar esqueleto e esconder contagem e paginação; no erro, mostrar só o aviso, com "Tentar de novo".
- **Texto com `<strong>` ou link dentro de um `flex`:** cada pedaço vira uma coluna e a palavra pode partir no meio (Acesso e papéis). Procurar outros `<p className="flex …">` com texto misto.
- **Barra de liberação por primeiro trecho do endereço:** subpáginas mostram a barra da página-mãe.
- **Botão com texto fixo mais largo que ele** ("Desmarcar tudo (…)"): sem `FitText` nem quebra de linha.
- **Paginação por página** (Respostas, Auditoria) convivendo com o "Ver mais 5" do resto do app.

### Área 3 concluída: o que atacar primeiro

Lista curta para os pedidos de correção, pela ordem de risco:

1. **Auditoria fora do ar** (erro 500, já resolvido): política de RLS avaliada linha a linha; corrigida e aplicada em 23/11 (ver "Causa do erro 500 da Auditoria").
2. **Gravar num toque o que mexe com dinheiro, acesso ou o que é público:** marcar como pago, gerar pagamentos, ajustar valor, publicar formulário, papéis e matriz, caixas da "Página liberada para" (inclusive nas subpáginas), cores e site. Um padrão só de confirmação ou desfazer. **Feito em 23/11/2026:** confirmação com resumo (`confirmBox`) em marcar como pago (cobrança e equipe), ajustar valor (agora com botão, não grava mais ao sair do campo), gerar pagamentos (com o déficit, se houver), replicar valores, publicar formulário, dar a direção, caixas da "Página liberada para" (que deixaram de aparecer nas subpáginas) e tirar cor; "Desfazer" por 5 s na matriz de permissões; validade do cupom grava ao sair do campo, com a data completa. Já tinham "Desfazer": papéis em Pessoas, encerrar vínculo, situação e categoria na ficha. Ficou de fora o Site (gravação automática, permitida pela regra de salvar).
3. **Distribuição com déficit escondido** ("Não distribuído R$ 0,00"). **Feito em 23/11/2026:** com déficit, o quadro final troca o "Não distribuído" por "Falta para cobrir" em vermelho, o total avisa quanto passa das mensalidades, e a confirmação de "Gerar pagamentos do mês" repete o valor.
4. **Topo fixo do Titular** (294 a 350 px no celular) e a barra de liberação. **Feito em 23/11/2026:** a "Página liberada para" saiu do topo fixo e virou uma linha recolhida no começo da página ("Página liberada para: Direção, Professor/Monitor" + "Alterar"); a barra "Visualizar como" só fica fixa com a visualização ligada, com aviso mais curto, sem o "você ainda é direção" e com "Voltar" no lugar do "Sair" no celular. Pela conta das medidas da revisão, o topo fixo do Titular cai de cerca de 294 para cerca de 145 px (falta medir na tela depois de publicar).
5. **Alvos de toque:** os "+" de 20 px, Subir/Descer de 20 a 28 px, "× Tirar" de 16 px, "Remover" de 18 px, os botões da chamada (36 px) e o X de cancelar aula (22 px). **Feito em 23/11/2026:** os "+" de adicionar passaram a 28 px com área de toque de 44 px (utilitário `tap-44`); Subir/Descer com 36 × 44 px em todas as listas; lápis, lixeira, Duplicar e Restaurar com 40 px; X de fechar painel com 40 px; "× Tirar" com 44 px de altura; "Remover" contato não encolhe mais; botões da chamada com 44 px; X de cancelar aula com 36 px, separado do atalho por um traço; cancelar evento com 40 px. Fica para depois a causa geral (`Button` e campos com 40/36 px) e os dias do calendário.
6. **Quebras de layout no celular:** "titul / ar", "Novo" fora da margem em Fornecedores, busca de 50 px em Cobranças, "Desmarcar tudo" vazando, `ButtonRow` com 3 ou 5 itens indo para 1 coluna.
   **Feito em 23/11/2026:** `ButtonRow` mede cada linha pelo próprio botão mais largo e tenta, antes de um por linha, os arranjos equilibrados (5 → 3+2 ou 2+3, 6 → 3+3, nunca um sozinho embaixo); rótulo com versões curtas (`FitChoice`) entra na medida pela versão mais curta (chamada). Acesso e papéis: abas "Permissões"/"Liberação" quando apertam (cabem as três numa linha) e frase do titular sem colunas. Fornecedores: "Filtrar" desceu para uma linha própria e "Categorias"/"Novo" quebram dentro da margem. Cobranças: busca na largura toda, com rótulo, e os dois seletores lado a lado embaixo. Liberação de páginas: tabela cabe em 375 px (colunas estreitas, "Prof./Mon." em duas linhas), "Marcar tudo" com 36 px de altura e "Desmarcar tudo" quebrando dentro do botão. Não conferido na tela (sem login no navegador embutido).
7. **Regras de interface em série:** botão de adicionar (regra 7), última linha da grade (regra 5), "(opcional)", plurais com "(s)", "Ver mais 5" e paginação.

## Próxima etapa

**Revisão visual concluída nas três áreas** (site, loja e área dos integrantes). O próximo passo é o usuário escolher, em pedidos separados, o que corrigir primeiro; a lista "Área 3 concluída: o que atacar primeiro", logo acima, sugere a ordem. Antes de qualquer correção de tela, o erro 500 da Auditoria já foi corrigido no banco (ver a 3c-3).
