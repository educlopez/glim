// Avisa de versiones nuevas en las instalaciones desde una release (las del checkout se actualizan con git, ver
// server/vivo.js). Mira la última release de GitHub una vez al día. La actualización automática e instalación en
// segundo plano necesitan la app firmada y notarizada (electron-updater); mientras no lo esté, el aviso abre la
// página de la release.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const pkg = (() => { try { return JSON.parse(fs.readFileSync(path.join(AQUI, "..", "package.json"), "utf8")); } catch { return {}; } })();
const repo = (() => { const r = pkg.repository; const u = typeof r === "string" ? r : r && r.url; const m = /github\.com[/:]([\w.-]+\/[\w.-]+?)(\.git)?$/.exec(u || ""); return m && m[1]; })();

const mayor = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };

export async function buscarVersionNueva({ app, shell, Notification }) {
  if (!repo) return null;
  const comprobar = async () => {
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
  };
  const t = setInterval(() => comprobar().catch(() => {}), 24 * 3600e3);
  t.unref();
  return comprobar();
}
