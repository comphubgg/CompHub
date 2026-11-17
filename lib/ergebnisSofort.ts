import { liesJson, schreibJson } from '@/lib/ablage';
import { GET as katalogAbruf } from '@/app/api/cup-catalog/route';
import { GET as bestenlisteAbruf } from '@/app/api/cup-leaderboard/route';
import { GET as qualiAbruf } from '@/app/api/qualifikation/route';
import { kernname, ohneZierrat } from '@/lib/homoglyph';
import { titelMit, zielName, stufeKurz } from '@/lib/cupTitel';
import { finale } from '@/lib/ergebnisPosts';
import { landQuellen } from '@/lib/landQuellen';
import { ftErgebnisPost, type FtKonten, type FtTeam, type FtPost } from '@/lib/ftPosts';
import { ftBilderFuer } from '@/lib/ftPostsDaten';
import type { FtBildSpieler } from '@/lib/ftPosts';

/*
 * Der Ergebnis-Post binnen einer Minute nach dem Ende eines Spieltags (Betreiber, 15.11.2026: "ich verliere das Rennen gegen die anderen Stats-Accounts,
 * weil ich den Post von Hand bauen muss").
 *
 * Der Dienst "ergebnis" (deploy/server-compose.yml, scripts/ergebnis-sofort.mjs) fragt /api/cron/ergebnis-sofort alle 15 Sekunden, solange ein Spieltag
 * laeuft oder gerade zu Ende ging. Hier wird entschieden, ob ein Spieltag FERTIG ist, und der Post gebaut (lib/ftPosts.ts, ftErgebnisPost):
 *
 *   Fertig heisst (der erste zutreffende Grund gilt):
 *     1. "alle-spiele": jeder Eintrag bis zur Grenze (mindestens die ersten zehn) hat so viele Spiele, wie Epic erlaubt (matchCap) - oder ist mit einem Sieg
 *        sofort weiter (Punkte >= sofortPunkte, FNCS-Heats: der Sieger hoert auf). Mehr Spiele gibt es nicht, die Liste kann sich nicht mehr aendern.
 *     2. "ruhig": das Fenster ist zu (end vorbei) und die Liste stand bei drei Abfragen ueber mindestens 90 Sekunden still (dieselben Plaetze, Punkte, Spiele).
 *        Spiele, die kurz vor end begannen, laufen bis zu ~25 Minuten nach - darum frueher nur mit (1).
 *     3. "spaet": 40 Minuten nach end gilt der Stand in jedem Fall.
 *
 * Nie doppelt: jeder Spieltag bekommt einen Eintrag in ergebnis-sofort.json (Ablage), sobald der Dienst gemeldet hat, dass er gepostet ist (vermerken).
 * Die Vorab-Prognose der Grenze wird beim ersten Blick auf den laufenden Spieltag festgehalten (Feld "prognose") - so steht im Post, was wir VOR dem Cup sagten.
 */

const SEITE = 'https://www.thecomphub.com';
const DATEI = 'ergebnis-sofort.json';
const ZUSCHLAG = 5; // wie QUAL_ZUSCHLAG auf der Event-Seite (app/events/[id]/page.tsx)

interface Marke { token: string; bis: number }
export interface SofortFenster {
  windowId: string; eventId: string; status?: string; begin?: number; end?: number; istFinale?: boolean;
  matchCap?: number; qualifiziert?: number; sofortPunkte?: number; tokens?: string[]; marken?: Marke[]; playlist?: string;
}
interface SofortCup { id: string; titel: string; art: string; global?: boolean; regionen?: Record<string, SofortFenster[]> }
interface LbEintrag { rank: number; points?: number; wins?: number; elims?: number; matches?: unknown[]; players?: Array<{ id?: string; name?: string; anzeige?: string }> }

export interface SofortStand {
  gepostet: Record<string, { zeit: number; grund: string; text?: string }>;
  /** windowId -> unsere Prognose der Grenze, beim ersten Blick waehrend des Spieltags festgehalten. */
  prognose: Record<string, number>;
}

export interface SofortPost {
  schluessel: string;
  windowId: string; eventId: string; region: string; cupId: string;
  /** Der Text fuer X (und #admin-posts). */
  text: string;
  titel: string;
  /** Warum der Spieltag als fertig gilt (alle-spiele | ruhig | spaet | probe). */
  grund: string;
  /** Die Fotos fuers Bild (lib/ftBild.ts). */
  bild: FtBildSpieler[];
  /** Fuer #results: Plaetze in Kurzform. */
  zeilen: string[];
  end?: number;
}

const leer = (): SofortStand => ({ gepostet: {}, prognose: {} });
export async function sofortStand(): Promise<SofortStand> {
  const s = await liesJson<SofortStand | null>(DATEI, null).catch(() => null);
  return { ...leer(), ...(s ?? {}), gepostet: s?.gepostet ?? {}, prognose: s?.prognose ?? {} };
}

/** Als gepostet vermerken (vom Dienst nach dem Posten aufgerufen). */
export async function sofortVermerken(schluessel: string, grund: string, text?: string): Promise<void> {
  const s = await sofortStand();
  s.gepostet[schluessel] = { zeit: Date.now(), grund, ...(text ? { text: text.slice(0, 3000) } : {}) };
  // Nur die letzten 400 behalten.
  const alt = Object.entries(s.gepostet).sort((a, b) => b[1].zeit - a[1].zeit).slice(0, 400);
  s.gepostet = Object.fromEntries(alt);
  const pr = Object.entries(s.prognose).slice(-400);
  s.prognose = Object.fromEntries(pr);
  await schreibJson(DATEI, s);
}

/**
 * Konten fuer den Post: @X und Anzeigename aus spieler-profile.json, sonst der bereinigte Name. Das Land (16.11.2026, "jeder Spieler soll eine Flagge haben"):
 * Profil, Szene-Liste, die Flagge aus Fortnite, Noble (lib/landQuellen, Reihenfolge in lib/spielerFlagge.mjs) - ohne Land das Zeichen der Region.
 */
async function kontenLaden(): Promise<FtKonten> {
  const [profile, namen] = await Promise.all([
    liesJson<Record<string, { id?: string; epicId?: string; x?: string; land?: string; anzeige?: string }> | Array<{ id?: string; epicId?: string; x?: string; land?: string; anzeige?: string }>>('spieler-profile.json', {}).catch(() => ({})),
    liesJson<Record<string, { haupt?: string }>>('spieler-namen.json', {}).catch(() => ({})),
  ]);
  const k: FtKonten = { x: {}, land: {}, twitch: {}, namen: {} };
  const liste = Array.isArray(profile) ? profile.map((p) => [p.id ?? p.epicId ?? '', p] as const) : Object.entries(profile ?? {});
  for (const [schl, p] of liste) {
    const id = String(p?.id || p?.epicId || schl || '').toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(id)) continue;
    const x = String(p.x ?? '').trim().replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, '').replace(/^@/, '').replace(/[/?].*$/, '');
    if (x) k.x[id] = x;
    if (p.land && /^[A-Za-z]{2}$/.test(p.land)) k.land[id] = p.land;
    if (p.anzeige) k.namen[id] = p.anzeige;
  }
  for (const [id, n] of Object.entries(namen ?? {})) if (n?.haupt && !k.namen[id.toLowerCase()]) k.namen[id.toLowerCase()] = n.haupt;
  const q = await landQuellen().catch(() => null);
  if (q) { k.spiel = { ...q.spiel }; k.noble = q.noble; }
  return k;
}

const sauber = (n: string) => ohneZierrat(kernname(n)).trim() || n;

async function bestenliste(f: SofortFenster, frisch: boolean): Promise<LbEintrag[]> {
  const r = await bestenlisteAbruf(new Request(`${SEITE}/api/cup-leaderboard?event=${encodeURIComponent(f.eventId)}&window=${encodeURIComponent(f.windowId)}&limit=100${frisch ? '&frisch=1' : ''}`));
  const j = await r.json().catch(() => null) as { entries?: LbEintrag[]; error?: string } | null;
  if (!r.ok) throw new Error(`Bestenliste ${r.status}: ${j?.error ?? ''}`.slice(0, 200));
  return j?.entries ?? [];
}

/** Unsere Prognose der Grenze, wie die Event-Seite sie zeigt (Vorab-Prognose: Schnitt + Zuschlag + gelernte Korrektur, nicht die Hochrechnung waehrend des Cups). */
async function vorabPrognose(f: SofortFenster, region: string): Promise<number | null> {
  try {
    const r = await qualiAbruf(new Request(`${SEITE}/api/qualifikation?window=${encodeURIComponent(f.windowId)}&region=${encodeURIComponent(region)}`));
    const q = await r.json() as { schnitt?: number | null; aehnlich?: boolean; korrektur?: number };
    if (typeof q.schnitt !== 'number' || q.schnitt <= 0) return null;
    return q.schnitt + (q.aehnlich ? 0 : ZUSCHLAG) + (q.korrektur ?? 0);
  } catch { return null; }
}

/** Wohin der Spieltag fuehrt: aus der Kennung (lib/cupTitel zielName), sonst das Fenster, das seine Marke verlangt. */
function naechsteStufe(f: SofortFenster, alle: Array<{ cup: SofortCup; f: SofortFenster }>): string | null {
  const z = zielName(f.windowId);
  if (z) return z;
  const marken = new Set((f.marken ?? []).map((m) => m.token));
  if (!marken.size) return null;
  const ziel = alle.find((x) => x.f.windowId !== f.windowId && (x.f.tokens ?? []).some((t) => marken.has(t)));
  if (!ziel) return null;
  const kurz = stufeKurz(ziel.f.windowId);
  if (kurz) return kurz;
  if (/final/i.test(ziel.f.windowId) || ziel.f.istFinale) return 'Finals';
  const r = /Round(\d+)/i.exec(ziel.f.windowId);
  return r ? `Round ${r[1]}` : 'next round';
}

/** Spieltage, deren Prognose schon einmal gefragt wurde (im Prozess) - ohne Ergebnis nicht alle 15 Sekunden neu. */
const prognoseVersucht = new Set<string>();

/** Stillstand je Spieltag (im Prozess): Signatur der Liste und seit wann sie so steht. */
const ruhe = new Map<string, { sig: string; seit: number; mal: number }>();

function fertigGrund(f: SofortFenster, eintraege: LbEintrag[], schwelle: number, jetzt: number): string | null {
  if (eintraege.length < 3) return null;
  const tiefe = Math.min(100, Math.max(10, schwelle || 0));
  const bis = eintraege.filter((e) => e.rank <= tiefe);
  const cap = f.matchCap ?? 0;
  const sofort = f.sofortPunkte ?? 0;
  const gespielt = (e: LbEintrag) => (e.matches ?? []).length;
  if (cap > 0 && bis.length >= Math.min(tiefe, 3) && bis.every((e) => gespielt(e) >= cap || (sofort > 0 && (e.points ?? 0) >= sofort))) return 'alle-spiele';
  const ende = f.end ?? 0;
  if (!ende || jetzt < ende) return null;
  const sig = bis.map((e) => `${e.rank}:${(e.players ?? []).map((p) => p.id).join('+')}:${e.points}:${gespielt(e)}`).join('|');
  const r = ruhe.get(f.windowId);
  if (!r || r.sig !== sig) ruhe.set(f.windowId, { sig, seit: jetzt, mal: 1 });
  else { r.mal += 1; if (r.mal >= 3 && jetzt - r.seit >= 90_000) return 'ruhig'; }
  if (jetzt > ende + 40 * 60_000) return 'spaet';
  return null;
}

/** Den Post zu einem Spieltag bauen (ohne Pruefung, ob er fertig ist). */
async function postBauen(cup: SofortCup, region: string, f: SofortFenster, alle: Array<{ cup: SofortCup; f: SofortFenster }>, eintraege: LbEintrag[],
  konten: FtKonten, prognose: number | null, grund: string): Promise<SofortPost | null> {
  const teams: FtTeam[] = eintraege.map((e) => {
    const ids = (e.players ?? []).map((p) => String(p.id ?? '').toLowerCase()).filter(Boolean);
    for (const p of e.players ?? []) {
      const id = String(p.id ?? '').toLowerCase();
      if (id && !konten.namen[id] && (p.anzeige || p.name)) konten.namen[id] = sauber(String(p.anzeige || p.name));
      // Die Flagge aus Fortnite, wie Epics Bestenliste sie gerade fuehrt (lib/epicCups) - frischer als die gesammelte.
      const sl = (p as { spielLand?: string }).spielLand;
      if (id && sl) (konten.spiel ??= {})[id] = sl;
    }
    return { ids, rang: e.rank, punkte: e.points ?? 0, siege: e.wins ?? 0, elims: e.elims ?? 0, spiele: (e.matches ?? []).length };
  }).filter((t) => t.ids.length);
  const istFinale = finale(cup as never, f as never, (cup.regionen?.[region] ?? []) as never);
  const schwelle = !istFinale && f.qualifiziert ? f.qualifiziert : null;
  const naechste = schwelle ? naechsteStufe(f, alle) : null;
  const name = titelMit(cup.titel, f.windowId, f.playlist);
  const post: FtPost | null = ftErgebnisPost({ cup: name, region, teams, konten: { ...konten, region }, schwelle, sofortPunkte: f.sofortPunkte ?? null, naechste, prognose });
  if (!post) return null;
  const bild = await ftBilderFuer(post.kandidaten).catch(() => [] as FtBildSpieler[]);
  const medaille = ['🥇', '🥈', '🥉'];
  const wer = (t: FtTeam) => t.ids.map((i) => konten.namen[i] ?? i.slice(0, 8)).join(' + ');
  const zeilen = teams.slice(0, 10).map((t, i) => `${medaille[i] ?? `\`${String(t.rang).padStart(2)}.\``} **${wer(t)}** · ${(t.punkte ?? 0).toLocaleString('en-US')} pts`);
  return {
    schluessel: `${f.windowId}`, windowId: f.windowId, eventId: f.eventId, region, cupId: cup.id,
    text: post.text, titel: post.text.split('\n')[0], grund, bild, zeilen, end: f.end,
  };
}

async function katalog(): Promise<Array<{ cup: SofortCup; region: string; f: SofortFenster }>> {
  const j = await (await katalogAbruf(new Request(`${SEITE}/api/cup-catalog?modus=standard`))).json() as { cups?: SofortCup[] };
  const raus: Array<{ cup: SofortCup; region: string; f: SofortFenster }> = [];
  for (const cup of j.cups ?? []) {
    if (cup.art !== 'championship' && cup.art !== 'division') continue;
    for (const [region, fenster] of Object.entries(cup.regionen ?? {})) {
      for (const f of fenster) if (!String(f.eventId).startsWith('manuell_')) raus.push({ cup, region, f });
    }
  }
  return raus;
}

export interface SofortLauf {
  /** Fertige, noch nicht gepostete Posts. */
  posts: SofortPost[];
  /** Spieltage, die gerade beobachtet werden (laufen oder gingen gerade zu Ende), mit Stand. */
  beobachtet: Array<{ windowId: string; region: string; grund: string | null; spiele: number; cap: number; fehler?: string }>;
  /** Bis wann der Dienst eng (15 s) fragen soll: ein Spieltag laeuft oder beginnt in den naechsten 10 Minuten. */
  eng: boolean;
}

/**
 * Ein Lauf: alle Spieltage, die laufen oder vor hoechstens 3 Stunden endeten und noch keinen Post haben.
 *   probe: dieser windowId wird ohne Pruefung gebaut (fertig oder nicht, gepostet oder nicht) - fuer den Trockenlauf.
 */
export async function sofortLauf(probe?: string | null): Promise<SofortLauf> {
  const jetzt = Date.now();
  const alle = await katalog();
  const stand = await sofortStand();
  const posts: SofortPost[] = [];
  const beobachtet: SofortLauf['beobachtet'] = [];
  let eng = false;
  let konten: FtKonten | null = null;
  let standGeaendert = false;
  for (const { cup, region, f } of alle) {
    const begin = f.begin ?? 0; const end = f.end ?? 0;
    if (probe) { if (f.windowId !== probe) continue; }
    else {
      if (begin && begin - 10 * 60_000 <= jetzt && (!end || jetzt <= end + 60 * 60_000)) eng = true;
      if (!begin || begin > jetzt || (end && jetzt > end + 3 * 3_600_000)) continue;
      if (stand.gepostet[f.windowId]) continue;
    }
    // Die Vorab-Prognose einmal festhalten - beim ersten Blick, solange der Spieltag laeuft.
    let prognose: number | null = stand.prognose[f.windowId] ?? null;
    if (prognose === null && f.qualifiziert && !(probe ? false : prognoseVersucht.has(f.windowId)) && !finale(cup as never, f as never, (cup.regionen?.[region] ?? []) as never)) {
      prognoseVersucht.add(f.windowId);
      prognose = await vorabPrognose(f, region);
      if (prognose !== null && !probe) { stand.prognose[f.windowId] = prognose; standGeaendert = true; }
    }
    // Aus dem 20-s-Vorrat der Bestenliste (wie die Seite) - "frisch" verwuerfe ihn fuer alle Zuschauer; 20 s Verzug passen in die Minute.
    let fehler: string | undefined;
    const eintraege = await bestenliste(f, !!probe).catch((e) => { fehler = (e as Error).message; return [] as LbEintrag[]; });
    const schwelle = f.qualifiziert ?? 0;
    const grund = probe ? 'probe' : fertigGrund(f, eintraege, schwelle, jetzt);
    beobachtet.push({ windowId: f.windowId, region, grund, spiele: Math.max(0, ...eintraege.slice(0, 100).map((e) => (e.matches ?? []).length)), cap: f.matchCap ?? 0, ...(fehler ? { fehler } : {}) });
    if (!grund) continue;
    konten ??= await kontenLaden();
    const p = await postBauen(cup, region, f, alle.map((x) => ({ cup: x.cup, f: x.f })), eintraege, { ...konten, namen: { ...konten.namen } }, prognose, grund);
    if (p) posts.push(p);
  }
  if (standGeaendert) {
    // Frisch lesen und nur die Prognosen ergaenzen - ein paralleles Vermerken bleibt erhalten.
    const neu = await sofortStand();
    for (const [w, v] of Object.entries(stand.prognose)) if (neu.prognose[w] === undefined) neu.prognose[w] = v;
    await schreibJson(DATEI, neu).catch(() => { /* beim naechsten Lauf */ });
  }
  return { posts, beobachtet, eng };
}
