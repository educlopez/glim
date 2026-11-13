// Segunda parte de la bienvenida (la primera, elegir el cerebro, es electron/bienvenida.html y va antes de que haya
// servidor). Misma ventana y mismos estilos (electron/bienvenida.css): herramientas, agente, integraciones y listo.
// Al terminar, Electron agranda esta ventana y la convierte en la de la app. Se puede volver a ver desde Ajustes.
import { useEffect, useState } from "react";
import { ArrowLeft, Check, ExternalLink, Plug, RefreshCw, Terminal } from "lucide-react";
import "../../electron/bienvenida.css";
import { useData } from "../lib/data.js";
import { useRouteCtx } from "../lib/route.js";
import { post } from "../lib/api.js";
import { CopyButton, Segmented } from "../components/ui.jsx";
import { Clave } from "./Ajustes.jsx";
import { marcarNovedadesVistas } from "../components/Actualizacion.jsx";
import { t } from "../lib/i18n.js";

const PASOS = ["cerebro", "herramientas", "agente", "integraciones", "listo"];
const leer = (url) => fetch(url).then((r) => r.json());
// Programadores que vendrán después de Buffer: solo se anuncian, todavía no hay nada que conectar.
const PRONTO = [{ id: "zernio", nombre: "Zernio" }, { id: "postiz", nombre: "Postiz" }, { id: "typefully", nombre: "Typefully" }];

function Rail({ actual }) {
  const i = PASOS.indexOf(actual);
  return (
    <ol className="onb-rail" aria-label={t("bienvenida.progreso")}>
      {PASOS.map((p, n) => (
        <li key={p} data-estado={n < i ? "hecho" : undefined} aria-current={n === i ? "step" : undefined}>
          <span className="punto" aria-hidden="true" />
          <span>{t(`bienvenida.paso.${p}`)}</span>
        </li>
      ))}
    </ol>
  );
}

function Marco({ paso, titulo, sub, children, atras, derecha, centro = false }) {
  return (
    <div className="onb en-app">
      <header className="onb-top"><Rail actual={paso} /></header>
      <main className="onb-cuerpo">
        <section className={`onb-paso ${centro ? "centro" : ""}`} key={paso}>
          {titulo ? <h1 className="onb-titulo">{titulo}</h1> : null}
          {sub ? <p className="onb-sub">{sub}</p> : null}
          {children}
        </section>
      </main>
      <footer className="onb-pie">
        {atras ? <button type="button" className="onb-btn texto" onClick={atras}><ArrowLeft aria-hidden="true" /><span>{t("bienvenida.atras")}</span></button> : <span />}
        <div className="derecha">{derecha}</div>
      </footer>
    </div>
  );
}

const Estado = ({ ok, children }) => <span className={`onb-estado ${ok ? "ok" : "falta"}`}>{children}</span>;

function Orden({ comando }) {
  return (
    <span className="orden">
      <Terminal size={13} aria-hidden="true" className="muted" />
      <code>{comando}</code>
      <CopyButton text={comando} label={t("bienvenida.copiar")} />
    </span>
  );
}

// ---- Herramientas ----
function Herramientas({ ir }) {
  const [s, setS] = useState(null);
  const [buscando, setBuscando] = useState(false);
  useEffect(() => { leer("/api/sistema/herramientas").then(setS).catch(() => {}); }, []);
  const comprobar = async () => { setBuscando(true); try { setS(await post("/api/sistema/herramientas")); } catch { /* sigue lo de antes */ } finally { setBuscando(false); } };
  const lista = s ? s.herramientas : [];
  const pendientes = lista.filter((h) => !h.opcional && (!h.instalado || (h.sesion && !h.sesion.ok)));
  const faltaBrew = s && !s.brew && lista.some((h) => !h.instalado && h.instalar.startsWith("brew "));
  return (
    <Marco paso="herramientas" titulo={t("bienvenida.herr.titulo")} sub={t("bienvenida.herr.sub")}
      derecha={<>
        <button type="button" className="onb-btn texto" onClick={comprobar} disabled={buscando}><RefreshCw aria-hidden="true" className={buscando ? "spin" : ""} /><span>{t("bienvenida.comprobar")}</span></button>
        <button type="button" className="onb-btn primario" onClick={() => ir("agente")} disabled={!s}>{pendientes.length ? t("bienvenida.continuarIgual") : t("bienvenida.continuar")}</button>
      </>}>
      {!s ? <p className="onb-nota" role="status"><span className="onb-cargando" aria-hidden="true" /> {t("bienvenida.herr.mirando")}</p> : (
        <ul className="onb-lista">
          {lista.map((h) => {
            const sinSesion = h.instalado && h.sesion && !h.sesion.ok;
            return (
              <li key={h.id} className="onb-fila">
                <span style={{ minWidth: 0 }}>
                  <strong>{h.nombre}</strong>{h.opcional ? <span className="muted small"> · {t("bienvenida.opcional")}</span> : null}
                  <span className="detalle">{t(`bienvenida.para.${h.id}`)}</span>
                  {!h.instalado ? <Orden comando={h.instalar} /> : sinSesion ? <Orden comando={h.sesion.comando} /> : null}
                </span>
                <span className="acciones">
                  {!h.instalado ? <Estado>{t("bienvenida.falta")}</Estado>
                    : sinSesion ? <Estado>{t("bienvenida.sinSesion")}</Estado>
                    : <Estado ok>{h.sesion && h.sesion.cuenta ? h.sesion.cuenta : h.version || t("bienvenida.listoCorto")}</Estado>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {faltaBrew ? <p className="onb-nota">{t("bienvenida.herr.brew")} <a href="https://brew.sh" target="_blank" rel="noreferrer">brew.sh <ExternalLink size={11} aria-hidden="true" /></a></p> : null}
      {s && pendientes.length ? <p className="onb-nota">{t("bienvenida.herr.pendientes")}</p> : null}
    </Marco>
  );
}

// ---- Agente ----
function Agente({ ir }) {
  const d = useData();
  const [l, setL] = useState(null);
  const [elegido, setElegido] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState(null);
  const cargar = (j) => { setL(j.agentes.filter((x) => x.id !== "propio")); setElegido(j.elegido); };
  useEffect(() => { leer("/api/agentes").then(cargar).catch(() => {}); }, []);
  const buscar = async () => { setBuscando(true); try { cargar(await post("/api/agentes/buscar")); } catch { /* nada */ } finally { setBuscando(false); } };
  const elegir = async (id) => { setError(null); setElegido(id); try { await post("/api/ajustes", { agente: id }); } catch (x) { setError(x.message); } };
  const modelo = async (v) => { try { await post("/api/ajustes", { modelo: v }); } catch (x) { setError(x.message); } };
  const actual = (l || []).find((x) => x.id === elegido);
  const ninguno = l && !l.some((x) => x.instalado);
  return (
    <Marco paso="agente" titulo={t("bienvenida.agente.titulo")} sub={t("bienvenida.agente.sub")} atras={() => ir("herramientas")}
      derecha={<>
        <button type="button" className="onb-btn texto" onClick={buscar} disabled={buscando}><RefreshCw aria-hidden="true" className={buscando ? "spin" : ""} /><span>{t("bienvenida.buscarOtraVez")}</span></button>
        <button type="button" className="onb-btn primario" onClick={() => ir("integraciones")}>{actual && actual.instalado ? t("bienvenida.continuar") : t("bienvenida.saltar")}</button>
      </>}>
      {!l ? <p className="onb-nota" role="status"><span className="onb-cargando" aria-hidden="true" /> {t("bienvenida.agente.buscando")}</p> : (
        <div className="onb-opciones" role="radiogroup" aria-label={t("composer.agente")}>
          {l.map((x) => (
            <button key={x.id} type="button" role="radio" className="onb-opcion" aria-checked={elegido === x.id} disabled={!x.instalado} onClick={() => elegir(x.id)}>
              <span className="onb-icono"><Terminal aria-hidden="true" /></span>
              <span>
                <strong>{x.nombre}{x.experimental ? <span className="muted small"> · {t("ajustes.sinProbar")}</span> : null}</strong>
                <span className="detalle">{x.instalado ? x.version || t("ajustes.instalado") : t("ajustes.noInstalado")}</span>
              </span>
              <span className="lado">{!x.instalado && x.web ? <a href={x.web} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{t("bienvenida.agente.instalar")} <ExternalLink size={11} aria-hidden="true" /></a> : null}</span>
            </button>
          ))}
        </div>
      )}
      {actual && actual.instalado && actual.id === "claude" ? (
        <div className="row gap-s" style={{ marginTop: 16, alignItems: "center", justifyContent: "space-between" }}>
          <span className="onb-etiqueta">{t("ajustes.modeloClaude")}</span>
          <Segmented label={t("composer.modelo")} value={(d.ajustes && d.ajustes.modelo) || ""} onChange={modelo} options={[{ id: "", label: t("ajustes.elDeClaudeCode") }, { id: "sonnet", label: "Sonnet" }, { id: "opus", label: "Opus" }]} />
        </div>
      ) : null}
      {actual && actual.instalado && actual.login ? <p className="onb-nota">{t("bienvenida.agente.login")} <Orden comando={actual.login} /></p> : null}
      {ninguno ? <p className="onb-nota">{t("bienvenida.agente.ninguno")}</p> : null}
      {error ? <p className="onb-error" role="alert">{error}</p> : null}
    </Marco>
  );
}

// ---- Integraciones ----
function Lectores() {
  const [s, setS] = useState(null);
  const [error, setError] = useState(null);
  const actualizar = () => leer("/api/lectores").then(setS).catch(() => {});
  useEffect(() => { actualizar(); const i = setInterval(actualizar, 4000); return () => clearInterval(i); }, []);
  const entrar = async (id) => { setError(null); try { await post(`/api/lectores/${id}/entrar`); actualizar(); } catch (x) { setError(x.message); } };
  if (!s) return null;
  return (
    <>
      <ul className="onb-lista">
        {Object.entries(s.sitios).map(([id, x]) => (
          <li key={id} className="onb-fila">
            <span><strong>{x.nombre}</strong><span className="detalle">{x.conectado ? t("ajustes.conSesion") : t("ajustes.sinSesionPublico")}</span></span>
            <span className="acciones">
              {x.conectado ? <Estado ok>{t("ajustes.conectado")}</Estado>
                : <button type="button" className="onb-btn chico" disabled={!s.disponible} onClick={() => entrar(id)}><Plug aria-hidden="true" /><span>{t("ajustes.iniciarSesion")}</span></button>}
            </span>
          </li>
        ))}
      </ul>
      <p className="onb-nota">{error || (s.disponible ? t("ajustes.lectoresApp") : t("ajustes.lectoresNavegador"))}</p>
    </>
  );
}

function Integraciones({ ir }) {
  const d = useData();
  const b = d.buffer || {};
  return (
    <Marco paso="integraciones" titulo={t("bienvenida.integ.titulo")} sub={t("bienvenida.integ.sub")} atras={() => ir("agente")}
      derecha={<button type="button" className="onb-btn primario" onClick={() => ir("listo")}>{t("bienvenida.continuar")}</button>}>
      <h2 className="onb-etiqueta" style={{ margin: "0 0 8px" }}>Buffer</h2>
      <div className="onb-lista" style={{ padding: "14px 16px" }}>
        <p className="muted small" style={{ margin: "0 0 10px" }}>{t("ajustes.bufferSub")}</p>
        <Clave servicio="buffer" hay={d.claves && d.claves.buffer} ayuda={t("ajustes.bufferClaveAyuda")} />
        {b.conectado && !b.error ? <p className="small ok" style={{ margin: "8px 0 0" }}>{t("ajustes.conectadoCanales", { n: (b.canales || []).length })}</p> : null}
      </div>
      <h2 className="onb-etiqueta" style={{ margin: "22px 0 8px" }}>{t("ajustes.lectores")}</h2>
      <Lectores />
      <details style={{ marginTop: 18 }}>
        <summary className="onb-etiqueta">{t("bienvenida.integ.dub")}</summary>
        <div className="onb-lista" style={{ padding: "14px 16px", marginTop: 8 }}>
          <p className="muted small" style={{ margin: "0 0 10px" }}>{t("ajustes.dubSub")}</p>
          <Clave servicio="dub" hay={d.claves && d.claves.dub} ayuda={t("ajustes.dubClaveAyuda")} />
        </div>
      </details>
      <h2 className="onb-etiqueta" style={{ margin: "22px 0 8px" }}>{t("bienvenida.integ.pronto")}</h2>
      <ul className="onb-lista">
        {PRONTO.map((x) => (
          <li key={x.id} className="onb-fila">
            <span><strong>{x.nombre}</strong><span className="detalle">{t(`bienvenida.integ.pronto.${x.id}`)}</span></span>
            <span className="acciones"><span className="onb-estado">{t("bienvenida.integ.prontoEstado")}</span></span>
          </li>
        ))}
      </ul>
    </Marco>
  );
}

// ---- Listo ----
function Listo({ ir }) {
  const d = useData();
  const r = useRouteCtx();
  const [s, setS] = useState({});
  const [abriendo, setAbriendo] = useState(false);
  useEffect(() => {
    Promise.all([leer("/api/sistema/herramientas").catch(() => null), leer("/api/agentes").catch(() => null), leer("/api/lectores").catch(() => null)])
      .then(([herr, ag, lec]) => setS({ herr, ag, lec }));
  }, []);
  const terminar = async () => {
    setAbriendo(true);
    await marcarNovedadesVistas();
    const res = window.panelApp && window.panelApp.terminarBienvenida ? await window.panelApp.terminarBienvenida().catch(() => null) : null;
    if (!res || !res.transformada) r.go("");
  };
  const herr = s.herr ? s.herr.herramientas.filter((h) => !h.opcional) : null;
  const herrOk = herr ? herr.filter((h) => h.instalado && (!h.sesion || h.sesion.ok)).length : 0;
  const agente = s.ag ? s.ag.agentes.find((x) => x.id === s.ag.elegido && x.instalado) : null;
  const lectores = s.lec ? Object.values(s.lec.sitios).filter((x) => x.conectado).length : 0;
  const filas = [
    [true, t("bienvenida.listo.cerebro", { nombre: (d.cerebro && d.cerebro.nombre) || "" }), d.raiz ? d.raiz.replace(/^\/Users\/[^/]+/, "~") : ""],
    [herr && herrOk === herr.length, t("bienvenida.listo.herramientas", { ok: herrOk, total: herr ? herr.length : 0 }), null],
    [!!agente, agente ? t("bienvenida.listo.agente", { nombre: agente.nombre }) : t("bienvenida.listo.sinAgente"), null],
    [!!(d.claves && d.claves.buffer), d.claves && d.claves.buffer ? t("bienvenida.listo.buffer") : t("bienvenida.listo.sinBuffer"), null],
    [lectores > 0, t("bienvenida.listo.lectores", { n: lectores }), null],
  ];
  return (
    <Marco paso="listo" centro titulo={t("bienvenida.listo.titulo")} sub={t("bienvenida.listo.sub")} atras={() => ir("integraciones")}
      derecha={<button type="button" className="onb-btn primario" autoFocus onClick={terminar} disabled={abriendo}>{abriendo ? <span className="onb-cargando" aria-label={t("bienvenida.abriendo")} /> : t("bienvenida.listo.abrir")}</button>}>
      <ul className="onb-lista onb-hecho">
        {filas.map(([ok, texto, detalle], i) => (
          <li key={i} className="onb-fila">
            <span className={`onb-check ${ok ? "" : "no"}`} aria-hidden="true">{ok ? <Check strokeWidth={3} /> : null}</span>
            <span><strong>{texto}</strong>{detalle ? <span className="detalle">{detalle}</span> : null}</span>
          </li>
        ))}
      </ul>
      <p className="onb-nota">{t("bienvenida.listo.nota")}</p>
    </Marco>
  );
}

export default function Bienvenida() {
  const r = useRouteCtx();
  const paso = ["herramientas", "agente", "integraciones", "listo"].includes(r.params.paso) ? r.params.paso : "herramientas";
  const ir = (p) => r.set({ paso: p }, true);
  const Paso = { herramientas: Herramientas, agente: Agente, integraciones: Integraciones, listo: Listo }[paso];
  return <Paso ir={ir} />;
}
