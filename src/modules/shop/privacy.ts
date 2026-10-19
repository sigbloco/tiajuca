/**
 * Aviso de privacidade da loja (LGPD). Texto em blocos para a página e para os testes.
 * Modelo de partida: a Direção deve revisar o texto antes de divulgar a loja. O prazo de guarda é editável no painel.
 */
export interface PrivacyContact { whatsapp: string | null; email: string | null }
export interface PrivacySection { title: string; paragraphs: string[] }

/** `retentionYears` vem das configurações da loja (painel). */
export function buildPrivacyNotice(orgName: string, contact: PrivacyContact, retentionYears = 5): PrivacySection[] {
  const channels = [contact.email && `e-mail ${contact.email}`, contact.whatsapp && `WhatsApp +${contact.whatsapp}`].filter(Boolean).join(' ou ')
  return [
    {
      title: 'Quem cuida dos seus dados',
      paragraphs: [`A loja do ${orgName} é operada pelo próprio bloco, que é o responsável pelos dados tratados aqui.`],
    },
    {
      title: 'Quais dados coletamos',
      paragraphs: [
        'Nome, telefone, e-mail, o ponto de retirada escolhido e os itens do pedido. Não pedimos endereço de entrega, porque não há entrega.',
        'Não guardamos dados de cartão. Quando você paga pela InfinitePay, o pagamento acontece na página deles; recebemos apenas a confirmação do valor pago.',
      ],
    },
    {
      title: 'Para que usamos',
      paragraphs: [
        'Para processar o seu pedido: confirmar o pagamento, separar os itens, combinar a retirada e avisar você por e-mail a cada mudança de status.',
        'Também usamos o código do pedido e o telefone para você consultar o andamento em "Meus pedidos". Não usamos seus dados para propaganda nem os vendemos.',
      ],
    },
    {
      title: 'Com quem compartilhamos',
      paragraphs: [
        'Apenas com quem precisa para a loja funcionar: o serviço de hospedagem e banco de dados (Supabase), o serviço de envio de e-mails e, se você escolher pagar pela InfinitePay, a própria InfinitePay.',
        'Integrantes da Direção e quem administra a loja veem seus dados de contato para atender o pedido.',
      ],
    },
    {
      title: 'Por quanto tempo guardamos',
      paragraphs: [`Guardamos os dados do pedido por até ${retentionYears} ${retentionYears === 1 ? 'ano' : 'anos'}, para controle financeiro do bloco e eventual atendimento posterior. Depois disso eles são apagados ou anonimizados.`],
    },
    {
      title: 'Seus direitos',
      paragraphs: [
        'Você pode pedir a confirmação de que tratamos seus dados, uma cópia deles, a correção de dados errados e a eliminação dos que não precisamos mais guardar.',
        channels ? `Para isso, fale com a gente pelo ${channels}.` : 'Para isso, fale com a Direção do bloco.',
      ],
    },
  ]
}
