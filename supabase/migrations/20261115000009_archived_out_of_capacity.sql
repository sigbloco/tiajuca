-- Integrante arquivado (lixeira) não ocupa vaga; histórico de presenças e cobranças é mantido.
create or replace function public.instrument_occupied(p_instrument uuid, p_cycle uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(distinct mc.member_id)::int
  from public.member_cycles mc
  join public.members m on m.id = mc.member_id and m.archived_at is null
  join public.member_cycle_statuses s on s.id = mc.status_id and s.counts_as_active
  join public.cycle_participations p on p.member_id = mc.member_id and p.cycle_id = mc.cycle_id and p.instrument_id = p_instrument
  where mc.cycle_id = p_cycle
$$;
