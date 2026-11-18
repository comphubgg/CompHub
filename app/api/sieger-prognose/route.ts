import { NextResponse } from 'next/server';
import {
  gecacht, holeSeite, cupsGruppiert, archivCups, REGIONEN, EpicLoginNoetig,
  type CupFensterDetail,
} from '@/lib/epicCups';
import { holeKatalog } from '@/lib/cupWertung';
import { wertungMitRueckfall, type Regel } from '@/lib/wertungRueckfall';
import { zwischenspeichern } from '@/lib/zwischenspeicher';

/*
 * Die Sieger-Prognose fuer Finals ohne Weiterkommen (Betreiber, 18.11.2026, FNCS Solos Reload Finals EU: "COMPHUB PREDICTION ~109 Points" ergibt in einem
 * Finale keinen Sinn - "for a final, either predict 1st place or nothing"). Die ~109 waren Platz 40 (der letzte Platz mit Preisgeld) der S42 FNCS Solos
 * Finals, also einer Battle-Royale-Lobby mit 100 Spielern und 6 Spielen, fuer ein Reload-Finale mit 40 Spielern und 10 Spielen.
 *
 * Statt einer Grenze: die Punkte, mit denen Platz 1 voraussichtlich gewinnt - aus Epics Bestenlisten frueherer Finals, die wirklich vergleichbar sind:
 *   - dieselbe Stufe (Finale ohne Weiterkommen, keine Last Chance Lobby, kein Heat),
 *   - dieselbe Teamgroesse (Solo/Duo/Trio/Squad),
 *   - derselbe Modus (Reload oder Battle Royale, Bauen oder Zero Build),
 *   - dieselbe Punktetabelle (Platzierungs- und Eliminationspunkte; ist eine der beiden Tabellen unbekannt, zaehlt das Finale nicht),
 *   - vor dem Beginn dieses Finales abgeschlossen.
 * Reihenfolge: dieselbe Reihe in derselben Region, dieselbe Runde in anderen Regionen (gleiche Saison, gleiche Insel), dann andere Finals desselben Modus
 * in derselben Region. Hoechstens sechs. Gerechnet wird je Spiel (Punkte von Platz 1 / Spiele des Finales), der Median davon mal die Spiele dieses Finales.
 * Weniger als zwei vergleichbare Finals: keine Prognose - die Seite zeigt dann keine Kachel.
 *
 * Waehrend das Finale laeuft: die Punkte des Fuehrenden hochgerechnet auf alle Spiele (sein Tempo), mit der Vorab-Prognose gewichtet nach dem Anteil
 * gespielter Spiele - nie unter dem, was der Fuehrende schon hat.
 *
 *   ?window=S43_FNCSSoloReload_Final_EU&region=EU
 */

export const revalidate = 0;

const HOECHSTENS = 6;
const MINDESTENS = 2;
/** Bis eine halbe Stunde nach dem Ende gilt ein Spieltag als laufend (wie app/api/qualifikation). */
const NACHLAUF = 30 * 60_000;

type Fenster = CupFensterDetail & { titel?: string };

/** Die Teamgroesse aus Playlist und Kennung. */
function groesse(f: { playlist?: string; windowId: string; eventId: string }): string {
  const q = `${f.playlist ?? ''} ${f.windowId} ${f.eventId}`;
  if (/solo/i.test(q)) return 'solo';
  if (/trio/i.test(q)) return 'trio';
  if (/squad/i.test(q)) return 'squad';
  if (/duo/i.test(q)) return 'duo';
  return '?';
}

/** Reload oder Battle Royale, Bauen oder Zero Build, nur Touch - verschiedene Insel, verschiedene Lobbygroesse, verschiedenes Tempo. */
function modus(f: { playlist?: string; windowId: string; eventId: string; nurTouch?: boolean; titel?: string }): string {
  const q = `${f.playlist ?? ''} ${f.windowId} ${f.eventId} ${f.titel ?? ''}`;
  const reload = /_RE_|reload/i.test(q);
  const zb = /nobuild|zerobuild|zero build|_ZB_|_ZB\b|\bZB\b/i.test(q);
  return `${reload ? 'reload' : 'br'}|${zb ? 'zb' : 'bauen'}|${f.nurTouch ? 'touch' : ''}`;
}

/** Ein Finale ohne Weiterkommen: Epics Finale (Marke oder Name), keine Last Chance, kein Heat, keine Qualifikationsplaetze und keine Runde danach. */
function istSiegerFinale(f: Fenster, alle: Fenster[]): boolean {
  if (!/final/i.test(f.windowId) || /lastchance|lcq|heat/i.test(f.windowId)) return false;
  if (f.qualifiziert || f.sofortPunkte) return false;
  /*
   * Vergibt das Finale eine Marke, die ein spaeteres Fenster verlangt (Epics Auszahlungstabelle -> Zugangsbedingung), geht es weiter - dann ist es kein
   * Endpunkt. Ausgenommen weitere Tage desselben Finales (Day 1 -> Day 2). Spaetere Wochen desselben Events (Divisional Cup Week 1..4 Final) zaehlen nur,
   * wenn sie die Marke wirklich verlangen.
   */
  const tagMuster = (w: string) => w.replace(/Day\d+/i, 'Day#');
  const marken = new Set((f.marken ?? []).map((m) => m.token));
  return !alle.some((g) => g.begin > f.begin && tagMuster(g.windowId) !== tagMuster(f.windowId) && (g.tokens ?? []).some((t) => marken.has(t)));
}

/** Die Kennung ohne Season, Region und Tag - dieselbe Reihe ueber Saisons. */
function reihe(windowId: string): string {
  return windowId.replace(/^S\d+_/i, '').replace(/_(EU|NAC|NAW|BR|ASIA|ME|OCE|GLOBAL)$/i, '').replace(/Day\d+/i, 'Day#').toLowerCase();
}

/** Die Punktetabelle als Vergleichsschluessel (Reihenfolge egal). */
function tabellenSchluessel(w: Regel[]): string {
  return w.map((r) => `${r.was}|${r.regel}|${r.schwelle}|${r.punkte}|${r.jeStueck ? 1 : 0}`).sort().join(';');
}

const regionVon = (windowId: string) => /_(EU|NAC|NAW|BR|ASIA|ME|OCE)$/i.exec(windowId)?.[1]?.toUpperCase() ?? null;

async function platzEins(f: Fenster): Promise<{ punkte: number; spiele: number } | null> {
  const saison = /^S\d+/.exec(f.windowId)?.[0] ?? '';
  const lesen = (event: string) => holeSeite(event, f.windowId, 0, true);
  const seite = await lesen(f.eventId).catch(async (e) => {
    // Das Archiv fuehrt manches alte Fenster unter einer anderen Event-Kennung (siehe app/api/qualifikation).
    const zweite = f.eventId.replace(/S\d+/, saison);
    if (zweite === f.eventId) throw e;
    return lesen(zweite);
  });
  const erster = seite.entries.find((e) => e.rank === 1);
  if (!erster || !(erster.points > 0)) return null;
  return { punkte: erster.points, spiele: erster.games ?? 0 };
}

function median(x: number[]): number {
  const s = [...x].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

async function holeRoh(request: Request) {
  const p = new URL(request.url).searchParams;
  const window_ = p.get('window');
  const region = (p.get('region') ?? regionVon(window_ ?? '') ?? 'EU').toUpperCase();
  if (!window_) return NextResponse.json({ error: 'window ist noetig' }, { status: 400 });

  // Die Kataloge aller Regionen (fuer dieselbe Runde anderswo), dazu das Archiv fuer fruehere Saisons. Der Katalog geht vor: im Archiv stehen bei manchen
  // Fenstern Zeiten einer anderen Region.
  let katalog: Fenster[] = [];
  try {
    const listen = await Promise.all(REGIONEN.map((r) => gecacht(`catalog|${r}`, 5 * 60_000, () => cupsGruppiert([r]))
      .catch((e) => { if (r === region) throw e; return []; })));
    katalog = listen.flatMap((cups) => cups.flatMap((c) => Object.values(c.regionen).flat().map((f) => ({ ...f, titel: c.titel }) as Fenster)));
  } catch (e) {
    const login = e instanceof EpicLoginNoetig;
    return NextResponse.json({ error: (e as Error).message, needsLogin: login }, { status: login ? 401 : 502 });
  }
  const nachId = new Map<string, Fenster>();
  for (const f of katalog) if (!nachId.has(f.windowId)) nachId.set(f.windowId, f);
  try {
    const archiv = await gecacht('sieger-archiv', 30 * 60_000, () => archivCups(new Set()));
    for (const c of archiv) for (const f of Object.values(c.regionen).flat()) {
      if (!nachId.has(f.windowId)) nachId.set(f.windowId, { ...f, titel: c.titel } as Fenster);
    }
  } catch { /* ohne Archiv nur die laufende Saison */ }
  const alle = [...nachId.values()];
  const dieser = nachId.get(window_);
  if (!dieser) return NextResponse.json({ vorhanden: false, ohneWeiterkommen: false, hinweis: 'Dieser Spieltag steht nicht in Epics Liste.' });

  if (!istSiegerFinale(dieser, alle)) {
    return NextResponse.json({ vorhanden: false, ohneWeiterkommen: false, hinweis: 'Kein Finale ohne Weiterkommen - dort gilt die Qualifikationsgrenze.' });
  }

  const jetzt = Date.now();
  const cap = dieser.matchCap ?? 0;
  const g = groesse(dieser);
  const m = modus(dieser);
  const ende = (f: Fenster) => (typeof f.end === 'number' ? f.end : null);

  let eigeneTabelle = '';
  try {
    const r = regionVon(dieser.windowId) ?? region;
    eigeneTabelle = tabellenSchluessel((await wertungMitRueckfall(await holeKatalog(r), dieser.windowId, dieser.eventId)).wertung);
  } catch { /* unbekannt */ }

  const kandidaten = alle.filter((f) => {
    // Archivzeilen ohne Ende: nur, was als vorbei gefuehrt wird.
    const e = ende(f) ?? (f.status === 'vorbei' ? f.begin : null);
    return f.windowId !== dieser.windowId && e !== null && e <= dieser.begin && e + NACHLAUF < jetzt
      && (f.matchCap ?? 0) > 0 && groesse(f) === g && modus(f) === m && istSiegerFinale(f, alle);
  });
  const eigeneRegion = new RegExp(`_${region}$`, 'i');
  const rundeOhneRegion = dieser.windowId.replace(/_[A-Z]+$/, '');
  const neueste = (l: Fenster[]) => [...l].sort((a, b) => b.begin - a.begin);
  const reiheIst = reihe(dieser.windowId);
  const geordnet = [...new Set([
    ...neueste(kandidaten.filter((f) => eigeneRegion.test(f.windowId) && reihe(f.windowId) === reiheIst)),
    ...neueste(kandidaten.filter((f) => f.windowId.replace(/_[A-Z]+$/, '') === rundeOhneRegion)),
    ...neueste(kandidaten.filter((f) => eigeneRegion.test(f.windowId))),
  ])];

  const finals: Array<{ windowId: string; titel: string | null; region: string | null; datum: number; punkte: number; spiele: number }> = [];
  for (const f of geordnet) {
    if (finals.length >= HOECHSTENS) break;
    try {
      // Dieselbe Punktetabelle - ist eine unbekannt, laesst sich das nicht belegen, und das Finale zaehlt nicht.
      const tabelle = tabellenSchluessel((await wertungMitRueckfall(await holeKatalog(regionVon(f.windowId) ?? region), f.windowId, f.eventId)).wertung);
      if (!eigeneTabelle || !tabelle || tabelle !== eigeneTabelle) continue;
      const eins = await gecacht(`sieger|${f.eventId}|${f.windowId}`, 6 * 3_600_000, () => platzEins(f));
      if (!eins) continue;
      // Gespielte Spiele des Siegers, sonst das Spiellimit des Finales.
      const spiele = eins.spiele > 0 ? Math.min(eins.spiele, f.matchCap ?? eins.spiele) : (f.matchCap ?? 0);
      if (!spiele) continue;
      finals.push({ windowId: f.windowId, titel: f.titel ?? null, region: regionVon(f.windowId), datum: f.begin, punkte: eins.punkte, spiele });
    } catch { /* naechstes Finale */ }
  }

  const jeSpiel = finals.length >= MINDESTENS && cap > 0 ? median(finals.map((f) => f.punkte / f.spiele)) : null;
  const vorab = jeSpiel !== null ? Math.round(jeSpiel * cap) : null;

  // Laeuft das Finale (oder ist es vorbei): der Stand von Platz 1.
  const laeuft = dieser.begin <= jetzt && (typeof dieser.end === 'number' ? jetzt <= dieser.end + NACHLAUF : dieser.status === 'live');
  const vorbei = !laeuft && typeof dieser.end === 'number' && jetzt > dieser.end + NACHLAUF;
  let fuehrend: { punkte: number; spiele: number } | null = null;
  if (laeuft || vorbei) {
    try { fuehrend = await platzEins(dieser); } catch { /* ohne Stand */ }
  }
  let wert = vorab;
  let live: { punkte: number; spiele: number; hochgerechnet: number | null; gewicht: number; fertig: boolean } | null = null;
  if (laeuft && fuehrend && cap > 0) {
    const gespielt = Math.min(fuehrend.spiele, cap);
    const fertig = gespielt >= cap;
    const hoch = gespielt > 0 ? Math.round(fuehrend.punkte / gespielt * cap) : null;
    // Ohne gemessene Kurve fuer Sieger: die Hochrechnung zaehlt mit dem Anteil gespielter Spiele, der Rest ist die Vorab-Prognose.
    const gewicht = fertig ? 1 : vorab === null ? 1 : gespielt / cap;
    const roh = hoch === null ? vorab : vorab === null ? hoch : gewicht * hoch + (1 - gewicht) * vorab;
    wert = roh === null ? null : Math.max(fuehrend.punkte, Math.round(roh));
    // Ohne Vorab und nach weniger als zwei Spielen ist das Tempo noch keine Auskunft.
    if (vorab === null && gespielt < 2 && !fertig) wert = null;
    live = { punkte: fuehrend.punkte, spiele: gespielt, hochgerechnet: hoch, gewicht: Math.round(gewicht * 100) / 100, fertig };
  }

  return NextResponse.json({
    ohneWeiterkommen: true,
    vorhanden: wert !== null,
    /* Die Prognose fuer Platz 1 - waehrend des Finales live, sonst vorab. */
    wert, vorab, jeSpiel: jeSpiel !== null ? Math.round(jeSpiel * 10) / 10 : null, spiele: cap,
    format: g, modus: m,
    /* Woraus sie besteht: die vergleichbaren Finals mit den Punkten ihres Siegers. */
    finals, grundlage: finals.length,
    laeuft, live,
    /* Nach dem Finale: was Platz 1 wirklich hatte. */
    tatsaechlich: vorbei && fuehrend ? fuehrend.punkte : null,
    hinweis: wert === null ? 'Zu wenige vergleichbare Finals (gleiches Format, gleicher Modus, gleiche Punktetabelle).' : null,
  });
}

export async function GET(request: Request) {
  return zwischenspeichern(await holeRoh(request), 20);
}
