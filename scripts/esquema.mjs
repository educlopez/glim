// Genera schema/glim.config.schema.json a partir del esquema de zod (server/esquema.js), para que los editores
// autocompleten y validen glim.config.json. Se ejecuta con `npm run esquema`; CI comprueba que está al día.
import fs from "node:fs";
import { zodToJsonSchema } from "zod-to-json-schema";
import { Esquema } from "../server/esquema.js";

const s = zodToJsonSchema(Esquema, { name: "GlimConfig", $refStrategy: "none" });
s.title = "glim.config.json";
s.description = "Configuración de un cerebro de Glim: rutas, reglas, zona horaria, publicación y módulos.";
fs.writeFileSync(new URL("../schema/glim.config.schema.json", import.meta.url), JSON.stringify(s, null, 2) + "\n");
console.log("schema/glim.config.schema.json");
