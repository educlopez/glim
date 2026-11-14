// Convierte cada borradores/*.md en un post estructurado: texto por red, fecha, visual, Buffer, Drive y avisos.
import { medir } from "../src/lib/conteo.js";
import { read, ls, exists, isDir, readJson, frontmatter, kindOf } from "./repo.js";
import { rutas as rc, cfg as cfgCerebro } from "./cerebro.js";
import { parsear } from "./metricas.js";

const cfgTitulos = cfgCerebro.titulos;

export const ESTADOS = ["idea", "pendiente-ok", "programado", "publicado", "descartado"];
const MESES = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12 };
const pad = (n) => String(n).padStart(2, "0");

function fechaDe(v) {
  if (!v) return null;
  let m = /(\d{4})-(\d{2})-(\d{2})(?:[ T]+(\d{1,2}):(\d{2}))?/.exec(v);
  if (m) return { dia: `${m[1]}-${m[2]}-${m[3]}`, hora: m[4] ? `${pad(m[4])}:${m[5]}` : null };
  m = /(\d{1,2})-(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[a-z]*-(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/i.exec(v);
  if (m) return { dia: `${m[3]}-${pad(MESES[m[2].toLowerCase()])}-${pad(m[1])}`, hora: m[4] ? `${pad(m[4])}:${m[5]}` : null };
  return null;
}

const estadoDe = (v) => {
  const e = String(v || "").trim().split(/[\s(·,]/)[0].toLowerCase();
  return ESTADOS.includes(e) ? e : "sin-estado";
};

function redesDe(v, nombre) {
  const s = String(v || "");
  const out = [];
  if (/\bX\b/.test(s)) out.push("X");
  if (/threads/i.test(s)) out.push("Threads");
  if (/linkedin/i.test(s)) out.push("LinkedIn");
  if (out.length) return out;
  return [/-linkedin-/.test(nombre) ? "LinkedIn" : /-threads-/.test(nombre) ? "Threads" : "X"];
}

// El nombre de archivo va sin tildes ni mayúsculas; esto lo deja legible como título.
// Las palabras propias del cerebro (nombres de proyectos, tildes) vienen de glim.config.json → titulos.
const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NOMBRES = [
  ...Object.entries(cfgTitulos).map(([de, a]) => [new RegExp(`\\b${escapar(de.toLowerCase())}\\b`, "g"), a]),
  [/ v(\d)/g, " v$1"], [/(\d) (\d)/g, "$1 · $2"],
];

const RED = { x: "X", threads: "Threads", linkedin: "LinkedIn" };
const SECCION = /^\*\*\s*(X|Threads|LinkedIn)\b[^*]*\*\*\s*$/i;

// Un hilo de X se escribe «1/ …», «2/ …».
function hiloDe(t) {
  const parts = t.split(/\n+(?=\d+\/\s)/);
  return parts.length > 1 ? parts.map((s) => s.replace(/^\d+\/\s*/, "").trim()) : null;
}

function piezasDe(body, redes) {
  const notas = [];
  const limpio = body.replace(/<!--([\s\S]*?)-->/g, (_, c) => { if (c.trim()) notas.push(c.trim()); return ""; }).trim();
  const piezas = [];
  let cur = null;
  for (const line of limpio.split("\n")) {
    const m = SECCION.exec(line.trim());
    if (m) { cur = { red: RED[m[1].toLowerCase()], etiqueta: line.replace(/\*/g, "").trim(), lineas: [] }; piezas.push(cur); continue; }
    if (!cur) { cur = { red: redes[0], etiqueta: redes[0], lineas: [] }; piezas.push(cur); }
    cur.lineas.push(line);
  }
  return {
    notas,
    piezas: piezas.map((p) => {
      const texto = p.lineas.join("\n").trim();
      return { red: p.red, etiqueta: p.etiqueta, texto, hilo: p.red === "X" ? hiloDe(texto) : null, caracteres: [...texto].length };
    }).filter((p) => p.texto),
  };
}

function visualDe(fm) {
  const media = fm.media || "";
  const rutas = (media.match(/media\/[^\s·()]+/g) || []).map((r) => r.replace(/[.,;:]+$/, "").replace(/\/$/, ""));
  const pj = (/(plantillas\/carrusel\/series\/\S+\.json)/.exec(fm.plantilla || "") || [])[1];
  if (pj) { const c = readJson(pj); if (c && c.slug) rutas.push(`${rc.mediaCarruseles || `${rc.media}/carruseles`}/${c.slug}`); }
  let tipo = null;
  let archivos = [];
  const falta = [];
  for (const rel of [...new Set(rutas)]) {
    if (!exists(rel)) { falta.push(rel); continue; }
    if (isDir(rel)) {
      const slides = ls(rel).map((d) => d.name).filter((n) => /^slide-\d+\.(png|jpe?g)$/.test(n)).sort().map((n) => `${rel}/${n}`);
      if (slides.length) { tipo = "carrusel"; archivos = slides; break; }
    } else if (!archivos.includes(rel)) { archivos.push(rel); tipo = tipo || kindOf(rel); }
  }
  const drive = /pendiente/i.test(media) && /drive/i.test(media) ? "pendiente" : /drive/i.test(media) && /\bid/i.test(media) ? "subido" : "no";
  return { tipo, archivos, falta, drive, formato: fm.formato || null, descripcion: media || null, alt: fm.alt_text_media || null };
}

// Id de la plantilla del visual: `plantilla:` (id o ruta a un JSON/carpeta) u `origen_visual: plantilla:<id>`.
export function plantillaDe(fm) {
  const o = /plantilla:\s*([\w.-]+)/.exec(fm.origen_visual || "");
  if (o) return o[1];
  const p = String(fm.plantilla || "").trim().split(/\s/)[0];
  if (!p) return null;
  return p.replace(/\/$/, "").split("/").pop().replace(/\.(json|md|html)$/, "") || null;
}

function bufferDe(v) {
  const s = String(v || "");
  const ids = s.match(/\b[0-9a-f]{24}\b/g) || [];
  const estado = /sent|enviad/i.test(s) ? "enviado" : /scheduled|programad/i.test(s) ? "programado" : /draft|borrador/i.test(s) ? "borrador" : ids.length ? "anotado" : "no";
  return { estado, ids, texto: s || null };
}

function fechaPost(fm, estado, nombre) {
  const prog = fm.programado_para || "";
  let f = fechaDe(fm.publicado_el);
  if (f) return { ...f, tipo: "publicado" };
  f = fechaDe(prog);
  if (f) return { ...f, tipo: /^#|propuesta/i.test(prog.trim()) ? "propuesta" : estado === "publicado" ? "publicado" : "programado" };
  if (estado === "publicado") return { dia: nombre.slice(0, 10), hora: null, tipo: "publicado" };
  return null;
}

function avisosDe(p, hoy) {
  const a = [];
  const vivo = ["pendiente-ok", "programado"].includes(p.estado);
  if (p.estado === "programado" && p.fecha && p.fecha.dia < hoy) a.push({ nivel: "alto", texto: "La fecha ya pasó y sigue como programado. ¿Se publicó?" });
  if (p.estado === "pendiente-ok" && p.fecha && p.fecha.tipo === "propuesta" && p.fecha.dia < hoy) a.push({ nivel: "medio", texto: "La fecha propuesta ya pasó. Hay que proponer otra." });
  if (vivo && p.origen !== "buffer" && !p.visual.archivos.length && !p.visual.falta.length) a.push({ nivel: "alto", texto: "Sin visual. Un post final lleva vídeo, imagen o carrusel (regla 22)." });
  if (vivo && p.visual.drive === "pendiente") a.push({ nivel: "medio", texto: "El medio no está subido a Drive todavía." });
  if (p.visual.falta.length) a.push({ nivel: "bajo", texto: "El medio citado no está en este equipo (media/ no se versiona)." });
  if (vivo && p.origen !== "buffer" && p.buffer.estado === "no") a.push({ nivel: "bajo", texto: "Sin borrador en Buffer." });
  // Límite de caracteres contado como cada red (en X, enlace = 23 y emoji = 2).
  if (p.estado !== "publicado" && p.estado !== "descartado") {
    for (const pz of p.piezas) {
      (pz.hilo || [pz.texto]).forEach((t, i, all) => {
        const m = medir(t, pz.red);
        if (m.nivel === "pasa") a.push({ nivel: "alto", texto: `${pz.red}${all.length > 1 ? ` (parte ${i + 1})` : ""}: ${m.n} de ${m.limite} caracteres, sobran ${-m.sobra}.` });
      });
    }
  }
  return a;
}

export function posts(hoy) {
  return ls(rc.borradores).filter((d) => d.name.endsWith(".md") && !d.name.startsWith("_")).map((d) => {
    const path = `${rc.borradores}/${d.name}`;
    const nombre = d.name.replace(/\.md$/, "");
    const { fm, body } = frontmatter(read(path));
    const estado = estadoDe(fm.estado);
    const redes = redesDe(fm.red, nombre);
    const { piezas, notas } = piezasDe(body, redes);
    const slug = nombre.slice(11).replace(/^(x-threads|linkedin|threads|x)-/, "");
    let titulo = slug.replace(/-/g, " ");
    for (const [a, b] of NOMBRES) titulo = titulo.replace(a, b);
    titulo = titulo.replace(/^./, (c) => c.toUpperCase());
    const p = {
      id: nombre,
      path,
      titulo,
      redes,
      idioma: fm.idioma || null,
      estado,
      notaEstado: fm.nota_estado || null,
      fecha: fechaPost(fm, estado, nombre),
      piezas,
      notas,
      visual: visualDe(fm),
      buffer: bufferDe(fm.buffer),
      publicado: (String(fm.publicado_url || "").match(/https?:\/\/[^\s)·]+/g) || []),
      metricas: fm.metricas || null,
      // Fotos fijas que escribe la reconciliación con Buffer (metricas.js): { redes: { X: {...} }, tomadas }.
      instantaneas: { "48h": parsear(fm.metricas_48h), "7d": parsear(fm.metricas_7d) },
      plantilla: plantillaDe(fm),
      checklist: fm.checklist || null,
      fuente: fm.fuente || null,
      repo: fm.repo || null,
      caracteres: fm.caracteres || null,
      primerComentario: fm.primer_comentario || null,
      enlacesCortos: /^s[ií]/i.test(fm.enlaces_cortos || "") ? true : /^no/i.test(fm.enlaces_cortos || "") ? false : null,
      creado: fm.creado || null,
      origen: fm.origen || null,
    };
    p.avisos = avisosDe(p, hoy);
    return p;
  }).sort((a, b) => (b.fecha?.dia || b.id).localeCompare(a.fecha?.dia || a.id));
}
