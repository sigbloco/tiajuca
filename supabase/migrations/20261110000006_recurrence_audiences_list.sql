-- Público da chamada da recorrência com vários itens (ex.: Flauta e Sax alto): lista de {kind, ref}.
alter table public.recurrence_rules add column audiences jsonb not null default '[]'::jsonb
  check (jsonb_typeof(audiences) = 'array' and jsonb_array_length(audiences) <= 20);
update public.recurrence_rules set audiences = jsonb_build_array(jsonb_build_object('kind', audience_kind, 'ref', audience_ref))
 where audience_kind is not null;
alter table public.recurrence_rules drop constraint recurrence_audience_both;
alter table public.recurrence_rules drop column audience_kind, drop column audience_ref;

create or replace function public.materialize_recurrences(p_org uuid, p_until date) returns int
language plpgsql security definer set search_path = '' as $$
declare r public.recurrence_rules; n int := 0; c int; v_end date;
begin
  if not public.has_permission(p_org, 'events.manage') then
    raise exception 'Sem permissão para gerar eventos.' using errcode = '42501';
  end if;
  for r in select * from public.recurrence_rules where organization_id = p_org and is_active loop
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
    if jsonb_array_length(r.audiences) > 0 then
      insert into public.activity_audiences (organization_id, activity_id, kind, ref_id)
      select a.organization_id, a.id, x.elem ->> 'kind', (x.elem ->> 'ref')::uuid
        from public.activities a
        cross join jsonb_array_elements(r.audiences) as x(elem)
       where a.recurrence_rule_id = r.id
         and not exists (select 1 from public.activity_audiences au where au.activity_id = a.id)
         and not a.customized
      on conflict do nothing;
    end if;
  end loop;
  return n;
end $$;
