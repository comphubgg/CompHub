import fs from '@/lib/ablageFs';
import path from 'path';
import { DATEN_ORT } from './datenOrt';
import {
  neuerSchluessel, schluesselTaugt, schonVergeben,
} from './zugangsSchluessel';

/*
 * Die selbst vergebenen Zugaenge - Name und Schluessel statt Adresse und
 * Passwort.
 *
 * Der Betreiber wollte diesen Konten dieselben Rollen geben koennen wie
 * gewoehnlichen: Admin, Manager mit angehakten Bereichen, Pro, VIP auf
 * Zeit. Die Verwaltung schrieb das auch schon in die Datei - nur las es
 * niemand wieder. Wer sich mit einem Schluessel anmeldete, war deshalb
 * immer nur "VIP", ganz gleich, was danebenstand.
 *
 * Diese Datei ist die eine Stelle, an der nachgesehen wird.
 */

const DATEI = path.join(DATEN_ORT, 'vip-users.json');

export interface Zugang {
  username: string;
  accessKey: string;
  status: 'active' | 'disabled';
  createdAt: string;
  rolle?: 'admin' | 'manager' | 'pro';
  rechte?: string[];
  epicId?: string;
  vipBis?: number;
  /*
   * Darf dieser VIP seinen Schluessel selbst aendern?
   *
   * Standardmaessig nicht - ein Zugang ist etwas, das der Betreiber vergibt.
   * Wer aber seinen Schluessel oeffentlich vertippt hat oder ihn regelmaessig
   * wechseln will, muss dafuer nicht jedes Mal fragen. Der Betreiber hakt
   * das je Zugang einzeln an.
   */
  darfSchluessel?: boolean;
  /**
   * Fuer wen dieser Zugang die Overlays verwaltet.
   *
   * Ein Manager-Zugang gehoert nicht einer Person, sondern einem Streamer:
   * mehrere Leute teilen sich "groupay-manager" und betreuen damit die
   * Overlays von "groupay". Steht hier ein Name, arbeitet dieser Zugang auf
   * dessen Ablage - er sieht dessen gespeicherte Overlays, kann Spieler
   * darin tauschen und neue anlegen, und alles Angelegte gehoert weiterhin
   * dem Streamer.
   *
   * Der Manager kann seinen eigenen Schluessel nicht wechseln; das bleibt
   * beim Betreiber. Sonst haette einer von mehreren die anderen ausgesperrt.
   */
  verwaltet?: string;
  /**
   * Wer diesen Manager-Zugang benutzen darf - namentlich.
   *
   * Schluessel und Zugangsname sind fuer alle gleich; verschieden ist nur der
   * Name, den jeder beim Anmelden angibt. Diese Liste sagt, welche Namen es
   * gibt. Der Betreiber wollte das ausdruecklich als Sperre und nicht bloss
   * als Beschriftung: "wenn ich den Namen loesche und er trotzdem Access Key
   * und den Zugangsnamen richtig hat, dann geht's nicht, weil sein Name ist
   * nicht registriert."
   *
   * Damit laesst sich ein einzelner Mod aussperren, ohne den Schluessel zu
   * wechseln - und ohne die anderen mitten im Stream mit auszusperren. Genau
   * das war der Grund, warum ein gemeinsamer Schluessel ueberhaupt in Frage
   * kam.
   *
   * Eine leere Liste heisst: noch niemand eingetragen, also kommt auch
   * niemand hinein. Das ist die sichere Seite - ein Zugang, der jeden
   * hereinlaesst, solange keine Namen dastehen, waere eine Falle.
   */
  mods?: string[];
}

export async function alleZugaenge(): Promise<Zugang[]> {
  try {
    const roh = JSON.parse(await fs.readFile(DATEI, 'utf8')) as { users?: Zugang[] };
    return Array.isArray(roh.users) ? roh.users : [];
  } catch {
    return [];
  }
}

/** Der Zugang zu diesem Anmeldenamen - oder nichts. */
export async function zugangNach(name: string): Promise<Zugang | null> {
  const gesucht = name.trim().toLowerCase();
  if (!gesucht) return null;
  const alle = await alleZugaenge();
  return alle.find((z) => z.username.toLowerCase() === gesucht) ?? null;
}

/**
 * Was dieser Zugang darf.
 *
 * Ein stillgelegter Zugang darf nichts - auch dann nicht, wenn sein Cookie
 * noch gueltig ist. Sonst bliebe eine Sperre bis zu dreissig Tage wirkungslos.
 */
export function rechteVon(z: Zugang | null): {
  gueltig: boolean;
  rolle: 'admin' | 'manager' | 'pro' | null;
  rechte: string[];
  vip: boolean;
  epicId: string | null;
} {
  if (!z || z.status !== 'active') {
    return { gueltig: false, rolle: null, rechte: [], vip: false, epicId: null };
  }
  /*
   * Ein Zugangskonto ist seinem Zweck nach VIP. Eine Frist schraenkt das
   * zusaetzlich ein; 0 heisst "ohne Ende".
   *
   * Wer ueber VIP steht - Pro, Manager, Admin -, behaelt das Recht auch ohne
   * Frist: die Stufen liegen uebereinander, und eine abgelaufene VIP-Frist
   * darf einem Pro nicht die Streamer-Ordner nehmen, die ein VIP hat.
   */
  const ueberVip = z.rolle === 'admin' || z.rolle === 'manager' || z.rolle === 'pro';
  const vip = ueberVip
    || z.vipBis === undefined || z.vipBis === 0 || z.vipBis > Date.now();
  return {
    gueltig: true,
    rolle: z.rolle ?? null,
    rechte: z.rechte ?? [],
    vip,
    epicId: z.epicId ?? null,
  };
}

/**
 * Einen neuen Schluessel fuer einen vorhandenen Zugang.
 *
 * Steht hier und nicht in einer Route, weil es zwei Wege dorthin gibt: den
 * Knopf im Adminwerkzeug und den Knopf unter der Schluesselnachricht in
 * Discord. Der Betreiber wollte das ausdruecklich beidseitig - "da kann man
 * es auch ueber Discord, aber das wird dann auch im Tool direkt angepasst."
 * Lagen die Regeln zweimal herum, waere in einer Woche der eine Weg
 * strenger als der andere.
 *
 * Wer darf: ein gueltiger Zugang, dem der Betreiber das Recht gegeben hat
 * (darfSchluessel). Ein Manager-Zugang nie - mehrere Leute teilen ihn sich,
 * und einer koennte damit die anderen aussperren. Mit "ausDemWerkzeug" faellt
 * die Rechtepruefung weg: dort steht der Betreiber selbst davor.
 */
export async function wechsleSchluessel(
  name: string, { ausDemWerkzeug = false, ausDiscord = false } = {},
): Promise<{ ok: boolean; schluessel?: string; grund?: string }> {
  const gesucht = name.trim().toLowerCase();
  if (!gesucht) return { ok: false, grund: 'kein Name' };

  const alle = await alleZugaenge();
  const i = alle.findIndex((z) => z.username.toLowerCase() === gesucht);
  if (i < 0) return { ok: false, grund: 'nicht gefunden' };

  const z = alle[i];
  if (!ausDemWerkzeug) {
    if (z.status !== 'active') return { ok: false, grund: 'stillgelegt' };
    if ((z.verwaltet ?? '').trim()) return { ok: false, grund: 'manager' };
    /*
     * Aus Discord darf jeder VIP, im Werkzeug nur der mit dem Haken.
     *
     * Das klingt widerspruechlich, ist aber der Sinn der Sache: der Knopf
     * steht im privaten Kanal genau dieses VIPs, und er ist der Weg zurueck,
     * wenn der Zugang selbst nicht mehr geht - "wenn er zum Beispiel grade
     * keinen Access hat auf seinen Account, dann kann er's ueber den Discord
     * machen". Wer schon angemeldet ist, braucht ihn nicht.
     */
    if (!ausDiscord && !z.darfSchluessel) return { ok: false, grund: 'nicht erlaubt' };
  }

  // Ein doppelter Schluessel waere ein halber fremder Zugang - siehe
  // lib/zugangsSchluessel.ts. Deshalb im Zweifel noch einmal wuerfeln.
  let frisch = neuerSchluessel();
  for (let versuch = 0; schonVergeben(frisch, alle, z.username) && versuch < 5;
    versuch += 1) {
    frisch = neuerSchluessel();
  }

  alle[i] = { ...z, accessKey: frisch, status: 'active' };
  await schreibeZugaenge(alle);
  return { ok: true, schluessel: frisch };
}

/**
 * Einen selbst gewaehlten Schluessel setzen.
 *
 * Denselben Weg wie wechsleSchluessel, nur mit einem Wert statt mit Zufall -
 * und mit denselben Pruefungen, die auch das Werkzeug anwendet. Der Betreiber
 * wollte das von Discord aus moeglich machen: "wenn Sie auf own Key druecken,
 * dann koennen Sie selber einen eingeben."
 *
 * Wer darf, entscheidet der Haken am Zugang - bei diesem Weg auch dann, wenn
 * er aus Discord kommt. Anders als beim blossen Erneuern ist das hier kein
 * Notausgang, sondern eine Wahl, und die hat der Betreiber sich vorbehalten.
 */
export async function setzeSchluessel(
  name: string, wert: string,
): Promise<{ ok: boolean; schluessel?: string; grund?: string }> {
  const gesucht = name.trim().toLowerCase();
  const neu = wert.trim();
  if (!gesucht) return { ok: false, grund: 'kein Name' };

  const alle = await alleZugaenge();
  const i = alle.findIndex((z) => z.username.toLowerCase() === gesucht);
  if (i < 0) return { ok: false, grund: 'nicht gefunden' };

  const z = alle[i];
  if (z.status !== 'active') return { ok: false, grund: 'stillgelegt' };
  if ((z.verwaltet ?? '').trim()) return { ok: false, grund: 'manager' };
  if (!z.darfSchluessel) return { ok: false, grund: 'nicht erlaubt' };

  const einwand = schluesselTaugt(neu);
  if (einwand) return { ok: false, grund: einwand };
  if (schonVergeben(neu, alle, z.username)) {
    return { ok: false, grund: 'vergeben' };
  }

  alle[i] = { ...z, accessKey: neu };
  await schreibeZugaenge(alle);
  return { ok: true, schluessel: neu };
}

/**
 * Die Zugangsdatei zurueckschreiben.
 *
 * Bewusst knapp und ohne eigene Pruefungen: wer hier schreibt, hat die Liste
 * gerade selbst gelesen und geaendert.
 */
export async function schreibeZugaenge(users: Zugang[]): Promise<void> {
  await fs.mkdir(path.dirname(DATEI), { recursive: true });
  await fs.writeFile(DATEI, JSON.stringify({ users }, null, 2), 'utf8');
}
