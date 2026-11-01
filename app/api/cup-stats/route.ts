import { NextResponse } from 'next/server';
import { gecacht, holeTop, EpicLoginNoetig, frischeFuer, type CupEintrag } from '@/lib/epicCups';
import { zwischenspeichern } from '@/lib/zwischenspeicher';
import { istGlobalsFinale, globalsTage, globalsStand, summiereTage } from '@/lib/globalsGesamt';
import { abgesagtFuer, ohneAbgesagte } from '@/lib/abgesagt';
import { holeKatalog, regionAus, wertungVon } from '@/lib/cupWertung';

// Bestenlisten je Kennzahl fuer einen Spieltag - die Grundlage fuer die
// Turnier-Statistikseite und die Beitragsvorlagen.
//
//   ?event=…&window=…&limit=100
//
// Welche Kennzahlen ein Turnier hergibt, legt Epic je Cup fest. Deshalb wird
// jede Kategorie nur ausgeliefert, wenn wirklich Werte dahinterstehen -
// erfundene oder geschaetzte Zahlen gibt es hier nicht.
//
// Wichtig: Epic fuehrt das Leaderboard je Team, nicht je Spieler. Die Werte
// gelten also fuer das gesamte Team; bei Solo-Cups faellt beides zusammen.
//
// Nicht enthalten ist Epics Feld "DamageDealt_Players_BySquad": ein Abgleich
// ueber mehrere Teams zeigte durchweg das 1,9- bis 2,0-fache des normalen
// Schadenswerts. Es ist also dieselbe Zahl doppelt gezaehlt und keine eigene
// Kennzahl - deshalb wird sie nicht angeboten.

const TTL = 60_000;

interface Kategorie {
  schluessel: string;
  titel: string;
  /** Zeichen vor der Zeile im Beitrag - macht die Kennzahl auf einen Blick erkennbar. */
  symbol: string;
  /** Ist ein kleiner Wert besser? Gilt etwa fuer die Durchschnittsplatzierung. */
  kleinBesser?: boolean;
  einheit?: string;
  /** Umrechnung fuer die Anzeige, etwa Zentimeter in Kilometer. */
  faktor?: number;
  nachkomma?: number;
  /** Ein Wert je Spiel (Quote/Schnitt: K/D, Durchschnittsplatz, Zeit am Leben) - zaehlt nur fuer Teams mit mindestens der Haelfte der meisten Spiele, sonst fuehrt ein einziges gutes Spiel. */
  jeSpiel?: boolean;
  wert: (e: CupEintrag) => number;
}

const KATEGORIEN: Kategorie[] = [
  { schluessel: 'points', symbol: '🏆',      titel: 'Most Points',            wert: (e) => e.points },
  { schluessel: 'elims', symbol: '🎯',       titel: 'Most Eliminations',    wert: (e) => e.elims },
  { schluessel: 'damage', symbol: '📈',      titel: 'Most Damage Dealt',          wert: (e) => e.damage },
  { schluessel: 'damageTaken', symbol: '📉', titel: 'Most Damage Taken', wert: (e) => e.damageTaken },
  { schluessel: 'headshots', symbol: '💀',   titel: 'Most Headshots',       wert: (e) => e.headshots },
  { schluessel: 'wins', symbol: '👑',        titel: 'Most Victory Royales',             wert: (e) => e.wins },
  { schluessel: 'kd', symbol: '⚔️',          titel: 'Best K/D',                nachkomma: 2, jeSpiel: true, wert: (e) => e.kd },
  { schluessel: 'avgPlace', symbol: '📍',    titel: 'Best Average Placement', kleinBesser: true,
    nachkomma: 2, jeSpiel: true, wert: (e) => e.avgPlace },
  { schluessel: 'matsGefarmt', symbol: '🧱', titel: 'Most Mats Farmed', wert: (e) => e.matsGefarmt },
  { schluessel: 'matsVerbaut', symbol: '🔨', titel: 'Most Mats Used', wert: (e) => e.matsVerbaut },
  { schluessel: 'kisten', symbol: '📦',      titel: 'Most Chests Opened',   wert: (e) => e.kisten },
  { schluessel: 'heilung', symbol: '💊',     titel: 'Most Heals Used',         wert: (e) => e.heilung },
  { schluessel: 'schild', symbol: '🛡️',      titel: 'Most Shields Used', wert: (e) => e.schild },
  { schluessel: 'strecke', symbol: '🏃',     titel: 'Most Distance Traveled',  einheit: 'km',
    faktor: 1 / 100_000, nachkomma: 1, wert: (e) => e.strecke },
  { schluessel: 'timeAlive', symbol: '⏱️',   titel: 'Most Time Alive',   einheit: 'min',
    faktor: 1 / 60, nachkomma: 0, wert: (e) => e.timeAlive },
  /*
   * "Most Time Alive" ist die Summe ueber alle Spiele - sie belohnt, wer mehr Spiele hatte. Daneben der Schnitt je Spiel:
   * wer im einzelnen Spiel am laengsten ueberlebt (Epics Feld avgTimeAlive, ueber mehrere Tage neu gerechnet).
   */
  { schluessel: 'avgTimeAlive', symbol: '⏳',  titel: 'Longest Avg Time Alive', einheit: 'min',
    faktor: 1 / 60, nachkomma: 1, jeSpiel: true, wert: (e) => e.avgTimeAlive },
];

/**
 * Vom Admin abgesagte Runden herausrechnen (lib/abgesagt), genau wie die Bestenliste (app/api/cup-leaderboard, bereinigt).
 * Vorher taten es hier nur die Globals-Tage: nach einer Absage zeigten Bestenliste und Tabelle die bereinigten Punkte, die
 * Statistik-Kacheln derselben Seite zaehlten die abgesagte Runde weiter mit.
 */
async function ohneAbgesagteRunden(eintraege: CupEintrag[], event: string, windowId: string, vollstaendig: boolean): Promise<CupEintrag[]> {
  const abgesagt = await abgesagtFuer(windowId);
  if (!abgesagt.size) return eintraege;
  let wertung: Awaited<ReturnType<typeof wertungVon>> = [];
  try { wertung = wertungVon(await holeKatalog(regionAus(windowId)), windowId, event); } catch { /* ohne Tabelle */ }
  return ohneAbgesagte(eintraege, abgesagt, wertung, vollstaendig).eintraege;
}

async function holeRoh(request: Request) {
  const { searchParams } = new URL(request.url);
  const event = searchParams.get('event');
  const window_ = searchParams.get('window');
  // Mehrere Tage eines Finales zusammen (?windows=a,b - Betreiber, 28.10.2026: kumulatives Turnier).
  const tageListe = (searchParams.get('windows') ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 6);
  if (searchParams.get('frisch') === '1') for (const w of window_ ? [window_, ...tageListe] : tageListe) frischeFuer(w);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100', 10) || 100, 10_000);
  const proListe = Math.min(parseInt(searchParams.get('top') ?? '5', 10) || 5, 25);

  /*
   * Eine einzelne Kennzahl in voller Laenge.
   *
   * Die Uebersicht zeigt je Kennzahl fuenf Plaetze; wer eine davon oeffnet,
   * will das ganze Feld sehen. Alle fuenfzehn Kennzahlen in voller Laenge
   * mitzuschicken waeren bei einem grossen Cup mehrere Megabyte bei jedem
   * Aufruf der Eventseite - fuer eine Liste, die meistens niemand oeffnet.
   * Deshalb wird genau die eine nachgeladen, wenn sie gebraucht wird.
   */
  const nurListe = (searchParams.get('liste') ?? '').trim();

  if (!event || (!window_ && tageListe.length < 2)) {
    return NextResponse.json({ error: 'event und window sind noetig' }, { status: 400 });
  }

  try {
    // Das Finale der Globals hat keine eigene Bestenliste: beide Tage zusammen.
    const finale = istGlobalsFinale(event, window_);
    const summe = tageListe.length > 1;
    const tageDaten = summe ? await Promise.all(tageListe.map((w) => gecacht(`stats|${event}|${w}|${limit}`, TTL, () => holeTop(event, w, limit)))) : null;
    const einzeln = finale || summe || !window_ ? null : await gecacht(`stats|${event}|${window_}|${limit}`, TTL,
      () => holeTop(event, window_, limit));
    const eintraege = tageDaten
      ? summiereTage(await Promise.all(tageDaten.map((d, i) => ohneAbgesagteRunden(d.entries as CupEintrag[], event, tageListe[i], (d.totalPages ?? 1) <= 1))))
      : finale ? summiereTage(await globalsTage(limit))
        : await ohneAbgesagteRunden(einzeln!.entries as CupEintrag[], event, window_!, (einzeln!.totalPages ?? 1) <= 1);
    // Wann Epic die Bestenliste zuletzt fortgeschrieben hat - fuer "zuletzt aktualisiert".
    const aktualisiert = tageDaten ? (tageDaten.map((d) => d.updated ?? '').sort().pop() || null) : finale ? await globalsStand(limit) : einzeln!.updated ?? null;

    const bestenlisten = KATEGORIEN.filter((k) =>
      !nurListe || k.schluessel === nurListe).map((k) => {
      const mindestSpiele = k.jeSpiel ? Math.max(1, Math.ceil(eintraege.reduce((m, e) => Math.max(m, e.games || 0), 0) / 2)) : 0;
      const mitWert = eintraege.filter((e) => {
        const v = k.wert(e);
        return Number.isFinite(v) && v > 0 && (e.games || 0) >= mindestSpiele;
      });
      // Liefert das Turnier diese Kennzahl nicht, entfaellt die Kategorie.
      if (!mitWert.length) return null;

      const sortiert = [...mitWert].sort((a, b) =>
        k.kleinBesser ? k.wert(a) - k.wert(b) : k.wert(b) - k.wert(a));

      /*
       * Platz in dieser Kennzahl: gleicher angezeigter Wert, gleicher Platz (1, 2, 2, 4). Vorher zaehlte die Kachel nur die Zeilen durch -
       * zwanzig Teams mit 13 Eliminierungen standen auf 5 bis 24, und die Siege (je 1) auf 1 bis 6. "rank" bleibt Epics Gesamtplatz des Teams.
       * Bei den Punkten entscheidet Epics Wertung auch bei gleichen Punkten (Tiebreaker), dort gilt der Gesamtplatz.
       */
      const zeigen = (e: typeof sortiert[number]) => +(k.faktor ? k.wert(e) * k.faktor : k.wert(e)).toFixed(k.nachkomma ?? 0);
      const statPlaetze: number[] = [];
      sortiert.forEach((e, i) => { statPlaetze.push(i > 0 && zeigen(sortiert[i - 1]) === zeigen(e) ? statPlaetze[i - 1] : i + 1); });
      const platz = (e: typeof sortiert[number], i: number) => {
        const roh = k.wert(e);
        const angezeigt = k.faktor ? roh * k.faktor : roh;
        return {
          rank: e.rank,
          statPlatz: k.schluessel === 'points' ? e.rank : statPlaetze[i],
          spieler: e.players.map((p) => p.name),
          ids: e.players.map((p) => p.id),
          wert: +angezeigt.toFixed(k.nachkomma ?? 0),
          roh,
        };
      };

      // "plaetze" ist die Kachel, "alle" das vollstaendige Feld dahinter.
      // Die Kachel zeigt die Spitze, das Pluszeichen macht den Rest auf -
      // dieselbe Sortierung, nur ungekuerzt.
      const alle = sortiert.map(platz);

      return {
        schluessel: k.schluessel,
        titel: k.titel,
        symbol: k.symbol,
        einheit: k.einheit ?? null,
        // Wie viele Nachkommastellen dazugehoeren. Ohne diese Angabe wird
        // aus 17,00 in der Anzeige "17", und die Spalte steht schief.
        nachkomma: k.nachkomma ?? 0,
        plaetze: alle.slice(0, proListe),
        alle,
      };
    }).filter(Boolean);

    // Welche Felder das Turnier ueberhaupt mitschickt - hilfreich, um zu
    // erkennen, warum eine Kategorie fehlt.
    const felder = new Set<string>();
    for (const e of eintraege) {
      for (const m of e.matches) {
        for (const k of Object.keys(m)) {
          if (k !== 'sessionId' && k !== 'endTime') felder.add(k);
        }
      }
    }

    return NextResponse.json({
      aktualisiert: aktualisiert || null,
      teams: eintraege.length,
      spiele: eintraege[0]?.games ?? 0,
      bestenlisten,
      geliefert: [...felder].sort(),
      hinweis: 'Stats are per team, the way Epic reports them.',
    });
  } catch (e) {
    const login = e instanceof EpicLoginNoetig;
    return NextResponse.json(
      { error: (e as Error).message, needsLogin: login },
      { status: 424 },
    );
  }
}

/** Fuer alle gleich - Vercels Zwischenspeicher beantwortet Wiederholungen (lib/zwischenspeicher). */
export async function GET(request: Request) {
  return zwischenspeichern(await holeRoh(request), 30);
}
