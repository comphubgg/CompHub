/*
 * Das Profil eines Spielers ausserhalb der Turniere (27.11.2026, Seite "Stats" im Community-Bereich des neuen Hubs).
 *
 * Drei Quellen bei Epic, alle mit dem Zugang der Seite:
 *   - Konto:      der Anzeigename -> Konto-Id (Konto-Dienst)
 *   - Statistik:  alles, was Epic je Spielliste und Eingabegeraet mitzaehlt (Statistik-Dienst, "statsv2") - Siege, Kills, Spiele, Minuten,
 *                 Platzierungen. Hat der Spieler seine Statistik im Spiel auf privat gestellt, antwortet Epic leer (204) -> privat: true.
 *   - Rang:       der Stand in Epics Rangsystem je Modus (Habanero, wie /api/cup-ranked) - auch bei privater Statistik sichtbar.
 *
 * Nichts wird geschaetzt: was Epic nicht nennt, fehlt in der Antwort. Schluessel, die diese Datei nicht kennt, gehen unveraendert unter "weitere"
 * hinaus statt verloren.
 */

import { ACCOUNT, aktiveTracks, gecacht } from '@/lib/epicCups';
import { epicAbruf, epicFehler, gemerkt, mitSpeicher } from '@/lib/fnEpic';

const STATISTIK = 'https://statsproxy-public-service-live.ol.epicgames.com/statsproxy/api/statsv2/account';
const HABANERO = 'https://fn-service-habanero-live-public.ogs.live.on.epicgames.com/api/v1/games/fortnite';

export const SPIELER_FRIST_MS = 10 * 60_000;

/* ------------------------------------------------------------ Konto */

export interface Konto { id: string; name: string }

/** Ein Anzeigename, wie Epic ihn zulaesst: sichtbare Zeichen, hoechstens 64 (Konsolen-Namen sind laenger als Epics sechzehn). */
export function spielerName(roh: string): string | null {
  const n = roh.trim();
  return n.length >= 1 && n.length <= 64 && !/[\u0000-\u001f\u007f]/.test(n) ? n : null;
}

/** Das Konto zum Anzeigenamen - null, wenn Epic keinen Spieler mit diesem Namen kennt. */
export function kontoNachName(name: string): Promise<Konto | null> {
  return mitSpeicher(`spielername|${name.toLowerCase()}`, SPIELER_FRIST_MS, async () => {
    const a = await epicAbruf<{ id?: string; displayName?: string }>(`${ACCOUNT}/account/api/public/account/displayName/${encodeURIComponent(name)}`);
    if (a.status === 404) return null;
    if (a.status !== 200 || !a.daten?.id) throw new Error(`Konto nicht nachschlagbar: ${epicFehler(a)}`);
    return { id: a.daten.id, name: a.daten.displayName || name };
  });
}

/** Das Konto zur Konto-Id (32 Hex-Zeichen). */
export function kontoNachId(id: string): Promise<Konto | null> {
  return mitSpeicher(`spielerid|${id.toLowerCase()}`, SPIELER_FRIST_MS, async () => {
    const a = await epicAbruf<{ id?: string; displayName?: string }>(`${ACCOUNT}/account/api/public/account/${id}`);
    if (a.status === 404) return null;
    if (a.status !== 200 || !a.daten?.id) throw new Error(`Konto nicht nachschlagbar: ${epicFehler(a)}`);
    return { id: a.daten.id, name: a.daten.displayName || id.slice(0, 8) };
  });
}

/* ------------------------------------------------------------ Statistik */

/**
 * Die Summe ueber eine Gruppe von Spiellisten. Die Namen der gezaehlten Werte sind Epics eigene (placetop1 = Siege).
 * kd, winrate und killsProMatch sind daraus gerechnet, nicht von Epic.
 */
export interface Werte {
  matches: number;
  wins: number;
  kills: number;
  /** Kills je Niederlage (Spiele minus Siege) - so rechnet es auch das Spiel. */
  kd: number;
  /** Siege in Prozent der Spiele. */
  winrate: number;
  killsProMatch: number;
  top3: number; top5: number; top6: number; top10: number; top12: number; top25: number;
  minutesplayed: number;
  playersoutlived: number;
  score: number;
  /** Wann Epic die Werte zuletzt fortgeschrieben hat (das juengste Spiel der Gruppe). */
  lastmodified: string | null;
  /** Gezaehlte Werte, die Epic nennt und die oben nicht vorkommen - Name wie bei Epic. */
  andere?: Record<string, number>;
}

const FELD: Record<string, keyof Werte> = {
  matchesplayed: 'matches', placetop1: 'wins', kills: 'kills',
  placetop3: 'top3', placetop5: 'top5', placetop6: 'top6', placetop10: 'top10', placetop12: 'top12', placetop25: 'top25',
  minutesplayed: 'minutesplayed', playersoutlived: 'playersoutlived', score: 'score',
};

interface Roh { n: Record<string, number>; zuletzt: number }
const leer = (): Roh => ({ n: {}, zuletzt: 0 });

function zaehle(r: Roh, wert: string, zahl: number) {
  if (wert === 'lastmodified') { if (zahl > r.zuletzt) r.zuletzt = zahl; return; }
  r.n[wert] = (r.n[wert] ?? 0) + zahl;
}

const rund = (x: number, stellen: number) => { const f = 10 ** stellen; return Math.round(x * f) / f; };

function werte(r: Roh): Werte {
  const w: Werte = {
    matches: 0, wins: 0, kills: 0, kd: 0, winrate: 0, killsProMatch: 0,
    top3: 0, top5: 0, top6: 0, top10: 0, top12: 0, top25: 0,
    minutesplayed: 0, playersoutlived: 0, score: 0,
    // Epic nennt Sekunden seit 1970.
    lastmodified: r.zuletzt > 0 ? new Date(r.zuletzt * 1000).toISOString() : null,
  };
  for (const [name, zahl] of Object.entries(r.n)) {
    const feld = FELD[name];
    if (feld) (w[feld] as number) = zahl; else (w.andere ??= {})[name] = zahl;
  }
  w.kd = rund(w.kills / Math.max(1, w.matches - w.wins), 2);
  w.winrate = w.matches ? rund((w.wins / w.matches) * 100, 1) : 0;
  w.killsProMatch = w.matches ? rund(w.kills / w.matches, 2) : 0;
  return w;
}

/** Wie viele in einem Team spielen - aus dem Namen der Spielliste. */
function gruppe(spielliste: string): 'solo' | 'duo' | 'trio' | 'squad' | 'sonstige' {
  if (/solo/.test(spielliste)) return 'solo';
  if (/duo/.test(spielliste)) return 'duo';
  if (/trio/.test(spielliste)) return 'trio';
  if (/squad/.test(spielliste)) return 'squad';
  return 'sonstige';
}

/**
 * Zu welchem Bereich eine Spielliste gehoert - nach Epics internen Namen:
 * habanero = Ranked, nobuild = Zero Build, blastberry/punchberry = Reload, figment = OG, showdown/arena/tournament = Turniere und Arena.
 */
function bereich(spielliste: string): string {
  if (/showdown|tournament|arena|_comp_|cash|fncs/.test(spielliste)) return 'turnier';
  if (/bots/.test(spielliste)) return 'bots';
  if (/creative|playground|vk_|island/.test(spielliste)) return 'creative';
  const zb = /nobuild|_nb_|zerobuild/.test(spielliste);
  const ranked = /habanero|ranked/.test(spielliste);
  if (/blastberry|punchberry/.test(spielliste)) return ranked ? (zb ? 'reloadRankedZb' : 'reloadRanked') : (zb ? 'reloadZb' : 'reload');
  if (/figment/.test(spielliste)) return ranked ? (zb ? 'ogRankedZb' : 'ogRanked') : (zb ? 'ogZb' : 'og');
  if (ranked) return zb ? 'rankedZb' : 'ranked';
  if (zb) return 'zb';
  if (/^(default(solo|duo|squad)|trios?|defaultsquad|solo|duos?|squads?)$/.test(spielliste)) return 'br';
  return 'sonstige';
}

export interface Statistik {
  gesamt: Werte;
  solo: Werte; duo: Werte; trio: Werte; squad: Werte; sonstige: Werte;
  /** Nach Bereich: br, zb, ranked, rankedZb, reload, reloadZb, og, ogZb, turnier, bots, creative, sonstige ... (nur Bereiche mit Spielen). */
  bereich: Record<string, Werte>;
  /** Nach Eingabegeraet: keyboardmouse, gamepad, touch. */
  eingabe: Record<string, Werte>;
  /** Je Spielliste, Name wie bei Epic ohne "playlist_" (nur mit ?playlists=1 in der Antwort). */
  playlists: Record<string, Werte>;
}

interface StatistikErgebnis { privat: boolean; stats: Statistik | null; level: number | null; saison: number | null; weitere: Record<string, number> }

function werteAus(roh: Record<string, number>): Omit<StatistikErgebnis, 'privat'> {
  const gesamt = leer();
  const jeGruppe: Record<string, Roh> = { solo: leer(), duo: leer(), trio: leer(), squad: leer(), sonstige: leer() };
  const jeBereich: Record<string, Roh> = {};
  const jeEingabe: Record<string, Roh> = {};
  const jeListe: Record<string, Roh> = {};
  const weitere: Record<string, number> = {};
  let saison: number | null = null;
  let level: number | null = null;

  for (const [schluessel, zahl] of Object.entries(roh)) {
    if (typeof zahl !== 'number') continue;
    // br_<wert>_<eingabe>_m0_playlist_<spielliste>
    const m = /^br_([a-z0-9]+)_([a-z]+)_m0_playlist_(.+)$/.exec(schluessel);
    if (m) {
      const [, wert, eingabe, liste] = m;
      for (const r of [gesamt, jeGruppe[gruppe(liste)], (jeBereich[bereich(liste)] ??= leer()), (jeEingabe[eingabe] ??= leer()), (jeListe[liste] ??= leer())]) zaehle(r, wert, zahl);
      continue;
    }
    // s<saison>_social_bp_level: Stufe der Saison mal hundert plus Fortschritt zur naechsten in Prozent (2274 = Stufe 22, 74 %).
    const s = /^s(\d+)_social_bp_level$/.exec(schluessel);
    if (s && (saison === null || Number(s[1]) > saison)) { saison = Number(s[1]); level = Math.floor(zahl / 100); }
    weitere[schluessel] = zahl;
  }

  const fertig = (q: Record<string, Roh>) => Object.fromEntries(Object.entries(q).filter(([, r]) => Object.keys(r.n).length).map(([k, r]) => [k, werte(r)]));
  return {
    stats: {
      gesamt: werte(gesamt),
      solo: werte(jeGruppe.solo), duo: werte(jeGruppe.duo), trio: werte(jeGruppe.trio), squad: werte(jeGruppe.squad), sonstige: werte(jeGruppe.sonstige),
      bereich: fertig(jeBereich), eingabe: fertig(jeEingabe), playlists: fertig(jeListe),
    },
    level, saison, weitere,
  };
}

async function holeStatistik(id: string): Promise<StatistikErgebnis> {
  const a = await epicAbruf<{ stats?: Record<string, number> }>(`${STATISTIK}/${id}`);
  // 204: der Spieler hat "Karriere-Bestenliste oeffentlich" im Spiel abgeschaltet - Epic gibt dann nichts heraus.
  if (a.status === 204) return { privat: true, stats: null, level: null, saison: null, weitere: {} };
  if (a.status !== 200 || !a.daten) throw new Error(`Statistik nicht erhalten: ${epicFehler(a)}`);
  return { privat: false, ...werteAus(a.daten.stats ?? {}) };
}

/* ------------------------------------------------------------ Rang */

// Dieselben achtzehn Stufen wie in lib/epicCups (dort nicht exportiert); laengere Reihen haengen oben nur weitere Unreal-Stufen an.
const STUFEN = [
  'Bronze I', 'Bronze II', 'Bronze III', 'Silver I', 'Silver II', 'Silver III', 'Gold I', 'Gold II', 'Gold III',
  'Platinum I', 'Platinum II', 'Platinum III', 'Diamond I', 'Diamond II', 'Diamond III', 'Elite', 'Champion', 'Unreal',
];
const stufenName = (n: number) => STUFEN[Math.min(Math.max(0, n), STUFEN.length - 1)];

/** Epics Namen der Rangreihen -> Schluessel und Titel in der Antwort. Eine unbekannte Reihe geht unter ihrem eigenen Namen hinaus. */
const RANG_ART: Record<string, [string, string]> = {
  'ranked-br': ['br', 'Battle Royale'],
  'ranked-zb': ['zb', 'Zero Build'],
  'ranked-br-combined': ['brGesamt', 'Battle Royale (combined)'],
  ranked_blastberry_build: ['reload', 'Reload'],
  ranked_blastberry_nobuild: ['reloadZb', 'Reload Zero Build'],
  'ranked-blastberry-combined': ['reloadGesamt', 'Reload (combined)'],
  'ranked-figment-build': ['og', 'OG'],
  'ranked-figment-nobuild': ['ogZb', 'OG Zero Build'],
  'ranked-feral': ['ballistic', 'Ballistic'],
  'delmar-competitive': ['rocketRacing', 'Rocket Racing'],
  'ranked-bling': ['getaway', 'Getaway'],
  'ranked-bling-nobuild': ['getawayZb', 'Getaway Zero Build'],
  'ranked-pimlico': ['fallGuys', 'Fall Guys'],
  'ranked-squareclub': ['arenas', 'Arenas'],
};

export interface Rang {
  /** Epics Name der Rangreihe, z. B. "ranked-br". */
  typ: string;
  titel: string;
  /** Die Stufe als Zahl (0 = Bronze I ... 17 = Unreal) und als Name. */
  stufe: number;
  name: string;
  /** Fortschritt zur naechsten Stufe, 0..1. */
  fortschritt: number;
  hoechste: number;
  hoechsteName: string;
  /** Platz in der Rangliste - Epic nennt ihn nur bei Unreal. */
  platz: number | null;
  aktualisiert: string;
}

interface RohRang {
  trackguid: string; rankingType: string; lastUpdated?: string;
  currentDivision?: number; highestDivision?: number; promotionProgress?: number; currentPlayerRanking?: number | null;
}

async function holeRang(id: string): Promise<Record<string, Rang>> {
  const [a, laufend] = await Promise.all([
    epicAbruf<RohRang[]>(`${HABANERO}/trackprogress/${id}`),
    gecacht('ranked-tracks', 30 * 60_000, aktiveTracks),
  ]);
  if (a.status !== 200 || !Array.isArray(a.daten)) throw new Error(`Rang nicht erhalten: ${epicFehler(a)}`);
  const aktiv = new Set(laufend.map((t) => t.trackguid));
  const rang: Record<string, Rang> = {};
  for (const r of a.daten) {
    // Nur die laufende Saison, und nur Reihen, in denen gespielt wurde (ein Zeitstempel von 1970 heisst: nie).
    if (!aktiv.has(r.trackguid) || !r.lastUpdated || r.lastUpdated.startsWith('1970')) continue;
    const [schluessel, titel] = RANG_ART[r.rankingType] ?? [r.rankingType, r.rankingType];
    const stufe = r.currentDivision ?? 0;
    const hoechste = Math.max(stufe, r.highestDivision ?? 0);
    rang[schluessel] = {
      typ: r.rankingType, titel, stufe, name: stufenName(stufe), fortschritt: r.promotionProgress ?? 0,
      hoechste, hoechsteName: stufenName(hoechste), platz: r.currentPlayerRanking ?? null, aktualisiert: r.lastUpdated,
    };
  }
  return rang;
}

/* ------------------------------------------------------------ Profil */

export interface Profil {
  konto: Konto;
  privat: boolean;
  /** Die Stufe in der laufenden Saison (aus der Statistik - bei privater Statistik null) und welche Saison das ist. */
  level: number | null;
  saison: number | null;
  rang: Record<string, Rang>;
  stats: Statistik | null;
  /** Was Epic in der Statistik ausserdem nennt, Schluessel und Zahl unveraendert. */
  weitere: Record<string, number>;
  /** Was gerade nicht zu holen war (stats, rang) - dann fehlt der Teil, statt dass die ganze Antwort scheitert. */
  fehler?: Record<string, string>;
  stand: string;
}

/** Das Profil zum Konto, zehn Minuten gemerkt. */
export function spielerProfil(konto: Konto): Promise<Profil> {
  return mitSpeicher(`spieler|${konto.id}`, SPIELER_FRIST_MS, async () => {
    const [st, rg] = await Promise.allSettled([holeStatistik(konto.id), holeRang(konto.id)]);
    // Beides gescheitert ist kein Profil - dann lieber der Fehler als eine leere Seite, die wie "privat" aussieht.
    if (st.status === 'rejected' && rg.status === 'rejected') throw st.reason;
    const fehler: Record<string, string> = {};
    if (st.status === 'rejected') fehler.stats = (st.reason as Error).message;
    if (rg.status === 'rejected') fehler.rang = (rg.reason as Error).message;
    const s = st.status === 'fulfilled' ? st.value : { privat: false, stats: null, level: null, saison: null, weitere: {} };
    return {
      konto, privat: s.privat, level: s.level, saison: s.saison,
      rang: rg.status === 'fulfilled' ? rg.value : {},
      stats: s.stats, weitere: s.weitere,
      ...(Object.keys(fehler).length ? { fehler } : {}),
      stand: new Date().toISOString(),
    };
  });
}

/** Liegt die Antwort schon im Speicher? Dann kostet die Anfrage Epic nichts (und zaehlt nicht gegen die Bremse). */
export function imSpeicher(frage: { name?: string; id?: string }): boolean {
  const konto = frage.id
    ? gemerkt<Konto | null>(`spielerid|${frage.id.toLowerCase()}`)
    : gemerkt<Konto | null>(`spielername|${(frage.name ?? '').toLowerCase()}`);
  if (konto === undefined) return false;
  return konto === null || gemerkt<Profil>(`spieler|${konto.id}`) !== undefined;
}

/* ------------------------------------------------------------ Bremse */

/*
 * Je Anschluss hoechstens 30 Nachschlagen in zehn Minuten, insgesamt 400 - gezaehlt wird nur, was wirklich zu Epic geht (ein Profil aus dem Speicher
 * ist frei). Ohne das liesse sich ueber diese Route der Zugang der Seite verheizen: Epic drosselt ein Konto, das Namen im Sekundentakt nachschlaegt
 * (siehe die 429 in lib/epicCups), und dann stuenden auch die Cup-Listen.
 *
 * Im Arbeitsspeicher gezaehlt, wie lib/fehlversuche.
 */
const FENSTER_MS = 10 * 60_000;
const JE_ANSCHLUSS = 30;
const INSGESAMT = 400;
const ZAEHLER: Map<string, { n: number; bis: number }> = ((globalThis as { __comphubFnBremse?: Map<string, { n: number; bis: number }> }).__comphubFnBremse ??= new Map());

/** true: die Anfrage darf zu Epic. false: gebremst. */
export function bremseFrei(anschluss: string): boolean {
  const jetzt = Date.now();
  if (ZAEHLER.size > 5000) for (const [k, v] of ZAEHLER) if (jetzt > v.bis) ZAEHLER.delete(k);
  const zaehle1 = (schluessel: string, grenze: number): boolean => {
    const e = ZAEHLER.get(schluessel);
    if (!e || jetzt > e.bis) { ZAEHLER.set(schluessel, { n: 1, bis: jetzt + FENSTER_MS }); return true; }
    if (e.n >= grenze) return false;
    e.n += 1;
    return true;
  };
  // Erst der Anschluss: wer gebremst ist, zaehlt nicht weiter gegen das Kontingent aller.
  return zaehle1(`a|${anschluss || 'unbekannt'}`, JE_ANSCHLUSS) && zaehle1('alle', INSGESAMT);
}
