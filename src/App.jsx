import { useCallback, useEffect, useRef, useState } from "react";
import { Agentation } from "agentation";
import {
  LayoutDashboard, CalendarDays, PenLine, LayoutTemplate, GalleryHorizontal, Share2, Palette, Film, BookOpen, ShieldAlert, MessageSquareText,
  Sparkles, Images, History, LoaderCircle, Layers, Settings,
  Spline, Sprout,
} from "lucide-react";
import { DataContext, useOverview } from "./lib/data.js";
import { useRoute, hrefOf, RouteContext } from "./lib/route.js";
import { EncargosContext, useEncargosPoll } from "./lib/api.js";
import { PostDetail } from "./components/PostDetail.jsx";
import { Composer } from "./components/Composer.jsx";
import { Actualizacion } from "./components/Actualizacion.jsx";
import Encargos from "./views/Encargos.jsx";
import Referencias from "./views/Referencias.jsx";
import Lienzos from "./views/Lienzos.jsx";
import { configurar as configurarSonidos, escucharClics } from "./lib/sonidos.js";
import * as eventos from "./lib/eventos.js";
import Registro from "./views/Registro.jsx";
import Kit from "./views/Kit.jsx";
import Ajustes from "./views/Ajustes.jsx";
import Overview from "./views/Overview.jsx";
import Calendar from "./views/Calendar.jsx";
import Posts from "./views/Posts.jsx";
import Templates from "./views/Templates.jsx";
import Carousels from "./views/Carousels.jsx";
import Ogs from "./views/Ogs.jsx";
import Brands from "./views/Brands.jsx";
import MediaView from "./views/MediaView.jsx";
import Library from "./views/Library.jsx";

const MCP = "http://localhost:4747";
const REGLAS = "AGENTS.md"; // marcador; nav() lo cambia por el archivo de reglas del cerebro

// Para añadir una vista: créala en views/ y añádela aquí. El menú y el router salen de esta lista.
const NAV = [
  { group: "Trabajo", items: [
    { path: "encargos", label: "Encargos", icon: Sparkles, view: Encargos, count: (_d, enc) => enc.lista.filter((e) => ["cola", "en-curso", "revisar", "error"].includes(e.estado)).length || null },
    { path: "referencias", label: "Referencias", icon: Images, view: Referencias, count: (d) => d.referencias.filter((r) => r.fuente === "propia").length || null },
    { path: "lienzos", label: "Lienzos", icon: Spline, view: Lienzos, count: (d) => (d.lienzos || []).length || null },
    { path: "registro", label: "Registro", icon: History, view: Registro, count: (d) => d.registro.length },
    { path: "kit", label: "Kit", icon: Layers, view: Kit, count: (d) => d.kit.presets.length + d.kit.firmas.length || null },
  ] },
  { group: "Contenido", items: [
    { path: "", label: "Resumen", icon: LayoutDashboard, view: Overview },
    { path: "calendario", label: "Calendario", icon: CalendarDays, view: Calendar },
    { path: "posts", label: "Posts", icon: PenLine, view: Posts, count: (d) => d.posts.filter((p) => p.estado !== "descartado").length },
  ] },
  { group: "Plantillas", items: [
    { path: "plantillas", label: "Plantillas", icon: LayoutTemplate, view: Templates, count: (d) => d.plantillas.list.filter((t) => t.estado === "activa").length },
    { path: "carruseles", label: "Carruseles", icon: GalleryHorizontal, view: Carousels, count: (d) => d.carruseles.length },
    { path: "og", label: "OG animadas", icon: Share2, view: Ogs, count: (d) => d.ogs.length },
    { path: "marcas", label: "Marcas", icon: Palette, view: Brands, count: (d) => d.marcas.length },
    { path: "medios", label: "Medios", icon: Film, view: MediaView },
  ] },
  { group: "Conocimiento", items: [
    { path: "biblioteca", label: "Biblioteca", icon: BookOpen, view: Library, match: (r) => r.path === "biblioteca" && r.params.doc !== REGLAS },
    { path: "biblioteca", params: { doc: REGLAS }, label: "Reglas duras", icon: ShieldAlert, match: (r) => r.path === "biblioteca" && r.params.doc === REGLAS },
  ] },
  { group: "Panel", items: [
    { path: "ajustes", label: "Ajustes", icon: Settings, view: Ajustes },
  ] },
];
const VIEWS = Object.fromEntries(NAV.flatMap((g) => g.items).filter((i) => i.view).map((i) => [i.path, i.view]));

// Qué módulo del cerebro necesita cada vista (moss.config.json → rutas). Sin él, la vista no sale en el menú.
const MODULO = { registro: "registro", kit: "kit", plantillas: "plantillas", carruseles: "carruseles", og: "ogs", marcas: "marcas" };
function nav(data) {
  const mod = (data && data.cerebro && data.cerebro.modulos) || null;
  const reglas = (data && data.cerebro && data.cerebro.reglas) || "AGENTS.md";
  return NAV.map((g) => ({
    ...g,
    items: g.items
      .filter((it) => !mod || !MODULO[it.path] || mod[MODULO[it.path]])
      .map((it) => (it.params && it.params.doc === REGLAS ? { ...it, params: { doc: reglas }, match: (r) => r.path === "biblioteca" && r.params.doc === reglas } : it.path === "biblioteca" ? { ...it, match: (r) => r.path === "biblioteca" && r.params.doc !== reglas } : it)),
  })).filter((g) => g.items.length);
}

export default function App() {
  const route = useRoute();
  const { data, error, reload } = useOverview();
  const enc = useEncargosPoll(reload);
  const [endpoint, setEndpoint] = useState(undefined);
  const [saved, setSaved] = useState(null);
  const lastPath = useRef(route.path);

  useEffect(() => {
    if (lastPath.current !== route.path) { window.scrollTo(0, 0); document.querySelector(".main")?.scrollTo(0, 0); lastPath.current = route.path; }
  }, [route.path]);

  // Agentation (notas de diseño) solo en desarrollo. Agent Sync si su servidor MCP está levantado; si no, las notas se
  // guardan en <cerebro>/.moss/feedback/.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    fetch(`${MCP}/health`, { signal: AbortSignal.timeout(1200) }).then((r) => r.ok && setEndpoint(MCP)).catch(() => {});
  }, []);

  // Ajustes de interfaz: atributos en <html> para el CSS y, en la app de Mac, tema, desenfoque, icono y atajo nativos.
  const aj = data && data.ajustes;
  const ajKey = aj ? JSON.stringify(aj) : "";
  useEffect(() => {
    if (!aj) return;
    const h = document.documentElement;
    if (aj.tema === "sistema") delete h.dataset.tema; else h.dataset.tema = aj.tema;
    h.dataset.estilo = aj.estilo;
    h.dataset.tenir = aj.tenir ? "si" : "no";
    h.dataset.paneles = aj.panelesCristal ? "cristal" : "opacos";
    h.dataset.densidad = aj.densidad;
    h.dataset.animacion = aj.animacion;
    h.style.setProperty("--side-font", `${aj.textoLateral}px`);
    configurarSonidos(aj.sonidos);
    if (window.panelApp && window.panelApp.ajustes) window.panelApp.ajustes(aj);
  }, [ajKey]);
  useEffect(() => escucharClics(), []);

  // Las vistas que escriben en el repo (referencias, registro) piden releerlo con este evento.
  useEffect(() => {
    const on = () => reload();
    window.addEventListener("panel:reload", on);
    return () => window.removeEventListener("panel:reload", on);
  }, [reload]);

  // El servidor vigila el repo y avisa en cuanto cambia un archivo (Claude, git pull, otra herramienta): se relee solo.
  useEffect(() => {
    let t = null;
    const off = eventos.on("repo:cambio", () => { clearTimeout(t); t = setTimeout(reload, 250); });
    return () => { clearTimeout(t); off(); };
  }, [reload]);

  const save = useCallback(async (output) => {
    if (!output || !output.trim()) return;
    const r = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json", "x-panel": "1" }, body: JSON.stringify({ output, page: window.location.href }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "No se pudo guardar");
    setSaved(j.file);
    reload();
  }, [reload]);

  const View = VIEWS[route.path];
  const post = data && route.params.ver && route.path !== "encargos" ? data.posts.find((p) => p.id === route.params.ver) : null;
  const trabajando = enc.ocupado && enc.lista.find((e) => e.id === enc.ocupado);

  // Ventana de Ajustes de la app (⌘,): solo los ajustes, sin la barra lateral del panel.
  if (route.path === "ajustes" && route.params.ventana === "1") {
    return (
      <RouteContext.Provider value={route}>
        <DataContext.Provider value={data}>
          <EncargosContext.Provider value={enc}>
            {data ? <Ajustes /> : <p className="muted pad">Leyendo…</p>}
          </EncargosContext.Provider>
        </DataContext.Provider>
      </RouteContext.Provider>
    );
  }

  return (
    <RouteContext.Provider value={route}>
      <DataContext.Provider value={data}>
      <EncargosContext.Provider value={enc}>
        <div className="shell">
          <aside className="side">
            <a className="brand" href="#/">
              <span className="brandmark" aria-hidden="true"><Sprout size={15} /></span>
              <span>{(data && data.cerebro && data.cerebro.nombre) || "Moss"}</span>
            </a>
            <nav aria-label="Secciones" className="nav">
              {nav(data).map((g) => (
                <div key={g.group} className="navgroup">
                  <p className="navlabel">{g.group}</p>
                  {g.items.map((it) => {
                    const active = it.match ? it.match(route) : route.path === it.path;
                    return (
                      <a key={it.label} href={hrefOf(it.path, it.params)} className="navitem" aria-current={active ? "page" : undefined}
                        onClick={it.path === "ajustes" && window.panelApp && window.panelApp.abrirAjustes ? (e) => { e.preventDefault(); window.panelApp.abrirAjustes(); } : undefined}>
                        <it.icon size={16} aria-hidden="true" />
                        <span>{it.label}</span>
                        {data && it.count && it.count(data, enc) ? <span className="count">{it.count(data, enc)}</span> : null}
                      </a>
                    );
                  })}
                </div>
              ))}
            </nav>
            <div className="sidefoot">
              <button type="button" className="btn primary" onClick={() => route.set({ pedir: "general" })}>
                <Sparkles size={14} aria-hidden="true" /><span>Pedir un cambio</span>
              </button>
              {trabajando ? (
                <a className="working" href={hrefOf("encargos", { ver: trabajando.id })}>
                  <LoaderCircle size={14} className="spin" aria-hidden="true" />
                  <span><strong>Agente trabajando</strong><span className="muted">{trabajando.texto.slice(0, 60)}</span></span>
                </a>
              ) : null}
              {import.meta.env.DEV ? <div className="feedbackbox">
                <p className="small"><MessageSquareText size={14} aria-hidden="true" /> <strong>Feedback</strong></p>
                <p className="muted small">
                  Usa la barra de abajo a la derecha. {endpoint ? "Conectada al agente por MCP." : "Al copiar o enviar, la nota se guarda en .moss/feedback/."}
                </p>
                {data && data.feedback.length ? <p className="small">{data.feedback.length} nota{data.feedback.length === 1 ? "" : "s"} guardada{data.feedback.length === 1 ? "" : "s"}</p> : null}
                {saved ? <p className="small ok" role="status">Guardada en {saved.split("/").pop()}</p> : null}
              </div> : null}
              <Actualizacion onReload={reload} />
            </div>
          </aside>
          <main className={`main ${["biblioteca", "ajustes"].includes(route.path) || (route.path === "lienzos" && route.params.l) ? "flush" : ""}`}>
            {error ? <div className="banner" role="alert">No se pudo leer el repo ({error}). Comprueba que Moss sigue abierto (o <code>npm run dev</code>, en desarrollo).</div> : null}
            {!data ? (!error ? <p className="muted pad">Leyendo el repo…</p> : null)
              : View ? <View /> : <div className="pad"><p>Esa sección no existe.</p><a href="#/">Volver al resumen</a></div>}
          </main>
          {post ? <PostDetail post={post} onClose={() => route.set({ ver: null })} /> : null}
          {data && route.params.pedir ? <Composer key={route.params.pedir + (route.params.nota || "") + (route.params.preset || "")} /> : null}
          {import.meta.env.DEV ? <Agentation appName="Moss" useHashLocation endpoint={endpoint}
            identifyingAttributes={["data-post", "data-plantilla", "data-path", "data-component", "data-dia"]}
            onCopy={(o) => { save(o).catch(() => {}); }} onSubmit={(o) => save(o)} /> : null}
        </div>
      </EncargosContext.Provider>
      </DataContext.Provider>
    </RouteContext.Provider>
  );
}
