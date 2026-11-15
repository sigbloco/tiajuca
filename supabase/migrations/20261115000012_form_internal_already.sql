-- Formulário interno: quem já enviou (pendente ou aprovado) vê "você já está inscrito" e não envia de novo.
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.get_public_form(text,text)'::regprocedure);
  n := replace(d, 'viewer := jsonb_build_object(''member_id'', m.id, ''name'', m.full_name, ''section_id'', public._viewer_section(m.id));',
    'viewer := jsonb_build_object(''member_id'', m.id, ''name'', m.full_name, ''section_id'', public._viewer_section(m.id));' || E'\n      if exists (select 1 from public.form_submissions x where x.form_id = f.id and x.member_id = m.id and x.status in (''pending'', ''approved'')) then st := ''already''; end if;');
  if n = d then raise exception 'patch get: already'; end if;
  execute n;
  d := pg_get_functiondef('public.submit_public_form(text,text,jsonb,boolean,text,uuid,jsonb)'::regprocedure);
  n := replace(d, 'v_member := v_m.id;', 'v_member := v_m.id;' || E'\n    if exists (select 1 from public.form_submissions x where x.form_id = f.id and x.member_id = v_member and x.status in (''pending'', ''approved'')) then raise exception ''Você já está inscrito neste formulário.'' using errcode = ''P0001''; end if;');
  if n = d then raise exception 'patch submit: already'; end if;
  execute n;
end $$;
