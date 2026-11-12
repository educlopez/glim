# Seguridad

Glim lee y escribe en tu repo y lanza agentes de IA en tu equipo, así que un fallo de seguridad importa. Si encuentras uno, **no abras un issue público**: usa [Report a vulnerability](https://github.com/educlopez/glim/security/advisories/new) en la pestaña Security del repo. Respondo en unos días.

## Qué protege Glim

- **Servidor local.** Escucha solo en `127.0.0.1`, en un puerto libre que elige el sistema. Rechaza cualquier petición cuyo `Host` no sea `127.0.0.1` o `localhost` (contra el rebinding de DNS). En la app, cada arranque genera un token aleatorio que viaja en una cookie `HttpOnly` y `SameSite=Strict`; sin él no se lee ni se escribe nada.
- **Escrituras.** Las peticiones que escriben o lanzan un agente exigen JSON y la cabecera `x-panel`, que una web ajena no puede enviar sin CORS (y Glim no tiene CORS).
- **Rutas.** Nunca se sirven las rutas `privadas` del cerebro, `.glim/` (salvo las notas de feedback), `.env*`, `.git/` ni `node_modules/`. Toda ruta se normaliza y no puede salir del cerebro.
- **Ventanas.** `contextIsolation`, `sandbox` y sin `nodeIntegration`. El preload expone cuatro funciones. Nada de webviews; los enlaces externos se abren en el navegador; permisos del sistema denegados salvo portapapeles, notificaciones y pantalla completa. CSP estricta en la app empaquetada.
- **Binario.** Fuses de Electron: sin `RunAsNode`, sin `NODE_OPTIONS` ni `--inspect`, cookies cifradas, código solo desde el `asar` con su integridad comprobada.
- **Claves.** Las de Buffer y Dub van al Llavero de macOS; nunca al repo ni al navegador.
- **Agentes.** Corren en la raíz del cerebro con una lista de herramientas permitidas y prohibidas (sin `git commit`, `push`, `gh`, `rm` ni `curl` en Claude Code; `workspace-write` en Codex; sandbox en Cursor). Glim avisa si un agente hace commits por su cuenta. Detener un encargo mata el árbol entero de procesos.
- **Publicar.** «Publicar cambios» bloquea secretos, tu correo de git, rutas privadas o prohibidas y archivos de más de 8 MB antes de crear la PR.

## Lo que no protege

Glim confía en los agentes que instalas y en el cerebro que abres. Un `glim.config.json` o un `AGENTS.md` de un repo ajeno pueden pedir a un agente cosas que no quieres: abre solo cerebros en los que confías.
