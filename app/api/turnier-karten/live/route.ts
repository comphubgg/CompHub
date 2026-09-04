import { promises as fs } from 'fs';
import path from 'path';
import { DATEN_ORT } from '@/lib/datenOrt';

/*
 * Der Stand einer Turnierkarte, sobald er sich aendert.
 *
 * Vorher fragte jede offene Ansicht alle fuenf Sekunden nach. Das reicht fuer
 * eine Zahl, die sich stuendlich bewegt, aber nicht fuer eine Karte, an der
 * jemand gerade arbeitet: der Betreiber nimmt ein Team von einer Form, und die
 * anderen sehen es erst Sekunden spaeter. Verlangt war "live, null Sekunden
 * Abstand, maximal eine Sekunde".
 *
 * Deshalb bleibt die Verbindung hier offen und der Server schickt von sich
 * aus, sobald sich etwas getan hat. Er sieht dafuer im Takt von 250 ms auf den
 * Zeitstempel der Datei - ein Blick ins Verzeichnis, kein Lesen. Erst wenn der
 * sich bewegt hat, wird die Karte gelesen und verschickt. Zusammen mit dem
 * halben Sekundchen, das das Selbstspeichern abwartet, liegt alles unter einer
 * Sekunde.
 *
 * Bewusst kein Websocket: hier fliesst nur in eine Richtung, und eine
 * Ereignisquelle bringt das Wiederverbinden nach einem Abbruch schon mit.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DATEI = path.join(DATEN_ORT, 'turnier-karten.json');

/** So oft wird auf den Zeitstempel gesehen. */
const BLICK_MS = 250;
/** Damit Zwischenstellen die stille Verbindung nicht zumachen. */
const LEBENSZEICHEN_MS = 20_000;

interface Team { id: string; ids?: string[] }
interface Spot { id: string; teams: string[] }
interface Karte {
  id: string; titel: string; spiele?: string; bildId?: string;
  gesperrt?: boolean; spots: Spot[]; teams: Team[]; geaendert: number;
}

/** Dieselben stabilen Schluessel wie in der Kartenansicht - siehe route.ts. */
function stabileIds(k: Karte): Map<string, string> {
  const schluessel = (ids?: string[]) => {
    const echte = (ids ?? []).filter(Boolean);
    return echte.length ? `k:${[...echte].sort().join('_')}` : null;
  };
  const zaehler = new Map<string, number>();
  for (const t of k.teams) {
    const s = schluessel(t.ids);
    if (s) zaehler.set(s, (zaehler.get(s) ?? 0) + 1);
  }
  const neu = new Map<string, string>();
  for (const t of k.teams) {
    const s = schluessel(t.ids);
    neu.set(t.id, s && zaehler.get(s) === 1 ? s : t.id);
  }
  return neu;
}

async function holeKarte(id: string): Promise<Karte | null> {
  try {
    const alle = JSON.parse(await fs.readFile(DATEI, 'utf8')) as Karte[];
    return alle.find((k) => k.id === id) ?? null;
  } catch {
    return null;
  }
}

function alsStand(k: Karte) {
  const stabil = stabileIds(k);
  return {
    geaendert: k.geaendert,
    titel: k.titel,
    spiele: k.spiele ?? '',
    bildId: k.bildId ?? '',
    gesperrt: k.gesperrt ?? false,
    teams: k.teams.map((t) => ({ ...t, id: stabil.get(t.id) ?? t.id })),
    spots: k.spots.map((sp) => ({
      ...sp, teams: sp.teams.map((t) => stabil.get(t) ?? t),
    })),
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return new Response('id fehlt', { status: 400 });

  const stroem = new ReadableStream<Uint8Array>({
    start(steuerung) {
      const kodierer = new TextEncoder();
      let offen = true;
      let zuletztGesehen = -1;
      let zuletztGesendet = -1;

      const sende = (nutzlast: string) => {
        if (!offen) return;
        try { steuerung.enqueue(kodierer.encode(nutzlast)); }
        catch { offen = false; }
      };

      const schauNach = async () => {
        if (!offen) return;
        try {
          // Nur der Zeitstempel. Die Datei zu lesen, solange sich nichts
          // getan hat, waere viermal je Sekunde eine Datei fuer nichts.
          const stand = await fs.stat(DATEI);
          const stempel = stand.mtimeMs;
          if (stempel === zuletztGesehen) return;
          zuletztGesehen = stempel;

          const k = await holeKarte(id);
          if (!k || k.geaendert === zuletztGesendet) return;
          zuletztGesendet = k.geaendert;
          sende(`data: ${JSON.stringify(alsStand(k))}\n\n`);
        } catch { /* Datei gerade im Schreiben: beim naechsten Blick wieder */ }
      };

      const uhr = setInterval(() => { void schauNach(); }, BLICK_MS);
      const puls = setInterval(() => sende(': ping\n\n'), LEBENSZEICHEN_MS);
      // Den aktuellen Stand gleich mitgeben, damit niemand auf die erste
      // Aenderung warten muss.
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
