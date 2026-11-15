/*
 * Spieler finden, die die Szene-Liste nicht kennt (Betreiber, 15.11.2026: "/stats player:il Juanit0" meldete
 * "No player found" - die Suche der Seite kennt nur die gepflegten Spieler, den Spieler-Kreis und das Archiv).
 *
 * Drei Wege, in dieser Reihenfolge:
 *   1. die Namen, die CompHub schon aufgeloest hat (epic-namen.json, rund 250.000 Konten aus allen Bestenlisten),
 *      verglichen in "vergleichbarer" Schreibweise: klein, ohne Leerzeichen und unsichtbare Zeichen, Fremdalphabet-
 *      Zwillinge auf Latein (lib/homoglyph) - "il Juanit0" findet "iL juanit0";
 *   2. Epics Kontodienst (account/api/public/account/displayName/<name>) - der genaue Epic-Name;
 *   3. und dann, was wir zu diesem Konto haben: Platz, Punkte, Matches je Spieltag aus den gespeicherten Bestenlisten
 *      (epic-spieltage am GitHub-Release, je Fenster die ganze Liste mit Konto-Ids, bis zu 10.000 Teams), eigene Elims
 *      aus dem ausgewerteten Replay, wo es eines gibt (lib/replayWerte).
 *
 * Die Bestenlisten werden direkt vom Release gelesen, nicht ueber den Ablage-Vorrat: jede Datei ist ein bis zwei
 * Megabyte, gesucht wird die Konto-Id im Rohtext, und nur eine Datei mit Treffer wird ueberhaupt ausgepackt.
 * Das Ergebnis je Konto bleibt zehn Minuten im Prozess.
 */

import { liesJson } from '@/lib/ablage';
import { vergleichbar, gefaltet } from '@/lib/homoglyph';
import { ACCOUNT, getToken } from '@/lib/epicCups';
import { tagsFuer } from '@/lib/releaseTags.mjs';
import { replayWert } from '@/lib/replayWerte';

const REPO = process.env.COMPHUB_GITHUB_REPO || 'comphubgg/CompHub';
const basis = (tag: string) => `https://github.com/${REPO}/releases/download/${tag}/`;

/** Unsichtbare Zeichen (Nullbreite, Richtungsmarken, weiches Trennzeichen), die Namen oft tragen. */
const UNSICHTBAR = /[­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁯ㅤ︀-️﻿]/g;

/** Ein Name in vergleichbarer Schreibweise: klein, Zwillinge auf Latein, ohne Leerzeichen und Unsichtbares. */
export function namensKey(name: string): string {
  return vergleichbar(String(name ?? '').replace(UNSICHTBAR, '')).replace(/\s+/g, '');
}
/** Noch etwas grober: Akzente weg, Ziffern als Buchstaben ("juanit0" = "juanito") - nur, wenn genau nichts passt. */
function grobKey(key: string): string {
  return gefaltet(key.normalize('NFD').replace(/[̀-ͯ]/g, ''));
}

/* ---------------------------------------------------------- Die bekannten Namen */

interface NamenIndex { ids: string[]; namen: string[]; keys: string[]; nachKey: Map<string, number[]>; nachGrob: Map<string, number[]> }
let index: { wert: NamenIndex; bis: number } | null = null;
let indexLaeuft: Promise<NamenIndex> | null = null;

function indexBauen(): Promise<NamenIndex> {
  indexLaeuft ??= (async () => {
    const roh = await liesJson<Record<string, string>>('epic-namen.json', {});
    const ids: string[] = []; const namen: string[] = []; const keys: string[] = [];
    const nachKey = new Map<string, number[]>(); const nachGrob = new Map<string, number[]>();
    for (const [id, name] of Object.entries(roh)) {
      if (!name || !/^[0-9a-f]{32}$/i.test(id) || name === id.slice(0, 8)) continue;
      const k = namensKey(name);
      if (!k) continue;
      const i = ids.length;
      ids.push(id.toLowerCase()); namen.push(name); keys.push(k);
      const a = nachKey.get(k); if (a) a.push(i); else nachKey.set(k, [i]);
      const g = grobKey(k);
      const b = nachGrob.get(g); if (b) b.push(i); else nachGrob.set(g, [i]);
    }
    const wert = { ids, namen, keys, nachKey, nachGrob };
    if (ids.length) index = { wert, bis: Date.now() + 30 * 60_000 };
    return wert;
  })().finally(() => { indexLaeuft = null; });
  return indexLaeuft;
}

/** Der Namensvorrat - frisch, oder der letzte Stand (und im Hintergrund erneuert). */
async function namenIndex(warten = 20_000): Promise<NamenIndex | null> {
  if (index && Date.now() < index.bis) return index.wert;
  const neu = indexBauen().catch(() => null);
  if (index) return index.wert;
  return Promise.race([neu, new Promise<null>((r) => setTimeout(() => r(null), warten))]);
}
/** Beim ersten Befehl schon anwerfen, damit die Vorschlaege beim Tippen nicht kalt sind. */
export function namenVorwaermen() { void namenIndex(0); }

export interface KontoTreffer { epicId: string; name: string; quelle: 'namen' | 'epic' }

/** Der Name des Kontos, soweit wir ihn kennen (ohne Netz, nur aus dem Vorrat). */
export async function bekannterName(epicId: string): Promise<string | null> {
  const ix = await namenIndex(3_000);
  if (!ix) return null;
  const i = ix.ids.indexOf(epicId.toLowerCase());
  return i >= 0 ? ix.namen[i] : null;
}

/** Vorschlaege aus dem Namensvorrat: erst genaue, dann Anfang, dann enthaelt - hoechstens so viele. */
export async function namenVorschlaege(q: string, wieviele = 10, warten = 1_500): Promise<KontoTreffer[]> {
  const k = namensKey(q);
  if (k.length < 2) return [];
  const ix = await namenIndex(warten);
  if (!ix) return [];
  const genau = ix.nachKey.get(k) ?? [];
  const anfang: number[] = []; const drin: number[] = [];
  for (let i = 0; i < ix.keys.length && anfang.length < wieviele; i += 1) {
    const x = ix.keys[i];
    if (x === k) continue;
    if (x.startsWith(k)) anfang.push(i);
    else if (drin.length < wieviele && x.includes(k)) drin.push(i);
  }
  return [...genau, ...anfang.sort((a, b) => ix.keys[a].length - ix.keys[b].length), ...drin]
    .slice(0, wieviele).map((i) => ({ epicId: ix.ids[i], name: ix.namen[i], quelle: 'namen' as const }));
}

/** Genau dieser Name im Vorrat (vergleichbare Schreibweise, notfalls grob)? Mehrere Konten: das erste. */
async function ausVorrat(q: string): Promise<KontoTreffer | null> {
  const ix = await namenIndex(15_000);
  if (!ix) return null;
  const k = namensKey(q);
  const genau = ix.nachKey.get(k) ?? [];
  // Bei mehreren Konten mit derselben vergleichbaren Schreibweise: das, dessen Name Zeichen fuer Zeichen passt.
  const i = genau.find((n) => ix.namen[n] === q.trim()) ?? genau.find((n) => ix.namen[n].toLowerCase() === q.trim().toLowerCase())
    ?? genau[0] ?? (ix.nachGrob.get(grobKey(k)) ?? [])[0];
  return i === undefined ? null : { epicId: ix.ids[i], name: ix.namen[i], quelle: 'namen' };
}

/** Epics Kontodienst: der Anzeigename genau so, wie er im Spiel steht (Epic vergleicht ohne Gross/Klein). */
async function beiEpic(name: string): Promise<KontoTreffer | null | 'fehler'> {
  const n = name.trim().replace(UNSICHTBAR, '');
  if (n.length < 3 || n.length > 64) return null;
  for (let versuch = 0; versuch < 2; versuch += 1) {
    try {
      const { token } = await getToken();
      const r = await fetch(`${ACCOUNT}/account/api/public/account/displayName/${encodeURIComponent(n)}`, {
        headers: { Authorization: token }, cache: 'no-store', signal: AbortSignal.timeout(8_000),
      });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json() as { id?: string; displayName?: string };
      return j.id ? { epicId: j.id.toLowerCase(), name: j.displayName || n, quelle: 'epic' } : null;
    } catch {
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  return 'fehler';
}

/** Ein Konto zu einem Namen - Vorrat, dann Epic. "fehler": nichts gefunden UND Epic war nicht erreichbar. */
export async function kontoZuName(q: string): Promise<KontoTreffer | null | 'fehler'> {
  const v = await ausVorrat(q).catch(() => null);
  // Ein genauer Treffer im Vorrat genuegt; ein nur grober wird gegen Epic geprueft (Epic kennt den genauen Namen).
  if (v && namensKey(v.name) === namensKey(q)) return v;
  const e = await beiEpic(q);
  if (e && e !== 'fehler') return e;
  return v ?? e;
}

/* ---------------------------------------------- Ergebnisse aus den Bestenlisten */

export interface KontoZeile {
  windowId: string; eventId: string; region: string; season: string; titel: string; datum: number;
  platz: number; punkte: number; matches: number;
  /** Eigene Elims aus dem Replay - sonst bei Solo die Team-Elims (= die eigenen), bei Teams null. */
  elims: number | null; teamElims: number; teamGroesse: number;
  /** Wann die Liste bei Epic geholt wurde (ms) - eine waehrend des Cups geholte Liste ist nicht der Endstand. */
  geholt: number | null;
}
interface Manifest { [anhang: string]: { groesse?: number; zeit?: string; summe?: string } }

const manifestVorrat = new Map<string, { bis: number; wert: Manifest }>();
async function manifest(tag: string): Promise<Manifest> {
  const da = manifestVorrat.get(tag);
  if (da && da.bis > Date.now()) return da.wert;
  let wert: Manifest = {};
  let bis = Date.now() + 5 * 60_000;
  try {
    const r = await fetch(basis(tag) + 'manifest.json', { redirect: 'follow', cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    if (r.status === 404) bis = Date.now() + 60 * 60_000;
    else if (r.ok) wert = await r.json() as Manifest;
    else throw new Error(`HTTP ${r.status}`);
  } catch {
    if (da) return da.wert;
    bis = Date.now() + 30_000;
  }
  manifestVorrat.set(tag, { bis, wert });
  return wert;
}

/** Die juengsten Spieltage am Release: [Release, Anhang, Zeit, Pruefsumme], neueste zuerst. */
async function juengsteSpieltage(tage: number, hoechstens: number): Promise<Array<{ tag: string; anhang: string; zeit: number; summe: string }>> {
  const tags = tagsFuer('epic-spieltage/') as string[];
  const ab = Date.now() - tage * 86_400_000;
  const raus: Array<{ tag: string; anhang: string; zeit: number; summe: string }> = [];
  const gesehen = new Set<string>();
  for (const [i, m] of (await Promise.all(tags.map((t) => manifest(t)))).entries()) {
    for (const [anhang, a] of Object.entries(m)) {
      if (!/^epic-spieltage__S\d+__.+\.json$/.test(anhang) || gesehen.has(anhang)) continue;
      // Unter 1 KB steht niemand darin (Fenster ohne Teilnehmer).
      if ((a.groesse ?? 0) < 1_000) continue;
      const zeit = Date.parse(a.zeit ?? '') || 0;
      if (zeit < ab) continue;
      gesehen.add(anhang);
      raus.push({ tag: tags[i], anhang, zeit, summe: a.summe ?? String(a.groesse ?? '') });
    }
  }
  return raus.sort((a, b) => b.zeit - a.zeit).slice(0, hoechstens);
}

interface RohSpieltag {
  eventId: string; windowId: string; region: string; season: string; titel: string; datum: number | null; geholt?: string;
  teams: Array<{ platz: number; punkte: number; matches: number; teamElims: number; spieler: string[] }>;
}

async function holeDatei(tag: string, anhang: string): Promise<Buffer | null> {
  for (let versuch = 0; versuch < 3; versuch += 1) {
    try {
      const r = await fetch(basis(tag) + encodeURIComponent(anhang), { redirect: 'follow', cache: 'no-store', signal: AbortSignal.timeout(20_000) });
      if (r.status === 404) return null;
      if (r.ok) return Buffer.from(await r.arrayBuffer());
    } catch { /* noch einmal */ }
    await new Promise((r) => setTimeout(r, 500 * (versuch + 1)));
  }
  return null;
}

export interface KontoSuche { zeilen: KontoZeile[]; gesucht: number; gelesen: number; tage: number }

const TAGE = 21;
const DATEIEN = 160;

/*
 * Der Bestand: alle Spieltage der letzten drei Wochen einmal gelesen und im Speicher (Betreiber, 15.11.2026: nach der Wahl von "iL juanit0 · Epic account"
 * zeigte "cup:" nur "Optionen koennen nicht geladen werden"). Vorher las JEDE Suche nach einem Konto bis zu 160 Dateien (je ein bis zwei Megabyte) vom
 * Release - fuer ein Konto ohne Szene-Profil dauerte das Minuten, und die Vorschlagsliste hat drei Sekunden. Jetzt liegt je Spieltag nur, was die Suche
 * braucht: die Konto-Ids aneinander (32 Zeichen je Spieler, als Buffer ausserhalb des JS-Speichers) und je Team Platz, Punkte, Matches, Team-Elims.
 * Ein Konto ist damit in Millisekunden gefunden. Erneuert wird alle 15 Minuten - nur, was am Release neu ist oder sich geaendert hat (Pruefsumme).
 */
interface BestandDatei {
  summe: string;
  kopf: { eventId: string; windowId: string; region: string; season: string; titel: string; datum: number; geholt: number | null };
  /** Die Konto-Ids aller Spieler, je 32 Zeichen, aneinander. */
  ids: Buffer;
  /** Je Spieler (Stelle in ids / 32) der Index seines Teams. */
  team: Int32Array;
  platz: Int32Array; punkte: Int32Array; matches: Int32Array; teamElims: Int32Array; groesse: Int32Array;
}
const bestand = new Map<string, BestandDatei>();
let bestandGesucht = 0;
let bestandBis = 0;
let bestandErsterLauf: Promise<void> | null = null;
let bestandLaeuft: Promise<void> | null = null;

function bestandDatei(roh: Buffer, summe: string): BestandDatei | null {
  try {
    const d = JSON.parse(roh.toString('utf8')) as RohSpieltag;
    const teams = d.teams ?? [];
    const ids: string[] = []; const team: number[] = [];
    const platz = new Int32Array(teams.length); const punkte = new Int32Array(teams.length); const matches = new Int32Array(teams.length);
    const teamElims = new Int32Array(teams.length); const groesse = new Int32Array(teams.length);
    teams.forEach((t, i) => {
      platz[i] = t.platz; punkte[i] = t.punkte ?? 0; matches[i] = t.matches ?? 0; teamElims[i] = t.teamElims ?? 0;
      const echte = (t.spieler ?? []).map((s) => String(s).toLowerCase()).filter((s) => /^[0-9a-f]{32}$/.test(s));
      groesse[i] = echte.length;
      for (const s of echte) { ids.push(s); team.push(i); }
    });
    return {
      summe,
      kopf: {
        eventId: d.eventId, windowId: d.windowId, region: d.region, season: d.season, titel: d.titel, datum: d.datum ?? 0,
        geholt: Date.parse(d.geholt ?? '') || null,
      },
      ids: Buffer.from(ids.join(''), 'latin1'), team: Int32Array.from(team), platz, punkte, matches, teamElims, groesse,
    };
  } catch { return null; }
}

function bestandErneuern(): Promise<void> {
  bestandLaeuft ??= (async () => {
    const liste = await juengsteSpieltage(TAGE, DATEIEN);
    if (!liste.length) { bestandBis = Date.now() + 60_000; return; }
    const offen = liste.filter((x) => bestand.get(x.anhang)?.summe !== x.summe);
    for (let i = 0; i < offen.length; i += 6) {
      await Promise.all(offen.slice(i, i + 6).map(async ({ tag, anhang, summe }) => {
        const roh = await holeDatei(tag, anhang);
        const d = roh ? bestandDatei(roh, summe) : null;
        if (d) bestand.set(anhang, d);
      }));
    }
    const drin = new Set(liste.map((x) => x.anhang));
    for (const k of [...bestand.keys()]) if (!drin.has(k)) bestand.delete(k);
    bestandGesucht = liste.length;
    // Kam ein Teil nicht, bald noch einmal (Hauptregel: ein Fehlschlag ist kein "fehlt").
    bestandBis = Date.now() + (bestand.size < liste.length ? 2 * 60_000 : 15 * 60_000);
  })().catch(() => { bestandBis = Date.now() + 60_000; }).finally(() => { bestandLaeuft = null; });
  return bestandLaeuft;
}

/** Den Bestand anwerfen bzw. erneuern, wenn er alt ist - ohne zu warten. */
export function bestandVorwaermen(): void {
  if (Date.now() < bestandBis) return;
  const lauf = bestandErneuern();
  bestandErsterLauf ??= lauf;
}
/** Ist der Bestand einmal ganz gelesen? */
export function bestandBereit(): boolean { return bestandGesucht > 0 && bestand.size > 0; }

/** Die Zeilen eines Kontos aus dem Bestand - sofort, ohne Netz. */
function imBestand(id: string): KontoZeile[] {
  const nadel = Buffer.from(id, 'latin1');
  const zeilen: KontoZeile[] = [];
  for (const d of bestand.values()) {
    let ab = 0;
    for (;;) {
      const stelle = d.ids.indexOf(nadel, ab);
      if (stelle < 0) break;
      ab = stelle + 1;
      if (stelle % 32) continue;
      const t = d.team[stelle / 32];
      zeilen.push({
        windowId: d.kopf.windowId, eventId: d.kopf.eventId, region: d.kopf.region, season: d.kopf.season, titel: d.kopf.titel,
        datum: d.kopf.datum, platz: d.platz[t], punkte: d.punkte[t], matches: d.matches[t],
        elims: d.groesse[t] === 1 ? d.teamElims[t] : null, teamElims: d.teamElims[t], teamGroesse: d.groesse[t], geholt: d.kopf.geholt,
      });
      break;
    }
  }
  return zeilen.sort((a, b) => b.datum - a.datum);
}

/**
 * Die Spieltage eines Kontos sofort - nur aus dem schon gelesenen Bestand (fuer die Vorschlagsliste, die nicht warten kann).
 * null: der Bestand ist noch nicht gelesen (er wird dabei angeworfen).
 */
export function kontoSpieltageSofort(epicId: string): KontoZeile[] | null {
  bestandVorwaermen();
  return bestandBereit() ? imBestand(epicId.toLowerCase()) : null;
}

const kontoVorrat = new Map<string, { bis: number; wert: Promise<KontoSuche> }>();

/**
 * Wo steht dieses Konto in den Bestenlisten der letzten drei Wochen (hoechstens 160 Spieltage, alle Regionen)? Aus dem Bestand; ist er noch nicht
 * gelesen, wird auf den ersten Lauf gewartet. "gelesen" < "gesucht" heisst: einige Dateien kamen nicht - dann ehrlich sagen.
 */
export function kontoErgebnisse(epicId: string): Promise<KontoSuche> {
  const id = epicId.toLowerCase();
  const da = kontoVorrat.get(id);
  if (da && da.bis > Date.now()) return da.wert;
  const wert = (async (): Promise<KontoSuche> => {
    bestandVorwaermen();
    if (!bestandBereit()) await (bestandErsterLauf ?? bestandErneuern());
    if (!bestandBereit()) await bestandErneuern();
    const zeilen = imBestand(id);
    // Eigene Elims aus dem Replay (nur fuer Teams noetig) - mit Frist, das Replay ist ein Zusatz.
    await Promise.race([
      Promise.all(zeilen.filter((z) => z.teamGroesse > 1).slice(0, 10).map(async (z) => {
        try { const w = await replayWert(z.season, z.windowId, id); if (w && typeof w.elims === 'number') z.elims = w.elims; } catch { /* ohne */ }
      })),
      new Promise((r) => setTimeout(r, 8_000)),
    ]);
    return { zeilen, gesucht: bestandGesucht, gelesen: bestand.size, tage: TAGE };
  })();
  kontoVorrat.set(id, { bis: Date.now() + 10 * 60_000, wert });
  // Ein Fehlschlag soll nicht zehn Minuten haengen bleiben.
  wert.catch(() => kontoVorrat.delete(id));
  wert.then((w) => { if (w.gelesen < w.gesucht / 2) kontoVorrat.set(id, { bis: Date.now() + 60_000, wert }); }).catch(() => {});
  while (kontoVorrat.size > 200) kontoVorrat.delete(kontoVorrat.keys().next().value as string);
  return wert;
}
