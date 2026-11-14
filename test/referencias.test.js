// referencias.json v2 (estrategia/referencias.schema.json en el cerebro de su autor): lectura, edición y escritura sin
// perder campos, versión conservada y `fuente` del JSON separada de la fuente de Glim.
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { rutas } from "../server/cerebro.js";
import { buscarCerebro } from "../server/cerebro.js";
import { referencias, editar, editarAnotacion, valorar } from "../server/referencias.js";

const RAIZ = process.env.GLIM_BRAIN;
const JSON_REF = path.join(RAIZ, rutas.referencias);
const FIXTURE = path.resolve(import.meta.dirname, "fixtures/referencias-v2.json");
const leer = () => JSON.parse(fs.readFileSync(JSON_REF, "utf8"));

beforeEach(() => {
  fs.mkdirSync(path.dirname(JSON_REF), { recursive: true });
  fs.copyFileSync(FIXTURE, JSON_REF);
});

describe("referencias v2", () => {
  it("lee las anotaciones sin medio local, con fuenteUrl y sin pisar r.fuente", () => {
    const todas = referencias();
    const pd = todas.find((x) => x.id === "pd-00-firecrawl");
    expect(pd).toMatchObject({
      fuente: "posts.design", fuenteUrl: "https://x.com/firecrawl/status/2119834677775126850", url: "https://x.com/firecrawl/status/2119834677775126850",
      posts_design: "https://posts.design/firecrawl-we-hit-200k", que_robar: "La cifra hecha de lo que cuenta", plantilla_ids: ["video-hito"],
      usada_en: ["borradores/2026-11-12-x-hito.md"], publicado: "2026-11-09", estudio: "estrategia/referentes/posts-hito.md", sinMedio: true, valoracion: 4, tipo_post: "hito",
    });
    const mia = todas.find((x) => x.id === "ref-abc");
    expect(mia).toMatchObject({ fuente: "propia", fuenteUrl: "https://ejemplo.com/original", que_robar: "Ritmo de cortes" });
    expect(todas.find((x) => x.id === "pd-01-sin-estudiar").que_robar).toBeUndefined();
  });

  it("editar una anotación y una propia conserva la versión y todos los campos que Glim no toca", () => {
    const antes = leer();
    editarAnotacion("pd-00-firecrawl", { que_robar: "  Nueva   técnica ", plantilla_ids: "video-hito, otra, otra", etiquetas: "A, b", tipo_post: "lanzamiento" });
    editar("ref-abc", { notas: "nota", que_robar: "", plantilla_ids: [] });
    valorar("pd-01-sin-estudiar", 3);
    const d = leer();
    expect(d.version).toBe(2);
    const a = d.anotaciones["pd-00-firecrawl"];
    expect(a).toEqual({ ...antes.anotaciones["pd-00-firecrawl"], que_robar: "Nueva técnica", plantilla_ids: ["video-hito", "otra"], etiquetas: ["a", "b"], tipo_post: "lanzamiento" });
    const mia = d.items[0];
    expect(mia).toMatchObject({ fuente: "https://ejemplo.com/original", campo_futuro: { x: 1 }, notas: "nota", que_robar: null, plantilla_ids: [] });
    expect(d.valoraciones).toEqual({ "pd-00-firecrawl": 4, "pd-01-sin-estudiar": 3 });
    expect(() => editarAnotacion("pd-00-firecrawl", { tipo_post: "inventado" })).toThrow(/no válido/);
    expect(() => editarAnotacion("pd-no-existe", { que_robar: "x" })).toThrow(/No existe/);
  });
});

describe("cerebro en los tests", () => {
  it("solo se resuelve con GLIM_BRAIN, nunca con la ruta guardada de la app", () => {
    const antes = process.env.GLIM_BRAIN;
    try {
      process.env.GLIM_BRAIN = path.join(RAIZ, "no-existe");
      process.env.GLIM_USAR_GUARDADO = "1";
      expect(buscarCerebro()).toBeNull();
    } finally { process.env.GLIM_BRAIN = antes; delete process.env.GLIM_USAR_GUARDADO; }
    expect(buscarCerebro()).toBe(path.resolve(antes));
  });
});
