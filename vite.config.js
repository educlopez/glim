import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En desarrollo la API va montada en Vite y lee el cerebro de MOSS_BRAIN (o el que eligió la app). El build solo
// compila la interfaz: no necesita cerebro.
export default defineConfig(async ({ command }) => ({
  plugins: [react(), ...(command === "serve" ? [(await import("./server/api.js")).repoApi()] : [])],
  server: { host: "127.0.0.1", port: 4321, strictPort: false, watch: { ignored: ["**/release/**", "**/dist/**"] } },
  build: { sourcemap: false, chunkSizeWarningLimit: 1500 },
}));
