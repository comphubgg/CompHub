import { liesJson, schreibJson } from '@/lib/ablage';
import crypto from 'crypto';
import { getToken } from '@/lib/epicCups';
import { promises as fs } from 'fs';
import path from 'path';
import { DATEN_ORT } from '@/lib/datenOrt';
import { melde } from '@/lib/liveStrom';

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
  /** Seit wann die Verbindung steht (ISO) - fuer die Statuszeile der Admins. */
  seit?: string | null;
}

/*
 * Zwei Konten (7.11.2026): das des Betreibers (seine bisherigen Freunde) und das Bot-Konto der Seite ("comphub.", data/epic-auth-bot.json), dessen schon
 * angenommene Freunde weiter zaehlen (Anfragen schickt es seit 16.11.2026 keine mehr, #21). Je Konto eine Verbindung; der Match-Finder sieht die Freunde beider.
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
  const r = await fetch(`${process.env.EPIC_ACCOUNT_URL || 'https://account-public-service-prod.ol.epicgames.com'}/account/api/oauth/token`, {
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
  meldeWechsel(von, alt);
}

/*
 * Sofort an die offenen Match-ID-Stroeme (app/api/streams/match-id/stream): Epic schickt den Status per XMPP im Augenblick des Wechsels,
 * und genau dann soll er auf der Seite stehen - nicht erst beim naechsten Abfragetakt. Gemeldet wird nur, was sich fuer die Anzeige aendert.
 */
export const freundKanal = (epicId: string) => `freund:${epicId.toLowerCase()}`;
function meldeWechsel(von: string, alt: FreundStatus | undefined) {
  const f = gemischt(von);
  if (alt && f && alt.sessionId === f.sessionId && alt.zeile === f.zeile && alt.playlist === f.playlist && alt.kills === f.kills) return;
  melde(freundKanal(von), 'freund', f);
}

/** Der Status eines Freundes ueber beide Konten (wer bei einem Konto in einem Game ist, zaehlt) - wie in freundesStatus(). */
function gemischt(id: string): FreundStatus | null {
  const a = zustaende.haupt.freunde.get(id);
  const b = zustaende.bot.freunde.get(id);
  if (!a) return b ?? null;
  if (b && !a.sessionId && b.sessionId) return b;
  return a;
}

async function verbinde(konto: Konto = 'haupt'): Promise<void> {
  const zustand = zustaende[konto];
  const { client, xml } = await import('@xmpp/client');
  const zugang = konto === 'bot' ? await botToken() : await getToken();
  if (!zugang) { zustand.fehler = 'kein Bot-Konto'; return; }
  const { token, accountId } = zugang;
  const xmpp = client({
    service: process.env.EPIC_XMPP_URL || 'wss://xmpp-service-prod.ol.epicgames.com',
    domain: 'prod.ol.epicgames.com',
    resource: `V2:Fortnite:WIN::${crypto.randomUUID().replace(/-/g, '').toUpperCase()}`,
    username: accountId,
    password: String(token).replace(/^bearer\s+/i, ''),
  });
  console.log(`[XMPP ${konto}] verbinde (im Seitenprozess)`);
  xmpp.on('error', (e: Error) => { zustand.fehler = e.message; console.warn(`[XMPP ${konto}] Fehler: ${e.message}`); });
  xmpp.on('disconnect', () => { console.warn(`[XMPP ${konto}] Verbindung abgerissen - @xmpp/client verbindet selbst neu`); });
  xmpp.on('stanza', (s: { is: (n: string) => boolean; attrs: Record<string, string>; getChildText: (n: string) => string | null }) => {
    if (!s.is('presence')) return;
    const von = String(s.attrs.from ?? '').split('@')[0].toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(von) || von === accountId) return;
    // Abgemeldet: kein Game mehr.
    if (s.attrs.type === 'unavailable') {
      const alt = zustand.freunde.get(von);
      if (alt) { zustand.freunde.set(von, { ...alt, sessionId: null, seit: null, zeile: '', zuletzt: new Date().toISOString() }); meldeWechsel(von, alt); }
      return;
    }
    const status = s.getChildText('status');
    if (status) lies(von, status, zustand);
  });
  xmpp.on('online', async () => {
    zustand.verbunden = true; zustand.fehler = null; zustand.seit = new Date().toISOString();
    console.log(`[XMPP ${konto}] online`);
    // Ein Lebenszeichen jede Minute - ohne trennt Epic die Verbindung nach rund 90 Sekunden (29.10.2026 gemessen).
    if (zustand.ping) clearInterval(zustand.ping);
    zustand.ping = setInterval(() => {
      void xmpp.send(xml('iq', { type: 'get', id: crypto.randomUUID(), to: 'prod.ol.epicgames.com' }, xml('ping', { xmlns: 'urn:xmpp:ping' }))).catch(() => {});
    }, 55_000);
    // Unsichtbar-artig "abwesend" melden - noetig, damit Epic die Status der Freunde schickt.
    await xmpp.send(xml('presence', {}, xml('status', {}, JSON.stringify({ Status: '', bIsPlaying: false, bIsJoinable: false, bHasVoiceSupport: false, SessionId: '', Properties: {} })), xml('show', {}, 'away')));
  });
  xmpp.on('offline', () => {
    zustand.verbunden = false; zustand.seit = null;
    console.warn(`[XMPP ${konto}] getrennt - neu in 15 s`);
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

/*
 * Der eigene XMPP-Dienst (scripts/xmpp-dienst.mjs, Compose-Dienst "xmpp", Betreiber 15.11.2026): ist XMPP_DIENST_URL gesetzt, haelt NICHT dieser Prozess
 * die Verbindung zu Epic, sondern der Dienst - ein Update der Seite trennt sie so nicht mehr. Die Seite haengt an seinem Strom (/strom): beim Verbinden der
 * ganze Stand ("hallo"), danach jeder Wechsel ("freund"), der hier sofort an die Match-ID-Stroeme geht. Ist der Dienst 45 s lang nicht zu erreichen,
 * verbindet sich dieser Prozess wie frueher selbst (Rueckfall) - kommt der Dienst wieder, gilt wieder er.
 */
const DIENST = (process.env.XMPP_DIENST_URL || '').replace(/\/+$/, '');
interface DienstStatus {
  dienst: true; gestartet?: string; verbunden: boolean; freunde: number; imGame: number;
  konten?: Record<string, { verbunden: boolean; seit: string | null; fehler: string | null; freunde: number; imGame: number; verbindungen: number }>;
}
const gd = globalThis as unknown as { __xmppDienst?: { laeuft: boolean; erreichbar: boolean; seit: number | null; weg: number; freunde: Map<string, FreundStatus>; status: DienstStatus | null; erstes: Promise<void> | null; erstesFertig: (() => void) | null } };
const dienst = (gd.__xmppDienst ??= { laeuft: false, erreichbar: false, seit: null, weg: Date.now(), freunde: new Map(), status: null, erstes: null, erstesFertig: null });
const STATUS_KANAL = 'freunde-status';
/** Kanal fuer Statuswechsel (Dienst/Verbindung) - die Match-ID-Stroeme der Admins hoeren mit. */
export const freundeStatusKanal = STATUS_KANAL;

function dienstStarten() {
  if (dienst.laeuft || !DIENST) return;
  dienst.laeuft = true;
  dienst.erstes = new Promise<void>((r) => { dienst.erstesFertig = r; });
  const fertig = () => { dienst.erstesFertig?.(); dienst.erstesFertig = null; };
  const lauf = async () => {
    for (;;) {
      try {
        const r = await fetch(`${DIENST}/strom`, { headers: process.env.XMPP_DIENST_GEHEIM ? { Authorization: `Bearer ${process.env.XMPP_DIENST_GEHEIM}` } : {}, cache: 'no-store' });
        if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
        const leser = r.body.getReader();
        const dec = new TextDecoder();
        let puffer = '';
        let stille: ReturnType<typeof setTimeout> | null = null;
        const wache = () => { if (stille) clearTimeout(stille); stille = setTimeout(() => { void leser.cancel().catch(() => {}); }, 45_000); };
        wache();
        for (;;) {
          const { value, done } = await leser.read();
          if (done) break;
          wache();
          puffer += dec.decode(value, { stream: true });
          let i: number;
          while ((i = puffer.indexOf('\n\n')) >= 0) {
            const block = puffer.slice(0, i); puffer = puffer.slice(i + 2);
            const name = /^event: (.*)$/m.exec(block)?.[1];
            const roh = /^data: (.*)$/m.exec(block)?.[1];
            if (!name || !roh || name === 'hb') continue;
            const d = JSON.parse(roh);
            if (name === 'hallo') {
              const neu = new Map<string, FreundStatus>(Object.entries((d.freunde ?? {}) as Record<string, FreundStatus | null>).filter((e): e is [string, FreundStatus] => !!e[1]));
              const alt = dienst.freunde;
              dienst.freunde = neu;
              dienst.status = d.status ?? null;
              if (!dienst.erreichbar) console.log(`[XMPP-Dienst] verbunden (${DIENST}): ${neu.size} Freunde, XMPP ${dienst.status?.verbunden ? 'online' : 'GETRENNT'}`);
              dienst.erreichbar = true; dienst.seit = Date.now();
              // Was sich waehrend der Trennung geaendert hat, sofort melden.
              for (const id of new Set([...alt.keys(), ...neu.keys()])) {
                const a = alt.get(id), b = neu.get(id);
                if (a?.sessionId !== b?.sessionId || a?.zeile !== b?.zeile) melde(freundKanal(id), 'freund', b ?? null);
              }
              melde(STATUS_KANAL, 'status', freundeDienstStatus());
              fertig();
            } else if (name === 'freund') {
              if (d.status) dienst.freunde.set(d.id, d.status); else dienst.freunde.delete(d.id);
              melde(freundKanal(d.id), 'freund', d.status ?? null);
            } else if (name === 'status') {
              dienst.status = d;
              console.log(`[XMPP-Dienst] Status: XMPP ${d.verbunden ? 'online' : 'GETRENNT'}, ${d.freunde} Freunde, ${d.imGame} im Game`);
              melde(STATUS_KANAL, 'status', freundeDienstStatus());
            }
          }
        }
        if (stille) clearTimeout(stille);
        throw new Error('Strom zu Ende');
      } catch (e) {
        if (dienst.erreichbar) { console.warn(`[XMPP-Dienst] getrennt: ${(e as Error)?.message ?? e}`); dienst.weg = Date.now(); melde(STATUS_KANAL, 'status', freundeDienstStatus()); }
        dienst.erreichbar = false;
        // Rueckfall: der Dienst ist zu lange weg - selbst verbinden (einmal gestartet, bleibt die eigene Verbindung als Reserve bestehen).
        if (Date.now() - dienst.weg > 45_000 && !zustaende.haupt.laeuft) {
          console.warn('[XMPP-Dienst] 45 s nicht erreichbar - Rueckfall: der Seitenprozess verbindet selbst');
          lokalStarten();
          fertig();
        }
        await new Promise((r) => setTimeout(r, 2_000));
      }
    }
  };
  void lauf();
}

/** Fuer die Statuszeile der Admins (Match-ID-Anzeige): woher die Status kommen, seit wann verbunden, wie viele Freunde. */
export function freundeDienstStatus() {
  if (DIENST && dienst.erreichbar && dienst.status) {
    const k = dienst.status.konten ?? {};
    const seit = [k.haupt?.seit, k.bot?.seit].filter(Boolean).sort()[0] ?? null;
    const alle = [...dienst.freunde.values()];
    return { quelle: 'dienst' as const, verbunden: dienst.status.verbunden, seit, freunde: alle.length, imGame: alle.filter((f) => f.sessionId).length, konten: k };
  }
  const freunde = new Set([...zustaende.haupt.freunde.keys(), ...zustaende.bot.freunde.keys()]).size;
  const seit = [zustaende.haupt.seit, zustaende.bot.seit].filter(Boolean).sort()[0] ?? null;
  return {
    quelle: (DIENST ? 'rueckfall' : 'seite') as 'rueckfall' | 'seite', verbunden: zustaende.haupt.verbunden || zustaende.bot.verbunden, seit, freunde,
    imGame: [...zustaende.haupt.freunde.values(), ...zustaende.bot.freunde.values()].filter((f) => f.sessionId).length,
    dienstErreichbar: DIENST ? dienst.erreichbar : undefined,
  };
}

function lokalStarten(): Array<Promise<void> | null> {
  const starts: Array<Promise<void> | null> = [];
  for (const konto of ['haupt', 'bot'] as const) {
    const z = zustaende[konto];
    if (z.laeuft) continue;
    z.laeuft = true;
    z.start = verbinde(konto).catch((e) => { z.fehler = (e as Error).message; z.laeuft = false; });
    starts.push(z.start);
  }
  return starts;
}

/** Startet die Verbindung, falls noch nicht geschehen - und wartet beim ersten Mal kurz, bis die ersten Status da sind. */
export async function freundesStatus(): Promise<{ freunde: Map<string, FreundStatus>; verbunden: boolean; fehler: string | null }> {
  if (DIENST) {
    dienstStarten();
    if (dienst.erstes) await Promise.race([dienst.erstes, new Promise((r) => setTimeout(r, 3_000))]);
    if (dienst.erreichbar) return { freunde: new Map(dienst.freunde), verbunden: !!dienst.status?.verbunden, fehler: null };
    if (!zustaende.haupt.laeuft) return { freunde: new Map(dienst.freunde), verbunden: false, fehler: 'XMPP-Dienst nicht erreichbar' };
  }
  const starts = lokalStarten();
  if (starts.length) await Promise.race([Promise.all(starts), new Promise((r) => setTimeout(r, 6_000))]);
  // Beide zusammen: wer bei einem Konto in einem Game ist, zaehlt.
  const freunde = new Map(zustaende.haupt.freunde);
  for (const [id, f] of zustaende.bot.freunde) { const alt = freunde.get(id); if (!alt || (!alt.sessionId && f.sessionId)) freunde.set(id, f); }
  return { freunde, verbunden: zustaende.haupt.verbunden || zustaende.bot.verbunden, fehler: zustaende.haupt.fehler };
}
