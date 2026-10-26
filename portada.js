// Portada: pestañas de instalación, botón principal según el navegador, códigos QR para abrir la guía
// en el móvil desde el ordenador y el botón de favoritos (marcador) para el ordenador.
(() => {
  // Enlaces de las tiendas: se rellenan cuando cada una publica la extensión. Mientras estén vacíos,
  // la portada explica cómo instalarla a mano.
  const TIENDAS = {
    chrome: '',
    edge: '',
    firefox: '',
  };

  const ingles = document.documentElement.lang === 'en';
  const T = ingles
    ? { anadir: (n) => `Add to ${n}, it’s free`, movil: 'Set it up on your phone' }
    : { anadir: (n) => `Añadir a ${n}, es gratis`, movil: 'Prepararlo en el móvil' };
  const NOMBRES = { chrome: 'Chrome', edge: 'Edge', firefox: 'Firefox' };

  const ua = navigator.userAgent;
  const navegador = /Edg\//.test(ua) ? 'edge' : /Firefox\//.test(ua) ? 'firefox' : 'chrome';
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const movil = ios || android || (navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) < 700);

  // Tiendas: botones para las que ya tienen la extensión, el de tu navegador primero.
  const disponibles = Object.keys(TIENDAS).filter((t) => TIENDAS[t]).sort((a, b) => (b === navegador) - (a === navegador));
  if (disponibles.length) {
    document.getElementById('pc-tiendas').hidden = false;
    const caja = document.getElementById('tiendas');
    disponibles.forEach((t, i) => {
      const a = document.createElement('a');
      a.className = `boton ${i ? '' : 'primario'}`;
      a.href = TIENDAS[t];
      a.rel = 'noopener';
      a.textContent = T.anadir(NOMBRES[t]);
      caja.appendChild(a);
    });
    // Con la tienda de Chrome ya no hace falta la instalación a mano.
    document.getElementById('pc-manual').hidden = !!TIENDAS.chrome;
  }
  if (TIENDAS.firefox) {
    document.getElementById('android-firefox').hidden = false;
    document.getElementById('firefox-android').href = TIENDAS.firefox;
  }

  // Botones principales: en el móvil llevan a su pestaña; en el ordenador, a la tienda si ya está.
  for (const cta of document.querySelectorAll('[data-cta]')) {
    if (movil) {
      if (!cta.closest('.cabecera')) cta.textContent = T.movil;
    } else if (TIENDAS[navegador]) {
      cta.href = TIENDAS[navegador];
      cta.rel = 'noopener';
      if (!cta.closest('.cabecera')) cta.textContent = T.anadir(NOMBRES[navegador]);
    }
  }

  // En el ordenador, el QR para abrir la guía del móvil.
  if (!movil) for (const qr of document.querySelectorAll('[data-solo-pc]')) qr.hidden = false;

  // Pestañas (con flechas del teclado, como manda el patrón de ARIA).
  const pestanas = [...document.querySelectorAll('[role="tab"]')];
  function elegir(boton, foco) {
    for (const p of pestanas) {
      const activa = p === boton;
      p.setAttribute('aria-selected', String(activa));
      p.tabIndex = activa ? 0 : -1;
      document.getElementById(p.getAttribute('aria-controls')).hidden = !activa;
    }
    if (foco) boton.focus();
  }
  for (const p of pestanas) {
    p.addEventListener('click', () => elegir(p));
    p.addEventListener('keydown', (e) => {
      const i = pestanas.indexOf(p);
      if (e.key === 'ArrowRight') elegir(pestanas[(i + 1) % pestanas.length], true);
      else if (e.key === 'ArrowLeft') elegir(pestanas[(i + pestanas.length - 1) % pestanas.length], true);
    });
  }
  if (movil) elegir(document.getElementById(ios ? 't-iphone' : 't-android'));

  // Favorito (marcador) para el ordenador: carga squad.js en la página en la que estés.
  const script = new URL('/squad.js', location.href).href;
  const marcador = `javascript:(function(){if(window.__squadmeet){window.__squadmeet.mostrar();return}var s=document.createElement('script');s.src='${script}?v='+Date.now();document.documentElement.appendChild(s)})();`;
  const enlacePc = document.getElementById('marcador-pc');
  enlacePc.href = marcador;
  enlacePc.addEventListener('click', (e) => e.preventDefault());
})();
