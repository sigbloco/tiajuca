-- Sênior por naipe (dados): Senior (sopro) e Senior (percussão) a R$ 50 e Senior (pernalta) a R$ 35 (a antiga "Pernalta", renomeada).
-- Cria as duas categorias novas como cópia da "Senior" (mesmos valores por ciclo) e move quem está no ciclo atual para a do naipe dele.
-- A "Senior" genérica continua existindo (ciclos antigos usam), mas ninguém fica nela no ciclo atual.

do $m$
declare
  v_sen public.fee_categories; v_fn public.artistic_functions; v_org uuid; v_cycle uuid;
  v_sopro uuid; v_perc uuid; v_perf uuid; v_pern public.fee_categories;
  v_new_fc uuid; v_new_fn uuid; r record; m record;
begin
  select * into v_sen from public.fee_categories where system_key = 'senior' limit 1;
  if v_sen.id is null then raise exception 'Categoria Senior não encontrada.'; end if;
  select * into v_fn from public.artistic_functions where id = v_sen.function_id;
  v_org := v_sen.organization_id;
  select id into v_cycle from public.cycles where organization_id = v_org and is_current limit 1;
  select id into v_sopro from public.sections where organization_id = v_org and name = 'Sopro';
  select id into v_perc from public.sections where organization_id = v_org and name = 'Percussão';
  select id into v_perf from public.sections where organization_id = v_org and name = 'Performance';
  select * into v_pern from public.fee_categories where organization_id = v_org and name = 'Pernalta';

  -- 1) Senior (pernalta) = a antiga Pernalta.
  update public.fee_categories set name = 'Senior (pernalta)' where id = v_pern.id;
  update public.artistic_functions set name = 'Senior (pernalta)' where id = v_pern.function_id;

  -- 2) Senior (sopro) e Senior (percussão): cópia da Senior, com tipo e naipe.
  for r in select * from (values ('Senior (sopro)', v_sopro), ('Senior (percussão)', v_perc)) as t(nm, sec) loop
    v_new_fn := gen_random_uuid(); v_new_fc := gen_random_uuid();
    insert into public.artistic_functions
      select (jsonb_populate_record(null::public.artistic_functions, to_jsonb(v_fn) || jsonb_build_object('id', v_new_fn, 'name', r.nm, 'is_fixed', false))).*;
    insert into public.fee_categories
      select (jsonb_populate_record(null::public.fee_categories, to_jsonb(v_sen) || jsonb_build_object('id', v_new_fc, 'name', r.nm, 'system_key', null, 'function_id', v_new_fn, 'base_key', 'senior', 'section_id', r.sec))).*;
    insert into public.fee_category_prices
      select (jsonb_populate_record(null::public.fee_category_prices, to_jsonb(p) || jsonb_build_object('id', gen_random_uuid(), 'fee_category_id', v_new_fc))).*
        from public.fee_category_prices p where p.fee_category_id = v_sen.id;
    insert into public.fee_cycle_prices
      select (jsonb_populate_record(null::public.fee_cycle_prices, to_jsonb(p) || jsonb_build_object('fee_category_id', v_new_fc))).*
        from public.fee_cycle_prices p where p.fee_category_id = v_sen.id;

    -- 3) Move quem está no ciclo atual como Senior e toca neste naipe (e só nele).
    for m in
      select fa.member_id from public.cycle_fee_assignments fa
       where fa.cycle_id = v_cycle and fa.fee_category_id = v_sen.id
         and public.member_cycle_sections(fa.member_id, v_cycle) = array[r.sec]
    loop
      update public.cycle_fee_assignments set fee_category_id = v_new_fc where cycle_id = v_cycle and member_id = m.member_id;
      update public.member_fee_assignments set fee_category_id = v_new_fc where member_id = m.member_id and valid_to is null and fee_category_id = v_sen.id;
    end loop;
  end loop;

  -- Quem toca Pernalta (Performance) e estava na Senior genérica: vira Senior (pernalta) a partir de hoje (o valor muda para R$ 35 dali em diante).
  for m in
    select fa.member_id from public.cycle_fee_assignments fa
     where fa.cycle_id = v_cycle and fa.fee_category_id = v_sen.id
       and public.member_cycle_sections(fa.member_id, v_cycle) = array[v_perf]
  loop
    update public.cycle_fee_assignments set fee_category_id = v_pern.id where cycle_id = v_cycle and member_id = m.member_id;
    update public.member_fee_assignments set valid_to = current_date - 1 where member_id = m.member_id and valid_to is null and fee_category_id = v_sen.id and valid_from < current_date;
    update public.member_fee_assignments set fee_category_id = v_pern.id where member_id = m.member_id and valid_to is null and fee_category_id = v_sen.id;
    if not exists (select 1 from public.member_fee_assignments where member_id = m.member_id and valid_to is null) then
      insert into public.member_fee_assignments (organization_id, member_id, fee_category_id, valid_from) values (v_org, m.member_id, v_pern.id, current_date);
    end if;
  end loop;
end $m$;
