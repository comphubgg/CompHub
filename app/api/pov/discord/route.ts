import { NextResponse } from 'next/server';
import { liesPros, wer } from '@/lib/pov';
import { mitgliederSuchen } from '@/lib/povDiscord';
import { botGilden, einladungsLink, liesGilden, richteAlleEin } from '@/lib/discordGilden';

/*
 * Discord fuer Profis.
 *
 *   GET ?q=<Name>        Mitglieder des CompHub-Discord-Servers suchen (hoechstens zehn Treffer { id, name, anzeige }),
 *                        damit ein Profi sein Discord-Konto zuweisen kann; mindestens drei Zeichen.
 *   GET ?aktion=gilden   die Server, auf denen CompHub ist: ob dort ein Meldungs-Kanal gewaehlt ist und ob der
 *                        Profi dort ankuendigen laesst - plus der Link, CompHub auf einen weiteren Server einzuladen.
 *
 * Nur fuer Profis und den Admin.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const nie = { 'Cache-Control': 'no-store' };
let letzterAbgleich = 0;

export async function GET(request: Request) {
  const ich = await wer();
  if (ich.rolle !== 'pro' && ich.rolle !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Nur für Profis.' }, { status: 403, headers: nie });
  }
  const p = new URL(request.url).searchParams;
  if (p.get('aktion') === 'gilden') {
    try {
      // Frisch eingeladene Server gleich einrichten, nicht erst beim naechsten Zeitplan-Lauf (hoechstens einmal je Minute).
      if (Date.now() - letzterAbgleich > 60_000) {
        letzterAbgleich = Date.now();
        const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'www.thecomphub.com';
        await richteAlleEin(/^(localhost|127\.0\.0\.1|0\.0\.0\.0)/.test(host) ? 'https://www.thecomphub.com' : `https://${host}`);
      }
      const liste = await botGilden();
      if (!liste) return NextResponse.json({ ok: false, error: 'Discord antwortet nicht.' }, { status: 502, headers: nie });
      const stand = await liesGilden();
      const mein = (await liesPros())[ich.idents[0] ?? ''];
      const aktiv = new Set(mein?.gilden ?? []);
      return NextResponse.json({
        ok: true,
        einladung: await einladungsLink(),
        gilden: liste.map((g) => ({
          id: g.id, name: g.name,
          kanal: Boolean(stand[g.id]?.ankuendigung),
          eingerichtet: Boolean(stand[g.id]?.kanal),
          fehler: stand[g.id]?.fehler ?? '',
          aktiv: aktiv.has(g.id),
        })),
      }, { headers: nie });
    } catch {
      return NextResponse.json({ ok: false, error: 'Discord antwortet nicht.' }, { status: 502, headers: nie });
    }
  }
  const q = (p.get('q') ?? '').trim();
  if (q.length < 3) return NextResponse.json({ ok: true, treffer: [] }, { headers: nie });
  try {
    return NextResponse.json({ ok: true, treffer: await mitgliederSuchen(q) }, { headers: nie });
  } catch {
    return NextResponse.json({ ok: false, error: 'Discord antwortet nicht.' }, { status: 502, headers: nie });
  }
}
