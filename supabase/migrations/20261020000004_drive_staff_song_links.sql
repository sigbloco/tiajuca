-- Google Drive: Professores e Monitores enxergam e recebem acesso a TODAS as pastas (independente de naipe), como Direção e Titular.
-- Repertório: link do guia e da pasta no Drive por música; afinação (Bb, Eb, F, C…) por instrumento e por anexo, para que
-- quem toca um instrumento afinado em Bb ache direto a partitura do seu instrumento ou a da sua afinação.

alter table public.songs
  add column guide_url text check (guide_url is null or guide_url ~* '^https?://'),
  add column drive_folder_url text check (drive_folder_url is null or drive_folder_url ~* '^https?://');
alter table public.instruments add column tuning text check (tuning is null or length(trim(tuning)) between 1 and 8);
alter table public.song_attachments add column tuning text check (tuning is null or length(trim(tuning)) between 1 and 8);

create or replace function public.can_see_drive_folder(p_folder uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.drive_folders f
    join public.members m on m.organization_id = f.organization_id and m.user_id = auth.uid() and m.archived_at is null
    where f.id = p_folder and f.is_active and (
      exists (select 1 from public.member_access_roles mar join public.access_roles ar on ar.id = mar.access_role_id
               where mar.member_id = m.id and mar.revoked_at is null and ar.key in ('professor', 'monitor'))
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
$$;

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
                where mar.member_id = m.id and mar.revoked_at is null and ar.key in ('titular', 'direcao', 'professor', 'monitor'))
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
