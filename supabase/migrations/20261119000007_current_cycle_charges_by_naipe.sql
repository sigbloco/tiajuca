-- Ciclo atual: as cobranças já geradas seguem a categoria do naipe (como a atribuição já seguia) e o valor de
-- "Aluno (percussão)" em 2027/28 (150, igual ao de sopro) que faltava. Valores das cobranças não mudam (150 e 50).
insert into public.fee_cycle_prices (organization_id, fee_category_id, cycle_id, amount)
select p.organization_id, perc.id, p.cycle_id, p.amount
  from public.fee_cycle_prices p
  join public.fee_categories sopro on sopro.id = p.fee_category_id and sopro.name = 'Aluno (sopro)'
  join public.fee_categories perc on perc.organization_id = sopro.organization_id and perc.name = 'Aluno (percussão)'
 where not exists (select 1 from public.fee_cycle_prices x where x.fee_category_id = perc.id and x.cycle_id = p.cycle_id);

update public.monthly_charges c set fee_category_id = fa.fee_category_id
  from public.cycle_fee_assignments fa
  join public.cycles cy on cy.id = fa.cycle_id and cy.is_current
  join public.fee_categories old on old.name in ('Aluno (sopro)', 'Senior')
  join public.fee_categories new on new.id = fa.fee_category_id
 where c.member_id = fa.member_id and c.cycle_id = fa.cycle_id and c.fee_category_id = old.id
   and new.id <> old.id and new.base_key = case when old.name = 'Senior' then 'senior' else 'aluno' end;
