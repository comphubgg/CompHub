import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { gesamtSummen, heimatRegionen } from '@/lib/szeneStats';
import { DATEN_ORT } from '@/lib/datenOrt';

// Alles, was das Player Center ueber einen Spieler wissen muss - an einer
// Stelle.
//
// Bisher wurden Flagge und X-Konto im Beitrags-Panel gepflegt, mitten
// zwischen den Kacheln eines einzelnen Spieltags. Das hiess: wer nicht gerade
// mitgespielt hat, war nicht zu erreichen, und wer in mehreren Cups antrat,
// tauchte immer wieder auf. Hier steht stattdessen das ganze Archiv, nach
// Region geordnet.
//
//   GET                     -> alle Konten mit Werten, Region, Flagge, Foto
//   GET ?region=EU          -> nur diese Heimatregion
//   GET ?mindestens=20      -> erst ab so vielen Matches (Standard 1)
//
// Der Schluessel ist ueberall die Epic-Konto-ID. Namen wechseln von Turnier
// zu Turnier - wer danach zuordnet, heftet einem Nachahmer die Flagge des
// Profis an.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PROFILE = path.join(DATEN_ORT, 'spieler-profile.json');
const BILDER = path.join(DATEN_ORT, 'spielerbilder.json');
const SZENE = path.join(DATEN_ORT, 'szene-quelle', 'spielerliste.json');

interface Profil {
  id?: string; name: string; namen?: string[];
  land?: string; x?: string; region?: string; anzeige?: string;
}

async function liesProfile(): Promise<Map<string, Profil>> {
  const karte = new Map<string, Profil>();
  try {
    const roh = JSON.parse(await fs.readFile(PROFILE, 'utf8')) as Record<string, Profil>;
    for (const [schluessel, p] of Object.entries(roh)) {
      const id = p.id || (/^[0-9a-f]{32}$/i.test(schluessel) ? schluessel : '');
      if (id) karte.set(id, p);
    }
  } catch { /* noch keine gepflegt */ }
  return karte;
}

/** Nur echte Fotos - die geteilte Silhouette ist keins. */
async function liesFotos(): Promise<Map<string, string>> {
  const karte = new Map<string, string>();
  try {
    const roh = JSON.parse(await fs.readFile(BILDER, 'utf8')) as
      Array<{ datei: string; epicId: string; echtesFoto?: boolean }>;
    for (const e of roh) {
      if (e.epicId && e.echtesFoto && e.datei) {
        karte.set(e.epicId, `/spielerbilder/${encodeURIComponent(e.datei)}`);
      }
    }
  } catch { /* noch keine da */ }
  return karte;
}

/** Die Herkunftslaender der Szene-Quelle, nach Konto. */
async function liesLaender(): Promise<Map<string, string>> {
  const karte = new Map<string, string>();
  try {
    const roh = JSON.parse(await fs.readFile(SZENE, 'utf8')) as
      Array<{ ID?: string; COUNTRY?: string }>;
    for (const p of roh) {
      const id = (p.ID ?? '').trim();
      const land = (p.COUNTRY ?? '').trim().toUpperCase();
      if (id && /^[A-Z]{2}$/.test(land)) karte.set(id, land);
    }
  } catch { /* keine Kopie da */ }
  return karte;
}

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const nurRegion = (p.get('region') ?? '').toUpperCase();
  const mindestens = Math.max(1, Number(p.get('mindestens')) || 1);

  const [alle, heimat, profile, fotos, laender] = await Promise.all([
    gesamtSummen(), heimatRegionen(), liesProfile(), liesFotos(), liesLaender(),
  ]);

  const spieler = alle
    .filter((s) => s.matches >= mindestens)
    .map((s) => {
      const pr = profile.get(s.epicId);
      const region = heimat.get(s.epicId) ?? s.regionen[0] ?? '';
      return {
        epicId: s.epicId,
        // Gepflegter Name schlaegt den Turniernamen - Pros wechseln den
        // staendig, der gepflegte ist eine Entscheidung.
        name: pr?.anzeige || pr?.name || s.name,
        turniername: s.name,
        namen: s.namen,
        region,
        // Was von Hand eingetragen wurde, gilt; sonst die Quelle. Und
        // "quelle" sagt, woher die Flagge kommt - so ist zu sehen, wo noch
        // niemand hingesehen hat.
        land: pr?.land || laender.get(s.epicId) || '',
        landQuelle: pr?.land ? 'gepflegt' : (laender.get(s.epicId) ? 'quelle' : ''),
        x: pr?.x ?? '',
        gepflegt: Boolean(pr),
        foto: fotos.get(s.epicId) ?? null,
        matches: s.matches,
        events: s.events,
        elims: s.elims,
      };
    })
    .filter((s) => !nurRegion || s.region === nurRegion)
    // Wer am meisten spielt, steht oben - dort lohnt die Pflege zuerst.
    .sort((a, b) => b.matches - a.matches);

  const jeRegion: Record<string, number> = {};
  for (const s of alle) {
    if (s.matches < mindestens) continue;
    const r = heimat.get(s.epicId) ?? s.regionen[0] ?? '?';
    jeRegion[r] = (jeRegion[r] ?? 0) + 1;
  }

  return NextResponse.json({
    success: true,
    spieler,
    jeRegion,
    gesamt: spieler.length,
    ohneFlagge: spieler.filter((s) => !s.land).length,
    ohneKonto: spieler.filter((s) => !s.x).length,
  });
}
