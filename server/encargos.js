// Encargos: la persona pide un cambio desde el panel y se lanza un agente (Claude Code, Codex, Cursor, OpenCode… ver agentes.js) en local, en segundo plano, con todo el
// contexto del objeto (post, plantilla, carrusel…). Cada encargo vive en <cerebro>/.moss/encargos/<id>.json y su
// registro de pasos en <id>.jsonl (carpeta ignorada por git). Solo corre uno a la vez para no pisar archivos.
import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import * as aislada from "./aislada.js";
import { ROOT, hoyLocal, mtime } from "./repo.js";
import { posts } from "./posts.js";
import { media, plantillas, carruseles, marcas, ogs } from "./catalog.js";
import { referencias } from "./referencias.js";
import { contexto as kitContexto } from "./kit.js";
import { ajustes } from "./ajustes.js";
import { cfg, rutas, ESTADO } from "./cerebro.js";
import * as agentes from "./agentes.js";

const DIR = path.join(ESTADO, "encargos");
const ACTIVOS = ["cola", "en-curso"];

// Lo que el agente puede hacer sin preguntar. En modo -p, todo lo que no está aquí se deniega solo.
// --setting-sources project,local deja fuera los hooks personales (rtk reescribe los comandos y rompe la lista).
// Comandos base; el cerebro añade los suyos en agentes.comandos (moss.config.json).
const BASH = [...new Set(["python3", "node", "npm run", "npm install", "ffmpeg", "ffprobe", "ls", "mkdir", "cp", "rg", "fd", "cd", ...cfg.agentes.comandos])];
const PERMITIDAS = ["Read", "Edit", "Write", "Glob", "Grep", "Skill", "Task", "TodoWrite", "WebSearch", "WebFetch", "ToolSearch", ...BASH.map((c) => `Bash(${c} *)`)];
const PROHIBIDAS = [
  "Bash(git commit *)", "Bash(git push *)", "Bash(git reset *)", "Bash(git checkout *)", "Bash(gh *)", "Bash(rm *)", "Bash(curl *)", "Bash(rclone *)",
  "CronCreate", "RemoteTrigger", "PublishPlugin", "ShareOnboardingGuide", "Workflow", "PushNotification", "SendMessage", "ScheduleWakeup", "DesignSync", "EnterWorktree",
];

const P = cfg.persona;
const SISTEMA = [
  `Trabajas para ${P} desde Moss, su panel local del repo ${cfg.nombre} (este repo). ${P} te ha dejado un encargo.`,
  "Reglas que no se negocian:",
  `- Lee ${cfg.reglas} antes de nada y respeta sus reglas duras.`,
  "- Nunca publiques ni programes nada. No hagas commit, push ni PR.",
  `- Edita archivos del repo y genera renders en ${rutas.media}/. Revisa el resultado (PNG o fotogramas) antes de darlo por bueno.`,
  `- No cambies el estado de un borrador a pendiente-ok, programado ni publicado: eso lo decide ${P}.`,
  rutas.aprendizajes ? `- No escribas en ${rutas.aprendizajes}: ${P} registra las decisiones desde el panel.` : null,
  cfg.privadas.length ? `- No leas ni toques: ${cfg.privadas.join(", ")}.` : null,
  ...cfg.agentes.reglas.map((r) => `- ${r}`),
  cfg.idioma === "es" ? "- Responde siempre en castellano." : `- Responde siempre en el idioma «${cfg.idioma}».`,
].filter(Boolean).join("\n");

const FORMATO = `## Cómo responder al terminar
En castellano y breve, con estos tres apartados:
- **Hecho:** qué has cambiado.
- **Archivos:** rutas de lo que has creado o editado, renders incluidos.
- **Revisa:** qué debe mirar ${P} o qué falta.

Si de este encargo sale una decisión que conviene recordar para piezas futuras, añade al final una línea por decisión que empiece exactamente por \`DECISIÓN:\`.`;

const ahora = () => new Date().toISOString();
const file = (id, ext = "json") => path.join(DIR, `${id}.${ext}`);
const valido = (id) => /^[a-z0-9-]{6,80}$/.test(id || "");

function guardar(e) {
  fs.mkdirSync(DIR, { recursive: true });
  e.actualizado = ahora();
  fs.writeFileSync(file(e.id), JSON.stringify(e, null, 2));
  return e;
}
export function leer(id) {
  if (!valido(id)) return null;
  try { return JSON.parse(fs.readFileSync(file(id), "utf8")); } catch { return null; }
}
function evento(id, ev) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.appendFileSync(file(id, "jsonl"), JSON.stringify({ t: ahora(), ...ev }) + "\n");
}
export function eventos(id) {
  try { return fs.readFileSync(file(id, "jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; }
}

export function lista() {
  let names = [];
  try { names = fs.readdirSync(DIR).filter((n) => n.endsWith(".json")); } catch { return []; }
  // En la carpeta también viven buffer.json y revisiones.json: un encargo es lo que tiene rondas.
  return names.map((n) => leer(n.replace(/\.json$/, ""))).filter((e) => e && Array.isArray(e.rondas)).sort((a, b) => b.actualizado.localeCompare(a.actualizado));
}

// ---- Contexto: qué es el objeto y dónde están sus archivos ----

function catalogo() {
  const m = media();
  return { posts: posts(hoyLocal()), plantillas: plantillas(m).list, carruseles: carruseles(), ogs: ogs(m), marcas: marcas(), media: m };
}

// Resuelve el objetivo a un título legible y a un bloque de contexto para el prompt.
export function resolver(obj, cat = catalogo()) {
  const { tipo, id } = obj || {};
  if (tipo === "post") {
    const p = cat.posts.find((x) => x.id === id);
    if (!p) return null;
    const v = p.visual;
    const fecha = p.fecha ? `${p.fecha.tipo} ${p.fecha.dia}${p.fecha.hora ? " " + p.fecha.hora : ""}` : "sin fecha";
    return {
      tipo, id, titulo: p.titulo, path: p.path,
      contexto: [
        `Post «${p.titulo}» (${p.redes.join(", ")} · estado ${p.estado} · ${fecha}).`,
        `- Borrador: ${p.path}. Léelo entero: el texto por red, el frontmatter y las notas para ${P} del comentario HTML final.`,
        v.archivos.length ? `- Visual actual (${v.tipo}): ${v.tipo === "carrusel" ? v.archivos[0].split("/").slice(0, -1).join("/") + "/" : v.archivos[0]}` : "- Visual actual: ninguno.",
        v.falta.length ? `- Medios citados que no están en este equipo: ${v.falta.join(", ")}` : null,
        p.avisos.length ? `- Avisos del panel: ${p.avisos.map((a) => a.texto).join(" · ")}` : null,
        cfg.guias.plantillas ? `- Índice de plantillas y visuales permitidos: ${cfg.guias.plantillas}.` : null,
      ].filter(Boolean).join("\n"),
    };
  }
  if (tipo === "plantilla") {
    const t = cat.plantillas.find((x) => x.id === id);
    if (!t) return null;
    return {
      tipo, id, titulo: t.id, path: t.dir,
      contexto: [
        `Plantilla ${t.id} (${t.tipo}, estado ${t.estado}).`,
        `- Carpeta: ${t.ruta || t.dir}`,
        t.readme ? `- Guía: ${t.readme}` : null,
        rutas.indiceRecursos ? `- Ficha en el índice: ${rutas.indiceRecursos} (id "${t.id}")${cfg.guias.plantillas ? ` y ${cfg.guias.plantillas}` : ""}.` : null,
        t.previews.length ? `- Renders de ejemplo: ${t.previews.slice(0, 3).map((m) => m.path).join(", ")}` : null,
      ].filter(Boolean).join("\n"),
    };
  }
  if (tipo === "carrusel") {
    const c = cat.carruseles.find((x) => x.slug === id);
    if (!c) return null;
    return {
      tipo, id, titulo: c.slug, path: c.path,
      contexto: [
        `Carrusel ${c.slug} (serie ${c.series || c.serie}, tema ${c.theme}, ${c.n} slides).`,
        `- JSON: ${c.path}`,
        `- Slides renderizadas: ${rutas.mediaCarruseles || `${rutas.media}/carruseles`}/${c.slug}/`,
        `- Render: ${c.cmd}`,
        cfg.guias.carruseles ? `- Guía de temas y tipos: ${cfg.guias.carruseles}.` : null,
      ].filter(Boolean).join("\n"),
    };
  }
  if (tipo === "og") {
    const o = cat.ogs.find((x) => x.id === id);
    if (!o) return null;
    return {
      tipo, id, titulo: o.id, path: o.html,
      contexto: [`OG animada ${o.id} (marca ${o.marca}).`, `- HTML: ${o.html}`, o.render ? `- Último render: ${o.render}` : null, cfg.guias.ogs ? `- Guía: ${cfg.guias.ogs}` : null].filter(Boolean).join("\n"),
    };
  }
  if (tipo === "marca") {
    const k = cat.marcas.find((x) => x.id === id);
    if (!k) return null;
    return { tipo, id, titulo: k.data.nombre || k.id, path: k.path, contexto: `Kit de marca ${k.id}: ${k.path}.${cfg.guias.marcas ? ` Guía: ${cfg.guias.marcas}.` : ""}` };
  }
  if (tipo === "medio") {
    const usado = cat.posts.filter((p) => p.visual.archivos.includes(id)).map((p) => p.path);
    return { tipo, id, titulo: path.basename(id), path: id, contexto: [`Archivo ${id}.`, usado.length ? `- Lo usan: ${usado.join(", ")}` : "- Ningún borrador lo cita."].join("\n") };
  }
  return { tipo: "general", id: null, titulo: "General", path: null, contexto: "Encargo general sobre el repo." };
}

export function prompt(e, cat = catalogo()) {
  const obj = resolver(e.objetivo, cat) || { contexto: `Objetivo ${e.objetivo.tipo} ${e.objetivo.id} (ya no se encuentra en el repo).` };
  const t = e.plantilla ? cat.plantillas.find((x) => x.id === e.plantilla) : null;
  const refs = referencias().filter((r) => (e.referencias || []).includes(r.id));
  const partes = [
    `# Encargo desde Moss (repo ${cfg.nombre})`,
    `${P} ha escrito esto (texto literal):`,
    e.texto.split("\n").map((l) => `> ${l}`).join("\n"),
    "## Sobre qué",
    obj.contexto,
  ];
  if (t) partes.push("## Plantilla que quiere usar", [`${t.id} (${t.tipo}, estado ${t.estado}).`, `- Carpeta: ${t.ruta || t.dir}`, t.readme ? `- Guía: ${t.readme}. Léela antes de usarla.` : null, t.previews.length ? `- Así se ve: ${t.previews.slice(0, 2).map((m) => m.path).join(", ")}` : null].filter(Boolean).join("\n"));
  if (refs.length) partes.push("## Referencias que adjunta", refs.map((r) => `- ${r.titulo || r.url || r.archivo}${r.url ? ` · ${r.url}` : ""}${r.archivo ? ` · archivo local ${r.archivo} (ábrelo con Read para verlo)` : ""}${r.thumb && r.thumb !== r.archivo ? ` · vista previa ${r.thumb}` : ""}${r.notas ? `\n  Notas de ${P}: ${r.notas}` : ""}`).join("\n") + "\n\nSon referencias de estilo internas: nunca las nombres en una pieza pública.");
  const kc = kitContexto(e.preset, e.firma);
  if (kc) partes.push(kc);
  partes.push("## Cómo trabajar", [
    `1. Lee ${cfg.reglas}${rutas.skills ? ` y la guía o skill de ${rutas.skills}/ que toque` : " y la guía que toque"} antes de cambiar nada.`,
    `2. Haz el cambio en los archivos del repo. Si hay render, genéralo en ${rutas.media}/ y míralo antes de darlo por bueno.`,
    "3. Si cambias el visual de un post, actualiza en su borrador las rutas de media, sin tocar el estado.",
    "4. No publiques, no programes y no hagas commit.",
  ].join("\n"));
  partes.push(FORMATO);
  return partes.join("\n\n");
}

const promptRonda = (texto) => [`${P} ha revisado el resultado y pide otra vuelta (texto literal):`, texto.split("\n").map((l) => `> ${l}`).join("\n"), "Mismas reglas que antes.", FORMATO].join("\n\n");

// ---- Crear y mover ----

export function crear({ objetivo, texto, plantilla, referencias: refs, modelo, lanzar, preset, firma, agente }) {
  if (!texto || !String(texto).trim()) throw new Error("Escribe qué hay que cambiar");
  const cat = catalogo();
  const obj = resolver(objetivo, cat);
  if (!obj) throw new Error("No encuentro ese objeto en el repo");
  const id = `${hoyLocal()}-${Date.now().toString(36).slice(-5)}-${(obj.titulo || "encargo").toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "encargo"}`;
  const e = {
    id, creado: ahora(), estado: lanzar ? "cola" : "borrador",
    objetivo: { tipo: obj.tipo, id: obj.id, titulo: obj.titulo, path: obj.path },
    texto: String(texto).trim(), plantilla: plantilla || null, referencias: Array.isArray(refs) ? refs : [], modelo: modelo || null,
    agente: agentes.ADAPTADORES[agente] ? agente : null,
    preset: preset || null, firma: firma || null,
    sesion: null, archivos: [], decisiones: [], registradas: [],
    rondas: [{ texto: String(texto).trim(), estado: lanzar ? "cola" : "borrador" }],
  };
  guardar(e);
  if (lanzar) siguiente();
  return e;
}

export function lanzar(id) {
  const e = leer(id);
  if (!e) throw new Error("No existe");
  if (e.estado !== "borrador") throw new Error("Ya está lanzado");
  e.estado = "cola";
  e.rondas[e.rondas.length - 1].estado = "cola";
  guardar(e);
  siguiente();
  return e;
}

export function otraVuelta(id, texto) {
  const e = leer(id);
  if (!e) throw new Error("No existe");
  if (ACTIVOS.includes(e.estado)) throw new Error("Todavía está en marcha");
  if (!texto || !String(texto).trim()) throw new Error("Escribe qué hay que cambiar");
  e.rondas.push({ texto: String(texto).trim(), estado: "cola" });
  e.estado = "cola";
  e.decisiones = [];
  guardar(e);
  siguiente();
  return e;
}

export function marcar(id, estado) {
  const e = leer(id);
  if (!e) throw new Error("No existe");
  if (!["hecho", "descartado", "revisar"].includes(estado)) throw new Error("Estado no válido");
  if (ACTIVOS.includes(e.estado)) throw new Error("Detenlo antes");
  // Con copia aislada: «hecho» exige aplicar antes los cambios; «descartado» borra la copia.
  if (e.copia && !e.copia.aplicada) {
    if (estado === "hecho") throw new Error("Aplica antes sus cambios al repo (o descártalos)");
    if (estado === "descartado") { aislada.borrar(e.id); e.copia.descartada = ahora(); }
  }
  e.estado = estado;
  return guardar(e);
}

// ---- Copia aislada (git worktree): ver, aplicar o descartar lo que hizo el agente ----
export function cambiosCopia(id) {
  const e = leer(id);
  if (!e || !e.copia) throw new Error("Este encargo no trabaja en una copia aislada");
  return aislada.cambios(e.id, e.copia.base);
}

export function aplicarCopia(id) {
  const e = leer(id);
  if (!e || !e.copia) throw new Error("Este encargo no trabaja en una copia aislada");
  if (ACTIVOS.includes(e.estado)) throw new Error("Espera a que termine");
  const r = aislada.aplicar(e.id, e.copia.base);
  e.copia.aplicada = ahora();
  e.copia.archivos = r.archivos;
  e.estado = "hecho";
  guardar(e);
  evento(e.id, { ronda: e.rondas.length - 1, tipo: "sistema", texto: `Cambios aplicados al repo (${r.archivos.length} archivos)` });
  return e;
}

export function registrada(id, i) {
  const e = leer(id);
  if (!e) return;
  e.registradas = [...new Set([...(e.registradas || []), e.decisiones[i]])];
  guardar(e);
}

// ---- Ejecutar ----

const corriendo = new Map(); // id → proc

function porcelana(cwd = ROOT) {
  try {
    const out = execFileSync("git", ["status", "--porcelain", "-uall"], { cwd, encoding: "utf8", maxBuffer: 20e6 });
    const mt = (p) => { try { return fs.statSync(path.join(cwd, p)).mtimeMs; } catch { return 0; } };
    return Object.fromEntries(out.split("\n").filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, "")).map((p) => [p.includes(" -> ") ? p.split(" -> ")[1] : p, mt(p.includes(" -> ") ? p.split(" -> ")[1] : p)]));
  } catch { return {}; }
}

export function claudeBin() {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  const home = process.env.HOME || "";
  return [path.join(home, ".local/bin/claude"), "/opt/homebrew/bin/claude", "/usr/local/bin/claude"].find((p) => fs.existsSync(p)) || "claude";
}

function cabeza(cwd = ROOT) { try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim(); } catch { return null; } }

function ejecutar(e) {
  const n = e.rondas.length - 1;
  const ronda = e.rondas[n];
  const aj = ajustes();
  const agenteId = e.agente || aj.agente || "claude";
  const ad = agentes.ADAPTADORES[agenteId] || agentes.ADAPTADORES.claude;
  const nombre = ad.nombre;
  const texto = n === 0 || !e.sesion ? prompt(e) : promptRonda(ronda.texto);
  ronda.estado = "en-curso";
  ronda.inicio = ahora();
  ronda.prompt = texto;
  ronda.agente = agenteId;
  e.estado = "en-curso";
  e.agente = agenteId;
  // Copia aislada: el encargo trabaja en su propio git worktree (Ajustes → Encargos). Se crea en la primera ronda y
  // las siguientes la reutilizan; el repo no cambia hasta que se aplican sus cambios.
  let cwd = ROOT;
  if (e.copia && !e.copia.aplicada && !e.copia.descartada) cwd = aislada.ruta(e.id);
  else if (aj.encargos.aislamiento === "copia") {
    try { e.copia = aislada.crear(e.id); cwd = aislada.ruta(e.id); } catch (x) { guardar(e); return fallarAntes(e, n, `No se pudo crear la copia aislada: ${x.message}`); }
  }
  guardar(e);
  evento(e.id, { ronda: n, tipo: "sistema", texto: n === 0 ? `${nombre} arranca con el contexto del encargo` : `${nombre} retoma la sesión con tu nueva indicación` });

  const antes = porcelana(cwd);
  const head0 = cabeza(cwd);
  const t0 = Date.now();
  const modelo = e.modelo || (aj.modelos && aj.modelos[agenteId]) || null;
  const sesion = e.sesion && n > 0 ? e.sesion : null;
  let lanzamiento;
  let bin;
  // Los agentes sin «system prompt» propio reciben las reglas al principio del mensaje.
  const conSistema = `${SISTEMA}\n\n${texto}`;
  try {
    bin = ad.id === "claude" ? claudeBin() : null;
    lanzamiento = ad.args({ sistema: SISTEMA, sesion, modelo, permitidas: PERMITIDAS, prohibidas: PROHIBIDAS, prompt: conSistema, comando: aj.comandoPropio, cwd });
  } catch (x) { return fallarAntes(e, n, x.message); }
  const arrancar = (b) => {
    const cmd = lanzamiento.cmd || b;
    // detached: el agente y sus hijos (MCP, comandos) van en su propio grupo, para poder matar el árbol entero.
    const proc = spawn(cmd, lanzamiento.args, { cwd, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, NO_COLOR: "1" }, detached: true });
    corriendo.set(e.id, proc);
    if (lanzamiento.stdin) proc.stdin.end(lanzamiento.sistemaEnPrompt ? conSistema : texto); else proc.stdin.end();
    seguir(proc);
  };

  const tocados = new Set(e.archivos);
  const acc = {};
  let resultado = null;
  let buf = "";
  let err = "";
  const procesar = (ev) => {
    if (ev.tipo === "sesion") { const cur = leer(e.id); cur.sesion = ev.id; guardar(cur); return; }
    if (ev.tipo === "resultado") { resultado = ev; return; }
    // En una copia aislada las rutas llegan como .moss/copias/<id>/…: se dejan relativas al repo.
    const pre = path.relative(ROOT, cwd) + "/";
    if (ev.archivo && cwd !== ROOT && ev.archivo.startsWith(pre)) ev.archivo = ev.archivo.slice(pre.length);
    if (ev.tipo === "herramienta" && ev.archivo) tocados.add(ev.archivo);
    const { archivo, ...resto } = ev;
    evento(e.id, { ronda: n, ...resto });
  };
  function seguir(proc) {
    // Registro crudo (para depurar adaptadores) y corte por inactividad: 20 min sin salida = colgado.
    const crudo = fs.createWriteStream(file(e.id, "raw.ndjson"), { flags: "a" });
    let inactivo = null;
    const vigilar = () => { clearTimeout(inactivo); inactivo = setTimeout(() => { evento(e.id, { ronda: n, tipo: "fallo", texto: `${nombre} lleva 20 minutos sin dar señales: se detiene.` }); matarArbol(proc); }, 20 * 60000); inactivo.unref(); };
    vigilar();
    proc.on("close", () => { clearTimeout(inactivo); crudo.end(); });
    proc.stdout.on("data", (chunk) => {
      crudo.write(chunk);
      vigilar();
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        if (lanzamiento.texto) { ad.parse(line, acc).forEach(procesar); continue; }
        let m;
        try { m = JSON.parse(line); } catch { continue; }
        try { ad.parse(m, acc).forEach(procesar); } catch (x) { evento(e.id, { ronda: n, tipo: "sistema", texto: `Evento de ${nombre} no reconocido: ${String(x.message).slice(0, 120)}` }); }
      }
    });
    proc.stderr.on("data", (c) => { err = (err + c).slice(-4000); });
    proc.on("error", (x) => { err += String(x.message || x); });
    proc.on("close", (code, signal) => cerrar(code, signal));
  }
  function cerrar(code, signal) {
    corriendo.delete(e.id);
    if (!resultado && ad.fin && !signal) resultado = ad.fin(acc, code);
    const cur = leer(e.id);
    const r = cur.rondas[n];
    r.fin = ahora();
    r.duracion = Date.now() - t0;
    // Archivos tocados: lo que el agente dijo que editó, lo que cambió en git y los renders nuevos de media/.
    const despues = porcelana(cwd);
    for (const [p, mt] of Object.entries(despues)) if (!(p in antes) || antes[p] !== mt) tocados.add(p);
    for (const g of media()) if (!g.frames) for (const it of g.items) if (it.mtime >= t0) tocados.add(it.path);
    cur.archivos = [...tocados].filter((p) => p && !p.startsWith(".moss/")).sort();
    // Guarda común a todos los agentes: no pueden hacer commits (solo Claude los tiene prohibidos por lista).
    const head1 = cabeza(cwd);
    if (head0 && head1 && head0 !== head1) { r.commits = true; evento(e.id, { ronda: n, tipo: "fallo", texto: `${nombre} ha hecho commits (HEAD ${head0.slice(0, 7)} → ${head1.slice(0, 7)}). Revísalos antes de publicar.` }); }
    if (resultado && (!signal)) {
      r.resultado = resultado.texto || "";
      r.coste = resultado.coste || null;
      r.turnos = resultado.turnos || null;
      r.tokens = resultado.tokens || null;
      r.estado = resultado.error ? "error" : "hecho";
      if (resultado.error && !r.resultado) r.error = err.trim().split("\n").slice(-6).join("\n") || `Salió con código ${code}`;
      if (resultado.sesion) cur.sesion = resultado.sesion;
      if ((resultado.denegadas || []).length) { r.denegadas = [...new Set(resultado.denegadas)]; evento(e.id, { ronda: n, tipo: "sistema", texto: `Sin permiso para: ${r.denegadas.join(" · ")}` }); }
      cur.decisiones = (r.resultado.match(/^\s*[-*]?\s*\**DECISI[ÓO]N:?\**:?\s*(.+)$/gim) || []).map((l) => l.replace(/^\s*[-*]?\s*\**DECISI[ÓO]N:?\**:?\s*/i, "").trim()).filter(Boolean);
      evento(e.id, { ronda: n, tipo: r.error ? "fallo" : "resultado", texto: r.resultado || r.error });
    } else {
      r.estado = signal ? "detenido" : "error";
      r.error = signal ? "Detenido desde el panel" : (err.trim().split("\n").slice(-6).join("\n") || `Salió con código ${code}`);
      evento(e.id, { ronda: n, tipo: signal ? "sistema" : "fallo", texto: r.error });
    }
    cur.estado = r.estado === "error" ? "error" : "revisar";
    if (cur.copia) { try { cur.copia.resumen = aislada.cambios(cur.id, cur.copia.base, { diff: false }).resumen; } catch {} }
    guardar(cur);
    siguiente();
  }

  if (ad.id === "claude") return arrancar(bin);
  agentes.binDe(agenteId).then((b) => arrancar(b)).catch((x) => fallarAntes(e, n, x.message));
}

function fallarAntes(e, n, msg) {
  const cur = leer(e.id);
  const r = cur.rondas[n];
  Object.assign(r, { estado: "error", error: msg, fin: ahora() });
  cur.estado = "error";
  guardar(cur);
  evento(e.id, { ronda: n, tipo: "fallo", texto: msg });
  corriendo.delete(e.id);
  setTimeout(siguiente, 100).unref();
}

// Mata el grupo de procesos del agente: SIGINT, luego SIGTERM y luego SIGKILL, con 2 s entre cada señal (como vibe-kanban).
function matarArbol(proc) {
  const senal = (sig) => { try { process.kill(-proc.pid, sig); } catch { try { proc.kill(sig); } catch {} } };
  senal("SIGINT");
  const t1 = setTimeout(() => { if (proc.exitCode === null) senal("SIGTERM"); }, 2000);
  const t2 = setTimeout(() => { if (proc.exitCode === null) senal("SIGKILL"); }, 4000);
  t1.unref(); t2.unref();
}

export function detener(id) {
  if (corriendo.has(id)) { matarArbol(corriendo.get(id)); return true; }
  const e = leer(id);
  if (e && e.estado === "cola") {
    e.estado = e.rondas.length > 1 ? "revisar" : "borrador";
    e.rondas[e.rondas.length - 1].estado = "borrador";
    if (e.rondas.length > 1) e.rondas.pop();
    guardar(e);
    return true;
  }
  return false;
}

// Vite recarga este módulo en cada reinicio del servidor y el anterior sigue vivo en el proceso: solo la versión más
// reciente arranca encargos, y nunca si otro ya está en curso en disco (de cualquier versión) en las últimas 2 h.
const GEN = (globalThis.__panelEncargosGen = (globalThis.__panelEncargosGen || 0) + 1);
// Primera carga en este proceso (la app acaba de arrancar): lo que figure «en curso» quedó huérfano de una sesión
// anterior (cierre o caída). Se marca como interrumpido para que no bloquee la cola; la sesión se puede retomar.
if (GEN === 1) {
  try {
    for (const x of lista().filter((y) => y.estado === "en-curso")) {
      const cur = leer(x.id);
      const r = cur.rondas[cur.rondas.length - 1];
      Object.assign(r, { estado: "error", error: "Interrumpido: la app se cerró mientras trabajaba. Pide otra vuelta para retomarlo.", fin: r.fin || ahora() });
      cur.estado = "error";
      guardar(cur);
    }
  } catch {}
}
// Cuántos a la vez: uno sobre el repo; con copias aisladas, los que digan los ajustes (cada uno en su worktree).
function huecos() {
  const aj = ajustes().encargos;
  return aj.aislamiento === "copia" ? Number(aj.paralelos) || 1 : 1;
}
function siguiente() {
  if (globalThis.__panelEncargosGen !== GEN) return;
  const enDisco = lista().filter((x) => x.estado === "en-curso" && Date.now() - new Date(x.actualizado).getTime() < 2 * 3600e3);
  let libres = huecos() - Math.max(corriendo.size, enDisco.length);
  const cola = lista().filter((x) => x.estado === "cola").sort((a, b) => a.actualizado.localeCompare(b.actualizado));
  for (const e of cola) {
    if (libres <= 0) break;
    // Sobre el repo (sin copia) solo corre uno, y nunca a la vez que otro que también use el repo.
    const usaRepo = !(e.copia && !e.copia.aplicada) && ajustes().encargos.aislamiento !== "copia";
    if (usaRepo && (corriendo.size || enDisco.length)) break;
    libres--;
    ejecutar(e);
  }
}

// Un encargo en marcha (el primero), para quien necesita saber si se puede publicar o actualizar.
export const ocupado = () => (corriendo.size ? corriendo.keys().next().value : null);
export const enMarcha = () => [...corriendo.keys()];

// Al arrancar el panel: lo que estaba en marcha se cortó con el reinicio. Lo que esperaba en cola, sigue.
for (const e of lista()) {
  if (e.estado === "en-curso") {
    const r = e.rondas[e.rondas.length - 1];
    r.estado = "error";
    r.error = "El panel se reinició mientras el agente trabajaba. Puedes pedir otra vuelta o seguir en la terminal.";
    e.estado = "error";
    guardar(e);
  }
}
setTimeout(siguiente, 500).unref();
// Si un encargo lo terminó una versión anterior del módulo, la vigente recoge la cola en menos de 30 s.
const vigilaCola = setInterval(() => { if (globalThis.__panelEncargosGen !== GEN) return clearInterval(vigilaCola); siguiente(); }, 30000);
// unref: que un `vite build` (que carga este módulo por vite.config.js) pueda terminar.
vigilaCola.unref();

export function resumenLista() {
  return lista().map(({ rondas, ...e }) => {
    const r = rondas[rondas.length - 1];
    return { ...e, rondas: rondas.length, ultima: { estado: r.estado, inicio: r.inicio, fin: r.fin, duracion: r.duracion, coste: r.coste, texto: r.texto } };
  });
}

export const comandoTerminal = (e) => (e.sesion ? `cd ${JSON.stringify(e.copia && !e.copia.aplicada && !e.copia.descartada ? aislada.ruta(e.id) : ROOT)} && claude --resume ${e.sesion}` : null);
