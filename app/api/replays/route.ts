import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
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
  matches: Record<string, MatchZustand>;
}

async function liesFenster(season: string, windowId: string) {
  try {
    return JSON.parse(await fs.readFile(
      path.join(ABLAGE, season, windowId, '_zustand.json'), 'utf8')) as Fensterzustand;
  } catch {
    return null;
  }
}

/** Alle Fenster, die schon einmal angefasst wurden. */
async function alleFenster() {
  const raus: Array<Fensterzustand & { zaehler: Record<string, number> }> = [];
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
      raus.push({ ...z, matches: {}, zaehler });
    }
  }
  raus.sort((a, b) => (b.datum ?? 0) - (a.datum ?? 0));
  return raus;
}

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;

  const fenster = p.get('fenster');
  if (fenster) {
    const season = p.get('saison') ?? /^(S\d+)_/i.exec(fenster)?.[1]?.toUpperCase() ?? '';
    const z = await liesFenster(season, fenster);
    if (!z) return NextResponse.json({ error: 'unbekanntes Fenster' }, { status: 404 });
    return NextResponse.json({
      success: true,
      fenster: { ...z, matches: undefined },
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
