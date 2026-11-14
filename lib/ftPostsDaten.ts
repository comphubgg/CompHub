import { liesJson, speicher } from '@/lib/ablage';
import { GET as bestenlisteAbruf } from '@/app/api/cup-leaderboard/route';
import { JE_SPALTEN, jeLesen } from '@/lib/jeSpiel.mjs';
import { ftKonten, ftPosts, type FtClutch, type FtErgebnis, type FtJeZeile, type FtTeam } from '@/lib/ftPosts';

/*
 * Die Daten fuer die Fortnite-Tracker-Posts (lib/ftPosts.ts) aus der Ablage der Seite - dieselben Dateien, die scripts/ft-posts.mjs vom Release holt:
 *   clutch/<Fenster>.json und clutch-je/<Fenster>.json (die Ablage findet sie am Release, siehe lib/ablageGithub),
 *   spieler-profile.json, spieler-namen.json, szene-quelle/spielerliste.json, streamers.json,
 * und die Teams aus Epics Bestenliste ueber /api/cup-leaderboard (dieselbe Abfrage wie lib/ergebnisPosts - mit deren Vorrat und Zwischenspeicher).
 */

const SEITE = 'https://www.thecomphub.com';

/** Die alten Zeilen ohne "je" in der Datei (bis 7.11.2026, nur kleine Spieltage) - Elims stehen auch dort an erster Stelle. */
const ALTE_SPALTEN = ['killsEcht', 'dmg', 'erlitten', 'heilHp', 'schildHeilEcht', 'krit', 'treffer', 'schussEcht', 'matsAlt'];

interface LbEintrag { rank: number; wins?: number; elims?: number; games?: number; matches?: unknown[]; players?: Array<{ id?: string; name?: string; anzeige?: string }> }

/** Alle Teams des Spieltags: erst der ganze Vorrat, sonst die ersten 2.000 Plaetze. */
async function teamsAus(eventId: string, windowId: string): Promise<{ teams: FtTeam[]; namen: Record<string, string> }> {
  const frage = async (zusatz: string) => {
    const r = await bestenlisteAbruf(new Request(`${SEITE}/api/cup-leaderboard?event=${encodeURIComponent(eventId)}&window=${encodeURIComponent(windowId)}${zusatz}`));
    if (!r.ok) return [] as LbEintrag[];
    return ((await r.json()) as { entries?: LbEintrag[] }).entries ?? [];
  };
  let eintraege = await frage('&ganz=1').catch(() => [] as LbEintrag[]);
  if (!eintraege.length) eintraege = await frage('&limit=2000').catch(() => [] as LbEintrag[]);
  const namen: Record<string, string> = {};
  const teams = eintraege.map((e) => {
    const ids = (e.players ?? []).map((p) => String(p.id ?? '').toLowerCase()).filter(Boolean);
    for (const p of e.players ?? []) { const id = String(p.id ?? '').toLowerCase(); const n = p.anzeige || p.name; if (id && n) namen[id] = n; }
    return { ids, rang: e.rank, siege: e.wins ?? 0, elims: e.elims ?? 0, spiele: e.games ?? e.matches?.length ?? 0 };
  }).filter((t) => t.ids.length);
  return { teams, namen };
}

export class FtDatenFehlen extends Error {}

export async function ftPostsFuer(eventId: string, windowId: string, titel: string, minSpiele?: number): Promise<FtErgebnis & { teams: number }> {
  const clutch = await liesJson<(FtClutch & { jeSpiel?: Record<string, FtJeZeile[]> }) | null>(`clutch/${windowId}.json`, null).catch(() => null);
  if (!clutch?.schaden || !Object.keys(clutch.schaden).length) throw new FtDatenFehlen(`Keine Replay-Auswertung fuer ${windowId} (clutch/${windowId}.json)`);

  let je: Record<string, FtJeZeile[]> = {};
  let spalten: string[] = clutch.je?.spalten ?? JE_SPALTEN;
  if (clutch.je) {
    const roh = await speicher.lies(`clutch-je/${windowId}.json`).catch(() => null);
    if (!roh) throw new FtDatenFehlen(`Werte je Match fehlen (clutch-je/${windowId}.json) - ohne sie keine Elims`);
    je = jeLesen(roh.toString('utf8')) as Record<string, FtJeZeile[]>;
  } else if (clutch.jeSpiel) {
    je = clutch.jeSpiel;
    spalten = ALTE_SPALTEN;
  }

  const [profile, namen, liste, streamer, lb] = await Promise.all([
    liesJson<Record<string, { id?: string; x?: string; land?: string; twitch?: string; anzeige?: string }>>('spieler-profile.json', {}).catch(() => ({})),
    liesJson<Record<string, { haupt?: string }>>('spieler-namen.json', {}).catch(() => ({})),
    liesJson<Array<{ ID?: string; COUNTRY?: string }>>('szene-quelle/spielerliste.json', []).catch(() => []),
    liesJson<{ streamers?: Record<string, Array<{ twitch?: string; twitter?: string }>> } | null>('streamers.json', null).catch(() => null),
    teamsAus(eventId, windowId).catch(() => ({ teams: [] as FtTeam[], namen: {} as Record<string, string> })),
  ]);
  const konten = ftKonten(profile, liste, streamer, namen);
  // Wer weder gepflegten Namen noch Profil hat, steht mit dem Namen aus der Bestenliste da (vor dem aus dem Replay).
  for (const [id, n] of Object.entries(lb.namen)) if (!konten.namen[id]) konten.namen[id] = n;

  const erg = ftPosts({ titel, clutch, je, spalten, teams: lb.teams, konten, minSpiele });
  return { ...erg, teams: lb.teams.length };
}
