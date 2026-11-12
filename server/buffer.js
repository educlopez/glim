// Buffer en el panel: SOLO LECTURA hacia Buffer; el repo se reconcilia con lo que hay allí (reconciliar.js). Trae lo programado, enviado, en borrador o con error para cruzarlo con los
// borradores del repo. No crea, edita ni programa nada (reglas 1 y 2 de AGENTS.md).
// La clave nunca está en el repo ni llega al navegador: variable BUFFER_API_KEY o Llavero de macOS
// (servicio "<llavero>-buffer"). Caché en <cerebro>/.glim/buffer.json (ignorado por git).
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./repo.js";
import { ESTADO, rutas, enZona } from "./cerebro.js";
import { ajustes, leerClave } from "./ajustes.js";
import { reconciliar } from "./reconciliar.js";

const API = "https://api.buffer.com";
const CACHE = path.join(ESTADO, "buffer.json");

let cache = (() => { try { return JSON.parse(fs.readFileSync(CACHE, "utf8")); } catch { return null; } })();
let enCurso = null;
const GEN_MODULO = (globalThis.__panelBufferMod = (globalThis.__panelBufferMod || 0) + 1);
// Solo la versión más reciente de este módulo escribe en el repo.
const esVigente = () => globalThis.__panelBufferMod === GEN_MODULO;
let avisar = () => {};

const clave = () => leerClave("buffer");

async function gql(key, query, variables) {
  const r = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20000),
  });
  // Peticiones que quedan hoy (la ventana de 24 h, w=86400): si bajan mucho, se sincroniza menos.
  const rl = r.headers.get("ratelimit") || "";
  const pol = (r.headers.get("ratelimit-policy") || "").split(/,\s*(?=")/);
  const dia = pol.findIndex((p) => /w=86400/.test(p));
  const restantes = dia >= 0 ? Number((rl.split(/,\s*(?=")/)[dia] || "").match(/r=(\d+)/)?.[1]) : null;
  if (r.status === 429) throw Object.assign(new Error("Buffer: límite de peticiones alcanzado"), { restantes: 0 });
  if (r.status === 401 || r.status === 403) throw new Error("Buffer rechaza la clave (401/403). Genera otra en publish.buffer.com/settings/api");
  const j = await r.json().catch(() => ({}));
  if (j.errors && j.errors.length) throw new Error(`Buffer: ${j.errors.map((e) => e.message).join(" · ").slice(0, 300)}`);
  return { data: j.data, restantes };
}

const Q_ORG = `query { account { organizations { id name } } }`;
const Q_CANALES = `query Canales($org: OrganizationId!) { channels(input: { organizationId: $org }) { id name displayName service avatar isQueuePaused } }`;
// Sin startDate: probado el 12-nov-2026, con ese filtro la API devuelve 0 posts aunque los haya.
// Se descarga TODO (todas las páginas): el repo se reconcilia con Buffer y no puede faltar nada (reconciliar.js).
const Q_POSTS = `query Posts($org: OrganizationId!, $after: String) {
  posts(first: 100, after: $after, input: { organizationId: $org, filter: { status: [draft, scheduled, sending, sent, error, needs_approval] }, sort: [{ field: dueAt, direction: desc }] }) {
    pageInfo { endCursor hasNextPage }
    edges { node { id text status dueAt sentAt createdAt externalLink channelId channelService error { message } metrics { type name value unit } metricsUpdatedAt } }
  }
}`;

async function sincronizarYa() {
  const key = await clave();
  if (!key) {
    cache = { conectado: false, motivo: "sin-clave", sincronizado: null, posts: [], canales: [] };
    return cache;
  }
  try {
    // Organización y canales cambian poco: se reutilizan 24 h.
    let org = cache && cache.org;
    let canales = cache && cache.canales;
    let restantes = null;
    if (!org || !canales || Date.now() - new Date(cache.metaEn || 0).getTime() > 86400e3) {
      const a = await gql(key, Q_ORG);
      org = a.data.account.organizations[0];
      if (!org) throw new Error("La cuenta de Buffer no tiene organizaciones");
      const c = await gql(key, Q_CANALES, { org: org.id });
      canales = c.data.channels.map((x) => ({ id: x.id, nombre: x.displayName || x.name, servicio: x.service, pausado: x.isQueuePaused }));
      restantes = c.restantes;
      cache = { ...(cache || {}), metaEn: new Date().toISOString() };
    }
    const posts = [];
    let after = null;
    let completo = false;
    for (let i = 0; i < 40; i++) {
      const r = await gql(key, Q_POSTS, { org: org.id, after });
      restantes = r.restantes ?? restantes;
      for (const { node: n } of r.data.posts.edges) {
        const canal = canales.find((c) => c.id === n.channelId);
        posts.push({
          id: n.id, estado: n.status, dueAt: n.dueAt, sentAt: n.sentAt, creado: n.createdAt, enlace: n.externalLink || null,
          texto: String(n.text || ""), servicio: n.channelService,
          // La API da el enlace de X con el id numérico de la cuenta; con el @ del canal se lee mejor.
          ...(n.channelService === "twitter" && n.externalLink && canal ? { enlace: n.externalLink.replace(/x\.com\/\d+\/status/, `x.com/${canal.nombre}/status`) } : {}), canal: canal ? canal.nombre : n.channelId,
          error: n.error ? n.error.message : null,
          // Métricas que Buffer refresca una vez al día (pueden ir ~24 h por detrás de la red).
          metricas: (n.metrics || []).filter((m) => m.value > 0 || ["impressions", "reactions", "comments", "reposts"].includes(m.type)).map((m) => ({ tipo: m.type, nombre: m.name, valor: m.value, unidad: m.unit })),
          metricasEn: n.metricsUpdatedAt || null,
        });
      }
      if (!r.data.posts.pageInfo.hasNextPage) { completo = true; break; }
      after = r.data.posts.pageInfo.endCursor;
    }
    const recientes = posts;
    cache = { ...cache, conectado: true, completo, motivo: null, error: null, org: { id: org.id, name: org.name }, canales, posts: recientes, restantes, sincronizado: new Date().toISOString() };
  } catch (e) {
    cache = { ...(cache || { posts: [], canales: [] }), motivo: null, conectado: !!(cache && cache.posts && cache.posts.length), error: String(e.message || e), intentado: new Date().toISOString() };
  }
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2));
  // Tras cada descarga completa, el repo se pone igual que Buffer (borradores y calendario).
  try { if (ajustes().buffer.autoPublicar && cache.completo && esVigente()) { cache.reconciliacion = reconciliar(cache); fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2)); } } catch (e) { console.warn("[panel] reconciliar:", e.message); cache.reconciliacion = { error: e.message, cuando: new Date().toISOString() }; }
  avisar();
  return cache;
}

export function sincronizar() {
  if (!enCurso) enCurso = sincronizarYa().finally(() => { enCurso = null; });
  return enCurso;
}

// Al arrancar y cada 10 min. Si quedan menos de 60 peticiones hoy, se salta la vuelta (deja margen al MCP).
// Generación del servidor: Vite vuelve a cargar este módulo en cada reinicio, pero los temporizadores del módulo
// anterior siguen vivos en el mismo proceso. Sin esto, varias versiones del código sincronizaban (y escribían en el
// repo) a la vez. Cada arranque sube la generación y los temporizadores viejos se paran solos.
export function arrancar(onCambio) {
  const gen = (globalThis.__panelBufferGen = (globalThis.__panelBufferGen || 0) + 1);
  const vigente = () => globalThis.__panelBufferGen === gen;
  if (onCambio) avisar = onCambio;
  setTimeout(() => { if (vigente()) sincronizar(); }, 2000);
  // Cada minuto mira si toca (el intervalo se cambia en Ajustes sin reiniciar).
  const i = setInterval(() => {
    if (!vigente()) return clearInterval(i);
    const cada = ajustes().buffer.cadaMin * 60000;
    const ultima = cache && (cache.sincronizado || cache.intentado) ? new Date(cache.sincronizado || cache.intentado).getTime() : 0;
    if (Date.now() - ultima >= cada && (!cache || cache.restantes == null || cache.restantes > 60)) sincronizar();
  }, 60000);
}

export const estado = () => cache || { conectado: false, motivo: "sin-sincronizar", posts: [], canales: [] };

// Cruza Buffer con los borradores: los ids de Buffer anotados en el frontmatter (campo buffer:) unen ambos.
// Día y hora en la zona del cerebro (el campo se sigue llamando «madrid» en los datos del panel).
const madrid = enZona;

// Enlace por texto: muchos posts se programan en Buffer sin apuntar su id en el borrador. Se compara el principio
// del texto de Buffer (sin URLs, sin mayúsculas ni espacios de más) con el texto del borrador; 60+ caracteres
// iguales seguidos cuentan como la misma pieza.
const normal = (t) => String(t || "").replace(/https?:\/\/\S+/g, " ").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
function porTexto(cuerpo, postsBuffer, usados) {
  const c = normal(cuerpo);
  if (c.length < 60) return [];
  return postsBuffer.filter((x) => {
    if (usados && usados.has(x.id)) return false;
    const t = normal(x.texto);
    if (t.length < 60) return false;
    return c.includes(t.slice(0, Math.min(120, t.length)));
  });
}

export function cruzar(posts) {
  const b = estado();
  if (!b.posts || !b.posts.length) return { posts, soloBuffer: [] };
  const porId = new Map(b.posts.map((x) => [x.id, x]));
  const canales = new Set((b.canales || []).map((c) => c.id));
  const usados = new Set();
  for (const p of posts) {
    // En el campo buffer: a veces va también el id del canal; no es un post.
    p.buffer.ids = p.buffer.ids.filter((id) => !canales.has(id));
    let reales = p.buffer.ids.map((id) => porId.get(id)).filter(Boolean);
    if (!reales.length && p.estado !== "descartado") {
      reales = porTexto((p.piezas || []).map((x) => x.texto).join("\n"), b.posts, usados);
      p.buffer.porTexto = reales.length > 0;
    }
    reales.forEach((x) => usados.add(x.id));
    p.buffer.reales = reales.map((x) => ({ ...x, madrid: madrid(x.sentAt || x.dueAt) }));
    for (const x of reales) {
      const m = madrid(x.sentAt || x.dueAt);
      const red = { twitter: "X", threads: "Threads", linkedin: "LinkedIn" }[x.servicio] || x.servicio;
      if (x.estado === "sent" && p.estado !== "publicado") p.avisos.push({ nivel: "alto", texto: `Buffer ya lo publicó en ${red} (${m.dia} ${m.hora}). Márcalo como publicado.` });
      if (x.estado === "error") p.avisos.push({ nivel: "alto", texto: `Buffer dio error al publicar en ${red}${x.error ? `: ${x.error}` : ""}.` });
      if (x.estado === "scheduled" && p.fecha && p.fecha.tipo !== "publicado" && m && (p.fecha.dia !== m.dia || (p.fecha.hora && p.fecha.hora !== m.hora)))
        p.avisos.push({ nivel: "medio", texto: `En Buffer (${red}) está para el ${m.dia} a las ${m.hora}; el borrador dice ${p.fecha.dia}${p.fecha.hora ? " " + p.fecha.hora : ""}.` });
      if (x.estado === "scheduled" && p.estado !== "programado" && p.estado !== "publicado") p.avisos.push({ nivel: "medio", texto: `Está programado en Buffer (${red}) pero el borrador sigue en «${p.estado}».` });
    }
    if (reales.length) p.avisos = p.avisos.filter((a) => !/^Sin borrador en Buffer/.test(a.texto));
  }
  // Lo que hay en Buffer y ningún borrador cita: para que el calendario enseñe todo lo que va a salir.
  const soloBuffer = b.posts.filter((x) => !usados.has(x.id) && x.estado !== "sent").map((x) => ({ ...x, madrid: madrid(x.dueAt || x.creado) }));
  return { posts, soloBuffer };
}

// ---- Automático: cuando Buffer confirma que algo salió, el borrador pasa a «publicado» ----
// Solo si TODAS las piezas anotadas en su campo buffer: constan como enviadas. Escribe estado, publicado_el y
// publicado_url (si estaba vacío) y añade una nota; no toca el texto del post. Es lo que pide AGENTS.md
// («Mantener vivo este repo», paso 1) y antes se hacía a mano.
const RED_DE = { twitter: "X", threads: "Threads", linkedin: "LinkedIn" };

function ponerCampo(lineas, fin, clave, valor, despuesDe) {
  const i = lineas.slice(1, fin).findIndex((l) => l.startsWith(`${clave}:`));
  if (i >= 0) { lineas[i + 1] = `${clave}: ${valor}`; return fin; }
  const j = lineas.slice(1, fin).findIndex((l) => l.startsWith(`${despuesDe}:`));
  lineas.splice(j >= 0 ? j + 2 : fin, 0, `${clave}: ${valor}`);
  return fin + 1;
}

export function autoPublicar() {
  const b = estado();
  if (!b.conectado || !b.posts || !b.posts.length) return [];
  const porId = new Map(b.posts.map((x) => [x.id, x]));
  const hechos = [];
  const dir = path.join(ROOT, rutas.borradores);
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".md") && !n.startsWith("_"))) {
    const abs = path.join(dir, f);
    const texto = fs.readFileSync(abs, "utf8");
    const lineas = texto.split("\n");
    if (lineas[0] !== "---") continue;
    let fin = lineas.indexOf("---", 1);
    if (fin < 0) continue;
    const campo = (k) => { const l = lineas.slice(1, fin).find((x) => x.startsWith(`${k}:`)); return l ? l.slice(k.length + 1).trim() : ""; };
    const est = campo("estado").replace(/["']/g, "");
    if (est === "publicado" || est === "descartado") continue;
    const canales = new Set((b.canales || []).map((c) => c.id));
    let ids = (campo("buffer").match(/\b[0-9a-f]{24}\b/g) || []).filter((id) => !canales.has(id));
    let enlazadoPorTexto = false;
    if (!ids.length) {
      const cuerpo = lineas.slice(fin + 1).join("\n").replace(/<!--[\s\S]*?-->/g, "");
      ids = porTexto(cuerpo, b.posts.filter((x) => x.estado === "sent")).map((x) => x.id);
      enlazadoPorTexto = ids.length > 0;
    }
    const reales = ids.map((id) => porId.get(id));
    if (!reales.length || reales.some((x) => !x || x.estado !== "sent")) continue;
    const enviados = reales.map((x) => ({ ...x, m: madrid(x.sentAt || x.dueAt), red: RED_DE[x.servicio] || x.servicio })).sort((a, z) => (a.sentAt || "").localeCompare(z.sentAt || ""));
    const primero = enviados[0].m;
    fin = ponerCampo(lineas, fin, "estado", "publicado");
    fin = ponerCampo(lineas, fin, "publicado_el", `${primero.dia} ${primero.hora} (vía Buffer)`, "programado_para");
    if (!campo("publicado_url") || /^#/.test(campo("publicado_url"))) {
      const urls = enviados.map((x) => (x.enlace ? `${x.enlace} (${x.red}, ${x.m.hora})` : `sin enlace en Buffer (${x.red}, ${x.m.hora})`)).join(" · ");
      fin = ponerCampo(lineas, fin, "publicado_url", urls, "publicado_el");
    }
    const nota = campo("nota_estado");
    const marca = `publicado según Buffer el ${primero.dia} (marcado por el panel)`;
    if (!nota.includes("marcado por el panel")) fin = ponerCampo(lineas, fin, "nota_estado", nota ? `${marca}. Antes: ${nota}` : marca, "estado");
    if (enlazadoPorTexto) fin = ponerCampo(lineas, fin, "buffer", `${enviados.map((x) => `${x.id} (${x.red}, sent)`).join(" · ")}  # enlazado por texto en el panel`, "media");
    const bl = lineas.findIndex((l, i) => i < fin && l.startsWith("buffer:"));
    if (bl > 0) lineas[bl] = lineas[bl].replace(/\bscheduled\b/g, "sent");
    fs.writeFileSync(abs, lineas.join("\n"));
    hechos.push({ path: `${rutas.borradores}/${f}`, cuando: new Date().toISOString(), redes: enviados.map((x) => x.red), dia: primero.dia });
  }
  if (hechos.length) {
    cache.autoPublicados = [...hechos, ...(cache.autoPublicados || [])].slice(0, 30);
    fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2));
  }
  return hechos;
}
