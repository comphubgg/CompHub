import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { richteAlleEin, raeumeVerwaiste } from '@/lib/discordGilden';
import { istLive } from '@/lib/povRelay';
import { liesPros } from '@/lib/pov';
import { pruefeDiscordLive } from '@/lib/povDiscord';

/*
 * Alle zehn Minuten (Ablauf "Discord live" der GitHub-Aktion):
 *   - Server einrichten, auf die CompHub neu eingeladen wurde (Kanal "comphub-dashboard" anlegen),
 *   - Live-Meldungen von POVs abraeumen, die nicht mehr senden (Verbindung gerissen, kein Ende-Aufruf).
 *
 * Die Seite laeuft ohne Hintergrundvorgaenge und hat keine dauernde Verbindung zu Discord - deshalb dieser Anstoss
 * von aussen. Geschuetzt durch CRON_SECRET - und, weil es das in dieser Umgebung nicht gibt, durch den Bot-Schluessel
 * (den der Ablauf ohnehin aus ENV_LOCAL kennt): wer ihn nicht hat, kommt nicht hinein.
 */

function gleich(a: string, b: string): boolean {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const bearer = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const schluessel = [process.env.CRON_SECRET, process.env.DISCORD_BOT_TOKEN].map((x) => (x ?? '').trim()).filter(Boolean);
  const erlaubt = Boolean(bearer) && schluessel.some((k) => gleich(bearer, k));
  if (!erlaubt) return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 401 });
  try {
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'www.thecomphub.com';
    const seite = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)/.test(host) ? 'https://www.thecomphub.com' : `https://${host}`;
    const gilden = await richteAlleEin(seite);
    const pros = await liesPros();
    const namen = Object.fromEntries(Object.values(pros).map((p) => [p.ident, p.name]));
    const abgeraeumt = await raeumeVerwaiste(istLive, namen);
    // Wer von den Profis gerade in einem Sprachkanal streamt, wird gemeldet (und wer aufgehoert hat, durchgestrichen).
    for (const p of Object.values(pros)) await pruefeDiscordLive(p);
    return NextResponse.json({ ok: true, gilden, abgeraeumt });
  } catch (e) {
    return NextResponse.json({ ok: false, fehler: (e as Error).message }, { status: 503 });
  }
}
