-- Categorias de contribuição: TIPO (aluno, senior, musico, isento) e NAIPE (opcional).
-- O valor mensal continua por categoria e ciclo; o naipe explica o valor (ex.: Aluno de percussão, Sênior pernalta) e
-- impede categoria de um naipe para quem toca em outro. Categoria sem naipe serve para qualquer naipe.

alter table public.fee_categories
  add column if not exists base_key text check (base_key is null or base_key in ('aluno', 'senior', 'musico', 'isento')),
  add column if not exists section_id uuid references public.sections(id) on delete set null;
comment on column public.fee_categories.base_key is 'Tipo da categoria (aluno, senior, musico, isento): é o que o sistema usa para reconhecer, não o nome.';
comment on column public.fee_categories.section_id is 'Naipe da categoria (opcional): só quem toca neste naipe pode tê-la como categoria principal.';

-- Dados atuais: o tipo vem da chave fixa; as categorias de oficina e a de pernalta ganham tipo e naipe.
update public.fee_categories set base_key = system_key where base_key is null and system_key in ('aluno', 'senior', 'musico', 'isento');
update public.fee_categories fc set base_key = 'aluno', section_id = (select s.id from public.sections s where s.organization_id = fc.organization_id and s.name = 'Percussão')
 where fc.name = 'Aluno (percussão)' and fc.section_id is null;
update public.fee_categories fc set base_key = 'aluno', section_id = (select s.id from public.sections s where s.organization_id = fc.organization_id and s.name = 'Sopro')
 where fc.name = 'Aluno (sopro)' and fc.section_id is null;
update public.fee_categories fc set base_key = 'senior', section_id = (select s.id from public.sections s where s.organization_id = fc.organization_id and s.name = 'Performance')
 where fc.name = 'Pernalta' and fc.section_id is null;

-- Naipes que a pessoa tem no ciclo (instrumento ou, na falta, a função).
create or replace function public.member_cycle_sections(p_member uuid, p_cycle uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct coalesce(i.section_id, af.section_id)) filter (where coalesce(i.section_id, af.section_id) is not null), '{}')
    from public.cycle_participations cp
    left join public.instruments i on i.id = cp.instrument_id
    left join public.artistic_functions af on af.id = cp.function_id
   where cp.member_id = p_member and cp.cycle_id = p_cycle
$$;
revoke all on function public.member_cycle_sections(uuid, uuid) from public, anon, authenticated;

-- Só vale para o ciclo atual e os futuros: ciclos passados ficam como estão ("Aluno (sopro)" era a categoria de todos os alunos antes de existir a de percussão).
-- Categoria principal de naipe diferente do instrumento da pessoa: barrado. Sem instrumento ainda, passa (vale quando ele for definido).
create or replace function public.guard_category_section() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_sec uuid; v_cat text; v_mine uuid[]; v_names text;
begin
  if not exists (select 1 from public.cycles c where c.id = new.cycle_id and c.ends_on >= current_date) then return new; end if;
  select fc.section_id, fc.name into v_sec, v_cat from public.fee_categories fc where fc.id = new.fee_category_id;
  if v_sec is null then return new; end if;
  v_mine := public.member_cycle_sections(new.member_id, new.cycle_id);
  if cardinality(v_mine) = 0 or v_sec = any (v_mine) then return new; end if;
  select string_agg(s.name, ', ') into v_names from public.sections s where s.id = any (v_mine);
  raise exception 'A categoria "%" é de outro naipe: o instrumento desta pessoa é de %. Escolha a categoria do naipe dela.', v_cat, v_names using errcode = 'P0001';
end $$;
drop trigger if exists trg_guard_category_section on public.cycle_fee_assignments;
create trigger trg_guard_category_section before insert or update of fee_category_id on public.cycle_fee_assignments
  for each row execute function public.guard_category_section();

-- Trocar o instrumento para outro naipe enquanto a categoria principal é de um naipe: barrado (troque a categoria antes).
create or replace function public.guard_participation_section() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_sec uuid; v_cat text; v_mine uuid[]; v_names text;
begin
  if not exists (select 1 from public.cycles c where c.id = new.cycle_id and c.ends_on >= current_date) then return null; end if;
  select fc.section_id, fc.name into v_sec, v_cat
    from public.cycle_fee_assignments fa join public.fee_categories fc on fc.id = fa.fee_category_id
   where fa.member_id = new.member_id and fa.cycle_id = new.cycle_id limit 1;
  if v_sec is null then return null; end if;
  v_mine := public.member_cycle_sections(new.member_id, new.cycle_id);
  if cardinality(v_mine) = 0 or v_sec = any (v_mine) then return null; end if;
  select string_agg(s.name, ', ') into v_names from public.sections s where s.id = any (v_mine);
  raise exception 'Esta pessoa está na categoria "%", que é de outro naipe (instrumento de %). Troque a categoria antes de mudar o instrumento.', v_cat, v_names using errcode = 'P0001';
end $$;
drop trigger if exists trg_guard_participation_section on public.cycle_participations;
create trigger trg_guard_participation_section after insert or update of instrument_id, function_id on public.cycle_participations
  for each row execute function public.guard_participation_section();
