-- {valor} nos textos do formulário: preço atual de cada categoria (pela ligação categoria de Organização → Financeiro) e qual pergunta é a da categoria.
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.get_public_form(text,text)'::regprocedure);
  n := replace(d, '''vars'', (select jsonb_build_object(',
    '''vars'', (select jsonb_build_object(''valor_field'', (select fld ->> ''key'' from jsonb_array_elements(v.snapshot -> ''fields'') fld where fld ->> ''mapping'' = ''link.function'' limit 1), ''prices'', (select coalesce(jsonb_object_agg(c.function_id::text, p.amount), ''{}''::jsonb) from public.fee_categories c join lateral (select pr.amount from public.fee_category_prices pr where pr.fee_category_id = c.id and pr.valid_from <= current_date and (pr.valid_to is null or pr.valid_to >= current_date) order by pr.valid_from desc limit 1) p on true where c.organization_id = o.id and c.function_id is not null), ');
  if n = d then raise exception 'get_public_form: trecho não encontrado'; end if;
  execute n;
end $$;
