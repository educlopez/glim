// Skills de Glim en el cerebro abierto: comprobar (sin escribir nada) y actualizar. La lógica está en
// paquete-skills.js; aquí solo se le pasa el cerebro. La comprobación corre una vez al arrancar (api.js → arrancar) y
// su resultado va en /api/overview, para avisar sin molestar de que hay skills nuevas o actualizadas.
import { ROOT, rutas } from "./cerebro.js";
import { instalarSkills } from "./paquete-skills.js";

let ultima = null;

export function comprobar() {
  ultima = { ...instalarSkills(ROOT, { rutas, seco: true }), cuando: new Date().toISOString() };
  return ultima;
}

export function actualizar() {
  const r = { ...instalarSkills(ROOT, { rutas }), cuando: new Date().toISOString() };
  comprobar();
  return r;
}

// Lo que ve el panel: cuántas cosas haría «Actualizar» y si alguna skill se salta por estar editada.
export const estado = () => (ultima ? { pendientes: ultima.pendientes, saltadas: ultima.saltadas, cuando: ultima.cuando } : null);
