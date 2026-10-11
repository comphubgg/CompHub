// Was die Webseite im Programm sehen darf: nur zu wissen, dass sie im Programm laeuft, und dem Programm
// zu sagen, ob gerade uebertragen wird (fuer das Symbol im Infobereich).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('comphubApp', {
  app: true,
  live: (an) => ipcRenderer.send('pov:live', Boolean(an)),
});
