-- Papel de acesso único "Professor/Monitor" (chave 'professor').
-- Só o PAPEL DE ACESSO muda. A função na equipe (staff_assignments.staff_kind professor/monitor/regente), o organograma,
-- os naipes, as categorias artísticas e o pagamento da equipe continuam como estão.
--
-- 1. Quem tem o papel 'monitor' passa para 'professor' (sem perder ninguém nem duplicar; revogados continuam revogados).
-- 2. Liberação de páginas: liberada para o papel único se estava liberada para qualquer um dos dois.
-- 3. O papel 'monitor' some (permissões e liberações vão junto); o check de page_releases.category perde 'monitor'.
-- 4. Funções:
--    - is_in_my_group: só atribuições de professor e monitor (regente é simbólico e não amplia o grupo).
--    - can_record_attendance_for: quem tem atribuição vigente de professor OU monitor no ciclo atual registra para qualquer integrante.
--    - can_decide_reactivation: sem mudança de código; com a migração, todo o papel único reativa inativo do próprio grupo.
--    - _viewer_section: o naipe de quem preenche formulário ignora a atribuição de regente.
--    - can_see_drive_folder, drive_sync_context, shop_active_member_id, shop_is_special, seed_org_defaults: sem a chave 'monitor'.
--    - decide_reactivation, set_member_cycle_status: textos ("Professor/Monitor do grupo").

-- ── Conferência inicial: quem tem papel de equipe ativo ─────────────────────────────────────────────
create temp table _antes on commit drop as
  select distinct mar.organization_id, mar.member_id
    from public.member_access_roles mar join public.access_roles ar on ar.id = mar.access_role_id
   where mar.revoked_at is null and ar.key in ('professor', 'monitor');

-- ── 1. Papel único em cada organização (cria 'professor' se só houver 'monitor') ───────────────────
insert into public.access_roles (organization_id, key, name, rank, is_system)
select m.organization_id, 'professor', 'Professor/Monitor', 30, true
  from public.access_roles m where m.key = 'monitor'
on conflict (organization_id, key) do nothing;
update public.access_roles set name = 'Professor/Monitor' where key = 'professor' and name <> 'Professor/Monitor';

-- ── 2. Liberação de páginas: OU das duas colunas ───────────────────────────────────────────────────
insert into public.page_releases (organization_id, page_key, category, released, updated_at, updated_by)
select m.organization_id, m.page_key, 'professor', m.released, m.updated_at, m.updated_by
  from public.page_releases m where m.category = 'monitor'
on conflict (organization_id, page_key, category)
  do update set released = public.page_releases.released or excluded.released;
delete from public.page_releases where category = 'monitor';
alter table public.page_releases drop constraint page_releases_category_check;
alter table public.page_releases add constraint page_releases_category_check
  check (category = any (array['direcao', 'professor', 'ativo', 'inativo']));

-- ── 3. Concessões: 'monitor' → 'professor' ─────────────────────────────────────────────────────────
-- Quem já tem os dois ativos: a concessão de monitor é revogada (fica no histórico) para não duplicar.
update public.member_access_roles mon set revoked_at = now()
  from public.access_roles am
 where am.id = mon.access_role_id and am.key = 'monitor' and mon.revoked_at is null
   and exists (select 1 from public.member_access_roles p join public.access_roles ap on ap.id = p.access_role_id and ap.key = 'professor'
                where p.member_id = mon.member_id and p.revoked_at is null);
-- As demais passam para o papel único, mantendo data, quem concedeu e revogação (o gatilho de identidade
-- impede trocar o papel de uma concessão; fica desligado só nesta troca).
alter table public.member_access_roles disable trigger trg_guard_member_role_identity;
update public.member_access_roles mar set access_role_id = ap.id
  from public.access_roles am, public.access_roles ap
 where am.id = mar.access_role_id and am.key = 'monitor'
   and ap.organization_id = am.organization_id and ap.key = 'professor';
alter table public.member_access_roles enable trigger trg_guard_member_role_identity;

-- Pastas do Drive liberadas para o papel 'monitor' passam para o papel único (sem duplicar).
update public.drive_folder_access a set access_role_id = ap.id
  from public.access_roles am, public.access_roles ap
 where am.id = a.access_role_id and am.key = 'monitor' and ap.organization_id = am.organization_id and ap.key = 'professor'
   and not exists (select 1 from public.drive_folder_access x where x.folder_id = a.folder_id and x.access_role_id = ap.id);
delete from public.drive_folder_access a using public.access_roles am where am.id = a.access_role_id and am.key = 'monitor';

-- Papel antigo (as permissões vão junto, por cascata).
delete from public.role_permissions rp using public.access_roles am where am.id = rp.access_role_id and am.key = 'monitor';
delete from public.access_roles where key = 'monitor';

-- ── Conferência: ninguém perdido, ninguém duplicado ────────────────────────────────────────────────
do $$
declare n_lost int; n_dup int;
begin
  select count(*) into n_lost from _antes b
   where not exists (select 1 from public.member_access_roles mar join public.access_roles ar on ar.id = mar.access_role_id and ar.key = 'professor'
                      where mar.member_id = b.member_id and mar.revoked_at is null);
  select count(*) into n_dup from (
    select mar.member_id from public.member_access_roles mar join public.access_roles ar on ar.id = mar.access_role_id and ar.key = 'professor'
     where mar.revoked_at is null group by mar.member_id having count(*) > 1) d;
  if n_lost > 0 or n_dup > 0 or exists (select 1 from public.access_roles where key = 'monitor') then
    raise exception 'Migração do papel Monitor falhou: % sem papel, % duplicados.', n_lost, n_dup;
  end if;
end $$;

-- ── 4. Funções ─────────────────────────────────────────────────────────────────────────────────────
create or replace function public.is_in_my_group(p_org uuid, p_member uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  -- Grupo = naipes/instrumentos em que a pessoa é professor ou monitor no ciclo atual. Regente é simbólico: não conta.
  select exists (
    select 1
    from public.staff_assignments sa
    join public.member_artistic_links l on l.member_id = p_member and l.ended_at is null
    join public.instruments i on i.id = l.instrument_id
    where sa.organization_id = p_org
      and sa.member_id = public.current_member_id(p_org)
      and sa.staff_kind in ('professor', 'monitor')
      and (sa.valid_to is null or sa.valid_to >= current_date)
      and sa.cycle_id = (select c.id from public.cycles c where c.organization_id = p_org and c.is_current limit 1)
      and (sa.instrument_id = i.id or sa.section_id = i.section_id)
  )
$function$;

create or replace function public.can_record_attendance_for(p_org uuid, p_member uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  -- Professor ou monitor (atribuição vigente no ciclo atual) registra presença de qualquer integrante da organização.
  select exists (select 1 from public.members m where m.id = p_member and m.organization_id = p_org)
     and exists (
      select 1 from public.staff_assignments sa
      where sa.organization_id = p_org and sa.member_id = public.current_member_id(p_org)
        and sa.staff_kind in ('professor', 'monitor') and (sa.valid_to is null or sa.valid_to >= current_date)
        and sa.cycle_id = (select c.id from public.cycles c where c.organization_id = p_org and c.is_current limit 1))
$function$;

create or replace function public._viewer_section(p_member uuid)
 returns uuid
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce(
    (select i.section_id from public.member_artistic_links l join public.instruments i on i.id = l.instrument_id
      where l.member_id = p_member and l.ended_at is null order by l.is_primary desc, l.created_at limit 1),
    (select coalesce(a.section_id, i.section_id) from public.staff_assignments a left join public.instruments i on i.id = a.instrument_id
      where a.member_id = p_member and a.valid_to is null and a.staff_kind in ('professor', 'monitor')
        and coalesce(a.section_id, i.section_id) is not null order by a.created_at limit 1))
$function$;

create or replace function public.can_see_drive_folder(p_folder uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select exists (
    select 1 from public.drive_folders f
    join public.members m on m.organization_id = f.organization_id and m.user_id = auth.uid() and m.archived_at is null
    where f.id = p_folder and f.is_active and (
      exists (select 1 from public.member_access_roles mar join public.access_roles ar on ar.id = mar.access_role_id
               where mar.member_id = m.id and mar.revoked_at is null and ar.key = 'professor')
      or exists (
        select 1 from public.drive_folder_access a where a.folder_id = f.id and (
          (a.access_role_id is not null and exists (
            select 1 from public.member_access_roles mar where mar.member_id = m.id and mar.revoked_at is null and mar.access_role_id = a.access_role_id))
          or (a.section_id is not null and exists (
            select 1 from public.member_artistic_links l join public.instruments i on i.id = l.instrument_id
             where l.member_id = m.id and l.ended_at is null and i.section_id = a.section_id))
          or (a.instrument_id is not null and exists (
            select 1 from public.member_artistic_links l where l.member_id = m.id and l.ended_at is null and l.instrument_id = a.instrument_id))))
    )
  )
$function$;

create or replace function public.drive_sync_context(p_folder uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare f public.drive_folders; v_targets jsonb; v_shares jsonb;
begin
  select * into f from public.drive_folders where id = p_folder;
  if f.id is null then raise exception 'Pasta não encontrada.' using errcode = 'P0002'; end if;
  if not public.has_permission(f.organization_id, 'drive.manage') then raise exception 'Sem permissão para sincronizar o Drive.' using errcode = '42501'; end if;
  if f.drive_folder_id is null then raise exception 'O link desta pasta não tem um identificador do Drive. Use o link da pasta (…/folders/ID).' using errcode = 'P0001'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('member_id', m.id, 'email', lower(trim(m.email)), 'name', coalesce(m.display_name, m.full_name)) order by m.full_name), '[]'::jsonb)
    into v_targets
    from public.members m
   where m.organization_id = f.organization_id and m.archived_at is null and m.email is not null and length(trim(m.email)) > 3
     and (
       exists (select 1 from public.member_access_roles mar join public.access_roles ar on ar.id = mar.access_role_id
                where mar.member_id = m.id and mar.revoked_at is null and ar.key in ('titular', 'direcao', 'professor'))
       or (
         (exists (select 1 from public.member_cycles mc join public.cycles c on c.id = mc.cycle_id and c.is_current
                    join public.member_cycle_statuses s on s.id = mc.status_id and s.counts_as_active where mc.member_id = m.id)
          or exists (select 1 from public.member_access_roles mar join public.access_roles ar on ar.id = mar.access_role_id
                      where mar.member_id = m.id and mar.revoked_at is null and ar.key = 'professor'))
         and exists (
           select 1 from public.drive_folder_access a where a.folder_id = f.id and (
             (a.access_role_id is not null and exists (select 1 from public.member_access_roles mar where mar.member_id = m.id and mar.revoked_at is null and mar.access_role_id = a.access_role_id))
             or (a.section_id is not null and exists (select 1 from public.member_artistic_links l join public.instruments i on i.id = l.instrument_id
                                                       where l.member_id = m.id and l.ended_at is null and i.section_id = a.section_id))
             or (a.instrument_id is not null and exists (select 1 from public.member_artistic_links l where l.member_id = m.id and l.ended_at is null and l.instrument_id = a.instrument_id))))
       )
     );

  select coalesce(jsonb_agg(jsonb_build_object('email', s.email, 'permission_id', s.drive_permission_id)), '[]'::jsonb)
    into v_shares from public.drive_folder_shares s where s.folder_id = f.id and s.removed_at is null;

  return jsonb_build_object('folder_name', f.name, 'drive_folder_id', f.drive_folder_id, 'targets', v_targets, 'shares', v_shares);
end $function$;

create or replace function public.shop_active_member_id(p_org uuid, p_user uuid)
 returns uuid
 language sql
 stable security definer
 set search_path to ''
as $function$
  select m.id from public.members m
   where m.organization_id = p_org and m.user_id = p_user and m.archived_at is null
     and not public.member_is_inactive(m.id)
     and (
       exists (
         select 1 from public.member_cycles mc
           join public.cycles c on c.id = mc.cycle_id and c.is_current
           join public.member_cycle_statuses s on s.id = mc.status_id and s.counts_as_active and not s.is_waitlist
          where mc.member_id = m.id)
       or exists (
         select 1 from public.member_access_roles mar
           join public.access_roles ar on ar.id = mar.access_role_id and ar.key in ('titular', 'direcao', 'professor')
          where mar.member_id = m.id and mar.revoked_at is null)
     )
   limit 1
$function$;

create or replace function public.shop_is_special(p_org uuid, p_user uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select public.shop_active_member_id(p_org, p_user) is not null
     and exists (
       select 1 from public.members m
         join public.member_access_roles mar on mar.member_id = m.id and mar.revoked_at is null
         join public.access_roles ar on ar.id = mar.access_role_id and ar.key in ('titular', 'direcao', 'professor')
        where m.organization_id = p_org and m.user_id = p_user and m.archived_at is null)
$function$;

create or replace function public.decide_reactivation(p_request uuid, p_approve boolean, p_note text default null::text, p_force boolean default false)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare r public.reactivation_requests; v_actor uuid;
begin
  select * into r from public.reactivation_requests where id = p_request;
  if r.id is null then raise exception 'Pedido não encontrado.' using errcode = 'P0002'; end if;
  if not public.can_decide_reactivation(r.organization_id, r.member_id) then
    raise exception 'Só a Direção ou um Professor/Monitor do grupo da pessoa pode decidir.' using errcode = '42501';
  end if;
  if r.status <> 'pending' then raise exception 'Este pedido já foi decidido.' using errcode = 'P0001'; end if;
  v_actor := public.current_member_id(r.organization_id);
  if p_approve then
    perform public.set_member_cycle_status(r.member_id, r.cycle_id, 'active', 'Reativado a pedido', null, p_force);
  end if;
  update public.reactivation_requests
     set status = case when p_approve then 'approved' else 'rejected' end, decided_by = v_actor, decided_at = now(), decision_note = nullif(trim(p_note), '')
   where id = r.id;
end $function$;

create or replace function public.set_member_cycle_status(p_member uuid, p_cycle uuid, p_status_key text, p_notes text default null::text, p_waitlist_instrument uuid default null::uuid, p_force boolean default false)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
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

  select * into v_existing from public.member_cycles where member_id = p_member and cycle_id = p_cycle;
  if v_existing.id is not null then
    select s.counts_as_active, (not s.counts_as_active and not s.is_waitlist)
      into v_was_active, v_was_inactive from public.member_cycle_statuses s where s.id = v_existing.status_id;
  end if;

  v_allowed := public.has_permission(v_org, 'member_cycles.manage')
    or (coalesce(public.permission_scope_of(v_org, 'member_cycles.manage') = 'group', false)
        and public.is_in_my_group(v_org, p_member))
    -- Reativação (inativo → ativo): também quem pode decidir reativações (Professor/Monitor do grupo da pessoa).
    or (v_status.counts_as_active and coalesce(v_was_inactive, false) and public.can_decide_reactivation(v_org, p_member));
  if not coalesce(v_allowed, false) then
    raise exception 'Você não tem permissão para alterar este status.' using errcode = '42501';
  end if;

  if v_status.counts_as_active and coalesce(v_was_inactive, false) and not public.can_decide_reactivation(v_org, p_member) then
    raise exception 'Só a Direção ou um Professor/Monitor do grupo da pessoa pode reativar um integrante inativo.' using errcode = 'P0001';
  end if;

  if v_status.counts_as_active and not coalesce(v_was_active, false) then
    select string_agg(i.name, ', ') into v_full
    from (
      select p.instrument_id from public.cycle_participations p where p.member_id = p_member and p.cycle_id = p_cycle and p.instrument_id is not null
      union
      select l.instrument_id from public.member_artistic_links l
       where l.member_id = p_member and l.ended_at is null and l.instrument_id is not null
         and exists (select 1 from public.cycles cy where cy.id = p_cycle and cy.is_current)
         and not exists (select 1 from public.cycle_participations p2 where p2.member_id = p_member and p2.cycle_id = p_cycle)
    ) mi
    join public.instruments i on i.id = mi.instrument_id
    join public.instrument_cycle_capacity c on c.instrument_id = mi.instrument_id and c.cycle_id = p_cycle
    where public.instrument_occupied(mi.instrument_id, p_cycle) >= c.capacity;
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
end $function$;

create or replace function public.seed_org_defaults(p_org uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare r record;
begin
  insert into public.access_roles (organization_id, key, name, rank, is_system) values
    (p_org, 'direcao',    'Direção',           40, true),
    (p_org, 'professor',  'Professor/Monitor', 30, true),
    (p_org, 'integrante', 'Integrante',        10, true)
  on conflict (organization_id, key) do nothing;

  -- Direção: todas as permissões, escopo organização.
  insert into public.role_permissions (access_role_id, permission_key, scope)
  select ar.id, p.key, 'org' from public.access_roles ar cross join public.permissions p
  where ar.organization_id = p_org and ar.key = 'direcao'
  on conflict do nothing;

  -- Demais papéis. 'professor' é o papel único Professor/Monitor.
  for r in
    select * from (values
      ('professor','members.read','group'), ('professor','member_cycles.read','group'),
      ('professor','member_cycles.manage','group'), ('professor','capacity.read','org'),
      ('professor','events.read','org'), ('professor','events.manage','group'),
      ('professor','attendance.read','group'), ('professor','attendance.record','group'),
      ('professor','repertoire.read','org'), ('professor','billing.read','own'),
      ('professor','staff_payments.read','own'), ('professor','pix.manage','own'),
      ('integrante','members.read','own'), ('integrante','events.read','org'),
      ('integrante','attendance.read','own'), ('integrante','repertoire.read','org'),
      ('integrante','billing.read','own')
    ) as t(role_key, perm, scope)
  loop
    insert into public.role_permissions (access_role_id, permission_key, scope)
    select ar.id, r.perm, r.scope::public.permission_scope
    from public.access_roles ar where ar.organization_id = p_org and ar.key = r.role_key
    on conflict do nothing;
  end loop;

  insert into public.org_settings (organization_id, key, value) values
    (p_org, 'member_directory_visibility', '"all_members"'::jsonb),
    (p_org, 'billing_due_day', '10'::jsonb),
    (p_org, 'minimum_member_age', '18'::jsonb)
  on conflict do nothing;
end $function$;
