# SIGBloco — Instância Cordão da Tia Juca · Proposta Técnica (v0.1)

> Status: Fases 1–9 **implementadas**. Próximas fases (10–13: mensagens, inscrições v2, lojinha, pedidos/InfinitePay) em [PLANO_FASES_10_13.md](PLANO_FASES_10_13.md).
> Convenções: PKs `uuid` (`gen_random_uuid()`), `created_at/updated_at timestamptz`, `organization_id uuid not null` em toda tabela de domínio, soft delete via `archived_at timestamptz` ou `is_active`. Nomes de tabela em inglês (snake_case); UI em pt-BR.

---

## A. Arquitetura

### A.1 Camadas: núcleo × configuração × dados da instância

| Camada | O que é | Onde vive |
|---|---|---|
| **Núcleo SIGBloco** | Código, schema, funções SQL, RLS, componentes | `src/`, `supabase/migrations/` |
| **Configuração da organização** | Identidade visual, valores, tipos, papéis, estrutura artística | Tabelas configuráveis no banco (editáveis pela Direção) |
| **Dados da instância Tia Juca** | Naipes, instrumentos, valores iniciais, checklist "Apresentação/Cortejo" | `supabase/seed/tiajuca.sql` (único lugar com "Tia Juca" e valores iniciais) |

Regra: **nenhum `if (org === 'tiajuca')`** e nenhum nome/valor da Tia Juca em `src/`. O tema (cores/logo/fontes) é carregado de `organizations.theme` e aplicado como CSS variables.

### A.2 Estrutura do projeto

```
tiajuca/
├─ docs/                      # esta proposta, RLS.md, decisões (ADR)
├─ supabase/
│  ├─ migrations/             # versionadas, ordenadas por fase
│  ├─ seed/
│  │  ├─ core.sql             # permissões, catálogos genéricos
│  │  └─ tiajuca.sql          # organização + dados iniciais da Tia Juca
│  └─ tests/                  # pgTAP: testes de RLS por papel
├─ src/
│  ├─ app/                    # providers, router, layouts (shell desktop/mobile)
│  ├─ core/                   # supabase client, auth, org-context, permissions, format (pt-BR), errors
│  ├─ modules/                # um diretório por módulo (feature-sliced)
│  │  ├─ auth/ organizations/ members/ cycles/ structure/
│  │  ├─ events/ attendance/ billing/ finance/ repertoire/
│  │  ├─ checklists/ dashboard/ settings/ audit/ forms/ (fase 8)
│  │  └─ <modulo>/{pages,components,hooks,services,schemas,types}
│  ├─ components/ui/          # shadcn/ui (Button, Sheet, Dialog, Table, Toast…)
│  ├─ components/shared/      # DataTable (server-side), ResponsiveList, PageHeader, EmptyState, ConfirmDialog
│  ├─ styles/                 # tokens.css (variáveis de tema), tipografia
│  └─ types/database.ts       # gerado via `supabase gen types`
```

### A.3 Módulos e responsabilidades

| Módulo | Responsabilidade |
|---|---|
| `core/permissions` | **Única** fonte de verdade no front: `usePermission('billing.read')`, `<Can permission="…">`. Espelha o catálogo `permissions` do banco; o banco é quem decide de fato (RLS). |
| `core/org-context` | Organização ativa (slug/ID), tema, membro logado, papéis. Toda query recebe `organization_id` do contexto. |
| `services/*` | Funções puras que falam com Supabase (sem React). Hooks (`useMembers`) envolvem com React Query. |
| `schemas/*` | Zod para validação (formulários + parsing). |
| `rpc` (SQL) | Operações atômicas/idempotentes: `generate_monthly_charges`, `apply_charge_adjustment`, `set_member_cycle_status`, `create_activity_from_template`, `approve_submission`. Regras críticas ficam **no banco**. |

### A.4 Decisões de front
- Roteamento por organização: `/:orgSlug/...` (hoje uma só; multi-org já funciona).
- React Query com chaves `[orgId, entidade, filtros]`; paginação/sort/filtro **no Supabase** (`range`, `order`, `ilike`/FTS).
- Tabelas → cards no mobile (`ResponsiveList`).
- Tokens de tema: `--brand-primary` (#E93D2B), `--brand-secondary` (#DEE33B), `--surface`, `--radius: 0.75rem`, semânticos `--success/--warning/--info`. Tailwind mapeia para essas variáveis (nada de hex em componentes).
- Fontes: Baloo 2 (títulos), Plus Jakarta Sans (UI). Escala tipográfica: 5 tamanhos, 3 pesos (400/600/700).
- Datas: armazenar `date`/`timestamptz` (UTC); exibir com `Intl` em `America/Sao_Paulo`; datas “de calendário” (nascimento, evento) são `date`, nunca convertidas por timezone. Timezone vem de `organizations.timezone`.

---

## B. Banco de dados (PostgreSQL / Supabase)

Legenda: **PK** chave primária · **FK** chave estrangeira · **UQ** unique · **IDX** índice · todas com `organization_id` salvo indicação. Padrão composto de integridade: FKs entre tabelas da mesma org usam `(organization_id, id)` UNIQUE + FK composta para impedir vazamento cross-org.

### B.1 Núcleo, identidade e acesso

**`organizations`** — cada bloco. `id`, `name`, `short_name`, `slug` (UQ), `logo_path`, `theme jsonb` (cores/tokens), `timezone` default `America/Sao_Paulo`, `is_active`, `created_at`. *(sem organization_id)*

**`members`** — pessoa integrante (≠ conta de login). `id`, `organization_id`, `user_id uuid null` (FK `auth.users`, **UQ (organization_id, user_id)**), `full_name`, `display_name`, `email`, `phone`, `social_handle`, `birth_date date`, `joined_at date` (data da inscrição), `affective_relation text` (relação com a Grande Tijuca), `played_other_blocks bool`, `other_blocks text`, `archived_at`, `created_at/by`. IDX: `(organization_id, lower(full_name))`, trigram em `full_name`, `(organization_id, user_id)`. UQ parcial `(organization_id, lower(email)) where email is not null and archived_at is null`.

**`member_sensitive_data`** — LGPD. 1:1 com members. `member_id` PK/FK, `organization_id`, `gender`, `is_trans bool`, `race_color`, `is_pcd bool`, `pcd_description`, `updated_at/by`. Tabela **separada** para RLS restrita (Direção + o próprio titular). Nunca incluída em views de listagem.

**`member_invites`** — vínculo conta↔cadastro. `id`, `organization_id`, `member_id`, `email`, `token_hash`, `expires_at`, `accepted_at`, `invited_by`. RPC `claim_member(token)` preenche `members.user_id`.

**`access_roles`** — papéis por organização (configuráveis, mas 4 semeados). `id`, `organization_id`, `key` (`direcao|professor|monitor|integrante`), `name`, `rank int` (hierarquia: 40/30/20/10), `is_system bool`. UQ `(organization_id,key)`.

**`permissions`** — catálogo global (sem org). `key` PK (`members.read`, `members.sensitive.read`, `billing.manage`, `finance.read`…), `description`, `module`.

**`role_permissions`** — `access_role_id`, `permission_key`, `scope` (`own|group|org`). PK `(access_role_id, permission_key)`. Direção pode ajustar (com limites: permissões `is_locked` não removíveis da Direção).

**`member_access_roles`** — papéis acumuláveis. `member_id`, `access_role_id`, `granted_by`, `granted_at`, `revoked_at`. UQ parcial `(member_id, access_role_id) where revoked_at is null`.

**`classifications`** — catálogo configurável (Aluno, Músico, Monitor, Professor, Diretor, Senior). `id`, `organization_id`, `key`, `name`, `sort_order`, `is_active`, `grants_fee_category_id null`. **Não concede permissão.**

**`member_classifications`** — `member_id`, `classification_id`, `since`, `until`. PK composta.

### B.2 Estrutura artística

**`areas`** (Sopro, Percussão, Performance, Outras funções): `id`, `organization_id`, `name`, `sort_order`, `is_active`, `plays_instrument bool`.
**`sections`** (naipes): `id`, `organization_id`, `area_id`, `name`, `sort_order`, `is_active`.
**`instruments`**: `id`, `organization_id`, `area_id`, `section_id null`, `name`, `sort_order`, `is_active`.
**`artistic_functions`** (Produção, Apoio, Pernalta…): `id`, `organization_id`, `area_id null`, `name`, `sort_order`, `is_active`, `fee_category_id null`.
**`skill_levels`**: `id`, `organization_id`, `name`, `sort_order`, `is_active`.
**`member_artistic_links`** — N vínculos por pessoa. `id`, `organization_id`, `member_id`, `area_id`, `section_id null`, `instrument_id null`, `function_id null`, `skill_level_id null`, `is_primary bool`, `started_at`, `ended_at`. CHECK: ao menos um de `section/instrument/function`. IDX `(member_id)`, `(section_id)`, `(instrument_id)`.

> Nomes `areas/sections/instruments/functions` são tabelas — **sem enums**. Desativar = `is_active=false`; FKs históricas permanecem.

### B.3 Ciclos e participação

**`cycle_types`** (Carnaval, Junino): `id`, `organization_id`, `key`, `name`, `name_pattern` (ex.: `{type} {start_year}/{end_year}`), `is_active`.
**`cycles`**: `id`, `organization_id`, `cycle_type_id`, `name`, `starts_on`, `ends_on`, `status` (enum interno `planned|open|closed`), `is_active`, `is_current`. CHECK `ends_on >= starts_on`. UQ `(organization_id, name)`.
**`member_cycles`**: `id`, `organization_id`, `member_id`, `cycle_id`, `status` (`active|inactive` — via `member_cycle_statuses` configurável, ver ambiguidades), `joined_on`, `left_on`, `notes`. **UQ `(member_id, cycle_id)`**. IDX `(cycle_id, status)`.
**`member_cycle_status_history`**: `id`, `member_cycle_id`, `old_status`, `new_status`, `changed_by` (member), `changed_at`, `reason`. Preenchida por **trigger** (não depende do front).
**`section_cycle_capacity`**: `section_id`, `cycle_id`, `capacity int ≥ 0`. UQ `(section_id, cycle_id)`.
**View `v_section_occupancy`**: ocupadas = `member_cycles.status='active'` × `member_artistic_links` por naipe/ciclo; livres = capacity − ocupadas; lotado bool.

### B.4 Contribuições, bolsas, mensalidades

**`fee_categories`** (Aluno, Músico, Pernalta): `id`, `organization_id`, `name`, `is_active`.
**`fee_category_prices`** — valor versionado: `fee_category_id`, `amount numeric(12,2) ≥0`, `valid_from date`, `valid_to null`. Evita reescrever histórico ao mudar valor.
**`member_fee_assignments`**: `member_id`, `fee_category_id`, `cycle_id null`, `valid_from`, `valid_to`. Define qual categoria o integrante paga (regra de precedência em §I).
**`scholarships`**: `id`, `member_id`, `percent numeric(5,2) CHECK 0..100`, `valid_from`, `valid_to`, `reason`, `granted_by`. (Histórico; “bolsa vigente” por data.)
**`monthly_charges`**: `id`, `organization_id`, `member_id`, `competence date` (**sempre dia 1**, CHECK `date_trunc('month',competence)=competence`; exibe “Outubro de 2026”), `fee_category_id`, `base_amount`, `scholarship_percent`, `scholarship_discount`, `final_amount`, `status` (`pending|paid|exempt|cancelled`), `paid_at`, `manual_adjustment bool`, `notes`. **UQ `(organization_id, member_id, competence)`** → idempotência. IDX `(organization_id, competence, status)`.
**`charge_adjustments`**: `charge_id`, `original_amount`, `new_amount`, `reason not null`, `adjusted_by`, `adjusted_at`.
**`charge_payments`**: `id`, `charge_id`, `amount`, `paid_on`, `method`, `received_by`, `reversed_at`. (Permite pagamento parcial/estorno; status do charge derivado/atualizado por trigger.)
**Views**: `v_scholarship_indicators` (nº bolsistas, Σ%, equivalente = Σ%/100, impacto = Σ desconto), `v_monthly_summary` (previsto/recebido/pendente/isento/impacto/inadimplentes por competência).

### B.5 Financeiro e equipe

**`finance_categories`**: `id`, `organization_id`, `kind` (`income|expense`), `name`, `is_active`.
**`financial_entries`**: `id`, `organization_id`, `kind`, `category_id`, `description`, `amount`, `occurred_on`, `cycle_id null`, `source_charge_payment_id null`, `attachment_file_id null`, `status` (`posted|cancelled`), `cancelled_at/by/reason`. Sem DELETE (apenas estorno/cancelamento).
**`distribution_destinations`**: `id`, `organization_id`, `name`, `kind` (`role_group|cash|custom`), `access_role_id null`, `sort_order`, `is_active`.
**`distribution_rules`**: `id`, `destination_id`, `mode` (`percent|fixed`), `percent`, `fixed_amount`, `base` (`gross_income|net_after_expenses|net_after_fixed`), `priority`, `valid_from`, `valid_to`. CHECK coerência modo/valor. Trigger/validação: Σ percentuais por base/vigência ≤ 100.
**`member_pix_keys`**: `id`, `member_id`, `key_type`, `key_value` (acesso restrito), `is_default`. 
**`staff_payments`**: `id`, `organization_id`, `member_id`, `competence date`, `destination_id`, `amount`, `status` (`pending|paid|cancelled`), `due_on`, `paid_on`, `payment_method`, `pix_key_snapshot`, `notes`, `financial_entry_id`. IDX `(member_id, competence)`.

### B.6 Agenda, checklist, presença

**`activity_types`**: `id`, `organization_id`, `name`, `color_token`, `is_active`, `default_checklist_template_id null`.
**`recurrence_rules`**: `id`, `organization_id`, `rrule text` (RFC 5545), `starts_on`, `until`, `timezone`, `is_active`.
**`activities`** (eventos): `id`, `organization_id`, `activity_type_id`, `cycle_id`, `title`, `starts_at`, `ends_at`, `location`, `description`, `status` (`scheduled|done|cancelled`), `visibility` (`all|members|staff|restricted`), `recurrence_rule_id null`, `series_id null`, `archived_at`. CHECK `ends_at > starts_at`. IDX `(organization_id, starts_at)`, `(cycle_id)`.
> Ensaio semanal: `recurrence_rules` com `FREQ=WEEKLY;BYDAY=MO`; ocorrências **materializadas** por job/RPC (necessário para presença por evento).
**`activity_audiences`**: `activity_id`, `audience_kind` (`all|section|area|instrument|classification|role|member`), `ref_id`. Define público/elegíveis da chamada.
**`checklist_templates`**: `id`, `organization_id`, `name`, `is_active`. **`checklist_template_items`**: `template_id`, `title`, `sort_order`.
**`activity_checklist_items`**: `id`, `activity_id`, `source_template_item_id null`, `title` (cópia), `status` (`todo|doing|done`), `assignee_member_id null`, `notes`, `sort_order`.
**`attendance_statuses`**: `id`, `organization_id`, `key`, `name`, `counts_as_present bool`, `is_active` (Presente/Ausente/Justificado).
**`event_attendance`**: `activity_id`, `member_id`, `status_id`, `notes`, `recorded_by`, `recorded_at`. **PK/UQ `(activity_id, member_id)`**. IDX `(member_id)`, `(activity_id, status_id)`.
**Funções/views**: `fn_attendance_roster(activity_id)` (elegíveis = `member_cycles` ativos no ciclo ∩ público); `v_attendance_by_member/cycle/section/period`; `fn_consecutive_absences(member_id)` (window functions).

### B.7 Repertório e arquivos

**`repertoires`**: `id`, `organization_id`, `name`, `description`, `color_token`, `sort_order`, `is_active`.
**`songs`**: `id`, `organization_id`, `repertoire_id`, `title`, `artist`, `genre`, `musical_key`, `notes`, `sort_order`, `is_active`.
**`song_attachments`**: `id`, `song_id`, `instrument_id null`, `section_id null`, `kind` (`score|audio|video|lyrics|other`), `url null`, `file_id null`, `description`, `source` (`manual|storage|gdrive`), `external_ref`. CHECK `url is not null or file_id is not null`.
**`file_objects`**: `id`, `organization_id`, `bucket`, `path` (`{org_id}/…`), `mime`, `size`, `uploaded_by`, `sensitivity`. Metadados de Storage.
**`integrations`** (futuro Drive): `organization_id`, `provider`, `config`, `credentials_ref` (segredos no Vault/Edge Function, nunca no front).

### B.8 Governança

**`audit_logs`**: `id`, `organization_id`, `actor_user_id`, `actor_member_id`, `action`, `entity_type`, `entity_id`, `old_data jsonb`, `new_data jsonb`, `created_at`, `request_meta`. Append-only (sem UPDATE/DELETE). Gerada por trigger genérico `fn_audit()` nas tabelas críticas + log de **leitura** de dados sensíveis (RPC).
**`org_settings`**: chave/valor tipado por organização (flags, textos de privacidade).
**`consent_records`**: `member_id`, `purpose`, `text_version`, `granted_at`, `revoked_at` (LGPD).

### B.9 Formulários de inscrição (Fase 8 — esboço)
`forms`, `form_versions` (snapshot imutável JSON da estrutura publicada), `form_fields` (editáveis no rascunho), `form_field_conditions`, `form_field_mappings` (→ `member.full_name`, vínculo artístico…), `form_submissions` (`form_version_id`, `answers jsonb`, `status pending|approved|rejected|archived`, `reviewed_by/at`, `member_id` pós-aprovação, `consent`), `form_submission_files`. Submissão pública via **Edge Function/RPC `security definer`** com rate limit + honeypot; **sem** SELECT anônimo em respostas.

---

## C. Diagrama conceitual

```
Organization ─┬─< Member ──┬─1:1─ MemberSensitiveData
              │            ├─<  MemberAccessRole >─ AccessRole ─< RolePermission >─ Permission
              │            ├─<  MemberClassification >─ Classification
              │            ├─<  MemberArtisticLink >─ Area / Section / Instrument / Function / SkillLevel
              │            ├─<  MemberCycle >─ Cycle >─ CycleType
              │            │       └─< StatusHistory
              │            ├─<  Scholarship ;  MemberFeeAssignment >─ FeeCategory ─< Price
              │            ├─<  MonthlyCharge (UQ member+competence) ─< Adjustment, Payment
              │            ├─<  EventAttendance >─ Activity ─< ChecklistItem (cópia do Template)
              │            ├─<  StaffPayment ; PixKey
              │            └─0..1 auth.users (via members.user_id)
              ├─< Cycle ─< SectionCycleCapacity >─ Section
              ├─< Activity >─ ActivityType, RecurrenceRule, Audience
              ├─< Repertoire ─< Song ─< SongAttachment >─ Instrument/Section/FileObject
              ├─< FinancialEntry ; DistributionDestination ─< DistributionRule
              └─< AuditLog
```

Fluxo: **Organization → Members → MemberCycles → Cycles**; presença: **Activity (ciclo + público) → roster (MemberCycles ativos ∩ público) → EventAttendance**.

---

## D. Autenticação

- **`auth.users`** (Supabase Auth): credenciais, e-mail verificado, provedor (e-mail/senha, Google). Nenhuma senha própria.
- **`members`**: a pessoa. `members.user_id` é **nullable**: existe cadastro sem login.
- **Vínculo**: (1) Direção cria member → (2) gera convite (`member_invites`, token hasheado, expira) → (3) pessoa cria conta/loga → (4) RPC `claim_member(token)` grava `user_id`. Alternativa por e-mail verificado coincidente, **somente com confirmação da Direção** (evita sequestro de cadastro).
- **Auto-cadastro** (signup sem convite): cria conta sem acesso a nenhuma organização até ser vinculada/aprovada → tela “aguardando vinculação”.
- **Sessão/contexto**: após login, `get_my_memberships()` retorna organizações+papéis; front escolhe org ativa (sessão em memória; só `orgSlug` em `localStorage`).
- **Helpers SQL** (`security definer`, `stable`, `search_path=''`): `current_member_ids()`, `is_org_member(org)`, `has_role(org,key)`, `has_permission(org,perm)`, `is_self(member_id)`, `leads_section(org, section_id)`.
- Fluxos de UI (pt-BR): cadastro, verificação de e-mail, recuperação e redefinição de senha, Google OAuth, logout; mapa de erros do Supabase → mensagens amigáveis em `core/errors`.

---

## E. Matriz de permissões

Legenda: ● total · ◐ restrito (escopo) · ○ nenhum. Escopos: **próprio**, **grupo** (naipes/alunos que lidera), **org**.

| Recurso / ação | Direção | Professor | Monitor | Integrante |
|---|---|---|---|---|
| Ver lista de membros (campos básicos) | ● org | ◐ grupo | ◐ grupo | ○ (só diretório mínimo*) |
| Editar cadastro de membro | ● | ◐ grupo (campos não sensíveis) | ○ | ◐ próprio (não sensíveis + sensíveis próprios) |
| **Dados sensíveis (LGPD)** | ● (leitura logada) | ○ | ○ | ◐ só os próprios |
| Papéis de acesso / classificações | ● | ○ | ○ | ○ |
| Status no ciclo (ativo/inativo) | ● | ◐ grupo | ◐ grupo | ○ |
| Estrutura (áreas, naipes, instrumentos, funções) | ● editar | ○ ler | ○ ler | ○ ler |
| Vagas: ver | ● | ● | ◐ ler do grupo | ○ |
| Vagas: definir limite | ● | ◐ (configurável) | ○ | ○ |
| Ciclos: criar/editar | ● | ○ | ○ | ○ |
| Eventos: ver | ● | ● | ● | ◐ conforme visibilidade/público |
| Eventos: criar/editar | ● | ◐ (ensaios/oficinas do grupo) | ○ | ○ |
| Checklist de evento: editar itens | ● | ◐ | ◐ itens atribuídos a si | ◐ itens atribuídos a si |
| Modelos de checklist | ● | ○ | ○ | ○ |
| Presença: registrar | ● | ◐ grupo | ◐ grupo | ○ |
| Presença: ver | ● org | ◐ grupo | ◐ grupo | ◐ própria |
| Mensalidades: ver/gerar/baixar | ● | ○ | ○ | ◐ próprias (somente leitura) |
| Categorias de contribuição / valores | ● | ○ | ○ | ○ |
| Bolsas (conceder/ver) | ● | ○ | ○ | ◐ própria (% vigente) |
| Financeiro (receitas/despesas/distribuição) | ● | ○ | ○ | ○ |
| Pagamentos da equipe | ● | ◐ próprios | ◐ próprios | ○ |
| Chave PIX | ● (ler) | ◐ própria | ◐ própria | ◐ própria (futuro) |
| Repertório: ler | ● | ● | ● | ● |
| Repertório: editar | ● | ◐ (configurável) | ○ | ○ |
| Dashboard | completo | professor | monitor | integrante |
| Auditoria | ● | ○ | ○ | ○ |
| Configurações | ● | ○ | ○ | ○ |
| Formulários de inscrição (F8) | ● | ○ | ○ | ○ |

\* “Diretório mínimo”: nome de exibição e naipe — configurável por organização (`org_settings.member_directory_visibility`).

Implementação: a matriz vira **dados** (`role_permissions` + `scope`), não `if`s. Papéis acumuláveis ⇒ permissão efetiva = **união** dos papéis ativos; escopo mais amplo prevalece.

**Definição de “grupo”** (a confirmar, §I): Professor = naipes/instrumentos em que é `is_lead` (tabela `section_staff(section_id, member_id, role)`); Monitor = membros atribuídos via `monitor_assignments(monitor_id, member_id|section_id)`.

---

## F. Políticas RLS (proposta)

Princípios: RLS **ligado em todas as tabelas**; `anon` sem acesso (exceto RPC pública de formulários, F8); `service_role` só em Edge Functions; políticas por **operação**; funções helper `security definer` com `search_path=''` para evitar recursão; índices nas colunas usadas pelas policies.

Padrão base (toda tabela de domínio):
```sql
-- leitura: apenas quem é membro ativo da org
create policy select_org on <t> for select to authenticated
  using (public.is_org_member(organization_id));
-- escrita: depende de permissão
create policy write_perm on <t> for all to authenticated
  using (public.has_permission(organization_id,'<mod>.manage'))
  with check (public.has_permission(organization_id,'<mod>.manage'));
```

| Tabela | SELECT | INSERT/UPDATE | DELETE |
|---|---|---|---|
| `organizations` | membros da org | Direção (`org.manage`) | ✗ (desativar) |
| `members` | `members.read` org **ou** (grupo ∧ `is_in_my_group`) **ou** próprio | Direção; próprio (colunas limitadas via RPC/trigger que bloqueia mudança de campos admin); grupo conforme permissão | ✗ (arquivar) |
| `member_sensitive_data` | **Direção** ou **próprio** | Direção ou próprio | ✗ |
| `member_access_roles`, `role_permissions`, `classifications*` | membros leem próprios; Direção tudo | Direção | ✗ (revoked_at) |
| `areas/sections/instruments/functions/skill_levels` | todos membros da org | Direção | ✗ (is_active) |
| `member_artistic_links` | org/grupo/próprio | Direção; próprio (se permitido) | Direção (encerra com `ended_at`) |
| `cycles`, `cycle_types` | membros | Direção | ✗ |
| `member_cycles` | org/grupo/próprio | Direção; Prof/Monitor grupo (só `status`, `notes`) | ✗ |
| `member_cycle_status_history` | Direção; grupo; próprio | só trigger | ✗ |
| `section_cycle_capacity` | Direção, Professor; Monitor leitura grupo | Direção (+Professor se permitido) | ✗ |
| `fee_*`, `scholarships` | Direção; próprio (leitura da sua bolsa/categoria) | Direção | ✗ |
| `monthly_charges`, `charge_*` | Direção; **próprio** | Direção (via RPC) | ✗ (cancelar) |
| `finance_*`, `financial_entries`, `distribution_*` | **só Direção** | Direção | ✗ (cancelar/estornar) |
| `staff_payments` | Direção; próprio | Direção | ✗ |
| `member_pix_keys` | Direção; próprio | próprio; Direção | próprio |
| `activities`, `activity_audiences` | por `visibility`/público (função `can_view_activity`) | Direção; Professor/ grupo | arquivar |
| `activity_checklist_items` | quem vê o evento | Direção/Prof; responsável (só `status`,`notes` do próprio item) | Direção |
| `event_attendance` | Direção; grupo; próprio | Direção; Prof/Monitor grupo (`attendance.record`) | ✗ (corrige com UPDATE auditado) |
| `repertoires/songs/song_attachments` | todos membros | Direção (+ permissão) | ✗ (is_active) |
| `audit_logs` | **Direção** | só triggers/RPC | ✗ **imutável** |
| `member_invites`, `consent_records` | Direção; próprio | Direção / RPC | ✗ |

**Storage** (buckets privados): `org-assets` (logo — leitura por membros), `scores` (partituras), `documents`, `form-uploads`. Path `{organization_id}/…`; policy: `bucket_id=… and is_org_member((storage.foldername(name))[1]::uuid)` para leitura, `has_permission` para escrita. URLs assinadas com expiração curta.

**Colunas sensíveis**: além da tabela separada, `REVOKE` de colunas em `members` quando aplicável e views `security_invoker` para listagens, que **não** expõem sensíveis.

**Testes**: suíte pgTAP simulando `set local role authenticated; set local request.jwt.claims` para 4 perfis × 2 organizações (casos negativos cross-org obrigatórios) em CI.

Documentação viva em `docs/RLS.md` (tabela × operação × helper), gerada junto às migrations.

---

## G. Navegação e rotas

Shell: **desktop** = sidebar; **mobile** = bottom bar (Início, Repertório, Presença, Mensalidades, Membros, Eventos; resto em “Mais”). Itens filtrados por permissão.

| Rota (`/:orgSlug`) | Página | Quem |
|---|---|---|
| `/login` `/cadastro` `/recuperar-senha` `/redefinir-senha` `/verificar-email` `/convite/:token` | Auth | público |
| `/` | Início (dashboard por perfil) | todos |
| `/repertorio`, `/repertorio/:id` (drawer música) | Repertório | todos / edição Direção |
| `/presenca`, `/presenca/:activityId` | Chamada | Direção, Prof., Monitor |
| `/minha-frequencia` | Frequência própria | todos |
| `/mensalidades`, `/minhas-mensalidades` | Mensalidades (admin / pessoal) | Direção / todos |
| `/membros`, `/membros/:id` (+ drawer rápido) | Membros | Direção, Prof., Monitor |
| `/eventos` (calendário + lista, drawer criar/editar) | Eventos | todos |
| `/perfil` | Meus dados, PIX, privacidade | todos |
| `/financeiro` (receitas, despesas, distribuição, equipe) | Financeiro | Direção |
| `/bolsas` | Indicadores de bolsas | Direção |
| `/vagas` | Vagas por naipe/ciclo | Direção, Prof. |
| `/ciclos` | Ciclos | Direção |
| `/configuracoes/*` (organização, identidade, estrutura, classificações, contribuições, tipos de evento, checklists, destinos, papéis) | Configurações | Direção |
| `/auditoria` | Logs | Direção |
| `/inscricoes/*` (F8) · público `/f/:formSlug` | Formulários | Direção · público |

---

## H. Fases

| Fase | Entrega | Critério de pronto |
|---|---|---|
| **0** | Repo, Vite+TS+Tailwind+shadcn, tokens de tema, fontes, CI, Supabase local, geração de tipos | “hello” tematizado; lint/test/CI verdes |
| **1** | Supabase, **auth** completa, `organizations`, `members`, convites, papéis/permissões, helpers + RLS base, auditoria base (trigger), shell de navegação | Login Google/e-mail, convite→vínculo, testes RLS dos 4 papéis × 2 orgs |
| **2** | Ciclos, `member_cycles`+histórico, classificações, estrutura artística editável, vínculos, vagas | Cadastro completo do integrante (sensíveis separados); ocupação por ciclo |
| **3** | Eventos/calendário, recorrência (ensaio segunda), audiência, presença (mobile-first), indicadores SQL | Chamada eficiente no celular; % por membro/ciclo |
| **4** | Categorias, preços versionados, bolsas, geração idempotente de cobranças, ajustes, mensalidades, indicadores de bolsa, texto WhatsApp | Gerar 2× a mesma competência não duplica |
| **5** | Financeiro, despesas, destinos/regras de distribuição, pagamentos da equipe, PIX | Σ% ≤ 100 validado no banco |
| **6** | Repertório, anexos, Storage, compartilhamento (WhatsApp) | Anexos por instrumento sem mudar schema |
| **7** | Checklists por modelo, relatórios, auditoria avançada, dashboards por perfil completos | — |
| **8** | **Formulários públicos** + submissões + aprovação→member | Respostas antigas legíveis via snapshot |
| **9** | Integração Google Drive (Edge Function, conta institucional) | opcional |

---

## I. Ambiguidades, riscos e decisões

### I.1 Perguntas que precisam de resposta **antes** das migrations
1. **“Grupo” de Professor/Monitor**: como definir quem um professor/monitor “acompanha”? Proposta: `section_staff` (professor→naipes) e `monitor_assignments` (monitor→alunos ou naipes). Alternativa: tudo da org. *Impacta RLS.*
2. **Quem vê o quê entre integrantes**: diretório mínimo (nome+naipe) é visível a todos? Proposta: sim, configurável.
3. **Categoria de contribuição de quem acumula** (aluno + pernalta, músico + pernalta): cobrar uma só (a mais cara? a de maior prioridade?) ou somar? Proposta: **uma categoria principal por integrante/ciclo**, escolhida explicitamente (`member_fee_assignments`), sem inferência automática.
4. **Direção, professores e monitores pagam?** Regra só cita músicos/alunos/pernaltas. Proposta: paga somente quem tem categoria atribuída.
5. **Mensalidade por ciclo**: Carnaval e Junino podem se sobrepor (competências no mesmo mês). Cobrança é por **competência**, não por ciclo; pessoa ativa em ambos paga uma vez? Proposta: uma cobrança por pessoa/competência (UQ), ciclo informativo.
6. **Quem é “inadimplente”**: pendente com vencimento passado. Precisamos de `due_day` (dia de vencimento) em `org_settings` — valor?
7. **Bolsa**: é por categoria, por integrante e vigente por período (proposta)? Existem “tipos de bolsa” (item 37)? Proposta: `scholarships.reason/type` livre + catálogo opcional `scholarship_types`.
8. **Base de cálculo da distribuição** (item 18): sobre receita bruta, líquida de despesas ou saldo após fixos? Proposta: cada regra escolhe `base` explicitamente; ordem por `priority`.
9. **Aprovação do Professor em vagas**: pode alterar limites ou só visualizar? Proposta: permissão configurável `capacity.manage` (padrão: só Direção).
10. **Status do `member_cycles`**: apenas Ativo/Inativo ou tabela configurável (ex.: lista de espera, trancado)? Proposta: tabela `member_cycle_statuses` com 2 sementes, `counts_as_active` bool.
11. **Pernalta**: é função (Performance) mas também categoria de contribuição — o vínculo função→categoria é automático? Proposta: `artistic_functions.fee_category_id` apenas **sugere**; Direção confirma.
12. **Senior**: apenas classificação informativa (sem efeito financeiro/permissão) — confirmado conforme o enunciado.
13. **Presença de inativos/visitantes**: permitir adicionar manualmente alguém fora do roster? Proposta: sim, com marcação “fora da lista”.
14. **Menores de idade** (provável em blocos): LGPD exige consentimento do responsável. Precisamos de `guardian` no cadastro? Proposta: prever `member_guardians` na Fase 2 (confirmar).
15. **Retenção de dados** e prazo de eliminação (LGPD) — definir política antes do módulo de formulários.

### I.1.1 Respostas confirmadas (v0.2) — prevalecem sobre o texto acima

| # | Decisão | Impacto no schema/RLS |
|---|---|---|
| 1 | Professor e Monitor acompanham **alunos e músicos**, atribuídos **por naipe, acumulável**. Direção edita as atribuições numa tela própria. | Novas tabelas `staff_section_assignments(member_id, section_id, staff_kind professor\|monitor, cycle_id null, valid_from, valid_to)`. Substitui `section_staff`/`monitor_assignments`. Helper `leads_section()` e `is_in_my_group(member_id)` = membro com vínculo artístico em naipe atribuído ao usuário. Opcional futuro: atribuição direta por aluno. |
| 2 | Diretório mínimo visível a todos, configurável. | `org_settings.member_directory_visibility`. |
| 3 | Sem acúmulo de categoria: **uma categoria por integrante/ciclo**, definida explicitamente. | UQ parcial em `member_fee_assignments (member_id, cycle_id)` vigente. |
| 4 | **Só Aluno e Músico pagam** (Pernalta também é categoria — ver 11). Direção, Professor e Monitor **recebem** (equipe), não pagam, salvo categoria atribuída. | Nenhuma cobrança sem `member_fee_assignments`. |
| 5 | Uma cobrança por pessoa/competência; ciclo é informativo. | UQ já previsto. |
| 6 | **Vencimento: dia 10, ou próximo dia útil; sem juros/multa.** | `org_settings.due_day=10`; tabela `holidays(organization_id, date, name)` (feriados nacionais + RJ, editável) e função `next_business_day(date)`. `monthly_charges.due_on date`. Inadimplente = `pending` com `due_on < hoje`. Sem campos de juros. |
| 7 | Bolsa por integrante, vigente por período; `reason` livre + catálogo opcional. | `scholarship_types` (ex.: **“Senior”** criado se/quando a Direção quiser — Senior segue sem efeito financeiro por padrão). |
| 8 | Distribuição: seguir proposta (cada regra declara a base). **Padrão sugerido: percentuais sobre a receita bruta do mês; valores fixos descontados antes dos percentuais**, ajustável. Exemplo: receita R$ 5.000, aluguel fixo R$ 1.000 → sobra R$ 4.000; Direção 30% = R$ 1.200. A UI mostrará a base e um simulador do resultado. | `distribution_rules.base` + `priority`. |
| 9 | Só a Direção altera limites de vagas; Professor visualiza (permissão `capacity.manage` configurável). | — |
| 10 | Status de ciclo **configurável**, incluindo **Lista de espera** (e Ativo, Inativo). **Página própria “Lista de espera”** (por ciclo/naipe, ordem de entrada, promover a ativo respeitando vagas). | `member_cycle_statuses(key, name, counts_as_active, is_waitlist, sort_order)`; `member_cycles` ganha `waitlist_position`, `waitlisted_at`. Contagem de vagas usa só `counts_as_active`. Rota `/lista-de-espera`. |
| 11 | **Pernalta não define a categoria de contribuição.** Pessoa pode ser pernalta e ter papel de Direção/Monitor e, ainda, ser contribuinte. A função artística é só vínculo; a categoria (Aluno/Músico/Pernalta) é atribuída explicitamente. | Remover `artistic_functions.fee_category_id` (sugestão automática). |
| 12 | Senior informativo; bolsa “Senior” opcional. | — |
| 13 | Presença de pessoas fora da lista permitida (marcada “fora da lista”). | `event_attendance.is_off_roster bool`. |
| 14 | **Menores de 18 anos não podem ser integrantes.** | Validação: `CHECK`/trigger `birth_date <= current_date - interval '18 years'` em `members` (aviso na UI; Direção pode registrar exceção? — **pendente**, assumido: sem exceção). Sem `member_guardians`. Formulário público valida idade. |
| 15 | Retenção “padrão de mercado” (adotado, ajustável pela Direção/jurídico): **financeiro/auditoria 5 anos**; **inscrições rejeitadas/arquivadas 12 meses** e **sem aprovação 6 meses**, depois anonimização; **dados sensíveis** eliminados/anonimizados a pedido do titular (exceto obrigação legal); logs de acesso 6 meses (Marco Civil). Consentimento versionado. | `org_settings.retention_policy`; job de anonimização (Fase 8); revisão jurídica recomendada antes de produção. |

Itens 2, 4–9 e 11–13 do I.1 original ficam resolvidos; o texto original de 1, 3, 10, 11 e 14 é substituído pela tabela acima.

### I.2 Riscos de modelagem e mitigação
- **Vazamento cross-org via FK**: usar FKs compostas `(organization_id, id)`; testes negativos.
- **Recursão/performance em RLS**: helpers `security definer` + índices; evitar subselects aninhados por linha; cachear `current_member_ids()` com `stable`.
- **Sensíveis em joins**: tabela separada + views `security_invoker`; nunca `select *` em `members` para exportações.
- **Idempotência de cobranças**: UQ no banco + RPC `insert … on conflict do nothing`; nunca no front.
- **Histórico financeiro**: preços versionados, snapshot de valores na cobrança, sem DELETE (cancelar/estornar).
- **Recorrência**: armazenar regra **e** materializar ocorrências (presença precisa de `activity_id`); edição “só esta/ esta e seguintes” a definir.
- **Timezone**: `timestamptz` para instantes, `date` para datas civis; competência `date` (dia 1).
- **Contagem de vagas** com condições de corrida: constraint/trigger com lock ao ativar membro em naipe lotado (aviso vs bloqueio — decisão: **aviso + override da Direção**, pendente).
- **Auto-edição pelo integrante**: restringir colunas via RPC/trigger (não confiar só em RLS por linha).
- **Chave PIX**: dado financeiro pessoal ⇒ acesso mínimo, `pix_key_snapshot` no pagamento.

### I.3 Decisões assumidas (documentadas; reversíveis)
| # | Decisão | Motivo |
|---|---|---|
| D1 | Competência = `date` no dia 1 | robusto, ordenável, indexável |
| D2 | Papéis de acesso e classificações são tabelas distintas | Senior ≠ permissão |
| D3 | Sensíveis em tabela própria | RLS e LGPD |
| D4 | Tabelas configuráveis no lugar de enums, exceto estados internos (`pending/paid/…`, status de ciclo) | requisito 37 |
| D5 | Preços de categoria versionados por vigência | histórico imutável |
| D6 | Ocorrências de recorrência materializadas | presença por evento |
| D7 | Regras críticas em RPC/trigger no banco | segurança e idempotência |
| D8 | Valores/nomes da Tia Juca apenas em `seed/tiajuca.sql` | multi-organização |
| D9 | Sem DELETE físico em dados históricos | requisito 39 |

### I.4 Configurável (não codificar)
Valores de contribuição, % de bolsa, vencimento, tipos de evento, status de presença, permissões por papel, visibilidade do diretório, limite de vagas, base de distribuição, texto de privacidade, retenção, cores/logo.

---

**Próximo passo sugerido:** aprovar/ajustar esta proposta, responder as perguntas de I.1 (especialmente 1, 3, 5, 8, 10, 14) e então iniciar a **Fase 0 + Fase 1** (migrations 0001–0010 + testes RLS).
