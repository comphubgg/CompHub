import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getToken, EVENTS, EpicLoginNoetig } from '@/lib/epicCups';
import { DATEN_ORT } from '@/lib/datenOrt';

// Was es in einem Cup zu gewinnen gibt.
//
// Epic fuehrt zu jedem Spieltag eine Auszahlungstabelle. Sie steht in
// derselben Antwort wie die Turnierliste, wird dort aber nur nach der
// Rangschwelle fuer die Qualifikation durchsucht. Tatsaechlich steht mehr
// darin:
//
//   rewardType "ecomm" + value "USD"  -> Preisgeld, quantity ist der Betrag
//   rewardType "game"                 -> ein Gegenstand, value seine Kennung
//   rewardType "token"                -> die Marke fuer die naechste Runde
//
// Zwei Arten der Wertung kommen vor, und sie bedeuten Verschiedenes:
//
//   scoringType "rank"        -> nach Platzierung  ("Platz 1: 600 $")
//   scoringType "value"       -> nach Punkten      ("100 Punkte: 100 $")
//   scoringType "percentile"  -> nach oberem Anteil ("beste 5 %")
//
//   ?region=EU&window=S42_…_EU   -> die Tabelle dieses Spieltags
//
// Erfunden wird nichts: fehlt eine Tabelle, kommt eine leere Antwort mit dem
// Hinweis, dass Epic zu diesem Spieltag nichts veroeffentlicht.

export const revalidate = 0;

interface RohZahlung {
  rewardType?: string; value?: string; quantity?: number;
}
interface RohRang {
  threshold?: number; payouts?: RohZahlung[];
}
interface RohGruppe {
  scoringType?: string; ranks?: RohRang[];
}

/** Ein Zwischenspeicher - die Tabellen aendern sich waehrend eines Cups nicht. */
interface RohStufe { keyValue?: number; pointsEarned?: number; multiplicative?: boolean }
interface RohRegel { trackedStat?: string; matchRule?: string; rewardTiers?: RohStufe[] }
interface RohTemplate { eventTemplateId?: string; scoringRules?: RohRegel[] }
interface RohFenster { eventWindowId?: string; eventTemplateId?: string }
interface RohEreignis { eventWindows?: RohFenster[] }
interface Epic {
  payoutTables?: Record<string, RohGruppe[]>;
  templates?: RohTemplate[];
  events?: RohEreignis[];
  /** Regelsaetze unter ihrem Namen. */
  scoringRuleSets?: Record<string, RohRegel[]>;
  /** "Fortnite:<eventId>:<windowId>" -> Name des Regelsatzes. */
  scoreLocationScoringRuleSets?: Record<string, string>;
}

const merker = new Map<string, { bis: number; daten: Epic }>();
const HALTBAR = 10 * 60_000;

async function tabellen(region: string) {
  const gemerkt = merker.get(region);
  if (gemerkt && Date.now() < gemerkt.bis) return gemerkt.daten;

  const { token, accountId } = await getToken();
  const antwort = await fetch(
    `${EVENTS}/api/v1/events/Fortnite/download/${accountId}`
    + `?region=${encodeURIComponent(region)}&platform=Windows`
    + `&teamAccountIds=${accountId}`,
    { headers: { Authorization: token } });
  if (!antwort.ok) throw new Error(`Epic HTTP ${antwort.status}`);
  const daten = await antwort.json() as Epic;
  merker.set(region, { bis: Date.now() + HALTBAR, daten });
  return daten;
}

/**
 * Wie in diesem Spieltag gepunktet wird.
 *
 * Epic legt die Regeln je Vorlage ab, und jedes Fenster nennt seine Vorlage.
 * Uebersetzt werden nur die Bezeichnungen der gezaehlten Groessen - die
 * Zahlen bleiben, wie sie sind.
 */
function wertungVon(d: Epic, windowId: string, eventId: string) {
  /*
   * Epic legt die Regeln an zwei Stellen ab.
   *
   * Manche Vorlagen tragen sie unmittelbar; bei den meisten Cups steht in
   * der Vorlage jedoch nichts, und der Weg fuehrt ueber eine Zuordnung:
   * "Fortnite:<eventId>:<windowId>" nennt den Namen eines Regelsatzes, und
   * unter diesem Namen stehen die Regeln. Beide Wege werden probiert.
   */
  const schluessel = `Fortnite:${eventId}:${windowId}`;
  const satzName = (d.scoreLocationScoringRuleSets ?? {})[schluessel]
    ?? Object.entries(d.scoreLocationScoringRuleSets ?? {})
      .find(([k]) => k.endsWith(`:${windowId}`))?.[1];
  const ueberNamen = satzName
    ? (d.scoringRuleSets ?? {})[satzName] : undefined;

  const fenster = (d.events ?? [])
    .flatMap((e) => e.eventWindows ?? [])
    .find((w) => w.eventWindowId === windowId);
  const vorlage = (d.templates ?? [])
    .find((t) => t.eventTemplateId === fenster?.eventTemplateId);
  const regeln = (ueberNamen?.length ? ueberNamen : vorlage?.scoringRules) ?? [];
  if (!regeln.length) return [];

  const NAME: Record<string, string> = {
    PLACEMENT_STAT_INDEX: 'Placement',
    TEAM_ELIMS_STAT_INDEX: 'Elimination',
    VICTORY_ROYALE_STAT: 'Victory Royale',
    MATCH_PLAYED_STAT: 'Match played',
  };

  return regeln.flatMap((r) => {
    const name = NAME[r.trackedStat ?? ''] ?? (r.trackedStat ?? '');
    return (r.rewardTiers ?? []).map((st) => ({
      was: name,
      // "lte" heisst "Platz 1 bis N", "gte" heisst "ab N" - bei den
      // Eliminierungen also "je Elimination".
      schwelle: st.keyValue ?? 0,
      regel: r.matchRule ?? '',
      punkte: st.pointsEarned ?? 0,
      jeStueck: Boolean(st.multiplicative),
    }));
  // Regeln ohne Punkte sagen nichts. Beim Performance Cup steht dort
  // "Elimination -> +0", weil dort nur Siege zaehlen; eine Zeile mit einer
  // Null waere nur Beiwerk.
  }).filter((x) => x.punkte > 0);
}

/** Aus "AthenaGlider:glider_season_41reload" wird "Glider Season 41 Reload". */
function gegenstandName(wert: string): string {
  const teil = (wert ?? '').split(':').pop() ?? '';
  return teil
    .replace(/^(athena|cid|eid|bid|pickaxe|glider|wrap)[_-]?/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (z) => z.toUpperCase())
    .trim() || wert;
}

/* ------------------------------------------------ Von Hand gepflegtes */

/**
 * Preisgelder, die Epic nicht herausgibt.
 *
 * In der Auszahlungstabelle steht Geld nur bei Cash Cups. Bei FNCS,
 * Performance und Victory Cups steht dort nur die Qualifikationsmarke -
 * die Preisgelder werden von Epic zwar oeffentlich angekuendigt, aber
 * nirgends als Daten ausgeliefert. Sie stammen deshalb aus
 * data/preisgelder.json und werden in der Anzeige ausdruecklich als
 * gepflegte Angabe gekennzeichnet, nicht als Epic-Wert.
 */
interface Stufe { ab: number; betrag: number }
interface Gepflegt {
  turnier: string; region: string; nurFinale?: boolean;
  waehrung?: string; proPerson?: boolean; art: 'platz' | 'punkte';
  quelle?: string; erlaeuterung?: string;
  stufen?: Stufe[]; jePunkte?: number; betrag?: number;
  /** Wie viele Vielfache gezeigt werden - "zwei Siege bringen …". */
  stufen_anzahl?: number;
}

/** Die Turnierkennung ohne Season und Region - wie in der Kartenablage. */
function turnierKern(eventId: string): string {
  return (eventId ?? '')
    .replace(/^epicgames_/i, '')
    .replace(/_(EU|NAC|NAW|BR|ASIA|ME|OCE|GLOBAL)$/i, '')
    .replace(/^(CH\d+S\d+|S\d+)_?/i, '')
    .toLowerCase();
}

async function gepflegte(): Promise<Gepflegt[]> {
  try {
    const roh = JSON.parse(await fs.readFile(
      path.join(DATEN_ORT, 'preisgelder.json'), 'utf8'));
    return (roh?.eintraege ?? []) as Gepflegt[];
  } catch { return []; }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const window_ = searchParams.get('window');
  const region = (searchParams.get('region') ?? 'EU').toUpperCase();
  if (!window_) {
    return NextResponse.json({ error: 'window ist noetig' }, { status: 400 });
  }

  let epic: Epic;
  try {
    epic = await tabellen(region);
  } catch (e) {
    const login = e instanceof EpicLoginNoetig;
    return NextResponse.json(
      { error: (e as Error).message, needsLogin: login },
      { status: login ? 401 : 502 });
  }

  // Epic schluesselt teils mit der blossen Fenster-Id, teils mit einer
  // laengeren Kennung, die sie enthaelt - beides beruecksichtigen.
  const eventIdRoh = searchParams.get('event') ?? '';
  const alle = epic.payoutTables ?? {};
  const gruppen = alle[window_]
    ?? Object.entries(alle).find(([k]) => k.includes(window_))?.[1];
  const wertung = wertungVon(epic, window_, eventIdRoh);

  const eventId = eventIdRoh;
  const istFinale = searchParams.get('finale') === '1';

  /*
   * Steht bei Epic kein Geld, gilt die gepflegte Angabe.
   *
   * Sie wird nur genommen, wenn Turnier UND Region passen - der Betreiber
   * war ausdruecklich: seine Zahlen gelten fuer Europa, andere Regionen
   * zahlen weniger. Eine europaeische Zahl unter NAC zu schreiben waere
   * schlicht falsch.
   */
  async function ausDatei() {
    if (!eventId) return null;
    const kern = turnierKern(eventId);
    const treffer = (await gepflegte()).find((g) =>
      g.turnier.toLowerCase() === kern
      && g.region.toUpperCase() === region
      && (!g.nurFinale || istFinale));
    if (!treffer) return null;
    return NextResponse.json({
      vorhanden: true, window: window_, region,
      waehrung: treffer.waehrung ?? 'USD',
      proPerson: treffer.proPerson ?? false,
      gepflegt: true, quelle: treffer.quelle ?? null,
      erlaeuterung: treffer.erlaeuterung ?? null,
      /*
       * Bei Punktezahlungen die Vielfachen mit ausrechnen.
       *
       * "100 Punkte: 100 $" allein beantwortet die naheliegende Frage nicht -
       * was bringen zwei Siege? Deshalb stehen dort mehrere Stufen, so wie
       * es auch Fortnite Tracker zeigt. Gerechnet, nicht geraten: es ist
       * dieselbe Zahl mal zwei, mal drei.
       */
      geld: treffer.art === 'platz'
        ? (treffer.stufen ?? []).map((s) => ({ art: 'rank', schwelle: s.ab,
          betrag: s.betrag }))
        : Array.from({ length: Math.max(1, treffer.stufen_anzahl ?? 3) },
          (unbenutzt, i) => ({
            art: 'value',
            schwelle: (treffer.jePunkte ?? 100) * (i + 1),
            betrag: (treffer.betrag ?? 0) * (i + 1),
          })),
      gegenstaende: [], wertung,
      // Bei Punktezahlungen laesst sich nichts aufaddieren - siehe unten.
      gesamt: treffer.art === 'platz'
        ? (treffer.stufen ?? []).reduce((s, x) => s + x.betrag, 0) : null,
    });
  }

  if (!gruppen?.length) {
    const eigen = await ausDatei();
    if (eigen) return eigen;
    return NextResponse.json({
      vorhanden: false, window: window_, region,
      hinweis: 'Epic veroeffentlicht zu diesem Spieltag keine Auszahlungstabelle.',
      geld: [], gegenstaende: [], waehrung: null, gesamt: null, wertung,
    });
  }

  const geld: Array<{ art: string; schwelle: number; betrag: number }> = [];
  const gegenstaende: Array<{ art: string; schwelle: number; name: string }> = [];
  let waehrung: string | null = null;

  for (const g of gruppen) {
    for (const r of g.ranks ?? []) {
      for (const p of r.payouts ?? []) {
        if (typeof r.threshold !== 'number') continue;
        if (p.rewardType === 'ecomm' && typeof p.quantity === 'number') {
          waehrung ??= p.value ?? 'USD';
          geld.push({ art: g.scoringType ?? 'rank', schwelle: r.threshold,
            betrag: p.quantity });
        } else if (p.rewardType === 'game' && p.value) {
          gegenstaende.push({ art: g.scoringType ?? 'rank', schwelle: r.threshold,
            name: gegenstandName(p.value) });
        }
      }
    }
  }

  if (!geld.length) {
    // Tabelle vorhanden, aber ohne Geld - dann gilt ebenfalls die Datei.
    const eigen = await ausDatei();
    if (eigen) return eigen;
  }

  geld.sort((a, b) => a.schwelle - b.schwelle);
  gegenstaende.sort((a, b) => a.schwelle - b.schwelle);

  /*
   * Die Gesamtsumme nur bei Platzierungen, und nur wenn jede Stufe eine
   * eigene Schwelle hat. Bei "100 Punkte: 100 $" bekaeme jeder, der die
   * Punkte schafft, den Betrag - da liesse sich nichts aufaddieren, ohne die
   * Teilnehmerzahl zu kennen. Eine erfundene Summe waere schlimmer als keine.
   */
  const nurRang = geld.filter((x) => x.art === 'rank');
  const gesamt = nurRang.length && nurRang.length === geld.length
    ? nurRang.reduce((s, x) => s + x.betrag, 0) : null;

  return NextResponse.json({
    vorhanden: true, window: window_, region, waehrung,
    geld, gegenstaende, gesamt, wertung,
  });
}
