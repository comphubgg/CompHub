import { NextResponse } from 'next/server';
import fs from '@/lib/ablageFs';
import path from 'path';
import { DATEN_ORT } from '@/lib/datenOrt';
import { kernname } from '@/lib/homoglyph';
import { GLOBALS_EVENT, GLOBALS_TAGE } from '@/lib/globalsCup';
import { globalsTeams } from '@/lib/globalsTeams';

/*
 * Der echte Name zu einer Konto-Id - fuer die Beschriftung der Karten.
 *
 *   POST { ids: ["2b3da27c...", ...], event?: "epicgames_MannekenPis_Official" }
 *     -> { namen: { "2b3da27c...": "IDrop", ... } }
 *
 * Epic liefert den Namen, den ein Spieler gerade eingestellt hat - mit
 * Orgtag, Startnummer oder Anhaengsel ("Idropy281"). Der Betreiber
 * (24.9.2026): "Du weisst ja, wer der Spieler ist, wieso machst du dann diese
 * Zahlen hinten dran? ... Mach eine Art Filterung, dass die echten Namen
 * immer angezeigt werden." Deshalb geht es ueber das Konto, nie ueber den
 * Namen:
 *
 *   1. der gepflegte Anzeigename aus den Spielerprofilen,
 *   2. der Name aus der Spielerliste der Szene,
 *   3. der gelaeufige Name aus dem Namensverzeichnis, ohne Orgtag.
 *
 * Bei der Global Championship tragen die Karten Epics LAN-Konten
 * ("[FNCSGC26] GodL Chap"). Die fuehrt lib/globalsTeams auf das gewoehnliche
 * Konto zurueck, und dessen Name gilt dann auch hier.
 *
 * Konten ohne Eintrag fehlen in der Antwort - dann bleibt der Name, wie er
 * auf der Karte steht. Erfunden wird nichts.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const KONTO = /^[0-9a-f]{32}$/;
const MARKE = /\[[^\]]+\]/;

interface Quellen {
  profile: Record<string, { anzeige?: string }>;
  szene: Map<string, string>;
  verzeichnis: Record<string, { haupt?: string }>;
}

/** Die Dateien einmal lesen und kurz behalten - die Szene-Liste ist gross. */
let vorrat: { bis: number; quellen: Promise<Quellen> } | null = null;

async function liesJson<T>(datei: string, ersatz: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(path.join(DATEN_ORT, datei), 'utf8')) as T;
  } catch {
    return ersatz;
  }
}

function quellen(): Promise<Quellen> {
  if (vorrat && vorrat.bis > Date.now()) return vorrat.quellen;
  const q = (async () => {
    const [profile, szeneRoh, verzeichnis] = await Promise.all([
      liesJson<Record<string, { anzeige?: string }>>('spieler-profile.json', {}),
      liesJson<Array<{ ID?: string; NAME?: string }>>(
        path.join('szene-quelle', 'spielerliste.json'), []),
      liesJson<Record<string, { haupt?: string }>>('spieler-namen.json', {}),
    ]);
    const szene = new Map<string, string>();
    for (const s of szeneRoh) if (s.ID && s.NAME) szene.set(s.ID, s.NAME);
    return { profile, szene, verzeichnis };
  })();
  vorrat = { bis: Date.now() + 5 * 60_000, quellen: q };
  // Ein Fehlschlag soll nicht fuenf Minuten lang haengen bleiben.
  q.catch(() => { vorrat = null; });
  return q;
}

function nameZu(id: string, q: Quellen): string | null {
  const gepflegt = q.profile[id]?.anzeige?.trim();
  if (gepflegt && !MARKE.test(gepflegt)) return gepflegt;
  const szene = q.szene.get(id)?.trim();
  if (szene) return szene;
  const haupt = q.verzeichnis[id]?.haupt;
  if (haupt && !MARKE.test(haupt)) return kernname(haupt) || null;
  return null;
}

export async function POST(request: Request) {
  let koerper: { ids?: unknown; event?: unknown };
  try { koerper = await request.json(); } catch { koerper = {}; }
  const ids = [...new Set((Array.isArray(koerper.ids) ? koerper.ids : [])
    .map(String).filter((x) => KONTO.test(x)))].slice(0, 600);
  if (!ids.length) return NextResponse.json({ namen: {} });

  const q = await quellen();
  const namen: Record<string, string> = {};
  for (const id of ids) {
    const n = nameZu(id, q);
    if (n) namen[id] = n;
  }

  // LAN-Konten der Global Championship ueber ihre feste Zuordnung.
  if (koerper.event === GLOBALS_EVENT && ids.some((id) => !namen[id])) {
    try {
      const feld = await globalsTeams(GLOBALS_TAGE[0].windowId);
      for (const t of feld.teams) {
        for (const s of t.spieler) {
          if (!ids.includes(s.turnierId) || namen[s.turnierId]) continue;
          const n = (s.epicId && nameZu(s.epicId, q)) || s.anzeige;
          if (n) namen[s.turnierId] = n;
        }
      }
    } catch {
      // Epic nicht erreichbar: dann bleiben die Namen der Karte stehen.
    }
  }

  return NextResponse.json({ namen });
}
