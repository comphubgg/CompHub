import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DATEN_ORT } from './datenOrt';

/*
 * Meldungen aus dem Kontaktformular.
 *
 * Warum sie hier liegen und nicht per Mail verschickt werden: das Werkzeug
 * hat keinen Versanddienst, und einen einzurichten hiesse laufende Kosten
 * oder ein weiteres Konto bei einem Fremdanbieter. Beides wollte der
 * Betreiber nicht.
 *
 * Abgelegt ist ohnehin besser als verschickt: die Bilder bleiben beim
 * Vorgang, nichts landet im Spam, nichts geht beim Aufraeumen des Postfachs
 * verloren, und der Verlauf steht auch in einem Jahr noch da.
 */

const DATEI = path.join(DATEN_ORT, 'kontakt.json');
const BILDER = path.join(DATEN_ORT, 'kontakt-bilder');

/** Worum es geht. "anderes" traegt seinen Betreff selbst. */
export const THEMEN = ['support', 'report', 'hilfe', 'idee', 'anderes'] as const;
export type Thema = typeof THEMEN[number];

export interface Meldung {
  id: string;
  /** Wann sie einging. */
  zeit: number;
  thema: Thema;
  /** Nur bei "anderes" gefuellt - der selbst geschriebene Betreff. */
  eigenesThema: string;
  text: string;
  /** Dateinamen unter data/kontakt-bilder. */
  bilder: string[];
  /** Wer sie geschrieben hat - Konto-Id, Name und Adresse zum Antworten. */
  vonId: string;
  vonName: string;
  vonEmail: string;
  /** Erledigt heisst: der Betreiber hat sich darum gekuemmert. */
  erledigt: boolean;
  /** Eigene Notiz zur Meldung, nur fuer den Betreiber sichtbar. */
  notiz: string;
  /*
   * Der Verlauf.
   *
   * Aus der Meldung ist ein Gespraech geworden: der Betreiber wollte im
   * Werkzeug selbst antworten koennen, statt zu einer Mailadresse zu
   * wechseln - "dass es dann eine Art Live-Chat gibt". Die erste Nachricht
   * bleibt oben in text/bilder stehen, damit alte Meldungen unveraendert
   * lesbar bleiben; alles Weitere sammelt sich hier.
   */
  verlauf?: Nachricht[];
  /*
   * Bis wann jede Seite gelesen hat.
   *
   * Zwei Zeitstempel statt eines Zaehlers: ein Zaehler muesste bei jeder
   * neuen Nachricht auf beiden Seiten fortgeschrieben werden, und wer das
   * einmal vergisst, hat eine Zahl, die nie mehr stimmt. Ein Zeitpunkt
   * dagegen laesst sich jederzeit mit dem Verlauf vergleichen.
   */
  gelesenNutzer?: number;
  gelesenBetreiber?: number;
}

/** Eine einzelne Nachricht im Gespraech. */
export interface Nachricht {
  id: string;
  zeit: number;
  /** Wer geschrieben hat. */
  von: 'nutzer' | 'betreiber';
  /** Der Name, wie er beim Schreiben galt - Namen aendern sich. */
  name: string;
  text: string;
  /** Dateinamen unter data/kontakt-bilder. */
  bilder: string[];
}

async function lies(): Promise<Meldung[]> {
  try {
    const roh = await fs.readFile(DATEI, 'utf-8');
    const d = JSON.parse(roh || '[]');
    return Array.isArray(d) ? d : [];
  } catch { return []; }
}

async function schreibe(liste: Meldung[]): Promise<void> {
  await fs.mkdir(path.dirname(DATEI), { recursive: true });
  await fs.writeFile(DATEI, `${JSON.stringify(liste, null, 2)}\n`, 'utf-8');
}

/** Die neuesten zuerst - danach sieht man zuerst, was gerade hereinkam. */
export async function alle(): Promise<Meldung[]> {
  return (await lies()).sort((a, b) => b.zeit - a.zeit);
}

/**
 * Ein mitgeschicktes Bild ablegen.
 *
 * Erwartet wird eine data-Adresse, wie sie der Browser aus einer
 * eingefuegten oder gewaehlten Datei erzeugt. Alles, was nicht offenkundig
 * ein Bild ist, wird verworfen - hier soll niemand eine ausfuehrbare Datei
 * unterbringen.
 */
async function legeBildAb(datenAdresse: string, id: string, nr: number): Promise<string | null> {
  const treffer = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=]+)$/
    .exec(String(datenAdresse ?? '').trim());
  if (!treffer) return null;
  const endung = treffer[1] === 'jpeg' ? 'jpg' : treffer[1];
  const roh = Buffer.from(treffer[2], 'base64');
  // Fuenf Megabyte je Bild reichen fuer jeden Bildschirmausschnitt.
  if (!roh.length || roh.length > 5 * 1024 * 1024) return null;
  await fs.mkdir(BILDER, { recursive: true });
  const name = `${id}-${nr}.${endung}`;
  await fs.writeFile(path.join(BILDER, name), roh);
  return name;
}

export async function lege(eingang: {
  thema: string; eigenesThema: string; text: string; bilder: string[];
  vonId: string; vonName: string; vonEmail: string;
}): Promise<Meldung> {
  const id = crypto.randomUUID();

  const bilder: string[] = [];
  // Hoechstens vier Bilder - mehr braucht keine Meldung, und der Ordner
  // soll nicht unbemerkt volllaufen.
  for (const [i, b] of (eingang.bilder ?? []).slice(0, 4).entries()) {
    const name = await legeBildAb(b, id, i + 1);
    if (name) bilder.push(name);
  }

  const thema = (THEMEN as readonly string[]).includes(eingang.thema)
    ? eingang.thema as Thema : 'anderes';

  const m: Meldung = {
    id,
    zeit: Date.now(),
    thema,
    eigenesThema: thema === 'anderes'
      ? String(eingang.eigenesThema ?? '').trim().slice(0, 120) : '',
    text: String(eingang.text ?? '').trim().slice(0, 5000),
    bilder,
    vonId: eingang.vonId,
    vonName: eingang.vonName,
    vonEmail: eingang.vonEmail,
    erledigt: false,
    notiz: '',
  };

  const liste = await lies();
  liste.push(m);
  await schreibe(liste);
  return m;
}

/** Als erledigt markieren oder wieder aufmachen, und die Notiz pflegen. */
export async function aendere(
  id: string, felder: { erledigt?: boolean; notiz?: string },
): Promise<Meldung | null> {
  const liste = await lies();
  const i = liste.findIndex((m) => m.id === id);
  if (i < 0) return null;
  if (felder.erledigt !== undefined) liste[i].erledigt = Boolean(felder.erledigt);
  if (felder.notiz !== undefined) liste[i].notiz = String(felder.notiz).slice(0, 2000);
  await schreibe(liste);
  return liste[i];
}

/** Eine Meldung samt ihrer Bilder entfernen. */
export async function entferne(id: string): Promise<boolean> {
  const liste = await lies();
  const m = liste.find((x) => x.id === id);
  if (!m) return false;
  for (const b of m.bilder) {
    await fs.unlink(path.join(BILDER, b)).catch(() => {});
  }
  await schreibe(liste.filter((x) => x.id !== id));
  return true;
}

/** Wie viele noch offen sind - fuer die Zahl am Menuepunkt. */
export async function offen(): Promise<number> {
  return (await lies()).filter((m) => !m.erledigt).length;
}


/* ------------------------------------------------------------- Gespraeche */

/**
 * Den ganzen Verlauf einer Meldung, die erste Nachricht eingeschlossen.
 *
 * Die erste steht historisch in text/bilder und nicht im Verlauf. Statt die
 * alten Meldungen umzuschreiben - was bei einem Fehlschlag mitten im
 * Vorgang Daten kosten koennte - wird sie hier beim Lesen davorgesetzt.
 */
export function ganzerVerlauf(m: Meldung): Nachricht[] {
  const erste: Nachricht = {
    id: `${m.id}-0`,
    zeit: m.zeit,
    von: 'nutzer',
    name: m.vonName,
    text: m.text,
    bilder: m.bilder ?? [],
  };
  return [erste, ...(m.verlauf ?? [])];
}

/**
 * Eine Antwort anhaengen.
 *
 * Wer antwortet, hat den Stand naturgemaess gelesen - deshalb wird der
 * eigene Lesezeitpunkt gleich mitgesetzt. Sonst zeigte die eigene Antwort
 * einem selbst eine ungelesene Nachricht an.
 */
export async function antworte(eingang: {
  id: string; von: 'nutzer' | 'betreiber'; name: string;
  text: string; bilder?: string[];
}): Promise<Meldung | null> {
  const liste = await lies();
  const i = liste.findIndex((m) => m.id === eingang.id);
  if (i < 0) return null;

  const m = liste[i];
  const nr = (m.verlauf?.length ?? 0) + 1;
  const bilder: string[] = [];
  for (const [k, b] of (eingang.bilder ?? []).slice(0, 4).entries()) {
    const name = await legeBildAb(b, `${m.id}-a${nr}`, k + 1);
    if (name) bilder.push(name);
  }

  const nachricht: Nachricht = {
    id: crypto.randomUUID(),
    zeit: Date.now(),
    von: eingang.von,
    name: String(eingang.name ?? "").slice(0, 120),
    text: String(eingang.text ?? "").trim().slice(0, 5000),
    bilder,
  };

  m.verlauf = [...(m.verlauf ?? []), nachricht];
  if (eingang.von === 'betreiber') {
    m.gelesenBetreiber = nachricht.zeit;
    // Eine Antwort des Betreibers heisst: er kuemmert sich noch darum.
    m.erledigt = false;
  } else {
    m.gelesenNutzer = nachricht.zeit;
    m.erledigt = false;
  }

  await schreibe(liste);
  return m;
}

/** Gelesen bis jetzt. */
export async function markiereGelesen(id: string, wer: 'nutzer' | 'betreiber') {
  const liste = await lies();
  const m = liste.find((x) => x.id === id);
  if (!m) return false;
  if (wer === 'nutzer') m.gelesenNutzer = Date.now();
  else m.gelesenBetreiber = Date.now();
  await schreibe(liste);
  return true;
}

/** Die Gespraeche eines Kontos, neueste Aktivitaet zuerst. */
export async function meineVon(vonId: string): Promise<Meldung[]> {
  const liste = (await lies()).filter((m) => m.vonId === vonId);
  return liste.sort((a, b) => letzteZeit(b) - letzteZeit(a));
}

/** Wann in diesem Gespraech zuletzt etwas geschah. */
export function letzteZeit(m: Meldung): number {
  const v = m.verlauf ?? [];
  return v.length ? v[v.length - 1].zeit : m.zeit;
}

/**
 * Wie viele Nachrichten fuer eine Seite noch ungelesen sind.
 *
 * Gezaehlt wird, was die jeweils andere Seite geschrieben hat, nachdem hier
 * zuletzt gelesen wurde. Die erste Nachricht zaehlt fuer den Betreiber mit -
 * sie ist ja die Meldung selbst.
 */
export function ungelesen(m: Meldung, fuer: 'nutzer' | 'betreiber'): number {
  const seit = (fuer === 'nutzer' ? m.gelesenNutzer : m.gelesenBetreiber) ?? 0;
  const andere = fuer === 'nutzer' ? 'betreiber' : 'nutzer';
  return ganzerVerlauf(m).filter((n) => n.von === andere && n.zeit > seit).length;
}

/** Ungelesenes ueber alle Gespraeche eines Kontos. */
export async function ungelesenFuerNutzer(vonId: string): Promise<number> {
  return (await meineVon(vonId)).reduce((n, m) => n + ungelesen(m, 'nutzer'), 0);
}

/** Ungelesenes ueber alle Gespraeche - fuer die Zahl am Chatsymbol. */
export async function ungelesenFuerBetreiber(): Promise<number> {
  return (await lies()).reduce((n, m) => n + ungelesen(m, 'betreiber'), 0);
}
