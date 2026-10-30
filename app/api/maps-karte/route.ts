import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fensterFuer, vitalFenster } from '@/lib/globalsSolos';
import { istVitalRegion } from '@/lib/vitalScrims';
import { mapsVerzeichnis } from '@/lib/mapsVerzeichnis';
import { ALT, alteFenster, inselFuer, mitHandEbene } from '@/lib/alteMaps';
import { fncsPlatzierungen } from '@/lib/fncsEreignisse';
import { ueberdauernd } from '@/lib/ueberdauernd';

/** Das Verzeichnis aus dem gespeicherten Stand (wie /api/maps-liste) - frisch gebaut braucht es nach einem Neustart ueber 20 s. */
async function verzeichnis() {
  return (await ueberdauernd('maps-liste', 10 * 60_000, 7 * 864e5, () => mapsVerzeichnis()).catch(() => null)) ?? mapsVerzeichnis();
}

/*
 * Die Karte eines Fensters, wie Noble Practice sie fuehrt: die Spieler (mit Land und Foto) und die Landepunkte.
 * Fuer die Detailseite unter /tournament-maps/karte. Kein Konto noetig.
 *
 *   GET ?t=<Turnier-Id>&r=<Region>&w=<Fenster-Kennung>
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/*
 * Der teure Teil (Spieler und Landepunkte von Noble/Vital, Platzierungen) liegt zusaetzlich auf der Platte des Servers (Betreiber, 30.10.2026: die Karte
 * "laggt" - nach jedem neuen Bau brauchte der erste Aufruf 11 bis 40 s, danach 4 ms). So steht die Karte auch nach einem Neustart sofort da; ist der Stand
 * aelter als eine Minute, wird er im Hintergrund erneuert. Die Formen und Teams des Admins (mitHandEbene) werden nie zwischengespeichert, sondern bei jedem
 * Aufruf frisch gelesen - seine Aenderungen gelten sofort. Ohne beschreibbare Platte (Netlify-Ersatzseite) wird einfach gerechnet wie bisher.
 */
const ORDNER = path.join(process.cwd(), 'data', '.cache', 'maps-karte');
const FRISCH_MS = 60_000;
const laeuft = new Map<string, Promise<Basis | null>>();

type Fenster = NonNullable<Awaited<ReturnType<typeof fensterFuer>>>;
interface Basis { f: Fenster; platzierungen: unknown[] }

function datei(schluessel: string) {
  return path.join(ORDNER, `${createHash('sha1').update(schluessel).digest('hex')}.json`);
}

async function rechne(t: string, r: string, w: string): Promise<Basis | null> {
  // NA Central, NA West, Middle East und Ozeanien: die Landepunkte kommen von Vital Scrims, nicht von Noble.
  const vitalEintrag = istVitalRegion(r) ? (await verzeichnis()).find((x) => x.turnierId === t && x.windowId === w && x.region === r) : undefined;
  const f = vitalEintrag
    ? await vitalFenster({ windowId: vitalEintrag.windowId, name: vitalEintrag.fenster || vitalEintrag.titel, region: r, begin: vitalEintrag.datum ?? 0, ende: vitalEintrag.ende, vitalId: vitalEintrag.vitalId })
    : await fensterFuer(t, r, w);
  if (!f) return null;
  const e = (await verzeichnis()).find((x) => x.turnierId === t && x.windowId === w);
  const platzierungen = e ? await fncsPlatzierungen(e).catch(() => []) : [];
  const basis = { f, platzierungen };
  try {
    fs.mkdirSync(ORDNER, { recursive: true });
    fs.writeFileSync(datei(`${t}|${r}|${w}`), JSON.stringify(basis));
  } catch { /* keine beschreibbare Platte */ }
  return basis;
}

/** Einmal gleichzeitig je Fenster rechnen - mehrere Besucher warten auf dieselbe Antwort. */
function rechneEinmal(t: string, r: string, w: string): Promise<Basis | null> {
  const k = `${t}|${r}|${w}`;
  const da = laeuft.get(k);
  if (da) return da;
  const neu = rechne(t, r, w).finally(() => laeuft.delete(k));
  laeuft.set(k, neu);
  return neu;
}

async function basisFuer(t: string, r: string, w: string): Promise<Basis | null> {
  try {
    const d = datei(`${t}|${r}|${w}`);
    const alter = Date.now() - fs.statSync(d).mtimeMs;
    const gespeichert = JSON.parse(fs.readFileSync(d, 'utf8')) as Basis;
    if (alter > FRISCH_MS) void rechneEinmal(t, r, w).catch(() => null);
    return gespeichert;
  } catch { /* noch nichts auf der Platte */ }
  return rechneEinmal(t, r, w);
}

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const t = p.get('t') ?? '';
  const r = p.get('r') ?? '';
  const w = p.get('w') ?? '';
  if (!t || !r || !w) return NextResponse.json({ ok: false, error: 'Turnier, Region und Fenster fehlen.' }, { status: 400 });
  try {
    // Die Karten ohne Landepunkte (Archiv, aeltere Events, vom Admin angelegt) - siehe lib/alteMaps.
    if (t.startsWith(ALT)) {
      const e = (await verzeichnis()).find((x) => x.turnierId === t && x.windowId === w);
      if (!e) return NextResponse.json({ ok: false, error: 'Dieses Fenster gibt es nicht.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
      const platzierungen = await fncsPlatzierungen(e).catch(() => []);
      return NextResponse.json({ ok: true, ...await alteFenster(e, p.get('tag') ?? 'gesamt'), platzierungen }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const basis = await basisFuer(t, r, w);
    if (!basis) return NextResponse.json({ ok: false, error: 'Dieses Fenster gibt es nicht.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    // Eine eigene Kopie: mehrere Aufrufe teilen sich dieselbe Rechnung, und unten wird das Fenster veraendert.
    const { f, platzierungen } = structuredClone(basis);
    // Ein Finale an zwei Tagen (Epics Archiv): die Seite zeigt Day 1 / Day 2 / Combined.
    const e = (await verzeichnis()).find((x) => x.turnierId === t && x.windowId === w);
    // Nennt Noble fuer das Fenster nur die allgemeine, immer aktuelle Spielkarte (fortnite-api.com), steht dort bei einem alten Event die falsche
    // Insel (Global Championship 2025 zeigte die Insel von heute): dann gilt die Insel der Saison des Events.
    if (e && (!f.fenster.bild || f.fenster.bild.includes('fortnite-api.com/images/map'))) f.fenster.bild = inselFuer(e.saison);
    // Formen und Teams, die der Admin selbst eingetragen hat (wo Noble keine fuehrt), gelten vor Nobles.
    // Antwortet die Ablage nicht, bleibt es bei Nobles Karte - sie faellt nicht aus.
    if (e) f.fenster = await mitHandEbene(e, f.fenster).catch(() => f.fenster);
    return NextResponse.json({ ok: true, ...f, tage: (e?.tage ?? []).map((d) => ({ name: d.name, windowId: d.windowId })), platzierungen }, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=120' } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 424, headers: { 'Cache-Control': 'no-store' } });
  }
}
