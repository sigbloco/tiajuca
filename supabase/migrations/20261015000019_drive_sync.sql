-- SIGBloco · Compartilhamento automático das pastas do Drive com quem tem acesso no app.
-- A Edge Function `drive-sync` (conta de serviço com permissão de edição na pasta) lê o contexto aqui, compara com as
-- permissões reais da pasta no Google e só mexe no que o app mesmo compartilhou (tabela drive_folder_shares).
-- Quem já tinha acesso por outro meio (dono, outros compartilhamentos manuais) nunca é removido.

alter table public.drive_folders add column last_synced_at timestamptz, add column last_sync_summary jsonb;

create table public.drive_folder_shares (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, folder_id uuid not null,
  email text not null check (email = lower(email)),
  drive_permission_id text,
  created_at timestamptz not null default now(), removed_at timestamptz,
  foreign key (organization_id, folder_id) references public.drive_folders (organization_id, id)
);
create unique index dfs_active_uq on public.drive_folder_shares (folder_id, email) where removed_at is null;

alter table public.drive_folder_shares enable row level security;
revoke all on public.drive_folder_shares from anon, authenticated;
grant select on public.drive_folder_shares to authenticated;
create policy dfs_select on public.drive_folder_shares for select to authenticated using (public.has_permission(organization_id, 'drive.manage'));
create trigger trg_audit_drive_folder_shares after insert or update on public.drive_folder_shares for each row execute function public.fn_audit();

-- Quem deve ter acesso à pasta no Drive: tem regra de acesso (papel, naipe ou instrumento) E está ativo no ciclo atual
-- (ou é equipe), tem e-mail e não está arquivado. Direção e Titular sempre entram.
create or replace function public.drive_sync_context(p_folder uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
                where mar.member_id = m.id and mar.revoked_at is null and ar.key in ('titular', 'direcao'))
       or (
         (exists (select 1 from public.member_cycles mc join public.cycles c on c.id = mc.cycle_id and c.is_current
                    join public.member_cycle_statuses s on s.id = mc.status_id and s.counts_as_active where mc.member_id = m.id)
          or exists (select 1 from public.member_access_roles mar join public.access_roles ar on ar.id = mar.access_role_id
                      where mar.member_id = m.id and mar.revoked_at is null and ar.key in ('professor', 'monitor')))
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
end $$;
revoke all on function public.drive_sync_context(uuid) from public, anon;
grant execute on function public.drive_sync_context(uuid) to authenticated;

-- Registra o resultado de uma sincronização aplicada (a função chama com o JWT de quem clicou).
create or replace function public.drive_sync_record(p_folder uuid, p_added jsonb, p_removed jsonb, p_summary jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare f public.drive_folders; r jsonb;
begin
  select * into f from public.drive_folders where id = p_folder;
  if f.id is null then raise exception 'Pasta não encontrada.' using errcode = 'P0002'; end if;
  if not public.has_permission(f.organization_id, 'drive.manage') then raise exception 'Sem permissão para sincronizar o Drive.' using errcode = '42501'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_added, '[]'::jsonb)) loop
    insert into public.drive_folder_shares (organization_id, folder_id, email, drive_permission_id)
    values (f.organization_id, f.id, lower(r ->> 'email'), r ->> 'permission_id')
    on conflict (folder_id, email) where removed_at is null do update set drive_permission_id = excluded.drive_permission_id;
  end loop;
  update public.drive_folder_shares set removed_at = now()
   where folder_id = f.id and removed_at is null and email in (select lower(jsonb_array_elements_text(coalesce(p_removed, '[]'::jsonb))));
  update public.drive_folders set last_synced_at = now(), last_sync_summary = p_summary where id = f.id;
  insert into public.audit_logs (organization_id, actor_user_id, actor_member_id, action, entity_type, entity_id, new_data)
  values (f.organization_id, auth.uid(), public.current_member_id(f.organization_id), 'drive_synced', 'drive_folders', f.id::text, p_summary);
end $$;
revoke all on function public.drive_sync_record(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.drive_sync_record(uuid, jsonb, jsonb, jsonb) to authenticated;
