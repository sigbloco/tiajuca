-- Trazida do banco (DRIFT-01): aplicada pelo editor em 15/11/2026 sem arquivo no repositório.
drop policy memails_select on public.member_emails;
drop policy memails_insert on public.member_emails;
drop policy memails_delete on public.member_emails;
create policy memails_select on public.member_emails for select to authenticated using (public.is_self(member_id) or public.has_permission(organization_id, 'members.manage'));
create policy memails_insert on public.member_emails for insert to authenticated with check (public.is_self(member_id) or public.has_permission(organization_id, 'members.manage'));
create policy memails_delete on public.member_emails for delete to authenticated using (public.is_self(member_id) or public.has_permission(organization_id, 'members.manage'));
