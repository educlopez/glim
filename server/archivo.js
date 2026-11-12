// Copia guardada de una página web (idea del archivo WARC de Pond, con lo que ya trae Chromium): la página tal como
// estaba ese día, aunque luego cambie o desaparezca. Por cada copia, en media/referencias/archivo/<id>/<fecha>/:
//   pagina.mhtml  la página completa en un solo archivo (se abre en el panel sin JavaScript)
//   captura.jpg   captura de la página entera (hasta 16 000 px de alto) a 1440 px de ancho
//   portada.jpg   lo que se ve al entrar, para la miniatura
//   texto.txt     el texto visible, para buscar
// Todo local (media/ no se versiona). Usa la sesión de los lectores, así que guarda también lo que ves con sesión.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT, hoyLocal } from "./repo.js";
import { rutas } from "./cerebro.js";
import * as nav from "./navegador.js";

export const ARCHIVO = `${rutas.mediaReferencias}/archivo`;
const ANCHO = 1440;
const MAX_ALTO = 16000;

// Baja poco a poco hasta el final para que carguen las imágenes perezosas y vuelve arriba.
const RECORRER = `new Promise((ok) => {
  let y = 0; const paso = innerHeight * 0.8; const fin = Date.now() + 12000;
  const t = setInterval(() => {
    y += paso; scrollTo(0, y);
    if (y >= document.documentElement.scrollHeight - innerHeight || Date.now() > fin) { clearInterval(t); scrollTo(0, 0); setTimeout(ok, 900); }
  }, 250);
})`;

export async function guardar(id, url) {
  if (!(await nav.disponible())) throw new Error("Guardar copias solo funciona desde la app de Mac");
  if (!/^https?:\/\//i.test(url || "")) throw new Error("Esta referencia no tiene enlace");
  const fecha = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const rel = `${ARCHIVO}/${id}/${fecha}`;
  const dir = path.join(ROOT, rel);
  fs.mkdirSync(dir, { recursive: true });
  try {
    const info = await nav.conVentana(url, async (w) => {
      const wc = w.webContents;
      await wc.executeJavaScript(RECORRER, true).catch(() => {});
      const portada = await wc.capturePage();
      fs.writeFileSync(path.join(dir, "portada.jpg"), portada.resize({ width: 1200 }).toJPEG(80));
      const texto = await wc.executeJavaScript("document.body ? document.body.innerText : ''", true).catch(() => "");
      fs.writeFileSync(path.join(dir, "texto.txt"), String(texto).slice(0, 400000));
      const titulo = wc.getTitle();
      let alto = 0;
      try {
        wc.debugger.attach("1.3");
        const m = await wc.debugger.sendCommand("Page.getLayoutMetrics");
        const size = m.cssContentSize || m.contentSize;
        alto = Math.min(MAX_ALTO, Math.ceil(size.height));
        const shot = await wc.debugger.sendCommand("Page.captureScreenshot", { format: "jpeg", quality: 76, captureBeyondViewport: true, clip: { x: 0, y: 0, width: ANCHO, height: alto, scale: 1 } });
        fs.writeFileSync(path.join(dir, "captura.jpg"), Buffer.from(shot.data, "base64"));
        // En pantallas Retina sale a 2×: se reduce a 1440 px de ancho para que pese la mitad.
        execFileSync("sips", ["--resampleWidth", String(ANCHO), path.join(dir, "captura.jpg")], { stdio: "ignore", timeout: 60000 });
      } catch (e) { console.warn("[panel] captura completa:", e.message); } finally { try { wc.debugger.detach(); } catch {} }
      await wc.savePage(path.join(dir, "pagina.mhtml"), "MHTML");
      return { titulo, alto, extracto: String(texto).replace(/\s+/g, " ").trim().slice(0, 600) };
    }, { ancho: ANCHO, alto: 900, espera: 3000 });
    const pesa = fs.readdirSync(dir).reduce((s, f) => s + fs.statSync(path.join(dir, f)).size, 0);
    return { carpeta: rel, fecha: hoyLocal(), cuando: new Date().toISOString(), titulo: info.titulo, alto: info.alto, extracto: info.extracto, bytes: pesa,
      portada: `${rel}/portada.jpg`, captura: fs.existsSync(path.join(dir, "captura.jpg")) ? `${rel}/captura.jpg` : null, mhtml: `${rel}/pagina.mhtml` };
  } catch (e) { fs.rmSync(dir, { recursive: true, force: true }); throw e; }
}

export async function abrir(rel, titulo) {
  const n = path.posix.normalize(String(rel || ""));
  if (!n.startsWith(`${ARCHIVO}/`) || !n.endsWith(".mhtml") || n.includes("..")) throw new Error("Ruta no válida");
  return nav.abrirCopia(path.join(ROOT, n), titulo);
}
