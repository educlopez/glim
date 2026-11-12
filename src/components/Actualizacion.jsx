// Ciclo de vida de la app, como una app de Mac (y como Pond):
//   - Caja en la barra lateral: versión, «Actualización disponible» y «Publicar cambios».
//   - Hoja de actualización: qué trae main, qué hará (recargar o reinstalar y reiniciar) y botón Actualizar.
//   - Hoja de publicación: cambios agrupados y los pasos en directo (seguridad, PR, revisión, CI, fusión).
//   - Hoja de novedades: al abrir tras actualizar, lo nuevo de cada versión (changelog/ de Moss).
// El contenido del repo no necesita botón: el servidor avisa en cuanto cambia un archivo y la ventana relee sola.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  RefreshCw, CloudDownload, CircleCheck, LoaderCircle, GitBranch, UploadCloud, X as Close, Circle, CircleX, CircleAlert,
  CircleMinus, GitPullRequest,
} from "lucide-react";
import { post, hace, md } from "../lib/api.js";
import { useData } from "../lib/data.js";
import { sonar } from "../lib/sonidos.js";
import * as eventos from "../lib/eventos.js";

const VISTA = "panel:novedadesVista";
const leerVista = () => { try { return localStorage.getItem(VISTA); } catch { return null; } };
const ponerVista = (v) => { try { localStorage.setItem(VISTA, v); } catch {} };
const cmp = (a, b) => { const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };

function Hoja({ titulo, sub, onClose, children, pie, ancho = 560, cerrable = true }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current && ref.current.focus();
    const on = (e) => { if (e.key === "Escape" && cerrable) { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, [onClose, cerrable]);
  return (
    <>
      <div className="scrim" onClick={() => cerrable && onClose()} aria-hidden="true" />
      <div className="hoja" role="dialog" aria-modal="true" aria-label={titulo} tabIndex={-1} ref={ref} style={{ "--hoja-w": `${ancho}px` }}>
        <header className="hojahead">
          <div className="stack0"><h2>{titulo}</h2>{sub ? <p className="muted small">{sub}</p> : null}</div>
          {cerrable ? <button type="button" className="iconbtn" onClick={onClose} aria-label="Cerrar"><Close size={16} aria-hidden="true" /></button> : null}
        </header>
        <div className="hojabody">{children}</div>
        {pie ? <footer className="hojapie">{pie}</footer> : null}
      </div>
    </>
  );
}

const ICONO_PASO = { pendiente: Circle, "en-curso": LoaderCircle, ok: CircleCheck, aviso: CircleAlert, error: CircleX, omitido: CircleMinus };
function Pasos({ pasos }) {
  return (
    <ol className="pasos">
      {pasos.map((p) => {
        const I = ICONO_PASO[p.estado] || Circle;
        return (
          <li key={p.id} className={`paso p-${p.estado}`}>
            <I size={15} aria-hidden="true" className={p.estado === "en-curso" ? "spin" : ""} />
            <span className="stack0">
              <span className="small">{p.nombre}</span>
              {p.detalle ? <span className="muted small paso-detalle">{/^https?:\/\//.test(p.detalle) ? <a href={p.detalle} target="_blank" rel="noreferrer">{p.detalle.replace(/^https:\/\/github\.com\//, "")}</a> : p.detalle}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Cuenta({ hasta }) {
  const [, set] = useState(0);
  useEffect(() => { const t = setInterval(() => set((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.round((new Date(hasta).getTime() - Date.now()) / 1000));
  return <span className="mono">{Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}</span>;
}

export function Publicar({ onClose }) {
  const d = useData();
  const [e, setE] = useState(null);
  const [err, setErr] = useState(null);
  const [abiertas, setAbiertas] = useState({});
  const cargar = useCallback(() => fetch("/api/publicar").then((r) => r.json()).then(setE).catch(() => {}), []);
  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 2500);
    const on = () => cargar();
    const off = eventos.on("panel:publicar", on);
    return () => { clearInterval(t); off(); };
  }, [cargar]);
  const a = e && e.actual;
  const vivo = a && ["en-curso", "esperando"].includes(a.estado);
  const fin = a && ["fusionada", "abierta", "bloqueada", "error", "nada"].includes(a.estado);
  const prev = useRef(null);
  useEffect(() => {
    if (!a) return;
    if (prev.current && prev.current !== a.estado) {
      if (a.estado === "fusionada") sonar("exito");
      if (a.estado === "error" || a.estado === "bloqueada") sonar("papelera");
    }
    prev.current = a.estado;
  }, [a && a.estado]);
  const empezar = async () => { setErr(null); try { await post("/api/publicar"); sonar("toque"); setTimeout(cargar, 400); } catch (x) { setErr(x.message); } };
  const cancelar = async () => { try { await post("/api/publicar/cancelar"); cargar(); } catch (x) { setErr(x.message); } };
  const p = d.ajustes.publicar;
  const mostrarPasos = a && (vivo || (fin && a.inicio && Date.now() - new Date(a.inicio).getTime() < 3600e3));
  const c = e && e.cambios;
  return (
    <Hoja titulo="Publicar cambios" onClose={onClose} ancho={620}
      sub={c ? `${c.total} archivo${c.total === 1 ? "" : "s"} sin subir · rama ${c.rama}` : "Cargando…"}
      pie={
        vivo ? (a.estado === "esperando"
          ? <><span className="small muted">Se fusiona en <Cuenta hasta={a.fusionaEn} /></span><span className="flex1" /><button type="button" className="btn" onClick={cancelar}>Cancelar fusión</button></>
          : <span className="small muted"><LoaderCircle size={13} className="spin" aria-hidden="true" /> Trabajando… puedes cerrar esta hoja, sigue en segundo plano.</span>)
        : <>
            <span className="small muted">{p.revisar ? "Revisa la IA" : "Sin revisión"} · {p.fusionarSola ? `se fusiona sola${p.esperaMin ? ` tras ${p.esperaMin} min` : ""}` : "la PR queda abierta"}</span>
            <span className="flex1" />
            <button type="button" className="btn ghost" onClick={onClose}>Cerrar</button>
            <button type="button" className="btn primary" disabled={!c || !c.total} onClick={empezar}><UploadCloud size={14} aria-hidden="true" /><span>Publicar</span></button>
          </>
      }>
      {mostrarPasos ? (
        <>
          {a.commit ? <p className="pubtitulo"><strong>{a.commit.titulo}</strong>{a.version ? <span className="tag">panel {a.version}</span> : null}</p> : null}
          <Pasos pasos={a.pasos} />
          {a.estado === "fusionada" ? <p className="aviso n-bajo small"><CircleCheck size={13} aria-hidden="true" /> Fusionada en main{a.pr ? <> · <a href={a.pr.url} target="_blank" rel="noreferrer">PR #{a.pr.numero}</a></> : null}. Ya estás en main.</p> : null}
          {a.estado === "bloqueada" || a.estado === "error" ? <p className="aviso n-alto small"><CircleX size={13} aria-hidden="true" /> {a.error}{a.pr ? <> · <a href={a.pr.url} target="_blank" rel="noreferrer">Abrir la PR</a></> : null}</p> : null}
          {a.revision && (a.revision.hallazgos || []).length ? (
            <ul className="hallazgos">{a.revision.hallazgos.map((h, i) => <li key={i} className="small"><span className={`tag ${h.gravedad === "bloquea" ? "is-alto" : ""}`}>{h.gravedad}</span> <code>{h.archivo}</code> {h.texto}</li>)}</ul>
          ) : null}
        </>
      ) : c ? (
        c.total ? (
          <div className="zonas">
            {c.zonas.map((z) => (
              <div key={z.zona} className="zona">
                <button type="button" className="zonahead" aria-expanded={!!abiertas[z.zona]} onClick={() => setAbiertas((x) => ({ ...x, [z.zona]: !x[z.zona] }))}>
                  <strong className="small">{z.zona}</strong><span className="muted small">{z.total} archivo{z.total === 1 ? "" : "s"}{z.nuevos ? ` · ${z.nuevos} nuevo${z.nuevos === 1 ? "" : "s"}` : ""}</span>
                </button>
                {abiertas[z.zona] ? <ul className="zonaarchivos">{z.archivos.map((f) => <li key={f.ruta} className="mono small"><span className={`fst s-${f.estado === "??" ? "N" : f.estado[0]}`}>{f.estado === "??" ? "N" : f.estado[0]}</span>{f.ruta}</li>)}{z.total > z.archivos.length ? <li className="muted small">y {z.total - z.archivos.length} más</li> : null}</ul> : null}
              </div>
            ))}
            <p className="muted small">Al publicar: comprueba seguridad y sintaxis, la IA redacta el commit{p.revisar ? " y revisa el diff contra las reglas del cerebro" : ""}, abre una PR a main{p.fusionarSola ? " y, si todo pasa, la fusiona" : ""}. Cada publicación es tu OK para esa subida.</p>
          </div>
        ) : <p className="small updateok"><CircleCheck size={14} aria-hidden="true" /> No hay nada sin subir.</p>
      ) : <p className="muted small">Mirando qué ha cambiado…</p>}
      {e && e.historial && e.historial.length && !vivo ? (
        <details className="pubhist">
          <summary className="small muted">Publicaciones anteriores</summary>
          <ul>{e.historial.slice(0, 8).map((h) => <li key={h.id} className="small"><span className={`tag s-${h.estado}`}>{h.estado}</span> {h.titulo || "—"} {h.pr ? <a href={h.pr.url} target="_blank" rel="noreferrer">#{h.pr.numero}</a> : null} <span className="muted">{hace(h.inicio)}</span></li>)}</ul>
        </details>
      ) : null}
      {err ? <p className="formerror small">{err}</p> : null}
    </Hoja>
  );
}

function HojaActualizar({ a, onClose }) {
  const [estado, setEstado] = useState(null);
  const [err, setErr] = useState(null);
  const aplicar = async () => {
    setErr(null); setEstado(a.requiereApp ? "Descargando y reinstalando la app (1–2 min)…" : "Descargando…");
    try {
      const r = await post("/api/actualizacion/aplicar", { relanzar: !!window.panelApp });
      sonar("exito");
      if (r.reinicio === "app") { setEstado("Reiniciando la app…"); if (!window.panelApp) setEstado("App reinstalada: ábrela de nuevo."); return; }
      setEstado("Listo. Recargando…");
      setTimeout(() => location.reload(), 600);
    } catch (x) { setErr(x.message); setEstado(null); }
  };
  return (
    <Hoja titulo="Actualización disponible" onClose={onClose} cerrable={!estado}
      sub={a.versionRemota && a.versionRemota !== a.versionLocal ? `Moss ${a.versionLocal} → ${a.versionRemota}` : `${a.atras} cambio${a.atras === 1 ? "" : "s"} nuevos en main`}
      pie={<>
        <span className="small muted">{a.requiereApp ? "Cambia el núcleo de la app: se reinstala y se reinicia sola." : "Se recarga la ventana; no hace falta reiniciar."}</span>
        <span className="flex1" />
        {!estado ? <button type="button" className="btn ghost" onClick={onClose}>Más tarde</button> : null}
        <button type="button" className="btn primary" disabled={!!estado || !!a.bloqueo} onClick={aplicar}>{estado ? <LoaderCircle size={14} className="spin" aria-hidden="true" /> : <CloudDownload size={14} aria-hidden="true" />}<span>{estado || "Actualizar ahora"}</span></button>
      </>}>
      {a.bloqueo === "cambios-locales" ? <p className="aviso n-medio small"><CircleAlert size={13} aria-hidden="true" /> Tienes cambios sin subir. Publícalos primero para no perderlos.</p> : null}
      {a.bloqueo === "otra-rama" ? <p className="aviso n-bajo small"><GitBranch size={13} aria-hidden="true" /> Estás en la rama {a.rama}. Al actualizar se vuelve a main.</p> : null}
      <ul className="commits">{a.commits.map((c) => <li key={c.sha} className="small"><span className="mono muted">{c.sha}</span> {c.titulo}</li>)}</ul>
      <p className="muted small">Al terminar verás las novedades de la versión nueva.</p>
      {err ? <p className="formerror small">{err}</p> : null}
    </Hoja>
  );
}

export function Novedades({ desde, onClose }) {
  const [n, setN] = useState(null);
  useEffect(() => { fetch("/api/novedades").then((r) => r.json()).then(setN).catch(() => {}); }, []);
  if (!n) return null;
  const lista = n.novedades.filter((x) => !desde || cmp(x.version, desde) > 0);
  const cerrar = () => { ponerVista(n.version); onClose(); };
  return (
    <Hoja titulo="Novedades" sub={`Moss ${n.version}`} onClose={cerrar} ancho={600}
      pie={<><span className="flex1" /><button type="button" className="btn primary" onClick={cerrar}>Seguir</button></>}>
      {(lista.length ? lista : n.novedades.slice(0, 1)).map((x) => (
        <article key={x.version} className="novedad">
          <header><span className="tag">{x.version}</span><span className="muted small">{x.fecha}</span></header>
          <h3>{x.titulo}</h3>
          {x.resumen ? <p className="muted">{x.resumen}</p> : null}
          <div className="prose small" dangerouslySetInnerHTML={{ __html: md(x.cuerpo) }} />
        </article>
      ))}
    </Hoja>
  );
}

export function Actualizacion({ onReload }) {
  const d = useData();
  const [a, setA] = useState(null);
  const [cambios, setCambios] = useState(null);
  const [hoja, setHoja] = useState(null); // "actualizar" | "publicar" | "novedades"
  const [desde, setDesde] = useState(null);
  const [comprobando, setComprobando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [x, y] = await Promise.all([fetch("/api/actualizacion").then((r) => r.json()), fetch("/api/publicar").then((r) => r.json())]);
      setA(x); setCambios(y);
    } catch {}
  }, []);
  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 30000);
    const on = () => document.visibilityState === "visible" && cargar();
    document.addEventListener("visibilitychange", on);
    const recargar = () => location.reload();
    const offs = [eventos.on("panel:publicar", cargar), eventos.on("repo:cambio", cargar), eventos.on("panel:actualizado", recargar)];
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", on); offs.forEach((f) => f()); };
  }, [cargar]);

  // Novedades al abrir tras una actualización (o la primera vez), como Pond.
  useEffect(() => {
    if (!a || !d.ajustes.actualizaciones.novedades) return;
    const vista = leerVista();
    if (!vista || cmp(a.versionLocal, vista) > 0) { setDesde(vista); setHoja("novedades"); }
  }, [a && a.versionLocal]);
  useEffect(() => {
    const abrir = () => { setDesde(null); setHoja("novedades"); };
    const pub = () => setHoja("publicar");
    window.addEventListener("panel:novedades", abrir);
    window.addEventListener("panel:publicar", pub);
    return () => { window.removeEventListener("panel:novedades", abrir); window.removeEventListener("panel:publicar", pub); };
  }, []);

  const comprobar = async () => { setComprobando(true); try { setA(await post("/api/actualizacion/comprobar")); } catch {} finally { setComprobando(false); } };
  if (!a) return null;
  const act = cambios && cambios.actual;
  const publicando = act && ["en-curso", "esperando"].includes(act.estado);
  const total = cambios && cambios.cambios ? cambios.cambios.total : 0;

  return (
    <>
      <div className="updatebox" data-component="actualizacion">
        <div className="updatehead">
          <button type="button" className="appver small" onClick={() => { setDesde(null); setHoja("novedades"); }} title="Ver novedades">Moss <span className="mono">{a.versionLocal}</span></button>
          {a.rama !== "main" ? <span className="ramachip mono small" title={`Rama ${a.rama}`}><GitBranch size={11} aria-hidden="true" />{a.rama}</span> : null}
          <button type="button" className="iconbtn tiny" onClick={comprobar} disabled={comprobando} aria-label="Buscar actualizaciones">
            <RefreshCw size={13} aria-hidden="true" className={comprobando ? "spin" : ""} />
          </button>
        </div>
        {a.disponible ? (
          <button type="button" className="updatecta" onClick={() => setHoja("actualizar")}>
            <CloudDownload size={14} aria-hidden="true" />
            <span className="stack0"><strong className="small">Actualización disponible</strong><span className="small muted">{a.versionRemota && a.versionRemota !== a.versionLocal ? `Versión ${a.versionRemota}` : `${a.atras} cambio${a.atras === 1 ? "" : "s"}`}</span></span>
          </button>
        ) : <p className="small updateok"><CircleCheck size={13} aria-hidden="true" /> Al día{a.ultimoFetch ? ` · ${hace(a.ultimoFetch)}` : ""}</p>}
        {publicando ? (
          <button type="button" className="updatecta suave" onClick={() => setHoja("publicar")}>
            <LoaderCircle size={14} className="spin" aria-hidden="true" />
            <span className="stack0"><strong className="small">{act.estado === "esperando" ? "Fusión en espera" : "Publicando…"}</strong><span className="small muted">{(act.pasos.find((p) => p.estado === "en-curso") || {}).nombre || ""}</span></span>
          </button>
        ) : total ? (
          <button type="button" className="btn small" onClick={() => setHoja("publicar")}><UploadCloud size={14} aria-hidden="true" /><span>Publicar cambios ({total})</span></button>
        ) : act && act.estado === "bloqueada" && act.pr ? (
          <a className="btn small ghost" href={act.pr.url} target="_blank" rel="noreferrer"><GitPullRequest size={14} aria-hidden="true" /><span>PR #{act.pr.numero} por revisar</span></a>
        ) : null}
      </div>
      {hoja === "actualizar" ? <HojaActualizar a={a} onClose={() => setHoja(null)} onReload={onReload} /> : null}
      {hoja === "publicar" ? <Publicar onClose={() => { setHoja(null); cargar(); }} /> : null}
      {hoja === "novedades" ? <Novedades desde={desde} onClose={() => setHoja(null)} /> : null}
    </>
  );
}
