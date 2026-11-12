
import { ArrowRight, TriangleAlert, Info, Sparkles } from "lucide-react";
import { useEncargos } from "../lib/api.js";
import { EncargoCard } from "../components/EncargoCard.jsx";
import { useData, ESTADOS } from "../lib/data.js";
import { PageHeader, Section, Empty, Estado } from "../components/ui.jsx";
import { PostCard, PostChip } from "../components/PostCard.jsx";
import { Thumb } from "../components/Media.jsx";
import { parseDia, isoDia, addDias, lunesDe, DIAS_CORTOS, fechaLarga, haceDias } from "../lib/format.js";
import { hrefOf, useRouteCtx } from "../lib/route.js";

export default function Overview() {
  const d = useData();
  const r = useRouteCtx();
  const lunes = lunesDe(parseDia(d.hoy));
  const semana = Array.from({ length: 7 }, (_, i) => addDias(lunes, i));
  const activos = d.posts.filter((p) => p.estado !== "descartado");
  const okPendiente = d.posts.filter((p) => p.estado === "pendiente-ok");
  const proximos = d.posts.filter((p) => p.estado === "programado" && p.fecha && p.fecha.dia >= d.hoy);
  const avisos = d.posts.flatMap((p) => p.avisos.filter((a) => a.nivel !== "bajo").map((a) => ({ ...a, post: p })));
  const enc = useEncargos();
  const encargos = enc.lista.filter((e) => ["cola", "en-curso", "revisar", "error"].includes(e.estado));
  const renders = d.media.filter((g) => !g.frames).flatMap((g) => g.items).filter((m) => m.kind === "video").sort((a, b) => b.mtime - a.mtime).slice(0, 8);

  return (
    <>
      <PageHeader title="Resumen" sub={fechaLarga(d.hoy)}
        actions={<button type="button" className="btn primary" onClick={() => r.set({ pedir: "general" })}><Sparkles size={14} aria-hidden="true" /><span>Pedir un cambio</span></button>} />

      {encargos.length ? (
        <Section id="h-encargos" title="Encargos en marcha y para revisar" count={encargos.length} actions={<a className="btn ghost small" href={hrefOf("encargos", {})}><span>Ver todos</span><ArrowRight size={14} aria-hidden="true" /></a>}>
          <div className="cardgrid posts">{encargos.slice(0, 6).map((e) => <EncargoCard key={e.id} e={e} href={hrefOf("encargos", { ver: e.id })} />)}</div>
        </Section>
      ) : null}

      <div className="statrow">
        {ESTADOS.filter((e) => e.id !== "descartado").map((e) => (
          <a key={e.id} className="stat" href={hrefOf("posts", {})}>
            <Estado id={e.id} />
            <strong>{d.posts.filter((p) => p.estado === e.id).length}</strong>
          </a>
        ))}
        <a className="stat" href={hrefOf("posts", { avisos: "1" })}>
          <span className="estado e-aviso">Con avisos</span>
          <strong>{new Set(avisos.map((a) => a.post.id)).size}</strong>
        </a>
      </div>

      <Section id="h-semana" title="Esta semana" actions={<a className="btn ghost small" href={hrefOf("calendario", { vista: "semana" })}><span>Abrir calendario</span><ArrowRight size={14} aria-hidden="true" /></a>}>
        <div className="weekstrip">
          {semana.map((dia, i) => {
            const iso = isoDia(dia);
            const lista = activos.filter((p) => p.fecha && p.fecha.dia === iso);
            return (
              <div key={iso} className={`stripday ${iso === d.hoy ? "today" : ""} ${iso < d.hoy ? "past" : ""}`}>
                <div className="stripdayhead"><span>{DIAS_CORTOS[i]}</span><strong>{dia.getDate()}</strong></div>
                {lista.length ? lista.map((p) => <PostChip key={p.id} post={p} href={r.withParams({ ver: p.id })} />) : <span className="weekempty">Nada</span>}
              </div>
            );
          })}
        </div>
      </Section>

      <div className="twocol">
        <Section id="h-ok" title="Necesitan tu OK" count={okPendiente.length}>
          {okPendiente.length ? (
            <div className="cardgrid posts narrow">
              {okPendiente.map((p) => <PostCard key={p.id} post={p} variant="compact" href={r.withParams({ ver: p.id })} />)}
            </div>
          ) : <Empty title="Nada esperando tu OK" />}
        </Section>

        <div>
          <Section id="h-prox" title="Próximos programados" count={proximos.length}>
            {proximos.length ? <div className="stack">{proximos.map((p) => <PostCard key={p.id} post={p} variant="compact" href={r.withParams({ ver: p.id })} />)}</div>
              : <Empty title="Nada programado a partir de hoy">Programa en Buffer solo con tu OK; aparecerá aquí al anotarlo en el borrador.</Empty>}
          </Section>
          <Section id="h-avisos" title="Avisos" count={avisos.length}>
            {avisos.length ? (
              <ul className="alertlist">
                {avisos.map((a, i) => (
                  <li key={i}>
                    <a href={r.withParams({ ver: a.post.id })} data-post={a.post.id}>
                      {a.nivel === "alto" ? <TriangleAlert size={14} className="warnicon" aria-hidden="true" /> : <Info size={14} className="muted" aria-hidden="true" />}
                      <span><strong>{a.post.titulo}</strong><span className="muted"> · {a.texto}</span></span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : <Empty title="Sin avisos" />}
          </Section>
        </div>
      </div>

      <Section id="h-renders" title="Últimos renders" actions={<a className="btn ghost small" href={hrefOf("medios", {})}><span>Ver todos</span><ArrowRight size={14} aria-hidden="true" /></a>}>
        <div className="cardgrid tiles">
          {renders.map((m) => (
            <a key={m.path} className="tile" href={hrefOf("medios", { ver: m.path })} data-path={m.path}>
              <Thumb path={m.path} kind={m.kind} />
              <span className="tilecap"><span className="tilename">{m.name}</span><span className="muted small">{haceDias(m.mtime)}</span></span>
            </a>
          ))}
        </div>
      </Section>
    </>
  );
}
