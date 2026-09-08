// Die Power Rankings von Epic.
//
// Epic fuehrt eine einzige, weltweite Rangliste. Die Adresse traegt zwar einen
// Parameter "region", der aendert aber nichts am Ergebnis: in der angeblichen
// EU-Liste stehen 36 Laender, angefuehrt von 950 Spielern aus den Vereinigten
// Staaten, dazu Japaner, Mexikaner und Koreaner. Regionsreiter waeren also
// eine Behauptung ueber die Daten, die diese nicht hergeben.
//
// Geholt wird nicht von hier aus: Epic beantwortet jeden automatisierten
// Abruf mit 403 - aus Node ebenso wie aus einem ferngesteuerten Browser, und
// zwar bei identischen Kopfzeilen. Erkannt wird die Art der Verbindung, nicht
// die Kennung. Das gezielt auszuhebeln waere das Umgehen einer Bot-Erkennung
// und unterbleibt. Stattdessen liest ein Skript die Seite so, wie sie jedem
// Besucher angezeigt wird (siehe scripts/power-rankings-holen.mjs).

import fs from '@/lib/ablageFs';
import path from 'path';
import { DATEN_ORT } from './datenOrt';

const ABLAGE = path.join(DATEN_ORT, 'power-rankings');

/** Die eine Liste, die es gibt. */
export const LISTE = 'GLOBAL';

export interface PrSpieler {
  rank: number;
  /** Epic-Konto-Id - damit laesst sich der Spieler mit Turnierdaten verbinden. */
  id: string;
  name: string;
  /** Laenderkuerzel nach ISO, wie Epic es fuehrt. */
  land: string;
  wertung: number;
  bestwert: number;
  /** Veraenderung seit der letzten woechentlichen Fortschreibung. */
  deltaWertung: number;
  deltaPlatz: number;
}

export interface PrStand {
  region: string;
  spieler: PrSpieler[];
  /** Wie viele Epic insgesamt fuehrt - zur Gegenprobe. */
  gesamt: number;
  geholt: number;
}

/* ---------------------------------------------------------------- Ablage */

function datei(region: string) {
  return path.join(ABLAGE, `${region.toLowerCase()}.json`);
}

export async function lies(region: string): Promise<PrStand | null> {
  try {
    return JSON.parse(await fs.readFile(datei(region), 'utf8')) as PrStand;
  } catch {
    return null;
  }
}

export async function schreib(stand: PrStand) {
  await fs.mkdir(ABLAGE, { recursive: true });
  await fs.writeFile(datei(stand.region), JSON.stringify(stand), 'utf8');
}

/**
 * Wann die Rangliste geholt wird.
 *
 * Epic schreibt die Wertung in Abstaenden fort, nicht laufend - fuer die
 * Zahlen genuegte einmal taeglich. Die Namen sind der Grund fuer die drei
 * Termine: Profis benennen sich im Spiel um, wann sie wollen, und in dieser
 * Datei steht zu keinem Eintrag eine Konto-Id, ueber die sich ein Name
 * nachtraeglich richtigstellen liesse. Es gibt also keinen billigeren Weg
 * als den ganzen Abruf.
 *
 * Der Betreiber dazu: "Mach es so im Hintergrund, ohne dass man es checkt,
 * jeden Tag zwei-, dreimal die Usernamen updaten, falls Leute ihren
 * Username ingame aendern."
 *
 * Geprueft wird nicht "aelter als acht Stunden", sondern "vor dem letzten
 * Termin geholt": sonst verschoebe sich der Zeitpunkt mit jedem Lauf um ein
 * paar Minuten nach hinten.
 */
export const TERMIN_STUNDEN = [1, 9, 17];

/** Der zuletzt faellige Termin - notfalls der letzte von gestern. */
export function letzterTermin(jetzt = new Date()): number {
  const kandidaten = TERMIN_STUNDEN.map((h) => {
    const d = new Date(jetzt);
    d.setHours(h, 0, 0, 0);
    return d.getTime();
  }).filter((z) => z <= jetzt.getTime());

  if (kandidaten.length) return Math.max(...kandidaten);

  const gestern = new Date(jetzt);
  gestern.setDate(gestern.getDate() - 1);
  gestern.setHours(TERMIN_STUNDEN[TERMIN_STUNDEN.length - 1], 0, 0, 0);
  return gestern.getTime();
}

export function istAlt(stand: PrStand | null) {
  if (!stand?.geholt) return true;
  return stand.geholt < letzterTermin();
}

/**
 * Laeuft gerade ein Abruf? Ein zweiter waere nur doppelte Last.
 *
 * Der Merker haelt nur im laufenden Prozess - genau richtig, denn er soll
 * lediglich verhindern, dass mehrere gleichzeitige Aufrufe der Seite
 * denselben Abruf mehrfach anstossen.
 */
const laeuft = new Set<string>();

/**
 * Im Hintergrund erneuern, ohne den Aufrufer warten zu lassen.
 *
 * Geholt wird nicht von hier aus: Epic lehnt Abrufe aus Node ab (siehe oben).
 * Gestartet wird stattdessen das Skript, das die Seite in einem Browser liest.
 * Es laeuft losgeloest weiter und schreibt seine Datei, wenn es fertig ist -
 * die Seite zeigt derweil den vorhandenen Stand und ist sofort da.
 */
export function erneuereImHintergrund(region: string) {
  if (laeuft.has(region)) return;
  laeuft.add(region);

  void (async () => {
    try {
      const { spawn } = await import('child_process');
      const skript = path.join(process.cwd(), 'scripts', 'power-rankings-holen.mjs');
      const lauf = spawn(process.execPath, [skript, region], {
        cwd: process.cwd(),
        detached: true,
        stdio: 'ignore',
      });
      lauf.on('exit', () => laeuft.delete(region));
      lauf.on('error', (e) => {
        console.warn('Power Rankings nicht erneuerbar:', e.message);
        laeuft.delete(region);
      });
      lauf.unref();
      // Der Merker faellt spaetestens nach einer halben Stunde wieder weg,
      // damit ein abgebrochener Lauf den naechsten nicht dauerhaft sperrt.
      setTimeout(() => laeuft.delete(region), 30 * 60 * 1000).unref?.();
    } catch (e) {
      console.warn('Power Rankings nicht erneuerbar:', (e as Error).message);
      laeuft.delete(region);
    }
  })();
}
