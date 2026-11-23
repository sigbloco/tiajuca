# CLAUDE.md — SIGBloco, instância Cordão da Tia Juca

Sistema do bloco em três partes: **site** público, **loja** pública e **área dos integrantes** (login Google). Escreva tudo em português. Regras de negócio completas: [docs/regras-de-negocio.md](docs/regras-de-negocio.md). Histórico da revisão geral (achados, decisões, testes): [REVISAO.md](REVISAO.md). Banco e migrations: [docs/BANCO.md](docs/BANCO.md). Site configurável: [docs/SITE.md](docs/SITE.md). Loja: [docs/LOJA.md](docs/LOJA.md). Cobrança: [docs/COBRANCA_INFINITEPAY.md](docs/COBRANCA_INFINITEPAY.md).

## Stack

React 19 + Vite 8 + TypeScript 7 + Tailwind 3 + TanStack Query + react-router 7 + Supabase JS (só a chave publishable). Testes: vitest (lógica pura e SQL de fumaça em `supabase/tests`). Edge Functions em Deno (Supabase). Deploy: Cloudflare Workers com assets (`wrangler.jsonc`, SPA fallback); o Worker (`worker/index.js`) só roda em `/` e `/site` (título/descrição da prévia do link) e junto com `public/_headers` aplica os cabeçalhos de segurança, inclusive a CSP.

Comandos: `npm run typecheck`, `npm test`, `npx vite build`, `npm audit`. Não há ESLint (de propósito: sem comentários `eslint-disable`).

## Estrutura

- `src/app`: rotas (`routes.tsx`, tudo com `lazy` menos a página inicial e o login), `AppShell`, menus e `canOpenPath` (`navigation.ts`).
- `src/core`: auth, organização, permissões, tema, formatação (`format.ts`: `formatCents`, `formatCurrency`), `whatsapp.ts` (`whatsappUrl`), `safeUrl.ts`, cliente Supabase único.
- `src/components/shared|ui`: componentes comuns (`PageLink`, `TrashGroup`, `StickySave`, `FitText`, `Paged`/`LoadMore`…).
- `src/modules/*`: um módulo por assunto (members, billing, attendance, shop, site, forms…).
- `supabase/{migrations,functions,seed,tests}`, `worker/`, `public/`, `docs/`.
- **Site** (público): `src/modules/site`; rotas `/`, `/site`, `/:org/fotos`; só RPCs públicas (`get_public_site`, `get_public_albums`, `get_public_org`).
- **Loja** (pública): `src/modules/shop/{public,orders,payments}`, rotas `/:org/loja/*`; admin em `shop/admin` (`/:org/gerenciar-loja`). Edges: `shop-checkout`, `shop-order-public`, `shop-infinitepay-webhook`, `shop-mailer`, `shop-admin`.
- **Área dos integrantes**: o resto de `src/modules`, rotas `/:org/*` sob `RequireAuth` + `OrgGate`. Edges: `billing-pay-link`, `billing-infinitepay-webhook`, `drive-sync`, `drive-search`, `album-preview`.
- Formulário público: `/f/:org/:form`.

## Regras de negócio vigentes (resumo)

- **Tudo é por ciclo:** estrutura, equipe, categorias, valores, bolsas, isenções e repertório são relativos a um ciclo e mudam no seguinte.
- **Mensalidade, fonte única:** `billing_member_fee` (só o banco chama) decide a regra de uma pessoa num ciclo; usada pela geração e por "Minha participação". Tabelas `cycle_fee_assignments`, `fee_cycle_prices`, `cycle_scholarships`, `fee_cycle_exempt`, `cycle_extra_categories`. Quem tem vínculo remunerado no ciclo nunca é cobrado. Quem entra no ciclo atual herda categoria e bolsa do último ciclo.
- **Categorias por naipe:** uma categoria por naipe com Tipo/Naipe (valores 150/50/50/35); o Tipo (`base_key`) é o que vale, não `system_key`.
- **Cobrança InfinitePay:** link por cobrança; o webhook só dá baixa depois de consultar a InfinitePay e conferir o valor; cada transação paga vale uma vez (`infinitepay_transactions`); 400 enquanto a InfinitePay não diz "pago". Ajuste de cobrança tira o link e guarda o código antigo.
- **Loja:** preço e total recalculados no servidor; pagamento por Pix ou InfinitePay (taxa do cartão configurável no painel, `credit_fees_pct`); cupom com validade e limite de usos; preço especial (titular, direção e Professor/Monitor) só vale quando é menor que o de integrante (quem tem direito paga o menor); "avisei que paguei" não existe mais; pedidos encerrados são anonimizados após o prazo do aviso (tarefa diária); pedido de visitante só casa por e-mail confirmado.
- **LGPD:** auditoria mascara e-mail, telefone, Pix e nascimento (retenção 24 meses); backups manuais 12 meses; dados sensíveis de terceiros só por `get_member_sensitive`/`save_member_sensitive` (leitura registrada); aniversários do integrante comum: só ativos, nome de exibição, sem ano; inscrições antigas anonimizadas pela tarefa diária.
- **Professor/Monitor:** um papel de acesso só (chave `professor`, nome "Professor/Monitor"); a função na equipe continua separada (`staff_assignments.staff_kind` professor/monitor/regente). Grupo = instrumentos/naipes das atribuições de professor ou monitor no ciclo atual; regente é simbólico (não dá acesso, não registra presença, não amplia grupo). Quem tem atribuição de professor ou monitor no ciclo atual registra presença de qualquer integrante.
- **Reativação:** Professor/Monitor reativa inativo do próprio grupo; não inativa nem mexe fora dele.
- **Backups:** só `backups.manage` (Direção/Titular); o restore ignora linhas de outra organização, não mexe em papéis nem em `user_id`.
- **Login:** só Google (o provedor e-mail/senha deve ficar desligado no painel do Supabase); o vínculo com o cadastro é por e-mail (`link_my_member_by_email`).

## Matriz de permissões (resumida; o banco impõe, o front só esconde)

| Ação | Integrante | Colaborador | Professor/Monitor | Direção / Titular |
|---|---|---|---|---|
| Cadastro completo (e-mail, telefone, nascimento) | próprio | próprio | grupo | todos |
| Dados sensíveis, Pix | próprios | próprios | próprios | todos (sensíveis só por RPC) |
| Presença: ver / registrar | própria / — | própria / — | grupo / qualquer (com atribuição no ciclo atual) | toda / toda |
| Cobranças, bolsas, categoria | só as próprias | idem | idem | gerenciar |
| Eventos | visíveis | visíveis | + só equipe | gerenciar |
| Repertório | ver | ver | ver | editar |
| Estrutura, ciclos, vagas, fornecedores, financeiro, formulários, loja, site, tema | — | — | vagas/fornecedores: ver | sim |
| Backups, auditoria, matriz de permissões | — | — | — | sim (`members.manage` e `backups.manage` são travadas: não se delegam) |
| Conceder papéis | — | — | — | Titular concede Direção; titularidade só por transferência |

Inativo: só o próprio cadastro e o pedido de reativação. Página Integrantes de quem só vê o próprio cadastro: nomes dos ativos do ciclo atual (`member_directory_active`), sem ficha nem contato. Os escopos "Meu grupo" só existem onde o banco os usa. Tabela detalhada: seção 6 do [REVISAO.md](REVISAO.md).

## Convenções de código

- Refatorar é manter comportamento. Se uma regra de negócio parecer errada, aponte e pergunte.
- Acesso a dados pelo cliente Supabase único; permissão por `usePermission`/`canOpenPath`, nunca por nome de papel. Link de campo livre só `http(s)` (`safeHttpUrl`).
- Funções únicas: `whatsappUrl`, `formatCents`/`formatCurrency`, `textOn`. Não recrie cópias locais.
- Arquivos têm CRLF; scripts de edição precisam normalizar. Não há Python (scripts em Node).
- Nomes que confundem: o papel de acesso `professor` é o "Professor/Monitor" (não existe mais o papel `monitor`; `staff_kind` monitor continua existindo na equipe); "Categorias" na tela (rota `funcoes`) é a tabela `artistic_functions`; "categoria de contribuição" é `fee_categories` (o Tipo é `base_key`); "Release" no site é o botão do release de imprensa, e a liberação de páginas por papel é `pageRelease*` (`page_releases`). A página Distribuição é `DistributionPage`.
- Edge Functions são publicadas isoladas; `infinitepay.ts` e `verify.ts` existem em mais de uma pasta e `supabase/functions/copias.test.ts` exige que fiquem iguais.
- Migrations: o banco de produção é a fonte da verdade (ver [docs/BANCO.md](docs/BANCO.md)); mostre o SQL ao usuário antes de aplicar; depois renomeie o arquivo para a versão registrada.
- Testes de banco por papel: bloco `DO` que termina em `raise exception` com o resultado (tudo desfeito), via `set local role authenticated` + `request.jwt.claims`; dados de teste sempre removidos.

## Regras de interface (valem para o app todo)

- Fileira de botões que não cabe: quebra harmônica (4 → 2+2, 6 → 3+3, 5 → 3+2), colunas iguais; botões de ação sob um título ocupam 100% da largura; setas de reordenar ficam acima e abaixo da alça de arrastar.
- Toda lista de registros mostra 5 por vez com "Ver mais 5"/"Ver mais N" (também vitrine, vídeos e álbuns públicos); exceção só para conjuntos pequenos e fixos e listas operacionais (chamada).
- Campo obrigatório leva asterisco vermelho; os demais não levam "(opcional)". Salvar com obrigatório vazio avisa quais faltam.
- Última linha incompleta de uma grade estica para 100% da largura.
- Texto que cita uma página vira link (`PageLink`). Nome de integrante é sempre clicável (`MemberLink`).
- Botão de adicionar no topo: `variant="add"` (tracejado) com `+`. Título que repete o nome da aba selecionada não aparece.
- Sem reticências nem texto truncado; sem conectivo viúvo no fim da linha (`glueConnectives`); fonte diminui (`FitText`) em vez de quebrar palavra. Respiro lateral de botões/chips não encolhe com a fonte.
- Salvar: ou automático ao editar, ou botão fixo na base da página (`StickySave`); ícones de salvar/cancelar padrão. Lixeira: `TrashGroup`, grupo recolhível, último da página.
- Português correto: acentos e concordância.

## Cuidados de segurança

- Nenhuma `service_role` ou segredo no front; só a chave publishable. Segredos ficam nas Edge Functions.
- RLS ligada em todas as tabelas de `public`; o público (`anon`) só lê catálogo da loja, pontos de retirada e chama RPCs públicas. Funções `security definer` com `search_path` fixo e `revoke` de `anon`/`authenticated` quando só o banco as usa.
- Cabeçalhos em `public/_headers` e `worker/index.js` (iguais): `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, CSP (`script-src 'self'`, sem script inline; `connect-src` só o site e o Supabase; `frame-src` só YouTube nocookie). Ao adicionar script externo ou inline, ajuste a CSP nos dois lugares.
- Limites por IP usam `cf-connecting-ip` (funções e banco); nunca `x-forwarded-for`.
- Erros de Edge Function não devolvem detalhe ao cliente.
- Não versionar dados pessoais (`data-private/` é ignorado). Nada de nomes ou telefones reais em testes novos.
- Não faça deploy em produção sem pedido; o usuário publica o site a partir da `main` e as Edge Functions entram por `deploy_edge_function`.

## Pendências conhecidas

Ver "Andamento" no [REVISAO.md](REVISAO.md) (etapa 8): site (publicado em 23/11/2026 a partir da `main`) e as 10 Edge Functions já estão no ar com o `supabase-js` fixo; valores da instância que se trocam por bloco (`index.html`, manifest, `public/brand`, slug no `wrangler.jsonc`/`.env.production`). O baseline do esquema (DRIFT-02/03) está em `supabase/baseline/schema.sql` (retrato, não migration).
