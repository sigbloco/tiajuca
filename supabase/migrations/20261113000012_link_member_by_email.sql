-- Entrada só com Google (sem cadastro aberto): quem tem cadastro de integrante e entra com a conta Google do MESMO e-mail
-- (verificado pelo Google) é vinculado ao cadastro automaticamente, sem precisar de convite.
-- Regras: e-mail da conta confirmado; igualdade exata (sem diferenciar maiúsculas); cadastro ativo e ainda sem conta;
-- a conta não pode já estar ligada a outro cadastro da mesma organização.
create or replace function public.link_my_member_by_email() returns int
language plpgsql security definer set search_path = '' as $$
declare v_email text; v_ok boolean; n int := 0; m record;
begin
  if auth.uid() is null then return 0; end if;
  select email, (email_confirmed_at is not null) into v_email, v_ok from auth.users where id = auth.uid();
  if v_email is null or not coalesce(v_ok, false) then return 0; end if;
  for m in
    select id, organization_id from public.members
     where lower(email) = lower(v_email) and user_id is null and archived_at is null
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
