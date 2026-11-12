// Primera fila de la barra lateral: el cerebro abierto, con su menú (como el de Pond). Icono de la app, nombre del
// cerebro y un botón «+» para pedir un cambio. El menú agrupa lo que antes estaba repartido entre el menú de la app y
// la barra lateral: cambiar de cerebro, Ajustes, actualizaciones, novedades, registros y enlaces.
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bug, ChevronDown, ChevronRight, FolderOpen, Github, Layers, Plus, RefreshCw, ScrollText, Settings, Gift, Volume2, VolumeX } from "lucide-react";
import { post } from "../lib/api.js";
import { t } from "../lib/i18n.js";
import { GlimMark } from "./ui.jsx";

const REPO_GLIM = "https://github.com/educlopez/glim";
const app = () => (typeof window !== "undefined" && window.panelApp) || null;

function IconoApp({ icono }) {
  const [ruta, setRuta] = useState(null);
  useEffect(() => {
    if (!icono) return;
    let vivo = true;
    post("/api/icono/vista", { tinta: icono.tinta, glifo: icono.glifo }).then((j) => vivo && setRuta(j.ruta)).catch(() => {});
    return () => { vivo = false; };
  }, [icono && icono.tinta, icono && icono.glifo]);
  return ruta
    ? <img className="cerebroicono" src={`/repo/${ruta}?v=${encodeURIComponent(ruta)}`} alt="" width="22" height="22" />
    : <span className="cerebroicono vacio"><GlimMark size={12} /></span>;
}

export function MenuCerebro({ data, onPedir }) {
  const [abierto, setAbierto] = useState(false);
  const [sub, setSub] = useState(false);
  const [buscando, setBuscando] = useState(null); // null | "buscando" | "aldia" | "error"
  const raiz = useRef(null);
  const boton = useRef(null);
  const menu = useRef(null);
  const cierreSub = useRef(null); // el submenú se cierra con retraso: da tiempo a llegar a él aunque el puntero se desvíe
  useEffect(() => () => clearTimeout(cierreSub.current), []);
  const [pos, setPos] = useState(null);
  const id = useId();
  const c = (data && data.cerebro) || {};
  const nombre = c.nombre || "Glim";
  const pa = app();

  const cerrar = (devolverFoco = true) => {
    clearTimeout(cierreSub.current);
    setAbierto(false); setSub(false); setBuscando(null);
    if (devolverFoco && boton.current) boton.current.focus();
  };

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e) => { if (!raiz.current?.contains(e.target) && !menu.current?.contains(e.target)) cerrar(false); };
    const tecla = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); if (sub) setSub(false); else cerrar(); return; }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const items = [...menu.current.querySelectorAll('[role="menuitem"]:not([disabled])')];
      const i = items.indexOf(document.activeElement);
      const n = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      items[n] && items[n].focus();
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla, true);
    if (!sub) { const primero = menu.current && menu.current.querySelector('[role="menuitem"]'); primero && primero.focus(); }
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", tecla, true); };
  }, [abierto, sub, pos]);

  // La barra lateral recorta lo que se sale (overflow): el menú va a <body> con posición fija bajo el botón.
  useLayoutEffect(() => {
    if (!abierto || !boton.current) return;
    const colocar = () => { const r = boton.current.getBoundingClientRect(); setPos({ top: r.bottom + 6, left: r.left }); };
    colocar();
    window.addEventListener("resize", colocar);
    return () => window.removeEventListener("resize", colocar);
  }, [abierto]);

  const hacer = (fn) => () => { cerrar(false); fn(); };
  const ajustes = () => (pa && pa.abrirAjustes ? pa.abrirAjustes() : (location.hash = "#/ajustes"));
  const novedades = () => window.dispatchEvent(new Event("panel:novedades"));
  const sonidos = data && data.ajustes && data.ajustes.sonidos;
  const conSonido = !sonidos || sonidos.activo;
  const alternarSonido = () => post("/api/ajustes", { sonidos: { activo: !conSonido } }).then(() => window.dispatchEvent(new Event("panel:reload"))).catch(() => {});
  const buscar = async () => {
    setBuscando("buscando");
    try {
      const a = await post("/api/actualizacion/comprobar");
      if (a && a.disponible) { cerrar(false); window.dispatchEvent(new Event("panel:actualizar")); } else setBuscando("aldia");
    } catch { setBuscando("error"); }
  };
  const textoBuscar = buscando === "buscando" ? t("menu.buscando") : buscando === "aldia" ? t("menu.alDia") : buscando === "error" ? t("menu.errorBuscar") : t("act.buscar");

  return (
    <div className="cerebrobar" ref={raiz}>
      <button type="button" ref={boton} className="cerebrobtn" aria-haspopup="menu" aria-expanded={abierto} aria-controls={id}
        onClick={() => (abierto ? cerrar() : setAbierto(true))}>
        <IconoApp icono={data && data.ajustes && data.ajustes.icono} />
        <span className="cerebronombre">{nombre}</span>
        <ChevronDown size={13} aria-hidden="true" className="cerebrochev" />
      </button>
      <button type="button" className="iconbtn cerebromas" onClick={onPedir} aria-label={t("app.pedirCambio")} title={t("app.pedirCambio")}>
        <Plus size={16} aria-hidden="true" />
      </button>

      {abierto && pos ? createPortal(
        <div className="cerebromenu" role="menu" id={id} aria-label={nombre} ref={menu} style={{ top: pos.top, left: pos.left }}>
          <div className="cerebrosubwrap"
            onMouseEnter={() => { clearTimeout(cierreSub.current); setSub(true); }}
            onMouseLeave={() => { clearTimeout(cierreSub.current); cierreSub.current = setTimeout(() => setSub(false), 300); }}>
            <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={sub} onClick={() => setSub((v) => !v)}
              onKeyDown={(e) => { if (e.key === "ArrowRight") { e.preventDefault(); setSub(true); } }}>
              <Layers size={16} aria-hidden="true" /><span>{t("menu.cerebro")}</span><ChevronRight size={14} aria-hidden="true" className="fin" />
            </button>
            {sub ? (
              <div className="cerebromenu sub" role="menu" aria-label={t("menu.cerebro")}>
                {pa && pa.mostrarCerebro ? <button type="button" role="menuitem" onClick={hacer(() => pa.mostrarCerebro())}><FolderOpen size={16} aria-hidden="true" /><span>{t("menu.finder")}</span></button> : null}
                {c.remoto ? <a role="menuitem" href={c.remoto} target="_blank" rel="noreferrer" onClick={() => cerrar(false)}><Github size={16} aria-hidden="true" /><span>{t("menu.abrirRemoto")}</span></a> : null}
                {pa && pa.cambiarCerebro ? (
                  <>
                    <hr />
                    <button type="button" role="menuitem" onClick={hacer(() => pa.cambiarCerebro())}><Layers size={16} aria-hidden="true" /><span>{t("menu.otroCerebro")}</span></button>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
          <hr />
          <button type="button" role="menuitem" onClick={hacer(ajustes)}>
            <Settings size={16} aria-hidden="true" /><span>{t("nav.ajustes")}</span><kbd className="fin">⌘ ,</kbd>
          </button>
          <button type="button" role="menuitem" data-sin-sonido onClick={hacer(alternarSonido)}>
            {conSonido ? <VolumeX size={16} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}
            <span>{t(conSonido ? "menu.silenciar" : "menu.activarSonidos")}</span>
          </button>
          <hr />
          <button type="button" role="menuitem" onClick={buscar} disabled={buscando === "buscando"} aria-live="polite">
            <RefreshCw size={16} aria-hidden="true" className={buscando === "buscando" ? "gira" : undefined} /><span>{textoBuscar}</span>
          </button>
          <button type="button" role="menuitem" onClick={hacer(novedades)}><Gift size={16} aria-hidden="true" /><span>{t("act.verNovedades")}</span></button>
          {pa && pa.registros ? <button type="button" role="menuitem" onClick={hacer(() => pa.registros())}><ScrollText size={16} aria-hidden="true" /><span>{t("menu.registros")}</span></button> : null}
          <hr />
          <a role="menuitem" href={REPO_GLIM} target="_blank" rel="noreferrer" onClick={() => cerrar(false)}><Github size={16} aria-hidden="true" /><span>{t("menu.github")}</span></a>
          <a role="menuitem" href={`${REPO_GLIM}/issues/new`} target="_blank" rel="noreferrer" onClick={() => cerrar(false)}><Bug size={16} aria-hidden="true" /><span>{t("menu.fallo")}</span></a>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
