import fs from '@/lib/ablageFs';
import path from 'path';
import { createHash } from 'crypto';
import { promises as echtesFs } from 'fs';
import { DATEN_ORT } from './datenOrt';
import { liesJson } from '@/lib/ablage';
import { fertigeAntwort, ohneDateien } from '@/lib/antwortSpeicher';
import { replayTag } from '@/lib/replaySchlank';
import { istGrossesTurnier } from '@/lib/turnierArt';

/*
 * Die Einzelwerte aus den eigenen Replay-Auswertungen.
 *
 * Anlass: in "Letzte Turniere" standen bei manchen Spieltagen nur Striche.
 * Der Grund war richtig - die Szene-Quelle hatte zu diesem Tag nichts
 * veroeffentlicht, und Epics Bestenliste fuehrt Eliminierungen nur je Team,
 * nicht je Spieler. Eine Teamzahl in einer Spielerspalte waere falsch.
 *
 * Es gibt aber eine dritte Quelle, und sie liegt hier im Haus: die
 * Turnier-Replays. Sie werden ohnehin eingesammelt und ausgewertet, und
 * darin steht je Konto, wie oft es jemanden ausgeschaltet hat - gezaehlt
 * aus dem Spielverlauf, nicht geschaetzt.
 *
 * Beispiel, nachgesehen: im Fenster S42_FNCSDivisionalCup_Division1_Event1_EU
 * steht in der Zeile eines Spielers ein Strich, waehrend das Replay
 * fuenfzig Eliminierungen aus elf Matches zaehlt.
 *
 * Was hier NICHT herkommt: Schaden, Material, Bauteile. Der Replay-Leser
 * erfasst sie nicht. Sie bleiben leer - lieber eine Luecke als eine Zahl,
 * die niemand nachrechnen kann.
 */

const ABLAGE = path.join(DATEN_ORT, 'replays');

interface AggregatKonto {
  epicId: string;
  matches: number;
  kills: number;
  knocks: number;
}

interface Aggregat {
  season: string;
  windowId: string;
  matches: number;
  spieler: AggregatKonto[];
}

/** Was ein Replay zu einem Spieler an einem Spieltag weiss. */
export interface ReplayWert {
  /** Eigene Eliminierungen, aus dem Spielverlauf gezaehlt. */
  elims: number;
  /** Wie oft er jemanden umgehauen hat. */
  knocks: number;
  /** In wie vielen Matches er auftaucht. */
  matches: number;
}

/*
 * Ein Zwischenspeicher je Fenster.
 *
 * Eine Aggregatdatei hat bis zu vierzehnhundert Konten; sie fuer jede Zeile
 * einer Verlaufstabelle neu zu lesen waere Unfug. Zehn Minuten reichen -
 * waehrend eines laufenden Cups wird sie ohnehin alle paar Minuten neu
 * geschrieben.
 */
const merker = new Map<string, { karte: Map<string, ReplayWert>; bis: number }>();
const HALTBAR = 10 * 60_000;

async function fensterKarte(
  season: string, windowId: string,
): Promise<Map<string, ReplayWert>> {
  const schluessel = `${season}|${windowId}`;
  const gemerkt = merker.get(schluessel);
  if (gemerkt && Date.now() < gemerkt.bis) return gemerkt.karte;

  const karte = new Map<string, ReplayWert>();
  try {
    // Die schlanke Fassung (lib/replaySchlank): nur wer etwas geholt hat -
    // wer fehlt, hat 0 Elims und 0 Knocks.
    const roh = await replayTag(season, windowId);
    for (const k of roh?.spieler ?? []) {
      if (!k.epicId) continue;
      karte.set(k.epicId, {
        elims: k.kills ?? 0,
        knocks: k.knocks ?? 0,
        matches: k.matches ?? 0,
      });
    }
  } catch {
    // Zu diesem Fenster liegt kein ausgewertetes Replay - der Normalfall
    // bei allem, was aelter als einunddreissig Tage ist.
  }

  merker.set(schluessel, { karte, bis: Date.now() + HALTBAR });
  return karte;
}

/* ------------------------------------------ Alle Spieltage einer Saison */

/** Ein ausgewerteter Spieltag mit allen Konten - fuer die Saisonlisten. Seit dem 16.11.2026 nur grosse Turniere (istGrossesTurnier), siehe aggregatAuszug. */
export interface AggregatTag {
  season: string; windowId: string; eventId: string; region: string;
  titel: string; datum: number | null;
  /** Wie viele Matches ausgewertet sind ... */
  ausgewertet: number;
  /** ... und wie viele der Spieltag insgesamt hatte, soweit bekannt. */
  gesamt: number | null;
  spieler: AggregatKonto[];
}

const saisonMerker = new Map<string, { tage: AggregatTag[]; bis: number }>();

/**
 * Alle ausgewerteten Spieltage einer Saison, mit den Werten je Konto.
 *
 * Fuer die Liste "Meiste Eliminierungen": die Szene-Quelle kennt nur
 * Finals, die eigenen Replays kennen jeden Spieltag, den der Sammler
 * eingesammelt hat - Opens eingeschlossen. Der Betreiber: "da hast du
 * mindestens die Eliminierungen, die hast du."
 *
 * Gelesen wird je Fenster das Aggregat und, fuer die Zahl aller Matches,
 * der Zustand des Sammlers; acht Fenster nebeneinander, damit hundert
 * Fenster aus der Ablage nicht hundertmal nacheinander warten. Zehn Minuten
 * gemerkt - die Saisonlisten werden ohnehin nur alle anderthalb Stunden neu
 * gerechnet.
 */
export async function aggregateSaison(season: string): Promise<AggregatTag[]> {
  const gemerkt = saisonMerker.get(season);
  if (gemerkt && Date.now() < gemerkt.bis) return gemerkt.tage;
  /*
   * Ueber die Ablage der fertigen Antworten, damit es ueber Instanzen hinweg
   * haelt: eine frische Server-Instanz liest dann eine Datei statt hundert.
   * Dreissig Minuten - die Replays werden alle zehn Minuten neu ausgewertet,
   * und ein paar Minuten Verzug tun der Saisonliste nichts.
   */
  const tage = await fertigeAntwort(`replays|saison|${season}`,
    () => aggregateLesen(season), 30 * 60_000, true, undefined, await aggregatStand(season));
  saisonMerker.set(season, { tage, bis: Date.now() + HALTBAR });
  return tage;
}

/*
 * Seit wann die Grundlage der Saison-Sammlung so ist, wie sie ist (ms) - oder undefined, wenn das nicht festzustellen ist (dann
 * gilt die alte Regel). Nur dort, wo die Dateien liegen.
 *
 * Gebraucht vom Vorrechnen (lib/antwortSpeicher, grundlageStand): bis zum 16.11.2026 las jeder Stundenlauf die Sammlung jeder Saison
 * neu - fuer S42 rund vier Gigabyte Aggregate -, auch wenn sich seit dem letzten Lauf keine Datei geaendert hatte. Die Startansicht
 * von S42 lief damit in jedem Lauf dreimal in die Frist von 900 s oder riss den Server um (Lauf 43839298370, Messlauf 43869136304),
 * und Teil 2 bekam keine Zeit mehr.
 *
 * Nicht die Aenderungszeit allein: scripts/ablage-github-holen.mjs setzt geholte Dateien auf die Zeit des Releases minus einen Tag
 * zurueck, eine geaenderte Datei kann also aelter aussehen als die abgelegte Antwort. Deshalb ein Fingerabdruck aus Name, Groesse und
 * Zeit jeder Quelle (Aggregate der Saison, Replay-Uebersicht); aendert er sich, gilt "jetzt" als Stand. Gemerkt unter
 * data/_vorrechnen-stand/ - der Unterstrich haelt es aus Release und Supabase heraus, der Zwischenspeicher des Laufs nimmt es mit.
 */
async function aggregatStand(season: string): Promise<number | undefined> {
  if (ohneDateien()) return undefined;
  try {
    const ordner = path.join(ABLAGE, season);
    const fenster = (await fs.readdir(ordner)).sort();
    const teile: string[] = [];
    for (let i = 0; i < fenster.length; i += 32) {
      teile.push(...await Promise.all(fenster.slice(i, i + 32).map(async (w) => {
        try { const st = await fs.stat(path.join(ordner, w, '_aggregat.json')); return `${w}:${st.size}:${Math.round(st.mtimeMs)}`; } catch { return `${w}:-`; }
      })));
    }
    try {
      const st = await fs.stat(path.join(DATEN_ORT, 'antworten', 'replays_uebersicht.json'));
      teile.push(`uebersicht:${st.size}:${Math.round(st.mtimeMs)}`);
    } catch { teile.push('uebersicht:-'); }
    const abdruck = createHash('sha1').update(teile.join('|')).digest('hex');
    const merker = path.join(DATEN_ORT, '_vorrechnen-stand', `replays_saison_${season.replace(/[^A-Za-z0-9_-]/g, '_')}.json`);
    try {
      const da = JSON.parse(await echtesFs.readFile(merker, 'utf8')) as { abdruck?: string; seit?: number };
      if (da.abdruck === abdruck && typeof da.seit === 'number') return da.seit;
    } catch { /* noch keiner */ }
    const seit = Date.now();
    await echtesFs.mkdir(path.dirname(merker), { recursive: true });
    await echtesFs.writeFile(merker, JSON.stringify({ abdruck, seit, dateien: teile.length }));
    return seit;
  } catch { return undefined; }
}

/*
 * Der Auszug eines Aggregats fuer die Saison-Sammlung, je Fenster gemerkt (16.11.2026).
 *
 * Gemessen (Messlauf 43883158872): auf dem Laufrechner liegen unter replays/S42 1036 Fenster, 11 GB. Die Sammlung las sie alle
 * (586 s fuer die Startansicht von S42) und war danach zu gross, um abgelegt zu werden - also wieder, in jedem Lauf. Gebraucht
 * werden davon nur die grossen Turniere (lib/szeneStats startseite filtert als Erstes mit istGrossesTurnier - der einzige Leser
 * der Sammlung); die uebrigen Fenster stehen nicht mehr darin. Der Auszug je Fenster liegt klein unter
 * data/_vorrechnen-stand/aggregat/ (Unterstrich: nicht ans Release, nicht nach Supabase; der Zwischenspeicher nimmt ihn mit) und
 * gilt, solange Groesse und Zeit des Aggregats gleich sind. Neu gelesen wird nur, was sich geaendert hat; bricht ein Lauf ab,
 * macht der naechste dort weiter.
 */
interface AggregatAuszug {
  quelle: string;
  eventId: string; region: string; titel: string; von: number | null; matches: number;
  /** [Konto, Matches, Kills ohne Selbst-Eliminierungen, Knocks] */
  spieler: Array<[string, number, number, number]>;
}

async function aggregatAuszug(season: string, w: string): Promise<AggregatAuszug | null> {
  const datei = path.join(ABLAGE, season, w, '_aggregat.json');
  let quelle: string;
  try { const st = await fs.stat(datei); quelle = `${st.size}@${Math.round(st.mtimeMs)}`; } catch { return null; }
  const merk = path.join(DATEN_ORT, '_vorrechnen-stand', 'aggregat', season.replace(/[^A-Za-z0-9_-]/g, '_'),
    `${w.replace(/[^A-Za-z0-9_.-]/g, '_')}.json`);
  try {
    const da = JSON.parse(await echtesFs.readFile(merk, 'utf8')) as { quelle?: string; auszug?: AggregatAuszug | null };
    if (da.quelle === quelle) return da.auszug ?? null;
  } catch { /* noch keiner */ }
  let auszug: AggregatAuszug | null = null;
  try {
    const roh = JSON.parse(await fs.readFile(datei, 'utf8')) as Aggregat & {
      eventId?: string; region?: string; titel?: string; von?: number;
    };
    if (Array.isArray(roh.spieler) && roh.spieler.length && istGrossesTurnier(roh.titel ?? w)) {
      auszug = {
        quelle, eventId: roh.eventId ?? '', region: roh.region ?? '', titel: roh.titel ?? w,
        von: typeof roh.von === 'number' ? roh.von : null, matches: roh.matches ?? 0,
        // Aeltere Aggregate zaehlten Selbst-Eliminierungen (Sturm, Sturz) als Kill; sie stehen in den Opfern des Spielers selbst und werden abgezogen (28.10.2026).
        spieler: roh.spieler.filter((k) => k.epicId).map((k): [string, number, number, number] => {
          const selbst = Number((k as { opfer?: Record<string, number> }).opfer?.[k.epicId] ?? 0);
          return [k.epicId, k.matches ?? 0, Math.max(0, (k.kills ?? 0) - selbst), k.knocks ?? 0];
        }),
      };
    }
  } catch {
    // Unlesbar (gerade im Schreiben?) - nicht merken, beim naechsten Mal noch einmal (AGENTS.md: ein Fehlschlag ist kein Beweis).
    return null;
  }
  try {
    await echtesFs.mkdir(path.dirname(merk), { recursive: true });
    const zwischen = `${merk}.${process.pid}.neu`;
    await echtesFs.writeFile(zwischen, JSON.stringify({ quelle, auszug }));
    await echtesFs.rename(zwischen, merk);
  } catch { /* nur ein Merkzettel */ }
  return auszug;
}

async function aggregateLesen(season: string): Promise<AggregatTag[]> {
  // Nie auf dem Host der Seite: alle Auswertungen einer Saison sind dort zu
  // viel (bis zu 54 MB je Spieltag, siehe lib/replaySchlank). Dort gilt die
  // vorgerechnete Antwort des stuendlichen Laufs; fehlt sie, ein Fehler statt
  // eines Absturzes.
  if (ohneDateien()) throw new Error('Season replay aggregates are only read by the hourly job.');

  let fenster: string[] = [];
  try { fenster = await fs.readdir(path.join(ABLAGE, season)); } catch { fenster = []; }

  /*
   * Wie viele Matches ein Spieltag insgesamt hatte - aus der Uebersicht.
   *
   * Sie lag vorher in jeder Sammler-Datei einzeln; hundert Fenster hiessen
   * hundert weitere Lesevorgaenge aus der Ablage, und auf dem Server lief
   * die Startansicht damit in die Zeitgrenze. Die fertige Uebersicht der
   * Replays traegt dieselbe Zahl je Fenster - ein einziger Lesevorgang.
   */
  const gesamtJe = new Map<string, number>();
  try {
    const u = await liesJson<{ wert?: { fenster?: Array<{ windowId: string; gesamt?: number }> } } | null>(
      'antworten/replays_uebersicht.json', null);
    for (const f of u?.wert?.fenster ?? []) {
      if (typeof f.gesamt === 'number') gesamtJe.set(f.windowId, f.gesamt);
    }
  } catch { /* dann bleibt die Gesamtzahl unbekannt */ }

  const tage: AggregatTag[] = [];
  /*
   * Vier nebeneinander, nicht sechzehn, und je Konto nur die vier Zahlen, die die Saisonliste braucht (16.11.2026).
   *
   * Ein Aggregat traegt je Konto weit mehr (Opfer, Waffen, Matches) - in Season 43 bis 156 MB je Datei, zusammen fast drei
   * Gigabyte. Sechzehn davon zugleich als Zeichenkette und als Objekt, und alle Konten mit allen Feldern bis zum Ende gehalten:
   * der Server des Stundenlaufs lief bei der Startansicht nach zehn Minuten in "JavaScript heap out of memory" (7 GB), in jedem
   * Lauf, und mit ihm Teil 1 des Vorrechnens - die Liste von S43 blieb beim 6.11. stehen.
   */
  const GLEICHZEITIG = 4;
  for (let i = 0; i < fenster.length; i += GLEICHZEITIG) {
    const gruppe = fenster.slice(i, i + GLEICHZEITIG);
    const ergebnisse = await Promise.all(gruppe.map(async (w): Promise<AggregatTag | null> => {
      const a = await aggregatAuszug(season, w);
      if (!a) return null;
      /*
       * Die Gesamtzahl aus der Uebersicht kann kleiner sein als die ausgewerteten Matches (PE Cup EU 08.10.: 230 ausgewertet,
       * Gesamtzahl 64) - dann zaehlt sie etwas anderes und ist hier falsch. Lieber keine Gesamtzahl als "230/64".
       */
      const gesamtRoh = gesamtJe.get(w) ?? null;
      const gesamt = gesamtRoh !== null && gesamtRoh >= a.matches ? gesamtRoh : null;
      return {
        season, windowId: w, eventId: a.eventId, region: a.region, titel: a.titel, datum: a.von,
        ausgewertet: a.matches, gesamt,
        spieler: a.spieler.map(([epicId, matches, kills, knocks]) => ({ epicId, matches, kills, knocks })),
      };
    }));
    for (const t of ergebnisse) if (t) tage.push(t);
  }

  return tage;
}

/**
 * Was die Replays zu diesem Spieler an diesem Spieltag zaehlen.
 *
 * Gibt nichts zurueck, wenn kein Replay ausgewertet ist oder der Spieler
 * darin nicht vorkommt.
 */
/** Alle Konten eines Fensters auf einmal - fuer die Akten. */
export async function replayKarte(
  season: string, windowId: string,
): Promise<Map<string, ReplayWert>> {
  if (!season || !windowId) return new Map();
  return fensterKarte(season, windowId);
}

export async function replayWert(
  season: string, windowId: string, epicId: string,
): Promise<ReplayWert | null> {
  if (!season || !windowId || !epicId) return null;
  return (await fensterKarte(season, windowId)).get(epicId) ?? null;
}
