-- Perfil do integrante: ver a própria participação, pedir mudança (a Direção aprova) e abrir mão de uma colaboração.
create table public.participation_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  member_id uuid not null,
  kind text not null check (kind in ('artistic', 'collab')),
  action text not null check (action in ('add', 'remove')),
  instrument_id uuid, function_id uuid, link_id uuid,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  foreign key (organization_id, member_id) references public.members (organization_id, id),
  check (action = 'remove' or instrument_id is not null or function_id is not null)
);
create index participation_requests_pending_idx on public.participation_requests (organization_id) where status = 'pending';
alter table public.participation_requests enable row level security;
revoke all on public.participation_requests from anon, authenticated;
grant select on public.participation_requests to authenticated;
create policy preq_select on public.participation_requests for select to authenticated
  using (public.is_self(member_id) or public.has_permission(organization_id, 'members.manage'));

-- Tudo o que o integrante vê sobre a própria participação (e a Direção ao "visualizar como").
create or replace function public.my_participation(p_member uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m public.members; v_org uuid; res jsonb; v_cat text; v_cat_id uuid; v_price numeric; v_pct numeric; v_exempt text; v_today date := current_date;
begin
  select * into m from public.members where id = p_member;
  if m.id is null or not (public.is_self(p_member) or public.has_permission(m.organization_id, 'members.manage')) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  select fc.id, fc.name into v_cat_id, v_cat from public.member_fee_assignments a join public.fee_categories fc on fc.id = a.fee_category_id
    where a.member_id = p_member and a.valid_to is null limit 1;
  if v_cat_id is not null then
    select amount into v_price from public.fee_category_prices where fee_category_id = v_cat_id and valid_from <= v_today and (valid_to is null or valid_to >= v_today) order by valid_from desc limit 1;
  end if;
  select coalesce(percent, 0) into v_pct from public.scholarships where member_id = p_member and valid_to is null limit 1;
  select af.name into v_exempt from public.member_artistic_links l join public.artistic_functions af on af.id = l.function_id
    where l.member_id = p_member and l.ended_at is null and (af.is_exempt or af.exempt_locked) limit 1;
  select jsonb_build_object(
    'artistic', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'name', i.name, 'section', s.name, 'level', sl.name) order by l.created_at)
        from public.member_artistic_links l join public.instruments i on i.id = l.instrument_id left join public.sections s on s.id = i.section_id left join public.skill_levels sl on sl.id = l.skill_level_id
        where l.member_id = p_member and l.ended_at is null and l.instrument_id is not null), '[]'::jsonb),
    'collab', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'name', af.name, 'exempt', (af.is_exempt or af.exempt_locked)) order by l.created_at)
        from public.member_artistic_links l join public.artistic_functions af on af.id = l.function_id
        where l.member_id = p_member and l.ended_at is null and l.instrument_id is null and not l.is_paid), '[]'::jsonb),
    'paid', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'name', af.name) order by l.created_at)
        from public.member_artistic_links l join public.artistic_functions af on af.id = l.function_id
        where l.member_id = p_member and l.ended_at is null and l.instrument_id is null and l.is_paid), '[]'::jsonb),
    'category', v_cat, 'price', v_price, 'percent', coalesce(v_pct, 0), 'exempt_by', v_exempt,
    'requests', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'action', r.action, 'status', r.status, 'created_at', r.created_at,
          'label', coalesce(i.name, af.name, (select coalesce(i2.name, af2.name) from public.member_artistic_links l2 left join public.instruments i2 on i2.id = l2.instrument_id left join public.artistic_functions af2 on af2.id = l2.function_id where l2.id = r.link_id))) order by r.created_at desc)
        from (select * from public.participation_requests where member_id = p_member order by created_at desc limit 10) r
        left join public.instruments i on i.id = r.instrument_id left join public.artistic_functions af on af.id = r.function_id), '[]'::jsonb)
  ) into res;
  return res;
end $$;
revoke all on function public.my_participation(uuid) from public, anon;
grant execute on function public.my_participation(uuid) to authenticated;

-- Pedido de mudança (artística ou colaborativa): fica pendente até a Direção aprovar.
create or replace function public.request_participation_change(p_member uuid, p_kind text, p_action text, p_instrument uuid default null, p_function uuid default null, p_link uuid default null, p_note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare m public.members; v_id uuid;
begin
  select * into m from public.members where id = p_member;
  if m.id is null or not public.is_self(p_member) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if p_action = 'remove' and not exists (select 1 from public.member_artistic_links where id = p_link and member_id = p_member and ended_at is null) then raise exception 'Vínculo não encontrado.'; end if;
  insert into public.participation_requests (organization_id, member_id, kind, action, instrument_id, function_id, link_id, note)
  values (m.organization_id, p_member, p_kind, p_action, p_instrument, p_function, p_link, nullif(btrim(coalesce(p_note, '')), '')) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.request_participation_change(uuid, text, text, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.request_participation_change(uuid, text, text, uuid, uuid, uuid, text) to authenticated;

-- Abrir mão da própria colaboração: vale na hora. Sem a função, acaba a isenção ligada a ela e a pessoa volta a pagar a sua categoria.
create or replace function public.give_up_collaboration(p_link uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare l public.member_artistic_links;
begin
  select * into l from public.member_artistic_links where id = p_link and ended_at is null and instrument_id is null and function_id is not null and not is_paid;
  if l.id is null or not public.is_self(l.member_id) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  update public.member_artistic_links set ended_at = current_date where id = p_link;
end $$;
revoke all on function public.give_up_collaboration(uuid) from public, anon;
grant execute on function public.give_up_collaboration(uuid) to authenticated;

-- Direção: aprovar aplica a mudança; recusar só fecha o pedido.
create or replace function public.review_participation_request(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.participation_requests;
begin
  select * into r from public.participation_requests where id = p_id and status = 'pending';
  if r.id is null or not public.has_permission(r.organization_id, 'members.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if p_approve then
    if r.action = 'add' then
      insert into public.member_artistic_links (organization_id, member_id, instrument_id, function_id, is_primary)
      values (r.organization_id, r.member_id, r.instrument_id, r.function_id, false);
    else
      update public.member_artistic_links set ended_at = current_date where id = r.link_id and ended_at is null;
    end if;
  end if;
  update public.participation_requests set status = case when p_approve then 'approved' else 'rejected' end, reviewed_at = now() where id = p_id;
end $$;
revoke all on function public.review_participation_request(uuid, boolean) from public, anon;
grant execute on function public.review_participation_request(uuid, boolean) to authenticated;
