// Eventos del servidor (Server-Sent Events en /api/eventos): cambios en el cerebro, publicación y actualizaciones.
// Una sola conexión para toda la ventana; el navegador reconecta solo si el servidor se reinicia.
const oyentes = new Map();
let fuente = null;

function conectar() {
  fuente = new EventSource("/api/eventos");
  for (const evento of oyentes.keys()) escuchar(evento);
}
function escuchar(evento) {
  fuente.addEventListener(evento, (m) => {
    let datos = {};
    try { datos = JSON.parse(m.data); } catch { /* evento sin datos */ }
    for (const fn of oyentes.get(evento) || []) fn(datos);
  });
}

export function on(evento, fn) {
  if (!oyentes.has(evento)) { oyentes.set(evento, new Set()); if (fuente) escuchar(evento); }
  oyentes.get(evento).add(fn);
  if (!fuente) conectar();
  return () => oyentes.get(evento).delete(fn);
}
