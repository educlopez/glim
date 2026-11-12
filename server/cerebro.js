// El cerebro: el repo de contenido que Moss abre (en el caso de su autor, marca-personal). Moss no sabe nada de
// él salvo lo que diga su `moss.config.json`: rutas, reglas, zona horaria, comprobaciones al publicar y qué
// módulos enseñar. Así la app no lleva datos personales y cualquiera puede apuntarla a su propio repo.
//
// Dónde se busca el cerebro, por orden: MOSS_BRAIN, la ruta guardada por la app (config.json en la carpeta de
// datos de Moss) y la carpeta actual si tiene moss.config.json. El estado local (encargos, ajustes, cachés)
// vive en `<cerebro>/.moss/`, que el cerebro ignora en git.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Esquema } from "./esquema.js";

export const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CONFIG = "moss.config.json";

// Carpeta de datos de la app (la misma que usa Electron con productName «Moss»).
export function carpetaApp() {
  const home = os.homedir();
  if (process.platform === "darwin") return path.join(home, "Library", "Application Support", "Moss");
  if (process.platform === "win32") return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "Moss");
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "Moss");
}

export const esCerebro = (p) => !!p && fs.existsSync(path.join(p, CONFIG));

export function buscarCerebro() {
  const guardada = (() => { try { return JSON.parse(fs.readFileSync(path.join(carpetaApp(), "config.json"), "utf8")).cerebro; } catch { return null; } })();
  const candidatas = [process.env.MOSS_BRAIN, guardada, process.cwd()].filter(Boolean).map((p) => path.resolve(p.replace(/^~(?=\/|$)/, os.homedir())));
  return candidatas.find(esCerebro) || null;
}

export { Esquema };

function cargar() {
  const root = buscarCerebro();
  if (!root) {
    const e = new Error(`No hay cerebro. Indica la carpeta con MOSS_BRAIN=/ruta/al/repo (debe tener ${CONFIG}) o elígela al abrir la app.`);
    e.code = "SIN_CEREBRO";
    throw e;
  }
  let crudo;
  try { crudo = JSON.parse(fs.readFileSync(path.join(root, CONFIG), "utf8")); } catch (x) { throw new Error(`${CONFIG} no es JSON válido: ${x.message}`); }
  const r = Esquema.safeParse(crudo);
  if (!r.success) throw new Error(`${CONFIG} no es válido:\n${r.error.issues.map((i) => `- ${i.path.join(".") || "(raíz)"}: ${i.message}`).join("\n")}`);
  r.data.zonaHoraria ||= Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return { root: fs.realpathSync(root), cfg: r.data };
}

const c = cargar();
export const ROOT = c.root;
export const cfg = c.cfg;
// Estado local de Moss para este cerebro (ignorado por git).
export const ESTADO = path.join(ROOT, ".moss");
fs.mkdirSync(ESTADO, { recursive: true });

export const rutas = cfg.rutas;
export const tiene = (clave) => !!rutas[clave] && fs.existsSync(path.join(ROOT, rutas[clave]));

// Fecha y hora en la zona del cerebro.
export const hoy = () => new Date().toLocaleDateString("sv-SE", { timeZone: cfg.zonaHoraria });
export function enZona(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const f = d.toLocaleString("sv-SE", { timeZone: cfg.zonaHoraria });
  return { dia: f.slice(0, 10), hora: f.slice(11, 16) };
}
export const horaCorta = (ms) => new Date(ms).toLocaleTimeString(cfg.idioma === "es" ? "es-ES" : cfg.idioma, { timeZone: cfg.zonaHoraria, hour: "2-digit", minute: "2-digit" });

// Lo que el panel enseña de la configuración (vistas y textos). Sin rutas absolutas.
export function resumen() {
  return {
    nombre: cfg.nombre, persona: cfg.persona, zonaHoraria: cfg.zonaHoraria, idioma: cfg.idioma, reglas: cfg.reglas, guias: cfg.guias,
    rutas: { aprendizajes: rutas.aprendizajes || null, borradores: rutas.borradores, avatar: tiene("avatar") ? rutas.avatar : null, lienzos: rutas.lienzos, kit: rutas.kitPublicacion || null, marcas: rutas.marcas || null, seriesCarrusel: rutas.seriesCarrusel || null, mediaCarruseles: rutas.mediaCarruseles || `${rutas.media}/carruseles` },
    redes: cfg.redes, cadencia: cfg.cadencia, llavero: cfg.llavero,
    autor: { nombre: cfg.autor.nombre || cfg.persona, usuario: cfg.autor.usuario || null },
    modulos: {
      registro: tiene("aprendizajes"), calendario: tiene("borradores"), plantillas: tiene("indiceRecursos"), carruseles: tiene("seriesCarrusel"),
      marcas: tiene("marcas"), ogs: tiene("ogs"), kit: !!rutas.kitPublicacion, referentes: tiene("referentes"), skills: tiene("skills"),
      buffer: !!cfg.integraciones.buffer, dub: !!cfg.integraciones.dub,
    },
  };
}
