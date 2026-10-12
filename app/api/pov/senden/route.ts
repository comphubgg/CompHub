import { NextResponse } from 'next/server';
import { liesPros, meldeLive, sichereProEintrag, wer } from '@/lib/pov';
import { beendeAnkuendigung } from '@/lib/discordGilden';
import {
  STUECK_MAX, beende, legeAb, markiereGemeldet, markiereStromGemeldet, stromFragment, stromStart,
} from '@/lib/povRelay';

/*
 * Der Profi schickt ein Stueck seines Bildes (siehe lib/povRelay.ts).
 *
 *   POST  Rumpf = die Bytes des Stuecks, Kopf "X-Pov-Mime" = Aufnahmeart   -> { ok, seq, zuschauer }
 *   POST  mit "X-Pov-Mode: fmp4" (der Strom, siehe lib/povRelay.ts):
 *           "X-Pov-Init: 1"  der Rumpf ist das Init-Segment, "X-Pov-Mime" die Aufnahmeart
 *           "X-Pov-Key: 1"   das Fragment beginnt mit einem Schluesselbild
 *   POST  ?ende=1                                                           Teilen beendet (auch per sendBeacon)
 *   DELETE                                                                  Teilen beendet
 *
 * Nur ein Profi (oder der Admin) - und nur fuer sich selbst: die Kennung kommt aus der Anmeldung.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const nie = { 'Cache-Control': 'no-store' };
const MIME = /^video\/(mp4|webm)(;\s*codecs=[\w.,"' -]+)?$/i;

/*
 * Wer sendet - kurz gemerkt.
 *
 * Der Strom schickt etwa zehn Anfragen je Sekunde; jedes Mal die Anmeldung gegen die Kontenablage zu pruefen
 * waere zu viel. Gemerkt wird fuer zwanzig Sekunden, je Cookie - nimmt der Betreiber die Rolle weg, greift
 * es spaetestens dann.
 */
const gemerkt = new Map<string, { bis: number; ident: string; rolle: string | null; name: string }>();

async function ichKurz(request: Request) {
  const cookie = request.headers.get('cookie') ?? '';
  const da = gemerkt.get(cookie);
  if (da && da.bis > Date.now()) return da;
  const ich = await wer();
  const e = { bis: Date.now() + 20_000, ident: ich.idents[0] ?? '', rolle: ich.rolle, name: ich.name };
  if (cookie) {
    if (gemerkt.size > 40) gemerkt.clear();
    gemerkt.set(cookie, e);
  }
  return e;
}

export async function POST(request: Request) {
  const ich = await ichKurz(request);
  if (ich.rolle !== 'pro' && ich.rolle !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Nur für Profis.' }, { status: 403, headers: nie });
  }
  const ident = ich.ident;
  if (!ident) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401, headers: nie });

  if (new URL(request.url).searchParams.get('ende')) {
    beende(ident);
    void liesPros().then((alle) => beendeAnkuendigung(ident, alle[ident]?.name || ich.name)).catch(() => undefined);
    return NextResponse.json({ ok: true }, { headers: nie });
  }

  // Der Strom: Init-Segment und Fragmente.
  if (request.headers.get('x-pov-mode') === 'fmp4') {
    const bytes = Buffer.from(await request.arrayBuffer());
    if (!bytes.length || bytes.length > STUECK_MAX) {
      return NextResponse.json({ ok: false, error: 'Leeres oder zu großes Stück.' }, { status: 400, headers: nie });
    }
    if (request.headers.get('x-pov-init') === '1') {
      const mime = (request.headers.get('x-pov-mime') ?? '').trim();
      if (!MIME.test(mime)) return NextResponse.json({ ok: false, error: 'Unbekannte Aufnahmeart.' }, { status: 400, headers: nie });
      const r = stromStart(ident, mime, bytes);
      if (r.neuBeginn) {
        markiereStromGemeldet(ident);
        try {
          const pro = await sichereProEintrag(ident, ich.name);
          if (pro?.gilden?.length) {
            const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'www.thecomphub.com';
            const daheim = /^(localhost|127\.0\.0\.1)/.test(host);
            void meldeLive({ ...pro, name: pro.name || ich.name }, `${daheim ? 'http' : 'https'}://${host}`);
          }
        } catch { /* die Meldung ist ein Zusatz */ }
      }
      return NextResponse.json({ ok: true, zuschauer: 0 }, { headers: nie });
    }
    const r = stromFragment(ident, request.headers.get('x-pov-key') === '1', bytes);
    if (!r.ok) return NextResponse.json({ ok: false, error: 'Kein Strom — bitte neu beginnen.' }, { status: 409, headers: nie });
    return NextResponse.json({ ok: true, zuschauer: r.zuschauer }, { headers: nie });
  }

  const mime = (request.headers.get('x-pov-mime') ?? '').trim();
  if (!MIME.test(mime)) return NextResponse.json({ ok: false, error: 'Unbekannte Aufnahmeart.' }, { status: 400, headers: nie });

  const laenge = Number(request.headers.get('content-length') ?? 0);
  if (laenge > STUECK_MAX) return NextResponse.json({ ok: false, error: 'Stück zu groß.' }, { status: 413, headers: nie });
  const bytes = Buffer.from(await request.arrayBuffer());
  if (!bytes.length || bytes.length > STUECK_MAX) {
    return NextResponse.json({ ok: false, error: 'Leeres oder zu großes Stück.' }, { status: 400, headers: nie });
  }

  const r = legeAb(ident, mime, bytes);
  if (r.neuBeginn) {
    // Gerade angefangen: dem Discord des Profis Bescheid geben (einmal je Beginn).
    markiereGemeldet(ident);
    try {
      const pro = await sichereProEintrag(ident, ich.name);
      if (pro?.gilden?.length) {
        const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'www.thecomphub.com';
        const daheim = /^(localhost|127\.0\.0\.1)/.test(host);
        void meldeLive({ ...pro, name: pro.name || ich.name }, `${daheim ? 'http' : 'https'}://${host}`);
      }
    } catch { /* die Meldung ist ein Zusatz */ }
  }
  return NextResponse.json({ ok: true, seq: r.seq, zuschauer: r.zuschauer }, { headers: nie });
}

export async function DELETE() {
  const ich = await wer();
  if (ich.rolle !== 'pro' && ich.rolle !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Nur für Profis.' }, { status: 403, headers: nie });
  }
  const ident = ich.idents[0];
  if (ident) {
    beende(ident);
    void liesPros().then((alle) => beendeAnkuendigung(ident, alle[ident]?.name || ich.name)).catch(() => undefined);
  }
  return NextResponse.json({ ok: true }, { headers: nie });
}
