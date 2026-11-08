-- Papel "Colaborador": quem colabora com o bloco sem ser equipe. Mesmas permissões do papel Integrante.
insert into public.access_roles (organization_id, key, name, rank, is_system)
select o.id, 'colaborador', 'Colaborador', 15, true
  from public.organizations o
 where not exists (select 1 from public.access_roles r where r.organization_id = o.id and r.key = 'colaborador');

insert into public.role_permissions (access_role_id, permission_key, scope)
select c.id, rp.permission_key, rp.scope
  from public.access_roles c
  join public.access_roles i on i.organization_id = c.organization_id and i.key = 'integrante'
  join public.role_permissions rp on rp.access_role_id = i.id
 where c.key = 'colaborador'
   and not exists (select 1 from public.role_permissions x where x.access_role_id = c.id and x.permission_key = rp.permission_key);
