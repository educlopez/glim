// Llamadas que escriben en el repo o lanzan a Claude. La cabecera x-panel la exige el servidor (protección CSRF).
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Marked } from "marked";
import { fmtFecha, t } from "./i18n.js";

export async function post(url, body = {}) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-panel": "1" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

export const ACTIVOS = ["cola", "en-curso"];

// Etiquetas en el idioma activo (getters: se leen al pintar, no al cargar el módulo).
export const ESTADOS_ENCARGO = {
  get borrador() { return t("encargo.estado.borrador"); },
  get cola() { return t("encargo.estado.cola"); },
  get "en-curso"() { return t("encargo.estado.en-curso"); },
  get revisar() { return t("encargo.estado.revisar"); },
  get hecho() { return t("encargo.estado.hecho"); },
  get descartado() { return t("encargo.estado.descartado"); },
  get error() { return t("encargo.estado.error"); },
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

// Markdown sin HTML crudo: el HTML del texto se muestra como texto. Escapar «<» antes de parsear rompía el código en
// línea (`<cerebro>` salía como «&lt;cerebro>»), así que se escapa en el renderizador, solo en los nodos HTML.
const seguro = new Marked({ gfm: true, breaks: true, renderer: { html: (t) => String(t.text ?? t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") } });
export const md = (s) => seguro.parse(String(s || ""));

export const duracion = (ms) => {
  if (!ms && ms !== 0) return null;
  const s = Math.round(ms / 1000);
  return s < 60 ? t("tiempo.segundos", { s }) : t("tiempo.minSeg", { m: Math.floor(s / 60), s: String(s % 60).padStart(2, "0") });
};

export const hace = (iso) => {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return t("tiempo.ahora");
  if (s < 3600) return t("tiempo.haceMin", { m: Math.round(s / 60) });
  if (s < 86400) return t("tiempo.haceH", { h: Math.round(s / 3600) });
  return fmtFecha(iso, { day: "numeric", month: "short" });
};
