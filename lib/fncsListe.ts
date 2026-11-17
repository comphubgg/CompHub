import { liesJson } from '@/lib/ablage';
import { namensSchluessel } from '@/lib/homoglyph';
import { landNorm } from '@/lib/spielerFlagge.mjs';
import { landQuellen } from '@/lib/landQuellen';
import { FNCS_FAKTEN } from '@/lib/fncsFakten';
import type { MapEintrag } from '@/lib/mapsVerzeichnis';
import { epicNamen } from '@/lib/epicNamenVorrat';

/*
 * Die FNCS-Endspiele vor Epics Bestenlisten (vor Chapter 5 Season 3): welche Art ein Endspiel ist, das Land zu einem Spielernamen
 * und die Platzierungen, die wir selbst haben - die ersten fuenf Plaetze aus den Eckdaten (lib/fncsFakten). Vollstaendige Tabellen
 * aelterer Finals traegt der Admin von Hand ein (alte Maps).
 *
 * Eigene Datei, damit lib/alteMaps (Teams einer alten Karte) und lib/fncsEreignisse (FNCS-Seite) sie beide nutzen koennen,
 * ohne sich gegenseitig einzubinden.
 */

export type Art = 'gf' | 'gc' | 'invitational' | 'summit' | 'royale' | 'allstar';

export const schluesselVon = (saison: string, art: Art) => `${saison}|${art}`;

/** Welches FNCS-Endspiel ist diese Karte - oder keins? */
export function endspielArt(e: MapEintrag): { art: Art; jahr?: string } | null {
  if (e.alt) {
    if (e.titel === 'FNCS Grand Finals') return { art: 'gf' };
    if (e.titel === 'FNCS Grand Royale') return { art: 'royale' };
    if (e.titel === 'FNCS All-Star Showdown') return { art: 'allstar' };
    if (e.titel === 'FNCS Invitational 2022') return { art: 'invitational', jahr: '2022' };
    const gc = /^FNCS Global Championship (\d{4}) Grand Finals$/.exec(e.titel);
    return gc ? { art: 'gc', jahr: gc[1] } : null;
  }
  if (/^S\d+_FNCSMajor\d_Final_EU$/.test(e.windowId)) return { art: 'gf' };
  const gc = /^FNCS_Global_Championship_(\d{4})$/.exec(e.windowId);
  if (gc) return { art: 'gc', jahr: gc[1] };
  return e.windowId === 'FNCS_Major_1_Summit_Final' ? { art: 'summit' } : null;
}

/**
 * Das Land zu einem Spielernamen - fuer Quellen, die nur Namen kennen (die Eckdaten). Aus unseren gepflegten Profilen
 * (spieler-profile.json: Name, Anzeigename, weitere Namen -> land) und Epics Anzeigenamen mit der Fortnite-Flagge (lib/landQuellen
 * "spiel"). Nur eindeutige Namen; kennt keine Quelle den Namen, bleibt die Weltkugel: ein Land wird nicht geraten.
 */
let landMerker: { bis: number; karte: Map<string, string | null> } | null = null;
export async function landVonName(): Promise<(name: string) => string | null> {
  if (!landMerker || landMerker.bis < Date.now()) {
    const karte = new Map<string, string | null>();
    const setze = (name: unknown, land: string) => {
      const k = namensSchluessel(String(name ?? ''));
      if (!k || !land) return;
      const da = karte.get(k);
      if (da === undefined) karte.set(k, land);
      else if (da !== land) karte.set(k, null);
    };
    const [profile, epic, quellen] = await Promise.all([
      liesJson<Record<string, { name?: string; anzeige?: string; namen?: string[]; land?: string }>>('spieler-profile.json', {}).catch(() => ({})),
      epicNamen(),
      landQuellen().catch(() => null),
    ]);
    const ausProfil = new Set<string>();
    for (const p of Object.values(profile ?? {})) {
      const l = landNorm(p?.land).toUpperCase();
      if (!l) continue;
      for (const n of [p.name, p.anzeige, ...(p.namen ?? [])]) { setze(n, l); ausProfil.add(namensSchluessel(String(n ?? ''))); }
    }
    for (const [id, n] of Object.entries(epic ?? {})) {
      const l = landNorm(quellen?.spiel[id.toLowerCase()]).toUpperCase();
      if (l && !ausProfil.has(namensSchluessel(n))) setze(n, l);
    }
    landMerker = { bis: Date.now() + 10 * 60_000, karte };
  }
  const karte = landMerker.karte;
  return (name) => karte.get(namensSchluessel(name)) ?? null;
}

export interface ListenTeam {
  rang: number;
  /** Punkte, Siege, Eliminierungen, Spiele - wo bekannt. */
  punkte?: number; siege?: number; elims?: number; spiele?: number;
  spieler: Array<{ id: string; name: string; land: string | null }>;
}

/** Die Platzierungen eines Endspiels, die wir selbst haben: die ersten fuenf Plaetze aus den Eckdaten (lib/fncsFakten - ganze Teams). */
export async function plaetze(key: string): Promise<ListenTeam[]> {
  const fakt = FNCS_FAKTEN[key];
  if (!fakt) return [];
  const land = await landVonName();
  return fakt.top.map((t) => ({
    rang: t.rang, spieler: t.spieler.map((n) => ({ id: `f-${namensSchluessel(n)}`, name: n, land: land(n) })),
  }));
}
