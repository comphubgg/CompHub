import { liesJson, schreibJson } from '@/lib/ablage';
import { GET as vitrine } from '@/app/api/startvitrine/route';
import { GET as statistikZahlen } from '@/app/api/statistik-zahlen/route';
import { kernname, ohneZierrat } from '@/lib/homoglyph';
import { kartenKandidaten } from '@/lib/postKarte';

/*
 * Die taeglichen Posts (Betreiber, 14.10.2026).
 *
 * Er wollte "jeden Tag zwei, drei Posts" fuer X, damit er wieder aktiv wird - nie doppelt, immer mit echten Zahlen, ohne Hashtags, in wechselnder
 * Anordnung, mit Bildern, die von allein entstehen. Jeden Morgen legt dieses Modul den Tagesplan an (Discord-Meldung in den Admin-Bereich mit dem Link
 * auf die Seite des Tages, /posts/<Datum>): drei Posts mit fertigem Text zum Kopieren und einem Bild (/api/post-bild).
 *
 * Wie es zu Inhalt kommt: aus den eigenen Antworten der Seite (Startvitrine, Zahlen der Statistik) - was dort fehlt, wird nicht gepostet; es
 * wird nichts erfunden. Ein Cup-Post nennt nur Spieler, die in dessen Bestenliste stehen (also den Cup gespielt haben). Nichts kommt doppelt:
 * jeder Post hat einen Schluessel (zum Beispiel "cup:Performance Cup - Week 7 - Finals"), der nach der Wahl in posts-verlauf.json steht.
 *
 * Die Texte sind englisch (die Szene schreibt englisch) und tragen keine Hashtags.
 */

export type PostArt = 'cup' | 'spieler' | 'ranking' | 'promo' | 'update' | 'karte';

export interface TagesPost {
  nr: number;
  art: PostArt;
  /** Wofuer der Post steht - damit er nicht zweimal kommt. */
  schluessel: string;
  /** Kurzer Name fuer die Uebersicht (deutsch, fuer den Betreiber). */
  titel: string;
  /** Der fertige Text zum Kopieren. */
  text: string;
  /** Was das Bild braucht - alles Zahlen und Namen, nichts zum Nachladen. */
  bild: Record<string, unknown>;
}

export interface Tagesplan { datum: string; erstellt: number; posts: TagesPost[] }

const SEITE = 'https://www.thecomphub.com';
const planName = (datum: string) => `posts-${datum}.json`;
const VERLAUF = 'posts-verlauf.json';

/* ------------------------------------------------------------------ Neuigkeiten (Update-Posts) */

/*
 * Was an CompHub neu ist - jeder Eintrag wird genau einmal gepostet, frühestens ab dem Datum "ab" (damit nichts angekuendigt wird, was noch nicht
 * online ist). Der Betreiber trägt hier neue Dinge nach, oder Claude beim naechsten Update.
 */
const NEUIGKEITEN: Array<{ id: string; ab: string; titel: string; text: string; kennzahl: string; unter: string }> = [
  { id: 'redesign-2026-10', ab: '2026-10-16', titel: 'Redesign',
    text: `CompHub has a new look: dark and light mode, a settings gear, player photos everywhere and a cleaner stats section. Same data, a lot more to look at.\n\n${SEITE}`,
    kennzahl: 'New look', unter: 'Dark and light mode · player photos · cleaner stats' },
  { id: 'kartenversionen', ab: '2026-10-16', titel: 'Kartenversionen',
    text: `Every Fortnite map update, one by one: 227 map versions from Chapter 1 to Chapter 7 Season 4, each tournament matched to the map it was played on.\n\n${SEITE}/tournament-maps`,
    kennzahl: '227', unter: 'map versions, Chapter 1 to Chapter 7' },
  { id: 'spielerfaecher', ab: '2026-10-16', titel: 'Spielerprofile',
    text: `Open any player and see the whole career: damage ratio over time, FNCS results, teammates, titles and the teams they played for.\n\n${SEITE}/statistics`,
    kennzahl: 'Player profiles', unter: 'Careers, FNCS results, teammates' },
];

/* ------------------------------------------------------------------ Datenlage */

interface VSpieler { id: string; name: string; land: string | null; region: string; bild: string | null; elims: number; schaden: number; quote: number; matches: number }
interface VZeile { rang: number; punkte: number; siege: number; elims: number; spieler: Array<{ name: string; land: string | null }> }
interface VCup { titel: string; cup: string; typ: string; bild: string | null; datum: number | null; region: string; saisonKurz: string; zeilen: VZeile[] }
interface VRang { rang: number; name: string; land: string | null; wertung: number; delta: number }
interface Vitrine { ok?: boolean; saison?: string | null; saisonName?: string | null; spieler?: VSpieler[]; cups?: VCup[]; maps?: number; rangliste?: VRang[] }

async function datenLage(): Promise<{ v: Vitrine; zahlen: { spieler?: number | null; spieltage?: number | null; elims?: number | null; matches?: number | null } }> {
  const lies = async <T,>(f: () => Promise<Response>): Promise<T> => { try { return await (await f()).json() as T; } catch { return {} as T; } };
  const [v, zahlen] = await Promise.all([
    lies<Vitrine>(() => vitrine(new Request(`${SEITE}/api/startvitrine`))),
    lies<{ spieler?: number | null; spieltage?: number | null; elims?: number | null; matches?: number | null }>(() => statistikZahlen()),
  ]);
  return { v, zahlen };
}

const gross = (n: string) => n.toUpperCase();
const zahl = (n: number, nk = 0) => n.toLocaleString('en-US', { minimumFractionDigits: nk, maximumFractionDigits: nk });
/** Ein Name ohne Orgtag, Startnummer und Fremdalphabet-Zwillinge (wie auf den Kacheln der Seite). */
const rein = (n: string) => ohneZierrat(kernname(n)).trim() || n;
const teamName = (z: VZeile) => z.spieler.map((p) => gross(rein(p.name))).join(' & ');
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;

/** Alle Posts, die heute moeglich sind - jeder mit festem Schluessel. */
function kandidaten(datum: string, v: Vitrine, zahlen: { spieler?: number | null; spieltage?: number | null; elims?: number | null; matches?: number | null }, karten: Array<Omit<TagesPost, 'nr' | 'art'>> = []): TagesPost[] {
  const raus: Omit<TagesPost, 'nr'>[] = [];
  // Kartenbilder mit den Laendern (lib/postKarte): die Kartenposts der juengsten Cups.
  for (const k of karten) raus.push({ ...k, art: 'karte' });

  // Cups: nur mit mindestens drei Plaetzen, und nur, was die Bestenliste hergibt.
  for (const c of v.cups ?? []) {
    if (c.zeilen.length < 3) continue;
    const [e, z, d] = c.zeilen;
    const titel = c.titel.replace(/\s*·\s*/g, ' - ');
    const teile = [`${teamName(e)} ${c.zeilen[0].spieler.length > 1 ? 'win' : 'wins'} ${titel}`];
    teile[0] += ` with ${zahl(e.punkte)} points`;
    const nebenher = [e.siege ? `${e.siege} ${e.siege === 1 ? 'win' : 'wins'}` : '', e.elims ? `${zahl(e.elims)} eliminations` : ''].filter(Boolean);
    if (nebenher.length) teile[0] += ` (${nebenher.join(', ')})`;
    raus.push({
      art: 'cup', schluessel: `cup:${c.titel}`, titel: `Cup: ${titel}`,
      text: `${teile[0]}.\n\n${ordinal(2)}: ${teamName(z)} (${zahl(z.punkte)})\n${ordinal(3)}: ${teamName(d)} (${zahl(d.punkte)})\n\nFull leaderboard and landing spots: ${SEITE}/tournament-maps`,
      bild: { art: 'cup', titel, region: c.region, saison: c.saisonKurz, bild: c.bild, zeilen: c.zeilen.slice(0, 3).map((x) => ({ rang: x.rang, name: teamName(x), punkte: x.punkte, siege: x.siege, elims: x.elims })) },
    });
  }

  // Spieler: mit Foto und echten Werten der Saison.
  for (const s of (v.spieler ?? []).filter((x) => x.bild && x.elims > 0 && x.matches > 0).slice(0, 14)) {
    raus.push({
      art: 'spieler', schluessel: `spieler:${s.id}`, titel: `Spieler: ${gross(s.name)}`,
      text: `${gross(s.name)} (${s.region || 'Global'}): ${zahl(s.elims)} eliminations, ${zahl(s.schaden)} damage and a ${s.quote.toFixed(2)} damage ratio over ${zahl(s.matches)} matches.\n\nEvery number from Epic's leaderboards and the match replays.\n\n${SEITE}/statistics?spieler=${encodeURIComponent(s.name)}`,
      bild: { art: 'spieler', name: gross(s.name), region: s.region, land: s.land, bild: s.bild, werte: [['Eliminations', zahl(s.elims)], ['Damage', zahl(s.schaden)], ['Damage ratio', s.quote.toFixed(2)]] },
    });
  }

  // Power Rankings: einmal je Fortschreibung der Rangliste (die Spitze und ihr Stand als Schluessel).
  const pr = v.rangliste ?? [];
  if (pr.length >= 5) {
    const stand = pr.slice(0, 5).map((p) => `${p.rang}${p.name}${p.wertung}`).join('|');
    const bewegt = pr.filter((p) => p.delta !== 0).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
    raus.push({
      art: 'ranking', schluessel: `ranking:${stand}`, titel: 'Power Rankings',
      text: `Power Rankings, top 5:\n\n${pr.slice(0, 5).map((p) => `${p.rang}. ${gross(p.name)} - ${zahl(p.wertung)}`).join('\n')}\n${bewegt ? `\nBiggest move in the top 5: ${gross(bewegt.name)} (${bewegt.delta > 0 ? '+' : ''}${bewegt.delta}).\n` : '\n'}\n${SEITE}/power-rankings`,
      bild: { art: 'ranking', zeilen: pr.slice(0, 5).map((p) => ({ rang: p.rang, name: gross(p.name), land: p.land, wert: zahl(p.wertung), delta: p.delta })) },
    });
  }

  // Werbung fuer die Seite - mit den echten Zahlen von heute.
  if (v.maps) raus.push({
    art: 'promo', schluessel: 'promo:karten', titel: 'Werbung: Karten',
    text: `${zahl(v.maps)}+ landing maps from every cup and every season: see where the teams dropped, tournament by tournament.\n\n${SEITE}/tournament-maps`,
    bild: { art: 'promo', gross: `${zahl(v.maps)}+`, unter: 'landing maps, every cup, every season', fotos: (v.spieler ?? []).filter((x) => x.bild).slice(0, 4).map((x) => x.bild) },
  });
  if (zahlen.spieler) raus.push({
    art: 'promo', schluessel: 'promo:profile', titel: 'Werbung: Profile',
    text: `${zahl(zahlen.spieler)} player profiles. Stats, titles, FNCS results, teammates and landing spots for every competitive player in the archive.\n\n${SEITE}/statistics`,
    bild: { art: 'promo', gross: zahl(zahlen.spieler), unter: 'player profiles, with stats, titles and teammates', fotos: (v.spieler ?? []).filter((x) => x.bild).slice(2, 6).map((x) => x.bild) },
  });
  if (zahlen.spieltage) raus.push({
    art: 'promo', schluessel: 'promo:archiv', titel: 'Werbung: Archiv',
    text: `${zahl(zahlen.spieltage)} match days in one archive${zahlen.elims ? `, ${zahl(zahlen.elims)} eliminations counted` : ''}. All numbers from Epic and the replays, nothing estimated.\n\n${SEITE}`,
    bild: { art: 'promo', gross: zahl(zahlen.spieltage), unter: 'match days in the archive', fotos: (v.spieler ?? []).filter((x) => x.bild).slice(4, 8).map((x) => x.bild) },
  });
  raus.push({
    art: 'promo', schluessel: 'promo:kopf-an-kopf', titel: 'Werbung: Head to head',
    text: `Pick two players and put them side by side: eliminations, damage, headshots, hits and damage ratio.\n\n${SEITE}/statistics`,
    bild: { art: 'promo', gross: 'Head to head', unter: 'two players, every number side by side', fotos: (v.spieler ?? []).filter((x) => x.bild).slice(0, 2).map((x) => x.bild) },
  });
  raus.push({
    art: 'promo', schluessel: 'promo:tierlist', titel: 'Werbung: Tierlist',
    text: `Build your own tier list of the best players and share it. S, A, B and more, with photos.\n\n${SEITE}/tierlist`,
    bild: { art: 'promo', gross: 'Tier list', unter: 'build yours, S to B', fotos: (v.spieler ?? []).filter((x) => x.bild).slice(1, 5).map((x) => x.bild) },
  });

  for (const n of NEUIGKEITEN) {
    if (datum < n.ab) continue;
    raus.push({
      art: 'update', schluessel: `update:${n.id}`, titel: `Update: ${n.titel}`, text: n.text,
      bild: { art: 'promo', gross: n.kennzahl, unter: n.unter, fotos: (v.spieler ?? []).filter((x) => x.bild).slice(0, 4).map((x) => x.bild) },
    });
  }
  return raus.map((p, i) => ({ ...p, nr: i }));
}

/** Ein wiederholbarer Zufall aus dem Datum: derselbe Tag ergibt immer dieselbe Reihenfolge. */
function mischen<T>(liste: T[], samen: string): T[] {
  let h = 2166136261;
  for (const c of samen) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
  const a = [...liste];
  for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/**
 * Den Plan fuer einen Tag lesen oder - wenn es ihn noch nicht gibt - anlegen. Drei Posts, moeglichst von verschiedener Art, nichts, was schon
 * einmal an der Reihe war. Einmal angelegt, bleibt der Plan stehen (die Adresse des Tages zeigt immer dasselbe).
 */
export async function tagesplan(datum: string, anlegen = true): Promise<Tagesplan | null> {
  const da = await liesJson<Tagesplan | null>(planName(datum), null);
  if (da || !anlegen) return da;

  const { v, zahlen } = await datenLage();
  const karten = await kartenKandidaten();
  const verlauf = await liesJson<string[]>(VERLAUF, []);
  const benutzt = new Set(verlauf);
  const frei = mischen(kandidaten(datum, v, zahlen, karten).filter((k) => !benutzt.has(k.schluessel)), datum);
  const gewaehlt: TagesPost[] = [];
  // Erst je Art einen, dann auffuellen.
  const arten = new Set<PostArt>();
  for (const k of frei) { if (gewaehlt.length < 3 && !arten.has(k.art)) { gewaehlt.push(k); arten.add(k.art); } }
  for (const k of frei) { if (gewaehlt.length < 3 && !gewaehlt.includes(k)) gewaehlt.push(k); }
  const plan: Tagesplan = { datum, erstellt: Date.now(), posts: gewaehlt.map((p, i) => ({ ...p, nr: i })) };
  if (!plan.posts.length) return plan;
  await schreibJson(planName(datum), plan);
  await schreibJson(VERLAUF, [...verlauf, ...plan.posts.map((p) => p.schluessel)].slice(-400));
  return plan;
}

/** Einen Post des Tages durch einen anderen ersetzen ("neu"): der alte gilt als gebraucht, der neue ist garantiert noch nicht dran gewesen. */
export async function postErsetzen(datum: string, nr: number): Promise<Tagesplan | null> {
  const plan = await tagesplan(datum, false);
  if (!plan || !plan.posts[nr]) return plan;
  const { v, zahlen } = await datenLage();
  const karten = await kartenKandidaten();
  const verlauf = await liesJson<string[]>(VERLAUF, []);
  const benutzt = new Set([...verlauf, ...plan.posts.map((p) => p.schluessel)]);
  const frei = mischen(kandidaten(datum, v, zahlen, karten).filter((k) => !benutzt.has(k.schluessel)), `${datum}|${nr}|${Date.now()}`);
  // Moeglichst dieselbe Art - wer "Cup" ersetzt, will wieder einen Cup.
  const neu = frei.find((k) => k.art === plan.posts[nr].art) ?? frei[0];
  if (!neu) return plan;
  plan.posts[nr] = { ...neu, nr };
  await schreibJson(planName(datum), plan);
  await schreibJson(VERLAUF, [...verlauf, neu.schluessel].slice(-400));
  return plan;
}

export const heuteDatum = () => new Date().toISOString().slice(0, 10);
export const postSeite = (datum: string) => `${SEITE}/posts/${datum}`;
