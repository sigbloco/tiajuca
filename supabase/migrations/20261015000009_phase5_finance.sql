-- SIGBloco · Fase 5 · Financeiro (Direção), distribuição, PIX e pagamentos da equipe.
-- Receitas de mensalidade NÃO são duplicadas: o razão (v_finance_ledger) lê as cobranças pagas. Nada é apagado (cancelamento rastreável).
-- Escrita somente por RPC (lançamentos e pagamentos); regras de distribuição validadas por trigger (soma dos percentuais ≤ 100%).

create table public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  kind text not null check (kind in ('income', 'expense')),
  name text not null, sort_order int not null default 0, is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, id), unique (organization_id, kind, name)
);

create table public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  kind text not null check (kind in ('income', 'expense')),
  category_id uuid not null,
  description text not null check (length(trim(description)) > 0),
  amount numeric(12,2) not null check (amount > 0),
  occurred_on date not null,
  status text not null default 'posted' check (status in ('posted', 'cancelled')),
  notes text,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(),
  cancelled_at timestamptz, cancelled_by uuid, cancel_reason text,
  unique (organization_id, id),
  foreign key (organization_id, category_id) references public.finance_categories (organization_id, id)
);
create index financial_entries_org_date_idx on public.financial_entries (organization_id, occurred_on);

create table public.distribution_destinations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  kind text not null default 'custom' check (kind in ('role_group', 'cash', 'custom')),
  role_key text, -- direcao | professor | monitor (para kind = role_group)
  sort_order int not null default 0, is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, id), unique (organization_id, name)
);

-- base: gross_income = % da receita bruta · net_after_fixed = % da receita menos os valores fixos · net_after_expenses = % da receita menos despesas.
create table public.distribution_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, destination_id uuid not null,
  mode text not null check (mode in ('percent', 'fixed')),
  percent numeric(5,2), fixed_amount numeric(12,2),
  base text check (base in ('gross_income', 'net_after_fixed', 'net_after_expenses')),
  priority int not null default 0,
  valid_from date not null default current_date, valid_to date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (organization_id, destination_id) references public.distribution_destinations (organization_id, id),
  check ((mode = 'percent' and percent is not null and percent > 0 and percent <= 100 and fixed_amount is null and base is not null)
      or (mode = 'fixed' and fixed_amount is not null and fixed_amount >= 0 and percent is null and base is null)),
  check (valid_to is null or valid_to >= valid_from)
);

create or replace function public.check_distribution_percent_sum() returns trigger
language plpgsql set search_path = '' as $$
declare v_sum numeric;
begin
  if new.mode = 'percent' and new.is_active and new.valid_to is null then
    select coalesce(sum(r.percent), 0) into v_sum from public.distribution_rules r
     where r.organization_id = new.organization_id and r.mode = 'percent' and r.is_active and r.valid_to is null
       and r.base = new.base and r.id <> new.id;
    if v_sum + new.percent > 100 then
      raise exception 'A soma dos percentuais não pode passar de 100%% (já distribuído: %).', v_sum using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger trg_rules_percent_sum before insert or update on public.distribution_rules
  for each row execute function public.check_distribution_percent_sum();

create table public.member_pix_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, member_id uuid not null,
  key_type text not null check (key_type in ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria')),
  key_value text not null,
  is_default boolean not null default true,
  created_at timestamptz not null default now(), archived_at timestamptz,
  foreign key (organization_id, member_id) references public.members (organization_id, id),
  check (
    (key_type = 'cpf' and key_value ~ '^\d{11}$') or (key_type = 'cnpj' and key_value ~ '^\d{14}$')
    or (key_type = 'telefone' and key_value ~ '^\+?\d{10,13}$') or (key_type = 'email' and key_value ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
    or (key_type = 'aleatoria' and key_value ~ '^[0-9a-fA-F-]{32,36}$'))
);
create unique index pix_one_default_uq on public.member_pix_keys (member_id) where is_default and archived_at is null;

create table public.staff_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, member_id uuid not null,
  competence date not null check (extract(day from competence) = 1),
  destination_id uuid,
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  due_on date, paid_on date, payment_method text, pix_key_snapshot text, notes text,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, member_id) references public.members (organization_id, id),
  foreign key (organization_id, destination_id) references public.distribution_destinations (organization_id, id),
  check (status <> 'paid' or paid_on is not null)
);
create index staff_payments_member_idx on public.staff_payments (member_id, competence desc);
create index staff_payments_comp_idx on public.staff_payments (organization_id, competence, status);
create trigger trg_staff_payments_updated before update on public.staff_payments for each row execute function public.set_updated_at();

-- ───────────── defaults genéricos ─────────────
create or replace function public.seed_org_finance_defaults(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.finance_categories (organization_id, kind, name, sort_order) values
    (p_org, 'income', 'Outras receitas', 1), (p_org, 'income', 'Doações', 2), (p_org, 'income', 'Ajustes', 3),
    (p_org, 'expense', 'Aluguel de espaço', 1), (p_org, 'expense', 'Equipamento', 2), (p_org, 'expense', 'Transporte', 3),
    (p_org, 'expense', 'Alimentação', 4), (p_org, 'expense', 'Contratação de serviço', 5), (p_org, 'expense', 'Outras despesas', 6)
  on conflict (organization_id, kind, name) do nothing;
  insert into public.distribution_destinations (organization_id, name, kind, role_key, sort_order) values
    (p_org, 'Direção', 'role_group', 'direcao', 1), (p_org, 'Professores', 'role_group', 'professor', 2),
    (p_org, 'Monitores', 'role_group', 'monitor', 3), (p_org, 'Caixa do bloco', 'cash', null, 4)
  on conflict (organization_id, name) do nothing;
end $$;
revoke all on function public.seed_org_finance_defaults(uuid) from public, anon, authenticated;

-- ───────────── razão unificado (receitas e despesas realizadas) ─────────────
create view public.v_finance_ledger with (security_invoker = true) as
select e.organization_id, 'entry:' || e.id as ref, e.occurred_on, e.kind, e.amount, e.description, c.name as category, 'lancamento' as source
from public.financial_entries e join public.finance_categories c on c.id = e.category_id
where e.status = 'posted' and public.has_permission(e.organization_id, 'finance.read')
union all
select ch.organization_id, 'charge:' || ch.id, ch.paid_on, 'income', ch.final_amount,
       'Mensalidade — ' || coalesce(m.display_name, m.full_name), 'Mensalidades', 'mensalidade'
from public.monthly_charges ch join public.members m on m.id = ch.member_id
where ch.status = 'paid' and ch.paid_on is not null and public.has_permission(ch.organization_id, 'finance.read')
union all
select p.organization_id, 'staff:' || p.id, p.paid_on, 'expense', p.amount,
       'Pagamento da equipe — ' || coalesce(m.display_name, m.full_name), 'Pagamentos da equipe', 'equipe'
from public.staff_payments p join public.members m on m.id = p.member_id
where p.status = 'paid' and p.paid_on is not null and public.has_permission(p.organization_id, 'finance.read');
revoke all on public.v_finance_ledger from public, anon;
grant select on public.v_finance_ledger to authenticated;

create or replace function public.require_finance(p_org uuid, p_perm text default 'finance.manage') returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_permission(p_org, p_perm) then
    raise exception 'Sem permissão para esta operação financeira.' using errcode = '42501';
  end if;
end $$;
revoke all on function public.require_finance(uuid, text) from public, anon;
grant execute on function public.require_finance(uuid, text) to authenticated;

-- Resumo do mês (por data de ocorrência/pagamento).
create or replace function public.finance_month_summary(p_org uuid, p_competence date) returns table (
  receita_mensalidades numeric, receita_outras numeric, despesas numeric, pagamentos_equipe numeric, saldo numeric)
language plpgsql stable security definer set search_path = '' as $$
declare v_from date := date_trunc('month', p_competence)::date; v_to date := (date_trunc('month', p_competence) + interval '1 month')::date;
begin
  perform public.require_finance(p_org, 'finance.read');
  return query
  select coalesce(sum(l.amount) filter (where l.kind = 'income' and l.source = 'mensalidade'), 0),
         coalesce(sum(l.amount) filter (where l.kind = 'income' and l.source <> 'mensalidade'), 0),
         coalesce(sum(l.amount) filter (where l.kind = 'expense' and l.source <> 'equipe'), 0),
         coalesce(sum(l.amount) filter (where l.kind = 'expense' and l.source = 'equipe'), 0),
         coalesce(sum(case when l.kind = 'income' then l.amount else -l.amount end), 0)
  from public.v_finance_ledger l
  where l.organization_id = p_org and l.occurred_on >= v_from and l.occurred_on < v_to;
end $$;
revoke all on function public.finance_month_summary(uuid, date) from public, anon;
grant execute on function public.finance_month_summary(uuid, date) to authenticated;

-- Distribuição do mês: fixos primeiro (da receita bruta); percentuais conforme a base de cada regra.
create or replace function public.compute_distribution(p_org uuid, p_competence date) returns table (
  destination_id uuid, destination_name text, fixed_total numeric, percent_total numeric, total numeric)
language plpgsql stable security definer set search_path = '' as $$
declare v_from date := date_trunc('month', p_competence)::date; v_end date := (date_trunc('month', p_competence) + interval '1 month - 1 day')::date;
        v_gross numeric; v_exp numeric; v_fixed numeric;
begin
  perform public.require_finance(p_org, 'finance.read');
  select coalesce(sum(l.amount) filter (where l.kind = 'income'), 0), coalesce(sum(l.amount) filter (where l.kind = 'expense' and l.source <> 'equipe'), 0)
    into v_gross, v_exp
  from public.v_finance_ledger l where l.organization_id = p_org and l.occurred_on >= v_from and l.occurred_on <= v_end;
  select coalesce(sum(r.fixed_amount), 0) into v_fixed from public.distribution_rules r
   where r.organization_id = p_org and r.is_active and r.mode = 'fixed' and r.valid_from <= v_end and (r.valid_to is null or r.valid_to >= v_from);
  return query
  select d.id, d.name,
    coalesce(sum(r.fixed_amount) filter (where r.mode = 'fixed'), 0),
    coalesce(sum(round(r.percent / 100 * case r.base when 'gross_income' then v_gross
                                                    when 'net_after_fixed' then greatest(v_gross - v_fixed, 0)
                                                    else greatest(v_gross - v_exp, 0) end, 2)) filter (where r.mode = 'percent'), 0),
    coalesce(sum(r.fixed_amount) filter (where r.mode = 'fixed'), 0)
      + coalesce(sum(round(r.percent / 100 * case r.base when 'gross_income' then v_gross
                                                         when 'net_after_fixed' then greatest(v_gross - v_fixed, 0)
                                                         else greatest(v_gross - v_exp, 0) end, 2)) filter (where r.mode = 'percent'), 0)
  from public.distribution_destinations d
  left join public.distribution_rules r on r.destination_id = d.id and r.is_active and r.valid_from <= v_end and (r.valid_to is null or r.valid_to >= v_from)
  where d.organization_id = p_org and d.is_active
  group by d.id, d.name, d.sort_order order by d.sort_order, d.name;
end $$;
revoke all on function public.compute_distribution(uuid, date) from public, anon;
grant execute on function public.compute_distribution(uuid, date) to authenticated;

-- ───────────── RPCs de escrita ─────────────
create or replace function public.post_financial_entry(p_org uuid, p_category uuid, p_description text, p_amount numeric,
                                                       p_occurred_on date, p_notes text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_kind text; v_id uuid;
begin
  perform public.require_finance(p_org);
  select kind into v_kind from public.finance_categories where id = p_category and organization_id = p_org and is_active;
  if v_kind is null then raise exception 'Categoria inválida.' using errcode = 'P0002'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Informe um valor maior que zero.' using errcode = '22003'; end if;
  insert into public.financial_entries (organization_id, kind, category_id, description, amount, occurred_on, notes)
  values (p_org, v_kind, p_category, trim(p_description), p_amount, p_occurred_on, nullif(trim(p_notes), '')) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.post_financial_entry(uuid, uuid, text, numeric, date, text) from public, anon;
grant execute on function public.post_financial_entry(uuid, uuid, text, numeric, date, text) to authenticated;

create or replace function public.cancel_financial_entry(p_entry uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.financial_entries;
begin
  select * into e from public.financial_entries where id = p_entry;
  if e.id is null then raise exception 'Lançamento não encontrado.' using errcode = 'P0002'; end if;
  perform public.require_finance(e.organization_id);
  if e.status <> 'posted' then raise exception 'Este lançamento já foi cancelado.' using errcode = 'P0001'; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'Informe o motivo do cancelamento.' using errcode = '22023'; end if;
  update public.financial_entries set status = 'cancelled', cancelled_at = now(), cancelled_by = public.current_member_id(e.organization_id),
         cancel_reason = trim(p_reason) where id = p_entry;
end $$;
revoke all on function public.cancel_financial_entry(uuid, text) from public, anon;
grant execute on function public.cancel_financial_entry(uuid, text) to authenticated;

create or replace function public.create_staff_payment(p_member uuid, p_competence date, p_destination uuid, p_amount numeric,
                                                       p_due_on date default null, p_notes text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_id uuid;
begin
  select organization_id into v_org from public.members where id = p_member;
  if v_org is null then raise exception 'Pessoa não encontrada.' using errcode = 'P0002'; end if;
  perform public.require_finance(v_org, 'staff_payments.manage');
  if p_amount is null or p_amount <= 0 then raise exception 'Informe um valor maior que zero.' using errcode = '22003'; end if;
  if p_destination is not null and not exists (select 1 from public.distribution_destinations where id = p_destination and organization_id = v_org) then
    raise exception 'Destino inválido.' using errcode = 'P0002';
  end if;
  insert into public.staff_payments (organization_id, member_id, competence, destination_id, amount, due_on, notes)
  values (v_org, p_member, date_trunc('month', p_competence)::date, p_destination, p_amount, p_due_on, nullif(trim(p_notes), ''))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.create_staff_payment(uuid, date, uuid, numeric, date, text) from public, anon;
grant execute on function public.create_staff_payment(uuid, date, uuid, numeric, date, text) to authenticated;

-- Baixa o pagamento guardando a chave PIX usada (snapshot): trocar a chave depois não altera o histórico.
create or replace function public.mark_staff_payment_paid(p_payment uuid, p_paid_on date, p_method text default 'PIX', p_pix text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.staff_payments; v_key text;
begin
  select * into p from public.staff_payments where id = p_payment;
  if p.id is null then raise exception 'Pagamento não encontrado.' using errcode = 'P0002'; end if;
  perform public.require_finance(p.organization_id, 'staff_payments.manage');
  if p.status <> 'pending' then raise exception 'Só pagamentos pendentes podem ser baixados.' using errcode = 'P0001'; end if;
  v_key := coalesce(nullif(trim(p_pix), ''),
    (select k.key_value from public.member_pix_keys k where k.member_id = p.member_id and k.is_default and k.archived_at is null));
  update public.staff_payments set status = 'paid', paid_on = p_paid_on, payment_method = nullif(trim(p_method), ''), pix_key_snapshot = v_key
   where id = p_payment;
end $$;
revoke all on function public.mark_staff_payment_paid(uuid, date, text, text) from public, anon;
grant execute on function public.mark_staff_payment_paid(uuid, date, text, text) to authenticated;

create or replace function public.cancel_staff_payment(p_payment uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.staff_payments;
begin
  select * into p from public.staff_payments where id = p_payment;
  if p.id is null then raise exception 'Pagamento não encontrado.' using errcode = 'P0002'; end if;
  perform public.require_finance(p.organization_id, 'staff_payments.manage');
  if p.status = 'cancelled' then raise exception 'Este pagamento já foi cancelado.' using errcode = 'P0001'; end if;
  update public.staff_payments set status = 'cancelled', notes = coalesce(nullif(trim(p_reason), ''), notes) where id = p_payment;
end $$;
revoke all on function public.cancel_staff_payment(uuid, text) from public, anon;
grant execute on function public.cancel_staff_payment(uuid, text) to authenticated;

-- Troca a chave PIX padrão de forma atômica (arquiva a anterior). Quem pode: o próprio (com pix.manage) ou a Direção.
create or replace function public.set_pix_key(p_member uuid, p_type text, p_value text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_val text;
begin
  select organization_id into v_org from public.members where id = p_member;
  if v_org is null then raise exception 'Pessoa não encontrada.' using errcode = 'P0002'; end if;
  if not (public.has_permission(v_org, 'pix.manage')
          or (public.is_self(p_member) and public.permission_scope_of(v_org, 'pix.manage') is not null)) then
    raise exception 'Você não tem permissão para cadastrar chave PIX.' using errcode = '42501';
  end if;
  v_val := case when p_type in ('cpf', 'cnpj') then regexp_replace(p_value, '\D', '', 'g')
                when p_type = 'telefone' then regexp_replace(p_value, '[^\d+]', '', 'g')
                else trim(p_value) end;
  update public.member_pix_keys set archived_at = now(), is_default = false where member_id = p_member and archived_at is null;
  insert into public.member_pix_keys (organization_id, member_id, key_type, key_value) values (v_org, p_member, p_type, v_val);
end $$;
revoke all on function public.set_pix_key(uuid, text, text) from public, anon;
grant execute on function public.set_pix_key(uuid, text, text) to authenticated;

-- ───────────── auditoria, RLS e grants ─────────────
do $$
declare t text;
begin
  foreach t in array array['finance_categories','financial_entries','distribution_destinations','distribution_rules','member_pix_keys','staff_payments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create trigger trg_audit_%1$s after insert or update or delete on public.%1$I for each row execute function public.fn_audit()', t);
  end loop;
  grant insert, update on public.finance_categories, public.distribution_destinations, public.distribution_rules to authenticated;
end $$;

create policy fcat_select on public.finance_categories for select to authenticated using (public.has_permission(organization_id, 'finance.read'));
create policy fcat_insert on public.finance_categories for insert to authenticated with check (public.has_permission(organization_id, 'finance.manage'));
create policy fcat_update on public.finance_categories for update to authenticated
  using (public.has_permission(organization_id, 'finance.manage')) with check (public.has_permission(organization_id, 'finance.manage'));

create policy fent_select on public.financial_entries for select to authenticated using (public.has_permission(organization_id, 'finance.read'));

create policy dd_select on public.distribution_destinations for select to authenticated using (public.has_permission(organization_id, 'finance.read'));
create policy dd_insert on public.distribution_destinations for insert to authenticated with check (public.has_permission(organization_id, 'finance.manage'));
create policy dd_update on public.distribution_destinations for update to authenticated
  using (public.has_permission(organization_id, 'finance.manage')) with check (public.has_permission(organization_id, 'finance.manage'));

create policy dr_select on public.distribution_rules for select to authenticated using (public.has_permission(organization_id, 'finance.read'));
create policy dr_insert on public.distribution_rules for insert to authenticated with check (public.has_permission(organization_id, 'finance.manage'));
create policy dr_update on public.distribution_rules for update to authenticated
  using (public.has_permission(organization_id, 'finance.manage')) with check (public.has_permission(organization_id, 'finance.manage'));

-- PIX: dado financeiro pessoal — só o titular (com permissão) e a Direção. Escrita pela RPC set_pix_key.
create policy pix_select on public.member_pix_keys for select to authenticated
  using (public.is_self(member_id) or public.has_permission(organization_id, 'pix.manage'));

create policy sp_select on public.staff_payments for select to authenticated
  using (public.is_self(member_id) or public.has_permission(organization_id, 'staff_payments.read'));
