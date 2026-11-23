import { Suspense, lazy, useEffect, useState } from 'react'
import { Navigate, Outlet, createBrowserRouter, useLocation, useParams } from 'react-router-dom'
import { LoadingScreen } from '@/components/shared/LoadingScreen'
import { isSigningOut, takePostLoginPath, useAuth } from '@/core/auth'
import { OrganizationProvider, useMemberships, useOrganization } from '@/core/organization'
import { isSupabaseConfigured } from '@/core/supabase'
import { NoOrganizationPage } from '@/modules/auth/pages'
import { LandingPage } from '@/modules/site/LandingPage'
import { RouteError } from './RouteError'

const HomePage = lazy(() => import('@/modules/dashboard/HomePage').then((m) => ({ default: m.HomePage })))
const CapacityPage = lazy(() => import('@/modules/capacity/CapacityPage').then((m) => ({ default: m.CapacityPage })))
const WaitlistPage = lazy(() => import('@/modules/cycles/WaitlistPage').then((m) => ({ default: m.WaitlistPage })))
const AttendanceListPage = lazy(() => import('@/modules/attendance/AttendancePages').then((m) => ({ default: m.AttendanceListPage })))
const AttendanceRosterPage = lazy(() => import('@/modules/attendance/AttendancePages').then((m) => ({ default: m.AttendanceRosterPage })))
const EventsPage = lazy(() => import('@/modules/events/EventsPage').then((m) => ({ default: m.EventsPage })))
const EventSettingsPage = lazy(() => import('@/modules/events/EventSettingsPage').then((m) => ({ default: m.EventSettingsPage })))
const BillingPage = lazy(() => import('@/modules/billing/BillingPage').then((m) => ({ default: m.BillingPage })))
const ScholarshipsPage = lazy(() => import('@/modules/billing/ScholarshipsPage').then((m) => ({ default: m.ScholarshipsPage })))
const ProfilePage = lazy(() => import('@/modules/profile/ProfilePage').then((m) => ({ default: m.ProfilePage })))
const RepertoireDetailPage = lazy(() => import('@/modules/repertoire/RepertoireDetailPage').then((m) => ({ default: m.RepertoireDetailPage })))
const RepertoirePage = lazy(() => import('@/modules/repertoire/RepertoirePage').then((m) => ({ default: m.RepertoirePage })))
const SuppliersPage = lazy(() => import('@/modules/suppliers/SuppliersPage').then((m) => ({ default: m.SuppliersPage })))
const DriveFoldersPage = lazy(() => import('@/modules/drive/DriveFoldersPage').then((m) => ({ default: m.DriveFoldersPage })))
const AccessPage = lazy(() => import('@/modules/access/AccessPage').then((m) => ({ default: m.AccessPage })))
const AuditBackupsPage = lazy(() => import('@/modules/audit/AuditBackupsPage').then((m) => ({ default: m.AuditBackupsPage })))
const ReportsPage = lazy(() => import('@/modules/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })))
const InterfacePage = lazy(() => import('@/modules/interface/InterfacePage').then((m) => ({ default: m.InterfacePage })))
const FormEditorPage = lazy(() => import('@/modules/forms/FormEditorPage').then((m) => ({ default: m.FormEditorPage })))
const FormsPage = lazy(() => import('@/modules/forms/FormsPage').then((m) => ({ default: m.FormsPage })))
const AlunosRedirect = lazy(() => import('@/modules/members/AlunosRedirect').then((m) => ({ default: m.AlunosRedirect })))
const FormListsPage = lazy(() => import('@/modules/forms/FormListsPage').then((m) => ({ default: m.FormListsPage })))
const SendDefaultsPage = lazy(() => import('@/modules/forms/SendDefaultsPage').then((m) => ({ default: m.SendDefaultsPage })))
const TemplateEditorPage = lazy(() => import('@/modules/forms/TemplateEditorPage').then((m) => ({ default: m.TemplateEditorPage })))
const SectionTemplatesPage = lazy(() => import('@/modules/forms/SectionTemplatesPage').then((m) => ({ default: m.SectionTemplatesPage })))
const FormPreviewPage = lazy(() => import('@/modules/forms/FormPreviewPage').then((m) => ({ default: m.FormPreviewPage })))
const PublicFormPage = lazy(() => import('@/modules/forms/PublicFormPage').then((m) => ({ default: m.PublicFormPage })))
const MembersPage = lazy(() => import('@/modules/members/MembersPage').then((m) => ({ default: m.MembersPage })))
const NaipesPage = lazy(() => import('@/modules/structure/NaipesPage').then((m) => ({ default: m.NaipesPage })))
const SiteSettings = lazy(() => import('@/modules/site/SiteSettings').then((m) => ({ default: m.SiteSettings })))
const Organogram = lazy(() => import('@/modules/structure/Organogram').then((m) => ({ default: m.Organogram })))
const FunctionsPage = lazy(() => import('@/modules/structure/OrgPages').then((m) => ({ default: m.FunctionsPage })))
const CyclesPage = lazy(() => import('@/modules/cycles/CyclesPage').then((m) => ({ default: m.CyclesPage })))
const SectionNamesPage = lazy(() => import('@/modules/structure/NaipesSettings').then((m) => ({ default: m.SectionNamesPage })))
const ShopAdminPage = lazy(() => import('@/modules/shop/admin/ShopAdminPage').then((m) => ({ default: m.ShopAdminPage })))
const CartPage = lazy(() => import('@/modules/shop/public/CartPage').then((m) => ({ default: m.CartPage })))
const CheckoutPage = lazy(() => import('@/modules/shop/public/CheckoutPage').then((m) => ({ default: m.CheckoutPage })))
const OrderCodeRedirect = lazy(() => import('@/modules/shop/public/OrderLookupPage').then((m) => ({ default: m.OrderCodeRedirect })))
const OrderLookupPage = lazy(() => import('@/modules/shop/public/OrderLookupPage').then((m) => ({ default: m.OrderLookupPage })))
const PrivacyPage = lazy(() => import('@/modules/shop/public/PrivacyPage').then((m) => ({ default: m.PrivacyPage })))
const ProductPage = lazy(() => import('@/modules/shop/public/ProductPage').then((m) => ({ default: m.ProductPage })))
const ShopHomePage = lazy(() => import('@/modules/shop/public/ShopHomePage').then((m) => ({ default: m.ShopHomePage })))
const ShopLayout = lazy(() => import('@/modules/shop/public/ShopLayout').then((m) => ({ default: m.ShopLayout })))
const AlbumsPage = lazy(() => import('@/modules/site/AlbumsPage').then((m) => ({ default: m.AlbumsPage })))
const AppShell = lazy(() => import('./AppShell').then((m) => ({ default: m.AppShell })))
const LedgerPage = lazy(() => import('@/modules/finance/LedgerPage').then((m) => ({ default: m.LedgerPage })))
const PaymentsPage = lazy(() => import('@/modules/finance/PaymentsPage').then((m) => ({ default: m.PaymentsPage })))
const DistributionPage = lazy(() => import('@/modules/finance/DistributionPage').then((m) => ({ default: m.DistributionPage })))
const ValuesPage = lazy(() => import('@/modules/billing/ValuesPage').then((m) => ({ default: m.ValuesPage })))
const FinanceHome = lazy(() => import('./Hub').then((m) => ({ default: m.FinanceHome })))
const HubHome = lazy(() => import('./Hub').then((m) => ({ default: m.HubHome })))
const HubLayout = lazy(() => import('./Hub').then((m) => ({ default: m.HubLayout })))

/** Carregando: nunca deixa a tela em branco. Se demorar demais, mostra uma saída (recarregar). */
function Loading() {
  const [slow, setSlow] = useState(false)
  useEffect(() => { const t = setTimeout(() => setSlow(true), 8000); return () => clearTimeout(t) }, [])
  return (
    <LoadingScreen>
      {slow && (
        <div className="space-y-2">
          <p>Está demorando mais que o normal.</p>
          <button type="button" className="rounded-lg border border-border px-4 py-2 font-semibold hover:bg-muted" onClick={() => window.location.reload()}>Recarregar a página</button>
        </div>
      )}
    </LoadingScreen>
  )
}

/** "/" → primeira organização do usuário (ou tela de aguardando vínculo). */
function RootRedirect() {
  const { session, loading } = useAuth()
  const { data, isLoading } = useMemberships()
  if (loading || (session && isLoading)) return <Loading />
  if (!session) return <LandingPage />
  const wanted = new URLSearchParams(window.location.search).get('voltar')
  if (wanted && wanted.startsWith('/') && wanted !== '/' && !wanted.startsWith('//')) return <Navigate to={wanted} replace />
  const back = takePostLoginPath() // ex.: voltou da loja depois do login com Google
  // Voltar para '/' estando em '/' não muda nada: o Navigate não renderiza nada e a tela ficava em branco até a próxima atualização.
  if (back && back !== '/') return <Navigate to={back} replace />
  // Logado, "/" abre o site (a página do bloco); o sistema fica no botão do site.
  if (!data?.length) return <NoOrganizationPage />
  return <LandingPage />
}

function RequireAuth() {
  const { session, loading } = useAuth()
  const { pathname, search } = useLocation() // hook ANTES de qualquer return: com o login ainda carregando, a ordem dos hooks mudava e a tela ficava em branco
  if (loading) return <Loading />
  // Saiu de propósito: vai para a página inicial, sem abrir o login.
  if (!session && isSigningOut()) return <Navigate to="/" replace />
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

/** /inscricoes… → /formularios… */
function OldFormsRedirect() {
  const { pathname, search } = useLocation()
  return <Navigate to={pathname.replace('/inscricoes', '/formularios') + search} replace />
}

function OrgPreview() {
  const { orgSlug = '' } = useParams()
  return <OrganizationProvider slug={orgSlug}><PreviewGate /></OrganizationProvider>
}

/** Só mostra a pré-visualização depois que a organização carregou (e se a pessoa faz parte dela). */
function PreviewGate() {
  const { membership, loading } = useOrganization()
  if (loading) return <Loading />
  if (!membership) return <Navigate to="/" replace />
  return <FormPreviewPage />
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
    ? [{ errorElement: <RouteError />, element: <Suspense fallback={<Loading />}><Outlet /></Suspense>, children: [ // erro de qualquer tela: aviso com Recarregar, nunca página em branco
        { path: '/entrar', element: <Navigate to="/?entrar=1" replace /> },
        // Sem cadastro aberto nem senha: só entrada com Google (links antigos caem no início).
        { path: '/cadastro', element: <Navigate to="/?entrar=1" replace /> },
        { path: '/verifique-seu-email', element: <Navigate to="/?entrar=1" replace /> },
        { path: '/recuperar-senha', element: <Navigate to="/?entrar=1" replace /> },
        { path: '/redefinir-senha', element: <Navigate to="/?entrar=1" replace /> },
        { path: '/f/:orgSlug/:formSlug', element: <PublicFormPage /> },
        { path: '/:orgSlug/fotos', element: <AlbumsPage /> }, // álbuns públicos, fora do guard de login
        {
          path: '/:orgSlug/loja', // vitrine pública, fora do guard de login
          element: <ShopLayout />,
          children: [
            { index: true, element: <ShopHomePage /> },
            { path: 'produto/:slug', element: <ProductPage /> },
            { path: 'carrinho', element: <CartPage /> },
            { path: 'finalizar', element: <CheckoutPage /> },
            { path: 'pedido/:code', element: <OrderCodeRedirect /> },
            { path: 'consultar', element: <OrderLookupPage /> },
            { path: 'privacidade', element: <PrivacyPage /> },
          ],
        },
        { path: '/', element: <RootRedirect /> },
        { path: '/site', element: <LandingPage /> },
        {
          element: <RequireAuth />,
          children: [
            { path: '/:orgSlug/previa/:formId', element: <OrgPreview /> },
            {
              path: '/:orgSlug',
              element: <OrgRoute />,
              children: [
                { index: true, element: <HomePage /> },
                { path: 'organizacao', element: <HubLayout hub="organizacao" />, children: [{ index: true, element: <HubHome hub="organizacao" /> }] },
                { path: 'oficina', element: <HubLayout hub="oficina" />, children: [{ index: true, element: <HubHome hub="oficina" /> }] },
                { path: 'financeiro', element: <HubLayout hub="financeiro" />, children: [{ index: true, element: <FinanceHome /> }] },
                { path: 'membros', element: <MembersPage /> },
                { path: 'formularios', element: <FormsPage /> },
                { path: 'formularios/configuracoes', element: <SectionTemplatesPage /> },
                { path: 'formularios/configuracoes/listas', element: <FormListsPage /> },
                { path: 'formularios/configuracoes/envio', element: <SendDefaultsPage /> },
                { path: 'formularios/configuracoes/modelos/:templateId', element: <TemplateEditorPage /> },
                { path: 'formularios/:formId', element: <FormEditorPage /> },
                // Endereços antigos (quando a área se chamava Inscrições) seguem funcionando.
                { path: 'inscricoes', element: <OldFormsRedirect /> },
                { path: 'inscricoes/*', element: <OldFormsRedirect /> },
                { path: 'naipes', element: <NaipesPage /> },
                { path: 'naipes/organograma', element: <Organogram /> },
                { path: 'naipes/configuracoes', element: <SectionNamesPage /> },
                {
                  element: <HubLayout hub="organizacao" />,
                  children: [
                    { path: 'ciclos', element: <CyclesPage /> },
                    { path: 'fornecedores', element: <SuppliersPage /> },
                    { path: 'checklists', element: <Navigate to="../eventos/configuracoes" replace /> },
                    { path: 'funcoes', element: <FunctionsPage /> },
                    { path: 'drive', element: <DriveFoldersPage /> },
                      ],
                },
                {
                  element: <HubLayout hub="financeiro" />,
                  children: [
                    { path: 'distribuicao', element: <DistributionPage /> },
                    { path: 'equipe', element: <Navigate to="../distribuicao" replace /> },
                    { path: 'pagamentos', element: <PaymentsPage /> },
                    { path: 'receitas', element: <LedgerPage kind="income" /> },
                    { path: 'despesas', element: <LedgerPage kind="expense" /> },
                    { path: 'valores', element: <ValuesPage /> },
                    { path: 'cobrancas', element: <BillingPage /> },
                    { path: 'mensalidades', element: <Navigate to="../cobrancas" replace relative="path" /> },
                    { path: 'bolsas', element: <ScholarshipsPage /> },
                  ],
                },
                {
                  element: <HubLayout hub="oficina" />,
                  children: [
                    { path: 'alunos', element: <AlunosRedirect /> },
                    { path: 'relatorios', element: <ReportsPage /> },
                    { path: 'presenca', element: <AttendanceListPage mode="mine" /> },
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
                { path: 'eventos/configuracoes', element: <EventSettingsPage /> },
                { path: 'gerenciar-loja', element: <ShopAdminPage /> },
                { path: 'site', element: <SiteSettings /> },
                { path: 'interface', element: <InterfacePage /> },
                { path: 'configuracoes', element: <Navigate to="../organizacao" replace /> },
              ],
            },
          ],
        },
        { path: '*', element: <Navigate to="/" replace /> },
      ] }]
    : [{ path: '*', element: <ConfigMissing /> }],
)
