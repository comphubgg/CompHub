import { NextResponse } from 'next/server';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import fs from '@/lib/ablageFs';
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
  /** Der MVP der Prognose - ein Spielername, frei gewaehlt. */
  mvp?: string;

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
  /**
   * Von Hand ergaenzte Teams - "Add a Duo" auf der Prognoseseite. Fuer einen
   * Cup, der noch nicht gespielt ist, gibt es keine Bestenliste, aus der
   * das Feld kaeme; wer sich qualifiziert hat, traegt der Betreiber ein.
   */
  manuell?: Array<{
    key: string; namen: string[]; ids: string[];
    herkunft: string[]; besterPlatz: number; region: string;
  }>;
  /**
   * Das Feld als Schnappschuss - seit dem 22.9.2026.
   *
   * Vorher holte jede Ansicht das Feld frisch aus den Bestenlisten der
   * Quellen. Seit das Feld aus Epics Marken kommt (lib/prognoseFeld), ist
   * die Bestenliste nicht mehr die ganze Wahrheit: wer abgesagt hat, fehlt.
   * Und ein LAN hat gar keine Quelle. Was beim Speichern im Feld stand,
   * steht deshalb hier - so bleibt eine Prognose auch dann lesbar, wenn
   * Epic die Vorrunde laengst nicht mehr liefert.
   */
  feld?: PrognoseTeam[];
  /** Das Finale, fuer das die Prognose gilt. */
  ziel?: {
    cupId: string; eventId: string; windowId: string; region: string;
    begin: number; name: string;
  };
  geaendert: number;
  oeffentlich: boolean;
}

export interface PrognoseTeam {
  key: string; namen: string[]; ids: string[];
  herkunft: string[]; besterPlatz: number; region: string;
}

/** Ein Team, wie es von der Oberflaeche kommt - nur die bekannten Felder, alles als Text. */
function teamSauber(t: unknown): PrognoseTeam | null {
  if (!t || typeof t !== 'object') return null;
  const o = t as Record<string, unknown>;
  const texte = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x ?? '').slice(0, 80)) : []);
  if (typeof o.key !== 'string' || !o.key) return null;
  return {
    key: o.key.slice(0, 200),
    namen: texte(o.namen), ids: texte(o.ids), herkunft: texte(o.herkunft).slice(0, 12),
    besterPlatz: Number(o.besterPlatz) || 0,
    region: typeof o.region === 'string' ? o.region.slice(0, 8) : '',
  };
}

async function lies(): Promise<Prognose[]> {
  try {
    return JSON.parse(await fs.readFile(DATEI, 'utf8')) as Prognose[];
  } catch {
    return [];
  }
}

/*
 * Lesen, um danach zu schreiben: hier ist ein Fehler kein "leer". Sonst
 * legte ein Speichern waehrend eines Ausfalls der Ablage eine Liste ab, in
 * der nur noch der neue Eintrag steht. Nur eine fehlende Datei gilt als leer.
 */
async function liesZumSchreiben(): Promise<Prognose[]> {
  let roh: string;
  try {
    roh = await fs.readFile(DATEI, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return [];
    throw e;
  }
  return JSON.parse(roh) as Prognose[];
}

const NICHT_GESPEICHERT = () => NextResponse.json({
  error: 'Storage is not answering right now - nothing was saved. Try again in a moment.',
}, { status: 503 });

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
  // Nur der Betreiber schreibt Prognosen - die Seite ist oeffentlich lesbar.
  if (!await istAdminAnfrage(request)) {
    return NextResponse.json({ error: 'nur fuer den Betreiber' }, { status: 403 });
  }
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
    manuell: eingang.manuell ?? [],
    feld: Array.isArray(eingang.feld)
      ? eingang.feld.map(teamSauber).filter((t): t is PrognoseTeam => t !== null).slice(0, 200)
      : undefined,
    ziel: eingang.ziel && typeof eingang.ziel === 'object' && typeof eingang.ziel.windowId === 'string'
      ? {
        cupId: String(eingang.ziel.cupId ?? '').slice(0, 120),
        eventId: String(eingang.ziel.eventId ?? '').slice(0, 160),
        windowId: String(eingang.ziel.windowId).slice(0, 160),
        region: String(eingang.ziel.region ?? '').slice(0, 8),
        begin: Number(eingang.ziel.begin) || 0,
        name: String(eingang.ziel.name ?? '').slice(0, 80),
      }
      : undefined,
    mvp: typeof eingang.mvp === 'string' ? eingang.mvp.slice(0, 80) : undefined,
    geaendert: Date.now(),
    oeffentlich: eingang.oeffentlich ?? false,
  };

  let alle: Prognose[];
  try { alle = await liesZumSchreiben(); } catch { return NICHT_GESPEICHERT(); }
  const i = alle.findIndex((p) => p.id === prognose.id);
  if (i >= 0) alle[i] = prognose; else alle.push(prognose);
  try { await schreib(alle); } catch { return NICHT_GESPEICHERT(); }
  return NextResponse.json({ ok: true, prognose });
}

export async function DELETE(request: Request) {
  if (!await istAdminAnfrage(request)) {
    return NextResponse.json({ error: 'nur fuer den Betreiber' }, { status: 403 });
  }
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id fehlt' }, { status: 400 });
  let alle: Prognose[];
  try { alle = await liesZumSchreiben(); } catch { return NICHT_GESPEICHERT(); }
  try { await schreib(alle.filter((p) => p.id !== id)); } catch { return NICHT_GESPEICHERT(); }
  return NextResponse.json({ ok: true });
}
