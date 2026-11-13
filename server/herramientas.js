// Herramientas del sistema que usan Glim y sus agentes: si están, qué versión y, en gh, con qué cuenta hay sesión.
// Lo enseñan la bienvenida y Ajustes. Nunca devuelve la salida en bruto de `gh auth status` (incluye el token
// enmascarado): solo el nombre de la cuenta.
import { execFile } from "node:child_process";

const run = (bin, args, timeout = 8000) => new Promise((resolve) => {
  execFile(bin, args, { timeout, env: process.env }, (err, out, errOut) => resolve({ ok: !err, out: `${out || ""}\n${errOut || ""}`.trim() }));
});

// Qué usa cada una (la etiqueta sale de herramientas.para.<id> en los textos de la interfaz).
export const LISTA = [
  { id: "git", nombre: "Git", args: ["--version"], instalar: "xcode-select --install", obligatoria: true },
  { id: "gh", nombre: "GitHub CLI", args: ["--version"], instalar: "brew install gh", sesion: { args: ["auth", "status"], comando: "gh auth login" } },
  { id: "python3", nombre: "Python 3", args: ["--version"], instalar: "xcode-select --install" },
  { id: "node", nombre: "Node.js", args: ["--version"], instalar: "brew install node", opcional: true },
  { id: "ffmpeg", nombre: "FFmpeg", args: ["-version"], instalar: "brew install ffmpeg", opcional: true },
];

// «Logged in to github.com account ana (keyring)» o, en versiones viejas, «Logged in to github.com as ana».
export function cuentaGh(texto) {
  const m = /Logged in to \S+ (?:account|as) ([\w.-]+)/.exec(String(texto || ""));
  return m ? m[1] : null;
}

// Primera cifra con forma de versión: «git version 2.47.1» → 2.47.1, «ffmpeg version 7.1-tessus» → 7.1.
export function version(texto) {
  const m = /(\d+\.\d+(?:\.\d+)?)/.exec(String(texto || ""));
  return m ? m[1] : null;
}

let cache = null;

export async function estado(forzar = false) {
  if (cache && !forzar && Date.now() - cache.t < 30000) return cache.valor;
  // Sin las herramientas de línea de comandos de Xcode, /usr/bin/git y /usr/bin/python3 son lanzadores que abren el
  // instalador de Apple: se miran sin ejecutarlos.
  const clt = (await run("xcode-select", ["-p"])).ok;
  const donde = async (bin) => { const r = await run("/usr/bin/which", [bin]); return r.ok ? r.out.split("\n")[0] : null; };
  const brew = !!(await donde("brew"));
  const herramientas = await Promise.all(LISTA.map(async (h) => {
    const ruta = await donde(h.id);
    const lanzador = !clt && ruta && ruta.startsWith("/usr/bin/");
    const v = ruta && !lanzador ? await run(ruta, h.args) : null;
    const instalado = !!(v && v.ok);
    let sesion = null;
    if (h.sesion && instalado) {
      const s = await run(ruta, h.sesion.args);
      const cuenta = cuentaGh(s.out);
      sesion = { ok: s.ok && !!cuenta, cuenta, comando: h.sesion.comando };
    }
    return { id: h.id, nombre: h.nombre, instalado, version: instalado ? version(v.out) : null, obligatoria: !!h.obligatoria, opcional: !!h.opcional, instalar: h.instalar, sesion };
  }));
  const valor = { herramientas, clt, brew };
  cache = { t: Date.now(), valor };
  return valor;
}
