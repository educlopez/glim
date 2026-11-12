// Panel lateral de detalle. No es modal a propósito: la barra de Agentation tiene que seguir siendo clicable.
import { useEffect, useRef } from "react";
import { X as Close } from "lucide-react";

export function Drawer({ open, onClose, title, kicker, actions, children, width = 680, label }) {
  const ref = useRef(null);
  const back = useRef(null);
  useEffect(() => {
    if (!open) return;
    back.current = document.activeElement;
    ref.current && ref.current.focus();
    // Escape dentro de la barra de Agentation (fuera de #root) es suyo: no cierra el panel.
    const on = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const t = e.target;
      if (t !== document.body && t.closest && !t.closest("#root")) return;
      onClose();
    };
    window.addEventListener("keydown", on);
    return () => { window.removeEventListener("keydown", on); back.current && back.current.focus && back.current.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <aside className="drawer" style={{ "--drawer-w": `${width}px` }} role="dialog" aria-label={label || (typeof title === "string" ? title : "Detalle")} tabIndex={-1} ref={ref} data-component="drawer">
        <header className="drawerhead">
          <div className="drawertitle">
            {kicker ? <div className="drawerkicker">{kicker}</div> : null}
            <h2>{title}</h2>
          </div>
          <div className="draweractions">
            {actions}
            <button type="button" className="iconbtn" onClick={onClose} aria-label="Cerrar el panel"><Close size={18} aria-hidden="true" /></button>
          </div>
        </header>
        <div className="drawerbody">{children}</div>
      </aside>
    </>
  );
}
