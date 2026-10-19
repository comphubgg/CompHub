// Welche Cups und Fenster fuer die Replay-Auswertung zaehlen - gemeinsam fuer den Sammler (scripts/replays-holen.mjs) und die Verwaltung (app/api/replays),
// damit die Verwaltung auch die Fenster zeigt, die der Sammler noch nicht begonnen hat.

/**
 * Welche Cups es wert sind, ihre Replays zu holen.
 *
 * Nicht jeder Cup verdient tausend Downloads. Ein Division-5-Spieltag hat
 * 6800 Teams und keinen einzigen Profi darin; ein Skin-Cup laeuft eine
 * Stunde und wird nie wieder erwaehnt. Beides fuellt nur die Platte und
 * haelt die Cups auf, auf die es ankommt - und die Frist von einunddreissig
 * Tagen laeuft waehrenddessen weiter.
 *
 * WICHTIG: Das gilt NUR fuer die Replays. Die uebrigen Statistiken - Epics
 * Bestenlisten und die Einzelwerte der Szene-Quelle - werden weiterhin von
 * jedem Cup geholt. Hier faellt nichts aus der Oberflaeche heraus, es wird
 * nur nicht jedes Match nachgelesen.
 *
 * Die Regeln, in dieser Reihenfolge:
 *
 *   'alles'     -> Opens und Finals
 *   'nurFinals' -> nur die Endrunde
 *   'nichts'    -> gar nicht
 */
export function replayRegel(cup) {
  const t = (cup.titel ?? '').toLowerCase();
  const id = (cup.id ?? '').toLowerCase();

  // Zuerst die Divisionen - "FNCS Division 3 Practice" enthaelt auch "fncs"
  // und liefe sonst in die Regel darunter.
  if (/division/.test(t) || /division/.test(id)) {
    return (/division\s*1\b/.test(t) || /division1/.test(id)) ? 'alles' : 'nichts';
  }

  // Die Cups, in denen die Szene wirklich spielt.
  if (/performance/.test(t)) return 'alles';
  if (/fncs/.test(t) || /elite\s*series/.test(t)) return 'alles';

  /*
   * Victory Cups vollstaendig, nicht nur die Endrunde.
   *
   * Der Betreiber: "Es sind ja nicht nur drei Games beim Solo-Cup, sondern
   * es hat mehrere gegeben, weil es ein Open Cup ist, kein Final. Es hat
   * jeden einzelnen Drecksmatch zu durchsuchen."
   *
   * Das kostet: die Endrunde eines Solo Victory Cup EU sind 119 Matches und
   * vier Megabyte; eine offene Runde desselben Cups hat ein Vielfaches
   * davon. Heruntergeladen wird je Match ein Replay von rund drei Megabyte,
   * gespeichert bleiben nur die ausgewerteten Zahlen.
   */
  if (/victory/.test(t)) return 'alles';

  // Ranked Cups fallen ganz weg. Dort spielt die halbe Welt um Ranglisten-
  // punkte, nicht um einen Titel; die Replays davon waeren reine Menge.
  if (/ranked/.test(t) || /ranked/.test(id)) return 'nichts';

  // Alles Uebrige nur, wenn es um etwas geht.
  return 'nurFinals';
}

/**
 * Welche Fenster eines Cups die Endrunde sind.
 *
 * Epics Kennzeichen "istFinale" taugt dafuer allein nicht: der Reload Duos
 * Victory Cup setzt es auf Round 2, der Solo Victory Cup nicht - obwohl dort
 * dieselbe Runde ueber alles entscheidet. Deshalb zusaetzlich ueber den
 * Namen: was "Final" heisst, ist eins, und sonst gilt die hoechste Runde,
 * die dieser Cup ueberhaupt hat.
 */
export function endrunden(liste) {
  const rundeVon = (w) => {
    const m = /round\s*_?(\d+)/i.exec(w.windowId ?? '');
    return m ? Number(m[1]) : null;
  };
  /*
   * Ein einziges Fenster ist immer die Endrunde.
   *
   * Cups ohne Vorrunde - Mobile Cups und die meisten Skin-Cups - haben je
   * Region genau ein Fenster. Es traegt kein "istFinale", keine Rundenzahl
   * und kein "Final" im Namen, faellt also durch jede der drei Pruefungen
   * unten und wurde als "uebersprungen" gezaehlt. Damit war fuer diese Cups
   * nie ein Replay zu holen, obwohl dieses eine Fenster der ganze Cup ist.
   */
  if (liste.length === 1) return new Set(liste.map((w) => w.windowId));

  const runden = liste.map(rundeVon).filter((n) => n !== null);
  const hoechste = runden.length ? Math.max(...runden) : 0;

  return new Set(liste.filter((w) => w.istFinale
    || /final/i.test(w.windowId ?? '')
    || (hoechste > 0 && rundeVon(w) === hoechste)).map((w) => w.windowId));
}
