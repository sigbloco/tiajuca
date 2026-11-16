-- Instrumento/naipe que tem (ou teve) integrante não pode ser excluído nem desvinculado dos ciclos em que foi usado.
create or replace function public._instrument_used(p_inst uuid, p_cycle uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.cycle_participations cp where cp.instrument_id = p_inst and (p_cycle is null or cp.cycle_id = p_cycle))
      or exists (select 1 from public.staff_assignments a where a.instrument_id = p_inst and (p_cycle is null or a.cycle_id = p_cycle))
      or exists (select 1 from public.member_artistic_links l where l.instrument_id = p_inst
                 and (p_cycle is null or (l.ended_at is null and exists (select 1 from public.cycles c where c.id = p_cycle and c.is_current))))
$$;
create or replace function public._section_used(p_sec uuid, p_cycle uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.instruments i where i.section_id = p_sec and public._instrument_used(i.id, p_cycle))
      or exists (select 1 from public.staff_assignments a where a.section_id = p_sec and (p_cycle is null or a.cycle_id = p_cycle))
$$;
revoke all on function public._instrument_used(uuid, uuid) from public, anon, authenticated;
revoke all on function public._section_used(uuid, uuid) from public, anon, authenticated;

create or replace function public._guard_instrument_cycle() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public._instrument_used(old.instrument_id, old.cycle_id) then
    raise exception 'Este instrumento tem (ou teve) integrantes neste ciclo e não pode ser tirado dele.' using errcode = 'P0001';
  end if;
  return old;
end $$;
create or replace function public._guard_section_cycle() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public._section_used(old.section_id, old.cycle_id) then
    raise exception 'Este naipe tem (ou teve) integrantes neste ciclo e não pode ser tirado dele.' using errcode = 'P0001';
  end if;
  return old;
end $$;
create or replace function public._guard_instrument_delete() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public._instrument_used(old.id, null) then
    raise exception 'Este instrumento tem (ou teve) integrantes e não pode ser excluído.' using errcode = 'P0001';
  end if;
  return old;
end $$;
create or replace function public._guard_section_delete() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public._section_used(old.id, null) then
    raise exception 'Este naipe tem (ou teve) integrantes e não pode ser excluído.' using errcode = 'P0001';
  end if;
  return old;
end $$;
revoke all on function public._guard_instrument_cycle() from public, anon, authenticated;
revoke all on function public._guard_section_cycle() from public, anon, authenticated;
revoke all on function public._guard_instrument_delete() from public, anon, authenticated;
revoke all on function public._guard_section_delete() from public, anon, authenticated;

create trigger trg_guard_instrument_cycle before delete on public.instrument_cycles for each row execute function public._guard_instrument_cycle();
create trigger trg_guard_section_cycle before delete on public.section_cycles for each row execute function public._guard_section_cycle();
create trigger trg_guard_instrument_delete before delete on public.instruments for each row execute function public._guard_instrument_delete();
create trigger trg_guard_section_delete before delete on public.sections for each row execute function public._guard_section_delete();

-- A tela esconde o botão de tirar/excluir dos itens em uso: quais são, no ciclo.
create or replace function public.structure_in_use(p_cycle uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when public.is_org_member((select organization_id from public.cycles where id = p_cycle)) then jsonb_build_object(
    'instruments', coalesce((select jsonb_agg(ic.instrument_id) from public.instrument_cycles ic where ic.cycle_id = p_cycle and public._instrument_used(ic.instrument_id, p_cycle)), '[]'::jsonb),
    'sections', coalesce((select jsonb_agg(sc.section_id) from public.section_cycles sc where sc.cycle_id = p_cycle and public._section_used(sc.section_id, p_cycle)), '[]'::jsonb))
  else jsonb_build_object('instruments', '[]'::jsonb, 'sections', '[]'::jsonb) end
$$;
revoke all on function public.structure_in_use(uuid) from public, anon;
grant execute on function public.structure_in_use(uuid) to authenticated;

-- Dados antigos ligados ao ciclo: cópias sem ciclo de registros que já existem com ciclo (idênticas) saem; o formulário "Pernaltas 2027" vai para o ciclo 2026/27 (como "Sopros 2027").
delete from public.cycle_participations o
 where o.cycle_id is null and exists (select 1 from public.cycle_participations x where x.cycle_id is not null and x.member_id = o.member_id
   and x.instrument_id is not distinct from o.instrument_id and x.function_id is not distinct from o.function_id and x.created_at = o.created_at);
delete from public.cycle_fee_assignments o
 where o.cycle_id is null and exists (select 1 from public.cycle_fee_assignments x where x.cycle_id is not null and x.member_id = o.member_id
   and x.fee_category_id is not distinct from o.fee_category_id and x.created_at = o.created_at);
update public.forms f set cycle_id = (select c.id from public.cycles c where c.organization_id = f.organization_id and c.name = 'Carnaval 2026/27')
 where f.title = 'Pernaltas 2027' and f.cycle_id is null and not f.is_template;
