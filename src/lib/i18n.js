// Traducciones de la interfaz, sin dependencias. Diccionarios planos en src/locales/<idioma>.js (claves con puntos,
// agrupadas por vista: "nav.encargos", "ajustes.interfaz.titulo"…).
// - t(clave, vars): interpola {nombre} y, si vars.n es un número, elige la forma de plural (clave_one / clave_other)
//   con Intl.PluralRules. Si falta la clave en el idioma activo se usa el castellano; si falta también, la clave.
// - El idioma activo vive en el módulo para que t() funcione también fuera de React (lib/format.js, lib/api.js…).
//   I18nProvider lo fija en cada render y da contexto a quien quiera suscribirse con useI18n().
// - Fechas y números: helpers con el locale activo en vez de "es-ES" fijo.
import { createContext, createElement, useContext } from "react";
import es from "../locales/es.js";
import en from "../locales/en.js";

export const DICCIONARIOS = { es, en };
export const IDIOMAS = Object.keys(DICCIONARIOS);
const LOCALES = { es: "es-ES", en: "en-GB" };
const POR_DEFECTO = "es";

let actual = POR_DEFECTO;

export const idiomaActual = () => actual;
export const localeActual = () => LOCALES[actual] || LOCALES[POR_DEFECTO];

export function setIdioma(id) {
  actual = DICCIONARIOS[id] ? id : POR_DEFECTO;
  if (typeof document !== "undefined") document.documentElement.lang = actual;
  return actual;
}

// Idioma que toca: el ajuste del panel ("auto", "es", "en"); con "auto", el del cerebro (glim.config.json → idioma)
// y, si no está soportado, el del navegador. Si nada encaja, castellano.
export function resolverIdioma(ajuste, cerebro, navegador) {
  const base = (s) => String(s || "").toLowerCase().split(/[-_]/)[0];
  if (ajuste && ajuste !== "auto" && DICCIONARIOS[ajuste]) return ajuste;
  if (DICCIONARIOS[base(cerebro)]) return base(cerebro);
  const nav = Array.isArray(navegador) ? navegador : [navegador];
  for (const l of nav) if (DICCIONARIOS[base(l)]) return base(l);
  return POR_DEFECTO;
}

// Último idioma usado en esta ventana, para no parpadear en castellano mientras carga /api/overview.
const CLAVE_GUARDADA = "glim:idioma";
export function idiomaGuardado() {
  try { const v = window.localStorage.getItem(CLAVE_GUARDADA); return DICCIONARIOS[v] ? v : null; } catch { return null; }
}
export function guardarIdioma(id) {
  try { window.localStorage.setItem(CLAVE_GUARDADA, id); } catch { /* sin almacenamiento: no pasa nada */ }
}

const interpolar =(s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined || vars[k] === null ? m : String(vars[k]))) : s);

// Traducción pura (sin estado), para los tests y para t().
export function traducir(idioma, clave, vars) {
  const dict = DICCIONARIOS[idioma] || DICCIONARIOS[POR_DEFECTO];
  const base = DICCIONARIOS[POR_DEFECTO];
  let k = clave;
  if (vars && typeof vars.n === "number") {
    const forma = new Intl.PluralRules(LOCALES[idioma] || idioma).select(vars.n);
    const conForma = `${clave}_${forma}`;
    if (conForma in dict || conForma in base) k = conForma;
    else if (`${clave}_other` in dict || `${clave}_other` in base) k = `${clave}_other`;
  }
  const s = k in dict ? dict[k] : k in base ? base[k] : clave;
  return interpolar(s, vars);
}

export const t = (clave, vars) => traducir(actual, clave, vars);

// Fechas y números con el locale activo.
export const fmtFecha = (d, opts) => new Date(d).toLocaleDateString(localeActual(), opts);
export const fmtFechaHora = (d, opts) => new Date(d).toLocaleString(localeActual(), opts);
export const fmtHora = (d, opts) => new Date(d).toLocaleTimeString(localeActual(), opts);
export const fmtNumero = (n, opts) => Number(n).toLocaleString(localeActual(), opts);

// Días de la semana empezando en lunes ("short": lun, mar… / Mon, Tue…).
export function nombresDias(formato = "short") {
  // 1-ene-2024 fue lunes.
  return Array.from({ length: 7 }, (_, i) => fmtFecha(new Date(2024, 0, 1 + i), { weekday: formato }));
}

const I18nContext = createContext(POR_DEFECTO);

// Fija el idioma antes de pintar los hijos, así todo lo que llama a t() en este render ya sale en el idioma nuevo.
export function I18nProvider({ idioma, children }) {
  setIdioma(idioma);
  return createElement(I18nContext.Provider, { value: actual }, children);
}

export function useI18n() {
  const idioma = useContext(I18nContext);
  return { idioma, t, fmtFecha, fmtFechaHora, fmtHora, fmtNumero };
}
