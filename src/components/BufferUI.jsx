// Piezas de Buffer (solo lectura): estado de la conexión, chip de lo que solo está en Buffer y estado real de un post.
import { useState } from "react";
import { RefreshCw, ExternalLink, CircleAlert, Plug, CircleCheck } from "lucide-react";
import { useData } from "../lib/data.js";
import { post, hace } from "../lib/api.js";
import { RedIcon, CopyButton } from "./ui.jsx";

const RED = { twitter: "X", threads: "Threads", linkedin: "LinkedIn" };
const METRICA = { reactions: "reacciones", comments: "comentarios", reposts: "reposts", impressions: "impresiones", views: "vistas", reach: "alcance", clicks: "clics", engagementRate: "interacción", quotes: "citas", saves: "guardados", shares: "compartidos", follows: "seguidores" };
export const ESTADO_BUFFER = { draft: "Borrador", scheduled: "Programado", sending: "Enviando", sent: "Publicado", error: "Error", needs_approval: "Pide aprobación" };
const cmd = (llavero) => `security add-generic-password -U -a buffer -s ${llavero || "moss"}-buffer -w "$(pbpaste)"`;

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
          <strong className="small">Conecta Buffer para ver lo que de verdad está programado</strong>
          <span className="small muted">1. En publish.buffer.com/settings/api pulsa «New Key» y cópiala. 2. Pega este comando en Terminal: guarda la clave del portapapeles en el Llavero, sin que pase por el repo ni por el chat. 3. Pulsa Comprobar.</span>
          <div className="row wrap gap-s">
            <code className="small cmdline">{CMD}</code>
            <CopyButton text={CMD} label="Copiar comando" />
            <button type="button" className="btn small" onClick={sincronizar} disabled={sync}>{sync ? "Comprobando…" : "Comprobar"}</button>
          </div>
          {err ? <span className="small formerror">{err}</span> : null}
        </div>
      </div>
    );
  }
  return (
    <span className={`bufferpill ${b.error ? "is-error" : ""}`} title={b.error || [b.restantes != null ? `${b.restantes} peticiones a Buffer disponibles hoy` : "", (b.autoPublicados || []).length ? `Marcados como publicados por el panel: ${b.autoPublicados.slice(0, 6).map((a) => a.path.replace(/^borradores\//, "")).join(", ")}` : ""].filter(Boolean).join("\n")}>
      {b.error ? <CircleAlert size={13} aria-hidden="true" /> : <CircleCheck size={13} aria-hidden="true" />}
      <span>Buffer {b.error ? "con error" : b.sincronizado ? `· ${hace(b.sincronizado)}` : "· sin datos"}</span>
      {b.reconciliacion && !b.error ? (
        <span className={`small ${b.reconciliacion.error || b.reconciliacion.omitido ? "formerror" : "muted"}`}
          title={b.reconciliacion.error || b.reconciliacion.omitido || `Última vuelta: ${b.reconciliacion.actualizados} borradores actualizados, ${b.reconciliacion.creados} importados, ${b.reconciliacion.devueltos} devueltos a pendiente`}>
          {b.reconciliacion.error ? "· el repo no se pudo igualar" : b.reconciliacion.omitido ? "· descarga incompleta" : `· repo igual que Buffer desde 2026`}
        </span>
      ) : null}
      <button type="button" className="iconbtn tiny" onClick={sincronizar} disabled={sync} aria-label="Sincronizar con Buffer">
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
      title={`Solo en Buffer · ${ESTADO_BUFFER[x.estado] || x.estado} · ${x.canal}\n${x.texto}`} data-buffer={x.id}>
      <RedIcon red={red} size={11} />
      {x.madrid ? <span className="chiptime">{x.madrid.hora}</span> : null}
      <span className="chiptitle">{x.texto.split("\n")[0] || "(sin texto)"}</span>
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
            <span><strong>{ESTADO_BUFFER[x.estado] || x.estado}</strong>{x.madrid ? ` · ${x.madrid.dia.slice(8)}/${x.madrid.dia.slice(5, 7)} ${x.madrid.hora}` : ""}</span>
            {x.enlace ? <a href={x.enlace} target="_blank" rel="noreferrer" aria-label={`Ver en ${red}`}><ExternalLink size={13} aria-hidden="true" /></a> : null}
            {x.error ? <span className="formerror small">{x.error}</span> : null}
            {x.metricas && x.metricas.length ? (
              <span className="metricas" title={x.metricasEn ? `Buffer las actualizó ${new Date(x.metricasEn).toLocaleString("es-ES")}` : undefined}>
                {x.metricas.slice(0, 6).map((m) => <span key={m.tipo} className="metrica"><strong>{m.unidad === "percentage" ? `${m.valor.toFixed(1)} %` : Math.round(m.valor).toLocaleString("es-ES")}</strong>{METRICA[m.tipo] || m.nombre}</span>)}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
