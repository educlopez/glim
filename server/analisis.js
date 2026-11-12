// Análisis local de cada referencia (idea de Pond, raphaelsalaja/pond, reimplementada): paleta de 5 colores,
// color de fondo, proporción, huella visual (dHash de 64 bits, para detectar duplicadas) y sha256 del archivo.
// Para los vídeos además: un póster (fotograma a 1 s) y una previa ligera (480 px, sin audio) para reproducir al
// pasar el ratón. Todo se calcula en este equipo con Python (PIL) y ffmpeg; nada sale a ningún servicio.
// Caché en dashboard/encargos/analisis.json; pósters y previas en media/referencias/previas/ (solo local).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { ROOT, kindOf } from "./repo.js";
import { ESTADO, rutas } from "./cerebro.js";

const CACHE = path.join(ESTADO, "analisis.json");
export const PREVIAS = `${rutas.mediaReferencias}/previas`;
const PREVIA_MIN_BYTES = 1.5e6; // vídeos más ligeros se reproducen tal cual

let cache = null;
const cargar = () => { if (!cache) { try { cache = JSON.parse(fs.readFileSync(CACHE, "utf8")); } catch { cache = {}; } } return cache; };
const persistir = () => { fs.mkdirSync(path.dirname(CACHE), { recursive: true }); fs.writeFileSync(CACHE, JSON.stringify(cache)); };
const abs = (rel) => path.join(ROOT, rel);
const firma = (rel) => { try { const s = fs.statSync(abs(rel)); return `${s.size}-${Math.round(s.mtimeMs)}`; } catch { return null; } };
const run = (cmd, args, timeout = 120000) => new Promise((resolve) => execFile(cmd, args, { timeout, maxBuffer: 20e6 }, (err, out, errOut) => resolve({ ok: !err, out: String(out || ""), err: String(errOut || err?.message || "") })));
const sha256 = (rel) => new Promise((resolve) => {
  const h = crypto.createHash("sha256");
  fs.createReadStream(abs(rel)).on("data", (c) => h.update(c)).on("end", () => resolve(h.digest("hex"))).on("error", () => resolve(null));
});
const nombreBase = (rel) => path.basename(rel).replace(/\.[^.]+$/, "");

// Paleta: reduce a 64 px, agrupa los píxeles en cubos de color y puntúa por cantidad y saturación (como Pond).
// dHash: 9×8 en grises, un bit por cada par de vecinos. Dos imágenes con distancia de Hamming ≤ 6 son casi iguales.
const PY = `
import sys, json
from PIL import Image
def sat(c):
    mx = max(c); mn = min(c)
    return 0 if mx == 0 else (mx - mn) / mx
def analiza(p):
    im = Image.open(p)
    w, h = im.size
    rgb = im.convert("RGB")
    t = rgb.copy(); t.thumbnail((64, 64))
    cubos = {}
    for r, g, b in t.getdata():
        e = cubos.setdefault((r >> 4, g >> 4, b >> 4), [0, 0, 0, 0])
        e[0] += r; e[1] += g; e[2] += b; e[3] += 1
    items = [(v[3], (v[0] // v[3], v[1] // v[3], v[2] // v[3])) for v in cubos.values()]
    fondo = max(items, key=lambda x: x[0])[1]
    items.sort(key=lambda x: -x[0] * (0.6 + sat(x[1])))
    out = []
    for n, c in items:
        if all(sum((a - b) ** 2 for a, b in zip(c, o)) ** 0.5 > 42 for o in out):
            out.append(c)
        if len(out) == 5:
            break
    g = rgb.convert("L").resize((9, 8), Image.LANCZOS)
    px = list(g.getdata()); bits = 0
    for y in range(8):
        for x in range(8):
            bits = (bits << 1) | (1 if px[y * 9 + x] > px[y * 9 + x + 1] else 0)
    hx = lambda c: "#%02x%02x%02x" % c
    return {"w": w, "h": h, "colores": [hx(c) for c in out], "fondo": hx(fondo), "dhash": "%016x" % bits}
res = {}
for clave, p in json.load(sys.stdin).items():
    try:
        res[clave] = analiza(p)
    except Exception as e:
        res[clave] = {"error": str(e)[:200]}
print(json.dumps(res))
`;

function analizarImagenes(mapa) {
  if (!Object.keys(mapa).length) return Promise.resolve({});
  return new Promise((resolve) => {
    const p = execFile("python3", ["-I", "-c", PY], { timeout: 300000, maxBuffer: 20e6 }, (err, out) => {
      if (err) { console.warn("[panel] análisis de referencias:", String(err.message).slice(0, 200)); return resolve({}); }
      try { resolve(JSON.parse(out)); } catch { resolve({}); }
    });
    p.stdin.end(JSON.stringify(mapa));
  });
}

async function videoInfo(rel) {
  const r = await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", abs(rel)], 30000);
  try { const j = JSON.parse(r.out); return { w: j.streams[0].width, h: j.streams[0].height, duracion: Math.round(Number(j.format.duration) * 10) / 10 || null }; } catch { return {}; }
}

async function poster(rel) {
  const dest = `${PREVIAS}/${nombreBase(rel)}.jpg`;
  if (fs.existsSync(abs(dest))) return dest;
  fs.mkdirSync(abs(PREVIAS), { recursive: true });
  let r = await run("nice", ["-n", "15", "ffmpeg", "-y", "-loglevel", "error", "-ss", "1", "-i", abs(rel), "-frames:v", "1", "-vf", "scale=720:-2", "-q:v", "4", abs(dest)], 60000);
  if (!r.ok || !fs.existsSync(abs(dest))) r = await run("nice", ["-n", "15", "ffmpeg", "-y", "-loglevel", "error", "-i", abs(rel), "-frames:v", "1", "-vf", "scale=720:-2", "-q:v", "4", abs(dest)], 60000);
  return fs.existsSync(abs(dest)) ? dest : null;
}

async function previa(rel) {
  try { if (fs.statSync(abs(rel)).size < PREVIA_MIN_BYTES) return null; } catch { return null; }
  const dest = `${PREVIAS}/${nombreBase(rel)}.mp4`;
  if (fs.existsSync(abs(dest))) return dest;
  const tmp = abs(`${PREVIAS}/.${nombreBase(rel)}.tmp.mp4`);
  const r = await run("nice", ["-n", "15", "ffmpeg", "-y", "-loglevel", "error", "-i", abs(rel), "-t", "20", "-an", "-vf", "scale=480:-2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "30", "-movflags", "+faststart", tmp], 240000);
  if (!r.ok) { fs.rmSync(tmp, { force: true }); return null; }
  fs.renameSync(tmp, abs(dest));
  return dest;
}

// Lo que ya hay calculado para un archivo (o null si falta o cambió).
export function de(rel) {
  if (!rel) return null;
  const c = cargar()[rel];
  return c && c.firma === firma(rel) ? c : null;
}

let enMarcha = null;
let avisar = () => {};
export function alAcabar(cb) { avisar = cb; }

// Analiza los archivos que falten. Primero las imágenes (rápido, en un solo proceso), luego los vídeos de uno en uno.
export function analizar(rutas) {
  if (enMarcha) return enMarcha.then(() => analizar(rutas));
  enMarcha = (async () => {
    const c = cargar();
    const faltan = [...new Set(rutas.filter(Boolean))].filter((r) => fs.existsSync(abs(r)) && !de(r));
    if (!faltan.length) return 0;
    const imgs = faltan.filter((r) => kindOf(r) === "image");
    const vids = faltan.filter((r) => kindOf(r) === "video");
    const res = await analizarImagenes(Object.fromEntries(imgs.map((r) => [r, abs(r)])));
    for (const r of imgs) c[r] = { ...(res[r] || { error: "sin datos" }), sha: await sha256(r), firma: firma(r) };
    persistir();
    if (imgs.length) avisar();
    for (const r of vids) {
      const info = await videoInfo(r);
      const pst = await poster(r);
      const a = pst ? (await analizarImagenes({ p: abs(pst) })).p || {} : {};
      const prev = await previa(r);
      c[r] = { ...a, ...info, poster: pst, previa: prev, sha: await sha256(r), firma: firma(r) };
      persistir();
    }
    if (vids.length) avisar();
    return faltan.length;
  })().finally(() => { enMarcha = null; });
  return enMarcha;
}

export const ocupado = () => !!enMarcha;
