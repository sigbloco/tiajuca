# SIGBloco — instância Cordão da Tia Juca

Loja virtual do bloco: veja [docs/LOJA.md](docs/LOJA.md).

Documentos antigos (PROPOSTA_TECNICA, RLS) são históricos; vale o [CLAUDE.md](CLAUDE.md).

## Rodando

```bash
npm install
cp .env.example .env   # preencha URL e chave pública do Supabase
npm run dev
```

## Banco

Não recrie o banco pelas migrations: a fonte da verdade é o banco de produção. Leia [docs/BANCO.md](docs/BANCO.md). Regras de negócio, permissões e convenções: [CLAUDE.md](CLAUDE.md).

Em *Authentication → Providers* só o Google fica ligado; cadastre a URL do app em *URL Configuration*.
