// Prueba de humo: Vite en modo desarrollo (interfaz + API) sobre una copia del cerebro de prueba.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// La copia se hace una vez; los workers heredan la variable y no copian de nuevo.
if (!process.env.MOSS_E2E_BRAIN) {
  const copia = fs.mkdtempSync(path.join(os.tmpdir(), "moss-e2e-"));
  fs.cpSync(path.resolve(import.meta.dirname, "test/fixtures/cerebro"), copia, { recursive: true, filter: (s) => !s.includes(`${path.sep}.moss`) });
  process.env.MOSS_E2E_BRAIN = copia;
}

const PUERTO = 4455;

export default defineConfig({
  testDir: "test/e2e",
  globalTeardown: "./test/e2e/limpiar.js",
  timeout: 30000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://127.0.0.1:${PUERTO}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx vite --port ${PUERTO} --strictPort`,
    url: `http://127.0.0.1:${PUERTO}/`,
    reuseExistingServer: false,
    timeout: 60000,
    env: { MOSS_BRAIN: process.env.MOSS_E2E_BRAIN, MOSS_TOKEN: "" },
  },
});
