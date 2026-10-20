-- Ajustes encontrados nos testes dos backups:
-- 1) a ordem das tabelas só considera dependências obrigatórias (chave estrangeira com coluna opcional pode ser preenchida depois);
-- 2) o restaurar inclui colunas de identidade (OVERRIDING SYSTEM VALUE) para o ON CONFLICT achar a linha pela chave e não duplicar.
create or replace function public.backup_table_order() returns text[]
language plpgsql stable set search_path = '' as $$
declare remaining text[]; ordered text[] := '{}'; progress boolean; t text;
begin
  select coalesce(array_agg(c.relname::text order by c.relname), '{}') into remaining
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'organization_id' and not a.attisdropped)
     and c.relname::text <> all (array['backups', 'audit_logs', 'member_invites', 'form_upload_tokens', 'shop_email_outbox', 'integrations']);
  loop
    exit when coalesce(array_length(remaining, 1), 0) = 0;
    progress := false;
    foreach t in array remaining loop
      if not exists (
        select 1 from pg_constraint k join pg_class p on p.oid = k.confrelid
         where k.conrelid = ('public.' || quote_ident(t))::regclass and k.contype = 'f' and k.confrelid <> k.conrelid
           and p.relname::text = any(remaining) and p.relname::text <> t
           and not exists (select 1 from unnest(k.conkey) ck join pg_attribute fa on fa.attrelid = k.conrelid and fa.attnum = ck where fa.attname <> 'organization_id' and not fa.attnotnull)
      ) then
        ordered := ordered || t; remaining := array_remove(remaining, t); progress := true;
      end if;
    end loop;
    if not progress then ordered := ordered || remaining; exit; end if;
  end loop;
  return ordered;
end $$;

create or replace function public.restore_backup(p_backup uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b public.backups; t text; snap jsonb; cols text; pk text; setlist text; tup_t text; tup_e text; ovr text; n bigint; result jsonb := '{}'::jsonb; v_auto uuid;
begin
  select * into b from public.backups where id = p_backup;
  if b.id is null then raise exception 'Backup não encontrado.' using errcode = 'P0002'; end if;
  if not public.has_permission(b.organization_id, 'backups.manage') then raise exception 'Sem permissão para restaurar.' using errcode = '42501'; end if;
  v_auto := public.make_backup(b.organization_id, 'Antes de restaurar: ' || b.label, 'auto');
  snap := b.data -> 'tables';

  if jsonb_array_length(coalesce(snap -> 'organizations', '[]'::jsonb)) > 0 then
    update public.organizations o set theme = r2.theme, logo_path = r2.logo_path
      from jsonb_populate_record(null::public.organizations, snap -> 'organizations' -> 0) r2 where o.id = b.organization_id;
  end if;

  foreach t in array public.backup_table_order() loop
    continue when snap -> t is null or jsonb_array_length(snap -> t) = 0;
    select string_agg(format('%I', a.attname), ', ' order by a.attnum) into cols
      from pg_attribute a where a.attrelid = ('public.' || quote_ident(t))::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = '';
    select string_agg(format('%I', a.attname), ', ' order by array_position(i.indkey::int2[], a.attnum)) into pk
      from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indrelid = ('public.' || quote_ident(t))::regclass and i.indisprimary;
    continue when pk is null;
    select string_agg(format('%1$I = excluded.%1$I', a.attname), ', ') into setlist
      from pg_attribute a where a.attrelid = ('public.' || quote_ident(t))::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
        and a.attname <> all (string_to_array(replace(pk, '"', ''), ', '));
    select string_agg(format('x.%I', a.attname), ', '), string_agg(format('excluded.%I', a.attname), ', ') into tup_t, tup_e
      from pg_attribute a where a.attrelid = ('public.' || quote_ident(t))::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = '';
    ovr := case when exists (select 1 from pg_attribute a where a.attrelid = ('public.' || quote_ident(t))::regclass and a.attidentity = 'a') then 'overriding system value' else '' end;
    if setlist is null then
      execute format('insert into public.%1$I as x (%2$s) %4$s select %2$s from jsonb_populate_recordset(null::public.%1$I, $1) on conflict (%3$s) do nothing', t, cols, pk, ovr) using snap -> t;
    else
      execute format('insert into public.%1$I as x (%2$s) %7$s select %2$s from jsonb_populate_recordset(null::public.%1$I, $1) on conflict (%3$s) do update set %4$s where (%5$s) is distinct from (%6$s)',
                     t, cols, pk, setlist, tup_t, tup_e, ovr) using snap -> t;
    end if;
    get diagnostics n = row_count;
    if n > 0 then result := result || jsonb_build_object(t, n); end if;
  end loop;
  return jsonb_build_object('changed', result, 'auto_backup', v_auto);
end $$;
