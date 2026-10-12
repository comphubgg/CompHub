import { NextResponse } from 'next/server';
import { wer } from '@/lib/pov';
import { INSTALLER, programmStand } from '@/lib/povApp';

/*
 * Das Programm "CompHub POV" (pov-app/) zum Herunterladen.
 *
 *   GET            fuer Profis und Admin: leitet zur Installationsdatei weiter
 *   GET ?info=1    { version, groesse } - das Programm fragt damit nach einer neueren Fassung
 *
 * Die Datei liegt am Release "pov-app" des Projekts (kostenlos, ueber GitHubs Netz). In ihr steckt kein Schluessel:
 * wer sie hat, kommt ohne Anmeldung als Profi nicht weiter. Gebaut wird sie mit "npm run pov-app" und mit
 * scripts/pov-app-veroeffentlichen.mjs hochgeladen.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const nie = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  const stand = await programmStand();
  const a = stand?.assets.get(INSTALLER);
  const neu = stand && a ? { version: stand.version, url: a.url, groesse: a.groesse } : null;
  if (new URL(request.url).searchParams.get('info')) {
    return NextResponse.json(neu ? { ok: true, version: neu.version, groesse: neu.groesse } : { ok: false }, { headers: nie });
  }
  const ich = await wer();
  if (ich.rolle !== 'pro' && ich.rolle !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Nur für Profis.' }, { status: 403, headers: nie });
  }
  if (!neu) return NextResponse.json({ ok: false, error: 'Das Programm ist noch nicht veröffentlicht.' }, { status: 404, headers: nie });
  return NextResponse.redirect(neu.url, { status: 302, headers: nie });
}
