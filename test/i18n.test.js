// Traducciones de la interfaz (src/lib/i18n.js, src/locales/*.js): mismas claves en todos los idiomas,
// interpolación y plurales, y un detector de texto en castellano que se haya quedado fuera de t() en src/.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import es from "../src/locales/es.js";
import en from "../src/locales/en.js";
import { resolverIdioma, traducir } from "../src/lib/i18n.js";

const SRC = path.resolve(import.meta.dirname, "../src");

describe("diccionarios", () => {
  it("es y en tienen las mismas claves", () => {
    const faltanEnEn = Object.keys(es).filter((k) => !(k in en));
    const faltanEnEs = Object.keys(en).filter((k) => !(k in es));
    expect(faltanEnEn).toEqual([]);
    expect(faltanEnEs).toEqual([]);
  });

  it("ningún texto está vacío y las variables coinciden entre idiomas", () => {
    const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    for (const k of Object.keys(es)) {
      expect(es[k], k).toBeTypeOf("string");
      expect(en[k], k).toBeTypeOf("string");
      expect(es[k].trim().length, k).toBeGreaterThan(0);
      expect(en[k].trim().length, k).toBeGreaterThan(0);
      // {prompt} es texto literal en la ayuda del comando propio, no una variable: vale igual en los dos.
      expect(vars(en[k]), k).toBe(vars(es[k]));
    }
  });

  it("los plurales tienen _one y _other en los dos idiomas", () => {
    for (const d of [es, en]) {
      for (const k of Object.keys(d)) {
        if (k.endsWith("_one")) expect(d, k).toHaveProperty(k.replace(/_one$/, "_other"));
      }
    }
  });
});

describe("traducir", () => {
  it("interpola {variables} y deja intactas las que faltan", () => {
    expect(traducir("es", "app.guardadaEn", { archivo: "nota.md" })).toBe("Guardada en nota.md");
    expect(traducir("en", "app.guardadaEn", { archivo: "nota.md" })).toBe("Saved to nota.md");
    expect(traducir("es", "app.guardadaEn")).toBe("Guardada en {archivo}");
  });

  it("elige la forma de plural con n", () => {
    expect(traducir("es", "encargo.archivos", { n: 1 })).toBe("1 archivo");
    expect(traducir("es", "encargo.archivos", { n: 0 })).toBe("0 archivos");
    expect(traducir("es", "encargo.archivos", { n: 3 })).toBe("3 archivos");
    expect(traducir("en", "encargo.archivos", { n: 1 })).toBe("1 file");
    expect(traducir("en", "encargo.archivos", { n: 2 })).toBe("2 files");
    expect(traducir("en", "tiempo.haceDias", { n: 5 })).toBe("5 days ago");
  });

  it("cae al castellano y después a la clave si falta", () => {
    expect(traducir("fr", "nav.encargos")).toBe("Encargos");
    expect(traducir("en", "no.existe")).toBe("no.existe");
  });
});

describe("resolverIdioma", () => {
  it("el ajuste manda; auto usa el cerebro y después el navegador", () => {
    expect(resolverIdioma("en", "es", ["es-ES"])).toBe("en");
    expect(resolverIdioma("auto", "en", ["es-ES"])).toBe("en");
    expect(resolverIdioma("auto", "es", ["en-US"])).toBe("es");
    expect(resolverIdioma("auto", "fr", ["en-US", "es"])).toBe("en");
    expect(resolverIdioma("auto", "fr", ["de-DE"])).toBe("es");
    expect(resolverIdioma(undefined, undefined, "en-GB")).toBe("en");
  });
});

// Heurística: texto visible en castellano que no pasa por t(). Mira nodos de texto JSX y atributos de texto
// (title, placeholder, aria-label, label, alt…) con tildes, ñ, ¿, ¡ o palabras muy comunes del castellano.
// Los comentarios no cuentan. Si salta por un identificador de datos, hay que añadirlo a PERMITIDOS.
const PERMITIDOS = new Set(["Glim", "Buffer", "Drive", "Repo", "Checklist", "Preset", "Badge", "UTM", "HTML", "GIF", "Render", "JSON", "PDF", "Skills", "Claude", "Sonnet", "Opus", "Haiku", "Codex", "Español", "English", "Feedback"]);
const CASTELLANO = /[áéíóúñ¿¡]|\b(el|la|los|las|del|de|en|con|para|sin|que|una|por|al|se|su|tu|lo|es|ya|más|cada|todo|todas|nada|ver|abrir|guardar|quitar|cerrar|borrar|buscar)\b/i;

function sinComentarios(src) {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").map((l) => l.replace(/(^|[\s;,(){}])\/\/.*$/, "$1")).join("\n");
}

function sospechosos(src) {
  const out = [];
  const s = sinComentarios(src);
  // Nodos de texto JSX: >texto< sin llaves.
  for (const m of s.matchAll(/>([^<>{}]+)</g)) {
    const txt = m[1].trim();
    if (!txt || !/[A-Za-zÁÉÍÓÚáéíóúñ]{2,}/.test(txt) || PERMITIDOS.has(txt)) continue;
    if (/[=&|?:;()]/.test(txt) && !/[áéíóúñ¿¡]/.test(txt)) continue; // código entre operadores, no texto
    if (CASTELLANO.test(txt)) out.push(txt);
  }
  // Atributos con texto literal.
  for (const m of s.matchAll(/\b(title|placeholder|aria-label|label|alt|sub|titulo|ayuda|pie)="([^"]+)"/g)) {
    const txt = m[2].trim();
    if (PERMITIDOS.has(txt)) continue;
    if (CASTELLANO.test(txt)) out.push(`${m[1]}="${txt}"`);
  }
  return out;
}

function archivos(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "locales" ? [] : archivos(p);
    return /\.jsx$/.test(e.name) ? [p] : [];
  });
}

describe("texto sin traducir en src/", () => {
  it("el detector encuentra castellano fuera de t()", () => {
    expect(sospechosos('<p className="x">Sin texto todavía.</p>')).toHaveLength(1);
    expect(sospechosos('<button aria-label="Cerrar el panel" />')).toHaveLength(1);
    expect(sospechosos('<p>{t("post.sinTexto")}</p>')).toHaveLength(0);
    expect(sospechosos("{/* Comentario en castellano */}")).toHaveLength(0);
  });

  it("ningún .jsx tiene texto visible en castellano sin t()", () => {
    const hallazgos = archivos(SRC).flatMap((f) => sospechosos(fs.readFileSync(f, "utf8")).map((x) => `${path.relative(SRC, f)}: ${x}`));
    expect(hallazgos).toEqual([]);
  });
});
