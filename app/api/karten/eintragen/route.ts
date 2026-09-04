import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { promises as fs } from 'fs';
import path from 'path';
import { kontoAus, nachId } from '@/lib/konten';
import { DATEN_ORT } from '@/lib/datenOrt';

// Ein Profi traegt sich selbst auf einer Karte ein.
//
//   GET  ?karte=<id>                 -> Zustand der Karte, zum Mitverfolgen
//   POST { karte, spot }             -> mich auf diesen Spot setzen
//   POST { karte, spot: null }       -> mich herunternehmen
//
// Wer darf das? Nur ein Konto mit der Rolle "pro", dessen Epic-Konto in der
// Teamliste genau dieser Karte steht. Damit setzt jeder nur sich selbst -
// und zwar auf einer Karte, deren Cup er auch gespielt hat.
//
// Zwei Dinge, die der Betreiber ausdruecklich wollte:
//
//   * Bestehende Zuordnungen bleiben unberuehrt. Bewegt wird ausschliesslich
//     das eigene Team; die Arbeit, die er von Hand gemacht hat, fasst
//     niemand an.
//   * Auf einer gesperrten Karte geht nichts. Das Schloss ist seine
//     Entscheidung und gilt auch fuer Profis.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DATEI = path.join(DATEN_ORT, 'turnier-karten.json');
const COOKIE = 'streamer_dashboard_konto';

interface Team { id: string; spieler: string[]; ids: string[]; farbe?: string }
interface Spot { id: string; form: string; punkte: unknown[]; teams: string[] }
interface Karte {
  id: string; titel: string; oeffentlich?: boolean; gesperrt?: boolean;
  spots: Spot[]; teams: Team[]; geaendert?: number;
}

async function lies(): Promise<{ karten: Karte[]; roh: unknown }> {
  const roh = JSON.parse(await fs.readFile(DATEI, 'utf8'));
  const karten = Array.isArray(roh) ? roh : (roh.karten ?? []);
  return { karten, roh };
}

async function schreibe(roh: unknown, karten: Karte[]) {
  const raus = Array.isArray(roh) ? karten : { ...(roh as object), karten };
  await fs.writeFile(DATEI, JSON.stringify(raus, null, 2), 'utf8');
}

/** Das Konto des Anfragenden - oder null. */
async function wer() {
  const id = kontoAus((await cookies()).get(COOKIE)?.value);
  if (!id) return null;
  const k = await nachId(id);
  if (!k || k.gesperrt) return null;
  return k;
}

export async function GET(request: Request) {
  const karteId = new URL(request.url).searchParams.get('karte') ?? '';
  const { karten } = await lies();
  const karte = karten.find((k) => k.id === karteId);
  if (!karte) return NextResponse.json({ fehler: 'nicht gefunden' }, { status: 404 });

  const konto = await wer();
  const eigenes = konto?.epicId
    ? karte.teams.find((t) => (t.ids ?? []).includes(konto.epicId as string))
    : undefined;

  /*
   * Nur was zum Zeichnen noetig ist. Wer wo steht, ist ohnehin oeffentlich,
   * sobald die Karte es ist - aber die Epic-Ids der uebrigen Spieler gehen
   * niemanden etwas an, deshalb bleiben sie hier draussen.
   */
  return NextResponse.json({
    ok: true,
    geaendert: karte.geaendert ?? 0,
    gesperrt: Boolean(karte.gesperrt),
    oeffentlich: Boolean(karte.oeffentlich),
    belegung: karte.spots.map((s) => ({ spot: s.id, teams: s.teams ?? [] })),
    teams: karte.teams.map((t) => ({
      id: t.id, spieler: t.spieler, farbe: t.farbe ?? null,
    })),
    /** Mein eigenes Team auf dieser Karte - null, wenn ich nicht mitspiele. */
    meinTeam: eigenes ? eigenes.id : null,
    darfEintragen: Boolean(eigenes) && konto?.rolle === 'pro' && !karte.gesperrt,
  });
}

export async function POST(request: Request) {
  const konto = await wer();
  if (!konto) {
    return NextResponse.json({ fehler: 'nicht angemeldet' }, { status: 401 });
  }
  if (konto.rolle !== 'pro') {
    return NextResponse.json(
      { fehler: 'Das dürfen nur Profispieler.' }, { status: 403 });
  }
  if (!konto.epicId) {
    return NextResponse.json(
      { fehler: 'Zu diesem Konto ist kein Epic-Konto hinterlegt.' },
      { status: 400 });
  }

  const koerper = await request.json().catch(() => ({}));
  const karteId = String(koerper.karte ?? '');
  const spotId = koerper.spot === null ? null : String(koerper.spot ?? '');

  const { karten, roh } = await lies();
  const karte = karten.find((k) => k.id === karteId);
  if (!karte) return NextResponse.json({ fehler: 'nicht gefunden' }, { status: 404 });

  // Das Schloss gilt auch fuer Profis - es ist die Entscheidung des Betreibers.
  if (karte.gesperrt) {
    return NextResponse.json(
      { fehler: 'Diese Karte ist gesperrt.' }, { status: 403 });
  }

  const eigenes = karte.teams.find((t) => (t.ids ?? []).includes(konto.epicId as string));
  if (!eigenes) {
    return NextResponse.json(
      { fehler: 'Du stehst nicht im Feld dieses Cups.' }, { status: 403 });
  }

  if (spotId !== null && !karte.spots.some((s) => s.id === spotId)) {
    return NextResponse.json({ fehler: 'Diesen Spot gibt es nicht.' }, { status: 400 });
  }

  /*
   * Erst ueberall herausnehmen, dann an einer Stelle eintragen.
   *
   * Nur das eigene Team wird angefasst - jede andere Zuordnung bleibt
   * genau, wie sie war. Ohne das Herausnehmen stuende dasselbe Team nach
   * dem Umsetzen an zwei Stellen.
   */
  for (const s of karte.spots) {
    s.teams = (s.teams ?? []).filter((id) => id !== eigenes.id);
  }
  if (spotId !== null) {
    const ziel = karte.spots.find((s) => s.id === spotId)!;
    ziel.teams = [...(ziel.teams ?? []), eigenes.id];
  }
  karte.geaendert = Date.now();

  await schreibe(roh, karten);

  return NextResponse.json({
    ok: true,
    geaendert: karte.geaendert,
    meinTeam: eigenes.id,
    belegung: karte.spots.map((s) => ({ spot: s.id, teams: s.teams ?? [] })),
  });
}
