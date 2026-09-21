import { NextResponse } from 'next/server';
import { einladung } from '@/lib/discord';

/*
 * Der Einladungslink fuer "Join our Discord" im Dashboard.
 *
 * Oeffentlich lesbar - ein Einladungslink ist zum Weitergeben da. Ohne
 * Bot-Token gibt es keinen, und die Seite zeigt den Kasten dann nicht.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const url = await einladung();
    return NextResponse.json({ url }, { headers: { 'Cache-Control': 'public, max-age=3600' } });
  } catch {
    return NextResponse.json({ url: null });
  }
}
