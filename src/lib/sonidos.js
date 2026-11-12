// Sonidos de interfaz sintetizados con Web Audio (sin archivos). Recetas inspiradas en las de Pond
// (raphaelsalaja/pond, MIT, que a su vez siguen las de earshot y las medidas de los avisos de macOS), reimplementadas:
//   toque     clic táctil: ruido filtrado muy corto + un cuerpo grave
//   suave     clic más blando para segmentos, pestañas y radios
//   activar / desactivar   dos contactos que suben o bajan
//   exito     dos senos (do5 y sol5) con un armónico y una sala pequeña
//   papelera  ruido rosa en paso banda con trémolo + un seno que cae
// Cada sonido varía un poco de tono para no sonar a máquina, se limita a uno cada 40 ms, baja el volumen si se
// repite rápido y el AudioContext se suspende a los 20 s de silencio (uno en marcha despierta al proceso de audio).
// Al despertar, el dispositivo tarda ~100 ms y se come lo que suene antes: por eso cada sonido espera a que el contexto
// esté en marcha y deja un margen, en vez de programarse sobre un reloj parado (antes los clics tras una pausa no sonaban).
let ajustes = { activo: true, interfaz: true, volumen: 70 };
export function configurar(a) { if (a) ajustes = { ...ajustes, ...a }; }

let ctx = null;
let sala = null;
let salida = null;
let pausa = null;
const ultimo = {};

function contexto() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC({ latencyHint: "interactive" });
    salida = ctx.createGain();
    salida.connect(ctx.destination);
    // Sala: respuesta al impulso generada (ruido que decae), mezcla aparte.
    const n = Math.round(ctx.sampleRate * 0.35);
    const ir = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 4.5); }
    sala = ctx.createConvolver();
    sala.buffer = ir;
    sala.connect(salida);
  }
  clearTimeout(pausa);
  pausa = setTimeout(() => ctx && ctx.state === "running" && ctx.suspend().catch(() => {}), 20000);
  return ctx;
}

// Promesa que se resuelve con el margen hasta el primer sonido: casi nada si ya suena, más si acaba de despertar.
let despertando = null;
function listo(c) {
  if (c.state === "running") return Promise.resolve(0.005);
  if (!despertando) despertando = c.resume().then(() => { despertando = null; return 0.06; }, () => { despertando = null; return null; });
  return despertando;
}

let ruidoBlanco = null, ruidoRosa = null;
function ruido(rosa) {
  if (rosa ? ruidoRosa : ruidoBlanco) return rosa ? ruidoRosa : ruidoBlanco;
  const n = ctx.sampleRate;
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (rosa) { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; } else d[i] = w;
  }
  return rosa ? (ruidoRosa = b) : (ruidoBlanco = b);
}

// Golpe de ruido filtrado (el «contacto» de un clic).
function golpe(t, { f, q = 1.2, dur = 0.0016, gain = 0.3, tipo = "bandpass", rosa = false, destino }) {
  const s = ctx.createBufferSource();
  s.buffer = ruido(rosa);
  const fl = ctx.createBiquadFilter();
  fl.type = tipo; fl.frequency.value = f; fl.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.0005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.0005 + dur * 6);
  s.connect(fl); fl.connect(g); g.connect(destino);
  s.start(t, Math.random() * 0.5); s.stop(t + dur * 6 + 0.02);
}

function seno(t, { f, f2, dur, gain, ataque = 0.004, destino, tipo = "sine" }) {
  const o = ctx.createOscillator();
  o.type = tipo;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + ataque);
  g.gain.exponentialRampToValueAtTime(0.0001, t + ataque + dur);
  o.connect(g); g.connect(destino);
  o.start(t); o.stop(t + ataque + dur + 0.05);
}

// Cuerpo grave del clic: un seno muy corto que da peso.
const cuerpo = (t, d, k = 1) => seno(t, { f: 180 * k, f2: 120 * k, dur: 0.018, gain: 0.08, ataque: 0.001, destino: d });

const RECETAS = {
  toque(t, d, k) { golpe(t, { f: 4200 * k, gain: 0.32, destino: d }); golpe(t + 0.001, { f: 2100 * k, gain: 0.12, destino: d }); cuerpo(t, d, k); golpe(t + 0.009, { f: 4950 * k, gain: 0.12, dur: 0.0012, destino: d }); return 0.06; },
  suave(t, d, k) { golpe(t, { f: 2400 * k, gain: 0.26, dur: 0.0014, destino: d }); cuerpo(t, d, k); return 0.04; },
  activar(t, d, k) { golpe(t, { f: 3200 * k, gain: 0.3, destino: d }); cuerpo(t, d, k); golpe(t + 0.04, { f: 3900 * k, gain: 0.16, destino: d }); return 0.08; },
  desactivar(t, d, k) { golpe(t, { f: 3600 * k, gain: 0.3, destino: d }); cuerpo(t, d, k); golpe(t + 0.04, { f: 2800 * k, gain: 0.16, destino: d }); return 0.08; },
  exito(t, d, k) {
    seno(t, { f: 523.3 * k, dur: 0.16, gain: 0.07, destino: d });
    seno(t + 0.07, { f: 784 * k, dur: 0.4, gain: 0.08, destino: d });
    seno(t + 0.07, { f: 2352 * k, dur: 0.14, gain: 0.02, destino: d });
    return 0.12;
  },
  papelera(t, d, k) {
    const s = ctx.createBufferSource(); s.buffer = ruido(true);
    const fl = ctx.createBiquadFilter(); fl.type = "bandpass"; fl.Q.value = 0.8;
    fl.frequency.setValueAtTime(1400, t); fl.frequency.linearRampToValueAtTime(3600, t + 0.004); fl.frequency.exponentialRampToValueAtTime(1400, t + 0.13);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    const trem = ctx.createGain(); const lfo = ctx.createOscillator(); const prof = ctx.createGain();
    lfo.frequency.value = 38; prof.gain.value = 0.35; trem.gain.value = 0.65; lfo.connect(prof); prof.connect(trem.gain);
    s.connect(fl); fl.connect(g); g.connect(trem); trem.connect(d);
    s.start(t, Math.random() * 0.5); s.stop(t + 0.2); lfo.start(t); lfo.stop(t + 0.2);
    seno(t + 0.07, { f: 330 * k, f2: 200 * k, dur: 0.11, gain: 0.06, destino: d });
    return 0.08;
  },
};
const DE_INTERFAZ = new Set(["toque", "suave", "activar", "desactivar"]);

export function sonar(nombre) {
  try {
    if (!ajustes.activo || !RECETAS[nombre]) return;
    if (DE_INTERFAZ.has(nombre) && !ajustes.interfaz) return;
    const ahora = performance.now();
    const antes = ultimo[nombre] || 0;
    if (ahora - antes < 40) return;
    ultimo[nombre] = ahora;
    const c = contexto();
    if (!c) return;
    const rapido = ahora - antes < 110;
    listo(c).then((margen) => {
      if (margen == null || !ajustes.activo) return;
      try {
        const t = c.currentTime + margen;
        const k = Math.pow(2, ((Math.random() - 0.5) * (nombre === "exito" ? 16 : 28)) / 1200); // ±14 cents
        const vol = c.createGain();
        vol.gain.value = (ajustes.volumen / 100) * (rapido ? 0.7 : 1);
        vol.connect(salida);
        const seco = c.createGain(); seco.connect(vol);
        const mojado = c.createGain(); mojado.connect(sala);
        const mezcla = RECETAS[nombre](t, seco, k);
        // Envío a la sala proporcional: los clics casi secos, el éxito con algo de cola.
        const envio = c.createGain(); envio.gain.value = mezcla * (ajustes.volumen / 100); seco.connect(envio); envio.connect(mojado);
      } catch {}
    });
  } catch {}
}

// Abrir el dispositivo de audio tarda ~100 ms: se despierta al bajar el puntero o pulsar una tecla, antes de que haga falta.
export function preparar() { if (ajustes.activo) { try { listo(contexto()); } catch {} } }

// Clic táctil en cualquier botón del panel, sin tocar cada componente. Los interruptores tienen su propio sonido.
export function escucharClics() {
  const on = (e) => {
    if (e.button !== 0) return;
    const el = e.target.closest && e.target.closest("button, a.btn, a.card, [role='menuitem'], [role='option'], [role='radio'], [role='tab'], .segbtn, summary");
    if (!el || el.disabled || el.closest("[data-sin-sonido]") || el.getAttribute("role") === "switch" || el.closest(".switch")) return;
    sonar(el.matches("[role='radio'], [role='tab'], .segbtn, .colorbtn, .estrellas button") ? "suave" : "toque");
  };
  window.addEventListener("pointerdown", preparar, true);
  window.addEventListener("pointerdown", on, true);
  window.addEventListener("keydown", preparar, true);
  return () => {
    window.removeEventListener("pointerdown", preparar, true);
    window.removeEventListener("pointerdown", on, true);
    window.removeEventListener("keydown", preparar, true);
  };
}
