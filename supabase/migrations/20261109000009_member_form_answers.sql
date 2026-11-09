-- Respostas de formulário que variam por ciclo (relação com a Grande Tijuca e outros blocos). Acumulam: cada ciclo/inscrição guarda a sua.
-- A ficha mostra o histórico no fim da página; os campos fixos da ficha ficam com a resposta mais recente.
create table public.member_form_answers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  member_id uuid not null,
  cycle_id uuid references public.cycles (id) on delete set null,
  cycle_label text not null,
  affective_relation text,
  other_blocks text,
  source text not null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, member_id) references public.members (organization_id, id),
  unique (member_id, source)
);
create index member_form_answers_member_idx on public.member_form_answers (member_id);

create trigger trg_audit_member_form_answers after insert or update or delete on public.member_form_answers for each row execute function public.fn_audit();
alter table public.member_form_answers enable row level security;
revoke all on public.member_form_answers from anon, authenticated;
grant select, insert, update, delete on public.member_form_answers to authenticated;
create policy mfa_select on public.member_form_answers for select to authenticated using (public.can_read_member(organization_id, member_id));
create policy mfa_insert on public.member_form_answers for insert to authenticated with check (public.has_permission(organization_id, 'members.manage'));
create policy mfa_update on public.member_form_answers for update to authenticated
  using (public.has_permission(organization_id, 'members.manage')) with check (public.has_permission(organization_id, 'members.manage'));
create policy mfa_delete on public.member_form_answers for delete to authenticated using (public.has_permission(organization_id, 'members.manage'));
