import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { DATEN_ORT } from './datenOrt';

// Benutzerkonten.
//
// Bisher gab es zwei Wege herein: eine Discord-Anmeldung fuer den Admin und
// eine Liste von Zugangsschluesseln fuer VIPs. Beides beantwortet die Frage
// "wer bist du?" nicht - es beantwortet "darfst du rein?". Fuer ein eigenes
// Profil mit eigenen Socials und eigenen Werten braucht es ein Konto.
//
// Abgelegt wird lokal in data/konten.json. Supabase waere der naheliegende
// Ort, ist aber nicht eingerichtet - in .env.local stehen Platzhalter, und
// die uebrigen Routen fallen laengst auf Dateien zurueck. Eine Datei ist fuer
// diese Groessenordnung ohnehin ehrlicher als eine halb angeschlossene
// Datenbank.
//
// -------------------------------------------------------------- Passwoerter
//
// Gehasht mit scrypt aus Node selbst - kein Fremdcode, keine Abhaengigkeit.
// scrypt ist absichtlich langsam und speicherhungrig; ein gestohlener
// Datenbestand laesst sich damit nicht in vertretbarer Zeit durchprobieren.
// Je Konto ein eigener Zufallswert, damit zwei gleiche Passwoerter nicht
// gleich aussehen.
//
// Verglichen wird zeitkonstant. Ein Vergleich mit === verraet ueber die
// Laufzeit, wie viele Zeichen stimmen.

const DATEI = path.join(DATEN_ORT, 'konten.json');

const GEHEIMNIS = process.env.AUTH_COOKIE_SECRET
  || process.env.DISCORD_CLIENT_SECRET
  || process.env.TWITCH_CLIENT_SECRET
  || 'streamer-dashboard-secret';

/** Wie lange eine Anmeldung gilt. */
export const SITZUNG_TAGE = 30;

export interface Konto {
  id: string;
  /** Kleingeschrieben - "Max@x.de" und "max@x.de" sind dasselbe Postfach. */
  email: string;
  /** Der angezeigte Name. Frei waehlbar, muss nicht eindeutig sein. */
  name: string;
  /** scrypt-Hash und Zufallswert, durch einen Doppelpunkt getrennt. */
  passwort?: string;
  /** Verknuepfte Anmeldedienste, je Dienst die dortige Konto-Id. */
  dienste?: { twitch?: string; discord?: string; google?: string };
  /** Ist die Adresse bestaetigt? */
  bestaetigt: boolean;
  /** Der offene Bestaetigungsschluessel, solange sie es nicht ist. */
  bestaetigung?: string;
  /*
   * Ein offener Weg, das Passwort neu zu setzen.
   *
   * Mit Ablauf: ein Schluessel, der ewig gilt, ist ein zweites Passwort in
   * einem Postfach, auf das irgendwann jemand anders Zugriff hat. Eine Stunde
   * reicht, um eine Mail zu lesen.
   */
  zuruecksetzung?: { schluessel: string; bis: number };
  /** Das eigene Epic-Konto - dann zeigt das Profil die eigenen Werte. */
  epicId?: string;
  /**
   * Was dieses Konto darf.
   *
   * Ohne Angabe ist es ein gewoehnlicher Nutzer.
   *
   *   pro     - ein Profispieler. Er verwaltet nichts, darf sich aber auf
   *             den Karten der Cups, die er spielt, selbst eintragen.
   *             Dafuer muss sein Epic-Konto hinterlegt sein - ueber die Id
   *             erkennt die Karte ihn in ihrer Teamliste wieder.
   *   manager - darf genau die Bereiche, die der Admin angehakt hat.
   *   admin   - alles.
   */
  rolle?: 'admin' | 'manager' | 'pro';
  /**
   * Welche Bereiche ein Manager pflegen darf.
   *
   * Nur fuer die Rolle "manager" von Bedeutung: ein Admin darf ohnehin
   * alles, und ohne Rolle darf niemand etwas. Die Schluessel stehen in
   * lib/rechte.ts.
   */
  rechte?: string[];
  /**
   * Ab wann das VIP bekannt ist.
   *
   * Damit die Nachricht "du hast VIP bekommen" genau einmal erscheint: sie
   * kommt, solange dieser Wert nicht zum aktuellen VIP passt, und wird beim
   * Bestaetigen nachgezogen. Ohne so einen Merker stuende sie bei jedem
   * Aufruf wieder da.
   */
  vipGesehen?: number;
  /**
   * Gesperrt - dann kommt dieses Konto nicht mehr herein.
   *
   * Der Text ist der Grund, den der Admin notiert hat; er steht nur in der
   * Verwaltung, nicht beim Gesperrten.
   */
  gesperrt?: { seit: number; grund: string };
  /**
   * Die zuletzt gesehenen Anschluesse, hoechstens fuenf.
   *
   * Sie dienen der Sperre nur als Zusatz - massgeblich ist immer das Konto.
   * Anschluesse wechseln taeglich, hinter einem sitzt oft ein ganzer
   * Haushalt, und mit dem Mobilfunk ist jeder in Sekunden wieder da.
   */
  ips?: string[];
  /**
   * Bis wann VIP - als Zeitstempel.
   *
   * Getrennt von der Rolle, weil beides nebeneinander gilt: jemand kann
   * Manager sein und zusaetzlich eine Woche VIP. Laeuft die Woche ab, faellt
   * nur das VIP weg, die Rolle bleibt.
   *
   * Fehlt das Feld, ist das Konto kein VIP. Steht dort 0, gilt VIP ohne
   * Ende.
   */
  vipBis?: number;
  /*
   * Wann VIP vergeben wurde - ein Zeitstempel je Vergabe.
   *
   * `vipBis` sagt, bis wann es gilt, nicht seit wann. Fuer die Auswertung im
   * Dashboard ("wie viele haben an diesem Tag VIP bekommen?") ist aber genau
   * der Zeitpunkt der Vergabe gefragt, und der stand nirgends. Rueckwirkend
   * laesst er sich nicht herstellen - deshalb faengt diese Liste bei den
   * bestehenden Konten leer an und fuellt sich ab der naechsten Vergabe.
   *
   * Eine Liste und kein einzelner Wert, weil VIP verlaengert und erneut
   * vergeben wird; ein einzelner Wert wuerde die frueheren Vergaben
   * ueberschreiben und die Auswertung still verfaelschen.
   */
  vipVergaben?: number[];
  /** Eigene Socials, vom Nutzer selbst gepflegt. */
  socials?: Record<string, string>;
  /** Pfad zum selbst hochgeladenen Bild. */
  bild?: string;
  /**
   * Zuletzt nachgeschlagene Spieler, neueste zuerst.
   *
   * Eine Namenssuche ist mehrdeutig - auf "shxrk" passen mehrere Konten, und
   * der gesuchte heisst im Spiel anders als auf dem Trikot. Wer einmal den
   * richtigen getroffen hat, soll ihn wiederfinden, ohne dieselbe unsichere
   * Suche noch einmal richtig treffen zu muessen.
   */
  spielerVerlauf?: Array<{ id: string; name: string }>;
  /**
   * Gespeicherte Banner-Vorlagen fuer die Overlays.
   *
   * Bewusst ohne Cup: eine Vorlage gehoert einem Duo und einem Aussehen. Den
   * Spieltag sucht sich das Banner beim Anzeigen selbst, sonst muesste nach
   * jedem Turnier jede Adresse in OBS neu gesetzt werden.
   */
  bannerVorlagen?: Array<{
    id: string; titel: string; region: string;
    ids: string[]; namen: string[];
    vorlage: string; klar: number; hoehe: number;
  }>;
  angelegt: string;
  zuletzt?: string;
}

async function lies(): Promise<Konto[]> {
  try {
    return JSON.parse(await fs.readFile(DATEI, 'utf8')) as Konto[];
  } catch {
    return [];
  }
}

async function schreibe(liste: Konto[]) {
  await fs.mkdir(path.dirname(DATEI), { recursive: true });
  await fs.writeFile(DATEI, JSON.stringify(liste, null, 1), 'utf8');
}

/* ------------------------------------------------------------ Passwoerter */

function hashe(passwort: string, salz: string): string {
  return crypto.scryptSync(passwort.normalize('NFKC'), salz, 64).toString('hex');
}

export function neuesPasswort(passwort: string): string {
  const salz = crypto.randomBytes(16).toString('hex');
  return `${salz}:${hashe(passwort, salz)}`;
}

export function passwortStimmt(passwort: string, gespeichert?: string): boolean {
  if (!gespeichert) return false;
  const [salz, erwartet] = gespeichert.split(':');
  if (!salz || !erwartet) return false;
  const gerechnet = hashe(passwort, salz);
  // Zeitkonstant - sonst verraet die Laufzeit, wie weit man richtig lag.
  const a = Buffer.from(gerechnet, 'hex');
  const b = Buffer.from(erwartet, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Taugt dieses Passwort?
 *
 * Bewusst nur eine Laenge, keine Vorschriften ueber Sonderzeichen. Die
 * treiben Leute zu "Passwort1!" - laenger ist wirksamer als bunter.
 */
export function passwortTaugt(passwort: string): string | null {
  if (passwort.length < 8) return 'Das Passwort braucht mindestens acht Zeichen.';
  if (passwort.length > 200) return 'Das Passwort ist zu lang.';
  return null;
}

export function emailTaugt(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email.trim());
}

/* --------------------------------------------------------------- Sitzungen */

function unterschrift(wert: string) {
  return crypto.createHmac('sha256', GEHEIMNIS).update(wert).digest('hex');
}

/** Der Cookie-Wert zu einem Konto: Id, Zeitpunkt, Unterschrift. */
export function sitzungFuer(kontoId: string): string {
  const zeit = String(Date.now());
  return `${kontoId}:${zeit}:${unterschrift(`${kontoId}:${zeit}`)}`;
}

/** Welches Konto steckt in diesem Cookie - oder null. */
export function kontoAus(cookieWert: string | undefined): string | null {
  if (!cookieWert) return null;
  const teile = cookieWert.split(':');
  if (teile.length !== 3) return null;
  const [id, zeit, signatur] = teile;

  const erwartet = unterschrift(`${id}:${zeit}`);
  const a = Buffer.from(signatur);
  const b = Buffer.from(erwartet);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const erstellt = Number(zeit);
  if (!Number.isFinite(erstellt)) return null;
  if (Date.now() - erstellt > SITZUNG_TAGE * 24 * 3600 * 1000) return null;
  return id;
}

/* ----------------------------------------------------------------- Zugriff */

export async function nachId(id: string): Promise<Konto | null> {
  return (await lies()).find((k) => k.id === id) ?? null;
}

/**
 * Ein Konto ueber den Anzeigenamen.
 *
 * Namen muessen nicht eindeutig sein - deshalb wird nur zurueckgegeben, was
 * eindeutig ist. Zwei Leute mit demselben Namen anzumelden hiesse raten, und
 * beim Anmelden wird nicht geraten.
 */
export async function nachName(name: string): Promise<Konto | null> {
  const k = name.trim().toLowerCase();
  if (!k) return null;
  const treffer = (await lies()).filter(
    (x) => String(x.name ?? '').trim().toLowerCase() === k);
  return treffer.length === 1 ? treffer[0] : null;
}

export async function nachEmail(email: string): Promise<Konto | null> {
  const gesucht = email.trim().toLowerCase();
  return (await lies()).find((k) => k.email === gesucht) ?? null;
}

export async function nachDienst(
  dienst: 'twitch' | 'discord' | 'google', fremdeId: string,
): Promise<Konto | null> {
  return (await lies()).find((k) => k.dienste?.[dienst] === fremdeId) ?? null;
}

/**
 * Ein Konto anlegen.
 *
 * Gibt es die Adresse schon, entsteht kein zweites - der Aufrufer bekommt
 * einen Fehler und kann zur Anmeldung schicken. Zwei Konten zu einer Adresse
 * waeren spaeter nicht mehr auseinanderzuhalten.
 */
export async function anlegen(neu: {
  email: string; name: string; passwort?: string;
  dienst?: { art: 'twitch' | 'discord' | 'google'; id: string };
  bestaetigt?: boolean;
}): Promise<{ konto: Konto } | { fehler: string }> {
  const email = neu.email.trim().toLowerCase();
  if (!emailTaugt(email)) return { fehler: 'Diese E-Mail-Adresse sieht nicht gültig aus.' };

  const liste = await lies();
  const vorhanden = liste.find((k) => k.email === email);
  if (vorhanden) {
    /*
     * Ein gesperrtes Konto bekommt einen eigenen Satz.
     *
     * Sonst stand hier "es gibt schon ein Konto, bitte anmelden" - und das
     * Anmelden scheiterte anschliessend an der Sperre. Wer gesperrt ist,
     * lief also im Kreis, ohne zu erfahren, warum. Und der Betreiber sah
     * dieselbe Meldung und hielt sie fuer die Folge eines geloeschten
     * Kontos, obwohl Loeschen die Adresse sehr wohl freigibt: geprueft,
     * anlegen - loeschen - erneut anlegen geht ohne Umweg.
     *
     * Dass die Adresse belegt ist, verraet die alte Meldung ohnehin; hier
     * kommt also nichts hinzu, was nicht schon dastuende.
     */
    if (vorhanden.gesperrt) {
      return { fehler: 'Dieses Konto ist gesperrt. Eine neue Anmeldung mit '
        + 'derselben Adresse ist nicht möglich — wende dich an den Betreiber.' };
    }
    return { fehler: 'Zu dieser Adresse gibt es schon ein Konto. Bitte anmelden.' };
  }

  const konto: Konto = {
    id: crypto.randomUUID(),
    email,
    name: neu.name.trim().slice(0, 40) || email.split('@')[0],
    ...(neu.passwort ? { passwort: neuesPasswort(neu.passwort) } : {}),
    ...(neu.dienst ? { dienste: { [neu.dienst.art]: neu.dienst.id } } : {}),
    // Ueber einen Anmeldedienst ist die Adresse bereits geprueft - Twitch
    // und Google lassen niemanden mit einer fremden Adresse herein.
    bestaetigt: Boolean(neu.bestaetigt ?? neu.dienst),
    ...(neu.dienst || neu.bestaetigt
      ? {} : { bestaetigung: crypto.randomBytes(24).toString('hex') }),
    angelegt: new Date().toISOString(),
  };

  liste.push(konto);
  await schreibe(liste);
  return { konto };
}

/** Ein bestehendes Konto aendern - nur die genannten Felder. */
export async function aendern(id: string, aenderung: Partial<Konto>): Promise<Konto | null> {
  const liste = await lies();
  const i = liste.findIndex((k) => k.id === id);
  if (i < 0) return null;
  /*
   * Id, Adresse und Passwort-Hash lassen sich hier nicht ueberschreiben -
   * dafuer gibt es eigene Wege mit eigener Pruefung. Ausgesiebt wird ueber
   * eine Liste statt ueber ein Zerlegen mit ungenutzten Namen: so steht
   * lesbar da, was geschuetzt ist.
   */
  const gesperrt = new Set(['id', 'email', 'passwort']);
  const erlaubt = Object.fromEntries(
    Object.entries(aenderung).filter(([k]) => !gesperrt.has(k)));
  liste[i] = { ...liste[i], ...erlaubt };
  await schreibe(liste);
  return liste[i];
}

/** Einen Anmeldedienst mit einem bestehenden Konto verknuepfen. */
export async function verknuepfe(
  id: string, art: 'twitch' | 'discord' | 'google', fremdeId: string,
): Promise<Konto | null> {
  const liste = await lies();
  const i = liste.findIndex((k) => k.id === id);
  if (i < 0) return null;
  liste[i].dienste = { ...(liste[i].dienste ?? {}), [art]: fremdeId };
  await schreibe(liste);
  return liste[i];
}

/**
 * Ein neues Passwort setzen.
 *
 * Zwei Faelle, und sie sind verschieden streng:
 *
 *   * Das Konto hat schon ein Passwort -> das alte muss stimmen. Sonst
 *     koennte jeder, der einen Rechner offen vorfindet, das Konto
 *     uebernehmen.
 *   * Das Konto hat keines (angelegt ueber Google, Twitch oder Discord) ->
 *     das erste Passwort darf ohne altes gesetzt werden. Wer hier ankommt,
 *     hat sich gerade beim Anbieter ausgewiesen; genau das ist die
 *     Bestaetigung ueber die Adresse.
 *
 * Ein Weg per E-Mail existiert bewusst nicht: dafuer waere ein Mailversand
 * noetig, und der ist nicht eingerichtet. Lieber kein Weg als einer, der
 * ins Leere laeuft.
 */
export async function setzePasswort(
  id: string, neuesKlartext: string, altesKlartext?: string,
): Promise<{ ok: true } | { fehler: string }> {
  const liste = await lies();
  const i = liste.findIndex((k) => k.id === id);
  if (i < 0) return { fehler: 'Konto nicht gefunden.' };

  const meldung = passwortTaugt(neuesKlartext);
  if (meldung) return { fehler: meldung };

  if (liste[i].passwort) {
    if (!altesKlartext) return { fehler: 'Bitte das bisherige Passwort eingeben.' };
    if (!passwortStimmt(altesKlartext, liste[i].passwort)) {
      return { fehler: 'Das bisherige Passwort stimmt nicht.' };
    }
  }

  liste[i].passwort = neuesPasswort(neuesKlartext);
  await schreibe(liste);
  return { ok: true };
}

/**
 * Das Konto endgueltig entfernen.
 *
 * Ohne Papierkorb: was hier verschwindet, ist weg. Die Oberflaeche laesst
 * deshalb die eigene Adresse abtippen, bevor sie das ueberhaupt aufruft.
 */
export async function loesche(id: string): Promise<boolean> {
  const liste = await lies();
  const uebrig = liste.filter((k) => k.id !== id);
  if (uebrig.length === liste.length) return false;
  await schreibe(uebrig);
  return true;
}

/**
 * Alle Konten fuer die Verwaltung.
 *
 * Bewusst ohne E-Mail und ohne alles, was zum Anmelden taugt: der Admin
 * soll Rechte vergeben koennen, nicht in fremden Postfaechern lesen. Was
 * bleibt, ist genau das, was zum Wiedererkennen noetig ist - Name, Id und
 * was das Konto darf.
 */
export async function alleKonten() {
  return (await lies()).map((k) => ({
    id: k.id,
    name: k.name,
    rolle: k.rolle ?? null,
    rechte: k.rechte ?? [],
    // Fuer die Profirolle: ohne sie kann sich niemand auf einer Karte
    // eintragen, deshalb steht sie in der Verwaltung.
    epicId: k.epicId ?? null,
    spielerVerlauf: k.spielerVerlauf ?? [],
    bannerVorlagen: k.bannerVorlagen ?? [],
    vip: istVip(k),
    vipBis: k.vipBis ?? null,
    // Wann VIP vergeben wurde - fuer die Nutzungszahlen im Dashboard. Die
    // Kontoverwaltung selbst braucht die Liste nicht und zeigt sie nicht an.
    vipVergaben: k.vipVergaben ?? [],
    gesperrt: k.gesperrt ?? null,
    ips: (k.ips ?? []).slice(0, 3),
    dienste: Object.keys(k.dienste ?? {}),
    bestaetigt: k.bestaetigt,
    angelegt: k.angelegt,
    zuletzt: k.zuletzt ?? null,
  }));
}

/**
 * Rolle und VIP setzen.
 *
 * Beides zusammen, weil der Admin es in einem Zug entscheidet. Ein
 * ungueltiges Datum wird abgelehnt, statt still zu einem Konto ohne VIP zu
 * fuehren.
 */
export async function setzeRechte(
  id: string,
  rolle: 'admin' | 'manager' | 'pro' | null,
  vipTage: number | null,
  bereiche?: string[],
): Promise<Konto | null> {
  const liste = await lies();
  const i = liste.findIndex((k) => k.id === id);
  if (i < 0) return null;

  if (rolle) liste[i].rolle = rolle;
  else delete liste[i].rolle;

  /*
   * Die Bereiche gelten nur fuer Manager. Faellt die Rolle weg oder wird
   * jemand Admin, verschwinden sie - ein Admin darf ohnehin alles, und eine
   * Liste, die niemand mehr liest, ist nur eine Falle fuer spaeter.
   */
  if (rolle === 'manager' && Array.isArray(bereiche)) {
    liste[i].rechte = bereiche.slice(0, 20);
  } else if (rolle !== 'manager') {
    delete liste[i].rechte;
  }

  /*
   * Den Zeitpunkt festhalten, aber nur bei einer echten Vergabe.
   *
   * Wer VIP wegnimmt, vergibt keines; und wer den Bereich eines Managers
   * anhakt, ohne am VIP zu ruehren, ebenso wenig. Sonst stuende im Diagramm
   * jede Speicherung als neue Vergabe.
   */
  const warVip = istVip(liste[i]);

  if (vipTage === null) delete liste[i].vipBis;
  else if (vipTage === 0) liste[i].vipBis = 0;                 // ohne Ende
  else liste[i].vipBis = Date.now() + vipTage * 86_400_000;

  if (!warVip && istVip(liste[i])) {
    // Gekappt, damit ein einzelnes Konto die Datei nicht vollschreibt.
    liste[i].vipVergaben = [...(liste[i].vipVergaben ?? []), Date.now()].slice(-50);
  }

  await schreibe(liste);
  return liste[i];
}

/** Die VIP-Nachricht als gesehen abhaken. */
export async function vipBestaetigen(id: string): Promise<void> {
  const liste = await lies();
  const i = liste.findIndex((k) => k.id === id);
  if (i < 0) return;
  liste[i].vipGesehen = liste[i].vipBis ?? 0;
  await schreibe(liste);
}

/** Sperren oder freigeben. */
export async function setzeSperre(
  id: string, gesperrt: boolean, grund = '',
): Promise<Konto | null> {
  const liste = await lies();
  const i = liste.findIndex((k) => k.id === id);
  if (i < 0) return null;
  if (gesperrt) liste[i].gesperrt = { seit: Date.now(), grund: grund.slice(0, 200) };
  else delete liste[i].gesperrt;
  await schreibe(liste);
  return liste[i];
}

/**
 * Eine Adresse von Hand als bestaetigt setzen.
 *
 * Eigentlich bestaetigt sich eine Adresse selbst, indem der Nutzer auf einen
 * Link in einer Mail klickt. Nur gibt es keinen Versanddienst - das Werkzeug
 * verschickt nichts, und niemand bekommt so eine Mail. Das Konto laesst sich
 * trotzdem benutzen, aber es stand auf Dauer "nicht bestaetigt" daneben, und
 * der Betreiber hatte keine Moeglichkeit, das aufzuloesen.
 *
 * Deshalb darf der Admin es setzen. Er sieht die Adresse, er kennt seine
 * Leute - das ist eine ehrlichere Bestaetigung als ein Klick auf einen Link,
 * den ohnehin jeder anklickt, der die Mail bekommt.
 */
export async function setzeBestaetigt(
  id: string, bestaetigt: boolean,
): Promise<Konto | null> {
  const liste = await lies();
  const i = liste.findIndex((k) => k.id === id);
  if (i < 0) return null;
  liste[i].bestaetigt = bestaetigt;
  await schreibe(liste);
  return liste[i];
}

/**
 * Ist dieser Anschluss gesperrt?
 *
 * Wahr, sobald er zu einem gesperrten Konto gehoert - siehe die Anmerkung
 * am Feld: das ist ein Zusatz, keine verlaessliche Mauer.
 */
export async function ipGesperrt(ip: string): Promise<boolean> {
  if (!ip) return false;
  return (await lies()).some((k) => k.gesperrt && (k.ips ?? []).includes(ip));
}

/** Den Anschluss mitschreiben - hoechstens fuenf, das Neueste zuerst. */
export async function merkeIp(id: string, ip: string) {
  if (!ip) return;
  const liste = await lies();
  const i = liste.findIndex((k) => k.id === id);
  if (i < 0) return;
  const bisher = (liste[i].ips ?? []).filter((x) => x !== ip);
  liste[i].ips = [ip, ...bisher].slice(0, 5);
  await schreibe(liste);
}

export async function merkeAnmeldung(id: string) {
  await aendern(id, { zuletzt: new Date().toISOString() });
}

/** Was von einem Konto nach aussen darf - niemals der Hash. */
/** Ist dieses Konto gerade VIP? */
export function istVip(k: Konto): boolean {
  if (k.vipBis === undefined) return false;
  // Null heisst "ohne Ende" - sonst zaehlt das Datum.
  return k.vipBis === 0 || k.vipBis > Date.now();
}

export function oeffentlich(k: Konto) {
  return {
    id: k.id, email: k.email, name: k.name,
    rolle: k.rolle ?? null,
    rechte: k.rechte ?? [],
    vip: istVip(k),
    vipBis: k.vipBis ?? null,
    /*
     * Ist das VIP neu fuer diesen Nutzer? Wahr, solange er es noch nicht
     * bestaetigt hat - die Oberflaeche zeigt daraufhin einmal die Nachricht.
     */
    vipNeu: istVip(k) && k.vipGesehen !== (k.vipBis ?? 0),
    gesperrt: Boolean(k.gesperrt),
    bestaetigt: k.bestaetigt,
    dienste: Object.keys(k.dienste ?? {}),
    // Nur ob eines gesetzt ist, nie der Wert. Die Oberflaeche muss wissen,
    // ob sie nach dem bisherigen Passwort fragen soll.
    hatPasswort: Boolean(k.passwort),
    epicId: k.epicId ?? null,
    spielerVerlauf: k.spielerVerlauf ?? [],
    bannerVorlagen: k.bannerVorlagen ?? [],
    socials: k.socials ?? {},
    bild: k.bild ?? null,
    angelegt: k.angelegt,
  };
}


/* ------------------------------------------------ Bestaetigen und Zuruecksetzen */

/**
 * Eine Adresse ueber den Schluessel aus der Mail bestaetigen.
 *
 * Der Schluessel verfaellt dabei: er hat genau eine Aufgabe, und ein
 * gebrauchter Schluessel, der weiter gilt, ist einer zu viel.
 */
export async function bestaetigeMitSchluessel(schluessel: string): Promise<Konto | null> {
  const k = schluessel.trim();
  if (!k) return null;
  const liste = await lies();
  const konto = liste.find((x) => x.bestaetigung === k);
  if (!konto) return null;
  konto.bestaetigt = true;
  delete konto.bestaetigung;
  await schreibe(liste);
  return konto;
}

/** Einen frischen Bestaetigungsschluessel - etwa, wenn die Mail nicht ankam. */
export async function neuerBestaetigungsschluessel(id: string): Promise<string | null> {
  const liste = await lies();
  const konto = liste.find((x) => x.id === id);
  if (!konto || konto.bestaetigt) return null;
  konto.bestaetigung = crypto.randomBytes(24).toString('hex');
  await schreibe(liste);
  return konto.bestaetigung;
}

/** Wie lange ein Weg zum Zuruecksetzen gilt. */
const RUECKSETZ_DAUER_MS = 60 * 60 * 1000;

/** Einen Weg zum Zuruecksetzen eroeffnen. */
export async function eroeffneRuecksetzung(id: string): Promise<string | null> {
  const liste = await lies();
  const konto = liste.find((x) => x.id === id);
  if (!konto) return null;
  const schluessel = crypto.randomBytes(24).toString('hex');
  konto.zuruecksetzung = { schluessel, bis: Date.now() + RUECKSETZ_DAUER_MS };
  await schreibe(liste);
  return schluessel;
}

/**
 * Das Passwort ueber einen Schluessel neu setzen.
 *
 * Wer den Schluessel aus der Mail hat, hat Zugriff auf das Postfach - damit
 * ist die Adresse nebenbei bestaetigt. Ein zweiter Weg dafuer waere
 * ueberfluessig.
 */
export async function setzePasswortMitSchluessel(
  schluessel: string, passwort: string,
): Promise<{ konto: Konto } | { fehler: string }> {
  const grund = passwortTaugt(passwort);
  if (grund) return { fehler: grund };

  const k = schluessel.trim();
  const liste = await lies();
  const konto = liste.find((x) => x.zuruecksetzung?.schluessel === k);
  if (!konto || !konto.zuruecksetzung) {
    return { fehler: 'Dieser Link gilt nicht mehr. Fordere einen neuen an.' };
  }
  if (konto.zuruecksetzung.bis < Date.now()) {
    delete konto.zuruecksetzung;
    await schreibe(liste);
    return { fehler: 'Dieser Link ist abgelaufen. Fordere einen neuen an.' };
  }

  konto.passwort = neuesPasswort(passwort);
  konto.bestaetigt = true;
  delete konto.bestaetigung;
  delete konto.zuruecksetzung;
  await schreibe(liste);
  return { konto };
}
