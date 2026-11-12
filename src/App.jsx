import { useCallback, useEffect, useRef, useState } from "react";
import { Agentation } from "agentation";
import {
  LayoutDashboard, CalendarDays, PenLine, LayoutTemplate, GalleryHorizontal, Share2, Palette, Film, BookOpen, ShieldAlert, MessageSquareText,
  Sparkles, Images, History, LoaderCircle, Layers, Settings,
  Spline,
} from "lucide-react";
import { DataContext, useOverview } from "./lib/data.js";
import { useRoute, hrefOf, RouteContext } from "./lib/route.js";
import { EncargosContext, useEncargosPoll } from "./lib/api.js";
import { I18nProvider, guardarIdioma, idiomaGuardado, resolverIdioma, setIdioma, t } from "./lib/i18n.js";
import { PostDetail } from "./components/PostDetail.jsx";
import { Composer } from "./components/Composer.jsx";
import { Actualizacion } from "./components/Actualizacion.jsx";
import { MenuCerebro } from "./components/MenuCerebro.jsx";
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
// group y label son claves de src/locales/*.js.
const NAV = [
  { group: "nav.grupo.trabajo", items: [
    { path: "encargos", label: "nav.encargos", icon: Sparkles, view: Encargos, count: (_d, enc) => enc.lista.filter((e) => ["cola", "en-curso", "revisar", "error"].includes(e.estado)).length || null },
    { path: "referencias", label: "nav.referencias", icon: Images, view: Referencias, count: (d) => d.referencias.filter((r) => r.fuente === "propia").length || null },
    { path: "lienzos", label: "nav.lienzos", icon: Spline, view: Lienzos, count: (d) => (d.lienzos || []).length || null },
    { path: "registro", label: "nav.registro", icon: History, view: Registro, count: (d) => d.registro.length },
    { path: "kit", label: "nav.kit", icon: Layers, view: Kit, count: (d) => d.kit.presets.length + d.kit.firmas.length || null },
  ] },
  { group: "nav.grupo.contenido", items: [
    { path: "", label: "nav.resumen", icon: LayoutDashboard, view: Overview },
    { path: "calendario", label: "nav.calendario", icon: CalendarDays, view: Calendar },
    { path: "posts", label: "nav.posts", icon: PenLine, view: Posts, count: (d) => d.posts.filter((p) => p.estado !== "descartado").length },
  ] },
  { group: "nav.grupo.plantillas", items: [
    { path: "plantillas", label: "nav.plantillas", icon: LayoutTemplate, view: Templates, count: (d) => d.plantillas.list.filter((t) => t.estado === "activa").length },
    { path: "carruseles", label: "nav.carruseles", icon: GalleryHorizontal, view: Carousels, count: (d) => d.carruseles.length },
    { path: "og", label: "nav.og", icon: Share2, view: Ogs, count: (d) => d.ogs.length },
    { path: "marcas", label: "nav.marcas", icon: Palette, view: Brands, count: (d) => d.marcas.length },
    { path: "medios", label: "nav.medios", icon: Film, view: MediaView },
  ] },
  { group: "nav.grupo.conocimiento", items: [
    { path: "biblioteca", label: "nav.biblioteca", icon: BookOpen, view: Library, match: (r) => r.path === "biblioteca" && r.params.doc !== REGLAS },
    { path: "biblioteca", params: { doc: REGLAS }, label: "nav.reglas", icon: ShieldAlert, match: (r) => r.path === "biblioteca" && r.params.doc === REGLAS },
  ] },
  { group: "nav.grupo.panel", items: [
    { path: "ajustes", label: "nav.ajustes", icon: Settings, view: Ajustes },
  ] },
];
const VIEWS = Object.fromEntries(NAV.flatMap((g) => g.items).filter((i) => i.view).map((i) => [i.path, i.view]));

// Qué módulo del cerebro necesita cada vista (glim.config.json → rutas). Sin él, la vista no sale en el menú.
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
  // Idioma de la interfaz: ajuste del panel → idioma del cerebro → navegador. Mientras carga, el último que se usó.
  const navegador = typeof navigator !== "undefined" ? navigator.languages || [navigator.language] : [];
  const idioma = data
    ? resolverIdioma(data.ajustes && data.ajustes.idioma, data.cerebro && data.cerebro.idioma, navegador)
    : idiomaGuardado() || resolverIdioma(null, null, navegador);
  // Se fija ya: los t() del JSX de este mismo componente se evalúan aquí, antes de que pinte I18nProvider.
  setIdioma(idioma);
  useEffect(() => { if (data) guardarIdioma(idioma); }, [data, idioma]);

  useEffect(() => {
    if (lastPath.current !== route.path) { window.scrollTo(0, 0); document.querySelector(".main")?.scrollTo(0, 0); lastPath.current = route.path; }
  }, [route.path]);

  // Agentation (notas de diseño) solo en desarrollo. Agent Sync si su servidor MCP está levantado; si no, las notas se
  // guardan en <cerebro>/.glim/feedback/.
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
    const luego = () => { clearTimeout(t); t = setTimeout(reload, 250); };
    const offs = [eventos.on("repo:cambio", luego), eventos.on("ajustes:cambio", luego)];
    return () => { clearTimeout(t); offs.forEach((f) => f()); };
  }, [reload]);

  const save = useCallback(async (output) => {
    if (!output || !output.trim()) return;
    const r = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json", "x-panel": "1" }, body: JSON.stringify({ output, page: window.location.href }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || t("app.noSeGuardo"));
    setSaved(j.file);
    reload();
  }, [reload]);

  const View = VIEWS[route.path];
  const post = data && route.params.ver && route.path !== "encargos" ? data.posts.find((p) => p.id === route.params.ver) : null;
  const trabajando = enc.ocupado && enc.lista.find((e) => e.id === enc.ocupado);

  // Ventana de Ajustes de la app (⌘,): solo los ajustes, sin la barra lateral del panel.
  if (route.path === "ajustes" && route.params.ventana === "1") {
    return (
      <I18nProvider idioma={idioma}>
      <RouteContext.Provider value={route}>
        <DataContext.Provider value={data}>
          <EncargosContext.Provider value={enc}>
            {data ? <Ajustes /> : <p className="muted pad">{t("app.leyendo")}</p>}
          </EncargosContext.Provider>
        </DataContext.Provider>
      </RouteContext.Provider>
      </I18nProvider>
    );
  }

  return (
    <I18nProvider idioma={idioma}>
    <RouteContext.Provider value={route}>
      <DataContext.Provider value={data}>
      <EncargosContext.Provider value={enc}>
        <div className="shell">
          <aside className="side">
            <MenuCerebro data={data} onPedir={() => route.set({ pedir: "general" })} />
            <nav aria-label={t("app.secciones")} className="nav">
              {nav(data).map((g) => (
                <div key={g.group} className="navgroup">
                  <p className="navlabel">{t(g.group)}</p>
                  {g.items.map((it) => {
                    const active = it.match ? it.match(route) : route.path === it.path;
                    return (
                      <a key={it.label} href={hrefOf(it.path, it.params)} className="navitem" aria-current={active ? "page" : undefined}
                        onClick={it.path === "ajustes" && window.panelApp && window.panelApp.abrirAjustes ? (e) => { e.preventDefault(); window.panelApp.abrirAjustes(); } : undefined}>
                        <it.icon size={16} aria-hidden="true" />
                        <span>{t(it.label)}</span>
                        {data && it.count && it.count(data, enc) ? <span className="count">{it.count(data, enc)}</span> : null}
                      </a>
                    );
                  })}
                </div>
              ))}
            </nav>
            <div className="sidefoot">
              <button type="button" className="btn primary" onClick={() => route.set({ pedir: "general" })}>
                <Sparkles size={14} aria-hidden="true" /><span>{t("app.pedirCambio")}</span>
              </button>
              {trabajando ? (
                <a className="working" href={hrefOf("encargos", { ver: trabajando.id })}>
                  <LoaderCircle size={14} className="spin" aria-hidden="true" />
                  <span><strong>{t("app.agenteTrabajando")}</strong><span className="muted">{trabajando.texto.slice(0, 60)}</span></span>
                </a>
              ) : null}
              {import.meta.env.DEV ? <div className="feedbackbox">
                <p className="small"><MessageSquareText size={14} aria-hidden="true" /> <strong>{t("app.feedback")}</strong></p>
                <p className="muted small">
                  {t("app.feedbackUsa")} {endpoint ? t("app.feedbackMcp") : t("app.feedbackLocal")}
                </p>
                {data && data.feedback.length ? <p className="small">{t("app.notasGuardadas", { n: data.feedback.length })}</p> : null}
                {saved ? <p className="small ok" role="status">{t("app.guardadaEn", { archivo: saved.split("/").pop() })}</p> : null}
              </div> : null}
              {data ? <Actualizacion onReload={reload} /> : null}
            </div>
          </aside>
          <main className={`main ${["biblioteca", "ajustes"].includes(route.path) || (route.path === "lienzos" && route.params.l) ? "flush" : ""}`}>
            {error ? <div className="banner" role="alert">{t("app.errorRepo", { error })}<code>npm run dev</code>{t("app.errorRepoFin")}</div> : null}
            {!data ? (!error ? <p className="muted pad">{t("app.leyendoRepo")}</p> : null)
              : View ? <View /> : <div className="pad"><p>{t("app.noExiste")}</p><a href="#/">{t("app.volverResumen")}</a></div>}
          </main>
          {post ? <PostDetail post={post} onClose={() => route.set({ ver: null })} /> : null}
          {data && route.params.pedir ? <Composer key={route.params.pedir + (route.params.nota || "") + (route.params.preset || "")} /> : null}
          {import.meta.env.DEV ? <Agentation appName="Glim" useHashLocation endpoint={endpoint}
            identifyingAttributes={["data-post", "data-plantilla", "data-path", "data-component", "data-dia"]}
            onCopy={(o) => { save(o).catch(() => {}); }} onSubmit={(o) => save(o)} /> : null}
        </div>
      </EncargosContext.Provider>
      </DataContext.Provider>
    </RouteContext.Provider>
    </I18nProvider>
  );
}
