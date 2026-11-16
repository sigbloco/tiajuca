-- Quem gerencia integrantes (titular e direção) também edita o perfil de qualquer integrante, inclusive de diretores, pela tela de perfil
-- (ex.: "visualizar como"): antes só a própria pessoa podia gravar por esta função.
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.update_my_profile(uuid,jsonb)'::regprocedure);
  n := replace(d, 'if not public.is_self(p_member) then', 'if not (public.is_self(p_member) or public.has_permission((select m.organization_id from public.members m where m.id = p_member), ''members.manage'')) then');
  if n = d then raise exception 'patch update_my_profile'; end if;
  execute n;
end $$;
