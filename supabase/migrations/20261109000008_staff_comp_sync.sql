-- "Colaborativa" (e não "voluntária") e sincronia entre a equipe (Naipes e instrumentos) e a participação do integrante
-- (ficha: Participação › Colaborativa / Remunerada), nos dois sentidos.
alter table public.staff_assignments drop constraint if exists staff_assignments_compensation_check;
update public.staff_assignments set compensation = 'collaborative' where compensation = 'volunteer';
alter table public.staff_assignments alter column compensation set default 'collaborative';
alter table public.staff_assignments add constraint staff_assignments_compensation_check check (compensation in ('paid', 'collaborative'));

-- Função de participação que corresponde a cada tipo de equipe.
create or replace function public.staff_function_id(p_org uuid, p_kind public.staff_kind) returns uuid
language sql stable security definer set search_path = '' as $$
  select f.id from public.artistic_functions f
   where f.organization_id = p_org
     and lower(f.name) = case p_kind when 'professor' then 'professor' when 'monitor' then 'monitor' else 'regência' end
   limit 1
$$;

-- Participação → equipe: remunerada na ficha = remunerada na equipe.
create or replace function public.sync_staff_compensation(p_member uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.staff_assignments sa
     set compensation = case when exists (
           select 1 from public.member_artistic_links l
            where l.member_id = sa.member_id and l.function_id = public.staff_function_id(sa.organization_id, sa.staff_kind)
              and l.ended_at is null and l.is_paid
              and exists (select 1 from public.cycles c where c.id = sa.cycle_id and c.is_current)
         ) or exists (
           select 1 from public.cycle_participations p
            where p.member_id = sa.member_id and p.cycle_id = sa.cycle_id and p.function_id = public.staff_function_id(sa.organization_id, sa.staff_kind)
              and p.is_paid
         ) then 'paid' else 'collaborative' end
   where sa.member_id = p_member and sa.valid_to is null;
end $$;

create or replace function public.fn_participation_to_staff() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() > 1 then return null; end if;
  perform public.sync_staff_compensation(coalesce(new.member_id, old.member_id));
  return null;
end $$;
create trigger trg_links_to_staff after insert or update or delete on public.member_artistic_links for each row execute function public.fn_participation_to_staff();
create trigger trg_cp_to_staff after insert or update or delete on public.cycle_participations for each row execute function public.fn_participation_to_staff();

-- Equipe → participação: marcar remunerada/colaborativa na equipe cria ou ajusta a participação do integrante no ciclo.
create or replace function public.fn_staff_to_participation() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_fn uuid; v_paid boolean := new.compensation = 'paid'; v_current boolean;
begin
  if pg_trigger_depth() > 1 or new.valid_to is not null then return null; end if;
  v_fn := public.staff_function_id(new.organization_id, new.staff_kind);
  if v_fn is null then return null; end if;
  select c.is_current into v_current from public.cycles c where c.id = new.cycle_id;
  if coalesce(v_current, false) then
    if exists (select 1 from public.member_artistic_links where member_id = new.member_id and function_id = v_fn and ended_at is null) then
      update public.member_artistic_links set is_paid = v_paid where member_id = new.member_id and function_id = v_fn and ended_at is null and is_paid is distinct from v_paid;
    else
      insert into public.member_artistic_links (organization_id, member_id, function_id, is_paid) values (new.organization_id, new.member_id, v_fn, v_paid);
    end if;
  else
    if exists (select 1 from public.cycle_participations where member_id = new.member_id and cycle_id = new.cycle_id and function_id = v_fn) then
      update public.cycle_participations set is_paid = v_paid where member_id = new.member_id and cycle_id = new.cycle_id and function_id = v_fn and is_paid is distinct from v_paid;
    else
      insert into public.cycle_participations (organization_id, member_id, cycle_id, function_id, is_paid) values (new.organization_id, new.member_id, new.cycle_id, v_fn, v_paid);
    end if;
  end if;
  return null;
end $$;
-- Acerto único: a equipe existente passa a refletir o que a ficha de cada integrante já diz.
do $$
declare m uuid;
begin
  for m in select distinct member_id from public.staff_assignments loop
    perform public.sync_staff_compensation(m);
  end loop;
end $$;

-- (o gatilho abaixo só vale daqui para frente; o acerto acima não cria participações)
create trigger trg_staff_to_participation after insert or update of compensation on public.staff_assignments for each row execute function public.fn_staff_to_participation();
