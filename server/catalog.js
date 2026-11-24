// Inventario del repo: plantillas, carruseles, OG, marcas, medios, documentos y skills.
import path from "node:path";
import { read, readJson, ls, exists, mtime, walk, frontmatter, firstHeading, kindOf, DENY } from "./repo.js";
import { cfg, rutas, ESTADO } from "./cerebro.js";
import fs from "node:fs";

export function media() {
  const files = walk(rutas.media, (p) => ["image", "video", "audio", "pdf"].includes(kindOf(p)), 5).filter((p) => !p.startsWith(`${rutas.mediaReferencias}/`));
  const groups = {};
  for (const p of files) (groups[path.dirname(p)] ||= []).push({ path: p, name: path.basename(p), kind: kindOf(p), mtime: mtime(p) });
  // Carpetas de fotogramas de control (frames/ o secuencias 0001.png): ocultas por defecto. Igual las de media/_descartes/:
  // piezas rechazadas que se guardan como ejemplo de lo que no hay que hacer (cada una con su LEEME.md).
  const isFrames = (dir, items) => /(^|\/)(frames|snapshots|\.raw)(\/|$)/.test(dir) || items.filter((m) => /^\d+\.(png|jpe?g)$/.test(m.name)).length > items.length * 0.7;
  return Object.entries(groups)
    .map(([dir, items]) => ({ dir, frames: isFrames(dir, items), descarte: /(^|\/)_descartes(\/|$)/.test(dir), items: items.sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => b.dir.localeCompare(a.dir));
}

// Cuando el id del índice no coincide con el nombre de sus renders, aquí va la palabra a buscar en media/.
const CLAVE = cfg.clavesPlantillas;

export function plantillas(mediaGroups) {
  const idx = (rutas.indiceRecursos && readJson(rutas.indiceRecursos)) || {};
  const all = mediaGroups.filter((g) => !g.frames && !g.descarte).flatMap((g) => g.items).filter((m) => m.kind === "video" || m.kind === "image");
  // `mismo_que`: la entrada es otro nombre de una plantilla que ya está en la lista (se oculta para no duplicarla).
  // `ejemplo_media`: ejemplos elegidos a mano (rutas de media/), que van primero; luego, los que casan por nombre.
  const list = (idx.plantillas || []).filter((p) => !p.mismo_que).map((p) => {
    const key = CLAVE[p.id] || p.id.replace(/^(video-lab-|video-|carrusel-)/, "");
    const dir = String(p.ruta || "").split(" ")[0].replace(/\/$/, "");
    const readme = [`${dir}/README.md`, `${path.dirname(dir)}/README.md`].find((r) => exists(r)) || null;
    // Una ruta que acaba en «/» es la carpeta de un carrusel: entran sus slides en orden (slide-01, slide-02…).
    const elegidos = [].concat(p.ejemplo_media || []).flatMap((ruta) => (ruta.endsWith("/")
      ? all.filter((m) => m.kind === "image" && m.path.startsWith(ruta) && !m.path.slice(ruta.length).includes("/")).sort((a, b) => a.path.localeCompare(b.path))
      : [all.find((m) => m.path === ruta)])).filter(Boolean);
    // Con `ejemplo_media`, solo sus variantes de formato (<ejemplo>-9x16.mp4…): los vídeos viejos que casan por nombre
    // llevaban firma o el estilo anterior. Una plantilla retirada, desaconsejada o no usable no enseña nada (su sustituta sí).
    const fuera = ["retirada", "desaconsejada", "no-usable"].includes(p.estado);
    const base = elegidos.map((m) => m.path.replace(/\.[^./]+$/, ""));
    const casa = (m) => (base.length ? base.some((b) => m.path.startsWith(`${b}-`)) : m.path.includes(key));
    const porNombre = key.length > 3 && !fuera
      ? all.filter((m) => casa(m) && !elegidos.includes(m) && !/-fotogramas\./.test(m.path)).sort((a, b) => (a.kind === b.kind ? b.mtime - a.mtime : a.kind === "video" ? -1 : 1))
      : [];
    const previews = fuera ? [] : [...elegidos, ...porNombre].slice(0, 6);
    return { ...p, dir, readme, existe: exists(dir), previews };
  });
  return { meta: { version: idx.version, actualizado: idx.actualizado_madrid, cadencia: idx.cadencia, mezcla: idx.mezcla }, list };
}

export function carruseles() {
  const out = [];
  const raiz = rutas.seriesCarrusel;
  const render = raiz ? `${raiz.split("/").slice(0, -1).join("/") || "."}/render.py` : null;
  for (const serie of raiz ? ls(raiz).filter((d) => d.isDirectory()) : []) {
    for (const f of ls(`${raiz}/${serie.name}`).filter((d) => d.name.endsWith(".json"))) {
      const p = `${raiz}/${serie.name}/${f.name}`;
      const c = readJson(p) || {};
      const slug = c.slug || f.name.replace(/\.json$/, "");
      const dir = `${rutas.mediaCarruseles || `${rutas.media}/carruseles`}/${slug}`;
      const names = ls(dir).map((d) => d.name);
      const slides = names.filter((n) => /^slide-\d+\.png$/.test(n)).sort().map((n) => `${dir}/${n}`);
      const pdf = names.find((n) => n.endsWith(".pdf"));
      out.push({
        path: p, serie: serie.name, slug, theme: c.theme || "light", date: c.date || null, series: c.series || null,
        tipos: [...new Set((c.slides || []).map((s) => s.type))], n: (c.slides || []).length, slides, pdf: pdf ? `${dir}/${pdf}` : null,
        cmd: `python3 ${render} ${p}`,
      });
    }
  }
  // Piezas de carrusel de la familia actual (un JSON por pieza en una carpeta plana, renders en <mediaCarruseles>/<subcarpeta>/<slug>/).
  if (rutas.piezasCarrusel) {
    const raizP = rutas.piezasCarrusel;
    const sub = path.basename(path.dirname(raizP)); // plantillas/carrusel/v1/piezas → v1
    const renderP = `${path.dirname(raizP)}/render.py`;
    for (const f of ls(raizP).filter((d) => d.name.endsWith(".json"))) {
      const p = `${raizP}/${f.name}`;
      const c = readJson(p) || {};
      const slug = c.slug || f.name.replace(/\.json$/, "");
      const dir = `${rutas.mediaCarruseles || `${rutas.media}/carruseles`}/${sub}/${slug}`;
      const names = ls(dir).map((d) => d.name);
      const slides = names.filter((n) => /^slide-\d+\.png$/.test(n)).sort().map((n) => `${dir}/${n}`);
      const pdf = names.find((n) => n.endsWith(".pdf"));
      const familia = c.familia || "v1";
      out.push({
        path: p, serie: `${sub}-${familia}`, series: `${sub} · ${familia}`, actual: true, slug, theme: familia,
        date: (slug.match(/^\d{4}-\d{2}-\d{2}/) || [null])[0], tipos: [...new Set((c.slides || []).map((s) => s.tipo || s.type))],
        n: (c.slides || []).length, slides, pdf: pdf ? `${dir}/${pdf}` : null, cmd: `python3 ${renderP} ${p}`,
      });
    }
  }
  // Las piezas actuales primero; dentro de cada grupo, la más reciente primero.
  return out.sort((a, b) => (b.actual ? 1 : 0) - (a.actual ? 1 : 0) || (b.date || b.slug).localeCompare(a.date || a.slug));
}

export function marcas() {
  if (!rutas.marcas) return [];
  const raiz = rutas.marcas;
  return ls(raiz).filter((d) => d.name.endsWith(".json")).map((d) => {
    const p = `${raiz}/${d.name}`;
    const j = readJson(p) || {};
    const logo = typeof j.logo === "string" ? j.logo.split(" ")[0] : null;
    return { path: p, id: d.name.replace(/\.json$/, ""), data: j, logo: logo && exists(`${raiz}/${logo}`) ? `${raiz}/${logo}` : null };
  });
}

export function ogs(mediaGroups) {
  const renders = mediaGroups.flatMap((g) => g.items).filter((m) => m.kind === "video" && /-og-/.test(m.name));
  if (!rutas.ogs) return [];
  const raiz = rutas.ogs;
  return ls(raiz).filter((d) => d.isDirectory() && exists(`${raiz}/${d.name}/index.html`)).map((d) => {
    const key = d.name.split("-").slice(1).join("-");
    const render = renders.filter((m) => m.name.includes(key)).sort((a, b) => b.mtime - a.mtime)[0] || null;
    const gif = render ? render.path.replace(/\.mp4$/, ".gif") : null;
    return { id: d.name, marca: d.name.split("-")[0], html: `${raiz}/${d.name}/index.html`, render: render && render.path, gif: gif && exists(gif) ? gif : null };
  });
}

export function skills() {
  if (!rutas.skills) return [];
  return ls(rutas.skills).filter((d) => d.isDirectory() && exists(`${rutas.skills}/${d.name}/SKILL.md`)).map((d) => {
    const p = `${rutas.skills}/${d.name}/SKILL.md`;
    const { fm } = frontmatter(read(p));
    return { path: p, id: d.name, description: (fm.description || "").replace(/^>-?\s*/, "") };
  });
}

function docsIn(dir, group, depth = 0) {
  return walk(dir, (p) => p.endsWith(".md"), depth).sort().map((p) => {
    const t = read(p) || "";
    return { path: p, group, title: firstHeading(t, path.basename(p, ".md")), words: t.split(/\s+/).length, mtime: mtime(p) };
  });
}

export function docs() {
  const root = [...new Set([cfg.reglas, "README.md"])].filter((p) => exists(p)).map((p) => ({ path: p, group: "Raíz", title: firstHeading(read(p), p), words: (read(p) || "").split(/\s+/).length, mtime: mtime(p) }));
  return [
    ...root,
    ...cfg.biblioteca.flatMap((b) => docsIn(b.dir, b.grupo, b.profundidad - 1).filter((d) => !(b.excluir && new RegExp(b.excluir).test(d.path)))),
  ].filter((d) => !DENY.some((r) => r.test(d.path)));
}

export const feedback = () => { try { return fs.readdirSync(`${ESTADO}/feedback`).filter((n) => n.endsWith(".md")).sort().reverse(); } catch { return []; } };
