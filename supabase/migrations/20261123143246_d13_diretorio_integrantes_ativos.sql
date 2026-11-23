-- Etapa 7, D13: a página Integrantes de quem não vê cadastros de outras pessoas (integrante comum) mostra só os nomes
-- de quem está ativo no ciclo atual, pelo nome de exibição (ou primeiro nome), como nos aniversários.
-- Respeita a configuração do diretório (member_directory_visibility, hoje 'all_members').
create function public.member_directory_active(p_org uuid)
returns table (member_id uuid, name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_org_member(p_org) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  -- respeita a configuração do diretório (hoje 'all_members')
  if coalesce((select s.value #>> '{}' from public.org_settings s where s.organization_id = p_org and s.key = 'member_directory_visibility'), 'all_members') <> 'all_members' then return; end if;
  return query
    select m.id, n.name from public.members m
    cross join lateral (select coalesce(nullif(btrim(m.display_name), ''), split_part(btrim(m.full_name), ' ', 1)) as name) n
    where m.organization_id = p_org and m.archived_at is null
      and exists (select 1 from public.member_cycles mc join public.cycles c on c.id = mc.cycle_id and c.is_current
                  join public.member_cycle_statuses s on s.id = mc.status_id and s.counts_as_active where mc.member_id = m.id)
    order by n.name;
end $$;
revoke all on function public.member_directory_active(uuid) from public, anon;
grant execute on function public.member_directory_active(uuid) to authenticated;
