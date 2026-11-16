-- "Divisão do grupo" vira uma regra que se adiciona à pessoa (como hora-aula e % exclusiva): só participa da divisão quem tem a regra.
alter table public.staff_pay_rules add column if not exists group_key text;
alter table public.staff_pay_rules drop constraint if exists spr_kind_ck;
alter table public.staff_pay_rules add constraint spr_kind_ck check (kind in ('fixed', 'percent', 'hourly', 'group'));
alter table public.staff_pay_rules drop constraint if exists spr_values_ck;
alter table public.staff_pay_rules add constraint spr_values_ck check (
  (kind = 'fixed' and fixed_amount is not null and fixed_amount >= 0 and percent is null and hourly_rate is null and scope = 'all' and group_key is null)
  or (kind = 'percent' and percent is not null and percent > 0 and percent <= 100 and fixed_amount is null and hourly_rate is null and group_key is null)
  or (kind = 'hourly' and hourly_rate is not null and hourly_rate >= 0 and fixed_amount is null and percent is null and scope in ('all', 'section') and group_key is null)
  or (kind = 'group' and group_key is not null and fixed_amount is null and percent is null and hourly_rate is null and scope = 'all')
);
