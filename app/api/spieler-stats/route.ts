import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { DATEN_ORT } from '@/lib/datenOrt';

// Werte je einzelnem Spieler statt je Team.
//
// Epic selbst gibt sie nicht heraus - dessen Turnier-Leaderboard fuehrt nur
// Team-Summen, und die Abfrage fremder Konten wird abgelehnt. eucompetitive.com
// veroeffentlicht die Einzelwerte jedoch als offene JSON-Dateien, je Turnier
// und Spieltag. Genau daraus stammen auch die Zahlen, die in bekannten
// Beitraegen der Szene kursieren; ein Abgleich hat sie Wert fuer Wert bestaetigt.
//
//   ?window=Escargo_Day1          -> alle Spieler dieses Spieltags
//   &region=EU                    -> Region vorgeben, sonst wird gesucht
//   &season=S41                   -> Season vorgeben, sonst wird gesucht
//
// Die Quelle gehoert nicht uns. Deshalb wird sie in der Antwort benannt,
// damit sie in der Oberflaeche genannt werden kann.

const BASIS = 'https://eucompetitive.com/APISYSTEMV2/DATA';
const QUELLE = 'eucompetitive.com';
const REGIONEN = ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'] as const;
const SEASONS = ['S41', 'S42', 'S40'] as const;

/** Browserkennung mitsenden - ohne sie antwortet der Anbieter nicht zuverlaessig. */
const KOPF = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
              + '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

export interface RohSpieler {
  username: string; epicId: string;
  eliminations: number; assists: number; rebootsAndRevives: number;
  shots: number; headshots: number; hitsToPlayers: number;
  damageDealt: number; damageTakenFromPlayers: number; damageRatio: number;
  healthHealed: number; shieldHealed: number;
  stormDamage: number; fallDamage: number;
  woodFarmed: number; stoneFarmed: number; metalFarmed: number;
  woodBuildsPlaced: number; stoneBuildsPlaced: number; metalBuildsPlaced: number;
  distanceOnFoot: number; distanceSkydiving: number;
  timeInStorm: number; timeAlive: number; avgLifeTimeMin: number;
  matchesPlayed: number;
}

interface Datei {
  eventId: string; windowId: string; name: string;
  region: string; season: string; matches: number;
  players: RohSpieler[];
}

const cache = new Map<string, { daten: Datei | null; bis: number }>();
const HALTBAR = 10 * 60_000;

async function hole(region: string, season: string, window_: string): Promise<Datei | null> {
  const url = `${BASIS}/${region}/${season}/stats/${encodeURIComponent(window_)}.json`;
  try {
    const r = await fetch(url, { headers: KOPF, cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json() as Datei;
    return Array.isArray(j.players) && j.players.length ? j : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------- eigenes Archiv */

/**
 * Das gespiegelte Archiv, das scripts/szene-stats-holen.mjs anlegt.
 *
 * Zuerst hier nachsehen, dann erst hinausgreifen. Das hat drei Gruende: es
 * ist sofort da statt nach einer Netzabfrage, es findet auch Spieltage, deren
 * Dateiname sich aus Epics Kennung nicht ableiten laesst ("Escargo_Day1"),
 * und es funktioniert weiter, wenn die fremde Seite ihre Pfade aendert.
 */
const ARCHIV = path.join(DATEN_ORT, 'szene-stats');

interface ArchivEintrag {
  region: string; season: string; datei: string;
  eventId: string; windowId: string; name: string;
  spieler: number; matches: number;
}

let verzeichnis: ArchivEintrag[] | null = null;
let verzeichnisBis = 0;

async function liesVerzeichnis(): Promise<ArchivEintrag[]> {
  if (verzeichnis && Date.now() < verzeichnisBis) return verzeichnis;
  try {
    verzeichnis = JSON.parse(
      await fs.readFile(path.join(ARCHIV, 'index.json'), 'utf8')) as ArchivEintrag[];
  } catch {
    verzeichnis = [];
  }
  verzeichnisBis = Date.now() + 60_000;
  return verzeichnis;
}

/** Den Spieltag im eigenen Archiv suchen - ueber Epics Kennung oder den Dateinamen. */
async function ausArchiv(window_: string, region?: string): Promise<Datei | null> {
  const eintraege = await liesVerzeichnis();
  const passt = (e: ArchivEintrag) =>
    (!region || e.region === region.toUpperCase())
    && (e.windowId === window_ || e.datei === `${window_}.json`);
  const treffer = eintraege.find(passt);
  if (!treffer) return null;
  try {
    const roh = await fs.readFile(
      path.join(ARCHIV, treffer.region, treffer.season, treffer.datei), 'utf8');
    const j = JSON.parse(roh) as Datei;
    return Array.isArray(j.players) && j.players.length ? j : null;
  } catch {
    return null;
  }
}

/** Region und Season durchprobieren, bis die Datei zum Spieltag auftaucht. */
async function suche(window_: string, region?: string, season?: string) {
  // Das eigene Archiv geht vor.
  const gespiegelt = await ausArchiv(window_, region);
  if (gespiegelt) return gespiegelt;

  const regionen = region ? [region] : REGIONEN;
  const seasons = season ? [season] : SEASONS;
  for (const s of seasons) {
    // Alle Regionen einer Season parallel - das spart spuerbar Zeit.
    const treffer = await Promise.all(regionen.map((r) => hole(r, s, window_)));
    const gefunden = treffer.find(Boolean);
    if (gefunden) return gefunden;
  }
  return null;
}

/**
 * Der Rueckfall auf die eigenen Replays.
 *
 * eucompetitive fuehrt laengst nicht jeden Spieltag. Bisher stand die
 * Player-Stats-Ansicht dann leer da, obwohl im Haus eigene Auswertungen
 * liegen: scripts/replays-holen.mjs holt die Aufzeichnungen, und
 * replays-aggregieren.mjs rechnet sie je Epic-Konto zusammen.
 *
 * Was daraus kommt, ist weniger als bei eucompetitive, aber es ist echt:
 * Kills, Knocks und Tode stehen im Verlauf des Matches. Schaden, Headshots,
 * Bauten und Material stehen dort nicht - diese Felder bleiben deshalb leer,
 * und die zugehoerigen Bestenlisten fallen von selbst aus der Auswahl. Sie
 * mit Nullen zu fuellen hiesse, eine Zahl zu behaupten, die niemand gemessen
 * hat.
 */
interface ReplayEintrag {
  epicId: string; kills?: number; knocks?: number;
  gestorben?: number; matches?: number;
}
interface ReplayAggregat {
  windowId?: string; region?: string; season?: string; titel?: string;
  matches?: number; spieler?: ReplayEintrag[];
}

async function ausReplays(windowId: string, season?: string) {
  const kandidaten = season ? [season]
    : [windowId.split('_')[0].toUpperCase(), ...SEASONS];
  for (const s of kandidaten) {
    if (!/^S\d+$/i.test(s)) continue;
    const datei = path.join(DATEN_ORT, 'replays', s, windowId,
      '_aggregat.json');
    try {
      const roh = JSON.parse(await fs.readFile(datei, 'utf8')) as ReplayAggregat;
      const liste = roh.spieler ?? [];
      if (!liste.length) continue;

      /*
       * Die Replays kennen nur Konto-Ids. Der Name kommt in derselben
       * Rangfolge wie ueberall sonst im Werkzeug: zuerst der gepflegte
       * Anzeigename aus dem Profil, dann der Hauptname aus der
       * Namenssammlung, dann irgendeiner ihrer Schreibweisen. Bleibt alles
       * leer, steht die Id da - eine namenlose Zeile waere schlimmer.
       */
      const lies = async (name: string) => {
        try {
          return JSON.parse(await fs.readFile(
            path.join(DATEN_ORT, name), 'utf8'));
        } catch { return {}; }
      };
      const profile: Record<string, { anzeige?: string }> =
        await lies('spieler-profile.json');
      const namen: Record<string, { haupt?: string; namen?: string[] }> =
        await lies('spieler-namen.json');
      const nameVon = (id: string) => profile[id]?.anzeige
        || namen[id]?.haupt || namen[id]?.namen?.[0] || id;

      return {
        vorhanden: true,
        quelle: 'Replays',
        turnier: roh.titel ?? windowId,
        region: roh.region ?? null,
        season: roh.season ?? s,
        matches: roh.matches ?? null,
        spieler: liste.map((p) => {
          const kills = p.kills ?? 0;
          const tode = p.gestorben ?? 0;
          return {
            name: nameVon(p.epicId),
            epicId: p.epicId,
            elims: kills,
            knocks: p.knocks ?? 0,
            gestorben: tode,
            matches: p.matches ?? 0,
            /*
             * K/D laesst sich hier ehrlich rechnen: beide Zahlen stehen im
             * Replay, jede Eliminierung ist ein Ereignis mit Taeter und
             * Opfer. Ohne einen einzigen Tod waere die Division unendlich -
             * dann gelten die Kills selbst, wie es auch sonst ueblich ist.
             */
            kd: tode > 0 ? +(kills / tode).toFixed(2) : kills,
          };
        }),
      };
    } catch { /* diese Season hat den Spieltag nicht */ }
  }
  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const window_ = searchParams.get('window');
  const region = searchParams.get('region') ?? undefined;
  const season = searchParams.get('season') ?? undefined;

  if (!window_) {
    return NextResponse.json({ error: 'window ist noetig' }, { status: 400 });
  }

  const schluessel = `${window_}|${region ?? ''}|${season ?? ''}`;
  const gemerkt = cache.get(schluessel);
  if (gemerkt && Date.now() < gemerkt.bis) {
    return NextResponse.json(antwort(gemerkt.daten));
  }

  const daten = await suche(window_, region?.toUpperCase(), season?.toUpperCase());
  cache.set(schluessel, { daten, bis: Date.now() + HALTBAR });
  if (daten) return NextResponse.json(antwort(daten));

  // Kennt die fremde Quelle den Spieltag nicht, gelten die eigenen Replays.
  const eigene = await ausReplays(window_, season?.toUpperCase());
  if (eigene) return NextResponse.json(eigene);
  return NextResponse.json(antwort(null));
}

function antwort(d: Datei | null) {
  if (!d) {
    return {
      vorhanden: false,
      quelle: QUELLE,
      hinweis: 'Zu diesem Spieltag liegen dort keine Einzelwerte vor.',
      spieler: [],
    };
  }
  return {
    vorhanden: true,
    quelle: QUELLE,
    turnier: d.name,
    region: d.region,
    season: d.season,
    matches: d.matches,
    spieler: d.players.map((p) => ({
      name: p.username,
      epicId: p.epicId,
      elims: p.eliminations,
      assists: p.assists,
      reboots: p.rebootsAndRevives,
      headshots: p.headshots,
      hits: p.hitsToPlayers,
      shots: p.shots,
      damage: Math.round(p.damageDealt),
      damageTaken: Math.round(p.damageTakenFromPlayers),
      // Bewusst nicht das Feld "damageRatio" der Quelle. Dessen Formel ist
      // nicht offengelegt und passt zu keiner nachvollziehbaren Rechnung: fuer
      // shxrk steht dort 2,7763, waehrend ausgeteilt durch erlitten 1,8772
      // ergibt. Die Zahl unter "Rated" auf der Seite von eucompetitive ist
      // wiederum eine dritte (2,35) und steht in keiner offenen Datei.
      // Uebernommen wird deshalb nur, was sich nachrechnen laesst.
      quote: p.damageTakenFromPlayers > 0
        ? +(p.damageDealt / p.damageTakenFromPlayers).toFixed(2) : 0,
      heals: Math.round(p.healthHealed + p.shieldHealed),
      stormDamage: Math.round(p.stormDamage),
      // Trefferquote: wie viele Schuesse tatsaechlich trafen.
      genauigkeit: p.shots > 0 ? +((p.hitsToPlayers / p.shots) * 100).toFixed(1) : 0,
      fallDamage: Math.round(p.fallDamage),
      mats: p.woodFarmed + p.stoneFarmed + p.metalFarmed,
      builds: p.woodBuildsPlaced + p.stoneBuildsPlaced + p.metalBuildsPlaced,
      // Meter in Kilometer. Die Quelle nennt die Einheit nicht, aber sie
      // laesst sich nachrechnen: 42.263 geteilt durch 9.384 Sekunden Lebenszeit
      // sind 4,5 pro Sekunde - Laufgeschwindigkeit in Metern. Zentimeter kaemen
      // auf 4,5 Zentimeter pro Sekunde und waeren offensichtlich falsch.
      distanz: +(p.distanceOnFoot / 1000).toFixed(1),
      // Zu Fuss plus Gleiter. Beide Strecken stehen einzeln in der Quelle.
      distanzGesamt: +((p.distanceOnFoot + p.distanceSkydiving) / 1000).toFixed(1),
      timeInStorm: Math.round(p.timeInStorm),
      timeAlive: Math.round(p.timeAlive),
      avgLife: p.avgLifeTimeMin,
      matches: p.matchesPlayed,
    })),
  };
}
