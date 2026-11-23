# Revisão visual — Área 1: site público e fotos

Data: 23/11/2026. Só leitura: nada foi corrigido. Telas vistas no navegador embutido com o dev server (dados reais de produção, só leitura), em 375, 768 e 1280 px.

Telas cobertas: página inicial (`/site`), fotos (`/tiajuca/fotos`), popup de login (`/site?entrar=1`), formulário público em estado "não encontrado" (`/f/tiajuca/inexistente`). Código lido: `LandingPage.tsx`, `AlbumsPage.tsx`, `LoginPopup.tsx`, `PublicFormPage.tsx`, `FormFieldInput.tsx`, `ButtonRow.tsx`, `LoadMore.tsx`.

## Resumo: os problemas mais importantes

1. **(média, 640 px ou mais) Fotos: o quinto cartão fica sozinho, com meia largura** na última linha da grade. Viola a regra de "última linha esticada" (caso 5 → 2+2+1). `AlbumsPage.tsx:81`.
2. **(média, todas as larguras) Fotos: a ordem dos álbuns não é cronológica** dentro do ano: 27/09, 23/08, 05/07, **26/07**, 16/06. O botão "Inverter ordem" também herda o erro. Vem de `sort_order` antes de `event_date` (`albums.ts:51`) e do RPC `get_public_albums`; é preciso confirmar se a ordem manual é intencional. Se for, o visitante vê uma lista fora de ordem sem explicação.
3. **(média, 375 px) Alvos de toque abaixo de 44 px nas fotos:** botões de ano e "Inverter" com 36 px de altura, "Voltar para o site" com 36 px, autores (`@fulano`) com 18 px, título do álbum com 23 px, "Ver mais 5" com 36 px.
4. **(média, 375 px) Formulário público: "Voltar", "Próximo" e "Enviar inscrição" têm 40 px de altura** (`h-10`), abaixo de 44 px, e ficam fixos na base, onde o polegar mais usa. `PublicFormPage.tsx` (barra fixa, última linha do componente).
5. **(média, todas as larguras) Formulário "não encontrado" mostra uma faixa de cabeçalho vazia e com sombra** (cerca de 120 px de altura, sem logo nem título) e fundo cinza claro fora da identidade do bloco. Mesmo vazio, o cabeçalho fixo fica no topo. `PublicFormPage.tsx` (`shell`, `HeaderBand`).
6. **(baixa, 375 px) Cabeçalho fixo das fotos ocupa cerca de 160 px (20 % da tela)** com voltar + título + anos. Em celular pequeno sobra pouco para as fotos.
7. **(baixa, todas) Contraste do link do autor** (`text-primary` sobre cartão branco) é 4,49:1, um pouco abaixo de 4,5:1.
8. **(baixa, todas) Botão fechar (X) do popup de login tem 28×28 px** (`LoginPopup.tsx:28`, `p-1`).
9. **(baixa, desktop) Página inicial em coluna de 448 px num fundo amarelo de 1280 px:** funciona como "link na bio", mas os vídeos e a foto da camiseta ficam pequenos e sobra muito espaço.
10. **(baixa) Foco de teclado dos botões do site vem do padrão do navegador**, enquanto o `Button` compartilhado usa `ring-2 ring-ring`. Ver "Acessibilidade".

Sem achados de rolagem horizontal, texto cortado, reticências ou imagem sem `alt` nas telas vistas (375 px: largura da página = 375; 768 px: 753 px de área útil, sem estouro).

## O que não deu para verificar

- **Formulário público com campos, etapas, erros ("Falta preencher…"), envio e confirmação:** a produção não tem formulário aberto (a página inicial não mostra o botão de inscrição) e a pré-visualização exige login. Só li o código; os achados 4 e de rótulos abaixo vêm do código, não da tela.
- **Botões "em construção"**, **botão "Release"**, **botão de entrada com sessão aberta** e **animação de destaque (`animate-attention`/`trim-ring`)** em movimento: não estão ativos nos dados vistos. Na captura estática o anel vermelho parcial do botão "Boutique da Tia" aparece como arco incompleto, o que é o efeito proposto.
- **Tema escuro:** não existe alternância de tema nas telas públicas, então não há o que comparar.
- **Estados de erro e vazio das fotos** ("Não foi possível carregar…", "Ainda não há álbuns."): só no código; ambos são texto simples centralizado, sem ícone.
- **Foco visível pelo teclado, leitor de tela e contraste em todos os cantos:** medi só os contrastes da data e do autor nas fotos; o resto é inspeção de código.
- **Vídeos do YouTube:** o título cortado no topo do player é do próprio YouTube (iframe), fora do nosso controle.

## Achados por tela

### Página inicial (`/site`) — `LandingPage.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| L1 | baixa | 1280 | Coluna única de `max-w-md` (448 px) fica pequena em tela grande; vídeos e foto da camiseta viram miniaturas. Sem ajuste para 768 px ou mais (o cartão de vídeos poderia ir a 2 colunas ou ficar mais largo). | `LandingPage.tsx:93` |
| L2 | baixa | 375 | Os raios do cabeçalho terminam em linha reta atrás do cartão da descrição; nas laterais do cartão aparece o corte (amarelo liso abaixo, raio vermelho acima). Efeito de "degrau". | `LandingPage.tsx:88`, `Rays.tsx` |
| L3 | baixa | todas | Rodapé com `text-xs` (12 px) e `text-muted-foreground` sobre fundo amarelo. Contraste não medido; texto pequeno. | `LandingPage.tsx:168` |
| L4 | baixa | todas | O botão com a foto do produto (cartão com imagem) não tem o mesmo formato dos botões "pílula" logo abaixo (cantos `rounded-3xl`, alinhado à esquerda, altura 80 px contra 48 px). É intencional como destaque, mas pesa mais que o menu. | `LandingPage.tsx:126-134` |
| L5 | baixa | todas | Estado "erro/sem dados": mostra só o link "Entrar" sem explicar que o site não carregou. | `LandingPage.tsx:68-70` |

Bem resolvido: 375 px sem estouro; menu com 45–48 px de altura; redes sociais com 48×48 px e `aria-label`; vídeos com "Ver mais N" de 5 em 5; `h1` presente (visualmente oculto).

### Fotos (`/:org/fotos`) — `AlbumsPage.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| F1 | média | 640+ | Última linha incompleta: 5 cartões em 2 colunas deixam o último com meia largura, alinhado à esquerda (regra 5). Vale também para qualquer quantidade ímpar depois de "Ver mais". | `AlbumsPage.tsx:81` |
| F2 | média | todas | Ordem não cronológica dentro do ano (05/07 antes de 26/07). Confirmar se vem do cadastro manual (`sort_order`). | `albums.ts:51`, RPC `get_public_albums` |
| F3 | média | 375 | Alvos de toque pequenos: anos 36 px, "Inverter" 36 px (largura 44 px), "Voltar" 36 px, título do álbum 23 px, autor 18 px, "Ver mais 5" 36 px (usa `Button size="sm"` = `h-9`). | `AlbumsPage.tsx:54,59,68,91,96`; `LoadMore.tsx:15` |
| F4 | baixa | 375 | Cabeçalho fixo alto (cerca de 160 px) rouba espaço da rolagem. Sugestão: recolher o "Voltar" e os anos ao rolar. | `AlbumsPage.tsx:52-74` |
| F5 | baixa | todas | Contraste do autor 4,49:1; data 5,11:1 (ok). | `AlbumsPage.tsx:96` |
| F6 | baixa | todas | Capa e título são dois links para o mesmo destino; o da capa tem `aria-label` e o do título tem o texto. Leitor de tela anuncia o álbum duas vezes. Os dois abrem em nova aba sem avisar. | `AlbumsPage.tsx:86-91` |
| F7 | baixa | todas | Estado vazio e de erro sem ícone, sem ação (ex.: "Voltar para o site" já existe no topo, mas sem botão de tentar de novo). Carregamento mostra 2 `Skeleton` de altura fixa 256 px, que no celular ocupam duas linhas em vez de uma. | `AlbumsPage.tsx:76-80` |
| F8 | baixa | 375 | O filtro de ano usa `ButtonRow` (4 anos em 4 colunas): cabe, mas as colunas ficam com 80 px de largura e texto de 14 px. Com mais anos quebra para 2+2 conforme a regra: sem problema, só vigiar. | `AlbumsPage.tsx:66` |

Bem resolvido: capas com `loading="lazy"` e proporção fixa (sem salto de layout); `aria-pressed` nos filtros; 5 em 5 com "Ver mais"; sem rolagem horizontal.

### Popup de login — `LoginPopup.tsx`

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| P1 | baixa | todas | Botão fechar com 28×28 px (alvo abaixo de 44 px). | `LoginPopup.tsx:28` |
| P2 | baixa | todas | O único botão é "Continuar com Google", sem logotipo do Google nem aviso de que abrirá a página do Google. O texto da descrição ("integrantes, professores, monitores e direção") usa a cor `muted-foreground` do tema do Site, amarelada. | `LoginPopup.tsx:23,30` |

### Formulário público (`/f/:org/:form`) — `PublicFormPage.tsx`, `FormFieldInput.tsx`

Visto na tela: só o estado "não encontrado" e a tela de carregando. Resto, pelo código.

| # | Sev. | Largura | Achado | Arquivo provável |
|---|---|---|---|---|
| FO1 | média | todas | "Formulário não encontrado": faixa de cabeçalho vazia, com sombra, de cerca de 120 px; fundo do tema padrão, não o do bloco (o tema só é aplicado quando o formulário existe). Falta logo e um botão para voltar ao site além do link "Voltar" pequeno. | `PublicFormPage.tsx` (`shell`, `HeaderBand`) |
| FO2 | média | 375 | Botões da barra fixa (Voltar, Próximo, Enviar inscrição) com `h-10` = 40 px. | `PublicFormPage.tsx` (barra `sticky bottom-0`) |
| FO3 | baixa | 375 | Marcador "Estou ciente e concordo" usa caixa de 20 px; o rótulo envolve a caixa (toque aceito), mas a caixa visual é pequena. | `PublicFormPage.tsx` (`type="checkbox"`, `h-5 w-5`) |
| FO4 | baixa | todas | "Campos com * são obrigatórios." aparece duas vezes na etapa 1 (no cabeçalho fixo ao rolar e no cartão do título) e na etapa 2 em diante só no cabeçalho. Repetição, não erro. Regra do asterisco vermelho em obrigatório: cumprida no código (`text-destructive`). | `PublicFormPage.tsx` |
| FO5 | baixa | todas | Tela "Carregando" de rota (`LoadingScreen`) mostra raios cinza e preto antes do tema do bloco carregar; aparece rápido, mas destoa do amarelo e vermelho do site. | `LoadingScreen.tsx`, `Rays.tsx` |
| FO6 | baixa | todas | Aviso de campos faltando (`role="alert"`) aparece no topo da página; a tela rola até lá. No celular, quem está na base vê só a barra fixa piscar para o topo. Funciona, mas a mensagem só aparece depois da rolagem suave. | `PublicFormPage.tsx` (`fail`) |

Bem resolvido (pelo código): aviso de quais campos faltam (lista "Falta preencher: …"); campos vermelhos; rascunho guardado ao entrar com Google; progresso com `role="progressbar"`; seções com chips que quebram em 2+2/3+2 (`ChipRow`/`ButtonRow`); `Label` ligado ao campo; botões de ícone com `aria-label`.

## Causas repetidas (um achado só, com a lista de onde ocorre)

- **Alvo de toque abaixo de 44 px:** `Button size="sm"`/`default` (`h-9`/`h-10`) em `LoadMore.tsx:15` ("Ver mais" de toda a área pública), botões de ano e inverter, "Voltar" das fotos, barra do formulário, X do popup, links de autor. Provável correção central: altura mínima de 44 px no `Button` público e nos botões do site.
- **Última linha incompleta de grade não estica:** `AlbumsPage.tsx:81` (grade `sm:grid-cols-2`). A loja e a área dos integrantes devem ser conferidas nas próximas etapas pelo mesmo motivo.
- **Foco de teclado por padrão do navegador nos botões e links do site** (pílulas do menu, botões de ano, links dos cartões): só o `Button` compartilhado e os campos têm `focus-visible:ring-2`. Não conferi o desenho do foco do navegador sobre o fundo amarelo.

## Próxima área

**Área 2: loja pública** (`/:org/loja/*`: vitrine, produto, carrinho, checkout, consulta de pedido, privacidade). Abra uma conversa nova. Na loja convém conferir de ponta a ponta no celular a compra (produto, carrinho, checkout, pagamento), porque aqui o fluxo de inscrição não pôde ser exercitado.
