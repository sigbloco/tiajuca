-- Trazida do banco (DRIFT-01): aplicada pelo editor em 15/11/2026 sem arquivo no repositório.
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public._build_section_template(uuid,text)'::regprocedure);
  n := replace(d, 'insert into public.form_section_templates (organization_id, name, form_id, section_id) values (s.organization_id, trim(p_name), v_form, v_sec)',
    'insert into public.form_section_templates (organization_id, name, form_id, section_id, sort_order) values (s.organization_id, trim(p_name), v_form, v_sec, (select coalesce(max(x.sort_order), 0) + 1 from public.form_section_templates x where x.organization_id = s.organization_id))');
  if n = d then raise exception 'trecho não encontrado'; end if;
  execute n;
end $$;
