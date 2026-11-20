-- Etapa 1 da revisão (SEG-01, SEG-02, SEG-03). AINDA NÃO APLICADA: o usuário precisa ver este SQL antes.

-- SEG-01: uma concessão de papel não muda de papel, pessoa ou organização, e papel revogado não "desrevoga" por UPDATE.
-- A interface usa só as RPCs (grant/revoke/transfer), que inserem linhas novas e só preenchem revoked_at.
create or replace function public.guard_member_role_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.access_role_id is distinct from old.access_role_id or new.member_id is distinct from old.member_id
     or new.organization_id is distinct from old.organization_id then
    raise exception 'Papel, pessoa e organização de uma concessão não mudam. Revogue e conceda de novo.' using errcode = 'P0001';
  end if;
  if old.revoked_at is not null and new.revoked_at is null then
    raise exception 'Papel revogado não volta por edição. Conceda de novo.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_member_role_identity on public.member_access_roles;
create trigger trg_guard_member_role_identity before update on public.member_access_roles
  for each row execute function public.guard_member_role_identity();

-- SEG-02: a conta de acesso (user_id) de um cadastro não muda por chamada direta ao banco (REST).
-- SECURITY INVOKER de propósito: dentro das RPCs (dono postgres) current_user é postgres e o vínculo continua
-- funcionando (link_my_member_by_email, claim_member, approve_submission, bootstrap_first_director); pela API é 'authenticated'.
create or replace function public.guard_member_user_link() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' and new.user_id is not null then
    raise exception 'A conta de acesso só é vinculada pelo próprio integrante.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'A conta de acesso só é vinculada pelo próprio integrante.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_member_user_link on public.members;
create trigger trg_guard_member_user_link before insert or update of user_id on public.members
  for each row execute function public.guard_member_user_link();

-- SEG-02/SEG-03: members.manage e backups.manage passam a ser exclusivas da Direção/Titular (decisão do usuário em 19/11/2026).
create or replace function public.locked_permissions() returns text[]
language sql immutable set search_path = '' as $$
  select array['org.manage', 'settings.manage', 'roles.manage', 'audit.read', 'members.sensitive.read', 'members.sensitive.manage',
               'finance.read', 'finance.manage', 'billing.manage', 'scholarships.manage', 'staff_payments.manage', 'staff_assignments.manage', 'forms.manage',
               'members.manage', 'backups.manage']
$$;

-- SEG-03: baixar o conteúdo de um backup exige também ler dados sensíveis (o backup inclui member_sensitive_data).
create or replace function public.get_backup_data(p_backup uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare b public.backups;
begin
  select * into b from public.backups where id = p_backup;
  if b.id is null then raise exception 'Backup não encontrado.' using errcode = 'P0002'; end if;
  if not (public.has_permission(b.organization_id, 'backups.manage') and public.has_permission(b.organization_id, 'members.sensitive.read')) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  return b.data;
end $$;

-- SEG-03: o restore só escreve linhas da própria organização (na inserção e na atualização), não toca nas tabelas de
-- controle de acesso e nunca reescreve a conta de acesso (members.user_id). Quem perder o vínculo é religado pelo e-mail.
create or replace function public.restore_backup(p_backup uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b public.backups; t text; snap jsonb; cols text; pk text; setlist text; tup_t text; tup_e text; ovr text; n bigint; result jsonb := '{}'::jsonb; v_auto uuid;
  skip_tables constant text[] := array['access_roles', 'role_permissions', 'member_access_roles'];
  v_skip_cols text[];
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
    continue when t = any (skip_tables);
    continue when snap -> t is null or jsonb_array_length(snap -> t) = 0;
    v_skip_cols := case when t = 'members' then array['user_id'] else array[]::text[] end;
    select string_agg(format('%I', a.attname), ', ' order by a.attnum) into cols
      from pg_attribute a where a.attrelid = ('public.' || quote_ident(t))::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
        and a.attname <> all (v_skip_cols);
    select string_agg(format('%I', a.attname), ', ' order by array_position(i.indkey::int2[], a.attnum)) into pk
      from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indrelid = ('public.' || quote_ident(t))::regclass and i.indisprimary;
    continue when pk is null;
    select string_agg(format('%1$I = excluded.%1$I', a.attname), ', ') into setlist
      from pg_attribute a where a.attrelid = ('public.' || quote_ident(t))::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
        and a.attname <> all (string_to_array(replace(pk, '"', ''), ', ')) and a.attname <> all (v_skip_cols);
    select string_agg(format('x.%I', a.attname), ', '), string_agg(format('excluded.%I', a.attname), ', ') into tup_t, tup_e
      from pg_attribute a where a.attrelid = ('public.' || quote_ident(t))::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
        and a.attname <> all (v_skip_cols);
    ovr := case when exists (select 1 from pg_attribute a where a.attrelid = ('public.' || quote_ident(t))::regclass and a.attidentity = 'a') then 'overriding system value' else '' end;
    if setlist is null then
      execute format('insert into public.%1$I as x (%2$s) %4$s select %2$s from jsonb_populate_recordset(null::public.%1$I, $1) r where r.organization_id = $2 on conflict (%3$s) do nothing', t, cols, pk, ovr)
        using snap -> t, b.organization_id;
    else
      execute format('insert into public.%1$I as x (%2$s) %7$s select %2$s from jsonb_populate_recordset(null::public.%1$I, $1) r where r.organization_id = $2 on conflict (%3$s) do update set %4$s where x.organization_id = $2 and (%5$s) is distinct from (%6$s)',
                     t, cols, pk, setlist, tup_t, tup_e, ovr) using snap -> t, b.organization_id;
    end if;
    get diagnostics n = row_count;
    if n > 0 then result := result || jsonb_build_object(t, n); end if;
  end loop;
  return jsonb_build_object('changed', result, 'auto_backup', v_auto);
end $$;
