-- Teste: inativo perde o acesso. Rodar APÓS a migration 0021. Esperado: erro "TESTES_OK_ROLLBACK".
begin;

do $$
declare
  org_a uuid; cyc uuid; ct uuid; st_act uuid; st_ina uuid; n int; r jsonb;
  u_dir uuid := gen_random_uuid(); u_mon uuid := gen_random_uuid(); u_new uuid := gen_random_uuid(); u_dirina uuid := gen_random_uuid();
  m_dir uuid; m_mon uuid; m_new uuid; m_dirina uuid;
begin
  insert into public.organizations (name, short_name, slug) values ('Org A', 'A', 'in-a') returning id into org_a;
  perform public.seed_org_defaults(org_a); perform public.seed_org_cycle_defaults(org_a);
  insert into auth.users (id, email) values (u_dir,'d@in.local'),(u_mon,'m@in.local'),(u_new,'n@in.local'),(u_dirina,'di@in.local');
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_dir,'Dir') returning id into m_dir;
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_mon,'Mon') returning id into m_mon;
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_new,'Novo sem ciclo') returning id into m_new;
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_dirina,'Direcao inativa') returning id into m_dirina;
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_a, m_dir, id from public.access_roles where organization_id = org_a and key = 'direcao';
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_a, m_dirina, id from public.access_roles where organization_id = org_a and key = 'direcao';
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_a, m_mon, id from public.access_roles where organization_id = org_a and key = 'monitor';
  select id into ct from public.cycle_types where organization_id = org_a and key = 'carnaval';
  select id into st_act from public.member_cycle_statuses where organization_id = org_a and key = 'active';
  select id into st_ina from public.member_cycle_statuses where organization_id = org_a and key = 'inactive';

  -- sem ciclo atual: ninguém é bloqueado
  perform set_config('request.jwt.claims', json_build_object('sub', u_mon, 'role','authenticated')::text, true);
  set local role authenticated;
  if not public.is_org_member(org_a) then raise exception 'FALHOU: sem ciclo atual o monitor deveria ser membro'; end if;
  reset role;

  insert into public.cycles (organization_id, cycle_type_id, name, starts_on, ends_on, status, is_current)
    values (org_a, ct, 'Ciclo', '2026-06-01', '2027-02-28', 'open', true) returning id into cyc;
  insert into public.member_cycles (organization_id, member_id, cycle_id, status_id) values (org_a, m_mon, cyc, st_act);
  insert into public.member_cycles (organization_id, member_id, cycle_id, status_id) values (org_a, m_dirina, cyc, st_ina);

  -- monitor ATIVO: tem acesso e permissão
  perform set_config('request.jwt.claims', json_build_object('sub', u_mon, 'role','authenticated')::text, true);
  set local role authenticated;
  if not public.is_org_member(org_a) then raise exception 'FALHOU: monitor ativo deveria ser membro'; end if;
  if public.permission_scope_of(org_a, 'attendance.record') is null then raise exception 'FALHOU: monitor ativo deveria ter permissão'; end if;
  reset role;

  -- monitor INATIVO: perde tudo
  update public.member_cycles set status_id = st_ina where member_id = m_mon and cycle_id = cyc;
  set local role authenticated;
  if public.is_org_member(org_a) then raise exception 'FALHOU: monitor inativo ainda é membro'; end if;
  if public.permission_scope_of(org_a, 'attendance.record') is not null then raise exception 'FALHOU: monitor inativo ainda tem permissão'; end if;
  r := public.get_my_memberships() -> 0;
  if (r ->> 'inactive')::boolean is not true or jsonb_array_length(r -> 'permissions') <> 0 or jsonb_array_length(r -> 'roles') <> 0 then
    raise exception 'FALHOU: memberships do inativo deveria vir sem papéis e marcado inativo: %', r; end if;
  reset role;

  -- reativar devolve o acesso
  update public.member_cycles set status_id = st_act where member_id = m_mon and cycle_id = cyc;
  set local role authenticated;
  if not public.is_org_member(org_a) then raise exception 'FALHOU: reativado deveria voltar a ser membro'; end if;
  reset role;

  -- Direção NUNCA é bloqueada, mesmo marcada como inativa
  perform set_config('request.jwt.claims', json_build_object('sub', u_dirina, 'role','authenticated')::text, true);
  set local role authenticated;
  if not public.is_org_member(org_a) then raise exception 'FALHOU: Direção marcada inativa não pode perder o acesso'; end if;
  if not public.has_permission(org_a, 'members.manage') then raise exception 'FALHOU: Direção inativa deveria manter as permissões'; end if;
  reset role;

  -- quem não tem registro no ciclo atual não é bloqueado
  perform set_config('request.jwt.claims', json_build_object('sub', u_new, 'role','authenticated')::text, true);
  set local role authenticated;
  if not public.is_org_member(org_a) then raise exception 'FALHOU: pessoa sem registro no ciclo não deveria ser bloqueada'; end if;
  reset role;

  raise exception 'TESTES_OK_ROLLBACK';
end $$;

rollback;
