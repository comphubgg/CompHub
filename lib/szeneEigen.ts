// Die eigenen Spieltage der Statistik (Idee 26, 31.10.2026).
//
// Die Szene-Quelle liefert seit dem 10.10.2026 keine Spieltage mehr - die Statistik blieb beim Performance Cup vom 8.10. stehen, Heats, LCQ und
// FNCS Solos Finals fehlten. Diese Datei baut fuer die Spieltage, die sie frueher gefuehrt haette (Finals der grossen Turniere, Fast Tracks, LANs
// mit hoechstens ein paar hundert Spielern), dieselbe Art Datei aus unseren eigenen Daten - sofort nach dem Spieltag, und sie fuellt sich auf:
//
//   * Matches je Team und die Teilnehmer aus Epics Bestenliste (epic-spieltage),
//   * Eliminierungen: bei Solos aus Epics Bestenliste, bei Teams aus den Server-Replays, wenn sie je Team zu Epic passen,
//   * Schaden, erlittener Schaden, Treffer, Sturmschaden und Ueberlebenszeit aus den vollen Replays (clutch/<w>.json, tools/replay-voll).
//
// Was wir nicht haben, steht nicht drin - Schuesse, Assists, Heilung, Material, Bauteile, Strecke gab es nur bei der Quelle; Kopftreffer zaehlen die
// Replays nicht verlaesslich genug ("er hat nie im Leben nur einen"). Die Summen der Statistik zaehlen solche Werte nur ueber die Spieltage, die sie
// haben (siehe summen() in lib/szeneStats.ts). Schaden und Zeit stehen je Spieler erst, wenn jedes seiner Spiele voll gelesen ist.
// Der Schaden aus den Replays liegt im Mittel rund 6 % unter Epics Zahl (ohne Treffer auf Umgehauene, an den Globals geprueft).

import path from 'path';
import { liesJson } from '@/lib/ablage';
import { replayTag } from '@/lib/replaySchlank';
import { istGrossesTurnier, istFinaleTag } from '@/lib/turnierArt';

export interface EigenerTag {
  eventId: string; windowId: string; region: string; season: string; titel: string; cupId: string;
  istFinale: boolean; datum: number | null;
  teams: Array<{ platz: number; matches: number; teamElims?: number; spieler: string[] }>;
}

/** Ab dieser Saison - davor hat die Quelle alles, was zaehlt. */
const AB_SAISON = 42;
/** Mehr Teilnehmer hatte kein Spieltag der Quelle (Finals: 100, LANs: 100-150). */
const HOECHSTENS_SPIELER = 260;

type Clutch = {
  schaden?: Record<string, { dmg: number; erlitten: number; treffer: number; sturm?: number }>;
  leben?: Record<string, number>;
  spiele?: Record<string, number>;
  teilweise?: unknown;
};

/** Gehoert der Spieltag zu dem, was die Quelle gefuehrt haette? */
export function eigenKandidat(t: EigenerTag, imArchiv: Set<string>, jetzt = Date.now()): boolean {
  const nr = Number(/^S(\d+)$/i.exec(t.season)?.[1] ?? 0);
  if (nr < AB_SAISON || imArchiv.has(t.windowId)) return false;
  if (!t.datum || t.datum > jetzt - 2 * 3600_000) return false;
  const spieler = t.teams.reduce((n, x) => n + x.spieler.length, 0);
  if (!spieler || spieler > HOECHSTENS_SPIELER) return false;
  const lan = /_lan$/i.test(t.cupId);
  const fastTrack = /fasttrack/i.test(t.windowId);
  return lan || fastTrack || (istGrossesTurnier(t.titel) && istFinaleTag(t.titel, t.istFinale, t.windowId));
}

export interface EigeneSpielerZeile {
  username: string; epicId: string;
  eliminations?: number; matchesPlayed: number;
  damageDealt?: number; damageTakenFromPlayers?: number; hitsToPlayers?: number; stormDamage?: number; timeAlive?: number;
}

/**
 * Die Werte aller Spieler eines Spieltags - oder null, solange nicht jedes Match gelesen ist.
 */
export async function eigeneSpieler(t: EigenerTag): Promise<{ players: EigeneSpielerZeile[]; matches: number } | null> {
  const [rep, clutch, namen] = await Promise.all([
    replayTag(t.season, t.windowId),
    liesJson<Clutch | null>(path.join('clutch', `${t.windowId}.json`), null).catch(() => null),
    liesJson<Record<string, string>>('epic-namen.json', {}).catch(() => ({} as Record<string, string>)),
  ]);
  /*
   * Ein Spieltag fehlt nie ganz (Betreiber, 31.10.2026: "Es darf nicht einfach auf einmal keine Stats mehr kommen"): jeder Spieler steht mit Matches
   * drin, alles Weitere, sobald es stimmt - und es fuellt sich mit jedem gelesenen Replay von selbst auf.
   *
   * Eliminierungen nur, wo sie nachweislich stimmen (bei FNCS Solos Finals Day 2 EU zaehlten die schnellen Replays 235 Kills, Epic 560 - halb
   * geladene Spiele). Solo: Epics Bestenliste, je Spieler genau. Teams: die Replays je Team, wenn ihre Summe Epics Team-Elims trifft (+-1).
   */
  const schaden = clutch?.schaden ?? {};
  const ausRep = new Map((rep?.spieler ?? []).map((s) => [s.epicId.toLowerCase(), s]));
  const solo = t.teams.every((x) => x.spieler.length === 1);
  const players: EigeneSpielerZeile[] = [];
  let matches = 0;
  for (const team of t.teams) {
    matches = Math.max(matches, team.matches);
    const elimsStimmen = solo
      || Math.abs(team.spieler.reduce((n, id) => n + (ausRep.get(id.toLowerCase())?.kills ?? 0), 0) - (team.teamElims ?? 0)) <= 1;
    for (const id of team.spieler) {
      const k = id.toLowerCase();
      const r = ausRep.get(k);
      const d = schaden[k];
      // Nur wenn jedes Spiel dieses Spielers gelesen ist - sonst waeren Schaden und Zeit zu niedrig.
      const voll = (clutch?.spiele?.[k] ?? 0) >= team.matches;
      players.push({
        username: namen[id] ?? namen[k] ?? id,
        epicId: id,
        ...(elimsStimmen ? { eliminations: solo ? (team.teamElims ?? 0) : (r?.kills ?? 0) } : {}),
        matchesPlayed: team.matches,
        ...(d && voll ? {
          damageDealt: Math.round(d.dmg * 100) / 100,
          damageTakenFromPlayers: Math.round(d.erlitten * 100) / 100,
          hitsToPlayers: d.treffer,
          ...(typeof d.sturm === 'number' ? { stormDamage: Math.round(d.sturm) } : {}),
        } : {}),
        ...(voll && typeof clutch?.leben?.[k] === 'number' ? { timeAlive: Math.round(clutch.leben[k]) } : {}),
      });
    }
  }
  return players.length ? { players, matches } : null;
}
