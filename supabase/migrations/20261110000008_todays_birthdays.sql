-- Aniversariantes do dia, visíveis a todo integrante da organização (só nome; sem idade, e-mail ou telefone).
-- Só quem está ativo no ciclo atual. 29/02 comemora em 28/02 nos anos comuns.
create or replace function public.todays_birthdays(p_org uuid, p_date date) returns table (member_id uuid, name text)
language sql stable security definer set search_path = '' as $$
  select m.id, coalesce(nullif(trim(m.display_name), ''), split_part(trim(m.full_name), ' ', 1))
    from public.members m
   where public.is_org_member(p_org)
     and m.organization_id = p_org and m.archived_at is null and m.birth_date is not null
     and (
       (extract(month from m.birth_date) = extract(month from p_date) and extract(day from m.birth_date) = extract(day from p_date))
       or (extract(month from m.birth_date) = 2 and extract(day from m.birth_date) = 29
           and extract(month from p_date) = 2 and extract(day from p_date) = 28
           and not ((extract(year from p_date)::int % 4 = 0 and extract(year from p_date)::int % 100 <> 0) or extract(year from p_date)::int % 400 = 0))
     )
     and exists (
       select 1 from public.member_cycles mc
         join public.member_cycle_statuses s on s.id = mc.status_id and s.counts_as_active
         join public.cycles c on c.id = mc.cycle_id and c.is_current
        where mc.member_id = m.id and mc.organization_id = p_org)
   order by 2
$$;
revoke all on function public.todays_birthdays(uuid, date) from public, anon;
grant execute on function public.todays_birthdays(uuid, date) to authenticated;
