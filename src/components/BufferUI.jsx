// Piezas de Buffer (solo lectura): estado de la conexión, chip de lo que solo está en Buffer y estado real de un post.
import { useState } from "react";
import { RefreshCw, ExternalLink, CircleAlert, Plug, CircleCheck } from "lucide-react";
import { useData } from "../lib/data.js";
import { post, hace } from "../lib/api.js";
import { RedIcon, CopyButton } from "./ui.jsx";
import { fmtFechaHora, fmtNumero, t } from "../lib/i18n.js";

const RED = { twitter: "X", threads: "Threads", linkedin: "LinkedIn" };
// Etiquetas en el idioma activo: claves de src/locales/*.js.
const METRICAS = ["reactions", "comments", "reposts", "impressions", "views", "reach", "clicks", "engagementRate", "quotes", "saves", "shares", "follows"];
const metrica = (m) => (METRICAS.includes(m.tipo) ? t(`buffer.metrica.${m.tipo}`) : m.nombre);
// Campos de las fotos fijas del borrador (metricas_48h / metricas_7d, server/metricas.js) → etiqueta de Buffer.
const CAMPO_FOTO = { impresiones: "impressions", reacciones: "reactions", comentarios: "comments", compartidos: "reposts", engagement: "engagementRate" };

// Una foto fija de métricas: por red, los mismos chips que las métricas en vivo de Buffer.
export function Instantanea({ foto }) {
  if (!foto || !foto.redes) return null;
  return (
    <span className="stack" title={foto.tomadas ? t("postDetalle.tomadas", { fecha: fmtFechaHora(foto.tomadas) }) : undefined}>
      {Object.entries(foto.redes).map(([red, m]) => (
        <span key={red} className="metricas">
          <RedIcon red={red} size={12} />
          {Object.keys(CAMPO_FOTO).filter((k) => m[k] != null).map((k) => (
            <span key={k} className="metrica"><strong>{k === "engagement" ? `${m[k].toFixed(1)} %` : fmtNumero(Math.round(m[k]))}</strong>{t(`buffer.metrica.${CAMPO_FOTO[k]}`)}</span>
          ))}
        </span>
      ))}
    </span>
  );
}

const ESTADOS_BUFFER = ["draft", "scheduled", "sending", "sent", "error", "needs_approval"];
export const estadoBuffer = (e) => (ESTADOS_BUFFER.includes(e) ? t(`buffer.estado.${e}`) : e);
const cmd = (llavero) => `security add-generic-password -U -a buffer -s ${llavero || "glim"}-buffer -w "$(pbpaste)"`;

export function BufferEstado() {
  const d = useData();
  const b = d.buffer;
  const [sync, setSync] = useState(false);
  const [err, setErr] = useState(null);
  const sincronizar = async () => {
    setSync(true); setErr(null);
    try { const j = await post("/api/buffer/sincronizar"); if (j.error) setErr(j.error); } catch (x) { setErr(x.message); }
    finally { setSync(false); }
  };
  if (b.motivo === "sin-clave") {
    const CMD = cmd(d.cerebro && d.cerebro.llavero);
    return (
      <div className="bufferconnect" data-component="buffer-conectar">
        <Plug size={16} aria-hidden="true" />
        <div className="stack">
          <strong className="small">{t("buffer.conecta")}</strong>
          <span className="small muted">{t("buffer.pasos")}</span>
          <div className="row wrap gap-s">
            <code className="small cmdline">{CMD}</code>
            <CopyButton text={CMD} label={t("buffer.copiarComando")} />
            <button type="button" className="btn small" onClick={sincronizar} disabled={sync}>{sync ? t("buffer.comprobando") : t("buffer.comprobar")}</button>
          </div>
          {err ? <span className="small formerror">{err}</span> : null}
        </div>
      </div>
    );
  }
  return (
    <span className={`bufferpill ${b.error ? "is-error" : ""}`} title={b.error || [b.restantes != null ? t("buffer.restantes", { n: b.restantes }) : "", (b.autoPublicados || []).length ? t("buffer.autoPublicados", { lista: b.autoPublicados.slice(0, 6).map((a) => a.path.replace(/^borradores\//, "")).join(", ") }) : ""].filter(Boolean).join("\n")}>
      {b.error ? <CircleAlert size={13} aria-hidden="true" /> : <CircleCheck size={13} aria-hidden="true" />}
      <span>Buffer {b.error ? t("buffer.conError") : b.sincronizado ? `· ${hace(b.sincronizado)}` : t("buffer.sinDatos")}</span>
      {b.reconciliacion && !b.error ? (
        <span className={`small ${b.reconciliacion.error || b.reconciliacion.omitido ? "formerror" : "muted"}`}
          title={b.reconciliacion.error || b.reconciliacion.omitido || t("buffer.ultimaVuelta", { actualizados: b.reconciliacion.actualizados, creados: b.reconciliacion.creados, devueltos: b.reconciliacion.devueltos })}>
          {b.reconciliacion.error ? t("buffer.noIgualado") : b.reconciliacion.omitido ? t("buffer.descargaIncompleta") : t("buffer.igualado")}
        </span>
      ) : null}
      <button type="button" className="iconbtn tiny" onClick={sincronizar} disabled={sync} aria-label={t("buffer.sincronizar")}>
        <RefreshCw size={13} aria-hidden="true" className={sync ? "spin" : ""} />
      </button>
      {err ? <span className="formerror small">{err}</span> : null}
    </span>
  );
}

// Un post que está en Buffer y ningún borrador cita.
export function BufferChip({ x }) {
  const red = RED[x.servicio] || x.servicio;
  return (
    <a className={`postchip bufferchip b-${x.estado}`} href="https://publish.buffer.com/calendar" target="_blank" rel="noreferrer"
      title={`${t("buffer.soloEnBuffer")} · ${estadoBuffer(x.estado)} · ${x.canal}\n${x.texto}`} data-buffer={x.id}>
      <RedIcon red={red} size={11} />
      {x.madrid ? <span className="chiptime">{x.madrid.hora}</span> : null}
      <span className="chiptitle">{x.texto.split("\n")[0] || t("buffer.sinTexto")}</span>
      <span className="bufftag">Buffer</span>
    </a>
  );
}

// Estado real en Buffer de cada pieza de un post.
export function BufferReal({ reales }) {
  if (!reales || !reales.length) return null;
  return (
    <ul className="bufferreal">
      {reales.map((x) => {
        const red = RED[x.servicio] || x.servicio;
        return (
          <li key={x.id} className={`b-${x.estado}`}>
            <RedIcon red={red} size={13} />
            <span><strong>{estadoBuffer(x.estado)}</strong>{x.madrid ? ` · ${x.madrid.dia.slice(8)}/${x.madrid.dia.slice(5, 7)} ${x.madrid.hora}` : ""}</span>
            {x.enlace ? <a href={x.enlace} target="_blank" rel="noreferrer" aria-label={t("buffer.verEn", { red })}><ExternalLink size={13} aria-hidden="true" /></a> : null}
            {x.error ? <span className="formerror small">{x.error}</span> : null}
            {x.metricas && x.metricas.length ? (
              <span className="metricas" title={x.metricasEn ? t("buffer.metricasEn", { fecha: fmtFechaHora(x.metricasEn) }) : undefined}>
                {x.metricas.slice(0, 6).map((m) => <span key={m.tipo} className="metrica"><strong>{m.unidad === "percentage" ? `${m.valor.toFixed(1)} %` : fmtNumero(Math.round(m.valor))}</strong>{metrica(m)}</span>)}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
