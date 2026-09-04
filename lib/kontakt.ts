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
