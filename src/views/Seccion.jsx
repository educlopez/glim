// Sección propia del cerebro (glim.config.json → secciones, server/secciones.js): galería, lista, tablero o documento.
// La misma vista pinta cualquiera; la sección dice qué carpeta o archivo enseña y qué campos.
import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { useData } from "../lib/data.js";
import { useRouteCtx, hrefOf } from "../lib/route.js";
import { md } from "../lib/api.js";
import { PageHeader, Empty, GlimMark } from "../components/ui.jsx";
import { Thumb, Player } from "../components/Media.jsx";
import { Drawer } from "../components/Drawer.jsx";
import { repo, haceDias } from "../lib/format.js";
import { abrirAgente } from "../components/AgentePanel.jsx";
import { t } from "../lib/i18n.js";

// HTML en vivo, escalado al ancho de su caja sin deformarlo (lienzo de 1280×800).
function HtmlVivo({ path, ancho = 1280, alto = 800, interactivo = false }) {
  const ref = useRef(null);
  const [k, setK] = useState(0.25);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setK(e.contentRect.width / ancho));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ancho]);
  return (
    <div ref={ref} className="secframe" style={{ aspectRatio: `${ancho} / ${alto}` }}>
      <iframe title={path} src={repo(path)} loading="lazy" sandbox="allow-scripts" tabIndex={interactivo ? 0 : -1}
        style={{ width: ancho, height: alto, transform: `scale(${k})`, pointerEvents: interactivo ? "auto" : "none" }} />
    </div>
  );
}

function Galeria({ items }) {
  const r = useRouteCtx();
  const abierto = r.params.ver && items.find((x) => x.path === r.params.ver);
  if (!items.length) return <Empty title={t("seccion.vacia")}>{t("seccion.vaciaGaleria")}</Empty>;
  return (
    <>
      <div className="cardgrid">
        {items.map((x) => (
          <a key={x.path} className="card" href={r.withParams({ ver: x.path })} data-path={x.path}>
            <div className="cardmedia secmedia">{x.tipo === "html" ? <HtmlVivo path={x.path} /> : <Thumb path={x.path} kind={x.tipo} alt={x.nombre} />}</div>
            <div className="cardbody"><div className="cardtitle"><span>{x.nombre}</span><span className="muted small">{haceDias(x.mtime)}</span></div></div>
          </a>
        ))}
      </div>
      {abierto ? (
        <Drawer open onClose={() => r.set({ ver: null })} width={900} title={abierto.nombre} kicker={<code className="small muted">{abierto.path}</code>}
          actions={<a className="btn ghost small" href={repo(abierto.path)} target="_blank" rel="noreferrer"><ExternalLink size={14} aria-hidden="true" /><span>{t("seccion.abrirArchivo")}</span></a>}>
          {abierto.tipo === "html" ? <HtmlVivo path={abierto.path} interactivo /> : <Player path={abierto.path} kind={abierto.tipo} />}
        </Drawer>
      ) : null}
    </>
  );
}

const enlace = (x) => (x.path && /\.(md|json)$/.test(x.path) ? hrefOf("biblioteca", { doc: x.path }) : null);

function Lista({ s: base, items }) {
  // El título ya tiene su columna: si el campo del título está también en «campos», no se repite.
  const s = { ...base, campos: base.campos.filter((k) => k !== (base.campoTitulo || "titulo")) };
  if (!items.length) return <Empty title={t("seccion.vacia")}>{t("seccion.vaciaLista")}</Empty>;
  return (
    <div className="sectabla" role="table" aria-label={s.titulo} style={{ "--cols": s.campos.length }}>
      <div className="secfila cabecera" role="row">
        <span role="columnheader">{t("seccion.titulo")}</span>
        {s.campos.map((c) => <span key={c} role="columnheader">{c}</span>)}
      </div>
      {items.map((x) => {
        const href = enlace(x);
        const Fila = href ? "a" : "div";
        return (
          <Fila key={x.id} className="secfila" role="row" href={href || undefined} data-path={x.path}>
            <span role="cell" className="secfilatitulo">{x.titulo}</span>
            {s.campos.map((c) => <span key={c} role="cell" className="muted">{x.campos[c] || "—"}</span>)}
          </Fila>
        );
      })}
    </div>
  );
}

function Tablero({ s, columnas, sinColumna }) {
  const todas = [...columnas, ...(sinColumna && sinColumna.length ? [{ id: t("seccion.sinValor"), items: sinColumna }] : [])];
  if (!todas.some((c) => c.items.length)) return <Empty title={t("seccion.vacia")}>{t("seccion.vaciaLista")}</Empty>;
  return (
    <div className="board">
      {todas.map((c) => (
        <section key={c.id || "_"} className="boardcol" aria-label={c.id || t("seccion.sinValor")}>
          <header className="boardcolhead"><strong className="small">{c.id || t("seccion.sinValor")}</strong><span className="count">{c.items.length}</span></header>
          <div className="boardcards">
            {c.items.map((x) => {
              const href = enlace(x);
              const Tarjeta = href ? "a" : "div";
              const campos = s.campos.filter((k) => k !== s.agruparPor && k !== (s.campoTitulo || "titulo") && x.campos[k]);
              return (
                <Tarjeta key={x.id} className="card secitem" href={href || undefined} data-path={x.path}>
                  <div className="cardbody">
                    <div className="cardtitle"><span>{x.titulo}</span></div>
                    {campos.length ? <div className="cardmeta">{campos.map((k) => <span key={k} className="muted small">{x.campos[k]}</span>)}</div> : null}
                  </div>
                </Tarjeta>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function Documento({ documento }) {
  if (!documento || documento.texto == null) return <Empty title={t("seccion.sinDocumento")} />;
  return <article className="prose seccdoc" dangerouslySetInnerHTML={{ __html: md(documento.texto) }} />;
}

export default function Seccion({ id }) {
  const d = useData();
  const [st, setSt] = useState({ cargando: true });
  // Se relee al cambiar de sección o cuando el repo cambia en disco (d.generado).
  useEffect(() => {
    let off = false;
    fetch(`/api/secciones/${encodeURIComponent(id)}`).then(async (r) => ({ ok: r.ok, j: await r.json() }))
      .then(({ ok, j }) => { if (!off) setSt(ok ? { ...j, id } : { error: j.error, id }); })
      .catch((e) => { if (!off) setSt({ error: String(e), id }); });
    return () => { off = true; };
  }, [id, d.generado]);
  const resumen = ((d.secciones && d.secciones.secciones) || []).find((s) => s.id === id);
  const error = ((d.secciones && d.secciones.errores) || []).find((e) => e.id === id);
  const titulo = (st.seccion && st.seccion.titulo) || (resumen && resumen.titulo) || id;
  const pedir = <button type="button" className="btn ghost small" onClick={() => abrirAgente(t("seccion.pedirTexto", { titulo }))}><GlimMark size={13} /><span>{t("seccion.pedir")}</span></button>;
  const fuente = st.seccion && (st.seccion.carpeta || st.seccion.archivo);
  return (
    <>
      <PageHeader title={titulo} sub={(st.seccion && st.seccion.descripcion) || null}
        actions={<>{fuente ? <code className="small muted secfuente" title={fuente}>{fuente}</code> : null}{pedir}</>} />
      {error ? <div className="banner" role="alert">{t("seccion.error", { error: error.error })}</div> : null}
      {st.id !== id || st.cargando ? <p className="muted pad">{t("comun.cargando")}</p>
        : st.error ? <Empty title={t("seccion.noSePuede")}>{st.error}</Empty>
        : st.seccion.tipo === "galeria" ? <Galeria items={st.items} />
        : st.seccion.tipo === "documento" ? <Documento documento={st.documento} />
        : st.seccion.tipo === "tablero" ? <Tablero s={st.seccion} columnas={st.columnas} sinColumna={st.sinColumna} />
        : <Lista s={st.seccion} items={st.items} />}
    </>
  );
}
