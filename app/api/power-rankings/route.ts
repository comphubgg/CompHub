import { NextResponse } from 'next/server';
import { LISTE, erneuereImHintergrund, istAlt, lies } from '@/lib/powerRankings';
import { gefaltet, namensSchluessel } from '@/lib/homoglyph';

// Die Power Rankings, seitenweise.
//
// Epic fuehrt eine einzige weltweite Liste - keine Regionen (siehe
// lib/powerRankings.ts). Die Daten liegen als Datei; ist der Stand aelter als
// der letzte Ein-Uhr-Termin, wird im Hintergrund erneuert und die Seite zeigt
// derweil den vorhandenen. Einen Knopf dafuer gibt es bewusst nicht.
//
//   GET ?page=1&pageSize=50&q=name
//
// Ohne Suchbegriff kommt die verlangte Seite; mit Suchbegriff wird die ganze
// Liste durchsucht, damit ein Spieler auf Platz viertausend auch gefunden wird.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const seite = Math.max(1, parseInt(p.get('page') || '1', 10) || 1);
  const proSeite = Math.min(200, Math.max(10, parseInt(p.get('pageSize') || '50', 10) || 50));
  const suche = (p.get('q') || '').trim().toLowerCase();

  try {
    const stand = await lies(LISTE);

    if (!stand || !stand.spieler.length) {
      // Noch nichts da: den Lauf anstossen und sagen, dass es dauert. Warten
      // waere falsch - die Seite muss dafuer hundertmal aufgerufen werden.
      erneuereImHintergrund(LISTE);
      return NextResponse.json({
        success: true, page: 1, pageSize: proSeite, totalPages: 1,
        matched: 0, total: 0, fetchedAt: 0, players: [], holt: true,
      });
    }
    if (istAlt(stand)) erneuereImHintergrund(LISTE);

    /*
     * Nur die Plaetze, als kompakte Zuordnung ueber den Namensschluessel.
     *
     * Wozu: die Tierlist will ihre Liste danach ordnen, wer gerade der beste
     * Spieler ist. Dafuer die Rangliste seitenweise zu holen waeren fuenfzig
     * Abrufe fuer zehntausend Eintraege - hier ist es einer.
     *
     * Der Schluessel ist derselbe wie ueberall sonst, wo Namen zusammen-
     * gefuehrt werden: ohne Orgtag, ohne Startnummer, Fremdzeichen gefaltet.
     * Die Rangliste fuehrt keine Konto-Ids ("AG Scroll 10ǃ" statt einer
     * Kennung), der Name ist also das Einzige, woran sie haengt. Fuer eine
     * Reihenfolge genuegt das - fuer eine Flagge nicht, die bleibt an der
     * Konto-Id haengen.
     *
     * Steht ein Schluessel mehrfach, gilt der bessere Platz.
     */
    if (p.get('raenge') === '1') {
      const raenge: Record<string, number> = {};
      for (const s of stand.spieler) {
        const k = gefaltet(namensSchluessel(s.name || ''));
        if (!k) continue;
        if (raenge[k] === undefined || s.rank < raenge[k]) raenge[k] = s.rank;
      }
      return NextResponse.json({
        success: true, fetchedAt: stand.geholt, raenge,
      });
    }

    const alle = stand.spieler;
    const gefiltert = suche
      ? alle.filter((s) => s.name.toLowerCase().includes(suche))
      : alle;

    const seiten = Math.max(1, Math.ceil(gefiltert.length / proSeite));
    const jetzt = Math.min(seite, seiten);

    return NextResponse.json({
      success: true,
      page: jetzt,
      pageSize: proSeite,
      totalPages: seiten,
      matched: gefiltert.length,
      total: alle.length,
      fetchedAt: stand.geholt,
      players: gefiltert.slice((jetzt - 1) * proSeite, jetzt * proSeite),
    });
  } catch (fehler) {
    return NextResponse.json(
      { success: false, error: (fehler as Error).message },
      { status: 500 },
    );
  }
}
