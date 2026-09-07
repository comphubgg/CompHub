import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { DATEN_ORT } from '@/lib/datenOrt';

// Die Endtabelle eines Spieltags - Platz, Team, Punkte, Matches.
//
//   ?window=<windowId>[&saison=S42]
//
// Warum eigens: die Statistikseite zeigt zu einem Spieltag bisher nur
// Bestenlisten je Kennzahl ("meiste Elims"). Der Betreiber wollte darunter
// die eigentliche Tabelle sehen - wer wurde Erster, Zweiter, Dritter.
//
// Gelesen wird die gespiegelte Bestenliste, nicht Epic selbst: sie liegt
// ohnehin unter data/epic-spieltage (und aelter unter data/platzierungen),
// und ein Blick in die Statistik soll keine Abfrage bei Epic ausloesen.
// Deshalb kommt die Tabelle auch fuer Spieltage, deren Fenster Epic
// laengst nicht mehr vorhaelt.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Team { platz: number; punkte: number; matches?: number; teamElims?: number; spieler: string[] }

async function liesDatei(ordner: string, saison: string, fenster: string) {
  try {
    return JSON.parse(await fs.readFile(
      path.join(DATEN_ORT, ordner, saison, `${fenster}.json`), 'utf8')) as
      { teams?: Team[] };
  } catch { return null; }
}

/** Konto-Id zu Anzeigename und Land - dieselbe Kette wie ueberall sonst. */
async function namensKarte(): Promise<Map<string, { name: string; land: string }>> {
  const karte = new Map<string, { name: string; land: string }>();

  try {
    const roh = JSON.parse(await fs.readFile(
      path.join(DATEN_ORT, 'spieler-namen.json'), 'utf8')) as
      Record<string, { haupt?: string; namen?: string[] }>;
    for (const [id, e] of Object.entries(roh)) {
      const n = e.haupt || e.namen?.[0];
      if (n) karte.set(id, { name: n, land: '' });
    }
  } catch { /* kein Verzeichnis */ }

  try {
    const roh = JSON.parse(await fs.readFile(
      path.join(DATEN_ORT, 'szene-quelle', 'spielerliste.json'), 'utf8')) as
      Array<{ ID?: string; NAME?: string; COUNTRY?: string }>;
    for (const p of roh) {
      if (!p.ID || !p.NAME) continue;
      karte.set(p.ID, { name: p.NAME, land: (p.COUNTRY || '').toUpperCase() });
    }
  } catch { /* keine Kopie da */ }

  // Der gepflegte Name gewinnt - er ist die Entscheidung des Betreibers.
  try {
    const roh = JSON.parse(await fs.readFile(
      path.join(DATEN_ORT, 'spieler-profile.json'), 'utf8')) as
      Record<string, { id?: string; name?: string; anzeige?: string; land?: string }>;
    for (const [schluessel, pr] of Object.entries(roh)) {
      const id = pr.id || (/^[0-9a-f]{32}$/i.test(schluessel) ? schluessel : '');
      if (!id) continue;
      const vorher = karte.get(id);
      karte.set(id, {
        name: pr.anzeige || pr.name || vorher?.name || id.slice(0, 8),
        land: pr.land || vorher?.land || '',
      });
    }
  } catch { /* noch keine Profile */ }

  return karte;
}

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const fenster = p.get('window');
  if (!fenster) {
    return NextResponse.json({ error: 'window ist noetig' }, { status: 400 });
  }
  const saison = p.get('saison')
    ?? /^(S\d+)_/i.exec(fenster)?.[1]?.toUpperCase() ?? '';

  const daten = await liesDatei('epic-spieltage', saison, fenster)
    ?? await liesDatei('platzierungen', saison, fenster);

  if (!daten?.teams?.length) {
    return NextResponse.json({
      vorhanden: false, teams: [],
      hinweis: 'Zu diesem Spieltag ist keine Bestenliste gespiegelt.',
    });
  }

  const namen = await namensKarte();
  const teams = daten.teams
    .slice()
    .sort((a, b) => a.platz - b.platz)
    .map((t) => ({
      platz: t.platz,
      punkte: t.punkte,
      matches: t.matches ?? null,
      elims: t.teamElims ?? null,
      spieler: (t.spieler ?? []).map((id) => ({
        epicId: id,
        name: namen.get(id)?.name ?? id.slice(0, 8),
        land: namen.get(id)?.land ?? '',
      })),
    }));

  return NextResponse.json({ vorhanden: true, teams });
}
