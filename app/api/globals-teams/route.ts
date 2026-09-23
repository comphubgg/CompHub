import { NextResponse } from 'next/server';
import fs from '@/lib/ablageFs';
import path from 'path';
import { DATEN_ORT } from '@/lib/datenOrt';
import { namensSchluessel } from '@/lib/homoglyph';
import { gecacht, holeTop, EpicLoginNoetig } from '@/lib/epicCups';
import { GLOBALS_EVENT, GLOBALS_TAGE } from '@/lib/globalsCup';

/*
 * Das Feld der Global Championship - wer antritt, und woher.
 *
 * Der Betreiber wollte unter /globals "die verschiedenen Team und aus
 * welchem Land" sehen. Beides steht hier, und beides kommt aus echten
 * Quellen:
 *
 *   Die Teams aus Epics Teilnehmerliste des Spieltags. Sie steht schon vor
 *   dem ersten Match - mit null Punkten, aber vollstaendig: fuenfzig Duos,
 *   hundert Konten.
 *
 *   Das Land aus den gepflegten Profilen. Und da liegt die Schwierigkeit:
 *   Epic legt fuer das LAN eigene Konten an, erkennbar an der Marke
 *   "[FNCSGC26]" vor dem Namen. Diese Konten sind im Werkzeug voellig
 *   unbekannt - keines der hundert steht in der Laenderliste. Ueber die
 *   Konto-Id ist also nichts zu holen.
 *
 *   Zugeordnet wird deshalb ueber das Namensverzeichnis, genau wie in der
 *   Tierlist: der Kernname ("GodL Chap" -> "chap") fuehrt zum gewoehnlichen
 *   Konto, und von dort kommen Flagge, gepflegter Name und Foto. Namen, die
 *   zwei Konten tragen, laesst das Verzeichnis von sich aus weg - lieber
 *   keine Flagge als eine falsche.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

interface Profil { name?: string; anzeige?: string; land?: string; x?: string }

async function liesJson<T>(datei: string, ersatz: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(path.join(DATEN_ORT, datei), 'utf8')) as T;
  } catch {
    return ersatz;
  }
}

/** Namensschluessel -> Konto-Id, Mehrdeutiges weggelassen. */
async function nachName(): Promise<Map<string, string>> {
  const v = await liesJson<Record<string, { namen?: string[]; haupt?: string }>>(
    'spieler-namen.json', {});
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
  return einmal;
}

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const fenster = p.get('fenster') || GLOBALS_TAGE[0].windowId;

  try {
    const roh = await gecacht(`globals-teams|${fenster}`, 60_000,
      () => holeTop(GLOBALS_EVENT, fenster, 100));

    const eintraege = (roh as { entries?: Array<{
      rank: number; points?: number; games?: number; elims?: number;
      players?: Array<{ id: string; name: string; img?: string | null }>;
    }> }).entries ?? [];

    const [index, profile, bilderRoh, szeneRoh] = await Promise.all([
      nachName(),
      liesJson<Record<string, Profil>>('spieler-profile.json', {}),
      liesJson<Array<{ datei: string; epicId: string; echtesFoto?: boolean }>>(
        'spielerbilder.json', []),
      liesJson<Array<{ ID?: string; NAME?: string; COUNTRY?: string }>>(
        path.join('szene-quelle', 'spielerliste.json'), []),
    ]);

    const bildZu = new Map<string, string>();
    for (const b of bilderRoh) {
      if (b.epicId && b.echtesFoto) {
        bildZu.set(b.epicId, `/spielerbilder/${encodeURIComponent(b.datei)}`);
      }
    }
    const szene = new Map<string, { name: string; land: string }>();
    for (const s of szeneRoh) {
      if (s.ID && s.NAME) {
        szene.set(s.ID, { name: s.NAME, land: (s.COUNTRY || '').toUpperCase() });
      }
    }

    const teams = eintraege.map((e) => ({
      rang: e.rank,
      punkte: e.points ?? 0,
      spiele: e.games ?? 0,
      elims: e.elims ?? 0,
      spieler: (e.players ?? []).map((sp) => {
        // Die Marke des Turniers vor dem Namen faellt weg - sie gehoert
        // nicht zum Spieler, sondern zum Anlass.
        const roher = String(sp.name ?? '').replace(/\[[^\]]*\]\s*/g, '').trim();
        const konto = index.get(namensSchluessel(roher)) ?? null;
        const pr = konto ? profile[konto] : undefined;
        const sz = konto ? szene.get(konto) : undefined;
        return {
          /** Die Konto-Id des Turniers - nicht die des gewoehnlichen Kontos. */
          turnierId: sp.id,
          /** Das gewoehnliche Konto, falls der Name eindeutig dorthin fuehrt. */
          epicId: konto,
          name: roher,
          anzeige: pr?.anzeige || pr?.name || sz?.name || roher,
          land: (pr?.land || sz?.land || '').toUpperCase() || null,
          x: pr?.x ?? null,
          bild: (konto ? bildZu.get(konto) : null) ?? sp.img ?? null,
        };
      }),
    }));

    return NextResponse.json({
      fenster,
      stand: Date.now(),
      teams,
      /*
       * Wie viele Konten sich zuordnen liessen - ehrlich, statt stillen
       * Luecken. Fuenfzig Duos mit hundert Konten, und wenn davon nur
       * achtzig ein Land haben, soll das dastehen.
       */
      zugeordnet: teams.reduce((n, t) =>
        n + t.spieler.filter((s) => s.epicId).length, 0),
      spieler: teams.reduce((n, t) => n + t.spieler.length, 0),
    });
  } catch (e) {
    const login = e instanceof EpicLoginNoetig;
    return NextResponse.json(
      { error: (e as Error).message, needsLogin: login },
      { status: login ? 401 : 500 },
    );
  }
}
