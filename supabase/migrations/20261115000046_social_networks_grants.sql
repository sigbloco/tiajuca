-- A tabela nova não herdava permissão para quem está logado (a lista aparecia vazia).
grant select, insert, update on public.social_networks to authenticated;
grant all on public.social_networks to service_role;
