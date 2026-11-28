import { useEffect, useState } from 'react';
import { SCHLUESSEL_SEITE, SCHLUESSEL_STAND } from './mv/mvTypen';

/*
 * Wer gerade live ist: die Streamer-Liste der Seite (/api/streamers - Gruppen EU, NA, "streamer") und ihr Twitch-Stand
 * (POST /api/live-status { usernames } - wie die Streams-Seite auf main). Alle 60 s neu. "unbekannt" heisst: Twitch war nicht erreichbar -
 * dann bleibt der letzte bekannte Stand stehen, statt "offline" zu raten.
 * Dazu die Wand der Multiview (localStorage der echten Seite): lesen, einen Kanal hineinlegen oder herausnehmen.
 */
export interface Kanal { login: string; gruppe: string; anzeige?: string; isLive: boolean; viewers: number; title?: string; bild?: string | null; unbekannt?: boolean }

const TAKT = 60_000;

export function useLive() {
  const [liste, setListe] = useState<Kanal[] | null>(null);
  const [fehler, setFehler] = useState(false);
  // takt haengt an den Vorschaubildern (?t=), damit sie mit jedem neuen Stand frisch geladen werden
  const [takt, setTakt] = useState(() => Math.floor(Date.now() / TAKT));
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
        setListe((alt) => kanaele.map((k) => {
          const neu = j[k.login] ?? j[k.login.toLowerCase()];
          const vorher = alt?.find((a) => a.login === k.login);
          if (neu?.unbekannt && vorher) return vorher;
          return { ...k, isLive: false, viewers: 0, ...(neu ?? {}) };
        }));
        setTakt(Math.floor(Date.now() / TAKT));
        setFehler(false);
      } catch { if (!weg) setFehler(true); }
    };
    fetch('/api/streamers').then((r) => r.json()).then((j: { streamers?: Record<string, Array<{ twitch?: string; anzeige?: string }>> }) => {
      const gesehen = new Set<string>();
      for (const [gruppe, l] of Object.entries(j.streamers ?? {})) for (const s of l) {
        const login = (s.twitch ?? '').trim().toLowerCase();
        // darmfn_ steht als Platzhalter vorn in der Liste der Seite - die Streams-Seite liess ihn schon immer aus
        if (login && login !== 'darmfn_' && !gesehen.has(login)) { gesehen.add(login); kanaele.push({ login, gruppe, anzeige: s.anzeige }); }
      }
      void stand();
    }).catch(() => setFehler(true));
    const i = setInterval(stand, TAKT);
    return () => { weg = true; clearInterval(i); kanaele = []; };
  }, []);
  return { liste, fehler, takt };
}

export const GRUPPEN: Record<string, string> = { EU: 'EU pro', NA: 'NA pro', streamer: 'Creator' };

/** Twitchs Vorschaubild eines laufenden Streams (16:9). */
export const vorschaubild = (login: string, takt: number, b = 640, h = 360) => `https://static-cdn.jtvnw.net/previews-ttv/live_user_${login}-${b}x${h}.jpg?t=${takt}`;

/** 12.4K statt 12,412 - fuer Zuschauerzahlen auf Bildern. */
export const kurzZahl = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}K` : n.toLocaleString('en'));

/* ------------------------------------------------------------------ die Wand der Multiview */

/** Die Kanaele der gespeicherten Wand (Multiview der echten Seite, localStorage). */
export function wandLesen(): string[] {
  try { const j = JSON.parse(localStorage.getItem(SCHLUESSEL_STAND) || 'null'); return Array.isArray(j?.streams) ? j.streams.filter((x: { pov?: string }) => !x.pov).map((x: { kanal: string }) => String(x.kanal).toLowerCase()) : []; } catch { return []; }
}
/** Einen Kanal in die gespeicherte Wand legen (oder herausnehmen). */
export function wandSetzen(kanal: string, rein: boolean) {
  try {
    const j = JSON.parse(localStorage.getItem(SCHLUESSEL_STAND) || 'null') ?? { streams: [], qualitaet: 'auto' };
    const liste: Array<Record<string, unknown>> = Array.isArray(j.streams) ? j.streams : [];
    const da = liste.some((x) => String(x.kanal).toLowerCase() === kanal);
    if (rein && !da) liste.push({ id: Math.random().toString(36).slice(2, 10), nr: Date.now(), kanal, versteckt: false, zeigeOffline: false, einmalig: false, fest: false, qualitaet: '' });
    j.streams = rein ? liste : liste.filter((x) => String(x.kanal).toLowerCase() !== kanal);
    localStorage.setItem(SCHLUESSEL_STAND, JSON.stringify(j));
  } catch { /* ohne Speicher bleibt die Wand, wie sie ist */ }
}
/** Vor dem Oeffnen: Multiview (mit offener Seitenleiste) oder Einzelansicht vormerken - die Multiview liest das beim Start. */
export function ansichtMerken(mehrfach: boolean) {
  try { localStorage.setItem('multihub_mehrfach', String(mehrfach)); if (mehrfach) localStorage.setItem(SCHLUESSEL_SEITE, 'true'); } catch { /* egal */ }
}
export const MV_PFAD = '/streamer/streams/multiview';
