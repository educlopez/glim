// Instantáneas de métricas en el borrador: Buffer refresca las métricas de cada post enviado (buffer.js las guarda en
// .glim/buffer.json, que no se versiona). Para que el resultado llegue a git y a los agentes, la reconciliación
// (reconciliar.js) copia al frontmatter dos fotos fijas por borrador:
//   metricas_48h: X: impresiones 1200, reacciones 14, comentarios 3, compartidos 1, engagement 1.50% · tomadas: 2026-11-12T10:04Z
//   metricas_7d:  igual, a partir de los 7 días.
// Cada foto solo vale dentro de su ventana: la de 48 h entre las 48 y las 72 h desde la salida del post, la de 7 días
// entre los 7 y los 9 días. Fuera de la ventana no se escribe nada (una pieza de enero no recibe una «foto de 7 días»
// con datos de hoy). Nunca se pisa una foto que ya existe.
// Sin datos no hay foto: una red cuenta solo si Buffer da impresiones > 0, y si Buffer dice cuándo refrescó las
// métricas, ese refresco tiene que caer dentro de la ventana (si no, son datos de antes).
// Sin dependencias del cerebro: lo usan reconciliar.js, posts.js, informe.js y los tests.

export const CLAVES = { "48h": "metricas_48h", "7d": "metricas_7d" };
export const CAMPOS = ["impresiones", "reacciones", "comentarios", "compartidos", "engagement"];
const ORDEN_RED = ["X", "Threads", "LinkedIn"];
const RED = { twitter: "X", threads: "Threads", linkedin: "LinkedIn" };
const HORA = 3600e3;
// [desde, hasta) en horas desde la salida.
export const VENTANA = { "48h": [48 * HORA, 72 * HORA], "7d": [7 * 24 * HORA, 9 * 24 * HORA] };

// Tipos de métrica de Buffer → campo de la instantánea. Lo que no está aquí no entra.
const TIPO = {
  impressions: "impresiones", views: "impresiones", reach: "impresiones",
  reactions: "reacciones", likes: "reacciones", favorites: "reacciones",
  comments: "comentarios", replies: "comentarios",
  reposts: "compartidos", shares: "compartidos", retweets: "compartidos", quotes: "compartidos",
  engagement_rate: "engagement", engagementRate: "engagement", engagement: "engagement",
};

// Métricas de un post de Buffer (formato de la caché: [{ tipo, valor, unidad }]) → { impresiones, reacciones… }.
// El engagement se calcula si Buffer no lo da: (reacciones + comentarios + compartidos) / impresiones.
export function normalizar(metricas) {
  const out = {};
  for (const m of metricas || []) {
    const campo = TIPO[m.tipo];
    if (!campo || typeof m.valor !== "number" || !Number.isFinite(m.valor)) continue;
    // Varias métricas pueden caer en el mismo campo (reposts y quotes): se suman, salvo el engagement.
    if (campo === "engagement") out.engagement = m.valor;
    else out[campo] = (out[campo] || 0) + m.valor;
  }
  if (out.engagement == null && out.impresiones > 0) out.engagement = (((out.reacciones || 0) + (out.comentarios || 0) + (out.compartidos || 0)) / out.impresiones) * 100;
  return out;
}

const numero = (v) => String(Math.round(v));
const pct = (v) => `${v.toFixed(2)}%`;

// { X: {...}, Threads: {...} } + fecha → una línea de frontmatter, siempre en el mismo orden.
export function formatear(porRed, tomadas) {
  const redes = Object.keys(porRed).sort((a, b) => (ORDEN_RED.indexOf(a) + 1 || 99) - (ORDEN_RED.indexOf(b) + 1 || 99) || a.localeCompare(b));
  const partes = redes.map((r) => {
    const m = porRed[r];
    const campos = CAMPOS.filter((c) => m[c] != null).map((c) => `${c} ${c === "engagement" ? pct(m[c]) : numero(m[c])}`);
    return `${r}: ${campos.join(", ")}`;
  });
  return `${partes.join(" · ")} · tomadas: ${tomadas}`;
}

// Inversa de formatear: lee el valor del frontmatter. Devuelve null si no hay nada que leer.
export function parsear(valor) {
  const s = String(valor || "").trim();
  if (!s) return null;
  const redes = {};
  let tomadas = null;
  for (const trozo of s.split(" · ")) {
    const t = /^tomadas:\s*(\S+)/.exec(trozo.trim());
    if (t) { tomadas = t[1]; continue; }
    const m = /^([^:]+):\s*(.*)$/.exec(trozo.trim());
    if (!m) continue;
    const vals = {};
    for (const par of m[2].split(",")) {
      const kv = /^\s*(\w+)\s+([\d.]+)%?\s*$/.exec(par);
      if (kv && CAMPOS.includes(kv[1])) vals[kv[1]] = Number(kv[2]);
    }
    if (Object.keys(vals).length) redes[m[1].trim()] = vals;
  }
  return Object.keys(redes).length ? { redes, tomadas } : null;
}

// Fecha de toma con precisión de minuto (ISO, UTC): estable y legible.
export const sello = (ahora) => `${new Date(ahora).toISOString().slice(0, 16)}Z`;

// Qué instantáneas tocan ahora para un borrador enlazado a estos posts de Buffer.
//   doc: { campo(k), poner(k, v, despuesDe) } (el de reconciliar.js)
//   posts: los de la caché de Buffer enlazados al borrador
// Devuelve las claves escritas. Solo cuenta lo enviado y con alguna métrica; nunca pisa una foto que ya existe.
export function tomarInstantaneas(doc, posts, ahora = Date.now()) {
  const enviados = (posts || []).filter((p) => p.estado === "sent" && p.sentAt);
  if (!enviados.length) return [];
  const salida = Math.min(...enviados.map((p) => new Date(p.sentAt).getTime()).filter(Number.isFinite));
  if (!Number.isFinite(salida)) return [];
  const pasado = ahora - salida;
  const escritas = [];
  for (const tramo of ["48h", "7d"]) {
    const clave = CLAVES[tramo];
    const [desde, hasta] = VENTANA[tramo];
    if (pasado < desde || pasado >= hasta || doc.campo(clave)) continue;
    const porRed = {};
    for (const p of enviados) {
      // Métricas refrescadas antes de que empezara la ventana: no son las de este tramo.
      const refresco = p.metricasEn ? new Date(p.metricasEn).getTime() : null;
      if (refresco != null && Number.isFinite(refresco) && refresco < salida + desde) continue;
      const m = normalizar(p.metricas);
      if (!(m.impresiones > 0)) continue;
      porRed[RED[p.servicio] || p.servicio] = m;
    }
    if (!Object.keys(porRed).length) continue;
    const despues = tramo === "7d" && doc.campo(CLAVES["48h"]) ? CLAVES["48h"] : doc.campo("metricas") ? "metricas" : "publicado_url";
    doc.poner(clave, formatear(porRed, sello(ahora)), despues);
    escritas.push(clave);
  }
  return escritas;
}

const mediana = (xs) => {
  const v = xs.filter((x) => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
export { mediana };
