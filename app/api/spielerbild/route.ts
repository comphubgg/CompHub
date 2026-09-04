import { NextResponse } from 'next/server';
import { bilder } from '@/lib/epicCups';
import { namensSchluessel } from '@/lib/homoglyph';

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
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const name = (new URL(request.url).searchParams.get('name') ?? '').trim();
  if (!name) return NextResponse.json({ img: null });

  const b = await bilder();

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

  return NextResponse.json({
    img: treffer ? `/spielerbilder/${encodeURIComponent(treffer.file)}` : null,
  });
}
