// Guía del móvil: un asistente que enseña un paso cada vez, recuerda por dónde ibas, copia el código
// del favorito y detecta solo cuándo lo has probado bien en esta misma página.
(() => {
  const ingles = document.documentElement.lang === 'en';
  const T = ingles
    ? { copiado: 'Copied ✓', copiar: 'Copy code', enlaceCopiado: 'Link copied ✓', copiarEnlace: 'Copy link', paso: (n, de) => `Step ${n} of ${de}` }
    : { copiado: 'Copiado ✓', copiar: 'Copiar código', enlaceCopiado: 'Enlace copiado ✓', copiarEnlace: 'Copiar enlace', paso: (n, de) => `Paso ${n} de ${de}` };
  const CLAVE = 'squadmeet:guia';

  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); } catch {
      const t = document.createElement('textarea');
      t.value = texto;
      t.setAttribute('readonly', '');
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
  }

  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const movil = ios || android || (navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) < 700);
  if (!movil) document.getElementById('en-pc').hidden = false;

  // En el iPhone solo Safari guarda favoritos que ejecutan código y recuerda la versión de escritorio.
  // Chrome, Firefox, Edge y los navegadores de dentro de las apps (Instagram, WhatsApp, TikTok…) no.
  const otroNavegador = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|YaBrowser|DuckDuckGo|GSA\/|Instagram|FBAN|FBAV|Line\/|Twitter|Snapchat|TikTok|musical_ly|BytedanceWebview|WhatsApp/.test(ua) || !/Safari\//.test(ua);
  if (ios && otroNavegador) {
    document.getElementById('otro-navegador').hidden = false;
    const boton = document.getElementById('copiar-enlace');
    boton.addEventListener('click', async () => {
      await copiar(location.origin + location.pathname);
      boton.textContent = T.enlaceCopiado;
      setTimeout(() => { boton.textContent = T.copiarEnlace; }, 2000);
    });
  }

  // El favorito carga squad.js en la página en la que estés (en ome.tv, el panel; aquí, la prueba).
  const script = new URL('/squad.js', location.href).href;
  const marcador = `javascript:(function(){if(window.__squadmeet){window.__squadmeet.mostrar();return}var s=document.createElement('script');s.src='${script}?v='+Date.now();document.documentElement.appendChild(s)})();`;

  // ── Asistente ───────────────────────────────────────────────────────────────────────────────
  const main = document.querySelector('.guia');
  main.classList.add('asistente');
  let guardado = {};
  try { guardado = JSON.parse(localStorage.getItem(CLAVE)) || {}; } catch {}
  const plataformas = {};
  for (const so of ['ios', 'android']) {
    const panel = document.getElementById(so);
    const pasos = [...panel.querySelectorAll('.paso-guia')];
    plataformas[so] = { panel, pasos, actual: Math.min(Math.max(1, guardado[so] || 1), pasos.length) };
  }
  let activa = ios ? 'ios' : android ? 'android' : (guardado.plataforma || 'ios');

  function pintar(so, enfocar) {
    const p = plataformas[so];
    p.pasos.forEach((s, i) => s.classList.toggle('actual', i + 1 === p.actual));
    p.panel.querySelector('.cuenta').textContent = T.paso(p.actual, p.pasos.length);
    p.panel.querySelector('.barra i').style.width = `${(p.actual / p.pasos.length) * 100}%`;
    if (enfocar) {
      const paso = p.pasos[p.actual - 1];
      p.panel.querySelector('.progreso').scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      paso.querySelector('h2').focus({ preventScroll: true });
    }
    try { localStorage.setItem(CLAVE, JSON.stringify({ ios: plataformas.ios.actual, android: plataformas.android.actual, plataforma: activa })); } catch {}
    vigilarPrueba();
  }
  function ir(so, n) {
    const p = plataformas[so];
    p.actual = Math.min(Math.max(1, n), p.pasos.length);
    pintar(so, true);
  }

  main.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ir]');
    if (!b) return;
    const so = b.closest('.paso-guia').dataset.plataforma;
    const p = plataformas[so];
    if (b.dataset.ir === 'siguiente') {
      p.pasos[p.actual - 1].classList.add('hecho');
      ir(so, p.actual + 1);
    } else if (b.dataset.ir === 'atras') ir(so, p.actual - 1);
    else if (b.dataset.ir === 'inicio') {
      p.pasos.forEach((s) => s.classList.remove('hecho'));
      ir(so, 1);
    }
  });

  for (const boton of document.querySelectorAll('.copiar-marcador')) {
    boton.addEventListener('click', async () => {
      await copiar(marcador);
      boton.textContent = T.copiado;
      const paso = boton.closest('.paso-guia');
      paso.classList.add('hecho');
      setTimeout(() => {
        boton.textContent = T.copiar;
        const so = paso.dataset.plataforma;
        if (plataformas[so].pasos[plataformas[so].actual - 1] === paso) ir(so, plataformas[so].actual + 1);
      }, 900);
    });
  }

  // Al tocar el favorito en esta página se carga SquadMeet aquí: entonces está bien hecho.
  let vigilancia = null;
  function vigilarPrueba() {
    clearInterval(vigilancia);
    const p = plataformas[activa];
    const paso = p.pasos[p.actual - 1];
    if (!paso || !paso.hasAttribute('data-auto') || paso.classList.contains('hecho')) return;
    vigilancia = setInterval(() => {
      if (!window.__squadmeet) return;
      clearInterval(vigilancia);
      paso.classList.add('hecho', 'celebra');
      const ok = paso.querySelector('[data-probado]');
      if (ok) ok.hidden = false;
      setTimeout(() => { if (p.pasos[p.actual - 1] === paso) ir(activa, p.actual + 1); }, 1600);
    }, 400);
  }

  // Pestañas iPhone / Android (con flechas del teclado, como manda el patrón de ARIA).
  const pestanas = [...document.querySelectorAll('[role="tab"]')];
  function elegir(boton, foco) {
    for (const t of pestanas) {
      const sel = t === boton;
      t.setAttribute('aria-selected', String(sel));
      t.tabIndex = sel ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !sel;
    }
    activa = boton.getAttribute('aria-controls');
    pintar(activa, false);
    if (foco) boton.focus();
  }
  for (const t of pestanas) {
    t.addEventListener('click', () => elegir(t));
    t.addEventListener('keydown', (e) => {
      const i = pestanas.indexOf(t);
      if (e.key === 'ArrowRight') elegir(pestanas[(i + 1) % pestanas.length], true);
      else if (e.key === 'ArrowLeft') elegir(pestanas[(i + pestanas.length - 1) % pestanas.length], true);
    });
  }
  pintar(activa === 'ios' ? 'android' : 'ios', false);
  elegir(document.getElementById(`t-${activa}`));
})();
