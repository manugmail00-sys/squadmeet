/* SquadMeet 1.7.0 */
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
