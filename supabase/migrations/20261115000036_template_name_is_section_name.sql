-- O nome do modelo de seção é o nome da seção dele (um só nome).
update public.form_fields f set label = t.name
  from public.form_section_templates t
 where f.id = t.section_id and f.label <> t.name;

do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public._build_section_template(uuid,text)'::regprocedure);
  n := replace(d, '''sec_'' || substr(md5(random()::text), 1, 8), s.label, s.description, ''info'', false, 1, s.validation)', '''sec_'' || substr(md5(random()::text), 1, 8), trim(p_name), s.description, ''info'', false, 1, s.validation)');
  if n = d then raise exception 'patch _build_section_template'; end if;
  execute n;
  d := pg_get_functiondef('public.duplicate_section_template(uuid,text)'::regprocedure);
  n := replace(d, 'r.organization_id, v_form, case when r.id = t.section_id then ''sec_'' || substr(md5(random()::text), 1, 8) else r.field_key end, r.label, r.description,', 'r.organization_id, v_form, case when r.id = t.section_id then ''sec_'' || substr(md5(random()::text), 1, 8) else r.field_key end, case when r.id = t.section_id then nm else r.label end, r.description,');
  if n = d then raise exception 'patch duplicate_section_template'; end if;
  execute n;
end $$;
