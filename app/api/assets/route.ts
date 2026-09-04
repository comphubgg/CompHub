import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { istAdminAnfrage } from '@/lib/adminPruefung';

// Der Bildvorrat fuer Beitraege.
//
// Bisher lagen alle Assets flach in public/assets: Vorlagen, Logos und
// Einzelbilder durcheinander. Sobald zu jedem Turnier und zu jedem Profi
// etwas dazukommt, ist das keine Ablage mehr, sondern ein Haufen.
//
// Deshalb zwei Ordner mit klarer Bedeutung:
//
//   public/assets/turniere/<Turnier>/   Logos, Siegergrafiken, Hintergruende
//   public/assets/spieler/<Name>/       alles zu einem einzelnen Profi
//
// Was direkt in public/assets liegt, bleibt liegen - dort stehen die
// Vorlagen, auf denen die Turniergrafik zeichnet.
//
//   GET                          -> alle Ordner mit ihren Dateien
//   POST  (multipart)            -> Dateien in einen Ordner legen
//   DELETE ?pfad=…               -> eine Datei entfernen
//
// Hochladen und Loeschen darf nur der Admin. Lesen darf jeder - es sind
// dieselben Bilder, die spaeter in den Beitraegen auftauchen.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const WURZEL = path.join(process.cwd(), 'public', 'assets');
const BEREICHE = ['turniere', 'spieler'] as const;
type Bereich = (typeof BEREICHE)[number];

const ERLAUBT = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];
/** Zwanzig Megabyte je Datei - darueber ist es kein Beitragsbild mehr. */
const MAX_BYTES = 20 * 1024 * 1024;

/**
 * Einen Namen so entschaerfen, dass er ein Ordner sein darf.
 *
 * Punkte und Schraegstriche fliegen raus: "../../etc" waere sonst ein
 * gueltiger Ordnername und zeigte aus public heraus.
 */
function sauber(name: string) {
  return name.normalize('NFC').replace(/[^\p{L}\p{N} ._-]/gu, '')
    .replace(/\.{2,}/g, '.').replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 60);
}

interface Datei { name: string; pfad: string; bytes: number; geaendert: number }
interface Ordner { bereich: Bereich; name: string; dateien: Datei[] }

async function liesOrdner(bereich: Bereich): Promise<Ordner[]> {
  const wurzel = path.join(WURZEL, bereich);
  let namen: string[] = [];
  try { namen = await fs.readdir(wurzel); } catch { return []; }

  const raus: Ordner[] = [];
  for (const name of namen) {
    const ort = path.join(wurzel, name);
    let eintraege: string[] = [];
    try {
      if (!(await fs.stat(ort)).isDirectory()) continue;
      eintraege = await fs.readdir(ort);
    } catch { continue; }

    const dateien: Datei[] = [];
    for (const d of eintraege) {
      if (!ERLAUBT.includes(path.extname(d).toLowerCase())) continue;
      try {
        const s = await fs.stat(path.join(ort, d));
        dateien.push({
          name: d,
          pfad: `/assets/${bereich}/${encodeURIComponent(name)}/${encodeURIComponent(d)}`,
          bytes: s.size,
          geaendert: s.mtimeMs,
        });
      } catch { /* eine unlesbare Datei haelt den Rest nicht auf */ }
    }
    dateien.sort((a, b) => b.geaendert - a.geaendert);
    raus.push({ bereich, name, dateien });
  }
  raus.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return raus;
}

export async function GET() {
  const [turniere, spieler] = await Promise.all(BEREICHE.map(liesOrdner));
  return NextResponse.json({
    success: true, turniere, spieler,
    dateien: [...turniere, ...spieler].reduce((n, o) => n + o.dateien.length, 0),
  });
}

export async function POST(request: Request) {
  if (!await istAdminAnfrage(request)) {
    return NextResponse.json({ error: 'nur fuer den Admin' }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'keine Dateien' }, { status: 400 });

  const bereich = String(form.get('bereich') ?? '') as Bereich;
  if (!BEREICHE.includes(bereich)) {
    return NextResponse.json({ error: 'unbekannter Bereich' }, { status: 400 });
  }
  const ordner = sauber(String(form.get('ordner') ?? ''));
  if (!ordner) {
    return NextResponse.json({ error: 'Ordnername fehlt' }, { status: 400 });
  }

  const ziel = path.join(WURZEL, bereich, ordner);
  await fs.mkdir(ziel, { recursive: true });

  const abgelegt: string[] = [];
  const abgelehnt: string[] = [];

  for (const wert of form.getAll('dateien')) {
    if (!(wert instanceof File)) continue;
    const endung = path.extname(wert.name).toLowerCase();
    if (!ERLAUBT.includes(endung)) { abgelehnt.push(`${wert.name}: kein Bild`); continue; }
    if (wert.size > MAX_BYTES) { abgelehnt.push(`${wert.name}: zu gross`); continue; }

    // Ein vorhandener Name wird nicht ueberschrieben - sonst verschwaende ein
    // gleichnamiger Upload das aeltere Bild wortlos.
    const stamm = sauber(path.basename(wert.name, endung)) || 'bild';
    let name = `${stamm}${endung}`;
    for (let n = 2; n < 100; n++) {
      try { await fs.access(path.join(ziel, name)); name = `${stamm}-${n}${endung}`; }
      catch { break; }
    }

    await fs.writeFile(path.join(ziel, name),
      Buffer.from(await wert.arrayBuffer()));
    abgelegt.push(name);
  }

  return NextResponse.json({ success: true, ordner, bereich, abgelegt, abgelehnt });
}

export async function DELETE(request: Request) {
  if (!await istAdminAnfrage(request)) {
    return NextResponse.json({ error: 'nur fuer den Admin' }, { status: 403 });
  }

  const roh = new URL(request.url).searchParams.get('pfad') ?? '';
  const teile = decodeURIComponent(roh).replace(/^\/assets\//, '').split('/');
  if (teile.length !== 3) {
    return NextResponse.json({ error: 'unerwarteter Pfad' }, { status: 400 });
  }
  const [bereich, ordner, datei] = teile.map((x) => decodeURIComponent(x));
  if (!BEREICHE.includes(bereich as Bereich)) {
    return NextResponse.json({ error: 'unbekannter Bereich' }, { status: 400 });
  }

  // Erst saeubern, dann zusammensetzen - und danach pruefen, dass der Pfad
  // wirklich unterhalb der Wurzel liegt. Ein Name wie ".." kaeme sonst
  // durch die Saeuberung und zeigte aus public heraus.
  const ziel = path.join(WURZEL, bereich, sauber(ordner), sauber(datei));
  if (!ziel.startsWith(WURZEL + path.sep)) {
    return NextResponse.json({ error: 'unerlaubter Pfad' }, { status: 400 });
  }

  try { await fs.unlink(ziel); }
  catch { return NextResponse.json({ error: 'nicht gefunden' }, { status: 404 }); }
  return NextResponse.json({ success: true });
}
