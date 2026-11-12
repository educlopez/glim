// Reconciliación repo ⇄ Buffer. Buffer es la verdad para todo lo que está programado, enviado o en error; el repo
// la refleja tras cada sincronización, sin intervención:
//   1. Cada post de Buffer pertenece a un borrador. Se enlaza por el id del campo buffer: o por el texto; si no hay
//      borrador, se crea uno (origen: buffer). Las piezas de varias redes creadas a la vez van juntas.
//   2. En un borrador enlazado mandan Buffer: estado, programado_para, publicado_el, publicado_url y los ids.
//   3. Un borrador «programado» cuyo post ya no está en Buffer vuelve a «pendiente-ok», con nota.
//   4. El calendario del cerebro (rutas.calendario) se reescribe entre las marcas <!-- panel:inicio --> y <!-- panel:fin -->.
// Solo lee Buffer: nunca crea, edita ni programa nada allí (reglas 1 y 2). Solo escribe un archivo si cambia.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./repo.js";
import { cfg, rutas, enZona } from "./cerebro.js";

const DIR = path.join(ROOT, rutas.borradores);
const CAL = rutas.calendario ? path.join(ROOT, rutas.calendario) : null;
const RED = { twitter: "X", threads: "Threads", linkedin: "LinkedIn" };
const ORDEN_RED = ["X", "Threads", "LinkedIn"];
// Solo se importan como borrador los posts de Buffer desde esta fecha (integraciones.buffer.importarDesde). Lo anterior
// sigue en Buffer pero no entra en el repo; los borradores ya existentes se igualan siempre, sean de cuando sean.
export const IMPORTAR_DESDE = (cfg.integraciones.buffer && cfg.integraciones.buffer.importarDesde) || "2026-01-01";
const ESTADO_DE = { sent: "publicado", scheduled: "programado", sending: "programado", error: "programado", draft: "pendiente-ok", needs_approval: "pendiente-ok" };

const madrid = enZona;
const normal = (t) => String(t || "").replace(/https?:\/\/\S+/g, " ").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const idsDe = (s) => String(s || "").match(/\b[0-9a-f]{24}\b/g) || [];

// ---- Frontmatter por líneas (no reordena ni toca lo que no cambia) ----
function abrir(f) {
  const abs = path.join(DIR, f);
  const texto = fs.readFileSync(abs, "utf8");
  const lineas = texto.split("\n");
  if (lineas[0] !== "---") return null;
  let fin = lineas.indexOf("---", 1);
  if (fin < 0) return null;
  const doc = {
    f, abs, original: texto, lineas,
    get fin() { return fin; },
    campo(k) { const l = lineas.slice(1, fin).find((x) => x.startsWith(`${k}:`)); return l ? l.slice(k.length + 1).trim() : ""; },
    poner(k, v, despuesDe) {
      const i = lineas.slice(1, fin).findIndex((l) => l.startsWith(`${k}:`));
      if (i >= 0) { lineas[i + 1] = `${k}: ${v}`; return; }
      const j = despuesDe ? lineas.slice(1, fin).findIndex((l) => l.startsWith(`${despuesDe}:`)) : -1;
      lineas.splice(j >= 0 ? j + 2 : fin, 0, `${k}: ${v}`);
      fin += 1;
    },
    cuerpo() { return lineas.slice(fin + 1).join("\n").replace(/<!--[\s\S]*?-->/g, ""); },
    guardar() { const n = lineas.join("\n"); if (n !== texto) { fs.writeFileSync(abs, n); return true; } return false; },
  };
  return doc;
}

const nota = (doc, marca) => {
  const n = doc.campo("nota_estado");
  if (n.startsWith(marca)) return;
  doc.poner("nota_estado", n ? `${marca}. Antes: ${n.replace(/^(sincronizado con Buffer|publicado según Buffer)[^.]*\.\s*(Antes:\s*)?/, "")}` : marca, "estado");
};

// ---- Agrupar posts de Buffer en piezas: misma tanda (creados con ≤3 min) y salida con ≤45 min, redes distintas ----
function agrupar(posts) {
  const orden = [...posts].sort((a, b) => (a.creado || "").localeCompare(b.creado || ""));
  const grupos = [];
  for (const p of orden) {
    const t = new Date(p.creado || 0).getTime();
    const d = new Date(p.dueAt || p.sentAt || p.creado || 0).getTime();
    const g = grupos.find((x) => Math.abs(x.t - t) <= 3 * 60e3 && Math.abs(x.d - d) <= 45 * 60e3 && !x.posts.some((y) => y.servicio === p.servicio));
    if (g) g.posts.push(p); else grupos.push({ t, d, posts: [p] });
  }
  return grupos.map((g) => g.posts.sort((a, b) => ORDEN_RED.indexOf(RED[a.servicio]) - ORDEN_RED.indexOf(RED[b.servicio])));
}

const idioma = (t) => (/\b(el|la|los|las|que|una|para|con|del|por|es|está|cómo)\b/i.test(t) && (t.match(/\b(el|la|los|las|que|una|para|con|del|por)\b/gi) || []).length >= 3 ? "es" : "en");
const slug = (t) => normal(t).split(" ").filter((w) => w.length > 2).slice(0, 6).join("-").slice(0, 60) || "post";

function estadoGrupo(posts) {
  const e = posts.map((p) => ESTADO_DE[p.estado] || "pendiente-ok");
  if (e.every((x) => x === "publicado")) return "publicado";
  if (e.includes("programado") || e.includes("publicado")) return "programado";
  return "pendiente-ok";
}

// Campos que Buffer dicta en un borrador enlazado.
function aplicarBuffer(doc, posts, hoy) {
  const conRed = posts.map((p) => ({ ...p, red: RED[p.servicio] || p.servicio, m: madrid(p.sentAt || p.dueAt || p.creado) })).sort((a, b) => (a.sentAt || a.dueAt || "").localeCompare(b.sentAt || b.dueAt || ""));
  const est = estadoGrupo(posts);
  const antes = doc.campo("estado").replace(/["']/g, "");
  // Un borrador descartado cuyo único rastro en Buffer es un borrador de Buffer se queda descartado.
  if (antes !== est && !(antes === "descartado" && est === "pendiente-ok")) {
    doc.poner("estado", est);
    nota(doc, est === "publicado" ? `publicado según Buffer el ${conRed[0].m.dia} (marcado por el panel)` : `sincronizado con Buffer el ${hoy}: ${est}`);
  }
  const programados = conRed.filter((p) => ["scheduled", "sending", "error"].includes(p.estado) || p.estado === "sent");
  if (programados.length) doc.poner("programado_para", programados.map((p) => `${p.m.dia} ${p.m.hora} (${p.red})`).join(" · "), "nota_estado");
  const enviados = conRed.filter((p) => p.estado === "sent");
  if (enviados.length) {
    doc.poner("publicado_el", `${enviados[0].m.dia} ${enviados[0].m.hora} (Madrid, vía Buffer)`, "programado_para");
    const actual = doc.campo("publicado_url");
    const urls = enviados.map((p) => (p.enlace ? `${p.enlace} (${p.red}, ${p.m.hora})` : `sin enlace en Buffer (${p.red}, ${p.m.hora})`));
    const faltan = urls.filter((u) => !actual.includes(u.split(" ")[0]));
    if (!actual || /^#/.test(actual)) doc.poner("publicado_url", urls.join(" · "), "publicado_el");
    else if (faltan.length && enviados.every((p) => p.enlace)) doc.poner("publicado_url", `${actual} · ${faltan.join(" · ")}`, "publicado_el");
  }
  // Forma canónica: id (red, estado en Buffer) por pieza. Siempre igual a lo que dice Buffer.
  doc.poner("buffer", conRed.map((p) => `${p.id} (${p.red}, ${p.estado}${p.estado === "error" && p.error ? `: ${p.error.replace(/[·#]/g, " ").slice(0, 80)}` : ""})`).join(" · "), "media");
}

function crearBorrador(grupo, hoy) {
  const p0 = grupo[0];
  const m = madrid(p0.dueAt || p0.sentAt || p0.creado);
  const redes = [...new Set(grupo.map((p) => RED[p.servicio] || p.servicio))];
  const nombre = `${m.dia}-${redes.map((r) => r.toLowerCase()).join("-")}-${slug(p0.texto)}.md`;
  let f = nombre;
  for (let i = 2; fs.existsSync(path.join(DIR, f)); i++) f = nombre.replace(/\.md$/, `-${i}.md`);
  const est = estadoGrupo(grupo);
  const cuerpo = grupo.map((p) => `**${RED[p.servicio] || p.servicio}**\n\n${String(p.texto || "").trim()}\n`).join("\n");
  const fm = [
    "---", `red: ${redes.join(" + ")}`, `idioma: ${idioma(grupo.map((p) => p.texto).join(" "))}`, `estado: ${est}`,
    `nota_estado: importado de Buffer por el panel el ${hoy} (no tenía borrador en el repo)`,
    "programado_para:", "media: adjunto en Buffer (no está en el repo)", "buffer:", "origen: buffer", `creado: ${hoy}`, "---", "",
  ].join("\n");
  fs.writeFileSync(path.join(DIR, f), `${fm}${cuerpo}`);
  const doc = abrir(f);
  aplicarBuffer(doc, grupo, hoy);
  doc.poner("nota_estado", `importado de Buffer por el panel el ${hoy} (no tenía borrador en el repo)`);
  doc.guardar();
  return f;
}

// ---- Calendario ----
const INI = "<!-- panel:inicio -->";
const FIN = "<!-- panel:fin -->";
function calendario(docs, b) {
  if (!fs.existsSync(CAL)) return false;
  const porId = new Map(b.posts.map((x) => [x.id, x]));
  const prog = b.posts.filter((x) => ["scheduled", "sending", "error"].includes(x.estado)).sort((a, z) => (a.dueAt || "").localeCompare(z.dueAt || ""));
  const docDe = (id) => docs.find((d) => idsDe(d.campo("buffer")).includes(id));
  const filas = [];
  const vistos = new Set();
  for (const x of prog) {
    if (vistos.has(x.id)) continue;
    const d = docDe(x.id);
    const grupo = d ? idsDe(d.campo("buffer")).map((id) => porId.get(id)).filter((y) => y && ["scheduled", "sending", "error"].includes(y.estado)) : [x];
    grupo.forEach((y) => vistos.add(y.id));
    const m = madrid(grupo[0].dueAt);
    const horas = grupo.map((y) => madrid(y.dueAt).hora).join(" / ");
    const titulo = d ? (/^# (.+)$/m.exec(d.cuerpo()) || [])[1] || String(grupo[0].texto).split("\n")[0].slice(0, 70) : String(x.texto).split("\n")[0].slice(0, 70);
    filas.push(`| ${m.dia} ${horas} | ${grupo.map((y) => RED[y.servicio]).join(" + ")} | ${titulo.replace(/\|/g, "/")}${grupo.some((y) => y.estado === "error") ? " **(error en Buffer)**" : ""} | ${d ? `[${d.f}](../borradores/${d.f})` : "—"} | ${grupo.map((y) => y.id).join(" · ")} |`);
  }
  const pend = docs.filter((d) => d.campo("estado").replace(/["']/g, "") === "pendiente-ok");
  const bloque = [
    INI,
    "_Generado por el panel desde Buffer y `borradores/` en cada sincronización (la hora de la última, en el panel). No se edita a mano._",
    "",
    "## Programado",
    "",
    prog.length ? "| Fecha y hora | Red | Pieza | Borrador | Buffer |\n|---|---|---|---|---|\n" + filas.join("\n") : "Nada programado en Buffer.",
    "",
    "## Pendiente de OK de Edu",
    "",
    pend.length ? "| Red | Pieza | Borrador | Nota |\n|---|---|---|---|\n" + pend.map((d) => `| ${d.campo("red")} | ${((/^# (.+)$/m.exec(d.cuerpo()) || [])[1] || d.f).replace(/\|/g, "/")} | [${d.f}](../borradores/${d.f}) | ${d.campo("nota_estado").replace(/\|/g, "/").slice(0, 160)} |`).join("\n") : "Nada.",
    FIN,
  ].join("\n");
  const t = fs.readFileSync(CAL, "utf8");
  let n;
  if (t.includes(INI) && t.includes(FIN)) n = t.slice(0, t.indexOf(INI)) + bloque + t.slice(t.indexOf(FIN) + FIN.length);
  else {
    // Primera vez: sustituye las secciones a mano «Programado» y «Pendiente de OK de Edu».
    const a = t.indexOf("## Programado");
    const z = t.search(/\n## (?!Programado|Pendiente de OK)/);
    n = a >= 0 && z > a ? t.slice(0, a) + bloque + "\n" + t.slice(z) : `${t.trimEnd()}\n\n${bloque}\n`;
  }
  if (n !== t) { fs.writeFileSync(CAL, n); return true; }
  return false;
}

// ---- Entrada ----
export function reconciliar(b) {
  const r = { enlazados: 0, actualizados: [], creados: [], devueltos: [], calendario: false, avisos: [] };
  if (!b || !b.conectado || !b.completo || !b.posts) return { ...r, omitido: "sin una descarga completa de Buffer" };
  const hoy = madrid(new Date().toISOString()).dia;
  const canales = new Set((b.canales || []).map((c) => c.id));
  const porId = new Map(b.posts.map((x) => [x.id, x]));
  const docs = fs.readdirSync(DIR).filter((n) => n.endsWith(".md") && !n.startsWith("_")).map(abrir).filter(Boolean);
  const usados = new Set();
  const enlaces = new Map();
  // 1. Por id.
  for (const d of docs) {
    const ids = idsDe(d.campo("buffer")).filter((id) => !canales.has(id));
    const reales = ids.map((id) => porId.get(id)).filter(Boolean);
    reales.forEach((x) => usados.add(x.id));
    enlaces.set(d.f, { ids, reales });
  }
  // 2. Por texto, para los posts que ningún borrador cita.
  for (const d of docs) {
    const e = enlaces.get(d.f);
    const c = normal(d.cuerpo());
    if (c.length < 60) continue;
    for (const x of b.posts) {
      if (usados.has(x.id)) continue;
      const t = normal(x.texto);
      if (t.length >= 60 && c.includes(t.slice(0, Math.min(120, t.length)))) { e.reales.push(x); usados.add(x.id); }
    }
  }
  // 3. Aplicar Buffer a cada borrador enlazado; devolver los programados huérfanos.
  for (const d of docs) {
    const e = enlaces.get(d.f);
    const est = d.campo("estado").replace(/["']/g, "");
    if (e.reales.length) {
      r.enlazados++;
      aplicarBuffer(d, e.reales, hoy);
    } else if (est === "programado" && e.ids.length && e.ids.every((id) => !porId.has(id))) {
      d.poner("estado", "pendiente-ok");
      nota(d, `sincronizado con Buffer el ${hoy}: sus posts (${e.ids.join(", ")}) ya no están en Buffer; vuelve a pendiente`);
      r.devueltos.push(d.f);
    }
    if (d.guardar()) r.actualizados.push(d.f);
  }
  // 4. Importar lo que sigue sin borrador.
  const sueltos = b.posts.filter((x) => !usados.has(x.id) && madrid(x.dueAt || x.sentAt || x.creado).dia >= IMPORTAR_DESDE);
  for (const g of agrupar(sueltos)) {
    try { r.creados.push(crearBorrador(g, hoy)); } catch (e) { r.avisos.push(`No se pudo importar ${g.map((x) => x.id).join(", ")}: ${e.message}`); }
  }
  // 5. Calendario, con los borradores ya al día.
  const todos = fs.readdirSync(DIR).filter((n) => n.endsWith(".md") && !n.startsWith("_")).map(abrir).filter(Boolean);
  r.calendario = calendario(todos, b);
  r.cuando = new Date().toISOString();
  return r;
}
