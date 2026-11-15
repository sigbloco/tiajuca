-- Relatório de presença com recortes combináveis: naipe, instrumento e mês.
create or replace function public._att_filtered(p_org uuid, p_from date, p_to date, p_section uuid, p_instrument uuid, p_month text)
returns table (member_id uuid, activity_id uuid, activity_date date, start_time time, cycle_id uuid, title text, present boolean)
language sql stable security definer set search_path = '' as $$
  select b.member_id, b.activity_id, b.activity_date, b.start_time, b.cycle_id, b.title, b.present
  from public._att_base(p_org, p_from, p_to) b
  where (p_month is null or to_char(b.activity_date, 'YYYY-MM') = p_month)
    and ((p_section is null and p_instrument is null) or exists (
      select 1 from public.member_artistic_links l join public.instruments i on i.id = l.instrument_id
      where l.member_id = b.member_id and l.ended_at is null
        and (p_section is null or i.section_id = p_section)
        and (p_instrument is null or l.instrument_id = p_instrument)))
$$;
revoke all on function public._att_filtered(uuid, date, date, uuid, uuid, text) from public, anon, authenticated;

create or replace function public.attendance_report_f(p_org uuid, p_from date, p_to date, p_group text, p_section uuid default null, p_instrument uuid default null, p_month text default null)
returns table (group_id uuid, label text, sort_key text, records bigint, present bigint, pct numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if p_group not in ('member', 'activity', 'month', 'instrument', 'section') then
    raise exception 'Agrupamento inválido.' using errcode = '22023';
  end if;
  if p_group = 'member' then
    return query select m.id, coalesce(m.display_name, m.full_name), lower(coalesce(m.display_name, m.full_name)), count(*), count(*) filter (where b.present),
      round(100.0 * count(*) filter (where b.present) / count(*), 1)
    from public._att_filtered(p_org, p_from, p_to, p_section, p_instrument, p_month) b join public.members m on m.id = b.member_id group by m.id;
  elsif p_group = 'activity' then
    return query select b.activity_id, b.title || ' · ' || to_char(b.activity_date, 'DD/MM/YYYY'), to_char(b.activity_date, 'YYYY-MM-DD'), count(*), count(*) filter (where b.present),
      round(100.0 * count(*) filter (where b.present) / count(*), 1)
    from public._att_filtered(p_org, p_from, p_to, p_section, p_instrument, p_month) b group by b.activity_id, b.title, b.activity_date;
  elsif p_group = 'month' then
    return query select null::uuid, to_char(date_trunc('month', b.activity_date), 'MM/YYYY'), to_char(date_trunc('month', b.activity_date), 'YYYY-MM'), count(*), count(*) filter (where b.present),
      round(100.0 * count(*) filter (where b.present) / count(*), 1)
    from public._att_filtered(p_org, p_from, p_to, p_section, p_instrument, p_month) b group by date_trunc('month', b.activity_date);
  elsif p_group = 'instrument' then
    return query select i.id, i.name, lower(i.name), count(*), count(*) filter (where b.present),
      round(100.0 * count(*) filter (where b.present) / count(*), 1)
    from public._att_filtered(p_org, p_from, p_to, p_section, p_instrument, p_month) b
    join public.member_artistic_links l on l.member_id = b.member_id and l.ended_at is null
    join public.instruments i on i.id = l.instrument_id
    where (p_section is null or i.section_id = p_section) and (p_instrument is null or i.id = p_instrument)
    group by i.id, i.name;
  else
    return query select s.id, s.name, lower(s.name), count(*), count(*) filter (where b.present),
      round(100.0 * count(*) filter (where b.present) / count(*), 1)
    from public._att_filtered(p_org, p_from, p_to, p_section, p_instrument, p_month) b
    join public.member_artistic_links l on l.member_id = b.member_id and l.ended_at is null
    join public.instruments i on i.id = l.instrument_id join public.sections s on s.id = i.section_id
    where (p_section is null or s.id = p_section) and (p_instrument is null or i.id = p_instrument)
    group by s.id, s.name;
  end if;
end $$;
revoke all on function public.attendance_report_f(uuid, date, date, text, uuid, uuid, text) from public, anon;
grant execute on function public.attendance_report_f(uuid, date, date, text, uuid, uuid, text) to authenticated;
