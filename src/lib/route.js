// Rutas en el hash: #/<vista>?param=valor. Los parámetros guardan filtros y el panel abierto (?ver=…),
// así que cualquier estado se puede enlazar y el botón Atrás cierra el panel.
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export const RouteContext = createContext(null);
export const useRouteCtx = () => useContext(RouteContext);

function parse() {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const i = raw.indexOf("?");
  const path = decodeURIComponent(i < 0 ? raw : raw.slice(0, i));
  const params = Object.fromEntries(new URLSearchParams(i < 0 ? "" : raw.slice(i + 1)));
  return { path, params };
}

export function hrefOf(path, params = {}) {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "" && v !== false)).toString();
  return `#/${path}${q ? "?" + q : ""}`;
}

export function useRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  // Mantiene la vista y cambia solo algunos parámetros (null borra).
  const set = useCallback((patch, replace = false) => {
    const cur = parse();
    const next = hrefOf(cur.path, { ...cur.params, ...patch });
    if (replace) window.history.replaceState(null, "", next), window.dispatchEvent(new HashChangeEvent("hashchange"));
    else window.location.hash = next;
  }, []);
  const go = useCallback((path, params) => { window.location.hash = hrefOf(path, params); }, []);
  const withParams = useCallback((patch) => hrefOf(route.path, { ...route.params, ...patch }), [route]);
  return { ...route, set, go, withParams };
}
