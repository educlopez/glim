// Biblioteca: índice de documentos a la izquierda y lector a la derecha.
import React, { useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import { FileText, SearchX } from "lucide-react";
import { useData } from "../lib/data.js";
import { SearchBox, Empty, Fields, CopyButton } from "../components/ui.jsx";
import { hrefOf, useRouteCtx } from "../lib/route.js";
import { repo, haceDias } from "../lib/format.js";

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

function Reader({ path }) {
  const d = useData();
  const [st, setSt] = useState({ loading: true });
  const primera = React.useRef(path);
  // Se vuelve a leer cuando cambia el documento o cuando el repo cambia en disco (d.generado).
  useEffect(() => {
    let off = false;
    if (primera.current !== path) { primera.current = path; setSt({ loading: true }); }
    fetch("/api/file?path=" + encodeURIComponent(path)).then(async (r) => ({ ok: r.ok, j: await r.json() }))
      .then(({ ok, j }) => !off && setSt(ok ? { text: j.text, mtime: j.mtime } : { error: j.error }))
      .catch((e) => !off && setSt({ error: String(e) }));
    return () => { off = true; };
  }, [path, d.generado]);

  const base = path.split("/").slice(0, -1).join("/");
  const { rows, html } = useMemo(() => {
    if (!st.text || !path.endsWith(".md")) return { rows: [], html: null };
    const { rows, body } = frontmatter(st.text);
    const md = body.replace(/<!--([\s\S]*?)-->/g, (_, c) => (c.trim() ? `\n\n> **Nota interna (no se publica):** ${c.trim().replace(/\n+/g, " ")}\n\n` : ""));
    const out = marked.parse(md, { gfm: true })
      .replace(/href="(?!https?:|mailto:|#)([^"]+)"/g, (_, h) => { const p = resolver(base, h); const l = linkFor(p); return l ? `href="${l}"` : `href="${repo(p)}" target="_blank"`; })
      .replace(/src="(?!https?:|data:)([^"]+)"/g, (_, s) => `src="${repo(resolver(base, s))}"`)
      .replace(/href="(https?:[^"]+)"/g, 'href="$1" target="_blank" rel="noreferrer"');
    return { rows, html: out };
  }, [st.text, path]);

  if (st.loading) return <p className="muted pad">Abriendo {path}…</p>;
  if (st.error) return <Empty title={`No se puede abrir ${path}`}>{st.error}</Empty>;
  return (
    <article className="reader" data-path={path}>
      <div className="readerhead">
        <span className="mono small muted">{path}</span>
        <span className="row gap-s"><span className="muted small">Modificado {haceDias(st.mtime)}</span><CopyButton text={path} label="Copiar ruta" /></span>
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
  const doc = r.params.doc || "AGENTS.md";
  const entradas = useMemo(() => [
    ...d.docs,
    ...d.skills.map((s) => ({ path: s.path, group: "Skills", title: s.id, sub: s.description })),
  ], [d]);
  const list = entradas.filter((x) => !q || (x.title + " " + x.path + " " + (x.sub || "")).toLowerCase().includes(q));
  const grupos = [...new Set(list.map((x) => x.group))];

  return (
    <div className="library">
      <nav className="libnav" aria-label="Documentos">
        <div className="libnavhead">
          <h1>Biblioteca</h1>
          <SearchBox value={r.params.q || ""} onChange={(v) => r.set({ q: v || null }, true)} placeholder="Buscar documento" />
        </div>
        <div className="libnavlist">
          {grupos.length ? grupos.map((g) => (
            <div key={g} className="libgroup">
              <p className="navlabel">{g}</p>
              {list.filter((x) => x.group === g).map((x) => (
                <a key={x.path} href={r.withParams({ doc: x.path })} className="libitem" aria-current={x.path === doc ? "page" : undefined} title={x.path}>
                  <FileText size={13} aria-hidden="true" />
                  <span>{x.title}</span>
                </a>
              ))}
            </div>
          )) : <Empty icon={SearchX} title="Nada coincide" />}
        </div>
      </nav>
      <div className="libreader"><Reader path={doc} /></div>
    </div>
  );
}
