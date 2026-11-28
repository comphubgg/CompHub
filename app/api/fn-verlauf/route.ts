import { NextResponse } from 'next/server';
import { mitSpeicher } from '@/lib/fnEpic';
import { inselCode } from '@/lib/fnInseln';
import { inselVerlauf, verlaufZustand } from '@/lib/fnVerlauf';
import { zwischenspeichern } from '@/lib/zwischenspeicher';

/*
 * Der lange Verlauf einer Insel oder eines Epic-Modus, selbst aufgezeichnet seit dem 28.11.2026 (Inselseite des neuen Hubs).
 *
 *   GET ?code=<code>[&von=<ms|ISO>][&bis=<ms|ISO>]
 *   -> { code, start, seit, stand, stunden: [[t, spieler]], peak: { wert, t } | null, discover: [[t, reihe, platz]], reihen: { <reihe>: <titel> } }
 *
 *   start     wann die Aufzeichnung begann (ms) - null: noch nichts aufgezeichnet. Aelteres gibt es nicht; die Seite soll das so sagen.
 *   seit      wann dieser Code zum ersten Mal gesehen wurde (ms)
 *   stunden   je Stunde der hoechste Stand (Beginn der Stunde in ms), nur Stunden, in denen der Code mit Zahl in Epics Entdecken stand
 *   peak      der Hoechststand seit Beginn der Aufzeichnung (unabhaengig von von/bis), t = Beginn der Stunde
 *   discover  je Stunde jede Reihe, in der der Code stand, mit dem besten Platz der Stunde (ab 1); reihen nennt die Titel
 *
 * Voreinstellung fuer von/bis: alles seit Beginn bis jetzt. Quelle und Ablage: lib/fnVerlauf (Takt von lib/fnEntdecken).
 *
 *   GET ?zustand=1 -> was dieser Server noch nicht ins Archiv geschrieben hat, wann zuletzt geschrieben wurde und der letzte Fehler (zum Nachsehen).
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const zeit = (roh: string | null): number | null => {
  if (!roh) return null;
  const n = /^\d+$/.test(roh) ? Number(roh) : Date.parse(roh);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get('zustand')) return NextResponse.json(verlaufZustand(), { headers: { 'Cache-Control': 'no-store' } });
  const code = inselCode(searchParams.get('code') ?? '');
  if (!code) return NextResponse.json({ error: 'code= fehlt oder ist kein Insel-Code (1234-5678-9012) oder Epic-Code (experience_br)' }, { status: 400 });
  const von = zeit(searchParams.get('von'));
  const bis = zeit(searchParams.get('bis'));
  try {
    // Fuenf Minuten je Code und Stunde des Zeitraums: der Takt schreibt ohnehin nur alle fuenf Minuten einen neuen Stand.
    const stunde = (ms: number | null) => (ms === null ? '' : String(Math.floor(ms / 3_600_000)));
    const v = await mitSpeicher(`fn-verlauf|${code}|${stunde(von)}|${stunde(bis)}`, 5 * 60_000, () => inselVerlauf(code, von, bis));
    return zwischenspeichern(NextResponse.json({ ...v, stand: new Date().toISOString() }, { headers: { 'Cache-Control': 'public, max-age=300' } }), 300);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
