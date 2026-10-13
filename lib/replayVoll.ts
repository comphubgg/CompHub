import { liesJson, schreibJson } from '@/lib/ablage';

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

/* ------------------------------------------------------------------ Meine Replays */

/*
 * "Meine Cups": in welchen ausgewerteten Games ein Epic-Konto vorkommt.
 *
 * Der Betreiber (13.10.2026): wer sich mit Epic verifiziert hat, soll im Dashboard seine Cups sehen - jeden Cup mit jeder einzelnen Runde, in
 * der er gespielt hat - und sie abspielen koennen. Der Index der Replays (replay-voll/index.json) nennt die Spieler nicht; dafuer wird jedes
 * Game einmal gelesen und seine Spieler (nur die Konto-Ids) in replay-voll/_spieler.json abgelegt. Ein neues Game kommt beim naechsten Abruf
 * dazu. Der Aufbau laeuft in Stuecken (je Abruf hoechstens ein paar Sekunden); die Seite fragt, bis alles gelesen ist.
 */


interface SpielerIndex { stand: number; matches: Record<string, string[]> }
let spielerMerker: SpielerIndex | null = null;
let aufbauLaeuft: Promise<void> | null = null;

async function spielerIndex(): Promise<SpielerIndex> {
  if (!spielerMerker) {
    spielerMerker = await liesJson<SpielerIndex>('replay-voll/_spieler.json', { stand: 0, matches: {} }).catch(() => ({ stand: 0, matches: {} }));
    if (!spielerMerker.matches) spielerMerker = { stand: 0, matches: {} };
  }
  return spielerMerker;
}

/** Liest fehlende Games nach, hoechstens `frist` Millisekunden lang. Gibt zurueck, wie viele Games noch fehlen. */
async function baueSpielerIndex(alle: Record<string, IndexEintrag>, frist = 25_000): Promise<number> {
  const idx = await spielerIndex();
  const fehlt = Object.keys(alle).filter((id) => !idx.matches[id]);
  if (!fehlt.length) return 0;
  if (!aufbauLaeuft) {
    aufbauLaeuft = (async () => {
      const ende = Date.now() + frist;
      let naechster = 0;
      const arbeiter = async () => {
        while (naechster < fehlt.length && Date.now() < ende) {
          const id = fehlt[naechster++];
          try {
            const d = await liesJson<{ spieler?: Array<{ epic?: string; bot?: boolean }> } | null>(alle[id].datei, null);
            if (d?.spieler) idx.matches[id] = d.spieler.filter((s) => s.epic && !s.bot).map((s) => String(s.epic).toLowerCase());
          } catch { /* dieses Game beim naechsten Abruf wieder */ }
        }
      };
      await Promise.all(Array.from({ length: 8 }, arbeiter));
      idx.stand = Date.now();
      try { await schreibJson('replay-voll/_spieler.json', idx); } catch { /* ohne Ablage bleibt es im Speicher */ }
    })().finally(() => { aufbauLaeuft = null; });
  }
  await aufbauLaeuft;
  return Object.keys(alle).filter((id) => !idx.matches[id]).length;
}

export interface MeinGame { nr: number; id: string; beginn?: string; platz: number | null; kills: number; teamKills: number; mitspieler: string[]; sieger: boolean }
export interface MeinTag { windowId: string; region: string; games: MeinGame[] }
export interface MeinCup { eventId: string; kurz: string; titel: string; season: string; beginn: string; tage: MeinTag[] }

/** Die Cups und Games, in denen dieses Epic-Konto in einem ausgewerteten Replay steht. */
export async function meineCups(epicId: string, alle: Record<string, IndexEintrag>): Promise<{ fertig: boolean; fehlen: number; gesamt: number; cups: MeinCup[] }> {
  const id = epicId.replace(/-/g, '').toLowerCase();
  const fehlen = await baueSpielerIndex(alle);
  const idx = await spielerIndex();
  const tage = nachSpieltag(alle);
  const cups = new Map<string, MeinCup>();
  for (const tag of tage) {
    const meine = tag.matches.filter((m) => idx.matches[m.id]?.includes(id));
    if (!meine.length) continue;
    const games: MeinGame[] = [];
    for (const m of meine) {
      let platz: number | null = null; let kills = 0; let teamKills = 0; let mitspieler: string[] = []; let sieger = false;
      try {
        const d = await liesJson<{ spieler?: Array<{ epic?: string; name?: string; team?: number; platz?: number; kills?: number; teamKills?: number }> } | null>(m.datei, null);
        const ich = d?.spieler?.find((s) => String(s.epic ?? '').toLowerCase() === id);
        if (ich) {
          platz = typeof ich.platz === 'number' && ich.platz < 999 ? ich.platz : null;
          kills = ich.kills ?? 0; teamKills = ich.teamKills ?? kills; sieger = ich.platz === 1;
          mitspieler = (d?.spieler ?? []).filter((s) => s.team === ich.team && String(s.epic ?? '').toLowerCase() !== id).map((s) => String(s.name ?? '?'));
        }
      } catch { /* ohne Einzelheiten steht das Game trotzdem da */ }
      games.push({ nr: m.nr, id: m.id, beginn: m.beginn, platz, kills, teamKills, mitspieler, sieger });
    }
    const c = cups.get(tag.eventId) ?? { eventId: tag.eventId, kurz: cupKurz(tag.eventId), titel: tag.titel, season: tag.season, beginn: '', tage: [] };
    const beginn = String(tag.matches[0]?.beginn ?? '');
    if (beginn > c.beginn) c.beginn = beginn;
    c.tage.push({ windowId: tag.windowId, region: tag.region, games });
    cups.set(tag.eventId, c);
  }
  const raus = [...cups.values()].sort((a, b) => b.beginn.localeCompare(a.beginn));
  for (const c of raus) c.tage.sort((a, b) => String(a.games[0]?.beginn ?? '').localeCompare(String(b.games[0]?.beginn ?? '')));
  return { fertig: fehlen === 0, fehlen, gesamt: Object.keys(alle).length, cups: raus };
}
