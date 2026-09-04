import { promises as fs } from 'fs';
import path from 'path';
import { DATEN_ORT } from '@/lib/datenOrt';

/*
 * Sagt Bescheid, sobald sich an den Gespraechen etwas getan hat.
 *
 * Vorher fragte das Chatfenster alle fuenf Sekunden nach - und wer gerade
 * hinsah, wartete trotzdem bis zu fuenf Sekunden auf eine Antwort, die schon
 * geschrieben war. Der Betreiber dazu: "wenn ich dann antworte, muss ich
 * sozusagen die Page neu laden, dass es erst angezeigt wird."
 *
 * Deshalb bleibt die Verbindung hier offen, und der Server meldet sich von
 * sich aus. Er sieht dafuer im Takt von 300 ms auf den Zeitstempel der Datei -
 * ein Blick ins Verzeichnis, kein Lesen. Erst wenn der sich bewegt hat, geht
 * eine Zeile hinaus, und das Fenster holt sich den neuen Stand.
 *
 * Verschickt wird bewusst nur ein Wink, nicht der Inhalt: wer welche
 * Gespraeche sehen darf, entscheidet die eigentliche Schnittstelle. Ein
 * offener Strom, der Nachrichten mitschickt, muesste dieselbe Pruefung noch
 * einmal fuehren - und zwei Stellen, die dasselbe entscheiden, laufen
 * irgendwann auseinander.
 *
 * Dasselbe Muster wie bei den Turnierkarten (siehe
 * app/api/turnier-karten/live/route.ts), aus denselben Gruenden.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DATEI = path.join(DATEN_ORT, 'kontakt.json');

/** So oft wird auf den Zeitstempel gesehen. */
const BLICK_MS = 300;
/** Damit Zwischenstellen die stille Verbindung nicht zumachen. */
const LEBENSZEICHEN_MS = 20_000;

export async function GET(request: Request) {
  const stroem = new ReadableStream<Uint8Array>({
    start(steuerung) {
      const kodierer = new TextEncoder();
      let offen = true;
      let zuletzt = -1;

      const sende = (nutzlast: string) => {
        if (!offen) return;
        try { steuerung.enqueue(kodierer.encode(nutzlast)); }
        catch { offen = false; }
      };

      const schauNach = async () => {
        if (!offen) return;
        try {
          const stand = await fs.stat(DATEI);
          if (stand.mtimeMs === zuletzt) return;
          const erste = zuletzt === -1;
          zuletzt = stand.mtimeMs;
          // Beim ersten Blick nichts schicken: das Fenster hat den Stand
          // gerade selbst geholt, ein sofortiger Wink waere eine Anfrage
          // fuer nichts.
          if (!erste) sende(`data: ${JSON.stringify({ stand: zuletzt })}\n\n`);
        } catch { /* Datei gerade im Schreiben: beim naechsten Blick wieder */ }
      };

      const uhr = setInterval(() => { void schauNach(); }, BLICK_MS);
      const puls = setInterval(() => sende(': ping\n\n'), LEBENSZEICHEN_MS);
      void schauNach();

      const schluss = () => {
        offen = false;
        clearInterval(uhr);
        clearInterval(puls);
        try { steuerung.close(); } catch { /* schon zu */ }
      };
      request.signal.addEventListener('abort', schluss);
    },
  });

  return new Response(stroem, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Ohne das puffern manche Zwischenstellen den Strom und die Ereignisse
      // kommen im Block statt einzeln.
      'X-Accel-Buffering': 'no',
    },
  });
}
