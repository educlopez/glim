// Índice de plantillas como catálogo: miniatura del render real, para qué sirve y su estado.
import { useMemo } from "react";
import { BookOpen, PenTool, FolderX, SearchX } from "lucide-react";
import { useData } from "../lib/data.js";
import { PageHeader, Segmented, SearchBox, Empty, Estado, Fields, CopyButton } from "../components/ui.jsx";
import { Thumb, Player } from "../components/Media.jsx";
import { Drawer } from "../components/Drawer.jsx";
import { PedirCambio } from "../components/Composer.jsx";
import { hrefOf, useRouteCtx } from "../lib/route.js";

const TIPOS = { carrusel: "Carruseles", video: "Vídeo", imagen: "Imagen", componente: "Componentes" };
const ESTADOS = [{ id: "activa", label: "Activas" }, { id: "desaconsejada", label: "Desaconsejadas" }, { id: "retirada", label: "Retiradas" }, { id: "todas", label: "Todas" }];

function TemplateCard({ t, href }) {
  const prev = t.previews[0];
  return (
    <a className="card" href={href} data-plantilla={t.id} data-path={t.dir}>
      <div className="cardmedia r-wide">
        {prev ? <Thumb path={prev.path} kind={prev.kind} /> : <div className="nopreview"><span>Sin render en media/</span></div>}
      </div>
      <div className="cardbody">
        <div className="cardtitle"><span className="mono">{t.id}</span><Estado id={t.estado} label={t.estado} /></div>
        <p className="cardtext clamp3">{t.para}</p>
        <div className="cardmeta">
          {t.requiere_firma ? <span className="tag"><PenTool size={12} aria-hidden="true" /> Firma</span> : null}
          {!t.existe ? <span className="tag warn"><FolderX size={12} aria-hidden="true" /> Fuera de este repo</span> : null}
          {t.previews.length > 1 ? <span className="tag">{t.previews.length} renders</span> : null}
        </div>
      </div>
    </a>
  );
}

function TemplateDetail({ t, onClose }) {
  return (
    <Drawer open onClose={onClose} title={<span className="mono">{t.id}</span>} kicker={<><Estado id={t.estado} label={t.estado} /><span className="muted">{TIPOS[t.tipo] || t.tipo}</span></>}
      actions={<>{t.readme ? <a className="btn ghost small" href={hrefOf("biblioteca", { doc: t.readme })}><BookOpen size={14} aria-hidden="true" /><span>Guía</span></a> : null}<PedirCambio objetivo={{ tipo: "plantilla", id: t.id }} label="Editar con Claude" /></>}>
      <div className="stackl" data-plantilla={t.id} data-path={t.dir}>
        <p className="lead">{t.para}</p>
        {t.no_usar ? <p className="callout"><strong>No usar para:</strong> {t.no_usar}</p> : null}
        {t.motivo_no_tal_cual ? <p className="callout"><strong>No tal cual:</strong> {t.motivo_no_tal_cual}</p> : null}
        {t.previews.length ? (
          <div className="previewgrid">
            {t.previews.map((m) => <figure key={m.path}><Player path={m.path} kind={m.kind} /><figcaption className="small muted mono">{m.path.replace(/^media\//, "")}</figcaption></figure>)}
          </div>
        ) : <Empty title="Sin render local">Renderiza la plantilla o busca en Medios. Los renders viven en media/, que no se versiona.</Empty>}
        <Fields rows={[
          ["Ruta", <span className="row gap-s"><code>{t.ruta}</code><CopyButton text={t.dir} label="Copiar" /></span>],
          ["Serie", t.serie ? <code>{t.serie}</code> : null],
          ["Ejemplo", t.ejemplo ? <code>{t.ejemplo}</code> : null],
          ["Fondo", t.fondo],
          ["Estilo", t.estilo],
          ["Firma", t.requiere_firma ? `Obligatoria${t.nota_firma ? `. ${t.nota_firma}` : ""}` : "No hace falta"],
          ["Obligatoria si", t.obligatoria_si],
          ["Úsala tal cual", t.uso_tal_cual === undefined ? null : t.uso_tal_cual ? "Sí" : "No"],
          ["También", t.tambien],
          ["Tokens", t.tokens ? <code>{typeof t.tokens === "string" ? t.tokens : JSON.stringify(t.tokens)}</code> : null],
          ["Primera referencia", t.referencia_primera],
          ["Retirada el", t.retirada_el],
        ]} />
      </div>
    </Drawer>
  );
}

export default function Templates() {
  const d = useData();
  const r = useRouteCtx();
  const estado = r.params.estado || "activa";
  const q = (r.params.q || "").toLowerCase();
  const list = useMemo(() => d.plantillas.list.filter((t) => (estado === "todas" || t.estado === estado) && (!q || (t.id + " " + t.para).toLowerCase().includes(q))), [d, estado, q]);
  const abierta = r.params.ver && d.plantillas.list.find((t) => t.id === r.params.ver);
  const tipos = [...new Set(d.plantillas.list.map((t) => t.tipo))];

  return (
    <>
      <PageHeader title="Plantillas" sub={`Índice de recursos ${d.plantillas.meta.version || ""}. Una pieza lista para programar solo usa lo que está aquí.`}
        actions={<a className="btn ghost small" href={hrefOf("biblioteca", { doc: "estrategia/indice-recursos.md" })}><BookOpen size={14} aria-hidden="true" /><span>Índice completo</span></a>}>
        <Segmented label="Estado" value={estado} onChange={(v) => r.set({ estado: v === "activa" ? null : v })}
          options={ESTADOS.map((e) => ({ ...e, count: e.id === "todas" ? d.plantillas.list.length : d.plantillas.list.filter((t) => t.estado === e.id).length }))} />
        <SearchBox value={r.params.q || ""} onChange={(v) => r.set({ q: v || null }, true)} placeholder="Buscar plantilla" />
      </PageHeader>
      {list.length ? tipos.map((tipo) => {
        const items = list.filter((t) => t.tipo === tipo);
        return items.length ? (
          <section key={tipo} className="section">
            <div className="sectionhead"><h2>{TIPOS[tipo] || tipo}<span className="count">{items.length}</span></h2></div>
            <div className="cardgrid">{items.map((t) => <TemplateCard key={t.id} t={t} href={r.withParams({ ver: t.id })} />)}</div>
          </section>
        ) : null;
      }) : <Empty icon={SearchX} title="Ninguna plantilla con este filtro"><button type="button" className="link" onClick={() => r.go("plantillas", { estado: "todas" })}>Ver todas</button></Empty>}
      {abierta ? <TemplateDetail t={abierta} onClose={() => r.set({ ver: null })} /> : null}
    </>
  );
}
