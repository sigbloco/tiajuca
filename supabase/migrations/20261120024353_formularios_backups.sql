-- Etapa 2 da revisão: formulário público e backups.
-- SEG-15: limite de envios por IP (10 por hora no mesmo formulário), além do limite geral de 30/min que já existia.
-- SEG-16: backups antigos voltam a restaurar: colunas criadas depois do backup ficam com o padrão (ou o valor atual)
--         valores que mudaram no esquema são traduzidos (kind 'artistic', categorias por naipe), linhas recriadas com
--         outro id usam o id atual, e o erro diz qual tabela falhou. Testado (transação desfeita) com os 4 backups de 15/11.

-- ---------------------------------------------------------------- SEG-15
create table if not exists public.form_submit_attempts (
  id bigint generated always as identity primary key,
  form_id uuid not null references public.forms(id) on delete cascade,
  ip_hash text not null,
  at timestamptz not null default now()
);
create index if not exists form_submit_attempts_lookup on public.form_submit_attempts (form_id, ip_hash, at);
create index if not exists form_submit_attempts_at on public.form_submit_attempts (at);
alter table public.form_submit_attempts enable row level security;
revoke all on public.form_submit_attempts from anon, authenticated;

-- IP de quem chamou a API (Cloudflare põe cf-connecting-ip; sem cabeçalho, nulo e o limite por IP não se aplica).
create or replace function public.request_ip()
 returns text
 language sql
 stable
 set search_path to ''
as $function$
  select nullif(btrim(coalesce(
    h ->> 'cf-connecting-ip',
    h ->> 'x-real-ip',
    split_part(h ->> 'x-forwarded-for', ',', 1)
  )), '')
  from (select coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb as h) x
$function$;
revoke execute on function public.request_ip() from public, anon, authenticated;

create or replace function public.trg_form_submission_ip_limit()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_ip text; v_hash text;
begin
  v_ip := public.request_ip();
  if v_ip is null then return new; end if;
  v_hash := encode(sha256(convert_to(new.form_id::text || '|' || v_ip, 'UTF8')), 'hex'); -- não guarda o IP em si
  delete from public.form_submit_attempts where at < now() - interval '1 day';
  if (select count(*) from public.form_submit_attempts where form_id = new.form_id and ip_hash = v_hash and at > now() - interval '1 hour') >= 10 then
    raise exception 'Muitos envios a partir desta conexão. Tente novamente mais tarde.' using errcode = 'P0001';
  end if;
  insert into public.form_submit_attempts (form_id, ip_hash) values (new.form_id, v_hash);
  return new;
end $function$;
revoke execute on function public.trg_form_submission_ip_limit() from public, anon, authenticated;

drop trigger if exists trg_form_submission_ip_limit on public.form_submissions;
create trigger trg_form_submission_ip_limit before insert on public.form_submissions
  for each row execute function public.trg_form_submission_ip_limit();

-- ---------------------------------------------------------------- SEG-16
-- Traduz valores de esquemas antigos dentro do snapshot. Acrescente aqui cada mudança de valor permitido ou regra nova.
create or replace function public.backup_upgrade_tables(p_tables jsonb)
 returns jsonb
 language plpgsql
 stable
 set search_path to ''
as $function$
declare v jsonb := p_tables;
begin
  -- 20261119000003/06 (categorias por naipe): no ciclo atual e nos futuros, categoria de outro naipe é barrada.
  -- Atribuição antiga em categoria de outro naipe passa para a categoria do mesmo Tipo do naipe da pessoa (o que a reclassificação fez).
  if jsonb_typeof(v -> 'cycle_fee_assignments') = 'array' then
    v := jsonb_set(v, '{cycle_fee_assignments}', (
      select coalesce(jsonb_agg(case when alt.id is not null then jsonb_set(fa, '{fee_category_id}', to_jsonb(alt.id)) else fa end), '[]'::jsonb)
        from jsonb_array_elements(v -> 'cycle_fee_assignments') fa
        left join public.cycles cy on cy.id = (fa ->> 'cycle_id')::uuid and cy.ends_on >= current_date
        left join public.fee_categories fc on fc.id = (fa ->> 'fee_category_id')::uuid and cy.id is not null
        left join lateral (
          select coalesce(array_agg(distinct coalesce(i.section_id, af.section_id)) filter (where coalesce(i.section_id, af.section_id) is not null), '{}') as secs
            from jsonb_array_elements(coalesce(v -> 'cycle_participations', '[]'::jsonb)) cp
            left join public.instruments i on i.id = (cp ->> 'instrument_id')::uuid
            left join public.artistic_functions af on af.id = (cp ->> 'function_id')::uuid
           where cp ->> 'member_id' = fa ->> 'member_id' and cp ->> 'cycle_id' = fa ->> 'cycle_id') ms on fc.id is not null
        left join lateral (
          select x.id from public.fee_categories x
           where fc.section_id is not null and fc.base_key is not null and cardinality(ms.secs) > 0 and not (fc.section_id = any (ms.secs))
             and x.organization_id = fc.organization_id and x.base_key = fc.base_key and x.section_id = any (ms.secs)
           order by x.name limit 1) alt on true));
  end if;
  -- Mesma regra na tabela antiga (member_fee_assignments): o gatilho de sincronização a copia para o ciclo atual.
  if jsonb_typeof(v -> 'member_fee_assignments') = 'array' then
    v := jsonb_set(v, '{member_fee_assignments}', (
      select coalesce(jsonb_agg(case when alt.id is not null then jsonb_set(fa, '{fee_category_id}', to_jsonb(alt.id)) else fa end), '[]'::jsonb)
        from jsonb_array_elements(v -> 'member_fee_assignments') fa
        left join public.fee_categories fc on fc.id = (fa ->> 'fee_category_id')::uuid and fa ->> 'valid_to' is null
        left join lateral (
          select coalesce(array_agg(distinct coalesce(i.section_id, af.section_id)) filter (where coalesce(i.section_id, af.section_id) is not null), '{}') as secs
            from jsonb_array_elements(coalesce(v -> 'cycle_participations', '[]'::jsonb)) cp
            join public.cycles cy on cy.id = (cp ->> 'cycle_id')::uuid and cy.is_current
            left join public.instruments i on i.id = (cp ->> 'instrument_id')::uuid
            left join public.artistic_functions af on af.id = (cp ->> 'function_id')::uuid
           where cp ->> 'member_id' = fa ->> 'member_id') ms on fc.id is not null
        left join lateral (
          select x.id from public.fee_categories x
           where fc.section_id is not null and fc.base_key is not null and cardinality(ms.secs) > 0 and not (fc.section_id = any (ms.secs))
             and x.organization_id = fc.organization_id and x.base_key = fc.base_key and x.section_id = any (ms.secs)
           order by x.name limit 1) alt on true));
  end if;
  -- 20261113000003_function_kinds: kind 'artistic' virou 'collab' (Regência) ou 'payer' (demais).
  if jsonb_typeof(v -> 'artistic_functions') = 'array' then
    v := jsonb_set(v, '{artistic_functions}', (
      select coalesce(jsonb_agg(case when f ->> 'kind' = 'artistic'
                                     then jsonb_set(f, '{kind}', to_jsonb(case when lower(f ->> 'name') in ('regência', 'regencia') then 'collab' else 'payer' end))
                                     else f end), '[]'::jsonb)
        from jsonb_array_elements(v -> 'artistic_functions') f));
  end if;
  return v;
end $function$;
revoke execute on function public.backup_upgrade_tables(jsonb) from public, anon, authenticated;

-- Linhas por pessoa recriadas com outro id depois do backup (ex.: o gatilho de sincronização do ciclo atual recria a
-- atribuição quando a tabela antiga é restaurada): a linha do backup passa a usar o id atual da mesma pessoa + chave,
-- em vez de bater na restrição de unicidade. Roda na hora de restaurar cada tabela. Só tabelas que nenhuma outra referencia.
create or replace function public.backup_remap_ids(p_table text, p_rows jsonb)
 returns jsonb
 language plpgsql
 stable
 set search_path to ''
as $function$
declare v_rel regclass; v_keys text[]; v_pred text; v_cond text; v_rows jsonb := p_rows;
begin
  if jsonb_typeof(p_rows) <> 'array' then return p_rows; end if;
  v_rel := ('public.' || quote_ident(p_table))::regclass;
  -- Tabela referenciada por outra, ou sem coluna id: trocar o id quebraria vínculos; fica como está.
  if exists (select 1 from pg_constraint where contype = 'f' and confrelid = v_rel)
     or not exists (select 1 from pg_attribute where attrelid = v_rel and attname = 'id' and not attisdropped) then
    return p_rows;
  end if;
  -- Cada chave única "natural" (colunas simples, sem o id). Índice parcial (ex.: "uma atribuição aberta por pessoa"):
  -- a condição tem de valer tanto na linha atual quanto na do backup.
  for v_keys, v_pred in
    select array_agg(a.attname::text order by k.ord), pg_get_expr(i.indpred, i.indrelid)
      from pg_index i
      cross join lateral unnest(i.indkey::int2[]) with ordinality k(attnum, ord)
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
     where i.indrelid = v_rel and i.indisunique and not i.indisprimary and i.indexprs is null
     group by i.indexrelid, i.indpred, i.indrelid
    having not ('id' = any (array_agg(a.attname::text)))
  loop
    select string_agg(format('x.%1$I::text = r ->> %1$L', c), ' and ') into v_cond from unnest(v_keys) c;
    if v_pred is not null then
      v_cond := v_cond || format(' and (%1$s) and exists (select 1 from jsonb_populate_record(null::public.%2$I, r) where %1$s)', v_pred, p_table);
    end if;
    execute format('select coalesce(jsonb_agg(case when x.id is not null then r || jsonb_build_object(''id'', x.id) else r end), ''[]''::jsonb)
                      from jsonb_array_elements($1) r
                      left join lateral (select x.id from public.%1$I x where %2$s and x.id::text <> r ->> ''id'' limit 1) x on true',
                   p_table, v_cond) into v_rows using v_rows;
  end loop;
  return v_rows;
end $function$;
revoke execute on function public.backup_remap_ids(text, jsonb) from public, anon, authenticated;

create or replace function public.restore_backup(p_backup uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare b public.backups; t text; snap jsonb; cols text; pk text; setlist text; tup_t text; tup_e text; ovr text; n bigint; result jsonb := '{}'::jsonb; v_auto uuid;
  skip_tables constant text[] := array['access_roles', 'role_permissions', 'member_access_roles'];
  v_skip_cols text[]; v_keys text[]; v_rel regclass;
begin
  select * into b from public.backups where id = p_backup;
  if b.id is null then raise exception 'Backup não encontrado.' using errcode = 'P0002'; end if;
  if not public.has_permission(b.organization_id, 'backups.manage') then raise exception 'Sem permissão para restaurar.' using errcode = '42501'; end if;
  v_auto := public.make_backup(b.organization_id, 'Antes de restaurar: ' || b.label, 'auto');
  snap := public.backup_upgrade_tables(b.data -> 'tables');

  if jsonb_array_length(coalesce(snap -> 'organizations', '[]'::jsonb)) > 0 then
    update public.organizations o set theme = r2.theme, logo_path = r2.logo_path
      from jsonb_populate_record(null::public.organizations, snap -> 'organizations' -> 0) r2 where o.id = b.organization_id;
  end if;

  foreach t in array public.backup_table_order() loop
    continue when t = any (skip_tables);
    continue when snap -> t is null or jsonb_array_length(snap -> t) = 0;
    v_rel := ('public.' || quote_ident(t))::regclass;
    snap := jsonb_set(snap, array[t], public.backup_remap_ids(t, snap -> t));
    v_skip_cols := case when t = 'members' then array['user_id'] else array[]::text[] end;
    -- Só as colunas que existem no backup: coluna criada depois fica com o padrão (linha nova) ou com o valor atual.
    select array_agg(distinct k) into v_keys from jsonb_array_elements(snap -> t) r, jsonb_object_keys(r) k;
    select string_agg(format('%I', a.attname), ', ' order by a.attnum) into cols
      from pg_attribute a where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
        and a.attname <> all (v_skip_cols) and a.attname = any (v_keys);
    select string_agg(format('%I', a.attname), ', ' order by array_position(i.indkey::int2[], a.attnum)) into pk
      from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indrelid = v_rel and i.indisprimary;
    continue when pk is null or cols is null;
    select string_agg(format('%1$I = excluded.%1$I', a.attname), ', ') into setlist
      from pg_attribute a where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
        and a.attname <> all (string_to_array(replace(pk, '"', ''), ', ')) and a.attname <> all (v_skip_cols) and a.attname = any (v_keys);
    select string_agg(format('x.%I', a.attname), ', '), string_agg(format('excluded.%I', a.attname), ', ') into tup_t, tup_e
      from pg_attribute a where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
        and a.attname <> all (v_skip_cols) and a.attname = any (v_keys);
    ovr := case when exists (select 1 from pg_attribute a where a.attrelid = v_rel and a.attidentity = 'a') then 'overriding system value' else '' end;
    begin
      if setlist is null then
        execute format('insert into public.%1$I as x (%2$s) %4$s select %2$s from jsonb_populate_recordset(null::public.%1$I, $1) r where r.organization_id = $2 on conflict (%3$s) do nothing', t, cols, pk, ovr)
          using snap -> t, b.organization_id;
      else
        execute format('insert into public.%1$I as x (%2$s) %7$s select %2$s from jsonb_populate_recordset(null::public.%1$I, $1) r where r.organization_id = $2 on conflict (%3$s) do update set %4$s where x.organization_id = $2 and (%5$s) is distinct from (%6$s)',
                       t, cols, pk, setlist, tup_t, tup_e, ovr) using snap -> t, b.organization_id;
      end if;
      get diagnostics n = row_count;
    exception when others then
      raise exception 'Não foi possível restaurar "%": %. Nada foi alterado.', t, sqlerrm using errcode = 'P0001';
    end;
    if n > 0 then result := result || jsonb_build_object(t, n); end if;
  end loop;
  return jsonb_build_object('changed', result, 'auto_backup', v_auto);
end $function$;
