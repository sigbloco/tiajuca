-- Teste de fumaça da Fase 2 (grupo por naipe, vagas, histórico, isolamento). Rodar APÓS a migration 0004.
-- Termina em ROLLBACK. Falhas lançam "FALHOU: ...".
begin;

do $$
declare
  org_a uuid; org_b uuid; cyc uuid; area uuid; s1 uuid; s2 uuid; n int;
  u_dir uuid := gen_random_uuid(); u_prof uuid := gen_random_uuid();
  u_st1 uuid := gen_random_uuid(); u_dirb uuid := gen_random_uuid();
  m_dir uuid; m_prof uuid; m_st1 uuid; m_st2 uuid; m_st3 uuid; m_dirb uuid; ctype uuid;
begin
  insert into public.organizations (name, short_name, slug) values ('Org A', 'A', 'p2-a') returning id into org_a;
  insert into public.organizations (name, short_name, slug) values ('Org B', 'B', 'p2-b') returning id into org_b;
  perform public.seed_org_defaults(org_a); perform public.seed_org_defaults(org_b);
  perform public.seed_org_cycle_defaults(org_a); perform public.seed_org_cycle_defaults(org_b);
  insert into auth.users (id, email) values (u_dir,'d@p2.local'),(u_prof,'p@p2.local'),(u_st1,'s@p2.local'),(u_dirb,'db@p2.local');

  insert into public.members (organization_id, user_id, full_name) values (org_a,u_dir,'Dir') returning id into m_dir;
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_prof,'Prof') returning id into m_prof;
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_st1,'Aluno1') returning id into m_st1;
  insert into public.members (organization_id, full_name) values (org_a,'Aluno2') returning id into m_st2;
  insert into public.members (organization_id, full_name) values (org_a,'Aluno3') returning id into m_st3;
  insert into public.members (organization_id, user_id, full_name) values (org_b,u_dirb,'DirB') returning id into m_dirb;
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_a, m_dir, id from public.access_roles where organization_id=org_a and key='direcao';
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_a, m_prof, id from public.access_roles where organization_id=org_a and key='professor';
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_a, m_st1, id from public.access_roles where organization_id=org_a and key='integrante';
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_b, m_dirb, id from public.access_roles where organization_id=org_b and key='direcao';

  insert into public.areas (organization_id, name) values (org_a,'Sopro') returning id into area;
  insert into public.sections (organization_id, area_id, name) values (org_a, area, 'S1') returning id into s1;
  insert into public.sections (organization_id, area_id, name) values (org_a, area, 'S2') returning id into s2;
  select id into ctype from public.cycle_types where organization_id=org_a and key='carnaval';
  insert into public.cycles (organization_id, cycle_type_id, name, starts_on, ends_on)
    values (org_a, ctype, 'Carnaval 2026/2027', '2026-10-01', '2027-03-31') returning id into cyc;
  insert into public.member_artistic_links (organization_id, member_id, area_id, section_id) values
    (org_a, m_st1, area, s1), (org_a, m_st2, area, s1), (org_a, m_st3, area, s2);
  insert into public.staff_section_assignments (organization_id, member_id, section_id, staff_kind)
    values (org_a, m_prof, s1, 'professor');
  insert into public.section_cycle_capacity (organization_id, section_id, cycle_id, capacity) values (org_a, s1, cyc, 1);

  -- 1. Professor enxerga só o grupo (alunos do naipe S1) + a si mesmo
  perform set_config('request.jwt.claims', json_build_object('sub', u_prof, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.members;
  if n <> 3 then raise exception 'FALHOU: Professor deveria ver 3 (S1 x2 + si), viu %', n; end if;
  select count(*) into n from public.members where full_name = 'Aluno3';
  if n <> 0 then raise exception 'FALHOU: Professor viu aluno de outro naipe'; end if;
  raise notice 'OK 1: escopo de grupo por naipe';

  -- 2. Vagas: 1º ativa; 2º é barrado; professor não força; Direção força
  perform public.set_member_cycle_status(m_st1, cyc, 'active');
  begin
    perform public.set_member_cycle_status(m_st2, cyc, 'active');
    raise exception 'FALHOU: ativou além do limite' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
  begin
    perform public.set_member_cycle_status(m_st2, cyc, 'active', null, null, true);
    raise exception 'FALHOU: Professor forçou exceção de vaga' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
  begin
    perform public.set_member_cycle_status(m_st3, cyc, 'active');
    raise exception 'FALHOU: Professor alterou status fora do grupo';
  exception when insufficient_privilege then null; end;
  perform public.set_member_cycle_status(m_st2, cyc, 'waitlist', null, s1);
  raise notice 'OK 2: limite de vagas respeitado; lista de espera permitida';

  -- 3. Professor não altera limite de vagas
  begin
    update public.section_cycle_capacity set capacity = 99 where section_id = s1;
    select count(*) into n from public.section_cycle_capacity where capacity = 99;
    if n > 0 then raise exception 'FALHOU: Professor alterou capacidade'; end if;
  end;

  -- 4. Direção força exceção e há histórico
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_dir, 'role','authenticated')::text, true);
  set local role authenticated;
  perform public.set_member_cycle_status(m_st2, cyc, 'active', 'exceção autorizada', null, true);
  select count(*) into n from public.member_cycle_status_history;
  if n < 3 then raise exception 'FALHOU: histórico incompleto (%)', n; end if;
  select public.section_occupied(s1, cyc) into n;
  if n <> 2 then raise exception 'FALHOU: ocupação esperada 2, veio %', n; end if;
  raise notice 'OK 3/4: exceção da Direção e histórico de status';

  -- 5. Integrante não altera status
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_st1, 'role','authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.set_member_cycle_status(m_st1, cyc, 'inactive');
    raise exception 'FALHOU: Integrante alterou status';
  exception when insufficient_privilege then null; end;
  raise notice 'OK 5: integrante sem permissão de status';

  -- 6. Isolamento entre organizações
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_dirb, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.cycles where organization_id = org_a;
  if n <> 0 then raise exception 'FALHOU: Direção B viu ciclos da org A'; end if;
  select count(*) into n from public.sections where organization_id = org_a;
  if n <> 0 then raise exception 'FALHOU: Direção B viu naipes da org A'; end if;
  select count(*) into n from public.member_cycles;
  if n <> 0 then raise exception 'FALHOU: Direção B viu participações da org A'; end if;
  begin
    perform public.set_member_cycle_status(m_st1, cyc, 'inactive');
    raise exception 'FALHOU: Direção B alterou status na org A';
  exception when insufficient_privilege then null; end;
  raise notice 'OK 6: isolamento entre organizações';

  reset role;
  raise notice 'TODOS OS TESTES DA FASE 2 PASSARAM';
end $$;

rollback;
