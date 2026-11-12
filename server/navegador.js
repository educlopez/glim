// Navegador interno del panel: ventanas de Chromium (Electron) abiertas desde el servidor, que corre en el mismo
// proceso que la app de Mac. Lo usan los lectores de plataformas y el archivo de páginas.
// Sesión propia y persistente («persist:lectores»), separada de tu Chrome: tú inicias sesión en cada sitio en una
// ventana visible y el panel nunca ve ni guarda contraseñas. Solo se consulta si hay sesión, nunca el valor de una cookie.
// Fuera de la app (npm run dev en un navegador) no hay Electron: los lectores usan solo yt-dlp y la lectura simple.

const PARTICION = "persist:lectores";
export const SITIOS = {
  x: { nombre: "X", login: "https://x.com/login", dominio: "x.com", cookie: "auth_token" },
  instagram: { nombre: "Instagram y Threads", login: "https://www.instagram.com/accounts/login/", dominio: "instagram.com", cookie: "sessionid" },
  linkedin: { nombre: "LinkedIn", login: "https://www.linkedin.com/login", dominio: "linkedin.com", cookie: "li_at" },
  pinterest: { nombre: "Pinterest", login: "https://www.pinterest.com/login/", dominio: "pinterest.com", cookie: "_auth" },
  dribbble: { nombre: "Dribbble", login: "https://dribbble.com/session/new", dominio: "dribbble.com", cookie: "_dribbble_session" },
};

// La API de Electron la deja main.mjs en globalThis. Nunca se importa "electron" desde aquí: desde el repo resolvería
// al paquete npm, que al cargarse lanza su instalador con el binario de la app y bloquea el proceso.
async function el() {
  const e = globalThis.panelElectron;
  return e && e.BrowserWindow && e.session ? e : null;
}
export const disponible = async () => !!(await el());

export async function sesion() {
  const e = await el();
  return e ? e.session.fromPartition(PARTICION) : null;
}

// Qué sitios tienen sesión iniciada (solo sí o no).
export async function sesiones() {
  const s = await sesion();
  const out = {};
  for (const [id, x] of Object.entries(SITIOS)) {
    if (!s) { out[id] = { nombre: x.nombre, conectado: false }; continue; }
    const c = await s.cookies.get({ domain: x.dominio, name: x.cookie }).catch(() => []);
    out[id] = { nombre: x.nombre, conectado: c.some((k) => !k.expirationDate || k.expirationDate * 1000 > Date.now()) };
  }
  return { disponible: !!s, sitios: out };
}

// Abre una ventana visible para que Edu inicie sesión a mano. Se cierra sola al cerrar la ventana.
export async function iniciarSesion(id) {
  const e = await el();
  if (!e) throw new Error("Solo desde la app de Mac");
  const x = SITIOS[id];
  if (!x) throw new Error("Sitio no válido");
  const w = new e.BrowserWindow({ width: 520, height: 760, title: `Iniciar sesión en ${x.nombre} · lectores del panel`, webPreferences: { partition: PARTICION, sandbox: true, contextIsolation: true } });
  w.loadURL(x.login);
  return { ok: true };
}

export async function cerrarSesion(id) {
  const s = await sesion();
  const x = SITIOS[id];
  if (!s || !x) throw new Error("Sitio no válido");
  const cs = await s.cookies.get({ domain: x.dominio });
  await Promise.all(cs.map((c) => s.cookies.remove(`https://${c.domain.replace(/^\./, "")}${c.path}`, c.name).catch(() => {})));
  return { ok: true };
}

// Pausa mínima entre visitas al mismo dominio, para no parecer un robot ni cargar al sitio.
const ultimaVisita = {};
async function turno(u) {
  let host = "";
  try { host = new URL(u).hostname.replace(/^www\./, ""); } catch {}
  const espera = (ultimaVisita[host] || 0) + 5000 - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  ultimaVisita[host] = Date.now();
}

let cola = Promise.resolve();
// Carga una URL en una ventana oculta, espera a que se calme, ejecuta fn(ventana) y la cierra. Una ventana a la vez.
export function conVentana(url, fn, { ancho = 1280, alto = 900, js = true, espera = 2500 } = {}) {
  const tarea = cola.then(async () => {
    const e = await el();
    if (!e) throw new Error("Solo desde la app de Mac");
    await turno(url);
    const w = new e.BrowserWindow({ show: false, width: ancho, height: alto, enableLargerThanScreen: true, webPreferences: { partition: PARTICION, sandbox: true, contextIsolation: true, javascript: js, backgroundThrottling: false, offscreen: false } });
    w.webContents.setAudioMuted(true);
    w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    try {
      await Promise.race([w.loadURL(url), new Promise((_, rej) => setTimeout(() => rej(new Error("La página tarda demasiado")), 30000))]).catch((err) => { if (!/ERR_ABORTED/.test(String(err))) throw err; });
      await new Promise((r) => setTimeout(r, espera));
      return await fn(w);
    } finally { if (!w.isDestroyed()) w.destroy(); }
  });
  cola = tarea.catch(() => {});
  return tarea;
}

// Descarga un recurso con la sesión de los lectores (algunas CDN piden las cookies del sitio).
export async function descargar(url, maxBytes = 60e6) {
  const s = await sesion();
  const r = s && s.fetch ? await s.fetch(url, { headers: { Referer: url } }) : await fetch(url);
  if (!r.ok) throw new Error(`Descarga ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > maxBytes) throw new Error("Demasiado grande");
  return { buf, tipo: (r.headers.get("content-type") || "").split(";")[0] };
}

// Cookies de la sesión de lectores en formato Netscape, para pasárselas a yt-dlp en un archivo temporal (600).
export async function cookiesNetscape(dominio) {
  const s = await sesion();
  if (!s) return null;
  const cs = await s.cookies.get({ domain: dominio }).catch(() => []);
  if (!cs.length) return null;
  return "# Netscape HTTP Cookie File\n" + cs.map((c) => [c.domain.startsWith(".") ? c.domain : `.${c.domain}`, "TRUE", c.path, c.secure ? "TRUE" : "FALSE", Math.round(c.expirationDate || 0), c.name, c.value].join("\t")).join("\n") + "\n";
}

// Abre la copia guardada de una página (MHTML) en una ventana, sin JavaScript y sin red de la sesión de lectores.
export async function abrirCopia(abs, titulo) {
  const e = await el();
  if (!e) throw new Error("Solo desde la app de Mac");
  const w = new e.BrowserWindow({ width: 1280, height: 900, title: `Copia guardada · ${titulo || ""}`, webPreferences: { partition: "copias-guardadas", sandbox: true, contextIsolation: true, javascript: false } });
  w.webContents.setWindowOpenHandler(({ url }) => { e.shell.openExternal(url); return { action: "deny" }; });
  w.webContents.on("will-navigate", (ev, url) => { if (!url.startsWith("file:")) { ev.preventDefault(); e.shell.openExternal(url); } });
  await w.loadFile(abs);
  return { ok: true };
}
