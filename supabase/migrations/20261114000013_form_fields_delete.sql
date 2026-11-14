-- Apagar campo ou seção do formulário (o editor apaga a linha do campo; versões publicadas guardam sua própria cópia).
grant delete on public.form_fields to authenticated;
create policy ff_delete on public.form_fields for delete to authenticated
  using (public.has_permission(organization_id, 'forms.manage'));
