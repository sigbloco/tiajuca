-- Seções modelo editáveis com o mesmo editor dos formulários: cada modelo é guardado num formulário interno (is_template) com uma única seção.
alter table public.forms add column if not exists is_template boolean not null default false;
alter table public.form_section_templates add column if not exists form_id uuid references public.forms(id) on delete cascade;
alter table public.form_section_templates add column if not exists section_id uuid;

-- Modelos já criados (guardados em JSON) viram formulários internos.
do $$
declare t record; v_form uuid; v_sec uuid; fld jsonb; pos int;
begin
  for t in select * from public.form_section_templates where form_id is null loop
    insert into public.forms (organization_id, title, slug, is_template)
    values (t.organization_id, t.name, 'modelo-' || substr(md5(random()::text), 1, 10), true) returning id into v_form;
    insert into public.form_fields (organization_id, form_id, field_key, label, description, field_type, required, sort_order, validation)
    values (t.organization_id, v_form, 'sec_' || substr(md5(random()::text), 1, 8), t.section ->> 'label', t.section ->> 'description', 'info', false, 1,
            coalesce(t.section -> 'validation', '{"section":true}'::jsonb)) returning id into v_sec;
    pos := 1;
    for fld in select * from jsonb_array_elements(t.fields) loop
      pos := pos + 1;
      insert into public.form_fields (organization_id, form_id, field_key, label, description, field_type, required, sort_order, options, default_value, validation, condition, member_mapping)
      values (t.organization_id, v_form, fld ->> 'field_key', fld ->> 'label', fld ->> 'description', fld ->> 'field_type', coalesce((fld ->> 'required')::boolean, false), pos,
              coalesce(fld -> 'options', '[]'::jsonb), fld ->> 'default_value', coalesce(fld -> 'validation', '{}'::jsonb), nullif(fld -> 'condition', 'null'::jsonb), fld ->> 'member_mapping');
    end loop;
    update public.form_section_templates set form_id = v_form, section_id = v_sec where id = t.id;
  end loop;
end $$;
alter table public.form_section_templates alter column form_id set not null, alter column section_id set not null;
alter table public.form_section_templates drop column section, drop column fields;

-- Salvar uma seção como modelo: copia a seção e suas perguntas para o formulário interno do modelo (criado na hora, ou substituído se o nome já existe).
create or replace function public._build_section_template(p_section uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
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
  values (s.organization_id, v_form, 'sec_' || substr(md5(random()::text), 1, 8), s.label, s.description, 'info', false, 1, s.validation) returning id into v_sec;
  for r in select * from public.form_fields f
            where f.form_id = s.form_id and f.is_active and f.sort_order > s.sort_order and (nxt is null or f.sort_order < nxt) order by f.sort_order loop
    pos := pos + 1;
    insert into public.form_fields (organization_id, form_id, field_key, label, description, field_type, required, sort_order, options, default_value, validation, condition, member_mapping)
    values (s.organization_id, v_form, r.field_key, r.label, r.description, r.field_type, r.required, pos, r.options, r.default_value, r.validation, r.condition, r.member_mapping);
  end loop;
  if v_exists then
    update public.form_section_templates set section_id = v_sec where id = v_id;
  else
    insert into public.form_section_templates (organization_id, name, form_id, section_id) values (s.organization_id, trim(p_name), v_form, v_sec) returning id into v_id;
  end if;
  return v_id;
end $$;
revoke all on function public._build_section_template(uuid, text) from public, anon, authenticated;

-- Inserir o modelo no fim de um formulário (cópia): lê a seção e as perguntas ativas do formulário interno do modelo.
create or replace function public.insert_section_template(p_form uuid, p_template uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
  insert into public.form_fields (organization_id, form_id, field_key, label, description, field_type, required, sort_order, validation)
  values (f.organization_id, p_form, 'sec_' || substr(md5(random()::text), 1, 8), sec.label, sec.description, 'info', false, pos, sec.validation);
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
end $$;
revoke all on function public.insert_section_template(uuid, uuid) from public, anon;
grant execute on function public.insert_section_template(uuid, uuid) to authenticated;

create or replace function public.delete_section_template(p_template uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.form_section_templates;
begin
  select * into t from public.form_section_templates where id = p_template;
  if t.id is null or not public.has_permission(t.organization_id, 'forms.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  delete from public.form_fields where form_id = t.form_id;
  delete from public.forms where id = t.form_id; -- o modelo some junto (on delete cascade)
end $$;
revoke all on function public.delete_section_template(uuid) from public, anon;
grant execute on function public.delete_section_template(uuid) to authenticated;
