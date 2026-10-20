-- Funções não fixas podem ser excluídas por quem gerencia a estrutura (se houver vínculos, a FK recusa e o app sugere desativar).
grant delete on public.artistic_functions to authenticated;
create policy functions_delete on public.artistic_functions for delete to authenticated using (public.has_permission(organization_id, 'structure.manage') and not is_fixed);
