-- Categorias por naipe também nos ciclos passados, e acertos finais:
--  • Pernalta vale R$ 35 seja a pessoa sênior ou não: volta a se chamar "Pernalta", sem tipo (só naipe Performance).
--  • Músico convidado (percussão): ainda não há ninguém, mas já existe (R$ 50, cópia da de sopro).
--  • Ciclos passados: quem era "Aluno (sopro)" ou "Senior" genérica passa para a categoria do naipe em que tocava naquele ciclo
--    (atribuição do ciclo e cobranças já geradas). Os valores são os mesmos (150 e 50): só muda o nome da categoria.
do $m$
declare
  v_org uuid; v_src public.fee_categories; v_fn public.artistic_functions; v_new_fc uuid; v_new_fn uuid;
  v_perc uuid; v_sopro uuid; v_old uuid; v_new uuid; r record;
begin
  select organization_id into v_org from public.fee_categories where system_key = 'senior' limit 1;
  select id into v_perc from public.sections where organization_id = v_org and name = 'Percussão';
  select id into v_sopro from public.sections where organization_id = v_org and name = 'Sopro';

  update public.fee_categories set name = 'Pernalta', base_key = null where organization_id = v_org and name = 'Senior (pernalta)';
  update public.artistic_functions set name = 'Pernalta' where organization_id = v_org and name = 'Senior (pernalta)';

  if not exists (select 1 from public.fee_categories where organization_id = v_org and name = 'Músico convidado (percussão)') then
    select * into v_src from public.fee_categories where organization_id = v_org and name = 'Músico convidado (sopro)';
    select * into v_fn from public.artistic_functions where id = v_src.function_id;
    v_new_fn := gen_random_uuid(); v_new_fc := gen_random_uuid();
    insert into public.artistic_functions
      select (jsonb_populate_record(null::public.artistic_functions, to_jsonb(v_fn) || jsonb_build_object('id', v_new_fn, 'name', 'Músico convidado (percussão)', 'is_fixed', false))).*;
    insert into public.fee_categories
      select (jsonb_populate_record(null::public.fee_categories, to_jsonb(v_src) || jsonb_build_object('id', v_new_fc, 'name', 'Músico convidado (percussão)', 'system_key', null, 'function_id', v_new_fn, 'base_key', 'musico', 'section_id', v_perc))).*;
    insert into public.fee_category_prices
      select (jsonb_populate_record(null::public.fee_category_prices, to_jsonb(p) || jsonb_build_object('id', gen_random_uuid(), 'fee_category_id', v_new_fc))).*
        from public.fee_category_prices p where p.fee_category_id = v_src.id;
    insert into public.fee_cycle_prices
      select (jsonb_populate_record(null::public.fee_cycle_prices, to_jsonb(p) || jsonb_build_object('fee_category_id', v_new_fc))).*
        from public.fee_cycle_prices p where p.fee_category_id = v_src.id;
  end if;

  for r in select * from (values ('Aluno (sopro)', 'Aluno (percussão)', v_perc), ('Senior', 'Senior (percussão)', v_perc), ('Senior', 'Senior (sopro)', v_sopro)) as t(old_nm, new_nm, sec) loop
    select id into v_old from public.fee_categories where organization_id = v_org and name = r.old_nm;
    select id into v_new from public.fee_categories where organization_id = v_org and name = r.new_nm;
    with moved as (
      update public.cycle_fee_assignments fa set fee_category_id = v_new
        from public.cycles cy
       where cy.id = fa.cycle_id and cy.ends_on < current_date and fa.fee_category_id = v_old
         and public.member_cycle_sections(fa.member_id, fa.cycle_id) = array[r.sec]
      returning fa.member_id, fa.cycle_id)
    update public.monthly_charges c set fee_category_id = v_new
      from moved where c.member_id = moved.member_id and c.cycle_id = moved.cycle_id and c.fee_category_id = v_old;
  end loop;
end $m$;
