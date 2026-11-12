// Referencias: biblioteca de inspiración que crece. Las tuyas (enlaces, capturas, vídeos) y lo descargado de
// posts.design. Cada una se puede anotar, etiquetar, valorar y adjuntar a un encargo. Son internas: no se nombran en
// público. Muchas ideas vienen de Pond (raphaelsalaja/pond, MIT): paleta y filtro por color, mosaico, vista rápida
// con teclado, vídeo al pasar el ratón, duplicadas por huella visual, búsqueda con sintaxis y vistas guardadas.
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Link2, Upload, ExternalLink, Trash2, Pin, BookOpen, Images, X as Close, Star, LayoutGrid, Columns3, List, Copy, Merge, ChevronLeft, ChevronRight, Contrast, Bookmark, Loader2, Keyboard, Download, Archive, ScanSearch, Check } from "lucide-react";
import { useData } from "../lib/data.js";
import { useRouteCtx, hrefOf } from "../lib/route.js";
import { post, hace } from "../lib/api.js";
import { sonar } from "../lib/sonidos.js";
import { repo } from "../lib/format.js";
import { COLORES, familia, familias, duplicadas, consulta, proporcion, empaquetar, normUrl, motivoDuplicada } from "../lib/refs.js";
import { fmtNumero, t } from "../lib/i18n.js";
import { PageHeader, Segmented, Toggles, SearchBox, Empty, Fields, GlimMark } from "../components/ui.jsx";
import { Drawer } from "../components/Drawer.jsx";
import { Thumb, Player, HoverVideo } from "../components/Media.jsx";

// Etiquetas con getter: se leen al pintar, en el idioma activo.
const FUENTES = [{ id: "todas", get label() { return t("refs.fuente.todas"); } }, { id: "propia", get label() { return t("refs.fuente.propia"); } }, { id: "posts.design", label: "posts.design" }, { id: "estudios", get label() { return t("refs.fuente.estudios"); } }];
const DISENOS = [{ id: "mosaico", get label() { return t("refs.diseno.mosaico"); }, icon: Columns3 }, { id: "rejilla", get label() { return t("posts.rejilla"); }, icon: LayoutGrid }, { id: "lista", get label() { return t("refs.diseno.lista"); }, icon: List }];
const ORDENES = [{ id: "recientes", get label() { return t("refs.orden.recientes"); } }, { id: "valoradas", get label() { return t("refs.orden.valoradas"); } }, { id: "titulo", get label() { return t("registro.titulo"); } }];
const MAX_MB = 60;
// Plataformas con lector propio (server/lectores.js): al pegar su enlace se traen solos el vídeo o las imágenes.
const CON_LECTOR = /(^|\.)(x\.com|twitter\.com|instagram\.com|threads\.(net|com)|linkedin\.com|tiktok\.com|youtube\.com|youtu\.be|vimeo\.com|pinterest\.[a-z.]+|pin\.it|dribbble\.com|behance\.net|are\.na|savee\.(it|com)|cosmos\.so)$/;
const hostDe = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const recargar = () => window.dispatchEvent(new Event("panel:reload"));
const escribiendo = (e) => { const t = e.target; return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); };

function leerArchivo(f) {
  return new Promise((resolve, reject) => {
    if (f.size > MAX_MB * 1e6) return reject(new Error(t("refs.pesaMas", { mb: MAX_MB })));
    const fr = new FileReader();
    fr.onload = () => resolve({ name: f.name, data: fr.result });
    fr.onerror = () => reject(new Error(t("refs.noLeerArchivo")));
    fr.readAsDataURL(f);
  });
}

function Estrellas({ valor = 0, onChange, size = 13 }) {
  if (!onChange) return valor ? <span className="estrellas" aria-label={t("refs.deCinco", { n: valor })}>{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={size} aria-hidden="true" fill={n <= valor ? "currentColor" : "none"} className={n <= valor ? "on" : ""} />)}</span> : null;
  return (
    <div className="estrellas editable" role="radiogroup" aria-label={t("refs.valoracion")}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={valor === n} aria-label={t("refs.deCinco", { n })} className={n <= valor ? "on" : ""}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange(valor === n ? 0 : n); }}>
          <Star size={size} aria-hidden="true" fill={n <= valor ? "currentColor" : "none"} />
        </button>
      ))}
    </div>
  );
}

function Paleta({ r, onColor, grande }) {
  const c = (r.analisis && r.analisis.colores) || [];
  if (!c.length) return null;
  return (
    <span className={`paleta${grande ? " grande" : ""}`}>
      {c.map((h) => onColor
        ? <button key={h} type="button" style={{ background: h }} title={`${h} · ${t(`refs.color.${familia(h)}`)}`} aria-label={t("refs.filtrarPor", { color: t(`refs.color.${familia(h)}`) })} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onColor(familia(h)); }} />
        : <span key={h} style={{ background: h }} title={h} />)}
    </span>
  );
}

function Nueva({ onClose, onSaved }) {
  const d = useData();
  const r = useRouteCtx();
  const [f, setF] = useState({ url: "", titulo: "", notas: "", etiquetas: "" });
  const [archivo, setArchivo] = useState(null);
  const [meta, setMeta] = useState(null);
  const [leyendo, setLeyendo] = useState(false);
  const [lector, setLector] = useState(null); // { estado: "leyendo"|"ok"|"error", leido, elegidos:Set, error }
  const [separar, setSeparar] = useState(false);
  const [copia, setCopia] = useState(true);
  const [err, setErr] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const input = useRef(null);
  const ultima = useRef("");
  const elegir = (file) => { if (!file) return; setArchivo({ file, url: URL.createObjectURL(file) }); setErr(null); };
  const ya = useMemo(() => { const u = normUrl(f.url.trim()); return u ? d.referencias.find((x) => x.url && normUrl(x.url) === u) : null; }, [f.url, d.referencias]);
  const pedirMeta = async (u) => {
    u = u.trim();
    if (!/^https?:\/\/\S+\.\S+/.test(u) || u === ultima.current) return;
    ultima.current = u;
    setLeyendo(true); setMeta(null);
    try {
      const j = await post("/api/referencias/metadatos", { url: u });
      setMeta(j.metadatos);
      setF((x) => ({ ...x, titulo: x.titulo || j.metadatos.titulo || "" }));
    } catch (x) { setMeta({ error: x.message }); } finally { setLeyendo(false); }
    if (CON_LECTOR.test(hostDe(u)) && !archivo) traerMedios(u);
  };
  const traerMedios = async (u) => {
    setLector({ estado: "leyendo" });
    try {
      const j = await post("/api/referencias/leer", { url: u.trim() });
      const l = j.leido;
      setLector({ estado: "ok", leido: l, elegidos: new Set(l.archivos) });
      setF((x) => ({ ...x, titulo: x.titulo && x.titulo !== (meta && meta.titulo) ? x.titulo : (l.autor && l.plataforma !== l.autor ? t("refs.autorEn", { autor: l.autor, plataforma: l.plataforma }) : l.titulo) || x.titulo }));
    } catch (x) { setLector({ estado: "error", error: x.message }); }
  };
  const elegidos = lector && lector.estado === "ok" ? lector.leido.archivos.filter((a) => lector.elegidos.has(a)) : [];
  const alternar = (a) => setLector((l) => { const e = new Set(l.elegidos); e.has(a) ? e.delete(a) : e.add(a); return { ...l, elegidos: e }; });
  const guardar = async (e) => {
    e.preventDefault();
    setEnviando(true); setErr(null);
    try {
      const a = archivo ? await leerArchivo(archivo.file) : null;
      const l = lector && lector.estado === "ok" ? lector.leido : null;
      const extra = !a && meta && !meta.error ? { imagen: meta.imagen || null, descripcion: meta.descripcion || null } : {};
      if (l && l.descripcion) extra.descripcion = l.descripcion;
      const leido = !a && elegidos.length ? { archivos: elegidos, autor: l.autor || null } : null;
      const j = await post("/api/referencias", { ...f, url: f.url.trim() || null, archivo: a, ...extra, leido, separar: separar && elegidos.length > 1, copia: copia && !a && !elegidos.length && !!f.url.trim() });
      sonar("exito");
      onSaved(j.referencia);
    } catch (x) { setErr(x.message); setEnviando(false); }
  };
  const previa = archivo ? (archivo.file.type.startsWith("video") ? <video src={archivo.url} muted autoPlay loop playsInline /> : <img src={archivo.url} alt="" />)
    : elegidos.length ? (/\.(mp4|webm|mov)$/i.test(elegidos[0]) ? <video src={repo(elegidos[0])} muted autoPlay loop playsInline /> : <img src={repo(elegidos[0])} alt="" />)
    : meta && meta.imagen ? <img src={meta.imagen} alt="" referrerPolicy="no-referrer" />
    : <><Upload size={18} aria-hidden="true" /><span className="small">{t("refs.dropAyuda")}</span></>;
  return (
    <form className="newref" onSubmit={guardar}
      onPaste={(e) => { const it = [...e.clipboardData.items].find((i) => i.kind === "file"); if (it) { e.preventDefault(); elegir(it.getAsFile()); } }}
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const u = e.dataTransfer.getData("text/uri-list"); if (u && !e.dataTransfer.files.length) { setF((x) => ({ ...x, url: u })); pedirMeta(u); } else elegir(e.dataTransfer.files[0]); }}>
      <div className="newrefdrop" onClick={() => input.current.click()} role="button" tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current.click()} aria-label={t("refs.subir")}>
        {previa}
        <input ref={input} type="file" accept="image/*,video/*" hidden onChange={(e) => elegir(e.target.files[0])} />
      </div>
      <div className="stack">
        <label className="field">
          <span className="fieldlabel"><Link2 size={13} aria-hidden="true" /> {t("lienzos.enlace")} {leyendo ? <Loader2 size={12} className="spin" aria-label={t("refs.leyendoPagina")} /> : null}</span>
          <input type="url" value={f.url} placeholder={t("refs.urlPlaceholder")} onChange={(e) => setF({ ...f, url: e.target.value })}
            onBlur={(e) => pedirMeta(e.target.value)} onPaste={(e) => { const txt = e.clipboardData.getData("text"); setTimeout(() => pedirMeta(txt), 0); }} />
        </label>
        {ya ? <p className="aviso n-medio small" role="status"><Copy size={12} aria-hidden="true" /> {t("refs.yaLaTienes")} <a href={r.withParams({ ver: ya.id, nueva: null })}>{ya.titulo}</a></p> : null}
        {meta && meta.error ? <p className="muted small">{t("refs.noLeerPagina", { error: meta.error })}</p> : null}
        {meta && meta.descripcion ? <p className="muted small clamp2">{meta.descripcion}</p> : null}
        {lector && lector.estado === "leyendo" ? <p className="lectorestado small"><Loader2 size={13} className="spin" aria-hidden="true" /> {t("refs.leyendoLector", { host: hostDe(f.url) })}</p> : null}
        {lector && lector.estado === "error" ? <p className="muted small">{t("refs.lectorError", { error: lector.error })}</p> : null}
        {lector && lector.estado === "ok" ? (
          lector.leido.archivos.length ? (
            <div className="leidos">
              <span className="small muted"><Download size={12} aria-hidden="true" /> {lector.leido.plataforma} · {t("refs.archivosVia", { n: lector.leido.archivos.length, via: lector.leido.via })}</span>
              <div className="leidosgrid">
                {lector.leido.archivos.map((a) => (
                  <button key={a} type="button" className="leido" aria-pressed={lector.elegidos.has(a)} onClick={() => alternar(a)}>
                    {/\.(mp4|webm|mov)$/i.test(a) ? <video src={repo(a)} muted playsInline preload="metadata" /> : <img src={repo(a)} alt="" />}
                    {lector.elegidos.has(a) ? <span className="leidocheck"><Check size={11} aria-hidden="true" /></span> : null}
                  </button>
                ))}
              </div>
              {elegidos.length > 1 ? <label className="row gap-s small"><input type="checkbox" checked={separar} onChange={(e) => setSeparar(e.target.checked)} /> {t("refs.separar")}</label> : null}
            </div>
          ) : <p className="muted small">{t("refs.lectorVacio")}</p>
        ) : null}
        {f.url.trim() && !archivo && !elegidos.length && !(lector && lector.estado === "leyendo") ? (
          <div className="row gap-s small">
            <label className="row gap-s"><input type="checkbox" checked={copia} onChange={(e) => setCopia(e.target.checked)} /> {t("refs.guardarCopia")}</label>
            {!lector ? <button type="button" className="btn ghost small" onClick={() => traerMedios(f.url)}><ScanSearch size={13} aria-hidden="true" /><span>{t("refs.traerMedios")}</span></button> : null}
          </div>
        ) : null}
        <label className="field"><span className="fieldlabel">{t("registro.titulo")}</span><input value={f.titulo} placeholder={t("refs.tituloPlaceholder")} onChange={(e) => setF({ ...f, titulo: e.target.value })} /></label>
        <label className="field"><span className="fieldlabel">{t("refs.queGusta")}</span><textarea rows={2} value={f.notas} placeholder={t("refs.notasPlaceholder")} onChange={(e) => setF({ ...f, notas: e.target.value })} /></label>
        <label className="field"><span className="fieldlabel">{t("refs.etiquetas")}</span><input value={f.etiquetas} placeholder={t("refs.etiquetasPlaceholder")} onChange={(e) => setF({ ...f, etiquetas: e.target.value })} /></label>
        {err ? <p className="formerror" role="alert">{err}</p> : null}
        <div className="row gap-s">
          <button type="submit" className="btn primary" disabled={enviando || (lector && lector.estado === "leyendo") || (!f.url.trim() && !archivo)}><Plus size={14} aria-hidden="true" /><span>{enviando ? t("lienzos.guardando") : t("refs.guardar")}</span></button>
          <button type="button" className="btn ghost" onClick={onClose}>{t("comun.cancelar")}</button>
        </div>
      </div>
    </form>
  );
}

function Preview({ r, big }) {
  const src = r.archivo && r.existe !== false ? r.archivo : null;
  if (big && src) return <Player path={src} kind={r.tipo === "video" ? "video" : "image"} />;
  if (r.tipo === "video" && src) return r.thumb ? <HoverVideo path={r.previa || src} poster={r.thumb} badge={r.analisis && r.analisis.duracion ? `${Math.round(r.analisis.duracion)} s` : null} /> : <HoverVideo path={src} />;
  if (r.thumb || src) return <Thumb path={r.thumb || src} kind="image" />;
  return <div className="webcard"><Link2 size={18} aria-hidden="true" /><span>{r.dominio || t("lienzos.enlace")}</span></div>;
}

function Tarjeta({ x, modo, dup, onFoco, onColor }) {
  const r = useRouteCtx();
  const fondo = x.analisis && x.analisis.fondo;
  return (
    <a className={`card refcard modo-${modo}`} href={r.withParams({ ver: x.id })} data-referencia={x.id} data-path={x.archivo || undefined}
      onMouseEnter={() => onFoco(x.id)} onFocus={() => onFoco(x.id)}>
      <div className={`cardmedia${modo === "rejilla" ? " r-wide" : ""}`} style={{ aspectRatio: modo === "mosaico" ? String(proporcion(x)) : undefined, backgroundColor: fondo || undefined }}>
        <Preview r={x} />
        {dup ? <span className="dupmark" title={t("refs.posibleDupN", { n: dup.length })}><Copy size={12} aria-hidden="true" /><span className="sr">{t("refs.posibleDup")}</span></span> : null}
      </div>
      <div className="cardbody">
        <span className="cardtitle"><span>{x.titulo}</span><Estrellas valor={x.valoracion} size={11} /></span>
        {x.notas && modo !== "mosaico" ? <span className="cardtext clamp2">{x.notas}</span> : null}
        <span className="cardmeta">
          <Paleta r={x} onColor={onColor} />
          {x.fuente !== "propia" ? <span className="tag">{x.fuente}</span> : null}
          {(x.etiquetas || []).slice(0, modo === "lista" ? 6 : 3).map((et) => <span key={et} className="tag">{et}</span>)}
          {x.dominio ? <span className="tag">{x.dominio}</span> : null}
          {modo === "lista" ? <span className="muted small">{x.creado}</span> : null}
        </span>
      </div>
    </a>
  );
}

function Mosaico({ lista, render }) {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const gap = 16;
  const cols = Math.max(1, Math.floor((w + gap) / (236 + gap)));
  const colW = w ? (w - gap * (cols - 1)) / cols : 0;
  const pack = useMemo(() => (w ? empaquetar(lista, cols, colW) : []), [lista, cols, colW, w]);
  return (
    <div ref={ref} className="mosaico" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {pack.map((c, i) => <div key={i} className="mosaicocol">{c.map(render)}</div>)}
    </div>
  );
}

// Vista rápida (Espacio): la pieza en grande, flechas para pasar, 0–5 para valorar, G para verla en grises,
// Intro para abrir la ficha y Esc o Espacio para cerrar.
function VistaRapida({ lista, indice, onIndice, onClose, onAbrir, onValorar, onColor }) {
  const r = lista[indice];
  const [gris, setGris] = useState(false);
  const ref = useRef(null);
  useEffect(() => { ref.current && ref.current.focus(); }, []);
  useEffect(() => {
    const on = (e) => {
      if (escribiendo(e) || e.metaKey || e.ctrlKey) return;
      const k = e.key;
      if (k === "Escape" || k === " ") { e.preventDefault(); e.stopPropagation(); onClose(); }
      else if (k === "ArrowRight" || k === "ArrowDown" || k === "j") { e.preventDefault(); onIndice(Math.min(lista.length - 1, indice + 1)); }
      else if (k === "ArrowLeft" || k === "ArrowUp" || k === "k") { e.preventDefault(); onIndice(Math.max(0, indice - 1)); }
      else if (k === "Enter") { e.preventDefault(); onAbrir(r.id); }
      else if (/^[0-5]$/.test(k)) { e.preventDefault(); onValorar(r, Number(k)); }
      else if (k === "g" || k === "G") { e.preventDefault(); setGris((g) => !g); }
    };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, [indice, lista, r, onIndice, onClose, onAbrir, onValorar]);
  if (!r) return null;
  const src = r.archivo && r.existe !== false ? r.archivo : null;
  const fondo = r.analisis && r.analisis.fondo;
  return (
    <div className="quicklook" role="dialog" aria-modal="true" aria-label={t("refs.vistaRapida", { titulo: r.titulo })} ref={ref} tabIndex={-1}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <button type="button" className="qlnav prev" onClick={() => onIndice(Math.max(0, indice - 1))} disabled={indice === 0} aria-label={t("refs.anterior")}><ChevronLeft size={20} aria-hidden="true" /></button>
      <div className={`qlmedia${gris ? " gris" : ""}`} style={{ "--ql-fondo": fondo || "transparent" }} onClick={(e) => e.target === e.currentTarget && onClose()}>
        {r.tipo === "video" && src ? <video key={r.id} src={repo(src)} poster={r.thumb ? repo(r.thumb) : undefined} autoPlay muted loop controls playsInline />
          : r.thumb || src ? <img key={r.id} src={repo(r.thumb || src)} alt={r.titulo} />
          : <div className="webcard"><Link2 size={22} aria-hidden="true" /><span>{r.dominio || t("lienzos.enlace")}</span></div>}
      </div>
      <button type="button" className="qlnav next" onClick={() => onIndice(Math.min(lista.length - 1, indice + 1))} disabled={indice >= lista.length - 1} aria-label={t("refs.siguiente")}><ChevronRight size={20} aria-hidden="true" /></button>
      <div className="qlbar">
        <div className="qltitle">
          <strong>{r.titulo}</strong>
          <span className="muted small">{t("refs.posicion", { i: indice + 1, total: lista.length })} · {r.fuente === "propia" ? t("refs.tuyaMin") : r.fuente}{r.handle ? ` · @${r.handle}` : ""}{r.analisis && r.analisis.w ? ` · ${r.analisis.w}×${r.analisis.h}` : ""}</span>
        </div>
        <Paleta r={r} onColor={(c) => { onColor(c); onClose(); }} grande />
        <Estrellas valor={r.valoracion} onChange={(n) => onValorar(r, n)} size={15} />
        <div className="row gap-s">
          <button type="button" className={`iconbtn${gris ? " on" : ""}`} onClick={() => setGris((g) => !g)} aria-pressed={gris} title={t("refs.grisesAtajo")}><Contrast size={15} aria-hidden="true" /><span className="sr">{t("refs.grises")}</span></button>
          {r.url ? <a className="btn ghost small" href={r.url} target="_blank" rel="noreferrer"><ExternalLink size={14} aria-hidden="true" /><span>{t("refs.abrir")}</span></a> : null}
          <button type="button" className="btn small" onClick={() => onAbrir(r.id)}>{t("refs.ficha")}</button>
          <button type="button" className="iconbtn" onClick={onClose} aria-label={t("comun.cerrar")}><Close size={15} aria-hidden="true" /></button>
        </div>
        <p className="qlkeys small muted" aria-hidden="true"><kbd>←</kbd><kbd>→</kbd> {t("refs.qlPasar")} · <kbd>1</kbd>–<kbd>5</kbd> {t("refs.qlValorar")} · <kbd>G</kbd> {t("refs.qlGrises")} · <kbd>{t("refs.qlIntro")}</kbd> {t("refs.qlFicha")} · <kbd>Esc</kbd> {t("refs.qlCerrar")}</p>
      </div>
    </div>
  );
}

function Detalle({ r, dups, onClose, onChanged, onValorar, onColor }) {
  const d = useData();
  const ro = useRouteCtx();
  const propia = r.fuente === "propia";
  const [f, setF] = useState({ titulo: r.titulo, notas: r.notas || "", etiquetas: (r.etiquetas || []).join(", ") });
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState(false);
  const accion = async (fn) => { setErr(null); try { await fn(); onChanged(); } catch (x) { setErr(x.message); } };
  const parecidas = (dups || []).map((p) => ({ ...p, r: d.referencias.find((x) => x.id === p.id) })).filter((p) => p.r);
  const a = r.analisis;
  return (
    <Drawer open onClose={onClose} width={900} title={r.titulo} kicker={<span className="muted">{r.fuente === "propia" ? t("refs.tuya") : r.fuente}{r.handle ? ` · @${r.handle}` : ""} · {r.creado}</span>}
      actions={<>
        {r.url ? <a className="btn ghost small" href={r.url} target="_blank" rel="noreferrer"><ExternalLink size={14} aria-hidden="true" /><span>{t("refs.abrir")}</span></a> : null}
        <button type="button" className="btn small primary" onClick={() => ro.set({ pedir: "general", ref: r.id })}><GlimMark size={14} /><span>{t("lienzos.usarEncargo")}</span></button>
      </>}>
      <div className="detailgrid" data-referencia={r.id} data-path={r.archivo || undefined}>
        <div className="detailmain">
          <div className="refbig"><Preview r={r} big /></div>
          {(r.galeria || []).length ? (
            <div className="galeria" aria-label={t("refs.galeria")}>
              {[r.archivo, ...r.galeria].filter(Boolean).map((g, i) => (
                <a key={g} href={repo(g)} target="_blank" rel="noreferrer" className="galeriaitem">
                  {/\.(mp4|webm|mov)$/i.test(g) ? <video src={repo(g)} muted playsInline preload="metadata" /> : <img src={repo(g)} alt={t("refs.posicion", { i: i + 1, total: r.galeria.length + 1 })} loading="lazy" />}
                </a>
              ))}
            </div>
          ) : null}
          {r.autor ? <p className="small"><strong>{r.autor}</strong></p> : null}
          {r.descripcion ? <p className="muted small">{r.descripcion}</p> : null}
          <Copias r={r} onChanged={onChanged} />
          {r.notas && !propia ? <p className="lead">{r.notas}</p> : null}
          {a && a.colores && a.colores.length ? (
            <section className="detailsection">
              <h3>{t("refs.paleta")}</h3>
              <div className="paletagrande">
                {a.colores.map((h) => (
                  <button key={h} type="button" className="muestra" onClick={() => { onColor(familia(h)); onClose(); }} title={t("refs.verEnColor", { color: t(`refs.color.${familia(h)}`) })}>
                    <span style={{ background: h }} aria-hidden="true" />
                    <code className="small">{h}</code>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </div>
        <div className="detailside">
          <section className="detailsection stack">
            <h3>{t("refs.valoracion")}</h3>
            <Estrellas valor={r.valoracion} onChange={(n) => onValorar(r, n)} size={16} />
          </section>
          {parecidas.length ? (
            <section className="detailsection stack">
              <h3>{t("refs.parecidas")} <span className="muted small">({parecidas.length})</span></h3>
              <ul className="parecidas">
                {parecidas.map((p) => (
                  <li key={p.id}>
                    <a href={ro.withParams({ ver: p.id })} className="parecidathumb" style={{ backgroundColor: p.r.analisis && p.r.analisis.fondo }}>
                      {p.r.thumb || (p.r.archivo && p.r.tipo === "imagen") ? <img src={repo(p.r.thumb || p.r.archivo)} alt="" loading="lazy" /> : <Link2 size={14} aria-hidden="true" />}
                    </a>
                    <span className="stack0">
                      <a href={ro.withParams({ ver: p.id })} className="small">{p.r.titulo}</a>
                      <span className="muted small">{motivoDuplicada(p.motivo)}{p.r.fuente !== "propia" ? ` · ${p.r.fuente}` : ""}</span>
                    </span>
                    {propia && p.r.fuente === "propia" ? (
                      <button type="button" className="btn ghost small" title={t("refs.juntarAyuda")}
                        onClick={() => accion(async () => { await post("/api/referencias/fusionar", { queda: r.id, sale: p.id }); sonar("exito"); })}>
                        <Merge size={13} aria-hidden="true" /><span>{t("refs.juntar")}</span>
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {propia ? (
            <section className="detailsection stack">
              <h3>{t("refs.tusNotas")}</h3>
              <label className="field"><span className="fieldlabel">{t("registro.titulo")}</span><input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} /></label>
              <label className="field"><span className="fieldlabel">{t("refs.queGustaCorto")}</span><textarea rows={4} value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} /></label>
              <label className="field"><span className="fieldlabel">{t("refs.etiquetas")}</span><input value={f.etiquetas} onChange={(e) => setF({ ...f, etiquetas: e.target.value })} /></label>
              <div className="row gap-s">
                <button type="button" className="btn small primary" onClick={() => accion(async () => { await post(`/api/referencias/${r.id}`, f); setOk(true); setTimeout(() => setOk(false), 1500); })}>{ok ? t("lienzos.guardado") : t("comun.guardar")}</button>
                <button type="button" className="btn ghost small" onClick={() => accion(async () => { await post(`/api/referencias/${r.id}/quitar`); sonar("papelera"); onClose(); })}><Trash2 size={14} aria-hidden="true" /><span>{t("refs.quitarLista")}</span></button>
              </div>
              <p className="muted small">{t("refs.quitarNota")}</p>
            </section>
          ) : (
            <section className="detailsection stack">
              <h3>{t("refs.comoTuya")}</h3>
              <p className="muted small">{t("refs.comoTuyaAyuda")}</p>
              <textarea rows={3} value={f.notas} placeholder={t("refs.queGustaPieza")} onChange={(e) => setF({ ...f, notas: e.target.value })} />
              <button type="button" className="btn small primary" onClick={() => accion(async () => { const j = await post(`/api/referencias/${encodeURIComponent(r.id)}/fijar`, { notas: f.notas }); ro.set({ ver: j.referencia.id, fuente: "propia" }); })}><Pin size={14} aria-hidden="true" /><span>{t("refs.guardarMias")}</span></button>
            </section>
          )}
          {err ? <p className="formerror">{err}</p> : null}
          <section className="detailsection">
            <h3>{t("encargos.datos")}</h3>
            <Fields rows={[
              [t("postDetalle.tipo"), ["imagen", "video", "web", "post"].includes(r.tipo) ? t(`refs.tipo.${r.tipo}`) : r.tipo],
              [t("refs.tamano"), a && a.w ? `${a.w}×${a.h}${a.duracion ? ` · ${a.duracion} s` : ""}` : null],
              [t("refs.colores"), familias(r).length ? familias(r).map((c) => t(`refs.color.${c}`)).join(", ") : null],
              [t("refs.etiquetas"), (r.etiquetas || []).length ? r.etiquetas.join(", ") : null],
              [t("postDetalle.archivo"), r.archivo ? <code className="small">{r.archivo}</code> : null],
              [t("refs.grupo"), r.grupo],
            ]} />
          </section>
        </div>
      </div>
    </Drawer>
  );
}

// Copias guardadas de la página (server/archivo.js): portada, captura completa y la copia MHTML para abrir sin red.
function Copias({ r, onChanged }) {
  const [estado, setEstado] = useState(null);
  const [err, setErr] = useState(null);
  if (r.fuente !== "propia" || !r.url) return null;
  const copias = r.copias || [];
  const guardar = async () => {
    setEstado("guardando"); setErr(null);
    try { await post(`/api/referencias/${r.id}/copia`); sonar("exito"); onChanged(); } catch (x) { setErr(x.message); } finally { setEstado(null); }
  };
  const abrir = async (c) => { setErr(null); try { await post("/api/referencias/abrir-copia", { ruta: c.mhtml, titulo: r.titulo }); } catch (x) { setErr(x.message); } };
  const ocupado = estado === "guardando" || r.copiando;
  return (
    <section className="detailsection stack">
      <h3>{t("refs.copias")} <span className="muted small">({copias.length})</span></h3>
      {copias.length ? (
        <ul className="copias">
          {copias.map((c) => (
            <li key={c.carpeta}>
              <a href={repo(c.captura || c.portada)} target="_blank" rel="noreferrer" className="copiathumb"><img src={repo(c.portada)} alt="" loading="lazy" /></a>
              <span className="stack0">
                <span className="small">{c.fecha} · {hace(c.cuando)}</span>
                <span className="muted small">{c.alto ? t("refs.pxAlto", { alto: fmtNumero(c.alto) }) : ""}{Math.round((c.bytes || 0) / 1e5) / 10} MB</span>
              </span>
              <span className="row gap-s">
                {c.captura ? <a className="btn ghost small" href={repo(c.captura)} target="_blank" rel="noreferrer">{t("refs.captura")}</a> : null}
                <button type="button" className="btn ghost small" onClick={() => abrir(c)}>{t("refs.abrirCopia")}</button>
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="muted small">{t("refs.copiasAyuda")}</p>}
      <button type="button" className="btn small" disabled={ocupado} onClick={guardar}>
        {ocupado ? <Loader2 size={13} className="spin" aria-hidden="true" /> : <Archive size={13} aria-hidden="true" />}<span>{ocupado ? t("refs.guardandoCopia") : copias.length ? t("refs.otraCopia") : t("refs.guardarCopiaPagina")}</span>
      </button>
      {err ? <p className="formerror small">{err}</p> : null}
    </section>
  );
}

function Vistas({ vistas, activa, hayFiltro, params, ids, dupCount, onAplicar }) {
  const r = useRouteCtx();
  const [nombre, setNombre] = useState(null);
  const [err, setErr] = useState(null);
  const guardar = async (e) => {
    e.preventDefault();
    try { await post("/api/referencias/vistas", { nombre, params }); sonar("exito"); setNombre(null); setErr(null); recargar(); } catch (x) { setErr(x.message); }
  };
  if (!vistas.length && !hayFiltro && !dupCount) return null;
  return (
    <div className="vistasref" role="group" aria-label={t("refs.vistasGuardadas")}>
      {vistas.map((v) => (
        <span key={v.id} className={`vistachip${activa === v.id ? " on" : ""}`}>
          <button type="button" onClick={() => onAplicar(v)} aria-pressed={activa === v.id}><Bookmark size={12} aria-hidden="true" /><span>{v.nombre}</span></button>
          <button type="button" className="quitar" aria-label={t("refs.quitarVista", { nombre: v.nombre })} onClick={async () => { await post(`/api/referencias/vistas/${v.id}/quitar`); sonar("papelera"); recargar(); }}><Close size={11} aria-hidden="true" /></button>
        </span>
      ))}
      {dupCount ? <button type="button" className="vistachip suave" onClick={() => r.set({ q: "es:duplicada" })}><Copy size={12} aria-hidden="true" /><span>{t("refs.posiblesDup", { n: dupCount })}</span></button> : null}
      <span className="flex1" />
      {hayFiltro ? (
        nombre === null ? (
          <>
            <button type="button" className="btn ghost small" onClick={() => setNombre("")}><Bookmark size={13} aria-hidden="true" /><span>{t("refs.guardarVista")}</span></button>
            <button type="button" className="btn ghost small" disabled={!ids.length} onClick={() => r.set({ pedir: "general", ref: ids.slice(0, 12).join(",") })} title={t("refs.adjunta12")}>
              <GlimMark size={13} /><span>{t("refs.usarEncargoN", { n: Math.min(12, ids.length) })}</span>
            </button>
          </>
        ) : (
          <form className="row gap-s" onSubmit={guardar}>
            <input autoFocus className="small" value={nombre} placeholder={t("refs.nombreVista")} aria-label={t("refs.nombreVista")} maxLength={40} onChange={(e) => setNombre(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setNombre(null)} />
            <button type="submit" className="btn small primary" disabled={!nombre.trim()}>{t("comun.guardar")}</button>
            <button type="button" className="btn ghost small" onClick={() => setNombre(null)}>{t("comun.cancelar")}</button>
            {err ? <span className="formerror small">{err}</span> : null}
          </form>
        )
      ) : null}
    </div>
  );
}

export default function Referencias() {
  const d = useData();
  const r = useRouteCtx();
  const [q, setQ] = useState(r.params.q || "");
  useEffect(() => { setQ(r.params.q || ""); }, [r.params.q]);
  const fuente = r.params.fuente || "todas";
  const tags = r.params.tags ? r.params.tags.split(",") : [];
  const color = r.params.color || null;
  const orden = r.params.orden || "recientes";
  const diseno = r.params.diseno || "mosaico";
  const nueva = r.params.nueva === "1";
  const [val, setVal] = useState({}); // valoraciones recién puestas, antes de que vuelva la recarga
  const [rapida, setRapida] = useState(null);
  const foco = useRef(null);

  const todas = useMemo(() => d.referencias.map((x) => (x.id in val ? { ...x, valoracion: val[x.id] } : x)), [d.referencias, val]);
  const propias = todas.filter((x) => x.fuente === "propia");
  const todasTags = useMemo(() => [...new Set(propias.flatMap((x) => x.etiquetas || []))].sort(), [d.referencias]);
  const dups = useMemo(() => duplicadas(d.referencias), [d.referencias]);
  const dupCount = Object.keys(dups).length;
  const sinAnalizar = d.referencias.filter((x) => !x.analisis && (x.archivo || x.thumb)).length;
  const coincide = useMemo(() => consulta(q, dups), [q, dups]);
  const lista = useMemo(() => {
    const l = todas.filter((x) => (fuente === "todas" || x.fuente === fuente)
      && (!tags.length || tags.every((t) => (x.etiquetas || []).includes(t)))
      && (!color || familias(x).includes(color))
      && coincide(x));
    if (orden === "valoradas") l.sort((a, b) => (b.valoracion || 0) - (a.valoracion || 0));
    else if (orden === "titulo") l.sort((a, b) => a.titulo.localeCompare(b.titulo, "es"));
    return l.slice(0, 300);
  }, [todas, fuente, tags.join(), color, coincide, orden]);
  const abierta = r.params.ver && todas.find((x) => x.id === r.params.ver);
  const params = { q: q.trim() || null, fuente: fuente === "todas" ? null : fuente, tags: tags.join(",") || null, color, orden: orden === "recientes" ? null : orden, diseno: diseno === "mosaico" ? null : diseno };
  const hayFiltro = !!(params.q || params.fuente || params.tags || params.color || params.orden);
  const vistas = d.vistasRef || [];
  const activa = (vistas.find((v) => ["q", "fuente", "tags", "color", "orden"].every((k) => (v.params[k] || null) === params[k])) || {}).id;

  const valorar = async (x, n) => {
    setVal((m) => ({ ...m, [x.id]: n }));
    try { await post("/api/referencias/valorar", { id: x.id, valoracion: n }); recargar(); } catch { setVal((m) => { const c = { ...m }; delete c[x.id]; return c; }); }
  };
  const filtrarColor = (c) => r.set({ color: c === color ? null : c });

  // Atajos de la biblioteca: Espacio abre la vista rápida de la tarjeta bajo el ratón o con el foco, / busca,
  // 1–3 cambian el diseño (mosaico, rejilla, lista).
  useEffect(() => {
    const on = (e) => {
      if (rapida !== null || abierta || escribiendo(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " ") {
        const i = lista.findIndex((x) => x.id === foco.current);
        if (i >= 0) { e.preventDefault(); setRapida(i); }
      } else if (e.key === "/") {
        const el = document.querySelector(".refsvista .searchbox input");
        if (el) { e.preventDefault(); el.focus(); }
      } else if (/^[1-3]$/.test(e.key)) {
        r.set({ diseno: DISENOS[Number(e.key) - 1].id === "mosaico" ? null : DISENOS[Number(e.key) - 1].id });
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [rapida, abierta, lista, r]);

  // Búsqueda: se escribe en la URL al poco de dejar de teclear, para que las vistas y el botón atrás la recuerden.
  useEffect(() => {
    const t = setTimeout(() => { if ((r.params.q || "") !== q) r.set({ q: q || null }); }, 400);
    return () => clearTimeout(t);
  }, [q]);

  const tarjeta = (x) => <Tarjeta key={x.id} x={x} modo={diseno} dup={dups[x.id]} onFoco={(id) => { foco.current = id; }} onColor={filtrarColor} />;

  return (
    <div className="refsvista">
      <PageHeader title={t("nav.referencias")}
        sub={`${t("refs.sub", { tuyas: propias.length, externas: d.referencias.length - propias.length })}${sinAnalizar ? t("refs.analizando", { n: sinAnalizar }) : ""}`}
        actions={<button type="button" className="btn primary" onClick={() => r.set({ nueva: nueva ? null : "1" })} aria-expanded={nueva}>{nueva ? <Close size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}<span>{nueva ? t("comun.cerrar") : t("refs.anadir")}</span></button>}>
        <Segmented label={t("postDetalle.fuente")} value={fuente} onChange={(v) => r.set({ fuente: v === "todas" ? null : v })}
          options={FUENTES.map((f) => ({ ...f, count: f.id === "todas" ? d.referencias.length : f.id === "estudios" ? d.estudios.length : d.referencias.filter((x) => x.fuente === f.id).length }))} />
        {fuente !== "estudios" ? <SearchBox value={q} onChange={setQ} placeholder={t("refs.buscarPlaceholder")} /> : null}
        {fuente !== "estudios" ? (
          <>
            <div className="colores" role="group" aria-label={t("refs.color")}>
              {COLORES.map((c) => (
                <button key={c.id} type="button" className="colorbtn" style={{ "--c": c.hex }} aria-pressed={color === c.id} title={c.label} onClick={() => filtrarColor(c.id)}>
                  <span className="sr">{c.label}</span>
                </button>
              ))}
            </div>
            <Segmented label={t("refs.orden")} value={orden} onChange={(v) => r.set({ orden: v === "recientes" ? null : v })} options={ORDENES} />
            <Segmented label={t("refs.diseno")} value={diseno} onChange={(v) => r.set({ diseno: v === "mosaico" ? null : v })} options={DISENOS} />
          </>
        ) : null}
        {todasTags.length && fuente !== "estudios" ? <Toggles label={t("refs.etiquetas")} value={tags} onChange={(v) => r.set({ tags: v.length ? v.join(",") : null })} options={todasTags.map((t) => ({ id: t, label: t }))} /> : null}
      </PageHeader>
      <div className="pad-x">
        {nueva ? <Nueva onClose={() => r.set({ nueva: null })} onSaved={(ref) => { recargar(); r.set({ nueva: null, fuente: "propia", ver: ref.id }); }} /> : null}
        {fuente !== "estudios" ? (
          <Vistas vistas={vistas} activa={activa} hayFiltro={hayFiltro} params={params} ids={lista.map((x) => x.id)} dupCount={dupCount}
            onAplicar={(v) => { setQ(v.params.q || ""); r.set({ q: null, fuente: null, tags: null, color: null, orden: null, ...v.params }); }} />
        ) : null}

        {fuente === "estudios" ? (
          <div className="cardgrid">
            {d.estudios.map((s) => (
              <a key={s.path} className="card" href={hrefOf("biblioteca", { doc: s.path })} data-path={s.path}>
                <div className="cardbody">
                  <span className="cardtitle"><span>{s.titulo}</span><BookOpen size={14} aria-hidden="true" /></span>
                  <span className="cardtext">{t("refs.palabras", { n: fmtNumero(s.palabras) })} · {s.path.split("/").pop()}</span>
                </div>
              </a>
            ))}
          </div>
        ) : lista.length ? (
          <>
            {diseno === "mosaico" ? <Mosaico lista={lista} render={tarjeta} />
              : diseno === "lista" ? <div className="reflista">{lista.map(tarjeta)}</div>
              : <div className="cardgrid refs">{lista.map(tarjeta)}</div>}
            <p className="atajosref small muted"><Keyboard size={13} aria-hidden="true" /> <kbd>{t("refs.espacio")}</kbd> {t("refs.atajoVistaRapida")} · <kbd>/</kbd> {t("refs.atajoBuscar")} · <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> {t("refs.atajoDiseno")}</p>
          </>
        ) : (
          <Empty icon={Images} title={propias.length || fuente !== "propia" ? t("comun.nadaCoincide") : t("refs.vacio")}>
            {t("refs.vacioAyuda")}
          </Empty>
        )}
      </div>
      {rapida !== null && lista[rapida] ? (
        <VistaRapida lista={lista} indice={rapida} onIndice={setRapida} onClose={() => setRapida(null)}
          onAbrir={(id) => { setRapida(null); r.set({ ver: id }); }} onValorar={valorar} onColor={filtrarColor} />
      ) : null}
      {abierta ? <Detalle key={abierta.id} r={abierta} dups={dups[abierta.id]} onClose={() => r.set({ ver: null })} onChanged={recargar} onValorar={valorar} onColor={filtrarColor} /> : null}
    </div>
  );
}
