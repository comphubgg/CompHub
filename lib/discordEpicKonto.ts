/*
 * /link-account und /unlink-account (Betreiber, 15.11.2026): ein Discord-Nutzer verknuepft sein Epic-Konto, damit /stats seinen GENAUEN Platz zeigt -
 * auch hinter Platz 10.000. Epic gibt den Eintrag hinter 10.000 nur dem eigenen Konto heraus (geprueft am 15.11.2026, scripts/team-probe.mjs:
 * Bestenliste mit teamAccountIds eines fremden Kontos -> 400 "is not a member of team"; history/<fremdes Konto> -> 403, verlangt
 * Fortnite:profile:<id>:commands READ). Mit dem Token des Kontos selbst gilt beides.
 *
 * Der Weg ist derselbe wie bei scripts/epic-login.js (dort fuer das Konto des Werkzeugs), nur fuer den Nutzer:
 *   1. Der Nutzer oeffnet bei epicgames.com (angemeldet) LOGIN_URL des Android-Spiel-Clients und kopiert den "authorizationCode".
 *   2. /link-account code:<Code> - der Server tauscht den Code gegen ein Token und legt damit eine Geraete-Anmeldung an (deviceId, accountId,
 *      secret), meldet das Token sofort wieder ab und speichert die Geraete-Anmeldung VERSCHLUESSELT.
 *   3. /stats holt mit dieser Anmeldung den eigenen Eintrag des Teams (lib/discordSpielerKarte: "exact rank via linked Epic account").
 *   4. /unlink-account widerruft die Geraete-Anmeldung bei Epic und loescht den Eintrag.
 *
 * Gespeichert wird ueber die Ablage (lib/ablage, speicher) unter "discord-epic-links/" - das ist kein Release-Ordner (lib/ablageGithub AM_RELEASE),
 * also nie oeffentlich. Je Nutzer eine Datei, damit ein Lesefehler nie fremde Eintraege ueberschreibt. Dateinamen sind HMACs (keine Discord- oder
 * Epic-Id im Klartext), der Inhalt ist AES-256-GCM-verschluesselt. Schluessel: LINK_SECRET, sonst abgeleitet aus AUTH_COOKIE_SECRET (bzw. DISCORD_/TWITCH_CLIENT_SECRET wie lib/konten). Ohne alles
 * ist die Verknuepfung abgeschaltet. Geheimnisse (Code, Token, secret) werden nie geloggt und nie zurueckgegeben.
 */

import crypto from 'crypto';
import { speicher } from '@/lib/ablage';
import { ACCOUNT, EVENTS, LOGIN_URL, SPIEL_BASIC } from '@/lib/epicCups';

export { LOGIN_URL };
const ORDNER = 'discord-epic-links';

interface Eintrag { discordId: string; accountId: string; deviceId: string; secret: string; displayName: string; seit: string }

/* ------------------------------------------------------------------ Schluessel */

function schluessel(): Buffer | null {
  const eigen = (process.env.LINK_SECRET || '').trim();
  if (eigen) return crypto.createHash('sha256').update(`comphub-link|${eigen}`).digest();
  // Sonst dasselbe Geheimnis, mit dem die Seite ihre Anmeldungen unterschreibt (lib/konten: AUTH_COOKIE_SECRET, sonst die Client-Geheimnisse).
  const keks = (process.env.AUTH_COOKIE_SECRET || process.env.DISCORD_CLIENT_SECRET || process.env.TWITCH_CLIENT_SECRET || '').trim();
  if (keks) return crypto.createHash('sha256').update(`comphub-epic-link-v1|${keks}`).digest();
  return null;
}
export function verknuepfungMoeglich(): boolean { return schluessel() !== null; }

const kennung = (art: 'd' | 'e', id: string) => {
  const k = schluessel();
  if (!k) throw new Error('kein Schluessel');
  return crypto.createHmac('sha256', k).update(`${art}:${id.toLowerCase()}`).digest('hex').slice(0, 40);
};

function verschluesseln(wert: unknown): string {
  const k = schluessel()!;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const inhalt = Buffer.concat([c.update(JSON.stringify(wert), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), inhalt]).toString('base64');
}
function entschluesseln<T>(text: string): T | null {
  try {
    const k = schluessel()!;
    const roh = Buffer.from(text, 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', k, roh.subarray(0, 12));
    d.setAuthTag(roh.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(roh.subarray(28)), d.final()]).toString('utf8')) as T;
  } catch { return null; }
}

/* ------------------------------------------------------------------ Ablage */

const dateiD = (discordId: string) => `${ORDNER}/d-${kennung('d', discordId)}.json`;
const dateiE = (epicId: string) => `${ORDNER}/e-${kennung('e', epicId)}.json`;

async function liesEintrag(discordId: string): Promise<Eintrag | null> {
  const roh = await speicher.lies(dateiD(discordId));
  if (!roh) return null;
  try { const j = JSON.parse(roh.toString('utf8')) as { v?: number; e?: string }; return j.e ? entschluesseln<Eintrag>(j.e) : null; } catch { return null; }
}

/** Ist dieser Discord-Nutzer verknuepft? Name und Konto (ohne Geheimnisse). */
export async function verknuepfungVon(discordId: string): Promise<{ accountId: string; displayName: string } | null> {
  if (!verknuepfungMoeglich()) return null;
  const e = await liesEintrag(discordId).catch(() => null);
  return e ? { accountId: e.accountId, displayName: e.displayName } : null;
}

/** Hat ein Discord-Nutzer dieses Epic-Konto verknuepft? (fuer /stats eines anderen Spielers, der selbst verknuepft ist) */
async function eintragZuEpic(epicId: string): Promise<Eintrag | null> {
  if (!verknuepfungMoeglich()) return null;
  const roh = await speicher.lies(dateiE(epicId)).catch(() => null);
  if (!roh) return null;
  try {
    const j = JSON.parse(roh.toString('utf8')) as { e?: string };
    const z = j.e ? entschluesseln<{ discordId: string }>(j.e) : null;
    if (!z) return null;
    const e = await liesEintrag(z.discordId);
    return e && e.accountId === epicId.toLowerCase() ? e : null;
  } catch { return null; }
}

/* ------------------------------------------------------------------ Epic */

class EpicFehler extends Error { constructor(public status: number, public code: string, text: string) { super(text); } }

async function epic<T>(url: string, init: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000), cache: 'no-store' });
  const text = await r.text();
  let j: Record<string, unknown> = {};
  try { j = JSON.parse(text); } catch { /* kein JSON */ }
  if (!r.ok) throw new EpicFehler(r.status, String(j.errorCode ?? ''), String(j.errorMessage ?? `HTTP ${r.status}`).slice(0, 200));
  return j as T;
}
const tokenAbmelden = (token: string) => fetch(`${ACCOUNT}/account/api/oauth/sessions/kill/${encodeURIComponent(token)}`, {
  method: 'DELETE', headers: { Authorization: `bearer ${token}` }, signal: AbortSignal.timeout(10_000),
}).catch(() => null);

/** Den Code aus beliebiger Eingabe: nur der Code oder die ganze Zeile von Epic ({"authorizationCode":"..."}). */
export function codeAus(eingabe: string): string | null {
  const m = /"authorizationCode"\s*:\s*"([0-9a-f]{32})"/i.exec(eingabe) ?? /\b([0-9a-f]{32})\b/i.exec(eingabe);
  return m ? m[1].toLowerCase() : null;
}

export type VerknuepfenErgebnis =
  | { ok: true; displayName: string; accountId: string; ersetzt: boolean }
  | { ok: false; grund: 'aus' | 'code' | 'abgelaufen' | 'epic' | 'speichern'; text?: string };

/** /link-account code:<Code> */
export async function verknuepfen(discordId: string, eingabe: string): Promise<VerknuepfenErgebnis> {
  if (!verknuepfungMoeglich()) return { ok: false, grund: 'aus' };
  const code = codeAus(eingabe);
  if (!code) return { ok: false, grund: 'code' };
  let tok: { access_token: string; account_id: string; displayName?: string };
  try {
    tok = await epic(`${ACCOUNT}/account/api/oauth/token`, {
      method: 'POST',
      headers: { Authorization: SPIEL_BASIC, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code }),
    });
  } catch (e) {
    const f = e as EpicFehler;
    // Ein Code gilt nur wenige Minuten und nur einmal.
    if (/authorization_code|invalid_grant|not found/i.test(`${f.code} ${f.message}`)) return { ok: false, grund: 'abgelaufen' };
    return { ok: false, grund: 'epic', text: f.code || f.message };
  }
  try {
    const dev = await epic<{ deviceId: string; accountId: string; secret: string }>(
      `${ACCOUNT}/account/api/public/account/${tok.account_id}/deviceAuth`,
      { method: 'POST', headers: { Authorization: `bearer ${tok.access_token}`, 'Content-Type': 'application/json' }, body: '{}' },
    );
    const alt = await liesEintrag(discordId).catch(() => null);
    const eintrag: Eintrag = {
      discordId, accountId: dev.accountId.toLowerCase(), deviceId: dev.deviceId, secret: dev.secret,
      displayName: tok.displayName ?? '', seit: new Date().toISOString(),
    };
    try {
      await speicher.schreib(dateiD(discordId), Buffer.from(JSON.stringify({ v: 1, e: verschluesseln(eintrag) })));
      await speicher.schreib(dateiE(eintrag.accountId), Buffer.from(JSON.stringify({ v: 1, e: verschluesseln({ discordId }) })));
    } catch {
      // Nicht gespeichert: die eben angelegte Geraete-Anmeldung gleich wieder widerrufen, sonst bliebe sie verwaist bei Epic.
      await fetch(`${ACCOUNT}/account/api/public/account/${dev.accountId}/deviceAuth/${dev.deviceId}`, {
        method: 'DELETE', headers: { Authorization: `bearer ${tok.access_token}` }, signal: AbortSignal.timeout(10_000),
      }).catch(() => null);
      return { ok: false, grund: 'speichern' };
    }
    // Ein frueher verknuepftes anderes Konto: dessen Anmeldung widerrufen.
    if (alt && (alt.accountId !== eintrag.accountId || alt.deviceId !== eintrag.deviceId)) {
      await widerrufen(alt).catch(() => null);
      if (alt.accountId !== eintrag.accountId) await speicher.loesche(dateiE(alt.accountId)).catch(() => null);
    }
    return { ok: true, displayName: eintrag.displayName, accountId: eintrag.accountId, ersetzt: !!alt };
  } catch (e) {
    return { ok: false, grund: 'epic', text: (e as EpicFehler).code || 'deviceAuth' };
  } finally {
    await tokenAbmelden(tok.access_token);
  }
}

/** Ein Token aus der Geraete-Anmeldung des Nutzers (gemerkt, bis kurz vor Ablauf). */
const tokens = new Map<string, { token: string; bis: number }>();
async function tokenFuer(e: Eintrag): Promise<string> {
  const da = tokens.get(e.accountId);
  if (da && da.bis > Date.now()) return da.token;
  const t = await epic<{ access_token: string; expires_in?: number }>(`${ACCOUNT}/account/api/oauth/token`, {
    method: 'POST',
    headers: { Authorization: SPIEL_BASIC, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'device_auth', account_id: e.accountId, device_id: e.deviceId, secret: e.secret }),
  });
  const token = `bearer ${t.access_token}`;
  tokens.set(e.accountId, { token, bis: Date.now() + Math.max(60, (t.expires_in ?? 7200) - 300) * 1000 });
  return token;
}

async function widerrufen(e: Eintrag): Promise<boolean> {
  try {
    const token = await tokenFuer(e);
    const r = await fetch(`${ACCOUNT}/account/api/public/account/${e.accountId}/deviceAuth/${e.deviceId}`, {
      method: 'DELETE', headers: { Authorization: token }, signal: AbortSignal.timeout(10_000),
    });
    await tokenAbmelden(token.replace(/^bearer /, ''));
    tokens.delete(e.accountId);
    return r.ok || r.status === 404;
  } catch (x) {
    // Schon widerrufen (z. B. im Epic-Konto unter "Apps & Accounts" oder durch Passwortaenderung): dann gibt es nichts mehr zu widerrufen.
    return /invalid_account_credentials|credentials you are using are invalid/i.test(`${(x as EpicFehler).code} ${(x as Error).message}`);
  }
}

/** /unlink-account: bei Epic widerrufen und loeschen. */
export async function trennen(discordId: string): Promise<{ ok: boolean; war: boolean; widerrufen: boolean; displayName?: string }> {
  if (!verknuepfungMoeglich()) return { ok: false, war: false, widerrufen: false };
  const e = await liesEintrag(discordId);
  if (!e) {
    await speicher.loesche(dateiD(discordId)).catch(() => null);
    return { ok: true, war: false, widerrufen: false };
  }
  const weg = await widerrufen(e);
  await speicher.loesche(dateiD(discordId));
  await speicher.loesche(dateiE(e.accountId)).catch(() => null);
  return { ok: true, war: true, widerrufen: weg, displayName: e.displayName };
}

/* ------------------------------------------------------------------ Der genaue Eintrag */

export interface GenauerEintrag {
  rank: number; points: number; games: number; wins: number; placements: number[]; teamAccountIds: string[]; percentile?: number;
}

/*
 * Der eigene Eintrag eines Teams in einem Spieltag - mit dem Token eines verknuepften Kontos aus diesem Team.
 * Zuerst Epics Verlauf des Kontos im Event (history/<eigenes Konto>), dann die Bestenliste mit dem eigenen Konto als teamAccountIds.
 */
async function eintragMit(e: Eintrag, eventId: string, windowId: string): Promise<GenauerEintrag | null> {
  const token = await tokenFuer(e);
  type Roh = { rank?: number; pointsEarned?: number; percentile?: number; teamAccountIds?: string[]; scoreKey?: { eventWindowId?: string };
    sessionHistory?: Array<{ trackedStats?: Record<string, number> }> };
  const aus = (x: Roh): GenauerEintrag | null => (typeof x.rank === 'number' && x.rank > 0 ? {
    rank: x.rank, points: x.pointsEarned ?? 0, percentile: x.percentile,
    games: (x.sessionHistory ?? []).length,
    wins: (x.sessionHistory ?? []).filter((s) => s.trackedStats?.PLACEMENT_STAT_INDEX === 1).length,
    placements: (x.sessionHistory ?? []).map((s) => s.trackedStats?.PLACEMENT_STAT_INDEX ?? 0).filter((p) => p > 0),
    teamAccountIds: (x.teamAccountIds ?? []).map((i) => i.toLowerCase()),
  } : null);
  try {
    const h = await epic<Roh[]>(`${EVENTS}/api/v1/events/Fortnite/${encodeURIComponent(eventId)}/history/${e.accountId}`, { headers: { Authorization: token } });
    const w = Array.isArray(h) ? h.find((x) => x.scoreKey?.eventWindowId === windowId) : null;
    const r = w ? aus(w) : null;
    if (r) return r;
  } catch { /* der zweite Weg */ }
  try {
    const l = await epic<{ entries?: Roh[] }>(`${EVENTS}/api/v1/leaderboards/Fortnite/${encodeURIComponent(eventId)}/${encodeURIComponent(windowId)}/${e.accountId}`
      + `?page=0&rank=0&teamAccountIds=${e.accountId}`, { headers: { Authorization: token } });
    const x = (l.entries ?? []).find((z) => (z.teamAccountIds ?? []).some((i) => i.toLowerCase() === e.accountId));
    return x ? aus(x) : null;
  } catch { return null; }
}

/**
 * Der genaue Eintrag fuer ein Team, sofern jemand daraus verknuepft ist: zuerst der Fragende selbst (wenn sein Konto im Team ist), dann jedes
 * Teammitglied, das ein verknuepftes Konto hat. null: niemand verknuepft, oder Epic gab nichts heraus.
 */
export async function genauerEintrag(eventId: string, windowId: string, teamIds: string[], fragender?: string | null): Promise<GenauerEintrag | null> {
  if (!verknuepfungMoeglich() || !teamIds.length) return null;
  const ids = teamIds.map((i) => i.toLowerCase());
  const kandidaten: Eintrag[] = [];
  if (fragender) { const f = await liesEintrag(fragender).catch(() => null); if (f && ids.includes(f.accountId)) kandidaten.push(f); }
  for (const id of ids) {
    if (kandidaten.some((k) => k.accountId === id)) continue;
    const e = await eintragZuEpic(id).catch(() => null);
    if (e) kandidaten.push(e);
  }
  for (const k of kandidaten) {
    const r = await eintragMit(k, eventId, windowId).catch(() => null);
    if (r) return r;
  }
  return null;
}

/** Nur fuer die Probe (scripts/discord-stats-probe.cjs): den Eintrag mit einer gegebenen Geraete-Anmeldung holen, ohne etwas zu speichern. */
export async function probeEintrag(auth: { accountId: string; deviceId: string; secret: string }, eventId: string, windowId: string) {
  return eintragMit({ discordId: 'probe', displayName: '', seit: '', ...auth, accountId: auth.accountId.toLowerCase() }, eventId, windowId);
}

/**
 * Welche Spieltage dieser Events hat ein verknuepftes Konto gespielt (Epics Verlauf, auch hinter Platz 10.000)? Neueste zuerst (nach Fenster-Id).
 * Nur fuer das Konto des Fragenden oder ein Konto, das selbst verknuepft ist - sonst leer.
 */
export async function gespielteFenster(epicId: string, eventIds: string[], fragender?: string | null): Promise<string[]> {
  if (!verknuepfungMoeglich()) return [];
  const id = epicId.toLowerCase();
  const f = fragender ? await liesEintrag(fragender).catch(() => null) : null;
  const e = f?.accountId === id ? f : await eintragZuEpic(id).catch(() => null);
  if (!e) return [];
  const token = await tokenFuer(e).catch(() => null);
  if (!token) return [];
  const raus: string[] = [];
  await Promise.all([...new Set(eventIds)].slice(0, 8).map(async (ev) => {
    try {
      const h = await epic<Array<{ rank?: number; scoreKey?: { eventWindowId?: string } }>>(
        `${EVENTS}/api/v1/events/Fortnite/${encodeURIComponent(ev)}/history/${e.accountId}`, { headers: { Authorization: token } });
      for (const x of Array.isArray(h) ? h : []) if (x.scoreKey?.eventWindowId && (x.rank ?? 0) > 0) raus.push(x.scoreKey.eventWindowId);
    } catch { /* dieses Event nicht */ }
  }));
  return raus.sort().reverse();
}

/** Nur fuer die Probe: verschluesselt schreiben, lesen, loeschen - mit einer Probe-Kennung, ohne Epic. */
export async function probeAblage(): Promise<string> {
  if (!verknuepfungMoeglich()) return 'aus (kein LINK_SECRET / AUTH_COOKIE_SECRET / DISCORD_CLIENT_SECRET)';
  const id = `probe-${Date.now()}`;
  const e: Eintrag = { discordId: id, accountId: '0'.repeat(32), deviceId: 'probe', secret: 'probe', displayName: 'probe', seit: new Date().toISOString() };
  await speicher.schreib(dateiD(id), Buffer.from(JSON.stringify({ v: 1, e: verschluesseln(e) })));
  const roh = (await speicher.lies(dateiD(id)))?.toString('utf8') ?? '';
  const zurueck = await liesEintrag(id);
  await speicher.loesche(dateiD(id));
  const weg = !(await speicher.lies(dateiD(id)));
  return `geschrieben+gelesen ${zurueck?.deviceId === 'probe' ? 'ok' : 'FEHLER'}, Klartext in Datei: ${roh.includes('probe') ? 'JA (FEHLER)' : 'nein'}, geloescht ${weg ? 'ok' : 'FEHLER'}`;
}
