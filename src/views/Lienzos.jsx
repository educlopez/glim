// Lienzos: tableros libres para pensar una pieza (el Canvas de Pond, sin librerías). Referencias, notas y títulos
// que se mueven y redimensionan, flechas entre ellos, zoom y desplazamiento. Se guardan solos en
// estrategia/lienzos.json. Un lienzo entero se puede mandar a un encargo: sus referencias y sus notas.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, StickyNote, Type, ZoomIn, ZoomOut, Maximize, Sparkles, Trash2, Search, Spline, ArrowLeft, ExternalLink, PanelRight, Images } from "lucide-react";
import { useData } from "../lib/data.js";
import { useRouteCtx, hrefOf } from "../lib/route.js";
import { post, hace } from "../lib/api.js";
import { sonar } from "../lib/sonidos.js";
import { repo } from "../lib/format.js";
import { proporcion, consulta } from "../lib/refs.js";
import { PageHeader, Empty } from "../components/ui.jsx";
import { t } from "../lib/i18n.js";

const recargar = () => window.dispatchEvent(new Event("panel:reload"));
const nid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const COLORES_NOTA = ["amarillo", "naranja", "verde", "azul", "rosa", "gris"];
const escribiendo = (e) => { const t = e.target; return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); };

// Punto donde la recta del centro de un rectángulo hacia (px, py) corta su borde.
function borde(n, px, py) {
  const cx = n.x + n.w / 2, cy = n.y + n.h / 2, dx = px - cx, dy = py - cy;
  if (!dx && !dy) return [cx, cy];
  const s = Math.min(Math.abs(n.w / 2 / (dx || 1e-9)), Math.abs(n.h / 2 / (dy || 1e-9)));
  return [cx + dx * s, cy + dy * s];
}

function Lista() {
  const d = useData();
  const r = useRouteCtx();
  const [nombre, setNombre] = useState("");
  const [err, setErr] = useState(null);
  const crear = async (e) => {
    e.preventDefault();
    try { const j = await post("/api/lienzos", { nombre }); sonar("exito"); recargar(); r.set({ l: j.lienzo.id }); } catch (x) { setErr(x.message); }
  };
  const lienzos = d.lienzos || [];
  const porId = Object.fromEntries(d.referencias.map((x) => [x.id, x]));
  return (
    <>
      <PageHeader title={t("nav.lienzos")} sub={t("lienzos.sub")}>
        <form className="row gap-s" onSubmit={crear}>
          <input className="lznombrenuevo" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={t("lienzos.nombreNuevo")} aria-label={t("lienzos.nombreNuevo")} maxLength={60} />
          <button type="submit" className="btn primary"><Plus size={14} aria-hidden="true" /><span>{t("lienzos.nuevo")}</span></button>
        </form>
        {err ? <span className="formerror small">{err}</span> : null}
      </PageHeader>
      <div className="pad-x">
        {lienzos.length ? (
          <div className="cardgrid">
            {lienzos.map((l) => {
              const refs = l.nodos.filter((n) => n.tipo === "ref").map((n) => porId[n.ref]).filter(Boolean);
              return (
                <a key={l.id} className="card lzcard" href={r.withParams({ l: l.id })}>
                  <div className="cardmedia r-wide lzmini">
                    {refs.slice(0, 4).map((x) => <span key={x.id} style={{ backgroundColor: x.analisis && x.analisis.fondo }}>{x.thumb || (x.archivo && x.tipo === "imagen") ? <img src={repo(x.thumb || x.archivo)} alt="" loading="lazy" /> : null}</span>)}
                    {!refs.length ? <span className="lzminivacio"><Spline size={20} aria-hidden="true" /></span> : null}
                  </div>
                  <div className="cardbody">
                    <span className="cardtitle"><span>{l.nombre}</span></span>
                    <span className="cardtext">{t("lienzos.resumen", { refs: refs.length, notas: l.nodos.length - refs.length, flechas: l.enlaces.length })} · {hace(l.actualizado)}</span>
                  </div>
                </a>
              );
            })}
          </div>
        ) : (
          <Empty icon={Spline} title={t("lienzos.vacio")}>{t("lienzos.vacioAyuda")}</Empty>
        )}
      </div>
    </>
  );
}

function Nodo({ n, ref_, sel, onDown, onResize, onConectar, onTexto, onColor, editar, setEditar }) {
  const estilo = { left: n.x, top: n.y, width: n.w, height: n.h };
  const comun = { "data-nodo": n.id, style: estilo, onPointerDown: (e) => onDown(e, n) };
  const asas = (
    <>
      <span className="lzasa" title={t("lienzos.unir")} onPointerDown={(e) => { e.stopPropagation(); onConectar(e, n); }} aria-hidden="true" />
      <span className="lzresize" onPointerDown={(e) => { e.stopPropagation(); onResize(e, n); }} aria-hidden="true" />
    </>
  );
  if (n.tipo === "ref") {
    const x = ref_;
    return (
      <div className={`lznodo lzref${sel ? " sel" : ""}`} {...comun}>
        <div className="lzrefmedia" style={{ backgroundColor: x && x.analisis && x.analisis.fondo }}>
          {!x ? <span className="muted small">{t("lienzos.refBorrada")}</span>
            : x.tipo === "video" && x.thumb ? <img src={repo(x.thumb)} alt="" draggable={false} />
            : x.thumb || (x.archivo && x.tipo === "imagen") ? <img src={repo(x.thumb || x.archivo)} alt="" draggable={false} />
            : <span className="muted small">{x.dominio || t("lienzos.enlace")}</span>}
        </div>
        <div className="lzreftitulo">
          <span>{x ? x.titulo : n.ref}</span>
          {x ? <a href={hrefOf("referencias", { ver: x.id })} onPointerDown={(e) => e.stopPropagation()} aria-label={t("lienzos.abrirRef")}><ExternalLink size={12} aria-hidden="true" /></a> : null}
        </div>
        {asas}
      </div>
    );
  }
  const editando = editar === n.id;
  return (
    <div className={`lznodo lz${n.tipo} c-${n.color || (n.tipo === "nota" ? "amarillo" : "nada")}${sel ? " sel" : ""}`} {...comun}
      onDoubleClick={(e) => { e.stopPropagation(); setEditar(n.id); }}>
      {editando
        ? <textarea autoFocus defaultValue={n.texto} onPointerDown={(e) => e.stopPropagation()} onChange={(e) => onTexto(n.id, e.target.value)} onBlur={() => setEditar(null)}
            onKeyDown={(e) => { if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) e.currentTarget.blur(); }} aria-label={t("kit.texto")} />
        : <div className="lztexto">{n.texto || <span className="muted">{n.tipo === "nota" ? t("lienzos.dobleClic") : t("lienzos.titulo")}</span>}</div>}
      {sel && n.tipo === "nota" && !editando ? (
        <div className="lzcolores" onPointerDown={(e) => e.stopPropagation()}>
          {COLORES_NOTA.map((c) => <button key={c} type="button" className={`c-${c}`} aria-label={t(`lienzos.color.${c}`)} aria-pressed={(n.color || "amarillo") === c} onClick={() => onColor(n.id, c)} />)}
        </div>
      ) : null}
      {asas}
    </div>
  );
}

function Editor({ inicial }) {
  const d = useData();
  const r = useRouteCtx();
  const [nombre, setNombre] = useState(inicial.nombre);
  const [nodos, setNodos] = useState(inicial.nodos);
  const [enlaces, setEnlaces] = useState(inicial.enlaces);
  const [vista, setVista] = useState(inicial.vista || { x: 0, y: 0, z: 1 });
  const [sel, setSel] = useState(null); // { tipo: "nodo" | "enlace", id }
  const [editar, setEditar] = useState(null);
  const [temp, setTemp] = useState(null); // flecha en curso { de, x, y }
  const [lateral, setLateral] = useState(true);
  const [q, setQ] = useState("");
  const [guardado, setGuardado] = useState("guardado");
  const [borrar, setBorrar] = useState(false);
  const caja = useRef(null);
  const estado = useRef({});
  estado.current = { nodos, enlaces, vista };
  const porId = useMemo(() => Object.fromEntries(d.referencias.map((x) => [x.id, x])), [d.referencias]);

  // Guardado automático, 700 ms después del último cambio.
  const primera = useRef(true);
  useEffect(() => {
    if (primera.current) { primera.current = false; return; }
    setGuardado("pendiente");
    const t = setTimeout(async () => {
      try { await post(`/api/lienzos/${inicial.id}`, { nombre, nodos, enlaces, vista }); setGuardado("guardado"); } catch { setGuardado("error"); }
    }, 700);
    return () => clearTimeout(t);
  }, [nombre, nodos, enlaces, vista]);

  const aMundo = useCallback((cx, cy) => {
    const b = caja.current.getBoundingClientRect();
    const v = estado.current.vista;
    return [(cx - b.left - v.x) / v.z, (cy - b.top - v.y) / v.z];
  }, []);
  const centro = () => { const b = caja.current.getBoundingClientRect(); return aMundo(b.left + b.width / 2, b.top + b.height / 2); };

  const arrastre = (e, mover, soltar) => {
    e.preventDefault();
    const el = e.currentTarget;
    try { el.setPointerCapture(e.pointerId); } catch {}
    const x0 = e.clientX, y0 = e.clientY;
    const mv = (ev) => mover(ev, (ev.clientX - x0) / estado.current.vista.z, (ev.clientY - y0) / estado.current.vista.z);
    const up = (ev) => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); soltar && soltar(ev); };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };

  const fondoDown = (e) => {
    if (e.button !== 0 || e.target.closest("[data-nodo], .lzenlace, .lzbarra")) return;
    setSel(null); setEditar(null);
    const v0 = estado.current.vista;
    const x0 = e.clientX, y0 = e.clientY;
    e.currentTarget.classList.add("moviendo");
    const el = e.currentTarget;
    const mv = (ev) => setVista({ ...v0, x: v0.x + ev.clientX - x0, y: v0.y + ev.clientY - y0 });
    const up = () => { el.classList.remove("moviendo"); window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };
  const nodoDown = (e, n) => {
    if (e.button !== 0 || editar === n.id) return;
    setSel({ tipo: "nodo", id: n.id });
    const { x, y } = n;
    arrastre(e, (_, dx, dy) => setNodos((l) => l.map((m) => (m.id === n.id ? { ...m, x: Math.round(x + dx), y: Math.round(y + dy) } : m))));
  };
  const resizeDown = (e, n) => {
    const { w, h } = n;
    arrastre(e, (_, dx, dy) => setNodos((l) => l.map((m) => (m.id === n.id ? { ...m, w: Math.max(80, Math.round(w + dx)), h: Math.max(40, Math.round(h + dy)) } : m))));
  };
  const conectarDown = (e, n) => {
    const [x, y] = aMundo(e.clientX, e.clientY);
    setTemp({ de: n.id, x, y });
    arrastre(e, (ev) => { const [mx, my] = aMundo(ev.clientX, ev.clientY); setTemp({ de: n.id, x: mx, y: my }); }, (ev) => {
      setTemp(null);
      const destino = document.elementsFromPoint(ev.clientX, ev.clientY).map((el) => el.closest && el.closest("[data-nodo]")).find((el) => el && el.dataset.nodo !== n.id);
      if (!destino) return;
      const a = destino.dataset.nodo;
      setEnlaces((l) => (l.some((x) => (x.de === n.id && x.a === a) || (x.de === a && x.a === n.id)) ? l : (sonar("suave"), [...l, { id: nid("e-"), de: n.id, a }])));
    });
  };

  // Rueda: desplaza; con ⌘ o Ctrl (o pellizco en el trackpad) hace zoom hacia el cursor.
  useEffect(() => {
    const el = caja.current;
    const on = (e) => {
      if (e.target.closest && e.target.closest(".lzlateral, textarea")) return;
      e.preventDefault();
      setVista((v) => {
        if (e.ctrlKey || e.metaKey) {
          const b = el.getBoundingClientRect();
          const z = Math.min(4, Math.max(0.1, v.z * Math.exp(-e.deltaY * 0.01)));
          const cx = e.clientX - b.left, cy = e.clientY - b.top;
          return { z, x: cx - ((cx - v.x) * z) / v.z, y: cy - ((cy - v.y) * z) / v.z };
        }
        return { ...v, x: v.x - e.deltaX, y: v.y - e.deltaY };
      });
    };
    el.addEventListener("wheel", on, { passive: false });
    return () => el.removeEventListener("wheel", on);
  }, []);

  const zoom = (f) => setVista((v) => {
    const b = caja.current.getBoundingClientRect();
    const z = Math.min(4, Math.max(0.1, v.z * f));
    const cx = b.width / 2, cy = b.height / 2;
    return { z, x: cx - ((cx - v.x) * z) / v.z, y: cy - ((cy - v.y) * z) / v.z };
  });
  const encajar = () => {
    const ns = estado.current.nodos;
    if (!ns.length) return setVista({ x: 0, y: 0, z: 1 });
    const b = caja.current.getBoundingClientRect();
    const x0 = Math.min(...ns.map((n) => n.x)), y0 = Math.min(...ns.map((n) => n.y));
    const x1 = Math.max(...ns.map((n) => n.x + n.w)), y1 = Math.max(...ns.map((n) => n.y + n.h));
    const ancho = b.width - (lateral ? 300 : 0);
    const z = Math.min(1.5, Math.max(0.1, Math.min((ancho - 80) / (x1 - x0 || 1), (b.height - 120) / (y1 - y0 || 1))));
    setVista({ z, x: (ancho - (x1 - x0) * z) / 2 - x0 * z, y: (b.height - (y1 - y0) * z) / 2 - y0 * z + 20 });
  };

  const anadirNodo = (n) => { setNodos((l) => [...l, n]); setSel({ tipo: "nodo", id: n.id }); };
  const nota = (x, y, tipo = "nota") => {
    const [cx, cy] = x === undefined ? centro() : [x, y];
    const n = tipo === "nota" ? { id: nid("n-"), tipo, x: Math.round(cx - 110), y: Math.round(cy - 70), w: 220, h: 140, texto: "" } : { id: nid("t-"), tipo, x: Math.round(cx - 160), y: Math.round(cy - 30), w: 320, h: 60, texto: "" };
    anadirNodo(n);
    setEditar(n.id);
  };
  const ponerRef = (x, cx, cy) => {
    const w = 240;
    const h = Math.round(w / proporcion(x) + 34);
    anadirNodo({ id: nid("r-"), tipo: "ref", ref: x.id, x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h });
  };
  const quitarSel = () => {
    if (!sel) return;
    if (sel.tipo === "nodo") { setNodos((l) => l.filter((n) => n.id !== sel.id)); setEnlaces((l) => l.filter((e) => e.de !== sel.id && e.a !== sel.id)); }
    else setEnlaces((l) => l.filter((e) => e.id !== sel.id));
    setSel(null);
    sonar("papelera");
  };

  useEffect(() => {
    const on = (e) => {
      if (escribiendo(e)) return;
      if ((e.key === "Backspace" || e.key === "Delete") && sel) { e.preventDefault(); quitarSel(); }
      else if (e.key === "Escape") setSel(null);
      else if (e.metaKey || e.ctrlKey || e.altKey) return;
      else if (e.key === "n") { e.preventDefault(); nota(); }
      else if (e.key === "t") { e.preventDefault(); nota(undefined, undefined, "titulo"); }
      else if (e.key === "f") encajar();
      else if (e.key === "+" || e.key === "=") zoom(1.2);
      else if (e.key === "-") zoom(1 / 1.2);
      else if (e.key === "Enter" && sel && sel.tipo === "nodo") { const n = nodos.find((m) => m.id === sel.id); if (n && n.tipo !== "ref") { e.preventDefault(); setEditar(n.id); } }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  });

  const mandar = () => {
    const refs = nodos.filter((n) => n.tipo === "ref" && porId[n.ref]).map((n) => n.ref);
    const nombreDe = (id) => { const n = nodos.find((m) => m.id === id); return !n ? "?" : n.tipo === "ref" ? (porId[n.ref] || {}).titulo || n.ref : (n.texto || "").split("\n")[0].slice(0, 60) || t("lienzos.notaMin"); };
    const textos = nodos.filter((n) => n.tipo !== "ref" && n.texto).map((n) => (n.tipo === "titulo" ? `## ${n.texto}` : `- ${n.texto.replace(/\n/g, "\n  ")}`));
    const flechas = enlaces.map((e) => `- ${nombreDe(e.de)} → ${nombreDe(e.a)}`);
    const txt = [t("lienzos.promptLienzo", { nombre }), textos.length ? `\n${t("lienzos.promptNotas")}\n${textos.join("\n")}` : "", flechas.length ? `\n${t("lienzos.promptRelaciones")}\n${flechas.join("\n")}` : ""].join("\n").trim();
    try { sessionStorage.setItem("composer:texto", txt); } catch {}
    r.set({ pedir: "general", ref: refs.slice(0, 12).join(",") || null });
  };

  const refsLista = useMemo(() => d.referencias.filter(consulta(q)).slice(0, 80), [d.referencias, q]);
  const nPorId = Object.fromEntries(nodos.map((n) => [n.id, n]));

  return (
    <div className="lzeditor">
      <div className="lzlienzo" ref={caja} onPointerDown={fondoDown}
        onDoubleClick={(e) => { if (!e.target.closest("[data-nodo], .lzbarra, .lzlateral")) { const [x, y] = aMundo(e.clientX, e.clientY); nota(x, y); } }}
        onDragOver={(e) => { if (e.dataTransfer.types.includes("text/x-referencia")) e.preventDefault(); }}
        onDrop={(e) => { const id = e.dataTransfer.getData("text/x-referencia"); const x = porId[id]; if (!x) return; e.preventDefault(); const [cx, cy] = aMundo(e.clientX, e.clientY); ponerRef(x, cx, cy); }}
        style={{ "--lz-x": `${vista.x}px`, "--lz-y": `${vista.y}px`, "--lz-z": vista.z }}>
        <div className="lzmundo" style={{ transform: `translate(${vista.x}px, ${vista.y}px) scale(${vista.z})` }}>
          <svg className="lzsvg" aria-hidden="true">
            <defs><marker id="lzflecha" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" /></marker></defs>
            {enlaces.map((e) => {
              const a = nPorId[e.de], b = nPorId[e.a];
              if (!a || !b) return null;
              const [x1, y1] = borde(a, b.x + b.w / 2, b.y + b.h / 2);
              const [x2, y2] = borde(b, a.x + a.w / 2, a.y + a.h / 2);
              const s = sel && sel.tipo === "enlace" && sel.id === e.id;
              return (
                <g key={e.id} className={`lzenlace${s ? " sel" : ""}`} onPointerDown={(ev) => { ev.stopPropagation(); setSel({ tipo: "enlace", id: e.id }); }}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} className="lzhit" />
                  <line x1={x1} y1={y1} x2={x2} y2={y2} markerEnd="url(#lzflecha)" />
                </g>
              );
            })}
            {temp && nPorId[temp.de] ? (() => { const a = nPorId[temp.de]; const [x1, y1] = borde(a, temp.x, temp.y); return <line className="lztemp" x1={x1} y1={y1} x2={temp.x} y2={temp.y} markerEnd="url(#lzflecha)" />; })() : null}
          </svg>
          {nodos.map((n) => (
            <Nodo key={n.id} n={n} ref_={n.tipo === "ref" ? porId[n.ref] : null} sel={sel && sel.tipo === "nodo" && sel.id === n.id}
              onDown={nodoDown} onResize={resizeDown} onConectar={conectarDown} editar={editar} setEditar={setEditar}
              onTexto={(id, t) => setNodos((l) => l.map((m) => (m.id === id ? { ...m, texto: t } : m)))}
              onColor={(id, c) => setNodos((l) => l.map((m) => (m.id === id ? { ...m, color: c } : m)))} />
          ))}
        </div>
        {!nodos.length ? <p className="lzvacio muted">{t("lienzos.vacioEditor")}</p> : null}
      </div>

      <div className="lzbarra" role="toolbar" aria-label={t("lienzos.lienzo")}>
        <a className="iconbtn" href={hrefOf("lienzos")} aria-label={t("lienzos.todos")}><ArrowLeft size={15} aria-hidden="true" /></a>
        <input className="lznombre" value={nombre} onChange={(e) => setNombre(e.target.value)} aria-label={t("lienzos.nombre")} maxLength={60} />
        <span className={`lzguardado small ${guardado}`} role="status">{guardado === "guardado" ? t("lienzos.guardado") : guardado === "error" ? t("app.noSeGuardo") : t("lienzos.guardando")}</span>
        <span className="lzsep" />
        <button type="button" className="btn ghost small" onClick={() => nota()} title={t("lienzos.notaAtajo")}><StickyNote size={14} aria-hidden="true" /><span>{t("lienzos.nota")}</span></button>
        <button type="button" className="btn ghost small" onClick={() => nota(undefined, undefined, "titulo")} title={t("lienzos.tituloAtajo")}><Type size={14} aria-hidden="true" /><span>{t("lienzos.titulo")}</span></button>
        <span className="lzsep" />
        <button type="button" className="iconbtn" onClick={() => zoom(1 / 1.2)} aria-label={t("lienzos.alejar")}><ZoomOut size={15} aria-hidden="true" /></button>
        <button type="button" className="lzzoom small" onClick={() => setVista((v) => ({ ...v, z: 1 }))} title={t("lienzos.volver100")}>{Math.round(vista.z * 100)} %</button>
        <button type="button" className="iconbtn" onClick={() => zoom(1.2)} aria-label={t("lienzos.acercar")}><ZoomIn size={15} aria-hidden="true" /></button>
        <button type="button" className="iconbtn" onClick={encajar} aria-label={t("lienzos.encajar")}><Maximize size={15} aria-hidden="true" /></button>
        <span className="lzsep" />
        {sel ? <button type="button" className="btn ghost small" onClick={quitarSel}><Trash2 size={14} aria-hidden="true" /><span>{sel.tipo === "enlace" ? t("lienzos.quitarFlecha") : t("lienzos.quitarElemento")}</span></button> : null}
        <button type="button" className="btn small primary" onClick={mandar} disabled={!nodos.length}><Sparkles size={14} aria-hidden="true" /><span>{t("lienzos.usarEncargo")}</span></button>
        <button type="button" className={`iconbtn${lateral ? " on" : ""}`} onClick={() => setLateral((v) => !v)} aria-pressed={lateral} aria-label={t("lienzos.panelRefs")}><PanelRight size={15} aria-hidden="true" /></button>
      </div>

      {lateral ? (
        <aside className="lzlateral" aria-label={t("lienzos.refsArrastrar")}>
          <label className="searchbox"><Search size={14} aria-hidden="true" /><span className="sr">{t("comun.buscar")}</span><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("lienzos.buscarPlaceholder")} /></label>
          <p className="muted small">{t("lienzos.arrastraAyuda")}</p>
          <div className="lzrefs">
            {refsLista.map((x) => (
              <button key={x.id} type="button" className="lzrefitem" draggable onDragStart={(e) => { e.dataTransfer.setData("text/x-referencia", x.id); e.dataTransfer.effectAllowed = "copy"; }}
                onClick={() => { const [cx, cy] = centro(); const k = nodos.length % 6; ponerRef(x, cx - 150 + k * 60, cy - 60 + k * 40); }} title={x.titulo} style={{ backgroundColor: x.analisis && x.analisis.fondo }}>
                {x.thumb || (x.archivo && x.tipo === "imagen") ? <img src={repo(x.thumb || x.archivo)} alt="" loading="lazy" draggable={false} /> : <Images size={16} aria-hidden="true" />}
                <span>{x.titulo}</span>
              </button>
            ))}
          </div>
          <div className="lzpeligro">
            {borrar
              ? <><span className="small">{t("lienzos.borrarConfirm")}</span><button type="button" className="btn small danger" onClick={async () => { await post(`/api/lienzos/${inicial.id}/quitar`); sonar("papelera"); recargar(); r.set({ l: null }); }}>{t("comun.borrar")}</button><button type="button" className="btn ghost small" onClick={() => setBorrar(false)}>{t("comun.cancelar")}</button></>
              : <button type="button" className="btn ghost small" onClick={() => setBorrar(true)}><Trash2 size={13} aria-hidden="true" /><span>{t("lienzos.borrar")}</span></button>}
          </div>
        </aside>
      ) : null}
      <p className="lzatajos small muted" aria-hidden="true">{t("lienzos.atajos")}</p>
    </div>
  );
}

export default function Lienzos() {
  const d = useData();
  const r = useRouteCtx();
  const l = r.params.l && (d.lienzos || []).find((x) => x.id === r.params.l);
  if (r.params.l && !l) return <div className="pad-x"><Empty icon={Spline} title={t("lienzos.noExiste")}><a href={hrefOf("lienzos")}>{t("comun.verTodos")}</a></Empty></div>;
  // key: el editor se monta una vez por lienzo; las recargas del repo no pisan lo que estás moviendo.
  return l ? <Editor key={l.id} inicial={l} /> : <Lista />;
}
