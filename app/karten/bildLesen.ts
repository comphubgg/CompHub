/*
 * Spieler aus einem fremden Kartenbild lesen.
 *
 * Der Betreiber legt sich den Screenshot einer fremden Karte als Vorlage
 * unter seine eigene - das gab es schon. Was fehlte: die Namen daraus zu
 * uebernehmen. Fuenfzig Duos abzutippen dauert laenger, als die Karte
 * ueberhaupt aktuell bleibt.
 *
 * Sein Auftrag dazu, woertlich: "dann darf es nur die Spieler uebernehmen,
 * nicht mal die Formen, nicht der Hintergrund, nur die Spieler. Und wo sie
 * eigentlich sind, so plus minus."
 *
 * Genau so arbeitet diese Datei. Sie liefert Woerter mit Fundstelle und
 * sonst nichts - keine Formen, keine Farben, kein Bildausschnitt. Was davon
 * ein Spieler ist, entscheidet danach der Abgleich mit dem Archiv
 * (app/api/karten/namen), und was auf die Karte kommt, entscheidet er
 * selbst in der Vorschau.
 *
 * Die Texterkennung laeuft im Browser (tesseract.js). Nichts wird
 * hochgeladen, nichts kostet etwas, und es braucht keinen Schluessel bei
 * irgendeinem Dienst. Das Sprachmodell holt sich die Bibliothek beim ersten
 * Mal aus dem Netz und legt es danach im Browser ab.
 */

/** Ein gelesenes Wort samt Fundstelle in Kartenprozent. */
export interface RohWort {
  /** Der Text so, wie die Erkennung ihn gelesen hat. */
  text: string;
  /** Wie sicher sich die Erkennung war, 0 bis 100. */
  guete: number;
  /** Fundstelle auf der Karte, in Prozent der Kartenkante. */
  x: number;
  y: number;
  /** Kam der Text aus einer ganzen Zeile oder aus einem einzelnen Wort? */
  ganzeZeile: boolean;
}

/**
 * Bildpunkt zu Kartenprozent.
 *
 * Die Vorlage liegt mit `object-cover` auf der quadratischen Karte: sie wird
 * so vergroessert, dass sie das Quadrat vollstaendig deckt, und an den
 * langen Seiten mittig beschnitten. Wer das hier nicht nachrechnet, legt bei
 * einem 16:9-Screenshot jeden Namen zu weit aussen ab - und zwar umso
 * weiter, je naeher am Rand er steht.
 *
 * Was aus dem Quadrat herausfaellt, ist auf der Karte auch nicht zu sehen.
 * Solche Funde bekommen Werte ausserhalb von 0 bis 100 und werden vom
 * Aufrufer verworfen, statt an den Rand geschoben zu werden.
 */
export function aufKarte(px: number, py: number, breite: number, hoehe: number) {
  const seite = breite / hoehe;
  return seite > 1
    ? { x: (px / hoehe) * 100 - (seite - 1) * 50, y: (py / hoehe) * 100 }
    : { x: (px / breite) * 100, y: (py / breite) * 100 - (1 / seite - 1) * 50 };
}

/** Ein Bild aus einer Datenadresse laden. */
function ladeBild(quelle: string): Promise<HTMLImageElement> {
  return new Promise((fertig, schiefgegangen) => {
    const b = new Image();
    b.onload = () => fertig(b);
    b.onerror = () => schiefgegangen(new Error('bild'));
    b.src = quelle;
  });
}

/**
 * Das Bild fuer die Erkennung aufbereiten.
 *
 * Zwei Handgriffe, beide notwendig:
 *
 *   - Vergroessern. Namen auf einer Turnierkarte sind oft nur zehn Pixel
 *     hoch; darunter liest die Erkennung nichts Brauchbares. Auf etwa die
 *     doppelte Groesse gebracht, wird aus Rauschen lesbarer Text.
 *   - Grau und haerter. Farbige Schrift auf farbigem Grund ist der
 *     Normalfall auf diesen Karten. Grau macht daraus einen Helligkeits-
 *     unterschied, der Kontrast zieht ihn auseinander.
 *
 * Mehr nicht. Ein Schwellwert, der alles auf Schwarz und Weiss zwingt,
 * loescht auf diesen Bildern regelmaessig die halbe Schrift mit weg.
 */
function aufbereiten(bild: HTMLImageElement): HTMLCanvasElement {
  const laengste = Math.max(bild.naturalWidth, bild.naturalHeight) || 1;
  const faktor = Math.min(3, Math.max(1, 2200 / laengste));
  const breite = Math.round(bild.naturalWidth * faktor);
  const hoehe = Math.round(bild.naturalHeight * faktor);

  const leinwand = document.createElement('canvas');
  leinwand.width = breite;
  leinwand.height = hoehe;
  const stift = leinwand.getContext('2d', { willReadFrequently: true });
  if (!stift) return leinwand;
  stift.imageSmoothingEnabled = true;
  stift.imageSmoothingQuality = 'high';
  stift.drawImage(bild, 0, 0, breite, hoehe);

  const feld = stift.getImageData(0, 0, breite, hoehe);
  const p = feld.data;
  const kontrast = 1.6;
  for (let i = 0; i < p.length; i += 4) {
    const grau = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
    const hart = Math.max(0, Math.min(255, (grau - 128) * kontrast + 128));
    p[i] = hart; p[i + 1] = hart; p[i + 2] = hart;
  }
  stift.putImageData(feld, 0, 0);
  return leinwand;
}

/** Taugt der Rohtext ueberhaupt als Name? */
function taugt(text: string): boolean {
  const rein = text.replace(/[^\p{L}\p{N}]/gu, '');
  // Drei Zeichen ist die Untergrenze; darunter passt jedes Wort auf zu
  // viele Namen. Und ohne einen einzigen Buchstaben ist es eine Platzzahl.
  return rein.length >= 3 && /\p{L}/u.test(text);
}

interface Kaestchen { x0: number; y0: number; x1: number; y1: number }
interface ErkanntesWort { text: string; confidence: number; bbox: Kaestchen }
interface ErkannteZeile { text: string; confidence: number; bbox: Kaestchen; words: ErkanntesWort[] }
interface ErkannterAbsatz { lines: ErkannteZeile[] }
interface ErkannterBlock { paragraphs: ErkannterAbsatz[] }

/**
 * Ein Bild lesen und die gefundenen Woerter mit Fundstelle zurueckgeben.
 *
 * Zurueck kommen sowohl ganze Zeilen als auch einzelne Woerter. Das ist
 * Absicht: "GEN RITUALX 9" ist als Zeile aufzuloesen, weil der Orgtag und
 * die Startnummer beim Abgleich ohnehin wegfallen - als drei Einzelwoerter
 * dagegen kaum. Umgekehrt stehen auf einer Karte zwei Namen eines Duos oft
 * in einer Zeile nebeneinander, und dann braucht es die Einzelwoerter. Der
 * Abgleich entscheidet hinterher, was davon ein Spieler ist.
 */
export async function leseWoerter(
  quelle: string,
  melde: (anteil: number, was: string) => void,
): Promise<RohWort[]> {
  const bild = await ladeBild(quelle);
  const leinwand = aufbereiten(bild);

  const { createWorker, PSM } = await import('tesseract.js');

  const arbeiter = await createWorker('eng', 1, {
    // Das kleine Sprachmodell: zwei Megabyte statt elf. Die Namen auf
    // diesen Karten sind ohnehin keine Prosa, und was die Erkennung
    // verschreibt, faengt der unscharfe Abgleich wieder ein.
    langPath: 'https://tessdata.projectnaptha.com/4.0.0_fast',
    gzip: true,
    logger: (m: { status?: string; progress?: number }) => {
      if (m.status === 'recognizing text') melde(m.progress ?? 0, 'lesen');
      else if (m.status?.startsWith('loading') || m.status?.startsWith('initial')) {
        melde(0, 'laden');
      }
    },
  });

  try {
    await arbeiter.setParameters({
      // Verstreuter Text ohne Absaetze - genau das ist eine Karte.
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    });

    const { data } = await arbeiter.recognize(leinwand, {}, { blocks: true });
    const bloecke = (data.blocks ?? []) as unknown as ErkannterBlock[];

    const funde: RohWort[] = [];
    const merke = (text: string, guete: number, k: Kaestchen, ganzeZeile: boolean) => {
      const sauber = text.trim();
      if (!taugt(sauber)) return;
      const ort = aufKarte(
        (k.x0 + k.x1) / 2, (k.y0 + k.y1) / 2, leinwand.width, leinwand.height);
      // Was ausserhalb der Karte liegt, sieht er auch nicht - der Rand des
      // Screenshots wird beim Einpassen abgeschnitten.
      if (ort.x < 0 || ort.x > 100 || ort.y < 0 || ort.y > 100) return;
      funde.push({ text: sauber, guete, x: ort.x, y: ort.y, ganzeZeile });
    };

    for (const block of bloecke) {
      for (const absatz of block.paragraphs ?? []) {
        for (const zeile of absatz.lines ?? []) {
          const woerter = (zeile.words ?? []).filter((w) => w.confidence >= 40);
          if (woerter.length > 1) merke(zeile.text, zeile.confidence, zeile.bbox, true);
          for (const w of woerter) merke(w.text, w.confidence, w.bbox, false);
        }
      }
    }
    return funde;
  } finally {
    await arbeiter.terminate();
  }
}
