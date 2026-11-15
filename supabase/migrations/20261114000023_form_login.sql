-- Seção de login nos formulários (validation.login numa seção): o envio exige uma conta Google e usa o e-mail da conta (verificado).
alter table public.form_submissions add column if not exists applicant_user_id uuid;

do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.submit_public_form(text,text,jsonb,boolean,text,uuid,jsonb)'::regprocedure);
  n := replace(d, 'v_email text;', 'v_email text; v_login_email text; v_login_user uuid;');
  if n = d then raise exception 'submit: declare não encontrado'; end if;
  d := n;
  n := replace(d, 'for fld in select * from jsonb_array_elements(snap -> ''fields'') loop',
    E'if exists (select 1 from jsonb_array_elements(snap -> ''fields'') x where x ->> ''type'' = ''info'' and coalesce((x -> ''validation'' ->> ''login'')::boolean, false)) then\n    v_login_user := auth.uid();\n    if v_login_user is null then raise exception ''Entre com sua conta Google para enviar.'' using errcode = ''P0001''; end if;\n    select lower(u.email) into v_login_email from auth.users u where u.id = v_login_user;\n  end if;\n  for fld in select * from jsonb_array_elements(snap -> ''fields'') loop');
  if n = d then raise exception 'submit: loop não encontrado'; end if;
  d := n;
  n := replace(d, 'v_dedupe := case when', E'if v_login_email is not null then v_email := v_login_email; end if;\n  v_dedupe := case when');
  if n = d then raise exception 'submit: dedupe não encontrado'; end if;
  d := n;
  n := replace(d, 'applicant_email, dedupe_key)', 'applicant_email, dedupe_key, applicant_user_id)');
  if n = d then raise exception 'submit: colunas não encontradas'; end if;
  d := n;
  n := replace(d, 'v_email, lower(v_dedupe))', 'v_email, lower(v_dedupe), v_login_user)');
  if n = d then raise exception 'submit: valores não encontrados'; end if;
  execute n;

  -- Aprovar: sem campo de e-mail no formulário, o e-mail da conta que entrou vira o e-mail do integrante.
  d := pg_get_functiondef('public.approve_submission(uuid,text,text)'::regprocedure);
  n := replace(d, E'if m_other is not null and btrim(m_other) <> '''' then m_played := true; end if;',
    E'if m_other is not null and btrim(m_other) <> '''' then m_played := true; end if;\n  if m_email is null and s.applicant_email is not null then m_email := s.applicant_email; end if;');
  if n = d then raise exception 'approve: trecho não encontrado'; end if;
  execute n;
end $$;
