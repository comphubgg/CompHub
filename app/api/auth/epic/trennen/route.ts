import { NextRequest, NextResponse } from 'next/server';
import { aendern, kontoAus, nachId } from '@/lib/konten';
import { GAST_COOKIE } from '@/lib/epicGast';
import { vipAus } from '@/lib/vipCookie';
import { zugangEpicSetzen } from '@/lib/vipZugaenge';

// Die Verknuepfung mit Epic Games wieder loesen.
//
// Geloest wird nur, was der Spieler selbst ueber Epic bestaetigt hat. Eine
// Zuweisung durch den Betreiber bleibt - sie zu aendern ist seine Sache.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Der Gast-Cookie (Verifizierung ohne Konto) - beim Trennen immer mit weg. */
const ohneGast = (a: NextResponse) => { a.cookies.set(GAST_COOKIE, '', { path: '/', maxAge: 0 }); return a; };

export async function POST(req: NextRequest) {
  const kontoId = kontoAus(req.cookies.get('streamer_dashboard_konto')?.value);
  const konto = kontoId ? await nachId(kontoId) : null;
  // Ohne CompHub-Konto gibt es nur die Verifizierung im Cookie - die darf jeder loeschen.
  if (!konto || konto.gesperrt) {
    // Mit Schluessel angemeldet: die Bestaetigung steht am Zugang (Betreiber, 30.10.2026: 'ich soll auch wieder entconnecten koennen').
    const schluessel = vipAus(req.cookies.get('streamer_dashboard_auth')?.value);
    if (schluessel) await zugangEpicSetzen(schluessel, { epicId: '', epicVerifiziert: false, epicName: '', epicFreunde: [], epicFreundeStand: 0 }).catch(() => false);
    return ohneGast(NextResponse.json({ ok: true, gast: true }));
  }
  if (!konto.epicVerifiziert) {
    return NextResponse.json(
      { fehler: 'Diese Verknüpfung hat der Betreiber gesetzt und kann nur von ihm geändert werden.' },
      { status: 403 });
  }
  await aendern(konto.id, { epicId: '', epicVerifiziert: false, epicFreunde: [], epicFreundeStand: 0 });
  return ohneGast(NextResponse.json({ ok: true }));
}
