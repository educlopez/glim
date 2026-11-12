// Servidor propio de Glim (app empaquetada): sirve la interfaz compilada (dist/) y la API en 127.0.0.1, en un puerto
// libre que elige el sistema. En desarrollo no se usa: la API va montada en Vite (vite.config.js).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { APP } from "./cerebro.js";
import { MIME } from "./repo.js";
import { manejar, arrancar } from "./api.js";

const DIST = path.join(APP, "dist");

// Cabeceras de seguridad de la interfaz. La CSP solo deja cargar código de la propia app; imágenes y vídeos pueden
// venir de la red (miniaturas de referencias) y del propio servidor.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

function estatico(req, res) {
  const url = new URL(req.url, "http://localhost");
  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
  let abs = path.join(DIST, path.normalize(rel));
  if (!abs.startsWith(DIST + path.sep)) { res.statusCode = 403; return res.end(); }
  if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) abs = path.join(DIST, "index.html");
  res.setHeader("Content-Type", MIME[path.extname(abs).toLowerCase()] || "application/octet-stream");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (abs.endsWith("index.html")) { res.setHeader("Content-Security-Policy", CSP); res.setHeader("Cache-Control", "no-cache"); }
  else res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  fs.createReadStream(abs).pipe(res);
}

// Arranca el servidor. Devuelve { url, cerrar }.
export async function iniciar({ puerto = 0 } = {}) {
  const parar = arrancar();
  const server = http.createServer((req, res) => {
    manejar(req, res, () => estatico(req, res)).catch((e) => {
      console.error("[glim] petición:", e);
      if (!res.headersSent) { res.statusCode = 500; res.end("error"); }
    });
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(puerto, "127.0.0.1", resolve); });
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/`,
    cerrar: () => new Promise((resolve) => { parar(); server.closeAllConnections?.(); server.close(() => resolve()); }),
  };
}
