-- Formulário interno: o integrante pode EDITAR a resposta enquanto ela está pendente (a nova versão substitui a anterior; depois de aprovada, trava).
alter table public.form_submissions add column if not exists edited_at timestamptz;

do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.get_public_form(text,text)'::regprocedure);
  n := replace(d, 'm public.members; viewer jsonb;', 'm public.members; viewer jsonb; mine jsonb;');
  if n = d then raise exception 'patch get: declare'; end if; d := n;
  n := replace(d, 'if exists (select 1 from public.form_submissions x where x.form_id = f.id and x.member_id = m.id and x.status in (''pending'', ''approved'')) then st := ''already''; end if;',
    'select jsonb_build_object(''status'', x.status, ''answers'', x.answers, ''submitted_at'', x.submitted_at, ''edited_at'', x.edited_at) into mine from public.form_submissions x where x.form_id = f.id and x.member_id = m.id and x.status in (''pending'', ''approved'') order by x.submitted_at desc limit 1;' || E'\n      if mine is not null then st := ''already''; end if;');
  if n = d then raise exception 'patch get: mine'; end if; d := n;
  n := replace(d, '''viewer'', viewer,', '''viewer'', viewer, ''mine'', mine,');
  if n = d then raise exception 'patch get: payload'; end if; d := n;
  n := replace(d, 'case when st = ''open'' then (select coalesce(jsonb_agg(', 'case when st in (''open'', ''already'') then (select coalesce(jsonb_agg(');
  if n = d then raise exception 'patch get: fields'; end if;
  execute n;

  d := pg_get_functiondef('public.submit_public_form(text,text,jsonb,boolean,text,uuid,jsonb)'::regprocedure);
  n := replace(d, 'v_member uuid;', 'v_member uuid; v_existing uuid;');
  if n = d then raise exception 'patch submit: declare'; end if; d := n;
  n := replace(d, 'if exists (select 1 from public.form_submissions x where x.form_id = f.id and x.member_id = v_member and x.status in (''pending'', ''approved'')) then raise exception ''Você já está inscrito neste formulário.'' using errcode = ''P0001''; end if;',
    'if exists (select 1 from public.form_submissions x where x.form_id = f.id and x.member_id = v_member and x.status = ''approved'') then raise exception ''Sua inscrição já foi aprovada e não pode mais ser editada.'' using errcode = ''P0001''; end if;' || E'\n    select x.id into v_existing from public.form_submissions x where x.form_id = f.id and x.member_id = v_member and x.status = ''pending'' order by x.submitted_at desc limit 1;');
  if n = d then raise exception 'patch submit: already'; end if; d := n;
  n := replace(d, E'  begin\n    insert into public.form_submissions', E'  if v_existing is not null then\n    update public.form_submissions set answers = clean, consent_given = coalesce(p_consent, false), form_version_id = v.id, edited_at = now() where id = v_existing returning id into sub_id;\n  else\n  begin\n    insert into public.form_submissions');
  if n = d then raise exception 'patch submit: insert'; end if; d := n;
  n := replace(d, E'raise exception ''Já recebemos uma inscrição com este e-mail.'' using errcode = ''P0001'';\n  end;', E'raise exception ''Já recebemos uma inscrição com este e-mail.'' using errcode = ''P0001'';\n  end;\n  end if;');
  if n = d then raise exception 'patch submit: end'; end if;
  execute n;
end $$;
