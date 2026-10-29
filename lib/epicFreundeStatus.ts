import crypto from 'crypto';
import { getToken } from '@/lib/epicCups';

/*
 * Der Online-Status der Epic-Freunde des CompHub-Kontos - fuer den Match-ID-Finder (Betreiber, 29.10.2026: "irgendwie muss das moeglich sein ...
 * ich kenne Leute, die haben das").
 *
 * Epic gibt die laufende Sitzung eines fremden Spielers nicht heraus (findPlayer liefert fuer jeden anderen ein leeres [] - gegen Clix getestet,
 * waehrend er mit 8.700 Zuschauern live spielte), und eine Scrim-Kennung hat bei Yunite und Noble nur 16 bzw. 4 Zeichen. Den Status eines FREUNDES
 * schickt Epic aber ueber seinen Chat-Dienst (XMPP): im laufenden Game mit "SessionId", der vollen Match-ID. Genau so arbeiten andere Match-ID-Finder.
 *
 * Eine Verbindung je Serverprozess, beim ersten Abruf gestartet; bricht sie ab, wird mit frischem Schluessel neu verbunden. Gemerkt wird je Freund
 * der letzte Status (nur im Speicher - nach einem Neustart melden sich die Freunde beim Verbinden von selbst wieder).
 */

export interface FreundStatus {
  /** Die volle Match-ID, solange er in einem Game ist - sonst null. */
  sessionId: string | null;
  /** Epics Statuszeile, etwa "Battle Royale - 64 Left". */
  zeile: string;
  playlist: string | null;
  kills: number | null;
  /** Seit wann diese Sitzung bekannt ist. */
  seit: string | null;
  zuletzt: string;
}

interface Zustand {
  freunde: Map<string, FreundStatus>;
  laeuft: boolean;
  verbunden: boolean;
  fehler: string | null;
  start: Promise<void> | null;
  ping?: ReturnType<typeof setInterval> | null;
}

const g = globalThis as unknown as { __epicFreunde?: Zustand };
const zustand: Zustand = g.__epicFreunde ??= { freunde: new Map(), laeuft: false, verbunden: false, fehler: null, start: null };

function lies(von: string, roh: string) {
  let j: { Status?: string; SessionId?: string; Properties?: Record<string, unknown> } = {};
  try { j = JSON.parse(roh); } catch { return; }
  const props = j.Properties ?? {};
  const stats = (props.FortGameplayStats_j ?? null) as { playlist?: string; numKills?: number } | null;
  const id = /^[0-9a-f]{32}$/i.test(j.SessionId ?? '') ? String(j.SessionId).toLowerCase() : null;
  const alt = zustand.freunde.get(von);
  const jetzt = new Date().toISOString();
  zustand.freunde.set(von, {
    sessionId: id,
    zeile: String(j.Status ?? ''),
    playlist: stats?.playlist && stats.playlist !== 'None' ? stats.playlist : null,
    kills: typeof stats?.numKills === 'number' ? stats.numKills : null,
    seit: id ? (alt?.sessionId === id ? alt.seit : jetzt) : null,
    zuletzt: jetzt,
  });
}

async function verbinde(): Promise<void> {
  const { client, xml } = await import('@xmpp/client');
  const { token, accountId } = await getToken();
  const xmpp = client({
    service: 'wss://xmpp-service-prod.ol.epicgames.com',
    domain: 'prod.ol.epicgames.com',
    resource: `V2:Fortnite:WIN::${crypto.randomUUID().replace(/-/g, '').toUpperCase()}`,
    username: accountId,
    password: String(token).replace(/^bearer\s+/i, ''),
  });
  xmpp.on('error', (e: Error) => { zustand.fehler = e.message; });
  xmpp.on('stanza', (s: { is: (n: string) => boolean; attrs: Record<string, string>; getChildText: (n: string) => string | null }) => {
    if (!s.is('presence')) return;
    const von = String(s.attrs.from ?? '').split('@')[0].toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(von) || von === accountId) return;
    // Abgemeldet: kein Game mehr.
    if (s.attrs.type === 'unavailable') {
      const alt = zustand.freunde.get(von);
      if (alt) zustand.freunde.set(von, { ...alt, sessionId: null, seit: null, zeile: '', zuletzt: new Date().toISOString() });
      return;
    }
    const status = s.getChildText('status');
    if (status) lies(von, status);
  });
  xmpp.on('online', async () => {
    zustand.verbunden = true; zustand.fehler = null;
    // Ein Lebenszeichen jede Minute - ohne trennt Epic die Verbindung nach rund 90 Sekunden (29.10.2026 gemessen).
    if (zustand.ping) clearInterval(zustand.ping);
    zustand.ping = setInterval(() => {
      void xmpp.send(xml('iq', { type: 'get', id: crypto.randomUUID(), to: 'prod.ol.epicgames.com' }, xml('ping', { xmlns: 'urn:xmpp:ping' }))).catch(() => {});
    }, 55_000);
    // Unsichtbar-artig "abwesend" melden - noetig, damit Epic die Status der Freunde schickt.
    await xmpp.send(xml('presence', {}, xml('status', {}, JSON.stringify({ Status: '', bIsPlaying: false, bIsJoinable: false, bHasVoiceSupport: false, SessionId: '', Properties: {} })), xml('show', {}, 'away')));
  });
  xmpp.on('offline', () => {
    zustand.verbunden = false;
    // Neu verbinden (frischer Schluessel), mit kurzer Pause.
    setTimeout(() => { zustand.start = verbinde().catch((e) => { zustand.fehler = (e as Error).message; }); }, 15_000);
  });
  await xmpp.start();
}

/** Startet die Verbindung, falls noch nicht geschehen - und wartet beim ersten Mal kurz, bis die ersten Status da sind. */
export async function freundesStatus(): Promise<{ freunde: Map<string, FreundStatus>; verbunden: boolean; fehler: string | null }> {
  if (!zustand.laeuft) {
    zustand.laeuft = true;
    zustand.start = verbinde().catch((e) => { zustand.fehler = (e as Error).message; zustand.laeuft = false; });
    await Promise.race([zustand.start, new Promise((r) => setTimeout(r, 6_000))]);
  }
  return { freunde: zustand.freunde, verbunden: zustand.verbunden, fehler: zustand.fehler };
}
