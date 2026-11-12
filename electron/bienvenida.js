const error = document.getElementById("error");
const botones = [...document.querySelectorAll("button")];
async function hacer(fn) {
  error.textContent = "";
  botones.forEach((b) => { b.disabled = true; });
  try { const r = await fn(); if (r && r.error) error.textContent = r.error; }
  finally { botones.forEach((b) => { b.disabled = false; }); }
}
document.getElementById("elegir").addEventListener("click", () => hacer(() => window.glim.elegir()));
document.getElementById("crear").addEventListener("click", () => hacer(() => window.glim.crear()));
const slug = document.getElementById("slug");
const clonar = () => hacer(() => window.glim.clonar(slug.value.trim()));
document.getElementById("clonar").addEventListener("click", clonar);
slug.addEventListener("keydown", (e) => { if (e.key === "Enter") clonar(); });
