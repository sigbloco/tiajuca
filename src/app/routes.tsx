import { Navigate, Outlet, createBrowserRouter, useParams } from 'react-router-dom'
import { Skeleton } from '@/components/ui/primitives'
import { useAuth } from '@/core/auth'
import { OrganizationProvider, useMemberships, useOrganization } from '@/core/organization'
import { isSupabaseConfigured } from '@/core/supabase'
import { ClaimInvitePage, ForgotPasswordPage, LoginPage, NoOrganizationPage, ResetPasswordPage, SignupPage, VerifyEmailPage } from '@/modules/auth/pages'
import { HomePage } from '@/modules/dashboard/HomePage'
import { CapacityPage } from '@/modules/capacity/CapacityPage'
import { CyclesPage } from '@/modules/cycles/CyclesPage'
import { WaitlistPage } from '@/modules/cycles/WaitlistPage'
import { AttendanceListPage, AttendanceRosterPage } from '@/modules/attendance/AttendancePages'
import { EventsPage } from '@/modules/events/EventsPage'
import { BillingPage } from '@/modules/billing/BillingPage'
import { ScholarshipsPage } from '@/modules/billing/ScholarshipsPage'
import { FinancePage } from '@/modules/finance/FinancePage'
import { ProfilePage } from '@/modules/profile/ProfilePage'
import { RepertoireDetailPage } from '@/modules/repertoire/RepertoireDetailPage'
import { RepertoirePage } from '@/modules/repertoire/RepertoirePage'
import { SuppliersPage } from '@/modules/suppliers/SuppliersPage'
import { DriveFoldersPage } from '@/modules/drive/DriveFoldersPage'
import { AccessPage } from '@/modules/access/AccessPage'
import { AuditPage } from '@/modules/audit/AuditPage'
import { ReportsPage } from '@/modules/reports/ReportsPage'
import { FormEditorPage } from '@/modules/forms/FormEditorPage'
import { FormsPage } from '@/modules/forms/FormsPage'
import { PublicFormPage } from '@/modules/forms/PublicFormPage'
import { MembersPage } from '@/modules/members/MembersPage'
import { SettingsPage } from '@/modules/structure/SettingsPage'
import { AppShell } from './AppShell'
import { HubHome, HubLayout } from './Hub'

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
  if (membership.inactive) return <InactiveScreen name={membership.name} person={membership.display_name} />
  return <AppShell />
}

/** Pessoa inativa no ciclo: entra, mas não vê nada. Reativar na ficha devolve o acesso na hora. */
function InactiveScreen({ name, person }: { name: string; person: string }) {
  const { signOut } = useAuth()
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1>Olá, {person}</h1>
      <p className="text-muted-foreground">Sua participação no {name} está <strong>inativa</strong> neste ciclo, então o acesso está pausado. Fale com a Direção para voltar.</p>
      <button className="rounded-lg border border-border px-4 py-2 font-semibold hover:bg-muted" onClick={() => signOut()}>Sair</button>
    </main>
  )
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
        { path: '/f/:orgSlug/:formSlug', element: <PublicFormPage /> },
        {
          element: <RequireAuth />,
          children: [
            { path: '/', element: <RootRedirect /> },
            {
              path: '/:orgSlug',
              element: <OrgRoute />,
              children: [
                { index: true, element: <HomePage /> },
                { path: 'organizacao', element: <HubLayout hub="organizacao" />, children: [{ index: true, element: <HubHome hub="organizacao" /> }] },
                { path: 'oficina', element: <HubLayout hub="oficina" />, children: [{ index: true, element: <HubHome hub="oficina" /> }] },
                {
                  element: <HubLayout hub="organizacao" />,
                  children: [
                    { path: 'ciclos', element: <CyclesPage /> },
                    { path: 'membros', element: <MembersPage /> },
                    { path: 'mensalidades', element: <BillingPage /> },
                    { path: 'bolsas', element: <ScholarshipsPage /> },
                    { path: 'financeiro', element: <FinancePage /> },
                    { path: 'fornecedores', element: <SuppliersPage /> },
                  ],
                },
                {
                  element: <HubLayout hub="oficina" />,
                  children: [
                    { path: 'alunos', element: <MembersPage lockedCategory="Aluno" title="Alunos" /> },
                    { path: 'inscricoes', element: <FormsPage /> },
                    { path: 'inscricoes/:formId', element: <FormEditorPage /> },
                    { path: 'relatorios', element: <ReportsPage /> },
                    { path: 'presenca', element: <AttendanceListPage /> },
                    { path: 'presenca/:activityId', element: <AttendanceRosterPage /> },
                    { path: 'vagas', element: <CapacityPage /> },
                    { path: 'lista-de-espera', element: <WaitlistPage /> },
                  ],
                },
                { path: 'auditoria', element: <AuditPage /> },
                { path: 'acesso', element: <AccessPage /> },
                { path: 'repertorio', element: <RepertoirePage /> },
                { path: 'repertorio/:repertoireId', element: <RepertoireDetailPage /> },
                { path: 'drive', element: <DriveFoldersPage /> },
                { path: 'perfil', element: <ProfilePage /> },
                { path: 'eventos', element: <EventsPage /> },
                { path: 'configuracoes', element: <SettingsPage /> },
              ],
            },
          ],
        },
        { path: '*', element: <Navigate to="/" replace /> },
      ]
    : [{ path: '*', element: <ConfigMissing /> }],
)
