// Convierte una carpeta en un cerebro de Glim (o crea uno nuevo) con lo que la persona contó en la bienvenida.
// Solo escribe lo que falta: nunca pisa un AGENTS.md, un CLAUDE.md, un .gitignore ni una carpeta que ya existan.
// Sin Electron dentro, para poder probarlo (test/cerebro-nuevo.test.js).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const REDES = ["X", "LinkedIn", "Threads"];
const DIAS = 7;
// Archivos de reglas que ya usan los agentes: si el repo tiene uno, el cerebro lo reutiliza en vez de crear otro.
const REGLAS = ["AGENTS.md", "CLAUDE.md"];
const IGNORAR = [".glim/", "privado/", ".DS_Store"];

const limpio = (s, max) => String(s || "").trim().slice(0, max);

export function reglasExistentes(dir) {
  return REGLAS.find((f) => fs.existsSync(path.join(dir, f))) || null;
}

// Qué hay ya en la carpeta: lo usa la bienvenida para decir qué va a crear.
export function describir(dir) {
  const hay = (f) => fs.existsSync(path.join(dir, f));
  let nombre = path.basename(dir);
  if (hay("glim.config.json")) { try { nombre = JSON.parse(fs.readFileSync(path.join(dir, "glim.config.json"), "utf8")).nombre || nombre; } catch { /* config rota: el servidor dirá qué falla */ } }
  const entradas = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => !f.startsWith(".")) : [];
  const reglas = reglasExistentes(dir);
  return {
    dir, nombre,
    esCerebro: hay("glim.config.json"),
    esGit: hay(".git"),
    vacia: entradas.length === 0,
    reglas,
    // Lo que se crearía al convertirla, en el orden en que se enseña.
    crear: ["glim.config.json", reglas ? null : "AGENTS.md", hay("borradores") ? null : "borradores/", hay("aprendizajes.md") ? null : "aprendizajes.md"].filter(Boolean),
  };
}

// Cadencia: un 0/1 por día (lunes primero) y solo para las redes elegidas.
function cadenciaDe(redes, cadencia) {
  const out = {};
  for (const r of redes) {
    const dias = Array.isArray(cadencia && cadencia[r]) ? cadencia[r] : [];
    const fila = Array.from({ length: DIAS }, (_, i) => (Number(dias[i]) > 0 ? Math.min(9, Math.round(Number(dias[i]))) : 0));
    if (fila.some(Boolean)) out[r] = fila;
  }
  return out;
}

export function configNueva(datos, { reglas = null } = {}) {
  const d = datos || {};
  const nombre = limpio(d.nombre, 60) || "mi-cerebro";
  const redes = (Array.isArray(d.redes) ? d.redes : []).filter((r) => REDES.includes(r));
  const autor = { nombre: limpio(d.autor && d.autor.nombre, 60) || undefined, usuario: limpio(d.autor && d.autor.usuario, 40).replace(/^@/, "") || undefined };
  const cfg = {
    $schema: "https://raw.githubusercontent.com/educlopez/glim/main/schema/glim.config.schema.json",
    nombre,
    persona: limpio(d.persona, 40) || "tú",
    autor: Object.fromEntries(Object.entries(autor).filter(([, v]) => v)),
    zonaHoraria: limpio(d.zonaHoraria, 64) || undefined,
    idioma: d.idioma === "en" ? "en" : "es",
    reglas: reglas || "AGENTS.md",
    rutas: { borradores: "borradores", aprendizajes: "aprendizajes.md" },
    privadas: ["privado/"],
    redes: redes.length ? redes : ["X", "LinkedIn"],
    cadencia: cadenciaDe(redes, d.cadencia),
    publicar: { rama: "main", prefijos: { "borradores/": "borradores" }, prefijoPorDefecto: "repo" },
  };
  if (!Object.keys(cfg.autor).length) delete cfg.autor;
  if (!cfg.zonaHoraria) delete cfg.zonaHoraria;
  if (!Object.keys(cfg.cadencia).length) delete cfg.cadencia;
  return cfg;
}

// Líneas que faltan en el .gitignore para que el estado local y lo privado nunca se suban.
export function faltanEnGitignore(texto) {
  const lineas = new Set(String(texto || "").split(/\r?\n/).map((l) => l.trim()));
  return IGNORAR.filter((l) => !lineas.has(l) && !lineas.has(l.replace(/\/$/, "")));
}

export function prepararCerebro(dir, datos) {
  fs.mkdirSync(dir, { recursive: true });
  const f = (n) => path.join(dir, n);
  if (fs.existsSync(f("glim.config.json"))) return dir;
  const reglas = reglasExistentes(dir);
  const cfg = configNueva(datos, { reglas });
  fs.writeFileSync(f("glim.config.json"), JSON.stringify(cfg, null, 2) + "\n");
  if (!reglas) {
    const quien = cfg.persona === "tú" ? "la persona" : cfg.persona;
    fs.writeFileSync(f("AGENTS.md"), `# ${cfg.nombre}\n\nReglas para los agentes que trabajan en este repo.\n\n## Reglas duras\n\n1. Nunca publicar ni programar nada sin el OK explícito de ${quien}.\n`);
  }
  fs.mkdirSync(f("borradores"), { recursive: true });
  if (!fs.existsSync(f("aprendizajes.md"))) fs.writeFileSync(f("aprendizajes.md"), "# Aprendizajes\n");
  const gi = fs.existsSync(f(".gitignore")) ? fs.readFileSync(f(".gitignore"), "utf8") : "";
  const faltan = faltanEnGitignore(gi);
  if (faltan.length) fs.writeFileSync(f(".gitignore"), `${gi}${gi && !gi.endsWith("\n") ? "\n" : ""}${faltan.join("\n")}\n`);
  if (!fs.existsSync(f(".git"))) { try { execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir, stdio: "ignore" }); } catch { /* sin git: funciona igual, sin publicar */ } }
  return dir;
}
