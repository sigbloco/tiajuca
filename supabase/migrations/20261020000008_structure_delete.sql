-- Naipes, subnaipes e instrumentos podem ser excluídos por quem gerencia a estrutura. Se já houver vínculos (pessoas, vagas, músicas…), o banco recusa pela FK e o app sugere desativar.
grant delete on public.sections, public.subsections, public.instruments to authenticated;
create policy sections_delete on public.sections for delete to authenticated using (public.has_permission(organization_id, 'structure.manage'));
create policy subsections_delete on public.subsections for delete to authenticated using (public.has_permission(organization_id, 'structure.manage'));
create policy instruments_delete on public.instruments for delete to authenticated using (public.has_permission(organization_id, 'structure.manage'));
