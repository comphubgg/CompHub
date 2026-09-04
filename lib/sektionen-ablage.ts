import { promises as fs } from 'fs';
import path from 'path';
import {
  HINWEISE, SEKTIONEN, STANDARD, type Staende,
} from '@/lib/sektionen';
import { DATEN_ORT } from './datenOrt';

/*
 * Wo der Zustand der Bereiche liegt - und nur das.
 *
 * Getrennt von lib/sektionen.ts, weil jene Datei auch im Browser gebraucht
 * wird: die Kopfzeile muss wissen, welche Bereiche es gibt, und die
 * Sperrseite, welcher Text zu welchem Anlass gehoert. Im Browser gibt es
 * kein "fs" - stuende der Dateizugriff dort, liesse sich die Seite nicht
 * einmal uebersetzen.
 */

const DATEI = path.join(DATEN_ORT, 'sektionen.json');

export async function liesStaende(): Promise<Staende> {
  try {
    const roh = JSON.parse(await fs.readFile(DATEI, 'utf8')) as Staende;
    const raus: Staende = {};
    for (const s of SEKTIONEN) {
      const e = roh[s.schluessel];
      raus[s.schluessel] = {
        zustand: e?.zustand === 'standby' || e?.zustand === 'offline'
          ? e.zustand : 'online',
        hinweis: HINWEISE.some((h) => h.schluessel === e?.hinweis)
          ? e!.hinweis : STANDARD.hinweis,
        eigenerTitel: e?.eigenerTitel || undefined,
        eigenerText: e?.eigenerText || undefined,
        geaendert: e?.geaendert,
      };
    }
    return raus;
  } catch {
    // Keine Datei heisst: alles laeuft. Das ist der richtige Ausfallwert -
    // ein Lesefehler darf nicht die ganze Seite sperren.
    const raus: Staende = {};
    for (const s of SEKTIONEN) raus[s.schluessel] = { ...STANDARD };
    return raus;
  }
}

export async function schreibeStaende(staende: Staende): Promise<void> {
  await fs.mkdir(path.dirname(DATEI), { recursive: true });
  await fs.writeFile(DATEI, JSON.stringify(staende, null, 2), 'utf8');
}
