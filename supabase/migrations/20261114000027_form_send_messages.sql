-- Seção fixa de envio: textos do fim do formulário editáveis por formulário.
alter table public.forms
  add column if not exists send_text text,
  add column if not exists review_message text not null default 'Recebemos a sua inscrição e a Direção está avaliando. Você receberá a confirmação por e-mail.',
  add column if not exists approved_email_text text not null default 'Sua inscrição foi aprovada. Obrigado por se inscrever! A Direção entrará em contato com os próximos passos.',
  add column if not exists rejected_email_text text not null default 'Agradecemos o seu interesse. Neste momento não foi possível aprovar a sua inscrição.';
alter table public.form_submissions add column if not exists applicant_message text;

-- Fila de e-mails dos formulários: nova mensagem (rejeição) e texto próprio.
alter table public.form_email_outbox drop constraint if exists form_email_outbox_template_check;
alter table public.form_email_outbox add constraint form_email_outbox_template_check check (template in ('submission_approved', 'submission_rejected'));
alter table public.form_email_outbox add column if not exists message text;

-- Recria o contexto de envio com os textos do formulário.
create or replace function public.form_mail_claim(p_limit int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record; out jsonb := '[]'::jsonb; ctx jsonb;
begin
  for r in
    select b.* from public.form_email_outbox b
     where b.status = 'pending' and b.next_attempt_at <= now() and b.attempts < 5
     order by b.created_at limit greatest(1, least(p_limit, 50)) for update skip locked
  loop
    update public.form_email_outbox set attempts = attempts + 1, next_attempt_at = now() + interval '10 minutes' where id = r.id;
    select jsonb_build_object(
      'outbox_id', r.id, 'template', r.template, 'to_email', r.to_email, 'name', m.full_name,
      'message', coalesce(r.message, case r.template when 'submission_approved' then fm.approved_email_text else fm.rejected_email_text end),
      'org', jsonb_build_object('name', g.name),
      'settings', jsonb_build_object('public_site_url', s.public_site_url, 'contact_whatsapp', s.contact_whatsapp, 'contact_email', s.contact_email,
                                     'directors', s.directors, 'mail_from_name', s.mail_from_name, 'mail_from_email', s.mail_from_email))
      into ctx
      from public.organizations g
      left join public.shop_settings s on s.organization_id = g.id
      left join public.form_submissions sub on sub.id = r.submission_id
      left join public.forms fm on fm.id = sub.form_id
      left join public.members m on m.id = r.member_id
     where g.id = r.organization_id;
    out := out || jsonb_build_array(ctx);
  end loop;
  return out;
end $$;
revoke all on function public.form_mail_claim(int) from public, anon, authenticated;
grant execute on function public.form_mail_claim(int) to service_role;

-- Rejeitar com mensagem: marca a inscrição como rejeitada e enfileira o e-mail (texto escrito pela Direção, ou o padrão do formulário).
create or replace function public.reject_submission(p_id uuid, p_message text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.form_submissions; msg text;
begin
  select * into s from public.form_submissions where id = p_id;
  if s.id is null or not public.has_permission(s.organization_id, 'forms.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  msg := nullif(btrim(coalesce(p_message, '')), '');
  update public.form_submissions set status = 'rejected', reviewed_at = now(), applicant_message = msg where id = p_id;
  if s.applicant_email is not null then
    insert into public.form_email_outbox (organization_id, submission_id, template, to_email, message)
    values (s.organization_id, s.id, 'submission_rejected', s.applicant_email, msg) on conflict (submission_id, template) do nothing;
  end if;
end $$;
revoke all on function public.reject_submission(uuid, text) from public, anon;
grant execute on function public.reject_submission(uuid, text) to authenticated;

-- Quem entrou com o Google: andamento da inscrição e o texto da tela de avaliação (do formulário).
create or replace function public.my_submission_info() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object('status', s.status, 'message', f.review_message)
                     from public.form_submissions s join public.forms f on f.id = s.form_id
                    where s.applicant_user_id = auth.uid() order by s.submitted_at desc limit 1),
                  jsonb_build_object('status', 'none', 'message', null))
$$;
revoke all on function public.my_submission_info() from public, anon;
grant execute on function public.my_submission_info() to authenticated;

-- O formulário público passa a receber o texto "depois de enviar".
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.get_public_form(text,text)'::regprocedure);
  n := replace(d, '''requires_consent'', v.snapshot -> ''requires_consent'', ''closes_at'', f.closes_at,', '''requires_consent'', v.snapshot -> ''requires_consent'', ''closes_at'', f.closes_at, ''send_text'', f.send_text,');
  if n = d then raise exception 'get_public_form: trecho não encontrado'; end if;
  execute n;
end $$;
