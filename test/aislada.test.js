// Copias aisladas de los encargos (git worktree): arrancan con el estado actual del repo, aplican y descartan.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";

const RAIZ = process.env.GLIM_BRAIN;
const git = (...a) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: RAIZ, encoding: "utf8" });
let aislada;

beforeAll(async () => {
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("commit", "-qm", "init");
  aislada = await import("../server/aislada.js");
});

describe("copia aislada", () => {
  it("incluye los cambios sin subir y aplica lo que hace el agente", () => {
    fs.appendFileSync(path.join(RAIZ, "AGENTS.md"), "\nlínea local\n");
    const { base } = aislada.crear("prueba-uno");
    const dir = aislada.ruta("prueba-uno");
    expect(fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8")).toContain("línea local");
    fs.writeFileSync(path.join(dir, "borradores", "nuevo.md"), "del agente\n");
    const c = aislada.cambios("prueba-uno", base);
    expect(c.archivos).toEqual([{ estado: "A", ruta: "borradores/nuevo.md" }]);
    aislada.aplicar("prueba-uno", base);
    expect(fs.readFileSync(path.join(RAIZ, "borradores", "nuevo.md"), "utf8")).toBe("del agente\n");
    expect(fs.existsSync(dir)).toBe(false);
  });

  it("descartar no toca el repo", () => {
    const { base } = aislada.crear("prueba-dos");
    fs.writeFileSync(path.join(aislada.ruta("prueba-dos"), "AGENTS.md"), "pisado\n");
    expect(aislada.cambios("prueba-dos", base).resumen.archivos).toBe(1);
    aislada.borrar("prueba-dos");
    expect(fs.readFileSync(path.join(RAIZ, "AGENTS.md"), "utf8")).not.toBe("pisado\n");
    expect(git("worktree", "list")).not.toContain("prueba-dos");
  });

  it("rechaza ids raros", () => {
    expect(() => aislada.ruta("../fuera")).toThrow();
  });
});
