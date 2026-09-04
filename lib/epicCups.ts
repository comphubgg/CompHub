// Live-Daten aus Fortnite-Turnieren direkt von Epic.
//
// Warum direkt und nicht ueber einen Drittanbieter: Epic ist die einzige
// Quelle, die Live-Leaderboards vollstaendig und kostenlos liefert. Die
// bekannten Anbieter verlangen entweder Geld (api-fortnite.com ab 8,49 EUR)
// oder sind praktisch unbrauchbar (CitoAPI: 500 Anfragen pro Monat).
//
// Wichtig: Epic gibt in den Leaderboards nur Account-IDs zurueck, keine
// Namen. Die werden in einem zweiten Schritt aufgeloest - genau der Schritt,
// den Website-Scraping ueberspringt, weshalb dort oft der Esports-Team-Tag
// statt des echten Duo-Partners landet.

import { promises as fs } from 'fs';
import path from 'path';
import { DATEN_ORT } from './datenOrt';

// Oeffentlich dokumentierter Epic Android-Game-Client. Kein Geheimnis.
// Der PC-Client faellt raus: der darf keine dauerhafte Geraete-Anmeldung
// anlegen; der iOS-Client wurde von Epic abgeschaltet.
const CLIENT_ID = '3f69e56c7649492c8cc29f1af08a8a12';
const CLIENT_SECRET = 'b51ee9cb12234f50a69efa67ef53812e';
const BASIC =
  'basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

export const ACCOUNT = 'https://account-public-service-prod.ol.epicgames.com';
export const EVENTS = 'https://events-public-service-live.ol.epicgames.com';
export const LOGIN_URL =
  `https://www.epicgames.com/id/api/redirect?clientId=${CLIENT_ID}&responseType=code`;

// Epic liefert hoechstens 100 Seiten a 100 Eintraege.
export const MAX_PAGES = 100;

const AUTH_FILE = path.join(DATEN_ORT, 'epic-auth.json');

// ---------------------------------------------------------------- Typen

export interface EpicAuth {
  mode: 'device' | 'refresh';
  accountId: string;
  deviceId?: string;
  secret?: string;
  refreshToken?: string;
  displayName?: string;
}

export interface CupSpieler {
  id: string;
  name: string;
  img?: string | null;
  logo?: string | null;
}

export interface CupMatch {
  sessionId?: string;
  endTime?: string;
  placement?: number;
  elims?: number;
  wins?: number;
  timeAlive?: number;
  damage?: number;
  damageTaken?: number;
  headshots?: number;
  damageSquad?: number;
  strecke?: number;
  kisten?: number;
  heilung?: number;
  schild?: number;
  holzGefarmt?: number;
  steinGefarmt?: number;
  metallGefarmt?: number;
  zutatGefarmt?: number;
  holzVerbaut?: number;
  steinVerbaut?: number;
  metallVerbaut?: number;
  zutatVerbaut?: number;
  tiebreaker?: number;
  [key: string]: unknown;
}

export interface CupEintrag {
  rank: number;
  points: number;
  elims: number;
  games: number;
  wins: number;
  bestPlace: number | null;
  damage: number;
  damageTaken: number;
  headshots: number;
  timeAlive: number;
  /** Schaden des gesamten Teams, sofern das Turnier ihn mitschickt. */
  damageSquad: number;
  matsGefarmt: number;
  /** Verbautes Material. Nicht dasselbe wie gesetzte Bauteile. */
  matsVerbaut: number;
  /** Zu Fuss zurueckgelegte Strecke in Zentimetern. */
  strecke: number;
  kisten: number;
  heilung: number;
  schild: number;
  avgPoints: number;
  avgPlace: number;
  avgElims: number;
  avgTimeAlive: number;
  kd: number;
  teamId: string | null;
  matches: CupMatch[];
  players: CupSpieler[];
  page?: number;
}

export interface CupFenster {
  status: 'live' | 'kommt' | 'vorbei';
  begin: number;
  /** Fehlt bei nachgetragenen Turnieren - siehe ArchivEintrag. */
  end?: number;
  name: string;
  eventId: string;
  windowId: string;
}

export class EpicLoginNoetig extends Error {
  needsLogin = true;
  constructor(msg = 'Epic ist nicht eingerichtet. Einmal ausfuehren: npm run epic-login') {
    super(msg);
  }
}

// ---------------------------------------------------------------- HTTP

async function req<T = unknown>(url: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...opts, cache: 'no-store' });
  const text = await res.text();
  let body: unknown;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) {
    const b = body as { errorMessage?: string; errorCode?: string };
    const msg = b?.errorMessage || b?.errorCode || String(text).slice(0, 300);
    throw new Error(`HTTP ${res.status} bei ${url} -> ${msg}`);
  }
  return body as T;
}

// ---------------------------------------------------------------- Anmeldung

// Zugangsdaten kommen entweder aus der Datei (lokal) oder aus einer
// Umgebungsvariablen (fuer Vercel, wo nichts geschrieben werden darf).
async function ladeAuth(): Promise<EpicAuth> {
  const ausEnv = process.env.EPIC_DEVICE_AUTH;
  if (ausEnv) {
    try { return JSON.parse(ausEnv) as EpicAuth; }
    catch { throw new EpicLoginNoetig('EPIC_DEVICE_AUTH ist kein gueltiges JSON'); }
  }
  try {
    return JSON.parse(await fs.readFile(AUTH_FILE, 'utf8')) as EpicAuth;
  } catch {
    throw new EpicLoginNoetig();
  }
}

export async function speichereAuth(a: EpicAuth): Promise<void> {
  await fs.mkdir(path.dirname(AUTH_FILE), { recursive: true });
  await fs.writeFile(AUTH_FILE, JSON.stringify(a, null, 2));
}

export async function istEingerichtet(): Promise<boolean> {
  if (process.env.EPIC_DEVICE_AUTH) return true;
  try { await fs.access(AUTH_FILE); return true; } catch { return false; }
}

// Access-Tokens gelten rund zwei Stunden. Einen im Speicher halten und erst
// kurz vor Ablauf erneuern spart Anfragen an Epic.
let tokenCache: { token: string; accountId: string; displayName?: string } | null = null;
let tokenBis = 0;

export async function getToken() {
  if (tokenCache && Date.now() < tokenBis) return tokenCache;

  const a = await ladeAuth();
  const body = a.mode === 'refresh'
    ? new URLSearchParams({ grant_type: 'refresh_token', refresh_token: a.refreshToken! })
    : new URLSearchParams({
        grant_type: 'device_auth',
        account_id: a.accountId,
        device_id: a.deviceId!,
        secret: a.secret!,
      });

  let tok: { access_token: string; account_id: string; displayName?: string;
             expires_in?: number; refresh_token?: string };
  try {
    tok = await req(`${ACCOUNT}/account/api/oauth/token`, {
      method: 'POST',
      headers: { Authorization: BASIC, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch (e) {
    if (a.mode === 'refresh') throw new EpicLoginNoetig('Die Anmeldung ist abgelaufen.');
    throw e;
  }

  // Refresh-Token rotiert bei jedem Abruf - den neuen sofort sichern.
  if (a.mode === 'refresh' && tok.refresh_token && !process.env.EPIC_DEVICE_AUTH) {
    await speichereAuth({ ...a, refreshToken: tok.refresh_token });
  }

  tokenCache = {
    token: 'bearer ' + tok.access_token,
    accountId: tok.account_id,
    displayName: tok.displayName,
  };
  tokenBis = Date.now() + Math.max(60, (tok.expires_in ?? 7200) - 300) * 1000;
  return tokenCache;
}

// ---------------------------------------------------------------- Namen

const nameCache = new Map<string, string>();

export async function loeseNamenAuf(ids: string[], token: string) {
  const out: Record<string, string> = {};
  const fehlend: string[] = [];
  for (const id of new Set(ids)) {
    const c = nameCache.get(id);
    if (c) out[id] = c; else fehlend.push(id);
  }

  for (let i = 0; i < fehlend.length; i += 100) {
    const chunk = fehlend.slice(i, i + 100);
    const qs = chunk.map((id) => `accountId=${id}`).join('&');
    const accs = await req<Array<{
      id: string; displayName?: string;
      externalAuths?: Record<string, { externalDisplayName?: string;
                                       authIds?: Array<{ id: string }> }>;
    }>>(`${ACCOUNT}/account/api/public/account?${qs}`, {
      headers: { Authorization: token },
    });
    for (const acc of accs) {
      // Konsolen-Accounts haben teils keinen Epic-Namen -> externalAuths.
      let name = acc.displayName;
      if (!name && acc.externalAuths) {
        const ext = Object.values(acc.externalAuths)[0];
        if (ext) name = ext.externalDisplayName || ext.authIds?.[0]?.id;
      }
      name = name || acc.id.slice(0, 8);
      nameCache.set(acc.id, name);
      out[acc.id] = name;
    }
  }
  for (const id of fehlend) if (!out[id]) out[id] = id.slice(0, 8);
  return out;
}

// ---------------------------------------------------------------- Cups

export async function listeCups(region = 'EU') {
  const { token, accountId, displayName } = await getToken();
  const data = await req<{ events?: Array<{
    eventId: string; displayDataId?: string;
    eventWindows?: Array<{ eventWindowId: string; beginTime: string; endTime: string }>;
  }> }>(
    `${EVENTS}/api/v1/events/Fortnite/download/${accountId}` +
    `?region=${encodeURIComponent(region)}&platform=Windows&teamAccountIds=${accountId}`,
    { headers: { Authorization: token } },
  );

  const now = Date.now();
  const rows: CupFenster[] = [];
  for (const ev of data.events ?? []) {
    for (const w of ev.eventWindows ?? []) {
      const begin = new Date(w.beginTime).getTime();
      const end = new Date(w.endTime).getTime();
      rows.push({
        status: now >= begin && now <= end ? 'live' : now < begin ? 'kommt' : 'vorbei',
        begin, end,
        name: ev.displayDataId || ev.eventId,
        eventId: ev.eventId,
        windowId: w.eventWindowId,
      });
    }
  }
  rows.sort((a, b) => b.begin - a.begin);
  return { account: displayName, region, windows: rows };
}

// Epic benennt die Werte je Match ueber Index-Schluessel.
// Epic benennt dieselbe Groesse je nach Turnier unterschiedlich - beide
// Schreibweisen zeigen auf denselben Zielnamen. Welche Felder ein Turnier
// ueberhaupt mitschickt, legt Epic je Cup fest; alles Unbekannte wandert
// unveraendert mit durch.
const STAT_NAMEN: Record<string, string> = {
  PLACEMENT_STAT_INDEX: 'placement',
  PLACEMENT_TIEBREAKER_STAT: 'tiebreaker',
  TEAM_ELIMS_STAT_INDEX: 'elims',
  VICTORY_ROYALE_STAT_INDEX: 'wins',
  VICTORY_ROYALE_STAT: 'wins',
  TIME_ALIVE_STAT: 'timeAlive',
  DAMAGE_TO_PLAYERS_STAT: 'damage',
  DamageDealt: 'damage',
  DamageDealt_Players_BySquad: 'damageSquad',
  DAMAGE_TAKEN_STAT: 'damageTaken',
  DamageReceived: 'damageTaken',
  HEADSHOTS_STAT: 'headshots',
  Headshots: 'headshots',
  MATCH_PLAYED_STAT: 'matches',
  OpenChests: 'kisten',
  GainedHealthTimes: 'heilung',
  GainedShieldTimes: 'schild',
  Travel_Distance_Ground: 'strecke',
  WoodAcquired: 'holzGefarmt',
  StoneAcquired: 'steinGefarmt',
  MetalAcquired: 'metallGefarmt',
  IngredientAcquired: 'zutatGefarmt',
  WoodExpended: 'holzVerbaut',
  StoneExpended: 'steinVerbaut',
  MetalExpended: 'metallVerbaut',
  IngredientExpended: 'zutatVerbaut',
};

interface RohEintrag {
  rank: number;
  pointsEarned: number;
  teamId?: string;
  teamAccountIds?: string[];
  sessionHistory?: Array<{
    sessionId?: string; endTime?: string;
    trackedStats?: Record<string, number>;
  }>;
}

function formeEintrag(e: RohEintrag, namen: Record<string, string>): CupEintrag {
  const hist = e.sessionHistory ?? [];
  let elims = 0, wins = 0, damage = 0, damageTaken = 0, timeAlive = 0, headshots = 0;
  let damageSquad = 0, matsGefarmt = 0, matsVerbaut = 0, strecke = 0, kisten = 0;
  let heilung = 0, schild = 0;
  let bestPlace: number | null = null;
  let platzSumme = 0, platzAnzahl = 0;
  const matches: CupMatch[] = [];

  for (const s of hist) {
    const st = s.trackedStats ?? {};
    const m: CupMatch = { sessionId: s.sessionId, endTime: s.endTime };
    // Bekannte Werte benennen, alles andere unveraendert mitnehmen.
    for (const k of Object.keys(st)) {
      const name = STAT_NAMEN[k];
      if (name) (m as Record<string, unknown>)[name] = st[k];
      else (m as Record<string, unknown>)[k] = st[k];
    }
    elims += m.elims ?? 0;
    damage += m.damage ?? 0;
    damageTaken += m.damageTaken ?? 0;
    timeAlive += m.timeAlive ?? 0;
    headshots += m.headshots ?? 0;
    damageSquad += m.damageSquad ?? 0;
    strecke += m.strecke ?? 0;
    kisten += m.kisten ?? 0;
    heilung += m.heilung ?? 0;
    schild += m.schild ?? 0;
    // Material zaehlt Epic getrennt nach Holz, Stein, Metall und Zutaten.
    matsGefarmt += (m.holzGefarmt ?? 0) + (m.steinGefarmt ?? 0)
                 + (m.metallGefarmt ?? 0) + (m.zutatGefarmt ?? 0);
    matsVerbaut += (m.holzVerbaut ?? 0) + (m.steinVerbaut ?? 0)
                 + (m.metallVerbaut ?? 0) + (m.zutatVerbaut ?? 0);
    if (typeof m.placement === 'number') {
      if (bestPlace === null || m.placement < bestPlace) bestPlace = m.placement;
      if (m.placement === 1) wins++;
      platzSumme += m.placement;
      platzAnzahl++;
    }
    matches.push(m);
  }

  const games = hist.length;
  const punkte = e.pointsEarned ?? 0;
  return {
    rank: e.rank, points: punkte, elims, games, wins, bestPlace,
    damage, damageTaken, headshots, timeAlive,
    damageSquad, matsGefarmt, matsVerbaut, strecke, kisten, heilung, schild,
    avgPoints: games ? +(punkte / games).toFixed(2) : 0,
    avgPlace: platzAnzahl ? +(platzSumme / platzAnzahl).toFixed(2) : 0,
    avgElims: games ? +(elims / games).toFixed(2) : 0,
    avgTimeAlive: games ? Math.round(timeAlive / games) : 0,
    // Tode = gespielte Runden ohne Sieg. Naeher kommt Epic nicht heran.
    kd: games - wins > 0 ? +(elims / (games - wins)).toFixed(2) : elims,
    teamId: e.teamId ?? null,
    matches,
    players: (e.teamAccountIds ?? []).map((id) => ({
      id, name: namen[id] || id.slice(0, 8),
    })),
  };
}

export async function holeSeite(eventId: string, windowId: string, page = 0) {
  const { token, accountId } = await getToken();
  const url = `${EVENTS}/api/v1/leaderboards/Fortnite/${encodeURIComponent(eventId)}` +
    `/${encodeURIComponent(windowId)}/${accountId}?page=${page}&rank=0&teamAccountIds=`;
  const data = await req<{ page: number; totalPages: number; updatedTime: string;
                           entries?: RohEintrag[]; liveSessions?: unknown }>(
    url, { headers: { Authorization: token } });

  const entries = data.entries ?? [];
  const namen = await loeseNamenAuf(entries.flatMap((e) => e.teamAccountIds ?? []), token);

  return {
    eventId, windowId,
    page: data.page,
    totalPages: data.totalPages,
    updated: data.updatedTime,
    liveSessions: data.liveSessions ?? null,
    entries: entries.map((e) => formeEintrag(e, namen)),
  };
}

/**
 * Wie viele Seiten gleichzeitig geholt werden.
 *
 * Nacheinander waeren zehntausend Plaetze hundert Abfragen im Gaensemarsch -
 * das dauert Minuten. In kleinen Gruppen parallel ist es ein Bruchteil davon,
 * ohne die Quelle zu ueberrennen.
 */
const SEITEN_GLEICHZEITIG = 6;

export async function holeTop(eventId: string, windowId: string, limit = 100) {
  const first = await holeSeite(eventId, windowId, 0);
  const out = [...first.entries];
  if (!out.length) return { ...first, entries: out };

  // Wie viele Seiten es ueberhaupt braucht - aus der Groesse der ersten.
  const proSeite = out.length;
  const noetig = Math.min(first.totalPages, MAX_PAGES, Math.ceil(limit / proSeite));

  for (let p = 1; p < noetig; p += SEITEN_GLEICHZEITIG) {
    const bis = Math.min(p + SEITEN_GLEICHZEITIG, noetig);
    const gruppe = [];
    for (let i = p; i < bis; i++) gruppe.push(holeSeite(eventId, windowId, i));
    for (const seite of await Promise.all(gruppe)) out.push(...seite.entries);
    if (out.length >= limit) break;
  }

  // Sicherheitsnetz: die Reihenfolge soll am Rang haengen, nicht daran, in
  // welcher Reihenfolge die Seiten zurueckkamen.
  out.sort((a, b) => a.rank - b.rank);
  return { ...first, entries: out.slice(0, limit) };
}

// Merkt sich, auf welcher Seite ein Spieler zuletzt stand.
const seitenHinweis = new Map<string, number>();

// Sucht Spieler im Leaderboard - auch weit hinten. Epic laesst keinen
// Direktabruf fremder Accounts zu (403), also muss seitenweise gesucht werden.
export async function findeSpieler(
  eventId: string, windowId: string,
  namen: string[] = [], ids: string[] = [], maxPages = MAX_PAGES,
) {
  const gesuchteNamen = namen.map((n) => n.toLowerCase().trim()).filter(Boolean);
  // Account-IDs sind eindeutig und aendern sich nie. In offenen Cups nennen
  // sich oft mehrere Spieler fast gleich - dann trifft nur die ID sicher.
  const gesuchteIds = new Set(ids.map((i) => i.trim()).filter(Boolean));
  if (!gesuchteNamen.length && !gesuchteIds.size) {
    return { eventId, windowId, entries: [] as CupEintrag[], scannedPages: 0, totalPages: 0 };
  }

  const key = `${eventId}|${windowId}|${gesuchteNamen.join(',')}|${[...gesuchteIds].join(',')}`;
  const treffer = new Map<number, CupEintrag>();
  const gesucht = gesuchteNamen.length + gesuchteIds.size;
  let scanned = 0, totalPages = 1;

  const sammle = (res: Awaited<ReturnType<typeof holeSeite>>) => {
    totalPages = res.totalPages;
    for (const e of res.entries) {
      const passt = e.players.some((p) =>
        gesuchteIds.has(p.id) ||
        gesuchteNamen.some((w) => p.name.toLowerCase().includes(w)));
      if (passt) treffer.set(e.rank, { ...e, page: res.page });
    }
  };

  // Zuerst dort nachsehen, wo die Spieler beim letzten Mal standen.
  const hint = seitenHinweis.get(key);
  if (hint !== undefined) {
    for (const p of [hint, hint - 1, hint + 1]) {
      if (p < 0 || p >= MAX_PAGES) continue;
      sammle(await holeSeite(eventId, windowId, p));
      scanned++;
      if (treffer.size >= gesucht) break;
    }
  }
  if (treffer.size < gesucht) {
    for (let p = 0; p < maxPages; p++) {
      const res = await holeSeite(eventId, windowId, p);
      scanned++;
      sammle(res);
      if (treffer.size >= gesucht) break;
      if (p + 1 >= totalPages) break;
    }
  }

  const entries = [...treffer.values()].sort((a, b) => a.rank - b.rank);
  if (entries.length) seitenHinweis.set(key, entries[0].page ?? 0);
  return { eventId, windowId, entries, scannedPages: scanned, totalPages };
}

// ---------------------------------------------------------------- Turnier-Optik

// Epic veroeffentlicht zu jedem Turnier Titel, Kachelbild und Farbe.
// Oeffentlich, ohne Schluessel - dieselbe Quelle, aus der auch das Spiel
// selbst seine Turnierkacheln zeichnet.
const CONTENT_URL =
  'https://fortnitecontent-website-prod07.ol.epicgames.com/content/api/pages/fortnite-game/tournamentinformation';

export interface TurnierOptik {
  titel: string;
  untertitel?: string;
  kurzTitel?: string;
  bild?: string;
  posterVorn?: string;
  farbe?: string;
}

// "s42_shadow_mobile" -> "s42ShadowMobile"
function alsContentKey(displayDataId: string) {
  return displayDataId.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

let optikCache: { daten: Record<string, TurnierOptik>; bis: number } | null = null;

export async function turnierOptik(): Promise<Record<string, TurnierOptik>> {
  if (optikCache && Date.now() < optikCache.bis) return optikCache.daten;

  const daten: Record<string, TurnierOptik> = {};
  try {
    const roh = await req<Record<string, { tournament_info?: Record<string, string> }>>(
      CONTENT_URL);
    for (const [key, wert] of Object.entries(roh)) {
      const ti = wert?.tournament_info;
      if (!ti || !ti.title_line_1) continue;
      daten[key] = {
        titel: ti.title_line_1,
        untertitel: ti.title_line_2 || undefined,
        kurzTitel: ti.short_format_title || undefined,
        bild: ti.playlist_tile_image || ti.loading_screen_image || undefined,
        posterVorn: ti.poster_front_image || undefined,
        farbe: ti.primary_color ? `#${ti.primary_color}` : undefined,
      };
    }
  } catch {
    // Ohne Optik laeuft alles weiter, nur ohne Bilder.
  }
  // Zwoelf Stunden reichen: Turnierkacheln aendern sich hoechstens taeglich.
  optikCache = { daten, bis: Date.now() + 12 * 60 * 60_000 };
  return daten;
}

// ---------------------------------------------------------------- Cups gruppiert

export const REGIONEN = ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'] as const;

export const REGION_TEXT: Record<string, string> = {
  EU: 'Europe', NAC: 'NA Central', NAW: 'NA West',
  BR: 'Brazil', ASIA: 'Asia', ME: 'Middle East', OCE: 'Oceania',
};

export interface CupFensterDetail extends CupFenster {
  region: string;
  runde: number;
  rundenTyp?: string;
  /** Finale erkennbar am Zugangs-Token oder am Namen des Fensters. */
  istFinale: boolean;
  /** Woran die Teilnahme haengt - z.B. Power-Rankings-Platz oder Vorrunde. */
  tokens: string[];
  matchCap?: number;
  /**
   * Wie viele Teams sich aus diesem Fenster qualifizieren.
   *
   * Aus Epics Auszahlungstabelle, nicht geschaetzt. Fehlt, wo es nichts zu
   * qualifizieren gibt - etwa in einem Finale.
   */
  qualifiziert?: number;
}

/** Grobe Einteilung, damit die Uebersicht nicht von Randcups zugestellt wird. */
export type CupArt =
  | 'championship'  // FNCS Majors, Global Championship, Reload Elite
  | 'division'      // FNCS Division 1-5
  | 'finals'        // alles mit Finalrunde
  | 'cash'          // Cash Cups: Shadow Cup, Console VCC, Cash Cup
  | 'reload'        // Reload-Cups
  | 'victory'       // Victory Cups
  | 'solo'          // offene Solo-, Duo- und Trio-Cups
  | 'ranked'        // Ranked Cups
  | 'mobile'        // Mobile Series
  | 'skin'          // Shop-Cups um einen Skin
  | 'sonstige';     // Testcups, Performance Evaluation und Aehnliches

export interface CupGruppe {
  id: string;                    // displayDataId
  titel: string;
  untertitel?: string;
  bild?: string;
  farbe?: string;
  /** Kapitel und Season, klein auf der Kachel - etwa "CH7S2". */
  kapitel?: string;
  art: CupArt;
  /** Wahr, wenn ein einziges Leaderboard fuer alle Regionen gilt. */
  global: boolean;
  /** Je Region die zugehoerigen Fenster, zeitlich sortiert. */
  regionen: Record<string, CupFensterDetail[]>;
  naechsterStart: number | null;
  letzterStart: number | null;
  live: boolean;
  vorbei: boolean;
}

// Epic markiert Shop-Cups selbst als "ShopCup" - das sind die Skin-Cups.
// Der Rest laesst sich zuverlaessig am Bezeichner ablesen.
/**
 * Ein brauchbarer Name, wenn Epic keinen liefert.
 *
 * In Epics Inhaltsdatei steht zu manchen Turnieren als Titel nur "Fortnite" -
 * das ist der Name des Spiels, nicht der des Cups. Der eigentliche Name steckt
 * dann in den Kennungen der Spielfenster: aus
 * "S42_PerformanceEvaluation_Event1Round1_EU" wird "Performance Evaluation".
 * Erfunden wird dabei nichts, die Worte stehen so in den Daten.
 */
function nameAusFenstern(fensterIds: string[]): string | null {
  for (const roh of fensterIds) {
    // Aufbau: Saison _ Name _ EventNRundeN _ Region
    const teile = roh.split('_');
    if (teile.length < 3) continue;
    const kern = teile[1];
    if (!kern || kern.length < 6) continue;
    // Aus zusammengeschriebenen Woertern wieder getrennte machen.
    const worte = kern.replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim();
    if (!/^[A-Za-z][A-Za-z ]+$/.test(worte)) continue;
    return worte.endsWith('Cup') ? worte : `${worte} Cup`;
  }
  return null;
}

/** Taugt der Titel, den Epic mitschickt, ueberhaupt als Name? */
function titelBrauchbar(titel: string, id: string) {
  const t = titel.trim().toLowerCase();
  return !!t && t !== 'fortnite' && t !== id.toLowerCase();
}

function bestimmeArt(id: string, titel: string, turnierTyp?: string): CupArt {
  const s = (id + ' ' + titel).toLowerCase();
  // Reihenfolge zaehlt: "MobileVictoryCup" ist ein Mobile-Cup, kein Victory Cup.
  if (/mobile/.test(s)) return 'mobile';
  if (/ranked/.test(s)) return 'ranked';
  if (turnierTyp === 'ShopCup') return 'skin';
  if (/division/.test(s)) return 'division';
  if (/reloadelite|championship|major|global|fncs/.test(s)) return 'championship';
  // Die Performance Evaluation ist eine Qualifikationsreihe mit Finalrunde und
  // gehoert damit zu den Cups, die unter "Standard" stehen sollen - unter
  // "sonstige" waere sie sonst nur ueber "Alle" zu finden.
  if (/performanceevaluation|perfeval/.test(s)) return 'championship';
  // Epic taggt Cash Cups nicht einheitlich - Shadow Cup und die Console-VCC
  // sind welche, heissen aber nicht so.
  if (/cashcup|cash cup|shadowcup|shadow cup|\bvcc\b/.test(s)) return 'cash';
  if (/reload/.test(s)) return 'reload';
  if (/victory/.test(s)) return 'victory';
  if (/\bopen\b|solo|duos|trios|squad/.test(s)) return 'solo';
  return 'sonstige';
}

/**
 * Der Filter "Standard": Reload, Cash Cups, Finals, Opens und Division Cups.
 * Ranked, Mobile, Skin-Cups und Testcups bleiben hier aussen vor - die gibt
 * es unter "Alle".
 */
export const STANDARD_ARTEN: CupArt[] = [
  'championship', 'division', 'finals', 'cash', 'reload', 'victory', 'solo',
];

interface RohEvent {
  eventId: string;
  displayDataId?: string;
  regions?: string[];
  metadata?: Record<string, unknown>;
  eventWindows?: Array<{
    eventWindowId: string; beginTime: string; endTime: string;
    round?: number; eventTemplateId?: string;
    metadata?: Record<string, unknown>;
    requireAllTokens?: string[]; requireAnyTokens?: string[];
  }>;
}

/** Eine Auszahlungsgruppe, wie Epic sie fuehrt. */
interface RohAuszahlung {
  scoringType?: string;
  ranks?: Array<{
    threshold?: number;
    payouts?: Array<{ rewardType?: string; value?: string }>;
  }>;
}

/**
 * Die Rangschwelle einer Auszahlungstabelle.
 *
 * Gesucht ist die Gruppe mit scoringType "rank", deren Auszahlung eine
 * Marke ist - die berechtigt zum naechsten Fenster. Gruppen mit
 * scoringType "value" vergeben nur die Teilnahmemarke und sagen nichts
 * ueber eine Qualifikation.
 *
 * Gibt es mehrere, gilt die kleinste Schwelle: sie ist die engste Huerde
 * und damit die, die "Top N" meint.
 */
function rangSchwelle(tabelle: RohAuszahlung[] | undefined): number | null {
  let kleinste: number | null = null;
  for (const gruppe of tabelle ?? []) {
    if (gruppe.scoringType !== 'rank') continue;
    for (const r of gruppe.ranks ?? []) {
      const hatMarke = (r.payouts ?? []).some((p) => p.rewardType === 'token');
      if (!hatMarke) continue;
      const wert = r.threshold;
      if (typeof wert !== 'number' || wert <= 0) continue;
      kleinste = kleinste === null ? wert : Math.min(kleinste, wert);
    }
  }
  return kleinste;
}

async function rohEvents(region: string) {
  const { token, accountId } = await getToken();
  return req<{ events?: RohEvent[];
               templates?: Array<{ eventTemplateId: string; matchCap?: number }>;
               /* Je Fenster-Id eine Tabelle - dort steht die Rangschwelle. */
               payoutTables?: Record<string, RohAuszahlung[]> }>(
    `${EVENTS}/api/v1/events/Fortnite/download/${accountId}` +
    `?region=${encodeURIComponent(region)}&platform=Windows&teamAccountIds=${accountId}`,
    { headers: { Authorization: token } });
}

// Alle Regionen einsammeln und je Cup zusammenfassen - so, wie ein Cup
// tatsaechlich beworben wird: ein Turnier, mehrere Regionen.
export async function cupsGruppiert(regionen: readonly string[] = REGIONEN) {
  const optik = await turnierOptik();
  const gruppen = new Map<string, CupGruppe>();
  const jetzt = Date.now();

  const alle = await Promise.all(regionen.map(async (r) => {
    try { return { region: r, daten: await rohEvents(r) }; }
    catch { return null; }
  }));

  for (const eintrag of alle) {
    if (!eintrag) continue;
    const { region, daten } = eintrag;

    // Wie viele Matches zaehlen - steht in der Vorlage, nicht im Fenster.
    const caps = new Map<string, number>();
    for (const t of daten.templates ?? []) {
      if (t.matchCap) caps.set(t.eventTemplateId, t.matchCap);
    }

    for (const ev of daten.events ?? []) {
      const id = ev.displayDataId || ev.eventId;
      const key = alsContentKey(id);
      const o = optik[key];

      let g = gruppen.get(id);
      if (!g) {
        const ausEpic = o?.titel ?? '';
        const titel = titelBrauchbar(ausEpic, id)
          ? ausEpic
          : (nameAusFenstern((ev.eventWindows ?? []).map((w) => w.eventWindowId))
            ?? (ausEpic || id));
        g = {
          id,
          titel,
          untertitel: o?.untertitel,
          bild: o?.bild,
          farbe: o?.farbe,
          art: bestimmeArt(id, titel, ev.metadata?.tournamentType as string | undefined),
          // Ein Event, das selbst mehrere Regionen auffuehrt, hat ein
          // gemeinsames Leaderboard - typisch fuer Launch- und Vor-Ort-Events.
          // Es waere falsch, dafuer eine Regionsauswahl anzubieten.
          global: (ev.regions?.length ?? 0) > 1,
          regionen: {},
          naechsterStart: null,
          letzterStart: null,
          live: false,
          vorbei: false,
        };
        gruppen.set(id, g);
      }

      for (const w of ev.eventWindows ?? []) {
        const begin = new Date(w.beginTime).getTime();
        const end = new Date(w.endTime).getTime();
        const tokens = [...(w.requireAllTokens ?? []), ...(w.requireAnyTokens ?? [])]
          .filter((t) => t && t !== 'fake_token');
        const status: CupFenster['status'] =
          jetzt >= begin && jetzt <= end ? 'live' : jetzt < begin ? 'kommt' : 'vorbei';

        const fenster: CupFensterDetail = {
          status, begin, end,
          name: id,
          eventId: ev.eventId,
          windowId: w.eventWindowId,
          region,
          runde: w.round ?? 0,
          rundenTyp: (w.metadata?.RoundType as string) ?? undefined,
          // Finals tragen es im Namen oder im Zugangs-Token.
          istFinale: /final/i.test(w.eventWindowId) ||
                     tokens.some((t) => /final/i.test(t)),
          tokens,
          matchCap: w.eventTemplateId ? caps.get(w.eventTemplateId) : undefined,
          // Wie viele weiterkommen. Nichts, wenn Epic keine Schwelle fuehrt -
          // bei einem Finale gibt es keine.
          qualifiziert: rangSchwelle(daten.payoutTables?.[w.eventWindowId]) ?? undefined,
        };

        // Globale Events kommen aus jeder Regionsabfrage identisch zurueck.
        // Sie landen unter einem Sammelschluessel, damit sie nicht faelschlich
        // als sieben getrennte Regionen erscheinen.
        const schluessel = g.global ? 'GLOBAL' : region;
        const liste = (g.regionen[schluessel] ??= []);
        if (!liste.some((x) => x.windowId === fenster.windowId)) liste.push(fenster);

        if (status === 'live') g.live = true;
        if (status === 'vorbei') g.vorbei = true;
        if (status === 'kommt' && (g.naechsterStart === null || begin < g.naechsterStart)) {
          g.naechsterStart = begin;
        }
        if (g.letzterStart === null || begin > g.letzterStart) g.letzterStart = begin;

        // Ein Cup, der eine Finalrunde enthaelt, zaehlt als Finals-Cup.
        if (fenster.istFinale && g.art !== 'championship' && g.art !== 'division') {
          g.art = 'finals';
        }
      }
    }
  }

  for (const g of gruppen.values()) {
    for (const r of Object.keys(g.regionen)) {
      g.regionen[r].sort((a, b) => a.begin - b.begin);
    }
  }

  // Laufende zuerst, dann die naechsten, dann die zuletzt gelaufenen.
  return [...gruppen.values()].sort((a, b) => {
    if (a.live !== b.live) return a.live ? -1 : 1;
    if (a.naechsterStart && b.naechsterStart) return a.naechsterStart - b.naechsterStart;
    if (a.naechsterStart) return -1;
    if (b.naechsterStart) return 1;
    return (b.letzterStart ?? 0) - (a.letzterStart ?? 0);
  });
}

// ---------------------------------------------------------------- Archiv

// Epic haelt vergangene Cups nur wenige Tage vor - aktuell sind es gerade
// einmal zwei. Damit die Vergangenheit trotzdem waechst, schreibt das
// Dashboard jeden gesehenen Cup mit. Ab dem ersten Lauf baut sich das
// Archiv von selbst auf.
const ARCHIV = path.join(DATEN_ORT, 'cup-archiv.json');

export interface ArchivEintrag {
  id: string; titel: string; untertitel?: string; bild?: string;
  art: CupArt; global: boolean;
  eventId: string; windowId: string; region: string;
  /** Epics Kapitel-und-Season-Kuerzel, etwa "CH7S2" - nur bei Nachgetragenem. */
  kapitel?: string;
  begin: number;
  /**
   * Wann der Spieltag endete - unbekannt bei nachgetragenen Turnieren.
   *
   * Die Vergangenheit vor dem ersten Lauf des Archivs stammt aus den
   * gespiegelten Bestenlisten, und die kennen nur den Beginn. Eine Endzeit
   * zu erfinden hiesse, eine Uhrzeit zu behaupten, die niemand gemessen hat -
   * die Anzeige schreibt dort "—".
   */
  end?: number;
  istFinale: boolean; matchCap?: number; qualifiziert?: number;
  gesehen: string;
}

export async function leseArchiv(): Promise<ArchivEintrag[]> {
  try { return JSON.parse(await fs.readFile(ARCHIV, 'utf8')) as ArchivEintrag[]; }
  catch { return []; }
}

/**
 * Die Cups aus dem Archiv, die Epic nicht mehr ausliefert.
 *
 * Epics Ereignisliste ist ein rollendes Fenster: sie nennt, was gerade laeuft
 * und was demnaechst kommt, und laesst alles Aeltere fallen. Wer im Werkzeug
 * nach einem Cup von letztem Monat sucht, faende ihn deshalb nicht mehr -
 * obwohl er bei jedem Durchlauf mitgeschrieben wurde.
 *
 * Hier werden die mitgeschriebenen Fenster wieder zu Turnieren gebuendelt,
 * genau wie es `cupsGruppiert` mit den frischen Daten tut. Was Epic noch
 * kennt, bleibt aussen vor - die frischen Angaben sind genauer und enthalten
 * unter anderem die Zugangsbedingungen.
 */
export async function archivCups(
  schonBekannt: ReadonlySet<string> = new Set(),
): Promise<CupGruppe[]> {
  const eintraege = await leseArchiv();
  const jetzt = Date.now();
  const gruppen = new Map<string, CupGruppe>();

  for (const e of eintraege) {
    if (schonBekannt.has(e.id)) continue;

    let g = gruppen.get(e.id);
    if (!g) {
      g = {
        id: e.id, titel: e.titel, untertitel: e.untertitel, bild: e.bild,
        kapitel: e.kapitel,
        art: e.art, global: e.global, regionen: {},
        naechsterStart: null, letzterStart: null, live: false, vorbei: true,
      };
      gruppen.set(e.id, g);
    }

    const status: 'live' | 'kommt' | 'vorbei' =
      jetzt < e.begin ? 'kommt'
        : (typeof e.end === 'number' && jetzt <= e.end) ? 'live' : 'vorbei';
    (g.regionen[e.region] ??= []).push({
      status, begin: e.begin, end: e.end, name: e.windowId,
      eventId: e.eventId, windowId: e.windowId, region: e.region,
      // Die Runde steht im Archiv nicht; sie ergibt sich unten aus der
      // zeitlichen Reihenfolge, damit die Anzeige nicht leer bleibt.
      runde: 0, istFinale: e.istFinale, tokens: [], matchCap: e.matchCap,
      qualifiziert: e.qualifiziert,
    });
  }

  for (const g of gruppen.values()) {
    let naechster: number | null = null;
    let letzter: number | null = null;
    for (const fenster of Object.values(g.regionen)) {
      fenster.sort((a, b) => a.begin - b.begin);
      fenster.forEach((f, i) => { f.runde = i + 1; });
      for (const f of fenster) {
        if (f.begin > jetzt && (naechster === null || f.begin < naechster)) {
          naechster = f.begin;
        }
        if (letzter === null || f.begin > letzter) letzter = f.begin;
        if (f.status === 'live') g.live = true;
      }
    }
    g.naechsterStart = naechster;
    g.letzterStart = letzter;
    g.vorbei = !g.live && naechster === null;
  }

  return [...gruppen.values()]
    .sort((a, b) => (b.letzterStart ?? 0) - (a.letzterStart ?? 0));
}

export async function schreibeArchiv(cups: CupGruppe[]): Promise<number> {
  // Auf Vercel ist das Dateisystem schreibgeschuetzt.
  if (process.env.VERCEL || process.env.NEXT_PUBLIC_VERCEL_ENV) return 0;

  const vorhanden = await leseArchiv();
  const nachSchluessel = new Map(vorhanden.map((e) => [e.windowId + '|' + e.region, e]));
  const jetzt = new Date().toISOString();
  let neu = 0;

  for (const c of cups) {
    for (const [region, fenster] of Object.entries(c.regionen)) {
      for (const f of fenster) {
        const k = f.windowId + '|' + region;
        if (nachSchluessel.has(k)) continue;
        nachSchluessel.set(k, {
          id: c.id, titel: c.titel, untertitel: c.untertitel, bild: c.bild,
          art: c.art, global: c.global,
          eventId: f.eventId, windowId: f.windowId, region,
          begin: f.begin, end: f.end,
          istFinale: f.istFinale, matchCap: f.matchCap,
          qualifiziert: f.qualifiziert,
          gesehen: jetzt,
        });
        neu++;
      }
    }
  }

  if (neu) {
    await fs.mkdir(path.dirname(ARCHIV), { recursive: true });
    const alle = [...nachSchluessel.values()].sort((a, b) => b.begin - a.begin);
    await fs.writeFile(ARCHIV, JSON.stringify(alle, null, 2));
  }
  return neu;
}

// ---------------------------------------------------------------- Ranked

// Epics eigenes Rangsystem. Anders als die Turnierdaten laesst sich das
// auch fuer fremde Spieler abfragen - ein Abruf je Account.
const HABANERO =
  'https://fn-service-habanero-live-public.ogs.live.on.epicgames.com/api/v1/games/fortnite';

// Die 18 Stufen von "delmar-competitive"; die 22er-Tracks nutzen dieselbe
// Reihenfolge und haengen oben nur weitere Unreal-Stufen an.
const DIVISIONEN = [
  'Bronze I','Bronze II','Bronze III',
  'Silber I','Silber II','Silber III',
  'Gold I','Gold II','Gold III',
  'Platin I','Platin II','Platin III',
  'Diamant I','Diamant II','Diamant III',
  'Elite','Champion','Unreal',
];

export interface RankedEintrag {
  trackguid: string;
  rankingType: string;
  division: number;
  divisionName: string;
  fortschritt: number;      // 0..1 innerhalb der Stufe
  ranking: number | null;   // Platz in der Rangliste, nur bei Unreal
  aktualisiert: string | null;
  gespielt: boolean;
}

interface RohRanked {
  trackguid: string;
  rankingType: string;
  currentDivision?: number;
  highestDivision?: number;
  promotionProgress?: number;
  currentPlayerRanking?: number | null;
  lastUpdated?: string;
}

export async function holeRanked(accountId: string): Promise<RankedEintrag[]> {
  const { token } = await getToken();
  const roh = await req<RohRanked[]>(`${HABANERO}/trackprogress/${accountId}`, {
    headers: { Authorization: token },
  });

  return (roh ?? []).map((r) => {
    const div = r.currentDivision ?? 0;
    // Ein Zeitstempel von 1970 heisst: in diesem Modus nie gespielt.
    const gespielt = Boolean(r.lastUpdated && !r.lastUpdated.startsWith('1970'));
    return {
      trackguid: r.trackguid,
      rankingType: r.rankingType,
      division: div,
      divisionName: DIVISIONEN[Math.min(div, DIVISIONEN.length - 1)] ?? `Stufe ${div}`,
      fortschritt: r.promotionProgress ?? 0,
      ranking: r.currentPlayerRanking ?? null,
      aktualisiert: gespielt ? r.lastUpdated! : null,
      gespielt,
    };
  });
}

// Welche Rangsaisons laufen gerade?
export async function aktiveTracks() {
  const { token } = await getToken();
  const alle = await req<Array<{
    trackguid: string; rankingType: string;
    beginTime: string; endTime: string; divisionCount: number;
  }>>(`${HABANERO}/tracks/query`, { headers: { Authorization: token } });

  const jetzt = Date.now();
  return alle.filter((t) =>
    new Date(t.beginTime).getTime() <= jetzt && new Date(t.endTime).getTime() > jetzt);
}

// ---------------------------------------------------------------- Bilder

// Spielerbilder und Org-Logos werden ueber den Dateinamen zugeordnet:
// "peterbot.png" trifft auf "[EWC2026] FLCN peterbot".
async function bildListe(unterordner: string) {
  const dir = path.join(process.cwd(), 'public', unterordner);
  try {
    const dateien = await fs.readdir(dir);
    return dateien
      .filter((f) => /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(f))
      .map((f) => ({ file: f, key: f.replace(/\.[^.]+$/, '').toLowerCase().trim() }))
      // Zu kurze oder rein numerische Namen wuerden wild treffen: "7.png"
      // passt sonst auf "Malibuca 7", "Muz 7!" und jeden anderen mit einer 7.
      .filter((p) => p.key.length >= 3 && !/^\d+$/.test(p.key))
      // Laengere Namen zuerst, damit "pollo 9" vor "pollo" greift.
      .sort((a, b) => b.key.length - a.key.length);
  } catch { return []; }
}

/**
 * Konto-Id zu Bilddatei, aus dem gepflegten Verzeichnis.
 *
 * Ohne das wurde ein Foto allein am Namen erkannt - der Dateiname musste im
 * Turniernamen vorkommen. Das geht so lange gut, wie beide gleich heissen,
 * und genau dort nicht, wo es darauf ankommt: MrSavage tritt als
 * "XSET ØØ8" an, und "xset øø8" enthaelt nun einmal kein "mrsavage". Er
 * blieb deshalb ohne Bild, obwohl mrsavage.jpg seit jeher vorliegt.
 *
 * spielerbilder.json fuehrt zu jeder Datei die Konto-Id - hier
 * 9032a26b8a7845dd991841581182a1dd, dieselbe, unter der auch "XSET ØØ8" im
 * Namensverzeichnis steht. Ueber sie ist die Zuordnung eindeutig, und sie
 * bleibt es auch, wenn er sich naechste Woche wieder umbenennt.
 */
async function bilderNachKonto(): Promise<Map<string, string>> {
  const nach = new Map<string, string>();
  try {
    const roh = await fs.readFile(path.join(DATEN_ORT, 'spielerbilder.json'), 'utf8');
    const liste = JSON.parse(roh);
    for (const e of (Array.isArray(liste) ? liste : Object.values(liste ?? {}))) {
      const id = (e as { epicId?: string })?.epicId;
      const datei = (e as { datei?: string })?.datei;
      if (id && datei) nach.set(String(id), String(datei));
    }
  } catch { /* dann bleibt es beim Namensvergleich */ }
  return nach;
}

let bildCache: { players: Array<{file:string;key:string}>;
                 logos: Array<{file:string;key:string}>;
                 nachKonto: Map<string, string>; bis: number } =
  { players: [], logos: [], nachKonto: new Map(), bis: 0 };

export async function bilder() {
  if (Date.now() < bildCache.bis) return bildCache;
  /*
   * Die Fotos liegen unter public/spielerbilder.
   *
   * Hier stand einmal "players" - ein Ordner, der leer ist. Deshalb kam in
   * keinem Overlay und in keiner Bestenliste je ein Foto an, obwohl
   * vierhundert davon vorliegen. Derselbe Ordner, den auch das
   * Beitrags-Werkzeug fuellt; ein zweiter waere ein zweiter Ort zum Pflegen.
   */
  bildCache = {
    players: await bildListe('spielerbilder'),
    logos: await bildListe('logos'),
    nachKonto: await bilderNachKonto(),
    bis: Date.now() + 10_000,
  };
  return bildCache;
}

export async function ergaenzeBilder<T extends { entries: CupEintrag[] }>(daten: T): Promise<T> {
  const b = await bilder();
  const finde = (liste: Array<{file:string;key:string}>, name: string, ordner: string) => {
    const n = name.toLowerCase();
    const hit = liste.find((p) => n.includes(p.key));
    return hit ? `/${ordner}/${encodeURIComponent(hit.file)}` : null;
  };
  /*
   * Die Konto-Id geht vor dem Namen.
   *
   * Der Name ist nur der Rueckfall fuer Konten, zu denen im Verzeichnis noch
   * nichts steht - er trifft, solange jemand heisst wie seine Bilddatei, und
   * daneben, sobald er unter einem Turniernamen antritt.
   */
  return {
    ...daten,
    entries: daten.entries.map((e) => ({
      ...e,
      players: e.players.map((p) => {
        const ausKonto = p.id ? b.nachKonto.get(String(p.id)) : undefined;
        return {
          ...p,
          img: ausKonto
            ? `/spielerbilder/${encodeURIComponent(ausKonto)}`
            : finde(b.players, p.name, 'spielerbilder'),
          logo: finde(b.logos, p.name, 'logos'),
        };
      }),
    })),
  };
}

// ---------------------------------------------------------------- Cache

// Epic wird pro Cup nur einmal im Intervall gefragt, egal wie viele
// Overlays oder Zuschauer daran haengen.
const cache = new Map<string, { data: unknown; bis: number; pending?: Promise<unknown> }>();

export async function gecacht<T>(key: string, ttl: number, hole: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.bis > Date.now()) return hit.data as T;
  if (hit?.pending) return hit.pending as Promise<T>;

  const pending = hole()
    .then((data) => { cache.set(key, { data, bis: Date.now() + ttl }); return data; })
    .catch((err) => {
      cache.delete(key);
      // Alte Daten sind besser als gar keine, falls Epic kurz zickt.
      if (hit?.data) return hit.data as T;
      throw err;
    });
  cache.set(key, { ...(hit ?? { data: null, bis: 0 }), pending });
  return pending;
}
