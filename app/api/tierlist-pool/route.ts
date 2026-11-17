import { NextResponse } from 'next/server';
import { ueberdauernd } from '@/lib/ueberdauernd';
import { soloPool, duoPool } from '@/lib/tierlistPool';

/*
 * Der gemeinsame Spieler-Pool der Tierlist fuer Solo und Duo - wie die Trios (app/api/tierlist-trios) aus echten Daten statt aus einer
 * gepflegten Spielerliste. Seit 17.11.2026 nur aus unseren eigenen Daten (Power Rankings, spieler-profile.json, Epics EU-/NAC-Bestenlisten,
 * duos.json) - siehe lib/tierlistPool.ts.
 *
 *   GET ?modus=solo  -> die besten EU- und NAC-Spieler nach Power Ranking (Name, Land, Region)
 *   GET ?modus=duo   -> die besten Duos der juengsten beendeten Duo-Cups in EU und NAC, dazu duos.json
 *
 * Sechs Stunden frisch, danach im Hintergrund erneuert; der letzte gute Stand haelt eine Woche (lib/ueberdauernd).
 * v4: neuer Schluessel, damit der alte Stand (aus der fremden Liste) nicht weiter ausgeliefert wird.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(request: Request) {
  const modus = new URL(request.url).searchParams.get('modus') === 'duo' ? 'duo' : 'solo';
  const sechsStunden = 6 * 3_600_000;
  const pool = await ueberdauernd(`tierlist-pool-v4-${modus}`, sechsStunden, 7 * 864e5, () => (modus === 'duo' ? duoPool() : soloPool())).catch(() => null);
  return NextResponse.json({ ok: Boolean(pool), modus, pool: pool ?? [] }, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
