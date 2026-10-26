// Común a todas las páginas de la web: que no se pueda meter dentro de otra página (la política de
// seguridad va en una <meta> y ahí no se puede prohibir) y el aviso de cookies de Google Analytics.
(() => {
  if (window.top !== window.self) {
    document.documentElement.style.display = 'none';
    try { window.top.location.replace(window.location.href); } catch {}
    return;
  }

  const aviso = document.getElementById('aviso-cookies');
  if (!aviso) return;
  const ID = aviso.dataset.ga;
  const CLAVE = 'squadmeet:cookies';
  const VIGENCIA = 365 * 24 * 3600 * 1000;   // se vuelve a preguntar al cabo de un año

  const leer = () => {
    try {
      const e = JSON.parse(localStorage.getItem(CLAVE));
      return e && Date.now() - e.t < VIGENCIA ? e.v : null;
    } catch { return null; }
  };
  const guardar = (v) => { try { localStorage.setItem(CLAVE, JSON.stringify({ v, t: Date.now() })); } catch {} };

  let cargado = false;
  function cargarAnalitica() {
    if (cargado || !ID) return;
    cargado = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', ID);
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ID)}`;
    document.head.appendChild(s);
  }
  // Al retirar el permiso se borran las cookies que haya dejado Google Analytics.
  function borrarCookies() {
    const dominios = [location.hostname, '.' + location.hostname.replace(/^www\./, '')];
    for (const c of document.cookie.split(';')) {
      const nombre = c.split('=')[0].trim();
      if (!/^_ga/.test(nombre)) continue;
      for (const d of dominios) document.cookie = `${nombre}=; Max-Age=0; path=/; domain=${d}`;
      document.cookie = `${nombre}=; Max-Age=0; path=/`;
    }
  }

  function mostrar() {
    aviso.hidden = false;
    aviso.querySelector('[data-cookies="si"]').focus({ preventScroll: true });
  }
  aviso.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cookies]');
    if (!b) return;
    const antes = leer();
    guardar(b.dataset.cookies);
    aviso.hidden = true;
    if (b.dataset.cookies === 'si') cargarAnalitica();
    else if (antes === 'si') { borrarCookies(); location.reload(); }
  });
  for (const b of document.querySelectorAll('[data-cookies="abrir"]')) b.addEventListener('click', mostrar);

  const eleccion = leer();
  if (eleccion === 'si') cargarAnalitica();
  else if (eleccion === null) aviso.hidden = false;
})();
