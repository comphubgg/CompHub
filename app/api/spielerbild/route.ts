import { NextResponse } from 'next/server';
import { bilder } from '@/lib/epicCups';
import { namensSchluessel } from '@/lib/homoglyph';
import { zwischenspeichern } from '@/lib/zwischenspeicher';

import { spielerbildGross } from '@/lib/spielerbildKlein';
/*
 * Das Foto zu einem Namen.
 *
 * Wozu es das gibt: im Overlay traegt der Betreiber unter "Displayed name"
 * den Namen ein, unter dem er einen Spieler kennt - "Mrsavage" statt
 * "XSET ØØ8", "tjino" statt "hvk tjino 1ǃ". Das Foto kam trotzdem nicht,
 * weil es an der Konto-Id des Turniereintrags haengt und dort keines
 * hinterlegt war. Seine Erwartung dazu: "wenn ich den richtigen Namen
 * eingebe und es dazu ein Bild gibt, dann soll es auch geladen werden."
 *
 * Genau das macht diese Schnittstelle: sie sucht ausschliesslich ueber den
 * Namen und ist der zweite Anlauf, nachdem die Konto-Id nichts ergeben hat.
 * Sie erfindet nichts - gibt es keine passende Datei, kommt null zurueck.
 *
 *   GET ?name=Mrsavage   ->  { img: "/spielerbilder/mrsavage.jpg" }
 *   POST { namen: ["Mrsavage", "tjino", ...] }  ->  { bilder: { "Mrsavage": "/spielerbilder/mrsavage.jpg", "tjino": null } }   (hoechstens 200 Namen; fuer die Tierlist mit Fotos)
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Fotos = Awaited<ReturnType<typeof bilder>>;

/** Das Foto zu einem Namen - null, wenn es keines gibt. */
function finde(b: Fotos, name: string): string | null {

  /*
   * Zuerst genau, dann grosszuegig.
   *
   * Ein Dateiname wie "pollo.jpg" darf nicht auf "pollo 9" von jemand
   * anderem passen, solange es eine genaue Entsprechung gibt. Deshalb erst
   * der Vergleich ueber den bereinigten Namen, und nur wenn der nichts
   * findet, der alte Weg ueber das Enthaltensein - dort stehen die
   * laengsten Schluessel vorn, damit "pollo 9" vor "pollo" greift.
   */
  const schluessel = namensSchluessel(name);
  const genau = b.players.find((p) => namensSchluessel(p.key) === schluessel);
  const treffer = genau
    ?? b.players.find((p) => name.toLowerCase().includes(p.key));
  return treffer ? spielerbildGross(treffer.file) : null;
}

async function holeRoh(request: Request) {
  const name = (new URL(request.url).searchParams.get('name') ?? '').trim();
  if (!name) return NextResponse.json({ img: null });
  return NextResponse.json({ img: finde(await bilder(), name) });
}

/** Mehrere Namen auf einmal: die Tierlist mit Fotos fragt je Seite einmal, nicht je Kachel. */
export async function POST(request: Request) {
  const k = await request.json().catch(() => ({})) as { namen?: unknown };
  const namen = Array.isArray(k.namen) ? k.namen.filter((n): n is string => typeof n === 'string').map((n) => n.trim()).filter(Boolean).slice(0, 200) : [];
  if (!namen.length) return NextResponse.json({ bilder: {} });
  const b = await bilder();
  const aus: Record<string, string | null> = {};
  for (const n of namen) aus[n] = finde(b, n);
  return NextResponse.json({ bilder: aus }, { headers: { 'Cache-Control': 'private, max-age=300' } });
}

/** Fuer alle gleich - Vercels Zwischenspeicher beantwortet Wiederholungen (lib/zwischenspeicher). */
export async function GET(request: Request) {
  return zwischenspeichern(await holeRoh(request), 3600);
}
