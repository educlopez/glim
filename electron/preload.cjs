// Puente mínimo entre la interfaz y la app: reabrir tras reinstalar, aplicar los ajustes (tema, desenfoque, atajo) y
// abrir la ventana de Ajustes. Nada más: la interfaz no tiene acceso a Node ni a Electron.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("panelApp", {
  relanzar: () => ipcRenderer.invoke("relanzar"),
  tema: (t) => ipcRenderer.invoke("tema", t),
  ajustes: (a) => ipcRenderer.invoke("ajustes", a),
  abrirAjustes: (s) => ipcRenderer.invoke("abrirAjustes", s),
  cambiarCerebro: () => ipcRenderer.invoke("cambiarCerebro"),
  mostrarCerebro: () => ipcRenderer.invoke("mostrarCerebro"),
  registros: () => ipcRenderer.invoke("registros"),
  // Fin de la bienvenida: la ventana pasa a ser la de la app. Devuelve { transformada } (false si ya era la app).
  terminarBienvenida: () => ipcRenderer.invoke("glim:terminar"),
  // Lleva la ventana principal a una ruta (#/bienvenida desde la ventana de Ajustes, por ejemplo).
  ir: (hash) => ipcRenderer.invoke("ir", hash),
});
// Primera parte de la bienvenida (electron/bienvenida.html): elegir, clonar o crear el cerebro. Los manejadores solo
// existen mientras esa página está abierta.
contextBridge.exposeInMainWorld("glim", {
  inicio: () => ipcRenderer.invoke("glim:inicio"),
  elegir: () => ipcRenderer.invoke("glim:elegir"),
  crear: () => ipcRenderer.invoke("glim:crear"),
  repos: () => ipcRenderer.invoke("glim:repos"),
  clonar: (slug) => ipcRenderer.invoke("glim:clonar", slug),
  preparar: (dir, datos) => ipcRenderer.invoke("glim:preparar", dir, datos),
  abrir: (dir) => ipcRenderer.invoke("glim:abrir", dir),
});
