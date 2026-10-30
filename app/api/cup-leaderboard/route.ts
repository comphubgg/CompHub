import { NextResponse } from 'next/server';
import {
  gecacht, holeTop, holeBereich, findeSpieler, ergaenzeBilder, EpicLoginNoetig, frischeFuer,
} from '@/lib/epicCups';
import { zwischenspeichern } from '@/lib/zwischenspeicher';
import nodeFs from 'fs/promises';
import path from 'path';
import { DATEN_ORT } from '@/lib/datenOrt';

/*
 * Die ganze Bestenliste eines fertigen Spieltags auf einmal (Betreiber, 30.10.2026: "dass direkt mindestens die Top 10.000 angezeigt werden ... nicht
 * loaded 1000, loaded 1500, loaded 2500"). Ein vorbei gegangener Spieltag aendert sich nicht mehr: einmal ganz geholt (hundert Seiten bei Epic, im
 * Hintergrund), liegt er als Datei auf der Platte des Servers und kommt danach in einer einzigen Antwort. Laufende Spieltage laden weiter in Stufen.
 */
const GANZ_ORDNER = path.join(DATEN_ORT, 'vorrat', 'bestenliste-ganz');
const imBau = new Set<string>();
const ganzDatei = (w: string) => path.join(GANZ_ORDNER, `${w.replace(/[^\w.-]/g, '_')}.json`);
async function ganzLesen(w: string) {
  try { return JSON.parse(await nodeFs.readFile(ganzDatei(w), 'utf8')) as { entries: unknown[]; updated?: string; totalPages?: number }; }
  catch { return null; }
}
function ganzBauen(event: string, w: string) {
  if (imBau.has(w)) return;
  imBau.add(w);
  void (async () => {
    try {
      let alle: unknown[] = []; let gesamt = 0; let updated: string | undefined;
      for (let von = 0; von < 100; von += 25) {
        const d = await holeBereich(event, w, von, 25) as { entries?: unknown[]; totalPages?: number; updated?: string };
        alle = alle.concat(d.entries ?? []);
        gesamt = d.totalPages ?? gesamt; updated ??= d.updated;
        if (!(d.entries ?? []).length || von + 25 >= (d.totalPages ?? 0)) break;
      }
      if (!alle.length) return;
      await nodeFs.mkdir(GANZ_ORDNER, { recursive: true });
      await nodeFs.writeFile(ganzDatei(w), JSON.stringify({ entries: alle, totalPages: gesamt, updated: updated ?? new Date().toISOString() }));
    } catch { /* naechster Aufruf versucht es wieder */ } finally { imBau.delete(w); }
  })();
}
import { abgesagtFuer, ohneAbgesagte } from '@/lib/abgesagt';
import { holeKatalog, regionAus, wertungVon, type WertungsRegel } from '@/lib/cupWertung';
import { GLOBALS_EVENT, GLOBALS_TAGE, istGlobalsEvent, istGlobalsFenster } from '@/lib/globalsCup';
import type { CupEintrag } from '@/lib/epicCups';

/** Die Wertungstabelle eines Spieltags - ohne sie keine Rundenpunkte. */
async function wertungFuer(event: string, windowId: string): Promise<WertungsRegel[]> {
  try { return wertungVon(await holeKatalog(regionAus(windowId)), windowId, event); } catch { return []; }
}

/**
 * Abgesagte Runden herausrechnen (lib/abgesagt) - nur wenn der Admin fuer
 * diesen Spieltag eine abgesagt hat.
 */
async function bereinigt<T extends { entries?: unknown[]; totalPages?: number }>(
  daten: T, event: string, windowId: string,
): Promise<T & { punkteUnsicher?: boolean; abgesagt?: string[] }> {
  const abgesagt = await abgesagtFuer(windowId);
  if (!abgesagt.size || !Array.isArray(daten.entries)) return daten;
  const wertung = await wertungFuer(event, windowId);
  const { eintraege, punkteUnsicher } = ohneAbgesagte(
    daten.entries as CupEintrag[], abgesagt, wertung, (daten.totalPages ?? 1) <= 1);
  return { ...daten, entries: eintraege, punkteUnsicher, abgesagt: [...abgesagt] };
}

/**
 * Das Finale der Globals: Day 1 und Day 2 zusammengerechnet.
 *
 * Der Katalogeintrag "FNCS Global Championship" hat bei Epic keine eigene
 * Bestenliste - es ist ein LAN, gespielt an zwei Tagen unter
 * "Fortnite Global Championship". Der Betreiber (28.9.2026): "Das sind
 * einfach die Leaderboards von ... Fortnite Global Championship, einfach
 * beide Tage zusammengerechnet." Abgesagte Runden sind schon abgezogen.
 */
async function globalsGesamt() {
  return tageGesamt(GLOBALS_EVENT, GLOBALS_TAGE.map((t) => t.windowId));
}

/**
 * Mehrere Spieltage eines Events zusammengerechnet (Day 1 + Day 2): Punkte, Siege, Eliminierungen und Spiele je Team addiert,
 * neu nach Punkten gereiht. Die Globals sind der Sonderfall mit eigenem Aufruf; ?windows=a,b macht es fuer jedes Finale.
 */
async function tageGesamt(event: string, windows: string[]) {
  const tage = await Promise.all(windows.map(async (w) => {
    const d = await gecacht(`bereich|${event}|${w}|0|2`, TTL,
      () => holeBereich(event, w, 0, 2));
    return bereinigt(d, event, w);
  }));
  const nach = new Map<string, CupEintrag>();
  for (const d of tage) {
    for (const e of (d.entries ?? []) as CupEintrag[]) {
      const k = e.players.map((p) => p.id).sort().join('|');
      const da = nach.get(k);
      if (!da) { nach.set(k, { ...e, matches: [...e.matches], players: [...e.players] }); continue; }
      da.points += e.points; da.elims += e.elims; da.games += e.games; da.wins += e.wins;
      da.damage += e.damage; da.damageTaken += e.damageTaken; da.headshots += e.headshots;
      da.timeAlive += e.timeAlive; da.matches.push(...e.matches);
      if (e.bestPlace !== null && (da.bestPlace === null || e.bestPlace < da.bestPlace)) da.bestPlace = e.bestPlace;
    }
  }
  const eintraege = [...nach.values()].map((e) => {
    const spiele = Math.max(1, e.games);
    const plaetze = e.matches.map((m) => m.placement).filter((x): x is number => typeof x === 'number');
    return {
      ...e, avgPoints: e.points / spiele, avgElims: e.elims / spiele,
      avgPlace: plaetze.length ? plaetze.reduce((a, b) => a + b, 0) / plaetze.length : e.avgPlace,
    };
  }).sort((a, b) => b.points - a.points || b.wins - a.wins || b.avgElims - a.avgElims || a.avgPlace - b.avgPlace);
  eintraege.forEach((e, i) => { e.rank = i + 1; });
  return {
    eventId: event, windowId: 'gesamt', page: 0, totalPages: 1,
    updated: tage.map((d) => d.updated).filter(Boolean).sort().pop() ?? '',
    liveSessions: null, entries: eintraege, zusammengerechnet: windows,
    punkteUnsicher: tage.some((d) => d.punkteUnsicher),
  };
}

// Live-Leaderboard eines Cups.
//   ?event=…&window=…            -> Top-Liste
//   &limit=100                    -> wie viele Plaetze
//   &von=5&seiten=10              -> nur dieser Ausschnitt (Seiten 5 bis 14)
//   &q=name1,name2                -> nur diese Spieler (Namenssuche)
//   &ids=abc,def                  -> nur diese Account-IDs (eindeutig)
//
// Route Handlers sind in dieser Next-Version nicht gecacht - richtig so,
// die Zwischenspeicherung passiert bewusst in epicCups.

const TTL = 45_000;

/*
 * Wie lange die Anfrage laufen darf.
 *
 * Ohne diese Zeile gilt Vercels Vorgabe von zehn Sekunden. Ein tiefer Abruf
 * ist damit nicht zu schaffen - fuenftausend Plaetze sind fuenfzig Seiten bei
 * Epic und dazu zehntausend aufzuloesende Namen. Die Folge war nicht etwa
 * eine langsame Tabelle, sondern gar keine: die Anfrage wurde mitten im
 * Abruf abgeschnitten, und in der Anzeige blieb es bei den ersten
 * fuenfhundert Plaetzen. Wer dann jemanden auf Platz zweitausend suchte,
 * fand ihn nie.
 *
 * Sechzig Sekunden sind das Hoechste, was der kostenlose Tarif hergibt.
 */
export const maxDuration = 60;

async function holeRoh(request: Request) {
  const { searchParams } = new URL(request.url);
  const event = searchParams.get('event');
  const window_ = searchParams.get('window');
  const mehrere = (searchParams.get('windows') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  // Von Hand neu geladen (VIP-Knopf): die Zwischenspeicher dieses Spieltags verwerfen.
  if (searchParams.get('frisch') === '1') for (const w of window_ ? [window_] : mehrere) frischeFuer(w);

  if (!event || (!window_ && mehrere.length < 2)) {
    return NextResponse.json(
      { error: 'event und window sind noetig' },
      { status: 400 },
    );
  }

  const namen = (searchParams.get('q') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const ids = (searchParams.get('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  // Bis zu zehntausend Plaetze. Darueber wird die Tabelle unbrauchbar,
  // und Epic gibt ohnehin nicht mehr Seiten heraus.
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100', 10) || 100, 10_000);

  try {
    // Mehrere Spieltage zusammen (Day 1 + Day 2 eines Finales).
    if (mehrere.length > 1) return NextResponse.json(await ergaenzeBilder(await tageGesamt(event, mehrere)));
    if (!window_) return NextResponse.json({ error: 'window fehlt' }, { status: 400 });
    // Das Finale der Globals: beide Tage zusammen (siehe globalsGesamt).
    if (istGlobalsEvent(event) && !istGlobalsFenster(window_)) {
      const daten = await globalsGesamt();
      return NextResponse.json(await ergaenzeBilder(daten));
    }
    if (namen.length || ids.length) {
      const key = `find|${event}|${window_}|${namen.join(',').toLowerCase()}|${ids.join(',')}`;
      const daten = await gecacht(key, TTL, () => findeSpieler(event, window_, namen, ids));
      return NextResponse.json(await ergaenzeBilder(await bereinigt(daten, event, window_)));
    }

    /*
     * Ein Ausschnitt statt der ganzen Liste.
     *
     * Damit holt die Seite die Bestenliste in Stuecken und haengt sie
     * aneinander, statt zehntausend Plaetze in einer einzigen Anfrage zu
     * verlangen, die ohnehin in der Zeitgrenze endet.
     */
    // Ganz (nur fuer vorbei gegangene Spieltage, die Seite fragt es nur dort): aus dem Vorrat - fehlt er, wird er im Hintergrund gebaut.
    if (searchParams.get('ganz') === '1') {
      const vorrat = searchParams.get('frisch') === '1' ? null : await ganzLesen(window_);
      if (!vorrat) { ganzBauen(event, window_); return NextResponse.json({ entries: [], fehlt: true }); }
      return NextResponse.json(await ergaenzeBilder(await bereinigt(vorrat as { entries: CupEintrag[]; totalPages?: number; updated?: string }, event, window_)));
    }

    const von = parseInt(searchParams.get('von') ?? '', 10);
    if (Number.isFinite(von) && von >= 0) {
      const seiten = Math.min(
        Math.max(parseInt(searchParams.get('seiten') ?? '10', 10) || 10, 1), 25);
      const key = `bereich|${event}|${window_}|${von}|${seiten}`;
      const daten = await gecacht(key, TTL,
        () => holeBereich(event, window_, von, seiten));
      return NextResponse.json(await ergaenzeBilder(await bereinigt(daten, event, window_)));
    }

    // namen=0: nur Konto-Ids, keine Namensaufloesung bei Epic (siehe holeSeite).
    const ohneNamen = searchParams.get('namen') === '0';
    const key = `top|${event}|${window_}|${limit}|${ohneNamen ? 'ids' : 'namen'}`;
    const daten = await bereinigt(await gecacht(key, TTL, () => holeTop(event, window_, limit, ohneNamen)), event, window_);
    return NextResponse.json(ohneNamen ? daten : await ergaenzeBilder(daten));
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
  return zwischenspeichern(await holeRoh(request), 20);
}
