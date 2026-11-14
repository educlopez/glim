// Skills de la plataforma: un paquete de skills (SKILL.md) que enseña a cualquier agente a trabajar con un cerebro
// de Glim. Viven en <glim>/plantilla-cerebro/skills/<nombre>/ y se instalan en el cerebro:
//   - copia en <cerebro>/<rutas.skills o skills>/glim/<nombre>/
//   - enlaces relativos .claude/skills/<nombre> y .agents/skills/<nombre> → esa carpeta (Claude Code, Codex, Cursor…)
//   - <cerebro>/.glim/skills-lock.json con versión y sha256 de lo instalado
// Una skill que la persona ha editado (su hash ya no es el del lock) no se pisa nunca: se salta y se avisa.
// Sin dependencias del cerebro ni de Electron: lo usan electron/cerebro-nuevo.mjs (al crear un cerebro), server/api.js
// (botón de Ajustes y comprobación al arrancar) y los tests. Copia leyendo y escribiendo archivo a archivo, porque
// dentro de la app empaquetada el paquete está en el asar y fs.cpSync no sabe leer de ahí.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PAQUETE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "plantilla-cerebro", "skills");
export const LOCK = path.join(".glim", "skills-lock.json");
const ENLACES = [".claude/skills", ".agents/skills"];

export const carpetaSkillsGlim = (rutas) => `${(rutas && rutas.skills) || "skills"}/glim`;

function archivosDe(dir, base = dir, out = []) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (d.name === ".DS_Store") continue;
    const abs = path.join(dir, d.name);
    if (d.isDirectory()) archivosDe(abs, base, out);
    else if (d.isFile()) out.push(path.relative(base, abs).split(path.sep).join("/"));
  }
  return out;
}

// sha256 de una carpeta: rutas relativas ordenadas y su contenido. Igual en cualquier equipo.
export function hashCarpeta(dir) {
  const h = crypto.createHash("sha256");
  for (const rel of archivosDe(dir)) {
    h.update(rel); h.update("\0");
    h.update(fs.readFileSync(path.join(dir, rel))); h.update("\0");
  }
  return h.digest("hex");
}

const versionDe = (texto) => (/^version:\s*["']?([^"'\s]+)/m.exec(/^---\n([\s\S]*?)\n---/.exec(texto || "")?.[1] || "") || [])[1] || "0.0.0";

export function leerPaquete(origen = PAQUETE) {
  if (!fs.existsSync(origen)) return [];
  return fs.readdirSync(origen, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(origen, d.name, "SKILL.md")))
    .map((d) => d.name).sort()
    .map((nombre) => {
      const dir = path.join(origen, nombre);
      return { nombre, dir, version: versionDe(fs.readFileSync(path.join(dir, "SKILL.md"), "utf8")), sha256: hashCarpeta(dir) };
    });
}

function leerLock(raiz) {
  try { const j = JSON.parse(fs.readFileSync(path.join(raiz, LOCK), "utf8")); return j && j.skills ? j : { version: 1, skills: {} }; } catch { return { version: 1, skills: {} }; }
}

function copiar(de, a) {
  fs.rmSync(a, { recursive: true, force: true });
  for (const rel of archivosDe(de)) {
    fs.mkdirSync(path.dirname(path.join(a, rel)), { recursive: true });
    fs.writeFileSync(path.join(a, rel), fs.readFileSync(path.join(de, rel)));
  }
}

// Enlace relativo <raiz>/<base>/<nombre> → la carpeta instalada. No pisa nada que no sea ya ese mismo enlace.
function enlazar(raiz, base, nombre, destinoAbs, seco) {
  const carpeta = path.join(raiz, base);
  const enlace = path.join(carpeta, nombre);
  const rel = path.relative(carpeta, destinoAbs);
  try {
    if (fs.lstatSync(carpeta).isSymbolicLink()) return { enlace: `${base}/${nombre}`, estado: "omitido", motivo: `${base} es un enlace; no se crea nada dentro` };
  } catch { /* no existe: se crea */ }
  let actual = null;
  try { actual = fs.lstatSync(enlace); } catch { /* no existe */ }
  if (actual) {
    if (actual.isSymbolicLink() && path.resolve(carpeta, fs.readlinkSync(enlace)) === path.resolve(destinoAbs)) return { enlace: `${base}/${nombre}`, estado: "al-dia" };
    return { enlace: `${base}/${nombre}`, estado: "ocupado", motivo: "ya hay otra cosa con ese nombre; no se toca" };
  }
  if (!seco) {
    fs.mkdirSync(carpeta, { recursive: true });
    fs.symlinkSync(rel, enlace, "dir");
  }
  return { enlace: `${base}/${nombre}`, estado: "creado" };
}

// Instala o actualiza el paquete en el cerebro. seco: solo dice qué haría (para avisar al arrancar).
// Acciones por skill: instalada · actualizada · al-dia · editada (cambiada a mano: se salta) · ajena (ya había una
// carpeta con ese nombre que no instaló Glim: se salta).
export function instalarSkills(raiz, { origen = PAQUETE, rutas = null, seco = false } = {}) {
  const destinoRel = carpetaSkillsGlim(rutas);
  const paquete = leerPaquete(origen);
  const lock = leerLock(raiz);
  const nuevoLock = { version: 1, skills: { ...lock.skills } };
  const skills = [];
  const enlaces = [];
  for (const s of paquete) {
    const destino = path.join(raiz, destinoRel, s.nombre);
    const enLock = lock.skills[s.nombre];
    let accion;
    if (!fs.existsSync(destino)) accion = "instalada";
    else {
      const local = hashCarpeta(destino);
      if (local === s.sha256) accion = "al-dia";
      else if (!enLock) accion = "ajena";
      else if (local !== enLock.sha256) accion = "editada";
      else accion = "actualizada";
    }
    const r = { nombre: s.nombre, accion, version: s.version, anterior: enLock ? enLock.version : null, ruta: `${destinoRel}/${s.nombre}` };
    if (accion === "editada") r.motivo = "la has cambiado a mano: no se pisa. Borra la carpeta y vuelve a actualizar si quieres la versión de Glim.";
    if (accion === "ajena") r.motivo = "ya había una carpeta con ese nombre que no instaló Glim: no se toca.";
    skills.push(r);
    if (!seco && (accion === "instalada" || accion === "actualizada")) copiar(s.dir, destino);
    if (accion !== "editada" && accion !== "ajena") nuevoLock.skills[s.nombre] = { version: s.version, sha256: s.sha256, ruta: r.ruta };
    if (accion !== "ajena") for (const base of ENLACES) enlaces.push({ skill: s.nombre, ...enlazar(raiz, base, s.nombre, destino, seco) });
  }
  if (!seco && paquete.length) {
    const ordenado = { version: 1, skills: Object.fromEntries(Object.keys(nuevoLock.skills).sort().map((k) => [k, nuevoLock.skills[k]])) };
    const texto = `${JSON.stringify(ordenado, null, 2)}\n`;
    const abs = path.join(raiz, LOCK);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    if (!fs.existsSync(abs) || fs.readFileSync(abs, "utf8") !== texto) fs.writeFileSync(abs, texto);
  }
  const pendientes = skills.filter((x) => x.accion === "instalada" || x.accion === "actualizada").length + enlaces.filter((x) => x.estado === "creado").length;
  return { seco, destino: destinoRel, skills, enlaces, pendientes, saltadas: skills.filter((x) => x.accion === "editada" || x.accion === "ajena").length };
}
