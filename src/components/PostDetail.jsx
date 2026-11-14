// Panel de un post: vista previa por red tal como se publicará, avisos, datos y notas internas.
import { useEffect, useState } from "react";
import { ExternalLink, TriangleAlert, FileText, Info } from "lucide-react";
import { Drawer } from "./Drawer.jsx";
import { Redes, RedIcon, Estado, Segmented, Fields, CopyButton } from "./ui.jsx";
import { Player, SlideStrip } from "./Media.jsx";
import { fechaLarga, TIPO_FECHA } from "../lib/format.js";
import { hrefOf } from "../lib/route.js";
import { PedirCambio } from "./Composer.jsx";
import { BufferReal, Instantanea } from "./BufferUI.jsx";
import { EnlacesCortos, conCortos } from "./Enlaces.jsx";
import { Revision, TextoAnotable } from "./Revision.jsx";
import { useData } from "../lib/data.js";
import { EncargoCard } from "./EncargoCard.jsx";
import { useEncargos } from "../lib/api.js";

import { medir } from "../lib/conteo.js";
import { t } from "../lib/i18n.js";

function Autor({ red }) {
  const c = useData().cerebro || {};
  const autor = c.autor || {};
  const avatar = c.rutas && c.rutas.avatar;
  return (
    <div className="mockauthor">
      {avatar ? <img src={`/repo/${avatar}`} alt="" width="36" height="36" /> : <span className="mockavatar" aria-hidden="true">{(autor.nombre || "?").slice(0, 1)}</span>}
      <div>
        <strong>{autor.nombre || t("postDetalle.tu")}</strong>
        <span className="muted">{red === "LinkedIn" || !autor.usuario ? red : `@${autor.usuario}`}</span>
      </div>
      <RedIcon red={red} size={16} />
    </div>
  );
}

function MockVisual({ post }) {
  const v = post.visual;
  if (!v.archivos.length) return null;
  if (v.tipo === "carrusel") return <SlideStrip slides={v.archivos} size="s" />;
  return <div className="mockmedia"><Player path={v.archivos[0]} kind={v.tipo} /></div>;
}

// Vista previa con el aspecto aproximado de la red. Un hilo se pinta como posts encadenados.
// Contador por pieza con el cálculo de la red (en X, cada URL vale 23 y un emoji 2).
function Contador({ texto, red }) {
  const m = medir(texto, red);
  if (!m.limite) return null;
  return <span className={`contador c-${m.nivel}`} title={red === "X" ? t("postDetalle.cuentaX") : undefined}>{m.n} / {m.limite}{m.nivel === "pasa" ? t("postDetalle.sobran", { n: -m.sobra }) : ""}</span>;
}

function Mock({ post, pieza, children }) {
  const partes = pieza.hilo || [pieza.texto];
  return (
    <div className={`mock mock-${pieza.red.toLowerCase()}`}>
      {partes.map((txt, i) => (
        <div key={i} className={`mockpost ${partes.length > 1 ? "in-thread" : ""}`}>
          <Autor red={pieza.red} />
          {children ? children(txt, i) : <p className="mocktext">{txt}</p>}
          {i === 0 ? <MockVisual post={post} /> : null}
          <Contador texto={txt} red={pieza.red} />
        </div>
      ))}
      <p className="mockmeta muted small">
        {partes.length > 1 ? `${t("post.hiloDe", { n: partes.length })} · ` : ""}{t("postDetalle.contadoComo", { red: pieza.red })}
        {post.caracteres ? t("postDetalle.conteoBorrador", { n: post.caracteres }) : ""}
      </p>
    </div>
  );
}

function Notas({ notas }) {
  if (!notas.length) return null;
  return (
    <section className="detailsection">
      <h3>{t("postDetalle.notas")} <span className="muted small">{t("postDetalle.noSePublican")}</span></h3>
      {notas.map((n, i) => <pre key={i} className="note">{n}</pre>)}
    </section>
  );
}

function EncargosDe({ tipo, id }) {
  const enc = useEncargos();
  const l = enc.lista.filter((e) => e.objetivo.tipo === tipo && e.objetivo.id === id && e.estado !== "descartado");
  if (!l.length) return null;
  return (
    <section className="detailsection">
      <h3>{t("nav.encargos")} <span className="count">{l.length}</span></h3>
      <div className="stack">{l.slice(0, 5).map((e) => <EncargoCard key={e.id} e={e} href={hrefOf("encargos", { ver: e.id })} />)}</div>
    </section>
  );
}

export { EncargosDe };

export function PostDetail({ post, onClose }) {
  const d = useData();
  const [seleccion, setSeleccion] = useState(null);
  const comentarios = (d.revisiones || []).filter((x) => x.post === post.id);
  const [red, setRed] = useState(post.piezas[0] ? post.piezas[0].red : null);
  useEffect(() => { setRed(post.piezas[0] ? post.piezas[0].red : null); }, [post.id]);
  const pieza = post.piezas.find((p) => p.red === red) || post.piezas[0];
  const v = post.visual;
  return (
    <Drawer open onClose={onClose} label={t("postDetalle.label", { titulo: post.titulo })}
      kicker={<><Redes redes={post.redes} /><Estado id={post.estado} /></>}
      title={post.titulo}
      actions={<><a className="btn ghost small" href={hrefOf("biblioteca", { doc: post.path })}><FileText size={14} aria-hidden="true" /><span>{t("postDetalle.archivo")}</span></a><PedirCambio objetivo={{ tipo: "post", id: post.id }} /></>}>
      <div className="detailgrid" data-post={post.id} data-path={post.path}>
        <div className="detailmain">
          {post.avisos.length ? (
            <ul className="avisos">
              {post.avisos.map((a, i) => <li key={i} className={`aviso n-${a.nivel}`}>{a.nivel === "bajo" ? <Info size={14} aria-hidden="true" /> : <TriangleAlert size={14} aria-hidden="true" />}<span>{a.texto}</span></li>)}
            </ul>
          ) : null}

          {post.piezas.length > 1 ? (
            <Segmented label={t("postDetalle.red")} value={pieza.red} onChange={setRed}
              options={post.piezas.map((p) => ({ id: p.red, label: p.etiqueta, icon: (props) => <RedIcon red={p.red} size={props.size} /> }))} />
          ) : null}

          {pieza ? (
            <Mock post={post} pieza={pieza}>
              {(txt, i) => <TextoAnotable texto={txt} red={pieza.red} parte={i} comentarios={comentarios} onSelect={setSeleccion} />}
            </Mock>
          ) : <p className="muted">{t("postDetalle.sinTexto")}</p>}

          {pieza ? (
            <div className="row wrap gap-s">
              <CopyButton text={conCortos(post, pieza)} label={post.enlacesCortos && post.enlaces.length ? t("postDetalle.copiarCortos") : t("postDetalle.copiarTexto")} />
              {d.kit.firmas.filter((f) => !f.redes.length || f.redes.includes(pieza.red)).map((f) => <CopyButton key={f.id} text={`${conCortos(post, pieza)}\n\n${f.texto}`} label={t("postDetalle.copiarCon", { nombre: f.nombre })} />)}
            </div>
          ) : null}

          {pieza ? <Revision post={post} seleccion={seleccion} setSeleccion={setSeleccion} /> : null}

          <Notas notas={post.notas} />
        </div>

        <div className="detailside">
          <EncargosDe tipo="post" id={post.id} />
          <section className="detailsection">
            <h3>{t("postDetalle.estado")}</h3>
            <Fields rows={[
              [t("postDetalle.estado"), <Estado id={post.estado} />],
              [t("postDetalle.fecha"), post.fecha ? `${TIPO_FECHA[post.fecha.tipo]}: ${fechaLarga(post.fecha.dia)}${post.fecha.hora ? `, ${post.fecha.hora}` : ""}` : t("fecha.sinFecha")],
              [t("postDetalle.nota"), post.notaEstado],
              [t("postDetalle.idioma"), post.idioma],
            ]} />
          </section>
          <section className="detailsection">
            <h3>{t("postDetalle.visual")}</h3>
            <Fields rows={[
              [t("postDetalle.tipo"), v.tipo ? (v.tipo === "carrusel" ? t("postDetalle.carruselDe", { n: v.archivos.length }) : v.tipo) : t("postDetalle.ninguno")],
              [t("postDetalle.formato"), v.formato],
              [t("postDetalle.archivo"), v.archivos.length && v.tipo !== "carrusel" ? <code>{v.archivos[0]}</code> : null],
              [t("postDetalle.carpeta"), v.tipo === "carrusel" ? <code>{v.archivos[0].split("/").slice(0, -1).join("/")}</code> : null],
              [t("postDetalle.noEstaAqui"), v.falta.length ? <code>{v.falta.join(", ")}</code> : null],
              ["Drive", v.drive === "subido" ? t("postDetalle.subido") : v.drive === "pendiente" ? t("postDetalle.pendienteSubir") : t("postDetalle.sinSubir")],
              [t("postDetalle.alt"), v.alt],
            ]} />
          </section>
          <section className="detailsection">
            <h3>{t("postDetalle.publicacion")}</h3>
            <BufferReal reales={post.buffer.reales} />
            <EnlacesCortos post={post} />
            <Fields rows={[
              ["Buffer", ["no", "borrador", "programado", "enviado", "anotado"].includes(post.buffer.estado) ? t(`postDetalle.buffer.${post.buffer.estado}`) : undefined],
              [t("postDetalle.idsBuffer"), post.buffer.ids.length ? <span className="mono small">{post.buffer.ids.join(" · ")}</span> : null],
              [t("postDetalle.enlaces"), post.publicado.length ? <span className="links">{post.publicado.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer">{u.replace(/^https?:\/\/(www\.)?/, "").slice(0, 38)}<ExternalLink size={12} aria-hidden="true" /></a>)}</span> : null],
              [t("postDetalle.primerComentario"), post.primerComentario],
              [t("postDetalle.metricas"), post.metricas],
              [t("postDetalle.metricas48h"), post.instantaneas && post.instantaneas["48h"] ? <Instantanea foto={post.instantaneas["48h"]} /> : null],
              [t("postDetalle.metricas7d"), post.instantaneas && post.instantaneas["7d"] ? <Instantanea foto={post.instantaneas["7d"]} /> : null],
            ]} />
          </section>
          <section className="detailsection">
            <h3>{t("postDetalle.fuenteRevision")}</h3>
            <Fields rows={[["Repo", post.repo], [t("postDetalle.fuente"), post.fuente], ["Checklist", post.checklist], [t("postDetalle.creado"), post.creado]]} />
          </section>
        </div>
      </div>
    </Drawer>
  );
}
