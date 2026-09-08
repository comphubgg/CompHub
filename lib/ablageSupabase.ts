/*
 * Derselbe Speicher, nur in Supabase.
 *
 * Er erfuellt genau das, was lib/ablage.ts beschreibt - lesen, schreiben,
 * auflisten, loeschen, Angaben. Fuer die aufrufenden Stellen im Werkzeug
 * aendert sich damit nichts; sie kennen weiterhin nur Namen wie
 * "konten.json" oder "replays/s39/w1/_aggregat.json".
 *
 * Zwei Orte, ein Speicher
 * -----------------------
 * Die Daten von CompHub zerfallen in zwei sehr verschiedene Sorten, und sie
 * an denselben Ort zu legen waere fuer eine von beiden falsch:
 *
 *   - Kleine Staende, die bei fast jeder Anfrage gebraucht werden: Konten,
 *     Karten, Tierlists, Prognosen. Zusammen wenige Megabyte. Die gehoeren in
 *     die Tabelle - eine Zeile zu holen ist schneller und billiger als eine
 *     Datei, und Postgres kann darin spaeter auch suchen.
 *   - Grosses und Unfoermiges: Kartenbilder, Bildschirmausschnitte aus
 *     Meldungen, die Replay-Aggregate mit gut fuenf Megabyte je Spieltag, die
 *     zwischengespeicherten Epic-Spieltage. Hunderte Megabyte, selten
 *     gelesen. Die gehoeren in den Objektspeicher, wo Groesse nichts kostet
 *     ausser Platz - und wo sie die 500 MB der Datenbank nicht auffressen.
 *
 * Welcher Name wohin geht, entscheidet eine Liste von Ordnern weiter unten,
 * nicht die Groesse. Eine Groessenregel klingt eleganter, hat aber einen
 * Haken: beim Lesen weiss man die Groesse noch nicht und muesste an beiden
 * Orten nachsehen. Eine feste Zuordnung ist an jeder Stelle vorhersagbar.
 */

import type { Speicher } from '@/lib/ablage';

const TABELLE = 'ablage';
const EIMER = 'comphub';

/**
 * Diese Ordner liegen im Objektspeicher, alles andere in der Tabelle.
 *
 * Es sind genau die, die gross werden: Bilder, Replay-Aggregate und die
 * Zwischenspeicher, die sich aus Epic jederzeit neu holen lassen.
 */
const IM_OBJEKTSPEICHER = [
  /*
   * Nur noch Bilder und Replays.
   *
   * Anfangs lagen auch die Statistik-Ordner hier - sie sind gross, und der
   * Objektspeicher schien der richtige Ort. Beim ersten Messen bei Vercel
   * brauchte die Startseite eine Minute und dreiundfuenfzig Sekunden: die
   * Szene-Statistik liest neunhundert Dateien nacheinander, und der
   * Objektspeicher kann nur einzeln antworten. Die Tabelle kann einen ganzen
   * Ordner in einer Abfrage herausgeben - siehe der Vorgriff weiter unten -,
   * und damit wird aus neunhundert Anfragen etwa ein Zehntel davon.
   *
   * Hier bleibt, was wirklich unfoermig ist: Bilder, die ohnehin einzeln
   * abgerufen werden, und die Replay-Auswertungen mit gut fuenf Megabyte je
   * Spieltag, die eine Zeile in der Datenbank sprengen wuerden.
   */
  'replays/',
  'kartenbilder/',
  'kontakt-bilder/',
  'admin-maps/',
  '_sicherung/',
];

function alsObjekt(name: string): boolean {
  return IM_OBJEKTSPEICHER.some((p) => name.startsWith(p));
}

function zugang() {
  const url = (process.env.SUPABASE_URL || process.env.STORAGE_URL || '')
    .replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.STORAGE_SERVICE_ROLE_KEY || '';
  if (!url || !key) {
    throw new Error(
      'Supabase ist nicht eingerichtet - SUPABASE_URL und '
      + 'SUPABASE_SERVICE_ROLE_KEY fehlen in der Umgebung.');
  }
  return { url, kopf: { apikey: key, Authorization: `Bearer ${key}` } };
}

/* ------------------------------------------------------------- Tabelle */

/*
 * Der Vorgriff: wer eine Datei aus einem Ordner will, bekommt den Ordner.
 *
 * Auf der Platte ist es billig, neunhundert Dateien nacheinander zu oeffnen -
 * das tut lib/szeneStats.ts, eine Schleife ueber alle Spieltage. Ueber HTTP
 * sind daraus neunhundert Anfragen geworden, und bei Vercel lief die Antwort
 * in die Zeitgrenze: die Startseite zeigte Striche statt Zahlen, die
 * Regionen-Seite blieb leer, und /api/spieler-center endete mit "An error
 * occurred with your deployment".
 *
 * Statt jede Zeile einzeln zu holen, wird beim ersten Zugriff der ganze
 * Ordner in einem Zug geholt und gemerkt. Aus neunhundert Anfragen werden
 * damit siebzig - je Region und Saison eine -, und der Rest kommt aus dem
 * Gedaechtnis.
 *
 * Zwei Grenzen halten das im Rahmen:
 *   - Nur Ordner. Eine Datei direkt in der Wurzel (konten.json) wird einzeln
 *     geholt; dort gibt es nichts vorzugreifen.
 *   - Hoechstens dreihundert Zeilen. Ein groesserer Ordner faellt auf den
 *     Einzelweg zurueck, statt eine Antwort von vielen Megabyte anzufordern.
 */
const VORGRIFF_HOECHSTENS = 300;
/** Wie lange ein geholter Ordner gilt. Kurz genug, dass Neues bald da ist. */
const VORGRIFF_HALTBAR_MS = 60_000;

const ordnerCache = new Map<string, { stand: Map<string, string>; bis: number }>();

/** Der Ordner eines Namens, mit Schraegstrich - oder null in der Wurzel. */
function ordnerVon(name: string): string | null {
  const i = name.lastIndexOf('/');
  return i < 0 ? null : name.slice(0, i + 1);
}

/*
 * Ordner, die nie im Ganzen geholt werden.
 *
 * Der Vorgriff lohnt sich, wo viele kleine Dateien nacheinander gelesen
 * werden - die Szene-Statistik etwa, dreizehn Dateien je Region und Saison.
 * Bei den fertigen Antworten ist es umgekehrt: jede einzelne ist eine ganze
 * Serverantwort, zusammen zweiunddreissig Megabyte, und gebraucht wird immer
 * genau eine.
 *
 * Ohne diese Ausnahme holte die Startseite bei jedem Aufruf alle
 * hunderteinundzwanzig - gemessen elf Sekunden fuer eine Auskunft, die
 * vierhundertsechsundsechzig Zeichen lang ist. Der Vorgriff, der das Warten
 * beenden sollte, war damit selbst die Ursache.
 */
const NIE_VORGREIFEN = ['antworten/'];

async function holeOrdner(praefix: string): Promise<Map<string, string> | null> {
  if (NIE_VORGREIFEN.some((p) => praefix.startsWith(p))) return null;
  const gemerkt = ordnerCache.get(praefix);
  if (gemerkt && Date.now() < gemerkt.bis) return gemerkt.stand;

  const { url, kopf } = zugang();
  const r = await fetch(
    `${url}/rest/v1/${TABELLE}?name=like.${encodeURIComponent(praefix + '*')}`
    + `&select=name,wert&limit=${VORGRIFF_HOECHSTENS + 1}`,
    { headers: kopf, cache: 'no-store' });
  if (!r.ok) return null;
  const zeilen = await r.json() as Array<{ name: string; wert: string }>;
  // Zu gross: dann lieber einzeln, und den Ordner nicht merken.
  if (zeilen.length > VORGRIFF_HOECHSTENS) return null;

  const stand = new Map<string, string>();
  for (const z of zeilen) stand.set(z.name, z.wert);
  ordnerCache.set(praefix, { stand, bis: Date.now() + VORGRIFF_HALTBAR_MS });
  return stand;
}

async function tabelleLies(name: string): Promise<Buffer | null> {
  const praefix = ordnerVon(name);
  if (praefix) {
    const ordner = await holeOrdner(praefix);
    if (ordner) {
      const wert = ordner.get(name);
      return wert === undefined ? null : Buffer.from(wert, 'utf8');
    }
  }

  const { url, kopf } = zugang();
  const r = await fetch(
    `${url}/rest/v1/${TABELLE}?name=eq.${encodeURIComponent(name)}&select=wert`,
    { headers: kopf, cache: 'no-store' });
  if (!r.ok) return null;
  const zeilen = await r.json() as Array<{ wert: string }>;
  if (!zeilen.length) return null;
  return Buffer.from(zeilen[0].wert, 'utf8');
}

async function tabelleSchreib(name: string, daten: Buffer): Promise<void> {
  const { url, kopf } = zugang();
  /*
   * Abgelegt wird der Text, Zeichen fuer Zeichen.
   *
   * Zuerst stand hier eine jsonb-Spalte, und das war ein Fehler: Postgres
   * sortiert in jsonb die Schluessel eines Objekts um und wirft Leerzeichen
   * weg. Der Inhalt bleibt derselbe - nachgemessen an einer Tierlist mit
   * tausendzehn Eintraegen, gleiche Laenge, gleiche Zahl, inhaltlich
   * identisch -, aber aus
   *
   *     listId, listName, tierLabels, entries, updatedAt
   * wurde
   *     listId, entries, listName, updatedAt, tierLabels
   *
   * Das ist kein Verlust, aber es ist eine stille Aenderung an seinen Daten,
   * und es hiesse, sechsundfuenfzig Module darauf zu pruefen, ob eines von
   * ihnen die Reihenfolge von Schluesseln braucht. Als Text kommt heraus,
   * was hineingegangen ist - und das laesst sich Byte fuer Byte belegen
   * statt nur "nach dem Sortieren gleich".
   */
  const wert = daten.toString('utf8');
  const r = await fetch(`${url}/rest/v1/${TABELLE}`, {
    method: 'POST',
    headers: {
      ...kopf,
      'Content-Type': 'application/json',
      // Gibt es den Namen schon, wird die Zeile ersetzt statt abgelehnt.
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ name, wert }),
  });
  if (!r.ok) throw new Error(`Ablage schreiben (${name}): ${r.status} ${await r.text()}`);
  // Was gerade geschrieben wurde, darf nicht aus dem Vorgriff kommen.
  const praefix = ordnerVon(name);
  if (praefix) ordnerCache.delete(praefix);
}

async function tabelleLoesche(name: string): Promise<void> {
  const { url, kopf } = zugang();
  await fetch(`${url}/rest/v1/${TABELLE}?name=eq.${encodeURIComponent(name)}`,
    { method: 'DELETE', headers: kopf });
  const praefix = ordnerVon(name);
  if (praefix) ordnerCache.delete(praefix);
}

async function tabelleListe(ordner: string): Promise<string[]> {
  const { url, kopf } = zugang();
  const praefix = ordner ? `${ordner.replace(/\/+$/, '')}/` : '';
  const r = await fetch(
    `${url}/rest/v1/${TABELLE}?name=like.${encodeURIComponent(praefix + '*')}&select=name`,
    { headers: kopf, cache: 'no-store' });
  if (!r.ok) return [];
  const zeilen = await r.json() as Array<{ name: string }>;
  /*
   * Nur eine Ebene, wie readdir es tut. Aus "replays/s39/w1/_aggregat.json"
   * wird unter "replays" also "s39" - und jeder Ordnername nur einmal.
   */
  const raus = new Set<string>();
  for (const z of zeilen) {
    const rest = z.name.slice(praefix.length);
    if (!rest) continue;
    raus.add(rest.split('/')[0]);
  }
  return [...raus];
}

async function tabelleAngaben(name: string) {
  const { url, kopf } = zugang();
  const r = await fetch(
    `${url}/rest/v1/${TABELLE}?name=eq.${encodeURIComponent(name)}&select=geaendert,wert`,
    { headers: kopf, cache: 'no-store' });
  if (!r.ok) return null;
  const zeilen = await r.json() as Array<{ geaendert: string; wert: string }>;
  if (!zeilen.length) return null;
  return {
    groesse: Buffer.byteLength(zeilen[0].wert, 'utf8'),
    geaendert: new Date(zeilen[0].geaendert),
  };
}

/* ------------------------------------------------------ Objektspeicher */

async function objektLies(name: string): Promise<Buffer | null> {
  const { url, kopf } = zugang();
  const r = await fetch(`${url}/storage/v1/object/${EIMER}/${name}`,
    { headers: kopf, cache: 'no-store' });
  if (!r.ok) return null;
  return Buffer.from(await r.arrayBuffer());
}

async function objektSchreib(name: string, daten: Buffer): Promise<void> {
  const { url, kopf } = zugang();
  const r = await fetch(`${url}/storage/v1/object/${EIMER}/${name}`, {
    method: 'POST',
    headers: {
      ...kopf,
      'Content-Type': name.endsWith('.json')
        ? 'application/json' : 'application/octet-stream',
      // Ohne dieses Kopffeld lehnt Supabase eine vorhandene Datei ab.
      'x-upsert': 'true',
    },
    body: new Uint8Array(daten),
  });
  if (!r.ok) throw new Error(`Objekt schreiben (${name}): ${r.status} ${await r.text()}`);
}

async function objektLoesche(name: string): Promise<void> {
  const { url, kopf } = zugang();
  await fetch(`${url}/storage/v1/object/${EIMER}/${name}`,
    { method: 'DELETE', headers: kopf });
}

async function objektListe(ordner: string): Promise<string[]> {
  const { url, kopf } = zugang();
  const raus: string[] = [];
  /*
   * Supabase gibt hoechstens hundert Eintraege je Anfrage heraus. Ein
   * Spieltag mit hundertsechzig Runden waere damit abgeschnitten - und eine
   * halbe Liste ist schlimmer als gar keine.
   */
  const PRO_SEITE = 100;
  for (let versatz = 0; ; versatz += PRO_SEITE) {
    const r = await fetch(`${url}/storage/v1/object/list/${EIMER}`, {
      method: 'POST',
      headers: { ...kopf, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prefix: ordner ? `${ordner.replace(/\/+$/, '')}/` : '',
        limit: PRO_SEITE,
        offset: versatz,
      }),
    });
    if (!r.ok) break;
    const teil = await r.json() as Array<{ name: string }>;
    for (const e of teil) raus.push(e.name);
    if (teil.length < PRO_SEITE) break;
  }
  return raus;
}

async function objektAngaben(name: string) {
  const { url, kopf } = zugang();
  const r = await fetch(`${url}/storage/v1/object/info/${EIMER}/${name}`,
    { headers: kopf, cache: 'no-store' });
  if (!r.ok) return null;
  const j = await r.json() as { size?: number; updated_at?: string };
  return {
    groesse: Number(j.size ?? 0),
    geaendert: new Date(j.updated_at ?? Date.now()),
  };
}

/* ---------------------------------------------------------- Der Speicher */

export const supabaseSpeicher: Speicher = {
  lies: (name) => (alsObjekt(name) ? objektLies(name) : tabelleLies(name)),
  schreib: (name, daten) =>
    (alsObjekt(name) ? objektSchreib(name, daten) : tabelleSchreib(name, daten)),
  loesche: (name) => (alsObjekt(name) ? objektLoesche(name) : tabelleLoesche(name)),
  liste: (ordner) => (alsObjekt(`${ordner.replace(/\/+$/, '')}/`)
    ? objektListe(ordner) : tabelleListe(ordner)),
  angaben: (name) => (alsObjekt(name) ? objektAngaben(name) : tabelleAngaben(name)),
};
