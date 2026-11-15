-- Cada mensagem do formulário e dos e-mails pode ser desligada (formulários que não são inscrição de oficina não precisam delas).
alter table public.forms
  add column if not exists privacy_enabled boolean not null default true,
  add column if not exists send_enabled boolean not null default true,
  add column if not exists confirmation_enabled boolean not null default true,
  add column if not exists review_enabled boolean not null default true,
  add column if not exists approved_enabled boolean not null default true,
  add column if not exists rejected_enabled boolean not null default true,
  add column if not exists waitlist_enabled boolean not null default true;
alter table public.form_send_defaults
  add column if not exists privacy_enabled boolean not null default true,
  add column if not exists send_enabled boolean not null default true,
  add column if not exists confirmation_enabled boolean not null default true,
  add column if not exists review_enabled boolean not null default true,
  add column if not exists approved_enabled boolean not null default true,
  add column if not exists rejected_enabled boolean not null default true,
  add column if not exists waitlist_enabled boolean not null default true;

do $$
declare d text; n text;
begin
  -- Formulário público: privacidade e "antes de enviar" só aparecem se ligados; diz se mostra a mensagem de depois do envio.
  d := pg_get_functiondef('public.get_public_form(text,text)'::regprocedure);
  n := replace(d, '''privacy_text'', to_jsonb(f.privacy_text)', '''privacy_text'', to_jsonb(case when f.privacy_enabled then f.privacy_text end)');
  if n = d then raise exception 'get_public_form (privacidade): trecho não encontrado'; end if;
  d := n;
  n := replace(d, '''send_text'', f.send_text,', '''send_text'', case when f.send_enabled then f.send_text end, ''show_confirmation'', f.confirmation_enabled,');
  if n = d then raise exception 'get_public_form (envio): trecho não encontrado'; end if;
  execute n;

  -- Aprovar: só enfileira o e-mail (aprovação ou lista de espera) se estiver ligado.
  d := pg_get_functiondef('public.approve_submission(uuid,text,text)'::regprocedure);
  n := replace(d, 'if coalesce(s.applicant_email, lower(m_email)) is not null then',
                  'if coalesce(s.applicant_email, lower(m_email)) is not null and (case when p_cycle_status = ''waitlist'' then f.waitlist_enabled else f.approved_enabled end) then');
  if n = d then raise exception 'approve_submission: trecho não encontrado'; end if;
  execute n;

  -- Rejeitar: idem.
  d := pg_get_functiondef('public.reject_submission(uuid,text)'::regprocedure);
  n := replace(d, 'if s.applicant_email is not null then', 'if s.applicant_email is not null and coalesce((select fm.rejected_enabled from public.forms fm where fm.id = s.form_id), true) then');
  if n = d then raise exception 'reject_submission: trecho não encontrado'; end if;
  execute n;

  -- Tela de avaliação: sem o texto, quem entra vê a mensagem padrão do sistema.
  d := pg_get_functiondef('public.my_submission_info()'::regprocedure);
  n := replace(d, '''message'', f.review_message', '''message'', case when f.review_enabled then f.review_message end');
  if n = d then raise exception 'my_submission_info: trecho não encontrado'; end if;
  execute n;
end $$;
