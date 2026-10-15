-- Contribuições INICIAIS do Cordão da Tia Juca (a Direção altera pelo app). Idempotente.
-- Valores: Aluno R$ 150, Músico R$ 50, Pernalta R$ 35. Feriados: nacionais + RJ, 2026 e 2027 (editáveis).
do $$
declare v_org uuid; n text; amt numeric; v_cat uuid;
begin
  select id into v_org from public.organizations where slug = 'tiajuca';
  if v_org is null then raise exception 'Execute antes seed/tiajuca.sql'; end if;

  insert into public.fee_categories (organization_id, name, sort_order) values
    (v_org, 'Aluno', 1), (v_org, 'Músico', 2), (v_org, 'Pernalta', 3)
  on conflict (organization_id, name) do nothing;

  for n, amt in select * from (values ('Aluno', 150), ('Músico', 50), ('Pernalta', 35)) as t(n, a) loop
    select id into v_cat from public.fee_categories where organization_id = v_org and name = n;
    insert into public.fee_category_prices (organization_id, fee_category_id, amount, valid_from)
    values (v_org, v_cat, amt, '2026-01-01') on conflict (fee_category_id, valid_from) do nothing;
  end loop;

  insert into public.holidays (organization_id, day, name) values
    (v_org, '2026-01-01', 'Confraternização Universal'), (v_org, '2026-02-16', 'Carnaval'), (v_org, '2026-02-17', 'Carnaval'),
    (v_org, '2026-04-03', 'Sexta-feira Santa'), (v_org, '2026-04-21', 'Tiradentes'), (v_org, '2026-04-23', 'São Jorge (RJ)'),
    (v_org, '2026-05-01', 'Dia do Trabalho'), (v_org, '2026-06-04', 'Corpus Christi'), (v_org, '2026-09-07', 'Independência'),
    (v_org, '2026-10-12', 'Nossa Senhora Aparecida'), (v_org, '2026-11-02', 'Finados'), (v_org, '2026-11-15', 'Proclamação da República'),
    (v_org, '2026-11-20', 'Consciência Negra'), (v_org, '2026-12-25', 'Natal'),
    (v_org, '2027-01-01', 'Confraternização Universal'), (v_org, '2027-02-08', 'Carnaval'), (v_org, '2027-02-09', 'Carnaval'),
    (v_org, '2027-03-26', 'Sexta-feira Santa'), (v_org, '2027-04-21', 'Tiradentes'), (v_org, '2027-04-23', 'São Jorge (RJ)'),
    (v_org, '2027-05-01', 'Dia do Trabalho'), (v_org, '2027-05-27', 'Corpus Christi'), (v_org, '2027-09-07', 'Independência'),
    (v_org, '2027-10-12', 'Nossa Senhora Aparecida'), (v_org, '2027-11-02', 'Finados'), (v_org, '2027-11-15', 'Proclamação da República'),
    (v_org, '2027-11-20', 'Consciência Negra'), (v_org, '2027-12-25', 'Natal')
  on conflict (organization_id, day) do nothing;
end $$;
