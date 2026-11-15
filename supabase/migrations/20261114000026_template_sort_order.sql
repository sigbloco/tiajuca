-- Ordem das seções modelo (o usuário reordena com setas e arrastar).
alter table public.form_section_templates add column if not exists sort_order int not null default 0;
update public.form_section_templates t set sort_order = n.rn
  from (select id, row_number() over (partition by organization_id order by name) as rn from public.form_section_templates) n
 where n.id = t.id;

-- Modelo novo entra no fim da lista.
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public._build_section_template(uuid,text)'::regprocedure);
  n := replace(d, 'insert into public.form_section_templates (organization_id, name, form_id, section_id) values (s.organization_id, trim(p_name), v_form, v_sec)',
    'insert into public.form_section_templates (organization_id, name, form_id, section_id, sort_order) values (s.organization_id, trim(p_name), v_form, v_sec, (select coalesce(max(x.sort_order), 0) + 1 from public.form_section_templates x where x.organization_id = s.organization_id))');
  if n = d then raise exception 'trecho não encontrado'; end if;
  execute n;
end $$;
