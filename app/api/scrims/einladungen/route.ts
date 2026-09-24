import { NextResponse } from 'next/server';
import { SCRIM_SERVER } from '@/lib/scrimServer';

/*
 * Wie viele Mitglieder die Scrim-Server haben - von Discord selbst.
 *
 * Fortnite Tracker zeigt unter jedem Server seine Mitgliederzahl, und der
 * Betreiber wollte die Seite "genau so". Discord gibt sie zu jeder
 * Einladung ohne Anmeldung und ohne Schluessel heraus
 * (GET /api/v10/invites/<code>?with_counts=true) - kostenlos, und die Zahl
 * ist echt, keine Schaetzung von uns.
 *
 * Gefragt wird nur fuer die Einladungen aus lib/scrimServer, nie fuer
 * beliebige: diese Route ist kein offener Durchgang zu Discord. Und nur
 * einmal die Stunde - Discord drosselt, und eine Mitgliederzahl aendert
 * sich nicht im Minutentakt.
 *
 * Antwortet Discord nicht, fehlt die Zahl. Sie wird nie zu 0.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Zahlen { mitglieder: number; online: number | null }

const STUNDE = 3600_000;
let stand: { zeit: number; zahlen: Record<string, Zahlen> } | null = null;

async function eine(code: string): Promise<Zahlen | null> {
  try {
    const r = await fetch(`https://discord.com/api/v10/invites/${encodeURIComponent(code)}?with_counts=true`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const d = await r.json() as { approximate_member_count?: number; approximate_presence_count?: number };
    if (typeof d.approximate_member_count !== 'number') return null;
    return {
      mitglieder: d.approximate_member_count,
      online: typeof d.approximate_presence_count === 'number' ? d.approximate_presence_count : null,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  if (!stand || Date.now() - stand.zeit > STUNDE) {
    const zahlen: Record<string, Zahlen> = {};
    // Nacheinander statt alle auf einmal - Discord drosselt schnell.
    for (const s of SCRIM_SERVER) {
      const z = await eine(s.code);
      if (z) zahlen[s.code] = z;
    }
    // Ein ganz leerer Stand wird nicht gemerkt: dann fragt der naechste
    // Aufruf noch einmal, statt eine Stunde lang nichts zu zeigen.
    if (Object.keys(zahlen).length) stand = { zeit: Date.now(), zahlen };
    else return NextResponse.json({ zahlen: {} }, { headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({ zahlen: stand.zahlen }, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  });
}
