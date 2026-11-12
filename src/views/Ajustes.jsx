// Ajustes con la forma de los de Rex y macOS: ventana propia (⌘, en la app), barra lateral con buscador y
// secciones, botones de atrás y adelante, y grupos con filas. Las claves de API van al Llavero; el navegador
// solo sabe si hay clave, nunca cuál.
import { createContext, useContext, useEffect, useState } from "react";
import {
  Monitor, Sun, Moon, KeyRound, Plug, Unplug, RefreshCw, CircleCheck, CircleAlert, Sparkles, Search, ChevronLeft, ChevronRight,
  LayoutPanelLeft, Bell, Command, Blocks, Server, FolderOpen, RotateCcw, Rows3, Rows4, Zap, Waves, Ban, Sprout,
} from "lucide-react";
import { useData } from "../lib/data.js";
import { useRouteCtx } from "../lib/route.js";
import { post, hace } from "../lib/api.js";
import { Segmented, Switch } from "../components/ui.jsx";
import { sonar } from "../lib/sonidos.js";
import { Novedades, Publicar as PublicarHoja } from "../components/Actualizacion.jsx";

const recargar = () => window.dispatchEvent(new Event("panel:reload"));
const Busqueda = createContext("");

const SECCIONES = [
  { id: "interfaz", label: "Interfaz", icon: LayoutPanelLeft, color: "#5b5f66" },
  { id: "notificaciones", label: "Notificaciones", icon: Bell, color: "#ff453a" },
  { id: "atajos", label: "Atajos", icon: Command, color: "#6e7177" },
  { id: "encargos", label: "Encargos y agentes", icon: Sparkles, color: "#cf520d" },
  { id: "integraciones", label: "Integraciones", icon: Blocks, color: "#a855f7" },
  { id: "servidor", label: "Servidor y app", icon: Server, color: "#0a84ff" },
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
        <span className={`ajestado ${hay ? "on" : ""}`}>{hay ? <><CircleCheck size={13} aria-hidden="true" /> Clave en el Llavero</> : <><CircleAlert size={13} aria-hidden="true" /> Sin clave</>}</span>
        {hay ? <button type="button" className="btn small" disabled={cargando} onClick={() => accion("/api/ajustes/probar", { servicio }, "Conexión correcta")}><Plug size={13} aria-hidden="true" /><span>Probar</span></button> : null}
        {hay ? <button type="button" className="btn ghost small" disabled={cargando} onClick={() => { if (window.confirm(`¿Quitar la clave de ${servicio} del Llavero? El panel dejará de conectarse hasta que pongas otra.`)) accion("/api/ajustes/clave/borrar", { servicio }, "Clave quitada"); }}><Unplug size={13} aria-hidden="true" /><span>Quitar</span></button> : null}
      </div>
      <form className="row gap-s" onSubmit={(e) => { e.preventDefault(); accion("/api/ajustes/clave", { servicio, clave: v }, "Clave guardada y probada"); }}>
        <label className="field grow"><span className="sr">Nueva clave de {servicio}</span>
          <input type="password" autoComplete="off" spellCheck={false} value={v} placeholder={hay ? "Pegar otra clave para cambiarla" : "Pegar la clave"} onChange={(e) => setV(e.target.value)} />
        </label>
        <button type="submit" className="btn small primary" disabled={!v.trim() || cargando}><KeyRound size={13} aria-hidden="true" /><span>{cargando ? "Probando…" : "Guardar"}</span></button>
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
      <button type="button" className={`atajo ${grabando ? "grabando" : ""}`} onClick={() => setGrabando(!grabando)}>{grabando ? "Pulsa la combinación…" : value ? bonito(value) : "Grabar atajo"}</button>
      {value ? <button type="button" className="btn ghost small" onClick={() => onChange("")}>Quitar</button> : null}
    </div>
  );
}

const Tecla = ({ children }) => <span className="atajo fijo">{children}</span>;

function Interfaz({ a, cambiar }) {
  return (
    <>
      <Grupo titulo="Apariencia" pie="Con Cristal, la ventana entera deja ver el escritorio desenfocado, como Rex. En el navegador se ve como Clásico.">
        <Fila label="Esquema de color" ayuda="Automático sigue el modo claro u oscuro de macOS." ancho>
          <Tarjetas label="Esquema de color" value={a.tema} onChange={(v) => cambiar({ tema: v })} opciones={[
            { id: "sistema", label: "Automático", vista: <Miniatura esquema="auto" estilo={a.estilo} /> },
            { id: "claro", label: "Claro", vista: <Miniatura esquema="claro" estilo={a.estilo} /> },
            { id: "oscuro", label: "Oscuro", vista: <Miniatura esquema="oscuro" estilo={a.estilo} /> },
          ]} />
        </Fila>
        <Fila label="Estilo de la interfaz" ancho>
          <Tarjetas label="Estilo" value={a.estilo} onChange={(v) => cambiar({ estilo: v })} opciones={[
            { id: "clasico", label: "Clásico", vista: <Miniatura esquema="auto" estilo="clasico" /> },
            { id: "cristal", label: "Cristal", vista: <Miniatura esquema="auto" estilo="cristal" /> },
          ]} />
        </Fila>
        <Fila label="Teñir con el tema" ayuda="Un velo del color del tema sobre el desenfoque."><Switch checked={a.tenir} onChange={(v) => cambiar({ tenir: v })}><span className="sr">Teñir con el tema</span></Switch></Fila>
        <Fila label="Cristal también en tarjetas y paneles" ayuda="Las tarjetas dejan pasar el fondo. Se lee algo peor sobre fondos muy cargados."><Switch checked={a.panelesCristal} onChange={(v) => cambiar({ panelesCristal: v })}><span className="sr">Cristal en paneles</span></Switch></Fila>
      </Grupo>
      <Grupo titulo="Ventana">
        <Fila label="Densidad">
          <Segmented label="Densidad" value={a.densidad} onChange={(v) => cambiar({ densidad: v })} options={[{ id: "comoda", label: "Cómoda", icon: Rows3 }, { id: "compacta", label: "Compacta", icon: Rows4 }]} />
        </Fila>
        <Fila label="Tamaño del texto de la barra lateral">
          <span className="rango"><input type="range" min={0} max={3} step={1} value={[12, 13, 14, 15].indexOf(a.textoLateral)} onChange={(e) => cambiar({ textoLateral: [12, 13, 14, 15][Number(e.target.value)] })} aria-label="Tamaño del texto de la barra lateral" /><span className="muted small">{a.textoLateral} pt</span></span>
        </Fila>
      </Grupo>
      <Grupo titulo="Animación">
        <Fila label="Estilo de animación" ayuda="Desactivada también respeta «Reducir movimiento» de macOS.">
          <Segmented label="Animación" value={a.animacion} onChange={(v) => cambiar({ animacion: v })} options={[{ id: "agil", label: "Ágil", icon: Zap }, { id: "natural", label: "Natural", icon: Waves }, { id: "no", label: "Desactivada", icon: Ban }]} />
        </Fila>
      </Grupo>
      <Grupo titulo="Icono de la app" sub="Sigue la plantilla de iconos de macOS: forma de esquinas continuas, luz desde arriba y glifo de cristal. Cambia el Dock, la barra de menús y el icono de la app en el Finder.">
        <IconoApp a={a} cambiar={cambiar} />
        <Fila label="Icono en la barra de menús" ayuda="Con el estado de los encargos y lo que espera revisión."><Switch checked={a.barraMenus} onChange={(v) => cambiar({ barraMenus: v })}><span className="sr">Barra de menús</span></Switch></Fila>
        <Fila label="Mostrar la ventana al abrir" ayuda="Si lo apagas, la app arranca solo en el Dock y la barra de menús."><Switch checked={a.mostrarAlAbrir} onChange={(v) => cambiar({ mostrarAlAbrir: v })}><span className="sr">Mostrar al abrir</span></Switch></Fila>
      </Grupo>
    </>
  );
}

const TINTAS = [
  ["naranja", "Naranja", "#ff7528"], ["mandarina", "Mandarina", "#ff9f0a"], ["fresa", "Fresa", "#ff375f"], ["frambuesa", "Frambuesa", "#d6336c"],
  ["uva", "Uva", "#bf5af2"], ["ciruela", "Ciruela", "#7d4bd6"], ["arandano", "Arándano", "#3a75f0"], ["aqua", "Aqua", "#40b4e8"],
  ["teal", "Teal", "#2fb5a8"], ["helecho", "Helecho", "#34c759"], ["musgo", "Musgo", "#7a9a3a"], ["moca", "Moca", "#9a7350"], ["grafito", "Grafito", "#7c7c82"],
];
const GLIFOS = [["brote", "Brote"], ["estrella", "Destello"], ["ventana", "Ventana"], ["monograma", "Monograma"], ["avatar", "Tu foto"]];

// Editor del icono: vista previa grande en claro y oscuro, tintas, glifos y apariencia.
function IconoApp({ a, cambiar }) {
  const i = a.icono;
  const [vistas, setVistas] = useState({});
  const [glifosVista, setGlifosVista] = useState({});
  const [aplicando, setAplicando] = useState(false);
  useEffect(() => {
    let vivo = true;
    for (const ap of ["claro", "oscuro"]) post("/api/icono/vista", { tinta: i.tinta, glifo: i.glifo, apariencia: ap }).then((j) => vivo && setVistas((v) => ({ ...v, [ap]: j.ruta }))).catch(() => {});
    for (const [g] of GLIFOS) post("/api/icono/vista", { tinta: i.tinta, glifo: g, apariencia: "claro" }).then((j) => vivo && setGlifosVista((v) => ({ ...v, [g]: j.ruta }))).catch(() => {});
    return () => { vivo = false; };
  }, [i.tinta, i.glifo]);
  const set = async (patch) => { setAplicando(true); try { await cambiar({ icono: patch }); } finally { setAplicando(false); } };
  const src = (r) => (r ? `/repo/${r}?v=${encodeURIComponent(r)}` : null);
  return (
    <>
      <div className="iconoeditor">
        <div className="iconovistas" aria-live="polite">
          {["claro", "oscuro"].map((ap) => (
            <figure key={ap} className={`iconovista ${ap}`}>
              {vistas[ap] ? <img src={src(vistas[ap])} alt={`Icono en ${ap}`} width="112" height="112" /> : <span className="iconovacio" />}
              <figcaption className="small muted">{ap === "claro" ? "Claro" : "Oscuro"}</figcaption>
            </figure>
          ))}
        </div>
        <div className="stack">
          <div className="tintas" role="radiogroup" aria-label="Tinta">
            {TINTAS.map(([id, label, hex]) => (
              <button key={id} type="button" role="radio" aria-checked={i.tinta === id} title={label} className="tinta" style={{ "--c": hex }} onClick={() => set({ tinta: id })}>
                <span className="sr">{label}</span>
              </button>
            ))}
          </div>
          <div className="glifos" role="radiogroup" aria-label="Glifo">
            {GLIFOS.map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={i.glifo === id} className="glifo" onClick={() => set({ glifo: id })}>
                {glifosVista[id] ? <img src={src(glifosVista[id])} alt="" width="44" height="44" /> : <span className="iconovacio mini" />}
                <span className="small">{label}</span>
              </button>
            ))}
          </div>
          <Segmented label="Apariencia" value={i.apariencia} onChange={(v) => set({ apariencia: v })}
            options={[{ id: "auto", label: "Automática", icon: Monitor }, { id: "claro", label: "Clara", icon: Sun }, { id: "oscuro", label: "Oscura", icon: Moon }]} />
          <p className="muted small">{aplicando ? "Aplicando…" : "Automática cambia el icono del Dock con el modo claro u oscuro del sistema. El Finder usa siempre la versión clara."}</p>
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
      <Grupo titulo="Sonidos de la interfaz" sub="Clics y confirmaciones sintetizados en el momento, sin archivos. Suenan al pulsar, al guardar y al quitar.">
        <Fila label="Sonidos"><Switch checked={a.sonidos.activo} onChange={(v) => cambiar({ sonidos: { activo: v } })}><span className="sr">Sonidos</span></Switch></Fila>
        <Fila label="Clics de botones e interruptores" ayuda="Si lo apagas, solo suenan las confirmaciones (guardar, quitar)."><Switch checked={a.sonidos.interfaz} onChange={(v) => cambiar({ sonidos: { interfaz: v } })}><span className="sr">Clics</span></Switch></Fila>
        <Fila label="Volumen">
          <span className="row gap-s">
            <Segmented label="Volumen" value={a.sonidos.volumen} onChange={(v) => cambiar({ sonidos: { volumen: v } })} options={[30, 50, 70, 100].map((v) => ({ id: v, label: `${v} %` }))} />
            <span className="row gap-s">{["toque", "activar", "exito", "papelera"].map((x) => <button key={x} type="button" className="btn ghost small" data-sin-sonido onClick={() => sonar(x)}>{{ toque: "Clic", activar: "Activar", exito: "Éxito", papelera: "Quitar" }[x]}</button>)}</span>
          </span>
        </Fila>
      </Grupo>
      <Grupo titulo="Avisos del sistema" sub="Funcionan en la app de Mac, aunque la ventana esté cerrada.">
        <Fila label="Mostrar notificaciones del sistema"><Switch checked={n.sistema} onChange={(v) => set({ sistema: v })}><span className="sr">Notificaciones</span></Switch></Fila>
        <Fila label="Número en el icono del Dock" ayuda="Encargos que esperan revisión."><Switch checked={n.badge} onChange={(v) => set({ badge: v })}><span className="sr">Badge</span></Switch></Fila>
        <Fila label="Sonido">
          <span className="selectbox"><select value={n.sonido} onChange={(e) => set({ sonido: e.target.value })}>
            {["Glass", "Ping", "Pop", "Hero", "Submarine"].map((s) => <option key={s} value={s}>{s}</option>)}<option value="no">Sin sonido</option>
          </select></span>
        </Fila>
      </Grupo>
      <Grupo titulo="Cuándo avisar">
        <Fila label="Un encargo termina"><Switch checked={n.terminado} onChange={(v) => set({ terminado: v })}><span className="sr">Terminado</span></Switch></Fila>
        <Fila label="Un encargo falla"><Switch checked={n.fallo} onChange={(v) => set({ fallo: v })}><span className="sr">Falla</span></Switch></Fila>
        <Fila label="Empieza un encargo de la cola"><Switch checked={n.cola} onChange={(v) => set({ cola: v })}><span className="sr">Empieza</span></Switch></Fila>
        <Fila label="Buffer publica un post" ayuda="Cuando el panel lo marca como publicado."><Switch checked={n.publicado} onChange={(v) => set({ publicado: v })}><span className="sr">Publicado</span></Switch></Fila>
      </Grupo>
    </>
  );
}

function Atajos({ a, cambiar }) {
  const q = useContext(Busqueda);
  const fijos = [
    ["Pedir un cambio", "⌘N"], ["Ajustes…", "⌘,"], ["Resumen · Encargos · Calendario · Posts · Plantillas · Referencias · Registro", "⌘1 … ⌘7"],
    ["Lanzar desde un formulario", "⌘↵"], ["Cerrar panel o formulario", "Esc"], ["Cerrar ventana", "⌘W"], ["Pantalla completa", "⌃⌘F"],
  ].filter(([l]) => !q || l.toLowerCase().includes(q));
  return (
    <>
      <Grupo titulo="Global" pie="Funciona desde cualquier app: muestra el panel, o lo oculta si ya está delante.">
        <Fila label="Mostrar u ocultar el panel"><Grabador value={a.atajoGlobal} onChange={(v) => cambiar({ atajoGlobal: v })} /></Fila>
      </Grupo>
      {fijos.length ? (
        <Grupo titulo="En la app">
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
      <Grupo titulo="Agente" sub="Quién hace los encargos en local. Edita el repo y renderiza; nunca publica, programa ni toca Buffer o Drive, y el panel avisa si hace commits."
        pie={elegido && elegido.permisos ? `Permisos de ${elegido.nombre}: ${elegido.permisos}` : null}>
        <div className="agentes" role="radiogroup" aria-label="Agente">
          {(l || []).map((x) => (
            <button key={x.id} type="button" role="radio" aria-checked={a.agente === x.id} disabled={!x.instalado} className="agente" onClick={() => cambiar({ agente: x.id })}>
              <strong className="small">{x.nombre}{x.experimental ? <span className="tag">sin probar</span> : null}</strong>
              <span className="muted small">{x.id === "propio" ? "Aider, Amp o el que quieras" : x.instalado ? x.version || "Instalado" : "No instalado"}</span>
              {x.instalado && x.login ? <code className="small muted">{x.login}</code> : null}
            </button>
          ))}
        </div>
        <Fila label="Buscar agentes instalados"><button type="button" className="btn small" onClick={buscar} disabled={buscando}><RefreshCw size={13} aria-hidden="true" className={buscando ? "spin" : ""} /><span>Volver a buscar</span></button></Fila>
        {a.agente === "claude" ? (
          <Fila label="Modelo de Claude" ayuda="Se puede cambiar en cada encargo.">
            <Segmented label="Modelo" value={a.modelo} onChange={(v) => cambiar({ modelo: v })} options={[{ id: "", label: "El de Claude Code" }, { id: "sonnet", label: "Sonnet" }, { id: "opus", label: "Opus" }]} />
          </Fila>
        ) : a.agente === "propio" ? (
          <Fila label="Comando" ayuda="{prompt} se cambia por el encargo; sin {prompt}, se le pasa por la entrada estándar." ancho>
            <label className="field"><span className="sr">Comando</span><input defaultValue={a.comandoPropio} placeholder="aider --yes-always --message {prompt}" onBlur={(e) => e.target.value !== a.comandoPropio && cambiar({ comandoPropio: e.target.value })} /></label>
          </Fila>
        ) : (
          <Fila label={`Modelo de ${elegido ? elegido.nombre : a.agente}`} ayuda="Vacío: el que tenga configurado su CLI.">
            <label className="field"><span className="sr">Modelo</span><input key={a.agente} defaultValue={(a.modelos || {})[a.agente] || ""} placeholder={{ codex: "gpt-5.5", cursor: "sonnet-4", opencode: "anthropic/claude-sonnet-4-5", gemini: "gemini-2.5-pro" }[a.agente] || ""} onBlur={(e) => cambiar({ modelos: { [a.agente]: e.target.value } })} /></label>
          </Fila>
        )}
        <Fila label="Encargos a la vez" ayuda="Uno, para que dos agentes no editen los mismos archivos."><span className="muted small">1</span></Fila>
      </Grupo>
      <Grupo titulo="Redactar y revisar al publicar">
        <Fila label="Agente" ayuda="Escribe el commit y las novedades y revisa la PR, sin herramientas.">
          <Segmented label="Agente al publicar" value={a.publicar.agente} onChange={(v) => cambiar({ publicar: { agente: v } })} options={[{ id: "claude", label: "Claude" }, { id: "codex", label: "Codex" }]} />
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
    <Grupo titulo="Lectores de plataformas" sub="Traen el vídeo o las imágenes originales, el texto y el autor de un enlace que pegas en Referencias. Solo enlaces que pegas tú, uno a uno y con pausas: nada de sincronizar cuentas."
      pie={err || (s && !s.disponible ? "Las sesiones solo funcionan desde la app de Mac. En el navegador, los lectores usan yt-dlp sin sesión." : "Las sesiones viven en el navegador interno de la app, separado de tu Chrome. Algunos sitios prohíben la descarga automática en sus condiciones: úsalo para tus referencias internas.")}>
      {s ? Object.entries(s.sitios).map(([id, x]) => (
        <Fila key={id} label={x.nombre} ayuda={x.conectado ? "Con sesión" : "Sin sesión: lee lo público"}>
          <span className="row gap-s">
            <span className={`ajestado ${x.conectado ? "on" : ""}`}>{x.conectado ? "Conectado" : "Sin sesión"}</span>
            {x.conectado
              ? <button type="button" className="btn small ghost" onClick={() => accion(`/api/lectores/${id}/salir`)}><Unplug size={13} aria-hidden="true" /><span>Cerrar sesión</span></button>
              : <button type="button" className="btn small" disabled={!s.disponible} onClick={() => accion(`/api/lectores/${id}/entrar`)}><Plug size={13} aria-hidden="true" /><span>Iniciar sesión</span></button>}
          </span>
        </Fila>
      )) : <Fila label="Cargando…" />}
    </Grupo>
  );
}

function Integraciones({ a, cambiar, d }) {
  const b = d.buffer;
  return (
    <>
      <Lectores />
      <Grupo titulo="Buffer" sub="Solo lectura: el panel nunca crea, edita ni programa en Buffer.">
        <Fila label="Clave de la API" ancho><Clave servicio="buffer" hay={d.claves.buffer} ayuda="Se crea en publish.buffer.com/settings/api con «New Key»." /></Fila>
        <Fila label="Estado" ayuda={b.restantes != null ? `${b.restantes} peticiones disponibles hoy (compartidas con el MCP).` : null}>
          <span className={`ajestado ${b.conectado && !b.error ? "on" : ""}`}>{b.error ? b.error : b.conectado ? `Conectado · ${b.canales.length} canales${b.sincronizado ? ` · ${hace(b.sincronizado)}` : ""}` : "Sin conectar"}</span>
        </Fila>
        <Fila label="Sincronizar cada">
          <span className="selectbox"><select value={a.buffer.cadaMin} onChange={(e) => cambiar({ buffer: { cadaMin: Number(e.target.value) } })}>{[5, 10, 15, 30, 60].map((n) => <option key={n} value={n}>{n} minutos</option>)}</select></span>
        </Fila>
        <Fila label="Igualar el repo con Buffer" ayuda="Tras cada sincronización: estados, fechas, URLs e importación de lo que esté en Buffer sin borrador. Buffer manda."><Switch checked={a.buffer.autoPublicar} onChange={(v) => cambiar({ buffer: { autoPublicar: v } })}><span className="sr">Autopublicar</span></Switch></Fila>
      </Grupo>
      <Grupo titulo="Enlaces cortos (Dub)" sub="Un enlace por red con UTM: clics por post y por red. Los clics totales no piden plan de pago; la analítica detallada de Dub, sí.">
        <Fila label="Activar enlaces cortos"><Switch checked={a.dub.activo} onChange={(v) => cambiar({ dub: { activo: v } })}><span className="sr">Activar</span></Switch></Fila>
        <Fila label="Clave de la API" ancho><Clave servicio="dub" hay={d.claves.dub} ayuda="Se crea en app.dub.co, Settings → API Keys, con permiso de enlaces." /></Fila>
        <Fila label="Activados por defecto en cada post" ayuda="Cada post se cambia en su panel, en «Publicación»."><Switch checked={a.dub.porDefecto} onChange={(v) => cambiar({ dub: { porDefecto: v } })}><span className="sr">Por defecto</span></Switch></Fila>
        <Fila label="Dominio" ayuda="Vacío: el principal de tu cuenta de Dub, o dub.sh. Uno propio (go.tudominio.com) se lee mejor.">
          <label className="field"><span className="sr">Dominio</span><input defaultValue={a.dub.dominio} placeholder="dub.sh" onBlur={(e) => e.target.value !== a.dub.dominio && cambiar({ dub: { dominio: e.target.value } })} /></label>
        </Fila>
        <Fila label="Añadir UTM por red" ayuda="utm_source=x|threads|linkedin · utm_medium=social · utm_campaign=el post."><Switch checked={a.dub.utm} onChange={(v) => cambiar({ dub: { utm: v } })}><span className="sr">UTM</span></Switch></Fila>
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
      <Grupo titulo="Actualizaciones" sub="La app sigue la rama main de GitHub, como una app de Mac sigue su canal de versiones.">
        <Fila label="Buscar actualizaciones cada">
          <span className="selectbox"><select value={a.actualizaciones.cadaMin} onChange={(e) => cambiar({ actualizaciones: { cadaMin: Number(e.target.value) } })}>{[5, 15, 30, 60].map((n) => <option key={n} value={n}>{n} minutos</option>)}</select></span>
        </Fila>
        <Fila label="Instalar actualizaciones automáticamente" ayuda="Solo si no hay cambios sin subir, ni un encargo ni una publicación en marcha. Si cambia el núcleo, la app se reinicia sola."><Switch checked={a.actualizaciones.automaticas} onChange={(v) => cambiar({ actualizaciones: { automaticas: v } })}><span className="sr">Automáticas</span></Switch></Fila>
        <Fila label="Mostrar las novedades al actualizar"><Switch checked={a.actualizaciones.novedades} onChange={(v) => cambiar({ actualizaciones: { novedades: v } })}><span className="sr">Novedades</span></Switch></Fila>
        <Fila label="Novedades"><button type="button" className="btn small" onClick={() => setNovedades(true)}>Ver novedades</button></Fila>
      </Grupo>
      <Grupo titulo="Publicar cambios" sub="Sube lo que hay en local: rama, PR a main, revisión y fusión. Cada pulsación del botón es tu OK para esa subida.">
        <Fila label="Revisión de la IA antes de fusionar" ayuda="Revisa el diff contra las reglas del cerebro y lo comenta en la PR. Si encuentra algo grave, la PR queda en borrador."><Switch checked={a.publicar.revisar} onChange={(v) => cambiar({ publicar: { revisar: v } })}><span className="sr">Revisión</span></Switch></Fila>
        <Fila label="Fusionar sola si todo pasa"><Switch checked={a.publicar.fusionarSola} onChange={(v) => cambiar({ publicar: { fusionarSola: v } })}><span className="sr">Fusionar sola</span></Switch></Fila>
        <Fila label="Espera antes de fusionar" ayuda="Margen para cancelar después de ver la PR.">
          <Segmented label="Espera" value={a.publicar.esperaMin} onChange={(v) => cambiar({ publicar: { esperaMin: v } })} options={[0, 2, 5, 10].map((v) => ({ id: v, label: v ? `${v} min` : "Nada" }))} />
        </Fila>
        <Fila label="Modelo para redactar y revisar">
          <Segmented label="Modelo" value={a.publicar.modelo} onChange={(v) => cambiar({ publicar: { modelo: v } })} options={[{ id: "haiku", label: "Haiku" }, { id: "sonnet", label: "Sonnet" }, { id: "opus", label: "Opus" }]} />
        </Fila>
        <Fila label="Publicar ahora"><button type="button" className="btn small" onClick={() => setPublicar(true)}>Publicar cambios…</button></Fila>
      </Grupo>
      {novedades ? <Novedades onClose={() => setNovedades(false)} /> : null}
      {publicar ? <PublicarHoja onClose={() => setPublicar(false)} /> : null}
      <Grupo titulo="Servidor del panel">
        <Fila label="Estado" ayuda={s ? `En marcha desde ${hace(s.servidor.inicio)} · proceso ${s.servidor.pid} · Node ${s.servidor.node}` : null}>
          <button type="button" className="btn small" onClick={() => accion("/api/sistema/reiniciar", {}, "Reiniciando el servidor…")}><RotateCcw size={13} aria-hidden="true" /><span>Reiniciar</span></button>
        </Fila>
        <Fila label="Rama" ayuda={s ? `${s.cambiosLocales} archivos con cambios sin commit` : null}><code className="small">{s ? s.rama : "…"}</code></Fila>
        <Fila label="Versión" ayuda={s && s.app ? `App ${s.app.enApp} · repo ${s.app.enRepo}` : "Abierto en el navegador"}><span className="small">{s ? s.servidor.version : "…"}</span></Fila>
      </Grupo>
      <Grupo titulo="Carpetas">
        <Fila label="Repo" ayuda={d.raiz}><button type="button" className="btn small" onClick={() => accion("/api/sistema/abrir", { que: "repo" })}><FolderOpen size={13} aria-hidden="true" /><span>Abrir en el Finder</span></button></Fila>
        <Fila label="Datos locales" ayuda="Encargos, revisiones, ajustes y cachés de Buffer y Dub. No se suben a git."><button type="button" className="btn small" onClick={() => accion("/api/sistema/abrir", { que: "datos" })}><FolderOpen size={13} aria-hidden="true" /><span>Abrir en el Finder</span></button></Fila>
      </Grupo>
      <Grupo titulo="Restablecer">
        <Fila label="Volver a los ajustes por defecto" ayuda="Interfaz, notificaciones, atajos y encargos. No toca Buffer, Dub ni las claves.">
          <button type="button" className="btn small" onClick={() => { if (window.confirm("¿Volver a los ajustes por defecto? Buffer, Dub y las claves se quedan como están.")) accion("/api/ajustes/restablecer", {}, "Ajustes restablecidos").then(recargar); }}>Restablecer</button>
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
        <label className="searchbox ajbuscar"><Search size={14} aria-hidden="true" /><span className="sr">Buscar en ajustes</span>
          <input type="search" value={q} placeholder="Buscar en ajustes" onChange={(e) => setQ(e.target.value)} />
        </label>
        <button type="button" className={`ajserver ${seccion === "servidor" && !buscando ? "sel" : ""}`} onClick={() => { setQ(""); r.set({ seccion: "servidor" }); }}>
          <span className="ajservericon" aria-hidden="true"><Sprout size={18} /></span>
          <span><strong>{(d.cerebro && d.cerebro.nombre) || "Moss"}</strong><span className="muted small">{d.claves.buffer ? "En marcha · Buffer conectado" : "En marcha"}</span></span>
        </button>
        <nav className="ajnav" aria-label="Secciones de ajustes">
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
            <button type="button" className="iconbtn" onClick={() => window.history.back()} aria-label="Atrás"><ChevronLeft size={16} aria-hidden="true" /></button>
            <button type="button" className="iconbtn" onClick={() => window.history.forward()} aria-label="Adelante"><ChevronRight size={16} aria-hidden="true" /></button>
          </span>
          <h1>{buscando ? `Resultados para «${q.trim()}»` : actual.label}</h1>
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
