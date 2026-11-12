// Registro de la app en archivo (~/Library/Logs/Glim/main.log), con rotación a 5 MB y una copia anterior.
// También recoge console.* del proceso principal y del servidor, que corre en el mismo proceso.
import fs from "node:fs";
import path from "node:path";
import util from "node:util";

let archivo = null;
const MAX = 5 * 1024 * 1024;

function escribir(nivel, partes) {
  if (!archivo) return;
  const linea = `${new Date().toISOString()} [${nivel}] ${partes.map((p) => (typeof p === "string" ? p : util.inspect(p, { depth: 4, breakLength: Infinity }))).join(" ")}\n`;
  try {
    if (fs.existsSync(archivo) && fs.statSync(archivo).size > MAX) fs.renameSync(archivo, `${archivo}.1`);
    fs.appendFileSync(archivo, linea);
  } catch { /* sin disco no hay registro; la app sigue */ }
}

export const registro = {
  info: (...p) => escribir("info", p),
  warn: (...p) => escribir("warn", p),
  error: (...p) => escribir("error", p),
};

export function iniciarRegistro(dir) {
  fs.mkdirSync(dir, { recursive: true });
  archivo = path.join(dir, "main.log");
  for (const [m, nivel] of [["log", "info"], ["info", "info"], ["warn", "warn"], ["error", "error"]]) {
    const original = console[m].bind(console);
    console[m] = (...p) => { escribir(nivel, p); original(...p); };
  }
}
