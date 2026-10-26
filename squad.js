/* SquadMeet 1.4.0 · https://squadmeet.app/ */
(function () {
'use strict';
// SquadMeet — señalización compartida por el anfitrión (squad.js) y los invitados (unirse/).
// Nuestro servidor (senal/worker.js) solo hace de cartero: reenvía OFFER/ANSWER/CANDIDATE entre ids
// dentro de la sala del grupo, que se llama como el id del anfitrión. Habla el protocolo de PeerJS y
// nuestros datos viajan en `metadata`. El vídeo y el audio nunca pasan por él: van directos entre
// navegadores.
//
// De reserva está el servidor público de PeerJS. En España, durante los partidos de LaLiga, algunas
// operadoras bloquean IPs de Cloudflare, que es donde está el nuestro; el de PeerJS va por otras. El
// anfitrión está siempre en los dos; cada amigo usa el primero que le responde y, si allí no encuentra
// al anfitrión, prueba el otro. El anfitrión contesta por el mismo por el que le llegó cada amigo.

const SQUAD_ICE = [{"urls":["stun:stun.l.google.com:19302","stun:stun1.l.google.com:19302"]}];

const SquadSenal = (() => {
  const PRINCIPAL = 'wss://senal.squadmeet.app/sala/';
  const RESERVA = 'wss://0.peerjs.com:443/peerjs?key=peerjs&version=1.5.5';
  const SERVIDORES = [
    (sala, id, token) => `${PRINCIPAL}${encodeURIComponent(sala)}?id=${encodeURIComponent(id)}&token=${token}`,
    (sala, id, token) => `${RESERVA}&id=${encodeURIComponent(id)}&token=${token}`,
  ];
  const LATIDO_MS = 5000;

  function aleatorio(n) {
    const letras = 'abcdefghijkmnpqrstuvwxyz23456789';
    let s = '';
    for (const b of crypto.getRandomValues(new Uint8Array(n))) s += letras[b % letras.length];
    return s;
  }

  // Conexión con un servidor. Si se corta, vuelve a entrar con el mismo id y token.
  // alEstado recibe 'conectando' | 'abierto' | 'id-ocupado' | 'error'.
  class Buzon {
    constructor({ url, sala, id, token, alMensaje, alEstado }) {
      this.url = url;
      this.sala = sala;
      this.id = id;
      this.token = token;
      this.alMensaje = alMensaje;
      this.alEstado = alEstado || (() => {});
      this.cola = [];
      this.intentos = 0;
      this.cerrado = false;
      this.conectar();
    }

    conectar() {
      if (this.cerrado) return;
      this.alEstado('conectando');
      let ws;
      try { ws = new WebSocket(this.url(this.sala, this.id, this.token)); } catch { return; }
      this.ws = ws;
      ws.onmessage = (e) => {
        let m;
        try { m = JSON.parse(e.data); } catch { return; }
        if (m.type === 'OPEN') {
          this.intentos = 0;
          this.abierto = true;
          this.alEstado('abierto');
          for (const texto of this.cola.splice(0)) ws.send(texto);
        } else if (m.type === 'ID-TAKEN') {
          this.idOcupado = true;
          this.alEstado('id-ocupado');
        } else if (m.type === 'ERROR') {
          this.alEstado('error', m.payload && m.payload.msg);
        } else if (m.type !== 'HEARTBEAT') {
          this.alMensaje(m);
        }
      };
      ws.onclose = () => {
        this.abierto = false;
        clearInterval(this.latido);
        if (this.cerrado || this.idOcupado) return;
        this.alEstado('conectando');
        const espera = Math.min(10000, 1000 * 2 ** this.intentos++);
        this.reintento = setTimeout(() => this.conectar(), espera);
      };
      this.latido = setInterval(() => {
        if (ws.readyState === 1) ws.send('{"type":"HEARTBEAT"}');
      }, LATIDO_MS);
    }

    enviar(type, dst, payload) {
      const texto = JSON.stringify({ type, dst, payload });
      if (this.abierto && this.ws.readyState === 1) this.ws.send(texto);
      else this.cola.push(texto);
    }

    cerrar() {
      this.cerrado = true;
      clearTimeout(this.reintento);
      clearInterval(this.latido);
      if (this.ws) this.ws.close();
    }
  }

  // Un buzón por servidor. Los mensajes que llegan traen `via` (por qué servidor), para contestar por
  // el mismo. alEstado resume los dos: 'abierto' si hay alguno abierto.
  class Cartero {
    constructor({ sala, id, token, alMensaje, alEstado }) {
      this.alEstado = alEstado || (() => {});
      this.estados = SERVIDORES.map(() => 'conectando');
      this.resumen = '';
      this.esperando = [];
      this.buzones = SERVIDORES.map((url, via) => new Buzon({
        url, sala, id, token,
        alMensaje: (m) => { m.via = via; alMensaje(m); },
        alEstado: (estado, extra) => this.cambio(via, estado, extra),
      }));
    }

    cambio(via, estado, extra) {
      this.estados[via] = estado;
      // Que el id esté ocupado solo importa en el nuestro (otra pestaña con el mismo grupo).
      const resumen = this.estados.includes('abierto') ? 'abierto' : this.estados[0] === 'id-ocupado' ? 'id-ocupado' : 'conectando';
      if (resumen === 'abierto') for (const r of this.esperando.splice(0)) r(true);
      if (resumen !== this.resumen || estado === 'error') {
        this.resumen = resumen;
        this.alEstado(estado === 'error' ? 'error' : resumen, extra);
      }
    }

    // El servidor por el que empezar: el primero abierto que no esté en `evitar`.
    preferido(evitar = new Set()) {
      const abierto = this.estados.findIndex((e, i) => e === 'abierto' && !evitar.has(i));
      if (abierto >= 0) return abierto;
      const otro = this.estados.findIndex((e, i) => !evitar.has(i));
      return otro >= 0 ? otro : 0;
    }

    // Espera a que haya algún servidor abierto (como mucho `ms`).
    listo(ms) {
      if (this.estados.includes('abierto')) return Promise.resolve(true);
      return new Promise((r) => { this.esperando.push(r); setTimeout(() => r(false), ms); });
    }

    enviar(type, dst, payload, via = this.preferido()) {
      this.buzones[via].enviar(type, dst, payload);
      return via;
    }

    cerrar() {
      for (const b of this.buzones) b.cerrar();
    }
  }

  // STUN más las credenciales TURN que reparte /turn (una función de Cloudflare). Si no responde (o
  // está bloqueada), se queda en STUN, que basta para casi todas las conexiones.
  const TURN = 'https://squadmeet-73y6k.pages.dev/turn';
  let iceGuardado = null;
  async function servidoresIce() {
    if (iceGuardado && Date.now() - iceGuardado.hora < 3600e3) return iceGuardado.lista;
    let lista = SQUAD_ICE;
    try {
      const r = await fetch(TURN, { signal: AbortSignal.timeout(5000), cache: 'no-store' });
      const { iceServers } = await r.json();
      if (r.ok && Array.isArray(iceServers) && iceServers.length) lista = [...SQUAD_ICE, ...iceServers];
    } catch {}
    iceGuardado = { lista, hora: Date.now() };
    return lista;
  }
  const hayTurn = (lista) => lista.some((s) => [].concat(s.urls).some((u) => /^turns?:/.test(u)));

  // Una RTCPeerConnection con los candidatos ICE "goteados" por el cartero. Guarda los que
  // llegan antes que la descripción remota.
  class Enlace {
    constructor(PC, enviarCandidato, ice = SQUAD_ICE) {
      this.pc = new PC({ iceServers: ice });
      this.pendientes = [];
      this.pc.onicecandidate = (e) => {
        if (!e.candidate || !e.candidate.candidate) return;
        const { candidate, sdpMid, sdpMLineIndex, usernameFragment } = e.candidate;
        const c = { candidate, sdpMid, sdpMLineIndex };
        if (usernameFragment) c.usernameFragment = usernameFragment;
        enviarCandidato(c);
      };
    }

    async ponerRemota(desc) {
      await this.pc.setRemoteDescription(desc);
      for (const c of this.pendientes.splice(0)) await this.pc.addIceCandidate(c).catch(() => {});
    }

    async candidato(c) {
      if (this.pc.remoteDescription) await this.pc.addIceCandidate(c).catch(() => {});
      else this.pendientes.push(c);
    }

    cerrar() {
      try { this.pc.close(); } catch {}
    }
  }

  // Cuerpos de mensaje con la forma que acepta el servidor.
  const paquete = {
    sdp: (desc, cid, metadata) => ({ sdp: { type: desc.type, sdp: desc.sdp }, type: 'media', connectionId: cid, metadata }),
    candidato: (c, cid) => ({ candidate: c, type: 'media', connectionId: cid }),
  };

  // degradacion: 'maintain-resolution' para que, si falta red o CPU, bajen los fps y no la nitidez.
  // Si el navegador no la admite, se aplica el resto igualmente.
  // reduccion: cuánto encoge el navegador la imagen antes de codificarla (1 = tal cual).
  async function limitarVideo(sender, kbps, fps, degradacion, reduccion) {
    const aplicar = async (conDegradacion, conReduccion) => {
      const p = sender.getParameters();
      if (!p.encodings || !p.encodings.length) p.encodings = [{}];
      p.encodings[0].maxBitrate = kbps * 1000;
      if (fps) p.encodings[0].maxFramerate = fps;
      if (conReduccion) p.encodings[0].scaleResolutionDownBy = reduccion;
      if (conDegradacion) p.degradationPreference = degradacion;
      await sender.setParameters(p);
    };
    try { await aplicar(!!degradacion, !!reduccion); } catch {
      try { await aplicar(false, !!reduccion); } catch {
        try { await aplicar(false, false); } catch {}
      }
    }
  }

  return { Cartero, Enlace, paquete, aleatorio, limitarVideo, servidoresIce, hayTurn };
})();

// SquadMeet — núcleo del anfitrión. Corre dentro de ome.tv: la extensión lo inyecta al empezar a
// cargar la página y el marcador del móvil lo añade cuando ya está cargada.
//
// ome.tv pide la cámara con getUserMedia y la envía con RTCPeerConnection. Mientras no hay grupo le
// damos la cámara real sin tocarla. Al crear un grupo cambiamos esas pistas por las de un lienzo que
// junta tu cámara con la de hasta 3 amigos, y por un audio que mezcla vuestros micrófonos. A cada
// amigo le mandamos otro lienzo con el desconocido y el grupo, y un audio con todos menos él.

if (window.__squadmeet) window.__squadmeet.mostrar();
else iniciarSquad();

function iniciarSquad() {
  // La web va fijada al construir: la de producción, o la del servidor de pruebas.
  const SITIO = 'https://squadmeet.app/';
  const VERSION = '1.4.0';
  const MAX_GRATIS = 3, MAX_PRO = 5;  // amigos por grupo: gratis y con Pro
  const API = 'https://senal.squadmeet.app/api/';
  const TIENDA = { siempre: 'https://payhip.com/b/df4JA', mensual: '' };
  const FPS = 24;
  const FPS_VISOR = 24;
  const KBPS_VISOR = 2500;
  const CLAVE_GRUPO = 'squadmeet:grupo';
  const CLAVE_POS = 'squadmeet:pos';
  const CLAVE_ESPEJO = 'squadmeet:espejo';
  const COLORES = ['#ffd43b', '#ff6b57', '#5b8cff', '#2fd38a', '#c9b6ff', '#ff9ec7'];
  const VIDEO_DEF = { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } };
  const AUDIO_DEF = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

  // El panel sale en el idioma del navegador. Lo que ve cada amigo en su lienzo (los nombres, «Esperando
  // a que conectéis…») va en el idioma del suyo, que nos dice al entrar.
  const TEXTOS = {
    es: {
      esperando: 'Cuando tu amigo pulse Iniciar, aquí saldrá la otra persona',
      buscando: 'Buscando a alguien…',
      anfitrion: 'Anfitrión',
      amigo: (i) => `Amigo ${i}`,
      tuAmigo: 'Tu amigo',
      yaHablabas: 'Ya estabas hablando con alguien: pulsa «Siguiente» en Ome.tv para que el próximo os vea a todos.',
      sinPermiso: 'Ome.tv no tiene permiso para usar la cámara y el micrófono. Actívalo en los ajustes de esta web en el navegador y vuelve a pulsar el botón.',
      sinCamara: 'No se ha podido abrir la cámara. Ciérrala en otras apps y vuelve a probar.',
      falloConTurn: (n) => `${n} no ha podido conectar. Que cierre la página y vuelva a abrir el enlace.`,
      falloSinTurn: (n) => `${n} no ha podido conectar: vuestras redes no dejan la conexión directa (pasa mucho con datos móviles). Que pruebe con wifi.`,
      seUne: (n) => `${n} se ha unido`,
      sacado: (n) => `Has sacado a ${n}`,
      sale: (n) => `${n} ha salido`,
      abrir: 'Abrir SquadMeet',
      presentacion: (n) => `Sal en Ome.tv con hasta ${n} amigos a la vez. Ellos solo tienen que abrir un enlace.`,
      escritorio: 'En el móvil, Ome.tv solo deja chatear en la versión de ordenador. Actívala y vuelve a pulsar SquadMeet:',
      escritorioSafari: 'iPhone: toca aA (o ⋯) → «Solicitar sitio web de escritorio», el botón (no los ajustes). Se abrirá ome.tv.',
      escritorioChrome: 'Android: menú ⋮ → «Ver como ordenador».',
      recordarEscritorio: 'Para que Safari recuerde la versión de ordenador: aA (o ⋯) → «Ajustes del sitio web» → «Solicitar sitio web de escritorio».',
      loginSafari: 'Inicia sesión con Facebook: con Google, en Safari, se queda cargando. ¿Sin Facebook? En Ajustes → Apps → Safari, desactiva «Evitar seguimiento entre sitios» y «Bloquear ventanas emergentes» y recarga.',
      favoritoListo: '✓ El favorito funciona.',
      favoritoSiguiente: 'Ahora entra en ome.tv en versión de ordenador y púlsalo allí.',
      abrirOme: 'Abrir ome.tv',
      preparando: 'Preparando la cámara…',
      reanudar: 'Reanudar el grupo',
      crearNuevo: 'Crear uno nuevo',
      crear: 'Crear grupo',
      tu: 'Tú',
      silenciado: 'Silenciado',
      enGrupo: 'En el grupo',
      camaraApagada: 'Cámara apagada',
      reconectando: 'Reconectando…',
      entrando: 'Entrando…',
      confirmarSacar: (n) => `Confirmar: sacar a ${n}`,
      sacar: 'Sacar',
      sacarA: (n) => `Sacar a ${n} del grupo`,
      sacarTitulo: 'Sacar del grupo',
      silenciar: 'Silenciar',
      quitarSilencio: 'Quitar silencio',
      silenciarA: (n) => `Silenciar a ${n}`,
      quitarSilencioA: (n) => `Quitar silencio a ${n}`,
      huecos: (n) => (n === 1 ? 'Queda 1 hueco libre' : `Quedan ${n} huecos libres`),
      hueco: 'Hueco libre',
      enlace: 'Enlace para tus amigos',
      conectando: 'Conectando…',
      enlaceGrupo: 'Enlace del grupo',
      copiarEnlace: 'Copiar enlace',
      copiar: 'Copiar',
      compartirEnlace: 'Compartir enlace',
      compartir: 'Compartir',
      volumen: 'Volumen de tus amigos',
      seguro: '¿Seguro? Pulsa otra vez',
      terminar: 'Terminar grupo',
      minimizar: 'Minimizar',
      invertir: 'Invertir tu imagen',
      auriculares: 'Usad auriculares para que no haya eco.',
      empezarMovil: 'Ya podéis empezar: minimiza este panel (–) y pulsa Iniciar en Ome.tv.',
      empezarPc: 'Ya podéis empezar: pulsa Iniciar en Ome.tv. Usad auriculares para que no haya eco.',
      cuandoMovil: 'Cuando entren, minimiza este panel (–) y pulsa Iniciar en Ome.tv.',
      cuandoPc: 'Cuando entren, pulsa Iniciar en Ome.tv y el desconocido os verá a todos.',
      invitacionTitulo: 'Únete a mi grupo',
      invitacionTexto: 'Sal conmigo en Ome.tv:',
      ruta: 'unirse', precios: '#precios',
      tiempoHoy: 'Tiempo gratis de hoy',
      ganar30: '+30 min gratis: compártelo por WhatsApp',
      mensajeWhatsapp: 'Prueba SquadMeet: sales en Ome.tv con tus amigos, todos en la misma imagen. https://squadmeet.app',
      hazPro: 'Sin límite con Pro',
      ultimoMinuto: 'Queda 1 minuto gratis hoy.',
      acabaConversacion: 'Se acabó el tiempo gratis de hoy. Terminad esta conversación: al pasar al siguiente, el grupo se pausa.',
      agotadoTitulo: 'Se ha acabado tu tiempo gratis de hoy',
      agotadoTexto: 'Mañana tienes otros 10 minutos. Para seguir ahora, hazte Pro:',
      agotadoTextoExtra: 'Mañana tienes otros 10 minutos. Para seguir ahora, gana 30 minutos más o hazte Pro:',
      proSiempre: '5 €', proSiempreSub: 'para siempre', proMensual: '1,99 €', proMensualSub: 'al mes',
      ventajasPro: ['Sin límite de tiempo', 'Hasta 5 amigos', 'HD para tus amigos', 'Chat del grupo y votos'],
      tengoClave: 'Tengo una clave', clavePlaceholder: 'Pega tu clave de Pro', activar: 'Activar', activando: 'Comprobando…', cancelar: 'Cancelar',
      claveAyuda: 'Te llegó por correo al comprar Pro.',
      correoEtiqueta: 'Tu correo (el mismo con el que pagarás)', correoPlaceholder: 'tucorreo@ejemplo.com',
      pagar: (p) => (p === 'mensual' ? 'Pagar 1,99 € al mes' : 'Pagar 5 € para siempre'),
      esperandoTitulo: 'Completa el pago en Payhip',
      esperandoTexto: (c) => `Paga con <b>${c}</b>. En cuanto termines, Pro se activa solo aquí. No cierres ome.tv.`,
      otroCorreo: 'Cambiar de correo', yaPro: '¡Ya eres Pro!',
      bienvenidaTexto: 'Pago completado. Ya tienes todo esto en este navegador:', empezar: 'Empezar',
      bienvenidaNota: 'Te hemos mandado también una clave por correo: guárdala por si cambias de ordenador.',
      proActivo: (p) => (p === 'mensual' ? 'Pro mensual activo' : 'Pro para siempre activo'),
      quitarClave: 'Quitar de este dispositivo',
      errores: {
        invalida: 'Esa clave no existe. Cópiala tal cual del correo de la compra.',
        correo: 'Escribe bien tu correo.',
        caducada: 'Esa clave ya no está activa (reembolsada o suscripción terminada).',
        limite: 'Esa clave ya se usa en 3 dispositivos. Quítala de uno o escríbenos.',
        tienda: 'No hemos podido comprobarla ahora. Prueba en un rato.',
        despacio: 'Demasiados intentos. Espera un minuto.',
        red: 'No hay conexión con SquadMeet. Prueba en un rato.',
      },
      chat: 'Chat del grupo', escribir: 'Escribe al grupo…', enviar: 'Enviar', chatVacio: 'Solo lo veis vosotros.',
      votos: (n, total) => `${n} de ${total} quieren pasar al siguiente`, sinVotos: 'Nadie ha pedido pasar al siguiente',
    },
    en: {
      esperando: 'When your friend presses Start, the other person will show up here',
      buscando: 'Looking for someone…',
      anfitrion: 'Host',
      amigo: (i) => `Friend ${i}`,
      tuAmigo: 'Your friend',
      yaHablabas: 'You were already talking to someone: press “Next” on Ome.tv so the next person sees all of you.',
      sinPermiso: "Ome.tv isn't allowed to use your camera and microphone. Allow it in your browser's settings for this site and press the button again.",
      sinCamara: "Couldn't open the camera. Close it in other apps and try again.",
      falloConTurn: (n) => `${n} couldn't connect. Ask them to close the page and open the link again.`,
      falloSinTurn: (n) => `${n} couldn't connect: your networks block direct connections (common on mobile data). Ask them to try Wi-Fi.`,
      seUne: (n) => `${n} joined`,
      sacado: (n) => `You removed ${n}`,
      sale: (n) => `${n} left`,
      abrir: 'Open SquadMeet',
      presentacion: (n) => `Go on Ome.tv with up to ${n} friends at once. They just open a link.`,
      escritorio: 'On phones, Ome.tv only lets you chat on the desktop site. Turn it on and press SquadMeet again:',
      escritorioSafari: 'iPhone: tap aA (or ⋯) → “Request Desktop Website”, the button (not the settings). ome.tv will open.',
      escritorioChrome: 'Android: ⋮ menu → “Desktop site”.',
      recordarEscritorio: 'To make Safari remember the desktop site: aA (or ⋯) → “Website Settings” → “Request Desktop Website”.',
      loginSafari: 'Sign in with Facebook: with Google, Safari gets stuck loading. No Facebook? In Settings → Apps → Safari, turn off “Prevent Cross-Site Tracking” and “Block Pop-ups”, then reload.',
      favoritoListo: '✓ The bookmark works.',
      favoritoSiguiente: 'Now open ome.tv as the desktop site and tap it there.',
      abrirOme: 'Open ome.tv',
      preparando: 'Getting the camera ready…',
      reanudar: 'Resume the group',
      crearNuevo: 'Create a new one',
      crear: 'Create group',
      tu: 'You',
      silenciado: 'Muted',
      enGrupo: 'In the group',
      camaraApagada: 'Camera off',
      reconectando: 'Reconnecting…',
      entrando: 'Joining…',
      confirmarSacar: (n) => `Confirm: remove ${n}`,
      sacar: 'Remove',
      sacarA: (n) => `Remove ${n} from the group`,
      sacarTitulo: 'Remove from the group',
      silenciar: 'Mute',
      quitarSilencio: 'Unmute',
      silenciarA: (n) => `Mute ${n}`,
      quitarSilencioA: (n) => `Unmute ${n}`,
      huecos: (n) => (n === 1 ? '1 spot left' : `${n} spots left`),
      hueco: 'Free spot',
      enlace: 'Link for your friends',
      conectando: 'Connecting…',
      enlaceGrupo: 'Group link',
      copiarEnlace: 'Copy link',
      copiar: 'Copy',
      compartirEnlace: 'Share link',
      compartir: 'Share',
      volumen: "Friends' volume",
      seguro: 'Sure? Press again',
      terminar: 'End group',
      minimizar: 'Minimize',
      invertir: 'Mirror your image',
      auriculares: 'Use headphones to avoid echo.',
      empezarMovil: "You're ready: minimize this panel (–) and press Start on Ome.tv.",
      empezarPc: "You're ready: press Start on Ome.tv. Use headphones to avoid echo.",
      cuandoMovil: 'Once they join, minimize this panel (–) and press Start on Ome.tv.',
      cuandoPc: 'Once they join, press Start on Ome.tv and the stranger will see all of you.',
      invitacionTitulo: 'Join my group',
      invitacionTexto: 'Join me on Ome.tv:',
      ruta: 'join', precios: 'en/#pricing',
      tiempoHoy: 'Free time today',
      ganar30: '+30 free min: share it on WhatsApp',
      mensajeWhatsapp: 'Try SquadMeet: go on Ome.tv with your friends, all in the same picture. https://squadmeet.app',
      hazPro: 'No limits with Pro',
      ultimoMinuto: '1 free minute left today.',
      acabaConversacion: 'Your free time for today is up. Finish this conversation: when you skip to the next one, the group pauses.',
      agotadoTitulo: 'Your free time for today is up',
      agotadoTexto: 'Tomorrow you get another 10 minutes. To keep going now, go Pro:',
      agotadoTextoExtra: 'Tomorrow you get another 10 minutes. To keep going now, get 30 more minutes or go Pro:',
      proSiempre: '€5', proSiempreSub: 'forever', proMensual: '€1.99', proMensualSub: 'a month',
      ventajasPro: ['No time limit', 'Up to 5 friends', 'HD for your friends', 'Group chat and voting'],
      tengoClave: 'I have a key', clavePlaceholder: 'Paste your Pro key', activar: 'Activate', activando: 'Checking…', cancelar: 'Cancel',
      claveAyuda: 'It came by email when you bought Pro.',
      correoEtiqueta: 'Your email (the one you’ll pay with)', correoPlaceholder: 'you@example.com',
      pagar: (p) => (p === 'mensual' ? 'Pay €1.99 a month' : 'Pay €5 forever'),
      esperandoTitulo: 'Finish paying on Payhip',
      esperandoTexto: (c) => `Pay with <b>${c}</b>. As soon as you’re done, Pro turns on here by itself. Don’t close ome.tv.`,
      otroCorreo: 'Use another email', yaPro: 'You’re Pro now!',
      bienvenidaTexto: 'Payment complete. You now have all this in this browser:', empezar: 'Let’s go',
      bienvenidaNota: 'We also emailed you a key: keep it in case you switch computers.',
      proActivo: (p) => (p === 'mensual' ? 'Pro monthly active' : 'Pro forever active'),
      quitarClave: 'Remove from this device',
      errores: {
        invalida: 'That key doesn’t exist. Copy it exactly from your purchase email.',
        correo: 'Check your email address.',
        caducada: 'That key is no longer active (refunded or subscription ended).',
        limite: 'That key is already used on 3 devices. Remove it from one or write to us.',
        tienda: 'We couldn’t check it right now. Try again in a while.',
        despacio: 'Too many tries. Wait a minute.',
        red: 'Can’t reach SquadMeet. Try again in a while.',
      },
      chat: 'Group chat', escribir: 'Write to the group…', enviar: 'Send', chatVacio: 'Only you can see it.',
      votos: (n, total) => `${n} of ${total} want to skip to the next one`, sinVotos: 'No one has asked to skip yet',
    },
  };
  const textosDe = (idioma) => TEXTOS[/^es\b/i.test(idioma || '') ? 'es' : 'en'];
  const t = textosDe(navigator.language);

  const md = navigator.mediaDevices;
  if (!md || !md.getUserMedia || !window.RTCPeerConnection) return;
  const gumNativo = md.getUserMedia.bind(md);
  const PCNativo = window.RTCPeerConnection;
  const tardio = document.readyState !== 'loading';

  const real = { video: null, audio: null };   // tu cámara y tu micro de verdad
  const streamsSitio = new Set();              // MediaStreams que tiene ome.tv
  const pcsSitio = new Set();                  // conexiones de ome.tv (la del desconocido)
  const propias = new WeakSet();               // nuestras conexiones con los amigos
  const nuestras = new WeakSet();              // pistas que no son de ome.tv: lienzos, mezclas, amigos
  const capturadas = new WeakSet();            // pistas que han salido de getUserMedia
  const clonesSitio = new Set();               // copias de nuestras pistas entregadas a ome.tv
  const invitados = new Map();                 // id del amigo → invitado
  let grupo = null;
  let salida = null;
  let mezcla = null;
  let reloj = null;
  let desconocido = { video: null, audio: null, clave: '' };
  let vistoDesconocido = false;                // si en este grupo ya habéis hablado con alguien
  let fundido = { hay: false, desde: 0 };      // cuándo ha aparecido o se ha ido el desconocido
  let espejoYo = false;                        // tu imagen invertida para los demás
  let ligero = false;                          // anfitrión en el móvil: ver «Modo móvil» más abajo
  try { espejoYo = localStorage.getItem(CLAVE_ESPEJO) === '1'; } catch {}
  let preparando = false;
  let error = '';
  let aviso = '';

  // ── Ganchos en las APIs que usa ome.tv ────────────────────────────────────────────────────────

  md.getUserMedia = function getUserMedia(c) { return pedirMedios(c); };

  function registrarPC(pc) {
    if (!propias.has(pc)) pcsSitio.add(pc);
  }
  class PCSitio extends PCNativo {
    constructor(...a) { super(...a); registrarPC(this); }
  }
  window.RTCPeerConnection = PCSitio;
  if ('webkitRTCPeerConnection' in window) window.webkitRTCPeerConnection = PCSitio;
  // Si llegamos tarde (marcador), ome.tv ya puede tener una conexión abierta: la reconocemos en
  // cuanto llama a cualquiera de estos métodos.
  for (const m of ['getStats', 'getSenders', 'getReceivers', 'getTransceivers', 'addIceCandidate', 'setLocalDescription', 'setRemoteDescription', 'addTrack']) {
    const original = PCNativo.prototype[m];
    if (typeof original !== 'function') continue;
    PCNativo.prototype[m] = function (...a) { registrarPC(this); return original.apply(this, a); };
  }
  class PCPropia extends PCNativo {
    constructor(c) { super(c); propias.add(this); }
  }

  async function pedirMedios(c) {
    const quiere = { video: !!(c && c.video), audio: !!(c && c.audio) };
    if (!grupo || (!quiere.video && !quiere.audio)) {
      const s = await gumNativo(c);
      adoptar(s);
      return s;
    }
    await asegurarReal(c);
    const s = new MediaStream();
    if (quiere.video) s.addTrack(clonar(salida.video));
    if (quiere.audio) s.addTrack(clonar(mezcla.pistaSitio));
    streamsSitio.add(s);
    return s;
  }

  function adoptar(s) {
    streamsSitio.add(s);
    for (const t of s.getTracks()) {
      if (nuestras.has(t)) continue;
      capturadas.add(t);
      real[t.kind] = t;
    }
  }

  // Llegamos tarde y ome.tv ya tiene la cámara: la buscamos en su vista previa. Primero por groupId
  // (solo lo tienen las pistas locales); si el navegador no lo da, el vídeo silenciado.
  function adoptarExistente() {
    const candidatos = [...document.querySelectorAll('video')].filter((v) => {
      const s = v.srcObject;
      return s instanceof MediaStream && !deposito.contains(v) && s.getVideoTracks().some((t) => vivo(t) && !nuestras.has(t));
    });
    const elegido = candidatos.find((v) => v.srcObject.getVideoTracks().some(esLocal))
      || (candidatos.filter((v) => v.muted).length === 1 ? candidatos.find((v) => v.muted) : null);
    if (elegido) adoptar(elegido.srcObject);
  }

  // Deja en `real` una cámara y un micro vivos que cumplan lo que pide `c` (o los valores por defecto).
  async function asegurarReal(c) {
    const pedir = {};
    for (const tipo of ['video', 'audio']) {
      const r = c ? c[tipo] : true;
      if (!r) continue;
      if (vivo(real[tipo]) && mismoDispositivo(r, real[tipo])) continue;
      pedir[tipo] = r === true ? (tipo === 'video' ? VIDEO_DEF : AUDIO_DEF) : r;
    }
    if (!pedir.video && !pedir.audio) return;
    const s = await gumNativo(pedir);
    const viejas = [];
    for (const t of s.getTracks()) {
      capturadas.add(t);
      if (real[t.kind] && real[t.kind] !== t) viejas.push(real[t.kind]);
      real[t.kind] = t;
    }
    if (salida) ponerFuente(salida.videoYo, real.video);
    if (mezcla) mezcla.fuente('yo', real.audio);
    // Con grupo, ome.tv solo tiene copias del lienzo: las pistas viejas ya no las usa nadie.
    if (grupo) for (const t of viejas) if (!sitioUsa(t)) t.stop();
  }

  function mismoDispositivo(r, pista) {
    if (!r || r === true) return true;
    const ajustes = pista.getSettings();
    const valor = (x) => (x && typeof x === 'object' ? x.exact || x.ideal : x);
    const id = valor(r.deviceId);
    if (id && typeof id === 'string' && id !== ajustes.deviceId) return false;
    const cara = valor(r.facingMode);
    if (cara && typeof cara === 'string' && ajustes.facingMode && cara !== ajustes.facingMode) return false;
    return true;
  }

  const vivo = (t) => !!t && t.readyState === 'live';
  // Ojo: Chrome también da deviceId a las pistas remotas; groupId solo lo tienen las locales.
  const esLocal = (t) => {
    if (capturadas.has(t)) return true;
    const a = t.getSettings ? t.getSettings() : null;
    return !!(a && a.groupId);
  };
  const sitioUsa = (t) => [...streamsSitio].some((s) => s.getTracks().includes(t));
  function clonar(t) {
    const c = t.clone();
    nuestras.add(c);
    clonesSitio.add(c);
    return c;
  }

  // Cambia lo que envía ome.tv: el grupo (true) o tu cámara tal cual (false). Devuelve cuántas
  // pistas en vuelo se han podido cambiar.
  function convertirSitio(aGrupo) {
    const cambios = new Map();
    const reemplazo = (t) => {
      if (cambios.has(t)) return cambios.get(t);
      let nueva = null;
      if (aGrupo) nueva = clonar(t.kind === 'video' ? salida.video : mezcla.pistaSitio);
      else if (vivo(real[t.kind])) nueva = real[t.kind];
      cambios.set(t, nueva);
      return nueva;
    };
    const hayQueCambiar = (t) => (aGrupo ? !nuestras.has(t) && (t === real[t.kind] || esLocal(t)) : clonesSitio.has(t));
    for (const s of streamsSitio) {
      const pistas = s.getTracks();
      if (!pistas.some(vivo)) { streamsSitio.delete(s); continue; }
      for (const t of pistas) {
        if (!hayQueCambiar(t)) continue;
        const nueva = reemplazo(t);
        s.removeTrack(t);
        if (nueva) s.addTrack(nueva);
      }
    }
    let enVuelo = 0;
    for (const pc of [...pcsSitio]) {
      if (cerrada(pc)) { pcsSitio.delete(pc); continue; }
      for (const sender of pc.getSenders()) {
        if (!sender.track || !hayQueCambiar(sender.track)) continue;
        sender.replaceTrack(reemplazo(sender.track)).catch(() => {});
        enVuelo++;
      }
    }
    // Los <video> de ome.tv que enseñan esos streams se refrescan para coger las pistas nuevas.
    for (const v of document.querySelectorAll('video')) {
      const s = v.srcObject;
      if (!(s instanceof MediaStream) || deposito.contains(v) || !streamsSitio.has(s)) continue;
      v.srcObject = null;
      v.srcObject = s;
      v.play().catch(() => {});
    }
    if (!aGrupo) {
      for (const c of clonesSitio) c.stop();
      clonesSitio.clear();
    }
    return enVuelo;
  }

  const cerrada = (pc) => pc.signalingState === 'closed' || pc.connectionState === 'closed';

  // ── El desconocido ────────────────────────────────────────────────────────────────────────────

  // Lo que dice ome.tv de su hueco del desconocido: 'buscando' (entre una persona y la siguiente),
  // 'parado' (antes de pulsar Iniciar o tras Parar) o '' (hablando, o una web que no lo dice).
  function estadoOme() {
    const remoto = document.getElementById('remote-video');
    const clases = remoto && remoto.parentElement ? String(remoto.parentElement.className) : '';
    // Si a la vez dice que hay conexión o vídeo, manda eso: más vale enseñar al desconocido de más.
    if (/--(connected|can-play)\b/.test(clases)) return '';
    if (/--searching\b/.test(clases)) return 'buscando';
    if (/--stopped\b/.test(clases)) return 'parado';
    return '';
  }

  // El desconocido solo puede venir de una conexión de ome.tv. Ome.tv enseña tu imagen en más
  // <video> (la foto de sus avisos, por ejemplo), y si tomáramos uno de esos por el desconocido,
  // mientras busca a otra persona tus amigos se verían a sí mismos en su hueco.
  function buscarDesconocido() {
    if (estadoOme()) return [];
    for (const pc of [...pcsSitio].reverse()) {
      if (cerrada(pc)) { pcsSitio.delete(pc); continue; }
      const conectada = pc.connectionState === 'connected' || ['connected', 'completed'].includes(pc.iceConnectionState);
      if (!conectada) continue;
      const pistas = pc.getReceivers().map((r) => r.track).filter(vivo);
      // Una pista de vídeo silenciada no recibe imagen: el desconocido se ha ido y ome.tv aún no ha
      // colgado. Mejor el cargador que su último fotograma congelado.
      if (pistas.some((t) => t.kind === 'video' && !t.muted)) return pistas;
    }
    // Plan B, solo mientras no conocemos ninguna conexión (el favorito llega con la llamada en marcha):
    // el <video> donde ome.tv pone al desconocido.
    if (pcsSitio.size) return [];
    const remoto = document.getElementById('remote-video');
    const candidatos = remoto ? [remoto] : [...document.querySelectorAll('video')].filter((v) => !v.muted);
    for (const v of candidatos) {
      const s = v.srcObject;
      if (!(s instanceof MediaStream) || deposito.contains(v) || streamsSitio.has(s)) continue;
      const pistas = s.getTracks().filter((t) => vivo(t) && !nuestras.has(t) && !esLocal(t) && t !== real[t.kind]);
      if (pistas.some((t) => t.kind === 'video' && !t.muted)) return pistas;
    }
    return [];
  }

  function vigilarDesconocido() {
    const pistas = buscarDesconocido();
    const video = pistas.find((t) => t.kind === 'video') || null;
    const audio = pistas.find((t) => t.kind === 'audio') || null;
    const clave = (video ? video.id : '') + '|' + (audio ? audio.id : '');
    if (clave === desconocido.clave) return;
    const habia = !!desconocido.video;
    desconocido = { video, audio, clave };
    if (video) vistoDesconocido = true;
    ponerFuente(medios.desconocido, video);
    // Chrome no deja oír una pista remota en WebAudio si no está también en un elemento de audio.
    medios.desconocidoAudio.srcObject = audio ? new MediaStream([audio]) : null;
    if (audio) medios.desconocidoAudio.play().catch(() => {});
    if (mezcla) mezcla.fuente('desconocido', audio);
    if (habia && video) aviso = '';
    // En el móvil el panel tapa los botones de ome.tv: al empezar a hablar con alguien se recoge.
    if (video && !habia && esMovil()) plegado = true;
    for (const inv of invitados.values()) enviarA(inv, { tipo: 'desconocido', presente: !!video });
    if (votos.size) { votos.clear(); avisarVotos(); }
    // Sin tiempo gratis se deja acabar la conversación; al irse ese desconocido, el grupo se pausa.
    if (cortarAlSiguiente && habia) return pausarPorTiempo();
    pintarPanel();
  }

  // ── Elementos ocultos para dibujar y oír ──────────────────────────────────────────────────────

  const deposito = document.createElement('div');
  deposito.setAttribute('aria-hidden', 'true');
  deposito.style.cssText = 'position:fixed;left:0;bottom:0;width:2px;height:2px;overflow:hidden;opacity:0.01;pointer-events:none;z-index:-1;';

  function elemento(tipo, mudo = true) {
    const el = document.createElement(tipo);
    el.muted = mudo;
    el.autoplay = true;
    el.playsInline = true;
    el.setAttribute('playsinline', '');
    el.style.cssText = 'width:2px;height:2px;';
    deposito.appendChild(el);
    return el;
  }
  const medios = { desconocido: elemento('video'), desconocidoAudio: elemento('audio') };

  function ponerFuente(el, pista) {
    const actual = el.srcObject && el.srcObject.getTracks()[0];
    if (actual === pista || (!actual && !pista)) return;
    el.srcObject = pista ? new MediaStream([pista]) : null;
    if (pista) el.play().catch(() => {});
  }

  // ── Lienzos: lo que ve el desconocido y lo que ven tus amigos ─────────────────────────────────

  // En el móvil, 960 como mucho: menos que dibujar y que codificar, y Ome.tv apenas lo nota.
  function medidas(w, h) {
    const k = Math.min(1, (ligero ? 960 : 1280) / Math.max(w, h));
    return [Math.round((w * k) / 2) * 2, Math.round((h * k) / 2) * 2];
  }

  function crearSalida() {
    const lienzo = document.createElement('canvas');
    const a = real.video ? real.video.getSettings() : {};
    [lienzo.width, lienzo.height] = medidas(a.width || 1280, a.height || 720);
    deposito.appendChild(lienzo);
    const g = lienzo.getContext('2d', { alpha: false });
    suavizar(g);
    g.fillStyle = '#000';
    g.fillRect(0, 0, lienzo.width, lienzo.height);
    const video = lienzo.captureStream(fpsGrupo()).getVideoTracks()[0];
    nuestras.add(video);
    // orden: quién va en cada celda (null = el anfitrión), para poner los nombres a los amigos.
    salida = { lienzo, g, video, videoYo: elemento('video'), orden: [null] };
    ponerFuente(salida.videoYo, real.video);
  }

  // Celdas para 1-4 personas. Tú siempre vas primero.
  function distribuir(n, W, H) {
    const w2 = Math.round(W / 2), h2 = Math.round(H / 2);
    if (n <= 1) return [[0, 0, W, H]];
    // Con Pro, hasta 6: 3 + 2 (o 3 + 3) en apaisado y 2 + 2 + 1 (o 2 + 2 + 2) en vertical.
    if (n >= 5) {
      const filas = W >= H ? [3, n - 3] : [2, 2, n - 4];
      const celdas = [];
      filas.forEach((cuantas, f) => {
        const y0 = Math.round((f * H) / filas.length), y1 = Math.round(((f + 1) * H) / filas.length);
        for (let c = 0; c < cuantas; c++) {
          const x0 = Math.round((c * W) / cuantas), x1 = Math.round(((c + 1) * W) / cuantas);
          celdas.push([x0, y0, x1 - x0, y1 - y0]);
        }
      });
      return celdas;
    }
    if (W >= H) {
      if (n === 2) return [[0, 0, w2, H], [w2, 0, W - w2, H]];
      if (n === 3) return [[0, 0, w2, H], [w2, 0, W - w2, h2], [w2, h2, W - w2, H - h2]];
    } else {
      if (n === 2) return [[0, 0, W, h2], [0, h2, W, H - h2]];
      if (n === 3) return [[0, 0, W, h2], [0, h2, w2, H - h2], [w2, h2, W - w2, H - h2]];
    }
    return [[0, 0, w2, h2], [w2, 0, W - w2, h2], [0, h2, w2, H - h2], [w2, h2, W - w2, H - h2]];
  }

  // Rellena la celda recortando lo que sobra. De lado se recorta por igual; de alto, el encuadre se
  // centra donde suele estar la cara (hacia el 40 % de la altura) y no en el medio: así un móvil en
  // vertical metido en una celda ancha no sale con la cabeza cortada.
  const ALTURA_CARA = 0.4;
  // Con `espejo`, la persona sale invertida de izquierda a derecha (como en un espejo).
  function cubrir(g, v, x, y, w, h, espejo) {
    const vw = v.videoWidth, vh = v.videoHeight;
    if (!vw || !vh || v.readyState < 2) return false;
    const k = Math.max(w / vw, h / vh);
    const sw = w / k, sh = h / k;
    const sy = Math.min(vh - sh, Math.max(0, vh * ALTURA_CARA - sh / 2));
    if (espejo) {
      g.save();
      g.translate(x + w, y);
      g.scale(-1, 1);
      g.drawImage(v, (vw - sw) / 2, sy, sw, sh, 0, 0, w, h);
      g.restore();
    } else {
      g.drawImage(v, (vw - sw) / 2, sy, sw, sh, x, y, w, h);
    }
    return true;
  }

  // Silueta para quien tiene la cámara apagada o aún no manda imagen.
  function silueta(g, x, y, w, h) {
    g.fillStyle = '#15151b';
    g.fillRect(x, y, w, h);
    const r = Math.min(w, h) * 0.13, cx = x + w / 2, cy = y + h / 2 - r * 0.5;
    g.fillStyle = '#2b2b35';
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(cx, cy + r * 2.3, r * 1.75, r * 1.15, 0, Math.PI, 0);
    g.fill();
  }

  function pintarSalida() {
    const { lienzo, g, videoYo } = salida;
    // El lienzo sigue a tu cámara: si giras el móvil o cambia su resolución, cambia con ella.
    const vw = videoYo.videoWidth, vh = videoYo.videoHeight;
    if (vw && vh) {
      const [mw, mh] = medidas(vw, vh);
      if (mw !== lienzo.width || mh !== lienzo.height) {
        lienzo.width = mw;
        lienzo.height = mh;
        suavizar(g);
      }
    }
    const W = lienzo.width, H = lienzo.height;
    const caras = [{ v: videoYo, apagada: !vivo(real.video) || !real.video.enabled, espejo: espejoYo, quien: null }];
    for (const inv of invitados.values()) {
      if (inv.video && inv.estado !== 'conectando') caras.push({ v: inv.video, apagada: !inv.camara, espejo: inv.espejo, quien: inv });
    }
    salida.orden = caras.map((c) => c.quien);
    const celdas = distribuir(caras.length, W, H);
    const borde = caras.length > 1 ? 1 : 0;
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    caras.forEach((c, i) => {
      const [x, y, w, h] = celdas[i];
      const dentro = [x + borde, y + borde, w - 2 * borde, h - 2 * borde];
      if (c.apagada || !cubrir(g, c.v, ...dentro, c.espejo)) silueta(g, ...dentro);
    });
  }

  // Lo que ven los amigos: el desconocido en grande y, al lado, el grupo tal cual lo ve el desconocido.
  // Es la misma pantalla para todos, así que se dibuja una sola vez por fotograma y se manda a cada uno
  // (una por forma, apaisada o vertical, y por idioma). Antes cada amigo tenía la suya y el móvil del
  // anfitrión no daba abasto. Si a uno no le llega, el navegador la encoge solo para él (regulador).
  const visores = new Map();
  function visorPara(inv) {
    const clave = `${inv.orient}|${inv.t.ruta}|${inv.calma ? 1 : 0}`;
    let visor = visores.get(clave);
    if (!visor) {
      const lienzo = document.createElement('canvas');
      deposito.appendChild(lienzo);
      visor = { clave, lienzo, g: lienzo.getContext('2d', { alpha: false }), orient: inv.orient, t: inv.t, calma: inv.calma, amigos: new Set() };
      pintarVisor(visor, performance.now());
      // Sin contentHint «detail»: Chrome lo trata como compartir pantalla y descarta fotogramas.
      visor.pista = visor.lienzo.captureStream(fpsGrupo()).getVideoTracks()[0];
      nuestras.add(visor.pista);
      visores.set(clave, visor);
    }
    visor.amigos.add(inv);
    inv.visor = visor;
    return visor.pista;
  }
  function soltarVisor(inv) {
    const visor = inv.visor;
    inv.visor = null;
    if (!visor || (visor.amigos.delete(inv), visor.amigos.size)) return;
    visores.delete(visor.clave);
    visor.pista.stop();
    visor.lienzo.remove();
  }
  // Al girar el móvil, el amigo pasa a la pantalla de la otra forma (la conexión no cambia).
  function cambiarVisor(inv) {
    soltarVisor(inv);
    const pista = visorPara(inv);
    const sender = inv.enlace.pc.getSenders().find((s) => s.track && s.track.kind === 'video');
    if (sender) sender.replaceTrack(pista).catch(() => {});
  }

  // Al cambiar el tamaño de un lienzo se pierde el ajuste de suavizado.
  function suavizar(g) {
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
  }

  // El desconocido se lleva dos tercios de la pantalla (a la izquierda, o arriba en vertical) y el
  // grupo, el resto. Los huecos son fijos para que la pantalla no salte cada vez que cambia de
  // persona. El grupo es el mismo lienzo que recibe el desconocido, así que lo que ves es exactamente
  // cómo os ve; cada uno lleva su nombre.
  const PARTE_DESCONOCIDO = { h: 0.66, v: 0.66 };
  function pintarVisor(visor, ahora) {
    const { lienzo, g } = visor;
    const k = ESCALAS[techo()];
    const largo = Math.round((1280 * k) / 2) * 2, corto = Math.round((720 * k) / 2) * 2;
    const [W, H] = visor.orient === 'v' ? [corto, largo] : [largo, corto];
    if (lienzo.width !== W || lienzo.height !== H) {
      lienzo.width = W;
      lienzo.height = H;
      suavizar(g);
    }
    const m = Math.round(Math.min(W, H) * 0.012);
    let zd, zg;
    if (visor.orient === 'h') {
      const a = Math.round(W * PARTE_DESCONOCIDO.h);
      zd = [0, 0, a, H];
      zg = [a + m, 0, W - a - m, H];
    } else {
      const a = Math.round(H * PARTE_DESCONOCIDO.v);
      zd = [0, 0, W, a];
      zg = [0, a + m, W, H - a - m];
    }
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    pintarDesconocido(g, visor, zd, ahora);
    // El grupo entero dentro de su hueco, centrado.
    const L = salida.lienzo;
    const e = Math.min(zg[2] / L.width, zg[3] / L.height);
    const w = Math.round(L.width * e), h = Math.round(L.height * e);
    const x = zg[0] + Math.round((zg[2] - w) / 2), y = zg[1] + Math.round((zg[3] - h) / 2);
    g.drawImage(L, x, y, w, h);
    const celdas = distribuir(salida.orden.length, L.width, L.height);
    salida.orden.forEach((quien, i) => {
      const [cx, cy, cw, ch] = celdas[i];
      etiqueta(g, quien ? nombreDe(quien, visor.t) : visor.t.anfitrion, x + cx * e, y + cy * e, cw * e, ch * e);
    });
  }

  // Como contener, pero acercando hasta un 40 % para llenar más su hueco: recorta un poco por los lados
  // (o por arriba y abajo, centrado en la cara) en vez de dejar bandas negras grandes.
  function encuadrar(g, v, x, y, w, h) {
    const vw = v.videoWidth, vh = v.videoHeight;
    if (!vw || !vh) return;
    const k = Math.min(Math.max(w / vw, h / vh), Math.min(w / vw, h / vh) * 1.4);
    const dw = Math.min(w, vw * k), dh = Math.min(h, vh * k);
    const sw = dw / k, sh = dh / k;
    const sy = Math.min(vh - sh, Math.max(0, vh * ALTURA_CARA - sh / 2));
    g.drawImage(v, (vw - sw) / 2, sy, sw, sh, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  // El hueco del desconocido. Al aparecer, su vídeo entra fundiéndose sobre el cargador; al irse, el
  // cargador entra desde negro. 220 ms con salida rápida: se nota el cambio sin hacer esperar.
  const salir = (x) => 1 - (1 - x) ** 3;
  function pintarDesconocido(g, inv, [x, y, w, h], ahora) {
    const p = salir(Math.min(1, (ahora - fundido.desde) / 220));
    if (!fundido.hay || p < 1) pintarEspera(g, inv, x, y, w, h, ahora, fundido.hay ? 1 : p);
    if (fundido.hay) {
      const v = medios.desconocido;
      g.globalAlpha = p;
      encuadrar(g, v, x, y, w, h);
      g.globalAlpha = 1;
    }
  }

  // Mientras ome.tv busca a la siguiente persona, el cargador de ome.tv: doce puntos en círculo que se
  // van apagando tras uno brillante. Gira a una vuelta por segundo (doce pasos, cada uno dos
  // fotogramas exactos a 24 fps, sin tirones). Si el amigo tiene pedido «menos movimiento», los puntos
  // no giran: solo laten. Antes de pulsar Iniciar no hay nada que esperar, así que solo un aviso quieto.
  function pintarEspera(g, inv, x, y, w, h, ahora, alfa) {
    g.save();
    g.globalAlpha = alfa;
    const cx = x + w / 2, cy = y + h / 2;
    const fondo = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7);
    fondo.addColorStop(0, '#1a1a23');
    fondo.addColorStop(1, '#0c0c11');
    g.fillStyle = fondo;
    g.fillRect(x, y, w, h);
    const lado = Math.min(w, h);
    const letra = Math.round(Math.max(12, lado * 0.042));
    g.font = `600 ${letra}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const estado = estadoOme();
    if (estado === 'buscando' || (vistoDesconocido && estado !== 'parado')) {
      const r = lado * 0.075, punto = Math.max(2, r * 0.17), cyc = cy - lado * 0.06;
      const paso = Math.floor(ahora / (1000 / 12)) % 12;
      g.fillStyle = '#fff';
      for (let i = 0; i < 12; i++) {
        const edad = (paso - i + 12) % 12;
        const brillo = inv.calma ? 0.35 + 0.25 * Math.sin(ahora / 700) : 1 - (edad / 12) * 0.85;
        g.globalAlpha = alfa * brillo;
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        g.beginPath();
        g.arc(cx + Math.cos(a) * r, cyc + Math.sin(a) * r, punto, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = alfa;
      g.fillStyle = '#a3a3b1';
      g.fillText(inv.t.buscando, cx, cyc + r + letra * 1.6, w * 0.9);
    } else {
      g.fillStyle = '#8d8d9a';
      g.fillText(inv.t.esperando, cx, cy, w * 0.9);
    }
    g.restore();
  }

  // Nombre en una pastilla abajo a la izquierda (solo en lo que ven los amigos, no el desconocido).
  function etiqueta(g, texto, x, y, w, h) {
    const t = Math.max(14, Math.round(Math.min(w, h) * 0.085));
    g.font = `600 ${t}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    const alto = Math.round(t * 1.7), margen = Math.round(t * 0.45);
    const ancho = Math.min(w - 2 * margen, g.measureText(texto).width + t);
    const x0 = x + margen, y0 = y + h - alto - margen;
    g.fillStyle = 'rgba(0, 0, 0, 0.55)';
    g.beginPath();
    if (g.roundRect) g.roundRect(x0, y0, ancho, alto, alto / 2);
    else g.rect(x0, y0, ancho, alto);
    g.fill();
    g.fillStyle = '#fff';
    g.fillText(texto, x0 + t / 2, y0 + alto / 2, ancho - t);
  }

  let msDibujo = 0;
  function pintar() {
    if (!salida) return;
    const t0 = performance.now();
    const v = medios.desconocido;
    const hay = !!desconocido.video && v.videoWidth > 0 && v.readyState >= 2;
    if (hay !== fundido.hay) fundido = { hay, desde: t0 };
    pintarSalida();
    for (const visor of visores.values()) pintarVisor(visor, t0);
    msDibujo = msDibujo * 0.9 + (performance.now() - t0) * 0.1;
  }

  // Un Worker marca el ritmo: los temporizadores de la página se frenan si la pestaña queda detrás.
  function crearReloj(fps, alTic) {
    try {
      const codigo = 'let t;onmessage=(e)=>{clearInterval(t);if(e.data>0)t=setInterval(()=>postMessage(0),e.data)}';
      const url = URL.createObjectURL(new Blob([codigo], { type: 'text/javascript' }));
      const w = new Worker(url);
      URL.revokeObjectURL(url);
      w.onmessage = alTic;
      w.postMessage(1000 / fps);
      return { parar: () => w.terminate() };
    } catch {
      const t = setInterval(alTic, 1000 / fps);
      return { parar: () => clearInterval(t) };
    }
  }

  // ── Mezcla de audio ───────────────────────────────────────────────────────────────────────────
  // Fuentes: 'yo', 'desconocido' y 'inv:<id>'. Destinos: 'sitio' (lo que oye el desconocido: tú y
  // tus amigos) y 'inv:<id>' (lo que oye cada amigo: todos menos él).

  function crearMezcla() {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const fuentes = new Map();
    const destinos = new Map();
    const sitio = ac.createMediaStreamDestination();
    destinos.set('sitio', sitio);

    function conectar() {
      for (const f of fuentes.values()) f.ganancia.disconnect();
      for (const [nf, f] of fuentes) {
        for (const [nd, d] of destinos) {
          if (nd === 'sitio' ? nf !== 'desconocido' : nf !== nd) f.ganancia.connect(d);
        }
      }
    }

    const m = {
      ac,
      pistaSitio: sitio.stream.getAudioTracks()[0],
      fuente(nombre, pista) {
        const vieja = fuentes.get(nombre);
        if (vieja && vieja.pista === pista) return;
        if (vieja) { vieja.nodo.disconnect(); vieja.ganancia.disconnect(); fuentes.delete(nombre); }
        if (vivo(pista)) {
          const nodo = ac.createMediaStreamSource(new MediaStream([pista]));
          const ganancia = ac.createGain();
          ganancia.gain.value = vieja ? vieja.ganancia.gain.value : 1;
          nodo.connect(ganancia);
          fuentes.set(nombre, { nodo, ganancia, pista });
        }
        conectar();
      },
      destino(nombre) {
        if (!destinos.has(nombre)) {
          destinos.set(nombre, ac.createMediaStreamDestination());
          conectar();
        }
        const pista = destinos.get(nombre).stream.getAudioTracks()[0];
        nuestras.add(pista);
        return pista;
      },
      quitarDestino(nombre) {
        const d = destinos.get(nombre);
        if (!d) return;
        destinos.delete(nombre);
        d.stream.getTracks().forEach((t) => t.stop());
        conectar();
      },
      volumen(nombre, v) {
        const f = fuentes.get(nombre);
        if (f) f.ganancia.gain.value = v;
      },
      cerrar() { ac.close().catch(() => {}); },
    };
    nuestras.add(m.pistaSitio);
    return m;
  }

  // Safari y Chrome pueden suspender el audio (en el iPhone, al ir a otra app): cualquier toque lo
  // reanuda, y también se intenta al volver a la página, para que el desconocido no deje de oíros.
  const reanudarAudio = () => { if (mezcla && mezcla.ac.state !== 'running') mezcla.ac.resume().catch(() => {}); };
  for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, reanudarAudio, true);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reanudarAudio(); });

  // En el iPhone el volumen de un <audio> no se puede cambiar (siempre está al máximo): ahí el control
  // de volumen no haría nada, así que no se enseña.
  const volumenFunciona = (() => { try { const a = document.createElement('audio'); a.volume = 0.5; return a.volume === 0.5; } catch { return false; } })();

  // ── El grupo ──────────────────────────────────────────────────────────────────────────────────

  function leerGuardado() {
    try { return JSON.parse(sessionStorage.getItem(CLAVE_GRUPO)); } catch { return null; }
  }
  function guardar(g) {
    try { sessionStorage.setItem(CLAVE_GRUPO, JSON.stringify(g ? { id: g.id, token: g.token } : null)); } catch {}
  }

  async function crearGrupo(reanudar) {
    if (grupo || preparando) return;
    preparando = true;
    error = '';
    // El audio hay que crearlo dentro del toque; en iPhone no arranca después de un await.
    mezcla = crearMezcla();
    mezcla.ac.resume().catch(() => {});
    buscarCodecHardware();
    pintarPanel();
    try {
      if (!vivo(real.video)) adoptarExistente();
      await asegurarReal(null);
      ligero = esMovil();
      await subirResolucion();
      vistoDesconocido = false;
      crearSalida();
      mezcla.fuente('yo', real.audio);
      reloj = crearReloj(fpsGrupo(), pintar);
      const guardado = reanudar ? leerGuardado() : null;
      grupo = {
        id: guardado ? guardado.id : 'sqm' + SquadSenal.aleatorio(10),
        token: guardado ? guardado.token : SquadSenal.aleatorio(16),
        estado: 'conectando',
        intentosId: 0,
      };
      guardar(grupo);
      grupo.ice = SQUAD_ICE;
      actualizarIce(grupo);
      const enVuelo = convertirSitio(true);
      vigilarDesconocido();
      if (desconocido.video && !enVuelo) aviso = t.yaHablabas;
      abrirCartero();
    } catch (e) {
      error = e && e.name === 'NotAllowedError' ? t.sinPermiso : t.sinCamara;
      deshacerSalida();
      grupo = null;
    } finally {
      preparando = false;
      pintarPanel();
    }
  }

  // Ome.tv puede haber pedido la cámara a poca resolución. Para el grupo la queremos en HD: tu celda
  // es la más grande cuando estáis dos o tres.
  async function subirResolucion() {
    const v = real.video;
    if (!vivo(v) || !v.applyConstraints) return;
    const a = v.getSettings();
    const lado = ligero ? 960 : 1280;
    if (Math.max(a.width || 0, a.height || 0) >= lado) return;
    try { await v.applyConstraints({ width: { ideal: lado }, height: { ideal: ligero ? 540 : 720 }, frameRate: { ideal: fpsGrupo(), max: 30 } }); } catch {}
  }

  // Si el navegador corta tu cámara o tu micro (en el iPhone, al salir a otra app), se vuelven a pedir
  // al volver: si no, el grupo seguiría con tu silueta o sin tu voz. Como mucho una vez cada 5 s, por
  // si el permiso está denegado.
  let ultimaRecuperacion = 0;
  function recuperarReal() {
    if (!grupo || preparando || document.visibilityState !== 'visible' || Date.now() - ultimaRecuperacion < 5000) return;
    const pedir = {};
    for (const tipo of ['video', 'audio']) if (real[tipo] && !vivo(real[tipo])) pedir[tipo] = true;
    if (!pedir.video && !pedir.audio) return;
    ultimaRecuperacion = Date.now();
    asegurarReal(pedir).catch(() => {});
  }
  document.addEventListener('visibilitychange', recuperarReal);

  function deshacerSalida() {
    if (reloj) reloj.parar();
    reloj = null;
    if (salida) {
      salida.video.stop();
      salida.lienzo.remove();
      salida.videoYo.remove();
    }
    salida = null;
    if (mezcla) mezcla.cerrar();
    mezcla = null;
  }

  // motivo: 'cerrado' (lo has terminado tú) o 'agotado' (se acabó el tiempo gratis); se lo cuenta a los amigos.
  function terminarGrupo(motivo = 'cerrado') {
    if (!grupo) return;
    for (const inv of [...invitados.values()]) quitarInvitado(inv, motivo);
    votos.clear();
    if (grupo.cartero) grupo.cartero.cerrar();
    convertirSitio(false);
    deshacerSalida();
    grupo = null;
    aviso = '';
    guardar(null);
    // Si ome.tv no estaba usando la cámara (el grupo se creó antes de pulsar Iniciar), la apagamos.
    for (const tipo of ['video', 'audio']) {
      if (real[tipo] && !sitioUsa(real[tipo])) { real[tipo].stop(); real[tipo] = null; }
    }
    pintarPanel();
  }

  function abrirCartero() {
    const g = grupo;
    g.cartero = new SquadSenal.Cartero({
      sala: g.id,
      id: g.id,
      token: g.token,
      alMensaje: mensajeServidor,
      alEstado: (estado) => {
        if (grupo !== g) return;
        g.estado = estado;
        // El id lo tiene otra pestaña o el servidor aún no ha soltado el de antes: esperamos un poco
        // y, si sigue ocupado, estrenamos otro enlace.
        if (estado === 'id-ocupado') {
          g.cartero.cerrar();
          if (++g.intentosId > 3) {
            g.id = 'sqm' + SquadSenal.aleatorio(10);
            g.token = SquadSenal.aleatorio(16);
            g.intentosId = 0;
            guardar(g);
          }
          setTimeout(() => { if (grupo === g) abrirCartero(); }, 3000);
        }
        pintarPanel();
      },
    });
  }

  // Las credenciales TURN se piden antes de que llegue nadie: cuando llega una oferta hay que crear
  // la conexión al momento o se pierden los primeros candidatos.
  async function actualizarIce(g) {
    const lista = await SquadSenal.servidoresIce();
    if (grupo === g) g.ice = lista;
  }

  function avisarFallo(inv) {
    const nombre = inv.nombre || t.tuAmigo;
    const texto = SquadSenal.hayTurn(grupo ? grupo.ice : []) ? t.falloConTurn(nombre) : t.falloSinTurn(nombre);
    aviso = texto;
    setTimeout(() => { if (aviso === texto) { aviso = ''; pintarPanel(); } }, 30000);
  }

  function mensajeServidor(m) {
    const p = m.payload || {};
    if (m.type === 'OFFER') recibirOferta(m.src, p, m.via);
    else if (m.type === 'CANDIDATE') {
      const inv = invitados.get(m.src);
      if (inv && inv.cid === p.connectionId && p.candidate) inv.enlace.candidato(p.candidate);
    }
  }

  const limpiarNombre = (n) => (typeof n === 'string' ? n.replace(/\s+/g, ' ').trim().slice(0, 20) : '');

  // via: por qué servidor ha llegado (el nuestro o el de reserva); se le contesta siempre por ahí.
  async function recibirOferta(src, p, via) {
    const meta = p.metadata || {};
    if (!grupo || meta.app !== 'squadmeet' || !p.sdp || !p.connectionId) return;
    const previo = invitados.get(src);
    if (previo) {
      // Si vuelve a llamar sin haber llegado a conectar, el intento anterior ha fallado.
      if (previo.estado === 'conectando') avisarFallo(previo);
      quitarInvitado(previo, null);
    }
    if (invitados.size >= maxInvitados() || sinTiempo()) {
      grupo.cartero.enviar('ANSWER', src, SquadSenal.paquete.sdp({ type: 'answer', sdp: p.sdp.sdp }, p.connectionId, { rechazo: sinTiempo() ? 'agotado' : 'lleno' }), via);
      return;
    }
    const inv = {
      id: src,
      cid: p.connectionId,
      via,
      nombre: limpiarNombre(meta.nombre),
      orient: meta.orientacion === 'h' ? 'h' : 'v',
      t: textosDe(meta.idioma),
      espejo: !!meta.espejo,
      calma: !!meta.calma,
      regulador: { escala: INICIO, bien: 0, mal: 0, necesarias: 5, cambio: 0, subio: false },
      camara: true,
      silenciado: false,
      estado: 'conectando',
      video: null,
      audio: null,
    };
    inv.enlace = new SquadSenal.Enlace(PCPropia, (c) => {
      if (grupo) grupo.cartero.enviar('CANDIDATE', src, SquadSenal.paquete.candidato(c, inv.cid), inv.via);
    }, grupo.ice);
    actualizarIce(grupo);
    const pc = inv.enlace.pc;
    inv.control = pc.createDataChannel('control', { negotiated: true, id: 0 });
    inv.control.onmessage = (e) => mensajeInvitado(inv, e.data);
    inv.control.onopen = () => {
      enviarA(inv, { tipo: 'desconocido', presente: !!desconocido.video });
      enviarA(inv, { tipo: 'plan', pro: plan.pro });
      avisarCalidad();
    };
    inv.control.onclose = () => quitarInvitado(inv, null);
    const envio = new MediaStream([visorPara(inv), mezcla.destino('inv:' + src)]);
    for (const t of envio.getTracks()) pc.addTrack(t, envio);
    pc.ontrack = (e) => recibirPista(inv, e.track);
    pc.onconnectionstatechange = () => estadoInvitado(inv);
    inv.plazo = setTimeout(() => {
      if (inv.estado !== 'conectando') return;
      avisarFallo(inv);
      quitarInvitado(inv, null);
    }, 20000);
    invitados.set(src, inv);
    pintarPanel();
    try {
      await inv.enlace.ponerRemota(p.sdp);
      preferirCodec(pc);
      await pc.setLocalDescription(await pc.createAnswer());
      grupo.cartero.enviar('ANSWER', src, SquadSenal.paquete.sdp(pc.localDescription, inv.cid, { ok: 1, ligero: ligero ? 1 : 0 }), inv.via);
    } catch {
      quitarInvitado(inv, null);
    }
  }

  // Codificar tres vídeos a la vez por software (VP8) se come la CPU y la calidad se hunde. Si el
  // dispositivo codifica algún códec por hardware (H.264 en iPhone/Mac, a menudo VP9 o H.264 en PC),
  // lo ponemos primero: en la respuesta manda nuestro orden.
  let codecHardware = null;
  async function buscarCodecHardware() {
    if (/Apple/.test(navigator.vendor || '')) return (codecHardware = 'video/h264');
    if (!navigator.mediaCapabilities || !navigator.mediaCapabilities.encodingInfo) return;
    for (const tipo of ['video/H264', 'video/VP9']) {
      try {
        const i = await navigator.mediaCapabilities.encodingInfo({ type: 'webrtc', video: { contentType: tipo, width: 1280, height: 720, bitrate: KBPS_VISOR * 1000, framerate: FPS_VISOR } });
        if (i.supported && i.powerEfficient) return (codecHardware = tipo.toLowerCase());
      } catch {}
    }
  }

  function preferirCodec(pc) {
    if (!codecHardware || !window.RTCRtpReceiver || !RTCRtpReceiver.getCapabilities) return;
    const codecs = (RTCRtpReceiver.getCapabilities('video') || {}).codecs || [];
    const primero = codecs.filter((c) => c.mimeType.toLowerCase() === codecHardware);
    if (!primero.length) return;
    const orden = [...primero, ...codecs.filter((c) => c.mimeType.toLowerCase() !== codecHardware)];
    for (const t of pc.getTransceivers()) {
      if (t.receiver.track && t.receiver.track.kind === 'video' && t.setCodecPreferences) {
        try { t.setCodecPreferences(orden); } catch {}
      }
    }
  }

  // Regulador: cada 2 s mira a cuántos fps le sale el vídeo a cada amigo. Si va sobrado 10 s sube un
  // escalón, y si dos veces seguidas no llega (o el procesador no da abasto), baja uno. Todos empiezan
  // en 960×540: en el ordenador se puede subir a 1280×720 y, si no da abasto, bajar a 640×360. Al
  // navegador se le pide que mantenga los fps y baje antes la nitidez: un vídeo a saltos es lo que se
  // nota como lag. Solo en el escalón más bajo puede ceder también fps; si no, un ordenador justo de
  // potencia se satura codificando y se le traba hasta Ome.tv al anfitrión.
  //
  // Modo móvil: con el anfitrión en el móvil todo cuesta más. La subida (datos móviles o el wifi del
  // móvil) no aguanta tres vídeos de 2,5 Mbps, y la CPU y la batería tampoco. A cada amigo se le envía
  // entre 960×540 y 640×360, a 20 fps y la mitad de bitrate, y se les pide que manden su cámara más
  // ligera (el móvil tiene que descodificar tres a la vez).
  const ESCALAS = [1, 0.75, 0.5];
  const INICIO = 1;
  // 1280×720 para tus amigos (HD) es de Pro, y solo en el ordenador.
  const techo = () => (ligero || !plan.pro ? 1 : 0);
  const suelo = () => 2;
  const fpsGrupo = () => (ligero ? 20 : FPS);
  const kbpsVisor = (escala) => (ligero ? [0, 1100, 700] : [KBPS_VISOR, 1600, 800])[escala];
  const degradacion = (escala) => (escala === suelo() ? 'balanced' : 'maintain-framerate');
  const limitarVisor = (sender, escala) => SquadSenal.limitarVideo(sender, kbpsVisor(escala), ligero ? fpsGrupo() : FPS_VISOR, degradacion(escala), ESCALAS[techo()] / ESCALAS[escala]);
  async function regular() {
    for (const inv of invitados.values()) {
      if (inv.estado !== 'conectado' || !inv.visor || Date.now() - inv.conectadoEn < 10000) continue;
      const sender = inv.enlace.pc.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (!sender) continue;
      // Safari no siempre da framesPerSecond ni qualityLimitationReason: los fps se sacan de los
      // fotogramas enviados y, sin motivo de límite, se da por libre.
      let envio = null;
      (await sender.getStats()).forEach((s) => { if (s.type === 'outbound-rtp') envio = s; });
      if (!envio) continue;
      const r = inv.regulador;
      const ahora = Date.now();
      let fps = envio.framesPerSecond;
      if (typeof fps !== 'number') {
        const enviados = envio.framesSent || envio.framesEncoded || 0;
        fps = r.enviados != null ? ((enviados - r.enviados) * 1000) / Math.max(1, ahora - r.medido) : null;
        r.enviados = enviados;
        r.medido = ahora;
        if (fps === null) continue;
      }
      const limite = envio.qualityLimitationReason || 'none';
      const antes = r.escala;
      if (fps < (ligero ? 12 : 14) || limite === 'cpu') {
        r.bien = 0;
        if (++r.mal >= 2 && ahora - r.cambio > 4000 && r.escala < suelo()) {
          // Si acabamos de subir y no ha aguantado, la próxima subida espera el doble.
          if (r.subio && ahora - r.cambio < 12000) r.necesarias = Math.min(30, r.necesarias * 2);
          r.escala++;
          r.subio = false;
        }
      } else {
        r.mal = 0;
        if (fps >= (ligero ? 18 : 20) && limite === 'none') {
          if (++r.bien >= r.necesarias && r.escala > techo()) {
            r.escala--;
            r.subio = true;
          }
        } else {
          r.bien = 0;
        }
      }
      if (r.escala !== antes) {
        r.cambio = ahora;
        r.bien = r.mal = 0;
        limitarVisor(sender, r.escala);
      }
    }
  }
  setInterval(() => { if (grupo) regular().catch(() => {}); }, 2000);

  function recibirPista(inv, pista) {
    nuestras.add(pista);
    if (pista.kind === 'video') {
      inv.video = inv.video || elemento('video');
      ponerFuente(inv.video, pista);
    } else {
      // Lo oyes por un <audio> normal para que el navegador cancele el eco de tus altavoces.
      inv.audio = inv.audio || elemento('audio', false);
      inv.audio.srcObject = new MediaStream([pista]);
      inv.audio.volume = volumenAmigos;
      inv.audio.muted = inv.silenciado;
      inv.audio.play().catch(() => {});
      mezcla.fuente('inv:' + inv.id, pista);
      mezcla.volumen('inv:' + inv.id, inv.silenciado ? 0 : 1);
    }
    pintarPanel();
  }

  function estadoInvitado(inv) {
    const estado = inv.enlace.pc.connectionState;
    if (estado === 'connected') {
      if (inv.estado === 'conectando') {
        inv.conectadoEn = Date.now();
        anunciar(t.seUne(nombreDe(inv)));
      }
      inv.estado = 'conectado';
      clearTimeout(inv.corte);
      const sender = inv.enlace.pc.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (sender) limitarVisor(sender, inv.regulador.escala);
    } else if (estado === 'disconnected') {
      inv.estado = 'reconectando';
      clearTimeout(inv.corte);
      inv.corte = setTimeout(() => quitarInvitado(inv, null), 10000);
    } else if (estado === 'failed' || estado === 'closed') {
      if (estado === 'failed' && inv.estado === 'conectando') avisarFallo(inv);
      quitarInvitado(inv, null);
      return;
    }
    pintarPanel();
  }

  // Lo que manda la cámara de cada amigo. Con el anfitrión en el móvil, ligera (tiene que descodificar a
  // todos). En el ordenador, con un solo amigo su celda es la mitad de la imagen y va en HD; con dos o
  // tres, su celda es un cuarto y con 960×540 basta: menos que descodificar y menos subida para él.
  function avisarCalidad() {
    const nivel = ligero ? 'ligera' : invitados.size >= 2 ? 'media' : 'alta';
    for (const inv of invitados.values()) {
      if (inv.calidad === nivel || !inv.control || inv.control.readyState !== 'open') continue;
      inv.calidad = nivel;
      enviarA(inv, { tipo: 'calidad', nivel });
    }
  }

  function enviarA(inv, msg) {
    try { if (inv.control && inv.control.readyState === 'open') inv.control.send(JSON.stringify(msg)); } catch {}
  }

  function mensajeInvitado(inv, datos) {
    let m;
    try { m = JSON.parse(datos); } catch { return; }
    if (m.tipo === 'chat' && typeof m.texto === 'string') return recibirChat(inv, m.texto);
    if (m.tipo === 'voto') return votar(inv, !!m.si);
    if (m.tipo === 'camara') inv.camara = !!m.activa;
    else if (m.tipo === 'adios') quitarInvitado(inv, null);
    else if (m.tipo === 'espejo') inv.espejo = !!m.activo;
    else if (m.tipo === 'orientacion' && (m.valor === 'v' || m.valor === 'h') && m.valor !== inv.orient) {
      inv.orient = m.valor;
      cambiarVisor(inv);
    }
    pintarPanel();
  }

  // motivo: 'expulsado' | 'cerrado' se le cuenta al amigo; null si se ha ido él.
  function quitarInvitado(inv, motivo) {
    if (invitados.get(inv.id) !== inv) return;
    const nombre = nombreDe(inv), estaba = inv.estado !== 'conectando';
    invitados.delete(inv.id);
    votos.delete(inv.id);
    if (estaba && motivo !== 'cerrado' && motivo !== 'agotado') anunciar(motivo === 'expulsado' ? t.sacado(nombre) : t.sale(nombre));
    if (motivo) enviarA(inv, { tipo: motivo });
    clearTimeout(inv.corte);
    clearTimeout(inv.plazo);
    inv.control.onclose = null;
    setTimeout(() => inv.enlace.cerrar(), motivo ? 400 : 0);
    if (inv.video) inv.video.remove();
    if (inv.audio) { inv.audio.srcObject = null; inv.audio.remove(); }
    soltarVisor(inv);
    avisarCalidad();
    if (grupo) avisarVotos();
    if (mezcla) {
      mezcla.fuente('inv:' + inv.id, null);
      mezcla.quitarDestino('inv:' + inv.id);
    }
    pintarPanel();
  }

  let volumenAmigos = 1;
  function cambiarVolumen(v) {
    volumenAmigos = v;
    for (const inv of invitados.values()) if (inv.audio) inv.audio.volume = v;
  }

  function silenciar(inv) {
    inv.silenciado = !inv.silenciado;
    if (inv.audio) inv.audio.muted = inv.silenciado;
    if (mezcla) mezcla.volumen('inv:' + inv.id, inv.silenciado ? 0 : 1);
    pintarPanel();
  }

  setInterval(() => { if (grupo) { vigilarDesconocido(); recuperarReal(); if (document.visibilityState === 'visible') reanudarAudio(); } }, 700);

  // ── Gratis y Pro ──────────────────────────────────────────────────────────────────────────────
  // Cada día hay 10 minutos gratis con amigos conectados, y 30 más al compartir SquadMeet por
  // WhatsApp. Los cuenta nuestro servidor (senal/api.js) con un identificador al azar de este
  // navegador; si no se le puede llamar (algunas operadoras bloquean Cloudflare durante el fútbol),
  // se sigue contando aquí. Con Pro (una clave de Payhip) no hay límite.
  const CLAVE_DISPOSITIVO = 'squadmeet:dispositivo', CLAVE_LICENCIA = 'squadmeet:licencia', CLAVE_USO = 'squadmeet:uso', CLAVE_CORREO = 'squadmeet:correo';
  const GRATIS = 600, EXTRA = 1800;
  // El día cambia a medianoche, hora de España, igual que en el servidor.
  const DIA = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' });
  const hoy = () => DIA.format(new Date());
  let plan = { pro: false, plan: null, dia: hoy(), restantes: GRATIS, limite: GRATIS, extra: false, cada: 60, error: '' };
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE_USO));
    if (g) {
      plan.pro = !!g.pro;
      plan.plan = g.plan || null;
      if (g.dia === hoy()) Object.assign(plan, { restantes: g.restantes, limite: g.limite, extra: !!g.extra });
    }
  } catch {}
  let gasto = 0;                // segundos contados aquí que el servidor aún no sabe
  let contando = false, ultimoLatido = 0, latiendo = false, avisadoMinuto = false;
  let agotado = false, cortarAlSiguiente = false;
  let vista = '';               // '' normal, 'clave' escribiendo la clave, 'muro' (sin tiempo) o 'esperando' (pagando)
  let mensajeClave = '', comprobando = false;
  let esperandoDesde = 0;       // cuándo se abrió Payhip para pagar con el correo
  const ESPERA = 30 * 60 * 1000;
  const chat = [];              // últimos mensajes del chat del grupo (Pro)
  const votos = new Set();      // amigos que quieren pasar al siguiente (Pro)
  const maxInvitados = () => (plan.pro ? MAX_PRO : MAX_GRATIS);
  const restantes = () => (plan.pro ? Infinity : Math.max(0, plan.restantes - gasto));
  const sinTiempo = () => !plan.pro && restantes() <= 0;
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  function dispositivo() {
    let d = '';
    try { d = localStorage.getItem(CLAVE_DISPOSITIVO) || ''; } catch {}
    if (!/^[a-z0-9]{16,40}$/.test(d)) {
      d = SquadSenal.aleatorio(24);
      try { localStorage.setItem(CLAVE_DISPOSITIVO, d); } catch {}
    }
    return d;
  }
  const licencia = () => { try { return localStorage.getItem(CLAVE_LICENCIA) || ''; } catch { return ''; } };
  const correoGuardado = () => { try { return localStorage.getItem(CLAVE_CORREO) || ''; } catch { return ''; } };
  function guardarPlan() {
    try { localStorage.setItem(CLAVE_USO, JSON.stringify({ pro: plan.pro, plan: plan.plan, dia: plan.dia, restantes: plan.restantes - gasto, limite: plan.limite, extra: plan.extra })); } catch {}
  }

  async function llamarApi(ruta, extra = {}) {
    const cuerpo = { dispositivo: dispositivo(), clave: licencia(), correo: correoGuardado(), ...extra };
    if (!cuerpo.clave) delete cuerpo.clave;
    if (!cuerpo.correo) delete cuerpo.correo;
    // text/plain para que el navegador no tenga que preguntar antes (CORS sin petición previa).
    const r = await fetch(API + ruta, { method: 'POST', body: JSON.stringify(cuerpo), credentials: 'omit', headers: { 'content-type': 'text/plain' } });
    const d = await r.json().catch(() => ({}));
    if (typeof d.restantes !== 'number') throw new Error(d.error || 'red');
    return d;
  }
  // enviados: los segundos de este latido, que el servidor ya ha sumado.
  function aplicar(d, enviados = 0) {
    const eraPro = plan.pro;
    gasto = Math.max(0, gasto - enviados);
    Object.assign(plan, { pro: !!d.pro, plan: d.plan || null, dia: d.dia || hoy(), restantes: d.restantes, limite: d.limite, extra: !!d.extra, cada: d.cada || 60, error: d.error || '' });
    if (restantes() > 60) avisadoMinuto = false;
    if (!sinTiempo()) {
      agotado = false;
      cortarAlSiguiente = false;
      if (vista === 'muro') vista = '';
    }
    guardarPlan();
    if (plan.pro && vista === 'esperando') { vista = 'bienvenida'; anunciar(t.yaPro); }
    if (eraPro !== plan.pro) cambioDePlan();
  }
  async function cargarPlan() {
    try {
      let d = await llamarApi('estado');
      // La clave vale pero este dispositivo ya no figura (se olvida tras 30 días sin usarla): se añade otra vez.
      if (licencia() && d.error === 'otro') d = await llamarApi('licencia');
      if (licencia() && d.error === 'invalida') { try { localStorage.removeItem(CLAVE_LICENCIA); } catch {} }
      aplicar(d);
    } catch {}
    pintarPanel();
  }
  async function latido() {
    if (latiendo) return;
    latiendo = true;
    ultimoLatido = Date.now();
    const enviados = gasto;
    try { aplicar(await llamarApi('latido', { segundos: Math.round(enviados) }), enviados); } catch { guardarPlan(); }
    latiendo = false;
  }

  // Cada segundo: se cuenta solo con algún amigo conectado. Al quedar un minuto se avisa a todos, y al
  // llegar a cero se deja acabar la conversación con el desconocido de ahora.
  let ultimoTic = Date.now();
  setInterval(() => {
    const ahora = Date.now(), dt = Math.min(5, (ahora - ultimoTic) / 1000);
    ultimoTic = ahora;
    if (plan.dia !== hoy()) {
      Object.assign(plan, { dia: hoy(), restantes: GRATIS, limite: GRATIS, extra: false });
      gasto = 0;
      agotado = cortarAlSiguiente = false;
      if (vista === 'muro') vista = '';
      cargarPlan();
    }
    const conectados = [...invitados.values()].filter((i) => i.estado === 'conectado').length;
    const debe = !!grupo && !plan.pro && conectados > 0;
    if (debe) gasto += dt;
    if (debe !== contando) {
      contando = debe;
      if (debe) ultimoLatido = ahora;
      else if (gasto > 0) latido();
    }
    if (contando && ahora - ultimoLatido >= plan.cada * 1000) latido();
    if (grupo && !plan.pro) {
      const quedan = restantes();
      if (contando && quedan > 0 && quedan <= 60 && !avisadoMinuto) {
        avisadoMinuto = true;
        aviso = t.ultimoMinuto;
        for (const inv of invitados.values()) enviarA(inv, { tipo: 'aviso', que: 'minuto' });
        pintarPanel();
      }
      if (quedan <= 0 && !agotado) {
        agotado = true;
        latido();
        if (desconocido.video) {
          cortarAlSiguiente = true;
          aviso = t.acabaConversacion;
          pintarPanel();
        } else pausarPorTiempo();
      }
    }
    actualizarReloj();
  }, 1000);

  function pausarPorTiempo() {
    cortarAlSiguiente = false;
    if (grupo) terminarGrupo('agotado');
    vista = 'muro';
    plegado = false;
    pintarPanel();
  }

  // Con Pro o sin él cambian el máximo de amigos, el HD y el chat: se les avisa y se ajusta el envío.
  function cambioDePlan() {
    for (const inv of invitados.values()) {
      enviarA(inv, { tipo: 'plan', pro: plan.pro });
      inv.regulador.escala = Math.max(inv.regulador.escala, techo());
      const sender = inv.enlace.pc.getSenders().find((x) => x.track && x.track.kind === 'video');
      if (sender && inv.estado === 'conectado') limitarVisor(sender, inv.regulador.escala);
    }
    pintarPanel();
  }

  // El reloj se actualiza sin repintar el panel (que quitaría el foco a lo que estés escribiendo).
  function actualizarReloj() {
    if (!raiz) return;
    const caja = raiz.querySelector('.tiempo');
    if (caja) {
      const quedan = restantes();
      caja.querySelector('.reloj').textContent = mmss(quedan);
      caja.querySelector('.barra i').style.width = `${Math.min(100, (quedan / plan.limite) * 100)}%`;
      caja.classList.toggle('poco', quedan <= 60);
    }
    const pastilla = raiz.querySelector('.pastilla span');
    if (pastilla && contando && !anuncio) pastilla.textContent = mmss(restantes());
  }

  async function compartirWhatsapp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(t.mensajeWhatsapp)}`, '_blank', 'noopener');
    try { aplicar(await llamarApi('compartir')); } catch {
      if (!plan.extra) {
        Object.assign(plan, { extra: true, restantes: plan.restantes + EXTRA, limite: plan.limite + EXTRA });
        guardarPlan();
        aplicar({ ...plan });
      }
    }
    pintarPanel();
  }

  async function activarClave(valor) {
    const clave = valor.replace(/\s+/g, '');
    if (!clave) return;
    comprobando = true;
    mensajeClave = '';
    pintarPanel();
    try {
      const d = await llamarApi('licencia', { clave });
      if (d.pro) {
        try { localStorage.setItem(CLAVE_LICENCIA, clave); } catch {}
        vista = '';
        aplicar(d);
        anunciar(t.proActivo(d.plan));
      } else mensajeClave = t.errores[d.error] || t.errores.invalida;
    } catch (e) {
      mensajeClave = t.errores[e.message] || t.errores.red;
    }
    comprobando = false;
    pintarPanel();
  }
  // Pro sin claves: se apunta este navegador con el correo y se abre Payhip. Cuando Payhip avisa del pago
  // a nuestro servidor, este navegador pasa a Pro; mientras, se pregunta cada 5 segundos.
  function pagar(cual) {
    const correo = ((raiz.querySelector('[data-conservar="correo"]') || {}).value || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) { mensajeClave = t.errores.correo; pintarPanel(); return; }
    // Se abre ya (dentro del clic), o el navegador bloquearía la ventana.
    window.open(TIENDA[cual], '_blank', 'noopener');
    try { localStorage.setItem(CLAVE_CORREO, correo); } catch {}
    mensajeClave = '';
    vista = 'esperando';
    esperandoDesde = Date.now();
    pintarPanel();
    llamarApi('comprar', { correo }).then(aplicar).catch(() => {});
  }
  setInterval(() => {
    if (vista !== 'esperando') return;
    if (Date.now() - esperandoDesde > ESPERA) { vista = 'muro'; pintarPanel(); return; }
    cargarPlan();
  }, 5000);
  async function soltarClave() {
    try { await llamarApi('soltar'); } catch {}
    try { localStorage.removeItem(CLAVE_LICENCIA); localStorage.removeItem(CLAVE_CORREO); } catch {}
    Object.assign(plan, { pro: false, plan: null });
    guardarPlan();
    cambioDePlan();
    cargarPlan();
  }

  // Chat del grupo (Pro): pasa por el anfitrión, que lo reparte. Como mucho 5 mensajes cada 5 s por amigo.
  const ritmoChat = new Map();
  function recibirChat(inv, texto) {
    if (!plan.pro) return;
    const limpio = texto.replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!limpio) return;
    const ahora = Date.now();
    const recientes = (ritmoChat.get(inv.id) || []).filter((x) => ahora - x < 5000);
    if (recientes.length >= 5) return;
    recientes.push(ahora);
    ritmoChat.set(inv.id, recientes);
    difundirChat(inv, limpio);
    if (plegado) anunciar(`${nombreDe(inv)}: ${limpio}`);
  }
  // quien: el amigo que escribe, o null si eres tú.
  function difundirChat(quien, texto) {
    chat.push({ quien, nombre: quien ? nombreDe(quien) : t.tu, texto });
    if (chat.length > 30) chat.shift();
    for (const inv of invitados.values()) {
      enviarA(inv, { tipo: 'chat', de: inv === quien ? null : quien ? nombreDe(quien, inv.t) : inv.t.anfitrion, texto });
    }
    pintarPanel();
  }
  function votar(inv, si) {
    if (!plan.pro) return;
    if (si) votos.add(inv.id);
    else votos.delete(inv.id);
    avisarVotos();
  }
  function avisarVotos() {
    const total = [...invitados.values()].filter((i) => i.estado === 'conectado').length;
    for (const inv of invitados.values()) enviarA(inv, { tipo: 'votos', n: votos.size, total, mio: votos.has(inv.id) });
    pintarPanel();
  }

  // ── Panel ─────────────────────────────────────────────────────────────────────────────────────

  const ICONOS = {
    marca: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#141210"/><rect x="6.5" y="6.5" width="8.5" height="8.5" rx="2.4" fill="#ffd43b"/><rect x="17" y="6.5" width="8.5" height="8.5" rx="2.4" fill="#ff6b57"/><rect x="6.5" y="17" width="8.5" height="8.5" rx="2.4" fill="#5b8cff"/><rect x="17" y="17" width="8.5" height="8.5" rx="2.4" fill="#2fd38a"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 19.5 5.6 16A8 8 0 1 1 8.4 18.6z"/><path d="M9.2 9.3c.3 2.4 2.6 4.8 5.3 5.3l1-1.3-1.8-1-.9.7c-.9-.4-1.8-1.3-2.2-2.2l.7-.9-1-1.8z"/></svg>',
    enviar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 4 3.5 11l6.5 2.5L12.5 20z"/><path d="m10 13.5 4-4"/></svg>',
    menos: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12" /></svg>',
    copiar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15"/></svg>',
    compartir: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4m0 0L8 8m4-4 4 4"/><path d="M6 12v6.5A1.5 1.5 0 0 0 7.5 20h9a1.5 1.5 0 0 0 1.5-1.5V12"/></svg>',
    hecho: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>',
    micNo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 10V6a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 4.6 2.5M5.5 11a6.5 6.5 0 0 0 10.4 5.2M18.5 11a6.4 6.4 0 0 1-.6 2.7M12 17.5V21M4 4l16 16"/></svg>',
    cerrar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>',
    espejo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v2.5M12 9v2.5M12 15v2.5M12 21v-.5"/><path d="M9 7.5 3.5 17H9zM15 7.5l5.5 9.5H15z"/></svg>',
    volumen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h3.5L12 18V6L7.5 10H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  };

  const CSS = `:host { all: initial; }
* { box-sizing: border-box; }
.raiz {
  --papel: #fff6e5; --blanco: #ffffff; --tinta: #141210; --tinta-2: #3b3833; --tinta-3: #6b665e;
  --amarillo: #ffd43b; --coral: #ff6b57; --azul: #5b8cff; --verde: #2fd38a;
  position: fixed; top: 16px; right: auto; z-index: 2147483000;
  font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--tinta); -webkit-font-smoothing: antialiased; text-align: left;
}
.raiz.movil {
  left: 0; right: 0; top: auto; bottom: calc(12px * var(--k, 1));
  display: flex; justify-content: center; pointer-events: none;
}
/* La pastilla y la tarjeta llevan zoom: sus propias medidas ya salen multiplicadas por --k. */
.raiz.movil .pastilla { position: fixed; top: 12px; right: 12px; }
/* Mientras Ome.tv pide iniciar sesión, sus botones están abajo: el panel sube para no taparlos. */
.raiz.movil.arriba { top: calc(12px * var(--k, 1)); bottom: auto; }
.tarjeta, .pastilla { zoom: var(--k, 1); pointer-events: auto; }
.tarjeta {
  width: 312px; max-height: calc(100vh / var(--k, 1) - 32px); overflow: auto;
  background: var(--papel); border: 3px solid var(--tinta); border-radius: 16px;
  box-shadow: 5px 5px 0 var(--tinta);
}
.cabeza {
  display: flex; align-items: center; gap: 10px; padding: 10px 8px 10px 12px; border-bottom: 3px solid var(--tinta);
  cursor: grab; user-select: none; -webkit-user-select: none; touch-action: none; background: var(--blanco);
}
.raiz.movil .cabeza { cursor: default; }
.marca svg, .pastilla svg { width: 26px; height: 26px; display: block; }
.titulo { flex: 1; font-weight: 900; font-size: 16px; letter-spacing: -.02em; }
.contador, .insignia {
  font-size: 12px; font-weight: 800; padding: 2px 8px; border-radius: 8px; border: 2px solid var(--tinta);
  font-variant-numeric: tabular-nums; background: var(--amarillo);
}
.insignia { background: var(--verde); letter-spacing: .04em; }
.cuerpo { padding: 14px; display: flex; flex-direction: column; gap: 12px; }
.texto { margin: 0; color: var(--tinta-2); font-size: 14px; }
.nota { margin: -2px 0 0; color: var(--tinta-3); font-size: 12.5px; }
.error, .aviso, .exito { margin: 0; font-size: 13px; font-weight: 600; border-radius: 10px; padding: 9px 11px; border: 2px solid var(--tinta); }
.error { background: var(--coral); }
.aviso { background: var(--amarillo); }
.exito { background: var(--verde); }

button { font: inherit; color: inherit; -webkit-tap-highlight-color: transparent; }
a.boton { text-decoration: none; color: var(--tinta); }
.boton {
  appearance: none; border: 3px solid var(--tinta); border-radius: 11px; padding: 0 14px; height: 44px;
  font-weight: 800; font-size: 14.5px; cursor: pointer; background: var(--blanco); color: var(--tinta);
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  box-shadow: 3px 3px 0 var(--tinta); transition: transform .12s, box-shadow .12s;
}
.boton:hover:not(:disabled) { transform: translate(-1px, -1px); box-shadow: 4px 4px 0 var(--tinta); }
.boton:active:not(:disabled) { transform: translate(3px, 3px); box-shadow: 0 0 0 var(--tinta); }
.boton:disabled { opacity: .6; cursor: progress; }
.primario { background: var(--amarillo); }
.oscuro { background: var(--tinta); color: var(--papel); box-shadow: 3px 3px 0 var(--coral); }
a.boton.oscuro { color: var(--papel); }
.whatsapp { background: var(--verde); }
.secundario { background: var(--blanco); }
.peligro { background: var(--blanco); box-shadow: none; border-width: 2px; height: 40px; }
.peligro:hover:not(:disabled) { background: var(--coral); box-shadow: none; transform: none; }
.enlace-texto { height: 30px; margin-top: -4px; background: none; border: 0; box-shadow: none; text-decoration: underline; text-underline-offset: 3px; font-weight: 700; font-size: 13px; }
.enlace-texto:hover:not(:disabled) { transform: none; box-shadow: none; }
.cuadrado { width: 44px; height: 44px; padding: 0; flex: none; }
.boton svg, .icono-btn svg {
  width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2.2;
  stroke-linecap: round; stroke-linejoin: round;
}
.icono-btn {
  appearance: none; border: 2px solid transparent; background: transparent; cursor: pointer;
  width: 34px; height: 34px; border-radius: 9px; flex: none;
  display: grid; place-items: center; color: var(--tinta);
}
.icono-btn:hover { border-color: var(--tinta); background: var(--papel); }
.icono-btn.activo { background: var(--coral); border-color: var(--tinta); }

.bloque { display: flex; flex-direction: column; gap: 7px; }
.etiqueta {
  display: flex; align-items: center; gap: 8px;
  font-size: 11.5px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--tinta-3);
}
.conectando { text-transform: none; letter-spacing: 0; font-weight: 700; color: var(--tinta); }
.conectando::before {
  content: ""; display: inline-block; width: 7px; height: 7px; margin-right: 6px; border-radius: 50%;
  background: var(--coral); vertical-align: 0; animation: latido 1.2s ease-in-out infinite;
}
.fila-enlace, .fila-clave, .fila-chat { display: flex; gap: 6px; }
.campo {
  flex: 1; min-width: 0; height: 44px; padding: 0 10px; border-radius: 10px;
  background: var(--blanco); border: 2px solid var(--tinta); color: var(--tinta);
  font: 12.5px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; outline: none;
}
.campo.texto-libre { font: 14px/1 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
.campo:focus { box-shadow: 2px 2px 0 var(--azul); }

.personas { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.persona {
  display: flex; align-items: center; gap: 10px; min-height: 46px; padding: 6px 6px 6px 8px;
  border-radius: 11px; background: var(--blanco); border: 2px solid var(--tinta);
}
.persona.libre { background: transparent; border: 2px dashed var(--tinta-3); color: var(--tinta-3); }
.avatar {
  width: 30px; height: 30px; border-radius: 8px; flex: none; border: 2px solid var(--tinta);
  display: grid; place-items: center; color: var(--tinta); font-weight: 900; font-size: 12px;
}
.avatar.vacio { background: transparent; border-style: dashed; border-color: var(--tinta-3); }
.nombre { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: 700; }
.persona > .estado, .nombre .estado { font-size: 12px; font-weight: 500; color: var(--tinta-3); }
.persona > .estado { margin-right: 8px; }
.estado.pendiente { color: var(--tinta); font-weight: 700; }

.volumen { display: flex; align-items: center; gap: 10px; }
.volumen svg { width: 18px; height: 18px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.vol { flex: 1; accent-color: var(--tinta); }

/* Tiempo gratis */
.tiempo { display: flex; flex-direction: column; gap: 7px; padding: 10px 11px; border: 2px solid var(--tinta); border-radius: 11px; background: var(--blanco); }
.tiempo .fila { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-weight: 800; font-size: 13.5px; }
.tiempo .reloj { font-variant-numeric: tabular-nums; font-size: 15px; }
.tiempo .barra { height: 10px; border: 2px solid var(--tinta); border-radius: 99px; overflow: hidden; background: var(--papel); }
.tiempo .barra i { display: block; height: 100%; background: var(--verde); border-right: 2px solid var(--tinta); }
.tiempo.poco .barra i { background: var(--coral); }
.tiempo .mas { appearance: none; border: 0; background: none; padding: 0; text-align: left; cursor: pointer; font-weight: 700; font-size: 12.5px; text-decoration: underline; text-underline-offset: 3px; }

/* Se acabó el tiempo / Pro */
.muro { display: flex; flex-direction: column; gap: 10px; }
.muro h2 { margin: 0; font-size: 19px; line-height: 1.15; font-weight: 900; letter-spacing: -.02em; }
.planes-mini { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.planes-mini:has(> :only-child) { grid-template-columns: 1fr; }
.muro label.nota { margin-bottom: -4px; font-weight: 700; }
.cargando { width: 26px; height: 26px; border-radius: 50%; border: 3px solid currentColor; border-right-color: transparent; animation: girar .9s linear infinite; align-self: center; opacity: .7; }
@keyframes girar { to { transform: rotate(1turn); } }
.bienvenida { align-items: center; text-align: center; }
.bienvenida .ventajas { align-self: stretch; text-align: left; }
.sello { width: 64px; height: 64px; border-radius: 50%; background: var(--verde); border: 3px solid var(--tinta); box-shadow: 4px 4px 0 var(--tinta);
  display: grid; place-items: center; animation: sello .55s cubic-bezier(.34, 1.56, .64, 1) both; }
.sello svg { width: 34px; height: 34px; fill: none; stroke: var(--tinta); stroke-width: 3.2; stroke-linecap: round; stroke-linejoin: round;
  stroke-dasharray: 24; stroke-dashoffset: 24; animation: trazo .35s .3s ease-out forwards; }
.bienvenida h2, .bienvenida .texto, .bienvenida li, .bienvenida .boton, .bienvenida .nota { animation: subir .4s ease-out both; }
.bienvenida h2 { animation-delay: .15s; } .bienvenida .texto { animation-delay: .22s; }
.bienvenida li:nth-child(1) { animation-delay: .3s; } .bienvenida li:nth-child(2) { animation-delay: .36s; }
.bienvenida li:nth-child(3) { animation-delay: .42s; } .bienvenida li:nth-child(4) { animation-delay: .48s; }
.bienvenida .boton { animation-delay: .56s; } .bienvenida .nota { animation-delay: .62s; }
@keyframes sello { from { transform: scale(.3) rotate(-12deg); opacity: 0; } }
@keyframes trazo { to { stroke-dashoffset: 0; } }
@keyframes subir { from { opacity: 0; transform: translateY(6px); } }
@media (prefers-reduced-motion: reduce) { .cargando { animation-duration: 3s; } }
.plan-mini { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; height: auto; padding: 8px 6px; text-align: center; line-height: 1.15; }
.plan-mini b { font-size: 17px; font-weight: 900; }
.plan-mini small { font-size: 11.5px; font-weight: 700; }
.ventajas { margin: 0; padding: 0; list-style: none; display: grid; gap: 4px; font-size: 13px; color: var(--tinta-2); }
.ventajas li::before { content: "✓ "; font-weight: 900; color: var(--tinta); }

/* Chat del grupo (Pro) */
.chat { display: flex; flex-direction: column; gap: 6px; }
.mensajes { list-style: none; margin: 0; padding: 8px; display: flex; flex-direction: column; gap: 5px; max-height: 128px; overflow: auto; border: 2px solid var(--tinta); border-radius: 10px; background: var(--blanco); font-size: 13px; }
.mensajes:empty::before { content: attr(data-vacio); color: var(--tinta-3); }
.mensajes b { font-weight: 800; }
.votos { margin: 0; font-size: 13px; font-weight: 700; padding: 7px 10px; border-radius: 10px; border: 2px solid var(--tinta); background: var(--blanco); }
.votos.hay { background: var(--amarillo); }

.pastilla {
  appearance: none; border: 3px solid var(--tinta); cursor: pointer;
  display: inline-flex; align-items: center; gap: 8px; height: 44px; padding: 0 14px 0 7px;
  border-radius: 99px; background: var(--papel); color: var(--tinta); font-weight: 800;
  box-shadow: 3px 3px 0 var(--tinta); font-variant-numeric: tabular-nums; touch-action: none;
}
.boton.peligro.confirmar { background: var(--coral); }
.boton-sacar {
  appearance: none; border: 2px solid var(--tinta); cursor: pointer; flex: none; height: 34px; padding: 0 12px;
  border-radius: 9px; background: var(--coral); color: var(--tinta); font-weight: 800; font-size: 13px;
}
.pastilla.con-anuncio { background: var(--amarillo); }
.pastilla.con-anuncio span { animation: entrar .25s ease-out; }
button:focus-visible, .campo:focus-visible, .vol:focus-visible, a:focus-visible { outline: 3px solid var(--azul); outline-offset: 2px; }
.solo-lector { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@keyframes entrar { from { opacity: 0; transform: translateY(3px); } }
@keyframes latido { 50% { opacity: .35; } }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
.icono-btn[data-accion="espejo"][aria-pressed="true"] { background: var(--amarillo); border-color: var(--tinta); }
`;

  let anfitrion, raiz, vozAlta, plegado = false, copiado = false;
  let confirmar = null;                 // 'terminar' o 'echar<id>' esperando el segundo toque
  let anuncio = '';                     // «Ana se ha unido», unos segundos en la pastilla
  let tocandoVolumen = false, repintar = false;

  function montarPanel() {
    if (anfitrion) return;
    anfitrion = document.createElement('squadmeet-panel');
    const sombra = anfitrion.attachShadow({ mode: 'open' });
    sombra.innerHTML = `<style>${CSS}</style><div class="raiz" part="raiz"></div><div class="solo-lector" role="status" aria-live="polite"></div>`;
    raiz = sombra.querySelector('.raiz');
    vozAlta = sombra.querySelector('.solo-lector');
    sombra.appendChild(deposito);
    document.documentElement.appendChild(anfitrion);
    raiz.addEventListener('click', alPulsar);
    raiz.addEventListener('submit', (e) => {
      e.preventDefault();
      const campo = e.target.querySelector('[data-conservar="chat"]');
      if (!campo || !plan.pro || !grupo) return;
      const texto = campo.value.replace(/\s+/g, ' ').trim().slice(0, 200);
      campo.value = '';
      if (texto) difundirChat(null, texto);
    });
    // Lo que escribes en el panel no le llega a ome.tv (sus atajos de teclado saltarían al siguiente).
    for (const tipo of ['keydown', 'keyup', 'keypress']) raiz.addEventListener(tipo, (e) => { if (e.target.matches('input')) e.stopPropagation(); });
    raiz.addEventListener('input', (e) => { if (e.target.matches('.vol')) cambiarVolumen(Number(e.target.value)); });
    raiz.addEventListener('pointerdown', (e) => {
      if (e.target.matches('.vol')) tocandoVolumen = true;
      empezarArrastre(e);
    });
    // Mientras mueves el volumen no se repinta el panel (se soltaría el control); se hace al soltar.
    const soltarVolumen = () => {
      if (!tocandoVolumen) return;
      tocandoVolumen = false;
      if (repintar) { repintar = false; pintarPanel(); }
    };
    window.addEventListener('pointerup', soltarVolumen, true);
    window.addEventListener('pointercancel', soltarVolumen, true);
    window.addEventListener('resize', colocar);
    pintarPanel();
    if (!location.href.startsWith(SITIO)) cargarPlan();
  }

  // Un iPhone en versión de ordenador se hace pasar por un Mac, pero con pantalla táctil. Si ha llegado
  // con el botón directo, Safari lo olvida al cerrar la pestaña: las tres primeras veces se le recuerda
  // cómo guardarlo (desde ome.tv, nunca desde m.ome.tv, que provoca un bucle entre las dos).
  const iphoneEnEscritorio = () => /(^|\.)ome\.tv$/.test(location.hostname) && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) <= 600;
  let consejoContado = false;
  function consejoEscritorio() {
    if (!iphoneEnEscritorio()) return false;
    let veces = 0;
    try { veces = Number(localStorage.getItem('squadmeet:consejo-escritorio')) || 0; } catch {}
    if (veces >= 3) return false;
    if (!consejoContado) {
      consejoContado = true;
      try { localStorage.setItem('squadmeet:consejo-escritorio', String(veces + 1)); } catch {}
    }
    return true;
  }

  // Ome.tv pide iniciar sesión (su ventana de Facebook/Google/VK está a la vista). En Safari su inicio
  // de sesión con Google suele quedarse colgado: abre otra pestaña y guarda la sesión en otro dominio
  // (api.ometv.chat), y Safari bloquea por defecto ventanas emergentes y cookies entre sitios.
  const ventanaSesion = () => {
    const v = document.querySelector('.login-popup');
    return !!v && v.getBoundingClientRect().width > 0;
  };
  const pideSesionEnIphone = () => iphoneEnEscritorio() && ventanaSesion();
  // La ventana de inicio de sesión de Ome.tv aparece y desaparece sola. En el móvil sus botones quedan
  // abajo, justo donde va el panel: mientras está a la vista, el panel sube arriba para no taparlos.
  let pedíaSesion = false;
  setInterval(() => {
    if (grupo || !esMovil()) return;
    const ahora = ventanaSesion();
    if (ahora !== pedíaSesion) { pedíaSesion = ahora; pintarPanel(); }
  }, 1000);

  const nombreDe = (inv, textos = t) => inv.nombre || textos.amigo([...invitados.values()].indexOf(inv) + 1);

  function anunciar(texto) {
    anuncio = texto;
    if (vozAlta) vozAlta.textContent = texto;
    pintarPanel();
    setTimeout(() => { if (anuncio === texto) { anuncio = ''; pintarPanel(); } }, 3500);
  }

  // «Terminar grupo» y «Sacar» piden un segundo toque: uno sin querer no echa a nadie.
  function pedirConfirmacion(clave) {
    confirmar = clave;
    pintarPanel();
    setTimeout(() => { if (confirmar === clave) { confirmar = null; pintarPanel(); } }, 3500);
  }

  // En el móvil, ome.tv solo funciona en «versión de ordenador»: la página se pinta a ~980 px y se
  // encoge para caber. Agrandamos el panel en la misma proporción para que se lea a tamaño normal.
  function escala() {
    if (!navigator.maxTouchPoints) return 1;
    const anchoFisico = screen.width < screen.height === innerWidth < innerHeight ? screen.width : screen.height;
    return Math.min(3, Math.max(1, innerWidth / anchoFisico));
  }
  const esMovil = () => navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) < 700;

  function colocar() {
    if (!raiz) return;
    const k = escala();
    raiz.style.setProperty('--k', k);
    raiz.classList.toggle('movil', esMovil());
    raiz.classList.toggle('arriba', esMovil() && !grupo && ventanaSesion());
    const tarjeta = raiz.querySelector('.tarjeta');
    if (tarjeta) tarjeta.style.width = esMovil() ? Math.min(360, (innerWidth - 24 * k) / k) + 'px' : '';
    if (esMovil()) {
      raiz.style.left = raiz.style.top = '';
      return;
    }
    let pos = null;
    try { pos = JSON.parse(localStorage.getItem(CLAVE_POS)); } catch {}
    const caja = raiz.getBoundingClientRect();
    const x = pos ? pos.x : innerWidth - caja.width - 16;
    const y = pos ? pos.y : 16;
    raiz.style.left = Math.max(8, Math.min(innerWidth - caja.width - 8, x)) + 'px';
    raiz.style.top = Math.max(8, Math.min(innerHeight - 48, y)) + 'px';
  }

  function empezarArrastre(e) {
    if (esMovil() || !e.target.closest('.cabeza, .pastilla') || e.target.closest('button:not(.pastilla)')) return;
    const caja = raiz.getBoundingClientRect();
    const dx = e.clientX - caja.left, dy = e.clientY - caja.top;
    let movido = false;
    const mover = (ev) => {
      if (!movido && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 4) return;
      movido = true;
      raiz.style.left = Math.max(8, Math.min(innerWidth - caja.width - 8, ev.clientX - dx)) + 'px';
      raiz.style.top = Math.max(8, Math.min(innerHeight - 48, ev.clientY - dy)) + 'px';
    };
    const soltar = () => {
      removeEventListener('pointermove', mover);
      removeEventListener('pointerup', soltar);
      if (!movido) return;
      if (e.target.closest('.pastilla')) raiz.dataset.arrastrado = '1';
      try { localStorage.setItem(CLAVE_POS, JSON.stringify({ x: parseFloat(raiz.style.left), y: parseFloat(raiz.style.top) })); } catch {}
    };
    addEventListener('pointermove', mover);
    addEventListener('pointerup', soltar);
  }

  // /unirse/ y /join/ son la misma página; cambia el idioma de la vista previa del enlace.
  const enlaceGrupo = () => `${SITIO}${t.ruta}/#${grupo.id}`;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let ultimoHtml = '';
  function pintarPanel() {
    if (!raiz) return;
    if (tocandoVolumen) { repintar = true; return; }
    const conectados = [...invitados.values()].filter((i) => i.estado === 'conectado').length;
    const n = grupo ? 1 + conectados : 0;
    if (plegado) {
      ultimoHtml = '';
      raiz.innerHTML = `<button class="pastilla ${anuncio ? 'con-anuncio' : ''}" data-accion="desplegar" aria-label="${t.abrir}">${ICONOS.marca}<span>${anuncio ? esc(anuncio) : contando ? mmss(restantes()) : grupo ? `${n}/${1 + maxInvitados()}` : 'Squad'}</span></button>`;
      colocar();
      return;
    }
    let cuerpo;
    if (!grupo && location.href.startsWith(SITIO)) {
      // El favorito pulsado en nuestra propia web (la guía lo pide como prueba): está bien hecho.
      cuerpo = `
        <p class="texto"><strong>${t.favoritoListo}</strong> ${t.favoritoSiguiente}</p>
        <a class="boton primario" href="https://ome.tv/">${t.abrirOme}</a>`;
    } else if (!grupo && location.hostname === 'm.ome.tv') {
      // La versión para móvil de ome.tv no tiene chat (solo manda a su app): sin la de ordenador no
      // hay nada que hacer, así que se explica cómo activarla.
      cuerpo = `
        <p class="texto">${t.escritorio}</p>
        <p class="nota">${t.escritorioSafari}<br>${t.escritorioChrome}</p>`;
    } else if (vista === 'clave') {
      cuerpo = vistaClave();
    } else if (vista === 'esperando') {
      cuerpo = vistaEsperando();
    } else if (vista === 'bienvenida') {
      cuerpo = vistaBienvenida();
    } else if (!grupo && (vista === 'muro' || sinTiempo())) {
      cuerpo = vistaMuro();
    } else if (!grupo) {
      const guardado = leerGuardado();
      cuerpo = `
        <p class="texto">${t.presentacion(maxInvitados())}</p>
        ${pideSesionEnIphone() ? `<p class="aviso">${t.loginSafari}</p>` : consejoEscritorio() ? `<p class="nota">${t.recordarEscritorio}</p>` : ''}
        ${error ? `<p class="error">${esc(error)}</p>` : ''}
        ${guardado
          ? `<button class="boton primario" data-accion="reanudar" ${preparando ? 'disabled' : ''}>${preparando ? t.preparando : t.reanudar}</button>
             <button class="boton enlace-texto" data-accion="crear" ${preparando ? 'disabled' : ''}>${t.crearNuevo}</button>`
          : `<button class="boton primario" data-accion="crear" ${preparando ? 'disabled' : ''}>${preparando ? t.preparando : t.crear}</button>`}
        ${bloquePlan()}`;
    } else {
      const filas = [`<li class="persona"><span class="avatar" style="background:${COLORES[0]}">${t.tu}</span><span class="nombre">${t.tu}<small class="estado">${t.anfitrion}</small></span><button class="icono-btn" data-accion="espejo" aria-pressed="${espejoYo}" aria-label="${t.invertir}" title="${t.invertir}">${ICONOS.espejo}</button></li>`];
      let hueco = 1;
      for (const inv of invitados.values()) {
        const nombre = nombreDe(inv);
        const estado = inv.estado === 'conectado' ? (inv.silenciado ? t.silenciado : inv.camara ? t.enGrupo : t.camaraApagada) : inv.estado === 'reconectando' ? t.reconectando : t.entrando;
        const sacar = confirmar === 'echar' + inv.id
          ? `<button class="boton-sacar" data-accion="echar" data-id="${esc(inv.id)}" aria-label="${esc(t.confirmarSacar(nombre))}">${t.sacar}</button>`
          : `<button class="icono-btn" data-accion="echar" data-id="${esc(inv.id)}" aria-label="${esc(t.sacarA(nombre))}" title="${t.sacarTitulo}">${ICONOS.cerrar}</button>`;
        filas.push(`<li class="persona">
          <span class="avatar" style="background:${COLORES[hueco]}">${esc(nombre[0].toUpperCase())}</span>
          <span class="nombre">${esc(nombre)}<small class="estado ${inv.estado === 'conectado' ? '' : 'pendiente'}">${estado}</small></span>
          <button class="icono-btn ${inv.silenciado ? 'activo' : ''}" data-accion="silenciar" data-id="${esc(inv.id)}" aria-pressed="${inv.silenciado}" aria-label="${esc(inv.silenciado ? t.quitarSilencioA(nombre) : t.silenciarA(nombre))}" title="${inv.silenciado ? t.quitarSilencio : t.silenciar}">${inv.silenciado ? ICONOS.micNo : ICONOS.mic}</button>
          ${sacar}
        </li>`);
        hueco++;
      }
      const libres = maxInvitados() - hueco + 1;
      // En el móvil cada línea cuenta: los huecos libres van juntos.
      if (libres && esMovil()) filas.push(`<li class="persona libre"><span class="avatar vacio"></span><span class="nombre">${t.huecos(libres)}</span></li>`);
      else for (; hueco <= maxInvitados(); hueco++) filas.push(`<li class="persona libre"><span class="avatar vacio"></span><span class="nombre">${t.hueco}</span></li>`);
      const compartir = navigator.share && esMovil();
      cuerpo = `
        <div class="bloque">
          <div class="etiqueta">${t.enlace}${grupo.estado === 'abierto' ? '' : `<span class="conectando">${t.conectando}</span>`}</div>
          <div class="fila-enlace">
            <input class="campo" readonly value="${esc(enlaceGrupo())}" aria-label="${t.enlaceGrupo}">
            <button class="boton secundario cuadrado" data-accion="copiar" aria-label="${t.copiarEnlace}" title="${t.copiar}">${copiado ? ICONOS.hecho : ICONOS.copiar}</button>
            ${compartir ? `<button class="boton secundario cuadrado" data-accion="compartir" aria-label="${t.compartirEnlace}" title="${t.compartir}">${ICONOS.compartir}</button>` : ''}
          </div>
        </div>
        <div class="bloque">
          <div class="etiqueta">${t.enGrupo}</div>
          <ul class="personas">${filas.join('')}</ul>
        </div>
        ${plan.pro ? bloqueChat(conectados) : bloqueTiempo()}
        ${invitados.size && volumenFunciona ? `<label class="volumen">${ICONOS.volumen}<input class="vol" type="range" min="0" max="1" step="0.05" value="${volumenAmigos}" aria-label="${esc(t.volumen)}"></label>` : ''}
        ${aviso ? `<p class="aviso">${esc(aviso)}</p>` : ''}
        <p class="nota">${notaGrupo(conectados)}</p>
        <button class="boton peligro ${confirmar === 'terminar' ? 'confirmar' : ''}" data-accion="terminar">${confirmar === 'terminar' ? t.seguro : t.terminar}</button>`;
    }
    const html = `
      <section class="tarjeta" aria-label="SquadMeet">
        <header class="cabeza">
          <span class="marca">${ICONOS.marca}</span>
          <span class="titulo">SquadMeet</span>
          ${plan.pro ? '<span class="insignia">PRO</span>' : ''}
          ${grupo ? `<span class="contador">${n}/${1 + maxInvitados()}</span>` : ''}
          <button class="icono-btn" data-accion="plegar" aria-label="${t.minimizar}" title="${t.minimizar}">${ICONOS.menos}</button>
        </header>
        <div class="cuerpo">${cuerpo}</div>
      </section>`;
    // Si no ha cambiado nada, no se toca (así no se reinician las animaciones ni se pierde el foco).
    if (html === ultimoHtml && raiz.firstElementChild) { colocar(); return; }
    ultimoHtml = html;
    // Lo que estuvieras escribiendo (la clave, el chat) sigue ahí después de repintar.
    const sombra = raiz.getRootNode();
    const escrito = {};
    let foco = null;
    for (const el of raiz.querySelectorAll('[data-conservar]')) {
      escrito[el.dataset.conservar] = el.value;
      if (sombra.activeElement === el) foco = { clave: el.dataset.conservar, desde: el.selectionStart, hasta: el.selectionEnd };
    }
    raiz.innerHTML = html;
    for (const el of raiz.querySelectorAll('[data-conservar]')) if (escrito[el.dataset.conservar]) el.value = escrito[el.dataset.conservar];
    if (foco) {
      const el = raiz.querySelector(`[data-conservar="${foco.clave}"]`);
      if (el) { el.focus(); try { el.setSelectionRange(foco.desde, foco.hasta); } catch {} }
    }
    const lista = raiz.querySelector('.mensajes');
    if (lista) lista.scrollTop = lista.scrollHeight;
    colocar();
  }

  // Tiempo gratis de hoy (con un grupo abierto, o antes de crearlo).
  function bloqueTiempo() {
    if (plan.pro) return '';
    const quedan = restantes();
    return `<div class="tiempo ${quedan <= 60 ? 'poco' : ''}">
      <div class="fila"><span>${t.tiempoHoy}</span><span class="reloj">${mmss(quedan)}</span></div>
      <span class="barra"><i style="width:${Math.min(100, (quedan / plan.limite) * 100)}%"></i></span>
      ${plan.extra ? '' : `<button class="mas" data-accion="whatsapp">${t.ganar30}</button>`}
      <button class="mas" data-accion="muro">${t.hazPro}</button>
    </div>`;
  }
  function bloquePlan() {
    if (!plan.pro) return bloqueTiempo();
    return `<p class="nota">${t.proActivo(plan.plan)} · <button class="boton enlace-texto" data-accion="soltar">${t.quitarClave}</button></p>`;
  }
  function vistaMuro() {
    // Con enlace de Payhip: correo y pagar (Pro se activa solo). Sin él, a los precios de la web.
    const directo = !!TIENDA.siempre;
    const planes = directo ? [
      `<button class="boton oscuro plan-mini" data-accion="pagar" data-plan="siempre"><b>${t.proSiempre}</b><small>${t.proSiempreSub}</small></button>`,
      TIENDA.mensual ? `<button class="boton primario plan-mini" data-accion="pagar" data-plan="mensual"><b>${t.proMensual}</b><small>${t.proMensualSub}</small></button>` : '',
    ].join('') : `<a class="boton oscuro plan-mini" href="${esc(SITIO + t.precios)}" target="_blank" rel="noopener"><b>${t.proSiempre}</b><small>${t.proSiempreSub}</small></a>`;
    const campoCorreo = directo ? `<label class="nota" for="sm-correo">${t.correoEtiqueta}</label>
      <div class="fila-clave"><input class="campo" id="sm-correo" data-conservar="correo" type="email" inputmode="email" value="${esc(correoGuardado())}" placeholder="${esc(t.correoPlaceholder)}" autocomplete="email" spellcheck="false"></div>
      ${mensajeClave ? `<p class="error">${esc(mensajeClave)}</p>` : ''}` : '';
    const agotadoHoy = sinTiempo();
    return `<div class="muro">
      ${agotadoHoy ? `<h2>${t.agotadoTitulo}</h2><p class="texto">${plan.extra ? t.agotadoTexto : t.agotadoTextoExtra}</p>` : `<h2>${t.hazPro}</h2>`}
      ${plan.extra ? '' : `<button class="boton whatsapp" data-accion="whatsapp">${ICONOS.whatsapp}${t.ganar30}</button>`}
      <ul class="ventajas">${t.ventajasPro.map((v) => `<li>${v}</li>`).join('')}</ul>
      ${campoCorreo}
      ${planes ? `<div class="planes-mini">${planes}</div>` : ''}
      <button class="boton enlace-texto" data-accion="clave">${t.tengoClave}</button>
      ${agotadoHoy ? '' : `<button class="boton enlace-texto" data-accion="cancelar">${t.cancelar}</button>`}
    </div>`;
  }
  function vistaBienvenida() {
    return `<div class="muro bienvenida">
      <span class="sello" aria-hidden="true">${ICONOS.hecho}</span>
      <h2>${t.yaPro}</h2>
      <p class="texto">${t.bienvenidaTexto}</p>
      <ul class="ventajas">${t.ventajasPro.map((v) => `<li>${v}</li>`).join('')}</ul>
      <button class="boton primario" data-accion="cancelar">${t.empezar}</button>
      <p class="nota">${t.bienvenidaNota}</p>
    </div>`;
  }
  function vistaEsperando() {
    return `<div class="muro">
      <h2>${t.esperandoTitulo}</h2>
      <p class="texto">${t.esperandoTexto(esc(correoGuardado()))}</p>
      <span class="cargando" aria-hidden="true"></span>
      <button class="boton enlace-texto" data-accion="muro">${t.otroCorreo}</button>
      <button class="boton enlace-texto" data-accion="clave">${t.tengoClave}</button>
    </div>`;
  }
  function vistaClave() {
    return `<div class="muro">
      <h2>${t.tengoClave}</h2>
      <p class="nota">${t.claveAyuda}</p>
      <div class="fila-clave"><input class="campo" data-conservar="clave" placeholder="${esc(t.clavePlaceholder)}" aria-label="${esc(t.clavePlaceholder)}" autocomplete="off" autocapitalize="characters" spellcheck="false"></div>
      ${mensajeClave ? `<p class="error">${esc(mensajeClave)}</p>` : ''}
      <button class="boton primario" data-accion="activar" ${comprobando ? 'disabled' : ''}>${comprobando ? t.activando : t.activar}</button>
      <button class="boton enlace-texto" data-accion="cancelar">${t.cancelar}</button>
    </div>`;
  }
  function bloqueChat(conectados) {
    return `<div class="bloque chat">
      <div class="etiqueta">${t.chat}</div>
      <ul class="mensajes" data-vacio="${esc(t.chatVacio)}">${chat.map((m) => `<li><b>${esc(m.nombre)}:</b> ${esc(m.texto)}</li>`).join('')}</ul>
      <form class="fila-chat"><input class="campo texto-libre" data-conservar="chat" maxlength="200" placeholder="${esc(t.escribir)}" aria-label="${esc(t.escribir)}" enterkeyhint="send" autocomplete="off"><button class="boton secundario cuadrado" type="submit" aria-label="${esc(t.enviar)}" title="${esc(t.enviar)}">${ICONOS.enviar}</button></form>
      <p class="votos ${votos.size ? 'hay' : ''}">${votos.size ? t.votos(votos.size, conectados) : t.sinVotos}</p>
    </div>`;
  }

  // Lo que toca hacer ahora, según cómo va el grupo.
  function notaGrupo(conectados) {
    if (desconocido.video) return t.auriculares;
    if (conectados) return esMovil() ? t.empezarMovil : t.empezarPc;
    return esMovil() ? t.cuandoMovil : t.cuandoPc;
  }

  async function alPulsar(e) {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    const accion = b.dataset.accion;
    const inv = b.dataset.id ? invitados.get(b.dataset.id) : null;
    if (accion === 'terminar' || accion === 'echar') {
      const clave = accion === 'echar' ? 'echar' + b.dataset.id : 'terminar';
      if (confirmar !== clave) return pedirConfirmacion(clave);
      confirmar = null;
    }
    if ((accion === 'crear' || accion === 'reanudar') && sinTiempo()) { vista = 'muro'; pintarPanel(); return; }
    if (accion === 'crear') crearGrupo(false);
    else if (accion === 'reanudar') crearGrupo(true);
    else if (accion === 'whatsapp') compartirWhatsapp();
    else if (accion === 'muro') { vista = 'muro'; mensajeClave = ''; pintarPanel(); }
    else if (accion === 'pagar') pagar(b.dataset.plan === 'mensual' ? 'mensual' : 'siempre');
    else if (accion === 'clave') { vista = 'clave'; mensajeClave = ''; pintarPanel(); const c = raiz.querySelector('[data-conservar="clave"]'); if (c) c.focus(); }
    else if (accion === 'activar') activarClave((raiz.querySelector('[data-conservar="clave"]') || {}).value || '');
    else if (accion === 'cancelar') { vista = sinTiempo() && !grupo ? 'muro' : ''; pintarPanel(); }
    else if (accion === 'soltar') soltarClave();
    else if (accion === 'terminar') terminarGrupo();
    else if (accion === 'plegar') { plegado = true; pintarPanel(); }
    else if (accion === 'espejo') {
      espejoYo = !espejoYo;
      try { localStorage.setItem(CLAVE_ESPEJO, espejoYo ? '1' : '0'); } catch {}
      pintarPanel();
    }
    else if (accion === 'desplegar') {
      if (raiz.dataset.arrastrado) { delete raiz.dataset.arrastrado; return; }
      plegado = false;
      pintarPanel();
    } else if (accion === 'silenciar' && inv) silenciar(inv);
    else if (accion === 'echar' && inv) quitarInvitado(inv, 'expulsado');
    else if (accion === 'copiar') {
      const texto = enlaceGrupo();
      try { await navigator.clipboard.writeText(texto); } catch {
        const campo = raiz.querySelector('.campo');
        campo.select();
        document.execCommand('copy');
      }
      copiado = true;
      pintarPanel();
      setTimeout(() => { copiado = false; pintarPanel(); }, 1600);
    } else if (accion === 'compartir') {
      navigator.share({ title: t.invitacionTitulo, text: t.invitacionTexto, url: enlaceGrupo() }).catch(() => {});
    }
  }

  window.__squadmeet = {
    version: VERSION,
    mostrar() { plegado = false; montarPanel(); pintarPanel(); },
    // Por cada amigo: lo que se le envía y lo que llega de él (vídeo). Para medir y depurar.
    estadisticas: async () => Promise.all([...invitados.values()].map(async (i) => {
      const r = { nombre: i.nombre, t: Date.now(), bytesEnviados: 0, bytesRecibidos: 0 };
      const sender = i.enlace.pc.getSenders().find((x) => x.track && x.track.kind === 'video');
      const cod = sender && sender.getParameters().encodings;
      if (cod && cod[0] && cod[0].maxBitrate) r.tope = Math.round(cod[0].maxBitrate / 1000);
      const stats = await i.enlace.pc.getStats();
      let par = null;
      stats.forEach((s) => {
        if (s.type === 'outbound-rtp' && s.kind === 'video') Object.assign(r, { bytesEnviados: s.bytesSent, ancho: s.frameWidth, alto: s.frameHeight, fps: s.framesPerSecond, limite: s.qualityLimitationReason });
        if (s.type === 'inbound-rtp' && s.kind === 'video') Object.assign(r, { bytesRecibidos: s.bytesReceived, anchoRecibido: s.frameWidth, altoRecibido: s.frameHeight });
        if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') par = s;
      });
      // Por dónde va: directo entre los dos o por el servidor de retransmisión (más retardo).
      if (par) {
        const local = stats.get(par.localCandidateId);
        r.ruta = local && local.candidateType === 'relay' ? 'retransmitida' : 'directa';
        if (par.currentRoundTripTime) r.ms = Math.round(par.currentRoundTripTime * 1000);
      }
      return r;
    })),
    // Para depurar en un dispositivo real desde la consola: __squadmeet.diagnostico()
    diagnostico: () => ({
      msDibujo: +msDibujo.toFixed(1),
      codecHardware,
      ligero,
      salida: salida ? [salida.lienzo.width, salida.lienzo.height] : null,
      ome: estadoOme(),
      desconocido: fundido.hay,
      espejo: espejoYo,
      amigos: [...invitados.values()].map((i) => ({ nombre: i.nombre, estado: i.estado, via: i.via, orient: i.orient, espejo: !!i.espejo, escala: ESCALAS[i.regulador.escala] / ESCALAS[techo()] })),
      pantallas: visores.size,
      plan: { pro: plan.pro, plan: plan.plan, restantes: Math.round(restantes()), extra: plan.extra, contando, agotado },
    }),
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montarPanel, { once: true });
  else montarPanel();
  if (tardio) adoptarExistente();
}

})();
