// Enlaces cortos de un post (Dub): interruptor por post, lista de enlaces por red con sus clics y texto para copiar
// con los enlaces cortos ya puestos. Solo aparece si los enlaces cortos están activados en Ajustes.
import { useState } from "react";
import { Link2, RefreshCw, MousePointerClick } from "lucide-react";
import { useData } from "../lib/data.js";
import { post as enviar, hace } from "../lib/api.js";
import { Switch, RedIcon } from "./ui.jsx";
import { t } from "../lib/i18n.js";

const recargar = () => window.dispatchEvent(new Event("panel:reload"));

// Texto de una pieza con sus enlaces cambiados por los cortos de esa red.
export function conCortos(post, pieza) {
  if (!post.enlacesCortos || !post.enlaces || !post.enlaces.length) return pieza.texto;
  return post.enlaces.filter((e) => e.red === pieza.red).reduce((txt, e) => txt.split(e.original).join(e.corto), pieza.texto);
}

export function EnlacesCortos({ post }) {
  const d = useData();
  const [cargando, setCargando] = useState(null);
  const [err, setErr] = useState(null);
  if (!d.ajustes.dub.activo) return null;
  const accion = async (que, url, body) => {
    setCargando(que); setErr(null);
    try { await enviar(url, body); recargar(); } catch (x) { setErr(x.message); } finally { setCargando(null); }
  };
  const total = post.enlaces.reduce((s, e) => s + (e.clics || 0), 0);
  return (
    <div className="enlaces" data-component="enlaces-cortos">
      <Switch checked={!!post.enlacesCortos} onChange={(v) => accion("activar", `/api/posts/${post.id}/enlaces`, { activo: v })}>
        <span className="small"><Link2 size={13} aria-hidden="true" /> {t("enlaces.titulo")}</span>
      </Switch>
      {post.enlacesCortos ? (
        post.enlaces.length ? (
          <>
            <ul className="enlaceslista">
              {post.enlaces.map((e) => (
                <li key={e.id}>
                  <RedIcon red={e.red} size={12} />
                  <a href={e.corto} target="_blank" rel="noreferrer" className="mono small">{e.corto.replace(/^https?:\/\//, "")}</a>
                  <span className="clics" title={t("enlaces.destino", { destino: e.destino })}><MousePointerClick size={12} aria-hidden="true" />{e.clics}</span>
                </li>
              ))}
            </ul>
            <div className="row gap-s small muted">
              <span>{t("enlaces.clicsTotal", { n: total })}{post.enlaces[0].actualizado ? ` · ${hace(post.enlaces[0].actualizado)}` : ""}</span>
              <button type="button" className="iconbtn tiny" disabled={!!cargando} onClick={() => accion("clics", `/api/posts/${post.id}/enlaces/clics`)} aria-label={t("enlaces.actualizarClics")}><RefreshCw size={12} aria-hidden="true" className={cargando === "clics" ? "spin" : ""} /></button>
            </div>
          </>
        ) : (
          <button type="button" className="btn small" disabled={!!cargando} onClick={() => accion("crear", `/api/posts/${post.id}/enlaces/crear`)}>{cargando ? t("enlaces.creando") : t("enlaces.crear")}</button>
        )
      ) : null}
      {err ? <p className="formerror small">{err}</p> : null}
    </div>
  );
}
