import { useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Camera, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button, cn } from '@/components/ui/primitives'
import { confirmBox } from '@/components/shared/DialogHost'
import { friendlyError } from '@/core/errors'
import { useOrganization } from '@/core/organization'
import { initialsOf, neutralTone, removeMemberPhoto, saveMemberPhoto, useMemberPhotos } from './photos'

/** Foto em círculo; sem foto, as iniciais num tom neutro (como o Google). O nome aparece ao lado na tela, então a imagem é decorativa. */
export function MemberAvatar({ memberId, name, className }: { memberId?: string | null; name: string | null | undefined; className?: string }) {
  const photos = useMemberPhotos()
  const url = memberId ? photos.data?.urls.get(memberId) : undefined
  // As iniciais vêm do nome COMPLETO (calculadas no servidor): telas que só têm o nome chamado não mostram iniciais dele.
  const known = memberId ? photos.data?.initials.get(memberId) : undefined
  const tone = neutralTone(memberId ?? name)
  if (url) return <img src={url} alt="" aria-hidden loading="lazy" className={cn('h-9 w-9 shrink-0 rounded-full bg-muted object-cover', className)} />
  return (
    <span aria-hidden className={cn('inline-flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-full text-sm font-bold', className)} style={{ background: tone.bg, color: tone.fg }}>
      {known ?? initialsOf(name)}
    </span>
  )
}

/** Foto grande com Escolher/Trocar e Remover (quem pode editar: a própria pessoa e quem gerencia integrantes). */
export function MemberPhotoEditor({ memberId, name, canEdit }: { memberId: string; name: string | null | undefined; canEdit: boolean }) {
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const photos = useMemberPhotos()
  const fileRef = useRef<HTMLInputElement>(null)
  const has = !!photos.data?.urls.get(memberId)
  const refresh = () => qc.invalidateQueries({ queryKey: ['member-photos', membership?.organization_id] })
  const upload = useMutation({
    mutationFn: (file: File) => saveMemberPhoto(membership!.organization_id, memberId, file),
    onSuccess: () => { toast.success('Foto atualizada.'); refresh() },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const remove = useMutation({
    mutationFn: () => removeMemberPhoto(memberId),
    onSuccess: () => { toast.success('Foto removida.'); refresh() },
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <div className="flex flex-wrap items-center gap-3">
      <MemberAvatar memberId={memberId} name={name} className="h-24 w-24 text-3xl ring-2 ring-border" />
      {canEdit && (
        <div className="space-y-2">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Escolher foto"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = '' }} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={upload.isPending || remove.isPending} onClick={() => fileRef.current?.click()}><Camera className="h-4 w-4" /> {upload.isPending ? 'Enviando' : has ? 'Trocar foto' : 'Escolher foto'}</Button>
            {has && <Button type="button" variant="outline" className="text-destructive" disabled={upload.isPending || remove.isPending}
              onClick={async () => { if (await confirmBox('Remover esta foto?')) remove.mutate() }}><Trash2 className="h-4 w-4" /> Remover</Button>}
          </div>
          <p className="text-xs text-muted-foreground">PNG, JPG ou WebP. A foto é cortada em quadrado e só os integrantes do bloco veem.</p>
        </div>
      )}
    </div>
  )
}
