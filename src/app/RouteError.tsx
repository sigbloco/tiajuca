import { RotateCw, TriangleAlert } from 'lucide-react'
import { isRouteErrorResponse, useRouteError } from 'react-router-dom'

/**
 * Erro inesperado ao montar uma tela: em vez da página em branco, um aviso com "Recarregar" e "Ir para o início".
 * Fica na raiz das rotas (errorElement), então pega o erro de qualquer página do site, da loja e da área dos integrantes.
 */
export function RouteError() {
  const error = useRouteError()
  const notFound = isRouteErrorResponse(error) && error.status === 404
  // Detalhe técnico só no console (ajuda a diagnosticar sem mostrar mensagem crua para quem usa).
  if (!notFound) console.error(error)
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="max-w-md space-y-4 text-center">
        <TriangleAlert className="mx-auto h-10 w-10 text-primary" aria-hidden />
        <h1 className="font-display text-2xl font-extrabold">{notFound ? 'Página não encontrada' : 'Algo deu errado nesta tela'}</h1>
        <p className="text-muted-foreground">
          {notFound ? 'O endereço não existe ou mudou.' : 'Recarregue a página. Se o problema continuar, avise a Direção dizendo o que estava fazendo.'}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground hover:opacity-90" onClick={() => window.location.reload()}>
            <RotateCw className="h-4 w-4" aria-hidden /> Recarregar
          </button>
          <a href="/" className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 font-semibold hover:bg-muted">Ir para o início</a>
        </div>
      </div>
    </div>
  )
}
