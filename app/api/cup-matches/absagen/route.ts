import { NextResponse } from 'next/server';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import { setzeAbgesagt } from '@/lib/abgesagt';

/*
 * Ein Match absagen oder die Absage zuruecknehmen - nur der Admin.
 *
 *   POST { windowId, sessionId, abgesagt: true|false }
 *
 * Siehe lib/abgesagt: das Match bleibt sichtbar ("Match cancelled"), seine
 * Punkte, Elims und das Spiel fallen aus der Bestenliste. Nie automatisch.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!await istAdminAnfrage(request)) return NextResponse.json({ error: 'Only the admin.' }, { status: 403 });
  const k = await request.json().catch(() => ({})) as { windowId?: string; sessionId?: string; abgesagt?: boolean };
  const windowId = String(k.windowId ?? '').trim();
  const sessionId = String(k.sessionId ?? '').trim();
  if (!/^[\w-]{3,120}$/.test(windowId) || !/^[\w-]{6,80}$/.test(sessionId)) {
    return NextResponse.json({ error: 'windowId and sessionId are required.' }, { status: 400 });
  }
  try {
    const alles = await setzeAbgesagt(windowId, sessionId, k.abgesagt !== false);
    return NextResponse.json({ ok: true, abgesagt: alles[windowId] ?? [] });
  } catch {
    return NextResponse.json({ error: 'Storage is not answering right now - nothing was changed.' }, { status: 503 });
  }
}
