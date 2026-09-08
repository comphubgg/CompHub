/*
 * Der Datenordner, wie ihn das Werkzeug bisher kennt - nur ohne Platte.
 *
 * Sechsundfuenfzig Dateien lesen aus dem Datenordner, einundvierzig Stellen
 * schreiben hinein, und fast alle tun es auf dieselbe Art:
 *
 *     const DATEI = path.join(DATEN_ORT, 'konten.json');
 *     JSON.parse(await fs.readFile(DATEI, 'utf8'))
 *
 * Diese Stellen einzeln umzuschreiben waere ein Eingriff an sechsundfuenfzig
 * Orten, jeder mit eigener Gelegenheit, etwas zu uebersehen - bei Daten, die
 * der Betreiber nicht verlieren darf. Deshalb dieser Weg: ein Baustein, der
 * sich verhaelt wie `fs.promises`, aber alles unterhalb des Datenordners an
 * lib/ablage.ts weiterreicht. Eine Datei wechselt damit ihre Importzeile und
 * sonst nichts.
 *
 * Entscheidend ist die Weiche nach Ort: was unterhalb von DATEN_ORT liegt,
 * geht in die Ablage; alles andere - Programmdateien, Zertifikate, was auch
 * immer - geht unveraendert an das echte Dateisystem. So kann eine Datei
 * beides anfassen, ohne dass jemand daran denken muss.
 *
 * Nachgebildet ist nur, was das Werkzeug wirklich benutzt. Alles andere fehlt
 * absichtlich: ein halb nachgebautes Dateisystem, das an einer Ecke
 * stillschweigend etwas anderes tut als das echte, waere schlimmer als eines,
 * das an dieser Ecke gar nicht erst vorhanden ist.
 */

import { promises as echtesFs } from 'fs';
import path from 'path';
import { DATEN_ORT } from '@/lib/datenOrt';
import { speicher } from '@/lib/ablage';

const WURZEL = path.resolve(DATEN_ORT);

/**
 * Der Name in der Ablage - oder null, wenn der Pfad woanders hinzeigt.
 */
function nameVon(p: string): string | null {
  const voll = path.resolve(String(p));
  if (voll === WURZEL) return '';
  if (!voll.startsWith(WURZEL + path.sep)) return null;
  return voll.slice(WURZEL.length + 1).replace(/\\/g, '/');
}

/**
 * Ein Fehler, wie ihn das Dateisystem wirft.
 *
 * Die aufrufenden Stellen fangen ihn ab und antworten mit einem leeren Stand -
 * das ist ihr Umgang mit "gibt es noch nicht". Ein anderer Fehler wuerde diese
 * Stellen ins Leere laufen lassen, deshalb traegt dieser denselben Code.
 */
function fehltFehler(p: string, ruf: string): NodeJS.ErrnoException {
  const e = new Error(
    `ENOENT: no such file or directory, ${ruf} '${p}'`) as NodeJS.ErrnoException;
  e.code = 'ENOENT';
  e.errno = -4058;
  e.path = p;
  e.syscall = ruf;
  return e;
}

type Kodierung = BufferEncoding | { encoding?: BufferEncoding | null } | null | undefined;

function kodierungVon(k: Kodierung): BufferEncoding | null {
  if (!k) return null;
  if (typeof k === 'string') return k;
  return k.encoding ?? null;
}

/*
 * Zwei Formen, wie beim echten fs: mit Kodierung kommt Text zurueck, ohne
 * kommt ein Puffer. Ohne diese Unterscheidung im Typ muesste jede der
 * neunzig Lesestellen eine Umwandlung dazuschreiben - und der Umbau waere
 * genau der grosse Eingriff, den dieser Baustein vermeiden soll.
 */
export function readFile(
  p: string, k: BufferEncoding | { encoding: BufferEncoding },
): Promise<string>;
export function readFile(
  p: string, k?: null | { encoding?: null },
): Promise<Buffer>;
export async function readFile(p: string, k?: Kodierung): Promise<string | Buffer> {
  const name = nameVon(p);
  if (name === null) return echtesFs.readFile(p, k as never);
  const roh = await speicher.lies(name);
  if (!roh) throw fehltFehler(p, 'open');
  const kod = kodierungVon(k);
  return kod ? roh.toString(kod) : roh;
}

export async function writeFile(
  p: string, daten: string | Buffer | Uint8Array, k?: Kodierung,
): Promise<void> {
  const name = nameVon(p);
  if (name === null) return echtesFs.writeFile(p, daten as never, k as never);
  const puffer = typeof daten === 'string'
    ? Buffer.from(daten, kodierungVon(k) ?? 'utf8')
    : Buffer.from(daten);
  await speicher.schreib(name, puffer);
}

/**
 * Ordner anlegen.
 *
 * In der Ablage gibt es keine Ordner - ein Name mit Schraegstrichen ist alles,
 * was es braucht. Der Aufruf tut deshalb nichts und meldet Erfolg, statt zu
 * scheitern: die aufrufenden Stellen legen den Ordner vor jedem Schreiben an,
 * und ein Fehler an dieser Stelle wuerde das Schreiben verhindern.
 */
export async function mkdir(p: string, o?: { recursive?: boolean }): Promise<undefined> {
  const name = nameVon(p);
  if (name === null) { await echtesFs.mkdir(p, o); return undefined; }
  return undefined;
}

/** Ein Eintrag, wie ihn readdir mit withFileTypes liefert. */
export interface Eintrag {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

/*
 * Wieder zwei Formen wie beim echten fs: ohne Angabe kommen Namen, mit
 * withFileTypes kommen Eintraege. Ohne diese Trennung im Typ muesste jede
 * Fundstelle eine Umwandlung dazuschreiben.
 */
export function readdir(p: string, o?: { withFileTypes?: false }): Promise<string[]>;
export function readdir(p: string, o: { withFileTypes: true }): Promise<Eintrag[]>;
export async function readdir(
  p: string, o?: { withFileTypes?: boolean },
): Promise<string[] | Eintrag[]> {
  const name = nameVon(p);
  if (name === null) return echtesFs.readdir(p, o as never) as never;
  const eintraege = await speicher.liste(name);
  if (!o?.withFileTypes) return eintraege;
  /*
   * Ein Eintrag ohne Punkt im Namen gilt als Ordner.
   *
   * Die Ablage kennt den Unterschied nicht - sie kennt nur Namen. Diese Regel
   * trifft zu, weil im Datenordner jede Datei eine Endung hat (.json, .png,
   * .txt) und jeder Ordner keine. Wo das einmal nicht mehr stimmt, faellt es
   * dort auf, wo mit withFileTypes gearbeitet wird - und das ist eine
   * einzige Stelle.
   */
  return eintraege.map((e) => ({
    name: e,
    isDirectory: () => !e.includes('.'),
    isFile: () => e.includes('.'),
  }));
}

export async function access(p: string): Promise<void> {
  const name = nameVon(p);
  if (name === null) return echtesFs.access(p);
  if (!await speicher.angaben(name)) throw fehltFehler(p, 'access');
}

export async function unlink(p: string): Promise<void> {
  const name = nameVon(p);
  if (name === null) return echtesFs.unlink(p);
  await speicher.loesche(name);
}

export async function stat(p: string) {
  const name = nameVon(p);
  if (name === null) return echtesFs.stat(p);
  const a = await speicher.angaben(name);
  if (!a) throw fehltFehler(p, 'stat');
  return {
    size: a.groesse,
    mtime: a.geaendert,
    mtimeMs: a.geaendert.getTime(),
    isDirectory: () => false,
    isFile: () => true,
  };
}

export async function rename(von: string, nach: string): Promise<void> {
  const a = nameVon(von);
  const b = nameVon(nach);
  if (a === null && b === null) return echtesFs.rename(von, nach);
  const roh = a === null
    ? await echtesFs.readFile(von)
    : await speicher.lies(a);
  if (!roh) throw fehltFehler(von, 'rename');
  if (b === null) await echtesFs.writeFile(nach, roh);
  else await speicher.schreib(b, Buffer.from(roh));
  if (a === null) await echtesFs.unlink(von);
  else await speicher.loesche(a);
}

export async function copyFile(von: string, nach: string): Promise<void> {
  const a = nameVon(von);
  const b = nameVon(nach);
  const roh = a === null ? await echtesFs.readFile(von) : await speicher.lies(a);
  if (!roh) throw fehltFehler(von, 'copyfile');
  if (b === null) await echtesFs.writeFile(nach, roh);
  else await speicher.schreib(b, Buffer.from(roh));
}

/**
 * Dieselbe Form wie `import { promises as fs } from 'fs'`.
 *
 * Damit wird aus dem Umbau einer Datei genau eine geaenderte Zeile.
 */
const ablageFs = {
  readFile, writeFile, mkdir, readdir, access, unlink, stat, rename, copyFile,
};

export default ablageFs;
