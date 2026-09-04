import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { namensSchluessel } from '@/lib/homoglyph';
import { DATEN_ORT } from '@/lib/datenOrt';

// Namensverzeichnis: welche Namen gehoeren zu welchem Epic-Konto?
//
// Pros treten in Turnieren oft unter wechselnden Namen an - mal mit Orgtag,
// mal ohne, mal mit einem Spitznamen. Die Epic-Konto-ID bleibt dabei gleich.
// Ueber sie laesst sich zusammenfuehren, was zusammengehoert: aus "big tryonа"
// wird so wieder "BIG vic0".
//
// Die Zuordnung entsteht aus den Turnierdateien, die eucompetitive.com
// veroeffentlicht - dort steht zu jedem Spieler die Konto-ID dabei. Das
// Ergebnis liegt lokal, damit nicht bei jedem Aufruf gut hundert Dateien
// geladen werden muessen.
//
//   GET                  -> die gespeicherte Zuordnung
//   POST                 -> neu aufbauen (dauert etwa eine Minute)

const DATEI = path.join(DATEN_ORT, 'spieler-namen.json');
const BASIS = 'https://eucompetitive.com/APISYSTEMV2';
const REGIONEN = ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'];
const SEASONS = ['S41', 'S42'];

const KOPF = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
              + '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

export interface NamensEintrag {
  /** Vergleichbarer Kernname - fasst Tarnschreibweisen zusammen. */
  schluessel?: string;
  /** Alle beobachteten Namen, der zuletzt gesehene zuerst. */
  namen: string[];
  /** Vorschlag fuer den gelaeufigen Namen. */
  haupt: string;
}

type Verzeichnis = Record<string, NamensEintrag>;

/**
 * Welcher Name ist der gelaeufige? Ein Orgtag davor spricht dafuer, eine
 * angehaengte Nummer dagegen. Bei Gleichstand gewinnt der haeufigste.
 */
function waehleHaupt(zaehler: Map<string, number>): string {
  let bester = '';
  let bestePunkte = -Infinity;
  for (const [name, anzahl] of zaehler) {
    // Häufigkeit zählt, aber gedeckelt: ein oft benutzter Tarnname soll den
    // geläufigen Namen nicht verdrängen.
    let punkte = Math.min(anzahl, 4);
    const teile = name.trim().split(/\s+/);
    // Grossgeschriebener Orgtag am Anfang, etwa "AURA shxrk"
    if (teile.length > 1 && /^[A-Z0-9]{2,6}$/.test(teile[0])) punkte += 4;
    // Angehaengte Nummer wie "AUR shxrk 19" wirkt nach Wechselname
    if (/\s\d+[!ǃ]?$/.test(name)) punkte -= 2;
    // Buchstaben aus fremden Alphabeten sind das deutlichste Zeichen für eine
    // Tarnschreibweise - etwa das kyrillische a in "big tryonа".
    if (/[Ѐ-ӿͰ-Ͽ]/.test(name)) punkte -= 8;
    // Das Ausrufezeichen-Ersatzzeichen deutet ebenfalls auf einen Zweitnamen
    if (/ǃ/.test(name)) punkte -= 1;
    if (punkte > bestePunkte) { bestePunkte = punkte; bester = name; }
  }
  return bester;
}

async function lies(): Promise<Verzeichnis> {
  try {
    return JSON.parse(await fs.readFile(DATEI, 'utf8')) as Verzeichnis;
  } catch {
    return {};
  }
}

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const gesucht = p.get('id');
  const v = await lies();
  if (gesucht) {
    return NextResponse.json(v[gesucht] ?? { namen: [], haupt: '' });
  }

  /*
   * Nur Namensschluessel -> Konto-Id, als kompakte Zuordnung.
   *
   * Wozu: die Tierlist muss erkennen, dass "VICO" und "BIG TRYONA" dieselbe
   * Person sind. Ueber den Namen geht das nicht - die beiden haben keinen
   * Buchstaben gemeinsam, und keine noch so gute Bereinigung findet das.
   * Ueber die Konto-Id ist es eindeutig: beide Namen stehen unter
   * 02c93e4588f2…, genau wie "MALIBUCA" und "BIG CheeseBurgеr" unter
   * 881f4d75aa30… .
   *
   * Mehrdeutige Namen werden weggelassen, nicht geraten. Traegt derselbe
   * Name zwei Konten, waere jede Zuordnung eine Behauptung - dann bleibt es
   * beim Namensvergleich, der hoechstens nichts findet, aber nichts
   * Falsches zusammenlegt.
   */
  if (p.get('nachName') === '1') {
    const einmal = new Map<string, string>();
    const mehrdeutig = new Set<string>();
    for (const [id, e] of Object.entries(v)) {
      for (const name of [...(e.namen ?? []), e.haupt ?? '']) {
        const k = namensSchluessel(String(name ?? ''));
        if (!k) continue;
        const schon = einmal.get(k);
        if (schon && schon !== id) { mehrdeutig.add(k); continue; }
        einmal.set(k, id);
      }
    }
    for (const k of mehrdeutig) einmal.delete(k);
    return NextResponse.json({
      konten: Object.keys(v).length,
      nachName: Object.fromEntries(einmal),
    });
  }

  return NextResponse.json({
    konten: Object.keys(v).length,
    mehrfach: Object.values(v).filter((e) => e.namen.length > 1).length,
    verzeichnis: v,
  });
}

export async function POST() {
  const zaehler = new Map<string, Map<string, number>>();
  let dateien = 0;

  for (const season of SEASONS) {
    for (const region of REGIONEN) {
      let liste: string[] = [];
      try {
        const r = await fetch(`${BASIS}/list_stats_json.php?region=${region}&season=${season}`,
          { headers: KOPF, cache: 'no-store' });
        liste = await r.json() as string[];
      } catch { continue; }
      if (!Array.isArray(liste)) continue;

      for (const datei of liste) {
        try {
          const r = await fetch(`${BASIS}/DATA/${region}/${season}/stats/${datei}`,
            { headers: KOPF, cache: 'no-store' });
          if (!r.ok) continue;
          const j = await r.json() as { players?: Array<{ epicId: string; username: string }> };
          dateien++;
          for (const p of j.players ?? []) {
            if (!p.epicId || !p.username) continue;
            if (!zaehler.has(p.epicId)) zaehler.set(p.epicId, new Map());
            const m = zaehler.get(p.epicId)!;
            m.set(p.username, (m.get(p.username) ?? 0) + 1);
          }
        } catch { /* eine fehlende Datei ist kein Grund abzubrechen */ }
      }
    }
  }

  const verzeichnis: Verzeichnis = {};
  for (const [id, m] of zaehler) {
    const namen = [...m.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
    verzeichnis[id] = {
      namen,
      haupt: waehleHaupt(m),
      schluessel: namensSchluessel(namen[0] ?? ''),
    };
  }

  await fs.mkdir(path.dirname(DATEI), { recursive: true });
  await fs.writeFile(DATEI, JSON.stringify(verzeichnis, null, 0), 'utf8');

  return NextResponse.json({
    ok: true,
    dateien,
    konten: Object.keys(verzeichnis).length,
    mehrfach: Object.values(verzeichnis).filter((e) => e.namen.length > 1).length,
  });
}
