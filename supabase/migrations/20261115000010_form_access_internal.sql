-- Formulário interno (renovação / pré-inscrição): só quem já tem login e cadastro responde; seções por naipe do integrante;
-- a resposta vira pendência e, ao aprovar, ATUALIZA o cadastro existente (em vez de criar um integrante novo).

alter table public.forms add column if not exists access text not null default 'public' check (access in ('public', 'internal'));

-- Naipe do integrante hoje: pelo vínculo artístico vigente (instrumento) ou, para professor/monitor, pela atribuição vigente.
create or replace function public._viewer_section(p_member uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select i.section_id from public.member_artistic_links l join public.instruments i on i.id = l.instrument_id
      where l.member_id = p_member and l.ended_at is null order by l.is_primary desc, l.created_at limit 1),
    (select coalesce(a.section_id, i.section_id) from public.staff_assignments a left join public.instruments i on i.id = a.instrument_id
      where a.member_id = p_member and a.valid_to is null and coalesce(a.section_id, i.section_id) is not null order by a.created_at limit 1))
$$;
revoke all on function public._viewer_section(uuid) from public, anon, authenticated;

-- Leitura pública: formulário interno pede login e cadastro; devolve o naipe do integrante e mantém o vínculo dos campos com o cadastro (para vir preenchido).
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.get_public_form(text,text)'::regprocedure);
  n := replace(d, 'v public.form_versions; st text;', 'v public.form_versions; st text; m public.members; viewer jsonb;');
  if n = d then raise exception 'patch get_public_form: declare'; end if; d := n;
  n := replace(d, 'st := public._form_state(f);', $q$st := public._form_state(f);
  if f.access = 'internal' and st = 'open' then
    if auth.uid() is null then st := 'login_required';
    else
      select * into m from public.members where organization_id = o.id and user_id = auth.uid() and archived_at is null;
      if m.id is null then st := 'not_member';
      else viewer := jsonb_build_object('member_id', m.id, 'name', m.full_name, 'section_id', public._viewer_section(m.id));
      end if;
    end if;
  end if;$q$);
  if n = d then raise exception 'patch get_public_form: state'; end if; d := n;
  n := replace(d, '''state'', st,', '''state'', st, ''access'', f.access, ''viewer'', viewer,');
  if n = d then raise exception 'patch get_public_form: payload'; end if; d := n;
  n := replace(d, 'jsonb_agg(fld - ''mapping'')', 'jsonb_agg(case when f.access = ''internal'' then fld else fld - ''mapping'' end)');
  if n = d then raise exception 'patch get_public_form: fields'; end if;
  execute n;
end $$;

-- Envio: formulário interno exige login de integrante; a condição "_naipe" usa o naipe dele; a pendência já nasce ligada ao integrante.
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.submit_public_form(text,text,jsonb,boolean,text,uuid,jsonb)'::regprocedure);
  n := replace(d, 'v_login_user uuid;', 'v_login_user uuid; v_member uuid; v_section uuid; v_m public.members;');
  if n = d then raise exception 'patch submit: declare'; end if; d := n;
  n := replace(d, 'if exists (select 1 from jsonb_array_elements(snap -> ''fields'') x where x ->> ''type'' = ''info'' and coalesce((x -> ''validation'' ->> ''login'')::boolean, false)) then',
    $q$if f.access = 'internal' then
    v_login_user := auth.uid();
    if v_login_user is null then raise exception 'Entre com sua conta Google para enviar.' using errcode = 'P0001'; end if;
    select lower(u.email) into v_login_email from auth.users u where u.id = v_login_user;
    select * into v_m from public.members where organization_id = f.organization_id and user_id = v_login_user and archived_at is null;
    if v_m.id is null then raise exception 'Este formulário é só para integrantes do bloco.' using errcode = 'P0001'; end if;
    v_member := v_m.id;
    v_section := public._viewer_section(v_member);
  end if;
  if exists (select 1 from jsonb_array_elements(snap -> 'fields') x where x ->> 'type' = 'info' and coalesce((x -> 'validation' ->> 'login')::boolean, false)) then$q$);
  if n = d then raise exception 'patch submit: login'; end if; d := n;
  n := replace(d, 'pv := clean ->> (cond ->> ''field'');', 'pv := case when cond ->> ''field'' = ''_naipe'' then v_section::text else clean ->> (cond ->> ''field'') end;');
  if n = d then raise exception 'patch submit: cond'; end if; d := n;
  n := replace(d, 'dedupe_key, applicant_user_id)', 'dedupe_key, applicant_user_id, member_id)');
  if n = d then raise exception 'patch submit: cols'; end if; d := n;
  n := replace(d, 'lower(v_dedupe), v_login_user)', 'lower(v_dedupe), v_login_user, v_member)');
  if n = d then raise exception 'patch submit: vals'; end if;
  execute n;
end $$;

-- Aprovação de renovação: atualiza o integrante existente (só o que foi respondido), sem duplicar e sem trocar o e-mail.
create or replace function public._approve_renewal(p_id uuid, p_notes text, p_cycle_status text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  s public.form_submissions; f public.forms; v public.form_versions; fld jsonb; mp text; ans jsonb; a text;
  m_full text; m_display text; m_phone text; m_social text; m_birth date; m_aff text; m_other text; m_extra jsonb := '{}'::jsonb;
  s_gender text; s_trans boolean; s_race text; s_pcd boolean; s_pcd_desc text; l_inst uuid; l_func uuid; l_level uuid; v_has_sens boolean := false; v_link uuid;
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  select * into s from public.form_submissions where id = p_id;
  if s.id is null or s.member_id is null or not public.has_permission(s.organization_id, 'forms.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  select * into f from public.forms where id = s.form_id;
  select * into v from public.form_versions where id = s.form_version_id;
  ans := s.answers;
  for fld in select * from jsonb_array_elements(v.snapshot -> 'fields') loop
    mp := fld ->> 'mapping';
    continue when mp is null or not (ans ? (fld ->> 'key'));
    a := ans ->> (fld ->> 'key');
    case mp
      when 'member.full_name' then m_full := a;
      when 'member.display_name' then m_display := a;
      when 'member.phone' then m_phone := a;
      when 'member.social_handle' then m_social := a;
      when 'member.birth_date' then m_birth := a::date;
      when 'member.affective_relation' then m_aff := a;
      when 'member.other_blocks' then m_other := a;
      when 'member.custom' then m_extra := m_extra || jsonb_build_object(fld ->> 'label', a);
      when 'sensitive.gender' then s_gender := a; v_has_sens := true;
      when 'sensitive.is_trans' then s_trans := (a = 'yes'); v_has_sens := true;
      when 'sensitive.race_color' then s_race := a; v_has_sens := true;
      when 'sensitive.is_pcd' then s_pcd := (a = 'yes'); v_has_sens := true;
      when 'sensitive.pcd_description' then s_pcd_desc := a; v_has_sens := true;
      when 'link.instrument' then l_inst := (case when a ~* uuid_re then a::uuid end);
      when 'link.function' then l_func := (case when a ~* uuid_re then a::uuid end);
      when 'link.skill_level' then l_level := (case when a ~* uuid_re then a::uuid end);
      else null;
    end case;
  end loop;

  update public.members set
    full_name = coalesce(nullif(trim(m_full), ''), full_name), display_name = coalesce(nullif(trim(m_display), ''), display_name),
    phone = coalesce(m_phone, phone), social_handle = coalesce(nullif(trim(m_social), ''), social_handle), birth_date = coalesce(m_birth, birth_date),
    affective_relation = coalesce(nullif(trim(m_aff), ''), affective_relation),
    other_blocks = coalesce(nullif(trim(m_other), ''), other_blocks), played_other_blocks = played_other_blocks or (m_other is not null and btrim(m_other) <> ''),
    extra_info = coalesce(extra_info, '{}'::jsonb) || m_extra
  where id = s.member_id and organization_id = s.organization_id;

  if v_has_sens then
    insert into public.member_sensitive_data (member_id, organization_id, gender, is_trans, race_color, is_pcd, pcd_description)
    values (s.member_id, s.organization_id, s_gender, s_trans, s_race, s_pcd, case when s_pcd then s_pcd_desc end)
    on conflict (member_id) do update set
      gender = coalesce(excluded.gender, public.member_sensitive_data.gender), is_trans = coalesce(excluded.is_trans, public.member_sensitive_data.is_trans),
      race_color = coalesce(excluded.race_color, public.member_sensitive_data.race_color), is_pcd = coalesce(excluded.is_pcd, public.member_sensitive_data.is_pcd),
      pcd_description = case when coalesce(excluded.is_pcd, public.member_sensitive_data.is_pcd) then coalesce(excluded.pcd_description, public.member_sensitive_data.pcd_description) end;
  end if;

  -- Instrumento (e nível) no vínculo artístico vigente; categoria no vínculo só de categoria (os remunerados não são tocados).
  if l_inst is not null or l_level is not null then
    select id into v_link from public.member_artistic_links where member_id = s.member_id and ended_at is null and instrument_id is not null order by is_primary desc, created_at limit 1;
    if v_link is not null then
      update public.member_artistic_links set instrument_id = coalesce(l_inst, instrument_id), skill_level_id = coalesce(l_level, skill_level_id) where id = v_link;
    elsif l_inst is not null then
      insert into public.member_artistic_links (organization_id, member_id, instrument_id, skill_level_id, is_primary) values (s.organization_id, s.member_id, l_inst, l_level, true);
    end if;
  end if;
  if l_func is not null then
    select id into v_link from public.member_artistic_links where member_id = s.member_id and ended_at is null and instrument_id is null and coalesce(is_paid, false) = false order by created_at limit 1;
    if v_link is not null then update public.member_artistic_links set function_id = l_func where id = v_link;
    else insert into public.member_artistic_links (organization_id, member_id, function_id, is_primary) values (s.organization_id, s.member_id, l_func, false);
    end if;
  end if;

  if s.consent_given then
    insert into public.consent_records (organization_id, member_id, purpose, text_version) values (s.organization_id, s.member_id, 'inscricao', v.id::text);
  end if;
  if p_cycle_status is not null and f.cycle_id is not null then
    perform public.set_member_cycle_status(s.member_id, f.cycle_id, p_cycle_status, null, case when p_cycle_status = 'waitlist' then l_inst end);
  end if;
  if coalesce(s.applicant_email, (select lower(email) from public.members where id = s.member_id)) is not null and (case when p_cycle_status = 'waitlist' then f.waitlist_enabled else f.approved_enabled end) then
    insert into public.form_email_outbox (organization_id, submission_id, member_id, template, to_email)
    values (s.organization_id, s.id, s.member_id, case when p_cycle_status = 'waitlist' then 'submission_waitlist' else 'submission_approved' end,
            coalesce(s.applicant_email, (select lower(email) from public.members where id = s.member_id))) on conflict do nothing;
  end if;
  update public.form_submissions set status = 'approved', reviewer_notes = coalesce(nullif(trim(p_notes), ''), reviewer_notes),
         reviewed_by = public.current_member_id(s.organization_id), reviewed_at = now() where id = p_id;
  insert into public.audit_logs (organization_id, actor_user_id, actor_member_id, action, entity_type, entity_id, new_data)
  values (s.organization_id, auth.uid(), public.current_member_id(s.organization_id), 'submission_approved', 'form_submissions', p_id::text, jsonb_build_object('member_id', s.member_id, 'renewal', true));
  return s.member_id;
end $$;
revoke all on function public._approve_renewal(uuid, text, text) from public, anon, authenticated;

do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.approve_submission(uuid,text,text)'::regprocedure);
  n := replace(d, E'  ans := s.answers;\n', E'  if s.member_id is not null then return public._approve_renewal(p_id, p_notes, p_cycle_status); end if;\n  ans := s.answers;\n');
  if n = d then raise exception 'patch approve_submission'; end if;
  execute n;
end $$;
