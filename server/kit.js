// Kit de publicación: firmas (cierres reutilizables por red) y presets (redes + formato + plantilla + firma +
// instrucciones de una vez). Ideas de Postiz (model Signatures y model Sets). Vive en
// estrategia/kit-publicacion.json, versionado: también lo usan los agentes al redactar.
import fs from "node:fs";
import path from "node:path";
import { ROOT, read } from "./repo.js";
import { rutas } from "./cerebro.js";

const P = rutas.kitPublicacion || ".glim/kit-publicacion.json";
const REDES = ["X", "Threads", "LinkedIn"];
const cargar = () => { try { const d = JSON.parse(read(P)); return { firmas: d.firmas || [], presets: d.presets || [] }; } catch { return { firmas: [], presets: [] }; } };
const guardar = (d) => fs.writeFileSync(path.join(ROOT, P), JSON.stringify({ version: 1, ...d }, null, 2) + "\n");
const limpio = (s, n = 2000) => String(s || "").trim().slice(0, n);
const redes = (r) => (Array.isArray(r) ? r : []).filter((x) => REDES.includes(x));

export const kit = cargar;

export function guardarFirma({ id, nombre, texto, redes: rs }) {
  if (!limpio(nombre) || !limpio(texto)) throw new Error("La firma necesita nombre y texto");
  const d = cargar();
  const f = { id: id || `firma-${Date.now().toString(36)}`, nombre: limpio(nombre, 80), texto: limpio(texto, 600), redes: redes(rs) };
  d.firmas = id ? d.firmas.map((x) => (x.id === id ? f : x)) : [...d.firmas, f];
  guardar(d);
  return f;
}

export function guardarPreset({ id, nombre, descripcion, redes: rs, idioma, formato, plantilla, firma, instrucciones }) {
  if (!limpio(nombre)) throw new Error("El preset necesita nombre");
  const d = cargar();
  const p = {
    id: id || `preset-${Date.now().toString(36)}`, nombre: limpio(nombre, 80), descripcion: limpio(descripcion, 300), redes: redes(rs),
    idioma: ["es", "en", ""].includes(idioma) ? idioma : "", formato: limpio(formato, 200), plantilla: limpio(plantilla, 80) || null,
    firma: limpio(firma, 80) || null, instrucciones: limpio(instrucciones, 2000),
  };
  d.presets = id ? d.presets.map((x) => (x.id === id ? p : x)) : [...d.presets, p];
  guardar(d);
  return p;
}

export function quitar(tipo, id) {
  const d = cargar();
  if (tipo === "firma") d.firmas = d.firmas.filter((x) => x.id !== id);
  else d.presets = d.presets.filter((x) => x.id !== id);
  guardar(d);
}

// Bloque para el prompt de un encargo.
export function contexto(presetId, firmaId) {
  const d = cargar();
  const p = presetId ? d.presets.find((x) => x.id === presetId) : null;
  const f = (firmaId || (p && p.firma)) ? d.firmas.find((x) => x.id === (firmaId || p.firma)) : null;
  const out = [];
  if (p) out.push(["## Preset que ha elegido", `«${p.nombre}»${p.descripcion ? `: ${p.descripcion}` : ""}`, p.redes.length ? `- Redes: ${p.redes.join(", ")}` : null, p.idioma ? `- Idioma: ${p.idioma}` : null, p.formato ? `- Formato: ${p.formato}` : null, p.plantilla ? `- Plantilla: ${p.plantilla}` : null, p.instrucciones ? `- Instrucciones:\n${p.instrucciones}` : null].filter(Boolean).join("\n"));
  if (f) out.push(["## Firma", `Añade al final de cada pieza${f.redes.length ? ` de ${f.redes.join(", ")}` : ""} este cierre, tal cual (sin hashtags ni emojis extra):`, "", f.texto].join("\n"));
  return out.join("\n\n");
}
