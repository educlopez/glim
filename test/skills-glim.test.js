// Paquete de skills de Glim: instalar, actualizar, saltar las editadas a mano, enlaces y lock. También el MCP
// opcional de los encargos.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { instalarSkills, leerPaquete, hashCarpeta, PAQUETE, LOCK } from "../server/paquete-skills.js";
import { ADAPTADORES, mcpDelCerebro } from "../server/agentes.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "glim-skills-"));
function paquete(dir, nombre, version, cuerpo = "Hola") {
  fs.mkdirSync(path.join(dir, nombre), { recursive: true });
  fs.writeFileSync(path.join(dir, nombre, "SKILL.md"), `---\nname: ${nombre}\ndescription: >-\n  prueba\nversion: ${version}\n---\n\n${cuerpo}\n`);
}
const lock = (raiz) => JSON.parse(fs.readFileSync(path.join(raiz, LOCK), "utf8"));

describe("paquete real", () => {
  it("trae las cuatro skills con nombre, descripción en bloque y versión", () => {
    const p = leerPaquete(PAQUETE);
    expect(p.map((s) => s.nombre)).toEqual(["glim-cerebro", "glim-encargos", "glim-metricas", "glim-secciones"]);
    for (const s of p) {
      const t = fs.readFileSync(path.join(s.dir, "SKILL.md"), "utf8");
      expect(t).toMatch(new RegExp(`^---\\nname: ${s.nombre}\\ndescription: >-\\n`));
      expect(s.version).toMatch(/^\d+\.\d+\.\d+$/);
      // Sin emojis ni pictogramas.
      expect(t).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});

describe("instalarSkills", () => {
  it("instala, enlaza en .claude y .agents con rutas relativas y escribe el lock", () => {
    const origen = tmp(); const raiz = tmp();
    paquete(origen, "uno", "1.0.0");
    const r = instalarSkills(raiz, { origen, rutas: { skills: "skills" } });
    expect(r.skills).toEqual([expect.objectContaining({ nombre: "uno", accion: "instalada", version: "1.0.0", ruta: "skills/glim/uno" })]);
    expect(fs.readFileSync(path.join(raiz, "skills/glim/uno/SKILL.md"), "utf8")).toContain("Hola");
    for (const base of [".claude/skills", ".agents/skills"]) {
      const enlace = path.join(raiz, base, "uno");
      expect(fs.readlinkSync(enlace)).toBe("../../skills/glim/uno");
      expect(fs.existsSync(path.join(enlace, "SKILL.md"))).toBe(true);
    }
    expect(lock(raiz).skills.uno).toEqual({ version: "1.0.0", sha256: hashCarpeta(path.join(origen, "uno")), ruta: "skills/glim/uno" });
    // Otra vez: todo al día y nada pendiente.
    const s = instalarSkills(raiz, { origen, seco: true });
    expect(s.skills[0].accion).toBe("al-dia");
    expect(s.pendientes).toBe(0);
  });

  it("actualiza una skill sin tocar y salta la editada a mano", () => {
    const origen = tmp(); const raiz = tmp();
    paquete(origen, "uno", "1.0.0"); paquete(origen, "dos", "1.0.0");
    instalarSkills(raiz, { origen });
    fs.appendFileSync(path.join(raiz, "skills/glim/dos/SKILL.md"), "mi cambio\n");
    paquete(origen, "uno", "1.1.0", "Nuevo"); paquete(origen, "dos", "1.1.0", "Nuevo");
    const seco = instalarSkills(raiz, { origen, seco: true });
    expect(seco.pendientes).toBe(1);
    expect(fs.readFileSync(path.join(raiz, "skills/glim/uno/SKILL.md"), "utf8")).toContain("Hola");
    const r = instalarSkills(raiz, { origen });
    const por = Object.fromEntries(r.skills.map((x) => [x.nombre, x]));
    expect(por.uno).toMatchObject({ accion: "actualizada", version: "1.1.0", anterior: "1.0.0" });
    expect(por.dos.accion).toBe("editada");
    expect(por.dos.motivo).toMatch(/no se pisa/);
    expect(fs.readFileSync(path.join(raiz, "skills/glim/uno/SKILL.md"), "utf8")).toContain("Nuevo");
    expect(fs.readFileSync(path.join(raiz, "skills/glim/dos/SKILL.md"), "utf8")).toContain("mi cambio");
    // El lock de la editada se queda en la versión que se instaló.
    expect(lock(raiz).skills.dos.version).toBe("1.0.0");
    expect(lock(raiz).skills.uno.version).toBe("1.1.0");
  });

  it("no toca una carpeta ajena ni un enlace ocupado", () => {
    const origen = tmp(); const raiz = tmp();
    paquete(origen, "uno", "1.0.0");
    fs.mkdirSync(path.join(raiz, "skills/glim/uno"), { recursive: true });
    fs.writeFileSync(path.join(raiz, "skills/glim/uno/SKILL.md"), "mía");
    fs.mkdirSync(path.join(raiz, ".claude/skills/uno"), { recursive: true });
    const r = instalarSkills(raiz, { origen });
    expect(r.skills[0].accion).toBe("ajena");
    expect(fs.readFileSync(path.join(raiz, "skills/glim/uno/SKILL.md"), "utf8")).toBe("mía");
    expect(lock(raiz).skills).toEqual({});

    const raiz2 = tmp();
    fs.mkdirSync(path.join(raiz2, ".claude/skills/uno"), { recursive: true });
    const r2 = instalarSkills(raiz2, { origen });
    expect(r2.enlaces.find((e) => e.enlace === ".claude/skills/uno").estado).toBe("ocupado");
    expect(r2.enlaces.find((e) => e.enlace === ".agents/skills/uno").estado).toBe("creado");
  });
});

describe("MCP del cerebro en los encargos", () => {
  it("apagado por defecto; con el opt-in usa .mcp.json y añade --mcp-config y sus servidores", () => {
    const raiz = fs.realpathSync(tmp());
    fs.writeFileSync(path.join(raiz, ".mcp.json"), JSON.stringify({ mcpServers: { posts: { type: "http", url: "https://x" }, otro: { command: "x", env: { TOKEN: "$" + "{MI_TOKEN}" } } } }));
    expect(mcpDelCerebro(raiz, {})).toBeNull();
    const m = mcpDelCerebro(raiz, { usarMcpDelCerebro: true });
    expect(m).toMatchObject({ ruta: path.join(raiz, ".mcp.json"), servidores: ["otro", "posts"], error: null });
    const { args } = ADAPTADORES.claude.args({ sistema: "S", permitidas: ["Read"], prohibidas: ["Bash(rm *)"], mcp: m });
    expect(args).toEqual(expect.arrayContaining(["--strict-mcp-config", "--mcp-config", path.join(raiz, ".mcp.json"), "mcp__otro", "mcp__posts"]));
    const sin = ADAPTADORES.claude.args({ sistema: "S", permitidas: ["Read"], prohibidas: [] }).args;
    expect(sin).toContain("--strict-mcp-config");
    expect(sin).not.toContain("--mcp-config");
  });

  it("rechaza un archivo con secretos literales", () => {
    const raiz = fs.realpathSync(tmp());
    fs.writeFileSync(path.join(raiz, "mcp.json"), JSON.stringify({ mcpServers: { s: { url: "https://x", headers: { Authorization: "Bearer abc" } } } }));
    const m = mcpDelCerebro(raiz, { usarMcpDelCerebro: true, mcp: "mcp.json" });
    expect(m.error).toMatch(/headers \(Authorization\)/);
    expect(ADAPTADORES.claude.args({ sistema: "S", permitidas: [], prohibidas: [], mcp: m }).args).not.toContain("--mcp-config");
    expect(mcpDelCerebro(raiz, { usarMcpDelCerebro: true, mcp: "no.json" }).error).toMatch(/No existe/);
  });
});
