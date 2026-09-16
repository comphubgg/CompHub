import fs from '@/lib/ablageFs';
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

/*
 * Zehn Sekunden Vorrat je Vorgang, und nie laenger als zweieinhalb Sekunden
 * warten.
 *
 * Das Layout liest die Zustaende bei jedem Seitenaufruf zweimal (Sperre und
 * Lage). Als Supabase nicht antwortete, waren das zweimal acht Sekunden
 * Frist, bevor irgendeine Seite kam - der Betreiber lud "zehn Minuten".
 * Die Datei aendert sich nur, wenn er im Admin-Bereich einen Bereich
 * umschaltet; zehn Sekunden Verzug sind derselbe Takt, in dem die
 * Kopfzeile ohnehin nachfragt. Kommt die Antwort nicht rechtzeitig, gilt
 * der letzte bekannte Stand, und ohne einen solchen: alles online.
 */
let vorrat: { stand: Staende; bis: number } | null = null;
/** Nach einer ausgebliebenen Antwort: so lange nicht noch einmal warten. */
let pause = 0;
const VORRAT_MS = 10_000;
const PAUSE_MS = 5_000;
const FRIST_MS = 1_500;

export async function liesStaende(): Promise<Staende> {
  const jetzt = Date.now();
  if (vorrat && vorrat.bis > jetzt) return vorrat.stand;
  const ersatz = (): Staende => {
    if (vorrat) return vorrat.stand;
    const raus: Staende = {};
    for (const s of SEKTIONEN) raus[s.schluessel] = { ...STANDARD };
    return raus;
  };
  // Die zweite Frage kurz nach einer ausgebliebenen Antwort wartet nicht
  // noch einmal - das Layout fragt je Aufruf zweimal.
  if (pause > jetzt) return ersatz();
  let zeiger: ReturnType<typeof setTimeout> | null = null;
  const uhr = new Promise<Staende | null>((res) => { zeiger = setTimeout(() => res(null), FRIST_MS); });
  try {
    const stand = await Promise.race([liesStaendeRoh(), uhr]);
    if (stand) { vorrat = { stand, bis: Date.now() + VORRAT_MS }; return stand; }
    pause = Date.now() + PAUSE_MS;
    return ersatz();
  } finally {
    if (zeiger) clearTimeout(zeiger);
  }
}

async function liesStaendeRoh(): Promise<Staende> {
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
  vorrat = null;
  await fs.mkdir(path.dirname(DATEI), { recursive: true });
  await fs.writeFile(DATEI, JSON.stringify(staende, null, 2), 'utf8');
}
