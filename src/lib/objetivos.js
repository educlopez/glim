// Un "objetivo" es aquello sobre lo que se pide un cambio: "post:<id>", "plantilla:<id>", "general"…
// Aquí se resuelve a título, miniatura y enlace para pintarlo en cualquier sitio.
import { hrefOf } from "./route.js";
import { t } from "./i18n.js";

export const TIPOS_OBJETIVO = {
  get general() { return t("objetivo.general"); },
  get post() { return t("objetivo.post"); },
  get plantilla() { return t("objetivo.plantilla"); },
  get carrusel() { return t("objetivo.carrusel"); },
  get og() { return t("objetivo.og"); },
  get marca() { return t("objetivo.marca"); },
  get medio() { return t("objetivo.medio"); },
  get lumi() { return "Lumi"; },
};

export const claveDe = (o) => (!o || o.tipo === "general" ? "general" : `${o.tipo}:${o.id}`);
export function parseClave(k) {
  if (!k || k === "general") return { tipo: "general", id: null };
  const i = k.indexOf(":");
  return { tipo: k.slice(0, i), id: k.slice(i + 1) };
}

const kindOf = (p) => (/\.(mp4|webm|mov)$/i.test(p || "") ? "video" : "image");

export function infoObjetivo(d, o) {
  if (!d || !o || o.tipo === "general") return { titulo: t("objetivo.general"), thumb: null, href: null };
  const { tipo, id } = o;
  if (tipo === "post") {
    const p = d.posts.find((x) => x.id === id);
    if (!p) return { titulo: o.titulo || id, thumb: null, href: null };
    const a = p.visual.archivos[0];
    return { titulo: p.titulo, thumb: a ? { path: a, kind: p.visual.tipo === "video" ? "video" : "image" } : null, href: hrefOf("posts", { ver: p.id }), post: p };
  }
  if (tipo === "plantilla") {
    const t = d.plantillas.list.find((x) => x.id === id);
    const pv = t && t.previews[0];
    return { titulo: id, thumb: pv ? { path: pv.path, kind: pv.kind } : null, href: hrefOf("plantillas", { ver: id }) };
  }
  if (tipo === "carrusel") {
    const c = d.carruseles.find((x) => x.slug === id);
    return { titulo: id, thumb: c && c.slides[0] ? { path: c.slides[0], kind: "image" } : null, href: hrefOf("carruseles", { ver: id }) };
  }
  if (tipo === "og") {
    const g = d.ogs.find((x) => x.id === id);
    return { titulo: id, thumb: g && g.render ? { path: g.render, kind: "video" } : null, href: hrefOf("og", { ver: id }) };
  }
  if (tipo === "marca") {
    const m = d.marcas.find((x) => x.id === id);
    return { titulo: m ? m.data.nombre || id : id, thumb: m && m.logo ? { path: m.logo, kind: "image" } : null, href: hrefOf("marcas", { ver: id }) };
  }
  if (tipo === "lumi") return { titulo: "Lumi", thumb: null, href: null };
  if (tipo === "medio") return { titulo: id.split("/").pop(), thumb: { path: id, kind: kindOf(id) }, href: hrefOf("medios", { ver: id }) };
  return { titulo: o.titulo || id, thumb: null, href: null };
}

// Detecta el objeto en una nota de Agentation (copia los data-* del elemento marcado).
export function objetivoDeNota(texto) {
  const m = (re) => (re.exec(texto || "") || [])[1];
  const post = m(/data-post="([^"]+)"/);
  if (post) return `post:${post}`;
  const pl = m(/data-plantilla="([^"]+)"/);
  if (pl) return `plantilla:${pl}`;
  const p = m(/data-path="(media\/[^"]+)"/);
  if (p) return `medio:${p}`;
  return "general";
}
