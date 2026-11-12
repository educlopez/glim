// Encargos: lo que se ha pedido a los agentes desde el panel, en un tablero por estado. El panel lateral enseña
// el trabajo en directo, el resultado, los archivos tocados y las decisiones que propone registrar.
import { useEffect, useRef, useState } from "react";
import {
  Sparkles, Square, Play, Check, Trash2, Terminal, Eye, FileText, FilePen, FilePlus, Search, Wrench, Globe, Bot, ListChecks, BookMarked,
  TriangleAlert, MessageSquareText, ArrowRight, Info, LoaderCircle, Repeat,
} from "lucide-react";
import { useData } from "../lib/data.js";
import { useRouteCtx, hrefOf } from "../lib/route.js";
import { post, useEncargos, md, duracion, hace } from "../lib/api.js";
import { TIPOS_OBJETIVO, infoObjetivo } from "../lib/objetivos.js";
import { PageHeader, Empty, Fields, CopyButton, Switch } from "../components/ui.jsx";
import { Drawer } from "../components/Drawer.jsx";
import { Thumb, Player } from "../components/Media.jsx";
import { EncargoCard, EstadoEncargo } from "../components/EncargoCard.jsx";
import { CopiaAislada } from "../components/CopiaAislada.jsx";
import { t } from "../lib/i18n.js";

const ICONOS = { leer: FileText, editar: FilePen, crear: FilePlus, terminal: Terminal, buscar: Search, skill: Sparkles, agente: Bot, web: Globe, plan: ListChecks, herramienta: Wrench };
const esMedio = (p) => /^media\/.+\.(png|jpe?g|webp|gif|mp4|webm|mov)$/i.test(p);

function Paso({ ev }) {
  if (ev.tipo === "herramienta") {
    const I = ICONOS[ev.icono] || Wrench;
    return (
      <li className="paso tool">
        <I size={14} aria-hidden="true" />
        <span>{ev.texto}</span>
        {ev.detalle ? <code className="pasodetalle">{ev.detalle}</code> : null}
      </li>
    );
  }
  if (ev.tipo === "texto") return <li className="paso say"><Bot size={14} aria-hidden="true" /><div className="prose small" dangerouslySetInnerHTML={{ __html: md(ev.texto) }} /></li>;
  if (ev.tipo === "fallo") return <li className="paso fail"><TriangleAlert size={14} aria-hidden="true" /><span>{ev.texto}</span></li>;
  if (ev.tipo === "sistema") return <li className="paso sys"><Info size={14} aria-hidden="true" /><span>{ev.texto}</span></li>;
  return null;
}

function Cronometro({ desde }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  return <span className="mono">{duracion(Date.now() - new Date(desde).getTime())}</span>;
}

const NOMBRE_AGENTE = { claude: "Claude", codex: "Codex", cursor: "Cursor", opencode: "OpenCode", gemini: "Gemini", get propio() { return t("encargos.elAgente"); } };
export const nombreAgente = (id) => NOMBRE_AGENTE[id] || "Claude";

function Ronda({ ronda, n, eventos, viva, agente }) {
  // El último mensaje de Claude es el resultado: se enseña abajo, no también en los pasos.
  const pasos = eventos.filter((e) => e.ronda === n && e.tipo !== "resultado" && !(e.tipo === "texto" && ronda.resultado && e.texto.trim() === ronda.resultado.trim()));
  const [abierto, setAbierto] = useState(viva);
  useEffect(() => { if (viva) setAbierto(true); }, [viva]);
  const herramientas = pasos.filter((p) => p.tipo === "herramienta").length;
  return (
    <section className="ronda">
      <div className="rondapide">
        <span className="rondawho">{n === 0 ? t("encargos.pediste") : t("encargos.otraVuelta")}</span>
        <p>{ronda.texto}</p>
      </div>
      {pasos.length ? (
        <div className="rondapasos">
          <button type="button" className="btn ghost small" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
            {viva ? <LoaderCircle size={14} className="spin" aria-hidden="true" /> : <ListChecks size={14} aria-hidden="true" />}
            <span>{viva ? t("encargo.estado.en-curso") : t("encargos.pasos")} · {t("encargos.acciones", { n: herramientas })}</span>
            {viva && ronda.inicio ? <Cronometro desde={ronda.inicio} /> : ronda.duracion ? <span className="muted">{duracion(ronda.duracion)}</span> : null}
          </button>
          {abierto ? <ol className="pasos">{pasos.map((ev, i) => <Paso key={i} ev={ev} />)}</ol> : null}
        </div>
      ) : viva ? <p className="muted small"><LoaderCircle size={14} className="spin" aria-hidden="true" /> {t("encargos.arrancando", { agente: nombreAgente(ronda.agente || agente) })}</p> : null}
      {ronda.resultado ? (
        <div className="resultado">
          <p className="rondawho">{t("encargos.responde", { agente: nombreAgente(ronda.agente || agente) })}</p>
          <div className="prose" dangerouslySetInnerHTML={{ __html: md(ronda.resultado.replace(/^\s*[-*]?\s*\**DECISI[ÓO]N:?\**:?.*$/gim, "").trim()) }} />
        </div>
      ) : null}
      {ronda.error ? <p className="callout">{ronda.error}</p> : null}
      {ronda.denegadas && ronda.denegadas.length ? <p className="muted small">{t("encargos.sinPermiso", { lista: ronda.denegadas.join(" · ") })}</p> : null}
    </section>
  );
}

function Decision({ e, texto, i, onDone }) {
  const d = useData();
  const ya = (e.registradas || []).includes(texto);
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState({ titulo: texto.length > 90 ? texto.slice(0, 87) + "…" : texto, aprendimos: texto, accion: "", ambito: e.objetivo.tipo === "post" ? (d.posts.find((p) => p.id === e.objetivo.id) || { redes: ["repo"] }).redes[0] : e.objetivo.tipo === "general" ? "repo" : e.objetivo.tipo });
  const [err, setErr] = useState(null);
  if (ya) return <li className="decision done"><Check size={14} aria-hidden="true" /><span>{texto}</span><span className="tag">{t("encargos.registrada")}</span></li>;
  const guardar = async () => {
    try { await post("/api/registro", { ...f, quePaso: `Encargo desde el panel: «${e.texto.slice(0, 140)}»`, origen: `encargo ${e.id}`, encargo: e.id, decision: i }); onDone(); }
    catch (x) { setErr(x.message); }
  };
  return (
    <li className="decision">
      <BookMarked size={14} aria-hidden="true" />
      <div className="stack">
        <span>{texto}</span>
        {abierto ? (
          <div className="miniform">
            <label className="field"><span className="fieldlabel">{t("registro.ambito")}</span><input value={f.ambito} onChange={(x) => setF({ ...f, ambito: x.target.value })} /></label>
            <label className="field"><span className="fieldlabel">{t("registro.titulo")}</span><input value={f.titulo} onChange={(x) => setF({ ...f, titulo: x.target.value })} /></label>
            <label className="field"><span className="fieldlabel">{t("registro.queAprendimos")}</span><textarea rows={2} value={f.aprendimos} onChange={(x) => setF({ ...f, aprendimos: x.target.value })} /></label>
            <label className="field"><span className="fieldlabel">{t("registro.accion")}</span><input value={f.accion} placeholder={t("encargos.accionEjemplo")} onChange={(x) => setF({ ...f, accion: x.target.value })} /></label>
            {err ? <p className="formerror">{err}</p> : null}
            <div className="row gap-s"><button type="button" className="btn small primary" onClick={guardar}>{t("encargos.registrarAprendizajes")}</button><button type="button" className="btn ghost small" onClick={() => setAbierto(false)}>{t("comun.cancelar")}</button></div>
          </div>
        ) : <button type="button" className="btn small" onClick={() => setAbierto(true)}>{t("encargos.registrar")}</button>}
      </div>
    </li>
  );
}

function Archivos({ archivos }) {
  const medios = archivos.filter(esMedio);
  const resto = archivos.filter((p) => !esMedio(p));
  const [ver, setVer] = useState(null);
  if (!archivos.length) return <p className="muted small">{t("encargos.ningunArchivo")}</p>;
  return (
    <div className="stack">
      {medios.length ? (
        <div className="filegrid">
          {medios.slice(0, 24).map((p) => (
            <button key={p} type="button" className="filethumb" onClick={() => setVer(ver === p ? null : p)} aria-pressed={ver === p} title={p}>
              <Thumb path={p} kind={/\.(mp4|webm|mov)$/i.test(p) ? "video" : "image"} />
            </button>
          ))}
        </div>
      ) : null}
      {ver ? <div className="fileview"><Player path={ver} kind={/\.(mp4|webm|mov)$/i.test(ver) ? "video" : "image"} /><code className="small">{ver}</code></div> : null}
      {resto.length ? (
        <ul className="filelist">
          {resto.map((p) => <li key={p}><a href={/\.(md|json|txt|ya?ml|py|mjs|js|html)$/.test(p) ? hrefOf("biblioteca", { doc: p }) : `/repo/${p}`} className="mono small"><FileText size={13} aria-hidden="true" />{p}</a></li>)}
        </ul>
      ) : null}
    </div>
  );
}

function Detalle({ id, onClose }) {
  const d = useData();
  const enc = useEncargos();
  const [j, setJ] = useState(null);
  const [vuelta, setVuelta] = useState("");
  const [err, setErr] = useState(null);
  const [verCtx, setVerCtx] = useState(false);
  const fin = useRef(null);
  const resumen = enc.lista.find((x) => x.id === id);

  const cargar = () => fetch(`/api/encargos/${id}`).then((r) => r.json()).then(setJ).catch(() => {});
  useEffect(() => { cargar(); }, [id, resumen && resumen.actualizado]);
  const vivo = j && ["cola", "en-curso"].includes(j.encargo.estado);
  useEffect(() => {
    if (!vivo) return;
    const t = setInterval(cargar, 1500);
    return () => clearInterval(t);
  }, [vivo, id]);
  useEffect(() => { if (vivo && fin.current) fin.current.scrollIntoView({ block: "nearest" }); }, [j && j.eventos.length]);

  if (!j) return <Drawer open onClose={onClose} title={t("encargos.encargo")} width={980}><p className="muted">{t("comun.cargando")}</p></Drawer>;
  const e = j.encargo;
  const info = infoObjetivo(d, e.objetivo);
  const accion = async (url, body) => {
    setErr(null);
    try { await post(url, body); await cargar(); enc.recargar(); } catch (x) { setErr(x.message); }
  };
  const nombre = e.objetivo.tipo === "general" ? t("objetivo.general") : info.titulo;

  return (
    <Drawer open onClose={onClose} width={1040} label={t("encargos.label", { texto: e.texto.slice(0, 40) })}
      kicker={<><EstadoEncargo estado={e.estado} /><span className="muted">{TIPOS_OBJETIVO[e.objetivo.tipo]}</span>{info.href ? <a href={info.href}>{nombre}<ArrowRight size={12} aria-hidden="true" /></a> : <span>{nombre}</span>}</>}
      title={e.texto.split("\n")[0].slice(0, 90)}
      actions={j.terminal ? <CopyButton text={j.terminal} label={t("encargos.seguirTerminal")} /> : null}>
      <div className="detailgrid wide" data-encargo={e.id}>
        <div className="detailmain">
          {e.rondas.map((ronda, n) => <Ronda key={n} ronda={ronda} n={n} eventos={j.eventos} viva={ronda.estado === "en-curso"} agente={e.agente} />)}
          {e.estado === "cola" ? <p className="callout">{t("encargos.enCola")}</p> : null}
          <div ref={fin} />
          {e.copia ? <CopiaAislada encargo={e} onCambio={() => { cargar(); enc.recargar(); }} /> : null}

          {["revisar", "error", "hecho"].includes(e.estado) ? (
            <section className="detailsection">
              <h3><Repeat size={14} aria-hidden="true" /> {t("encargos.otraVuelta")}</h3>
              <p className="muted small">{t("encargos.retoma", { agente: nombreAgente(e.agente) })}</p>
              <textarea rows={3} value={vuelta} onChange={(x) => setVuelta(x.target.value)} placeholder={t("encargos.vueltaEjemplo")}
                onKeyDown={(x) => { if (x.key === "Enter" && (x.metaKey || x.ctrlKey) && vuelta.trim()) accion(`/api/encargos/${e.id}/otra-vuelta`, { texto: vuelta }).then(() => setVuelta("")); }} />
              <div className="row gap-s">
                <button type="button" className="btn primary small" disabled={!vuelta.trim()} onClick={() => accion(`/api/encargos/${e.id}/otra-vuelta`, { texto: vuelta }).then(() => setVuelta(""))}><Sparkles size={14} aria-hidden="true" /><span>{t("encargos.lanzarVuelta")}</span></button>
              </div>
            </section>
          ) : null}
        </div>

        <div className="detailside">
          <section className="detailsection">
            <h3>{t("encargos.queHago")}</h3>
            <div className="stack">
              {e.estado === "borrador" ? <button type="button" className="btn primary" onClick={() => accion(`/api/encargos/${e.id}/lanzar`)}><Play size={14} aria-hidden="true" /><span>{t("composer.lanzar")}</span></button> : null}
              {e.estado === "en-curso" ? <button type="button" className="btn" onClick={() => accion(`/api/encargos/${e.id}/detener`)}><Square size={14} aria-hidden="true" /><span>{t("encargos.detener")}</span></button> : null}
              {e.estado === "cola" ? <button type="button" className="btn" onClick={() => accion(`/api/encargos/${e.id}/detener`)}><Square size={14} aria-hidden="true" /><span>{t("encargos.sacarCola")}</span></button> : null}
              {["revisar", "error"].includes(e.estado) ? <button type="button" className="btn primary" onClick={() => accion(`/api/encargos/${e.id}/estado`, { estado: "hecho" })}><Check size={14} aria-hidden="true" /><span>{t("encargos.darPorBueno")}</span></button> : null}
              {["revisar", "error", "borrador"].includes(e.estado) ? <button type="button" className="btn ghost" onClick={() => accion(`/api/encargos/${e.id}/estado`, { estado: "descartado" })}><Trash2 size={14} aria-hidden="true" /><span>{t("encargos.descartar")}</span></button> : null}
              {["hecho", "descartado"].includes(e.estado) ? <button type="button" className="btn ghost" onClick={() => accion(`/api/encargos/${e.id}/estado`, { estado: "revisar" })}><span>{t("encargos.volverRevisar")}</span></button> : null}
              {err ? <p className="formerror">{err}</p> : null}
              {e.estado === "revisar" ? <p className="muted small">{t("encargos.darPorBuenoNota")}</p> : null}
            </div>
          </section>

          {e.decisiones && e.decisiones.length ? (
            <section className="detailsection">
              <h3>{t("encargos.decisiones")}</h3>
              <ul className="decisiones">{e.decisiones.map((dec, i) => <Decision key={dec} e={e} texto={dec} i={i} onDone={() => { cargar(); }} />)}</ul>
            </section>
          ) : null}

          <section className="detailsection">
            <h3>{t("encargos.archivosTocados")} <span className="count">{e.archivos.length}</span></h3>
            <Archivos archivos={e.archivos} />
          </section>

          <section className="detailsection">
            <h3>{t("encargos.datos")}</h3>
            <Fields rows={[
              [t("objetivo.plantilla"), e.plantilla ? <a href={hrefOf("plantillas", { ver: e.plantilla })}>{e.plantilla}</a> : null],
              [t("nav.referencias"), e.referencias.length ? `${e.referencias.length}` : null],
              [t("composer.modelo"), e.modelo || t("composer.porDefecto")],
              [t("encargos.coste"), e.rondas.some((r) => r.coste) ? `${e.rondas.reduce((s, r) => s + (r.coste || 0), 0).toFixed(2)} USD` : null],
              [t("postDetalle.creado"), hace(e.creado)],
              [t("encargos.sesion"), e.sesion ? <span className="mono small">{e.sesion.slice(0, 8)}</span> : null],
            ]} />
            <button type="button" className="btn ghost small" onClick={() => setVerCtx(!verCtx)} aria-expanded={verCtx}><Eye size={14} aria-hidden="true" /><span>{verCtx ? t("encargos.ocultarCtx") : t("encargos.verCtx")}</span></button>
            {verCtx ? <pre className="raw contextpre">{j.contexto}</pre> : null}
          </section>
        </div>
      </div>
    </Drawer>
  );
}

const COLUMNAS = [
  { id: "pendiente", get label() { return t("encargos.col.pendiente"); }, estados: ["borrador", "cola"] },
  { id: "curso", get label() { return t("encargo.estado.en-curso"); }, estados: ["en-curso"] },
  { id: "revisar", get label() { return t("encargo.estado.revisar"); }, estados: ["revisar", "error"] },
  { id: "hecho", get label() { return t("encargo.estado.hecho"); }, estados: ["hecho"] },
];

export default function Encargos() {
  const d = useData();
  const r = useRouteCtx();
  const enc = useEncargos();
  const verDescartados = r.params.descartados === "1";
  const notas = d.feedback || [];
  const cols = verDescartados ? [...COLUMNAS, { id: "descartado", label: t("encargos.col.descartados"), estados: ["descartado"] }] : COLUMNAS;
  return (
    <>
      <PageHeader title={t("nav.encargos")} sub={t("encargos.sub")}
        actions={<button type="button" className="btn primary" onClick={() => r.set({ pedir: "general" })}><Sparkles size={14} aria-hidden="true" /><span>{t("encargos.nuevo")}</span></button>}>
        <Switch checked={verDescartados} onChange={(v) => r.set({ descartados: v ? "1" : null })}>{t("posts.mostrarDescartados")}</Switch>
      </PageHeader>
      <div className="pad-x">
        {!enc.lista.length ? (
          <Empty icon={Sparkles} title={t("encargos.vacio")}>
            {t("encargos.vacioAyuda")}
          </Empty>
        ) : (
          <div className="board">
            {cols.map((c) => {
              const l = enc.lista.filter((e) => c.estados.includes(e.estado));
              return (
                <div key={c.id} className="boardcol" data-component={`encargos-${c.id}`}>
                  <div className="boardcolhead"><strong className="small">{c.label}</strong><span className="count">{l.length}</span></div>
                  <div className="boardcards">
                    {l.length ? l.slice(0, c.id === "hecho" ? 30 : 100).map((e) => <EncargoCard key={e.id} e={e} href={r.withParams({ ver: e.id })} />) : <p className="muted small pad-s">{t("resumen.nada")}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {notas.length ? (
          <section className="section">
            <div className="sectionhead"><h2><MessageSquareText size={16} aria-hidden="true" /> {t("encargos.notasAgentation")} <span className="count">{notas.length}</span></h2></div>
            <p className="muted small">{t("encargos.notasAyuda")}</p>
            <div className="notelist">
              {notas.slice(0, 12).map((n) => (
                <div key={n} className="noteitem">
                  <span className="mono small">{n.replace(/\.md$/, "").replace(/T(\d\d)-(\d\d).*/, " $1:$2")}</span>
                  <a className="btn small" href={hrefOf("biblioteca", { doc: `.moss/feedback/${n}` })}>{t("encargos.leer")}</a>
                  <button type="button" className="btn small primary" onClick={() => r.set({ pedir: "general", nota: n })}><Sparkles size={14} aria-hidden="true" /><span>{t("encargos.convertir")}</span></button>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
      {r.params.ver ? <Detalle id={r.params.ver} onClose={() => r.set({ ver: null })} /> : null}
    </>
  );
}


