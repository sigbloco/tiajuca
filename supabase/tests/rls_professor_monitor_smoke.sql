-- Teste: papel de acesso único Professor/Monitor (migration 20261123160407). Esperado: erro "TESTES_OK_ROLLBACK".
-- Monitor registra presença de qualquer naipe; regente não amplia o grupo; o papel único reativa inativo do próprio grupo;
-- preço especial da loja e pastas do Drive valem para o papel único; 'monitor' não é mais papel de acesso.
begin;

do $$
declare
  org_a uuid; cyc uuid; ct uuid; atype uuid; act uuid; st_act uuid; st_ina uuid; sec_sopro uuid; sec_perc uuid; i_tromp uuid; i_tuba uuid; i_surdo uuid;
  fold uuid; n int; ok boolean;
  u_dir uuid := gen_random_uuid(); u_prof uuid := gen_random_uuid(); u_mon uuid := gen_random_uuid(); u_int uuid := gen_random_uuid();
  m_dir uuid; m_prof uuid; m_mon uuid; m_int uuid; m_tromp uuid; m_tuba uuid; m_surdo uuid;
begin
  insert into public.organizations (name, short_name, slug) values ('Org A', 'A', 'pm-a') returning id into org_a;
  perform public.seed_org_defaults(org_a); perform public.seed_org_cycle_defaults(org_a); perform public.seed_org_events_defaults(org_a);

  -- O seed já nasce com o papel único e sem 'monitor'
  if exists (select 1 from public.access_roles where organization_id = org_a and key = 'monitor') then raise exception 'FALHOU: seed criou o papel monitor'; end if;
  if (select name from public.access_roles where organization_id = org_a and key = 'professor') <> 'Professor/Monitor' then raise exception 'FALHOU: papel único sem o nome Professor/Monitor'; end if;
  insert into public.role_permissions (access_role_id, permission_key, scope)
    select id, 'drive.read', 'org' from public.access_roles where organization_id = org_a and key = 'professor' on conflict do nothing;

  insert into auth.users (id, email) values (u_dir,'d@pm.local'),(u_prof,'p@pm.local'),(u_mon,'m@pm.local'),(u_int,'i@pm.local');
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_dir,'Dir') returning id into m_dir;
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_prof,'Prof') returning id into m_prof;
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_mon,'Mon') returning id into m_mon;
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_int,'Int') returning id into m_int;
  insert into public.members (organization_id, full_name) values (org_a,'Aluno trompete') returning id into m_tromp;
  insert into public.members (organization_id, full_name) values (org_a,'Aluno tuba') returning id into m_tuba;
  insert into public.members (organization_id, full_name) values (org_a,'Aluno surdo') returning id into m_surdo;
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_a, m_dir, id from public.access_roles where organization_id = org_a and key = 'direcao';
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_a, x, id from public.access_roles, unnest(array[m_prof, m_mon]) x where organization_id = org_a and key = 'professor';

  insert into public.sections (organization_id, name) values (org_a, 'Sopro') returning id into sec_sopro;
  insert into public.sections (organization_id, name) values (org_a, 'Percussão') returning id into sec_perc;
  insert into public.instruments (organization_id, section_id, name) values (org_a, sec_sopro, 'Trompete') returning id into i_tromp;
  insert into public.instruments (organization_id, section_id, name) values (org_a, sec_sopro, 'Tuba') returning id into i_tuba;
  insert into public.instruments (organization_id, section_id, name) values (org_a, sec_perc, 'Surdo') returning id into i_surdo;
  select id into ct from public.cycle_types where organization_id = org_a and key = 'carnaval';
  select id into st_act from public.member_cycle_statuses where organization_id = org_a and key = 'active';
  select id into st_ina from public.member_cycle_statuses where organization_id = org_a and key = 'inactive';
  insert into public.cycles (organization_id, cycle_type_id, name, starts_on, ends_on, is_current)
    values (org_a, ct, 'Carnaval', current_date - 30, current_date + 120, true) returning id into cyc;
  insert into public.member_artistic_links (organization_id, member_id, instrument_id)
    values (org_a, m_tromp, i_tromp), (org_a, m_tuba, i_tuba), (org_a, m_surdo, i_surdo), (org_a, m_int, i_tromp);
  insert into public.member_cycles (organization_id, member_id, cycle_id, status_id)
    select org_a, x, cyc, st_act from unnest(array[m_prof, m_mon, m_int, m_tromp, m_surdo]) x;
  insert into public.member_cycles (organization_id, member_id, cycle_id, status_id) values (org_a, m_tuba, cyc, st_ina);
  -- Equipe: Prof é professor de trompete e regente da percussão; Mon é monitor de tuba.
  insert into public.staff_assignments (organization_id, member_id, staff_kind, instrument_id, cycle_id) values (org_a, m_prof, 'professor', i_tromp, cyc);
  insert into public.staff_assignments (organization_id, member_id, staff_kind, section_id, cycle_id) values (org_a, m_prof, 'regente', sec_perc, cyc);
  insert into public.staff_assignments (organization_id, member_id, staff_kind, instrument_id, cycle_id) values (org_a, m_mon, 'monitor', i_tuba, cyc);
  select id into atype from public.activity_types where organization_id = org_a and name = 'Ensaio';
  insert into public.activities (organization_id, activity_type_id, title, activity_date, cycle_id) values (org_a, atype, 'Ensaio geral', current_date, cyc) returning id into act;
  insert into public.drive_folders (organization_id, name, url) values (org_a, 'Sem regra', 'https://drive.google.com/drive/folders/pm1') returning id into fold;

  -- ── 'monitor' não existe mais como papel de acesso nem como coluna de liberação ──
  begin insert into public.page_releases (organization_id, page_key, category, released) values (org_a, 'inicio', 'monitor', true);
    raise exception 'FALHOU: page_releases aceitou a categoria monitor' using errcode = 'XX999'; exception when check_violation then null; end;

  -- ── Monitor (tuba): registra presença de integrante de outro naipe ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_mon, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.get_attendance_roster(act);
  if n <> 5 then raise exception 'FALHOU: monitor deveria ver a chamada inteira (5 ativos), viu %', n; end if;
  perform public.set_attendance(act, m_surdo, 'present');
  perform public.set_attendance(act, m_tromp, 'absent');
  perform public.clear_attendance(act, m_tromp);
  -- a chamada (função) mostra o status gravado; a leitura direta da tabela continua no escopo "Meu grupo"
  if (select status_id from public.get_attendance_roster(act) where member_id = m_surdo) is null then raise exception 'FALHOU: presença do surdo não gravada pelo monitor'; end if;
  -- Grupo dele continua sendo só a tuba (registrar não amplia o grupo de leitura)
  if public.is_in_my_group(org_a, m_surdo) then raise exception 'FALHOU: surdo entrou no grupo do monitor de tuba'; end if;
  if not public.is_in_my_group(org_a, m_tuba) then raise exception 'FALHOU: aluno de tuba deveria estar no grupo do monitor'; end if;

  -- ── Papel único reativa inativo do próprio grupo (monitor de tuba reativa o aluno de tuba) ──
  perform public.set_member_cycle_status(m_tuba, cyc, 'active');
  if (select s.counts_as_active from public.member_cycles mc join public.member_cycle_statuses s on s.id = mc.status_id where mc.member_id = m_tuba and mc.cycle_id = cyc) is not true then
    raise exception 'FALHOU: monitor do grupo deveria reativar o aluno de tuba'; end if;

  -- ── Drive vale para o papel único ──
  if not public.can_see_drive_folder(fold) then raise exception 'FALHOU: monitor deveria ver a pasta do Drive'; end if;
  reset role;
  -- ── Loja (funções só do servidor) ──
  if not public.shop_is_special(org_a, u_mon) then raise exception 'FALHOU: monitor deveria ter o preço especial da loja'; end if;
  if public.shop_active_member_id(org_a, u_mon) is distinct from m_mon then raise exception 'FALHOU: monitor deveria comprar como integrante ativo'; end if;
  if public.shop_is_special(org_a, u_int) then raise exception 'FALHOU: integrante comum com preço especial'; end if;

  -- ── Regente não amplia o grupo: Prof (professor de trompete, regente da percussão) ──
  update public.member_cycles set status_id = st_ina where member_id = m_surdo and cycle_id = cyc;
  perform set_config('request.jwt.claims', json_build_object('sub', u_prof, 'role','authenticated')::text, true);
  set local role authenticated;
  if public.is_in_my_group(org_a, m_surdo) then raise exception 'FALHOU: regência da percussão ampliou o grupo do professor'; end if;
  if not public.is_in_my_group(org_a, m_tromp) then raise exception 'FALHOU: aluno de trompete deveria estar no grupo do professor'; end if;
  if public.can_read_member(org_a, m_surdo) then raise exception 'FALHOU: professor leu ficha de quem só está na regência'; end if;
  begin perform public.set_member_cycle_status(m_surdo, cyc, 'active'); raise exception 'FALHOU: regente reativou inativo da regência' using errcode = 'XX999';
  exception when sqlstate '42501' then null; when sqlstate 'P0001' then null; end;
  -- mas registra presença de qualquer um (tem atribuição de professor)
  perform public.set_attendance(act, m_surdo, 'absent');
  reset role;
  -- _viewer_section (só do servidor): o naipe de quem preenche formulário ignora a regência
  if public._viewer_section(m_prof) is distinct from sec_sopro then raise exception 'FALHOU: naipe de quem preenche deveria vir da aula (sopro), não da regência'; end if;
  if public._viewer_section(m_mon) is distinct from sec_sopro then raise exception 'FALHOU: naipe do monitor sem instrumento próprio deveria vir da monitoria'; end if;

  -- ── Integrante comum: sem chamada, sem preço especial, só pasta com regra ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_int, 'role','authenticated')::text, true);
  set local role authenticated;
  begin perform * from public.get_attendance_roster(act); raise exception 'FALHOU: integrante abriu a chamada' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  if public.can_see_drive_folder(fold) then raise exception 'FALHOU: integrante viu pasta sem regra'; end if;
  reset role;

  -- ── Papel único sem atribuição na equipe: tem o papel, mas não registra presença de ninguém ──
  delete from public.staff_assignments where member_id = m_mon;
  perform set_config('request.jwt.claims', json_build_object('sub', u_mon, 'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.set_attendance(act, m_tromp, 'present'); raise exception 'FALHOU: papel sem atribuição registrou presença' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  reset role;

  raise exception 'TESTES_OK_ROLLBACK';
end $$;

rollback;
