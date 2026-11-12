// Borra la copia del cerebro que hizo playwright.config.js.
import fs from "node:fs";

export default function limpiar() {
  if (process.env.GLIM_E2E_BRAIN) fs.rmSync(process.env.GLIM_E2E_BRAIN, { recursive: true, force: true });
}
