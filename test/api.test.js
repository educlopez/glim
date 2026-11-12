import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { emitir, manejar } from "../server/api.js";
import { pedir, servidorApi } from "./helpers.js";

let s;
beforeAll(async () => { s = await servidorApi(manejar); });
afterAll(async () => { await s.cerrar(); });

const panel = { "content-type": "application/json", "x-panel": "1" };

describe("acceso a la API (sin MOSS_TOKEN)", () => {
  it("deja pasar lo que no es /api ni /repo", async () => {
    const r = await pedir(s.port, { ruta: "/index.html" });
    expect(r.status).toBe(418);
  });

  it("rechaza hosts que no son locales (rebinding de DNS)", async () => {
    for (const host of ["evil.example", "127.0.0.1.evil.example", "localhost.evil:80", "192.168.1.2"]) {
      const r = await pedir(s.port, { ruta: "/api/cerebro", headers: { host } });
      expect(r.status).toBe(401);
    }
  });

  it("acepta 127.0.0.1 y localhost", async () => {
    expect((await pedir(s.port, { ruta: "/api/cerebro" })).json.nombre).toBe("Cerebro de prueba");
    expect((await pedir(s.port, { ruta: "/api/cerebro", headers: { host: "localhost" } })).status).toBe(200);
  });

  it("devuelve 404 en rutas de API desconocidas", async () => {
    const r = await pedir(s.port, { ruta: "/api/no-existe" });
    expect(r.status).toBe(404);
    expect(r.json).toEqual({ error: "no existe" });
  });

  it("las escrituras piden JSON y x-panel: 1", async () => {
    const ruta = "/api/revisiones/rev-abc/quitar";
    expect((await pedir(s.port, { method: "POST", ruta, body: "{}" })).status).toBe(403);
    expect((await pedir(s.port, { method: "POST", ruta, headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(403);
    expect((await pedir(s.port, { method: "POST", ruta, headers: { "x-panel": "1", "content-type": "text/plain" }, body: "{}" })).status).toBe(403);
  });

  it("las escrituras rechazan otro origen (CSRF)", async () => {
    const r = await pedir(s.port, { method: "POST", ruta: "/api/revisiones/rev-abc/quitar", headers: { ...panel, origin: "https://evil.example" }, body: "{}" });
    expect(r.status).toBe(403);
  });

  it("el feedback también exige el panel", async () => {
    expect((await pedir(s.port, { method: "POST", ruta: "/api/feedback", body: { output: "x" } })).status).toBe(403);
  });
});

describe("/api/file y /repo/", () => {
  it("sirve archivos permitidos", async () => {
    const r = await pedir(s.port, { ruta: "/api/file?path=AGENTS.md" });
    expect(r.status).toBe(200);
    expect(r.json.text).toMatch(/Reglas de prueba/);
    expect((await pedir(s.port, { ruta: "/repo/AGENTS.md" })).text).toMatch(/Reglas de prueba/);
  });

  it("no sirve lo privado ni lo que sale del cerebro", async () => {
    expect((await pedir(s.port, { ruta: "/api/file?path=privado/secreto.md" })).status).toBe(403);
    expect((await pedir(s.port, { ruta: "/api/file?path=../package.json" })).status).toBe(403);
    expect((await pedir(s.port, { ruta: "/repo/privado/secreto.md" })).status).toBe(403);
    expect((await pedir(s.port, { ruta: "/repo/..%2f..%2fetc%2fpasswd" })).status).toBe(403);
    // URL normaliza %2e%2e: la ruta deja de ser /repo/ y no se sirve nada del disco.
    expect((await pedir(s.port, { ruta: "/repo/%2e%2e/%2e%2e/etc/passwd" })).status).toBe(418);
    expect((await pedir(s.port, { ruta: "/repo/.moss/ajustes.json" })).status).toBe(403);
  });

  it("404 si el archivo no existe", async () => {
    expect((await pedir(s.port, { ruta: "/api/file?path=nada.md" })).status).toBe(404);
  });
});

describe("eventos (SSE)", () => {
  it("recibe lo que se emite", async () => {
    const texto = await new Promise((resolve, reject) => {
      const req = http.get({ host: "127.0.0.1", port: s.port, path: "/api/eventos" }, (res) => {
        expect(res.headers["content-type"]).toBe("text/event-stream");
        let d = "";
        res.on("data", (c) => {
          d += c;
          if (d.includes(": hola")) emitir("repo:cambio", { archivos: ["AGENTS.md"] });
          if (d.includes("event: repo:cambio")) { req.destroy(); resolve(d); }
        });
      });
      req.on("error", (e) => { if (e.code !== "ECONNRESET") reject(e); });
    });
    expect(texto).toContain('event: repo:cambio\ndata: {"archivos":["AGENTS.md"]}');
  });
});
