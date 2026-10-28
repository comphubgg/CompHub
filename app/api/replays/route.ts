import { NextResponse } from 'next/server';
import { liesJson } from '@/lib/ablage';
import { AblageNichtErreichbar, abgelegteAntwort, CDN_FRIST, fertigeAntwort, FRISCH_LIVE_MS, ohneDateien } from '@/lib/antwortSpeicher';
import fs from '@/lib/ablageFs';
import path from 'path';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import { DATEN_ORT } from '@/lib/datenOrt';
import { gecacht } from '@/lib/epicCups';
import { GET as katalogAbruf } from '@/app/api/cup-catalog/route';

// Die Replay-Verwaltung.
//
//   GET                        -> Uebersicht aller Turnierfenster
//   GET ?fenster=<windowId>    -> die Matches eines Fensters mit Zustand
//   GET ?match=<matchId>       -> ein einzelnes Match, ausgewertet
//   POST { matchId }           -> ein Match auf Verlangen auswerten (Test)
//
// Lesen darf jeder, der ins Werkzeug kommt - es sind dieselben Zahlen, die
// auch in den Profilen stehen. Das Auswerten auf Verlangen ist dem Admin
// vorbehalten: es laedt bei Epic und kostet Zeit.
//
// Das regelmaessige Einsammeln passiert NICHT hier, sondern planmaessig
// ueber scripts/replays-holen.mjs (siehe instrumentation.ts). Epic haelt ein
// Replay nur 31 Tage vor; ein Werkzeug, das erst sammelt, wenn jemand einen
// Knopf drueckt, sammelt Luecken. Die Funktion hier ist zum Nachsehen und
// Ausprobieren da, nicht fuer den Betrieb.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/*
 * Diese Uebersicht zaehlt jeden Spieltag und jede Runde durch. Auf der Platte
 * dauert das nichts; ueber die Ablage waren es bei Vercel gemessene
 * vierundzwanzig Sekunden - und daran hing die Startseite, denn sie holt von
 * hier die Zahl der ausgewerteten Matches.
 */
export const maxDuration = 60;

const ABLAGE = path.join(DATEN_ORT, 'replays');
const NAMEN_DATEI = path.join(DATEN_ORT, 'spieler-namen.json');

/**
 * Konto-Ids in lesbare Namen uebersetzen.
 *
 * Im Replay stehen nur Ids - und das ist gut so: Namen wechseln von Turnier
 * zu Turnier, die Id nicht. Fuer die Anzeige wird deshalb erst hier
 * nachgeschlagen, im selben Verzeichnis, das auch die Statistikseite nutzt.
 * Wer dort nicht steht, bleibt seine gekuerzte Id - erfunden wird nichts.
 */
async function namenFuer(ids: string[]): Promise<Record<string, string>> {
  let verzeichnis: Record<string, { haupt?: string; namen?: string[] }> = {};
  try {
    verzeichnis = JSON.parse(await fs.readFile(NAMEN_DATEI, 'utf8'));
  } catch { return {}; }

  const raus: Record<string, string> = {};
  for (const id of ids) {
    const e = verzeichnis[id];
    const name = e?.haupt || e?.namen?.[0];
    if (name) raus[id] = name;
  }
  return raus;
}

interface MatchZustand {
  stand: string; zuletzt?: string; elims?: number; konten?: number;
  fehler?: string | null; versuche?: number; bytes?: number;
  zeitpunkt?: string | null; pfad?: string; parserVersion?: string;
}

interface Fensterzustand {
  season: string; windowId: string; eventId?: string; region?: string;
  titel?: string; datum?: number;
  /** Aus den abgelegten Auswertungen erschlossen, nicht vom Sammler geführt. */
  erschlossen?: boolean;
  /** Der Sammler hat dieses Fenster noch nicht begonnen - es steht nur im Katalog. */
  wartet?: boolean;
  matches: Record<string, MatchZustand>;
}

/**
 * Der Zustand eines Fensters - notfalls aus den Dateien erschlossen.
 *
 * Zwei Fenster im Archiv haben ihre _zustand.json verloren, aber 290 und 604
 * fertige Auswertungen liegen daneben. Bisher hiess das: die Uebersicht
 * ueberging sie vollstaendig. Knapp neunhundert ausgewertete Matches waren
 * nirgends zu sehen, obwohl ihre Zahlen laengst in den Statistiken stehen -
 * die Aggregation liest die Dateien und nicht den Zustand.
 *
 * Eine Liste, die stillschweigend Eintraege weglaesst, ist schlimmer als
 * gar keine. Deshalb wird jetzt erschlossen, was dasteht, und die Zeile
 * sagt dazu, dass sie erschlossen ist.
 */
async function liesFenster(season: string, windowId: string, tief = false) {
  try {
    return JSON.parse(await fs.readFile(
      path.join(ABLAGE, season, windowId, '_zustand.json'), 'utf8')) as Fensterzustand;
  } catch {
    const kern = await import('@/lib/replayKern.mjs');
    return (await kern.zustandAusOrdner(season, windowId, tief)) as Fensterzustand | null;
  }
}

/**
 * Welche Runde eines Cups dieses Fenster ist.
 *
 * Ohne diese Angabe standen in der Uebersicht drei Zeilen "OCE Solo Victory
 * Cup 5.9.2026" untereinander und sahen aus wie derselbe Eintrag dreimal.
 * Es sind Runde eins, Runde zwei und die Wiederholung - das steht in der
 * Fensterkennung und musste nur herausgeholt werden.
 */
function rundeName(windowId: string, region?: string) {
  let rest = windowId.replace(/^S\d+_/i, '');
  if (region) rest = rest.replace(new RegExp(`_${region}$`, 'i'), '');
  const teile = rest.split('_').slice(1);
  if (!teile.length) return '';
  return teile.join(' ')
    // "Event1Round2" hat drei Fugen: zwischen Kleinbuchstabe und Grossbuchstabe,
    // zwischen Buchstabe und Ziffer und zwischen Ziffer und Buchstabe. Alle
    // drei braucht es, sonst steht dort "Event 1Round 2".
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Alle Fenster, die schon einmal angefasst wurden. */
async function alleFenster() {
  const raus: Array<Fensterzustand & {
    zaehler: Record<string, number>; gesamt: number; runde: string;
  }> = [];
  let saisons: string[] = [];
  try { saisons = await fs.readdir(ABLAGE); } catch { return raus; }

  for (const season of saisons) {
    let fenster: string[] = [];
    try { fenster = await fs.readdir(path.join(ABLAGE, season)); } catch { continue; }
    for (const windowId of fenster) {
      const z = await liesFenster(season, windowId);
      if (!z) continue;
      const zaehler: Record<string, number> = {};
      for (const m of Object.values(z.matches ?? {})) {
        zaehler[m.stand] = (zaehler[m.stand] ?? 0) + 1;
      }
      raus.push({
        ...z, matches: {}, zaehler,
        gesamt: Object.keys(z.matches ?? {}).length,
        runde: rundeName(z.windowId ?? windowId, z.region),
      });
    }
  }
  raus.sort((a, b) => (b.datum ?? 0) - (a.datum ?? 0));
  return raus;
}

/**
 * Fenster, die laut Katalog ausgewertet werden sollen, der Sammler aber noch nicht begonnen hat.
 *
 * Der Sammler arbeitet das aelteste zuerst (dessen Frist laeuft als erste ab); ein frisches Fenster hat deshalb zunaechst keine Zustandsdatei und stand
 * in der Verwaltung gar nicht da - beim Elite Kado Thorne Cup fehlte so NA Central, obwohl er mitgezaehlt wird (Betreiber, 19.10.2026). Dieselben
 * Regeln wie beim Sammler (lib/replayRegel): welche Cups, welche Runden, innerhalb der Frist von 31 Tagen.
 */
async function wartendeFenster(vorhanden: Set<string>) {
  type KFenster = { windowId?: string; eventId?: string; status?: string; begin?: number; end?: number; istFinale?: boolean };
  type KCup = { id: string; titel: string; regionen?: Record<string, KFenster[]> };
  const raus: Array<Fensterzustand & { zaehler: Record<string, number>; gesamt: number; runde: string }> = [];
  try {
    const regel = await import('@/lib/replayRegel.mjs');
    const katalog = await gecacht('replays|katalog-wartend', 10 * 60_000, async () =>
      (await (await katalogAbruf(new Request('http://localhost/api/cup-catalog?modus=alle'))).json()) as { cups?: KCup[] });
    const grenze = Date.now() - 31 * 864e5;
    for (const cup of katalog.cups ?? []) {
      const r = regel.replayRegel(cup) as string;
      if (r === 'nichts') continue;
      for (const liste of Object.values(cup.regionen ?? {})) {
        const finals = r === 'nurFinals' ? (regel.endrunden(liste) as Set<string>) : null;
        for (const w of liste) {
          if (w.status !== 'vorbei' || !w.windowId || vorhanden.has(w.windowId)) continue;
          if (finals && !finals.has(w.windowId)) continue;
          const ende = w.end ?? w.begin ?? 0;
          const season = /^(S\d+)_/i.exec(w.windowId)?.[1]?.toUpperCase();
          if (!season || ende < grenze) continue;
          const region = /_([A-Z]{2,4})$/.exec(w.windowId)?.[1];
          raus.push({
            season, windowId: w.windowId, matches: {}, zaehler: {}, gesamt: 0, wartet: true,
            eventId: w.eventId, region, titel: cup.titel, datum: ende, runde: rundeName(w.windowId, region),
          } as Fensterzustand & { zaehler: Record<string, number>; gesamt: number; runde: string });
        }
      }
    }
  } catch { /* ohne Katalog bleibt es bei den begonnenen Fenstern */ }
  return raus;
}

/*
 * Die Uebersicht wird hoechstens einmal je Stunde gezaehlt.
 *
 * Nur die Uebersicht: ein einzelnes Fenster ("?fenster=") erschliesst
 * absichtlich tief und gehoert jemandem, der gerade hinsieht - das bleibt
 * frisch. Und alles, was eine Anmeldung braucht, geht ohnehin nicht durch
 * diesen Weg.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (![...url.searchParams.keys()].length) {
    /*
     * Ohne Dateien (Vercel) gibt es die Uebersicht nur fertig aus der
     * Ablage: hier selbst gerechnet waere sie immer leer, und eine leere
     * Uebersicht als frisch abzulegen hiesse, die Zahl auf der Startseite
     * fuer eine Stunde auf einen Strich zu setzen.
     */
    if (ohneDateien()) {
      try {
        const fertig = await abgelegteAntwort<unknown>('replays|uebersicht');
        if (fertig) return NextResponse.json(fertig, { headers: { 'Cache-Control': CDN_FRIST } });
      } catch { /* nicht erreichbar - unten 503 */ }
      return NextResponse.json(
        { success: false, error: 'Die Uebersicht ist gerade nicht erreichbar.' },
        { status: 424, headers: { 'Retry-After': '120', 'Cache-Control': 'no-store' } });
    }
    try {
      const wert = await fertigeAntwort('replays|uebersicht',
        async () => {
          const antwort = await berechne(request);
          if (!antwort.ok) throw new Error(`Antwort ${antwort.status}`);
          return await antwort.json() as unknown;
        },
        // Waehrend eines Cups werden die Replays alle zehn Minuten neu
        // ausgewertet. Mit der langen Frist waere davon nichts zu sehen.
        FRISCH_LIVE_MS);
      return NextResponse.json(wert, {
        headers: { 'Cache-Control': CDN_FRIST },
      });
    } catch (e) {
      if (e instanceof AblageNichtErreichbar) {
        return NextResponse.json({ success: false, error: e.message },
          { status: 424, headers: { 'Retry-After': '120', 'Cache-Control': 'no-store' } });
      }
      return berechne(request);
    }
  }
  return berechne(request);
}

async function berechne(request: Request) {
  const p = new URL(request.url).searchParams;

  const fenster = p.get('fenster');
  if (fenster) {
    const season = p.get('saison') ?? /^(S\d+)_/i.exec(fenster)?.[1]?.toUpperCase() ?? '';
    // Beim Oeffnen wird tief erschlossen: hier will jemand die einzelnen
    // Matches sehen, und dafuer lohnt es, die Dateien wirklich zu lesen.
    const z = await liesFenster(season, fenster, true);
    if (!z) return NextResponse.json({ error: 'unbekanntes Fenster' }, { status: 404 });
    return NextResponse.json({
      success: true,
      fenster: { ...z, matches: undefined,
        runde: rundeName(z.windowId ?? fenster, z.region) },
      matches: Object.entries(z.matches ?? {})
        .map(([matchId, m]) => ({ matchId, ...m }))
        .sort((a, b) => (a.zeitpunkt ?? '').localeCompare(b.zeitpunkt ?? '')),
    });
  }

  /*
   * Der Live-Stand des Sammlers - fuer den Admin, der zusehen will.
   *
   * Zwei Protokolle: die Schleife (replays/_live-lauf.json) mit ihren
   * Durchgaengen und der letzte Sammler-Lauf (replays/_lauf.json) mit den
   * angefassten Fenstern. Beides schreibt der Laufrechner und laedt es mit
   * hoch; hier wird es nur gelesen.
   */
  if (p.get('live')) {
    const [schleife, lauf] = await Promise.all([
      liesJson<Record<string, unknown> | null>('replays/_live-lauf.json', null),
      liesJson<Record<string, unknown> | null>('replays/_lauf.json', null),
    ]);
    return NextResponse.json({ success: true, schleife, lauf, jetzt: Date.now() },
      { headers: { 'Cache-Control': 'no-store' } });
  }

  const match = p.get('match');
  if (match) {
    if (!/^[0-9a-f]{32}$/i.test(match)) {
      return NextResponse.json({ error: 'keine gueltige Match-Id' }, { status: 400 });
    }
    // Die abgelegte Auswertung suchen, ohne den ganzen Baum zu lesen.
    let saisons: string[] = [];
    try { saisons = await fs.readdir(ABLAGE); } catch { /* nichts da */ }
    for (const season of saisons) {
      let fensterListe: string[] = [];
      try { fensterListe = await fs.readdir(path.join(ABLAGE, season)); } catch { continue; }
      for (const w of fensterListe) {
        try {
          const roh = await fs.readFile(
            path.join(ABLAGE, season, w, `${match}.json`), 'utf8');
          return NextResponse.json({ success: true, match: JSON.parse(roh) });
        } catch { /* weitersuchen */ }
      }
    }
    return NextResponse.json({ error: 'noch nicht ausgewertet' }, { status: 404 });
  }

  const begonnen = await alleFenster();
  const wartend = await wartendeFenster(new Set(begonnen.map((f) => String(f.windowId))));
  const alle = [...begonnen, ...wartend].sort((a, b) => (b.datum ?? 0) - (a.datum ?? 0));
  return NextResponse.json({ success: true, fenster: alle });
}

/**
 * Ein Match auf Verlangen auswerten.
 *
 * Fuer den Test einer einzelnen Match-Id, bevor man dem planmaessigen Lauf
 * traut. Das Ergebnis wird bewusst NICHT abgelegt - sonst laege ein Match
 * ohne Turnierbezug in der Ablage, und die Aggregation wuesste nicht, wohin
 * damit.
 */
export async function POST(request: Request) {
  if (!await istAdminAnfrage(request)) {
    return NextResponse.json({ error: 'nur fuer den Admin' }, { status: 403 });
  }

  const koerper = await request.json().catch(() => ({}));
  const matchId = String(koerper.matchId ?? '').trim();
  if (!/^[0-9a-f]{32}$/i.test(matchId)) {
    return NextResponse.json({
      error: 'Eine Match-Id sind 32 Zeichen aus 0-9 und a-f.',
    }, { status: 400 });
  }

  const kern = await import('@/lib/replayKern.mjs');
  try {
    const { vorhanden, metadaten } = await kern.replayVorhanden(matchId);
    if (!vorhanden) {
      return NextResponse.json({
        success: true, gefunden: false, stand: kern.ZUSTAND.NICHT_VORHANDEN,
        hinweis: 'Epic hält Replays 31 Tage vor. Zu diesem Match gibt es keines '
          + '(mehr) — das ist kein Fehler.',
      });
    }

    const begonnen = Date.now();
    const daten = await kern.werteMatchAus(matchId);
    /*
     * Dazu die Aufstellung mit Platz - wo der Leser laeuft (auf dem eigenen
     * Rechner und dem Laufrechner; bei Vercel gibt es die Binaerdatei
     * nicht). Der Betreiber will sehen, welches Team gewonnen hat.
     */
    let lobby: unknown = null;
    if ((process.env.COMPHUB_ABLAGE || '').toLowerCase() !== 'supabase') {
      try { lobby = await kern.leseMatchTief(matchId); } catch { lobby = null; }
    }
    return NextResponse.json({
      success: true, gefunden: true, stand: kern.ZUSTAND.FERTIG,
      dauerMs: Date.now() - begonnen,
      lobby,
      metadaten: {
        zeitpunkt: metadaten.Timestamp ?? null,
        laengeMs: metadaten.LengthInMS ?? null,
        karte: metadaten.FriendlyName ?? null,
      },
      namen: await namenFuer([...(daten.konten ?? []),
        ...(((lobby as { teams?: Array<{ spieler: Array<{ id: string }> }> } | null)?.teams ?? [])
          .flatMap((t) => t.spieler.map((p) => p.id)))]),
      match: { ...daten, lobby },
    });
  } catch (e) {
    return NextResponse.json({
      success: false, stand: kern.ZUSTAND.FEHLGESCHLAGEN,
      error: (e as Error).message,
    }, { status: 424 });
  }
}
