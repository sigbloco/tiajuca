-- RLS: avaliar a permissão uma vez por organização, e não uma vez por linha.
--
-- Problema: as políticas de leitura de audit_logs, monthly_charges e event_attendance
-- chamam has_permission / permission_scope_of / is_self para CADA linha. Essas funções
-- são security definer com search_path fixo, então o Postgres não as embute na consulta.
-- Em audit_logs (15 mil linhas) a contagem da tela de Auditoria levava 17,7 s e estourava
-- o statement_timeout de 8 s do papel authenticated (erro 500 no PostgREST).
--
-- Correção: dois conjuntos calculados uma vez por consulta (subconsulta não correlacionada,
-- vira um "hashed SubPlan"): as organizações em que a pessoa tem a permissão com um alcance,
-- e os cadastros da própria pessoa. O resultado de cada política é o MESMO de antes:
--   has_permission(org, p)            = org in my_orgs_with_scope(p, 'org')
--   permission_scope_of(org, p) = 'group' = org in my_orgs_with_scope(p, 'group')
--   is_self(member_id)                = member_id in my_member_ids()
-- Medido (só leitura): a contagem de audit_logs cai de 17,7 s para 7 ms.

-- Organizações em que a pessoa logada tem a permissão com exatamente este alcance.
create or replace function public.my_orgs_with_scope(p_perm text, p_scope text default 'org')
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
    from public.members m
   where m.user_id = auth.uid()
     and m.archived_at is null
     and coalesce(public.permission_scope_of(m.organization_id, p_perm)::text = p_scope, false)
$$;

-- Cadastros da pessoa logada (o mesmo teste de is_self, como conjunto).
create or replace function public.my_member_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id
    from public.members m
   where m.user_id = auth.uid()
     and m.archived_at is null
$$;

revoke all on function public.my_orgs_with_scope(text, text) from public, anon;
revoke all on function public.my_member_ids() from public, anon;
grant execute on function public.my_orgs_with_scope(text, text) to authenticated;
grant execute on function public.my_member_ids() to authenticated;

-- Auditoria: antes, has_permission(organization_id, 'audit.read').
alter policy audit_select on public.audit_logs
  using (organization_id in (select public.my_orgs_with_scope('audit.read')));

-- Cobranças: antes, is_self(member_id) or has_permission(organization_id, 'billing.read').
alter policy mc_charges_select on public.monthly_charges
  using (
    organization_id in (select public.my_orgs_with_scope('billing.read'))
    or member_id in (select public.my_member_ids())
  );

-- Presença: antes, is_self(member_id) or has_permission(organization_id, 'attendance.read')
-- or (permission_scope_of(organization_id, 'attendance.read') = 'group' and is_in_my_group(organization_id, member_id)).
-- is_in_my_group continua por linha, mas só roda para quem tem alcance "grupo" (Professor/Monitor).
alter policy ea_select on public.event_attendance
  using (
    organization_id in (select public.my_orgs_with_scope('attendance.read'))
    or member_id in (select public.my_member_ids())
    or (
      organization_id in (select public.my_orgs_with_scope('attendance.read', 'group'))
      and public.is_in_my_group(organization_id, member_id)
    )
  );
