import { describe, expect, it } from "vitest";
import { ROOT, cfg } from "../server/cerebro.js";
import { frontmatter, safe } from "../server/repo.js";

describe("cerebro de prueba", () => {
  it("carga la configuración del fixture", () => {
    expect(cfg.nombre).toBe("Cerebro de prueba");
    expect(cfg.zonaHoraria).toBe("Europe/Madrid");
    expect(ROOT).toBeTruthy();
  });
});

describe("safe()", () => {
  it("acepta rutas normales dentro del cerebro", () => {
    expect(safe("borradores/2026-11-10-x-primer-post.md")).toMatchObject({ rel: "borradores/2026-11-10-x-primer-post.md" });
    expect(safe("/AGENTS.md").rel).toBe("AGENTS.md");
    expect(safe("borradores/../AGENTS.md").rel).toBe("AGENTS.md");
    expect(safe("borradores\\x.md").rel).toBe("borradores/x.md");
  });

  it("rechaza rutas vacías o que salen del cerebro", () => {
    for (const r of ["", ".", null, undefined, "..", "../fuera", "borradores/../../fuera", "../../etc/passwd"]) expect(safe(r)).toBeNull();
  });

  it("rechaza lo privado de la configuración", () => {
    expect(safe("privado/secreto.md")).toBeNull();
    expect(safe("privado")).toBeNull();
    expect(safe("borradores/../privado/secreto.md")).toBeNull();
    expect(safe("privadox/otro.md")).not.toBeNull();
  });

  it("rechaza el estado local salvo el feedback", () => {
    expect(safe(".moss/ajustes.json")).toBeNull();
    expect(safe(".moss/encargos/x.json")).toBeNull();
    expect(safe(".moss/feedback/nota.md")).not.toBeNull();
  });

  it("rechaza secretos, git y dependencias", () => {
    for (const r of [".env", ".env.local", "sub/.env", ".git/config", "a/.git/HEAD", "node_modules/x/index.js", "certs/clave.pem", "id.key"]) expect(safe(r)).toBeNull();
  });
});

describe("frontmatter()", () => {
  it("lee clave: valor, con dos puntos y continuaciones", () => {
    const { fm, body } = frontmatter('---\nred: X\nnota: hora 10:30 (Madrid)\nmedia: uno\n  dos\ntitulo: "con comillas"\n---\nCuerpo');
    expect(fm).toEqual({ red: "X", nota: "hora 10:30 (Madrid)", media: "uno dos", titulo: "con comillas" });
    expect(body).toBe("Cuerpo");
  });

  it("sin frontmatter devuelve el texto entero", () => {
    expect(frontmatter("solo texto")).toEqual({ fm: {}, body: "solo texto" });
  });
});
