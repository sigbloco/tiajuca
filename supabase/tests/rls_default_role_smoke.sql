-- Teste: todo integrante novo recebe o papel Integrante. Rodar APÓS a migration 0017. Esperado: erro "TESTES_OK_ROLLBACK".
begin;

do $$
declare org_a uuid; m1 uuid; n int;
begin
  insert into public.organizations (name, short_name, slug) values ('Org A', 'A', 'dr-a') returning id into org_a;
  perform public.seed_org_defaults(org_a);
  insert into public.members (organization_id, full_name) values (org_a, 'Sem conta') returning id into m1;
  select count(*) into n from public.member_access_roles mar join public.access_roles ar on ar.id = mar.access_role_id
   where mar.member_id = m1 and mar.revoked_at is null and ar.key = 'integrante';
  if n <> 1 then raise exception 'FALHOU: integrante novo deveria ter o papel Integrante (tem %)', n; end if;
  select count(*) into n from public.member_access_roles mar join public.access_roles ar on ar.id = mar.access_role_id
   where mar.member_id = m1 and mar.revoked_at is null and ar.key in ('direcao', 'titular', 'professor', 'monitor');
  if n <> 0 then raise exception 'FALHOU: integrante novo não pode ter papel de equipe (tem %)', n; end if;
  raise exception 'TESTES_OK_ROLLBACK';
end $$;

rollback;
