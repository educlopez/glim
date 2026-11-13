// Referencias: lo que Edu va guardando como inspiración (enlaces, capturas, vídeos) más lo ya descargado de
// posts.design en media/referencias/. Las suyas viven en estrategia/referencias.json (versionado); los archivos
// subidos van a media/referencias/subidas/ (solo local, como todo media/). Son internas: nunca se nombran en público.
import fs from "node:fs";
import path from "node:path";
import { ROOT, read, exists, ls, walk, kindOf, mtime, hoyLocal } from "./repo.js";
import { rutas } from "./cerebro.js";
import * as an from "./analisis.js";
import * as lec from "./lectores.js";
import * as copias from "./archivo.js";

const JSON_PATH = rutas.referencias;
const SUBIDAS = `${rutas.mediaReferencias}/subidas`;
const MR = rutas.mediaReferencias;
const EXT_OK = /\.(png|jpe?g|webp|gif|avif|mp4|webm|mov)$/i;

function cargar() {
  try { return JSON.parse(read(JSON_PATH)) || { items: [] }; } catch { return { version: 1, items: [] }; }
}
function guardar(d) {
  d.version = 1;
  d.actualizado = hoyLocal();
  fs.writeFileSync(path.join(ROOT, JSON_PATH), JSON.stringify(d, null, 2) + "\n");
}

const dominio = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return null; } };
const tipoDe = (r) => {
  const f = r.archivo || r.url || "";
  const k = kindOf(f.split("?")[0]);
  if (k === "video") return "video";
  if (k === "image") return "imagen";
  if (/x\.com|twitter\.com|threads\.(net|com)|linkedin\.com/.test(f)) return "post";
  return "web";
};

// posts.design ya descargados: <id>.mp4 con su hoja de fotogramas (-sheet.jpg o -hoja.jpg) o miniatura. Un post con
// varios medios llega como <nombre>-0.mp4, <nombre>-1.mp4, <nombre>-2.webp…: es una sola referencia con galería.
// Las hojas de fotogramas no son referencias, solo miniaturas.
const HOJA = /-(sheet|hoja)\.jpg$/i;
const MEDIO = /\.(mp4|jpe?g|png|webp)$/i;
function postsDesign() {
  const vids = walk(MR, (p) => MEDIO.test(p) && !p.startsWith(`${SUBIDAS}/`) && !p.includes("/mini/") && !p.startsWith(`${an.PREVIAS}/`) && !p.startsWith(`${MR}/archivo/`) && !HOJA.test(p), 2);
  const bases = {};
  for (const p of vids.sort()) {
    const post = p.replace(MEDIO, "").replace(/^(.+-\d{4,})-\d$/, "$1");
    (bases[post] ||= []).push(p);
  }
  return Object.entries(bases).map(([base, archivos]) => {
    const name = path.basename(base);
    const principal = archivos.find((p) => kindOf(p) === "video") || archivos[0];
    const m = /^x-twitter-([^-]+(?:-ai)?)-\d+-(.+)$/.exec(name);
    const handle = m ? m[1] : null;
    const titulo = (m ? m[2] : name.replace(/^\d+-/, "")).replace(/-/g, " ");
    const pbase = principal.replace(MEDIO, "");
    const thumb = [`${pbase}-sheet.jpg`, `${base}-sheet.jpg`, `${base}-hoja.jpg`, `${MR}/mini/${name}.jpg`, kindOf(principal) === "image" ? principal : null].find((x) => x && exists(x)) || null;
    const galeria = archivos.filter((p) => p !== principal);
    return {
      id: `pd-${name}`.slice(0, 90), fuente: "posts.design", titulo, handle, tipo: kindOf(principal) === "video" ? "video" : "imagen",
      archivo: principal, thumb, galeria: galeria.length ? galeria : undefined, url: m ? `https://x.com/${handle}/status/${/-(\d+)-/.exec(name)[1]}` : null,
      grupo: path.dirname(base) === MR ? "Descargas" : path.basename(path.dirname(base)), etiquetas: [], creado: new Date(mtime(principal)).toISOString().slice(0, 10),
    };
  });
}

// Anotaciones de las referencias que no son tuyas (posts.design): título bueno, enlace, autor, tipo de post y
// etiquetas. Viven en referencias.json → anotaciones, por id; las propias llevan tipo_post en su propia entrada.
const ANOTABLES = ["titulo", "url", "handle", "tipo_post", "etiquetas", "notas"];
function anotar(r, a) {
  if (!a) return r;
  for (const k of ANOTABLES) if (a[k] !== undefined && a[k] !== null && a[k] !== "") r[k] = k === "etiquetas" ? limpiarEtiquetas([...(r.etiquetas || []), ...a[k]]) : a[k];
  return r;
}

// Archivo que se analiza: el propio (imagen o vídeo) o, si es un enlace, la imagen de vista previa descargada.
const fuenteAnalisis = (r) => (r.archivo && r.existe !== false ? r.archivo : r.thumb) || null;

export function referencias() {
  const d = cargar();
  const val = d.valoraciones || {};
  const propias = (d.items || []).map((r) => ({ ...r, fuente: "propia", tipo: tipoDe(r), dominio: dominio(r.url), existe: r.archivo ? exists(r.archivo) : true, thumb: r.archivo && kindOf(r.archivo) === "image" ? r.archivo : r.thumb || null }));
  const anot = d.anotaciones || {};
  const todas = [...propias.sort((a, b) => (b.creado || "").localeCompare(a.creado || "")), ...postsDesign().map((r) => anotar(r, anot[r.id]))];
  const pendientes = [];
  for (const r of todas) {
    r.valoracion = val[r.id] || r.valoracion || 0;
    if (copiando.has(r.id)) r.copiando = true;
    if (r.galeria) r.galeria = r.galeria.filter((g) => exists(g));
    const f = fuenteAnalisis(r);
    const a = an.de(f);
    if (!a) { if (f) pendientes.push(f); continue; }
    if (a.error) continue;
    r.analisis = { w: a.w, h: a.h, colores: a.colores || [], fondo: a.fondo || null, dhash: a.dhash || null, sha: a.sha || null, duracion: a.duracion || null };
    if (r.tipo === "video") { if (a.poster) r.thumb = a.poster; r.previa = a.previa || null; }
  }
  if (pendientes.length && !an.ocupado()) an.analizar(pendientes).catch(() => {});
  return todas;
}

export const vistas = () => cargar().vistas || [];

export function estudios() {
  if (!rutas.referentes) return [];
  return ls(rutas.referentes).filter((d) => d.name.endsWith(".md")).map((d) => {
    const p = `${rutas.referentes}/${d.name}`;
    const t = read(p) || "";
    return { path: p, titulo: (/^#\s+(.+)$/m.exec(t) || [])[1] || d.name, palabras: t.split(/\s+/).length };
  });
}

const copiando = new Set();

// Mueve a subidas/ los archivos de una lectura pendiente (lectores.js). Solo acepta rutas de pendientes/.
function moverLeidos(archivos, id) {
  return (archivos || []).filter(lec.esPendiente).map((src, i) => {
    const dest = `${SUBIDAS}/${id}-${String(i + 1).padStart(2, "0")}${path.extname(src).toLowerCase()}`;
    fs.renameSync(path.join(ROOT, src), path.join(ROOT, dest));
    return dest;
  });
}

export async function anadir({ url, titulo, notas, etiquetas, archivo, imagen, descripcion, leido, separar, copia }) {
  if (!url && !archivo && !(leido && leido.archivos && leido.archivos.length)) throw new Error("Pega un enlace o sube un archivo");
  if (url && !/^https?:\/\//i.test(url)) throw new Error("El enlace tiene que empezar por http");
  const d = cargar();
  const id = `ref-${Date.now().toString(36)}`;
  let rutas = [];
  let thumb = null;
  if (archivo && archivo.data) {
    const ext = path.extname(archivo.name || "").toLowerCase();
    if (!EXT_OK.test(ext)) throw new Error("Solo imágenes o vídeos (png, jpg, webp, gif, mp4, webm, mov)");
    fs.mkdirSync(path.join(ROOT, SUBIDAS), { recursive: true });
    rutas = [`${SUBIDAS}/${id}${ext}`];
    fs.writeFileSync(path.join(ROOT, rutas[0]), Buffer.from(String(archivo.data).replace(/^data:[^,]+,/, ""), "base64"));
  } else if (leido && Array.isArray(leido.archivos) && leido.archivos.length) {
    fs.mkdirSync(path.join(ROOT, SUBIDAS), { recursive: true });
    rutas = moverLeidos(leido.archivos, id);
  } else if (imagen && /^https?:\/\//i.test(imagen)) {
    thumb = await descargarImagen(imagen, id).catch(() => null);
  }
  const base = {
    creado: hoyLocal(), url: url || null, notas: String(notas || "").trim(), etiquetas: limpiarEtiquetas(etiquetas),
    descripcion: String(descripcion || "").trim().slice(0, 600) || undefined, autor: leido && leido.autor ? String(leido.autor).slice(0, 80) : undefined,
  };
  const nombre = String(titulo || "").trim() || (url ? dominio(url) : archivo && archivo.name) || "Referencia";
  // Un carrusel puede entrar como una referencia con galería o como una por imagen (el «Split» de Pond).
  const items = separar && rutas.length > 1
    ? rutas.map((r, i) => ({ id: `${id}${i ? `-${i + 1}` : ""}`, titulo: `${nombre} (${i + 1}/${rutas.length})`, archivo: r, thumb: null, ...base }))
    : [{ id, titulo: nombre, archivo: rutas[0] || null, galeria: rutas.length > 1 ? rutas.slice(1) : undefined, thumb, ...base }];
  d.items = [...items, ...(d.items || [])];
  guardar(d);
  const f = items.map((x) => x.archivo || x.thumb).filter(Boolean);
  if (f.length) await an.analizar(f).catch(() => {});
  if (copia && url && !rutas.length) guardarCopia(id).catch((e) => console.warn("[panel] copia:", e.message));
  return items[0];
}

// Guarda una copia de la página de una referencia (archivo.js). Si no tenía miniatura, usa la portada de la copia.
export async function guardarCopia(id) {
  const r = (cargar().items || []).find((x) => x.id === id);
  if (!r) throw new Error("Solo se guardan copias de referencias tuyas");
  if (copiando.has(id)) throw new Error("Ya se está guardando");
  copiando.add(id);
  try {
    const c = await copias.guardar(id, r.url);
    const d = cargar();
    const x = (d.items || []).find((y) => y.id === id);
    if (!x) return c;
    x.copias = [c, ...(x.copias || [])].slice(0, 10);
    if (!x.archivo && !x.thumb) x.thumb = c.portada;
    if (!x.descripcion && c.extracto) x.descripcion = c.extracto;
    guardar(d);
    an.analizar([x.thumb]).catch(() => {});
    return c;
  } finally { copiando.delete(id); }
}

// Metadatos de un enlace (título, descripción, imagen, sitio). Una sola petición GET a la propia URL, sin cookies y
// con un agente genérico. Para X se usa su oEmbed público, porque la web no da metadatos sin sesión.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
async function traer(u, ms = 8000, max = 1.5e6) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(u, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8", "Accept-Language": "es,en;q=0.8" }, redirect: "follow", signal: ac.signal, credentials: "omit" });
    if (!r.ok) throw new Error(`La web respondió ${r.status}`);
    const reader = r.body.getReader();
    const trozos = []; let n = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; trozos.push(value); n += value.length; if (n > max) { ac.abort(); break; } }
    return { texto: Buffer.concat(trozos.map((x) => Buffer.from(x))).toString("utf8"), url: r.url, tipo: r.headers.get("content-type") || "" };
  } finally { clearTimeout(t); }
}
const desentidad = (s) => String(s || "").replace(/&mdash;/g, "—").replace(/&ndash;/g, "–").replace(/&hellip;/g, "…").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/\s+/g, " ").trim();

export async function metadatos(url) {
  if (!/^https?:\/\//i.test(url || "")) throw new Error("El enlace tiene que empezar por http");
  const host = dominio(url) || "";
  if (/^(x|twitter)\.com$/.test(host) && /\/status\/\d+/.test(url)) {
    const r = await traer(`https://publish.twitter.com/oembed?omit_script=1&dnt=true&url=${encodeURIComponent(url)}`);
    const j = JSON.parse(r.texto);
    const texto = desentidad(String(j.html || "").replace(/<a [^>]*>(pic\.twitter\.com[^<]*)<\/a>/g, "").replace(/<[^>]+>/g, " ")).replace(/—\s*[^—]*$/, "").trim();
    return { titulo: `${j.author_name} en X`, descripcion: texto.slice(0, 400), imagen: null, sitio: "X", autor: j.author_name || null };
  }
  const r = await traer(url);
  if (/^image\//.test(r.tipo)) return { titulo: null, descripcion: null, imagen: r.url, sitio: host };
  const h = r.texto.slice(0, 400000);
  const meta = (...nombres) => {
    for (const n of nombres) {
      const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*content=["']([^"']*)["']`, "i");
      const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${n}["']`, "i");
      const m = re1.exec(h) || re2.exec(h);
      if (m && m[1].trim()) return desentidad(m[1]);
    }
    return null;
  };
  const abs = (u) => { try { return u ? new URL(u, r.url).href : null; } catch { return null; } };
  const titulo = meta("og:title", "twitter:title") || desentidad((/<title[^>]*>([^<]*)<\/title>/i.exec(h) || [])[1]) || null;
  return {
    titulo, descripcion: (meta("og:description", "twitter:description", "description") || "").slice(0, 400) || null,
    imagen: abs(meta("og:image", "og:image:url", "twitter:image", "twitter:image:src")), sitio: meta("og:site_name") || host,
  };
}

async function descargarImagen(u, id) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 10000);
  try {
    const r = await fetch(u, { headers: { "User-Agent": UA }, redirect: "follow", signal: ac.signal });
    const tipo = r.headers.get("content-type") || "";
    if (!r.ok || !/^image\/(png|jpe?g|webp|gif|avif)/.test(tipo)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 8e6) return null;
    const ext = { "image/png": ".png", "image/jpeg": ".jpg", "image/jpg": ".jpg", "image/webp": ".webp", "image/gif": ".gif", "image/avif": ".avif" }[tipo.split(";")[0]] || ".jpg";
    fs.mkdirSync(path.join(ROOT, SUBIDAS), { recursive: true });
    const ruta = `${SUBIDAS}/${id}-vista${ext}`;
    fs.writeFileSync(path.join(ROOT, ruta), buf);
    return ruta;
  } finally { clearTimeout(t); }
}

const limpiarEtiquetas = (e) => [...new Set((Array.isArray(e) ? e : String(e || "").split(",")).map((x) => String(x).trim().toLowerCase()).filter(Boolean))].slice(0, 12);

export function editar(id, patch) {
  const d = cargar();
  const r = (d.items || []).find((x) => x.id === id);
  if (!r) throw new Error("No existe");
  if ("titulo" in patch) r.titulo = String(patch.titulo || "").trim() || r.titulo;
  if ("notas" in patch) r.notas = String(patch.notas || "").trim();
  if ("etiquetas" in patch) r.etiquetas = limpiarEtiquetas(patch.etiquetas);
  if (Array.isArray(patch.anadirEtiquetas)) r.etiquetas = limpiarEtiquetas([...(r.etiquetas || []), ...patch.anadirEtiquetas]);
  guardar(d);
  return r;
}

// Valoración de 0 a 5 de cualquier referencia (también las de posts.design, sin tener que guardarlas como tuyas).
export function valorar(id, n) {
  const v = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
  if (!referencias().some((x) => x.id === id)) throw new Error("No existe");
  const d = cargar();
  d.valoraciones = { ...(d.valoraciones || {}) };
  if (v) d.valoraciones[id] = v; else delete d.valoraciones[id];
  guardar(d);
  return v;
}

// Junta dos referencias tuyas casi iguales: se queda la más antigua, suma etiquetas y notas y la mejor valoración.
// La otra sale de la lista (su archivo se queda en disco, como al quitar).
export function fusionar(idQueda, idSale) {
  if (idQueda === idSale) throw new Error("Es la misma");
  const d = cargar();
  const a = (d.items || []).find((x) => x.id === idQueda);
  const b = (d.items || []).find((x) => x.id === idSale);
  if (!a || !b) throw new Error("Solo se fusionan referencias tuyas");
  a.etiquetas = limpiarEtiquetas([...(a.etiquetas || []), ...(b.etiquetas || [])]);
  a.notas = [a.notas, b.notas].filter(Boolean).filter((x, i, l) => l.indexOf(x) === i).join("\n\n");
  if (!a.url && b.url) a.url = b.url;
  if (!a.archivo && b.archivo) a.archivo = b.archivo;
  const val = d.valoraciones || {};
  const mejor = Math.max(val[a.id] || 0, val[b.id] || 0);
  if (mejor) val[a.id] = mejor;
  delete val[b.id];
  d.valoraciones = val;
  d.items = d.items.filter((x) => x.id !== b.id);
  guardar(d);
  return a;
}

// Vistas guardadas: una combinación de búsqueda, fuente, etiquetas, color y orden con nombre.
const CAMPOS_VISTA = ["q", "fuente", "tp", "tags", "color", "orden", "diseno"];
export function guardarVista({ nombre, params }) {
  const n = String(nombre || "").trim().slice(0, 40);
  if (!n) throw new Error("Ponle un nombre");
  const p = Object.fromEntries(CAMPOS_VISTA.map((k) => [k, params && params[k] ? String(params[k]).slice(0, 200) : null]).filter(([, v]) => v));
  const d = cargar();
  const v = { id: `vista-${Date.now().toString(36)}`, nombre: n, params: p };
  d.vistas = [...(d.vistas || []).filter((x) => x.nombre.toLowerCase() !== n.toLowerCase()), v];
  guardar(d);
  return v;
}
export function quitarVista(id) {
  const d = cargar();
  d.vistas = (d.vistas || []).filter((x) => x.id !== id);
  guardar(d);
}

// Quita la entrada de la lista. El archivo subido se queda en media/referencias/subidas/ (no se borra nada del disco).
export function quitar(id) {
  const d = cargar();
  const antes = (d.items || []).length;
  d.items = (d.items || []).filter((x) => x.id !== id);
  if (d.items.length === antes) throw new Error("No existe");
  guardar(d);
}

// Guarda un posts.design ya descargado en la lista propia, para poder anotarlo y etiquetarlo.
export function fijar(id, notas) {
  const d = cargar();
  const pd = postsDesign().map((r) => anotar(r, (d.anotaciones || {})[r.id])).find((x) => x.id === id);
  if (!pd) throw new Error("No existe");
  const item = { id: `ref-${Date.now().toString(36)}`, creado: hoyLocal(), titulo: pd.titulo, url: pd.url, archivo: pd.archivo, galeria: pd.galeria, thumb: pd.thumb, tipo_post: pd.tipo_post, notas: [pd.notas, String(notas || "").trim()].filter(Boolean).join("\n\n"), etiquetas: limpiarEtiquetas(["posts.design", ...(pd.etiquetas || [])]) };
  d.items = [item, ...(d.items || [])];
  guardar(d);
  return item;
}
