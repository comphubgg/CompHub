// CompHub als Fensterprogramm.
//
// Die .exe startet den Next-Server im eigenen Prozess und oeffnet ein
// Fenster darauf. Kein Browser, kein Terminal, kein "npm run" - Doppelklick
// und das Werkzeug steht da.
//
// Warum ein eigener Server und nicht nur eine Seite: CompHub ist kein
// Stapel Dateien. Siebzehn Schnittstellen schreiben, zwoelf Aufgaben laufen
// im Hintergrund, und alles Wichtige entsteht erst zur Laufzeit. Ohne Node
// dahinter waere das Fenster leer.
//
// Der Port ist bewusst berechenbar: 3000, sonst 3001, 3002 und so fort.
//
// Ein zufaellig freier Port waere bequemer, macht aber die Overlay-Adressen
// unbrauchbar - in OBS steht dort eine feste Adresse, und die darf sich
// nicht bei jedem Start aendern. Deshalb wird der gewohnte Port gesucht und
// nur ausgewichen, wenn er wirklich belegt ist.

const { app, BrowserWindow, Tray, Menu, shell, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const fs = require('fs');

/** Wo die Anwendung liegt - gepackt anders als im Quellbaum. */
const WURZEL = app.isPackaged
  ? path.join(process.resourcesPath, 'app')
  : path.join(__dirname, '..');

let server = null;
let fenster = null;
let ablage = null;   // das Symbol im Infobereich
let beendet = false; // wirklich schliessen, nicht nur wegklicken

/**
 * Ist dieser Port frei?
 *
 * Zwei Fragen, weil eine nicht reicht.
 *
 * Frueher wurde nur versucht, auf 127.0.0.1 zu horchen. Ein
 * Entwicklungsserver laeuft aber mit `-H 0.0.0.0`, und Windows laesst daneben
 * eine zweite Bindung ohne Weiteres zu - auch auf allen Schnittstellen. Die
 * Pruefung meldete "frei", das Programm nahm 3000 ein zweites Mal, und von da
 * an beantwortete mal der eine, mal der andere Server dieselbe Adresse, mit
 * verschiedenem Stand. Genau daher kam der Eindruck, die Webseite und das
 * Programm wuerden sich gegenseitig kaputtmachen.
 *
 * Deshalb wird zusaetzlich angeklopft: antwortet dort jemand, ist der Port
 * vergeben, ganz gleich was das Betriebssystem zum Horchen sagt.
 */
function antwortetJemand(port) {
  return new Promise((fertig) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    const schluss = (wert) => {
      s.removeAllListeners();
      s.destroy();
      fertig(wert);
    };
    s.setTimeout(400);
    s.once('connect', () => schluss(true));
    s.once('timeout', () => schluss(false));
    s.once('error', () => schluss(false));
  });
}

function kannHorchen(port) {
  return new Promise((fertig) => {
    const s = net.createServer();
    s.once('error', () => fertig(false));
    s.listen(port, () => s.close(() => fertig(true)));
  });
}

async function istFrei(port) {
  if (await antwortetJemand(port)) return false;
  return kannHorchen(port);
}

/**
 * Den ersten freien Port ab 3000.
 *
 * Der Reihe nach, damit die Adresse ueber Neustarts hinweg dieselbe bleibt:
 * wer in OBS "localhost:3000/overlay/..." stehen hat, soll sie nicht jedes
 * Mal neu eintragen muessen.
 */
async function findePort() {
  for (let p = 3000; p <= 3010; p += 1) {
    if (await istFrei(p)) return p;
  }
  throw new Error('Die Ports 3000 bis 3010 sind alle belegt.');
}

/** Warten, bis der Server antwortet - er braucht beim ersten Mal Zeit. */
function warteAufServer(port, sekunden = 90) {
  const bis = Date.now() + sekunden * 1000;
  return new Promise((fertig, schief) => {
    const versuch = () => {
      const s = net.connect(port, '127.0.0.1');
      s.once('connect', () => { s.destroy(); fertig(); });
      s.once('error', () => {
        s.destroy();
        if (Date.now() > bis) {
          schief(new Error('Der Server ist nicht gestartet.'));
          return;
        }
        setTimeout(versuch, 400);
      });
    };
    versuch();
  });
}

async function starteServer() {
  const port = await findePort();

  /*
   * Next wird als eigener Prozess gestartet, nicht in diesem hier. Zwei
   * Gruende: der Fensterprozess bleibt bedienbar, waehrend der Server sein
   * Archiv einliest, und ein Absturz des Servers reisst nicht das ganze
   * Programm mit.
   */
  const next = path.join(WURZEL, 'node_modules', 'next', 'dist', 'bin', 'next');
  server = spawn(process.execPath, [next, 'start', '-p', String(port)], {
    cwd: WURZEL,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      // Ohne diese Zeile haelt Electron den Kindprozess fuer sich selbst
      // und startet ein zweites Fenster statt des Servers.
      ELECTRON_RUN_AS_NODE: '1',
      NEXT_PUBLIC_BASE_URL: `http://localhost:${port}`,
    },
    stdio: 'ignore',
  });

  await warteAufServer(port);
  return port;
}

function oeffneFenster(port) {
  fenster = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1000,
    minHeight: 650,
    backgroundColor: '#09090b',
    // Die eigene Titelleiste bleibt - ein Fensterprogramm ohne sie fuehlt
    // sich unter Windows falsch an.
    autoHideMenuBar: true,
    icon: path.join(WURZEL, 'public', 'logos', 'CompHub-Logo.png'),
    webPreferences: {
      // Die Seite bekommt keinen Zugriff auf Node - sie braucht ihn nicht,
      // und ohne ist ein eingeschleustes Skript harmlos.
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  fenster.loadURL(`http://localhost:${port}`);

  // Fremde Adressen gehoeren in den richtigen Browser, nicht in dieses
  // Fenster: Twitch-Anmeldungen und X-Verweise sonst in einer Huelle ohne
  // Adresszeile, in der niemand pruefen kann, wo er gerade ist.
  fenster.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  /*
   * Die Adresse in den Fenstertitel. Wer ein Overlay in OBS einrichtet,
   * braucht sie - und sie steht sonst nirgends, weil es keine Adresszeile
   * gibt.
   */
  fenster.setTitle(`CompHub — localhost:${port}`);
  fenster.webContents.on('page-title-updated', (e) => {
    e.preventDefault();
    fenster.setTitle(`CompHub — localhost:${port}`);
  });

  /*
   * Das Kreuz schliesst nur das Fenster, nicht das Programm.
   *
   * Der Grund sind die Overlays: die holt OBS von genau diesem Server. Wer
   * CompHub zumacht, weil er es gerade nicht braucht, haette sonst mitten im
   * Stream ein schwarzes Overlay. Also laeuft es im Infobereich weiter, und
   * beendet wird ueber das Menue dort.
   */
  fenster.on('close', (e) => {
    if (beendet) return;
    e.preventDefault();
    fenster.hide();
  });

  fenster.on('closed', () => { fenster = null; });
}

/** Das Symbol unten rechts, ueber das man zurueckkommt und beendet. */
function baueAblage(port) {
  const bild = path.join(WURZEL, 'public', 'logos', 'CompHub-Logo.png');
  try {
    ablage = new Tray(bild);
  } catch {
    // Ohne Symbol geht es auch - dann laesst sich nur nicht mehr aufrufen.
    return;
  }
  ablage.setToolTip(`CompHub — localhost:${port}`);
  ablage.setContextMenu(Menu.buildFromTemplate([
    {
      label: `Fenster zeigen`,
      click: () => { if (fenster) { fenster.show(); fenster.focus(); } },
    },
    {
      label: `Adresse für OBS: localhost:${port}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'CompHub beenden',
      click: () => { beendet = true; app.quit(); },
    },
  ]));
  ablage.on('double-click', () => { if (fenster) { fenster.show(); fenster.focus(); } });
}

/*
 * Nach Aktualisierungen sehen.
 *
 * Das Programm fragt bei GitHub nach, ob es eine neuere Fassung gibt, laedt
 * nur den Unterschied und setzt ihn beim naechsten Start ein. Der Nutzer
 * merkt davon nichts ausser einem Hinweis, wenn es soweit ist.
 *
 * Ohne Signatur meldet Windows beim Installieren weiterhin einen unbekannten
 * Herausgeber - daran aendert die Selbstaktualisierung nichts, sie umgeht
 * das Fenster nur nach dem ersten Mal.
 */
function pruefeAufNeues() {
  // Im Quellbaum gibt es nichts zu aktualisieren - das waere nur eine
  // Fehlermeldung bei jedem Start waehrend der Entwicklung.
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-downloaded', () => {
    if (!ablage) return;
    ablage.displayBalloon?.({
      title: 'CompHub',
      content: 'Eine neue Fassung ist bereit - sie wird beim naechsten Start eingesetzt.',
    });
  });

  // Ein Fehler beim Nachsehen darf das Programm nicht stoeren: ohne Netz
  // oder ohne Veroeffentlichung laeuft es einfach mit dem weiter, was da ist.
  autoUpdater.on('error', () => { /* still */ });

  autoUpdater.checkForUpdates().catch(() => { /* still */ });
  // Und danach alle sechs Stunden noch einmal.
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => { /* still */ });
  }, 6 * 3600 * 1000);
}

/**
 * Darf CompHub in seinen eigenen Datenordner schreiben?
 *
 * Wird beim Installieren "fuer alle Benutzer" gewaehlt, landet das Programm
 * unter "C:\Program Files". Dort darf es ohne Administratorrechte nichts
 * aendern - und dann scheitert jedes Speichern: Turnierkarten, Prognosen,
 * Tierlists, alles. Auf der Seite stand davon nur "Speichern
 * fehlgeschlagen".
 *
 * Der Installer legt CompHub jetzt in den Benutzerordner. Wer noch die alte
 * Fassung hat, bekommt hier gesagt, was los ist - statt es an einem
 * Feierabend selbst herauszufinden.
 */
function darfSchreiben() {
  const probe = path.join(WURZEL, 'data', '.schreibprobe');
  try {
    fs.mkdirSync(path.join(WURZEL, 'data'), { recursive: true });
    fs.writeFileSync(probe, 'x');
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

app.whenReady().then(async () => {
  try {
    if (!darfSchreiben()) {
      const antwort = dialog.showMessageBoxSync({
        type: 'warning',
        title: 'CompHub',
        message: 'CompHub darf seinen eigenen Datenordner nicht beschreiben.',
        detail: [
          'Das Programm liegt unter',
          WURZEL,
          '',
          'Dorthin darf es ohne Administratorrechte nichts schreiben.'
            + ' Karten, Prognosen und Tierlists lassen sich deshalb'
            + ' ansehen, aber nicht speichern.',
          '',
          'Abhilfe: CompHub deinstallieren und neu installieren. Der'
            + ' Installer legt es dann in deinen Benutzerordner, und alles'
            + ' verhält sich wie beim Start vom Quellordner aus.',
        ].join('\n'),
        buttons: ['Trotzdem starten', 'Beenden'],
        defaultId: 0,
        cancelId: 1,
      });
      if (antwort === 1) { app.quit(); return; }
    }

    const port = await starteServer();
    oeffneFenster(port);
    baueAblage(port);
    pruefeAufNeues();
  } catch (e) {
    dialog.showErrorBox('CompHub', String(e && e.message ? e.message : e));
    app.quit();
  }
});

/*
 * Nicht beenden, wenn das letzte Fenster zugeht - siehe oben, die Overlays
 * sollen weiterlaufen. Beendet wird ueber den Infobereich.
 */
app.on('window-all-closed', () => { /* absichtlich leer */ });

app.on('before-quit', () => {
  beendet = true;
  if (server) server.kill();
  if (ablage) ablage.destroy();
});
