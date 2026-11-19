-- Foto do integrante: arquivo num espaço PRIVADO (member-photos), lido só por membros do mesmo bloco (endereços temporários).
-- Quem envia: a própria pessoa ou quem gerencia integrantes. Caminho: <org>/<integrante>/<arquivo>.
alter table public.members add column if not exists photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('member-photos', 'member-photos', false, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create or replace function public.can_edit_member_photo(p_org uuid, p_member uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members m where m.id = p_member and m.organization_id = p_org and m.user_id = auth.uid() and m.archived_at is null)
      or public.has_permission(p_org, 'members.manage')
$$;
revoke all on function public.can_edit_member_photo(uuid, uuid) from public, anon;
grant execute on function public.can_edit_member_photo(uuid, uuid) to authenticated;

create policy member_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'member-photos' and public.is_org_member(((storage.foldername(name))[1])::uuid));
create policy member_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'member-photos' and public.can_edit_member_photo(((storage.foldername(name))[1])::uuid, ((storage.foldername(name))[2])::uuid));
create policy member_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'member-photos' and public.can_edit_member_photo(((storage.foldername(name))[1])::uuid, ((storage.foldername(name))[2])::uuid));
create policy member_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'member-photos' and public.can_edit_member_photo(((storage.foldername(name))[1])::uuid, ((storage.foldername(name))[2])::uuid));

-- Guarda o caminho da foto (nulo = sem foto) e devolve o anterior, para o app apagar o arquivo velho.
create or replace function public.set_member_photo(p_member uuid, p_path text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_old text;
begin
  select organization_id, photo_path into v_org, v_old from public.members where id = p_member;
  if v_org is null then raise exception 'Integrante não encontrado.' using errcode = 'P0002'; end if;
  if not public.can_edit_member_photo(v_org, p_member) then raise exception 'Sem permissão para alterar esta foto.' using errcode = '42501'; end if;
  if p_path is not null and p_path not like v_org::text || '/' || p_member::text || '/%' then raise exception 'Caminho de foto inválido.' using errcode = '22023'; end if;
  update public.members set photo_path = p_path where id = p_member;
  return v_old;
end $$;
revoke all on function public.set_member_photo(uuid, text) from public, anon;
grant execute on function public.set_member_photo(uuid, text) to authenticated;

-- Fotos de todos os integrantes do bloco (visível a qualquer membro do bloco).
create or replace function public.member_photos(p_org uuid) returns table (member_id uuid, photo_path text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_org_member(p_org) then raise exception 'Sem acesso.' using errcode = '42501'; end if;
  return query select m.id, m.photo_path from public.members m where m.organization_id = p_org and m.archived_at is null and m.photo_path is not null;
end $$;
revoke all on function public.member_photos(uuid) from public, anon;
grant execute on function public.member_photos(uuid) to authenticated;
