-- Teste de fumaça da Fase 3 (agenda, recorrência, chamada, isolamento). Rodar APÓS migration 0007.
-- Resultado esperado no SQL Editor: erro "TESTES_OK_ROLLBACK" (sentinela = tudo passou). "FALHOU: ..." = problema.
begin;

do $$
declare
  org_a uuid; org_b uuid; cyc uuid; ctype uuid; n int; atype uuid; sec_p uuid; i1 uuid; i2 uuid;
  act uuid; act_staff uuid; rule uuid; st_present uuid;
  u_dir uuid := gen_random_uuid(); u_prof uuid := gen_random_uuid(); u_st1 uuid := gen_random_uuid(); u_dirb uuid := gen_random_uuid();
  m_dir uuid; m_prof uuid; m_st1 uuid; m_st2 uuid; m_st3 uuid; m_dirb uuid;
begin
  insert into public.organizations (name, short_name, slug) values ('Org A', 'A', 'p3-a') returning id into org_a;
  insert into public.organizations (name, short_name, slug) values ('Org B', 'B', 'p3-b') returning id into org_b;
  perform public.seed_org_defaults(org_a); perform public.seed_org_defaults(org_b);
  perform public.seed_org_cycle_defaults(org_a); perform public.seed_org_cycle_defaults(org_b);
  perform public.seed_org_events_defaults(org_a); perform public.seed_org_events_defaults(org_b);
  insert into auth.users (id, email) values (u_dir,'d@p3.local'),(u_prof,'p@p3.local'),(u_st1,'s@p3.local'),(u_dirb,'db@p3.local');
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
  insert into public.instruments (organization_id, section_id, name) values (org_a, sec_p, 'Tamborim') returning id into i1;
  insert into public.instruments (organization_id, section_id, name) values (org_a, sec_p, 'Surdo') returning id into i2;
  select id into ctype from public.cycle_types where organization_id=org_a and key='carnaval';
  insert into public.cycles (organization_id, cycle_type_id, name, starts_on, ends_on, is_current)
    values (org_a, ctype, 'Carnaval', current_date - 30, current_date + 120, true) returning id into cyc;
  -- Aluno1 e Aluno2 ativos (Tamborim); Aluno3 inativo (Surdo)
  insert into public.member_artistic_links (organization_id, member_id, instrument_id) values (org_a, m_st1, i1), (org_a, m_st2, i1), (org_a, m_st3, i2);
  insert into public.member_cycles (organization_id, member_id, cycle_id, status_id)
    select org_a, m, cyc, (select id from public.member_cycle_statuses where organization_id = org_a and key = 'active')
    from unnest(array[m_st1, m_st2]) m;
  insert into public.member_cycles (organization_id, member_id, cycle_id, status_id)
    values (org_a, m_st3, cyc, (select id from public.member_cycle_statuses where organization_id = org_a and key = 'inactive'));
  insert into public.staff_assignments (organization_id, member_id, staff_kind, instrument_id) values (org_a, m_prof, 'professor', i1);
  select id into atype from public.activity_types where organization_id = org_a and name = 'Ensaio';
  select id into st_present from public.attendance_statuses where organization_id = org_a and key = 'present';

  -- ── Direção: cria eventos, recorrência idempotente ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_dir, 'role','authenticated')::text, true);
  set local role authenticated;
  insert into public.activities (organization_id, activity_type_id, title, activity_date)
    values (org_a, atype, 'Ensaio geral', current_date) returning id into act;
  insert into public.activities (organization_id, activity_type_id, title, activity_date, visibility)
    values (org_a, atype, 'Reunião da equipe', current_date, 'staff') returning id into act_staff;
  insert into public.recurrence_rules (organization_id, activity_type_id, title, weekday, starts_on)
    values (org_a, atype, 'Ensaio semanal', 1, current_date) returning id into rule;
  select public.materialize_recurrences(org_a, current_date + 28) into n;
  if n < 3 then raise exception 'FALHOU: recorrência deveria gerar ao menos 3 segundas em 4 semanas, gerou %', n; end if;
  select public.materialize_recurrences(org_a, current_date + 28) into n;
  if n <> 0 then raise exception 'FALHOU: materialização não é idempotente (gerou % de novo)', n; end if;

  -- ── Chamada: roster = ativos no ciclo (Aluno3 inativo fica de fora) ──
  select count(*) into n from public.get_attendance_roster(act);
  if n <> 2 then raise exception 'FALHOU: Direção deveria ver 2 elegíveis (Aluno1 e Aluno2 ativos; Aluno3 inativo fora), viu %', n; end if;

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_prof, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.get_attendance_roster(act);
  if n <> 2 then raise exception 'FALHOU: Professor deveria ver só seu grupo ativo (Aluno1, Aluno2), viu %', n; end if;
  perform public.set_attendance(act, m_st1, 'present');
  perform public.set_attendance(act, m_st2, 'absent', 'avisou');
  perform public.set_attendance(act, m_st2, 'justified');  -- troca de status (upsert)
  select count(*) into n from public.event_attendance where activity_id = act;
  if n <> 2 then raise exception 'FALHOU: deveria haver 2 registros de presença, há %', n; end if;
  select count(*) into n from public.event_attendance where activity_id = act and status_id = st_present;
  if n <> 1 then raise exception 'FALHOU: deveria haver 1 presente'; end if;
  begin
    perform public.set_attendance(act, m_st3, 'present');
    raise exception 'FALHOU: Professor registrou presença fora do grupo' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  -- Professor não cria/edita eventos
  begin
    insert into public.activities (organization_id, activity_type_id, title, activity_date) values (org_a, atype, 'Intruso', current_date);
    raise exception 'FALHOU: Professor criou evento' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  -- Professor (equipe) enxerga evento só-equipe
  select count(*) into n from public.activities where id = act_staff;
  if n <> 1 then raise exception 'FALHOU: equipe deveria ver evento restrito à equipe'; end if;

  -- ── Aluno: vê evento público, não vê evento da equipe; vê só a própria presença; não faz chamada ──
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_st1, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.activities where id = act;
  if n <> 1 then raise exception 'FALHOU: aluno deveria ver o ensaio'; end if;
  select count(*) into n from public.activities where id = act_staff;
  if n <> 0 then raise exception 'FALHOU: aluno viu evento só da equipe'; end if;
  select count(*) into n from public.event_attendance;
  if n <> 1 then raise exception 'FALHOU: aluno deveria ver só a própria presença, viu %', n; end if;
  begin
    perform public.set_attendance(act, m_st1, 'absent');
    raise exception 'FALHOU: aluno alterou a própria presença' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.get_attendance_roster(act);
    raise exception 'FALHOU: aluno abriu a chamada' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.event_attendance (organization_id, activity_id, member_id, status_id) values (org_a, act, m_st3, st_present);
    raise exception 'FALHOU: aluno gravou presença direto na tabela' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;

  -- ── Direção B: isolamento ──
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_dirb, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.activities where organization_id = org_a;
  if n <> 0 then raise exception 'FALHOU: Direção B viu eventos da org A'; end if;
  select count(*) into n from public.event_attendance;
  if n <> 0 then raise exception 'FALHOU: Direção B viu presenças da org A'; end if;
  begin
    perform public.set_attendance(act, m_st1, 'present');
    raise exception 'FALHOU: Direção B registrou presença na org A' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  begin
    perform public.materialize_recurrences(org_a, current_date + 7);
    raise exception 'FALHOU: Direção B gerou eventos na org A' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;

  -- ── Encerrar recorrência cancela futuros sem presença (Direção) ──
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_dir, 'role','authenticated')::text, true);
  set local role authenticated;
  select public.end_recurrence(rule) into n;
  select count(*) into n from public.activities where recurrence_rule_id = rule and status = 'scheduled' and activity_date > current_date;
  if n <> 0 then raise exception 'FALHOU: ainda há ocorrências futuras agendadas após encerrar (%)', n; end if;

  reset role;
  raise exception 'TESTES_OK_ROLLBACK';
end $$;

rollback;
