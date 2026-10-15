-- Correção de segurança: has_permission() devolvia NULL (não false) quando o usuário não possuía a permissão.
-- Em checagens negativas ("if not has_permission(...)") o NULL fazia o IF não disparar e a ação passava.
-- Afetava create_member_invite, log_sensitive_access e set_member_cycle_status. Políticas RLS (forma positiva) não eram afetadas.

create or replace function public.has_permission(p_org uuid, p_perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.permission_scope_of(p_org, p_perm) = 'org', false)
$$;

create or replace function public.can_read_member(p_org uuid, p_member uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_permission(p_org, 'members.read')
      or public.is_self(p_member)
      or (coalesce(public.permission_scope_of(p_org, 'members.read') = 'group', false)
          and public.is_in_my_group(p_org, p_member))
$$;

create or replace function public.set_member_cycle_status(
  p_member uuid, p_cycle uuid, p_status_key text,
  p_notes text default null, p_waitlist_section uuid default null, p_force boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid; v_status public.member_cycle_statuses; v_existing public.member_cycles;
  v_was_active boolean := false; v_full text; v_id uuid; v_allowed boolean;
begin
  select organization_id into v_org from public.members where id = p_member;
  if v_org is null then raise exception 'Integrante não encontrado.' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.cycles where id = p_cycle and organization_id = v_org) then
    raise exception 'Ciclo inválido.' using errcode = 'P0002';
  end if;
  select * into v_status from public.member_cycle_statuses
   where organization_id = v_org and key = p_status_key and is_active;
  if v_status.id is null then raise exception 'Status inválido.' using errcode = 'P0002'; end if;

  v_allowed := public.has_permission(v_org, 'member_cycles.manage')
    or (coalesce(public.permission_scope_of(v_org, 'member_cycles.manage') = 'group', false)
        and public.is_in_my_group(v_org, p_member));
  if not coalesce(v_allowed, false) then
    raise exception 'Você não tem permissão para alterar este status.' using errcode = '42501';
  end if;

  select * into v_existing from public.member_cycles where member_id = p_member and cycle_id = p_cycle;
  if v_existing.id is not null then
    select s.counts_as_active into v_was_active from public.member_cycle_statuses s where s.id = v_existing.status_id;
  end if;

  if v_status.counts_as_active and not coalesce(v_was_active, false) then
    select string_agg(sec.name, ', ') into v_full
    from public.member_artistic_links l
    join public.sections sec on sec.id = l.section_id
    join public.section_cycle_capacity c on c.section_id = l.section_id and c.cycle_id = p_cycle
    where l.member_id = p_member and l.ended_at is null
      and public.section_occupied(l.section_id, p_cycle) >= c.capacity;
    if v_full is not null and not (p_force and public.has_permission(v_org, 'capacity.manage')) then
      raise exception 'Naipe lotado: %. Só a Direção pode autorizar a exceção.', v_full using errcode = 'P0001';
    end if;
  end if;

  insert into public.member_cycles (organization_id, member_id, cycle_id, status_id, joined_on, left_on, notes,
                                    waitlisted_at, waitlist_section_id)
  values (v_org, p_member, p_cycle, v_status.id,
          case when v_status.counts_as_active then current_date end,
          case when not v_status.counts_as_active and not v_status.is_waitlist then current_date end,
          p_notes,
          case when v_status.is_waitlist then now() end,
          case when v_status.is_waitlist then p_waitlist_section end)
  on conflict (member_id, cycle_id) do update set
    status_id = excluded.status_id,
    joined_on = case when v_status.counts_as_active then coalesce(public.member_cycles.joined_on, current_date)
                     else public.member_cycles.joined_on end,
    left_on = case when v_status.counts_as_active then null
                   when v_status.is_waitlist then null else current_date end,
    notes = coalesce(excluded.notes, public.member_cycles.notes),
    waitlisted_at = case when v_status.is_waitlist then coalesce(public.member_cycles.waitlisted_at, now()) end,
    waitlist_section_id = case when v_status.is_waitlist then coalesce(excluded.waitlist_section_id, public.member_cycles.waitlist_section_id) end
  returning id into v_id;
  return v_id;
end $$;
