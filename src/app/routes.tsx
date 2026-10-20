import { Navigate, Outlet, createBrowserRouter, useLocation, useParams } from 'react-router-dom'
import { Skeleton } from '@/components/ui/primitives'
import { takePostLoginPath, useAuth } from '@/core/auth'
import { OrganizationProvider, useMemberships, useOrganization } from '@/core/organization'
import { isSupabaseConfigured } from '@/core/supabase'
import { ClaimInvitePage, ForgotPasswordPage, NoOrganizationPage, ResetPasswordPage, SignupPage, VerifyEmailPage } from '@/modules/auth/pages'
import { HomePage } from '@/modules/dashboard/HomePage'
import { CapacityPage } from '@/modules/capacity/CapacityPage'
import { WaitlistPage } from '@/modules/cycles/WaitlistPage'
import { AttendanceListPage, AttendanceRosterPage } from '@/modules/attendance/AttendancePages'
import { EventsPage } from '@/modules/events/EventsPage'
import { BillingPage } from '@/modules/billing/BillingPage'
import { ScholarshipsPage } from '@/modules/billing/ScholarshipsPage'
import { ProfilePage } from '@/modules/profile/ProfilePage'
import { RepertoireDetailPage } from '@/modules/repertoire/RepertoireDetailPage'
import { RepertoirePage } from '@/modules/repertoire/RepertoirePage'
import { SuppliersPage } from '@/modules/suppliers/SuppliersPage'
import { DriveFoldersPage } from '@/modules/drive/DriveFoldersPage'
import { AccessPage } from '@/modules/access/AccessPage'
import { AuditBackupsPage } from '@/modules/audit/AuditBackupsPage'
import { ReportsPage } from '@/modules/reports/ReportsPage'
import { InterfacePage } from '@/modules/interface/InterfacePage'
import { FormEditorPage } from '@/modules/forms/FormEditorPage'
import { FormsPage } from '@/modules/forms/FormsPage'
import { PublicFormPage } from '@/modules/forms/PublicFormPage'
import { MembersPage } from '@/modules/members/MembersPage'
import { NaipesPage } from '@/modules/structure/NaipesPage'
import { SiteSettings } from '@/modules/site/SiteSettings'
import { Organogram } from '@/modules/structure/Organogram'
import { ChecklistsPage, FunctionsPage } from '@/modules/structure/OrgPages'
import { SectionNamesPage } from '@/modules/structure/NaipesSettings'
import { ShopAdminPage } from '@/modules/shop/admin/ShopAdminPage'
import { CartPage } from '@/modules/shop/public/CartPage'
import { CheckoutPage } from '@/modules/shop/public/CheckoutPage'
import { OrderConfirmationPage } from '@/modules/shop/public/OrderConfirmationPage'
import { OrderLookupPage } from '@/modules/shop/public/OrderLookupPage'
import { PrivacyPage } from '@/modules/shop/public/PrivacyPage'
import { ProductPage } from '@/modules/shop/public/ProductPage'
import { ShopHomePage } from '@/modules/shop/public/ShopHomePage'
import { ShopLayout } from '@/modules/shop/public/ShopLayout'
import { LandingPage } from '@/modules/site/LandingPage'
import { AppShell } from './AppShell'
import { FinanceHome, HubHome, HubLayout } from './Hub'

const Loading = () => <div className="p-8"><Skeleton className="h-10 w-64" /></div>

/** "/" → primeira organização do usuário (ou tela de aguardando vínculo). */
function RootRedirect() {
  const { session, loading } = useAuth()
  const { data, isLoading } = useMemberships()
  if (loading || (session && isLoading)) return <Loading />
  if (!session) return <LandingPage />
  const wanted = new URLSearchParams(window.location.search).get('voltar')
  if (wanted && wanted.startsWith('/') && !wanted.startsWith('//')) return <Navigate to={wanted} replace />
  const back = takePostLoginPath() // ex.: voltou da loja depois do login com Google
  if (back) return <Navigate to={back} replace />
  if (!data?.length) return <NoOrganizationPage />
  return <Navigate to={`/${data[0].slug}`} replace />
}

function RequireAuth() {
  const { session, loading } = useAuth()
  if (loading) return <Loading />
  const { pathname, search } = useLocation()
  return session ? <Outlet /> : <Navigate to={`/?entrar=1&voltar=${encodeURIComponent(pathname + search)}`} replace />
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
        { path: '/entrar', element: <Navigate to="/?entrar=1" replace /> },
        { path: '/cadastro', element: <SignupPage /> },
        { path: '/verifique-seu-email', element: <VerifyEmailPage /> },
        { path: '/recuperar-senha', element: <ForgotPasswordPage /> },
        { path: '/redefinir-senha', element: <ResetPasswordPage /> },
        { path: '/convite/:token', element: <ClaimInvitePage /> },
        { path: '/f/:orgSlug/:formSlug', element: <PublicFormPage /> },
        {
          path: '/:orgSlug/loja', // vitrine pública, fora do guard de login
          element: <ShopLayout />,
          children: [
            { index: true, element: <ShopHomePage /> },
            { path: 'produto/:slug', element: <ProductPage /> },
            { path: 'carrinho', element: <CartPage /> },
            { path: 'finalizar', element: <CheckoutPage /> },
            { path: 'pedido/:code', element: <OrderConfirmationPage /> },
            { path: 'consultar', element: <OrderLookupPage /> },
            { path: 'privacidade', element: <PrivacyPage /> },
          ],
        },
        { path: '/', element: <RootRedirect /> },
        { path: '/site', element: <LandingPage /> },
        {
          element: <RequireAuth />,
          children: [
            {
              path: '/:orgSlug',
              element: <OrgRoute />,
              children: [
                { index: true, element: <HomePage /> },
                { path: 'organizacao', element: <HubLayout hub="organizacao" />, children: [{ index: true, element: <HubHome hub="organizacao" /> }] },
                { path: 'oficina', element: <HubLayout hub="oficina" />, children: [{ index: true, element: <HubHome hub="oficina" /> }] },
                { path: 'financeiro', element: <HubLayout hub="financeiro" />, children: [{ index: true, element: <FinanceHome /> }] },
                { path: 'membros', element: <MembersPage /> },
                { path: 'naipes', element: <NaipesPage /> },
                { path: 'naipes/organograma', element: <Organogram /> },
                { path: 'naipes/configuracoes', element: <SectionNamesPage /> },
                {
                  element: <HubLayout hub="organizacao" />,
                  children: [
                    { path: 'ciclos', element: <Navigate to="../eventos" relative="path" replace /> },
                    { path: 'fornecedores', element: <SuppliersPage /> },
                    { path: 'checklists', element: <ChecklistsPage /> },
                    { path: 'funcoes', element: <FunctionsPage /> },
                    { path: 'drive', element: <DriveFoldersPage /> },
                      ],
                },
                {
                  element: <HubLayout hub="financeiro" />,
                  children: [
                    { path: 'mensalidades', element: <BillingPage /> },
                    { path: 'bolsas', element: <ScholarshipsPage /> },
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
                { path: 'auditoria', element: <AuditBackupsPage /> },
                { path: 'acesso', element: <AccessPage /> },
                { path: 'repertorio', element: <RepertoirePage /> },
                { path: 'repertorio/:repertoireId', element: <RepertoireDetailPage /> },
                { path: 'perfil', element: <ProfilePage /> },
                { path: 'eventos', element: <EventsPage /> },
                { path: 'gerenciar-loja', element: <ShopAdminPage /> },
                { path: 'site', element: <SiteSettings /> },
                { path: 'interface', element: <InterfacePage /> },
                { path: 'configuracoes', element: <Navigate to="../organizacao" replace /> },
              ],
            },
          ],
        },
        { path: '*', element: <Navigate to="/" replace /> },
      ]
    : [{ path: '*', element: <ConfigMissing /> }],
)
