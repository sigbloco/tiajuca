# Loja do bloco

Loja virtual pequena, com **retirada combinada** (sem entrega) e **pagamento antecipado**. Fica dentro do app do bloco:

- Vitrine pública (sem login): `/<slug>/loja` — ex.: `https://tiajuca.cordaodatiajuca.workers.dev/tiajuca/loja`
- Painel (exige login e a permissão `shop.manage`): `/<slug>/gerenciar-loja` — também em **Organização → Loja**

## O que a loja faz

- Catálogo misto: **em estoque** (controla quantidade por tamanho) e **sob encomenda** (mostra o prazo de produção).
- Carrinho com vários itens. Visitante paga o preço público; **integrante ativo logado** paga o preço de integrante (desconto em % por produto).
- Dois métodos de pagamento, que o bloco liga/desliga no painel:
  - **Pix direto**: a tela mostra chave, valor exato e o código do pedido; o cliente envia o comprovante por WhatsApp/e-mail e a Direção marca como pago.
  - **InfinitePay** (cartão de crédito ou Pix na página deles): o pedido é confirmado sozinho quando a InfinitePay avisa; marcar à mão continua possível.
- Cliente sem conta consulta o pedido em **Meus pedidos** com **código + telefone** (com limite de tentativas).
- E-mail ao cliente a cada mudança de status.

### Status

Pedido: `aguardando pagamento → pagamento em conferência → pago`, ou `cancelado`.
Depois de pago, cada grupo anda separado:

| Grupo | Etapas |
|---|---|
| Pronta entrega (em estoque) | separando → pronto para retirada → retirado |
| Sob encomenda | na fila → em preparo → pronto para retirada → retirado |

Dá para voltar um passo (corrigir engano). Toda ação grava **quem fez e quando** (aba Pedidos → histórico).

### Estoque

`estoque` = unidades físicas; `reservado` = vendido e ainda não retirado; **disponível = estoque − reservado**.
Criar pedido reserva; cancelar/expirar devolve; **retirar** baixa o estoque físico. Pedido "aguardando pagamento" expira em 48 h
(a cada 15 min o banco cancela os vencidos). **"Em conferência" não expira.**

## Configurar (pelo painel)

**Loja → Pagamentos e contatos**: formas de pagamento, chave Pix e favorecido, InfiniteTag (com botão **Testar conexão**), endereço do site,
WhatsApp/e-mail da loja, pessoas da Direção (botões de WhatsApp) e remetente dos e-mails.
**Pontos de retirada**: nome, endereço e horário (só os ativos aparecem no checkout). **Produtos**: preço público, desconto de integrante, variações e fotos.

Quem pode gerenciar: Titular e Direção. Para dar a outra pessoa, use **Acesso e papéis** e conceda `shop.manage` a um papel.

### Segredos das Edge Functions (Supabase → Edge Functions → Secrets)

| Segredo | Para quê |
|---|---|
| `SMTP_USER` | conta do Gmail que envia (ex.: `cordaodatiajuca@gmail.com`) |
| `SMTP_PASS` | **senha de app** do Gmail (16 letras; exige verificação em duas etapas) |
| `RESEND_API_KEY` | alternativa ao Gmail (e `MAIL_PROVIDER=resend` para forçar) |
| `MAIL_PROVIDER` | opcional: `smtp`, `resend` ou `log` (teste: só registra, não envia) |
| `SHOP_RESERVATION_HOURS` | opcional, padrão 48 |

Sem credenciais de e-mail os avisos **esperam na fila** e saem quando o segredo for cadastrado. Nada de senha vai para o código nem para o painel.

## Como funciona por dentro

```
src/modules/shop/
  config/        shop.config.ts: único ponto de leitura da configuração estática (slug, prazo)
  catalog.ts     preço, desconto, estoque disponível e validação do produto (puro, testado)
  cart.ts        carrinho (puro, testado)
  orders/        transições de status e textos para o cliente (puro, testado)
  payments/      Pix (instruções) e registro dos métodos
  privacy.ts     aviso de privacidade (LGPD)
  public/        vitrine, produto, carrinho, checkout, confirmação, Meus pedidos, login em popup
  admin/         Pedidos, Produtos, Pontos de retirada, Pagamentos e contatos
supabase/
  migrations/20261019000022…32   tabelas, RLS, funções e fila de e-mails
  functions/     shop-checkout, shop-order-public, shop-infinitepay-webhook, shop-admin, shop-mailer
  tests/rls_shop_smoke.sql
```

Princípios:

- **O navegador nunca decide preço, desconto ou estoque.** O pedido é criado numa função SQL (transação única, trava de estoque, preço de integrante conferido no banco).
- **Cada método de pagamento é um módulo** com a mesma forma (`shop-checkout`: `providers`); a lógica de pedidos não depende do método.
- **E-mail passa por uma camada central** (`shop-mailer`/`providers.ts`): trocar Gmail por Resend é configuração.
- **Webhook da InfinitePay nunca é confiado.** A documentação não prevê assinatura, então o pagamento só vale depois de `payment_check` na própria InfinitePay e com o valor igual ao total.
- Dados do cliente só aparecem para quem tem `shop.manage` (RLS) e, na consulta pública, só para quem sabe **código + telefone**.

## Colocar no ar (ou recriar do zero)

1. **Banco**: aplique `supabase/migrations/*.sql` em ordem (as da loja são `20261019000022` a `…32`) e depois `supabase/seed/tiajuca_shop.sql`
   (pontos de retirada de exemplo e configurações). Para um bloco novo, edite os dados do seed (Pix, contatos, Direção).
2. **Edge Functions**: publique as cinco pastas de `supabase/functions/shop-*`. Todas com verificação de JWT ligada, **exceto**
   `shop-infinitepay-webhook` e `shop-mailer` (que não recebem login). `shop-admin` e `shop-checkout` usam um arquivo `infinitepay.ts`
   próprio (cópia: ao mudar um, mude o outro).
3. **Agendamentos** (já criados pelas migrations/seed): expiração de pedidos a cada 15 min (`pg_cron`) e, como rede de segurança dos e-mails,
   o comentário no fim do seed mostra como agendar o `shop-mailer` a cada minuto (troque `<ref>` pelo ID do projeto).
4. **Site**: o app é uma SPA (Vite) publicada no Cloudflare; o envio ao GitHub publica sozinho. Variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no `.env`.
5. **Pelo painel**: pontos de retirada ativos, produtos, formas de pagamento, contatos e remetente.
6. **Teste**: faça uma compra pelo Pix com o seu e-mail, marque como pago, avance e **cancele** o pedido de teste para devolver o estoque.

### Para outro bloco usar a mesma base

Ainda não é um produto multi-instância pronto, mas a estrutura foi pensada para isso: nome, logo e cores vêm da organização (tema do app);
Pix, contatos e métodos vêm do painel; o que é fixo no código é só `src/modules/shop/config/shop.config.ts` (`orgSlug`, prazo).
Passos: criar um projeto Supabase novo → aplicar migrations → criar a organização e o primeiro diretor (README principal) → seed da loja
com os dados do bloco → trocar `orgSlug` → publicar as funções e cadastrar os segredos → configurar pelo painel.

## Testes

```bash
npm test          # estoque, preço, carrinho, transições, e-mails, provedores, InfinitePay, privacidade, configuração
npm run typecheck
npm run build
```

As regras de acesso do banco têm um teste de fumaça em SQL: `supabase/tests/rls_shop_smoke.sql` (termina com um erro `RESULTADO: …` de propósito,
para desfazer tudo).

## Operação

- **Pagamento chegou depois do cancelamento**: o pedido mostra um aviso vermelho; use **Reativar pedido** (se ainda houver estoque) ou reembolse por fora.
- **Reembolso** é feito fora do sistema; o pedido é só cancelado, com motivo.
- **E-mail que não saiu**: no banco, `select template, to_email, status, attempts, last_error from shop_email_outbox where status <> 'sent' order by created_at desc;`
- **Domínio novo**: atualize o **endereço do site** em Pagamentos e contatos (links dos e-mails e retorno da InfinitePay).
- **Aviso de privacidade**: modelo em `src/modules/shop/privacy.ts` (prazo de guarda de 5 anos); a Direção deve revisar o texto.

## Limites conhecidos

- O formato da resposta da InfinitePay ao criar um link não é documentado; a leitura é tolerante e o botão **Testar conexão** confere de verdade.
- Não há reembolso automático, cupom nem frete.
- Preço de integrante vale para quem está **ativo** no ciclo atual (inativo paga o preço público).
