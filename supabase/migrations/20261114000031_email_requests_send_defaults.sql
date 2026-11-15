-- E-mail adicional pedido pelo integrante: só vale depois que a Direção aprova (o e-mail liga uma conta Google ao cadastro).
drop policy memails_insert on public.member_emails;
create policy memails_insert on public.member_emails for insert to authenticated with check (public.has_permission(organization_id, 'members.manage'));

create table public.email_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  member_id uuid not null,
  email text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  foreign key (organization_id, member_id) references public.members (organization_id, id)
);
create index email_requests_pending_idx on public.email_requests (organization_id) where status = 'pending';
alter table public.email_requests enable row level security;
revoke all on public.email_requests from anon, authenticated;
grant select on public.email_requests to authenticated;
create policy ereq_select on public.email_requests for select to authenticated
  using (public.is_self(member_id) or public.has_permission(organization_id, 'members.manage'));

create or replace function public.request_extra_email(p_member uuid, p_email text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare m public.members; v_id uuid; e text := lower(btrim(p_email));
begin
  select * into m from public.members where id = p_member;
  if m.id is null or not public.is_self(p_member) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Digite um e-mail válido.'; end if;
  if exists (select 1 from public.email_requests where member_id = p_member and email = e and status = 'pending') then raise exception 'Esse pedido já está aguardando a Direção.'; end if;
  insert into public.email_requests (organization_id, member_id, email) values (m.organization_id, p_member, e) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.request_extra_email(uuid, text) from public, anon;
grant execute on function public.request_extra_email(uuid, text) to authenticated;

create or replace function public.review_email_request(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.email_requests;
begin
  select * into r from public.email_requests where id = p_id and status = 'pending';
  if r.id is null or not public.has_permission(r.organization_id, 'members.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if p_approve then
    insert into public.member_emails (organization_id, member_id, email) values (r.organization_id, r.member_id, r.email);
  end if;
  update public.email_requests set status = case when p_approve then 'approved' else 'rejected' end, reviewed_at = now() where id = p_id;
end $$;
revoke all on function public.review_email_request(uuid, boolean) from public, anon;
grant execute on function public.review_email_request(uuid, boolean) to authenticated;

-- Textos padrão da seção de Envio: novos formulários começam com eles (cada formulário pode mudar os seus).
create table public.form_send_defaults (
  organization_id uuid primary key references public.organizations(id),
  send_text text,
  confirmation_message text not null default 'Inscrição recebida!',
  review_message text not null default 'Recebemos a sua inscrição e a Direção está avaliando. Você receberá a confirmação por e-mail.',
  approved_email_text text not null default 'Sua inscrição foi aprovada. Obrigado por se inscrever! A Direção entrará em contato com os próximos passos.',
  rejected_email_text text not null default 'Agradecemos o seu interesse. Neste momento não foi possível aprovar a sua inscrição.',
  updated_at timestamptz not null default now()
);
alter table public.form_send_defaults enable row level security;
revoke all on public.form_send_defaults from anon, authenticated;
grant select, insert, update on public.form_send_defaults to authenticated;
create policy fsd_select on public.form_send_defaults for select to authenticated using (public.is_org_member(organization_id));
create policy fsd_insert on public.form_send_defaults for insert to authenticated with check (public.has_permission(organization_id, 'forms.manage'));
create policy fsd_update on public.form_send_defaults for update to authenticated using (public.has_permission(organization_id, 'forms.manage')) with check (public.has_permission(organization_id, 'forms.manage'));
