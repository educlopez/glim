
import { LoaderCircle, FileStack, Repeat, LayoutTemplate } from "lucide-react";
import { useData } from "../lib/data.js";
import { ESTADOS_ENCARGO, hace, duracion } from "../lib/api.js";
import { TIPOS_OBJETIVO, infoObjetivo } from "../lib/objetivos.js";
import { Thumb } from "./Media.jsx";
import { t } from "../lib/i18n.js";

export function EstadoEncargo({ estado }) {
  return (
    <span className={`estado enc-${estado}`}>
      {estado === "en-curso" ? <LoaderCircle size={12} className="spin" aria-hidden="true" /> : null}
      {ESTADOS_ENCARGO[estado] || estado}
    </span>
  );
}

export function EncargoCard({ e, href }) {
  const d = useData();
  const info = infoObjetivo(d, e.objetivo);
  const titulo = e.objetivo.tipo === "general" ? t("objetivo.general") : info.titulo || e.objetivo.titulo;
  return (
    <a className={`enccard enc-${e.estado}`} href={href} data-encargo={e.id} data-path={e.objetivo.path || undefined}>
      <div className="enccard-head">
        <span className="encobj">
          <span className="encobjthumb">{info.thumb ? <Thumb path={info.thumb.path} kind={info.thumb.kind} /> : null}</span>
          <span className="encobjtext">
            <span className="small muted">{TIPOS_OBJETIVO[e.objetivo.tipo] || e.objetivo.tipo}</span>
            <span className="encobjtitle">{titulo}</span>
          </span>
        </span>
        <EstadoEncargo estado={e.estado} />
      </div>
      <p className="enccard-text">{(e.ultima && e.ultima.texto) || e.texto}</p>
      {e.estado === "en-curso" ? <div className="encprogress" aria-hidden="true"><span /></div> : null}
      <div className="enccard-foot small muted">
        <span>{hace(e.actualizado)}</span>
        {e.rondas > 1 ? <span><Repeat size={12} aria-hidden="true" /> {t("encargo.vueltas", { n: e.rondas })}</span> : null}
        {e.archivos.length ? <span><FileStack size={12} aria-hidden="true" /> {t("encargo.archivos", { n: e.archivos.length })}</span> : null}
        {e.plantilla ? <span><LayoutTemplate size={12} aria-hidden="true" /> {e.plantilla}</span> : null}
        {e.ultima && e.ultima.duracion ? <span>{duracion(e.ultima.duracion)}</span> : null}
      </div>
    </a>
  );
}
