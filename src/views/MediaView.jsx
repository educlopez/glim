// Medios renderizados: rejilla uniforme filtrable; el panel dice qué posts usan cada archivo.
import { useMemo } from "react";
import { Film, Image, Music, LayoutGrid, SearchX } from "lucide-react";
import { useData } from "../lib/data.js";
import { PageHeader, Segmented, SearchBox, Switch, Empty, Fields, CopyButton } from "../components/ui.jsx";
import { Thumb, Player } from "../components/Media.jsx";
import { PostCard } from "../components/PostCard.jsx";
import { Drawer } from "../components/Drawer.jsx";
import { PedirCambio } from "../components/Composer.jsx";
import { haceDias } from "../lib/format.js";
import { t } from "../lib/i18n.js";
import { hrefOf, useRouteCtx } from "../lib/route.js";

const LIMITE = 120;

function Detail({ m, onClose }) {
  const d = useData();
  const usos = d.posts.filter((p) => p.visual.archivos.includes(m.path) || (p.visual.descripcion || "").includes(m.path));
  return (
    <Drawer open onClose={onClose} width={820} title={m.name} kicker={<span className="muted mono small">{m.path.split("/").slice(0, -1).join("/")}</span>} actions={<PedirCambio objetivo={{ tipo: "medio", id: m.path }} />}>
      <div className="stackl" data-path={m.path}>
        <Player path={m.path} kind={m.kind} />
        <Fields rows={[[t("medios.ruta"), <span className="row gap-s wrap"><code>{m.path}</code><CopyButton text={m.path} /></span>], [t("medios.modificado"), haceDias(m.mtime)]]} />
        <h3>{t("medios.usadoEn")}</h3>
        {usos.length ? <div className="stack">{usos.map((p) => <PostCard key={p.id} post={p} variant="compact" href={hrefOf("posts", { ver: p.id })} />)}</div>
          : <p className="muted">{t("medios.ningunBorrador")}</p>}
      </div>
    </Drawer>
  );
}

export default function MediaView() {
  const d = useData();
  const r = useRouteCtx();
  const kind = r.params.tipo || "video";
  const carpeta = r.params.carpeta || "";
  const frames = r.params.frames === "1";
  const q = (r.params.q || "").toLowerCase();
  const grupos = d.media.filter((g) => frames || !g.frames);
  const items = useMemo(() => grupos
    .filter((g) => !carpeta || g.dir === carpeta)
    .flatMap((g) => g.items)
    .filter((m) => (kind === "todo" || m.kind === kind || (kind === "image" && m.kind === "pdf")) && (!q || m.path.toLowerCase().includes(q)))
    .sort((a, b) => b.mtime - a.mtime), [grupos, carpeta, kind, q]);
  const all = grupos.flatMap((g) => g.items);
  const n = (k) => all.filter((m) => m.kind === k).length;
  const abierto = r.params.ver && d.media.flatMap((g) => g.items).find((m) => m.path === r.params.ver);

  return (
    <>
      <PageHeader title={t("nav.medios")} sub={t("medios.sub")}>
        <Segmented label={t("postDetalle.tipo")} value={kind} onChange={(v) => r.set({ tipo: v === "video" ? null : v })}
          options={[{ id: "video", label: t("medios.videos"), icon: Film, count: n("video") }, { id: "image", label: t("medios.imagenes"), icon: Image, count: n("image") + n("pdf") }, { id: "audio", label: t("medios.audio"), icon: Music, count: n("audio") }, { id: "todo", label: t("medios.todo"), icon: LayoutGrid }]} />
        <label className="selectbox">
          <span className="sr">{t("postDetalle.carpeta")}</span>
          <select value={carpeta} onChange={(e) => r.set({ carpeta: e.target.value || null })}>
            <option value="">{t("medios.todasCarpetas")}</option>
            {grupos.map((g) => <option key={g.dir} value={g.dir}>{g.dir.replace(/^media\/?/, "") || "media"} ({g.items.length})</option>)}
          </select>
        </label>
        <SearchBox value={r.params.q || ""} onChange={(v) => r.set({ q: v || null }, true)} placeholder={t("medios.buscar")} />
        <Switch checked={frames} onChange={(v) => r.set({ frames: v ? "1" : null })}>{t("medios.fotogramas")}</Switch>
      </PageHeader>
      {items.length ? (
        <>
          <div className="cardgrid tiles">
            {items.slice(0, LIMITE).map((m) => (
              <a key={m.path} className="tile" href={r.withParams({ ver: m.path })} data-path={m.path}>
                <Thumb path={m.path} kind={m.kind} fit={m.kind === "image" ? "contain" : "cover"} />
                <span className="tilecap"><span className="tilename">{m.name}</span><span className="muted small">{m.path.split("/").slice(1, -1).join("/")} · {haceDias(m.mtime)}</span></span>
              </a>
            ))}
          </div>
          {items.length > LIMITE ? <p className="muted small pad">{t("medios.seMuestran", { limite: LIMITE, total: items.length })}</p> : null}
        </>
      ) : <Empty icon={SearchX} title={t("medios.nada")}><button type="button" className="link" onClick={() => r.go("medios", {})}>{t("medios.quitarFiltros")}</button></Empty>}
      {abierto ? <Detail m={abierto} onClose={() => r.set({ ver: null })} /> : null}
    </>
  );
}
