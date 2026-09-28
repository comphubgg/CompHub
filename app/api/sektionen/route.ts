import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { kontoAus, nachId } from '@/lib/konten';
import { istBetreiber, vipAus } from '@/lib/vipCookie';
import { zugangNach, rechteVon } from '@/lib/vipZugaenge';
import { schreibGrund } from '@/lib/schreibfehler';
import { HINWEISE, SEKTIONEN, type Staende, type Zustand } from '@/lib/sektionen';
import { liesStaende, schreibeStaende } from '@/lib/sektionen-ablage';

/*
 * Der Zustand der Hauptbereiche.
 *
 *   GET   -> was gilt, dazu die Auskunft, ob der Fragende Admin ist
 *   POST  -> umschalten (nur Admin)
 *
 * Die Auskunft ist bewusst oeffentlich: die Kopfzeile jedes Besuchers muss
 * wissen, was sie zeigen darf. Sie verraet nichts, was nicht ohnehin zu
 * sehen waere - hoechstens, dass es einen Bereich gibt, der gerade nicht
 * offen ist. Wer Admin ist, steht mit dabei, damit die Oberflaeche nicht an
 * zwei Stellen fragen muss.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const KONTO_COOKIE = 'streamer_dashboard_konto';
const VIP_COOKIE = 'streamer_dashboard_auth';

async function istAdmin(): Promise<boolean> {
  const laden = await cookies();

  const id = kontoAus(laden.get(KONTO_COOKIE)?.value);
  if (id) {
    const k = await nachId(id);
    if (k && !k.gesperrt && k.rolle === 'admin') return true;
  }

  const wert = laden.get(VIP_COOKIE)?.value;
  if (istBetreiber(wert)) return true;

  const name = vipAus(wert);
  if (name) return rechteVon(await zugangNach(name)).rolle === 'admin';
  return false;
}

/*
 * Wie lange Vercels Zwischenspeicher die Staende ausliefert, ohne die
 * Funktion zu wecken. Jede offene Seite fragt im Takt nach; seit der Sperre
 * vom 27.9.2026 (Rechenzeit aufgebraucht) beantwortet das der Speicher, und
 * gerechnet wird hoechstens einmal in zehn Sekunden je Region.
 */
const ZWISCHENSPEICHER = 'max-age=10, stale-while-revalidate=60';

export async function GET(request: Request) {
  // Nur die Staende - fuer alle gleich, also zwischenspeicherbar. Ob der
  // Besucher Admin ist, weiss die Seite schon vom ersten Abruf.
  if (new URL(request.url).searchParams.get('nur') === 'staende') {
    return NextResponse.json({ ok: true, staende: await liesStaende() }, {
      headers: { 'Vercel-CDN-Cache-Control': ZWISCHENSPEICHER, 'Cache-Control': 'no-store' },
    });
  }
  const [staende, admin] = await Promise.all([liesStaende(), istAdmin()]);
  return NextResponse.json({
    ok: true,
    admin,
    sektionen: SEKTIONEN,
    hinweise: HINWEISE,
    staende,
  });
}

export async function POST(request: Request) {
  if (!await istAdmin()) {
    return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 403 });
  }

  const koerper = await request.json().catch(() => ({}));
  const schluessel = String(koerper.schluessel ?? '');
  if (!SEKTIONEN.some((s) => s.schluessel === schluessel)) {
    return NextResponse.json({ fehler: 'unbekannter Bereich' }, { status: 400 });
  }

  const zustand = koerper.zustand as Zustand;
  if (zustand !== 'online' && zustand !== 'standby' && zustand !== 'offline') {
    return NextResponse.json({ fehler: 'unbekannter Zustand' }, { status: 400 });
  }

  const staende: Staende = await liesStaende();
  const vorher = staende[schluessel];

  staende[schluessel] = {
    zustand,
    hinweis: HINWEISE.some((h) => h.schluessel === koerper.hinweis)
      ? String(koerper.hinweis) : vorher.hinweis,
    /*
     * Ein eigener Text ueberschreibt die Auswahl - aber nur, solange etwas
     * drinsteht. Ein geleertes Feld heisst "wieder der ausgewaehlte Text",
     * nicht "eine leere Seite".
     */
    eigenerTitel: typeof koerper.eigenerTitel === 'string'
      ? (koerper.eigenerTitel.trim().slice(0, 120) || undefined)
      : vorher.eigenerTitel,
    eigenerText: typeof koerper.eigenerText === 'string'
      ? (koerper.eigenerText.trim().slice(0, 600) || undefined)
      : vorher.eigenerText,
    geaendert: Date.now(),
  };

  try {
    await schreibeStaende(staende);
  } catch (e) {
    return NextResponse.json({ fehler: schreibGrund(e, 'data/sektionen.json') },
      { status: 500 });
  }

  return NextResponse.json({ ok: true, staende });
}
