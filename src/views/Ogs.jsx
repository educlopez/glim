// OG animadas: render en bucle al pasar el ratón; el panel enseña el HTML en vivo a tamaño 1200×630.
import { useEffect, useRef, useState } from "react";
import { BookOpen, ExternalLink } from "lucide-react";
import { useData } from "../lib/data.js";
import { PageHeader, Segmented, Fields } from "../components/ui.jsx";
import { HoverVideo, Player } from "../components/Media.jsx";
import { Drawer } from "../components/Drawer.jsx";
import { PedirCambio } from "../components/Composer.jsx";
import { hrefOf, useRouteCtx } from "../lib/route.js";
import { repo } from "../lib/format.js";

// Escala el HTML real (1200×630) al ancho disponible sin deformarlo.
function LiveFrame({ src }) {
  const ref = useRef(null);
  const [k, setK] = useState(0.5);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setK(e.contentRect.width / 1200));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="liveframe">
      <iframe title="OG en vivo" src={src} style={{ transform: `scale(${k})` }} />
    </div>
  );
}

function Detail({ o, onClose }) {
  const [modo, setModo] = useState(o.render ? "render" : "vivo");
  return (
    <Drawer open onClose={onClose} width={900} title={o.id} kicker={<span className="muted">{o.marca}</span>}
      actions={<><a className="btn ghost small" href={repo(o.html)} target="_blank" rel="noreferrer"><ExternalLink size={14} aria-hidden="true" /><span>Abrir HTML</span></a><PedirCambio objetivo={{ tipo: "og", id: o.id }} /></>}>
      <div className="stackl" data-path={o.html}>
        <Segmented label="Vista" value={modo} onChange={setModo} options={[{ id: "render", label: "Render MP4" }, { id: "vivo", label: "HTML en vivo" }]} />
        {modo === "vivo" ? <LiveFrame src={repo(o.html)} /> : o.render ? <Player path={o.render} kind="video" /> : <p className="muted">Sin render local.</p>}
        <Fields rows={[["HTML", <code>{o.html}</code>], ["Render", o.render ? <code>{o.render}</code> : "Sin render"], ["GIF", o.gif ? <code>{o.gif}</code> : null]]} />
      </div>
    </Drawer>
  );
}

export default function Ogs() {
  const d = useData();
  const r = useRouteCtx();
  const abierta = r.params.ver && d.ogs.find((o) => o.id === r.params.ver);
  return (
    <>
      <PageHeader title="OG animadas" sub="Vista previa de enlace de cada web, en HTML con logos y componentes reales. Pasa el ratón para reproducir."
        actions={<a className="btn ghost small" href={hrefOf("biblioteca", { doc: "plantillas/og-animada/README.md" })}><BookOpen size={14} aria-hidden="true" /><span>Guía</span></a>} />
      <div className="cardgrid ogs">
        {d.ogs.map((o) => (
          <a key={o.id} className="card" href={r.withParams({ ver: o.id })} data-path={o.html}>
            <div className="cardmedia r-og">{o.render ? <HoverVideo path={o.render} alt={o.id} /> : <div className="nopreview"><span>Sin render</span></div>}</div>
            <div className="cardbody"><div className="cardtitle"><span>{o.id}</span><span className="muted small">{o.marca}</span></div></div>
          </a>
        ))}
      </div>
      {abierta ? <Detail o={abierta} onClose={() => r.set({ ver: null })} /> : null}
    </>
  );
}
