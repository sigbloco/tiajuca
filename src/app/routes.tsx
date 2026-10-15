import { Navigate, Outlet, createBrowserRouter, useParams } from 'react-router-dom'
import { Skeleton } from '@/components/ui/primitives'
import { useAuth } from '@/core/auth'
import { OrganizationProvider, useMemberships, useOrganization } from '@/core/organization'
import { isSupabaseConfigured } from '@/core/supabase'
import { ClaimInvitePage, ForgotPasswordPage, LoginPage, NoOrganizationPage, ResetPasswordPage, SignupPage, VerifyEmailPage } from '@/modules/auth/pages'
import { HomePage } from '@/modules/dashboard/HomePage'
import { MembersPage } from '@/modules/members/MembersPage'
import { AppShell } from './AppShell'

const Loading = () => <div className="p-8"><Skeleton className="h-10 w-64" /></div>

/** "/" → primeira organização do usuário (ou tela de aguardando vínculo). */
function RootRedirect() {
  const { session, loading } = useAuth()
  const { data, isLoading } = useMemberships()
  if (loading || (session && isLoading)) return <Loading />
  if (!session) return <Navigate to="/entrar" replace />
  if (!data?.length) return <NoOrganizationPage />
  return <Navigate to={`/${data[0].slug}`} replace />
}

function RequireAuth() {
  const { session, loading } = useAuth()
  if (loading) return <Loading />
  return session ? <Outlet /> : <Navigate to="/entrar" replace />
}

function OrgRoute() {
  const { orgSlug = '' } = useParams()
  return (
    <OrganizationProvider slug={orgSlug}>
      <OrgGate />
    </OrganizationProvider>
  )
}

function OrgGate() {
  const { membership, loading } = useOrganization()
  if (loading) return <Loading />
  // Slug inexistente OU organização da qual o usuário não faz parte: mesmo comportamento (sem vazar existência).
  if (!membership) return <Navigate to="/" replace />
  return <AppShell />
}

function ConfigMissing() {
  return <div className="p-8">Configure <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> (veja <code>.env.example</code>).</div>
}

export const router = createBrowserRouter(
  isSupabaseConfigured
    ? [
        { path: '/entrar', element: <LoginPage /> },
        { path: '/cadastro', element: <SignupPage /> },
        { path: '/verifique-seu-email', element: <VerifyEmailPage /> },
        { path: '/recuperar-senha', element: <ForgotPasswordPage /> },
        { path: '/redefinir-senha', element: <ResetPasswordPage /> },
        { path: '/convite/:token', element: <ClaimInvitePage /> },
        {
          element: <RequireAuth />,
          children: [
            { path: '/', element: <RootRedirect /> },
            {
              path: '/:orgSlug',
              element: <OrgRoute />,
              children: [
                { index: true, element: <HomePage /> },
                { path: 'membros', element: <MembersPage /> },
              ],
            },
          ],
        },
        { path: '*', element: <Navigate to="/" replace /> },
      ]
    : [{ path: '*', element: <ConfigMissing /> }],
)
