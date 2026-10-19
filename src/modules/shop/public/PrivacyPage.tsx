import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/primitives'
import { buildPrivacyNotice } from '../privacy'
import { useStore } from './StoreContext'

/** Aviso de privacidade da loja (LGPD). */
export function PrivacyPage() {
  const { store, basePath } = useStore()
  const sections = buildPrivacyNotice(store.org.name, store.contact, store.privacy_retention_years)
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1>Aviso de privacidade</h1>
      {sections.map((s) => (
        <Card key={s.title} className="space-y-2 p-5">
          <h2 className="text-lg font-bold">{s.title}</h2>
          {s.paragraphs.map((p) => <p key={p} className="text-sm">{p}</p>)}
        </Card>
      ))}
      <Link className="block text-center font-semibold text-primary hover:underline" to={basePath}>Voltar à loja</Link>
    </div>
  )
}
