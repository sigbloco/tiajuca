-- Recorrência com público da chamada (naipe, subnaipe ou instrumento), copiado para cada data gerada.
-- "Até" em branco = até o fim do ciclo em que a recorrência começa.
alter table public.recurrence_rules
  add column audience_kind text check (audience_kind in ('section', 'subsection', 'instrument')),
  add column audience_ref uuid,
  add constraint recurrence_audience_both check ((audience_kind is null) = (audience_ref is null));

create or replace function public.materialize_recurrences(p_org uuid, p_until date) returns int
language plpgsql security definer set search_path = '' as $$
declare r public.recurrence_rules; n int := 0; c int; v_end date;
begin
  if not public.has_permission(p_org, 'events.manage') then
    raise exception 'Sem permissão para gerar eventos.' using errcode = '42501';
  end if;
  for r in select * from public.recurrence_rules where organization_id = p_org and is_active loop
    -- Sem "Até": vai até o fim do ciclo que contém a data inicial (ou o atual); sem ciclo, só o horizonte pedido.
    v_end := coalesce(r.until, (
      select cy.ends_on from public.cycles cy
       where cy.organization_id = r.organization_id and cy.is_active
         and (r.starts_on between cy.starts_on and cy.ends_on or cy.is_current)
       order by (r.starts_on between cy.starts_on and cy.ends_on) desc, cy.is_current desc limit 1), p_until);
    insert into public.activities (organization_id, activity_type_id, cycle_id, title, activity_date, start_time, end_time,
                                   location, description, visibility, recurrence_rule_id, itinerary)
    select r.organization_id, r.activity_type_id,
           (select cy.id from public.cycles cy
             where cy.organization_id = r.organization_id and cy.is_active and g.d::date between cy.starts_on and cy.ends_on
             order by cy.is_current desc, cy.starts_on desc limit 1),
           r.title, g.d::date, r.start_time, r.end_time, r.location, r.description, r.visibility, r.id, r.itinerary
    from generate_series(r.starts_on::timestamp, least(v_end, p_until)::timestamp, interval '1 day') as g(d)
    where extract(dow from g.d) = r.weekday
    on conflict do nothing;
    get diagnostics c = row_count;
    n := n + c;
    if r.audience_kind is not null then
      insert into public.activity_audiences (organization_id, activity_id, kind, ref_id)
      select a.organization_id, a.id, r.audience_kind, r.audience_ref
        from public.activities a
       where a.recurrence_rule_id = r.id
         and not exists (select 1 from public.activity_audiences au where au.activity_id = a.id)
         and not a.customized
      on conflict do nothing;
    end if;
  end loop;
  return n;
end $$;
