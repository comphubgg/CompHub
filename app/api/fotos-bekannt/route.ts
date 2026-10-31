import { NextResponse } from 'next/server';
import path from 'path';
import { liesJson } from '@/lib/ablage';
import { namensSchluessel } from '@/lib/homoglyph';

/*
 * Wer hat schon ein echtes Foto? Fuer den Konsolen-Befehl des Betreibers (31.10.2026, tools/fotos-sammeln.js): er laeuft auf fremden Seiten mit
 * Spielerbildern und zeigt nur die Spieler, die hier noch keins haben. Deshalb offen fuer jede Herkunft (CORS) - es stehen nur Namen drin.
 *
 * Je Spieler alle Schreibweisen, die vorkommen (Profil, Epic-Name, Turniername, Szene-Liste), als Schluessel: Kleinbuchstaben und Ziffern, ohne Orgtag.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/*
 * Epics Namen sind voller Tarnung (31.10.2026: COLD, BOLTZ, ACORN ... standen als "fehlt", obwohl die Fotos da waren): kyrillische Zwillinge
 * ("twis сold 7ǃ"), Orgtags, angehaengte Zusaetze ("boltzZzero0", "Jayse1x", "Kraezfv"). Deshalb gefaltet (namensSchluessel), zusaetzlich ohne
 * typische Endungen - und der Dateiname des Fotos selbst, der ist sauber ("cold.jpg").
 */
const ENDUNG = /(1x|fv|fn|ttv|yt|zzero0|\d+)$/;
const schluessel = (n: string | undefined) => (n ? namensSchluessel(n) : '');

export async function GET() {
  const [bilder, profile, szene] = await Promise.all([
    liesJson<Array<{ epicId: string; datei?: string; name?: string; turniername?: string; echtesFoto?: boolean }>>('spielerbilder.json', []),
    liesJson<Record<string, { anzeige?: string; name?: string }>>('spieler-profile.json', {}),
    liesJson<Array<{ ID?: string; NAME?: string }>>(path.join('szene-quelle', 'spielerliste.json'), []),
  ]);
  const mitFoto = new Set(bilder.filter((b) => b.epicId && b.echtesFoto).map((b) => b.epicId));
  const namen = new Set<string>();
  const dazu = (n: string | undefined) => {
    const k = schluessel(n);
    if (k.length >= 2) namen.add(k);
    const kurz = k.replace(ENDUNG, '');
    if (kurz.length >= 3 && kurz !== k) namen.add(kurz);
  };
  for (const b of bilder) if (mitFoto.has(b.epicId)) { dazu(b.name); dazu(b.turniername); dazu(b.datei?.replace(/(-\d+)?\.(jpe?g|png|webp)$/i, '')); }
  for (const id of mitFoto) { dazu(profile[id]?.anzeige); dazu(profile[id]?.name); }
  for (const s of szene) if (s.ID && mitFoto.has(s.ID)) dazu(s.NAME);
  return NextResponse.json({ spieler: mitFoto.size, namen: [...namen].sort() }, {
    headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=600' },
  });
}
