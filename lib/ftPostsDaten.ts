import fs from 'node:fs/promises';
import path from 'node:path';
import { liesJson, speicher } from '@/lib/ablage';
import { istZeroBuild } from '@/lib/zeroBuild';
import { GET as bestenlisteAbruf } from '@/app/api/cup-leaderboard/route';
import { JE_SPALTEN, jeLesen } from '@/lib/jeSpiel.mjs';
import { ftKonten, ftPosts, type FtBildSpieler, type FtClutch, type FtErgebnis, type FtJeZeile, type FtKandidat, type FtPost, type FtTeam } from '@/lib/ftPosts';

/*
 * Die Daten fuer die Fortnite-Tracker-Posts (lib/ftPosts.ts) aus der Ablage der Seite - dieselben Dateien, die scripts/ft-posts.mjs vom Release holt:
 *   clutch/<Fenster>.json und clutch-je/<Fenster>.json (die Ablage findet sie am Release, siehe lib/ablageGithub),
 *   spieler-profile.json, spieler-namen.json, szene-quelle/spielerliste.json, streamers.json,
 * und die Teams aus Epics Bestenliste ueber /api/cup-leaderboard (dieselbe Abfrage wie lib/ergebnisPosts - mit deren Vorrat und Zwischenspeicher).
 * Dazu je Post die Fotos fuer das Bild darunter (lib/ftBild.ts): die ersten BILD_ZAHL Spieler des Posts mit echtem Foto - wer nur den Platzhalter hat, wird
 * uebersprungen und der naechste kommt dran (wie scripts/cup-post-daten.mjs, bild()).
 */

/** So viele Fotos hoechstens je Bild. */
const BILD_ZAHL = 6;

const SEITE = 'https://www.thecomphub.com';

/** Die alten Zeilen ohne "je" in der Datei (bis 7.11.2026, nur kleine Spieltage) - Elims stehen auch dort an erster Stelle. */
const ALTE_SPALTEN = ['killsEcht', 'dmg', 'erlitten', 'heilHp', 'schildHeilEcht', 'krit', 'treffer', 'schussEcht', 'matsAlt'];

interface LbEintrag { rank: number; wins?: number; elims?: number; games?: number; matches?: unknown[]; players?: Array<{ id?: string; name?: string; anzeige?: string }> }

/** Alle Teams des Spieltags: erst der ganze Vorrat, sonst die ersten 2.000 Plaetze. */
async function teamsAus(eventId: string, windowId: string): Promise<{ teams: FtTeam[]; namen: Record<string, string> }> {
  const frage = async (zusatz: string) => {
    const r = await bestenlisteAbruf(new Request(`${SEITE}/api/cup-leaderboard?event=${encodeURIComponent(eventId)}&window=${encodeURIComponent(windowId)}${zusatz}`));
    if (!r.ok) return [] as LbEintrag[];
    return ((await r.json()) as { entries?: LbEintrag[] }).entries ?? [];
  };
  let eintraege = await frage('&ganz=1').catch(() => [] as LbEintrag[]);
  if (!eintraege.length) eintraege = await frage('&limit=2000').catch(() => [] as LbEintrag[]);
  const namen: Record<string, string> = {};
  const teams = eintraege.map((e) => {
    const ids = (e.players ?? []).map((p) => String(p.id ?? '').toLowerCase()).filter(Boolean);
    for (const p of e.players ?? []) { const id = String(p.id ?? '').toLowerCase(); const n = p.anzeige || p.name; if (id && n) namen[id] = n; }
    return { ids, rang: e.rank, siege: e.wins ?? 0, elims: e.elims ?? 0, spiele: e.games ?? e.matches?.length ?? 0 };
  }).filter((t) => t.ids.length);
  return { teams, namen };
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
    for (const datei of kandidaten) {
      if (datei && f.dateien.has(datei)) {
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

export class FtDatenFehlen extends Error {}

/** Was die Schnittstelle je Post liefert: der Text und die Fotos fuers Bild. */
export type FtPostMitBild = FtPost & { bild: FtBildSpieler[] };
export type FtAntwort = Omit<FtErgebnis, 'posts'> & { posts: FtPostMitBild[]; teams: number };

export async function ftPostsFuer(eventId: string, windowId: string, titel: string, minSpiele?: number): Promise<FtAntwort> {
  const clutch = await liesJson<(FtClutch & { jeSpiel?: Record<string, FtJeZeile[]> }) | null>(`clutch/${windowId}.json`, null).catch(() => null);
  if (!clutch?.schaden || !Object.keys(clutch.schaden).length) throw new FtDatenFehlen(`Keine Replay-Auswertung fuer ${windowId} (clutch/${windowId}.json)`);

  let je: Record<string, FtJeZeile[]> = {};
  let spalten: string[] = clutch.je?.spalten ?? JE_SPALTEN;
  if (clutch.je) {
    const roh = await speicher.lies(`clutch-je/${windowId}.json`).catch(() => null);
    if (!roh) throw new FtDatenFehlen(`Werte je Match fehlen (clutch-je/${windowId}.json) - ohne sie keine Elims`);
    je = jeLesen(roh.toString('utf8')) as Record<string, FtJeZeile[]>;
  } else if (clutch.jeSpiel) {
    je = clutch.jeSpiel;
    spalten = ALTE_SPALTEN;
  }

  const [profile, namen, liste, streamer, lb, bildListe] = await Promise.all([
    liesJson<Record<string, { id?: string; x?: string; land?: string; twitch?: string; anzeige?: string }>>('spieler-profile.json', {}).catch(() => ({})),
    liesJson<Record<string, { haupt?: string; schluessel?: string }>>('spieler-namen.json', {}).catch(() => ({})),
    liesJson<Array<{ ID?: string; COUNTRY?: string }>>('szene-quelle/spielerliste.json', []).catch(() => []),
    liesJson<{ streamers?: Record<string, Array<{ twitch?: string; twitter?: string }>> } | null>('streamers.json', null).catch(() => null),
    teamsAus(eventId, windowId).catch(() => ({ teams: [] as FtTeam[], namen: {} as Record<string, string> })),
    liesJson<Array<{ epicId?: string; datei?: string; echtesFoto?: boolean }>>('spielerbilder.json', []).catch(() => []),
  ]);
  const konten = ftKonten(profile, liste, streamer, namen);
  // Wer weder gepflegten Namen noch Profil hat, steht mit dem Namen aus der Bestenliste da (vor dem aus dem Replay).
  for (const [id, n] of Object.entries(lb.namen)) if (!konten.namen[id]) konten.namen[id] = n;

  const erg = ftPosts({ titel, clutch, je, spalten, teams: lb.teams, konten, minSpiele, fenster: windowId, zeroBuild: istZeroBuild(windowId) });
  // Konto-Id -> Foto aus dem gepflegten Verzeichnis, nur echte Fotos (lib/epicCups, bilderNachKonto).
  const nachKonto = new Map<string, string>();
  for (const b of Array.isArray(bildListe) ? bildListe : []) if (b?.epicId && b.datei && b.echtesFoto) nachKonto.set(String(b.epicId).toLowerCase(), String(b.datei));
  const schluessel = Object.fromEntries(Object.entries(namen).map(([id, n]) => [id.toLowerCase(), n?.schluessel]));
  return { ...erg, posts: await mitBildern(erg.posts, schluessel, nachKonto), teams: lb.teams.length };
}
