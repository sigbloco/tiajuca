-- Ciclo histórico Carnaval 2023/24 (referenciado por respostas de formulário antigas). Datas aproximadas, no mesmo molde dos ciclos seguintes; podem ser ajustadas em Ciclos.
insert into public.cycles (organization_id, cycle_type_id, name, starts_on, ends_on, status, is_active, is_current)
select c.organization_id, c.cycle_type_id, 'Carnaval 2023/24', date '2023-09-01', date '2024-02-29', 'closed', true, false
  from public.cycles c where c.name = 'Carnaval 2024/25'
   and not exists (select 1 from public.cycles x where x.organization_id = c.organization_id and x.name = 'Carnaval 2023/24');

update public.member_form_answers a set cycle_id = c.id
  from public.cycles c
 where a.cycle_id is null and c.organization_id = a.organization_id and c.name = a.cycle_label;
