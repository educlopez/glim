
import { CalendarClock, CircleDashed, TriangleAlert, Layers } from "lucide-react";
import { Redes, Estado } from "./ui.jsx";
import { Thumb } from "./Media.jsx";
import { fechaPost } from "../lib/format.js";
import { t } from "../lib/i18n.js";

export function PostVisual({ post, ratio = "wide" }) {
  const v = post.visual;
  if (v.archivos.length) {
    const first = v.archivos[0];
    const kind = v.tipo === "carrusel" ? "image" : v.tipo;
    return (
      <div className={`postvisual r-${v.tipo === "carrusel" ? "tall" : ratio}`}>
        <Thumb path={first} kind={kind} badge={v.tipo === "carrusel" ? <><Layers size={12} aria-hidden="true" /> {v.archivos.length}</> : null} />
      </div>
    );
  }
  const falta = v.falta.length > 0;
  return (
    <div className={`postvisual none r-${ratio}`}>
      <CircleDashed size={16} aria-hidden="true" />
      <span>{falta ? t("post.medioFuera") : t("post.sinVisual")}</span>
      {v.formato ? <span className="muted">{t("post.formato", { formato: v.formato })}</span> : null}
    </div>
  );
}

const lineasDe = (variant) => (variant === "compact" ? 3 : 6);

// Se puede arrastrar al calendario si aún no ha salido.
export const movible = (p) => !["publicado", "descartado"].includes(p.estado);
const arrastre = (post) => (movible(post) ? { draggable: true, onDragStart: (e) => { e.dataTransfer.setData("text/x-post", post.id); e.dataTransfer.effectAllowed = "move"; } } : {});

export function PostCard({ post, href, variant = "full" }) {
  const pieza = post.piezas[0];
  // En la tarjeta, los párrafos se juntan para que el recorte no deje líneas vacías.
  const texto = pieza ? (pieza.hilo ? pieza.hilo[0] : pieza.texto).replace(/\n{2,}/g, "\n") : "";
  const alto = post.avisos.filter((a) => a.nivel !== "bajo");
  return (
    <a className={`postcard v-${variant} st-${post.estado}`} href={href} data-post={post.id} data-path={post.path} {...arrastre(post)}>
      {variant === "compact" ? (
        <>
          <div className="postcard-head"><Redes redes={post.redes} /><Estado id={post.estado} /></div>
          <span className="postcard-title wrap">{post.titulo}</span>
        </>
      ) : (
        <div className="postcard-head">
          <Redes redes={post.redes} />
          <span className="postcard-title">{post.titulo}</span>
          <Estado id={post.estado} />
        </div>
      )}
      <div className="postcard-date">
        <CalendarClock size={13} aria-hidden="true" />
        <span>{fechaPost(post)}</span>
        {post.idioma ? <span className="lang">{post.idioma.toUpperCase()}</span> : null}
        {pieza && pieza.hilo ? <span className="lang">{t("post.hiloDe", { n: pieza.hilo.length })}</span> : null}
      </div>
      {texto ? <p className="postcard-text" style={{ WebkitLineClamp: lineasDe(variant) }}>{texto}</p> : <p className="postcard-text muted">{t("post.sinTexto")}</p>}
      {variant !== "mini" ? <PostVisual post={post} ratio={variant === "compact" ? "wide" : "wide"} /> : null}
      {alto.length ? (
        <div className="postcard-warn">
          <TriangleAlert size={13} aria-hidden="true" />
          <span>{alto[0].texto}{alto.length > 1 ? ` (+${alto.length - 1})` : ""}</span>
        </div>
      ) : null}
    </a>
  );
}

// Fila mínima para celdas del calendario: hora, red y título.
export function PostChip({ post, href }) {
  return (
    <a className={`postchip st-${post.estado} ${post.fecha && post.fecha.tipo === "propuesta" ? "is-propuesta" : ""}`} href={href} data-post={post.id} data-path={post.path} {...arrastre(post)}
      title={`${post.titulo} · ${fechaPost(post)}`}>
      <Redes redes={post.redes} size={11} />
      {post.fecha && post.fecha.hora ? <span className="chiptime">{post.fecha.hora}</span> : null}
      <span className="chiptitle">{post.titulo}</span>
      {post.avisos.some((a) => a.nivel === "alto") ? <TriangleAlert size={11} className="chipwarn" aria-label={t("post.tieneAvisos")} /> : null}
    </a>
  );
}
