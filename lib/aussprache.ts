/*
 * Wie die Stimme im TikTok-Video Spielernamen spricht (Betreiber, 20.10.2026: "shxrk sagt man ja Shark und t3eny sagt man Teeny - die Namen sind bei der KI nicht gut").
 *
 * Die englische Stimme liest Namen, wie sie geschrieben stehen: "Shxrk" wird buchstabiert, "T3eny" als "T three eny". Hier steht, wie sie wirklich gesprochen werden.
 * Auf dem Bildschirm bleibt der Name, wie er geschrieben wird - nur der Ton und die gesprochene Zeile weichen ab; im Film setzt tagesvideo.py den Anzeigenamen
 * in die Untertitel zurueck (Feld "aussprache" der Zeile).
 *
 * Neue Eintraege: kleingeschrieben, ohne Leerzeichen und Sonderzeichen (so, wie der Name beim Bereinigen aussieht), als Wert EIN Wort, das die Stimme richtig
 * liest (kein Bindestrich, kein Leerzeichen - sonst lassen sich die Untertitel nicht zurueckschreiben). Ohne Eintrag gilt: Ziffern mitten im Namen werden zu
 * dem Buchstaben, den sie ersetzen (3 = e, 0 = o, 4 = a).
 */
const WOERTERBUCH: Record<string, string> = {
  shxrk: 'Shark',
  t3eny: 'Teeny',
};

const ZIFFER: Record<string, string> = { 3: 'e', 0: 'o', 4: 'a' };

/** Fuer die Stimme: Akzente weg, nur Buchstaben und Ziffern - "hÿroxÿ" wird "hyroxy", ein Name nur aus Zeichen wird "a player"; bekannte Namen so, wie man sie spricht. */
export function sprechbar(n: string): string {
  const a = n.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!/[A-Za-z]{2}/.test(a)) return 'a player';
  const bekannt = WOERTERBUCH[a.toLowerCase().replace(/\s+/g, '')];
  if (bekannt) return bekannt;
  return a.replace(/(?<=[A-Za-z])[034](?=[A-Za-z])/g, (z) => ZIFFER[z]);
}

/** Wo die gesprochene Fassung eines Namens ein Wort ist und vom Geschriebenen abweicht: [gesprochen, Anzeige in Grossbuchstaben] - fuer die Untertitel. */
export function aussprachePaare(namen: string[]): Array<[string, string]> {
  const raus: Array<[string, string]> = [];
  for (const n of namen) {
    const g = sprechbar(n);
    if (/\s/.test(g) || g === 'a player') continue;
    const geschrieben = n.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '');
    if (g.toLowerCase() !== geschrieben.toLowerCase()) raus.push([g, n.toUpperCase()]);
  }
  return raus;
}
