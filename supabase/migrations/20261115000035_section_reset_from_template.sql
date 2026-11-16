-- Seção que nasceu de um modelo guarda de qual (source_template_id) e pode ser restaurada ao modelo.
alter table public.form_fields add column if not exists source_template_id uuid references public.form_section_templates (id) on delete set null;

do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.insert_section_template(uuid,uuid)'::regprocedure);
  n := replace(d, E'required, sort_order, validation)\n  values (f.organization_id, p_form, ''sec_''', E'required, sort_order, validation, source_template_id)\n  values (f.organization_id, p_form, ''sec_''');
  if n = d then raise exception 'patch insert_section_template: cols'; end if; d := n;
  n := replace(d, '''info'', false, pos, sec.validation);', '''info'', false, pos, sec.validation, p_template);');
  if n = d then raise exception 'patch insert_section_template: vals'; end if;
  execute n;
end $$;

-- Seções que já existiam e têm o nome de um modelo: ligadas a ele.
update public.form_fields f set source_template_id = t.id
  from public.form_section_templates t
  join public.form_fields tsec on tsec.id = t.section_id
 where f.source_template_id is null and f.field_type = 'info' and coalesce((f.validation ->> 'section')::boolean, false)
   and f.organization_id = t.organization_id and f.label = tsec.label
   and f.form_id in (select id from public.forms where not is_template);

create or replace function public.reset_section_from_template(p_section uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
  -- perguntas de outras seções que dependiam das removidas perdem a condição
  update public.form_fields set condition = null
   where form_id = s.form_id and condition is not null and (condition ->> 'field') = any (old_keys)
     and not (sort_order > s.sort_order and (nxt is null or sort_order < nxt));
  delete from public.form_fields where form_id = s.form_id and sort_order > s.sort_order and (nxt is null or sort_order < nxt);
  select count(*) into new_n from public.form_fields x where x.form_id = t.form_id and x.id <> t.section_id and x.is_active;
  if nxt is not null then
    update public.form_fields set sort_order = sort_order + ((s.sort_order + new_n + 1) - nxt) where form_id = s.form_id and sort_order >= nxt;
  end if;
  -- cabeçalho volta ao do modelo (a condição, por exemplo "só para um naipe", é do formulário e fica)
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
end $$;
revoke all on function public.reset_section_from_template(uuid) from public, anon;
grant execute on function public.reset_section_from_template(uuid) to authenticated;

-- Seção cujo nome bate com mais de um modelo (ex.: "Participação") fica sem ligação: não dá para saber de qual veio.
update public.form_fields f set source_template_id = null
 where f.source_template_id is not null and (
   select count(*) from public.form_section_templates t join public.form_fields tsec on tsec.id = t.section_id
    where t.organization_id = f.organization_id and tsec.label = f.label) > 1;
