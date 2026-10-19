// Was die Webseite im Programm sehen darf: nur zu wissen, dass sie im Programm laeuft, und dem Programm
// zu sagen, ob gerade uebertragen wird (fuer das Symbol im Infobereich).
const { contextBridge, ipcRenderer } = require('electron');

// Ein einziger Hoerer, den die Seite austauscht - sonst addierten sich die Aufrufe bei jedem Neuladen der Seite und schalteten doppelt um.
let mikroAntwort = null;
ipcRenderer.on('pov:mikro-umschalten', () => { if (mikroAntwort) mikroAntwort(); });

contextBridge.exposeInMainWorld('comphubApp', {
  app: true,
  live: (an) => ipcRenderer.send('pov:live', Boolean(an)),
  // Das naechste Teilen ohne Auswahlfenster: der Hauptbildschirm mit Systemton (wenn die Seite von selbst startet).
  auto: (an) => ipcRenderer.send('pov:auto', Boolean(an)),
  // Das Mikrofon: die Seite meldet seinen Stand (fuer das Symbol im Infobereich) und bekommt die Tastenkombination gemeldet.
  mikroStand: (da, stumm) => ipcRenderer.send('pov:mikro-stand', Boolean(da), Boolean(stumm)),
  onMikro: (f) => { mikroAntwort = typeof f === 'function' ? f : null; },
});
