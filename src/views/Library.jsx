// Biblioteca: índice de documentos a la izquierda y lector a la derecha.
import React, { useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import { FileText, SearchX } from "lucide-react";
import { useData } from "../lib/data.js";
import { SearchBox, Empty, Fields, CopyButton } from "../components/ui.jsx";
import { hrefOf, useRouteCtx } from "../lib/route.js";
import { repo, haceDias } from "../lib/format.js";
import { t } from "../lib/i18n.js";

function frontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!m) return { rows: [], body: text };
  const rows = [];
  for (const line of m[1].split("\n")) {
    const kv = /^([A-Za-z_][\w-]*):\s?(.*)$/.exec(line);
    if (kv) rows.push([kv[1], kv[2]]);
    else if (rows.length && line.trim()) rows[rows.length - 1][1] += " " + line.trim();
  }
  return { rows, body: text.slice(m[0].length) };
}

function resolver(base, href) {
  const parts = base ? base.split("/") : [];
  for (const seg of href.split("#")[0].split("/")) { if (seg === "..") parts.pop(); else if (seg && seg !== ".") parts.push(seg); }
  return parts.join("/");
}

// Los enlaces relativos del repo se abren dentro del panel: borradores en Posts, documentos aquí, medios en una pestaña.
function linkFor(p) {
  if (/^borradores\/\d{4}-.+\.md$/.test(p)) return hrefOf("posts", { ver: p.slice(11, -3) });
  if (/\.(md|json|ya?ml|tsv|txt|py|mjs|js)$/.test(p)) return hrefOf("biblioteca", { doc: p });
  return null;
}

// Ancla de un encabezado: minúsculas, sin acentos ni signos («Reglas duras (no negociables)» → reglas-duras-no-negociables).
const slug = (s) => s.replace(/<[^>]+>/g, "").replace(/&[a-z#0-9]+;/gi, "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function Reader({ path, sec }) {
  const d = useData();
  const [st, setSt] = useState({ loading: true });
  const primera = React.useRef(path);
  const art = React.useRef(null);
  // Se vuelve a leer cuando cambia el documento o cuando el repo cambia en disco (d.generado).
  useEffect(() => {
    let off = false;
    if (primera.current !== path) { primera.current = path; setSt({ loading: true }); }
    fetch("/api/file?path=" + encodeURIComponent(path)).then(async (r) => ({ ok: r.ok, j: await r.json() }))
      .then(({ ok, j }) => !off && setSt(ok ? { text: j.text, mtime: j.mtime, path } : { error: j.error, path }))
      .catch((e) => !off && setSt({ error: String(e) }));
    return () => { off = true; };
  }, [path, d.generado]);

  const base = path.split("/").slice(0, -1).join("/");
  const { rows, html } = useMemo(() => {
    if (!st.text || !path.endsWith(".md")) return { rows: [], html: null };
    const { rows, body } = frontmatter(st.text);
    const md = body.replace(/<!--([\s\S]*?)-->/g, (_, c) => (c.trim() ? `\n\n> **${t("biblioteca.notaInterna")}** ${c.trim().replace(/\n+/g, " ")}\n\n` : ""));
    const usados = new Map();
    const out = marked.parse(md, { gfm: true })
      .replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, (_, n, inner) => {
        const base = slug(inner) || "seccion";
        const k = usados.get(base) || 0;
        usados.set(base, k + 1);
        return `<h${n} id="${k ? `${base}-${k}` : base}">${inner}</h${n}>`;
      })
      // Las rutas van en el hash, así que un «#seccion» del documento se convierte en ?sec= de esta misma vista.
      .replace(/href="#([^"]+)"/g, (_, s) => `href="${hrefOf("biblioteca", { doc: path, sec: s })}"`)
      .replace(/href="(?!https?:|mailto:|#)([^"]+)"/g, (_, h) => { const p = resolver(base, h); const l = linkFor(p); return l ? `href="${l}"` : `href="${repo(p)}" target="_blank"`; })
      .replace(/src="(?!https?:|data:)([^"]+)"/g, (_, s) => `src="${repo(resolver(base, s))}"`)
      .replace(/href="(https?:[^"]+)"/g, 'href="$1" target="_blank" rel="noreferrer"');
    return { rows, html: out };
  }, [st.text, path]);

  // ?sec= lleva al encabezado con ese id (o al primero que empiece así). Un documento nuevo sin sección se abre arriba;
  // si solo cambia el texto en disco, el lector se queda donde estaba.
  const situado = React.useRef(null);
  useEffect(() => {
    const el = art.current;
    // Hasta que llega el texto del documento nuevo, el lector aún muestra el anterior: no se sitúa sobre él.
    if (!el || st.path !== path) return;
    const clave = path + "#" + (sec || "");
    if (situado.current === clave) return;
    situado.current = clave;
    const h = sec && (el.querySelector(`[id="${CSS.escape(sec)}"]`) || [...el.querySelectorAll("[id]")].find((x) => x.id.startsWith(sec)));
    if (h) h.scrollIntoView({ block: "start" });
    else el.closest(".libreader")?.scrollTo(0, 0);
  }, [html, sec, path, st.path]);

  if (st.loading || st.path !== path) return <p className="muted pad">{t("biblioteca.abriendo", { path })}</p>;
  if (st.error) return <Empty title={t("biblioteca.noSePuede", { path })}>{st.error}</Empty>;
  return (
    <article className="reader" data-path={path} ref={art}>
      <div className="readerhead">
        <span className="mono small muted">{path}</span>
        <span className="row gap-s"><span className="muted small">{t("biblioteca.modificado", { cuando: haceDias(st.mtime) })}</span><CopyButton text={path} label={t("biblioteca.copiarRuta")} /></span>
      </div>
      {rows.length ? <div className="frontbox"><Fields rows={rows} /></div> : null}
      {html ? <div className="prose" dangerouslySetInnerHTML={{ __html: html }} /> : <pre className="raw">{st.text}</pre>}
    </article>
  );
}

export default function Library() {
  const d = useData();
  const r = useRouteCtx();
  const q = (r.params.q || "").toLowerCase();
  // Sin documento elegido se abre el primero que no sea el de reglas: las reglas tienen su propia entrada en el menú.
  const reglas = (d.cerebro && d.cerebro.reglas) || "AGENTS.md";
  const doc = r.params.doc || (d.docs.find((x) => x.path !== reglas) || { path: reglas }).path;
  const entradas = useMemo(() => [
    ...d.docs,
    ...d.skills.map((s) => ({ path: s.path, group: "Skills", title: s.id, sub: s.description })),
  ], [d]);
  const list = entradas.filter((x) => !q || (x.title + " " + x.path + " " + (x.sub || "")).toLowerCase().includes(q));
  const grupos = [...new Set(list.map((x) => x.group))];

  return (
    <div className="library">
      <nav className="libnav" aria-label={t("biblioteca.documentos")}>
        <div className="libnavhead">
          <h1>{t("nav.biblioteca")}</h1>
          <SearchBox value={r.params.q || ""} onChange={(v) => r.set({ q: v || null }, true)} placeholder={t("biblioteca.buscar")} />
        </div>
        <div className="libnavlist">
          {grupos.length ? grupos.map((g) => (
            <div key={g} className="libgroup">
              <p className="navlabel">{g}</p>
              {list.filter((x) => x.group === g).map((x) => (
                <a key={x.path} href={r.withParams({ doc: x.path, sec: null })} className="libitem" aria-current={x.path === doc ? "page" : undefined} title={x.path}>
                  <FileText size={13} aria-hidden="true" />
                  <span>{x.title}</span>
                </a>
              ))}
            </div>
          )) : <Empty icon={SearchX} title={t("comun.nadaCoincide")} />}
        </div>
      </nav>
      <div className="libreader"><Reader path={doc} sec={r.params.sec} /></div>
    </div>
  );
}
