// Todos los posts como tarjetas: tablero por estado o rejilla.
import { useMemo } from "react";
import { Columns3, LayoutGrid, SearchX } from "lucide-react";
import { useRouteCtx } from "../lib/route.js";
import { useData, ESTADOS, REDES } from "../lib/data.js";
import { PageHeader, Segmented, Toggles, SearchBox, Switch, RedIcon, Empty, Estado } from "../components/ui.jsx";
import { PostCard } from "../components/PostCard.jsx";

export default function Posts() {
  const d = useData();
  const r = useRouteCtx();
  const vista = r.params.vista || "tablero";
  const q = r.params.q || "";
  const redes = r.params.redes ? r.params.redes.split(",") : REDES;
  const conDescartados = r.params.descartados === "1";
  const soloAvisos = r.params.avisos === "1";

  const list = useMemo(() => {
    const t = q.toLowerCase();
    return d.posts.filter((p) =>
      p.redes.some((x) => redes.includes(x)) &&
      (!soloAvisos || p.avisos.some((a) => a.nivel !== "bajo")) &&
      (!t || (p.titulo + " " + p.piezas.map((x) => x.texto).join(" ")).toLowerCase().includes(t)));
  }, [d.posts, q, redes.join(), soloAvisos]);

  const columnas = ESTADOS.filter((e) => conDescartados || e.id !== "descartado");
  const conAvisos = d.posts.filter((p) => p.avisos.some((a) => a.nivel !== "bajo")).length;

  return (
    <>
      <PageHeader title="Posts" sub={`${d.posts.length} borradores en borradores/. Pulsa una tarjeta para ver el post completo.`}
        actions={<Segmented label="Vista" value={vista} onChange={(v) => r.set({ vista: v === "tablero" ? null : v })}
          options={[{ id: "tablero", label: "Tablero", icon: Columns3 }, { id: "rejilla", label: "Rejilla", icon: LayoutGrid }]} />}>
        <SearchBox value={q} onChange={(v) => r.set({ q: v || null }, true)} placeholder="Buscar en títulos y textos" />
        <Toggles label="Redes" value={redes} onChange={(v) => r.set({ redes: v.length === REDES.length || !v.length ? null : v.join(",") })}
          options={REDES.map((x) => ({ id: x, label: x, icon: <RedIcon red={x} size={12} />, count: d.posts.filter((p) => p.redes.includes(x)).length }))} />
        <Switch checked={soloAvisos} onChange={(v) => r.set({ avisos: v ? "1" : null })}>Solo con avisos ({conAvisos})</Switch>
        <Switch checked={conDescartados} onChange={(v) => r.set({ descartados: v ? "1" : null })}>Mostrar descartados</Switch>
      </PageHeader>

      {!list.length ? (
        <Empty icon={SearchX} title="Ningún post con estos filtros">
          <button type="button" className="link" onClick={() => r.go("posts", {})}>Quitar todos los filtros</button>
        </Empty>
      ) : vista === "tablero" ? (
        <div className="board">
          {columnas.map((e) => {
            const items = list.filter((p) => p.estado === e.id);
            return (
              <section key={e.id} className="boardcol" aria-label={e.label}>
                <header className="boardcolhead"><Estado id={e.id} /><span className="count">{items.length}</span></header>
                <div className="boardcards">
                  {items.length ? items.map((p) => <PostCard key={p.id} post={p} href={r.withParams({ ver: p.id })} />) : <p className="weekempty">Vacío</p>}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        columnas.map((e) => {
          const items = list.filter((p) => p.estado === e.id);
          return items.length ? (
            <section key={e.id} className="section">
              <div className="sectionhead"><h2><Estado id={e.id} /><span className="count">{items.length}</span></h2></div>
              <div className="cardgrid posts">
                {items.map((p) => <PostCard key={p.id} post={p} href={r.withParams({ ver: p.id })} />)}
              </div>
            </section>
          ) : null;
        })
      )}
    </>
  );
}
