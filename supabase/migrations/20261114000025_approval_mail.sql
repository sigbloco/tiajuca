-- Inscrições: e-mail ao aprovar e mensagem "em avaliação" para quem entra com a conta Google antes de ter cadastro.
create table public.form_email_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  submission_id uuid not null references public.form_submissions(id) on delete cascade,
  member_id uuid,
  template text not null check (template in ('submission_approved')),
  to_email text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text, sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (submission_id, template)
);
create index form_outbox_pending_idx on public.form_email_outbox (next_attempt_at) where status = 'pending';
alter table public.form_email_outbox enable row level security;
revoke all on public.form_email_outbox from anon, authenticated;
grant select on public.form_email_outbox to authenticated;
create policy form_outbox_sel on public.form_email_outbox for select to authenticated using (public.has_permission(organization_id, 'forms.manage'));

-- Pega até p_limit e-mails pendentes (reserva por 10 min) e monta o contexto de cada um. Mesmo remetente configurado para a loja.
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
      'org', jsonb_build_object('name', g.name),
      'settings', jsonb_build_object('public_site_url', s.public_site_url, 'contact_whatsapp', s.contact_whatsapp, 'contact_email', s.contact_email,
                                     'directors', s.directors, 'mail_from_name', s.mail_from_name, 'mail_from_email', s.mail_from_email))
      into ctx
      from public.organizations g
      left join public.shop_settings s on s.organization_id = g.id
      left join public.members m on m.id = r.member_id
     where g.id = r.organization_id;
    out := out || jsonb_build_array(ctx);
  end loop;
  return out;
end $$;
revoke all on function public.form_mail_claim(int) from public, anon, authenticated;
grant execute on function public.form_mail_claim(int) to service_role;

create or replace function public.form_mail_done(p_id uuid, p_ok boolean, p_error text) returns void
language sql security definer set search_path = '' as $$
  update public.form_email_outbox
     set status = case when p_ok then 'sent' when attempts >= 5 then 'failed' else 'pending' end,
         sent_at = case when p_ok then now() end,
         last_error = case when p_ok then null else left(p_error, 300) end,
         next_attempt_at = case when p_ok then next_attempt_at else now() + (attempts * interval '5 minutes') end
   where id = p_id
$$;
revoke all on function public.form_mail_done(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.form_mail_done(uuid, boolean, text) to service_role;

-- Situação da inscrição de quem está logado (pela conta Google usada na seção de login): "pending", "approved", "rejected" ou "none".
create or replace function public.my_submission_status() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.status from public.form_submissions s where s.applicant_user_id = auth.uid() order by s.submitted_at desc limit 1), 'none')
$$;
revoke all on function public.my_submission_status() from public, anon;
grant execute on function public.my_submission_status() to authenticated;

-- Aprovar: além de criar o integrante, enfileira o e-mail de confirmação (para o e-mail da conta que se inscreveu, ou o informado no formulário).
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.approve_submission(uuid,text,text)'::regprocedure);
  n := replace(d, 'returning id into v_member;',
    E'returning id into v_member;\n  if coalesce(s.applicant_email, lower(m_email)) is not null then\n    insert into public.form_email_outbox (organization_id, submission_id, member_id, template, to_email)\n    values (s.organization_id, s.id, v_member, ''submission_approved'', coalesce(s.applicant_email, lower(m_email))) on conflict do nothing;\n  end if;');
  if n = d then raise exception 'approve_submission: trecho não encontrado'; end if;
  execute n;
end $$;
