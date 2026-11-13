// Glim para Mac. Abre un cerebro (un repo con glim.config.json), arranca su servidor local y lo enseña en una ventana
// nativa, con el Dock, la barra de menús y avisos del sistema cuando un agente termina o falla.
//
// Dos modos:
// - Empaquetada (release): sirve la interfaz compilada y la API desde el propio paquete (server/servidor.js).
// - Desde el checkout (npm run app:instalar): la app es una capa fina que arranca Vite en la carpeta de Glim, así que
//   lo que cambie en el código se ve sin recompilar. origen.json guarda dónde está ese checkout.
import { app, BrowserWindow, Notification, shell, Menu, dialog, ipcMain, nativeTheme, nativeImage, Tray, globalShortcut, session, crashReporter, screen } from "electron";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { execFileSync, execFile } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { iniciarRegistro, registro } from "./registro.mjs";
import { buscarVersionNueva } from "./actualizador.mjs";
import { describir, prepararCerebro } from "./cerebro-nuevo.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const NOMBRE = "Glim";
app.setName(NOMBRE);
iniciarRegistro(app.getPath("logs"));
crashReporter.start({ uploadToServer: false }); // volcados solo en local (carpeta Crashpad de la app)

// API de Electron para el servidor (lectores y copias de páginas, server/navegador.js). El servidor no importa
// "electron": desde la carpeta del checkout resolvería al paquete npm, que al cargarse intenta instalarse.
globalThis.panelElectron = {
  BrowserWindow, session, shell, app, nativeImage, nativeTheme,
  // El servidor genera la imagen plantilla de la barra de menús (server/icono.js) y la pone aquí.
  ponerBarra: (f) => { barraPath = f; if (tray && fs.existsSync(f)) tray.setImage(imagenBarra(f)); },
};

const leerJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const esCerebro = (p) => !!p && fs.existsSync(path.join(p, "glim.config.json"));
const CONFIG = () => path.join(app.getPath("userData"), "config.json");
const guardarConfig = (cambios) => { fs.mkdirSync(path.dirname(CONFIG()), { recursive: true }); fs.writeFileSync(CONFIG(), JSON.stringify({ ...(leerJson(CONFIG()) || {}), ...cambios }, null, 2)); };

// Una app abierta desde el Finder hereda un PATH mínimo. Los agentes necesitan git, gh, python3, node, ffmpeg… del
// PATH de la shell de la persona.
function arreglarPath() {
  const extra = ["/opt/homebrew/bin", "/usr/local/bin", path.join(os.homedir(), ".local/bin")];
  try {
    const shellUsuario = process.env.SHELL || "/bin/zsh";
    const out = execFileSync(shellUsuario, ["-ilc", 'printf "__PATH__%s" "$PATH"'], { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] });
    const p = out.split("__PATH__").pop().trim();
    if (p) process.env.PATH = p;
  } catch { /* se queda con el PATH heredado más los extra */ }
  process.env.PATH = [...new Set([...(process.env.PATH || "").split(":"), ...extra].filter(Boolean))].join(":");
}

// ---- Elegir el cerebro ----
const ejecutar = (cmd, args, opciones = {}) => new Promise((resolve) => {
  execFile(cmd, args, { timeout: 15000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, maxBuffer: 8e6, ...opciones }, (err, out, e) => resolve({ ok: !err, out: String(out || ""), err: String(e || (err && err.message) || "") }));
});

async function estadoGh() {
  const v = await ejecutar("gh", ["--version"], { timeout: 8000 });
  if (!v.ok) return { instalado: false, sesion: false, cuenta: null };
  const s = await ejecutar("gh", ["auth", "status"], { timeout: 8000 });
  const m = /Logged in to \S+ (?:account|as) ([\w.-]+)/.exec(s.out + s.err);
  return { instalado: true, sesion: s.ok && !!m, cuenta: m ? m[1] : null };
}

async function clonar(slug, destino) {
  const dir = path.join(destino, slug.split("/").pop().replace(/\.git$/, ""));
  if (fs.existsSync(dir)) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir; // ya clonado: se usa ese
    throw new Error(`Ya existe ${dir} y no es un repo de git.`);
  }
  const gh = await estadoGh();
  const [cmd, args] = gh.sesion ? ["gh", ["repo", "clone", slug, dir]] : ["git", ["clone", `https://github.com/${slug}.git`, dir]];
  const r = await ejecutar(cmd, args, { timeout: 600000 });
  if (!r.ok) throw new Error(r.err.trim().split("\n").pop() || "No se ha podido clonar.");
  return dir;
}

// Bienvenida: una sola ventana que primero carga electron/bienvenida.html (elegir o crear el cerebro, sin servidor) y,
// cuando hay cerebro, sigue en la vista #/bienvenida de la app. Devuelve { dir, ventana } o null si se cierra.
let ventanaBienvenida = null;
function bienvenida() {
  return new Promise((resolve) => {
    const w = new BrowserWindow({
      width: 880, height: 640, resizable: false, fullscreenable: false, maximizable: false, show: false, center: true,
      title: `Bienvenida a ${NOMBRE}`, titleBarStyle: "hiddenInset", trafficLightPosition: { x: 18, y: 18 }, backgroundColor: "#00000000",
      vibrancy: "under-window", visualEffectState: "followWindow",
      webPreferences: PREFERENCIAS,
    });
    ventanaBienvenida = w;
    w.once("ready-to-show", () => w.show());
    // Los enlaces de la página estática se abren en el navegador; la ventana no navega a ningún sitio por su cuenta.
    w.webContents.setWindowOpenHandler(({ url }) => { if (/^https:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
    w.webContents.on("will-navigate", (ev) => ev.preventDefault());
    const CANALES = ["glim:inicio", "glim:elegir", "glim:crear", "glim:repos", "glim:clonar", "glim:preparar", "glim:abrir"];
    let hecho = false;
    const terminar = (dir) => {
      if (hecho) return;
      hecho = true;
      for (const c of CANALES) ipcMain.removeHandler(c);
      if (dir) guardarConfig({ cerebro: dir });
      resolve(dir ? { dir, ventana: w } : null);
    };
    const preguntarCarpeta = (titulo, boton, defaultPath) => {
      const r = dialog.showOpenDialogSync(w, { title: titulo, buttonLabel: boton, defaultPath, properties: ["openDirectory", "createDirectory"] });
      return r && r[0];
    };
    const desarrollo = [path.join(os.homedir(), "Developer"), path.join(os.homedir(), "Projects"), os.homedir()].find((d) => fs.existsSync(d));
    const describe = (dir) => { try { return { ok: true, ...describir(dir) }; } catch (x) { return { ok: false, error: x.message }; } };

    ipcMain.handle("glim:inicio", async () => {
      const git = await ejecutar("git", ["config", "--global", "user.name"], { timeout: 4000 });
      let zonas = [];
      try { zonas = Intl.supportedValuesOf("timeZone"); } catch { /* Electron viejo: solo la del equipo */ }
      return {
        usuario: (git.ok && git.out.trim()) || os.userInfo().username,
        zona: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        zonas,
        idioma: app.getLocale().toLowerCase().startsWith("en") ? "en" : "es",
        gh: await estadoGh(),
      };
    });
    ipcMain.handle("glim:elegir", () => {
      const dir = preguntarCarpeta("Elige la carpeta de tu cerebro", "Elegir", desarrollo);
      return dir ? describe(dir) : { ok: false };
    });
    ipcMain.handle("glim:crear", () => {
      const dir = preguntarCarpeta("Elige o crea una carpeta para el cerebro", "Usar esta carpeta", desarrollo);
      if (!dir) return { ok: false };
      const d = describe(dir);
      if (d.ok && !d.vacia && !d.esCerebro) return { ...d, aviso: "La carpeta no está vacía: la convertimos sin tocar lo que ya hay." };
      return d;
    });
    ipcMain.handle("glim:repos", async () => {
      const r = await ejecutar("gh", ["repo", "list", "--limit", "100", "--json", "nameWithOwner,description,isPrivate,updatedAt"], { timeout: 30000 });
      if (!r.ok) return { error: r.err.trim().split("\n").pop() || "gh no responde" };
      try {
        const lista = JSON.parse(r.out).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
        return { repos: lista.map((x) => ({ slug: x.nameWithOwner, descripcion: x.description || "", privado: !!x.isPrivate })) };
      } catch { return { error: "Respuesta de gh no válida" }; }
    });
    ipcMain.handle("glim:clonar", async (_e, slug) => {
      if (!/^[\w.-]+\/[\w.-]+$/.test(String(slug || ""))) return { ok: false, error: "Escribe el repo como usuario/nombre." };
      const destino = preguntarCarpeta(`¿Dónde guardo ${slug}?`, "Clonar aquí", desarrollo);
      if (!destino) return { ok: false };
      try { return describe(await clonar(slug, destino)); } catch (x) { return { ok: false, error: x.message }; }
    });
    ipcMain.handle("glim:preparar", (_e, dir, datos) => {
      try { prepararCerebro(dir, datos); } catch (x) { return { ok: false, error: x.message }; }
      terminar(dir);
      return { ok: true };
    });
    ipcMain.handle("glim:abrir", (_e, dir) => {
      if (!esCerebro(dir)) return { ok: false, error: "Esa carpeta no tiene glim.config.json." };
      terminar(dir);
      return { ok: true };
    });
    w.on("closed", () => { ventanaBienvenida = null; terminar(null); });
    w.loadFile(path.join(AQUI, "bienvenida.html"));
  });
}

async function cerebro() {
  const guardado = (leerJson(CONFIG()) || {}).cerebro;
  const ok = [process.env.GLIM_BRAIN, guardado].find(esCerebro);
  if (ok) return { dir: ok, ventana: null };
  return bienvenida();
}

// Fin de la bienvenida: la misma ventana crece al tamaño de la app (animado, como Arc o Dia) y carga el panel.
function convertirEnApp(w) {
  const { workArea } = screen.getDisplayMatching(w.getBounds());
  const ancho = Math.min(1480, workArea.width - 40);
  const alto = Math.min(940, workArea.height - 40);
  const destino = { x: Math.round(workArea.x + (workArea.width - ancho) / 2), y: Math.round(workArea.y + (workArea.height - alto) / 2), width: ancho, height: alto };
  ventanaBienvenida = null;
  win = w;
  w.on("closed", () => { if (win === w) win = null; });
  w.setTitle(NOMBRE);
  w.setResizable(true);
  w.setMaximizable(true);
  w.setFullScreenable(true);
  w.setMinimumSize(900, 600);
  w.setVibrancy(vibrancia());
  w.setBounds(destino, true);
  setTimeout(() => { if (!w.isDestroyed()) w.loadURL(base); }, 260);
}

// ---- Servidor ----
const TOKEN = crypto.randomBytes(32).toString("hex");

async function arrancarServidor(raiz) {
  process.env.GLIM_BRAIN = raiz;
  process.env.GLIM_TOKEN = TOKEN;
  process.env.GLIM_APP = "1";
  // Huella de este main.mjs: el panel la compara con la del checkout para saber si hay que reinstalar la app.
  process.env.GLIM_APP_HASH = crypto.createHash("sha1").update(fs.readFileSync(path.join(AQUI, "main.mjs"))).digest("hex").slice(0, 12);
  const origen = (leerJson(path.join(AQUI, "origen.json")) || {}).app;
  if (!app.isPackaged || (origen && fs.existsSync(path.join(origen, "vite.config.js")))) {
    // Desde el checkout: Vite con la API montada (vite.config.js).
    const dir = origen || path.resolve(AQUI, "..");
    const vite = await import(pathToFileURL(path.join(dir, "node_modules/vite/dist/node/index.js")).href);
    // Puerto libre elegido por el sistema (Vite trata 0 como «el de siempre», 5173).
    const port = await new Promise((resolve, reject) => { const s = net.createServer(); s.once("error", reject); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); }); });
    const server = await vite.createServer({ root: dir, configFile: path.join(dir, "vite.config.js"), clearScreen: false, logLevel: "warn", server: { host: "127.0.0.1", port, strictPort: true, open: false } });
    await server.listen();
    return { url: `http://127.0.0.1:${port}/`, cerrar: () => server.close(), desarrollo: true };
  }
  const { iniciar } = await import(pathToFileURL(path.join(AQUI, "..", "server", "servidor.js")).href);
  return iniciar();
}

// ---- Seguridad de las ventanas ----
// Todo lo que no es la propia app se abre en el navegador; nada de webviews ni permisos que no hagan falta.
const PERMISOS = new Set(["clipboard-sanitized-write", "notifications", "fullscreen"]);
function blindarContenido(wc, base) {
  const propio = (url) => url.startsWith(base);
  const externo = (url) => { if (/^(https?:|mailto:)/.test(url)) shell.openExternal(url); };
  wc.on("will-attach-webview", (ev) => ev.preventDefault());
  // Avisos y errores de la interfaz (CSP, excepciones) al registro, para depurar sin abrir las DevTools.
  wc.on("console-message", (ev) => { if (ev.level === "warning" || ev.level === "error") registro.warn(`[ventana] ${ev.message}`.slice(0, 600)); });
  // Las ventanas de lectores y copias (server/navegador.js) cargan webs de terceros a propósito, en su propia
  // sesión: solo se blindan la navegación y las ventanas emergentes de las ventanas de la app.
  if (wc.session !== session.defaultSession) return;
  wc.setWindowOpenHandler(({ url }) => { externo(url); return { action: "deny" }; });
  wc.on("will-navigate", (ev, url) => { if (!propio(url)) { ev.preventDefault(); externo(url); } });
  wc.on("will-redirect", (ev, url) => { if (!propio(url)) ev.preventDefault(); });
}

function blindar(base) {
  app.on("web-contents-created", (_e, wc) => blindarContenido(wc, base));
  // La ventana de bienvenida ya existía: pasa a las mismas reglas que el resto antes de cargar la app.
  if (ventanaBienvenida && !ventanaBienvenida.isDestroyed()) {
    ventanaBienvenida.webContents.removeAllListeners("will-navigate");
    blindarContenido(ventanaBienvenida.webContents, base);
  }
  const s = session.defaultSession;
  s.setPermissionRequestHandler((_wc, permiso, cb) => cb(PERMISOS.has(permiso)));
  s.setPermissionCheckHandler((_wc, permiso) => PERMISOS.has(permiso));
  // El token de la API viaja en una cookie solo para 127.0.0.1 (las cookies no distinguen puertos).
  return s.cookies.set({ url: base, name: "glim_token", value: TOKEN, httpOnly: true, sameSite: "strict" });
}

let win = null;
let winAjustes = null;
let base = null;
let servidor = null;
let raizCerebro = null;
let tray = null;
let aj = null; // últimos ajustes aplicados

const leerAjustes = () => leerJson(path.join(raizCerebro, ".glim", "ajustes.json")) || {};
const vibrancia = () => ((aj && aj.estilo) === "clasico" ? "sidebar" : "hud"); // Cristal = hudWindow, el material de Rex
const PREFERENCIAS = { contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, spellcheck: true, preload: path.join(AQUI, "preload.cjs") };

function prepararVentana(w) {
  w.webContents.on("did-finish-load", () => w.webContents.executeJavaScript("document.documentElement.classList.add('is-app')"));
}

function crearVentana() {
  win = new BrowserWindow({
    width: 1480, height: 940, minWidth: 900, minHeight: 600, title: NOMBRE,
    // Desenfoque del sistema detrás de la ventana (como Rex y las apps de Apple); se apaga sin foco.
    titleBarStyle: "hiddenInset", trafficLightPosition: { x: 18, y: 18 }, backgroundColor: "#00000000",
    vibrancy: vibrancia(), visualEffectState: "followWindow", roundedCorners: true,
    webPreferences: PREFERENCIAS,
  });
  win.loadURL(base);
  prepararVentana(win);
  win.on("closed", () => { win = null; });
}

// Ajustes en su propia ventana, como en Rex y en las apps de Apple (⌘,).
// Centra una ventana en la pantalla donde está otra (con varias pantallas, macOS la abriría en la principal).
function centrarJunto(w, ref) {
  if (!w || !ref || ref.isDestroyed()) return;
  const { workArea } = screen.getDisplayMatching(ref.getBounds());
  if (screen.getDisplayMatching(w.getBounds()).id === screen.getDisplayMatching(ref.getBounds()).id && w.isVisible()) return;
  const { width, height } = w.getBounds();
  w.setPosition(Math.round(workArea.x + (workArea.width - width) / 2), Math.round(workArea.y + (workArea.height - height) / 2));
}

function abrirAjustes(seccion) {
  const hash = `#/ajustes?ventana=1${seccion ? `&seccion=${encodeURIComponent(seccion)}` : ""}`;
  // La pantalla de referencia es la de la ventana con foco o, si no hay, la de la ventana principal.
  const ref = [BrowserWindow.getFocusedWindow(), win].find((x) => x && !x.isDestroyed() && x !== winAjustes);
  if (winAjustes) { if (seccion) winAjustes.loadURL(base + hash); centrarJunto(winAjustes, ref); winAjustes.show(); winAjustes.focus(); return; }
  winAjustes = new BrowserWindow({
    width: 900, height: 700, minWidth: 720, minHeight: 480, title: "Ajustes", show: false,
    titleBarStyle: "hiddenInset", trafficLightPosition: { x: 18, y: 18 }, backgroundColor: "#00000000",
    vibrancy: "sidebar", visualEffectState: "followWindow", fullscreenable: false,
    webPreferences: PREFERENCIAS,
  });
  centrarJunto(winAjustes, ref);
  winAjustes.loadURL(base + hash);
  prepararVentana(winAjustes);
  winAjustes.once("ready-to-show", () => winAjustes.show());
  winAjustes.on("closed", () => { winAjustes = null; });
}

function mostrar(hash) {
  if (!base) return;
  // Mientras dura la bienvenida, el Dock y la barra de menús la traen a ella en vez de abrir otra ventana.
  if (ventanaBienvenida && !ventanaBienvenida.isDestroyed()) { ventanaBienvenida.show(); ventanaBienvenida.focus(); return; }
  if (!win) crearVentana();
  if (hash) win.loadURL(base + hash);
  win.show();
  win.focus();
}

function alternar() {
  if (win && win.isVisible() && win.isFocused()) { app.hide(); return; }
  mostrar();
}

// Aplica lo que se cambia en Ajustes: tema, desenfoque, barra de menús y atajo global. El icono lo aplica el servidor.
function aplicar(nuevo) {
  const antes = aj || {};
  aj = { ...leerAjustes(), ...(nuevo || {}) };
  nativeTheme.themeSource = { claro: "light", oscuro: "dark" }[aj.tema] || "system";
  for (const w of [win].filter(Boolean)) w.setVibrancy(vibrancia());
  if (aj.barraMenus !== false && !tray) crearTray();
  if (aj.barraMenus === false && tray) { tray.destroy(); tray = null; }
  if (aj.atajoGlobal !== antes.atajoGlobal) {
    globalShortcut.unregisterAll();
    if (aj.atajoGlobal) { try { globalShortcut.register(aj.atajoGlobal, alternar); } catch { /* atajo no válido: se ignora */ } }
  }
}

// Imagen plantilla (negro + alfa, nombre acabado en Template y versión @2x): macOS la tiñe para claro y oscuro.
let barraPath = null;
function imagenBarra(f) {
  const img = nativeImage.createFromPath(f);
  img.setTemplateImage(true);
  return img;
}

function crearTray() {
  const f = [barraPath, path.join(AQUI, "iconos", "trayTemplate.png")].find((x) => x && fs.existsSync(x));
  tray = new Tray(f ? imagenBarra(f) : nativeImage.createEmpty());
  tray.setToolTip(NOMBRE);
  tray.on("click", () => tray.popUpContextMenu());
  menuTray({ curso: 0, revisar: 0 });
}

function menuTray({ curso, revisar }) {
  if (!tray) return;
  tray.setTitle(revisar ? ` ${revisar}` : "");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: curso ? `Agente trabajando (${curso})` : "Sin encargos en marcha", enabled: false },
    { label: revisar ? `${revisar} para revisar` : "Nada para revisar", enabled: !!revisar, click: () => mostrar("#/encargos") },
    { type: "separator" },
    { label: `Abrir ${NOMBRE}`, click: () => mostrar() },
    { label: "Pedir un cambio…", click: () => mostrar("#/encargos?pedir=general") },
    { label: "Ajustes…", click: () => abrirAjustes() },
    { type: "separator" },
    { label: "Salir", role: "quit" },
  ]));
}

// Avisos del sistema según Ajustes → Notificaciones. El Dock y la barra de menús enseñan cuántos esperan revisión.
const vistos = new Map();
let publicadosVistos = null;
function avisar(titulo, cuerpo, hash) {
  const n = (aj && aj.notif) || {};
  if (n.sistema === false || !Notification.isSupported()) return;
  const sonido = n.sonido && n.sonido !== "no" ? n.sonido : undefined;
  const not = new Notification({ title: titulo, body: cuerpo, silent: !sonido, sound: sonido });
  if (hash) not.on("click", () => mostrar(hash));
  not.show();
}

const api = (ruta, opciones = {}) => fetch(`${base}${ruta}`, { ...opciones, headers: { "x-glim-token": TOKEN, ...(opciones.headers || {}) } });

async function vigilar() {
  try {
    const j = await api("api/encargos").then((r) => r.json());
    const n = (aj && aj.notif) || {};
    for (const e of j.encargos) {
      const antes = vistos.get(e.id);
      const quien = `${e.objetivo.titulo || "General"}: ${e.texto.slice(0, 120)}`;
      if (antes && ["cola", "en-curso"].includes(antes) && e.estado === "revisar" && n.terminado !== false) avisar("Encargo terminado", quien, `#/encargos?ver=${e.id}`);
      if (antes && ["cola", "en-curso"].includes(antes) && e.estado === "error" && n.fallo !== false) avisar("El encargo ha fallado", quien, `#/encargos?ver=${e.id}`);
      if (antes && antes !== "en-curso" && e.estado === "en-curso" && n.cola) avisar("Empieza un encargo", quien, `#/encargos?ver=${e.id}`);
      vistos.set(e.id, e.estado);
    }
    const pub = j.publicados || [];
    if (publicadosVistos && n.publicado !== false) for (const p of pub) if (!publicadosVistos.has(p.path + p.cuando)) avisar("Publicado según Buffer", `${path.basename(p.path, ".md")} (${(p.redes || []).join(", ")})`, "#/posts");
    publicadosVistos = new Set(pub.map((p) => p.path + p.cuando));
    const revisar = j.encargos.filter((e) => ["revisar", "error"].includes(e.estado)).length;
    const curso = j.encargos.filter((e) => e.estado === "en-curso").length;
    if (app.dock) app.dock.setBadge(n.badge !== false && revisar ? String(revisar) : "");
    menuTray({ curso, revisar });
  } catch { /* el servidor se está reiniciando */ }
}

function cambiarCerebro() {
  const r = dialog.showMessageBoxSync({ type: "question", buttons: ["Cambiar", "Cancelar"], defaultId: 0, cancelId: 1, message: "¿Abrir otro cerebro?", detail: `${NOMBRE} se reiniciará y te pedirá la carpeta o el repo de GitHub.` });
  if (r !== 0) return;
  guardarConfig({ cerebro: null });
  app.relaunch();
  app.exit(0);
}

function menu() {
  const ir = (label, hash, accelerator) => ({ label, accelerator, click: () => mostrar(hash) });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: app.name, submenu: [
      { role: "about", label: `Acerca de ${NOMBRE}` }, { type: "separator" },
      { label: "Ajustes…", accelerator: "CmdOrCtrl+,", click: () => abrirAjustes() }, { type: "separator" },
      { role: "services", label: "Servicios" }, { type: "separator" },
      { role: "hide", label: `Ocultar ${NOMBRE}` }, { role: "hideOthers", label: "Ocultar otros" }, { role: "unhide", label: "Mostrar todo" }, { type: "separator" },
      { role: "quit", label: `Salir de ${NOMBRE}` },
    ] },
    { label: "Archivo", submenu: [
      ir("Pedir un cambio", "#/encargos?pedir=general", "CmdOrCtrl+N"), { type: "separator" },
      { label: "Abrir otro cerebro…", click: cambiarCerebro },
      { label: "Mostrar los registros", click: () => shell.openPath(app.getPath("logs")) },
      { type: "separator" }, { role: "close", label: "Cerrar ventana" },
    ] },
    { role: "editMenu", label: "Edición" },
    { label: "Ir", submenu: [
      ir("Resumen", "#/", "CmdOrCtrl+1"), ir("Encargos", "#/encargos", "CmdOrCtrl+2"), ir("Calendario", "#/calendario", "CmdOrCtrl+3"),
      ir("Posts", "#/posts", "CmdOrCtrl+4"), ir("Plantillas", "#/plantillas", "CmdOrCtrl+5"), ir("Referencias", "#/referencias", "CmdOrCtrl+6"), ir("Registro", "#/registro", "CmdOrCtrl+7"),
    ] },
    { role: "viewMenu", label: "Vista" },
    { role: "windowMenu", label: "Ventana" },
  ]));
}

// Tras reinstalar desde el panel: abre la versión nueva de ~/Applications y cierra esta.
ipcMain.handle("relanzar", () => {
  const nueva = path.join(app.getPath("home"), "Applications", `${NOMBRE}.app`, "Contents", "MacOS", NOMBRE);
  app.relaunch(fs.existsSync(nueva) ? { execPath: nueva } : undefined);
  app.exit(0);
});
ipcMain.handle("tema", (_, t) => aplicar({ tema: t }));
ipcMain.handle("ajustes", (_, a) => aplicar(a));
ipcMain.handle("abrirAjustes", (_, seccion) => abrirAjustes(seccion));
ipcMain.handle("cambiarCerebro", () => cambiarCerebro());
ipcMain.handle("mostrarCerebro", () => raizCerebro && shell.openPath(raizCerebro));
ipcMain.handle("registros", () => shell.openPath(app.getPath("logs")));
ipcMain.handle("ir", (_, hash) => mostrar(typeof hash === "string" && hash.startsWith("#/") ? hash : undefined));
ipcMain.handle("glim:terminar", (e) => {
  guardarConfig({ bienvenida: 1 });
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w && w === ventanaBienvenida) { convertirEnApp(w); return { transformada: true }; }
  return { transformada: false };
});

process.on("uncaughtException", (e) => registro.error("uncaughtException", e));
process.on("unhandledRejection", (e) => registro.error("unhandledRejection", e));
app.on("render-process-gone", (_e, _wc, d) => registro.error("render-process-gone", d));
app.on("child-process-gone", (_e, d) => registro.error("child-process-gone", d));

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => mostrar());
  app.whenReady().then(async () => {
    arreglarPath();
    const elegido = await cerebro();
    if (!elegido) return app.quit();
    raizCerebro = elegido.dir;
    try {
      servidor = await arrancarServidor(raizCerebro);
      base = servidor.url;
    } catch (e) {
      registro.error("arranque", e);
      const r = dialog.showMessageBoxSync({ type: "error", buttons: ["Elegir otro cerebro", "Salir"], defaultId: 1, message: `${NOMBRE} no arranca`, detail: String((e && e.message) || e) });
      if (r === 0) { guardarConfig({ cerebro: null }); app.relaunch(); }
      return app.exit(0);
    }
    await blindar(base);
    registro.info(`cerebro ${raizCerebro} · ${servidor.desarrollo ? "desarrollo" : "empaquetada"} · ${base}`);
    menu();
    aplicar();
    // Primera vez: la ventana de bienvenida sigue con los pasos que necesitan el servidor (herramientas, agente…).
    if (elegido.ventana && !elegido.ventana.isDestroyed()) {
      prepararVentana(elegido.ventana);
      elegido.ventana.loadURL(`${base}#/bienvenida`);
    } else if (aj.mostrarAlAbrir !== false) crearVentana();
    await vigilar();
    setInterval(vigilar, 2500);
    if (app.isPackaged && !servidor.desarrollo) buscarVersionNueva({ app, shell, Notification, registro }).catch((e) => registro.warn("actualizador", e));
  });
  // En Mac, cerrar la ventana no cierra la app: los encargos siguen y el aviso llega igual.
  app.on("window-all-closed", () => {});
  app.on("activate", () => mostrar());
  app.on("will-quit", () => globalShortcut.unregisterAll());
  let saliendo = false;
  app.on("before-quit", async (e) => {
    if (saliendo || !servidor) return;
    e.preventDefault();
    let ocupado = null;
    try { ocupado = (await api("api/encargos").then((r) => r.json())).ocupado; } catch { /* nada */ }
    if (ocupado) {
      const r = dialog.showMessageBoxSync({ type: "warning", buttons: ["Seguir abierta", "Salir igualmente"], defaultId: 0, cancelId: 0, message: "Hay un agente trabajando en un encargo", detail: "Si sales ahora, el encargo se corta. Al volver a abrir queda como interrumpido y se puede retomar." });
      if (r === 0) return;
      await api(`api/encargos/${ocupado}/detener`, { method: "POST", headers: { "Content-Type": "application/json", "x-panel": "1" }, body: "{}" }).catch(() => {});
    }
    saliendo = true;
    await Promise.resolve(servidor.cerrar()).catch(() => {});
    app.quit();
  });
}
