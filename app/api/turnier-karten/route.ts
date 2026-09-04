import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { schreibGrund } from '@/lib/schreibfehler';
import { werSchreibt, darfKarteAendern } from '@/lib/werSchreibt';
import { DATEN_ORT } from '@/lib/datenOrt';

// Ablage der Turnierkarten: Spots samt zugeordneten Teams.
//
//   GET                  -> alle Karten
//   GET ?id=...          -> eine Karte
//   POST { karte }       -> anlegen oder ueberschreiben
//   DELETE ?id=...       -> loeschen
//
// Lesen darf jeder, aendern nur ein Admin. Die drei schreibenden Wege standen
// lange offen - was niemandem auffiel, solange nur der Betreiber die
// Kartenseite kannte. Wer sich selbst auf der Karte setzen will, nimmt
// /api/turnier-karten/mich; dort ist genau das erlaubt und sonst nichts.

export interface Spot {
  id: string;
  /** Ein Rechteck entsteht aus zwei Ecken, ein Polygon traegt seine Punkte selbst. */
  form: 'rechteck' | 'polygon';
  punkte: Array<{ x: number; y: number }>;   // Prozent auf dem Kartenbild
  name?: string;
  teams: string[];                            // Team-Ids
}

export interface KartenTeam {
  id: string;
  spieler: string[];
  farbe: string;
  /** Epic-Konto-IDs in der Reihenfolge der Namen - Grundlage des Schluessels. */
  ids?: string[];
}

export interface Turnierkarte {
  id: string;
  titel: string;
  cupId?: string;
  cupTitel?: string;
  region?: string;
  /** Turnier und Spieltag, zu dem diese Karte gehoert. Darueber taucht bei
      den Events der Knopf "Karte anzeigen" auf. */
  eventId?: string;
  windowId?: string;
  /**
   * Fuer welche Spiele des Spieltags diese Karte gilt - etwa "Spiele 1-5".
   *
   * In manchen Turnieren wird ein Spieltag auf zwei verschiedenen Inseln
   * gespielt. Dann gehoeren zu einem Spieltag zwei Karten, und ohne diese
   * Angabe waere nicht zu erkennen, welche fuer welche Haelfte gilt.
   */
  spiele?: string;
  /** Welches Kartenbild - darueber unterscheiden sich zwei Karten eines Tages. */
  bildId?: string;
  /** Der Name des Kartenbildes, damit die Events-Seite ihn anzeigen kann. */
  bildTitel?: string;
  namenSichtbar: boolean;
  /** Gesperrt heisst: keine Aenderungen mehr, auch nicht als Admin. */
  gesperrt: boolean;
  spots: Spot[];
  teams: KartenTeam[];
  geaendert: number;
  oeffentlich: boolean;
}

const DATEI = path.join(DATEN_ORT, 'turnier-karten.json');

/*
 * Dieselben stabilen Team-Schluessel wie in der Kartenansicht.
 *
 * Gespeichert steht in einer aelteren Karte noch die Platznummer ("t18"); die
 * Ansicht hebt sie beim Laden anhand der mitgefuehrten Konto-IDs auf einen
 * Schluessel. Wer die Belegung nachfragt, bekommt sie deshalb in derselben
 * Sprache - sonst traegt der Abgleich Kennungen ein, die zu keinem Team der
 * Ansicht passen, und die Beschriftung verschwindet von der Karte.
 *
 * Faellt derselbe Schluessel auf zwei Teams (ein Konto in zwei Duos), bleiben
 * beide bei ihrer alten Kennung - genau wie in der Ansicht.
 */
function stabileIds(k: Turnierkarte): Map<string, string> {
  const schluessel = (ids?: string[]) => {
    const echte = (ids ?? []).filter(Boolean);
    return echte.length ? `k:${[...echte].sort().join('_')}` : null;
  };
  const zaehler = new Map<string, number>();
  for (const t of k.teams) {
    const sch = schluessel(t.ids);
    if (sch) zaehler.set(sch, (zaehler.get(sch) ?? 0) + 1);
  }
  const neu = new Map<string, string>();
  for (const t of k.teams) {
    const sch = schluessel(t.ids);
    neu.set(t.id, sch && zaehler.get(sch) === 1 ? sch : t.id);
  }
  return neu;
}

async function lies(): Promise<Turnierkarte[]> {
  try {
    return JSON.parse(await fs.readFile(DATEI, 'utf8')) as Turnierkarte[];
  } catch {
    return [];
  }
}

async function schreib(karten: Turnierkarte[]) {
  await fs.mkdir(path.dirname(DATEI), { recursive: true });
  await fs.writeFile(DATEI, JSON.stringify(karten, null, 2), 'utf8');
}

/**
 * Speichern und, wenn es schiefgeht, sagen warum.
 *
 * Ohne das stand auf der Seite nur "Speichern fehlgeschlagen" - der wahre
 * Grund (kein Schreibrecht im Programmordner) blieb im Serverprotokoll
 * stehen, das niemand aufmacht.
 */
async function schreibOderSage(karten: Turnierkarte[]) {
  try {
    await schreib(karten);
    return null;
  } catch (e) {
    return NextResponse.json(
      { error: schreibGrund(e, DATEI) }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const event = searchParams.get('event');
  const window_ = searchParams.get('window');
  const karten = await lies();

  if (id) {
    const k = karten.find((x) => x.id === id);
    if (!k) return NextResponse.json({ error: 'Unknown map' }, { status: 404 });
    /*
     * Nur die Belegung, ohne Formen, Teams und Namen.
     *
     * Die offene Karte fragt das alle paar Sekunden nach, damit ein Pro, der
     * sich woanders hinsetzt, sofort bei allen anderen wandert. Die ganze
     * Karte dafuer zu schicken waere ein Vielfaches an Daten fuer eine
     * Handvoll geaenderter Zeichen.
     */
    /*
     * Der Stand einer Karte, wie ihn eine offene Ansicht braucht.
     *
     * Die Ansicht fragt das im Takt von Sekunden nach, damit jede Aenderung
     * des Betreibers - ein Team umgesetzt, eine Form geloescht, ein Titel
     * geaendert - bei allen ankommt, ohne dass jemand neu laedt. Hat sich
     * seit dem mitgeschickten Stand nichts getan, geht nur diese eine Zeile
     * zurueck statt der ganzen Karte.
     */
    if (searchParams.get('nur') === 'stand') {
      const seit = Number(searchParams.get('seit') ?? 0);
      if (seit && seit === k.geaendert) {
        return NextResponse.json({ geaendert: k.geaendert, unveraendert: true });
      }
      const stabil = stabileIds(k);
      return NextResponse.json({
        geaendert: k.geaendert,
        titel: k.titel,
        spiele: k.spiele ?? '',
        bildId: k.bildId ?? '',
        gesperrt: k.gesperrt ?? false,
        teams: k.teams.map((t) => ({ ...t, id: stabil.get(t.id) ?? t.id })),
        spots: k.spots.map((sp) => ({
          ...sp, teams: sp.teams.map((t) => stabil.get(t) ?? t),
        })),
      });
    }
    return NextResponse.json(k);
  }

  // Gibt es zu diesem Spieltag eine Karte? Die Events-Seite fragt so nach.
  if (event && window_) {
    const treffer = karten.filter((k) =>
      k.eventId === event && k.windowId === window_ && k.oeffentlich);
    return NextResponse.json({ karten: treffer });
  }
  // Neueste zuerst - beim Speichern ist das die, an der gerade gearbeitet wurde.
  return NextResponse.json({ karten: karten.sort((a, b) => b.geaendert - a.geaendert) });
}

/** Ein Nein mit Grund - dreimal gebraucht, einmal geschrieben. */
async function nurAdmin() {
  if (darfKarteAendern(await werSchreibt())) return null;
  return NextResponse.json(
    { error: 'Only an admin can change maps.' }, { status: 403 });
}

export async function POST(request: Request) {
  const abgewiesen = await nurAdmin();
  if (abgewiesen) return abgewiesen;
  const eingang = await request.json() as Partial<Turnierkarte>;
  if (!eingang.id || !eingang.titel) {
    return NextResponse.json({ error: 'id und titel fehlen' }, { status: 400 });
  }

  const karte: Turnierkarte = {
    id: eingang.id,
    titel: eingang.titel,
    cupId: eingang.cupId,
    cupTitel: eingang.cupTitel,
    region: eingang.region,
    eventId: eingang.eventId,
    windowId: eingang.windowId,
    // Diese drei fehlten hier: das Kartenbild wurde beim Speichern
    // stillschweigend verworfen. Dadurch wusste keine gespeicherte Karte
    // mehr, auf welcher Insel sie liegt.
    bildId: eingang.bildId,
    bildTitel: eingang.bildTitel,
    spiele: eingang.spiele,
    namenSichtbar: eingang.namenSichtbar ?? true,
    gesperrt: eingang.gesperrt ?? false,
    spots: eingang.spots ?? [],
    teams: eingang.teams ?? [],
    geaendert: Date.now(),
    oeffentlich: eingang.oeffentlich ?? false,
  };

  const karten = await lies();
  const i = karten.findIndex((x) => x.id === karte.id);
  if (i >= 0) karten[i] = karte; else karten.push(karte);
  const schiefgegangen = await schreibOderSage(karten);
  if (schiefgegangen) return schiefgegangen;
  return NextResponse.json({ ok: true, karte });
}

/**
 * Eine Karte oeffentlich zeigen oder verstecken.
 *
 * Bewusst kein Loeschen: eine versteckte Karte behaelt Formen und Zuordnung
 * und laesst sich jederzeit wieder hervorholen. Weg ist sie nur, wenn sie
 * ausdruecklich geloescht wird.
 *
 *   PATCH { id, oeffentlich }
 */
export async function PATCH(request: Request) {
  const abgewiesen = await nurAdmin();
  if (abgewiesen) return abgewiesen;
  const { id, oeffentlich } = await request.json() as
    { id?: string; oeffentlich?: boolean };
  if (!id || typeof oeffentlich !== 'boolean') {
    return NextResponse.json({ error: 'id und oeffentlich sind noetig' }, { status: 400 });
  }

  const karten = await lies();
  const k = karten.find((x) => x.id === id);
  if (!k) return NextResponse.json({ error: 'Unknown map' }, { status: 404 });

  k.oeffentlich = oeffentlich;
  const schiefgegangen = await schreibOderSage(karten);
  if (schiefgegangen) return schiefgegangen;
  return NextResponse.json({ ok: true, karte: k });
}

export async function DELETE(request: Request) {
  const abgewiesen = await nurAdmin();
  if (abgewiesen) return abgewiesen;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id fehlt' }, { status: 400 });
  const karten = await lies();
  const rest = karten.filter((x) => x.id !== id);
  if (rest.length === karten.length) {
    return NextResponse.json({ error: 'Unknown map' }, { status: 404 });
  }
  const schiefgegangen = await schreibOderSage(rest);
  if (schiefgegangen) return schiefgegangen;
  return NextResponse.json({ ok: true });
}
