-- Loja · quem recebe o preço de integrante. Regra: integrante ATIVO no ciclo atual (direção, professores, monitores e alunos incluídos).
--   • conta ativa = tem cadastro não arquivado, vinculado ao login, e NÃO está inativo no ciclo atual;
--   • E (tem registro "ativo" no ciclo atual  OU  tem papel de equipe: titular, direção, professor ou monitor).
-- Ficam de fora: inativos, lista de espera e quem não tem registro no ciclo atual nem papel de equipe (ex.: conta recém-criada sem vínculo).

create or replace function public.shop_active_member_id(p_org uuid, p_user uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.id from public.members m
   where m.organization_id = p_org and m.user_id = p_user and m.archived_at is null
     and not public.member_is_inactive(m.id)
     and (
       exists (
         select 1 from public.member_cycles mc
           join public.cycles c on c.id = mc.cycle_id and c.is_current
           join public.member_cycle_statuses s on s.id = mc.status_id and s.counts_as_active and not s.is_waitlist
          where mc.member_id = m.id)
       or exists (
         select 1 from public.member_access_roles mar
           join public.access_roles ar on ar.id = mar.access_role_id and ar.key in ('titular', 'direcao', 'professor', 'monitor')
          where mar.member_id = m.id and mar.revoked_at is null)
     )
   limit 1
$$;
revoke all on function public.shop_active_member_id(uuid, uuid) from public, anon, authenticated;
