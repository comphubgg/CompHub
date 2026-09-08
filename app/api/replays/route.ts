import { NextResponse } from 'next/server';
import { fertigeAntwort } from '@/lib/antwortSpeicher';
import fs from '@/lib/ablageFs';
import path from 'path';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import { DATEN_ORT } from '@/lib/datenOrt';

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
    try {
      const wert = await fertigeAntwort('replays|uebersicht',
        async () => {
          const antwort = await berechne(request);
          if (!antwort.ok) throw new Error(`Antwort ${antwort.status}`);
          return await antwort.json() as unknown;
        });
      return NextResponse.json(wert, {
        headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=3600' },
      });
    } catch {
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

  return NextResponse.json({ success: true, fenster: await alleFenster() });
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
    return NextResponse.json({
      success: true, gefunden: true, stand: kern.ZUSTAND.FERTIG,
      dauerMs: Date.now() - begonnen,
      metadaten: {
        zeitpunkt: metadaten.Timestamp ?? null,
        laengeMs: metadaten.LengthInMS ?? null,
        karte: metadaten.FriendlyName ?? null,
      },
      namen: await namenFuer(daten.konten ?? []),
      match: daten,
    });
  } catch (e) {
    return NextResponse.json({
      success: false, stand: kern.ZUSTAND.FEHLGESCHLAGEN,
      error: (e as Error).message,
    }, { status: 502 });
  }
}
