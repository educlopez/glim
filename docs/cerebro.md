# El cerebro: `glim.config.json`

Un cerebro es cualquier repo con un `glim.config.json` en la raíz. El esquema completo está en [`schema/glim.config.schema.json`](../schema/glim.config.schema.json) (añade `"$schema"` al archivo y tu editor autocompleta y valida). Hay un ejemplo mínimo en [`ejemplos/cerebro-minimo`](../ejemplos/cerebro-minimo).

Glim valida el archivo al arrancar y, si algo no cuadra, dice qué campo falla.

## Campos

| Campo | Para qué | Por defecto |
|---|---|---|
| `nombre` | Nombre del cerebro (barra lateral, commits, prompts) | obligatorio |
| `persona` | Cómo llaman los agentes a la persona dueña («Ana ha pedido…») | `tú` |
| `autor` | `{ nombre, usuario }` para las vistas previas de los posts | `persona` |
| `zonaHoraria` | Zona IANA de fechas y horas | la del equipo |
| `idioma` | Idioma de los agentes y los commits | `es` |
| `reglas` | Archivo de reglas que leen los agentes y la revisión | `AGENTS.md` |
| `rutas` | Dónde está cada cosa (tabla abajo) | |
| `guias` | Guías que enlazan las vistas: `plantillas`, `carruseles`, `ogs`, `marcas` | |
| `biblioteca` | Grupos de documentos: `[{ dir, grupo, profundidad, excluir }]` | `[]` |
| `privadas` | Rutas que nunca se sirven, nunca se suben y los agentes no tocan | `[]` |
| `redes` | Redes del calendario y los filtros | `["X", "LinkedIn"]` |
| `cadencia` | Posts por red y día, lunes primero: `{ "X": [1,1,1,1,1,0,0] }` | `{}` |
| `titulos` | Cómo se escriben palabras en los títulos sacados del nombre de archivo | `{}` |
| `agentes.reglas` | Líneas extra para el mensaje de sistema de los encargos | `[]` |
| `agentes.comandos` | Comandos de shell extra que el agente puede lanzar sin preguntar | `[]` |
| `agentes.usarMcpDelCerebro` | Los encargos de Claude Code cargan el MCP del cerebro (ver «MCP en los encargos») | `false` |
| `agentes.mcp` | Archivo MCP del cerebro para los encargos | `.mcp.json` si existe |
| `contexto.leerAntes` | Archivos que cada encargo pide leer antes de empezar (solo se citan los que existen) | `["estrategia/algoritmos/README.md", "estrategia/aprendizajes.md"]` |
| `publicar.rama` | Rama principal | `main` |
| `publicar.prefijos` | Prefijo de commit por carpeta: `{ "borradores/": "borradores" }` | `{}` |
| `publicar.prohibidas` | Rutas que nunca entran en una PR | `[]` |
| `publicar.terminosVetados` | Palabras que no deben aparecer en contenido nuevo (avisan) | `[]` |
| `publicar.contexto` | Contexto para la IA que redacta el commit y revisa | `""` |
| `integraciones.buffer` | Activa Buffer (solo lectura). `importarDesde`: fecha desde la que se importan posts | desactivada |
| `integraciones.dub` | Activa los enlaces cortos de Dub | desactivada |
| `llavero` | Prefijo de las claves en el Llavero (`<prefijo>-buffer`) | `glim` |

### `rutas`

Todas relativas a la raíz del cerebro. Una vista sale en el menú solo si su ruta existe.

| Ruta | Qué es | Vista |
|---|---|---|
| `borradores` | Un `.md` por pieza con frontmatter (`red`, `estado`, `programado_para`…) | Posts, Calendario |
| `aprendizajes` | Registro de decisiones (Markdown, lo más nuevo arriba) | Registro |
| `calendario` | Markdown donde Glim reescribe lo programado entre `<!-- panel:inicio -->` y `<!-- panel:fin -->` | |
| `referencias` | JSON de referencias | Referencias (`.glim/referencias.json`) |
| `lienzos` | JSON de lienzos | Lienzos (`.glim/lienzos.json`) |
| `media`, `mediaReferencias` | Medios renderizados y de referencias | Medios |
| `indiceRecursos` | JSON con las plantillas (`plantillas: [{ id, tipo, estado, ruta }]`) | Plantillas |
| `seriesCarrusel`, `mediaCarruseles` | JSON de carruseles y sus slides | Carruseles |
| `marcas` | Un JSON por marca (paleta, logo…) | Marcas |
| `ogs` | Una carpeta por OG con `index.html` | OG animadas |
| `kitPublicacion` | Firmas y presets | Kit |
| `referentes`, `skills` | Documentos internos y skills de agentes | Biblioteca, contexto |
| `avatar` | Foto para las vistas previas y el icono | |
| `informes` | Informes semanales de resultados (`AAAA-Www.md`), por defecto `informes` | |

## Qué cerebro abre

El servidor solo abre el cerebro de `GLIM_BRAIN` (la app lo pone al arrancar) o la carpeta actual si tiene `glim.config.json`. La ruta que guardó la app no se usa por defecto, para que un `npm run dev`, un script o un test nunca escriban en tu cerebro real sin querer; para usarla: `GLIM_USAR_GUARDADO=1`. En los tests solo vale `GLIM_BRAIN`.

## Estado local

`<cerebro>/.glim/` guarda lo que es de este equipo: encargos, ajustes, cachés de Buffer y del análisis de referencias, iconos generados y notas de feedback. Añade `.glim/` al `.gitignore` del cerebro.

## Métricas e informe semanal

Cuando Buffer está conectado y la reconciliación automática activa, Glim copia las métricas de cada pieza enviada a su borrador como dos fotos fijas: `metricas_48h` y `metricas_7d` (impresiones, reacciones, comentarios, compartidos, engagement y `tomadas: <fecha ISO>`). Cada foto solo se toma dentro de su ventana: la de 48 h entre las 48 y las 72 h desde que salió el post, la de 7 días entre los 7 y los 9 días. Fuera de la ventana no se escribe nada (una pieza antigua no recibe fotos), nunca se pisa una que ya existe y una red sin datos en Buffer (impresiones 0 o métricas refrescadas antes de la ventana) no entra. Detalle en `server/metricas.js`.

El informe semanal (`server/informe.js`) compara cada pieza de una semana ISO con la mediana de tus piezas de la misma red en las 8 semanas anteriores, también por formato, plantilla, día y franja horaria, y lo escribe en `<informes>/AAAA-Www.md`:

```
npm run informe -- --semana 2026-W46 --cerebro /ruta/al/cerebro
```

Sin `--semana`, la semana anterior; con `--salida -` lo imprime sin escribir. Desde el panel: `POST /api/informe { "semana": "2026-W46" }`.

## Aprendizajes: quién escribe

Una sola regla para Glim y para las skills del cerebro:

- Un encargo **solo** añade una entrada en `rutas.aprendizajes` cuando lo que pide la persona es feedback o un rechazo («esto no me gusta», «no vuelvas a usar…»). La entrada recoge lo que dijo, sin inventar.
- Cualquier otra conclusión es una propuesta: línea `DECISIÓN:` en la respuesta del agente (la persona la pasa al Registro desde el panel) o viñeta **sin aprobar** al final del informe semanal.
- El informe semanal nunca escribe en `rutas.aprendizajes`.

Está en el mensaje de sistema de los encargos (`SISTEMA` en `server/encargos.js`) y en la skill `glim-metricas`. Si el cerebro tiene su propia skill de aprendizajes (p. ej. `registrar-aprendizajes`), conviene alinearla con esta regla.

## Contexto de los encargos

Antes de «Cómo trabajar», cada encargo (no Lumi) pasa al agente, acotado a unos 3.500 caracteres (`server/contexto.js`):

- los archivos de `contexto.leerAntes` que existen;
- las últimas 8 entradas de `rutas.aprendizajes` (título y primera línea);
- si el objeto es un post: las fotos de métricas de las 5 piezas publicadas más parecidas (misma red y misma plantilla o, si no, mismo tipo de visual).

## Skills de Glim

Glim trae un paquete de skills (`plantilla-cerebro/skills/`) que enseña a cualquier agente a usar un cerebro: `glim-cerebro`, `glim-encargos`, `glim-secciones` y `glim-metricas`. Al crear un cerebro se copian a `<rutas.skills o skills>/glim/<nombre>/`, se enlazan en `.claude/skills/<nombre>` y `.agents/skills/<nombre>` (enlaces relativos) y se apunta versión y sha256 de cada una en `.glim/skills-lock.json`.

Ajustes → Servidor → «Actualizar skills de Glim» instala las nuevas y actualiza las que no has tocado. Una skill que has editado (su hash ya no es el del lock) o una carpeta con el mismo nombre que no instaló Glim no se pisa nunca: se salta y se dice. Al arrancar, Glim solo comprueba (sin escribir) y avisa en el Resumen si hay algo nuevo.

## MCP en los encargos

Por defecto los encargos de Claude Code van sin MCP (`--strict-mcp-config`). Con `agentes.usarMcpDelCerebro: true`, cargan solo el archivo del cerebro (`agentes.mcp`, por defecto `.mcp.json`) y sus servidores quedan permitidos. El archivo se versiona, así que no puede llevar secretos: si algún servidor trae valores literales en `env` o `headers`, Glim no lo usa y el encargo sale sin MCP, con el motivo en su registro. Usa servidores con OAuth o referencias `${VARIABLE}`. Los demás agentes (Codex, Cursor…) no cambian.
