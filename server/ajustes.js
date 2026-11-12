// Ajustes del panel (locales, en <cerebro>/.moss/ajustes.json) y claves de servicios en el Llavero de macOS.
// Las claves nunca se escriben en el repo, nunca vuelven al navegador y nunca se registran en ningún log.
// ESQUEMA define cada ajuste con su valor por defecto y lo que admite: lo que no encaja vuelve al valor por defecto.
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { ESTADO, cfg } from "./cerebro.js";

const F = path.join(ESTADO, "ajustes.json");
const uno = (...v) => ({ tipo: "uno", v });
const si = (d = true) => ({ tipo: "bool", d });

const ESQUEMA = {
  // Interfaz
  tema: { ...uno("sistema", "claro", "oscuro") },
  estilo: { ...uno("cristal", "clasico") }, // cristal: el desenfoque de la ventana se ve en toda ella, como Rex
  tenir: si(true), // teñir el cristal con el color del tema
  panelesCristal: si(false), // tarjetas y paneles también translúcidos
  densidad: { ...uno("comoda", "compacta") },
  textoLateral: { ...uno(13, 12, 14, 15) },
  animacion: { ...uno("agil", "natural", "no") },
  idioma: { ...uno("auto", "es", "en") }, // idioma de la interfaz; auto: el del cerebro (moss.config.json → idioma) o el del navegador
  // Icono de la app (server/icono.js): tinta del fondo y glifo.
  icono: {
    tinta: { ...uno("musgo", "naranja", "mandarina", "fresa", "frambuesa", "uva", "ciruela", "arandano", "aqua", "teal", "helecho", "moca", "grafito") },
    glifo: { ...uno("musgo", "brote", "estrella", "ventana", "monograma", "avatar") },
  },
  // Sonidos de interfaz (src/lib/sonidos.js): clics y confirmaciones sintetizados.
  sonidos: { activo: si(true), interfaz: si(true), volumen: { ...uno(70, 30, 50, 100) } },
  barraMenus: si(true), // icono en la barra de menús con el estado de los encargos
  mostrarAlAbrir: si(true),
  // Atajos
  atajoGlobal: { tipo: "texto", d: "Alt+Shift+M", max: 40 }, // muestra u oculta el panel desde cualquier app
  // Notificaciones
  notif: {
    sistema: si(true), badge: si(true),
    sonido: { ...uno("Glass", "Ping", "Pop", "Hero", "Submarine", "no") },
    terminado: si(true), fallo: si(true), publicado: si(true), cola: si(false),
  },
  // Encargos
  modelo: { ...uno("", "sonnet", "opus") },
  // Agente que hace los encargos (agentes.js) y modelo de cada uno (vacío: el que tenga por defecto su CLI).
  agente: { ...uno("claude", "codex", "cursor", "opencode", "gemini", "propio") },
  modelos: { claude: { tipo: "texto", d: "", max: 80 }, codex: { tipo: "texto", d: "", max: 80 }, cursor: { tipo: "texto", d: "", max: 80 }, opencode: { tipo: "texto", d: "", max: 80 }, gemini: { tipo: "texto", d: "", max: 80 } },
  // Encargos en una copia aislada (git worktree) y cuántos a la vez. Sin copia, uno solo y sobre el repo.
  encargos: { aislamiento: { ...uno("repo", "copia") }, paralelos: { ...uno(2, 1, 3, 4) } },
  comandoPropio: { tipo: "texto", d: "", max: 300 }, // p. ej. aider --yes-always --message {prompt}
  // Integraciones
  // Actualizaciones de la app (vivo.js): la app sigue main; cada cuánto mira y si se instala sola.
  actualizaciones: { cadaMin: { ...uno(15, 5, 30, 60) }, automaticas: si(false), novedades: si(true) },
  // Publicar cambios (publicar.js): revisión de Claude, fusión automática y espera antes de fusionar.
  publicar: { revisar: si(true), fusionarSola: si(true), esperaMin: { ...uno(2, 0, 5, 10) }, modelo: { ...uno("sonnet", "haiku", "opus") }, agente: { ...uno("claude", "codex") } },
  buffer: { cadaMin: { ...uno(10, 5, 15, 30, 60) }, autoPublicar: si(true) },
  dub: { activo: si(false), porDefecto: si(false), dominio: { tipo: "texto", d: "", max: 190 }, utm: si(true) },
};
export const SERVICIOS = { buffer: `${cfg.llavero}-buffer`, dub: `${cfg.llavero}-dub` };

const esHoja = (e) => e && typeof e.tipo === "string";
function defecto(esq) {
  return Object.fromEntries(Object.entries(esq).map(([k, e]) => [k, esHoja(e) ? (e.tipo === "uno" ? e.v[0] : e.d) : defecto(e)]));
}
function validar(esq, valor, base) {
  return Object.fromEntries(Object.entries(esq).map(([k, e]) => {
    const v = valor && typeof valor === "object" ? valor[k] : undefined;
    const b = base[k];
    if (!esHoja(e)) return [k, validar(e, v, b)];
    if (v === undefined) return [k, b];
    if (e.tipo === "bool") return [k, !!v];
    if (e.tipo === "uno") { const ok = e.v.find((x) => String(x) === String(v)); return [k, ok === undefined ? b : ok]; }
    return [k, String(v ?? "").trim().slice(0, e.max)];
  }));
}
export const POR_DEFECTO = defecto(ESQUEMA);

export function ajustes() {
  try { return validar(ESQUEMA, JSON.parse(fs.readFileSync(F, "utf8")), POR_DEFECTO); } catch { return structuredClone(POR_DEFECTO); }
}

export function guardar(patch) {
  const n = validar(ESQUEMA, patch || {}, ajustes());
  n.dub.dominio = n.dub.dominio.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  fs.mkdirSync(path.dirname(F), { recursive: true });
  fs.writeFileSync(F, JSON.stringify(n, null, 2));
  return n;
}

export function restablecer() {
  fs.mkdirSync(path.dirname(F), { recursive: true });
  const n = { ...structuredClone(POR_DEFECTO), buffer: ajustes().buffer, dub: ajustes().dub };
  fs.writeFileSync(F, JSON.stringify(n, null, 2));
  return n;
}

const run = (args) => new Promise((resolve) => execFile("security", args, { timeout: 5000 }, (err, out) => resolve({ ok: !err, out: String(out || "").trim() })));

export async function leerClave(servicio) {
  const env = { buffer: "BUFFER_API_KEY", dub: "DUB_API_KEY" }[servicio];
  if (env && process.env[env]) return process.env[env].trim();
  const r = await run(["find-generic-password", "-s", SERVICIOS[servicio], "-w"]);
  return r.ok && r.out ? r.out : null;
}

export async function hayClave(servicio) { return !!(await leerClave(servicio)); }

export async function guardarClave(servicio, clave) {
  if (!SERVICIOS[servicio]) throw new Error("Servicio no válido");
  const k = String(clave || "").trim();
  if (!/^[A-Za-z0-9_.-]{16,200}$/.test(k)) throw new Error("Eso no parece una clave de API (sin espacios, solo letras, números, _ . -)");
  const r = await run(["add-generic-password", "-U", "-a", servicio, "-s", SERVICIOS[servicio], "-w", k]);
  if (!r.ok) throw new Error("No se pudo guardar en el Llavero");
}

export async function borrarClave(servicio) {
  if (!SERVICIOS[servicio]) throw new Error("Servicio no válido");
  await run(["delete-generic-password", "-s", SERVICIOS[servicio]]);
}
