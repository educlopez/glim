// Contexto previo de un encargo: lo que el agente debería leer antes de tocar nada y lo último que se ha aprendido.
// Va en el prompt (encargos.js → prompt()) entre «Sobre qué» y «Cómo trabajar". Siempre acotado: cada bloque tiene
// su tope y el total no pasa de TOPE caracteres, para no llenar el contexto del agente.
// Sin dependencias del cerebro: todo entra por argumento (lo prueba test/metricas.test.js).
import { formatear } from "./metricas.js";

export const TOPE = 3500;
const TOPE_LINEA = 220;
const corta = (s, n = TOPE_LINEA) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

// Primera línea con texto de una entrada del registro (sin la viñeta).
const primera = (cuerpo) => (String(cuerpo || "").split("\n").map((l) => l.replace(/^\s*-\s*/, "").trim()).find(Boolean) || "");

// Las piezas publicadas más parecidas al post del encargo: misma red y misma plantilla o, si no, mismo tipo de visual.
// Solo las que tienen fotos de métricas. Las de la misma plantilla van primero; dentro, las más recientes.
export function parecidas(post, posts, n = 5) {
  if (!post) return [];
  const redes = new Set(post.redes || []);
  const tipo = post.visual && post.visual.tipo;
  const con = (p) => p.instantaneas && (p.instantaneas["48h"] || p.instantaneas["7d"]);
  return posts
    .filter((p) => p.id !== post.id && p.estado === "publicado" && con(p) && (p.redes || []).some((r) => redes.has(r)))
    .map((p) => ({ p, plantilla: !!post.plantilla && p.plantilla === post.plantilla, tipo: !!tipo && p.visual && p.visual.tipo === tipo }))
    .filter((x) => x.plantilla || x.tipo)
    .sort((a, b) => Number(b.plantilla) - Number(a.plantilla) || ((b.p.fecha && b.p.fecha.dia) || "").localeCompare((a.p.fecha && a.p.fecha.dia) || ""))
    .slice(0, n)
    .map((x) => x.p);
}

// Bloque Markdown. leerAntes: rutas ya filtradas a las que existen. entradas: registro() (lo más nuevo primero).
export function contextoPrevio({ leerAntes = [], entradas = [], post = null, posts = [], aprendizajes = null, tope = TOPE } = {}) {
  const bloques = [];
  if (leerAntes.length) bloques.push(["### Lee antes de empezar", ...leerAntes.slice(0, 12).map((r) => `- ${r}`)].join("\n"));
  const ultimas = entradas.slice(0, 8);
  if (ultimas.length) {
    bloques.push([
      `### Últimos aprendizajes${aprendizajes ? ` (${aprendizajes}, lo más nuevo primero)` : ""}`,
      ...ultimas.map((e) => `- ${e.fecha} · ${corta(e.ambito, 40)} · ${corta(e.titulo, 90)}${primera(e.cuerpo) ? `: ${corta(primera(e.cuerpo), 140)}` : ""}`),
    ].join("\n"));
  }
  const similares = parecidas(post, posts);
  if (similares.length) {
    bloques.push([
      "### Métricas de piezas parecidas ya publicadas",
      ...similares.map((p) => {
        const fotos = ["48h", "7d"].filter((t) => p.instantaneas[t]).map((t) => `${t} ${corta(formatear(p.instantaneas[t].redes, p.instantaneas[t].tomadas || "?"), 160)}`);
        return `- ${p.path}${p.plantilla ? ` (plantilla ${p.plantilla})` : ""}: ${fotos.join(" | ")}`;
      }),
    ].join("\n"));
  }
  if (!bloques.length) return "";
  let texto = bloques.join("\n\n");
  if (texto.length > tope) texto = `${texto.slice(0, tope - 40).replace(/\n[^\n]*$/, "")}\n- (recortado: lee el archivo completo)`;
  return texto;
}
