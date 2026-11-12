import { describe, expect, it } from "vitest";
import { posts } from "../server/posts.js";

describe("posts()", () => {
  const lista = posts("2026-11-12");
  const porId = Object.fromEntries(lista.map((p) => [p.id, p]));

  it("lee los borradores del fixture y salta las plantillas (_*.md)", () => {
    expect(lista.map((p) => p.id).sort()).toEqual(["2026-11-10-x-primer-post", "2026-11-11-linkedin-segundo-post"]);
  });

  it("saca red, estado, título y texto", () => {
    const p = porId["2026-11-10-x-primer-post"];
    expect(p.redes).toEqual(["X"]);
    expect(p.estado).toBe("idea");
    expect(p.titulo).toBe("Primer post");
    expect(p.notaEstado).toBe("falta el visual");
    expect(p.piezas[0]).toMatchObject({ red: "X", texto: "Un post corto de prueba." });
  });

  it("lee la fecha programada, separa las notas y avisa de lo que falta", () => {
    const p = porId["2026-11-11-linkedin-segundo-post"];
    expect(p.redes).toEqual(["LinkedIn"]);
    expect(p.estado).toBe("programado");
    expect(p.fecha).toEqual({ dia: "2026-11-20", hora: "09:30", tipo: "programado" });
    expect(p.notas).toEqual(["nota interna"]);
    expect(p.piezas[0].texto).toBe("Texto del segundo post.");
    expect(p.avisos.map((a) => a.texto).join(" ")).toMatch(/Sin visual/);
  });
});
