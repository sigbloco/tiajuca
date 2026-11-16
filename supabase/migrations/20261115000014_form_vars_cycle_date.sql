-- Variáveis de valor dos formulários: com ciclo no formulário, usam o preço vigente na data de início do ciclo (ou hoje, se o ciclo já começou).
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.get_public_form(text,text)'::regprocedure);
  n := replace(d, 'viewer jsonb;', 'viewer jsonb; ref_d date;');
  if n = d then raise exception 'patch get: declare'; end if; d := n;
  n := replace(d, 'st := public._form_state(f);', 'st := public._form_state(f);' || E'\n  ref_d := greatest(current_date, coalesce((select cy.starts_on from public.cycles cy where cy.id = f.cycle_id), current_date));');
  if n = d then raise exception 'patch get: ref'; end if; d := n;
  n := replace(d, 'pr.valid_from <= current_date and (pr.valid_to is null or pr.valid_to >= current_date)', 'pr.valid_from <= ref_d and (pr.valid_to is null or pr.valid_to >= ref_d)');
  if n = d then raise exception 'patch get: dates'; end if;
  execute n;

  d := pg_get_functiondef('public.form_vars(uuid)'::regprocedure);
  n := replace(d, 'declare f public.forms;', 'declare f public.forms; ref_d date;');
  if n = d then raise exception 'patch vars: declare'; end if; d := n;
  n := replace(d, E'  return (select jsonb_build_object(', E'  ref_d := greatest(current_date, coalesce((select cy.starts_on from public.cycles cy where cy.id = f.cycle_id), current_date));\n  return (select jsonb_build_object(');
  if n = d then raise exception 'patch vars: ref'; end if; d := n;
  n := replace(d, 'pr.valid_from <= current_date and (pr.valid_to is null or pr.valid_to >= current_date)', 'pr.valid_from <= ref_d and (pr.valid_to is null or pr.valid_to >= ref_d)');
  if n = d then raise exception 'patch vars: dates'; end if;
  execute n;
end $$;

-- A categoria Pernalta (Organização → Categorias) está ativa, mas a de contribuição ficou desativada por uma migração antiga: reativa.
update public.fee_categories fc set is_active = true
 where fc.is_active = false and fc.function_id is not null
   and exists (select 1 from public.artistic_functions f where f.id = fc.function_id and f.is_active) and fc.name = 'Pernalta';
