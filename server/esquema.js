// Esquema de glim.config.json (el archivo que convierte un repo en un cerebro de Glim). Sin efectos al importarlo:
// lo usan el servidor (server/cerebro.js), los tests y el script que genera schema/glim.config.schema.json.
import path from "node:path";
import { z } from "zod";

const ruta = z.string().min(1).refine((s) => !path.isAbsolute(s) && !s.split("/").includes(".."), "ruta relativa dentro del cerebro");
const opcional = ruta.optional();

// Esquema del glim.config.json. Todo lo que no se indica tiene un valor por defecto neutro.
export const Esquema = z.object({
  $schema: z.string().optional(),
  nombre: z.string().min(1).max(60),
  // Cómo llaman los agentes y los textos a la persona dueña del cerebro.
  persona: z.string().min(1).max(40).default("tú"),
  // Cómo se firma en las vistas previas de los posts (nombre y usuario de las redes).
  autor: z.object({ nombre: z.string().max(60).optional(), usuario: z.string().max(40).optional() }).default({}),
  // Zona IANA (Europe/Madrid). Sin ella, la del equipo.
  zonaHoraria: z.string().refine((t) => { try { new Intl.DateTimeFormat("en", { timeZone: t }); return true; } catch { return false; } }, "zona horaria IANA no válida").optional(),
  idioma: z.string().default("es"),
  // Reglas que leen los agentes antes de trabajar y la revisión antes de fusionar.
  reglas: ruta.default("AGENTS.md"),
  rutas: z.object({
    borradores: ruta.default("borradores"),
    aprendizajes: opcional,
    calendario: opcional,
    referencias: ruta.default(".glim/referencias.json"),
    lienzos: ruta.default(".glim/lienzos.json"),
    mediaReferencias: ruta.default("media/referencias"),
    media: ruta.default("media"),
    referentes: opcional,
    skills: opcional,
    kitPublicacion: opcional,
    indiceRecursos: opcional,
    seriesCarrusel: opcional,
    mediaCarruseles: opcional,
    marcas: opcional,
    ogs: opcional,
    avatar: opcional,
  }).default({}),
  // Redes del calendario y posts por red y día de la semana (lunes primero): { "X": [2,2,2,2,2,0,0] }.
  redes: z.array(z.string().min(1).max(20)).default(["X", "LinkedIn"]),
  cadencia: z.record(z.string(), z.array(z.number().int().min(0).max(20)).length(7)).default({}),
  // Palabras que el título de un borrador (sacado del nombre de archivo) escribe así: { "smoothui": "SmoothUI" }.
  titulos: z.record(z.string().min(1), z.string()).default({}),
  // Palabra que buscar en los medios cuando el id de una plantilla no coincide con el nombre de sus renders.
  clavesPlantillas: z.record(z.string(), z.string()).default({}),
  // Guías que enlazan las vistas (botón «Guía» o «Cómo se usan»).
  guias: z.record(z.string(), ruta).default({}),
  // Grupos de documentos de la Biblioteca.
  biblioteca: z.array(z.object({ dir: ruta, grupo: z.string(), profundidad: z.number().int().min(1).max(6).default(1), excluir: z.string().optional() })).default([]),
  // Nunca se sirven, nunca se suben y los agentes no deben tocarlas.
  privadas: z.array(ruta).default([]),
  agentes: z.object({
    // Líneas extra para el mensaje de sistema de los encargos.
    reglas: z.array(z.string().max(400)).default([]),
    // Comandos de shell extra que el agente puede lanzar sin preguntar (además de los básicos de Glim).
    comandos: z.array(z.string().regex(/^[\w .@/:-]+$/)).default([]),
    // Carpetas que git ignora y que las copias aisladas de los encargos comparten con el repo (medios, node_modules).
    compartidas: z.array(ruta).default([]),
  }).default({}),
  publicar: z.object({
    rama: z.string().default("main"),
    // Prefijo de commit por carpeta: { "borradores/": "borradores" }. Sin coincidencia: `prefijoPorDefecto`.
    prefijos: z.record(z.string(), z.string()).default({}),
    prefijoPorDefecto: z.string().default("repo"),
    // Rutas que nunca entran en una PR (además de `privadas` y .glim/).
    prohibidas: z.array(ruta).default([]),
    // Palabras que no deben aparecer en contenido nuevo (nombres de clientes, empleadores…). Solo avisan.
    terminosVetados: z.array(z.string().min(2)).default([]),
    // Contexto para la IA que redacta el commit y revisa el diff.
    contexto: z.string().max(2000).default(""),
  }).default({}),
  integraciones: z.object({
    buffer: z.object({ importarDesde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default("2026-01-01") }).optional(),
    dub: z.object({ comentario: z.string().default("glim") }).optional(),
  }).default({}),
  // Secciones propias del menú (galería, lista, tablero o documento). Cada una se valida aparte en server/secciones.js:
  // una sección mal escrita sale como error en el panel y no impide arrancar.
  secciones: z.array(z.record(z.string(), z.unknown())).default([]),
  // Prefijo de las claves del Llavero (servicio `<prefijo>-buffer`, `<prefijo>-dub`).
  llavero: z.string().regex(/^[\w.-]+$/).default("glim"),
}).strict();
