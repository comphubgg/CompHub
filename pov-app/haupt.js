// CompHub POV - das Dashboard der Profis als eigenes Programm.
//
// Der Betreiber (11.10.2026): die POV-Seite soll sich als Programm herunterladen lassen. Der Profi meldet sich
// einmal an (das merkt sich das Programm), sieht danach nur sein Dashboard - keine Statistik, keine anderen
// Seiten -, geht dort live oder nicht live, und kann das Fenster einfach weglegen: es laeuft im Infobereich
// weiter, die Bildschirmuebertragung ebenfalls.
//
// Das Programm ist ein Fenster auf die Webseite (/pov); alles Eigentliche - Teilen, Freigabe, Qualitaet -
// macht die Seite selbst. Hier liegt nur, was ein Browser nicht kann:
//   - Anmeldung dauerhaft behalten (eigener, bleibender Speicher)
//   - die Seite auf das Dashboard beschraenken
//   - die Auswahl, was geteilt wird, und der Systemton (Windows: "loopback")
//   - im Infobereich weiterlaufen, auch wenn das Fenster zu ist, ohne gedrosselt zu werden
//
// Im Programm steckt kein Schluessel und keine Zugangsdaten: wer es hat, kommt ohne Anmeldung nicht weiter.

const { app, BrowserWindow, Tray, Menu, shell, session, desktopCapturer, ipcMain, nativeImage, dialog, powerSaveBlocker, globalShortcut } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

const SEITE = (process.env.COMPHUB_URL || 'https://www.thecomphub.com').replace(/\/+$/, '');
const PARTITION = 'persist:comphub-pov';
const VERSION = app.getVersion();

/** Auf der eigenen Seite sind nur diese Pfade erreichbar - das Dashboard und was zur Anmeldung gehoert. */
const ERLAUBT = [/^\/pov(\/|$)/, /^\/sign-in/, /^\/login/, /^\/register/, /^\/vip/, /^\/api\//, /^\/pov-ansicht/];
/** Fremde Seiten, die zur Anmeldung ueber Discord, Twitch oder Google gehoeren. */
const ANMELDEDIENSTE = [/(^|\.)discord\.com$/, /(^|\.)twitch\.tv$/, /(^|\.)google\.com$/, /(^|\.)gstatic\.com$/, /(^|\.)googleusercontent\.com$/];

let fenster = null;
let ablage = null;
let live = false;
let wirklichBeenden = false;
let schlaf = null;
/** Das naechste Teilen ohne Auswahlfenster (die Seite startet von selbst, weil der Profi auf Discord live ging). */
let autoQuelle = false;
/** Die Fassung, die schon geladen ist und beim naechsten Moment ohne Uebertragung installiert wird. */
let updateBereit = null;
/** Das Mikrofon: ob es mitgesendet wird und ob es stumm ist (die Seite meldet es). */
let mikroDa = false;
let mikroStumm = false;
const MIKRO_TASTE = 'CommandOrControl+Alt+M';
const mikroUmschalten = () => { if (mikroDa && fenster && !fenster.isDestroyed()) fenster.webContents.send('pov:mikro-umschalten'); };

const sperre = app.requestSingleInstanceLock();
if (!sperre) { app.quit(); }
app.on('second-instance', () => zeigeFenster());

function zeigeFenster() {
  if (!fenster) return;
  if (fenster.isMinimized()) fenster.restore();
  fenster.show();
  fenster.focus();
}

/** Der Browser-Kennung ein "CompHubPOV" anhaengen und "Electron" wegnehmen (Google lehnt die Anmeldung sonst ab). */
function kennung() {
  const roh = session.defaultSession.getUserAgent()
    .replace(/\s?Electron\/\S+/, '')
    .replace(/\s?comphub-pov\/\S+/i, '');
  return `${roh} CompHubPOV/${VERSION}`;
}

function istErlaubt(adresse) {
  let u;
  try { u = new URL(adresse); } catch { return false; }
  if (u.origin === SEITE || u.hostname === new URL(SEITE).hostname) return ERLAUBT.some((r) => r.test(u.pathname));
  return u.protocol === 'https:' && ANMELDEDIENSTE.some((r) => r.test(u.hostname));
}

/* ------------------------------------------------------------------ Quellenwahl */

/** Ein kleines Fenster, in dem der Profi waehlt, was geteilt wird. Gibt { quelle, ton } zurueck oder null. */
function waehleQuelle(quellen) {
  return new Promise((fertig) => {
    const wahl = new BrowserWindow({
      width: 780, height: 560, parent: fenster ?? undefined, modal: Boolean(fenster), show: false,
      title: 'Was möchtest du teilen?', backgroundColor: '#09090b', autoHideMenuBar: true, minimizable: false,
      webPreferences: { preload: path.join(__dirname, 'quelle-vorladen.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    let erledigt = false;
    const abschluss = (wert) => { if (erledigt) return; erledigt = true; ipcMain.removeHandler('quellen:liste'); ipcMain.removeAllListeners('quellen:wahl'); fertig(wert); if (!wahl.isDestroyed()) wahl.close(); };
    ipcMain.handle('quellen:liste', () => quellen.map((q) => ({
      id: q.id, name: q.name, schirm: q.id.startsWith('screen'), bild: q.thumbnail.toDataURL(),
    })));
    ipcMain.on('quellen:wahl', (_e, antwort) => {
      if (!antwort) return abschluss(null);
      const q = quellen.find((x) => x.id === antwort.id);
      abschluss(q ? { quelle: q, ton: antwort.ton !== false } : null);
    });
    wahl.on('closed', () => abschluss(null));
    wahl.once('ready-to-show', () => wahl.show());
    void wahl.loadFile(path.join(__dirname, 'quelle.html'));
  });
}

function richteTeilenEin(sitzung) {
  sitzung.setDisplayMediaRequestHandler(async (_anfrage, antwort) => {
    try {
      const quellen = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 360, height: 200 } });
      // Von selbst gestartet: der Hauptbildschirm mit Systemton, ohne zu fragen - der Profi ist gerade im Spiel.
      if (autoQuelle) {
        autoQuelle = false;
        const schirm = quellen.find((q) => q.id.startsWith('screen'));
        if (schirm) { antwort({ video: schirm, audio: 'loopback' }); return; }
      }
      const gewaehlt = await waehleQuelle(quellen);
      if (!gewaehlt) { antwort({}); return; }
      // "loopback": der ganze Systemton (Windows). Ohne Haken kommt nur das Bild.
      antwort({ video: gewaehlt.quelle, ...(gewaehlt.ton ? { audio: 'loopback' } : {}) });
    } catch (e) {
      console.error('Bildschirmauswahl:', e);
      try { antwort({}); } catch { /* die Anfrage ist schon beantwortet */ }
    }
  }, { useSystemPicker: false });
}

/* ------------------------------------------------------------------ Fenster */

function baueFenster(versteckt) {
  const sitzung = session.fromPartition(PARTITION);
  sitzung.setUserAgent(kennung());
  richteTeilenEin(sitzung);

  fenster = new BrowserWindow({
    width: 1180, height: 800, minWidth: 760, minHeight: 560, show: !versteckt,
    title: 'CompHub POV', backgroundColor: '#09090b', autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      partition: PARTITION, preload: path.join(__dirname, 'vorladen.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      // Das Fenster darf versteckt sein, die Uebertragung laeuft trotzdem mit voller Geschwindigkeit weiter.
      backgroundThrottling: false,
    },
  });
  fenster.setMenuBarVisibility(false);

  // Nur das Dashboard: Kopfzeile und Fusszeile der Webseite weg.
  const verstecken = `
    header, footer, [data-hauptkopf], [data-fusszeile] { display: none !important; }
    body { padding-top: 0 !important; }
  `;
  fenster.webContents.on('did-finish-load', () => { void fenster.webContents.insertCSS(verstecken); });
  fenster.webContents.on('dom-ready', () => { void fenster.webContents.insertCSS(verstecken); });

  fenster.webContents.on('will-navigate', (e, adresse) => {
    if (istErlaubt(adresse)) return;
    e.preventDefault();
    let u; try { u = new URL(adresse); } catch { return; }
    if (u.hostname === new URL(SEITE).hostname) void fenster.loadURL(`${SEITE}/pov`);
    else if (u.protocol === 'https:') void shell.openExternal(adresse);
  });
  fenster.webContents.setWindowOpenHandler(({ url }) => {
    if (istErlaubt(url)) { void fenster.loadURL(url); return { action: 'deny' }; }
    if (/^https:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  // Kein Zugriff auf Kamera und Mikrofon; der Bildschirm laeuft ueber den Handler oben.
  sitzung.setPermissionRequestHandler((_wc, erlaubnis, antwort) => antwort(erlaubnis === 'media' || erlaubnis === 'display-capture' || erlaubnis === 'fullscreen'));

  // Schliessen legt das Fenster nur weg: das Programm laeuft im Infobereich weiter.
  fenster.on('close', (e) => {
    if (wirklichBeenden) return;
    e.preventDefault();
    fenster.hide();
    if (ablage && live) ablage.displayBalloon?.({ title: 'CompHub POV läuft weiter', content: 'Deine Übertragung läuft im Hintergrund. Beenden über das Symbol im Infobereich.' });
  });

  void fenster.loadURL(`${SEITE}/pov`);
}

/* ------------------------------------------------------------------ Infobereich */

function baueAblage() {
  const symbol = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png')).resize({ width: 20, height: 20 });
  ablage = new Tray(symbol);
  ablage.on('click', zeigeFenster);
  aktualisiereAblage();
}

function aktualisiereAblage() {
  if (!ablage) return;
  ablage.setToolTip(live ? 'CompHub POV – du bist live' : 'CompHub POV');
  ablage.setContextMenu(Menu.buildFromTemplate([
    { label: live ? '● Du bist live' : 'Nicht live', enabled: false },
    { type: 'separator' },
    { label: 'CompHub POV öffnen', click: zeigeFenster },
    { label: mikroDa ? (mikroStumm ? 'Mikrofon ist stumm – einschalten (Strg+Alt+M)' : 'Mikrofon ist an – stumm schalten (Strg+Alt+M)') : 'Mikrofon: wird nicht gesendet', enabled: mikroDa, click: mikroUmschalten },
    {
      label: 'Mit Windows starten', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin,
      click: (m) => app.setLoginItemSettings({ openAtLogin: m.checked, args: ['--versteckt'] }),
    },
    { label: updateBereit ? `Update ${updateBereit} wird installiert, sobald du nicht live bist` : `Version ${VERSION}`, enabled: false },
    { label: 'Nach Updates suchen', click: () => { void nachUpdatesSuchen(true); } },
    { type: 'separator' },
    {
      label: 'Beenden', click: () => {
        if (live && dialog.showMessageBoxSync({ type: 'question', buttons: ['Beenden', 'Abbrechen'], defaultId: 1, cancelId: 1,
          message: 'Du bist gerade live.', detail: 'Beim Beenden endet deine Übertragung.' }) === 1) return;
        wirklichBeenden = true; app.quit();
      },
    },
  ]));
}

/* ------------------------------------------------------------------ Seite meldet ihren Zustand */

ipcMain.on('pov:auto', (_e, an) => {
  autoQuelle = Boolean(an);
  // Nur fuer diesen einen Start: bleibt es liegen, soll das naechste Mal von Hand wieder gefragt werden.
  if (autoQuelle) setTimeout(() => { autoQuelle = false; }, 30_000);
});

ipcMain.on('pov:mikro-stand', (_e, da, stumm) => {
  mikroDa = Boolean(da); mikroStumm = Boolean(stumm);
  aktualisiereAblage();
});

ipcMain.on('pov:live', (_e, an) => {
  live = Boolean(an);
  // Waehrend der Uebertragung darf der Rechner nicht einschlafen.
  if (live && schlaf === null) schlaf = powerSaveBlocker.start('prevent-app-suspension');
  if (!live && schlaf !== null) { powerSaveBlocker.stop(schlaf); schlaf = null; }
  aktualisiereAblage();
  if (fenster) fenster.setTitle(live ? 'CompHub POV – live' : 'CompHub POV');
  // Ist ein Update schon geladen, kommt es nach dem Ende der Uebertragung - mit einer Minute Luft, falls es gleich weitergeht.
  if (!live && updateBereit) setTimeout(installiereUpdate, 60_000);
});

/* ------------------------------------------------------------------ Neue Version? */

/*
 * Das Programm aktualisiert sich selbst.
 *
 * Der Betreiber (12.10.2026): wenn er mit Claude ein Update macht, soll niemand das Programm neu laden oder
 * hochladen muessen. Deshalb fragt es beim Start und danach alle paar Stunden bei CompHub nach (latest.yml, siehe
 * /api/pov/update), laedt eine neuere Fassung im Hintergrund und installiert sie, sobald keine Uebertragung laeuft -
 * mitten im Live-Gehen wird nie neu gestartet. Beim Beenden wird ein geladenes Update ohnehin installiert.
 */

function installiereUpdate() {
  if (!updateBereit || live) return;
  wirklichBeenden = true;
  // Still, und danach wieder starten - der Profi muss nichts anklicken.
  autoUpdater.quitAndInstall(true, true);
}

async function nachUpdatesSuchen(vomNutzer = false) {
  if (!app.isPackaged) return;
  try {
    const r = await autoUpdater.checkForUpdates();
    if (vomNutzer && fenster && !(r?.updateInfo && r.updateInfo.version !== VERSION)) {
      dialog.showMessageBox(fenster, { type: 'info', message: 'Du hast die neueste Version.', detail: `CompHub POV ${VERSION}` });
    }
  } catch { /* offline - beim naechsten Mal wieder */ }
}

function richteUpdatesEin() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', (info) => {
    updateBereit = info.version;
    aktualisiereAblage();
    if (!live) installiereUpdate();
    else if (ablage) ablage.displayBalloon?.({ title: `Update ${info.version} ist geladen`, content: 'Es wird installiert, sobald deine Übertragung zu Ende ist.' });
  });
  autoUpdater.on('error', (e) => { console.error('Update:', e?.message ?? e); });
  setTimeout(() => { void nachUpdatesSuchen(); }, 15_000);
  setInterval(() => { void nachUpdatesSuchen(); }, 3 * 3600_000);
}

/* ------------------------------------------------------------------ Start */

if (sperre) {
  app.whenReady().then(() => {
    const versteckt = process.argv.includes('--versteckt');
    baueFenster(versteckt);
    baueAblage();
    richteUpdatesEin();
    // Die Tastenkombination gilt auch, wenn das Spiel vorn ist (Betreiber, 19.10.2026: Mikrofon stumm schalten koennen).
    try { globalShortcut.register(MIKRO_TASTE, mikroUmschalten); } catch { /* Tastenkombination belegt */ }
  });
  app.on('will-quit', () => { try { globalShortcut.unregisterAll(); } catch { /* egal */ } });
  app.on('before-quit', () => { wirklichBeenden = true; });
  // Das Fenster ist nur weggelegt - das Programm bleibt, bis es ueber den Infobereich beendet wird.
  app.on('window-all-closed', () => { /* bleibt */ });
}
