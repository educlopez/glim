// Antes de compilar la app: genera el .icns por defecto y la imagen plantilla de la barra de menús (el icono elegido en
// Ajustes lo aplica luego el servidor). Con --checkout guarda además dónde está este checkout (origen.json): la app
// instalada arranca Vite desde aquí y ve los cambios sin recompilar. Sin --checkout (release) se borra.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(AQUI, "..");
const origen = path.join(AQUI, "origen.json");
if (process.argv.includes("--checkout")) fs.writeFileSync(origen, JSON.stringify({ app: APP }, null, 2));
else fs.rmSync(origen, { force: true });

const ICONOS = path.join(AQUI, "iconos");
const icns = path.join(AQUI, "icon.icns");
if (!fs.existsSync(path.join(ICONOS, "app.png")) || !fs.existsSync(path.join(ICONOS, "trayTemplate.png")) || !fs.existsSync(icns)) {
  fs.mkdirSync(ICONOS, { recursive: true });
  execFileSync("python3", ["-I", path.join(APP, "server", "icono.py"), JSON.stringify({ tinta: "musgo", glifo: "brote", apariencia: "claro", salida: path.join(ICONOS, "app.png"), barra: path.join(ICONOS, "trayTemplate.png") })], { stdio: "inherit" });
  if (process.platform === "darwin") {
    const set = path.join(AQUI, "icon.iconset");
    fs.mkdirSync(set, { recursive: true });
    for (const n of [16, 32, 128, 256, 512]) {
      execFileSync("sips", ["-z", String(n), String(n), path.join(ICONOS, "app.png"), "--out", path.join(set, `icon_${n}x${n}.png`)], { stdio: "ignore" });
      execFileSync("sips", ["-z", String(n * 2), String(n * 2), path.join(ICONOS, "app.png"), "--out", path.join(set, `icon_${n}x${n}@2x.png`)], { stdio: "ignore" });
    }
    execFileSync("iconutil", ["-c", "icns", set, "-o", icns], { stdio: "inherit" });
    fs.rmSync(set, { recursive: true, force: true });
  }
}
console.log(`Moss: ${APP}${fs.existsSync(origen) ? " (desde el checkout)" : ""}\nIconos: ${ICONOS}`);
