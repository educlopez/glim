// Calendario real: mes en rejilla lun–dom o semana con tarjetas y huecos según la cadencia.
import { useMemo, useState } from "react";
import { post as enviar } from "../lib/api.js";
import { ChevronLeft, ChevronRight, CalendarDays, Columns3, Inbox } from "lucide-react";
import { useRouteCtx } from "../lib/route.js";
import { useData, cadencia, REDES } from "../lib/data.js";
import { PageHeader, Segmented, Toggles, Switch, RedIcon, Empty } from "../components/ui.jsx";
import { PostCard, PostChip } from "../components/PostCard.jsx";
import { BufferEstado, BufferChip } from "../components/BufferUI.jsx";
import { parseDia, isoDia, addDias, lunesDe, mesTitulo, DIAS_CORTOS } from "../lib/format.js";

const MAX_CHIPS = 3;

const RED_BUFFER = { twitter: "X", threads: "Threads", linkedin: "LinkedIn" };

function Huecos({ dia, posts, buffer = [] }) {
  const c = cadencia((dia.getDay() + 6) % 7);
  // Cuenta los borradores del día y lo que está programado en Buffer sin borrador.
  const filas = REDES.filter((r) => c[r]).map((r) => ({ red: r, meta: c[r], hechos: posts.filter((p) => p.redes.includes(r) && p.estado !== "descartado").length + buffer.filter((x) => RED_BUFFER[x.servicio] === r).length }));
  if (!filas.length) return <p className="huecos muted small">Sin cadencia este día</p>;
  return (
    <div className="huecos" aria-label="Cadencia del día">
      {filas.map((f) => (
        <span key={f.red} className={`hueco ${f.hechos >= f.meta ? "full" : ""}`} title={`${f.red}: ${f.hechos} de ${f.meta}`}>
          <RedIcon red={f.red} size={11} />
          {Array.from({ length: f.meta }, (_, i) => <span key={i} className={`pip ${i < f.hechos ? "on" : ""}`} />)}
        </span>
      ))}
    </div>
  );
}

export default function Calendar() {
  const d = useData();
  const r = useRouteCtx();
  const vista = r.params.vista || "mes";
  const ancla = r.params.fecha ? parseDia(r.params.fecha) : parseDia(d.hoy);
  const redes = r.params.redes ? r.params.redes.split(",") : REDES;
  const conDescartados = r.params.descartados === "1";

  const visibles = useMemo(() => d.posts.filter((p) => (conDescartados || p.estado !== "descartado") && p.redes.some((x) => redes.includes(x))), [d.posts, conDescartados, redes.join()]);
  const porDia = useMemo(() => {
    const m = {};
    visibles.filter((p) => p.fecha).forEach((p) => (m[p.fecha.dia] ||= []).push(p));
    Object.values(m).forEach((l) => l.sort((a, b) => (a.fecha.hora || "99").localeCompare(b.fecha.hora || "99")));
    return m;
  }, [visibles]);
  // Lo que está en Buffer y ningún borrador cita, en su día (hora de Madrid).
  const soloBuffer = useMemo(() => {
    const m = {};
    const RED = { twitter: "X", threads: "Threads", linkedin: "LinkedIn" };
    (d.buffer.soloBuffer || []).filter((x) => x.madrid && redes.includes(RED[x.servicio] || x.servicio)).forEach((x) => (m[x.madrid.dia] ||= []).push(x));
    return m;
  }, [d.buffer, redes.join()]);
  const sinFecha = visibles.filter((p) => !p.fecha && p.estado !== "publicado");

  // Arrastrar un post a otro día: cambia la fecha en el borrador (Buffer no se toca).
  const [sobre, setSobre] = useState(null);
  const [aviso, setAviso] = useState(null);
  const soltar = (iso) => ({
    onDragOver: (e) => { if (iso >= hoy && e.dataTransfer.types.includes("text/x-post")) { e.preventDefault(); setSobre(iso); } },
    onDragLeave: () => setSobre((s) => (s === iso ? null : s)),
    onDrop: async (e) => {
      e.preventDefault(); setSobre(null);
      const id = e.dataTransfer.getData("text/x-post");
      const p = d.posts.find((x) => x.id === id);
      if (!p || (p.fecha && p.fecha.dia === iso)) return;
      try {
        await enviar(`/api/posts/${id}/fecha`, { dia: iso });
        setAviso(p.estado === "programado" ? `«${p.titulo}» movido al ${iso}. Falta cambiarlo en Buffer: el panel te avisará hasta que coincida.` : `«${p.titulo}» propuesto para el ${iso}.`);
      } catch (x) { setAviso(x.message); }
    },
  });
  const mover = (n) => {
    const next = vista === "mes" ? new Date(ancla.getFullYear(), ancla.getMonth() + n, 1) : addDias(ancla, 7 * n);
    r.set({ fecha: isoDia(next) });
  };
  const hoy = d.hoy;
  const inicio = vista === "mes" ? lunesDe(new Date(ancla.getFullYear(), ancla.getMonth(), 1)) : lunesDe(ancla);
  const dias = Array.from({ length: vista === "mes" ? 42 : 7 }, (_, i) => addDias(inicio, i));
  const titulo = vista === "mes" ? mesTitulo(ancla) : `Semana del ${dias[0].toLocaleDateString("es-ES", { day: "numeric", month: "long" })}`;
  const enRango = visibles.filter((p) => p.fecha && p.fecha.dia >= isoDia(dias[0]) && p.fecha.dia <= isoDia(dias[dias.length - 1])).length;

  return (
    <>
      <PageHeader
        title={<span className="caltitle">{titulo}</span>}
        sub={`${enRango} posts en este rango · ${sinFecha.length} sin fecha`}
        actions={
          <>
            <div className="btngroup">
              <button type="button" className="iconbtn" onClick={() => mover(-1)} aria-label={vista === "mes" ? "Mes anterior" : "Semana anterior"}><ChevronLeft size={18} aria-hidden="true" /></button>
              <button type="button" className="btn small" onClick={() => r.set({ fecha: null })}>Hoy</button>
              <button type="button" className="iconbtn" onClick={() => mover(1)} aria-label={vista === "mes" ? "Mes siguiente" : "Semana siguiente"}><ChevronRight size={18} aria-hidden="true" /></button>
            </div>
            <Segmented label="Vista" value={vista} onChange={(v) => r.set({ vista: v === "mes" ? null : v })}
              options={[{ id: "mes", label: "Mes", icon: CalendarDays }, { id: "semana", label: "Semana", icon: Columns3 }]} />
          </>
        }>
        <Toggles label="Redes" value={redes} onChange={(v) => r.set({ redes: v.length === REDES.length || !v.length ? null : v.join(",") })}
          options={REDES.map((x) => ({ id: x, label: x, icon: <RedIcon red={x} size={12} /> }))} />
        <Switch checked={conDescartados} onChange={(v) => r.set({ descartados: v ? "1" : null })}>Mostrar descartados</Switch>
        <BufferEstado />
        <span className="legend">
          <span className="estado e-programado">Programado</span>
          <span className="estado e-pendiente-ok">Pendiente de OK</span>
          <span className="estado e-publicado">Publicado</span>
          <span className="legend-prop">Propuesta sin confirmar</span>
        </span>
      </PageHeader>

      {aviso ? <p className="calaviso" role="status">{aviso}<button type="button" className="link" onClick={() => setAviso(null)}>Cerrar</button></p> : null}
      <div className={`calwrap ${vista === "semana" ? "is-week" : ""}`}>
        {vista === "mes" ? (
          <div className="month" role="grid" aria-label={titulo}>
            {DIAS_CORTOS.map((n) => <div key={n} className="monthhead" role="columnheader">{n}</div>)}
            {dias.map((dia) => {
              const iso = isoDia(dia);
              const lista = porDia[iso] || [];
              const fuera = dia.getMonth() !== ancla.getMonth();
              return (
                <div key={iso} role="gridcell" className={`day ${fuera ? "out" : ""} ${iso === hoy ? "today" : ""} ${iso < hoy ? "past" : ""} ${sobre === iso ? "drop" : ""}`} data-component="dia" data-dia={iso} {...soltar(iso)}>
                  <button type="button" className="daynum" onClick={() => r.set({ vista: "semana", fecha: iso })} aria-label={`Ver la semana del ${dia.toLocaleDateString("es-ES", { day: "numeric", month: "long" })}`}>
                    {dia.getDate()}
                  </button>
                  <div className="daylist">
                    {lista.slice(0, MAX_CHIPS).map((p) => <PostChip key={p.id} post={p} href={r.withParams({ ver: p.id })} />)}
                    {(soloBuffer[iso] || []).slice(0, 2).map((x) => <BufferChip key={x.id} x={x} />)}
                    {lista.length > MAX_CHIPS ? <button type="button" className="more" onClick={() => r.set({ vista: "semana", fecha: iso })}>{lista.length - MAX_CHIPS} más</button> : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="week">
            {dias.map((dia, i) => {
              const iso = isoDia(dia);
              const lista = porDia[iso] || [];
              return (
                <div key={iso} className={`weekday ${iso === hoy ? "today" : ""} ${iso < hoy ? "past" : ""} ${sobre === iso ? "drop" : ""}`} data-component="dia" data-dia={iso} {...soltar(iso)}>
                  <div className="weekdayhead">
                    <span className="wdname">{DIAS_CORTOS[i]}</span>
                    <span className="wdnum">{dia.getDate()}</span>
                  </div>
                  <Huecos dia={dia} posts={lista} buffer={soloBuffer[iso] || []} />
                  <div className="weeklist">
                    {lista.length ? lista.map((p) => <PostCard key={p.id} post={p} variant="compact" href={r.withParams({ ver: p.id })} />)
                      : !(soloBuffer[iso] || []).length ? <p className="weekempty">Nada</p> : null}
                    {(soloBuffer[iso] || []).map((x) => <BufferChip key={x.id} x={x} />)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <aside className="nodate" aria-labelledby="nodate-h">
          <h2 id="nodate-h"><Inbox size={15} aria-hidden="true" /> Sin fecha <span className="count">{sinFecha.length}</span></h2>
          {sinFecha.length ? (
            <div className="nodatelist">
              {["pendiente-ok", "idea", "programado", "descartado"].map((e) => {
                const l = sinFecha.filter((p) => p.estado === e);
                return l.length ? <div key={e} className="nodategroup">{l.map((p) => <PostChip key={p.id} post={p} href={r.withParams({ ver: p.id })} />)}</div> : null;
              })}
            </div>
          ) : <Empty title="Todo tiene fecha" />}
        </aside>
      </div>
    </>
  );
}
