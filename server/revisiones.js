// Revisión de posts: comentarios anclados a un trozo del texto y OK por pieza (red). Idea de Postiz
// (model Comments con anchorQuote y resolvedAt). Vive en local, <cerebro>/.moss/revisiones.json.
// Un OK aquí deja constancia de que la persona lo dio, con fecha; no programa ni cambia el estado del borrador.
import fs from "node:fs";
import path from "node:path";
import { ESTADO } from "./cerebro.js";

const F = path.join(ESTADO, "revisiones.json");
const cargar = () => { try { return JSON.parse(fs.readFileSync(F, "utf8")); } catch { return { items: [] }; } };
const guardar = (d) => { fs.mkdirSync(path.dirname(F), { recursive: true }); fs.writeFileSync(F, JSON.stringify(d, null, 2)); };

export const revisiones = () => cargar().items;

export function anadir({ post, red, parte, cita, texto, tipo }) {
  if (!post || !/^[\w.-]+$/.test(post)) throw new Error("Falta el post");
  if (!["cambio", "ok"].includes(tipo)) throw new Error("Tipo no válido");
  if (tipo === "cambio" && !String(texto || "").trim()) throw new Error("Escribe qué hay que cambiar");
  const d = cargar();
  const item = {
    id: `rev-${Date.now().toString(36)}`, creado: new Date().toISOString(), post, red: red || null, parte: Number.isInteger(parte) ? parte : null,
    cita: String(cita || "").slice(0, 600) || null, texto: String(texto || "").trim(), tipo, resuelto: null,
  };
  d.items = [item, ...d.items];
  guardar(d);
  return item;
}

export function resolver(id, valor = true) {
  const d = cargar();
  const it = d.items.find((x) => x.id === id);
  if (!it) throw new Error("No existe");
  it.resuelto = valor ? new Date().toISOString() : null;
  guardar(d);
  return it;
}

export function quitar(id) {
  const d = cargar();
  d.items = d.items.filter((x) => x.id !== id);
  guardar(d);
}
