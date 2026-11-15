# Mensalidades com InfinitePay: estado e próximos passos

## O que já está no ar (2026-11-15)
- **Banco** (`20261115000005_charge_pay_links.sql`, aplicado): em `monthly_charges` entram `pay_code` (10 caracteres, é o `order_nsu` do link), `pay_link_url` e `pay_ref`.
  Funções: `charge_pay_info` (financeiro; cria o código), `charge_set_pay_link` (financeiro), `charge_for_payment` e `charge_mark_paid_by_link` (só service_role).
- **Edge Functions** (publicadas):
  - `billing-pay-link` (exige login): `POST { charge_id }` → `{ url }`. Valor, nome e InfiniteTag vêm do banco. A InfiniteTag é a da Loja (`shop_settings.infinitepay_handle`), hoje `tia-juca`.
  - `billing-infinitepay-webhook` (pública): recebe o aviso, confirma no `payment_check` da InfinitePay, compara o valor em centavos e baixa a cobrança (`payment_method = 'InfinitePay'`).
- **Tela**: Financeiro → ficha da cobrança pendente → "Link de pagamento" (gerar, copiar, gerar novo).
- Pix pela InfinitePay não tem taxa (informado pelo usuário em 2026-11-15). Pix fora do link continua baixa manual.

## Pendências do que já está no ar
1. **Testar de ponta a ponta** com uma cobrança de valor baixo: gerar o link, pagar, ver a baixa. A resposta de criação do link não é documentada; a URL é procurada com tolerância (`extractCheckoutUrl`). Se falhar, ver o log da função (campos da resposta aparecem no erro).
2. As funções foram publicadas pelo painel/MCP **sem acentos** nas mensagens de erro (texto de `index.ts` em ASCII). A versão do repositório tem os acentos: na próxima publicação (CLI `supabase functions deploy`), usar a do repositório.
3. Ajustar o valor de uma cobrança depois de gerar o link deixa o link antigo com o valor velho: o aviso dele será ignorado (valor diferente). A tela já orienta a gerar novo link.
4. Sem assinatura nos avisos da InfinitePay: a segurança é o `payment_check`. Dúvidas de integração: parcerias@cloudwalk.io.

## Próxima etapa: e-mail automático de cobrança
Pedido do usuário:
- Enviar ao **e-mail principal do integrante** (conferir qual campo é o "principal" em `members`/contatos).
- Datas de envio (vencimento = dia 10): **1º dia do mês**, **5º dia útil do mês** e **dia do vencimento**.
- **Configurável em Financeiro** (ligar/desligar cada lembrete, e idealmente editar a quantidade e o dia). Valores iniciais acima.
- Só para cobranças `pending` com valor > 0; nunca para pagas, canceladas ou isentas.

### Desenho proposto
1. **Configuração** (por bloco): nova tabela `billing_mail_settings` (organization_id pk, `enabled`, `on_first_day`, `on_nth_business_day` + `nth` (padrão 5), `on_due_day`) ou um jsonb. Tela em Financeiro (usar `StickySave`, `SaveButton`; textos que citam páginas com `PageLink`).
2. **Link sob demanda**: o job que envia chama a mesma lógica da `billing-pay-link` (extrair para um módulo compartilhado), reutilizando `pay_link_url` se o valor não mudou (guardar `pay_link_amount_cents` para detectar) e gerando novo se mudou.
3. **Fila**: seguir o padrão da loja/formulários: tabela `charge_email_outbox` (+ `charge_mail_claim` / `charge_mail_done`) e um `template` novo em `shop-mailer/templates.ts` (`buildChargeEmail`), enviado no mesmo laço do `shop-mailer` (mesmo remetente/SMTP/Resend). Registrar `(charge_id, kind)` único para não duplicar o envio do mesmo lembrete (`kind` = `first_day` | `business_day` | `due_day`).
4. **Agendador**: `pg_cron` diário (ex.: 08:00 no fuso do bloco) que enfileira o que vence hoje: dia 1; 5º dia útil (existe `public.next_business_day(org, date)` e a tabela `holidays`; criar uma função que conta N dias úteis a partir do dia 1); dia do vencimento (`due_on`). Depois chama o `shop-mailer` (como já é feito).
5. **Conteúdo do e-mail**: nome do integrante, competência, valor (já com bolsa), vencimento, botão "Pagar" (link), aviso de que a baixa é automática. Rodapé com contato do bloco.
6. **Painel**: na lista de cobranças, mostrar "Lembrete enviado em …"; botão "Reenviar" por cobrança (manual).
7. **Testes**: funções puras do cálculo das datas (5º dia útil com feriados) e do template, no estilo de `templates.test.ts`.

### Decisões em aberto
- Cobranças geradas depois do dia 1 (integrante novo): enviar na geração ou só nos próximos marcos?
- Cobrança vencida (depois do dia 10): continuar lembrando? Hoje há `overdueWhatsapp` manual em `BillingPage`.
- Integrante sem e-mail: só registrar no painel que não foi enviado.
