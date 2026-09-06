import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { DATEN_ORT } from '@/lib/datenOrt';

// Werte je einzelnem Spieler - aus den Replays.
//
//   ?window=<windowId>[&saison=S42]
//
// Warum nicht aus dem Leaderboard: Epic zaehlt dort je Team. Bei einem Duo
// steht "9 Elims" fuer beide zusammen, und wer davon acht geholt hat, ist
// daraus nicht zu erfahren. Genau deshalb sammelt das Werkzeug ohnehin schon
// die Replays ein (scripts/replays-holen.mjs); dort steht jeder einzelne
// Abschuss mit Taeter, Opfer, Waffe und Zeit, und der planmaessige Lauf legt
// daraus je Spieltag ein _aggregat.json an.
//
// Diese Schnittstelle liest dieses Aggregat und gibt es mit den gepflegten
// Namen heraus. Gerechnet wird hier nichts nach - was der Sammler
// festgehalten hat, gilt.
//
// Ohne ausgewertete Replays gibt es hier nichts, und dann steht das auch so
// da, statt Teamwerte als Spielerwerte auszugeben.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ABLAGE = path.join(DATEN_ORT, 'replays');

interface AggSpieler {
  epicId: string; matches?: number; kills?: number; knocks?: number;
  gestorben?: number; umgehauen?: number;
}
interface AggTeam {
  platz?: number; punkte?: number; spieler?: string[];
  kills?: number; knocks?: number;
}
interface Aggregat {
  matches?: number; elims?: number; quelle?: string; gerechnet?: string;
  spieler?: AggSpieler[]; teams?: AggTeam[];
}

/** Die gepflegten Anzeigenamen - dieselben wie ueberall sonst im Werkzeug. */
async function namen(): Promise<Map<string, string>> {
  const karte = new Map<string, string>();
  try {
    const roh = JSON.parse(await fs.readFile(
      path.join(DATEN_ORT, 'spieler-namen.json'), 'utf8')) as
      Record<string, { haupt?: string; namen?: string[] }>;
    for (const [id, e] of Object.entries(roh)) {
      const n = e.haupt || e.namen?.[0];
      if (n) karte.set(id, n);
    }
  } catch { /* kein Verzeichnis da */ }

  // Ein selbst gepflegtes Profil schlaegt das Verzeichnis - der Betreiber
  // entscheidet, wie jemand heisst.
  try {
    const roh = JSON.parse(await fs.readFile(
      path.join(DATEN_ORT, 'spieler-profile.json'), 'utf8')) as
      Record<string, { id?: string; name?: string; anzeige?: string; land?: string }>;
    for (const [schluessel, pr] of Object.entries(roh)) {
      const id = pr.id || (/^[0-9a-f]{32}$/i.test(schluessel) ? schluessel : '');
      const n = pr.anzeige || pr.name;
      if (id && n) karte.set(id, n);
    }
  } catch { /* noch keine Profile */ }

  return karte;
}

/** Die Laender aus den gepflegten Profilen - fuer die Flagge in der Liste. */
async function laender(): Promise<Map<string, string>> {
  const karte = new Map<string, string>();
  try {
    const roh = JSON.parse(await fs.readFile(
      path.join(DATEN_ORT, 'spieler-profile.json'), 'utf8')) as
      Record<string, { id?: string; land?: string }>;
    for (const [schluessel, pr] of Object.entries(roh)) {
      const id = pr.id || (/^[0-9a-f]{32}$/i.test(schluessel) ? schluessel : '');
      if (id && pr.land) karte.set(id, pr.land);
    }
  } catch { /* noch keine Profile */ }
  return karte;
}

/**
 * Wann der Sammler zuletzt gelaufen ist - und ob er durchkam.
 *
 * scripts/replays-holen.mjs legt das nach jedem Lauf ab. Ohne diese Angabe
 * stand in der Oberflaeche nur "noch keine Replays, die kommen planmaessig".
 * Das war einmal schlicht falsch: der Lauf fragte auf dem falschen Port ins
 * Leere und holte tagelang nichts, waehrend die Oberflaeche zum Warten riet.
 */
async function letzterLauf() {
  try {
    return JSON.parse(await fs.readFile(
      path.join(ABLAGE, '_lauf.json'), 'utf8')) as {
        zeitpunkt?: string; art?: string; ok?: boolean; fehler?: string;
      };
  } catch { return null; }
}

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const fenster = p.get('window');
  if (!fenster) {
    return NextResponse.json({ error: 'window ist noetig' }, { status: 400 });
  }
  const saison = p.get('saison')
    ?? /^(S\d+)_/i.exec(fenster)?.[1]?.toUpperCase() ?? '';

  let agg: Aggregat;
  try {
    agg = JSON.parse(await fs.readFile(
      path.join(ABLAGE, saison, fenster, '_aggregat.json'), 'utf8')) as Aggregat;
  } catch {
    return NextResponse.json({
      vorhanden: false, spieler: [], runden: 0, lauf: await letzterLauf(),
    });
  }
  if (!agg.spieler?.length) {
    return NextResponse.json({
      vorhanden: false, spieler: [], runden: 0, lauf: await letzterLauf(),
    });
  }

  const [anzeige, land] = await Promise.all([namen(), laender()]);

  /*
   * Zu jedem Spieler sein Team.
   *
   * Der Tracker schreibt unter jeden Namen das Team - das ist beim Lesen
   * die halbe Miete, weil man sonst bei hundert Namen nicht sieht, wer mit
   * wem gespielt hat. Die Zuordnung steht im Aggregat, sie muss nur
   * umgedreht werden.
   */
  const zumTeam = new Map<string, { partner: string[]; platz: number | null }>();
  for (const t of agg.teams ?? []) {
    for (const id of t.spieler ?? []) {
      zumTeam.set(id, {
        partner: (t.spieler ?? []).filter((x) => x !== id),
        platz: typeof t.platz === 'number' ? t.platz : null,
      });
    }
  }

  const spieler = (agg.spieler ?? []).map((s) => {
    const team = zumTeam.get(s.epicId);
    return {
      epicId: s.epicId,
      name: anzeige.get(s.epicId) ?? s.epicId.slice(0, 8),
      land: land.get(s.epicId) ?? '',
      spiele: s.matches ?? 0,
      kills: s.kills ?? 0,
      knocks: s.knocks ?? 0,
      tode: s.gestorben ?? 0,
      umgehauen: s.umgehauen ?? 0,
      platz: team?.platz ?? null,
      partner: (team?.partner ?? []).map((id) =>
        anzeige.get(id) ?? id.slice(0, 8)),
    };
  }).sort((a, b) => b.kills - a.kills || b.knocks - a.knocks);

  return NextResponse.json({
    vorhanden: true,
    runden: agg.matches ?? 0,
    gerechnet: agg.gerechnet ?? null,
    spieler,
    hinweis: 'Counted from the replays of this match day, per player.',
  });
}
