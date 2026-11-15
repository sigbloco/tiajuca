-- Duplicar uma seção modelo com outro nome: copia o formulário interno do modelo, com todas as perguntas e ligações.
create or replace function public.duplicate_section_template(p_template uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
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
    values (r.organization_id, v_form, case when r.id = t.section_id then 'sec_' || substr(md5(random()::text), 1, 8) else r.field_key end, r.label, r.description, r.field_type, r.required, r.sort_order, r.options, r.default_value, r.validation, r.condition, r.member_mapping, r.is_active)
    returning id into v_new;
    if r.id = t.section_id then v_sec := v_new; end if;
  end loop;
  insert into public.form_section_templates (organization_id, name, form_id, section_id, sort_order)
  values (t.organization_id, nm, v_form, v_sec, (select coalesce(max(x.sort_order), 0) + 1 from public.form_section_templates x where x.organization_id = t.organization_id))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.duplicate_section_template(uuid, text) from public, anon;
grant execute on function public.duplicate_section_template(uuid, text) to authenticated;
