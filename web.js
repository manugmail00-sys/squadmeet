// Común a todas las páginas de la web: que no se pueda meter dentro de otra página (la política de
// seguridad va en una <meta> y ahí no se puede prohibir) y el aviso de cookies de Google Analytics.
(() => {
  if (window.top !== window.self) {
    document.documentElement.style.display = 'none';
    try { window.top.location.replace(window.location.href); } catch {}
    return;
  }

  // Cuentas y Pro en la web. La cuenta es el correo, sin contraseñas: se entra con el código que llega
  // por correo, con el botón de ese correo, con Google, o pagando aquí con ese correo. Lo que «entra» es
  // este navegador (un identificador al azar). Con la extensión, su puente (puente.js) comparte ese
  // identificador y el correo con el panel de ome.tv: entrar, salir o pagar aquí vale allí al momento.
  const API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://127.0.0.1:8787/api/' : 'https://senal.squadmeet.app/api/';
  const CLAVE_D = 'squadmeet:dispositivo', CLAVE_C = 'squadmeet:correo', CLAVE_E = 'squadmeet:cuenta';
  const es = (document.documentElement.lang || 'es') === 'es';
  const PAGINA_CUENTA = es ? '/cuenta/' : '/en/account/';
  const fechaLarga = (t) => new Date(t).toLocaleDateString(es ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'long' });
  const T = es ? {
    entrar: 'Entrar', miCuenta: 'Mi cuenta',
    siempre: 'Pro para siempre · 5 €', pase: 'Pro 31 días · 1,99 €',
    correo: 'Tu correo', ayudaCorreo: 'Será tu cuenta de SquadMeet (sin contraseña). Usa el mismo al pagar.', pagar: 'Pagar con Payhip', mal: 'Escribe bien tu correo.',
    seguro: 'Pago seguro con tarjeta o PayPal en Payhip. Pro se activa solo en cuanto termines.',
    sinExt: 'Aún no tienes la extensión en este navegador: no pasa nada, al instalarla aquí ya serás Pro.',
    esperando: 'Completa el pago en Payhip', esperandoTxt: (c) => `Paga con <strong>${c}</strong> en la pestaña de Payhip. Esto se actualiza solo.`,
    reabrir: 'Volver a abrir Payhip', otro: 'Cambiar de correo',
    lento: (u) => `¿Ya has pagado y no cambia? Si pagaste con otro correo, <a href="${u}">entra con ese correo</a>. Si no, escríbenos a contacto@squadmeet.app.`,
    listo: '¡Ya eres Pro!', hasta: (f) => `Tienes Pro hasta el ${f}.`, siempreTxt: 'Para siempre, sin más pagos.',
    tuCuenta: (c) => `Tu cuenta es <strong>${c}</strong>: entra con ella en cualquier navegador y tendrás Pro.`,
    conExt: 'Ya está activo en tu extensión SquadMeet: abre ome.tv y crea tu grupo, sin límite.',
    instala: 'Instala SquadMeet en este navegador y Pro estará ahí al momento. ¿En otro ordenador o en el móvil? En el panel de SquadMeet pulsa «Entrar» y escribe tu correo.',
    abrir: 'Abrir ome.tv', instalar: 'Instalar SquadMeet', cerrar: 'Cerrar', irCuenta: 'Ver mi cuenta',
    instalada: '¡SquadMeet instalado!', instaladaTxt: 'Abre ome.tv: el panel de SquadMeet sale arriba a la derecha. Crea un grupo y manda el enlace a tus amigos.', yaPro: 'Y ya eres Pro:',
    // Mi cuenta
    entraTitulo: 'Entra en SquadMeet', entraTexto: 'Sin contraseñas: te mandamos un código a tu correo. Con tu cuenta, tu Pro te sigue a cualquier navegador.',
    google: 'Continuar con Google', oCorreo: 'o con tu correo', mandarCodigo: 'Enviarme un código', enviando: 'Enviando…',
    sinCuenta: '¿No tienes cuenta? Se crea sola la primera vez que entras.',
    miraCorreo: 'Mira tu correo', codigoEnviado: (c) => `Te hemos mandado un código de 6 cifras a <strong>${c}</strong>. Escríbelo aquí o pulsa «Entrar aquí» en el correo.`,
    codigo: 'Código', entrarBoton: 'Entrar', comprobando: 'Comprobando…',
    noLlega: '¿No llega? Mira en spam o', reenviar: 'mándalo otra vez', reenviarEn: (s) => `mándalo otra vez (en ${s} s)`, otroCorreo: 'Usar otro correo',
    entrarComo: 'Entrar en tu cuenta', entrarAquiTexto: 'Pulsa el botón para entrar en este navegador.', entrarAqui: 'Entrar aquí',
    gratis: 'Gratis', gratisTxt: '10 minutos al día con hasta 3 amigos. Con Pro, sin límite.',
    proSiempreTxt: 'Pro para siempre', proPaseTxt: (f) => `Pro hasta el ${f}`, quedan: (d) => (d <= 1 ? 'se acaba hoy' : `quedan ${d} días`),
    ventajas: ['Sin límite de tiempo', 'Hasta 5 amigos', 'HD para tus amigos', 'Chat del grupo y votos'],
    comprarSiempre: '<b>5 €</b> para siempre', comprarPase: '<b>1,99 €</b> · 31 días', renovar: '<b>Renovar</b> 31 días · 1,99 €', pasarSiempre: '<b>Para siempre</b> · 5 €', sinSuscripcion: 'Sin suscripción: nada se renueva solo.',
    extension: 'Extensión', extSi: 'Instalada en este navegador: tu cuenta ya vale en el panel de ome.tv.', extNo: 'No está en este navegador. Instálala y tu cuenta pasará sola al panel de ome.tv. ¿En el móvil? En el panel pulsa «Entrar».',
    navegadores: 'Navegadores con tu cuenta', este: 'Este navegador', navegador: 'Navegador', visto: (r) => `Usado ${r}`, cerrarSesion: 'Cerrar sesión',
    maxNav: 'Tu cuenta vale en hasta 3 navegadores a la vez. Si entras en otro, se cierra la sesión del que lleve más tiempo sin usarse.',
    salir: 'Cerrar sesión en este navegador',
    pagadoTitulo: '¡Pago completado!', pagadoPro: 'Ya eres Pro. Si estabas en ome.tv, vuelve a esa pestaña: el panel ya es Pro.', pagadoConfirmando: 'Estamos confirmando el pago con Payhip…',
    pagadoFuera: 'Para usar tu Pro, entra con el correo con el que has pagado.', bienvenida: (c) => `Has entrado como ${c}.`,
    errores: { correo: 'Escribe bien tu correo.', codigo: 'Ese código no es. Revísalo en el correo.', caducado: 'Ese código ya no vale. Pide otro.', despacio: 'Espera un poco antes de pedir otro código.', envio: 'No hemos podido mandar el correo. Prueba en un rato.', 'sin-correo': 'Ahora no podemos mandar correos. Prueba en un rato.', red: 'No hay conexión con SquadMeet. Prueba en un rato.', google: 'No se ha podido entrar con Google. Prueba con tu correo.', interno: 'Algo ha fallado. Prueba otra vez.' },
  } : {
    entrar: 'Sign in', miCuenta: 'My account',
    siempre: 'Pro forever · €5', pase: 'Pro 31 days · €1.99',
    correo: 'Your email', ayudaCorreo: 'It becomes your SquadMeet account (no password). Use the same one when paying.', pagar: 'Pay with Payhip', mal: 'Check your email address.',
    seguro: 'Secure payment by card or PayPal on Payhip. Pro turns on by itself as soon as you’re done.',
    sinExt: 'You don’t have the extension in this browser yet: no problem, you’ll be Pro as soon as you install it here.',
    esperando: 'Finish paying on Payhip', esperandoTxt: (c) => `Pay with <strong>${c}</strong> in the Payhip tab. This updates by itself.`,
    reabrir: 'Open Payhip again', otro: 'Use another email',
    lento: (u) => `Paid and nothing changes? If you paid with another email, <a href="${u}">sign in with that one</a>. Otherwise, write to contacto@squadmeet.app.`,
    listo: 'You’re Pro!', hasta: (f) => `You have Pro until ${f}.`, siempreTxt: 'Forever, no more payments.',
    tuCuenta: (c) => `Your account is <strong>${c}</strong>: sign in with it in any browser and you’ll have Pro.`,
    conExt: 'It’s already on in your SquadMeet extension: open ome.tv and create your group, no limits.',
    instala: 'Install SquadMeet in this browser and Pro will be there right away. On another computer or your phone? In the SquadMeet panel tap “Sign in” and type your email.',
    abrir: 'Open ome.tv', instalar: 'Install SquadMeet', cerrar: 'Close', irCuenta: 'Go to my account',
    instalada: 'SquadMeet is installed!', instaladaTxt: 'Open ome.tv: the SquadMeet panel shows up at the top right. Create a group and send the link to your friends.', yaPro: 'And you’re Pro:',
    entraTitulo: 'Sign in to SquadMeet', entraTexto: 'No passwords: we email you a code. With an account, your Pro follows you to any browser.',
    google: 'Continue with Google', oCorreo: 'or with your email', mandarCodigo: 'Email me a code', enviando: 'Sending…',
    sinCuenta: 'No account yet? It’s created the first time you sign in.',
    miraCorreo: 'Check your email', codigoEnviado: (c) => `We sent a 6-digit code to <strong>${c}</strong>. Type it here or tap “Sign in here” in the email.`,
    codigo: 'Code', entrarBoton: 'Sign in', comprobando: 'Checking…',
    noLlega: 'Not there? Check spam or', reenviar: 'send it again', reenviarEn: (s) => `send it again (in ${s}s)`, otroCorreo: 'Use another email',
    entrarComo: 'Sign in to your account', entrarAquiTexto: 'Tap the button to sign in on this browser.', entrarAqui: 'Sign in here',
    gratis: 'Free', gratisTxt: '10 minutes a day with up to 3 friends. With Pro, no limits.',
    proSiempreTxt: 'Pro forever', proPaseTxt: (f) => `Pro until ${f}`, quedan: (d) => (d <= 1 ? 'ends today' : `${d} days left`),
    ventajas: ['No time limit', 'Up to 5 friends', 'HD for your friends', 'Group chat and voting'],
    comprarSiempre: '<b>€5</b> forever', comprarPase: '<b>€1.99</b> · 31 days', renovar: '<b>Renew</b> 31 days · €1.99', pasarSiempre: '<b>Forever</b> · €5', sinSuscripcion: 'No subscription: nothing renews by itself.',
    extension: 'Extension', extSi: 'Installed in this browser: your account already works in the ome.tv panel.', extNo: 'It’s not in this browser. Install it and your account moves to the ome.tv panel by itself. On your phone? In the panel tap “Sign in”.',
    navegadores: 'Browsers signed in', este: 'This browser', navegador: 'Browser', visto: (r) => `Used ${r}`, cerrarSesion: 'Sign out',
    maxNav: 'Your account works in up to 3 browsers at a time. If you sign in on another, the one unused for longest is signed out.',
    salir: 'Sign out of this browser',
    pagadoTitulo: 'Payment complete!', pagadoPro: 'You’re Pro. If you were on ome.tv, go back to that tab: the panel is Pro already.', pagadoConfirmando: 'We’re confirming the payment with Payhip…',
    pagadoFuera: 'To use your Pro, sign in with the email you paid with.', bienvenida: (c) => `You’re signed in as ${c}.`,
    errores: { correo: 'Check your email address.', codigo: 'That code isn’t right. Check the email.', caducado: 'That code no longer works. Ask for another one.', despacio: 'Wait a moment before asking for another code.', envio: 'We couldn’t send the email. Try again in a while.', 'sin-correo': 'We can’t send emails right now. Try again in a while.', red: 'Can’t reach SquadMeet. Try again in a while.', google: 'Signing in with Google didn’t work. Try with your email.', interno: 'Something went wrong. Try again.' },
  };
  const VALIDO = /^[a-z0-9]{16,40}$/, ES_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const leerL = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
  const ponerL = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch {} };
  const escH = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CHECK = '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
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
  const correoActual = () => leerL(CLAVE_C);
  // El correo de la cuenta (o con el que se va a pagar). Con la extensión, también para el panel de ome.tv.
  function ponerCorreo(c) {
    ponerL(CLAVE_C, c);
    if (conExtension) window.postMessage({ tipo: 'squadmeet:correo', correo: c }, location.origin);
  }
  // Lo último que se supo de la cuenta, para pintar la cabecera sin esperar al servidor.
  const estadoGuardado = () => { try { return JSON.parse(leerL(CLAVE_E)) || {}; } catch { return {}; } };
  const dentro = () => !!(estadoGuardado().cuenta && correoActual());
  function guardarEstado(d) {
    if (typeof d.cuenta !== 'boolean') return;
    ponerL(CLAVE_E, JSON.stringify({ cuenta: d.cuenta, pro: !!d.pro, plan: d.plan || null, hasta: d.hasta || 0 }));
    pintarNav();
  }
  function pintarNav() {
    const e = estadoGuardado(), si = dentro();
    for (const a of document.querySelectorAll('[data-cuenta-nav]')) {
      a.classList.toggle('dentro', si);
      a.classList.toggle('pro', si && !!e.pro);
      a.querySelector('span').textContent = si ? T.miCuenta : T.entrar;
    }
  }
  pintarNav();
  async function api(ruta, extra = {}) {
    await puente;
    const cuerpo = { dispositivo: dispositivo(), correo: correoActual(), ...extra };
    if (!cuerpo.correo) delete cuerpo.correo;
    let d;
    try {
      const r = await fetch(API + ruta, { method: 'POST', credentials: 'omit', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(cuerpo) });
      d = await r.json();
    } catch { d = { error: 'red' }; }
    if (ruta !== 'acceder' && ruta !== 'salir' && (!extra.correo || extra.correo === correoActual())) guardarEstado(d);
    return d;
  }
  // El enlace del producto de Payhip («payhip.com/b/XXXXX») va directo a su caja, sin pasar por la ficha.
  const caja = (url) => { const m = /payhip\.com\/b\/(\w+)/.exec(url || ''); return m ? `https://payhip.com/buy?link=${m[1]}` : url; };

  // ── Comprar Pro: con cuenta, directo a Payhip; sin ella, primero el correo (será su cuenta) ──────────
  let dialogo = null, sondeo = 0, desde = 0, enlace = '', cual = 'siempre', alComprar = null;
  function pintar(fase, datos = {}) {
    if (!dialogo) {
      dialogo = document.createElement('dialog');
      dialogo.className = 'dialogo-pro';
      dialogo.setAttribute('aria-labelledby', 'dialogo-pro-t');
      dialogo.addEventListener('close', () => { clearInterval(sondeo); sondeo = 0; dialogo.remove(); dialogo = null; });
      dialogo.addEventListener('click', (e) => { if (e.target === dialogo) dialogo.close(); });
      document.body.appendChild(dialogo);
      dialogo.showModal();
    }
    const correo = correoActual();
    const fecha = datos.hasta ? fechaLarga(datos.hasta) : '';
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
        ${Date.now() - desde > 120000 ? `<p class="consejo">${T.lento(PAGINA_CUENTA)}</p>` : ''}
        <div class="acciones"><a class="boton primario" href="${escH(enlace)}" target="_blank" rel="noopener">${T.reabrir}</a>${dentro() ? '' : `<button class="boton" type="button" data-otro>${T.otro}</button>`}</div>
        <button class="cerrar-dialogo" type="button" aria-label="${T.cerrar}" data-cerrar>×</button>`;
      const otro = dialogo.querySelector('[data-otro]');
      if (otro) otro.addEventListener('click', () => { clearInterval(sondeo); pintar('correo'); });
    } else if (fase === 'instalada') {
      dialogo.innerHTML = `<div class="listo-pro"><span class="sello-pro" aria-hidden="true">${CHECK}</span>
        <h2 id="dialogo-pro-t">${T.instalada}</h2>
        <p>${T.instaladaTxt}</p>
        ${datos.pro ? `<p><strong>${T.yaPro} ${datos.plan === 'pase' ? T.hasta(fecha) : T.siempreTxt}</strong></p>` : ''}
        <div class="acciones"><a class="boton primario" href="https://ome.tv/" target="_blank" rel="noopener">${T.abrir}</a><button class="boton" type="button" data-cerrar>${T.cerrar}</button></div></div>`;
    } else {
      dialogo.innerHTML = `<div class="listo-pro"><span class="sello-pro" aria-hidden="true">${CHECK}</span>
        <h2 id="dialogo-pro-t">${T.listo}</h2>
        <p><strong>${datos.plan === 'pase' ? T.hasta(fecha) : T.siempreTxt}</strong></p>
        <p>${T.tuCuenta(escH(correo))}</p>
        <p>${conExtension ? T.conExt : T.instala}</p>
        <div class="acciones">${conExtension ? `<a class="boton primario" href="https://ome.tv/" target="_blank" rel="noopener">${T.abrir}</a>` : `<a class="boton primario" href="/${es ? '#instalar' : 'en/#install'}" data-cerrar>${T.instalar}</a>`}${location.pathname === PAGINA_CUENTA ? `<button class="boton" type="button" data-cerrar>${T.cerrar}</button>` : `<a class="boton" href="${PAGINA_CUENTA}">${T.irCuenta}</a>`}</div></div>`;
    }
    for (const b of dialogo.querySelectorAll('[data-cerrar]')) b.addEventListener('click', () => dialogo && dialogo.close());
  }
  function pagar(correo) {
    if (!ES_CORREO.test(correo)) { pintar('correo', { error: T.mal }); return; }
    // Se abre ya, dentro del clic, o el navegador bloquearía la ventana.
    window.open(enlace, '_blank', 'noopener');
    if (correo !== correoActual()) ponerCorreo(correo);
    desde = Date.now();
    pintar('esperando');
    api('comprar', { correo }).catch(() => {});
    clearInterval(sondeo);
    sondeo = setInterval(comprobar, 4000);
  }
  async function comprobar() {
    if (!dialogo || !sondeo) return;
    if (Date.now() - desde > 30 * 60000) { clearInterval(sondeo); return; }
    const d = await api('estado');
    if (d.pro && d.cuenta) {
      clearInterval(sondeo);
      sondeo = 0;
      if (conExtension) window.postMessage({ tipo: 'squadmeet:pro' }, location.origin);
      pintar('listo', d);
      if (alComprar) alComprar();
    } else if (Date.now() - desde > 120000 && !dialogo.querySelector('.consejo')) pintar('esperando');
  }
  window.addEventListener('focus', () => { if (dialogo && sondeo) comprobar(); });
  // Los botones de comprar (en los precios y en «Mi cuenta»). Con cuenta se abre Payhip ya, en el mismo clic.
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[data-plan]');
    if (!a) return;
    e.preventDefault();
    enlace = caja(a.href);
    cual = a.dataset.plan === 'pase' ? 'pase' : 'siempre';
    if (dentro()) pagar(correoActual());
    else puente.then(() => pintar('correo'));
  });
  // Recién instalada la extensión (fondo.js abre la web con ?instalada=1): bienvenida y, si ya pagó, su Pro.
  if (/[?&]instalada=1/.test(location.search)) {
    history.replaceState(null, '', location.pathname + location.hash);
    puente.then(async () => pintar('instalada', await api('estado')));
  }

  // ── «Mi cuenta» (/cuenta/ y /en/account/) ──────────────────────────────────────────────────────
  const app = document.getElementById('cuenta-app');
  if (app) iniciarCuenta(app);
  function iniciarCuenta(app) {
    const conGoogle = app.dataset.google === 'si';
    const enlaces = { siempre: app.dataset.siempre, pase: app.dataset.pase };
    let fase = 'cargando', datos = {}, pedido = '', error = '', ocupado = false, enviadoEn = 0, pagado = false, recibido = '', ticket = '';
    const conError = (codigo) => T.errores[codigo] || T.errores.interno;
    // Vuelta de Payhip (?pagado=1) y enlaces del correo (#entrar=…) o de Google (#google=…, #error=google).
    if (/[?&]pagado=1/.test(location.search)) {
      // Payhip vuelve siempre a la página en español: quien tiene el navegador en otro idioma, a la inglesa.
      if (es && !/^es\b/i.test(navigator.language || '')) { location.replace('/en/account/?pagado=1'); return; }
      pagado = true;
    }
    const h = /^#(entrar|google)=([\w-]+)\.([0-9a-f]{64})$/.exec(location.hash);
    if (h) {
      try { recibido = new TextDecoder().decode(Uint8Array.from(atob(h[2].replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))); } catch {}
      ticket = h[3];
    }
    if (location.hash === '#error=google') error = conError('google');
    if (location.search || location.hash) history.replaceState(null, '', location.pathname);

    const relativo = (t) => {
      const s = Math.round((t - Date.now()) / 1000), rtf = new Intl.RelativeTimeFormat(es ? 'es' : 'en', { numeric: 'auto' });
      if (s > -3600) return rtf.format(Math.min(-1, Math.round(s / 60)), 'minute');
      if (s > -86400) return rtf.format(Math.round(s / 3600), 'hour');
      return rtf.format(Math.round(s / 86400), 'day');
    };
    const boton = (plan, texto, clase) => (enlaces[plan] ? `<a class="boton ${clase} plan-cuenta" href="${escH(enlaces[plan])}" data-plan="${plan}">${texto}</a>` : '');
    const ventajas = `<ul class="ventajas-cuenta">${T.ventajas.map((v) => `<li>${CHECK}${v}</li>`).join('')}</ul>`;
    function aviso() {
      if (!pagado) return '';
      if (fase === 'dentro' && datos.pro) return `<div class="aviso-cuenta listo"><span class="sello-pro" aria-hidden="true">${CHECK}</span><div><h2>${T.pagadoTitulo}</h2><p>${T.pagadoPro}</p></div></div>`;
      if (fase === 'dentro') return `<div class="aviso-cuenta"><span class="girando" aria-hidden="true"></span><p>${T.pagadoConfirmando}</p></div>`;
      return `<div class="aviso-cuenta listo"><span class="sello-pro" aria-hidden="true">${CHECK}</span><div><h2>${T.pagadoTitulo}</h2><p>${T.pagadoFuera}</p></div></div>`;
    }
    function vistaDentro() {
      const correo = correoActual(), pro = !!datos.pro;
      const dias = datos.plan === 'pase' ? Math.ceil((datos.hasta - Date.now()) / 86400000) : 0;
      const plan = !pro ? `<p>${T.gratisTxt}</p>${ventajas}<div class="planes-cuenta">${boton('siempre', T.comprarSiempre, 'oscuro')}${boton('pase', T.comprarPase, 'primario')}</div><p class="consejo">${T.sinSuscripcion}</p>`
        : datos.plan === 'pase' ? `${ventajas}<div class="planes-cuenta">${boton('pase', T.renovar, dias <= 3 ? 'primario' : '')}${boton('siempre', T.pasarSiempre, 'oscuro')}</div><p class="consejo">${T.sinSuscripcion}</p>`
          : ventajas;
      const lista = (datos.dispositivos || []).map((n) => `<li><span class="nav-icono" aria-hidden="true">${/iPhone|Android|iPad/.test(n.nombre) ? '<svg viewBox="0 0 24 24"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg>' : '<svg viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="12.5" rx="2"/><path d="M8.5 20.5h7M12 17v3.5"/></svg>'}</span>
        <span class="nav-texto"><b>${escH(n.nombre || T.navegador)}</b><small>${n.este ? T.este : T.visto(relativo(n.visto))}</small></span>
        ${n.este ? '' : `<button class="boton pequeno" type="button" data-cerrar-otro="${escH(n.id)}">${T.cerrarSesion}</button>`}</li>`).join('');
      return `${aviso()}
        <section class="caja-cuenta">
          <div class="quien"><span class="avatar-cuenta" aria-hidden="true">${escH((correo[0] || '?').toUpperCase())}</span>
            <div><p class="correo-cuenta">${escH(correo)}</p>
            <p class="plan-cuenta-linea"><span class="insignia-plan${pro ? ' pro' : ''}">${pro ? 'PRO' : T.gratis}</span>${pro ? (datos.plan === 'pase' ? `${T.proPaseTxt(fechaLarga(datos.hasta))} · ${T.quedan(dias)}` : T.proSiempreTxt) : ''}</p></div></div>
          ${plan}
        </section>
        <section class="caja-cuenta">
          <h2>${T.extension}</h2>
          <p>${conExtension ? T.extSi : T.extNo}</p>
          ${conExtension ? `<a class="boton primario" href="https://ome.tv/" target="_blank" rel="noopener">${T.abrir}</a>` : `<a class="boton primario" href="/${es ? '#instalar' : 'en/#install'}">${T.instalar}</a>`}
        </section>
        <section class="caja-cuenta">
          <h2>${T.navegadores}</h2>
          <ul class="navegadores">${lista}</ul>
          <p class="consejo">${T.maxNav}</p>
        </section>
        <button class="boton ancho-total salir-cuenta" type="button" data-salir>${T.salir}</button>`;
    }
    function render() {
      const err = error ? `<p class="error" role="alert">${escH(error)}</p>` : '';
      let html;
      if (fase === 'cargando') html = '<p class="cargando-cuenta"><span class="girando" aria-hidden="true"></span></p>';
      else if (fase === 'dentro') html = vistaDentro();
      else if (fase === 'boton') {
        html = `<section class="caja-cuenta estrecha">
          <h2>${T.entrarComo}</h2>
          <p class="correo-grande">${escH(recibido)}</p>
          <p>${T.entrarAquiTexto}</p>${err}
          <button class="boton primario ancho-total" type="button" data-confirmar ${ocupado ? 'disabled' : ''}>${ocupado ? T.comprobando : T.entrarAqui}</button>
        </section>`;
      } else if (fase === 'codigo') {
        const espera = Math.max(0, 30 - Math.floor((Date.now() - enviadoEn) / 1000));
        html = `<section class="caja-cuenta estrecha">
          <h2>${T.miraCorreo}</h2>
          <p>${T.codigoEnviado(escH(pedido))}</p>
          <form class="formulario-pro" data-form="codigo" novalidate>
            <label for="cuenta-codigo">${T.codigo}</label>
            <input id="cuenta-codigo" class="campo-codigo" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="000000" spellcheck="false">
            ${err}
            <button class="boton primario ancho-total" type="submit" ${ocupado ? 'disabled' : ''}>${ocupado ? T.comprobando : T.entrarBoton}</button>
          </form>
          <p class="consejo">${T.noLlega} <button class="boton-enlace" type="button" data-reenviar ${espera ? 'disabled' : ''}>${espera ? T.reenviarEn(espera) : T.reenviar}</button>.</p>
          <p class="consejo"><button class="boton-enlace" type="button" data-otro-correo>${T.otroCorreo}</button></p>
        </section>`;
      } else {
        html = `${aviso()}<section class="caja-cuenta estrecha">
          <h2>${T.entraTitulo}</h2>
          <p>${T.entraTexto}</p>
          ${conGoogle ? `<a class="boton google ancho-total" href="${API}google?l=${es ? 'es' : 'en'}"><svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#ffc107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#ff3d00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4caf50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976d2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>${T.google}</a>
            <p class="separador"><span>${T.oCorreo}</span></p>` : ''}
          <form class="formulario-pro" data-form="correo" novalidate>
            <label for="cuenta-correo">${T.correo}</label>
            <input id="cuenta-correo" type="email" inputmode="email" autocomplete="email" required value="${escH(pedido || correoActual())}" placeholder="tucorreo@ejemplo.com">
            ${err}
            <button class="boton primario ancho-total" type="submit" ${ocupado ? 'disabled' : ''}>${ocupado ? T.enviando : T.mandarCodigo}</button>
          </form>
          <p class="consejo">${T.sinCuenta}</p>
        </section>`;
      }
      // Lo escrito en el código no se pierde al repintar.
      const escrito = (app.querySelector('#cuenta-codigo') || {}).value || '';
      const teniaFoco = document.activeElement && document.activeElement.id;
      app.innerHTML = html;
      const campo = app.querySelector('#cuenta-codigo');
      if (campo) { campo.value = escrito; if (!escrito || teniaFoco === 'cuenta-codigo') campo.focus(); }
    }
    async function cargar() {
      if (!correoActual()) { fase = 'fuera'; render(); return; }
      const d = await api('cuenta');
      if (d.cuenta) { datos = d; fase = 'dentro'; } else if (fase !== 'codigo') fase = 'fuera';
      render();
      if (pagado && fase === 'dentro' && !d.pro && !sondeo) {
        const hasta = Date.now() + 3 * 60000;
        const t = setInterval(async () => { const e = await api('cuenta'); if (e.pro || Date.now() > hasta) { clearInterval(t); if (e.cuenta) datos = e; render(); } }, 3000);
      }
    }
    async function pedirCodigo(correo) {
      if (!ES_CORREO.test(correo)) { error = T.errores.correo; render(); return; }
      ocupado = true; error = ''; render();
      const d = await api('acceder', { correo, idioma: es ? 'es' : 'en' });
      ocupado = false;
      if (d.enviado) { pedido = correo; enviadoEn = Date.now(); fase = 'codigo'; error = ''; }
      else if (d.error === 'despacio' && d.espera && fase !== 'codigo') { pedido = correo; enviadoEn = Date.now() - (30 - Math.min(30, d.espera)) * 1000; fase = 'codigo'; }
      else error = conError(d.error);
      render();
    }
    async function entrarCon(correo, extra) {
      ocupado = true; error = ''; render();
      const d = await api('verificar', { correo, ...extra });
      ocupado = false;
      if (d.cuenta) {
        ponerCorreo(correo);
        guardarEstado(d);
        if (d.pro && conExtension) window.postMessage({ tipo: 'squadmeet:pro' }, location.origin);
        fase = 'cargando';
        await cargar();
      } else { error = conError(d.error); render(); }
    }
    app.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target.dataset.form, campo = e.target.querySelector('input');
      if (f === 'correo') pedirCodigo(campo.value.trim());
      else if (f === 'codigo') {
        const c = campo.value.replace(/\D/g, '');
        if (c.length !== 6) { error = conError('codigo'); render(); return; }
        entrarCon(pedido, { codigo: c });
      }
    });
    app.addEventListener('input', (e) => {
      if (e.target.id !== 'cuenta-codigo') return;
      const c = e.target.value.replace(/\D/g, '');
      if (c.length === 6 && !ocupado) entrarCon(pedido, { codigo: c });
    });
    app.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-reenviar')) pedirCodigo(pedido);
      else if (b.hasAttribute('data-otro-correo')) { fase = 'fuera'; error = ''; render(); const c = app.querySelector('#cuenta-correo'); if (c) { c.select(); c.focus(); } }
      else if (b.hasAttribute('data-confirmar')) entrarCon(recibido, { enlace: ticket });
      else if (b.dataset.cerrarOtro) { b.disabled = true; await api('cerrar', { otro: b.dataset.cerrarOtro }); await cargar(); }
      else if (b.hasAttribute('data-salir')) {
        b.disabled = true;
        await api('salir');
        ponerCorreo('');
        ponerL(CLAVE_E, '');
        pintarNav();
        datos = {}; pedido = ''; fase = 'fuera'; pagado = false;
        render();
      }
    });
    // Mientras se espera el código: la cuenta del reloj para reenviar.
    setInterval(() => { if (fase === 'codigo' && Date.now() - enviadoEn < 32000) { const b = app.querySelector('[data-reenviar]'); if (b) { const s = Math.max(0, 30 - Math.floor((Date.now() - enviadoEn) / 1000)); b.disabled = s > 0; b.textContent = s ? T.reenviarEn(s) : T.reenviar; } } }, 1000);
    // Si se entra o se sale en otra pestaña (o en ome.tv, con la extensión), esta se pone al día.
    window.addEventListener('storage', (e) => { if (e.key === CLAVE_C || e.key === CLAVE_E) cargar(); });
    alComprar = () => cargar();
    render();
    puente.then(() => {
      if (ticket && recibido) {
        if (h[1] === 'google') entrarCon(recibido, { enlace: ticket });
        else if (recibido === correoActual() && dentro()) cargar();
        else { fase = 'boton'; render(); }
      } else cargar();
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
