// Copia la app compilada a ~/Applications (carpeta de apps del usuario: no pide contraseña). Si ya había una versión,
// la sustituye.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const release = path.resolve(AQUI, "../release");
const dir = fs.readdirSync(release).map((d) => path.join(release, d, "Glim.app")).find((p) => fs.existsSync(p));
if (!dir) throw new Error("No encuentro release/*/Glim.app. Ejecuta antes npm run app:build.");
const destino = path.join(os.homedir(), "Applications", "Glim.app");
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.rmSync(destino, { recursive: true, force: true });
fs.cpSync(dir, destino, { recursive: true, verbatimSymlinks: true });
console.log(`Instalada en ${destino}`);
