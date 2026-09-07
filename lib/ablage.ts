/*
 * Wo die Daten liegen - austauschbar.
 *
 * Bis heute kannte das Werkzeug genau einen Speicher: den Ordner `data` neben
 * dem Programm. Sechsundfuenfzig Dateien lesen daraus, einundvierzig Stellen
 * schreiben hinein. Solange CompHub auf einem eigenen Rechner laeuft, ist das
 * die einfachste und schnellste Loesung, die es gibt.
 *
 * Sie hat nur eine Bedingung: dieser Rechner muss laufen. Genau daran ist es
 * gescheitert - erst der Laptop mit Abstuerzen, dann gar kein Zugang mehr, und
 * jedes Mal war thecomphub.com weg. Ein Server, der rund um die Uhr laeuft und
 * niemandem gehoert, ist ohne hinterlegte Kreditkarte nicht zu bekommen; was
 * es ohne Karte gibt, sind Plattformen wie Vercel, und deren Dateisystem ist
 * schreibgeschuetzt. Dort kann `data` nicht liegen.
 *
 * Deshalb diese Schicht. Sie beschreibt, was das Werkzeug von einem Speicher
 * braucht - mehr nicht: lesen, schreiben, auflisten, loeschen. Dahinter steht
 * heute der Ordner und spaeter eine Datenbank, ohne dass eine einzige
 * aufrufende Stelle davon etwas merkt.
 *
 * Der Weg dorthin ist bewusst kleinteilig: erst die Schicht, dann Modul fuer
 * Modul umgehaengt, jedes einzeln geprueft. Ein Umbau, der alles auf einmal
 * anfasst, verliert genau die Daten, um die es hier geht.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { DATEN_ORT } from '@/lib/datenOrt';

/**
 * Was ein Speicher koennen muss.
 *
 * Namen sind immer Pfade unterhalb des Datenordners, mit Schraegstrichen und
 * ohne fuehrenden Schraegstrich: `konten.json`, `replays/s39/w1/_aggregat.json`.
 * Wie daraus ein Ort wird, ist Sache des jeweiligen Speichers.
 */
export interface Speicher {
  /** Der Inhalt, oder null wenn es ihn nicht gibt. */
  lies(name: string): Promise<Buffer | null>;
  schreib(name: string, daten: Buffer): Promise<void>;
  loesche(name: string): Promise<void>;
  /** Die Namen unterhalb eines Ordners - nur eine Ebene, wie readdir. */
  liste(ordner: string): Promise<string[]>;
  /** Groesse und Aenderungszeit, oder null. */
  angaben(name: string): Promise<{ groesse: number; geaendert: Date } | null>;
}

/* ------------------------------------------------------------ Der Ordner */

/**
 * Der Speicher, den es bisher gab: Dateien neben dem Programm.
 *
 * Er bleibt die Voreinstellung. Wer CompHub auf einem eigenen Rechner laufen
 * laesst - so wie heute -, merkt von der ganzen Schicht nichts.
 */
export const ordnerSpeicher: Speicher = {
  async lies(name) {
    try {
      return await fs.readFile(ort(name));
    } catch {
      return null;
    }
  },

  async schreib(name, daten) {
    const ziel = ort(name);
    await fs.mkdir(path.dirname(ziel), { recursive: true });
    /*
     * Erst daneben schreiben, dann umbenennen.
     *
     * Ein Absturz mitten im Schreiben hinterlaesst sonst eine halbe Datei -
     * und eine halbe konten.json ist schlimmer als eine alte. Das Umbenennen
     * geschieht im Dateisystem in einem Zug.
     */
    const vorlaeufig = `${ziel}.${process.pid}.neu`;
    await fs.writeFile(vorlaeufig, daten);
    await fs.rename(vorlaeufig, ziel);
  },

  async loesche(name) {
    try { await fs.unlink(ort(name)); } catch { /* schon weg ist auch recht */ }
  },

  async liste(ordner) {
    try {
      return await fs.readdir(ort(ordner));
    } catch {
      return [];
    }
  },

  async angaben(name) {
    try {
      const s = await fs.stat(ort(name));
      return { groesse: s.size, geaendert: s.mtime };
    } catch {
      return null;
    }
  },
};

/**
 * Aus einem Namen einen Pfad machen - und dabei aufpassen.
 *
 * Ein Name wie `../.env.local` wuerde sonst aus dem Datenordner
 * herausfuehren. Das kaeme heute aus keiner Stelle im Werkzeug, aber diese
 * Schicht wird kuenftig von vielen Stellen benutzt, und eine davon wird
 * irgendwann einen Namen von aussen durchreichen.
 */
function ort(name: string): string {
  const sauber = String(name).replace(/\\/g, '/').replace(/^\/+/, '');
  const voll = path.resolve(DATEN_ORT, sauber);
  const wurzel = path.resolve(DATEN_ORT);
  if (voll !== wurzel && !voll.startsWith(wurzel + path.sep)) {
    throw new Error(`Name fuehrt aus dem Datenordner heraus: ${name}`);
  }
  return voll;
}

/* ----------------------------------------------------------- Die Auswahl */

/**
 * Welcher Speicher gilt.
 *
 * Ueber COMPHUB_ABLAGE umschaltbar, damit derselbe Stand auf dem eigenen
 * Rechner mit Dateien und in der Cloud mit einer Datenbank laufen kann - ohne
 * zwei Zweige und ohne dass jemand vor dem Aufspielen etwas umstellen muss.
 *
 * Der Ordner bleibt die Voreinstellung. Auf "supabase" umzustellen ist eine
 * bewusste Entscheidung und soll nie versehentlich geschehen - schon gar
 * nicht dadurch, dass zufaellig ein Schluessel in der Umgebung steht.
 *
 * Geladen wird der andere Speicher traege, erst wenn er gebraucht wird: so
 * zieht ein Rechner, der mit Dateien laeuft, den Supabase-Teil gar nicht
 * erst herein.
 */
let gewaehlt: Speicher | null = null;

export const speicher: Speicher = {
  lies: (n) => waehle().lies(n),
  schreib: (n, d) => waehle().schreib(n, d),
  loesche: (n) => waehle().loesche(n),
  liste: (o) => waehle().liste(o),
  angaben: (n) => waehle().angaben(n),
};

function waehle(): Speicher {
  if (gewaehlt) return gewaehlt;
  if ((process.env.COMPHUB_ABLAGE || '').toLowerCase() === 'supabase') {
    // Erst hier hereingeholt - siehe oben.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { supabaseSpeicher } = require('@/lib/ablageSupabase') as
      { supabaseSpeicher: Speicher };
    gewaehlt = supabaseSpeicher;
  } else {
    gewaehlt = ordnerSpeicher;
  }
  return gewaehlt;
}

/* -------------------------------------------------- Bequeme Kurzformen */

/**
 * Eine JSON-Datei lesen.
 *
 * Fehlt sie oder ist sie unlesbar, kommt der Standard zurueck. Bewusst
 * dieselbe Nachsicht wie an den heutigen Stellen: eine kaputte Datei darf
 * eine Seite nicht mit einem Fehler beenden, sondern soll sie leer zeigen.
 */
export async function liesJson<T>(name: string, standard: T): Promise<T> {
  const roh = await speicher.lies(name);
  if (!roh) return standard;
  try {
    return JSON.parse(roh.toString('utf8')) as T;
  } catch {
    return standard;
  }
}

/** Eine JSON-Datei schreiben - in derselben Form wie bisher, mit Einrueckung. */
export async function schreibJson(name: string, wert: unknown): Promise<void> {
  await speicher.schreib(name, Buffer.from(JSON.stringify(wert, null, 1), 'utf8'));
}
