---
name: glim-cerebro
description: >-
  Cómo está organizado un cerebro de Glim (un repo con glim.config.json) y dónde va cada cosa.
  Úsala antes de crear, mover o editar archivos en un repo que tenga glim.config.json en la raíz,
  cuando haya que escribir o retocar un borrador en borradores/, cambiar su estado, saber qué
  campos del frontmatter toca Glim, o decidir dónde dejar un aprendizaje, un informe o un render.
version: 1.0.0
---

# Cerebro de Glim

Un cerebro es un repo de git con `glim.config.json` en la raíz. Glim (la app) no guarda contenido propio: lee el cerebro del disco en cada petición y escribe en él. Fuente: `server/cerebro.js` y `docs/cerebro.md` del repo de Glim.

## Antes de tocar nada

1. Lee el archivo de reglas que diga `glim.config.json` → `reglas` (por defecto `AGENTS.md`). Sus reglas duras mandan sobre esta skill.
2. Lee `glim.config.json` → `rutas` para saber dónde está cada cosa. No supongas rutas: un cerebro puede tener `borradores` en otra carpeta.
3. Nunca leas ni toques lo que esté en `privadas`, ni `.glim/` (estado local de este equipo, ignorado por git).

## `glim.config.json`, lo que importa a un agente

| Campo | Qué es |
|---|---|
| `nombre`, `persona` | Nombre del cerebro y cómo llamar a su dueña o dueño |
| `zonaHoraria`, `idioma` | Todas las fechas y horas van en esa zona; responde en ese idioma |
| `reglas` | Archivo de reglas que se lee antes de trabajar |
| `rutas.borradores` | Un `.md` por pieza (por defecto `borradores/`) |
| `rutas.aprendizajes` | Registro de decisiones, lo más nuevo arriba |
| `rutas.informes` | Informes semanales de resultados (por defecto `informes/`) |
| `rutas.skills` | Skills del cerebro; las de Glim van en `<skills>/glim/` |
| `rutas.media` | Renders y medios (normalmente no se versionan) |
| `contexto.leerAntes` | Archivos que los encargos piden leer antes de empezar |
| `privadas` | Nunca se leen, sirven ni suben |
| `secciones` | Vistas propias del menú (skill `glim-secciones`) |

El esquema completo está en `schema/glim.config.schema.json` de Glim. El archivo se valida en modo estricto: una clave desconocida impide arrancar.

## Borradores

Un archivo por pieza: `<borradores>/AAAA-MM-DD-<red>-<slug>.md`. Los que empiezan por `_` son plantillas y Glim los ignora.

Frontmatter `clave: valor`, una clave por línea. No es YAML estricto: los valores llevan dos puntos, paréntesis y `·` sin comillas (`server/repo.js` → `frontmatter`). Respeta ese estilo: no añadas comillas, listas YAML ni bloques.

Campos habituales: `red`, `idioma`, `estado`, `nota_estado`, `programado_para`, `publicado_el`, `publicado_url`, `media`, `plantilla` u `origen_visual: plantilla:<id>`, `buffer`, `origen`, `creado`.

El cuerpo lleva el texto por red con un encabezado en negrita por red (`**X**`, `**LinkedIn**`, `**Threads**`). Las notas para la persona van en un comentario HTML al final (`<!-- … -->`) y nunca se publican.

### Estados

`idea` → `pendiente-ok` → `programado` → `publicado` (o `descartado`).

- Un agente puede crear piezas en `idea` y editar su texto o su visual.
- **Nunca** pases un borrador a `pendiente-ok`, `programado` ni `publicado`: lo decide la persona o lo pone Glim.
- Glim reconcilia con Buffer (`server/reconciliar.js`): en un borrador enlazado escribe `estado`, `programado_para`, `publicado_el`, `publicado_url`, `nota_estado` y `buffer`. No edites a mano esos campos en una pieza ya enlazada; se sobrescriben en la siguiente sincronización.

### Métricas

Glim escribe dos fotos fijas cuando la pieza lleva 48 h y 7 días fuera: `metricas_48h` y `metricas_7d` (skill `glim-metricas`). Nunca las edites ni las borres.

## Dónde va cada cosa

| Qué | Dónde |
|---|---|
| Texto de una pieza | Su borrador en `rutas.borradores` |
| Render, PNG, vídeo | `rutas.media` (y la ruta en `media:` del borrador, sin tocar el estado) |
| Aprendizaje aprobado o feedback de la persona | `rutas.aprendizajes`, entrada nueva arriba (skill `glim-metricas`, apartado «Aprendizajes») |
| Propuesta que aún nadie ha aprobado | Línea `DECISIÓN:` al final de tu respuesta, o el informe semanal |
| Informe semanal | `rutas.informes/AAAA-Www.md` (lo genera Glim) |
| Sección nueva del menú | `glim.config.json` → `secciones` |

## Lo que no se hace nunca

- Publicar, programar, hacer commit, push o PR. La persona publica desde Glim con «Publicar cambios».
- Mover o borrar archivos que ya existen sin que te lo pidan.
- Tocar el código de Glim desde el cerebro.
