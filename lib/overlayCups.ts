/*
 * Welche Cups in den Overlays zur Wahl stehen.
 *
 * Epic fuehrt zweiundachtzig verschiedene Cup-Titel, und in der Auswahlliste
 * standen sie alle - Ranked Cups, Mobile Series, Skin-Cups, Arena-Testcups,
 * die Divisionen zwei bis fuenf. Der Betreiber baut Overlays fuer eine
 * Handvoll davon und hat den Kreis selbst gezogen:
 *
 *   "Du kannst nur Cups zeigen, die heute waren oder morgen sind, und das nur
 *    von FNCS Cups fuer Division eins oder Grand Finals oder Solo FNCS oder
 *    Solo Victory Cash Cup oder Duo Cash Cup Victory oder Performance Cups.
 *    Und das von jeden Finals und Opens. Ein FNCS Division zwei, drei, vier,
 *    fuenf, ein Solo Ranked Cup, ein Duo Ranked Cup, ein Arena Test Cup und
 *    solches, das musst Du gar nicht anzeigen."
 *
 * Entschieden wird am Titel, den Epic selbst vergibt, nicht an der groben
 * Einteilung in Arten: "Solo Victory Cup" faellt bei Epic unter "victory",
 * "Duos Cash Cup" unter "cash" und "FNCS Grand Finals" unter "finals" - drei
 * Arten fuer drei Cups, die alle gemeint sind, waehrend unter denselben Arten
 * auch Reload- und Serienpokale liegen, die nicht gemeint sind.
 *
 * Finals und Opens sind keine eigenen Cups, sondern Runden desselben Cups.
 * Sie kommen deshalb von allein beide mit, sobald der Cup zugelassen ist.
 */

/** Was nie zur Wahl steht, egal was sonst im Titel steht. */
const NIE = [
  /division\s*[2-9]/i,          // FNCS Division 2 bis 5
  /\branked\b/i,                // Solo und Duos Ranked Cup
  /\bmobile\b/i,                // Mobile Series
  /\barena/i,                   // Arenas Test Cup
  /\btest\b/i,
  /override series/i,           // Skin-Cups
  /shadow cup/i,
];

/** Was zur Wahl steht. */
const ERLAUBT = [
  // FNCS Division 1 - einschliesslich "Practice" und "Duos Division 1 Finals".
  /division\s*1\b/i,
  // Die grossen Finals. Der Global Championship ist der Grand Final des
  // Jahres und steht deshalb hier, obwohl er anders heisst - Epic schreibt
  // ihn je nach Jahrgang "FNCS Global Championship" oder "FNCS Globals 2025".
  /grand\s*finals?/i,
  /\bglobals?\b/i,
  // Solo-FNCS in allen Runden: Qualifiers, Heats, Fast Track, Finals.
  /fncs.*\bsolos?\b/i,
  // Cash Cups und Victory Cups in Solo und Duo. Die Reload-Fassungen sind ein
  // eigener Modus und standen nicht auf seiner Liste.
  /(cash|victory)\s*cup/i,
  // Performance Cup und Performance Evaluation Cup.
  /performance/i,
];

/**
 * Gehoert dieser Cup in die Auswahl eines Overlays?
 *
 * @param titel Der Cup-Titel, wie ihn der Katalog fuehrt.
 */
export function overlayCupErlaubt(titel: string | undefined | null): boolean {
  const s = String(titel ?? '').trim();
  if (!s) return false;
  if (NIE.some((r) => r.test(s))) return false;
  // Reload ist ein eigener Modus; "Reload Duos Victory Cup" und
  // "Reload ZB Duos Cash Cup" waeren sonst ueber die Cup-Regel hereingekommen.
  if (/reload/i.test(s) && !/division\s*1\b|grand\s*finals?/i.test(s)) return false;
  return ERLAUBT.some((r) => r.test(s));
}

/**
 * Der Zeitraum, aus dem Spieltage angeboten werden.
 *
 * Fuer die Team-Karte: heute und morgen - ein Banner entsteht waehrend des
 * Turniers. Fuer die Bestenliste zusaetzlich gestern, weil der Betreiber die
 * Tabelle des gestrigen Spieltags noch zeigen koennen will: "Wenn der Cup
 * heute oder gestern war, soll er trotzdem angezeigt werden."
 */
export function overlayZeitraum(abGestern = false): { von: number; bis: number } {
  const von = new Date();
  von.setHours(0, 0, 0, 0);
  if (abGestern) von.setDate(von.getDate() - 1);
  const bis = new Date();
  bis.setDate(bis.getDate() + 1);
  bis.setHours(23, 59, 59, 999);
  return { von: von.getTime(), bis: bis.getTime() };
}
