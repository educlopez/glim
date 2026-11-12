import { fmtFecha, nombresDias, t } from "./i18n.js";

const pad = (n) => String(n).padStart(2, "0");

export const repo = (p) => "/repo/" + String(p).split("/").map(encodeURIComponent).join("/");

export const parseDia = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const isoDia = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const lunesDe = (d) => addDias(d, -((d.getDay() + 6) % 7));

// Lunes a domingo, abreviados en el idioma activo (lun, mar… / Mon, Tue…).
export const diasCortos = () => nombresDias("short");

export const fechaCorta = (s) => fmtFecha(parseDia(s), { weekday: "short", day: "numeric", month: "short" });
export const fechaLarga = (s) => fmtFecha(parseDia(s), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
export const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const mesTitulo = (d) => capital(fmtFecha(d, { month: "long", year: "numeric" }));
export const haceDias = (ms) => {
  const d = Math.round((Date.now() - ms) / 86400000);
  return d <= 0 ? t("tiempo.hoy") : d === 1 ? t("tiempo.ayer") : d < 30 ? t("tiempo.haceDias", { n: d }) : fmtFecha(ms, { day: "numeric", month: "short" });
};

export const TIPO_FECHA = {
  get programado() { return t("fecha.programado"); },
  get publicado() { return t("fecha.publicado"); },
  get propuesta() { return t("fecha.propuesta"); },
};
export function fechaPost(p) {
  if (!p.fecha) return t("fecha.sinFecha");
  return `${TIPO_FECHA[p.fecha.tipo] || ""} ${fechaCorta(p.fecha.dia)}${p.fecha.hora ? ` · ${p.fecha.hora}` : ""}`.trim();
}

export const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

export const copiar = (text) => navigator.clipboard.writeText(text);
