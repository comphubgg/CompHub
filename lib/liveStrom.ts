/*
 * Sofort statt Abfragetakt (Betreiber, 15.11.2026: "When the server has it, I want to see it on the page within 1 second - instant").
 *
 * Zwei Bausteine:
 *   - ein Verteiler im Serverprozess (Kanal -> Hoerer): wer etwas Neues weiss (XMPP-Status eines Freundes, der Live-Abruf eines Spieltags),
 *     meldet es hier; jeder offene Datenstrom des Kanals bekommt es im selben Augenblick.
 *   - die Antwort als Server-Sent Events (EventSource im Browser): eine offene Verbindung je Zuschauer statt einer Abfrage alle paar Sekunden.
 *
 * Durch Cloudflare (Worker + Tunnel) und Nexts eigene Kompression kommt ein Strom nur ungepuffert, wenn die Koepfe stimmen:
 * text/event-stream, "no-cache, no-transform" (die Kompression in next start laesst no-transform in Ruhe), X-Accel-Buffering: no. Ein Kommentar
 * alle 15 s haelt die Verbindung offen (Cloudflare trennt nach 100 s Stille). Nach hoechstens 30 Minuten schliesst der Server den Strom von selbst;
 * EventSource verbindet dann neu - so bleibt nichts ewig haengen, auch nicht ueber ein Update hinweg.
 */

type Hoerer = (ereignis: string, daten: unknown) => void;

const g = globalThis as unknown as { __liveKanaele?: Map<string, Set<Hoerer>>; __liveStroeme?: { offen: number; gesamt: number } };
const kanaele: Map<string, Set<Hoerer>> = (g.__liveKanaele ??= new Map());

/*
 * Beim Beenden (Update: Docker schickt SIGTERM) alle Stroeme sofort schliessen. next start faehrt sonst "sanft" herunter und wartet auf jede offene
 * Verbindung - ein Datenstrom endet aber erst nach 30 Minuten: der alte Prozess lief weiter, schickte Lebenszeichen, aber keine neuen Staende, und die Seiten
 * merkten nichts (im Test nachgestellt, 15.11.2026). Geschlossen verbindet EventSource nach 1,5 s neu - beim neuen Prozess.
 */
const offeneStroeme: Set<() => void> = ((g as { __liveOffen?: Set<() => void> }).__liveOffen ??= new Set());
const gs = g as { __liveSignal?: boolean; __liveSchliesst?: boolean };
if (!gs.__liveSignal && typeof process !== 'undefined' && typeof process.on === 'function') {
  gs.__liveSignal = true;
  const alleZu = () => { gs.__liveSchliesst = true; for (const zu of [...offeneStroeme]) { try { zu(); } catch { /* egal */ } } };
  process.on('SIGTERM', alleZu);
  process.on('SIGINT', alleZu);
}
const zaehler = (g.__liveStroeme ??= { offen: 0, gesamt: 0 });

/** Auf einen Kanal hoeren. Zurueck kommt das Abmelden. */
export function abonniere(kanal: string, h: Hoerer): () => void {
  let s = kanaele.get(kanal);
  if (!s) { s = new Set(); kanaele.set(kanal, s); }
  s.add(h);
  return () => {
    const t = kanaele.get(kanal);
    if (!t) return;
    t.delete(h);
    if (!t.size) kanaele.delete(kanal);
  };
}

/** Etwas Neues an alle Hoerer eines Kanals - synchron, ohne Warten. */
export function melde(kanal: string, ereignis: string, daten: unknown): number {
  const s = kanaele.get(kanal);
  if (!s) return 0;
  for (const h of [...s]) { try { h(ereignis, daten); } catch { /* ein kaputter Hoerer haelt die anderen nicht auf */ } }
  return s.size;
}

export function hoererZahl(kanal: string): number { return kanaele.get(kanal)?.size ?? 0; }
export function stromStand() { return { offen: zaehler.offen, gesamt: zaehler.gesamt, kanaele: kanaele.size }; }

export const SSE_KOEPFE: Record<string, string> = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  'X-Accel-Buffering': 'no',
  // Nie an einen Zwischenspeicher (Netlify/Vercel-Reste in next.config.ts, Cloudflare).
  'CDN-Cache-Control': 'no-store',
};

const HERZSCHLAG_MS = 15_000;
const HOECHSTENS_MS = 30 * 60_000;
const enc = new TextEncoder();

export interface Sender {
  /** Ein Ereignis schicken (JSON). */
  sende: (ereignis: string, daten: unknown) => void;
  /** Den Strom beenden. */
  schliesse: () => void;
}

/**
 * Ein Datenstrom als Antwort. `start` bekommt den Sender und gibt das Aufraeumen zurueck (Abmelden vom Kanal usw.); es laeuft genau einmal,
 * wenn der Besucher geht, die Hoechstdauer um ist oder der Server schliesst.
 */
export function sseAntwort(request: Request, start: (s: Sender) => (() => void) | Promise<() => void>): Response {
  /*
   * Der Prozess faehrt herunter: kein neuer Strom. Der Browser verbindet nach dem Schliessen ueber eine noch offene (keep-alive) Verbindung neu - und
   * landete so wieder beim alten Prozess, der dann nie endete (Test 15.11.2026). Also sofort beenden UND die Verbindung schliessen; der naechste Versuch
   * geht ueber eine neue Verbindung an den neuen Prozess.
   */
  if (gs.__liveSchliesst) return new Response('retry: 1000\n\n', { headers: { ...SSE_KOEPFE, Connection: 'close' } });
  let aufraeumen: (() => void) | null = null;
  let zu = false;
  let herz: ReturnType<typeof setInterval> | null = null;
  let ende: ReturnType<typeof setTimeout> | null = null;
  let nr = 0;
  let ctrl: ReadableStreamDefaultController<Uint8Array> | null = null;

  const beenden = () => {
    if (zu) return;
    zu = true;
    zaehler.offen -= 1;
    offeneStroeme.delete(beenden);
    if (herz) clearInterval(herz);
    if (ende) clearTimeout(ende);
    request.signal?.removeEventListener?.('abort', beenden);
    try { aufraeumen?.(); } catch { /* egal */ }
    aufraeumen = null;
    try { ctrl?.close(); } catch { /* schon zu */ }
  };
  const schreib = (text: string) => {
    if (zu || !ctrl) return;
    try { ctrl.enqueue(enc.encode(text)); } catch { beenden(); }
  };
  const sender: Sender = {
    sende: (ereignis, daten) => { nr += 1; schreib(`id: ${nr}\nevent: ${ereignis}\ndata: ${JSON.stringify(daten)}\n\n`); },
    schliesse: beenden,
  };

  const strom = new ReadableStream<Uint8Array>({
    async start(c) {
      ctrl = c;
      zaehler.offen += 1; zaehler.gesamt += 1;
      offeneStroeme.add(beenden);
      // Wiederverbinden nach 1,5 s; dazu 2 KB Fuellung, damit kein Zwischenglied (oder ein alter Browser) auf "genug Daten" wartet.
      schreib(`retry: 1500\n:${' '.repeat(2048)}\n\n`);
      // Lebenszeichen: Kommentar (fuer Zwischenglieder) plus ein winziges Ereignis "hb" - Kommentare sieht die Seite nicht, das Ereignis schon (Wache im Browser).
      herz = setInterval(() => schreib(`: hb\nevent: hb\ndata: ${Date.now()}\n\n`), HERZSCHLAG_MS);
      ende = setTimeout(beenden, HOECHSTENS_MS);
      if (request.signal?.aborted) { beenden(); return; }
      request.signal?.addEventListener?.('abort', beenden);
      try {
        const weg = await start(sender);
        if (zu) { try { weg(); } catch { /* egal */ } } else aufraeumen = weg;
      } catch (e) {
        sender.sende('fehler', { meldung: (e as Error)?.message ?? 'Fehler' });
        beenden();
      }
    },
    cancel() { beenden(); },
  });
  return new Response(strom, { headers: SSE_KOEPFE });
}
