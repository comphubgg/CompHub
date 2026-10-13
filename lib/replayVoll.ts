import { liesJson } from '@/lib/ablage';

/*
 * Der Index der voll ausgelesenen Replays (scripts/replay-voll-holen.mjs, ein Eintrag je Game) - gemeinsam fuer die API
 * (app/api/replay) und die Weiterleitung der Live-Seiten (app/live-replays/[cup]).
 *
 * Die Adressen der Replay-Seiten sind dauerhaft: /replays/<Fenster-Kennung>/<Game-Nummer>. Beides aendert sich nie, nachdem das Game
 * gespielt ist (die Nummer ist die Reihenfolge des Beginns innerhalb des Spieltags), und /live-replays/<Cup> zeigt immer den
 * neuesten Spieltag dieses Cups - der Betreiber (13.10.2026): "die URL muss immer gleich bleiben".
 */

export interface IndexEintrag {
  datei: string; windowId: string; eventId: string; titel?: string; region?: string; season?: string;
  beginn?: string; ende?: number; sieger?: string[]; spieler?: number; zonen?: number;
}
export interface TagMatch extends IndexEintrag { id: string; nr: number }
export interface Spieltag {
  windowId: string; eventId: string; titel: string; region: string; season: string; matches: TagMatch[];
}

export async function replayIndex(): Promise<Record<string, IndexEintrag>> {
  const i = await liesJson<{ matches?: Record<string, IndexEintrag> }>('replay-voll/index.json', {});
  return i.matches ?? {};
}

/** Nach Spieltag gruppiert (neuester zuerst), darin nach Beginn, die Games nummeriert. */
export function nachSpieltag(alle: Record<string, IndexEintrag>): Spieltag[] {
  const tage = new Map<string, Spieltag>();
  for (const [id, e] of Object.entries(alle)) {
    const t = tage.get(e.windowId) ?? { windowId: e.windowId, eventId: e.eventId, titel: e.titel ?? e.windowId, region: e.region ?? '', season: e.season ?? '', matches: [] };
    t.matches.push({ ...e, id, nr: 0 });
    tage.set(e.windowId, t);
  }
  return [...tage.values()].map((t) => {
    t.matches.sort((a, b) => String(a.beginn ?? '').localeCompare(String(b.beginn ?? '')));
    t.matches.forEach((m, i) => { m.nr = i + 1; });
    return t;
  }).sort((a, b) => String(b.matches[0]?.beginn ?? '').localeCompare(String(a.matches[0]?.beginn ?? '')));
}

/** "epicgames_MannekenPis_Official" -> "mannekenpis_official" - die Kurzform eines Cups fuer Adressen. */
export const cupKurz = (eventId: string) => eventId.replace(/^epicgames_/i, '').toLowerCase();

/** Der neueste Spieltag eines Cups (Kurzform wie cupKurz, oder eine Fenster-Kennung). */
export function neuesterTag(tage: Spieltag[], cup: string): Spieltag | null {
  const k = cup.replace(/^epicgames_/i, '').toLowerCase();
  const passt = tage.filter((t) => cupKurz(t.eventId) === k || t.windowId.toLowerCase() === k || t.windowId.toLowerCase().startsWith(k + '_') || cupKurz(t.eventId).startsWith(k));
  // Mehrere Regionen am selben Tag: die europaeische zuerst, sonst der neueste.
  return passt.find((t) => t.region === 'EU') ?? passt[0] ?? null; // schon nach Beginn absteigend
}
