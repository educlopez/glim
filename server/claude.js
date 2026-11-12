// Consulta de una vuelta a Claude (o a Codex) en modo headless (sin herramientas ni MCP), para redactar commits, novedades y
// revisar diffs desde el panel. Mismo binario y mismo aislamiento que los encargos (sin hooks personales).
import { spawn } from "node:child_process";
import { ROOT } from "./repo.js";
import { claudeBin } from "./encargos.js";
import { binDe } from "./agentes.js";

export function preguntar(texto, { modelo = "sonnet", ms = 240000, agente = "claude" } = {}) {
  if (agente === "codex") return preguntarCodex(texto, { ms });
  return new Promise((resolve, reject) => {
    const args = ["-p", "--output-format", "json", "--strict-mcp-config", "--setting-sources", "project,local", "--max-turns", "2",
      "--disallowedTools", "Bash", "Edit", "Write", "NotebookEdit", "WebFetch", "WebSearch", "Task", "Skill", "--model", modelo];
    const p = spawn(claudeBin(), args, { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    const t = setTimeout(() => { p.kill("SIGTERM"); reject(new Error("Claude tardó demasiado")); }, ms);
    p.stdout.on("data", (c) => { out += c; });
    p.stderr.on("data", (c) => { err += c; });
    p.on("error", (e) => { clearTimeout(t); reject(e); });
    p.on("close", (code) => {
      clearTimeout(t);
      try {
        const j = JSON.parse(out);
        if (j.is_error) return reject(new Error(String(j.result || "Claude devolvió un error").slice(0, 300)));
        resolve({ texto: String(j.result || ""), coste: j.total_cost_usd || 0 });
      } catch { reject(new Error(code ? `Claude salió con código ${code}: ${err.slice(-300)}` : "Respuesta de Claude ilegible")); }
    });
    p.stdin.end(texto);
  });
}

// Saca el primer objeto JSON de una respuesta (Claude a veces lo envuelve en ```json).
export function json(texto) {
  const m = /```(?:json)?\s*([\s\S]*?)```/.exec(texto);
  const s = m ? m[1] : texto.slice(texto.indexOf("{"), texto.lastIndexOf("}") + 1);
  return JSON.parse(s);
}

// Codex en solo lectura (sandbox read-only, sin config personal): devuelve el último mensaje del agente.
async function preguntarCodex(texto, { ms }) {
  const bin = await binDe("codex");
  return new Promise((resolve, reject) => {
    const p = spawn(bin, ["exec", "--json", "--ignore-user-config", "--skip-git-repo-check", "-s", "read-only", "-C", ROOT, "-"], { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    const t = setTimeout(() => { p.kill("SIGTERM"); reject(new Error("Codex tardó demasiado")); }, ms);
    p.stdout.on("data", (c) => { out += c; });
    p.stderr.on("data", (c) => { err = (err + c).slice(-2000); });
    p.on("error", (e) => { clearTimeout(t); reject(e); });
    p.on("close", (code) => {
      clearTimeout(t);
      const msgs = out.split("\n").map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((m) => m && m.type === "item.completed" && m.item && m.item.type === "agent_message");
      if (!msgs.length) return reject(new Error(`Codex no respondió (código ${code}): ${err.slice(-200)}`));
      resolve({ texto: msgs[msgs.length - 1].item.text, coste: 0 });
    });
    p.stdin.end(texto);
  });
}
