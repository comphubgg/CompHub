import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { DATEN_ORT } from '@/lib/datenOrt';

// Die Formen je Kartenbild - ohne Spieler.
//
// Auf der Battle-Royale-Insel liegen andere Spots als auf einer Reload-Karte,
// und sie aendern sich kaum. Deshalb werden sie getrennt von den Turnierkarten
// gehalten: einmal gezeichnet, bleiben sie liegen und stehen beim naechsten
// Turnier wieder bereit.
//
// Die Zuordnung der Teams gehoert dagegen zum einzelnen Turnier und wird
// nur beim Veroeffentlichen festgehalten (siehe /api/turnier-karten).
//
//   GET ?bild=…      -> die Formen zu diesem Kartenbild
//   POST { bild, spots } -> Formen sichern (passiert im Editor von selbst)

const DATEI = path.join(DATEN_ORT, 'karten-vorlagen.json');

/** Leerer Bildschluessel heisst: die oeffentliche Fortnite-Karte. */
const STANDARD = 'fortnite-karte';

interface Punkt { x: number; y: number }
interface Spot {
  id: string;
  form: 'rechteck' | 'polygon';
  punkte: Punkt[];
  name?: string;
  farbe?: string;
}
type Vorlagen = Record<string, { spots: Spot[]; geaendert: number }>;

async function lies(): Promise<Vorlagen> {
  try {
    return JSON.parse(await fs.readFile(DATEI, 'utf8')) as Vorlagen;
  } catch {
    return {};
  }
}

export async function GET(request: Request) {
  const bild = new URL(request.url).searchParams.get('bild') || STANDARD;
  const alle = await lies();
  const v = alle[bild];
  // Teamliste leer mitgeben: die Form ist damit vollstaendig, ohne dass
  // eine Zuordnung aus einem alten Turnier mitkommt.
  const spots = (v?.spots ?? []).map((sp) => ({ ...sp, teams: [] as string[] }));
  return NextResponse.json({ bild, spots, geaendert: v?.geaendert ?? null });
}

export async function POST(request: Request) {
  const eingang = await request.json() as { bild?: string; spots?: Spot[] };
  const bild = eingang.bild || STANDARD;

  // Bewusst ohne Teams: die Vorlage soll nur die Formen halten.
  const spots = (eingang.spots ?? []).map((s) => ({
    id: s.id, form: s.form, punkte: s.punkte,
    ...(s.name ? { name: s.name } : {}),
    ...(s.farbe ? { farbe: s.farbe } : {}),
  }));

  const alle = await lies();
  alle[bild] = { spots, geaendert: Date.now() };
  await fs.mkdir(path.dirname(DATEI), { recursive: true });
  await fs.writeFile(DATEI, JSON.stringify(alle, null, 2), 'utf8');

  return NextResponse.json({ ok: true, bild, spots: spots.length });
}
