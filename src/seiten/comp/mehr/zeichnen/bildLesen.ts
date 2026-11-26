/*
 * Texterkennung fuer eingefuegte Vorlagen (wie app/maps/bildLesen.ts auf main): das Bild wird vergroessert und in hartes Grau gebracht,
 * Tesseract liest im Modus "verstreuter Text", jede Zeile und jedes Wort mit Fundstelle in Kartenprozent. Der Hub hat tesseract.js nicht als
 * Paket - es kommt beim ersten Gebrauch von jsdelivr (fest auf 5.1.1), die Sprachdaten wie auf der Seite von tessdata.projectnaptha.com.
 */

export interface RohWort { text: string; guete: number; x: number; y: number; ganzeZeile: boolean }

/** Pixel im Bild -> Prozent der (quadratischen) Karte; ein Bild mit Rand wird mittig angenommen. */
export function aufKarte(px: number, py: number, breite: number, hoehe: number) {
  const seite = breite / hoehe;
  return seite > 1
    ? { x: (px / hoehe) * 100 - (seite - 1) * 50, y: (py / hoehe) * 100 }
    : { x: (px / breite) * 100, y: (py / breite) * 100 - (1 / seite - 1) * 50 };
}

function ladeBild(quelle: string): Promise<HTMLImageElement> {
  return new Promise((fertig, schief) => { const b = new Image(); b.onload = () => fertig(b); b.onerror = () => schief(new Error('bild')); b.src = quelle; });
}

function aufbereiten(bild: HTMLImageElement): HTMLCanvasElement {
  const laengste = Math.max(bild.naturalWidth, bild.naturalHeight) || 1;
  const faktor = Math.min(3, Math.max(1, 2200 / laengste));
  const c = document.createElement('canvas');
  c.width = Math.round(bild.naturalWidth * faktor); c.height = Math.round(bild.naturalHeight * faktor);
  const g = c.getContext('2d', { willReadFrequently: true }); if (!g) return c;
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(bild, 0, 0, c.width, c.height);
  const feld = g.getImageData(0, 0, c.width, c.height); const p = feld.data;
  for (let i = 0; i < p.length; i += 4) {
    const grau = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
    const hart = Math.max(0, Math.min(255, (grau - 128) * 1.6 + 128));
    p[i] = hart; p[i + 1] = hart; p[i + 2] = hart;
  }
  g.putImageData(feld, 0, 0);
  return c;
}

const taugt = (t: string) => t.replace(/[^\p{L}\p{N}]/gu, '').length >= 3 && /\p{L}/u.test(t);

interface Kasten { x0: number; y0: number; x1: number; y1: number }
interface Wort { text: string; confidence: number; bbox: Kasten }
interface Zeile { text: string; confidence: number; bbox: Kasten; words: Wort[] }
interface TesseractModul {
  createWorker: (lang: string, oem: number, o: Record<string, unknown>) => Promise<{
    setParameters: (p: Record<string, unknown>) => Promise<unknown>;
    recognize: (b: HTMLCanvasElement, o?: unknown, a?: unknown) => Promise<{ data: { blocks?: Array<{ paragraphs?: Array<{ lines?: Zeile[] }> }> } }>;
    terminate: () => Promise<unknown>;
  }>;
  PSM?: { SPARSE_TEXT: string };
}

export async function leseWoerter(quelle: string, melde: (anteil: number, was: 'laden' | 'lesen') => void): Promise<RohWort[]> {
  const leinwand = aufbereiten(await ladeBild(quelle));
  const adresse = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.esm.min.js';
  const roh = await import(/* @vite-ignore */ adresse) as { default?: TesseractModul } & TesseractModul;
  const T = (roh.default ?? roh) as TesseractModul;
  const arbeiter = await T.createWorker('eng', 1, {
    langPath: 'https://tessdata.projectnaptha.com/4.0.0_fast', gzip: true,
    logger: (m: { status?: string; progress?: number }) => {
      if (m.status === 'recognizing text') melde(m.progress ?? 0, 'lesen');
      else if (m.status?.startsWith('loading') || m.status?.startsWith('initial')) melde(0, 'laden');
    },
  });
  try {
    await arbeiter.setParameters({ tessedit_pageseg_mode: T.PSM?.SPARSE_TEXT ?? '11' });
    const { data } = await arbeiter.recognize(leinwand, {}, { blocks: true });
    const funde: RohWort[] = [];
    const merke = (text: string, guete: number, k: Kasten, ganzeZeile: boolean) => {
      const sauber = text.trim(); if (!taugt(sauber)) return;
      const ort = aufKarte((k.x0 + k.x1) / 2, (k.y0 + k.y1) / 2, leinwand.width, leinwand.height);
      if (ort.x < 0 || ort.x > 100 || ort.y < 0 || ort.y > 100) return;
      funde.push({ text: sauber, guete, x: ort.x, y: ort.y, ganzeZeile });
    };
    for (const b of data.blocks ?? []) for (const a of b.paragraphs ?? []) for (const z of a.lines ?? []) {
      const woerter = (z.words ?? []).filter((w) => w.confidence >= 40);
      if (woerter.length > 1) merke(z.text, z.confidence, z.bbox, true);
      for (const w of woerter) merke(w.text, w.confidence, w.bbox, false);
    }
    return funde;
  } finally { await arbeiter.terminate(); }
}
