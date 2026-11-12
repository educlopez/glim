# Contribuir a Glim

Gracias por echar una mano. Glim es pequeño y quiere seguir siéndolo: antes de una función grande, abre un issue y lo hablamos.

## Puesta en marcha

```bash
git clone https://github.com/educlopez/glim && cd glim
npm ci
GLIM_BRAIN=./ejemplos/cerebro-minimo npm run dev   # interfaz y API en http://127.0.0.1:4321
npm run app                                        # la app de Electron sobre el mismo código
```

Requisitos: macOS, Node 20.19 o superior, Python 3 con Pillow (iconos y análisis de referencias) y, para algunas funciones, `ffmpeg` y `yt-dlp`.

## Antes de abrir una PR

```bash
npm run check   # lint (Biome), tests (Vitest) y build
npm run test:e2e
```

- Commits con [Conventional Commits](https://www.conventionalcommits.org/) en inglés (`feat:`, `fix:`, `docs:`…).
- La interfaz y los comentarios del código están en castellano.
- Nada de emojis en la interfaz, el código ni los commits: usa los iconos de `lucide-react`.
- Si tocas `server/esquema.js`, ejecuta `npm run esquema` y sube `schema/glim.config.schema.json`.
- Una novedad visible lleva su entrada en `changelog/<versión>.md`.

## Dónde está cada cosa

Lee [docs/arquitectura.md](docs/arquitectura.md). Resumen: `electron/` es la app de Mac, `server/` la API local que lee el cerebro, `src/` la interfaz en React y `docs/cerebro.md` la referencia de `glim.config.json`.

## Código de conducta

Este proyecto sigue el [Contributor Covenant 2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). Para avisar de un problema, escribe al mantenedor por el canal privado de [SECURITY.md](SECURITY.md).
