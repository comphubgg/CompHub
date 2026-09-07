import { getToken, verwirfToken, EVENTS } from '@/lib/epicCups';

/*
 * Wie in einem Spieltag gepunktet wird - und was das je Runde bedeutet.
 *
 * Epic haengt an jedes Team seine Rundenliste an, aber die Punkte einer
 * einzelnen Runde stehen dort nicht: sie kommen nur als Tagessumme. Was Epic
 * dagegen sehr wohl herausgibt, ist die Punktetabelle des Spieltags - "Platz
 * 1 bis 5: vier Punkte", "je Eliminierung: zwei Punkte". Aus Platz und
 * Eliminierungen einer Runde laesst sich die Rundenpunktzahl damit
 * ausrechnen, ohne irgendetwas anzunehmen.
 *
 * Nachgerechnet an einem echten Spieltag: Platz 14 mit fuenf Eliminierungen
 * ergibt 34 Punkte, Platz 25 ohne Eliminierung zwei - genau die Zahlen, die
 * auch das Vorbild anzeigt.
 *
 * Es bleibt eine Herleitung und keine Messung, deshalb steht die Herkunft
 * ueberall dabei, wo die Zahl erscheint.
 *
 * Diese Datei lag frueher als Kopie in der Preis-Schnittstelle. Zwei
 * Fassungen derselben Regelauslegung waeren in einer Woche auseinander
 * gelaufen - jetzt gibt es eine.
 */

export interface WertungsRegel {
  /** "Placement", "Elimination", "Victory Royale", "Match played". */
  was: string;
  schwelle: number;
  /** "lte" heisst "Platz 1 bis N", "gte" heisst "ab N". */
  regel: string;
  punkte: number;
  /** Bei "gte" mit dieser Marke: je Stueck, nicht einmalig. */
  jeStueck: boolean;
}

interface RohStufe { keyValue?: number; pointsEarned?: number; multiplicative?: boolean }
interface RohRegel { trackedStat?: string; matchRule?: string; rewardTiers?: RohStufe[] }
interface RohTemplate { eventTemplateId?: string; scoringRules?: RohRegel[] }
interface RohFenster { eventWindowId?: string; eventTemplateId?: string }
interface RohEreignis { eventWindows?: RohFenster[] }
interface RohZahlung { rewardType?: string; value?: string; quantity?: number }
interface RohRang { threshold?: number; payouts?: RohZahlung[] }
interface RohGruppe { scoringType?: string; ranks?: RohRang[] }

export interface EpicKatalog {
  payoutTables?: Record<string, RohGruppe[]>;
  templates?: RohTemplate[];
  events?: RohEreignis[];
  /** Regelsaetze unter ihrem Namen. */
  scoringRuleSets?: Record<string, RohRegel[]>;
  /** "Fortnite:<eventId>:<windowId>" -> Name des Regelsatzes. */
  scoreLocationScoringRuleSets?: Record<string, string>;
}

const merker = new Map<string, { bis: number; daten: EpicKatalog }>();
const HALTBAR = 10 * 60_000;

/** Epics Turnierkatalog einer Region - zehn Minuten gemerkt. */
export async function holeKatalog(region: string): Promise<EpicKatalog> {
  const schluessel = region.toUpperCase();
  const gemerkt = merker.get(schluessel);
  if (gemerkt && Date.now() < gemerkt.bis) return gemerkt.daten;

  // Wie ueberall bei Epic: ein 401 heisst nicht, dass die Anmeldung weg ist,
  // sondern dass das gemerkte Token nicht mehr gilt. Einmal neu holen und
  // noch einmal fragen.
  const hole = async () => {
    const { token, accountId } = await getToken();
    return fetch(
      `${EVENTS}/api/v1/events/Fortnite/download/${accountId}`
      + `?region=${encodeURIComponent(schluessel)}&platform=Windows`
      + `&teamAccountIds=${accountId}`,
      { headers: { Authorization: token } });
  };
  let antwort = await hole();
  if (antwort.status === 401) { verwirfToken(); antwort = await hole(); }
  if (!antwort.ok) throw new Error(`Epic HTTP ${antwort.status}`);
  const daten = await antwort.json() as EpicKatalog;
  merker.set(schluessel, { bis: Date.now() + HALTBAR, daten });
  return daten;
}

/**
 * Die Punktetabelle eines Spieltags.
 *
 * Epic legt die Regeln an zwei Stellen ab. Manche Vorlagen tragen sie
 * unmittelbar; bei den meisten Cups steht in der Vorlage jedoch nichts, und
 * der Weg fuehrt ueber eine Zuordnung: "Fortnite:<eventId>:<windowId>" nennt
 * den Namen eines Regelsatzes, und unter diesem Namen stehen die Regeln.
 * Beide Wege werden probiert.
 */
export function wertungVon(
  d: EpicKatalog, windowId: string, eventId: string,
): WertungsRegel[] {
  const schluessel = `Fortnite:${eventId}:${windowId}`;
  const satzName = (d.scoreLocationScoringRuleSets ?? {})[schluessel]
    ?? Object.entries(d.scoreLocationScoringRuleSets ?? {})
      .find(([k]) => k.endsWith(`:${windowId}`))?.[1];
  const ueberNamen = satzName ? (d.scoringRuleSets ?? {})[satzName] : undefined;

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

/**
 * Die Punkte einer einzelnen Runde.
 *
 * Epics Platzregeln sind kumulativ: "Platz 1 bis 1" gibt neun, "Platz 1 bis
 * 2" noch einmal vier, "Platz 1 bis 3" noch einmal vier. Ein erster Platz
 * bekommt also die Summe aller Stufen, deren Schwelle er erreicht - genau so
 * rechnet Epic seine Tagessumme.
 *
 * Fehlt die Tabelle, kommt null zurueck und nicht etwa eine Null: eine
 * ausgedachte Punktzahl waere schlimmer als gar keine.
 */
export function punkteFuerRunde(
  wertung: WertungsRegel[],
  platz: number | null,
  elims: number,
): number | null {
  if (!wertung.length) return null;

  let summe = 0;
  for (const r of wertung) {
    if (r.was === 'Placement') {
      if (platz === null) continue;
      if (r.regel === 'lte' ? platz <= r.schwelle : platz >= r.schwelle) {
        summe += r.punkte;
      }
    } else if (r.was === 'Elimination') {
      // "ab einer Eliminierung, je Stueck" ist der Normalfall; eine Stufe
      // ohne Vervielfachung zaehlt einmalig.
      if (elims >= r.schwelle) {
        summe += r.jeStueck ? r.punkte * elims : r.punkte;
      }
    } else if (r.was === 'Victory Royale') {
      if (platz === 1) summe += r.punkte;
    } else if (r.was === 'Match played') {
      summe += r.punkte;
    }
  }
  return summe;
}

/** Aus "S42_…_EU" die Region herausziehen - fuer den Katalogabruf. */
export function regionAus(windowId: string): string {
  return (/_([A-Z]{2,4})$/.exec(windowId)?.[1] ?? 'EU').toUpperCase();
}
