-- BASELINE DO ESQUEMA (DRIFT-02/03), gerado em 23/11/2026 a partir do banco de produção (só leitura).
-- É um retrato do que VALE HOJE: tabelas, funções (definição vigente), políticas, gatilhos, índices, views, permissões, buckets e agendamentos.
-- NÃO é uma migration: não rode em produção e não use com `supabase db push`. Serve para recriar o esquema num banco vazio
-- (ambiente de teste) e como referência do estado final. Fonte da verdade continua sendo o banco. Veja docs/BANCO.md.
-- Não inclui dados (nem os de referência: papéis, permissões e modelos vêm de supabase/seed e das migrations). Regenere quando o esquema mudar.
set check_function_bodies = false;
set client_min_messages = warning;

-- ============ Extensões ============
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_stat_statements with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;
create extension if not exists "uuid-ossp" with schema extensions;

-- ============ Tipos ============
create type public.cycle_status as enum ('planned', 'open', 'closed');
create type public.permission_scope as enum ('own', 'group', 'org');
create type public.staff_kind as enum ('professor', 'monitor', 'regente');

-- ============ Tabelas (colunas; sem padrões nem restrições) ============
create table public.access_roles (
  id uuid not null,
  organization_id uuid not null,
  key text not null,
  name text not null,
  rank integer not null,
  is_system boolean not null,
  created_at timestamp with time zone not null
);
create table public.activities (
  id uuid not null,
  organization_id uuid not null,
  activity_type_id uuid not null,
  cycle_id uuid,
  title text not null,
  activity_date date not null,
  start_time time without time zone,
  end_time time without time zone,
  location text,
  description text,
  status text not null,
  visibility text not null,
  recurrence_rule_id uuid,
  created_by uuid,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  itinerary jsonb,
  cancel_reason text,
  customized boolean not null,
  recurrence_slot date,
  has_attendance boolean not null,
  deleted_at timestamp with time zone,
  to_confirm boolean not null,
  to_confirm_note text,
  checklist_name text
);
create table public.activity_audiences (
  id uuid not null,
  organization_id uuid not null,
  activity_id uuid not null,
  kind text not null,
  ref_id uuid not null
);
create table public.activity_checklist_items (
  id uuid not null,
  organization_id uuid not null,
  activity_id uuid not null,
  source_template_item_id uuid,
  title text not null,
  status text not null,
  assignee_member_id uuid,
  notes text,
  sort_order integer not null,
  is_active boolean not null,
  updated_by uuid,
  updated_at timestamp with time zone not null,
  created_at timestamp with time zone not null,
  description text
);
create table public.activity_item_cancellations (
  id uuid not null,
  organization_id uuid not null,
  activity_id uuid not null,
  instrument_id uuid not null,
  reason text,
  created_at timestamp with time zone not null
);
create table public.activity_type_links (
  organization_id uuid not null,
  activity_id uuid not null,
  activity_type_id uuid not null
);
create table public.activity_types (
  id uuid not null,
  organization_id uuid not null,
  name text not null,
  color text not null,
  sort_order integer not null,
  is_active boolean not null,
  created_at timestamp with time zone not null,
  attendance_default boolean not null
);
create table public.artistic_functions (
  id uuid not null,
  organization_id uuid not null,
  name text not null,
  sort_order integer not null,
  is_active boolean not null,
  created_at timestamp with time zone not null,
  section_id uuid,
  is_fixed boolean not null,
  is_exempt boolean not null,
  exempt_locked boolean not null,
  kind text not null,
  description text
);
create table public.attendance_statuses (
  id uuid not null,
  organization_id uuid not null,
  key text not null,
  name text not null,
  counts_as_present boolean not null,
  sort_order integer not null,
  is_active boolean not null
);
create table public.audit_logs (
  id bigint generated always as identity,
  organization_id uuid not null,
  actor_user_id uuid,
  actor_member_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamp with time zone not null
);
create table public.backups (
  id uuid not null,
  organization_id uuid not null,
  label text not null,
  kind text not null,
  created_at timestamp with time zone not null,
  created_by uuid,
  size_bytes bigint not null,
  table_counts jsonb not null,
  data jsonb not null
);
create table public.charge_adjustments (
  id uuid not null,
  organization_id uuid not null,
  charge_id uuid not null,
  original_amount numeric(12,2) not null,
  new_amount numeric(12,2) not null,
  reason text not null,
  adjusted_by uuid,
  adjusted_at timestamp with time zone not null
);
create table public.checklist_template_items (
  id uuid not null,
  organization_id uuid not null,
  template_id uuid not null,
  title text not null,
  sort_order integer not null,
  is_active boolean not null,
  description text
);
create table public.checklist_templates (
  id uuid not null,
  organization_id uuid not null,
  name text not null,
  is_active boolean not null,
  created_at timestamp with time zone not null
);
create table public.consent_records (
  id uuid not null,
  organization_id uuid not null,
  member_id uuid not null,
  purpose text not null,
  text_version text not null,
  granted_at timestamp with time zone not null,
  revoked_at timestamp with time zone
);
create table public.cycle_extra_categories (
  id uuid not null,
  organization_id uuid not null,
  member_id uuid not null,
  cycle_id uuid not null,
  fee_category_id uuid not null,
  created_at timestamp with time zone not null
);
create table public.cycle_fee_assignments (
  id uuid not null,
  organization_id uuid not null,
  member_id uuid not null,
  cycle_id uuid,
  fee_category_id uuid not null,
  created_at timestamp with time zone not null
);
create table public.cycle_participations (
  id uuid not null,
  organization_id uuid not null,
  member_id uuid not null,
  cycle_id uuid,
  instrument_id uuid,
  function_id uuid,
  skill_level_id uuid,
  is_student boolean not null,
  is_paid boolean not null,
  is_primary boolean not null,
  source_link_id uuid,
  created_at timestamp with time zone not null
);
create table public.cycle_scholarships (
  id uuid not null,
  organization_id uuid not null,
  member_id uuid not null,
  cycle_id uuid,
  percent numeric(5,2) not null,
  reason text,
  scholarship_type_id uuid,
  created_at timestamp with time zone not null
);
create table public.cycle_types (
  id uuid not null,
  organization_id uuid not null,
  key text not null,
  name text not null,
  is_active boolean not null
);
create table public.cycles (
  id uuid not null,
  organization_id uuid not null,
  cycle_type_id uuid not null,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  status cycle_status not null,
  is_active boolean not null,
  is_current boolean not null,
  created_at timestamp with time zone not null
);
create table public.distribution_destinations (
  id uuid not null,
  organization_id uuid not null,
  name text not null,
  kind text not null,
  role_key text,
  sort_order integer not null,
  is_active boolean not null,
  created_at timestamp with time zone not null
);
create table public.drive_folder_access (
  id uuid not null,
  organization_id uuid not null,
  folder_id uuid not null,
  access_role_id uuid,
  section_id uuid,
  instrument_id uuid,
  created_at timestamp with time zone not null
);
create table public.drive_folder_shares (
  id uuid not null,
  organization_id uuid not null,
  folder_id uuid not null,
  email text not null,
  drive_permission_id text,
  created_at timestamp with time zone not null,
  removed_at timestamp with time zone
);
create table public.drive_folders (
  id uuid not null,
  organization_id uuid not null,
  name text not null,
  description text,
  url text not null,
  drive_folder_id text,
  sort_order integer not null,
  is_active boolean not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  last_synced_at timestamp with time zone,
  last_sync_summary jsonb
);
create table public.email_requests (
  id uuid not null,
  organization_id uuid not null,
  member_id uuid not null,
  email text not null,
  status text not null,
  created_at timestamp with time zone not null,
  reviewed_at timestamp with time zone
);
create table public.event_attendance (
  organization_id uuid not null,
  activity_id uuid not null,
  member_id uuid not null,
  status_id uuid not null,
  notes text,
  is_off_roster boolean not null,
  recorded_by uuid,
  recorded_at timestamp with time zone not null
);
create table public.fee_categories (
  id uuid not null,
  organization_id uuid not null,
  name text not null,
  sort_order integer not null,
  is_active boolean not null,
  created_at timestamp with time zone not null,
  system_key text,
  function_id uuid,
  base_key text,
  section_id uuid
);
create table public.fee_cycle_exempt (
  organization_id uuid not null,
  function_id uuid not null,
  cycle_id uuid not null,
  is_exempt boolean not null,
  updated_at timestamp with time zone not null
);
create table public.fee_cycle_prices (
  organization_id uuid not null,
  fee_category_id uuid not null,
  cycle_id uuid not null,
  amount numeric(12,2) not null,
  updated_at timestamp with time zone not null
);
create table public.finance_categories (
  id uuid not null,
  organization_id uuid not null,
  kind text not null,
  name text not null,
  sort_order integer not null,
  is_active boolean not null,
  created_at timestamp with time zone not null
);
create table public.financial_entries (
  id uuid not null,
  organization_id uuid not null,
  kind text not null,
  category_id uuid not null,
  description text not null,
  amount numeric(12,2) not null,
  occurred_on date not null,
  status text not null,
  notes text,
  created_by uuid,
  created_at timestamp with time zone not null,
  cancelled_at timestamp with time zone,
  cancelled_by uuid,
  cancel_reason text,
  cycle_id uuid
);
create table public.form_email_outbox (
  id uuid not null,
  organization_id uuid not null,
  submission_id uuid not null,
  member_id uuid,
  template text not null,
  to_email text not null,
  status text not null,
  attempts integer not null,
  next_attempt_at timestamp with time zone not null,
  last_error text,
  sent_at timestamp with time zone,
  created_at timestamp with time zone not null,
  message text
);
create table public.form_fields (
  id uuid not null,
  organization_id uuid not null,
  form_id uuid not null,
  field_key text not null,
  label text not null,
  description text,
  field_type text not null,
  required boolean not null,
  sort_order integer not null,
  options jsonb not null,
  default_value text,
  validation jsonb not null,
  condition jsonb,
  member_mapping text,
  is_active boolean not null,
  created_at timestamp with time zone not null,
  source_template_id uuid
);
create table public.form_list_items (
  id uuid not null,
  organization_id uuid not null,
  list_id uuid not null,
  name text not null,
  sort_order integer not null,
  is_active boolean not null,
  created_at timestamp with time zone not null,
  description text
);
create table public.form_lists (
  id uuid not null,
  organization_id uuid not null,
  name text not null,
  kind text not null,
  source text,
  sort_order integer not null,
  is_active boolean not null,
  created_at timestamp with time zone not null,
  link text
);
create table public.form_section_templates (
  id uuid not null,
  organization_id uuid not null,
  name text not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  form_id uuid not null,
  section_id uuid not null,
  sort_order integer not null
);
create table public.form_send_defaults (
  organization_id uuid not null,
  send_text text,
  confirmation_message text not null,
  review_message text not null,
  approved_email_text text not null,
  rejected_email_text text not null,
  updated_at timestamp with time zone not null,
  privacy_text text,
  waitlist_email_text text not null,
  privacy_enabled boolean not null,
  send_enabled boolean not null,
  confirmation_enabled boolean not null,
  review_enabled boolean not null,
  approved_enabled boolean not null,
  rejected_enabled boolean not null,
  waitlist_enabled boolean not null
);
create table public.form_submission_files (
  id uuid not null,
  organization_id uuid not null,
  submission_id uuid not null,
  field_key text not null,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint
);
create table public.form_submissions (
  id uuid not null,
  organization_id uuid not null,
  form_id uuid not null,
  form_version_id uuid not null,
  answers jsonb not null,
  consent_given boolean not null,
  status text not null,
  reviewer_notes text,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  member_id uuid,
  applicant_email text,
  dedupe_key text,
  submitted_at timestamp with time zone not null,
  purged_at timestamp with time zone,
  applicant_user_id uuid,
  applicant_message text,
  edited_at timestamp with time zone
);
create table public.form_submit_attempts (
  id bigint generated always as identity,
  form_id uuid not null,
  ip_hash text not null,
  at timestamp with time zone not null
);
create table public.form_upload_tokens (
  token uuid not null,
  organization_id uuid not null,
  form_id uuid not null,
  expires_at timestamp with time zone not null,
  used_at timestamp with time zone,
  created_at timestamp with time zone not null
);
create table public.form_versions (
  id uuid not null,
  organization_id uuid not null,
  form_id uuid not null,
  version integer not null,
  snapshot jsonb not null,
  published_by uuid,
  published_at timestamp with time zone not null
);
create table public.forms (
  id uuid not null,
  organization_id uuid not null,
  title text not null,
  description text,
  slug text not null,
  cycle_id uuid,
  status text not null,
  opens_at timestamp with time zone,
  closes_at timestamp with time zone,
  confirmation_message text not null,
  max_responses integer,
  privacy_text text,
  requires_consent boolean not null,
  prevent_duplicates boolean not null,
  published_version_id uuid,
  created_by uuid,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  header_image_url text,
  header_pos_x numeric not null,
  header_pos_y numeric not null,
  header_zoom numeric not null,
  header_height integer not null,
  is_template boolean not null,
  send_text text,
  review_message text not null,
  approved_email_text text not null,
  rejected_email_text text not null,
  waitlist_email_text text not null,
  privacy_enabled boolean not null,
  send_enabled boolean not null,
  confirmation_enabled boolean not null,
  review_enabled boolean not null,
  approved_enabled boolean not null,
  rejected_enabled boolean not null,
  waitlist_enabled boolean not null,
  kind text not null,
  header_logo_size integer not null,
  header_color text,
  access text not null
);
create table public.gender_options (
  id uuid not null,
  organization_id uuid not null,
  name text not null,
  sort_order integer not null,
  is_active boolean not null,
  created_at timestamp with time zone not null,
  description text
);
create table public.holidays (
  organization_id uuid not null,
  day date not null,
  name text not null,
  scope text not null
);
create table public.infinitepay_transactions (
  transaction_nsu text not null,
  kind text not null,
  code text not null,
  created_at timestamp with time zone not null
);
create table public.instrument_cycle_capacity (
  organization_id uuid not null,
  instrument_id uuid not null,
  cycle_id uuid not null,
  capacity integer not null,
  updated_at timestamp with time zone not null
);
create table public.instrument_cycle_workshop (
  organization_id uuid not null,
  instrument_id uuid not null,
  cycle_id uuid not null,
  has_workshop boolean not null,
  updated_at timestamp with time zone not null
);
create table public.instrument_cycles (
  organization_id uuid not null,
  instrument_id uuid not null,
  cycle_id uuid not null,
  created_at timestamp with time zone not null
);
create table public.instruments (
  id uuid not null,
  organization_id uuid not null,
  section_id uuid not null,
  name text not null,
  sort_order integer not null,
  is_active boolean not null,
  created_at timestamp with time zone not null,
  tuning text
);
create table public.integrations (
  id uuid not null,
  organization_id uuid not null,
  provider text not null,
  config jsonb not null,
  credentials_ref text,
  is_active boolean not null,
  created_at timestamp with time zone not null
);
create table public.member_access_roles (
  id uuid not null,
  organization_id uuid not null,
  member_id uuid not null,
  access_role_id uuid not null,
  granted_by uuid,
  granted_at timestamp with time zone not null,
  revoked_at timestamp with time zone
);
create table public.member_artistic_links (
  id uuid not null,
  organization_id uuid not null,
  member_id uuid not null,
  instrument_id uuid,
  function_id uuid,
  skill_level_id uuid,
  is_primary boolean not null,
  started_at date not null,
  ended_at date,
  created_at timestamp with time zone not null,
  is_student boolean not null,
  is_paid boolean not null
);
create table public.member_cycle_status_history (
  id bigint generated always as identity,
  organization_id uuid not null,
  member_cycle_id uuid not null,
  old_status_id uuid,
  new_status_id uuid not null,
  changed_by uuid,
  changed_at timestamp with time zone not null,
  notes text
);
create table public.member_cycle_statuses (
  id uuid not null,
  organization_id uuid not null,
  key text not null,
  name text not null,
  counts_as_active boolean not null,
  is_waitlist boolean not null,
  sort_order integer not null,
  is_active boolean not null
);
create table public.member_cycles (
  id uuid not null,
  organization_id uuid not null,
  member_id uuid not null,
  cycle_id uuid not null,
  status_id uuid not null,
  joined_on date,
  left_on date,
  notes text,
  waitlisted_at timestamp with time zone,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  waitlist_instrument_id uuid
);
create table public.member_emails (
  id uuid not null,
  organization_id uuid not null,
  member_id uuid not null,
  email text not null,
  created_at timestamp with time zone not null
);
create table public.member_form_answers (
  id uuid not null,
  organization_id uuid not null,
  member_id uuid not null,
  cycle_id uuid,
  cycle_label text not null,
  affective_relation text,
  other_blocks text,
  source text not null,
  created_at timestamp with time zone not null
);
create table public.member_invites (
  id uuid not null,
  organization_id uuid not null,
  member_id uuid not null,
  email text,
  token_hash bytea not null,
  expires_at timestamp with time zone not null,
  accepted_at timestamp with time zone,
  invited_by uuid,
  created_at timestamp with time zone not null
);
create table public.member_pix_keys (
  id uuid not null,
  organization_id uuid not null,
  member_id uuid not null,
  key_type text not null,
  key_value text not null,
  is_default boolean not null,
  created_at timestamp with time zone not null,
  archived_at timestamp with time zone
);
create table public.member_sensitive_data (
  member_id uuid not null,
  organization_id uuid not null,
  gender text,
  is_trans boolean,
  race_color text,
  is_pcd boolean,
  pcd_description text,
  updated_at timestamp with time zone not null,
  updated_by uuid
);
create table public.members (
  id uuid not null,
  organization_id uuid not null,
  user_id uuid,
  full_name text not null,
  display_name text,
  email text,
  phone text,
  social_handle text,
  birth_date date,
  joined_at date,
  affective_relation text,
  played_other_blocks boolean not null,
  other_blocks text,
  archived_at timestamp with time zone,
  created_at timestamp with time zone not null,
  created_by uuid,
  updated_at timestamp with time zone not null,
  extra_info jsonb not null,
  played_instrument text,
  photo_path text
);
create table public.monthly_charges (
  id uuid not null,
  organization_id uuid not null,
  member_id uuid not null,
  competence date not null,
  fee_category_id uuid not null,
  base_amount numeric(12,2) not null,
  scholarship_percent numeric(5,2) not null,
  scholarship_discount numeric(12,2) not null,
  final_amount numeric(12,2) not null,
  status text not null,
  due_on date not null,
  paid_on date,
  payment_method text,
  manual_adjustment boolean not null,
  notes text,
  created_at timestamp with time zone not null,
  created_by uuid,
  updated_at timestamp with time zone not null,
  pay_code text,
  pay_link_url text,
  pay_ref jsonb not null,
  cycle_id uuid
);
create table public.org_settings (
  organization_id uuid not null,
  key text not null,
  value jsonb not null,
  updated_at timestamp with time zone not null
);
create table public.organizations (
  id uuid not null,
  name text not null,
  short_name text not null,
  slug text not null,
  logo_path text,
  theme jsonb not null,
  timezone text not null,
  is_active boolean not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  founded_on date
);
create table public.page_releases (
  organization_id uuid not null,
  page_key text not null,
  category text not null,
  released boolean not null,
  updated_at timestamp with time zone not null,
  updated_by uuid
);
create table public.participation_requests (
  id uuid not null,
  organization_id uuid not null,
  member_id uuid not null,
  kind text not null,
  action text not null,
  instrument_id uuid,
  function_id uuid,
  link_id uuid,
  note text,
  status text not null,
  created_at timestamp with time zone not null,
  reviewed_at timestamp with time zone
);
create table public.permissions (
  key text not null,
  module text not null,
  description text not null
);
create table public.race_options (
  id uuid not null,
  organization_id uuid not null,
  name text not null,
  sort_order integer not null,
  is_active boolean not null,
  created_at timestamp with time zone not null,
  description text
);
create table public.reactivation_requests (
  id uuid not null,
  organization_id uuid not null,
  member_id uuid not null,
  cycle_id uuid not null,
  message text,
  status text not null,
  created_at timestamp with time zone not null,
  decided_by uuid,
  decided_at timestamp with time zone,
  decision_note text
);
create table public.recurrence_rules (
  id uuid not null,
  organization_id uuid not null,
  activity_type_id uuid not null,
  title text not null,
  weekday smallint not null,
  start_time time without time zone,
  end_time time without time zone,
  location text,
  description text,
  visibility text not null,
  starts_on date not null,
  until date,
  is_active boolean not null,
  created_at timestamp with time zone not null,
  itinerary jsonb,
  audiences jsonb not null,
  has_attendance boolean not null,
  extra_type_ids uuid[] not null
);
create table public.recurrence_skips (
  organization_id uuid not null,
  rule_id uuid not null,
  activity_date date not null
);
create table public.repertoires (
  id uuid not null,
  organization_id uuid not null,
  name text not null,
  description text,
  color text not null,
  sort_order integer not null,
  is_active boolean not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  cycle_id uuid
);
create table public.role_permissions (
  access_role_id uuid not null,
  permission_key text not null,
  scope permission_scope not null
);
create table public.scholarship_types (
  id uuid not null,
  organization_id uuid not null,
  name text not null,
  is_active boolean not null
);
create table public.section_cycles (
  organization_id uuid not null,
  section_id uuid not null,
  cycle_id uuid not null,
  created_at timestamp with time zone not null
);
create table public.section_names (
  id uuid not null,
  organization_id uuid not null,
  name text not null,
  sort_order integer not null,
  is_active boolean not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  has_tuning boolean not null,
  item_label text not null,
  pitch_mode text not null
);
create table public.sections (
  id uuid not null,
  organization_id uuid not null,
  name text not null,
  sort_order integer not null,
  is_active boolean not null,
  created_at timestamp with time zone not null,
  has_tuning boolean not null,
  item_label text not null,
  pitch_mode text not null
);
create table public.shop_coupons (
  id uuid not null,
  organization_id uuid not null,
  code text not null,
  discount_pct numeric(5,2) not null,
  is_active boolean not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  valid_until date,
  max_uses integer
);
create table public.shop_email_outbox (
  id uuid not null,
  organization_id uuid not null,
  order_id uuid not null,
  event_id uuid,
  template text not null,
  to_email text not null,
  status text not null,
  attempts integer not null,
  next_attempt_at timestamp with time zone not null,
  last_error text,
  sent_at timestamp with time zone,
  created_at timestamp with time zone not null,
  product_id uuid
);
create table public.shop_fulfillments (
  id uuid not null,
  organization_id uuid not null,
  order_id uuid not null,
  kind text not null,
  status text not null,
  updated_by uuid,
  updated_at timestamp with time zone not null
);
create table public.shop_lookup_attempts (
  id bigint generated always as identity,
  bucket text not null,
  created_at timestamp with time zone not null
);
create table public.shop_order_events (
  id uuid not null,
  organization_id uuid not null,
  order_id uuid not null,
  fulfillment_id uuid,
  scope text not null,
  from_status text,
  to_status text not null,
  actor_member_id uuid,
  actor_label text not null,
  note text,
  created_at timestamp with time zone not null
);
create table public.shop_order_items (
  id uuid not null,
  organization_id uuid not null,
  order_id uuid not null,
  product_id uuid not null,
  variant_id uuid not null,
  kind text not null,
  product_name text not null,
  variant_label text not null,
  quantity integer not null,
  unit_price_cents integer not null,
  discount_pct numeric(5,2) not null,
  unit_final_cents integer not null,
  created_at timestamp with time zone not null
);
create table public.shop_orders (
  id uuid not null,
  organization_id uuid not null,
  code text not null,
  customer_name text not null,
  customer_phone text not null,
  customer_email text not null,
  member_id uuid,
  pickup_point_id uuid not null,
  payment_method text not null,
  status text not null,
  subtotal_cents integer not null,
  discount_cents integer not null,
  total_cents integer not null,
  expires_at timestamp with time zone,
  paid_at timestamp with time zone,
  paid_by uuid,
  paid_via text,
  payment_ref jsonb not null,
  cancel_reason text,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  privacy_accepted_at timestamp with time zone not null,
  archived_at timestamp with time zone,
  archived_by uuid,
  user_id uuid,
  client_request_id uuid,
  coupon_code text,
  coupon_pct numeric(5,2),
  coupon_discount_cents integer not null,
  anonymized_at timestamp with time zone
);
create table public.shop_pickup_points (
  id uuid not null,
  organization_id uuid not null,
  name text not null,
  address text not null,
  opening_hours text not null,
  sort_order integer not null,
  is_active boolean not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  schedule jsonb not null,
  kind text not null,
  contact_name text,
  contact_phone text,
  place_address text
);
create table public.shop_product_images (
  id uuid not null,
  organization_id uuid not null,
  product_id uuid not null,
  storage_path text not null,
  alt text not null,
  sort_order integer not null,
  created_at timestamp with time zone not null
);
create table public.shop_product_pickups (
  id uuid not null,
  organization_id uuid not null,
  product_id uuid not null,
  pickup_point_id uuid not null
);
create table public.shop_product_variants (
  id uuid not null,
  organization_id uuid not null,
  product_id uuid not null,
  label text not null,
  stock integer,
  reserved integer not null,
  sort_order integer not null,
  is_active boolean not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);
create table public.shop_products (
  id uuid not null,
  organization_id uuid not null,
  slug text not null,
  name text not null,
  description text not null,
  kind text not null,
  price_cents integer not null,
  member_discount_pct numeric(5,2) not null,
  lead_time_days text,
  is_active boolean not null,
  sort_order integer not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  is_featured boolean not null,
  min_units integer,
  suggested_ids uuid[] not null,
  is_kit boolean not null,
  kit_component_photos boolean not null,
  is_hidden boolean not null,
  notify_min_reached boolean not null,
  min_notified_at timestamp with time zone,
  special_price_cents integer,
  show_remaining boolean not null,
  show_remaining_when integer
);
create table public.shop_settings (
  organization_id uuid not null,
  payment_methods text[] not null,
  infinitepay_handle text,
  public_site_url text,
  updated_at timestamp with time zone not null,
  updated_by uuid,
  pix_key text,
  pix_beneficiary text,
  contact_whatsapp text,
  contact_email text,
  directors jsonb not null,
  mail_from_name text,
  mail_from_email text,
  default_member_discount_pct numeric(5,2) not null,
  intro_text text,
  reservation_hours integer not null,
  privacy_retention_years integer not null,
  featured_title text not null,
  credit_fees_pct numeric[] not null,
  payment_changed_at timestamp with time zone,
  payment_changed_by uuid,
  pix_city text
);
create table public.shop_stock_items (
  id uuid not null,
  organization_id uuid not null,
  name text not null,
  stock integer,
  reserved integer not null,
  sort_order integer not null,
  is_active boolean not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);
create table public.shop_variant_stock (
  id uuid not null,
  organization_id uuid not null,
  variant_id uuid not null,
  stock_item_id uuid not null,
  quantity integer not null,
  sort_order integer not null
);
create table public.site_albums (
  id uuid not null,
  organization_id uuid not null,
  url text not null,
  title text not null,
  event_date date,
  cover_url text,
  sort_order integer not null,
  is_active boolean not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  authors jsonb not null
);
create table public.site_settings (
  organization_id uuid not null,
  headline text,
  description text,
  photo_url text,
  links jsonb not null,
  videos jsonb not null,
  enrollment_label text not null,
  shop_label text not null,
  login_label text not null,
  show_shop boolean not null,
  updated_at timestamp with time zone not null,
  header_color text,
  page_color text,
  hide_headline boolean not null,
  show_enrollment boolean not null,
  show_login boolean not null,
  shake_button text,
  menu_order jsonb not null,
  show_albums boolean not null,
  albums_label text not null,
  shop_product_id uuid,
  show_release boolean not null,
  release_label text not null,
  release_url text,
  menu_construction jsonb not null,
  show_rays boolean not null,
  rays_count integer not null,
  rays_opacity integer not null,
  rays_rotation integer not null,
  rays_color text,
  rays_animate boolean not null,
  rays_outline boolean not null,
  rays_outline_color text,
  rays_speed integer not null,
  rays_full boolean not null
);
create table public.skill_levels (
  id uuid not null,
  organization_id uuid not null,
  name text not null,
  sort_order integer not null,
  is_active boolean not null,
  created_at timestamp with time zone not null,
  description text,
  list_id uuid,
  section_ids uuid[] not null
);
create table public.social_networks (
  id uuid not null,
  organization_id uuid not null,
  key text not null,
  name text not null,
  url_template text not null,
  sort_order integer not null,
  is_active boolean not null,
  created_at timestamp with time zone not null
);
create table public.song_attachments (
  id uuid not null,
  organization_id uuid not null,
  song_id uuid not null,
  instrument_id uuid,
  section_id uuid,
  kind text not null,
  url text,
  storage_path text,
  file_name text,
  mime_type text,
  size_bytes bigint,
  description text,
  source text not null,
  external_ref text,
  is_active boolean not null,
  created_by uuid,
  created_at timestamp with time zone not null,
  tuning text
);
create table public.songs (
  id uuid not null,
  organization_id uuid not null,
  repertoire_id uuid not null,
  title text not null,
  artist text,
  genre text,
  musical_key text,
  notes text,
  sort_order integer not null,
  is_active boolean not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  guide_url text,
  drive_folder_url text
);
create table public.staff_assignments (
  id uuid not null,
  organization_id uuid not null,
  member_id uuid not null,
  staff_kind staff_kind not null,
  section_id uuid,
  instrument_id uuid,
  valid_from date not null,
  valid_to date,
  created_at timestamp with time zone not null,
  cycle_id uuid,
  compensation text
);
create table public.staff_group_rules (
  id uuid not null,
  organization_id uuid not null,
  cycle_id uuid not null,
  group_key text not null,
  percent numeric(5,2) not null,
  scope text not null,
  section_id uuid,
  created_at timestamp with time zone not null
);
create table public.staff_pay_hours (
  id uuid not null,
  organization_id uuid not null,
  rule_id uuid not null,
  competence date not null,
  hours numeric(6,2) not null,
  created_at timestamp with time zone not null
);
create table public.staff_pay_rules (
  id uuid not null,
  organization_id uuid not null,
  cycle_id uuid not null,
  member_id uuid not null,
  kind text not null,
  fixed_amount numeric(12,2),
  percent numeric(5,2),
  scope text not null,
  section_id uuid,
  instrument_id uuid,
  created_at timestamp with time zone not null,
  hourly_rate numeric(12,2),
  group_key text
);
create table public.staff_payments (
  id uuid not null,
  organization_id uuid not null,
  member_id uuid not null,
  competence date not null,
  destination_id uuid,
  amount numeric(12,2) not null,
  status text not null,
  due_on date,
  paid_on date,
  payment_method text,
  pix_key_snapshot text,
  notes text,
  created_by uuid,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  cycle_id uuid
);
create table public.storage_delete_queue (
  id bigint generated always as identity,
  organization_id uuid not null,
  bucket text not null,
  path text not null,
  queued_at timestamp with time zone not null
);
create table public.supplier_categories (
  id uuid not null,
  organization_id uuid not null,
  name text not null,
  sort_order integer not null,
  is_active boolean not null,
  created_at timestamp with time zone not null
);
create table public.suppliers (
  id uuid not null,
  organization_id uuid not null,
  category_id uuid not null,
  name text not null,
  phone text,
  email text,
  website text,
  notes text,
  is_active boolean not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

-- ============ Padrões das colunas ============
alter table public.access_roles alter column created_at set default now();
alter table public.access_roles alter column id set default gen_random_uuid();
alter table public.access_roles alter column is_system set default false;
alter table public.activities alter column created_at set default now();
alter table public.activities alter column created_by set default auth.uid();
alter table public.activities alter column customized set default false;
alter table public.activities alter column has_attendance set default true;
alter table public.activities alter column id set default gen_random_uuid();
alter table public.activities alter column status set default 'scheduled'::text;
alter table public.activities alter column to_confirm set default false;
alter table public.activities alter column updated_at set default now();
alter table public.activities alter column visibility set default 'members'::text;
alter table public.activity_audiences alter column id set default gen_random_uuid();
alter table public.activity_checklist_items alter column created_at set default now();
alter table public.activity_checklist_items alter column id set default gen_random_uuid();
alter table public.activity_checklist_items alter column is_active set default true;
alter table public.activity_checklist_items alter column sort_order set default 0;
alter table public.activity_checklist_items alter column status set default 'todo'::text;
alter table public.activity_checklist_items alter column updated_at set default now();
alter table public.activity_checklist_items alter column updated_by set default auth.uid();
alter table public.activity_item_cancellations alter column created_at set default now();
alter table public.activity_item_cancellations alter column id set default gen_random_uuid();
alter table public.activity_types alter column attendance_default set default true;
alter table public.activity_types alter column color set default 'primary'::text;
alter table public.activity_types alter column created_at set default now();
alter table public.activity_types alter column id set default gen_random_uuid();
alter table public.activity_types alter column is_active set default true;
alter table public.activity_types alter column sort_order set default 0;
alter table public.artistic_functions alter column created_at set default now();
alter table public.artistic_functions alter column exempt_locked set default false;
alter table public.artistic_functions alter column id set default gen_random_uuid();
alter table public.artistic_functions alter column is_active set default true;
alter table public.artistic_functions alter column is_exempt set default false;
alter table public.artistic_functions alter column is_fixed set default false;
alter table public.artistic_functions alter column kind set default 'collab'::text;
alter table public.artistic_functions alter column sort_order set default 0;
alter table public.attendance_statuses alter column counts_as_present set default false;
alter table public.attendance_statuses alter column id set default gen_random_uuid();
alter table public.attendance_statuses alter column is_active set default true;
alter table public.attendance_statuses alter column sort_order set default 0;
alter table public.audit_logs alter column created_at set default now();
alter table public.backups alter column created_at set default now();
alter table public.backups alter column created_by set default auth.uid();
alter table public.backups alter column id set default gen_random_uuid();
alter table public.backups alter column size_bytes set default 0;
alter table public.backups alter column table_counts set default '{}'::jsonb;
alter table public.charge_adjustments alter column adjusted_at set default now();
alter table public.charge_adjustments alter column id set default gen_random_uuid();
alter table public.checklist_template_items alter column id set default gen_random_uuid();
alter table public.checklist_template_items alter column is_active set default true;
alter table public.checklist_template_items alter column sort_order set default 0;
alter table public.checklist_templates alter column created_at set default now();
alter table public.checklist_templates alter column id set default gen_random_uuid();
alter table public.checklist_templates alter column is_active set default true;
alter table public.consent_records alter column granted_at set default now();
alter table public.consent_records alter column id set default gen_random_uuid();
alter table public.cycle_extra_categories alter column created_at set default now();
alter table public.cycle_extra_categories alter column id set default gen_random_uuid();
alter table public.cycle_fee_assignments alter column created_at set default now();
alter table public.cycle_fee_assignments alter column id set default gen_random_uuid();
alter table public.cycle_participations alter column created_at set default now();
alter table public.cycle_participations alter column id set default gen_random_uuid();
alter table public.cycle_participations alter column is_paid set default false;
alter table public.cycle_participations alter column is_primary set default false;
alter table public.cycle_participations alter column is_student set default false;
alter table public.cycle_scholarships alter column created_at set default now();
alter table public.cycle_scholarships alter column id set default gen_random_uuid();
alter table public.cycle_types alter column id set default gen_random_uuid();
alter table public.cycle_types alter column is_active set default true;
alter table public.cycles alter column created_at set default now();
alter table public.cycles alter column id set default gen_random_uuid();
alter table public.cycles alter column is_active set default true;
alter table public.cycles alter column is_current set default false;
alter table public.cycles alter column status set default 'planned'::cycle_status;
alter table public.distribution_destinations alter column created_at set default now();
alter table public.distribution_destinations alter column id set default gen_random_uuid();
alter table public.distribution_destinations alter column is_active set default true;
alter table public.distribution_destinations alter column kind set default 'custom'::text;
alter table public.distribution_destinations alter column sort_order set default 0;
alter table public.drive_folder_access alter column created_at set default now();
alter table public.drive_folder_access alter column id set default gen_random_uuid();
alter table public.drive_folder_shares alter column created_at set default now();
alter table public.drive_folder_shares alter column id set default gen_random_uuid();
alter table public.drive_folders alter column created_at set default now();
alter table public.drive_folders alter column id set default gen_random_uuid();
alter table public.drive_folders alter column is_active set default true;
alter table public.drive_folders alter column sort_order set default 0;
alter table public.drive_folders alter column updated_at set default now();
alter table public.email_requests alter column created_at set default now();
alter table public.email_requests alter column id set default gen_random_uuid();
alter table public.email_requests alter column status set default 'pending'::text;
alter table public.event_attendance alter column is_off_roster set default false;
alter table public.event_attendance alter column recorded_at set default now();
alter table public.fee_categories alter column created_at set default now();
alter table public.fee_categories alter column id set default gen_random_uuid();
alter table public.fee_categories alter column is_active set default true;
alter table public.fee_categories alter column sort_order set default 0;
alter table public.fee_cycle_exempt alter column updated_at set default now();
alter table public.fee_cycle_prices alter column updated_at set default now();
alter table public.finance_categories alter column created_at set default now();
alter table public.finance_categories alter column id set default gen_random_uuid();
alter table public.finance_categories alter column is_active set default true;
alter table public.finance_categories alter column sort_order set default 0;
alter table public.financial_entries alter column created_at set default now();
alter table public.financial_entries alter column created_by set default auth.uid();
alter table public.financial_entries alter column id set default gen_random_uuid();
alter table public.financial_entries alter column status set default 'posted'::text;
alter table public.form_email_outbox alter column attempts set default 0;
alter table public.form_email_outbox alter column created_at set default now();
alter table public.form_email_outbox alter column id set default gen_random_uuid();
alter table public.form_email_outbox alter column next_attempt_at set default now();
alter table public.form_email_outbox alter column status set default 'pending'::text;
alter table public.form_fields alter column created_at set default now();
alter table public.form_fields alter column id set default gen_random_uuid();
alter table public.form_fields alter column is_active set default true;
alter table public.form_fields alter column options set default '[]'::jsonb;
alter table public.form_fields alter column required set default false;
alter table public.form_fields alter column sort_order set default 0;
alter table public.form_fields alter column validation set default '{}'::jsonb;
alter table public.form_list_items alter column created_at set default now();
alter table public.form_list_items alter column id set default gen_random_uuid();
alter table public.form_list_items alter column is_active set default true;
alter table public.form_list_items alter column sort_order set default 0;
alter table public.form_lists alter column created_at set default now();
alter table public.form_lists alter column id set default gen_random_uuid();
alter table public.form_lists alter column is_active set default true;
alter table public.form_lists alter column sort_order set default 0;
alter table public.form_section_templates alter column created_at set default now();
alter table public.form_section_templates alter column id set default gen_random_uuid();
alter table public.form_section_templates alter column sort_order set default 0;
alter table public.form_section_templates alter column updated_at set default now();
alter table public.form_send_defaults alter column approved_email_text set default 'Sua inscrição foi aprovada. Obrigado por se inscrever! A direção entrará em contato com os próximos passos.'::text;
alter table public.form_send_defaults alter column approved_enabled set default true;
alter table public.form_send_defaults alter column confirmation_enabled set default true;
alter table public.form_send_defaults alter column confirmation_message set default 'Inscrição recebida!'::text;
alter table public.form_send_defaults alter column privacy_enabled set default true;
alter table public.form_send_defaults alter column rejected_email_text set default 'Agradecemos o seu interesse. Neste momento não foi possível aprovar a sua inscrição.'::text;
alter table public.form_send_defaults alter column rejected_enabled set default true;
alter table public.form_send_defaults alter column review_enabled set default true;
alter table public.form_send_defaults alter column review_message set default 'Recebemos a sua inscrição e a direção está avaliando. Você receberá a confirmação por e-mail.'::text;
alter table public.form_send_defaults alter column send_enabled set default true;
alter table public.form_send_defaults alter column updated_at set default now();
alter table public.form_send_defaults alter column waitlist_email_text set default 'Recebemos a sua inscrição e ela foi aprovada, mas as vagas do seu instrumento estão preenchidas. Você ficou na lista de espera e a direção avisa se uma vaga abrir.'::text;
alter table public.form_send_defaults alter column waitlist_enabled set default true;
alter table public.form_submission_files alter column id set default gen_random_uuid();
alter table public.form_submissions alter column answers set default '{}'::jsonb;
alter table public.form_submissions alter column consent_given set default false;
alter table public.form_submissions alter column id set default gen_random_uuid();
alter table public.form_submissions alter column status set default 'pending'::text;
alter table public.form_submissions alter column submitted_at set default now();
alter table public.form_submit_attempts alter column at set default now();
alter table public.form_upload_tokens alter column created_at set default now();
alter table public.form_upload_tokens alter column expires_at set default (now() + '01:00:00'::interval);
alter table public.form_upload_tokens alter column token set default gen_random_uuid();
alter table public.form_versions alter column id set default gen_random_uuid();
alter table public.form_versions alter column published_at set default now();
alter table public.form_versions alter column published_by set default auth.uid();
alter table public.forms alter column access set default 'public'::text;
alter table public.forms alter column approved_email_text set default 'Sua inscrição foi aprovada. Obrigado por se inscrever! A direção entrará em contato com os próximos passos.'::text;
alter table public.forms alter column approved_enabled set default true;
alter table public.forms alter column confirmation_enabled set default true;
alter table public.forms alter column confirmation_message set default 'Inscrição recebida! Entraremos em contato.'::text;
alter table public.forms alter column created_at set default now();
alter table public.forms alter column created_by set default auth.uid();
alter table public.forms alter column header_height set default 104;
alter table public.forms alter column header_logo_size set default 80;
alter table public.forms alter column header_pos_x set default 50;
alter table public.forms alter column header_pos_y set default 50;
alter table public.forms alter column header_zoom set default 1;
alter table public.forms alter column id set default gen_random_uuid();
alter table public.forms alter column is_template set default false;
alter table public.forms alter column kind set default 'enrollment'::text;
alter table public.forms alter column prevent_duplicates set default true;
alter table public.forms alter column privacy_enabled set default true;
alter table public.forms alter column rejected_email_text set default 'Agradecemos o seu interesse. Neste momento não foi possível aprovar a sua inscrição.'::text;
alter table public.forms alter column rejected_enabled set default true;
alter table public.forms alter column requires_consent set default true;
alter table public.forms alter column review_enabled set default true;
alter table public.forms alter column review_message set default 'Recebemos a sua inscrição e a direção está avaliando. Você receberá a confirmação por e-mail.'::text;
alter table public.forms alter column send_enabled set default true;
alter table public.forms alter column status set default 'draft'::text;
alter table public.forms alter column updated_at set default now();
alter table public.forms alter column waitlist_email_text set default 'Recebemos a sua inscrição e ela foi aprovada, mas as vagas do seu instrumento estão preenchidas. Você ficou na lista de espera e a direção avisa se uma vaga abrir.'::text;
alter table public.forms alter column waitlist_enabled set default true;
alter table public.gender_options alter column created_at set default now();
alter table public.gender_options alter column id set default gen_random_uuid();
alter table public.gender_options alter column is_active set default true;
alter table public.gender_options alter column sort_order set default 0;
alter table public.holidays alter column scope set default 'national'::text;
alter table public.infinitepay_transactions alter column created_at set default now();
alter table public.instrument_cycle_capacity alter column updated_at set default now();
alter table public.instrument_cycle_workshop alter column has_workshop set default false;
alter table public.instrument_cycle_workshop alter column updated_at set default now();
alter table public.instrument_cycles alter column created_at set default now();
alter table public.instruments alter column created_at set default now();
alter table public.instruments alter column id set default gen_random_uuid();
alter table public.instruments alter column is_active set default true;
alter table public.instruments alter column sort_order set default 0;
alter table public.integrations alter column config set default '{}'::jsonb;
alter table public.integrations alter column created_at set default now();
alter table public.integrations alter column id set default gen_random_uuid();
alter table public.integrations alter column is_active set default false;
alter table public.member_access_roles alter column granted_at set default now();
alter table public.member_access_roles alter column id set default gen_random_uuid();
alter table public.member_artistic_links alter column created_at set default now();
alter table public.member_artistic_links alter column id set default gen_random_uuid();
alter table public.member_artistic_links alter column is_paid set default false;
alter table public.member_artistic_links alter column is_primary set default false;
alter table public.member_artistic_links alter column is_student set default false;
alter table public.member_artistic_links alter column started_at set default CURRENT_DATE;
alter table public.member_cycle_status_history alter column changed_at set default now();
alter table public.member_cycle_statuses alter column counts_as_active set default false;
alter table public.member_cycle_statuses alter column id set default gen_random_uuid();
alter table public.member_cycle_statuses alter column is_active set default true;
alter table public.member_cycle_statuses alter column is_waitlist set default false;
alter table public.member_cycle_statuses alter column sort_order set default 0;
alter table public.member_cycles alter column created_at set default now();
alter table public.member_cycles alter column id set default gen_random_uuid();
alter table public.member_cycles alter column updated_at set default now();
alter table public.member_emails alter column created_at set default now();
alter table public.member_emails alter column id set default gen_random_uuid();
alter table public.member_form_answers alter column created_at set default now();
alter table public.member_form_answers alter column id set default gen_random_uuid();
alter table public.member_invites alter column created_at set default now();
alter table public.member_invites alter column id set default gen_random_uuid();
alter table public.member_pix_keys alter column created_at set default now();
alter table public.member_pix_keys alter column id set default gen_random_uuid();
alter table public.member_pix_keys alter column is_default set default true;
alter table public.member_sensitive_data alter column updated_at set default now();
alter table public.members alter column created_at set default now();
alter table public.members alter column created_by set default auth.uid();
alter table public.members alter column extra_info set default '{}'::jsonb;
alter table public.members alter column id set default gen_random_uuid();
alter table public.members alter column played_other_blocks set default false;
alter table public.members alter column updated_at set default now();
alter table public.monthly_charges alter column created_at set default now();
alter table public.monthly_charges alter column created_by set default auth.uid();
alter table public.monthly_charges alter column id set default gen_random_uuid();
alter table public.monthly_charges alter column manual_adjustment set default false;
alter table public.monthly_charges alter column pay_ref set default '{}'::jsonb;
alter table public.monthly_charges alter column scholarship_discount set default 0;
alter table public.monthly_charges alter column scholarship_percent set default 0;
alter table public.monthly_charges alter column status set default 'pending'::text;
alter table public.monthly_charges alter column updated_at set default now();
alter table public.org_settings alter column updated_at set default now();
alter table public.organizations alter column created_at set default now();
alter table public.organizations alter column id set default gen_random_uuid();
alter table public.organizations alter column is_active set default true;
alter table public.organizations alter column theme set default '{}'::jsonb;
alter table public.organizations alter column timezone set default 'America/Sao_Paulo'::text;
alter table public.organizations alter column updated_at set default now();
alter table public.page_releases alter column updated_at set default now();
alter table public.participation_requests alter column created_at set default now();
alter table public.participation_requests alter column id set default gen_random_uuid();
alter table public.participation_requests alter column status set default 'pending'::text;
alter table public.race_options alter column created_at set default now();
alter table public.race_options alter column id set default gen_random_uuid();
alter table public.race_options alter column is_active set default true;
alter table public.race_options alter column sort_order set default 0;
alter table public.reactivation_requests alter column created_at set default now();
alter table public.reactivation_requests alter column id set default gen_random_uuid();
alter table public.reactivation_requests alter column status set default 'pending'::text;
alter table public.recurrence_rules alter column audiences set default '[]'::jsonb;
alter table public.recurrence_rules alter column created_at set default now();
alter table public.recurrence_rules alter column extra_type_ids set default '{}'::uuid[];
alter table public.recurrence_rules alter column has_attendance set default true;
alter table public.recurrence_rules alter column id set default gen_random_uuid();
alter table public.recurrence_rules alter column is_active set default true;
alter table public.recurrence_rules alter column visibility set default 'members'::text;
alter table public.repertoires alter column color set default 'primary'::text;
alter table public.repertoires alter column created_at set default now();
alter table public.repertoires alter column id set default gen_random_uuid();
alter table public.repertoires alter column is_active set default true;
alter table public.repertoires alter column sort_order set default 0;
alter table public.repertoires alter column updated_at set default now();
alter table public.role_permissions alter column scope set default 'org'::permission_scope;
alter table public.scholarship_types alter column id set default gen_random_uuid();
alter table public.scholarship_types alter column is_active set default true;
alter table public.section_cycles alter column created_at set default now();
alter table public.section_names alter column created_at set default now();
alter table public.section_names alter column has_tuning set default true;
alter table public.section_names alter column id set default gen_random_uuid();
alter table public.section_names alter column is_active set default true;
alter table public.section_names alter column item_label set default 'Instrumento'::text;
alter table public.section_names alter column pitch_mode set default 'defined'::text;
alter table public.section_names alter column sort_order set default 0;
alter table public.section_names alter column updated_at set default now();
alter table public.sections alter column created_at set default now();
alter table public.sections alter column has_tuning set default true;
alter table public.sections alter column id set default gen_random_uuid();
alter table public.sections alter column is_active set default true;
alter table public.sections alter column item_label set default 'Instrumento'::text;
alter table public.sections alter column pitch_mode set default 'defined'::text;
alter table public.sections alter column sort_order set default 0;
alter table public.shop_coupons alter column created_at set default now();
alter table public.shop_coupons alter column id set default gen_random_uuid();
alter table public.shop_coupons alter column is_active set default true;
alter table public.shop_coupons alter column updated_at set default now();
alter table public.shop_email_outbox alter column attempts set default 0;
alter table public.shop_email_outbox alter column created_at set default now();
alter table public.shop_email_outbox alter column id set default gen_random_uuid();
alter table public.shop_email_outbox alter column next_attempt_at set default now();
alter table public.shop_email_outbox alter column status set default 'pending'::text;
alter table public.shop_fulfillments alter column id set default gen_random_uuid();
alter table public.shop_fulfillments alter column status set default 'pending'::text;
alter table public.shop_fulfillments alter column updated_at set default now();
alter table public.shop_lookup_attempts alter column created_at set default now();
alter table public.shop_order_events alter column actor_label set default 'sistema'::text;
alter table public.shop_order_events alter column created_at set default now();
alter table public.shop_order_events alter column id set default gen_random_uuid();
alter table public.shop_order_items alter column created_at set default now();
alter table public.shop_order_items alter column discount_pct set default 0;
alter table public.shop_order_items alter column id set default gen_random_uuid();
alter table public.shop_orders alter column coupon_discount_cents set default 0;
alter table public.shop_orders alter column created_at set default now();
alter table public.shop_orders alter column discount_cents set default 0;
alter table public.shop_orders alter column id set default gen_random_uuid();
alter table public.shop_orders alter column payment_ref set default '{}'::jsonb;
alter table public.shop_orders alter column privacy_accepted_at set default now();
alter table public.shop_orders alter column status set default 'awaiting_payment'::text;
alter table public.shop_orders alter column updated_at set default now();
alter table public.shop_pickup_points alter column created_at set default now();
alter table public.shop_pickup_points alter column id set default gen_random_uuid();
alter table public.shop_pickup_points alter column is_active set default true;
alter table public.shop_pickup_points alter column kind set default 'place'::text;
alter table public.shop_pickup_points alter column opening_hours set default ''::text;
alter table public.shop_pickup_points alter column schedule set default '[]'::jsonb;
alter table public.shop_pickup_points alter column sort_order set default 0;
alter table public.shop_pickup_points alter column updated_at set default now();
alter table public.shop_product_images alter column alt set default ''::text;
alter table public.shop_product_images alter column created_at set default now();
alter table public.shop_product_images alter column id set default gen_random_uuid();
alter table public.shop_product_images alter column sort_order set default 0;
alter table public.shop_product_pickups alter column id set default gen_random_uuid();
alter table public.shop_product_variants alter column created_at set default now();
alter table public.shop_product_variants alter column id set default gen_random_uuid();
alter table public.shop_product_variants alter column is_active set default true;
alter table public.shop_product_variants alter column reserved set default 0;
alter table public.shop_product_variants alter column sort_order set default 0;
alter table public.shop_product_variants alter column updated_at set default now();
alter table public.shop_products alter column created_at set default now();
alter table public.shop_products alter column description set default ''::text;
alter table public.shop_products alter column id set default gen_random_uuid();
alter table public.shop_products alter column is_active set default true;
alter table public.shop_products alter column is_featured set default false;
alter table public.shop_products alter column is_hidden set default false;
alter table public.shop_products alter column is_kit set default false;
alter table public.shop_products alter column kit_component_photos set default true;
alter table public.shop_products alter column member_discount_pct set default 0;
alter table public.shop_products alter column notify_min_reached set default true;
alter table public.shop_products alter column show_remaining set default true;
alter table public.shop_products alter column sort_order set default 0;
alter table public.shop_products alter column suggested_ids set default '{}'::uuid[];
alter table public.shop_products alter column updated_at set default now();
alter table public.shop_settings alter column credit_fees_pct set default '{4.2,6.09,7.01,7.91,8.8,9.67,12.59,13.42,14.25,15.06,15.87,16.66}'::numeric[];
alter table public.shop_settings alter column default_member_discount_pct set default 0;
alter table public.shop_settings alter column directors set default '[]'::jsonb;
alter table public.shop_settings alter column featured_title set default 'Destaques'::text;
alter table public.shop_settings alter column payment_methods set default ARRAY['pix'::text];
alter table public.shop_settings alter column privacy_retention_years set default 5;
alter table public.shop_settings alter column reservation_hours set default 48;
alter table public.shop_settings alter column updated_at set default now();
alter table public.shop_stock_items alter column created_at set default now();
alter table public.shop_stock_items alter column id set default gen_random_uuid();
alter table public.shop_stock_items alter column is_active set default true;
alter table public.shop_stock_items alter column reserved set default 0;
alter table public.shop_stock_items alter column sort_order set default 0;
alter table public.shop_stock_items alter column updated_at set default now();
alter table public.shop_variant_stock alter column id set default gen_random_uuid();
alter table public.shop_variant_stock alter column quantity set default 1;
alter table public.shop_variant_stock alter column sort_order set default 0;
alter table public.site_albums alter column authors set default '[]'::jsonb;
alter table public.site_albums alter column created_at set default now();
alter table public.site_albums alter column id set default gen_random_uuid();
alter table public.site_albums alter column is_active set default true;
alter table public.site_albums alter column sort_order set default 0;
alter table public.site_albums alter column title set default ''::text;
alter table public.site_albums alter column updated_at set default now();
alter table public.site_settings alter column albums_label set default 'Fotos'::text;
alter table public.site_settings alter column enrollment_label set default 'Inscrições da oficina'::text;
alter table public.site_settings alter column hide_headline set default false;
alter table public.site_settings alter column links set default '[]'::jsonb;
alter table public.site_settings alter column login_label set default 'Área dos integrantes'::text;
alter table public.site_settings alter column menu_construction set default '[]'::jsonb;
alter table public.site_settings alter column menu_order set default '["enrollment", "shop", "login"]'::jsonb;
alter table public.site_settings alter column rays_animate set default false;
alter table public.site_settings alter column rays_count set default 16;
alter table public.site_settings alter column rays_full set default false;
alter table public.site_settings alter column rays_opacity set default 100;
alter table public.site_settings alter column rays_outline set default true;
alter table public.site_settings alter column rays_rotation set default 0;
alter table public.site_settings alter column rays_speed set default 4;
alter table public.site_settings alter column release_label set default 'Release'::text;
alter table public.site_settings alter column shop_label set default 'Loja'::text;
alter table public.site_settings alter column show_albums set default true;
alter table public.site_settings alter column show_enrollment set default true;
alter table public.site_settings alter column show_login set default true;
alter table public.site_settings alter column show_rays set default false;
alter table public.site_settings alter column show_release set default true;
alter table public.site_settings alter column show_shop set default true;
alter table public.site_settings alter column updated_at set default now();
alter table public.site_settings alter column videos set default '[]'::jsonb;
alter table public.skill_levels alter column created_at set default now();
alter table public.skill_levels alter column id set default gen_random_uuid();
alter table public.skill_levels alter column is_active set default true;
alter table public.skill_levels alter column section_ids set default '{}'::uuid[];
alter table public.skill_levels alter column sort_order set default 0;
alter table public.social_networks alter column created_at set default now();
alter table public.social_networks alter column id set default gen_random_uuid();
alter table public.social_networks alter column is_active set default true;
alter table public.social_networks alter column key set default (gen_random_uuid())::text;
alter table public.social_networks alter column sort_order set default 0;
alter table public.song_attachments alter column created_at set default now();
alter table public.song_attachments alter column created_by set default auth.uid();
alter table public.song_attachments alter column id set default gen_random_uuid();
alter table public.song_attachments alter column is_active set default true;
alter table public.song_attachments alter column kind set default 'score'::text;
alter table public.song_attachments alter column source set default 'manual'::text;
alter table public.songs alter column created_at set default now();
alter table public.songs alter column id set default gen_random_uuid();
alter table public.songs alter column is_active set default true;
alter table public.songs alter column sort_order set default 0;
alter table public.songs alter column updated_at set default now();
alter table public.staff_assignments alter column compensation set default 'collaborative'::text;
alter table public.staff_assignments alter column created_at set default now();
alter table public.staff_assignments alter column id set default gen_random_uuid();
alter table public.staff_assignments alter column valid_from set default CURRENT_DATE;
alter table public.staff_group_rules alter column created_at set default now();
alter table public.staff_group_rules alter column id set default gen_random_uuid();
alter table public.staff_group_rules alter column scope set default 'all'::text;
alter table public.staff_pay_hours alter column created_at set default now();
alter table public.staff_pay_hours alter column id set default gen_random_uuid();
alter table public.staff_pay_rules alter column created_at set default now();
alter table public.staff_pay_rules alter column id set default gen_random_uuid();
alter table public.staff_pay_rules alter column scope set default 'all'::text;
alter table public.staff_payments alter column created_at set default now();
alter table public.staff_payments alter column created_by set default auth.uid();
alter table public.staff_payments alter column id set default gen_random_uuid();
alter table public.staff_payments alter column status set default 'pending'::text;
alter table public.staff_payments alter column updated_at set default now();
alter table public.storage_delete_queue alter column queued_at set default now();
alter table public.supplier_categories alter column created_at set default now();
alter table public.supplier_categories alter column id set default gen_random_uuid();
alter table public.supplier_categories alter column is_active set default true;
alter table public.supplier_categories alter column sort_order set default 0;
alter table public.suppliers alter column created_at set default now();
alter table public.suppliers alter column id set default gen_random_uuid();
alter table public.suppliers alter column is_active set default true;
alter table public.suppliers alter column updated_at set default now();

-- ============ Funções ============
CREATE OR REPLACE FUNCTION public._apply_form_sections(p_form uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare f public.forms;
begin
  select * into f from public.forms where id = p_form;
  if f.id is null then return; end if;
  update public.form_fields set is_active = false where form_id = p_form and field_key in ('email', 'is_pcd', 'pcd_description', 'plays');
  update public.form_fields set condition = null where form_id = p_form and field_key in ('instrument', 'level');
  insert into public.form_fields (organization_id, form_id, field_key, label, description, field_type, required, sort_order, validation)
  select f.organization_id, p_form, x.k, x.l, x.d, 'info', false, 0, x.v
  from (values
    ('sec_intro', 'Introdução', null::text, '{"section":true}'::jsonb),
    ('intro_texto', 'Seja bem-vindo(a)!', coalesce(f.description, 'Preencha seus dados para se inscrever. A Direção entrará em contato.'), '{}'::jsonb),
    ('sec_sobre', 'Sobre você', null, '{"section":true}'::jsonb),
    ('sec_participacao', 'Participação', null, '{"section":true,"consent":true}'::jsonb),
    ('sec_fim', 'Tá acabando', null, '{"section":true}'::jsonb)
  ) as x(k, l, d, v)
  on conflict (form_id, field_key) do nothing;
  update public.forms set description = null where id = p_form;
  update public.form_fields x set sort_order = o.n
  from unnest(array['sec_intro', 'intro_texto',
    'sec_sobre', 'full_name', 'display_name', 'phone', 'social', 'birth_date', 'gender', 'is_trans', 'race',
    'sec_participacao', 'instrument', 'level', 'played_other', 'other_blocks',
    'sec_fim', 'affective',
    'email', 'is_pcd', 'pcd_description', 'plays']) with ordinality as o(k, n)
  where x.form_id = p_form and x.field_key = o.k;
end $function$
;

CREATE OR REPLACE FUNCTION public._apply_principal_category(p_org uuid, p_member uuid, p_function uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare cat uuid; cy uuid;
begin
  select id into cat from public.fee_categories where organization_id = p_org and function_id = p_function limit 1;
  if cat is null then return false; end if;
  select id into cy from public.cycles where organization_id = p_org and is_current limit 1;
  if cy is not null then
    insert into public.cycle_fee_assignments (organization_id, member_id, cycle_id, fee_category_id) values (p_org, p_member, cy, cat)
    on conflict (member_id, cycle_id) where cycle_id is not null do update set fee_category_id = excluded.fee_category_id;
  end if;
  return true;
end $function$
;

CREATE OR REPLACE FUNCTION public._approve_renewal(p_id uuid, p_notes text, p_cycle_status text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s public.form_submissions; f public.forms; v public.form_versions; fld jsonb; mp text; ans jsonb; a text;
  m_full text; m_display text; m_phone text; m_social text; m_birth date; m_aff text; m_other text; m_extra jsonb := '{}'::jsonb;
  s_gender text; s_trans boolean; s_race text; s_pcd boolean; s_pcd_desc text; l_inst uuid; l_func uuid; l_level uuid; v_has_sens boolean := false; v_link uuid;
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  select * into s from public.form_submissions where id = p_id;
  if s.id is null or s.member_id is null or not public.has_permission(s.organization_id, 'forms.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  select * into f from public.forms where id = s.form_id;
  select * into v from public.form_versions where id = s.form_version_id;
  ans := s.answers;
  for fld in select * from jsonb_array_elements(v.snapshot -> 'fields') loop
    mp := fld ->> 'mapping';
    continue when mp is null or not (ans ? (fld ->> 'key'));
    a := ans ->> (fld ->> 'key');
    case mp
      when 'member.full_name' then m_full := a;
      when 'member.display_name' then m_display := a;
      when 'member.phone' then m_phone := a;
      when 'member.social_handle' then m_social := a;
      when 'member.birth_date' then m_birth := a::date;
      when 'member.affective_relation' then m_aff := a;
      when 'member.other_blocks' then m_other := a;
      when 'member.custom' then m_extra := m_extra || jsonb_build_object(fld ->> 'label', a);
      when 'sensitive.gender' then s_gender := a; v_has_sens := true;
      when 'sensitive.is_trans' then s_trans := (a = 'yes'); v_has_sens := true;
      when 'sensitive.race_color' then s_race := a; v_has_sens := true;
      when 'sensitive.is_pcd' then s_pcd := (a = 'yes'); v_has_sens := true;
      when 'sensitive.pcd_description' then s_pcd_desc := a; v_has_sens := true;
      when 'link.instrument' then l_inst := (case when a ~* uuid_re then a::uuid end);
      when 'link.function' then l_func := (case when a ~* uuid_re then a::uuid end);
      when 'link.skill_level' then l_level := (case when a ~* uuid_re then a::uuid end);
      else null;
    end case;
  end loop;

  update public.members set
    full_name = coalesce(nullif(trim(m_full), ''), full_name), display_name = coalesce(nullif(trim(m_display), ''), display_name),
    phone = coalesce(m_phone, phone), social_handle = coalesce(nullif(trim(m_social), ''), social_handle), birth_date = coalesce(m_birth, birth_date),
    affective_relation = coalesce(nullif(trim(m_aff), ''), affective_relation),
    other_blocks = coalesce(nullif(trim(m_other), ''), other_blocks), played_other_blocks = played_other_blocks or (m_other is not null and btrim(m_other) <> ''),
    extra_info = coalesce(extra_info, '{}'::jsonb) || m_extra
  where id = s.member_id and organization_id = s.organization_id;

  if v_has_sens then
    insert into public.member_sensitive_data (member_id, organization_id, gender, is_trans, race_color, is_pcd, pcd_description)
    values (s.member_id, s.organization_id, s_gender, s_trans, s_race, s_pcd, case when s_pcd then s_pcd_desc end)
    on conflict (member_id) do update set
      gender = coalesce(excluded.gender, public.member_sensitive_data.gender), is_trans = coalesce(excluded.is_trans, public.member_sensitive_data.is_trans),
      race_color = coalesce(excluded.race_color, public.member_sensitive_data.race_color), is_pcd = coalesce(excluded.is_pcd, public.member_sensitive_data.is_pcd),
      pcd_description = case when coalesce(excluded.is_pcd, public.member_sensitive_data.is_pcd) then coalesce(excluded.pcd_description, public.member_sensitive_data.pcd_description) end;
  end if;

  if l_inst is not null or l_level is not null then
    select id into v_link from public.member_artistic_links where member_id = s.member_id and ended_at is null and instrument_id is not null order by is_primary desc, created_at limit 1;
    if v_link is not null then
      update public.member_artistic_links set instrument_id = coalesce(l_inst, instrument_id), skill_level_id = coalesce(l_level, skill_level_id) where id = v_link;
    elsif l_inst is not null then
      insert into public.member_artistic_links (organization_id, member_id, instrument_id, skill_level_id, is_primary) values (s.organization_id, s.member_id, l_inst, l_level, true);
    end if;
  end if;
  if l_func is not null and not public._apply_principal_category(s.organization_id, s.member_id, l_func) then
    select id into v_link from public.member_artistic_links where member_id = s.member_id and ended_at is null and instrument_id is null and coalesce(is_paid, false) = false order by created_at limit 1;
    if v_link is not null then update public.member_artistic_links set function_id = l_func where id = v_link;
    else insert into public.member_artistic_links (organization_id, member_id, function_id, is_primary) values (s.organization_id, s.member_id, l_func, false);
    end if;
  end if;

  if s.consent_given then
    insert into public.consent_records (organization_id, member_id, purpose, text_version) values (s.organization_id, s.member_id, 'inscricao', v.id::text);
  end if;
  if p_cycle_status is not null and f.cycle_id is not null then
    perform public.set_member_cycle_status(s.member_id, f.cycle_id, p_cycle_status, null, case when p_cycle_status = 'waitlist' then l_inst end);
  end if;
  if coalesce(s.applicant_email, (select lower(email) from public.members where id = s.member_id)) is not null and (case when p_cycle_status = 'waitlist' then f.waitlist_enabled else f.approved_enabled end) then
    insert into public.form_email_outbox (organization_id, submission_id, member_id, template, to_email)
    values (s.organization_id, s.id, s.member_id, case when p_cycle_status = 'waitlist' then 'submission_waitlist' else 'submission_approved' end,
            coalesce(s.applicant_email, (select lower(email) from public.members where id = s.member_id))) on conflict do nothing;
  end if;
  update public.form_submissions set status = 'approved', reviewer_notes = coalesce(nullif(trim(p_notes), ''), reviewer_notes),
         reviewed_by = public.current_member_id(s.organization_id), reviewed_at = now() where id = p_id;
  insert into public.audit_logs (organization_id, actor_user_id, actor_member_id, action, entity_type, entity_id, new_data)
  values (s.organization_id, auth.uid(), public.current_member_id(s.organization_id), 'submission_approved', 'form_submissions', p_id::text, jsonb_build_object('member_id', s.member_id, 'renewal', true));
  return s.member_id;
end $function$
;

CREATE OR REPLACE FUNCTION public._att_base(p_org uuid, p_from date, p_to date)
 RETURNS TABLE(member_id uuid, activity_id uuid, activity_date date, start_time time without time zone, cycle_id uuid, title text, present boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column

declare v_scope text;
begin
  v_scope := public.permission_scope_of(p_org, 'attendance.read')::text;
  if v_scope is null or v_scope = 'own' then
    raise exception 'Sem permissão para relatórios de presença.' using errcode = '42501';
  end if;
  return query
  select ea.member_id, a.id, a.activity_date, a.start_time, a.cycle_id, a.title, st.counts_as_present
  from public.event_attendance ea
  join public.activities a on a.id = ea.activity_id and a.status <> 'cancelled' and a.activity_date between p_from and p_to
  join public.attendance_statuses st on st.id = ea.status_id
  where ea.organization_id = p_org and (v_scope = 'org' or public.is_in_my_group(p_org, ea.member_id));
end $function$
;

CREATE OR REPLACE FUNCTION public._att_filtered(p_org uuid, p_from date, p_to date, p_section uuid, p_instrument uuid, p_month text)
 RETURNS TABLE(member_id uuid, activity_id uuid, activity_date date, start_time time without time zone, cycle_id uuid, title text, present boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select b.member_id, b.activity_id, b.activity_date, b.start_time, b.cycle_id, b.title, b.present
  from public._att_base(p_org, p_from, p_to) b
  where (p_month is null or to_char(b.activity_date, 'YYYY-MM') = p_month)
    and ((p_section is null and p_instrument is null) or exists (
      select 1 from public.member_artistic_links l join public.instruments i on i.id = l.instrument_id
      where l.member_id = b.member_id and l.ended_at is null
        and (p_section is null or i.section_id = p_section)
        and (p_instrument is null or l.instrument_id = p_instrument)))
$function$
;

CREATE OR REPLACE FUNCTION public._build_section_template(p_section uuid, p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.form_fields; nxt int; r record; t public.form_section_templates; v_exists boolean := false; v_form uuid; v_sec uuid; v_id uuid; pos int := 1;
begin
  select * into s from public.form_fields where id = p_section and field_type = 'info' and coalesce((validation ->> 'section')::boolean, false);
  if s.id is null then raise exception 'Seção não encontrada.' using errcode = 'P0001'; end if;
  select * into t from public.form_section_templates where organization_id = s.organization_id and name = trim(p_name);
  if t.id is not null then
    v_exists := true; v_form := t.form_id; v_id := t.id;
    delete from public.form_fields where form_id = v_form;
  else
    insert into public.forms (organization_id, title, slug, is_template)
    values (s.organization_id, trim(p_name), 'modelo-' || substr(md5(random()::text), 1, 10), true) returning id into v_form;
  end if;
  select min(h.sort_order) into nxt from public.form_fields h
   where h.form_id = s.form_id and h.sort_order > s.sort_order and h.field_type = 'info' and coalesce((h.validation ->> 'section')::boolean, false);
  insert into public.form_fields (organization_id, form_id, field_key, label, description, field_type, required, sort_order, validation)
  values (s.organization_id, v_form, 'sec_' || substr(md5(random()::text), 1, 8), trim(p_name), s.description, 'info', false, 1, s.validation) returning id into v_sec;
  for r in select * from public.form_fields f
            where f.form_id = s.form_id and f.is_active and f.sort_order > s.sort_order and (nxt is null or f.sort_order < nxt) order by f.sort_order loop
    pos := pos + 1;
    insert into public.form_fields (organization_id, form_id, field_key, label, description, field_type, required, sort_order, options, default_value, validation, condition, member_mapping)
    values (s.organization_id, v_form, r.field_key, r.label, r.description, r.field_type, r.required, pos, r.options, r.default_value, r.validation, r.condition, r.member_mapping);
  end loop;
  if v_exists then
    update public.form_section_templates set section_id = v_sec where id = v_id;
  else
    insert into public.form_section_templates (organization_id, name, form_id, section_id, sort_order) values (s.organization_id, trim(p_name), v_form, v_sec, (select coalesce(max(x.sort_order), 0) + 1 from public.form_section_templates x where x.organization_id = s.organization_id)) returning id into v_id;
  end if;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public._charge_by_pay_code(p_code text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select c.id from public.monthly_charges c
   where c.pay_code = upper(trim(p_code))
      or (c.pay_ref ? 'old_codes' and exists (select 1 from jsonb_array_elements(c.pay_ref -> 'old_codes') x where x ->> 'code' = upper(trim(p_code))))
   order by (c.pay_code = upper(trim(p_code))) desc nulls last
   limit 1
$function$
;

CREATE OR REPLACE FUNCTION public._cycle_on(p_org uuid, p_day date)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select id from public.cycles where organization_id = p_org and is_active and starts_on <= p_day and ends_on >= p_day order by starts_on desc limit 1
$function$
;

CREATE OR REPLACE FUNCTION public._form_state(f forms)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select case
    when f.status = 'closed' then 'closed'
    when f.opens_at is not null and f.opens_at > now() then 'not_open'
    when f.closes_at is not null and f.closes_at < now() then 'closed'
    when f.max_responses is not null and (select count(*) from public.form_submissions s where s.form_id = f.id and s.status in ('pending', 'approved')) >= f.max_responses then 'full'
    else 'open' end
$function$
;

CREATE OR REPLACE FUNCTION public._guard_instrument_cycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if public._instrument_used(old.instrument_id, old.cycle_id) then
    raise exception 'Este instrumento tem (ou teve) integrantes neste ciclo e não pode ser tirado dele.' using errcode = 'P0001';
  end if;
  return old;
end $function$
;

CREATE OR REPLACE FUNCTION public._guard_instrument_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if public._instrument_used(old.id, null) then
    raise exception 'Este instrumento tem (ou teve) integrantes e não pode ser excluído.' using errcode = 'P0001';
  end if;
  return old;
end $function$
;

CREATE OR REPLACE FUNCTION public._guard_section_cycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if public._section_used(old.section_id, old.cycle_id) then
    raise exception 'Este naipe tem (ou teve) integrantes neste ciclo e não pode ser tirado dele.' using errcode = 'P0001';
  end if;
  return old;
end $function$
;

CREATE OR REPLACE FUNCTION public._guard_section_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if public._section_used(old.id, null) then
    raise exception 'Este naipe tem (ou teve) integrantes e não pode ser excluído.' using errcode = 'P0001';
  end if;
  return old;
end $function$
;

CREATE OR REPLACE FUNCTION public._instrument_used(p_inst uuid, p_cycle uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (select 1 from public.cycle_participations cp where cp.instrument_id = p_inst and (p_cycle is null or cp.cycle_id = p_cycle))
      or exists (select 1 from public.staff_assignments a where a.instrument_id = p_inst and (p_cycle is null or a.cycle_id = p_cycle))
      or exists (select 1 from public.member_artistic_links l where l.instrument_id = p_inst
                 and (p_cycle is null or (l.ended_at is null and exists (select 1 from public.cycles c where c.id = p_cycle and c.is_current))))
$function$
;

CREATE OR REPLACE FUNCTION public._purge_old_submissions(p_org uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_paths text[]; v_ids uuid[];
begin
  select array_agg(id) into v_ids from public.form_submissions
   where organization_id = p_org and purged_at is null and status <> 'approved'
     and ((status in ('rejected', 'archived') and coalesce(reviewed_at, submitted_at) < now() - interval '12 months')
       or (status = 'pending' and submitted_at < now() - interval '6 months'));
  if v_ids is null then return '{}'; end if;
  select array_agg(storage_path) into v_paths from public.form_submission_files where submission_id = any (v_ids);
  delete from public.form_submission_files where submission_id = any (v_ids);
  update public.form_submissions set answers = '{}'::jsonb, applicant_email = null, dedupe_key = null, reviewer_notes = null, purged_at = now(),
         status = case when status = 'pending' then 'archived' else status end where id = any (v_ids);
  insert into public.audit_logs (organization_id, actor_user_id, actor_member_id, action, entity_type, new_data)
  values (p_org, auth.uid(), public.current_member_id(p_org), 'submissions_purged', 'form_submissions', jsonb_build_object('count', cardinality(v_ids)));
  return coalesce(v_paths, '{}');
end $function$
;

CREATE OR REPLACE FUNCTION public._section_used(p_sec uuid, p_cycle uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (select 1 from public.instruments i where i.section_id = p_sec and public._instrument_used(i.id, p_cycle))
      or exists (select 1 from public.staff_assignments a where a.section_id = p_sec and (p_cycle is null or a.cycle_id = p_cycle))
$function$
;

CREATE OR REPLACE FUNCTION public._set_cycle_from_date()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_day date;
begin
  if new.cycle_id is null then
    v_day := coalesce((to_jsonb(new) ->> tg_argv[0])::timestamptz::date, (to_jsonb(new) ->> 'created_at')::timestamptz::date, current_date);
    new.cycle_id := public._cycle_on((to_jsonb(new) ->> 'organization_id')::uuid, v_day);
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public._viewer_section(p_member uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(
    (select i.section_id from public.member_artistic_links l join public.instruments i on i.id = l.instrument_id
      where l.member_id = p_member and l.ended_at is null order by l.is_primary desc, l.created_at limit 1),
    (select coalesce(a.section_id, i.section_id) from public.staff_assignments a left join public.instruments i on i.id = a.instrument_id
      where a.member_id = p_member and a.valid_to is null and coalesce(a.section_id, i.section_id) is not null order by a.created_at limit 1))
$function$
;

CREATE OR REPLACE FUNCTION public.active_director_count(p_org uuid, p_except_member uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select count(distinct mar.member_id)::int
  from public.member_access_roles mar
  join public.access_roles ar on ar.id = mar.access_role_id and ar.key in ('direcao', 'titular')
  join public.members m on m.id = mar.member_id and m.archived_at is null
  where mar.organization_id = p_org and mar.revoked_at is null and (p_except_member is null or mar.member_id <> p_except_member)
$function$
;

CREATE OR REPLACE FUNCTION public.activities_set_slot()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.recurrence_rule_id is not null and new.recurrence_slot is null then
    new.recurrence_slot := new.activity_date;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.add_checklist_item(p_activity uuid, p_title text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.activities; v_id uuid;
begin
  select * into a from public.activities where id = p_activity;
  if a.id is null or not public.has_permission(a.organization_id, 'events.manage') then
    raise exception 'Sem permissão para alterar o checklist.' using errcode = '42501';
  end if;
  insert into public.activity_checklist_items (organization_id, activity_id, title, sort_order)
  values (a.organization_id, p_activity, trim(p_title),
          (select coalesce(max(sort_order), 0) + 1 from public.activity_checklist_items where activity_id = p_activity))
  returning id into v_id;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.adjust_charge(p_charge uuid, p_new_amount numeric, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.monthly_charges;
begin
  select * into c from public.monthly_charges where id = p_charge;
  if c.id is null then raise exception 'Cobrança não encontrada.' using errcode = 'P0002'; end if;
  perform public.require_billing(c.organization_id);
  if c.status not in ('pending', 'exempt') then raise exception 'Só é possível ajustar cobranças pendentes ou isentas.' using errcode = 'P0001'; end if;
  if p_new_amount is null or p_new_amount < 0 then raise exception 'Informe um valor maior ou igual a zero.' using errcode = '22003'; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'Informe o motivo do ajuste.' using errcode = '22023'; end if;
  insert into public.charge_adjustments (organization_id, charge_id, original_amount, new_amount, reason, adjusted_by)
  values (c.organization_id, c.id, c.final_amount, p_new_amount, trim(p_reason), public.current_member_id(c.organization_id));
  update public.monthly_charges set final_amount = p_new_amount, manual_adjustment = true,
         status = case when p_new_amount = 0 then 'exempt' else 'pending' end,
         pay_code = null, pay_link_url = null,
         pay_ref = case when c.pay_code is null then pay_ref
                        else coalesce(pay_ref, '{}'::jsonb) || jsonb_build_object('old_codes',
                               coalesce(pay_ref -> 'old_codes', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('code', c.pay_code, 'amount', c.final_amount, 'until', now()))) end
   where id = p_charge;
end $function$
;

CREATE OR REPLACE FUNCTION public.apply_checklist_template(p_activity uuid, p_template uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.activities; n int; v_max int; v_name text;
begin
  select * into a from public.activities where id = p_activity;
  if a.id is null or not public.has_permission(a.organization_id, 'events.manage') then
    raise exception 'Sem permissão para alterar o checklist.' using errcode = '42501';
  end if;
  select name into v_name from public.checklist_templates where id = p_template and organization_id = a.organization_id and is_active;
  if v_name is null then
    raise exception 'Modelo inválido.' using errcode = 'P0002';
  end if;
  select coalesce(max(sort_order), 0) into v_max from public.activity_checklist_items where activity_id = p_activity;
  insert into public.activity_checklist_items (organization_id, activity_id, source_template_item_id, title, description, sort_order)
  select a.organization_id, p_activity, i.id, i.title, i.description, v_max + row_number() over (order by i.sort_order, i.title)
  from public.checklist_template_items i
  where i.template_id = p_template and i.is_active
    and not exists (select 1 from public.activity_checklist_items x where x.activity_id = p_activity and x.source_template_item_id = i.id and x.is_active);
  get diagnostics n = row_count;
  update public.activities set checklist_name = v_name where id = p_activity and checklist_name is null;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.approve_submission(p_id uuid, p_notes text DEFAULT NULL::text, p_cycle_status text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s public.form_submissions; f public.forms; v public.form_versions; fld jsonb; mp text; ans jsonb;
  m_full text; m_display text; m_email text; m_phone text; m_social text; m_birth date; m_aff text; m_played boolean := false; m_other text; m_extra jsonb := '{}'::jsonb;
  s_gender text; s_trans boolean; s_race text; s_pcd boolean; s_pcd_desc text; l_inst uuid; l_func uuid; l_level uuid; v_member uuid; v_has_sens boolean := false;
  function_ans text;
begin
  select * into s from public.form_submissions where id = p_id;
  if s.id is null or not public.has_permission(s.organization_id, 'forms.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if s.status = 'approved' then raise exception 'Inscrição já aprovada.' using errcode = 'P0001'; end if;
  select * into f from public.forms where id = s.form_id;
  select * into v from public.form_versions where id = s.form_version_id;
  if s.member_id is not null then return public._approve_renewal(p_id, p_notes, p_cycle_status); end if;
  ans := s.answers;

  for fld in select * from jsonb_array_elements(v.snapshot -> 'fields') loop
    mp := fld ->> 'mapping';
    continue when mp is null or not (ans ? (fld ->> 'key'));
    function_ans := ans ->> (fld ->> 'key');
    case mp
      when 'member.full_name' then m_full := function_ans;
      when 'member.display_name' then m_display := function_ans;
      when 'member.email' then m_email := function_ans;
      when 'member.phone' then m_phone := function_ans;
      when 'member.social_handle' then m_social := function_ans;
      when 'member.birth_date' then m_birth := function_ans::date;
      when 'member.affective_relation' then m_aff := function_ans;
      when 'member.played_other_blocks' then m_played := (function_ans = 'yes');
      when 'member.other_blocks' then m_other := function_ans;
      when 'member.custom' then m_extra := m_extra || jsonb_build_object(fld ->> 'label', function_ans);
      when 'sensitive.gender' then s_gender := function_ans; v_has_sens := true;
      when 'sensitive.is_trans' then s_trans := (function_ans = 'yes'); v_has_sens := true;
      when 'sensitive.race_color' then s_race := function_ans; v_has_sens := true;
      when 'sensitive.is_pcd' then s_pcd := (function_ans = 'yes'); v_has_sens := true;
      when 'sensitive.pcd_description' then s_pcd_desc := function_ans; v_has_sens := true;
      when 'link.instrument' then l_inst := (case when function_ans ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then function_ans::uuid end);
      when 'link.function' then l_func := (case when function_ans ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then function_ans::uuid end);
      when 'link.skill_level' then l_level := (case when function_ans ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then function_ans::uuid end);
      else null;
    end case;
  end loop;
  if m_other is not null and btrim(m_other) <> '' then m_played := true; end if;
  if m_email is null and s.applicant_email is not null then m_email := s.applicant_email; end if;
  if m_full is null or length(trim(m_full)) = 0 then
    raise exception 'Este formulário não tem um campo de nome completo ligado ao cadastro; não é possível converter.' using errcode = 'P0001';
  end if;
  if m_email is not null and exists (select 1 from public.members where organization_id = s.organization_id and lower(email) = lower(m_email) and archived_at is null) then
    raise exception 'Já existe um integrante ativo com este e-mail. Rejeite ou arquive esta inscrição.' using errcode = '23505';
  end if;

  insert into public.members (organization_id, full_name, display_name, email, phone, social_handle, birth_date, joined_at, affective_relation, played_other_blocks, other_blocks, extra_info)
  values (s.organization_id, trim(m_full), nullif(trim(m_display), ''), lower(m_email), m_phone, nullif(trim(m_social), ''), m_birth, current_date, nullif(trim(m_aff), ''), m_played, nullif(trim(m_other), ''), m_extra)
  returning id into v_member;
  if coalesce(s.applicant_email, lower(m_email)) is not null and (case when p_cycle_status = 'waitlist' then f.waitlist_enabled else f.approved_enabled end) then
    insert into public.form_email_outbox (organization_id, submission_id, member_id, template, to_email)
    values (s.organization_id, s.id, v_member, case when p_cycle_status = 'waitlist' then 'submission_waitlist' else 'submission_approved' end, coalesce(s.applicant_email, lower(m_email))) on conflict do nothing;
  end if;
  if v_has_sens then
    insert into public.member_sensitive_data (member_id, organization_id, gender, is_trans, race_color, is_pcd, pcd_description)
    values (v_member, s.organization_id, s_gender, s_trans, s_race, s_pcd, case when s_pcd then s_pcd_desc end);
  end if;
  if l_inst is not null then
    insert into public.member_artistic_links (organization_id, member_id, instrument_id, skill_level_id, is_primary)
    values (s.organization_id, v_member, l_inst, l_level, true);
  end if;
  if l_func is not null and not public._apply_principal_category(s.organization_id, v_member, l_func) then
    insert into public.member_artistic_links (organization_id, member_id, function_id, is_primary) values (s.organization_id, v_member, l_func, false);
  end if;
  if s.consent_given then
    insert into public.consent_records (organization_id, member_id, purpose, text_version) values (s.organization_id, v_member, 'inscricao', v.id::text);
  end if;
  if p_cycle_status is not null and f.cycle_id is not null then
    perform public.set_member_cycle_status(v_member, f.cycle_id, p_cycle_status, null, case when p_cycle_status = 'waitlist' then l_inst end);
  end if;
  update public.form_submissions set status = 'approved', member_id = v_member, reviewer_notes = coalesce(nullif(trim(p_notes), ''), reviewer_notes),
         reviewed_by = public.current_member_id(s.organization_id), reviewed_at = now() where id = p_id;
  insert into public.audit_logs (organization_id, actor_user_id, actor_member_id, action, entity_type, entity_id, new_data)
  values (s.organization_id, auth.uid(), public.current_member_id(s.organization_id), 'submission_approved', 'form_submissions', p_id::text, jsonb_build_object('member_id', v_member));
  return v_member;
end $function$
;

CREATE OR REPLACE FUNCTION public.attendance_report_f(p_org uuid, p_from date, p_to date, p_group text, p_section uuid DEFAULT NULL::uuid, p_instrument uuid DEFAULT NULL::uuid, p_month text DEFAULT NULL::text)
 RETURNS TABLE(group_id uuid, label text, sort_key text, records bigint, present bigint, pct numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
begin
  if p_group not in ('member', 'activity', 'month', 'instrument', 'section') then
    raise exception 'Agrupamento inválido.' using errcode = '22023';
  end if;
  if p_group = 'member' then
    return query select m.id, coalesce(m.display_name, m.full_name), lower(coalesce(m.display_name, m.full_name)), count(*), count(*) filter (where b.present),
      round(100.0 * count(*) filter (where b.present) / count(*), 1)
    from public._att_filtered(p_org, p_from, p_to, p_section, p_instrument, p_month) b join public.members m on m.id = b.member_id group by m.id;
  elsif p_group = 'activity' then
    return query select b.activity_id, b.title || ' · ' || to_char(b.activity_date, 'DD/MM/YYYY'), to_char(b.activity_date, 'YYYY-MM-DD'), count(*), count(*) filter (where b.present),
      round(100.0 * count(*) filter (where b.present) / count(*), 1)
    from public._att_filtered(p_org, p_from, p_to, p_section, p_instrument, p_month) b group by b.activity_id, b.title, b.activity_date;
  elsif p_group = 'month' then
    return query select null::uuid, to_char(date_trunc('month', b.activity_date), 'MM/YYYY'), to_char(date_trunc('month', b.activity_date), 'YYYY-MM'), count(*), count(*) filter (where b.present),
      round(100.0 * count(*) filter (where b.present) / count(*), 1)
    from public._att_filtered(p_org, p_from, p_to, p_section, p_instrument, p_month) b group by date_trunc('month', b.activity_date);
  elsif p_group = 'instrument' then
    return query select i.id, i.name, lower(i.name), count(*), count(*) filter (where b.present),
      round(100.0 * count(*) filter (where b.present) / count(*), 1)
    from public._att_filtered(p_org, p_from, p_to, p_section, p_instrument, p_month) b
    join public.member_artistic_links l on l.member_id = b.member_id and l.ended_at is null
    join public.instruments i on i.id = l.instrument_id
    where (p_section is null or i.section_id = p_section) and (p_instrument is null or i.id = p_instrument)
    group by i.id, i.name;
  else
    return query select s.id, s.name, lower(s.name), count(*), count(*) filter (where b.present),
      round(100.0 * count(*) filter (where b.present) / count(*), 1)
    from public._att_filtered(p_org, p_from, p_to, p_section, p_instrument, p_month) b
    join public.member_artistic_links l on l.member_id = b.member_id and l.ended_at is null
    join public.instruments i on i.id = l.instrument_id join public.sections s on s.id = i.section_id
    where (p_section is null or s.id = p_section) and (p_instrument is null or i.id = p_instrument)
    group by s.id, s.name;
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.audit_mask(p_data jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case when p_data is null or jsonb_typeof(p_data) <> 'object' then p_data else (
    select coalesce(jsonb_object_agg(e.key,
             case when e.key = any (array['email', 'customer_email', 'contact_email', 'mail_from_email',
                                          'phone', 'customer_phone', 'contact_phone', 'contact_whatsapp',
                                          'key_value', 'pix_key', 'pix_key_snapshot', 'birth_date'])
                       and jsonb_typeof(e.value) = 'string'
                  then to_jsonb(public.audit_mask_value(e.key, e.value #>> '{}'))
                  else e.value end), '{}'::jsonb)
      from jsonb_each(p_data) e) end
$function$
;

CREATE OR REPLACE FUNCTION public.audit_mask_value(p_key text, p_val text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when p_val is null or p_val = '' then p_val
    when p_val like '***%' or p_val ~ '^.\*\*\*@' then p_val -- já mascarado
    when p_key in ('email', 'customer_email', 'contact_email', 'mail_from_email') and position('@' in p_val) > 1
      then left(p_val, 1) || '***@' || split_part(p_val, '@', 2)
    when p_key in ('phone', 'customer_phone', 'contact_phone', 'contact_whatsapp')
      then '***' || right(regexp_replace(p_val, '\D', '', 'g'), 4)
    -- chave Pix (pode ser CPF), data de nascimento: só um resumo curto, que mostra que mudou sem revelar o valor
    else '***' || left(md5(p_val), 4)
  end
$function$
;

CREATE OR REPLACE FUNCTION public.backup_remap_ids(p_table text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare v_rel regclass; v_keys text[]; v_pred text; v_cond text; v_rows jsonb := p_rows;
begin
  if jsonb_typeof(p_rows) <> 'array' then return p_rows; end if;
  v_rel := ('public.' || quote_ident(p_table))::regclass;
  -- Tabela referenciada por outra, ou sem coluna id: trocar o id quebraria vínculos; fica como está.
  if exists (select 1 from pg_constraint where contype = 'f' and confrelid = v_rel)
     or not exists (select 1 from pg_attribute where attrelid = v_rel and attname = 'id' and not attisdropped) then
    return p_rows;
  end if;
  -- Cada chave única "natural" (colunas simples, sem o id). Índice parcial (ex.: "uma atribuição aberta por pessoa"):
  -- a condição tem de valer tanto na linha atual quanto na do backup.
  for v_keys, v_pred in
    select array_agg(a.attname::text order by k.ord), pg_get_expr(i.indpred, i.indrelid)
      from pg_index i
      cross join lateral unnest(i.indkey::int2[]) with ordinality k(attnum, ord)
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
     where i.indrelid = v_rel and i.indisunique and not i.indisprimary and i.indexprs is null
     group by i.indexrelid, i.indpred, i.indrelid
    having not ('id' = any (array_agg(a.attname::text)))
  loop
    select string_agg(format('x.%1$I::text = r ->> %1$L', c), ' and ') into v_cond from unnest(v_keys) c;
    if v_pred is not null then
      v_cond := v_cond || format(' and (%1$s) and exists (select 1 from jsonb_populate_record(null::public.%2$I, r) where %1$s)', v_pred, p_table);
    end if;
    execute format('select coalesce(jsonb_agg(case when x.id is not null then r || jsonb_build_object(''id'', x.id) else r end), ''[]''::jsonb)
                      from jsonb_array_elements($1) r
                      left join lateral (select x.id from public.%1$I x where %2$s and x.id::text <> r ->> ''id'' limit 1) x on true',
                   p_table, v_cond) into v_rows using v_rows;
  end loop;
  return v_rows;
end $function$
;

CREATE OR REPLACE FUNCTION public.backup_table_order()
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare remaining text[]; ordered text[] := '{}'; progress boolean; t text;
begin
  select coalesce(array_agg(c.relname::text order by c.relname), '{}') into remaining
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'organization_id' and not a.attisdropped)
     and c.relname::text <> all (array['backups', 'audit_logs', 'member_invites', 'form_upload_tokens', 'shop_email_outbox', 'integrations']);
  loop
    exit when coalesce(array_length(remaining, 1), 0) = 0;
    progress := false;
    foreach t in array remaining loop
      -- Só contam as dependências obrigatórias: chave estrangeira com coluna opcional (fora organization_id) pode ser preenchida depois.
      if not exists (
        select 1 from pg_constraint k join pg_class p on p.oid = k.confrelid
         where k.conrelid = ('public.' || quote_ident(t))::regclass and k.contype = 'f' and k.confrelid <> k.conrelid
           and p.relname::text = any(remaining) and p.relname::text <> t
           and not exists (select 1 from unnest(k.conkey) ck join pg_attribute fa on fa.attrelid = k.conrelid and fa.attnum = ck where fa.attname <> 'organization_id' and not fa.attnotnull)
      ) then
        ordered := ordered || t; remaining := array_remove(remaining, t); progress := true;
      end if;
    end loop;
    if not progress then ordered := ordered || remaining; exit; end if;
  end loop;
  return ordered;
end $function$
;

CREATE OR REPLACE FUNCTION public.backup_upgrade_tables(p_tables jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare v jsonb := p_tables;
begin
  -- 20261119000003/06 (categorias por naipe): no ciclo atual e nos futuros, categoria de outro naipe é barrada.
  -- Atribuição antiga em categoria de outro naipe passa para a categoria do mesmo Tipo do naipe da pessoa (o que a reclassificação fez).
  if jsonb_typeof(v -> 'cycle_fee_assignments') = 'array' then
    v := jsonb_set(v, '{cycle_fee_assignments}', (
      select coalesce(jsonb_agg(case when alt.id is not null then jsonb_set(fa, '{fee_category_id}', to_jsonb(alt.id)) else fa end), '[]'::jsonb)
        from jsonb_array_elements(v -> 'cycle_fee_assignments') fa
        left join public.cycles cy on cy.id = (fa ->> 'cycle_id')::uuid and cy.ends_on >= current_date
        left join public.fee_categories fc on fc.id = (fa ->> 'fee_category_id')::uuid and cy.id is not null
        left join lateral (
          select coalesce(array_agg(distinct coalesce(i.section_id, af.section_id)) filter (where coalesce(i.section_id, af.section_id) is not null), '{}') as secs
            from jsonb_array_elements(coalesce(v -> 'cycle_participations', '[]'::jsonb)) cp
            left join public.instruments i on i.id = (cp ->> 'instrument_id')::uuid
            left join public.artistic_functions af on af.id = (cp ->> 'function_id')::uuid
           where cp ->> 'member_id' = fa ->> 'member_id' and cp ->> 'cycle_id' = fa ->> 'cycle_id') ms on fc.id is not null
        left join lateral (
          select x.id from public.fee_categories x
           where fc.section_id is not null and fc.base_key is not null and cardinality(ms.secs) > 0 and not (fc.section_id = any (ms.secs))
             and x.organization_id = fc.organization_id and x.base_key = fc.base_key and x.section_id = any (ms.secs)
           order by x.name limit 1) alt on true));
  end if;
  -- 20261113000003_function_kinds: kind 'artistic' virou 'collab' (Regência) ou 'payer' (demais).
  if jsonb_typeof(v -> 'artistic_functions') = 'array' then
    v := jsonb_set(v, '{artistic_functions}', (
      select coalesce(jsonb_agg(case when f ->> 'kind' = 'artistic'
                                     then jsonb_set(f, '{kind}', to_jsonb(case when lower(f ->> 'name') in ('regência', 'regencia') then 'collab' else 'payer' end))
                                     else f end), '[]'::jsonb)
        from jsonb_array_elements(v -> 'artistic_functions') f));
  end if;
  return v;
end $function$
;

CREATE OR REPLACE FUNCTION public.begin_form_upload(p_org_slug text, p_form_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare f public.forms; v_token uuid;
begin
  select f2.* into f from public.forms f2 join public.organizations o on o.id = f2.organization_id and o.is_active
   where o.slug = p_org_slug and f2.slug = p_form_slug and f2.status = 'published';
  if f.id is null or public._form_state(f) <> 'open' then raise exception 'Este formulário não está aberto para envio.' using errcode = 'P0001'; end if;
  if (select count(*) from public.form_upload_tokens where form_id = f.id and created_at > now() - interval '1 hour') >= 300 then
    raise exception 'Muitas tentativas. Aguarde um pouco e tente novamente.' using errcode = 'P0001';
  end if;
  insert into public.form_upload_tokens (organization_id, form_id) values (f.organization_id, f.id) returning token into v_token;
  return jsonb_build_object('token', v_token, 'organization_id', f.organization_id);
end $function$
;

CREATE OR REPLACE FUNCTION public.billing_member_fee(p_member uuid, p_cycle uuid)
 RETURNS TABLE(fee_category_id uuid, category_name text, base_amount numeric, percent numeric, exempt_by text, paid_by text, is_active boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select fa.fee_category_id, fc.name,
         (select p.amount from public.fee_cycle_prices p where p.fee_category_id = fa.fee_category_id and p.cycle_id = p_cycle),
         coalesce((select s.percent from public.cycle_scholarships s where s.member_id = p_member and s.cycle_id = p_cycle), 0),
         (select af.name from public.cycle_participations cp join public.artistic_functions af on af.id = cp.function_id
           where cp.member_id = p_member and cp.cycle_id = p_cycle
             and (af.exempt_locked or coalesce((select e.is_exempt from public.fee_cycle_exempt e where e.function_id = af.id and e.cycle_id = p_cycle), af.is_exempt))
           order by af.name limit 1),
         (select af.name from public.cycle_participations cp join public.artistic_functions af on af.id = cp.function_id
           where cp.member_id = p_member and cp.cycle_id = p_cycle and cp.is_paid
           order by af.name limit 1),
         exists (select 1 from public.member_cycles mc join public.member_cycle_statuses st on st.id = mc.status_id and st.counts_as_active
                  where mc.member_id = p_member and mc.cycle_id = p_cycle)
    from (select 1) x
    left join public.cycle_fee_assignments fa on fa.member_id = p_member and fa.cycle_id = p_cycle
    left join public.fee_categories fc on fc.id = fa.fee_category_id
$function$
;

CREATE OR REPLACE FUNCTION public.birthday_list(p_org uuid)
 RETURNS TABLE(member_id uuid, full_name text, display_name text, month_day text, birth_year integer, is_org boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_staff boolean;
begin
  if not public.is_org_member(p_org) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  v_staff := coalesce(public.is_staff(p_org), false);
  if v_staff then
    -- Equipe e Direção: todos os cadastros, com nome completo e ano.
    return query
      select m.id, m.full_name, m.display_name, to_char(m.birth_date, 'MM-DD'), extract(year from m.birth_date)::int, false
        from public.members m
       where m.organization_id = p_org and m.archived_at is null and m.birth_date is not null;
  else
    -- Integrante: só quem está ativo no ciclo atual, pelo nome de exibição (ou primeiro nome), sem o ano.
    return query
      select m.id, n.name, n.name, to_char(m.birth_date, 'MM-DD'), null::int, false
        from public.members m
        cross join lateral (select coalesce(nullif(btrim(m.display_name), ''), split_part(btrim(m.full_name), ' ', 1)) as name) n
       where m.organization_id = p_org and m.archived_at is null and m.birth_date is not null
         and exists (select 1 from public.member_cycles mc
                       join public.cycles c on c.id = mc.cycle_id and c.is_current
                       join public.member_cycle_statuses s on s.id = mc.status_id and s.counts_as_active
                      where mc.member_id = m.id);
  end if;
  -- Aniversário do bloco (data de fundação): o ano aparece para todos.
  return query
    select null::uuid, o.name, null::text, to_char(o.founded_on, 'MM-DD'), extract(year from o.founded_on)::int, true
      from public.organizations o where o.id = p_org and o.founded_on is not null;
end $function$
;

CREATE OR REPLACE FUNCTION public.bloco_links(p_phone text, p_email text, p_social text, p_existing jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare fresh jsonb := '[]'::jsonb; res jsonb := '[]'::jsonb; line text; k text; d text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'); e jsonb; f jsonb;
begin
  if d <> '' then fresh := fresh || jsonb_build_array(jsonb_build_object('kind', 'whatsapp', 'label', '', 'value', d)); end if;
  for line in select btrim(x) from regexp_split_to_table(coalesce(p_social, ''), chr(10)) x loop
    continue when line = '';
    k := case when line ~* 'instagram[.]com' then 'instagram' when line ~* 'youtu[.]?be' then 'youtube' when line ~* 'facebook[.]com' then 'facebook'
              when line ~* 'tiktok[.]com' then 'tiktok' when line ~* 'spotify[.]com' then 'spotify' when line ~* '(x|twitter)[.]com' then 'x'
              when line ~* 'linkedin[.]com' then 'linkedin' else 'site' end;
    fresh := fresh || jsonb_build_array(jsonb_build_object('kind', k, 'label', '', 'value', line));
  end loop;
  if nullif(btrim(coalesce(p_email, '')), '') is not null then fresh := fresh || jsonb_build_array(jsonb_build_object('kind', 'email', 'label', '', 'value', lower(btrim(p_email)))); end if;
  -- Mantém a ordem e o "oculto" que o Site já tem; o que é novo entra no fim; o que saiu do perfil sai.
  for e in select * from jsonb_array_elements(coalesce(p_existing, '[]'::jsonb)) loop
    for f in select * from jsonb_array_elements(fresh) loop
      if f ->> 'kind' = e ->> 'kind' and f ->> 'value' = e ->> 'value' then
        res := res || jsonb_build_array(f || jsonb_build_object('hidden', coalesce((e ->> 'hidden')::boolean, false)));
        exit;
      end if;
    end loop;
  end loop;
  for f in select * from jsonb_array_elements(fresh) loop
    if not exists (select 1 from jsonb_array_elements(res) r where r ->> 'kind' = f ->> 'kind' and r ->> 'value' = f ->> 'value') then res := res || jsonb_build_array(f); end if;
  end loop;
  return res;
end $function$
;

CREATE OR REPLACE FUNCTION public.bootstrap_first_director(p_org_slug text, p_email text, p_full_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid; v_user uuid; v_member uuid; v_role uuid;
begin
  select id into v_org from public.organizations where slug = p_org_slug;
  if v_org is null then raise exception 'Organização não encontrada: %', p_org_slug; end if;
  select id into v_user from auth.users where lower(email) = lower(p_email);

  insert into public.members (organization_id, user_id, full_name, email)
  values (v_org, v_user, p_full_name, lower(p_email))
  returning id into v_member;

  select id into v_role from public.access_roles where organization_id = v_org and key = 'direcao';
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
  values (v_org, v_member, v_role);
  return v_member;
end $function$
;

CREATE OR REPLACE FUNCTION public.caller_has_role(p_org uuid, p_keys text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.members m
    join public.member_access_roles mar on mar.member_id = m.id and mar.revoked_at is null
    join public.access_roles ar on ar.id = mar.access_role_id and ar.key = any (p_keys)
    where m.organization_id = p_org and m.user_id = auth.uid() and m.archived_at is null
      and not public.member_is_inactive(m.id)
  )
$function$
;

CREATE OR REPLACE FUNCTION public.caller_is_titular(p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.member_access_roles mar
    join public.access_roles ar on ar.id = mar.access_role_id and ar.key = 'titular'
    join public.members m on m.id = mar.member_id and m.archived_at is null and m.user_id = auth.uid()
    where mar.organization_id = p_org and mar.revoked_at is null)
$function$
;

CREATE OR REPLACE FUNCTION public.can_decide_reactivation(p_org uuid, p_member uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (select 1 from public.members where id = p_member and organization_id = p_org)
     and (public.caller_has_role(p_org, array['titular', 'direcao'])
          or (public.caller_has_role(p_org, array['professor']) and public.is_in_my_group(p_org, p_member)))
$function$
;

CREATE OR REPLACE FUNCTION public.can_edit_member_photo(p_org uuid, p_member uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (select 1 from public.members m where m.id = p_member and m.organization_id = p_org and m.user_id = auth.uid() and m.archived_at is null)
      or public.has_permission(p_org, 'members.manage')
$function$
;

CREATE OR REPLACE FUNCTION public.can_read_member(p_org uuid, p_member uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.has_permission(p_org, 'members.read')
      or public.is_self(p_member)
      or (coalesce(public.permission_scope_of(p_org, 'members.read') = 'group', false)
          and public.is_in_my_group(p_org, p_member))
$function$
;

CREATE OR REPLACE FUNCTION public.can_record_attendance_for(p_org uuid, p_member uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    exists (
      select 1 from public.staff_assignments sa
      where sa.organization_id = p_org and sa.member_id = public.current_member_id(p_org)
        and sa.staff_kind = 'professor' and (sa.valid_to is null or sa.valid_to >= current_date)
        and sa.cycle_id = (select c.id from public.cycles c where c.organization_id = p_org and c.is_current limit 1))
    or exists (
      select 1 from public.staff_assignments sa
      left join public.instruments si on si.id = sa.instrument_id
      join public.member_artistic_links l on l.member_id = p_member and l.ended_at is null
      join public.instruments i on i.id = l.instrument_id
      where sa.organization_id = p_org and sa.member_id = public.current_member_id(p_org)
        and sa.staff_kind = 'monitor' and (sa.valid_to is null or sa.valid_to >= current_date)
        and sa.cycle_id = (select c.id from public.cycles c where c.organization_id = p_org and c.is_current limit 1)
        and i.section_id = coalesce(sa.section_id, si.section_id))
    or public.is_in_my_group(p_org, p_member)
$function$
;

CREATE OR REPLACE FUNCTION public.can_see_drive_folder(p_folder uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.drive_folders f
    join public.members m on m.organization_id = f.organization_id and m.user_id = auth.uid() and m.archived_at is null
    where f.id = p_folder and f.is_active and (
      exists (select 1 from public.member_access_roles mar join public.access_roles ar on ar.id = mar.access_role_id
               where mar.member_id = m.id and mar.revoked_at is null and ar.key in ('professor', 'monitor'))
      or exists (
        select 1 from public.drive_folder_access a where a.folder_id = f.id and (
          (a.access_role_id is not null and exists (
            select 1 from public.member_access_roles mar where mar.member_id = m.id and mar.revoked_at is null and mar.access_role_id = a.access_role_id))
          or (a.section_id is not null and exists (
            select 1 from public.member_artistic_links l join public.instruments i on i.id = l.instrument_id
             where l.member_id = m.id and l.ended_at is null and i.section_id = a.section_id))
          or (a.instrument_id is not null and exists (
            select 1 from public.member_artistic_links l where l.member_id = m.id and l.ended_at is null and l.instrument_id = a.instrument_id))))
    )
  )
$function$
;

CREATE OR REPLACE FUNCTION public.can_upload_form_file(p_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.form_upload_tokens t
    where t.token::text = split_part(p_name, '/', 2)
      and t.organization_id::text = split_part(p_name, '/', 1)
      and t.expires_at > now() and t.used_at is null
      and (select count(*) from storage.objects o where o.bucket_id = 'form-uploads' and o.name like t.organization_id::text || '/' || t.token::text || '/%') < 10)
$function$
;

CREATE OR REPLACE FUNCTION public.cancel_financial_entry(p_entry uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.financial_entries;
begin
  select * into e from public.financial_entries where id = p_entry;
  if e.id is null then raise exception 'Lançamento não encontrado.' using errcode = 'P0002'; end if;
  perform public.require_finance(e.organization_id);
  if e.status <> 'posted' then raise exception 'Este lançamento já foi cancelado.' using errcode = 'P0001'; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'Informe o motivo do cancelamento.' using errcode = '22023'; end if;
  update public.financial_entries set status = 'cancelled', cancelled_at = now(), cancelled_by = public.current_member_id(e.organization_id),
         cancel_reason = trim(p_reason) where id = p_entry;
end $function$
;

CREATE OR REPLACE FUNCTION public.cancel_staff_payment(p_payment uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.staff_payments;
begin
  select * into p from public.staff_payments where id = p_payment;
  if p.id is null then raise exception 'Pagamento não encontrado.' using errcode = 'P0002'; end if;
  perform public.require_finance(p.organization_id, 'staff_payments.manage');
  if p.status = 'cancelled' then raise exception 'Este pagamento já foi cancelado.' using errcode = 'P0001'; end if;
  update public.staff_payments set status = 'cancelled', notes = coalesce(nullif(trim(p_reason), ''), notes) where id = p_payment;
end $function$
;

CREATE OR REPLACE FUNCTION public.capacity_zero_is_infinite()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  delete from public.instrument_cycle_capacity where instrument_id = new.instrument_id and cycle_id = new.cycle_id and capacity = 0;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.carry_member_fee_to_cycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_prev uuid; v_cat uuid;
begin
  if not exists (select 1 from public.cycles c where c.id = new.cycle_id and c.is_current) then return null; end if;
  if exists (select 1 from public.cycle_fee_assignments where member_id = new.member_id and cycle_id = new.cycle_id) then return null; end if;
  select fa.cycle_id, fa.fee_category_id into v_prev, v_cat
    from public.cycle_fee_assignments fa join public.cycles c on c.id = fa.cycle_id
   where fa.member_id = new.member_id and c.starts_on < (select starts_on from public.cycles where id = new.cycle_id)
   order by c.starts_on desc limit 1;
  if v_prev is null then return null; end if;
  begin
    insert into public.cycle_fee_assignments (organization_id, member_id, cycle_id, fee_category_id)
    values (new.organization_id, new.member_id, new.cycle_id, v_cat);
  exception when raise_exception then
    return null;
  end;
  insert into public.cycle_scholarships (organization_id, member_id, cycle_id, percent, reason, scholarship_type_id)
  select s.organization_id, s.member_id, new.cycle_id, s.percent, s.reason, s.scholarship_type_id
    from public.cycle_scholarships s where s.member_id = new.member_id and s.cycle_id = v_prev
  on conflict do nothing;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.change_charge_status(p_charge uuid, p_status text, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.monthly_charges;
begin
  select * into c from public.monthly_charges where id = p_charge;
  if c.id is null then raise exception 'Cobrança não encontrada.' using errcode = 'P0002'; end if;
  perform public.require_billing(c.organization_id);
  if p_status = 'cancelled' and c.status in ('pending', 'exempt') then
    update public.monthly_charges set status = 'cancelled', notes = coalesce(nullif(trim(p_notes), ''), notes) where id = p_charge;
  elsif p_status = 'pending' and c.status in ('paid', 'cancelled') then
    update public.monthly_charges set status = case when final_amount = 0 then 'exempt' else 'pending' end,
           paid_on = null, payment_method = null, notes = coalesce(nullif(trim(p_notes), ''), notes) where id = p_charge;
  else
    raise exception 'Mudança de status não permitida.' using errcode = 'P0001';
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.charge_for_payment(p_code text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object('id', c.id, 'status', c.status, 'amount_cents', round(c.final_amount * 100)::int,
                            'handle', (select s.infinitepay_handle from public.shop_settings s where s.organization_id = c.organization_id))
    from public.monthly_charges c where c.id = public._charge_by_pay_code(p_code)
$function$
;

CREATE OR REPLACE FUNCTION public.charge_mark_paid_by_link(p_code text, p_ref jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.monthly_charges;
begin
  select * into c from public.monthly_charges where id = public._charge_by_pay_code(p_code) for update;
  if c.id is null then return jsonb_build_object('ok', false, 'reason', 'unknown'); end if;
  if c.status = 'paid' then return jsonb_build_object('ok', true, 'already', true); end if;
  if c.status <> 'pending' then
    update public.monthly_charges set pay_ref = coalesce(pay_ref, '{}'::jsonb) || coalesce(p_ref, '{}'::jsonb) || jsonb_build_object('paid_while', c.status) where id = c.id;
    return jsonb_build_object('ok', false, 'reason', c.status);
  end if;
  update public.monthly_charges
     set status = 'paid', paid_on = (now() at time zone coalesce((select timezone from public.organizations where id = c.organization_id), 'America/Sao_Paulo'))::date,
         payment_method = 'InfinitePay', pay_ref = coalesce(pay_ref, '{}'::jsonb) || coalesce(p_ref, '{}'::jsonb)
   where id = c.id;
  return jsonb_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.charge_note_divergence(p_code text, p_ref jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid := public._charge_by_pay_code(p_code);
begin
  if v_id is null then return; end if;
  update public.monthly_charges
     set pay_ref = coalesce(pay_ref, '{}'::jsonb) || jsonb_build_object('divergences',
           coalesce(pay_ref -> 'divergences', '[]'::jsonb) || jsonb_build_array(coalesce(p_ref, '{}'::jsonb) || jsonb_build_object('code', upper(trim(p_code)), 'at', now())))
   where id = v_id
     and not exists (select 1 from jsonb_array_elements(coalesce(pay_ref -> 'divergences', '[]'::jsonb)) d
                      where d ->> 'transaction_nsu' is not null and d ->> 'transaction_nsu' = p_ref ->> 'transaction_nsu');
end $function$
;

CREATE OR REPLACE FUNCTION public.charge_pay_info(p_charge uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.monthly_charges; code text; s record; m record; o record;
begin
  select * into c from public.monthly_charges where id = p_charge;
  if c.id is null then raise exception 'Cobrança não encontrada.' using errcode = 'P0002'; end if;
  perform public.require_billing(c.organization_id);
  if c.status <> 'pending' then raise exception 'Só cobranças pendentes têm link de pagamento.' using errcode = 'P0001'; end if;
  if c.final_amount <= 0 then raise exception 'Cobrança sem valor.' using errcode = 'P0001'; end if;
  code := c.pay_code;
  if code is null then
    loop
      code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
      exit when not exists (select 1 from public.monthly_charges where pay_code = code);
    end loop;
    update public.monthly_charges set pay_code = code where id = c.id;
  end if;
  select infinitepay_handle, public_site_url into s from public.shop_settings where organization_id = c.organization_id;
  select coalesce(display_name, full_name) as display_name into m from public.members where id = c.member_id;
  select slug into o from public.organizations where id = c.organization_id;
  return jsonb_build_object('code', code, 'amount_cents', round(c.final_amount * 100)::int, 'competence', c.competence, 'member_name', m.display_name,
    'org_slug', o.slug, 'handle', s.infinitepay_handle, 'public_site_url', s.public_site_url, 'pay_link_url', c.pay_link_url);
end $function$
;

CREATE OR REPLACE FUNCTION public.charge_set_pay_link(p_charge uuid, p_url text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.monthly_charges;
begin
  select * into c from public.monthly_charges where id = p_charge;
  if c.id is null then raise exception 'Cobrança não encontrada.' using errcode = 'P0002'; end if;
  perform public.require_billing(c.organization_id);
  update public.monthly_charges set pay_link_url = p_url where id = p_charge;
end $function$
;

CREATE OR REPLACE FUNCTION public.clear_attendance(p_activity uuid, p_member uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_a public.activities; v_scope text; v_allowed boolean;
begin
  select * into v_a from public.activities where id = p_activity;
  if v_a.id is null then raise exception 'Evento não encontrado.' using errcode = 'P0002'; end if;
  v_scope := public.permission_scope_of(v_a.organization_id, 'attendance.record')::text;
  v_allowed := v_scope = 'org' or (v_scope = 'group' and public.can_record_attendance_for(v_a.organization_id, p_member));
  if not coalesce(v_allowed, false) then
    raise exception 'Você não tem permissão para registrar esta presença.' using errcode = '42501';
  end if;
  if v_a.status = 'cancelled' then raise exception 'Este evento foi cancelado.' using errcode = 'P0001'; end if;
  delete from public.event_attendance where activity_id = p_activity and member_id = p_member;
end $function$
;

CREATE OR REPLACE FUNCTION public.copy_cycle_setup(p_from uuid, p_to uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid; v_org2 uuid;
begin
  select organization_id into v_org from public.cycles where id = p_from;
  select organization_id into v_org2 from public.cycles where id = p_to;
  if v_org is null or v_org2 is null or v_org <> v_org2 then raise exception 'Ciclo não encontrado.' using errcode = 'P0002'; end if;
  if not (public.has_permission(v_org, 'structure.manage') and public.has_permission(v_org, 'staff_assignments.manage')) then
    raise exception 'Sem permissão para copiar a organização do ciclo.' using errcode = '42501';
  end if;
  insert into public.section_cycles (organization_id, section_id, cycle_id)
    select organization_id, section_id, p_to from public.section_cycles where cycle_id = p_from on conflict do nothing;
  insert into public.instrument_cycles (organization_id, instrument_id, cycle_id)
    select organization_id, instrument_id, p_to from public.instrument_cycles where cycle_id = p_from on conflict do nothing;
  insert into public.instrument_cycle_workshop (organization_id, instrument_id, cycle_id, has_workshop)
    select organization_id, instrument_id, p_to, has_workshop from public.instrument_cycle_workshop where cycle_id = p_from on conflict do nothing;
  insert into public.instrument_cycle_capacity (organization_id, instrument_id, cycle_id, capacity)
    select organization_id, instrument_id, p_to, capacity from public.instrument_cycle_capacity where cycle_id = p_from on conflict do nothing;
  insert into public.staff_assignments (organization_id, member_id, staff_kind, section_id, instrument_id, cycle_id)
    select sa.organization_id, sa.member_id, sa.staff_kind, sa.section_id, sa.instrument_id, p_to
      from public.staff_assignments sa where sa.cycle_id = p_from and sa.valid_to is null on conflict do nothing;
end $function$
;

CREATE OR REPLACE FUNCTION public.create_backup(p_org uuid, p_label text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.has_permission(p_org, 'backups.manage') then raise exception 'Sem permissão para criar backups.' using errcode = '42501'; end if;
  return public.make_backup(p_org, coalesce(nullif(trim(p_label), ''), 'Backup manual'), 'manual');
end $function$
;

CREATE OR REPLACE FUNCTION public.create_default_registration_form(p_org uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_form uuid; i int := 0;
  y jsonb := '[{"value":"yes","label":"Sim"},{"value":"no","label":"Não"}]';
begin
  select id into v_form from public.forms where organization_id = p_org and slug = 'inscricao';
  if v_form is not null then return v_form; end if;
  insert into public.forms (organization_id, title, description, slug, privacy_text)
  values (p_org, 'Inscrição de novos integrantes', 'Preencha seus dados para se inscrever. A Direção entrará em contato.', 'inscricao',
    'Usaremos seus dados apenas para analisar sua inscrição e, se aprovada, para o cadastro no bloco. Informações como gênero, cor/raça e deficiência são sensíveis, ficam restritas à Direção e não aparecem em listas ou relatórios comuns. Você pode pedir a correção ou exclusão dos seus dados a qualquer momento. (Texto-base: revise com assessoria jurídica antes de publicar.)')
  returning id into v_form;
  insert into public.form_fields (organization_id, form_id, field_key, label, field_type, required, sort_order, options, condition, member_mapping)
  select p_org, v_form, x.k, x.l, x.t, x.r, row_number() over (), coalesce(x.o, '[]'::jsonb), x.c, x.m
  from (values
    ('full_name', 'Nome completo', 'short_text', true, null::jsonb, null::jsonb, 'member.full_name'),
    ('display_name', 'Como prefere ser chamado(a)?', 'short_text', false, null, null, 'member.display_name'),
    ('email', 'E-mail', 'email', true, null, null, 'member.email'),
    ('phone', 'Celular (WhatsApp)', 'phone', true, null, null, 'member.phone'),
    ('social', 'Rede social (Instagram)', 'short_text', false, null, null, 'member.social_handle'),
    ('birth_date', 'Data de nascimento', 'date', true, null, null, 'member.birth_date'),
    ('gender', 'Como você se identifica?', 'single_select', false, '[{"value":"Homem","label":"Homem"},{"value":"Mulher","label":"Mulher"},{"value":"Pessoa não binária","label":"Pessoa não binária"},{"value":"Outro","label":"Outro"}]'::jsonb, null, 'sensitive.gender'),
    ('is_trans', 'Você se considera trans?', 'yes_no', false, y, null, 'sensitive.is_trans'),
    ('race', 'Como você identifica sua cor/raça?', 'single_select', false, '[{"value":"branca","label":"Branca"},{"value":"preta","label":"Preta"},{"value":"parda","label":"Parda"},{"value":"amarela","label":"Amarela"},{"value":"indigena","label":"Indígena"},{"value":"prefiro_nao_informar","label":"Prefiro não informar"}]'::jsonb, null, 'sensitive.race_color'),
    ('is_pcd', 'Você é PCD (pessoa com deficiência)?', 'yes_no', false, y, null, 'sensitive.is_pcd'),
    ('pcd_description', 'Qual?', 'short_text', false, null, '{"field":"is_pcd","op":"eq","value":"yes"}'::jsonb, 'sensitive.pcd_description'),
    ('plays', 'Toca ou já tocou algum instrumento?', 'yes_no', false, y, null, null),
    ('instrument', 'Instrumento', 'single_select', false, null, '{"field":"plays","op":"eq","value":"yes"}'::jsonb, 'link.instrument'),
    ('level', 'Nível', 'single_select', false, null, '{"field":"plays","op":"eq","value":"yes"}'::jsonb, 'link.skill_level'),
    ('played_other', 'Toca ou já tocou com outros blocos?', 'yes_no', false, y, null, 'member.played_other_blocks'),
    ('other_blocks', 'Quais blocos?', 'short_text', false, null, '{"field":"played_other","op":"eq","value":"yes"}'::jsonb, 'member.other_blocks'),
    ('affective', 'Qual é a sua relação com a Grande Tijuca?', 'long_text', false, null, null, 'member.affective_relation')
  ) as x(k, l, t, r, o, c, m);
  perform public._apply_form_sections(v_form);
  return v_form;
end $function$
;

CREATE OR REPLACE FUNCTION public.create_staff_payment(p_member uuid, p_competence date, p_destination uuid, p_amount numeric, p_due_on date DEFAULT NULL::date, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid; v_id uuid;
begin
  select organization_id into v_org from public.members where id = p_member;
  if v_org is null then raise exception 'Pessoa não encontrada.' using errcode = 'P0002'; end if;
  perform public.require_finance(v_org, 'staff_payments.manage');
  if p_amount is null or p_amount <= 0 then raise exception 'Informe um valor maior que zero.' using errcode = '22003'; end if;
  if p_destination is not null and not exists (select 1 from public.distribution_destinations where id = p_destination and organization_id = v_org) then
    raise exception 'Destino inválido.' using errcode = 'P0002';
  end if;
  insert into public.staff_payments (organization_id, member_id, competence, destination_id, amount, due_on, notes)
  values (v_org, p_member, date_trunc('month', p_competence)::date, p_destination, p_amount, p_due_on, nullif(trim(p_notes), ''))
  returning id into v_id;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.current_member_id(p_org uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select m.id from public.members m
  where m.organization_id = p_org and m.user_id = auth.uid() and m.archived_at is null
$function$
;

CREATE OR REPLACE FUNCTION public.cycle_blockers(p_cycle uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid;
begin
  select organization_id into v_org from public.cycles where id = p_cycle;
  if v_org is null then raise exception 'Ciclo não encontrado.' using errcode = 'P0002'; end if;
  if not public.has_permission(v_org, 'cycles.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'participations', (select count(*) from public.member_cycles where cycle_id = p_cycle),
    'events', (select count(*) from public.activities where cycle_id = p_cycle),
    'attendance', (select count(*) from public.event_attendance ea join public.activities a on a.id = ea.activity_id where a.cycle_id = p_cycle),
    'forms', (select count(*) from public.forms where cycle_id = p_cycle),
    'submissions', (select count(*) from public.form_submissions s join public.forms f on f.id = s.form_id where f.cycle_id = p_cycle),
    'capacity', (select count(*) from public.instrument_cycle_capacity where cycle_id = p_cycle),
    'reactivations', (select count(*) from public.reactivation_requests where cycle_id = p_cycle));
end $function$
;

CREATE OR REPLACE FUNCTION public.daily_privacy_maintenance()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o record; v_paths text[]; v_backups int; v_audit int; v_subs int := 0; v_orders int;
begin
  -- Backups manuais e importados: 12 meses (os automáticos já giram pelos 20 mais recentes).
  delete from public.backups where kind <> 'auto' and created_at < now() - interval '12 months';
  get diagnostics v_backups = row_count;
  -- Auditoria: 24 meses.
  delete from public.audit_logs where created_at < now() - interval '24 months';
  get diagnostics v_audit = row_count;
  -- Inscrições antigas não aprovadas: mesmos prazos do botão (6 meses pendente, 12 meses recusada/arquivada).
  for o in select id from public.organizations where is_active loop
    v_paths := public._purge_old_submissions(o.id);
    if cardinality(v_paths) > 0 then
      insert into public.storage_delete_queue (organization_id, bucket, path)
      select o.id, 'form-uploads', p from unnest(v_paths) p;
      v_subs := v_subs + cardinality(v_paths);
    end if;
  end loop;
  -- Loja: pedidos mais velhos que o prazo do aviso de privacidade.
  v_orders := public.shop_anonymize_old_orders();
  return jsonb_build_object('backups', v_backups, 'audit_logs', v_audit, 'files_queued', v_subs, 'shop_orders_anonymized', v_orders);
end $function$
;

CREATE OR REPLACE FUNCTION public.dashboard_direction(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_cycle public.cycles; v_today date; v_comp date; v_res jsonb;
  v_total int; v_active int; v_inactive int; v_wait int;
begin
  if not public.has_permission(p_org, 'finance.read') then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  select (now() at time zone o.timezone)::date into v_today from public.organizations o where o.id = p_org;
  v_comp := date_trunc('month', v_today)::date;
  select * into v_cycle from public.cycles where organization_id = p_org and is_active order by is_current desc, starts_on desc limit 1;
  select count(*) into v_total from public.members where organization_id = p_org and archived_at is null;
  select count(*) filter (where s.counts_as_active), count(*) filter (where not s.counts_as_active and not s.is_waitlist), count(*) filter (where s.is_waitlist)
    into v_active, v_inactive, v_wait
    from public.member_cycles mc join public.member_cycle_statuses s on s.id = mc.status_id
   where mc.cycle_id = v_cycle.id;

  v_res := jsonb_build_object(
    'cycle', case when v_cycle.id is null then null else jsonb_build_object('id', v_cycle.id, 'name', v_cycle.name) end,
    'members_total', v_total, 'members_active', coalesce(v_active, 0), 'members_inactive', coalesce(v_inactive, 0), 'members_waitlist', coalesce(v_wait, 0),
    'by_type', coalesce((
      select jsonb_agg(jsonb_build_object('name', x.label, 'count', x.n) order by x.ord, x.label)
        from (select case fc.base_key when 'aluno' then 'Aluno' when 'senior' then 'Sênior' when 'musico' then 'Músico' when 'isento' then 'Isento' else fc.name end as label,
                     case fc.base_key when 'aluno' then 1 when 'senior' then 2 when 'musico' then 3 when 'isento' then 5 else 4 end as ord,
                     count(distinct fa.member_id) as n
                from public.cycle_fee_assignments fa
                join public.fee_categories fc on fc.id = fa.fee_category_id
                join public.members m on m.id = fa.member_id and m.archived_at is null
                join public.member_cycles mc on mc.member_id = fa.member_id and mc.cycle_id = fa.cycle_id
                join public.member_cycle_statuses st on st.id = mc.status_id and st.counts_as_active
               where fa.cycle_id = v_cycle.id
               group by 1, 2) x), '[]'::jsonb),
    'by_section', coalesce((
      select jsonb_agg(jsonb_build_object('name', s.name, 'active', x.n) order by s.sort_order)
        from public.sections s
        join lateral (select count(distinct l.member_id) n from public.member_artistic_links l
                      join public.instruments i on i.id = l.instrument_id and i.section_id = s.id
                      join public.member_cycles mc on mc.member_id = l.member_id and mc.cycle_id = v_cycle.id
                      join public.member_cycle_statuses st on st.id = mc.status_id and st.counts_as_active
                      where l.ended_at is null) x on true
       where s.organization_id = p_org and s.is_active), '[]'::jsonb),
    'capacity', (select jsonb_build_object('limited', count(*), 'full', count(*) filter (where o >= c.capacity),
                        'capacity', coalesce(sum(c.capacity), 0), 'occupied', coalesce(sum(o), 0))
                   from public.instrument_cycle_capacity c, lateral (select public.instrument_occupied(c.instrument_id, c.cycle_id) o) x
                  where c.organization_id = p_org and c.cycle_id = v_cycle.id),
    'billing', (select jsonb_build_object('previsto', coalesce(sum(final_amount) filter (where status in ('pending', 'paid')), 0),
                        'recebido', coalesce(sum(final_amount) filter (where status = 'paid'), 0),
                        'pendente', coalesce(sum(final_amount) filter (where status = 'pending'), 0),
                        'inadimplentes', count(*) filter (where status = 'pending' and due_on < v_today),
                        'bolsas', coalesce(sum(scholarship_discount) filter (where status <> 'cancelled'), 0))
                  from public.monthly_charges where organization_id = p_org and competence = v_comp),
    'scholarships', (select jsonb_build_object('bolsistas', count(*), 'equivalente', round(coalesce(sum(s.percent), 0) / 100, 2))
                       from public.cycle_scholarships s join public.members m on m.id = s.member_id and m.archived_at is null
                      where s.organization_id = p_org and s.cycle_id = v_cycle.id and s.percent > 0),
    'finance', (select jsonb_build_object('despesas', coalesce(sum(amount) filter (where kind = 'expense'), 0),
                        'receitas', coalesce(sum(amount) filter (where kind = 'income'), 0),
                        'saldo', coalesce(sum(case when kind = 'income' then amount else -amount end), 0))
                  from public.v_finance_ledger where organization_id = p_org and occurred_on >= v_comp and occurred_on < (v_comp + interval '1 month')::date)
  );
  return v_res;
end $function$
;

CREATE OR REPLACE FUNCTION public.decide_reactivation(p_request uuid, p_approve boolean, p_note text DEFAULT NULL::text, p_force boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.reactivation_requests; v_actor uuid;
begin
  select * into r from public.reactivation_requests where id = p_request;
  if r.id is null then raise exception 'Pedido não encontrado.' using errcode = 'P0002'; end if;
  if not public.can_decide_reactivation(r.organization_id, r.member_id) then
    raise exception 'Só a Direção ou um professor do grupo da pessoa pode decidir.' using errcode = '42501';
  end if;
  if r.status <> 'pending' then raise exception 'Este pedido já foi decidido.' using errcode = 'P0001'; end if;
  v_actor := public.current_member_id(r.organization_id);
  if p_approve then
    perform public.set_member_cycle_status(r.member_id, r.cycle_id, 'active', 'Reativado a pedido', null, p_force);
  end if;
  update public.reactivation_requests
     set status = case when p_approve then 'approved' else 'rejected' end, decided_by = v_actor, decided_at = now(), decision_note = nullif(trim(p_note), '')
   where id = r.id;
end $function$
;

CREATE OR REPLACE FUNCTION public.delete_activity(p_activity uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.activities;
begin
  select * into a from public.activities where id = p_activity;
  if a.id is null or not public.has_permission(a.organization_id, 'events.manage') then
    raise exception 'Sem permissão para apagar este evento.' using errcode = '42501';
  end if;
  if a.deleted_at is null then
    raise exception 'Mande o evento para a lixeira antes de excluir de vez.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.event_attendance ea where ea.activity_id = a.id) then
    raise exception 'Este evento tem presença registrada e não pode ser excluído de vez: o histórico da chamada é mantido.' using errcode = 'P0001';
  end if;
  -- Evento que veio de uma recorrência: guarda a data como "pulada" para a recorrência não recriá-lo.
  if a.recurrence_rule_id is not null then
    insert into public.recurrence_skips (organization_id, rule_id, activity_date) values (a.organization_id, a.recurrence_rule_id, a.activity_date) on conflict do nothing;
  end if;
  delete from public.activity_checklist_items where activity_id = a.id;
  delete from public.activities where id = a.id;
end $function$
;

CREATE OR REPLACE FUNCTION public.delete_backup(p_backup uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid;
begin
  select organization_id into v_org from public.backups where id = p_backup;
  if v_org is null then raise exception 'Backup não encontrado.' using errcode = 'P0002'; end if;
  if not public.has_permission(v_org, 'backups.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  delete from public.backups where id = p_backup;
end $function$
;

CREATE OR REPLACE FUNCTION public.delete_cycle_cascade(p_cycle uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid; v_name text;
begin
  select organization_id, name into v_org, v_name from public.cycles where id = p_cycle;
  if v_org is null then raise exception 'Ciclo não encontrado.' using errcode = 'P0002'; end if;
  if not public.has_permission(v_org, 'cycles.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  perform public.make_backup(v_org, 'Antes de apagar o ciclo ' || v_name, 'auto');
  delete from public.event_attendance where activity_id in (select id from public.activities where cycle_id = p_cycle);
  delete from public.activity_checklist_items where activity_id in (select id from public.activities where cycle_id = p_cycle);
  delete from public.activities where cycle_id = p_cycle;
  delete from public.form_submissions where form_id in (select id from public.forms where cycle_id = p_cycle);
  delete from public.form_fields where form_id in (select id from public.forms where cycle_id = p_cycle);
  delete from public.form_versions where form_id in (select id from public.forms where cycle_id = p_cycle);
  delete from public.forms where cycle_id = p_cycle;
  delete from public.instrument_cycle_capacity where cycle_id = p_cycle;
  delete from public.reactivation_requests where cycle_id = p_cycle;
  delete from public.member_cycle_status_history where member_cycle_id in (select id from public.member_cycles where cycle_id = p_cycle);
  delete from public.member_cycles where cycle_id = p_cycle;
  delete from public.cycles where id = p_cycle;
end $function$
;

CREATE OR REPLACE FUNCTION public.delete_recurrence(p_rule uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.recurrence_rules; n int;
begin
  select * into r from public.recurrence_rules where id = p_rule;
  if r.id is null or not public.has_permission(r.organization_id, 'events.manage') then
    raise exception 'Sem permissão para apagar esta recorrência.' using errcode = '42501';
  end if;
  delete from public.activities a
   where a.recurrence_rule_id = p_rule
     and not exists (select 1 from public.event_attendance ea where ea.activity_id = a.id);
  get diagnostics n = row_count;
  update public.activities set recurrence_rule_id = null where recurrence_rule_id = p_rule;
  delete from public.recurrence_rules where id = p_rule;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.delete_section_template(p_template uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.form_section_templates;
begin
  select * into t from public.form_section_templates where id = p_template;
  if t.id is null or not public.has_permission(t.organization_id, 'forms.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  delete from public.form_fields where form_id = t.form_id;
  delete from public.forms where id = t.form_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.drive_integration_config(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare i public.integrations;
begin
  if not public.has_permission(p_org, 'repertoire.manage') then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  select * into i from public.integrations where organization_id = p_org and provider = 'google_drive';
  if i.id is null then return jsonb_build_object('configured', false, 'active', false); end if;
  return jsonb_build_object('configured', i.config ->> 'folder_id' is not null, 'active', i.is_active, 'folder_id', i.config ->> 'folder_id');
end $function$
;

CREATE OR REPLACE FUNCTION public.drive_sync_context(p_folder uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare f public.drive_folders; v_targets jsonb; v_shares jsonb;
begin
  select * into f from public.drive_folders where id = p_folder;
  if f.id is null then raise exception 'Pasta não encontrada.' using errcode = 'P0002'; end if;
  if not public.has_permission(f.organization_id, 'drive.manage') then raise exception 'Sem permissão para sincronizar o Drive.' using errcode = '42501'; end if;
  if f.drive_folder_id is null then raise exception 'O link desta pasta não tem um identificador do Drive. Use o link da pasta (…/folders/ID).' using errcode = 'P0001'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('member_id', m.id, 'email', lower(trim(m.email)), 'name', coalesce(m.display_name, m.full_name)) order by m.full_name), '[]'::jsonb)
    into v_targets
    from public.members m
   where m.organization_id = f.organization_id and m.archived_at is null and m.email is not null and length(trim(m.email)) > 3
     and (
       exists (select 1 from public.member_access_roles mar join public.access_roles ar on ar.id = mar.access_role_id
                where mar.member_id = m.id and mar.revoked_at is null and ar.key in ('titular', 'direcao', 'professor', 'monitor'))
       or (
         (exists (select 1 from public.member_cycles mc join public.cycles c on c.id = mc.cycle_id and c.is_current
                    join public.member_cycle_statuses s on s.id = mc.status_id and s.counts_as_active where mc.member_id = m.id)
          or exists (select 1 from public.member_access_roles mar join public.access_roles ar on ar.id = mar.access_role_id
                      where mar.member_id = m.id and mar.revoked_at is null and ar.key in ('professor', 'monitor')))
         and exists (
           select 1 from public.drive_folder_access a where a.folder_id = f.id and (
             (a.access_role_id is not null and exists (select 1 from public.member_access_roles mar where mar.member_id = m.id and mar.revoked_at is null and mar.access_role_id = a.access_role_id))
             or (a.section_id is not null and exists (select 1 from public.member_artistic_links l join public.instruments i on i.id = l.instrument_id
                                                       where l.member_id = m.id and l.ended_at is null and i.section_id = a.section_id))
             or (a.instrument_id is not null and exists (select 1 from public.member_artistic_links l where l.member_id = m.id and l.ended_at is null and l.instrument_id = a.instrument_id))))
       )
     );

  select coalesce(jsonb_agg(jsonb_build_object('email', s.email, 'permission_id', s.drive_permission_id)), '[]'::jsonb)
    into v_shares from public.drive_folder_shares s where s.folder_id = f.id and s.removed_at is null;

  return jsonb_build_object('folder_name', f.name, 'drive_folder_id', f.drive_folder_id, 'targets', v_targets, 'shares', v_shares);
end $function$
;

CREATE OR REPLACE FUNCTION public.drive_sync_record(p_folder uuid, p_added jsonb, p_removed jsonb, p_summary jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare f public.drive_folders; r jsonb;
begin
  select * into f from public.drive_folders where id = p_folder;
  if f.id is null then raise exception 'Pasta não encontrada.' using errcode = 'P0002'; end if;
  if not public.has_permission(f.organization_id, 'drive.manage') then raise exception 'Sem permissão para sincronizar o Drive.' using errcode = '42501'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_added, '[]'::jsonb)) loop
    insert into public.drive_folder_shares (organization_id, folder_id, email, drive_permission_id)
    values (f.organization_id, f.id, lower(r ->> 'email'), r ->> 'permission_id')
    on conflict (folder_id, email) where removed_at is null do update set drive_permission_id = excluded.drive_permission_id;
  end loop;
  update public.drive_folder_shares set removed_at = now()
   where folder_id = f.id and removed_at is null and email in (select lower(jsonb_array_elements_text(coalesce(p_removed, '[]'::jsonb))));
  update public.drive_folders set last_synced_at = now(), last_sync_summary = p_summary where id = f.id;
  insert into public.audit_logs (organization_id, actor_user_id, actor_member_id, action, entity_type, entity_id, new_data)
  values (f.organization_id, auth.uid(), public.current_member_id(f.organization_id), 'drive_synced', 'drive_folders', f.id::text, p_summary);
end $function$
;

CREATE OR REPLACE FUNCTION public.duplicate_form(p_form uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare f public.forms; v_new uuid;
begin
  select * into f from public.forms where id = p_form;
  if f.id is null or not public.has_permission(f.organization_id, 'forms.manage') then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  insert into public.forms (organization_id, title, description, slug, cycle_id, confirmation_message, max_responses, privacy_text, requires_consent, prevent_duplicates)
  values (f.organization_id, f.title || ' (cópia)', f.description, f.slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6), f.cycle_id,
          f.confirmation_message, f.max_responses, f.privacy_text, f.requires_consent, f.prevent_duplicates) returning id into v_new;
  insert into public.form_fields (organization_id, form_id, field_key, label, description, field_type, required, sort_order, options, default_value, validation, condition, member_mapping, is_active)
  select organization_id, v_new, field_key, label, description, field_type, required, sort_order, options, default_value, validation, condition, member_mapping, is_active
  from public.form_fields where form_id = p_form;
  return v_new;
end $function$
;

CREATE OR REPLACE FUNCTION public.duplicate_section_template(p_template uuid, p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.form_section_templates; v_form uuid; v_sec uuid; v_id uuid; r public.form_fields; v_new uuid; nm text := btrim(coalesce(p_name, ''));
begin
  select * into t from public.form_section_templates where id = p_template;
  if t.id is null or not public.has_permission(t.organization_id, 'forms.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if nm = '' then raise exception 'Digite um nome.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.form_section_templates where organization_id = t.organization_id and name = nm) then
    raise exception 'Já existe um modelo com esse nome.' using errcode = '23505';
  end if;
  insert into public.forms (organization_id, title, slug, is_template)
  values (t.organization_id, nm, 'modelo-' || substr(md5(random()::text), 1, 10), true) returning id into v_form;
  for r in select * from public.form_fields where form_id = t.form_id order by sort_order loop
    insert into public.form_fields (organization_id, form_id, field_key, label, description, field_type, required, sort_order, options, default_value, validation, condition, member_mapping, is_active)
    values (r.organization_id, v_form, case when r.id = t.section_id then 'sec_' || substr(md5(random()::text), 1, 8) else r.field_key end, case when r.id = t.section_id then nm else r.label end, r.description, r.field_type, r.required, r.sort_order, r.options, r.default_value, r.validation, r.condition, r.member_mapping, r.is_active)
    returning id into v_new;
    if r.id = t.section_id then v_sec := v_new; end if;
  end loop;
  insert into public.form_section_templates (organization_id, name, form_id, section_id, sort_order)
  values (t.organization_id, nm, v_form, v_sec, (select coalesce(max(x.sort_order), 0) + 1 from public.form_section_templates x where x.organization_id = t.organization_id))
  returning id into v_id;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.end_recurrence(p_rule uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.recurrence_rules; v_today date; n int;
begin
  select * into r from public.recurrence_rules where id = p_rule;
  if r.id is null or not public.has_permission(r.organization_id, 'events.manage') then
    raise exception 'Sem permissão para encerrar esta recorrência.' using errcode = '42501';
  end if;
  select (now() at time zone o.timezone)::date into v_today from public.organizations o where o.id = r.organization_id;
  update public.recurrence_rules set is_active = false, until = greatest(starts_on, least(coalesce(until, v_today), v_today))
   where id = p_rule;
  update public.activities a set status = 'cancelled'
   where a.recurrence_rule_id = p_rule and a.activity_date > v_today and a.status = 'scheduled'
     and not exists (select 1 from public.event_attendance ea where ea.activity_id = a.id);
  get diagnostics n = row_count;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.enforce_member_adult()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.birth_date is not null and new.birth_date > (current_date - interval '18 years')::date then
    raise exception 'Menores de 18 anos não podem ser cadastrados como integrantes.'
      using errcode = 'check_violation';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.ensure_titular_role(p_org uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.access_roles (organization_id, key, name, rank, is_system) values (p_org, 'titular', 'Titular do bloco', 50, true)
  on conflict (organization_id, key) do nothing;
  insert into public.role_permissions (access_role_id, permission_key, scope)
  select ar.id, p.key, 'org' from public.access_roles ar cross join public.permissions p where ar.organization_id = p_org and ar.key = 'titular'
  on conflict do nothing;
end $function$
;

CREATE OR REPLACE FUNCTION public.finance_month_summary(p_org uuid, p_competence date)
 RETURNS TABLE(receita_mensalidades numeric, receita_outras numeric, despesas numeric, pagamentos_equipe numeric, saldo numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_from date := date_trunc('month', p_competence)::date; v_to date := (date_trunc('month', p_competence) + interval '1 month')::date;
begin
  perform public.require_finance(p_org, 'finance.read');
  return query
  select coalesce(sum(l.amount) filter (where l.kind = 'income' and l.source = 'mensalidade'), 0),
         coalesce(sum(l.amount) filter (where l.kind = 'income' and l.source <> 'mensalidade'), 0),
         coalesce(sum(l.amount) filter (where l.kind = 'expense' and l.source <> 'equipe'), 0),
         coalesce(sum(l.amount) filter (where l.kind = 'expense' and l.source = 'equipe'), 0),
         coalesce(sum(case when l.kind = 'income' then l.amount else -l.amount end), 0)
  from public.v_finance_ledger l
  where l.organization_id = p_org and l.occurred_on >= v_from and l.occurred_on < v_to;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_old jsonb; v_new jsonb; v_org uuid; v_id text; v_member uuid;
begin
  v_old := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;

  if tg_table_name = 'organizations' then
    v_org := coalesce(v_new ->> 'id', v_old ->> 'id')::uuid;
  elsif tg_table_name = 'role_permissions' then
    select r.organization_id into v_org from public.access_roles r
    where r.id = coalesce(v_new ->> 'access_role_id', v_old ->> 'access_role_id')::uuid;
  else
    v_org := coalesce(v_new ->> 'organization_id', v_old ->> 'organization_id')::uuid;
  end if;

  v_id := coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'member_id', v_old ->> 'member_id',
                   v_new ->> 'key', v_old ->> 'key');

  -- LGPD: o log de dados sensíveis registra apenas QUAIS campos mudaram, nunca os valores.
  if tg_table_name = 'member_sensitive_data' then
    v_old := null;
    v_new := jsonb_build_object('changed_fields', coalesce((
      select jsonb_agg(n.key) from jsonb_each(to_jsonb(new)) n
      where n.key not in ('updated_at', 'updated_by')
        and (tg_op = 'INSERT' or n.value is distinct from (to_jsonb(old) -> n.key))
    ), '[]'::jsonb));
  else
    -- LGPD-03: contato, chave Pix e nascimento ficam mascarados no log.
    v_old := public.audit_mask(v_old);
    v_new := public.audit_mask(v_new);
  end if;

  v_member := (select m.id from public.members m
               where m.user_id = auth.uid() and m.organization_id = v_org limit 1);

  insert into public.audit_logs (organization_id, actor_user_id, actor_member_id, action,
                                 entity_type, entity_id, old_data, new_data)
  values (v_org, auth.uid(), v_member, lower(tg_op), tg_table_name, v_id, v_old, v_new);
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_participation_to_staff()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if pg_trigger_depth() > 1 then return null; end if;
  perform public.sync_staff_compensation(coalesce(new.member_id, old.member_id));
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_staff_assignment_cycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.cycle_id is null then
    select c.id into new.cycle_id from public.cycles c
     where c.organization_id = new.organization_id order by c.is_current desc, c.starts_on desc limit 1;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_staff_to_participation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_fn uuid; v_paid boolean := new.compensation = 'paid'; v_current boolean;
begin
  if pg_trigger_depth() > 1 or new.valid_to is not null then return null; end if;
  v_fn := public.staff_function_id(new.organization_id, new.staff_kind);
  if v_fn is null then return null; end if;
  select c.is_current into v_current from public.cycles c where c.id = new.cycle_id;
  if coalesce(v_current, false) then
    if exists (select 1 from public.member_artistic_links where member_id = new.member_id and function_id = v_fn and ended_at is null) then
      update public.member_artistic_links set is_paid = v_paid where member_id = new.member_id and function_id = v_fn and ended_at is null and is_paid is distinct from v_paid;
    else
      insert into public.member_artistic_links (organization_id, member_id, function_id, is_paid) values (new.organization_id, new.member_id, v_fn, v_paid);
    end if;
  else
    if exists (select 1 from public.cycle_participations where member_id = new.member_id and cycle_id = new.cycle_id and function_id = v_fn) then
      update public.cycle_participations set is_paid = v_paid where member_id = new.member_id and cycle_id = new.cycle_id and function_id = v_fn and is_paid is distinct from v_paid;
    else
      insert into public.cycle_participations (organization_id, member_id, cycle_id, function_id, is_paid) values (new.organization_id, new.member_id, new.cycle_id, v_fn, v_paid);
    end if;
  end if;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_structure_in_current_cycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_cycle uuid;
begin
  select c.id into v_cycle from public.cycles c where c.organization_id = new.organization_id order by c.is_current desc, c.starts_on desc limit 1;
  if v_cycle is not null then
    if tg_table_name = 'sections' then
      insert into public.section_cycles (organization_id, section_id, cycle_id) values (new.organization_id, new.id, v_cycle) on conflict do nothing;
    else
      insert into public.instrument_cycles (organization_id, instrument_id, cycle_id) values (new.organization_id, new.id, v_cycle) on conflict do nothing;
    end if;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.form_mail_claim(p_limit integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r record; out jsonb := '[]'::jsonb; ctx jsonb;
begin
  for r in
    select b.* from public.form_email_outbox b
     where b.status = 'pending' and b.next_attempt_at <= now() and b.attempts < 5
     order by b.created_at limit greatest(1, least(p_limit, 50)) for update skip locked
  loop
    update public.form_email_outbox set attempts = attempts + 1, next_attempt_at = now() + interval '10 minutes' where id = r.id;
    select jsonb_build_object(
      'outbox_id', r.id, 'template', r.template, 'to_email', r.to_email, 'name', m.full_name,
      'message', coalesce(r.message, case r.template when 'submission_approved' then fm.approved_email_text when 'submission_waitlist' then fm.waitlist_email_text else fm.rejected_email_text end),
      'org', jsonb_build_object('name', g.name),
      'settings', jsonb_build_object('public_site_url', s.public_site_url, 'contact_whatsapp', s.contact_whatsapp, 'contact_email', s.contact_email,
                                     'directors', s.directors, 'mail_from_name', s.mail_from_name, 'mail_from_email', s.mail_from_email))
      into ctx
      from public.organizations g
      left join public.shop_settings s on s.organization_id = g.id
      left join public.form_submissions sub on sub.id = r.submission_id
      left join public.forms fm on fm.id = sub.form_id
      left join public.members m on m.id = r.member_id
     where g.id = r.organization_id;
    out := out || jsonb_build_array(ctx);
  end loop;
  return out;
end $function$
;

CREATE OR REPLACE FUNCTION public.form_mail_done(p_id uuid, p_ok boolean, p_error text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  update public.form_email_outbox
     set status = case when p_ok then 'sent' when attempts >= 5 then 'failed' else 'pending' end,
         sent_at = case when p_ok then now() end,
         last_error = case when p_ok then null else left(p_error, 300) end,
         next_attempt_at = case when p_ok then next_attempt_at else now() + (attempts * interval '5 minutes') end
   where id = p_id
$function$
;

CREATE OR REPLACE FUNCTION public.form_vars(p_form uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare f public.forms; v_cy uuid;
begin
  select * into f from public.forms where id = p_form;
  if f.id is null or not public.has_permission(f.organization_id, 'forms.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  v_cy := coalesce(f.cycle_id, (select cy.id from public.cycles cy where cy.organization_id = f.organization_id and cy.is_current limit 1));
  return (select jsonb_build_object(
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('name', c.name, 'key', c.system_key, 'price', p.amount) order by c.sort_order, c.name), '[]'::jsonb)
                     from public.fee_categories c join public.fee_cycle_prices p on p.fee_category_id = c.id and p.cycle_id = v_cy
                    where c.organization_id = f.organization_id and c.is_active),
    'valor_field', (select fld.field_key from public.form_fields fld where fld.form_id = f.id and fld.is_active and fld.member_mapping = 'link.function' limit 1),
    'prices', (select coalesce(jsonb_object_agg(c.function_id::text, p.amount), '{}'::jsonb)
                 from public.fee_categories c join public.fee_cycle_prices p on p.fee_category_id = c.id and p.cycle_id = v_cy
                where c.organization_id = f.organization_id and c.function_id is not null),
    'ciclo', (select cy.name from public.cycles cy where cy.id = f.cycle_id), 'inicio_ciclo', (select cy.starts_on from public.cycles cy where cy.id = f.cycle_id),
    'fim_ciclo', (select cy.ends_on from public.cycles cy where cy.id = f.cycle_id),
    'whatsapp', s.contact_whatsapp, 'email', s.contact_email, 'chave_pix', s.pix_key,
    'vencimento', (select os.value #>> '{}' from public.org_settings os where os.organization_id = f.organization_id and os.key = 'billing_due_day'))
    from public.shop_settings s where s.organization_id = f.organization_id);
end $function$
;

CREATE OR REPLACE FUNCTION public.generate_monthly_charges(p_org uuid, p_competence date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_comp date := date_trunc('month', p_competence)::date;
  v_end date := (date_trunc('month', p_competence) + interval '1 month - 1 day')::date;
  v_due_day int; v_created int; v_noprice int; v_total int;
begin
  perform public.require_billing(p_org);
  v_due_day := coalesce((select (value #>> '{}')::int from public.org_settings where organization_id = p_org and key = 'billing_due_day'), 10);

  with elig as (
    select distinct on (fa.member_id) fa.member_id, fa.cycle_id, f.fee_category_id, f.base_amount as base, f.percent as pct
      from public.cycle_fee_assignments fa
      join public.cycles cy on cy.id = fa.cycle_id and cy.is_active and cy.starts_on <= v_end and cy.ends_on >= v_comp
      join public.members m on m.id = fa.member_id and m.archived_at is null
      cross join lateral public.billing_member_fee(fa.member_id, fa.cycle_id) f
     where fa.organization_id = p_org and f.is_active and f.exempt_by is null and f.paid_by is null
     order by fa.member_id, cy.starts_on desc
  ), ins as (
    insert into public.monthly_charges (organization_id, member_id, competence, cycle_id, fee_category_id, base_amount,
                                        scholarship_percent, scholarship_discount, final_amount, status, due_on)
    select p_org, e.member_id, v_comp, e.cycle_id, e.fee_category_id, e.base, e.pct,
           round(e.base * e.pct / 100, 2), e.base - round(e.base * e.pct / 100, 2),
           case when e.base - round(e.base * e.pct / 100, 2) <= 0 then 'exempt' else 'pending' end,
           public.next_business_day(p_org, v_comp + (v_due_day - 1))
      from elig e where e.base is not null
    on conflict (organization_id, member_id, competence) do nothing
    returning 1
  )
  select (select count(*) from ins), (select count(*) from elig where base is null), (select count(*) from elig where base is not null)
    into v_created, v_noprice, v_total;
  return jsonb_build_object('created', v_created, 'already_existing', v_total - v_created, 'skipped_no_price', v_noprice);
end $function$
;

CREATE OR REPLACE FUNCTION public.generate_recurrence_day(p_rule uuid, p_date date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.recurrence_rules; v_id uuid;
begin
  select * into r from public.recurrence_rules where id = p_rule;
  if r.id is null or not public.has_permission(r.organization_id, 'events.manage') then
    raise exception 'Sem permissão para gerar eventos.' using errcode = '42501';
  end if;
  if extract(dow from p_date) <> r.weekday then
    raise exception 'Esta recorrência não cai neste dia da semana.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.activities a where a.recurrence_rule_id = r.id and a.activity_date = p_date and a.deleted_at is null) then
    raise exception 'Já existe um evento desta recorrência neste dia.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.activities a where a.recurrence_rule_id = r.id and a.activity_date = p_date and a.deleted_at is not null) then
    raise exception 'Este dia tem um evento desta recorrência na lixeira: restaure-o por lá.' using errcode = 'P0001';
  end if;
  delete from public.recurrence_skips where rule_id = r.id and activity_date = p_date;
  insert into public.activities (organization_id, activity_type_id, cycle_id, title, activity_date, start_time, end_time,
                                 location, description, visibility, recurrence_rule_id, itinerary, has_attendance)
  values (r.organization_id, r.activity_type_id,
          (select cy.id from public.cycles cy where cy.organization_id = r.organization_id and cy.is_active and p_date between cy.starts_on and cy.ends_on order by cy.is_current desc, cy.starts_on desc limit 1),
          r.title, p_date, r.start_time, r.end_time, r.location, r.description, r.visibility, r.id, r.itinerary, r.has_attendance)
  returning id into v_id;
  if jsonb_array_length(r.audiences) > 0 then
    insert into public.activity_audiences (organization_id, activity_id, kind, ref_id)
    select r.organization_id, v_id, x.elem ->> 'kind', (x.elem ->> 'ref')::uuid from jsonb_array_elements(r.audiences) as x(elem) on conflict do nothing;
  end if;
  if cardinality(r.extra_type_ids) > 0 then
    insert into public.activity_type_links (organization_id, activity_id, activity_type_id)
    select r.organization_id, v_id, t from unnest(r.extra_type_ids) as t where t <> r.activity_type_id on conflict do nothing;
  end if;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.get_attendance_roster(p_activity uuid)
 RETURNS TABLE(member_id uuid, display_name text, instruments text, status_id uuid, notes text, is_off_roster boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare v_a public.activities; v_cycle uuid; v_scope text; v_has_aud boolean;
begin
  select * into v_a from public.activities where id = p_activity;
  if v_a.id is null then raise exception 'Evento não encontrado.' using errcode = 'P0002'; end if;
  v_scope := public.permission_scope_of(v_a.organization_id, 'attendance.record')::text;
  if v_scope is null or v_scope = 'own' then
    raise exception 'Sem permissão para a chamada.' using errcode = '42501';
  end if;
  v_cycle := coalesce(v_a.cycle_id, (
    select cy.id from public.cycles cy
     where cy.organization_id = v_a.organization_id and cy.is_active and v_a.activity_date between cy.starts_on and cy.ends_on
     order by cy.is_current desc, cy.starts_on desc limit 1));
  v_has_aud := exists (select 1 from public.activity_audiences au where au.activity_id = p_activity);

  return query
  with eligible as (
    select m.id as mid from public.members m
    where m.organization_id = v_a.organization_id and m.archived_at is null
      and (v_cycle is null or exists (
            select 1 from public.member_cycles mc
            join public.member_cycle_statuses s on s.id = mc.status_id
            where mc.member_id = m.id and mc.cycle_id = v_cycle
              and (s.counts_as_active
                   or (not s.is_waitlist and mc.left_on is not null and v_a.activity_date <= mc.left_on))))
      and (not v_has_aud or (
            -- categorias do público: basta ter uma delas no ciclo
            (not exists (select 1 from public.activity_audiences au where au.activity_id = p_activity and au.kind = 'category')
             or exists (
                select 1 from public.activity_audiences au
                where au.activity_id = p_activity and au.kind = 'category' and (
                     exists (select 1 from public.cycle_fee_assignments fa where fa.member_id = m.id and fa.cycle_id = v_cycle and fa.fee_category_id = au.ref_id)
                  or exists (select 1 from public.cycle_extra_categories ex where ex.member_id = m.id and ex.cycle_id = v_cycle and ex.fee_category_id = au.ref_id))))
            -- E naipe/instrumento/pessoa do público (quando houver): basta um deles
            and (not exists (select 1 from public.activity_audiences au where au.activity_id = p_activity and au.kind <> 'category')
             or exists (
                select 1 from public.activity_audiences au
                where au.activity_id = p_activity and au.kind <> 'category' and (
                     (au.kind = 'member' and au.ref_id = m.id)
                  or (au.kind in ('section', 'instrument') and exists (
                        select 1 from public.member_artistic_links l join public.instruments i on i.id = l.instrument_id
                        where l.member_id = m.id and l.ended_at is null
                          and ((au.kind = 'instrument' and i.id = au.ref_id)
                            or (au.kind = 'section' and i.section_id = au.ref_id)))))))))
  ), picked as (
    select e.mid, false as off from eligible e
    union
    select ea.member_id, true from public.event_attendance ea
     where ea.activity_id = p_activity and ea.member_id not in (select e2.mid from eligible e2)
  )
  select m.id, coalesce(m.display_name, m.full_name),
         (select string_agg(i.name, ', ' order by i.name)
            from public.member_artistic_links l join public.instruments i on i.id = l.instrument_id
           where l.member_id = m.id and l.ended_at is null),
         ea.status_id, ea.notes, p.off
  from picked p
  join public.members m on m.id = p.mid
  left join public.event_attendance ea on ea.activity_id = p_activity and ea.member_id = m.id
  where v_scope = 'org' or public.can_record_attendance_for(v_a.organization_id, m.id)
  order by 2;
end $function$
;

CREATE OR REPLACE FUNCTION public.get_backup_data(p_backup uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare b public.backups;
begin
  select * into b from public.backups where id = p_backup;
  if b.id is null then raise exception 'Backup não encontrado.' using errcode = 'P0002'; end if;
  if not (public.has_permission(b.organization_id, 'backups.manage') and public.has_permission(b.organization_id, 'members.sensitive.read')) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  return b.data;
end $function$
;

CREATE OR REPLACE FUNCTION public.get_member_sensitive(p_member uuid)
 RETURNS TABLE(gender text, is_trans boolean, race_color text, is_pcd boolean, pcd_description text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid;
begin
  select organization_id into v_org from public.members where id = p_member;
  if v_org is null then raise exception 'Integrante não encontrado.' using errcode = 'P0002'; end if;
  if not public.is_self(p_member) then
    if not public.has_permission(v_org, 'members.sensitive.read') then
      raise exception 'Sem permissão para dados sensíveis.' using errcode = '42501';
    end if;
    -- Registra a leitura (uma linha a cada 10 minutos por pessoa lida, para não encher o log a cada recarga).
    if not exists (select 1 from public.audit_logs a
                    where a.organization_id = v_org and a.action = 'sensitive_read' and a.entity_id = p_member::text
                      and a.actor_user_id = auth.uid() and a.created_at > now() - interval '10 minutes') then
      insert into public.audit_logs (organization_id, actor_user_id, actor_member_id, action, entity_type, entity_id)
      values (v_org, auth.uid(), public.current_member_id(v_org), 'sensitive_read', 'member_sensitive_data', p_member::text);
    end if;
  end if;
  return query select s.gender, s.is_trans, s.race_color, s.is_pcd, s.pcd_description
                 from public.member_sensitive_data s where s.member_id = p_member;
end $function$
;

CREATE OR REPLACE FUNCTION public.get_my_memberships()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'organization_id', o.id, 'slug', o.slug, 'name', o.name, 'short_name', o.short_name,
    'logo_path', o.logo_path, 'theme', o.theme, 'timezone', o.timezone,
    'member_id', m.id, 'display_name', coalesce(m.display_name, m.full_name),
    'inactive', public.member_is_inactive(m.id),
    'roles', case when public.member_is_inactive(m.id) then '["integrante"]'::jsonb else coalesce((
      select jsonb_agg(ar.key order by ar.rank desc)
      from public.member_access_roles mar join public.access_roles ar on ar.id = mar.access_role_id
      where mar.member_id = m.id and mar.revoked_at is null), '[]'::jsonb) end,
    'permissions', coalesce((
      select jsonb_agg(jsonb_build_object('key', x.k, 'scope', x.s::text))
      from (select rp.permission_key k,
                   case when public.member_is_inactive(m.id) then 'own' else max(rp.scope)::text end as s
            from public.member_access_roles mar
            join public.role_permissions rp on rp.access_role_id = mar.access_role_id
            where mar.member_id = m.id and mar.revoked_at is null
              and (not public.member_is_inactive(m.id) or rp.permission_key in ('members.read', 'billing.read', 'attendance.read'))
            group by rp.permission_key) x), '[]'::jsonb)
  )), '[]'::jsonb)
  from public.members m
  join public.organizations o on o.id = m.organization_id and o.is_active
  where m.user_id = auth.uid() and m.archived_at is null
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_albums(p_slug text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'org', jsonb_build_object('slug', o.slug, 'name', o.name, 'logo_path', o.logo_path, 'theme', o.theme),
    'label', coalesce(s.albums_label, 'Fotos'),
    'albums', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'url', a.url, 'title', a.title, 'event_date', a.event_date,
                                          'authors', a.authors, 'cover_url', a.cover_url)
                       order by a.sort_order, a.event_date desc nulls last)
        from public.site_albums a where a.organization_id = o.id and a.is_active), '[]'::jsonb)
  )
  from public.organizations o
  left join public.site_settings s on s.organization_id = o.id
  where o.slug = p_slug and o.is_active
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_form(p_org_slug text, p_form_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o public.organizations; f public.forms; v public.form_versions; st text; m public.members; viewer jsonb; mine jsonb; v_cy uuid;
begin
  select * into o from public.organizations where slug = p_org_slug and is_active;
  if o.id is null then return jsonb_build_object('state', 'not_found'); end if;
  select * into f from public.forms where organization_id = o.id and slug = p_form_slug and status in ('published', 'closed');
  if f.id is null or f.published_version_id is null then return jsonb_build_object('state', 'not_found'); end if;
  select * into v from public.form_versions where id = f.published_version_id;
  st := public._form_state(f);
  v_cy := coalesce(f.cycle_id, (select cy.id from public.cycles cy where cy.organization_id = o.id and cy.is_current limit 1));
  if f.access = 'internal' and st = 'open' then
    if auth.uid() is null then st := 'login_required';
    else
      select * into m from public.members where organization_id = o.id and user_id = auth.uid() and archived_at is null;
      if m.id is null then st := 'not_member';
      else
        viewer := jsonb_build_object('member_id', m.id, 'name', m.full_name, 'section_id', public._viewer_section(m.id));
        select jsonb_build_object('status', x.status, 'answers', x.answers, 'submitted_at', x.submitted_at, 'edited_at', x.edited_at) into mine
          from public.form_submissions x where x.form_id = f.id and x.member_id = m.id and x.status in ('pending', 'approved') order by x.submitted_at desc limit 1;
        if mine is not null then st := 'already'; end if;
      end if;
    end if;
  end if;
  return jsonb_build_object(
    'state', st, 'access', f.access, 'viewer', viewer, 'mine', mine,
    'organization', jsonb_build_object('name', o.name, 'short_name', o.short_name, 'logo_path', o.logo_path, 'theme', o.theme),
    'form', jsonb_build_object(
      'title', v.snapshot -> 'title', 'description', v.snapshot -> 'description', 'privacy_text', to_jsonb(case when f.privacy_enabled then f.privacy_text end),
      'requires_consent', v.snapshot -> 'requires_consent', 'closes_at', f.closes_at, 'send_text', case when f.send_enabled then f.send_text end,
      'show_confirmation', f.confirmation_enabled,
      'vars', (select jsonb_build_object(
          'categories', (select coalesce(jsonb_agg(jsonb_build_object('name', c.name, 'key', c.system_key, 'price', p.amount) order by c.sort_order, c.name), '[]'::jsonb)
                           from public.fee_categories c join public.fee_cycle_prices p on p.fee_category_id = c.id and p.cycle_id = v_cy
                          where c.organization_id = o.id and c.is_active),
          'valor_field', (select fld ->> 'key' from jsonb_array_elements(v.snapshot -> 'fields') fld where fld ->> 'mapping' = 'link.function' limit 1),
          'prices', (select coalesce(jsonb_object_agg(c.function_id::text, p.amount), '{}'::jsonb)
                       from public.fee_categories c join public.fee_cycle_prices p on p.fee_category_id = c.id and p.cycle_id = v_cy
                      where c.organization_id = o.id and c.function_id is not null),
          'ciclo', (select cy.name from public.cycles cy where cy.id = f.cycle_id), 'inicio_ciclo', (select cy.starts_on from public.cycles cy where cy.id = f.cycle_id),
          'fim_ciclo', (select cy.ends_on from public.cycles cy where cy.id = f.cycle_id),
          'whatsapp', s.contact_whatsapp, 'email', s.contact_email, 'chave_pix', s.pix_key,
          'vencimento', (select os.value #>> '{}' from public.org_settings os where os.organization_id = o.id and os.key = 'billing_due_day'))
        from public.shop_settings s where s.organization_id = o.id),
      'full_options', (select coalesce(jsonb_agg(c.instrument_id), '[]'::jsonb) from public.instrument_cycle_capacity c
                        where c.organization_id = o.id and c.cycle_id = v_cy and public.instrument_occupied(c.instrument_id, c.cycle_id) >= c.capacity),
      'header', jsonb_build_object('image_url', f.header_image_url, 'x', f.header_pos_x, 'y', f.header_pos_y, 'zoom', f.header_zoom, 'height', f.header_height, 'logo', f.header_logo_size, 'color', f.header_color),
      'fields', case when st in ('open', 'already') then (select coalesce(jsonb_agg(case when f.access = 'internal' then fld else fld - 'mapping' end), '[]'::jsonb)
                                                           from jsonb_array_elements(v.snapshot -> 'fields') fld) else '[]'::jsonb end));
end $function$
;

CREATE OR REPLACE FUNCTION public.get_public_org(p_slug text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object('name', o.name, 'short_name', o.short_name, 'slug', o.slug,
                            'logo_path', o.logo_path, 'theme', o.theme)
  from public.organizations o where o.slug = p_slug and o.is_active
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_site(p_slug text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'org', jsonb_build_object('slug', o.slug, 'name', o.name, 'short_name', o.short_name, 'logo_path', o.logo_path, 'theme', o.theme),
    'site', case when s.organization_id is null then '{}'::jsonb else jsonb_build_object(
      'headline', s.headline, 'description', s.description, 'photo_url', s.photo_url, 'links', s.links, 'videos', s.videos,
      'enrollment_label', s.enrollment_label, 'shop_label', s.shop_label, 'login_label', s.login_label, 'albums_label', s.albums_label, 'release_label', s.release_label,
      'show_shop', s.show_shop, 'show_enrollment', s.show_enrollment, 'show_login', s.show_login, 'show_albums', s.show_albums, 'show_release', s.show_release,
      'release_url', s.release_url, 'shake_button', s.shake_button, 'menu_order', s.menu_order, 'menu_construction', s.menu_construction,
      'hide_headline', s.hide_headline, 'shop_product_id', s.shop_product_id,
      'show_rays', s.show_rays, 'rays_count', s.rays_count, 'rays_opacity', s.rays_opacity, 'rays_rotation', s.rays_rotation, 'rays_color', s.rays_color,
      'rays_animate', s.rays_animate, 'rays_outline', s.rays_outline, 'rays_outline_color', s.rays_outline_color, 'rays_speed', s.rays_speed, 'rays_full', s.rays_full) end,
    'shop_product', (
      select jsonb_build_object('slug', p.slug, 'name', p.name,
        'image_path', (select i.storage_path from public.shop_product_images i where i.product_id = p.id order by i.sort_order, i.created_at limit 1))
        from public.shop_products p
       where p.id = s.shop_product_id and p.organization_id = o.id and p.is_active and not p.is_hidden),
    'open_forms', coalesce((
      select jsonb_agg(jsonb_build_object('slug', f.slug, 'title', f.title) order by f.created_at)
        from public.forms f
       where f.organization_id = o.id and f.status = 'published'
         and (f.opens_at is null or f.opens_at <= now()) and (f.closes_at is null or f.closes_at >= now())), '[]'::jsonb)
  )
  from public.organizations o
  left join public.site_settings s on s.organization_id = o.id
  where o.slug = p_slug and o.is_active
$function$
;

CREATE OR REPLACE FUNCTION public.give_up_collaboration(p_link uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare l public.member_artistic_links;
begin
  select * into l from public.member_artistic_links where id = p_link and ended_at is null and instrument_id is null and function_id is not null and not is_paid;
  if l.id is null or not public.is_self(l.member_id) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  update public.member_artistic_links set ended_at = current_date where id = p_link;
end $function$
;

CREATE OR REPLACE FUNCTION public.grant_access_role(p_member uuid, p_role_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid; v_role uuid;
begin
  select organization_id into v_org from public.members where id = p_member and archived_at is null;
  if v_org is null then raise exception 'Integrante não encontrado.' using errcode = 'P0002'; end if;
  if not public.has_permission(v_org, 'roles.manage') then raise exception 'Sem permissão para conceder papéis.' using errcode = '42501'; end if;
  if p_role_key = 'titular' then raise exception 'A titularidade só muda por transferência.' using errcode = 'P0001'; end if;
  if p_role_key = 'direcao' and public.has_active_titular(v_org) and not public.caller_is_titular(v_org) then
    raise exception 'Somente o titular do bloco pode conceder ou remover a Direção.' using errcode = 'P0001';
  end if;
  select id into v_role from public.access_roles where organization_id = v_org and key = p_role_key;
  if v_role is null then raise exception 'Papel inválido.' using errcode = 'P0002'; end if;
  if exists (select 1 from public.member_access_roles where member_id = p_member and access_role_id = v_role and revoked_at is null) then return; end if;
  insert into public.member_access_roles (organization_id, member_id, access_role_id, granted_by) values (v_org, p_member, v_role, auth.uid());
end $function$
;

CREATE OR REPLACE FUNCTION public.grant_default_member_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
  select new.organization_id, new.id, ar.id
    from public.access_roles ar
   where ar.organization_id = new.organization_id and ar.key = 'integrante'
     and not exists (select 1 from public.member_access_roles x where x.member_id = new.id and x.access_role_id = ar.id and x.revoked_at is null);
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.grant_new_permission_to_direction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.role_permissions (access_role_id, permission_key, scope)
  select ar.id, new.key, 'org' from public.access_roles ar where ar.key in ('direcao', 'titular')
  on conflict do nothing;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.group_scoped_permissions()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select array['members.read', 'attendance.read', 'attendance.record', 'member_cycles.read', 'member_cycles.manage']
$function$
;

CREATE OR REPLACE FUNCTION public.guard_category_section()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_sec uuid; v_cat text; v_mine uuid[]; v_names text;
begin
  if not exists (select 1 from public.cycles c where c.id = new.cycle_id and c.ends_on >= current_date) then return new; end if;
  select fc.section_id, fc.name into v_sec, v_cat from public.fee_categories fc where fc.id = new.fee_category_id;
  if v_sec is null then return new; end if;
  v_mine := public.member_cycle_sections(new.member_id, new.cycle_id);
  if cardinality(v_mine) = 0 or v_sec = any (v_mine) then return new; end if;
  select string_agg(s.name, ', ') into v_names from public.sections s where s.id = any (v_mine);
  raise exception 'A categoria "%" é de outro naipe: o instrumento desta pessoa é de %. Escolha a categoria do naipe dela.', v_cat, v_names using errcode = 'P0001';
end $function$
;

CREATE OR REPLACE FUNCTION public.guard_consent_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if (new.id, new.organization_id, new.member_id, new.purpose, new.text_version, new.granted_at)
     is distinct from (old.id, old.organization_id, old.member_id, old.purpose, old.text_version, old.granted_at)
     or old.revoked_at is not null or new.revoked_at is null then
    raise exception 'O aceite só pode ser revogado.' using errcode = '42501';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.guard_last_director_archive()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if old.archived_at is null and new.archived_at is not null then
    if auth.uid() is not null and exists (select 1 from public.member_access_roles mar join public.access_roles ar on ar.id = mar.access_role_id and ar.key = 'titular'
                                          where mar.member_id = old.id and mar.revoked_at is null) then
      raise exception 'Transfira a titularidade antes de arquivar o titular do bloco.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.member_access_roles mar join public.access_roles ar on ar.id = mar.access_role_id and ar.key in ('direcao', 'titular')
               where mar.member_id = old.id and mar.revoked_at is null) and public.active_director_count(old.organization_id, old.id) = 0 then
      raise exception 'Não é possível arquivar o último diretor. Conceda o papel Direção a outra pessoa primeiro.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.guard_last_director_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_key text;
begin
  if old.revoked_at is null and new.revoked_at is not null then
    select key into v_key from public.access_roles where id = old.access_role_id;
    if v_key in ('direcao', 'titular') and public.active_director_count(old.organization_id, old.member_id) = 0
       and not exists (select 1 from public.member_access_roles x join public.access_roles ax on ax.id = x.access_role_id and ax.key in ('direcao', 'titular')
                       where x.member_id = old.member_id and x.revoked_at is null and x.id <> old.id) then
      raise exception 'Não é possível remover o último diretor. Conceda o papel Direção a outra pessoa primeiro.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.guard_member_role_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.access_role_id is distinct from old.access_role_id or new.member_id is distinct from old.member_id
     or new.organization_id is distinct from old.organization_id then
    raise exception 'Papel, pessoa e organização de uma concessão não mudam. Revogue e conceda de novo.' using errcode = 'P0001';
  end if;
  if old.revoked_at is not null and new.revoked_at is null then
    raise exception 'Papel revogado não volta por edição. Conceda de novo.' using errcode = 'P0001';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.guard_member_user_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' and new.user_id is not null then
    raise exception 'A conta de acesso só é vinculada pelo próprio integrante.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'A conta de acesso só é vinculada pelo próprio integrante.' using errcode = '42501';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.guard_participation_section()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_sec uuid; v_cat text; v_mine uuid[]; v_names text;
begin
  if not exists (select 1 from public.cycles c where c.id = new.cycle_id and c.ends_on >= current_date) then return null; end if;
  select fc.section_id, fc.name into v_sec, v_cat
    from public.cycle_fee_assignments fa join public.fee_categories fc on fc.id = fa.fee_category_id
   where fa.member_id = new.member_id and fa.cycle_id = new.cycle_id limit 1;
  if v_sec is null then return null; end if;
  v_mine := public.member_cycle_sections(new.member_id, new.cycle_id);
  if cardinality(v_mine) = 0 or v_sec = any (v_mine) then return null; end if;
  select string_agg(s.name, ', ') into v_names from public.sections s where s.id = any (v_mine);
  raise exception 'Esta pessoa está na categoria "%", que é de outro naipe (instrumento de %). Troque a categoria antes de mudar o instrumento.', v_cat, v_names using errcode = 'P0001';
end $function$
;

CREATE OR REPLACE FUNCTION public.guard_privileged_roles()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_key text; v_revoking boolean;
begin
  if auth.uid() is null then return new; end if;
  select key into v_key from public.access_roles where id = new.access_role_id;
  if v_key not in ('direcao', 'titular') then return new; end if;
  v_revoking := tg_op = 'UPDATE' and old.revoked_at is null and new.revoked_at is not null;
  if tg_op = 'UPDATE' and not v_revoking then return new; end if;
  if v_key = 'titular' then
    if not public.caller_is_titular(new.organization_id) then
      raise exception 'Somente o titular do bloco pode designar ou transferir a titularidade.' using errcode = 'P0001';
    end if;
    if v_revoking and not public.has_active_titular(new.organization_id, old.member_id) then
      raise exception 'O bloco precisa ter um titular. Use a transferência de titularidade.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if public.has_active_titular(new.organization_id) and not public.caller_is_titular(new.organization_id) then
    raise exception 'Somente o titular do bloco pode conceder ou remover a Direção.' using errcode = 'P0001';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.guard_role_permissions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_key text; v_perm text;
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  select key into v_key from public.access_roles where id = coalesce(new.access_role_id, old.access_role_id);
  v_perm := coalesce(new.permission_key, old.permission_key);
  if tg_op = 'DELETE' then
    if v_key in ('direcao', 'titular') then raise exception 'A Direção e o Titular sempre possuem todas as permissões.' using errcode = 'P0001'; end if;
    return old;
  end if;
  if v_key in ('direcao', 'titular') and new.scope <> 'org' then
    raise exception 'A Direção e o Titular sempre possuem todas as permissões em toda a organização.' using errcode = 'P0001';
  end if;
  if v_key not in ('direcao', 'titular') and v_perm = any (public.locked_permissions()) then
    raise exception 'Esta permissão é exclusiva da Direção.' using errcode = 'P0001';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.has_active_titular(p_org uuid, p_except_member uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.member_access_roles mar
    join public.access_roles ar on ar.id = mar.access_role_id and ar.key = 'titular'
    join public.members m on m.id = mar.member_id and m.archived_at is null
    where mar.organization_id = p_org and mar.revoked_at is null and (p_except_member is null or mar.member_id <> p_except_member))
$function$
;

CREATE OR REPLACE FUNCTION public.has_permission(p_org uuid, p_perm text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(public.permission_scope_of(p_org, p_perm) = 'org', false)
$function$
;

CREATE OR REPLACE FUNCTION public.import_backup(p_org uuid, p_label text, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid; counts jsonb := '{}'::jsonb; t text;
begin
  if not public.has_permission(p_org, 'backups.manage') then raise exception 'Sem permissão para carregar backups.' using errcode = '42501'; end if;
  if (p_data -> 'meta' ->> 'organization_id')::uuid is distinct from p_org or jsonb_typeof(p_data -> 'tables') <> 'object' then
    raise exception 'Este arquivo não é um backup válido deste bloco.' using errcode = 'P0001';
  end if;
  for t in select jsonb_object_keys(p_data -> 'tables') loop
    counts := counts || jsonb_build_object(t, jsonb_array_length(p_data -> 'tables' -> t));
  end loop;
  insert into public.backups (organization_id, label, kind, size_bytes, table_counts, data)
  values (p_org, left(coalesce(nullif(trim(p_label), ''), 'Backup carregado'), 200), 'imported', octet_length(p_data::text), counts, p_data) returning id into v_id;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.infinitepay_claim_transaction(p_tx text, p_kind text, p_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.infinitepay_transactions;
begin
  if coalesce(p_tx, '') = '' or p_kind not in ('shop', 'charge') or coalesce(p_code, '') = '' then return false; end if;
  insert into public.infinitepay_transactions (transaction_nsu, kind, code) values (p_tx, p_kind, upper(trim(p_code))) on conflict do nothing;
  select * into r from public.infinitepay_transactions where transaction_nsu = p_tx;
  return r.kind = p_kind and r.code = upper(trim(p_code));
end $function$
;

CREATE OR REPLACE FUNCTION public.insert_section_template(p_form uuid, p_template uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare f public.forms; t public.form_section_templates; sec public.form_fields; r public.form_fields; pos int; k text; nk text; i int; keymap jsonb := '{}'::jsonb;
  mp text; v_unlinked int := 0; v_n int := 0; cond jsonb;
begin
  select * into f from public.forms where id = p_form;
  select * into t from public.form_section_templates where id = p_template;
  if f.id is null or t.id is null or t.organization_id <> f.organization_id or not public.has_permission(f.organization_id, 'forms.manage') then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  select * into sec from public.form_fields where id = t.section_id;
  select coalesce(max(sort_order), 0) + 1 into pos from public.form_fields where form_id = p_form;
  insert into public.form_fields (organization_id, form_id, field_key, label, description, field_type, required, sort_order, validation, source_template_id)
  values (f.organization_id, p_form, 'sec_' || substr(md5(random()::text), 1, 8), sec.label, sec.description, 'info', false, pos, sec.validation, p_template);
  for r in select * from public.form_fields x where x.form_id = t.form_id and x.id <> t.section_id and x.is_active order by x.sort_order loop
    pos := pos + 1;
    k := r.field_key; nk := k; i := 2;
    while exists (select 1 from public.form_fields where form_id = p_form and field_key = nk) loop nk := left(k, 36) || '_' || i; i := i + 1; end loop;
    keymap := keymap || jsonb_build_object(k, nk);
    mp := r.member_mapping;
    if mp is not null and mp <> 'member.custom' and exists (select 1 from public.form_fields where form_id = p_form and is_active and member_mapping = mp) then
      mp := null; v_unlinked := v_unlinked + 1;
    end if;
    cond := r.condition;
    if cond is not null and jsonb_typeof(cond) = 'object' and keymap ? (cond ->> 'field') then
      cond := jsonb_set(cond, '{field}', to_jsonb(keymap ->> (cond ->> 'field')));
    end if;
    insert into public.form_fields (organization_id, form_id, field_key, label, description, field_type, required, sort_order, options, default_value, validation, condition, member_mapping)
    values (f.organization_id, p_form, nk, r.label, r.description, r.field_type, r.required, pos, r.options, r.default_value, r.validation, cond, mp);
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('fields', v_n, 'unlinked', v_unlinked);
end $function$
;

CREATE OR REPLACE FUNCTION public.instrument_occupied(p_instrument uuid, p_cycle uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select count(distinct mc.member_id)::int
  from public.member_cycles mc
  join public.members m on m.id = mc.member_id and m.archived_at is null
  join public.member_cycle_statuses s on s.id = mc.status_id and s.counts_as_active
  join public.cycle_participations p on p.member_id = mc.member_id and p.cycle_id = mc.cycle_id and p.instrument_id = p_instrument
  where mc.cycle_id = p_cycle
$function$
;

CREATE OR REPLACE FUNCTION public.is_in_my_group(p_org uuid, p_member uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.staff_assignments sa
    join public.member_artistic_links l on l.member_id = p_member and l.ended_at is null
    join public.instruments i on i.id = l.instrument_id
    where sa.organization_id = p_org
      and sa.member_id = public.current_member_id(p_org)
      and (sa.valid_to is null or sa.valid_to >= current_date)
      and sa.cycle_id = (select c.id from public.cycles c where c.organization_id = p_org and c.is_current limit 1)
      and (sa.instrument_id = i.id or sa.section_id = i.section_id)
  )
$function$
;

CREATE OR REPLACE FUNCTION public.is_org_member(p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.members m
    join public.organizations o on o.id = m.organization_id and o.is_active
    where m.organization_id = p_org and m.user_id = auth.uid() and m.archived_at is null
  )
$function$
;

CREATE OR REPLACE FUNCTION public.is_self(p_member uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.members m
    where m.id = p_member and m.user_id = auth.uid() and m.archived_at is null
  )
$function$
;

CREATE OR REPLACE FUNCTION public.is_staff(p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(public.permission_scope_of(p_org, 'members.read')::text in ('group', 'org'), false)
$function$
;

CREATE OR REPLACE FUNCTION public.link_list_to_levels(p_list uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare l public.form_lists; n int := 0;
begin
  select * into l from public.form_lists where id = p_list;
  if l.id is null or not public.has_permission(l.organization_id, 'forms.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if l.kind <> 'custom' then raise exception 'Só listas criadas por você podem ser ligadas.' using errcode = 'P0001'; end if;
  if l.link is not null then return 0; end if;
  insert into public.skill_levels (organization_id, name, sort_order, is_active, description, list_id)
  select i.organization_id, i.name, i.sort_order, i.is_active, i.description, l.id from public.form_list_items i where i.list_id = l.id;
  get diagnostics n = row_count;
  update public.form_lists set link = 'skill_level' where id = l.id;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.link_my_member_by_email()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_email text; v_ok boolean; n int := 0; m record;
begin
  if auth.uid() is null then return 0; end if;
  select lower(email), (email_confirmed_at is not null) into v_email, v_ok from auth.users where id = auth.uid();
  if v_email is null or not coalesce(v_ok, false) then return 0; end if;
  for m in
    select mm.id, mm.organization_id from public.members mm
     where mm.user_id is null and mm.archived_at is null
       and (lower(mm.email) = v_email or exists (select 1 from public.member_emails e where e.member_id = mm.id and e.email = v_email))
  loop
    if exists (select 1 from public.members x where x.organization_id = m.organization_id and x.user_id = auth.uid()) then continue; end if;
    update public.members set user_id = auth.uid() where id = m.id and user_id is null;
    if found then
      n := n + 1;
      insert into public.audit_logs (organization_id, actor_user_id, actor_member_id, action, entity_type, entity_id)
      values (m.organization_id, auth.uid(), m.id, 'member_linked_by_email', 'members', m.id::text);
    end if;
  end loop;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.list_backups(p_org uuid)
 RETURNS TABLE(id uuid, label text, kind text, created_at timestamp with time zone, created_by_name text, size_bytes bigint, table_counts jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.has_permission(p_org, 'backups.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  return query
    select b.id, b.label, b.kind, b.created_at,
           (select coalesce(m.display_name, m.full_name) from public.members m where m.user_id = b.created_by and m.organization_id = p_org limit 1),
           b.size_bytes, b.table_counts
      from public.backups b where b.organization_id = p_org order by b.created_at desc;
end $function$
;

CREATE OR REPLACE FUNCTION public.list_member_categories(p_org uuid, p_cycle uuid DEFAULT NULL::uuid)
 RETURNS TABLE(member_id uuid, category_id uuid, category_name text, is_extra boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with cy as (select coalesce(p_cycle, (select c.id from public.cycles c where c.organization_id = p_org and c.is_current and c.is_active limit 1)) as id)
  select a.member_id, c.id, c.name, false
    from public.cycle_fee_assignments a
    join public.fee_categories c on c.id = a.fee_category_id
   where a.organization_id = p_org and a.cycle_id = (select id from cy)
     and public.is_org_member(p_org) and public.can_read_member(p_org, a.member_id)
  union all
  select e.member_id, c.id, c.name, true
    from public.cycle_extra_categories e
    join public.fee_categories c on c.id = e.fee_category_id
   where e.organization_id = p_org and e.cycle_id = (select id from cy)
     and public.is_org_member(p_org) and public.can_read_member(p_org, e.member_id)
$function$
;

CREATE OR REPLACE FUNCTION public.locked_permissions()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select array['org.manage', 'settings.manage', 'roles.manage', 'audit.read', 'members.sensitive.read', 'members.sensitive.manage',
               'finance.read', 'finance.manage', 'billing.manage', 'scholarships.manage', 'staff_payments.manage', 'staff_assignments.manage', 'forms.manage',
               'members.manage', 'backups.manage']
$function$
;

CREATE OR REPLACE FUNCTION public.log_member_cycle_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' or new.status_id is distinct from old.status_id then
    insert into public.member_cycle_status_history
      (organization_id, member_cycle_id, old_status_id, new_status_id, changed_by, notes)
    values (new.organization_id, new.id, case when tg_op = 'UPDATE' then old.status_id end, new.status_id,
            public.current_member_id(new.organization_id), new.notes);
  end if;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.log_sensitive_access(p_member uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid;
begin
  select organization_id into v_org from public.members where id = p_member;
  if v_org is null or public.is_self(p_member) then return; end if;
  if not public.has_permission(v_org, 'members.sensitive.read') then
    raise exception 'Sem permissão para dados sensíveis.' using errcode = '42501';
  end if;
  insert into public.audit_logs (organization_id, actor_user_id, actor_member_id, action, entity_type, entity_id)
  values (v_org, auth.uid(), public.current_member_id(v_org), 'sensitive_read', 'member_sensitive_data', p_member::text);
end $function$
;

CREATE OR REPLACE FUNCTION public.make_backup(p_org uuid, p_label text, p_kind text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t text; rows jsonb; snap jsonb := '{}'::jsonb; counts jsonb := '{}'::jsonb; v_id uuid;
begin
  select coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb) into rows from public.organizations o where o.id = p_org;
  snap := jsonb_build_object('organizations', rows);
  foreach t in array public.backup_table_order() loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x where x.organization_id = $1', t) into rows using p_org;
    snap := snap || jsonb_build_object(t, rows);
    counts := counts || jsonb_build_object(t, jsonb_array_length(rows));
  end loop;
  snap := jsonb_build_object('meta', jsonb_build_object('version', 1, 'organization_id', p_org, 'created_at', now()), 'tables', snap);
  insert into public.backups (organization_id, label, kind, size_bytes, table_counts, data)
  values (p_org, left(trim(p_label), 200), p_kind, octet_length(snap::text), counts, snap) returning id into v_id;
  if p_kind = 'auto' then
    delete from public.backups where organization_id = p_org and kind = 'auto'
      and id not in (select id from public.backups where organization_id = p_org and kind = 'auto' order by created_at desc limit 20);
  end if;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.mark_charge_paid(p_charge uuid, p_paid_on date, p_method text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.monthly_charges;
begin
  select * into c from public.monthly_charges where id = p_charge;
  if c.id is null then raise exception 'Cobrança não encontrada.' using errcode = 'P0002'; end if;
  perform public.require_billing(c.organization_id);
  if c.status <> 'pending' then raise exception 'Só cobranças pendentes podem ser baixadas.' using errcode = 'P0001'; end if;
  update public.monthly_charges set status = 'paid', paid_on = p_paid_on, payment_method = nullif(trim(p_method), '') where id = p_charge;
end $function$
;

CREATE OR REPLACE FUNCTION public.mark_staff_payment_paid(p_payment uuid, p_paid_on date, p_method text DEFAULT 'PIX'::text, p_pix text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.staff_payments; v_key text;
begin
  select * into p from public.staff_payments where id = p_payment;
  if p.id is null then raise exception 'Pagamento não encontrado.' using errcode = 'P0002'; end if;
  perform public.require_finance(p.organization_id, 'staff_payments.manage');
  if p.status <> 'pending' then raise exception 'Só pagamentos pendentes podem ser baixados.' using errcode = 'P0001'; end if;
  v_key := coalesce(nullif(trim(p_pix), ''),
    (select k.key_value from public.member_pix_keys k where k.member_id = p.member_id and k.is_default and k.archived_at is null));
  update public.staff_payments set status = 'paid', paid_on = p_paid_on, payment_method = nullif(trim(p_method), ''), pix_key_snapshot = v_key
   where id = p_payment;
end $function$
;

CREATE OR REPLACE FUNCTION public.materialize_recurrences(p_org uuid, p_until date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.recurrence_rules; n int := 0; c int; v_end date;
begin
  if not public.has_permission(p_org, 'events.manage') then
    raise exception 'Sem permissão para gerar eventos.' using errcode = '42501';
  end if;
  for r in select * from public.recurrence_rules where organization_id = p_org and is_active loop
    v_end := coalesce(r.until, (
      select cy.ends_on from public.cycles cy
       where cy.organization_id = r.organization_id and cy.is_active
         and (r.starts_on between cy.starts_on and cy.ends_on or cy.is_current)
       order by (r.starts_on between cy.starts_on and cy.ends_on) desc, cy.is_current desc limit 1), p_until);
    insert into public.activities (organization_id, activity_type_id, cycle_id, title, activity_date, start_time, end_time,
                                   location, description, visibility, recurrence_rule_id, itinerary, has_attendance)
    select r.organization_id, r.activity_type_id,
           (select cy.id from public.cycles cy
             where cy.organization_id = r.organization_id and cy.is_active and g.d::date between cy.starts_on and cy.ends_on
             order by cy.is_current desc, cy.starts_on desc limit 1),
           r.title, g.d::date, r.start_time, r.end_time, r.location, r.description, r.visibility, r.id, r.itinerary, r.has_attendance
    from generate_series(r.starts_on::timestamp, least(v_end, p_until)::timestamp, interval '1 day') as g(d)
    where extract(dow from g.d) = r.weekday and not exists (select 1 from public.recurrence_skips sk where sk.rule_id = r.id and sk.activity_date = g.d::date)
    on conflict do nothing;
    get diagnostics c = row_count;
    n := n + c;
    if jsonb_array_length(r.audiences) > 0 then
      insert into public.activity_audiences (organization_id, activity_id, kind, ref_id)
      select a.organization_id, a.id, x.elem ->> 'kind', (x.elem ->> 'ref')::uuid
        from public.activities a
        cross join jsonb_array_elements(r.audiences) as x(elem)
       where a.recurrence_rule_id = r.id
         and not exists (select 1 from public.activity_audiences au where au.activity_id = a.id)
         and not a.customized
      on conflict do nothing;
    end if;
    if cardinality(r.extra_type_ids) > 0 then
      insert into public.activity_type_links (organization_id, activity_id, activity_type_id)
      select a.organization_id, a.id, t
        from public.activities a cross join unnest(r.extra_type_ids) as t
       where a.recurrence_rule_id = r.id and not a.customized and t <> a.activity_type_id
         and not exists (select 1 from public.activity_type_links l where l.activity_id = a.id)
      on conflict do nothing;
    end if;
  end loop;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.member_cycle_sections(p_member uuid, p_cycle uuid)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(array_agg(distinct coalesce(i.section_id, af.section_id)) filter (where coalesce(i.section_id, af.section_id) is not null), '{}')
    from public.cycle_participations cp
    left join public.instruments i on i.id = cp.instrument_id
    left join public.artistic_functions af on af.id = cp.function_id
   where cp.member_id = p_member and cp.cycle_id = p_cycle
$function$
;

CREATE OR REPLACE FUNCTION public.member_directory_active(p_org uuid)
 RETURNS TABLE(member_id uuid, name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_org_member(p_org) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  -- respeita a configuração do diretório (hoje 'all_members')
  if coalesce((select s.value #>> '{}' from public.org_settings s where s.organization_id = p_org and s.key = 'member_directory_visibility'), 'all_members') <> 'all_members' then return; end if;
  return query
    select m.id, n.name from public.members m
    cross join lateral (select coalesce(nullif(btrim(m.display_name), ''), split_part(btrim(m.full_name), ' ', 1)) as name) n
    where m.organization_id = p_org and m.archived_at is null
      and exists (select 1 from public.member_cycles mc join public.cycles c on c.id = mc.cycle_id and c.is_current
                  join public.member_cycle_statuses s on s.id = mc.status_id and s.counts_as_active where mc.member_id = m.id)
    order by n.name;
end $function$
;

CREATE OR REPLACE FUNCTION public.member_initials(p_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  with w as (
    select x, o from unnest(regexp_split_to_array(btrim(regexp_replace(coalesce(p_name, ''), '\([^)]*\)', ' ', 'g')), '\s+')) with ordinality as t(x, o)
     where x ~ '^[[:alpha:]]'
  )
  select coalesce(upper((select left(x, 1) from w order by o limit 1)), '?')
      || coalesce(upper((select left(x, 1) from w where o > 1 and lower(x) not in ('de', 'da', 'do', 'das', 'dos', 'e') order by o desc limit 1)), '')
$function$
;

CREATE OR REPLACE FUNCTION public.member_is_inactive(p_member uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
      from public.member_cycles mc
      join public.cycles c on c.id = mc.cycle_id and c.is_current
      join public.member_cycle_statuses s on s.id = mc.status_id and not s.counts_as_active and not s.is_waitlist
     where mc.member_id = p_member
  ) and not exists (
    select 1 from public.member_access_roles mar join public.access_roles ar on ar.id = mar.access_role_id
     where mar.member_id = p_member and mar.revoked_at is null and ar.key in ('titular', 'direcao')
  )
$function$
;

CREATE OR REPLACE FUNCTION public.member_photos(p_org uuid)
 RETURNS TABLE(member_id uuid, photo_path text, initials text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_org_member(p_org) then raise exception 'Sem acesso.' using errcode = '42501'; end if;
  return query select m.id, m.photo_path, public.member_initials(m.full_name) from public.members m where m.organization_id = p_org and m.archived_at is null;
end $function$
;

CREATE OR REPLACE FUNCTION public.my_participation(p_member uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m public.members; v_cycle public.cycles; res jsonb;
  v_cat text; v_price numeric; v_pct numeric; v_exempt text; v_paid text; v_active boolean;
begin
  select * into m from public.members where id = p_member;
  if m.id is null or not (public.is_self(p_member) or public.has_permission(m.organization_id, 'members.manage')) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  select * into v_cycle from public.cycles where organization_id = m.organization_id and is_current and is_active limit 1;
  if v_cycle.id is not null then
    select f.category_name, f.base_amount, f.percent, f.exempt_by, f.paid_by, f.is_active
      into v_cat, v_price, v_pct, v_exempt, v_paid, v_active
      from public.billing_member_fee(p_member, v_cycle.id) f;
  end if;
  select jsonb_build_object(
    'artistic', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'name', i.name, 'section', s.name, 'level', sl.name) order by l.created_at)
        from public.member_artistic_links l join public.instruments i on i.id = l.instrument_id
        left join public.sections s on s.id = i.section_id left join public.skill_levels sl on sl.id = l.skill_level_id
        where l.member_id = p_member and l.ended_at is null and l.instrument_id is not null), '[]'::jsonb),
    'collab', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'name', af.name,
          'exempt', af.exempt_locked or coalesce((select e.is_exempt from public.fee_cycle_exempt e where e.function_id = af.id and e.cycle_id = v_cycle.id), af.is_exempt)) order by l.created_at)
        from public.member_artistic_links l join public.artistic_functions af on af.id = l.function_id
        where l.member_id = p_member and l.ended_at is null and l.instrument_id is null and not l.is_paid), '[]'::jsonb),
    'paid', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'name', af.name) order by l.created_at)
        from public.member_artistic_links l join public.artistic_functions af on af.id = l.function_id
        where l.member_id = p_member and l.ended_at is null and l.instrument_id is null and l.is_paid), '[]'::jsonb),
    'cycle', v_cycle.name,
    'category', v_cat, 'price', v_price, 'percent', coalesce(v_pct, 0), 'exempt_by', v_exempt, 'paid_by', v_paid, 'active', coalesce(v_active, false),
    'requests', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'action', r.action, 'status', r.status, 'created_at', r.created_at,
          'label', coalesce(i.name, af.name, (select coalesce(i2.name, af2.name) from public.member_artistic_links l2
              left join public.instruments i2 on i2.id = l2.instrument_id left join public.artistic_functions af2 on af2.id = l2.function_id
              where l2.id = r.link_id))) order by r.created_at desc)
        from (select * from public.participation_requests where member_id = p_member order by created_at desc limit 10) r
        left join public.instruments i on i.id = r.instrument_id left join public.artistic_functions af on af.id = r.function_id), '[]'::jsonb)
  ) into res;
  return res;
end $function$
;

CREATE OR REPLACE FUNCTION public.my_submission_info()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((select jsonb_build_object('status', s.status, 'message', case when f.review_enabled then f.review_message end)
                     from public.form_submissions s join public.forms f on f.id = s.form_id
                    where s.applicant_user_id = auth.uid() order by s.submitted_at desc limit 1),
                  jsonb_build_object('status', 'none', 'message', null))
$function$
;

CREATE OR REPLACE FUNCTION public.my_submission_status()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((select s.status from public.form_submissions s where s.applicant_user_id = auth.uid() order by s.submitted_at desc limit 1), 'none')
$function$
;

CREATE OR REPLACE FUNCTION public.next_business_day(p_org uuid, p_date date)
 RETURNS date
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare d date := p_date;
begin
  while extract(isodow from d) in (6, 7) or exists (select 1 from public.holidays h where h.organization_id = p_org and h.day = d) loop
    d := d + 1;
  end loop;
  return d;
end $function$
;

CREATE OR REPLACE FUNCTION public.parse_drive_folder_id(p_input text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select coalesce(
    (regexp_match(trim(p_input), 'folders/([A-Za-z0-9_-]{10,})'))[1],
    (regexp_match(trim(p_input), '[?&]id=([A-Za-z0-9_-]{10,})'))[1],
    case when trim(p_input) ~ '^[A-Za-z0-9_-]{10,}$' then trim(p_input) end)
$function$
;

CREATE OR REPLACE FUNCTION public.permission_scope_of(p_org uuid, p_perm text)
 RETURNS permission_scope
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select x.s from (
    select case when i.inactive then 'own'::public.permission_scope else rp.scope end as s
    from public.members m
    cross join lateral (select public.member_is_inactive(m.id) as inactive) i
    join public.member_access_roles mar on mar.member_id = m.id and mar.revoked_at is null
    join public.role_permissions rp on rp.access_role_id = mar.access_role_id
    where m.organization_id = p_org and m.user_id = auth.uid() and m.archived_at is null
      and rp.permission_key = p_perm
      and (not i.inactive or p_perm in ('members.read', 'billing.read', 'attendance.read'))
  ) x
  order by x.s desc
  limit 1
$function$
;

CREATE OR REPLACE FUNCTION public.post_financial_entry(p_org uuid, p_category uuid, p_description text, p_amount numeric, p_occurred_on date, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_kind text; v_id uuid;
begin
  perform public.require_finance(p_org);
  select kind into v_kind from public.finance_categories where id = p_category and organization_id = p_org and is_active;
  if v_kind is null then raise exception 'Categoria inválida.' using errcode = 'P0002'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Informe um valor maior que zero.' using errcode = '22003'; end if;
  insert into public.financial_entries (organization_id, kind, category_id, description, amount, occurred_on, notes)
  values (p_org, v_kind, p_category, trim(p_description), p_amount, p_occurred_on, nullif(trim(p_notes), '')) returning id into v_id;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.publish_form(p_form uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare f public.forms; v_fields jsonb; v_ver int; v_id uuid; v_dup text; r record;
begin
  select * into f from public.forms where id = p_form;
  if f.id is null or not public.has_permission(f.organization_id, 'forms.manage') then
    raise exception 'Sem permissão para publicar este formulário.' using errcode = '42501';
  end if;
  if f.status = 'archived' then raise exception 'Formulário arquivado. Duplique-o para reutilizar.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.form_fields where form_id = p_form and is_active and field_type <> 'info') then
    raise exception 'Adicione ao menos um campo de resposta antes de publicar.' using errcode = 'P0001';
  end if;
  select member_mapping into v_dup from public.form_fields where form_id = p_form and is_active and member_mapping is not null and member_mapping <> 'member.custom'
    group by member_mapping having count(*) > 1 limit 1;
  if v_dup is not null then raise exception 'Mais de um campo está ligado a "%". Cada campo do cadastro só pode ser preenchido por um campo.', v_dup using errcode = 'P0001'; end if;
  for r in select a.label, a.condition ->> 'field' as ref, a.sort_order from public.form_fields a where a.form_id = p_form and a.is_active and a.condition is not null loop
    if not exists (select 1 from public.form_fields b where b.form_id = p_form and b.is_active and b.field_key = r.ref and b.sort_order < r.sort_order) then
      raise exception 'A condição do campo "%" deve depender de um campo que venha antes dele.', r.label using errcode = 'P0001';
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
      'key', x.field_key, 'label', x.label, 'description', x.description, 'type', x.field_type, 'required', x.required,
      'options', case
        when x.member_mapping = 'link.instrument' and false then
          (select coalesce(jsonb_agg(jsonb_build_object('value', i.id, 'label', i.name) order by i.sort_order, i.name), '[]'::jsonb) from public.instruments i where i.organization_id = f.organization_id and i.is_active)
        when x.member_mapping = 'link.function' and false then
          (select coalesce(jsonb_agg(jsonb_build_object('value', i.id, 'label', i.name) order by i.sort_order, i.name), '[]'::jsonb) from public.artistic_functions i where i.organization_id = f.organization_id and i.is_active)
        when x.member_mapping = 'link.skill_level' and false then
          (select coalesce(jsonb_agg(jsonb_build_object('value', i.id, 'label', i.name) order by i.sort_order, i.name), '[]'::jsonb) from public.skill_levels i where i.organization_id = f.organization_id and i.is_active)
        else x.options end,
      'default', x.default_value, 'validation', x.validation, 'condition', x.condition, 'mapping', x.member_mapping) order by x.sort_order, x.created_at), '[]'::jsonb)
    into v_fields from public.form_fields x where x.form_id = p_form and x.is_active;

  select coalesce(max(version), 0) + 1 into v_ver from public.form_versions where form_id = p_form;
  insert into public.form_versions (organization_id, form_id, version, snapshot)
  values (f.organization_id, p_form, v_ver, jsonb_build_object(
    'title', f.title, 'description', f.description, 'privacy_text', f.privacy_text, 'requires_consent', f.requires_consent,
    'prevent_duplicates', f.prevent_duplicates, 'confirmation_message', f.confirmation_message, 'fields', v_fields))
  returning id into v_id;
  update public.forms set status = 'published', published_version_id = v_id where id = p_form;
  insert into public.audit_logs (organization_id, actor_user_id, actor_member_id, action, entity_type, entity_id, new_data)
  values (f.organization_id, auth.uid(), public.current_member_id(f.organization_id), 'form_published', 'forms', p_form::text, jsonb_build_object('version', v_ver));
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.purge_form(p_form uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare f public.forms;
begin
  select * into f from public.forms where id = p_form;
  if f.id is null or not public.has_permission(f.organization_id, 'forms.manage') then
    raise exception 'Sem permissão para apagar este formulário.' using errcode = '42501';
  end if;
  if f.status <> 'archived' then
    raise exception 'Mande o formulário para a lixeira antes de excluir de vez.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.form_submissions s where s.form_id = f.id) then
    raise exception 'Este formulário tem respostas e não pode ser excluído de vez. Ele fica na lixeira.' using errcode = 'P0001';
  end if;
  update public.forms set published_version_id = null where id = f.id;
  delete from public.form_upload_tokens where form_id = f.id;
  delete from public.form_fields where form_id = f.id;
  delete from public.form_versions where form_id = f.id;
  delete from public.forms where id = f.id;
end $function$
;

CREATE OR REPLACE FUNCTION public.purge_old_submissions(p_org uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_paths text[]; v_queued text[];
begin
  if not public.has_permission(p_org, 'forms.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  v_paths := public._purge_old_submissions(p_org);
  with d as (delete from public.storage_delete_queue where organization_id = p_org and bucket = 'form-uploads' returning path)
  select array_agg(path) into v_queued from d;
  return coalesce(v_paths, '{}') || coalesce(v_queued, '{}');
end $function$
;

CREATE OR REPLACE FUNCTION public.purge_trashed(p_table text, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare perm text; v_org uuid; v_trashed boolean;
begin
  perm := case p_table
    when 'checklist_templates' then 'checklists.manage' when 'checklist_template_items' then 'checklists.manage'
    when 'drive_folders' then 'drive.manage'
    when 'members' then 'members.manage'
    when 'repertoires' then 'repertoire.manage' when 'songs' then 'repertoire.manage'
    when 'shop_pickup_points' then 'shop.manage' when 'shop_products' then 'shop.manage' when 'shop_stock_items' then 'shop.manage'
    when 'form_lists' then 'forms.manage' when 'form_list_items' then 'forms.manage'
    when 'social_networks' then 'forms.manage' when 'gender_options' then 'forms.manage' when 'race_options' then 'forms.manage'
    when 'skill_levels' then 'structure.manage'
    else null end;
  if perm is null then raise exception 'Este tipo de item não pode ser excluído de vez.' using errcode = 'P0001'; end if;
  if p_table = 'members' then
    execute 'select organization_id, archived_at is not null from public.members where id = $1' into v_org, v_trashed using p_id;
  else
    execute format('select organization_id, not is_active from public.%I where id = $1', p_table) into v_org, v_trashed using p_id;
  end if;
  if v_org is null then raise exception 'Item não encontrado.' using errcode = 'P0002'; end if;
  if not public.has_permission(v_org, perm) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if not coalesce(v_trashed, false) then raise exception 'Só dá para excluir de vez o que está na lixeira.' using errcode = 'P0001'; end if;
  if p_table = 'members' then
    delete from public.member_access_roles where member_id = p_id;
    delete from public.member_cycles where member_id = p_id and joined_on is null and left_on is null;
  end if;
  execute format('delete from public.%I where id = $1', p_table) using p_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.refresh_current_cycle(p_org uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_pick uuid;
begin
  if not public.is_org_member(p_org) then return; end if;
  select id into v_pick from public.cycles
   where organization_id = p_org and is_active and (now() at time zone 'America/Sao_Paulo')::date between starts_on and ends_on
   order by starts_on desc limit 1;
  if v_pick is null then return; end if;
  update public.cycles set is_current = false where organization_id = p_org and is_current and id <> v_pick;
  update public.cycles set is_current = true where id = v_pick and not is_current;
end $function$
;

CREATE OR REPLACE FUNCTION public.reject_submission(p_id uuid, p_message text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.form_submissions; msg text;
begin
  select * into s from public.form_submissions where id = p_id;
  if s.id is null or not public.has_permission(s.organization_id, 'forms.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  msg := nullif(btrim(coalesce(p_message, '')), '');
  update public.form_submissions set status = 'rejected', reviewed_at = now(), applicant_message = msg where id = p_id;
  if s.applicant_email is not null and coalesce((select fm.rejected_enabled from public.forms fm where fm.id = s.form_id), true) then
    insert into public.form_email_outbox (organization_id, submission_id, template, to_email, message)
    values (s.organization_id, s.id, 'submission_rejected', s.applicant_email, msg) on conflict (submission_id, template) do nothing;
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.remove_checklist_item(p_item uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare i public.activity_checklist_items;
begin
  select * into i from public.activity_checklist_items where id = p_item;
  if i.id is null or not public.has_permission(i.organization_id, 'events.manage') then
    raise exception 'Sem permissão para alterar o checklist.' using errcode = '42501';
  end if;
  update public.activity_checklist_items set is_active = false where id = p_item;
end $function$
;

CREATE OR REPLACE FUNCTION public.reorder_checklist(p_activity uuid, p_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.activities;
begin
  select * into a from public.activities where id = p_activity;
  if a.id is null or not public.has_permission(a.organization_id, 'events.manage') then
    raise exception 'Sem permissão para alterar o checklist.' using errcode = '42501';
  end if;
  update public.activity_checklist_items x set sort_order = o.ord
  from unnest(p_ids) with ordinality as o(id, ord)
  where x.id = o.id and x.activity_id = p_activity;
end $function$
;

CREATE OR REPLACE FUNCTION public.replicate_cycle_prices(p_cycle uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare cy public.cycles; prev public.cycles; n int;
begin
  select * into cy from public.cycles where id = p_cycle;
  if cy.id is null then raise exception 'Ciclo não encontrado.' using errcode = 'P0002'; end if;
  perform public.require_billing(cy.organization_id);
  select * into prev from public.cycles where organization_id = cy.organization_id and starts_on < cy.starts_on order by starts_on desc limit 1;
  if prev.id is null then raise exception 'Não há ciclo anterior para replicar.' using errcode = 'P0001'; end if;
  insert into public.fee_cycle_prices (organization_id, fee_category_id, cycle_id, amount)
  select cy.organization_id, p.fee_category_id, cy.id, p.amount from public.fee_cycle_prices p
   where p.cycle_id = prev.id and not exists (select 1 from public.fee_cycle_prices x where x.fee_category_id = p.fee_category_id and x.cycle_id = cy.id);
  get diagnostics n = row_count;
  insert into public.fee_cycle_exempt (organization_id, function_id, cycle_id, is_exempt)
  select x.organization_id, x.function_id, cy.id, x.is_exempt from public.fee_cycle_exempt x where x.cycle_id = prev.id
  on conflict do nothing;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.request_extra_email(p_member uuid, p_email text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m public.members; v_id uuid; e text := lower(btrim(p_email));
begin
  select * into m from public.members where id = p_member;
  if m.id is null or not public.is_self(p_member) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Digite um e-mail válido.'; end if;
  if exists (select 1 from public.email_requests where member_id = p_member and email = e and status = 'pending') then raise exception 'Esse pedido já está aguardando a Direção.'; end if;
  insert into public.email_requests (organization_id, member_id, email) values (m.organization_id, p_member, e) returning id into v_id;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.request_ip()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select nullif(btrim(coalesce(
    h ->> 'cf-connecting-ip',
    h ->> 'x-real-ip',
    split_part(h ->> 'x-forwarded-for', ',', 1)
  )), '')
  from (select coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb as h) x
$function$
;

CREATE OR REPLACE FUNCTION public.request_participation_change(p_member uuid, p_kind text, p_action text, p_instrument uuid DEFAULT NULL::uuid, p_function uuid DEFAULT NULL::uuid, p_link uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m public.members; v_id uuid;
begin
  select * into m from public.members where id = p_member;
  if m.id is null or not public.is_self(p_member) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if p_action = 'remove' and not exists (select 1 from public.member_artistic_links where id = p_link and member_id = p_member and ended_at is null) then raise exception 'Vínculo não encontrado.'; end if;
  insert into public.participation_requests (organization_id, member_id, kind, action, instrument_id, function_id, link_id, note)
  values (m.organization_id, p_member, p_kind, p_action, p_instrument, p_function, p_link, nullif(btrim(coalesce(p_note, '')), '')) returning id into v_id;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.request_reactivation(p_org uuid, p_message text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_member uuid; v_cycle uuid; v_id uuid;
begin
  v_member := public.current_member_id(p_org);
  if v_member is null then raise exception 'Você não faz parte desta organização.' using errcode = '42501'; end if;
  if not public.member_is_inactive(v_member) then raise exception 'Sua participação já está ativa.' using errcode = 'P0001'; end if;
  select id into v_cycle from public.cycles where organization_id = p_org and is_current;
  if v_cycle is null then raise exception 'Não há ciclo atual.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.reactivation_requests where member_id = v_member and cycle_id = v_cycle and status = 'pending') then
    raise exception 'Você já tem um pedido em análise.' using errcode = 'P0001';
  end if;
  insert into public.reactivation_requests (organization_id, member_id, cycle_id, message)
  values (p_org, v_member, v_cycle, nullif(trim(p_message), '')) returning id into v_id;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.require_billing(p_org uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.has_permission(p_org, 'billing.manage') then
    raise exception 'Sem permissão para gerenciar mensalidades.' using errcode = '42501';
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.require_finance(p_org uuid, p_perm text DEFAULT 'finance.manage'::text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.has_permission(p_org, p_perm) then
    raise exception 'Sem permissão para esta operação financeira.' using errcode = '42501';
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.reset_section_from_template(p_section uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.form_fields; t public.form_section_templates; tsec public.form_fields; r public.form_fields;
  nxt int; old_keys text[]; new_n int; pos int; k text; nk text; i int; keymap jsonb := '{}'::jsonb; mp text; cond jsonb; v_unlinked int := 0; v_n int := 0;
begin
  select * into s from public.form_fields where id = p_section;
  if s.id is null or not public.has_permission(s.organization_id, 'forms.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if s.source_template_id is null then raise exception 'Esta seção não veio de um modelo.' using errcode = 'P0001'; end if;
  select * into t from public.form_section_templates where id = s.source_template_id;
  if t.id is null then raise exception 'O modelo desta seção não existe mais.' using errcode = 'P0001'; end if;
  select * into tsec from public.form_fields where id = t.section_id;
  select min(x.sort_order) into nxt from public.form_fields x
   where x.form_id = s.form_id and x.sort_order > s.sort_order and x.field_type = 'info' and coalesce((x.validation ->> 'section')::boolean, false);
  select coalesce(array_agg(x.field_key), '{}') into old_keys from public.form_fields x
   where x.form_id = s.form_id and x.sort_order > s.sort_order and (nxt is null or x.sort_order < nxt);
  update public.form_fields set condition = null
   where form_id = s.form_id and condition is not null and (condition ->> 'field') = any (old_keys)
     and not (sort_order > s.sort_order and (nxt is null or sort_order < nxt));
  delete from public.form_fields where form_id = s.form_id and sort_order > s.sort_order and (nxt is null or sort_order < nxt);
  select count(*) into new_n from public.form_fields x where x.form_id = t.form_id and x.id <> t.section_id and x.is_active;
  if nxt is not null then
    update public.form_fields set sort_order = sort_order + ((s.sort_order + new_n + 1) - nxt) where form_id = s.form_id and sort_order >= nxt;
  end if;
  update public.form_fields set label = tsec.label, description = tsec.description, validation = tsec.validation where id = s.id;
  pos := s.sort_order;
  for r in select * from public.form_fields x where x.form_id = t.form_id and x.id <> t.section_id and x.is_active order by x.sort_order loop
    pos := pos + 1;
    k := r.field_key; nk := k; i := 2;
    while exists (select 1 from public.form_fields where form_id = s.form_id and field_key = nk) loop nk := left(k, 36) || '_' || i; i := i + 1; end loop;
    keymap := keymap || jsonb_build_object(k, nk);
    mp := r.member_mapping;
    if mp is not null and mp <> 'member.custom' and exists (select 1 from public.form_fields where form_id = s.form_id and is_active and member_mapping = mp) then
      mp := null; v_unlinked := v_unlinked + 1;
    end if;
    cond := r.condition;
    if cond is not null and jsonb_typeof(cond) = 'object' and keymap ? (cond ->> 'field') then
      cond := jsonb_set(cond, '{field}', to_jsonb(keymap ->> (cond ->> 'field')));
    end if;
    insert into public.form_fields (organization_id, form_id, field_key, label, description, field_type, required, sort_order, options, default_value, validation, condition, member_mapping)
    values (s.organization_id, s.form_id, nk, r.label, r.description, r.field_type, r.required, pos, r.options, r.default_value, r.validation, cond, mp);
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('fields', v_n, 'unlinked', v_unlinked);
end $function$
;

CREATE OR REPLACE FUNCTION public.restore_activity(p_activity uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.activities;
begin
  select * into a from public.activities where id = p_activity;
  if a.id is null or not public.has_permission(a.organization_id, 'events.manage') then
    raise exception 'Sem permissão para restaurar este evento.' using errcode = '42501';
  end if;
  update public.activities set deleted_at = null where id = a.id;
end $function$
;

CREATE OR REPLACE FUNCTION public.restore_backup(p_backup uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare b public.backups; t text; snap jsonb; cols text; pk text; setlist text; tup_t text; tup_e text; ovr text; n bigint; result jsonb := '{}'::jsonb; v_auto uuid;
  skip_tables constant text[] := array['access_roles', 'role_permissions', 'member_access_roles'];
  v_skip_cols text[]; v_keys text[]; v_rel regclass;
begin
  select * into b from public.backups where id = p_backup;
  if b.id is null then raise exception 'Backup não encontrado.' using errcode = 'P0002'; end if;
  if not public.has_permission(b.organization_id, 'backups.manage') then raise exception 'Sem permissão para restaurar.' using errcode = '42501'; end if;
  v_auto := public.make_backup(b.organization_id, 'Antes de restaurar: ' || b.label, 'auto');
  snap := public.backup_upgrade_tables(b.data -> 'tables');

  if jsonb_array_length(coalesce(snap -> 'organizations', '[]'::jsonb)) > 0 then
    update public.organizations o set theme = r2.theme, logo_path = r2.logo_path
      from jsonb_populate_record(null::public.organizations, snap -> 'organizations' -> 0) r2 where o.id = b.organization_id;
  end if;

  foreach t in array public.backup_table_order() loop
    continue when t = any (skip_tables);
    continue when snap -> t is null or jsonb_array_length(snap -> t) = 0;
    v_rel := ('public.' || quote_ident(t))::regclass;
    snap := jsonb_set(snap, array[t], public.backup_remap_ids(t, snap -> t));
    v_skip_cols := case when t = 'members' then array['user_id'] else array[]::text[] end;
    -- Só as colunas que existem no backup: coluna criada depois fica com o padrão (linha nova) ou com o valor atual.
    select array_agg(distinct k) into v_keys from jsonb_array_elements(snap -> t) r, jsonb_object_keys(r) k;
    select string_agg(format('%I', a.attname), ', ' order by a.attnum) into cols
      from pg_attribute a where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
        and a.attname <> all (v_skip_cols) and a.attname = any (v_keys);
    select string_agg(format('%I', a.attname), ', ' order by array_position(i.indkey::int2[], a.attnum)) into pk
      from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indrelid = v_rel and i.indisprimary;
    continue when pk is null or cols is null;
    select string_agg(format('%1$I = excluded.%1$I', a.attname), ', ') into setlist
      from pg_attribute a where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
        and a.attname <> all (string_to_array(replace(pk, '"', ''), ', ')) and a.attname <> all (v_skip_cols) and a.attname = any (v_keys);
    select string_agg(format('x.%I', a.attname), ', '), string_agg(format('excluded.%I', a.attname), ', ') into tup_t, tup_e
      from pg_attribute a where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
        and a.attname <> all (v_skip_cols) and a.attname = any (v_keys);
    ovr := case when exists (select 1 from pg_attribute a where a.attrelid = v_rel and a.attidentity = 'a') then 'overriding system value' else '' end;
    begin
      if setlist is null then
        execute format('insert into public.%1$I as x (%2$s) %4$s select %2$s from jsonb_populate_recordset(null::public.%1$I, $1) r where r.organization_id = $2 on conflict (%3$s) do nothing', t, cols, pk, ovr)
          using snap -> t, b.organization_id;
      else
        execute format('insert into public.%1$I as x (%2$s) %7$s select %2$s from jsonb_populate_recordset(null::public.%1$I, $1) r where r.organization_id = $2 on conflict (%3$s) do update set %4$s where x.organization_id = $2 and (%5$s) is distinct from (%6$s)',
                       t, cols, pk, setlist, tup_t, tup_e, ovr) using snap -> t, b.organization_id;
      end if;
      get diagnostics n = row_count;
    exception when others then
      raise exception 'Não foi possível restaurar "%": %. Nada foi alterado.', t, sqlerrm using errcode = 'P0001';
    end;
    if n > 0 then result := result || jsonb_build_object(t, n); end if;
  end loop;
  return jsonb_build_object('changed', result, 'auto_backup', v_auto);
end $function$
;

CREATE OR REPLACE FUNCTION public.review_email_request(p_id uuid, p_approve boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.email_requests;
begin
  select * into r from public.email_requests where id = p_id and status = 'pending';
  if r.id is null or not public.has_permission(r.organization_id, 'members.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if p_approve then
    insert into public.member_emails (organization_id, member_id, email) values (r.organization_id, r.member_id, r.email);
  end if;
  update public.email_requests set status = case when p_approve then 'approved' else 'rejected' end, reviewed_at = now() where id = p_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.review_participation_request(p_id uuid, p_approve boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.participation_requests;
begin
  select * into r from public.participation_requests where id = p_id and status = 'pending';
  if r.id is null or not public.has_permission(r.organization_id, 'members.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if p_approve then
    if r.action = 'add' then
      insert into public.member_artistic_links (organization_id, member_id, instrument_id, function_id, is_primary)
      values (r.organization_id, r.member_id, r.instrument_id, r.function_id, false);
    else
      update public.member_artistic_links set ended_at = current_date where id = r.link_id and ended_at is null;
    end if;
  end if;
  update public.participation_requests set status = case when p_approve then 'approved' else 'rejected' end, reviewed_at = now() where id = p_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.review_submission(p_id uuid, p_status text, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.form_submissions;
begin
  select * into s from public.form_submissions where id = p_id;
  if s.id is null or not public.has_permission(s.organization_id, 'forms.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if p_status not in ('pending', 'rejected', 'archived') then raise exception 'Status inválido.' using errcode = '22023'; end if;
  if s.status = 'approved' then raise exception 'Inscrição já aprovada.' using errcode = 'P0001'; end if;
  update public.form_submissions set status = p_status, reviewer_notes = coalesce(nullif(trim(p_notes), ''), reviewer_notes),
         reviewed_by = public.current_member_id(s.organization_id), reviewed_at = now() where id = p_id;
  insert into public.audit_logs (organization_id, actor_user_id, actor_member_id, action, entity_type, entity_id, new_data)
  values (s.organization_id, auth.uid(), public.current_member_id(s.organization_id), 'submission_' || p_status, 'form_submissions', p_id::text, jsonb_build_object('status', p_status));
end $function$
;

CREATE OR REPLACE FUNCTION public.revoke_access_role(p_member uuid, p_role_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid; v_role uuid;
begin
  select organization_id into v_org from public.members where id = p_member;
  if v_org is null then raise exception 'Integrante não encontrado.' using errcode = 'P0002'; end if;
  if not public.has_permission(v_org, 'roles.manage') then raise exception 'Sem permissão para revogar papéis.' using errcode = '42501'; end if;
  if p_role_key = 'titular' then raise exception 'A titularidade só muda por transferência.' using errcode = 'P0001'; end if;
  if p_role_key = 'direcao' and public.has_active_titular(v_org) and not public.caller_is_titular(v_org) then
    raise exception 'Somente o titular do bloco pode conceder ou remover a Direção.' using errcode = 'P0001';
  end if;
  select id into v_role from public.access_roles where organization_id = v_org and key = p_role_key;
  if v_role is null then raise exception 'Papel inválido.' using errcode = 'P0002'; end if;
  update public.member_access_roles set revoked_at = now() where member_id = p_member and access_role_id = v_role and revoked_at is null;
end $function$
;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
  tbl name;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        SELECT c.relname INTO tbl FROM pg_catalog.pg_class c WHERE c.oid = cmd.objid;
        EXECUTE format('alter table if exists %I.%I enable row level security', cmd.schema_name, tbl);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.save_drive_integration(p_org uuid, p_folder text, p_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id text;
begin
  if not public.has_permission(p_org, 'settings.manage') then
    raise exception 'Sem permissão para alterar integrações.' using errcode = '42501';
  end if;
  v_id := public.parse_drive_folder_id(p_folder);
  if v_id is null then
    raise exception 'Link ou ID de pasta do Google Drive inválido.' using errcode = 'P0001';
  end if;
  insert into public.integrations (organization_id, provider, config, is_active)
  values (p_org, 'google_drive', jsonb_build_object('folder_id', v_id), coalesce(p_active, false))
  on conflict (organization_id, provider) do update set config = jsonb_build_object('folder_id', v_id), is_active = coalesce(p_active, false);
  return jsonb_build_object('folder_id', v_id, 'active', coalesce(p_active, false));
end $function$
;

CREATE OR REPLACE FUNCTION public.save_member_sensitive(p_member uuid, p_gender text, p_is_trans boolean, p_race_color text, p_is_pcd boolean, p_pcd_description text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid;
begin
  select organization_id into v_org from public.members where id = p_member;
  if v_org is null then raise exception 'Integrante não encontrado.' using errcode = 'P0002'; end if;
  if not (public.is_self(p_member) or public.has_permission(v_org, 'members.sensitive.manage')) then
    raise exception 'Sem permissão para dados sensíveis.' using errcode = '42501';
  end if;
  insert into public.member_sensitive_data (member_id, organization_id, gender, is_trans, race_color, is_pcd, pcd_description, updated_by)
  values (p_member, v_org, nullif(btrim(p_gender), ''), p_is_trans, nullif(btrim(p_race_color), ''), p_is_pcd,
          case when p_is_pcd then nullif(btrim(p_pcd_description), '') end, auth.uid())
  on conflict (member_id) do update set
    gender = excluded.gender, is_trans = excluded.is_trans, race_color = excluded.race_color,
    is_pcd = excluded.is_pcd, pcd_description = excluded.pcd_description, updated_by = excluded.updated_by;
end $function$
;

CREATE OR REPLACE FUNCTION public.save_section_as_template(p_section uuid, p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.form_fields;
begin
  select * into s from public.form_fields where id = p_section;
  if s.id is null or not public.has_permission(s.organization_id, 'forms.manage') then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Dê um nome ao modelo.' using errcode = 'P0001'; end if;
  return public._build_section_template(p_section, p_name);
end $function$
;

CREATE OR REPLACE FUNCTION public.save_submission_notes(p_id uuid, p_notes text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.form_submissions;
begin
  select * into s from public.form_submissions where id = p_id;
  if s.id is null or not public.has_permission(s.organization_id, 'forms.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  update public.form_submissions set reviewer_notes = nullif(trim(p_notes), '') where id = p_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.scholarship_indicators(p_org uuid, p_cycle uuid DEFAULT NULL::uuid)
 RETURNS TABLE(bolsistas integer, soma_percentual numeric, equivalente_integrais numeric, impacto_estimado numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_cycle uuid;
begin
  if not public.has_permission(p_org, 'scholarships.manage') then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  v_cycle := coalesce(p_cycle, (select c.id from public.cycles c where c.organization_id = p_org and c.is_current limit 1));
  if v_cycle is not null and not exists (select 1 from public.cycles c where c.id = v_cycle and c.organization_id = p_org) then
    raise exception 'Ciclo não encontrado.' using errcode = 'P0002';
  end if;
  return query
  select count(*)::int,
         coalesce(sum(s.percent), 0),
         round(coalesce(sum(s.percent), 0) / 100, 2),
         coalesce(sum(round(coalesce(p.amount, 0) * s.percent / 100, 2)), 0)
    from public.cycle_scholarships s
    join public.members m on m.id = s.member_id and m.archived_at is null
    left join public.cycle_fee_assignments fa on fa.member_id = s.member_id and fa.cycle_id = s.cycle_id
    left join public.fee_cycle_prices p on p.fee_category_id = fa.fee_category_id and p.cycle_id = s.cycle_id
   where s.organization_id = p_org and s.cycle_id = v_cycle and s.percent > 0;
end $function$
;

CREATE OR REPLACE FUNCTION public.seed_org_cycle_defaults(p_org uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.member_cycle_statuses (organization_id, key, name, counts_as_active, is_waitlist, sort_order) values
    (p_org, 'active',   'Ativo',            true,  false, 1),
    (p_org, 'inactive', 'Inativo',          false, false, 2),
    (p_org, 'waitlist', 'Lista de espera',  false, true,  3)
  on conflict (organization_id, key) do nothing;
  insert into public.cycle_types (organization_id, key, name) values
    (p_org, 'carnaval', 'Carnaval'), (p_org, 'junino', 'Junino')
  on conflict (organization_id, key) do nothing;
end $function$
;

CREATE OR REPLACE FUNCTION public.seed_org_defaults(p_org uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r record;
begin
  insert into public.access_roles (organization_id, key, name, rank, is_system) values
    (p_org, 'direcao',    'Direção',    40, true),
    (p_org, 'professor',  'Professor',  30, true),
    (p_org, 'monitor',    'Monitor',    20, true),
    (p_org, 'integrante', 'Integrante', 10, true)
  on conflict (organization_id, key) do nothing;

  -- Direção: todas as permissões, escopo organização.
  insert into public.role_permissions (access_role_id, permission_key, scope)
  select ar.id, p.key, 'org' from public.access_roles ar cross join public.permissions p
  where ar.organization_id = p_org and ar.key = 'direcao'
  on conflict do nothing;

  -- Demais papéis (matriz E da proposta).
  for r in
    select * from (values
      ('professor','members.read','group'), ('professor','member_cycles.read','group'),
      ('professor','member_cycles.manage','group'), ('professor','capacity.read','org'),
      ('professor','events.read','org'), ('professor','events.manage','group'),
      ('professor','attendance.read','group'), ('professor','attendance.record','group'),
      ('professor','repertoire.read','org'), ('professor','billing.read','own'),
      ('professor','staff_payments.read','own'), ('professor','pix.manage','own'),
      ('monitor','members.read','group'), ('monitor','member_cycles.read','group'),
      ('monitor','member_cycles.manage','group'), ('monitor','capacity.read','group'),
      ('monitor','events.read','org'), ('monitor','attendance.read','group'),
      ('monitor','attendance.record','group'), ('monitor','repertoire.read','org'),
      ('monitor','billing.read','own'), ('monitor','staff_payments.read','own'),
      ('monitor','pix.manage','own'),
      ('integrante','members.read','own'), ('integrante','events.read','org'),
      ('integrante','attendance.read','own'), ('integrante','repertoire.read','org'),
      ('integrante','billing.read','own')
    ) as t(role_key, perm, scope)
  loop
    insert into public.role_permissions (access_role_id, permission_key, scope)
    select ar.id, r.perm, r.scope::public.permission_scope
    from public.access_roles ar where ar.organization_id = p_org and ar.key = r.role_key
    on conflict do nothing;
  end loop;

  insert into public.org_settings (organization_id, key, value) values
    (p_org, 'member_directory_visibility', '"all_members"'::jsonb),
    (p_org, 'billing_due_day', '10'::jsonb),
    (p_org, 'minimum_member_age', '18'::jsonb)
  on conflict do nothing;
end $function$
;

CREATE OR REPLACE FUNCTION public.seed_org_events_defaults(p_org uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.activity_types (organization_id, name, color, sort_order) values
    (p_org, 'Ensaio', 'primary', 1), (p_org, 'Oficina', 'info', 2), (p_org, 'Apresentação', 'secondary', 3),
    (p_org, 'Reunião', 'warning', 4), (p_org, 'Evento', 'success', 5), (p_org, 'Outro', 'muted', 6)
  on conflict (organization_id, name) do nothing;
  insert into public.attendance_statuses (organization_id, key, name, counts_as_present, sort_order) values
    (p_org, 'present', 'Presente', true, 1), (p_org, 'absent', 'Ausente', false, 2), (p_org, 'justified', 'Justificado', false, 3)
  on conflict (organization_id, key) do nothing;
end $function$
;

CREATE OR REPLACE FUNCTION public.seed_org_finance_defaults(p_org uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.finance_categories (organization_id, kind, name, sort_order) values
    (p_org, 'income', 'Outras receitas', 1), (p_org, 'income', 'Doações', 2), (p_org, 'income', 'Ajustes', 3),
    (p_org, 'expense', 'Aluguel de espaço', 1), (p_org, 'expense', 'Equipamento', 2), (p_org, 'expense', 'Transporte', 3),
    (p_org, 'expense', 'Alimentação', 4), (p_org, 'expense', 'Contratação de serviço', 5), (p_org, 'expense', 'Outras despesas', 6)
  on conflict (organization_id, kind, name) do nothing;
  insert into public.distribution_destinations (organization_id, name, kind, role_key, sort_order) values
    (p_org, 'Direção', 'role_group', 'direcao', 1), (p_org, 'Professores', 'role_group', 'professor', 2),
    (p_org, 'Monitores', 'role_group', 'monitor', 3), (p_org, 'Caixa do bloco', 'cash', null, 4)
  on conflict (organization_id, name) do nothing;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_attendance(p_activity uuid, p_member uuid, p_status_key text, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_a public.activities; v_status uuid; v_scope text; v_allowed boolean; v_cycle uuid; v_off boolean;
begin
  select * into v_a from public.activities where id = p_activity;
  if v_a.id is null then raise exception 'Evento não encontrado.' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.members where id = p_member and organization_id = v_a.organization_id) then
    raise exception 'Integrante não encontrado.' using errcode = 'P0002';
  end if;
  v_scope := public.permission_scope_of(v_a.organization_id, 'attendance.record')::text;
  v_allowed := v_scope = 'org' or (v_scope = 'group' and public.can_record_attendance_for(v_a.organization_id, p_member));
  if not coalesce(v_allowed, false) then
    raise exception 'Você não tem permissão para registrar esta presença.' using errcode = '42501';
  end if;
  if v_a.status = 'cancelled' then raise exception 'Este evento foi cancelado.' using errcode = 'P0001'; end if;
  select id into v_status from public.attendance_statuses
   where organization_id = v_a.organization_id and key = p_status_key and is_active;
  if v_status is null then raise exception 'Status de presença inválido.' using errcode = 'P0002'; end if;

  v_cycle := coalesce(v_a.cycle_id, (
    select cy.id from public.cycles cy
     where cy.organization_id = v_a.organization_id and cy.is_active and v_a.activity_date between cy.starts_on and cy.ends_on
     order by cy.is_current desc, cy.starts_on desc limit 1));
  v_off := v_cycle is not null and not exists (
    select 1 from public.member_cycles mc join public.member_cycle_statuses s on s.id = mc.status_id and s.counts_as_active
    where mc.member_id = p_member and mc.cycle_id = v_cycle);

  insert into public.event_attendance (organization_id, activity_id, member_id, status_id, notes, is_off_roster, recorded_by)
  values (v_a.organization_id, p_activity, p_member, v_status, p_notes, v_off, public.current_member_id(v_a.organization_id))
  on conflict (activity_id, member_id) do update set
    status_id = excluded.status_id,
    notes = coalesce(excluded.notes, public.event_attendance.notes),
    recorded_by = excluded.recorded_by, recorded_at = now();
end $function$
;

CREATE OR REPLACE FUNCTION public.set_checklist_name(p_activity uuid, p_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.activities;
begin
  select * into a from public.activities where id = p_activity;
  if a.id is null or not public.has_permission(a.organization_id, 'events.manage') then
    raise exception 'Sem permissão para alterar o checklist.' using errcode = '42501';
  end if;
  update public.activities set checklist_name = nullif(btrim(coalesce(p_name, '')), '') where id = p_activity;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_cycle_exempt(p_function uuid, p_cycle uuid, p_exempt boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid;
begin
  select organization_id into v_org from public.artistic_functions where id = p_function;
  if v_org is null then raise exception 'Categoria não encontrada.' using errcode = 'P0002'; end if;
  perform public.require_billing(v_org);
  if not exists (select 1 from public.cycles where id = p_cycle and organization_id = v_org) then raise exception 'Ciclo não encontrado.' using errcode = 'P0002'; end if;
  insert into public.fee_cycle_exempt (organization_id, function_id, cycle_id, is_exempt) values (v_org, p_function, p_cycle, coalesce(p_exempt, false))
  on conflict (function_id, cycle_id) do update set is_exempt = excluded.is_exempt, updated_at = now();
end $function$
;

CREATE OR REPLACE FUNCTION public.set_cycle_fee_price(p_category uuid, p_cycle uuid, p_amount numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid;
begin
  select organization_id into v_org from public.fee_categories where id = p_category;
  if v_org is null then raise exception 'Categoria não encontrada.' using errcode = 'P0002'; end if;
  perform public.require_billing(v_org);
  if not exists (select 1 from public.cycles where id = p_cycle and organization_id = v_org) then raise exception 'Ciclo não encontrado.' using errcode = 'P0002'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'Informe um valor maior ou igual a zero.' using errcode = '22003'; end if;
  insert into public.fee_cycle_prices (organization_id, fee_category_id, cycle_id, amount) values (v_org, p_category, p_cycle, p_amount)
  on conflict (fee_category_id, cycle_id) do update set amount = excluded.amount, updated_at = now();
end $function$
;

CREATE OR REPLACE FUNCTION public.set_cycle_scholarship(p_member uuid, p_cycle uuid, p_percent numeric, p_type uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid;
begin
  select organization_id into v_org from public.members where id = p_member;
  if v_org is null then raise exception 'Integrante não encontrado.' using errcode = 'P0002'; end if;
  if not public.has_permission(v_org, 'scholarships.manage') then
    raise exception 'Sem permissão para conceder bolsas.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.cycles where id = p_cycle and organization_id = v_org) then
    raise exception 'Ciclo não encontrado.' using errcode = 'P0002';
  end if;
  if p_percent is null or p_percent < 0 or p_percent > 100 then
    raise exception 'A bolsa deve ser entre 0%% e 100%%.' using errcode = '22003';
  end if;
  if p_type is not null and not exists (select 1 from public.scholarship_types where id = p_type and organization_id = v_org) then
    raise exception 'Tipo de bolsa inválido.' using errcode = 'P0002';
  end if;
  if p_percent = 0 then
    delete from public.cycle_scholarships where member_id = p_member and cycle_id = p_cycle;
    return;
  end if;
  insert into public.cycle_scholarships (organization_id, member_id, cycle_id, percent, reason, scholarship_type_id)
  values (v_org, p_member, p_cycle, p_percent, nullif(trim(p_reason), ''), p_type)
  on conflict (member_id, cycle_id) where cycle_id is not null
  do update set percent = excluded.percent, reason = excluded.reason, scholarship_type_id = excluded.scholarship_type_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_drive_integration_active(p_org uuid, p_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.has_permission(p_org, 'settings.manage') then
    raise exception 'Sem permissão para alterar integrações.' using errcode = '42501';
  end if;
  update public.integrations set is_active = p_active where organization_id = p_org and provider = 'google_drive';
end $function$
;

CREATE OR REPLACE FUNCTION public.set_member_cycle_status(p_member uuid, p_cycle uuid, p_status_key text, p_notes text DEFAULT NULL::text, p_waitlist_instrument uuid DEFAULT NULL::uuid, p_force boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid; v_status public.member_cycle_statuses; v_existing public.member_cycles;
  v_was_active boolean := false; v_was_inactive boolean := false; v_full text; v_id uuid; v_allowed boolean;
begin
  select organization_id into v_org from public.members where id = p_member;
  if v_org is null then raise exception 'Integrante não encontrado.' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.cycles where id = p_cycle and organization_id = v_org) then
    raise exception 'Ciclo inválido.' using errcode = 'P0002';
  end if;
  select * into v_status from public.member_cycle_statuses
   where organization_id = v_org and key = p_status_key and is_active;
  if v_status.id is null then raise exception 'Status inválido.' using errcode = 'P0002'; end if;

  select * into v_existing from public.member_cycles where member_id = p_member and cycle_id = p_cycle;
  if v_existing.id is not null then
    select s.counts_as_active, (not s.counts_as_active and not s.is_waitlist)
      into v_was_active, v_was_inactive from public.member_cycle_statuses s where s.id = v_existing.status_id;
  end if;

  v_allowed := public.has_permission(v_org, 'member_cycles.manage')
    or (coalesce(public.permission_scope_of(v_org, 'member_cycles.manage') = 'group', false)
        and public.is_in_my_group(v_org, p_member))
    -- Reativação (inativo → ativo): também quem pode decidir reativações (Professor do grupo da pessoa).
    or (v_status.counts_as_active and coalesce(v_was_inactive, false) and public.can_decide_reactivation(v_org, p_member));
  if not coalesce(v_allowed, false) then
    raise exception 'Você não tem permissão para alterar este status.' using errcode = '42501';
  end if;

  if v_status.counts_as_active and coalesce(v_was_inactive, false) and not public.can_decide_reactivation(v_org, p_member) then
    raise exception 'Só a Direção ou um professor do grupo da pessoa pode reativar um integrante inativo.' using errcode = 'P0001';
  end if;

  if v_status.counts_as_active and not coalesce(v_was_active, false) then
    select string_agg(i.name, ', ') into v_full
    from (
      select p.instrument_id from public.cycle_participations p where p.member_id = p_member and p.cycle_id = p_cycle and p.instrument_id is not null
      union
      select l.instrument_id from public.member_artistic_links l
       where l.member_id = p_member and l.ended_at is null and l.instrument_id is not null
         and exists (select 1 from public.cycles cy where cy.id = p_cycle and cy.is_current)
         and not exists (select 1 from public.cycle_participations p2 where p2.member_id = p_member and p2.cycle_id = p_cycle)
    ) mi
    join public.instruments i on i.id = mi.instrument_id
    join public.instrument_cycle_capacity c on c.instrument_id = mi.instrument_id and c.cycle_id = p_cycle
    where public.instrument_occupied(mi.instrument_id, p_cycle) >= c.capacity;
    if v_full is not null and not (p_force and public.has_permission(v_org, 'capacity.manage')) then
      raise exception 'Vaga lotada em: %. Só a Direção pode autorizar a exceção.', v_full using errcode = 'P0001';
    end if;
  end if;

  insert into public.member_cycles (organization_id, member_id, cycle_id, status_id, joined_on, left_on, notes,
                                    waitlisted_at, waitlist_instrument_id)
  values (v_org, p_member, p_cycle, v_status.id,
          case when v_status.counts_as_active then current_date end,
          case when not v_status.counts_as_active and not v_status.is_waitlist then current_date end,
          p_notes,
          case when v_status.is_waitlist then now() end,
          case when v_status.is_waitlist then p_waitlist_instrument end)
  on conflict (member_id, cycle_id) do update set
    status_id = excluded.status_id,
    joined_on = case when v_status.counts_as_active then coalesce(public.member_cycles.joined_on, current_date)
                     else public.member_cycles.joined_on end,
    left_on = case when v_status.counts_as_active then null
                   when v_status.is_waitlist then null else current_date end,
    notes = coalesce(excluded.notes, public.member_cycles.notes),
    waitlisted_at = case when v_status.is_waitlist then coalesce(public.member_cycles.waitlisted_at, now()) end,
    waitlist_instrument_id = case when v_status.is_waitlist then coalesce(excluded.waitlist_instrument_id, public.member_cycles.waitlist_instrument_id) end
  returning id into v_id;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_member_photo(p_member uuid, p_path text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid; v_old text;
begin
  select organization_id, photo_path into v_org, v_old from public.members where id = p_member;
  if v_org is null then raise exception 'Integrante não encontrado.' using errcode = 'P0002'; end if;
  if not public.can_edit_member_photo(v_org, p_member) then raise exception 'Sem permissão para alterar esta foto.' using errcode = '42501'; end if;
  if p_path is not null and p_path not like v_org::text || '/' || p_member::text || '/%' then raise exception 'Caminho de foto inválido.' using errcode = '22023'; end if;
  update public.members set photo_path = p_path where id = p_member;
  return v_old;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_my_skill_level(p_link uuid, p_level uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare l public.member_artistic_links;
begin
  select * into l from public.member_artistic_links where id = p_link and ended_at is null and instrument_id is not null;
  if l.id is null then raise exception 'Vínculo não encontrado.' using errcode = 'P0002'; end if;
  if l.member_id is distinct from public.current_member_id(l.organization_id) and not public.has_permission(l.organization_id, 'members.manage') then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_level is not null and not exists (select 1 from public.skill_levels where id = p_level and organization_id = l.organization_id) then
    raise exception 'Nível inválido.' using errcode = 'P0002';
  end if;
  update public.member_artistic_links set skill_level_id = p_level where id = l.id;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_org_founded(p_org uuid, p_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.has_permission(p_org, 'org.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  update public.organizations set founded_on = p_date where id = p_org;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_org_logo(p_org uuid, p_path text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.has_permission(p_org, 'org.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  update public.organizations set logo_path = nullif(btrim(coalesce(p_path, '')), '') where id = p_org;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_organization_titular(p_org_slug text, p_email text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid; v_member uuid; v_role uuid;
begin
  if auth.uid() is not null then raise exception 'Operação restrita à administração do banco.' using errcode = '42501'; end if;
  select id into v_org from public.organizations where slug = p_org_slug;
  if v_org is null then raise exception 'Organização não encontrada: %', p_org_slug; end if;
  select m.id into v_member from public.members m join auth.users u on u.id = m.user_id
   where m.organization_id = v_org and lower(u.email) = lower(p_email) and m.archived_at is null;
  if v_member is null then raise exception 'Nenhum integrante com conta "%" nesta organização. Crie a conta e vincule o cadastro antes.', p_email; end if;
  perform public.ensure_titular_role(v_org);
  select id into v_role from public.access_roles where organization_id = v_org and key = 'titular';
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
  select v_org, v_member, v_role where not exists (select 1 from public.member_access_roles where member_id = v_member and access_role_id = v_role and revoked_at is null);
  return v_member;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_page_releases(p_org uuid, p_changes jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not exists (
    select 1 from public.members m
      join public.member_access_roles mar on mar.member_id = m.id and mar.revoked_at is null
      join public.access_roles ar on ar.id = mar.access_role_id and ar.key = 'titular'
     where m.organization_id = p_org and m.user_id = auth.uid() and m.archived_at is null
  ) then
    raise exception 'Só o Titular altera a liberação das páginas.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) > 600 then
    raise exception 'Alterações inválidas.' using errcode = '22023';
  end if;
  insert into public.page_releases (organization_id, page_key, category, released, updated_by)
  select p_org, x.page, x.category, x.released, auth.uid()
    from jsonb_to_recordset(p_changes) as x(page text, category text, released boolean)
   where x.page is not null and x.category is not null and x.released is not null
  on conflict (organization_id, page_key, category)
  do update set released = excluded.released, updated_at = now(), updated_by = excluded.updated_by;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_pix_key(p_member uuid, p_type text, p_value text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid; v_val text;
begin
  select organization_id into v_org from public.members where id = p_member;
  if v_org is null then raise exception 'Pessoa não encontrada.' using errcode = 'P0002'; end if;
  if not (public.has_permission(v_org, 'pix.manage')
          or (public.is_self(p_member) and public.permission_scope_of(v_org, 'pix.manage') is not null)) then
    raise exception 'Você não tem permissão para cadastrar chave PIX.' using errcode = '42501';
  end if;
  v_val := case when p_type in ('cpf', 'cnpj') then regexp_replace(p_value, '\D', '', 'g')
                when p_type = 'telefone' then regexp_replace(p_value, '[^\d+]', '', 'g')
                else trim(p_value) end;
  update public.member_pix_keys set archived_at = now(), is_default = false where member_id = p_member and archived_at is null;
  insert into public.member_pix_keys (organization_id, member_id, key_type, key_value) values (v_org, p_member, p_type, v_val);
end $function$
;

CREATE OR REPLACE FUNCTION public.set_role_permission(p_org uuid, p_role_key text, p_permission text, p_scope text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_role uuid;
begin
  if not public.has_permission(p_org, 'roles.manage') then raise exception 'Sem permissão para editar permissões.' using errcode = '42501'; end if;
  select id into v_role from public.access_roles where organization_id = p_org and key = p_role_key;
  if v_role is null then raise exception 'Papel inválido.' using errcode = 'P0002'; end if;
  if p_role_key in ('direcao', 'titular') then raise exception 'A Direção e o Titular sempre possuem todas as permissões.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.permissions where key = p_permission) then raise exception 'Permissão inválida.' using errcode = 'P0002'; end if;
  if p_permission = any (public.locked_permissions()) then raise exception 'Esta permissão é exclusiva da Direção.' using errcode = 'P0001'; end if;
  if p_scope is null then
    delete from public.role_permissions where access_role_id = v_role and permission_key = p_permission;
  else
    if p_scope not in ('own', 'group', 'org') then raise exception 'Escopo inválido.' using errcode = '22023'; end if;
    if p_scope = 'group' and not (p_permission = any (public.group_scoped_permissions())) then
      raise exception 'Esta permissão não tem a opção "Meu grupo".' using errcode = '22023';
    end if;
    insert into public.role_permissions (access_role_id, permission_key, scope) values (v_role, p_permission, p_scope::public.permission_scope)
    on conflict (access_role_id, permission_key) do update set scope = excluded.scope;
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at = now();
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.shop_active_member_id(p_org uuid, p_user uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select m.id from public.members m
   where m.organization_id = p_org and m.user_id = p_user and m.archived_at is null
     and not public.member_is_inactive(m.id)
     and (
       exists (
         select 1 from public.member_cycles mc
           join public.cycles c on c.id = mc.cycle_id and c.is_current
           join public.member_cycle_statuses s on s.id = mc.status_id and s.counts_as_active and not s.is_waitlist
          where mc.member_id = m.id)
       or exists (
         select 1 from public.member_access_roles mar
           join public.access_roles ar on ar.id = mar.access_role_id and ar.key in ('titular', 'direcao', 'professor', 'monitor')
          where mar.member_id = m.id and mar.revoked_at is null)
     )
   limit 1
$function$
;

CREATE OR REPLACE FUNCTION public.shop_admin_actor(p_org uuid, OUT v_member uuid, OUT v_label text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.has_permission(p_org, 'shop.manage') then raise exception 'Você não tem permissão para gerenciar a loja.' using errcode = '42501'; end if;
  select m.id, coalesce(m.display_name, m.full_name) into v_member, v_label
    from public.members m where m.organization_id = p_org and m.user_id = auth.uid() and m.archived_at is null limit 1;
end $function$
;

CREATE OR REPLACE FUNCTION public.shop_admin_archive_finished(p_org uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a record; n int;
begin
  select * into a from public.shop_admin_actor(p_org);
  with done as (
    update public.shop_orders o set archived_at = now(), archived_by = a.v_member
     where o.organization_id = p_org and o.archived_at is null and public.shop_order_is_finished(o.id)
    returning 1)
  select count(*) into n from done;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.shop_admin_archive_order(p_order uuid, p_archive boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o record; a record;
begin
  select * into o from public.shop_orders where id = p_order for update;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0002'; end if;
  select * into a from public.shop_admin_actor(o.organization_id);
  if p_archive then
    if not public.shop_order_is_finished(p_order) then
      raise exception 'Só dá para arquivar pedidos cancelados ou já totalmente retirados. Cancele ou conclua este pedido antes.' using errcode = 'P0001';
    end if;
    update public.shop_orders set archived_at = coalesce(archived_at, now()), archived_by = coalesce(archived_by, a.v_member) where id = p_order;
  else
    update public.shop_orders set archived_at = null, archived_by = null where id = p_order;
  end if;
  return jsonb_build_object('ok', true, 'archived', p_archive);
end $function$
;

CREATE OR REPLACE FUNCTION public.shop_admin_cancel_order(p_order uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o record; a record;
begin
  select * into o from public.shop_orders where id = p_order;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0002'; end if;
  select * into a from public.shop_admin_actor(o.organization_id);
  if o.status = 'cancelled' then return jsonb_build_object('ok', true, 'status', 'cancelled'); end if;
  if exists (select 1 from public.shop_fulfillments where order_id = p_order and status = 'picked_up') then
    raise exception 'Já houve retirada neste pedido. Desfaça a retirada antes de cancelar.' using errcode = 'P0001';
  end if;
  perform public.shop_cancel_order(p_order, nullif(trim(coalesce(p_reason, '')), ''), a.v_member, a.v_label);
  return jsonb_build_object('ok', true, 'status', 'cancelled');
end $function$
;

CREATE OR REPLACE FUNCTION public.shop_admin_mark_paid(p_order uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o record; a record; r jsonb;
begin
  select * into o from public.shop_orders where id = p_order;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0002'; end if;
  select * into a from public.shop_admin_actor(o.organization_id);
  if o.status = 'cancelled' then raise exception 'Este pedido está cancelado. Reative o pedido antes de marcar como pago.' using errcode = 'P0001'; end if;
  r := public.shop_mark_paid(o.code, 'manual', a.v_member, a.v_label, jsonb_build_object('confirmed_manually_by', a.v_label));
  return r;
end $function$
;

CREATE OR REPLACE FUNCTION public.shop_admin_reactivate_order(p_order uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o record; a record; it record; v record; v_hours int;
begin
  select * into o from public.shop_orders where id = p_order for update;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0002'; end if;
  select * into a from public.shop_admin_actor(o.organization_id);
  if o.status <> 'cancelled' then raise exception 'Só é possível reativar pedidos cancelados.' using errcode = 'P0001'; end if;

  for it in
    select i.variant_id, i.quantity, i.product_name, i.variant_label
      from public.shop_order_items i
      join public.shop_fulfillments f on f.order_id = i.order_id and f.kind = i.kind
     where i.order_id = p_order and i.kind = 'stock' and f.status = 'cancelled'
     order by i.variant_id
  loop
    select * into v from public.shop_product_variants where id = it.variant_id for update;
    if coalesce(v.stock, 0) - v.reserved < it.quantity then
      raise exception 'Sem estoque para reativar: % (%) tem só % disponível.', it.product_name, it.variant_label, greatest(coalesce(v.stock, 0) - v.reserved, 0) using errcode = 'P0001';
    end if;
    update public.shop_product_variants set reserved = reserved + it.quantity where id = it.variant_id;
  end loop;

  select coalesce((select s.reservation_hours from public.shop_settings s where s.organization_id = o.organization_id), 48) into v_hours;
  update public.shop_orders set status = 'awaiting_payment', cancel_reason = null, expires_at = now() + make_interval(hours => v_hours) where id = p_order;
  update public.shop_fulfillments set status = 'pending', updated_at = now(), updated_by = a.v_member where order_id = p_order and status = 'cancelled';
  insert into public.shop_order_events (organization_id, order_id, scope, from_status, to_status, actor_member_id, actor_label, note)
  values (o.organization_id, p_order, 'order', 'cancelled', 'awaiting_payment', a.v_member, a.v_label, 'pedido reativado');
  return jsonb_build_object('ok', true, 'status', 'awaiting_payment');
end $function$
;

CREATE OR REPLACE FUNCTION public.shop_admin_set_fulfillment(p_order uuid, p_kind text, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o record; f record; a record; it record;
begin
  select * into o from public.shop_orders where id = p_order for update;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0002'; end if;
  select * into a from public.shop_admin_actor(o.organization_id);
  if o.status <> 'paid' then raise exception 'O pedido precisa estar pago para andar.' using errcode = 'P0001'; end if;
  select * into f from public.shop_fulfillments where order_id = p_order and kind = p_kind for update;
  if not found then raise exception 'Este pedido não tem itens desse tipo.' using errcode = 'P0001'; end if;
  if f.status = p_status then return jsonb_build_object('ok', true, 'status', f.status); end if;
  if not public.shop_transition_allowed(p_kind, f.status, p_status) then raise exception 'Essa mudança de status não é permitida.' using errcode = 'P0001'; end if;

  if p_kind = 'stock' and p_status = 'picked_up' then
    for it in select variant_id, quantity from public.shop_order_items where order_id = p_order and kind = 'stock' order by variant_id loop
      update public.shop_product_variants set stock = stock - it.quantity, reserved = reserved - it.quantity where id = it.variant_id;
    end loop;
  elsif p_kind = 'stock' and f.status = 'picked_up' then
    for it in select variant_id, quantity from public.shop_order_items where order_id = p_order and kind = 'stock' order by variant_id loop
      update public.shop_product_variants set stock = stock + it.quantity, reserved = reserved + it.quantity where id = it.variant_id;
    end loop;
  end if;

  update public.shop_fulfillments set status = p_status, updated_by = a.v_member, updated_at = now() where id = f.id;
  insert into public.shop_order_events (organization_id, order_id, fulfillment_id, scope, from_status, to_status, actor_member_id, actor_label, note)
  values (o.organization_id, p_order, f.id, 'fulfillment', f.status, p_status, a.v_member, a.v_label, p_kind);
  return jsonb_build_object('ok', true, 'status', p_status);
end $function$
;

CREATE OR REPLACE FUNCTION public.shop_anonymize_old_orders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n int;
begin
  with old as (
    select o.id from public.shop_orders o
      left join public.shop_settings s on s.organization_id = o.organization_id
     where o.anonymized_at is null and o.status in ('paid', 'cancelled')
       and o.created_at < now() - make_interval(years => coalesce(s.privacy_retention_years, 5))
     limit 1000
  ), upd as (
    update public.shop_orders o set
      customer_name = 'Anonimizado', customer_phone = '0000000000', customer_email = 'anonimizado@anonimizado.invalid',
      user_id = null, member_id = null, client_request_id = null, anonymized_at = now()
     from old where o.id = old.id
    returning o.id
  ), mail as (
    delete from public.shop_email_outbox b using upd where b.order_id = upd.id
  )
  select count(*) into n from upd;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.shop_cancel_by_customer(p_org uuid, p_user uuid, p_email text, p_code text, p_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o record; v_phone text;
begin
  if p_user is not null then
    select * into o from public.shop_orders
     where (p_org is null or organization_id = p_org) and code = upper(trim(p_code))
       and (user_id = p_user or (user_id is null and p_email is not null and lower(customer_email) = lower(p_email))) for update;
  else
    begin v_phone := public.shop_normalize_phone(p_phone);
    exception when others then return jsonb_build_object('ok', false, 'reason', 'not_found'); end;
    select * into o from public.shop_orders
     where (p_org is null or organization_id = p_org) and code = upper(trim(p_code)) and customer_phone = v_phone for update;
  end if;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if o.status <> 'awaiting_payment' then return jsonb_build_object('ok', false, 'reason', 'locked', 'status', o.status); end if;
  perform public.shop_cancel_order(o.id, 'Cancelado pelo cliente', null, 'cliente');
  return jsonb_build_object('ok', true, 'status', 'cancelled');
end $function$
;

CREATE OR REPLACE FUNCTION public.shop_cancel_order(p_order uuid, p_reason text, p_actor_member uuid, p_actor_label text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o record; it record;
begin
  select * into o from public.shop_orders where id = p_order for update;
  if not found or o.status = 'cancelled' then return false; end if;
  for it in
    select i.variant_id, i.quantity from public.shop_order_items i
      join public.shop_fulfillments f on f.order_id = i.order_id and f.kind = i.kind
     where i.order_id = p_order and i.kind = 'stock' and f.status <> 'picked_up'
     order by i.variant_id
  loop
    update public.shop_product_variants set reserved = greatest(reserved - it.quantity, 0) where id = it.variant_id;
  end loop;
  update public.shop_orders set status = 'cancelled', cancel_reason = p_reason, expires_at = null where id = p_order;
  update public.shop_fulfillments set status = 'cancelled', updated_at = now() where order_id = p_order and status <> 'picked_up';
  insert into public.shop_order_events (organization_id, order_id, scope, from_status, to_status, actor_member_id, actor_label, note)
  values (o.organization_id, p_order, 'order', o.status, 'cancelled', p_actor_member, coalesce(p_actor_label, 'sistema'), p_reason);
  if p_reason in ('Falha ao iniciar o pagamento', 'Pedido duplicado') then
    delete from public.shop_email_outbox where order_id = p_order and status = 'pending';
  end if;
  return true;
end $function$
;

CREATE OR REPLACE FUNCTION public.shop_change_method(p_org uuid, p_user uuid, p_email text, p_code text, p_phone text, p_method text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o record; v_phone text;
begin
  if p_method not in ('pix', 'infinitepay') then return jsonb_build_object('ok', false, 'reason', 'method'); end if;
  if p_user is not null then
    select * into o from public.shop_orders
     where organization_id = p_org and code = upper(trim(p_code))
       and (user_id = p_user or (user_id is null and p_email is not null and lower(customer_email) = lower(p_email))) for update;
  else
    begin v_phone := public.shop_normalize_phone(p_phone);
    exception when others then return jsonb_build_object('ok', false, 'reason', 'not_found'); end;
    select * into o from public.shop_orders where organization_id = p_org and code = upper(trim(p_code)) and customer_phone = v_phone for update;
  end if;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if o.status <> 'awaiting_payment' then return jsonb_build_object('ok', false, 'reason', 'locked'); end if;
  if o.payment_method <> p_method then
    update public.shop_orders set payment_method = p_method where id = o.id;
    insert into public.shop_order_events (organization_id, order_id, scope, from_status, to_status, actor_label, note)
    values (o.organization_id, o.id, 'order', 'awaiting_payment', 'awaiting_payment', 'cliente', 'forma de pagamento: ' || o.payment_method || ' → ' || p_method);
  end if;
  return jsonb_build_object('ok', true, 'previous', o.payment_method,
    'order', jsonb_build_object('code', o.code, 'total_cents', o.total_cents, 'customer_name', o.customer_name, 'customer_email', o.customer_email,
      'customer_phone', o.customer_phone, 'payment_url', o.payment_ref ->> 'link_url',
      'items', (select coalesce(jsonb_agg(jsonb_build_object('name', i.product_name, 'variant', i.variant_label, 'quantity', i.quantity,
                  'unit_final_cents', i.unit_final_cents) order by i.created_at), '[]'::jsonb) from public.shop_order_items i where i.order_id = o.id)));
end $function$
;

CREATE OR REPLACE FUNCTION public.shop_check_min_reached(p_order uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r record; pr public.shop_products; total int;
begin
  for r in select distinct oi.product_id from public.shop_order_items oi where oi.order_id = p_order and oi.product_id is not null loop
    select * into pr from public.shop_products where id = r.product_id and min_units is not null and notify_min_reached and min_notified_at is null for update;
    continue when not found;
    select coalesce(sum(oi.quantity), 0)::int into total
      from public.shop_order_items oi join public.shop_orders so on so.id = oi.order_id
     where oi.product_id = pr.id and (so.status = 'paid' or so.id = p_order);
    if total >= pr.min_units then
      update public.shop_products set min_notified_at = now() where id = pr.id;
      insert into public.shop_email_outbox (organization_id, order_id, event_id, template, to_email, product_id)
      select so.organization_id, so.id, null, 'production_started', so.customer_email, pr.id
        from public.shop_orders so
       where so.organization_id = pr.organization_id and (so.status = 'paid' or so.id = p_order)
         and exists (select 1 from public.shop_order_items oi where oi.order_id = so.id and oi.product_id = pr.id)
      on conflict do nothing;
    end if;
  end loop;
end $function$
;

CREATE OR REPLACE FUNCTION public.shop_coupon_check(p_slug text, p_code text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid; v_ip text := public.shop_request_ip(); c public.shop_coupons;
begin
  select id into v_org from public.organizations where slug = p_slug and is_active;
  if v_org is null then return null; end if;
  if not public.shop_rate_limit('coupon-ip|' || coalesce(encode(extensions.digest(v_ip, 'sha256'), 'hex'), 'sem-ip|' || p_slug),
                                case when v_ip is null then 120 else 30 end, interval '10 minutes') then return null; end if;
  select * into c from public.shop_coupons
   where organization_id = v_org and code = upper(trim(coalesce(p_code, ''))) and is_active;
  if c.id is null then return null; end if;
  if c.valid_until is not null and c.valid_until < (now() at time zone 'America/Sao_Paulo')::date then return null; end if;
  if c.max_uses is not null and public.shop_coupon_uses(v_org, c.code) >= c.max_uses then return null; end if;
  return c.discount_pct;
end $function$
;

CREATE OR REPLACE FUNCTION public.shop_coupon_uses(p_org uuid, p_code text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select count(*)::int from public.shop_orders where organization_id = p_org and coupon_code = p_code and status <> 'cancelled'
$function$
;

CREATE OR REPLACE FUNCTION public.shop_create_order(p_org uuid, p_user uuid, p_name text, p_phone text, p_email text, p_pickup uuid, p_method text, p_items jsonb, p_hours integer, p_coupon text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_phone text := public.shop_normalize_phone(p_phone);
  v_email text := lower(trim(coalesce(p_email, '')));
  v_name text := trim(coalesce(p_name, ''));
  v_member uuid; v_special boolean := false; v_pp record; v_order uuid; v_code text;
  r record; v_unit int; v_pct numeric; v_sub int := 0; v_total int := 0; v_open int; v_kinds text[] := '{}';
  v_items jsonb := '[]'::jsonb; v_coupon public.shop_coupons; v_coupon_off int := 0; v_unit2 int;
begin
  if v_name = '' or length(v_name) > 120 then raise exception 'Informe o seu nome.' using errcode = 'P0001'; end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 200 then raise exception 'Informe um e-mail válido.' using errcode = 'P0001'; end if;
  if p_method not in ('pix', 'infinitepay') then raise exception 'Método de pagamento inválido.' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 30 then
    raise exception 'O carrinho está vazio ou grande demais.' using errcode = 'P0001';
  end if;

  select * into v_pp from public.shop_pickup_points where id = p_pickup and organization_id = p_org and is_active and public.shop_schedule_has_future(schedule);
  if not found then raise exception 'Escolha um ponto de retirada válido.' using errcode = 'P0001'; end if;

  select count(*) into v_open from public.shop_orders
   where organization_id = p_org and status = 'awaiting_payment' and (customer_phone = v_phone or lower(customer_email) = v_email);
  if v_open >= 3 then raise exception 'Você já tem pedidos aguardando pagamento. Conclua ou aguarde o prazo deles antes de fazer outro.' using errcode = 'P0001'; end if;

  if p_user is not null then v_member := public.shop_active_member_id(p_org, p_user); v_special := public.shop_is_special(p_org, p_user); end if;
  if nullif(trim(coalesce(p_coupon, '')), '') is not null then
    select * into v_coupon from public.shop_coupons where organization_id = p_org and code = upper(trim(p_coupon)) and is_active for update;
    if v_coupon.id is null then raise exception 'Cupom inválido ou desativado.' using errcode = 'P0001'; end if;
    if v_coupon.valid_until is not null and v_coupon.valid_until < (now() at time zone 'America/Sao_Paulo')::date then
      raise exception 'O cupom % passou da validade. Tire o cupom para continuar.', v_coupon.code using errcode = 'P0001';
    end if;
    if v_coupon.max_uses is not null and public.shop_coupon_uses(p_org, v_coupon.code) >= v_coupon.max_uses then
      raise exception 'O cupom % já foi usado o número máximo de vezes. Tire o cupom para continuar.', v_coupon.code using errcode = 'P0001';
    end if;
  end if;

  v_code := public.shop_new_order_code();
  insert into public.shop_orders (organization_id, code, customer_name, customer_phone, customer_email, member_id, pickup_point_id,
                                  payment_method, subtotal_cents, discount_cents, total_cents, expires_at)
  values (p_org, v_code, v_name, v_phone, v_email, v_member, p_pickup, p_method, 1, 0, 1, now() + make_interval(hours => p_hours))
  returning id into v_order;

  for r in
    select x.variant_id, sum(x.quantity)::int as qty
      from jsonb_to_recordset(p_items) as x(variant_id uuid, quantity int)
     group by x.variant_id order by x.variant_id
  loop
    declare v record;
    begin
      if r.qty is null or r.qty < 1 or r.qty > 20 then raise exception 'Quantidade inválida no carrinho.' using errcode = 'P0001'; end if;
      select v2.id as variant_id, v2.label, v2.stock, v2.reserved, p.id as product_id, p.name, p.kind, p.price_cents, p.member_discount_pct, p.special_price_cents
        into v
        from public.shop_product_variants v2
        join public.shop_products p on p.id = v2.product_id and p.organization_id = v2.organization_id
       where v2.id = r.variant_id and v2.organization_id = p_org and v2.is_active and p.is_active and not p.is_hidden
         for update of v2;
      if not found then raise exception 'Um item do carrinho não está mais à venda. Atualize o carrinho.' using errcode = 'P0001'; end if;
      if exists (select 1 from public.shop_product_pickups pk where pk.product_id = v.product_id)
         and not exists (select 1 from public.shop_product_pickups pk where pk.product_id = v.product_id and pk.pickup_point_id = p_pickup) then
        raise exception '% não pode ser retirado no ponto escolhido. Escolha outro ponto de retirada.', v.name using errcode = 'P0001';
      end if;

      if v.kind = 'stock' then
        if coalesce(v.stock, 0) - v.reserved < r.qty then
          raise exception 'Estoque insuficiente para % (%). Restam % unidade(s).', v.name, v.label, greatest(coalesce(v.stock, 0) - v.reserved, 0) using errcode = 'P0001';
        end if;
        update public.shop_product_variants set reserved = reserved + r.qty where id = v.variant_id;
      end if;

      v_pct := case when v_member is not null then v.member_discount_pct else 0 end;
      v_unit := round(v.price_cents * (100 - v_pct) / 100.0)::int;
      -- D2 (LOJA-11): o preço especial só vale quando é menor que o preço que a pessoa já pagaria (integrante ou público).
      if v_special and v.special_price_cents is not null and v.special_price_cents < v_unit then
        v_unit := v.special_price_cents;
        v_pct := round((v.price_cents - v_unit) * 100.0 / v.price_cents, 2);
      end if;
      if v_coupon.id is not null then
        v_unit2 := round(v.price_cents * (100 - v_coupon.discount_pct) / 100.0)::int;
        if v_unit2 > 0 and v_unit2 < v_unit then
          v_coupon_off := v_coupon_off + (v_unit - v_unit2) * r.qty;
          v_unit := v_unit2;
          v_pct := round((v.price_cents - v_unit) * 100.0 / v.price_cents, 2);
        end if;
      end if;
      if v_unit <= 0 then raise exception 'Preço inválido para %.', v.name using errcode = 'P0001'; end if;

      insert into public.shop_order_items (organization_id, order_id, product_id, variant_id, kind, product_name, variant_label,
                                           quantity, unit_price_cents, discount_pct, unit_final_cents)
      values (p_org, v_order, v.product_id, v.variant_id, v.kind, v.name, v.label, r.qty, v.price_cents, v_pct, v_unit);

      v_sub := v_sub + v.price_cents * r.qty;
      v_total := v_total + v_unit * r.qty;
      if not (v.kind = any (v_kinds)) then v_kinds := v_kinds || v.kind; end if;
      v_items := v_items || jsonb_build_object('name', v.name, 'variant', v.label, 'quantity', r.qty, 'unit_final_cents', v_unit, 'kind', v.kind);
    end;
  end loop;

  update public.shop_orders set subtotal_cents = v_sub, discount_cents = v_sub - v_total, total_cents = v_total,
         coupon_code = case when v_coupon_off > 0 then v_coupon.code end, coupon_pct = case when v_coupon_off > 0 then v_coupon.discount_pct end, coupon_discount_cents = v_coupon_off
   where id = v_order;
  insert into public.shop_fulfillments (organization_id, order_id, kind) select p_org, v_order, unnest(v_kinds);
  insert into public.shop_order_events (organization_id, order_id, scope, from_status, to_status, actor_label, note)
  values (p_org, v_order, 'order', null, 'awaiting_payment', 'cliente', case when v_member is not null then 'preço de integrante' end);

  return jsonb_build_object(
    'code', v_code, 'status', 'awaiting_payment', 'payment_method', p_method,
    'subtotal_cents', v_sub, 'discount_cents', v_sub - v_total, 'total_cents', v_total,
    'coupon_code', case when v_coupon_off > 0 then v_coupon.code end, 'coupon_discount_cents', v_coupon_off,
    'expires_at', (select expires_at from public.shop_orders where id = v_order), 'is_member_price', v_member is not null,
    'pickup', jsonb_build_object('name', v_pp.name, 'address', v_pp.address, 'opening_hours', coalesce(public.shop_pickup_when(v_pp.schedule, v_pp.opening_hours), '')),
    'items', v_items, 'kinds', to_jsonb(v_kinds));
end $function$
;

CREATE OR REPLACE FUNCTION public.shop_enqueue_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t text; v_email text;
begin
  if new.scope = 'order' and new.to_status = 'paid' and new.from_status is distinct from 'paid' then
    perform public.shop_check_min_reached(new.order_id);
  end if;
  if new.scope = 'order' then
    t := case
      when new.from_status is null and new.to_status = 'awaiting_payment' then 'order_created'
      when new.from_status is distinct from 'paid' and new.to_status = 'paid' then 'paid'
      when new.from_status is distinct from 'cancelled' and new.to_status = 'cancelled' then 'cancelled'
    end;
  else
    t := case
      when (new.from_status, new.to_status) in (('pending', 'in_preparation')) then 'fulfillment_in_preparation'
      when (new.from_status, new.to_status) in (('pending', 'ready'), ('in_preparation', 'ready')) then 'fulfillment_ready'
      when (new.from_status, new.to_status) in (('ready', 'picked_up')) then 'fulfillment_picked_up'
    end;
  end if;
  if t is null then return new; end if;
  select customer_email into v_email from public.shop_orders where id = new.order_id;
  if t = 'order_created' and (select count(*) from public.shop_email_outbox b
                               where b.template = 'order_created' and lower(b.to_email) = lower(v_email) and b.created_at > now() - interval '1 day') >= 5 then
    return new;
  end if;
  insert into public.shop_email_outbox (organization_id, order_id, event_id, template, to_email)
  values (new.organization_id, new.order_id, new.id, t, v_email) on conflict (event_id, template) do nothing;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.shop_expire_orders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r record; n int := 0;
begin
  for r in select id from public.shop_orders where status = 'awaiting_payment' and expires_at < now() order by expires_at limit 200 loop
    if public.shop_cancel_order(r.id, 'Prazo para pagamento expirado', null, 'sistema') then n := n + 1; end if;
  end loop;
  delete from public.shop_lookup_attempts where created_at < now() - interval '2 days';
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.shop_get_public_store(p_slug text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'org', jsonb_build_object('id', o.id, 'name', o.name, 'short_name', o.short_name, 'slug', o.slug, 'logo_path', o.logo_path, 'theme', o.theme),
    'featured_title', coalesce((select s.featured_title from public.shop_settings s where s.organization_id = o.id), 'Destaques'), 'intro_text', (select s.intro_text from public.shop_settings s where s.organization_id = o.id),
    'reservation_hours', coalesce((select s.reservation_hours from public.shop_settings s where s.organization_id = o.id), 48),
    'privacy_retention_years', coalesce((select s.privacy_retention_years from public.shop_settings s where s.organization_id = o.id), 5),
    'credit_fees_pct', coalesce((select to_jsonb(s.credit_fees_pct) from public.shop_settings s where s.organization_id = o.id), '[4.2,6.09,7.01,7.91,8.8,9.67,12.59,13.42,14.25,15.06,15.87,16.66]'::jsonb),
    'payment_methods', coalesce((
      select to_jsonb(array_remove(array[
               case when 'pix' = any (s.payment_methods) and s.pix_key is not null and s.pix_beneficiary is not null then 'pix' end,
               case when 'infinitepay' = any (s.payment_methods) and s.infinitepay_handle is not null and s.public_site_url is not null then 'infinitepay' end], null))
        from public.shop_settings s where s.organization_id = o.id), '[]'::jsonb),
    'pix', (select case when s.pix_key is not null and s.pix_beneficiary is not null then jsonb_build_object('key', s.pix_key, 'beneficiary', s.pix_beneficiary, 'city', s.pix_city) end
              from public.shop_settings s where s.organization_id = o.id),
    'contact', coalesce((select jsonb_build_object('whatsapp', s.contact_whatsapp, 'email', s.contact_email, 'directors', s.directors)
                           from public.shop_settings s where s.organization_id = o.id),
                        jsonb_build_object('whatsapp', null, 'email', null, 'directors', '[]'::jsonb)),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'is_featured', p.is_featured, 'slug', p.slug, 'name', p.name, 'description', p.description, 'kind', p.kind,
        'price_cents', p.price_cents, 'member_discount_pct', p.member_discount_pct, 'special_price_cents', p.special_price_cents, 'show_remaining', p.show_remaining, 'show_remaining_when', p.show_remaining_when, 'lead_time_days', p.lead_time_days, 'pickup_ids', coalesce((select jsonb_agg(pk.pickup_point_id) from public.shop_product_pickups pk where pk.product_id = p.id), '[]'::jsonb), 'is_kit', p.is_kit, 'components', case when p.is_kit then coalesce((select jsonb_agg(jsonb_build_object('name', it.name, 'quantity', vs.quantity) order by vs.sort_order, it.name) from public.shop_variant_stock vs join public.shop_product_variants kv on kv.id = vs.variant_id join public.shop_stock_items it on it.id = vs.stock_item_id where kv.product_id = p.id), '[]'::jsonb) end, 'min_units', p.min_units, 'suggested_ids', to_jsonb(p.suggested_ids), 'confirmed_units', case when p.min_units is null then null else coalesce((select sum(oi.quantity)::int from public.shop_order_items oi join public.shop_orders so on so.id = oi.order_id and so.organization_id = oi.organization_id where oi.product_id = p.id and so.status = 'paid'), 0) end,
        'images', coalesce((select jsonb_agg(i.storage_path order by i.sort_order, i.created_at)
                              from public.shop_product_images i where i.product_id = p.id), '[]'::jsonb) || case when p.is_kit and p.kit_component_photos then coalesce((select jsonb_agg(x.path order by x.ord) from (select distinct on (im.storage_path) im.storage_path as path, vs.sort_order * 1000 + im.sort_order as ord from public.shop_variant_stock vs join public.shop_product_variants kv on kv.id = vs.variant_id and kv.product_id = p.id join public.shop_variant_stock vs2 on vs2.stock_item_id = vs.stock_item_id join public.shop_product_variants v2 on v2.id = vs2.variant_id and v2.product_id <> p.id join public.shop_products p2 on p2.id = v2.product_id and p2.is_active and not p2.is_kit and (select count(*) from public.shop_variant_stock cnt where cnt.variant_id = v2.id) = 1 join public.shop_product_images im on im.product_id = p2.id order by im.storage_path) x), '[]'::jsonb) else '[]'::jsonb end,
        'variants', coalesce((select jsonb_agg(jsonb_build_object(
                        'id', v.id, 'label', v.label,
                        'available', case when p.kind = 'stock' then (select coalesce(min(case when not it.is_active then 0 when it.stock is null then 1000 else greatest(it.stock - it.reserved, 0) / vs.quantity end), 0)::int from public.shop_variant_stock vs join public.shop_stock_items it on it.id = vs.stock_item_id where vs.variant_id = v.id) end)
                      order by v.sort_order, v.label)
                    from public.shop_product_variants v where v.product_id = p.id and v.is_active), '[]'::jsonb)
      ) order by p.sort_order, p.name)
      from public.shop_products p where p.organization_id = o.id and p.is_active and not p.is_hidden), '[]'::jsonb),
    'pickup_points', coalesce((
      select jsonb_agg(jsonb_build_object('id', pp.id, 'name', pp.name, 'address', pp.address, 'kind', pp.kind, 'contact_name', pp.contact_name, 'contact_phone', pp.contact_phone,
                                          'opening_hours', coalesce(public.shop_pickup_when(pp.schedule, pp.opening_hours), ''))
                       order by pp.sort_order, pp.name)
      from public.shop_pickup_points pp where pp.organization_id = o.id and pp.is_active and public.shop_schedule_has_future(pp.schedule)), '[]'::jsonb)
  )
  from public.organizations o where o.slug = p_slug and o.is_active
$function$
;

CREATE OR REPLACE FUNCTION public.shop_get_settings(p_org uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(
    (select jsonb_build_object('payment_methods', to_jsonb(payment_methods), 'infinitepay_handle', infinitepay_handle, 'public_site_url', public_site_url,
                               'pix_key', pix_key, 'pix_beneficiary', pix_beneficiary, 'reservation_hours', reservation_hours)
       from public.shop_settings where organization_id = p_org),
    jsonb_build_object('payment_methods', jsonb_build_array(), 'infinitepay_handle', null, 'public_site_url', null, 'pix_key', null, 'pix_beneficiary', null, 'reservation_hours', 48))
$function$
;

CREATE OR REPLACE FUNCTION public.shop_guard_item_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if current_user in ('authenticated', 'anon') and new.reserved is distinct from old.reserved then
    raise exception 'A reserva de estoque é controlada pelos pedidos.' using errcode = '42501';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.shop_guard_variant_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if current_user in ('authenticated', 'anon') and new.reserved is distinct from old.reserved then
    raise exception 'A reserva de estoque é controlada pelos pedidos.' using errcode = '42501';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.shop_is_special(p_org uuid, p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.shop_active_member_id(p_org, p_user) is not null
     and exists (
       select 1 from public.members m
         join public.member_access_roles mar on mar.member_id = m.id and mar.revoked_at is null
         join public.access_roles ar on ar.id = mar.access_role_id and ar.key in ('titular', 'direcao', 'professor', 'monitor')
        where m.organization_id = p_org and m.user_id = p_user and m.archived_at is null)
$function$
;

CREATE OR REPLACE FUNCTION public.shop_mail_claim(p_limit integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r record; out jsonb := '[]'::jsonb; ctx jsonb;
begin
  for r in
    select b.* from public.shop_email_outbox b
     where b.status = 'pending' and b.next_attempt_at <= now() and b.attempts < 5
     order by b.created_at limit greatest(1, least(p_limit, 50)) for update skip locked
  loop
    update public.shop_email_outbox set attempts = attempts + 1, next_attempt_at = now() + interval '10 minutes' where id = r.id;
    select jsonb_build_object(
      'outbox_id', r.id, 'template', r.template, 'to_email', r.to_email,
      'kind', (select e.note from public.shop_order_events e where e.id = r.event_id and e.scope = 'fulfillment'),
      'cancel_reason', o.cancel_reason, 'product', (select jsonb_build_object('name', sp.name, 'min_units', sp.min_units, 'lead_time_days', sp.lead_time_days) from public.shop_products sp where sp.id = r.product_id),
      'order', jsonb_build_object('code', o.code, 'customer_name', o.customer_name, 'status', o.status, 'payment_method', o.payment_method,
                                  'subtotal_cents', o.subtotal_cents, 'discount_cents', o.discount_cents, 'coupon_code', o.coupon_code, 'coupon_discount_cents', o.coupon_discount_cents, 'total_cents', o.total_cents, 'expires_at', o.expires_at,
                                  'payment_url', o.payment_ref ->> 'link_url',
                                  'items', (select coalesce(jsonb_agg(jsonb_build_object('name', i.product_name, 'variant', i.variant_label, 'quantity', i.quantity,
                                              'unit_final_cents', i.unit_final_cents, 'kind', i.kind, 'product_id', i.product_id, 'progress', case when i.kind = 'made_to_order' then public.shop_product_progress(i.product_id) end) order by i.created_at), '[]'::jsonb) from public.shop_order_items i where i.order_id = o.id)),
      'pickup', jsonb_build_object('name', pp.name, 'address', pp.address, 'opening_hours', coalesce(public.shop_pickup_when(pp.schedule, pp.opening_hours), '')),
      'org', jsonb_build_object('name', g.name, 'theme', g.theme),
      'settings', jsonb_build_object('pix_key', s.pix_key, 'pix_beneficiary', s.pix_beneficiary, 'pix_city', s.pix_city, 'public_site_url', s.public_site_url,
                                     'contact_whatsapp', s.contact_whatsapp, 'contact_email', s.contact_email, 'directors', s.directors,
                                     'mail_from_name', s.mail_from_name, 'mail_from_email', s.mail_from_email))
      into ctx
      from public.shop_orders o
      join public.shop_pickup_points pp on pp.id = o.pickup_point_id
      join public.organizations g on g.id = o.organization_id
      left join public.shop_settings s on s.organization_id = o.organization_id
     where o.id = r.order_id;
    out := out || jsonb_build_array(ctx);
  end loop;
  return out;
end $function$
;

CREATE OR REPLACE FUNCTION public.shop_mail_done(p_id uuid, p_ok boolean, p_error text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  update public.shop_email_outbox
     set status = case when p_ok then 'sent' when attempts >= 5 then 'failed' else 'pending' end,
         sent_at = case when p_ok then now() end,
         last_error = case when p_ok then null else left(p_error, 300) end,
         next_attempt_at = case when p_ok then next_attempt_at else now() + (attempts * interval '5 minutes') end
   where id = p_id
$function$
;

CREATE OR REPLACE FUNCTION public.shop_mark_paid(p_code text, p_via text, p_actor_member uuid, p_actor_label text, p_ref jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o record;
begin
  select * into o from public.shop_orders where code = upper(trim(p_code)) for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if p_via not in ('manual', 'webhook') then raise exception 'Origem de pagamento inválida.' using errcode = 'P0001'; end if;

  if o.status = 'paid' then return jsonb_build_object('ok', true, 'status', 'paid', 'already', true); end if;

  if o.status = 'cancelled' then
    insert into public.shop_order_events (organization_id, order_id, scope, from_status, to_status, actor_member_id, actor_label, note)
    values (o.organization_id, o.id, 'order', 'cancelled', 'cancelled', p_actor_member, coalesce(p_actor_label, 'sistema'),
            'PAGAMENTO RECEBIDO APÓS O CANCELAMENTO: reativar o pedido ou reembolsar o cliente');
    update public.shop_orders set payment_ref = payment_ref || coalesce(p_ref, '{}'::jsonb) || jsonb_build_object('paid_after_cancel', true) where id = o.id;
    return jsonb_build_object('ok', false, 'reason', 'cancelled');
  end if;

  update public.shop_orders
     set status = 'paid', paid_at = now(), paid_by = p_actor_member, paid_via = p_via, expires_at = null,
         payment_ref = payment_ref || coalesce(p_ref, '{}'::jsonb)
   where id = o.id;
  insert into public.shop_order_events (organization_id, order_id, scope, from_status, to_status, actor_member_id, actor_label, note)
  values (o.organization_id, o.id, 'order', o.status, 'paid', p_actor_member, coalesce(p_actor_label, case when p_via = 'webhook' then 'InfinitePay' else 'sistema' end),
          case when p_via = 'webhook' then 'confirmado automaticamente pela InfinitePay' end);
  return jsonb_build_object('ok', true, 'status', 'paid');
end $function$
;

CREATE OR REPLACE FUNCTION public.shop_my_contact(p_org uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'name', m.full_name, 'email', m.email,
    'phone', coalesce(nullif(regexp_replace(coalesce(m.phone, ''), '\D', '', 'g'), ''),
      (select regexp_replace(o.customer_phone, '^55', '') from public.shop_orders o where o.organization_id = p_org and o.user_id = auth.uid() order by o.created_at desc limit 1)))
  from (select 1) x left join public.members m on m.organization_id = p_org and m.user_id = auth.uid() and m.archived_at is null
$function$
;

CREATE OR REPLACE FUNCTION public.shop_my_is_special(p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select public.shop_is_special(p_org, auth.uid()) $function$
;

CREATE OR REPLACE FUNCTION public.shop_my_member_id(p_org uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.shop_active_member_id(p_org, auth.uid())
$function$
;

CREATE OR REPLACE FUNCTION public.shop_new_order_code()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; hex text; candidate text; i int;
begin
  loop
    hex := replace(gen_random_uuid()::text, '-', '');
    candidate := '';
    for i in 0..7 loop
      candidate := candidate || substr(alphabet, (('x' || substr(hex, i * 2 + 1, 2))::bit(8)::int % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.shop_orders o where o.code = candidate);
  end loop;
  return candidate;
end $function$
;

CREATE OR REPLACE FUNCTION public.shop_normalize_phone(p_phone text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare d text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if length(d) in (10, 11) then d := '55' || d; end if;
  if d !~ '^55[0-9]{10,11}$' then raise exception 'Informe um telefone com DDD, por exemplo (21) 99999-8888.' using errcode = 'P0001'; end if;
  return d;
end $function$
;

CREATE OR REPLACE FUNCTION public.shop_order_by_request(p_org uuid, p_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r record;
begin
  select * into r from public.shop_orders where organization_id = p_org and client_request_id = p_request;
  if not found then return null; end if;
  return jsonb_build_object('code', r.code, 'status', r.status, 'payment_url', r.payment_ref ->> 'link_url');
end $function$
;

CREATE OR REPLACE FUNCTION public.shop_order_for_payment(p_code text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object('id', o.id, 'code', o.code, 'status', o.status, 'total_cents', o.total_cents, 'payment_method', o.payment_method,
                            'payment_ref', o.payment_ref, 'infinitepay_handle', s.infinitepay_handle)
    from public.shop_orders o left join public.shop_settings s on s.organization_id = o.organization_id
   where o.code = upper(trim(p_code))
$function$
;

CREATE OR REPLACE FUNCTION public.shop_order_is_finished(p_order uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.shop_orders o
     where o.id = p_order
       and (o.status = 'cancelled'
            or (o.status = 'paid'
                and exists (select 1 from public.shop_fulfillments f where f.order_id = o.id)
                and not exists (select 1 from public.shop_fulfillments f where f.order_id = o.id and f.status <> 'picked_up'))))
$function$
;

CREATE OR REPLACE FUNCTION public.shop_order_lookup(p_code text, p_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_phone text; v_id uuid;
begin
  begin v_phone := public.shop_normalize_phone(p_phone);
  exception when others then return jsonb_build_object('ok', false); end;
  select id into v_id from public.shop_orders where code = upper(trim(p_code)) and customer_phone = v_phone;
  if v_id is null then return jsonb_build_object('ok', false); end if;
  return public.shop_order_view(v_id);
end $function$
;

CREATE OR REPLACE FUNCTION public.shop_order_owned(p_org uuid, p_user uuid, p_email text, p_code text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select id from public.shop_orders
   where organization_id = p_org and code = upper(trim(p_code))
     and (user_id = p_user or (user_id is null and p_email is not null and lower(customer_email) = lower(p_email)));
$function$
;

CREATE OR REPLACE FUNCTION public.shop_order_status(p_code text, p_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_phone text; r record;
begin
  begin v_phone := public.shop_normalize_phone(p_phone);
  exception when others then return jsonb_build_object('ok', false); end;
  select status into r from public.shop_orders where code = upper(trim(p_code)) and customer_phone = v_phone;
  if not found then return jsonb_build_object('ok', false); end if;
  return jsonb_build_object('ok', true, 'status', r.status);
end $function$
;

CREATE OR REPLACE FUNCTION public.shop_order_view(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r record;
begin
  select ord.*, pp.name as pp_name, pp.address as pp_address, pp.opening_hours as pp_hours into r
    from public.shop_orders ord join public.shop_pickup_points pp on pp.id = ord.pickup_point_id where ord.id = p_id;
  if not found then return jsonb_build_object('ok', false); end if;
  return jsonb_build_object(
    'ok', true,
    'order', jsonb_build_object(
      'code', r.code, 'status', r.status, 'payment_method', r.payment_method, 'customer_name', r.customer_name,
      'pickup_point_id', r.pickup_point_id,
      'subtotal_cents', r.subtotal_cents, 'discount_cents', r.discount_cents, 'coupon_code', r.coupon_code, 'coupon_discount_cents', r.coupon_discount_cents, 'total_cents', r.total_cents,
      'created_at', r.created_at, 'expires_at', r.expires_at, 'paid_at', r.paid_at,
      'payment_url', case when r.status = 'awaiting_payment' and r.payment_method = 'infinitepay' then r.payment_ref ->> 'link_url' end,
      'cancel_reason', case when r.status = 'cancelled' and r.cancel_reason is distinct from 'Falha ao iniciar o pagamento' then r.cancel_reason end),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('name', i.product_name, 'variant', i.variant_label, 'quantity', i.quantity,
                'unit_final_cents', i.unit_final_cents, 'kind', i.kind, 'product_id', i.product_id, 'progress', case when i.kind = 'made_to_order' then public.shop_product_progress(i.product_id) end) order by i.created_at), '[]'::jsonb) from public.shop_order_items i where i.order_id = r.id),
    'fulfillments', (select coalesce(jsonb_agg(jsonb_build_object('kind', f.kind, 'status', f.status) order by f.kind), '[]'::jsonb) from public.shop_fulfillments f where f.order_id = r.id),
    'pickup', jsonb_build_object('name', r.pp_name, 'address', r.pp_address, 'opening_hours', r.pp_hours),
    'timeline', (select coalesce(jsonb_agg(jsonb_build_object('scope', e.scope, 'status', e.to_status,
                  'kind', case when e.scope = 'fulfillment' then e.note end, 'at', e.created_at) order by e.created_at), '[]'::jsonb)
                   from public.shop_order_events e where e.order_id = r.id and e.from_status is distinct from e.to_status));
end $function$
;

CREATE OR REPLACE FUNCTION public.shop_orders_of_user(p_org uuid, p_user uuid, p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v jsonb;
begin
  select coalesce(jsonb_agg(public.shop_order_view(o.id) - 'ok' order by o.created_at desc), '[]'::jsonb) into v
    from (select id, created_at from public.shop_orders
           where organization_id = p_org and (user_id = p_user or (user_id is null and p_email is not null and lower(customer_email) = lower(p_email)))
           order by created_at desc limit 100) o;
  return v;
end $function$
;

CREATE OR REPLACE FUNCTION public.shop_org_id(p_slug text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select id from public.organizations where slug = p_slug and is_active
$function$
;

CREATE OR REPLACE FUNCTION public.shop_pickup_compose()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_name text := nullif(trim(coalesce(new.contact_name, '')), ''); v_phone text := nullif(trim(coalesce(new.contact_phone, '')), '');
        v_digits text := nullif(regexp_replace(coalesce(new.contact_phone, ''), '\D', '', 'g'), '');
begin
  if new.kind = 'person' then
    new.address := 'Combine a entrega direto com ' || coalesce(v_name, 'o responsável') || coalesce(' (' || v_digits || ')', '') || '. Pode ser encontro ao vivo, entrega por aplicativo ou ensaio.';
  else
    new.address := trim(coalesce(new.place_address, new.address, ''))
      || case when v_name is not null then ' — procure por ' || v_name || coalesce(' (' || v_phone || ')', '') else '' end;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.shop_pickup_when(p_schedule jsonb, p_note text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select nullif(concat_ws(' · ',
    (select string_agg(
        (array['Domingos', 'Segundas', 'Terças', 'Quartas', 'Quintas', 'Sextas', 'Sábados'])[(s ->> 'weekday')::int + 1]
        || coalesce(' (' || nullif(s ->> 'label', '') || ')', '') || coalesce(', ' || public.shop_slot_hours(s), ''),
        ' · ' order by ((s ->> 'weekday')::int + 6) % 7, s ->> 'start')
       from jsonb_array_elements(coalesce(p_schedule, '[]'::jsonb)) s where s ->> 'type' = 'weekly'),
    (select string_agg(
        (array['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'])[extract(dow from (s ->> 'date')::date)::int + 1] || ' ' || to_char((s ->> 'date')::date, 'DD/MM/YYYY')
        || coalesce(' (' || nullif(s ->> 'label', '') || ')', '') || coalesce(', ' || public.shop_slot_hours(s), ''),
        ' · ' order by s ->> 'date', s ->> 'start')
       from jsonb_array_elements(coalesce(p_schedule, '[]'::jsonb)) s
      where s ->> 'type' = 'date' and (s ->> 'date')::date >= (now() at time zone 'America/Sao_Paulo')::date),
    nullif(trim(coalesce(p_note, '')), '')), '')
$function$
;

CREATE OR REPLACE FUNCTION public.shop_product_progress(p_product uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case when sp.min_units is null then null else jsonb_build_object(
    'min_units', sp.min_units,
    'confirmed_units', coalesce((select sum(oi.quantity)::int from public.shop_order_items oi
                                   join public.shop_orders so on so.id = oi.order_id and so.organization_id = oi.organization_id
                                  where oi.product_id = sp.id and so.status = 'paid'), 0)) end
    from public.shop_products sp where sp.id = p_product
$function$
;

CREATE OR REPLACE FUNCTION public.shop_rate_limit(p_bucket text, p_max integer, p_window interval)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n int;
begin
  -- Uma chamada por vez em cada contador: duas requisições simultâneas não passam juntas do limite.
  perform pg_advisory_xact_lock(hashtextextended('shop_rate_limit:' || p_bucket, 0));
  select count(*) into n from public.shop_lookup_attempts where bucket = p_bucket and created_at > now() - p_window;
  if n >= p_max then return false; end if;
  insert into public.shop_lookup_attempts (bucket) values (p_bucket);
  return true;
end $function$
;

CREATE OR REPLACE FUNCTION public.shop_request_ip()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select nullif(btrim(coalesce(
    (nullif(current_setting('request.headers', true), '')::json ->> 'cf-connecting-ip'),
    split_part((nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for'), ',', 1))), '')
$function$
;

CREATE OR REPLACE FUNCTION public.shop_schedule_has_future(p jsonb)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select p is null or jsonb_array_length(p) = 0 or exists (
    select 1 from jsonb_array_elements(p) s
     where s ->> 'type' = 'weekly'
        or (s ->> 'type' = 'date' and (s ->> 'date')::date >= (now() at time zone 'America/Sao_Paulo')::date))
$function$
;

CREATE OR REPLACE FUNCTION public.shop_schedule_valid(p jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare s jsonb;
begin
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 20 then return false; end if;
  for s in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(s) <> 'object' then return false; end if;
    if s ->> 'type' = 'weekly' then
      if (s ->> 'weekday') !~ '^[0-6]$' then return false; end if;
    elsif s ->> 'type' = 'date' then
      if (s ->> 'date') !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
      perform (s ->> 'date')::date;
    else
      return false;
    end if;
    if s ? 'start' and (s ->> 'start') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return false; end if;
    if s ? 'end' and (s ->> 'end') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return false; end if;
    if s ? 'start' and s ? 'end' and (s ->> 'start') >= (s ->> 'end') then return false; end if;
    if s ? 'label' and length(s ->> 'label') > 60 then return false; end if;
  end loop;
  return true;
exception when others then return false;
end $function$
;

CREATE OR REPLACE FUNCTION public.shop_set_order_owner(p_code text, p_user uuid, p_request uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update public.shop_orders set user_id = p_user, client_request_id = p_request where code = p_code;
  return true;
exception when unique_violation then return false;
end $function$
;

CREATE OR REPLACE FUNCTION public.shop_set_payment_ref(p_code text, p_ref jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  update public.shop_orders set payment_ref = payment_ref || coalesce(p_ref, '{}'::jsonb) where code = upper(trim(p_code))
$function$
;

CREATE OR REPLACE FUNCTION public.shop_settings_payment_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT'
     or new.pix_key is distinct from old.pix_key or new.pix_beneficiary is distinct from old.pix_beneficiary
     or new.infinitepay_handle is distinct from old.infinitepay_handle or new.payment_methods is distinct from old.payment_methods then
    new.payment_changed_at := now();
    new.payment_changed_by := (select m.id from public.members m where m.organization_id = new.organization_id and m.user_id = auth.uid() limit 1);
  else
    new.payment_changed_at := old.payment_changed_at;
    new.payment_changed_by := old.payment_changed_by;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.shop_slot_hours(s jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when s ? 'start' and s ? 'end' then 'das ' || public.shop_time_text(s ->> 'start') || ' às ' || public.shop_time_text(s ->> 'end')
    when s ? 'start' then 'a partir das ' || public.shop_time_text(s ->> 'start')
    when s ? 'end' then 'até às ' || public.shop_time_text(s ->> 'end')
    else null end
$function$
;

CREATE OR REPLACE FUNCTION public.shop_time_text(t text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case when t is null then null
              when substr(t, 4, 2) = '00' then (substr(t, 1, 2))::int || 'h'
              else (substr(t, 1, 2))::int || 'h' || substr(t, 4, 2) end
$function$
;

CREATE OR REPLACE FUNCTION public.shop_transition_allowed(p_kind text, p_from text, p_to text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when p_kind = 'stock' then (p_from, p_to) in (('pending','ready'), ('ready','picked_up'), ('ready','pending'), ('picked_up','ready'))
    when p_kind = 'made_to_order' then (p_from, p_to) in (('pending','in_preparation'), ('in_preparation','ready'), ('in_preparation','pending'),
                                                          ('ready','picked_up'), ('ready','in_preparation'), ('picked_up','ready'))
    else false end
$function$
;

CREATE OR REPLACE FUNCTION public.shop_variant_propagate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare dS int := coalesce(new.stock, 0) - coalesce(old.stock, 0); dR int := new.reserved - old.reserved; c record; it record;
begin
  if dS = 0 and dR = 0 then return new; end if;
  for c in select vs.stock_item_id, vs.quantity from public.shop_variant_stock vs where vs.variant_id = new.id order by vs.stock_item_id loop
    select * into it from public.shop_stock_items where id = c.stock_item_id for update;
    if dR > 0 and it.stock is not null and it.stock - it.reserved < dR * c.quantity then
      raise exception 'Estoque insuficiente de % (restam % unidade(s)).', it.name, greatest(it.stock - it.reserved, 0) using errcode = 'P0001';
    end if;
    update public.shop_stock_items
       set stock = case when stock is null then null else stock + dS * c.quantity end, reserved = reserved + dR * c.quantity
     where id = c.stock_item_id;
  end loop;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.shop_variant_stock_check()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not exists (select 1 from public.shop_product_variants v join public.shop_products p on p.id = v.product_id
                  where v.id = new.variant_id and p.kind = 'stock') then
    raise exception 'Só produtos de pronta entrega usam estoque.' using errcode = 'P0001';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.shop_variant_stock_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare vid uuid := coalesce(new.variant_id, old.variant_id);
begin
  if exists (select 1 from public.shop_product_variants v where v.id = vid and v.reserved > 0) then
    raise exception 'Há pedidos em andamento com este produto. Mude os itens de estoque depois que forem retirados ou cancelados.' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $function$
;

CREATE OR REPLACE FUNCTION public.staff_function_id(p_org uuid, p_kind staff_kind)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select f.id from public.artistic_functions f
   where f.organization_id = p_org
     and lower(f.name) = case p_kind when 'professor' then 'professor' when 'monitor' then 'monitor' else 'regência' end
   limit 1
$function$
;

CREATE OR REPLACE FUNCTION public.storage_org(p_name text)
 RETURNS uuid
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_name, '/', 1)::uuid end
$function$
;

CREATE OR REPLACE FUNCTION public.structure_in_use(p_cycle uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case when public.is_org_member((select organization_id from public.cycles where id = p_cycle)) then jsonb_build_object(
    'instruments', coalesce((select jsonb_agg(ic.instrument_id) from public.instrument_cycles ic where ic.cycle_id = p_cycle and public._instrument_used(ic.instrument_id, p_cycle)), '[]'::jsonb),
    'sections', coalesce((select jsonb_agg(sc.section_id) from public.section_cycles sc where sc.cycle_id = p_cycle and public._section_used(sc.section_id, p_cycle)), '[]'::jsonb))
  else jsonb_build_object('instruments', '[]'::jsonb, 'sections', '[]'::jsonb) end
$function$
;

CREATE OR REPLACE FUNCTION public.submit_public_form(p_org_slug text, p_form_slug text, p_answers jsonb, p_consent boolean, p_hp text DEFAULT NULL::text, p_upload_token uuid DEFAULT NULL::uuid, p_files jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  f public.forms; v public.form_versions; snap jsonb; fld jsonb; k text; t text; cond jsonb; pv text; val jsonb; txt text; mx int;
  clean jsonb := '{}'::jsonb; vis boolean; empty boolean; num numeric; d date; sub_id uuid; tok public.form_upload_tokens;
  file_req text[] := '{}'; file_keys text[] := '{}'; fl jsonb; cnt int; v_email text; v_login_email text; v_login_user uuid; v_member uuid; v_existing uuid; sec_hidden boolean := false; v_section uuid; v_m public.members; v_birth text; v_dedupe text; mn numeric; mxv numeric;
begin
  if coalesce(p_hp, '') <> '' then
    return jsonb_build_object('message', 'Inscrição recebida!');
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then raise exception 'Envio inválido.' using errcode = 'P0001'; end if;
  select f2.* into f from public.forms f2 join public.organizations o on o.id = f2.organization_id and o.is_active
   where o.slug = p_org_slug and f2.slug = p_form_slug and f2.status in ('published', 'closed');
  if f.id is null then raise exception 'Formulário não encontrado.' using errcode = 'P0002'; end if;
  case public._form_state(f)
    when 'not_open' then raise exception 'As inscrições ainda não abriram.' using errcode = 'P0001';
    when 'closed' then raise exception 'As inscrições foram encerradas.' using errcode = 'P0001';
    when 'full' then raise exception 'As vagas desta inscrição foram preenchidas.' using errcode = 'P0001';
    else null;
  end case;
  if (select count(*) from public.form_submissions where form_id = f.id and submitted_at > now() - interval '1 minute') >= 30 then
    raise exception 'Muitos envios ao mesmo tempo. Tente novamente em instantes.' using errcode = 'P0001';
  end if;
  if length(p_answers::text) > 60000 then raise exception 'Envio grande demais.' using errcode = 'P0001'; end if;
  select * into v from public.form_versions where id = f.published_version_id;
  snap := v.snapshot;
  if coalesce((snap ->> 'requires_consent')::boolean, false) and not coalesce(p_consent, false) then
    raise exception 'É necessário concordar com o tratamento dos dados para enviar.' using errcode = 'P0001';
  end if;

  if f.access = 'internal' then
    v_login_user := auth.uid();
    if v_login_user is null then raise exception 'Entre com sua conta Google para enviar.' using errcode = 'P0001'; end if;
    select lower(u.email) into v_login_email from auth.users u where u.id = v_login_user;
    select * into v_m from public.members where organization_id = f.organization_id and user_id = v_login_user and archived_at is null;
    if v_m.id is null then raise exception 'Este formulário é só para integrantes do bloco.' using errcode = 'P0001'; end if;
    v_member := v_m.id;
    if exists (select 1 from public.form_submissions x where x.form_id = f.id and x.member_id = v_member and x.status = 'approved') then raise exception 'Sua inscrição já foi aprovada e não pode mais ser editada.' using errcode = 'P0001'; end if;
    select x.id into v_existing from public.form_submissions x where x.form_id = f.id and x.member_id = v_member and x.status = 'pending' order by x.submitted_at desc limit 1;
    v_section := public._viewer_section(v_member);
  end if;
  if exists (select 1 from jsonb_array_elements(snap -> 'fields') x where x ->> 'type' = 'info' and coalesce((x -> 'validation' ->> 'login')::boolean, false)) then
    v_login_user := auth.uid();
    if v_login_user is null then raise exception 'Entre com sua conta Google para enviar.' using errcode = 'P0001'; end if;
    select lower(u.email) into v_login_email from auth.users u where u.id = v_login_user;
  end if;
  for fld in select * from jsonb_array_elements(snap -> 'fields') loop
    k := fld ->> 'key'; t := fld ->> 'type';
    cond := fld -> 'condition';
    if t = 'info' then
      if coalesce((fld -> 'validation' ->> 'section')::boolean, false) then
        sec_hidden := false;
        if cond is not null and jsonb_typeof(cond) = 'object' then
          pv := case when cond ->> 'field' = '_naipe' then v_section::text else clean ->> (cond ->> 'field') end;
          sec_hidden := not coalesce(case cond ->> 'op' when 'neq' then pv is distinct from (cond ->> 'value') else pv is not distinct from (cond ->> 'value') end, false);
        end if;
      end if;
      continue;
    end if;
    vis := true;
    if cond is not null and jsonb_typeof(cond) = 'object' then
      pv := case when cond ->> 'field' = '_naipe' then v_section::text else clean ->> (cond ->> 'field') end;
      vis := coalesce(case cond ->> 'op' when 'neq' then pv is distinct from (cond ->> 'value') else pv is not distinct from (cond ->> 'value') end, false);
    end if;
    continue when not vis or sec_hidden;
    if t = 'file' then
      file_keys := file_keys || k;
      if (fld ->> 'required')::boolean then file_req := file_req || k; end if;
      continue;
    end if;
    val := p_answers -> k;
    empty := val is null or val = 'null'::jsonb or (jsonb_typeof(val) = 'string' and btrim(val #>> '{}') = '') or (jsonb_typeof(val) = 'array' and jsonb_array_length(val) = 0);
    if empty then
      if (fld ->> 'required')::boolean then
        raise exception 'Preencha o campo: %', fld ->> 'label' using errcode = 'P0001';
      end if;
      if t = 'checkbox' then clean := clean || jsonb_build_object(k, false); end if;
      continue;
    end if;
    if t in ('short_text', 'long_text') then
      if jsonb_typeof(val) <> 'string' then raise exception 'Resposta inválida em: %', fld ->> 'label' using errcode = 'P0001'; end if;
      txt := btrim(val #>> '{}');
      mx := coalesce((fld -> 'validation' ->> 'maxLength')::int, case t when 'short_text' then 255 else 5000 end);
      if length(txt) > mx then raise exception 'O campo "%" aceita até % caracteres.', fld ->> 'label', mx using errcode = 'P0001'; end if;
      clean := clean || jsonb_build_object(k, txt);
    elsif t = 'email' then
      txt := lower(btrim(val #>> '{}'));
      if txt !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(txt) > 254 then raise exception 'E-mail inválido em: %', fld ->> 'label' using errcode = 'P0001'; end if;
      clean := clean || jsonb_build_object(k, txt);
    elsif t = 'phone' then
      txt := regexp_replace(val #>> '{}', '\D', '', 'g');
      if length(txt) < 10 or length(txt) > 13 then raise exception 'Telefone inválido em: %', fld ->> 'label' using errcode = 'P0001'; end if;
      clean := clean || jsonb_build_object(k, txt);
    elsif t = 'number' then
      txt := replace(btrim(val #>> '{}'), ',', '.');
      if txt !~ '^-?\d+(\.\d+)?$' then raise exception 'Número inválido em: %', fld ->> 'label' using errcode = 'P0001'; end if;
      num := txt::numeric;
      mn := (fld -> 'validation' ->> 'min')::numeric; mxv := (fld -> 'validation' ->> 'max')::numeric;
      if (mn is not null and num < mn) or (mxv is not null and num > mxv) then raise exception 'Valor fora do permitido em: %', fld ->> 'label' using errcode = 'P0001'; end if;
      clean := clean || jsonb_build_object(k, num);
    elsif t = 'date' then
      txt := btrim(val #>> '{}');
      if txt !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Data inválida em: %', fld ->> 'label' using errcode = 'P0001'; end if;
      begin d := txt::date; exception when others then raise exception 'Data inválida em: %', fld ->> 'label' using errcode = 'P0001'; end;
      if d < date '1900-01-01' or d > current_date + 3650 then raise exception 'Data fora do permitido em: %', fld ->> 'label' using errcode = 'P0001'; end if;
      clean := clean || jsonb_build_object(k, txt);
    elsif t = 'single_select' then
      txt := val #>> '{}';
      if jsonb_typeof(val) <> 'string' or not (exists (select 1 from jsonb_array_elements(fld -> 'options') o where o ->> 'value' = txt)
           or (coalesce((fld -> 'validation' ->> 'other')::boolean, false) and txt like 'outro:%' and length(txt) <= 300)) then
        raise exception 'Opção inválida em: %', fld ->> 'label' using errcode = 'P0001';
      end if;
      clean := clean || jsonb_build_object(k, txt);
    elsif t = 'multi_select' then
      if jsonb_typeof(val) <> 'array' or exists (
           select 1 from jsonb_array_elements_text(val) x where not exists (select 1 from jsonb_array_elements(fld -> 'options') o where o ->> 'value' = x)
             and not (coalesce((fld -> 'validation' ->> 'other')::boolean, false) and x like 'outro:%' and length(x) <= 300)) then
        raise exception 'Opção inválida em: %', fld ->> 'label' using errcode = 'P0001';
      end if;
      clean := clean || jsonb_build_object(k, val);
    elsif t = 'checkbox' then
      if jsonb_typeof(val) <> 'boolean' then raise exception 'Resposta inválida em: %', fld ->> 'label' using errcode = 'P0001'; end if;
      if (fld ->> 'required')::boolean and not (val)::boolean then raise exception 'É necessário marcar: %', fld ->> 'label' using errcode = 'P0001'; end if;
      clean := clean || jsonb_build_object(k, val);
    elsif t = 'yes_no' then
      txt := val #>> '{}';
      if txt not in ('yes', 'no') then raise exception 'Responda sim ou não em: %', fld ->> 'label' using errcode = 'P0001'; end if;
      clean := clean || jsonb_build_object(k, txt);
    elsif t = 'scale' then
      txt := val #>> '{}';
      mn := coalesce((fld -> 'validation' ->> 'min')::numeric, 1); mxv := coalesce((fld -> 'validation' ->> 'max')::numeric, 5);
      if txt !~ '^\d+$' or txt::numeric < mn or txt::numeric > mxv then raise exception 'Valor fora da escala em: %', fld ->> 'label' using errcode = 'P0001'; end if;
      clean := clean || jsonb_build_object(k, txt::int);
    end if;
  end loop;

  select clean ->> (x ->> 'key') into v_birth from jsonb_array_elements(snap -> 'fields') x where x ->> 'mapping' = 'member.birth_date' limit 1;
  if v_birth is not null and v_birth::date > (current_date - interval '18 years')::date then
    raise exception 'Apenas maiores de 18 anos podem se inscrever.' using errcode = 'P0001';
  end if;
  select clean ->> (x ->> 'key') into v_email from jsonb_array_elements(snap -> 'fields') x where x ->> 'mapping' = 'member.email' limit 1;
  if v_email is null then
    select clean ->> (x ->> 'key') into v_email from jsonb_array_elements(snap -> 'fields') x where x ->> 'type' = 'email' and clean ? (x ->> 'key') limit 1;
  end if;
  if v_login_email is not null then v_email := v_login_email; end if;
  v_dedupe := case when coalesce((snap ->> 'prevent_duplicates')::boolean, false) then v_email end;

  if jsonb_array_length(coalesce(p_files, '[]'::jsonb)) > 0 or array_length(file_req, 1) > 0 then
    select * into tok from public.form_upload_tokens where token = p_upload_token and form_id = f.id and used_at is null and expires_at > now();
    if tok.token is null then
      raise exception 'Envio de arquivos expirou. Anexe novamente.' using errcode = 'P0001';
    end if;
    for fl in select * from jsonb_array_elements(coalesce(p_files, '[]'::jsonb)) loop
      if not (fl ->> 'field_key' = any (file_keys)) then raise exception 'Arquivo enviado em campo inválido.' using errcode = 'P0001'; end if;
      if (fl ->> 'path') not like f.organization_id::text || '/' || tok.token::text || '/%' then raise exception 'Arquivo inválido.' using errcode = 'P0001'; end if;
      if (fl ->> 'mime') not in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp') or coalesce((fl ->> 'size')::bigint, 0) > 5242880 then
        raise exception 'Arquivo não permitido (use PDF ou imagem de até 5 MB).' using errcode = 'P0001';
      end if;
      if not exists (select 1 from storage.objects o where o.bucket_id = 'form-uploads' and o.name = fl ->> 'path') then
        raise exception 'Arquivo não encontrado. Anexe novamente.' using errcode = 'P0001';
      end if;
    end loop;
    foreach k in array file_req loop
      select count(*) into cnt from jsonb_array_elements(coalesce(p_files, '[]'::jsonb)) x where x ->> 'field_key' = k;
      if cnt = 0 then raise exception 'Anexe o arquivo obrigatório: %', (select x ->> 'label' from jsonb_array_elements(snap -> 'fields') x where x ->> 'key' = k) using errcode = 'P0001'; end if;
    end loop;
    foreach k in array file_keys loop
      select count(*) into cnt from jsonb_array_elements(coalesce(p_files, '[]'::jsonb)) x where x ->> 'field_key' = k;
      if cnt > 3 then raise exception 'No máximo 3 arquivos por campo.' using errcode = 'P0001'; end if;
    end loop;
  end if;

  if v_existing is not null then
    update public.form_submissions set answers = clean, consent_given = coalesce(p_consent, false), form_version_id = v.id, edited_at = now() where id = v_existing returning id into sub_id;
  else
  begin
    insert into public.form_submissions (organization_id, form_id, form_version_id, answers, consent_given, applicant_email, dedupe_key, applicant_user_id, member_id)
    values (f.organization_id, f.id, v.id, clean, coalesce(p_consent, false), v_email, lower(v_dedupe), v_login_user, v_member) returning id into sub_id;
  exception when unique_violation then
    raise exception 'Já recebemos uma inscrição com este e-mail.' using errcode = 'P0001';
  end;
  end if;
  if tok.token is not null then
    insert into public.form_submission_files (organization_id, submission_id, field_key, storage_path, file_name, mime_type, size_bytes)
    select f.organization_id, sub_id, x ->> 'field_key', x ->> 'path', coalesce(left(x ->> 'name', 200), 'arquivo'), x ->> 'mime', (x ->> 'size')::bigint
    from jsonb_array_elements(coalesce(p_files, '[]'::jsonb)) x;
    update public.form_upload_tokens set used_at = now() where token = tok.token;
  end if;
  return jsonb_build_object('message', snap ->> 'confirmation_message');
end $function$
;

CREATE OR REPLACE FUNCTION public.sync_member_current_cycle(p_member uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid; v_cycle uuid;
begin
  select organization_id into v_org from public.members where id = p_member;
  if v_org is null then return; end if;
  select id into v_cycle from public.cycles where organization_id = v_org and is_current and is_active limit 1;
  if v_cycle is null then return; end if;
  if not exists (select 1 from public.member_cycles where member_id = p_member and cycle_id = v_cycle) then return; end if;

  delete from public.cycle_participations where member_id = p_member and cycle_id = v_cycle;
  insert into public.cycle_participations (organization_id, member_id, cycle_id, instrument_id, function_id, skill_level_id, is_student, is_paid, is_primary, source_link_id)
  select l.organization_id, l.member_id, v_cycle, l.instrument_id, l.function_id, l.skill_level_id, l.is_student, l.is_paid, l.is_primary, l.id
    from public.member_artistic_links l where l.member_id = p_member and l.ended_at is null;
end $function$
;

CREATE OR REPLACE FUNCTION public.sync_staff_compensation(p_member uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update public.staff_assignments sa
     set compensation = case when exists (
           select 1 from public.member_artistic_links l
            where l.member_id = sa.member_id and l.function_id = public.staff_function_id(sa.organization_id, sa.staff_kind)
              and l.ended_at is null and l.is_paid
              and exists (select 1 from public.cycles c where c.id = sa.cycle_id and c.is_current)
         ) or exists (
           select 1 from public.cycle_participations p
            where p.member_id = sa.member_id and p.cycle_id = sa.cycle_id and p.function_id = public.staff_function_id(sa.organization_id, sa.staff_kind)
              and p.is_paid
         ) then 'paid' else 'collaborative' end
   where sa.member_id = p_member and sa.valid_to is null and sa.staff_kind <> 'regente';
end $function$
;

CREATE OR REPLACE FUNCTION public.todays_birthdays(p_org uuid, p_date date)
 RETURNS TABLE(member_id uuid, name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select m.id, coalesce(nullif(trim(m.display_name), ''), split_part(trim(m.full_name), ' ', 1))
    from public.members m
   where public.is_org_member(p_org)
     and m.organization_id = p_org and m.archived_at is null and m.birth_date is not null
     and (
       (extract(month from m.birth_date) = extract(month from p_date) and extract(day from m.birth_date) = extract(day from p_date))
       or (extract(month from m.birth_date) = 2 and extract(day from m.birth_date) = 29
           and extract(month from p_date) = 2 and extract(day from p_date) = 28
           and not ((extract(year from p_date)::int % 4 = 0 and extract(year from p_date)::int % 100 <> 0) or extract(year from p_date)::int % 400 = 0))
     )
     and exists (
       select 1 from public.member_cycles mc
         join public.member_cycle_statuses s on s.id = mc.status_id and s.counts_as_active
         join public.cycles c on c.id = mc.cycle_id and c.is_current
        where mc.member_id = m.id and mc.organization_id = p_org)
   order by 2
$function$
;

CREATE OR REPLACE FUNCTION public.transfer_titular(p_org uuid, p_to_member uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_role uuid; v_from uuid;
begin
  if not public.caller_is_titular(p_org) then raise exception 'Somente o titular do bloco pode transferir a titularidade.' using errcode = '42501'; end if;
  select id into v_role from public.access_roles where organization_id = p_org and key = 'titular';
  if not exists (select 1 from public.members where id = p_to_member and organization_id = p_org and archived_at is null and user_id is not null) then
    raise exception 'A nova pessoa precisa estar cadastrada e ter conta de acesso vinculada.' using errcode = 'P0001';
  end if;
  select m.id into v_from from public.members m where m.organization_id = p_org and m.user_id = auth.uid() and m.archived_at is null;
  if v_from = p_to_member then raise exception 'Escolha outra pessoa.' using errcode = 'P0001'; end if;
  insert into public.member_access_roles (organization_id, member_id, access_role_id, granted_by) values (p_org, p_to_member, v_role, auth.uid());
  update public.member_access_roles set revoked_at = now() where member_id = v_from and access_role_id = v_role and revoked_at is null;
  insert into public.audit_logs (organization_id, actor_user_id, actor_member_id, action, entity_type, entity_id, new_data)
  values (p_org, auth.uid(), v_from, 'titular_transferred', 'member_access_roles', p_to_member::text, jsonb_build_object('to', p_to_member));
end $function$
;

CREATE OR REPLACE FUNCTION public.trash_activity(p_activity uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.activities;
begin
  select * into a from public.activities where id = p_activity;
  if a.id is null or not public.has_permission(a.organization_id, 'events.manage') then
    raise exception 'Sem permissão para apagar este evento.' using errcode = '42501';
  end if;
  if exists (select 1 from public.event_attendance ea where ea.activity_id = a.id) then
    raise exception 'Este evento tem presença registrada: use Cancelar para manter o histórico.' using errcode = 'P0001';
  end if;
  update public.activities set deleted_at = now() where id = a.id;
end $function$
;

CREATE OR REPLACE FUNCTION public.trg_ensure_titular()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.key = 'direcao' then perform public.ensure_titular_role(new.organization_id); end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.trg_form_submission_ip_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_ip text; v_hash text;
begin
  v_ip := public.request_ip();
  if v_ip is null then return new; end if;
  v_hash := encode(sha256(convert_to(new.form_id::text || '|' || v_ip, 'UTF8')), 'hex'); -- não guarda o IP em si
  delete from public.form_submit_attempts where at < now() - interval '1 day';
  if (select count(*) from public.form_submit_attempts where form_id = new.form_id and ip_hash = v_hash and at > now() - interval '1 hour') >= 10 then
    raise exception 'Muitos envios a partir desta conexão. Tente novamente mais tarde.' using errcode = 'P0001';
  end if;
  insert into public.form_submit_attempts (form_id, ip_hash) values (new.form_id, v_hash);
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.trg_sync_bloco_contacts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d text := regexp_replace(coalesce(new.phone, ''), '[^0-9]', '', 'g');
begin
  if not exists (select 1 from public.member_access_roles mar join public.access_roles ar on ar.id = mar.access_role_id
                  where mar.member_id = new.id and ar.key = 'titular' and mar.revoked_at is null) then return new; end if;
  update public.shop_settings set
    contact_whatsapp = case when d = '' then contact_whatsapp when d like '55%' and length(d) >= 12 then d else '55' || d end,
    contact_email = coalesce(nullif(lower(btrim(coalesce(new.email, ''))), ''), contact_email)
   where organization_id = new.organization_id;
  update public.site_settings set links = public.bloco_links(new.phone, new.email, new.social_handle, links) where organization_id = new.organization_id;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.trg_sync_member_current_cycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.sync_member_current_cycle(coalesce(new.member_id, old.member_id));
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.update_checklist_item(p_item uuid, p_status text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_assignee uuid DEFAULT NULL::uuid, p_set_assignee boolean DEFAULT false, p_title text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare i public.activity_checklist_items; v_manage boolean; v_mine boolean;
begin
  select * into i from public.activity_checklist_items where id = p_item and is_active;
  if i.id is null then raise exception 'Item não encontrado.' using errcode = 'P0002'; end if;
  v_manage := public.has_permission(i.organization_id, 'events.manage');
  v_mine := i.assignee_member_id is not null and public.is_self(i.assignee_member_id);
  if not (v_manage or v_mine) then raise exception 'Você não pode alterar este item.' using errcode = '42501'; end if;
  if not v_manage and (p_set_assignee or p_title is not null) then
    raise exception 'Só a Direção altera responsável e título.' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('todo', 'doing', 'done') then raise exception 'Status inválido.' using errcode = '22023'; end if;
  if p_set_assignee and p_assignee is not null and not exists (select 1 from public.members where id = p_assignee and organization_id = i.organization_id) then
    raise exception 'Responsável inválido.' using errcode = 'P0002';
  end if;
  update public.activity_checklist_items set
    status = coalesce(p_status, status),
    notes = case when p_notes is not null then nullif(trim(p_notes), '') else notes end,
    assignee_member_id = case when p_set_assignee then p_assignee else assignee_member_id end,
    title = coalesce(nullif(trim(p_title), ''), title)
  where id = p_item;
end $function$
;

CREATE OR REPLACE FUNCTION public.update_my_profile(p_member uuid, p_patch jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (public.is_self(p_member) or public.has_permission((select m.organization_id from public.members m where m.id = p_member), 'members.manage')) then
    raise exception 'Você só pode editar o seu próprio cadastro.' using errcode = '42501';
  end if;
  update public.members set
    full_name           = case when p_patch ? 'full_name'           then coalesce(nullif(trim(p_patch ->> 'full_name'), ''), full_name) else full_name end,
    display_name        = case when p_patch ? 'display_name'        then nullif(trim(p_patch ->> 'display_name'), '') else display_name end,
    email               = case when p_patch ? 'email'               then nullif(lower(trim(p_patch ->> 'email')), '') else email end,
    birth_date          = case when p_patch ? 'birth_date'          then nullif(p_patch ->> 'birth_date', '')::date else birth_date end,
    phone               = case when p_patch ? 'phone'               then nullif(trim(p_patch ->> 'phone'), '') else phone end,
    social_handle       = case when p_patch ? 'social_handle'       then nullif(trim(p_patch ->> 'social_handle'), '') else social_handle end,
    affective_relation  = case when p_patch ? 'affective_relation'  then nullif(trim(p_patch ->> 'affective_relation'), '') else affective_relation end,
    played_other_blocks = case when p_patch ? 'played_other_blocks' then (p_patch ->> 'played_other_blocks')::boolean else played_other_blocks end,
    other_blocks        = case when p_patch ? 'other_blocks'        then nullif(trim(p_patch ->> 'other_blocks'), '') else other_blocks end,
    played_instrument   = case when p_patch ? 'played_instrument'   then nullif(trim(p_patch ->> 'played_instrument'), '') else played_instrument end
  where id = p_member;
end $function$
;


-- ============ Chaves primárias ============
alter table only public.access_roles add constraint access_roles_pkey PRIMARY KEY (id);
alter table only public.activities add constraint activities_pkey PRIMARY KEY (id);
alter table only public.activity_audiences add constraint activity_audiences_pkey PRIMARY KEY (id);
alter table only public.activity_checklist_items add constraint activity_checklist_items_pkey PRIMARY KEY (id);
alter table only public.activity_item_cancellations add constraint activity_item_cancellations_pkey PRIMARY KEY (id);
alter table only public.activity_type_links add constraint activity_type_links_pkey PRIMARY KEY (activity_id, activity_type_id);
alter table only public.activity_types add constraint activity_types_pkey PRIMARY KEY (id);
alter table only public.artistic_functions add constraint artistic_functions_pkey PRIMARY KEY (id);
alter table only public.attendance_statuses add constraint attendance_statuses_pkey PRIMARY KEY (id);
alter table only public.audit_logs add constraint audit_logs_pkey PRIMARY KEY (id);
alter table only public.backups add constraint backups_pkey PRIMARY KEY (id);
alter table only public.charge_adjustments add constraint charge_adjustments_pkey PRIMARY KEY (id);
alter table only public.checklist_template_items add constraint checklist_template_items_pkey PRIMARY KEY (id);
alter table only public.checklist_templates add constraint checklist_templates_pkey PRIMARY KEY (id);
alter table only public.consent_records add constraint consent_records_pkey PRIMARY KEY (id);
alter table only public.cycle_extra_categories add constraint cycle_extra_categories_pkey PRIMARY KEY (id);
alter table only public.cycle_fee_assignments add constraint cycle_fee_assignments_pkey PRIMARY KEY (id);
alter table only public.cycle_participations add constraint cycle_participations_pkey PRIMARY KEY (id);
alter table only public.cycle_scholarships add constraint cycle_scholarships_pkey PRIMARY KEY (id);
alter table only public.cycle_types add constraint cycle_types_pkey PRIMARY KEY (id);
alter table only public.cycles add constraint cycles_pkey PRIMARY KEY (id);
alter table only public.distribution_destinations add constraint distribution_destinations_pkey PRIMARY KEY (id);
alter table only public.drive_folder_access add constraint drive_folder_access_pkey PRIMARY KEY (id);
alter table only public.drive_folder_shares add constraint drive_folder_shares_pkey PRIMARY KEY (id);
alter table only public.drive_folders add constraint drive_folders_pkey PRIMARY KEY (id);
alter table only public.email_requests add constraint email_requests_pkey PRIMARY KEY (id);
alter table only public.event_attendance add constraint event_attendance_pkey PRIMARY KEY (activity_id, member_id);
alter table only public.fee_categories add constraint fee_categories_pkey PRIMARY KEY (id);
alter table only public.fee_cycle_exempt add constraint fee_cycle_exempt_pkey PRIMARY KEY (function_id, cycle_id);
alter table only public.fee_cycle_prices add constraint fee_cycle_prices_pkey PRIMARY KEY (fee_category_id, cycle_id);
alter table only public.finance_categories add constraint finance_categories_pkey PRIMARY KEY (id);
alter table only public.financial_entries add constraint financial_entries_pkey PRIMARY KEY (id);
alter table only public.form_email_outbox add constraint form_email_outbox_pkey PRIMARY KEY (id);
alter table only public.form_fields add constraint form_fields_pkey PRIMARY KEY (id);
alter table only public.form_list_items add constraint form_list_items_pkey PRIMARY KEY (id);
alter table only public.form_lists add constraint form_lists_pkey PRIMARY KEY (id);
alter table only public.form_section_templates add constraint form_section_templates_pkey PRIMARY KEY (id);
alter table only public.form_send_defaults add constraint form_send_defaults_pkey PRIMARY KEY (organization_id);
alter table only public.form_submission_files add constraint form_submission_files_pkey PRIMARY KEY (id);
alter table only public.form_submissions add constraint form_submissions_pkey PRIMARY KEY (id);
alter table only public.form_submit_attempts add constraint form_submit_attempts_pkey PRIMARY KEY (id);
alter table only public.form_upload_tokens add constraint form_upload_tokens_pkey PRIMARY KEY (token);
alter table only public.form_versions add constraint form_versions_pkey PRIMARY KEY (id);
alter table only public.forms add constraint forms_pkey PRIMARY KEY (id);
alter table only public.gender_options add constraint gender_options_pkey PRIMARY KEY (id);
alter table only public.holidays add constraint holidays_pkey PRIMARY KEY (organization_id, day);
alter table only public.infinitepay_transactions add constraint infinitepay_transactions_pkey PRIMARY KEY (transaction_nsu);
alter table only public.instrument_cycle_capacity add constraint instrument_cycle_capacity_pkey PRIMARY KEY (instrument_id, cycle_id);
alter table only public.instrument_cycle_workshop add constraint instrument_cycle_workshop_pkey PRIMARY KEY (instrument_id, cycle_id);
alter table only public.instrument_cycles add constraint instrument_cycles_pkey PRIMARY KEY (instrument_id, cycle_id);
alter table only public.instruments add constraint instruments_pkey PRIMARY KEY (id);
alter table only public.integrations add constraint integrations_pkey PRIMARY KEY (id);
alter table only public.member_access_roles add constraint member_access_roles_pkey PRIMARY KEY (id);
alter table only public.member_artistic_links add constraint member_artistic_links_pkey PRIMARY KEY (id);
alter table only public.member_cycle_status_history add constraint member_cycle_status_history_pkey PRIMARY KEY (id);
alter table only public.member_cycle_statuses add constraint member_cycle_statuses_pkey PRIMARY KEY (id);
alter table only public.member_cycles add constraint member_cycles_pkey PRIMARY KEY (id);
alter table only public.member_emails add constraint member_emails_pkey PRIMARY KEY (id);
alter table only public.member_form_answers add constraint member_form_answers_pkey PRIMARY KEY (id);
alter table only public.member_invites add constraint member_invites_pkey PRIMARY KEY (id);
alter table only public.member_pix_keys add constraint member_pix_keys_pkey PRIMARY KEY (id);
alter table only public.member_sensitive_data add constraint member_sensitive_data_pkey PRIMARY KEY (member_id);
alter table only public.members add constraint members_pkey PRIMARY KEY (id);
alter table only public.monthly_charges add constraint monthly_charges_pkey PRIMARY KEY (id);
alter table only public.org_settings add constraint org_settings_pkey PRIMARY KEY (organization_id, key);
alter table only public.organizations add constraint organizations_pkey PRIMARY KEY (id);
alter table only public.page_releases add constraint page_releases_pkey PRIMARY KEY (organization_id, page_key, category);
alter table only public.participation_requests add constraint participation_requests_pkey PRIMARY KEY (id);
alter table only public.permissions add constraint permissions_pkey PRIMARY KEY (key);
alter table only public.race_options add constraint race_options_pkey PRIMARY KEY (id);
alter table only public.reactivation_requests add constraint reactivation_requests_pkey PRIMARY KEY (id);
alter table only public.recurrence_rules add constraint recurrence_rules_pkey PRIMARY KEY (id);
alter table only public.recurrence_skips add constraint recurrence_skips_pkey PRIMARY KEY (rule_id, activity_date);
alter table only public.repertoires add constraint repertoires_pkey PRIMARY KEY (id);
alter table only public.role_permissions add constraint role_permissions_pkey PRIMARY KEY (access_role_id, permission_key);
alter table only public.scholarship_types add constraint scholarship_types_pkey PRIMARY KEY (id);
alter table only public.section_cycles add constraint section_cycles_pkey PRIMARY KEY (section_id, cycle_id);
alter table only public.section_names add constraint section_names_pkey PRIMARY KEY (id);
alter table only public.sections add constraint sections_pkey PRIMARY KEY (id);
alter table only public.shop_coupons add constraint shop_coupons_pkey PRIMARY KEY (id);
alter table only public.shop_email_outbox add constraint shop_email_outbox_pkey PRIMARY KEY (id);
alter table only public.shop_fulfillments add constraint shop_fulfillments_pkey PRIMARY KEY (id);
alter table only public.shop_lookup_attempts add constraint shop_lookup_attempts_pkey PRIMARY KEY (id);
alter table only public.shop_order_events add constraint shop_order_events_pkey PRIMARY KEY (id);
alter table only public.shop_order_items add constraint shop_order_items_pkey PRIMARY KEY (id);
alter table only public.shop_orders add constraint shop_orders_pkey PRIMARY KEY (id);
alter table only public.shop_pickup_points add constraint shop_pickup_points_pkey PRIMARY KEY (id);
alter table only public.shop_product_images add constraint shop_product_images_pkey PRIMARY KEY (id);
alter table only public.shop_product_pickups add constraint shop_product_pickups_pkey PRIMARY KEY (id);
alter table only public.shop_product_variants add constraint shop_product_variants_pkey PRIMARY KEY (id);
alter table only public.shop_products add constraint shop_products_pkey PRIMARY KEY (id);
alter table only public.shop_settings add constraint shop_settings_pkey PRIMARY KEY (organization_id);
alter table only public.shop_stock_items add constraint shop_stock_items_pkey PRIMARY KEY (id);
alter table only public.shop_variant_stock add constraint shop_variant_stock_pkey PRIMARY KEY (id);
alter table only public.site_albums add constraint site_albums_pkey PRIMARY KEY (id);
alter table only public.site_settings add constraint site_settings_pkey PRIMARY KEY (organization_id);
alter table only public.skill_levels add constraint skill_levels_pkey PRIMARY KEY (id);
alter table only public.social_networks add constraint social_networks_pkey PRIMARY KEY (id);
alter table only public.song_attachments add constraint song_attachments_pkey PRIMARY KEY (id);
alter table only public.songs add constraint songs_pkey PRIMARY KEY (id);
alter table only public.staff_assignments add constraint staff_assignments_pkey PRIMARY KEY (id);
alter table only public.staff_group_rules add constraint staff_group_rules_pkey PRIMARY KEY (id);
alter table only public.staff_pay_hours add constraint staff_pay_hours_pkey PRIMARY KEY (id);
alter table only public.staff_pay_rules add constraint staff_pay_rules_pkey PRIMARY KEY (id);
alter table only public.staff_payments add constraint staff_payments_pkey PRIMARY KEY (id);
alter table only public.storage_delete_queue add constraint storage_delete_queue_pkey PRIMARY KEY (id);
alter table only public.supplier_categories add constraint supplier_categories_pkey PRIMARY KEY (id);
alter table only public.suppliers add constraint suppliers_pkey PRIMARY KEY (id);

-- ============ Restrições únicas ============
alter table only public.access_roles add constraint access_roles_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.access_roles add constraint access_roles_organization_id_key_key UNIQUE (organization_id, key);
alter table only public.activities add constraint activities_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.activity_audiences add constraint activity_audiences_activity_id_kind_ref_id_key UNIQUE (activity_id, kind, ref_id);
alter table only public.activity_item_cancellations add constraint activity_item_cancellations_activity_id_instrument_id_key UNIQUE (activity_id, instrument_id);
alter table only public.activity_types add constraint activity_types_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.activity_types add constraint activity_types_organization_id_name_key UNIQUE (organization_id, name);
alter table only public.artistic_functions add constraint artistic_functions_org_kind_name_key UNIQUE (organization_id, kind, name);
alter table only public.artistic_functions add constraint artistic_functions_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.attendance_statuses add constraint attendance_statuses_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.attendance_statuses add constraint attendance_statuses_organization_id_key_key UNIQUE (organization_id, key);
alter table only public.checklist_template_items add constraint checklist_template_items_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.checklist_templates add constraint checklist_templates_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.checklist_templates add constraint checklist_templates_organization_id_name_key UNIQUE (organization_id, name);
alter table only public.cycle_extra_categories add constraint cycle_extra_categories_member_id_cycle_id_fee_category_id_key UNIQUE (member_id, cycle_id, fee_category_id);
alter table only public.cycle_types add constraint cycle_types_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.cycle_types add constraint cycle_types_organization_id_key_key UNIQUE (organization_id, key);
alter table only public.cycles add constraint cycles_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.cycles add constraint cycles_organization_id_name_key UNIQUE (organization_id, name);
alter table only public.distribution_destinations add constraint distribution_destinations_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.distribution_destinations add constraint distribution_destinations_organization_id_name_key UNIQUE (organization_id, name);
alter table only public.drive_folders add constraint drive_folders_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.fee_categories add constraint fee_categories_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.fee_categories add constraint fee_categories_organization_id_name_key UNIQUE (organization_id, name);
alter table only public.finance_categories add constraint finance_categories_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.finance_categories add constraint finance_categories_organization_id_kind_name_key UNIQUE (organization_id, kind, name);
alter table only public.financial_entries add constraint financial_entries_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.form_email_outbox add constraint form_email_outbox_submission_id_template_key UNIQUE (submission_id, template);
alter table only public.form_fields add constraint form_fields_form_id_field_key_key UNIQUE (form_id, field_key);
alter table only public.form_fields add constraint form_fields_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.form_lists add constraint form_lists_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.form_lists add constraint form_lists_organization_id_source_key UNIQUE (organization_id, source);
alter table only public.form_section_templates add constraint form_section_templates_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.form_section_templates add constraint form_section_templates_organization_id_name_key UNIQUE (organization_id, name);
alter table only public.form_submissions add constraint form_submissions_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.form_versions add constraint form_versions_form_id_version_key UNIQUE (form_id, version);
alter table only public.form_versions add constraint form_versions_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.forms add constraint forms_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.forms add constraint forms_organization_id_slug_key UNIQUE (organization_id, slug);
alter table only public.gender_options add constraint gender_options_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.gender_options add constraint gender_options_organization_id_name_key UNIQUE (organization_id, name);
alter table only public.instruments add constraint instruments_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.instruments add constraint instruments_organization_id_name_key UNIQUE (organization_id, name);
alter table only public.integrations add constraint integrations_organization_id_provider_key UNIQUE (organization_id, provider);
alter table only public.member_cycle_statuses add constraint member_cycle_statuses_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.member_cycle_statuses add constraint member_cycle_statuses_organization_id_key_key UNIQUE (organization_id, key);
alter table only public.member_cycles add constraint member_cycles_member_id_cycle_id_key UNIQUE (member_id, cycle_id);
alter table only public.member_cycles add constraint member_cycles_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.member_emails add constraint member_emails_organization_id_email_key UNIQUE (organization_id, email);
alter table only public.member_form_answers add constraint member_form_answers_member_id_source_key UNIQUE (member_id, source);
alter table only public.member_invites add constraint member_invites_token_hash_key UNIQUE (token_hash);
alter table only public.members add constraint members_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.members add constraint members_organization_id_user_id_key UNIQUE (organization_id, user_id);
alter table only public.monthly_charges add constraint monthly_charges_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.monthly_charges add constraint monthly_charges_organization_id_member_id_competence_key UNIQUE (organization_id, member_id, competence);
alter table only public.monthly_charges add constraint monthly_charges_pay_code_key UNIQUE (pay_code);
alter table only public.organizations add constraint organizations_slug_key UNIQUE (slug);
alter table only public.race_options add constraint race_options_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.race_options add constraint race_options_organization_id_name_key UNIQUE (organization_id, name);
alter table only public.reactivation_requests add constraint reactivation_requests_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.recurrence_rules add constraint recurrence_rules_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.repertoires add constraint repertoires_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.scholarship_types add constraint scholarship_types_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.scholarship_types add constraint scholarship_types_organization_id_name_key UNIQUE (organization_id, name);
alter table only public.section_names add constraint section_names_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.sections add constraint sections_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.sections add constraint sections_organization_id_name_key UNIQUE (organization_id, name);
alter table only public.shop_coupons add constraint shop_coupons_organization_id_code_key UNIQUE (organization_id, code);
alter table only public.shop_email_outbox add constraint shop_email_outbox_event_id_template_key UNIQUE (event_id, template);
alter table only public.shop_fulfillments add constraint shop_fulfillments_order_id_kind_key UNIQUE (order_id, kind);
alter table only public.shop_fulfillments add constraint shop_fulfillments_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.shop_orders add constraint shop_orders_organization_id_code_key UNIQUE (organization_id, code);
alter table only public.shop_orders add constraint shop_orders_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.shop_pickup_points add constraint shop_pickup_points_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.shop_product_pickups add constraint shop_product_pickups_product_id_pickup_point_id_key UNIQUE (product_id, pickup_point_id);
alter table only public.shop_product_variants add constraint shop_product_variants_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.shop_product_variants add constraint shop_product_variants_product_id_label_key UNIQUE (product_id, label);
alter table only public.shop_products add constraint shop_products_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.shop_products add constraint shop_products_organization_id_slug_key UNIQUE (organization_id, slug);
alter table only public.shop_stock_items add constraint shop_stock_items_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.shop_variant_stock add constraint shop_variant_stock_variant_id_stock_item_id_key UNIQUE (variant_id, stock_item_id);
alter table only public.site_albums add constraint site_albums_organization_id_url_key UNIQUE (organization_id, url);
alter table only public.skill_levels add constraint skill_levels_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.social_networks add constraint social_networks_organization_id_key_key UNIQUE (organization_id, key);
alter table only public.songs add constraint songs_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.staff_group_rules add constraint staff_group_rules_cycle_id_group_key_key UNIQUE (cycle_id, group_key);
alter table only public.staff_pay_hours add constraint staff_pay_hours_rule_id_competence_key UNIQUE (rule_id, competence);
alter table only public.staff_payments add constraint staff_payments_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.supplier_categories add constraint supplier_categories_organization_id_id_key UNIQUE (organization_id, id);
alter table only public.supplier_categories add constraint supplier_categories_organization_id_name_key UNIQUE (organization_id, name);
alter table only public.suppliers add constraint suppliers_organization_id_id_key UNIQUE (organization_id, id);

-- ============ Restrições de verificação (check) ============
alter table only public.activities add constraint activities_check CHECK (((end_time IS NULL) OR (start_time IS NULL) OR (end_time > start_time)));
alter table only public.activities add constraint activities_itinerary_check CHECK (((itinerary IS NULL) OR ((jsonb_typeof(itinerary) = 'array'::text) AND (jsonb_array_length(itinerary) <= 30))));
alter table only public.activities add constraint activities_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'done'::text, 'cancelled'::text])));
alter table only public.activities add constraint activities_to_confirm_note_check CHECK (((to_confirm_note IS NULL) OR (length(to_confirm_note) <= 200)));
alter table only public.activities add constraint activities_visibility_check CHECK ((visibility = ANY (ARRAY['members'::text, 'staff'::text])));
alter table only public.activity_audiences add constraint activity_audiences_kind_check CHECK ((kind = ANY (ARRAY['section'::text, 'instrument'::text, 'member'::text, 'category'::text])));
alter table only public.activity_checklist_items add constraint activity_checklist_items_status_check CHECK ((status = ANY (ARRAY['todo'::text, 'doing'::text, 'done'::text])));
alter table only public.activity_checklist_items add constraint activity_checklist_items_title_check CHECK ((length(TRIM(BOTH FROM title)) > 0));
alter table only public.activity_types add constraint activity_types_color_check CHECK ((color = ANY (ARRAY['primary'::text, 'secondary'::text, 'info'::text, 'success'::text, 'warning'::text, 'muted'::text])));
alter table only public.artistic_functions add constraint artistic_functions_kind_check CHECK ((kind = ANY (ARRAY['paid'::text, 'collab'::text, 'payer'::text])));
alter table only public.backups add constraint backups_kind_check CHECK ((kind = ANY (ARRAY['manual'::text, 'auto'::text, 'imported'::text])));
alter table only public.backups add constraint backups_label_check CHECK ((length(TRIM(BOTH FROM label)) > 0));
alter table only public.charge_adjustments add constraint charge_adjustments_reason_check CHECK ((length(TRIM(BOTH FROM reason)) > 0));
alter table only public.checklist_template_items add constraint checklist_template_items_title_check CHECK ((length(TRIM(BOTH FROM title)) > 0));
alter table only public.checklist_templates add constraint checklist_templates_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0));
alter table only public.cycle_participations add constraint cycle_participations_check CHECK (((instrument_id IS NOT NULL) OR (function_id IS NOT NULL)));
alter table only public.cycle_scholarships add constraint cycle_scholarships_percent_check CHECK (((percent >= (0)::numeric) AND (percent <= (100)::numeric)));
alter table only public.cycles add constraint cycles_check CHECK ((ends_on >= starts_on));
alter table only public.distribution_destinations add constraint distribution_destinations_kind_check CHECK ((kind = ANY (ARRAY['role_group'::text, 'cash'::text, 'custom'::text])));
alter table only public.drive_folder_access add constraint drive_folder_access_check CHECK ((((((access_role_id IS NOT NULL))::integer + ((section_id IS NOT NULL))::integer) + ((instrument_id IS NOT NULL))::integer) = 1));
alter table only public.drive_folder_shares add constraint drive_folder_shares_email_check CHECK ((email = lower(email)));
alter table only public.drive_folders add constraint drive_folders_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0));
alter table only public.drive_folders add constraint drive_folders_url_check CHECK ((url ~* '^https://(drive|docs)\.google\.com/'::text));
alter table only public.email_requests add constraint email_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
alter table only public.fee_categories add constraint fee_categories_base_key_check CHECK (((base_key IS NULL) OR (base_key = ANY (ARRAY['aluno'::text, 'senior'::text, 'musico'::text, 'isento'::text]))));
alter table only public.fee_cycle_prices add constraint fee_cycle_prices_amount_check CHECK ((amount >= (0)::numeric));
alter table only public.finance_categories add constraint finance_categories_kind_check CHECK ((kind = ANY (ARRAY['income'::text, 'expense'::text])));
alter table only public.financial_entries add constraint financial_entries_amount_check CHECK ((amount > (0)::numeric));
alter table only public.financial_entries add constraint financial_entries_description_check CHECK ((length(TRIM(BOTH FROM description)) > 0));
alter table only public.financial_entries add constraint financial_entries_kind_check CHECK ((kind = ANY (ARRAY['income'::text, 'expense'::text])));
alter table only public.financial_entries add constraint financial_entries_status_check CHECK ((status = ANY (ARRAY['posted'::text, 'cancelled'::text])));
alter table only public.form_email_outbox add constraint form_email_outbox_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text])));
alter table only public.form_email_outbox add constraint form_email_outbox_template_check CHECK ((template = ANY (ARRAY['submission_approved'::text, 'submission_rejected'::text, 'submission_waitlist'::text])));
alter table only public.form_fields add constraint form_fields_field_key_check CHECK ((field_key ~ '^[a-z][a-z0-9_]{0,40}$'::text));
alter table only public.form_fields add constraint form_fields_field_type_check CHECK ((field_type = ANY (ARRAY['short_text'::text, 'long_text'::text, 'email'::text, 'phone'::text, 'number'::text, 'date'::text, 'single_select'::text, 'multi_select'::text, 'checkbox'::text, 'yes_no'::text, 'scale'::text, 'file'::text, 'info'::text])));
alter table only public.form_fields add constraint form_fields_label_check CHECK ((length(TRIM(BOTH FROM label)) > 0));
alter table only public.form_fields add constraint form_fields_member_mapping_check CHECK ((member_mapping = ANY (ARRAY['member.full_name'::text, 'member.display_name'::text, 'member.email'::text, 'member.phone'::text, 'member.social_handle'::text, 'member.birth_date'::text, 'member.affective_relation'::text, 'member.played_other_blocks'::text, 'member.other_blocks'::text, 'sensitive.gender'::text, 'sensitive.is_trans'::text, 'sensitive.race_color'::text, 'sensitive.is_pcd'::text, 'sensitive.pcd_description'::text, 'link.instrument'::text, 'link.function'::text, 'link.skill_level'::text, 'member.custom'::text])));
alter table only public.form_lists add constraint form_lists_kind_check CHECK ((kind = ANY (ARRAY['system'::text, 'custom'::text])));
alter table only public.form_lists add constraint form_lists_link_check CHECK ((link = 'skill_level'::text));
alter table only public.form_section_templates add constraint form_section_templates_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0));
alter table only public.form_submission_files add constraint form_submission_files_check CHECK ((storage_path ~~ ((organization_id)::text || '/%'::text)));
alter table only public.form_submissions add constraint form_submissions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'archived'::text])));
alter table only public.forms add constraint forms_access_check CHECK ((access = ANY (ARRAY['public'::text, 'internal'::text])));
alter table only public.forms add constraint forms_check CHECK (((opens_at IS NULL) OR (closes_at IS NULL) OR (closes_at > opens_at)));
alter table only public.forms add constraint forms_check1 CHECK (((status <> 'published'::text) OR (published_version_id IS NOT NULL)));
alter table only public.forms add constraint forms_header_color_check CHECK (((header_color IS NULL) OR (header_color ~ '^#[0-9a-fA-F]{6}$'::text)));
alter table only public.forms add constraint forms_header_height_check CHECK (((header_height >= 64) AND (header_height <= 320)));
alter table only public.forms add constraint forms_header_logo_size_check CHECK (((header_logo_size >= 32) AND (header_logo_size <= 200)));
alter table only public.forms add constraint forms_header_pos_x_check CHECK (((header_pos_x >= (0)::numeric) AND (header_pos_x <= (100)::numeric)));
alter table only public.forms add constraint forms_header_pos_y_check CHECK (((header_pos_y >= (0)::numeric) AND (header_pos_y <= (100)::numeric)));
alter table only public.forms add constraint forms_header_zoom_check CHECK (((header_zoom >= (1)::numeric) AND (header_zoom <= (4)::numeric)));
alter table only public.forms add constraint forms_kind_check CHECK ((kind = ANY (ARRAY['enrollment'::text, 'general'::text])));
alter table only public.forms add constraint forms_max_responses_check CHECK (((max_responses IS NULL) OR (max_responses > 0)));
alter table only public.forms add constraint forms_slug_check CHECK ((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text));
alter table only public.forms add constraint forms_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'closed'::text, 'archived'::text])));
alter table only public.forms add constraint forms_title_check CHECK ((length(TRIM(BOTH FROM title)) > 0));
alter table only public.holidays add constraint holidays_scope_check CHECK ((scope = ANY (ARRAY['national'::text, 'state'::text, 'city'::text])));
alter table only public.infinitepay_transactions add constraint infinitepay_transactions_kind_check CHECK ((kind = ANY (ARRAY['shop'::text, 'charge'::text])));
alter table only public.instrument_cycle_capacity add constraint instrument_cycle_capacity_capacity_check CHECK ((capacity >= 0));
alter table only public.instruments add constraint instruments_tuning_check CHECK (((tuning IS NULL) OR ((length(TRIM(BOTH FROM tuning)) >= 1) AND (length(TRIM(BOTH FROM tuning)) <= 8))));
alter table only public.member_artistic_links add constraint member_artistic_links_check CHECK (((instrument_id IS NOT NULL) OR (function_id IS NOT NULL)));
alter table only public.member_cycle_statuses add constraint member_cycle_statuses_check CHECK ((NOT (counts_as_active AND is_waitlist)));
alter table only public.member_emails add constraint member_emails_email_check CHECK (((email = lower(email)) AND (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text)));
alter table only public.member_pix_keys add constraint member_pix_keys_check CHECK ((((key_type = 'cpf'::text) AND (key_value ~ '^\d{11}$'::text)) OR ((key_type = 'cnpj'::text) AND (key_value ~ '^\d{14}$'::text)) OR ((key_type = 'telefone'::text) AND (key_value ~ '^\+?\d{10,13}$'::text)) OR ((key_type = 'email'::text) AND (key_value ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text)) OR ((key_type = 'aleatoria'::text) AND (key_value ~ '^[0-9a-fA-F-]{32,36}$'::text))));
alter table only public.member_pix_keys add constraint member_pix_keys_key_type_check CHECK ((key_type = ANY (ARRAY['cpf'::text, 'cnpj'::text, 'email'::text, 'telefone'::text, 'aleatoria'::text])));
alter table only public.member_sensitive_data add constraint member_sensitive_data_check CHECK (((is_pcd IS DISTINCT FROM false) OR (pcd_description IS NULL)));
alter table only public.members add constraint members_full_name_check CHECK ((length(TRIM(BOTH FROM full_name)) > 0));
alter table only public.monthly_charges add constraint monthly_charges_base_amount_check CHECK ((base_amount >= (0)::numeric));
alter table only public.monthly_charges add constraint monthly_charges_competence_check CHECK ((EXTRACT(day FROM competence) = (1)::numeric));
alter table only public.monthly_charges add constraint monthly_charges_final_amount_check CHECK ((final_amount >= (0)::numeric));
alter table only public.monthly_charges add constraint monthly_charges_pay_code_check CHECK (((pay_code IS NULL) OR (pay_code ~ '^[A-Z0-9]{10}$'::text)));
alter table only public.monthly_charges add constraint monthly_charges_scholarship_discount_check CHECK ((scholarship_discount >= (0)::numeric));
alter table only public.monthly_charges add constraint monthly_charges_scholarship_percent_check CHECK (((scholarship_percent >= (0)::numeric) AND (scholarship_percent <= (100)::numeric)));
alter table only public.monthly_charges add constraint monthly_charges_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'exempt'::text, 'cancelled'::text])));
alter table only public.organizations add constraint organizations_logo_path_check CHECK (((logo_path IS NULL) OR (logo_path ~* '^(https://|/)'::text)));
alter table only public.organizations add constraint organizations_slug_check CHECK ((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text));
alter table only public.page_releases add constraint page_releases_category_check CHECK ((category = ANY (ARRAY['direcao'::text, 'professor'::text, 'monitor'::text, 'ativo'::text, 'inativo'::text])));
alter table only public.page_releases add constraint page_releases_page_key_check CHECK ((page_key ~ '^[a-z0-9-]{1,40}$'::text));
alter table only public.participation_requests add constraint participation_requests_action_check CHECK ((action = ANY (ARRAY['add'::text, 'remove'::text])));
alter table only public.participation_requests add constraint participation_requests_check CHECK (((action = 'remove'::text) OR (instrument_id IS NOT NULL) OR (function_id IS NOT NULL)));
alter table only public.participation_requests add constraint participation_requests_kind_check CHECK ((kind = ANY (ARRAY['artistic'::text, 'collab'::text])));
alter table only public.participation_requests add constraint participation_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
alter table only public.reactivation_requests add constraint reactivation_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
alter table only public.recurrence_rules add constraint recurrence_rules_audiences_check CHECK (((jsonb_typeof(audiences) = 'array'::text) AND (jsonb_array_length(audiences) <= 20)));
alter table only public.recurrence_rules add constraint recurrence_rules_check CHECK (((until IS NULL) OR (until >= starts_on)));
alter table only public.recurrence_rules add constraint recurrence_rules_check1 CHECK (((end_time IS NULL) OR (start_time IS NULL) OR (end_time > start_time)));
alter table only public.recurrence_rules add constraint recurrence_rules_itinerary_check CHECK (((itinerary IS NULL) OR ((jsonb_typeof(itinerary) = 'array'::text) AND (jsonb_array_length(itinerary) <= 30))));
alter table only public.recurrence_rules add constraint recurrence_rules_visibility_check CHECK ((visibility = ANY (ARRAY['members'::text, 'staff'::text])));
alter table only public.recurrence_rules add constraint recurrence_rules_weekday_check CHECK (((weekday >= 0) AND (weekday <= 6)));
alter table only public.repertoires add constraint repertoires_color_check CHECK ((color = ANY (ARRAY['primary'::text, 'secondary'::text, 'info'::text, 'success'::text, 'warning'::text, 'muted'::text])));
alter table only public.repertoires add constraint repertoires_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0));
alter table only public.section_names add constraint section_names_item_label_len CHECK (((length(TRIM(BOTH FROM item_label)) >= 1) AND (length(TRIM(BOTH FROM item_label)) <= 30)));
alter table only public.section_names add constraint section_names_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0));
alter table only public.section_names add constraint section_names_pitch_mode_check CHECK ((pitch_mode = ANY (ARRAY['defined'::text, 'undefined'::text, 'na'::text])));
alter table only public.sections add constraint sections_item_label_len CHECK (((length(TRIM(BOTH FROM item_label)) >= 1) AND (length(TRIM(BOTH FROM item_label)) <= 30)));
alter table only public.sections add constraint sections_pitch_mode_check CHECK ((pitch_mode = ANY (ARRAY['defined'::text, 'undefined'::text, 'na'::text])));
alter table only public.shop_coupons add constraint shop_coupons_code_check CHECK ((code ~ '^[A-Z0-9_-]{3,30}$'::text));
alter table only public.shop_coupons add constraint shop_coupons_discount_pct_check CHECK (((discount_pct > (0)::numeric) AND (discount_pct <= (100)::numeric)));
alter table only public.shop_coupons add constraint shop_coupons_max_uses_check CHECK (((max_uses IS NULL) OR (max_uses > 0)));
alter table only public.shop_email_outbox add constraint shop_email_outbox_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text])));
alter table only public.shop_email_outbox add constraint shop_email_outbox_template_check CHECK ((template = ANY (ARRAY['order_created'::text, 'paid'::text, 'cancelled'::text, 'fulfillment_in_preparation'::text, 'fulfillment_ready'::text, 'fulfillment_picked_up'::text, 'production_started'::text])));
alter table only public.shop_fulfillments add constraint shop_fulfillments_check CHECK (((kind = 'made_to_order'::text) OR (status <> 'in_preparation'::text)));
alter table only public.shop_fulfillments add constraint shop_fulfillments_kind_check CHECK ((kind = ANY (ARRAY['stock'::text, 'made_to_order'::text])));
alter table only public.shop_fulfillments add constraint shop_fulfillments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'in_preparation'::text, 'ready'::text, 'picked_up'::text, 'cancelled'::text])));
alter table only public.shop_order_events add constraint shop_order_events_scope_check CHECK ((scope = ANY (ARRAY['order'::text, 'fulfillment'::text])));
alter table only public.shop_order_items add constraint shop_order_items_discount_pct_check CHECK (((discount_pct >= (0)::numeric) AND (discount_pct <= (100)::numeric)));
alter table only public.shop_order_items add constraint shop_order_items_kind_check CHECK ((kind = ANY (ARRAY['stock'::text, 'made_to_order'::text])));
alter table only public.shop_order_items add constraint shop_order_items_quantity_check CHECK ((quantity > 0));
alter table only public.shop_order_items add constraint shop_order_items_unit_final_cents_check CHECK ((unit_final_cents > 0));
alter table only public.shop_order_items add constraint shop_order_items_unit_price_cents_check CHECK ((unit_price_cents > 0));
alter table only public.shop_orders add constraint shop_orders_check CHECK ((total_cents = (subtotal_cents - discount_cents)));
alter table only public.shop_orders add constraint shop_orders_code_check CHECK ((code ~ '^[A-Z0-9]{6,12}$'::text));
alter table only public.shop_orders add constraint shop_orders_customer_email_check CHECK ((customer_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text));
alter table only public.shop_orders add constraint shop_orders_customer_name_check CHECK ((length(TRIM(BOTH FROM customer_name)) > 0));
alter table only public.shop_orders add constraint shop_orders_customer_phone_check CHECK ((customer_phone ~ '^[0-9]{10,13}$'::text));
alter table only public.shop_orders add constraint shop_orders_discount_cents_check CHECK ((discount_cents >= 0));
alter table only public.shop_orders add constraint shop_orders_paid_via_check CHECK (((paid_via IS NULL) OR (paid_via = ANY (ARRAY['manual'::text, 'webhook'::text]))));
alter table only public.shop_orders add constraint shop_orders_payment_method_check CHECK ((payment_method = ANY (ARRAY['pix'::text, 'infinitepay'::text])));
alter table only public.shop_orders add constraint shop_orders_status_check CHECK ((status = ANY (ARRAY['awaiting_payment'::text, 'paid'::text, 'cancelled'::text])));
alter table only public.shop_orders add constraint shop_orders_subtotal_cents_check CHECK ((subtotal_cents > 0));
alter table only public.shop_orders add constraint shop_orders_total_cents_check CHECK ((total_cents > 0));
alter table only public.shop_pickup_points add constraint shop_pickup_points_address_check CHECK ((length(TRIM(BOTH FROM address)) > 0));
alter table only public.shop_pickup_points add constraint shop_pickup_points_contact_name_check CHECK (((contact_name IS NULL) OR (length(contact_name) <= 80)));
alter table only public.shop_pickup_points add constraint shop_pickup_points_contact_phone_check CHECK (((contact_phone IS NULL) OR (length(contact_phone) <= 30)));
alter table only public.shop_pickup_points add constraint shop_pickup_points_kind_check CHECK ((kind = ANY (ARRAY['place'::text, 'person'::text])));
alter table only public.shop_pickup_points add constraint shop_pickup_points_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0));
alter table only public.shop_pickup_points add constraint shop_pickup_schedule_ok CHECK (shop_schedule_valid(schedule));
alter table only public.shop_product_variants add constraint shop_product_variants_check CHECK (((stock IS NULL) OR (reserved <= stock)));
alter table only public.shop_product_variants add constraint shop_product_variants_label_check CHECK ((length(TRIM(BOTH FROM label)) > 0));
alter table only public.shop_product_variants add constraint shop_product_variants_reserved_check CHECK ((reserved >= 0));
alter table only public.shop_product_variants add constraint shop_product_variants_stock_check CHECK (((stock IS NULL) OR (stock >= 0)));
alter table only public.shop_products add constraint shop_products_check CHECK (((kind = 'made_to_order'::text) OR (lead_time_days IS NULL)));
alter table only public.shop_products add constraint shop_products_check1 CHECK (((min_units IS NULL) OR (kind = 'made_to_order'::text)));
alter table only public.shop_products add constraint shop_products_check2 CHECK (((NOT is_kit) OR (kind = 'stock'::text)));
alter table only public.shop_products add constraint shop_products_kind_check CHECK ((kind = ANY (ARRAY['stock'::text, 'made_to_order'::text])));
alter table only public.shop_products add constraint shop_products_lead_time_text_check CHECK (((lead_time_days IS NULL) OR (length(TRIM(BOTH FROM lead_time_days)) > 0)));
alter table only public.shop_products add constraint shop_products_member_discount_pct_check CHECK (((member_discount_pct >= (0)::numeric) AND (member_discount_pct <= (100)::numeric)));
alter table only public.shop_products add constraint shop_products_min_units_check CHECK (((min_units IS NULL) OR (min_units > 0)));
alter table only public.shop_products add constraint shop_products_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0));
alter table only public.shop_products add constraint shop_products_price_cents_check CHECK ((price_cents > 0));
alter table only public.shop_products add constraint shop_products_show_remaining_when_check CHECK (((show_remaining_when IS NULL) OR (show_remaining_when > 0)));
alter table only public.shop_products add constraint shop_products_slug_check CHECK ((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text));
alter table only public.shop_products add constraint shop_products_special_price_cents_check CHECK (((special_price_cents IS NULL) OR (special_price_cents > 0)));
alter table only public.shop_settings add constraint shop_settings_check CHECK (((NOT ('infinitepay'::text = ANY (payment_methods))) OR ((infinitepay_handle IS NOT NULL) AND (public_site_url IS NOT NULL))));
alter table only public.shop_settings add constraint shop_settings_contact_email_check CHECK (((contact_email IS NULL) OR (contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text)));
alter table only public.shop_settings add constraint shop_settings_contact_whatsapp_check CHECK (((contact_whatsapp IS NULL) OR (contact_whatsapp ~ '^55[0-9]{10,11}$'::text)));
alter table only public.shop_settings add constraint shop_settings_credit_fees_check CHECK ((((cardinality(credit_fees_pct) >= 1) AND (cardinality(credit_fees_pct) <= 12)) AND ((0)::numeric <= ALL (credit_fees_pct)) AND ((50)::numeric > ALL (credit_fees_pct))));
alter table only public.shop_settings add constraint shop_settings_default_member_discount_pct_check CHECK (((default_member_discount_pct >= (0)::numeric) AND (default_member_discount_pct <= (100)::numeric)));
alter table only public.shop_settings add constraint shop_settings_directors_check CHECK ((jsonb_typeof(directors) = 'array'::text));
alter table only public.shop_settings add constraint shop_settings_featured_title_check CHECK (((length(btrim(featured_title)) >= 1) AND (length(btrim(featured_title)) <= 60)));
alter table only public.shop_settings add constraint shop_settings_infinitepay_handle_check CHECK (((infinitepay_handle IS NULL) OR (infinitepay_handle ~ '^[A-Za-z0-9_.-]{2,40}$'::text)));
alter table only public.shop_settings add constraint shop_settings_intro_text_check CHECK (((intro_text IS NULL) OR (length(intro_text) <= 400)));
alter table only public.shop_settings add constraint shop_settings_mail_from_email_check CHECK (((mail_from_email IS NULL) OR (mail_from_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text)));
alter table only public.shop_settings add constraint shop_settings_mail_from_name_check CHECK (((mail_from_name IS NULL) OR ((length(TRIM(BOTH FROM mail_from_name)) >= 1) AND (length(TRIM(BOTH FROM mail_from_name)) <= 80))));
alter table only public.shop_settings add constraint shop_settings_payment_methods_check CHECK (((cardinality(payment_methods) > 0) AND (payment_methods <@ ARRAY['pix'::text, 'infinitepay'::text])));
alter table only public.shop_settings add constraint shop_settings_pix_beneficiary_check CHECK (((pix_beneficiary IS NULL) OR ((length(TRIM(BOTH FROM pix_beneficiary)) >= 2) AND (length(TRIM(BOTH FROM pix_beneficiary)) <= 140))));
alter table only public.shop_settings add constraint shop_settings_pix_city_check CHECK (((pix_city IS NULL) OR ((char_length(btrim(pix_city)) >= 1) AND (char_length(btrim(pix_city)) <= 15))));
alter table only public.shop_settings add constraint shop_settings_pix_key_check CHECK (((pix_key IS NULL) OR ((length(TRIM(BOTH FROM pix_key)) >= 3) AND (length(TRIM(BOTH FROM pix_key)) <= 140))));
alter table only public.shop_settings add constraint shop_settings_privacy_retention_years_check CHECK (((privacy_retention_years >= 1) AND (privacy_retention_years <= 20)));
alter table only public.shop_settings add constraint shop_settings_public_site_url_check CHECK (((public_site_url IS NULL) OR (public_site_url ~ '^https?://[^\s/]+[^\s]*[^\s/]$'::text)));
alter table only public.shop_settings add constraint shop_settings_reservation_hours_check CHECK (((reservation_hours >= 1) AND (reservation_hours <= 720)));
alter table only public.shop_stock_items add constraint shop_stock_items_check CHECK (((stock IS NULL) OR (reserved <= stock)));
alter table only public.shop_stock_items add constraint shop_stock_items_name_check CHECK (((length(TRIM(BOTH FROM name)) > 0) AND (length(name) <= 120)));
alter table only public.shop_stock_items add constraint shop_stock_items_reserved_check CHECK ((reserved >= 0));
alter table only public.shop_stock_items add constraint shop_stock_items_stock_check CHECK (((stock IS NULL) OR (stock >= 0)));
alter table only public.shop_variant_stock add constraint shop_variant_stock_quantity_check CHECK (((quantity >= 1) AND (quantity <= 50)));
alter table only public.site_albums add constraint site_albums_authors_check CHECK (((jsonb_typeof(authors) = 'array'::text) AND (jsonb_array_length(authors) <= 10)));
alter table only public.site_albums add constraint site_albums_cover_url_check CHECK (((cover_url IS NULL) OR (cover_url ~* '^https://'::text)));
alter table only public.site_albums add constraint site_albums_url_check CHECK ((url ~ '^https://(photos\.app\.goo\.gl|photos\.google\.com)/'::text));
alter table only public.site_settings add constraint site_settings_header_color_check CHECK (((header_color IS NULL) OR (header_color ~ '^#[0-9a-fA-F]{6}$'::text)));
alter table only public.site_settings add constraint site_settings_links_check CHECK (((jsonb_typeof(links) = 'array'::text) AND (jsonb_array_length(links) <= 20)));
alter table only public.site_settings add constraint site_settings_menu_construction_check CHECK ((jsonb_typeof(menu_construction) = 'array'::text));
alter table only public.site_settings add constraint site_settings_menu_order_check CHECK (((jsonb_typeof(menu_order) = 'array'::text) AND (jsonb_array_length(menu_order) <= 5)));
alter table only public.site_settings add constraint site_settings_page_color_check CHECK (((page_color IS NULL) OR (page_color ~ '^#[0-9a-fA-F]{6}$'::text)));
alter table only public.site_settings add constraint site_settings_photo_url_check CHECK (((photo_url IS NULL) OR (photo_url ~* '^(https://|/)'::text)));
alter table only public.site_settings add constraint site_settings_rays_color_check CHECK (((rays_color IS NULL) OR (rays_color ~ '^#[0-9a-fA-F]{6}$'::text)));
alter table only public.site_settings add constraint site_settings_rays_count_check CHECK (((rays_count >= 4) AND (rays_count <= 60)));
alter table only public.site_settings add constraint site_settings_rays_opacity_check CHECK (((rays_opacity >= 5) AND (rays_opacity <= 100)));
alter table only public.site_settings add constraint site_settings_rays_outline_color_check CHECK (((rays_outline_color IS NULL) OR (rays_outline_color ~ '^#[0-9a-fA-F]{6}$'::text)));
alter table only public.site_settings add constraint site_settings_rays_rotation_check CHECK (((rays_rotation >= 0) AND (rays_rotation <= 360)));
alter table only public.site_settings add constraint site_settings_rays_speed_check CHECK (((rays_speed >= 1) AND (rays_speed <= 20)));
alter table only public.site_settings add constraint site_settings_release_url_check CHECK (((release_url IS NULL) OR (release_url ~ '^https://'::text)));
alter table only public.site_settings add constraint site_settings_shake_button_check CHECK ((shake_button = ANY (ARRAY['enrollment'::text, 'shop'::text, 'login'::text, 'albums'::text, 'release'::text])));
alter table only public.site_settings add constraint site_settings_videos_check CHECK (((jsonb_typeof(videos) = 'array'::text) AND (jsonb_array_length(videos) <= 12)));
alter table only public.social_networks add constraint social_networks_url_template_check CHECK ((POSITION(('{handle}'::text) IN (url_template)) > 0));
alter table only public.song_attachments add constraint song_attachments_check CHECK (((url IS NOT NULL) OR (storage_path IS NOT NULL)));
alter table only public.song_attachments add constraint song_attachments_check1 CHECK (((storage_path IS NULL) OR (storage_path ~~ ((organization_id)::text || '/%'::text))));
alter table only public.song_attachments add constraint song_attachments_kind_check CHECK ((kind = ANY (ARRAY['score'::text, 'audio'::text, 'video'::text, 'lyrics'::text, 'other'::text])));
alter table only public.song_attachments add constraint song_attachments_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'storage'::text, 'gdrive'::text])));
alter table only public.song_attachments add constraint song_attachments_tuning_check CHECK (((tuning IS NULL) OR ((length(TRIM(BOTH FROM tuning)) >= 1) AND (length(TRIM(BOTH FROM tuning)) <= 8))));
alter table only public.song_attachments add constraint song_attachments_url_check CHECK (((url IS NULL) OR (url ~* '^https?://'::text)));
alter table only public.songs add constraint songs_drive_folder_url_check CHECK (((drive_folder_url IS NULL) OR (drive_folder_url ~* '^https?://'::text)));
alter table only public.songs add constraint songs_guide_url_check CHECK (((guide_url IS NULL) OR (guide_url ~* '^https?://'::text)));
alter table only public.songs add constraint songs_title_check CHECK ((length(TRIM(BOTH FROM title)) > 0));
alter table only public.staff_assignments add constraint staff_assignments_check CHECK (((((section_id IS NOT NULL))::integer + ((instrument_id IS NOT NULL))::integer) = 1));
alter table only public.staff_assignments add constraint staff_assignments_compensation_check CHECK ((compensation = ANY (ARRAY['paid'::text, 'collaborative'::text])));
alter table only public.staff_group_rules add constraint staff_group_rules_check CHECK ((((scope = 'all'::text) AND (section_id IS NULL)) OR ((scope = 'section'::text) AND (section_id IS NOT NULL))));
alter table only public.staff_group_rules add constraint staff_group_rules_percent_check CHECK (((percent > (0)::numeric) AND (percent <= (100)::numeric)));
alter table only public.staff_group_rules add constraint staff_group_rules_scope_check CHECK ((scope = ANY (ARRAY['all'::text, 'section'::text])));
alter table only public.staff_pay_hours add constraint staff_pay_hours_hours_check CHECK ((hours >= (0)::numeric));
alter table only public.staff_pay_rules add constraint spr_kind_ck CHECK ((kind = ANY (ARRAY['fixed'::text, 'percent'::text, 'hourly'::text, 'group'::text])));
alter table only public.staff_pay_rules add constraint spr_scope_ck CHECK ((scope = ANY (ARRAY['all'::text, 'section'::text, 'instrument'::text])));
alter table only public.staff_pay_rules add constraint spr_target_ck CHECK ((((scope = 'all'::text) AND (section_id IS NULL) AND (instrument_id IS NULL)) OR ((scope = 'section'::text) AND (section_id IS NOT NULL) AND (instrument_id IS NULL)) OR ((scope = 'instrument'::text) AND (instrument_id IS NOT NULL) AND (section_id IS NULL))));
alter table only public.staff_pay_rules add constraint spr_values_ck CHECK ((((kind = 'fixed'::text) AND (fixed_amount IS NOT NULL) AND (fixed_amount >= (0)::numeric) AND (percent IS NULL) AND (hourly_rate IS NULL) AND (scope = 'all'::text) AND (group_key IS NULL)) OR ((kind = 'percent'::text) AND (percent IS NOT NULL) AND (percent > (0)::numeric) AND (percent <= (100)::numeric) AND (fixed_amount IS NULL) AND (hourly_rate IS NULL) AND (group_key IS NULL)) OR ((kind = 'hourly'::text) AND (hourly_rate IS NOT NULL) AND (hourly_rate >= (0)::numeric) AND (fixed_amount IS NULL) AND (percent IS NULL) AND (scope = ANY (ARRAY['all'::text, 'section'::text])) AND (group_key IS NULL)) OR ((kind = 'group'::text) AND (group_key IS NOT NULL) AND (fixed_amount IS NULL) AND (percent IS NULL) AND (hourly_rate IS NULL) AND (scope = 'all'::text))));
alter table only public.staff_payments add constraint staff_payments_amount_check CHECK ((amount > (0)::numeric));
alter table only public.staff_payments add constraint staff_payments_check CHECK (((status <> 'paid'::text) OR (paid_on IS NOT NULL)));
alter table only public.staff_payments add constraint staff_payments_competence_check CHECK ((EXTRACT(day FROM competence) = (1)::numeric));
alter table only public.staff_payments add constraint staff_payments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'cancelled'::text])));
alter table only public.supplier_categories add constraint supplier_categories_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0));
alter table only public.suppliers add constraint suppliers_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0));
alter table only public.suppliers add constraint suppliers_website_check CHECK (((website IS NULL) OR (website ~* '^https?://'::text)));

-- ============ Chaves estrangeiras ============
alter table only public.access_roles add constraint access_roles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.activities add constraint activities_organization_id_activity_type_id_fkey FOREIGN KEY (organization_id, activity_type_id) REFERENCES activity_types(organization_id, id);
alter table only public.activities add constraint activities_organization_id_cycle_id_fkey FOREIGN KEY (organization_id, cycle_id) REFERENCES cycles(organization_id, id);
alter table only public.activities add constraint activities_organization_id_recurrence_rule_id_fkey FOREIGN KEY (organization_id, recurrence_rule_id) REFERENCES recurrence_rules(organization_id, id);
alter table only public.activity_audiences add constraint activity_audiences_organization_id_activity_id_fkey FOREIGN KEY (organization_id, activity_id) REFERENCES activities(organization_id, id) ON DELETE CASCADE;
alter table only public.activity_checklist_items add constraint activity_checklist_items_organization_id_activity_id_fkey FOREIGN KEY (organization_id, activity_id) REFERENCES activities(organization_id, id);
alter table only public.activity_checklist_items add constraint activity_checklist_items_organization_id_assignee_member_i_fkey FOREIGN KEY (organization_id, assignee_member_id) REFERENCES members(organization_id, id);
alter table only public.activity_checklist_items add constraint activity_checklist_items_organization_id_source_template_i_fkey FOREIGN KEY (organization_id, source_template_item_id) REFERENCES checklist_template_items(organization_id, id);
alter table only public.activity_item_cancellations add constraint activity_item_cancellations_instrument_id_fkey FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE CASCADE;
alter table only public.activity_item_cancellations add constraint activity_item_cancellations_organization_id_activity_id_fkey FOREIGN KEY (organization_id, activity_id) REFERENCES activities(organization_id, id) ON DELETE CASCADE;
alter table only public.activity_type_links add constraint activity_type_links_organization_id_activity_id_fkey FOREIGN KEY (organization_id, activity_id) REFERENCES activities(organization_id, id) ON DELETE CASCADE;
alter table only public.activity_type_links add constraint activity_type_links_organization_id_activity_type_id_fkey FOREIGN KEY (organization_id, activity_type_id) REFERENCES activity_types(organization_id, id) ON DELETE CASCADE;
alter table only public.activity_types add constraint activity_types_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.artistic_functions add constraint artistic_functions_organization_id_section_id_fkey FOREIGN KEY (organization_id, section_id) REFERENCES sections(organization_id, id);
alter table only public.attendance_statuses add constraint attendance_statuses_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.backups add constraint backups_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.charge_adjustments add constraint charge_adjustments_adjusted_by_fkey FOREIGN KEY (adjusted_by) REFERENCES members(id);
alter table only public.charge_adjustments add constraint charge_adjustments_organization_id_charge_id_fkey FOREIGN KEY (organization_id, charge_id) REFERENCES monthly_charges(organization_id, id);
alter table only public.checklist_template_items add constraint checklist_template_items_organization_id_template_id_fkey FOREIGN KEY (organization_id, template_id) REFERENCES checklist_templates(organization_id, id);
alter table only public.checklist_templates add constraint checklist_templates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.consent_records add constraint consent_records_organization_id_member_id_fkey FOREIGN KEY (organization_id, member_id) REFERENCES members(organization_id, id);
alter table only public.cycle_extra_categories add constraint cycle_extra_categories_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE;
alter table only public.cycle_extra_categories add constraint cycle_extra_categories_organization_id_fee_category_id_fkey FOREIGN KEY (organization_id, fee_category_id) REFERENCES fee_categories(organization_id, id);
alter table only public.cycle_extra_categories add constraint cycle_extra_categories_organization_id_member_id_fkey FOREIGN KEY (organization_id, member_id) REFERENCES members(organization_id, id);
alter table only public.cycle_fee_assignments add constraint cycle_fee_assignments_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE SET NULL;
alter table only public.cycle_fee_assignments add constraint cycle_fee_assignments_organization_id_fee_category_id_fkey FOREIGN KEY (organization_id, fee_category_id) REFERENCES fee_categories(organization_id, id);
alter table only public.cycle_fee_assignments add constraint cycle_fee_assignments_organization_id_member_id_fkey FOREIGN KEY (organization_id, member_id) REFERENCES members(organization_id, id);
alter table only public.cycle_participations add constraint cycle_participations_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE SET NULL;
alter table only public.cycle_participations add constraint cycle_participations_organization_id_function_id_fkey FOREIGN KEY (organization_id, function_id) REFERENCES artistic_functions(organization_id, id);
alter table only public.cycle_participations add constraint cycle_participations_organization_id_instrument_id_fkey FOREIGN KEY (organization_id, instrument_id) REFERENCES instruments(organization_id, id);
alter table only public.cycle_participations add constraint cycle_participations_organization_id_member_id_fkey FOREIGN KEY (organization_id, member_id) REFERENCES members(organization_id, id);
alter table only public.cycle_participations add constraint cycle_participations_organization_id_skill_level_id_fkey FOREIGN KEY (organization_id, skill_level_id) REFERENCES skill_levels(organization_id, id);
alter table only public.cycle_scholarships add constraint cycle_scholarships_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE SET NULL;
alter table only public.cycle_scholarships add constraint cycle_scholarships_organization_id_member_id_fkey FOREIGN KEY (organization_id, member_id) REFERENCES members(organization_id, id);
alter table only public.cycle_scholarships add constraint cycle_scholarships_organization_id_scholarship_type_id_fkey FOREIGN KEY (organization_id, scholarship_type_id) REFERENCES scholarship_types(organization_id, id);
alter table only public.cycle_types add constraint cycle_types_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.cycles add constraint cycles_organization_id_cycle_type_id_fkey FOREIGN KEY (organization_id, cycle_type_id) REFERENCES cycle_types(organization_id, id);
alter table only public.distribution_destinations add constraint distribution_destinations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.drive_folder_access add constraint drive_folder_access_organization_id_access_role_id_fkey FOREIGN KEY (organization_id, access_role_id) REFERENCES access_roles(organization_id, id);
alter table only public.drive_folder_access add constraint drive_folder_access_organization_id_folder_id_fkey FOREIGN KEY (organization_id, folder_id) REFERENCES drive_folders(organization_id, id);
alter table only public.drive_folder_access add constraint drive_folder_access_organization_id_instrument_id_fkey FOREIGN KEY (organization_id, instrument_id) REFERENCES instruments(organization_id, id);
alter table only public.drive_folder_access add constraint drive_folder_access_organization_id_section_id_fkey FOREIGN KEY (organization_id, section_id) REFERENCES sections(organization_id, id);
alter table only public.drive_folder_shares add constraint drive_folder_shares_organization_id_folder_id_fkey FOREIGN KEY (organization_id, folder_id) REFERENCES drive_folders(organization_id, id);
alter table only public.drive_folders add constraint drive_folders_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.email_requests add constraint email_requests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.email_requests add constraint email_requests_organization_id_member_id_fkey FOREIGN KEY (organization_id, member_id) REFERENCES members(organization_id, id);
alter table only public.event_attendance add constraint event_attendance_organization_id_activity_id_fkey FOREIGN KEY (organization_id, activity_id) REFERENCES activities(organization_id, id);
alter table only public.event_attendance add constraint event_attendance_organization_id_member_id_fkey FOREIGN KEY (organization_id, member_id) REFERENCES members(organization_id, id);
alter table only public.event_attendance add constraint event_attendance_organization_id_status_id_fkey FOREIGN KEY (organization_id, status_id) REFERENCES attendance_statuses(organization_id, id);
alter table only public.event_attendance add constraint event_attendance_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES members(id);
alter table only public.fee_categories add constraint fee_categories_function_id_fkey FOREIGN KEY (function_id) REFERENCES artistic_functions(id) ON DELETE SET NULL;
alter table only public.fee_categories add constraint fee_categories_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.fee_categories add constraint fee_categories_section_id_fkey FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE SET NULL;
alter table only public.fee_cycle_exempt add constraint fee_cycle_exempt_organization_id_cycle_id_fkey FOREIGN KEY (organization_id, cycle_id) REFERENCES cycles(organization_id, id);
alter table only public.fee_cycle_exempt add constraint fee_cycle_exempt_organization_id_function_id_fkey FOREIGN KEY (organization_id, function_id) REFERENCES artistic_functions(organization_id, id);
alter table only public.fee_cycle_prices add constraint fee_cycle_prices_organization_id_cycle_id_fkey FOREIGN KEY (organization_id, cycle_id) REFERENCES cycles(organization_id, id);
alter table only public.fee_cycle_prices add constraint fee_cycle_prices_organization_id_fee_category_id_fkey FOREIGN KEY (organization_id, fee_category_id) REFERENCES fee_categories(organization_id, id);
alter table only public.finance_categories add constraint finance_categories_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.financial_entries add constraint financial_entries_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES cycles(id);
alter table only public.financial_entries add constraint financial_entries_organization_id_category_id_fkey FOREIGN KEY (organization_id, category_id) REFERENCES finance_categories(organization_id, id);
alter table only public.form_email_outbox add constraint form_email_outbox_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.form_email_outbox add constraint form_email_outbox_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES form_submissions(id) ON DELETE CASCADE;
alter table only public.form_fields add constraint form_fields_organization_id_form_id_fkey FOREIGN KEY (organization_id, form_id) REFERENCES forms(organization_id, id);
alter table only public.form_fields add constraint form_fields_source_template_id_fkey FOREIGN KEY (source_template_id) REFERENCES form_section_templates(id) ON DELETE SET NULL;
alter table only public.form_list_items add constraint form_list_items_list_id_fkey FOREIGN KEY (list_id) REFERENCES form_lists(id) ON DELETE CASCADE;
alter table only public.form_list_items add constraint form_list_items_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.form_lists add constraint form_lists_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.form_section_templates add constraint form_section_templates_form_id_fkey FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE;
alter table only public.form_section_templates add constraint form_section_templates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.form_send_defaults add constraint form_send_defaults_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.form_submission_files add constraint form_submission_files_organization_id_submission_id_fkey FOREIGN KEY (organization_id, submission_id) REFERENCES form_submissions(organization_id, id);
alter table only public.form_submissions add constraint form_submissions_organization_id_form_id_fkey FOREIGN KEY (organization_id, form_id) REFERENCES forms(organization_id, id);
alter table only public.form_submissions add constraint form_submissions_organization_id_form_version_id_fkey FOREIGN KEY (organization_id, form_version_id) REFERENCES form_versions(organization_id, id);
alter table only public.form_submissions add constraint form_submissions_organization_id_member_id_fkey FOREIGN KEY (organization_id, member_id) REFERENCES members(organization_id, id);
alter table only public.form_submissions add constraint form_submissions_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES members(id);
alter table only public.form_submit_attempts add constraint form_submit_attempts_form_id_fkey FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE;
alter table only public.form_versions add constraint form_versions_organization_id_form_id_fkey FOREIGN KEY (organization_id, form_id) REFERENCES forms(organization_id, id);
alter table only public.forms add constraint forms_organization_id_cycle_id_fkey FOREIGN KEY (organization_id, cycle_id) REFERENCES cycles(organization_id, id);
alter table only public.forms add constraint forms_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.forms add constraint forms_published_version_id_fkey FOREIGN KEY (published_version_id) REFERENCES form_versions(id);
alter table only public.gender_options add constraint gender_options_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.holidays add constraint holidays_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.instrument_cycle_capacity add constraint instrument_cycle_capacity_organization_id_cycle_id_fkey FOREIGN KEY (organization_id, cycle_id) REFERENCES cycles(organization_id, id);
alter table only public.instrument_cycle_capacity add constraint instrument_cycle_capacity_organization_id_instrument_id_fkey FOREIGN KEY (organization_id, instrument_id) REFERENCES instruments(organization_id, id);
alter table only public.instrument_cycle_workshop add constraint instrument_cycle_workshop_organization_id_cycle_id_fkey FOREIGN KEY (organization_id, cycle_id) REFERENCES cycles(organization_id, id);
alter table only public.instrument_cycle_workshop add constraint instrument_cycle_workshop_organization_id_instrument_id_fkey FOREIGN KEY (organization_id, instrument_id) REFERENCES instruments(organization_id, id);
alter table only public.instrument_cycles add constraint instrument_cycles_organization_id_cycle_id_fkey FOREIGN KEY (organization_id, cycle_id) REFERENCES cycles(organization_id, id);
alter table only public.instrument_cycles add constraint instrument_cycles_organization_id_instrument_id_fkey FOREIGN KEY (organization_id, instrument_id) REFERENCES instruments(organization_id, id);
alter table only public.instruments add constraint instruments_organization_id_section_id_fkey FOREIGN KEY (organization_id, section_id) REFERENCES sections(organization_id, id);
alter table only public.integrations add constraint integrations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.member_access_roles add constraint member_access_roles_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES auth.users(id);
alter table only public.member_access_roles add constraint member_access_roles_organization_id_access_role_id_fkey FOREIGN KEY (organization_id, access_role_id) REFERENCES access_roles(organization_id, id);
alter table only public.member_access_roles add constraint member_access_roles_organization_id_member_id_fkey FOREIGN KEY (organization_id, member_id) REFERENCES members(organization_id, id);
alter table only public.member_artistic_links add constraint member_artistic_links_organization_id_function_id_fkey FOREIGN KEY (organization_id, function_id) REFERENCES artistic_functions(organization_id, id);
alter table only public.member_artistic_links add constraint member_artistic_links_organization_id_instrument_id_fkey FOREIGN KEY (organization_id, instrument_id) REFERENCES instruments(organization_id, id);
alter table only public.member_artistic_links add constraint member_artistic_links_organization_id_member_id_fkey FOREIGN KEY (organization_id, member_id) REFERENCES members(organization_id, id);
alter table only public.member_artistic_links add constraint member_artistic_links_organization_id_skill_level_id_fkey FOREIGN KEY (organization_id, skill_level_id) REFERENCES skill_levels(organization_id, id);
alter table only public.member_cycle_status_history add constraint member_cycle_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES members(id);
alter table only public.member_cycle_statuses add constraint member_cycle_statuses_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.member_cycles add constraint member_cycles_organization_id_cycle_id_fkey FOREIGN KEY (organization_id, cycle_id) REFERENCES cycles(organization_id, id);
alter table only public.member_cycles add constraint member_cycles_organization_id_member_id_fkey FOREIGN KEY (organization_id, member_id) REFERENCES members(organization_id, id);
alter table only public.member_cycles add constraint member_cycles_organization_id_status_id_fkey FOREIGN KEY (organization_id, status_id) REFERENCES member_cycle_statuses(organization_id, id);
alter table only public.member_cycles add constraint member_cycles_organization_id_waitlist_instrument_id_fkey FOREIGN KEY (organization_id, waitlist_instrument_id) REFERENCES instruments(organization_id, id);
alter table only public.member_emails add constraint member_emails_organization_id_member_id_fkey FOREIGN KEY (organization_id, member_id) REFERENCES members(organization_id, id) ON DELETE CASCADE;
alter table only public.member_form_answers add constraint member_form_answers_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE SET NULL;
alter table only public.member_form_answers add constraint member_form_answers_organization_id_member_id_fkey FOREIGN KEY (organization_id, member_id) REFERENCES members(organization_id, id);
alter table only public.member_invites add constraint member_invites_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id);
alter table only public.member_invites add constraint member_invites_organization_id_member_id_fkey FOREIGN KEY (organization_id, member_id) REFERENCES members(organization_id, id);
alter table only public.member_pix_keys add constraint member_pix_keys_organization_id_member_id_fkey FOREIGN KEY (organization_id, member_id) REFERENCES members(organization_id, id);
alter table only public.member_sensitive_data add constraint member_sensitive_data_organization_id_member_id_fkey FOREIGN KEY (organization_id, member_id) REFERENCES members(organization_id, id);
alter table only public.member_sensitive_data add constraint member_sensitive_data_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
alter table only public.members add constraint members_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table only public.members add constraint members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.members add constraint members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table only public.monthly_charges add constraint monthly_charges_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES cycles(id);
alter table only public.monthly_charges add constraint monthly_charges_organization_id_fee_category_id_fkey FOREIGN KEY (organization_id, fee_category_id) REFERENCES fee_categories(organization_id, id);
alter table only public.monthly_charges add constraint monthly_charges_organization_id_member_id_fkey FOREIGN KEY (organization_id, member_id) REFERENCES members(organization_id, id);
alter table only public.org_settings add constraint org_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.page_releases add constraint page_releases_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table only public.page_releases add constraint page_releases_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
alter table only public.participation_requests add constraint participation_requests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.participation_requests add constraint participation_requests_organization_id_member_id_fkey FOREIGN KEY (organization_id, member_id) REFERENCES members(organization_id, id);
alter table only public.race_options add constraint race_options_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.reactivation_requests add constraint reactivation_requests_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES members(id);
alter table only public.reactivation_requests add constraint reactivation_requests_organization_id_cycle_id_fkey FOREIGN KEY (organization_id, cycle_id) REFERENCES cycles(organization_id, id);
alter table only public.reactivation_requests add constraint reactivation_requests_organization_id_member_id_fkey FOREIGN KEY (organization_id, member_id) REFERENCES members(organization_id, id);
alter table only public.recurrence_rules add constraint recurrence_rules_organization_id_activity_type_id_fkey FOREIGN KEY (organization_id, activity_type_id) REFERENCES activity_types(organization_id, id);
alter table only public.recurrence_skips add constraint recurrence_skips_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES recurrence_rules(id) ON DELETE CASCADE;
alter table only public.repertoires add constraint repertoires_cycle_fk FOREIGN KEY (organization_id, cycle_id) REFERENCES cycles(organization_id, id);
alter table only public.repertoires add constraint repertoires_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.role_permissions add constraint role_permissions_access_role_id_fkey FOREIGN KEY (access_role_id) REFERENCES access_roles(id) ON DELETE CASCADE;
alter table only public.role_permissions add constraint role_permissions_permission_key_fkey FOREIGN KEY (permission_key) REFERENCES permissions(key);
alter table only public.scholarship_types add constraint scholarship_types_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.section_cycles add constraint section_cycles_organization_id_cycle_id_fkey FOREIGN KEY (organization_id, cycle_id) REFERENCES cycles(organization_id, id);
alter table only public.section_cycles add constraint section_cycles_organization_id_section_id_fkey FOREIGN KEY (organization_id, section_id) REFERENCES sections(organization_id, id);
alter table only public.section_names add constraint section_names_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.sections add constraint sections_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.shop_coupons add constraint shop_coupons_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table only public.shop_email_outbox add constraint shop_email_outbox_organization_id_order_id_fkey FOREIGN KEY (organization_id, order_id) REFERENCES shop_orders(organization_id, id);
alter table only public.shop_email_outbox add constraint shop_email_outbox_product_id_fkey FOREIGN KEY (product_id) REFERENCES shop_products(id) ON DELETE CASCADE;
alter table only public.shop_fulfillments add constraint shop_fulfillments_organization_id_order_id_fkey FOREIGN KEY (organization_id, order_id) REFERENCES shop_orders(organization_id, id);
alter table only public.shop_order_events add constraint shop_order_events_organization_id_order_id_fkey FOREIGN KEY (organization_id, order_id) REFERENCES shop_orders(organization_id, id);
alter table only public.shop_order_items add constraint shop_order_items_organization_id_order_id_fkey FOREIGN KEY (organization_id, order_id) REFERENCES shop_orders(organization_id, id);
alter table only public.shop_order_items add constraint shop_order_items_organization_id_product_id_fkey FOREIGN KEY (organization_id, product_id) REFERENCES shop_products(organization_id, id);
alter table only public.shop_order_items add constraint shop_order_items_organization_id_variant_id_fkey FOREIGN KEY (organization_id, variant_id) REFERENCES shop_product_variants(organization_id, id);
alter table only public.shop_orders add constraint shop_orders_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.shop_orders add constraint shop_orders_organization_id_member_id_fkey FOREIGN KEY (organization_id, member_id) REFERENCES members(organization_id, id);
alter table only public.shop_orders add constraint shop_orders_organization_id_pickup_point_id_fkey FOREIGN KEY (organization_id, pickup_point_id) REFERENCES shop_pickup_points(organization_id, id);
alter table only public.shop_orders add constraint shop_orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table only public.shop_pickup_points add constraint shop_pickup_points_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.shop_product_images add constraint shop_product_images_organization_id_product_id_fkey FOREIGN KEY (organization_id, product_id) REFERENCES shop_products(organization_id, id);
alter table only public.shop_product_pickups add constraint shop_product_pickups_organization_id_pickup_point_id_fkey FOREIGN KEY (organization_id, pickup_point_id) REFERENCES shop_pickup_points(organization_id, id) ON DELETE CASCADE;
alter table only public.shop_product_pickups add constraint shop_product_pickups_organization_id_product_id_fkey FOREIGN KEY (organization_id, product_id) REFERENCES shop_products(organization_id, id) ON DELETE CASCADE;
alter table only public.shop_product_variants add constraint shop_product_variants_organization_id_product_id_fkey FOREIGN KEY (organization_id, product_id) REFERENCES shop_products(organization_id, id);
alter table only public.shop_products add constraint shop_products_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.shop_settings add constraint shop_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.shop_settings add constraint shop_settings_payment_changed_by_fkey FOREIGN KEY (payment_changed_by) REFERENCES members(id) ON DELETE SET NULL;
alter table only public.shop_stock_items add constraint shop_stock_items_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.shop_variant_stock add constraint shop_variant_stock_organization_id_stock_item_id_fkey FOREIGN KEY (organization_id, stock_item_id) REFERENCES shop_stock_items(organization_id, id);
alter table only public.shop_variant_stock add constraint shop_variant_stock_organization_id_variant_id_fkey FOREIGN KEY (organization_id, variant_id) REFERENCES shop_product_variants(organization_id, id) ON DELETE CASCADE;
alter table only public.site_albums add constraint site_albums_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.site_settings add constraint site_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.site_settings add constraint site_settings_shop_product_id_fkey FOREIGN KEY (shop_product_id) REFERENCES shop_products(id) ON DELETE SET NULL;
alter table only public.skill_levels add constraint skill_levels_list_id_fkey FOREIGN KEY (list_id) REFERENCES form_lists(id);
alter table only public.skill_levels add constraint skill_levels_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.social_networks add constraint social_networks_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table only public.song_attachments add constraint song_attachments_organization_id_instrument_id_fkey FOREIGN KEY (organization_id, instrument_id) REFERENCES instruments(organization_id, id);
alter table only public.song_attachments add constraint song_attachments_organization_id_section_id_fkey FOREIGN KEY (organization_id, section_id) REFERENCES sections(organization_id, id);
alter table only public.song_attachments add constraint song_attachments_organization_id_song_id_fkey FOREIGN KEY (organization_id, song_id) REFERENCES songs(organization_id, id);
alter table only public.songs add constraint songs_organization_id_repertoire_id_fkey FOREIGN KEY (organization_id, repertoire_id) REFERENCES repertoires(organization_id, id);
alter table only public.staff_assignments add constraint staff_assignments_cycle_fk FOREIGN KEY (organization_id, cycle_id) REFERENCES cycles(organization_id, id);
alter table only public.staff_assignments add constraint staff_assignments_organization_id_instrument_id_fkey FOREIGN KEY (organization_id, instrument_id) REFERENCES instruments(organization_id, id);
alter table only public.staff_assignments add constraint staff_assignments_organization_id_member_id_fkey FOREIGN KEY (organization_id, member_id) REFERENCES members(organization_id, id);
alter table only public.staff_assignments add constraint staff_assignments_organization_id_section_id_fkey FOREIGN KEY (organization_id, section_id) REFERENCES sections(organization_id, id);
alter table only public.staff_group_rules add constraint staff_group_rules_organization_id_cycle_id_fkey FOREIGN KEY (organization_id, cycle_id) REFERENCES cycles(organization_id, id);
alter table only public.staff_group_rules add constraint staff_group_rules_organization_id_section_id_fkey FOREIGN KEY (organization_id, section_id) REFERENCES sections(organization_id, id);
alter table only public.staff_pay_hours add constraint staff_pay_hours_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES staff_pay_rules(id) ON DELETE CASCADE;
alter table only public.staff_pay_rules add constraint staff_pay_rules_organization_id_cycle_id_fkey FOREIGN KEY (organization_id, cycle_id) REFERENCES cycles(organization_id, id);
alter table only public.staff_pay_rules add constraint staff_pay_rules_organization_id_instrument_id_fkey FOREIGN KEY (organization_id, instrument_id) REFERENCES instruments(organization_id, id);
alter table only public.staff_pay_rules add constraint staff_pay_rules_organization_id_member_id_fkey FOREIGN KEY (organization_id, member_id) REFERENCES members(organization_id, id);
alter table only public.staff_pay_rules add constraint staff_pay_rules_organization_id_section_id_fkey FOREIGN KEY (organization_id, section_id) REFERENCES sections(organization_id, id);
alter table only public.staff_payments add constraint staff_payments_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES cycles(id);
alter table only public.staff_payments add constraint staff_payments_organization_id_destination_id_fkey FOREIGN KEY (organization_id, destination_id) REFERENCES distribution_destinations(organization_id, id);
alter table only public.staff_payments add constraint staff_payments_organization_id_member_id_fkey FOREIGN KEY (organization_id, member_id) REFERENCES members(organization_id, id);
alter table only public.storage_delete_queue add constraint storage_delete_queue_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table only public.supplier_categories add constraint supplier_categories_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table only public.suppliers add constraint suppliers_organization_id_category_id_fkey FOREIGN KEY (organization_id, category_id) REFERENCES supplier_categories(organization_id, id);

-- ============ Índices ============
CREATE INDEX aci_activity_idx ON public.activity_checklist_items USING btree (activity_id, sort_order) WHERE is_active;
CREATE UNIQUE INDEX aci_source_once_uq ON public.activity_checklist_items USING btree (activity_id, source_template_item_id) WHERE ((source_template_item_id IS NOT NULL) AND is_active);
CREATE INDEX activities_cycle_idx ON public.activities USING btree (cycle_id);
CREATE INDEX activities_org_date_idx ON public.activities USING btree (organization_id, activity_date);
CREATE UNIQUE INDEX activities_rule_slot_uq ON public.activities USING btree (recurrence_rule_id, recurrence_slot) WHERE (recurrence_rule_id IS NOT NULL);
CREATE INDEX audit_logs_entity_idx ON public.audit_logs USING btree (organization_id, entity_type, entity_id);
CREATE INDEX audit_logs_org_time_idx ON public.audit_logs USING btree (organization_id, created_at DESC);
CREATE INDEX backups_org_idx ON public.backups USING btree (organization_id, created_at DESC);
CREATE UNIQUE INDEX cfa_member_cycle_uq ON public.cycle_fee_assignments USING btree (member_id, cycle_id) WHERE (cycle_id IS NOT NULL);
CREATE INDEX cp_cycle_idx ON public.cycle_participations USING btree (cycle_id);
CREATE INDEX cp_member_idx ON public.cycle_participations USING btree (member_id, cycle_id);
CREATE UNIQUE INDEX cp_source_uq ON public.cycle_participations USING btree (source_link_id, cycle_id) WHERE (source_link_id IS NOT NULL);
CREATE UNIQUE INDEX csch_member_cycle_uq ON public.cycle_scholarships USING btree (member_id, cycle_id) WHERE (cycle_id IS NOT NULL);
CREATE INDEX cti_template_idx ON public.checklist_template_items USING btree (template_id, sort_order);
CREATE UNIQUE INDEX cycles_one_current_uq ON public.cycles USING btree (organization_id) WHERE is_current;
CREATE UNIQUE INDEX dfa_instrument_uq ON public.drive_folder_access USING btree (folder_id, instrument_id) WHERE (instrument_id IS NOT NULL);
CREATE UNIQUE INDEX dfa_role_uq ON public.drive_folder_access USING btree (folder_id, access_role_id) WHERE (access_role_id IS NOT NULL);
CREATE UNIQUE INDEX dfa_section_uq ON public.drive_folder_access USING btree (folder_id, section_id) WHERE (section_id IS NOT NULL);
CREATE UNIQUE INDEX dfs_active_uq ON public.drive_folder_shares USING btree (folder_id, email) WHERE (removed_at IS NULL);
CREATE INDEX email_requests_pending_idx ON public.email_requests USING btree (organization_id) WHERE (status = 'pending'::text);
CREATE INDEX event_attendance_member_idx ON public.event_attendance USING btree (member_id);
CREATE INDEX event_attendance_status_idx ON public.event_attendance USING btree (activity_id, status_id);
CREATE UNIQUE INDEX fee_categories_function_uq ON public.fee_categories USING btree (function_id) WHERE (function_id IS NOT NULL);
CREATE UNIQUE INDEX fee_categories_system_key_uq ON public.fee_categories USING btree (organization_id, system_key) WHERE (system_key IS NOT NULL);
CREATE INDEX financial_entries_cycle_idx ON public.financial_entries USING btree (cycle_id);
CREATE INDEX financial_entries_org_date_idx ON public.financial_entries USING btree (organization_id, occurred_on);
CREATE INDEX form_fields_form_idx ON public.form_fields USING btree (form_id, sort_order);
CREATE INDEX form_list_items_list_idx ON public.form_list_items USING btree (list_id);
CREATE INDEX form_outbox_pending_idx ON public.form_email_outbox USING btree (next_attempt_at) WHERE (status = 'pending'::text);
CREATE UNIQUE INDEX form_submissions_dedupe_uq ON public.form_submissions USING btree (form_id, dedupe_key) WHERE ((dedupe_key IS NOT NULL) AND (status = ANY (ARRAY['pending'::text, 'approved'::text])));
CREATE INDEX form_submissions_form_idx ON public.form_submissions USING btree (form_id, status, submitted_at DESC);
CREATE INDEX form_submit_attempts_at ON public.form_submit_attempts USING btree (at);
CREATE INDEX form_submit_attempts_lookup ON public.form_submit_attempts USING btree (form_id, ip_hash, at);
CREATE INDEX form_upload_tokens_form_idx ON public.form_upload_tokens USING btree (form_id, created_at DESC);
CREATE INDEX instruments_section_idx ON public.instruments USING btree (section_id);
CREATE INDEX mal_instrument_idx ON public.member_artistic_links USING btree (instrument_id) WHERE (ended_at IS NULL);
CREATE INDEX mal_member_idx ON public.member_artistic_links USING btree (member_id) WHERE (ended_at IS NULL);
CREATE INDEX mcsh_mc_idx ON public.member_cycle_status_history USING btree (member_cycle_id, changed_at DESC);
CREATE UNIQUE INDEX member_access_roles_active_uq ON public.member_access_roles USING btree (member_id, access_role_id) WHERE (revoked_at IS NULL);
CREATE INDEX member_access_roles_member_idx ON public.member_access_roles USING btree (member_id) WHERE (revoked_at IS NULL);
CREATE INDEX member_cycles_cycle_status_idx ON public.member_cycles USING btree (cycle_id, status_id);
CREATE INDEX member_emails_member_idx ON public.member_emails USING btree (member_id);
CREATE INDEX member_form_answers_member_idx ON public.member_form_answers USING btree (member_id);
CREATE INDEX member_invites_member_idx ON public.member_invites USING btree (member_id);
CREATE INDEX members_name_trgm_idx ON public.members USING gin (full_name gin_trgm_ops);
CREATE UNIQUE INDEX members_org_email_uq ON public.members USING btree (organization_id, lower(email)) WHERE ((email IS NOT NULL) AND (archived_at IS NULL));
CREATE INDEX members_org_name_idx ON public.members USING btree (organization_id, lower(full_name));
CREATE INDEX members_user_idx ON public.members USING btree (user_id) WHERE (user_id IS NOT NULL);
CREATE INDEX monthly_charges_comp_status_idx ON public.monthly_charges USING btree (organization_id, competence, status);
CREATE INDEX monthly_charges_cycle_idx ON public.monthly_charges USING btree (cycle_id);
CREATE INDEX monthly_charges_member_idx ON public.monthly_charges USING btree (member_id, competence DESC);
CREATE INDEX participation_requests_pending_idx ON public.participation_requests USING btree (organization_id) WHERE (status = 'pending'::text);
CREATE UNIQUE INDEX pix_one_default_uq ON public.member_pix_keys USING btree (member_id) WHERE (is_default AND (archived_at IS NULL));
CREATE UNIQUE INDEX reactivation_one_pending_uq ON public.reactivation_requests USING btree (member_id, cycle_id) WHERE (status = 'pending'::text);
CREATE INDEX repertoires_cycle_idx ON public.repertoires USING btree (cycle_id);
CREATE UNIQUE INDEX section_names_name_uq ON public.section_names USING btree (organization_id, lower(name));
CREATE INDEX shop_email_outbox_to_email_idx ON public.shop_email_outbox USING btree (lower(to_email), created_at) WHERE (template = 'order_created'::text);
CREATE INDEX shop_events_order_idx ON public.shop_order_events USING btree (order_id, created_at);
CREATE INDEX shop_images_product_idx ON public.shop_product_images USING btree (product_id, sort_order);
CREATE INDEX shop_items_order_idx ON public.shop_order_items USING btree (order_id);
CREATE INDEX shop_lookup_attempts_bucket_idx ON public.shop_lookup_attempts USING btree (bucket, created_at);
CREATE INDEX shop_lookup_bucket_idx ON public.shop_lookup_attempts USING btree (bucket, created_at DESC);
CREATE INDEX shop_orders_archived_idx ON public.shop_orders USING btree (organization_id, archived_at);
CREATE INDEX shop_orders_expiry_idx ON public.shop_orders USING btree (expires_at) WHERE (status = 'awaiting_payment'::text);
CREATE INDEX shop_orders_phone_idx ON public.shop_orders USING btree (customer_phone);
CREATE UNIQUE INDEX shop_orders_request_uq ON public.shop_orders USING btree (organization_id, client_request_id) WHERE (client_request_id IS NOT NULL);
CREATE INDEX shop_orders_status_idx ON public.shop_orders USING btree (organization_id, status, created_at DESC);
CREATE INDEX shop_orders_user_idx ON public.shop_orders USING btree (organization_id, user_id, created_at DESC) WHERE (user_id IS NOT NULL);
CREATE INDEX shop_outbox_pending_idx ON public.shop_email_outbox USING btree (next_attempt_at) WHERE (status = 'pending'::text);
CREATE UNIQUE INDEX shop_outbox_production_uq ON public.shop_email_outbox USING btree (order_id, product_id) WHERE (template = 'production_started'::text);
CREATE INDEX shop_product_pickups_point_idx ON public.shop_product_pickups USING btree (pickup_point_id);
CREATE INDEX shop_variant_stock_item_idx ON public.shop_variant_stock USING btree (stock_item_id);
CREATE INDEX skill_levels_list_idx ON public.skill_levels USING btree (list_id) WHERE (list_id IS NOT NULL);
CREATE UNIQUE INDEX skill_levels_org_list_name_uq ON public.skill_levels USING btree (organization_id, COALESCE(list_id, '00000000-0000-0000-0000-000000000000'::uuid), name);
CREATE INDEX song_attachments_song_idx ON public.song_attachments USING btree (song_id) WHERE is_active;
CREATE INDEX songs_repertoire_idx ON public.songs USING btree (repertoire_id, sort_order);
CREATE UNIQUE INDEX staff_assignments_active_uq ON public.staff_assignments USING btree (member_id, staff_kind, COALESCE(section_id, instrument_id), cycle_id) WHERE (valid_to IS NULL);
CREATE INDEX staff_pay_rules_cycle_idx ON public.staff_pay_rules USING btree (organization_id, cycle_id, member_id);
CREATE INDEX staff_payments_comp_idx ON public.staff_payments USING btree (organization_id, competence, status);
CREATE INDEX staff_payments_cycle_idx ON public.staff_payments USING btree (cycle_id);
CREATE INDEX staff_payments_member_idx ON public.staff_payments USING btree (member_id, competence DESC);
CREATE INDEX suppliers_category_idx ON public.suppliers USING btree (category_id) WHERE is_active;

-- ============ Views ============
create or replace view public.v_attendance_member_cycle with (security_invoker=true) as  SELECT ea.organization_id,
    ea.member_id,
    a.cycle_id,
    count(*) AS records,
    count(*) FILTER (WHERE st.counts_as_present) AS present,
    round(100.0 * count(*) FILTER (WHERE st.counts_as_present)::numeric / NULLIF(count(*), 0)::numeric, 1) AS pct_present
   FROM event_attendance ea
     JOIN activities a ON a.id = ea.activity_id AND a.status <> 'cancelled'::text
     JOIN attendance_statuses st ON st.id = ea.status_id
  GROUP BY ea.organization_id, ea.member_id, a.cycle_id;
create or replace view public.v_billing_summary with (security_invoker=true) as  SELECT c.organization_id,
    c.competence,
    COALESCE(sum(c.final_amount) FILTER (WHERE c.status = ANY (ARRAY['pending'::text, 'paid'::text])), 0::numeric) AS previsto,
    COALESCE(sum(c.final_amount) FILTER (WHERE c.status = 'paid'::text), 0::numeric) AS recebido,
    COALESCE(sum(c.final_amount) FILTER (WHERE c.status = 'pending'::text), 0::numeric) AS pendente,
    COALESCE(sum(c.base_amount) FILTER (WHERE c.status = 'exempt'::text), 0::numeric) AS isento,
    COALESCE(sum(c.scholarship_discount) FILTER (WHERE c.status <> 'cancelled'::text), 0::numeric) AS impacto_bolsas,
    count(*) FILTER (WHERE c.status = 'pending'::text AND c.due_on < (now() AT TIME ZONE o.timezone)::date) AS inadimplentes,
    count(*) FILTER (WHERE c.status <> 'cancelled'::text) AS cobrancas
   FROM monthly_charges c
     JOIN organizations o ON o.id = c.organization_id
  GROUP BY c.organization_id, c.competence, o.timezone;
create or replace view public.v_finance_ledger with (security_invoker=true) as  SELECT e.organization_id,
    'entry:'::text || e.id AS ref,
    e.occurred_on,
    e.kind,
    e.amount,
    e.description,
    c.name AS category,
    'lancamento'::text AS source,
    e.cycle_id
   FROM financial_entries e
     JOIN finance_categories c ON c.id = e.category_id
  WHERE e.status = 'posted'::text AND has_permission(e.organization_id, 'finance.read'::text)
UNION ALL
 SELECT ch.organization_id,
    'charge:'::text || ch.id AS ref,
    ch.paid_on AS occurred_on,
    'income'::text AS kind,
    ch.final_amount AS amount,
    'Mensalidade — '::text || COALESCE(m.display_name, m.full_name) AS description,
    'Mensalidades'::text AS category,
    'mensalidade'::text AS source,
    ch.cycle_id
   FROM monthly_charges ch
     JOIN members m ON m.id = ch.member_id
  WHERE ch.status = 'paid'::text AND ch.paid_on IS NOT NULL AND has_permission(ch.organization_id, 'finance.read'::text)
UNION ALL
 SELECT p.organization_id,
    'staff:'::text || p.id AS ref,
    p.paid_on AS occurred_on,
    'expense'::text AS kind,
    p.amount,
    'Pagamento da equipe — '::text || COALESCE(m.display_name, m.full_name) AS description,
    'Pagamentos da equipe'::text AS category,
    'equipe'::text AS source,
    p.cycle_id
   FROM staff_payments p
     JOIN members m ON m.id = p.member_id
  WHERE p.status = 'paid'::text AND p.paid_on IS NOT NULL AND has_permission(p.organization_id, 'finance.read'::text);
create or replace view public.v_instrument_cycle_overview with (security_invoker=true) as  SELECT i.organization_id,
    cy.id AS cycle_id,
    i.id AS instrument_id,
    i.name AS instrument_name,
    s.id AS section_id,
    s.name AS section_name,
    s.sort_order AS section_order,
    i.sort_order AS instrument_order,
    c.capacity,
    instrument_occupied(i.id, cy.id) AS occupied,
        CASE
            WHEN c.capacity IS NULL THEN NULL::integer
            ELSE GREATEST(c.capacity - instrument_occupied(i.id, cy.id), 0)
        END AS available,
    COALESCE(instrument_occupied(i.id, cy.id) >= c.capacity, false) AS is_full
   FROM instruments i
     JOIN sections s ON s.id = i.section_id
     JOIN cycles cy ON cy.organization_id = i.organization_id
     LEFT JOIN instrument_cycle_capacity c ON c.instrument_id = i.id AND c.cycle_id = cy.id
  WHERE i.is_active;
create or replace view public.v_member_directory with (security_barrier=true) as  SELECT id,
    organization_id,
    COALESCE(display_name, full_name) AS display_name
   FROM members m
  WHERE archived_at IS NULL AND is_org_member(organization_id) AND COALESCE(( SELECT s.value #>> '{}'::text[]
           FROM org_settings s
          WHERE s.organization_id = m.organization_id AND s.key = 'member_directory_visibility'::text), 'all_members'::text) = 'all_members'::text;

-- ============ Gatilhos (triggers) ============
CREATE TRIGGER trg_access_roles_titular AFTER INSERT ON access_roles FOR EACH ROW EXECUTE FUNCTION trg_ensure_titular();
CREATE TRIGGER trg_audit_access_roles AFTER INSERT OR UPDATE ON access_roles FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER activities_set_slot BEFORE INSERT ON activities FOR EACH ROW EXECUTE FUNCTION activities_set_slot();
CREATE TRIGGER trg_activities_updated BEFORE UPDATE ON activities FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_audit_activities AFTER INSERT OR UPDATE ON activities FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_activity_audiences AFTER INSERT OR UPDATE ON activity_audiences FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_aci_updated BEFORE UPDATE ON activity_checklist_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_audit_activity_checklist_items AFTER INSERT OR UPDATE ON activity_checklist_items FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_activity_item_cancellations AFTER INSERT OR DELETE OR UPDATE ON activity_item_cancellations FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_activity_type_links AFTER INSERT OR DELETE OR UPDATE ON activity_type_links FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_activity_types AFTER INSERT OR UPDATE ON activity_types FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_artistic_functions AFTER INSERT OR UPDATE ON artistic_functions FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_attendance_statuses AFTER INSERT OR UPDATE ON attendance_statuses FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_charge_adjustments AFTER INSERT OR DELETE OR UPDATE ON charge_adjustments FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_checklist_template_items AFTER INSERT OR UPDATE ON checklist_template_items FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_checklist_templates AFTER INSERT OR UPDATE ON checklist_templates FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_guard_consent_update BEFORE UPDATE ON consent_records FOR EACH ROW EXECUTE FUNCTION guard_consent_update();
CREATE TRIGGER trg_audit_cycle_extra_categories AFTER INSERT OR DELETE OR UPDATE ON cycle_extra_categories FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_cycle_fee_assignments AFTER INSERT OR DELETE OR UPDATE ON cycle_fee_assignments FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_guard_category_section BEFORE INSERT OR UPDATE OF fee_category_id ON cycle_fee_assignments FOR EACH ROW EXECUTE FUNCTION guard_category_section();
CREATE TRIGGER trg_cp_to_staff AFTER INSERT OR DELETE OR UPDATE ON cycle_participations FOR EACH ROW EXECUTE FUNCTION fn_participation_to_staff();
CREATE TRIGGER trg_guard_participation_section AFTER INSERT OR UPDATE OF instrument_id, function_id ON cycle_participations FOR EACH ROW EXECUTE FUNCTION guard_participation_section();
CREATE TRIGGER trg_audit_cycle_scholarships AFTER INSERT OR DELETE OR UPDATE ON cycle_scholarships FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_cycle_types AFTER INSERT OR UPDATE ON cycle_types FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_cycles AFTER INSERT OR UPDATE ON cycles FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_distribution_destinations AFTER INSERT OR DELETE OR UPDATE ON distribution_destinations FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_drive_folder_access AFTER INSERT OR DELETE OR UPDATE ON drive_folder_access FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_drive_folder_shares AFTER INSERT OR UPDATE ON drive_folder_shares FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_drive_folders AFTER INSERT OR DELETE OR UPDATE ON drive_folders FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_drive_folders_updated BEFORE UPDATE ON drive_folders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_audit_event_attendance AFTER INSERT OR UPDATE ON event_attendance FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_fee_categories AFTER INSERT OR DELETE OR UPDATE ON fee_categories FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_fee_cycle_exempt AFTER INSERT OR DELETE OR UPDATE ON fee_cycle_exempt FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_fee_cycle_prices AFTER INSERT OR DELETE OR UPDATE ON fee_cycle_prices FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_finance_categories AFTER INSERT OR DELETE OR UPDATE ON finance_categories FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_financial_entries AFTER INSERT OR DELETE OR UPDATE ON financial_entries FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_cycle_financial_entries BEFORE INSERT ON financial_entries FOR EACH ROW EXECUTE FUNCTION _set_cycle_from_date('occurred_on');
CREATE TRIGGER trg_audit_form_fields AFTER INSERT OR UPDATE ON form_fields FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_form_list_items AFTER INSERT OR UPDATE ON form_list_items FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_form_lists AFTER INSERT OR UPDATE ON form_lists FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_form_section_templates_updated BEFORE UPDATE ON form_section_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_form_submission_ip_limit BEFORE INSERT ON form_submissions FOR EACH ROW EXECUTE FUNCTION trg_form_submission_ip_limit();
CREATE TRIGGER trg_audit_form_versions AFTER INSERT OR UPDATE ON form_versions FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_forms AFTER INSERT OR UPDATE ON forms FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_forms_updated BEFORE UPDATE ON forms FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_audit_gender_options AFTER INSERT OR UPDATE ON gender_options FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER capacity_zero_is_infinite AFTER INSERT OR UPDATE ON instrument_cycle_capacity FOR EACH ROW WHEN (new.capacity = 0) EXECUTE FUNCTION capacity_zero_is_infinite();
CREATE TRIGGER trg_audit_instrument_cycle_capacity AFTER INSERT OR UPDATE ON instrument_cycle_capacity FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_instrument_cycle_workshop AFTER INSERT OR UPDATE ON instrument_cycle_workshop FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_guard_instrument_cycle BEFORE DELETE ON instrument_cycles FOR EACH ROW EXECUTE FUNCTION _guard_instrument_cycle();
CREATE TRIGGER trg_audit_instruments AFTER INSERT OR UPDATE ON instruments FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_guard_instrument_delete BEFORE DELETE ON instruments FOR EACH ROW EXECUTE FUNCTION _guard_instrument_delete();
CREATE TRIGGER trg_instrument_in_cycle AFTER INSERT ON instruments FOR EACH ROW EXECUTE FUNCTION fn_structure_in_current_cycle();
CREATE TRIGGER trg_audit_integrations AFTER INSERT OR UPDATE ON integrations FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_member_roles AFTER INSERT OR UPDATE ON member_access_roles FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_guard_last_director_role BEFORE UPDATE ON member_access_roles FOR EACH ROW EXECUTE FUNCTION guard_last_director_role();
CREATE TRIGGER trg_guard_member_role_identity BEFORE UPDATE ON member_access_roles FOR EACH ROW EXECUTE FUNCTION guard_member_role_identity();
CREATE TRIGGER trg_guard_privileged_roles BEFORE INSERT OR UPDATE ON member_access_roles FOR EACH ROW EXECUTE FUNCTION guard_privileged_roles();
CREATE TRIGGER trg_audit_member_artistic_links AFTER INSERT OR UPDATE ON member_artistic_links FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_links_to_staff AFTER INSERT OR DELETE OR UPDATE ON member_artistic_links FOR EACH ROW EXECUTE FUNCTION fn_participation_to_staff();
CREATE TRIGGER trg_sync_cycle_links AFTER INSERT OR DELETE OR UPDATE ON member_artistic_links FOR EACH ROW EXECUTE FUNCTION trg_sync_member_current_cycle();
CREATE TRIGGER trg_audit_member_cycle_statuses AFTER INSERT OR UPDATE ON member_cycle_statuses FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_member_cycles AFTER INSERT OR UPDATE ON member_cycles FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_member_cycles_history AFTER INSERT OR UPDATE OF status_id ON member_cycles FOR EACH ROW EXECUTE FUNCTION log_member_cycle_status();
CREATE TRIGGER trg_member_cycles_updated BEFORE UPDATE ON member_cycles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_sync_cycle_member AFTER INSERT ON member_cycles FOR EACH ROW EXECUTE FUNCTION trg_sync_member_current_cycle();
CREATE TRIGGER trg_sync_cycle_member_fee AFTER INSERT ON member_cycles FOR EACH ROW EXECUTE FUNCTION carry_member_fee_to_cycle();
CREATE TRIGGER trg_audit_member_emails AFTER INSERT OR DELETE OR UPDATE ON member_emails FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_member_form_answers AFTER INSERT OR DELETE OR UPDATE ON member_form_answers FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_member_pix_keys AFTER INSERT OR DELETE OR UPDATE ON member_pix_keys FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_sensitive AFTER INSERT OR UPDATE ON member_sensitive_data FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_msd_updated BEFORE UPDATE ON member_sensitive_data FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_audit_members AFTER INSERT OR UPDATE ON members FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_guard_last_director_archive BEFORE UPDATE OF archived_at ON members FOR EACH ROW EXECUTE FUNCTION guard_last_director_archive();
CREATE TRIGGER trg_guard_member_user_link BEFORE INSERT OR UPDATE OF user_id ON members FOR EACH ROW EXECUTE FUNCTION guard_member_user_link();
CREATE TRIGGER trg_members_adult BEFORE INSERT OR UPDATE OF birth_date ON members FOR EACH ROW EXECUTE FUNCTION enforce_member_adult();
CREATE TRIGGER trg_members_default_role AFTER INSERT ON members FOR EACH ROW EXECUTE FUNCTION grant_default_member_role();
CREATE TRIGGER trg_members_updated BEFORE UPDATE ON members FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_sync_bloco_contacts AFTER UPDATE OF email, phone, social_handle ON members FOR EACH ROW EXECUTE FUNCTION trg_sync_bloco_contacts();
CREATE TRIGGER trg_audit_monthly_charges AFTER INSERT OR DELETE OR UPDATE ON monthly_charges FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_charges_updated BEFORE UPDATE ON monthly_charges FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_cycle_monthly_charges BEFORE INSERT ON monthly_charges FOR EACH ROW EXECUTE FUNCTION _set_cycle_from_date('competence');
CREATE TRIGGER trg_audit_org_settings AFTER INSERT OR UPDATE ON org_settings FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_organizations AFTER INSERT OR UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_organizations_updated BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_permissions_to_direction AFTER INSERT ON permissions FOR EACH ROW EXECUTE FUNCTION grant_new_permission_to_direction();
CREATE TRIGGER trg_audit_race_options AFTER INSERT OR UPDATE ON race_options FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_reactivation_requests AFTER INSERT OR UPDATE ON reactivation_requests FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_recurrence_rules AFTER INSERT OR UPDATE ON recurrence_rules FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_repertoires AFTER INSERT OR UPDATE ON repertoires FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_repertoires_updated BEFORE UPDATE ON repertoires FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_audit_role_permissions AFTER INSERT OR DELETE OR UPDATE ON role_permissions FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_guard_role_permissions BEFORE INSERT OR DELETE OR UPDATE ON role_permissions FOR EACH ROW EXECUTE FUNCTION guard_role_permissions();
CREATE TRIGGER trg_audit_scholarship_types AFTER INSERT OR DELETE OR UPDATE ON scholarship_types FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_guard_section_cycle BEFORE DELETE ON section_cycles FOR EACH ROW EXECUTE FUNCTION _guard_section_cycle();
CREATE TRIGGER trg_audit_section_names AFTER INSERT OR DELETE OR UPDATE ON section_names FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_section_names_updated BEFORE UPDATE ON section_names FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_audit_sections AFTER INSERT OR UPDATE ON sections FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_guard_section_delete BEFORE DELETE ON sections FOR EACH ROW EXECUTE FUNCTION _guard_section_delete();
CREATE TRIGGER trg_section_in_cycle AFTER INSERT ON sections FOR EACH ROW EXECUTE FUNCTION fn_structure_in_current_cycle();
CREATE TRIGGER trg_audit_shop_coupons AFTER INSERT OR DELETE OR UPDATE ON shop_coupons FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_shop_coupons_updated BEFORE UPDATE ON shop_coupons FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_shop_enqueue_email AFTER INSERT ON shop_order_events FOR EACH ROW EXECUTE FUNCTION shop_enqueue_email();
CREATE TRIGGER trg_audit_shop_orders AFTER INSERT OR UPDATE ON shop_orders FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_shop_orders_updated BEFORE UPDATE ON shop_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_audit_shop_pickup_points AFTER INSERT OR UPDATE ON shop_pickup_points FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_shop_pickup_compose BEFORE INSERT OR UPDATE ON shop_pickup_points FOR EACH ROW EXECUTE FUNCTION shop_pickup_compose();
CREATE TRIGGER trg_shop_pickup_updated BEFORE UPDATE ON shop_pickup_points FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_audit_shop_product_variants AFTER INSERT OR UPDATE ON shop_product_variants FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_shop_variant_guard BEFORE UPDATE ON shop_product_variants FOR EACH ROW EXECUTE FUNCTION shop_guard_variant_update();
CREATE TRIGGER trg_shop_variant_propagate AFTER UPDATE ON shop_product_variants FOR EACH ROW WHEN (old.stock IS DISTINCT FROM new.stock OR old.reserved IS DISTINCT FROM new.reserved) EXECUTE FUNCTION shop_variant_propagate();
CREATE TRIGGER trg_shop_variants_updated BEFORE UPDATE ON shop_product_variants FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_audit_shop_products AFTER INSERT OR UPDATE ON shop_products FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_shop_products_updated BEFORE UPDATE ON shop_products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_audit_shop_settings AFTER INSERT OR UPDATE ON shop_settings FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_shop_settings_payment_changed BEFORE INSERT OR UPDATE ON shop_settings FOR EACH ROW EXECUTE FUNCTION shop_settings_payment_changed();
CREATE TRIGGER trg_shop_settings_updated BEFORE UPDATE ON shop_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_audit_shop_stock_items AFTER INSERT OR UPDATE ON shop_stock_items FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_shop_item_guard BEFORE UPDATE ON shop_stock_items FOR EACH ROW EXECUTE FUNCTION shop_guard_item_update();
CREATE TRIGGER trg_shop_stock_items_updated BEFORE UPDATE ON shop_stock_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_shop_vs_check BEFORE INSERT OR UPDATE ON shop_variant_stock FOR EACH ROW EXECUTE FUNCTION shop_variant_stock_check();
CREATE TRIGGER trg_shop_vs_lock BEFORE INSERT OR DELETE OR UPDATE ON shop_variant_stock FOR EACH ROW EXECUTE FUNCTION shop_variant_stock_lock();
CREATE TRIGGER trg_audit_site_albums AFTER INSERT OR DELETE OR UPDATE ON site_albums FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_site_albums_updated BEFORE UPDATE ON site_albums FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_audit_site_settings AFTER INSERT OR UPDATE ON site_settings FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_site_settings_updated BEFORE UPDATE ON site_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_audit_skill_levels AFTER INSERT OR UPDATE ON skill_levels FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_social_networks AFTER INSERT OR UPDATE ON social_networks FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_song_attachments AFTER INSERT OR UPDATE ON song_attachments FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_songs AFTER INSERT OR UPDATE ON songs FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_songs_updated BEFORE UPDATE ON songs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_audit_staff_assignments AFTER INSERT OR UPDATE ON staff_assignments FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_staff_assignment_cycle BEFORE INSERT ON staff_assignments FOR EACH ROW EXECUTE FUNCTION fn_staff_assignment_cycle();
CREATE TRIGGER trg_staff_to_participation AFTER INSERT OR UPDATE OF compensation ON staff_assignments FOR EACH ROW EXECUTE FUNCTION fn_staff_to_participation();
CREATE TRIGGER trg_audit_staff_group_rules AFTER INSERT OR DELETE OR UPDATE ON staff_group_rules FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_staff_pay_hours AFTER INSERT OR DELETE OR UPDATE ON staff_pay_hours FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_staff_pay_rules AFTER INSERT OR DELETE OR UPDATE ON staff_pay_rules FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_staff_payments AFTER INSERT OR DELETE OR UPDATE ON staff_payments FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_cycle_staff_payments BEFORE INSERT ON staff_payments FOR EACH ROW EXECUTE FUNCTION _set_cycle_from_date('competence');
CREATE TRIGGER trg_staff_payments_updated BEFORE UPDATE ON staff_payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_audit_supplier_categories AFTER INSERT OR UPDATE ON supplier_categories FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_suppliers AFTER INSERT OR UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_suppliers_updated BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============ Row Level Security ligada ============
alter table public.access_roles enable row level security;
alter table public.activities enable row level security;
alter table public.activity_audiences enable row level security;
alter table public.activity_checklist_items enable row level security;
alter table public.activity_item_cancellations enable row level security;
alter table public.activity_type_links enable row level security;
alter table public.activity_types enable row level security;
alter table public.artistic_functions enable row level security;
alter table public.attendance_statuses enable row level security;
alter table public.audit_logs enable row level security;
alter table public.backups enable row level security;
alter table public.charge_adjustments enable row level security;
alter table public.checklist_template_items enable row level security;
alter table public.checklist_templates enable row level security;
alter table public.consent_records enable row level security;
alter table public.cycle_extra_categories enable row level security;
alter table public.cycle_fee_assignments enable row level security;
alter table public.cycle_participations enable row level security;
alter table public.cycle_scholarships enable row level security;
alter table public.cycle_types enable row level security;
alter table public.cycles enable row level security;
alter table public.distribution_destinations enable row level security;
alter table public.drive_folder_access enable row level security;
alter table public.drive_folder_shares enable row level security;
alter table public.drive_folders enable row level security;
alter table public.email_requests enable row level security;
alter table public.event_attendance enable row level security;
alter table public.fee_categories enable row level security;
alter table public.fee_cycle_exempt enable row level security;
alter table public.fee_cycle_prices enable row level security;
alter table public.finance_categories enable row level security;
alter table public.financial_entries enable row level security;
alter table public.form_email_outbox enable row level security;
alter table public.form_fields enable row level security;
alter table public.form_list_items enable row level security;
alter table public.form_lists enable row level security;
alter table public.form_section_templates enable row level security;
alter table public.form_send_defaults enable row level security;
alter table public.form_submission_files enable row level security;
alter table public.form_submissions enable row level security;
alter table public.form_submit_attempts enable row level security;
alter table public.form_upload_tokens enable row level security;
alter table public.form_versions enable row level security;
alter table public.forms enable row level security;
alter table public.gender_options enable row level security;
alter table public.holidays enable row level security;
alter table public.infinitepay_transactions enable row level security;
alter table public.instrument_cycle_capacity enable row level security;
alter table public.instrument_cycle_workshop enable row level security;
alter table public.instrument_cycles enable row level security;
alter table public.instruments enable row level security;
alter table public.integrations enable row level security;
alter table public.member_access_roles enable row level security;
alter table public.member_artistic_links enable row level security;
alter table public.member_cycle_status_history enable row level security;
alter table public.member_cycle_statuses enable row level security;
alter table public.member_cycles enable row level security;
alter table public.member_emails enable row level security;
alter table public.member_form_answers enable row level security;
alter table public.member_invites enable row level security;
alter table public.member_pix_keys enable row level security;
alter table public.member_sensitive_data enable row level security;
alter table public.members enable row level security;
alter table public.monthly_charges enable row level security;
alter table public.org_settings enable row level security;
alter table public.organizations enable row level security;
alter table public.page_releases enable row level security;
alter table public.participation_requests enable row level security;
alter table public.permissions enable row level security;
alter table public.race_options enable row level security;
alter table public.reactivation_requests enable row level security;
alter table public.recurrence_rules enable row level security;
alter table public.recurrence_skips enable row level security;
alter table public.repertoires enable row level security;
alter table public.role_permissions enable row level security;
alter table public.scholarship_types enable row level security;
alter table public.section_cycles enable row level security;
alter table public.section_names enable row level security;
alter table public.sections enable row level security;
alter table public.shop_coupons enable row level security;
alter table public.shop_email_outbox enable row level security;
alter table public.shop_fulfillments enable row level security;
alter table public.shop_lookup_attempts enable row level security;
alter table public.shop_order_events enable row level security;
alter table public.shop_order_items enable row level security;
alter table public.shop_orders enable row level security;
alter table public.shop_pickup_points enable row level security;
alter table public.shop_product_images enable row level security;
alter table public.shop_product_pickups enable row level security;
alter table public.shop_product_variants enable row level security;
alter table public.shop_products enable row level security;
alter table public.shop_settings enable row level security;
alter table public.shop_stock_items enable row level security;
alter table public.shop_variant_stock enable row level security;
alter table public.site_albums enable row level security;
alter table public.site_settings enable row level security;
alter table public.skill_levels enable row level security;
alter table public.social_networks enable row level security;
alter table public.song_attachments enable row level security;
alter table public.songs enable row level security;
alter table public.staff_assignments enable row level security;
alter table public.staff_group_rules enable row level security;
alter table public.staff_pay_hours enable row level security;
alter table public.staff_pay_rules enable row level security;
alter table public.staff_payments enable row level security;
alter table public.storage_delete_queue enable row level security;
alter table public.supplier_categories enable row level security;
alter table public.suppliers enable row level security;

-- ============ Políticas (public e storage) ============
create policy roles_insert on public.access_roles as permissive for INSERT to authenticated with check (has_permission(organization_id, 'roles.manage'::text));
create policy roles_select on public.access_roles as permissive for SELECT to authenticated using (is_org_member(organization_id));
create policy roles_update on public.access_roles as permissive for UPDATE to authenticated using ((has_permission(organization_id, 'roles.manage'::text) AND (NOT is_system))) with check (has_permission(organization_id, 'roles.manage'::text));
create policy act_insert on public.activities as permissive for INSERT to authenticated with check (has_permission(organization_id, 'events.manage'::text));
create policy act_select on public.activities as permissive for SELECT to authenticated using ((is_org_member(organization_id) AND (permission_scope_of(organization_id, 'events.read'::text) IS NOT NULL) AND ((visibility = 'members'::text) OR is_staff(organization_id))));
create policy act_update on public.activities as permissive for UPDATE to authenticated using (has_permission(organization_id, 'events.manage'::text)) with check (has_permission(organization_id, 'events.manage'::text));
create policy aud_delete on public.activity_audiences as permissive for DELETE to authenticated using (has_permission(organization_id, 'events.manage'::text));
create policy aud_insert on public.activity_audiences as permissive for INSERT to authenticated with check (has_permission(organization_id, 'events.manage'::text));
create policy aud_select on public.activity_audiences as permissive for SELECT to authenticated using (has_permission(organization_id, 'events.manage'::text));
create policy aci_select on public.activity_checklist_items as permissive for SELECT to authenticated using ((is_active AND (EXISTS ( SELECT 1
   FROM activities a
  WHERE (a.id = activity_checklist_items.activity_id)))));
create policy aic_delete on public.activity_item_cancellations as permissive for DELETE to authenticated using (has_permission(organization_id, 'events.manage'::text));
create policy aic_insert on public.activity_item_cancellations as permissive for INSERT to authenticated with check (has_permission(organization_id, 'events.manage'::text));
create policy aic_select on public.activity_item_cancellations as permissive for SELECT to authenticated using (has_permission(organization_id, 'events.read'::text));
create policy atl_delete on public.activity_type_links as permissive for DELETE to authenticated using (has_permission(organization_id, 'events.manage'::text));
create policy atl_insert on public.activity_type_links as permissive for INSERT to authenticated with check (has_permission(organization_id, 'events.manage'::text));
create policy atl_select on public.activity_type_links as permissive for SELECT to authenticated using (is_org_member(organization_id));
create policy at_insert on public.activity_types as permissive for INSERT to authenticated with check (has_permission(organization_id, 'events.manage'::text));
create policy at_select on public.activity_types as permissive for SELECT to authenticated using (is_org_member(organization_id));
create policy at_update on public.activity_types as permissive for UPDATE to authenticated using (has_permission(organization_id, 'events.manage'::text)) with check (has_permission(organization_id, 'events.manage'::text));
create policy artistic_functions_insert on public.artistic_functions as permissive for INSERT to authenticated with check (has_permission(organization_id, 'structure.manage'::text));
create policy artistic_functions_select on public.artistic_functions as permissive for SELECT to authenticated using (is_org_member(organization_id));
create policy artistic_functions_update on public.artistic_functions as permissive for UPDATE to authenticated using (has_permission(organization_id, 'structure.manage'::text)) with check (has_permission(organization_id, 'structure.manage'::text));
create policy functions_delete on public.artistic_functions as permissive for DELETE to authenticated using ((has_permission(organization_id, 'structure.manage'::text) AND (NOT is_fixed)));
create policy ast_insert on public.attendance_statuses as permissive for INSERT to authenticated with check (has_permission(organization_id, 'settings.manage'::text));
create policy ast_select on public.attendance_statuses as permissive for SELECT to authenticated using (is_org_member(organization_id));
create policy ast_update on public.attendance_statuses as permissive for UPDATE to authenticated using (has_permission(organization_id, 'settings.manage'::text)) with check (has_permission(organization_id, 'settings.manage'::text));
create policy audit_select on public.audit_logs as permissive for SELECT to authenticated using (has_permission(organization_id, 'audit.read'::text));
create policy adj_select on public.charge_adjustments as permissive for SELECT to authenticated using (has_permission(organization_id, 'billing.manage'::text));
create policy cti_insert on public.checklist_template_items as permissive for INSERT to authenticated with check (has_permission(organization_id, 'checklists.manage'::text));
create policy cti_select on public.checklist_template_items as permissive for SELECT to authenticated using (has_permission(organization_id, 'checklists.manage'::text));
create policy cti_update on public.checklist_template_items as permissive for UPDATE to authenticated using (has_permission(organization_id, 'checklists.manage'::text)) with check (has_permission(organization_id, 'checklists.manage'::text));
create policy ct_insert on public.checklist_templates as permissive for INSERT to authenticated with check (has_permission(organization_id, 'checklists.manage'::text));
create policy ct_select on public.checklist_templates as permissive for SELECT to authenticated using (has_permission(organization_id, 'checklists.manage'::text));
create policy ct_update on public.checklist_templates as permissive for UPDATE to authenticated using (has_permission(organization_id, 'checklists.manage'::text)) with check (has_permission(organization_id, 'checklists.manage'::text));
create policy consent_insert on public.consent_records as permissive for INSERT to authenticated with check ((is_self(member_id) OR has_permission(organization_id, 'members.manage'::text)));
create policy consent_select on public.consent_records as permissive for SELECT to authenticated using ((is_self(member_id) OR has_permission(organization_id, 'members.manage'::text)));
create policy consent_update on public.consent_records as permissive for UPDATE to authenticated using (is_self(member_id)) with check (is_self(member_id));
create policy cec_delete on public.cycle_extra_categories as permissive for DELETE to authenticated using (has_permission(organization_id, 'billing.manage'::text));
create policy cec_insert on public.cycle_extra_categories as permissive for INSERT to authenticated with check (has_permission(organization_id, 'billing.manage'::text));
create policy cec_select on public.cycle_extra_categories as permissive for SELECT to authenticated using ((is_self(member_id) OR has_permission(organization_id, 'billing.read'::text)));
create policy cfa_delete on public.cycle_fee_assignments as permissive for DELETE to authenticated using (has_permission(organization_id, 'billing.manage'::text));
create policy cfa_insert on public.cycle_fee_assignments as permissive for INSERT to authenticated with check (has_permission(organization_id, 'billing.manage'::text));
create policy cfa_select on public.cycle_fee_assignments as permissive for SELECT to authenticated using ((is_self(member_id) OR has_permission(organization_id, 'billing.read'::text)));
create policy cfa_update on public.cycle_fee_assignments as permissive for UPDATE to authenticated using (has_permission(organization_id, 'billing.manage'::text)) with check (has_permission(organization_id, 'billing.manage'::text));
create policy cp_delete on public.cycle_participations as permissive for DELETE to authenticated using (has_permission(organization_id, 'members.manage'::text));
create policy cp_insert on public.cycle_participations as permissive for INSERT to authenticated with check (has_permission(organization_id, 'members.manage'::text));
create policy cp_select on public.cycle_participations as permissive for SELECT to authenticated using (can_read_member(organization_id, member_id));
create policy cp_update on public.cycle_participations as permissive for UPDATE to authenticated using (has_permission(organization_id, 'members.manage'::text)) with check (has_permission(organization_id, 'members.manage'::text));
create policy csch_delete on public.cycle_scholarships as permissive for DELETE to authenticated using (has_permission(organization_id, 'scholarships.manage'::text));
create policy csch_insert on public.cycle_scholarships as permissive for INSERT to authenticated with check (has_permission(organization_id, 'scholarships.manage'::text));
create policy csch_select on public.cycle_scholarships as permissive for SELECT to authenticated using ((is_self(member_id) OR has_permission(organization_id, 'scholarships.manage'::text)));
create policy csch_update on public.cycle_scholarships as permissive for UPDATE to authenticated using (has_permission(organization_id, 'scholarships.manage'::text)) with check (has_permission(organization_id, 'scholarships.manage'::text));
create policy cycle_types_insert on public.cycle_types as permissive for INSERT to authenticated with check (has_permission(organization_id, 'cycles.manage'::text));
create policy cycle_types_select on public.cycle_types as permissive for SELECT to authenticated using (is_org_member(organization_id));
create policy cycle_types_update on public.cycle_types as permissive for UPDATE to authenticated using (has_permission(organization_id, 'cycles.manage'::text)) with check (has_permission(organization_id, 'cycles.manage'::text));
create policy cycles_delete on public.cycles as permissive for DELETE to authenticated using (has_permission(organization_id, 'cycles.manage'::text));
create policy cycles_insert on public.cycles as permissive for INSERT to authenticated with check (has_permission(organization_id, 'cycles.manage'::text));
create policy cycles_select on public.cycles as permissive for SELECT to authenticated using (is_org_member(organization_id));
create policy cycles_update on public.cycles as permissive for UPDATE to authenticated using (has_permission(organization_id, 'cycles.manage'::text)) with check (has_permission(organization_id, 'cycles.manage'::text));
create policy dd_insert on public.distribution_destinations as permissive for INSERT to authenticated with check (has_permission(organization_id, 'finance.manage'::text));
create policy dd_select on public.distribution_destinations as permissive for SELECT to authenticated using (has_permission(organization_id, 'finance.read'::text));
create policy dd_update on public.distribution_destinations as permissive for UPDATE to authenticated using (has_permission(organization_id, 'finance.manage'::text)) with check (has_permission(organization_id, 'finance.manage'::text));
create policy dfa_delete on public.drive_folder_access as permissive for DELETE to authenticated using (has_permission(organization_id, 'drive.manage'::text));
create policy dfa_insert on public.drive_folder_access as permissive for INSERT to authenticated with check (has_permission(organization_id, 'drive.manage'::text));
create policy dfa_select on public.drive_folder_access as permissive for SELECT to authenticated using (has_permission(organization_id, 'drive.manage'::text));
create policy dfs_select on public.drive_folder_shares as permissive for SELECT to authenticated using (has_permission(organization_id, 'drive.manage'::text));
create policy dfolder_insert on public.drive_folders as permissive for INSERT to authenticated with check (has_permission(organization_id, 'drive.manage'::text));
create policy dfolder_select on public.drive_folders as permissive for SELECT to authenticated using ((is_org_member(organization_id) AND (permission_scope_of(organization_id, 'drive.read'::text) IS NOT NULL) AND (has_permission(organization_id, 'drive.manage'::text) OR can_see_drive_folder(id))));
create policy dfolder_update on public.drive_folders as permissive for UPDATE to authenticated using (has_permission(organization_id, 'drive.manage'::text)) with check (has_permission(organization_id, 'drive.manage'::text));
create policy ereq_select on public.email_requests as permissive for SELECT to authenticated using ((is_self(member_id) OR has_permission(organization_id, 'members.manage'::text)));
create policy ea_select on public.event_attendance as permissive for SELECT to authenticated using ((is_self(member_id) OR has_permission(organization_id, 'attendance.read'::text) OR (COALESCE(((permission_scope_of(organization_id, 'attendance.read'::text))::text = 'group'::text), false) AND is_in_my_group(organization_id, member_id))));
create policy fc_insert on public.fee_categories as permissive for INSERT to authenticated with check (has_permission(organization_id, 'billing.manage'::text));
create policy fc_select on public.fee_categories as permissive for SELECT to authenticated using (is_org_member(organization_id));
create policy fc_update on public.fee_categories as permissive for UPDATE to authenticated using (has_permission(organization_id, 'billing.manage'::text)) with check (has_permission(organization_id, 'billing.manage'::text));
create policy fcye_select on public.fee_cycle_exempt as permissive for SELECT to authenticated using (is_org_member(organization_id));
create policy fcyp_select on public.fee_cycle_prices as permissive for SELECT to authenticated using (is_org_member(organization_id));
create policy fcat_insert on public.finance_categories as permissive for INSERT to authenticated with check (has_permission(organization_id, 'finance.manage'::text));
create policy fcat_select on public.finance_categories as permissive for SELECT to authenticated using (has_permission(organization_id, 'finance.read'::text));
create policy fcat_update on public.finance_categories as permissive for UPDATE to authenticated using (has_permission(organization_id, 'finance.manage'::text)) with check (has_permission(organization_id, 'finance.manage'::text));
create policy fent_select on public.financial_entries as permissive for SELECT to authenticated using (has_permission(organization_id, 'finance.read'::text));
create policy form_outbox_sel on public.form_email_outbox as permissive for SELECT to authenticated using (has_permission(organization_id, 'forms.manage'::text));
create policy ff_delete on public.form_fields as permissive for DELETE to authenticated using (has_permission(organization_id, 'forms.manage'::text));
create policy ff_insert on public.form_fields as permissive for INSERT to authenticated with check (has_permission(organization_id, 'forms.manage'::text));
create policy ff_select on public.form_fields as permissive for SELECT to authenticated using (has_permission(organization_id, 'forms.manage'::text));
create policy ff_update on public.form_fields as permissive for UPDATE to authenticated using (has_permission(organization_id, 'forms.manage'::text)) with check (has_permission(organization_id, 'forms.manage'::text));
create policy form_list_items_insert on public.form_list_items as permissive for INSERT to authenticated with check (has_permission(organization_id, 'forms.manage'::text));
create policy form_list_items_select on public.form_list_items as permissive for SELECT to authenticated using (is_org_member(organization_id));
create policy form_list_items_update on public.form_list_items as permissive for UPDATE to authenticated using (has_permission(organization_id, 'forms.manage'::text)) with check (has_permission(organization_id, 'forms.manage'::text));
create policy form_lists_insert on public.form_lists as permissive for INSERT to authenticated with check (has_permission(organization_id, 'forms.manage'::text));
create policy form_lists_select on public.form_lists as permissive for SELECT to authenticated using (is_org_member(organization_id));
create policy form_lists_update on public.form_lists as permissive for UPDATE to authenticated using (has_permission(organization_id, 'forms.manage'::text)) with check (has_permission(organization_id, 'forms.manage'::text));
create policy fst_delete on public.form_section_templates as permissive for DELETE to authenticated using (has_permission(organization_id, 'forms.manage'::text));
create policy fst_insert on public.form_section_templates as permissive for INSERT to authenticated with check (has_permission(organization_id, 'forms.manage'::text));
create policy fst_select on public.form_section_templates as permissive for SELECT to authenticated using (has_permission(organization_id, 'forms.manage'::text));
create policy fst_update on public.form_section_templates as permissive for UPDATE to authenticated using (has_permission(organization_id, 'forms.manage'::text)) with check (has_permission(organization_id, 'forms.manage'::text));
create policy fsd_insert on public.form_send_defaults as permissive for INSERT to authenticated with check (has_permission(organization_id, 'forms.manage'::text));
create policy fsd_select on public.form_send_defaults as permissive for SELECT to authenticated using (is_org_member(organization_id));
create policy fsd_update on public.form_send_defaults as permissive for UPDATE to authenticated using (has_permission(organization_id, 'forms.manage'::text)) with check (has_permission(organization_id, 'forms.manage'::text));
create policy fsf_select on public.form_submission_files as permissive for SELECT to authenticated using (has_permission(organization_id, 'forms.manage'::text));
create policy fs_select on public.form_submissions as permissive for SELECT to authenticated using (has_permission(organization_id, 'forms.manage'::text));
create policy fv_select on public.form_versions as permissive for SELECT to authenticated using (has_permission(organization_id, 'forms.manage'::text));
create policy forms_insert on public.forms as permissive for INSERT to authenticated with check (has_permission(organization_id, 'forms.manage'::text));
create policy forms_select on public.forms as permissive for SELECT to authenticated using (has_permission(organization_id, 'forms.manage'::text));
create policy forms_update on public.forms as permissive for UPDATE to authenticated using (has_permission(organization_id, 'forms.manage'::text)) with check (has_permission(organization_id, 'forms.manage'::text));
create policy gender_options_insert on public.gender_options as permissive for INSERT to authenticated with check (has_permission(organization_id, 'forms.manage'::text));
create policy gender_options_select on public.gender_options as permissive for SELECT to authenticated using (is_org_member(organization_id));
create policy gender_options_update on public.gender_options as permissive for UPDATE to authenticated using (has_permission(organization_id, 'forms.manage'::text)) with check (has_permission(organization_id, 'forms.manage'::text));
create policy hol_delete on public.holidays as permissive for DELETE to authenticated using (has_permission(organization_id, 'settings.manage'::text));
create policy hol_insert on public.holidays as permissive for INSERT to authenticated with check (has_permission(organization_id, 'settings.manage'::text));
create policy hol_select on public.holidays as permissive for SELECT to authenticated using (is_org_member(organization_id));
create policy hol_update on public.holidays as permissive for UPDATE to authenticated using (has_permission(organization_id, 'settings.manage'::text)) with check (has_permission(organization_id, 'settings.manage'::text));
create policy capacity_delete on public.instrument_cycle_capacity as permissive for DELETE to authenticated using (has_permission(organization_id, 'capacity.manage'::text));
create policy capacity_insert on public.instrument_cycle_capacity as permissive for INSERT to authenticated with check (has_permission(organization_id, 'capacity.manage'::text));
create policy capacity_select on public.instrument_cycle_capacity as permissive for SELECT to authenticated using ((is_org_member(organization_id) AND (permission_scope_of(organization_id, 'capacity.read'::text) IS NOT NULL)));
create policy capacity_update on public.instrument_cycle_capacity as permissive for UPDATE to authenticated using (has_permission(organization_id, 'capacity.manage'::text)) with check (has_permission(organization_id, 'capacity.manage'::text));
create policy workshop_insert on public.instrument_cycle_workshop as permissive for INSERT to authenticated with check (has_permission(organization_id, 'structure.manage'::text));
create policy workshop_select on public.instrument_cycle_workshop as permissive for SELECT to authenticated using (is_org_member(organization_id));
create policy workshop_update on public.instrument_cycle_workshop as permissive for UPDATE to authenticated using (has_permission(organization_id, 'structure.manage'::text)) with check (has_permission(organization_id, 'structure.manage'::text));
create policy instrument_cycles_delete on public.instrument_cycles as permissive for DELETE to authenticated using (has_permission(organization_id, 'structure.manage'::text));
create policy instrument_cycles_insert on public.instrument_cycles as permissive for INSERT to authenticated with check (has_permission(organization_id, 'structure.manage'::text));
create policy instrument_cycles_select on public.instrument_cycles as permissive for SELECT to authenticated using (is_org_member(organization_id));
create policy instruments_delete on public.instruments as permissive for DELETE to authenticated using (has_permission(organization_id, 'structure.manage'::text));
create policy instruments_insert on public.instruments as permissive for INSERT to authenticated with check (has_permission(organization_id, 'structure.manage'::text));
create policy instruments_select on public.instruments as permissive for SELECT to authenticated using (is_org_member(organization_id));
create policy instruments_update on public.instruments as permissive for UPDATE to authenticated using (has_permission(organization_id, 'structure.manage'::text)) with check (has_permission(organization_id, 'structure.manage'::text));
create policy integ_insert on public.integrations as permissive for INSERT to authenticated with check (has_permission(organization_id, 'settings.manage'::text));
create policy integ_select on public.integrations as permissive for SELECT to authenticated using (has_permission(organization_id, 'settings.manage'::text));
create policy integ_update on public.integrations as permissive for UPDATE to authenticated using (has_permission(organization_id, 'settings.manage'::text)) with check (has_permission(organization_id, 'settings.manage'::text));
create policy member_roles_insert on public.member_access_roles as permissive for INSERT to authenticated with check (has_permission(organization_id, 'roles.manage'::text));
create policy member_roles_select on public.member_access_roles as permissive for SELECT to authenticated using ((is_self(member_id) OR has_permission(organization_id, 'roles.manage'::text)));
create policy member_roles_update on public.member_access_roles as permissive for UPDATE to authenticated using (has_permission(organization_id, 'roles.manage'::text)) with check (has_permission(organization_id, 'roles.manage'::text));
create policy mal_insert on public.member_artistic_links as permissive for INSERT to authenticated with check (has_permission(organization_id, 'members.manage'::text));
create policy mal_select on public.member_artistic_links as permissive for SELECT to authenticated using (can_read_member(organization_id, member_id));
create policy mal_update on public.member_artistic_links as permissive for UPDATE to authenticated using (has_permission(organization_id, 'members.manage'::text)) with check (has_permission(organization_id, 'members.manage'::text));
create policy mcsh_select on public.member_cycle_status_history as permissive for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM member_cycles mc
  WHERE ((mc.id = member_cycle_status_history.member_cycle_id) AND can_read_member(mc.organization_id, mc.member_id)))));
create policy mcs_insert on public.member_cycle_statuses as permissive for INSERT to authenticated with check (has_permission(organization_id, 'settings.manage'::text));
create policy mcs_select on public.member_cycle_statuses as permissive for SELECT to authenticated using (is_org_member(organization_id));
create policy mcs_update on public.member_cycle_statuses as permissive for UPDATE to authenticated using (has_permission(organization_id, 'settings.manage'::text)) with check (has_permission(organization_id, 'settings.manage'::text));
create policy mc_select on public.member_cycles as permissive for SELECT to authenticated using (can_read_member(organization_id, member_id));
create policy memails_delete on public.member_emails as permissive for DELETE to authenticated using ((is_self(member_id) OR has_permission(organization_id, 'members.manage'::text)));
create policy memails_insert on public.member_emails as permissive for INSERT to authenticated with check (has_permission(organization_id, 'members.manage'::text));
create policy memails_select on public.member_emails as permissive for SELECT to authenticated using ((is_self(member_id) OR has_permission(organization_id, 'members.manage'::text)));
create policy mfa_delete on public.member_form_answers as permissive for DELETE to authenticated using (has_permission(organization_id, 'members.manage'::text));
create policy mfa_insert on public.member_form_answers as permissive for INSERT to authenticated with check (has_permission(organization_id, 'members.manage'::text));
create policy mfa_select on public.member_form_answers as permissive for SELECT to authenticated using (can_read_member(organization_id, member_id));
create policy mfa_update on public.member_form_answers as permissive for UPDATE to authenticated using (has_permission(organization_id, 'members.manage'::text)) with check (has_permission(organization_id, 'members.manage'::text));
create policy invites_select on public.member_invites as permissive for SELECT to authenticated using (has_permission(organization_id, 'members.manage'::text));
create policy invites_write on public.member_invites as permissive for ALL to authenticated using (has_permission(organization_id, 'members.manage'::text)) with check (has_permission(organization_id, 'members.manage'::text));
create policy pix_select on public.member_pix_keys as permissive for SELECT to authenticated using ((is_self(member_id) OR has_permission(organization_id, 'pix.manage'::text)));
create policy msd_insert on public.member_sensitive_data as permissive for INSERT to authenticated with check ((is_self(member_id) OR has_permission(organization_id, 'members.sensitive.manage'::text)));
create policy msd_select on public.member_sensitive_data as permissive for SELECT to authenticated using (is_self(member_id));
create policy msd_update on public.member_sensitive_data as permissive for UPDATE to authenticated using ((is_self(member_id) OR has_permission(organization_id, 'members.sensitive.manage'::text))) with check ((is_self(member_id) OR has_permission(organization_id, 'members.sensitive.manage'::text)));
create policy members_insert on public.members as permissive for INSERT to authenticated with check (has_permission(organization_id, 'members.manage'::text));
create policy members_select on public.members as permissive for SELECT to authenticated using ((is_org_member(organization_id) AND can_read_member(organization_id, id)));
create policy members_update on public.members as permissive for UPDATE to authenticated using (has_permission(organization_id, 'members.manage'::text)) with check (has_permission(organization_id, 'members.manage'::text));
create policy mc_charges_select on public.monthly_charges as permissive for SELECT to authenticated using ((is_self(member_id) OR has_permission(organization_id, 'billing.read'::text)));
create policy form_uploads_delete on storage.objects as permissive for DELETE to authenticated using (((bucket_id = 'form-uploads'::text) AND has_permission(storage_org(name), 'forms.manage'::text)));
create policy form_uploads_insert on storage.objects as permissive for INSERT to anon, authenticated with check (((bucket_id = 'form-uploads'::text) AND can_upload_form_file(name)));
create policy form_uploads_select on storage.objects as permissive for SELECT to authenticated using (((bucket_id = 'form-uploads'::text) AND has_permission(storage_org(name), 'forms.manage'::text)));
create policy member_photos_delete on storage.objects as permissive for DELETE to authenticated using (((bucket_id = 'member-photos'::text) AND can_edit_member_photo(((storage.foldername(name))[1])::uuid, ((storage.foldername(name))[2])::uuid)));
create policy member_photos_insert on storage.objects as permissive for INSERT to authenticated with check (((bucket_id = 'member-photos'::text) AND can_edit_member_photo(((storage.foldername(name))[1])::uuid, ((storage.foldername(name))[2])::uuid)));
create policy member_photos_read on storage.objects as permissive for SELECT to authenticated using (((bucket_id = 'member-photos'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)));
create policy member_photos_update on storage.objects as permissive for UPDATE to authenticated using (((bucket_id = 'member-photos'::text) AND can_edit_member_photo(((storage.foldername(name))[1])::uuid, ((storage.foldername(name))[2])::uuid)));
create policy org_files_delete on storage.objects as permissive for DELETE to authenticated using (((bucket_id = 'org-files'::text) AND has_permission(storage_org(name), 'repertoire.manage'::text)));
create policy org_files_insert on storage.objects as permissive for INSERT to authenticated with check (((bucket_id = 'org-files'::text) AND has_permission(storage_org(name), 'repertoire.manage'::text)));
create policy org_files_select on storage.objects as permissive for SELECT to authenticated using (((bucket_id = 'org-files'::text) AND (permission_scope_of(storage_org(name), 'repertoire.read'::text) IS NOT NULL)));
create policy org_files_update on storage.objects as permissive for UPDATE to authenticated using (((bucket_id = 'org-files'::text) AND has_permission(storage_org(name), 'repertoire.manage'::text))) with check (((bucket_id = 'org-files'::text) AND has_permission(storage_org(name), 'repertoire.manage'::text)));
create policy shop_images_delete on storage.objects as permissive for DELETE to authenticated using (((bucket_id = 'shop-images'::text) AND has_permission(storage_org(name), 'shop.manage'::text)));
create policy shop_images_insert on storage.objects as permissive for INSERT to authenticated with check (((bucket_id = 'shop-images'::text) AND has_permission(storage_org(name), 'shop.manage'::text)));
create policy shop_images_update on storage.objects as permissive for UPDATE to authenticated using (((bucket_id = 'shop-images'::text) AND has_permission(storage_org(name), 'shop.manage'::text))) with check (((bucket_id = 'shop-images'::text) AND has_permission(storage_org(name), 'shop.manage'::text)));
create policy site_public_delete on storage.objects as permissive for DELETE to authenticated using (((bucket_id = 'site-public'::text) AND has_permission(storage_org(name), 'settings.manage'::text)));
create policy site_public_insert on storage.objects as permissive for INSERT to authenticated with check (((bucket_id = 'site-public'::text) AND has_permission(storage_org(name), 'settings.manage'::text)));
create policy site_public_update on storage.objects as permissive for UPDATE to authenticated using (((bucket_id = 'site-public'::text) AND has_permission(storage_org(name), 'settings.manage'::text))) with check (((bucket_id = 'site-public'::text) AND has_permission(storage_org(name), 'settings.manage'::text)));
create policy settings_insert on public.org_settings as permissive for INSERT to authenticated with check (has_permission(organization_id, 'settings.manage'::text));
create policy settings_select on public.org_settings as permissive for SELECT to authenticated using (is_org_member(organization_id));
create policy settings_update on public.org_settings as permissive for UPDATE to authenticated using (has_permission(organization_id, 'settings.manage'::text)) with check (has_permission(organization_id, 'settings.manage'::text));
create policy org_select on public.organizations as permissive for SELECT to authenticated using (is_org_member(id));
create policy org_update on public.organizations as permissive for UPDATE to authenticated using (has_permission(id, 'org.manage'::text)) with check (has_permission(id, 'org.manage'::text));
create policy page_releases_read on public.page_releases as permissive for SELECT to authenticated using (is_org_member(organization_id));
create policy preq_select on public.participation_requests as permissive for SELECT to authenticated using ((is_self(member_id) OR has_permission(organization_id, 'members.manage'::text)));
create policy permissions_select on public.permissions as permissive for SELECT to authenticated using (true);
create policy race_options_insert on public.race_options as permissive for INSERT to authenticated with check (has_permission(organization_id, 'forms.manage'::text));
create policy race_options_select on public.race_options as permissive for SELECT to authenticated using (is_org_member(organization_id));
create policy race_options_update on public.race_options as permissive for UPDATE to authenticated using (has_permission(organization_id, 'forms.manage'::text)) with check (has_permission(organization_id, 'forms.manage'::text));
create policy reactivation_select on public.reactivation_requests as permissive for SELECT to authenticated using ((is_self(member_id) OR can_decide_reactivation(organization_id, member_id)));
create policy rr_insert on public.recurrence_rules as permissive for INSERT to authenticated with check (has_permission(organization_id, 'events.manage'::text));
create policy rr_select on public.recurrence_rules as permissive for SELECT to authenticated using (has_permission(organization_id, 'events.manage'::text));
create policy rr_update on public.recurrence_rules as permissive for UPDATE to authenticated using (has_permission(organization_id, 'events.manage'::text)) with check (has_permission(organization_id, 'events.manage'::text));
create policy rep_insert on public.repertoires as permissive for INSERT to authenticated with check (has_permission(organization_id, 'repertoire.manage'::text));
create policy rep_select on public.repertoires as permissive for SELECT to authenticated using ((is_org_member(organization_id) AND (permission_scope_of(organization_id, 'repertoire.read'::text) IS NOT NULL) AND (is_active OR has_permission(organization_id, 'repertoire.manage'::text))));
create policy rep_update on public.repertoires as permissive for UPDATE to authenticated using (has_permission(organization_id, 'repertoire.manage'::text)) with check (has_permission(organization_id, 'repertoire.manage'::text));
create policy role_perms_select on public.role_permissions as permissive for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM access_roles r
  WHERE ((r.id = role_permissions.access_role_id) AND is_org_member(r.organization_id)))));
create policy role_perms_write on public.role_permissions as permissive for ALL to authenticated using ((EXISTS ( SELECT 1
   FROM access_roles r
  WHERE ((r.id = role_permissions.access_role_id) AND has_permission(r.organization_id, 'roles.manage'::text))))) with check ((EXISTS ( SELECT 1
   FROM access_roles r
  WHERE ((r.id = role_permissions.access_role_id) AND has_permission(r.organization_id, 'roles.manage'::text)))));
create policy st_insert on public.scholarship_types as permissive for INSERT to authenticated with check (has_permission(organization_id, 'scholarships.manage'::text));
create policy st_select on public.scholarship_types as permissive for SELECT to authenticated using (has_permission(organization_id, 'scholarships.manage'::text));
create policy st_update on public.scholarship_types as permissive for UPDATE to authenticated using (has_permission(organization_id, 'scholarships.manage'::text)) with check (has_permission(organization_id, 'scholarships.manage'::text));
create policy section_cycles_delete on public.section_cycles as permissive for DELETE to authenticated using (has_permission(organization_id, 'structure.manage'::text));
create policy section_cycles_insert on public.section_cycles as permissive for INSERT to authenticated with check (has_permission(organization_id, 'structure.manage'::text));
create policy section_cycles_select on public.section_cycles as permissive for SELECT to authenticated using (is_org_member(organization_id));
create policy section_names_delete on public.section_names as permissive for DELETE to authenticated using (has_permission(organization_id, 'structure.manage'::text));
create policy section_names_insert on public.section_names as permissive for INSERT to authenticated with check (has_permission(organization_id, 'structure.manage'::text));
create policy section_names_select on public.section_names as permissive for SELECT to authenticated using (is_org_member(organization_id));
create policy section_names_update on public.section_names as permissive for UPDATE to authenticated using (has_permission(organization_id, 'structure.manage'::text)) with check (has_permission(organization_id, 'structure.manage'::text));
create policy sections_delete on public.sections as permissive for DELETE to authenticated using (has_permission(organization_id, 'structure.manage'::text));
create policy sections_insert on public.sections as permissive for INSERT to authenticated with check (has_permission(organization_id, 'structure.manage'::text));
create policy sections_select on public.sections as permissive for SELECT to authenticated using (is_org_member(organization_id));
create policy sections_update on public.sections as permissive for UPDATE to authenticated using (has_permission(organization_id, 'structure.manage'::text)) with check (has_permission(organization_id, 'structure.manage'::text));
create policy shop_coupons_del on public.shop_coupons as permissive for DELETE to authenticated using (has_permission(organization_id, 'shop.manage'::text));
create policy shop_coupons_ins on public.shop_coupons as permissive for INSERT to authenticated with check (has_permission(organization_id, 'shop.manage'::text));
create policy shop_coupons_sel on public.shop_coupons as permissive for SELECT to authenticated using (has_permission(organization_id, 'shop.manage'::text));
create policy shop_coupons_upd on public.shop_coupons as permissive for UPDATE to authenticated using (has_permission(organization_id, 'shop.manage'::text)) with check (has_permission(organization_id, 'shop.manage'::text));
create policy shop_outbox_sel on public.shop_email_outbox as permissive for SELECT to authenticated using (has_permission(organization_id, 'shop.manage'::text));
create policy shop_fulf_sel on public.shop_fulfillments as permissive for SELECT to authenticated using (has_permission(organization_id, 'shop.manage'::text));
create policy shop_events_sel on public.shop_order_events as permissive for SELECT to authenticated using (has_permission(organization_id, 'shop.manage'::text));
create policy shop_items_sel on public.shop_order_items as permissive for SELECT to authenticated using (has_permission(organization_id, 'shop.manage'::text));
create policy shop_orders_sel on public.shop_orders as permissive for SELECT to authenticated using (has_permission(organization_id, 'shop.manage'::text));
create policy shop_pp_del on public.shop_pickup_points as permissive for DELETE to authenticated using (has_permission(organization_id, 'shop.manage'::text));
create policy shop_pp_ins on public.shop_pickup_points as permissive for INSERT to authenticated with check (has_permission(organization_id, 'shop.manage'::text));
create policy shop_pp_manage_sel on public.shop_pickup_points as permissive for SELECT to authenticated using (has_permission(organization_id, 'shop.manage'::text));
create policy shop_pp_public on public.shop_pickup_points as permissive for SELECT to anon, authenticated using (is_active);
create policy shop_pp_upd on public.shop_pickup_points as permissive for UPDATE to authenticated using (has_permission(organization_id, 'shop.manage'::text)) with check (has_permission(organization_id, 'shop.manage'::text));
create policy shop_img_del on public.shop_product_images as permissive for DELETE to authenticated using (has_permission(organization_id, 'shop.manage'::text));
create policy shop_img_ins on public.shop_product_images as permissive for INSERT to authenticated with check (has_permission(organization_id, 'shop.manage'::text));
create policy shop_img_manage_sel on public.shop_product_images as permissive for SELECT to authenticated using (has_permission(organization_id, 'shop.manage'::text));
create policy shop_img_public on public.shop_product_images as permissive for SELECT to anon, authenticated using ((EXISTS ( SELECT 1
   FROM shop_products p
  WHERE ((p.id = shop_product_images.product_id) AND p.is_active AND (NOT p.is_hidden)))));
create policy shop_img_upd on public.shop_product_images as permissive for UPDATE to authenticated using (has_permission(organization_id, 'shop.manage'::text)) with check (has_permission(organization_id, 'shop.manage'::text));
create policy shop_pk_del on public.shop_product_pickups as permissive for DELETE to authenticated using (has_permission(organization_id, 'shop.manage'::text));
create policy shop_pk_ins on public.shop_product_pickups as permissive for INSERT to authenticated with check (has_permission(organization_id, 'shop.manage'::text));
create policy shop_pk_sel on public.shop_product_pickups as permissive for SELECT to authenticated using (has_permission(organization_id, 'shop.manage'::text));
create policy shop_pk_upd on public.shop_product_pickups as permissive for UPDATE to authenticated using (has_permission(organization_id, 'shop.manage'::text)) with check (has_permission(organization_id, 'shop.manage'::text));
create policy shop_var_del on public.shop_product_variants as permissive for DELETE to authenticated using (has_permission(organization_id, 'shop.manage'::text));
create policy shop_var_ins on public.shop_product_variants as permissive for INSERT to authenticated with check (has_permission(organization_id, 'shop.manage'::text));
create policy shop_var_manage_sel on public.shop_product_variants as permissive for SELECT to authenticated using (has_permission(organization_id, 'shop.manage'::text));
create policy shop_var_public on public.shop_product_variants as permissive for SELECT to anon, authenticated using ((is_active AND (EXISTS ( SELECT 1
   FROM shop_products p
  WHERE ((p.id = shop_product_variants.product_id) AND p.is_active AND (NOT p.is_hidden))))));
create policy shop_var_upd on public.shop_product_variants as permissive for UPDATE to authenticated using (has_permission(organization_id, 'shop.manage'::text)) with check (has_permission(organization_id, 'shop.manage'::text));
create policy shop_prod_ins on public.shop_products as permissive for INSERT to authenticated with check (has_permission(organization_id, 'shop.manage'::text));
create policy shop_prod_manage_sel on public.shop_products as permissive for SELECT to authenticated using (has_permission(organization_id, 'shop.manage'::text));
create policy shop_prod_public on public.shop_products as permissive for SELECT to anon, authenticated using ((is_active AND (NOT is_hidden)));
create policy shop_prod_upd on public.shop_products as permissive for UPDATE to authenticated using (has_permission(organization_id, 'shop.manage'::text)) with check (has_permission(organization_id, 'shop.manage'::text));
create policy shop_settings_ins on public.shop_settings as permissive for INSERT to authenticated with check (has_permission(organization_id, 'shop.manage'::text));
create policy shop_settings_sel on public.shop_settings as permissive for SELECT to authenticated using (has_permission(organization_id, 'shop.manage'::text));
create policy shop_settings_upd on public.shop_settings as permissive for UPDATE to authenticated using (has_permission(organization_id, 'shop.manage'::text)) with check (has_permission(organization_id, 'shop.manage'::text));
create policy shop_si_ins on public.shop_stock_items as permissive for INSERT to authenticated with check (has_permission(organization_id, 'shop.manage'::text));
create policy shop_si_sel on public.shop_stock_items as permissive for SELECT to authenticated using (has_permission(organization_id, 'shop.manage'::text));
create policy shop_si_upd on public.shop_stock_items as permissive for UPDATE to authenticated using (has_permission(organization_id, 'shop.manage'::text)) with check (has_permission(organization_id, 'shop.manage'::text));
create policy shop_vs_del on public.shop_variant_stock as permissive for DELETE to authenticated using (has_permission(organization_id, 'shop.manage'::text));
create policy shop_vs_ins on public.shop_variant_stock as permissive for INSERT to authenticated with check (has_permission(organization_id, 'shop.manage'::text));
create policy shop_vs_sel on public.shop_variant_stock as permissive for SELECT to authenticated using (has_permission(organization_id, 'shop.manage'::text));
create policy shop_vs_upd on public.shop_variant_stock as permissive for UPDATE to authenticated using (has_permission(organization_id, 'shop.manage'::text)) with check (has_permission(organization_id, 'shop.manage'::text));
create policy albums_delete on public.site_albums as permissive for DELETE to authenticated using (has_permission(organization_id, 'settings.manage'::text));
create policy albums_insert on public.site_albums as permissive for INSERT to authenticated with check (has_permission(organization_id, 'settings.manage'::text));
create policy albums_select on public.site_albums as permissive for SELECT to authenticated using (has_permission(organization_id, 'settings.manage'::text));
create policy albums_update on public.site_albums as permissive for UPDATE to authenticated using (has_permission(organization_id, 'settings.manage'::text)) with check (has_permission(organization_id, 'settings.manage'::text));
create policy site_insert on public.site_settings as permissive for INSERT to authenticated with check (has_permission(organization_id, 'settings.manage'::text));
create policy site_select on public.site_settings as permissive for SELECT to authenticated using (has_permission(organization_id, 'settings.manage'::text));
create policy site_update on public.site_settings as permissive for UPDATE to authenticated using (has_permission(organization_id, 'settings.manage'::text)) with check (has_permission(organization_id, 'settings.manage'::text));
create policy skill_levels_insert on public.skill_levels as permissive for INSERT to authenticated with check (has_permission(organization_id, 'structure.manage'::text));
create policy skill_levels_select on public.skill_levels as permissive for SELECT to authenticated using (is_org_member(organization_id));
create policy skill_levels_update on public.skill_levels as permissive for UPDATE to authenticated using (has_permission(organization_id, 'structure.manage'::text)) with check (has_permission(organization_id, 'structure.manage'::text));
create policy social_networks_insert on public.social_networks as permissive for INSERT to authenticated with check (has_permission(organization_id, 'forms.manage'::text));
create policy social_networks_select on public.social_networks as permissive for SELECT to authenticated using (is_org_member(organization_id));
create policy social_networks_update on public.social_networks as permissive for UPDATE to authenticated using (has_permission(organization_id, 'forms.manage'::text)) with check (has_permission(organization_id, 'forms.manage'::text));
create policy att_insert on public.song_attachments as permissive for INSERT to authenticated with check (has_permission(organization_id, 'repertoire.manage'::text));
create policy att_select on public.song_attachments as permissive for SELECT to authenticated using ((is_org_member(organization_id) AND (permission_scope_of(organization_id, 'repertoire.read'::text) IS NOT NULL) AND (is_active OR has_permission(organization_id, 'repertoire.manage'::text))));
create policy att_update on public.song_attachments as permissive for UPDATE to authenticated using (has_permission(organization_id, 'repertoire.manage'::text)) with check (has_permission(organization_id, 'repertoire.manage'::text));
create policy song_insert on public.songs as permissive for INSERT to authenticated with check (has_permission(organization_id, 'repertoire.manage'::text));
create policy song_select on public.songs as permissive for SELECT to authenticated using ((is_org_member(organization_id) AND (permission_scope_of(organization_id, 'repertoire.read'::text) IS NOT NULL) AND (is_active OR has_permission(organization_id, 'repertoire.manage'::text))));
create policy song_update on public.songs as permissive for UPDATE to authenticated using (has_permission(organization_id, 'repertoire.manage'::text)) with check (has_permission(organization_id, 'repertoire.manage'::text));
create policy staff_assign_insert on public.staff_assignments as permissive for INSERT to authenticated with check (has_permission(organization_id, 'staff_assignments.manage'::text));
create policy staff_assign_select on public.staff_assignments as permissive for SELECT to authenticated using ((is_self(member_id) OR has_permission(organization_id, 'staff_assignments.manage'::text)));
create policy staff_assign_update on public.staff_assignments as permissive for UPDATE to authenticated using (has_permission(organization_id, 'staff_assignments.manage'::text)) with check (has_permission(organization_id, 'staff_assignments.manage'::text));
create policy staff_group_rules_del on public.staff_group_rules as permissive for DELETE to authenticated using (has_permission(organization_id, 'finance.manage'::text));
create policy staff_group_rules_ins on public.staff_group_rules as permissive for INSERT to authenticated with check (has_permission(organization_id, 'finance.manage'::text));
create policy staff_group_rules_sel on public.staff_group_rules as permissive for SELECT to authenticated using (has_permission(organization_id, 'finance.read'::text));
create policy staff_group_rules_upd on public.staff_group_rules as permissive for UPDATE to authenticated using (has_permission(organization_id, 'finance.manage'::text)) with check (has_permission(organization_id, 'finance.manage'::text));
create policy staff_pay_hours_del on public.staff_pay_hours as permissive for DELETE to authenticated using (has_permission(organization_id, 'finance.manage'::text));
create policy staff_pay_hours_ins on public.staff_pay_hours as permissive for INSERT to authenticated with check (has_permission(organization_id, 'finance.manage'::text));
create policy staff_pay_hours_sel on public.staff_pay_hours as permissive for SELECT to authenticated using (has_permission(organization_id, 'finance.read'::text));
create policy staff_pay_hours_upd on public.staff_pay_hours as permissive for UPDATE to authenticated using (has_permission(organization_id, 'finance.manage'::text)) with check (has_permission(organization_id, 'finance.manage'::text));
create policy spr_delete on public.staff_pay_rules as permissive for DELETE to authenticated using (has_permission(organization_id, 'finance.manage'::text));
create policy spr_insert on public.staff_pay_rules as permissive for INSERT to authenticated with check (has_permission(organization_id, 'finance.manage'::text));
create policy spr_select on public.staff_pay_rules as permissive for SELECT to authenticated using (has_permission(organization_id, 'finance.read'::text));
create policy spr_update on public.staff_pay_rules as permissive for UPDATE to authenticated using (has_permission(organization_id, 'finance.manage'::text)) with check (has_permission(organization_id, 'finance.manage'::text));
create policy sp_select on public.staff_payments as permissive for SELECT to authenticated using ((is_self(member_id) OR has_permission(organization_id, 'staff_payments.read'::text)));
create policy supcat_insert on public.supplier_categories as permissive for INSERT to authenticated with check (has_permission(organization_id, 'suppliers.manage'::text));
create policy supcat_select on public.supplier_categories as permissive for SELECT to authenticated using ((is_org_member(organization_id) AND (permission_scope_of(organization_id, 'suppliers.read'::text) IS NOT NULL) AND (is_active OR has_permission(organization_id, 'suppliers.manage'::text))));
create policy supcat_update on public.supplier_categories as permissive for UPDATE to authenticated using (has_permission(organization_id, 'suppliers.manage'::text)) with check (has_permission(organization_id, 'suppliers.manage'::text));
create policy sup_insert on public.suppliers as permissive for INSERT to authenticated with check (has_permission(organization_id, 'suppliers.manage'::text));
create policy sup_select on public.suppliers as permissive for SELECT to authenticated using ((is_org_member(organization_id) AND (permission_scope_of(organization_id, 'suppliers.read'::text) IS NOT NULL) AND (is_active OR has_permission(organization_id, 'suppliers.manage'::text))));
create policy sup_update on public.suppliers as permissive for UPDATE to authenticated using (has_permission(organization_id, 'suppliers.manage'::text)) with check (has_permission(organization_id, 'suppliers.manage'::text));

-- ============ Permissões em tabelas e views ============
grant INSERT, SELECT, UPDATE on table public.access_roles to authenticated;
grant INSERT, SELECT, UPDATE on table public.activities to authenticated;
grant DELETE, INSERT, SELECT on table public.activity_audiences to authenticated;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.activity_checklist_items to service_role;
grant DELETE, INSERT, SELECT on table public.activity_item_cancellations to authenticated;
grant DELETE, INSERT, SELECT on table public.activity_type_links to authenticated;
grant INSERT, SELECT, UPDATE on table public.activity_types to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public.artistic_functions to authenticated;
grant INSERT, SELECT, UPDATE on table public.attendance_statuses to authenticated;
grant SELECT on table public.audit_logs to authenticated;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.backups to service_role;
grant SELECT on table public.charge_adjustments to authenticated;
grant INSERT, SELECT, UPDATE on table public.checklist_template_items to authenticated;
grant INSERT, SELECT, UPDATE on table public.checklist_templates to authenticated;
grant INSERT, SELECT, UPDATE on table public.consent_records to authenticated;
grant DELETE, INSERT, SELECT on table public.cycle_extra_categories to authenticated;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.cycle_fee_assignments to anon;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.cycle_participations to anon;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.cycle_scholarships to anon;
grant INSERT, SELECT, UPDATE on table public.cycle_types to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public.cycles to authenticated;
grant INSERT, SELECT, UPDATE on table public.distribution_destinations to authenticated;
grant DELETE, INSERT, SELECT on table public.drive_folder_access to authenticated;
grant SELECT on table public.drive_folder_shares to authenticated;
grant INSERT, SELECT, UPDATE on table public.drive_folders to authenticated;
grant SELECT on table public.email_requests to authenticated;
grant SELECT on table public.event_attendance to authenticated;
grant INSERT, SELECT, UPDATE on table public.fee_categories to authenticated;
grant SELECT on table public.fee_cycle_exempt to authenticated;
grant SELECT on table public.fee_cycle_prices to authenticated;
grant INSERT, SELECT, UPDATE on table public.finance_categories to authenticated;
grant SELECT on table public.financial_entries to authenticated;
grant SELECT on table public.form_email_outbox to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public.form_fields to authenticated;
grant INSERT, SELECT, UPDATE on table public.form_list_items to authenticated;
grant INSERT, SELECT, UPDATE on table public.form_lists to authenticated;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.form_section_templates to service_role;
grant INSERT, SELECT, UPDATE on table public.form_send_defaults to authenticated;
grant SELECT on table public.form_submission_files to authenticated;
grant SELECT on table public.form_submissions to authenticated;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.form_submit_attempts to service_role;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.form_upload_tokens to service_role;
grant SELECT on table public.form_versions to authenticated;
grant INSERT, SELECT, UPDATE on table public.forms to authenticated;
grant INSERT, SELECT, UPDATE on table public.gender_options to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public.holidays to authenticated;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.infinitepay_transactions to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public.instrument_cycle_capacity to authenticated;
grant INSERT, SELECT, UPDATE on table public.instrument_cycle_workshop to authenticated;
grant DELETE, INSERT, SELECT on table public.instrument_cycles to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public.instruments to authenticated;
grant INSERT, SELECT, UPDATE on table public.integrations to authenticated;
grant INSERT, SELECT, UPDATE on table public.member_access_roles to authenticated;
grant INSERT, SELECT, UPDATE on table public.member_artistic_links to authenticated;
grant SELECT on table public.member_cycle_status_history to authenticated;
grant INSERT, SELECT, UPDATE on table public.member_cycle_statuses to authenticated;
grant SELECT on table public.member_cycles to authenticated;
grant DELETE, INSERT, SELECT on table public.member_emails to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public.member_form_answers to authenticated;
grant INSERT, SELECT, UPDATE on table public.member_invites to authenticated;
grant SELECT on table public.member_pix_keys to authenticated;
grant INSERT, SELECT, UPDATE on table public.member_sensitive_data to authenticated;
grant INSERT, SELECT, UPDATE on table public.members to authenticated;
grant SELECT on table public.monthly_charges to authenticated;
grant INSERT, SELECT, UPDATE on table public.org_settings to authenticated;
grant SELECT, UPDATE on table public.organizations to authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.page_releases to authenticated;
grant SELECT on table public.participation_requests to authenticated;
grant SELECT on table public.permissions to authenticated;
grant INSERT, SELECT, UPDATE on table public.race_options to authenticated;
grant SELECT on table public.reactivation_requests to authenticated;
grant INSERT, SELECT, UPDATE on table public.recurrence_rules to authenticated;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.recurrence_skips to service_role;
grant INSERT, SELECT, UPDATE on table public.repertoires to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public.role_permissions to authenticated;
grant INSERT, SELECT, UPDATE on table public.scholarship_types to authenticated;
grant DELETE, INSERT, SELECT on table public.section_cycles to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public.section_names to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public.sections to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public.shop_coupons to authenticated;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.shop_email_outbox to service_role;
grant SELECT on table public.shop_fulfillments to authenticated;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.shop_lookup_attempts to service_role;
grant SELECT on table public.shop_order_events to authenticated;
grant SELECT on table public.shop_order_items to authenticated;
grant SELECT on table public.shop_orders to authenticated;
grant SELECT on table public.shop_pickup_points to anon;
grant SELECT on table public.shop_product_images to anon;
grant DELETE, INSERT, SELECT, UPDATE on table public.shop_product_pickups to authenticated;
grant SELECT on table public.shop_product_variants to anon;
grant SELECT on table public.shop_products to anon;
grant INSERT, SELECT, UPDATE on table public.shop_settings to authenticated;
grant INSERT, SELECT, UPDATE on table public.shop_stock_items to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public.shop_variant_stock to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public.site_albums to authenticated;
grant INSERT, SELECT, UPDATE on table public.site_settings to authenticated;
grant INSERT, SELECT, UPDATE on table public.skill_levels to authenticated;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.social_networks to anon;
grant INSERT, SELECT, UPDATE on table public.song_attachments to authenticated;
grant INSERT, SELECT, UPDATE on table public.songs to authenticated;
grant INSERT, SELECT, UPDATE on table public.staff_assignments to authenticated;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.staff_group_rules to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public.staff_pay_hours to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public.staff_pay_rules to authenticated;
grant SELECT on table public.staff_payments to authenticated;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.storage_delete_queue to service_role;
grant INSERT, SELECT, UPDATE on table public.supplier_categories to authenticated;
grant INSERT, SELECT, UPDATE on table public.suppliers to authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.v_attendance_member_cycle to authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.v_billing_summary to authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.v_finance_ledger to authenticated;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.v_instrument_cycle_overview to service_role;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.v_member_directory to service_role;

-- ============ Permissões em funções ============
grant execute on function public.add_checklist_item(p_activity uuid, p_title text) to authenticated;
grant execute on function public.adjust_charge(p_charge uuid, p_new_amount numeric, p_reason text) to authenticated;
grant execute on function public.apply_checklist_template(p_activity uuid, p_template uuid) to authenticated;
grant execute on function public.approve_submission(p_id uuid, p_notes text, p_cycle_status text) to authenticated;
grant execute on function public.attendance_report_f(p_org uuid, p_from date, p_to date, p_group text, p_section uuid, p_instrument uuid, p_month text) to authenticated;
grant execute on function public.begin_form_upload(p_org_slug text, p_form_slug text) to authenticated;
grant execute on function public.birthday_list(p_org uuid) to authenticated;
grant execute on function public.caller_is_titular(p_org uuid) to authenticated;
grant execute on function public.can_decide_reactivation(p_org uuid, p_member uuid) to authenticated;
grant execute on function public.can_edit_member_photo(p_org uuid, p_member uuid) to authenticated;
grant execute on function public.can_read_member(p_org uuid, p_member uuid) to authenticated;
grant execute on function public.can_record_attendance_for(p_org uuid, p_member uuid) to authenticated;
grant execute on function public.can_see_drive_folder(p_folder uuid) to authenticated;
grant execute on function public.can_upload_form_file(p_name text) to anon;
grant execute on function public.cancel_financial_entry(p_entry uuid, p_reason text) to authenticated;
grant execute on function public.cancel_staff_payment(p_payment uuid, p_reason text) to authenticated;
grant execute on function public.change_charge_status(p_charge uuid, p_status text, p_notes text) to authenticated;
grant execute on function public.charge_for_payment(p_code text) to service_role;
grant execute on function public.charge_mark_paid_by_link(p_code text, p_ref jsonb) to service_role;
grant execute on function public.charge_note_divergence(p_code text, p_ref jsonb) to service_role;
grant execute on function public.charge_pay_info(p_charge uuid) to authenticated;
grant execute on function public.charge_set_pay_link(p_charge uuid, p_url text) to authenticated;
grant execute on function public.clear_attendance(p_activity uuid, p_member uuid) to authenticated;
grant execute on function public.copy_cycle_setup(p_from uuid, p_to uuid) to authenticated;
grant execute on function public.create_backup(p_org uuid, p_label text) to authenticated;
grant execute on function public.create_staff_payment(p_member uuid, p_competence date, p_destination uuid, p_amount numeric, p_due_on date, p_notes text) to authenticated;
grant execute on function public.current_member_id(p_org uuid) to authenticated;
grant execute on function public.cycle_blockers(p_cycle uuid) to authenticated;
grant execute on function public.dashboard_direction(p_org uuid) to authenticated;
grant execute on function public.decide_reactivation(p_request uuid, p_approve boolean, p_note text, p_force boolean) to authenticated;
grant execute on function public.delete_activity(p_activity uuid) to authenticated;
grant execute on function public.delete_backup(p_backup uuid) to authenticated;
grant execute on function public.delete_cycle_cascade(p_cycle uuid) to authenticated;
grant execute on function public.delete_recurrence(p_rule uuid) to authenticated;
grant execute on function public.delete_section_template(p_template uuid) to authenticated;
grant execute on function public.drive_integration_config(p_org uuid) to authenticated;
grant execute on function public.drive_sync_context(p_folder uuid) to authenticated;
grant execute on function public.drive_sync_record(p_folder uuid, p_added jsonb, p_removed jsonb, p_summary jsonb) to authenticated;
grant execute on function public.duplicate_form(p_form uuid) to authenticated;
grant execute on function public.duplicate_section_template(p_template uuid, p_name text) to authenticated;
grant execute on function public.end_recurrence(p_rule uuid) to authenticated;
grant execute on function public.finance_month_summary(p_org uuid, p_competence date) to authenticated;
grant execute on function public.form_mail_claim(p_limit integer) to service_role;
grant execute on function public.form_mail_done(p_id uuid, p_ok boolean, p_error text) to service_role;
grant execute on function public.form_vars(p_form uuid) to authenticated;
grant execute on function public.generate_monthly_charges(p_org uuid, p_competence date) to authenticated;
grant execute on function public.generate_recurrence_day(p_rule uuid, p_date date) to authenticated;
grant execute on function public.get_attendance_roster(p_activity uuid) to authenticated;
grant execute on function public.get_backup_data(p_backup uuid) to authenticated;
grant execute on function public.get_member_sensitive(p_member uuid) to authenticated;
grant execute on function public.get_my_memberships() to authenticated;
grant execute on function public.get_public_albums(p_slug text) to authenticated;
grant execute on function public.get_public_form(p_org_slug text, p_form_slug text) to authenticated;
grant execute on function public.get_public_org(p_slug text) to authenticated;
grant execute on function public.get_public_site(p_slug text) to authenticated;
grant execute on function public.give_up_collaboration(p_link uuid) to authenticated;
grant execute on function public.grant_access_role(p_member uuid, p_role_key text) to authenticated;
grant execute on function public.group_scoped_permissions() to authenticated;
grant execute on function public.has_permission(p_org uuid, p_perm text) to authenticated;
grant execute on function public.import_backup(p_org uuid, p_label text, p_data jsonb) to authenticated;
grant execute on function public.infinitepay_claim_transaction(p_tx text, p_kind text, p_code text) to service_role;
grant execute on function public.insert_section_template(p_form uuid, p_template uuid) to authenticated;
grant execute on function public.instrument_occupied(p_instrument uuid, p_cycle uuid) to authenticated;
grant execute on function public.is_in_my_group(p_org uuid, p_member uuid) to authenticated;
grant execute on function public.is_org_member(p_org uuid) to authenticated;
grant execute on function public.is_self(p_member uuid) to authenticated;
grant execute on function public.is_staff(p_org uuid) to authenticated;
grant execute on function public.link_list_to_levels(p_list uuid) to authenticated;
grant execute on function public.link_my_member_by_email() to authenticated;
grant execute on function public.list_backups(p_org uuid) to authenticated;
grant execute on function public.list_member_categories(p_org uuid, p_cycle uuid) to authenticated;
grant execute on function public.locked_permissions() to authenticated;
grant execute on function public.log_sensitive_access(p_member uuid) to authenticated;
grant execute on function public.mark_charge_paid(p_charge uuid, p_paid_on date, p_method text) to authenticated;
grant execute on function public.mark_staff_payment_paid(p_payment uuid, p_paid_on date, p_method text, p_pix text) to authenticated;
grant execute on function public.materialize_recurrences(p_org uuid, p_until date) to authenticated;
grant execute on function public.member_directory_active(p_org uuid) to authenticated;
grant execute on function public.member_photos(p_org uuid) to authenticated;
grant execute on function public.my_participation(p_member uuid) to authenticated;
grant execute on function public.my_submission_info() to authenticated;
grant execute on function public.my_submission_status() to authenticated;
grant execute on function public.permission_scope_of(p_org uuid, p_perm text) to authenticated;
grant execute on function public.post_financial_entry(p_org uuid, p_category uuid, p_description text, p_amount numeric, p_occurred_on date, p_notes text) to authenticated;
grant execute on function public.publish_form(p_form uuid) to authenticated;
grant execute on function public.purge_form(p_form uuid) to authenticated;
grant execute on function public.purge_old_submissions(p_org uuid) to authenticated;
grant execute on function public.purge_trashed(p_table text, p_id uuid) to authenticated;
grant execute on function public.refresh_current_cycle(p_org uuid) to authenticated;
grant execute on function public.reject_submission(p_id uuid, p_message text) to authenticated;
grant execute on function public.remove_checklist_item(p_item uuid) to authenticated;
grant execute on function public.reorder_checklist(p_activity uuid, p_ids uuid[]) to authenticated;
grant execute on function public.replicate_cycle_prices(p_cycle uuid) to authenticated;
grant execute on function public.request_extra_email(p_member uuid, p_email text) to authenticated;
grant execute on function public.request_participation_change(p_member uuid, p_kind text, p_action text, p_instrument uuid, p_function uuid, p_link uuid, p_note text) to authenticated;
grant execute on function public.request_reactivation(p_org uuid, p_message text) to authenticated;
grant execute on function public.require_billing(p_org uuid) to authenticated;
grant execute on function public.require_finance(p_org uuid, p_perm text) to authenticated;
grant execute on function public.reset_section_from_template(p_section uuid) to authenticated;
grant execute on function public.restore_activity(p_activity uuid) to authenticated;
grant execute on function public.restore_backup(p_backup uuid) to authenticated;
grant execute on function public.review_email_request(p_id uuid, p_approve boolean) to authenticated;
grant execute on function public.review_participation_request(p_id uuid, p_approve boolean) to authenticated;
grant execute on function public.review_submission(p_id uuid, p_status text, p_notes text) to authenticated;
grant execute on function public.revoke_access_role(p_member uuid, p_role_key text) to authenticated;
grant execute on function public.save_drive_integration(p_org uuid, p_folder text, p_active boolean) to authenticated;
grant execute on function public.save_member_sensitive(p_member uuid, p_gender text, p_is_trans boolean, p_race_color text, p_is_pcd boolean, p_pcd_description text) to authenticated;
grant execute on function public.save_section_as_template(p_section uuid, p_name text) to authenticated;
grant execute on function public.save_submission_notes(p_id uuid, p_notes text) to authenticated;
grant execute on function public.scholarship_indicators(p_org uuid, p_cycle uuid) to authenticated;
grant execute on function public.set_attendance(p_activity uuid, p_member uuid, p_status_key text, p_notes text) to authenticated;
grant execute on function public.set_checklist_name(p_activity uuid, p_name text) to authenticated;
grant execute on function public.set_cycle_exempt(p_function uuid, p_cycle uuid, p_exempt boolean) to authenticated;
grant execute on function public.set_cycle_fee_price(p_category uuid, p_cycle uuid, p_amount numeric) to authenticated;
grant execute on function public.set_cycle_scholarship(p_member uuid, p_cycle uuid, p_percent numeric, p_type uuid, p_reason text) to authenticated;
grant execute on function public.set_drive_integration_active(p_org uuid, p_active boolean) to authenticated;
grant execute on function public.set_member_cycle_status(p_member uuid, p_cycle uuid, p_status_key text, p_notes text, p_waitlist_instrument uuid, p_force boolean) to authenticated;
grant execute on function public.set_member_photo(p_member uuid, p_path text) to authenticated;
grant execute on function public.set_my_skill_level(p_link uuid, p_level uuid) to authenticated;
grant execute on function public.set_org_founded(p_org uuid, p_date date) to authenticated;
grant execute on function public.set_org_logo(p_org uuid, p_path text) to authenticated;
grant execute on function public.set_page_releases(p_org uuid, p_changes jsonb) to authenticated;
grant execute on function public.set_pix_key(p_member uuid, p_type text, p_value text) to authenticated;
grant execute on function public.set_role_permission(p_org uuid, p_role_key text, p_permission text, p_scope text) to authenticated;
grant execute on function public.shop_admin_archive_finished(p_org uuid) to authenticated;
grant execute on function public.shop_admin_archive_order(p_order uuid, p_archive boolean) to authenticated;
grant execute on function public.shop_admin_cancel_order(p_order uuid, p_reason text) to authenticated;
grant execute on function public.shop_admin_mark_paid(p_order uuid) to authenticated;
grant execute on function public.shop_admin_reactivate_order(p_order uuid) to authenticated;
grant execute on function public.shop_admin_set_fulfillment(p_order uuid, p_kind text, p_status text) to authenticated;
grant execute on function public.shop_cancel_by_customer(p_org uuid, p_user uuid, p_email text, p_code text, p_phone text) to service_role;
grant execute on function public.shop_cancel_order(p_order uuid, p_reason text, p_actor_member uuid, p_actor_label text) to service_role;
grant execute on function public.shop_change_method(p_org uuid, p_user uuid, p_email text, p_code text, p_phone text, p_method text) to service_role;
grant execute on function public.shop_coupon_check(p_slug text, p_code text) to authenticated;
grant execute on function public.shop_create_order(p_org uuid, p_user uuid, p_name text, p_phone text, p_email text, p_pickup uuid, p_method text, p_items jsonb, p_hours integer, p_coupon text) to service_role;
grant execute on function public.shop_get_public_store(p_slug text) to authenticated;
grant execute on function public.shop_get_settings(p_org uuid) to service_role;
grant execute on function public.shop_mail_claim(p_limit integer) to service_role;
grant execute on function public.shop_mail_done(p_id uuid, p_ok boolean, p_error text) to service_role;
grant execute on function public.shop_mark_paid(p_code text, p_via text, p_actor_member uuid, p_actor_label text, p_ref jsonb) to service_role;
grant execute on function public.shop_my_contact(p_org uuid) to authenticated;
grant execute on function public.shop_my_is_special(p_org uuid) to authenticated;
grant execute on function public.shop_my_member_id(p_org uuid) to authenticated;
grant execute on function public.shop_order_by_request(p_org uuid, p_request uuid) to service_role;
grant execute on function public.shop_order_for_payment(p_code text) to service_role;
grant execute on function public.shop_order_lookup(p_code text, p_phone text) to service_role;
grant execute on function public.shop_order_owned(p_org uuid, p_user uuid, p_email text, p_code text) to service_role;
grant execute on function public.shop_order_status(p_code text, p_phone text) to service_role;
grant execute on function public.shop_order_view(p_id uuid) to service_role;
grant execute on function public.shop_orders_of_user(p_org uuid, p_user uuid, p_email text) to service_role;
grant execute on function public.shop_org_id(p_slug text) to service_role;
grant execute on function public.shop_rate_limit(p_bucket text, p_max integer, p_window interval) to service_role;
grant execute on function public.shop_set_order_owner(p_code text, p_user uuid, p_request uuid) to service_role;
grant execute on function public.shop_set_payment_ref(p_code text, p_ref jsonb) to service_role;
grant execute on function public.storage_org(p_name text) to public;
grant execute on function public.structure_in_use(p_cycle uuid) to authenticated;
grant execute on function public.submit_public_form(p_org_slug text, p_form_slug text, p_answers jsonb, p_consent boolean, p_hp text, p_upload_token uuid, p_files jsonb) to anon;
grant execute on function public.todays_birthdays(p_org uuid, p_date date) to authenticated;
grant execute on function public.transfer_titular(p_org uuid, p_to_member uuid) to authenticated;
grant execute on function public.trash_activity(p_activity uuid) to authenticated;
grant execute on function public.update_checklist_item(p_item uuid, p_status text, p_notes text, p_assignee uuid, p_set_assignee boolean, p_title text) to authenticated;
grant execute on function public.update_my_profile(p_member uuid, p_patch jsonb) to authenticated;

-- ============ Storage: buckets ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('form-uploads', 'form-uploads', false, 5242880, '{application/pdf,image/png,image/jpeg,image/webp}'::text[]) on conflict (id) do update set public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('member-photos', 'member-photos', false, 1048576, '{image/webp,image/jpeg,image/png}'::text[]) on conflict (id) do update set public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('org-files', 'org-files', false, 26214400, '{application/pdf,image/png,image/jpeg,image/webp,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,video/mp4}'::text[]) on conflict (id) do update set public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('shop-images', 'shop-images', true, 5242880, '{image/png,image/jpeg,image/webp}'::text[]) on conflict (id) do update set public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('site-public', 'site-public', true, 5242880, '{image/png,image/jpeg,image/webp,image/svg+xml}'::text[]) on conflict (id) do update set public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

-- ============ Agendamentos (pg_cron) ============
select cron.schedule('daily-privacy-maintenance', '15 6 * * *', 'select public.daily_privacy_maintenance()');
select cron.schedule('shop-expire-orders', '*/15 * * * *', 'select public.shop_expire_orders()');

-- ============ Permissões padrão (referência) ============
-- default privileges: schema=extensions role=supabase_admin tipo=S acl={postgres=r*w*U*/supabase_admin}
