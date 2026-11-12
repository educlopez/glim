
import { ArrowRight, TriangleAlert, Info } from "lucide-react";
import { useEncargos } from "../lib/api.js";
import { EncargoCard } from "../components/EncargoCard.jsx";
import { useData, ESTADOS } from "../lib/data.js";
import { PageHeader, Section, Empty, Estado, GlimMark } from "../components/ui.jsx";
import { PostCard, PostChip } from "../components/PostCard.jsx";
import { Thumb } from "../components/Media.jsx";
import { parseDia, isoDia, addDias, lunesDe, diasCortos, fechaLarga, haceDias } from "../lib/format.js";
import { t } from "../lib/i18n.js";
import { hrefOf, useRouteCtx } from "../lib/route.js";

export default function Overview() {
  const d = useData();
  const r = useRouteCtx();
  const lunes = lunesDe(parseDia(d.hoy));
  const semana = Array.from({ length: 7 }, (_, i) => addDias(lunes, i));
  const dias = diasCortos();
  const activos = d.posts.filter((p) => p.estado !== "descartado");
  const okPendiente = d.posts.filter((p) => p.estado === "pendiente-ok");
  const proximos = d.posts.filter((p) => p.estado === "programado" && p.fecha && p.fecha.dia >= d.hoy);
  const avisos = d.posts.flatMap((p) => p.avisos.filter((a) => a.nivel !== "bajo").map((a) => ({ ...a, post: p })));
  const enc = useEncargos();
  const encargos = enc.lista.filter((e) => ["cola", "en-curso", "revisar", "error"].includes(e.estado));
  const renders = d.media.filter((g) => !g.frames).flatMap((g) => g.items).filter((m) => m.kind === "video").sort((a, b) => b.mtime - a.mtime).slice(0, 8);

  return (
    <>
      <PageHeader title={t("nav.resumen")} sub={fechaLarga(d.hoy)}
        actions={<button type="button" className="btn primary" onClick={() => r.set({ pedir: "general" })}><GlimMark size={14} /><span>{t("app.pedirCambio")}</span></button>} />

      {encargos.length ? (
        <Section id="h-encargos" title={t("resumen.encargos")} count={encargos.length} actions={<a className="btn ghost small" href={hrefOf("encargos", {})}><span>{t("comun.verTodos")}</span><ArrowRight size={14} aria-hidden="true" /></a>}>
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
          <span className="estado e-aviso">{t("resumen.conAvisos")}</span>
          <strong>{new Set(avisos.map((a) => a.post.id)).size}</strong>
        </a>
      </div>

      <Section id="h-semana" title={t("resumen.estaSemana")} actions={<a className="btn ghost small" href={hrefOf("calendario", { vista: "semana" })}><span>{t("resumen.abrirCalendario")}</span><ArrowRight size={14} aria-hidden="true" /></a>}>
        <div className="weekstrip">
          {semana.map((dia, i) => {
            const iso = isoDia(dia);
            const lista = activos.filter((p) => p.fecha && p.fecha.dia === iso);
            return (
              <div key={iso} className={`stripday ${iso === d.hoy ? "today" : ""} ${iso < d.hoy ? "past" : ""}`}>
                <div className="stripdayhead"><span>{dias[i]}</span><strong>{dia.getDate()}</strong></div>
                {lista.length ? lista.map((p) => <PostChip key={p.id} post={p} href={r.withParams({ ver: p.id })} />) : <span className="weekempty">{t("resumen.nada")}</span>}
              </div>
            );
          })}
        </div>
      </Section>

      <div className="twocol">
        <Section id="h-ok" title={t("resumen.necesitanOk")} count={okPendiente.length}>
          {okPendiente.length ? (
            <div className="cardgrid posts narrow">
              {okPendiente.map((p) => <PostCard key={p.id} post={p} variant="compact" href={r.withParams({ ver: p.id })} />)}
            </div>
          ) : <Empty title={t("resumen.nadaOk")} />}
        </Section>

        <div>
          <Section id="h-prox" title={t("resumen.proximos")} count={proximos.length}>
            {proximos.length ? <div className="stack">{proximos.map((p) => <PostCard key={p.id} post={p} variant="compact" href={r.withParams({ ver: p.id })} />)}</div>
              : <Empty title={t("resumen.nadaProgramado")}>{t("resumen.nadaProgramadoAyuda")}</Empty>}
          </Section>
          <Section id="h-avisos" title={t("resumen.avisos")} count={avisos.length}>
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
            ) : <Empty title={t("resumen.sinAvisos")} />}
          </Section>
        </div>
      </div>

      <Section id="h-renders" title={t("resumen.ultimosRenders")} actions={<a className="btn ghost small" href={hrefOf("medios", {})}><span>{t("comun.verTodos")}</span><ArrowRight size={14} aria-hidden="true" /></a>}>
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
