-- Seções modelo: uma seção (com suas perguntas e ligações com o cadastro) guardada para ser inserida, como cópia, em qualquer formulário.
create table public.form_section_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check (length(trim(name)) > 0),
  section jsonb not null,                       -- cabeçalho da seção: label, description, validation
  fields jsonb not null default '[]'::jsonb,    -- perguntas, na ordem
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, id), unique (organization_id, name)
);
create trigger trg_form_section_templates_updated before update on public.form_section_templates for each row execute function public.set_updated_at();
alter table public.form_section_templates enable row level security;
revoke all on public.form_section_templates from anon, authenticated;
grant select, insert, update, delete on public.form_section_templates to authenticated;
create policy fst_select on public.form_section_templates for select to authenticated using (public.has_permission(organization_id, 'forms.manage'));
create policy fst_insert on public.form_section_templates for insert to authenticated with check (public.has_permission(organization_id, 'forms.manage'));
create policy fst_update on public.form_section_templates for update to authenticated using (public.has_permission(organization_id, 'forms.manage')) with check (public.has_permission(organization_id, 'forms.manage'));
create policy fst_delete on public.form_section_templates for delete to authenticated using (public.has_permission(organization_id, 'forms.manage'));

-- Monta (ou atualiza, se já existir o nome) o modelo a partir de uma seção do formulário. Sem checagem de permissão: uso interno.
create or replace function public._build_section_template(p_section uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare s public.form_fields; nxt int; flds jsonb; v_id uuid;
begin
  select * into s from public.form_fields where id = p_section and field_type = 'info' and coalesce((validation ->> 'section')::boolean, false);
  if s.id is null then raise exception 'Seção não encontrada.' using errcode = 'P0001'; end if;
  select min(h.sort_order) into nxt from public.form_fields h
   where h.form_id = s.form_id and h.sort_order > s.sort_order and h.field_type = 'info' and coalesce((h.validation ->> 'section')::boolean, false);
  select coalesce(jsonb_agg(jsonb_build_object(
      'field_key', f.field_key, 'label', f.label, 'description', f.description, 'field_type', f.field_type, 'required', f.required,
      'options', f.options, 'default_value', f.default_value, 'validation', f.validation, 'condition', f.condition, 'member_mapping', f.member_mapping)
    order by f.sort_order), '[]'::jsonb) into flds
    from public.form_fields f
   where f.form_id = s.form_id and f.is_active and f.sort_order > s.sort_order and (nxt is null or f.sort_order < nxt);
  insert into public.form_section_templates (organization_id, name, section, fields)
  values (s.organization_id, trim(p_name), jsonb_build_object('label', s.label, 'description', s.description, 'validation', s.validation), flds)
  on conflict (organization_id, name) do update set section = excluded.section, fields = excluded.fields
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public._build_section_template(uuid, text) from public, anon, authenticated;

create or replace function public.save_section_as_template(p_section uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare s public.form_fields;
begin
  select * into s from public.form_fields where id = p_section;
  if s.id is null or not public.has_permission(s.organization_id, 'forms.manage') then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Dê um nome ao modelo.' using errcode = 'P0001'; end if;
  return public._build_section_template(p_section, p_name);
end $$;
revoke all on function public.save_section_as_template(uuid, text) from public, anon;
grant execute on function public.save_section_as_template(uuid, text) to authenticated;

-- Insere o modelo no fim do formulário, como cópia. Chaves repetidas ganham sufixo; ligação com o cadastro que o formulário já usa fica sem ligação.
create or replace function public.insert_section_template(p_form uuid, p_template uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare f public.forms; t public.form_section_templates; fld jsonb; pos int; k text; nk text; i int; keymap jsonb := '{}'::jsonb;
  mp text; v_unlinked int := 0; v_n int := 0; cond jsonb;
begin
  select * into f from public.forms where id = p_form;
  select * into t from public.form_section_templates where id = p_template;
  if f.id is null or t.id is null or t.organization_id <> f.organization_id or not public.has_permission(f.organization_id, 'forms.manage') then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  select coalesce(max(sort_order), 0) into pos from public.form_fields where form_id = p_form;
  pos := pos + 1;
  insert into public.form_fields (organization_id, form_id, field_key, label, description, field_type, required, sort_order, validation)
  values (f.organization_id, p_form, 'sec_' || substr(md5(random()::text), 1, 8), t.section ->> 'label', t.section ->> 'description', 'info', false, pos, coalesce(t.section -> 'validation', '{"section":true}'::jsonb));
  for fld in select * from jsonb_array_elements(t.fields) loop
    pos := pos + 1;
    k := fld ->> 'field_key'; nk := k; i := 2;
    while exists (select 1 from public.form_fields where form_id = p_form and field_key = nk) loop nk := left(k, 36) || '_' || i; i := i + 1; end loop;
    keymap := keymap || jsonb_build_object(k, nk);
    mp := fld ->> 'member_mapping';
    if mp is not null and mp <> 'member.custom' and exists (select 1 from public.form_fields where form_id = p_form and is_active and member_mapping = mp) then
      mp := null; v_unlinked := v_unlinked + 1;
    end if;
    cond := fld -> 'condition';
    if cond is not null and jsonb_typeof(cond) = 'object' and keymap ? (cond ->> 'field') then
      cond := jsonb_set(cond, '{field}', to_jsonb(keymap ->> (cond ->> 'field')));
    end if;
    insert into public.form_fields (organization_id, form_id, field_key, label, description, field_type, required, sort_order, options, default_value, validation, condition, member_mapping)
    values (f.organization_id, p_form, nk, fld ->> 'label', fld ->> 'description', fld ->> 'field_type', coalesce((fld ->> 'required')::boolean, false), pos,
            coalesce(fld -> 'options', '[]'::jsonb), fld ->> 'default_value', coalesce(fld -> 'validation', '{}'::jsonb), nullif(cond, 'null'::jsonb), mp);
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('fields', v_n, 'unlinked', v_unlinked);
end $$;
revoke all on function public.insert_section_template(uuid, uuid) from public, anon;
grant execute on function public.insert_section_template(uuid, uuid) to authenticated;

-- Primeiro modelo: a seção "Sobre você" do formulário de inscrição.
do $$
declare r record;
begin
  for r in select x.id from public.form_fields x where x.field_key = 'sec_sobre' loop
    perform public._build_section_template(r.id, 'Sobre você');
  end loop;
end $$;
