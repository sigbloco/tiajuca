-- Trazida do banco (DRIFT-01): aplicada pelo editor em 20/10/2026 sem arquivo no repositório.
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
      -- Só contam as dependências obrigatórias: chave estrangeira com coluna opcional (fora organization_id) pode ser preenchida depois.
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
