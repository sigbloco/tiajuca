-- Loja · cupons de desconto (%), ativados/desativados no painel. Só o cadastro por enquanto: a aplicação no checkout vem depois.
create table if not exists public.shop_coupons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9_-]{3,30}$'),
  discount_pct numeric(5,2) not null check (discount_pct > 0 and discount_pct <= 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);
alter table public.shop_coupons enable row level security;
revoke all on public.shop_coupons from anon, authenticated;
grant select, insert, update, delete on public.shop_coupons to authenticated;
create policy shop_coupons_sel on public.shop_coupons for select to authenticated using (public.has_permission(organization_id, 'shop.manage'));
create policy shop_coupons_ins on public.shop_coupons for insert to authenticated with check (public.has_permission(organization_id, 'shop.manage'));
create policy shop_coupons_upd on public.shop_coupons for update to authenticated
  using (public.has_permission(organization_id, 'shop.manage')) with check (public.has_permission(organization_id, 'shop.manage'));
create policy shop_coupons_del on public.shop_coupons for delete to authenticated using (public.has_permission(organization_id, 'shop.manage'));
create trigger trg_shop_coupons_updated before update on public.shop_coupons for each row execute function public.set_updated_at();
create trigger trg_audit_shop_coupons after insert or update or delete on public.shop_coupons for each row execute function public.fn_audit();
