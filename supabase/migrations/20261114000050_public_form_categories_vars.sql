-- {valor:Aluno}, {valor:Senior}...: o formulário público recebe o preço atual de cada categoria ativa (nome e chave fixa).
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.get_public_form(text,text)'::regprocedure);
  n := replace(d, '''valor_field'', (select fld',
    '''categories'', (select coalesce(jsonb_agg(jsonb_build_object(''name'', c.name, ''key'', c.system_key, ''price'', p.amount) order by c.sort_order, c.name), ''[]''::jsonb) from public.fee_categories c join lateral (select pr.amount from public.fee_category_prices pr where pr.fee_category_id = c.id and pr.valid_from <= current_date and (pr.valid_to is null or pr.valid_to >= current_date) order by pr.valid_from desc limit 1) p on true where c.organization_id = o.id and c.is_active), ''valor_field'', (select fld');
  if n = d then raise exception 'get_public_form: trecho não encontrado'; end if;
  execute n;
end $$;
