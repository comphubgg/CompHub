import crypto from 'crypto';
import { after } from 'next/server';
import { eventsubGeheimnis, verarbeite } from '@/lib/twitchBot';

/*
 * Twitchs EventSub-Webhook fuer den CompHub-Bot (lib/twitchBot): jede Chatnachricht der eingetragenen Kanaele kommt hierher. Die Unterschrift wird
 * geprueft (HMAC mit dem Geheimnis des Abos), die Bestaetigung beim Anlegen beantwortet und die Nachricht nach der Antwort verarbeitet - Twitch will
 * binnen weniger Sekunden ein 2xx sehen, sonst gilt der Webhook als gestoert.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const roh = await request.text();
  const id = request.headers.get('twitch-eventsub-message-id') ?? '';
  const zeit = request.headers.get('twitch-eventsub-message-timestamp') ?? '';
  const unterschrift = request.headers.get('twitch-eventsub-message-signature') ?? '';
  const erwartet = `sha256=${crypto.createHmac('sha256', eventsubGeheimnis()).update(id + zeit + roh).digest('hex')}`;
  const gleich = unterschrift.length === erwartet.length && crypto.timingSafeEqual(Buffer.from(unterschrift), Buffer.from(erwartet));
  // Aeltere Nachrichten als zehn Minuten nicht (Schutz gegen Wiederholung).
  if (!gleich || Math.abs(Date.now() - Date.parse(zeit)) > 10 * 60_000) return new Response('falsche Unterschrift', { status: 403 });

  const art = request.headers.get('twitch-eventsub-message-type');
  let daten: { challenge?: string; subscription?: { type?: string }; event?: unknown };
  try { daten = JSON.parse(roh); } catch { return new Response('kaputt', { status: 400 }); }
  if (art === 'webhook_callback_verification') return new Response(daten.challenge ?? '', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  if (art === 'notification' && daten.subscription?.type === 'channel.chat.message' && daten.event) {
    const ereignis = daten.event as Parameters<typeof verarbeite>[0];
    try { after(() => verarbeite(ereignis).catch(() => undefined)); } catch { void verarbeite(ereignis).catch(() => undefined); }
  }
  return new Response(null, { status: 204 });
}
