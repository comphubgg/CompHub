import { finestAnfrageErlaubt, FINEST_KOEPFE } from '@/lib/finestZugang';
import { FC_HTML } from '@/lib/finest/fcSeite';

/*
 * The Finest Creative scoreboard itself - PRIVATE (lib/finestZugang).
 *
 *   /overlays/finest/live?id=<id>&k=<view key>   OBS / a browser tab, no login
 *   /overlays/finest/live?vorschau=<json>         the configurator preview (tick)
 *
 * Without a valid key (or the tick) it answers a plain 404, as if the address
 * did not exist. Never cached by a CDN.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  if (!(await finestAnfrageErlaubt(request))) {
    return new Response('Not found', { status: 404, headers: { ...FINEST_KOEPFE, 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  return new Response(FC_HTML, {
    headers: {
      ...FINEST_KOEPFE,
      'Content-Type': 'text/html; charset=utf-8',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
