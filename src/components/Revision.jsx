// Revisión de un post: seleccionas un trozo del texto y dejas un comentario anclado, das el OK por red y
// mandas los comentarios abiertos a Claude como encargo. Idea de Postiz (comentarios con anchorQuote).
import { useRef, useState } from "react";
import { MessageSquareQuote, Check, Undo2, Trash2, Sparkles, BadgeCheck } from "lucide-react";
import { useData } from "../lib/data.js";
import { useRouteCtx } from "../lib/route.js";
import { post as enviar, hace } from "../lib/api.js";
import { RedIcon } from "./ui.jsx";

const recargar = () => window.dispatchEvent(new Event("panel:reload"));

// Texto con los comentarios abiertos resaltados. Al seleccionar, avisa con la cita.
export function TextoAnotable({ texto, red, parte, comentarios, onSelect }) {
  const ref = useRef(null);
  const abiertas = comentarios.filter((c) => c.tipo === "cambio" && !c.resuelto && c.red === red && c.cita && texto.includes(c.cita));
  const trozos = [];
  let i = 0;
  const marcas = abiertas.map((c) => ({ c, at: texto.indexOf(c.cita) })).sort((a, b) => a.at - b.at);
  for (const { c, at } of marcas) {
    if (at < i) continue;
    trozos.push(texto.slice(i, at));
    trozos.push(<mark key={c.id} className="anclado" title={c.texto}>{c.cita}</mark>);
    i = at + c.cita.length;
  }
  trozos.push(texto.slice(i));
  const alSoltar = () => {
    const s = window.getSelection();
    if (!s || s.isCollapsed || !ref.current || !ref.current.contains(s.anchorNode)) return;
    const cita = s.toString().trim();
    if (cita.length >= 2) onSelect({ cita, red, parte });
  };
  return <p ref={ref} className="mocktext anotable" onMouseUp={alSoltar}>{trozos}</p>;
}

export function Revision({ post, seleccion, setSeleccion }) {
  const d = useData();
  const r = useRouteCtx();
  const [texto, setTexto] = useState("");
  const [err, setErr] = useState(null);
  const lista = (d.revisiones || []).filter((x) => x.post === post.id);
  const oks = lista.filter((x) => x.tipo === "ok");
  const cambios = lista.filter((x) => x.tipo === "cambio").sort((a, b) => (!!a.resuelto - !!b.resuelto) || b.creado.localeCompare(a.creado));
  const abiertos = cambios.filter((x) => !x.resuelto);

  const accion = async (url, body) => { setErr(null); try { await enviar(url, body); recargar(); return true; } catch (x) { setErr(x.message); return false; } };
  const guardar = async () => {
    if (await accion("/api/revisiones", { post: post.id, red: seleccion.red, parte: seleccion.parte, cita: seleccion.cita, texto, tipo: "cambio" })) { setTexto(""); setSeleccion(null); window.getSelection()?.removeAllRanges(); }
  };
  const aClaude = () => {
    const t = ["Resuelve estos comentarios de revisión del post. Cambia solo lo que piden y mantén el resto del texto:", "",
      ...abiertos.map((c, n) => `${n + 1}. ${c.red ? `[${c.red}] ` : ""}${c.cita ? `Sobre «${c.cita}»: ` : ""}${c.texto}`)].join("\n");
    try { sessionStorage.setItem("composer:texto", t); } catch { /* sin almacenamiento: se escribe a mano */ }
    r.set({ pedir: `post:${post.id}` });
  };

  return (
    <section className="detailsection revision" data-component="revision">
      <h3><MessageSquareQuote size={14} aria-hidden="true" /> Revisión <span className="muted small">selecciona un trozo del texto para comentarlo</span></h3>

      {post.estado !== "publicado" && post.estado !== "descartado" ? <div className="oks">
        {post.piezas.map((pz) => {
          const ok = oks.find((o) => o.red === pz.red);
          return ok ? (
            <span key={pz.red} className="okbadge" title={`OK dado ${new Date(ok.creado).toLocaleString("es-ES")}`}>
              <BadgeCheck size={14} aria-hidden="true" /><RedIcon red={pz.red} size={12} /> OK {hace(ok.creado)}
              <button type="button" className="iconbtn tiny" onClick={() => accion(`/api/revisiones/${ok.id}/quitar`)} aria-label={`Retirar el OK de ${pz.red}`}><Undo2 size={12} aria-hidden="true" /></button>
            </span>
          ) : (
            <button key={pz.red} type="button" className="btn small" onClick={() => accion("/api/revisiones", { post: post.id, red: pz.red, tipo: "ok" })}>
              <Check size={14} aria-hidden="true" /><RedIcon red={pz.red} size={12} /><span>Dar el OK</span>
            </button>
          );
        })}
      </div> : null}
      {oks.length ? <p className="muted small">El OK queda registrado con fecha. No programa nada: programar sigue siendo en Buffer.</p> : null}

      {seleccion ? (
        <div className="miniform">
          <blockquote className="cita">«{seleccion.cita}»</blockquote>
          <textarea rows={2} autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Qué cambiar aquí"
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && texto.trim()) guardar(); }} />
          <div className="row gap-s">
            <button type="button" className="btn small primary" disabled={!texto.trim()} onClick={guardar}>Guardar comentario</button>
            <button type="button" className="btn ghost small" onClick={() => setSeleccion(null)}>Cancelar</button>
          </div>
        </div>
      ) : null}

      {cambios.length ? (
        <ul className="comentarios">
          {cambios.map((c) => (
            <li key={c.id} className={c.resuelto ? "hecho" : ""}>
              {c.cita ? <blockquote className="cita">{c.red ? <RedIcon red={c.red} size={11} /> : null} «{c.cita}»</blockquote> : null}
              <p>{c.texto}</p>
              <div className="row gap-s small muted">
                <span>{hace(c.creado)}</span>
                <button type="button" className="link" onClick={() => accion(`/api/revisiones/${c.id}/resolver`, { valor: !c.resuelto })}>{c.resuelto ? "Reabrir" : "Resuelto"}</button>
                <button type="button" className="iconbtn tiny" onClick={() => accion(`/api/revisiones/${c.id}/quitar`)} aria-label="Borrar el comentario"><Trash2 size={12} aria-hidden="true" /></button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {abiertos.length ? <button type="button" className="btn small primary" onClick={aClaude}><Sparkles size={14} aria-hidden="true" /><span>Mandar {abiertos.length} comentario{abiertos.length === 1 ? "" : "s"} a Claude</span></button> : null}
      {err ? <p className="formerror small">{err}</p> : null}
    </section>
  );
}
