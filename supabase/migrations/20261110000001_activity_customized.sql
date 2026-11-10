-- Edição pontual de ocorrências recorrentes (ex.: ensaio movido por causa da chuva).
-- customized: a ocorrência foi editada à mão; a sincronização da regra não a sobrescreve.
-- recurrence_slot: data original da regra; mantém o "lugar" mesmo se a data do evento mudar,
-- para a geração automática não recriar o dia antigo.
alter table public.activities add column customized boolean not null default false;
alter table public.activities add column recurrence_slot date;

update public.activities set recurrence_slot = activity_date where recurrence_rule_id is not null;

create or replace function public.activities_set_slot() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.recurrence_rule_id is not null and new.recurrence_slot is null then
    new.recurrence_slot := new.activity_date;
  end if;
  return new;
end $$;
create trigger activities_set_slot before insert on public.activities
  for each row execute function public.activities_set_slot();

drop index if exists public.activities_rule_date_uq;
create unique index activities_rule_slot_uq on public.activities (recurrence_rule_id, recurrence_slot) where recurrence_rule_id is not null;
