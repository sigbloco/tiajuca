-- Ciclos definidos só por mês e ano: o início vai ao dia 1 e o fim ao último dia do mês. A data diz se o ciclo é atual, próximo ou passado.
update public.cycles set starts_on = date_trunc('month', starts_on)::date, ends_on = (date_trunc('month', ends_on) + interval '1 month - 1 day')::date;

-- O ciclo "atual" (is_current) passa a seguir as datas: entre os ciclos em andamento hoje, o que começou por último.
create or replace function public.refresh_current_cycle(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_pick uuid;
begin
  if not public.is_org_member(p_org) then return; end if;
  select id into v_pick from public.cycles
   where organization_id = p_org and is_active and (now() at time zone 'America/Sao_Paulo')::date between starts_on and ends_on
   order by starts_on desc limit 1;
  if v_pick is null then return; end if;
  update public.cycles set is_current = false where organization_id = p_org and is_current and id <> v_pick;
  update public.cycles set is_current = true where id = v_pick and not is_current;
end $$;
revoke all on function public.refresh_current_cycle(uuid) from public, anon;
grant execute on function public.refresh_current_cycle(uuid) to authenticated;

-- Ciclos podem ser excluídos por quem os gerencia (se houver participações, a FK recusa e o app sugere outra saída).
grant delete on public.cycles to authenticated;
create policy cycles_delete on public.cycles for delete to authenticated using (public.has_permission(organization_id, 'cycles.manage'));
