# Baseline do esquema

`schema.sql` é o retrato do esquema de produção em 23/11/2026 (DRIFT-02/03): extensões, tipos, tabelas, padrões, funções (definição vigente), restrições, índices, views, gatilhos, RLS, políticas (`public` e `storage`), permissões, buckets e agendamentos.

- **Não é uma migration.** Não rode em produção nem com `supabase db push`. O histórico em `supabase/migrations` continua como está (não é um roteiro para recriar o banco).
- **Uso:** subir um banco vazio de teste (o Supabase já traz os schemas `auth` e `storage` e os papéis `anon`/`authenticated`/`service_role`) e rodar o arquivo, de preferência numa sessão com `check_function_bodies = false` (já está no cabeçalho).
- **Sem dados.** Papéis, permissões e modelos vêm de `supabase/seed` e das migrations; confira antes de usar um banco recriado.
- **Conferido:** reproduzido num Postgres vazio (PGlite, com `auth`/`storage`/papéis simulados): todas as seções rodam; só ficou de fora o que o PGlite não tem (`pg_trgm`, `pg_cron`, `pg_net`).
- **Atualizar:** quando o esquema mudar de forma relevante, gere de novo a partir do banco (consultas só de leitura em `pg_catalog`: `pg_get_functiondef`, `pg_get_constraintdef`, `pg_get_indexdef`, `pg_get_triggerdef`, `pg_policies`, `pg_get_viewdef`) e confira o diff.
- **Atualizado em 23/11/2026** com a migration `20261123160407_unifica_professor_monitor` (papel único Professor/Monitor): as 10 funções alteradas e o check de `page_releases.category`, conferidos por md5 contra `pg_get_functiondef` do banco.
