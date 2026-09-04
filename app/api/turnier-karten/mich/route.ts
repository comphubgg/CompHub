import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { werSchreibt } from '@/lib/werSchreibt';
import { DATEN_ORT } from '@/lib/datenOrt';

/*
 * Ein Pro setzt sich selbst auf der Karte.
 *
 *   POST { karte, spot }   spot = null nimmt einen wieder herunter
 *
 * Bewusst keine zweite Speicherstelle fuer ganze Karten: hier kommt nur an,
 * WOHIN, und der Server sucht sich selbst heraus, WEN es betrifft - naemlich
 * das Team, in dem das verknuepfte Epic-Konto des Anfragenden steht. Damit
 * kann auch ein manipulierter Aufruf niemanden sonst verschieben und keine
 * Form veraendern.
 *
 * Die Rolle entscheidet, nicht die Verknuepfung allein: ein Epic-Konto kann
 * sich jeder selbst ins Profil schreiben, die Rolle "pro" vergibt nur der
 * Betreiber. Ohne diese Bedingung koennte sich jemand die Konto-Id eines
 * bekannten Spielers eintragen und ihn auf der Karte herumschieben.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DATEI = path.join(DATEN_ORT, 'turnier-karten.json');

interface Team { id: string; ids?: string[] }
interface Spot { id: string; teams: string[] }
interface Karte {
  id: string; gesperrt?: boolean; spots: Spot[]; teams: Team[]; geaendert: number;
}

export async function POST(request: Request) {
  const wer = await werSchreibt();
  const darf = wer.rolle === 'pro' || wer.rolle === 'manager' || wer.rolle === 'admin';
  if (!darf || !wer.epicId) {
    return NextResponse.json(
      { error: 'This needs a linked Epic account and the Pro role.' },
      { status: 403 });
  }

  const { karte: karteId, spot: spotId } = await request.json() as
    { karte?: string; spot?: string | null };
  if (!karteId) return NextResponse.json({ error: 'map is missing' }, { status: 400 });

  let karten: Karte[];
  try {
    karten = JSON.parse(await fs.readFile(DATEI, 'utf8')) as Karte[];
  } catch {
    return NextResponse.json({ error: 'No maps stored yet.' }, { status: 404 });
  }

  const k = karten.find((x) => x.id === karteId);
  if (!k) return NextResponse.json({ error: 'Unknown map' }, { status: 404 });
  // Das Schloss gilt fuer alle, auch fuer den Betreiber selbst.
  if (k.gesperrt) {
    return NextResponse.json({ error: 'This map is locked.' }, { status: 409 });
  }

  const meins = k.teams.find((t) => (t.ids ?? []).includes(wer.epicId!));
  if (!meins) {
    return NextResponse.json(
      { error: 'Your account is not in this map’s team list.' },
      { status: 404 });
  }
  if (spotId && !k.spots.some((s) => s.id === spotId)) {
    return NextResponse.json({ error: 'Unknown shape' }, { status: 404 });
  }

  // Erst ueberall abziehen, dann genau einmal setzen. Ein Team steht an einem
  // Ort - und das Abziehen betrifft ausschliesslich die eigene Team-Id.
  k.spots = k.spots.map((s) => {
    const ohne = s.teams.filter((t) => t !== meins.id);
    const drauf = s.id === spotId ? [...ohne, meins.id] : ohne;
    return drauf.length === s.teams.length
      && drauf.every((t, i) => t === s.teams[i]) ? s : { ...s, teams: drauf };
  });
  k.geaendert = Date.now();

  try {
    await fs.writeFile(DATEI, JSON.stringify(karten, null, 2), 'utf8');
  } catch {
    return NextResponse.json({ error: 'Not saved' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, team: meins.id, spot: spotId ?? null });
}
