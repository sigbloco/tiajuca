# Políticas RLS — Fase 1

Migration: `supabase/migrations/20261015000003_rls_policies.sql`. Helpers em `…000002_access_helpers_rpc.sql`.

**Princípios:** RLS em todas as tabelas · `anon` sem acesso (só RPC `get_public_org`) · sem DELETE físico · escrita sempre por permissão do catálogo · helpers `security definer` com `search_path=''` · `audit_logs` imutável (só triggers/RPC escrevem).

**Helpers:** `is_org_member(org)`, `is_self(member)`, `permission_scope_of(org, perm)` (maior escopo entre papéis acumulados), `has_permission(org, perm)` (escopo `org`), `can_read_member(org, member)`, `is_in_my_group()` (**stub `false` até a Fase 2**, quando passa a consultar `staff_section_assignments`).

| Tabela | SELECT | INSERT / UPDATE |
|---|---|---|
| organizations | membro da org | `org.manage` (update) |
| members | `members.read` (org) · próprio · grupo (Fase 2) | `members.manage`; autoedição só via RPC `update_my_profile` |
| member_sensitive_data | próprio · `members.sensitive.read` | próprio · `members.sensitive.manage` |
| permissions | autenticados | — |
| access_roles / role_permissions | membro da org | `roles.manage` (papéis `is_system` não editáveis) |
| member_access_roles | próprio · `roles.manage` | `roles.manage` |
| classifications | membro da org | `settings.manage` |
| member_classifications | quem pode ler o membro | `members.manage` |
| member_invites | `members.manage` | `members.manage` (RPC `create_member_invite`) |
| consent_records | próprio · `members.manage` | próprio · `members.manage` |
| org_settings | membro da org | `settings.manage` |
| audit_logs | `audit.read` | só triggers/RPC |

**Limitações conhecidas (a tratar):**
- Leitura de dado sensível pela Direção é permitida por RLS; o log de leitura depende de a UI chamar `log_sensitive_access()` (não é forçado pelo banco).
- Não há proteção contra a Direção remover a si mesma do papel `direcao` (regra "último diretor" pendente).
- Testes pgTAP (4 papéis × 2 organizações, casos cross-org) **ainda não escritos/executados**.
- Migrations **não foram aplicadas** a nenhum projeto Supabase nem validadas em Postgres real.

## Fase 2 — estrutura, ciclos, vagas (migration `…000004`)

| Tabela | SELECT | Escrita |
|---|---|---|
| areas, sections, instruments, artistic_functions, skill_levels | membro da org | `structure.manage` |
| cycle_types, cycles | membro da org | `cycles.manage` |
| member_cycle_statuses | membro da org | `settings.manage` |
| member_artistic_links | quem pode ler o membro (org/grupo/próprio) | `members.manage` |
| member_cycles, member_cycle_status_history | idem | **somente RPC** `set_member_cycle_status` (permissão `member_cycles.manage` org ou grupo; vaga lotada exige exceção da Direção) |
| section_cycle_capacity | quem tem `capacity.read` | `capacity.manage` |
| staff_section_assignments | próprio · `staff_assignments.manage` | `staff_assignments.manage` |

`is_in_my_group(org, member)` agora é real: o integrante tem vínculo artístico vigente em naipe atribuído ao usuário (professor/monitor) em `staff_section_assignments`.
Ocupação de naipe = integrantes com status que `counts_as_active` no ciclo e vínculo vigente com o naipe (`section_occupied`).
Testes: `supabase/tests/rls_phase2_smoke.sql`.

## Correção de segurança (migration `…000005`)
`has_permission()` devolvia `NULL` (não `false`) quando o usuário não tinha a permissão; em `if not has_permission(...)` o NULL deixava a ação passar (afetava `create_member_invite`, `log_sensitive_access`, `set_member_cycle_status`). Encontrado pelo teste da Fase 2, corrigido com `coalesce`, e o teste agora cobre esses casos. Políticas RLS não eram afetadas (usam a forma positiva).
**Regra:** em funções de permissão, nunca depender de booleano que possa ser NULL; sempre `coalesce(..., false)`.

## Reestruturação de naipes (migration `…000006`)
Naipe (Percussão/Sopro/Performance) → Subnaipe (opcional, interno) → Instrumento. Vagas (`instrument_cycle_capacity`) e acompanhamento (`staff_assignments`, aceita naipe, subnaipe ou instrumento) valem por instrumento; `is_in_my_group` expande. `subsections` só é legível pela equipe (`is_staff`): aluno/integrante comum nunca vê subnaipe. Subnaipe do instrumento deve pertencer ao mesmo naipe (FK composta).

## Fase 4 — contribuições, bolsas, mensalidades (migration `…000008`)
| Tabela | SELECT | Escrita |
|---|---|---|
| fee_categories | membro da org | `billing.manage` |
| fee_category_prices | membro da org | **só RPC** `set_fee_price` (versionado por vigência) |
| member_fee_assignments | próprio · `billing.read` (Direção) | **só RPC** `assign_fee_category` |
| scholarship_types | `scholarships.manage` | `scholarships.manage` |
| scholarships | próprio · `scholarships.manage` | **só RPC** `set_scholarship` (0–100%) |
| holidays | membro da org | `settings.manage` |
| monthly_charges | próprio · `billing.read` (Direção) | **só RPCs** `generate_monthly_charges` (idempotente, UQ membro+competência), `adjust_charge`, `mark_charge_paid`, `change_charge_status` |
| charge_adjustments | `billing.manage` | só RPC `adjust_charge` |
Professor e Monitor **não** veem financeiro de ninguém (nem o próprio de equipe por esta tela). Dados sensíveis (LGPD) nunca entram em consultas financeiras.
Testes: `supabase/tests/rls_phase4_smoke.sql`.

## Fase 5 — financeiro (migration `…000009`)
Tudo financeiro é restrito à Direção (`finance.read/manage`, `staff_payments.manage`): `finance_categories`, `financial_entries`, `distribution_*`, razão `v_finance_ledger`. Escrita por RPC (`post_financial_entry`, `cancel_financial_entry` com motivo, `create_staff_payment`, `mark_staff_payment_paid` com snapshot da chave PIX, `set_pix_key`). `staff_payments` e `member_pix_keys`: o titular lê os próprios; PIX só para quem tem `pix.manage` (professor/monitor). Soma de percentuais por base ≤ 100% garantida por trigger. Testes: `rls_phase5_smoke.sql`.

## Fase 6 — repertório (migration `…000010`)
`repertoires`, `songs`, `song_attachments`: leitura para quem tem `repertoire.read` (todos os papéis; inativos só para quem gerencia), escrita `repertoire.manage` (Direção; configurável por papel). Arquivos no bucket **privado** `org-files`, pasta `{organization_id}/…`: leitura por membro da organização, escrita por `repertoire.manage`; abertura por URL assinada (1 h). CHECK impede `storage_path` fora da pasta da organização e URL que não seja http(s). Limitação: qualquer membro da organização lê qualquer arquivo da pasta (sem filtro por instrumento no Storage). Testes: `rls_phase6_smoke.sql`.

## Fase 7 — checklists, relatórios, painel (migration `…000011`)
- **Checklists**: `checklist_templates` e itens só para `checklists.manage` (Direção). `activity_checklist_items` é **cópia** do modelo no evento; lê quem enxerga o evento (RLS de `activities`); escrita só por RPC: Direção altera tudo; o **responsável** do item altera apenas status e observação (`update_checklist_item`). Editar o modelo não altera eventos existentes; aplicar de novo não duplica.
- **Relatórios**: `attendance_report` (por integrante, instrumento, naipe, ciclo, mês, atividade) e `absence_streaks` respeitam o escopo: Direção = organização; Professor/Monitor = apenas seu grupo; integrante comum recebe 42501. Subnaipe não é dimensão de relatório.
- **Painel da Direção** (`dashboard_direction`): somente `finance.read`; contém contagens e valores agregados, **nunca** dados sensíveis LGPD.
- **Auditoria**: página `/auditoria` lê `audit_logs` (somente `audit.read`); dados sensíveis registram só os nomes dos campos alterados.
Testes: `rls_phase7_smoke.sql`.

## Fase 8 — formulários de inscrição (migration `…000012`)
- **Público (anon)** não acessa tabelas: apenas 3 RPCs (`get_public_form`, `begin_form_upload`, `submit_public_form`). Toda validação é no servidor, contra o **snapshot da versão publicada** (campos obrigatórios, tipos, opções, condições, 18+, consentimento, e-mail duplicado, limite, janela de datas, honeypot, limite de envios/min). O mapeamento para o cadastro **não** é exposto.
- **Arquivos**: bucket privado `form-uploads`; upload anônimo só com token temporário (60 min, uso único, ≤ 10 arquivos, 5 MB, PDF/imagem), na pasta `{org}/{token}/`; leitura/remoção só `forms.manage`.
- **Respostas** (`form_submissions`, `form_submission_files`): somente `forms.manage`. Não há trigger de auditoria nelas (evita copiar dados pessoais para o log); revisão/aprovação/retenção gravam eventos explícitos.
- **Aprovação** (`approve_submission`) cria o integrante a partir do mapeamento da versão respondida; dados sensíveis vão para a tabela restrita; registra consentimento; pode definir status no ciclo (lista de espera/ativo).
- **Retenção** (`purge_old_submissions`): rejeitadas/arquivadas > 12 meses e pendentes > 6 meses são anonimizadas; aprovadas não são tocadas.
Testes: `rls_phase8_smoke.sql`.
