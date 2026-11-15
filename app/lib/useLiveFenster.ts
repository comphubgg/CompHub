'use client';

/*
 * Am Datenstrom eines laufenden Spieltags haengen (app/api/live/stream, lib/liveFenster) - "When the server has it, I want to see it on the page
 * within 1 second" (Betreiber, 15.11.2026).
 *
 * Meldet der Server einen neuen Stand ("leaderboard", "matches", "qual"), ruft der Hook `beiStand(teil, v)` auf; die Seite fragt daraufhin ihre
 * gewohnte Schnittstelle, die den Stand schon im Speicher hat. Solange der Strom steht, ist `live` true - die Seite kann ihren Abfragetakt dann ruhen
 * lassen. Bricht er ab (Fehler, 15 + 30 s ohne Lebenszeichen, Server sagt nein), ist `live` false und der alte Takt laeuft wieder; ein neuer Versuch
 * folgt nach 15 s. Ein verborgener Tab schliesst den Strom; beim Zurueckkommen wird sofort neu verbunden und, wenn sich der Stand inzwischen geaendert
 * hat, gleich nachgeladen.
 *
 * `version()` (und das zweite Argument von beiStand) ist die Marke des zuletzt gemeldeten Standes (sein Zeitpunkt) - an die Abfrage gehaengt (&sv=), damit kein Zwischenspeicher auf dem Weg die alte Antwort
 * zurueckgibt.
 */

import { useEffect, useRef, useState } from 'react';

export type LiveTeil = 'leaderboard' | 'matches' | 'qual';

export function useLiveFenster(
  event: string | null | undefined, window_: string | null | undefined, aktiv: boolean,
  teile: LiveTeil[], beiStand: (teil: LiveTeil, marke: number) => void,
  /** Wird mit jedem Wechsel von `live` aufgerufen (fuer Teile einer Seite, die vor dem Hook stehen). */
  beiLive?: (live: boolean) => void,
): { live: boolean; version: () => number } {
  const [live, setLiveRoh] = useState(false);
  const liveRueck = useRef(beiLive);
  useEffect(() => { liveRueck.current = beiLive; }, [beiLive]);
  const rueckruf = useRef(beiStand);
  useEffect(() => { rueckruf.current = beiStand; }, [beiStand]);
  const versionRef = useRef(0);
  const teileText = teile.join(',');

  useEffect(() => {
    if (!aktiv || !event || !window_ || typeof EventSource === 'undefined') return undefined;
    let weg = false;
    const setLive = (x: boolean) => { setLiveRoh(x); liveRueck.current?.(x); };
    let es: EventSource | null = null;
    let wache: ReturnType<typeof setTimeout> | null = null;
    let neuVersuch: ReturnType<typeof setTimeout> | null = null;
    /** Der Stand, den die Seite schon hat - null, solange noch kein Strom einmal "hallo" gesagt hat. */
    let gesehen: number | null = null;
    /** Fehler hintereinander ohne ein "hallo" dazwischen - ab fuenf wird nicht mehr im 1,5-s-Takt des Browsers neu versucht, sondern alle 15 s. */
    let fehler = 0;
    const liste = teileText.split(',').filter(Boolean) as LiveTeil[];

    const wacheNeu = () => {
      if (wache) clearTimeout(wache);
      // Der Server schickt alle 15 s ein Lebenszeichen; 45 s Stille heisst: der Strom ist tot, auch wenn der Browser es nicht merkt.
      wache = setTimeout(() => { schliessen(); setLive(false); spaeter(); }, 45_000);
    };
    const schliessen = () => {
      es?.close(); es = null;
      if (wache) clearTimeout(wache); wache = null;
    };
    const spaeter = () => {
      if (weg || neuVersuch) return;
      neuVersuch = setTimeout(() => { neuVersuch = null; if (!document.hidden) verbinde(); }, 15_000);
    };
    // Als Marke fuer &sv= dient der Zeitpunkt des Standes (zeit), nicht die Nummer: die faengt nach einem Neustart des Servers wieder bei 1 an.
    const anwenden = (v: number, marke: number, teil?: LiveTeil) => {
      versionRef.current = marke || v;
      gesehen = v;
      for (const t of teil ? [teil] : liste) rueckruf.current(t, versionRef.current);
    };
    const lies = (ev: Event) => {
      try { const d = JSON.parse((ev as MessageEvent).data); return { v: Number(d?.v) || 0, marke: Number(d?.zeit) || 0 }; } catch { return { v: 0, marke: 0 }; }
    };
    const verbinde = () => {
      if (weg || es) return;
      const q = new EventSource(`/api/live/stream?event=${encodeURIComponent(event)}&window=${encodeURIComponent(window_)}&what=${encodeURIComponent(teileText)}`);
      es = q;
      wacheNeu();
      q.onopen = () => wacheNeu();
      q.addEventListener('hallo', (ev) => {
        wacheNeu();
        const { v, marke } = lies(ev);
        setLive(true);
        fehler = 0;
        // Neu verbunden und inzwischen ein anderer Stand: sofort nachladen. Beim ersten Verbinden hat die Seite gerade selbst geladen.
        if (gesehen !== null && v !== gesehen) anwenden(v, marke);
        else { gesehen = v; versionRef.current = marke || v; }
      });
      for (const t of liste) {
        q.addEventListener(t, (ev) => {
          wacheNeu();
          const { v, marke } = lies(ev);
          anwenden(v, marke, t);
        });
      }
      q.addEventListener('hb', () => wacheNeu());
      q.addEventListener('ende', () => { schliessen(); setLive(false); });
      q.onerror = () => {
        setLive(false);
        // CONNECTING: der Browser versucht es selbst gleich wieder (retry 1,5 s). CLOSED (409, 503 ...): spaeter von vorn.
        fehler += 1;
        if (q.readyState === EventSource.CLOSED || fehler >= 5) { if (es === q) schliessen(); spaeter(); }
      };
    };
    const sichtbar = () => {
      if (document.hidden) { schliessen(); return; }
      if (neuVersuch) { clearTimeout(neuVersuch); neuVersuch = null; }
      verbinde();
    };
    verbinde();
    document.addEventListener('visibilitychange', sichtbar);
    return () => {
      weg = true;
      schliessen();
      if (neuVersuch) clearTimeout(neuVersuch);
      document.removeEventListener('visibilitychange', sichtbar);
      setLive(false);
    };
  }, [aktiv, event, window_, teileText]);

  // Ohne aktiven Strom nie "live" (ein alter Wert aus dem letzten Lauf zaehlt nicht).
  return { live: live && aktiv && !!event && !!window_, version: () => versionRef.current };
}

