import { alleKonten } from './konten';
import { alleZugaenge, rechteVon } from './vipZugaenge';

/*
 * Wer im Chat ansprechbar ist.
 *
 * Es gibt zwei Verzeichnisse: die CompHub-Konten und die alten
 * Zugangsschluessel. Wer nur das erste durchsucht, findet die Haelfte nicht -
 * und genau das ging schief: das Vorschlagsfenster ueber dem Schreibfeld
 * kannte beide, der Befehl "/add" darunter nur die Konten. Vorgeschlagen
 * wurde also jemand, den derselbe Chat einen Wimpernschlag spaeter nicht mehr
 * kannte.
 *
 * Deshalb steht die Liste ab jetzt an einer Stelle, und beide holen sie
 * hier. Was zusammengehoert, laeuft sonst binnen einer Woche auseinander.
 */

export interface ChatNutzer {
  /** Die Kennung, unter der die Person mitliest - Konto-Id oder "vip:<name>". */
  id: string;
  name: string;
  rolle: string | null;
}

/**
 * Alle ansprechbaren Leute, nach Namen sortiert.
 *
 * Abgeschaltete Zugaenge bleiben draussen: wer sich nicht anmelden kann, kann
 * auch nichts lesen, und ihn in eine Gruppe zu holen waere ein stiller
 * Fehlschlag.
 */
export async function alleChatNutzer(): Promise<ChatNutzer[]> {
  const ausKonten: ChatNutzer[] = (await alleKonten()).map((k) => ({
    id: k.id,
    name: k.name || k.id,
    rolle: k.rolle ?? null,
  }));

  const ausVips: ChatNutzer[] = (await alleZugaenge())
    .filter((z) => z.status !== 'disabled')
    .map((z) => ({
      id: `vip:${z.username}`,
      name: z.username,
      rolle: rechteVon(z).rolle ?? 'vip',
    }));

  // Wer beides hat, soll nicht doppelt dastehen - der Name entscheidet.
  const gesehen = new Set(ausKonten.map((k) => k.name.toLowerCase()));
  return [...ausKonten, ...ausVips.filter((v) => !gesehen.has(v.name.toLowerCase()))]
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Ein getippter Name, wie er zum Vergleich taugt.
 *
 * Das fuehrende @ faellt weg. Die Vervollstaendigung setzt "@Juanito Fn" ein,
 * und danach wurde nach einem Konto namens "@juanito" gesucht - das es
 * naturgemaess nicht gibt. Ebenso fallen Komma und Doppelpunkt am Ende weg,
 * weil "@name," in einem Satz voellig normal aussieht.
 */
export function nameNormal(text: string): string {
  return text.trim().replace(/^@+/, '').replace(/[,;:]+$/, '').trim().toLowerCase();
}

export interface Aufloesung {
  gefunden: ChatNutzer[];
  meldungen: string[];
}

/**
 * Getippte Namen zu Leuten aufloesen.
 *
 * Der schwierige Teil sind Namen mit Leerzeichen. Frueher wurde stur an jedem
 * Leerzeichen getrennt, und "Juanito Fn" zerfiel in "Juanito" und "Fn" - das
 * eine fand nichts, das andere passte auf mehrere. Vorgeschlagen hatte das
 * Fenster daneben aber genau diesen einen Namen.
 *
 * Deshalb wird von links gelesen und immer der laengste Name genommen, der
 * genau passt: erst "Juanito Fn Gulli" versuchen, dann "Juanito Fn", dann
 * "Juanito". Erst wenn gar nichts genau passt, wird das einzelne Wort als
 * Teilstueck gesucht - so wie bisher.
 *
 * Komma trennt hart. Wer "/add a, b" schreibt, meint zwei Leute, auch wenn
 * es zufaellig jemanden namens "a b" gaebe.
 */
export async function loeseNamenAuf(argument: string): Promise<Aufloesung> {
  const leute = await alleChatNutzer();
  const gefunden: ChatNutzer[] = [];
  const meldungen: string[] = [];
  const schon = new Set<string>();

  const nimm = (n: ChatNutzer) => {
    if (schon.has(n.id)) return;
    schon.add(n.id);
    gefunden.push(n);
  };

  for (const abschnitt of argument.split(',')) {
    const woerter = abschnitt.split(/\s+/).map((w) => w.trim()).filter(Boolean);

    let i = 0;
    while (i < woerter.length) {
      let getroffen = false;

      // Von der laengsten Wortfolge zur kuerzesten - der genaue Treffer gewinnt.
      for (let j = woerter.length; j > i; j--) {
        const kandidat = nameNormal(woerter.slice(i, j).join(' '));
        if (!kandidat) continue;
        const genau = leute.filter((n) => n.name.toLowerCase() === kandidat);
        if (genau.length === 1) { nimm(genau[0]); i = j; getroffen = true; break; }
        if (genau.length > 1) {
          // Zwei Leute mit demselben Namen: raten waere hier besonders
          // teuer, der Falsche saehe den ganzen bisherigen Verlauf.
          meldungen.push(`"${woerter.slice(i, j).join(' ')}" exists more than once.`);
          i = j; getroffen = true; break;
        }
      }
      if (getroffen) continue;

      /*
       * Nichts passt genau - dann das einzelne Wort als Teilstueck suchen.
       * Das ist der bequeme Weg fuer "/add gulli", und er bleibt erhalten.
       */
      const wort = woerter[i];
      const k = nameNormal(wort);
      const treffer = k ? leute.filter((n) => n.name.toLowerCase().includes(k)) : [];

      if (!treffer.length) {
        meldungen.push(`No account matches "${wort}".`);
      } else if (treffer.length > 1) {
        meldungen.push(`"${wort}" matches several: `
          + `${treffer.slice(0, 6).map((n) => n.name).join(', ')}`);
      } else {
        nimm(treffer[0]);
      }
      i += 1;
    }
  }

  return { gefunden, meldungen };
}
