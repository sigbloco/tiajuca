-- Data de fundação do bloco (primeiro cortejo: 25/02/2023): aparece nos aniversários do Calendário, com o ano para todos.
alter table public.organizations add column if not exists founded_on date;
update public.organizations set founded_on = date '2023-02-25' where founded_on is null;

create or replace function public.set_org_founded(p_org uuid, p_date date) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_permission(p_org, 'org.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  update public.organizations set founded_on = p_date where id = p_org;
end $$;
revoke all on function public.set_org_founded(uuid, date) from public, anon;
grant execute on function public.set_org_founded(uuid, date) to authenticated;

drop function if exists public.birthday_list(uuid);
create or replace function public.birthday_list(p_org uuid)
returns table (member_id uuid, full_name text, display_name text, month_day text, birth_year int, is_org boolean)
language plpgsql stable security definer set search_path = '' as $$
declare v_staff boolean;
begin
  if not public.is_org_member(p_org) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  v_staff := coalesce(public.is_staff(p_org), false);
  return query
    select m.id, m.full_name, m.display_name, to_char(m.birth_date, 'MM-DD'),
           case when v_staff then extract(year from m.birth_date)::int end, false
      from public.members m
     where m.organization_id = p_org and m.archived_at is null and m.birth_date is not null
    union all
    select null::uuid, o.name, null::text, to_char(o.founded_on, 'MM-DD'), extract(year from o.founded_on)::int, true
      from public.organizations o where o.id = p_org and o.founded_on is not null;
end $$;
revoke all on function public.birthday_list(uuid) from public, anon;
grant execute on function public.birthday_list(uuid) to authenticated;
