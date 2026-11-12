// Copia aislada de un encargo (git worktree): qué ha cambiado el agente y los botones para aplicarlo al repo o
// descartarlo. El repo no cambia hasta que se aplica.
import { useEffect, useState } from "react";
import { GitBranch, Check, Trash2, FileDiff } from "lucide-react";
import { post } from "../lib/api.js";
import { t } from "../lib/i18n.js";


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
      <p className="callout small"><GitBranch size={13} aria-hidden="true" /> {e.copia.aplicada ? t("copia.aplicada", { n: (e.copia.archivos || []).length }) : t("copia.descartada")}</p>
    );
  }
  return (
    <section className="detailsection" data-component="copia-aislada">
      <h3><GitBranch size={14} aria-hidden="true" /> {t("copia.titulo")}</h3>
      <p className="muted small">{t("copia.sub")}</p>
      {trabajando ? <p className="muted small">{t("copia.trabajando")}</p> : !c ? (err ? null : <p className="muted small">{t("copia.leyendo")}</p>) : (
        <>
          <p className="small">{c.resumen.archivos ? t("copia.resumen", { n: c.resumen.archivos, mas: c.resumen.mas, menos: c.resumen.menos }) : t("copia.sinCambios")}</p>
          {c.archivos.length ? (
            <ul className="filelist small">
              {c.archivos.slice(0, 60).map((a) => <li key={a.ruta}><span className="mono">{a.ruta}</span> <span className="muted">{t(`copia.estado.${a.estado}`)}</span></li>)}
            </ul>
          ) : null}
          {c.diff ? (
            <>
              <button type="button" className="btn ghost small" onClick={() => setVerDiff(!verDiff)} aria-expanded={verDiff}><FileDiff size={14} aria-hidden="true" /><span>{verDiff ? t("copia.ocultarDiff") : t("copia.verDiff")}</span></button>
              {verDiff ? <pre className="diffblock mono small">{c.diff}</pre> : null}
            </>
          ) : null}
          <div className="row gap-s wrap">
            <button type="button" className="btn primary small" disabled={haciendo || !c.resumen.archivos} onClick={() => hacer(`/api/encargos/${e.id}/aplicar`)}><Check size={14} aria-hidden="true" /><span>{t("copia.aplicar")}</span></button>
            <button type="button" className="btn ghost small" disabled={haciendo} onClick={() => hacer(`/api/encargos/${e.id}/estado`, { estado: "descartado" })}><Trash2 size={14} aria-hidden="true" /><span>{t("copia.descartar")}</span></button>
          </div>
        </>
      )}
      {err ? <p className="formerror">{err}</p> : null}
    </section>
  );
}
