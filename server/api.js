// API local de Glim. Lee el cerebro en cada petición, sin caché, para reflejar siempre el disco.
// Escribe solo en: <cerebro>/.glim/ (estado local), las referencias, los lienzos y los aprendizajes del cerebro, y las
// carpetas de medios de referencias (subidas, previas y copias de páginas). Rutas en glim.config.json.
// Se monta igual en el servidor de Vite (desarrollo) y en el servidor propio de la app (server/servidor.js).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ROOT, MIME, safe, read, mtime, hoyLocal } from "./repo.js";
import { posts } from "./posts.js";
import { media, plantillas, carruseles, marcas, ogs, skills, docs, feedback } from "./catalog.js";
import * as encargos from "./encargos.js";
import * as refs from "./referencias.js";
import * as analisis from "./analisis.js";
import * as lectores from "./lectores.js";
import * as copias from "./archivo.js";
import * as herramientas from "./herramientas.js";
import * as secciones from "./secciones.js";
import * as nav from "./navegador.js";
import * as lz from "./lienzos.js";
import * as icono from "./icono.js";
import * as pub from "./publicar.js";
import * as agentesMod from "./agentes.js";
import * as reg from "./registro.js";
import * as vivo from "./vivo.js";
import * as buffer from "./buffer.js";
import * as borradores from "./borradores.js";
import * as rev from "./revisiones.js";
import * as kitMod from "./kit.js";
import * as aj from "./ajustes.js";
import * as dub from "./dub.js";
import * as cerebro from "./cerebro.js";

const FEEDBACK = path.join(cerebro.ESTADO, "feedback");

async function claves() {
  const [buffer, dubK] = await Promise.all([aj.hayClave("buffer"), aj.hayClave("dub")]);
  return { buffer, dub: dubK };
}

async function overview() {
  const hoy = hoyLocal();
  const ajustes = aj.ajustes();
  const mapa = dub.enlaces();
  const m = media();
  const { posts: cruzados, soloBuffer } = buffer.cruzar(posts(hoy));
  for (const p of cruzados) {
    p.enlaces = mapa[p.id] || [];
    if (p.enlacesCortos === null) p.enlacesCortos = ajustes.dub.activo && ajustes.dub.porDefecto;
  }
  const b = buffer.estado();
  return {
    generado: new Date().toISOString(),
    hoy,
    raiz: ROOT,
    posts: cruzados,
    buffer: { conectado: b.conectado, motivo: b.motivo || null, error: b.error || null, sincronizado: b.sincronizado || null, restantes: b.restantes ?? null, canales: b.canales || [], soloBuffer, total: (b.posts || []).length, autoPublicados: b.autoPublicados || [], completo: !!b.completo, reconciliacion: b.reconciliacion ? { enlazados: b.reconciliacion.enlazados, actualizados: (b.reconciliacion.actualizados || []).length, creados: (b.reconciliacion.creados || []).length, devueltos: (b.reconciliacion.devueltos || []).length, error: b.reconciliacion.error || null, omitido: b.reconciliacion.omitido || null, cuando: b.reconciliacion.cuando } : null },
    plantillas: plantillas(m),
    carruseles: carruseles(),
    marcas: marcas(),
    ogs: ogs(m),
    media: m,
    skills: skills(),
    docs: docs(),
    feedback: feedback(),
    referencias: refs.referencias(),
    vistasRef: refs.vistas(),
    lienzos: lz.lienzos(),
    estudios: refs.estudios(),
    registro: reg.registro(),
    revisiones: rev.revisiones(),
    kit: kitMod.kit(),
    ajustes,
    claves: await claves(),
    cerebro: cerebro.resumen(),
    secciones: secciones.resumen(),
  };
}

function sendFile(req, res, abs) {
  let st;
  try { st = fs.statSync(abs); } catch { res.statusCode = 404; return res.end("no existe"); }
  if (st.isDirectory()) { res.statusCode = 404; return res.end("es una carpeta"); }
  res.setHeader("Content-Type", MIME[path.extname(abs).toLowerCase()] || "text/plain; charset=utf-8");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "no-cache");
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
  if (range) {
    const start = range[1] ? parseInt(range[1], 10) : 0;
    const end = range[2] ? Math.min(parseInt(range[2], 10), st.size - 1) : st.size - 1;
    if (start > end || start >= st.size) { res.statusCode = 416; res.setHeader("Content-Range", `bytes */${st.size}`); return res.end(); }
    res.statusCode = 206;
    res.setHeader("Content-Range", `bytes ${start}-${end}/${st.size}`);
    res.setHeader("Content-Length", end - start + 1);
    return fs.createReadStream(abs, { start, end }).pipe(res);
  }
  res.setHeader("Content-Length", st.size);
  fs.createReadStream(abs).pipe(res);
}

const json = (res, data, code = 200) => {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
};

function body(req, limit = 80e6) {
  return new Promise((resolve, reject) => {
    let b = "";
    req.on("data", (c) => { b += c; if (b.length > limit) { reject(new Error("Demasiado grande")); req.destroy(); } });
    req.on("end", () => { try { resolve(b ? JSON.parse(b) : {}); } catch { reject(new Error("JSON no válido")); } });
  });
}

// Las peticiones que escriben o lanzan a Claude solo valen desde el propio panel: mismo host local y mismo origen,
// con JSON. Así otra web abierta en el navegador no puede crear encargos (CSRF) ni colarse por rebinding de DNS.
function permitido(req) {
  const host = String(req.headers.host || "");
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) return false;
  const origin = req.headers.origin;
  if (origin && origin !== `http://${host}`) return false;
  return /application\/json/.test(req.headers["content-type"] || "") && req.headers["x-panel"] === "1";
}

const RUTAS = [
  ["GET", /^\/api\/cerebro$/, () => cerebro.resumen()],
  ["GET", /^\/api\/encargos$/, () => ({ encargos: encargos.resumenLista(), ocupado: encargos.ocupado(), enMarcha: encargos.enMarcha(), publicados: buffer.estado().autoPublicados || [] })],
  ["GET", /^\/api\/encargos\/([a-z0-9-]+)$/, (_, [id]) => {
    const e = encargos.leer(id);
    if (!e) throw Object.assign(new Error("No existe"), { code: 404 });
    return { encargo: e, eventos: encargos.eventos(id), terminal: encargos.comandoTerminal(e), contexto: e.rondas[0].prompt || encargos.prompt(e) };
  }],
  ["POST", /^\/api\/encargos$/, (b) => ({ encargo: encargos.crear(b) })],
  ["POST", /^\/api\/encargos\/contexto$/, (b) => ({ contexto: encargos.prompt({ objetivo: b.objetivo, texto: b.texto || "(tu indicación)", plantilla: b.plantilla, referencias: b.referencias, preset: b.preset, firma: b.firma }) })],
  ["POST", /^\/api\/encargos\/([a-z0-9-]+)\/lanzar$/, (_, [id]) => ({ encargo: encargos.lanzar(id) })],
  ["POST", /^\/api\/encargos\/([a-z0-9-]+)\/otra-vuelta$/, (b, [id]) => ({ encargo: encargos.otraVuelta(id, b.texto) })],
  ["POST", /^\/api\/encargos\/([a-z0-9-]+)\/estado$/, (b, [id]) => ({ encargo: encargos.marcar(id, b.estado) })],
  ["POST", /^\/api\/encargos\/([a-z0-9-]+)\/detener$/, (_, [id]) => ({ ok: encargos.detener(id) })],
  ["GET", /^\/api\/encargos\/([a-z0-9-]+)\/copia$/, (_, [id]) => encargos.cambiosCopia(id)],
  ["POST", /^\/api\/encargos\/([a-z0-9-]+)\/aplicar$/, (_, [id]) => ({ encargo: encargos.aplicarCopia(id) })],
  ["POST", /^\/api\/referencias$/, async (b) => ({ referencia: await refs.anadir(b) })],
  ["POST", /^\/api\/referencias\/leer$/, async (b) => ({ leido: await lectores.leer(String(b.url || "").trim()) })],
  ["POST", /^\/api\/referencias\/(ref-[a-z0-9-]+)\/copia$/, async (_, [id]) => ({ copia: await refs.guardarCopia(id) })],
  ["POST", /^\/api\/referencias\/abrir-copia$/, (b) => copias.abrir(b.ruta, b.titulo)],
  ["GET", /^\/api\/lectores$/, () => nav.sesiones()],
  ["POST", /^\/api\/lectores\/(\w+)\/entrar$/, (_, [id]) => nav.iniciarSesion(id)],
  ["POST", /^\/api\/lectores\/(\w+)\/salir$/, (_, [id]) => nav.cerrarSesion(id)],
  ["POST", /^\/api\/lienzos$/, (b) => ({ lienzo: lz.crear(b) })],
  ["POST", /^\/api\/lienzos\/(lz-[a-z0-9]+)$/, (b, [id]) => ({ lienzo: lz.guardar(id, b) })],
  ["POST", /^\/api\/lienzos\/(lz-[a-z0-9]+)\/quitar$/, (_, [id]) => (lz.quitar(id), { ok: true })],
  ["POST", /^\/api\/referencias\/metadatos$/, async (b) => ({ metadatos: await refs.metadatos(String(b.url || "").trim()) })],
  ["POST", /^\/api\/referencias\/valorar$/, (b) => ({ valoracion: refs.valorar(String(b.id || ""), b.valoracion) })],
  ["POST", /^\/api\/referencias\/fusionar$/, (b) => ({ referencia: refs.fusionar(String(b.queda || ""), String(b.sale || "")) })],
  ["POST", /^\/api\/referencias\/vistas$/, (b) => ({ vista: refs.guardarVista(b) })],
  ["POST", /^\/api\/referencias\/vistas\/(vista-[a-z0-9]+)\/quitar$/, (_, [id]) => (refs.quitarVista(id), { ok: true })],
  ["POST", /^\/api\/referencias\/(pd-[^/]+)\/fijar$/, (b, [id]) => ({ referencia: refs.fijar(decodeURIComponent(id), b.notas) })],
  ["POST", /^\/api\/referencias\/(ref-[a-z0-9-]+)$/, (b, [id]) => ({ referencia: refs.editar(id, b) })],
  ["POST", /^\/api\/referencias\/(ref-[a-z0-9-]+)\/quitar$/, (_, [id]) => (refs.quitar(id), { ok: true })],
  ["POST", /^\/api\/buffer\/sincronizar$/, async () => { const b = await buffer.sincronizar(); return { conectado: b.conectado, error: b.error || null, motivo: b.motivo || null, total: (b.posts || []).length }; }],
  ["POST", /^\/api\/posts\/([\w.-]+)\/fecha$/, (b, [id]) => borradores.moverFecha(id, b.dia)],
  ["GET", /^\/api\/ajustes$/, async () => ({ ajustes: aj.ajustes(), claves: await claves() })],
  // Los ajustes viven en .glim/, que el vigilante del repo ignora: se avisa aparte para que la ventana principal los
  // aplique al momento cuando se cambian desde la ventana de Ajustes (sonidos, tema, densidad…).
  ["POST", /^\/api\/ajustes$/, async (b) => { const a = aj.guardar(b); if (b.icono) await icono.aplicar().catch((e) => console.warn("[panel] icono:", e.message)); emitir("ajustes:cambio"); return { ajustes: a }; }],
  ["POST", /^\/api\/ajustes\/restablecer$/, async () => { const a = aj.restablecer(); await icono.aplicar().catch(() => {}); emitir("ajustes:cambio"); return { ajustes: a }; }],
  ["POST", /^\/api\/icono\/vista$/, async (b) => { const g = await icono.generar({ tinta: b.tinta, glifo: b.glifo }); return { ruta: g.rel }; }],
  ["POST", /^\/api\/sistema\/reiniciar$/, () => vivo.reiniciar(encargos.ocupado())],
  ["POST", /^\/api\/sistema\/abrir$/, (b) => vivo.abrirCarpeta(b.que)],
  ["POST", /^\/api\/ajustes\/clave$/, async (b) => {
    await aj.guardarClave(b.servicio, b.clave);
    if (b.servicio === "buffer") { const r = await buffer.sincronizar(); return { ok: !r.error, error: r.error || null }; }
    try { await dub.probar(); return { ok: true }; } catch (e) { return { ok: false, error: String(e.message || e) }; }
  }],
  ["POST", /^\/api\/ajustes\/clave\/borrar$/, async (b) => (await aj.borrarClave(b.servicio), { ok: true })],
  ["POST", /^\/api\/ajustes\/probar$/, async (b) => {
    try { if (b.servicio === "buffer") { const r = await buffer.sincronizar(); return { ok: !r.error, error: r.error || null }; } await dub.probar(); return { ok: true }; }
    catch (e) { return { ok: false, error: String(e.message || e) }; }
  }],
  ["POST", /^\/api\/posts\/([\w.-]+)\/enlaces$/, async (b, [id]) => {
    dub.activar(id, !!b.activo);
    if (!b.activo || !aj.ajustes().dub.activo) return { ok: true };
    const p = posts(hoyLocal()).find((x) => x.id === id);
    return { ok: true, enlaces: await dub.crear(p) };
  }],
  ["POST", /^\/api\/posts\/([\w.-]+)\/enlaces\/crear$/, async (_, [id]) => ({ enlaces: await dub.crear(posts(hoyLocal()).find((x) => x.id === id)) })],
  ["POST", /^\/api\/posts\/([\w.-]+)\/enlaces\/clics$/, async (_, [id]) => ({ enlaces: await dub.clics(id) })],
  ["POST", /^\/api\/kit\/firma$/, (b) => ({ firma: kitMod.guardarFirma(b) })],
  ["POST", /^\/api\/kit\/preset$/, (b) => ({ preset: kitMod.guardarPreset(b) })],
  ["POST", /^\/api\/kit\/(firma|preset)\/([\w-]+)\/quitar$/, (_, [tipo, id]) => (kitMod.quitar(tipo, id), { ok: true })],
  ["POST", /^\/api\/revisiones$/, (b) => ({ revision: rev.anadir(b) })],
  ["POST", /^\/api\/revisiones\/(rev-[a-z0-9]+)\/resolver$/, (b, [id]) => ({ revision: rev.resolver(id, b.valor !== false) })],
  ["POST", /^\/api\/revisiones\/(rev-[a-z0-9]+)\/quitar$/, (_, [id]) => (rev.quitar(id), { ok: true })],
  ["GET", /^\/api\/sistema$/, () => vivo.estado(false)],
  ["POST", /^\/api\/sistema\/comprobar$/, () => vivo.estado(true)],
  ["POST", /^\/api\/sistema\/traer$/, () => vivo.traer(encargos.ocupado())],
  ["POST", /^\/api\/sistema\/npm$/, () => vivo.instalarDependencias()],
  ["GET", /^\/api\/secciones\/([a-z0-9-]+)$/, (_, [id]) => secciones.contenido(id)],
  ["GET", /^\/api\/sistema\/herramientas$/, () => herramientas.estado(false)],
  ["POST", /^\/api\/sistema\/herramientas$/, () => herramientas.estado(true)],
  ["GET", /^\/api\/agentes$/, async () => ({ agentes: await agentesMod.disponibles(false), elegido: aj.ajustes().agente })],
  ["POST", /^\/api\/agentes\/buscar$/, async () => ({ agentes: await agentesMod.disponibles(true), elegido: aj.ajustes().agente })],
  ["GET", /^\/api\/actualizacion$/, () => vivo.actualizacion(false)],
  ["POST", /^\/api\/actualizacion\/comprobar$/, () => vivo.actualizacion(true)],
  ["POST", /^\/api\/actualizacion\/aplicar$/, (b) => vivo.actualizar(encargos.ocupado(), { relanzar: !!b.relanzar })],
  ["GET", /^\/api\/novedades$/, () => ({ version: vivo.version(), novedades: vivo.novedades() })],
  ["GET", /^\/api\/publicar$/, async () => ({ actual: pub.estado(), cambios: await pub.cambios(), historial: pub.lista() })],
  ["POST", /^\/api\/publicar$/, () => { pub.publicar().catch((e) => console.warn("[panel] publicar:", e.message)); return { ok: true }; }],
  ["POST", /^\/api\/publicar\/comprobar$/, () => pub.comprobarAntes()],
  ["POST", /^\/api\/publicar\/cancelar$/, () => pub.cancelarFusion()],
  ["POST", /^\/api\/sistema\/app$/, () => vivo.reinstalarApp(encargos.ocupado())],
  ["POST", /^\/api\/registro$/, (b) => {
    const entrada = reg.anadir(b);
    if (b.encargo && b.decision !== undefined) encargos.registrada(b.encargo, b.decision);
    return { entrada };
  }],
];

// ---- Eventos hacia la ventana (Server-Sent Events en /api/eventos) ----
const clientes = new Set();
export function emitir(evento, datos = {}) {
  const msg = `event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`;
  for (const r of clientes) { try { r.write(msg); } catch { clientes.delete(r); } }
}
function suscribir(req, res) {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" });
  res.write(": hola\n\n");
  clientes.add(res);
  const latido = setInterval(() => res.write(": latido\n\n"), 25000);
  req.on("close", () => { clearInterval(latido); clientes.delete(res); });
}

// ---- Acceso ----
// Solo desde este equipo: el host tiene que ser 127.0.0.1 o localhost (contra el rebinding de DNS). Con GLIM_TOKEN
// (lo pone la app al arrancar, aleatorio en cada arranque), además, toda petición a /api y /repo lleva el token en
// la cookie glim_token o en la cabecera x-glim-token: otro programa del equipo no puede leer el cerebro.
const TOKEN = process.env.GLIM_TOKEN || null;
function autorizado(req) {
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(String(req.headers.host || ""))) return false;
  if (!TOKEN) return true;
  const ck = /(?:^|;\s*)glim_token=([^;]+)/.exec(req.headers.cookie || "");
  const t = String(req.headers["x-glim-token"] || (ck && decodeURIComponent(ck[1])) || "");
  return t.length === TOKEN.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(TOKEN));
}

export async function manejar(req, res, next) {
  const url = new URL(req.url, "http://localhost");
  const esApi = url.pathname.startsWith("/api/") || url.pathname.startsWith("/repo/");
  if (!esApi) return next();
  if (!autorizado(req)) return json(res, { error: "sin acceso" }, 401);
  if (url.pathname === "/api/eventos") return suscribir(req, res);
  if (url.pathname === "/api/overview") return json(res, await overview());
  if (url.pathname === "/api/file") {
    const f = safe(url.searchParams.get("path"));
    if (!f) return json(res, { error: "ruta no permitida" }, 403);
    const text = read(f.rel);
    return text === null ? json(res, { error: "no existe" }, 404) : json(res, { path: f.rel, text, mtime: mtime(f.rel) });
  }
  if (url.pathname === "/api/feedback" && req.method === "POST") {
    if (!permitido(req)) return json(res, { error: "solo desde el panel" }, 403);
    try {
      const { output, page } = await body(req, 2e6);
      fs.mkdirSync(FEEDBACK, { recursive: true });
      const name = new Date().toISOString().replace(/[:.]/g, "-") + ".md";
      fs.writeFileSync(path.join(FEEDBACK, name), `<!-- página: ${String(page || "").slice(0, 300)} -->\n\n${String(output || "")}\n`);
      return json(res, { ok: true, file: `.glim/feedback/${name}` });
    } catch (e) { return json(res, { error: String(e.message || e) }, 400); }
  }
  for (const [method, re, fn] of RUTAS) {
    const m = re.exec(url.pathname);
    if (!m || req.method !== method) continue;
    if (method !== "GET" && !permitido(req)) return json(res, { error: "solo desde el panel" }, 403);
    try {
      const b = method === "POST" ? await body(req) : {};
      return json(res, await fn(b, m.slice(1)));
    } catch (e) { return json(res, { error: String(e.message || e) }, typeof e.code === "number" ? e.code : 400); }
  }
  if (url.pathname.startsWith("/repo/")) {
    // safe() comprueba que la ruta no sale del cerebro ni cae en lo privado.
    const f = safe(decodeURIComponent(url.pathname.slice(6)));
    if (!f) { res.statusCode = 403; return res.end("ruta no permitida"); }
    return sendFile(req, res, f.abs);
  }
  return json(res, { error: "no existe" }, 404);
}

// Tareas de fondo: vigilar el cerebro, Buffer, análisis de referencias, icono. Devuelve la función que las para.
export function arrancar({ reiniciar } = {}) {
  const parar = vivo.vigilar({ emitir, reiniciar });
  pub.alCambiar(() => emitir("panel:publicar"));
  const t = setTimeout(() => icono.aplicar().catch((e) => console.warn("[glim] icono:", e.message)), 1200);
  t.unref?.();
  analisis.alAcabar(() => emitir("repo:cambio", { archivos: ["analisis"] }));
  buffer.arrancar(() => emitir("repo:cambio", { archivos: ["buffer"] }));
  return () => { parar(); clearTimeout(t); for (const r of clientes) r.end(); clientes.clear(); };
}

// Plugin de Vite (desarrollo): monta la API en el servidor de Vite.
export function repoApi() {
  return {
    name: "glim-api",
    configureServer(server) {
      const parar = arrancar({ reiniciar: () => server.restart() });
      server.httpServer && server.httpServer.on("close", parar);
      server.middlewares.use((req, res, next) => manejar(req, res, next).catch(next));
    },
  };
}
