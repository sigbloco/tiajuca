-- Todo integrante nasce com o papel "Integrante" (base de acesso). Sem isso, quem é cadastrado por importação,
-- pelo formulário ou manualmente entraria no app sem nenhuma permissão ao vincular a conta. Papéis são cumulativos:
-- Professor, Monitor e Direção continuam sendo concedidos além do Integrante.

create or replace function public.grant_default_member_role() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
  select new.organization_id, new.id, ar.id
    from public.access_roles ar
   where ar.organization_id = new.organization_id and ar.key = 'integrante'
     and not exists (select 1 from public.member_access_roles x where x.member_id = new.id and x.access_role_id = ar.id and x.revoked_at is null);
  return new;
end $$;
revoke all on function public.grant_default_member_role() from public, anon, authenticated;

create trigger trg_members_default_role after insert on public.members
  for each row execute function public.grant_default_member_role();

-- Quem já existe e está sem o papel Integrante recebe agora.
insert into public.member_access_roles (organization_id, member_id, access_role_id)
select m.organization_id, m.id, ar.id
  from public.members m
  join public.access_roles ar on ar.organization_id = m.organization_id and ar.key = 'integrante'
 where m.archived_at is null
   and not exists (select 1 from public.member_access_roles x where x.member_id = m.id and x.access_role_id = ar.id and x.revoked_at is null);
