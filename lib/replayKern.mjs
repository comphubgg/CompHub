// Turnier-Replays von Epic holen, auswerten und ablegen.
//
// Warum ueberhaupt eine vierte Quelle?
//
// Epics Bestenlisten geben Platz, Punkte und Mitspieler, aber nichts je
// Spieler. eucompetitive.com gibt die Einzelwerte - Schaden, Material,
// Bauteile -, veroeffentlicht aber ein bis zwei Tage spaeter und nicht jeden
// Cup. Beides zusammen laesst eine Luecke: was in einem Match tatsaechlich
// passiert ist. Wer hat wen ausgeschaltet, womit, wann, und wie oft wurde
// jemand nur umgehauen statt getoetet.
//
// Genau das steht in den Server-Replays, die Epic zu jedem Turniermatch
// ablegt.
//
// ---------------------------------------------------------------- Grenzen
//
// Zwei Dinge muss man wissen, bevor man diesem Modul etwas zutraut:
//
// 1. EPIC HAELT REPLAYS 31 TAGE VOR. Tagesgenau nachgemessen: 31 Tage alt
//    ist da, 32 Tage alt ist fort. Ueber die Saisons hinweg lieferte S42
//    vier von vier Matches, S30 bis S41 keinen einzigen. Es gibt kein
//    Nachladen der Vergangenheit - was heute nicht geholt wird, ist in
//    einem Monat unwiederbringlich weg. Deshalb laeuft das Sammeln
//    planmaessig von selbst und nicht auf Knopfdruck.
//
// 2. AUS DEM REPLAY KOMMEN NUR DIE EREIGNISSE, NICHT DIE WERTE. Der
//    Netzwerk-Stream eines Matches - dort steckten Schaden, Kopftreffer,
//    Material und Bauteile - laesst sich mit dem offenen Parser nicht mehr
//    lesen: fortnite-replay-parser 1.4.8 bricht auf Fortnite 42.00 in jeder
//    Stufe mit "offset is larger than buffer" ab. Mit parsePackets: false
//    laeuft er dagegen fehlerfrei und in Sekundenbruchteilen.
//
//    Diese Werte werden hier deshalb NICHT erfunden und NICHT mit Null
//    gefuellt. Sie kommen weiter aus der Szene-Quelle. Was das Replay
//    beitraegt, ist etwas, das sonst niemand veroeffentlicht.
//
// ------------------------------------------------------------- Sparsamkeit
//
// Ein vollstaendiges Replay ist 163 MB. Der Netzwerk-Stream macht 192 MB der
// Rohdaten aus und wird ohnehin nicht gelesen. Holt man nur die Ereignisse
// (dataCount: 0, checkpointCount: 0), bleiben 3,2 MB - bei genau demselben
// Ergebnis: 150 Ereignisse, 97 Konten. Das ist der Unterschied zwischen
// 180 GB und 3,5 GB fuer einen Cup-Tag ueber sieben Regionen.
//
// ------------------------------------------------------------- Anmeldung
//
// Die Replays haengen an einem reinen App-Token (grant_type=client_credentials)
// des oeffentlich dokumentierten Fortnite-Android-Clients. Kein Nutzerkonto,
// kein Schluessel, den sich jemand besorgen muss, keine Kosten. Die
// Bestenlisten - fuer die Match-Ids - brauchen dagegen die Geraete-Anmeldung,
// die das Werkzeug ohnehin schon hat.

import { promises as fs, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { downloadReplay } = require('fortnite-serverreplay-downloader');
const parseReplay = require('fortnite-replay-parser');

/**
 * Die Fassung dieses Auswerters.
 *
 * Sie steht in jeder abgelegten Datei. Aendert sich das Replay-Format oder
 * lernt der Parser dazu, laesst sich daran erkennen, was neu ausgewertet
 * gehoert - ohne die Rohdaten noch einmal von Epic zu holen, die es dann
 * womoeglich gar nicht mehr gibt.
 */
export const PARSER_VERSION = '1.0.0';

const ACCOUNT = 'https://account-public-service-prod.ol.epicgames.com';
const EVENTS = 'https://events-public-service-live.ol.epicgames.com';
const META = 'https://datastorage-public-service-live.ol.epicgames.com'
  + '/api/v1/data/fnreplaysmetadata/public/';

// Oeffentlich dokumentierter Fortnite-Android-Client - derselbe, den auch
// lib/epicCups.ts benutzt. Kein Geheimnis, gehoert aber trotzdem nicht in
// eine Ausgabe.
const CLIENT_ID = process.env.EPIC_CLIENT_ID || '3f69e56c7649492c8cc29f1af08a8a12';
const CLIENT_SECRET = process.env.EPIC_CLIENT_SECRET
  || 'b51ee9cb12234f50a69efa67ef53812e';
const BASIC = 'basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

/*
 * Derselbe Datenordner wie auf der TypeScript-Seite (siehe lib/datenOrt.ts).
 *
 * Diese Datei ist reines JavaScript und kann das Modul dort nicht einbinden,
 * also steht die Entscheidung hier ein zweites Mal - aber nur die
 * Entscheidung, nicht das Umziehen: das erledigt die andere Seite beim Start.
 * Ohne diesen Gleichlauf schriebe die Anwendung ihre Epic-Anmeldung an einen
 * anderen Ort, als das Replay-Werkzeug sie sucht.
 */
function datenOrt() {
  if (process.env.COMPHUB_DATEN) return process.env.COMPHUB_DATEN;
  const paket = path.join(process.cwd(), 'data');
  try {
    mkdirSync(paket, { recursive: true });
    const probe = path.join(paket, `.schreibprobe-${process.pid}`);
    writeFileSync(probe, 'x');
    unlinkSync(probe);
    return paket;
  } catch {
    return path.join(process.env.APPDATA || process.env.HOME || '.',
      'CompHub', 'data');
  }
}
const DATEN_ORT = datenOrt();

export const ABLAGE = path.join(DATEN_ORT, 'replays');
const AUTH_DATEI = path.join(DATEN_ORT, 'epic-auth.json');

/** Wie lange Epic ein Replay vorhaelt - gemessen, nicht geraten. */
export const FRIST_TAGE = 31;

/* ---------------------------------------------------------- Anmeldungen */

let appToken = null;
let appBis = 0;

/** Das App-Token fuer die Replays. Braucht kein Konto. */
export async function holeAppToken() {
  if (appToken && Date.now() < appBis) return appToken;

  const antwort = await fetch(`${ACCOUNT}/account/api/oauth/token`, {
    method: 'POST',
    headers: { Authorization: BASIC, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', token_type: 'eg1' }),
  });
  if (!antwort.ok) {
    // Der Text koennte Kopfzeilen enthalten - nur der Status wird gemeldet.
    throw new Error(`Anmeldung fehlgeschlagen (HTTP ${antwort.status})`);
  }
  const daten = await antwort.json();
  appToken = `bearer ${daten.access_token}`;
  appBis = Date.now() + Math.max(60, (daten.expires_in ?? 14400) - 300) * 1000;
  return appToken;
}

let nutzerToken = null;
let nutzerBis = 0;
let nutzerKonto = '';

/** Die Geraete-Anmeldung - nur fuer die Bestenlisten, nicht fuer Replays. */
export async function holeNutzerToken() {
  if (nutzerToken && Date.now() < nutzerBis) {
    return { token: nutzerToken, accountId: nutzerKonto };
  }

  const roh = process.env.EPIC_DEVICE_AUTH
    ? JSON.parse(process.env.EPIC_DEVICE_AUTH)
    : JSON.parse(await fs.readFile(AUTH_DATEI, 'utf8'));

  const antwort = await fetch(`${ACCOUNT}/account/api/oauth/token`, {
    method: 'POST',
    headers: { Authorization: BASIC, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'device_auth', account_id: roh.accountId,
      device_id: roh.deviceId, secret: roh.secret,
    }),
  });
  if (!antwort.ok) throw new Error(`Geraete-Anmeldung fehlgeschlagen (HTTP ${antwort.status})`);
  const daten = await antwort.json();
  nutzerToken = `bearer ${daten.access_token}`;
  nutzerKonto = daten.account_id;
  nutzerBis = Date.now() + Math.max(60, (daten.expires_in ?? 7200) - 300) * 1000;
  return { token: nutzerToken, accountId: nutzerKonto };
}

/* ------------------------------------------------------------- Zustaende */

export const ZUSTAND = {
  OFFEN: 'PENDING',
  PRUEFT: 'CHECKING',
  VORHANDEN: 'AVAILABLE',
  LAEDT: 'DOWNLOADING',
  GELADEN: 'DOWNLOADED',
  WERTET_AUS: 'PARSING',
  FERTIG: 'PARSED',
  FEHLGESCHLAGEN: 'FAILED',
  NICHT_VORHANDEN: 'NOT_AVAILABLE',
  WIEDERHOLT: 'RETRYING',
};

/* --------------------------------------------------------- Match-Ids */

/**
 * Alle Match-Ids eines Turnierfensters aus Epics Bestenliste.
 *
 * Jeder Eintrag fuehrt seine Spielhistorie mit, und darin steht je Match
 * eine sessionId - das ist zugleich der Name des Replays. Ein Match taucht
 * bei allen Teams auf, die darin waren, deshalb das Set.
 */
export async function matchIds(eventId, windowId, maxSeiten = 10) {
  const { token, accountId } = await holeNutzerToken();
  const gefunden = new Set();

  for (let seite = 0; seite < maxSeiten; seite++) {
    const url = `${EVENTS}/api/v1/leaderboards/Fortnite/${encodeURIComponent(eventId)}`
      + `/${encodeURIComponent(windowId)}/${accountId}`
      + `?page=${seite}&rank=0&teamAccountIds=`;
    const antwort = await fetch(url, { headers: { Authorization: token } });
    if (!antwort.ok) {
      if (seite === 0) throw new Error(`Bestenliste HTTP ${antwort.status}`);
      break;
    }
    const daten = await antwort.json();
    for (const eintrag of daten.entries ?? []) {
      for (const m of eintrag.sessionHistory ?? []) {
        if (m.sessionId) gefunden.add(m.sessionId);
      }
    }
    if (seite >= (daten.totalPages ?? 1) - 1) break;
    await warte(300);
  }
  return [...gefunden];
}

/* ------------------------------------------------- Pruefen, Laden, Werten */

export const warte = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Liegt zu diesem Match ueberhaupt ein Replay?
 *
 * Ein fehlendes Replay ist kein Fehler (siehe Punkt 14 der Anforderung):
 * aeltere Matches faellt Epic nach einem Monat weg, und das ist der
 * Normalfall, kein Ausfall.
 */
export async function replayVorhanden(matchId) {
  const token = await holeAppToken();
  const antwort = await fetch(`${META}${matchId}.json`, {
    headers: { Authorization: token },
  });
  if (antwort.status === 404) return { vorhanden: false, metadaten: null };
  if (!antwort.ok) throw new Error(`Metadaten HTTP ${antwort.status}`);
  return { vorhanden: true, metadaten: await antwort.json() };
}

/**
 * Ein Match auswerten - Herunterladen und Auslesen in einem Schritt.
 *
 * Bewusst nur die Ereignisse: dataCount und checkpointCount stehen auf null.
 * Der Netzwerk-Stream waere fuenfzigmal so gross und liesse sich ohnehin
 * nicht lesen.
 *
 * Der Puffer wird nicht auf die Platte geschrieben. Bei tausend Matches am
 * Tag waeren das drei Gigabyte Dateien, aus denen wir nur ein paar Kilobyte
 * brauchen - und was wir brauchen, steht danach in der abgelegten Auswertung.
 */
export async function ladeMatch(matchId) {
  return downloadReplay({
    matchId, dataCount: 0, checkpointCount: 0, eventCount: 5000,
  });
}

/**
 * Einen geladenen Puffer auslesen.
 *
 * Getrennt vom Laden, weil beides verschieden teuer ist und die Anforderung
 * beide Grenzen kennt: Herunterladen haengt an der Leitung (zwei Sekunden je
 * Match), Auslesen an Rechenzeit und Speicher (Bruchteile davon). Zwei
 * getrennte Schleusen sind ehrlicher als ein Regler, der nur eine Haelfte
 * bremst.
 */
export async function leseMatch(matchId, puffer) {
  const gelesen = await parseReplay(puffer, {
    parseEvents: true, parsePackets: false, debug: false,
  });

  const kopf = gelesen.header ?? {};
  const info = gelesen.info ?? {};
  const ereignisse = gelesen.events ?? [];

  /**
   * Die Eliminierungen.
   *
   * "knocked" trennt das Umhauen vom Toeten. Bei Duos und Trios kann ein
   * Spieler wieder aufgestellt werden - ein Knock ist also kein Kill, und
   * beides zusammenzuzaehlen waere schlicht falsch. Genau diese Trennung
   * veroeffentlicht sonst keine Quelle.
   */
  const elims = ereignisse
    .filter((e) => e.group === 'playerElim')
    .map((e) => ({
      zeit: e.startTime ?? null,
      opfer: e.eliminated ?? null,
      taeter: e.eliminator ?? null,
      waffe: e.gunType ?? null,
      knock: Boolean(e.knocked),
    }))
    .filter((e) => e.opfer || e.taeter)
    .sort((a, b) => (a.zeit ?? 0) - (b.zeit ?? 0));

  const beteiligt = new Set();
  for (const e of elims) {
    if (e.opfer) beteiligt.add(e.opfer);
    if (e.taeter) beteiligt.add(e.taeter);
  }

  return {
    matchId,
    karte: info.FriendlyName ?? kopf.LevelNamesAndTimes
      ? Object.keys(kopf.LevelNamesAndTimes ?? {})[0] ?? null : null,
    dauerMs: info.LengthInMs ?? null,
    zeitpunkt: info.Timestamp ?? null,
    fortnite: kopf.Major && kopf.Minor ? `${kopf.Major}.${kopf.Minor}` : null,
    changelist: kopf.Changelist ?? null,
    // Wie viele Bausteine geladen wurden - fuer die Nachschau, wenn eine
    // Auswertung einmal ungewoehnlich duenn ausfaellt.
    bytes: puffer.length,
    ereignisArten: zaehleArten(ereignisse),
    konten: [...beteiligt],
    elims,
    parserVersion: PARSER_VERSION,
    ausgewertet: new Date().toISOString(),
  };
}

/** Laden und Auslesen in einem - fuer Einzelabfragen wie den Admin-Test. */
export async function werteMatchAus(matchId) {
  return leseMatch(matchId, await ladeMatch(matchId));
}

function zaehleArten(ereignisse) {
  const arten = {};
  for (const e of ereignisse) {
    const g = e.group ?? e.eventType ?? '?';
    arten[g] = (arten[g] ?? 0) + 1;
  }
  return arten;
}

/* ---------------------------------------------------------------- Ablage */

/**
 * Wohin ein Match gehoert.
 *
 * Nach Saison und Turnierfenster, damit ein Ordner ueberschaubar bleibt und
 * sich ein einzelnes Turnier loeschen oder neu auswerten laesst, ohne den
 * Rest anzufassen.
 */
export function matchPfad(season, windowId, matchId) {
  return path.join(ABLAGE, season, windowId, `${matchId}.json`);
}

export function fensterPfad(season, windowId) {
  return path.join(ABLAGE, season, windowId);
}

/** Der Zustand aller Matches eines Fensters. */
export async function liesZustand(season, windowId) {
  try {
    return JSON.parse(await fs.readFile(
      path.join(fensterPfad(season, windowId), '_zustand.json'), 'utf8'));
  } catch {
    return { season, windowId, matches: {}, };
  }
}

export async function schreibeZustand(season, windowId, zustand) {
  const ordner = fensterPfad(season, windowId);
  await fs.mkdir(ordner, { recursive: true });
  await fs.writeFile(path.join(ordner, '_zustand.json'),
    JSON.stringify(zustand, null, 1), 'utf8');
}

/** Die Rohauswertung eines Matches ablegen - getrennt von allem Gerechneten. */
export async function schreibeMatch(season, windowId, daten) {
  const ordner = fensterPfad(season, windowId);
  await fs.mkdir(ordner, { recursive: true });
  await fs.writeFile(matchPfad(season, windowId, daten.matchId),
    JSON.stringify(daten), 'utf8');
}
