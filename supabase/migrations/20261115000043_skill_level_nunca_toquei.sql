-- Nível "Nunca toquei" antes de Iniciante na lista padrão.
update public.skill_levels set sort_order = sort_order + 1 where list_id is null and is_active and name in ('Iniciante', 'Intermediário', 'Avançado');
insert into public.skill_levels (organization_id, name, sort_order, is_active)
select o.id, 'Nunca toquei', 1, true from public.organizations o
 where not exists (select 1 from public.skill_levels s where s.organization_id = o.id and s.list_id is null and s.name = 'Nunca toquei');
