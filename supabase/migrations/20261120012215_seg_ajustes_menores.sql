-- Etapa 1 da revisão, passo 6: LOJA-04, SEG-06, SEG-09, SEG-10, LGPD-06.

-- LOJA-04: produto oculto (rascunho, preço especial, meta) não é lido por visitante via REST. A loja pública lê só pela RPC
-- shop_get_public_store (security definer), que não depende destas policies; o painel lê pelas policies *_manage_sel.
drop policy if exists shop_prod_public on public.shop_products;
create policy shop_prod_public on public.shop_products for select to anon, authenticated using (is_active and not is_hidden);
drop policy if exists shop_var_public on public.shop_product_variants;
create policy shop_var_public on public.shop_product_variants for select to anon, authenticated
  using (is_active and exists (select 1 from public.shop_products p where p.id = shop_product_variants.product_id and p.is_active and not p.is_hidden));
drop policy if exists shop_img_public on public.shop_product_images;
create policy shop_img_public on public.shop_product_images for select to anon, authenticated
  using (exists (select 1 from public.shop_products p where p.id = shop_product_images.product_id and p.is_active and not p.is_hidden));

-- SEG-06: funções internas não são chamáveis pela API. sync_staff_compensation/staff_function_id só são usadas por gatilhos
-- security definer; funções de gatilho não precisam de EXECUTE para disparar (só para criar o gatilho).
revoke execute on function public.sync_staff_compensation(uuid) from public, anon, authenticated;
revoke execute on function public.staff_function_id(uuid, public.staff_kind) from public, anon, authenticated;
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prorettype = 'trigger'::regtype loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- SEG-09 (parcial): visitante sem login não chama mais a contagem de ocupação direto. Não dá para exigir vínculo com a
-- organização dentro da função: o formulário público (get_public_form) a usa para quem ainda não é integrante, e dentro
-- de uma função security definer não há como distinguir a chamada direta da aninhada. Chamadas aninhadas rodam como o
-- dono (postgres) e seguem iguais. A contagem só sai com o id do ciclo (uuid), que o formulário público já expõe.
revoke execute on function public.instrument_occupied(uuid, uuid) from public, anon;
grant execute on function public.instrument_occupied(uuid, uuid) to authenticated;

-- SEG-10: só o titular ATUAL sincroniza os contatos públicos (ex-titular com papel revogado não sobrescreve).
create or replace function public.trg_sync_bloco_contacts() returns trigger
language plpgsql security definer set search_path = '' as $$
declare d text := regexp_replace(coalesce(new.phone, ''), '[^0-9]', '', 'g');
begin
  if not exists (select 1 from public.member_access_roles mar join public.access_roles ar on ar.id = mar.access_role_id
                  where mar.member_id = new.id and ar.key = 'titular' and mar.revoked_at is null) then return new; end if;
  update public.shop_settings set
    contact_whatsapp = case when d = '' then contact_whatsapp when d like '55%' and length(d) >= 12 then d else '55' || d end,
    contact_email = coalesce(nullif(lower(btrim(coalesce(new.email, ''))), ''), contact_email)
   where organization_id = new.organization_id;
  update public.site_settings set links = public.bloco_links(new.phone, new.email, new.social_handle, links) where organization_id = new.organization_id;
  return new;
end $$;
revoke execute on function public.trg_sync_bloco_contacts() from public, anon, authenticated;

-- LGPD-06: pela API a pessoa só REVOGA o próprio aceite; finalidade, versão do texto e data não mudam.
create or replace function public.guard_consent_update() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if (new.id, new.organization_id, new.member_id, new.purpose, new.text_version, new.granted_at)
     is distinct from (old.id, old.organization_id, old.member_id, old.purpose, old.text_version, old.granted_at)
     or old.revoked_at is not null or new.revoked_at is null then
    raise exception 'O aceite só pode ser revogado.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.guard_consent_update() from public, anon, authenticated;
drop trigger if exists trg_guard_consent_update on public.consent_records;
create trigger trg_guard_consent_update before update on public.consent_records
  for each row execute function public.guard_consent_update();
