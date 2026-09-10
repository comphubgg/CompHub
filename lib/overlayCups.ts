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

/**
 * Wie lange vor dem Start ein Manager einen Spieltag waehlen darf.
 *
 * Ein Manager-Zugang betreut die Overlays eines Streamers waehrend des
 * Streams. Dort soll er den Cup umstellen koennen - aber nur den, um den es
 * gerade geht. Der Betreiber hat die Fenster selbst gezogen: "als VIP Manager
 * kannst Du nur die Cups auswaehlen, die gerade heute sind, live sind. Also
 * so fuenfzehn Minuten vor Cup-Start fuer Europa-Cups und bis zu zwei Stunden
 * vor Cup-Start fuer alle anderen Regionen."
 *
 * Europa ist enger, weil er dort selbst dabei ist und die Zeiten kennt; bei
 * den anderen Regionen laeuft die Vorbereitung frueher, oft aus einer anderen
 * Zeitzone heraus.
 *
 * Was schon laeuft oder heute gelaufen ist, bleibt waehlbar - ein Overlay
 * entsteht auch mal nach der ersten Runde.
 */
const MANAGER_VORLAUF_MS: Record<string, number> = {
  EU: 15 * 60 * 1000,
};
const MANAGER_VORLAUF_SONST_MS = 2 * 60 * 60 * 1000;

/**
 * Darf ein Manager diesen Spieltag gerade waehlen?
 *
 * @param begin  Beginn des Spieltags in Millisekunden.
 * @param region Die Region des Spieltags.
 * @param live   Laeuft er gerade?
 */
export function managerDarfCup(
  begin: number, region: string, live: boolean,
): boolean {
  if (live) return true;
  const jetzt = Date.now();
  // Was heute schon gelaufen ist, bleibt den Tag ueber waehlbar.
  const tagesbeginn = new Date(); tagesbeginn.setHours(0, 0, 0, 0);
  if (begin < jetzt) return begin >= tagesbeginn.getTime();
  const vorlauf = MANAGER_VORLAUF_MS[String(region).toUpperCase()]
    ?? MANAGER_VORLAUF_SONST_MS;
  return begin - jetzt <= vorlauf;
}

/**
 * Wie wichtig dieser Cup ist - kleiner heisst weiter oben.
 *
 * Der Betreiber wollte die Auswahl nach Wichtigkeit geordnet, nicht nach
 * Datum und schon gar nicht alphabetisch: "da sieht man alle Cups, die nach
 * Wichtigkeit sortiert sind. Also einfach die, wo ich dir gesagt hab." Die
 * Reihenfolge ist seine: die grossen Finals zuerst, dann Division 1, dann die
 * Solo-FNCS, dann die Performance Cups, dann Cash und Victory.
 *
 * Alles, was gar nicht in die Auswahl gehoert und nur ueber "mehr" sichtbar
 * wird, bekommt den letzten Rang - es steht dann zwar da, aber unten.
 */
export function overlayCupRang(titel: string | undefined | null): number {
  const s = String(titel ?? '').trim();
  if (!s) return 99;
  if (/grand\s*finals?|\bglobals?\b/i.test(s)) return 0;
  if (/division\s*1\b/i.test(s)) return 1;
  if (/fncs.*\bsolos?\b/i.test(s)) return 2;
  if (/performance/i.test(s)) return 3;
  if (/(cash|victory)\s*cup/i.test(s)) return 4;
  if (overlayCupErlaubt(s)) return 5;
  return 9;
}

/**
 * Wie weit vorn eine Region steht.
 *
 * Europa zuerst - dort spielt der Betreiber, dort spielen die Leute, die er
 * streamt. Danach Nordamerika, dann der Rest. Eine unbekannte Region landet
 * hinten, statt die Ordnung durcheinanderzubringen.
 */
const REGION_RANG: Record<string, number> = {
  EU: 0, NAC: 1, NAW: 2, NA: 2, BR: 3, ASIA: 4, ME: 5, OCE: 6,
};

export function overlayRegionRang(region: string | undefined | null): number {
  return REGION_RANG[String(region ?? '').trim().toUpperCase()] ?? 8;
}

/**
 * Der weite Zeitraum fuer die Overlay-Seite.
 *
 * overlayZeitraum() deckt gestern bis morgen ab - genug, um waehrend eines
 * Spieltags zu arbeiten, aber zu wenig fuer das, was der Betreiber wollte:
 * "wenn diese irgendwie live sind oder in der Zukunft kommen oder gewesen
 * sind, sollte die trotzdem zu sehen sein." Also eine Woche zurueck und zwei
 * Wochen nach vorn. Weiter nicht: Epic kuendigt Spieltage Monate im Voraus
 * an, und eine Liste mit achtzig kommenden Fenstern ist keine Auswahl mehr.
 */
export function overlayZeitraumWeit(): { von: number; bis: number } {
  const von = new Date();
  von.setHours(0, 0, 0, 0);
  von.setDate(von.getDate() - 7);
  const bis = new Date();
  bis.setDate(bis.getDate() + 14);
  bis.setHours(23, 59, 59, 999);
  return { von: von.getTime(), bis: bis.getTime() };
}
