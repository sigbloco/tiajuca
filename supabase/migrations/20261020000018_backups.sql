-- Backups da organização: instantâneo lógico (JSON) das tabelas do bloco, guardado no banco e acessível só por funções com a permissão backups.manage.
-- Restaurar = reinserir/atualizar as linhas do backup pela chave primária (nunca apaga o que foi criado depois). Antes de restaurar e antes de qualquer
-- "apagar tudo isso" o sistema gera um backup automático.

insert into public.permissions (key, module, description) values
  ('backups.manage', 'auditoria', 'Criar, baixar, carregar e restaurar backups')
on conflict (key) do nothing;
insert into public.role_permissions (access_role_id, permission_key, scope)
select ar.id, 'backups.manage', 'org' from public.access_roles ar where ar.key in ('direcao', 'titular')
on conflict do nothing;

create table public.backups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  label text not null check (length(trim(label)) > 0),
  kind text not null check (kind in ('manual', 'auto', 'imported')),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  size_bytes bigint not null default 0,
  table_counts jsonb not null default '{}'::jsonb,
  data jsonb not null
);
create index backups_org_idx on public.backups (organization_id, created_at desc);
alter table public.backups enable row level security;
revoke all on public.backups from anon, authenticated; -- sem políticas: só as funções abaixo (security definer) tocam nesta tabela

-- Tabelas do bloco que entram no backup, em ordem segura para reinserir (pais antes dos filhos).
-- Ficam de fora: o próprio backup, o log de auditoria, convites/tokens e a fila de e-mails (volumosos ou sensíveis demais/descartáveis).
create or replace function public.backup_table_order() returns text[]
language plpgsql stable set search_path = '' as $$
declare remaining text[]; ordered text[] := '{}'; progress boolean; t text;
begin
  select coalesce(array_agg(c.relname::text order by c.relname), '{}') into remaining
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'organization_id' and not a.attisdropped)
     and c.relname <> all (array['backups', 'audit_logs', 'member_invites', 'form_upload_tokens', 'shop_email_outbox', 'integrations']);
  loop
    exit when coalesce(array_length(remaining, 1), 0) = 0;
    progress := false;
    foreach t in array remaining loop
      if not exists (
        select 1 from pg_constraint k join pg_class p on p.oid = k.confrelid
         where k.conrelid = ('public.' || quote_ident(t))::regclass and k.contype = 'f' and k.confrelid <> k.conrelid
           and p.relname::text = any(remaining) and p.relname::text <> t
      ) then
        ordered := ordered || t; remaining := array_remove(remaining, t); progress := true;
      end if;
    end loop;
    if not progress then ordered := ordered || remaining; exit; end if; -- ciclo de dependências: segue na ordem restante
  end loop;
  return ordered;
end $$;

-- Gera e guarda o instantâneo. Interna: não é chamável pelo navegador.
create or replace function public.make_backup(p_org uuid, p_label text, p_kind text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare t text; rows jsonb; snap jsonb := '{}'::jsonb; counts jsonb := '{}'::jsonb; v_id uuid; v_old int;
begin
  select coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb) into rows from public.organizations o where o.id = p_org;
  snap := jsonb_build_object('organizations', rows);
  foreach t in array public.backup_table_order() loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x where x.organization_id = $1', t) into rows using p_org;
    snap := snap || jsonb_build_object(t, rows);
    counts := counts || jsonb_build_object(t, jsonb_array_length(rows));
  end loop;
  snap := jsonb_build_object('meta', jsonb_build_object('version', 1, 'organization_id', p_org, 'created_at', now()), 'tables', snap);
  insert into public.backups (organization_id, label, kind, size_bytes, table_counts, data)
  values (p_org, left(trim(p_label), 200), p_kind, octet_length(snap::text), counts, snap) returning id into v_id;
  -- Automáticos: guarda os 20 mais recentes.
  if p_kind = 'auto' then
    delete from public.backups where organization_id = p_org and kind = 'auto'
      and id not in (select id from public.backups where organization_id = p_org and kind = 'auto' order by created_at desc limit 20);
  end if;
  return v_id;
end $$;
revoke all on function public.make_backup(uuid, text, text) from public, anon, authenticated;

create or replace function public.create_backup(p_org uuid, p_label text) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_permission(p_org, 'backups.manage') then raise exception 'Sem permissão para criar backups.' using errcode = '42501'; end if;
  return public.make_backup(p_org, coalesce(nullif(trim(p_label), ''), 'Backup manual'), 'manual');
end $$;
revoke all on function public.create_backup(uuid, text) from public, anon;
grant execute on function public.create_backup(uuid, text) to authenticated;

create or replace function public.list_backups(p_org uuid) returns table (id uuid, label text, kind text, created_at timestamptz, created_by_name text, size_bytes bigint, table_counts jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_permission(p_org, 'backups.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  return query
    select b.id, b.label, b.kind, b.created_at,
           (select coalesce(m.display_name, m.full_name) from public.members m where m.user_id = b.created_by and m.organization_id = p_org limit 1),
           b.size_bytes, b.table_counts
      from public.backups b where b.organization_id = p_org order by b.created_at desc;
end $$;
revoke all on function public.list_backups(uuid) from public, anon;
grant execute on function public.list_backups(uuid) to authenticated;

create or replace function public.get_backup_data(p_backup uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare b public.backups;
begin
  select * into b from public.backups where id = p_backup;
  if b.id is null then raise exception 'Backup não encontrado.' using errcode = 'P0002'; end if;
  if not public.has_permission(b.organization_id, 'backups.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  return b.data;
end $$;
revoke all on function public.get_backup_data(uuid) from public, anon;
grant execute on function public.get_backup_data(uuid) to authenticated;

create or replace function public.delete_backup(p_backup uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.backups where id = p_backup;
  if v_org is null then raise exception 'Backup não encontrado.' using errcode = 'P0002'; end if;
  if not public.has_permission(v_org, 'backups.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  delete from public.backups where id = p_backup;
end $$;
revoke all on function public.delete_backup(uuid) from public, anon;
grant execute on function public.delete_backup(uuid) to authenticated;

-- Carregar um arquivo de backup (baixado antes): entra na lista como "importado"; depois é só restaurar.
create or replace function public.import_backup(p_org uuid, p_label text, p_data jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; counts jsonb := '{}'::jsonb; t text;
begin
  if not public.has_permission(p_org, 'backups.manage') then raise exception 'Sem permissão para carregar backups.' using errcode = '42501'; end if;
  if (p_data -> 'meta' ->> 'organization_id')::uuid is distinct from p_org or jsonb_typeof(p_data -> 'tables') <> 'object' then
    raise exception 'Este arquivo não é um backup válido deste bloco.' using errcode = 'P0001';
  end if;
  for t in select jsonb_object_keys(p_data -> 'tables') loop
    counts := counts || jsonb_build_object(t, jsonb_array_length(p_data -> 'tables' -> t));
  end loop;
  insert into public.backups (organization_id, label, kind, size_bytes, table_counts, data)
  values (p_org, left(coalesce(nullif(trim(p_label), ''), 'Backup carregado'), 200), 'imported', octet_length(p_data::text), counts, p_data) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.import_backup(uuid, text, jsonb) from public, anon;
grant execute on function public.import_backup(uuid, text, jsonb) to authenticated;

-- Restaura: gera antes um backup automático e reinsere/atualiza cada linha do backup pela chave primária (só quando difere). Nada é apagado.
create or replace function public.restore_backup(p_backup uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b public.backups; t text; snap jsonb; cols text; pk text; setlist text; tup_t text; tup_e text; n bigint; result jsonb := '{}'::jsonb; v_auto uuid; r jsonb;
begin
  select * into b from public.backups where id = p_backup;
  if b.id is null then raise exception 'Backup não encontrado.' using errcode = 'P0002'; end if;
  if not public.has_permission(b.organization_id, 'backups.manage') then raise exception 'Sem permissão para restaurar.' using errcode = '42501'; end if;
  v_auto := public.make_backup(b.organization_id, 'Antes de restaurar: ' || b.label, 'auto');
  snap := b.data -> 'tables';

  -- Aparência do bloco (tema e logo).
  if jsonb_array_length(coalesce(snap -> 'organizations', '[]'::jsonb)) > 0 then
    update public.organizations o set theme = r2.theme, logo_path = r2.logo_path
      from jsonb_populate_record(null::public.organizations, snap -> 'organizations' -> 0) r2 where o.id = b.organization_id;
  end if;

  foreach t in array public.backup_table_order() loop
    continue when snap -> t is null or jsonb_array_length(snap -> t) = 0;
    select string_agg(format('%I', a.attname), ', ' order by a.attnum) into cols
      from pg_attribute a where a.attrelid = ('public.' || quote_ident(t))::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = '' and a.attidentity <> 'a';
    select string_agg(format('%I', a.attname), ', ' order by array_position(i.indkey::int2[], a.attnum)) into pk
      from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indrelid = ('public.' || quote_ident(t))::regclass and i.indisprimary;
    continue when pk is null;
    select string_agg(format('%1$I = excluded.%1$I', a.attname), ', ') into setlist
      from pg_attribute a where a.attrelid = ('public.' || quote_ident(t))::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = '' and a.attidentity <> 'a'
        and a.attname <> all (string_to_array(replace(pk, '"', ''), ', '));
    select string_agg(format('x.%I', a.attname), ', '), string_agg(format('excluded.%I', a.attname), ', ') into tup_t, tup_e
      from pg_attribute a where a.attrelid = ('public.' || quote_ident(t))::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = '' and a.attidentity <> 'a';
    if setlist is null then
      execute format('insert into public.%1$I as x (%2$s) select %2$s from jsonb_populate_recordset(null::public.%1$I, $1) on conflict (%3$s) do nothing', t, cols, pk) using snap -> t;
    else
      execute format('insert into public.%1$I as x (%2$s) select %2$s from jsonb_populate_recordset(null::public.%1$I, $1) on conflict (%3$s) do update set %4$s where (%5$s) is distinct from (%6$s)',
                     t, cols, pk, setlist, tup_t, tup_e) using snap -> t;
    end if;
    get diagnostics n = row_count;
    if n > 0 then result := result || jsonb_build_object(t, n); end if;
  end loop;
  return jsonb_build_object('changed', result, 'auto_backup', v_auto);
end $$;
revoke all on function public.restore_backup(uuid) from public, anon;
grant execute on function public.restore_backup(uuid) to authenticated;

-- Apagar um ciclo com tudo que depende dele gera antes um backup automático.
create or replace function public.delete_cycle_cascade(p_cycle uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_name text;
begin
  select organization_id, name into v_org, v_name from public.cycles where id = p_cycle;
  if v_org is null then raise exception 'Ciclo não encontrado.' using errcode = 'P0002'; end if;
  if not public.has_permission(v_org, 'cycles.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  perform public.make_backup(v_org, 'Antes de apagar o ciclo ' || v_name, 'auto');
  delete from public.event_attendance where activity_id in (select id from public.activities where cycle_id = p_cycle);
  delete from public.activity_checklist_items where activity_id in (select id from public.activities where cycle_id = p_cycle);
  delete from public.activities where cycle_id = p_cycle;
  delete from public.form_submissions where form_id in (select id from public.forms where cycle_id = p_cycle);
  delete from public.form_fields where form_id in (select id from public.forms where cycle_id = p_cycle);
  delete from public.form_versions where form_id in (select id from public.forms where cycle_id = p_cycle);
  delete from public.forms where cycle_id = p_cycle;
  delete from public.instrument_cycle_capacity where cycle_id = p_cycle;
  delete from public.reactivation_requests where cycle_id = p_cycle;
  delete from public.member_cycle_status_history where member_cycle_id in (select id from public.member_cycles where cycle_id = p_cycle);
  delete from public.member_cycles where cycle_id = p_cycle;
  delete from public.cycles where id = p_cycle;
end $$;
