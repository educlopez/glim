// Informe semanal de resultados: compara cada pieza publicada en una semana ISO con la mediana de tus propias piezas
// de la misma red en las 8 semanas anteriores, también por formato, plantilla, día de la semana y franja horaria.
// Los datos salen de las fotos fijas que la reconciliación con Buffer escribe en cada borrador (metricas.js):
// metricas_7d si existe y, si no, metricas_48h; cada pieza se compara solo con fotos del mismo tramo.
//
// Escribe <cerebro>/<rutas.informes>/AAAA-Www.md (por defecto informes/). Termina con «Propuestas de aprendizaje»,
// todas marcadas «sin aprobar»: el informe NUNCA escribe en el registro de aprendizajes. Las aprueba la persona
// (desde el Registro del panel o pidiéndoselo a un agente como feedback).
//
// Uso: node server/informe.js [--semana 2026-W46] [--cerebro /ruta/al/cerebro] [--salida -]
//      (sin --semana: la semana anterior a la de hoy; --salida - imprime en vez de escribir)
// También: POST /api/informe { semana } (api.js).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mediana } from "./metricas.js";

const DIA = 86400e3;
const SEMANAS_BASE = 8;
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const METRICAS = ["impresiones", "engagement"];
const MIN_BASE = 3;

// ---- Semanas ISO (lunes a domingo) ----
const utc = (dia) => new Date(`${dia}T00:00:00Z`);
const diaDe = (d) => d.toISOString().slice(0, 10);

export function semanaDe(dia) {
  const d = utc(dia);
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const año = d.getUTCFullYear();
  const n = Math.ceil(((d - Date.UTC(año, 0, 1)) / DIA + 1) / 7);
  return `${año}-W${String(n).padStart(2, "0")}`;
}

export function rangoSemana(semana) {
  const m = /^(\d{4})-W(\d{2})$/.exec(String(semana || ""));
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 53) throw new Error(`Semana no válida: «${semana}» (formato AAAA-Www, p. ej. 2026-W46)`);
  const ene4 = new Date(Date.UTC(Number(m[1]), 0, 4));
  const lunes = new Date(ene4.getTime() - ((ene4.getUTCDay() || 7) - 1) * DIA + (Number(m[2]) - 1) * 7 * DIA);
  if (semanaDe(diaDe(lunes)) !== semana) throw new Error(`La semana ${semana} no existe`);
  return { desde: diaDe(lunes), hasta: diaDe(new Date(lunes.getTime() + 6 * DIA)) };
}

export const semanaAnterior = (hoy) => semanaDe(diaDe(new Date(utc(hoy).getTime() - 7 * DIA)));

export function franja(hora) {
  if (!hora) return null;
  const h = Number(hora.slice(0, 2));
  if (h >= 6 && h < 12) return "mañana";
  if (h >= 12 && h < 16) return "mediodía";
  if (h >= 16 && h < 21) return "tarde";
  return "noche";
}

const FORMATO = { carrusel: "carrusel", video: "vídeo", image: "imagen", pdf: "pdf" };
export const formatoDe = (p) => FORMATO[p.visual && p.visual.tipo] || (p.visual && p.visual.formato) || "texto";

// Posts (posts.js) → una fila por pieza y red con métricas y los rasgos con los que se agrupa.
export function piezasDe(posts) {
  const out = [];
  for (const p of posts) {
    if (p.estado !== "publicado" || !p.fecha || !p.fecha.dia) continue;
    for (const red of p.redes) {
      const fotos = {};
      for (const tramo of ["48h", "7d"]) {
        const f = p.instantaneas && p.instantaneas[tramo];
        if (f && f.redes[red]) fotos[tramo] = f.redes[red];
      }
      out.push({
        path: p.path, titulo: p.titulo, red, dia: p.fecha.dia, hora: p.fecha.hora || null,
        formato: formatoDe(p), plantilla: p.plantilla || null, diaSemana: DIAS[utc(p.fecha.dia).getUTCDay()], franja: franja(p.fecha.hora), fotos,
      });
    }
  }
  return out.sort((a, b) => a.dia.localeCompare(b.dia) || (a.hora || "").localeCompare(b.hora || "") || a.path.localeCompare(b.path) || a.red.localeCompare(b.red));
}

const tramoDe = (x) => (x.fotos["7d"] ? "7d" : x.fotos["48h"] ? "48h" : null);
const valor = (x, tramo, m) => (x.fotos[tramo] ? x.fotos[tramo][m] : undefined);

// Mediana de la base para una métrica, con un filtro opcional por rasgo. { n, mediana }.
export function base(items, { red, tramo, metrica, rasgo, igual }) {
  const vals = items.filter((x) => x.red === red && (!rasgo || x[rasgo] === igual)).map((x) => valor(x, tramo, metrica)).filter((v) => typeof v === "number");
  return { n: vals.length, mediana: mediana(vals) };
}

const fmt = (m, v) => (v == null ? "—" : m === "engagement" ? `${v.toFixed(2)}%` : String(Math.round(v)));
const ratio = (v, b) => (v == null || !b || b.mediana == null || b.mediana === 0 ? null : v / b.mediana);
const celda = (m, v, b) => {
  if (!b.n) return "—";
  const r = ratio(v, b);
  return `${fmt(m, b.mediana)} (${r == null ? "—" : `${r.toFixed(2)}x`}, n=${b.n})`;
};
const RASGOS = [["formato", "Mismo formato"], ["plantilla", "Misma plantilla"], ["diaSemana", "Mismo día"], ["franja", "Misma franja"]];

// Núcleo puro: todo lo que hace falta entra por argumento.
export function construir({ posts, semana, generado = new Date().toISOString(), nombre = "" }) {
  const { desde, hasta } = rangoSemana(semana);
  const baseDesde = diaDe(new Date(utc(desde).getTime() - SEMANAS_BASE * 7 * DIA));
  const baseHasta = diaDe(new Date(utc(desde).getTime() - DIA));
  const todas = piezasDe(posts);
  const semanaItems = todas.filter((x) => x.dia >= desde && x.dia <= hasta);
  const baseItems = todas.filter((x) => x.dia >= baseDesde && x.dia <= baseHasta);
  const redes = [...new Set([...semanaItems, ...baseItems].map((x) => x.red))].sort();
  const L = [];
  L.push(`# Informe semanal ${semana}${nombre ? ` · ${nombre}` : ""}`, "");
  L.push(`_Piezas publicadas del ${desde} al ${hasta}. Base: mediana de tus piezas de la misma red publicadas del ${baseDesde} al ${baseHasta} (${SEMANAS_BASE} semanas). Datos: fotos \`metricas_7d\` o, si aún no hay, \`metricas_48h\` del frontmatter de cada borrador; cada pieza se compara con fotos del mismo tramo. Generado por Glim el ${generado.slice(0, 10)}._`, "");

  L.push("## Resumen", "");
  if (!redes.length) L.push("No hay piezas publicadas en esta semana ni en la base.", "");
  else {
    L.push("| Red | Piezas esta semana | Con métricas | Piezas en la base con métricas |", "|---|---|---|---|");
    for (const r of redes) {
      const s = semanaItems.filter((x) => x.red === r);
      L.push(`| ${r} | ${s.length} | ${s.filter(tramoDe).length} | ${baseItems.filter((x) => x.red === r && tramoDe(x)).length} |`);
    }
    L.push("");
  }

  const propuestas = [];
  const conMetricas = semanaItems.filter(tramoDe);
  L.push("## Piezas", "");
  if (!conMetricas.length) L.push("Ninguna pieza de esta semana tiene todavía fotos de métricas (se toman a las 48 h y a los 7 días de salir).", "");
  for (const x of conMetricas) {
    const tramo = tramoDe(x);
    L.push(`### ${x.titulo} · ${x.red}`, "");
    L.push(`- Borrador: \`${x.path}\``);
    L.push(`- ${x.diaSemana} ${x.dia}${x.hora ? ` ${x.hora} (${x.franja})` : ""} · formato ${x.formato}${x.plantilla ? ` · plantilla \`${x.plantilla}\`` : ""} · foto ${tramo}`, "");
    L.push(`| Métrica | Valor | Mediana de la red | ${RASGOS.map((r) => r[1]).join(" | ")} |`, `|---|---|---|${RASGOS.map(() => "---").join("|")}|`);
    for (const m of METRICAS) {
      const v = valor(x, tramo, m);
      const bRed = base(baseItems, { red: x.red, tramo, metrica: m });
      const cols = RASGOS.map(([k]) => (x[k] == null ? "—" : celda(m, v, base(baseItems, { red: x.red, tramo, metrica: m, rasgo: k, igual: x[k] }))));
      L.push(`| ${m} | ${fmt(m, v)} | ${celda(m, v, bRed)} | ${cols.join(" | ")} |`);
      if (m === "impresiones" && bRed.n >= MIN_BASE) {
        const r = ratio(v, bRed);
        const que = `formato ${x.formato}${x.plantilla ? `, plantilla \`${x.plantilla}\`` : ""}, ${x.diaSemana}${x.franja ? ` por la ${x.franja}` : ""}`;
        if (r != null && r >= 1.5) propuestas.push(`En ${x.red}, «${x.titulo}» (${que}) sacó ${r.toFixed(2)}x la mediana de impresiones de la red (foto ${tramo}, n=${bRed.n}). Propuesta: repetir esa combinación y comprobar si se mantiene.`);
        if (r != null && r <= 0.67) propuestas.push(`En ${x.red}, «${x.titulo}» (${que}) se quedó en ${r.toFixed(2)}x la mediana de impresiones de la red (foto ${tramo}, n=${bRed.n}). Propuesta: revisar el gancho o el visual antes de repetir esa combinación.`);
      }
    }
    L.push("");
  }

  // Medianas de la base por grupo: lo que dice el histórico, sin mirar esta semana.
  L.push(`## Medianas de la base por grupo`, "");
  let grupos = 0;
  for (const r of redes) {
    for (const tramo of ["7d", "48h"]) {
      const items = baseItems.filter((x) => x.red === r && x.fotos[tramo]);
      if (!items.length) continue;
      const total = base(items, { red: r, tramo, metrica: "impresiones" });
      L.push(`### ${r} · foto ${tramo} (n=${items.length}, mediana de impresiones ${fmt("impresiones", total.mediana)})`, "");
      L.push("| Grupo | n | Impresiones (mediana) | Engagement (mediana) |", "|---|---|---|---|");
      for (const [k, nombreRasgo] of RASGOS) {
        const valores = [...new Set(items.map((x) => x[k]).filter((v) => v != null))].sort();
        for (const v of valores) {
          const bi = base(items, { red: r, tramo, metrica: "impresiones", rasgo: k, igual: v });
          const be = base(items, { red: r, tramo, metrica: "engagement", rasgo: k, igual: v });
          L.push(`| ${nombreRasgo.replace(/^Mism[oa] /, "")}: ${v} | ${bi.n} | ${fmt("impresiones", bi.mediana)} | ${fmt("engagement", be.mediana)} |`);
          const rr = ratio(bi.mediana, total);
          if (bi.n >= MIN_BASE && total.n >= MIN_BASE * 2 && rr != null && (rr >= 1.3 || rr <= 0.77)) {
            propuestas.push(`En ${r}, las piezas con ${nombreRasgo.replace(/^Mism[oa] /, "").toLowerCase()} «${v}» tienen una mediana de impresiones de ${rr.toFixed(2)}x la de la red en las ${SEMANAS_BASE} semanas anteriores (foto ${tramo}, n=${bi.n} de ${total.n}). Propuesta: ${rr >= 1.3 ? "darle más peso en la cadencia" : "usarlo menos o cambiar cómo se hace"}.`);
          }
        }
      }
      L.push("");
      grupos++;
    }
  }
  if (!grupos) L.push("Sin piezas con métricas en la base todavía.", "");

  const sin = semanaItems.filter((x) => !tramoDe(x));
  if (sin.length) {
    L.push("## Sin métricas todavía", "");
    for (const x of sin) L.push(`- ${x.titulo} · ${x.red} (\`${x.path}\`, ${x.dia})`);
    L.push("");
  }

  L.push("## Propuestas de aprendizaje", "");
  L.push("_Ninguna está aprobada ni copiada al registro de aprendizajes. Para aprobar una, pásala al Registro del panel o pídeselo a un agente como feedback._", "");
  if (!propuestas.length) L.push(`- **sin aprobar** · Ninguna por ahora: hacen falta al menos ${MIN_BASE} piezas con métricas de la misma red en la base para comparar.`);
  for (const p of propuestas.slice(0, 12)) L.push(`- **sin aprobar** · ${p}`);
  L.push("");
  return { texto: L.join("\n"), desde, hasta, piezas: semanaItems.length, conMetricas: conMetricas.length, propuestas: propuestas.length };
}

// Con el cerebro cargado: lee los borradores y escribe (o no) el informe.
export async function generar({ semana, escribir = true } = {}) {
  const cerebro = await import("./cerebro.js");
  const { posts } = await import("./posts.js");
  const hoy = cerebro.hoy();
  const s = semana || semanaAnterior(hoy);
  const r = construir({ posts: posts(hoy), semana: s, nombre: cerebro.cfg.nombre });
  const rel = `${cerebro.rutas.informes || "informes"}/${s}.md`;
  if (escribir) {
    const abs = path.join(cerebro.ROOT, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const antes = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
    // La fecha de generación cambia cada día: si solo cambia eso, no se reescribe (diffs limpios en git).
    const sinFecha = (t) => String(t || "").replace(/Generado por Glim el \d{4}-\d{2}-\d{2}/, "");
    if (sinFecha(antes) !== sinFecha(r.texto)) fs.writeFileSync(abs, r.texto);
  }
  return { semana: s, path: rel, desde: r.desde, hasta: r.hasta, piezas: r.piezas, conMetricas: r.conMetricas, propuestas: r.propuestas, texto: r.texto };
}

// ---- Línea de comandos ----
function args(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--semana") o.semana = argv[++i];
    else if (a === "--cerebro") o.cerebro = argv[++i];
    else if (a === "--salida") o.salida = argv[++i];
    else if (/^--semana=/.test(a)) o.semana = a.slice(9);
    else if (/^--cerebro=/.test(a)) o.cerebro = a.slice(10);
  }
  return o;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = args(process.argv.slice(2));
  if (o.cerebro) process.env.GLIM_BRAIN = path.resolve(o.cerebro);
  generar({ semana: o.semana, escribir: o.salida !== "-" })
    .then((r) => {
      if (o.salida === "-") process.stdout.write(r.texto);
      else console.log(`Informe ${r.semana}: ${r.path} (${r.piezas} piezas, ${r.conMetricas} con métricas, ${r.propuestas} propuestas sin aprobar)`);
    })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
