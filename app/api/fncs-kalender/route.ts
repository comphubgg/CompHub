import { NextResponse } from 'next/server';
import { CDN_FRIST } from '@/lib/antwortSpeicher';
import { GET as szeneLesen } from '../szene-stats/route';

/*
 * Der FNCS-Kalender: wer in welchem FNCS-Finale seit Chapter 5 Season 3 welchen Platz belegt hat.
 *
 * Der Betreiber (12.10.2026): unter dem letzten Turnier "so eine Art Kalender ... von jeder einzelnen FNCS seit
 * Chapter 5, Season 3. Welcher Platz, in welchem FNCS", mit anderen Spielern als beim Vorbild. Die Plaetze stehen schon
 * in der Akte jedes Spielers (fncsTafel, siehe lib/profilTafeln); hier werden ein paar Akten nebeneinandergelegt.
 * Eine Null heisst: nicht qualifiziert.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Wessen Plaetze gezeigt werden - bewusst nicht dieselben wie beim Vorbild (hoechstens Vico). */
const SPIELER = [
  '7061094036324a849b1ba468bb581df3', // Scroll
  '2f98535a2b2a43d0922c1aa56034cbb6', // Sky
  '9868429b133a42b8a43f737887da4673', // Pollo
  '68c17d1eea3c42ad98d72b48675242ea', // Darm
  'dca13c0626af4af7aadf39c3ba44914b', // Demus
  'ed7958600321496fa7ca0ed2ee544051', // Charyy
  '02c93e4588f241baa6cb5040632326b4', // Vico
  'b39cded93b0f4aa59ffdadf0db18e853', // Pixie
];

interface Tafel { saison: string; platz: number }
interface Akte { spieler?: { anzeige?: string; name?: string; land?: string | null; bild?: string | null }; fncsTafel?: Tafel[] }

let merker: { bis: number; antwort: unknown } | null = null;

export async function GET() {
  if (merker && merker.bis > Date.now()) {
    return NextResponse.json(merker.antwort, { headers: { 'Cache-Control': CDN_FRIST } });
  }
  const akten = await Promise.all(SPIELER.map(async (id) => {
    try {
      const r = await szeneLesen(new Request(`http://localhost/api/szene-stats?spieler=${id}`));
      return await r.json() as Akte;
    } catch { return null; }
  }));

  // Ab CH5 S3 - die Liste jedes Spielers ist zeitlich geordnet.
  const ab = (liste: Tafel[]) => {
    const i = liste.findIndex((z) => z.saison === 'CH5 S3');
    return i >= 0 ? liste.slice(i) : [];
  };
  const reihe: string[] = [];
  for (const a of akten) {
    const liste = ab(a?.fncsTafel ?? []);
    let zuletzt = -1;
    for (const z of liste) {
      const da = reihe.indexOf(z.saison);
      if (da >= 0) { zuletzt = da; continue; }
      reihe.splice(zuletzt + 1, 0, z.saison);
      zuletzt += 1;
    }
  }

  const zeilen = akten.map((a, i) => {
    if (!a?.spieler) return null;
    const liste = ab(a.fncsTafel ?? []);
    return {
      id: SPIELER[i], name: a.spieler.anzeige || a.spieler.name || '', land: a.spieler.land ?? null, bild: a.spieler.bild ?? null,
      zellen: reihe.map((s) => { const z = liste.find((x) => x.saison === s); return z ? z.platz : null; }),
    };
  }).filter((z): z is NonNullable<typeof z> => !!z && !!z.name);

  const antwort = { ok: zeilen.length > 0 && reihe.length > 0, spalten: reihe, zeilen };
  if (antwort.ok) merker = { bis: Date.now() + 30 * 60_000, antwort };
  return NextResponse.json(antwort, { headers: { 'Cache-Control': antwort.ok ? CDN_FRIST : 'no-store' } });
}
