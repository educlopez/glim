// Barridos de glimm (glimm.dev): una banda de color cruza y deja detrás lo nuevo. Solo en momentos que lo merecen
// (entrar en la app tras la bienvenida, cambiar el tema, un encargo que termina); nunca al navegar ni al filtrar.
// Con «Animación: no» en Ajustes o con «Reducir movimiento» en el sistema no hay barrido: el cambio es inmediato.
// Electron 45 trae Chromium 156: glimm pinta la banda. Con Chromium 157 o posterior glimm detecta solo el
// HTML-in-Canvas y el efecto mejora sin tocar nada aquí.
import { accentPair, createShader, playSweep } from "glimm";

// El naranja de Glim y uno más claro para el brillo de la banda.
export const PALETA = accentPair("#ff7528", "#ffc58a");

export function animado() {
  if (typeof window === "undefined") return false;
  if (document.documentElement.dataset.animacion === "no") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const oscuro = () => {
  const tema = document.documentElement.dataset.tema;
  return tema ? tema === "oscuro" : window.matchMedia("(prefers-color-scheme: dark)").matches;
};

// Opciones comunes: en oscuro la banda brilla menos para no deslumbrar.
export const opciones = (extra = {}) => ({ palette: PALETA, brightness: oscuro() ? 0.75 : 1, ...extra });

// Barrido decorativo sobre un elemento (una tarjeta): un lienzo encima de su caja que se borra al terminar.
export function barridoEn(el, extra = {}) {
  if (!el || !animado()) return;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const lienzo = document.createElement("canvas");
  Object.assign(lienzo.style, { position: "fixed", left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, pointerEvents: "none", zIndex: 50, borderRadius: getComputedStyle(el).borderRadius });
  lienzo.setAttribute("aria-hidden", "true");
  document.body.append(lienzo);
  const ctrl = createShader({ canvas: lienzo, palette: PALETA, feather: "auto" });
  if (!ctrl) { lienzo.remove(); return; } // sin WebGL: nada
  let hecho = false;
  const fin = () => { if (hecho) return; hecho = true; ctrl.destroy(); lienzo.remove(); };
  playSweep(ctrl, { ...opciones({ sweepMs: 900, bandTight: 18 }), ...extra, onComplete: fin });
  setTimeout(fin, 4000); // por si el lienzo se queda colgado (la ventana se oculta a mitad)
}
