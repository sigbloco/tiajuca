-- Loja · dados da instância Cordão da Tia Juca. Rodar APÓS a migration 0022.
-- Pontos de retirada de EXEMPLO, inativos: edite endereço/horário no painel da loja e ative. Nenhum é exibido ao público até lá.

insert into public.shop_pickup_points (organization_id, name, address, opening_hours, sort_order, is_active)
select o.id, v.name, v.address, v.hours, v.ord, false
from public.organizations o
cross join (values
  ('Ponto de retirada 1 (a definir)', 'Endereço a definir', 'Horário a definir', 1),
  ('Ponto de retirada 2 (a definir)', 'Endereço a definir', 'Horário a definir', 2)
) as v(name, address, hours, ord)
where o.slug = 'tiajuca'
  and not exists (select 1 from public.shop_pickup_points p where p.organization_id = o.id and p.name = v.name);

-- Configurações da loja (Pix, contatos, remetente dos e-mails). Tudo editável depois no painel: Loja → Pagamentos e contatos.
update public.shop_settings s set
  pix_key = 'pix@tiajuca.com.br',
  pix_beneficiary = 'Rafael Loureiro Braz',
  contact_whatsapp = '5521990698483',
  contact_email = 'cordaodatiajuca@gmail.com',
  directors = '[{"name":"Rafael","whatsapp":"5521996134845"},{"name":"Maira","whatsapp":"5521984843223"},{"name":"Marcelo","whatsapp":"5521998526201"}]'::jsonb,
  mail_from_name = 'Cordão da Tia Juca',
  mail_from_email = 'cordaodatiajuca@gmail.com'
from public.organizations o
where o.id = s.organization_id and o.slug = 'tiajuca' and s.pix_key is null;

-- Rede de segurança dos e-mails: a cada minuto pede ao shop-mailer para esvaziar a fila (SUBSTITUA <ref> pelo ID do projeto Supabase).
-- O shop-mailer não recebe dados e só processa a fila, então pode ser chamado sem login.
-- select cron.schedule('shop-mail-flush', '* * * * *',
--   $$ select net.http_post(url := 'https://<ref>.supabase.co/functions/v1/shop-mailer', body := '{}'::jsonb) $$);
