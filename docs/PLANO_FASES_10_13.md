# Plano — Fases 10 a 13 (módulos adicionais)

> Complementa [PROPOSTA_TECNICA.md](PROPOSTA_TECNICA.md). Estado em 15/10/2026: **Fases 1–9 implementadas e aplicadas**, incluindo gestão de papéis, Titular do bloco e matriz de permissões editável. Falta o uso real das telas pelo bloco (ver [ROTEIRO_DE_TESTE.md](ROTEIRO_DE_TESTE.md)).

## Pré-requisitos (antes de qualquer fase nova)
Os módulos abaixo só começam com as bases estáveis (autenticação, organizações, membros, ciclos, permissões, presença, mensalidades, financeiro, eventos).
1. Roteiro de teste executado e problemas corrigidos.
2. Código no GitHub (`sigbloco/tiajuca`) e **front publicado** (decisão de hospedagem abaixo).
3. Checklist "antes de usar com pessoas reais" fechado (LGPD, SMTP, backups, Auth URLs).
4. **Edge Functions em produção** (a do Drive já existe; webhook de pagamento depende disso).

## Princípios (valem para todas as fases)
Multi-organização (`organization_id` + RLS), tudo configurável pela interface, nada hardcoded, Supabase/PostgreSQL/Storage, auditoria, mobile primeiro, **reaproveitar entidades existentes** (instruments, sections, roles, cycles, members, organizations) e integrar com Financeiro sem criar sistema isolado. Segredos só em Edge Functions; nunca `service_role` no front.

## Ordem
| Fase | Módulo | Risco |
|---|---|---|
| **10** | Biblioteca de mensagens (item 50) | baixo |
| **11** | Inscrições v2 (item 45) | médio |
| **12** | Lojinha básica (item 46) | médio |
| **13** | Pedidos + InfinitePay (item 47) | alto |

---

## Fase 10 — Biblioteca de mensagens (item 50)
**Entrega:** página interna para guardar, organizar e reutilizar mensagens prontas.
- **Modelo:** `message_templates` (título, conteúdo, categoria, público sugerido, tags, status ativa/rascunho/arquivada, favorito, criado/editado por e quando), `message_categories` (configuráveis; sementes: Ensaios, Oficinas, Mensalidades, Cobrança, Eventos, Apresentações, Inscrições, Lista de espera, Bolsas, Presença, Repertório, Lojinha, Comunicados gerais, Professores, Monitores, Produção), `message_template_roles` (quem pode usar: Direção / +Professores / +Monitores, via papéis existentes).
- **Permissões:** Direção cria/edita/arquiva; Professor e Monitor só **usam** o que foi liberado ao papel; Integrante comum sem acesso. RLS por organização e por papel. Novas permissões `messages.read` / `messages.manage` (entram sozinhas na Direção/Titular).
- **Uso rápido:** copiar, copiar para WhatsApp, abrir no WhatsApp (`wa.me`), editar, duplicar, favoritar; preserva quebras de linha e emojis.
- **Busca/filtros:** texto, categoria, público, tag, favoritos; ordenação por nome/recentes; paginação no banco.
- **Variáveis:** `{nome}`, `{nome_preferido}`, `{valor}`, `{competencia}`, `{data}`, `{horario}`, `{local}`, `{instrumento}`, `{naipe}`, `{ciclo}`, `{nome_organizacao}`. Primeira versão: **placeholders com pré-visualização e preenchimento manual**; função de substituição reutilizável e testada. Sem envio automático.
- **Contexto:** botão "Usar mensagem…" nas telas de Mensalidades (cobrança), Lista de espera, Evento (lembrete) e Inscrições (aprovação/rejeição), abrindo a mensagem já preenchida com os dados disponíveis.
- **Histórico:** auditoria básica de quem criou/editou e quando (reaproveita `audit_logs`); sem versionamento sofisticado.
- **Futuro (não agora):** WhatsApp Business/API, e-mail, envio em massa, lembretes, agendamento, registro de enviados.
- **Pronto quando:** testes SQL de RLS (papéis × organizações) passam; mensagem copiada abre no WhatsApp com texto íntegro.

## Fase 11 — Inscrições v2 (item 45, sobre a Fase 8 já pronta)
**Já existe (Fase 8):** construtor, tipos de campo, condicionais simples, versões/snapshot, URL pública, upload com token, respostas, aprovação → integrante, privacidade, retenção, duplicar.
**A construir:**
1. **Seções** (criar, editar, ordenar, duplicar, desativar; remover só sem impacto histórico) e **lógica condicional estendida**: mostrar/esconder campo ou seção, **pular para seção**, **encerrar com mensagem específica**. Sem motor de regras complexo.
2. **Biblioteca de campos reutilizáveis** (`form_field_library`): nome, e-mail, WhatsApp, rede social, nascimento, gênero, trans, raça/cor, PCD, instrumento, nível, experiência em outros blocos, relação com a Grande Tijuca… O texto exibido muda por formulário sem perder o vínculo estrutural (`member.phone`, etc.). Campos sensíveis marcados.
3. **Campos específicos do formulário** (sem vínculo permanente), mantidos na submissão; **aceite/declaração** como novo tipo.
4. **Tipos de participação** (Aluno, Músico convidado, Senior, Banda, Pernalta) vindos de **classificações** existentes, não hardcoded.
5. **Instrumentos/naipes dinâmicos:** pergunta pode filtrar por naipe (formulário de sopros só mostra instrumentos do Sopro).
6. **Vagas e lista de espera:** formulário associado a ciclo/naipe/instrumento/função com limite; ao esgotar → **bloquear** ou **aceitar em lista de espera automaticamente**. Status da inscrição: Nova, Em análise, Lista de espera, Aprovada, Rejeitada, Desistiu, Convertida em integrante. Ligação com a página *Lista de espera* existente.
7. **Conversão em integrante com checagem de duplicidade** (e-mail, telefone, nome+nascimento): se houver suspeita, **não cria**, avisa a Direção e oferece vincular ao cadastro existente.
8. **Modelos iniciais:** Oficina de sopros, Oficina de percussão, Pernaltas, Aula aberta (montados com base nos formulários atuais do bloco; sem importar do Google Forms).
9. Já previsto: duplicar/criar a partir de outro, copiar perguntas entre formulários.
- **Pronto quando:** formulário com seções e pulo funciona no celular; respostas antigas seguem legíveis após mudanças; duplicidade barrada; testes SQL (anon só via RPC, validação no servidor, isolamento) passam.

## Fase 12 — Lojinha básica (item 46)
**Escopo:** vitrine pública (sem login) + administração pela Direção. **Sem** gateway próprio, cartão, frete avançado ou ERP.
- **Tabelas:** `shop_categories` (configuráveis), `products` (nome, descrições, categoria, preço, preço promocional, status Rascunho/Ativo/Esgotado/Oculto/Arquivado, ordem, destaque, estoque opcional, forma de venda), `product_images` (Storage, ordem, principal, texto alternativo), `product_variants` (tamanho/cor/modelo; preço adicional, estoque próprio, SKU, ativo), `combos` + `combo_items` (relação com produtos reais e quantidades; **não** duplica produtos), `shop_settings` (WhatsApp da organização, textos, formas de venda).
- **Forma de venda por item:** InfinitePay, WhatsApp, ambos ou indisponível.
- **Vitrine pública** (`/loja/:org`): cards, fotos, preços, categorias, destaques, filtros, busca opcional, detalhe, seleção de variante e quantidade; identidade visual da organização; **mobile primeiro**.
- **Compra por WhatsApp:** "Pedir pelo WhatsApp" abre mensagem pré-preenchida (produto, variante, quantidade, combo, valor). **Não** marca como pago.
- **Segurança:** leitura anônima somente de produtos ativos via RPC/view pública; escrita só `shop.manage` (Direção); imagens em bucket com leitura pública controlada **apenas** das imagens publicadas.
- **Pronto quando:** Direção cadastra produto com fotos/variantes/combo em celular; vitrine pública abre sem login; RLS isola organizações.

## Fase 13 — Pedidos e InfinitePay (item 47)
> **Antes de implementar:** ler a **documentação oficial da InfinitePay** e confirmar criação de checkout, formato/assinatura do webhook, campos devolvidos e ambiente de testes. Nada deste desenho assume detalhes da API.
- **Camada de pagamentos** (`payments/` com interface de provedor): InfinitePay + fluxo manual/WhatsApp; nenhuma lógica do provedor nos componentes da loja. `payment_integrations` por organização (ativa/inativa, handle da conta, URL de retorno); **tokens/segredos só em secrets da Edge Function**.
- **Pedidos:** `orders` (número, comprador nome/e-mail/telefone, subtotal, desconto, total, **status do pedido** e **status do pagamento** separados, provedor, `order_nsu`, `transaction_nsu`, datas, observações) e `order_items` (produto/variante/combo, **snapshot de nome e preço**, quantidade, subtotal). Suporta **vários itens por pedido** desde o início.
- **Fluxo:** produto → pedido (criado no **servidor**, preços recalculados do banco, nunca do navegador; valida variante, quantidade, estoque) → checkout dinâmico por pedido → pagamento → **webhook** → confirmação. Link fixo por produto só como fallback opcional.
- **Webhook idempotente** (Edge Function): valida origem/assinatura conforme o provedor, localiza o pedido, confere **valor**, registra transação/forma/parcelas/comprovante, atualiza status, audita. Notificação repetida **não** duplica pagamento, baixa de estoque nem receita.
- **Nunca** considerar pago só porque o cliente voltou à página de sucesso: ela mostra "Estamos confirmando seu pagamento" até o webhook (ou consulta segura ao provedor) confirmar.
- **Página do pedido** `/loja/pedido/:id` (sem dados sensíveis de pagamento). **Estoque opcional**, baixado **só após pagamento confirmado**; risco de concorrência com estoque muito baixo documentado (sem sistema de reserva).
- **Conciliação** (Direção): pedido, comprador, valor esperado × pago, status, provedor, forma, data, transação, comprovante; destaca divergência de valor, pagamento não localizado, pedido não pago/expirado.
- **Integração financeira:** pedido pago gera **receita** categoria "Lojinha" no Financeiro, **idempotente**, com chave para ligar/desligar por organização (reaproveita `financial_entries`/razão).
- **Segurança:** o SIGBloco nunca coleta número de cartão/CVV nem processa pagamento; guarda só o necessário para gestão e conciliação. LGPD para dados de compradores (retenção, acesso só Direção). RLS por organização em todas as tabelas.
- **Pronto quando:** pagamento de teste no ambiente do provedor confirma pelo webhook; reenvio do mesmo webhook não duplica nada; divergência de valor é sinalizada; testes SQL passam.

---

## Hospedagem do front (decidido: Cloudflare Pages)
O front é estático (Vite/React); todo o backend (banco, auth, storage, Edge Functions e webhooks) fica no **Supabase**. Cloudflare Pages: grátis, fallback de SPA nativo (rotas como `/f/...`), deploy automático do GitHub (`sigbloco/tiajuca`), HTTPS e domínio próprio, uso comercial permitido.
Passos: conectar o repositório; build `npm run build`, saída `dist`; variáveis públicas `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`; cadastrar a URL final em *Supabase → Auth → URL Configuration*. Nunca colocar `service_role`/segredos no build.

## Decisões tomadas
1. **Hospedagem:** Cloudflare Pages.
2. **Lojinha/pagamento:** o bloco **não tem CNPJ**, mas tem **conta InfinitePay**. Pedidos tratados por **membros da Direção** (permissão própria, configurável na matriz). Conferir os termos da InfinitePay para conta sem CNPJ antes da Fase 13.
3. **Estoque:** **controlado pelo sistema** desde o início (baixa só após pagamento confirmado).
4. **Mensagens:** ainda não existem; a biblioteca começa vazia, com poucos exemplos editáveis.
5. **Inscrições v2:** referências recebidas (abaixo).

## Modelos de Inscrição (baseados nos Google Forms atuais)
Campos comuns: e-mail*, nome completo*, como prefere ser chamado, celular/WhatsApp*, rede social, data de nascimento*, identidade de gênero*, transgênero*, cor/raça*, PCD* + qual, nível*, outros blocos, relação com a Grande Tijuca (pesquisa afetiva), "Estou ciente e concordo", declaração de veracidade. Gênero, raça e deficiência são **dados sensíveis** (tabela separada, consentimento). Textos informativos (valores, cronograma, bolsa, respeito e inclusão) viram blocos de texto editáveis.

1. **Sopros 2026/27:** passo inicial condicional "Quero conhecer primeiro (aula aberta)" × "Tô dentro" que pula seções; participação Aluno R$150 / Músico convidado R$50 / Senior R$50; instrumentos (Flauta, Clarinete, Sax Soprano/Alto/Tenor, Trompete, Trombone, Bombardino, Tuba, Outro); nível (Nunca toquei…Avançado). Ramo **Aula aberta**: nome, apelido, WhatsApp, "chegando como", instrumento, nível, relação com a Tijuca, declarações — gera contato, não integrante.
2. **Oficina de percussão:** Senior/Aluno/Banda (R$50/R$150/R$50); instrumentos (Agogô, Caixa de guerra, Repique, Surdo, Tamborim, Timbal, Xequerê); declaração "possuo o instrumento"; **lista de espera automática** quando o naipe lota; presença mínima 75%.
3. **Pernaltagens:** contribuição R$35; níveis Iniciado/Intermediário/Avançado com descrição (só iniciados com perna de pau e joelheira própria); experiência com outras performances; comentário/sugestão; seção de pagamento.
4. **Aula aberta:** modelo do ramo acima, também publicável sozinho.

Necessidades novas para a Fase 11: seções com **salto condicional**, blocos de texto informativo, marcação de dado sensível por campo, opção "Outro" com texto livre, aprovação que escolhe categoria/instrumento e cai em lista de espera sem vaga.
Observação: os PDFs trazem telefones e chave PIX institucionais; entram como **configuração do bloco**, não no código. O PDF de pernaltas cita "carnaval 2025" — revisar o texto.
