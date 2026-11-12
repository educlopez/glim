// Puente de la ventana de bienvenida: elegir, clonar o crear un cerebro.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("glim", {
  elegir: () => ipcRenderer.invoke("glim:elegir"),
  clonar: (slug) => ipcRenderer.invoke("glim:clonar", slug),
  crear: () => ipcRenderer.invoke("glim:crear"),
});
