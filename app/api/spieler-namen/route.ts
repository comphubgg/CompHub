import { NextResponse } from 'next/server';
import fs from '@/lib/ablageFs';
import path from 'path';
import { namensSchluessel } from '@/lib/homoglyph';
import { DATEN_ORT } from '@/lib/datenOrt';
import { liesJson } from '@/lib/ablage';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import { istKennungName } from '@/lib/kennungName';
import { epicNamen } from '@/lib/epicNamenVorrat';

// Namensverzeichnis: welche Namen gehoeren zu welchem Epic-Konto?
//
// Pros treten in Turnieren oft unter wechselnden Namen an - mal mit Orgtag,
// mal ohne, mal mit einem Spitznamen. Die Epic-Konto-ID bleibt dabei gleich.
// Ueber sie laesst sich zusammenfuehren, was zusammengehoert: aus "big tryonа"
// wird so wieder "BIG vic0".
//
// Die Zuordnung entsteht nur aus unseren eigenen Daten: Epics Anzeigenamen
// je Konto (epic-namen.json - aus den Turnier-Bestenlisten und dem taeglichen
// Abgleich, scripts/pro-namen-erneuern.mjs) und den gepflegten Profilen
// (Name, Anzeigename, weitere Namen).
//
//   GET                  -> die gespeicherte Zuordnung
//   POST (Admin)         -> neu aufbauen

const DATEI = path.join(DATEN_ORT, 'spieler-namen.json');
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
  if (!await istAdminAnfrage()) return NextResponse.json({ ok: false, error: 'Nur für Admins.' }, { status: 403 });
  const zaehler = new Map<string, Map<string, number>>();
  const zaehle = (id: string, name: unknown, gewicht = 1) => {
    const k = String(id ?? '').toLowerCase();
    const n = String(name ?? '').trim();
    if (!/^[0-9a-f]{32}$/.test(k) || !n || istKennungName(n, k)) return;
    if (!zaehler.has(k)) zaehler.set(k, new Map());
    const m = zaehler.get(k)!;
    m.set(n, (m.get(n) ?? 0) + gewicht);
  };
  const [epic, profile] = await Promise.all([
    epicNamen(),
    liesJson<Record<string, { id?: string; name?: string; anzeige?: string; namen?: string[] }>>('spieler-profile.json', {}).catch(() => ({})),
  ]);
  for (const [id, n] of Object.entries(epic)) zaehle(id, n, 2);
  for (const [k, p] of Object.entries(profile ?? {})) {
    const id = p?.id || k;
    for (const n of [p?.anzeige, p?.name, ...(p?.namen ?? [])]) zaehle(id, n);
  }
  const dateien = 2;

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
