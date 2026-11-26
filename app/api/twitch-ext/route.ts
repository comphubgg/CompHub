import { NextResponse } from 'next/server';
import { jwtPruefen, extDaten, konfigSetzen } from '@/lib/twitchErweiterung';

/*
 * Schnittstelle der Twitch-Erweiterung "CompHub Live" (lib/twitchErweiterung).
 *   GET                -> Daten fuer Panel/Overlay des Kanals aus dem JWT
 *   POST {einstellungen} -> nur der Streamer (role broadcaster): Epic-Name, Match-Code an/aus, Verzoegerung, Stream-Plan
 * Die Seiten laufen auf <client-id>.ext-twitch.tv - darum CORS; Schutz ist allein das signierte JWT.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const kopf = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Cache-Control': 'no-store' };
const antwort = (j: unknown, status = 200) => NextResponse.json(j, { status, headers: kopf });

export function OPTIONS() { return new NextResponse(null, { status: 204, headers: kopf }); }

export async function GET(request: Request) {
  const jwt = jwtPruefen(request.headers.get('authorization'));
  if (!jwt) return antwort({ ok: false, fehler: 'ungueltig' }, 401);
  try { return antwort({ ok: true, ...(await extDaten(jwt.channel_id, jwt.role) as object) }); } catch (e) { return antwort({ ok: false, fehler: (e as Error).message }, 500); }
}

export async function POST(request: Request) {
  const jwt = jwtPruefen(request.headers.get('authorization'));
  if (!jwt) return antwort({ ok: false, fehler: 'ungueltig' }, 401);
  if (jwt.role !== 'broadcaster') return antwort({ ok: false, fehler: 'Nur der Streamer' }, 403);
  const e = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!e) return antwort({ ok: false, fehler: 'leer' }, 400);
  const r = await konfigSetzen(jwt.channel_id, {
    epicName: typeof e.epicName === 'string' ? e.epicName : undefined,
    code: typeof e.code === 'boolean' ? e.code : undefined,
    plan: typeof e.plan === 'boolean' ? e.plan : undefined,
    verzoegerungMin: [0, 1, 3].includes(e.verzoegerungMin as number) ? e.verzoegerungMin as 0 | 1 | 3 : undefined,
  });
  return antwort(r, r.ok ? 200 : 400);
}
