import { liesJson, schreibJson } from '@/lib/ablage';
import crypto from 'crypto';
import { getToken } from '@/lib/epicCups';
import { promises as fs } from 'fs';
import path from 'path';
import { DATEN_ORT } from '@/lib/datenOrt';

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

/*
 * Zwei Konten (7.11.2026): das des Betreibers (seine bisherigen Freunde) und das Bot-Konto der Seite ("comphub.", data/epic-auth-bot.json), das den Pros
 * Freundschaftsanfragen schickt (scripts/bot-freunde.mjs). Je Konto eine Verbindung; der Match-Finder sieht die Freunde beider.
 */
type Konto = 'haupt' | 'bot';
const g = globalThis as unknown as { __epicFreunde?: Zustand; __epicFreundeBot?: Zustand };
const neu = (): Zustand => ({ freunde: new Map(), laeuft: false, verbunden: false, fehler: null, start: null });
const zustaende: Record<Konto, Zustand> = { haupt: g.__epicFreunde ??= neu(), bot: g.__epicFreundeBot ??= neu() };
const zustand = zustaende.haupt;

/** Die Anmeldung des Bot-Kontos (Geraete-Zugang aus data/epic-auth-bot.json) - oder null, wenn es keins gibt. */
async function botToken(): Promise<{ token: string; accountId: string } | null> {
  const roh = await fs.readFile(path.join(DATEN_ORT, 'epic-auth-bot.json'), 'utf8').catch(() => null);
  if (!roh) return null;
  const a = JSON.parse(roh) as { accountId: string; deviceId: string; secret: string };
  const r = await fetch('https://account-public-service-prod.ol.epicgames.com/account/api/oauth/token', {
    method: 'POST',
    headers: { Authorization: 'basic ' + Buffer.from('3f69e56c7649492c8cc29f1af08a8a12:b51ee9cb12234f50a69efa67ef53812e').toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'device_auth', account_id: a.accountId, device_id: a.deviceId, secret: a.secret }),
  });
  if (!r.ok) throw new Error(`Bot-Anmeldung: HTTP ${r.status}`);
  const j = await r.json() as { access_token: string; account_id: string };
  return { token: `bearer ${j.access_token}`, accountId: j.account_id };
}

function lies(von: string, roh: string, zustand: Zustand) {
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

async function verbinde(konto: Konto = 'haupt'): Promise<void> {
  const zustand = zustaende[konto];
  const { client, xml } = await import('@xmpp/client');
  const zugang = konto === 'bot' ? await botToken() : await getToken();
  if (!zugang) { zustand.fehler = 'kein Bot-Konto'; return; }
  const { token, accountId } = zugang;
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
    if (status) lies(von, status, zustand);
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
    setTimeout(() => { zustand.start = verbinde(konto).catch((e) => { zustand.fehler = (e as Error).message; }); }, 15_000);
  });
  await xmpp.start();
}

/*
 * Die ganze Freundesliste - nur fuer das Epic-Konto, mit dem der Server selbst angemeldet ist (das des Betreibers).
 * Epics offizielle Freigabe (app/api/auth/epic/callback, epic/friends/v1) nennt nur Freunde, die CompHub ebenfalls verbunden haben - am
 * 30.10.2026 kam fuer den Betreiber genau einer an, obwohl er 116 hat. Fuer sein eigenes Konto fragt der Server deshalb die Freundesliste
 * direkt ab (zehn Minuten im Speicher). Fuer jedes andere Konto: null.
 */
let volleListe: { epicId: string; ids: string[]; bis: number } | null = null;
export async function vollstaendigeFreunde(epicId: string | null | undefined): Promise<string[] | null> {
  const gesucht = String(epicId ?? '').replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(gesucht)) return null;
  if (volleListe && volleListe.epicId === gesucht && Date.now() < volleListe.bis) return volleListe.ids;
  try {
    const { token, accountId } = await getToken();
    if (String(accountId).toLowerCase() !== gesucht) return null;
    const r = await fetch(`https://friends-public-service-prod.ol.epicgames.com/friends/api/v1/${accountId}/summary`, {
      headers: { Authorization: `Bearer ${String(token).replace(/^bearer\s+/i, '')}` }, signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return volleListe?.epicId === gesucht ? volleListe.ids : await gemerkteFreunde(gesucht);
    const j = await r.json() as { friends?: Array<{ accountId?: string }> };
    const ids = [...new Set((j.friends ?? []).map((f) => String(f.accountId ?? '').replace(/-/g, '').toLowerCase()).filter((x) => /^[0-9a-f]{32}$/.test(x)))];
    const neu = !volleListe || volleListe.ids.length !== ids.length;
    volleListe = { epicId: gesucht, ids, bis: Date.now() + 10 * 60_000 };
    if (neu) void schreibJson(FREUNDE_DATEI, { epicId: gesucht, ids }).catch(() => {});
    return ids;
  } catch { return volleListe?.epicId === gesucht ? volleListe.ids : await gemerkteFreunde(gesucht); }
}

/** Die zuletzt von Epic gelieferte Liste: antwortet Epic gerade nicht, ist die Freundesliste trotzdem da (nach einem Neustart war sie sonst leer). */
const FREUNDE_DATEI = 'epic-freunde-voll.json';
async function gemerkteFreunde(epicId: string): Promise<string[] | null> {
  const d = await liesJson<{ epicId?: string; ids?: string[] } | null>(FREUNDE_DATEI, null).catch(() => null);
  return d?.epicId === epicId && d.ids?.length ? d.ids : null;
}

/** Startet die Verbindung, falls noch nicht geschehen - und wartet beim ersten Mal kurz, bis die ersten Status da sind. */
export async function freundesStatus(): Promise<{ freunde: Map<string, FreundStatus>; verbunden: boolean; fehler: string | null }> {
  const starts: Array<Promise<void> | null> = [];
  for (const konto of ['haupt', 'bot'] as const) {
    const z = zustaende[konto];
    if (z.laeuft) continue;
    z.laeuft = true;
    z.start = verbinde(konto).catch((e) => { z.fehler = (e as Error).message; z.laeuft = false; });
    starts.push(z.start);
  }
  if (starts.length) await Promise.race([Promise.all(starts), new Promise((r) => setTimeout(r, 6_000))]);
  // Beide zusammen: wer bei einem Konto in einem Game ist, zaehlt.
  const freunde = new Map(zustaende.haupt.freunde);
  for (const [id, f] of zustaende.bot.freunde) { const alt = freunde.get(id); if (!alt || (!alt.sessionId && f.sessionId)) freunde.set(id, f); }
  return { freunde, verbunden: zustaende.haupt.verbunden || zustaende.bot.verbunden, fehler: zustaende.haupt.fehler };
}
