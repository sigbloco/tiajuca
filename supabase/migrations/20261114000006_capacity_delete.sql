-- Vagas: deixar o limite vazio (sem limite / infinito) apaga a linha do limite, então quem gerencia vagas precisa poder apagar.
create policy capacity_delete on public.instrument_cycle_capacity for delete to authenticated
  using (public.has_permission(organization_id, 'capacity.manage'));
