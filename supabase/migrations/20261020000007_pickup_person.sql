-- Pontos de retirada: "quem procurar" (nome e telefone) e a opção de combinar a entrega direto com uma pessoa (sem lugar nem horário).
-- `place_address` guarda o endereço digitado; `address` (usado pela vitrine, e-mails e consulta) é montado por trigger a partir dele e do contato.
alter table public.shop_pickup_points
  add column kind text not null default 'place' check (kind in ('place', 'person')),
  add column contact_name text check (contact_name is null or length(contact_name) <= 80),
  add column contact_phone text check (contact_phone is null or length(contact_phone) <= 30),
  add column place_address text;
update public.shop_pickup_points set place_address = address;

create or replace function public.shop_pickup_compose() returns trigger
language plpgsql set search_path = '' as $$
declare v_name text := nullif(trim(coalesce(new.contact_name, '')), ''); v_phone text := nullif(trim(coalesce(new.contact_phone, '')), '');
begin
  if new.kind = 'person' then
    new.address := 'Combine a entrega direto com ' || coalesce(v_name, 'o responsável') || coalesce(' (WhatsApp ' || v_phone || ')', '') || '. Pode ser encontro ao vivo, entrega por aplicativo ou no ensaio.';
  else
    new.address := trim(coalesce(new.place_address, new.address, ''))
      || case when v_name is not null then ' — procure por ' || v_name || coalesce(' (' || v_phone || ')', '') else '' end;
  end if;
  return new;
end $$;
create trigger trg_shop_pickup_compose before insert or update on public.shop_pickup_points for each row execute function public.shop_pickup_compose();
