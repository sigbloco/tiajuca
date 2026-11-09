-- Financeiro por ciclo — Equipe: cada integrante remunerado tem regras de pagamento no ciclo: valor fixo e/ou percentual.
-- O percentual incide sobre a receita recebida (cobranças pagas no mês) de todo o bloco, de um naipe, de um subnaipe ou de um instrumento.
create table public.staff_pay_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  cycle_id uuid not null,
  member_id uuid not null,
  kind text not null check (kind in ('fixed', 'percent')),
  fixed_amount numeric(12,2) check (fixed_amount is null or fixed_amount >= 0),
  percent numeric(5,2) check (percent is null or (percent > 0 and percent <= 100)),
  scope text not null default 'all' check (scope in ('all', 'section', 'subsection', 'instrument')),
  section_id uuid, subsection_id uuid, instrument_id uuid,
  created_at timestamptz not null default now(),
  foreign key (organization_id, cycle_id) references public.cycles (organization_id, id),
  foreign key (organization_id, member_id) references public.members (organization_id, id),
  foreign key (organization_id, section_id) references public.sections (organization_id, id),
  foreign key (organization_id, subsection_id) references public.subsections (organization_id, id),
  foreign key (organization_id, instrument_id) references public.instruments (organization_id, id),
  check ((kind = 'fixed' and fixed_amount is not null and percent is null and scope = 'all')
      or (kind = 'percent' and percent is not null and fixed_amount is null)),
  check ((scope = 'all' and section_id is null and subsection_id is null and instrument_id is null)
      or (scope = 'section' and section_id is not null and subsection_id is null and instrument_id is null)
      or (scope = 'subsection' and subsection_id is not null and section_id is null and instrument_id is null)
      or (scope = 'instrument' and instrument_id is not null and section_id is null and subsection_id is null))
);
create index staff_pay_rules_cycle_idx on public.staff_pay_rules (organization_id, cycle_id, member_id);

create trigger trg_audit_staff_pay_rules after insert or update or delete on public.staff_pay_rules for each row execute function public.fn_audit();
alter table public.staff_pay_rules enable row level security;
revoke all on public.staff_pay_rules from anon, authenticated;
grant select, insert, update, delete on public.staff_pay_rules to authenticated;
create policy spr_select on public.staff_pay_rules for select to authenticated using (public.has_permission(organization_id, 'finance.read'));
create policy spr_insert on public.staff_pay_rules for insert to authenticated with check (public.has_permission(organization_id, 'finance.manage'));
create policy spr_update on public.staff_pay_rules for update to authenticated
  using (public.has_permission(organization_id, 'finance.manage')) with check (public.has_permission(organization_id, 'finance.manage'));
create policy spr_delete on public.staff_pay_rules for delete to authenticated using (public.has_permission(organization_id, 'finance.manage'));
