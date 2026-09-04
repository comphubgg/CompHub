import { ORGTAGS } from './orgtags';

// Namen vergleichbar machen.
//
// In Turnieren treten Spieler oft unter Namen an, die lateinisch aussehen,
// aber Buchstaben aus anderen Alphabeten enthalten - aus "tryona" wird
// "tryonа" mit kyrillischem a. Fuer das Auge identisch, fuer den Rechner
// zwei verschiedene Zeichenketten. Vor jedem Namensvergleich werden solche
// Zwillinge deshalb auf ihre lateinische Entsprechung zurueckgefuehrt.

const ZWILLINGE: Record<string, string> = {
  // Kyrillisch, Kleinbuchstaben
  'а': 'a', 'в': 'b', 'е': 'e', 'к': 'k', 'м': 'm', 'н': 'h', 'о': 'o',
  'р': 'p', 'с': 'c', 'т': 't', 'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j',
  'ѕ': 's', 'ԁ': 'd', 'ɡ': 'g', 'ѵ': 'v', 'ԛ': 'q', 'ղ': 'n',
  // Kyrillisch, Grossbuchstaben
  'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O',
  'Р': 'P', 'С': 'C', 'Т': 'T', 'У': 'Y', 'Х': 'X', 'І': 'I', 'Ј': 'J',
  'Ѕ': 'S', 'Ԛ': 'Q', 'Ԁ': 'D', 'Г': 'r', 'Ф': 'o',
  // Griechisch
  'α': 'a', 'β': 'b', 'ε': 'e', 'ι': 'i', 'κ': 'k', 'ο': 'o', 'ρ': 'p',
  'τ': 't', 'υ': 'u', 'χ': 'x', 'ν': 'v', 'Α': 'A', 'Β': 'B', 'Ε': 'E',
  'Ζ': 'Z', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M', 'Ν': 'N', 'Ο': 'O',
  'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X',
  // Sonstige haeufige Ersatzzeichen
  'ǃ': '!', 'ı': 'i', 'ł': 'l', 'ø': 'o', 'Ø': 'O', '０': '0',
};

/** Fremdalphabet-Zwillinge auf Latein zurueckfuehren, alles klein. */
export function vergleichbar(text: string): string {
  return [...text.normalize('NFKC')]
    .map((z) => ZWILLINGE[z] ?? z)
    .join('')
    .toLowerCase();
}

/** Ist das erste Wort eine Organisation und kein Namensbestandteil? */
function istOrgtag(wort: string): boolean {
  const rein = wort.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (rein.length < 2 || rein.length > 8) return false;
  if (ORGTAGS.has(rein)) return true;
  // Sicherheitsnetz fuer Orgs, die in den Daten nur einmal vorkommen:
  // durchgehend gross geschrieben und kurz.
  return /^[A-Z0-9]{2,6}[.!]?$/.test(wort);
}

/**
 * Der Kernname: Turniermarkierung, Orgtag und angehaengte Nummer fallen weg.
 * Aus "[EWC2026] AURA shxrk 19ǃ" wird so "shxrk".
 */
export function kernname(name: string): string {
  let teile = name.trim().split(/\s+/)
    // Turniermarkierung wie "[EWC2026]"
    .filter((t) => !/^\[.*\]$/.test(t))
    // Angehaengte Startnummer wie "7" oder "19ǃ"
    .filter((t) => !/^\d+[!ǃ.]?$/.test(t));
  if (!teile.length) return name.trim();

  // Nur ein bekannter Orgtag faellt weg. "GodL Chap" wird damit zu "Chap",
  // waehrend "FocusHD yhyh" und "Th0masHD yhyh" unterscheidbar bleiben.
  if (teile.length > 1 && istOrgtag(teile[0])) {
    teile = teile.slice(1);
  }
  return teile.join(' ');
}

/** Kernname in vergleichbarer Schreibweise - die Grundlage jeder Zuordnung. */
export function namensSchluessel(name: string): string {
  return vergleichbar(kernname(name)).replace(/[^a-z0-9]/g, '');
}

/** Ziffern, die im Namen als Buchstaben gemeint sind. */
const ZIFFERNSCHRIFT: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't',
};

/**
 * Ziffernschreibweise zurueckfalten.
 *
 * Viele Namen schreiben Buchstaben als Ziffern - "vic0", "t3eny", "916Gon".
 * Wer schnell tippt, schreibt "vico" und meint "vic0"; eine Texterkennung
 * liest ohnehin fast immer den Buchstaben. Werden beide Seiten gleich
 * gefaltet, passt es wieder zusammen, ohne dass der Vergleich unscharf wird:
 * es bleibt bei genauer Uebereinstimmung, nur eben auf gefalteter Schrift.
 */
export function gefaltet(schluessel: string) {
  return schluessel.replace(/[013457]/g, (z) => ZIFFERNSCHRIFT[z] ?? z);
}

/**
 * Angehaengte Zierzeichen abschneiden.
 *
 * Viele Turniernamen tragen hinten ein Zeichen mit, das nicht zum Namen
 * gehoert: "ZuCookies!", "Sky.", "Scroll 10". Ein Teil davon ist getarnt -
 * das haeufige "ǃ" ist in Unicode ein Buchstabe (ein Klicklaut) und
 * genau deshalb im Spiel erlaubt, wo "!" es nicht waere. Eine Pruefung auf
 * "ist Buchstabe" laesst es darum stehen; erst der Umweg ueber die
 * Zwillingstabelle entlarvt es.
 *
 * Abgeschnitten wird ausdruecklich nur am Ende. Ein Zeichen mitten im Namen
 * bleibt stehen, weil es dort gemeint ist, und ein Name, der nur aus solchen
 * Zeichen bestuende, bleibt unangetastet - sonst bliebe nichts uebrig.
 */
export function ohneZierrat(name: string): string {
  let ende = name.length;
  while (ende > 0) {
    if (istBuchstabe(name[ende - 1])) break;
    ende--;
  }
  const rein = name.slice(0, ende).trimEnd();
  return rein || name;
}

/**
 * Zaehlt dieses Zeichen als Buchstabe oder Ziffer?
 *
 * Die Pruefung geht ueber die Zwillingstabelle und danach ueber die
 * Zerlegung: aus "ś" wird "s" mit einem Akzent daneben, und das "s" zaehlt.
 * Das ist wichtiger, als es klingt - der Pole demuś schreibt sich mit diesem
 * Buchstaben, und vorher fiel er als vermeintlicher Zierrat weg, sodass auf
 * jeder Bestenliste "DEMU" stand. Ein Klicklaut wie "ǃ" zerlegt sich dagegen
 * in nichts Lateinisches und faellt weiterhin.
 */
function istBuchstabe(zeichen: string): boolean {
  const z = vergleichbar(zeichen);
  if (/^[a-z0-9]$/.test(z)) return true;
  // Akzente abtrennen: "ś" wird zu "s" plus Akzent, und das "s" zaehlt.
  const ohneAkzent = z.normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/^[a-z0-9]$/.test(ohneAkzent)) return true;
  // Und die lateinischen Buchstaben, die sich nicht zerlegen lassen.
  return EIGENE_BUCHSTABEN.has(z);
}

/**
 * Lateinische Buchstaben ohne Grundform.
 *
 * "ß" zerfaellt nicht in ein "s" mit Zeichen daneben, "ø" nicht in ein "o" -
 * sie sind eigene Buchstaben. Ohne diese Liste endete "Kaß" als "Ka". Bewusst
 * kurz gehalten: was hier nicht steht und sich nicht zerlegen laesst, ist mit
 * grosser Wahrscheinlichkeit wirklich Zierrat.
 */
const EIGENE_BUCHSTABEN = new Set(
  ['ß', 'ø', 'ł', 'đ', 'æ', 'œ', 'þ', 'ð', 'ı', 'ħ', 'ŋ', 'ĸ']);
