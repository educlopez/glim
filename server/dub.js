// Enlaces cortos con Dub, activables por post. Un enlace por red (con UTM source=x|threads|linkedin), así los clics
// de cada red se cuentan por separado. Crear usa PUT /links/upsert (si el destino ya tiene enlace, Dub devuelve el
// mismo). Los clics salen del propio enlace (campo clicks, GET /links/info), que no exige el plan Pro de Dub.
// Mapa local en dashboard/encargos/enlaces.json y, para que lo vean los agentes, una línea enlaces_dub: en el borrador.
import fs from "node:fs";
import path from "node:path";
import { ESTADO, cfg } from "./cerebro.js";
import { ajustes, leerClave } from "./ajustes.js";
import { abrir } from "./borradores.js";

const API = "https://api.dub.co";
const F = path.join(ESTADO, "enlaces.json");
const URL_RE = /\bhttps?:\/\/[^\s)]+|\b(?:[a-z0-9-]+\.)+(?:com|dev|io|app|ai|net|org|es|co|me|sh|so|xyz|design|studio)(?:\/[^\s)]*)?/gi;
const SOURCE = { X: "x", Threads: "threads", LinkedIn: "linkedin" };

const cargar = () => { try { return JSON.parse(fs.readFileSync(F, "utf8")); } catch { return {}; } };
const guardarMapa = (d) => { fs.mkdirSync(path.dirname(F), { recursive: true }); fs.writeFileSync(F, JSON.stringify(d, null, 2)); };
export const enlaces = cargar;

async function dub(metodo, ruta, body) {
  const key = await leerClave("dub");
  if (!key) throw new Error("Falta la clave de Dub. Añádela en Ajustes.");
  const r = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 || r.status === 403) throw new Error("Dub rechaza la clave (401/403). Revisa la clave en Ajustes.");
  if (!r.ok) throw new Error(`Dub: ${j.error?.message || `HTTP ${r.status}`}`);
  return j;
}

export async function probar() {
  // Cualquier lectura autenticada vale para comprobar la clave.
  await dub("GET", "/links?pageSize=1");
  return { ok: true };
}

const urlsDe = (texto) => [...new Set((String(texto || "").match(URL_RE) || []).map((u) => u.replace(/[.,;:!?]+$/, "")))].filter((u) => !/^(?:https?:\/\/)?(?:dub\.sh|x\.com|t\.co)\//i.test(u));
const destino = (u, red, campana, utm) => {
  const url = new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`);
  if (utm) {
    url.searchParams.set("utm_source", SOURCE[red] || red.toLowerCase());
    url.searchParams.set("utm_medium", "social");
    url.searchParams.set("utm_campaign", campana);
  }
  return url.toString();
};

// Crea (o recupera) los enlaces cortos de todas las URL del post, uno por red.
export async function crear(post) {
  const a = ajustes().dub;
  if (!a.activo) throw new Error("Los enlaces cortos están desactivados en Ajustes.");
  const campana = post.id.slice(11).slice(0, 60);
  const lista = [];
  for (const pz of post.piezas) {
    for (const original of urlsDe(pz.texto)) {
      const j = await dub("PUT", "/links/upsert", { url: destino(original, pz.red, campana, a.utm), ...(a.dominio ? { domain: a.dominio } : {}), comments: `${(cfg.integraciones.dub && cfg.integraciones.dub.comentario) || cfg.nombre} · ${post.id} · ${pz.red}` });
      lista.push({ red: pz.red, original, destino: j.url, corto: j.shortLink, id: j.id, clics: j.clicks || 0, actualizado: new Date().toISOString() });
    }
  }
  if (!lista.length) throw new Error("Este post no tiene enlaces que acortar.");
  const d = cargar();
  d[post.id] = lista;
  guardarMapa(d);
  // En el borrador, para que los agentes y los bots usen el enlace corto al pasar el post a Buffer.
  const b = abrir(post.id);
  b.set("enlaces_dub", lista.map((x) => `${x.red}: ${x.original} → ${x.corto}`).join(" · "), "enlaces_cortos");
  b.guardar();
  return lista;
}

export async function clics(postId) {
  const d = cargar();
  const lista = d[postId] || [];
  for (const x of lista) {
    try { const j = await dub("GET", `/links/info?linkId=${encodeURIComponent(x.id)}`); x.clics = j.clicks || 0; x.actualizado = new Date().toISOString(); } catch (e) { x.error = String(e.message || e); }
  }
  d[postId] = lista;
  guardarMapa(d);
  return lista;
}

// Activa o desactiva los enlaces cortos de un post (campo enlaces_cortos: si | no del borrador).
export function activar(postId, valor) {
  const b = abrir(postId);
  b.set("enlaces_cortos", valor ? "si" : "no", "programado_para");
  b.guardar();
  return { ok: true };
}
