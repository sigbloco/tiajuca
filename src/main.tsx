import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { Toaster } from 'sonner'
import { DialogHost } from '@/components/shared/DialogHost'
import { router } from '@/app/routes'
import { AuthProvider } from '@/core/auth'
import { startGlueConnectives } from '@/core/glueConnectives'
import { applyCachedTheme } from '@/core/theme'
import { startTrace } from '@/core/trace'
import '@/styles/index.css'

applyCachedTheme()
startTrace()
// Depois de uma publicação nova, um arquivo antigo pode sumir: recarrega uma vez em vez de deixar a tela em branco.
window.addEventListener('vite:preloadError', () => {
  try { if (sessionStorage.getItem('sigbloco:reloaded')) return; sessionStorage.setItem('sigbloco:reloaded', '1') } catch { /* segue */ }
  window.location.reload()
})
startGlueConnectives()

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
        <Toaster position="top-center" richColors />
        <DialogHost />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
