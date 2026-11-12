// "Pedir un cambio": Edu escribe qué quiere, elige plantilla y referencias, y se lanza Claude en local con
// todo el contexto del objeto. Se abre con ?pedir=<tipo:id> desde cualquier vista (o ?pedir=general).
import { sonar } from "../lib/sonidos.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { X as Close, Sparkles, LayoutTemplate, Images, Eye, ShieldCheck, Search, Check } from "lucide-react";
import { useData } from "../lib/data.js";
import { useRouteCtx, hrefOf } from "../lib/route.js";
import { post, useEncargos } from "../lib/api.js";
import { TIPOS_OBJETIVO, claveDe, parseClave, infoObjetivo, objetivoDeNota } from "../lib/objetivos.js";
import { Segmented } from "./ui.jsx";
import { Thumb } from "./Media.jsx";

const MODELOS = [{ id: "", label: "Por defecto" }, { id: "sonnet", label: "Sonnet" }, { id: "opus", label: "Opus" }];

function ObjetivoSelect({ value, onChange }) {
  const d = useData();
  return (
    <label className="selectbox">
      <span className="sr">Sobre qué</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="general">General (el repo entero)</option>
        <optgroup label="Posts">
          {d.posts.filter((p) => p.estado !== "descartado").map((p) => <option key={p.id} value={`post:${p.id}`}>{p.titulo} · {p.redes.join(", ")}</option>)}
        </optgroup>
        <optgroup label="Plantillas">
          {d.plantillas.list.filter((t) => t.estado === "activa").map((t) => <option key={t.id} value={`plantilla:${t.id}`}>{t.id}</option>)}
        </optgroup>
        <optgroup label="Carruseles">{d.carruseles.map((c) => <option key={c.slug} value={`carrusel:${c.slug}`}>{c.slug}</option>)}</optgroup>
        <optgroup label="OG animadas">{d.ogs.map((o) => <option key={o.id} value={`og:${o.id}`}>{o.id}</option>)}</optgroup>
        <optgroup label="Marcas">{d.marcas.map((m) => <option key={m.id} value={`marca:${m.id}`}>{m.data.nombre || m.id}</option>)}</optgroup>
      </select>
    </label>
  );
}

function PlantillaPicker({ value, onChange }) {
  const d = useData();
  const activas = d.plantillas.list.filter((t) => t.estado === "activa");
  return (
    <div className="pickrow" role="radiogroup" aria-label="Plantilla">
      <button type="button" role="radio" aria-checked={!value} className="pick none" onClick={() => onChange(null)}>
        <span className="pickthumb"><span className="muted small">Ninguna</span></span>
        <span className="pickname">Sin plantilla</span>
      </button>
      {activas.map((t) => (
        <button key={t.id} type="button" role="radio" aria-checked={value === t.id} className="pick" onClick={() => onChange(t.id)} title={t.uso || t.id}>
          <span className="pickthumb">{t.previews[0] ? <Thumb path={t.previews[0].path} kind={t.previews[0].kind} /> : <LayoutTemplate size={18} aria-hidden="true" />}</span>
          <span className="pickname">{t.id}</span>
          {value === t.id ? <Check size={14} className="pickcheck" aria-hidden="true" /> : null}
        </button>
      ))}
    </div>
  );
}

function RefsPicker({ value, onChange }) {
  const d = useData();
  const [q, setQ] = useState("");
  const sel = new Set(value);
  const lista = useMemo(() => {
    const s = q.trim().toLowerCase();
    const all = d.referencias.filter((r) => !s || `${r.titulo} ${r.notas || ""} ${(r.etiquetas || []).join(" ")} ${r.handle || ""}`.toLowerCase().includes(s));
    return [...all.filter((r) => sel.has(r.id)), ...all.filter((r) => !sel.has(r.id))].slice(0, 30);
  }, [d.referencias, q, value.join()]);
  const toggle = (id) => onChange(sel.has(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="stack">
      <label className="searchbox">
        <Search size={14} aria-hidden="true" />
        <span className="sr">Buscar referencias</span>
        <input type="search" value={q} placeholder="Buscar por título, nota o etiqueta" onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="refpick">
        {lista.map((r) => (
          <button key={r.id} type="button" className="refpickitem" aria-pressed={sel.has(r.id)} onClick={() => toggle(r.id)} title={r.notas || r.titulo}>
            <span className="pickthumb">{r.thumb || r.archivo ? <Thumb path={r.thumb || r.archivo} kind={r.thumb ? "image" : r.tipo === "video" ? "video" : "image"} /> : <Images size={16} aria-hidden="true" />}</span>
            <span className="pickname">{r.titulo}</span>
            {sel.has(r.id) ? <Check size={14} className="pickcheck" aria-hidden="true" /> : null}
          </button>
        ))}
        {!lista.length ? <p className="muted small">Nada coincide. Añade referencias en la sección Referencias.</p> : null}
      </div>
    </div>
  );
}

export function Composer() {
  const d = useData();
  const r = useRouteCtx();
  const enc = useEncargos();
  const [objetivo, setObjetivo] = useState(r.params.pedir || "general");
  // Texto que deja otra pantalla (p. ej. «Mandar comentarios a Claude»). Se lee una vez y se borra.
  const [texto, setTexto] = useState(() => { try { const t = sessionStorage.getItem("composer:texto") || ""; sessionStorage.removeItem("composer:texto"); return t; } catch { return ""; } });
  const [plantilla, setPlantilla] = useState(null);
  const [refs, setRefs] = useState(r.params.ref ? r.params.ref.split(",").filter(Boolean).slice(0, 12) : []);
  const [modelo, setModelo] = useState(() => (d && d.ajustes ? d.ajustes.modelo : "") || "");
  const [agente, setAgente] = useState(() => (d && d.ajustes ? d.ajustes.agente : "claude") || "claude");
  const [agentesL, setAgentesL] = useState(null);
  useEffect(() => { fetch("/api/agentes").then((r) => r.json()).then((j) => setAgentesL(j.agentes)).catch(() => {}); }, []);
  const [preset, setPreset] = useState(r.params.preset || "");
  const [firma, setFirma] = useState("");
  // Elegir un preset rellena su plantilla y su firma (se pueden cambiar después).
  const elegirPreset = (id) => {
    setPreset(id);
    const p = d.kit.presets.find((x) => x.id === id);
    if (p) { if (p.plantilla) setPlantilla(p.plantilla); if (p.firma) setFirma(p.firma); }
  };
  useEffect(() => { if (r.params.preset) elegirPreset(r.params.preset); }, []);
  const [contexto, setContexto] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const area = useRef(null);
  const back = useRef(document.activeElement);

  const cerrar = () => r.set({ pedir: null, ref: null, nota: null });

  useEffect(() => {
    area.current && area.current.focus();
    const on = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const t = e.target;
      if (t !== document.body && t.closest && !t.closest("#root")) return;
      e.stopPropagation();
      cerrar();
    };
    window.addEventListener("keydown", on, true);
    return () => { window.removeEventListener("keydown", on, true); back.current && back.current.focus && back.current.focus(); };
  }, []);

  // Desde una nota de Agentation: el texto de la nota y el objeto marcado.
  useEffect(() => {
    if (!r.params.nota) return;
    fetch(`/api/file?path=${encodeURIComponent(".moss/feedback/" + r.params.nota)}`).then((x) => x.json()).then((j) => {
      if (!j.text) return;
      setTexto(j.text.replace(/<!--[\s\S]*?-->/g, "").trim());
      setObjetivo(objetivoDeNota(j.text));
    });
  }, [r.params.nota]);

  useEffect(() => { setContexto(null); }, [objetivo, texto, plantilla, refs.join(), preset, firma]);

  const o = parseClave(objetivo);
  const info = infoObjetivo(d, o);
  const ocupado = enc.lista.find((e) => e.id === enc.ocupado);

  const enviar = async (lanzar) => {
    if (!texto.trim()) { setError("Escribe qué hay que cambiar."); area.current.focus(); return; }
    setEnviando(true); setError(null);
    try {
      const j = await post("/api/encargos", { objetivo: o, texto, plantilla, referencias: refs, modelo: agente === "claude" ? modelo || null : null, agente, lanzar, preset: preset || null, firma: firma || null }); sonar("exito");
      enc.recargar();
      window.location.hash = hrefOf("encargos", { ver: j.encargo.id });
    } catch (e) { setError(e.message); setEnviando(false); }
  };

  const verContexto = async () => {
    if (contexto) return setContexto(null);
    const j = await post("/api/encargos/contexto", { objetivo: o, texto, plantilla, referencias: refs, preset: preset || null, firma: firma || null });
    setContexto(j.contexto);
  };

  return (
    <>
      <div className="scrim top" onClick={cerrar} aria-hidden="true" />
      <div className="composer" role="dialog" aria-label="Pedir un cambio a un agente" data-component="composer">
        <header className="composerhead">
          <div>
            <p className="small muted"><Sparkles size={13} aria-hidden="true" /> Un agente en local, con el contexto del repo</p>
            <h2>Pedir un cambio</h2>
          </div>
          <button type="button" className="iconbtn" onClick={cerrar} aria-label="Cerrar"><Close size={18} aria-hidden="true" /></button>
        </header>

        <form className="composerbody" onSubmit={(e) => { e.preventDefault(); enviar(true); }}>
          <div className="field">
            <span className="fieldlabel">Sobre qué</span>
            <div className="objrow">
              <span className="objthumb">{info.thumb ? <Thumb path={info.thumb.path} kind={info.thumb.kind} /> : <span className="muted small">{TIPOS_OBJETIVO[o.tipo]}</span>}</span>
              <div className="objinfo">
                <span className="small muted">{TIPOS_OBJETIVO[o.tipo] || o.tipo}</span>
                <strong>{info.titulo}</strong>
              </div>
              <ObjetivoSelect value={objetivo} onChange={setObjetivo} />
            </div>
          </div>

          <label className="field">
            <span className="fieldlabel">Qué hay que hacer</span>
            <textarea ref={area} rows={4} value={texto} onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) enviar(true); }}
              placeholder="Ejemplo: cambia la imagen de este post por un carrusel con la plantilla carrusel-ui-ux, siguiendo la referencia que adjunto. Mantén el texto." />
          </label>

          <div className="field">
            <span className="fieldlabel"><LayoutTemplate size={13} aria-hidden="true" /> Plantilla a usar <span className="muted">(opcional)</span></span>
            <PlantillaPicker value={plantilla} onChange={setPlantilla} />
          </div>

          <div className="field">
            <span className="fieldlabel"><Images size={13} aria-hidden="true" /> Referencias <span className="muted">(opcional · {refs.length} elegida{refs.length === 1 ? "" : "s"})</span></span>
            <RefsPicker value={refs} onChange={setRefs} />
          </div>

          {d.kit.presets.length || d.kit.firmas.length ? (
            <div className="row wrap gap-s">
              {d.kit.presets.length ? (
                <label className="field grow"><span className="fieldlabel">Preset <span className="muted">(opcional)</span></span>
                  <span className="selectbox"><select value={preset} onChange={(e) => elegirPreset(e.target.value)}>
                    <option value="">Ninguno</option>
                    {d.kit.presets.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select></span>
                </label>
              ) : null}
              {d.kit.firmas.length ? (
                <label className="field grow"><span className="fieldlabel">Firma <span className="muted">(opcional)</span></span>
                  <span className="selectbox"><select value={firma} onChange={(e) => setFirma(e.target.value)}>
                    <option value="">Sin firma</option>
                    {d.kit.firmas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                  </select></span>
                </label>
              ) : null}
            </div>
          ) : null}

          <div className="field row wrap gap-s">
            <span className="fieldlabel">Agente</span>
            <Segmented label="Agente" value={agente} onChange={setAgente} options={(agentesL || []).filter((x) => x.instalado).map((x) => ({ id: x.id, label: x.nombre }))} />
          </div>
          {agente === "claude" ? (
            <div className="field row wrap gap-s">
              <span className="fieldlabel">Modelo</span>
              <Segmented label="Modelo" value={modelo} onChange={setModelo} options={MODELOS} />
            </div>
          ) : null}

          <div className="field">
            <button type="button" className="btn ghost small" onClick={verContexto} aria-expanded={!!contexto}><Eye size={14} aria-hidden="true" /><span>{contexto ? "Ocultar el contexto" : "Ver el contexto que recibirá el agente"}</span></button>
            {contexto ? <pre className="raw contextpre">{contexto}</pre> : null}
          </div>

          {error ? <p className="formerror" role="alert">{error}</p> : null}

          <footer className="composerfoot">
            <p className="small muted"><ShieldCheck size={14} aria-hidden="true" /> Edita archivos y renderiza en local. No publica, no programa y no hace commit.{ocupado ? ` Ahora mismo trabaja en «${ocupado.texto.slice(0, 40)}»: este irá a la cola.` : ""}</p>
            <div className="row gap-s">
              <button type="button" className="btn" disabled={enviando} onClick={() => enviar(false)}>Guardar sin lanzar</button>
              <button type="submit" className="btn primary" disabled={enviando}><Sparkles size={14} aria-hidden="true" /><span>{enviando ? "Lanzando…" : "Lanzar"}</span><kbd>⌘↵</kbd></button>
            </div>
          </footer>
        </form>
      </div>
    </>
  );
}

// Botón para abrir el formulario sobre un objeto concreto.
export function PedirCambio({ objetivo, label = "Pedir cambio", className = "" }) {
  const r = useRouteCtx();
  return (
    <button type="button" className={`btn small primary ${className}`} onClick={() => r.set({ pedir: claveDe(objetivo) })}>
      <Sparkles size={14} aria-hidden="true" /><span>{label}</span>
    </button>
  );
}
