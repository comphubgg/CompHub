import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { DATEN_ORT } from '@/lib/datenOrt';

// Prognosen: wer landet am Ende auf welchem Platz?
//
// Eine Prognose gehoert zu einem Cup und zieht ihr Teilnehmerfeld aus einem
// oder mehreren Spieltagen. Mehrere deshalb, weil sich ein Finalfeld oft aus
// den Qualifizierten mehrerer Vortage zusammensetzt - etwa die besten sieben
// aus Tag 1, die besten sieben aus Tag 2 und die besten sechs aus Tag 3.
//
// Gespeichert wird nur, was sich nicht wieder ausrechnen laesst: welche
// Spieltage herangezogen werden, wie weit jeweils gezaehlt wird, und die
// Reihenfolge selbst. Das Teilnehmerfeld holt die Oberflaeche jedes Mal frisch
// von Epic - so steht bei einem laufenden Cup nie ein veralteter Stand da.
//
//   GET                 -> alle Prognosen
//   GET ?id=…           -> eine
//   POST { prognose }   -> anlegen oder ueberschreiben
//   DELETE ?id=…        -> entfernen

const DATEI = path.join(DATEN_ORT, 'prognosen.json');

interface Punkt { x: number; y: number }

/** Eine Flaeche auf der Karte, so wie sie beim Speichern aussah. */
export interface Spot {
  id: string;
  form: string;
  punkte: Punkt[];
  name?: string;
  farbe?: string;
}

/** Ein Spieltag, aus dem Teilnehmer kommen. */
export interface Quelle {
  eventId: string;
  windowId: string;
  region: string;
  /** Beschriftung fuer die Oberflaeche, etwa "Tag 1 · 19.08." */
  titel: string;
  /**
   * Wie viele Plaetze von oben zaehlen. Null heisst: alle.
   *
   * Damit bildet man die Qualifikation ab - "die besten sieben kommen weiter"
   * wird zu topN = 7.
   */
  topN: number | null;
}

/**
 * Eine Karte innerhalb einer Prognose.
 *
 * Ein Spieltag kann auf mehreren Karten gespielt werden - bei der Reload
 * Elite Series etwa fuenf Runden auf Slurpush und fuenf auf Stronghold. Die
 * erwartete Reihenfolge ist dabei dieselbe, nur die Karte darunter wechselt.
 * Deshalb haengen Bild, Formen und Zuordnung hier und nicht an der Prognose:
 * die Reihenfolge wird einmal gepflegt, die Karten so oft wie noetig.
 */
export interface PrognoseKarte {
  id: string;
  /** Leer heisst: die oeffentliche Fortnite-Insel. */
  bildId: string;
  /** Wie sie in dieser Prognose heisst - frei benennbar. */
  titel: string;
  /** Die Formen als Schnappschuss, nicht als Verweis auf die Vorlage. */
  spots: Spot[];
  /** Welche Teams auf welcher Form stehen. */
  aufSpot: Record<string, string[]>;
}

export interface Prognose {
  id: string;
  titel: string;
  cupId: string;
  cupTitel: string;
  /** Freie Beschriftung der Gruppe oder Karte, etwa "Group A · Slurpush". */
  gruppe?: string;
  /**
   * Bis zu welchem Platz gilt "weiter" - diese Plaetze werden hervorgehoben.
   *
   * Bei einem Qualifikationstag sind das die Aufsteiger ("die besten sechs"),
   * bei einem Finale steht hier 1, dann leuchtet nur der Sieger.
   */
  qualiBis: number;
  quellen: Quelle[];
  /**
   * Die Reihenfolge. Der Index ist der Platz minus eins, der Wert der
   * Schluessel des Teams - leer heisst: dieser Platz ist noch offen.
   */
  plaetze: Array<string | null>;

  /**
   * Die Karten dieser Prognose, in der Reihenfolge der Runden.
   *
   * Aeltere Eintraege haben stattdessen die Einzelfelder darunter; die
   * Oberflaeche rechnet sie beim Laden in eine einzelne Karte um.
   */
  karten?: PrognoseKarte[];

  /* -------------------------------- Die eine Karte - aeltere Schreibweise */

  /**
   * Welches Kartenbild gehoert zu dieser Prognose?
   *
   * Beim Speichern wird die Karte festgelegt. Danach laesst sie sich nicht
   * mehr wechseln - eine Prognose gilt fuer ein bestimmtes Turnier auf einer
   * bestimmten Karte, und ein Wechsel wuerde jede Zuordnung entwerten.
   */
  bildId?: string;
  /** Wie die Karte hier heissen soll. Frei benennbar, auch nachtraeglich. */
  kartenTitel?: string;
  /**
   * Die Formen als Schnappschuss.
   *
   * Bewusst als Kopie und nicht als Verweis auf die gemeinsame Vorlage:
   * wird dort spaeter eine Flaeche verschoben, soll eine abgelegte Prognose
   * genau so bleiben, wie sie gespeichert wurde.
   */
  spots?: Spot[];
  /** Welche Teams auf welcher Form stehen - Form-Kennung zu Team-Schluesseln. */
  aufSpot?: Record<string, string[]>;
  geaendert: number;
  oeffentlich: boolean;
}

async function lies(): Promise<Prognose[]> {
  try {
    return JSON.parse(await fs.readFile(DATEI, 'utf8')) as Prognose[];
  } catch {
    return [];
  }
}

async function schreib(liste: Prognose[]) {
  await fs.mkdir(path.dirname(DATEI), { recursive: true });
  await fs.writeFile(DATEI, JSON.stringify(liste, null, 2), 'utf8');
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  const alle = await lies();
  if (id) {
    const eine = alle.find((p) => p.id === id);
    if (!eine) return NextResponse.json({ error: 'unbekannt' }, { status: 404 });
    return NextResponse.json({ prognose: eine });
  }
  return NextResponse.json({
    prognosen: alle.sort((a, b) => b.geaendert - a.geaendert),
  });
}

export async function POST(request: Request) {
  const eingang = await request.json() as Partial<Prognose>;
  if (!eingang.id || !eingang.titel) {
    return NextResponse.json({ error: 'id und titel fehlen' }, { status: 400 });
  }

  const prognose: Prognose = {
    id: eingang.id,
    titel: eingang.titel,
    cupId: eingang.cupId ?? '',
    cupTitel: eingang.cupTitel ?? '',
    gruppe: eingang.gruppe,
    qualiBis: eingang.qualiBis ?? 0,
    quellen: eingang.quellen ?? [],
    plaetze: eingang.plaetze ?? [],
    karten: eingang.karten ?? [],
    // Die alten Einzelfelder werden nicht mehr geschrieben: was hier
    // ankommt, steht vollstaendig in "karten". Beim Lesen kommen sie noch
    // vor, deshalb bleiben sie im Typ.
    bildId: eingang.bildId,
    kartenTitel: eingang.kartenTitel,
    spots: eingang.spots,
    aufSpot: eingang.aufSpot,
    geaendert: Date.now(),
    oeffentlich: eingang.oeffentlich ?? false,
  };

  const alle = await lies();
  const i = alle.findIndex((p) => p.id === prognose.id);
  if (i >= 0) alle[i] = prognose; else alle.push(prognose);
  await schreib(alle);
  return NextResponse.json({ ok: true, prognose });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id fehlt' }, { status: 400 });
  const alle = await lies();
  await schreib(alle.filter((p) => p.id !== id));
  return NextResponse.json({ ok: true });
}
