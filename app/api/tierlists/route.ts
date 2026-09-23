import { NextRequest, NextResponse } from 'next/server';
import { werFragt, kennungFuerAblage } from '@/lib/werFragt';
import { nachId } from '@/lib/konten';
import fs from '@/lib/ablageFs';
import path from 'path';
import { DATEN_ORT } from '@/lib/datenOrt';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/*
 * Wo die Tierlist eines Kontos liegt.
 *
 * Frueher stand hier eine einzige Datei fuer alle: "tierlists.json". Wer die
 * Seite aufrief - angemeldet oder nicht -, sah denselben Stand und konnte ihn
 * ueberschreiben. Beim Umzug fiel auf, dass daraus acht Eintraege
 * verschwunden waren, weil jemand beim Ausprobieren geraeumt hatte.
 *
 * Der Betreiber hat die Regel danach klar gezogen: Tierlist-Eintraege sollen
 * "nie" gespeichert werden, "wenn dann nur auf deren Accounts, aber NIE fuer
 * jeden - egal ob Admin oder nicht Admin". Also je Konto eine eigene, und ohne
 * Konto wird nichts abgelegt.
 *
 * Die alte gemeinsame Datei bleibt liegen. Sie ist der Stand des Betreibers
 * und wird beim ersten Lesen einmalig in seine eigene uebernommen - geloescht
 * wird sie nicht, sie ist die Sicherung dieses Uebergangs.
 *
 * ---------------------------------------------------------------------------
 *
 * Am 23.9.2026 meldete der Betreiber: "Ich bin auf einem anderen Geraet und
 * ich sehe einfach keinen einzigen Spieler in der Tierlist, das ist ein
 * Disaster."
 *
 * Der Grund lag hier. Diese Datei sprach vorher mit einer Supabase-Tabelle
 * namens "tierlists" und holte daraus immer dieselbe Zeile (key = "shared") -
 * welches Konto fragte, war dem Abruf gleichgueltig. Im neuen
 * Supabase-Projekt gibt es diese Tabelle nicht mehr; jeder Abruf endete mit
 * "Could not find the table 'public.tierlists'" und fiel auf die Datei je
 * Konto zurueck. Die gab es noch nirgends, also kam eine leere Liste heraus.
 * Auf dem gewohnten Geraet fiel das nicht auf: dort lag der Stand im Browser.
 *
 * Jetzt fuehrt nur noch ein Weg hierher - die Ablage, je Konto eine Datei.
 * Und die einmalige Uebernahme des alten Standes gilt nicht mehr nur fuer den
 * VIP-Weg ("betreiber"), sondern auch fuer das Admin-Konto: der Betreiber
 * meldet sich laengst gewoehnlich an, und genau deshalb fand er seine
 * tausend Eintraege nicht wieder.
 */
const TIERLISTS_FILE = path.join(DATEN_ORT, 'tierlists.json');

function tierlistDatei(wer: string): string {
  return path.join(DATEN_ORT, 'tierlisten', `${kennungFuerAblage(wer)}.json`);
}

/** Gehoert dieser Kennung der alte gemeinsame Stand? */
async function istBetreiberKonto(wer: string): Promise<boolean> {
  if (wer === 'betreiber') return true;
  try {
    const konto = await nachId(wer);
    return konto?.rolle === 'admin';
  } catch {
    return false;
  }
}

async function leseDatei(datei: string) {
  try {
    const raw = await fs.readFile(datei, 'utf-8');
    const parsed = JSON.parse(raw || '{}');
    return {
      lists: Array.isArray(parsed.lists) ? parsed.lists : [],
      currentListId: parsed.currentListId ?? null,
    };
  } catch {
    return { lists: [], currentListId: null };
  }
}

/**
 * Die Tierlist dieses Kontos.
 *
 * Hat es noch keine, wird beim Betreiber einmalig der alte gemeinsame Stand
 * uebernommen - das ist seine Arbeit aus tausend Eintraegen, und sie soll
 * beim Umstellen nicht verschwinden. Alle anderen fangen leer an; die alte
 * Liste war nie ihre.
 */
async function readTierlistsFile(wer: string) {
  const eigen = await leseDatei(tierlistDatei(wer));
  if (eigen.lists.length) return eigen;

  if (await istBetreiberKonto(wer)) {
    const alt = await leseDatei(TIERLISTS_FILE);
    if (alt.lists.length) return alt;
  }
  return { lists: [], currentListId: null };
}

async function writeTierlistsFile(
  wer: string, lists: any[], currentListId: string | null,
) {
  const datei = tierlistDatei(wer);
  await fs.mkdir(path.dirname(datei), { recursive: true });
  await fs.writeFile(datei, JSON.stringify({ lists, currentListId }, null, 2), 'utf-8');
}

/*
 * Die Tierlist des Anfragenden - und nur seine.
 *
 * Wer nicht angemeldet ist, bekommt eine leere Liste. Nicht die eines
 * anderen, und schon gar nicht eine gemeinsame: eine Tierlist ist die
 * Einschaetzung eines Menschen, kein Bestand der Seite.
 *
 * "angemeldet" sagt der Seite, warum die Liste leer ist. Ohne diese Auskunft
 * sieht ein abgemeldeter Browser genauso aus wie ein leerer Stand, und in der
 * Ablage stand "All players assigned", wo "Melde dich an" hingehoert.
 */
export async function GET() {
  try {
    const wer = await werFragt();
    if (!wer) {
      return NextResponse.json({
        success: true, lists: [], currentListId: null, angemeldet: false,
      });
    }
    const data = await readTierlistsFile(wer);
    return NextResponse.json({
      success: true,
      lists: data.lists || [],
      currentListId: data.currentListId || null,
      angemeldet: true,
    });
  } catch (error: any) {
    console.error('tierlists GET error', error);
    return NextResponse.json(
      { success: false, error: error?.message || String(error) },
      { status: 500 }
    );
  }
}

/** Wie viele Eintraege, und wie viele davon eingestuft sind. */
function umfang(lists: any[]): { eintraege: number; gesetzt: number } {
  let eintraege = 0;
  let gesetzt = 0;
  for (const l of lists ?? []) {
    for (const e of (Array.isArray(l?.entries) ? l.entries : [])) {
      eintraege += 1;
      if (e?.tier) gesetzt += 1;
    }
  }
  return { eintraege, gesetzt };
}

/**
 * Sieht dieser Schreibvorgang nach einem Versehen aus?
 *
 * Anlass: ein Browser mit leerem Zwischenspeicher hat den gepflegten Stand
 * ueberschrieben - alle Einstufungen waren fort, die Eintraege noch da. Der
 * Schutz in der Seite greift nur bei einer voellig leeren Liste und half
 * deshalb nicht. Hier steht er dort, wo ihn kein Browser umgehen kann.
 *
 * Die Regel ist eng gefasst, damit sie normale Arbeit nicht behindert:
 * abgelehnt wird nur, wenn gleichzeitig Eintraege verschwinden UND keine
 * einzige Einstufung uebrig bleibt, obwohl vorher welche da waren. Ein
 * ausdrueckliches "Reset" laesst die Eintraege stehen und geht damit durch;
 * ein einzeln geloeschter Eintrag ebenso, weil dabei die Stufen bleiben.
 */
function wirktWieVersehen(neu: any[], alt: any[]): string | null {
  const a = umfang(alt);
  const n = umfang(neu);
  if (!a.eintraege) return null;

  if (a.gesetzt > 0 && n.gesetzt === 0 && n.eintraege < a.eintraege) {
    return `Der Stand haette ${a.gesetzt} Einstufungen verloren und dabei `
      + `${a.eintraege - n.eintraege} Eintraege - das sieht nach einem `
      + 'ueberschriebenen Zwischenspeicher aus und wurde nicht gespeichert.';
  }
  // Mehr als die Haelfte auf einmal fort: dasselbe Muster, andere Groesse.
  if (n.eintraege * 2 < a.eintraege) {
    return `Der Stand haette ${a.eintraege - n.eintraege} von ${a.eintraege} `
      + 'Eintraegen verloren und wurde nicht gespeichert.';
  }
  return null;
}

/*
 * Gespeichert wird nur auf ein Konto.
 *
 * Vorher schrieb dieser Weg eine gemeinsame Datei, und zwar ohne jede
 * Anmeldung: jeder Aufruf konnte den Stand aller ueberschreiben. Genau so
 * sind acht Eintraege verschwunden. Der Betreiber hat die Regel danach klar
 * gezogen - "nie fuer jeden, egal ob Admin oder nicht Admin".
 *
 * Ohne Konto wird deshalb nichts abgelegt, und zwar mit einer klaren Absage
 * statt eines stillen Nichtstuns: wer speichert, soll erfahren, dass es nicht
 * gespeichert wurde.
 */
export async function POST(request: NextRequest) {
  try {
    const wer = await werFragt();
    if (!wer) {
      return NextResponse.json(
        { success: false, error: 'Sign in to save your tier list.' },
        { status: 401 });
    }
    const body = await request.json();
    const lists = Array.isArray(body?.lists) ? body.lists : [];
    const currentListId = body?.currentListId ?? null;

    const bisher = await readTierlistsFile(wer);
    const einwand = wirktWieVersehen(lists, bisher.lists ?? []);
    if (einwand) {
      console.warn('tierlists POST abgelehnt:', einwand);
      return NextResponse.json({ success: false, error: einwand }, { status: 409 });
    }

    await writeTierlistsFile(wer, lists, currentListId);

    return NextResponse.json({
      success: true,
      lists,
      currentListId,
    });
  } catch (error: any) {
    console.error('tierlists POST error', error);
    return NextResponse.json(
      { success: false, error: error?.message || String(error) },
      { status: 500 }
    );
  }
}
