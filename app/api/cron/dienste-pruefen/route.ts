import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { holeDienst, type Dienst } from '@/lib/dienstZugaenge';

/*
 * Stimmen die eingetragenen Zugangsdaten der Anmeldedienste? (Betreiber, 30.10.2026: "sag mir, ob das wirklich der Client ist ... ich habe die schon
 * mehrmals eingegeben und es funktioniert nie".) Je Dienst eine Anfrage mit den Daten, die der Server wirklich benutzt (Ablage vor Umgebung,
 * lib/dienstZugaenge) - heraus geht nur, ob der Dienst sie annimmt, und die ersten Zeichen der Client-Id; nie ein Secret.
 *
 *   Epic, Twitch, Discord: client_credentials - ein Schluessel kommt nur mit richtiger Id und richtigem Secret.
 *   Google: Tausch mit falschem Code - "invalid_grant" heisst Client und Secret stimmen, "invalid_client"/"unauthorized_client" heisst falsch.
 *
 * Geschuetzt wie die anderen Anstoesse von aussen: CRON_SECRET oder der Bot-Schluessel.
 */

function gleich(a: string, b: string): boolean {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function pruefe(d: Dienst): Promise<{ ok: boolean; woher: string; id: string; antwort: string }> {
  const { id, secret, woher } = await holeDienst(d);
  const kurz = id ? `${id.slice(0, 6)}…` : '';
  if (!id || !secret) return { ok: false, woher, id: kurz, antwort: 'nichts eingetragen' };
  const form = (o: Record<string, string>) => new URLSearchParams(o);
  try {
    let r: Response;
    if (d === 'epic') {
      r = await fetch('https://api.epicgames.dev/epic/oauth/v2/token', {
        method: 'POST', body: form({ grant_type: 'client_credentials' }),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}` },
      });
    } else if (d === 'twitch') {
      r = await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', body: form({ client_id: id, client_secret: secret, grant_type: 'client_credentials' }) });
    } else if (d === 'discord') {
      r = await fetch('https://discord.com/api/oauth2/token', { method: 'POST', body: form({ grant_type: 'client_credentials', scope: 'identify' }),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}` } });
    } else {
      r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: form({ client_id: id, client_secret: secret, code: '4/0AVMBsJpruefung', grant_type: 'authorization_code', redirect_uri: 'https://thecomphub.com/api/auth/google/callback' }) });
      const t = await r.text();
      return { ok: /invalid_grant/i.test(t), woher, id: kurz, antwort: t.replace(/\s+/g, ' ').slice(0, 120) };
    }
    const t = await r.text();
    // Nur Ja/Nein und der Fehlertext - der Schluessel selbst bleibt hier.
    return { ok: r.ok && /access_token/.test(t), woher, id: kurz, antwort: r.ok ? 'Schluessel erhalten' : t.replace(/\s+/g, ' ').slice(0, 160) };
  } catch (e) { return { ok: false, woher, id: kurz, antwort: (e as Error).message }; }
}

export async function GET(request: Request) {
  const bearer = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const schluessel = [process.env.CRON_SECRET, process.env.DISCORD_BOT_TOKEN].map((x) => (x ?? '').trim()).filter(Boolean);
  if (!bearer || !schluessel.some((k) => gleich(bearer, k))) return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 401 });
  const ergebnis = Object.fromEntries(await Promise.all((['epic', 'twitch', 'discord', 'google'] as Dienst[]).map(async (d) => [d, await pruefe(d)] as const)));
  return NextResponse.json(ergebnis, { headers: { 'Cache-Control': 'no-store' } });
}
