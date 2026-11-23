import fs from 'node:fs/promises';
import path from 'node:path';
import { liesJson } from '@/lib/ablage';
import { liesClutch, liesClutchJe } from '@/lib/clutchLive';
import { istZeroBuild } from '@/lib/zeroBuild';
import { GET as bestenlisteAbruf } from '@/app/api/cup-leaderboard/route';
import { GET as spielerAbruf } from '@/app/api/cup-spieler/route';
import { JE_SPALTEN, jeLesen } from '@/lib/jeSpiel.mjs';
import { landQuellen } from '@/lib/landQuellen';
import { ftKonten, ftPosts, ftStandings, type FtBildSpieler, type FtClutch, type FtErgebnis, type FtJeZeile, type FtKandidat, type FtPost, type FtTeam } from '@/lib/ftPosts';

/*
 * Die Daten fuer die Fortnite-Tracker-Posts (lib/ftPosts.ts) aus der Ablage der Seite - dieselben Dateien, die scripts/ft-posts.mjs vom Release holt:
 *   clutch/<Fenster>.json und clutch-je/<Fenster>.json (die Ablage findet sie am Release, siehe lib/ablageGithub),
 *   spieler-profile.json, spieler-namen.json, streamers.json,
 * und die Teams aus Epics Bestenliste ueber /api/cup-leaderboard (dieselbe Abfrage wie lib/ergebnisPosts - mit deren Vorrat und Zwischenspeicher).
 * Aus Epic kommt nur der Standings-Post (Plaetze, Punkte, Siege, Elims je Team) - sofort nach dem letzten Game, auch ohne Replays (ftStandings).
 * Dazu je Post die Fotos fuer das Bild darunter (lib/ftBild.ts): die ersten BILD_ZAHL Spieler des Posts mit echtem Foto - wer nur den Platzhalter hat, wird
 * uebersprungen und der naechste kommt dran (wie scripts/cup-post-daten.mjs, bild()).
 */

/** So viele Fotos hoechstens je Bild. */
const BILD_ZAHL = 6;

const SEITE = 'https://www.thecomphub.com';

/** Die alten Zeilen ohne "je" in der Datei (bis 7.11.2026, nur kleine Spieltage) - Elims stehen auch dort an erster Stelle. */
const ALTE_SPALTEN = ['killsEcht', 'dmg', 'erlitten', 'heilHp', 'schildHeilEcht', 'krit', 'treffer', 'schussEcht', 'matsAlt'];

interface LbEintrag { rank: number; points?: number; wins?: number; elims?: number; games?: number; matches?: unknown[]; players?: Array<{ id?: string; name?: string; anzeige?: string; spielLand?: string }> }

/** Alle Teams des Spieltags: erst der ganze Vorrat, sonst die ersten 2.000 Plaetze. */
const lbFrage = async (eventId: string, windowId: string, zusatz: string) => {
  const r = await bestenlisteAbruf(new Request(`${SEITE}/api/cup-leaderboard?event=${encodeURIComponent(eventId)}&window=${encodeURIComponent(windowId)}${zusatz}`));
  if (!r.ok) return { entries: [] as LbEintrag[] };
  const j = (await r.json()) as { entries?: LbEintrag[]; updated?: string };
  return { entries: j.entries ?? [], updated: j.updated };
};

/** Die Flagge aus Fortnite je Konto, wie Epics Bestenliste sie fuehrt (lib/epicCups, spielLand) - geht der gesammelten Datei vor (sie ist frischer). */
const spielLaender: Record<string, string> = {};

function teamsVon(eintraege: LbEintrag[], namen: Record<string, string>): FtTeam[] {
  return eintraege.map((e) => {
    const ids = (e.players ?? []).map((p) => String(p.id ?? '').toLowerCase()).filter(Boolean);
    for (const p of e.players ?? []) {
      const id = String(p.id ?? '').toLowerCase(); const n = p.anzeige || p.name; if (id && n) namen[id] = n;
      if (id && p.spielLand) spielLaender[id] = p.spielLand;
    }
    return { ids, rang: e.rank, punkte: e.points ?? 0, siege: e.wins ?? 0, elims: e.elims ?? 0, spiele: e.games ?? e.matches?.length ?? 0 };
  }).filter((t) => t.ids.length);
}

/*
 * Die ELIMINATIONS-Bestenliste der Statistikseite (app/api/cup-spieler, kennzahl=elims) - genau die Zahlen und Reihenfolge, die der Betreiber dort sieht.
 * Sie zaehlt aus dem vollen Kill-Feed aller eingelesenen Replays (killsEcht nur, wo jedes Spiel gelesen ist), waehrend clutch/<Fenster>.json nur so weit
 * ist, wie der volle Leser gekommen ist. Darum baut "Most Eliminations" auf dieser Liste auf, statt den gedeckelten Clutch-Stand zu nehmen (Betreiber,
 * 23.11.2026: Braden Peters mit 69 fehlte im Post, der 53 von veyrss lxk stand oben). Die Namen kommen mit - fuer Spieler ohne gepflegtes Profil.
 * Schlaegt der Abruf fehl oder liegt noch keine Auswertung vor, bleibt die Liste leer und der Post rechnet wie bisher aus dem Clutch-Stand.
 */
async function elimsBestenliste(eventId: string, windowId: string): Promise<{ rang: Array<{ id: string; elims: number }>; namen: Record<string, string> }> {
  const saison = /^(S\d+)_/i.exec(windowId)?.[1]?.toUpperCase() ?? '';
  const url = `${SEITE}/api/cup-spieler?window=${encodeURIComponent(windowId)}&event=${encodeURIComponent(eventId)}`
    + `${saison ? `&saison=${saison}` : ''}&kennzahl=elims&pro=50`;
  const r = await spielerAbruf(new Request(url));
  if (!r.ok) return { rang: [], namen: {} };
  const j = (await r.json()) as { zeilen?: Array<{ epicId?: string; elims?: number; kills?: number; name?: string }> };
  const rang: Array<{ id: string; elims: number }> = [];
  const namen: Record<string, string> = {};
  for (const z of j.zeilen ?? []) {
    const id = String(z.epicId ?? '').toLowerCase();
    const elims = typeof z.elims === 'number' ? z.elims : typeof z.kills === 'number' ? z.kills : 0;
    if (!/^[0-9a-f]{32}$/.test(id) || !(elims > 0)) continue;
    rang.push({ id, elims });
    if (z.name) namen[id] = z.name;
  }
  return { rang, namen };
}

async function teamsAus(eventId: string, windowId: string): Promise<{ teams: FtTeam[]; namen: Record<string, string> }> {
  let eintraege = (await lbFrage(eventId, windowId, '&ganz=1').catch(() => null))?.entries ?? [];
  if (!eintraege.length) eintraege = (await lbFrage(eventId, windowId, '&limit=2000').catch(() => null))?.entries ?? [];
  const namen: Record<string, string> = {};
  return { teams: teamsVon(eintraege, namen), namen };
}

/*
 * Die ersten Plaetze frisch von Epic (eine Seite, 100 Plaetze, hoechstens 20 s zwischengespeichert) - fuer den Standings-Post direkt nach dem letzten Game.
 * Der Vorrat der ganzen Liste (ganz=1) kann bis zu drei Minuten hinterher sein. frisch: Epics Zwischenspeicher fuer diesen Spieltag verwerfen.
 */
async function spitzeAus(eventId: string, windowId: string, frisch: boolean): Promise<{ teams: FtTeam[]; namen: Record<string, string>; updated?: string }> {
  const d = await lbFrage(eventId, windowId, `&limit=100${frisch ? '&frisch=1' : ''}`).catch(() => ({ entries: [] as LbEintrag[], updated: undefined }));
  const namen: Record<string, string> = {};
  return { teams: teamsVon(d.entries, namen), namen, updated: d.updated };
}

/*
 * Die Fotos aus public/spielerbilder - wie scripts/cup-post-daten.mjs: Platzhalter (graue Silhouette, rund 2 KB) zaehlen nicht, darum nur Dateien ueber 4.000 Byte.
 * Eine Minute vorgehalten; der Ordner aendert sich nur mit einer neuen Fassung der Seite.
 */
const ORDNER = path.join(process.cwd(), 'public', 'spielerbilder');
let fotoVorrat: { bis: number; dateien: Set<string>; gesichter: Record<string, [number, number, number]> } | null = null;
async function fotos() {
  if (fotoVorrat && Date.now() < fotoVorrat.bis) return fotoVorrat;
  const dateien = new Set<string>();
  const namen = await fs.readdir(ORDNER).catch(() => [] as string[]);
  await Promise.all(namen.filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).map(async (f) => {
    const st = await fs.stat(path.join(ORDNER, f)).catch(() => null);
    if (st && st.size > 4000) dateien.add(f);
  }));
  const gesichter = await fs.readFile(path.join(ORDNER, '_gesichter.json'), 'utf8').then((t) => JSON.parse(t) as Record<string, [number, number, number]>).catch(() => ({}));
  fotoVorrat = { bis: Date.now() + 60_000, dateien, gesichter };
  return fotoVorrat;
}

/** Der Name ohne Team-Kuerzel als Dateiname (dieselbe Regel wie scripts/cup-post-daten.mjs). */
const kurz = (n: string) => String(n).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/^(t1|roc|ag|flcn|havok|godl|vp|xp42|s8ul|fokus|nstar|rt|flc|glore|m8|cgn)\s+/i, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Zu jedem Post die Fotos: erst ueber die Konto-Id (spielerbilder.json), dann den Schluessel aus spieler-namen.json, dann den Namen. */
async function mitBildern(posts: FtPost[], schluessel: Record<string, string | undefined>, nachKonto: Map<string, string>): Promise<Array<FtPost & { bild: FtBildSpieler[] }>> {
  const f = await fotos();
  const finde = (k: FtKandidat): FtBildSpieler | null => {
    const kandidaten = [nachKonto.get(k.id), ...[schluessel[k.id], kurz(k.name), kurz(k.name).split('-')[0]].filter(Boolean).flatMap((x) => [`${x}.jpg`, `${x}.png`])];
    const vomKonto = nachKonto.get(k.id);
    for (const datei of kandidaten) {
      // Fotos aus dem Pool und hochgeladene liegen nicht in public/spielerbilder, sondern im Objektspeicher - gezeichnet wird ueber die Adresse
      // /spielerbilder/<datei> (lib/ftBild), die beide ausliefert. Sie gelten, wenn spielerbilder.json sie diesem Konto zuordnet (17.11.2026).
      if (datei && (f.dateien.has(datei) || (datei === vomKonto && /\.webp$/i.test(datei)))) {
        const g = f.gesichter[datei];
        return { ...k, datei, gesicht: Array.isArray(g) && g.length >= 3 ? [g[0], g[1], g[2]] : null };
      }
    }
    return null;
  };
  return posts.map((p) => {
    const bild: FtBildSpieler[] = [];
    for (const k of p.kandidaten) {
      if (bild.length >= BILD_ZAHL) break;
      const b = finde(k);
      if (b) bild.push(b);
    }
    return { ...p, bild };
  });
}

/** Die Fotos fuer ein Bild aus einer Kandidatenliste (lib/ergebnisSofort) - dieselbe Suche wie fuer die Posts hier. */
export async function ftBilderFuer(kandidaten: FtKandidat[]): Promise<FtBildSpieler[]> {
  const [namen, bildListe] = await Promise.all([
    liesJson<Record<string, { schluessel?: string }>>('spieler-namen.json', {}).catch(() => ({})),
    liesJson<Array<{ epicId?: string; datei?: string; echtesFoto?: boolean }>>('spielerbilder.json', []).catch(() => []),
  ]);
  const nachKonto = new Map<string, string>();
  for (const b of Array.isArray(bildListe) ? bildListe : []) if (b?.epicId && b.datei && b.echtesFoto) nachKonto.set(String(b.epicId).toLowerCase(), String(b.datei));
  const schluessel = Object.fromEntries(Object.entries(namen).map(([id, n]) => [id.toLowerCase(), n?.schluessel]));
  const [p] = await mitBildern([{ art: 'standings', titel: '', text: '', kandidaten }], schluessel, nachKonto);
  return p.bild;
}

export class FtDatenFehlen extends Error {}

/** Was die Schnittstelle je Post liefert: der Text und die Fotos fuers Bild. */
export type FtPostMitBild = FtPost & { bild: FtBildSpieler[] };
export type FtAntwort = Omit<FtErgebnis, 'posts'> & {
  posts: FtPostMitBild[]; teams: number;
  /** 'replay': die Stat-Posts aus der Replay-Auswertung sind dabei; 'epic': nur der Standings-Post aus Epics Bestenliste. */
  quelle: 'epic' | 'replay';
  /** Warum die Stat-Posts fehlen (keine oder unvollstaendige Replay-Auswertung) - dann steht nur der Standings-Post da. */
  replayFehlt?: string;
  /** Stand von Epics Bestenliste (ISO-Zeit), aus der der Standings-Post stammt. */
  epicStand?: string;
};

/*
 * quelle:
 *   'auto'   (Vorgabe) - der Standings-Post aus Epic und, wenn die Replay-Auswertung da ist, alle Stat-Posts aus ihr. Fehlt sie, kommt nur der Standings-Post
 *            mit dem Hinweis replayFehlt (Betreiber, 14.11.2026: Stat-Werte wie Schaden, Ratio, Elims, Zeit, Strecke, Mats, Kopftreffer, bestes Game nur aus
 *            den eigenen Replays, nie aus Epic - Epic nur fuer Plaetze, Punkte, Siege und Elims je Team).
 *   'epic'   - nur der Standings-Post, Epics Zwischenspeicher verworfen (Knopf "Sofort (Epic)").
 *   'replay' - wie bisher: ohne Replay-Auswertung ein Fehler (FtDatenFehlen).
 */
export async function ftPostsFuer(eventId: string, windowId: string, titel: string, minSpiele?: number, quelle: 'auto' | 'epic' | 'replay' = 'auto'): Promise<FtAntwort> {
  const [profile, namen, streamer, bildListe] = await Promise.all([
    liesJson<Record<string, { id?: string; x?: string; land?: string; twitch?: string; anzeige?: string }>>('spieler-profile.json', {}).catch(() => ({})),
    liesJson<Record<string, { haupt?: string; schluessel?: string }>>('spieler-namen.json', {}).catch(() => ({})),
    liesJson<{ streamers?: Record<string, Array<{ twitch?: string; twitter?: string }>> } | null>('streamers.json', null).catch(() => null),
    liesJson<Array<{ epicId?: string; datei?: string; echtesFoto?: boolean }>>('spielerbilder.json', []).catch(() => []),
  ]);
  const konten = ftKonten(profile, streamer, namen);
  // Jeder Name bekommt eine Flagge (16.11.2026): nach Profil und Szene-Liste die Flagge aus Fortnite, dann Noble, sonst das Zeichen der Region.
  const quellen = await landQuellen().catch(() => null);
  konten.spiel = { ...(quellen?.spiel ?? {}) };
  konten.noble = quellen?.noble ?? {};
  konten.region = windowId;
  const spielDazu = () => { Object.assign(konten.spiel!, spielLaender); };
  // Konto-Id -> Foto aus dem gepflegten Verzeichnis, nur echte Fotos (lib/epicCups, bilderNachKonto).
  const nachKonto = new Map<string, string>();
  for (const b of Array.isArray(bildListe) ? bildListe : []) if (b?.epicId && b.datei && b.echtesFoto) nachKonto.set(String(b.epicId).toLowerCase(), String(b.datei));
  const schluessel = Object.fromEntries(Object.entries(namen).map(([id, n]) => [id.toLowerCase(), n?.schluessel]));
  // Wer weder gepflegten Namen noch Profil hat, steht mit dem Namen aus der Bestenliste da (vor dem aus dem Replay).
  const lbNamen = (n: Record<string, string>) => { for (const [id, x] of Object.entries(n)) if (!konten.namen[id]) konten.namen[id] = x; };

  // Der Standings-Post: die ersten Plaetze frisch von Epic; "Most Wins" ueber alle Teams, die da sind (frische Werte vor denen aus dem Vorrat).
  const standings = async (alle: FtTeam[]) => {
    const spitze = await spitzeAus(eventId, windowId, quelle === 'epic');
    lbNamen(spitze.namen);
    spielDazu();
    // Teams jenseits der ersten 100 nur fuer "Most Wins" (ohne Platz in der Liste, darum Rang unendlich).
    const frisch = new Set(spitze.teams.map((t) => [...t.ids].sort().join('+')));
    const rest = alle.filter((t) => !frisch.has([...t.ids].sort().join('+'))).map((t) => ({ ...t, rang: Infinity }));
    const post = spitze.teams.length ? ftStandings({ titel, teams: [...spitze.teams, ...rest], konten }) : null;
    return { post, updated: spitze.updated, zahl: spitze.teams.length };
  };

  if (quelle === 'epic') {
    const s = await standings([]);
    if (!s.post) throw new FtDatenFehlen(`Epics Bestenliste fuer ${windowId} ist leer oder nicht erreichbar`);
    return {
      posts: await mitBildern([s.post], schluessel, nachKonto), teams: s.zahl, quelle: 'epic', epicStand: s.updated,
      stand: { gelesen: 0, gesamt: null, teilweise: false }, minSpiele: 0, spieler: 0,
    };
  }

  const clutch = await liesClutch<FtClutch & { jeSpiel?: Record<string, FtJeZeile[]> }>(windowId).catch(() => null);
  let fehlt: string | null = null;
  let je: Record<string, FtJeZeile[]> = {};
  let spalten: string[] = clutch?.je?.spalten ?? JE_SPALTEN;
  if (!clutch?.schaden || !Object.keys(clutch.schaden).length) fehlt = `Keine Replay-Auswertung fuer ${windowId} (clutch/${windowId}.json)`;
  else if (clutch.je) {
    const roh = await liesClutchJe(windowId, clutch).catch(() => null);
    if (!roh) fehlt = `Werte je Match fehlen (clutch-je/${windowId}.json) - ohne sie keine Elims`;
    else je = jeLesen(roh.toString('utf8')) as Record<string, FtJeZeile[]>;
  } else if (clutch.jeSpiel) {
    je = clutch.jeSpiel;
    spalten = ALTE_SPALTEN;
  }
  if (fehlt && quelle === 'replay') throw new FtDatenFehlen(fehlt);

  const lb = await teamsAus(eventId, windowId).catch(() => ({ teams: [] as FtTeam[], namen: {} as Record<string, string> }));
  lbNamen(lb.namen);
  spielDazu();
  const s = await standings(lb.teams).catch(() => ({ post: null, updated: undefined, zahl: 0 }));

  if (fehlt || !clutch) {
    if (!s.post) throw new FtDatenFehlen(`${fehlt} - und Epics Bestenliste ist leer oder nicht erreichbar`);
    return {
      posts: await mitBildern([s.post], schluessel, nachKonto), teams: lb.teams.length || s.zahl, quelle: 'epic', epicStand: s.updated,
      replayFehlt: fehlt ?? undefined, stand: { gelesen: 0, gesamt: null, teilweise: false }, minSpiele: 0, spieler: 0,
    };
  }

  // "Most Eliminations" aus derselben Quelle wie die Statistikseite (cup-spieler) - gleiche Spieler, Zahlen und Reihenfolge; sonst rechnete der Post aus dem
  // teilweise gelesenen Clutch-Stand und untercountete (Betreiber, 23.11.2026). Namen fuer Spieler ohne Profil kommen mit (vor denen aus dem Replay).
  const elims = await elimsBestenliste(eventId, windowId).catch(() => ({ rang: [] as Array<{ id: string; elims: number }>, namen: {} as Record<string, string> }));
  lbNamen(elims.namen);
  spielDazu();

  const erg = ftPosts({ titel, clutch, je, spalten, teams: lb.teams, konten, minSpiele, fenster: windowId, zeroBuild: istZeroBuild(windowId), elimsRang: elims.rang.length ? elims.rang : undefined });
  const posts: FtPost[] = [...(s.post ? [s.post] : []), ...erg.posts.map((p) => ({ ...p, quelle: 'replay' as const }))];
  return {
    ...erg, posts: await mitBildern(posts, schluessel, nachKonto), teams: lb.teams.length, quelle: 'replay', epicStand: s.updated,
  };
}
