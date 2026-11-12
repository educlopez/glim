// Lienzos: tableros libres para pensar una pieza con referencias, notas y flechas entre ellas (el Canvas de Pond).
// Viven en la ruta `lienzos` del cerebro (por defecto .glim/lienzos.json), versionado como las referencias. Son internos: nunca se publican.
import fs from "node:fs";
import path from "node:path";
import { ROOT, read, hoyLocal } from "./repo.js";
import { rutas } from "./cerebro.js";

const F = rutas.lienzos;
const cargar = () => { try { return JSON.parse(read(F)) || { lienzos: [] }; } catch { return { version: 1, lienzos: [] }; } };
const escribir = (d) => { d.version = 1; fs.mkdirSync(path.dirname(path.join(ROOT, F)), { recursive: true }); fs.writeFileSync(path.join(ROOT, F), JSON.stringify(d, null, 2) + "\n"); };

export const lienzos = () => cargar().lienzos || [];

export function crear({ nombre }) {
  const n = String(nombre || "").trim().slice(0, 60) || "Lienzo sin nombre";
  const d = cargar();
  const l = { id: `lz-${Date.now().toString(36)}`, nombre: n, creado: hoyLocal(), actualizado: new Date().toISOString(), nodos: [], enlaces: [], vista: { x: 0, y: 0, z: 1 } };
  d.lienzos = [l, ...(d.lienzos || [])];
  escribir(d);
  return l;
}

const num = (v, min, max, def = 0) => { const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n * 100) / 100)) : def; };
const TIPOS = new Set(["ref", "nota", "titulo"]);
const COLORES = new Set(["", "amarillo", "naranja", "verde", "azul", "rosa", "gris"]);

// Guarda el lienzo entero. Valida cada nodo y enlace, y descarta enlaces a nodos que ya no existen.
export function guardar(id, b) {
  const d = cargar();
  const l = (d.lienzos || []).find((x) => x.id === id);
  if (!l) throw new Error("No existe");
  if (b.nombre !== undefined) l.nombre = String(b.nombre || "").trim().slice(0, 60) || l.nombre;
  if (Array.isArray(b.nodos)) {
    l.nodos = b.nodos.slice(0, 400).filter((n) => n && TIPOS.has(n.tipo) && /^[\w-]{1,40}$/.test(n.id || "")).map((n) => ({
      id: n.id, tipo: n.tipo, ref: n.tipo === "ref" ? String(n.ref || "").slice(0, 100) : undefined,
      x: num(n.x, -1e5, 1e5), y: num(n.y, -1e5, 1e5), w: num(n.w, 80, 2400, 240), h: num(n.h, 40, 2400, 180),
      texto: n.tipo !== "ref" || n.texto ? String(n.texto || "").slice(0, 4000) : undefined, color: COLORES.has(n.color) ? n.color || undefined : undefined,
    }));
  }
  if (Array.isArray(b.enlaces)) {
    const ids = new Set(l.nodos.map((n) => n.id));
    l.enlaces = b.enlaces.slice(0, 800).filter((e) => e && ids.has(e.de) && ids.has(e.a) && e.de !== e.a).map((e) => ({ id: String(e.id || `e-${e.de}-${e.a}`).slice(0, 60), de: e.de, a: e.a, texto: e.texto ? String(e.texto).slice(0, 80) : undefined }));
  }
  if (b.vista) l.vista = { x: num(b.vista.x, -1e6, 1e6), y: num(b.vista.y, -1e6, 1e6), z: num(b.vista.z, 0.1, 4, 1) };
  l.actualizado = new Date().toISOString();
  escribir(d);
  return l;
}

export function quitar(id) {
  const d = cargar();
  const antes = (d.lienzos || []).length;
  d.lienzos = (d.lienzos || []).filter((x) => x.id !== id);
  if (d.lienzos.length === antes) throw new Error("No existe");
  escribir(d);
}
