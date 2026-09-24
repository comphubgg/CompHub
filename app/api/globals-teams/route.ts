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
  // Elite Josh - Eomzo spielte diese Saison 34x mit JOSHREYLI, nie mit King Josh.
  '77d5cbe3175b4245a33c26806ed2aacf': '87a8e3b6537941d58bbee06b9ac19b6a',
};

/*
 * Fuer welche Region ein Team antritt: die Region, ueber die es sich fuer die
 * Global Championship 2026 qualifiziert hat - nicht die Heimat eines seiner
 * Spieler. Der Betreiber (24.9.2026): "Es gibt keine Teams, die zwei Regionen
 * haben ... Europa 21, NAC 14, NA West 3, Brasilien 3, Asien 3, Middle East
 * 3, Ozeanien 3." Die Aufteilung stammt von ihm; Schluessel ist das
 * LAN-Turnierkonto eines der beiden Spieler.
 */
const REGION_DER_QUALI: Record<string, string> = {
  'd725caa68b0c45439dc0a2c25187a1a3': 'EU', // Chap + Flickzy
  'd382cad710ec419fa11a363e9ec0f74b': 'EU', // Tjino + Pаblowingu
  'd02867d73bc34c919f0098c3347a0384': 'EU', // Nxthan + nebs
  'cf9320856cd843ce94957ab4fe6a607e': 'EU', // Zynox + Velo
  '78262c913d484782b4d430e85be84c44': 'EU', // Syaaz + Scaryy
  '60d89e20037741bf8e6aaa7faad32228': 'EU', // FIREN + Pixx
  '5e96f0447b0a47839eb92fd4586c0029': 'EU', // demus + Darm
  '4fc90886d60348fdb7f940764d683acb': 'EU', // Focus + Th0masHD
  '4b16cc674c5a4285acc5446ec339ffde': 'EU', // swizzy + Pixie
  '46e5c9988dd2444289590c59fbf0962e': 'EU', // fant + Volko
  '423a8fbcb4854e6995cf19927f93fe6c': 'EU', // ghonzo + IDrop
  '37e4105726ea4201b895673b37ef74e0': 'EU', // Charyy + Kami
  '31bc02a39a9a42ab87afc86ad8de0d8e': 'EU', // nociff + izzi
  '2efda2d01fdb4d079a41c9e0d45c2136': 'EU', // HUTY + F1shyX
  '216552957f1041fe87df96d47e34426f': 'EU', // Malibuca + Vico
  '1fa41964d9474027b72f926307b10805': 'EU', // King Cr1nge + Twi
  '1c3b86b9733b4daea5a87085848152b8': 'EU', // Shxrk + T3eny
  '178cef88d59043c98162a583a2f4a342': 'EU', // JULLE + Tidi
  '16d64c44a09748a2ac0269f9ed13e912': 'EU', // JannisZ + rax
  '09a35800f1944218a602c2f028da25b4': 'EU', // Scroll + Sky
  '04d0f37ea8c64886abb08099325aba33': 'EU', // seyyto + Momsy
  'c944c63a79d749eeb380394fdc2503df': 'NAC', // BOLTZ + ACORN
  '8f4fc946cee74e1ebb43705a60eb461c': 'NAC', // COOPER + REET
  '3dcd4df5d13a40b9b1cdc9f882abecc8': 'NAC', // RISE + MUZ
  '34596862b66b4cc8a49ccb177c8f92ad': 'NAC', // ENCRYPTED + HCUBE
  '3399dcc98ea14d1c9282920c34b9eef8': 'NAC', // VERGO + SHADOW1X
  '2c2e520cf48f4b4f9efe9c6ca94a3290': 'NAC', // CURVE + HIGGS
  '20d19161a46c4c9bb06fcc6d4d980021': 'NAC', // GOLDEN + OZONE
  '19c6bd9fbb3c447f8bc60e4dfe10e796': 'NAC', // Veno + ajers
  '0508900d1d3d40adacdefcd0dc8ed7cb': 'NAC', // RAPID + CLIX
  '04c3981fa0244c1290ed1243777ee514': 'NAC', // SLEPZI + WAGERS
  '036c7c2a0add44d78e9c8929d20f4387': 'NAC', // COLD + RITUAL
  '032ba94372e04597b7dc14a04bb9e590': 'NAC', // peterbot + POLLO
  '025ff630e1b245ac8abf5e3d8805407d': 'NAC', // KRAEZ + KINGALING
  '55115d4537234bed9b8e628b9054674b': 'NAC', // EOMZO + Joshreyli
  '7780851421bf4b3c8b98c652b2b85c61': 'NAW', // PHOENIX + RETRO
  '5bf18d44a6a74405b4d2aafd0de046c1': 'NAW', // KHANADA + ARK
  '28326fb4a52142ae97b8cd9c848fb92f': 'NAW', // EPIKWHALE + PXMP
  '8d108589830f4f5c880d1ef8698888eb': 'BR', // DIGUERA + MACK
  '34df6f4e2b2a4be5ac9316d2127e59ad': 'BR', // GRX + RANDU
  '3371680b04954fb0b70e5dd3566fd139': 'BR', // ROMERO + LEWA
  '252bb10fd0304c3bb1d8941e02d5d91b': 'ASIA', // pinq + RURA
  '1ab6405231044a21ab1f971e42b19650': 'ASIA', // YUMA + KOYOTA
  '0eb47f1384904d6290ce90b03e20f63e': 'ASIA', // MINIPIYO + FUUKUN
  '628590ca073e42339b7c3a20b89194d1': 'ME', // 27Q8 + 5AALD
  '5099fd09bf4c4302988a911a8be4c839': 'ME', // MSHARY + SALVATORE
  '27a80b7c2ad04bbdafbe0e99b89dde68': 'ME', // Cringe + 1LUSHA
  '58e1f6e329094725b5054ecc31691a84': 'OCE', // RESIGNZ + TINKA
  '451a746231e84464b77061d30267ed32': 'OCE', // PHAZMA + CRUSADES
  '0966d8d0058b47f08d759d55ba5ca26e': 'OCE', // SOLVEY + SAZERS
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

    /** Die eine Region eines Teams (siehe REGION_DER_QUALI). */
    const regionVon = (ids: string[]) =>
      ids.map((id) => REGION_DER_QUALI[id]).find(Boolean) ?? null;

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
      teams: teams.map((t) => ({ ...t, region: regionVon(t.spieler.map((s) => s.turnierId)) })),
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
