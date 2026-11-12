// Actualizaciones de la app instalada desde una release (las del checkout se actualizan con git, ver server/vivo.js).
// Con la app firmada y notarizada, electron-updater descarga la versión nueva de GitHub Releases en segundo plano y la
// instala al salir (o al pulsar el aviso). Sin firma, macOS no deja reemplazar la app: entonces solo avisa y abre la
// página de la release para descargarla a mano.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const pkg = (() => { try { return JSON.parse(fs.readFileSync(path.join(AQUI, "..", "package.json"), "utf8")); } catch { return {}; } })();
const repo = (() => { const r = pkg.repository; const u = typeof r === "string" ? r : r && r.url; const m = /github\.com[/:]([\w.-]+\/[\w.-]+?)(\.git)?$/.exec(u || ""); return m && m[1]; })();
const mayor = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };

async function soloAvisar({ app, shell, Notification }) {
  if (!repo) return null;
  const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { Accept: "application/vnd.github+json", "User-Agent": "Moss" }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) return null;
  const j = await r.json();
  const nueva = String(j.tag_name || "").replace(/^v/, "");
  if (!nueva || !mayor(nueva, app.getVersion())) return null;
  if (Notification.isSupported()) {
    const n = new Notification({ title: `Moss ${nueva} disponible`, body: "Pulsa para ver las novedades y descargarla." });
    n.on("click", () => shell.openExternal(j.html_url));
    n.show();
  }
  return nueva;
}

export async function buscarVersionNueva({ app, shell, Notification, registro }) {
  let autoUpdater = null;
  try { autoUpdater = (await import("electron-updater")).default.autoUpdater; } catch { /* sin el módulo: solo avisar */ }
  if (!autoUpdater) return soloAvisar({ app, shell, Notification });
  autoUpdater.logger = registro ? { info: registro.info, warn: registro.warn, error: registro.error, debug: () => {} } : null;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  let sinFirma = false;
  autoUpdater.on("error", (e) => {
    // Sin firma de Apple no se puede reemplazar la app: se pasa al aviso con enlace.
    // Lo mismo si falta la configuración del actualizador (builds locales).
    if (!sinFirma) { sinFirma = true; soloAvisar({ app, shell, Notification }).catch(() => {}); }
  });
  autoUpdater.on("update-downloaded", (info) => {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title: `Moss ${info.version} lista`, body: "Se instalará al salir. Pulsa para reiniciar ahora." });
    n.on("click", () => autoUpdater.quitAndInstall());
    n.show();
  });
  const comprobar = () => autoUpdater.checkForUpdates().catch(() => {});
  const t = setInterval(comprobar, 6 * 3600e3);
  t.unref();
  return comprobar();
}
