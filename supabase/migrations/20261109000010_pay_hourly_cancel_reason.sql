-- (1) Regra de pagamento "por hora de aula": valor da hora × horas das aulas não canceladas do mês (ex.: professora que recebe por aula dada).
-- (2) Cancelar aula/evento com motivo (ex.: chuva).
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.staff_pay_rules'::regclass and contype = 'c' loop
    execute format('alter table public.staff_pay_rules drop constraint %I', c);
  end loop;
end $$;
alter table public.staff_pay_rules add column if not exists hourly_rate numeric(12,2);
alter table public.staff_pay_rules add constraint spr_kind_ck check (kind in ('fixed', 'percent', 'hourly'));
alter table public.staff_pay_rules add constraint spr_scope_ck check (scope in ('all', 'section', 'subsection', 'instrument'));
alter table public.staff_pay_rules add constraint spr_values_ck check (
     (kind = 'fixed'  and fixed_amount is not null and fixed_amount >= 0 and percent is null and hourly_rate is null and scope = 'all')
  or (kind = 'percent' and percent is not null and percent > 0 and percent <= 100 and fixed_amount is null and hourly_rate is null)
  or (kind = 'hourly' and hourly_rate is not null and hourly_rate >= 0 and fixed_amount is null and percent is null and scope in ('all', 'section')));
alter table public.staff_pay_rules add constraint spr_target_ck check (
     (scope = 'all' and section_id is null and subsection_id is null and instrument_id is null)
  or (scope = 'section' and section_id is not null and subsection_id is null and instrument_id is null)
  or (scope = 'subsection' and subsection_id is not null and section_id is null and instrument_id is null)
  or (scope = 'instrument' and instrument_id is not null and section_id is null and subsection_id is null));

alter table public.activities add column if not exists cancel_reason text;
