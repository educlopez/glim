// Llamadas que escriben en el repo o lanzan a Claude. La cabecera x-panel la exige el servidor (protección CSRF).
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { marked } from "marked";

export async function post(url, body = {}) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-panel": "1" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

export const ACTIVOS = ["cola", "en-curso"];

export const ESTADOS_ENCARGO = {
  borrador: "Sin lanzar",
  cola: "En cola",
  "en-curso": "Trabajando",
  revisar: "Para revisar",
  hecho: "Hecho",
  descartado: "Descartado",
  error: "Falló",
};

export const EncargosContext = createContext({ lista: [], ocupado: null, recargar: () => {} });
export const useEncargos = () => useContext(EncargosContext);

// Lista de encargos. Mientras alguno corre, se pide cada 2 s; si no, cada 20 s.
// Cuando uno termina, avisa (onFin) para releer el repo: Claude habrá cambiado archivos.
export function useEncargosPoll(onFin) {
  const [state, setState] = useState({ lista: [], ocupado: null });
  const prevActivos = useRef(new Set());
  const recargar = useCallback(() => fetch("/api/encargos").then((r) => r.json()).then((j) => {
    const activos = new Set(j.encargos.filter((e) => ACTIVOS.includes(e.estado)).map((e) => e.id));
    const terminado = [...prevActivos.current].some((id) => !activos.has(id));
    prevActivos.current = activos;
    setState({ lista: j.encargos, ocupado: j.ocupado });
    if (terminado && onFin) onFin();
  }).catch(() => {}), [onFin]);
  const hayActivos = state.lista.some((e) => ACTIVOS.includes(e.estado));
  useEffect(() => {
    recargar();
    const t = setInterval(recargar, hayActivos ? 2000 : 20000);
    return () => clearInterval(t);
  }, [recargar, hayActivos]);
  return { ...state, recargar };
}

// Markdown que viene de Claude: se escapa el HTML antes de pasarlo por marked.
export const md = (s) => marked.parse(String(s || "").replace(/</g, "&lt;"), { gfm: true, breaks: true });

export const duracion = (ms) => {
  if (!ms && ms !== 0) return null;
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
};

export const hace = (iso) => {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "ahora";
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
};
