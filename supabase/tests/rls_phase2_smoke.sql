-- Teste de fumaça da Fase 2 (naipe → subnaipe → instrumento, grupos, vagas, histórico, isolamento).
-- Rodar APÓS migrations 0004-0006. Sempre termina desfazendo tudo.
-- Resultado esperado no SQL Editor: erro "TESTES_OK_ROLLBACK" (sentinela = todas as verificações passaram).
-- Qualquer outra mensagem ("FALHOU: ...") indica problema.
begin;

do $$
declare
  org_a uuid; org_b uuid; cyc uuid; n int; ctype uuid;
  sec_p uuid; sec_s uuid; sub_leves uuid; i1 uuid; i2 uuid; i3 uuid;
  u_dir uuid := gen_random_uuid(); u_prof uuid := gen_random_uuid();
  u_st1 uuid := gen_random_uuid(); u_dirb uuid := gen_random_uuid();
  m_dir uuid; m_prof uuid; m_st1 uuid; m_st2 uuid; m_st3 uuid; m_dirb uuid;
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

  insert into public.sections (organization_id, name) values (org_a, 'Percussão') returning id into sec_p;
  insert into public.sections (organization_id, name) values (org_a, 'Sopro') returning id into sec_s;
  insert into public.subsections (organization_id, section_id, name) values (org_a, sec_p, 'Leves') returning id into sub_leves;
  insert into public.instruments (organization_id, section_id, subsection_id, name) values (org_a, sec_p, sub_leves, 'Tamborim') returning id into i1;
  insert into public.instruments (organization_id, section_id, name) values (org_a, sec_p, 'Surdo') returning id into i2;
  insert into public.instruments (organization_id, section_id, name) values (org_a, sec_s, 'Flauta') returning id into i3;
  select id into ctype from public.cycle_types where organization_id=org_a and key='carnaval';
  insert into public.cycles (organization_id, cycle_type_id, name, starts_on, ends_on)
    values (org_a, ctype, 'Carnaval 2026/2027', '2026-10-01', '2027-03-31') returning id into cyc;
  insert into public.member_artistic_links (organization_id, member_id, instrument_id) values
    (org_a, m_st1, i1), (org_a, m_st2, i1), (org_a, m_st3, i2);
  -- Professor acompanha apenas o subnaipe "Leves" (→ instrumento Tamborim)
  insert into public.staff_assignments (organization_id, member_id, staff_kind, subsection_id)
    values (org_a, m_prof, 'professor', sub_leves);
  insert into public.instrument_cycle_capacity (organization_id, instrument_id, cycle_id, capacity) values (org_a, i1, cyc, 1);

  -- ── Professor: grupo expandido do subnaipe ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_prof, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.members;
  if n <> 3 then raise exception 'FALHOU: Professor deveria ver 3 (Tamborim x2 + si), viu %', n; end if;
  select count(*) into n from public.members where full_name = 'Aluno3';
  if n <> 0 then raise exception 'FALHOU: Professor viu aluno fora do subnaipe'; end if;
  select count(*) into n from public.subsections;
  if n <> 1 then raise exception 'FALHOU: equipe deveria ver o subnaipe (viu %)', n; end if;

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
    raise exception 'FALHOU: Professor alterou status fora do grupo' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  begin
    perform public.log_sensitive_access(m_st1);
    raise exception 'FALHOU: Professor registrou acesso a dado sensível' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  perform public.set_member_cycle_status(m_st2, cyc, 'waitlist', null, i1);
  update public.instrument_cycle_capacity set capacity = 99 where instrument_id = i1;
  select count(*) into n from public.instrument_cycle_capacity where capacity = 99;
  if n > 0 then raise exception 'FALHOU: Professor alterou capacidade'; end if;

  -- ── Direção ──
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_dir, 'role','authenticated')::text, true);
  set local role authenticated;
  perform public.set_member_cycle_status(m_st2, cyc, 'active', 'exceção autorizada', null, true);
  select count(*) into n from public.member_cycle_status_history;
  if n < 3 then raise exception 'FALHOU: histórico incompleto (%)', n; end if;
  select public.instrument_occupied(i1, cyc) into n;
  if n <> 2 then raise exception 'FALHOU: ocupação esperada 2, veio %', n; end if;
  perform public.create_member_invite(m_st2);
  -- subnaipe de outro naipe é rejeitado (integridade)
  begin
    insert into public.instruments (organization_id, section_id, subsection_id, name) values (org_a, sec_s, sub_leves, 'Invalido');
    raise exception 'FALHOU: instrumento aceitou subnaipe de outro naipe' using errcode = 'XX999';
  exception when foreign_key_violation then null; end;
  -- atribuição por naipe inteiro passa a incluir também o Surdo
  insert into public.staff_assignments (organization_id, member_id, staff_kind, section_id)
    values (org_a, m_prof, 'professor', sec_p);

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_prof, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.members;
  if n <> 4 then raise exception 'FALHOU: com naipe inteiro Professor deveria ver 4, viu %', n; end if;

  -- ── Integrante (aluno): nunca vê subnaipes; não altera status; não convida ──
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_st1, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.subsections;
  if n <> 0 then raise exception 'FALHOU: aluno enxergou subnaipe (%)', n; end if;
  select count(*) into n from public.instruments;
  if n <> 3 then raise exception 'FALHOU: aluno deveria ver instrumentos (viu %)', n; end if;
  begin
    perform public.set_member_cycle_status(m_st1, cyc, 'inactive');
    raise exception 'FALHOU: Integrante alterou status' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  begin
    perform public.create_member_invite(m_st2);
    raise exception 'FALHOU: Integrante criou convite' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;

  -- ── Direção de outra organização: isolamento total ──
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_dirb, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.cycles where organization_id = org_a;
  if n <> 0 then raise exception 'FALHOU: Direção B viu ciclos da org A'; end if;
  select count(*) into n from public.sections where organization_id = org_a;
  if n <> 0 then raise exception 'FALHOU: Direção B viu naipes da org A'; end if;
  select count(*) into n from public.instruments where organization_id = org_a;
  if n <> 0 then raise exception 'FALHOU: Direção B viu instrumentos da org A'; end if;
  select count(*) into n from public.member_cycles;
  if n <> 0 then raise exception 'FALHOU: Direção B viu participações da org A'; end if;
  begin
    perform public.set_member_cycle_status(m_st1, cyc, 'inactive');
    raise exception 'FALHOU: Direção B alterou status na org A' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  begin
    perform public.create_member_invite(m_st2);
    raise exception 'FALHOU: Direção B criou convite na org A' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;

  reset role;
  raise exception 'TESTES_OK_ROLLBACK';
end $$;

rollback;
