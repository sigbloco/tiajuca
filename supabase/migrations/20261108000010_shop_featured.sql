-- Loja · produtos em destaque: cada produto pode ser marcado como destaque e a vitrine mostra uma seção própria no alto
-- (com título editável em Loja → Configurações). Os demais produtos ficam embaixo, na ordem escolhida no painel.

alter table public.shop_products add column is_featured boolean not null default false;
alter table public.shop_settings add column featured_title text not null default 'Destaques'
  check (length(btrim(featured_title)) between 1 and 60);

do $$
declare def text; newdef text;
begin
  def := pg_get_functiondef('public.shop_get_public_store(text)'::regprocedure);
  newdef := replace(def, '''slug'', p.slug,', '''is_featured'', p.is_featured, ''slug'', p.slug,');
  if newdef = def then raise exception 'shop_get_public_store: p.slug não encontrado'; end if;
  def := newdef;
  newdef := replace(def, '''intro_text'',', '''featured_title'', coalesce((select s.featured_title from public.shop_settings s where s.organization_id = o.id), ''Destaques''), ''intro_text'',');
  if newdef = def then raise exception 'shop_get_public_store: intro_text não encontrado'; end if;
  execute newdef;
end $$;
