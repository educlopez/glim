const pad = (n) => String(n).padStart(2, "0");

export const repo = (p) => "/repo/" + String(p).split("/").map(encodeURIComponent).join("/");

export const parseDia = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const isoDia = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const lunesDe = (d) => addDias(d, -((d.getDay() + 6) % 7));

export const DIAS_CORTOS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

export const fechaCorta = (s) => parseDia(s).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
export const fechaLarga = (s) => parseDia(s).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
export const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const mesTitulo = (d) => capital(d.toLocaleDateString("es-ES", { month: "long", year: "numeric" }));
export const haceDias = (ms) => {
  const d = Math.round((Date.now() - ms) / 86400000);
  return d <= 0 ? "hoy" : d === 1 ? "ayer" : d < 30 ? `hace ${d} días` : new Date(ms).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
};

export const TIPO_FECHA = { programado: "Programado", publicado: "Publicado", propuesta: "Propuesta" };
export function fechaPost(p) {
  if (!p.fecha) return "Sin fecha";
  return `${TIPO_FECHA[p.fecha.tipo] || ""} ${fechaCorta(p.fecha.dia)}${p.fecha.hora ? ` · ${p.fecha.hora}` : ""}`.trim();
}

export const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

export const copiar = (text) => navigator.clipboard.writeText(text);
