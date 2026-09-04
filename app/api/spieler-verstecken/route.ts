import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import { DATEN_ORT } from '@/lib/datenOrt';

// Spieler aus der Statistikseite nehmen.
//
// Geloescht wird nichts: Die Werte im Archiv bleiben, wo sie sind. Was hier
// entsteht, ist eine Liste von Konten, die in der Oberflaeche nicht mehr
// auftauchen - in keiner Bestenliste, keiner Suche, keiner Bilderansicht.
//
// Das ist Absicht und keine Bequemlichkeit. Die Werte stammen aus einem
// gespiegelten Archiv, das sich nicht von Hand nachbauen liesse; ein
// wirkliches Loeschen waere unumkehrbar. Ein Eintrag in dieser Liste dagegen
// laesst sich in einer Zeile zuruecknehmen.
//
//   GET                      -> welche Konten versteckt sind
//   POST { id }              -> Konto verstecken
//   DELETE ?id=<konto>       -> wieder zeigen
//
// Hinzufuegen gibt es bewusst nicht: Platzierungen, Mitspieler und Werte
// kommen aus Epic und der Quelle. Wer sie von Hand eintraege, schriebe
// Zahlen hin, die niemand nachpruefen kann.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DATEI = path.join(DATEN_ORT, 'spieler-versteckt.json');

interface Eintrag {
  id: string;
  name?: string;
  wann: string;
}

async function lies(): Promise<Eintrag[]> {
  try {
    return JSON.parse(await fs.readFile(DATEI, 'utf8')) as Eintrag[];
  } catch {
    return [];
  }
}

async function schreibe(liste: Eintrag[]) {
  await fs.writeFile(DATEI, JSON.stringify(liste, null, 1), 'utf8');
}

export async function GET() {
  return NextResponse.json({ success: true, versteckt: await lies() });
}

export async function POST(request: Request) {
  if (!await istAdminAnfrage(request)) {
    return NextResponse.json({ error: 'nur fuer den Admin' }, { status: 403 });
  }
  const koerper = await request.json().catch(() => ({}));
  const id = String(koerper.id ?? '').trim();
  if (!/^[0-9a-f]{32}$/i.test(id)) {
    return NextResponse.json({ error: 'keine gueltige Konto-Id' }, { status: 400 });
  }

  const liste = await lies();
  if (!liste.some((e) => e.id === id)) {
    liste.push({
      id,
      name: typeof koerper.name === 'string' ? koerper.name : undefined,
      wann: new Date().toISOString(),
    });
    await schreibe(liste);
  }
  return NextResponse.json({ success: true, versteckt: liste.length });
}

export async function DELETE(request: Request) {
  if (!await istAdminAnfrage(request)) {
    return NextResponse.json({ error: 'nur fuer den Admin' }, { status: 403 });
  }
  const id = new URL(request.url).searchParams.get('id') ?? '';
  const liste = (await lies()).filter((e) => e.id !== id);
  await schreibe(liste);
  return NextResponse.json({ success: true, versteckt: liste.length });
}
