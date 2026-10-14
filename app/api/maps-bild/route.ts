import { NextResponse } from 'next/server';
import fs from '@/lib/ablageFs';
import path from 'path';
import { liesJson, schreibJson } from '@/lib/ablage';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import { DATEN_ORT } from '@/lib/datenOrt';
import { eigeneKarte } from '@/lib/bildAdressen';

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
const EIGEN = /^(\/maps\/[\w.\-/ %()]+\.(png|jpe?g|webp)|\/bilder\/karten\/[\w.\-%]+\.png)$/i;

/** Die Bilder, die im Werkzeug selbst liegen und zur Wahl stehen. */
const AUSWAHL: Array<{ u: string; titel: string }> = [
  { u: '/maps/CH7S3/Battle Royale - CH7 S4.png', titel: 'Battle Royale · Chapter 7 Season 4' },
  { u: '/maps/CH7S3/Battle Royal CH7 S3.jpg', titel: 'Battle Royale · Chapter 7 Season 3' },
  { u: '/maps/CH7S3/reload - Slurpush.png', titel: 'Reload · Slurp Rush' },
  { u: '/maps/CH7S3/reload - Strong hold.png', titel: 'Reload · Elite Stronghold' },
  // Die Karten aus dem Archiv des Betreibers (12./13.10.2026), nach der Saison benannt, zu der sie am besten passen (Zuordnung nach
  // Inselform und Reihenfolge der Veraenderungen; sicher: Chapter 6 Season 3 und Chapter 3 Season 3). Der Admin kann tauschen.
  { u: '/maps/archiv/keine-karte.png', titel: 'Noch keine Karte (Hinweisbild)' },
  { u: '/maps/archiv/karte-01.jpg', titel: 'Chapter 6 Season 1 · Hunters' },
  { u: '/maps/archiv/karte-02.jpg', titel: 'Chapter 5 Season 3 · Wrecked' },
  { u: '/maps/archiv/karte-03.jpg', titel: 'Chapter 6 Season 2 · Lawless' },
  { u: '/maps/archiv/karte-04.jpg', titel: 'Chapter 5 Season 2 · Myths & Mortals' },
  { u: '/maps/archiv/karte-05.jpg', titel: 'Chapter 6 Season 3 · Super' },
  { u: '/maps/archiv/karte-06.jpg', titel: 'Chapter 5 Season 4 · Absolute Doom' },
  { u: '/maps/archiv/karte-07.jpg', titel: 'Chapter 5 Season 1 · Underground' },
  { u: '/maps/archiv/karte-08.jpg', titel: 'Chapter 3 Season 1 · Flipped' },
  { u: '/maps/archiv/karte-09.jpg', titel: "Chapter 3 Season 3 · Vibin'" },
  { u: '/maps/archiv/karte-10.jpg', titel: 'Chapter 2 Season 6 · Primal' },
  { u: '/maps/archiv/karte-11.jpg', titel: 'Chapter 3 Season 2 · Resistance' },
  { u: '/maps/archiv/karte-12.jpg', titel: 'Chapter 4 Season 3 · Wilds' },
  { u: '/maps/archiv/karte-13.jpg', titel: 'Chapter 2 Season 4 · Nexus War' },
  { u: '/maps/archiv/karte-14.jpg', titel: 'Chapter 3 Season 4 · Paradise' },
  { u: '/maps/archiv/karte-15.jpg', titel: 'Chapter 2 Season 7 · Invasion' },
  { u: '/maps/archiv/karte-16.jpg', titel: 'Chapter 4 Season 2 · MEGA' },
  { u: '/maps/archiv/karte-17.jpg', titel: 'Chapter 4 Season 4 · Last Resort' },
  { u: '/maps/archiv/karte-18.jpg', titel: 'Chapter 2 Season 8 · Cubed' },
  { u: '/maps/archiv/karte-19.jpg', titel: 'Chapter 4 Season 1 · A New Beginning' },
  { u: '/maps/archiv/karte-20.jpg', titel: 'Chapter 2 Season 5 · Zero Point' },
  { u: '/maps/archiv/karte-21.webp', titel: "Chapter 6 Season 4 · Shock 'n Awesome" },
  // Die Karten je Update von fortnite.gg/map-evolution, so gewaehlt, dass sie mit den Karten von EU Competitive uebereinstimmen (lib/alteMaps).
  { u: '/maps/archiv/gg/gg-9.00.webp', titel: 'Chapter 1 Season 9 · Update 9.00' },
  { u: '/maps/archiv/gg/gg-14.40.webp', titel: 'Chapter 2 Season 4 · Update 14.40' },
  { u: '/maps/archiv/gg/gg-15.00.webp', titel: 'Chapter 2 Season 5 · Update 15.00' },
  { u: '/maps/archiv/gg/gg-16.40.webp', titel: 'Chapter 2 Season 6 · Update 16.40' },
  { u: '/maps/archiv/gg/gg-17.00.webp', titel: 'Chapter 2 Season 7 · Update 17.00' },
  { u: '/maps/archiv/gg/gg-18.30.webp', titel: 'Chapter 2 Season 8 · Update 18.30' },
  { u: '/maps/archiv/gg/gg-18.40.webp', titel: 'Chapter 2 Season 8 (Ende) · Update 18.40' },
  { u: '/maps/archiv/gg/gg-19.00.webp', titel: 'Chapter 3 Season 1 · Update 19.00' },
  { u: '/maps/archiv/gg/gg-19.10.webp', titel: 'Chapter 3 Season 1 (Woche 2) · Update 19.10' },
  { u: '/maps/archiv/gg/gg-19.20.webp', titel: 'Chapter 3 Season 1 (ab Woche 4) · Update 19.20' },
  { u: '/maps/archiv/gg/gg-20.00.webp', titel: 'Chapter 3 Season 2 · Update 20.00' },
  { u: '/maps/archiv/gg/gg-21.00.webp', titel: 'Chapter 3 Season 3 · Update 21.00' },
  { u: '/maps/archiv/gg/gg-22.00.webp', titel: 'Chapter 3 Season 4 · Update 22.00' },
  { u: '/maps/archiv/gg/gg-22.30.webp', titel: 'Chapter 3 Season 4 (Invitational) · Update 22.30' },
  { u: '/maps/archiv/gg/gg-23.00.webp', titel: 'Chapter 4 Season 1 · Update 23.00' },
  { u: '/maps/archiv/gg/gg-24.00.webp', titel: 'Chapter 4 Season 2 · Update 24.00' },
  { u: '/maps/archiv/gg/gg-25.00.webp', titel: 'Chapter 4 Season 3 · Update 25.00' },
  { u: '/maps/archiv/gg/gg-26.30.webp', titel: 'Chapter 4 Season 4 · Update 26.30' },
  { u: '/maps/archiv/gg/gg-28.01.webp', titel: 'Chapter 5 Season 1 · Update 28.01' },
  { u: '/maps/archiv/gg/gg-29.10.webp', titel: 'Chapter 5 Season 2 · Update 29.10' },
  { u: '/maps/archiv/gg/gg-30.00.webp', titel: 'Chapter 5 Season 3 · Update 30.00' },
  { u: '/maps/archiv/gg/gg-31.10.webp', titel: 'Chapter 5 Season 4 · Update 31.10' },
  { u: '/maps/archiv/gg/gg-32-week-2.webp', titel: 'Chapter 5 Remix · Update 32 week 2' },
  { u: '/maps/archiv/gg/gg-33.00.webp', titel: 'Chapter 6 Season 1 · Update 33.00' },
  { u: '/maps/archiv/gg/gg-33.11.webp', titel: 'Chapter 6 Season 1 (Update 33.11) · Update 33.11' },
  { u: '/maps/archiv/gg/gg-33.20.webp', titel: 'Chapter 6 Season 1 (Update 33.20) · Update 33.20' },
  { u: '/maps/archiv/gg/gg-34.00.webp', titel: 'Chapter 6 Season 2 · Update 34.00' },
  { u: '/maps/archiv/gg/gg-35.20.webp', titel: 'Chapter 6 Mini-Saison 1 · Update 35.20' },
  { u: '/maps/archiv/gg/gg-36.00.webp', titel: 'Chapter 6 Season 3 · Update 36.00' },
  { u: '/maps/archiv/gg/gg-37.00.webp', titel: 'Chapter 6 Season 4 · Update 37.00' },
];

/** Die Kartenbilder, die der Admin im Karten-Werkzeug hochgeladen hat (data/kartenbilder) - auch sie stehen zur Wahl. */
async function hochgeladene(): Promise<Array<{ u: string; titel: string }>> {
  try {
    const liste = JSON.parse(await fs.readFile(path.join(DATEN_ORT, 'kartenbilder', 'karten.json'), 'utf8')) as Array<{ id: string; titel: string }>;
    return liste.map((k) => ({ u: eigeneKarte(k.id), titel: k.titel }));
  } catch { return []; }
}

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
      let r = await fetch(u, { signal: AbortSignal.timeout(20_000) });
      // Gibt es die Karte genau dieser Spielversion nicht, gilt die einer anderen Ausgabe derselben Saison (gleiche Insel, kleine Aenderungen).
      const ver = /^(https:\/\/nobleprac\.com\/maps\/)(\d+)\.(\d+)(\/map\.png)$/i.exec(u);
      if (!r.ok && ver) {
        for (const minor of ['00', '10', '11', '20', '21', '30', '31', '40', '41', '50']) {
          if (minor === ver[3]) continue;
          const ersatz = await fetch(`${ver[1]}${ver[2]}.${minor}${ver[4]}`, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
          if (ersatz?.ok) { r = ersatz; break; }
        }
      }
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
  return NextResponse.json({ ok: true, u: w ? (wahl[w] ?? null) : null, auswahl: [...await hochgeladene(), ...AUSWAHL], alle: w ? undefined : wahl },
    { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  if (!await istAdminAnfrage(request)) return NextResponse.json({ ok: false, error: 'Nur für den Admin.' }, { status: 403 });
  const k = await request.json().catch(() => ({})) as { w?: string; ws?: string[]; u?: string };
  // Ein Fenster (w) oder viele auf einmal (ws) - Letzteres fuer die Verwaltung der alten Maps: dieselbe Insel fuer eine ganze Saison.
  const ziele = (Array.isArray(k.ws) ? k.ws : [k.w]).map((x) => String(x ?? '').slice(0, 200)).filter(Boolean).slice(0, 400);
  const w = ziele[0] ?? '';
  const u = String(k.u ?? '');
  if (!w) return NextResponse.json({ ok: false, error: 'Fenster fehlt.' }, { status: 400 });
  if (u && !(EIGEN.test(u) && [...AUSWAHL, ...await hochgeladene()].some((a) => a.u === u))) {
    return NextResponse.json({ ok: false, error: 'Dieses Bild steht nicht zur Wahl.' }, { status: 400 });
  }
  const wahl = await liesJson<Record<string, string>>(DATEI, {});
  for (const z of ziele) { if (u) wahl[z] = u; else delete wahl[z]; }
  await schreibJson(DATEI, wahl);
  return NextResponse.json({ ok: true, u: u || null, gesetzt: ziele.length }, { headers: { 'Cache-Control': 'no-store' } });
}
