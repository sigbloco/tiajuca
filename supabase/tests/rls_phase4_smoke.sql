-- Teste de fumaça da Fase 4 (categorias, bolsas, geração idempotente, ajustes, indicadores, privacidade, isolamento).
-- Rodar APÓS migration 0008. Resultado esperado no SQL Editor: erro "TESTES_OK_ROLLBACK" (= tudo passou).
begin;

do $$
declare
  org_a uuid; org_b uuid; cyc uuid; ctype uuid; n int; r jsonb; comp date := date_trunc('month', current_date)::date;
  cat_a uuid; cat_m uuid; ch1 uuid; ch2 uuid; amt numeric; st text; d date;
  u_dir uuid := gen_random_uuid(); u_prof uuid := gen_random_uuid(); u_st1 uuid := gen_random_uuid(); u_dirb uuid := gen_random_uuid();
  m_dir uuid; m_prof uuid; m_st1 uuid; m_st2 uuid; m_st3 uuid; m_st4 uuid; m_dirb uuid; act_id uuid;
begin
  insert into public.organizations (name, short_name, slug) values ('Org A', 'A', 'p4-a') returning id into org_a;
  insert into public.organizations (name, short_name, slug) values ('Org B', 'B', 'p4-b') returning id into org_b;
  perform public.seed_org_defaults(org_a); perform public.seed_org_defaults(org_b);
  perform public.seed_org_cycle_defaults(org_a);
  insert into auth.users (id, email) values (u_dir,'d@p4.local'),(u_prof,'p@p4.local'),(u_st1,'s@p4.local'),(u_dirb,'db@p4.local');
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_dir,'Dir') returning id into m_dir;
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_prof,'Prof') returning id into m_prof;
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_st1,'Aluno1') returning id into m_st1;
  insert into public.members (organization_id, full_name) values (org_a,'Musico2') returning id into m_st2;
  insert into public.members (organization_id, full_name) values (org_a,'SemCategoria3') returning id into m_st3;
  insert into public.members (organization_id, full_name) values (org_a,'AlunoInativo4') returning id into m_st4;
  insert into public.members (organization_id, user_id, full_name) values (org_b,u_dirb,'DirB') returning id into m_dirb;
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_a, m_dir, id from public.access_roles where organization_id=org_a and key='direcao';
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_a, m_prof, id from public.access_roles where organization_id=org_a and key='professor';
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_a, m_st1, id from public.access_roles where organization_id=org_a and key='integrante';
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_b, m_dirb, id from public.access_roles where organization_id=org_b and key='direcao';

  select id into ctype from public.cycle_types where organization_id=org_a and key='carnaval';
  insert into public.cycles (organization_id, cycle_type_id, name, starts_on, ends_on, is_current)
    values (org_a, ctype, 'Carnaval', current_date - 30, current_date + 120, true) returning id into cyc;
  insert into public.member_cycles (organization_id, member_id, cycle_id, status_id)
    select org_a, m, cyc, (select id from public.member_cycle_statuses where organization_id=org_a and key='active') from unnest(array[m_st1, m_st2]) m;
  insert into public.member_cycles (organization_id, member_id, cycle_id, status_id)
    values (org_a, m_st4, cyc, (select id from public.member_cycle_statuses where organization_id=org_a and key='inactive'));
  insert into public.fee_categories (organization_id, name) values (org_a, 'Aluno') returning id into cat_a;
  insert into public.fee_categories (organization_id, name) values (org_a, 'Músico') returning id into cat_m;
  -- feriado: sábado 10/10/2026 → segunda 12/10 é feriado → próximo dia útil = 13/10
  insert into public.holidays (organization_id, day, name) values (org_a, '2026-10-12', 'Aparecida');
  if public.next_business_day(org_a, '2026-10-10') <> '2026-10-13' then
    raise exception 'FALHOU: next_business_day(10/10/2026) deveria ser 13/10/2026'; end if;

  -- ── Direção configura e gera ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_dir, 'role','authenticated')::text, true);
  set local role authenticated;
  perform public.set_fee_price(cat_a, 150, current_date - 365);
  perform public.set_fee_price(cat_m, 50, current_date - 365);
  perform public.assign_fee_category(m_st1, cat_a, current_date - 60);
  perform public.assign_fee_category(m_st2, cat_m, current_date - 60);
  perform public.assign_fee_category(m_st4, cat_a, current_date - 60);
  perform public.set_scholarship(m_st1, 50, current_date - 60, null, 'teste');
  perform public.set_scholarship(m_st2, 100, current_date - 60);
  begin
    perform public.set_scholarship(m_st1, 101);
    raise exception 'FALHOU: aceitou bolsa acima de 100 por cento' using errcode = 'XX999';
  exception when numeric_value_out_of_range then null; end;

  r := public.generate_monthly_charges(org_a, comp);
  if (r->>'created')::int <> 2 then raise exception 'FALHOU: deveria criar 2 cobranças (Aluno1, Musico2), criou %', r; end if;
  r := public.generate_monthly_charges(org_a, comp);
  if (r->>'created')::int <> 0 or (r->>'already_existing')::int <> 2 then raise exception 'FALHOU: geração não é idempotente: %', r; end if;
  select count(*) into n from public.monthly_charges where competence = comp;
  if n <> 2 then raise exception 'FALHOU: deveria haver 2 cobranças, há %', n; end if;

  select id, final_amount, status, due_on into ch1, amt, st, d from public.monthly_charges where member_id = m_st1 and competence = comp;
  if amt <> 75 or st <> 'pending' then raise exception 'FALHOU: Aluno1 deveria dever 75 pendente, deve % (%)', amt, st; end if;
  if extract(isodow from d) in (6, 7) or d < comp + 9 then raise exception 'FALHOU: vencimento inválido: %', d; end if;
  select id, final_amount, status into ch2, amt, st from public.monthly_charges where member_id = m_st2 and competence = comp;
  if amt <> 0 or st <> 'exempt' then raise exception 'FALHOU: bolsa 100%% deveria ser isenta (%, %)', amt, st; end if;

  -- ajuste manual com registro; sem motivo é recusado
  begin
    perform public.adjust_charge(ch1, 60, '  ');
    raise exception 'FALHOU: ajuste sem motivo foi aceito' using errcode = 'XX999';
  exception when sqlstate '22023' then null; end;
  perform public.adjust_charge(ch1, 60, 'desconto combinado');
  select count(*) into n from public.charge_adjustments where charge_id = ch1 and original_amount = 75 and new_amount = 60;
  if n <> 1 then raise exception 'FALHOU: ajuste não foi registrado'; end if;
  perform public.mark_charge_paid(ch1, current_date, 'PIX');
  begin
    perform public.mark_charge_paid(ch1, current_date, 'PIX');
    raise exception 'FALHOU: pagou duas vezes' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;

  -- reajuste de preço NÃO altera cobrança já gerada; indicadores
  perform public.set_fee_price(cat_a, 200, current_date);
  select final_amount into amt from public.monthly_charges where id = ch1;
  if amt <> 60 then raise exception 'FALHOU: mudança de preço alterou cobrança existente (%)', amt; end if;
  select count(*) into n from public.v_billing_summary where organization_id = org_a and competence = comp
     and recebido = 60 and pendente = 0 and isento = 50 and impacto_bolsas = 125 and previsto = 60 and inadimplentes = 0;
  if n <> 1 then raise exception 'FALHOU: resumo da competência incorreto'; end if;
  select count(*) into n from public.scholarship_indicators(org_a) where bolsistas = 2 and soma_percentual = 150
     and equivalente_integrais = 1.50 and impacto_estimado = 150;
  if n <> 1 then raise exception 'FALHOU: indicadores de bolsa incorretos'; end if;
  perform public.change_charge_status(ch1, 'pending');   -- reabrir paga → pendente
  select status into st from public.monthly_charges where id = ch1;
  if st <> 'pending' then raise exception 'FALHOU: reabrir cobrança'; end if;

  -- ── Professor: sem acesso ao financeiro ──
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_prof, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.monthly_charges;
  if n <> 0 then raise exception 'FALHOU: Professor viu cobranças'; end if;
  select count(*) into n from public.scholarships;
  if n <> 0 then raise exception 'FALHOU: Professor viu bolsas'; end if;
  select count(*) into n from public.member_fee_assignments;
  if n <> 0 then raise exception 'FALHOU: Professor viu categorias dos integrantes'; end if;
  begin perform public.generate_monthly_charges(org_a, comp); raise exception 'FALHOU: Professor gerou cobranças' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  begin perform public.set_scholarship(m_st1, 100); raise exception 'FALHOU: Professor concedeu bolsa' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  begin perform public.adjust_charge(ch1, 1, 'x'); raise exception 'FALHOU: Professor ajustou cobrança' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  begin perform * from public.scholarship_indicators(org_a); raise exception 'FALHOU: Professor leu indicadores de bolsa' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;

  -- ── Aluno: só o que é seu ──
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_st1, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.monthly_charges;
  if n <> 1 then raise exception 'FALHOU: aluno deveria ver só a própria cobrança, viu %', n; end if;
  select count(*) into n from public.scholarships;
  if n <> 1 then raise exception 'FALHOU: aluno deveria ver só a própria bolsa, viu %', n; end if;
  begin perform public.mark_charge_paid(ch1, current_date); raise exception 'FALHOU: aluno baixou a própria mensalidade' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  begin
    update public.monthly_charges set final_amount = 0 where id = ch1;
    get diagnostics n = row_count;
    if n > 0 then raise exception 'FALHOU: aluno alterou o valor da própria cobrança' using errcode = 'XX999'; end if;
  exception when insufficient_privilege then null; end;
  begin
    insert into public.monthly_charges (organization_id, member_id, competence, fee_category_id, base_amount, final_amount, due_on)
      values (org_a, m_st1, comp + interval '1 month', cat_a, 1, 1, current_date);
    raise exception 'FALHOU: aluno inseriu cobrança direto' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;

  -- ── Direção de outra organização ──
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_dirb, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.monthly_charges;
  if n <> 0 then raise exception 'FALHOU: Direção B viu cobranças da org A'; end if;
  select count(*) into n from public.fee_categories where organization_id = org_a;
  if n <> 0 then raise exception 'FALHOU: Direção B viu categorias da org A'; end if;
  begin perform public.generate_monthly_charges(org_a, comp); raise exception 'FALHOU: Direção B gerou cobranças na org A' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  begin perform public.mark_charge_paid(ch1, current_date); raise exception 'FALHOU: Direção B baixou cobrança da org A' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  begin perform public.set_scholarship(m_st1, 10); raise exception 'FALHOU: Direção B concedeu bolsa na org A' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;

  -- ── Constraint: duplicidade barrada pelo banco (mesmo como dono) ──
  reset role;
  begin
    insert into public.monthly_charges (organization_id, member_id, competence, fee_category_id, base_amount, final_amount, due_on)
      values (org_a, m_st1, comp, cat_a, 1, 1, current_date);
    raise exception 'FALHOU: banco aceitou cobrança duplicada' using errcode = 'XX999';
  exception when unique_violation then null; end;

  raise exception 'TESTES_OK_ROLLBACK';
end $$;

rollback;
