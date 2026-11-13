import { useEffect, useRef } from "react";
import { LoaderCircle } from "lucide-react";
import { barridoEn } from "../lib/barrido.js";
import { useData } from "../lib/data.js";
import { ESTADOS_ENCARGO, hace, duracion } from "../lib/api.js";
import { TIPOS_OBJETIVO, infoObjetivo } from "../lib/objetivos.js";
import { Thumb } from "./Media.jsx";
import { t } from "../lib/i18n.js";

// Estado: un punto de color y el nombre en gris. El color dice el estado; el texto no compite con el título.
export function EstadoEncargo({ estado }) {
  return (
    <span className={`estado enc-${estado}`}>
      {estado === "en-curso" ? <LoaderCircle size={12} className="spin" aria-hidden="true" /> : null}
      {ESTADOS_ENCARGO[estado] || estado}
    </span>
  );
}

// Tarjeta de encargo: qué se tocó (título), qué se pidió (texto) y una línea de datos. Sin franja de color, sin
// hueco de miniatura cuando no la hay y sin iconos en los datos. En el tablero el estado ya lo dice la columna.
// Último estado visto de cada encargo. Fuera del componente porque al cambiar de columna la tarjeta se monta de nuevo.
const vistos = new Map();
const TRABAJANDO = ["cola", "en-curso"];

export function EncargoCard({ e, href, sinEstado = false }) {
  const d = useData();
  const ref = useRef(null);
  // Un encargo que termina y queda para revisar: la banda cruza su tarjeta.
  useEffect(() => {
    const antes = vistos.get(e.id);
    vistos.set(e.id, e.estado);
    if (TRABAJANDO.includes(antes) && e.estado === "revisar") requestAnimationFrame(() => barridoEn(ref.current, { direction: "ltr" }));
  }, [e.id, e.estado]);
  const info = infoObjetivo(d, e.objetivo);
  const titulo = e.objetivo.tipo === "general" ? t("objetivo.general") : info.titulo || e.objetivo.titulo;
  const tipo = TIPOS_OBJETIVO[e.objetivo.tipo] || e.objetivo.tipo;
  const datos = [
    tipo !== titulo ? tipo : null,
    hace(e.actualizado),
    e.rondas > 1 ? t("encargo.vueltas", { n: e.rondas }) : null,
    e.archivos.length ? t("encargo.archivos", { n: e.archivos.length }) : null,
    e.plantilla || null,
    e.ultima && e.ultima.duracion ? duracion(e.ultima.duracion) : null,
  ].filter(Boolean);
  return (
    <a ref={ref} className={`enccard enc-${e.estado}`} href={href} data-encargo={e.id} data-path={e.objetivo.path || undefined}>
      <div className="enccard-head">
        {info.thumb ? <span className="encobjthumb"><Thumb path={info.thumb.path} kind={info.thumb.kind} /></span> : null}
        <span className="encobjtitle">{titulo}</span>
        {sinEstado ? null : <EstadoEncargo estado={e.estado} />}
      </div>
      <p className="enccard-text">{(e.ultima && e.ultima.texto) || e.texto}</p>
      {e.estado === "en-curso" ? <div className="encprogress" aria-hidden="true"><span /></div> : null}
      <p className="enccard-foot small muted">{datos.map((x, i) => <span key={i}>{i ? " · " : ""}{x}</span>)}</p>
    </a>
  );
}
