import { describe, expect, it } from "vitest";
import { ROOT } from "../server/cerebro.js";
import { ADAPTADORES, resumen } from "../server/agentes.js";

const { claude, codex, propio } = ADAPTADORES;

describe("Claude Code (stream-json)", () => {
  it("init da la sesión", () => {
    expect(claude.parse({ type: "system", subtype: "init", session_id: "s-1", tools: [] })).toEqual([{ tipo: "sesion", id: "s-1" }]);
  });

  it("assistant: texto y herramientas", () => {
    const ev = claude.parse({
      type: "assistant",
      message: { content: [
        { type: "text", text: "Voy a leer las reglas." },
        { type: "text", text: "   " },
        { type: "tool_use", id: "t1", name: "Read", input: { file_path: `${ROOT}/AGENTS.md` } },
        { type: "tool_use", id: "t2", name: "Bash", input: { command: "ls", description: "Lista archivos" } },
      ] },
    });
    expect(ev).toEqual([
      { tipo: "texto", texto: "Voy a leer las reglas." },
      { tipo: "herramienta", herramienta: "Read", icono: "leer", texto: "Lee AGENTS.md", archivo: null },
      { tipo: "herramienta", herramienta: "Bash", icono: "terminal", texto: "Lista archivos", detalle: "ls" },
    ]);
  });

  it("user: solo los tool_result con error son fallos", () => {
    const ev = claude.parse({ type: "user", message: { content: [
      { type: "tool_result", tool_use_id: "t1", content: "ok" },
      { type: "tool_result", tool_use_id: "t2", is_error: true, content: [{ type: "text", text: "Permiso denegado" }] },
    ] } });
    expect(ev).toEqual([{ tipo: "fallo", texto: "Permiso denegado" }]);
  });

  it("result: texto, coste, turnos y denegadas", () => {
    const [r] = claude.parse({
      type: "result", subtype: "success", is_error: false, result: "Hecho.", total_cost_usd: 0.12, num_turns: 4, session_id: "s-1",
      permission_denials: [{ tool_name: "Bash", tool_input: { command: "git push" } }, { tool_name: "WebFetch", tool_input: {} }],
    });
    expect(r).toEqual({ tipo: "resultado", texto: "Hecho.", coste: 0.12, turnos: 4, error: false, sesion: "s-1", denegadas: ["Bash: git push", "WebFetch"] });
  });

  it("ignora eventos desconocidos", () => {
    expect(claude.parse({ type: "stream_event" })).toEqual([]);
  });

  it("args incluye el aislamiento y reanuda la sesión", () => {
    const { args, stdin } = claude.args({ sistema: "S", sesion: "s-1", modelo: "sonnet", permitidas: ["Read"], prohibidas: ["Bash(git push:*)"] });
    expect(stdin).toBe(true);
    expect(args).toEqual(expect.arrayContaining(["--strict-mcp-config", "--setting-sources", "project,local", "--resume", "s-1", "--model", "sonnet"]));
  });
});

describe("Codex (exec --json)", () => {
  it("normaliza los eventos de un turno", () => {
    const acc = {};
    const lineas = [
      { type: "thread.started", thread_id: "th-9" },
      { type: "turn.started" },
      { type: "item.completed", item: { id: "i0", type: "reasoning", text: "pensando" } },
      { type: "item.completed", item: { id: "i1", type: "command_execution", command: "/bin/zsh -lc 'ls -la'", exit_code: 0, status: "completed" } },
      { type: "item.completed", item: { id: "i2", type: "command_execution", command: "npm test", exit_code: 1, status: "failed" } },
      { type: "item.completed", item: { id: "i3", type: "file_change", changes: [{ path: `${ROOT}/borradores/nuevo.md`, kind: "add" }, { path: "AGENTS.md", kind: "update" }], status: "completed" } },
      { type: "item.completed", item: { id: "i4", type: "error", message: "ignoring 2 unrecognized configuration keys" } },
      { type: "item.completed", item: { id: "i5", type: "agent_message", text: "Listo." } },
      { type: "turn.completed", usage: { input_tokens: 100, output_tokens: 20 } },
    ];
    const ev = lineas.flatMap((m) => codex.parse(m, acc));
    expect(ev).toEqual([
      { tipo: "sesion", id: "th-9" },
      { tipo: "herramienta", herramienta: "Bash", icono: "terminal", texto: "Ejecuta un comando", detalle: "'ls -la'" },
      { tipo: "herramienta", herramienta: "Bash", icono: "terminal", texto: "Comando con error (1)", detalle: "npm test" },
      { tipo: "herramienta", herramienta: "Edit", icono: "crear", texto: "Crea borradores/nuevo.md", archivo: "borradores/nuevo.md" },
      { tipo: "herramienta", herramienta: "Edit", icono: "editar", texto: "Edita AGENTS.md", archivo: "AGENTS.md" },
      { tipo: "texto", texto: "Listo." },
    ]);
    expect(codex.fin(acc, 0)).toEqual({ tipo: "resultado", texto: "Listo.", error: false, tokens: { input_tokens: 100, output_tokens: 20 } });
    expect(codex.fin(acc, 1).error).toBe(true);
  });

  it("turn.failed y error son fallos", () => {
    expect(codex.parse({ type: "turn.failed", error: { message: "sin cuota" } }, {})).toEqual([{ tipo: "fallo", texto: "sin cuota" }]);
    expect(codex.parse({ type: "error", message: "se cayó" }, {})).toEqual([{ tipo: "fallo", texto: "se cayó" }]);
  });

  it("args usa sandbox workspace-write y no lee la configuración del usuario", () => {
    const { args } = codex.args({});
    expect(args).toEqual(expect.arrayContaining(["exec", "--json", "--ignore-user-config", "-s", "workspace-write"]));
  });
});

describe("comando propio", () => {
  it("parte el comando respetando comillas y sustituye {prompt}", () => {
    const r = propio.args({ prompt: "hola mundo", comando: `aider --message "{prompt}" --yes 'a b'` });
    expect(r.cmd).toBe("aider");
    expect(r.args).toEqual(["--message", "hola mundo", "--yes", "a b"]);
    expect(r.stdin).toBe(false);
  });

  it("sin comando, error claro", () => {
    expect(() => propio.args({ prompt: "x", comando: "  " })).toThrow(/Configura el comando/);
  });
});

describe("resumen()", () => {
  it("lista de pasos", () => {
    expect(resumen("TodoWrite", { todos: [{ content: "a", status: "completed" }, { content: "b", status: "pending" }] }).detalle).toBe("[x] a\n[ ] b");
  });
  it("herramienta desconocida", () => {
    expect(resumen("Rara", {})).toEqual({ icono: "herramienta", texto: "Rara" });
  });
});
