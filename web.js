// Común a todas las páginas de la web: que no se pueda meter dentro de otra página (la política de
// seguridad va en una <meta> y ahí no se puede prohibir) y el aviso de cookies de Google Analytics.
(() => {
  if (window.top !== window.self) {
    document.documentElement.style.display = 'none';
    try { window.top.location.replace(window.location.href); } catch {}
    return;
  }

  // Comprar Pro desde la web: se pide el correo, se abre Payhip en otra pestaña y aquí mismo se espera
  // el aviso del pago. Pro queda en este navegador: con la extensión (su puente, puente.js) también vale
  // en ome.tv al momento; si aún no está instalada, se activará sola al instalarla aquí.
  const API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://127.0.0.1:8787/api/' : 'https://senal.squadmeet.app/api/';
  const CLAVE_D = 'squadmeet:dispositivo', CLAVE_C = 'squadmeet:correo';
  const es = (document.documentElement.lang || 'es') === 'es';
  const T = es ? {
    siempre: 'Pro para siempre · 5 €', pase: 'Pro 31 días · 1,99 €',
    correo: 'Tu correo', ayudaCorreo: 'Te llegará el recibo. Usa el mismo al pagar en Payhip.', pagar: 'Pagar con Payhip', mal: 'Escribe bien tu correo.',
    seguro: 'Pago seguro con tarjeta o PayPal en Payhip. Pro se activa en este navegador en cuanto termines.',
    sinExt: 'Aún no tienes la extensión en este navegador: no pasa nada, Pro se activará solo al instalarla aquí.',
    esperando: 'Completa el pago en Payhip', esperandoTxt: (c) => `Paga con <strong>${c}</strong> en la pestaña de Payhip. Esto se actualiza solo.`,
    reabrir: 'Volver a abrir Payhip', otro: 'Cambiar de correo', lento: '¿Ya has pagado y no cambia? Comprueba que pagaste con este correo o escríbenos a contacto@squadmeet.app.',
    listo: '¡Ya eres Pro!', hasta: (f) => `Tienes Pro hasta el ${f}.`, siempreTxt: 'Para siempre, sin más pagos.',
    conExt: 'Ya está activo en tu extensión SquadMeet: abre ome.tv y crea tu grupo, sin límite.',
    instala: 'Instala SquadMeet en este navegador y Pro se activará solo. ¿En el móvil con el favorito? En el panel pulsa «¿Ya eres Pro?» y pon este correo.',
    abrir: 'Abrir ome.tv', instalar: 'Instalar SquadMeet', cerrar: 'Cerrar',
    instalada: '¡SquadMeet instalado!', instaladaTxt: 'Abre ome.tv: el panel de SquadMeet sale arriba a la derecha. Crea un grupo y manda el enlace a tus amigos.', yaPro: 'Y ya eres Pro:',
  } : {
    siempre: 'Pro forever · €5', pase: 'Pro 31 days · €1.99',
    correo: 'Your email', ayudaCorreo: 'Your receipt goes here. Use the same one when paying on Payhip.', pagar: 'Pay with Payhip', mal: 'Check your email address.',
    seguro: 'Secure payment by card or PayPal on Payhip. Pro turns on in this browser as soon as you’re done.',
    sinExt: 'You don’t have the extension in this browser yet: no problem, Pro will turn on by itself when you install it here.',
    esperando: 'Finish paying on Payhip', esperandoTxt: (c) => `Pay with <strong>${c}</strong> in the Payhip tab. This updates by itself.`,
    reabrir: 'Open Payhip again', otro: 'Use another email', lento: 'Paid and nothing changes? Make sure you paid with this email or write to contacto@squadmeet.app.',
    listo: 'You’re Pro!', hasta: (f) => `You have Pro until ${f}.`, siempreTxt: 'Forever, no more payments.',
    conExt: 'It’s already on in your SquadMeet extension: open ome.tv and create your group, no limits.',
    instala: 'Install SquadMeet in this browser and Pro turns on by itself. On your phone with the bookmark? In the panel tap “Already Pro?” and enter this email.',
    abrir: 'Open ome.tv', instalar: 'Install SquadMeet', cerrar: 'Close',
    instalada: 'SquadMeet is installed!', instaladaTxt: 'Open ome.tv: the SquadMeet panel shows up at the top right. Create a group and send the link to your friends.', yaPro: 'And you’re Pro:',
  };
  const VALIDO = /^[a-z0-9]{16,40}$/;
  const leerL = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
  const ponerL = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const escH = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let conExtension = false;
  const puente = new Promise((res) => {
    window.addEventListener('message', (e) => {
      if (e.source === window && e.data && e.data.tipo === 'squadmeet:puente') { conExtension = true; res(); }
    });
    window.postMessage({ tipo: 'squadmeet:puente?' }, location.origin);
    setTimeout(res, 800);
  });
  function dispositivo() {
    let d = leerL(CLAVE_D);
    if (!VALIDO.test(d)) {
      d = 'web' + [...crypto.getRandomValues(new Uint8Array(20))].map((b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
      ponerL(CLAVE_D, d);
    }
    return d;
  }
  async function api(ruta, extra = {}) {
    await puente;
    const r = await fetch(API + ruta, { method: 'POST', credentials: 'omit', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ dispositivo: dispositivo(), correo: leerL(CLAVE_C), ...extra }) });
    return r.json();
  }

  let dialogo = null, sondeo = 0, desde = 0, enlace = '', cual = 'siempre';
  function pintar(fase, datos = {}) {
    if (!dialogo) {
      dialogo = document.createElement('dialog');
      dialogo.className = 'dialogo-pro';
      dialogo.setAttribute('aria-labelledby', 'dialogo-pro-t');
      dialogo.addEventListener('close', () => { clearInterval(sondeo); dialogo.remove(); dialogo = null; });
      dialogo.addEventListener('click', (e) => { if (e.target === dialogo) dialogo.close(); });
      document.body.appendChild(dialogo);
      dialogo.showModal();
    }
    const correo = leerL(CLAVE_C);
    if (fase === 'correo') {
      dialogo.innerHTML = `<h2 id="dialogo-pro-t">${cual === 'pase' ? T.pase : T.siempre}</h2>
        <form class="formulario-pro" novalidate>
          <label for="pro-correo">${T.correo}</label>
          <input id="pro-correo" type="email" inputmode="email" autocomplete="email" required value="${escH(correo)}" placeholder="tucorreo@ejemplo.com">
          <p class="ayuda">${T.ayudaCorreo}</p>
          ${datos.error ? `<p class="error" role="alert">${datos.error}</p>` : ''}
          <button class="boton primario ancho-total" type="submit">${T.pagar}</button>
        </form>
        <p class="consejo">${T.seguro}</p>
        ${conExtension ? '' : `<p class="consejo">${T.sinExt}</p>`}
        <button class="cerrar-dialogo" type="button" aria-label="${T.cerrar}" data-cerrar>×</button>`;
      const f = dialogo.querySelector('form');
      f.addEventListener('submit', (e) => { e.preventDefault(); pagar(f.querySelector('input').value.trim()); });
      dialogo.querySelector('input').focus();
    } else if (fase === 'esperando') {
      dialogo.innerHTML = `<h2 id="dialogo-pro-t">${T.esperando}</h2>
        <p>${T.esperandoTxt(escH(correo))}</p>
        <span class="girando" aria-hidden="true"></span>
        ${Date.now() - desde > 120000 ? `<p class="consejo">${T.lento}</p>` : ''}
        <div class="acciones"><a class="boton primario" href="${escH(enlace)}" target="_blank" rel="noopener">${T.reabrir}</a><button class="boton" type="button" data-otro>${T.otro}</button></div>
        <button class="cerrar-dialogo" type="button" aria-label="${T.cerrar}" data-cerrar>×</button>`;
      dialogo.querySelector('[data-otro]').addEventListener('click', () => { clearInterval(sondeo); pintar('correo'); });
    } else if (fase === 'instalada') {
      const fecha = datos.hasta ? new Date(datos.hasta).toLocaleDateString(es ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'long' }) : '';
      dialogo.innerHTML = `<div class="listo-pro"><span class="sello-pro" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></span>
        <h2 id="dialogo-pro-t">${T.instalada}</h2>
        <p>${T.instaladaTxt}</p>
        ${datos.pro ? `<p><strong>${T.yaPro} ${datos.plan === 'pase' ? T.hasta(fecha) : T.siempreTxt}</strong></p>` : ''}
        <div class="acciones"><a class="boton primario" href="https://ome.tv/" target="_blank" rel="noopener">${T.abrir}</a><button class="boton" type="button" data-cerrar>${T.cerrar}</button></div></div>`;
    } else {
      const fecha = datos.hasta ? new Date(datos.hasta).toLocaleDateString(es ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'long' }) : '';
      dialogo.innerHTML = `<div class="listo-pro"><span class="sello-pro" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></span>
        <h2 id="dialogo-pro-t">${T.listo}</h2>
        <p><strong>${datos.plan === 'pase' ? T.hasta(fecha) : T.siempreTxt}</strong></p>
        <p>${conExtension ? T.conExt : T.instala}</p>
        <div class="acciones">${conExtension ? `<a class="boton primario" href="https://ome.tv/" target="_blank" rel="noopener">${T.abrir}</a>` : `<a class="boton primario" href="#${es ? 'instalar' : 'install'}" data-cerrar>${T.instalar}</a>`}<button class="boton" type="button" data-cerrar>${T.cerrar}</button></div></div>`;
    }
    for (const b of dialogo.querySelectorAll('[data-cerrar]')) b.addEventListener('click', () => dialogo && dialogo.close());
  }
  async function pagar(correo) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) { pintar('correo', { error: T.mal }); return; }
    // Se abre ya, dentro del clic, o el navegador bloquearía la ventana.
    window.open(enlace, '_blank', 'noopener');
    ponerL(CLAVE_C, correo);
    if (conExtension) window.postMessage({ tipo: 'squadmeet:correo', correo }, location.origin);
    desde = Date.now();
    pintar('esperando');
    try { await api('comprar', { correo }); } catch {}
    clearInterval(sondeo);
    sondeo = setInterval(comprobar, 4000);
  }
  async function comprobar() {
    if (!dialogo) return;
    if (Date.now() - desde > 30 * 60000) { clearInterval(sondeo); return; }
    try {
      const d = await api('estado');
      if (d.pro) {
        clearInterval(sondeo);
        if (conExtension) window.postMessage({ tipo: 'squadmeet:pro' }, location.origin);
        pintar('listo', d);
      } else if (Date.now() - desde > 120000 && !dialogo.querySelector('.consejo')) pintar('esperando');
    } catch {}
  }
  window.addEventListener('focus', () => { if (dialogo && sondeo) comprobar(); });
  // Recién instalada la extensión (fondo.js abre la web con ?instalada=1): bienvenida y, si ya pagó, su Pro.
  if (/[?&]instalada=1/.test(location.search)) {
    history.replaceState(null, '', location.pathname + location.hash);
    puente.then(async () => {
      let d = {};
      try { d = await api('estado'); } catch {}
      pintar('instalada', d);
    });
  }
  for (const a of document.querySelectorAll('[data-plan]')) {
    a.addEventListener('click', async (e) => {
      e.preventDefault();
      enlace = a.href;
      cual = a.dataset.plan === 'pase' ? 'pase' : 'siempre';
      await puente;
      pintar('correo');
    });
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
