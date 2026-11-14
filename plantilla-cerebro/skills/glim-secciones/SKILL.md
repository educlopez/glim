---
name: glim-secciones
description: >-
  Cómo añadir, cambiar u ordenar secciones propias del menú de Glim editando glim.config.json →
  secciones (galería, lista, tablero o documento). Úsala cuando la persona pida una vista nueva
  en Glim («quiero ver mis ideas en un tablero», «una galería con las OG»), cuando una sección
  salga con error en el panel o cuando Lumi tenga que adaptar Glim.
version: 1.0.0
---

# Secciones propias de Glim

Cada cerebro puede añadir vistas al menú sin tocar el código de Glim. Se declaran en `glim.config.json` → `secciones` (un array) y Glim las pinta con cuatro plantillas. Fuente: `server/secciones.js` del repo de Glim (esquema `Seccion` y `guiaAgente()`).

## Reglas

- Edita **solo** la clave `secciones` de `glim.config.json`. Deja el resto del archivo igual.
- El JSON tiene que quedar válido: vuelve a leerlo al terminar.
- La carpeta o el archivo que enseñe la sección tiene que existir. Si no existe, créalo con un primer elemento de ejemplo.
- Rutas relativas al cerebro, sin `..` ni rutas absolutas. Nada dentro de `privadas` ni de `.glim/`: no se sirve.
- Una sección mal escrita no impide arrancar: sale como error en el panel y las demás siguen.

## Formato

```json
{
  "id": "og-animadas",
  "titulo": "OG animadas",
  "descripcion": "Previews animadas de mis webs",
  "icono": "share-2",
  "grupo": "plantillas",
  "tipo": "galeria",
  "carpeta": "plantillas/og-animada",
  "extensiones": ["mp4", "png", "html"],
  "profundidad": 2
}
```

| Campo | Valores |
|---|---|
| `id` | Minúsculas y guiones, único, hasta 40 caracteres (`^[a-z0-9][a-z0-9-]{0,39}$`) |
| `titulo` | Corto, hasta 40 caracteres |
| `descripcion` | Opcional, hasta 200 |
| `tipo` | `galeria`, `lista`, `tablero` o `documento` |
| `grupo` | `trabajo`, `contenido`, `plantillas`, `conocimiento` o `tuyas` (por defecto) |
| `icono` | Uno de: folder, image, images, film, video, share-2, palette, layout-template, book-open, file-text, lightbulb, star, bookmark, tag, calendar, list, table, kanban, link, mic, music, sparkles, megaphone, users, box. Otro valor pasa a `folder` |

## Por tipo

- **galeria**: pide `carpeta`. Opcional `extensiones` (sin punto, hasta 12; por defecto imágenes, vídeos y HTML) y `profundidad` (0 a 4, por defecto 2).
- **documento**: pide `archivo` (un `.md`).
- **lista**: pide `carpeta` con un `.md` por elemento (frontmatter `clave: valor`) **o** `archivo` JSON con un array. Si el array no es la raíz del JSON, `clave` dice dónde está. `campos`: hasta 8 columnas que enseñar. `campoTitulo`: campo del título (por defecto `titulo`, luego el primer encabezado del `.md`).
- **tablero**: como `lista`, más `agruparPor` (el campo que hace las columnas) y, si quieres fijar el orden, `columnas`.

## Ejemplo: tablero de ideas

```json
{ "id": "ideas", "titulo": "Ideas", "icono": "lightbulb", "grupo": "contenido", "tipo": "tablero", "carpeta": "ideas", "campos": ["red"], "agruparPor": "estado", "columnas": ["nueva", "en-curso", "hecha"] }
```

Si `ideas/` no existe, créala con un `ideas/primera-idea.md`:

```markdown
---
estado: nueva
red: X
---

# Primera idea
```

## Comprobar

Glim relee el archivo en cada petición: la sección sale en el menú sin reiniciar. Si sale con error, el mensaje dice qué campo falla.
