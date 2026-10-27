/*
 * Wie die Stimme im TikTok-Video Spielernamen spricht (Betreiber, 20.10.2026: "shxrk sagt man ja Shark und t3eny sagt man Teeny - die Namen sind bei der KI nicht gut";
 * 27.10.2026: "bei MUZ hast du M-U-Z gesagt, er heisst Maz - nicht nur fuer den Spieler anpassen, sondern fuer jeden Spieler").
 *
 * Die englische Stimme liest Namen, wie sie geschrieben stehen: "Shxrk" wird buchstabiert, "T3eny" als "T three eny", und ein Name in Grossbuchstaben ("MUZ", alle Namen stehen
 * auf den Karten so) wird Buchstabe fuer Buchstabe gesprochen. Hier steht, wie sie wirklich gesprochen werden. Auf dem Bildschirm bleibt der Name, wie er geschrieben wird -
 * nur der Ton und die gesprochene Zeile weichen ab; im Film setzt tagesvideo.py den Anzeigenamen in die Untertitel zurueck (Feld "aussprache" der Zeile).
 *
 * Drei Stufen, die letzte schlaegt die vorigen:
 *   1. Regeln fuer jeden Namen: Akzente weg; Ziffern mitten im Namen werden zu dem Buchstaben, den sie ersetzen (3 = e, 0 = o, 4 = a, 1 = i); ein Name in Grossbuchstaben mit mindestens
 *      einem Vokal (ab drei Buchstaben) wird als Wort gelesen, nicht buchstabiert (MUZ -> Muz, PETERBOT -> Peterbot). Ohne Vokal (BHT, NRG) bleibt es bei den Buchstaben.
 *   2. Dieses Woerterbuch fuer bekannte Faelle (Wert: EIN Wort, das die Stimme richtig liest; kein Bindestrich, kein Leerzeichen - sonst lassen sich die Untertitel nicht zurueckschreiben).
 *   3. Das Feld "aussprache" im Spielerprofil (spieler-profile.json): was der Betreiber dort eintraegt, gilt fuer genau diesen Spieler (setzeAussprachen beim Laden der Profile).
 * Schluessel: kleingeschrieben, ohne Leerzeichen und Sonderzeichen (so, wie der Name beim Bereinigen aussieht).
 */
const WOERTERBUCH: Record<string, string> = {
  shxrk: 'Shark',
  t3eny: 'Teeny',
  muz: 'Maz',
};

/** Vom Betreiber im Spielerprofil eingetragen - gilt vor dem Woerterbuch. */
const EIGENE: Record<string, string> = {};

const ZIFFER: Record<string, string> = { 3: 'e', 0: 'o', 4: 'a', 1: 'i' };

const schluesselVon = (n: string) => n.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Die Aussprachen aus den Profilen uebernehmen: { Anzeigename oder Konto-Name: so, wie er gesprochen wird }. */
export function setzeAussprachen(eintraege: Array<[string, string | undefined | null]>): void {
  for (const [name, gesprochen] of eintraege) {
    const k = schluesselVon(name ?? '');
    const g = String(gesprochen ?? '').trim();
    if (k && g) EIGENE[k] = g;
  }
}

function nachgeschlagen(schluessel: string): string | undefined {
  return EIGENE[schluessel] ?? WOERTERBUCH[schluessel];
}

/** Ein einzelnes Wort eines Namens fuer die Stimme. */
function lesbar(t: string): string {
  // Steht der Name in Grossbuchstaben (alle Namen stehen so auf den Karten), bleibt auch der Buchstabe, den eine Ziffer ersetzt, gross: TH0MAS -> THOMAS.
  const gross = !/[a-z]/.test(t);
  let r = t.replace(/(?<=[A-Za-z])[0134](?=[A-Za-z])/g, (z) => (gross ? ZIFFER[z].toUpperCase() : ZIFFER[z]));
  // Grossbuchstaben mit Vokal: als Wort lesen, sonst buchstabiert die Stimme ("M U Z"); eine Zahl am Ende bleibt (MASON1 -> Mason1).
  const m = /^([A-Z]{3,})([0-9]*)$/.exec(r);
  if (m && /[AEIOUY]/.test(m[1])) r = m[1][0] + m[1].slice(1).toLowerCase() + m[2];
  return r;
}

/** Fuer die Stimme: Akzente weg, nur Buchstaben und Ziffern - "hÿroxÿ" wird "hyroxy", ein Name nur aus Zeichen wird "a player"; bekannte Namen so, wie man sie spricht. */
export function sprechbar(n: string): string {
  const a = n.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  // Ziffern mitten im Namen zaehlen als Buchstaben (R3D = RED) - erst ein Name ohne zwei Buchstaben in Folge ist keiner.
  if (!/[A-Za-z]{2}/.test(a.replace(/(?<=[A-Za-z])[0134](?=[A-Za-z])/g, 'x'))) return 'a player';
  const ganz = nachgeschlagen(schluesselVon(a));
  if (ganz) return ganz;
  // Wort fuer Wort: "XSET MUZ X2" -> "Xset Maz X2"
  return a.split(' ').map((t) => nachgeschlagen(schluesselVon(t)) ?? lesbar(t)).join(' ');
}

/**
 * Wo die gesprochene Fassung eines Wortes vom Geschriebenen abweicht: [gesprochen, Anzeige in Grossbuchstaben] - fuer die Untertitel. Je Wort eines Namens ("XSET MUZ" -> Xset/XSET, Maz/MUZ),
 * damit auch Namen aus mehreren Woertern in den Untertiteln so stehen, wie sie auf der Karte stehen.
 */
export function aussprachePaare(namen: string[]): Array<[string, string]> {
  const raus: Array<[string, string]> = [];
  for (const n of namen) {
    for (const teil of n.split(/\s+/).filter(Boolean)) {
      const g = sprechbar(teil);
      if (/\s/.test(g) || g === 'a player') continue;
      const geschrieben = teil.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '');
      // Auch wenn nur die Schreibweise abweicht (Muz statt MUZ): die Untertitel sollen den Namen so zeigen, wie er auf der Karte steht.
      if (g !== geschrieben && !raus.some(([x]) => x === g)) raus.push([g, teil.toUpperCase()]);
    }
  }
  return raus;
}
