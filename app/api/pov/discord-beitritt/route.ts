import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { holeDienst } from '@/lib/dienstZugaenge';
import { rueckwegVon } from '@/lib/oeffentlicheAdresse';
import { sitzungsDomain } from '@/lib/cookieDomain';
import { liesPros, wer } from '@/lib/pov';
import { proNews } from '@/lib/discord';

/*
 * Ein Pro tritt dem CompHub-Discord bei (lib/discord proBeitreten).
 *
 *   GET             zu Discord (Rechte "identify guilds.join") - Discord laesst niemanden ohne seine Zustimmung auf einen Server, das ist der eine Klick;
 *                   zurueck ueber den Rueckweg der Anmeldung (app/api/auth/discord/callback), erkennbar am Cookie discord_oauth_art=pro
 *   POST { news }   die oeffentlichen Kanaele (News, Ergebnisse, Live) in Discord ein- oder ausblenden (Rolle "Pro News")
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const ich = await wer();
  if (ich.rolle !== 'pro') return NextResponse.redirect(new URL('/pov', req.url));
  const { id } = await holeDienst('discord');
  if (!id) return NextResponse.redirect(new URL('/pov?discord=fehler', req.url));
  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: id, redirect_uri: rueckwegVon(req, '/api/auth/discord/callback'), response_type: 'code', scope: 'identify guilds.join', state, prompt: 'consent',
  });
  const antwort = NextResponse.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
  const optionen = { ...sitzungsDomain(req), httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 600 };
  antwort.cookies.set('discord_oauth_state', state, optionen);
  antwort.cookies.set('discord_oauth_art', 'pro', optionen);
  return antwort;
}

export async function POST(req: NextRequest) {
  const ich = await wer();
  const p = (await liesPros())[ich.idents[0] ?? ''];
  if (ich.rolle !== 'pro' || !p?.discordId) return NextResponse.json({ ok: false, error: 'Erst Discord beitreten.' }, { status: 409 });
  const b = await req.json().catch(() => ({})) as { news?: boolean };
  const ok = await proNews(p.discordId, Boolean(b.news));
  return NextResponse.json(ok ? { ok: true } : { ok: false, error: 'Discord antwortet gerade nicht.' }, { status: ok ? 200 : 424 });
}
