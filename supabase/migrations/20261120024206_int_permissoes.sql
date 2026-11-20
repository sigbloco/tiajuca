-- Etapa 2 da revisão: permissões da área dos integrantes.
-- INT-01 (D1 = sim): Professor reativa inativo do próprio grupo (antes o banco recusava apesar do botão).
-- INT-05: escopos que o banco ignora (events.manage "meu grupo" do Professor, capacity.read "meu grupo" do Monitor)
--         e set_role_permission passa a recusar "meu grupo" onde ele não tem efeito.
-- INT-06: purge_trashed usa a mesma permissão das policies (checklists e níveis).
-- INT-10: convites sem origem na interface: ninguém mais cria nem resgata (funções ficam para a faxina da etapa 6).
-- SEG-08: arquivos do repertório só para quem tem repertoire.read (inativo não baixa).

-- ---------------------------------------------------------------- INT-01
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
    -- Reativação (inativo → ativo): também quem pode decidir reativações (Professor do grupo da pessoa).
    or (v_status.counts_as_active and coalesce(v_was_inactive, false) and public.can_decide_reactivation(v_org, p_member));
  if not coalesce(v_allowed, false) then
    raise exception 'Você não tem permissão para alterar este status.' using errcode = '42501';
  end if;

  if v_status.counts_as_active and coalesce(v_was_inactive, false) and not public.can_decide_reactivation(v_org, p_member) then
    raise exception 'Só a Direção ou um professor do grupo da pessoa pode reativar um integrante inativo.' using errcode = 'P0001';
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

-- ---------------------------------------------------------------- INT-05
-- Permissões em que "meu grupo" tem efeito no banco (o resto só aceita "só o próprio"/"tudo", como já se comportava).
create or replace function public.group_scoped_permissions()
 returns text[]
 language sql
 immutable
 set search_path to ''
as $function$
  select array['members.read', 'attendance.read', 'attendance.record', 'member_cycles.read', 'member_cycles.manage']
$function$;
grant execute on function public.group_scoped_permissions() to authenticated;

create or replace function public.set_role_permission(p_org uuid, p_role_key text, p_permission text, p_scope text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_role uuid;
begin
  if not public.has_permission(p_org, 'roles.manage') then raise exception 'Sem permissão para editar permissões.' using errcode = '42501'; end if;
  select id into v_role from public.access_roles where organization_id = p_org and key = p_role_key;
  if v_role is null then raise exception 'Papel inválido.' using errcode = 'P0002'; end if;
  if p_role_key in ('direcao', 'titular') then raise exception 'A Direção e o Titular sempre possuem todas as permissões.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.permissions where key = p_permission) then raise exception 'Permissão inválida.' using errcode = 'P0002'; end if;
  if p_permission = any (public.locked_permissions()) then raise exception 'Esta permissão é exclusiva da Direção.' using errcode = 'P0001'; end if;
  if p_scope is null then
    delete from public.role_permissions where access_role_id = v_role and permission_key = p_permission;
  else
    if p_scope not in ('own', 'group', 'org') then raise exception 'Escopo inválido.' using errcode = '22023'; end if;
    if p_scope = 'group' and not (p_permission = any (public.group_scoped_permissions())) then
      raise exception 'Esta permissão não tem a opção "Meu grupo".' using errcode = '22023';
    end if;
    insert into public.role_permissions (access_role_id, permission_key, scope) values (v_role, p_permission, p_scope::public.permission_scope)
    on conflict (access_role_id, permission_key) do update set scope = excluded.scope;
  end if;
end $function$;

-- Alinha a matriz ao que o banco faz hoje (nenhum acesso muda):
-- Professor "criar/editar eventos do grupo" nunca valeu (has_permission exige "tudo"): sai.
delete from public.role_permissions rp using public.access_roles r
 where r.id = rp.access_role_id and r.key = 'professor' and rp.permission_key = 'events.manage' and rp.scope = 'group';
-- Monitor "ver vagas do grupo" sempre viu todas (a policy aceita qualquer escopo): passa a dizer "tudo".
update public.role_permissions rp set scope = 'org' from public.access_roles r
 where r.id = rp.access_role_id and rp.permission_key = 'capacity.read' and rp.scope = 'group';
-- Qualquer outro "meu grupo" sem efeito (papel customizado) vira "tudo", que é como o banco já o tratava em leitura,
-- e some em edição (has_permission exigia "tudo": nunca valeu).
delete from public.role_permissions
 where scope = 'group' and not (permission_key = any (public.group_scoped_permissions())) and permission_key not like '%.read';
update public.role_permissions set scope = 'org'
 where scope = 'group' and not (permission_key = any (public.group_scoped_permissions())) and permission_key like '%.read';

-- ---------------------------------------------------------------- INT-06
create or replace function public.purge_trashed(p_table text, p_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare perm text; v_org uuid; v_trashed boolean;
begin
  perm := case p_table
    when 'checklist_templates' then 'checklists.manage' when 'checklist_template_items' then 'checklists.manage'
    when 'drive_folders' then 'drive.manage'
    when 'members' then 'members.manage'
    when 'repertoires' then 'repertoire.manage' when 'songs' then 'repertoire.manage'
    when 'shop_pickup_points' then 'shop.manage' when 'shop_products' then 'shop.manage' when 'shop_stock_items' then 'shop.manage'
    when 'form_lists' then 'forms.manage' when 'form_list_items' then 'forms.manage'
    when 'social_networks' then 'forms.manage' when 'gender_options' then 'forms.manage' when 'race_options' then 'forms.manage'
    when 'skill_levels' then 'structure.manage'
    else null end;
  if perm is null then raise exception 'Este tipo de item não pode ser excluído de vez.' using errcode = 'P0001'; end if;
  if p_table = 'members' then
    execute 'select organization_id, archived_at is not null from public.members where id = $1' into v_org, v_trashed using p_id;
  else
    execute format('select organization_id, not is_active from public.%I where id = $1', p_table) into v_org, v_trashed using p_id;
  end if;
  if v_org is null then raise exception 'Item não encontrado.' using errcode = 'P0002'; end if;
  if not public.has_permission(v_org, perm) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if not coalesce(v_trashed, false) then raise exception 'Só dá para excluir de vez o que está na lixeira.' using errcode = 'P0001'; end if;
  if p_table = 'members' then
    delete from public.member_access_roles where member_id = p_id;
    delete from public.member_cycles where member_id = p_id and joined_on is null and left_on is null;
  end if;
  execute format('delete from public.%I where id = $1', p_table) using p_id;
end $function$;

-- ---------------------------------------------------------------- INT-10
revoke execute on function public.create_member_invite(uuid, integer) from public, anon, authenticated;
revoke execute on function public.claim_member(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- SEG-08
drop policy if exists org_files_select on storage.objects;
create policy org_files_select on storage.objects for select to authenticated
  using (bucket_id = 'org-files' and public.permission_scope_of(public.storage_org(name), 'repertoire.read') is not null);
