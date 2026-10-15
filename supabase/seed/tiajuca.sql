-- Dados da INSTÂNCIA Cordão da Tia Juca. Único lugar com nome/identidade específicos.
-- Executar após as migrations. Depois, criar o primeiro diretor:
--   select public.bootstrap_first_director('tiajuca', 'email@exemplo.com', 'Nome Completo');
-- (a conta precisa existir em auth.users para o vínculo automático; senão vincule por convite.)

with org as (
  insert into public.organizations (name, short_name, slug, theme, timezone)
  values (
    'Cordão da Tia Juca', 'Tia Juca', 'tiajuca',
    '{"primary":"#E93D2B","primaryForeground":"#FFFFFF","secondary":"#DEE33B","secondaryForeground":"#2B2B14"}'::jsonb,
    'America/Sao_Paulo'
  )
  on conflict (slug) do update set name = excluded.name
  returning id
)
select public.seed_org_defaults(id) from org;
