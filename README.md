# SIGBloco — instância Cordão da Tia Juca

Veja a proposta em [docs/PROPOSTA_TECNICA.md](docs/PROPOSTA_TECNICA.md) e as políticas em [docs/RLS.md](docs/RLS.md).

## Rodando

```bash
npm install
cp .env.example .env   # preencha URL e chave pública do Supabase
npm run dev
```

## Banco

Aplicar em ordem `supabase/migrations/*.sql` e depois `supabase/seed/tiajuca.sql`.
Primeiro diretor (SQL Editor, como postgres):

```sql
select public.bootstrap_first_director('tiajuca', 'email@exemplo.com', 'Nome Completo');
```

Em *Authentication → URL Configuration*, cadastre a URL do app e `/redefinir-senha`; habilite o provedor Google.
