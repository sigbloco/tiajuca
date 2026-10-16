-- Teste: inativo fica com acesso limitado e só volta com autorização. Rodar APÓS a migration 0021.
-- Esperado: erro "TESTES_OK_ROLLBACK".
begin;

do $$
declare
  org_a uuid; cyc uuid; ct uuid; st_act uuid; st_ina uuid; sec uuid; inst uuid; inst2 uuid; req uuid; r jsonb;
  u_dir uuid := gen_random_uuid(); u_prof uuid := gen_random_uuid(); u_mon uuid := gen_random_uuid(); u_dirina uuid := gen_random_uuid();
  u_newb uuid := gen_random_uuid(); u_stu uuid := gen_random_uuid();
  m_dir uuid; m_prof uuid; m_mon uuid; m_dirina uuid; m_newb uuid; m_stu uuid;
begin
  insert into public.organizations (name, short_name, slug) values ('Org A', 'A', 'in-a') returning id into org_a;
  perform public.seed_org_defaults(org_a); perform public.seed_org_cycle_defaults(org_a);
  insert into auth.users (id, email) values (u_dir,'d@in.local'),(u_prof,'p@in.local'),(u_mon,'m@in.local'),(u_dirina,'di@in.local'),(u_newb,'n@in.local'),(u_stu,'s@in.local');
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_dir,'Dir') returning id into m_dir;
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_prof,'Prof') returning id into m_prof;
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_mon,'Mon') returning id into m_mon;
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_dirina,'Direcao inativa') returning id into m_dirina;
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_newb,'Novo sem ciclo') returning id into m_newb;
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_stu,'Aluno') returning id into m_stu;
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_a, m_dir, id from public.access_roles where organization_id = org_a and key = 'direcao';
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_a, m_dirina, id from public.access_roles where organization_id = org_a and key = 'direcao';
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_a, m_prof, id from public.access_roles where organization_id = org_a and key = 'professor';
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_a, m_mon, id from public.access_roles where organization_id = org_a and key = 'monitor';
  select id into ct from public.cycle_types where organization_id = org_a and key = 'carnaval';
  select id into st_act from public.member_cycle_statuses where organization_id = org_a and key = 'active';
  select id into st_ina from public.member_cycle_statuses where organization_id = org_a and key = 'inactive';
  insert into public.sections (organization_id, name) values (org_a, 'Sopro') returning id into sec;
  insert into public.instruments (organization_id, section_id, name) values (org_a, sec, 'Trompete') returning id into inst;
  insert into public.member_artistic_links (organization_id, member_id, instrument_id) values (org_a, m_stu, inst), (org_a, m_mon, inst);
  insert into public.staff_assignments (organization_id, member_id, staff_kind, instrument_id) values (org_a, m_prof, 'professor', inst);
  insert into public.cycles (organization_id, cycle_type_id, name, starts_on, ends_on, status, is_current)
    values (org_a, ct, 'Ciclo', '2026-06-01', '2027-02-28', 'open', true) returning id into cyc;
  insert into public.member_cycles (organization_id, member_id, cycle_id, status_id) values (org_a, m_mon, cyc, st_act);
  insert into public.member_cycles (organization_id, member_id, cycle_id, status_id) values (org_a, m_dirina, cyc, st_ina);
  insert into public.member_cycles (organization_id, member_id, cycle_id, status_id) values (org_a, m_prof, cyc, st_act);
  insert into public.member_cycles (organization_id, member_id, cycle_id, status_id) values (org_a, m_stu, cyc, st_ina);

  -- monitor ATIVO tem poder de monitor
  perform set_config('request.jwt.claims', json_build_object('sub', u_mon, 'role','authenticated')::text, true);
  set local role authenticated;
  if public.permission_scope_of(org_a, 'attendance.record') is null then raise exception 'FALHOU: monitor ativo deveria registrar presença'; end if;
  reset role;

  -- monitor INATIVO: continua membro, mas só vê o que é "próprio" (leitura) e perde o resto
  update public.member_cycles set status_id = st_ina where member_id = m_mon and cycle_id = cyc;
  set local role authenticated;
  if not public.is_org_member(org_a) then raise exception 'FALHOU: inativo deveria continuar membro'; end if;
  if public.permission_scope_of(org_a, 'attendance.record') is not null then raise exception 'FALHOU: inativo ainda registra presença'; end if;
  if public.permission_scope_of(org_a, 'events.read') is not null then raise exception 'FALHOU: inativo ainda vê eventos'; end if;
  if public.permission_scope_of(org_a, 'members.read')::text <> 'own' then raise exception 'FALHOU: inativo deveria ler só o próprio cadastro'; end if;
  if public.permission_scope_of(org_a, 'billing.read')::text <> 'own' then raise exception 'FALHOU: inativo deveria ver só as próprias mensalidades'; end if;
  r := public.get_my_memberships() -> 0;
  if (r ->> 'inactive')::boolean is not true then raise exception 'FALHOU: memberships deveria vir marcado inativo'; end if;
  if exists (select 1 from jsonb_array_elements(r -> 'permissions') p where p ->> 'scope' <> 'own') then raise exception 'FALHOU: permissões do inativo deveriam ser só próprias: %', r; end if;
  if exists (select 1 from jsonb_array_elements_text(r -> 'roles') x where x in ('monitor', 'professor', 'direcao')) then raise exception 'FALHOU: papéis de equipe vazaram para o inativo'; end if;
  -- inativo pede para voltar (uma vez só)
  req := public.request_reactivation(org_a, 'Quero voltar');
  begin perform public.request_reactivation(org_a, 'de novo'); raise exception 'FALHOU: aceitou dois pedidos' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
  -- e não consegue se reativar sozinho
  begin perform public.set_member_cycle_status(m_mon, cyc, 'active'); raise exception 'FALHOU: inativo se reativou' using errcode = 'XX999';
  exception when sqlstate '42501' then null; end;
  begin perform public.decide_reactivation(req, true); raise exception 'FALHOU: inativo aprovou o próprio pedido' using errcode = 'XX999';
  exception when sqlstate '42501' then null; end;
  reset role;

  -- Direção NUNCA é limitada, mesmo marcada como inativa
  perform set_config('request.jwt.claims', json_build_object('sub', u_dirina, 'role','authenticated')::text, true);
  set local role authenticated;
  if not public.has_permission(org_a, 'members.manage') then raise exception 'FALHOU: Direção inativa deveria manter as permissões'; end if;
  begin perform public.request_reactivation(org_a); raise exception 'FALHOU: Direção não precisa pedir' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
  reset role;

  -- quem não tem registro no ciclo atual não é limitado
  perform set_config('request.jwt.claims', json_build_object('sub', u_newb, 'role','authenticated')::text, true);
  set local role authenticated;
  if (public.get_my_memberships() -> 0 ->> 'inactive')::boolean is true then raise exception 'FALHOU: sem registro no ciclo não é inativo'; end if;
  reset role;

  -- Monitor (mesmo ativo) NÃO reativa ninguém
  update public.member_cycles set status_id = st_act where member_id = m_mon and cycle_id = cyc;
  insert into public.staff_assignments (organization_id, member_id, staff_kind, instrument_id) values (org_a, m_mon, 'monitor', inst);
  perform set_config('request.jwt.claims', json_build_object('sub', u_mon, 'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.set_member_cycle_status(m_stu, cyc, 'active'); raise exception 'FALHOU: monitor reativou um inativo' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
  reset role;

  -- Professor do grupo reativa; a decisão do pedido aprova e reativa
  update public.member_cycles set status_id = st_ina where member_id = m_mon and cycle_id = cyc;
  perform set_config('request.jwt.claims', json_build_object('sub', u_prof, 'role','authenticated')::text, true);
  set local role authenticated;
  perform public.decide_reactivation(req, false, 'agora não');
  if (select status from public.reactivation_requests where id = req) <> 'rejected' then raise exception 'FALHOU: pedido deveria estar recusado'; end if;
  perform public.set_member_cycle_status(m_stu, cyc, 'active');
  if (select s.counts_as_active from public.member_cycles mc join public.member_cycle_statuses s on s.id = mc.status_id where mc.member_id = m_stu and mc.cycle_id = cyc) is not true then
    raise exception 'FALHOU: professor do grupo deveria reativar o aluno'; end if;
  begin perform public.decide_reactivation(req, true); raise exception 'FALHOU: decidiu duas vezes' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
  reset role;

  -- Professor de OUTRO grupo não decide por quem não é do seu grupo
  update public.member_cycles set status_id = st_ina where member_id = m_stu and cycle_id = cyc;
  delete from public.staff_assignments where member_id = m_prof;
  perform set_config('request.jwt.claims', json_build_object('sub', u_prof, 'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.set_member_cycle_status(m_stu, cyc, 'active'); raise exception 'FALHOU: professor fora do grupo reativou' using errcode = 'XX999';
  exception when sqlstate '42501' then null; when sqlstate 'P0001' then null; end;
  reset role;

  -- Direção reativa qualquer um
  perform set_config('request.jwt.claims', json_build_object('sub', u_dir, 'role','authenticated')::text, true);
  set local role authenticated;
  perform public.set_member_cycle_status(m_stu, cyc, 'active');
  reset role;

  raise exception 'TESTES_OK_ROLLBACK';
end $$;

rollback;
