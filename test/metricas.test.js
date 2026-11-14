// Bucle de métricas: fotos fijas en el borrador (48 h / 7 días, sin pisar), informe semanal (medianas) y contexto
// acotado de los encargos.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatear, normalizar, parsear, tomarInstantaneas, mediana } from "../server/metricas.js";
import { construir, rangoSemana, semanaDe, semanaAnterior, franja } from "../server/informe.js";
import { contextoPrevio, parecidas } from "../server/contexto.js";
import { reconciliar } from "../server/reconciliar.js";
import { posts } from "../server/posts.js";

const RAIZ = process.env.GLIM_BRAIN;
const H = 3600e3;

// Doc mínimo con la interfaz de reconciliar.js (campo/poner) sobre un objeto.
function docFalso(inicial = {}) {
  const fm = { ...inicial };
  const orden = Object.keys(fm);
  return {
    fm, orden,
    campo: (k) => fm[k] || "",
    poner(k, v, despues) { if (!(k in fm)) { const i = orden.indexOf(despues); orden.splice(i >= 0 ? i + 1 : orden.length, 0, k); } fm[k] = v; },
  };
}
const enviado = (sentAt, metricas, extra = {}) => ({ id: "a".repeat(24), estado: "sent", sentAt, servicio: "twitter", metricas, ...extra });
const M = [{ tipo: "impressions", valor: 1000 }, { tipo: "reactions", valor: 10 }, { tipo: "comments", valor: 5 }, { tipo: "reposts", valor: 5 }];

describe("metricas: formato", () => {
  it("normaliza los tipos de Buffer y calcula el engagement si falta", () => {
    expect(normalizar(M)).toEqual({ impresiones: 1000, reacciones: 10, comentarios: 5, compartidos: 5, engagement: 2 });
    expect(normalizar([{ tipo: "impressions", valor: 10 }, { tipo: "engagementRate", valor: 3.5 }]).engagement).toBe(3.5);
  });

  it("formatear y parsear son inversas y el orden de redes es fijo", () => {
    const linea = formatear({ Threads: { impresiones: 50 }, X: normalizar(M) }, "2026-11-12T10:00Z");
    expect(linea).toBe("X: impresiones 1000, reacciones 10, comentarios 5, compartidos 5, engagement 2.00% · Threads: impresiones 50 · tomadas: 2026-11-12T10:00Z");
    expect(parsear(linea)).toEqual({ redes: { X: normalizar(M), Threads: { impresiones: 50 } }, tomadas: "2026-11-12T10:00Z" });
    expect(parsear("")).toBeNull();
  });

  it("mediana con pares e impares", () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([4, 1, 3, 2])).toBe(2.5);
    expect(mediana([])).toBeNull();
  });
});

describe("metricas: fotos 48 h y 7 días", () => {
  const salida = Date.UTC(2026, 10, 10, 9, 0);

  it("antes de 48 h no escribe nada", () => {
    const d = docFalso({ estado: "publicado" });
    expect(tomarInstantaneas(d, [enviado(new Date(salida).toISOString(), M)], salida + 47 * H)).toEqual([]);
    expect(d.fm.metricas_48h).toBeUndefined();
  });

  it("a las 48 h escribe metricas_48h tras publicado_url y a los 7 días metricas_7d tras ella", () => {
    const d = docFalso({ estado: "publicado", publicado_url: "https://x.com/a/status/1", media: "x" });
    expect(tomarInstantaneas(d, [enviado(new Date(salida).toISOString(), M)], salida + 50 * H)).toEqual(["metricas_48h"]);
    expect(d.orden).toEqual(["estado", "publicado_url", "metricas_48h", "media"]);
    expect(d.fm.metricas_48h).toContain("X: impresiones 1000");
    const otra = [{ tipo: "impressions", valor: 9999 }];
    expect(tomarInstantaneas(d, [enviado(new Date(salida).toISOString(), otra)], salida + 8 * 24 * H)).toEqual(["metricas_7d"]);
    expect(d.orden).toEqual(["estado", "publicado_url", "metricas_48h", "metricas_7d", "media"]);
    // La foto de 48 h no se ha pisado.
    expect(d.fm.metricas_48h).toContain("impresiones 1000");
    expect(d.fm.metricas_7d).toContain("impresiones 9999");
  });

  it("nunca pisa una foto existente", () => {
    const d = docFalso({ metricas_48h: "X: impresiones 1 · tomadas: antes", metricas_7d: "X: impresiones 2 · tomadas: antes" });
    expect(tomarInstantaneas(d, [enviado(new Date(salida).toISOString(), M)], salida + 30 * 24 * H)).toEqual([]);
    expect(d.fm.metricas_48h).toBe("X: impresiones 1 · tomadas: antes");
  });

  it("cada foto solo dentro de su ventana: 48 h entre 48 y 72 h, 7 días entre 7 y 9 días", () => {
    const sale = new Date(salida).toISOString();
    expect(tomarInstantaneas(docFalso({}), [enviado(sale, M)], salida + 72 * H)).toEqual([]);
    expect(tomarInstantaneas(docFalso({}), [enviado(sale, M)], salida + 5 * 24 * H)).toEqual([]);
    expect(tomarInstantaneas(docFalso({}), [enviado(sale, M)], salida + 7 * 24 * H)).toEqual(["metricas_7d"]);
    expect(tomarInstantaneas(docFalso({}), [enviado(sale, M)], salida + 9 * 24 * H)).toEqual([]);
  });

  it("una pieza antigua (enero) no recibe ninguna foto", () => {
    const d = docFalso({ estado: "publicado" });
    expect(tomarInstantaneas(d, [enviado("2026-01-15T10:00:00Z", M)], salida)).toEqual([]);
    expect(Object.keys(d.fm)).toEqual(["estado"]);
  });

  it("sin datos de Buffer no escribe ceros", () => {
    const sale = new Date(salida).toISOString();
    const ceros = [{ tipo: "impressions", valor: 0 }, { tipo: "reactions", valor: 0 }, { tipo: "comments", valor: 0 }];
    expect(tomarInstantaneas(docFalso({}), [enviado(sale, ceros)], salida + 50 * H)).toEqual([]);
    expect(tomarInstantaneas(docFalso({}), [enviado(sale, [])], salida + 50 * H)).toEqual([]);
    expect(tomarInstantaneas(docFalso({}), [enviado(sale, [{ tipo: "reactions", valor: 3 }])], salida + 50 * H)).toEqual([]);
    // Una red con datos y otra sin ellos: solo entra la que tiene.
    const d = docFalso({});
    tomarInstantaneas(d, [enviado(sale, M), enviado(sale, ceros, { id: "b".repeat(24), servicio: "threads" })], salida + 50 * H);
    expect(d.fm.metricas_48h).not.toContain("Threads");
    expect(tomarInstantaneas(docFalso({}), [{ ...enviado(sale, M), estado: "scheduled" }], salida + 50 * H)).toEqual([]);
  });

  it("métricas refrescadas antes de la ventana no valen para ese tramo", () => {
    const sale = new Date(salida).toISOString();
    const viejas = new Date(salida + 20 * H).toISOString();
    expect(tomarInstantaneas(docFalso({}), [enviado(sale, M, { metricasEn: viejas })], salida + 50 * H)).toEqual([]);
    expect(tomarInstantaneas(docFalso({}), [enviado(sale, M, { metricasEn: new Date(salida + 49 * H).toISOString() })], salida + 50 * H)).toEqual(["metricas_48h"]);
  });

  it("reconciliar escribe la foto en el borrador enlazado una sola vez", () => {
    const id = "0123456789abcdef01234567";
    const f = path.join(RAIZ, "borradores", "2026-11-01-x-con-metricas.md");
    fs.writeFileSync(f, `---\nred: X\nidioma: en\nestado: programado\nmedia: media/a.png\nbuffer: ${id} (X, scheduled)\n---\n\n**X**\n\nTexto.\n`);
    const sentAt = new Date(Date.now() - 60 * H).toISOString();
    const b = { conectado: true, completo: true, canales: [], posts: [{ id, estado: "sent", sentAt, dueAt: sentAt, creado: sentAt, servicio: "twitter", enlace: "https://x.com/a/status/1", texto: "Texto.", metricas: M }] };
    const r = reconciliar(b);
    expect(r.metricas).toEqual([{ path: "2026-11-01-x-con-metricas.md", claves: ["metricas_48h"] }]);
    const t1 = fs.readFileSync(f, "utf8");
    expect(t1).toMatch(/\nmetricas_48h: X: impresiones 1000, reacciones 10, comentarios 5, compartidos 5, engagement 2\.00% · tomadas: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z\n/);
    expect(t1).toContain("estado: publicado");
    // Segunda vuelta con otras cifras: no cambia nada.
    b.posts[0].metricas = [{ tipo: "impressions", valor: 5 }];
    expect(reconciliar(b).metricas).toEqual([]);
    expect(fs.readFileSync(f, "utf8")).toBe(t1);
    // posts.js lo lee.
    const p = posts("2026-11-14").find((x) => x.id === "2026-11-01-x-con-metricas");
    expect(p.instantaneas["48h"].redes.X.impresiones).toBe(1000);
    fs.rmSync(f);
  });

  it("reconciliar no escribe nada en un borrador publicado hace meses", () => {
    const id = "0123456789abcdef01234568";
    const f = path.join(RAIZ, "borradores", "2026-01-10-x-antiguo.md");
    fs.writeFileSync(f, `---\nred: X\nestado: publicado\nbuffer: ${id} (X, sent)\n---\n\n**X**\n\nOtro texto.\n`);
    const sentAt = "2026-01-10T10:00:00.000Z";
    const r = reconciliar({ conectado: true, completo: true, canales: [], posts: [{ id, estado: "sent", sentAt, dueAt: sentAt, creado: sentAt, servicio: "twitter", enlace: null, texto: "Otro texto.", metricas: [{ tipo: "impressions", valor: 0 }] }] });
    expect(r.metricas).toEqual([]);
    expect(fs.readFileSync(f, "utf8")).not.toMatch(/metricas_/);
    fs.rmSync(f);
  });
});

// ---- Informe semanal ----
const pieza = (dia, hora, red, imp, extra = {}) => ({
  id: `${dia}-${red}-${imp}`, path: `borradores/${dia}-${red}-${imp}.md`, titulo: `P ${dia} ${imp}`, estado: "publicado", redes: [red],
  fecha: { dia, hora, tipo: "publicado" }, visual: { tipo: extra.tipo || "image" }, plantilla: extra.plantilla || null,
  instantaneas: { "48h": null, "7d": imp == null ? null : { redes: { [red]: { impresiones: imp, engagement: 1 } }, tomadas: "x" } },
});

describe("informe semanal", () => {
  it("semanas ISO", () => {
    expect(semanaDe("2026-11-14")).toBe("2026-W46");
    expect(rangoSemana("2026-W46")).toEqual({ desde: "2026-11-09", hasta: "2026-11-15" });
    expect(semanaDe("2027-01-01")).toBe("2026-W53");
    expect(rangoSemana("2026-W01").desde).toBe("2025-12-29");
    expect(semanaAnterior("2026-11-14")).toBe("2026-W45");
    expect(() => rangoSemana("2026-46")).toThrow(/AAAA-Www/);
    expect(franja("09:30")).toBe("mañana");
    expect(franja("22:00")).toBe("noche");
  });

  it("compara con la mediana de la misma red en las 8 semanas previas, por grupo", () => {
    const ps = [
      // Base X (8 semanas previas a 2026-11-09): 100, 200, 300, 400 → mediana 250. Carrusel: 300, 400 → 350.
      pieza("2026-10-05", "09:00", "X", 100), pieza("2026-10-12", "09:00", "X", 200),
      pieza("2026-10-19", "18:00", "X", 300, { tipo: "carrusel", plantilla: "ui-ux" }), pieza("2026-10-26", "18:00", "X", 400, { tipo: "carrusel", plantilla: "ui-ux" }),
      // Fuera de la base: demasiado antigua y de otra red.
      pieza("2026-08-01", "09:00", "X", 99999), pieza("2026-10-20", "09:00", "LinkedIn", 5),
      // Semana del informe.
      pieza("2026-11-10", "18:30", "X", 500, { tipo: "carrusel", plantilla: "ui-ux" }),
      pieza("2026-11-11", "09:00", "X", null),
    ];
    const r = construir({ posts: ps, semana: "2026-W46", generado: "2026-11-16T00:00:00Z" });
    expect(r.piezas).toBe(2);
    expect(r.conMetricas).toBe(1);
    expect(r.texto).toContain("| impresiones | 500 | 250 (2.00x, n=4) | 350 (1.43x, n=2) | 350 (1.43x, n=2) | — | 350 (1.43x, n=2) |");
    // Ninguna pieza de la base salió en martes: sin mediana, «—».
    expect(r.texto).toContain("del 2026-09-14 al 2026-11-08");
    expect(r.texto).toContain("## Sin métricas todavía");
    expect(r.texto).toMatch(/## Propuestas de aprendizaje[\s\S]*- \*\*sin aprobar\*\* · En X, «P 2026-11-10 500» .* sacó 2\.00x/);
    expect(r.texto).not.toContain("99999");
    // Determinista.
    expect(construir({ posts: [...ps].reverse(), semana: "2026-W46", generado: "2026-11-16T00:00:00Z" }).texto).toBe(r.texto);
  });

  it("sin base suficiente no inventa propuestas", () => {
    const r = construir({ posts: [pieza("2026-11-10", "10:00", "X", 50)], semana: "2026-W46", generado: "2026-11-16" });
    expect(r.texto).toContain("**sin aprobar** · Ninguna por ahora");
  });
});

// ---- Contexto del encargo ----
describe("contexto previo del encargo", () => {
  const entradas = Array.from({ length: 12 }, (_, i) => ({ fecha: `2026-11-${String(20 - i).padStart(2, "0")}`, ambito: "X", titulo: `Entrada ${i}`, cuerpo: `- Qué pasó: algo ${i}\n- Acción: nada` }));

  it("pasa lecturas, las 8 últimas entradas con su primera línea y nada más", () => {
    const t = contextoPrevio({ leerAntes: ["a.md"], entradas, aprendizajes: "aprendizajes.md" });
    expect(t).toContain("- a.md");
    expect(t).toContain("Entrada 7: Qué pasó: algo 7");
    expect(t).not.toContain("Entrada 8");
    expect(t).not.toContain("Acción");
  });

  it("respeta el tope de caracteres", () => {
    const largas = entradas.map((e) => ({ ...e, titulo: "t".repeat(500), cuerpo: "c".repeat(2000) }));
    const t = contextoPrevio({ leerAntes: Array.from({ length: 12 }, (_, i) => `ruta/${"x".repeat(100)}-${i}.md`), entradas: largas, tope: 900 });
    expect(t.length).toBeLessThanOrEqual(900);
    expect(t).toContain("(recortado");
    expect(contextoPrevio({})).toBe("");
  });

  it("el prompt de un encargo lleva el bloque «Antes de empezar» con el registro del cerebro", async () => {
    const { prompt } = await import("../server/encargos.js");
    const t = prompt({ objetivo: { tipo: "general" }, texto: "haz algo" });
    expect(t).toContain("## Antes de empezar");
    expect(t).toContain("2026-11-01 · X · Primer post: Qué pasó: nada.");
    // Las rutas de leerAntes que no existen en el cerebro no se citan.
    expect(t).not.toContain("estrategia/algoritmos/README.md");
    expect(t.indexOf("## Antes de empezar")).toBeLessThan(t.indexOf("## Cómo trabajar"));
  });

  it("piezas parecidas: misma red, primero misma plantilla, máximo 5, solo con fotos", () => {
    const base = { id: "nuevo", redes: ["X"], visual: { tipo: "carrusel" }, plantilla: "ui-ux" };
    const ps = [
      ...Array.from({ length: 6 }, (_, i) => pieza(`2026-10-0${i + 1}`, "09:00", "X", 100 + i, { tipo: "carrusel" })),
      pieza("2026-09-01", "09:00", "X", 1, { tipo: "image", plantilla: "ui-ux" }),
      pieza("2026-10-10", "09:00", "LinkedIn", 7, { tipo: "carrusel", plantilla: "ui-ux" }),
      pieza("2026-10-11", "09:00", "X", null, { tipo: "carrusel", plantilla: "ui-ux" }),
    ];
    const r = parecidas(base, ps);
    expect(r).toHaveLength(5);
    expect(r[0].plantilla).toBe("ui-ux");
    expect(r[0].redes).toEqual(["X"]);
    expect(r.slice(1).map((p) => p.fecha.dia)).toEqual(["2026-10-06", "2026-10-05", "2026-10-04", "2026-10-03"]);
    expect(contextoPrevio({ post: base, posts: ps })).toContain("### Métricas de piezas parecidas");
  });
});
