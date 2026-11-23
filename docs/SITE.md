# Site público: o que é configurável e o que ainda é fixo no código

Página inicial (`/` e `/site`), álbuns (`/:slug/fotos`), loja e formulários públicos. Os dados vêm só de RPCs `security definer` (`get_public_site`, `get_public_albums`, `get_public_org`), que listam as colunas públicas uma a uma.

## Segurança do site (etapa 5)
- Cabeçalhos em `public/_headers` e, para as rotas que passam pelo Worker (`/` e `/site`), em `worker/index.js`. **Os dois precisam ficar iguais.**
- CSP: `script-src 'self'` (sem script inline; o recarregamento do `index.html` fica em `public/empty-reload.js`), `connect-src` só com o próprio site e o projeto do Supabase, `frame-src` só YouTube (nocookie), `frame-ancestors 'none'`. Estilo inline e imagens de qualquer `https` são liberados de propósito. Trocar o projeto do Supabase exige trocar o endereço em `connect-src`.
- Prévia do link: o Worker troca título, descrição e imagem (`og:image` usa o endereço em que o site está).

## Para reaproveitar em outro bloco
Configurável no painel: nome, logo, cores (`organizations.theme`), textos e botões do site, Pix, contatos da loja, remetente de e-mail.
Ainda fixo no código (inventário completo na seção 8.5 do `REVISAO.md`):
- `index.html`: título, descrição e `og:*` padrão (o Worker substitui título/descrição pelos do painel); `public/manifest.webmanifest` e `public/brand/*`;
- slug do bloco em `.env.production` (`VITE_DEFAULT_ORG_SLUG`) e `wrangler.jsonc` (`ORG_SLUG`, `SUPABASE_URL`, `SUPABASE_KEY`);
- cor padrão `#E93D2B`, fuso `America/Sao_Paulo`, DDI 55 / DDD 21, cidade do BR Code, vocabulário "ensaio", conta SMTP única.
