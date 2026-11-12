// Mantiene Moss y el cerebro al día:
// 1. Vigila el cerebro (FSEvents, recursivo) y avisa a la ventana para que relea en cuanto cambia un archivo.
// 2. Cerebro: mira GitHub cada pocos minutos (git fetch), dice si hay cambios por traer y los trae (solo avance rápido).
// 3. App: si Moss corre desde su checkout de git, mira si su rama principal trae versiones nuevas y se actualiza
//    (pull, npm ci si cambió el lock, reinstalar la app si cambió electron/). Las instalaciones desde una release
//    se actualizan con las releases de GitHub.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { ROOT, APP, ESTADO, cfg } from "./cerebro.js";
import { ajustes } from "./ajustes.js";

const IGNORAR = /^(\.git|\.moss|node_modules|media\/referencias\/(previas|archivo|subidas\/pendientes)|.*\/node_modules|.*\.DS_Store$|.*~$)(\/|$)/;
const PRIVADAS = cfg.privadas.map((r) => r.replace(/\/$/, ""));
const hash = (f) => { try { return crypto.createHash("sha1").update(fs.readFileSync(f)).digest("hex").slice(0, 12); } catch { return null; } };
const gitEn = (cwd) => (args, timeout = 30000) => new Promise((resolve) => execFile("git", args, { cwd, timeout, maxBuffer: 10e6, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } }, (err, stdout, stderr) => resolve({ ok: !err, out: String(stdout || "").trim(), err: String(stderr || err?.message || "").trim() })));
const git = gitEn(ROOT);
const gitApp = gitEn(APP);
const RAMA_APP = "main";
const esCheckout = fs.existsSync(path.join(APP, ".git"));

const LOCK_AL_ARRANCAR = hash(path.join(APP, "package-lock.json"));
let ultimoFetch = 0;
let ultimoFetchApp = 0;
let estadoGit = null;
let trabajando = null;
const INICIO = Date.now();
let emitir = () => {};
let reiniciarServidor = null;
const VERSION = (() => { try { return JSON.parse(fs.readFileSync(path.join(APP, "package.json"), "utf8")).version; } catch { return null; } })();

// Arranca la vigilancia. Devuelve la función que la para.
export function vigilar({ emitir: e, reiniciar } = {}) {
  emitir = e || emitir;
  reiniciarServidor = reiniciar || null;
  let pendientes = new Set();
  let t = null;
  let w = null;
  try {
    w = fs.watch(ROOT, { recursive: true }, (_, f) => {
      if (!f || IGNORAR.test(f) || PRIVADAS.some((p) => f === p || f.startsWith(`${p}/`))) return;
      pendientes.add(f);
      clearTimeout(t);
      t = setTimeout(() => { emitir("repo:cambio", { archivos: [...pendientes].slice(0, 50) }); pendientes = new Set(); }, 350);
    });
  } catch (x) { console.warn("[moss] no se pudo vigilar el cerebro:", x.message); }
  // Primera comprobación al arrancar y luego cada minuto mira si toca (Ajustes → Actualizaciones).
  const t0 = setTimeout(() => ciclo().catch(() => {}), 1500);
  let ultima = Date.now();
  const i = setInterval(() => {
    const cada = ajustes().actualizaciones.cadaMin * 60000;
    if (Date.now() - ultima < cada) return;
    ultima = Date.now();
    ciclo().catch(() => {});
  }, 60000);
  t0.unref?.(); i.unref?.();
  return () => { clearInterval(i); clearTimeout(t0); clearTimeout(t); if (w) w.close(); };
}

async function ciclo() {
  await estado(true);
  if (esCheckout) await actualizacion(true);
  await automatica();
}

// ---- Cerebro ----
export async function estado(conFetch = false) {
  if (conFetch && Date.now() - ultimoFetch > 60000) {
    ultimoFetch = Date.now();
    await git(["fetch", "--quiet", "origin"], 60000);
  }
  const rama = (await git(["rev-parse", "--abbrev-ref", "HEAD"])).out;
  const up = await git(["rev-parse", "--abbrev-ref", "@{u}"]);
  const cuenta = async (a, b) => { const r = await git(["rev-list", "--left-right", "--count", `${a}...${b}`]); const [ad, at] = r.out.split(/\s+/).map(Number); return r.ok ? { adelante: ad, atras: at } : null; };
  const cambios = (await git(["status", "--porcelain"])).out.split("\n").filter(Boolean).length;
  const principal = cfg.publicar.rama;
  estadoGit = {
    cerebro: cfg.nombre,
    rama,
    remoto: up.ok ? up.out : null,
    frenteRemoto: up.ok ? await cuenta("HEAD", up.out) : null,
    frenteMain: rama !== principal ? await cuenta("HEAD", `origin/${principal}`) : null,
    principal,
    cambiosLocales: cambios,
    ultimoFetch: ultimoFetch ? new Date(ultimoFetch).toISOString() : null,
    npmInstall: hash(path.join(APP, "package-lock.json")) !== LOCK_AL_ARRANCAR,
    app: process.env.MOSS_APP_HASH ? { nueva: hash(path.join(APP, "electron", "main.mjs")) !== process.env.MOSS_APP_HASH } : null,
    trabajando,
    servidor: { inicio: new Date(INICIO).toISOString(), pid: process.pid, version: VERSION, node: process.versions.node, enApp: !!process.env.MOSS_APP, checkout: esCheckout },
  };
  return estadoGit;
}

function correr(cmd, args, cwd) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, env: process.env });
    let log = "";
    p.stdout.on("data", (c) => { log += c; });
    p.stderr.on("data", (c) => { log += c; });
    p.on("close", (code) => resolve({ ok: code === 0, log: log.trim().split("\n").slice(-15).join("\n") }));
    p.on("error", (e) => resolve({ ok: false, log: e.message }));
  });
}

const OCUPADO = "Hay un agente trabajando en un encargo. Espera a que termine.";

// Reinicia el servidor (relee la configuración y los módulos de server/). Solo en modo desarrollo (Vite).
export async function reiniciar(ocupado) {
  if (ocupado) throw new Error(OCUPADO);
  if (!reiniciarServidor) throw new Error("Este servidor no se reinicia en caliente: cierra y abre la app.");
  setTimeout(() => Promise.resolve(reiniciarServidor()).catch((e) => console.warn("[moss] reinicio:", e.message)), 200);
  return { ok: true };
}

// Abre en el Finder la carpeta del cerebro, la de datos locales o la de la app.
export function abrirCarpeta(que) {
  const dir = que === "datos" ? ESTADO : que === "app" ? APP : ROOT;
  fs.mkdirSync(dir, { recursive: true });
  spawn("open", [dir], { detached: true, stdio: "ignore" }).unref();
  return { ok: true };
}

// Trae al cerebro los cambios de la rama remota de la rama actual. Solo avance rápido: nunca fusiona ni pisa trabajo local.
export async function traer(ocupado) {
  if (ocupado) throw new Error(OCUPADO);
  if (trabajando) throw new Error("Ya hay una actualización en marcha.");
  const e = await estado(true);
  if (!e.remoto) throw new Error(`La rama ${e.rama} no tiene rama remota. Para traer ${e.principal} hay que cambiar de rama o fusionar a mano.`);
  trabajando = "git";
  try {
    const r = await git(["pull", "--ff-only"], 120000);
    if (!r.ok) throw new Error(r.err.split("\n").slice(-4).join("\n") || "git pull falló");
    return { git: r.out || "Al día", estado: await estado() };
  } finally { trabajando = null; }
}

export async function instalarDependencias() {
  if (!esCheckout) throw new Error("Esta instalación de Moss no es un checkout de git.");
  if (trabajando) throw new Error("Ya hay una actualización en marcha.");
  trabajando = "npm";
  try { const r = await correr("npm", ["ci", "--no-audit", "--no-fund"], APP); if (!r.ok) throw new Error(r.log); return { log: r.log }; }
  finally { trabajando = null; }
}

// Recompila la app de Mac y la copia a ~/Applications. La ventana la reabre después (relanzar).
export async function reinstalarApp(ocupado) {
  if (ocupado) throw new Error(OCUPADO);
  if (!esCheckout) throw new Error("Esta instalación de Moss no es un checkout de git.");
  if (trabajando) throw new Error("Ya hay una actualización en marcha.");
  trabajando = "app";
  try {
    const r = await correr("npm", ["run", "app:instalar"], APP);
    if (!r.ok) throw new Error(r.log);
    return { log: r.log };
  } finally { trabajando = null; }
}

// ---- App (checkout de git): sigue su rama principal, como una app de Mac ----
const versionDe = (texto) => { try { return JSON.parse(texto).version || null; } catch { return null; } };
export async function actualizacion(conFetch = false) {
  if (!esCheckout) return { checkout: false, disponible: false, versionLocal: version(), trabajando };
  if (conFetch && Date.now() - ultimoFetchApp > 60000) {
    ultimoFetchApp = Date.now();
    await gitApp(["fetch", "--quiet", "origin", RAMA_APP], 60000);
  }
  const rama = (await gitApp(["rev-parse", "--abbrev-ref", "HEAD"])).out;
  const limpio = !(await gitApp(["status", "--porcelain"])).out;
  const ref = `origin/${RAMA_APP}`;
  const atras = Number((await gitApp(["rev-list", "--count", `HEAD..${ref}`])).out) || 0;
  const commits = atras ? (await gitApp(["log", "--format=%h%x09%s", "-n", "20", `HEAD..${ref}`])).out.split("\n").filter(Boolean).map((l) => { const [sha, ...t] = l.split("\t"); return { sha, titulo: t.join("\t") }; }) : [];
  const archivos = atras ? (await gitApp(["diff", "--name-only", `HEAD...${ref}`])).out.split("\n").filter(Boolean) : [];
  const remota = versionDe((await gitApp(["show", `${ref}:package.json`])).out);
  return {
    checkout: true, rama, limpio, atras, commits, versionLocal: version(), versionRemota: remota,
    disponible: atras > 0,
    requiereApp: archivos.some((f) => f.startsWith("electron/")),
    requiereNpm: archivos.includes("package-lock.json"),
    // Lo que impide actualizar sin preguntar: cambios sin subir u otra rama.
    bloqueo: !limpio ? "cambios-locales" : rama !== RAMA_APP ? "otra-rama" : null,
    trabajando, ultimoFetch: ultimoFetchApp ? new Date(ultimoFetchApp).toISOString() : null,
  };
}

// Aplica la actualización de la app: avance rápido, dependencias y, si cambió el núcleo (electron/), la reinstala y
// la reinicia. Si no, basta recargar la ventana.
export async function actualizar(ocupado, { relanzar = false } = {}) {
  if (ocupado) throw new Error(OCUPADO);
  if (trabajando) throw new Error("Ya hay una actualización en marcha.");
  const a = await actualizacion(true);
  if (!a.checkout) throw new Error("Esta instalación se actualiza con las releases de GitHub.");
  if (!a.limpio) throw new Error("La carpeta de Moss tiene cambios sin subir. Súbelos o descártalos antes de actualizar.");
  trabajando = "actualizar";
  try {
    if (a.rama !== RAMA_APP) { const sw = await gitApp(["switch", RAMA_APP]); if (!sw.ok) throw new Error(sw.err); }
    const r = await gitApp(["pull", "--ff-only", "origin", RAMA_APP], 120000);
    if (!r.ok) throw new Error(r.err.split("\n").slice(-3).join(" ") || "git pull falló");
    if (a.requiereNpm || hash(path.join(APP, "package-lock.json")) !== LOCK_AL_ARRANCAR) {
      const n = await correr("npm", ["ci", "--no-audit", "--no-fund"], APP);
      if (!n.ok) throw new Error(`npm ci: ${n.log.slice(-300)}`);
    }
    if (a.requiereApp) {
      trabajando = "app";
      const ap = await correr("npm", ["run", "app:instalar"], APP);
      if (!ap.ok) throw new Error(`Reinstalar la app: ${ap.log.slice(-300)}`);
      const e = globalThis.panelElectron;
      if (relanzar && e && e.app) setTimeout(() => { e.app.relaunch(); e.app.exit(0); }, 600);
    }
    return { ok: true, version: a.versionRemota, commits: a.commits, reinicio: a.requiereApp ? "app" : "ventana" };
  } finally { trabajando = null; }
}

// Modo automático (Ajustes → Actualizaciones): solo sin cambios locales, ni encargo, ni publicación en marcha.
// Trae el cerebro (avance rápido en su rama principal) y actualiza la app si corre desde su checkout.
async function automatica() {
  if (!ajustes().actualizaciones.automaticas || trabajando) return;
  const { ocupado } = await import("./encargos.js");
  const pub = await import("./publicar.js");
  const p = pub.estado();
  if (ocupado() || (p && ["en-curso", "esperando"].includes(p.estado))) return;
  const e = estadoGit || (await estado(false));
  if (e.rama === e.principal && !e.cambiosLocales && e.frenteRemoto && e.frenteRemoto.atras > 0 && !e.frenteRemoto.adelante) {
    const r = await git(["pull", "--ff-only"], 120000);
    if (r.ok) { await estado(false); emitir("repo:cambio", { archivos: ["git"] }); }
  }
  const a = await actualizacion(false);
  if (!a.disponible || a.bloqueo) return;
  try {
    const r = await actualizar(null, { relanzar: true });
    if (r.reinicio === "ventana") emitir("panel:actualizado", r);
  } catch (x) { console.warn("[moss] actualización automática:", x.message); }
}

// Novedades de Moss (changelog/<versión>.md, como el changelog de Pond), de la más nueva a la más vieja.
const cmpVer = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
export function novedades() {
  const dir = path.join(APP, "changelog");
  let lista = [];
  try { lista = fs.readdirSync(dir).filter((f) => /^\d+\.\d+\.\d+\.md$/.test(f)); } catch {}
  return lista.map((f) => {
    const t = fs.readFileSync(path.join(dir, f), "utf8");
    const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(t) || [null, "", t];
    const fm = Object.fromEntries(m[1].split("\n").map((l) => { const i = l.indexOf(":"); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }).filter(([k]) => k));
    return { version: fm.version || f.replace(/\.md$/, ""), fecha: fm.date || null, titulo: fm.title || "", resumen: fm.summary || "", cuerpo: m[2].trim() };
  }).sort((a, b) => cmpVer(b.version, a.version));
}
export const version = () => { try { return JSON.parse(fs.readFileSync(path.join(APP, "package.json"), "utf8")).version; } catch { return VERSION; } };
