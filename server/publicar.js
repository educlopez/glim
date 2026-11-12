// «Publicar cambios»: lo que la persona pulsa en Moss para subir lo que hay en local en el cerebro (suyo o de los
// encargos). Cada pulsación es su OK para esa publicación; un agente nunca la lanza.
//   1. Cambios: qué hay sin subir, agrupado por zona (prefijos de moss.config.json).
//   2. Seguridad: secretos, rutas privadas o prohibidas, el correo de git y archivos grandes. Bloquea.
//   3. Comprobaciones: JSON válido, node --check y py_compile de lo que cambia.
//   4. Redacción: la IA escribe el commit (con prefijo). Plan B sin IA.
//   5. Rama moss/<fecha>-<tema>, commit y push.  6. PR a la rama principal.
//   7. Revisión de la IA contra las reglas del cerebro, como comentario en la PR. Si bloquea, la PR queda en borrador.
//   8. CI de GitHub (si hay).  9. Espera cancelable.  10. Fusión (squash), vuelta a la rama principal y limpieza.
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { ROOT } from "./repo.js";
import { cfg, ESTADO, horaCorta } from "./cerebro.js";
import { ajustes } from "./ajustes.js";
import * as claude from "./claude.js";
import { ocupado as encargoEnCurso } from "./encargos.js";

const F = path.join(ESTADO, "publicacion.json");
const HIST = path.join(ESTADO, "publicaciones.json");
const PUB = cfg.publicar;
const P = cfg.persona;
const run = (cmd, args, { timeout = 120000, cwd = ROOT, input } = {}) => new Promise((resolve) => {
  const p = execFile(cmd, args, { cwd, timeout, maxBuffer: 50e6, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } }, (err, out, e) => resolve({ ok: !err, out: String(out || "").trim(), err: String(e || err?.message || "").trim() }));
  if (input !== undefined) p.stdin.end(input);
});
const git = (args, o) => run("git", args, o);

const PASOS = [
  ["cambios", "Cambios"], ["seguridad", "Seguridad"], ["comprobaciones", "Comprobaciones"], ["redaccion", "Mensaje del commit"],
  ["subir", "Rama, commit y push"], ["pr", "Pull request"], ["revision", "Revisión de la IA"],
  ["ci", "Comprobaciones de GitHub"], ["espera", "Espera antes de fusionar"], ["fusion", "Fusión y vuelta a main"],
];

let actual = (() => { try { return JSON.parse(fs.readFileSync(F, "utf8")); } catch { return null; } })();
// Cancelación y estado viven fuera del módulo: Vite puede recargarlo mientras una publicación sigue en marcha.
const cancelado = () => globalThis.__panelPublicarCancelar === true;
let avisar = () => {};
export function alCambiar(cb) { avisar = cb; }

const guardar = () => { fs.mkdirSync(path.dirname(F), { recursive: true }); fs.writeFileSync(F, JSON.stringify(actual, null, 2)); avisar(); };
const paso = (id, estado, detalle) => { const p = actual.pasos.find((x) => x.id === id); Object.assign(p, { estado, ...(detalle !== undefined ? { detalle } : {}), ...(estado === "en-curso" ? { inicio: new Date().toISOString() } : {}) }); guardar(); };
const leer = () => { try { return JSON.parse(fs.readFileSync(F, "utf8")); } catch { return null; } };
const enMarcha = () => { const x = leer(); return !!x && ["en-curso", "esperando"].includes(x.estado) && Date.now() - new Date(x.inicio).getTime() < 3 * 3600e3; };

// ---- 1. Cambios pendientes, agrupados por zona ----
// Zona = el prefijo de commit que le toca (publicar.prefijos), o «otros».
const ZONAS = Object.entries(PUB.prefijos).sort((a, b) => b[0].length - a[0].length);
const ZONA = (f) => (ZONAS.find(([dir]) => f.startsWith(dir)) || [null, "otros"])[1];
export async function cambios() {
  const st = await git(["status", "--porcelain", "-z", "--untracked-files=all"]);
  const archivos = st.out.split("\0").filter(Boolean).map((l) => ({ estado: l.slice(0, 2).trim() || "M", ruta: l.slice(3) })).filter((x) => x.ruta && !x.ruta.endsWith("/"));
  const zonas = {};
  for (const a of archivos) (zonas[ZONA(a.ruta)] ||= []).push(a);
  const rama = (await git(["rev-parse", "--abbrev-ref", "HEAD"])).out;
  return { rama, total: archivos.length, zonas: Object.entries(zonas).map(([zona, l]) => ({ zona, total: l.length, nuevos: l.filter((x) => x.estado === "??" || x.estado === "A").length, archivos: l.slice(0, 40) })) };
}

// ---- 2. Seguridad ----
const DURO = [
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, "token de GitHub"], [/\bgithub_pat_[A-Za-z0-9_]{40,}/, "token de GitHub"], [/\bsk-(?:ant-)?[A-Za-z0-9_-]{24,}/, "clave de API (sk-…)"],
  [/\bxox[abpr]-[A-Za-z0-9-]{10,}/, "token de Slack"], [/\bAKIA[0-9A-Z]{16}\b/, "clave de AWS"], [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "clave privada"],
  [/\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*["'][A-Za-z0-9_\-.]{20,}["']/i, "credencial asignada en el código"],
];
const empieza = (r) => new RegExp(`^${r.replace(/\/$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\/|$)`);
const PROHIBIDAS = [...cfg.privadas, ...PUB.prohibidas, ".moss"].map(empieza).concat([/(^|\/)\.env(\.|$)/]);
const VETADOS = PUB.terminosVetados.length ? new RegExp(`\\b(${PUB.terminosVetados.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i") : null;
async function seguridad(lista) {
  const bloqueos = [], avisos = [];
  const email = (await git(["config", "user.email"])).out;
  for (const a of lista) {
    if (PROHIBIDAS.some((re) => re.test(a.ruta))) bloqueos.push(`${a.ruta}: ruta que no se sube nunca`);
    try { const s = fs.statSync(path.join(ROOT, a.ruta)); if (s.isFile() && s.size > 8e6) bloqueos.push(`${a.ruta}: pesa ${(s.size / 1e6).toFixed(1)} MB (máximo 8 MB)`); } catch {}
  }
  // Líneas añadidas: diff de lo seguido + contenido de lo nuevo (solo texto y < 1 MB).
  const d = await git(["diff", "HEAD", "--no-color", "-U0", "--no-ext-diff"]);
  const lineas = [];
  let archivo = null;
  for (const l of d.out.split("\n")) {
    if (l.startsWith("+++ b/")) archivo = l.slice(6);
    else if (l.startsWith("+") && !l.startsWith("+++")) lineas.push([archivo, l.slice(1)]);
  }
  for (const a of lista.filter((x) => x.estado === "??")) {
    const abs = path.join(ROOT, a.ruta);
    try {
      const s = fs.statSync(abs);
      if (s.size > 1e6) continue;
      const t = fs.readFileSync(abs);
      if (t.includes(0)) continue;
      for (const l of t.toString("utf8").split("\n")) lineas.push([a.ruta, l]);
    } catch {}
  }
  const vistos = new Set();
  for (const [f, l] of lineas) {
    for (const [re, que] of DURO) if (re.test(l) && !vistos.has(`${f}${que}`)) { vistos.add(`${f}${que}`); bloqueos.push(`${f}: posible ${que}`); }
    if (email && l.includes(email) && !vistos.has(`${f}email`)) { vistos.add(`${f}email`); bloqueos.push(`${f}: contiene tu correo`); }
    if (VETADOS && VETADOS.test(l) && f !== cfg.reglas && f !== "moss.config.json" && !vistos.has(`${f}vetado`)) {
      vistos.add(`${f}vetado`); avisos.push(`${f}: contiene un término vetado (${VETADOS.exec(l)[1]})`);
    }
  }
  return { bloqueos, avisos };
}

// ---- 3. Comprobaciones locales ----
async function comprobaciones(lista) {
  const fallos = [];
  const rutas = lista.filter((a) => a.estado !== "D").map((a) => a.ruta);
  for (const f of rutas.filter((r) => r.endsWith(".json") && !r.includes("node_modules/"))) {
    try { JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")); } catch (e) { fallos.push(`${f}: JSON no válido (${e.message.slice(0, 80)})`); }
  }
  for (const f of rutas.filter((r) => /\.(m?js|cjs)$/.test(r) && !r.includes("node_modules/"))) {
    const r = await run("node", ["--check", f]);
    if (!r.ok) fallos.push(`${f}: ${r.err.split("\n").slice(0, 3).join(" ")}`);
  }
  for (const f of rutas.filter((r) => r.endsWith(".py"))) {
    const r = await run("python3", ["-I", "-m", "py_compile", f]);
    if (!r.ok) fallos.push(`${f}: ${r.err.split("\n").slice(-2).join(" ")}`);
  }
  return { fallos, build: null };
}

// ---- 4. Redacción con Claude (con plan B sin Claude) ----
async function redactar(c) {
  const stat = (await git(["diff", "HEAD", "--stat=120"])).out.slice(0, 6000);
  const diff = (await git(["diff", "HEAD", "--no-color", "-U2", "--", ".", ":(exclude)borradores/*", ":(exclude)*.json"])).out.slice(0, 40000);
  const nuevos = c.zonas.flatMap((z) => z.archivos.filter((a) => a.estado === "??").map((a) => a.ruta)).slice(0, 80).join("\n");
  const prefijos = [...new Set([...Object.values(PUB.prefijos), PUB.prefijoPorDefecto])].map((x) => `${x}:`).join(", ");
  const pedido = `Eres el agente del repo ${cfg.nombre}. ${PUB.contexto}
Redacta el commit de estos cambios en el idioma «${cfg.idioma}». Devuelve SOLO un JSON:
{"titulo": "<prefijo>: <qué cambia>", "cuerpo": "3-8 viñetas con '- ', concretas", "tipo": "feat|fix|chore"}
Reglas: prefijos del repo (${prefijos}); si hay varias zonas, el prefijo de la principal. Frases cortas, sin emojis ni hype.
Zonas: ${c.zonas.map((z) => `${z.zona} (${z.total})`).join(", ")}

Estadísticas:
${stat}

Archivos nuevos:
${nuevos}

Diff (recortado, sin borradores ni JSON):
${diff}`;
  try {
    const r = await claude.preguntar(pedido, { modelo: ajustes().publicar.modelo, agente: ajustes().publicar.agente });
    const j = claude.json(r.texto);
    if (!j.titulo) throw new Error("sin título");
    return { ...j, coste: r.coste, via: "claude" };
  } catch (e) {
    const z = c.zonas.slice().sort((a, b) => b.total - a.total)[0];
    const pref = z && z.zona !== "otros" ? z.zona : PUB.prefijoPorDefecto;
    return {
      titulo: `${pref}: cambios desde Moss (${c.total} archivos)`, cuerpo: c.zonas.map((x) => `- ${x.zona}: ${x.total} archivos`).join("\n"), tipo: "chore",
      via: `plan B (${e.message.slice(0, 80)})`,
    };
  }
}

// ---- 7. Revisión de la IA ----
async function revisar(base) {
  const diff = (await git(["diff", `${base}...HEAD`, "--no-color", "-U2", "--", ".", ":(exclude)*.json"])).out.slice(0, 90000);
  let reglas = "";
  try { reglas = fs.readFileSync(path.join(ROOT, cfg.reglas), "utf8").slice(0, 20000); } catch {}
  const pedido = `Revisa este diff del repo ${cfg.nombre} antes de fusionarlo en ${PUB.rama}. ${PUB.contexto}
Reglas del repo (${cfg.reglas}):
${reglas || "(no hay archivo de reglas)"}

Busca solo problemas reales: secretos o datos personales${PUB.terminosVetados.length ? ", términos vetados" : ""}, reglas duras incumplidas en contenido nuevo, código roto o peligroso (comandos destructivos, publicar sin permiso). No comentes estilo.
Devuelve SOLO un JSON: {"veredicto": "ok" | "bloquea", "resumen": "una frase", "hallazgos": [{"gravedad": "bloquea|aviso", "archivo": "ruta", "texto": "qué y por qué"}]}
"bloquea" solo si hay algo que no debe llegar a main.

Diff:
${diff}`;
  const r = await claude.preguntar(pedido, { modelo: ajustes().publicar.modelo, agente: ajustes().publicar.agente });
  return { ...claude.json(r.texto), coste: r.coste };
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (t) => String(t).replace(/^[\w-]+:\s*/, "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "cambios";

export function estado() { return leer(); }

export async function publicar() {
  if (enMarcha()) throw new Error("Ya hay una publicación en marcha");
  if (encargoEnCurso()) throw new Error("Hay un agente trabajando en un encargo: espera a que termine para no subir cambios a medias");
  const a = ajustes().publicar;
  globalThis.__panelPublicarCancelar = false;
  actual = { id: `pub-${Date.now().toString(36)}`, inicio: new Date().toISOString(), estado: "en-curso", pasos: PASOS.map(([id, nombre]) => ({ id, nombre, estado: "pendiente" })) };
  guardar();
  const fallar = (id, msg, extra = {}) => { paso(id, "error", msg); Object.assign(actual, { estado: "error", error: msg, fin: new Date().toISOString(), ...extra }); guardar(); historial(); return actual; };
  try {
    paso("cambios", "en-curso");
    const c = await cambios();
    if (!c.total) { paso("cambios", "ok", "No hay nada que subir"); Object.assign(actual, { estado: "nada", fin: new Date().toISOString() }); guardar(); return actual; }
    actual.cambios = c;
    paso("cambios", "ok", `${c.total} archivos: ${c.zonas.map((z) => `${z.zona} ${z.total}`).join(" · ")}`);
    const todos = (await git(["status", "--porcelain", "-z", "--untracked-files=all"])).out.split("\0").filter(Boolean).map((l) => ({ estado: l.slice(0, 2).trim() || "M", ruta: l.slice(3) }));

    paso("seguridad", "en-curso");
    const s = await seguridad(todos);
    actual.seguridad = s;
    if (s.bloqueos.length) return fallar("seguridad", `${s.bloqueos.length} problema(s): ${s.bloqueos.slice(0, 4).join(" · ")}`);
    paso("seguridad", s.avisos.length ? "aviso" : "ok", s.avisos.length ? s.avisos.slice(0, 4).join(" · ") : "Sin secretos ni rutas prohibidas");

    paso("comprobaciones", "en-curso");
    const k = await comprobaciones(todos);
    if (k.fallos.length) return fallar("comprobaciones", k.fallos.slice(0, 3).join(" · "));
    paso("comprobaciones", "ok", "JSON y sintaxis correctos");

    paso("redaccion", "en-curso");
    const r = await redactar(c);
    actual.commit = { titulo: r.titulo, cuerpo: r.cuerpo, tipo: r.tipo, via: r.via };
    paso("redaccion", "ok", `${r.titulo} (${r.via === "claude" ? "IA" : r.via})`);

    paso("subir", "en-curso");
    const base = PUB.rama;
    await git(["fetch", "--quiet", "origin", base], { timeout: 60000 });
    const rama = `moss/${new Date().toISOString().slice(0, 10)}-${slug(r.titulo)}-${Date.now().toString(36).slice(-4)}`;
    const sw = await git(["switch", "-c", rama]);
    if (!sw.ok) return fallar("subir", sw.err);
    actual.rama = rama;
    await git(["add", "-A"]);
    const cm = await git(["commit", "-F", "-"], { input: `${r.titulo}\n\n${r.cuerpo || ""}\n` });
    if (!cm.ok) return fallar("subir", cm.err || cm.out);
    const ps = await git(["push", "-u", "origin", rama], { timeout: 180000 });
    if (!ps.ok) return fallar("subir", ps.err.split("\n").slice(-3).join(" "));
    paso("subir", "ok", rama);

    paso("pr", "en-curso");
    const cuerpoPr = `${r.cuerpo || ""}\n\n## Comprobaciones\n\n- Seguridad: ${s.avisos.length ? s.avisos.join("; ") : "sin secretos ni rutas prohibidas"}\n- JSON y sintaxis: correctos\n\nPublicado desde Moss (botón «Publicar cambios»), con el OK de ${P}.`;
    const pr = await run("gh", ["pr", "create", "--base", base, "--head", rama, "--title", r.titulo, "--body-file", "-"], { input: cuerpoPr, timeout: 60000 });
    if (!pr.ok) return fallar("pr", pr.err.split("\n").slice(-2).join(" "));
    actual.pr = { url: pr.out.split("\n").pop(), numero: Number((/\/pull\/(\d+)/.exec(pr.out) || [])[1]) || null };
    paso("pr", "ok", actual.pr.url);

    paso("revision", "en-curso");
    if (a.revisar) {
      let rev;
      try { rev = await revisar(`origin/${base}`); } catch (e) { rev = { veredicto: "aviso", resumen: `No se pudo revisar: ${e.message}`, hallazgos: [] }; }
      actual.revision = rev;
      const txt = `**Revisión de la IA:** ${rev.veredicto === "bloquea" ? "bloquea la fusión" : rev.veredicto === "ok" ? "sin problemas" : "no se pudo completar"}. ${rev.resumen || ""}\n\n${(rev.hallazgos || []).map((h) => `- **${h.gravedad}** \`${h.archivo}\`: ${h.texto}`).join("\n")}`;
      await run("gh", ["pr", "comment", String(actual.pr.numero), "--body-file", "-"], { input: txt, timeout: 60000 });
      if (rev.veredicto === "bloquea") {
        await run("gh", ["pr", "ready", String(actual.pr.numero), "--undo"], { timeout: 60000 });
        return fallar("revision", `Bloquea: ${rev.resumen || ""} La PR queda en borrador para revisarla.`, { estado: "bloqueada" });
      }
      paso("revision", rev.veredicto === "ok" ? "ok" : "aviso", rev.resumen || "");
    } else paso("revision", "omitido", "Desactivada en Ajustes");

    paso("ci", "en-curso");
    let ci = "sin comprobaciones";
    for (let i = 0; i < 80 && !cancelado(); i++) {
      const ch = await run("gh", ["pr", "checks", String(actual.pr.numero), "--json", "name,state,bucket"], { timeout: 30000 });
      let l = [];
      try { l = JSON.parse(ch.out || "[]"); } catch {}
      if (!l.length && i >= 4) break; // ningún workflow se lanzó en ~1 min
      if (l.length && l.every((x) => x.bucket !== "pending")) {
        const malos = l.filter((x) => x.bucket === "fail" || x.bucket === "cancel");
        if (malos.length) return fallar("ci", `Fallan: ${malos.map((x) => x.name).join(", ")}. La PR sigue abierta.`, { estado: "bloqueada" });
        ci = `${l.length} correctas`;
        break;
      }
      paso("ci", "en-curso", l.length ? `${l.filter((x) => x.bucket === "pending").length} en curso` : "Esperando a GitHub");
      await dormir(15000);
    }
    paso("ci", ci === "sin comprobaciones" ? "omitido" : "ok", ci);

    if (!a.fusionarSola) {
      paso("espera", "omitido"); paso("fusion", "omitido", "Fusión automática desactivada: la PR queda abierta y sigues en su rama");
      Object.assign(actual, { estado: "abierta", fin: new Date().toISOString() }); guardar(); historial(); return actual;
    }
    actual.estado = "esperando";
    actual.fusionaEn = new Date(Date.now() + a.esperaMin * 60000).toISOString();
    paso("espera", "en-curso", a.esperaMin ? `Se fusiona a las ${horaCorta(new Date(actual.fusionaEn).getTime())}` : "Sin espera");
    while (Date.now() < new Date(actual.fusionaEn).getTime() && !cancelado()) await dormir(1000);
    if (cancelado()) {
      paso("espera", "omitido", "Cancelada por ti"); paso("fusion", "omitido", "La PR queda abierta");
      Object.assign(actual, { estado: "abierta", fin: new Date().toISOString() }); guardar(); historial(); return actual;
    }
    paso("espera", "ok");
    actual.estado = "en-curso";
    paso("fusion", "en-curso");
    const mg = await run("gh", ["pr", "merge", String(actual.pr.numero), "--squash", "--delete-branch"], { timeout: 120000 });
    if (!mg.ok && !/already merged/i.test(mg.err)) return fallar("fusion", mg.err.split("\n").slice(-2).join(" "));
    // gh ya intenta volver a main; por si acaso, se deja main al día y se borra la rama local.
    await git(["switch", base]);
    await git(["pull", "--ff-only", "origin", base], { timeout: 120000 });
    await git(["branch", "-D", rama]);
    paso("fusion", "ok", `Fusionada en ${base}`);
    Object.assign(actual, { estado: "fusionada", fin: new Date().toISOString() });
    guardar(); historial();
    return actual;
  } catch (e) {
    const p = actual.pasos.find((x) => x.estado === "en-curso");
    return fallar(p ? p.id : "cambios", String(e.message || e));
  }
}

export function cancelarFusion() {
  const x = leer();
  if (!x || x.estado !== "esperando") throw new Error("No hay ninguna fusión esperando");
  globalThis.__panelPublicarCancelar = true;
  return { ok: true };
}

function historial() {
  let h = [];
  try { h = JSON.parse(fs.readFileSync(HIST, "utf8")); } catch {}
  h = [{ id: actual.id, inicio: actual.inicio, fin: actual.fin, estado: actual.estado, titulo: actual.commit && actual.commit.titulo, pr: actual.pr, version: actual.version, error: actual.error }, ...h.filter((x) => x.id !== actual.id)].slice(0, 30);
  fs.writeFileSync(HIST, JSON.stringify(h, null, 2));
}
export function lista() { try { return JSON.parse(fs.readFileSync(HIST, "utf8")); } catch { return []; } }

// Comprobación en seco (sin commit ni push): seguridad y sintaxis de lo que se subiría ahora.
export async function comprobarAntes() {
  const todos = (await git(["status", "--porcelain", "-z", "--untracked-files=all"])).out.split("\0").filter(Boolean).map((l) => ({ estado: l.slice(0, 2).trim() || "M", ruta: l.slice(3) }));
  const [s, k] = await Promise.all([seguridad(todos), comprobaciones(todos)]);
  return { total: todos.length, seguridad: s, comprobaciones: k };
}
