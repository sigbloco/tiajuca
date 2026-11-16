-- "Eu sou…" do formulário é a categoria PRINCIPAL de contribuição (não um vínculo artístico).
create or replace function public._apply_principal_category(p_org uuid, p_member uuid, p_function uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare cat uuid; cur public.member_fee_assignments; cy uuid;
begin
  select id into cat from public.fee_categories where organization_id = p_org and function_id = p_function limit 1;
  if cat is null then return false; end if;
  select * into cur from public.member_fee_assignments where member_id = p_member and valid_to is null;
  if cur.id is null then
    insert into public.member_fee_assignments (organization_id, member_id, fee_category_id, valid_from) values (p_org, p_member, cat, current_date);
  elsif cur.fee_category_id <> cat then
    if cur.valid_from >= current_date then update public.member_fee_assignments set fee_category_id = cat where id = cur.id;
    else
      update public.member_fee_assignments set valid_to = current_date - 1 where id = cur.id;
      insert into public.member_fee_assignments (organization_id, member_id, fee_category_id, valid_from) values (p_org, p_member, cat, current_date);
    end if;
  end if;
  select id into cy from public.cycles where organization_id = p_org and is_current limit 1;
  if cy is not null then
    delete from public.cycle_fee_assignments where member_id = p_member and cycle_id = cy;
    insert into public.cycle_fee_assignments (organization_id, member_id, cycle_id, fee_category_id) values (p_org, p_member, cy, cat);
  end if;
  return true;
end $$;
revoke all on function public._apply_principal_category(uuid, uuid, uuid) from public, anon, authenticated;

do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public._approve_renewal(uuid,text,text)'::regprocedure);
  n := replace(d, E'  if l_func is not null then\n    select id into v_link', E'  if l_func is not null and not public._apply_principal_category(s.organization_id, s.member_id, l_func) then\n    select id into v_link');
  if n = d then raise exception 'patch _approve_renewal'; end if;
  execute n;
  d := pg_get_functiondef('public.approve_submission(uuid,text,text)'::regprocedure);
  n := replace(d, E'  if l_inst is not null or l_func is not null then\n    insert into public.member_artistic_links (organization_id, member_id, instrument_id, function_id, skill_level_id, is_primary)\n    values (s.organization_id, v_member, l_inst, l_func, l_level, true);\n  end if;',
    E'  if l_inst is not null then\n    insert into public.member_artistic_links (organization_id, member_id, instrument_id, skill_level_id, is_primary)\n    values (s.organization_id, v_member, l_inst, l_level, true);\n  end if;\n  if l_func is not null and not public._apply_principal_category(s.organization_id, v_member, l_func) then\n    insert into public.member_artistic_links (organization_id, member_id, function_id, is_primary) values (s.organization_id, v_member, l_func, false);\n  end if;');
  if n = d then raise exception 'patch approve_submission'; end if;
  execute n;
end $$;
