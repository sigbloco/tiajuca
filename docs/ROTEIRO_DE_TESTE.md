# Roteiro de teste — SIGBloco / Cordão da Tia Juca

Rode com `npm run dev` e entre como **Direção**. Use dados fictícios (nomes como "Teste 1"). Marque ✅/❌ e anote a tela e a mensagem de erro dos ❌.
Para os testes de permissão você precisará de **mais duas contas** (ex.: um e-mail seu alternativo): uma como *Integrante* e outra como *Professor*.

## 0. Preparação (10 min)
1. **Configurações → Equipe**: nada a fazer ainda. Em **Membros**, crie 4 pessoas de teste (maiores de 18): `Teste Aluno`, `Teste Músico`, `Teste Professor`, `Teste Integrante`. Use o e-mail alternativo no *Teste Professor* e no *Teste Integrante*.
2. Em cada um, **Convidar** → copie o link → abra numa janela anônima, crie a conta (ou entre) e aceite o convite. Confirme que a conta passa a ver o app.
3. Em **Membros → Teste Professor**: ainda sem papel? Peça a papéis via SQL (`member_access_roles`) — a tela de papéis ainda não existe (ver "Pendências").

## 1. Estrutura e ciclos
- [ ] **Configurações → Naipes**: Sopro, Percussão, Performance aparecem, **fechados**. Abra Percussão: subnaipes Graves/Leves/Agudos/Chocalhos. Crie um subnaipe, renomeie, mude a ordem, desative.
- [ ] **Instrumentos**: agrupados por naipe → subnaipe, fechados. Mova "Tamborim" para o subnaipe "Leves". Use o **filtro (funil)**: buscar "tam", só ativos, por naipe.
- [ ] **Ciclos → Novo ciclo** "Carnaval 2026/2027" (datas com máscara `dd/mm/aaaa`, sem calendário) → **Tornar atual**.
- [ ] **Vagas**: limite 1 em Tamborim.

## 2. Membros e participação
- [ ] Ficha de *Teste Aluno*: vínculo **Percussão → Tamborim**, status no ciclo **Ativo**.
- [ ] Ficha de *Teste Músico*: mesmo vínculo; status **Ativo** → deve dar **"Vaga lotada"** com botão *Autorizar exceção*. Coloque em **Lista de espera** e confira a página *Lista de espera* (promover dá o mesmo aviso).
- [ ] Tente cadastrar alguém **menor de 18 anos**: o app e o banco recusam.
- [ ] Em **Equipe**: atribua *Teste Professor* ao **subnaipe Leves** (e depois ao naipe inteiro) e confira o que ele passa a enxergar (passo 9).

## 3. Eventos e presença
- [ ] **Eventos**: aparece a recorrência "Ensaio" nas segundas. Crie um evento hoje com horário `hh:mm`, público = instrumento Tamborim.
- [ ] **Configurações → Recorrências**: edite horário/local; "Encerrar" cancela os futuros.
- [ ] **Presença → abrir chamada** (use o celular ou F12 → modo celular): marque Presente/Ausente/Justificado, adicione uma observação e uma pessoa **fora da lista**. Contadores no topo atualizam.
- [ ] **Checklist**: abra um evento → *Usar modelo* "Apresentação / Cortejo" (14 tarefas) → defina responsável, avance status, veja a **barra de progresso**.

## 4. Mensalidades, bolsas e financeiro
- [ ] **Configurações → Contribuições**: Aluno R$ 150, Músico R$ 50, Pernalta R$ 35; **Feriados**: confira.
- [ ] Ficha: *Teste Aluno* = categoria Aluno; *Teste Músico* = Músico com **bolsa 50%**.
- [ ] **Mensalidades → Gerar cobranças** (2×: não duplica). Confira R$ 150 e R$ 25, vencimento dia 10 (ou próximo dia útil).
- [ ] Ajuste um valor (motivo obrigatório), marque outro como pago, **Copiar inadimplentes** e cole no WhatsApp.
- [ ] **Bolsas**: indicadores (pessoas, soma %, equivalente em bolsas integrais, impacto).
- [ ] **Financeiro**: lance uma receita e uma despesa (máscara R$), cancele uma com motivo; **Distribuição**: crie regras (ex.: Direção 30% + Caixa fixo R$ 100) e veja a simulação; tente passar de 100% na mesma base (deve recusar).
- [ ] **Equipe → Novo pagamento** para o Professor; em **Meu perfil** (como Professor) cadastre a chave PIX, depois baixe o pagamento e veja a chave usada.

## 5. Repertório
- [ ] Crie um repertório (cor), 2 músicas, reordene. **Anexe** um link e **envie um PDF** (≤ 25 MB). Abra o PDF (URL assinada).
- [ ] **Copiar lista** / **WhatsApp**. Como Integrante: só leitura.

## 6. Relatórios, auditoria, painéis
- [ ] **Relatórios**: por integrante/instrumento/naipe/ciclo/mês; **CSV**; faltas consecutivas.
- [ ] **Auditoria**: filtre por tipo/ação/data; abra um item e veja o "antes → depois". Dados sensíveis mostram só os campos alterados.
- [ ] **Início**: Direção vê o painel completo; Integrante vê só o próprio status/frequência/mensalidade.

## 7. Formulário público (o mais importante)
1. **Inscrições** → abra "Inscrição de novos integrantes" (rascunho). Revise o **texto de privacidade** (peça revisão jurídica), configure ciclo, datas e mensagem. **Publicar**. Copie o link.
2. Abra o link **em janela anônima e no celular**: identidade visual do bloco, campos obrigatórios com `*`.
3. Teste: *É PCD? Sim* → aparece "Qual?"; *Toca instrumento? Sim* → Instrumento/Nível; data de nascimento com máscara; enviar **sem consentimento**; **menor de 18**; **e-mail repetido**; e-mail inválido.
4. Envie uma inscrição válida → mensagem de confirmação.
5. Como Direção, **Inscrições → Respostas**: abra, veja "Dados sensíveis" recolhidos; **Aprovar** (escolha "Lista de espera") → confira em **Membros** o integrante criado com e-mail, telefone, vínculo e consentimento, sem digitar de novo.
6. **Encerrar inscrições** → o link passa a dizer "encerradas". **Publicar nova versão** após editar um campo → respostas antigas continuam legíveis.
7. (Opcional) adicione um campo **Envio de arquivo**, republique e envie um PDF pelo link público.

## 8. Mobile
F12 → modo celular (375 px): barra inferior com **Início, Repertório, Eventos, Presença, Mensalidades + Mais**; chamada com botões grandes; nenhuma tela com rolagem horizontal.

## 9. Permissões (com as contas alternativas)
| Conta | Deve ver | NÃO deve ver |
|---|---|---|
| **Integrante** | Início, Repertório, Eventos, Mensalidades (só as dele), Meu perfil | Membros dos outros, Financeiro, Bolsas, Relatórios, Auditoria, Configurações, Inscrições, nenhum **subnaipe** |
| **Professor** | Seu grupo (Membros/Chamada/Relatórios do grupo), Meu perfil + PIX | Financeiro, mensalidades de terceiros, dados sensíveis, Inscrições, Auditoria |
| **Direção** | Tudo | — |
Teste também **digitando a URL** de páginas proibidas (ex.: `/tiajuca/financeiro` como Integrante): deve mostrar vazio/erro, nunca dados.

## 10. Antes de usar com pessoas reais (obrigatório)
- [ ] **Texto de privacidade/consentimento (LGPD)** revisado por quem entende; política de retenção (6/12 meses) confirmada.
- [ ] **Auth**: URL do site de produção em *Authentication → URL Configuration*; **e-mail (SMTP próprio)** configurado (o padrão do Supabase tem limite baixo); login com Google configurado ou removido do app.
- [ ] **Hospedagem** do front (ex.: Vercel) com as variáveis `VITE_*`; domínio; HTTPS.
- [ ] **Backups** do Supabase (plano gratuito não tem backup diário) e plano pago antes de dados reais.
- [ ] **Segredos**: nunca usar a chave `secret/service_role` no front; trocar chaves se algo vazar.
- [ ] **Sentry/monitoramento** (opcional) e um responsável técnico para atualizações do banco.
- [ ] **Google Drive** (se for usar): seguir `docs/GOOGLE_DRIVE.md`.
- [ ] Apagar os dados de teste (integrantes "Teste …", cobranças, eventos).

## Pendências conhecidas (ainda não construído)
- **Tela de papéis/permissões**: hoje papéis são atribuídos por SQL (`member_access_roles`).
- **Perfil completo do integrante** (edição dos próprios dados e dos dados sensíveis pelo titular) — há RPC, falta tela.
- **Notificações** (e-mail/WhatsApp), lista de espera automática por naipe, fechamento mensal financeiro, relatórios financeiros históricos.
- **Testes automatizados de front** e **pgTAP no CI** (os testes SQL atuais são manuais, no SQL Editor).
- **Último diretor**: o banco ainda não impede a Direção de remover o próprio papel.
