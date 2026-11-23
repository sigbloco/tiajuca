// Se o app não aparecer (arquivo ainda sendo publicado, rede falhou), tenta de novo uma vez em vez de deixar a tela em branco.
// Fica em arquivo próprio (e não inline no index.html) para a política de segurança (CSP) não precisar liberar script inline.
setTimeout(function () {
  var r = document.getElementById('root')
  if (r && !r.firstChild) { try { if (sessionStorage.getItem('sigbloco:empty-reload')) return; sessionStorage.setItem('sigbloco:empty-reload', '1') } catch (e) {} location.reload() }
}, 4000)
