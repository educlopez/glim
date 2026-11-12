
import { BookOpen, FileText, Layers } from "lucide-react";
import { useData } from "../lib/data.js";
import { PageHeader, Empty, Fields, CopyButton } from "../components/ui.jsx";
import { Thumb } from "../components/Media.jsx";
import { Drawer } from "../components/Drawer.jsx";
import { PedirCambio } from "../components/Composer.jsx";
import { hrefOf, useRouteCtx } from "../lib/route.js";
import { repo, fechaCorta } from "../lib/format.js";

function Detail({ c, onClose }) {
  return (
    <Drawer open onClose={onClose} width={960} title={<span className="mono">{c.slug}</span>} kicker={<span className="muted">{c.series || c.serie} · tema {c.theme}</span>}
      actions={<>
        {c.pdf ? <a className="btn ghost small" href={repo(c.pdf)} target="_blank" rel="noreferrer"><FileText size={14} aria-hidden="true" /><span>PDF</span></a> : null}
        <a className="btn ghost small" href={hrefOf("biblioteca", { doc: c.path })}><BookOpen size={14} aria-hidden="true" /><span>JSON</span></a>
        <PedirCambio objetivo={{ tipo: "carrusel", id: c.slug }} />
      </>}>
      <div className="stackl" data-path={c.path}>
        {c.slides.length ? (
          <div className="slidegrid">
            {c.slides.map((s, i) => (
              <a key={s} href={repo(s)} target="_blank" rel="noreferrer" className="slidecell" data-path={s}>
                <img src={repo(s)} alt={`Slide ${i + 1}`} loading="lazy" />
                <span className="slidenum">{i + 1}</span>
              </a>
            ))}
          </div>
        ) : <Empty title="Sin render local">Renderízalo con el comando de abajo.</Empty>}
        <Fields rows={[
          ["Tipos de slide", c.tipos.join(", ")],
          ["Fecha", c.date ? fechaCorta(c.date) : null],
          ["Renderizar", <span className="row gap-s wrap"><code>{c.cmd}</code><CopyButton text={c.cmd} /></span>],
        ]} />
      </div>
    </Drawer>
  );
}

export default function Carousels() {
  const d = useData();
  const r = useRouteCtx();
  const abierto = r.params.ver && d.carruseles.find((c) => c.slug === r.params.ver);
  const series = [...new Set(d.carruseles.map((c) => c.serie))];
  return (
    <>
      <PageHeader title="Carruseles" sub="Un JSON por carrusel en plantillas/carrusel/series/. Las slides salen de media/carruseles/."
        actions={<a className="btn ghost small" href={hrefOf("biblioteca", { doc: "plantillas/carrusel/README.md" })}><BookOpen size={14} aria-hidden="true" /><span>Temas y tipos</span></a>} />
      {series.map((s) => {
        const items = d.carruseles.filter((c) => c.serie === s);
        return (
          <section key={s} className="section">
            <div className="sectionhead"><h2>{items[0].series || s}<span className="count">{items.length}</span></h2></div>
            <div className="cardgrid carousels">
              {items.map((c) => (
                <a key={c.slug} className="card" href={r.withParams({ ver: c.slug })} data-path={c.path}>
                  <div className="cardmedia r-tall">
                    {c.slides[0] ? <Thumb path={c.slides[0]} kind="image" badge={<><Layers size={12} aria-hidden="true" /> {c.slides.length}</>} /> : <div className="nopreview"><span>Sin render</span></div>}
                  </div>
                  <div className="cardbody">
                    <div className="cardtitle"><span className="mono small">{c.slug}</span></div>
                    <div className="cardmeta"><span className="tag">tema {c.theme}</span><span className="tag">{c.n} slides</span></div>
                  </div>
                </a>
              ))}
            </div>
          </section>
        );
      })}
      {abierto ? <Detail c={abierto} onClose={() => r.set({ ver: null })} /> : null}
    </>
  );
}
