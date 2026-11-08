-- Etapa 2 — mantém as tabelas por ciclo em dia com as antigas, para o ciclo atual.
-- Enquanto as telas antigas (vagas, cobranças, lista de integrantes) ainda leem member_artistic_links / member_fee_assignments / scholarships,
-- qualquer mudança nelas é refletida nas tabelas por ciclo do ciclo ATUAL (se a pessoa tem registro nele). Os outros ciclos são editados direto nas tabelas novas.

create or replace function public.sync_member_current_cycle(p_member uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_cycle uuid;
begin
  select organization_id into v_org from public.members where id = p_member;
  if v_org is null then return; end if;
  select id into v_cycle from public.cycles where organization_id = v_org and is_current and is_active limit 1;
  if v_cycle is null then return; end if;
  if not exists (select 1 from public.member_cycles where member_id = p_member and cycle_id = v_cycle) then return; end if;

  delete from public.cycle_participations where member_id = p_member and cycle_id = v_cycle;
  insert into public.cycle_participations (organization_id, member_id, cycle_id, instrument_id, function_id, skill_level_id, is_student, is_paid, is_primary, source_link_id)
  select l.organization_id, l.member_id, v_cycle, l.instrument_id, l.function_id, l.skill_level_id, l.is_student, l.is_paid, l.is_primary, l.id
    from public.member_artistic_links l where l.member_id = p_member and l.ended_at is null;

  delete from public.cycle_fee_assignments where member_id = p_member and cycle_id = v_cycle;
  insert into public.cycle_fee_assignments (organization_id, member_id, cycle_id, fee_category_id)
  select a.organization_id, a.member_id, v_cycle, a.fee_category_id
    from public.member_fee_assignments a where a.member_id = p_member and a.valid_to is null limit 1;

  delete from public.cycle_scholarships where member_id = p_member and cycle_id = v_cycle;
  insert into public.cycle_scholarships (organization_id, member_id, cycle_id, percent, reason, scholarship_type_id)
  select s.organization_id, s.member_id, v_cycle, s.percent, s.reason, s.scholarship_type_id
    from public.scholarships s where s.member_id = p_member and s.valid_to is null and s.percent > 0 limit 1;
end $$;
revoke all on function public.sync_member_current_cycle(uuid) from public, anon, authenticated;

create or replace function public.trg_sync_member_current_cycle() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.sync_member_current_cycle(coalesce(new.member_id, old.member_id));
  return null;
end $$;
revoke all on function public.trg_sync_member_current_cycle() from public, anon, authenticated;

create trigger trg_sync_cycle_links after insert or update or delete on public.member_artistic_links for each row execute function public.trg_sync_member_current_cycle();
create trigger trg_sync_cycle_fees after insert or update or delete on public.member_fee_assignments for each row execute function public.trg_sync_member_current_cycle();
create trigger trg_sync_cycle_schol after insert or update or delete on public.scholarships for each row execute function public.trg_sync_member_current_cycle();
create trigger trg_sync_cycle_member after insert on public.member_cycles for each row execute function public.trg_sync_member_current_cycle();
