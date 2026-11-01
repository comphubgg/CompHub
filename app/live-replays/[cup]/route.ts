import { NextResponse } from 'next/server';
import { replayIndex, nachSpieltag, neuesterTag } from '@/lib/replayVoll';

/*
 * /live-replays/<Cup>: immer der neueste Spieltag dieses Cups - die Adresse aendert sich nie, auch wenn der Cup weiterlaeuft und neue
 * Tage dazukommen (der Betreiber, 13.10.2026: "die URL muss immer gleich bleiben"; fuer jeden Cup einzeln, mehrere gleichzeitig).
 * <Cup> ist die Kurzform der Ereignis-Kennung ("mannekenpis_official") oder der Anfang einer Fenster-Kennung.
 *
 * Eine echte Weiterleitung (307), keine Seite: so folgt ihr auch ein Link in Discord oder ein Lesezeichen ohne Umweg.
 */

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ cup: string }> }) {
  const { cup } = await params;
  // Antwortet die Ablage nicht, ist das kein unbekannter Cup: die Uebersicht zeigt dann "gerade nicht erreichbar" statt still leer zu wirken.
  let index: Awaited<ReturnType<typeof replayIndex>>;
  try { index = await replayIndex(); } catch {
    return new NextResponse(null, { status: 307, headers: { Location: '/replays?quelle=aus' } });
  }
  const t = neuesterTag(nachSpieltag(index), decodeURIComponent(cup));
  const ziel = t ? `/replays/${encodeURIComponent(t.windowId)}` : '/replays';
  return new NextResponse(null, { status: 307, headers: { Location: ziel } });
}
