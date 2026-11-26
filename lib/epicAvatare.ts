import { liesJson, aendereJson } from '@/lib/ablage';
import { getToken } from '@/lib/epicCups';

/*
 * Epics Profilbild (Avatar) als Ersatz fuer Spieler ohne eigenes Foto (Betreiber, 26.11.2026: "Epic Avatar, Profilbildern ... fuer die ich keine
 * Profilbilder habe ... dann muessen wir nicht den Platzhalter benutzen"). Der Avatar-Dienst nennt je Konto die Cosmetic-Id des gewaehlten
 * Profilbilds (z. B. "ATHENACHARACTER:cid_028_athena_commando_f"); das Bild selbst liefert fortnite-api.com (ueber /api/avatar, gecacht).
 *
 *   epic-avatare.json   { [kontoId]: { c: cosmeticId | null, t: ms } }   - nach 14 Tagen neu gefragt
 *
 * Gefuellt wird nebenbei: lib/aktuelleFotos meldet Konten ohne Foto (merkeFehlend); alle 20 s gehen bis zu 100 auf einmal an Epic.
 */

const DATEI = 'epic-avatare.json';
const NEU_MS = 14 * 24 * 3600_000;
const KONTO = /^[0-9a-f]{32}$/;
type Eintrag = { c: string | null; t: number };

let karte: Map<string, Eintrag> | null = null;
let geladen: Promise<Map<string, Eintrag>> | null = null;
const warteschlange = new Set<string>();
export const avatarStatus = { abrufe: 0, gefunden: 0, letzterFehler: null as string | null, letzterAbruf: null as string | null };

export async function avatare(): Promise<Map<string, Eintrag>> {
  if (karte) return karte;
  geladen ??= liesJson<Record<string, Eintrag>>(DATEI, {}).catch(() => ({} as Record<string, Eintrag>)).then((o) => (karte = new Map(Object.entries(o ?? {}))));
  return geladen;
}

/** Die Bildadresse zu einer Cosmetic-Id (ueber unsere Route, damit Cache und Ausfall bei uns liegen). */
export const avatarUrl = (c: string) => `/api/avatar?c=${encodeURIComponent(c)}`;

/** Avatar eines Kontos aus dem geladenen Stand - null, wenn (noch) keiner bekannt ist. Unbekannte und alte Eintraege werden vorgemerkt. */
export function avatarVon(stand: Map<string, Eintrag> | undefined, id: string): string | null {
  const k = id.toLowerCase();
  const e = stand?.get(k);
  if (!e || Date.now() - e.t > NEU_MS) merkeFehlend(k);
  return e?.c ? avatarUrl(e.c) : null;
}

export function merkeFehlend(id: string) {
  if (KONTO.test(id) && warteschlange.size < 5000) warteschlange.add(id);
  if (!uhr) uhr = setTimeout(() => { uhr = null; void abarbeiten(); }, 20_000);
}

let uhr: ReturnType<typeof setTimeout> | null = null;
let laeuft = false;
async function abarbeiten() {
  if (laeuft || !warteschlange.size) return;
  laeuft = true;
  try {
    const ids = [...warteschlange].slice(0, 100);
    ids.forEach((i) => warteschlange.delete(i));
    const { token } = await getToken();
    avatarStatus.abrufe += 1; avatarStatus.letzterAbruf = new Date().toISOString();
    const jetzt = Date.now();
    const neu: Record<string, Eintrag> = {};
    let okAntworten = 0;
    // Epic antwortet mit 500, wenn eine einzige Id in der Abfrage kein gueltiges Konto ist - dann halbieren, bis die schuldige Id allein steht.
    const frage = async (teil: string[], tiefe: number): Promise<void> => {
      const r = await fetch(`https://avatar-service-prod.identity.live.on.epicgames.com/v1/avatar/fortnite/ids?accountIds=${teil.join(',')}`,
        { headers: { Authorization: token }, signal: AbortSignal.timeout(10_000), cache: 'no-store' });
      if (!r.ok) {
        if (r.status >= 500 && teil.length > 1 && tiefe < 8) {
          const h = Math.ceil(teil.length / 2);
          await frage(teil.slice(0, h), tiefe + 1); await frage(teil.slice(h), tiefe + 1);
          return;
        }
        if (r.status >= 500 && teil.length === 1) { neu[teil[0]] = { c: null, t: jetzt }; return; }
        avatarStatus.letzterFehler = `HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`;
        return;
      }
      okAntworten += 1;
      const liste = await r.json() as Array<{ accountId?: string; avatarId?: string }>;
      for (const id of teil) neu[id] = { c: null, t: jetzt };
      for (const a of Array.isArray(liste) ? liste : []) {
        const id = String(a.accountId ?? '').replace(/-/g, '').toLowerCase();
        const c = String(a.avatarId ?? '').split(':').pop()?.toLowerCase() ?? '';
        if (KONTO.test(id) && /^[a-z0-9_]+$/.test(c)) { neu[id] = { c, t: jetzt }; avatarStatus.gefunden += 1; }
      }
    };
    await frage(ids, 0);
    // Keine einzige Antwort ging durch: das liegt nicht an einzelnen Ids (Zugang, Dienst) - dann nichts als "ohne Avatar" merken, spaeter neu.
    if (!okAntworten) { avatarStatus.letzterFehler ??= 'keine Abfrage erfolgreich'; ids.forEach((i) => warteschlange.add(i)); return; }
    const m = await avatare();
    for (const [k, v] of Object.entries(neu)) m.set(k, v);
    await aendereJson<Record<string, Eintrag>>(DATEI, {}, (o) => { Object.assign(o, neu); }, 0);
    avatarStatus.letzterFehler = null;
  } catch (e) { avatarStatus.letzterFehler = (e as Error).message; }
  finally {
    laeuft = false;
    if (warteschlange.size && !uhr) uhr = setTimeout(() => { uhr = null; void abarbeiten(); }, 20_000);
  }
}
