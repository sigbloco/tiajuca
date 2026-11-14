-- Vagas: 0 significa "sem limite" (infinito). Zero nunca fica gravado: a linha do limite é apagada.
delete from public.instrument_cycle_capacity where capacity = 0;

create or replace function public.capacity_zero_is_infinite() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.instrument_cycle_capacity where instrument_id = new.instrument_id and cycle_id = new.cycle_id and capacity = 0;
  return null;
end $$;

drop trigger if exists capacity_zero_is_infinite on public.instrument_cycle_capacity;
create trigger capacity_zero_is_infinite after insert or update on public.instrument_cycle_capacity
  for each row when (new.capacity = 0) execute function public.capacity_zero_is_infinite();
