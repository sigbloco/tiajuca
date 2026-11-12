-- Prazo de produção passa a ser texto livre (ex.: "10-15 dias úteis").
-- A coluna mantém o nome lead_time_days para não quebrar as funções que já a leem.
alter table public.shop_products drop constraint shop_products_lead_time_days_check;
alter table public.shop_products
  alter column lead_time_days type text
  using case when lead_time_days is null then null else lead_time_days::text || ' dias' end;
alter table public.shop_products
  add constraint shop_products_lead_time_text_check check (lead_time_days is null or length(trim(lead_time_days)) > 0);
