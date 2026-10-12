import { NextResponse } from 'next/server';
import { INSTALLER, programmStand } from '@/lib/povApp';

/*
 * Die Selbst-Aktualisierung des Programms "CompHub POV" (pov-app/).
 *
 * Das Programm fragt hier - wie es electron-updater mit einem "generic"-Anbieter tut - nach latest.yml und holt bei
 * einer neueren Fassung die Installationsdatei samt Blockabbild (fuer den kleinen Unterschiedsabruf). Alles liegt am
 * Release "pov-app"; diese Adresse reicht es nur durch. In den Dateien steckt kein Schluessel.
 *
 *   GET /api/pov/update/latest.yml
 *   GET /api/pov/update/CompHub-POV-Setup.exe
 *   GET /api/pov/update/CompHub-POV-Setup.exe.blockmap
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ERLAUBT = new Set(['latest.yml', INSTALLER, `${INSTALLER}.blockmap`]);
const nie = { 'Cache-Control': 'no-store' };

export async function GET(_request: Request, { params }: { params: Promise<{ datei: string }> }) {
  const { datei } = await params;
  if (!ERLAUBT.has(datei)) return NextResponse.json({ ok: false }, { status: 404, headers: nie });
  const stand = await programmStand();
  const a = stand?.assets.get(datei);
  if (!a) return NextResponse.json({ ok: false, error: 'Noch nicht veröffentlicht.' }, { status: 404, headers: nie });
  if (datei === 'latest.yml') {
    try {
      const r = await fetch(a.url, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
      if (!r.ok) throw new Error(String(r.status));
      return new Response(await r.text(), { headers: { ...nie, 'Content-Type': 'text/yaml; charset=utf-8' } });
    } catch {
      return NextResponse.json({ ok: false, error: 'Release nicht erreichbar.' }, { status: 502, headers: nie });
    }
  }
  return NextResponse.redirect(a.url, { status: 302, headers: nie });
}
