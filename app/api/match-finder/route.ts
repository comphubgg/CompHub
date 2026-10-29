import { NextResponse } from 'next/server';
import { vipWerkzeug, wer } from '@/lib/pov';
import { finde } from '@/lib/matchFinder';
import { getToken } from '@/lib/epicCups';

/*
 * Der Match-ID-Finder fuer VIPs (lib/matchFinder): GET ?ids=<Konto>,<Konto> (hoechstens zwoelf) - je Spieler das laufende Match (Match-ID zum Zuschauen im
 * Spiel) und die gespielten Matches der laufenden und eben beendeten Cups. Nur fuer VIPs und den Admin; der Admin bekommt dazu den Rohwert von Epics
 * "liveSessions", bis feststeht, wie Epic ihn waehrend eines Cups fuellt.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const nie = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  const ich = await wer();
  if (!ich.idents.length || !(ich.vip || ich.rolle === 'admin')) {
    return NextResponse.json({ ok: false, error: 'Nur für VIPs.' }, { status: 403, headers: nie });
  }
  if (!vipWerkzeug(ich, 'matchfinder')) return NextResponse.json({ ok: false, error: 'Für dein Konto nicht freigeschaltet.' }, { status: 403, headers: nie });
  // ?name=<Epic-Name>: das Konto zu einem genauen Anzeigenamen (fuer Spieler, die die Szene-Suche nicht kennt - etwa aus offenen Cups).
  const name = (new URL(request.url).searchParams.get('name') ?? '').trim();
  if (name) {
    if (name.length < 3 || name.length > 40) return NextResponse.json({ ok: true, treffer: null }, { headers: nie });
    try {
      const { token } = await getToken();
      // Fortnite-Namen tragen oft ǃ statt ! - wer "flickzy 10!" tippt, meint "flickzy 10ǃ". Beide Schreibweisen nachschlagen.
      const varianten = [...new Set([name, name.replace(/!/g, 'ǃ'), name.replace(/ǃ/g, '!')])];
      let j: { id?: string; displayName?: string } | null = null;
      for (const v of varianten) {
        const r = await fetch(`https://account-public-service-prod.ol.epicgames.com/account/api/public/account/displayName/${encodeURIComponent(v)}`,
          { headers: { Authorization: token }, cache: 'no-store', signal: AbortSignal.timeout(8_000) });
        j = r.ok ? await r.json() as { id?: string; displayName?: string } : null;
        if (j?.id) break;
      }
      return NextResponse.json({ ok: true, treffer: j?.id ? { id: j.id, name: j.displayName ?? name } : null }, { headers: nie });
    } catch {
      return NextResponse.json({ ok: true, treffer: null }, { headers: nie });
    }
  }
  const ids = [...new Set((new URL(request.url).searchParams.get('ids') ?? '').split(',')
    .map((x) => x.replace(/-/g, '').trim().toLowerCase()).filter((x) => /^[0-9a-f]{32}$/.test(x)))].slice(0, 12);
  if (!ids.length) return NextResponse.json({ ok: true, cups: [], spieler: {} }, { headers: nie });
  try {
    // Die Namen der Favoriten (gleiche Reihenfolge wie ids) - fuer die Anmeldelisten der Scrims, die nur Discord-Namen fuehren.
    const namenListe = (new URL(request.url).searchParams.get('namen') ?? '').split('|');
    const namen = Object.fromEntries(ids.map((id, i) => [id, (namenListe[i] ?? '').slice(0, 40)]));
    const r = await finde(ids, ich.rolle === 'admin', namen);
    return NextResponse.json({ ok: true, jetzt: Date.now(), ...r }, { headers: nie });
  } catch {
    // Kein 5xx: der Lastverteiler hielte es fuer einen Ausfall des Servers.
    return NextResponse.json({ ok: false, error: 'Epic antwortet gerade nicht.' }, { status: 424, headers: nie });
  }
}
