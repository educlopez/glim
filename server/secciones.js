// Secciones propias del cerebro: cada persona añade las que necesita (por ejemplo «OG animadas» o «Ideas») sin tocar
// el código de Glim. Se declaran en glim.config.json → secciones y Glim las pinta con cuatro plantillas genéricas:
//   - galeria: archivos de una carpeta (imágenes, vídeos, HTML) en rejilla.
//   - lista: una fila por elemento (un .md con frontmatter por elemento, o un JSON con un array) con sus campos.
//   - tablero: la lista agrupada en columnas por un campo (estado, red…).
//   - documento: un solo Markdown.
// El archivo se relee en cada petición: lo que cambie el agente de «Personalizar» se ve sin reiniciar. Solo se lee
// (nunca se ejecuta) y todo pasa por safe(): nada fuera del repo ni en las rutas privadas.
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ROOT, CONFIG } from "./cerebro.js";
import { safe, walk, read, readJson, frontmatter, firstHeading, mtime, kindOf, isDir } from "./repo.js";

export const TIPOS = ["galeria", "lista", "tablero", "documento"];
export const GRUPOS = ["trabajo", "contenido", "plantillas", "conocimiento", "tuyas"];
// Iconos que puede pedir una sección (nombres de lucide). Fuera de la lista: una carpeta.
export const ICONOS = ["folder", "image", "images", "film", "video", "share-2", "palette", "layout-template", "book-open", "file-text", "lightbulb", "star", "bookmark", "tag", "calendar", "list", "table", "kanban", "link", "mic", "music", "sparkles", "megaphone", "users", "box"];

const rel = z.string().min(1).max(200).refine((s) => !path.isAbsolute(s) && !s.split("/").includes(".."), "ruta relativa dentro del cerebro");

export const Seccion = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, "id en minúsculas con guiones (og-animadas)"),
  titulo: z.string().min(1).max(40),
  descripcion: z.string().max(200).optional(),
  icono: z.string().max(30).default("folder"),
  grupo: z.enum(GRUPOS).default("tuyas"),
  tipo: z.enum(TIPOS),
  // galeria y lista/tablero de archivos .md: la carpeta; documento y lista/tablero de JSON: el archivo.
  carpeta: rel.optional(),
  archivo: rel.optional(),
  // JSON: si el array no es la raíz, la clave donde está (p. ej. "plantillas").
  clave: z.string().max(40).optional(),
  // galeria: extensiones que entran (sin punto). Por defecto imágenes, vídeos y HTML.
  extensiones: z.array(z.string().regex(/^[a-z0-9]{1,6}$/)).max(12).optional(),
  profundidad: z.number().int().min(0).max(4).default(2),
  // lista y tablero: campos que se enseñan (frontmatter o claves del JSON) y campo del título.
  campos: z.array(z.string().max(40)).max(8).default([]),
  campoTitulo: z.string().max(40).optional(),
  // tablero: campo que agrupa en columnas y, si se quiere, el orden de las columnas.
  agruparPor: z.string().max(40).optional(),
  columnas: z.array(z.string().max(40)).max(12).optional(),
}).superRefine((s, ctx) => {
  if (s.tipo === "galeria" && !s.carpeta) ctx.addIssue({ code: "custom", message: "una galería necesita «carpeta»" });
  if (s.tipo === "documento" && !s.archivo) ctx.addIssue({ code: "custom", message: "un documento necesita «archivo»" });
  if ((s.tipo === "lista" || s.tipo === "tablero") && !s.carpeta && !s.archivo) ctx.addIssue({ code: "custom", message: "una lista necesita «carpeta» (con .md) o «archivo» (JSON)" });
  if (s.tipo === "tablero" && !s.agruparPor) ctx.addIssue({ code: "custom", message: "un tablero necesita «agruparPor»" });
});

const GALERIA = ["png", "jpg", "jpeg", "gif", "webp", "svg", "mp4", "webm", "mov", "html"];

// Lee y valida las secciones del glim.config.json actual. Las que fallan no rompen las demás: van a «errores».
export function leer() {
  let crudo = [];
  try { crudo = JSON.parse(fs.readFileSync(path.join(ROOT, CONFIG), "utf8")).secciones || []; } catch { return { secciones: [], errores: [] }; }
  if (!Array.isArray(crudo)) return { secciones: [], errores: [{ id: null, error: "«secciones» tiene que ser una lista" }] };
  const secciones = [];
  const errores = [];
  const vistos = new Set();
  for (const s of crudo) {
    const r = Seccion.safeParse(s);
    if (!r.success) { errores.push({ id: (s && s.id) || null, error: r.error.issues.map((i) => `${i.path.join(".") || "sección"}: ${i.message}`).join("; ") }); continue; }
    if (vistos.has(r.data.id)) { errores.push({ id: r.data.id, error: "id repetido" }); continue; }
    vistos.add(r.data.id);
    secciones.push({ ...r.data, icono: ICONOS.includes(r.data.icono) ? r.data.icono : "folder" });
  }
  return { secciones, errores };
}

const ruta = (p) => { const s = p && safe(p); return s ? s.rel : null; };

function archivos(s) {
  const base = ruta(s.carpeta);
  if (!base || !isDir(base)) return [];
  const ext = new Set(s.tipo === "galeria" ? s.extensiones || GALERIA : ["md"]);
  return walk(base, (p) => ext.has(path.extname(p).slice(1).toLowerCase()), s.profundidad).sort((a, b) => mtime(b) - mtime(a)).slice(0, 400);
}

const texto = (v) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v)).slice(0, 300);

function filas(s) {
  if (s.archivo) {
    const p = ruta(s.archivo);
    const j = p ? readJson(p) : null;
    const arr = Array.isArray(j) ? j : j && s.clave && Array.isArray(j[s.clave]) ? j[s.clave] : [];
    return arr.slice(0, 500).filter((x) => x && typeof x === "object").map((x, i) => {
      const titulo = texto(x[s.campoTitulo || "titulo"] || x.nombre || x.title || x.id || `#${i + 1}`);
      return { id: String(x.id || i), titulo, path: p, campos: Object.fromEntries(s.campos.map((c) => [c, texto(x[c])])), grupo: s.agruparPor ? texto(x[s.agruparPor]) : null };
    });
  }
  return archivos(s).map((p) => {
    const { fm, body } = frontmatter(read(p) || "");
    const titulo = texto(fm[s.campoTitulo || "titulo"] || fm.title || firstHeading(body, path.basename(p, ".md")));
    return { id: p, titulo, path: p, campos: Object.fromEntries(s.campos.map((c) => [c, texto(fm[c])])), grupo: s.agruparPor ? texto(fm[s.agruparPor]) : null, mtime: mtime(p) };
  });
}

// Contenido de una sección para su vista.
export function contenido(id) {
  const s = leer().secciones.find((x) => x.id === id);
  if (!s) throw Object.assign(new Error("No existe esa sección"), { code: 404 });
  if (s.tipo === "galeria") return { seccion: s, items: archivos(s).map((p) => ({ path: p, nombre: path.basename(p), tipo: p.endsWith(".html") ? "html" : kindOf(p), mtime: mtime(p) })) };
  if (s.tipo === "documento") { const p = ruta(s.archivo); return { seccion: s, documento: p ? { path: p, texto: read(p) } : null }; }
  const items = filas(s);
  if (s.tipo === "tablero") {
    const orden = s.columnas && s.columnas.length ? s.columnas : [...new Set(items.map((x) => x.grupo || ""))];
    return { seccion: s, columnas: orden.map((c) => ({ id: c, items: items.filter((x) => (x.grupo || "") === c) })), sinColumna: items.filter((x) => !orden.includes(x.grupo || "")) };
  }
  return { seccion: s, items };
}

// Cuántos elementos tiene cada sección, para el número del menú (barato: sin leer el contenido de los .md).
export function resumen() {
  const { secciones, errores } = leer();
  return {
    secciones: secciones.map((s) => {
      let n = null;
      try {
        if (s.tipo === "galeria" || (s.carpeta && !s.archivo && s.tipo !== "documento")) n = archivos(s).length;
        else if (s.archivo && s.tipo !== "documento") { const j = readJson(ruta(s.archivo)); n = (Array.isArray(j) ? j : (j && s.clave && j[s.clave]) || []).length; }
      } catch { n = null; }
      return { id: s.id, titulo: s.titulo, icono: s.icono, grupo: s.grupo, tipo: s.tipo, descripcion: s.descripcion || null, n };
    }),
    errores,
  };
}

// Para el prompt del agente de «Personalizar»: qué hay ahora y cómo se escribe una sección.
export function guiaAgente() {
  const { secciones, errores } = leer();
  return [
    `Las secciones propias van en ${CONFIG} → "secciones" (un array). Formato de cada una:`,
    "```json",
    JSON.stringify({ id: "og-animadas", titulo: "OG animadas", descripcion: "Previews animadas de mis webs", icono: "share-2", grupo: "plantillas", tipo: "galeria", carpeta: "plantillas/og-animada", extensiones: ["mp4", "png", "html"], profundidad: 2 }, null, 2),
    "```",
    `- tipo: ${TIPOS.join(" | ")}. galeria pide "carpeta" (y opcional "extensiones" sin punto, "profundidad" 0-4). documento pide "archivo" (.md).`,
    '- lista y tablero: "carpeta" con un .md por elemento (frontmatter `clave: valor`) o "archivo" JSON con un array (o "clave" si el array no es la raíz). "campos" = columnas a enseñar; "campoTitulo" = campo del título.',
    '- tablero pide además "agruparPor" (un campo) y, si quieres fijar el orden, "columnas".',
    `- grupo (dónde sale en el menú): ${GRUPOS.join(" | ")} ("tuyas" por defecto). icono, uno de: ${ICONOS.join(", ")}.`,
    "- id: minúsculas y guiones, único. titulo: corto (máx. 40).",
    secciones.length ? `Secciones que ya hay: ${secciones.map((s) => `${s.id} (${s.tipo}, ${s.carpeta || s.archivo})`).join("; ")}.` : "Todavía no hay ninguna sección propia.",
    errores.length ? `Secciones con errores ahora mismo (arréglalas si te lo piden o si tocas esa parte): ${errores.map((e) => `${e.id || "?"}: ${e.error}`).join("; ")}.` : null,
  ].filter(Boolean).join("\n");
}
