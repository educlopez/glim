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

## Estado local

`<cerebro>/.glim/` guarda lo que es de este equipo: encargos, ajustes, cachés de Buffer y del análisis de referencias, iconos generados y notas de feedback. Añade `.glim/` al `.gitignore` del cerebro.
