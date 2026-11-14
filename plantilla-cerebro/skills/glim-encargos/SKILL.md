---
name: glim-encargos
description: >-
  Cómo trabajar un encargo que llega desde Glim (o desde Lumi, su asistente): qué contexto trae
  el prompt, qué tipos de objetivo hay, cómo son las rondas y qué se puede escribir y qué no.
  Úsala cuando el prompt empiece por «Encargo desde Glim» o «Eres Lumi», cuando un agente
  trabaje en un repo con glim.config.json por encargo de su dueña o dueño, o cuando haya que
  responder con los apartados Hecho, Archivos y Revisa.
version: 1.0.0
---

# Encargos de Glim

Un encargo es un cambio que la persona pide desde el panel de Glim. Glim lanza un agente (Claude Code, Codex, Cursor, OpenCode, Gemini o un comando propio) en segundo plano, sin interacción, con todo el contexto en el prompt. Fuente: `server/encargos.js` y `server/agentes.js` del repo de Glim.

## Qué trae el prompt

En este orden (`encargos.js` → `prompt()`):

1. **Texto literal** de la persona, citado con `>`. Es la petición; no la reinterpretes.
2. **Sobre qué**: el objetivo y dónde están sus archivos.
3. **Plantilla** elegida (si hay): carpeta, guía y renders de ejemplo. Lee la guía antes de usarla.
4. **Referencias** adjuntas (si hay): estilo interno. Nunca las nombres en una pieza pública.
5. **Kit** de publicación (firma, preset), si se eligió.
6. **Antes de empezar**: archivos de `contexto.leerAntes` que existen, últimas 8 entradas del registro de aprendizajes y métricas de hasta 5 piezas publicadas parecidas (misma red y misma plantilla o tipo de visual). Va acotado; abre los archivos si necesitas más.
7. **Cómo trabajar** y **Cómo responder**.

Además, un mensaje de sistema con las reglas que no se negocian (`SISTEMA` en `encargos.js`), más las líneas de `glim.config.json` → `agentes.reglas`.

## Tipos de objetivo

| Tipo | Qué es | Archivo principal |
|---|---|---|
| `post` | Un borrador | `<borradores>/<id>.md` |
| `plantilla` | Una plantilla del índice de recursos | su carpeta y su guía |
| `carrusel` | Un carrusel (JSON + slides) | el JSON de la serie |
| `og` | Una OG animada | su `index.html` |
| `marca` | Un kit de marca | el JSON de la marca |
| `medio` | Un archivo de medios | la ruta del archivo |
| `general` | Cualquier cambio en el repo | — |
| `lumi` | Conversación con Lumi | — |

## Cómo trabajar

1. Lee el archivo de reglas del cerebro y la guía o skill que toque (skill `glim-cerebro`).
2. Haz el cambio en los archivos del repo. Si hay render, genéralo en `rutas.media` y míralo (PNG o fotogramas) antes de darlo por bueno.
3. Si cambias el visual de un post, actualiza `media:` en su borrador sin tocar `estado`.
4. No publiques, no programes, no hagas commit, push ni PR. No borres (`rm` está prohibido).

Puede que trabajes en una **copia aislada** (un git worktree en `.glim/`): la persona aplica los cambios al repo desde el panel. Escribe solo dentro del directorio de trabajo.

Los comandos permitidos sin preguntar son los básicos (`node`, `npm run`, `python3`, `ffmpeg`, `rg`, `fd`, `ls`, `mkdir`, `cp`…) más `agentes.comandos`. Todo lo demás se deniega solo en modo no interactivo: no insistas, dilo en **Revisa**.

Sin MCP por defecto. Si el cerebro activa `agentes.usarMcpDelCerebro`, Claude Code carga solo el `.mcp.json` del cerebro (o `agentes.mcp`).

## Rondas

Si la persona pide «otra vuelta», llega un mensaje nuevo en la misma sesión: «ha revisado el resultado y pide otra vuelta» + su texto. Mismas reglas. Corrige sobre lo que hiciste; no empieces de cero salvo que lo pida.

## Qué escribir y qué no

- **Sí**: archivos del repo que pide el encargo, renders en `rutas.media`.
- **Registro de aprendizajes** (`rutas.aprendizajes`): solo si el encargo es feedback de la persona o un rechazo (algo no le gusta, no vale o hay que dejar de hacerlo). Entrada nueva arriba, con su formato, y lo que dijo, sin inventar. Cualquier otra idea es una propuesta: línea `DECISIÓN:` en la respuesta.
- **No**: el estado de un borrador (`pendiente-ok`, `programado`, `publicado`), `privadas`, `.glim/`, el código de Glim.

## Cómo responder

En el idioma del cerebro y breve:

- **Hecho:** qué has cambiado.
- **Archivos:** rutas de lo creado o editado, renders incluidos.
- **Revisa:** qué debe mirar la persona o qué falta.

Si sale una decisión que conviene recordar, una línea por decisión que empiece exactamente por `DECISIÓN:`. Glim las extrae y la persona decide si pasan al registro (vista Registro).

## Lumi

Si eres Lumi (`PASOS_LUMI` en `encargos.js`): una pregunta se responde sin cambiar nada; un cambio de contenido se hace como un encargo general; adaptar Glim es editar solo `glim.config.json` → `secciones` (skill `glim-secciones`). Lumi trabaja siempre en el repo, nunca en copia aislada.
