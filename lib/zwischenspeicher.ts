/*
 * Oeffentliche Antworten in Vercels Zwischenspeicher legen.
 *
 * Am 27.9.2026 hat Vercel die ganze Seite gesperrt: die vier Stunden
 * Rechenzeit im Monat, die der kostenlose Tarif erlaubt, waren aufgebraucht.
 * Einen grossen Teil davon kosteten Antworten, die fuer alle gleich sind -
 * Leaderboards, Cup-Daten, Overlay-Einstellungen -, aber von jedem offenen
 * Tab und jedem OBS-Overlay alle paar Sekunden neu gerechnet wurden.
 *
 * Mit diesem Kopf beantwortet Vercels Netz dieselbe Frage fuer alle aus dem
 * Speicher und weckt die Funktion hoechstens einmal je Frist und Region.
 * Der Browser bekommt davon nichts mit (sein Cache-Control bleibt, wie die
 * Route es setzt). Nur fuer Antworten ohne Bezug zum Besucher - nie fuer
 * etwas, das vom Konto oder Admin-Cookie abhaengt.
 */
export function zwischenspeichern(antwort: Response, sekunden: number): Response {
  if (antwort.status !== 200) return antwort;
  const wert = `max-age=${sekunden}, stale-while-revalidate=${sekunden * 6}`;
  try {
    antwort.headers.set('Vercel-CDN-Cache-Control', wert);
    return antwort;
  } catch {
    // Unveraenderliche Koepfe (durchgereichte Antwort): neu verpacken.
    const koepfe = new Headers(antwort.headers);
    koepfe.set('Vercel-CDN-Cache-Control', wert);
    return new Response(antwort.body, { status: antwort.status, statusText: antwort.statusText, headers: koepfe });
  }
}
