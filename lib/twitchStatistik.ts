import { liesJson, schreibJson } from '@/lib/ablage';

/*
 * Die Twitch-Statistik der VIPs (Betreiber, 27.10.2026: "Twitch daily/weekly/month/year/all time Recap - bester Peak mit/ohne Raid, neue Follower, Chatter -
 * fuer VIPs, wenn ich denen das gebe"). Gesammelt von scripts/twitch-statistik.mjs (GitHub-Dauerlauf), hier nur gelesen und zusammengerechnet.
 *
 *   twitch-kanaele.json            welche Kanaele gezaehlt werden und welcher VIP sie sehen darf - schreibt nur die Seite (Admin)
 *   twitch-statistik/<Id>.json     je Kanal: Follower-Tagesstaende und Streams (Minutenverlauf der Zuschauer, Raids, Chatter) - schreibt nur der Sammler
 */

export interface TwitchKanal { login: string; id?: string; name?: string; vips: string[]; vipName: string; seit: number }
export interface TwitchStream {
  id: string; start: string; ende: string | null; titel: string; spiel: string;
  /** [Minute seit Start, Zuschauer] - je Minute ein Wert. */
  verlauf: Array<[number, number]>;
  raids: Array<{ von: string; zuschauer: number; zeit: string }>;
  nachrichten: number;
  /** Eindeutige Konten, die geschrieben haben - nach dem Ende; waehrend des Streams stehen die Kennungen in chatterIds. */
  chatter?: number; chatterIds?: string[];
}
export interface TwitchDatei { id: string; login: string; name: string; follower: Array<[string, number]>; streams: TwitchStream[] }

const KANAELE = 'twitch-kanaele.json';
export const liesKanaele = async () => (await liesJson<{ kanaele?: TwitchKanal[] } | null>(KANAELE, null))?.kanaele ?? [];
export const schreibeKanaele = (kanaele: TwitchKanal[]) => schreibJson(KANAELE, { kanaele });
export const liesDatei = (id: string) => liesJson<TwitchDatei | null>(`twitch-statistik/${id}.json`, null).catch(() => null);

/** Wie lange nach einem Raid dessen Zuschauer als "geraidet" gelten - so lange zaehlt die Spitze ohne Raid sie nicht mit. */
const RAID_WIRKUNG_MS = 30 * 60_000;

function streamWerte(s: TwitchStream) {
  const start = Date.parse(s.start);
  const minuten = s.verlauf.length ? s.verlauf[s.verlauf.length - 1][0] : 0;
  const zuschauer = s.verlauf.map(([, v]) => v);
  const peak = zuschauer.length ? Math.max(...zuschauer) : 0;
  const durchschnitt = zuschauer.length ? Math.round(zuschauer.reduce((a, b) => a + b, 0) / zuschauer.length) : 0;
  // Spitze ohne Raid: zu jedem Zeitpunkt die Zuschauer der Raids der letzten halben Stunde abgezogen.
  const peakOhneRaid = s.raids.length
    ? Math.max(0, ...s.verlauf.map(([m, v]) => {
      const t = start + m * 60_000;
      const geraidet = s.raids.filter((r) => { const rt = Date.parse(r.zeit); return rt <= t && t - rt < RAID_WIRKUNG_MS; }).reduce((a, r) => a + r.zuschauer, 0);
      return Math.max(0, v - geraidet);
    }))
    : peak;
  return {
    id: s.id, start: s.start, ende: s.ende, live: !s.ende, titel: s.titel, spiel: s.spiel, minuten, peak, peakOhneRaid, durchschnitt,
    chatter: s.chatter ?? s.chatterIds?.length ?? 0, nachrichten: s.nachrichten ?? 0,
    raids: s.raids.length, raidZuschauer: s.raids.reduce((a, r) => a + r.zuschauer, 0),
  };
}

export const PERIODEN = [
  { schluessel: 'tag', ms: 864e5 }, { schluessel: 'woche', ms: 7 * 864e5 }, { schluessel: 'monat', ms: 30 * 864e5 },
  { schluessel: 'jahr', ms: 365 * 864e5 }, { schluessel: 'gesamt', ms: Number.POSITIVE_INFINITY },
] as const;

export function auswerten(d: TwitchDatei) {
  const jetzt = Date.now();
  const alle = d.streams.map(streamWerte);
  const follower = [...d.follower].sort((a, b) => a[0].localeCompare(b[0]));
  const folgerJetzt = follower.length ? follower[follower.length - 1][1] : null;
  const perioden = PERIODEN.map((p) => {
    const ab = jetzt - p.ms;
    const st = alle.filter((s) => Date.parse(s.start) >= ab || (s.live && p.ms !== Number.POSITIVE_INFINITY));
    // Neue Follower: heutiger Stand minus der Stand am Beginn des Zeitraums (oder der erste, wenn die Zaehlung spaeter begann).
    const tagAb = Number.isFinite(ab) ? new Date(ab).toISOString().slice(0, 10) : '';
    const vorher = [...follower].reverse().find((f) => f[0] <= tagAb) ?? follower[0];
    return {
      periode: p.schluessel,
      streams: st.length,
      stunden: Math.round(st.reduce((a, s) => a + s.minuten, 0) / 6) / 10,
      peak: st.length ? Math.max(...st.map((s) => s.peak)) : 0,
      peakOhneRaid: st.length ? Math.max(...st.map((s) => s.peakOhneRaid)) : 0,
      durchschnitt: st.length ? Math.round(st.reduce((a, s) => a + s.durchschnitt * Math.max(1, s.minuten), 0) / st.reduce((a, s) => a + Math.max(1, s.minuten), 0)) : 0,
      chatter: st.reduce((a, s) => a + s.chatter, 0),
      chatterMax: st.length ? Math.max(...st.map((s) => s.chatter)) : 0,
      nachrichten: st.reduce((a, s) => a + s.nachrichten, 0),
      raids: st.reduce((a, s) => a + s.raids, 0),
      raidZuschauer: st.reduce((a, s) => a + s.raidZuschauer, 0),
      neueFollower: folgerJetzt !== null && vorher ? folgerJetzt - vorher[1] : null,
    };
  });
  const letzter = d.streams[d.streams.length - 1] ?? null;
  return {
    id: d.id, login: d.login, name: d.name, follower: folgerJetzt, zaehltSeit: follower[0]?.[0] ?? null,
    perioden,
    streams: alle.slice(-15).reverse(),
    verlauf: letzter ? { start: letzter.start, live: !letzter.ende, punkte: letzter.verlauf, raids: letzter.raids } : null,
  };
}
