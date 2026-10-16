-- Quem está INATIVO no ciclo atual perde o acesso: não enxerga dados da organização nem exerce papel algum
-- (Professor, Monitor, etc.), mesmo que o papel continue cadastrado. Reativar a pessoa devolve tudo na hora.
-- Exceções de segurança: Titular e Direção nunca perdem o acesso por isso (evita trancar o bloco para fora);
-- quem não tem registro no ciclo atual NÃO é bloqueado (só a situação inativa explícita bloqueia); sem ciclo atual, ninguém é bloqueado.

create or replace function public.member_is_inactive(p_member uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.member_cycles mc
      join public.cycles c on c.id = mc.cycle_id and c.is_current
      join public.member_cycle_statuses s on s.id = mc.status_id and not s.counts_as_active and not s.is_waitlist
     where mc.member_id = p_member
  ) and not exists (
    select 1 from public.member_access_roles mar join public.access_roles ar on ar.id = mar.access_role_id
     where mar.member_id = p_member and mar.revoked_at is null and ar.key in ('titular', 'direcao')
  )
$$;
revoke all on function public.member_is_inactive(uuid) from public, anon, authenticated;

create or replace function public.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members m
    join public.organizations o on o.id = m.organization_id and o.is_active
    where m.organization_id = p_org and m.user_id = auth.uid() and m.archived_at is null
      and not public.member_is_inactive(m.id)
  )
$$;

create or replace function public.permission_scope_of(p_org uuid, p_perm text)
returns public.permission_scope
language sql stable security definer set search_path = '' as $$
  select rp.scope
  from public.members m
  join public.member_access_roles mar on mar.member_id = m.id and mar.revoked_at is null
  join public.role_permissions rp on rp.access_role_id = mar.access_role_id
  where m.organization_id = p_org and m.user_id = auth.uid() and m.archived_at is null
    and rp.permission_key = p_perm
    and not public.member_is_inactive(m.id)
  order by rp.scope desc
  limit 1
$$;

-- O app precisa saber que a pessoa está inativa para mostrar o aviso (sem papéis nem permissões).
create or replace function public.get_my_memberships() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'organization_id', o.id, 'slug', o.slug, 'name', o.name, 'short_name', o.short_name,
    'logo_path', o.logo_path, 'theme', o.theme, 'timezone', o.timezone,
    'member_id', m.id, 'display_name', coalesce(m.display_name, m.full_name),
    'inactive', public.member_is_inactive(m.id),
    'roles', case when public.member_is_inactive(m.id) then '[]'::jsonb else coalesce((
      select jsonb_agg(ar.key order by ar.rank desc)
      from public.member_access_roles mar join public.access_roles ar on ar.id = mar.access_role_id
      where mar.member_id = m.id and mar.revoked_at is null), '[]'::jsonb) end,
    'permissions', case when public.member_is_inactive(m.id) then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('key', x.k, 'scope', x.s::text))
      from (select rp.permission_key k, max(rp.scope) s
            from public.member_access_roles mar
            join public.role_permissions rp on rp.access_role_id = mar.access_role_id
            where mar.member_id = m.id and mar.revoked_at is null
            group by rp.permission_key) x), '[]'::jsonb) end
  )), '[]'::jsonb)
  from public.members m
  join public.organizations o on o.id = m.organization_id and o.is_active
  where m.user_id = auth.uid() and m.archived_at is null
$$;
revoke all on function public.get_my_memberships() from public, anon;
grant execute on function public.get_my_memberships() to authenticated;
