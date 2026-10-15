-- Categorias e destinos financeiros INICIAIS do Cordão da Tia Juca (a Direção edita pelo app). Idempotente.
-- As regras de distribuição NÃO são semeadas: a Direção as define (percentuais e valores fixos).
do $$
declare v_org uuid;
begin
  select id into v_org from public.organizations where slug = 'tiajuca';
  if v_org is null then raise exception 'Execute antes seed/tiajuca.sql'; end if;
  perform public.seed_org_finance_defaults(v_org);
end $$;
