// Lectores de plataformas: de un enlace que pegas (X, Instagram, Threads, LinkedIn, Pinterest, Dribbble, YouTube,
// Vimeo, TikTok, Behance, Are.na, Savee, Cosmos y webs en general) sacan el vídeo o las imágenes en calidad original,
// el texto y el autor. Idea de los extractores de Pond (raphaelsalaja/pond), reimplementada a escala de una persona:
// - Solo enlaces que pegas tú, uno a uno. No hay sincronización de cuentas, ni rastreo, ni descargas en bloque.
// - Pausa de 5 s entre visitas al mismo sitio y una ventana a la vez (navegador.js).
// - Usan la sesión propia de los lectores, si iniciaste sesión en ese sitio (Ajustes → Integraciones → Lectores).
// Primero yt-dlp (vídeo); si no hay vídeo, la página renderizada en una ventana oculta (imágenes y texto).
// Lo leído espera en media/referencias/subidas/pendientes/<id>/ hasta que guardas la referencia.
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { ROOT } from "./repo.js";
import { rutas } from "./cerebro.js";
import * as nav from "./navegador.js";

export const PENDIENTES = `${rutas.mediaReferencias}/subidas/pendientes`;
const abs = (rel) => path.join(ROOT, rel);

const PLATAFORMAS = [
  { id: "x", re: /(^|\.)(x|twitter)\.com$/, nombre: "X", video: true, cookies: "x.com" },
  { id: "instagram", re: /(^|\.)instagram\.com$/, nombre: "Instagram", video: true, cookies: "instagram.com" },
  { id: "threads", re: /(^|\.)threads\.(net|com)$/, nombre: "Threads", video: true, cookies: "instagram.com" },
  { id: "linkedin", re: /(^|\.)linkedin\.com$/, nombre: "LinkedIn", video: true, cookies: "linkedin.com" },
  { id: "tiktok", re: /(^|\.)tiktok\.com$/, nombre: "TikTok", video: true },
  { id: "youtube", re: /(^|\.)(youtube\.com|youtu\.be)$/, nombre: "YouTube", video: true },
  { id: "vimeo", re: /(^|\.)vimeo\.com$/, nombre: "Vimeo", video: true },
  { id: "pinterest", re: /(^|\.)pinterest\.[a-z.]+$|(^|\.)pin\.it$/, nombre: "Pinterest", video: true, cookies: "pinterest.com" },
  { id: "dribbble", re: /(^|\.)dribbble\.com$/, nombre: "Dribbble", video: true, cookies: "dribbble.com" },
  { id: "behance", re: /(^|\.)behance\.net$/, nombre: "Behance" },
  { id: "arena", re: /(^|\.)are\.na$/, nombre: "Are.na" },
  { id: "savee", re: /(^|\.)savee\.(it|com)$/, nombre: "Savee" },
  { id: "cosmos", re: /(^|\.)cosmos\.so$/, nombre: "Cosmos" },
];

export function plataforma(url) {
  let host = "";
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
  return PLATAFORMAS.find((p) => p.re.test(host)) || { id: "web", nombre: host, video: false };
}

const run = (cmd, args, timeout) => new Promise((resolve) => execFile(cmd, args, { timeout, maxBuffer: 20e6 }, (err, out, e) => resolve({ ok: !err, out: String(out || ""), err: String(e || err?.message || "") })));
let ytdlp = undefined;
async function hayYtdlp() {
  if (ytdlp === undefined) ytdlp = (await run("yt-dlp", ["--version"], 10000)).ok;
  return ytdlp;
}

function limpiarViejos() {
  try {
    for (const d of fs.readdirSync(abs(PENDIENTES))) {
      const p = path.join(abs(PENDIENTES), d);
      if (Date.now() - fs.statSync(p).mtimeMs > 24 * 3600e3) fs.rmSync(p, { recursive: true, force: true });
    }
  } catch {}
}

async function conYtdlp(url, p, dir) {
  if (!(await hayYtdlp())) return null;
  let cookies = null;
  if (p.cookies) {
    const txt = await nav.cookiesNetscape(p.cookies).catch(() => null);
    if (txt) { cookies = path.join(dir, ".cookies.txt"); fs.writeFileSync(cookies, txt, { mode: 0o600 }); }
  }
  try {
    const args = ["--no-playlist", "--no-warnings", "--no-progress", "--max-filesize", "400M", "-f", "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/bv*[height<=1080]+ba/b[height<=1080]/b",
      "--merge-output-format", "mp4", "--write-info-json", "-o", path.join(dir, "video.%(ext)s"), ...(cookies ? ["--cookies", cookies] : []), url];
    const r = await run("yt-dlp", args, 6 * 60e3);
    const video = fs.readdirSync(dir).find((f) => /^video\.(mp4|webm|mov|mkv)$/.test(f));
    if (!r.ok || !video) return null;
    let info = {};
    try { info = JSON.parse(fs.readFileSync(path.join(dir, "video.info.json"), "utf8")); } catch {}
    fs.rmSync(path.join(dir, "video.info.json"), { force: true });
    return {
      titulo: info.title && !/^(Video|Post) by/i.test(info.title) ? info.title : null, autor: info.uploader || info.channel || null,
      descripcion: (info.description || "").slice(0, 600) || null, archivos: [`${path.relative(ROOT, dir)}/${video}`], via: "yt-dlp",
    };
  } finally { if (cookies) fs.rmSync(cookies, { force: true }); }
}

// Se ejecuta dentro de la página renderizada. Devuelve texto, autor e imágenes y vídeos en la mayor calidad visible.
const EXTRAER = `(() => {
  const meta = (n) => { const e = document.querySelector('meta[property="' + n + '"],meta[name="' + n + '"]'); return e ? e.content : null; };
  const host = location.hostname;
  const mayor = (img) => {
    if (img.srcset) { const c = img.srcset.split(",").map((s) => s.trim().split(/\\s+/)).sort((a, b) => parseFloat(b[1] || 0) - parseFloat(a[1] || 0)); if (c[0] && c[0][0]) return new URL(c[0][0], location.href).href; }
    return img.currentSrc || img.src;
  };
  const grandes = (raiz, min) => [...(raiz || document).querySelectorAll("img")].filter((i) => i.naturalWidth >= min && i.naturalHeight >= min * 0.4).sort((a, b) => b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight);
  let imagenes = [], texto = null, autor = null, raiz = document;
  if (/(^|\\.)(x|twitter)\\.com$/.test(host)) {
    raiz = document.querySelector("article") || document;
    imagenes = [...raiz.querySelectorAll('img[src*="pbs.twimg.com/media"]')].map((i) => i.src.replace(/([?&])name=\\w+/, "$1name=orig"));
    const t = raiz.querySelector('[data-testid="tweetText"]'); texto = t ? t.innerText : null;
    const u = raiz.querySelector('[data-testid="User-Name"]'); autor = u ? u.innerText.split("\\n")[0] : null;
  } else if (/instagram\\.com$|threads\\.(net|com)$/.test(host)) {
    raiz = document.querySelector("article") || document.querySelector("main") || document;
    imagenes = grandes(raiz, 300).map(mayor);
    const h = raiz.querySelector("h1"); texto = h ? h.innerText : meta("og:description");
  } else if (/pinterest\\./.test(host)) {
    imagenes = grandes(document, 300).map((i) => mayor(i)).filter((s) => /pinimg\\.com/.test(s)).map((s) => s.replace(/\\/\\d+x\\//, "/originals/")).slice(0, 1);
  } else if (/dribbble\\.com$/.test(host)) {
    imagenes = grandes(document.querySelector(".shot-page-container, main") || document, 400).map(mayor);
  } else if (/linkedin\\.com$/.test(host)) {
    raiz = document.querySelector(".feed-shared-update-v2, main") || document;
    imagenes = grandes(raiz, 300).map(mayor).filter((s) => /media\\.licdn\\.com\\/dms\\/image/.test(s));
    const t = raiz.querySelector(".update-components-text, .feed-shared-text"); texto = t ? t.innerText : null;
  }
  if (!imagenes.length) {
    const og = meta("og:image") || meta("twitter:image");
    imagenes = [...(og ? [new URL(og, location.href).href] : []), ...grandes(document.querySelector("main, article") || document, 500).map(mayor)];
  }
  const videos = [...raiz.querySelectorAll("video")].map((v) => v.currentSrc || v.src || (v.querySelector("source") || {}).src).filter((s) => s && /^https?:/.test(s));
  return {
    titulo: meta("og:title") || document.title || null, descripcion: texto || meta("og:description") || meta("description"), autor: autor || meta("author") || meta("og:site_name"),
    imagenes: [...new Set(imagenes.filter((s) => s && /^https?:/.test(s)))].slice(0, 12), videos: [...new Set(videos)].slice(0, 2),
  };
})()`;

const EXT = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif", "image/avif": ".avif", "video/mp4": ".mp4", "video/webm": ".webm" };

async function conPagina(url, dir) {
  if (!(await nav.disponible())) return null;
  const datos = await nav.conVentana(url, (w) => w.webContents.executeJavaScript(EXTRAER, true), { espera: 3500 });
  const archivos = [];
  for (const u of [...datos.videos, ...datos.imagenes]) {
    try {
      const { buf, tipo } = await nav.descargar(u, 200e6);
      const ext = EXT[tipo];
      if (!ext || buf.length < 4000) continue;
      const f = `${String(archivos.length + 1).padStart(2, "0")}${ext}`;
      fs.writeFileSync(path.join(dir, f), buf);
      archivos.push(`${path.relative(ROOT, dir)}/${f}`);
    } catch {}
  }
  return { titulo: datos.titulo, autor: datos.autor, descripcion: (datos.descripcion || "").slice(0, 600) || null, archivos, via: "página" };
}

// Lee un enlace. Devuelve { id, plataforma, titulo, autor, descripcion, archivos: [rutas], via }.
export async function leer(url) {
  if (!/^https?:\/\//i.test(url || "")) throw new Error("El enlace tiene que empezar por http");
  const p = plataforma(url);
  limpiarViejos();
  const id = `l${Date.now().toString(36)}`;
  const dir = abs(`${PENDIENTES}/${id}`);
  fs.mkdirSync(dir, { recursive: true });
  try {
    let r = p.video ? await conYtdlp(url, p, dir) : null;
    if (!r || !r.archivos.length) {
      const pg = await conPagina(url, dir).catch((e) => ({ error: e.message }));
      if (pg && pg.error && !r) throw new Error(pg.error);
      if (pg && !pg.error) r = r ? { ...pg, ...r, archivos: [...r.archivos, ...pg.archivos] } : pg;
    }
    if (!r) throw new Error(await nav.disponible() ? "No se pudo leer" : "Sin vídeo; para imágenes y texto abre el panel desde la app de Mac");
    if (!r.archivos.length) fs.rmSync(dir, { recursive: true, force: true });
    return { id, plataforma: p.nombre, ...r };
  } catch (e) { fs.rmSync(dir, { recursive: true, force: true }); throw e; }
}

// Comprueba que una ruta viene de una lectura pendiente (no deja adjuntar archivos de fuera).
export function esPendiente(rel) {
  const n = path.posix.normalize(String(rel || ""));
  return n.startsWith(`${PENDIENTES}/`) && !n.includes("..") && fs.existsSync(abs(n));
}
