// Copias aisladas de los encargos: cada encargo trabaja en su propio git worktree, en <cerebro>/.moss/copias/<id>.
// La copia arranca con el estado actual del repo (lo que hay en HEAD más los cambios sin subir) para que el agente vea
// lo mismo que tú. Lo que cambie el agente se queda en la copia hasta que lo apliques al repo (o lo descartes).
// Las carpetas pesadas que git ignora (medios, node_modules) se comparten con enlaces simbólicos: agentes.compartidas.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT, ESTADO, cfg, rutas } from "./cerebro.js";

const DIR = path.join(ESTADO, "copias");
const IDENT = ["-c", "user.name=Moss", "-c", "user.email=moss@localhost", "-c", "commit.gpgsign=false"];
const git = (cwd, args, input) => execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 200e6, input, stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"] });
const valido = (id) => /^[a-z0-9-]{6,80}$/.test(id || "");

export const ruta = (id) => { if (!valido(id)) throw new Error("Id no válido"); return path.join(DIR, id); };
const compartidas = () => [...new Set([rutas.media, ...cfg.agentes.compartidas])].filter((p) => p && fs.existsSync(path.join(ROOT, p)));
const fuera = () => [".moss", ...compartidas()].map((p) => `:(exclude)${p}`);

// Crea la copia y deja un commit «base» con el estado actual del repo. Devuelve { base, creada }.
export function crear(id) {
  const dir = ruta(id);
  if (fs.existsSync(dir)) throw new Error("Ya existe una copia para este encargo");
  fs.mkdirSync(DIR, { recursive: true });
  git(ROOT, ["worktree", "add", "--detach", dir, "HEAD"]);
  try {
    // Cambios sin subir del repo: lo seguido (parche binario) y lo nuevo (copiado tal cual).
    const parche = git(ROOT, ["diff", "--binary", "HEAD", "--", ".", ...fuera()]);
    if (parche.trim()) git(dir, ["apply", "--whitespace=nowarn", "-"], parche);
    const nuevos = git(ROOT, ["ls-files", "--others", "--exclude-standard", "-z", "--", ".", ...fuera()]).split("\0").filter(Boolean);
    for (const f of nuevos) {
      const destino = path.join(dir, f);
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.cpSync(path.join(ROOT, f), destino, { verbatimSymlinks: true });
    }
    for (const p of compartidas()) {
      const destino = path.join(dir, p);
      if (fs.existsSync(destino)) continue;
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.symlinkSync(path.join(ROOT, p), destino);
    }
    git(dir, ["add", "-A", "--", ".", ...fuera()]);
    git(dir, [...IDENT, "commit", "-q", "--allow-empty", "--no-verify", "-m", "moss: estado del repo al empezar el encargo"]);
    return { base: git(dir, ["rev-parse", "HEAD"]).trim(), creada: new Date().toISOString() };
  } catch (x) {
    borrar(id);
    throw x;
  }
}

function preparar(id) {
  const dir = ruta(id);
  if (!fs.existsSync(dir)) throw new Error("La copia aislada ya no existe");
  git(dir, ["add", "-A", "--", ".", ...fuera()]);
  return dir;
}

// Qué ha cambiado en la copia desde la base: archivos con su estado y, si se pide, el diff (recortado).
export function cambios(id, base, { diff = true } = {}) {
  const dir = preparar(id);
  const archivos = git(dir, ["diff", "--cached", "--name-status", base]).split("\n").filter(Boolean).map((l) => { const [estado, ...r] = l.split("\t"); return { estado: estado[0], ruta: r[r.length - 1] }; });
  const num = git(dir, ["diff", "--cached", "--numstat", base]).split("\n").filter(Boolean).map((l) => l.split("\t"));
  const resumen = { archivos: archivos.length, mas: num.reduce((s, [a]) => s + (Number(a) || 0), 0), menos: num.reduce((s, [, b]) => s + (Number(b) || 0), 0) };
  const texto = diff ? git(dir, ["diff", "--cached", "--no-color", base]) : "";
  return { resumen, archivos, diff: texto.length > 400000 ? `${texto.slice(0, 400000)}\n… (recortado)` : texto };
}

// Aplica los cambios de la copia al repo y la borra. Si el repo cambió en esas mismas líneas, prueba la fusión a tres
// bandas; si aun así choca, no toca nada y lo dice.
export function aplicar(id, base) {
  const dir = preparar(id);
  const parche = git(dir, ["diff", "--cached", "--binary", base]);
  const archivos = git(dir, ["diff", "--cached", "--name-only", base]).split("\n").filter(Boolean);
  if (parche.trim()) {
    try { git(ROOT, ["apply", "--whitespace=nowarn", "-"], parche); }
    catch {
      try { git(ROOT, ["apply", "--3way", "--whitespace=nowarn", "-"], parche); }
      catch (x) { throw new Error(`Los cambios chocan con lo que hay ahora en el repo: ${String(x.stderr || x.message).split("\n").filter(Boolean).slice(-3).join(" ")}`); }
    }
  }
  borrar(id);
  return { archivos };
}

export function borrar(id) {
  const dir = ruta(id);
  try { git(ROOT, ["worktree", "remove", "--force", dir]); } catch { fs.rmSync(dir, { recursive: true, force: true }); }
  try { git(ROOT, ["worktree", "prune"]); } catch {}
}
