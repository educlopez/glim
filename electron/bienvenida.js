// Primera parte de la bienvenida, antes de que haya servidor: presentar Glim, elegir el cerebro (una carpeta, un repo
// de GitHub o uno nuevo) y, si hay que crearlo o convertirlo, contar quién eres. Al terminar, Electron arranca el
// servidor y esta misma ventana pasa a la vista de React #/bienvenida (herramientas, agente, integraciones).
// Sin dependencias: window.glim es el puente de preload.cjs.
const app = document.getElementById("app");
const puente = window.glim;

const PASOS = [["cerebro", "Cerebro"], ["herramientas", "Herramientas"], ["agente", "Agente"], ["integraciones", "Integraciones"], ["listo", "Listo"]];
const REDES = ["X", "LinkedIn", "Threads"];
const DIAS = ["L", "M", "X", "J", "V", "S", "D"];
const DIAS_LARGO = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

const ICONOS = {
  marca: '<path fill="currentColor" d="M20.4375 9.75C20.4375 15.6525 15.6525 20.4375 9.75 20.4375V27.5625H20.4375V38.25H27.5625C27.5625 32.3475 32.3475 27.5625 38.25 27.5625V20.4375H27.5625V9.75H20.4375Z"/>',
  carpeta: '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
  github: '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/>',
  nueva: '<path d="M12 10v6"/><path d="M9 13h6"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  candado: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  atras: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
};

// h("div", { class: "x", onclick }, hijo, "texto"): crea elementos sin innerHTML (los nombres de repo no se interpretan).
function h(tag, attrs, ...hijos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "value") el.value = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of hijos.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
function icono(nombre, vb = "0 0 24 24") {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", vb);
  s.setAttribute("aria-hidden", "true");
  if (nombre !== "marca") { s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "2"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round"); }
  s.innerHTML = ICONOS[nombre];
  return s;
}
const corta = (dir) => dir.replace(/^\/Users\/[^/]+/, "~");
const valido = (s) => /^[\w.-]+\/[\w.-]+$/.test(s || "");

const st = {
  paso: "inicio",
  info: null,        // { usuario, zona, idioma, zonas, gh: { instalado, sesion, cuenta } }
  modo: null,        // "carpeta" | "github" | "nueva"
  elegido: null,     // lo que devuelve describir(dir) en cerebro-nuevo.mjs
  repos: null,       // { repos } | { error } | { cargando }
  repo: "",          // usuario/nombre elegido o escrito
  ocupado: false,
  error: "",
  datos: { nombre: "", persona: "", autor: { nombre: "", usuario: "" }, idioma: "es", zonaHoraria: "", redes: ["X", "LinkedIn"], cadencia: { X: [1, 1, 1, 1, 1, 0, 0], LinkedIn: [0, 1, 0, 1, 0, 0, 0], Threads: [1, 1, 1, 1, 1, 0, 0] } },
};

function ir(paso) { st.paso = paso; st.error = ""; pintar(); }

function rail(actual) {
  const i = PASOS.findIndex(([id]) => id === actual);
  return h("ol", { class: "onb-rail", "aria-label": "Progreso" },
    PASOS.map(([, label], n) => h("li", { "data-estado": n < i ? "hecho" : null, "aria-current": n === i ? "step" : null }, h("span", { class: "punto", "aria-hidden": "true" }), h("span", {}, label))));
}

function marco({ paso, cuerpo, pie, conRail = true }) {
  app.replaceChildren(
    h("header", { class: "onb-top" }, conRail ? rail(paso) : null),
    h("main", { class: "onb-cuerpo" }, cuerpo),
    pie ? h("footer", { class: "onb-pie" }, pie) : h("div"),
  );
}

const error = () => h("p", { class: "onb-error", role: "alert" }, st.error);

async function accion(fn) {
  st.ocupado = true; st.error = ""; pintar();
  let r = null;
  try { r = await fn(); if (r && r.error) st.error = r.error; }
  catch (e) { st.error = String((e && e.message) || e); }
  st.ocupado = false; pintar();
  return r;
}

// ---- Pasos ----

function inicio() {
  const empezar = h("button", { class: "onb-btn primario grande", type: "button", onclick: () => ir("cerebro") }, "Empezar");
  marco({
    conRail: false,
    cuerpo: h("section", { class: "onb-paso centro" },
      h("div", { class: "onb-marca" }, icono("marca", "8.25 8.25 31.5 31.5")),
      h("h1", { class: "onb-titulo" }, "Te damos la bienvenida a Glim"),
      h("p", { class: "onb-sub" }, "Escribe, programa y revisa tus posts con agentes de IA, sobre un repo tuyo. En unos minutos lo dejamos todo listo."),
      empezar),
  });
  requestAnimationFrame(() => empezar.focus());
}

function opcion({ id, icon, titulo, detalle, onclick }) {
  return h("button", { class: "onb-opcion", type: "button", "aria-pressed": String(st.modo === id), disabled: st.ocupado, onclick },
    h("span", { class: "onb-icono" }, icono(icon)),
    h("span", {}, h("strong", {}, titulo), h("span", { class: "detalle" }, detalle)),
    h("span", { class: "lado" }));
}

async function elegirCarpeta(modo) {
  st.modo = modo; st.elegido = null;
  const r = await accion(() => (modo === "nueva" ? puente.crear() : puente.elegir()));
  if (r && r.dir) { st.elegido = r; pintar(); }
}

async function abrirGithub() {
  st.modo = "github"; st.elegido = null; pintar();
  if (!st.repos && st.info && st.info.gh.sesion) {
    st.repos = { cargando: true }; pintar();
    st.repos = await puente.repos().catch((e) => ({ error: String(e.message || e) }));
    pintar();
  }
}

let actualizarPie = () => {};

async function clonar() {
  const r = await accion(() => puente.clonar(st.repo));
  if (r && r.dir) { st.elegido = r; pintar(); }
}

function panelGithub() {
  const gh = st.info ? st.info.gh : { instalado: false, sesion: false };
  const lista = h("div", { class: "lista", role: "list" });
  const pintarLista = (filtro) => {
    const repos = (st.repos && st.repos.repos) || [];
    const f = filtro.toLowerCase();
    lista.replaceChildren(...repos.filter((r) => !f || r.slug.toLowerCase().includes(f) || (r.descripcion || "").toLowerCase().includes(f)).slice(0, 60).map((r) =>
      h("button", { class: "onb-repo", type: "button", role: "listitem", "aria-pressed": String(st.repo === r.slug), onclick: () => { st.repo = r.slug; pintar(); } },
        h("span", { style: "min-width:0" }, h("strong", {}, r.slug), r.descripcion ? h("span", { class: "detalle" }, r.descripcion) : null),
        h("span", { class: "lado" }, r.privado ? icono("candado") : null))));
  };
  const entrada = h("input", { type: "text", placeholder: gh.sesion ? "Busca o escribe usuario/repo" : "usuario/repo", value: st.repo, spellcheck: "false", autocomplete: "off", "aria-label": "Repo de GitHub",
    oninput: (e) => { st.repo = e.target.value.trim(); pintarLista(e.target.value); actualizarPie(); },
    onkeydown: (e) => { if (e.key === "Enter" && valido(st.repo)) clonar(); } });
  let nota;
  if (st.repos && st.repos.cargando) nota = h("p", { class: "onb-nota" }, h("span", { class: "onb-cargando", "aria-hidden": "true" }), " Leyendo tus repos…");
  else if (st.repos && st.repos.error) nota = h("p", { class: "onb-nota" }, `No he podido leer tus repos (${st.repos.error}). Escribe el nombre a mano.`);
  else if (!gh.instalado) nota = h("p", { class: "onb-nota" }, "Sin GitHub CLI se clona por HTTPS y solo repos públicos. Para ver y clonar los tuyos: ", h("code", {}, "brew install gh"), ".");
  else if (!gh.sesion) nota = h("p", { class: "onb-nota" }, "Para ver tus repos y clonar los privados, inicia sesión en la terminal con ", h("code", {}, "gh auth login"), ".");
  else nota = h("p", { class: "onb-nota" }, `Sesión de GitHub: ${gh.cuenta}.`);
  if (st.repos && st.repos.repos) pintarLista(st.repo);
  return h("div", { class: "onb-repos" }, entrada, st.repos && st.repos.repos ? lista : null, nota);
}

function seleccion() {
  const e = st.elegido;
  if (!e) return null;
  return h("ul", { class: "onb-lista", style: "margin-top:14px" },
    h("li", { class: "onb-fila" },
      h("span", { style: "min-width:0" }, h("strong", {}, e.nombre), h("span", { class: "detalle" }, corta(e.dir))),
      h("span", { class: `onb-estado ${e.esCerebro ? "ok" : ""}` }, e.esCerebro ? "Ya es un cerebro" : e.vacia ? "Carpeta vacía" : "Se convertirá en cerebro")));
}

function cerebro() {
  const continuar = h("button", { class: "onb-btn primario", type: "button" });
  actualizarPie = () => {
    const clonando = st.modo === "github" && !st.elegido;
    continuar.replaceChildren(st.ocupado ? h("span", { class: "onb-cargando", "aria-label": "Trabajando" }) : clonando ? "Clonar…" : "Continuar");
    continuar.disabled = st.ocupado || (clonando ? !valido(st.repo) : !st.elegido);
  };
  continuar.addEventListener("click", () => {
    if (st.modo === "github" && !st.elegido) return clonar();
    if (st.elegido.esCerebro) return abrir();
    prepararDatos();
    return ir("identidad");
  });
  actualizarPie();
  marco({
    paso: "cerebro",
    cuerpo: h("section", { class: "onb-paso" },
      h("h1", { class: "onb-titulo" }, "¿Dónde vive tu cerebro?"),
      h("p", { class: "onb-sub" }, "Un cerebro es un repo con tus borradores, tus reglas y tus referencias. Glim lo lee y los agentes trabajan en él, así que todo queda versionado en git."),
      h("div", { class: "onb-opciones", role: "group", "aria-label": "Origen del cerebro" },
        opcion({ id: "carpeta", icon: "carpeta", titulo: "Una carpeta de este Mac", detalle: "Un repo que ya tienes clonado. Si aún no es un cerebro, lo convertimos.", onclick: () => elegirCarpeta("carpeta") }),
        opcion({ id: "github", icon: "github", titulo: "Un repo de GitHub", detalle: "Lo clonamos donde digas.", onclick: abrirGithub }),
        st.modo === "github" ? panelGithub() : null,
        opcion({ id: "nueva", icon: "nueva", titulo: "Empezar de cero", detalle: "Una carpeta nueva con lo mínimo para arrancar.", onclick: () => elegirCarpeta("nueva") })),
      seleccion(),
      error()),
    pie: [h("button", { class: "onb-btn texto", type: "button", onclick: () => ir("inicio") }, icono("atras"), "Atrás"), h("div", { class: "derecha" }, continuar)],
  });
}

function prepararDatos() {
  const d = st.datos;
  const e = st.elegido;
  if (d._de !== e.dir) d.nombre = e.nombre;
  d._de = e.dir;
  if (st.info) {
    if (!d.persona) d.persona = (st.info.usuario || "").split(" ")[0];
    if (!d.autor.nombre) d.autor.nombre = st.info.usuario || "";
    if (!d.zonaHoraria) d.zonaHoraria = st.info.zona;
    if (!d._idioma) { d.idioma = st.info.idioma; d._idioma = true; }
  }
}

function campo(label, input, { ancho = false, ayuda = null } = {}) {
  return h("label", { class: `onb-campo ${ancho ? "ancho" : ""}` }, h("span", {}, label), input, ayuda ? h("small", {}, ayuda) : null);
}
function texto(valor, onchange, extra = {}) {
  return h("input", { type: "text", value: valor || "", spellcheck: "false", autocomplete: "off", oninput: (e) => onchange(e.target.value), ...extra });
}

function identidad() {
  const d = st.datos;
  const e = st.elegido;
  const zonas = (st.info && st.info.zonas && st.info.zonas.length) ? st.info.zonas : [d.zonaHoraria || "UTC"];
  const zona = h("select", { onchange: (ev) => { d.zonaHoraria = ev.target.value; } }, zonas.map((z) => h("option", { value: z, selected: z === d.zonaHoraria }, z.replace(/_/g, " "))));
  const idioma = h("div", { class: "onb-seg", role: "group", "aria-label": "Idioma de los agentes" },
    [["es", "Español"], ["en", "English"]].map(([id, l]) => h("button", { type: "button", "aria-pressed": String(d.idioma === id), onclick: () => { d.idioma = id; pintar(); } }, l)));
  const redes = h("div", { class: "onb-redes" }, REDES.map((r) => {
    const activa = d.redes.includes(r);
    const dias = d.cadencia[r];
    return h("div", { class: "onb-red" },
      h("label", {}, h("input", { type: "checkbox", checked: activa, onchange: (ev) => { d.redes = ev.target.checked ? [...d.redes, r] : d.redes.filter((x) => x !== r); pintar(); } }), r),
      h("div", { class: "onb-dias", role: "group", "aria-label": `Días de ${r}` }, DIAS.map((dl, i) =>
        h("button", { type: "button", disabled: !activa, "aria-pressed": String(activa && dias[i] > 0), "aria-label": `${r}, ${DIAS_LARGO[i]}`, title: DIAS_LARGO[i], onclick: () => { dias[i] = dias[i] ? 0 : 1; pintar(); } }, dl))));
  }));
  const crear = h("button", { class: "onb-btn primario", type: "submit", form: "identidad", disabled: st.ocupado || !d.nombre.trim() },
    st.ocupado ? h("span", { class: "onb-cargando", "aria-label": "Trabajando" }) : e.vacia ? "Crear cerebro" : "Convertir en cerebro");
  const form = h("form", { id: "identidad", onsubmit: (ev) => { ev.preventDefault(); preparar(); } },
    h("div", { class: "onb-campos" },
      campo("Nombre del cerebro", texto(d.nombre, (v) => { d.nombre = v; crear.disabled = !v.trim(); }, { required: true, maxlength: "60" }), { ayuda: "Sale en la barra lateral y en los commits." }),
      campo("Cómo te llaman los agentes", texto(d.persona, (v) => { d.persona = v; }, { maxlength: "40", placeholder: "Ana" }), { ayuda: "«Ana ha pedido…»" }),
      campo("Tu nombre en las vistas previas", texto(d.autor.nombre, (v) => { d.autor.nombre = v; }, { maxlength: "60", placeholder: "Ana Pérez" })),
      campo("Tu usuario en las redes", texto(d.autor.usuario, (v) => { d.autor.usuario = v; }, { maxlength: "40", placeholder: "@anaperez" })),
      h("div", { class: "onb-campo" }, h("span", { class: "onb-etiqueta" }, "Idioma de los agentes y los commits"), idioma),
      campo("Zona horaria", zona),
      h("div", { class: "onb-campo ancho" }, h("span", { class: "onb-etiqueta" }, "Dónde publicas y qué días"), redes)),
    h("p", { class: "onb-nota" },
      `Se crea en ${corta(e.dir)}: ${e.crear.join(", ")}. `,
      e.reglas ? `Los agentes seguirán usando tu ${e.reglas}. ` : "",
      "Todo queda en glim.config.json y lo puedes cambiar cuando quieras."),
    error());
  marco({
    paso: "cerebro",
    cuerpo: h("section", { class: "onb-paso" },
      h("h1", { class: "onb-titulo" }, e.vacia ? "Cuéntale a Glim quién eres" : `Convertimos «${e.nombre}» en un cerebro`),
      h("p", { class: "onb-sub" }, "Con esto los agentes saben cómo llamarte, en qué idioma escribir y cuándo sueles publicar."),
      form),
    pie: [h("button", { class: "onb-btn texto", type: "button", onclick: () => ir("cerebro") }, icono("atras"), "Atrás"), h("div", { class: "derecha" }, crear)],
  });
}

async function preparar() {
  const d = st.datos;
  const datos = { nombre: d.nombre, persona: d.persona, autor: d.autor, idioma: d.idioma, zonaHoraria: d.zonaHoraria, redes: d.redes, cadencia: d.cadencia };
  st.paso = "arrancando";
  const r = await accion(() => puente.preparar(st.elegido.dir, datos));
  if (!r || r.error) { st.paso = "identidad"; pintar(); } // el error se queda a la vista
}

async function abrir() {
  st.paso = "arrancando";
  const r = await accion(() => puente.abrir(st.elegido.dir));
  if (!r || r.error) { st.paso = "cerebro"; pintar(); }
}

function arrancando() {
  marco({
    paso: "herramientas",
    cuerpo: h("section", { class: "onb-paso centro" },
      h("span", { class: "onb-cargando", "aria-hidden": "true", style: "width:22px;height:22px;margin-bottom:18px" }),
      h("h1", { class: "onb-titulo", role: "status" }, `Preparando ${st.elegido ? st.elegido.nombre : "tu cerebro"}…`),
      h("p", { class: "onb-sub" }, "Arrancamos el servidor local y leemos el repo. Solo tarda unos segundos.")),
  });
}

function pintar() {
  ({ inicio, cerebro, identidad, arrancando })[st.paso]();
}

pintar();
// gh tarda en responder: si ya se ha elegido GitHub cuando llega, se piden los repos entonces.
puente.inicio().then((info) => {
  st.info = info;
  if (st.modo === "github" && !st.repos && info.gh.sesion) abrirGithub();
  else if (st.paso !== "inicio") pintar();
}).catch(() => {});
