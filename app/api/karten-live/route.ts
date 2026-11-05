import { NextResponse } from 'next/server';
import { kartenAutomatik } from '@/lib/kartenAutomatik';
import type { CupGruppe } from '@/lib/epicCups';

/*
 * Die Karte eines Finales live nachziehen (Betreiber, 5.11.2026: bei Noble kommen die Spieler ohne Neuladen dazu, "das soll bei mir genauso sein"). Die Automatik laeuft
 * sonst nur alle zehn Minuten. Solange jemand das Finale offen hat, fragt seine Seite hier nach; je Spieltag hoechstens alle zwanzig Sekunden, egal wie viele zusehen.
 * Offen, weil es nur das tut, was die Automatik ohnehin tut: nur Finals, nur von Ende der Vorrunde bis zehn Minuten nach Start, Karten von Hand bleiben unberuehrt.
 *
 *   GET ?window=<windowId>
 *
 * Antworten immer mit 200: der Lastverteiler haelt jede 5xx fuer einen Ausfall des Servers.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const FRIST_MS = 20_000;
const zuletzt = new Map<string, number>();

export async function GET(request: Request) {
  const fenster = new URL(request.url).searchParams.get('window') ?? '';
  if (!/^S\d+_[A-Za-z0-9_]+$/.test(fenster)) return NextResponse.json({ ok: false });
  const jetzt = Date.now();
  if (jetzt - (zuletzt.get(fenster) ?? 0) < FRIST_MS) return NextResponse.json({ ok: true, gewartet: true });
  zuletzt.set(fenster, jetzt);
  const basis = `http://127.0.0.1:${process.env.PORT || 3100}`;
  try {
    const [katalog, bilder] = await Promise.all([
      fetch(`${basis}/api/cup-catalog?modus=alle-aktuell`, { cache: 'no-store', signal: AbortSignal.timeout(30_000) }).then((r) => r.json()) as Promise<{ cups?: CupGruppe[] }>,
      fetch(`${basis}/api/karten-bild`, { cache: 'no-store', signal: AbortSignal.timeout(20_000) }).then((r) => r.json()) as Promise<{ karten?: Array<{ id: string; titel: string }>; inseln?: Record<string, string> }>,
    ]);
    if (!katalog.cups?.length) return NextResponse.json({ ok: false });
    const lauf = await kartenAutomatik(katalog.cups, bilder.inseln ?? {}, bilder.karten ?? [], false, fenster);
    return NextResponse.json({ ok: true, geladen: lauf.geladen.length });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
