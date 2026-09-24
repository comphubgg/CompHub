import { NextResponse } from 'next/server';
import { EpicLoginNoetig } from '@/lib/epicCups';
import { GLOBALS_TAGE } from '@/lib/globalsCup';
import { globalsTeams } from '@/lib/globalsTeams';

/*
 * Das Feld der Global Championship - wer antritt, und woher. Die ganze
 * Zuordnung steht in lib/globalsTeams; die Karten brauchen sie auch, um die
 * LAN-Konten auf die echten Namen zurueckzufuehren.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const fenster = p.get('fenster') || GLOBALS_TAGE[0].windowId;

  try {
    return NextResponse.json(await globalsTeams(fenster));
  } catch (e) {
    const login = e instanceof EpicLoginNoetig;
    return NextResponse.json(
      { error: (e as Error).message, needsLogin: login },
      { status: login ? 401 : 500 },
    );
  }
}
