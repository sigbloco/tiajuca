-- Categorias (antigas funções) em três seções: Remuneradas, Colaborativas e Artística.
-- O mesmo nome pode existir em mais de uma seção (ex.: Monitor remunerado e Monitor colaborativo).
alter table public.artistic_functions
  add column if not exists kind text not null default 'collab' check (kind in ('paid', 'collab', 'artistic'));

do $$
declare c text;
begin
  select con.conname into c from pg_constraint con
   where con.conrelid = 'public.artistic_functions'::regclass and con.contype = 'u'
     and (select array_agg(a.attname::text order by a.attname) from pg_attribute a where a.attrelid = con.conrelid and a.attnum = any (con.conkey)) = array['name', 'organization_id'];
  if c is not null then execute format('alter table public.artistic_functions drop constraint %I', c); end if;
end $$;
alter table public.artistic_functions add constraint artistic_functions_org_kind_name_key unique (organization_id, kind, name);

update public.artistic_functions set kind = 'paid' where lower(name) in ('direção', 'professor', 'monitor');
update public.artistic_functions set kind = 'artistic' where lower(name) in ('aluno', 'músico', 'senior', 'sênior');
-- Remuneradas são isentas automaticamente.
update public.artistic_functions set is_exempt = true, exempt_locked = true where kind = 'paid';
-- Escritora volta à lista (Colaborativas).
update public.artistic_functions set is_active = true where lower(name) = 'escritora';
-- Monitor também existe como colaborativa.
insert into public.artistic_functions (organization_id, name, sort_order, kind)
select o.id, 'Monitor', 99, 'collab' from public.organizations o
where exists (select 1 from public.artistic_functions f where f.organization_id = o.id and f.kind = 'paid' and lower(f.name) = 'monitor')
  and not exists (select 1 from public.artistic_functions f where f.organization_id = o.id and f.kind = 'collab' and lower(f.name) = 'monitor');
