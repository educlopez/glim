
import { BookOpen } from "lucide-react";
import { useData } from "../lib/data.js";
import { PageHeader, Fields, CopyButton } from "../components/ui.jsx";
import { Drawer } from "../components/Drawer.jsx";
import { PedirCambio } from "../components/Composer.jsx";
import { hrefOf, useRouteCtx } from "../lib/route.js";
import { repo } from "../lib/format.js";

const COLORES = ["color", "secundario", "acento", "color_fuerte", "tinte", "suelo", "suelo_alt", "superficie", "borde", "tinta", "oscuro"];
const isHex = (v) => typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v);

function Logo({ m }) {
  const j = m.data;
  return (
    <div className="brandlogo" style={{ background: isHex(j.suelo) ? j.suelo : undefined }}>
      {m.logo ? <img src={repo(m.logo)} alt={`Logo de ${j.nombre}`} /> : <span style={{ color: isHex(j.tinta) ? j.tinta : undefined }}>{j.wordmark || j.nombre}</span>}
    </div>
  );
}

const valor = (v) => (typeof v === "string" ? v : Array.isArray(v) ? v.join(", ") : Object.entries(v).map(([k, x]) => `${k}: ${typeof x === "string" ? x : JSON.stringify(x)}`).join(" · "));

function Detail({ m, onClose }) {
  const j = m.data;
  const cols = COLORES.filter((k) => isHex(j[k]));
  const resto = Object.entries(j).filter(([k, v]) => !COLORES.includes(k) && !["nombre", "web"].includes(k) && v !== null && v !== "");
  return (
    <Drawer open onClose={onClose} title={j.nombre} kicker={j.web ? <a href={`https://${j.web}`} target="_blank" rel="noreferrer">{j.web}</a> : null}
      actions={<><a className="btn ghost small" href={hrefOf("biblioteca", { doc: m.path })}><BookOpen size={14} aria-hidden="true" /><span>JSON</span></a><PedirCambio objetivo={{ tipo: "marca", id: m.id }} /></>}>
      <div className="stackl" data-path={m.path}>
        <Logo m={m} />
        <ul className="swatchgrid">
          {cols.map((k) => (
            <li key={k}>
              <span className="sw" style={{ background: j[k] }} />
              <span><strong className="small">{k}</strong><br /><code>{j[k]}</code></span>
              <CopyButton text={j[k]} label="" className="swcopy" />
            </li>
          ))}
        </ul>
        <Fields rows={resto.map(([k, v]) => [k.replace(/_/g, " "), valor(v)])} />
      </div>
    </Drawer>
  );
}

export default function Brands() {
  const d = useData();
  const r = useRouteCtx();
  const abierta = r.params.ver && d.marcas.find((m) => m.id === r.params.ver);
  return (
    <>
      <PageHeader title="Marcas" sub="Kit por proyecto en plantillas/marcas/. Léelo antes de cualquier visual de ese proyecto."
        actions={<a className="btn ghost small" href={hrefOf("biblioteca", { doc: "plantillas/marcas/README.md" })}><BookOpen size={14} aria-hidden="true" /><span>Cómo se usan</span></a>} />
      <div className="cardgrid brands">
        {d.marcas.map((m) => {
          const j = m.data;
          return (
            <a key={m.id} className="card" href={r.withParams({ ver: m.id })} data-path={m.path}>
              <Logo m={m} />
              <div className="cardbody">
                <div className="cardtitle"><span>{j.nombre}</span>{j.web ? <span className="muted small">{j.web}</span> : null}</div>
                <div className="swatchrow">{COLORES.filter((k) => isHex(j[k])).slice(0, 6).map((k) => <span key={k} className="sw s" style={{ background: j[k] }} title={`${k} ${j[k]}`} />)}</div>
                {j.personalidad ? <p className="cardtext clamp2">{j.personalidad}</p> : null}
              </div>
            </a>
          );
        })}
      </div>
      {abierta ? <Detail m={abierta} onClose={() => r.set({ ver: null })} /> : null}
    </>
  );
}
