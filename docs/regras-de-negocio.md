# Regras de negócio do SIGBloco (instância Cordão da Tia Juca)

Retrato das regras **como estão implementadas em 19/11/2026**, levantado na Fase 1 da revisão geral (ver `REVISAO.md`). Onde há duas versões da mesma regra convivendo, o trecho está marcado com **⚠ conflito** e o código do problema no `REVISAO.md`.

Fonte da verdade: o banco de produção (Supabase `dzyvtqrxmladsxceqzud`). Muitas funções SQL foram alteradas por migrations que fazem `replace()` no texto da função anterior; por isso a definição vigente às vezes só existe por inteiro no banco.

---

## 1. Conceitos que valem para tudo

- **Organização (bloco):** o sistema é multi-organização por slug na URL (`/:orgSlug/...`). Hoje existe uma só: `tiajuca`.
- **Ciclo:** tudo o que é da organização (estrutura de naipes e instrumentos por ciclo, oficinas, equipe, vagas, categorias e valores de contribuição, bolsas, isenções, repertório) é relativo a um ciclo (ex.: Carnaval 2026/27) e pode mudar no seguinte. O ciclo vai do dia 1 do mês de início ao último dia do mês de fim; `is_current` acompanha as datas (`refresh_current_cycle`). Apagar um ciclo faz backup automático e apaga em cascata, com bloqueios explicados por `cycle_blockers`. Dá para copiar a configuração de um ciclo para outro (`copy_cycle_setup`).
  - Ainda **não** são por ciclo: designações de professor/monitor (`staff_assignments` usa datas) e o catálogo de naipes/instrumentos em si.
- **Lixeira:** excluir quase sempre é mover para a lixeira (arquivar); excluir de vez só pela lixeira e só quando o item não está em uso (`purge_trashed`).
- **Auditoria:** gatilho `fn_audit` grava antes/depois das tabelas principais em `audit_logs` (dados sensíveis mascarados; demais campos completos, ver LGPD-03 no `REVISAO.md`).
- **Backups:** manuais e automáticos (antes de restaurar e antes de apagar ciclo; guarda os 20 automáticos mais recentes). Restaurar faz upsert linha a linha, sem apagar nada.

---

## 2. Área dos integrantes (sistema interno)

### 2.1 Acesso e conta
- Entrada **só com Google** no front (`signInWithOAuth`). As rotas antigas `/entrar`, `/cadastro`, `/recuperar-senha`, `/redefinir-senha` só redirecionam para `/?entrar=1`. O Supabase ainda tem 3 contas antigas de e-mail/senha e o provedor de e-mail ligado (exige confirmação).
- O acesso a uma organização nasce de:
  1. **vínculo automático por e-mail** (`link_my_member_by_email`, chamado a cada carregamento): liga a conta a todo cadastro ativo e sem conta cujo e-mail principal ou extra seja igual ao e-mail **confirmado** da conta;
  2. **convite por token** (`claim_member`): legado; a interface não gera mais convites, mas a rota `/convite/:token` continua ativa;
  3. **formulário público com aprovação**: a aprovação cria o integrante com o e-mail informado (ou o da conta Google, se o formulário tem seção de login), e o vínculo acontece pelo caminho 1.
- Quem entra sem cadastro vê "aguardando vínculo".
- E-mails extras: o integrante pede (`request_extra_email`), a Direção aprova; a Direção pode incluir direto.

### 2.2 Papéis e permissões
- Papéis cumulativos: **Integrante** (padrão, dado a todo cadastro novo), **Colaborador**, **Monitor**, **Professor**, **Direção** e **Titular**.
- Matriz `role_permissions` (permissão × escopo `own`/`group`/`org`) editável em Acesso, exceto:
  - Direção e Titular sempre têm todas as permissões com escopo `org`;
  - permissões **travadas** (só Direção/Titular): `org.manage`, `settings.manage`, `roles.manage`, `audit.read`, `members.sensitive.read/manage`, `finance.read/manage`, `billing.manage`, `scholarships.manage`, `staff_payments.manage`, `staff_assignments.manage`, `forms.manage`. **Não** estão travadas, entre outras, `members.manage` e `backups.manage` (ver SEG-02/SEG-03).
- **Titular:** único; só ele concede ou remove a Direção (quando existe titular); a titularidade só muda por `transfer_titular`, feita pelo próprio titular. O primeiro titular é designado pelo banco (`bootstrap_first_director`/`set_organization_titular`, fora do alcance de usuários).
- **Último diretor:** o banco impede revogar o papel ou arquivar o último diretor.
- **Inativo com acesso limitado:** quem está com status não ativo (e não lista de espera) no ciclo atual, e não é Direção/Titular, fica só com leitura própria de cadastro, cobranças e presença. Pode pedir reativação.
- **"Ver como"** (só para `roles.manage`): troca papéis e permissões **só na interface**; o banco continua respondendo ao usuário real.
- **Liberação de páginas** (`page_releases`): o Titular escolhe quais páginas cada categoria vê. É **só de interface**; a segurança real fica no RLS.
- O front tem dois modelos convivendo: por permissão (`usePermission`, escopo mínimo `org`) e por nome de papel (`useIsDirection`/`DirectionOnly`). O menu usa escopo mínimo `own`. Ver INT-07.

### 2.3 Estrutura
- Naipe → Instrumento (subnaipes abolidos). Nomes de naipe predefinidos, afinação e "altura" por naipe.
- Funções/categorias organizadas em seções: Remuneradas, Colaborativas, Artística, Contribuintes. Funções fixas e isentas (`is_fixed`, `is_exempt`, `exempt_locked`).
- Itens em uso não podem ser excluídos.
- Níveis de habilidade por naipe (incluindo "nunca toquei"); o integrante declara o próprio nível.

### 2.4 Participação do integrante
- Vínculos artísticos (instrumento, nível) e funções colaborativas ou remuneradas, por ciclo (`cycle_participations`).
- Pedidos de mudança de participação feitos pelo integrante e aprovados pela Direção; o integrante pode abrir mão de uma função colaborativa não remunerada.
- Categorias extras acumuláveis por ciclo.
- Status no ciclo (ativo, inativo, lista de espera) com histórico. Inativar não muda o passado.
- A participação atual fica em `member_artistic_links` e um gatilho a espelha no ciclo atual (`cycle_participations`). Categoria e bolsa ficam só nas tabelas por ciclo (etapa 3): quem entra no ciclo atual começa com a categoria e a bolsa do último ciclo em que tinha categoria (`carry_member_fee_to_cycle`).

### 2.5 Vagas e lista de espera
- Limite por instrumento e ciclo; vazio ou 0 = sem limite. Vaga lotada bloqueia a ativação, salvo exceção forçada por quem tem `capacity.manage`. Arquivado não ocupa vaga.
- Lista de espera por instrumento.

### 2.6 Presença (Oficina)
- Chamada por evento com presença. Público do evento por naipe, instrumento, pessoa ou categoria (categorias combinadas com OU entre si e com E com o resto). Pessoa "fora da lista" pode ser incluída.
- Quem registra: Professor do ciclo atual registra para qualquer integrante; Monitor só para o próprio grupo (instrumento/naipe); Direção para todos.
- Relatórios por pessoa, evento, mês, instrumento e naipe (exigem `attendance.read` com escopo `group` ou `org`).

### 2.7 Calendário, eventos e checklists
- Eventos avulsos e recorrentes, com roteiro, público, rótulos, "tem presença?" e visibilidade (integrantes ou só equipe).
- Edição pontual de uma ocorrência; cancelamento geral ou por instrumento, com motivo.
- Lixeira de eventos (restaurar, excluir de vez sem a recorrência recriar).
- Estado "A confirmar".
- Aniversariantes do dia (só primeiro nome dos ativos) e lista de aniversários (inclui a fundação do bloco). ⚠ ver LGPD-04 (a lista entrega nome completo e dia/mês de todos).
- Checklists: modelo copiado para o evento; o responsável marca a própria tarefa; nome do checklist por evento.

### 2.8 Cobranças (mensalidades)
- **Categoria de contribuição** = oficina/naipe que dita o valor. Cada categoria tem **Tipo** (`fee_categories.base_key`: aluno, senior, musico, isento) e **Naipe** opcional (`section_id`). O sistema reconhece aluno/sênior/músico pelo Tipo, nunca pelo nome.
- Valores do ciclo 2026/27: Aluno (sopro/percussão) R$ 150; Sênior (sopro/percussão) R$ 50; Músico convidado (sopro/percussão) R$ 50; Pernalta R$ 35 (sênior ou não). Ninguém toca em dois naipes; se acontecer, vale o maior valor. Direção é isenta qualquer que seja a categoria.
- O banco barra categoria principal de naipe diferente do instrumento (e troca de instrumento nesse caso), só no ciclo atual e nos futuros.
- **Fonte única por ciclo:** categoria `cycle_fee_assignments`, valor `fee_cycle_prices`, bolsa `cycle_scholarships`, isenção da função `fee_cycle_exempt`. A regra da mensalidade de uma pessoa num ciclo está numa função só (`billing_member_fee`), usada pela geração e por "Minha participação". Não há mais valor por data.
- **Geração mensal** (`generate_monthly_charges`) por competência, só para quem tem categoria principal no ciclo e status ativo; exclui funções isentas no ciclo (`fee_cycle_exempt` vence `is_exempt`; `exempt_locked` sempre vale) e **quem tem atividade remunerada no ciclo** (vínculo marcado como remunerado; D3); valor do ciclo (categoria sem valor no ciclo é pulada e contada); aplica a bolsa do ciclo; vencimento no dia configurado ajustado para dia útil (feriados); não duplica.
- Baixa manual, ajuste com motivo, cancelar e reabrir.
- **Link InfinitePay** por cobrança (`charge_pay_info`, edge `billing-pay-link`) com baixa automática pelo webhook, só depois de confirmar na InfinitePay (`payment_check`) e com valor igual ao da cobrança.
- Ajustar o valor tira o link (o próximo sai com o valor novo); o código antigo fica guardado e, se alguém pagar por ele, o aviso da InfinitePay fica registrado na cobrança como divergência (sem baixa), com aviso para a direção conferir.
- Lembrete por e-mail das mensalidades: **ainda não existe** (planejado em `docs/COBRANCA_INFINITEPAY.md`).

### 2.9 Bolsas
- Percentual por ciclo (`cycle_scholarships`), com tipo e motivo, gravado por `set_cycle_scholarship` (0% remove); indicadores do ciclo escolhido (`scholarship_indicators`), com o valor do ciclo de cada categoria.

### 2.10 Financeiro
- Receitas e despesas lançadas e canceladas com motivo (nada se apaga). Livro-caixa (`v_finance_ledger`) inclui as mensalidades pagas sem duplicar.
- **Distribuição/Equipe:** regras por pessoa e ciclo (valor fixo, % da receita do bloco/naipe/instrumento, hora-aula × aulas não canceladas, divisão de grupo, "Caixa do bloco"). O cálculo é feito **no navegador** (`TeamPage.tsx`), que grava `create_staff_payment`. O calculador antigo (`compute_distribution`, `distribution_rules`) foi apagado na etapa 3; os destinos (`distribution_destinations`) ficam, usados pelos pagamentos da equipe.
- Painel da direção: perfil do bloco pelo Tipo da categoria do ciclo (ativos); as classificações antigas foram apagadas.
- Pagamentos da equipe com cópia da chave Pix no momento do pagamento.
- Regência é atividade artística e não é remunerada.

### 2.11 Formulários e inscrições
- Versões publicadas imutáveis; seções; condições por pergunta ou por seção; opção "Outro"; anexos (token de upload, até 3 por campo, 5 MB, PDF/imagem, bucket privado).
- Anti-abuso: campo isca (honeypot), 30 envios por minuto por formulário, maioridade, deduplicação por e-mail.
- Seção de login Google; formulário **interno** (renovação) que atualiza o cadastro existente ao aprovar e pode ser editado enquanto pendente.
- Tipos Inscrição/Geral; limite de respostas com "Esgotado – lista de espera".
- Aprovar cria/atualiza o integrante; recusar; lista de espera. E-mails de aprovado, lista de espera e recusado (fila enviada pelo `shop-mailer`).
- Variáveis de texto: `{whatsapp}`, `{email}`, `{chave_pix}`, `{vencimento}`, `{valor}`, `{valor:Categoria}`.
- Seções modelo; listas do cadastro (gênero, raça, redes sociais, níveis).
- Retenção: `purge_old_submissions` anonimiza recusadas (> 12 meses) e pendentes (> 6 meses), mas só quando alguém com `forms.manage` aciona.

### 2.12 Repertório e Drive
- Repertório por ciclo: músicas, anexos (link, arquivo no Storage até 25 MB, pasta do Drive), afinação por instrumento.
- Drive: pastas cadastradas com regras de acesso por papel, naipe ou instrumento (Professor e Monitor veem todas). Sincronização de compartilhamento pela conta de serviço (`drive-sync`, prévia ou aplicação, só mexe em leitores criados pelo app). Busca de partituras (`drive-search`) só dentro das pastas cadastradas.

### 2.13 Fornecedores, perfil, interface
- Fornecedores: categorias e contatos, com desativação lógica.
- Perfil: dados pessoais, dados sensíveis (gênero, raça, PCD), chave Pix, foto, e-mails extras, participação, cobranças e pagamentos próprios. O Titular vê também o "Perfil do bloco"; telefone e e-mail do titular são copiados para os contatos públicos da loja e do site (`trg_sync_bloco_contacts`).
- Interface: tema único em `organizations.theme`, com áreas geral, site e loja; logo em `organizations.logo_path`.

### 2.14 Matriz de permissões

Ver a seção 6 do `REVISAO.md` (papel × ação, com onde cada regra é imposta).

---

## 3. Loja virtual (pública, sem login de cliente)

### 3.1 Catálogo
- Produto **pronta entrega** (`stock`) ou **sob encomenda** (`made_to_order`); preço em centavos; desconto de integrante por produto (0 a 100%); variações (tamanhos), "Único" quando não há tamanho.
- Lixeira = `is_active=false`; **oculto** = some da vitrine e não vende, mas continua no painel; duplicar cria a cópia oculta.
- **Destaque** com título editável no topo da vitrine.
- **Kit** (só pronta entrega), que mostra os componentes.
- **Sugestões** escolhidas no painel (página do produto e carrinho) + 4 aleatórias no carrinho.
- Fotos no bucket público `shop-images` (WebP de 900 px).
- Produto **não** tem agendamento de publicação.

### 3.2 Preço (decidido só no servidor, em `shop_create_order`)
1. Preço base do banco (o navegador não manda preço).
2. **Integrante ativo** → desconto do produto. "Ativo" = cadastro ligado à conta, não arquivado, não inativo no ciclo atual e (status ativo no ciclo atual **ou** papel titular/direção/professor/monitor). A conta vem do token verificado no servidor.
3. **Preço especial** (titular, direção, professor ou monitor ativo): substitui o preço de integrante, mesmo quando este é menor (⚠ LOJA-11).
4. **Cupom:** não acumula; vale o menor preço entre o do comprador e o preço público com o desconto do cupom. Cupom inválido aborta o pedido. Cupom não tem validade nem limite de uso.
5. Tudo é congelado no pedido; `total = subtotal - desconto`.
- Desconto padrão nas configurações só pré-preenche produto novo.

### 3.3 Estoque e encomenda
- Pronta entrega: estoque independente por item (finito ou ilimitado); cada variação consome N unidades de cada item; disponível = menor razão entre os itens. Criar pedido reserva; cancelar/expirar devolve; retirar baixa o estoque físico.
- Sob encomenda: sem estoque; prazo em texto livre (obrigatório).
- **Meta mínima** (`min_units`, só encomenda): unidades **pagas** para começar a produzir (não é mínimo de compra). Contador "faltam N" opcional. Ao atingir, envia e-mail "produção iniciada" a todos os compradores pagos, uma vez.
- Limites por pedido: 1 a 20 unidades por variação e até 30 linhas.

### 3.4 Pedido
- Dados: nome, e-mail, telefone brasileiro (vira `55`+dígitos), ponto de retirada, forma de pagamento, aceite do aviso de privacidade.
- Anti-abuso: 3 pedidos aguardando pagamento por telefone ou e-mail; 10 pedidos por hora por IP.
- Código de 8 caracteres (≈ 40 bits). Clique duplo/F5 não duplica (`client_request_id`).
- Recusa no servidor: produto oculto/inativo, variação inativa, outra organização, ponto de retirada não permitido para o produto.

### 3.5 Retirada
- Pontos do tipo **lugar** (endereço + agenda semanal ou datas) ou **pessoa** (combinar direto com nome e telefone). Datas passadas somem; ponto só com datas passadas some.
- Por produto: produto sem ponto marcado vale para todos; o checkout só oferece os pontos comuns a todos os itens (servidor confere).
- Não há entrega: retirada combinada.

### 3.6 Pagamento (antecipado e integral)
- **Pix com confirmação manual:** chave, favorecido, valor, QR e copia-e-cola (BR Code com o código do pedido). O cliente manda o comprovante por WhatsApp ou e-mail (**não há upload de comprovante**). A Direção confere e marca pago.
- **InfinitePay:** o servidor cria o link com os itens; o webhook só marca pago depois de consultar `payment_check` e de o valor bater com o total.
- **Taxa do cartão** (4,20% à vista e tabela de parcelas) só é exibida no front como estimativa; o pedido e o link usam o total sem taxa (⚠ LOJA-13).
- O cliente pode trocar a forma de pagamento enquanto aguarda pagamento.
- Prazo de reserva: `reservation_hours` (padrão 48 h). Pedido aguardando pagamento vencido é cancelado a cada 15 minutos (`pg_cron`).

### 3.7 Status
- Pedido: `awaiting_payment` → `payment_review` → `paid`; `cancelled`.
  - `payment_review` hoje só nasce ao reativar um pedido cancelado ou pela ação `report_payment` da API (o botão "avisei que paguei" saiu do front, ⚠ LOJA-02/LOJA-14). Não expira.
  - `paid`: manual (Direção) ou webhook. Pagamento que chega com o pedido cancelado não reabre o pedido: gera alerta para reativar ou reembolsar.
- Depois de pago, cada grupo (pronta entrega / encomenda) anda sozinho: estoque `pending → ready → picked_up`; encomenda `pending → in_preparation → ready → picked_up`; pode voltar um passo.
- Cancelar: Direção (se nada foi retirado) ou cliente (só aguardando pagamento). Reembolso é feito por fora.
- Reativar (Direção): só cancelado; reserva de novo; volta para `payment_review`.
- Arquivar: só pedidos encerrados (cancelados ou pagos com tudo retirado).

### 3.8 Consulta do pedido
- Visitante: **código + telefone**. Mostra itens, valores, datas, ponto, status, linha do tempo e link de pagamento (enquanto aguarda). Não mostra telefone nem e-mail. Respostas iguais para código ou telefone errado. Limite: 30/h por IP e 20/h por código (ação `status`: 300 e 150).
- Logado com Google: "Meus pedidos" lista pedidos da conta ou do mesmo e-mail feitos como visitante; pode cancelar e trocar a forma de pagamento.

### 3.9 E-mails
- Fila `shop_email_outbox` por gatilho, só em avanços: pedido recebido, em conferência, pago, cancelado, em preparação, pronto, retirado, produção iniciada. Até 5 tentativas.
- Envio pelo `shop-mailer` (SMTP de uma conta global, ou Resend), disparado logo após cada ação. O mesmo mailer envia os e-mails de formulários.

### 3.10 Configurações da loja
- Pix (chave e favorecido), InfiniteTag, endereço público do site, WhatsApp e e-mail, pessoas da Direção (nome e WhatsApp, públicos), remetente, texto de abertura, título dos destaques, horas de reserva, anos de guarda dos dados, desconto padrão. Quem edita: `shop.manage`.
- Nome da loja, cores e logo vêm do site e do tema da organização.

### 3.11 Privacidade
- Guarda nome, telefone, e-mail, itens e valores (sem CPF; IP só como hash no limite de tentativas). O aviso promete guardar "até N anos" e depois apagar ou anonimizar, mas **nenhuma rotina faz isso** (⚠ LGPD-01).

---

## 4. Site institucional (público)

- Uma linha `site_settings` por organização; o público lê só pela RPC `get_public_site` (devolve a linha inteira menos `organization_id`/`updated_at`, ⚠ SITE-02).
- Cabeçalho com foto (ou o logo), título opcional, **raios** configuráveis (quantidade, opacidade, rotação, cor, animação/velocidade, contorno, tela cheia).
- Descrição e até 20 links de redes (WhatsApp, e-mail, telefone, Instagram, TikTok, sites), com ocultar por link.
- **Menu** com Inscrições, Loja, Fotos, Release e Entrar: ordem, rótulo e visibilidade configuráveis; marcação "em construção" (o botão Entrar ignora); "chacoalhar" um botão para chamar atenção.
  - Inscrições: um botão por formulário aberto; sem formulário aberto, botão cinza desativado.
  - Loja: cartão do produto em destaque no site (se ativo, não oculto e loja não em construção).
  - Release: só com URL `https://`.
- Vídeos do YouTube (`youtube-nocookie`), 3 por vez.
- **Álbuns** (Google Fotos), filtrados por ano, 6 por vez; álbum sem data não aparece ao público. A capa é copiada pela edge `album-preview`.
- Prévia de link (título e descrição) reescrita pelo Worker da Cloudflare nas rotas `/` e `/site`.
- O site salva sozinho 0,8 s depois da última mudança.
