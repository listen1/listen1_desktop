const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  ipcRenderer: ipcRenderer,
  send: (channel, data) => {
    ipcRenderer.send(channel, data);
  },
  onLyric: (fn) => {
    // Deliberately strip event as it includes `sender`
    ipcRenderer.on("currentLyric", (event, ...args) => fn(...args));
  },
  onTranslLyric: (fn) => {
    // Deliberately strip event as it includes `sender`
    ipcRenderer.on("currentLyricTrans", (event, ...args) => fn(...args));
  },
});
