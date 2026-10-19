-- Logo/foto da página inicial também em SVG (exibido só via <img>/favicon, onde o navegador não executa script).
update storage.buckets set allowed_mime_types = array['image/png','image/jpeg','image/webp','image/svg+xml'] where id = 'site-public';
