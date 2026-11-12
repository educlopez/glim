// Comprobación en seco de «Publicar cambios» sobre una copia del cerebro con git. Los secretos de ejemplo se montan
// por partes para que el escaneo de secretos del CI no los vea en este archivo.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const FIXTURE = path.resolve(import.meta.dirname, "fixtures/cerebro");
const CORREO = "ana@example.com";
let dir;
let r;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "glim-git-"));
  fs.cpSync(FIXTURE, dir, { recursive: true, filter: (s) => !s.includes(`${path.sep}.glim`) });
  fs.writeFileSync(path.join(dir, ".gitignore"), ".glim/\n");
  const git = (...a) => execFileSync("git", a, { cwd: dir, stdio: "pipe" });
  git("init", "-q", "-b", "main");
  git("config", "user.email", CORREO);
  git("config", "user.name", "Ana");
  git("config", "commit.gpgsign", "false");
  git("add", "-A");
  git("commit", "-q", "-m", "inicio");
  // Cambios que la comprobación debe detectar.
  fs.writeFileSync(path.join(dir, "borradores/2026-11-12-x-token.md"), `---\nred: X\n---\nclave: ${"gh"}p_${"A".repeat(36)}\n`);
  fs.writeFileSync(path.join(dir, "borradores/2026-11-12-x-aws.md"), `id ${"AK"}IA${"B".repeat(16)}\n`);
  fs.writeFileSync(path.join(dir, "borradores/2026-11-12-x-correo.md"), `escríbeme a ${CORREO}\n`);
  fs.writeFileSync(path.join(dir, "borradores/2026-11-12-x-vetado.md"), "trabajo en Globex\n");
  fs.writeFileSync(path.join(dir, "privado/nuevo.md"), "privado\n");
  fs.writeFileSync(path.join(dir, ".env.local"), "X=1\n");
  fs.writeFileSync(path.join(dir, "roto.json"), "{ no es json");
  fs.writeFileSync(path.join(dir, "AGENTS.md"), "# Reglas de prueba\n\nNunca mencionar Globex.\n");
  process.env.GLIM_BRAIN = dir;
  const pub = await import("../server/publicar.js");
  r = await pub.comprobarAntes();
});

afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe("comprobarAntes()", () => {
  it("cuenta los cambios", () => {
    expect(r.total).toBeGreaterThanOrEqual(8);
  });

  it("bloquea secretos, correo y rutas privadas", () => {
    const b = r.seguridad.bloqueos.join("\n");
    expect(b).toMatch(/x-token\.md: posible token de GitHub/);
    expect(b).toMatch(/x-aws\.md: posible clave de AWS/);
    expect(b).toMatch(/x-correo\.md: contiene tu correo/);
    expect(b).toMatch(/privado\/nuevo\.md: ruta que no se sube nunca/);
    expect(b).toMatch(/\.env\.local: ruta que no se sube nunca/);
  });

  it("avisa de términos vetados salvo en el archivo de reglas", () => {
    const a = r.seguridad.avisos.join("\n");
    expect(a).toMatch(/x-vetado\.md: contiene un término vetado \(Globex\)/);
    expect(a).not.toMatch(/AGENTS\.md/);
  });

  it("detecta JSON no válido", () => {
    expect(r.comprobaciones.fallos.join("\n")).toMatch(/roto\.json: JSON no válido/);
  });
});
