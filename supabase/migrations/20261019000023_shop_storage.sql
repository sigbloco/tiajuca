-- Loja · fotos dos produtos. Bucket PÚBLICO só de leitura (vitrine sem login); escrever exige shop.manage da organização.
-- Caminho do arquivo: <organization_id>/<product_id>/<arquivo>. Só imagens, até 5 MB.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shop-images', 'shop-images', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy shop_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'shop-images' and public.has_permission(public.storage_org(name), 'shop.manage'));
create policy shop_images_update on storage.objects for update to authenticated
  using (bucket_id = 'shop-images' and public.has_permission(public.storage_org(name), 'shop.manage'))
  with check (bucket_id = 'shop-images' and public.has_permission(public.storage_org(name), 'shop.manage'));
create policy shop_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'shop-images' and public.has_permission(public.storage_org(name), 'shop.manage'));
