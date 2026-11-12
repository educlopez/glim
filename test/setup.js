// Cada archivo de test trabaja sobre una copia del cerebro de prueba: cargar server/cerebro.js crea `.glim/` y algunos
// módulos escriben ahí, y el fixture no se toca nunca.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll } from "vitest";

const FIXTURE = path.resolve(import.meta.dirname, "fixtures/cerebro");
const copia = fs.mkdtempSync(path.join(os.tmpdir(), "glim-test-"));
fs.cpSync(FIXTURE, copia, { recursive: true, filter: (s) => !s.includes(`${path.sep}.glim`) });
process.env.GLIM_BRAIN = copia;
delete process.env.GLIM_TOKEN;

// Borra la copia al terminar el archivo.
afterAll(() => { fs.rmSync(copia, { recursive: true, force: true }); });
