// Página de los amigos (/unirse/ y /join/): entrar con nombre, conectar con el anfitrión y la llamada.
// Va aparte del HTML para que la política de seguridad no tenga que permitir scripts en línea.
const $ = (id) => document.getElementById(id);

// La página sale en el idioma del navegador de cada amigo, y se lo decimos al anfitrión para que
// los nombres y avisos de su lienzo también vayan en ese idioma.
const IDIOMA = /^es\b/i.test(navigator.language || '') ? 'es' : 'en';
const T = {
  es: {
    titulo: 'Te han invitado a un grupo',
    entradilla: 'Vas a salir en Ome.tv con tu amigo. Tu cámara aparecerá junto a la suya y veréis juntos a la otra persona.',
    tuNombre: 'Tu nombre', opcional: '(opcional)', comoTeVera: 'Así te verá tu amigo',
    unirme: 'Unirme', abriendo: 'Abriendo la cámara…',
    notaInicio: 'Usa auriculares para que no haya eco. No hace falta instalar nada.',
    conectandoAmigo: 'Conectando con tu amigo…', conectando: 'Conectando…',
    activarSonido: 'Toca para activar el sonido',
    controles: 'Controles', microfono: 'Micrófono', camara: 'Cámara', girar: 'Cambiar de cámara', salir: 'Salir', invertir: 'Invertir imagen',
    silenciarMic: 'Silenciar micrófono', activarMic: 'Activar micrófono',
    apagarCam: 'Apagar cámara', encenderCam: 'Encender cámara', salirGrupo: 'Salir del grupo',
    volver: 'Volver a entrar',
    enlaceMal: 'Este enlace no funciona', enlaceMalTexto: 'Pide a tu amigo que te lo vuelva a enviar.',
    sinPermiso: 'Necesitas dar permiso a la cámara y al micrófono. Revísalo en los ajustes del navegador y vuelve a probar.',
    sinCamara: 'No se ha podido abrir la cámara. Ciérrala en otras apps y vuelve a probar.',
    cortado: 'Se ha cortado la conexión. Reconectando…',
    sacado: 'Te han sacado del grupo', sacadoTexto: 'Tu amigo te ha quitado del grupo.',
    cerrado: 'El grupo se ha cerrado', cerradoTexto: 'Tu amigo ha terminado el grupo.',
    desconectado: 'Tu amigo se ha desconectado. Esperando a que vuelva…',
    reintentando: 'No se ha podido conectar. Volviendo a probar…',
    sigueConTurn: 'No conseguimos conectar con tu amigo. Seguimos intentándolo…',
    sigueSinTurn: 'Tu red no deja conectar con tu amigo. Si estás con datos móviles, prueba con wifi. Seguimos intentándolo…',
    noAbierto: 'Tu amigo todavía no tiene el grupo abierto. Esperando…',
    lleno: 'El grupo está lleno', llenoTexto: 'Ya no cabe nadie más en el grupo. Si alguien sale, vuelve a entrar.',
    agotado: 'Se ha acabado el tiempo gratis de tu amigo', agotadoTexto: 'Hoy ya no puede seguir con el grupo sin Pro. ¿Quieres ser tú quien lo crea?', crearTu: 'Crear mi propio grupo',
    ultimoMinuto: 'A tu amigo le queda 1 minuto gratis hoy.',
    chat: 'Chat del grupo', escribir: 'Escribe al grupo…', enviar: 'Enviar', cerrar: 'Cerrar', tu: 'Tú', votar: 'Pedir siguiente',
    sinGiro: 'No se ha podido cambiar de cámara.',
    fuera: 'Has salido del grupo',
  },
  en: {
    titulo: "You've been invited to a group",
    entradilla: "You're going on Ome.tv with your friend. Your camera will show up next to theirs and you'll see the other person together.",
    tuNombre: 'Your name', opcional: '(optional)', comoTeVera: 'How your friend will see you',
    unirme: 'Join', abriendo: 'Opening the camera…',
    notaInicio: 'Use headphones to avoid echo. Nothing to install.',
    conectandoAmigo: 'Connecting to your friend…', conectando: 'Connecting…',
    activarSonido: 'Tap to turn on the sound',
    controles: 'Controls', microfono: 'Microphone', camara: 'Camera', girar: 'Switch camera', salir: 'Leave', invertir: 'Mirror image',
    silenciarMic: 'Mute microphone', activarMic: 'Unmute microphone',
    apagarCam: 'Turn camera off', encenderCam: 'Turn camera on', salirGrupo: 'Leave the group',
    volver: 'Join again',
    enlaceMal: "This link doesn't work", enlaceMalTexto: 'Ask your friend to send it again.',
    sinPermiso: 'You need to allow the camera and microphone. Check your browser settings and try again.',
    sinCamara: "Couldn't open the camera. Close it in other apps and try again.",
    cortado: 'The connection dropped. Reconnecting…',
    sacado: 'You were removed from the group', sacadoTexto: 'Your friend removed you from the group.',
    cerrado: 'The group has ended', cerradoTexto: 'Your friend ended the group.',
    desconectado: 'Your friend disconnected. Waiting for them to come back…',
    reintentando: "Couldn't connect. Trying again…",
    sigueConTurn: "We can't reach your friend yet. Still trying…",
    sigueSinTurn: "Your network won't let you connect to your friend. If you're on mobile data, try Wi-Fi. Still trying…",
    noAbierto: "Your friend hasn't opened the group yet. Waiting…",
    lleno: 'The group is full', llenoTexto: 'There’s no room for anyone else in the group. If someone leaves, try again.',
    agotado: 'Your friend’s free time is up', agotadoTexto: 'They can’t keep the group going today without Pro. Want to be the one who creates it?', crearTu: 'Create my own group',
    ultimoMinuto: 'Your friend has 1 free minute left today.',
    chat: 'Group chat', escribir: 'Write to the group…', enviar: 'Send', cerrar: 'Close', tu: 'You', votar: 'Ask to skip',
    sinGiro: "Couldn't switch camera.",
    fuera: 'You left the group',
  },
}[IDIOMA];
document.documentElement.lang = IDIOMA;
for (const el of document.querySelectorAll('[data-t]')) el.textContent = T[el.dataset.t];
for (const el of document.querySelectorAll('[data-t-placeholder]')) el.placeholder = T[el.dataset.tPlaceholder];
for (const el of document.querySelectorAll('[data-t-aria]')) el.setAttribute('aria-label', T[el.dataset.tAria]);
for (const el of document.querySelectorAll('[data-t-title]')) el.title = T[el.dataset.tTitle];
const { Cartero, Enlace, paquete, aleatorio, limitarVideo, servidoresIce, hayTurn } = SquadSenal;
const SITIO = new URL('../', location.href);
const anfitrion = decodeURIComponent(location.hash.slice(1)).trim();
const AUDIO = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
// La calidad de tu cámara la decide el anfitrión. «alta»: sois dos y tu celda es la mitad de la imagen;
// a 640×480 se vería borrosa. «media»: sois tres o cuatro y tu celda es un cuarto. «ligera»: el
// anfitrión está en el móvil y tiene que descodificar a todos.
const CALIDADES = {
  alta: { ancho: 1280, alto: 720, fps: 24, kbps: 1200 },
  media: { ancho: 960, alto: 540, fps: 24, kbps: 900 },
  ligera: { ancho: 640, alto: 480, fps: 20, kbps: 500 },
};
let calidad = 'alta';
const video = (cara) => {
  const c = CALIDADES[calidad];
  return { facingMode: cara, width: { ideal: c.ancho }, height: { ideal: c.alto }, frameRate: { ideal: c.fps, max: 30 } };
};
// Aquí no se fuerzan los fps: el anfitrión dibuja a todos en el grupo y, si cada cámara mantiene
// sus fps a toda costa, le llegan más fotogramas de los que puede pintar y se le traba la página.
function limitarCamara(pc) {
  const sender = pc && pc.getSenders().find((s) => s.track && s.track.kind === 'video');
  const c = CALIDADES[calidad];
  if (sender) limitarVideo(sender, c.kbps, c.fps, 'balanced');
}
function cambiarCalidad(nivel) {
  if (!CALIDADES[nivel] || nivel === calidad) return;
  calidad = nivel;
  const pista = local && local.getVideoTracks()[0];
  if (pista) pista.applyConstraints(video(cara)).catch(() => {});
  if (intento && intento.conectado) limitarCamara(intento.pc);
}

let local = null, cartero = null, intento = null, reintento = null, terminado = false, fallos = 0;
const sinAnfitrion = new Set();   // servidores en los que el anfitrión no está (contestaron EXPIRE)
let cara = 'user', micActivo = true, camActiva = true, bloqueoPantalla = null, espejo = false;
try { espejo = localStorage.getItem('squadmeet:espejo') === '1'; } catch {}
const calma = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Invertir la imagen (izquierda ↔ derecha) cambia cómo te ven todos, y la miniatura lo enseña igual.
function pintarEspejo() {
  $('yo').classList.toggle('espejo', espejo);
  $('b-espejo').classList.toggle('activo', espejo);
  $('b-espejo').setAttribute('aria-pressed', String(espejo));
}
pintarEspejo();

function mostrar(id) {
  for (const s of document.querySelectorAll('.pantalla')) s.hidden = s.id !== id;
}
function estado(texto) {
  $('estado').hidden = !texto;
  if (texto) $('estado-texto').textContent = texto;
}
// enlace: con el tiempo gratis acabado, la invitación a crear su propio grupo.
function fin(titulo, texto, puedeVolver = true, enlace = false) {
  terminado = true;
  clearTimeout(reintento);
  cerrarIntento();
  if (cartero) cartero.cerrar();
  if (local) local.getTracks().forEach((t) => t.stop());
  $('fin-titulo').textContent = titulo;
  $('fin-texto').textContent = texto;
  $('fin-texto').hidden = !texto;
  $('reintentar').hidden = !puedeVolver;
  $('fin-enlace').hidden = !enlace;
  mostrar('fin');
}
const orientacion = () => (innerWidth > innerHeight ? 'h' : 'v');
const enviar = (msg) => { try { if (intento && intento.control.readyState === 'open') intento.control.send(JSON.stringify(msg)); } catch {} };

if (!/^sqm[a-z0-9]{6,}$/.test(anfitrion)) {
  fin(T.enlaceMal, T.enlaceMalTexto, false);
}
try { $('nombre').value = localStorage.getItem('squadmeet:nombre') || ''; } catch {}
$('nombre').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !$('unirme').disabled) $('unirme').click(); });

$('unirme').onclick = async () => {
  $('unirme').disabled = true;
  $('unirme').textContent = T.abriendo;
  $('error-inicio').hidden = true;
  try {
    local = await navigator.mediaDevices.getUserMedia({ video: video(cara), audio: AUDIO });
  } catch (e) {
    $('error-inicio').textContent = e && e.name === 'NotAllowedError' ? T.sinPermiso : T.sinCamara;
    $('error-inicio').hidden = false;
    $('unirme').disabled = false;
    $('unirme').textContent = T.unirme;
    return;
  }
  try { localStorage.setItem('squadmeet:nombre', $('nombre').value.trim()); } catch {}
  for (const t of local.getTracks()) t.addEventListener('ended', recuperar);
  $('yo').srcObject = local;
  mostrar('llamada');
  mantenerPantalla();
  navigator.mediaDevices.enumerateDevices().then((d) => {
    $('b-girar').hidden = d.filter((x) => x.kind === 'videoinput').length < 2;
  }).catch(() => {});
  cartero = new Cartero({
    sala: anfitrion,
    id: 'sqg' + aleatorio(12),
    token: aleatorio(16),
    alMensaje: mensajeServidor,
    alEstado: (e) => { if (e === 'conectando' && !(intento && intento.conectado)) estado(T.conectando); },
  });
  conectar();
};

async function conectar() {
  if (terminado) return;
  cerrarIntento();
  const ice = await servidoresIce();
  // Se empieza por un servidor ya abierto: si el nuestro está bloqueado, el de reserva.
  await cartero.listo(8000);
  if (terminado) return;
  const via = cartero.preferido(sinAnfitrion);
  const cid = 'mc_' + aleatorio(10);
  const enlace = new Enlace(RTCPeerConnection, (c) => cartero.enviar('CANDIDATE', anfitrion, paquete.candidato(c, cid), via), ice);
  const pc = enlace.pc;
  const control = pc.createDataChannel('control', { negotiated: true, id: 0 });
  const yo = { cid, via, enlace, pc, control, conectado: false, remoto: new MediaStream(), turn: hayTurn(ice) };
  intento = yo;
  for (const t of local.getTracks()) pc.addTrack(t, local);
  pc.ontrack = (e) => {
    yo.remoto.addTrack(e.track);
    if ($('remoto').srcObject !== yo.remoto) $('remoto').srcObject = yo.remoto;
    $('remoto').play().then(() => { $('sonido').hidden = true; }).catch(() => { $('sonido').hidden = false; });
  };
  pc.onconnectionstatechange = () => {
    if (intento !== yo) return;
    const st = pc.connectionState;
    if (st === 'connected') {
      yo.conectado = true;
      fallos = 0;
      sinAnfitrion.clear();
      clearTimeout(yo.plazo);
      clearTimeout(yo.corte);
      estado('');
      // Ya te ves en el grupo tal cual te ve el desconocido: la miniatura sobra.
      $('yo').hidden = true;
      limitarCamara(pc);
    } else if (st === 'disconnected') {
      estado(T.cortado);
      $('yo').hidden = false;
      yo.corte = setTimeout(() => { if (intento === yo) volverAProbar(0); }, 6000);
    } else if (st === 'failed') {
      volverAProbar(1500, sinConexion(yo));
    }
  };
  control.onopen = () => {
    enviar({ tipo: 'camara', activa: camActiva });
    enviar({ tipo: 'orientacion', valor: orientacion() });
    enviar({ tipo: 'espejo', activo: espejo });
  };
  control.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    if (m.tipo === 'expulsado') fin(T.sacado, T.sacadoTexto);
    else if (m.tipo === 'cerrado') fin(T.cerrado, T.cerradoTexto);
    else if (m.tipo === 'calidad') cambiarCalidad(m.nivel);
    else if (m.tipo === 'plan') pintarPro(!!m.pro);
    else if (m.tipo === 'chat' && typeof m.texto === 'string') anadirMensaje(typeof m.de === 'string' ? m.de.slice(0, 40) : null, m.texto.slice(0, 200));
    else if (m.tipo === 'votos') pintarVotos(Number(m.n) || 0, Number(m.total) || 0, !!m.mio);
    else if (m.tipo === 'aviso' && m.que === 'minuto') avisar(T.ultimoMinuto);
    else if (m.tipo === 'agotado') fin(T.agotado, T.agotadoTexto, false, true);
  };
  control.onclose = () => { if (intento === yo && !terminado) volverAProbar(1500, T.desconectado); };
  estado(T.conectandoAmigo);
  $('yo').hidden = false;
  try {
    await pc.setLocalDescription(await pc.createOffer());
  } catch {
    return volverAProbar(3000);
  }
  const nombre = $('nombre').value.replace(/\s+/g, ' ').trim().slice(0, 20);
  cartero.enviar('OFFER', anfitrion, paquete.sdp(pc.localDescription, cid, { app: 'squadmeet', v: 1, nombre, orientacion: orientacion(), idioma: IDIOMA, espejo, calma }), via);
  yo.plazo = setTimeout(() => { if (intento === yo && !yo.conectado) volverAProbar(0, sinConexion(yo)); }, 30000);
}

// Tras dos intentos fallidos, lo más probable es la red (datos móviles sin servidor TURN).
function sinConexion(yo) {
  fallos++;
  if (fallos < 2) return T.reintentando;
  return yo.turn ? T.sigueConTurn : T.sigueSinTurn;
}

function mensajeServidor(m) {
  const p = m.payload || {};
  if (m.type === 'EXPIRE') {
    if (intento && intento.conectado) return;
    // En ese servidor no está el anfitrión: se prueba enseguida en el otro. Si no está en ninguno,
    // aún no ha abierto el grupo (o lo ha cerrado) y se espera un poco.
    sinAnfitrion.add(m.via);
    if (sinAnfitrion.size < 2) return volverAProbar(300);
    sinAnfitrion.clear();
    volverAProbar(4000, T.noAbierto);
    return;
  }
  if (m.src !== anfitrion || !intento || p.connectionId !== intento.cid) return;
  if (m.type === 'ANSWER') {
    if (p.metadata && p.metadata.rechazo === 'lleno') return fin(T.lleno, T.llenoTexto);
    if (p.metadata && p.metadata.rechazo === 'agotado') return fin(T.agotado, T.agotadoTexto, false, true);
    // Con el anfitrión en el móvil, ligera desde el principio (sin esperar a su aviso).
    if (p.metadata && p.metadata.ligero) cambiarCalidad('ligera');
    intento.enlace.ponerRemota(p.sdp).catch(() => volverAProbar(3000));
  } else if (m.type === 'CANDIDATE' && p.candidate) {
    intento.enlace.candidato(p.candidate);
  }
}

function volverAProbar(ms, texto) {
  if (terminado || reintento) return;
  if (texto) estado(texto);
  cerrarIntento();
  reintento = setTimeout(() => { reintento = null; conectar(); }, ms);
}

function cerrarIntento() {
  if (!intento) return;
  clearTimeout(intento.plazo);
  clearTimeout(intento.corte);
  intento.control.onclose = null;
  intento.enlace.cerrar();
  intento = null;
}

async function mantenerPantalla() {
  try { bloqueoPantalla = await navigator.wakeLock.request('screen'); } catch {}
}

// Cambia una pista de `local` por otra, también en la conexión con el anfitrión si la hay.
async function sustituir(vieja, nueva) {
  nueva.enabled = nueva.kind === 'video' ? camActiva : micActivo;
  nueva.addEventListener('ended', recuperar);
  if (vieja) local.removeTrack(vieja);
  local.addTrack(nueva);
  $('yo').srcObject = null;
  $('yo').srcObject = local;
  const sender = intento && intento.pc.getSenders().find((x) => x.track === vieja || (x.track && x.track.kind === nueva.kind));
  if (sender) await sender.replaceTrack(nueva).catch(() => {});
}

// En el iPhone, ir a otra app puede apagar la cámara o el micro, y en cualquier móvil otra app puede
// quitarte la cámara. Al volver, se piden otra vez; si no, seguirías en el grupo sin imagen o sin voz.
let recuperando = false;
async function recuperar() {
  if (!local || terminado || recuperando || document.visibilityState !== 'visible') return;
  const muertas = local.getTracks().filter((t) => t.readyState === 'ended');
  if (!muertas.length) return;
  recuperando = true;
  try {
    const quiere = (k) => muertas.some((t) => t.kind === k);
    const s = await navigator.mediaDevices.getUserMedia({ video: quiere('video') ? video(cara) : false, audio: quiere('audio') ? AUDIO : false });
    for (const nueva of s.getTracks()) await sustituir(muertas.find((t) => t.kind === nueva.kind), nueva);
  } catch {} finally {
    recuperando = false;
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !local || terminado) return;
  mantenerPantalla();
  recuperar();
});

$('sonido').onclick = () => $('remoto').play().then(() => { $('sonido').hidden = true; }).catch(() => {});

$('b-mic').onclick = () => {
  micActivo = !micActivo;
  local.getAudioTracks().forEach((t) => { t.enabled = micActivo; });
  $('b-mic').classList.toggle('apagado', !micActivo);
  $('b-mic').setAttribute('aria-pressed', String(!micActivo));
  $('b-mic').setAttribute('aria-label', micActivo ? T.silenciarMic : T.activarMic);
};

$('b-cam').onclick = () => {
  camActiva = !camActiva;
  local.getVideoTracks().forEach((t) => { t.enabled = camActiva; });
  $('b-cam').classList.toggle('apagado', !camActiva);
  $('b-cam').setAttribute('aria-pressed', String(!camActiva));
  $('b-cam').setAttribute('aria-label', camActiva ? T.apagarCam : T.encenderCam);
  enviar({ tipo: 'camara', activa: camActiva });
};

$('b-girar').onclick = async () => {
  const nueva = cara === 'user' ? 'environment' : 'user';
  const vieja = local.getVideoTracks()[0];
  $('b-girar').disabled = true;
  // En iPhone hay que soltar la cámara antes de abrir la otra.
  if (vieja) { vieja.removeEventListener('ended', recuperar); vieja.stop(); }
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: video(nueva) });
    cara = nueva;
    await sustituir(vieja, s.getVideoTracks()[0]);
  } catch {
    // Sin la otra cámara, vuelve a la de antes: mejor eso que quedarse sin imagen.
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: video(cara) });
      await sustituir(vieja, s.getVideoTracks()[0]);
    } catch {}
    estado(T.sinGiro);
    setTimeout(() => estado(intento && intento.conectado ? '' : T.conectandoAmigo), 2500);
  } finally {
    $('b-girar').disabled = false;
  }
};

$('b-espejo').onclick = () => {
  espejo = !espejo;
  try { localStorage.setItem('squadmeet:espejo', espejo ? '1' : '0'); } catch {}
  pintarEspejo();
  enviar({ tipo: 'espejo', activo: espejo });
};

$('b-salir').onclick = () => {
  enviar({ tipo: 'adios' });
  setTimeout(() => fin(T.fuera, ''), 150);
};

$('reintentar').onclick = () => location.reload();
$('fin-enlace').href = IDIOMA === 'es' ? '/' : '/en/';

// Con el anfitrión en Pro: chat del grupo y votar «Siguiente». Todo pasa por el anfitrión, que lo
// reparte; aquí solo se enseña (siempre como texto, nunca como HTML).
let noLeidos = 0, miVoto = false;
function pintarPro(pro) {
  $('b-chat').hidden = $('b-votar').hidden = !pro;
  if (!pro) $('chat').hidden = true;
}
function anadirMensaje(de, texto) {
  const li = document.createElement('li');
  const b = document.createElement('b');
  b.textContent = `${de || T.tu}: `;
  li.append(b, document.createTextNode(texto));
  const lista = $('mensajes');
  lista.appendChild(li);
  while (lista.children.length > 50) lista.firstChild.remove();
  lista.scrollTop = lista.scrollHeight;
  if ($('chat').hidden && de) {
    noLeidos++;
    const g = $('b-chat').querySelector('.globo');
    g.hidden = false;
    g.textContent = noLeidos > 9 ? '9+' : String(noLeidos);
  }
}
function pintarVotos(n, total, mio) {
  miVoto = mio;
  $('b-votar').classList.toggle('activo', mio);
  $('b-votar').setAttribute('aria-pressed', String(mio));
  const g = $('b-votar').querySelector('.globo');
  g.hidden = !n;
  g.textContent = `${n}/${total}`;
}
function avisar(texto) {
  $('aviso').textContent = texto;
  $('aviso').hidden = false;
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => { $('aviso').hidden = true; }, 6000);
}
$('b-chat').onclick = () => {
  $('chat').hidden = !$('chat').hidden;
  if ($('chat').hidden) return;
  noLeidos = 0;
  $('b-chat').querySelector('.globo').hidden = true;
  $('texto-chat').focus();
};
$('cerrar-chat').onclick = () => { $('chat').hidden = true; };
$('form-chat').onsubmit = (e) => {
  e.preventDefault();
  const texto = $('texto-chat').value.replace(/\s+/g, ' ').trim().slice(0, 200);
  $('texto-chat').value = '';
  if (texto) enviar({ tipo: 'chat', texto });
};
$('b-votar').onclick = () => enviar({ tipo: 'voto', si: !miVoto });

let temporizadorGiro;
addEventListener('resize', () => {
  clearTimeout(temporizadorGiro);
  temporizadorGiro = setTimeout(() => enviar({ tipo: 'orientacion', valor: orientacion() }), 400);
});

addEventListener('pagehide', () => enviar({ tipo: 'adios' }));
