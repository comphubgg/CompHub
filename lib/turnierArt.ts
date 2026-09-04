/**
 * Welche Turniere zaehlen, und was davon ist ein Finale?
 *
 * Zwei reine Textfragen, die sowohl der Server (Statistik) als auch die
 * Oberflaeche (Karteneditor) stellen muss. Sie standen bisher in
 * lib/szeneStats.ts - die Datei liest aber Dateien und laesst sich deshalb
 * nicht im Browser einbinden. Getrennt gehalten bleibt es eine Quelle statt
 * zweier Kopien, die mit der Zeit auseinanderlaufen.
 */

/**
 * Ist es ein grosses Turnier?
 *
 * Die Uebersicht soll die Szene abbilden und nicht jeden offenen Cup, an dem
 * zehntausend Leute teilnehmen. Entschieden wird am Namen.
 */
export function istGrossesTurnier(name: string): boolean {
  const n = (name ?? '').toLowerCase();
  // Zuerst das Ausschliessende: eine Division 2 bleibt eine Division 2,
  // auch wenn "FNCS" davorsteht.
  if (/division\s*[2-9]/.test(n)) return false;
  if (/performance/.test(n)) return true;
  if (/division\s*1/.test(n)) return true;
  if (/ewc|esports world cup/.test(n)) return true;
  if (/fncs/.test(n) && /(grand|major|global|final)/.test(n)) return true;
  return false;
}

/**
 * Ist dieser Spieltag ein Finale?
 *
 * Epics eigenes Kennzeichen geht vor; wo es fehlt, traegt der Name es
 * ("FNCS Division 1 Practice - Week 1 - Finals").
 */
export function istFinaleTag(
  name: string, kennzeichen?: boolean, windowId?: string,
): boolean {
  /*
   * Der Performance Evaluation Cup ist die Ausnahme.
   *
   * Epic fuehrt dort kein Finale-Kennzeichen - alle Fenster stehen auf
   * false, obwohl die zweite Runde das Finale ist; die Eventseite nennt sie
   * auch so ("Round 2 · Finals"). Ohne diesen Zusatz fiel der Cup aus der
   * Uebersicht: fuer EU rettete ihn der Name, den die Szene-Quelle vergibt
   * ("Performance Cup - Week 2 - Finals"), fuer NAC stand dort weiterhin nur
   * "Performance Evaluation Cup" - und damit sah es aus, als sei der Cup nur
   * in Europa gelaufen.
   *
   * Bewusst eng gefasst: nur dieser Cup, nur die zweite Runde. Bei allen
   * anderen bleibt Epics Kennzeichen massgeblich.
   */
  if (/performance/i.test(name ?? '') && /round2/i.test(windowId ?? '')) return true;
  if (typeof kennzeichen === 'boolean') return kennzeichen;
  return /final/i.test(name ?? '');
}
