-- Trazida do banco (DRIFT-01): aplicada pelo editor em 20/10/2026 sem arquivo no repositório.
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
    -- Colunas geradas ficam de fora; colunas de identidade entram (com OVERRIDING SYSTEM VALUE) para o ON CONFLICT achar a linha pela chave.
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
