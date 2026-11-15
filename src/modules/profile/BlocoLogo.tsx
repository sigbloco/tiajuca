import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload } from 'lucide-react'
import { useRef } from 'react'
import { toast } from 'sonner'
import { OrgLogo } from '@/components/shared/OrgLogo'
import { Button, Card } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId, useOrganization } from '@/core/organization'
import { supabase } from '@/core/supabase'

/** Perfil do bloco: a logo do bloco. O Site usa ela por padrão (e dá para subir outra só para o Site). Salva na hora. */
export function BlocoLogo() {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!/^image\/(svg\+xml|png|jpe?g|webp)$/.test(file.type)) throw new Error('Use uma imagem SVG, PNG, JPG ou WebP.')
      if (file.size > 5 * 1024 * 1024) throw new Error('A imagem passa de 5 MB.')
      const ext = file.type.includes('svg') ? 'svg' : file.type.includes('png') ? 'png' : file.type.includes('webp') ? 'webp' : 'jpg'
      const path = `${orgId}/logo-${Date.now()}.${ext}`
      const up = await supabase.storage.from('site-public').upload(path, file, { contentType: file.type, upsert: false })
      if (up.error) throw up.error
      const url = supabase.storage.from('site-public').getPublicUrl(path).data.publicUrl
      const { error } = await supabase.rpc('set_org_logo', { p_org: orgId, p_path: url })
      if (error) throw error
    },
    onSuccess: () => { toast.success('Logo atualizada.'); for (const k of ['memberships', 'public-site', 'site-settings']) void qc.invalidateQueries({ queryKey: [k] }) },
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <Card className="space-y-3 p-4">
      <h3>Logo do bloco</h3>
      <div className="flex flex-wrap items-center gap-3">
        <OrgLogo name={membership?.name} logoPath={membership?.logo_path} className="h-24 w-24 ring-2 ring-border" />
        <div className="space-y-2">
          <input ref={fileRef} type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp" className="sr-only" aria-label="Escolher logo"
            onChange={(e) => { const file = e.target.files?.[0]; if (file) upload.mutate(file); e.target.value = '' }} />
          <Button type="button" variant="outline" disabled={upload.isPending} onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> {upload.isPending ? 'Enviando' : membership?.logo_path ? 'Trocar logo' : 'Escolher logo'}</Button>
          <p className="text-xs text-muted-foreground">SVG, PNG, JPG ou WebP, até 5 MB. Aparece em círculo no sistema, na loja e no Site (que também aceita outra foto só dele).</p>
        </div>
      </div>
    </Card>
  )
}
