-- Faltava o privilégio de apagar (a política sozinha não basta): limite vazio/0 apaga a linha.
grant delete on public.instrument_cycle_capacity to authenticated;
