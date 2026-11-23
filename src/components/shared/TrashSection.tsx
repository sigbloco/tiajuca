import { TrashGroup } from './TrashGroup'
import type { TrashEntry } from './trash'

export { PAGE_SIZE, ShowMore, usePaged } from './Paged'

/** Lixeira da página (compatibilidade): é o grupo padrão `TrashGroup`. */
export function TrashSection({ entries, onRestore, onPurge }: { entries: TrashEntry[]; onRestore: (id: string) => void; onPurge?: (id: string) => void }) {
  return <TrashGroup entries={entries} onRestore={onRestore} onPurge={onPurge} />
}
