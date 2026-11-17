import { liesJson, aendereJson } from '@/lib/ablage';

/*
 * Der Verlauf des Match-ID-Finders (Betreiber, 17.11.2026): "wenn ich das Match verlasse, ist die ID sofort weg - sie soll als Verlauf darunter bleiben,
 * am besten mit dem Titel des Cups".
 *
 * Je Konto jede Sitzung, die der Finder gesehen hat: Match-ID, zuerst und zuletzt gesehen, Playlist, und - wo es sich zuordnen laesst - Cup-Titel und
 * windowId. Quellen: der XMPP-Dienst (scripts/xmpp-dienst.mjs, /verlauf - er sieht jeden Wechsel jedes Freundes, auch wenn niemand die Seite offen hat) und
 * die Live-Funde des Finders selbst (Bestenliste, Sitzungssuche, Freund).
 *
 * Abgelegt als EINE kleine Datei (match-finder-verlauf.json: { <epicId>: Eintrag[] }), je Konto hoechstens 50 Eintraege der letzten 14 Tage. Geschrieben
 * wird gesammelt, hoechstens alle 60 s - und nur, wenn eine neue Sitzung oder ein neuer Titel dazukam; reine "noch gesehen"-Zeiten gehen hoechstens alle
 * 10 Minuten mit (die Ablage ist ein GitHub-Archiv: jeder Schreibvorgang ist ein Commit).
 */

export interface VerlaufEintrag {
  matchId: string;
  /** Zuerst gesehen (ISO). */
  von: string;
  /** Zuletzt gesehen (ISO). */
  bis: string;
  playlist: string | null;
  /** Epics Statuszeile, etwa "Tournament - Solo". */
  zeile?: string;
  windowId?: string | null;
  titel?: string | null;
  quelle?: 'freund' | 'bestenliste' | 'sitzung';
}

const DATEI = 'match-finder-verlauf.json';
const JE_KONTO = 50;
const TAGE_MS = 14 * 86_400_000;
const SCHREIB_MS = 60_000;
const NUR_ZEIT_MS = 10 * 60_000;
const HEX32 = /^[0-9a-f]{32}$/;

type Stand = Record<string, VerlaufEintrag[]>;
interface Zustand {
  stand: Stand | null;
  laden: Promise<Stand> | null;
  /** Konten mit neuer Sitzung oder neuem Titel. */
  wichtig: Set<string>;
  /** Konten, bei denen sich nur "zuletzt gesehen" bewegte. */
  nurZeit: Set<string>;
  geschrieben: number;
  uhr: ReturnType<typeof setInterval> | null;
}
const Z: Zustand = ((globalThis as { __matchVerlauf?: Zustand }).__matchVerlauf ??= {
  stand: null, laden: null, wichtig: new Set(), nurZeit: new Set(), geschrieben: 0, uhr: null,
});

async function stand(): Promise<Stand> {
  if (Z.stand) return Z.stand;
  Z.laden ??= liesJson<Stand>(DATEI, {}).catch(() => ({} as Stand)).then((s) => {
    Z.stand = s && typeof s === 'object' && !Array.isArray(s) ? s : {};
    return Z.stand;
  }).finally(() => { Z.laden = null; });
  return Z.laden;
}

const zeit = (iso: string | null | undefined) => Date.parse(iso ?? '') || 0;
const frueher = (a: string, b: string) => (zeit(a) && zeit(a) <= zeit(b) ? a : b);
const spaeter = (a: string, b: string) => (zeit(a) >= zeit(b) ? a : b);

function beschneiden(liste: VerlaufEintrag[]): VerlaufEintrag[] {
  const grenze = Date.now() - TAGE_MS;
  return liste.filter((e) => zeit(e.bis) >= grenze).sort((a, b) => zeit(a.von) - zeit(b.von)).slice(-JE_KONTO);
}

/** Eintraege in den Stand eines Kontos mischen (gleiche Match-ID = derselbe Eintrag). Gibt zurueck, ob sich etwas Wichtiges oder nur die Zeit aenderte. */
function mische(s: Stand, id: string, neu: VerlaufEintrag[]): 'wichtig' | 'zeit' | null {
  const liste = s[id] ?? [];
  let art: 'wichtig' | 'zeit' | null = null;
  for (const n of neu) {
    if (!n?.matchId || !HEX32.test(n.matchId)) continue;
    const e = liste.find((x) => x.matchId === n.matchId);
    if (!e) {
      liste.push({ ...n, zeile: n.zeile || undefined, windowId: n.windowId ?? null, titel: n.titel ?? null });
      art = 'wichtig';
      continue;
    }
    const von = frueher(e.von, n.von);
    const bis = spaeter(e.bis, n.bis);
    if (von !== e.von || bis !== e.bis) { e.von = von; e.bis = bis; art ??= 'zeit'; }
    if (!e.playlist && n.playlist) { e.playlist = n.playlist; art = 'wichtig'; }
    if (n.zeile && n.zeile !== e.zeile) e.zeile = n.zeile;
    if (!e.titel && n.titel) { e.titel = n.titel; e.windowId = n.windowId ?? e.windowId ?? null; art = 'wichtig'; }
    if (!e.quelle && n.quelle) e.quelle = n.quelle;
  }
  if (art) s[id] = beschneiden(liste);
  return art;
}

function vormerken(id: string, art: 'wichtig' | 'zeit' | null) {
  if (art === 'wichtig') Z.wichtig.add(id);
  else if (art === 'zeit') Z.nurZeit.add(id);
  Z.uhr ??= setInterval(() => { void schreiben(); }, SCHREIB_MS);
}

/** Gesammelt schreiben: nur die vorgemerkten Konten, gegen den frischen Stand der Datei. */
async function schreiben() {
  const faellig = Z.wichtig.size > 0 || (Z.nurZeit.size > 0 && Date.now() - Z.geschrieben >= NUR_ZEIT_MS);
  if (!faellig || !Z.stand) return;
  const ids = [...new Set([...Z.wichtig, ...Z.nurZeit])];
  Z.wichtig.clear(); Z.nurZeit.clear();
  const meins = Z.stand;
  try {
    await aendereJson<Stand>(DATEI, {}, (datei) => {
      for (const id of ids) if (meins[id]) mische(datei, id, meins[id]);
      // Konten ohne Eintrag der letzten 14 Tage fallen heraus.
      for (const id of Object.keys(datei)) { datei[id] = beschneiden(datei[id] ?? []); if (!datei[id].length) delete datei[id]; }
    }, 0);
    Z.geschrieben = Date.now();
  } catch (e) {
    console.warn(`[Match-Verlauf] nicht geschrieben: ${(e as Error)?.message ?? e}`);
    for (const id of ids) Z.wichtig.add(id);
  }
}

/** Neue Funde merken (Live-Sitzungen des Finders, der Verlauf des XMPP-Dienstes). */
export async function merke(funde: Record<string, VerlaufEintrag[]>): Promise<void> {
  const s = await stand();
  for (const [roh, liste] of Object.entries(funde)) {
    const id = roh.toLowerCase();
    if (!HEX32.test(id) || !Array.isArray(liste) || !liste.length) continue;
    vormerken(id, mische(s, id, liste));
  }
}

/** Der Verlauf der Konten, neueste Sitzung zuerst. */
export async function verlaufVon(ids: string[]): Promise<Record<string, VerlaufEintrag[]>> {
  const s = await stand();
  const raus: Record<string, VerlaufEintrag[]> = {};
  for (const id of ids) {
    const l = s[id.toLowerCase()];
    if (l?.length) raus[id] = beschneiden(l).reverse();
  }
  return raus;
}

/** Titel nachtragen, die sich erst jetzt zuordnen liessen (wird mitgeschrieben). */
export async function titelNachtragen(id: string, matchId: string, windowId: string, titel: string): Promise<void> {
  const s = await stand();
  const e = s[id]?.find((x) => x.matchId === matchId);
  if (!e || e.titel) return;
  e.titel = titel; e.windowId = windowId;
  vormerken(id, 'wichtig');
}
