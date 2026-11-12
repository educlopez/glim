// Registro de decisiones y aprendizajes. La fuente única es estrategia/aprendizajes.md (regla 23 de AGENTS.md):
// el panel la lee entrada a entrada y añade las nuevas arriba con el mismo formato.
import fs from "node:fs";
import path from "node:path";
import { ROOT, read, hoyLocal } from "./repo.js";
import { rutas } from "./cerebro.js";

const P = rutas.aprendizajes;
const CAB = /^### (\d{4}-\d{2}-\d{2})\s*·\s*([^·]+?)\s*·\s*(.+)$/;

export function registro() {
  const lines = (read(P) || "").split("\n");
  const out = [];
  let fence = false;
  let cur = null;
  for (const l of lines) {
    if (/^```/.test(l)) fence = !fence;
    const m = !fence && CAB.exec(l);
    if (m) {
      cur = { fecha: m[1], ambito: m[2].trim(), titulo: m[3].trim(), cuerpo: [] };
      out.push(cur);
    } else if (cur && !/^#{1,3} /.test(l)) cur.cuerpo.push(l);
    else if (/^#{1,3} /.test(l) && !fence) cur = null;
  }
  return out.map((e, i) => {
    const cuerpo = e.cuerpo.join("\n").trim();
    // Viñetas de primer nivel ("- Clave: valor"); las líneas sangradas siguen a la viñeta anterior.
    const items = [];
    for (const l of e.cuerpo) {
      if (/^- /.test(l)) items.push(l.slice(2));
      else if (items.length && l.trim()) items[items.length - 1] += "\n" + l;
    }
    const campo = (k) => { const it = items.find((x) => x.startsWith(`${k}:`)); return it ? it.slice(k.length + 1).trim() : ""; };
    return { n: i, fecha: e.fecha, ambito: e.ambito, titulo: e.titulo, cuerpo, quePaso: campo("Qué pasó"), aprendimos: campo("Qué aprendimos"), accion: campo("Acción"), panel: /Origen: panel/.test(cuerpo) };
  });
}

const una = (s) => String(s || "").replace(/\s*\n\s*/g, " ").trim();

export function anadir({ ambito, titulo, quePaso, aprendimos, accion, origen }) {
  if (!una(titulo)) throw new Error("Falta el título");
  if (!una(aprendimos) && !una(quePaso)) throw new Error("Escribe qué pasó o qué aprendimos");
  const entrada = [
    `### ${hoyLocal()} · ${una(ambito) || "repo"} · ${una(titulo)}`,
    una(quePaso) ? `- Qué pasó: ${una(quePaso)}` : null,
    una(aprendimos) ? `- Qué aprendimos: ${una(aprendimos)}` : null,
    `- Acción: ${una(accion) || "nada por ahora"}`,
    `- Origen: panel${origen ? ` (${una(origen)})` : ""}`,
    "",
  ].filter((x) => x !== null).join("\n");
  const text = read(P) || "# Aprendizajes\n\n";
  const lines = text.split("\n");
  // Va justo encima de la primera entrada real (fuera del bloque de formato).
  let fence = false;
  let at = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (/^```/.test(lines[i])) fence = !fence;
    if (!fence && CAB.test(lines[i])) { at = i; break; }
  }
  lines.splice(at, 0, ...entrada.split("\n"));
  fs.writeFileSync(path.join(ROOT, P), lines.join("\n"));
  return registro()[0];
}
