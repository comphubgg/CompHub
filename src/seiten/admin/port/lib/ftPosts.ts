/*
 * Stat-Posts fuer X aus CompHubs Replay-Auswertung - im eigenen CompHub-Stil (Betreiber, 14.11.2026: "nicht 1:1 Fortnite Tracker kopieren, das ist
 * sass - eigener Stil, andere passende Emojis, sauberes Layout, mehr Posts und Stats"). Englisch, mit Flagge und @-Konto bzw. twitch.tv, jeder Post
 * unter 280 Zeichen, wie X sie zaehlt (tweetLaenge): Listen werden von hinten gekuerzt, bis sie passen.
 *
 * Nur das Bauen der Texte - ohne Datei- oder Netzzugriff, damit dieselbe Regel in der Seite (lib/ftPostsDaten.ts, /api/admin/ft-posts) und im
 * Kommandozeilen-Werkzeug (scripts/ft-posts.mjs, mit node --experimental-strip-types) gilt. Deshalb hier keine "@/"-Importe, nur reine Typen und die ebenso reine Flaggen-Regel (./spielerFlagge.mjs).
 *
 * Woher die Werte kommen (clutch/<Fenster>.json, scripts/clutch-berechnen.mjs, lib/vollSchaden.mjs) - dieselben Regeln wie die Statistikseite
 * (app/api/cup-spieler, app/api/spieler-detail):
 *   - Elims: killsEcht aus clutch/<Fenster>.json (Summe, wenn jedes Spiel den Kill-Zaehler hat), sonst Spalte "killsEcht" aus clutch-je aufsummiert. NICHT das Feld "solo" - das sind Clutch-Punkte.
 *   - Schaden, erlitten, Treffer, Kopftreffer (krit), Zeit im Sturm (sturm, Sekunden): "schaden".
 *   - Gebaute Teile (selbstHolz/-Stein/-Metall) und gefarmte Mats (farmHolz/-Stein/-Metall) nur, wenn jedes gelesene Spiel sie hat (invSpiele >= spiele);
 *     Mats im Zero Build gar nicht (dort 0, lib/zeroBuild).
 *   - Ueberlebenszeit: epicZeit vor leben, hoechstens die Teamzeit (epicTeamZeit); bei Reload nur epicZeit, wenn es sie gibt.
 *   - Strecke: epicStrecke (Meter, von Epic) vor strecke ([Fuss, Luft] aus Positionsproben, ohne Epic-Werte auf 68,5 % hochgerechnet und als "est." markiert).
 *   - Bestes Spiel: die meisten killsEcht in einem Match (Zeilen aus clutch-je), bei Gleichstand der Schaden dieses Matches.
 *   - Sieger, Siege und Elims je Team: Epics Bestenliste des Spieltags.
 *   - Flagge (16.11.2026: jeder Name hat eine - lib/spielerFlagge.mjs): spieler-profile.json (land), dann die Flagge, die der
 *     Spieler in Fortnite gewaehlt hat (Epics playerFlagTokens, "spiel"), dann Noble - eine automatische Quelle, die der Region widerspricht, wird uebersprungen
 *     und gemeldet. Ohne Land das Zeichen der Region (🇪🇺, 🌎, 🌏, 🌍). @-Konto aus spieler-profile.json (x).
 *   - Immer @X-Konto, sonst der Name - nie twitch.tv (das gehoert nur in den Live-Post der Streamer).
 * Quoten (Damage Ratio, Kills/Match) und die Summen, die mit der Zahl der Spiele wachsen (Zeit am Leben), nur ab der Mindestzahl Spiele.
 * Fehlt ein Wert fuer alle (z. B. kein Inventar gelesen), entfaellt der Post - es wird nichts geschaetzt, was nicht als Schaetzung dasteht.
 */

import { flaggeOderRegion, flaggeZeichen, landWaehlen, regionVon } from './spielerFlagge.mjs';
import { saeubere, teamTags } from './namenSaeubern';

export type FtJeZeile = Array<string | number | null>;

/** Die Werte eines Spielers in clutch/<Fenster>.json, Feld "schaden" (alle optional - aeltere Dateien haben nicht alles). */
export interface FtSpielerWerte {
  dmg?: number; erlitten?: number; treffer?: number; krit?: number; sturm?: number; invSpiele?: number; killsEcht?: number;
  farmHolz?: number; farmStein?: number; farmMetall?: number; selbstHolz?: number; selbstStein?: number; selbstMetall?: number;
}

/** Was aus clutch/<Fenster>.json gebraucht wird. */
export interface FtClutch {
  schaden?: Record<string, FtSpielerWerte | undefined>;
  spiele?: Record<string, number>;
  namen?: Record<string, string>;
  /** Zeit am Leben in Sekunden (lib/clutchLeben.mjs). */
  leben?: Record<string, number>;
  /** Epics Zeit am Leben (Sekunden) und die des Teams als Obergrenze. */
  epicZeit?: Record<string, number>;
  /** Epics DamageDealt je Konto (Solo-Cups, scripts/clutch-berechnen) - geht im Solo dem Replay-Wert vor, wie in app/api/cup-spieler. */
  epicDmg?: Record<string, number>;
  epicTeamZeit?: Record<string, number>;
  /** Strecke aus den Positionsproben: [zu Fuss, in der Luft] in Metern. */
  strecke?: Record<string, [number, number] | number[]>;
  /** Epics Strecke in Metern. */
  epicStrecke?: Record<string, number>;
  matches?: unknown[];
  gesamt?: number;
  teilweise?: unknown;
  je?: { spalten?: string[] };
}

/** Ein Team aus Epics Bestenliste. */
export interface FtTeam { ids: string[]; siege: number; spiele: number; elims: number; rang?: number; /** Epics Punkte (nur fuer den Standings-Post). */ punkte?: number }

/** Wie ein Spieler im Text erscheint - alle Schluessel klein geschrieben. */
export interface FtKonten {
  x: Record<string, string>;
  /** Das Land aus unseren Profilen (spieler-profile.json) - gilt immer zuerst. */
  land: Record<string, string>;
  twitch: Record<string, string>;
  /** Der Name, wenn es weder @ noch Twitch gibt. */
  namen: Record<string, string>;
  /** Wessen Name gepflegt ist (der saubere Anzeigename aus dem Profil) - die anderen werden vor dem Zeigen noch von sicheren Team-Tags befreit. */
  gepflegt?: Record<string, true>;
  /** Weitere Quellen fuers Land, in dieser Reihenfolge nach dem Profil (lib/spielerFlagge.mjs): Fortnite-Flagge (Epic), Noble. */
  spiel?: Record<string, string>;
  noble?: Record<string, string>;
  /** Die Wettkampfregion (Fenster-Id oder "EU") - prueft die automatischen Quellen und gibt das Zeichen, wenn kein Land bekannt ist. */
  region?: string;
}

export interface FtEingabe {
  /** Kopfzeile ohne Pokal, z. B. "FNCS Solo Reload Round 2 EU". */
  titel: string;
  clutch: FtClutch;
  /** Id -> Zeilen je Match (lib/jeSpiel.mjs). */
  je: Record<string, FtJeZeile[]>;
  /** Die Spalten der Zeilen nach der Match-Id (clutch.je.spalten bzw. JE_SPALTEN). */
  spalten: string[];
  /** Teams aus Epics Bestenliste; ohne sie fehlen Winner, Most Wins und Most Kills/Match. */
  teams?: FtTeam[] | null;
  konten: FtKonten;
  /** Mindestzahl Spiele fuer Quoten und Zeit am Leben - sonst die Haelfte der meisten Spiele eines Spielers. */
  minSpiele?: number;
  /** Die Fenster-Id (fuer die Reload-Regel der Ueberlebenszeit). */
  fenster?: string;
  /** Zero Build (lib/zeroBuild): keine Mats. */
  zeroBuild?: boolean;
  /**
   * Massgebliche Elim-Zahlen je Spieler aus der Statistikseite (app/api/cup-spieler, dieselbe ELIMINATIONS-Bestenliste), in deren Reihenfolge. Sie zaehlt
   * aus dem vollen Kill-Feed aller eingelesenen Replays (killsEcht nur, wo jedes Spiel gelesen ist), waehrend clutch/<Fenster>.json nur so weit ist, wie der
   * volle Leser gekommen ist. Mit dieser Liste trifft "Most Eliminations" Spieler, Zahlen und Reihenfolge der Seite exakt, statt aus dem teilweise gelesenen
   * Clutch-Stand zu untercounten und umzusortieren (Betreiber, 23.11.2026: Braden Peters mit 69 fehlte im Post, veyrss lxk stand mit 53 oben).
   */
  elimsRang?: Array<{ id: string; elims: number }>;
}

export type FtArt = 'standings' | 'best-stats' | 'elims' | 'damage' | 'best-game' | 'hits' | 'builds' | 'mats' | 'survival' | 'storm' | 'distance';
/** Ein Spieler, wie er im Bild unter dem Foto steht. */
export interface FtKandidat { id: string; name: string; land: string | null }
export interface FtPost {
  art: FtArt; titel: string; text: string;
  /** Die Spieler des Posts in Rangfolge (mehr als im Text, damit das Bild Spieler ohne Foto ueberspringen kann). */
  kandidaten: FtKandidat[];
  /** Woher die Werte stammen: 'epic' nur beim Standings-Post (Epics Bestenliste, sofort nach dem letzten Game), sonst 'replay'. */
  quelle?: 'epic' | 'replay';
}
export interface FtErgebnis {
  posts: FtPost[];
  stand: { gelesen: number; gesamt: number | null; teilweise: boolean };
  minSpiele: number;
  spieler: number;
}

/** Ein Foto fuer das Bild unter einem Post (lib/ftBild.ts): Datei in public/spielerbilder, Gesicht [x, y, Breite] als Anteile (_gesichter.json). */
export interface FtBildSpieler extends FtKandidat { datei: string; gesicht: [number, number, number] | null }

export const ftFlagge = (c?: string | null): string => flaggeZeichen(c);

/** Gemeldet wird je Spieler, Quelle und Land nur einmal je Prozess. */
const gemeldet = new Set<string>();

/**
 * Das Land eines Spielers nach der festen Reihenfolge (Profil, Szene-Liste, Spiel, Noble) - mit der Quelle, oder null.
 * Eine automatische Angabe, die der Region widerspricht, wird uebersprungen und einmal gemeldet (console.warn).
 */
export function ftLand(k: FtKonten, id: string): { land: string; quelle: string } | null {
  const i = id.toLowerCase();
  return landWaehlen({ profil: k.land[i], spiel: k.spiel?.[i], noble: k.noble?.[i] }, k.region ?? '', (quelle: string, land: string) => {
    const s = `${i}|${quelle}|${land}|${k.region}`;
    if (gemeldet.has(s)) return;
    gemeldet.add(s);
    if (gemeldet.size > 5000) gemeldet.clear();
    console.warn(`[flagge] ${k.namen[i] ?? i}: ${land} aus "${quelle}" passt nicht zu ${regionVon(k.region) || k.region} - uebersprungen`);
  });
}

/** Die Flagge vor dem Namen: das Land nach ftLand, sonst das Zeichen der Region - so hat jeder Name im Post eines. */
export function ftFlaggeFuer(k: FtKonten, id: string): string {
  return flaggeOderRegion(ftLand(k, id)?.land ?? '', k.region ?? '');
}

const ohneAt = (s: string) => s.trim().replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, '').replace(/^@/, '').replace(/[/?].*$/, '');
const ohneTwitch = (s: string) => s.trim().replace(/^https?:\/\/(www\.)?twitch\.tv\//i, '').replace(/[/?].*$/, '');

interface ProfilRoh { id?: string; epicId?: string; x?: string; land?: string; twitch?: string; anzeige?: string; name?: string }
interface StreamerRoh { twitch?: string; twitter?: string }

/**
 * Die Zuordnung Id -> @-Konto, Land, Twitch und Name aus den gepflegten Dateien.
 *   profile:  spieler-profile.json (Objekt oder Liste)
 *   streamer: streamers.json ({ streamers: { EU: [...], NA: [...] } }) - null: jeder Twitch-Kanal im Profil zaehlt als Streamer
 *   namen:    spieler-namen.json (id -> { haupt })
 */
export function ftKonten(
  profile: Record<string, ProfilRoh> | ProfilRoh[] | null | undefined,
  streamer: { streamers?: Record<string, StreamerRoh[] | undefined> } | null | undefined,
  namen?: Record<string, { haupt?: string } | undefined> | null,
): FtKonten {
  const k: FtKonten = { x: {}, land: {}, twitch: {}, namen: {} };
  const kanaele = new Set<string>();
  const xZuTwitch = new Map<string, string>();
  for (const l of Object.values(streamer?.streamers ?? {})) {
    for (const s of l ?? []) {
      const tw = ohneTwitch(String(s.twitch ?? '')).toLowerCase();
      if (!tw) continue;
      kanaele.add(tw);
      const x = ohneAt(String(s.twitter ?? '')).toLowerCase();
      if (x) xZuTwitch.set(x, tw);
    }
  }
  const mitListe = !!streamer?.streamers;
  const eintraege = Array.isArray(profile) ? profile.map((p) => [p.id ?? p.epicId ?? '', p] as const) : Object.entries(profile ?? {});
  for (const [schluessel, p] of eintraege) {
    const id = String(p?.id || p?.epicId || schluessel || '').toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(id)) continue;
    const x = p.x ? ohneAt(p.x) : '';
    if (x) k.x[id] = x;
    if (p.land) k.land[id] = p.land;
    const eigen = p.twitch ? ohneTwitch(p.twitch) : '';
    // Ohne Streamer-Liste geht das @-Handle vor; twitch.tv nur, wenn es kein X-Konto gibt.
    const tw = eigen && (mitListe ? kanaele.has(eigen.toLowerCase()) : !x) ? eigen : (x ? xZuTwitch.get(x.toLowerCase()) ?? '' : '');
    if (tw) k.twitch[id] = tw;
    if (p.anzeige) { k.namen[id] = p.anzeige; (k.gepflegt ??= {})[id] = true; }
  }
  /*
   * Der saubere Anzeigename aus dem Profil geht vor dem Hauptnamen des Namensverzeichnisses (Betreiber, 25.11.2026: in den Post-Bildern standen
   * "GW S1neD", "AUR t3eny" statt der Spielernamen). Der Hauptname ist Epics roher Ingame-Name mit Team-Tag - er gilt nur noch, wo kein Anzeigename da ist.
   */
  for (const [id, n] of Object.entries(namen ?? {})) if (n?.haupt && !k.namen[id.toLowerCase()]) k.namen[id.toLowerCase()] = n.haupt;
  return k;
}

const ftZahl = (n: number) => Math.round(n).toLocaleString('en-US');
const ftKm = (m: number) => `${(m / 1000).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
/** Sekunden als "1h 05m" bzw. "12m 34s". */
export const ftDauer = (sek: number): string => {
  const s = Math.max(0, Math.round(sek));
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s % 60).padStart(2, '0')}s`;
};

// X Premium (Betreiber, 15.11.2026): laengere Posts erlaubt - die Liste soll alle Qualifizierten tragen, nicht nach 280 Zeichen abbrechen.
const GRENZE = 4000;
/** Wie viele Spieler je Post hoechstens im Text stehen und wie viele als Kandidaten fuers Bild mitgehen. */
const LISTE = 15;
const KANDIDATEN = 20;

/**
 * Ein Post aus Kopf und Zeilen: von hinten gekuerzt, bis er unter die Grenze passt - aber nie unter `mindestens` Zeilen
 * (dann zeigt die Seite die Laenge rot an, statt still einen Post ohne Inhalt zu machen).
 */
function passend(kopf: string[], zeilen: string[], mindestens = 3): string {
  const z = [...zeilen];
  const text = () => [...kopf, ...z].join('\n');
  while (z.length > mindestens && tweetLaenge(text()) > GRENZE) z.pop();
  return text();
}

/** Die bekannten Team-Tags (einmal gebaut). */
let tagSatz: Set<string> | null = null;
const tags = () => (tagSatz ??= teamTags());

/** Wie ein Spieler bzw. ein Team im Text steht: Flagge und @X-Konto, sonst der Name - nie twitch.tv. */
function schreibweise(k: FtKonten, ersatzNamen?: Record<string, string>) {
  const klein = (id: string) => id.toLowerCase();
  /*
   * Ohne gepflegten Namen der rohe Ingame-Name - aber ohne bekannten Team-Tag und ohne Turnierklammer, wenn das SICHER geht (lib/namenSaeubern, Status
   * "angewendet": "AUR t3eny" -> "t3eny", "Solary Mikori" -> "Mikori"). Unsichere Faelle bleiben, wie sie sind (Betreiber: "nur wenn 100 % sicher").
   */
  const name = (id: string) => {
    const roh = k.namen[klein(id)] ?? ersatzNamen?.[id] ?? id.slice(0, 8);
    if (k.gepflegt?.[klein(id)]) return roh;
    const s = saeubere(roh, tags());
    return s.status === 'angewendet' ? s.nachher : roh;
  };
  const konto = (id: string) => {
    const i = klein(id);
    // Immer das X-Konto, nie twitch.tv (Betreiber, 14.11.2026: "immer Twitter"). twitch.tv gibt es nur im Live-Post der Streamer.
    if (k.x[i]) return `@${k.x[i]}`;
    return name(id);
  };
  const wer = (id: string) => [ftFlaggeFuer(k, id), konto(id)].filter(Boolean).join(' ');
  const team = (ids: string[]) => ids.map(wer).join(' + ');
  // Fuers Bild nur echte Laender (zwei Buchstaben; England & Co. als gb) - das Regionszeichen gibt es dort nicht.
  const kandidat = (id: string): FtKandidat => {
    const l = ftLand(k, id)?.land ?? '';
    return { id: klein(id), name: name(id), land: l ? (/^(en|sco|wal|nir)$/.test(l) ? 'gb' : l.toLowerCase()) : null };
  };
  return { klein, name, wer, team, kandidat };
}

/**
 * Der Ergebnis-Post aus Epics Bestenliste (Betreiber, 14.11.2026): die Plaetze 1-10 nach Punkten, mit Punkten, Elims und Siegen, wie Epic sie zaehlt -
 * dazu die meisten Siege, wenn die nicht beim Ersten liegen. Steht sofort nach dem letzten Game bereit, ohne Replays. Alle anderen Stat-Posts kommen nur
 * aus der eigenen Replay-Auswertung (ftPosts), nie aus Epic.
 *   teams: die Teams der Bestenliste mit rang und punkte (die ersten Plaetze genuegen; fuer "Most Wins" so viele wie da sind).
 */
export function ftStandings(e: { titel: string; teams: FtTeam[]; konten: FtKonten; namen?: Record<string, string> }): FtPost | null {
  const { team, kandidat } = schreibweise(e.konten, e.namen);
  const teams = e.teams.filter((t) => t.ids?.length && typeof t.rang === 'number').sort((a, b) => (a.rang as number) - (b.rang as number));
  const medaille = ['🥇', '🥈', '🥉'];
  const mehr = (n: number, eins: string, viele: string) => `${n} ${n === 1 ? eins : viele}`;
  const plaetze = teams.filter((t) => Number.isFinite(t.rang)).slice(0, LISTE);
  if (plaetze.length < 3) return null;
  // Voll: Punkte, Elims und Siege; knapp: nur die Punkte - damit mehr der zehn Plaetze in die 280 Zeichen passen.
  const zeilen = (voll: boolean) => plaetze.map((t, i) => {
    const zusatz = [mehr(t.elims, 'elim', 'elims'), t.siege > 0 ? mehr(t.siege, 'win', 'wins') : ''].filter(Boolean).join(', ');
    return `${medaille[i] ?? `${t.rang}.`} ${team(t.ids)} – ${ftZahl(t.punkte ?? 0)} pts${voll ? ` (${zusatz})` : ''}`;
  });
  const kopf = ['🏆 Results', e.titel.trim(), ''];
  // Die meisten Siege, wenn sie nicht ohnehin beim Ersten stehen (auch jenseits der Plaetze, die im Post stehen).
  const meisteSiege = Math.max(0, ...teams.map((t) => t.siege));
  const w = meisteSiege > 0 ? teams.find((t) => t.siege === meisteSiege) : undefined;
  const siegZeile = w && w !== teams[0] ? `🏅 Most Wins: ${team(w.ids)} – ${mehr(w.siege, 'win', 'wins')}` : null;
  // Alle Fassungen bauen, die mit den meisten Plaetzen nehmen; bei Gleichstand die mit Most Wins, dann die volle.
  const fassungen: Array<{ text: string; plaetze: number; siege: boolean; voll: boolean }> = [];
  for (const voll of [true, false]) {
    const z = zeilen(voll);
    const ohne = passend(kopf, z);
    fassungen.push({ text: ohne, plaetze: ohne.split('\n').length - kopf.length, siege: false, voll });
    if (siegZeile) {
      // Mit Most Wins: so viele Plaetze, wie daneben noch passen (mindestens fuenf).
      const zz = [...z];
      const text = () => [...kopf, ...zz, '', siegZeile].join('\n');
      while (zz.length > 5 && tweetLaenge(text()) > GRENZE) zz.pop();
      if (tweetLaenge(text()) <= GRENZE) fassungen.push({ text: text(), plaetze: zz.length, siege: true, voll });
    }
  }
  const gut = fassungen.filter((f) => tweetLaenge(f.text) <= GRENZE);
  const wahl = (gut.length ? gut : fassungen).sort((x, y) => y.plaetze - x.plaetze || Number(y.siege) - Number(x.siege) || Number(y.voll) - Number(x.voll))[0];
  const { text } = wahl;
  const ids = [...plaetze, ...(w ? [w] : []), ...teams.slice(LISTE, KANDIDATEN)].flatMap((t) => t.ids);
  const kandidaten = [...new Set(ids.map((i) => i.toLowerCase()))].slice(0, KANDIDATEN).map(kandidat);
  return { art: 'standings', titel: 'Results', text, kandidaten, quelle: 'epic' };
}

/** Alle Posts des Spieltags. Posts ohne Daten fehlen in der Liste. */
export function ftPosts(e: FtEingabe): FtErgebnis {
  const d = e.clutch ?? {};
  // Ohne angegebene Region gilt die des Spieltags (Fenster-Id) - fuer die Pruefung der Flaggen und das Zeichen ohne Land.
  const { klein, wer, team, kandidat } = schreibweise(e.konten.region ? e.konten : { ...e.konten, region: e.fenster }, d.namen);

  const spalte = (n: string) => 1 + e.spalten.indexOf(n);
  const ki = spalte('killsEcht');
  const di = spalte('dmg');
  const spiele = d.spiele ?? {};
  const meiste = Math.max(0, ...Object.values(spiele));
  const minSpiele = e.minSpiele && e.minSpiele > 0 ? e.minSpiele : Math.max(1, Math.round(meiste / 2));
  const zahl = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

  // Ueberlebenszeit wie app/api/cup-spieler: Epics Zeit vor der eigenen, die Teamzeit als Obergrenze; bei Reload nur Epics Zeit, wenn es sie gibt.
  const nurEpicZeit = /reload/i.test(e.fenster ?? '') && Object.keys(d.epicZeit ?? {}).length > 0;
  // Reload (16.11.2026, LCQ EU: "Longest Time Alive 2h 27m" in einem 2,5-Stunden-Fenster): Epics Zeit zaehlt jedes Game bis zum endgueltigen Aus samt
  // aller Reloads, auch Spieler um Platz 9.000 kamen auf ueber 2 Stunden. Als Bestwert sagt das nichts - bei Reload keine Time-Alive-Posts.
  const ohneZeit = /reload/i.test(e.fenster ?? '');
  const lebenVon = (id: string) => {
    const s = zahl(d.epicZeit?.[id]) ?? (nurEpicZeit ? null : zahl(d.leben?.[id]));
    return s === null ? null : Math.min(s, zahl(d.epicTeamZeit?.[id]) ?? Infinity);
  };
  // Strecke wie app/api/cup-spieler: Epics Meter, sonst die Proben (ohne Epic-Werte hochgerechnet - die Proben alle 10 s ergeben rund 68,5 %).
  // Fassung 19: die Strecke am Boden aus dem Leser (wie Epic gerechnet) ist exakt, nur die alten Proben sind hochgerechnet.
  const mitBoden = Object.values(d.schaden ?? {}).some((w) => typeof (w as { streckeBoden?: number }).streckeBoden === 'number');
  const streckeGeschaetzt = !Object.keys(d.epicStrecke ?? {}).length && !mitBoden;
  const streckeVon = (id: string) => {
    const epic = zahl(d.epicStrecke?.[id]);
    if (epic !== null) return epic;
    const boden = zahl((d.schaden?.[id] as { streckeBoden?: number } | undefined)?.streckeBoden);
    if (boden !== null) return Math.round(boden);
    const p = d.strecke?.[id];
    if (!p) return null;
    const m = (zahl(p[0]) ?? 0) + (zahl(p[1]) ?? 0);
    return m > 0 ? (streckeGeschaetzt ? m / 0.685 : m) : null;
  };

  const spieler = Object.keys(d.schaden ?? {}).map((id) => {
    const w = d.schaden?.[id] ?? {};
    const sp = spiele[id] ?? 0;
    const zeilen = e.je[id] ?? [];
    // Inventarwerte nur, wenn jedes gelesene Spiel sie mitbringt - halbe Summen stehen nirgends.
    const inv = (w.invSpiele ?? 0) >= sp && sp > 0;
    let bestes: { elims: number; dmg: number } | null = null;
    if (ki > 0) for (const z of zeilen) {
      const el = Number(z[ki]) || 0; const dm = di > 0 ? Number(z[di]) || 0 : 0;
      if (!bestes || el > bestes.elims || (el === bestes.elims && dm > bestes.dmg)) bestes = { elims: el, dmg: dm };
    }
    return {
      id,
      // Im Solo Epics DamageDealt, wo es ihn gibt (Betreiber, 15.11.2026) - dieselbe Regel wie app/api/cup-spieler.
      dmg: zahl(d.epicDmg?.[id]) ?? w.dmg ?? 0,
      erlitten: w.erlitten ?? 0,
      treffer: zahl(w.treffer),
      krit: zahl(w.krit),
      heilHp: zahl((w as { heilHp?: unknown }).heilHp),
      schildHeil: zahl((w as { schildHeilEcht?: unknown }).schildHeilEcht),
      sturm: zahl(w.sturm) !== null && (w.sturm as number) < 1e6 ? (w.sturm as number) : null,
      bauten: inv && typeof w.selbstHolz === 'number' ? (w.selbstHolz ?? 0) + (w.selbstStein ?? 0) + (w.selbstMetall ?? 0) : null,
      mats: !e.zeroBuild && inv && typeof w.farmHolz === 'number' ? (w.farmHolz ?? 0) + (w.farmStein ?? 0) + (w.farmMetall ?? 0) : null,
      leben: lebenVon(id),
      strecke: streckeVon(id),
      spiele: sp,
      /*
       * Die Summe killsEcht aus clutch/<Fenster>.json, wenn jedes gelesene Spiel den Kill-Zaehler hat (inv) - dieselbe Zahl wie die Player Stats (app/api/cup-spieler).
       * Die Zeilen je Match nur als Rueckfall: bis zum 15.11.2026 gingen dort Zeilen verloren (scripts/clutch-je-abgleich.mjs), die Summe waere zu klein.
       */
      elims: inv && typeof w.killsEcht === 'number' ? w.killsEcht : ki > 0 ? zeilen.reduce((a, z) => a + (Number(z[ki]) || 0), 0) : 0,
      bestes,
    };
  });
  type S = (typeof spieler)[number];
  const ratio = (s: S) => (s.erlitten ? s.dmg / s.erlitten : 0);
  const top = (f: (s: S) => number, n = LISTE, filt: (s: S) => boolean = () => true) => spieler.filter(filt).sort((a, b) => f(b) - f(a)).slice(0, n);
  const nachElims = (s: S) => s.elims * 1e6 + s.dmg;
  const hatElims = spieler.some((s) => s.elims > 0);
  const titel = e.titel.trim();

  // ELIMINATIONS wie die Statistikseite (app/api/cup-spieler, FtEingabe.elimsRang): Elim-Zahl und Reihenfolge von dort, der Schaden weiter aus dem Clutch.
  // Der Clutch-Stand ist nur so weit, wie der volle Leser gekommen ist, und untercountet sonst (Betreiber, 23.11.2026).
  const elimsN = (e.elimsRang ?? []).filter((r) => r?.id && Number.isFinite(r.elims) && r.elims > 0).map((r) => ({ id: r.id.toLowerCase(), elims: r.elims }));
  const rangDa = elimsN.length > 0;
  const clutchElim = new Map(spieler.map((s) => [klein(s.id), s.elims]));
  const dmgVon = new Map(spieler.map((s) => [klein(s.id), s.dmg]));

  const posts: FtPost[] = [];
  /**
   * Eine Rangliste: Kopf (Emoji, Ueberschrift, Spieltag), dann "1. Flagge @konto – Wert". Nur Spieler mit Wert ueber 0 - haben weniger als drei einen, entfaellt der Post.
   */
  const liste = (art: FtArt, emoji: string, ueberschrift: string, wert: (s: S) => number | null, zeige: (s: S) => string,
    filt: (s: S) => boolean = () => true, ordnung?: (s: S) => number) => {
    const mit = (s: S) => filt(s) && (wert(s) ?? 0) > 0;
    const rang = top(ordnung ?? ((s) => wert(s) ?? 0), KANDIDATEN, mit);
    // Unter drei Spielern mit Wert ist es keine Rangliste - dann fehlen die Daten (z. B. nur Epics Zeit fuer einen Teil der Spieler).
    if (rang.length < 3) return;
    const zeilen = rang.slice(0, LISTE).map((s, i) => `${i + 1}. ${wer(s.id)} – ${zeige(s)}`);
    posts.push({ art, titel: ueberschrift, text: passend([`${emoji} ${ueberschrift}`, titel, ''], zeilen), kandidaten: rang.map((s) => kandidat(s.id)) });
  };

  /**
   * "Most Eliminations" direkt aus der massgeblichen Liste (cup-spieler) - gleiche Spieler, Zahlen und Reihenfolge wie die Statistikseite. Der Schaden in
   * Klammern nur, wenn der Spieler ganz gelesen ist (dann deckt sich die Clutch-Elimzahl mit der massgeblichen) - sonst stuende eine volle Elim-Zahl neben
   * einem Teil-Schaden. Unter drei Spielern entfaellt der Post wie bei jeder Rangliste.
   */
  const elimsListe = (rang: Array<{ id: string; elims: number }>) => {
    if (rang.length < 3) return;
    const zeilen = rang.slice(0, LISTE).map((r, i) => {
      const dmg = dmgVon.get(r.id);
      const schaden = clutchElim.get(r.id) === r.elims && dmg && dmg > 0 ? ` (${ftZahl(dmg)} damage)` : '';
      return `${i + 1}. ${wer(r.id)} – ${r.elims} elims${schaden}`;
    });
    posts.push({ art: 'elims', titel: 'Most Eliminations', text: passend(['⚔️ Most Eliminations', titel, ''], zeilen), kandidaten: rang.slice(0, KANDIDATEN).map((r) => kandidat(r.id)) });
  };

  // ---- Best Stats: je Kategorie der Beste, wichtigste zuerst (gekuerzt wird von hinten).
  const teams = [...(e.teams ?? [])].filter((t) => t.ids?.length).sort((a, b) => (a.rang ?? Infinity) - (b.rang ?? Infinity));
  const beste: string[] = [];
  const besteIds: string[] = [];
  const merke = (...ids: string[]) => { for (const i of ids) if (!besteIds.includes(klein(i))) besteIds.push(klein(i)); };
  if (teams[0]) { beste.push(`👑 Winner: ${team(teams[0].ids)}`); merke(...teams[0].ids); }
  // Most Elims aus der massgeblichen Liste (cup-spieler), sonst aus dem Clutch-Stand.
  if (rangDa) { const e1 = elimsN[0]; beste.push(`⚔️ Most Elims: ${wer(e1.id)} – ${e1.elims} elims`); merke(e1.id); }
  else { const [e1] = hatElims ? top(nachElims, 1) : []; if (e1 && e1.elims > 0) { beste.push(`⚔️ Most Elims: ${wer(e1.id)} – ${e1.elims} elims`); merke(e1.id); } }
  const [d1] = top((s) => s.dmg, 1); if (d1 && d1.dmg > 0) { beste.push(`💥 Most Damage: ${wer(d1.id)} – ${ftZahl(d1.dmg)} damage`); merke(d1.id); }
  const [g1] = top((s) => (s.bestes ? s.bestes.elims * 1e6 + s.bestes.dmg : 0), 1, (s) => (s.bestes?.elims ?? 0) > 0);
  if (g1?.bestes) { beste.push(`🔥 Best Game: ${wer(g1.id)} – ${g1.bestes.elims} elims`); merke(g1.id); }
  const [r1] = top(ratio, 1, (s) => s.spiele >= minSpiele && s.erlitten > 0); if (r1) { beste.push(`📈 Best Damage Ratio: ${wer(r1.id)} – ${ratio(r1).toFixed(2)} ratio`); merke(r1.id); }
  if (teams.length) {
    const meisteSiege = Math.max(...teams.map((t) => t.siege));
    const w = teams.find((t) => t.siege === meisteSiege && meisteSiege > 0);
    if (w && w !== teams[0]) { beste.push(`🏅 Most Wins: ${team(w.ids)} – ${w.siege} ${w.siege === 1 ? 'win' : 'wins'}`); merke(...w.ids); }
    else if (w) beste[0] += ` (${w.siege} ${w.siege === 1 ? 'win' : 'wins'})`;
  }
  const [h1] = top((s) => s.treffer ?? 0, 1, (s) => (s.treffer ?? 0) > 0); if (h1) { beste.push(`🎯 Most Hits: ${wer(h1.id)} – ${ftZahl(h1.treffer ?? 0)} hits`); merke(h1.id); }
  const [b1] = top((s) => s.bauten ?? 0, 1, (s) => (s.bauten ?? 0) > 0); if (b1) { beste.push(`🧱 Most Builds: ${wer(b1.id)} – ${ftZahl(b1.bauten ?? 0)} builds`); merke(b1.id); }
  const [m1] = top((s) => s.mats ?? 0, 1, (s) => (s.mats ?? 0) > 0); if (m1) { beste.push(`🪓 Most Mats: ${wer(m1.id)} – ${ftZahl(m1.mats ?? 0)} mats`); merke(m1.id); }
  // Mehr Kategorien (Betreiber, 15.11.2026: "fehlen richtig viele Statistics").
  const [k1] = top((s) => s.krit ?? 0, 1, (s) => (s.krit ?? 0) > 0); if (k1) { beste.push(`💀 Most Headshots: ${wer(k1.id)} – ${ftZahl(k1.krit ?? 0)} headshots`); merke(k1.id); }
  const [t1] = top((s) => s.erlitten, 1, (s) => s.erlitten > 0); if (t1) { beste.push(`🩸 Most Damage Taken: ${wer(t1.id)} – ${ftZahl(t1.erlitten)} damage`); merke(t1.id); }
  const [hp1] = top((s) => s.heilHp ?? 0, 1, (s) => (s.heilHp ?? 0) > 0); if (hp1) { beste.push(`💊 Most Health Healed: ${wer(hp1.id)} – ${ftZahl(hp1.heilHp ?? 0)} HP`); merke(hp1.id); }
  const [sh1] = top((s) => s.schildHeil ?? 0, 1, (s) => (s.schildHeil ?? 0) > 0); if (sh1) { beste.push(`🛡️ Most Shield Healed: ${wer(sh1.id)} – ${ftZahl(sh1.schildHeil ?? 0)} shield`); merke(sh1.id); }
  const [l1] = ohneZeit ? [] : top((s) => s.leben ?? 0, 1, (s) => (s.leben ?? 0) > 0); if (l1) { beste.push(`⏱️ Longest Time Alive: ${wer(l1.id)} – ${ftDauer(l1.leben ?? 0)}`); merke(l1.id); }
  const [st1] = top((s) => s.sturm ?? 0, 1, (s) => (s.sturm ?? 0) > 0); if (st1) { beste.push(`🌪️ Most Time in Storm: ${wer(st1.id)} – ${ftDauer(st1.sturm ?? 0)}`); merke(st1.id); }
  if (beste.length) {
    // Fuers Bild: erst die Besten der Zeilen, dann nach Schaden aufgefuellt.
    for (const s of top((x) => x.dmg, KANDIDATEN)) merke(s.id);
    posts.push({ art: 'best-stats', titel: 'Best Stats', text: passend(['⭐ Best Stats', titel, ''], beste), kandidaten: besteIds.slice(0, KANDIDATEN).map(kandidat) });
  }

  // ---- Die Ranglisten.
  // "Most Eliminations" aus derselben Quelle wie die Statistikseite (cup-spieler); ohne sie wie bisher aus dem Clutch-Stand.
  if (rangDa) elimsListe(elimsN);
  else if (hatElims) liste('elims', '⚔️', 'Most Eliminations', (s) => s.elims, (s) => `${s.elims} elims (${ftZahl(s.dmg)} damage)`, undefined, nachElims);
  liste('damage', '💥', 'Most Damage Dealt', (s) => s.dmg, (s) => (s.erlitten > 0 ? `${ftZahl(s.dmg)} damage (${ratio(s).toFixed(2)} ratio)` : `${ftZahl(s.dmg)} damage`));
  liste('best-game', '🔥', 'Best Single Game', (s) => s.bestes?.elims ?? null,
    (s) => `${s.bestes?.elims} ${s.bestes?.elims === 1 ? 'elim' : 'elims'}${s.bestes?.dmg ? ` (${ftZahl(s.bestes.dmg)} damage)` : ''}`,
    undefined, (s) => (s.bestes ? s.bestes.elims * 1e6 + s.bestes.dmg : 0));
  liste('hits', '🎯', 'Most Hits', (s) => s.treffer, (s) => `${ftZahl(s.treffer ?? 0)} hits${s.krit !== null ? ` (${ftZahl(s.krit)} headshots)` : ''}`);
  liste('builds', '🧱', 'Most Builds Placed', (s) => s.bauten, (s) => `${ftZahl(s.bauten ?? 0)} builds`);
  liste('mats', '🪓', 'Most Mats Farmed', (s) => s.mats, (s) => `${ftZahl(s.mats ?? 0)} mats`);
  if (!ohneZeit) liste('survival', '⏱️', 'Most Time Alive', (s) => s.leben, (s) => ftDauer(s.leben ?? 0), (s) => s.spiele >= minSpiele);
  liste('distance', '🏃', streckeGeschaetzt ? 'Distance Traveled (est.)' : 'Distance Traveled', (s) => s.strecke, (s) => ftKm(s.strecke ?? 0), (s) => s.spiele >= minSpiele);
  liste('storm', '🌪️', 'Most Time in Storm', (s) => s.sturm, (s) => ftDauer(s.sturm ?? 0));

  return {
    posts,
    stand: { gelesen: d.matches?.length ?? 0, gesamt: typeof d.gesamt === 'number' ? d.gesamt : null, teilweise: !!d.teilweise },
    minSpiele,
    spieler: spieler.length,
  };
}

/**
 * Laenge eines Tweets, wie X sie zaehlt (twitter-text, Gewichtung v3): Adressen 23 Zeichen, Emoji (auch Flaggen und Ziffern-Tasten) 2,
 * lateinische Schrift und gaengige Satzzeichen 1, alles andere 2.
 */
export function tweetLaenge(text: string): number {
  let n = 0;
  const ohneAdressen = text.replace(/(?:https?:\/\/)?(?:[a-z0-9-]+\.)+(?:tv|com|gg|net|org|io|de|co|me|ly)(?:\/[^\s)]*)?/gi, () => { n += 23; return ''; });
  const leicht = (c: number) => (c <= 0x10ff) || (c >= 0x2000 && c <= 0x200d) || (c >= 0x2010 && c <= 0x201f) || (c >= 0x2032 && c <= 0x2037);
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment: (s: string) => Iterable<{ segment: string }> } }).Segmenter;
  const teile = Seg ? [...new Seg(undefined, { granularity: 'grapheme' }).segment(ohneAdressen)].map((s) => s.segment) : [...ohneAdressen];
  for (const g of teile) {
    if (/\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u.test(g)) { n += 2; continue; }
    for (const ch of g) n += leicht(ch.codePointAt(0) ?? 0) ? 1 : 2;
  }
  return n;
}

/*
 * Der Ergebnis-Post sofort nach dem Ende (Betreiber, 15.11.2026: "ich verliere das Rennen gegen die anderen Stats-Accounts, weil ich den Post von Hand baue").
 * Genau im Format seiner eigenen Posts (X Premium, ohne 280-Grenze):
 *   Qualifier/Heat:  "🏆 <Cup> <Region> – Qualified for the <naechste Stufe> ✅", die Sieger (sofort weiter), dann die ueber Punkte, die Grenze und unsere Vorab-Prognose.
 *   sonst:           "🏆 <Cup> <Region> – Results", die ersten zehn.
 * Flagge wie in allen Posts (ftFlaggeFuer: Profil, Szene-Liste, Spiel, Noble, sonst das Zeichen der Region), @X-Konto aus dem Profil, sonst der Name
 * (konten.namen) - nie twitch.tv.
 * Fuss immer "Full results 👉 thecomphub.com".
 */
export interface FtErgebnisEingabe {
  /** "FNCS Solos Reload Heat 2" - ohne Region. */
  cup: string;
  region: string;
  /** Teams aus Epics Bestenliste mit rang und punkte. */
  teams: FtTeam[];
  konten: FtKonten;
  /** So viele kommen weiter (Epics Rangschwelle) - ohne: der Results-Post. */
  schwelle?: number | null;
  /** Ab so vielen Punkten sofort weiter (FNCS-Heats: Sieg = 1.000 Punkte). */
  sofortPunkte?: number | null;
  /** "Grand Finals", "Heats" ... */
  naechste?: string | null;
  /** Unsere Prognose der Grenze vor dem Cup. */
  prognose?: number | null;
}

export const FT_FUSS = 'Full results 👉 thecomphub.com';

export function ftErgebnisPost(e: FtErgebnisEingabe): FtPost | null {
  const { team, kandidat } = schreibweise(e.konten.region ? e.konten : { ...e.konten, region: e.region });
  const teams = e.teams.filter((t) => t.ids?.length && Number.isFinite(t.rang)).sort((a, b) => (a.rang as number) - (b.rang as number));
  if (teams.length < 3) return null;
  const pts = (t: FtTeam) => `${Math.round(t.punkte ?? 0)} pts`;
  const region = e.region ? ` ${e.region}` : '';
  const schwelle = e.schwelle && e.schwelle > 0 ? e.schwelle : 0;
  const grenzTeam = schwelle ? teams.find((t) => t.rang === schwelle) ?? null : null;
  const grenze = grenzTeam ? grenzTeam.punkte ?? 0 : null;
  const linie = grenze !== null
    ? `📏 Line: ${Math.round(grenze)} pts${typeof e.prognose === 'number' && e.prognose > 0 ? ` (we predicted ${Math.round(e.prognose)} 🔮)` : ''}`
    : null;
  // Qualifier/Heat mit ueberschaubarem Feld der Qualifizierten: Sieger + ueber Punkte.
  if (schwelle && schwelle <= 100 && e.naechste) {
    const drin = teams.filter((t) => (t.rang as number) <= schwelle);
    const sofort = e.sofortPunkte && e.sofortPunkte > 0 ? e.sofortPunkte : 0;
    const siege = sofort ? drin.filter((t) => (t.punkte ?? 0) >= sofort) : [];
    const punkte = drin.filter((t) => !siege.includes(t));
    const zeilen = [`🏆 ${e.cup}${region} – Qualified for the ${e.naechste} ✅`, ''];
    if (siege.length) zeilen.push(`👑 Qualified by win (${siege.length}):`, ...siege.map((t) => `${team(t.ids)} – ${pts(t)}`), '');
    if (punkte.length) zeilen.push(`${siege.length ? '📊 Qualified on points' : '📊 Qualified'} (${punkte.length}):`, ...punkte.map((t) => `${team(t.ids)} – ${pts(t)}`), '');
    if (linie) zeilen.push(linie, '');
    zeilen.push(FT_FUSS);
    const kandidaten = [...new Set(drin.flatMap((t) => t.ids).map((i) => i.toLowerCase()))].slice(0, KANDIDATEN).map(kandidat);
    return { art: 'standings', titel: 'Qualified', text: zeilen.join('\n'), kandidaten, quelle: 'epic' };
  }
  const medaille = ['🥇', '🥈', '🥉'];
  const zehn = teams.slice(0, LISTE);
  const zeilen = [`🏆 ${e.cup}${region} – Results`, '', ...zehn.map((t, i) => `${medaille[i] ?? `${t.rang}.`} ${team(t.ids)} – ${pts(t)}`), ''];
  if (linie && schwelle) zeilen.push(linie.replace('Line:', `Top ${ftZahl(schwelle)} line:`), '');
  zeilen.push(FT_FUSS);
  const kandidaten = [...new Set(teams.slice(0, KANDIDATEN).flatMap((t) => t.ids).map((i) => i.toLowerCase()))].slice(0, KANDIDATEN).map(kandidat);
  return { art: 'standings', titel: 'Results', text: zeilen.join('\n'), kandidaten, quelle: 'epic' };
}
