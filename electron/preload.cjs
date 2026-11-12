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
});
