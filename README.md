# Moss

Una app de Mac para trabajar con agentes de IA sobre tu repo de contenido. Le pides un cambio a un post, una plantilla o una referencia, y Claude Code, Codex, Cursor u OpenCode lo hacen en local, con el contexto del repo y tus reglas. Tú revisas, das el OK y Moss lo sube con una PR revisada.

Moss no guarda nada propio: abre un **cerebro**, un repo de git con un `moss.config.json`. Tus borradores, reglas y referencias siguen siendo archivos tuyos, versionados y legibles por cualquier agente.

> Estado: uso diario de su autor, abierto para quien quiera probarlo. Solo macOS. La interfaz está en castellano.

## Qué hace

- **Encargos a agentes.** «Pedir un cambio» sobre cualquier cosa del cerebro. El agente trabaja en segundo plano, en cola, y ves en directo qué lee, qué edita y qué ejecuta. «Otra vuelta» retoma la misma sesión. Un aviso del sistema cuando termina o falla.
- **Varios agentes.** Claude Code, Codex, Cursor Agent, OpenCode, Gemini CLI o un comando propio. Moss detecta cuáles tienes instalados.
- **Posts y calendario.** Borradores en Markdown por red, con vista previa, contador real de caracteres, avisos y calendario con huecos según tu cadencia. Arrastrar un post a otro día cambia su fecha.
- **Referencias** (inspirado en [Pond](https://github.com/raphaelsalaja/pond)). Enlaces, capturas y vídeos con paleta, búsqueda por color, valoración, duplicados, lectores de X, Instagram, YouTube y más, y copias de páginas. Lienzos libres para juntar referencias y notas y mandarlas a un encargo.
- **Publicar cambios.** Un botón: comprueba secretos y rutas privadas, la IA redacta el commit, abre una PR, la revisa contra tus reglas, espera al CI y la fusiona (con espera cancelable). Nada se sube sin que lo pulses.
- **Buffer, solo lectura.** Lo programado y publicado en Buffer se refleja en los borradores. Moss nunca crea ni programa nada allí.
- **Nativa.** Desenfoque del sistema, Dock con lo que espera revisión, barra de menús, atajo global, icono personalizable, sonidos, claro y oscuro.

## Empezar

Requisitos: macOS, Node 20.19+, Python 3 con Pillow, `git` y al menos un agente instalado (por ejemplo `npm i -g @anthropic-ai/claude-code`). Opcional: `gh` (clonar y publicar), `ffmpeg` y `yt-dlp` (vídeos de referencias).

```bash
git clone https://github.com/educlopez/moss && cd moss
npm ci
npm run app:instalar      # compila y copia Moss.app a ~/Applications
```

Al abrirla te pide un cerebro: una carpeta de este Mac, un repo de GitHub (`usuario/repo`, con tu sesión de `gh`) o uno nuevo que crea con lo mínimo. Para ver cómo es uno, mira [`ejemplos/cerebro-minimo`](ejemplos/cerebro-minimo) y la referencia de [`moss.config.json`](docs/cerebro.md).

Instalada así, Moss sigue la rama `main` de este repo: avisa cuando hay versión nueva, se actualiza con un clic y te enseña las novedades.

### Desarrollo

```bash
MOSS_BRAIN=./ejemplos/cerebro-minimo npm run dev   # interfaz y API en http://127.0.0.1:4321
npm run app                                        # Electron sobre el mismo código
npm run check                                      # lint, tests y build
```

Más en [CONTRIBUTING.md](CONTRIBUTING.md) y [docs/arquitectura.md](docs/arquitectura.md).

## Privacidad y seguridad

Todo corre en tu Mac. El servidor de Moss escucha solo en `127.0.0.1`, con un token por arranque. Las claves de servicios van al Llavero. Las rutas que marques como privadas no se sirven ni se suben nunca. Detalles y cómo avisar de un fallo: [SECURITY.md](SECURITY.md).

## Licencia

[MIT](LICENSE). Geist Mono va incluida bajo la SIL Open Font License 1.1.
