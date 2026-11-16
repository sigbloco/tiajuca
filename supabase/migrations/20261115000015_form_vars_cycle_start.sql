-- Variáveis de valor: com ciclo no formulário, o preço é o do ciclo (vigente no início dele), independente de a data de hoje.
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.get_public_form(text,text)'::regprocedure);
  n := replace(d, 'greatest(current_date, coalesce((select cy.starts_on from public.cycles cy where cy.id = f.cycle_id), current_date))', 'coalesce((select cy.starts_on from public.cycles cy where cy.id = f.cycle_id), current_date)');
  if n = d then raise exception 'patch get'; end if;
  execute n;
  d := pg_get_functiondef('public.form_vars(uuid)'::regprocedure);
  n := replace(d, 'greatest(current_date, coalesce((select cy.starts_on from public.cycles cy where cy.id = f.cycle_id), current_date))', 'coalesce((select cy.starts_on from public.cycles cy where cy.id = f.cycle_id), current_date)');
  if n = d then raise exception 'patch vars'; end if;
  execute n;
end $$;
