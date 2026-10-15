-- Eventos INICIAIS do Cordão da Tia Juca: tipos, status de presença e "Ensaio – toda segunda-feira".
-- Horário e local ficam em branco (a Direção edita em Configurações → Recorrências). Idempotente.
do $$
declare v_org uuid; v_type uuid;
begin
  select id into v_org from public.organizations where slug = 'tiajuca';
  if v_org is null then raise exception 'Execute antes seed/tiajuca.sql'; end if;
  perform public.seed_org_events_defaults(v_org);
  select id into v_type from public.activity_types where organization_id = v_org and name = 'Ensaio';
  if not exists (select 1 from public.recurrence_rules where organization_id = v_org and title = 'Ensaio' and weekday = 1) then
    insert into public.recurrence_rules (organization_id, activity_type_id, title, weekday, starts_on)
    values (v_org, v_type, 'Ensaio', 1, (now() at time zone 'America/Sao_Paulo')::date);
  end if;
end $$;
