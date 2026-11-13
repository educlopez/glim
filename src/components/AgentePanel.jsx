// Lumi, la asistente de Glim (⌘J): un panel a la derecha, hermano de la tarjeta de contenido, como los paneles de Rex.
// Responde preguntas sobre el cerebro, hace cambios como un encargo general y adapta Glim con secciones propias
// (glim.config.json → secciones). Por dentro es un encargo de tipo «lumi» (server/encargos.js): cada mensaje nuevo es
// otra vuelta de la misma sesión del agente que hayas elegido en Ajustes.
import { useEffect, useRef, useState } from "react";
import { X, SquarePen, ArrowUp } from "lucide-react";
import { post } from "../lib/api.js";
import { useData } from "../lib/data.js";
import { hrefOf } from "../lib/route.js";
import { LumiAvatar } from "./LumiAvatar.jsx";
import { Ronda } from "../views/Encargos.jsx";
import { t } from "../lib/i18n.js";

const ACTIVOS = ["cola", "en-curso"];
export const MIN = 320;
export const MAX = 680;
// Se guardan en los ajustes del cerebro (server/ajustes.js → lumi), no en localStorage: la app arranca cada vez en un
// puerto distinto y el almacenamiento del navegador va por origen.
const guardarConversacion = (id) => post("/api/ajustes", { lumi: { conversacion: id || "" } }).catch(() => {});

// Abre a Lumi desde cualquier sitio, con un texto ya escrito si se quiere.
export const abrirAgente = (texto = "") => window.dispatchEvent(new CustomEvent("glim:agente", { detail: { texto } }));

// Tirador en el hueco entre la tarjeta de contenido y Lumi: arrastrar (o las flechas) cambia el ancho; se guarda al soltar.
function Tirador({ ancho, onAncho, onFin }) {
  const empezar = (e) => {
    e.preventDefault();
    const el = e.currentTarget;
    const x0 = e.clientX;
    let w = ancho;
    const mover = (ev) => { w = Math.min(MAX, Math.max(MIN, ancho + (x0 - ev.clientX))); onAncho(w); };
    const soltar = () => {
      window.removeEventListener("pointermove", mover); window.removeEventListener("pointerup", soltar);
      document.documentElement.classList.remove("redimensionando"); el.blur(); onFin(w);
    };
    document.documentElement.classList.add("redimensionando");
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  };
  const teclas = (e) => {
    const paso = e.shiftKey ? 40 : 16;
    const w = e.key === "ArrowLeft" ? Math.min(MAX, ancho + paso) : e.key === "ArrowRight" ? Math.max(MIN, ancho - paso) : null;
    if (w == null) return;
    e.preventDefault(); onAncho(w); onFin(w);
  };
  return <div className="lumitirador" role="separator" aria-orientation="vertical" aria-label={t("agente.redimensionar")} aria-valuemin={MIN} aria-valuemax={MAX} aria-valuenow={ancho} tabIndex={0} onPointerDown={empezar} onKeyDown={teclas} />;
}

export function AgentePanel({ onClose, ancho, onAncho, onFin, textoInicial = "" }) {
  const d = useData();
  const [id, setId] = useState(() => (d && d.ajustes && d.ajustes.lumi && d.ajustes.lumi.conversacion) || null);
  const [j, setJ] = useState(null);
  const [texto, setTexto] = useState(textoInicial);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const caja = useRef(null);
  const fin = useRef(null);
  const antes = useRef(null); // secciones que había al mandar el último mensaje

  useEffect(() => { if (textoInicial) { setTexto(textoInicial); caja.current && caja.current.focus(); } }, [textoInicial]);
  useEffect(() => { caja.current && caja.current.focus(); }, []);

  const cargar = (cual = id) => (cual
    ? fetch(`/api/encargos/${cual}`).then((r) => (r.ok ? r.json() : null)).then((x) => { if (!x) { guardarConversacion(null); setId(null); setJ(null); } else setJ(x); }).catch(() => {})
    : Promise.resolve(setJ(null)));
  useEffect(() => { cargar(); }, [id]);
  const vivo = j && ACTIVOS.includes(j.encargo.estado);
  // Ánimo del avatar: piensa mientras trabaja y se alegra un momento al terminar bien.
  const [contenta, setContenta] = useState(false);
  const antesVivo = useRef(vivo);
  useEffect(() => {
    if (antesVivo.current && !vivo && j && j.encargo.estado !== "error") {
      setContenta(true);
      const t0 = setTimeout(() => setContenta(false), 2400);
      antesVivo.current = vivo;
      return () => clearTimeout(t0);
    }
    antesVivo.current = vivo;
    return undefined;
  }, [vivo]);
  const animo = vivo || enviando ? "thinking" : contenta ? "happy" : "idle";
  useEffect(() => {
    if (!vivo) return undefined;
    const i = setInterval(() => cargar(), 1500);
    return () => clearInterval(i);
  }, [vivo, id]);
  useEffect(() => { fin.current && fin.current.scrollIntoView({ block: "end" }); }, [j && j.eventos.length, j && j.encargo.rondas.length]);

  const secciones = (d && d.secciones && d.secciones.secciones) || [];
  // Secciones que han aparecido desde el último mensaje: enlace directo a cada una.
  const nuevas = !vivo && antes.current ? secciones.filter((s) => !antes.current.includes(s.id)) : [];

  const enviar = async (ev) => {
    if (ev) ev.preventDefault();
    const msg = texto.trim();
    if (!msg || enviando || vivo) return;
    setEnviando(true); setError(null);
    antes.current = secciones.map((s) => s.id);
    try {
      if (id && j) { await post(`/api/encargos/${id}/otra-vuelta`, { texto: msg }); await cargar(id); }
      else {
        const r = await post("/api/encargos", { objetivo: { tipo: "lumi" }, texto: msg, lanzar: true });
        guardarConversacion(r.encargo.id); setId(r.encargo.id);
      }
      setTexto("");
    } catch (x) { setError(x.message); }
    finally { setEnviando(false); }
  };
  const nueva = () => { guardarConversacion(null); setId(null); setJ(null); setTexto(""); antes.current = null; caja.current && caja.current.focus(); };

  const sugerencias = ["agente.sug.pregunta", "agente.sug.tablero", "agente.sug.galeria", "agente.sug.documento"].map((k) => t(k));
  return (
    <aside className="lumi" aria-label={t("agente.titulo")} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <Tirador ancho={ancho} onAncho={onAncho} onFin={onFin} />
      <header className="lumihead">
        <span className="lumititulo"><LumiAvatar size={22} mood={animo} className="lumimarca" />Lumi</span>
        <span className="lumiacciones">
          {j ? <button type="button" className="lumiboton" onClick={nueva} title={t("agente.nueva")}><SquarePen size={13} aria-hidden="true" /><span className="sr">{t("agente.nueva")}</span></button> : null}
          <button type="button" className="lumiboton" onClick={onClose} title={`${t("comun.cerrar")} (⌘J)`}><X size={14} aria-hidden="true" /><span className="sr">{t("comun.cerrar")}</span></button>
        </span>
      </header>
      <div className="lumicuerpo">
        {!j ? (
          <div className="lumivacio">
            <LumiAvatar size={64} mood={animo} followPointer className="lumigrande" />
            <p>{t("agente.intro")}</p>
            <p className="muted small">{t("agente.introNota")}</p>
            <div className="lumisug">
              {sugerencias.map((s) => <button key={s} type="button" className="lumichip" onClick={() => { setTexto(s); caja.current && caja.current.focus(); }}>{s}</button>)}
            </div>
          </div>
        ) : (
          <>
            {j.encargo.rondas.map((ronda, n) => <Ronda key={n} ronda={ronda} n={n} eventos={j.eventos} viva={ronda.estado === "en-curso"} agente={j.encargo.agente} quien="Lumi" />)}
            {j.encargo.estado === "cola" ? <p className="muted small">{t("encargos.enCola")}</p> : null}
            {nuevas.length ? (
              <div className="lumi-nuevas">
                {nuevas.map((s) => <a key={s.id} className="btn small" href={hrefOf(`s/${s.id}`)}>{t("agente.verSeccion", { titulo: s.titulo })}</a>)}
              </div>
            ) : null}
          </>
        )}
        <div ref={fin} />
      </div>
      <form className="lumiform" onSubmit={enviar}>
        <label className="sr" htmlFor="lumi-texto">{t("agente.placeholder")}</label>
        <div className="lumicaja">
          <textarea id="lumi-texto" ref={caja} rows={2} value={texto} placeholder={vivo ? t("agente.trabajando") : t("agente.placeholder")} disabled={vivo}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) enviar(e); }} />
          <button type="submit" className="lumienviar" disabled={!texto.trim() || enviando || vivo} aria-label={t("agente.enviar")}><ArrowUp size={14} aria-hidden="true" /></button>
        </div>
        {error ? <p className="formerror small" role="alert">{error}</p> : <p className="muted lumipie">{t("agente.pie")}</p>}
      </form>
    </aside>
  );
}
