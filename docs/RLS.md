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
