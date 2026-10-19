# Integração com o Google Drive (partituras)

Opcional. Sem ela, o repertório continua aceitando **link colado** e **arquivo enviado** (Supabase Storage).

## Como funciona
- A Edge Function `drive-search` (`supabase/functions/drive-search/index.ts`) lista/busca arquivos numa **pasta institucional**.
- Usa uma **conta de serviço** (robô) do Google — não a conta pessoal de ninguém. Escopo **somente leitura**.
- A credencial fica **só** no segredo `GOOGLE_SERVICE_ACCOUNT_JSON` da função. Não vai para o navegador nem para o banco.
- A pasta raiz permitida é a cadastrada em **Configurações → Integrações** (guardada no banco). O navegador não escolhe a pasta: só navega dentro dela.
- Só quem edita o repertório (Direção) consegue buscar. Ao escolher um arquivo, **apenas o link e o ID** são guardados na música.
- Quem abrir o link precisa ter acesso ao arquivo no Drive (compartilhe a pasta com o grupo do bloco).

## Passo a passo (uma vez)
1. **Google Cloud** (use uma conta institucional do bloco): crie um projeto → *APIs e serviços* → ative **Google Drive API**.
2. *IAM e administrador → Contas de serviço* → **Criar conta de serviço** (ex.: `sigbloco-drive`). Em *Chaves* → **Adicionar chave → JSON** e baixe o arquivo. **Guarde-o com segurança; não envie por chat nem salve no repositório.**
3. No **Google Drive**, crie/escolha a pasta de partituras e **compartilhe com o e-mail da conta de serviço** (`...@...iam.gserviceaccount.com`) como **Leitor**.
4. No **Supabase** → *Edge Functions → Secrets*, crie `GOOGLE_SERVICE_ACCOUNT_JSON` com o **conteúdo inteiro** do JSON baixado.
5. Publique a função (`supabase functions deploy drive-search`, ou pelo painel: *Edge Functions → Deploy a new function* com o conteúdo de `supabase/functions/drive-search/index.ts`). Mantenha a verificação de JWT ligada.
6. No app: **Configurações → Integrações** → cole o link da pasta, marque *Ativar* → **Salvar** → **Testar conexão**.
7. Em uma música, o botão **Buscar no Google Drive** passa a aparecer.

## Riscos e limites conhecidos
- Se a conta de serviço for apagada ou a chave revogada, a busca para; o resto do sistema segue normal.
- A busca é por nome, dentro da pasta aberta (não recursiva). Navegue pelas subpastas.
- O acesso ao arquivo continua sendo controlado pelo Drive, não pelo SIGBloco.
- Troque a chave da conta de serviço periodicamente e sempre que alguém com acesso a ela sair da Direção.

## Compartilhar pastas automaticamente (Google Drive → Sincronizar acesso)
Além da busca de partituras, o app pode **compartilhar uma pasta do Drive com os e-mails de quem tem acesso a ela no app**.

- **Quem entra:** quem tem regra de acesso na pasta (papel, naipe ou instrumento), **e** está ativo no ciclo atual (ou é equipe: Professor/Monitor), tem e-mail e não está arquivado. **Direção e Titular sempre entram.**
- **O que o app faz:** libera como **leitor** quem falta e remove só quem **o próprio app compartilhou antes** e saiu da regra. Donos e compartilhamentos manuais nunca são tocados. Nenhum e-mail do Google é disparado; quem não tem conta Google aparece em "Não foi possível compartilhar".
- **Antes de aplicar** o app mostra a prévia (quem ganha e quem perde acesso).

### Configuração (uma vez)
1. Use a **mesma conta de serviço** da busca (segredo `GOOGLE_SERVICE_ACCOUNT_JSON`). A **Google Drive API** precisa estar ativada.
2. No Drive, compartilhe cada pasta com o e-mail da conta de serviço como **Editor** (leitor não basta para gerenciar permissões).
3. Publique a função `drive-sync` (`supabase/functions/drive-sync/index.ts`), com a verificação de JWT ligada.
4. Aplique a migration `0019_drive_sync.sql`.
5. Em **Google Drive** (menu), cadastre a pasta com o link `…/folders/ID`, marque quem acessa e clique em **Sincronizar acesso**.

### Limites
- A sincronização é **manual** (botão). Depois de mudar papéis, naipes ou status de pessoas, sincronize de novo.
- Pastas dentro de **Drives compartilhados** podem ter regras próprias de quem pode compartilhar.
- Mudanças de e-mail não removem o e-mail antigo; o app só remove o que registrou.
