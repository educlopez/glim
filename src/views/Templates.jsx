// Índice de plantillas como catálogo: miniatura del render real, para qué sirve y su estado.
import { useMemo } from "react";
import { BookOpen, PenTool, FolderX, SearchX } from "lucide-react";
import { useData } from "../lib/data.js";
import { PageHeader, Segmented, SearchBox, Empty, Estado, Fields, CopyButton } from "../components/ui.jsx";
import { Thumb, Player } from "../components/Media.jsx";
import { Drawer } from "../components/Drawer.jsx";
import { PedirCambio } from "../components/Composer.jsx";
import { hrefOf, useRouteCtx } from "../lib/route.js";
import { t } from "../lib/i18n.js";

// Tipo y estado vienen del índice de plantillas (identificadores); aquí solo se traduce la etiqueta.
const TIPOS = ["carrusel", "video", "imagen", "componente"];
const tipoLabel = (tipo) => (TIPOS.includes(tipo) ? t(`plantillas.tipo.${tipo}`) : tipo);
const estadoPl = (e) => (["activa", "desaconsejada", "retirada"].includes(e) ? t(`plantillas.estado.${e}`) : e);
const ESTADOS = ["activa", "desaconsejada", "retirada", "todas"].map((id) => ({ id, get label() { return t(`plantillas.filtro.${id}`); } }));

function TemplateCard({ pl, href }) {
  const prev = pl.previews[0];
  return (
    <a className="card" href={href} data-plantilla={pl.id} data-path={pl.dir}>
      <div className="cardmedia r-wide">
        {prev ? <Thumb path={prev.path} kind={prev.kind} /> : <div className="nopreview"><span>{t("plantillas.sinRenderMedia")}</span></div>}
      </div>
      <div className="cardbody">
        <div className="cardtitle"><span className="mono">{pl.id}</span><Estado id={pl.estado} label={estadoPl(pl.estado)} /></div>
        <p className="cardtext clamp3">{pl.para}</p>
        <div className="cardmeta">
          {pl.requiere_firma ? <span className="tag"><PenTool size={12} aria-hidden="true" /> {t("composer.firma")}</span> : null}
          {pl.ubicacion ? <span className="tag">{t("plantillas.enOtroSitio", { donde: pl.ubicacion })}</span>
            : !pl.existe ? <span className="tag warn"><FolderX size={12} aria-hidden="true" /> {t("plantillas.fueraRepo")}</span> : null}
          {pl.previews.length > 1 ? <span className="tag">{t("plantillas.renders", { n: pl.previews.length })}</span> : null}
        </div>
      </div>
    </a>
  );
}

function TemplateDetail({ pl, onClose }) {
  return (
    <Drawer open onClose={onClose} title={<span className="mono">{pl.id}</span>} kicker={<><Estado id={pl.estado} label={estadoPl(pl.estado)} /><span className="muted">{tipoLabel(pl.tipo)}</span></>}
      actions={<>{pl.readme ? <a className="btn ghost small" href={hrefOf("biblioteca", { doc: pl.readme })}><BookOpen size={14} aria-hidden="true" /><span>{t("ogs.guia")}</span></a> : null}<PedirCambio objetivo={{ tipo: "plantilla", id: pl.id }} label={t("plantillas.editarClaude")} /></>}>
      <div className="stackl" data-plantilla={pl.id} data-path={pl.dir}>
        <p className="lead">{pl.para}</p>
        {pl.no_usar ? <p className="callout"><strong>{t("plantillas.noUsar")}</strong> {pl.no_usar}</p> : null}
        {pl.motivo_no_tal_cual ? <p className="callout"><strong>{t("plantillas.noTalCual")}</strong> {pl.motivo_no_tal_cual}</p> : null}
        {pl.previews.length ? (
          <div className="previewgrid">
            {pl.previews.map((m) => <figure key={m.path}><Player path={m.path} kind={m.kind} /><figcaption className="small muted mono">{m.path.replace(/^media\//, "")}</figcaption></figure>)}
          </div>
        ) : <Empty title={t("carruseles.sinRenderLocal")}>{t("plantillas.sinRenderAyuda")}</Empty>}
        <Fields rows={[
          [t("medios.ruta"), <span className="row gap-s"><code>{pl.ruta}</code><CopyButton text={pl.dir} label={t("comun.copiar")} /></span>],
          [t("plantillas.serie"), pl.serie ? <code>{pl.serie}</code> : null],
          [t("plantillas.ejemplo"), pl.ejemplo ? <code>{pl.ejemplo}</code> : null],
          [t("plantillas.fondo"), pl.fondo],
          [t("plantillas.estilo"), pl.estilo],
          [t("composer.firma"), pl.requiere_firma ? `${t("plantillas.obligatoria")}${pl.nota_firma ? `. ${pl.nota_firma}` : ""}` : t("plantillas.noHaceFalta")],
          [t("plantillas.obligatoriaSi"), pl.obligatoria_si],
          [t("plantillas.talCual"), pl.uso_tal_cual === undefined ? null : pl.uso_tal_cual ? t("comun.si") : t("comun.no")],
          [t("plantillas.tambien"), pl.tambien],
          ["Tokens", pl.tokens ? <code>{typeof pl.tokens === "string" ? pl.tokens : JSON.stringify(pl.tokens)}</code> : null],
          [t("plantillas.primeraRef"), pl.referencia_primera],
          [t("plantillas.retiradaEl"), pl.retirada_el],
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
      <PageHeader title={t("nav.plantillas")} sub={t("plantillas.sub", { version: d.plantillas.meta.version || "" })}
        actions={<a className="btn ghost small" href={hrefOf("biblioteca", { doc: "estrategia/indice-recursos.md" })}><BookOpen size={14} aria-hidden="true" /><span>{t("plantillas.indiceCompleto")}</span></a>}>
        <Segmented label={t("postDetalle.estado")} value={estado} onChange={(v) => r.set({ estado: v === "activa" ? null : v })}
          options={ESTADOS.map((e) => ({ ...e, count: e.id === "todas" ? d.plantillas.list.length : d.plantillas.list.filter((t) => t.estado === e.id).length }))} />
        <SearchBox value={r.params.q || ""} onChange={(v) => r.set({ q: v || null }, true)} placeholder={t("plantillas.buscar")} />
      </PageHeader>
      {list.length ? tipos.map((tipo) => {
        const items = list.filter((t) => t.tipo === tipo);
        return items.length ? (
          <section key={tipo} className="section">
            <div className="sectionhead"><h2>{tipoLabel(tipo)}<span className="count">{items.length}</span></h2></div>
            <div className="cardgrid">{items.map((t) => <TemplateCard key={t.id} pl={t} href={r.withParams({ ver: t.id })} />)}</div>
          </section>
        ) : null;
      }) : <Empty icon={SearchX} title={t("plantillas.ninguna")}><button type="button" className="link" onClick={() => r.go("plantillas", { estado: "todas" })}>{t("plantillas.verTodas")}</button></Empty>}
      {abierta ? <TemplateDetail pl={abierta} onClose={() => r.set({ ver: null })} /> : null}
    </>
  );
}
