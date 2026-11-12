// Miniaturas y reproductores. Los vídeos solo cargan cuando entran en pantalla.
import { useEffect, useRef, useState } from "react";
import { FileText, Music, Play, ImageOff } from "lucide-react";
import { repo } from "../lib/format.js";
import { t } from "../lib/i18n.js";

function useVisible(margin = "300px") {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [visible, margin]);
  return [ref, visible];
}

// Miniatura estática: primer fotograma del vídeo o la imagen, recortada al marco.
export function Thumb({ path, kind, fit = "cover", alt = "", badge }) {
  const [ref, visible] = useVisible();
  const [broken, setBroken] = useState(false);
  return (
    <div ref={ref} className={`thumb fit-${fit}`}>
      {broken ? <div className="thumbmissing"><ImageOff size={18} aria-hidden="true" /><span>{t("media.noEnEquipo")}</span></div>
        : kind === "video" ? (visible ? <video src={`${repo(path)}#t=0.6`} preload="metadata" muted playsInline onError={() => setBroken(true)} aria-label={alt} /> : null)
        : kind === "image" ? (visible ? <img src={repo(path)} alt={alt} loading="lazy" onError={() => setBroken(true)} /> : null)
        : kind === "audio" ? <div className="thumbicon"><Music size={22} aria-hidden="true" /></div>
        : <div className="thumbicon"><FileText size={22} aria-hidden="true" /></div>}
      {kind === "video" && !broken ? <span className="playmark" aria-hidden="true"><Play size={14} fill="currentColor" /></span> : null}
      {badge ? <span className="thumbbadge">{badge}</span> : null}
    </div>
  );
}

// Vídeo que se reproduce en silencio al pasar el ratón (rejillas de OG y medios).
export function HoverVideo({ path, alt = "", poster, badge }) {
  const [ref, visible] = useVisible();
  const vref = useRef(null);
  const [activo, setActivo] = useState(false);
  // Con póster: se ve la imagen y el vídeo solo se descarga la primera vez que se pasa el ratón (preload none).
  if (poster) return (
    <div ref={ref} className="thumb fit-cover hovervideo" data-activo={activo || undefined}
      onMouseEnter={() => { setActivo(true); requestAnimationFrame(() => vref.current && vref.current.play().catch(() => {})); }}
      onMouseLeave={() => { if (vref.current) { vref.current.pause(); vref.current.currentTime = 0; } setActivo(false); }}>
      {visible ? <img src={repo(poster)} alt={alt} loading="lazy" /> : null}
      {visible ? <video ref={vref} src={repo(path)} preload="none" muted loop playsInline aria-hidden="true" /> : null}
      <span className="playmark" aria-hidden="true"><Play size={14} fill="currentColor" /></span>
      {badge ? <span className="thumbbadge">{badge}</span> : null}
    </div>
  );
  return (
    <div ref={ref} className="thumb fit-cover"
      onMouseEnter={() => vref.current && vref.current.play().catch(() => {})}
      onMouseLeave={() => { if (vref.current) { vref.current.pause(); vref.current.currentTime = 0.6; } }}>
      {visible ? <video ref={vref} src={`${repo(path)}#t=0.6`} preload="metadata" muted loop playsInline aria-label={alt} /> : null}
      <span className="playmark" aria-hidden="true"><Play size={14} fill="currentColor" /></span>
    </div>
  );
}

// Reproductor completo para los paneles de detalle.
export function Player({ path, kind }) {
  if (kind === "video") return <video className="player" src={repo(path)} controls preload="metadata" playsInline />;
  if (kind === "audio") return <audio src={repo(path)} controls preload="metadata" />;
  if (kind === "pdf") return <a className="btn" href={repo(path)} target="_blank" rel="noreferrer">{t("media.abrirPdf")}</a>;
  return <a href={repo(path)} target="_blank" rel="noreferrer"><img className="player" src={repo(path)} alt="" /></a>;
}

// Carrusel en tira horizontal con scroll-snap, como se ve en la red.
export function SlideStrip({ slides, size = "m" }) {
  return (
    <div className={`slidestrip s-${size}`} tabIndex={0} aria-label={t("media.slides", { n: slides.length })}>
      {slides.map((s, i) => (
        <a key={s} href={repo(s)} target="_blank" rel="noreferrer" className="slide">
          <img src={repo(s)} alt={t("media.slide", { i: i + 1 })} loading="lazy" />
          <span className="slidenum">{i + 1}/{slides.length}</span>
        </a>
      ))}
    </div>
  );
}
