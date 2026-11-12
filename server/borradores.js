// Escrituras pequeñas en borradores/*.md desde el panel. Solo frontmatter, nunca el texto del post.
import fs from "node:fs";
import path from "node:path";
import { ROOT, hoyLocal } from "./repo.js";
import { rutas } from "./cerebro.js";

const MESES = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12 };
const pad = (n) => String(n).padStart(2, "0");
const FECHA = /(\d{4}-\d{2}-\d{2})|((?:lun|mar|mié|mie|jue|vie|sáb|sab|dom)\s+)?(\d{1,2})-(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[a-z]*-(\d{4})/gi;

export function abrir(id) {
  if (!/^[\w.-]+$/.test(id || "")) throw new Error("Id no válido");
  const abs = path.join(ROOT, rutas.borradores, `${id}.md`);
  if (!fs.existsSync(abs)) throw new Error("No existe el borrador");
  const lineas = fs.readFileSync(abs, "utf8").split("\n");
  if (lineas[0] !== "---") throw new Error("El borrador no tiene frontmatter");
  const fin = lineas.indexOf("---", 1);
  const get = (k) => { const l = lineas.slice(1, fin).find((x) => x.startsWith(`${k}:`)); return l === undefined ? null : l.slice(k.length + 1); };
  const set = (k, v, despuesDe) => {
    const f = lineas.indexOf("---", 1);
    const i = lineas.slice(1, f).findIndex((x) => x.startsWith(`${k}:`));
    if (i >= 0) { lineas[i + 1] = `${k}:${v.startsWith(" ") ? "" : " "}${v}`; return; }
    const j = lineas.slice(1, f).findIndex((x) => x.startsWith(`${despuesDe}:`));
    lineas.splice(j >= 0 ? j + 2 : f, 0, `${k}: ${v}`);
  };
  const guardar = () => fs.writeFileSync(abs, lineas.join("\n"));
  return { get, set, guardar };
}

// Mueve un post a otro día desde el calendario. Mantiene la hora. Con estado «programado» cambia la fecha del
// borrador y deja nota de que falta moverlo en Buffer (el panel avisa hasta que Buffer coincida). Sin OK de Edu,
// la fecha va como propuesta en comentario, como pide AGENTS.md (programado_para solo tras el OK).
export function moverFecha(id, dia) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia || "")) throw new Error("Día no válido");
  if (dia < hoyLocal()) throw new Error("No se puede mover a un día que ya pasó");
  const b = abrir(id);
  const estado = (b.get("estado") || "").trim().replace(/["']/g, "");
  if (estado === "publicado" || estado === "descartado") throw new Error(`Un post ${estado} no se mueve`);
  const actual = b.get("programado_para") || "";
  const hora = (/(\d{1,2}):(\d{2})/.exec(actual) || [])[0] || "10:00";
  if (estado === "programado" && /\d/.test(actual.split("#")[0])) {
    // Cambia todas las fechas (X y Threads pueden ir en la misma línea) y conserva horas y redes.
    b.set("programado_para", actual.replace(FECHA, dia));
    const nota = (b.get("nota_estado") || "").trim();
    const marca = `movido en el panel al ${dia}: falta cambiarlo en Buffer`;
    b.set("nota_estado", nota.includes("movido en el panel") ? nota.replace(/movido en el panel al [^:]+: falta cambiarlo en Buffer/, marca) : nota ? `${marca}. ${nota}` : marca, "estado");
  } else {
    b.set("programado_para", `   # propuesta: ${dia} ${hora.padStart(5, "0")} (Madrid), movida en el panel`);
  }
  b.guardar();
  return { ok: true };
}

export { MESES, pad };
