import { NextResponse } from 'next/server';
import path from 'path';
import { liesJson } from '@/lib/ablage';
import { kernname } from '@/lib/homoglyph';

/*
 * Wer hat schon ein echtes Foto? Fuer den Konsolen-Befehl des Betreibers (31.10.2026, tools/fotos-sammeln.js): er laeuft auf fremden Seiten mit
 * Spielerbildern und zeigt nur die Spieler, die hier noch keins haben. Deshalb offen fuer jede Herkunft (CORS) - es stehen nur Namen drin.
 *
 * Je Spieler alle Schreibweisen, die vorkommen (Profil, Epic-Name, Turniername, Szene-Liste), als Schluessel: Kleinbuchstaben und Ziffern, ohne Orgtag.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schluessel = (n: string | undefined) => (n ? kernname(n).toLowerCase().replace(/[^a-z0-9]/g, '') : '');

export async function GET() {
  const [bilder, profile, szene] = await Promise.all([
    liesJson<Array<{ epicId: string; name?: string; turniername?: string; echtesFoto?: boolean }>>('spielerbilder.json', []),
    liesJson<Record<string, { anzeige?: string; name?: string }>>('spieler-profile.json', {}),
    liesJson<Array<{ ID?: string; NAME?: string }>>(path.join('szene-quelle', 'spielerliste.json'), []),
  ]);
  const mitFoto = new Set(bilder.filter((b) => b.epicId && b.echtesFoto).map((b) => b.epicId));
  const namen = new Set<string>();
  const dazu = (n: string | undefined) => { const k = schluessel(n); if (k.length >= 2) namen.add(k); };
  for (const b of bilder) if (mitFoto.has(b.epicId)) { dazu(b.name); dazu(b.turniername); }
  for (const id of mitFoto) { dazu(profile[id]?.anzeige); dazu(profile[id]?.name); }
  for (const s of szene) if (s.ID && mitFoto.has(s.ID)) dazu(s.NAME);
  return NextResponse.json({ spieler: mitFoto.size, namen: [...namen].sort() }, {
    headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=600' },
  });
}
