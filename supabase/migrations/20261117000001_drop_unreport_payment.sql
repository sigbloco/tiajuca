-- Loja: o cliente não desfaz mais o aviso de pagamento (o aviso agora é só por WhatsApp/e-mail); remove a função.
drop function if exists public.shop_unreport_payment(uuid, uuid, text, text, text);
