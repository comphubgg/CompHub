import { NextResponse } from 'next/server';
import fs from '@/lib/ablageFs';
import path from 'path';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import { DATEN_ORT } from '@/lib/datenOrt';

/*
 * Wen der Betreiber aus der Tierlist genommen hat.
 *
 * Das Loeschen eines Eintrags wirkte bisher nur dort, wo geklickt wurde. Jede
 * Tierlist gehoert einem Konto und wird als Ganzes gespeichert; ein Duo, das
 * der Betreiber bei sich entfernt hatte, stand bei allen anderen weiter in
 * ihrer eigenen Liste. Verlangt war das Gegenteil: "Wenn ich die loesche,
 * sollen die auf allen anderen Accounts auch weg sein."
 *
 * Deshalb liegt hier eine gemeinsame Liste der entfernten Eintraege. Jede
 * Ansicht holt sie beim Laden und blendet aus, was darin steht - unabhaengig
 * davon, in wessen gespeicherter Liste der Eintrag noch herumliegt.
 *
 * Geschluesselt wird ueber denselben zusammengezogenen Namen, mit dem die
 * Tierlist ohnehin arbeitet (getSoloKey / getDuoKey). Konto-Ids waeren
 * genauer, aber selbst angelegte Spieler haben keine - und gerade die will
 * man wieder loswerden koennen.
 *
 * Ausgeblendet statt geloescht, aus demselben Grund wie bei den versteckten
 * Konten: eine Zeile hier laesst sich zuruecknehmen, ein geloeschter
 * Datenbestand nicht.
 *
 *   GET                          -> welche Schluessel entfernt sind
 *   POST { schluessel, name? }   -> entfernen (nur Admin)
 *   DELETE ?schluessel=...       -> wieder zeigen (nur Admin)
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DATEI = path.join(DATEN_ORT, 'tierlist-entfernt.json');

interface Eintrag {
  /** Der zusammengezogene Name, wie ihn die Tierlist bildet. */
  schluessel: string;
  /** Nur zum Nachlesen, welcher Eintrag das war. */
  name?: string;
  wann: string;
}

/*
 * Nur "Datei gibt es noch nicht" heisst "nichts entfernt". Jeder andere
 * Lesefehler (Ablage nicht erreichbar, Datei unlesbar) wirft: sonst taucht
 * alles Entfernte wieder auf, und das naechste Entfernen wuerde die
 * gespeicherte Liste mit einer fast leeren ueberschreiben.
 */
async function lies(): Promise<Eintrag[]> {
  let roh: string;
  try {
    roh = await fs.readFile(DATEI, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return [];
    throw e;
  }
  const liste = JSON.parse(roh);
  if (!Array.isArray(liste)) throw new Error('tierlist-entfernt: keine Liste');
  return liste as Eintrag[];
}

/** Antwort bei Ausfall der Ablage: nie 5xx, aber klar als Ausfall markiert. */
function ausfall() {
  return NextResponse.json({ success: false, ausfall: true, error: 'Ablage nicht erreichbar' });
}

async function schreibe(liste: Eintrag[]) {
  await fs.mkdir(path.dirname(DATEI), { recursive: true });
  await fs.writeFile(DATEI, JSON.stringify(liste, null, 1), 'utf8');
}

export async function GET() {
  try {
    const liste = await lies();
    return NextResponse.json({
      success: true,
      schluessel: liste.map((e) => e.schluessel),
      entfernt: liste,
    });
  } catch {
    return NextResponse.json({ success: false, ausfall: true, error: 'Ablage nicht erreichbar', schluessel: [], entfernt: [] });
  }
}

export async function POST(request: Request) {
  if (!await istAdminAnfrage(request)) {
    return NextResponse.json({ error: 'nur fuer den Admin' }, { status: 403 });
  }
  const koerper = await request.json().catch(() => ({}));
  const schluessel = String(koerper.schluessel ?? '').trim();
  // Ein leerer Schluessel wuerde beim Vergleich auf jeden namenlosen Eintrag
  // passen und damit halbe Listen ausblenden.
  if (!schluessel) {
    return NextResponse.json({ error: 'kein Schluessel' }, { status: 400 });
  }

  try {
    const liste = await lies();
    if (!liste.some((e) => e.schluessel === schluessel)) {
      liste.push({
        schluessel,
        name: typeof koerper.name === 'string' ? koerper.name : undefined,
        wann: new Date().toISOString(),
      });
      await schreibe(liste);
    }
    return NextResponse.json({ success: true, anzahl: liste.length });
  } catch {
    return ausfall();
  }
}

export async function DELETE(request: Request) {
  if (!await istAdminAnfrage(request)) {
    return NextResponse.json({ error: 'nur fuer den Admin' }, { status: 403 });
  }
  const schluessel = new URL(request.url).searchParams.get('schluessel') ?? '';
  try {
    const liste = (await lies()).filter((e) => e.schluessel !== schluessel);
    await schreibe(liste);
    return NextResponse.json({ success: true, anzahl: liste.length });
  } catch {
    return ausfall();
  }
}
