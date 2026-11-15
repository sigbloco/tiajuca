-- O próprio integrante vê e cuida dos seus e-mails adicionais (a Direção continua podendo).
drop policy memails_select on public.member_emails;
drop policy memails_insert on public.member_emails;
drop policy memails_delete on public.member_emails;
create policy memails_select on public.member_emails for select to authenticated using (public.is_self(member_id) or public.has_permission(organization_id, 'members.manage'));
create policy memails_insert on public.member_emails for insert to authenticated with check (public.is_self(member_id) or public.has_permission(organization_id, 'members.manage'));
create policy memails_delete on public.member_emails for delete to authenticated using (public.is_self(member_id) or public.has_permission(organization_id, 'members.manage'));

-- Só a Direção muda o status de ciclo dos integrantes: professor e monitor perdem essa permissão.
delete from public.role_permissions rp using public.access_roles ar
 where rp.access_role_id = ar.id and ar.key in ('professor', 'monitor') and rp.permission_key = 'member_cycles.manage';
