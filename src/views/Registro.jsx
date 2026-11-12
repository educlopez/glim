// Registro de decisiones y aprendizajes: lee estrategia/aprendizajes.md (la fuente única) y añade entradas
// nuevas arriba con el mismo formato. Así lo que funciona y lo que no queda escrito para la próxima pieza.
import { useMemo, useState } from "react";
import { Plus, X as Close, BookOpen, Sparkles } from "lucide-react";
import { useData } from "../lib/data.js";
import { useRouteCtx, hrefOf } from "../lib/route.js";
import { post, md } from "../lib/api.js";
import { PageHeader, Toggles, SearchBox, Empty } from "../components/ui.jsx";
import { capital } from "../lib/format.js";

function Nueva({ ambitos, onClose, onSaved }) {
  const [f, setF] = useState({ ambito: "repo", titulo: "", quePaso: "", aprendimos: "", accion: "" });
  const [err, setErr] = useState(null);
  const guardar = async (e) => {
    e.preventDefault();
    try { await post("/api/registro", f); onSaved(); } catch (x) { setErr(x.message); }
  };
  return (
    <form className="newentry" onSubmit={guardar}>
      <div className="row wrap gap-s">
        <label className="field narrow"><span className="fieldlabel">Ámbito</span>
          <input list="ambitos" value={f.ambito} onChange={(e) => setF({ ...f, ambito: e.target.value })} />
          <datalist id="ambitos">{ambitos.map((a) => <option key={a} value={a} />)}</datalist>
        </label>
        <label className="field grow"><span className="fieldlabel">Título</span><input value={f.titulo} placeholder="Ejemplo: las slides de fuente van sin degradado" onChange={(e) => setF({ ...f, titulo: e.target.value })} autoFocus /></label>
      </div>
      <label className="field"><span className="fieldlabel">Qué pasó</span><textarea rows={2} value={f.quePaso} onChange={(e) => setF({ ...f, quePaso: e.target.value })} /></label>
      <label className="field"><span className="fieldlabel">Qué aprendimos o decidimos</span><textarea rows={2} value={f.aprendimos} onChange={(e) => setF({ ...f, aprendimos: e.target.value })} /></label>
      <label className="field"><span className="fieldlabel">Acción</span><input value={f.accion} placeholder="Cambio en una plantilla, en la guía de voz… o nada" onChange={(e) => setF({ ...f, accion: e.target.value })} /></label>
      {err ? <p className="formerror" role="alert">{err}</p> : null}
      <div className="row gap-s">
        <button type="submit" className="btn primary"><Plus size={14} aria-hidden="true" /><span>Añadir al registro</span></button>
        <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
        <span className="muted small">Se escribe arriba del todo en {archivo}.</span>
      </div>
    </form>
  );
}

const Campo = ({ k, v }) => (v ? <div className="regcampo"><span className="regk">{k}</span><div className="prose small" dangerouslySetInnerHTML={{ __html: md(v) }} /></div> : null);

export default function Registro() {
  const d = useData();
  const archivo = (d.cerebro && d.cerebro.rutas.aprendizajes) || "";
  const r = useRouteCtx();
  const [q, setQ] = useState("");
  const sel = r.params.ambitos ? r.params.ambitos.split(",") : [];
  const ambitos = useMemo(() => {
    const c = {};
    d.registro.forEach((e) => { c[e.ambito] = (c[e.ambito] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [d.registro]);
  const lista = d.registro.filter((e) => (!sel.length || sel.includes(e.ambito)) && (!q.trim() || `${e.titulo} ${e.cuerpo}`.toLowerCase().includes(q.trim().toLowerCase())));
  const meses = [];
  for (const e of lista) {
    const m = e.fecha.slice(0, 7);
    if (!meses.length || meses[meses.length - 1].m !== m) meses.push({ m, items: [] });
    meses[meses.length - 1].items.push(e);
  }
  const nueva = r.params.nueva === "1";
  return (
    <>
      <PageHeader title="Registro" sub="Decisiones y aprendizajes, lo más reciente arriba. Lo leen los agentes antes de cada pieza."
        actions={<>
          <a className="btn ghost small" href={hrefOf("biblioteca", { doc: archivo })}><BookOpen size={14} aria-hidden="true" /><span>Archivo</span></a>
          <button type="button" className="btn primary" onClick={() => r.set({ nueva: nueva ? null : "1" })} aria-expanded={nueva}>{nueva ? <Close size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}<span>{nueva ? "Cerrar" : "Añadir decisión"}</span></button>
        </>}>
        <Toggles label="Ámbito" value={sel} onChange={(v) => r.set({ ambitos: v.length ? v.join(",") : null })} options={ambitos.map(([a, n]) => ({ id: a, label: a, count: n }))} />
        <SearchBox value={q} onChange={setQ} placeholder="Buscar en el registro" />
      </PageHeader>
      <div className="pad-x">
        {nueva ? <Nueva ambitos={ambitos.map(([a]) => a)} onClose={() => r.set({ nueva: null })} onSaved={() => { window.dispatchEvent(new Event("panel:reload")); r.set({ nueva: null }); }} /> : null}
        {!lista.length ? <Empty title="Nada coincide" /> : meses.map(({ m, items }) => (
          <section key={m} className="section">
            <div className="sectionhead"><h2>{capital(new Date(m + "-01T12:00").toLocaleDateString("es-ES", { month: "long", year: "numeric" }))}<span className="count">{items.length}</span></h2></div>
            <ol className="timeline">
              {items.map((e) => (
                <li key={e.n} className="regentry" data-component="registro" data-path={archivo}>
                  <div className="regdate"><span className="mono small">{e.fecha.slice(8)}</span></div>
                  <article className="regcard">
                    <header className="reghead">
                      <span className="tag">{e.ambito}</span>
                      {e.panel ? <span className="tag accent"><Sparkles size={11} aria-hidden="true" /> Desde el panel</span> : null}
                      <h3>{e.titulo}</h3>
                    </header>
                    {e.quePaso || e.aprendimos || e.accion ? (
                      <div className="regcampos">
                        <Campo k="Qué pasó" v={e.quePaso} />
                        <Campo k="Qué aprendimos" v={e.aprendimos} />
                        <Campo k="Acción" v={e.accion} />
                      </div>
                    ) : <div className="prose small" dangerouslySetInnerHTML={{ __html: md(e.cuerpo) }} />}
                  </article>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </>
  );
}
