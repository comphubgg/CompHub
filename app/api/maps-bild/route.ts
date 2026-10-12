import { NextResponse } from 'next/server';
import { liesJson, schreibJson } from '@/lib/ablage';
import { istAdminAnfrage } from '@/lib/adminPruefung';

/*
 * Das Kartenbild einer Map - das richtige zur Spielversion, und vom Admin aenderbar.
 *
 * Der Betreiber (12.10.2026): "du kannst nicht einfach eine Battle-Royale-Map fuer ein EWC Reload Elite Series Finals
 * packen. Du musst die richtige Map finden", und "du musst das wirklich irgendwie bearbeiten koennen". Zwei Teile:
 *
 *   GET ?u=<Adresse>   das Kartenbild selbst, von hier ausgeliefert (die Seite ladet es nicht von der Quelle)
 *   GET ?w=<Fenster>   welches Bild der Admin fuer diesen Spieltag gewaehlt hat (oder nichts) - plus die Auswahl
 *   POST {w, u}        (nur Admin) ein Bild waehlen; u leer = zurueck zum Standard der Spielversion
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DATEI = 'maps-bild.json';
/** Erlaubt sind nur Kartenbilder der Quelle und die eigenen unter /maps/. */
const FREMD = /^https:\/\/nobleprac\.com\/maps\/[\w.\-/]+\.(png|jpe?g|webp)$/i;
const EIGEN = /^\/maps\/[\w.\-/ %()]+\.(png|jpe?g|webp)$/i;

/** Die Bilder, die im Werkzeug selbst liegen und zur Wahl stehen. */
const AUSWAHL: Array<{ u: string; titel: string }> = [
  { u: '/maps/CH7S3/Battle Royale - CH7 S4.png', titel: 'Battle Royale · Chapter 7 Season 4' },
  { u: '/maps/CH7S3/Battle Royal CH7 S3.jpg', titel: 'Battle Royale · Chapter 7 Season 3' },
  { u: '/maps/CH7S3/reload - Slurpush.png', titel: 'Reload · Slurp Rush' },
  { u: '/maps/CH7S3/reload - Strong hold.png', titel: 'Reload · Elite Stronghold' },
];

const vorrat = new Map<string, { bis: number; typ: string; daten: ArrayBuffer }>();

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const u = p.get('u');
  if (u) {
    if (!FREMD.test(u)) return NextResponse.json({ ok: false, error: 'Dieses Bild ist nicht erlaubt.' }, { status: 400 });
    const da = vorrat.get(u);
    if (da && da.bis > Date.now()) {
      return new NextResponse(da.daten, { headers: { 'Content-Type': da.typ, 'Cache-Control': 'public, max-age=86400, s-maxage=604800' } });
    }
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(20_000) });
      if (!r.ok) return NextResponse.json({ ok: false, error: 'Bild nicht erreichbar.' }, { status: 502 });
      const daten = await r.arrayBuffer();
      const typ = r.headers.get('content-type') ?? 'image/png';
      if (vorrat.size > 40) vorrat.clear();
      vorrat.set(u, { bis: Date.now() + 24 * 3600_000, typ, daten });
      return new NextResponse(daten, { headers: { 'Content-Type': typ, 'Cache-Control': 'public, max-age=86400, s-maxage=604800' } });
    } catch {
      return NextResponse.json({ ok: false, error: 'Bild nicht erreichbar.' }, { status: 502 });
    }
  }

  const w = p.get('w');
  const wahl = await liesJson<Record<string, string>>(DATEI, {});
  return NextResponse.json({ ok: true, u: w ? (wahl[w] ?? null) : null, auswahl: AUSWAHL, alle: w ? undefined : wahl },
    { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  if (!await istAdminAnfrage(request)) return NextResponse.json({ ok: false, error: 'Nur für den Admin.' }, { status: 403 });
  const k = await request.json().catch(() => ({})) as { w?: string; u?: string };
  const w = String(k.w ?? '').slice(0, 200);
  const u = String(k.u ?? '');
  if (!w) return NextResponse.json({ ok: false, error: 'Fenster fehlt.' }, { status: 400 });
  if (u && !(EIGEN.test(u) && AUSWAHL.some((a) => a.u === u))) {
    return NextResponse.json({ ok: false, error: 'Dieses Bild steht nicht zur Wahl.' }, { status: 400 });
  }
  const wahl = await liesJson<Record<string, string>>(DATEI, {});
  if (u) wahl[w] = u; else delete wahl[w];
  await schreibJson(DATEI, wahl);
  return NextResponse.json({ ok: true, u: u || null }, { headers: { 'Cache-Control': 'no-store' } });
}
