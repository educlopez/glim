// Icono personalizable de la app (Ajustes → Interfaz → Icono): tinta y glifo. Lo dibuja icono.py según
// la plantilla de iconos de macOS y se aplica en caliente:
//   - Dock: app.dock.setIcon, a 512 px (AppKit guarda ~32 MB por cada representación de 1024 px).
//   - Barra de menús: imagen plantilla negra de 18 pt; macOS la tiñe en claro y oscuro.
//   - Bundle (Finder, Launchpad y el Dock con la app cerrada): NSWorkspace setIcon:forFile: por osascript, como Pond.
// Una sola versión, la misma en claro y en oscuro, como los iconos de macOS. Caché en <cerebro>/.moss/iconos/.
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ROOT } from "./repo.js";
import { ESTADO, rutas, cfg } from "./cerebro.js";

// Iniciales del monograma: las de la persona del cerebro.
const INICIALES = cfg.persona.split(/\s+/).map((w) => w[0] || "").join("").toLowerCase().slice(0, 2) || "m";
import { ajustes } from "./ajustes.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PY = path.join(AQUI, "icono.py");
const DIR = path.join(ESTADO, "iconos");
const AVATAR = rutas.avatar ? path.join(ROOT, rutas.avatar) : null;
const run = (cmd, args, timeout = 120000) => new Promise((resolve) => execFile(cmd, args, { timeout, maxBuffer: 5e6 }, (err, out, e) => resolve({ ok: !err, out: String(out || ""), err: String(e || err?.message || "") })));

const el = () => { const e = globalThis.panelElectron; return e && e.app ? e : null; };

// Dibuja (o reutiliza) el PNG de 1024 y la plantilla de la barra para una combinación.
export async function generar({ tinta, glifo }) {
  if (!TINTAS.includes(tinta) || !GLIFOS.includes(glifo)) throw new Error("Tinta o glifo no válidos");
  fs.mkdirSync(DIR, { recursive: true });
  const png = path.join(DIR, `v2-${tinta}-${glifo}.png`);
  const barraDir = path.join(DIR, `barra-${glifo}`);
  const barra = path.join(barraDir, "trayTemplate.png");
  if (!fs.existsSync(png) || !fs.existsSync(barra)) {
    fs.mkdirSync(barraDir, { recursive: true });
    const r = await run("python3", ["-I", PY, JSON.stringify({ tinta, glifo, avatar: AVATAR, iniciales: INICIALES, salida: png, barra })]);
    if (!r.ok) throw new Error(`No se pudo dibujar el icono: ${r.err.split("\n").slice(-2).join(" ")}`);
  }
  return { png, barra, rel: path.relative(ROOT, png) };
}

let aplicado = null;
let bundleCola = Promise.resolve();

// Aplica el icono de los ajustes actuales. Sin Electron (navegador) solo genera la vista previa.
export async function aplicar() {
  const i = ajustes().icono;
  const g = await generar({ tinta: i.tinta, glifo: i.glifo });
  const e = el();
  if (!e) return g;
  const clave = `${g.png}|${g.barra}`;
  if (clave !== aplicado) {
    aplicado = clave;
    if (e.app.dock) e.app.dock.setIcon(e.nativeImage.createFromPath(g.png).resize({ width: 512, height: 512, quality: "best" }));
    if (typeof e.ponerBarra === "function") e.ponerBarra(g.barra);
    bundleCola = bundleCola.then(() => iconoBundle(g.png)).catch(() => {});
  }
  return g;
}

// Ruta del .app que está corriendo (solo si es la app instalada, nunca el Electron de node_modules).
function bundle() {
  const e = el();
  const exe = e && e.app.getPath("exe");
  const m = exe && /^(.*?\.app)\/Contents\/MacOS\//.exec(exe);
  if (!m || m[1].includes("node_modules")) return null;
  return m[1];
}

let ultimoBundle = null;
async function iconoBundle(png) {
  const app = bundle();
  if (!app || png === ultimoBundle) return;
  ultimoBundle = png;
  const js = `ObjC.import("AppKit");
const img = $.NSImage.alloc.initWithContentsOfFile(${JSON.stringify(png)});
if (!$.NSWorkspace.sharedWorkspace.setIconForFileOptions(img, ${JSON.stringify(app)}, 0)) throw new Error("setIcon");`;
  const r = await run("/usr/bin/osascript", ["-l", "JavaScript", "-e", js], 30000);
  if (!r.ok) console.warn("[panel] icono del bundle:", r.err.slice(0, 200));
}

export const TINTAS = ["naranja", "mandarina", "fresa", "frambuesa", "uva", "ciruela", "arandano", "aqua", "teal", "helecho", "musgo", "moca", "grafito"];
export const GLIFOS = ["musgo", "brote", "estrella", "ventana", "monograma", "avatar"];
