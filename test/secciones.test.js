// Secciones propias del cerebro (glim.config.json → secciones): validación, contenido, privacidad y API.
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contenido, guiaAgente, leer, resumen } from "../server/secciones.js";
import { manejar } from "../server/api.js";
import { Esquema } from "../server/esquema.js";
import { pedir, servidorApi } from "./helpers.js";

const RAIZ = process.env.GLIM_BRAIN;
const CONFIG = path.join(RAIZ, "glim.config.json");
const base = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
const poner = (secciones) => fs.writeFileSync(CONFIG, JSON.stringify({ ...base, secciones }, null, 2));

const SECCIONES = [
  { id: "borradores", titulo: "Borradores", tipo: "lista", carpeta: "borradores", campos: ["red", "estado"] },
  { id: "por-estado", titulo: "Por estado", tipo: "tablero", carpeta: "borradores", campos: ["red"], agruparPor: "estado", columnas: ["idea", "programado"] },
  { id: "galeria", titulo: "Galería", icono: "images", grupo: "plantillas", tipo: "galeria", carpeta: "media" },
  { id: "reglas", titulo: "Reglas", tipo: "documento", archivo: "AGENTS.md", icono: "no-existe" },
  { id: "privada", titulo: "Privada", tipo: "galeria", carpeta: "privado", extensiones: ["md"] },
  { id: "rota", titulo: "Rota", tipo: "carrusel", carpeta: "x" },
  { id: "fuera", titulo: "Fuera", tipo: "galeria", carpeta: "../otro" },
  { id: "borradores", titulo: "Repetida", tipo: "documento", archivo: "AGENTS.md" },
];

let s;
beforeAll(async () => {
  fs.mkdirSync(path.join(RAIZ, "media"), { recursive: true });
  fs.writeFileSync(path.join(RAIZ, "media", "logo.svg"), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  fs.writeFileSync(path.join(RAIZ, "media", "nota.txt"), "no entra en la galería");
  poner(SECCIONES);
  s = await servidorApi(manejar);
});
afterAll(async () => { await s.cerrar(); });

describe("leer", () => {
  it("valida cada sección por separado: las rotas van a errores y no tumban las demás", () => {
    const { secciones, errores } = leer();
    expect(secciones.map((x) => x.id)).toEqual(["borradores", "por-estado", "galeria", "reglas", "privada"]);
    expect(errores.map((e) => e.id)).toEqual(["rota", "fuera", "borradores"]);
    expect(errores.find((e) => e.id === "fuera").error).toContain("ruta relativa");
  });

  it("un icono desconocido pasa a carpeta y el grupo por defecto es «tuyas»", () => {
    const r = leer().secciones.find((x) => x.id === "reglas");
    expect(r.icono).toBe("folder");
    expect(r.grupo).toBe("tuyas");
  });

  it("el glim.config.json con secciones sigue pasando el esquema estricto", () => {
    expect(Esquema.safeParse(JSON.parse(fs.readFileSync(CONFIG, "utf8"))).success).toBe(true);
  });
});

describe("contenido", () => {
  it("lista: una fila por .md con sus campos de frontmatter", () => {
    const c = contenido("borradores");
    const fila = c.items.find((x) => x.path.endsWith("primer-post.md"));
    expect(fila.campos).toEqual({ red: "X", estado: "idea" });
  });

  it("tablero: columnas en el orden pedido", () => {
    const c = contenido("por-estado");
    expect(c.columnas.map((x) => x.id)).toEqual(["idea", "programado"]);
    expect(c.columnas[1].items.map((x) => x.campos.red)).toEqual(["LinkedIn"]);
  });

  it("galería: solo las extensiones que enseña", () => {
    expect(contenido("galeria").items.map((x) => x.path)).toEqual(["media/logo.svg"]);
  });

  it("documento: el texto del archivo", () => {
    expect(contenido("reglas").documento.texto).toContain("#");
  });

  it("nunca enseña lo que está en las rutas privadas", () => {
    expect(contenido("privada").items).toEqual([]);
    expect(resumen().secciones.find((x) => x.id === "privada").n).toBe(0);
  });

  it("una sección que no existe da 404", () => {
    expect(() => contenido("nada")).toThrow(/No existe/);
  });
});

describe("API y agente", () => {
  it("GET /api/secciones/:id devuelve el contenido y 404 si no existe", async () => {
    const ok = await pedir(s.port, { ruta: "/api/secciones/galeria" });
    expect(ok.status).toBe(200);
    expect(ok.json.items).toHaveLength(1);
    const no = await pedir(s.port, { ruta: "/api/secciones/nada" });
    expect(no.status).toBe(404);
  });

  it("el overview trae el resumen con los errores", async () => {
    const r = await pedir(s.port, { ruta: "/api/overview" });
    expect(r.json.secciones.secciones.find((x) => x.id === "borradores").n).toBe(3);
    expect(r.json.secciones.errores).toHaveLength(3);
  });

  it("la guía del agente explica el formato y lista lo que ya hay", () => {
    const g = guiaAgente();
    expect(g).toContain('"secciones"');
    expect(g).toContain("borradores (lista, borradores)");
    expect(g).toContain("rota:");
  });
});
