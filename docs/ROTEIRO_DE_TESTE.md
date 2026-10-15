# Roteiro de teste — SIGBloco / Cordão da Tia Juca (versão com dados reais importados)

Use o site publicado: **https://tiajuca.cordaodatiajuca.workers.dev** (ou `npm run dev`). Entre com a conta **Titular** (`cordaodatiajuca@gmail.com`). Marque ✅/❌ e anote a tela e a mensagem de erro dos ❌.

> **Atenção:** o banco já tem as **76 pessoas reais** da planilha de controle 2026/27. Para brincar sem sujar os dados, crie cadastros de teste com o prefixo **"TESTE …"** e apague/arquive depois. **Não gere cobranças do mês nem baixe pagamentos de pessoas reais** sem querer: use só as pessoas "TESTE" nos testes de escrita.

## 0. Conferir a importação (10 min)
- [ ] **Integrantes**: a lista mostra **76 integrantes** (73 da planilha + 3 já existentes). A busca por nome, apelido e e-mail funciona.
- [ ] Abra 3 fichas (ex.: Amanda, Letícia Bove, Thiago Dessi): nome, apelido ("Thiago", não a brincadeira), WhatsApp, Instagram como botão clicável, instrumento, status no ciclo. Confira os **dados sensíveis** (gênero, raça, PCD) só com a conta Titular/Direção.
- [ ] **Início** (painel): quantidade de ativos, inativos e por naipe. Andreya e Sebastien aparecem como **Inativos**.
- [ ] **Mensalidades**, competência a competência (Jun a Out/2026). O **recebido** deve bater com a planilha: Jun **R$ 4.350**, Jul **R$ 4.200**, Ago **R$ 4.250**, Set **R$ 4.000**, Out **R$ 1.250**. (A aba Gestão mostra R$ 5.000 em agosto por causa de R$ 750 de "Sopro Aluno" que não está nos integrantes: veja se isso é lançamento a incluir.) Em aberto: Jun R$ 150, Jul R$ 300. **4 bolsas** de 100% (Ana Karenina, Fernanda Pires, Geiza, Thiago Dessi).
- [ ] **Financeiro → Distribuição**: Caixa **10%**, Monitores **25%**, Direção e mestres de bateria **60%**, mais **R$ 320 fixos** da Rebeca desde setembro. Em setembro: base R$ 4.000 − R$ 320 = R$ 3.680; Caixa **R$ 368**, Monitores **R$ 920**, Direção e mestres **R$ 2.208** (igual à planilha). Os 5% de **Produção** não estão distribuídos (não há produtor).
- [ ] **Acesso e papéis**: Direção = Rafael, Maira, Marcelo; Professores = Miguel, Letícia, Rebeca; Monitores = 9 pessoas (Ana Silveira, Paty, Camila, Juliana, Kathrin, Laura, Luciano, Logato, Renato). Esses papéis só valem quando a pessoa tiver **conta vinculada**.
- [ ] **Categorias de contribuição** (Configurações → Contribuições): Aluno R$ 150, **Senior** R$ 50, **Banda** R$ 50, Pernalta R$ 35, Isento (equipe) R$ 0. Troque algum integrante de Senior para Banda e confira que a ficha muda.
- [ ] **Chave PIX da equipe** (visível a Direção): 9 chaves importadas. Letícia, Maira e as chaves institucionais (conta e caixa) ainda **não** estão cadastradas.
- [ ] **Fornecedores**: 8 categorias fechadas (Sonorização, Banheiro químico, Acessibilidade, Tenda, Bebidas, Transporte (frete), Churrasqueiro, Fotógrafo), 15 contatos; telefone liga, WhatsApp abre, site abre. Crie e desative um fornecedor "TESTE".

## 1. Convites e contas (20 min)
- [ ] Em **Integrantes**, gere um **convite** para uma pessoa **TESTE** (use um e-mail alternativo seu), abra o link em janela anônima, crie a conta e aceite. A conta passa a ver o app.
- [ ] Conceda **Professor** a essa conta (Acesso e papéis) e confira o que muda no menu.
- [ ] (Quando for convidar a equipe de verdade) convide primeiro **Direção** (Rafael, Maira, Marcelo) e confirme que os papéis importados passam a valer.
- [ ] Tente remover a Direção de si mesmo sendo o único diretor: o app recusa. Só o **Titular** concede/remove Direção.

## 2. Estrutura, ciclos e vagas
- [ ] **Configurações → Naipes** (fechados por padrão) e **Instrumentos** agrupados por naipe/subnaipe, com o **filtro (funil)**. Os instrumentos da planilha existem; "Mestre de bateria" é **função**.
- [ ] **Ciclos**: existe o ciclo atual "Carnaval 2026/27". **Vagas**: defina um limite para um instrumento (ex.: Tamborim) e veja ocupados × vagas.
- [ ] **Integrantes → ficha**: troque o status de uma pessoa **TESTE** no ciclo (Ativo/Inativo/Lista de espera). Com vaga lotada aparece "Vaga lotada" e *Autorizar exceção*.
- [ ] Tente cadastrar alguém **menor de 18**: recusado.
- [ ] **Equipe**: confira os vínculos (professores de Percussão e dos saxofones/clarinete/flauta; monitores nos próprios instrumentos). Ajuste se o grupo do monitor deve ser outro.

## 3. Eventos e presença
- [ ] **Eventos**: ensaios das segundas (recorrência). Crie um evento "TESTE" com horário `hh:mm` e público por instrumento.
- [ ] **Presença → abrir chamada** (no celular): Presente/Ausente/Justificado, observação, pessoa fora da lista. Contadores atualizam.
- [ ] **Checklist**: evento → *Usar modelo* "Apresentação / Cortejo" (14 tarefas), responsável, status, barra de progresso.
- [ ] **Relatórios**: por integrante/instrumento/naipe/mês; **CSV**; faltas consecutivas.

## 4. Mensalidades, bolsas e financeiro
- [ ] **Gerar cobranças** de um mês **futuro** (ou o próximo) e confirme que **não duplica** ao gerar de novo e que quem está Inativo não é cobrado. Se não quiser cobranças reais ainda, gere só depois de conferir a lista de ativos.
- [ ] Marque uma cobrança **TESTE** como paga, ajuste um valor (motivo obrigatório), **Copiar inadimplentes** e cole no WhatsApp (revise antes de enviar a alguém!).
- [ ] **Bolsas**: indicadores (pessoas, soma %, equivalente em bolsas integrais, impacto).
- [ ] **Financeiro**: lance receita/despesa "TESTE", cancele com motivo; confira o resumo do mês. **Equipe → Novo pagamento** (ex.: repasse da Direção) e baixa com a chave PIX.

## 5. Repertório e Drive
- [ ] Repertório "TESTE", 2 músicas, reordenar, anexar link e **enviar PDF** (≤ 25 MB). **Copiar lista / WhatsApp**.
- [ ] (Opcional) **Drive**: só funciona depois de seguir `docs/GOOGLE_DRIVE.md` (conta de serviço + função `drive-search`).

## 6. Meu perfil e privacidade
- [ ] **Meu perfil**: edite seus dados; digite a rede social como `@usuario` ou `instagram.com/x` e confira que vira link clicável. Cadastre sua chave PIX.
- [ ] **Dados sensíveis** (gênero, raça, PCD) só aparecem para Titular/Direção; o próprio integrante vê e edita os seus; consentimentos registrados.

## 7. Formulário público de inscrição
1. **Inscrições** → "Inscrição de novos integrantes" (rascunho). Revise o **texto de privacidade** (peça revisão jurídica), ciclo, datas e mensagem. **Publicar** e copie o link (`/f/tiajuca/inscricao`).
2. Abra em **janela anônima e no celular**: identidade visual do bloco, campos obrigatórios com `*`.
3. Teste: PCD Sim → aparece "Qual?"; enviar **sem consentimento**; **menor de 18**; **e-mail repetido** (use o de alguém já importado: deve avisar/barrar); telefone e data com máscara.
4. Envie uma inscrição válida (e-mail seu) → mensagem de confirmação.
5. **Inscrições → Respostas**: abra, veja os dados sensíveis recolhidos, **Aprovar** (ou Lista de espera) e confira em **Integrantes** o cadastro criado. Depois arquive o "TESTE".
6. **Encerrar inscrições** → o link passa a dizer "encerradas". Publique nova versão após editar um campo: respostas antigas continuam legíveis.

## 8. Mobile
F12 → modo celular (375 px): barra inferior com Início, Repertório, Eventos, Presença, Mensalidades + **Mais**; chamada com botões grandes; sem rolagem horizontal; menus e fichas abrem sem cortar.

## 9. Permissões (com as contas de teste)
| Conta | Deve ver | NÃO deve ver |
|---|---|---|
| **Integrante** | Início, Repertório, Eventos, Mensalidades (só as dele), Meu perfil | Integrantes dos outros, Financeiro, Bolsas, Relatórios, Auditoria, Configurações, Inscrições, **Fornecedores** |
| **Monitor** | Seu grupo (Integrantes/Presença/Relatórios do grupo), **Fornecedores (só leitura)**, Meu perfil + PIX | Financeiro, mensalidades de terceiros, dados sensíveis, Inscrições, Auditoria |
| **Professor** | Igual ao Monitor, com seu grupo, mais **Fornecedores (só leitura)** | Financeiro, mensalidades de terceiros, dados sensíveis, Inscrições, Auditoria |
| **Direção / Titular** | Tudo (Titular também transfere a titularidade e concede Direção) | — |
Teste também **digitando a URL** de páginas proibidas (ex.: `/tiajuca/financeiro` como Integrante): deve mostrar vazio/erro, nunca dados. A matriz de permissões pode ser ajustada em **Acesso e papéis → Permissões**.

## 10. Antes de convidar pessoas reais (obrigatório)
- [ ] Apagar/arquivar os cadastros e dados **"TESTE"**.
- [ ] **Texto de privacidade/consentimento (LGPD)** revisado; retenção (6/12 meses) confirmada.
- [ ] **Auth**: só a URL de produção em *Authentication → URL Configuration* (tirar `localhost`); **e-mail (SMTP próprio)** configurado; login com Google configurado ou removido.
- [ ] **Backups** do Supabase (plano gratuito não tem backup diário) e plano pago antes de dados reais em escala.
- [ ] **Segredos**: nunca usar `service_role` no front.
- [ ] **Pasta `data-private/`** (planilhas e SQL de importação com dados pessoais): fora do git; guarde ou apague.
- [ ] Revisar quem é **Banda** (hoje todos Senior), as **chaves PIX** faltantes e os **5% de Produção**.
- [ ] **Google Drive** (se for usar): `docs/GOOGLE_DRIVE.md`.

## Próximas fases planejadas (detalhes em [PLANO_FASES_10_13.md](PLANO_FASES_10_13.md))
| Fase | Módulo | O que traz | Risco |
|---|---|---|---|
| **10** | Biblioteca de mensagens | Mensagens prontas (cobrança, boas-vindas, lista de espera, lembrete) com variáveis `{nome}`, `{valor}`…; copiar/abrir no WhatsApp; uso direto nas telas de Mensalidades, Eventos, Lista de espera e Inscrições | baixo |
| **11** | Inscrições v2 | Seções e saltos condicionais, campos reutilizáveis, modelos dos formulários atuais (Sopros, Percussão, Pernaltas, Aula aberta), vagas/lista de espera automática, checagem de duplicidade | médio |
| **12** | Lojinha básica | Vitrine pública de produtos (variantes, combos, fotos), venda por WhatsApp, administração pela Direção, estoque controlado pelo sistema | médio |
| **13** | Pedidos + InfinitePay | Pedido no servidor, checkout, webhook idempotente, conciliação, receita "Lojinha" no financeiro (sem CNPJ, conta InfinitePay, pedidos tratados pela Direção) | alto |

## Pendências conhecidas (ainda não construído)
- **Notificações** (e-mail/WhatsApp), lista de espera automática por naipe, fechamento mensal financeiro, relatórios financeiros históricos.
- **Chaves PIX do bloco** (conta e caixa) não têm tela própria (hoje só há PIX por pessoa).
- **Testes automatizados de front** e **pgTAP no CI** (os testes SQL atuais são manuais, no SQL Editor).
