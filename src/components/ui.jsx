// Piezas pequeñas compartidas por todas las vistas.
import { sonar } from "../lib/sonidos.js";
import React, { useState } from "react";
import { siX, siThreads, siLinkedin } from "simple-icons";
import { Check, Copy, Search } from "lucide-react";
import { estadoLabel } from "../lib/data.js";
import { copiar } from "../lib/format.js";
import { t } from "../lib/i18n.js";

const BRAND = { X: siX, Threads: siThreads, LinkedIn: siLinkedin };

export function RedIcon({ red, size = 14 }) {
  const si = BRAND[red];
  if (!si) return null;
  return (
    <svg className={`redicon red-${red.toLowerCase()}`} viewBox="0 0 24 24" width={size} height={size} role="img" aria-label={red}>
      <path d={si.path} fill="currentColor" />
    </svg>
  );
}

export function Redes({ redes, size }) {
  return <span className="redes">{redes.map((r) => <RedIcon key={r} red={r} size={size} />)}</span>;
}

export function Estado({ id, label }) {
  return <span className={`estado e-${id}`}>{label || estadoLabel(id)}</span>;
}

// Control segmentado: una sola opción activa, para cambiar de modo de vista.
export function Segmented({ value, onChange, options, label }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} className="segbtn" onClick={() => onChange(o.id)}>
          {o.icon ? <o.icon size={14} aria-hidden="true" /> : null}
          <span>{o.label}</span>
          {o.count !== undefined ? <span className="count">{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

// Filtros que se pueden combinar (varios activos a la vez).
export function Toggles({ value, onChange, options, label }) {
  const set = new Set(value);
  return (
    <div className="toggles" role="group" aria-label={label}>
      {options.map((o) => {
        const on = set.has(o.id);
        return (
          <button key={o.id} type="button" className="toggle" aria-pressed={on}
            onClick={() => { const n = new Set(set); on ? n.delete(o.id) : n.add(o.id); onChange([...n]); }}>
            {o.icon || null}<span>{o.label}</span>{o.count !== undefined ? <span className="count">{o.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder }) {
  return (
    <label className="searchbox">
      <Search size={14} aria-hidden="true" />
      <span className="sr">{placeholder}</span>
      <input type="search" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function Switch({ checked, onChange, children }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => { sonar(e.target.checked ? "activar" : "desactivar"); onChange(e.target.checked); }} />
      <span className="switchtrack" aria-hidden="true" />
      <span>{children}</span>
    </label>
  );
}

export function CopyButton({ text, label, className = "" }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={`btn ghost small ${className}`} onClick={() => copiar(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1400); })}>
      {done ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      <span>{done ? t("comun.copiado") : label ?? t("comun.copiar")}</span>
    </button>
  );
}

// Cabecera fija de cada vista: título a la izquierda, controles a la derecha, filtros debajo.
export function PageHeader({ title, sub, actions, children }) {
  return (
    <header className="pagehead">
      <div className="pagehead-row">
        <div className="pagehead-title">
          <h1>{title}</h1>
          {sub ? <p className="muted">{sub}</p> : null}
        </div>
        {actions ? <div className="pagehead-actions">{actions}</div> : null}
      </div>
      {children ? <div className="pagehead-filters">{children}</div> : null}
    </header>
  );
}

export function Empty({ title, children, icon: Icon }) {
  return (
    <div className="emptystate">
      {Icon ? <Icon size={20} aria-hidden="true" /> : null}
      <p className="emptytitle">{title}</p>
      {children ? <div className="muted small">{children}</div> : null}
    </div>
  );
}

export function Section({ title, count, actions, children, id }) {
  return (
    <section className="section" aria-labelledby={id}>
      <div className="sectionhead">
        <h2 id={id}>{title}{count !== undefined ? <span className="count">{count}</span> : null}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

// Lista clave/valor para metadatos en los paneles de detalle.
export function Fields({ rows }) {
  const visible = rows.filter(([, v]) => v !== null && v !== undefined && v !== "" && v !== false);
  if (!visible.length) return null;
  return (
    <dl className="fields">
      {visible.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}
    </dl>
  );
}
