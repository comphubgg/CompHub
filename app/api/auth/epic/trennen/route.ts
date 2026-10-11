import { NextRequest, NextResponse } from 'next/server';
import { aendern, kontoAus, nachId } from '@/lib/konten';

// Die Verknuepfung mit Epic Games wieder loesen.
//
// Geloest wird nur, was der Spieler selbst ueber Epic bestaetigt hat. Eine
// Zuweisung durch den Betreiber bleibt - sie zu aendern ist seine Sache.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const kontoId = kontoAus(req.cookies.get('streamer_dashboard_konto')?.value);
  const konto = kontoId ? await nachId(kontoId) : null;
  if (!konto || konto.gesperrt) {
    return NextResponse.json({ fehler: 'Nicht angemeldet.' }, { status: 401 });
  }
  if (!konto.epicVerifiziert) {
    return NextResponse.json(
      { fehler: 'Diese Verknüpfung hat der Betreiber gesetzt und kann nur von ihm geändert werden.' },
      { status: 403 });
  }
  await aendern(konto.id, { epicId: '', epicVerifiziert: false });
  return NextResponse.json({ ok: true });
}
