const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('quelle', {
  liste: () => ipcRenderer.invoke('quellen:liste'),
  waehle: (antwort) => ipcRenderer.send('quellen:wahl', antwort),
});
