-- Registros ligados ao CICLO (não só à data): lançamentos financeiros, pagamentos da equipe, pedidos da loja e álbuns.
-- O ciclo é definido na criação (a partir da data do registro) e fica gravado: mudar as datas do ciclo depois não move os registros.

create or replace function public._cycle_on(p_org uuid, p_day date) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.cycles where organization_id = p_org and is_active and starts_on <= p_day and ends_on >= p_day order by starts_on desc limit 1
$$;
revoke all on function public._cycle_on(uuid, date) from public, anon, authenticated;

create or replace function public._set_cycle_from_date() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_day date;
begin
  if new.cycle_id is null then
    v_day := coalesce((to_jsonb(new) ->> tg_argv[0])::timestamptz::date, (to_jsonb(new) ->> 'created_at')::timestamptz::date, current_date);
    new.cycle_id := public._cycle_on((to_jsonb(new) ->> 'organization_id')::uuid, v_day);
  end if;
  return new;
end $$;
revoke all on function public._set_cycle_from_date() from public, anon, authenticated;

alter table public.financial_entries add column if not exists cycle_id uuid references public.cycles (id);
alter table public.staff_payments add column if not exists cycle_id uuid references public.cycles (id);
alter table public.shop_orders add column if not exists cycle_id uuid references public.cycles (id);
alter table public.site_albums add column if not exists cycle_id uuid references public.cycles (id);

update public.financial_entries t set cycle_id = public._cycle_on(t.organization_id, t.occurred_on) where t.cycle_id is null;
update public.staff_payments t set cycle_id = public._cycle_on(t.organization_id, t.competence) where t.cycle_id is null;
update public.shop_orders t set cycle_id = public._cycle_on(t.organization_id, coalesce(t.paid_at, t.created_at)::date) where t.cycle_id is null;
update public.site_albums t set cycle_id = public._cycle_on(t.organization_id, coalesce(t.event_date, t.created_at::date)) where t.cycle_id is null;

create index if not exists financial_entries_cycle_idx on public.financial_entries (cycle_id);
create index if not exists staff_payments_cycle_idx on public.staff_payments (cycle_id);
create index if not exists shop_orders_cycle_idx on public.shop_orders (cycle_id);
create index if not exists site_albums_cycle_idx on public.site_albums (cycle_id);

create trigger trg_cycle_financial_entries before insert on public.financial_entries for each row execute function public._set_cycle_from_date('occurred_on');
create trigger trg_cycle_staff_payments before insert on public.staff_payments for each row execute function public._set_cycle_from_date('competence');
create trigger trg_cycle_shop_orders before insert on public.shop_orders for each row execute function public._set_cycle_from_date('created_at');
create trigger trg_cycle_site_albums before insert on public.site_albums for each row execute function public._set_cycle_from_date('event_date');

-- Cobranças novas sem ciclo (criadas por outros caminhos) também recebem o ciclo pela competência.
create trigger trg_cycle_monthly_charges before insert on public.monthly_charges for each row execute function public._set_cycle_from_date('competence');
