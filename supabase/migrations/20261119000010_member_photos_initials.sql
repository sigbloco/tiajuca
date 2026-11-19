-- Iniciais do nome COMPLETO (primeira letra do primeiro nome e do último sobrenome, sem conectores nem apelido entre parênteses),
-- calculadas no servidor: as telas (como a chamada) só recebem o nome chamado e não devem mostrar iniciais dele.
create or replace function public.member_initials(p_name text) returns text
language sql immutable set search_path = '' as $$
  with w as (
    select x, o from unnest(regexp_split_to_array(btrim(regexp_replace(coalesce(p_name, ''), '\([^)]*\)', ' ', 'g')), '\s+')) with ordinality as t(x, o)
     where x ~ '^[[:alpha:]]'
  )
  select coalesce(upper((select left(x, 1) from w order by o limit 1)), '?')
      || coalesce(upper((select left(x, 1) from w where o > 1 and lower(x) not in ('de', 'da', 'do', 'das', 'dos', 'e') order by o desc limit 1)), '')
$$;

drop function if exists public.member_photos(uuid);
create or replace function public.member_photos(p_org uuid) returns table (member_id uuid, photo_path text, initials text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_org_member(p_org) then raise exception 'Sem acesso.' using errcode = '42501'; end if;
  return query select m.id, m.photo_path, public.member_initials(m.full_name) from public.members m where m.organization_id = p_org and m.archived_at is null;
end $$;
revoke all on function public.member_photos(uuid) from public, anon;
grant execute on function public.member_photos(uuid) to authenticated;
