/*
 * Die Replay-Werte eines Spieltags, wie die Seite sie braucht.
 *
 * Die volle Auswertung (replays/<S>/<window>/_aggregat.json) ist bei einem
 * offenen Cup bis zu 54 MB gross; auf dem kostenlosen Host (512 MB) riss ihr
 * Laden den Server um - ein Klick auf die Matches eines Solo-Qualifiers
 * genuegte (28.9.2026). Der stuendliche Lauf legt deshalb eine schlanke
 * Fassung ab (scripts/replays-schlank.mjs, hoechstens gut 4 MB): je Spieler
 * Spiele, Kills, Knocks, Tode - nur wer etwas geholt hat -, dazu Teams und
 * Lobbys. Auf dem Host der Seite gibt es nur diese; fehlt sie, gibt es
 * nichts, statt eines Absturzes.
 */

import fs from '@/lib/ablageFs';
import path from 'path';
import { DATEN_ORT } from './datenOrt';
import { ohneDateien } from '@/lib/antwortSpeicher';

export interface ReplaySpieler {
  epicId: string; matches: number; kills: number; knocks: number; gestorben: number; umgehauen: number;
}
export interface ReplayTeam { platz?: number; punkte?: number; spieler?: string[]; kills?: number; knocks?: number }
export interface ReplayTag {
  matches: number; elims: number | null; quelle: string | null; gerechnet: string | null;
  /** Wie viele Runden der Sammler kennt - ausgewertet oder nicht. */
  rundenGesamt: number | null;
  /** Alle Spieler des Tages; in `spieler` stehen nur die mit Kill oder Knock. */
  spielerGesamt: number;
  spieler: ReplaySpieler[];
  teams: ReplayTeam[];
  lobbys: Record<string, unknown>;
}

// Zwei Tage im Speicher, eine Minute lang: Matches und Player-Stats desselben
// Tages fragen meist kurz nacheinander.
const merker = new Map<string, { tag: ReplayTag | null; bis: number }>();

/** Der Speicher einer Minute wird verworfen, wenn ein VIP von Hand neu laedt. */
export function verwerfeReplayTage() { merker.clear(); }

/**
 * Die Replay-Werte mehrerer Tage eines Finales zusammen (Betreiber, 28.10.2026: "beide Tage zusammen ergeben das kumulative Turnier"): Spiele, Kills, Knocks, Tode je Spieler addiert.
 * Die Plaetze der Teams gelten je Tag und werden hier nicht uebernommen.
 */
export async function replayTage(saison: string, windowIds: string[]): Promise<ReplayTag | null> {
  const teile = (await Promise.all(windowIds.map((w) => replayTag(saison, w)))).filter((x): x is ReplayTag => !!x);
  if (!teile.length) return null;
  const nach = new Map<string, ReplaySpieler>();
  for (const t of teile) {
    for (const s of t.spieler) {
      const da = nach.get(s.epicId);
      if (!da) { nach.set(s.epicId, { ...s }); continue; }
      da.matches += s.matches; da.kills += s.kills; da.knocks += s.knocks; da.gestorben += s.gestorben; da.umgehauen += s.umgehauen;
    }
  }
  const zahl = (f: (t: ReplayTag) => number | null) => teile.reduce((a, t) => a + (f(t) ?? 0), 0);
  return {
    matches: zahl((t) => t.matches), elims: teile.some((t) => t.elims !== null) ? zahl((t) => t.elims) : null, quelle: teile[0].quelle,
    gerechnet: teile.map((t) => t.gerechnet ?? '').sort().pop() || null,
    rundenGesamt: teile.some((t) => t.rundenGesamt !== null) ? zahl((t) => t.rundenGesamt) : null,
    spielerGesamt: nach.size,
    spieler: [...nach.values()].sort((a, b) => b.kills - a.kills || b.knocks - a.knocks),
    teams: teile[teile.length - 1].teams.map((x) => ({ ...x, platz: undefined })), lobbys: {},
  };
}

export async function replayTag(saison: string, windowId: string): Promise<ReplayTag | null> {
  const schluessel = `${saison}|${windowId}`;
  const gemerkt = merker.get(schluessel);
  if (gemerkt && Date.now() < gemerkt.bis) return gemerkt.tag;
  const tag = await lies(saison, windowId);
  merker.set(schluessel, { tag, bis: Date.now() + 60_000 });
  while (merker.size > 2) merker.delete(merker.keys().next().value as string);
  return tag;
}

async function lies(saison: string, windowId: string): Promise<ReplayTag | null> {
  try {
    const roh = JSON.parse(await fs.readFile(
      path.join(DATEN_ORT, 'replays-schlank', saison, `${windowId}.json`), 'utf8')) as
      Omit<ReplayTag, 'spieler'> & { spieler?: Array<[string, number, number, number, number, number]> };
    return {
      ...roh,
      spieler: (roh.spieler ?? []).map(([epicId, matches, kills, knocks, gestorben, umgehauen]) =>
        ({ epicId, matches, kills, knocks, gestorben, umgehauen })),
    };
  } catch { /* noch keine schlanke Fassung */ }
  if (ohneDateien()) return null;
  try {
    const a = JSON.parse(await fs.readFile(
      path.join(DATEN_ORT, 'replays', saison, windowId, '_aggregat.json'), 'utf8')) as {
        matches?: number; elims?: number; quelle?: string; gerechnet?: string;
        spieler?: Array<Partial<ReplaySpieler> & { epicId: string }>; teams?: ReplayTeam[]; lobbys?: Record<string, unknown>;
      };
    const echte = (a.spieler ?? []).filter((s) => s.epicId && s.epicId !== 'bot');
    return {
      matches: a.matches ?? 0, elims: a.elims ?? null, quelle: a.quelle ?? null, gerechnet: a.gerechnet ?? null,
      rundenGesamt: null, spielerGesamt: echte.length,
      spieler: echte.map((s) => ({
        epicId: s.epicId, matches: s.matches ?? 0, kills: s.kills ?? 0, knocks: s.knocks ?? 0,
        gestorben: s.gestorben ?? 0, umgehauen: s.umgehauen ?? 0,
      })),
      teams: a.teams ?? [], lobbys: a.lobbys ?? {},
    };
  } catch { return null; }
}
