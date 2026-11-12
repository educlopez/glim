# Arquitectura

```
Moss.app (Electron)
├── electron/main.mjs     ventana, Dock, barra de menús, avisos, elegir cerebro, seguridad de ventanas
│   └── server/           API local (Node), en el mismo proceso
│       ├── cerebro.js    carga y valida moss.config.json; rutas y zona horaria del cerebro
│       ├── api.js        rutas HTTP, acceso (host + token), eventos (SSE)
│       ├── servidor.js   servidor propio de la app empaquetada (dist/ + API)
│       ├── encargos.js   cola de encargos a agentes; agentes.js tiene un adaptador por CLI
│       ├── publicar.js   «Publicar cambios»: seguridad, commit, PR, revisión, CI, fusión
│       └── vivo.js       vigila el cerebro y mantiene la app y el cerebro al día
└── src/                  interfaz en React (Vite)
```

## El cerebro

Moss no guarda contenido propio. Abre un **cerebro**: un repo de git con un `moss.config.json` en la raíz ([referencia](cerebro.md)). Todo lo que enseña lo lee del disco en cada petición, sin caché, y todo lo que escribe va al cerebro (borradores, referencias, lienzos, aprendizajes) o a `<cerebro>/.moss/`, el estado local de este equipo (encargos, ajustes, cachés), que el cerebro ignora en git.

Así la app es pública y los datos son tuyos: el cerebro puede ser privado y vivir en GitHub; Moss lo clona con tu sesión de `gh` y publica cambios con PRs.

## Agentes

Cada CLI tiene un adaptador en `server/agentes.js` que dice cómo lanzarlo (argumentos, si el prompt va por stdin, cómo retomar una sesión) y cómo traducir su salida JSON a eventos comunes: `sesion`, `texto`, `herramienta`, `fallo` y `resultado`. Hoy: Claude Code, Codex, Cursor Agent, OpenCode, Gemini CLI (experimental) y un comando propio con `{prompt}`.

Garantías del ejecutor (`server/encargos.js`):

- Un encargo a la vez; el resto espera en cola.
- El agente corre en su propio grupo de procesos. Detener manda SIGINT, luego SIGTERM y luego SIGKILL al grupo entero (MCP y comandos hijos incluidos).
- 20 minutos sin salida = colgado: se detiene.
- La salida cruda se guarda en `.moss/encargos/<id>.raw.ndjson` para depurar adaptadores.
- Si la app se cierra con un encargo en marcha, al abrir queda como interrumpido y se puede retomar.
- Se compara `HEAD` antes y después: si el agente hizo commits por su cuenta, Moss avisa.

## Seguridad

Ver [SECURITY.md](../SECURITY.md). En corto: servidor solo en `127.0.0.1` con comprobación de `Host` y token por arranque; escrituras con cabecera propia (anti-CSRF); ventanas aisladas con sandbox; CSP; fuses de Electron; claves en el Llavero.

## Actualizaciones

Dos canales:

- **Checkout de git** (`npm run app:instalar`): la app instalada es una capa fina que arranca Vite sobre la carpeta de Moss. Moss mira `origin/main` cada pocos minutos; actualizar es `git pull --ff-only`, `npm ci` si cambió el lock y reinstalar la app solo si cambió `electron/`. Tras actualizar se abren las novedades (`changelog/`).
- **Release** (`npm run dist`, workflow `release.yml`): DMG y ZIP en GitHub Releases. La app avisa de versiones nuevas. La instalación automática en segundo plano (electron-updater) necesita la app firmada y notarizada con una cuenta de Apple Developer; los secretos van en el workflow.

El cerebro también se mantiene al día: si está en su rama principal y sin cambios locales, Moss trae lo nuevo con avance rápido.

## ¿Por qué Electron?

Se valoró Tauri (más ligero, WebView del sistema). Moss se queda en Electron porque depende de cosas que solo da Chromium dentro de la app:

- Ventanas ocultas con sesiones persistentes propias (lectores de X, Instagram…) y copias de páginas con `savePage` en MHTML y capturas completas por el protocolo de DevTools.
- Un servidor Node en el mismo proceso que lanza CLIs, git, `gh`, `ffmpeg` y Python, sin reescribir el back en Rust.
- El mismo motor en todos los equipos: lo que ves en desarrollo es lo que se empaqueta.

Lo que se hace para que Electron no sea el problema: fuses, `asar` con integridad, sandbox, CSP, dependencias de producción mínimas (solo `zod`; React y compañía van compilados en `dist/`) y registro en `~/Library/Logs/Moss/`.

## Desarrollo

- `MOSS_BRAIN=/ruta/al/cerebro npm run dev`: interfaz y API en Vite, con recarga en caliente.
- `npm run app`: Electron sobre el código del checkout.
- Los módulos del servidor no pueden dejar temporizadores vivos sin `unref()`: el proceso no terminaría.
- El servidor nunca importa `electron`; la app le pasa su API por `globalThis.panelElectron`. Desde el checkout, `import "electron"` resolvería al paquete npm, que al cargarse intenta instalarse.
