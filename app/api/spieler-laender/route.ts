import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { DATEN_ORT } from '@/lib/datenOrt';

// Das Herkunftsland je Konto - so, wie es die Statistikseite schon zeigt.
//
// Warum als eigene Schnittstelle: Die Laender stehen in der gespiegelten
// Spielerliste der Szene-Quelle und sind dort ueber die Epic-Konto-ID
// geschluesselt. Die Statistikseite liest sie serverseitig mit; das
// Beitrags-Panel laeuft im Browser und kam bisher nicht daran - dort stand
// deshalb bei jedem, dessen Flagge nicht von Hand gepflegt war, eine
// Weltkugel, obwohl das Land bekannt ist.
//
// Von 4071 Konten in der Liste haben 3538 ein Land. Das ist der Unterschied
// zwischen einem Beitrag voller Weltkugeln und einem mit Flaggen.
//
//   GET             ->  { laender: { "<epicId>": "PL", … } }
//   GET ?namen=1    ->  zusaetzlich { nachName: { "scroll": "DK", … } }
//
// Die zweite Fassung ist fuer die Tierlist. Dort werden Spieler als Namen
// gezogen, nicht als Konto-Ids - sie kann also nicht ueber die Id
// nachschlagen. Die Zuordnung entsteht deshalb hier, wo beide Seiten
// vorliegen: Konto-Id -> Land aus der Quelle, Konto-Id -> alle Namen aus dem
// Namensverzeichnis.
//
// Das bleibt ein Namensweg und damit unscharf - zwei Spieler koennen auf
// dieselbe Schreibweise fallen. Deshalb gilt: gibt es zu einem Namen mehr
// als ein Land, faellt er heraus. Lieber keine Flagge als die falsche.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DATEI = path.join(DATEN_ORT, 'szene-quelle', 'spielerliste.json');
const NAMEN = path.join(DATEN_ORT, 'spieler-namen.json');
const PROFILE = path.join(DATEN_ORT, 'spieler-profile.json');

/** Dieselbe Vereinfachung, die die Tierlist beim Nachschlagen benutzt. */
function namensSchluessel(name: string) {
  return String(name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

interface RohSpieler { ID?: string; NAME?: string; COUNTRY?: string }

let karte: Record<string, string> | null = null;
let bis = 0;

/**
 * Land je Namensschluessel.
 *
 * Zwei Quellen, gepflegtes Profil zuerst: was von Hand eingetragen wurde,
 * ist geprueft. Danach die Szene-Quelle ueber das Namensverzeichnis.
 *
 * Mehrdeutige Namen fallen heraus. "rapid" gehoert in NAC einem anderen
 * Konto als in EU - eine Flagge fuer beide waere in einem von beiden Faellen
 * falsch, und falsch ist schlimmer als leer.
 */
async function nachNamen(nachId: Record<string, string>, rohe: RohSpieler[]) {
  const gefunden = new Map<string, Set<string>>();
  const merke = (name: string, land: string) => {
    const k = namensSchluessel(name);
    if (k.length < 2) return;
    if (!gefunden.has(k)) gefunden.set(k, new Set());
    gefunden.get(k)!.add(land);
  };

  // Der Name, unter dem die Quelle das Konto selbst fuehrt. Das ist der
  // ergiebigste Weg: 3473 der 3538 Konten mit Land tragen dort einen Namen.
  for (const p of rohe) {
    const land = nachId[(p.ID ?? '').trim()];
    if (land && p.NAME) merke(p.NAME, land);
  }

  // Dazu die frueheren Namen aus dem Verzeichnis - Spieler benennen sich um,
  // und auf einer aelteren Tierlist steht oft noch der alte Name.
  try {
    const namen = JSON.parse(await fs.readFile(NAMEN, 'utf8')) as
      Record<string, { namen?: string[]; haupt?: string }>;
    for (const [id, e] of Object.entries(namen)) {
      const land = nachId[id];
      if (!land) continue;
      for (const n of [...(e.namen ?? []), e.haupt ?? '']) if (n) merke(n, land);
    }
  } catch { /* ohne Verzeichnis nur die Namen der Quelle */ }

  const raus: Record<string, string> = {};
  for (const [k, laender] of gefunden) {
    if (laender.size === 1) raus[k] = [...laender][0];
  }

  // Gepflegte Profile zuletzt - sie ueberschreiben und gelten auch dort,
  // wo die Quelle uneinig war.
  try {
    const profile = JSON.parse(await fs.readFile(PROFILE, 'utf8')) as
      Record<string, { name?: string; anzeige?: string; namen?: string[]; land?: string }>;
    for (const p of Object.values(profile)) {
      const land = (p.land ?? '').trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(land)) continue;
      for (const n of [...(p.namen ?? []), p.name ?? '', p.anzeige ?? '']) {
        const k = namensSchluessel(n);
        if (k.length >= 2) raus[k] = land;
      }
    }
  } catch { /* dann eben nur die Quelle */ }

  return raus;
}

export async function GET(request: Request) {
  const mitNamen = new URL(request.url).searchParams.get('namen') === '1';

  if (karte && Date.now() < bis && !mitNamen) {
    return NextResponse.json({ laender: karte, konten: Object.keys(karte).length });
  }

  const raus: Record<string, string> = {};
  let rohe: RohSpieler[] = [];
  try {
    rohe = JSON.parse(await fs.readFile(DATEI, 'utf8')) as RohSpieler[];
    for (const p of rohe) {
      const id = (p.ID ?? '').trim();
      const land = (p.COUNTRY ?? '').trim().toUpperCase();
      // Nur zweistellige Kuerzel. In der Quelle stehen vereinzelt leere
      // Felder und Platzhalter; ein "??" als Flagge waere schlimmer als die
      // Weltkugel, die es ersetzen soll.
      if (id && /^[A-Z]{2}$/.test(land)) raus[id] = land;
    }
  } catch { /* keine Kopie da - dann eben keine Laender */ }

  karte = raus;
  bis = Date.now() + 10 * 60_000;
  return NextResponse.json({
    laender: raus,
    konten: Object.keys(raus).length,
    ...(mitNamen ? { nachName: await nachNamen(raus, rohe) } : {}),
  });
}
