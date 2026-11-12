// Cuenta caracteres como lo hace cada red, no a secas.
// X: algoritmo de twitter-text v3 (weightedLength): cada URL vale 23; los caracteres de los rangos latinos y de
// puntuación general pesan 1 y el resto (CJK, emoji…) pesa 2; el límite de 280 es en esas unidades.
// Threads: 500 caracteres. LinkedIn: 3000. (Valores de Postiz: libraries/helpers/src/utils/count.length.ts
// y maxLength() de cada proveedor.)
export const LIMITE = { X: 280, Threads: 500, LinkedIn: 3000 };

const URL_RE = /\bhttps?:\/\/[^\s]+|\b(?:[a-z0-9-]+\.)+(?:com|dev|io|app|ai|net|org|es|co|me|sh|so|xyz|design|studio)(?:\/[^\s]*)?/gi;
const PESO_1 = [[0, 4351], [8192, 8205], [8208, 8223], [8242, 8247]];

function pesoX(cp) {
  return PESO_1.some(([a, b]) => cp >= a && cp <= b) ? 1 : 2;
}

export function contar(texto, red) {
  const t = String(texto || "").normalize("NFC");
  if (red !== "X") return [...t].length;
  let total = 0;
  const sinUrls = t.replace(URL_RE, () => { total += 23; return ""; });
  // Un emoji compuesto (familia, piel, bandera) cuenta como un solo emoji de peso 2.
  const seg = typeof Intl !== "undefined" && Intl.Segmenter ? [...new Intl.Segmenter("es", { granularity: "grapheme" }).segment(sinUrls)].map((s) => s.segment) : [...sinUrls];
  for (const g of seg) {
    const cp = g.codePointAt(0);
    total += /\p{Extended_Pictographic}/u.test(g) ? 2 : pesoX(cp);
  }
  return total;
}

// { n, limite, sobra, nivel: ok | cerca | pasa }
export function medir(texto, red) {
  const n = contar(texto, red);
  const limite = LIMITE[red] || null;
  if (!limite) return { n, limite, nivel: "ok" };
  return { n, limite, sobra: limite - n, nivel: n > limite ? "pasa" : n > limite * 0.93 ? "cerca" : "ok" };
}
