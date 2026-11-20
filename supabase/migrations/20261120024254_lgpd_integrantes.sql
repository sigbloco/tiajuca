-- Etapa 2 da revisão: LGPD na área dos integrantes.
-- LGPD-03: o log de auditoria mascara e-mail, telefone, chave Pix e data de nascimento (também o que já estava gravado).
-- LGPD-02 e LGPD-03 (D5): guarda de 12 meses para backups manuais/importados e de 24 meses para a auditoria.
-- LGPD-04 (D4): aniversários para o integrante comum: só quem está ativo no ciclo, pelo nome de exibição.
-- LGPD-05: dados sensíveis de outra pessoa só por RPC, que registra a leitura; leitura direta fica só para o próprio.
-- LGPD-08: anonimização das inscrições antigas roda sozinha todo dia (mesmos prazos de hoje).

-- ---------------------------------------------------------------- LGPD-03: máscara
create or replace function public.audit_mask_value(p_key text, p_val text)
 returns text
 language sql
 immutable
 set search_path to ''
as $function$
  select case
    when p_val is null or p_val = '' then p_val
    when p_val like '***%' or p_val ~ '^.\*\*\*@' then p_val -- já mascarado
    when p_key in ('email', 'customer_email', 'contact_email', 'mail_from_email') and position('@' in p_val) > 1
      then left(p_val, 1) || '***@' || split_part(p_val, '@', 2)
    when p_key in ('phone', 'customer_phone', 'contact_phone', 'contact_whatsapp')
      then '***' || right(regexp_replace(p_val, '\D', '', 'g'), 4)
    -- chave Pix (pode ser CPF), data de nascimento: só um resumo curto, que mostra que mudou sem revelar o valor
    else '***' || left(md5(p_val), 4)
  end
$function$;

create or replace function public.audit_mask(p_data jsonb)
 returns jsonb
 language sql
 immutable
 set search_path to ''
as $function$
  select case when p_data is null or jsonb_typeof(p_data) <> 'object' then p_data else (
    select coalesce(jsonb_object_agg(e.key,
             case when e.key = any (array['email', 'customer_email', 'contact_email', 'mail_from_email',
                                          'phone', 'customer_phone', 'contact_phone', 'contact_whatsapp',
                                          'key_value', 'pix_key', 'pix_key_snapshot', 'birth_date'])
                       and jsonb_typeof(e.value) = 'string'
                  then to_jsonb(public.audit_mask_value(e.key, e.value #>> '{}'))
                  else e.value end), '{}'::jsonb)
      from jsonb_each(p_data) e) end
$function$;
revoke execute on function public.audit_mask_value(text, text) from public, anon, authenticated;
revoke execute on function public.audit_mask(jsonb) from public, anon, authenticated;

create or replace function public.fn_audit()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_old jsonb; v_new jsonb; v_org uuid; v_id text; v_member uuid;
begin
  v_old := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;

  if tg_table_name = 'organizations' then
    v_org := coalesce(v_new ->> 'id', v_old ->> 'id')::uuid;
  elsif tg_table_name = 'role_permissions' then
    select r.organization_id into v_org from public.access_roles r
    where r.id = coalesce(v_new ->> 'access_role_id', v_old ->> 'access_role_id')::uuid;
  else
    v_org := coalesce(v_new ->> 'organization_id', v_old ->> 'organization_id')::uuid;
  end if;

  v_id := coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'member_id', v_old ->> 'member_id',
                   v_new ->> 'key', v_old ->> 'key');

  -- LGPD: o log de dados sensíveis registra apenas QUAIS campos mudaram, nunca os valores.
  if tg_table_name = 'member_sensitive_data' then
    v_old := null;
    v_new := jsonb_build_object('changed_fields', coalesce((
      select jsonb_agg(n.key) from jsonb_each(to_jsonb(new)) n
      where n.key not in ('updated_at', 'updated_by')
        and (tg_op = 'INSERT' or n.value is distinct from (to_jsonb(old) -> n.key))
    ), '[]'::jsonb));
  else
    -- LGPD-03: contato, chave Pix e nascimento ficam mascarados no log.
    v_old := public.audit_mask(v_old);
    v_new := public.audit_mask(v_new);
  end if;

  v_member := (select m.id from public.members m
               where m.user_id = auth.uid() and m.organization_id = v_org limit 1);

  insert into public.audit_logs (organization_id, actor_user_id, actor_member_id, action,
                                 entity_type, entity_id, old_data, new_data)
  values (v_org, auth.uid(), v_member, lower(tg_op), tg_table_name, v_id, v_old, v_new);
  return null;
end $function$;

-- O que já estava gravado também passa a ficar mascarado.
update public.audit_logs
   set old_data = public.audit_mask(old_data), new_data = public.audit_mask(new_data)
 where entity_type <> 'member_sensitive_data'
   and (old_data ?| array['email', 'customer_email', 'contact_email', 'mail_from_email', 'phone', 'customer_phone', 'contact_phone', 'contact_whatsapp', 'key_value', 'pix_key', 'pix_key_snapshot', 'birth_date']
     or new_data ?| array['email', 'customer_email', 'contact_email', 'mail_from_email', 'phone', 'customer_phone', 'contact_phone', 'contact_whatsapp', 'key_value', 'pix_key', 'pix_key_snapshot', 'birth_date']);

-- ---------------------------------------------------------------- LGPD-04
create or replace function public.birthday_list(p_org uuid)
 returns table(member_id uuid, full_name text, display_name text, month_day text, birth_year integer, is_org boolean)
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare v_staff boolean;
begin
  if not public.is_org_member(p_org) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  v_staff := coalesce(public.is_staff(p_org), false);
  if v_staff then
    -- Equipe e Direção: todos os cadastros, com nome completo e ano.
    return query
      select m.id, m.full_name, m.display_name, to_char(m.birth_date, 'MM-DD'), extract(year from m.birth_date)::int, false
        from public.members m
       where m.organization_id = p_org and m.archived_at is null and m.birth_date is not null;
  else
    -- Integrante: só quem está ativo no ciclo atual, pelo nome de exibição (ou primeiro nome), sem o ano.
    return query
      select m.id, n.name, n.name, to_char(m.birth_date, 'MM-DD'), null::int, false
        from public.members m
        cross join lateral (select coalesce(nullif(btrim(m.display_name), ''), split_part(btrim(m.full_name), ' ', 1)) as name) n
       where m.organization_id = p_org and m.archived_at is null and m.birth_date is not null
         and exists (select 1 from public.member_cycles mc
                       join public.cycles c on c.id = mc.cycle_id and c.is_current
                       join public.member_cycle_statuses s on s.id = mc.status_id and s.counts_as_active
                      where mc.member_id = m.id);
  end if;
  -- Aniversário do bloco (data de fundação): o ano aparece para todos.
  return query
    select null::uuid, o.name, null::text, to_char(o.founded_on, 'MM-DD'), extract(year from o.founded_on)::int, true
      from public.organizations o where o.id = p_org and o.founded_on is not null;
end $function$;

-- ---------------------------------------------------------------- LGPD-05
create or replace function public.get_member_sensitive(p_member uuid)
 returns table(gender text, is_trans boolean, race_color text, is_pcd boolean, pcd_description text)
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_org uuid;
begin
  select organization_id into v_org from public.members where id = p_member;
  if v_org is null then raise exception 'Integrante não encontrado.' using errcode = 'P0002'; end if;
  if not public.is_self(p_member) then
    if not public.has_permission(v_org, 'members.sensitive.read') then
      raise exception 'Sem permissão para dados sensíveis.' using errcode = '42501';
    end if;
    -- Registra a leitura (uma linha a cada 10 minutos por pessoa lida, para não encher o log a cada recarga).
    if not exists (select 1 from public.audit_logs a
                    where a.organization_id = v_org and a.action = 'sensitive_read' and a.entity_id = p_member::text
                      and a.actor_user_id = auth.uid() and a.created_at > now() - interval '10 minutes') then
      insert into public.audit_logs (organization_id, actor_user_id, actor_member_id, action, entity_type, entity_id)
      values (v_org, auth.uid(), public.current_member_id(v_org), 'sensitive_read', 'member_sensitive_data', p_member::text);
    end if;
  end if;
  return query select s.gender, s.is_trans, s.race_color, s.is_pcd, s.pcd_description
                 from public.member_sensitive_data s where s.member_id = p_member;
end $function$;
revoke execute on function public.get_member_sensitive(uuid) from public, anon;
grant execute on function public.get_member_sensitive(uuid) to authenticated;

create or replace function public.save_member_sensitive(p_member uuid, p_gender text, p_is_trans boolean, p_race_color text, p_is_pcd boolean, p_pcd_description text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_org uuid;
begin
  select organization_id into v_org from public.members where id = p_member;
  if v_org is null then raise exception 'Integrante não encontrado.' using errcode = 'P0002'; end if;
  if not (public.is_self(p_member) or public.has_permission(v_org, 'members.sensitive.manage')) then
    raise exception 'Sem permissão para dados sensíveis.' using errcode = '42501';
  end if;
  insert into public.member_sensitive_data (member_id, organization_id, gender, is_trans, race_color, is_pcd, pcd_description, updated_by)
  values (p_member, v_org, nullif(btrim(p_gender), ''), p_is_trans, nullif(btrim(p_race_color), ''), p_is_pcd,
          case when p_is_pcd then nullif(btrim(p_pcd_description), '') end, auth.uid())
  on conflict (member_id) do update set
    gender = excluded.gender, is_trans = excluded.is_trans, race_color = excluded.race_color,
    is_pcd = excluded.is_pcd, pcd_description = excluded.pcd_description, updated_by = excluded.updated_by;
end $function$;
revoke execute on function public.save_member_sensitive(uuid, text, boolean, text, boolean, text) from public, anon;
grant execute on function public.save_member_sensitive(uuid, text, boolean, text, boolean, text) to authenticated;

-- Leitura direta (REST) só para o próprio; terceiros leem pela RPC acima, que registra.
drop policy if exists msd_select on public.member_sensitive_data;
create policy msd_select on public.member_sensitive_data for select to authenticated using (public.is_self(member_id));

-- ---------------------------------------------------------------- LGPD-08
-- Arquivos de inscrições anonimizadas pela tarefa automática: o banco não apaga o arquivo do Storage;
-- os caminhos ficam nesta fila e o botão "Limpar antigas" (purge_old_submissions) os devolve para a tela apagar.
create table if not exists public.storage_delete_queue (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  bucket text not null,
  path text not null,
  queued_at timestamptz not null default now()
);
alter table public.storage_delete_queue enable row level security;
revoke all on public.storage_delete_queue from anon, authenticated;

create or replace function public._purge_old_submissions(p_org uuid)
 returns text[]
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_paths text[]; v_ids uuid[];
begin
  select array_agg(id) into v_ids from public.form_submissions
   where organization_id = p_org and purged_at is null and status <> 'approved'
     and ((status in ('rejected', 'archived') and coalesce(reviewed_at, submitted_at) < now() - interval '12 months')
       or (status = 'pending' and submitted_at < now() - interval '6 months'));
  if v_ids is null then return '{}'; end if;
  select array_agg(storage_path) into v_paths from public.form_submission_files where submission_id = any (v_ids);
  delete from public.form_submission_files where submission_id = any (v_ids);
  update public.form_submissions set answers = '{}'::jsonb, applicant_email = null, dedupe_key = null, reviewer_notes = null, purged_at = now(),
         status = case when status = 'pending' then 'archived' else status end where id = any (v_ids);
  insert into public.audit_logs (organization_id, actor_user_id, actor_member_id, action, entity_type, new_data)
  values (p_org, auth.uid(), public.current_member_id(p_org), 'submissions_purged', 'form_submissions', jsonb_build_object('count', cardinality(v_ids)));
  return coalesce(v_paths, '{}');
end $function$;
revoke execute on function public._purge_old_submissions(uuid) from public, anon, authenticated;

create or replace function public.purge_old_submissions(p_org uuid)
 returns text[]
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_paths text[]; v_queued text[];
begin
  if not public.has_permission(p_org, 'forms.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  v_paths := public._purge_old_submissions(p_org);
  with d as (delete from public.storage_delete_queue where organization_id = p_org and bucket = 'form-uploads' returning path)
  select array_agg(path) into v_queued from d;
  return coalesce(v_paths, '{}') || coalesce(v_queued, '{}');
end $function$;

-- ---------------------------------------------------------------- Tarefa diária (LGPD-02, LGPD-03, LGPD-08)
create or replace function public.daily_privacy_maintenance()
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare o record; v_paths text[]; v_backups int; v_audit int; v_subs int := 0;
begin
  -- Backups manuais e importados: 12 meses (os automáticos já giram pelos 20 mais recentes).
  delete from public.backups where kind <> 'auto' and created_at < now() - interval '12 months';
  get diagnostics v_backups = row_count;
  -- Auditoria: 24 meses.
  delete from public.audit_logs where created_at < now() - interval '24 months';
  get diagnostics v_audit = row_count;
  -- Inscrições antigas não aprovadas: mesmos prazos do botão (6 meses pendente, 12 meses recusada/arquivada).
  for o in select id from public.organizations where is_active loop
    v_paths := public._purge_old_submissions(o.id);
    if cardinality(v_paths) > 0 then
      insert into public.storage_delete_queue (organization_id, bucket, path)
      select o.id, 'form-uploads', p from unnest(v_paths) p;
      v_subs := v_subs + cardinality(v_paths);
    end if;
  end loop;
  return jsonb_build_object('backups', v_backups, 'audit_logs', v_audit, 'files_queued', v_subs);
end $function$;
revoke execute on function public.daily_privacy_maintenance() from public, anon, authenticated;

select cron.schedule('daily-privacy-maintenance', '15 6 * * *', 'select public.daily_privacy_maintenance()');
