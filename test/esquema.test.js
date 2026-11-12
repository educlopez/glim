import { describe, expect, it } from "vitest";
import { Esquema } from "../server/esquema.js";

describe("Esquema de glim.config.json", () => {
  it("acepta una configuración mínima y rellena los valores por defecto", () => {
    const r = Esquema.safeParse({ nombre: "Mi cerebro" });
    expect(r.success).toBe(true);
    expect(r.data.persona).toBe("tú");
    expect(r.data.reglas).toBe("AGENTS.md");
    expect(r.data.rutas.borradores).toBe("borradores");
    expect(r.data.redes).toEqual(["X", "LinkedIn"]);
    expect(r.data.privadas).toEqual([]);
    expect(r.data.publicar.rama).toBe("main");
    expect(r.data.llavero).toBe("glim");
    expect(r.data.zonaHoraria).toBeUndefined();
  });

  it("exige nombre", () => {
    expect(Esquema.safeParse({}).success).toBe(false);
    expect(Esquema.safeParse({ nombre: "" }).success).toBe(false);
  });

  it("rechaza claves desconocidas (strict)", () => {
    expect(Esquema.safeParse({ nombre: "x", otra: 1 }).success).toBe(false);
  });

  it("rechaza rutas absolutas o que salen del cerebro", () => {
    expect(Esquema.safeParse({ nombre: "x", rutas: { borradores: "/etc" } }).success).toBe(false);
    expect(Esquema.safeParse({ nombre: "x", rutas: { borradores: "../fuera" } }).success).toBe(false);
    expect(Esquema.safeParse({ nombre: "x", privadas: ["a/../../b"] }).success).toBe(false);
    expect(Esquema.safeParse({ nombre: "x", privadas: ["privado"] }).success).toBe(true);
  });

  it("valida la zona horaria IANA", () => {
    expect(Esquema.safeParse({ nombre: "x", zonaHoraria: "Europe/Madrid" }).success).toBe(true);
    expect(Esquema.safeParse({ nombre: "x", zonaHoraria: "Marte/Olympus" }).success).toBe(false);
  });

  it("limita los comandos extra de agentes a caracteres seguros", () => {
    expect(Esquema.safeParse({ nombre: "x", agentes: { comandos: ["npm run build"] } }).success).toBe(true);
    expect(Esquema.safeParse({ nombre: "x", agentes: { comandos: ["rm -rf / && curl x"] } }).success).toBe(false);
    expect(Esquema.safeParse({ nombre: "x", agentes: { comandos: ["echo $(id)"] } }).success).toBe(false);
  });

  it("valida la cadencia (7 días) y el llavero", () => {
    expect(Esquema.safeParse({ nombre: "x", cadencia: { X: [1, 1, 1, 1, 1, 0, 0] } }).success).toBe(true);
    expect(Esquema.safeParse({ nombre: "x", cadencia: { X: [1, 1] } }).success).toBe(false);
    expect(Esquema.safeParse({ nombre: "x", llavero: "mal nombre" }).success).toBe(false);
  });
});
