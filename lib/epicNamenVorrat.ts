/*
 * epic-namen.json einmal je Prozess gelesen, nicht an jeder Stelle neu (17.11.2026).
 *
 * Gemessen: die Datei hat seit dem 15.11. rund 269.000 Eintraege (13-14 MB; im Archiv seit dem Zusammenfuehren am 17.11. 11:21 ebenso). Ein JSON.parse
 * kostet 250-330 ms und haelt 25 MB Heap - und bis hierher las sie jede Stelle selbst (liesJson): Spielerliste, FNCS-Liste, FNCS-Ereignisse, Globals-Teams,
 * Echte Namen, Szene-Statistik, Match-ID-Finder (je Abruf!), Discord-Suche ... jede mit eigener Frist von 1-10 Minuten und eigener Kopie im Speicher.
 * Jedes Parsen blockiert die Ereignisschleife; zusammen mit den Durchlaeufen ueber alle Namen danach (0,35-0,8 s je Stelle) stand die Seite.
 *
 * Hier: ein gemeinsamer, nur lesender Stand (globalThis - Next laedt Module je Routen-Bauteil getrennt). Neu geparst wird nur, wenn die Ablage einen anderen
 * Inhalt liefert (gleicher Buffer oder gleiche Bytes: kein Parsen), hoechstens einmal je PRUEF_MS geprueft.
 * Gelesen wird, was die Ablage fuer epic-namen.json liefert (zuerst die Kopie am Release, lib/ablageGithub ZUERST) - wie bisher bei liesJson.
 *
 * NICHT veraendern: das Objekt ist fuer alle Stellen dasselbe.
 */

const DATEI = 'epic-namen.json';
const PRUEF_MS = 2 * 60_000;

type Zustand = {
  wert: Readonly<Record<string, string>> | null;
  roh: Buffer | null;
  geprueft: number;
  /** Zaehlt jeden neuen Stand - fuer Stellen, die aus den Namen etwas Teures ableiten und es nur bei neuem Stand neu rechnen wollen. */
  fassung: number;
  laeuft: Promise<Readonly<Record<string, string>>> | null;
};
const Z: Zustand = ((globalThis as { __comphubEpicNamenVorrat?: Zustand }).__comphubEpicNamenVorrat ??= {
  wert: null, roh: null, geprueft: 0, fassung: 0, laeuft: null,
});

async function laden(): Promise<Readonly<Record<string, string>>> {
  // Erst hier hereingeholt, wie in lib/epicCups (die Datei wird auch ausserhalb der Seite geladen).
  const { speicher } = await import('@/lib/ablage');
  const roh = await speicher.lies(DATEI).catch(() => null);
  Z.geprueft = Date.now();
  if (!roh) return Z.wert ?? {};
  if (Z.wert && Z.roh && (roh === Z.roh || roh.equals(Z.roh))) { Z.roh = roh; return Z.wert; }
  try {
    const wert = JSON.parse(roh.toString('utf8')) as Record<string, string>;
    if (!wert || typeof wert !== 'object' || Array.isArray(wert)) return Z.wert ?? {};
    Z.wert = wert; Z.roh = roh; Z.fassung += 1;
    return wert;
  } catch {
    return Z.wert ?? {};
  }
}

/** Alle Epic-Namen (Konto-Id -> Name). Nur lesen. */
export async function epicNamen(): Promise<Readonly<Record<string, string>>> {
  if (Z.wert && Date.now() - Z.geprueft < PRUEF_MS) return Z.wert;
  if (Z.wert) {
    // Der alte Stand sofort, der neue im Hintergrund.
    Z.laeuft ??= laden().finally(() => { Z.laeuft = null; });
    return Z.wert;
  }
  Z.laeuft ??= laden().finally(() => { Z.laeuft = null; });
  return Z.laeuft;
}

/** Die Fassung des Stands (steigt mit jedem neuen Inhalt). */
export function epicNamenFassung(): number {
  return Z.fassung;
}
