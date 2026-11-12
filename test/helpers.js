// Servidor HTTP mínimo con `manejar` de server/api.js, sin las tareas de fondo de `arrancar()`.
import http from "node:http";

export async function servidorApi(manejar) {
  const server = http.createServer((req, res) => {
    manejar(req, res, () => { res.statusCode = 418; res.end("siguiente"); }).catch(() => { res.statusCode = 500; res.end(); });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  return {
    port,
    cerrar: () => new Promise((r) => { server.closeAllConnections(); server.close(() => r()); }),
  };
}

// Petición con control total de las cabeceras (fetch no deja cambiar Host).
export function pedir(port, { method = "GET", ruta = "/", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: ruta, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      let d = "";
      res.on("data", (c) => { d += c; });
      res.on("end", () => { let json = null; try { json = JSON.parse(d); } catch {} resolve({ status: res.statusCode, text: d, json }); });
    });
    req.on("error", reject);
    if (body !== undefined) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}
