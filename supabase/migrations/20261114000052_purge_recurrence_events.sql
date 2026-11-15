-- Lixeira de eventos: eventos que vieram de uma recorrência também podem ser excluídos de vez.
-- A data fica registrada em recurrence_skips, e a recorrência não recria o evento.
create table if not exists public.recurrence_skips (
  organization_id uuid not null,
  rule_id uuid not null references public.recurrence_rules(id) on delete cascade,
  activity_date date not null,
  primary key (rule_id, activity_date)
);
alter table public.recurrence_skips enable row level security;
revoke all on public.recurrence_skips from anon, authenticated;

do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.materialize_recurrences(uuid,date)'::regprocedure);
  n := replace(d, 'where extract(dow from g.d) = r.weekday' || chr(10) || '    on conflict do nothing;',
                  'where extract(dow from g.d) = r.weekday and not exists (select 1 from public.recurrence_skips sk where sk.rule_id = r.id and sk.activity_date = g.d::date)' || chr(10) || '    on conflict do nothing;');
  if n = d then raise exception 'materialize_recurrences: trecho não encontrado'; end if;
  execute n;
end $$;

create or replace function public.delete_activity(p_activity uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.activities;
begin
  select * into a from public.activities where id = p_activity;
  if a.id is null or not public.has_permission(a.organization_id, 'events.manage') then
    raise exception 'Sem permissão para apagar este evento.' using errcode = '42501';
  end if;
  if a.deleted_at is null then
    raise exception 'Mande o evento para a lixeira antes de excluir de vez.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.event_attendance ea where ea.activity_id = a.id) then
    raise exception 'Este evento tem presença registrada e não pode ser excluído de vez: o histórico da chamada é mantido.' using errcode = 'P0001';
  end if;
  if a.recurrence_rule_id is not null then
    insert into public.recurrence_skips (organization_id, rule_id, activity_date) values (a.organization_id, a.recurrence_rule_id, a.activity_date) on conflict do nothing;
  end if;
  delete from public.activities where id = a.id;
end $$;
