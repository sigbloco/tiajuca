-- Logo do bloco: editada no Perfil do bloco (titular); o Site usa essa logo por padrão.
create or replace function public.set_org_logo(p_org uuid, p_path text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_permission(p_org, 'org.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  update public.organizations set logo_path = nullif(btrim(coalesce(p_path, '')), '') where id = p_org;
end $$;
revoke all on function public.set_org_logo(uuid, text) from public, anon;
grant execute on function public.set_org_logo(uuid, text) to authenticated;
