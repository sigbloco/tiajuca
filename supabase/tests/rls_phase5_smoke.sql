-- Teste de fumaça da Fase 5 (financeiro, distribuição, PIX, pagamentos da equipe, privacidade, isolamento).
-- Rodar APÓS migration 0009. Resultado esperado: erro "TESTES_OK_ROLLBACK" (= tudo passou).
begin;

do $$
declare
  org_a uuid; org_b uuid; n int; comp date := date_trunc('month', current_date)::date;
  c_inc uuid; c_exp uuid; e_inc uuid; e_exp uuid; d_dir uuid; d_prof uuid; d_cash uuid; pay uuid; cat_a uuid;
  amt numeric; snap text; s record;
  u_dir uuid := gen_random_uuid(); u_prof uuid := gen_random_uuid(); u_st1 uuid := gen_random_uuid(); u_dirb uuid := gen_random_uuid();
  m_dir uuid; m_prof uuid; m_st1 uuid; m_dirb uuid;
begin
  insert into public.organizations (name, short_name, slug) values ('Org A', 'A', 'p5-a') returning id into org_a;
  insert into public.organizations (name, short_name, slug) values ('Org B', 'B', 'p5-b') returning id into org_b;
  perform public.seed_org_defaults(org_a); perform public.seed_org_defaults(org_b);
  perform public.seed_org_finance_defaults(org_a); perform public.seed_org_finance_defaults(org_b);
  insert into auth.users (id, email) values (u_dir,'d@p5.local'),(u_prof,'p@p5.local'),(u_st1,'s@p5.local'),(u_dirb,'db@p5.local');
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_dir,'Dir') returning id into m_dir;
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_prof,'Prof') returning id into m_prof;
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_st1,'Aluno1') returning id into m_st1;
  insert into public.members (organization_id, user_id, full_name) values (org_b,u_dirb,'DirB') returning id into m_dirb;
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_a, m_dir, id from public.access_roles where organization_id=org_a and key='direcao';
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_a, m_prof, id from public.access_roles where organization_id=org_a and key='professor';
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_a, m_st1, id from public.access_roles where organization_id=org_a and key='integrante';
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_b, m_dirb, id from public.access_roles where organization_id=org_b and key='direcao';
  select id into c_inc from public.finance_categories where organization_id = org_a and kind = 'income' and name = 'Outras receitas';
  select id into c_exp from public.finance_categories where organization_id = org_a and kind = 'expense' and name = 'Aluguel de espaço';
  select id into d_dir from public.distribution_destinations where organization_id = org_a and name = 'Direção';
  select id into d_prof from public.distribution_destinations where organization_id = org_a and name = 'Professores';
  select id into d_cash from public.distribution_destinations where organization_id = org_a and name = 'Caixa do bloco';
  -- uma mensalidade paga de R$ 150 no mês (entra como receita no razão, sem duplicar)
  insert into public.fee_categories (organization_id, name) values (org_a, 'Aluno') returning id into cat_a;
  insert into public.monthly_charges (organization_id, member_id, competence, fee_category_id, base_amount, final_amount, status, due_on, paid_on)
    values (org_a, m_st1, comp, cat_a, 150, 150, 'paid', current_date, current_date);

  -- ── Direção ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_dir, 'role','authenticated')::text, true);
  set local role authenticated;
  e_inc := public.post_financial_entry(org_a, c_inc, 'Venda de camisetas', 1000, current_date);
  e_exp := public.post_financial_entry(org_a, c_exp, 'Aluguel do espaço', 200, current_date);
  begin perform public.post_financial_entry(org_a, c_inc, 'zero', 0, current_date);
    raise exception 'FALHOU: aceitou valor zero' using errcode = 'XX999'; exception when numeric_value_out_of_range then null; end;
  begin
    perform public.post_financial_entry(org_a, (select id from public.finance_categories where organization_id = org_b limit 1), 'x', 10, current_date);
    raise exception 'FALHOU: aceitou categoria de outra org' using errcode = 'XX999'; exception when sqlstate 'P0002' then null; end;
  select * into s from public.finance_month_summary(org_a, comp);
  if s.receita_mensalidades <> 150 or s.receita_outras <> 1000 or s.despesas <> 200 or s.saldo <> 950 then
    raise exception 'FALHOU: resumo incorreto %', row_to_json(s); end if;

  -- cancelamento rastreável (motivo obrigatório; sem apagar)
  begin perform public.cancel_financial_entry(e_exp, ' '); raise exception 'FALHOU: cancelou sem motivo' using errcode = 'XX999';
  exception when sqlstate '22023' then null; end;
  perform public.cancel_financial_entry(e_exp, 'lançado por engano');
  begin perform public.cancel_financial_entry(e_exp, 'de novo'); raise exception 'FALHOU: cancelou duas vezes' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
  select count(*) into n from public.financial_entries where id = e_exp and status = 'cancelled' and cancel_reason is not null;
  if n <> 1 then raise exception 'FALHOU: cancelamento não ficou registrado'; end if;
  select * into s from public.finance_month_summary(org_a, comp);
  if s.despesas <> 0 then raise exception 'FALHOU: despesa cancelada ainda conta (%)', s.despesas; end if;

  -- distribuição: soma ≤ 100% por base; cálculo com fixo + percentuais
  insert into public.distribution_rules (organization_id, destination_id, mode, percent, base) values (org_a, d_dir, 'percent', 30, 'gross_income');
  insert into public.distribution_rules (organization_id, destination_id, mode, percent, base) values (org_a, d_prof, 'percent', 20, 'gross_income');
  insert into public.distribution_rules (organization_id, destination_id, mode, fixed_amount) values (org_a, d_cash, 'fixed', 100);
  begin
    insert into public.distribution_rules (organization_id, destination_id, mode, percent, base) values (org_a, d_cash, 'percent', 60, 'gross_income');
    raise exception 'FALHOU: aceitou soma de percentuais acima de 100' using errcode = 'XX999';
  exception when check_violation then null; end;
  insert into public.distribution_rules (organization_id, destination_id, mode, percent, base) values (org_a, d_cash, 'percent', 60, 'net_after_fixed'); -- outra base: permitido
  select count(*) into n from public.compute_distribution(org_a, comp) where
    (destination_name = 'Direção' and total = 345) or (destination_name = 'Professores' and total = 230);
  if n <> 2 then raise exception 'FALHOU: cálculo da distribuição (Direção 30%% e Professores 20%% de 1150)'; end if;
  select count(*) into n from public.compute_distribution(org_a, comp) where destination_name = 'Caixa do bloco' and fixed_total = 100 and percent_total = 630;
  if n <> 1 then raise exception 'FALHOU: caixa = 100 fixos + 60%% de (1150-100)=630'; end if;

  -- pagamentos da equipe + PIX com snapshot
  pay := public.create_staff_payment(m_prof, comp, d_prof, 500, current_date + 5);
  begin perform public.create_staff_payment(m_prof, comp, d_prof, 0); raise exception 'FALHOU: pagamento zero' using errcode = 'XX999';
  exception when numeric_value_out_of_range then null; end;

  -- ── Professor: PIX próprio, vê só os próprios pagamentos, nada do financeiro ──
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_prof, 'role','authenticated')::text, true);
  set local role authenticated;
  perform public.set_pix_key(m_prof, 'cpf', '123.456.789-09');
  select count(*) into n from public.member_pix_keys where member_id = m_prof and key_value = '12345678909';
  if n <> 1 then raise exception 'FALHOU: PIX não normalizado/gravado'; end if;
  begin perform public.set_pix_key(m_prof, 'cpf', '123'); raise exception 'FALHOU: aceitou CPF inválido' using errcode = 'XX999';
  exception when check_violation then null; end;
  begin perform public.set_pix_key(m_dir, 'email', 'x@y.com'); raise exception 'FALHOU: Professor cadastrou PIX de outra pessoa' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  select count(*) into n from public.staff_payments;
  if n <> 1 then raise exception 'FALHOU: Professor deveria ver só o próprio pagamento, viu %', n; end if;
  select count(*) into n from public.financial_entries; if n <> 0 then raise exception 'FALHOU: Professor viu lançamentos'; end if;
  select count(*) into n from public.v_finance_ledger; if n <> 0 then raise exception 'FALHOU: Professor viu o razão'; end if;
  select count(*) into n from public.distribution_rules; if n <> 0 then raise exception 'FALHOU: Professor viu regras'; end if;
  select count(*) into n from public.finance_categories; if n <> 0 then raise exception 'FALHOU: Professor viu categorias financeiras'; end if;
  begin perform * from public.finance_month_summary(org_a, comp); raise exception 'FALHOU: Professor leu o resumo' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  begin perform public.mark_staff_payment_paid(pay, current_date); raise exception 'FALHOU: Professor baixou o próprio pagamento' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  begin perform public.post_financial_entry(org_a, c_inc, 'x', 1, current_date); raise exception 'FALHOU: Professor lançou receita' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;

  -- ── Direção baixa o pagamento; chave usada fica registrada; trocar a chave não altera o histórico ──
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_dir, 'role','authenticated')::text, true);
  set local role authenticated;
  perform public.mark_staff_payment_paid(pay, current_date, 'PIX');
  select pix_key_snapshot into snap from public.staff_payments where id = pay;
  if snap <> '12345678909' then raise exception 'FALHOU: snapshot da chave PIX incorreto (%)', snap; end if;
  select count(*) into n from public.member_pix_keys where member_id = m_prof; -- Direção lê PIX
  if n <> 1 then raise exception 'FALHOU: Direção deveria ler a chave PIX'; end if;
  select * into s from public.finance_month_summary(org_a, comp);
  if s.pagamentos_equipe <> 500 then raise exception 'FALHOU: pagamento da equipe não entrou no razão (%)', s.pagamentos_equipe; end if;
  perform public.set_pix_key(m_prof, 'email', 'prof@exemplo.com');
  select pix_key_snapshot into snap from public.staff_payments where id = pay;
  if snap <> '12345678909' then raise exception 'FALHOU: trocar a chave alterou o histórico'; end if;
  select count(*) into n from public.member_pix_keys where member_id = m_prof and archived_at is not null;
  if n <> 1 then raise exception 'FALHOU: chave anterior deveria estar arquivada'; end if;
  begin perform public.mark_staff_payment_paid(pay, current_date); raise exception 'FALHOU: baixou pagamento já pago' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;

  -- ── Aluno: sem PIX, sem financeiro ──
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_st1, 'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.set_pix_key(m_st1, 'cpf', '12345678909'); raise exception 'FALHOU: aluno cadastrou PIX sem permissão' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  select count(*) into n from public.member_pix_keys; if n <> 0 then raise exception 'FALHOU: aluno viu chaves PIX'; end if;
  select count(*) into n from public.staff_payments; if n <> 0 then raise exception 'FALHOU: aluno viu pagamentos da equipe'; end if;
  select count(*) into n from public.v_finance_ledger; if n <> 0 then raise exception 'FALHOU: aluno viu o razão'; end if;

  -- ── Direção de outra organização ──
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_dirb, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.financial_entries; if n <> 0 then raise exception 'FALHOU: Direção B viu lançamentos da org A'; end if;
  select count(*) into n from public.member_pix_keys; if n <> 0 then raise exception 'FALHOU: Direção B viu PIX da org A'; end if;
  select count(*) into n from public.staff_payments; if n <> 0 then raise exception 'FALHOU: Direção B viu pagamentos da org A'; end if;
  begin perform public.post_financial_entry(org_a, c_inc, 'x', 1, current_date); raise exception 'FALHOU: Direção B lançou na org A' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  begin perform public.mark_staff_payment_paid(pay, current_date); raise exception 'FALHOU: Direção B baixou pagamento da org A' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  begin perform * from public.compute_distribution(org_a, comp); raise exception 'FALHOU: Direção B leu distribuição da org A' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;

  reset role;
  raise exception 'TESTES_OK_ROLLBACK';
end $$;

rollback;
