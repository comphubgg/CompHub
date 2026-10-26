import { GET as bestenlisteAbruf } from '@/app/api/cup-leaderboard/route';
import { liesJson } from '@/lib/ablage';

/*
 * Die Daten eines Plakats (Betreiber, 21.10.2026: "ein Plakat fuer alles unter Posts - Spieler- und Team-Stats, Standings, Finals, andere Statistiken").
 *
 * Alles kommt aus derselben Bestenliste wie die Cup-Seiten (/api/cup-leaderboard: Punkte, Spiele, Siege, Eliminierungen und je Match Platz und Eliminierungen, dazu
 * Namen, Flaggen und Fotos der Spieler) - nichts ist geschaetzt oder erfunden. Mehrere Tage eines Finales werden zusammengerechnet (windows=...).
 */

export interface PlakatSpieler { id: string; name: string; land: string | null; bild: string | null; x: string | null }
export interface PlakatMatch { platz: number | null; elims: number; ende: string | null }
export interface PlakatTeam {
  rang: number; teamId: string; spieler: PlakatSpieler[];
  punkte: number; siege: number; elims: number; spiele: number; avgElims: number; avgPlatz: number | null; bestPlatz: number | null;
  matches: PlakatMatch[];
}

interface Roh {
  rank: number; points: number; elims: number; games: number; wins: number; bestPlace: number | null; avgElims: number; avgPlace: number; teamId?: string;
  matches?: Array<{ placement?: number | null; elims?: number; endTime?: string }>;
  players?: Array<{ id?: string; name?: string; anzeige?: string; land?: string | null; img?: string | null }>;
}

/** Die X-Konten der Spieler aus den gepflegten Profilen (Konto-Id -> Handle) - fuer den Beitragstext. */
async function handles(): Promise<Map<string, string>> {
  const profile = await liesJson<Record<string, { id?: string; x?: string }>>('spieler-profile.json', {}).catch(() => ({} as Record<string, { id?: string; x?: string }>));
  const m = new Map<string, string>();
  for (const [k, p] of Object.entries(profile)) {
    const id = (p.id || (/^[0-9a-f]{32}$/i.test(k) ? k : '')).toLowerCase();
    const x = String(p.x ?? '').replace(/^@/, '').trim();
    if (id && x) m.set(id, x);
  }
  return m;
}

export async function plakatTeams(o: { ursprung: string; event: string; windows: string[]; limit?: number; suche?: string }): Promise<PlakatTeam[]> {
  const q = new URLSearchParams({ event: o.event });
  if (o.windows.length > 1) q.set('windows', o.windows.join(',')); else q.set('window', o.windows[0] ?? '');
  q.set('limit', String(Math.min(o.limit ?? 30, 200)));
  if (o.suche) q.set('q', o.suche);
  const antwort = await bestenlisteAbruf(new Request(`${o.ursprung}/api/cup-leaderboard?${q.toString()}`));
  const j = await antwort.json() as { entries?: Roh[]; error?: string };
  if (!antwort.ok) throw new Error(j.error || 'Bestenliste nicht erreichbar');
  const x = await handles();
  return (j.entries ?? []).map((e) => ({
    rang: e.rank, teamId: e.teamId ?? '',
    spieler: (e.players ?? []).map((p) => ({
      id: String(p.id ?? ''), name: String(p.anzeige || p.name || '').trim(), land: p.land ?? null, bild: p.img ?? null, x: x.get(String(p.id ?? '').toLowerCase()) ?? null,
    })),
    punkte: e.points ?? 0, siege: e.wins ?? 0, elims: e.elims ?? 0, spiele: e.games ?? 0,
    avgElims: e.avgElims ?? 0, avgPlatz: Number.isFinite(e.avgPlace) && e.avgPlace > 0 ? e.avgPlace : null, bestPlatz: e.bestPlace ?? null,
    matches: (e.matches ?? []).map((m) => ({ platz: typeof m.placement === 'number' ? m.placement : null, elims: m.elims ?? 0, ende: m.endTime ?? null })),
  }));
}

/** Wie gross ein Lobby-Feld ungefaehr ist - fuer die Balkenhoehe der Platzierungen: Solo 100, Duo 50, Trio 34. */
export const feldGroesse = (spielerJeTeam: number) => (spielerJeTeam <= 1 ? 100 : spielerJeTeam === 2 ? 50 : 34);

/** Ein Beitragstext zum Plakat - mit den X-Konten, wo sie gepflegt sind. */
export function plakatText(o: { art: string; titel: string; stufe: string; team?: PlakatTeam; teams?: PlakatTeam[] }): string {
  const tag = (s: PlakatSpieler) => (s.x ? `@${s.x}` : s.name);
  const zahl = (n: number) => n.toLocaleString('en-US');
  const kopf = [o.titel, o.stufe].filter(Boolean).join(' · ');
  if (o.art === 'spieler' && o.team) {
    const t = o.team;
    const wer = t.spieler.map(tag).join(' & ');
    return [`📊 ${wer} · #${t.rang} at ${kopf}`, '',
      `${zahl(t.punkte)} pts · ${t.spiele} games · ${t.siege} ${t.siege === 1 ? 'win' : 'wins'} · ${t.elims} elims${t.avgPlatz ? ` · avg place ${t.avgPlatz.toFixed(1)}` : ''}`, '',
      'Full leaderboard, maps and stats: thecomphub.com', '', '#Fortnite #FNCS #FortniteCompetitive'].join('\n');
  }
  const top = (o.teams ?? []).slice(0, 5);
  return [`🏆 ${kopf} - standings`, '', ...top.map((t) => `${t.rang}. ${t.spieler.map(tag).join(' & ')} - ${zahl(t.punkte)} pts`), '',
    'Full leaderboard, maps and stats: thecomphub.com', '', '#Fortnite #FNCS #FortniteCompetitive'].join('\n');
}
