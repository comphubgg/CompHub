import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { botFreundeTakt } from '@/lib/botFreunde';

/*
 * Ein Takt der Bot-Freunde (lib/botFreunde) - nur fuer den Server selbst (instrumentation.ts ruft alle zwei Minuten). Der Schluessel ist aus dem Discord-Token
 * abgeleitet, damit niemand von aussen Anfragen ausloest.
 */
export const dynamic = 'force-dynamic';
function internSchluessel(): string {
  return crypto.createHash('sha256').update(`bot-freunde|${process.env.DISCORD_BOT_TOKEN ?? ''}`).digest('hex').slice(0, 32);
}
export async function POST(req: Request) {
  if (!process.env.DISCORD_BOT_TOKEN || req.headers.get('x-intern') !== internSchluessel()) return NextResponse.json({ ok: false }, { status: 403 });
  try { return NextResponse.json(await botFreundeTakt()); } catch (e) { return NextResponse.json({ ok: false, text: (e as Error).message }); }
}
