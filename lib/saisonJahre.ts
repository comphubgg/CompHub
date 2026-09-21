/*
 * Welche Saisons zu welchem Kalenderjahr zaehlen.
 *
 * Eigene Datei ohne Server-Abhaengigkeiten, weil auch die Oberflaeche sie
 * braucht (Zeitraum "2024" im Profil): lib/szeneStats zieht den
 * Antwortspeicher und damit "after" aus next/server herein, und das darf
 * nicht in den Browser.
 */

export const JAHR_SAISONS: Record<number, string[]> = {
  2019: ['S8', 'S9', 'S10', 'S11'],
  2020: ['S12', 'S13', 'S14'],
  2021: ['S15', 'S16', 'S17', 'S18'],
  2022: ['S19', 'S20', 'S21', 'S22'],
  2023: ['S23', 'S24', 'S25', 'S26', 'S27'],
  2024: ['S28', 'S29', 'S30', 'S31', 'S32'],
  2025: ['S33', 'S34', 'S35', 'S36', 'S37', 'S38'],
  2026: ['S39', 'S40', 'S41', 'S42'],
};

/** Das Jahr, zu dem eine Saison zaehlt - siehe JAHR_SAISONS. */
export function jahrVonSaison(saison: string): number {
  for (const [jahr, liste] of Object.entries(JAHR_SAISONS)) {
    if (liste.includes(saison)) return Number(jahr);
  }
  return 0;
}
