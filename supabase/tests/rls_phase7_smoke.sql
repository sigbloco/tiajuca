-- Teste de fumaça da Fase 7 (checklists, relatórios de presença, faltas consecutivas, resumo da Direção, auditoria).
-- Rodar APÓS migration 0011. Resultado esperado: erro "TESTES_OK_ROLLBACK" (= tudo passou).
begin;

do $$
declare
  org_a uuid; org_b uuid; n int; cyc uuid; ctype uuid; atype uuid; sec uuid; i1 uuid; i2 uuid;
  tpl uuid; ti1 uuid; act uuid; it1 uuid; it2 uuid; st_p uuid; st_a uuid; d int; r record; j jsonb;
  u_dir uuid := gen_random_uuid(); u_prof uuid := gen_random_uuid(); u_st1 uuid := gen_random_uuid(); u_dirb uuid := gen_random_uuid();
  m_dir uuid; m_prof uuid; m_st1 uuid; m_st2 uuid; m_st3 uuid; m_dirb uuid; a_id uuid;
begin
  insert into public.organizations (name, short_name, slug) values ('Org A', 'A', 'p7-a') returning id into org_a;
  insert into public.organizations (name, short_name, slug) values ('Org B', 'B', 'p7-b') returning id into org_b;
  perform public.seed_org_defaults(org_a); perform public.seed_org_defaults(org_b);
  perform public.seed_org_cycle_defaults(org_a); perform public.seed_org_events_defaults(org_a); perform public.seed_org_events_defaults(org_b);
  insert into auth.users (id, email) values (u_dir,'d@p7.local'),(u_prof,'p@p7.local'),(u_st1,'s@p7.local'),(u_dirb,'db@p7.local');
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
  insert into public.sections (organization_id, name) values (org_a, 'Percussão') returning id into sec;
  insert into public.instruments (organization_id, section_id, name) values (org_a, sec, 'Tamborim') returning id into i1;
  insert into public.instruments (organization_id, section_id, name) values (org_a, sec, 'Surdo') returning id into i2;
  insert into public.member_artistic_links (organization_id, member_id, instrument_id) values (org_a, m_st1, i1), (org_a, m_st2, i1), (org_a, m_st3, i2);
  insert into public.staff_assignments (organization_id, member_id, staff_kind, instrument_id) values (org_a, m_prof, 'professor', i1);
  select id into ctype from public.cycle_types where organization_id=org_a and key='carnaval';
  insert into public.cycles (organization_id, cycle_type_id, name, starts_on, ends_on, is_current)
    values (org_a, ctype, 'Carnaval', current_date - 60, current_date + 120, true) returning id into cyc;
  insert into public.member_cycles (organization_id, member_id, cycle_id, status_id)
    select org_a, m, cyc, (select id from public.member_cycle_statuses where organization_id=org_a and key='active') from unnest(array[m_st1, m_st2]) m;
  insert into public.member_cycles (organization_id, member_id, cycle_id, status_id)
    values (org_a, m_st3, cyc, (select id from public.member_cycle_statuses where organization_id=org_a and key='inactive'));
  select id into atype from public.activity_types where organization_id = org_a and name = 'Ensaio';
  select id into st_p from public.attendance_statuses where organization_id = org_a and key = 'present';
  select id into st_a from public.attendance_statuses where organization_id = org_a and key = 'absent';

  -- 4 ensaios passados: Aluno1 = presente no mais antigo e 3 faltas seguidas; Aluno2 sempre presente; Aluno3 sempre ausente
  for d in 1..4 loop
    insert into public.activities (organization_id, activity_type_id, cycle_id, title, activity_date) values (org_a, atype, cyc, 'Ensaio ' || d, current_date - d) returning id into a_id;
    insert into public.event_attendance (organization_id, activity_id, member_id, status_id) values
      (org_a, a_id, m_st1, case when d = 4 then st_p else st_a end), (org_a, a_id, m_st2, st_p), (org_a, a_id, m_st3, st_a);
  end loop;

  insert into public.checklist_templates (organization_id, name) values (org_a, 'Cortejo') returning id into tpl;
  insert into public.checklist_template_items (organization_id, template_id, title, sort_order) values (org_a, tpl, 'Hidratação', 1) returning id into ti1;
  insert into public.checklist_template_items (organization_id, template_id, title, sort_order) values (org_a, tpl, 'Tenda', 2), (org_a, tpl, 'Estandarte', 3);
  insert into public.activities (organization_id, activity_type_id, title, activity_date) values (org_a, atype, 'Cortejo', current_date + 10) returning id into act;

  -- ── Direção: checklist ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_dir, 'role','authenticated')::text, true);
  set local role authenticated;
  select public.apply_checklist_template(act, tpl) into n;
  if n <> 3 then raise exception 'FALHOU: modelo deveria copiar 3 tarefas, copiou %', n; end if;
  select public.apply_checklist_template(act, tpl) into n;
  if n <> 0 then raise exception 'FALHOU: aplicar o modelo de novo duplicou tarefas (%)', n; end if;
  update public.checklist_template_items set title = 'Hidratação (alterada)' where id = ti1;
  select count(*) into n from public.activity_checklist_items where activity_id = act and title = 'Hidratação';
  if n <> 1 then raise exception 'FALHOU: editar o modelo alterou a cópia no evento'; end if;
  select id into it1 from public.activity_checklist_items where activity_id = act and title = 'Hidratação';
  select id into it2 from public.activity_checklist_items where activity_id = act and title = 'Tenda';
  perform public.add_checklist_item(act, 'Tarefa própria do evento');
  perform public.update_checklist_item(it1, null, null, m_st1, true);
  begin perform public.update_checklist_item(it2, 'done', null, m_st1, true, 'x'); perform public.update_checklist_item(it2, 'invalido');
    raise exception 'FALHOU: aceitou status inválido' using errcode = 'XX999'; exception when sqlstate '22023' then null; end;
  select count(*) into n from public.audit_logs where entity_type = 'activity_checklist_items';
  if n < 4 then raise exception 'FALHOU: checklist não está sendo auditado (%)', n; end if;

  -- ── Aluno responsável por um item: só status/observação, só do próprio item ──
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_st1, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.activity_checklist_items where activity_id = act;
  if n <> 4 then raise exception 'FALHOU: aluno deveria ver o checklist do evento (viu %)', n; end if;
  perform public.update_checklist_item(it1, 'done', 'feito');
  select count(*) into n from public.activity_checklist_items where id = it1 and status = 'done' and notes = 'feito';
  if n <> 1 then raise exception 'FALHOU: responsável não conseguiu concluir o próprio item'; end if;
  begin perform public.update_checklist_item(it1, null, null, null, false, 'novo título'); raise exception 'FALHOU: responsável mudou o título' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  begin perform public.update_checklist_item(it2, 'done'); raise exception 'FALHOU: aluno alterou item de outra pessoa' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  begin perform public.add_checklist_item(act, 'x'); raise exception 'FALHOU: aluno adicionou tarefa' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  begin perform public.apply_checklist_template(act, tpl); raise exception 'FALHOU: aluno aplicou modelo' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  select count(*) into n from public.checklist_templates; if n <> 0 then raise exception 'FALHOU: aluno viu modelos'; end if;
  begin perform * from public.attendance_report(org_a, current_date - 30, current_date, 'member'); raise exception 'FALHOU: aluno abriu relatório' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  begin perform public.dashboard_direction(org_a); raise exception 'FALHOU: aluno abriu o painel da Direção' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  select count(*) into n from public.audit_logs; if n <> 0 then raise exception 'FALHOU: aluno viu a auditoria'; end if;

  -- ── Professor: relatório só do seu grupo; sem gerir checklist ──
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_prof, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.attendance_report(org_a, current_date - 30, current_date, 'member');
  if n <> 2 then raise exception 'FALHOU: Professor deveria ver 2 integrantes no relatório (Aluno1, Aluno2), viu %', n; end if;
  select count(*) into n from public.attendance_report(org_a, current_date - 30, current_date, 'member') where label = 'Aluno3';
  if n <> 0 then raise exception 'FALHOU: relatório do Professor vazou aluno de fora do grupo'; end if;
  select count(*) into n from public.absence_streaks(org_a, 3);
  if n <> 1 then raise exception 'FALHOU: Professor deveria ver só 1 pessoa com 3+ faltas no grupo, viu %', n; end if;
  begin perform public.apply_checklist_template(act, tpl); raise exception 'FALHOU: Professor aplicou modelo' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  begin perform public.dashboard_direction(org_a); raise exception 'FALHOU: Professor abriu painel da Direção' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;

  -- ── Direção: relatórios e painel ──
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_dir, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.attendance_report(org_a, current_date - 30, current_date, 'member') where label = 'Aluno1' and records = 4 and present = 1 and pct = 25.0;
  if n <> 1 then raise exception 'FALHOU: Aluno1 deveria ter 1/4 = 25%%'; end if;
  select count(*) into n from public.attendance_report(org_a, current_date - 30, current_date, 'member') where label = 'Aluno2' and pct = 100.0;
  if n <> 1 then raise exception 'FALHOU: Aluno2 deveria ter 100%%'; end if;
  select count(*) into n from public.attendance_report(org_a, current_date - 30, current_date, 'instrument') where label = 'Tamborim' and records = 8 and present = 5 and pct = 62.5;
  if n <> 1 then raise exception 'FALHOU: relatório por instrumento (Tamborim 5/8 = 62,5%%)'; end if;
  select count(*) into n from public.attendance_report(org_a, current_date - 30, current_date, 'section') where label = 'Percussão' and records = 12;
  if n <> 1 then raise exception 'FALHOU: relatório por naipe'; end if;
  select count(*) into n from public.attendance_report(org_a, current_date - 30, current_date, 'activity'); if n <> 4 then raise exception 'FALHOU: por atividade deveria ter 4 (%)', n; end if;
  select count(*) into n from public.attendance_report(org_a, current_date - 30, current_date, 'cycle') where label = 'Carnaval'; if n <> 1 then raise exception 'FALHOU: por ciclo'; end if;
  select count(*) into n from public.attendance_report(org_a, current_date - 30, current_date, 'month'); if n < 1 then raise exception 'FALHOU: por mês'; end if;
  begin perform * from public.attendance_report(org_a, current_date - 30, current_date, 'qualquer'); raise exception 'FALHOU: aceitou agrupamento inválido' using errcode = 'XX999';
  exception when sqlstate '22023' then null; end;
  select streak into n from public.absence_streaks(org_a, 3) where display_name = 'Aluno1';
  if n is distinct from 3 then raise exception 'FALHOU: Aluno1 deveria ter 3 faltas seguidas, tem %', n; end if;
  select streak into n from public.absence_streaks(org_a, 3) where display_name = 'Aluno3';
  if n is distinct from 4 then raise exception 'FALHOU: Aluno3 deveria ter 4 faltas seguidas, tem %', n; end if;
  select count(*) into n from public.absence_streaks(org_a, 3) where display_name = 'Aluno2'; if n <> 0 then raise exception 'FALHOU: Aluno2 não deveria aparecer'; end if;
  j := public.dashboard_direction(org_a);
  if (j->>'members_total')::int <> 5 or (j->>'members_active')::int <> 2 or (j->>'members_inactive')::int <> 1 then
    raise exception 'FALHOU: painel incorreto %', left(j::text, 200); end if;
  if j::text ~* 'gender|race|is_trans|pcd' then raise exception 'FALHOU: painel contém dado sensível'; end if;
  select count(*) into n from public.audit_logs; if n = 0 then raise exception 'FALHOU: Direção deveria ver a auditoria'; end if;

  -- ── Direção de outra organização ──
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_dirb, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.activity_checklist_items; if n <> 0 then raise exception 'FALHOU: Direção B viu checklists da org A'; end if;
  select count(*) into n from public.checklist_templates; if n <> 0 then raise exception 'FALHOU: Direção B viu modelos da org A'; end if;
  begin perform public.apply_checklist_template(act, tpl); raise exception 'FALHOU: Direção B aplicou modelo na org A' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  begin perform * from public.attendance_report(org_a, current_date - 30, current_date, 'member'); raise exception 'FALHOU: Direção B abriu relatório da org A' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  begin perform public.dashboard_direction(org_a); raise exception 'FALHOU: Direção B abriu painel da org A' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  select count(*) into n from public.audit_logs where organization_id = org_a; if n <> 0 then raise exception 'FALHOU: Direção B viu auditoria da org A'; end if;

  reset role;
  raise exception 'TESTES_OK_ROLLBACK';
end $$;

rollback;
