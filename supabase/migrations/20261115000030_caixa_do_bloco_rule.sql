-- Distribuição unificada: o "Caixa do bloco" (que era uma regra na antiga aba Distribuição) passa a ser uma regra do ciclo na página Distribuição.
-- As demais regras antigas (Direção e mestres de bateria, Monitores, Rebeca) não foram copiadas: já existem como regras por pessoa. Ficam guardadas, sem uso.
insert into public.staff_group_rules (organization_id, cycle_id, group_key, percent, scope)
select r.organization_id, r.cycle_id, 'Caixa do bloco', r.percent, 'all'
  from public.distribution_rules r join public.distribution_destinations d on d.id = r.destination_id
 where d.kind = 'cash' and r.mode = 'percent' and r.is_active and r.cycle_id is not null and r.percent > 0 and r.percent <= 100
on conflict (cycle_id, group_key) do nothing;
