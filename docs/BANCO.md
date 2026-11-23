# Banco de dados: como lidar com as migrations

- **A fonte da verdade é o banco de produção** (Supabase `dzyvtqrxmladsxceqzud`). As pastas `supabase/migrations` guardam o histórico, não um roteiro que recria o banco do zero.
- **Não use `supabase db push` nem `db reset`.** Há prefixos de versão repetidos, arquivos cujas versões diferem das registradas no banco e cerca de 70 migrations que reescrevem funções por `replace()` sobre a definição vigente. Recriar o banco por elas não é seguro.
- Para saber o que vale hoje, consulte o banco (`pg_get_functiondef`, `pg_policies`), não o arquivo.
- Fluxo de mudança: escrever o SQL, mostrar ao responsável, aplicar com `apply_migration` e renomear o arquivo para a versão registrada (`list_migrations`).
- `supabase/apply_all.sql` e `apply_phase2.sql` foram apagados (só cobriam as fases 1 e 2).
- `supabase/config.toml` só registra o `verify_jwt` das Edge Functions: webhooks `false`, o resto `true`.
- Edge Functions são publicadas isoladas (sem pasta compartilhada): `infinitepay.ts` e `verify.ts` existem em mais de uma pasta. `supabase/functions/copias.test.ts` falha se as cópias divergirem.
- **Pendências conhecidas:** `pg_net` no schema `public` (a extensão não é relocável); `v_member_directory` como view definer (intencional: só nome de exibição, filtrada por `is_org_member`); baseline consolidada do esquema (DRIFT-02/03) não feita.

SEG-11 aplicado na etapa 7 (`20261123141531`): `set_updated_at` e `enforce_member_adult` com `search_path = ''`.
