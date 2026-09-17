/*
 * Die Ablage des Archivs - siehe lib/galerieTypen fuer die Formen. Hier
 * nur, was den Server braucht: lesen, schreiben, Bilder ablegen.
 */
import { liesJson, schreibJson, speicher } from '@/lib/ablage';
import type { Galerie } from '@/lib/galerieTypen';

export * from '@/lib/galerieTypen';

const DATEI = 'galerie.json';
export const BILDER_ORDNER = 'galerie';

export async function liesGalerie(): Promise<Galerie> {
  const roh = await liesJson<Partial<Galerie> | null>(DATEI, null);
  return {
    events: Array.isArray(roh?.events) ? roh!.events : [],
    eintraege: Array.isArray(roh?.eintraege) ? roh!.eintraege : [],
  };
}

export async function schreibGalerie(g: Galerie): Promise<void> {
  await schreibJson(DATEI, g);
}

export async function liesBild(datei: string): Promise<Buffer | null> {
  if (!/^[a-z0-9-]+\.(jpg|jpeg|png|webp|gif)$/i.test(datei)) return null;
  return speicher.lies(`${BILDER_ORDNER}/${datei}`);
}

export async function schreibBild(datei: string, daten: Buffer): Promise<void> {
  await speicher.schreib(`${BILDER_ORDNER}/${datei}`, daten);
}

export async function loescheBild(datei: string): Promise<void> {
  try { await speicher.loesche(`${BILDER_ORDNER}/${datei}`); } catch { /* schon weg */ }
}
