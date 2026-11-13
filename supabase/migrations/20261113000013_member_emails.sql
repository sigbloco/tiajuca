-- Mais de um e-mail por integrante: o e-mail principal continua em members.email; os extras ficam aqui.
-- Qualquer um deles serve para a pessoa entrar com a conta Google e ser ligada ao cadastro.
create table public.member_emails (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  member_id uuid not null,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  created_at timestamptz not null default now(),
  unique (organization_id, email),
  foreign key (organization_id, member_id) references public.members (organization_id, id) on delete cascade
);
create index member_emails_member_idx on public.member_emails (member_id);
create trigger trg_audit_member_emails after insert or update or delete on public.member_emails for each row execute function public.fn_audit();

alter table public.member_emails enable row level security;
revoke all on public.member_emails from anon, authenticated;
grant select, insert, delete on public.member_emails to authenticated;
create policy memails_select on public.member_emails for select to authenticated using (public.has_permission(organization_id, 'members.manage'));
create policy memails_insert on public.member_emails for insert to authenticated with check (public.has_permission(organization_id, 'members.manage'));
create policy memails_delete on public.member_emails for delete to authenticated using (public.has_permission(organization_id, 'members.manage'));

-- O vínculo automático pelo e-mail passa a olhar o e-mail principal E os adicionais.
create or replace function public.link_my_member_by_email() returns int
language plpgsql security definer set search_path = '' as $$
declare v_email text; v_ok boolean; n int := 0; m record;
begin
  if auth.uid() is null then return 0; end if;
  select lower(email), (email_confirmed_at is not null) into v_email, v_ok from auth.users where id = auth.uid();
  if v_email is null or not coalesce(v_ok, false) then return 0; end if;
  for m in
    select mm.id, mm.organization_id from public.members mm
     where mm.user_id is null and mm.archived_at is null
       and (lower(mm.email) = v_email or exists (select 1 from public.member_emails e where e.member_id = mm.id and e.email = v_email))
  loop
    if exists (select 1 from public.members x where x.organization_id = m.organization_id and x.user_id = auth.uid()) then continue; end if;
    update public.members set user_id = auth.uid() where id = m.id and user_id is null;
    if found then
      n := n + 1;
      insert into public.audit_logs (organization_id, actor_user_id, actor_member_id, action, entity_type, entity_id)
      values (m.organization_id, auth.uid(), m.id, 'member_linked_by_email', 'members', m.id::text);
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.link_my_member_by_email() from public, anon;
grant execute on function public.link_my_member_by_email() to authenticated;
