import crypto from 'crypto';

/*
 * Zugangsschluessel erzeugen und pruefen.
 *
 * Bisher entstand ein Schluessel ausschliesslich zufaellig, und niemand
 * konnte etwas daran aendern. Der Betreiber wollte drei Dinge mehr: die
 * ersten Zeichen selbst bestimmen, einen Schluessel ganz von Hand setzen,
 * und einzelnen VIPs erlauben, ihren eigenen zu aendern.
 *
 * Damit alle drei Wege dieselben Regeln haben, stehen sie hier und nicht in
 * den Routen. Sonst waere in einer Woche der eine Weg strenger als der
 * andere - und der laxere entscheidet dann, was moeglich ist.
 */

/**
 * Der Zeichenvorrat.
 *
 * Ohne die Zeichen, die sich beim Abtippen verwechseln lassen - kein I, l,
 * 1, O oder 0. Ein Zugang, den jemand am Telefon durchgibt, soll nicht an
 * einem falsch gelesenen Zeichen scheitern.
 */
const VORRAT = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Wie lang ein Schluessel sein darf. */
export const MIN_LAENGE = 6;
export const MAX_LAENGE = 40;

/**
 * Ein zufaelliger Schluessel, wahlweise mit selbst gewaehltem Anfang.
 *
 * Ohne Vorgabe wie bisher: zwoelf Zeichen in drei Blocken. Mit Vorgabe
 * steht sie vorn, der Rest bleibt zufaellig - "AMAR-K7P2-QW9X" ist damit
 * moeglich, ohne dass der Schluessel dadurch ratbar wird: die acht
 * zufaelligen Zeichen sind immer noch mehr als eine Billion
 * Moeglichkeiten.
 */
export function neuerSchluessel(praefix = ''): string {
  const anfang = praefix.trim().toUpperCase();
  const zufall = (n: number) => {
    const roh = crypto.randomBytes(n);
    let s = '';
    for (let i = 0; i < n; i += 1) s += VORRAT[roh[i] % VORRAT.length];
    return s;
  };

  if (!anfang) {
    const z = zufall(12);
    return `${z.slice(0, 4)}-${z.slice(4, 8)}-${z.slice(8)}`;
  }
  const z = zufall(8);
  return `${anfang}-${z.slice(0, 4)}-${z.slice(4)}`;
}

/**
 * Taugt dieser Anfang als Vorgabe?
 *
 * Gibt die Beanstandung zurueck - oder null, wenn alles stimmt.
 */
export function praefixTaugt(praefix: string): string | null {
  const p = praefix.trim();
  if (!p) return null;
  if (p.length > 12) return 'Der Anfang darf höchstens zwölf Zeichen haben.';
  if (!/^[A-Za-z0-9-]+$/.test(p)) {
    return 'Im Anfang gehen nur Buchstaben, Ziffern und Bindestriche.';
  }
  return null;
}

/**
 * Taugt dieser Schluessel, wenn er von Hand gesetzt wird?
 *
 * Bewusst grosszuegiger als der erzeugte: wer ihn selbst eintippt, darf
 * auch Kleinbuchstaben nehmen. Verglichen wird beim Anmelden Zeichen fuer
 * Zeichen - deshalb steht das auch so in der Oberflaeche.
 *
 * Was nicht geht, geht aus gutem Grund nicht: Leerzeichen liessen sich beim
 * Kopieren nicht von einem Zeilenumbruch unterscheiden, und alles unter
 * sechs Zeichen ist kein Schluessel, sondern ein Wort.
 */
export function schluesselTaugt(schluessel: string): string | null {
  const s = schluessel.trim();
  if (s.length < MIN_LAENGE) {
    return `Ein Schlüssel braucht mindestens ${MIN_LAENGE} Zeichen.`;
  }
  if (s.length > MAX_LAENGE) {
    return `Ein Schlüssel darf höchstens ${MAX_LAENGE} Zeichen haben.`;
  }
  if (!/^[A-Za-z0-9._-]+$/.test(s)) {
    return 'Erlaubt sind Buchstaben, Ziffern, Punkt, Bindestrich und Unterstrich.';
  }
  return null;
}

/**
 * Hat schon jemand anders diesen Schluessel?
 *
 * Angemeldet wird mit Name und Schluessel zusammen, ein doppelter waere
 * also nicht sofort ein fremder Zugang. Trotzdem: wer den Schluessel eines
 * anderen kennt, braucht dann nur noch dessen Namen zu erraten - und die
 * stehen auf der Startseite. Deshalb muss jeder Schluessel einmalig sein.
 */
export function schonVergeben(
  schluessel: string,
  alle: Array<{ username: string; accessKey: string }>,
  ausser = '',
): boolean {
  const s = schluessel.trim();
  const nicht = ausser.trim().toLowerCase();
  return alle.some((u) => u.accessKey === s && u.username.toLowerCase() !== nicht);
}
