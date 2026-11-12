// Kit de publicación: firmas y presets. Un preset junta redes, idioma, formato, plantilla, firma e instrucciones
// para lanzar un post nuevo de un tipo conocido en un clic. Se guarda en estrategia/kit-publicacion.json.
import { useState } from "react";
import { Plus, PenLine, Trash2, Sparkles, Signature, Layers, X as Close } from "lucide-react";
import { useData, REDES } from "../lib/data.js";
import { useRouteCtx } from "../lib/route.js";
import { post } from "../lib/api.js";
import { PageHeader, Toggles, RedIcon, Empty, Section } from "../components/ui.jsx";

const recargar = () => window.dispatchEvent(new Event("panel:reload"));

function FormFirma({ inicial, onClose }) {
  const [f, setF] = useState(inicial || { nombre: "", texto: "", redes: [] });
  const [err, setErr] = useState(null);
  const guardar = async (e) => { e.preventDefault(); try { await post("/api/kit/firma", f); recargar(); onClose(); } catch (x) { setErr(x.message); } };
  return (
    <form className="newentry" onSubmit={guardar}>
      <label className="field"><span className="fieldlabel">Nombre</span><input autoFocus value={f.nombre} placeholder="Ejemplo: enlace a la web" onChange={(e) => setF({ ...f, nombre: e.target.value })} /></label>
      <label className="field"><span className="fieldlabel">Texto</span><textarea rows={3} value={f.texto} placeholder="Lo que se añade al final del post, tal cual" onChange={(e) => setF({ ...f, texto: e.target.value })} /></label>
      <div className="field"><span className="fieldlabel">Redes (vacío = todas)</span><Toggles label="Redes" value={f.redes} onChange={(v) => setF({ ...f, redes: v })} options={REDES.map((r) => ({ id: r, label: r, icon: <RedIcon red={r} size={12} /> }))} /></div>
      {err ? <p className="formerror">{err}</p> : null}
      <div className="row gap-s"><button type="submit" className="btn primary">Guardar firma</button><button type="button" className="btn ghost" onClick={onClose}>Cancelar</button></div>
    </form>
  );
}

function FormPreset({ inicial, onClose }) {
  const d = useData();
  const [f, setF] = useState(inicial || { nombre: "", descripcion: "", redes: [], idioma: "", formato: "", plantilla: "", firma: "", instrucciones: "" });
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const guardar = async (e) => { e.preventDefault(); try { await post("/api/kit/preset", f); recargar(); onClose(); } catch (x) { setErr(x.message); } };
  return (
    <form className="newentry" onSubmit={guardar}>
      <div className="row wrap gap-s">
        <label className="field grow"><span className="fieldlabel">Nombre</span><input autoFocus value={f.nombre} placeholder="Ejemplo: lanzamiento de un componente" onChange={set("nombre")} /></label>
        <label className="field narrow"><span className="fieldlabel">Idioma</span><span className="selectbox"><select value={f.idioma} onChange={set("idioma")}><option value="">Según la red</option><option value="en">Inglés</option><option value="es">Castellano</option></select></span></label>
      </div>
      <label className="field"><span className="fieldlabel">Para qué sirve</span><input value={f.descripcion} onChange={set("descripcion")} /></label>
      <div className="field"><span className="fieldlabel">Redes</span><Toggles label="Redes" value={f.redes} onChange={(v) => setF({ ...f, redes: v })} options={REDES.map((r) => ({ id: r, label: r, icon: <RedIcon red={r} size={12} /> }))} /></div>
      <div className="row wrap gap-s">
        <label className="field grow"><span className="fieldlabel">Formato</span><input value={f.formato} placeholder="Ejemplo: vídeo 16:9 de 15 s + hilo de 2" onChange={set("formato")} /></label>
        <label className="field grow"><span className="fieldlabel">Plantilla</span><span className="selectbox"><select value={f.plantilla || ""} onChange={set("plantilla")}><option value="">Ninguna</option>{d.plantillas.list.filter((t) => t.estado === "activa").map((t) => <option key={t.id} value={t.id}>{t.id}</option>)}</select></span></label>
        <label className="field grow"><span className="fieldlabel">Firma</span><span className="selectbox"><select value={f.firma || ""} onChange={set("firma")}><option value="">Sin firma</option>{d.kit.firmas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></span></label>
      </div>
      <label className="field"><span className="fieldlabel">Instrucciones para Claude</span><textarea rows={4} value={f.instrucciones} placeholder="Lo que siempre hay que hacer en este tipo de post" onChange={set("instrucciones")} /></label>
      {err ? <p className="formerror">{err}</p> : null}
      <div className="row gap-s"><button type="submit" className="btn primary">Guardar preset</button><button type="button" className="btn ghost" onClick={onClose}>Cancelar</button></div>
    </form>
  );
}

export default function Kit() {
  const d = useData();
  const r = useRouteCtx();
  const [editando, setEditando] = useState(null); // { tipo, item }
  const quitar = async (tipo, id) => { await post(`/api/kit/${tipo}/${id}/quitar`); recargar(); };
  const firmaDe = (id) => d.kit.firmas.find((f) => f.id === id);
  return (
    <>
      <PageHeader title="Kit" sub="Firmas y presets para publicar más rápido. Se guardan en estrategia/kit-publicacion.json."
        actions={<>
          <button type="button" className="btn" onClick={() => setEditando({ tipo: "firma" })}><Signature size={14} aria-hidden="true" /><span>Nueva firma</span></button>
          <button type="button" className="btn primary" onClick={() => setEditando({ tipo: "preset" })}><Plus size={14} aria-hidden="true" /><span>Nuevo preset</span></button>
        </>} />
      <div className="pad-x">
        {editando ? (
          <div className="stack">
            <div className="row gap-s"><strong>{editando.item ? "Editar" : "Nuevo"} {editando.tipo}</strong><button type="button" className="iconbtn tiny" onClick={() => setEditando(null)} aria-label="Cerrar"><Close size={13} aria-hidden="true" /></button></div>
            {editando.tipo === "firma" ? <FormFirma inicial={editando.item} onClose={() => setEditando(null)} /> : <FormPreset inicial={editando.item} onClose={() => setEditando(null)} />}
          </div>
        ) : null}

        <Section id="h-presets" title="Presets" count={d.kit.presets.length}>
          {d.kit.presets.length ? (
            <div className="cardgrid">
              {d.kit.presets.map((p) => (
                <article key={p.id} className="card" data-component="preset">
                  <div className="cardbody">
                    <span className="cardtitle"><span><Layers size={14} aria-hidden="true" /> {p.nombre}</span></span>
                    {p.descripcion ? <span className="cardtext">{p.descripcion}</span> : null}
                    <span className="cardmeta">
                      {p.redes.map((x) => <span key={x} className="tag"><RedIcon red={x} size={11} />{x}</span>)}
                      {p.idioma ? <span className="tag">{p.idioma.toUpperCase()}</span> : null}
                      {p.formato ? <span className="tag">{p.formato}</span> : null}
                      {p.plantilla ? <span className="tag">{p.plantilla}</span> : null}
                      {p.firma && firmaDe(p.firma) ? <span className="tag">firma: {firmaDe(p.firma).nombre}</span> : null}
                    </span>
                    <div className="row gap-s">
                      <button type="button" className="btn small primary" onClick={() => r.set({ pedir: "general", preset: p.id })}><Sparkles size={14} aria-hidden="true" /><span>Crear post con este preset</span></button>
                      <button type="button" className="iconbtn tiny" onClick={() => setEditando({ tipo: "preset", item: p })} aria-label="Editar preset"><PenLine size={13} aria-hidden="true" /></button>
                      <button type="button" className="iconbtn tiny" onClick={() => quitar("preset", p.id)} aria-label="Borrar preset"><Trash2 size={13} aria-hidden="true" /></button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : <Empty icon={Layers} title="Sin presets">Un preset junta redes, formato, plantilla, firma e instrucciones. Luego «Crear post con este preset» lanza a Claude con todo eso.</Empty>}
        </Section>

        <Section id="h-firmas" title="Firmas" count={d.kit.firmas.length}>
          {d.kit.firmas.length ? (
            <div className="cardgrid">
              {d.kit.firmas.map((f) => (
                <article key={f.id} className="card">
                  <div className="cardbody">
                    <span className="cardtitle"><span>{f.nombre}</span>
                      <span className="row gap-s">
                        <button type="button" className="iconbtn tiny" onClick={() => setEditando({ tipo: "firma", item: f })} aria-label="Editar firma"><PenLine size={13} aria-hidden="true" /></button>
                        <button type="button" className="iconbtn tiny" onClick={() => quitar("firma", f.id)} aria-label="Borrar firma"><Trash2 size={13} aria-hidden="true" /></button>
                      </span>
                    </span>
                    <pre className="firmatexto">{f.texto}</pre>
                    <span className="cardmeta">{(f.redes.length ? f.redes : ["Todas"]).map((x) => <span key={x} className="tag">{x}</span>)}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : <Empty icon={Signature} title="Sin firmas">Un cierre que se repite, como el enlace a tu web en LinkedIn. Aparece como «Copiar con firma» en cada post y se puede pedir en un encargo.</Empty>}
        </Section>
      </div>
    </>
  );
}
