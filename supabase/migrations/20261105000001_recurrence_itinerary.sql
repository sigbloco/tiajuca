-- Recorrências também têm roteiro; copiado para cada evento gerado.
alter table public.recurrence_rules add column itinerary jsonb check (itinerary is null or (jsonb_typeof(itinerary) = 'array' and jsonb_array_length(itinerary) <= 30));

create or replace function public.materialize_recurrences(p_org uuid, p_until date) returns int
language plpgsql security definer set search_path = '' as $$
declare r public.recurrence_rules; n int := 0; c int;
begin
  if not public.has_permission(p_org, 'events.manage') then
    raise exception 'Sem permissão para gerar eventos.' using errcode = '42501';
  end if;
  for r in select * from public.recurrence_rules where organization_id = p_org and is_active loop
    insert into public.activities (organization_id, activity_type_id, cycle_id, title, activity_date, start_time, end_time,
                                   location, description, visibility, recurrence_rule_id, itinerary)
    select r.organization_id, r.activity_type_id,
           (select cy.id from public.cycles cy
             where cy.organization_id = r.organization_id and cy.is_active and g.d::date between cy.starts_on and cy.ends_on
             order by cy.is_current desc, cy.starts_on desc limit 1),
           r.title, g.d::date, r.start_time, r.end_time, r.location, r.description, r.visibility, r.id, r.itinerary
    from generate_series(r.starts_on::timestamp, least(coalesce(r.until, p_until), p_until)::timestamp, interval '1 day') as g(d)
    where extract(dow from g.d) = r.weekday
    on conflict do nothing;
    get diagnostics c = row_count;
    n := n + c;
  end loop;
  return n;
end $$;
