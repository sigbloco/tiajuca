-- Quem está INATIVO no ciclo atual continua entrando, mas com acesso MUITO limitado: só o próprio cadastro, a própria
-- frequência e as próprias mensalidades (somente leitura, escopo "próprio"); nenhum papel de equipe vale enquanto estiver inativo.
-- Para voltar a ficar ativo é preciso a AUTORIZAÇÃO da Direção ou de um Professor do grupo da pessoa:
--   • a pessoa inativa envia um pedido (request_reactivation); Direção/Professor aprova ou recusa (decide_reactivation);
--   • Monitor não reativa ninguém; a regra vale também para a troca direta de status na ficha.
-- Exceções de segurança: Titular e Direção nunca são limitados por estarem inativos (evita trancar o bloco para fora);
-- quem não tem registro no ciclo atual NÃO é limitado (só a situação inativa explícita limita); sem ciclo atual, ninguém é limitado.

create or replace function public.member_is_inactive(p_member uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.member_cycles mc
      join public.cycles c on c.id = mc.cycle_id and c.is_current
      join public.member_cycle_statuses s on s.id = mc.status_id and not s.counts_as_active and not s.is_waitlist
     where mc.member_id = p_member
  ) and not exists (
    select 1 from public.member_access_roles mar join public.access_roles ar on ar.id = mar.access_role_id
     where mar.member_id = p_member and mar.revoked_at is null and ar.key in ('titular', 'direcao')
  )
$$;
revoke all on function public.member_is_inactive(uuid) from public, anon, authenticated;

-- A pessoa continua membro da organização (vê o que é de todos); o que muda é o poder: só leitura "própria".
create or replace function public.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members m
    join public.organizations o on o.id = m.organization_id and o.is_active
    where m.organization_id = p_org and m.user_id = auth.uid() and m.archived_at is null
  )
$$;

create or replace function public.permission_scope_of(p_org uuid, p_perm text)
returns public.permission_scope
language sql stable security definer set search_path = '' as $$
  select x.s from (
    select case when i.inactive then 'own'::public.permission_scope else rp.scope end as s
    from public.members m
    cross join lateral (select public.member_is_inactive(m.id) as inactive) i
    join public.member_access_roles mar on mar.member_id = m.id and mar.revoked_at is null
    join public.role_permissions rp on rp.access_role_id = mar.access_role_id
    where m.organization_id = p_org and m.user_id = auth.uid() and m.archived_at is null
      and rp.permission_key = p_perm
      and (not i.inactive or p_perm in ('members.read', 'billing.read', 'attendance.read'))
  ) x
  order by x.s desc
  limit 1
$$;

create or replace function public.get_my_memberships() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'organization_id', o.id, 'slug', o.slug, 'name', o.name, 'short_name', o.short_name,
    'logo_path', o.logo_path, 'theme', o.theme, 'timezone', o.timezone,
    'member_id', m.id, 'display_name', coalesce(m.display_name, m.full_name),
    'inactive', public.member_is_inactive(m.id),
    'roles', case when public.member_is_inactive(m.id) then '["integrante"]'::jsonb else coalesce((
      select jsonb_agg(ar.key order by ar.rank desc)
      from public.member_access_roles mar join public.access_roles ar on ar.id = mar.access_role_id
      where mar.member_id = m.id and mar.revoked_at is null), '[]'::jsonb) end,
    'permissions', coalesce((
      select jsonb_agg(jsonb_build_object('key', x.k, 'scope', x.s::text))
      from (select rp.permission_key k,
                   case when public.member_is_inactive(m.id) then 'own' else max(rp.scope)::text end as s
            from public.member_access_roles mar
            join public.role_permissions rp on rp.access_role_id = mar.access_role_id
            where mar.member_id = m.id and mar.revoked_at is null
              and (not public.member_is_inactive(m.id) or rp.permission_key in ('members.read', 'billing.read', 'attendance.read'))
            group by rp.permission_key) x), '[]'::jsonb)
  )), '[]'::jsonb)
  from public.members m
  join public.organizations o on o.id = m.organization_id and o.is_active
  where m.user_id = auth.uid() and m.archived_at is null
$$;
revoke all on function public.get_my_memberships() from public, anon;
grant execute on function public.get_my_memberships() to authenticated;

-- ───────────── quem pode autorizar a volta ─────────────
create or replace function public.caller_has_role(p_org uuid, p_keys text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members m
    join public.member_access_roles mar on mar.member_id = m.id and mar.revoked_at is null
    join public.access_roles ar on ar.id = mar.access_role_id and ar.key = any (p_keys)
    where m.organization_id = p_org and m.user_id = auth.uid() and m.archived_at is null
      and not public.member_is_inactive(m.id)
  )
$$;
revoke all on function public.caller_has_role(uuid, text[]) from public, anon, authenticated;

-- Direção/Titular autorizam qualquer pessoa; Professor, só quem é do seu grupo. Monitor nunca.
create or replace function public.can_decide_reactivation(p_org uuid, p_member uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members where id = p_member and organization_id = p_org)
     and (public.caller_has_role(p_org, array['titular', 'direcao'])
          or (public.caller_has_role(p_org, array['professor']) and public.is_in_my_group(p_org, p_member)))
$$;
revoke all on function public.can_decide_reactivation(uuid, uuid) from public, anon;
grant execute on function public.can_decide_reactivation(uuid, uuid) to authenticated;

create table public.reactivation_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, member_id uuid not null, cycle_id uuid not null,
  message text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_by uuid references public.members(id), decided_at timestamptz, decision_note text,
  unique (organization_id, id),
  foreign key (organization_id, member_id) references public.members (organization_id, id),
  foreign key (organization_id, cycle_id) references public.cycles (organization_id, id)
);
create unique index reactivation_one_pending_uq on public.reactivation_requests (member_id, cycle_id) where status = 'pending';
alter table public.reactivation_requests enable row level security;
revoke all on public.reactivation_requests from anon, authenticated;
grant select on public.reactivation_requests to authenticated;
create trigger trg_audit_reactivation_requests after insert or update on public.reactivation_requests for each row execute function public.fn_audit();
-- Lê o pedido: quem pediu e quem pode decidir. Escrita só pelas funções abaixo.
create policy reactivation_select on public.reactivation_requests for select to authenticated
  using (public.is_self(member_id) or public.can_decide_reactivation(organization_id, member_id));

create or replace function public.request_reactivation(p_org uuid, p_message text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_member uuid; v_cycle uuid; v_id uuid;
begin
  v_member := public.current_member_id(p_org);
  if v_member is null then raise exception 'Você não faz parte desta organização.' using errcode = '42501'; end if;
  if not public.member_is_inactive(v_member) then raise exception 'Sua participação já está ativa.' using errcode = 'P0001'; end if;
  select id into v_cycle from public.cycles where organization_id = p_org and is_current;
  if v_cycle is null then raise exception 'Não há ciclo atual.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.reactivation_requests where member_id = v_member and cycle_id = v_cycle and status = 'pending') then
    raise exception 'Você já tem um pedido em análise.' using errcode = 'P0001';
  end if;
  insert into public.reactivation_requests (organization_id, member_id, cycle_id, message)
  values (p_org, v_member, v_cycle, nullif(trim(p_message), '')) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.request_reactivation(uuid, text) from public, anon;
grant execute on function public.request_reactivation(uuid, text) to authenticated;

create or replace function public.decide_reactivation(p_request uuid, p_approve boolean, p_note text default null, p_force boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.reactivation_requests; v_actor uuid;
begin
  select * into r from public.reactivation_requests where id = p_request;
  if r.id is null then raise exception 'Pedido não encontrado.' using errcode = 'P0002'; end if;
  if not public.can_decide_reactivation(r.organization_id, r.member_id) then
    raise exception 'Só a Direção ou um professor do grupo da pessoa pode decidir.' using errcode = '42501';
  end if;
  if r.status <> 'pending' then raise exception 'Este pedido já foi decidido.' using errcode = 'P0001'; end if;
  v_actor := public.current_member_id(r.organization_id);
  if p_approve then
    perform public.set_member_cycle_status(r.member_id, r.cycle_id, 'active', 'Reativado a pedido', null, p_force);
  end if;
  update public.reactivation_requests
     set status = case when p_approve then 'approved' else 'rejected' end, decided_by = v_actor, decided_at = now(), decision_note = nullif(trim(p_note), '')
   where id = r.id;
end $$;
revoke all on function public.decide_reactivation(uuid, boolean, text, boolean) from public, anon;
grant execute on function public.decide_reactivation(uuid, boolean, text, boolean) to authenticated;

-- A troca direta de status na ficha também respeita a regra: reativar um inativo exige Direção ou Professor do grupo.
create or replace function public.set_member_cycle_status(
  p_member uuid, p_cycle uuid, p_status_key text,
  p_notes text default null, p_waitlist_instrument uuid default null, p_force boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid; v_status public.member_cycle_statuses; v_existing public.member_cycles;
  v_was_active boolean := false; v_was_inactive boolean := false; v_full text; v_id uuid; v_allowed boolean;
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
    select s.counts_as_active, (not s.counts_as_active and not s.is_waitlist)
      into v_was_active, v_was_inactive from public.member_cycle_statuses s where s.id = v_existing.status_id;
  end if;

  if v_status.counts_as_active and coalesce(v_was_inactive, false) and not public.can_decide_reactivation(v_org, p_member) then
    raise exception 'Só a Direção ou um professor do grupo da pessoa pode reativar um integrante inativo.' using errcode = 'P0001';
  end if;

  if v_status.counts_as_active and not coalesce(v_was_active, false) then
    select string_agg(i.name, ', ') into v_full
    from public.member_artistic_links l
    join public.instruments i on i.id = l.instrument_id
    join public.instrument_cycle_capacity c on c.instrument_id = l.instrument_id and c.cycle_id = p_cycle
    where l.member_id = p_member and l.ended_at is null
      and public.instrument_occupied(l.instrument_id, p_cycle) >= c.capacity;
    if v_full is not null and not (p_force and public.has_permission(v_org, 'capacity.manage')) then
      raise exception 'Vaga lotada em: %. Só a Direção pode autorizar a exceção.', v_full using errcode = 'P0001';
    end if;
  end if;

  insert into public.member_cycles (organization_id, member_id, cycle_id, status_id, joined_on, left_on, notes,
                                    waitlisted_at, waitlist_instrument_id)
  values (v_org, p_member, p_cycle, v_status.id,
          case when v_status.counts_as_active then current_date end,
          case when not v_status.counts_as_active and not v_status.is_waitlist then current_date end,
          p_notes,
          case when v_status.is_waitlist then now() end,
          case when v_status.is_waitlist then p_waitlist_instrument end)
  on conflict (member_id, cycle_id) do update set
    status_id = excluded.status_id,
    joined_on = case when v_status.counts_as_active then coalesce(public.member_cycles.joined_on, current_date)
                     else public.member_cycles.joined_on end,
    left_on = case when v_status.counts_as_active then null
                   when v_status.is_waitlist then null else current_date end,
    notes = coalesce(excluded.notes, public.member_cycles.notes),
    waitlisted_at = case when v_status.is_waitlist then coalesce(public.member_cycles.waitlisted_at, now()) end,
    waitlist_instrument_id = case when v_status.is_waitlist then coalesce(excluded.waitlist_instrument_id, public.member_cycles.waitlist_instrument_id) end
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.set_member_cycle_status(uuid, uuid, text, text, uuid, boolean) from public, anon;
grant execute on function public.set_member_cycle_status(uuid, uuid, text, text, uuid, boolean) to authenticated;
