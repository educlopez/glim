import { createContext, useCallback, useContext, useEffect, useState } from "react";

export const DataContext = createContext(null);
export const useData = () => useContext(DataContext);

// Carga /api/overview y la vuelve a pedir al volver a la pestaña: el repo cambia mientras trabajamos.
export function useOverview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(() => {
    setLoading(true);
    return fetch("/api/overview")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => { configurarCerebro(d.cerebro); setData(d); setError(null); })
      .catch((e) => setError(String(e.message || e)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const on = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, [load]);
  return { data, error, loading, reload: load };
}

export const ESTADOS = [
  { id: "idea", label: "Idea" },
  { id: "pendiente-ok", label: "Pendiente de OK" },
  { id: "programado", label: "Programado" },
  { id: "publicado", label: "Publicado" },
  { id: "descartado", label: "Descartado" },
];
export const estadoLabel = (id) => (ESTADOS.find((e) => e.id === id) || { label: id || "Sin estado" }).label;

// Redes y cadencia salen del cerebro (moss.config.json → redes, cadencia). `export let`: las vistas ven el valor nuevo.
export let REDES = ["X", "Threads", "LinkedIn"];
let CADENCIA = {};
export function configurarCerebro(c) {
  if (!c) return;
  if (Array.isArray(c.redes) && c.redes.length) REDES = c.redes;
  CADENCIA = c.cadencia || {};
}
// Posts por red para un día de la semana (0 = lunes).
export function cadencia(diaSemana) {
  return Object.fromEntries(Object.entries(CADENCIA).map(([red, dias]) => [red, (dias && dias[diaSemana]) || 0]));
}
