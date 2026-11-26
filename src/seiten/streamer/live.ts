import { useEffect, useState } from 'react';

/*
 * Wer gerade live ist: die Streamer-Liste der Seite (/api/streamers - Gruppen EU, NA, "streamer") und ihr Twitch-Stand
 * (POST /api/live-status { usernames } - wie die Streams-Seite auf main). Alle 60 s neu. "unbekannt" heisst: Twitch war nicht erreichbar.
 */
export interface Kanal { login: string; gruppe: string; anzeige?: string; isLive: boolean; viewers: number; title?: string; bild?: string | null; unbekannt?: boolean }

export function useLive() {
  const [liste, setListe] = useState<Kanal[] | null>(null);
  const [fehler, setFehler] = useState(false);
  useEffect(() => {
    let weg = false;
    let kanaele: Array<{ login: string; gruppe: string; anzeige?: string }> = [];
    const stand = async () => {
      if (!kanaele.length) return;
      try {
        const r = await fetch('/api/live-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usernames: kanaele.map((k) => k.login) }) });
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json() as Record<string, Partial<Omit<Kanal, 'login' | 'gruppe'>>>;
        if (weg) return;
        setListe(kanaele.map((k) => ({ ...k, isLive: false, viewers: 0, ...(j[k.login] ?? {}) })));
        setFehler(false);
      } catch { if (!weg) setFehler(true); }
    };
    fetch('/api/streamers').then((r) => r.json()).then((j: { streamers?: Record<string, Array<{ twitch?: string; anzeige?: string }>> }) => {
      const gesehen = new Set<string>();
      for (const [gruppe, l] of Object.entries(j.streamers ?? {})) for (const s of l) {
        const login = (s.twitch ?? '').trim().toLowerCase();
        if (login && !gesehen.has(login)) { gesehen.add(login); kanaele.push({ login, gruppe, anzeige: s.anzeige }); }
      }
      void stand();
    }).catch(() => setFehler(true));
    const i = setInterval(stand, 60_000);
    return () => { weg = true; clearInterval(i); kanaele = []; };
  }, []);
  return { liste, fehler };
}

export const GRUPPEN: Record<string, string> = { EU: 'EU pro', NA: 'NA pro', streamer: 'Creator' };
