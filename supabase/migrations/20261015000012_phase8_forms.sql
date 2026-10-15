-- SIGBloco · Fase 8 · Formulários públicos de inscrição.
-- Segurança: o público (anon) NÃO lê nem escreve tabelas; só executa 3 RPCs (ver formulário, pedir token de upload, enviar).
-- Toda validação roda no servidor contra o SNAPSHOT da versão publicada (respostas antigas continuam interpretáveis).
-- Respostas ficam em form_submissions (Direção); aprovação cria o integrante a partir do mapeamento de campos.
-- Arquivos: bucket privado `form-uploads`, upload anônimo somente com token temporário; leitura só pela Direção.
-- Respostas contêm dados pessoais/sensíveis: NÃO há trigger de auditoria nelas (evita duplicar conteúdo no log); as ações são registradas explicitamente.

create table public.forms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  title text not null check (length(trim(title)) > 0),
  description text,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  cycle_id uuid,
  status text not null default 'draft' check (status in ('draft', 'published', 'closed', 'archived')),
  opens_at timestamptz, closes_at timestamptz,
  confirmation_message text not null default 'Inscrição recebida! Entraremos em contato.',
  max_responses int check (max_responses is null or max_responses > 0),
  privacy_text text,
  requires_consent boolean not null default true,
  prevent_duplicates boolean not null default true,
  published_version_id uuid,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, id), unique (organization_id, slug),
  foreign key (organization_id, cycle_id) references public.cycles (organization_id, id),
  check (opens_at is null or closes_at is null or closes_at > opens_at),
  check (status <> 'published' or published_version_id is not null)
);
create trigger trg_forms_updated before update on public.forms for each row execute function public.set_updated_at();

create table public.form_fields (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, form_id uuid not null,
  field_key text not null check (field_key ~ '^[a-z][a-z0-9_]{0,40}$'),
  label text not null check (length(trim(label)) > 0),
  description text,
  field_type text not null check (field_type in ('short_text', 'long_text', 'email', 'phone', 'number', 'date', 'single_select', 'multi_select', 'checkbox', 'yes_no', 'scale', 'file', 'info')),
  required boolean not null default false,
  sort_order int not null default 0,
  options jsonb not null default '[]'::jsonb,
  default_value text,
  validation jsonb not null default '{}'::jsonb,
  condition jsonb,
  member_mapping text check (member_mapping in (
    'member.full_name', 'member.display_name', 'member.email', 'member.phone', 'member.social_handle', 'member.birth_date',
    'member.affective_relation', 'member.played_other_blocks', 'member.other_blocks',
    'sensitive.gender', 'sensitive.is_trans', 'sensitive.race_color', 'sensitive.is_pcd', 'sensitive.pcd_description',
    'link.instrument', 'link.function', 'link.skill_level')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (form_id, field_key), unique (organization_id, id),
  foreign key (organization_id, form_id) references public.forms (organization_id, id)
);
create index form_fields_form_idx on public.form_fields (form_id, sort_order);

create table public.form_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, form_id uuid not null,
  version int not null, snapshot jsonb not null,
  published_by uuid default auth.uid(), published_at timestamptz not null default now(),
  unique (form_id, version), unique (organization_id, id),
  foreign key (organization_id, form_id) references public.forms (organization_id, id)
);
alter table public.forms add foreign key (published_version_id) references public.form_versions (id);

create table public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, form_id uuid not null, form_version_id uuid not null,
  answers jsonb not null default '{}'::jsonb,
  consent_given boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'archived')),
  reviewer_notes text, reviewed_by uuid references public.members(id), reviewed_at timestamptz,
  member_id uuid,
  applicant_email text, dedupe_key text,
  submitted_at timestamptz not null default now(), purged_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, form_id) references public.forms (organization_id, id),
  foreign key (organization_id, form_version_id) references public.form_versions (organization_id, id),
  foreign key (organization_id, member_id) references public.members (organization_id, id)
);
create unique index form_submissions_dedupe_uq on public.form_submissions (form_id, dedupe_key) where dedupe_key is not null and status in ('pending', 'approved');
create index form_submissions_form_idx on public.form_submissions (form_id, status, submitted_at desc);

create table public.form_submission_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, submission_id uuid not null,
  field_key text not null, storage_path text not null, file_name text not null, mime_type text, size_bytes bigint,
  foreign key (organization_id, submission_id) references public.form_submissions (organization_id, id),
  check (storage_path like organization_id::text || '/%')
);

create table public.form_upload_tokens (
  token uuid primary key default gen_random_uuid(),
  organization_id uuid not null, form_id uuid not null,
  expires_at timestamptz not null default now() + interval '60 minutes',
  used_at timestamptz, created_at timestamptz not null default now()
);
create index form_upload_tokens_form_idx on public.form_upload_tokens (form_id, created_at desc);

-- ───────────── Storage privado para anexos de inscrição ─────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('form-uploads', 'form-uploads', false, 5242880, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Upload anônimo só com token válido (≤ 10 arquivos por token). Caminho: {org}/{token}/{arquivo}
create or replace function public.can_upload_form_file(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.form_upload_tokens t
    where t.token::text = split_part(p_name, '/', 2)
      and t.organization_id::text = split_part(p_name, '/', 1)
      and t.expires_at > now() and t.used_at is null
      and (select count(*) from storage.objects o where o.bucket_id = 'form-uploads' and o.name like t.organization_id::text || '/' || t.token::text || '/%') < 10)
$$;
revoke all on function public.can_upload_form_file(text) from public;
grant execute on function public.can_upload_form_file(text) to anon, authenticated;

create policy form_uploads_insert on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'form-uploads' and public.can_upload_form_file(name));
create policy form_uploads_select on storage.objects for select to authenticated
  using (bucket_id = 'form-uploads' and public.has_permission(public.storage_org(name), 'forms.manage'));
create policy form_uploads_delete on storage.objects for delete to authenticated
  using (bucket_id = 'form-uploads' and public.has_permission(public.storage_org(name), 'forms.manage'));

-- ───────────── publicar (cria versão imutável) ─────────────
create or replace function public.publish_form(p_form uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
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
  select member_mapping into v_dup from public.form_fields where form_id = p_form and is_active and member_mapping is not null
    group by member_mapping having count(*) > 1 limit 1;
  if v_dup is not null then raise exception 'Mais de um campo está ligado a "%". Cada campo do cadastro só pode ser preenchido por um campo.', v_dup using errcode = 'P0001'; end if;
  -- condição precisa apontar para um campo anterior e ativo
  for r in select a.label, a.condition ->> 'field' as ref, a.sort_order from public.form_fields a where a.form_id = p_form and a.is_active and a.condition is not null loop
    if not exists (select 1 from public.form_fields b where b.form_id = p_form and b.is_active and b.field_key = r.ref and b.sort_order < r.sort_order) then
      raise exception 'A condição do campo "%" deve depender de um campo que venha antes dele.', r.label using errcode = 'P0001';
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
      'key', x.field_key, 'label', x.label, 'description', x.description, 'type', x.field_type, 'required', x.required,
      'options', case
        when x.member_mapping = 'link.instrument' and jsonb_array_length(x.options) = 0 then
          (select coalesce(jsonb_agg(jsonb_build_object('value', i.id, 'label', i.name) order by i.sort_order, i.name), '[]'::jsonb) from public.instruments i where i.organization_id = f.organization_id and i.is_active)
        when x.member_mapping = 'link.function' and jsonb_array_length(x.options) = 0 then
          (select coalesce(jsonb_agg(jsonb_build_object('value', i.id, 'label', i.name) order by i.sort_order, i.name), '[]'::jsonb) from public.artistic_functions i where i.organization_id = f.organization_id and i.is_active)
        when x.member_mapping = 'link.skill_level' and jsonb_array_length(x.options) = 0 then
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
end $$;
revoke all on function public.publish_form(uuid) from public, anon;
grant execute on function public.publish_form(uuid) to authenticated;

create or replace function public.duplicate_form(p_form uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
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
end $$;
revoke all on function public.duplicate_form(uuid) from public, anon;
grant execute on function public.duplicate_form(uuid) to authenticated;

-- ───────────── API pública (anon) ─────────────
create or replace function public._form_state(f public.forms) returns text
language sql stable set search_path = '' as $$
  select case
    when f.status = 'closed' then 'closed'
    when f.opens_at is not null and f.opens_at > now() then 'not_open'
    when f.closes_at is not null and f.closes_at < now() then 'closed'
    when f.max_responses is not null and (select count(*) from public.form_submissions s where s.form_id = f.id and s.status in ('pending', 'approved')) >= f.max_responses then 'full'
    else 'open' end
$$;

revoke all on function public._form_state(public.forms) from public;

create or replace function public.get_public_form(p_org_slug text, p_form_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare o public.organizations; f public.forms; v public.form_versions; st text;
begin
  select * into o from public.organizations where slug = p_org_slug and is_active;
  if o.id is null then return jsonb_build_object('state', 'not_found'); end if;
  select * into f from public.forms where organization_id = o.id and slug = p_form_slug and status in ('published', 'closed');
  if f.id is null or f.published_version_id is null then return jsonb_build_object('state', 'not_found'); end if;
  select * into v from public.form_versions where id = f.published_version_id;
  st := public._form_state(f);
  return jsonb_build_object(
    'state', st,
    'organization', jsonb_build_object('name', o.name, 'short_name', o.short_name, 'logo_path', o.logo_path, 'theme', o.theme),
    'form', jsonb_build_object(
      'title', v.snapshot -> 'title', 'description', v.snapshot -> 'description', 'privacy_text', v.snapshot -> 'privacy_text',
      'requires_consent', v.snapshot -> 'requires_consent', 'closes_at', f.closes_at,
      -- o mapeamento para o cadastro é interno: não vai para o público
      'fields', case when st = 'open' then (select coalesce(jsonb_agg(fld - 'mapping'), '[]'::jsonb) from jsonb_array_elements(v.snapshot -> 'fields') fld) else '[]'::jsonb end));
end $$;
revoke all on function public.get_public_form(text, text) from public;
grant execute on function public.get_public_form(text, text) to anon, authenticated;

create or replace function public.begin_form_upload(p_org_slug text, p_form_slug text) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
end $;
revoke all on function public.begin_form_upload(text, text) from public;
grant execute on function public.begin_form_upload(text, text) to anon, authenticated;

create or replace function public.submit_public_form(p_org_slug text, p_form_slug text, p_answers jsonb, p_consent boolean,
  p_hp text default null, p_upload_token uuid default null, p_files jsonb default '[]'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  f public.forms; v public.form_versions; snap jsonb; fld jsonb; k text; t text; cond jsonb; pv text; val jsonb; txt text; mx int;
  clean jsonb := '{}'::jsonb; vis boolean; empty boolean; num numeric; d date; sub_id uuid; tok public.form_upload_tokens;
  file_req text[] := '{}'; file_keys text[] := '{}'; fl jsonb; cnt int; v_email text; v_birth text; v_dedupe text; mn numeric; mxv numeric;
begin
  if coalesce(p_hp, '') <> '' then -- honeypot preenchido: robô; finge sucesso sem gravar
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

  for fld in select * from jsonb_array_elements(snap -> 'fields') loop
    k := fld ->> 'key'; t := fld ->> 'type';
    continue when t = 'info';
    cond := fld -> 'condition';
    vis := true;
    if cond is not null and jsonb_typeof(cond) = 'object' then
      pv := clean ->> (cond ->> 'field');
      vis := coalesce(case cond ->> 'op' when 'neq' then pv is distinct from (cond ->> 'value') else pv is not distinct from (cond ->> 'value') end, false);
    end if;
    continue when not vis;
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
      if jsonb_typeof(val) <> 'string' or not exists (select 1 from jsonb_array_elements(fld -> 'options') o where o ->> 'value' = txt) then
        raise exception 'Opção inválida em: %', fld ->> 'label' using errcode = 'P0001';
      end if;
      clean := clean || jsonb_build_object(k, txt);
    elsif t = 'multi_select' then
      if jsonb_typeof(val) <> 'array' or exists (
           select 1 from jsonb_array_elements_text(val) x where not exists (select 1 from jsonb_array_elements(fld -> 'options') o where o ->> 'value' = x)) then
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

  -- regra de negócio: apenas maiores de 18 anos (campo ligado à data de nascimento)
  select clean ->> (x ->> 'key') into v_birth from jsonb_array_elements(snap -> 'fields') x where x ->> 'mapping' = 'member.birth_date' limit 1;
  if v_birth is not null and v_birth::date > (current_date - interval '18 years')::date then
    raise exception 'Apenas maiores de 18 anos podem se inscrever.' using errcode = 'P0001';
  end if;
  select clean ->> (x ->> 'key') into v_email from jsonb_array_elements(snap -> 'fields') x where x ->> 'mapping' = 'member.email' limit 1;
  if v_email is null then
    select clean ->> (x ->> 'key') into v_email from jsonb_array_elements(snap -> 'fields') x where x ->> 'type' = 'email' and clean ? (x ->> 'key') limit 1;
  end if;
  v_dedupe := case when coalesce((snap ->> 'prevent_duplicates')::boolean, false) then v_email end;

  -- arquivos (token temporário, pasta própria, tipos e tamanhos limitados)
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

  begin
    insert into public.form_submissions (organization_id, form_id, form_version_id, answers, consent_given, applicant_email, dedupe_key)
    values (f.organization_id, f.id, v.id, clean, coalesce(p_consent, false), v_email, lower(v_dedupe)) returning id into sub_id;
  exception when unique_violation then
    raise exception 'Já recebemos uma inscrição com este e-mail.' using errcode = 'P0001';
  end;
  if tok.token is not null then
    insert into public.form_submission_files (organization_id, submission_id, field_key, storage_path, file_name, mime_type, size_bytes)
    select f.organization_id, sub_id, x ->> 'field_key', x ->> 'path', coalesce(left(x ->> 'name', 200), 'arquivo'), x ->> 'mime', (x ->> 'size')::bigint
    from jsonb_array_elements(coalesce(p_files, '[]'::jsonb)) x;
    update public.form_upload_tokens set used_at = now() where token = tok.token;
  end if;
  return jsonb_build_object('message', snap ->> 'confirmation_message');
end $$;
revoke all on function public.submit_public_form(text, text, jsonb, boolean, text, uuid, jsonb) from public;
grant execute on function public.submit_public_form(text, text, jsonb, boolean, text, uuid, jsonb) to anon, authenticated;

-- ───────────── análise das respostas ─────────────
create or replace function public.review_submission(p_id uuid, p_status text, p_notes text default null) returns void
language plpgsql security definer set search_path = '' as $$
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
end $$;
revoke all on function public.review_submission(uuid, text, text) from public, anon;
grant execute on function public.review_submission(uuid, text, text) to authenticated;

create or replace function public.save_submission_notes(p_id uuid, p_notes text) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.form_submissions;
begin
  select * into s from public.form_submissions where id = p_id;
  if s.id is null or not public.has_permission(s.organization_id, 'forms.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  update public.form_submissions set reviewer_notes = nullif(trim(p_notes), '') where id = p_id;
end $$;
revoke all on function public.save_submission_notes(uuid, text) from public, anon;
grant execute on function public.save_submission_notes(uuid, text) to authenticated;

-- Aprova e CONVERTE em integrante usando o mapeamento de campos da versão respondida. Nada é digitado de novo.
create or replace function public.approve_submission(p_id uuid, p_notes text default null, p_cycle_status text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  s public.form_submissions; f public.forms; v public.form_versions; fld jsonb; mp text; ans jsonb;
  m_full text; m_display text; m_email text; m_phone text; m_social text; m_birth date; m_aff text; m_played boolean := false; m_other text;
  s_gender text; s_trans boolean; s_race text; s_pcd boolean; s_pcd_desc text; l_inst uuid; l_func uuid; l_level uuid; v_member uuid; v_has_sens boolean := false;
  function_ans text;
begin
  select * into s from public.form_submissions where id = p_id;
  if s.id is null or not public.has_permission(s.organization_id, 'forms.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if s.status = 'approved' then raise exception 'Inscrição já aprovada.' using errcode = 'P0001'; end if;
  select * into f from public.forms where id = s.form_id;
  select * into v from public.form_versions where id = s.form_version_id;
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
      when 'sensitive.gender' then s_gender := function_ans; v_has_sens := true;
      when 'sensitive.is_trans' then s_trans := (function_ans = 'yes'); v_has_sens := true;
      when 'sensitive.race_color' then s_race := function_ans; v_has_sens := true;
      when 'sensitive.is_pcd' then s_pcd := (function_ans = 'yes'); v_has_sens := true;
      when 'sensitive.pcd_description' then s_pcd_desc := function_ans; v_has_sens := true;
      when 'link.instrument' then l_inst := function_ans::uuid;
      when 'link.function' then l_func := function_ans::uuid;
      when 'link.skill_level' then l_level := function_ans::uuid;
      else null;
    end case;
  end loop;
  if m_full is null or length(trim(m_full)) = 0 then
    raise exception 'Este formulário não tem um campo de nome completo ligado ao cadastro; não é possível converter.' using errcode = 'P0001';
  end if;
  if m_email is not null and exists (select 1 from public.members where organization_id = s.organization_id and lower(email) = lower(m_email) and archived_at is null) then
    raise exception 'Já existe um integrante ativo com este e-mail. Rejeite ou arquive esta inscrição.' using errcode = '23505';
  end if;

  insert into public.members (organization_id, full_name, display_name, email, phone, social_handle, birth_date, joined_at, affective_relation, played_other_blocks, other_blocks)
  values (s.organization_id, trim(m_full), nullif(trim(m_display), ''), lower(m_email), m_phone, nullif(trim(m_social), ''), m_birth, current_date, nullif(trim(m_aff), ''), m_played, nullif(trim(m_other), ''))
  returning id into v_member;
  if v_has_sens then
    insert into public.member_sensitive_data (member_id, organization_id, gender, is_trans, race_color, is_pcd, pcd_description)
    values (v_member, s.organization_id, s_gender, s_trans, s_race, s_pcd, case when s_pcd then s_pcd_desc end);
  end if;
  if l_inst is not null or l_func is not null then
    insert into public.member_artistic_links (organization_id, member_id, instrument_id, function_id, skill_level_id, is_primary)
    values (s.organization_id, v_member, l_inst, l_func, l_level, true);
  end if;
  if s.consent_given then
    insert into public.consent_records (organization_id, member_id, purpose, text_version) values (s.organization_id, v_member, 'inscricao', v.id::text);
  end if;
  if p_cycle_status is not null and f.cycle_id is not null then
    perform public.set_member_cycle_status(v_member, f.cycle_id, p_cycle_status);
  end if;
  update public.form_submissions set status = 'approved', member_id = v_member, reviewer_notes = coalesce(nullif(trim(p_notes), ''), reviewer_notes),
         reviewed_by = public.current_member_id(s.organization_id), reviewed_at = now() where id = p_id;
  insert into public.audit_logs (organization_id, actor_user_id, actor_member_id, action, entity_type, entity_id, new_data)
  values (s.organization_id, auth.uid(), public.current_member_id(s.organization_id), 'submission_approved', 'form_submissions', p_id::text, jsonb_build_object('member_id', v_member));
  return v_member;
end $$;
revoke all on function public.approve_submission(uuid, text, text) from public, anon;
grant execute on function public.approve_submission(uuid, text, text) to authenticated;

-- Política de retenção (padrão sugerido: rejeitadas/arquivadas 12 meses; pendentes sem análise 6 meses).
-- Anonimiza as respostas e devolve os caminhos de arquivos para o app remover do Storage.
create or replace function public.purge_old_submissions(p_org uuid) returns text[]
language plpgsql security definer set search_path = '' as $$
declare v_paths text[]; v_ids uuid[];
begin
  if not public.has_permission(p_org, 'forms.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
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
end $$;
revoke all on function public.purge_old_submissions(uuid) from public, anon;
grant execute on function public.purge_old_submissions(uuid) to authenticated;

-- ───────────── modelo inicial de inscrição (rascunho; a Direção revisa e publica) ─────────────
create or replace function public.create_default_registration_form(p_org uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
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
    ('gender', 'Gênero', 'single_select', false, '[{"value":"feminino","label":"Feminino"},{"value":"masculino","label":"Masculino"},{"value":"nao_binario","label":"Não-binário"},{"value":"outro","label":"Outro"},{"value":"prefiro_nao_informar","label":"Prefiro não informar"}]'::jsonb, null, 'sensitive.gender'),
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
  return v_form;
end $$;
revoke all on function public.create_default_registration_form(uuid) from public, anon, authenticated;

-- ───────────── RLS e grants ─────────────
do $$
declare t text;
begin
  foreach t in array array['forms', 'form_fields', 'form_versions', 'form_submissions', 'form_submission_files', 'form_upload_tokens'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
  grant select on public.forms, public.form_fields, public.form_versions, public.form_submissions, public.form_submission_files to authenticated;
  grant insert, update on public.forms, public.form_fields to authenticated;
  foreach t in array array['forms', 'form_fields', 'form_versions'] loop
    execute format('create trigger trg_audit_%1$s after insert or update on public.%1$I for each row execute function public.fn_audit()', t);
  end loop;
end $$;

create policy forms_select on public.forms for select to authenticated using (public.has_permission(organization_id, 'forms.manage'));
create policy forms_insert on public.forms for insert to authenticated with check (public.has_permission(organization_id, 'forms.manage'));
create policy forms_update on public.forms for update to authenticated
  using (public.has_permission(organization_id, 'forms.manage')) with check (public.has_permission(organization_id, 'forms.manage'));
create policy ff_select on public.form_fields for select to authenticated using (public.has_permission(organization_id, 'forms.manage'));
create policy ff_insert on public.form_fields for insert to authenticated with check (public.has_permission(organization_id, 'forms.manage'));
create policy ff_update on public.form_fields for update to authenticated
  using (public.has_permission(organization_id, 'forms.manage')) with check (public.has_permission(organization_id, 'forms.manage'));
create policy fv_select on public.form_versions for select to authenticated using (public.has_permission(organization_id, 'forms.manage'));
create policy fs_select on public.form_submissions for select to authenticated using (public.has_permission(organization_id, 'forms.manage'));
create policy fsf_select on public.form_submission_files for select to authenticated using (public.has_permission(organization_id, 'forms.manage'));
