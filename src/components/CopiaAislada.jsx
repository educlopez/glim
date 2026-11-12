// Copia aislada de un encargo (git worktree): qué ha cambiado el agente y los botones para aplicarlo al repo o
// descartarlo. El repo no cambia hasta que se aplica.
import { useEffect, useState } from "react";
import { GitBranch, Check, Trash2, FileDiff } from "lucide-react";
import { post } from "../lib/api.js";

const ESTADO = { A: "nuevo", M: "editado", D: "borrado", R: "movido" };

export function CopiaAislada({ encargo: e, onCambio }) {
  const [c, setC] = useState(null);
  const [verDiff, setVerDiff] = useState(false);
  const [err, setErr] = useState(null);
  const [haciendo, setHaciendo] = useState(false);
  const pendiente = !e.copia.aplicada && !e.copia.descartada;
  const trabajando = ["cola", "en-curso"].includes(e.estado);

  useEffect(() => {
    if (!pendiente || trabajando) return;
    fetch(`/api/encargos/${e.id}/copia`).then((r) => r.json()).then((j) => (j.error ? setErr(j.error) : setC(j))).catch((x) => setErr(x.message));
  }, [e.id, e.actualizado, pendiente, trabajando]);

  const hacer = async (url, body) => {
    setErr(null); setHaciendo(true);
    try { await post(url, body); onCambio(); } catch (x) { setErr(x.message); } finally { setHaciendo(false); }
  };

  if (!pendiente) {
    return (
      <p className="callout small"><GitBranch size={13} aria-hidden="true" /> {e.copia.aplicada ? `Cambios aplicados al repo (${(e.copia.archivos || []).length} archivos).` : "La copia aislada se descartó: el repo no cambió."}</p>
    );
  }
  return (
    <section className="detailsection" data-component="copia-aislada">
      <h3><GitBranch size={14} aria-hidden="true" /> Copia aislada</h3>
      <p className="muted small">El agente trabaja en su propia copia del repo. Nada llega al repo hasta que lo apliques.</p>
      {trabajando ? <p className="muted small">Trabajando…</p> : !c ? (err ? null : <p className="muted small">Leyendo cambios…</p>) : (
        <>
          <p className="small">{c.resumen.archivos ? `${c.resumen.archivos} archivo${c.resumen.archivos === 1 ? "" : "s"} · +${c.resumen.mas} −${c.resumen.menos}` : "Sin cambios."}</p>
          {c.archivos.length ? (
            <ul className="filelist small">
              {c.archivos.slice(0, 60).map((a) => <li key={a.ruta}><span className="mono">{a.ruta}</span> <span className="muted">{ESTADO[a.estado] || a.estado}</span></li>)}
            </ul>
          ) : null}
          {c.diff ? (
            <>
              <button type="button" className="btn ghost small" onClick={() => setVerDiff(!verDiff)} aria-expanded={verDiff}><FileDiff size={14} aria-hidden="true" /><span>{verDiff ? "Ocultar el diff" : "Ver el diff"}</span></button>
              {verDiff ? <pre className="diffblock mono small">{c.diff}</pre> : null}
            </>
          ) : null}
          <div className="row gap-s wrap">
            <button type="button" className="btn primary small" disabled={haciendo || !c.resumen.archivos} onClick={() => hacer(`/api/encargos/${e.id}/aplicar`)}><Check size={14} aria-hidden="true" /><span>Aplicar al repo</span></button>
            <button type="button" className="btn ghost small" disabled={haciendo} onClick={() => hacer(`/api/encargos/${e.id}/estado`, { estado: "descartado" })}><Trash2 size={14} aria-hidden="true" /><span>Descartar la copia</span></button>
          </div>
        </>
      )}
      {err ? <p className="formerror">{err}</p> : null}
    </section>
  );
}
