// Bienvenida: crear o convertir un cerebro sin pisar nada, y leer el estado de las herramientas del sistema.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { configNueva, describir, faltanEnGitignore, prepararCerebro } from "../electron/cerebro-nuevo.mjs";
import { cuentaGh, version } from "../server/herramientas.js";
import { Esquema } from "../server/esquema.js";

const tmps = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "glim-bienvenida-")); tmps.push(d); return d; };
afterEach(() => { for (const d of tmps.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

describe("configNueva", () => {
  it("pasa el esquema con lo que se pide en la bienvenida", () => {
    const c = configNueva({ nombre: "mi-marca", persona: "Ana", autor: { nombre: "Ana Pérez", usuario: "@anaperez" }, idioma: "en", zonaHoraria: "Europe/Madrid", redes: ["X", "Threads"], cadencia: { X: [1, 1, 1, 1, 1, 0, 0], Threads: [0, 0, 0, 0, 0, 0, 0], LinkedIn: [1, 1, 1, 1, 1, 1, 1] } });
    expect(Esquema.safeParse(c).success).toBe(true);
    expect(c.autor).toEqual({ nombre: "Ana Pérez", usuario: "anaperez" });
    expect(c.redes).toEqual(["X", "Threads"]);
    // Solo las redes elegidas y con algún día marcado.
    expect(c.cadencia).toEqual({ X: [1, 1, 1, 1, 1, 0, 0] });
    expect(c.idioma).toBe("en");
  });

  it("sin datos sale una config válida con valores neutros", () => {
    const c = configNueva({});
    expect(Esquema.safeParse(c).success).toBe(true);
    expect(c.nombre).toBe("mi-cerebro");
    expect(c.redes).toEqual(["X", "LinkedIn"]);
    expect(c.autor).toBeUndefined();
    expect(c.cadencia).toBeUndefined();
  });

  it("descarta redes desconocidas", () => {
    expect(configNueva({ redes: ["X", "MySpace"] }).redes).toEqual(["X"]);
  });
});

describe("faltanEnGitignore", () => {
  it("añade solo lo que falta, con o sin barra final", () => {
    expect(faltanEnGitignore("node_modules\n.glim\n")).toEqual(["privado/", ".DS_Store"]);
    expect(faltanEnGitignore("")).toEqual([".glim/", "privado/", ".DS_Store"]);
  });
});

describe("prepararCerebro", () => {
  it("convierte un repo con CLAUDE.md sin crear otro archivo de reglas ni tocar su .gitignore", () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, "CLAUDE.md"), "# reglas mías\n");
    fs.writeFileSync(path.join(dir, ".gitignore"), "node_modules");
    const antes = describir(dir);
    expect(antes).toMatchObject({ esCerebro: false, vacia: false, reglas: "CLAUDE.md" });
    expect(antes.crear).toEqual(["glim.config.json", "borradores/", "aprendizajes.md", "skills/glim/"]);
    prepararCerebro(dir, { nombre: "repo" });
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, "glim.config.json"), "utf8"));
    expect(cfg.reglas).toBe("CLAUDE.md");
    expect(fs.existsSync(path.join(dir, "AGENTS.md"))).toBe(false);
    expect(fs.readFileSync(path.join(dir, "CLAUDE.md"), "utf8")).toBe("# reglas mías\n");
    expect(fs.readFileSync(path.join(dir, ".gitignore"), "utf8")).toBe("node_modules\n.glim/\nprivado/\n.DS_Store\n");
    expect(describir(dir).esCerebro).toBe(true);
  });

  it("en una carpeta vacía crea AGENTS.md con el nombre de la persona", () => {
    const dir = tmp();
    expect(describir(dir).vacia).toBe(true);
    prepararCerebro(dir, { nombre: "nuevo", persona: "Ana" });
    expect(fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8")).toContain("OK explícito de Ana");
    expect(fs.existsSync(path.join(dir, "borradores"))).toBe(true);
  });

  it("no pisa un glim.config.json que ya existe", () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, "glim.config.json"), '{"nombre":"el-mio"}');
    prepararCerebro(dir, { nombre: "otro" });
    expect(JSON.parse(fs.readFileSync(path.join(dir, "glim.config.json"), "utf8")).nombre).toBe("el-mio");
    expect(describir(dir).nombre).toBe("el-mio");
  });
});

describe("herramientas", () => {
  it("saca la cuenta de gh sin quedarse con nada más", () => {
    expect(cuentaGh("github.com\n  ✓ Logged in to github.com account ana-p (keyring)\n  - Token: gho_****")).toBe("ana-p");
    expect(cuentaGh("Logged in to github.com as ana")).toBe("ana");
    expect(cuentaGh("You are not logged into any GitHub hosts.")).toBeNull();
  });

  it("lee la versión de cada herramienta", () => {
    expect(version("git version 2.47.1 (Apple Git-154)")).toBe("2.47.1");
    expect(version("ffmpeg version 7.1-tessus Copyright")).toBe("7.1");
    expect(version("v22.11.0")).toBe("22.11.0");
  });
});
