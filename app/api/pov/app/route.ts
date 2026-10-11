import { NextResponse } from 'next/server';
import { wer } from '@/lib/pov';

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

const REPO = process.env.COMPHUB_GITHUB_REPO || 'comphubgg/CompHub';
const DATEI = 'CompHub-POV-Setup.exe';
const nie = { 'Cache-Control': 'no-store' };

let merk: { bis: number; wert: { version: string; url: string; groesse: number } | null } | null = null;

async function neuestes() {
  if (merk && merk.bis > Date.now()) return merk.wert;
  let wert: { version: string; url: string; groesse: number } | null = null;
  try {
    const token = (process.env.GITHUB_TOKEN || process.env.DATEN_TOKEN || '').trim();
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/pov-app`, {
      headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      cache: 'no-store', signal: AbortSignal.timeout(10_000),
    });
    if (r.ok) {
      const j = await r.json() as { name?: string; assets?: Array<{ name: string; browser_download_url: string; size: number }> };
      const a = (j.assets ?? []).find((x) => x.name === DATEI);
      const version = String(j.name ?? '').match(/\d+\.\d+\.\d+/)?.[0] ?? '';
      if (a && version) wert = { version, url: a.browser_download_url, groesse: a.size };
    }
  } catch { /* dann keine Auskunft */ }
  merk = { bis: Date.now() + (wert ? 5 * 60_000 : 30_000), wert };
  return wert;
}

export async function GET(request: Request) {
  const neu = await neuestes();
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
