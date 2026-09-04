import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { DATEN_ORT } from '@/lib/datenOrt';

// Eigene Kartenbilder. Fortnite hat nicht nur eine Karte: neben der grossen
// Battle-Royale-Insel gibt es die kleineren Reload-Karten, die sich pro
// Saison aendern. Deshalb liegen hier mehrere benannte Bilder, zwischen
// denen im Editor umgeschaltet wird.
//
// Sie gehen der oeffentlichen Kartenquelle vor - die braucht nach einem
// Season-Start ein paar Tage, bis das neue Bild dort liegt.
//
//   GET                     -> alle hinterlegten Karten
//   GET ?id=…&datei=1       -> das Bild selbst
//   POST (FormData)         -> Bild hochladen, Felder "bild" und "titel"
//   DELETE ?id=…            -> eine Karte entfernen

const ORDNER = path.join(DATEN_ORT, 'kartenbilder');
const VERZEICHNIS = path.join(ORDNER, 'karten.json');

/** Groesser als das braucht keine Karte, und es schuetzt vor Ausrutschern. */
const MAX_BYTES = 12 * 1024 * 1024;

/** Vorschlaege fuer die Benennung - frei ueberschreibbar. */
export const VORLAGEN = [
  'Battle Royale - CH7 S4',
  'Battle Royale - CH7 S3',
  'Reload - Slurpush',
  'Reload - Elite Stronghold',
];

export interface Kartenbild {
  id: string;
  titel: string;
  datei: string;
  hochgeladen: number;
  groesse: number;
}

async function lies(): Promise<Kartenbild[]> {
  try {
    return JSON.parse(await fs.readFile(VERZEICHNIS, 'utf8')) as Kartenbild[];
  } catch {
    return [];
  }
}

async function schreib(karten: Kartenbild[]) {
  await fs.mkdir(ORDNER, { recursive: true });
  await fs.writeFile(VERZEICHNIS, JSON.stringify(karten, null, 2), 'utf8');
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const alsDatei = searchParams.get('datei');
  const karten = await lies();

  if (alsDatei) {
    const k = karten.find((x) => x.id === id);
    if (!k) return NextResponse.json({ error: 'unbekannte Karte' }, { status: 404 });
    try {
      const daten = await fs.readFile(path.join(ORDNER, k.datei));
      return new NextResponse(new Uint8Array(daten), {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=300, must-revalidate',
        },
      });
    } catch {
      return NextResponse.json({ error: 'Datei fehlt' }, { status: 404 });
    }
  }

  return NextResponse.json({
    karten: karten.sort((a, b) => a.titel.localeCompare(b.titel)),
    vorlagen: VORLAGEN,
  });
}

export async function POST(request: Request) {
  const eingang = await request.formData();
  const datei = eingang.get('bild');
  const titel = String(eingang.get('titel') ?? '').trim() || 'Eigene Karte';

  if (!(datei instanceof File)) {
    return NextResponse.json({ error: 'Feld "bild" fehlt' }, { status: 400 });
  }
  if (datei.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Das Bild ist zu gross (${Math.round(datei.size / 1e6)} MB, erlaubt sind 12 MB)` },
      { status: 413 },
    );
  }
  if (!/^image\//.test(datei.type)) {
    return NextResponse.json({ error: 'Das ist kein Bild' }, { status: 415 });
  }

  const id = titel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    || `karte-${Date.now().toString(36)}`;
  const dateiname = `${id}.png`;

  await fs.mkdir(ORDNER, { recursive: true });
  await fs.writeFile(path.join(ORDNER, dateiname), Buffer.from(await datei.arrayBuffer()));

  const karten = await lies();
  const eintrag: Kartenbild = {
    id, titel, datei: dateiname,
    hochgeladen: Date.now(), groesse: datei.size,
  };
  const i = karten.findIndex((k) => k.id === id);
  if (i >= 0) karten[i] = eintrag; else karten.push(eintrag);
  await schreib(karten);

  return NextResponse.json({ ok: true, karte: eintrag });
}

/**
 * Umbenennen, ohne die Datei neu hochzuladen.
 *
 * Die Kennung bleibt dabei bewusst unangetastet: an ihr haengen die
 * gespeicherten Turnierkarten und die Formvorlagen. Wuerde sie sich mit dem
 * Namen aendern, verloeren alle bisherigen Karten ihr Bild.
 *
 *   PATCH { id, titel }
 */
export async function PATCH(request: Request) {
  const { id, titel } = await request.json() as { id?: string; titel?: string };
  const name = (titel ?? '').trim();
  if (!id || !name) {
    return NextResponse.json({ error: 'id und titel sind noetig' }, { status: 400 });
  }

  const karten = await lies();
  const k = karten.find((x) => x.id === id);
  if (!k) return NextResponse.json({ error: 'unbekannte Karte' }, { status: 404 });

  k.titel = name;
  await schreib(karten);
  return NextResponse.json({ ok: true, karte: k });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id fehlt' }, { status: 400 });

  const karten = await lies();
  const k = karten.find((x) => x.id === id);
  if (k) {
    try { await fs.unlink(path.join(ORDNER, k.datei)); } catch { /* war schon weg */ }
  }
  await schreib(karten.filter((x) => x.id !== id));
  return NextResponse.json({ ok: true });
}
