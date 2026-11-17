import { speicher } from '@/lib/ablage';
import { finestAnfrageErlaubt, FINEST_DATEIEN, FINEST_KOEPFE, FINEST_ORDNER } from '@/lib/finestZugang';

/*
 * The partner's files for the Finest Creative overlays - PRIVATE.
 *
 *   /api/finest/datei/logo.png | bg.mp4 | thumb.jpg
 *     signed in with the "finest" tick (configurator, control page), or
 *     ?id=<overlay>&k=<view key> of a live Finest overlay (OBS has no login).
 *
 * The files live in the private data archive (comphub-daten,
 * partner/finest/...), not in public/ and not at a release. Anyone else gets
 * a 404. Range requests are answered so the clip plays in every browser.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function nichts() {
  return new Response('Not found', { status: 404, headers: { ...FINEST_KOEPFE, 'Content-Type': 'text/plain; charset=utf-8' } });
}

export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const art = Object.prototype.hasOwnProperty.call(FINEST_DATEIEN, name) ? FINEST_DATEIEN[name] : null;
  if (!art || !(await finestAnfrageErlaubt(request))) return nichts();
  let daten: Buffer | null = null;
  try { daten = await speicher.lies(`${FINEST_ORDNER}/${name}`); } catch { daten = null; }
  if (!daten) return nichts();

  const koepfe: Record<string, string> = {
    ...FINEST_KOEPFE,
    // The browser may keep it for the session; no shared cache ever does.
    'Cache-Control': 'private, max-age=3600',
    'Content-Type': art,
    'Accept-Ranges': 'bytes',
  };
  const bereich = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '');
  if (bereich && (bereich[1] || bereich[2])) {
    const groesse = daten.length;
    let start = bereich[1] ? Number(bereich[1]) : Math.max(0, groesse - Number(bereich[2]));
    let ende = bereich[1] && bereich[2] ? Number(bereich[2]) : groesse - 1;
    ende = Math.min(ende, groesse - 1);
    if (start > ende || start >= groesse) {
      return new Response(null, { status: 416, headers: { ...koepfe, 'Content-Range': `bytes */${groesse}` } });
    }
    start = Math.max(0, start);
    return new Response(new Uint8Array(daten.subarray(start, ende + 1)), {
      status: 206,
      headers: { ...koepfe, 'Content-Range': `bytes ${start}-${ende}/${groesse}`, 'Content-Length': String(ende - start + 1) },
    });
  }
  return new Response(new Uint8Array(daten), { headers: { ...koepfe, 'Content-Length': String(daten.length) } });
}
