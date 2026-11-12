// Puente de la ventana de bienvenida: elegir, clonar o crear un cerebro.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("moss", {
  elegir: () => ipcRenderer.invoke("moss:elegir"),
  clonar: (slug) => ipcRenderer.invoke("moss:clonar", slug),
  crear: () => ipcRenderer.invoke("moss:crear"),
});
