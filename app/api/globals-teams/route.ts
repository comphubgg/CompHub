import { NextResponse } from 'next/server';
import fs from '@/lib/ablageFs';
import path from 'path';
import { DATEN_ORT } from '@/lib/datenOrt';
import { kernname, namensSchluessel } from '@/lib/homoglyph';
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
 *   Land, gepflegter Name und Foto vom gewoehnlichen Konto des Spielers.
 *   Epic legt fuer das LAN eigene Konten an ("[FNCSGC26] GodL Chap"), und
 *   keines davon kennt das Werkzeug - also fuehrt nur der Name zum
 *   gewoehnlichen Konto.
 *
 * ------------------------------------------------------------ Die Zuordnung
 *
 * Zuerst lief sie allein ueber das Namensverzeichnis der Szene. Damit waren
 * 75 von 100 Konten eindeutig, und viele Fotos fehlten - der Betreiber:
 * "paar Bilder laden einfach nicht". Nachgemessen am 23.9.2026 an den
 * echten Dateien, warum:
 *
 *   - Viele Spieler fuehrten zu dem Konto, das Epic ihnen fuer die EWC-LAN
 *     angelegt hatte ("[EWC2026] DIG Khanada"). Das Foto haengt am
 *     Hauptkonto. Konten, deren saemtliche Namen eine Turniermarke tragen,
 *     zaehlen deshalb nicht mehr - genausowenig wie die Konten dieses LANs.
 *   - Ein Name, den zwei Konten tragen, galt als mehrdeutig, auch wenn beide
 *     Konten zu derselben gepflegten Person gehoeren (Hauptkonto und
 *     Zweitkonto). Gehoeren alle Kandidaten zu derselben Person, gilt das mit
 *     Foto.
 *   - Und gefragt wird der Reihe nach: zuerst die gepflegten Profile, dann
 *     die Fotozuordnung, dann das Namensverzeichnis, dann die Spielerliste
 *     der Szene. Bleibt eine Quelle mehrdeutig, entscheidet die naechste -
 *     aber nur unter den Konten, die schon in Frage kamen.
 *
 * Ergebnis am selben Stand: 99 von 100 Konten, 73 mit Foto. Ein Foto kommt
 * nur vom zugeordneten Konto selbst. Ueber den Namen allein wird keines
 * genommen: es gibt zwei verschiedene Spieler namens Rax, und nur einer hat
 * ein Foto - der andere bekaeme sonst dessen Gesicht.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

interface Profil { name?: string; anzeige?: string; land?: string; x?: string; namen?: string[] }
interface Bildeintrag { datei: string; epicId: string; name?: string; turniername?: string; echtesFoto?: boolean }

async function liesJson<T>(datei: string, ersatz: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(path.join(DATEN_ORT, datei), 'utf8')) as T;
  } catch {
    return ersatz;
  }
}

const KONTO = /^[0-9a-f]{32}$/;
const MARKE = /\[[^\]]+\]/;

/*
 * Feste Zuordnung: Turnierkonto der LAN -> gewoehnliches Konto.
 *
 * Fuer die Faelle, in denen der Name auf ein zweites, altes Konto derselben
 * Person fuehrte und das Foto deshalb fehlte. Der Betreiber (24.9.2026):
 * "Der Spieler heisst ohne Re, also Syaaz, dann haette er auch ein Bild ...
 * es fehlen noch ziemlich viele Bilder, obwohl ich die habe."
 *
 * Entschieden ist jeder Eintrag ueber Konto-Ids, nicht ueber den Namen: der
 * Globals-Partner hat in dieser Saison nachweislich mit genau diesem Konto
 * gespielt (Mitspieler-Ids aus den Platzierungen), das verworfene Konto
 * nicht - oder das verworfene hat gar keine Turniere.
 */
const FESTE_KONTEN: Record<string, string> = {
  // MGA Re Syaaz - Scaryy spielte 10x mit "MGA Syaaz holi11".
  '78262c913d484782b4d430e85be84c44': '1bed52eac9c747588b328b3a70021222',
  // VSN Salvatore - MSHARY spielte 11x mit diesem Konto.
  'd1b8f89774ef43af94b8b77aa539424f': 'a2d547c84c0449358949ebb51b3c671b',
  // NTX shadow1x - Vergo spielte 11x mit "NTX shadow1x".
  'aa7f02a352af4fdfb0ce48f1df6eba83': '34009ee20b024cfb843d984e5b9b30aa',
  // 5aald Q8 - 134 Turnierzeilen diese Saison; das andere Konto keine.
  'e3d2041f1eb9422288a391820426ed7d': '278c95a8671d432da2110578a5120e7b',
  // Rise - MUZ spielte 20x mit diesem Konto.
  '3dcd4df5d13a40b9b1cdc9f882abecc8': 'e5556b3269cf4e3499198774adc4cac2',
  // LEV RomeroFDP - Lewa spielte 8x mit "ROMERO".
  '3371680b04954fb0b70e5dd3566fd139': 'f899b6ef72c74f03af0aeca85b2bedca',
  // GENG Ritual - Cold spielte 9x mit "GEN ritualx 9".
  '30de8aa096a1462a890d016170e38048': '28f2d4207f9142838351f610815012e1',
};

type Index = Map<string, Set<string>>;

/** Die Zuordnung Name -> gewoehnliches Konto, siehe oben. */
function zuordnung(quellen: {
  profile: Record<string, Profil>;
  bilder: Bildeintrag[];
  namen: Record<string, { namen?: string[]; haupt?: string }>;
  szene: Array<{ ID?: string; NAME?: string }>;
  lanKonten: Set<string>;
}) {
  const { profile, bilder, namen, szene, lanKonten } = quellen;

  // Konten, deren saemtliche Namen eine Turniermarke tragen: LAN-Konten.
  const alleNamen = new Map<string, string[]>();
  const merk = (id: string, n?: string) => {
    if (!n) return;
    (alleNamen.get(id) ?? alleNamen.set(id, []).get(id)!).push(n);
  };
  for (const [id, p] of Object.entries(profile)) for (const n of [p.name, p.anzeige, ...(p.namen ?? [])]) merk(id, n);
  for (const [id, e] of Object.entries(namen)) for (const n of [...(e.namen ?? []), e.haupt]) merk(id, n);
  const lanArtig = new Set<string>();
  for (const [id, ns] of alleNamen) {
    const echte = ns.filter(Boolean);
    if (echte.length && echte.every((n) => MARKE.test(n))) lanArtig.add(id);
  }

  const neu = (): Index => new Map();
  const add = (ix: Index, name: unknown, id: string) => {
    const k = namensSchluessel(String(name ?? ''));
    if (!k || !KONTO.test(id) || lanKonten.has(id) || lanArtig.has(id)) return;
    (ix.get(k) ?? ix.set(k, new Set()).get(k)!).add(id);
  };
  const reihe: Index[] = [neu(), neu(), neu(), neu()];
  const [ausProfil, ausFoto, ausNamen, ausSzene] = reihe;
  for (const [id, p] of Object.entries(profile)) {
    for (const n of [p.name, p.anzeige, ...(p.namen ?? [])]) add(ausProfil, n, id);
  }
  for (const b of bilder) if (b.echtesFoto) for (const n of [b.name, b.turniername]) add(ausFoto, n, b.epicId);
  for (const [id, e] of Object.entries(namen)) for (const n of [...(e.namen ?? []), e.haupt]) add(ausNamen, n, id);
  for (const s of szene) if (s.ID) add(ausSzene, s.NAME, s.ID);

  const mitFoto = new Set(bilder.filter((b) => b.echtesFoto).map((b) => b.epicId));
  const person = (id: string) => (profile[id]?.anzeige || profile[id]?.name || '').toLowerCase().trim();

  return (name: string): string | null => {
    const k = namensSchluessel(name);
    if (!k) return null;
    let kandidaten: Set<string> | null = null;
    for (const ix of reihe) {
      const s = ix.get(k);
      if (!s) continue;
      const drin: Set<string> = kandidaten
        ? new Set([...s].filter((x) => kandidaten!.has(x))) : new Set(s);
      if (drin.size === 1) return [...drin][0];
      if (drin.size > 1) {
        // Alle dieselbe gepflegte Person: dann das Konto mit Foto.
        const personen = new Set([...drin].map(person));
        if (personen.size === 1 && [...personen][0]) {
          return [...drin].find((x) => mitFoto.has(x)) ?? [...drin][0];
        }
        kandidaten = drin;
      }
    }
    return null;
  };
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

    const [namen, profile, bilder, szeneRoh] = await Promise.all([
      liesJson<Record<string, { namen?: string[]; haupt?: string }>>('spieler-namen.json', {}),
      liesJson<Record<string, Profil>>('spieler-profile.json', {}),
      liesJson<Bildeintrag[]>('spielerbilder.json', []),
      liesJson<Array<{ ID?: string; NAME?: string; COUNTRY?: string }>>(
        path.join('szene-quelle', 'spielerliste.json'), []),
    ]);

    const lanKonten = new Set(eintraege.flatMap((e) => (e.players ?? []).map((x) => x.id)));
    const kontoZu = zuordnung({ profile, bilder, namen, szene: szeneRoh, lanKonten });

    const bildZu = new Map<string, string>();
    for (const b of bilder) {
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
        const konto = FESTE_KONTEN[sp.id] ?? kontoZu(roher);
        const pr = konto ? profile[konto] : undefined;
        const sz = konto ? szene.get(konto) : undefined;
        return {
          /** Die Konto-Id des Turniers - nicht die des gewoehnlichen Kontos. */
          turnierId: sp.id,
          /** Das gewoehnliche Konto, falls der Name eindeutig dorthin fuehrt. */
          epicId: konto,
          name: roher,
          anzeige: (pr?.anzeige || (pr?.name && !MARKE.test(pr.name) ? pr.name : '')
            // Ohne gepflegten Namen der Name ohne Orgtag: "GodL Flickzy"
            // wird "Flickzy", wie auf der Karte.
            || sz?.name || kernname(roher)),
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
      zugeordnet: teams.reduce((n, t) =>
        n + t.spieler.filter((s) => s.epicId).length, 0),
      mitFoto: teams.reduce((n, t) =>
        n + t.spieler.filter((s) => s.bild).length, 0),
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
