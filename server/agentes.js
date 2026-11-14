// Agentes que pueden hacer los encargos: Claude Code, Codex, Cursor, OpenCode, Gemini o un comando propio.
// Cada adaptador sabe lanzar su CLI en modo no interactivo y traducir su salida a eventos comunes:
//   { tipo: "sesion", id } · { tipo: "texto", texto } · { tipo: "herramienta", herramienta, icono, texto, detalle, archivo }
//   { tipo: "fallo", texto } · { tipo: "resultado", texto, coste, turnos, error, denegadas, tokens }
// Formatos comprobados en este equipo el 12-nov-2026: Claude (stream-json) y Codex (exec --json). Cursor
// (stream-json), OpenCode (run --format json) y Gemini (stream-json) se leen con tolerancia: cualquier campo de
// texto que no se reconozca se muestra igual, para no perder nada.
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { ROOT } from "./repo.js";

const rel = (p) => (p && path.isAbsolute(p) ? path.relative(ROOT, p) : p);
const run = (cmd, args) => new Promise((resolve) => execFile(cmd, args, { timeout: 8000 }, (err, out) => resolve(err ? null : String(out || "").trim())));
const HOME = process.env.HOME || "";
const buscar = (nombres) => {
  const dirs = [path.join(HOME, ".local/bin"), "/opt/homebrew/bin", "/usr/local/bin", path.join(HOME, ".bun/bin"), path.join(HOME, ".npm-global/bin"), ...(process.env.PATH || "").split(":")];
  for (const n of nombres) for (const d of dirs) { const p = path.join(d, n); if (d && fs.existsSync(p)) return p; }
  return null;
};

// Resumen legible de una herramienta, con los nombres de Claude como referencia.
export function resumen(name, input = {}) {
  const p = rel(input.file_path || input.path || input.filePath || input.notebook_path);
  const n = String(name || "").toLowerCase();
  if (/^(read|read_file|readfile|view)$/.test(n)) return { icono: "leer", texto: `Lee ${p || ""}`, archivo: null };
  if (/^(edit|multiedit|str_replace|apply_patch|patch|replace)$/.test(n)) return { icono: "editar", texto: `Edita ${p || ""}`, archivo: p };
  if (/^(write|write_file|create|writefile)$/.test(n)) return { icono: "crear", texto: `Escribe ${p || ""}`, archivo: p };
  if (/^(bash|shell|run_shell_command|command|terminal)$/.test(n)) return { icono: "terminal", texto: input.description || "Ejecuta un comando", detalle: String(input.command || input.cmd || "").slice(0, 400) };
  if (/^(glob|grep|search|list|ls|find|codebase_search)$/.test(n)) return { icono: "buscar", texto: `Busca ${input.pattern || input.query || ""}${input.path ? ` en ${rel(input.path)}` : ""}` };
  if (n === "skill") return { icono: "skill", texto: `Usa la skill ${input.skill || input.name || ""}` };
  if (n === "task") return { icono: "agente", texto: `Subagente: ${input.description || ""}` };
  if (/websearch|web_search/.test(n)) return { icono: "web", texto: `Busca en la web: ${input.query || ""}` };
  if (/webfetch|web_fetch|fetch/.test(n)) return { icono: "web", texto: `Lee ${input.url || ""}` };
  if (/todo/.test(n)) return { icono: "plan", texto: "Actualiza su lista de pasos", detalle: (input.todos || []).map((t) => `${t.status === "completed" ? "[x]" : "[ ]"} ${t.content || t.text || ""}`).join("\n") };
  return { icono: "herramienta", texto: name };
}

// ---- MCP del cerebro (opcional, solo Claude Code) ----
// glim.config.json → agentes.usarMcpDelCerebro (false por defecto) y agentes.mcp (por defecto .mcp.json si existe).
// El archivo se versiona en el cerebro, así que no puede llevar secretos: si algún servidor trae valores literales en
// env o headers (en vez de ${VARIABLE}), no se usa y el encargo sale sin MCP, con el motivo en `error`.
const REFERENCIA = /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/;
export function mcpDelCerebro(root, agentesCfg = {}) {
  if (!agentesCfg.usarMcpDelCerebro) return null;
  const rel = agentesCfg.mcp || ".mcp.json";
  const abs = path.join(root, rel);
  if (!abs.startsWith(root + path.sep) || !fs.existsSync(abs)) return agentesCfg.mcp ? { ruta: null, servidores: [], error: `No existe ${rel}` } : null;
  let j;
  try { j = JSON.parse(fs.readFileSync(abs, "utf8")); } catch (e) { return { ruta: null, servidores: [], error: `${rel} no es JSON válido: ${e.message}` }; }
  const servidores = j && typeof j.mcpServers === "object" && j.mcpServers ? j.mcpServers : {};
  const nombres = Object.keys(servidores).filter((n) => /^[\w-]+$/.test(n)).sort();
  for (const n of nombres) {
    const s = servidores[n] || {};
    for (const campo of ["env", "headers"]) {
      const literales = Object.entries(s[campo] || {}).filter(([, v]) => v != null && v !== "" && !REFERENCIA.test(String(v)));
      if (literales.length) return { ruta: null, servidores: [], error: `${rel}: el servidor «${n}» lleva valores en ${campo} (${literales.map(([k]) => k).join(", ")}). Usa OAuth o \${VARIABLE}; Glim no pasa secretos versionados a los encargos.` };
    }
  }
  return { ruta: abs, rel, servidores: nombres, error: null };
}

// ---- Claude Code ----
const claude = {
  id: "claude", nombre: "Claude Code", bins: ["claude"], web: "https://docs.anthropic.com/claude-code",
  sesionLogin: "claude", permisos: "Lista de permitidas y prohibidas (sin commit, push, gh, rm ni curl).",
  // mcp: { ruta, servidores } de mcpDelCerebro(). Con --strict-mcp-config solo se carga ese archivo; sin él, ningún MCP.
  args({ sistema, sesion, modelo, permitidas, prohibidas, mcp }) {
    const conMcp = mcp && mcp.ruta && !mcp.error;
    const a = ["-p", "--output-format", "stream-json", "--verbose", "--strict-mcp-config", ...(conMcp ? ["--mcp-config", mcp.ruta] : []), "--setting-sources", "project,local",
      "--permission-mode", "acceptEdits", "--append-system-prompt", sistema, "--allowedTools", ...permitidas, ...(conMcp ? mcp.servidores.map((s) => `mcp__${s}`) : []), "--disallowedTools", ...prohibidas];
    if (modelo) a.push("--model", modelo);
    if (sesion) a.push("--resume", sesion);
    return { args: a, stdin: true };
  },
  parse(m) {
    if (m.type === "system" && m.subtype === "init" && m.session_id) return [{ tipo: "sesion", id: m.session_id }];
    if (m.type === "assistant") return (m.message.content || []).flatMap((c) => {
      if (c.type === "text" && c.text.trim()) return [{ tipo: "texto", texto: c.text }];
      if (c.type === "tool_use") return [{ tipo: "herramienta", herramienta: c.name, ...resumen(c.name, c.input) }];
      return [];
    });
    if (m.type === "user" && Array.isArray(m.message.content)) return m.message.content.filter((c) => c.type === "tool_result" && c.is_error).map((c) => ({ tipo: "fallo", texto: (Array.isArray(c.content) ? c.content.map((x) => x.text || "").join(" ") : String(c.content || "")).slice(0, 300) }));
    if (m.type === "result") return [{
      tipo: "resultado", texto: m.result || "", coste: m.total_cost_usd || null, turnos: m.num_turns || null, error: !!m.is_error, sesion: m.session_id,
      denegadas: (m.permission_denials || []).map((d) => (d.tool_name === "Bash" ? `Bash: ${String((d.tool_input && d.tool_input.command) || "").slice(0, 120)}` : d.tool_name)),
    }];
    return [];
  },
};

// ---- Codex CLI (OpenAI) ----
// workspace-write: escribe solo dentro del repo y sin red (no puede publicar ni descargar); --ignore-user-config deja
// fuera los hooks y MCP personales, como --setting-sources en Claude.
const codex = {
  id: "codex", nombre: "Codex", bins: ["codex"], web: "https://github.com/openai/codex",
  sesionLogin: "codex login", permisos: "Sandbox workspace-write: solo escribe en el repo y sin red.",
  args({ sesion, modelo, cwd }) {
    const comun = ["--json", "--ignore-user-config", "--skip-git-repo-check", ...(modelo ? ["-m", modelo] : [])];
    if (sesion) return { args: ["exec", "resume", sesion, ...comun, "-c", 'sandbox_mode="workspace-write"', "-"], stdin: true, sistemaEnPrompt: true };
    return { args: ["exec", ...comun, "-s", "workspace-write", "-C", cwd || ROOT, "-"], stdin: true, sistemaEnPrompt: true };
  },
  parse(m, acc) {
    if (m.type === "thread.started" && m.thread_id) return [{ tipo: "sesion", id: m.thread_id }];
    if (m.type === "turn.completed") { acc.tokens = m.usage || null; return []; }
    if (m.type === "turn.failed" || m.type === "error") return [{ tipo: "fallo", texto: String((m.error && m.error.message) || m.message || "Error de Codex").slice(0, 300) }];
    if (m.type !== "item.completed" || !m.item) return [];
    const it = m.item;
    if (it.type === "agent_message" && it.text) { acc.ultimo = it.text; return [{ tipo: "texto", texto: it.text }]; }
    if (it.type === "command_execution") return [{ tipo: "herramienta", herramienta: "Bash", icono: "terminal", texto: it.exit_code === 0 ? "Ejecuta un comando" : `Comando con error (${it.exit_code})`, detalle: String(it.command || "").replace(/^\/bin\/zsh -lc /, "").slice(0, 400) }];
    if (it.type === "file_change") return (it.changes || []).map((c) => ({ tipo: "herramienta", herramienta: "Edit", icono: c.kind === "add" ? "crear" : "editar", texto: `${c.kind === "add" ? "Crea" : c.kind === "delete" ? "Borra" : "Edita"} ${rel(c.path)}`, archivo: rel(c.path) }));
    if (it.type === "mcp_tool_call") return [{ tipo: "herramienta", herramienta: it.tool || "MCP", icono: "herramienta", texto: `${it.server || "MCP"}: ${it.tool || ""}` }];
    if (it.type === "web_search") return [{ tipo: "herramienta", herramienta: "WebSearch", icono: "web", texto: `Busca en la web: ${it.query || ""}` }];
    if (it.type === "todo_list") return [{ tipo: "herramienta", herramienta: "TodoWrite", icono: "plan", texto: "Actualiza su lista de pasos", detalle: (it.items || []).map((t) => `${t.completed ? "[x]" : "[ ]"} ${t.text}`).join("\n") }];
    // Avisos de configuración que Codex emite como «error» pero no lo son.
    if (it.type === "error" && it.message && !/ignoring \d+ unrecognized configuration/.test(it.message)) return [{ tipo: "fallo", texto: it.message.slice(0, 300) }];
    return [];
  },
  fin(acc, code) { return { tipo: "resultado", texto: acc.ultimo || "", error: code !== 0, tokens: acc.tokens }; },
};

// ---- Cursor CLI ----
const cursor = {
  id: "cursor", nombre: "Cursor", bins: ["cursor-agent", "agent"], web: "https://cursor.com/cli",
  sesionLogin: "cursor-agent login", permisos: "Sin --force: los comandos que pidan aprobación se rechazan; sandbox activado.",
  args({ sesion, modelo, prompt, cwd }) {
    const a = ["-p", "--output-format", "stream-json", "--trust", "--sandbox", "enabled", "--workspace", cwd || ROOT, ...(modelo ? ["--model", modelo] : []), ...(sesion ? ["--resume", sesion] : [])];
    return { args: [...a, prompt], stdin: false, sistemaEnPrompt: true };
  },
  parse(m, acc) {
    if (m.type === "system" && m.session_id) return [{ tipo: "sesion", id: m.session_id }];
    if (m.type === "assistant" && m.message) return (m.message.content || []).filter((c) => c.type === "text" && c.text && c.text.trim()).map((c) => { acc.ultimo = c.text; return { tipo: "texto", texto: c.text }; });
    if (m.type === "tool_call" && m.subtype === "started" && m.tool_call) {
      const [k, v] = Object.entries(m.tool_call)[0] || [];
      const nombre = String(k || "herramienta").replace(/ToolCall$/, "");
      return [{ tipo: "herramienta", herramienta: nombre, ...resumen(nombre, (v && v.args) || {}) }];
    }
    if (m.type === "result") return [{ tipo: "resultado", texto: m.result || acc.ultimo || "", error: !!m.is_error, sesion: m.session_id }];
    return [];
  },
};

// ---- OpenCode ----
const opencode = {
  id: "opencode", nombre: "OpenCode", bins: ["opencode"], web: "https://opencode.ai",
  sesionLogin: "opencode auth login", permisos: "Permisos de su configuración (opencode.json); sin --auto.",
  args({ sesion, modelo, prompt, cwd }) {
    return { args: ["run", "--format", "json", "--dir", cwd || ROOT, ...(modelo ? ["-m", modelo] : []), ...(sesion ? ["--session", sesion] : []), prompt], stdin: false, sistemaEnPrompt: true };
  },
  parse(m, acc) {
    const out = [];
    if (m.sessionID && !acc.sesion) { acc.sesion = m.sessionID; out.push({ tipo: "sesion", id: m.sessionID }); }
    const p = m.part || {};
    if (m.type === "text" && (p.text || m.text)) { acc.ultimo = p.text || m.text; out.push({ tipo: "texto", texto: acc.ultimo }); }
    if (m.type === "tool_use" || m.type === "tool") { const inp = (p.state && p.state.input) || p.input || {}; out.push({ tipo: "herramienta", herramienta: p.tool || "herramienta", ...resumen(p.tool, inp) }); }
    if (m.type === "step_finish" && p.cost) acc.coste = (acc.coste || 0) + p.cost;
    if (m.type === "error") out.push({ tipo: "fallo", texto: String((m.error && ((m.error.data && m.error.data.message) || m.error.name)) || "Error de OpenCode").slice(0, 300) });
    return out;
  },
  fin(acc, code) { return { tipo: "resultado", texto: acc.ultimo || "", error: code !== 0, coste: acc.coste || null, sesion: acc.sesion }; },
};

// ---- Gemini CLI (sin probar en este equipo: no está instalado) ----
const gemini = {
  id: "gemini", nombre: "Gemini CLI", bins: ["gemini"], web: "https://github.com/google-gemini/gemini-cli", experimental: true,
  sesionLogin: "gemini", permisos: "--approval-mode auto_edit: edita sin preguntar, los comandos piden aprobación.",
  args({ sesion, modelo, prompt, cwd }) {
    return { args: ["-p", prompt, "--output-format", "stream-json", "--approval-mode", "auto_edit", ...(modelo ? ["-m", modelo] : []), ...(sesion ? ["--resume", sesion] : [])], stdin: false, sistemaEnPrompt: true };
  },
  parse(m, acc) {
    if (m.type === "init" && m.session_id) return [{ tipo: "sesion", id: m.session_id }];
    if (m.type === "message" && m.role === "assistant" && m.content) { acc.ultimo = (acc.delta ? acc.ultimo : "") + m.content; acc.delta = !!m.delta; return m.delta ? [] : [{ tipo: "texto", texto: m.content }]; }
    if (m.type === "tool_use") return [{ tipo: "herramienta", herramienta: m.tool_name, ...resumen(m.tool_name, m.parameters || {}) }];
    if (m.type === "result") return [{ tipo: "resultado", texto: acc.ultimo || "", error: m.status === "error" }];
    return [];
  },
};

// ---- Comando propio (Aider, Amp…): salida en texto plano ----
function partir(cmd) {
  const out = []; let cur = ""; let q = null;
  for (const ch of cmd) {
    if (q) { if (ch === q) q = null; else cur += ch; }
    else if (ch === '"' || ch === "'") q = ch;
    else if (/\s/.test(ch)) { if (cur) { out.push(cur); cur = ""; } }
    else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
const propio = {
  id: "propio", nombre: "Comando propio", bins: [], web: null,
  sesionLogin: null, permisos: "Los del propio comando.",
  args({ prompt, comando }) {
    const partes = partir(comando || "");
    if (!partes.length) throw new Error("Configura el comando en Ajustes → Encargos");
    const conPrompt = partes.some((x) => x.includes("{prompt}"));
    return { cmd: partes[0], args: partes.slice(1).map((x) => x.replaceAll("{prompt}", prompt)), stdin: !conPrompt, sistemaEnPrompt: true, texto: true };
  },
  parse(m, acc) { acc.todo = (acc.todo || "") + m + "\n"; return [{ tipo: "texto", texto: m }]; },
  fin(acc, code) { return { tipo: "resultado", texto: (acc.todo || "").trim().split("\n").slice(-40).join("\n"), error: code !== 0 }; },
};

export const ADAPTADORES = { claude, codex, cursor, opencode, gemini, propio };

// Qué hay instalado (ruta y versión). Se cachea 10 minutos.
let cache = null;
export async function disponibles(forzar = false) {
  if (cache && !forzar && Date.now() - cache.t < 600000) return cache.lista;
  const lista = [];
  for (const a of Object.values(ADAPTADORES)) {
    if (a.id === "propio") { lista.push({ id: a.id, nombre: a.nombre, instalado: true, version: null, permisos: a.permisos }); continue; }
    const bin = a.id === "claude" && process.env.CLAUDE_BIN ? process.env.CLAUDE_BIN : buscar(a.bins);
    const version = bin ? await run(bin, ["--version"]) : null;
    lista.push({ id: a.id, nombre: a.nombre, instalado: !!bin, bin, version: version ? version.split("\n")[0].slice(0, 60) : null, web: a.web, login: a.sesionLogin, permisos: a.permisos, experimental: !!a.experimental });
  }
  cache = { t: Date.now(), lista };
  return lista;
}

export async function binDe(id) {
  const a = ADAPTADORES[id];
  if (!a) throw new Error(`Agente desconocido: ${id}`);
  if (id === "propio") return null;
  const b = id === "claude" && process.env.CLAUDE_BIN ? process.env.CLAUDE_BIN : buscar(a.bins);
  if (!b) throw new Error(`${a.nombre} no está instalado en este equipo`);
  return b;
}
