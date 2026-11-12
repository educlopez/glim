// Borra la copia del cerebro que hizo playwright.config.js.
import fs from "node:fs";

export default function limpiar() {
  if (process.env.MOSS_E2E_BRAIN) fs.rmSync(process.env.MOSS_E2E_BRAIN, { recursive: true, force: true });
}
