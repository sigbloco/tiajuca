import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { friendlyError } from './errors'
import { supabase } from './supabase'

/** Exclui de vez um item que já está na lixeira (o banco confere permissão e se ele está mesmo na lixeira). */
export async function purgeTrashed(table: string, id: string) {
  const { error } = await supabase.rpc('purge_trashed', { p_table: table, p_id: id })
  if (error) throw error
}

/** Mensagem para quem tentou excluir de vez: com registros ligados (histórico, pedidos, pessoas) o item fica na lixeira. */
export function purgeErrorMessage(e: unknown): string {
  return /foreign key|violates|23503/i.test(`${String((e as Error)?.message ?? e)} ${JSON.stringify(e)}`)
    ? 'Há registros ligados a este item (histórico, pedidos, pessoas…). Ele não pode ser excluído de vez e continua na lixeira.'
    : friendlyError(e)
}

/** Mutação pronta de "Excluir de vez" para uma tabela: atualiza as telas e explica quando não dá (registros ligados). */
export function usePurge(table: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => purgeTrashed(table, id),
    onSuccess: () => { toast.success('Excluído de vez.'); void qc.invalidateQueries() },
    onError: (e) => toast.error(purgeErrorMessage(e)),
  })
}
