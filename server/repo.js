// Acceso de solo lectura al repo. Todo lo que el panel sirve pasa por aquí.
import fs from "node:fs";
import path from "node:path";
import { ROOT, cfg, hoy } from "./cerebro.js";

export { ROOT };
const comoRegex = (r) => new RegExp(`^${r.replace(/\/$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(/|$)`);

// Nunca se sirve: lo privado del cerebro (moss.config.json → privadas), el estado local de Moss (salvo las notas de
// feedback), secretos, git y dependencias.
export const DENY = [...cfg.privadas.map(comoRegex), /^\.moss\/(?!(feedback|iconos)\/)/, /(^|\/)\.env/, /(^|\/)node_modules(\/|$)/, /(^|\/)\.git(\/|$)/, /\.(pem|key)$/];

export const MIME = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".pdf": "application/pdf",
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".ttf": "font/ttf", ".otf": "font/otf", ".woff2": "font/woff2", ".woff": "font/woff",
};

export function kindOf(p) {
  const e = path.extname(p).toLowerCase();
  if ([".mp4", ".webm", ".mov"].includes(e)) return "video";
  if ([".mp3", ".wav"].includes(e)) return "audio";
  if (e === ".pdf") return "pdf";
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(e)) return "image";
  return "file";
}

// Normaliza una ruta relativa y la rechaza si sale del repo o cae en DENY.
export function safe(rel) {
  const clean = path.posix.normalize(String(rel || "").replace(/\\/g, "/")).replace(/^\/+/, "");
  if (!clean || clean === "." || clean.startsWith("..") || DENY.some((r) => r.test(clean))) return null;
  const abs = path.join(ROOT, clean);
  if (!abs.startsWith(ROOT + path.sep)) return null;
  return { rel: clean, abs };
}

const abs = (rel) => path.join(ROOT, rel);
export const read = (rel) => { try { return fs.readFileSync(abs(rel), "utf8"); } catch { return null; } };
export const readJson = (rel) => { try { return JSON.parse(read(rel)); } catch { return null; } };
export const exists = (rel) => fs.existsSync(abs(rel));
export const isDir = (rel) => { try { return fs.statSync(abs(rel)).isDirectory(); } catch { return false; } };
export const mtime = (rel) => { try { return fs.statSync(abs(rel)).mtimeMs; } catch { return 0; } };
export const ls = (rel) => { try { return fs.readdirSync(abs(rel), { withFileTypes: true }).filter((d) => !d.name.startsWith(".")); } catch { return []; } };

export function walk(rel, keep, depth = 6, out = []) {
  if (depth < 0) return out;
  for (const d of ls(rel)) {
    const p = rel ? `${rel}/${d.name}` : d.name;
    if (DENY.some((r) => r.test(p))) continue;
    if (d.isDirectory()) walk(p, keep, depth - 1, out);
    else if (keep(p)) out.push(p);
  }
  return out;
}

// Frontmatter `clave: valor` línea a línea. Los valores llevan dos puntos y paréntesis, y un YAML estricto falla con ellos.
export function frontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text || "");
  const fm = {};
  if (!m) return { fm, body: text || "" };
  let key = null;
  for (const line of m[1].split("\n")) {
    const kv = /^([A-Za-z_][\w-]*):\s?(.*)$/.exec(line);
    if (kv) { key = kv[1]; fm[key] = kv[2].trim(); }
    else if (key && line.trim()) fm[key] = (fm[key] + " " + line.trim()).trim();
  }
  for (const k of Object.keys(fm)) fm[k] = fm[k].replace(/^"(.*)"$/, "$1");
  return { fm, body: text.slice(m[0].length) };
}

export const firstHeading = (text, fallback) => (/^#\s+(.+)$/m.exec(text || "") || [])[1] || fallback;

// Fecha de hoy (AAAA-MM-DD) en la zona horaria del cerebro.
export const hoyLocal = hoy;
