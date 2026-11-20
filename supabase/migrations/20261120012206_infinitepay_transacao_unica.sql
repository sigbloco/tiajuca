-- Etapa 1 da revisão (SUS-01): uma transação da InfinitePay dá baixa em UM só pedido da loja ou UMA só mensalidade.
-- Os webhooks não são assinados e o payment_check recebe order_nsu/transaction_nsu vindos do próprio aviso; sem esta trava,
-- se a InfinitePay confirmasse a transação sem amarrá-la ao pedido, um pagamento real poderia quitar outro pedido de mesmo valor.
create table if not exists public.infinitepay_transactions (
  transaction_nsu text primary key,
  kind text not null check (kind in ('shop', 'charge')),
  code text not null,
  created_at timestamptz not null default now()
);
alter table public.infinitepay_transactions enable row level security;
revoke all on public.infinitepay_transactions from public, anon, authenticated;
comment on table public.infinitepay_transactions is 'Transações da InfinitePay já usadas para dar baixa (uma transação, um pedido/cobrança). Só as Edge Functions (service_role) escrevem.';

-- Transações que já deram baixa antes desta trava.
insert into public.infinitepay_transactions (transaction_nsu, kind, code)
select payment_ref ->> 'transaction_nsu', 'shop', code from public.shop_orders where payment_ref ? 'transaction_nsu'
union all
select pay_ref ->> 'transaction_nsu', 'charge', pay_code from public.monthly_charges where pay_ref ? 'transaction_nsu' and pay_code is not null
on conflict do nothing;

-- Reserva a transação para o pedido/cobrança. true = livre ou já reservada para este mesmo código (reenvio do aviso); false = usada em outro.
create or replace function public.infinitepay_claim_transaction(p_tx text, p_kind text, p_code text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare r public.infinitepay_transactions;
begin
  if coalesce(p_tx, '') = '' or p_kind not in ('shop', 'charge') or coalesce(p_code, '') = '' then return false; end if;
  insert into public.infinitepay_transactions (transaction_nsu, kind, code) values (p_tx, p_kind, upper(trim(p_code))) on conflict do nothing;
  select * into r from public.infinitepay_transactions where transaction_nsu = p_tx;
  return r.kind = p_kind and r.code = upper(trim(p_code));
end $$;
revoke all on function public.infinitepay_claim_transaction(text, text, text) from public, anon, authenticated;
grant execute on function public.infinitepay_claim_transaction(text, text, text) to service_role;
