import fs from '@/lib/ablageFs';
import path from 'path';
import { DATEN_ORT } from '@/lib/datenOrt';

/**
 * Land je Epic-Konto - nur aus unseren gepflegten Profilen (spieler-profile.json, comphub-daten), nie geraten.
 * Schluessel klein geschrieben. Bei jedem Aufruf frisch gelesen (die Datei hat ein paar hundert Eintraege) - kein Speicher, der liegen bleibt.
 * Vorher in app/api/cup-spieler; jetzt auch fuer die Laenderuebersicht der Cup-Seite (app/api/turnier-leader, Solo-Cups).
 */
export async function landKarte(): Promise<Map<string, string>> {
  const karte = new Map<string, string>();
  try {
    const roh = JSON.parse(await fs.readFile(path.join(DATEN_ORT, 'spieler-profile.json'), 'utf8')) as Record<string, { id?: string; land?: string }>;
    for (const [schluessel, pr] of Object.entries(roh)) {
      const id = pr.id || (/^[0-9a-f]{32}$/i.test(schluessel) ? schluessel : '');
      if (id && pr.land) karte.set(id.toLowerCase(), pr.land);
    }
  } catch { /* noch keine Profile */ }
  return karte;
}
