-- 1) Regência é artística, não tem remuneração: a atribuição de regente fica sem "paga/colaborativa".
alter table public.staff_assignments alter column compensation drop not null;
update public.staff_assignments set compensation = null where staff_kind = 'regente';
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.sync_staff_compensation(uuid)'::regprocedure);
  n := replace(d, 'where sa.member_id = p_member and sa.valid_to is null;', 'where sa.member_id = p_member and sa.valid_to is null and sa.staff_kind <> ''regente'';');
  if n = d then raise exception 'patch sync_staff_compensation'; end if;
  execute n;
end $$;

-- 2) Gerar a recorrência num dia específico (também em dias ANTERIORES ao início dela, ou que o gerador não cobriu).
create or replace function public.generate_recurrence_day(p_rule uuid, p_date date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare r public.recurrence_rules; v_id uuid;
begin
  select * into r from public.recurrence_rules where id = p_rule;
  if r.id is null or not public.has_permission(r.organization_id, 'events.manage') then
    raise exception 'Sem permissão para gerar eventos.' using errcode = '42501';
  end if;
  if extract(dow from p_date) <> r.weekday then
    raise exception 'Esta recorrência não cai neste dia da semana.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.activities a where a.recurrence_rule_id = r.id and a.activity_date = p_date and a.deleted_at is null) then
    raise exception 'Já existe um evento desta recorrência neste dia.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.activities a where a.recurrence_rule_id = r.id and a.activity_date = p_date and a.deleted_at is not null) then
    raise exception 'Este dia tem um evento desta recorrência na lixeira: restaure-o por lá.' using errcode = 'P0001';
  end if;
  delete from public.recurrence_skips where rule_id = r.id and activity_date = p_date;
  insert into public.activities (organization_id, activity_type_id, cycle_id, title, activity_date, start_time, end_time,
                                 location, description, visibility, recurrence_rule_id, itinerary, has_attendance)
  values (r.organization_id, r.activity_type_id,
          (select cy.id from public.cycles cy where cy.organization_id = r.organization_id and cy.is_active and p_date between cy.starts_on and cy.ends_on order by cy.is_current desc, cy.starts_on desc limit 1),
          r.title, p_date, r.start_time, r.end_time, r.location, r.description, r.visibility, r.id, r.itinerary, r.has_attendance)
  returning id into v_id;
  if jsonb_array_length(r.audiences) > 0 then
    insert into public.activity_audiences (organization_id, activity_id, kind, ref_id)
    select r.organization_id, v_id, x.elem ->> 'kind', (x.elem ->> 'ref')::uuid from jsonb_array_elements(r.audiences) as x(elem) on conflict do nothing;
  end if;
  if cardinality(r.extra_type_ids) > 0 then
    insert into public.activity_type_links (organization_id, activity_id, activity_type_id)
    select r.organization_id, v_id, t from unnest(r.extra_type_ids) as t where t <> r.activity_type_id on conflict do nothing;
  end if;
  return v_id;
end $$;
revoke all on function public.generate_recurrence_day(uuid, date) from public, anon;
grant execute on function public.generate_recurrence_day(uuid, date) to authenticated;
