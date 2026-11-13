import { t } from "./i18n.js";

// Utilidades de la biblioteca de referencias: familias de color, duplicadas por huella visual, búsqueda con
// sintaxis y empaquetado del mosaico. Ideas de Pond (raphaelsalaja/pond, MIT), reimplementadas.

// label: getter, para que salga en el idioma activo al pintar.
export const COLORES = [
  { id: "rojo", get label() { return t("refs.color.rojo"); }, hex: "#e5484d" },
  { id: "naranja", get label() { return t("refs.color.naranja"); }, hex: "#f76b15" },
  { id: "amarillo", get label() { return t("refs.color.amarillo"); }, hex: "#ffc53d" },
  { id: "verde", get label() { return t("refs.color.verde"); }, hex: "#30a46c" },
  { id: "turquesa", get label() { return t("refs.color.turquesa"); }, hex: "#12a594" },
  { id: "azul", get label() { return t("refs.color.azul"); }, hex: "#0090ff" },
  { id: "morado", get label() { return t("refs.color.morado"); }, hex: "#8e4ec6" },
  { id: "rosa", get label() { return t("refs.color.rosa"); }, hex: "#e93d82" },
  { id: "negro", get label() { return t("refs.color.negro"); }, hex: "#111113" },
  { id: "gris", get label() { return t("refs.color.gris"); }, hex: "#8b8d98" },
  { id: "blanco", get label() { return t("refs.color.blanco"); }, hex: "#f7f7f5" },
];

function hsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

// Familia de un color: por luminosidad para negro, blanco y gris; por tono para el resto.
export function familia(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || "")) return null;
  const [h, s, l] = hsl(hex);
  if (l < 0.14) return "negro";
  if (l > 0.9 && s < 0.5) return "blanco";
  if (s < 0.16 || (l < 0.22 && s < 0.35)) return l > 0.75 ? "blanco" : l < 0.25 ? "negro" : "gris";
  if (h < 14 || h >= 345) return "rojo";
  if (h < 42) return "naranja";
  if (h < 68) return "amarillo";
  if (h < 160) return "verde";
  if (h < 195) return "turquesa";
  if (h < 255) return "azul";
  if (h < 295) return "morado";
  return "rosa";
}

// Una referencia "es" de un color si aparece entre sus tres colores principales o es su fondo.
export function familias(r) {
  const a = r.analisis;
  if (!a) return [];
  return [...new Set([a.fondo, ...(a.colores || []).slice(0, 3)].map(familia).filter(Boolean))];
}

// Distancia de Hamming entre dos dHash de 64 bits en hexadecimal.
function bits32(n) { n -= (n >>> 1) & 0x55555555; n = (n & 0x33333333) + ((n >>> 2) & 0x33333333); return (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; }
export function hamming(a, b) {
  if (!a || !b || a.length !== 16 || b.length !== 16) return 64;
  return bits32((parseInt(a.slice(0, 8), 16) ^ parseInt(b.slice(0, 8), 16)) >>> 0) + bits32((parseInt(a.slice(8), 16) ^ parseInt(b.slice(8), 16)) >>> 0);
}

const UMBRAL = 6;
const normUrl = (u) => { try { const x = new URL(u); return (x.hostname.replace(/^www\./, "").replace(/^twitter\.com$/, "x.com") + x.pathname.replace(/\/$/, "")).toLowerCase(); } catch { return null; } };
export { normUrl };

// Mapa id → [{id, motivo, dist}] de referencias casi iguales: mismo archivo (sha), misma URL o imagen parecida.
// motivo es un identificador (archivo, enlace, identica, parecida); la etiqueta sale de motivoDuplicada().
export function duplicadas(lista) {
  const out = {};
  const add = (a, b, motivo, dist = 0) => {
    (out[a.id] ||= []).some((x) => x.id === b.id) || out[a.id].push({ id: b.id, motivo, dist });
    (out[b.id] ||= []).some((x) => x.id === a.id) || out[b.id].push({ id: a.id, motivo, dist });
  };
  const porSha = {}, porUrl = {};
  for (const r of lista) {
    const sha = r.analisis && r.analisis.sha;
    if (sha) { if (porSha[sha] && porSha[sha].id !== r.id) add(porSha[sha], r, "archivo"); else porSha[sha] = r; }
    const u = r.url && normUrl(r.url);
    if (u) { if (porUrl[u] && porUrl[u].id !== r.id) add(porUrl[u], r, "enlace"); else porUrl[u] = r; }
  }
  const conHash = lista.filter((r) => r.analisis && r.analisis.dhash && !/^0+$/.test(r.analisis.dhash));
  for (let i = 0; i < conHash.length; i++) {
    for (let j = i + 1; j < conHash.length; j++) {
      const d = hamming(conHash[i].analisis.dhash, conHash[j].analisis.dhash);
      // Dos vídeos que duran distinto no son el mismo aunque arranquen igual (fundido a negro, logo de entrada).
      const da = conHash[i].analisis.duracion, db = conHash[j].analisis.duracion;
      if (da && db && Math.abs(da - db) > 1) continue;
      if (d <= UMBRAL) add(conHash[i], conHash[j], d === 0 ? "identica" : "parecida", d);
    }
  }
  return out;
}

const sinAcentos = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Búsqueda con sintaxis: palabras sueltas (todas deben aparecer, sin acentos), #etiqueta, color:azul, tipo:video,
// fuente:mia|posts.design, nota:4 (valoración mínima), es:duplicada, es:sin-notas. Devuelve un predicado.
export function consulta(q, dups = {}) {
  const fichas = sinAcentos(q).match(/[^\s"]+|"[^"]*"/g) || [];
  const conds = [];
  for (const f0 of fichas) {
    const f = f0.replace(/^"|"$/g, "");
    let m;
    if ((m = /^#(.+)$/.exec(f))) conds.push((r) => (r.etiquetas || []).some((t) => sinAcentos(t) === m[1]));
    else if ((m = /^color:(.+)$/.exec(f))) conds.push((r) => familias(r).includes(m[1]));
    else if ((m = /^tipo:(.+)$/.exec(f))) conds.push((r) => sinAcentos(r.tipo).startsWith(m[1]));
    else if ((m = /^fuente:(.+)$/.exec(f))) conds.push((r) => (m[1].startsWith("mi") || m[1] === "propia" ? r.fuente === "propia" : sinAcentos(r.fuente).includes(m[1])));
    else if ((m = /^nota:(\d)$/.exec(f))) conds.push((r) => (r.valoracion || 0) >= +m[1]);
    else if (f === "es:duplicada") conds.push((r) => !!dups[r.id]);
    else if (f === "es:sin-notas") conds.push((r) => !r.notas);
    else conds.push((r) => sinAcentos(`${r.titulo} ${r.notas || ""} ${r.descripcion || ""} ${(r.etiquetas || []).join(" ")} ${r.handle || ""} ${r.dominio || ""} ${r.url || ""} ${r.grupo || ""}`).includes(f));
  }
  return (r) => conds.every((c) => c(r));
}

export const motivoDuplicada = (m) => t(`refs.motivo.${m}`);

// Proporción de la miniatura en el mosaico, acotada para que nada quede ni muy alto ni muy fino.
export function proporcion(r) {
  const a = r.analisis;
  const p = a && a.w && a.h ? a.w / a.h : r.tipo === "web" || r.tipo === "post" ? 1.6 : 16 / 9;
  return Math.max(0.56, Math.min(2.2, p));
}

// Mosaico: cada tarjeta va a la columna más baja (packWaterfall de Pond). Mantiene el orden de izquierda a derecha.
export function empaquetar(lista, columnas, anchoCol, cuerpo = 64) {
  const cols = Array.from({ length: columnas }, () => ({ alto: 0, items: [] }));
  for (const r of lista) {
    const c = cols.reduce((a, b) => (b.alto < a.alto ? b : a));
    c.items.push(r);
    c.alto += anchoCol / proporcion(r) + cuerpo + (r.notas ? 34 : 0);
  }
  return cols.map((c) => c.items);
}
