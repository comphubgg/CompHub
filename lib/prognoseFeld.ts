// Das Teilnehmerfeld eines Finales - aus Epics Marken, nicht geraten.
//
// Ein Finale steht in Epics Daten mit einer Zugangsmarke ("requireAllTokens":
// S42_FNCS_Division1Week4_Final_EU). Dieselbe Marke steht in der
// Auszahlungstabelle des Spieltags, der sie vergibt: "Platz 1 bis 50". Damit
// ist das Feld des Finales ausgerechnet, nicht vermutet: die besten Fuenfzig
// jenes Spieltags. Und ob sie die Marke wirklich tragen, sagt Epic je Konto -
// wer abgesagt hat oder gesperrt wurde, hat sie nicht mehr.
//
// Der Betreiber zur Prognoseseite: "es gibt kein Leaderboard, wo du die
// einfach abrufen kannst. Die haben sich ja mit vorherigen Cups
// qualifiziert. Das musst du dann irgendwie herausfinden." Genau das
// passiert hier. Wo Epic die Vergabe noch nicht nennt (ein LAN, dessen
// Marke erst kurz vorher verteilt wird), steht das als Hinweis da - und
// nicht irgendeine Liste.

import path from 'path';
import fs from '@/lib/ablageFs';
import { DATEN_ORT } from '@/lib/datenOrt';
import {
  gecacht, cupsGruppiert, leseArchiv, holeTop, holeMarken, REGIONEN,
  type CupGruppe, type CupFensterDetail, type Marke,
} from '@/lib/epicCups';
import { AblageNichtErreichbar, fertigeAntwort, FRISCH_LIVE_MS } from '@/lib/antwortSpeicher';
import { fensterName } from '@/lib/fensterName';

export interface FeldTeam {
  /** Die Konto-Ids sortiert und mit "|" verbunden - oder die Namen. */
  key: string;
  namen: string[];
  ids: string[];
  /** Woher das Team kommt, fuer die Anzeige: "Event 4 · #3". */
  herkunft: string[];
  besterPlatz: number;
  region: string;
}

export interface FeldQuelle {
  eventId: string; windowId: string; region: string; titel: string;
  topN: number | null;
}

export interface FeldErgebnis {
  eventId: string; windowId: string; region: string;
  /** Die Zugangsmarken des Finales - ohne Regionssperren und Zuschauermarken. */
  tokens: string[];
  quellen: FeldQuelle[];
  teams: FeldTeam[];
  /** Wahr, wenn Epic die Marken je Konto bestaetigt hat. */
  geprueft: boolean;
  /**
   * Was fehlt oder noch aussteht - fuer den Betreiber, ehrlich.
   *
   * Als Kennungen mit Angaben, nicht als fertige Saetze: die Oberflaeche
   * setzt sie in ihrer Sprache zusammen.
   */
  hinweise: FeldHinweis[];
  stand: number;
}

export type FeldHinweis =
  | { art: 'vorrunde-offen'; fenster: string; region: string; n: number; datum: number }
  | { art: 'liste-fehlt'; fenster: string; region: string }
  | { art: 'weggelassen'; n: number }
  | { art: 'marke-unvergeben' }
  | { art: 'pruefung-fehlgeschlagen' }
  | { art: 'keine-vergabe'; token: string }
  | { art: 'keine-quali' };

/** Marken, die keine Qualifikation bedeuten: Regionssperre, Zuschauer, Platzhalter. */
const KEINE_QUALI = /^RegionLock_|^LANSpectator$|^fake_token$|^GroupIdentity_/i;

export function echteMarken(tokens: string[] | undefined): string[] {
  return (tokens ?? []).filter((t) => t && !KEINE_QUALI.test(t));
}

type Fenster = CupFensterDetail & { cupId: string; cupTitel: string };

/** Der Katalog wie ihn die Turnierseite liest - derselbe Vorrat, keine zweite Abfrage. */
async function katalog(): Promise<CupGruppe[]> {
  const schluessel = `catalog|${REGIONEN.join(',')}`;
  return gecacht(schluessel, 60_000, async () => {
    try {
      return await fertigeAntwort(schluessel, () => cupsGruppiert([...REGIONEN]), FRISCH_LIVE_MS);
    } catch (e) {
      if (e instanceof AblageNichtErreichbar) return cupsGruppiert([...REGIONEN]);
      throw e;
    }
  });
}

/** Alle Fenster, die es gibt: aus Epics Liste und aus dem eigenen Archiv. */
async function alleFenster(): Promise<Fenster[]> {
  const raus: Fenster[] = [];
  const gesehen = new Set<string>();
  for (const c of await katalog()) {
    for (const [region, liste] of Object.entries(c.regionen)) {
      for (const f of liste) {
        gesehen.add(`${f.windowId}|${region}`);
        raus.push({ ...f, region, cupId: c.id, cupTitel: c.titel });
      }
    }
  }
  for (const e of await leseArchiv()) {
    if (gesehen.has(`${e.windowId}|${e.region}`)) continue;
    raus.push({
      status: 'vorbei', begin: e.begin, end: e.end, name: e.windowId,
      eventId: e.eventId, windowId: e.windowId, region: e.region,
      runde: 0, istFinale: e.istFinale, tokens: e.tokens ?? [], matchCap: e.matchCap,
      qualifiziert: e.qualifiziert, playlist: e.playlist, raenge: e.raenge,
      marken: e.marken, cupId: e.id, cupTitel: e.titel,
    });
  }
  return raus;
}

/** Datum kurz, fuer die Herkunft eines Teams. */
function tag(ms: number) {
  return new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
}

/** Die Fenster, die eine dieser Marken vergeben - mit der Schwelle. */
function vergeber(fenster: Fenster[], tokens: string[]): Array<{ f: Fenster; marke: Marke }> {
  const raus: Array<{ f: Fenster; marke: Marke }> = [];
  for (const f of fenster) {
    for (const m of f.marken ?? []) {
      if (tokens.includes(m.token)) raus.push({ f, marke: m });
    }
  }
  return raus.sort((a, b) => a.f.begin - b.f.begin);
}

/** Aus einer Bestenliste die Teams bis zur Schwelle. */
async function teamsAus(q: FeldQuelle, gefunden: Map<string, FeldTeam>) {
  const d = await holeTop(q.eventId, q.windowId, q.topN ?? 200);
  for (const e of (d.entries ?? []).slice(0, q.topN ?? undefined)) {
    const ids = e.players.map((p) => p.id ?? '');
    const namen = e.players.map((p) => p.name);
    const echte = ids.filter(Boolean).slice().sort();
    const key = echte.length ? echte.join('|')
      : namen.map((n) => n.toLowerCase()).sort().join('|');
    const herkunft = `${q.titel} · #${e.rank}`;
    const da = gefunden.get(key);
    if (da) {
      da.herkunft.push(herkunft);
      da.besterPlatz = Math.min(da.besterPlatz, e.rank);
    } else {
      gefunden.set(key, { key, namen, ids, herkunft: [herkunft], besterPlatz: e.rank, region: q.region });
    }
  }
}

/* --------------------------------------------- Vom Laufrechner vorgerechnet */

const VORGERECHNET = path.join(DATEN_ORT, 'prognose-felder.json');

interface Vorgerechnet {
  stand: number;
  felder: Record<string, FeldErgebnis>;
}

/**
 * Was der stuendliche Lauf ausgerechnet hat (scripts/prognose-felder.mjs).
 *
 * Dort steht, was hier nicht geht: ein Feld ohne bekannte Vergabe, etwa
 * ein LAN, dessen Marke Epic von Hand verteilt. Der Lauf sieht alle
 * Finalisten der letzten Saisons durch und fragt Epic je Konto nach der
 * Marke - das braucht die Spieltag-Dateien, die auf dem Server nicht liegen.
 */
async function vorgerechnet(windowId: string, region: string): Promise<FeldErgebnis | null> {
  try {
    const roh = JSON.parse(await fs.readFile(VORGERECHNET, 'utf8')) as Vorgerechnet;
    return roh.felder?.[`${windowId}|${region}`] ?? null;
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------- Bestimmen */

export async function bestimmeFeld(ziel: { eventId: string; windowId: string; region: string }): Promise<FeldErgebnis> {
  const fenster = await alleFenster();
  const dieses = fenster.find((f) => f.windowId === ziel.windowId && f.region === ziel.region)
    ?? fenster.find((f) => f.windowId === ziel.windowId);
  const tokens = echteMarken(dieses?.tokens);
  const ergebnis: FeldErgebnis = {
    eventId: ziel.eventId, windowId: ziel.windowId, region: ziel.region,
    tokens, quellen: [], teams: [], geprueft: false, hinweise: [], stand: Date.now(),
  };

  // Vom Laufrechner schon gerechnet? Dann gilt das, wenn es juenger ist als
  // ein Tag - dort ist mehr bekannt als hier.
  const fertig = await vorgerechnet(ziel.windowId, ziel.region);
  if (fertig && fertig.teams.length && Date.now() - fertig.stand < 26 * 3_600_000) return fertig;

  const gefunden = new Map<string, FeldTeam>();
  const hinweise = ergebnis.hinweise;

  // 1. Die Fenster, die die Marke vergeben.
  const quellen = tokens.length ? vergeber(fenster, tokens) : [];
  if (quellen.length) {
    for (const { f, marke } of quellen) {
      const q: FeldQuelle = {
        eventId: f.eventId, windowId: f.windowId, region: f.region,
        titel: `${fensterName(f.windowId)} · ${tag(f.begin)}`, topN: marke.bis,
      };
      ergebnis.quellen.push(q);
      if (f.status === 'kommt') {
        hinweise.push({ art: 'vorrunde-offen', fenster: fensterName(f.windowId), region: f.region, n: marke.bis, datum: f.begin });
        continue;
      }
      try { await teamsAus(q, gefunden); }
      catch { hinweise.push({ art: 'liste-fehlt', fenster: fensterName(f.windowId), region: f.region }); }
    }
  } else if (dieses && !tokens.length) {
    // 2. Keine Marke: der Spieltag davor in derselben Region, bis zu seiner
    //    Qualifikationsschwelle - so haelt es auch die Kartenseite.
    const davor = fenster
      .filter((f) => f.cupId === dieses.cupId && f.region === dieses.region && f.begin < dieses.begin)
      .sort((a, b) => b.begin - a.begin)[0];
    if (davor?.qualifiziert) {
      const q: FeldQuelle = {
        eventId: davor.eventId, windowId: davor.windowId, region: davor.region,
        titel: `${fensterName(davor.windowId)} · ${tag(davor.begin)}`, topN: davor.qualifiziert,
      };
      ergebnis.quellen.push(q);
      try { await teamsAus(q, gefunden); }
      catch { hinweise.push({ art: 'liste-fehlt', fenster: fensterName(davor.windowId), region: davor.region }); }
    }
  }

  // 3. Nachsehen, wer die Marke wirklich traegt.
  if (tokens.length && gefunden.size) {
    try {
      const alleIds = [...gefunden.values()].flatMap((t) => t.ids).filter(Boolean);
      const marken = await holeMarken(alleIds);
      const traegt = (id: string) => (marken.get(id) ?? []).some((t) => tokens.includes(t));
      const irgendwer = alleIds.some(traegt);
      if (irgendwer) {
        let weg = 0;
        for (const [key, t] of gefunden) {
          if (!t.ids.every(traegt)) { gefunden.delete(key); weg++; }
        }
        ergebnis.geprueft = true;
        if (weg) hinweise.push({ art: 'weggelassen', n: weg });
      } else {
        hinweise.push({ art: 'marke-unvergeben' });
      }
    } catch {
      hinweise.push({ art: 'pruefung-fehlgeschlagen' });
    }
  }

  if (!gefunden.size && !ergebnis.quellen.length) {
    if (fertig) return fertig;
    hinweise.push(tokens.length
      ? { art: 'keine-vergabe', token: tokens.join(', ') }
      : { art: 'keine-quali' });
  }

  ergebnis.teams = [...gefunden.values()].sort((a, b) => a.besterPlatz - b.besterPlatz);
  return ergebnis;
}
