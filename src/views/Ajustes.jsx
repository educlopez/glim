// Ajustes con la forma de los de Rex y macOS: ventana propia (⌘, en la app), barra lateral con buscador y
// secciones, botones de atrás y adelante, y grupos con filas. Las claves de API van al Llavero; el navegador
// solo sabe si hay clave, nunca cuál.
import { createContext, useContext, useEffect, useState } from "react";
import {
  Monitor, Sun, Moon, KeyRound, Plug, Unplug, RefreshCw, CircleCheck, CircleAlert, Sparkles, Search, ChevronLeft, ChevronRight,
  LayoutPanelLeft, Bell, Command, Blocks, Server, FolderOpen, RotateCcw, Rows3, Rows4, Zap, Waves, Ban,
} from "lucide-react";
import { useData } from "../lib/data.js";
import { useRouteCtx } from "../lib/route.js";
import { post, hace } from "../lib/api.js";
import { GlimMark, Segmented, Switch } from "../components/ui.jsx";
import { sonar } from "../lib/sonidos.js";
import { Novedades, Publicar as PublicarHoja } from "../components/Actualizacion.jsx";
import { t, useI18n } from "../lib/i18n.js";

const recargar = () => window.dispatchEvent(new Event("panel:reload"));
const Busqueda = createContext("");

const SECCIONES = [
  { id: "interfaz", get label() { return t("ajustes.sec.interfaz"); }, icon: LayoutPanelLeft, color: "#5b5f66" },
  { id: "notificaciones", get label() { return t("ajustes.sec.notificaciones"); }, icon: Bell, color: "#ff453a" },
  { id: "atajos", get label() { return t("ajustes.sec.atajos"); }, icon: Command, color: "#6e7177" },
  { id: "encargos", get label() { return t("ajustes.sec.encargos"); }, icon: Sparkles, color: "#cf520d" },
  { id: "integraciones", get label() { return t("ajustes.sec.integraciones"); }, icon: Blocks, color: "#a855f7" },
  { id: "servidor", get label() { return t("ajustes.sec.servidor"); }, icon: Server, color: "#0a84ff" },
];

function Grupo({ titulo, sub, pie, children }) {
  return (
    <section className="ajgrupo" aria-label={titulo}>
      {titulo ? <div className="ajgrupohead"><h2>{titulo}</h2>{sub ? <p className="muted small">{sub}</p> : null}</div> : null}
      <div className="ajcaja">{children}</div>
      {pie ? <p className="ajpie muted small">{pie}</p> : null}
    </section>
  );
}

// Una fila se oculta sola si no casa con la búsqueda.
function Fila({ label, ayuda, children, ancho }) {
  const q = useContext(Busqueda);
  if (q && !`${label} ${ayuda || ""}`.toLowerCase().includes(q)) return null;
  return (
    <div className={`ajfila ${ancho ? "ancho" : ""}`}>
      <div className="ajlabel"><span>{label}</span>{ayuda ? <span className="muted small">{ayuda}</span> : null}</div>
      <div className="ajcontrol">{children}</div>
    </div>
  );
}

// Miniaturas de ventana para el esquema de color y el estilo (como las tarjetas de Rex).
function Miniatura({ esquema, estilo }) {
  return (
    <span className={`mini esq-${esquema} est-${estilo}`} aria-hidden="true">
      <span className="miniwin"><span className="minidots"><i /><i /><i /></span><span className="minicol" /><span className="minicard" /></span>
    </span>
  );
}

function Tarjetas({ value, onChange, opciones, label }) {
  return (
    <div className="tarjetas" role="radiogroup" aria-label={label}>
      {opciones.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} className="tarjeta" onClick={() => onChange(o.id)}>
          {o.vista}
          <span className="tarjetalabel">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function Clave({ servicio, hay, ayuda }) {
  const [v, setV] = useState("");
  const [msg, setMsg] = useState(null);
  const [cargando, setCargando] = useState(false);
  const accion = async (url, body, okMsg) => {
    setCargando(true); setMsg(null);
    try { const j = await post(url, body); setMsg(j.ok === false ? { error: j.error } : { ok: okMsg }); setV(""); recargar(); }
    catch (x) { setMsg({ error: x.message }); }
    finally { setCargando(false); }
  };
  return (
    <div className="stack">
      <div className="row wrap gap-s">
        <span className={`ajestado ${hay ? "on" : ""}`}>{hay ? <><CircleCheck size={13} aria-hidden="true" /> {t("ajustes.clave.enLlavero")}</> : <><CircleAlert size={13} aria-hidden="true" /> {t("ajustes.clave.sinClave")}</>}</span>
        {hay ? <button type="button" className="btn small" disabled={cargando} onClick={() => accion("/api/ajustes/probar", { servicio }, t("ajustes.clave.correcta"))}><Plug size={13} aria-hidden="true" /><span>{t("ajustes.clave.probar")}</span></button> : null}
        {hay ? <button type="button" className="btn ghost small" disabled={cargando} onClick={() => { if (window.confirm(t("ajustes.clave.confirmarQuitar", { servicio }))) accion("/api/ajustes/clave/borrar", { servicio }, t("ajustes.clave.quitada")); }}><Unplug size={13} aria-hidden="true" /><span>{t("ajustes.quitar")}</span></button> : null}
      </div>
      <form className="row gap-s" onSubmit={(e) => { e.preventDefault(); accion("/api/ajustes/clave", { servicio, clave: v }, t("ajustes.clave.guardada")); }}>
        <label className="field grow"><span className="sr">{t("ajustes.clave.nueva", { servicio })}</span>
          <input type="password" autoComplete="off" spellCheck={false} value={v} placeholder={hay ? t("ajustes.clave.pegarOtra") : t("ajustes.clave.pegar")} onChange={(e) => setV(e.target.value)} />
        </label>
        <button type="submit" className="btn small primary" disabled={!v.trim() || cargando}><KeyRound size={13} aria-hidden="true" /><span>{cargando ? t("ajustes.clave.probando") : t("comun.guardar")}</span></button>
      </form>
      {ayuda ? <p className="muted small">{ayuda}</p> : null}
      {msg ? <p className={`small ${msg.error ? "formerror" : "ok"}`} role="status">{msg.error || msg.ok}</p> : null}
    </div>
  );
}

// Graba un atajo: pulsa la combinación y se guarda en formato de Electron (Command+Shift+K).
function Grabador({ value, onChange }) {
  const [grabando, setGrabando] = useState(false);
  const bonito = (a) => (a || "").replace(/Command|CmdOrCtrl/g, "⌘").replace(/Shift/g, "⇧").replace(/Alt/g, "⌥").replace(/Control/g, "⌃").replace(/\+/g, "");
  useEffect(() => {
    if (!grabando) return;
    const on = (e) => {
      e.preventDefault(); e.stopPropagation();
      if (e.key === "Escape") { setGrabando(false); return; }
      if (["Meta", "Shift", "Alt", "Control"].includes(e.key)) return;
      const mods = [e.metaKey && "Command", e.ctrlKey && "Control", e.altKey && "Alt", e.shiftKey && "Shift"].filter(Boolean);
      if (!mods.length) return;
      const tecla = e.code.startsWith("Key") ? e.code.slice(3) : e.code.startsWith("Digit") ? e.code.slice(5) : e.key.length === 1 ? e.key.toUpperCase() : e.key;
      onChange([...mods, tecla].join("+"));
      setGrabando(false);
    };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, [grabando]);
  return (
    <div className="row gap-s">
      <button type="button" className={`atajo ${grabando ? "grabando" : ""}`} onClick={() => setGrabando(!grabando)}>{grabando ? t("ajustes.atajo.pulsa") : value ? bonito(value) : t("ajustes.atajo.grabar")}</button>
      {value ? <button type="button" className="btn ghost small" onClick={() => onChange("")}>{t("ajustes.quitar")}</button> : null}
    </div>
  );
}

const Tecla = ({ children }) => <span className="atajo fijo">{children}</span>;

function Interfaz({ a, cambiar }) {
  const d = useData();
  const { idioma } = useI18n();
  // Con «Automático», la ayuda dice qué idioma sale y de dónde (glim.config.json → idioma o el navegador).
  const delCerebro = d && d.cerebro && d.cerebro.idioma;
  return (
    <>
      <Grupo titulo={t("ajustes.idioma.titulo")}>
        <Fila label={t("ajustes.idioma.label")} ayuda={a.idioma === "auto" ? t("ajustes.idioma.ayudaAuto", { idioma: t(`ajustes.idioma.nombre.${idioma}`), cerebro: delCerebro || "es" }) : t("ajustes.idioma.ayuda")}>
          <Segmented label={t("ajustes.idioma.label")} value={a.idioma || "auto"} onChange={(v) => cambiar({ idioma: v })} options={[
            { id: "auto", label: t("ajustes.automatico") },
            { id: "es", label: "Español" },
            { id: "en", label: "English" },
          ]} />
        </Fila>
      </Grupo>
      <Grupo titulo={t("ajustes.apariencia")} pie={t("ajustes.aparienciaPie")}>
        <Fila label={t("ajustes.esquema")} ayuda={t("ajustes.esquemaAyuda")} ancho>
          <Tarjetas label={t("ajustes.esquema")} value={a.tema} onChange={(v) => cambiar({ tema: v })} opciones={[
            { id: "sistema", label: t("ajustes.automatico"), vista: <Miniatura esquema="auto" estilo={a.estilo} /> },
            { id: "claro", label: t("ajustes.claro"), vista: <Miniatura esquema="claro" estilo={a.estilo} /> },
            { id: "oscuro", label: t("ajustes.oscuro"), vista: <Miniatura esquema="oscuro" estilo={a.estilo} /> },
          ]} />
        </Fila>
        <Fila label={t("ajustes.estiloInterfaz")} ancho>
          <Tarjetas label={t("plantillas.estilo")} value={a.estilo} onChange={(v) => cambiar({ estilo: v })} opciones={[
            { id: "clasico", label: t("ajustes.clasico"), vista: <Miniatura esquema="auto" estilo="clasico" /> },
            { id: "cristal", label: t("ajustes.cristal"), vista: <Miniatura esquema="auto" estilo="cristal" /> },
          ]} />
        </Fila>
        <Fila label={t("ajustes.tenir")} ayuda={t("ajustes.tenirAyuda")}><Switch checked={a.tenir} onChange={(v) => cambiar({ tenir: v })}><span className="sr">{t("ajustes.tenir")}</span></Switch></Fila>
        <Fila label={t("ajustes.panelesCristal")} ayuda={t("ajustes.panelesCristalAyuda")}><Switch checked={a.panelesCristal} onChange={(v) => cambiar({ panelesCristal: v })}><span className="sr">{t("ajustes.panelesCristalSr")}</span></Switch></Fila>
      </Grupo>
      <Grupo titulo={t("ajustes.ventana")}>
        <Fila label={t("ajustes.densidad")}>
          <Segmented label={t("ajustes.densidad")} value={a.densidad} onChange={(v) => cambiar({ densidad: v })} options={[{ id: "comoda", label: t("ajustes.comoda"), icon: Rows3 }, { id: "compacta", label: t("ajustes.compacta"), icon: Rows4 }]} />
        </Fila>
        <Fila label={t("ajustes.textoLateral")}>
          <span className="rango"><input type="range" min={0} max={3} step={1} value={[12, 13, 14, 15].indexOf(a.textoLateral)} onChange={(e) => cambiar({ textoLateral: [12, 13, 14, 15][Number(e.target.value)] })} aria-label={t("ajustes.textoLateral")} /><span className="muted small">{a.textoLateral} pt</span></span>
        </Fila>
      </Grupo>
      <Grupo titulo={t("ajustes.animacion")}>
        <Fila label={t("ajustes.estiloAnimacion")} ayuda={t("ajustes.estiloAnimacionAyuda")}>
          <Segmented label={t("ajustes.animacion")} value={a.animacion} onChange={(v) => cambiar({ animacion: v })} options={[{ id: "agil", label: t("ajustes.agil"), icon: Zap }, { id: "natural", label: t("ajustes.natural"), icon: Waves }, { id: "no", label: t("ajustes.desactivada"), icon: Ban }]} />
        </Fila>
      </Grupo>
      <Grupo titulo={t("ajustes.iconoApp")} sub={t("ajustes.iconoAppSub")}>
        <IconoApp a={a} cambiar={cambiar} />
        <Fila label={t("ajustes.iconoBarra")} ayuda={t("ajustes.iconoBarraAyuda")}><Switch checked={a.barraMenus} onChange={(v) => cambiar({ barraMenus: v })}><span className="sr">{t("ajustes.barraMenus")}</span></Switch></Fila>
        <Fila label={t("ajustes.mostrarAlAbrir")} ayuda={t("ajustes.mostrarAlAbrirAyuda")}><Switch checked={a.mostrarAlAbrir} onChange={(v) => cambiar({ mostrarAlAbrir: v })}><span className="sr">{t("ajustes.mostrarAlAbrirSr")}</span></Switch></Fila>
      </Grupo>
    </>
  );
}

const TINTAS = [
  ["naranja", "#ff7528"], ["mandarina", "#ff9f0a"], ["fresa", "#ff375f"], ["frambuesa", "#d6336c"],
  ["uva", "#bf5af2"], ["ciruela", "#7d4bd6"], ["arandano", "#3a75f0"], ["aqua", "#40b4e8"],
  ["teal", "#2fb5a8"], ["helecho", "#34c759"], ["musgo", "#7a9a3a"], ["moca", "#9a7350"], ["grafito", "#7c7c82"],
  ["noche", "#23263a"],
];
// Las etiquetas salen de src/locales/*.js (ajustes.tinta.<id>, ajustes.glifo.<id>).
const GLIFOS = ["destello", "musgo", "brote", "estrella", "ventana", "monograma", "avatar"];

// Editor del icono: vista previa grande, tintas y glifos. Una sola versión, igual en claro y en oscuro.
function IconoApp({ a, cambiar }) {
  const i = a.icono;
  const [vista, setVista] = useState(null);
  const [glifosVista, setGlifosVista] = useState({});
  const [aplicando, setAplicando] = useState(false);
  useEffect(() => {
    let vivo = true;
    post("/api/icono/vista", { tinta: i.tinta, glifo: i.glifo }).then((j) => vivo && setVista(j.ruta)).catch(() => {});
    for (const g of GLIFOS) post("/api/icono/vista", { tinta: i.tinta, glifo: g }).then((j) => vivo && setGlifosVista((v) => ({ ...v, [g]: j.ruta }))).catch(() => {});
    return () => { vivo = false; };
  }, [i.tinta, i.glifo]);
  const set = async (patch) => { setAplicando(true); try { await cambiar({ icono: patch }); } finally { setAplicando(false); } };
  const src = (r) => (r ? `/repo/${r}?v=${encodeURIComponent(r)}` : null);
  return (
    <>
      <div className="iconoeditor">
        <div className="iconovistas" aria-live="polite">
          <figure className="iconovista unica">
            {vista ? <img src={src(vista)} alt={t("ajustes.iconoVista")} width="128" height="128" /> : <span className="iconovacio" />}
          </figure>
        </div>
        <div className="stack">
          <div className="tintas" role="radiogroup" aria-label={t("ajustes.tinta")}>
            {TINTAS.map(([id, hex]) => [id, t(`ajustes.tinta.${id}`), hex]).map(([id, label, hex]) => (
              <button key={id} type="button" role="radio" aria-checked={i.tinta === id} title={label} className="tinta" style={{ "--c": hex }} onClick={() => set({ tinta: id })}>
                <span className="sr">{label}</span>
              </button>
            ))}
          </div>
          <div className="glifos" role="radiogroup" aria-label={t("ajustes.glifo")}>
            {GLIFOS.map((id) => [id, t(`ajustes.glifo.${id}`)]).map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={i.glifo === id} className="glifo" onClick={() => set({ glifo: id })}>
                {glifosVista[id] ? <img src={src(glifosVista[id])} alt="" width="44" height="44" /> : <span className="iconovacio mini" />}
                <span className="small">{label}</span>
              </button>
            ))}
          </div>
          <p className="muted small">{aplicando ? t("ajustes.aplicando") : t("ajustes.iconoAyuda")}</p>
        </div>
      </div>
    </>
  );
}

function Notificaciones({ a, cambiar }) {
  const n = a.notif;
  const set = (patch) => cambiar({ notif: patch });
  return (
    <>
      <Grupo titulo={t("ajustes.sonidosInterfaz")} sub={t("ajustes.sonidosInterfazSub")}>
        <Fila label={t("ajustes.sonidos")}><Switch checked={a.sonidos.activo} onChange={(v) => cambiar({ sonidos: { activo: v } })}><span className="sr">{t("ajustes.sonidos")}</span></Switch></Fila>
        <Fila label={t("ajustes.clics")} ayuda={t("ajustes.clicsAyuda")}><Switch checked={a.sonidos.interfaz} onChange={(v) => cambiar({ sonidos: { interfaz: v } })}><span className="sr">{t("ajustes.clicsSr")}</span></Switch></Fila>
        <Fila label={t("ajustes.volumen")}>
          <span className="row gap-s">
            <Segmented label={t("ajustes.volumen")} value={a.sonidos.volumen} onChange={(v) => cambiar({ sonidos: { volumen: v } })} options={[30, 50, 70, 100].map((v) => ({ id: v, label: `${v} %` }))} />
            <span className="row gap-s">{["toque", "activar", "exito", "papelera"].map((x) => <button key={x} type="button" className="btn ghost small" data-sin-sonido onClick={() => sonar(x)}>{t(`ajustes.sonido.${x}`)}</button>)}</span>
          </span>
        </Fila>
      </Grupo>
      <Grupo titulo={t("ajustes.avisosSistema")} sub={t("ajustes.avisosSistemaSub")}>
        <Fila label={t("ajustes.mostrarNotif")}><Switch checked={n.sistema} onChange={(v) => set({ sistema: v })}><span className="sr">{t("ajustes.sec.notificaciones")}</span></Switch></Fila>
        <Fila label={t("ajustes.badge")} ayuda={t("ajustes.badgeAyuda")}><Switch checked={n.badge} onChange={(v) => set({ badge: v })}><span className="sr">Badge</span></Switch></Fila>
        <Fila label={t("ajustes.sonido")}>
          <span className="selectbox"><select value={n.sonido} onChange={(e) => set({ sonido: e.target.value })}>
            {["Glass", "Ping", "Pop", "Hero", "Submarine"].map((s) => <option key={s} value={s}>{s}</option>)}<option value="no">{t("ajustes.sinSonido")}</option>
          </select></span>
        </Fila>
      </Grupo>
      <Grupo titulo={t("ajustes.cuandoAvisar")}>
        <Fila label={t("ajustes.avisoTermina")}><Switch checked={n.terminado} onChange={(v) => set({ terminado: v })}><span className="sr">{t("ajustes.avisoTerminaSr")}</span></Switch></Fila>
        <Fila label={t("ajustes.avisoFalla")}><Switch checked={n.fallo} onChange={(v) => set({ fallo: v })}><span className="sr">{t("ajustes.avisoFallaSr")}</span></Switch></Fila>
        <Fila label={t("ajustes.avisoEmpieza")}><Switch checked={n.cola} onChange={(v) => set({ cola: v })}><span className="sr">{t("ajustes.avisoEmpiezaSr")}</span></Switch></Fila>
        <Fila label={t("ajustes.avisoPublica")} ayuda={t("ajustes.avisoPublicaAyuda")}><Switch checked={n.publicado} onChange={(v) => set({ publicado: v })}><span className="sr">{t("fecha.publicado")}</span></Switch></Fila>
      </Grupo>
    </>
  );
}

function Atajos({ a, cambiar }) {
  const q = useContext(Busqueda);
  const fijos = [
    [t("app.pedirCambio"), "⌘N"], [t("ajustes.atajo.ajustes"), "⌘,"], [t("ajustes.atajo.vistas"), "⌘1 … ⌘7"],
    [t("ajustes.atajo.lanzar"), "⌘↵"], [t("ajustes.atajo.cerrarPanel"), "Esc"], [t("ajustes.atajo.cerrarVentana"), "⌘W"], [t("ajustes.atajo.pantallaCompleta"), "⌃⌘F"],
  ].filter(([l]) => !q || l.toLowerCase().includes(q));
  return (
    <>
      <Grupo titulo={t("ajustes.global")} pie={t("ajustes.globalPie")}>
        <Fila label={t("ajustes.mostrarOcultar")}><Grabador value={a.atajoGlobal} onChange={(v) => cambiar({ atajoGlobal: v })} /></Fila>
      </Grupo>
      {fijos.length ? (
        <Grupo titulo={t("ajustes.enLaApp")}>
          {fijos.map(([l, k]) => <Fila key={l} label={l}><Tecla>{k}</Tecla></Fila>)}
        </Grupo>
      ) : null}
    </>
  );
}

// Agente que hace los encargos: cualquiera de los instalados (server/agentes.js) o un comando propio.
function Encargos({ a, cambiar }) {
  const [l, setL] = useState(null);
  const [buscando, setBuscando] = useState(false);
  useEffect(() => { fetch("/api/agentes").then((r) => r.json()).then((j) => setL(j.agentes)).catch(() => {}); }, []);
  const buscar = async () => { setBuscando(true); try { const j = await post("/api/agentes/buscar"); setL(j.agentes); } catch {} finally { setBuscando(false); } };
  const elegido = (l || []).find((x) => x.id === a.agente);
  return (
    <>
      <Grupo titulo={t("composer.agente")} sub={t("ajustes.agenteSub")}
        pie={elegido && elegido.permisos ? t("ajustes.permisosDe", { nombre: elegido.nombre, permisos: elegido.permisos }) : null}>
        <div className="agentes" role="radiogroup" aria-label={t("composer.agente")}>
          {(l || []).map((x) => (
            <button key={x.id} type="button" role="radio" aria-checked={a.agente === x.id} disabled={!x.instalado} className="agente" onClick={() => cambiar({ agente: x.id })}>
              <strong className="small">{x.nombre}{x.experimental ? <span className="tag">{t("ajustes.sinProbar")}</span> : null}</strong>
              <span className="muted small">{x.id === "propio" ? t("ajustes.propioAyuda") : x.instalado ? x.version || t("ajustes.instalado") : t("ajustes.noInstalado")}</span>
              {x.instalado && x.login ? <code className="small muted">{x.login}</code> : null}
            </button>
          ))}
        </div>
        <Fila label={t("ajustes.buscarAgentes")}><button type="button" className="btn small" onClick={buscar} disabled={buscando}><RefreshCw size={13} aria-hidden="true" className={buscando ? "spin" : ""} /><span>{t("ajustes.volverBuscar")}</span></button></Fila>
        {a.agente === "claude" ? (
          <Fila label={t("ajustes.modeloClaude")} ayuda={t("ajustes.modeloClaudeAyuda")}>
            <Segmented label={t("composer.modelo")} value={a.modelo} onChange={(v) => cambiar({ modelo: v })} options={[{ id: "", label: t("ajustes.elDeClaudeCode") }, { id: "sonnet", label: "Sonnet" }, { id: "opus", label: "Opus" }]} />
          </Fila>
        ) : a.agente === "propio" ? (
          <Fila label={t("ajustes.comando")} ayuda={t("ajustes.comandoAyuda")} ancho>
            <label className="field"><span className="sr">{t("ajustes.comando")}</span><input defaultValue={a.comandoPropio} placeholder="aider --yes-always --message {prompt}" onBlur={(e) => e.target.value !== a.comandoPropio && cambiar({ comandoPropio: e.target.value })} /></label>
          </Fila>
        ) : (
          <Fila label={t("ajustes.modeloDe", { nombre: elegido ? elegido.nombre : a.agente })} ayuda={t("ajustes.modeloDeAyuda")}>
            <label className="field"><span className="sr">{t("composer.modelo")}</span><input key={a.agente} defaultValue={(a.modelos || {})[a.agente] || ""} placeholder={{ codex: "gpt-5.5", cursor: "sonnet-4", opencode: "anthropic/claude-sonnet-4-5", gemini: "gemini-2.5-pro" }[a.agente] || ""} onBlur={(e) => cambiar({ modelos: { [a.agente]: e.target.value } })} /></label>
          </Fila>
        )}
        <Fila label={t("ajustes.copiaAislada")} ayuda={t("ajustes.copiaAisladaAyuda")}>
          <Switch checked={a.encargos.aislamiento === "copia"} onChange={(v) => cambiar({ encargos: { aislamiento: v ? "copia" : "repo" } })}><span className="sr">{t("ajustes.copiaAislada")}</span></Switch>
        </Fila>
        <Fila label={t("ajustes.aLaVez")} ayuda={a.encargos.aislamiento === "copia" ? t("ajustes.aLaVezCopia") : t("ajustes.aLaVezAyuda")}>
          {a.encargos.aislamiento === "copia"
            ? <Segmented label={t("ajustes.aLaVez")} value={a.encargos.paralelos} onChange={(v) => cambiar({ encargos: { paralelos: v } })} options={[1, 2, 3, 4].map((n) => ({ id: n, label: String(n) }))} />
            : <span className="muted small">1</span>}
        </Fila>
      </Grupo>
      <Grupo titulo={t("ajustes.redactarRevisar")}>
        <Fila label={t("composer.agente")} ayuda={t("ajustes.redactarAyuda")}>
          <Segmented label={t("ajustes.agentePublicar")} value={a.publicar.agente} onChange={(v) => cambiar({ publicar: { agente: v } })} options={[{ id: "claude", label: "Claude" }, { id: "codex", label: "Codex" }]} />
        </Fila>
      </Grupo>
    </>
  );
}

// Sesiones de los lectores (navegador interno de la app, separado de Chrome). Iniciar sesión abre una ventana del
// sitio y la haces tú: el panel nunca ve la contraseña; solo sabe si hay sesión.
function Lectores() {
  const [s, setS] = useState(null);
  const [err, setErr] = useState(null);
  const leer = () => fetch("/api/lectores").then((r) => r.json()).then(setS).catch(() => {});
  useEffect(() => { leer(); const i = setInterval(leer, 4000); return () => clearInterval(i); }, []);
  const accion = async (url) => { setErr(null); try { await post(url); leer(); } catch (x) { setErr(x.message); } };
  return (
    <Grupo titulo={t("ajustes.lectores")} sub={t("ajustes.lectoresSub")}
      pie={err || (s && !s.disponible ? t("ajustes.lectoresNavegador") : t("ajustes.lectoresApp"))}>
      {s ? Object.entries(s.sitios).map(([id, x]) => (
        <Fila key={id} label={x.nombre} ayuda={x.conectado ? t("ajustes.conSesion") : t("ajustes.sinSesionPublico")}>
          <span className="row gap-s">
            <span className={`ajestado ${x.conectado ? "on" : ""}`}>{x.conectado ? t("ajustes.conectado") : t("ajustes.sinSesion")}</span>
            {x.conectado
              ? <button type="button" className="btn small ghost" onClick={() => accion(`/api/lectores/${id}/salir`)}><Unplug size={13} aria-hidden="true" /><span>{t("ajustes.cerrarSesion")}</span></button>
              : <button type="button" className="btn small" disabled={!s.disponible} onClick={() => accion(`/api/lectores/${id}/entrar`)}><Plug size={13} aria-hidden="true" /><span>{t("ajustes.iniciarSesion")}</span></button>}
          </span>
        </Fila>
      )) : <Fila label={t("comun.cargando")} />}
    </Grupo>
  );
}

function Integraciones({ a, cambiar, d }) {
  const b = d.buffer;
  return (
    <>
      <Lectores />
      <Grupo titulo="Buffer" sub={t("ajustes.bufferSub")}>
        <Fila label={t("ajustes.claveApi")} ancho><Clave servicio="buffer" hay={d.claves.buffer} ayuda={t("ajustes.bufferClaveAyuda")} /></Fila>
        <Fila label={t("postDetalle.estado")} ayuda={b.restantes != null ? t("ajustes.bufferRestantes", { n: b.restantes }) : null}>
          <span className={`ajestado ${b.conectado && !b.error ? "on" : ""}`}>{b.error ? b.error : b.conectado ? `${t("ajustes.conectadoCanales", { n: b.canales.length })}${b.sincronizado ? ` · ${hace(b.sincronizado)}` : ""}` : t("ajustes.sinConectar")}</span>
        </Fila>
        <Fila label={t("ajustes.sincronizarCada")}>
          <span className="selectbox"><select value={a.buffer.cadaMin} onChange={(e) => cambiar({ buffer: { cadaMin: Number(e.target.value) } })}>{[5, 10, 15, 30, 60].map((n) => <option key={n} value={n}>{t("ajustes.minutos", { n })}</option>)}</select></span>
        </Fila>
        <Fila label={t("ajustes.igualar")} ayuda={t("ajustes.igualarAyuda")}><Switch checked={a.buffer.autoPublicar} onChange={(v) => cambiar({ buffer: { autoPublicar: v } })}><span className="sr">{t("ajustes.autopublicar")}</span></Switch></Fila>
      </Grupo>
      <Grupo titulo={t("enlaces.titulo")} sub={t("ajustes.dubSub")}>
        <Fila label={t("ajustes.activarCortos")}><Switch checked={a.dub.activo} onChange={(v) => cambiar({ dub: { activo: v } })}><span className="sr">{t("ajustes.activar")}</span></Switch></Fila>
        <Fila label={t("ajustes.claveApi")} ancho><Clave servicio="dub" hay={d.claves.dub} ayuda={t("ajustes.dubClaveAyuda")} /></Fila>
        <Fila label={t("ajustes.porDefectoPost")} ayuda={t("ajustes.porDefectoPostAyuda")}><Switch checked={a.dub.porDefecto} onChange={(v) => cambiar({ dub: { porDefecto: v } })}><span className="sr">{t("composer.porDefecto")}</span></Switch></Fila>
        <Fila label={t("ajustes.dominio")} ayuda={t("ajustes.dominioAyuda")}>
          <label className="field"><span className="sr">{t("ajustes.dominio")}</span><input defaultValue={a.dub.dominio} placeholder="dub.sh" onBlur={(e) => e.target.value !== a.dub.dominio && cambiar({ dub: { dominio: e.target.value } })} /></label>
        </Fila>
        <Fila label={t("ajustes.utm")} ayuda={t("ajustes.utmAyuda")}><Switch checked={a.dub.utm} onChange={(v) => cambiar({ dub: { utm: v } })}><span className="sr">UTM</span></Switch></Fila>
      </Grupo>
    </>
  );
}

function Servidor({ d, a, cambiar }) {
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState(null);
  const [novedades, setNovedades] = useState(false);
  const [publicar, setPublicar] = useState(false);
  useEffect(() => { fetch("/api/sistema").then((r) => r.json()).then(setS).catch(() => {}); }, []);
  const accion = async (url, body, ok) => { setMsg(null); try { await post(url, body); setMsg(ok); } catch (x) { setMsg(x.message); } };
  return (
    <>
      <Grupo titulo={t("ajustes.actualizaciones")} sub={t("ajustes.actualizacionesSub")}>
        <Fila label={t("ajustes.buscarCada")}>
          <span className="selectbox"><select value={a.actualizaciones.cadaMin} onChange={(e) => cambiar({ actualizaciones: { cadaMin: Number(e.target.value) } })}>{[5, 15, 30, 60].map((n) => <option key={n} value={n}>{t("ajustes.minutos", { n })}</option>)}</select></span>
        </Fila>
        <Fila label={t("ajustes.instalarAuto")} ayuda={t("ajustes.instalarAutoAyuda")}><Switch checked={a.actualizaciones.automaticas} onChange={(v) => cambiar({ actualizaciones: { automaticas: v } })}><span className="sr">{t("ajustes.automaticas")}</span></Switch></Fila>
        <Fila label={t("ajustes.mostrarNovedades")}><Switch checked={a.actualizaciones.novedades} onChange={(v) => cambiar({ actualizaciones: { novedades: v } })}><span className="sr">{t("act.novedades")}</span></Switch></Fila>
        <Fila label={t("act.novedades")}><button type="button" className="btn small" onClick={() => setNovedades(true)}>{t("act.verNovedades")}</button></Fila>
      </Grupo>
      <Grupo titulo={t("act.publicarCambios")} sub={t("ajustes.publicarSub")}>
        <Fila label={t("ajustes.revisionIa")} ayuda={t("ajustes.revisionIaAyuda")}><Switch checked={a.publicar.revisar} onChange={(v) => cambiar({ publicar: { revisar: v } })}><span className="sr">{t("revision.titulo")}</span></Switch></Fila>
        <Fila label={t("ajustes.fusionarSola")}><Switch checked={a.publicar.fusionarSola} onChange={(v) => cambiar({ publicar: { fusionarSola: v } })}><span className="sr">{t("ajustes.fusionarSolaSr")}</span></Switch></Fila>
        <Fila label={t("ajustes.espera")} ayuda={t("ajustes.esperaAyuda")}>
          <Segmented label={t("ajustes.esperaCorto")} value={a.publicar.esperaMin} onChange={(v) => cambiar({ publicar: { esperaMin: v } })} options={[0, 2, 5, 10].map((v) => ({ id: v, label: v ? `${v} min` : t("resumen.nada") }))} />
        </Fila>
        <Fila label={t("ajustes.modeloRedactar")}>
          <Segmented label={t("composer.modelo")} value={a.publicar.modelo} onChange={(v) => cambiar({ publicar: { modelo: v } })} options={[{ id: "haiku", label: "Haiku" }, { id: "sonnet", label: "Sonnet" }, { id: "opus", label: "Opus" }]} />
        </Fila>
        <Fila label={t("ajustes.publicarAhora")}><button type="button" className="btn small" onClick={() => setPublicar(true)}>{t("ajustes.publicarCambiosPuntos")}</button></Fila>
      </Grupo>
      {novedades ? <Novedades onClose={() => setNovedades(false)} /> : null}
      {publicar ? <PublicarHoja onClose={() => setPublicar(false)} /> : null}
      <Grupo titulo={t("ajustes.servidorPanel")}>
        <Fila label={t("postDetalle.estado")} ayuda={s ? t("ajustes.enMarchaDesde", { cuando: hace(s.servidor.inicio), pid: s.servidor.pid, node: s.servidor.node }) : null}>
          <button type="button" className="btn small" onClick={() => accion("/api/sistema/reiniciar", {}, t("ajustes.reiniciandoServidor"))}><RotateCcw size={13} aria-hidden="true" /><span>{t("ajustes.reiniciar")}</span></button>
        </Fila>
        <Fila label={t("ajustes.rama")} ayuda={s ? t("ajustes.cambiosSinCommit", { n: s.cambiosLocales }) : null}><code className="small">{s ? s.rama : "…"}</code></Fila>
        <Fila label={t("ajustes.version")} ayuda={s && s.app ? `App ${s.app.enApp} · repo ${s.app.enRepo}` : t("ajustes.abiertoNavegador")}><span className="small">{s ? s.servidor.version : "…"}</span></Fila>
      </Grupo>
      <Grupo titulo={t("ajustes.carpetas")}>
        <Fila label="Repo" ayuda={d.raiz}><button type="button" className="btn small" onClick={() => accion("/api/sistema/abrir", { que: "repo" })}><FolderOpen size={13} aria-hidden="true" /><span>{t("ajustes.abrirFinder")}</span></button></Fila>
        <Fila label={t("ajustes.datosLocales")} ayuda={t("ajustes.datosLocalesAyuda")}><button type="button" className="btn small" onClick={() => accion("/api/sistema/abrir", { que: "datos" })}><FolderOpen size={13} aria-hidden="true" /><span>{t("ajustes.abrirFinder")}</span></button></Fila>
      </Grupo>
      <Grupo titulo={t("ajustes.restablecer")}>
        <Fila label={t("ajustes.volverDefecto")} ayuda={t("ajustes.volverDefectoAyuda")}>
          <button type="button" className="btn small" onClick={() => { if (window.confirm(t("ajustes.confirmarRestablecer"))) accion("/api/ajustes/restablecer", {}, t("ajustes.restablecidos")).then(recargar); }}>{t("ajustes.restablecer")}</button>
        </Fila>
      </Grupo>
      {msg ? <p className="small muted" role="status">{msg}</p> : null}
    </>
  );
}

export default function Ajustes() {
  const d = useData();
  const r = useRouteCtx();
  const a = d.ajustes;
  const [q, setQ] = useState("");
  const [err, setErr] = useState(null);
  const seccion = r.params.seccion || "interfaz";
  const ventana = r.params.ventana === "1";
  const cambiar = async (patch) => { setErr(null); try { await post("/api/ajustes", patch); recargar(); } catch (x) { setErr(x.message); } };
  const actual = SECCIONES.find((x) => x.id === seccion) || SECCIONES[0];
  const props = { a, cambiar, d };
  const cuerpo = (id) => ({ interfaz: <Interfaz {...props} />, notificaciones: <Notificaciones {...props} />, atajos: <Atajos {...props} />, encargos: <Encargos {...props} />, integraciones: <Integraciones {...props} />, servidor: <Servidor {...props} /> })[id];
  const buscando = q.trim().toLowerCase();

  return (
    <div className={`ajustesapp ${ventana ? "en-ventana" : ""}`} data-component="ajustes">
      <aside className="ajside">
        <label className="searchbox ajbuscar"><Search size={14} aria-hidden="true" /><span className="sr">{t("ajustes.buscar")}</span>
          <input type="search" value={q} placeholder={t("ajustes.buscar")} onChange={(e) => setQ(e.target.value)} />
        </label>
        <button type="button" className={`ajserver ${seccion === "servidor" && !buscando ? "sel" : ""}`} onClick={() => { setQ(""); r.set({ seccion: "servidor" }); }}>
          <span className="ajservericon" aria-hidden="true"><GlimMark size={18} /></span>
          <span><strong>{(d.cerebro && d.cerebro.nombre) || "Glim"}</strong><span className="muted small">{d.claves.buffer ? t("ajustes.enMarchaBuffer") : t("ajustes.enMarcha")}</span></span>
        </button>
        <nav className="ajnav" aria-label={t("ajustes.secciones")}>
          {SECCIONES.filter((x) => x.id !== "servidor").map((x) => (
            <button key={x.id} type="button" className="ajnavitem" aria-current={seccion === x.id && !buscando ? "page" : undefined} onClick={() => { setQ(""); r.set({ seccion: x.id }); }}>
              <span className="ajnavicon" style={{ background: x.color }}><x.icon size={13} aria-hidden="true" /></span>{x.label}
            </button>
          ))}
        </nav>
      </aside>
      <section className="ajmain">
        <header className="ajhead">
          <span className="ajnavbtns">
            <button type="button" className="iconbtn" onClick={() => window.history.back()} aria-label={t("ajustes.atras")}><ChevronLeft size={16} aria-hidden="true" /></button>
            <button type="button" className="iconbtn" onClick={() => window.history.forward()} aria-label={t("ajustes.adelante")}><ChevronRight size={16} aria-hidden="true" /></button>
          </span>
          <h1>{buscando ? t("ajustes.resultados", { q: q.trim() }) : actual.label}</h1>
        </header>
        <div className="ajbody">
          {err ? <p className="formerror">{err}</p> : null}
          <Busqueda.Provider value={buscando}>
            {buscando ? SECCIONES.map((x) => <div key={x.id} className="ajresultado" data-seccion={x.label}>{cuerpo(x.id)}</div>) : cuerpo(actual.id)}
          </Busqueda.Provider>
        </div>
      </section>
    </div>
  );
}
