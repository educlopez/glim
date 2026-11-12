// MOSS_TOKEN se lee al cargar server/api.js, así que este archivo lo fija antes de importarlo.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedir, servidorApi } from "./helpers.js";

const TOKEN = "token-de-prueba-0123456789abcdef";
let s;
beforeAll(async () => {
  process.env.MOSS_TOKEN = TOKEN;
  const { manejar } = await import("../server/api.js");
  s = await servidorApi(manejar);
});
afterAll(async () => { await s.cerrar(); delete process.env.MOSS_TOKEN; });

describe("acceso con MOSS_TOKEN", () => {
  it("sin token: 401", async () => {
    expect((await pedir(s.port, { ruta: "/api/cerebro" })).status).toBe(401);
    expect((await pedir(s.port, { ruta: "/repo/AGENTS.md" })).status).toBe(401);
  });

  it("token equivocado o de otra longitud: 401", async () => {
    expect((await pedir(s.port, { ruta: "/api/cerebro", headers: { "x-moss-token": TOKEN.replace(/.$/, "x") } })).status).toBe(401);
    expect((await pedir(s.port, { ruta: "/api/cerebro", headers: { "x-moss-token": "corto" } })).status).toBe(401);
    expect((await pedir(s.port, { ruta: "/api/cerebro", headers: { cookie: "moss_token=otro" } })).status).toBe(401);
  });

  it("token en cabecera o cookie: 200", async () => {
    expect((await pedir(s.port, { ruta: "/api/cerebro", headers: { "x-moss-token": TOKEN } })).status).toBe(200);
    expect((await pedir(s.port, { ruta: "/api/cerebro", headers: { cookie: `a=1; moss_token=${TOKEN}` } })).status).toBe(200);
  });

  it("con token válido, el host sigue teniendo que ser local", async () => {
    expect((await pedir(s.port, { ruta: "/api/cerebro", headers: { host: "evil.example", "x-moss-token": TOKEN } })).status).toBe(401);
  });

  it("lo que no es API no pide token", async () => {
    expect((await pedir(s.port, { ruta: "/" })).status).toBe(418);
  });
});
