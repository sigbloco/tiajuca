-- Categorias de valor criadas à toa para categorias que não contribuem (remuneradas e colaborativas): só contribuintes têm valor.
-- Remove apenas as que não são usadas em nada (atribuições, cobranças, marcações, valores).
delete from public.fee_categories c
 using public.artistic_functions f
 where f.id = c.function_id and f.kind <> 'payer'
   and not exists (select 1 from public.member_fee_assignments x where x.fee_category_id = c.id)
   and not exists (select 1 from public.cycle_fee_assignments x where x.fee_category_id = c.id)
   and not exists (select 1 from public.monthly_charges x where x.fee_category_id = c.id)
   and not exists (select 1 from public.cycle_extra_categories x where x.fee_category_id = c.id)
   and not exists (select 1 from public.fee_category_prices x where x.fee_category_id = c.id)
   and not exists (select 1 from public.fee_cycle_prices x where x.fee_category_id = c.id);
