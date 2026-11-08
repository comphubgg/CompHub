import { istZeroBuild } from '@/lib/zeroBuild';
import { NextResponse } from 'next/server';
import { gecacht, holeTop, EpicLoginNoetig, frischeFuer, lebenOhneUeberlappung, type CupEintrag } from '@/lib/epicCups';
import { zwischenspeichern } from '@/lib/zwischenspeicher';
import { istGlobalsFinale, globalsTage, globalsStand, summiereTage } from '@/lib/globalsGesamt';
import { abgesagtFuer, ohneAbgesagte } from '@/lib/abgesagt';
import { holeKatalog, regionAus, wertungVon } from '@/lib/cupWertung';
import { liesJson } from '@/lib/ablage';
import { DATEN_ORT } from '@/lib/datenOrt';
import nodeFs from 'fs/promises';
import path from 'path';
import { gunzipSync } from 'zlib';

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
  /** Ein Wert je Spiel - zaehlt nur fuer Teams mit mindestens der Haelfte der meisten Spiele, sonst fuehrt ein einziges gutes Spiel. */
  jeSpiel?: boolean;
  /** Sekunden, angezeigt als "2h 38m". */
  zeit?: boolean;
  /** Steht erst hinter "More" (Betreiber, 8.11.2026: zuerst genau das, was Osirion zeigt). */
  mehr?: boolean;
  wert: (e: CupEintrag, x: Extra | null) => number;
}

/** Werte aus den ausgewerteten Replays (clutch/<Fenster>.json) - je Team die Summe der Spieler; null, wenn nicht alle Spiele gelesen sind. */
interface Extra { erlitten: number; treffer: number; sturm: number; builds: number | null; clutch: number; farm: number | null }

/*
 * Reihenfolge und Titel wie bei Osirion (Betreiber, 8.11.2026: "die Beschriftung genau gleich ... die Reihenfolge genau gleich ... immer ausgeschrieben"): zuerst die zehn,
 * die Osirion zeigt, dann Most Points, der Rest hinter "More". Epics Werte, wo Epic sie fuehrt (Schaden, Elims, Zeit, Strecke, Mats); Treffer, Sturm, Bauteile und
 * Clutch aus den ausgewerteten Replays; Damage Ratio = Epics Schaden durch den Schaden von Spielern aus dem Replay (wie Osirion: Focus 3,47 zu 3,40).
 */
const KATEGORIEN: Kategorie[] = [
  { schluessel: 'quote', symbol: '⚖️', titel: 'Damage Ratio', nachkomma: 2, jeSpiel: true, wert: (e, x) => (x && x.erlitten > 0 ? e.damage / x.erlitten : 0) },
  { schluessel: 'damage', symbol: '📈', titel: 'Damage To Players', wert: (e) => e.damage },
  { schluessel: 'elims', symbol: '🎯', titel: 'Eliminations', wert: (e) => e.elims },
  { schluessel: 'clutch', symbol: '🧊', titel: 'Solo Clutch Points', wert: (_e, x) => x?.clutch ?? 0 },
  { schluessel: 'sturm', symbol: '🌀', titel: 'Time In Storm', zeit: true, wert: (_e, x) => x?.sturm ?? 0 },
  // Ohne doppelt gezaehlte Zeit (zwei Spiele, die sich ueberschneiden - lib/epicCups lebenOhneUeberlappung).
  { schluessel: 'timeAlive', symbol: '⏱️', titel: 'Time Alive', zeit: true, wert: (e) => lebenOhneUeberlappung(e.matches ?? []) ?? e.timeAlive },
  { schluessel: 'strecke', symbol: '🏃', titel: 'Distance Traveled', einheit: 'km', faktor: 1 / 100_000, nachkomma: 1, wert: (e) => e.strecke },
  { schluessel: 'treffer', symbol: '🎯', titel: 'Hits To Players', wert: (_e, x) => x?.treffer ?? 0 },
  // Epics Wert, wo Epic ihn fuehrt; sonst (Reload-Cups) aus den Replays.
  { schluessel: 'matsGefarmt', symbol: '🧱', titel: 'Mats Farmed', wert: (e, x) => e.matsGefarmt || x?.farm || 0 },
  { schluessel: 'builds', symbol: '🏗️', titel: 'Builds Placed', wert: (_e, x) => x?.builds ?? 0 },
  { schluessel: 'points', symbol: '🏆',      titel: 'Most Points',            wert: (e) => e.points },
  { schluessel: 'damageTaken', symbol: '📉', titel: 'Most Damage Taken', mehr: true, wert: (e) => e.damageTaken },
  { schluessel: 'headshots', symbol: '💀', titel: 'Most Headshots', mehr: true, wert: (e) => e.headshots },
  { schluessel: 'wins', symbol: '👑', titel: 'Most Victory Royales', mehr: true, wert: (e) => e.wins },
  { schluessel: 'kd', symbol: '⚔️', titel: 'Best K/D', mehr: true, nachkomma: 2, jeSpiel: true, wert: (e) => e.kd },
  { schluessel: 'avgPlace', symbol: '📍', titel: 'Best Average Placement', mehr: true, kleinBesser: true, nachkomma: 2, jeSpiel: true, wert: (e) => e.avgPlace },
  { schluessel: 'matsVerbaut', symbol: '🔨', titel: 'Most Mats Used', mehr: true, wert: (e) => e.matsVerbaut },
  { schluessel: 'kisten', symbol: '📦', titel: 'Most Chests Opened', mehr: true, wert: (e) => e.kisten },
  { schluessel: 'heilung', symbol: '💊', titel: 'Most Heals Used', mehr: true, wert: (e) => e.heilung },
  { schluessel: 'schild', symbol: '🛡️', titel: 'Most Shields Used', mehr: true, wert: (e) => e.schild },
  // Die Summe belohnt, wer mehr Spiele hatte - daneben der Schnitt je Spiel.
  { schluessel: 'avgTimeAlive', symbol: '⏳', titel: 'Longest Average Time Alive', mehr: true, zeit: true, jeSpiel: true, wert: (e) => e.avgTimeAlive },
];

/** Die ganze Bestenliste, wie sie app/api/cup-leaderboard vorgebaut ablegt - sonst zaehlten die Kacheln nur die ersten hundert (BasCB statt fa wiver bei Distance). */
// Mit dem Stand der Liste: ohne ihn stand bei Solo-Cups kein "Last update / Next update" ueber den Player Stats (Betreiber, 8.11.2026).
async function ganzeListe(w: string): Promise<{ entries: CupEintrag[]; updated?: string } | null> {
  const datei = path.join(DATEN_ORT, 'vorrat', 'bestenliste-ganz', `${w.replace(/[^\w.-]/g, '_')}.json`);
  for (const p of [`${datei}.gz`, datei]) {
    try {
      const roh = await nodeFs.readFile(p);
      const d = JSON.parse((p.endsWith('.gz') ? gunzipSync(roh) : roh).toString('utf8')) as { entries?: CupEintrag[]; updated?: string; gebaut?: number };
      if (d.entries?.length) return { entries: d.entries, updated: d.updated ?? (d.gebaut ? new Date(d.gebaut).toISOString() : undefined) };
    } catch { /* naechste */ }
  }
  return null;
}

/** Die Replay-Werte eines Spieltags je Team (Summe der Spieler) - null, wenn ein Spieler nicht ganz gelesen ist. */
async function extraFuer(w: string): Promise<(e: CupEintrag) => Extra | null> {
  const zb = istZeroBuild(w);
  type D = { erlitten?: number; treffer?: number; sturm?: number; selbstHolz?: number; selbstStein?: number; selbstMetall?: number; invSpiele?: number; farmHolz?: number; farmStein?: number; farmMetall?: number };
  const c = await liesJson<{ schaden?: Record<string, D>; spiele?: Record<string, number>; summe?: Record<string, number> } | null>(`clutch/${w}.json`, null).catch(() => null);
  if (!c?.schaden) return () => null;
  return (e) => {
    const x: Extra = { erlitten: 0, treffer: 0, sturm: 0, builds: 0, clutch: 0, farm: 0 };
    for (const p of e.players) {
      const id = String(p.id ?? '').toLowerCase();
      const d = c.schaden?.[id];
      if (!d || (c.spiele?.[id] ?? 0) < (e.games || 0)) return null;
      x.erlitten += d.erlitten ?? 0; x.treffer += d.treffer ?? 0;
      x.sturm += typeof d.sturm === 'number' && d.sturm < 1e6 ? d.sturm : 0;
      x.clutch += c.summe?.[id] ?? 0;
      if (zb) x.farm = 0;
      else if (x.farm !== null) x.farm = typeof d.farmHolz === 'number' && (d.invSpiele ?? 0) >= (e.games || 0) ? x.farm + (d.farmHolz ?? 0) + (d.farmStein ?? 0) + (d.farmMetall ?? 0) : null;
      if (x.builds !== null) x.builds = typeof d.selbstHolz === 'number' && (d.invSpiele ?? 0) >= (e.games || 0) ? x.builds + (d.selbstHolz ?? 0) + (d.selbstStein ?? 0) + (d.selbstMetall ?? 0) : null;
    }
    return x.erlitten === 0 && x.treffer === 0 ? null : x;
  };
}

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
    // Ein einzelner Spieltag: das ganze Feld aus dem Vorrat der Bestenliste, wenn er schon gebaut ist.
    const vorgebaut = finale || summe || !window_ ? null : await ganzeListe(window_);
    const einzeln = finale || summe || !window_ ? null : vorgebaut ? { entries: vorgebaut.entries, totalPages: 1, updated: vorgebaut.updated }
      : await gecacht(`stats|${event}|${window_}|${limit}`, TTL, () => holeTop(event, window_, limit));
    const extraVon = window_ && !summe && !finale ? await extraFuer(window_) : () => null;
    const extra = new Map<CupEintrag, Extra | null>();
    const ex = (e: CupEintrag) => { if (!extra.has(e)) extra.set(e, extraVon(e)); return extra.get(e) ?? null; };
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
        const v = k.wert(e, ex(e));
        return Number.isFinite(v) && v > 0 && (e.games || 0) >= mindestSpiele;
      });
      // Liefert das Turnier diese Kennzahl nicht, entfaellt die Kategorie.
      if (!mitWert.length) return null;

      const sortiert = [...mitWert].sort((a, b) =>
        k.kleinBesser ? k.wert(a, ex(a)) - k.wert(b, ex(b)) : k.wert(b, ex(b)) - k.wert(a, ex(a)));

      /*
       * Platz in dieser Kennzahl: gleicher angezeigter Wert, gleicher Platz (1, 2, 2, 4). Vorher zaehlte die Kachel nur die Zeilen durch -
       * zwanzig Teams mit 13 Eliminierungen standen auf 5 bis 24, und die Siege (je 1) auf 1 bis 6. "rank" bleibt Epics Gesamtplatz des Teams.
       * Bei den Punkten entscheidet Epics Wertung auch bei gleichen Punkten (Tiebreaker), dort gilt der Gesamtplatz.
       */
      const zeigen = (e: typeof sortiert[number]) => +(k.faktor ? k.wert(e, ex(e)) * k.faktor : k.wert(e, ex(e))).toFixed(k.nachkomma ?? 0);
      const statPlaetze: number[] = [];
      sortiert.forEach((e, i) => { statPlaetze.push(i > 0 && zeigen(sortiert[i - 1]) === zeigen(e) ? statPlaetze[i - 1] : i + 1); });
      const platz = (e: typeof sortiert[number], i: number) => {
        const roh = k.wert(e, ex(e));
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
        zeit: !!k.zeit,
        mehr: !!k.mehr,
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

    /*
     * Die Event-Uebersicht ueber den Kacheln (Betreiber, 8.11.2026, nach Osirions "Event Stats"): Summen ueber den ganzen Spieltag und die Plattformen.
     * Epics Werte, wo Epic sie fuehrt; Treffer, Bauteile und Edits aus den ausgewerteten Replays. Shots fehlen bewusst, bis die Zaehlung im Reload stimmt.
     */
    let ueberblick: Record<string, unknown> | null = null;
    // Auch kumulativ (Betreiber, 8.11.2026): die Spieltage zusammen - Matches addiert, jeder Spieler und seine Plattform nur einmal.
    if (window_ && !finale) {
      type D = { treffer?: number; editZahl?: number; editSek?: number; selbstHolz?: number; selbstStein?: number; selbstMetall?: number };
      type C = { gesamt?: number; matches?: unknown[]; spiele?: Record<string, number>; schaden?: Record<string, D>; plattform?: Record<string, string>; strecke?: Record<string, [number, number]> };
      const dateien = (await Promise.all((summe ? tageListe : [window_]).map((w) => liesJson<C | null>(`clutch/${w}.json`, null).catch(() => null))))
        .filter((x): x is C => !!x);
      const c: C | null = !dateien.length ? null : {
        gesamt: dateien.every((d) => typeof d.gesamt === 'number') ? dateien.reduce((a, d) => a + (d.gesamt ?? 0), 0) : undefined,
        matches: dateien.flatMap((d) => d.matches ?? []),
        spiele: Object.assign({}, ...dateien.map((d) => d.spiele ?? {})),
        plattform: Object.assign({}, ...dateien.map((d) => d.plattform ?? {})),
        strecke: Object.assign({}, ...dateien.map((d) => d.strecke ?? {})),
      };
      const s = dateien.flatMap((d) => Object.values(d.schaden ?? {}));
      const summeVon = (f: (d: D) => number | undefined) => s.reduce((a, d) => a + (f(d) ?? 0), 0);
      const plattformen: Record<string, number> = {};
      for (const v of Object.values(c?.plattform ?? {})) plattformen[v] = (plattformen[v] ?? 0) + 1;
      ueberblick = {
        matches: c?.gesamt ?? null, gelesen: c?.matches?.length ?? null,
        /*
         * Spieler: alle, die in den Replays spielen, sobald (fast) alle gelesen sind - Epics Liste endet bei 10.000 Teams, im Duo also genau 20.000
         * (Betreiber, 8.11.2026: "genau 20.000 bezweifle ich"). Vorher die groessere der beiden Zahlen.
         */
        spieler: c?.gesamt && (c.matches?.length ?? 0) >= c.gesamt * 0.98 ? Object.keys(c.spiele ?? {}).length
          : Math.max(Object.keys(c?.spiele ?? {}).length, eintraege.reduce((a, e) => a + e.players.length, 0)),
        elims: eintraege.reduce((a, e) => a + (e.elims || 0), 0),
        // Bei Team-Cups fuehrt Epic weder Schaden noch Strecke - dann aus den Replays; ohne gelesenes Replay leer statt 0.
        damage: eintraege.reduce((a, e) => a + (e.damage || 0), 0) || (s.length ? summeVon((d) => (d as { dmg?: number }).dmg) : null),
        strecke: eintraege.reduce((a, e) => a + (e.strecke || 0), 0) / 100_000
          || (Object.keys(c?.strecke ?? {}).length ? Object.values(c!.strecke!).reduce((a, [f, l]) => a + (f ?? 0) + (l ?? 0), 0) / 0.685 / 1000 : null),
        // Leer, solange kein Replay gelesen ist (laufender Cup: sonst stuende "Materials Farmed 0" da); im Zero Build nach dem Lesen wirklich 0.
        matsGefarmt: istZeroBuild(window_) ? 0 : eintraege.reduce((a, e) => a + (e.matsGefarmt || 0), 0) || (s.length ? s.reduce((a, d) => a + ((d as { farmHolz?: number }).farmHolz ?? 0) + ((d as { farmStein?: number }).farmStein ?? 0) + ((d as { farmMetall?: number }).farmMetall ?? 0), 0) : null),
        treffer: s.length ? summeVon((d) => d.treffer) : null,
        builds: s.some((d) => typeof d.selbstHolz === 'number') ? summeVon((d) => (d.selbstHolz ?? 0) + (d.selbstStein ?? 0) + (d.selbstMetall ?? 0)) : null,
        // Gelungene Edits wie Osirion (Builds Edited); die Versuche waeren mehr.
        edits: s.some((d) => typeof d.editZahl === 'number') ? summeVon((d) => (d as { editOk?: number }).editOk ?? d.editZahl) : null,
        editStunden: s.some((d) => typeof d.editSek === 'number') ? summeVon((d) => d.editSek) / 3600 : null,
        plattformen,
      };
    }

    return NextResponse.json({
      ueberblick,
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
      { status: login ? 401 : 500 },
    );
  }
}

/** Fuer alle gleich - Vercels Zwischenspeicher beantwortet Wiederholungen (lib/zwischenspeicher). */
export async function GET(request: Request) {
  return zwischenspeichern(await holeRoh(request), 30);
}
