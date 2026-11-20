# Revisão geral do projeto Tia Juca

Branch de trabalho: `revisao-geral`. Fase 1 (diagnóstico, só leitura) feita em 19/11/2026.
Descrição completa das funcionalidades: [`docs/regras-de-negocio.md`](docs/regras-de-negocio.md). Este arquivo traz só resumo, conflitos, problemas e plano.

---

## 1. Regras de trabalho (valem para todas as conversas da revisão)

- Leia o `CLAUDE.md`, a memória do projeto e este arquivo (seção Andamento) antes de começar. Eles têm regras que a revisão não pode quebrar (dados por ciclo, regras de UI do site todo, categorias por naipe etc.).
- Escreva tudo em português.
- Trabalhe na branch `revisao-geral` (ou numa branch da etapa criada a partir dela). **Outras sessões usam a mesma pasta e trocam de branch** (na Fase 1 o checkout foi trocado para a `main` no meio do trabalho): trabalhe num worktree próprio (`git worktree add`) ou confira `git rev-parse --abbrev-ref HEAD` antes de cada commit.
- Fase 1: não altere código nem banco. A única escrita permitida é o `REVISAO.md` (e `docs/regras-de-negocio.md`), commitados na branch.
- Refatorar é manter comportamento. Se achar que uma regra de negócio está errada, aponte e pergunte; não corrija por conta própria.
- Correção de segurança que mude comportamento pode entrar no plano, mas liste o impacto e pergunte antes de aplicar.
- Não adicione dependências ao projeto sem justificar. Ferramentas de varredura (gitleaks, `npm audit`) podem rodar pontualmente via npx, sem entrar no package.json.
- Banco de produção:
  - consultas SOMENTE LEITURA são permitidas na Fase 1 (listar tabelas, policies, buckets, rodar os advisors do Supabase);
  - nenhuma migration, delete ou alteração sem o usuário ver o SQL antes.
- Não faça deploy em produção. Só preview, se necessário.
- Achado crítico (chave vazada, RLS desligada em tabela com dado pessoal, pagamento forjável): avise na hora, sem esperar o relatório completo.
- Cada achado precisa ser confirmado lendo o código ou a policy real. O que não foi confirmado entra como "suspeita", separado dos confirmados.
- Fase 2 (só depois do OK do usuário, **uma etapa por conversa**):
  - siga o plano aprovado, na ordem, com commits pequenos e temáticos (um assunto por commit);
  - ao fim de cada etapa: teste, diga o que testou e, estando tudo certo, faça o merge na `main`, confirme que ela contém a mudança, atualize o Andamento (e comite) e termine com o bloco "Próxima conversa". Se testes falharem ou houver conflito sem solução segura, pare e avise;
  - testes no mínimo: loja (catálogo → pedido → Pix e InfinitePay em modo teste/simulado → admin confirma → consulta por telefone); integrantes (login, cada papel acessando o que pode e sendo BLOQUEADO no que não pode, inclusive chamando o banco/API direto); site (páginas carregam e links funcionam);
  - testes com banco usam contas de teste marcadas; mostre o SQL antes de qualquer escrita e remova os dados de teste no fim;
  - na última etapa, crie/atualize o `CLAUDE.md` na raiz com stack, estrutura das três partes, regras de negócio vigentes, matriz de permissões, convenções de código e cuidados de segurança.
- Continuidade entre conversas:
  - o estado fica nos arquivos (este `REVISAO.md` e, no fim, o `CLAUDE.md`), nunca só na conversa;
  - numa conversa aberta com o prompt de continuação, não refaça o diagnóstico: confie neste arquivo e verifique só o que a etapa tocar;
  - toda resposta final de etapa termina com o bloco **"Próxima conversa"**: (1) o que foi feito e testado, em poucas linhas; (2) aviso em destaque para abrir uma NOVA conversa; (3) modelo e esforço recomendados para a próxima etapa, com uma frase de motivo, e a lembrança de trocar no seletor antes de enviar a primeira mensagem; (4) o prompt pronto: "Continue a revisão do projeto Tia Juca. Leia o CLAUDE.md, a memória e o REVISAO.md (seção Andamento) e execute a etapa N: <nome da etapa>. Siga as regras de trabalho do REVISAO.md.";
  - se a etapa for pequena e o modelo atual servir, pode-se continuar na mesma conversa, mas só com o contexto ainda curto.
- Se algo for ambíguo, pergunte antes de decidir.

---

## 2. Andamento

| Etapa | Nome | Status | Modelo / esforço | Testado | Decisões do usuário |
|---|---|---|---|---|---|
| Fase 1 | Diagnóstico (só leitura) | **concluída**, commitada na branch `revisao-geral` (não mergeada: a Fase 1 só escreve na branch) | Opus 5.5, alto | typecheck, build, testes, `npm audit`, advisors do Supabase, leitura de policies/funções em produção (só SELECT) | aguardando aprovação do plano e respostas da seção 9 |
| 1 | Segurança crítica (banco, Auth, webhooks) | **em andamento** na branch `revisao-etapa1` (ver "Etapa 1: onde parou") | Opus 5.5 ou Fable 5.2, alto | — | travar `members.manage` e `backups.manage`: **sim**; D7: **desligar login por senha** (o usuário faz no painel) |

### Etapa 1: onde parou (19/11/2026, conversa cortada por limite de uso)

- Branch `revisao-etapa1` (criada da `main` em `e0a2c78` + merge da `revisao-geral`), no worktree `.claude/worktrees/revisao-geral`. Nada aplicado no banco, nada mergeado na `main`.
- Feito: passo 1 (DRIFT-01, commit "traz para o repositório as 7 migrations…").
- Escrito, **não aplicado**: `supabase/migrations/20261120000001_seg_roles_user_link_backups.sql` (SEG-01, SEG-02, SEG-03 e as duas permissões travadas). Falta mostrar o SQL ao usuário, aplicar e testar por papel via REST.
- Webhooks (passo 5): a URL do link guardada tem o formato `https://checkout.infinitepay.io/<handle>?lenc=…` e **não contém o `invoice_slug`**, então não dá para amarrar o slug pela URL. Plano: guardar `transaction_nsu` com índice único (em `shop_orders.payment_ref` e `monthly_charges.pay_ref`, ou coluna própria), recusar transação já usada em outro pedido/cobrança, e responder 400 quando o `payment_check` disser `paid !== true` (LOJA-05). `verify.ts` é igual nas duas pastas.
- Faltam ainda os passos 6 (LOJA-04, SEG-06, SEG-09, SEG-10, LGPD-06), 7 (`public/_headers`) e 8 (orientar desligar o provedor e-mail no painel: das 3 contas com senha, 2 têm Google e 1 não tem cadastro).
| 2 | Área dos integrantes: permissões, telas e LGPD | pendente | Opus 5.5, alto | — | — |
| 3 | Área dos integrantes: cobranças com fonte única por ciclo | pendente | Opus 5.5, alto | — | — |
| 4 | Loja | pendente | Opus 5.5 ou Sonnet 5.5, médio a alto | — | — |
| 5 | Site e partes compartilhadas | pendente | Sonnet 5.5, médio | — | — |
| 6 | Qualidade, faxina e `CLAUDE.md` | pendente | Sonnet 5.5, médio | — | — |

---

## 3. Resumo do estado atual

- **Nenhum achado crítico confirmado.** RLS ligada em todas as tabelas do `public`; `anon` só lê catálogo da loja e pontos de retirada (e chama RPCs públicas); nenhuma `service_role` no front; nenhum segredo encontrado no histórico do git; os dois webhooks da InfinitePay só dão baixa depois de consultar a própria InfinitePay e conferir o valor; preço e total da loja são recalculados no servidor; não existe upload de comprovante.
- **Área dos integrantes:** a mais sólida em autorização para o integrante comum (não lê dados de outros, não muda o próprio papel, categoria ou cobrança). Os problemas graves estão **no topo da hierarquia** (Direção consegue virar Titular; permissões delegáveis demais: `members.manage`, `backups.manage`) e nas **regras de cobrança**, que convivem em dois modelos (tabelas antigas por data × tabelas por ciclo), com o integrante podendo ver um valor e pagar outro.
- **Loja:** fluxo de preço e pagamento correto no servidor. Problemas reais: a tela do pedido se apaga sozinha enquanto o cliente paga (limite de consultas), uma ação pública esquecida trava estoque indefinidamente, nome de uma pessoa fixo no checkout, promessa de apagar dados (LGPD) que nada cumpre, e uma suspeita importante sobre reaproveitar uma transação paga em outro pedido (depende da API da InfinitePay; correção barata).
- **Site:** sem XSS; falta qualquer cabeçalho de segurança (clickjacking), o bundle único de 1,6 MB vai para o visitante, e a RPC pública devolve a linha inteira de configurações.
- **Qualidade:** pouco código morto, mas muita duplicação nas Edge Functions (pasta `_shared` vazia, cópias já divergentes), arquivos e componentes enormes, 70 migrations que reescrevem funções por `replace()` de texto e **o repositório não reproduz o banco com segurança** (migrations aplicadas só no banco, versões diferentes, prefixos repetidos).

---

## 4. Linha de base (19/11/2026, medida sobre a `main` em `5f67d3b`; a branch `revisao-geral` parte de `9106dd7`, que só acrescenta ajustes de interface)

| Verificação | Resultado |
|---|---|
| `npm run typecheck` (`tsc --noEmit`) | **passa** (exit 0) |
| `npx vite build` | **passa** (exit 0). Avisos: `__dirname` no `vite.config.ts` (loader nativo futuro) e chunk > 500 kB (bundle principal ≈ 1,6 MB) |
| `npx vitest run` | **passa**: 27 arquivos, 200 testes |
| Lint | **não existe** (sem ESLint nem script `lint`; há 41 comentários `eslint-disable` que nunca rodam) |
| `npm audit` | 4 alertas: **crítico** `jspdf` ≤ 4.2.0; **alto** `jspdf-autotable` (via jspdf); moderados `dompurify` (via jspdf) e `postcss-selector-parser` |
| Advisors de segurança do Supabase | ERROR: `security_definer_view` (`v_member_directory`). WARN: proteção contra senha vazada desligada; `pg_net` no schema `public`; 2 funções sem `search_path` (não são definer); 31 funções definer executáveis por `anon` e 162 por `authenticated` (conferidas uma a uma, ver SEG-06). INFO: 4 tabelas com RLS e sem policy (`backups`, `form_upload_tokens`, `recurrence_skips`, `shop_lookup_attempts`), de propósito: só via RPC |
| Segredos no git | varredura por padrões em todo o histórico (`sb_secret_`, JWT, Resend, Google, chaves privadas, tokens GitHub/Slack/Stripe): **nada encontrado**. Versionados só `.env.example` e `.env.production` (este só tem `VITE_DEFAULT_ORG_SLUG`) |

---

## 5. Mapa do projeto

- **Stack:** React 19 + Vite 8 + TypeScript 7 + Tailwind 3 + TanStack Query + react-router 7 + Supabase JS (só chave publishable). Testes vitest (lógica pura). Edge Functions Deno no Supabase. Deploy: Cloudflare Workers com assets (`wrangler.jsonc`, SPA fallback); o Worker (`worker/index.js`) só roda em `/` e `/site` para reescrever título/descrição da prévia de link.
- **Banco:** Supabase `dzyvtqrxmladsxceqzud`, 1 organização, 191 integrantes, 23 contas (Google 22, e-mail/senha 3; 4 contas sem cadastro). 231 arquivos de migration no repo; 207 registradas no banco (as da fase de outubro foram aplicadas pelo editor SQL).
- **Pastas:** `src/app` (rotas, AppShell, menus), `src/core` (auth, organização, permissões, tema, formatação, cliente Supabase), `src/components/shared|ui`, `src/modules/*` (23 módulos), `supabase/{migrations,functions,seed,tests}`, `worker/`, `public/brand`, `docs/`.
- **Partes:**
  - **Site** (público): `src/modules/site`, rotas `/`, `/site`, `/:org/fotos`; lê só RPCs públicas (`get_public_site`, `get_public_albums`, `get_public_org`).
  - **Loja** (pública): `src/modules/shop/{public,orders,payments}`, rotas `/:org/loja/*`; edges `shop-checkout`, `shop-order-public`, `shop-infinitepay-webhook`, `shop-mailer`; admin em `src/modules/shop/admin` (rota `/:org/gerenciar-loja`, edge `shop-admin`).
  - **Área dos integrantes** (login Google): todo o resto de `src/modules`, rotas `/:org/*` sob `RequireAuth` + `OrgGate`; edges `billing-pay-link`, `billing-infinitepay-webhook`, `drive-sync`, `drive-search`, `album-preview`.
  - **Compartilhado:** cliente Supabase único (`src/core/supabase.ts`), `AuthProvider`, tema por área (`organizations.theme`: geral, site, loja), `format.ts`, `OrgLogo`, `RichText`, `links.tsx`; formulário público `/f/:org/:form`.
- **Fronteiras:** público = rotas acima, só por RPC `security definer`; logado = sessão + vínculo à organização; admin = permissões no banco (RLS/RPC). **No front quase nenhuma rota tem guarda de permissão** (só 3 telas com `DirectionOnly`): o menu esconde links e quem digita a URL vê a tela vazia (ver INT-02). Não há vazamento de dado privado para rota pública (conferido); o que "vaza" é só código (bundle único, SITE-01).

---

## 6. Matriz de permissões (como está hoje)

Legenda: **DB** = imposto por RLS/RPC no banco; **F** = só o front esconde. Escopo: própria pessoa / grupo (instrumento ou naipe do professor/monitor no ciclo atual) / todos.

| Ação | Integrante | Inativo | Colaborador | Monitor | Professor | Direção | Titular | Onde |
|---|---|---|---|---|---|---|---|---|
| Ver cadastro completo (e-mail, telefone, nascimento) | próprio | próprio | próprio | grupo | grupo | todos | todos | DB |
| Ver nome de exibição de todos (diretório) | sim | sim | sim | sim | sim | sim | sim | DB (view definer, conforme configuração) |
| Ver nome completo + dia/mês de nascimento de todos | **sim** | **sim** | **sim** | sim (com ano) | sim (com ano) | sim | sim | DB (`birthday_list`, LGPD-04) |
| Editar próprio perfil | sim | sim | sim | sim | sim | qualquer | qualquer | DB (`update_my_profile`) |
| Criar/editar/arquivar integrantes (todas as colunas, inclusive `user_id`) | — | — | — | — | — | sim | sim | DB (SEG-02) |
| Dados sensíveis (gênero, raça, PCD): ver/editar | próprio | próprio | próprio | próprio | próprio | todos | todos | DB |
| Chave Pix: ver | própria | própria | própria | própria | própria | todas | todas | DB |
| Chave Pix: cadastrar | — | — | — | própria | própria | qualquer | qualquer | DB |
| Status no ciclo / reativar | — | pede | — | — | decide (**quebrado**, INT-01) | sim | sim | DB |
| Presença: ver | própria | própria | própria | grupo | grupo | toda | toda | DB |
| Presença: registrar | — | — | — | grupo | qualquer integrante | toda | toda | DB |
| Relatórios de presença | — | — | — | grupo | grupo | todos | todos | DB |
| Cobranças: ver | próprias | próprias | próprias | próprias | próprias | todas | todas | DB |
| Cobranças: gerar, baixar, ajustar, cancelar, link | — | — | — | — | — | sim | sim | DB |
| Categoria e bolsa | ver própria | ver própria | ver própria | ver própria | ver própria | editar | editar | DB |
| Financeiro (receitas, despesas, distribuição) | — | — | — | — | — | sim | sim | DB |
| Pagamentos da equipe: ver | próprios | próprios | próprios | próprios | próprios | todos | todos | DB |
| Eventos: ver | visíveis a integrantes | — | visíveis a integrantes | + só equipe | + só equipe | todos | todos | DB |
| Eventos: criar/editar | — | — | — | — | — (escopo grupo ignorado, INT-05) | sim | sim | DB |
| Checklist: marcar tarefa | se responsável | — | se responsável | se responsável | se responsável | sim | sim | DB |
| Formulários: editar/aprovar | — | — | — | — | — | sim | sim | DB + F (configurações por nome de papel) |
| Repertório: ver / arquivos | sim / sim | — / **sim** (SEG-08) | sim / sim | sim / sim | sim / sim | sim | sim | DB |
| Repertório: editar | — | — | — | — | — | sim | sim | DB |
| Estrutura, ciclos, vagas, fornecedores: editar | — | — | — | — | — | sim | sim | DB |
| Vagas, fornecedores: ver | — | — | — | sim | sim | sim | sim | DB |
| Drive: pastas | liberadas | — | liberadas | todas | todas | gerenciar | gerenciar | DB |
| Loja (admin), site, interface/tema | — | — | — | — | — | sim | sim | DB |
| Backups (criar, baixar, carregar, restaurar) | — | — | — | — | — | sim | sim | DB (SEG-03) |
| Auditoria | — | — | — | — | — | sim | sim | DB |
| Conceder/revogar papéis | — | — | — | — | — | sim (Direção só se não houver titular; **bypass**, SEG-01) | sim | DB |
| Matriz de permissões | — | — | — | — | — | sim (exceto travadas) | sim | DB |
| Liberação de páginas | ler | ler | ler | ler | ler | ler | gravar | DB (o efeito é só F) |
| "Ver como" | — | — | — | — | — | sim | sim | só F |

---

## 7. Regras de negócio: resumo e conflitos

Descrição completa em `docs/regras-de-negocio.md`. Regras que hoje têm **duas versões ativas** ou divergem entre front e banco:

1. **Cobrança em dois modelos** (COB-01 a COB-04): geração usa `cycle_fee_assignments`, `fee_cycle_prices`, `cycle_scholarships`, `fee_cycle_exempt`; "Minha participação", ficha do integrante, tela de Bolsas e indicadores leem `member_fee_assignments`, `fee_category_prices`, `scholarships` (101/10/7 linhas, contra 363/20/30 nas tabelas por ciclo). Um gatilho apaga e recria o ciclo atual a partir das tabelas antigas.
2. **Remunerado** (COB-05): o front esconde a contribuição de quem é remunerado; a geração de cobranças não exclui.
3. **Distribuição** (COB-06): calculada no navegador; `compute_distribution` e suas tabelas continuam no banco sem uso.
4. **Classificações** (COB-08): o painel da Direção agrupa por `classifications` (Aluno/Músico/Sênior antigos), paralelo ao Tipo da categoria (`base_key`); o front ainda usa `system_key` em lugares onde a regra é `base_key` (INT-08).
5. **Reativação** (INT-01): `can_decide_reactivation` autoriza Professor; `set_member_cycle_status` exige `member_cycles.manage`, que o Professor perdeu.
6. **Permissões no front** (INT-07): por permissão × por nome de papel; menu com escopo mínimo `own` × páginas com `org`.
7. **Loja, confirmação de pagamento:** manual e webhook coexistem sem reconciliação; o fluxo "avisei que paguei" saiu do front mas segue na API, no e-mail e no painel (LOJA-02, LOJA-14).
8. **Loja, preço especial** substitui o preço de integrante mesmo quando este é menor (LOJA-11). **Taxa do cartão** só no front (LOJA-13).
9. **Loja, privacidade:** o aviso promete apagar dados após N anos; nada apaga (LGPD-01).
10. **Configuração morta:** `shop.config.ts` (`orgSlug`) não é lido; o slug vem da URL ou de `VITE_DEFAULT_ORG_SLUG` + `ORG_SLUG` do Worker (dois lugares que precisam concordar).
11. **Docs:** `docs/RLS.md`, `PROPOSTA_TECNICA.md`, `PLANO_FASES_10_13.md`, `ROTEIRO_DE_TESTE.md`, `LOJA.md` e `README.md` descrevem regras antigas (senha, convites, Cloudflare Pages, sem cupom, estoque por tamanho). `COBRANCA_INFINITEPAY.md` está coerente.

---

## 8. Problemas confirmados

Cada item foi confirmado lendo o código e/ou a definição em produção. "Muda comport." = se a correção muda o que o usuário vê/pode fazer.

### 8.1 Alto

| ID | Parte | Onde | Risco concreto | Correção proposta | Muda comport.? |
|---|---|---|---|---|---|
| SEG-01 | Integrantes/banco | gatilho `guard_privileged_roles` (`20261015000015:65-88`, linha 73 `if tg_op = 'UPDATE' and not v_revoking then return new`), policy `member_roles_update` | Um diretor faz `PATCH member_access_roles` trocando `access_role_id` da própria linha para o papel titular (vira Titular), ou trocando `member_id` da linha do titular para si (rouba a titularidade), ou "desrevoga" papéis. Fura a regra "só o titular concede a Direção / titularidade só por transferência" | No gatilho, recusar mudança de `access_role_id`, `member_id`, `organization_id` e tratar `revoked_at → null` como concessão; ou revogar `UPDATE` de `authenticated` e deixar só as RPCs | Não (a interface usa as RPCs) |
| SEG-02 | Integrantes/banco | policy `members_update` sem restrição de coluna (`0003:45-47`), sem gatilho sobre `user_id`; `members.manage` fora de `locked_permissions` (`0015:206-210`) | Quem tem `members.manage` liga a própria conta ao cadastro do Titular (`user_id`) e assume a identidade dele, ou tranca alguém fora. Hoje só Direção/Titular têm a permissão; se for delegada a Professor/Monitor pela matriz, vira crítico | Gatilho que só permite mudar `user_id` para nulo (nunca o do titular) ou só por RPC auditada; travar `members.manage` | Não para a interface atual; trava delegar `members.manage` |
| SEG-03 | Integrantes/banco | `import_backup` só confere `meta.organization_id` (`20261020000018:126-142`); `restore_backup` faz upsert em toda tabela com `organization_id` sem filtrar as linhas (`20261020000019:31-71`); `backups.manage` não travada; `get_backup_data` devolve tudo sem exigir `members.sensitive.read` | Quem tem `backups.manage` carrega um JSON forjado e reescreve papéis e `user_id` (combina com SEG-01/02) ou qualquer linha; com mais de uma organização, escreve na de outro bloco | Filtrar `organization_id` de cada linha no restore; excluir/validar tabelas de controle de acesso; travar `backups.manage` | Não (restore legítimo igual) |
| COB-01 | Integrantes/cobrança | `my_participation` (`20261114000029:30-37`) lê tabelas antigas; `generate_monthly_charges` (`20261114000001` + `20261115000017:54-70`) usa as por ciclo | O integrante vê em "Minha participação" categoria, valor, bolsa e isenção diferentes do que é cobrado (ciclos futuros/passados, isenção do ciclo diferente do padrão) | Reescrever sobre as tabelas por ciclo (etapa 3, junto com COB-02 a COB-04) | Sim: corrige o que o integrante vê |
| LOJA-01 | Loja | `OrderLookupPage.tsx:300,309-315` × `shop-order-public/index.ts:81-88` | A tela consulta a cada 20 s com a ação `lookup` (limite 20/h por código); em ~7 min vem 429 e `onError` apaga a tela (chave Pix e link) justo enquanto o cliente paga. A ação `status`, feita para isso, não é usada | Polling com `status`; não limpar dados no erro | Não (corrige bug) |
| LOJA-02 | Loja | ação pública `report_payment` (`shop-order-public/index.ts:90-96`, `shop_report_payment`) | Quem tem código + telefone move o pedido para "em conferência", que **não expira** e sai da conta de "3 pedidos abertos": dá para travar estoque de pronta entrega indefinidamente. O front nem usa mais a ação | Desligar a ação (e `shop_report_payment_owned`) ou fazer "em conferência" expirar e contar no limite | Depende da decisão D6 |
| LOJA-03 | Loja | `CheckoutPage.tsx:175` | Nome completo de uma pessoa ("MARCELO STEIMBACK…") e "Cordão da Tia Juca" fixos no texto de pagamento: se o favorecido mudar, a tela mente ao cliente na hora de pagar; outro bloco exibiria um terceiro | Usar `store.pix.beneficiary` e o nome da organização | Só o texto |
| LGPD-01 | Loja | `privacy.ts:39`, `shop_settings.privacy_retention_years`; nenhum job | O aviso promete apagar/anonimizar após N anos e nada faz isso (descumprimento do próprio aviso) | Job que anonimiza pedidos encerrados mais velhos que o prazo, ou mudar o texto (decisão D5) | Sim |

### 8.2 Médio

| ID | Parte | Onde | Risco | Correção | Muda? |
|---|---|---|---|---|---|
| SEG-04 | Site/deploy | sem `public/_headers`; Worker não define cabeçalhos | Site e login podem ser embutidos em iframe (clickjacking); sem `nosniff`, `Referrer-Policy`, CSP | `_headers` com `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`; CSP depois, com hash do script inline do `index.html` | Não (CSP testar em preview) |
| SEG-05 | Auth | painel do Supabase | Proteção contra senha vazada desligada; provedor e-mail/senha ligado sem uso no front (3 contas antigas); o vínculo automático por e-mail (`link_my_member_by_email`) depende de "Confirm email" continuar ligado (hoje está: as 3 contas receberam confirmação) | Desligar cadastro por e-mail ou ligar proteção contra senha vazada; opcional: exigir identidade Google em `link_my_member_by_email` | Sim para quem entra por senha (D7) |
| SEG-12 | Dependências | `package.json` | `jspdf` ≤ 4.2.0 com falhas críticas (injeção em PDF, DoS) e `jspdf-autotable` | Atualizar para jspdf 4.x e testar os PDFs (entregas da loja, relatórios) | Não |
| COB-02 | Cobrança | `MemberBilling.tsx:229-236` | Ficha mostra o preço por data (`fee_category_prices`), a cobrança usa o do ciclo; duas tabelas de preço em espelho (`_sync_price_range`) | Fonte única por ciclo | Sim (exibição) |
| COB-03 | Cobrança | `ScholarshipsPage.tsx:53`, `scholarship_indicators` | Tela e indicadores de bolsa leem `scholarships`; a cobrança usa `cycle_scholarships` | Idem | Sim (exibição) |
| COB-04 | Cobrança | gatilho `trg_sync_member_current_cycle` (`20261108000008:15-43`), `MemberBilling.tsx:248-271,357,173` | Edição direta na tabela por ciclo do ciclo atual é desfeita na próxima mudança de instrumento/função | Terminar a migração: uma só fonte, remover gatilho e tabelas antigas | Não (corrige perda silenciosa) |
| COB-05 | Cobrança | `MemberBilling.tsx:327-335` × `generate_monthly_charges` | Remunerado não vê a contribuição, mas pode ser cobrado se tiver categoria principal | Decidir a regra (D3) e alinhar banco e front | Sim |
| COB-07 | Cobrança | `adjust_charge` (`0008:253-255`) × webhook (`verify.ts:49`) | Depois de um ajuste, quem paga pelo link antigo não tem baixa (valor diferente) e ninguém é avisado | Zerar `pay_code`/`pay_link_url` no ajuste ou registrar divergência e alertar | Sim |
| INT-01 | Integrantes | `can_decide_reactivation` (autoriza Professor) × `set_member_cycle_status` (exige `member_cycles.manage`) | Professor vê o botão de reativar e recebe erro | Decidir (D1) | Sim |
| INT-02 | Integrantes | `routes.tsx` (só 3 rotas com `DirectionOnly`); `AccessPage`, `SiteSettings`, `LedgerPage`, `FormsPage`, `ReportsPage` sem checagem | URL digitada abre tela vazia/com erro (dados não vazam: RLS) | `RequirePermission` por rota a partir de `NAV_ITEMS` | Sim (redireciona) |
| INT-03 | Compartilhado | sem `errorElement`/ErrorBoundary | Erro de renderização derruba a tela inteira (já houve "tela em branco após login") | `errorElement` na raiz com "Recarregar" | Não |
| INT-07 | Integrantes | `permissions.tsx:34,54-66`, `AppShell.tsx:163` | Dois modelos (permissão × nome de papel) e escopo padrão divergente: papel customizado com `forms.manage` não vê Configurações; integrante vê "Integrantes" no menu e a página só lista ele | Um modelo só (por permissão), escopo coerente | Sim (menu) |
| LGPD-02 | Integrantes | `backups` (manuais e importados sem prazo) | Cópia integral de dados pessoais e sensíveis guardada para sempre | Política de retenção (D) | Sim |
| LGPD-03 | Integrantes | `fn_audit` (`0002:104-141`, `0009:309-313`) | `audit_logs` guarda telefone, e-mail, chave Pix (CPF) completos, sem expurgo | Mascarar campos e definir retenção | Sim (log menos detalhado) |
| LGPD-04 | Integrantes | `birthday_list` (`20261114000046:15-30`) | Qualquer integrante, inclusive inativo, recebe nome completo e dia/mês de nascimento de todos (inclui inativos e lista de espera), ignorando a configuração de diretório | Só ativos e nome de exibição, ou respeitar `member_directory_visibility` (D4) | Sim |
| LGPD-05 | Integrantes | `log_sensitive_access` só chamado em `MyData.tsx:220` | Leituras de dados sensíveis por terceiros (outras telas ou REST direto) não deixam rastro | RPC que lê e registra; tirar SELECT direto de terceiros | Não visível |
| LOJA-04 | Loja | policies `shop_prod_public`, `shop_var_public`, `shop_img_public` (só `is_active`) | Produto oculto (rascunho, preço especial, meta) legível por qualquer visitante via REST | `is_active and not is_hidden` ou revogar SELECT anon e usar só a RPC | Não |
| LOJA-05 | Loja e cobrança | `shop-infinitepay-webhook/index.ts:68-71` e o equivalente de mensalidades | Se o aviso chega antes de a InfinitePay refletir o pagamento, a função responde 200 e a InfinitePay não tenta de novo: pagamento real fica sem baixa | Responder 400 quando `paid !== true` e/ou reconciliação periódica | Sim (mais baixas automáticas) |
| LOJA-06 | Loja | `shop_coupon_check` (bucket global `coupon|slug`, 120/10 min); cupons sem validade/limite | Qualquer um esgota o limite e trava cupons de todos; códigos curtos adivinháveis | Limite por IP (via edge); validade e limite de usos | Leve |
| LOJA-07 | Loja | `shop-checkout/index.ts:84,142`, `shop-order-public/index.ts:78` | Limites por IP usam o primeiro `x-forwarded-for` (possivelmente forjável, ver SUS-02) | Usar `cf-connecting-ip`/IP confiável | Não |
| LOJA-08 | Loja | fluxo de pedido + `templates.ts:169` | Pedido com e-mail de terceiro dispara "Olá, {nome digitado}" com a marca do bloco (spam/phishing de baixo volume) | Limite por destinatário/dia ou confirmação de e-mail | Sim |
| LOJA-13 | Loja | `pix.ts:99-101`, `CheckoutPage.tsx:129` | Taxa do cartão (4,20% e parcelas) fixa no front; se a InfinitePay mudar, o aviso mente | Configuração no painel (D10) | Sim |
| LOJA-14 | Loja | `OrderSheet.tsx:67`, e-mail `payment_review`, `OrderLookupPage.tsx:176` | Textos e estados do fluxo "avisei que paguei" removido ainda presentes | Limpar (ou reativar com expiração, D6) | Sim |
| SITE-01 | Site | `routes.tsx` sem `React.lazy` | Visitante baixa 1,6 MB com todo o admin | `lazy()` por grupo de rotas | Não |
| SITE-02 | Site | `get_public_site` (`to_jsonb(s)` da linha inteira, `20261113000010`) | Qualquer coluna futura de `site_settings` vira pública automaticamente | Listar colunas explicitamente | Não |
| SITE-07 | Site | `LandingPage.tsx:57` | "Em construção" só bloqueia o mouse; Tab+Enter abre | Renderizar `span aria-disabled` | Só teclado |
| SITE-09 | Site/reuso | `index.html`, `manifest.webmanifest`, `og:image` em `workers.dev`, `ColorPick.tsx:11`, `forms/SettingsTab.tsx:21`, slug em `.env.production` + `wrangler.jsonc` | Trocar de bloco exige editar código; prévia quebra se o domínio mudar | Gerar no Worker/variável de build; slug numa só origem | Não |
| DRIFT-01 | Banco × repo | migrations só no banco: `attendance_base_skip_archived`, `attendance_clear`, `backup_order_nullable_fk`, `backup_restore_identity`, `form_vars_preview`, `member_emails_self`, `template_sort_new_last` | O repo não recria o banco: `form_vars` é usada pelo front e remendada por 3 migrations, mas não é criada em nenhuma | Trazer para o repo as definições que só existem no banco (gerar a partir do banco, só leitura) | Não |
| DRIFT-02 | Banco × repo | versões dos arquivos ≠ versões registradas (ex.: arquivo `20261019000022_shop_base` × banco `20261019155022`); 4 prefixos repetidos (`20261020000005`, `20261113000001`, `20261113000002`, `20261115000008`); ~30 arquivos sem registro no banco (fase de outubro pelo editor e outros como `function_kinds`, `regencia_artistica`, `titles_to_audiences`, `audience_categories`, `site_menu_order`, `site_menu_visibility_shake`, `fix_aluno_extras`, `backups_fixes`, `attendance_sections_clear`) | `supabase db push`/`db reset` não confiáveis; impossível saber pelo repo o que está aplicado | Baseline gerada do banco + alinhar histórico (decidir na etapa 6) | Não |
| DRIFT-03 | Banco × repo | 70 migrations com `pg_get_functiondef` + `replace()` | A definição vigente só existe no banco; reaplicar do zero é frágil | Migration consolidada com as definições finais | Não |
| QUAL-03 | Edge Functions | `supabase/functions/_shared` vazia; `infinitepay.ts` em 3 pastas (já divergentes), `verify.ts` em 2, `flushMail` em 4, `cors/json` em 7, autenticação Google duplicada em `drive-sync`/`drive-search` | Correção de segurança aplicada numa cópia não chega às outras (o `verify.ts` é a checagem de pagamento) | Centralizar em `_shared` | Não |
| QUAL-05 | Qualidade | `AttendancePages.tsx` 671 linhas, `FieldsTab.tsx` 618, `PublicFormPage.tsx` 554, `TeamPage.tsx` 519, `MembersPage.tsx` 477 (componente de 367 linhas); linhas muito longas | Telas difíceis de alterar sem erro | Extrair subcomponentes/hooks | Não |
| QUAL-09 | Reuso | ver inventário na seção 8.5 | Reaproveitar a loja/site em outro bloco exige mexer em código | Tornar configurável | Não |

### 8.3 Baixo

| ID | Parte | Onde | Risco / correção |
|---|---|---|---|
| SEG-06 | Banco | `sync_staff_compensation`, `staff_function_id` executáveis por `anon`; funções de gatilho com EXECUTE para `anon/authenticated` | Anônimo dispara recálculo (idempotente). `revoke` de `public, anon, authenticated` |
| SEG-07 | Banco | `v_member_directory` (view definer, advisor ERROR) | Intencional (só nome de exibição, filtrado por `is_org_member`). Trocar por RPC para calar o alerta, ou documentar |
| SEG-08 | Banco | storage `org_files_select` só exige `is_org_member` | Inativo baixa arquivos do repertório que a tela esconde. Exigir `repertoire.read` |
| SEG-09 | Banco | `instrument_occupied`/`section_occupied` sem checar organização | Contagem de ocupação para qualquer conta. Checar `is_org_member` |
| SEG-10 | Banco | `trg_sync_bloco_contacts` ignora `revoked_at` (`20261114000045:35`) | Ex-titular sobrescreve contatos públicos. Acrescentar `revoked_at is null` |
| SEG-11 | Banco | `pg_net` no schema `public`; `set_updated_at`, `enforce_member_adult` sem `search_path` | Higiene; mover extensão e fixar `search_path` |
| SEG-13 | Integrantes | `SuppliersPage.tsx:162`, `SongSheet.tsx:253-254`, `DriveFoldersPage.tsx:275` | `href` de campo livre sem checar esquema (`javascript:` gravado por alguém da equipe). Validar `^https?://` |
| SEG-14 | Site | bucket `site-public` aceita SVG | Só usado em `<img>` (sem XSS no app); risco no domínio do Storage (SUS-03) |
| SEG-15 | Formulários | limite só por formulário (30/min) | Robô lota `max_responses` com pendências falsas. Limite por IP na borda |
| INT-04 | Integrantes | `organization.tsx:53` | `link_my_member_by_email` (escreve) roda a cada refetch de memberships. Uma vez por sessão |
| INT-05 | Integrantes | `events.manage` group (Professor) e `capacity.read` group (Monitor) | Escopos que o banco ignora; alinhar matriz ou policies |
| INT-06 | Integrantes | `purge_trashed` (`20261119000014:8,14`) | Permissão da lixeira diferente da policy (checklists, níveis) |
| INT-08 | Cobrança | `MemberBilling.tsx:18-25,294,388` | Usa `system_key` onde a regra é `base_key`: categoria isenta só com `base_key` some da escolha |
| INT-09 | Integrantes | `ViewAsBar.tsx:21-31`, `releases.ts` | Papel Colaborador sem representação em "Ver como" e na liberação de páginas |
| INT-10 | Integrantes | `routes.tsx:149`, `create_member_invite` | Rota de convite sem origem (a interface não gera convites) |
| COB-06 | Financeiro | `compute_distribution`, `distribution_rules/destinations` | Calculador antigo sem uso; distribuição real no navegador (não auditável no servidor) |
| COB-08 | Financeiro | `dashboard_direction` (`classifications`), `prefill.ts:35` | Painel conta classificações antigas; prefill lê tabela antiga |
| LOJA-09 | Loja | `shop-mailer/index.ts:42-46` | Sem checagem própria (com `verify_jwt` ligado, a chave pública basta para disparar o envio da fila); uma conta SMTP para todas as organizações |
| LOJA-10 | Loja | `shop_settings` | Quem tem `shop.manage` troca Pix/InfiniteTag sem alerta (risco interno) |
| LOJA-11 | Loja | `shop_create_order` (`20261119000001:151-154`), `catalog.ts:24` | Preço especial maior que o de integrante vira o preço (D2) |
| LOJA-12 | Loja | `20261019000030:22-24` | Pedido duplicado manda "recebido" + "cancelado" ao cliente |
| LOJA-15 | Loja | `shop_rate_limit` | Corrida no contador e `delete` em toda chamada |
| LOJA-16 | Loja | `shop-checkout/index.ts:85` | `change_method` sem limite por código |
| LOJA-17 | Loja | `shop_admin_reactivate_order` | Reativar volta todos os grupos para `pending` |
| LOJA-18 | Loja | `ordersService.ts:44` | Lista de pedidos limitada a 200 sem aviso |
| LOJA-19 | Loja | `supabase/tests/rls_shop_smoke.sql` | Não cobre oculto, estoque independente, cupom, kits |
| LOJA-20 | Loja | `shop_orders_of_user` e afins | Casar pedido por e-mail depende de e-mail confirmado (hoje ok) |
| LGPD-06 | Integrantes | `consent_update` (`0003:113-114`) | A pessoa reescreve finalidade/versão/data do próprio aceite. Permitir só revogar |
| LGPD-07 | Repo | `CheckoutPage.tsx:175`, seeds, testes (`textVars.test.ts:5`, `settings.test.ts:6`, `pix.test.ts:64`), migrations com nomes/telefone (`20261114000044:33`), `docs/ROTEIRO_DE_TESTE.md` | Dados pessoais reais versionados. Trocar por fictícios nos testes e docs |
| LGPD-08 | Formulários | `purge_old_submissions` | Anonimização de inscrições só quando alguém aciona. Agendar |
| LGPD-09 | Loja/site | `privacy.ts:33`, `trg_sync_bloco_contacts` | Aviso não diz que nome/e-mail/telefone vão para a InfinitePay; telefone e e-mail pessoais do titular viram contato público |
| SITE-03 | Site | `set_org_logo`, `site_albums.cover_url`, cores dos raios | Sem `check` no banco |
| SITE-04 | Site | `LandingPage.tsx:98` | `kind` de link desconhecido derruba a página pública |
| SITE-05 | Site | `album-preview/index.ts:74` | Devolve `e.message` ao cliente |
| SITE-06 | Site | `index.html:5` | Zoom desativado (acessibilidade) |
| SITE-08 | Site | `AlbumsPage.tsx:39-41` | Álbum sem data some do público sem aviso no editor |
| SITE-10 | Site | `site_settings.header_color/page_color`, `shop_settings.theme_*` | Colunas legadas ainda lidas/gravadas |
| DRIFT-04 | Repo | `supabase/apply_all.sql`, `apply_phase2.sql` | Obsoletos (só fases 1 e 2); rodar em banco novo dá esquema incompleto (D8) |
| DRIFT-05 | Repo | sem `supabase/config.toml` | `verify_jwt` das funções não versionado (hoje: webhooks `false`, demais `true`) |
| QUAL-01 | Código morto | `shop/config/{shop.config,schema,config.test}.ts`, componente `TrashDrawer`, `StaffSection`/`CompMark`, `confirmIf`, `listCharges`, `listMembers`; RPCs sem uso (`create_member_invite`, `compute_distribution`, `replicate_distribution_rules`, `absence_streaks`, `attendance_report`, `consecutive_absences`, `remove_member_cycle`) | Remover |
| QUAL-02 | Dependências | `react-hook-form`, `@hookform/resolvers`, `zod` (só no código morto); `@types/qrcode` em `dependencies`; `npm:@supabase/supabase-js@2` sem versão fixa em edge | Limpar e fixar |
| QUAL-04 | Duplicação front | link do WhatsApp montado em ~9 lugares com regras diferentes; `money()` em 5 arquivos; `textOn` em 2; extração de dígitos em 11 | Funções únicas em `src/core` |
| QUAL-06 | Lint | 41 `eslint-disable` sem ESLint | Adicionar ESLint (dev) ou remover os comentários (D9) |
| QUAL-07 | Repo | `tsconfig.tsbuildinfo` versionado | `git rm --cached` + `.gitignore` |
| QUAL-08 | Docs | ver seção 7, item 11 | Atualizar |
| QUAL-10 | Nomes | "release" (botão do site × liberação de páginas); "funções" = Categorias ≠ categorias de contribuição ≠ classificações; rota `distribuicao` → `TeamPage` | Renomear no front |
| QUAL-11 | Build | `__dirname` no `vite.config.ts` | Trocar por `import.meta.dirname` |

### 8.4 Suspeitas (não confirmadas)

| ID | O quê | Por que é suspeita | O que fazer |
|---|---|---|---|
| SUS-01 | **Webhooks InfinitePay (loja e mensalidades): uma transação paga pode confirmar outro pedido de mesmo valor.** O `payment_check` recebe `order_nsu`, `transaction_nsu` e `invoice_slug` vindos do corpo; não há índice único em `transaction_nsu` nem conferência do slug do link | Só é explorável se a API `payment_check` responder "pago" sem amarrar `order_nsu` à transação (não documentado). **Se for, é pagamento forjável (crítico)** | Correção barata na etapa 1, sem esperar confirmar: guardar o slug do link, índice único em `transaction_nsu`, recusar repetição |
| SUS-02 | IP dos limites vem de `x-forwarded-for` | Depende de o Supabase sobrescrever o cabeçalho | Usar IP confiável (LOJA-07) |
| SUS-03 | SVG do bucket `site-public` executa script no domínio do Storage | Depende dos cabeçalhos do Supabase Storage | Rasterizar ou limitar SVG |
| SUS-04 | Prefixos repetidos quebram `supabase db push` | Comportamento exato da CLI | Resolver em DRIFT-02 |
| SUS-05 | Arquivos do repo sem registro no banco foram mesmo aplicados (com outro nome)? | Precisa comparar o schema | Conferir em DRIFT-02 |
| SUS-06 | Configuração "Confirm email" do Auth | Inferida dos dados (as 3 contas de senha receberam confirmação; nenhuma confirmada na hora); não há leitura da configuração por SQL | Conferir no painel do Supabase (SEG-05) |

### 8.5 Inventário de valores fixos (reuso por outro bloco trocando logo e cores)

Já configurável: nome da loja, cores (`organizations.theme`), logo, Pix, InfiniteTag, contatos, remetente, pontos, prazos, textos de abertura. Fixo no código hoje:
- `CheckoutPage.tsx:175` (nome do recebedor e do bloco); `index.html` (título, `og:*`, `og:image` em `workers.dev`), `public/manifest.webmanifest`, `public/brand/tiajuca.*`; `.env.production` e `wrangler.jsonc` (slug, nome do worker);
- cores `#E93D2B` em `ColorPick.tsx:11`, `forms/SettingsTab.tsx:21`, `index.html:9`, manifest e e-mails (`shop-mailer/templates.ts:88,149,251`, que não usam o tema da organização);
- taxa do cartão (`pix.ts:99-101`), cidade "Rio de Janeiro" no BR Code (`pix.ts:124`, `shop-mailer/pix.ts:23`), DDI 55/DDD 21 em máscaras e links, fuso `America/Sao_Paulo` em SQL, vocabulário "ensaio" (`20261113000002:100`, `CheckoutPage.tsx:199`, `OrderLookupPage.tsx:211`), chaves de papel no SQL do preço de integrante, placeholder `@cordaodatiajuca` (`PublicFormPage.tsx:49`, `links.tsx:21`), foto padrão `/brand/tiajuca.png` (`SiteSettings.tsx:155`);
- uma conta SMTP global para todas as organizações (`shop-mailer/providers.ts`).

---

## 9. Decisões pendentes (perguntas ao usuário)

| # | Pergunta | Afeta |
|---|---|---|
| D1 | Professor pode reativar integrante inativo do próprio grupo? (sim → consertar; não → tirar o botão e a regra) | INT-01 |
| D2 | Preço especial deve ser o menor entre especial e preço de integrante? | LOJA-11 |
| D3 | Quem tem atividade remunerada deve ficar fora da geração de cobranças? | COB-05 |
| D4 | Lista de aniversários: todos com nome completo, ou só ativos com nome de exibição? | LGPD-04 |
| D5 | Retenção da loja: implementar a anonimização após N anos (pedidos antigos deixam de ser consultáveis) ou mudar o texto do aviso? Qual prazo para backups manuais e log de auditoria? | LGPD-01, LGPD-02, LGPD-03 |
| D6 | "Avisei que paguei": desligar de vez (recomendado) ou reativar o botão com expiração do "em conferência"? | LOJA-02, LOJA-14 |
| D7 | Desligar o login por e-mail/senha no Supabase (há 3 contas antigas com senha; conferir se têm Google)? | SEG-05 |
| D8 | Apagar `supabase/apply_all.sql` e `apply_phase2.sql`? | DRIFT-04 |
| D9 | Adicionar ESLint (dependência de desenvolvimento) ou remover os 41 comentários `eslint-disable`? | QUAL-06 |
| D10 | Taxa do cartão configurável no painel da loja? | LOJA-13 |
| D11 | Listas públicas (vídeos 3 em 3, álbuns 6 em 6, vitrine da loja) são exceção à regra "5 em 5"? | SITE |
| D12 | Cupom: incluir validade e limite de usos? | LOJA-06 |

---

## 10. Plano de execução (Fase 2, uma etapa por conversa)

Ordem: segurança crítica → área dos integrantes (permissões; depois cobranças) → loja → site → qualidade. Cada etapa: branch a partir da `main` atualizada, commits temáticos, testes da seção 1, merge na `main`, Andamento atualizado.

### Etapa 1 — Segurança crítica (banco, Auth, webhooks)
**Modelo:** Opus 5.5 ou Fable 5.2, esforço **alto** (se houver "max", usar só para revisar as policies e o teste por papel). Mexe em gatilhos, policies e pagamento em produção.
1. DRIFT-01: trazer para `supabase/migrations` as definições que só existem no banco (gerar por leitura, sem aplicar nada), para que as próximas migrations partam do estado real.
2. SEG-01: gatilho de `member_access_roles` recusando troca de papel/pessoa/organização e "desrevogação" por UPDATE.
3. SEG-02: gatilho em `members.user_id`; travar `members.manage` (impacto: a Direção não poderá mais delegar essa permissão; perguntar).
4. SEG-03: restore filtrando `organization_id` e validando tabelas de acesso; travar `backups.manage` (mesmo impacto; perguntar).
5. SUS-01 e LOJA-05: endurecer os dois webhooks (slug do link guardado, `transaction_nsu` único, 400 quando ainda não pago), mantendo a confirmação pela InfinitePay.
6. LOJA-04 (policies de produto oculto), SEG-06 (revokes), SEG-09, SEG-10, LGPD-06.
7. SEG-04: `public/_headers` com `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (CSP fica para a etapa 5).
8. SEG-05: orientar a configuração do Auth no painel (o usuário faz) conforme D7.
**Testes:** contas de teste marcadas por papel (integrante, professor, diretor, titular) tentando, via REST com a chave pública, cada bypass acima (devem falhar) e as ações legítimas pela interface (devem funcionar); webhook simulado com payload repetido; build e testes.

### Etapa 2 — Área dos integrantes: permissões, telas e LGPD
**Modelo:** Opus 5.5, esforço **alto**. Autorização e dados pessoais.
INT-01 (D1), INT-02 (guarda por rota), INT-03 (errorElement), INT-07 (um modelo de permissão), INT-04, INT-05, INT-06, INT-08, INT-09, INT-10, LGPD-03 (máscara no audit), LGPD-04 (D4), LGPD-05 (RPC de dados sensíveis), LGPD-02 (D5), LGPD-08, SEG-08, SEG-13, SEG-15.
**Testes:** cada papel navegando por URL direta (bloqueado/redirecionado) e chamando o banco direto; aniversários; leitura de dados sensíveis registrada.

### Etapa 3 — Área dos integrantes: cobranças com fonte única por ciclo
**Modelo:** Opus 5.5, esforço **alto**. Migração de dados financeiros com backup.
COB-01 a COB-05, COB-07, COB-08 (e COB-06 se aprovado): `my_participation`, ficha, bolsas e indicadores passam a ler as tabelas por ciclo; remover o gatilho de sincronização e as tabelas antigas depois de conferir que os números batem (relatório antes × depois); D3.
**Testes:** comparar, para todos os integrantes do ciclo atual, o que "Minha participação" mostra com o que a geração cobraria (simulação sem gravar); backup antes; geração em ciclo de teste.

### Etapa 4 — Loja
**Modelo:** Opus 5.5 ou Sonnet 5.5, esforço **médio a alto**. Fluxo de pagamento.
LOJA-01, LOJA-02/LOJA-14 (D6), LOJA-03, LOJA-06 (D12), LOJA-07, LOJA-08, LOJA-09, LOJA-10, LOJA-11 (D2), LOJA-12, LOJA-13 (D10), LOJA-15 a LOJA-21, LGPD-01 (D5), LGPD-09, `docs/LOJA.md`.
**Testes:** catálogo → pedido → Pix e InfinitePay (modo teste/simulado) → admin confirma → consulta por telefone (incluindo deixar a tela aberta mais de 10 minutos); cupom; pedido duplicado.

### Etapa 5 — Site e partes compartilhadas
**Modelo:** Sonnet 5.5, esforço **médio**. Mudanças de front e de configuração de baixo risco.
SEG-04 (CSP), SITE-01 (lazy), SITE-02, SITE-03, SITE-04, SITE-05, SITE-06, SITE-07, SITE-08, SITE-09/QUAL-09 (valores fixos), SITE-10, SEG-14, D11.
**Testes:** todas as páginas públicas carregam (desktop e celular), links funcionam, prévia de link, CSP sem erros no console, tamanho do bundle público.

### Etapa 6 — Qualidade, faxina e `CLAUDE.md`
**Modelo:** Sonnet 5.5, esforço **médio**. Refatoração sem mudar comportamento.
QUAL-01 a QUAL-11, QUAL-03 (`_shared` nas edges), QUAL-05 (dividir os maiores arquivos), DRIFT-02 a DRIFT-05 (D8), SEG-11, SEG-12 (jspdf 4.x), SEG-07, docs; por último, criar o `CLAUDE.md` na raiz (stack, três partes, regras vigentes, matriz de permissões, convenções, cuidados de segurança).
**Testes:** typecheck, build, testes, `npm audit`, PDFs gerados, páginas principais das três partes.
