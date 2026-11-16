-- O ciclo histórico "Carnaval 2023/24" foi removido a pedido: as 45 respostas antigas continuam guardadas (com o texto "Carnaval 2023/24" no rótulo), sem ligação a ciclo.
delete from public.cycles where name = 'Carnaval 2023/24'
  and not exists (select 1 from public.member_cycles mc where mc.cycle_id = cycles.id)
  and not exists (select 1 from public.cycle_participations cp where cp.cycle_id = cycles.id)
  and not exists (select 1 from public.activities a where a.cycle_id = cycles.id)
  and not exists (select 1 from public.monthly_charges c where c.cycle_id = cycles.id);
