// Lesbare Namen fuer Epics Fensterkennungen.
//
// Epic nennt einen Spieltag "S42_FNCSDivisionalCup_Division1_Week4Final_EU".
// Auf einer Kachel soll "Division 1 · Week 4 Final" stehen - die Worte, die
// in der Kennung stecken, mit Abstaenden, ohne Saison und Region. Erfunden
// wird nichts: was hier steht, steht so in Epics Kennung.

const REGION_ENDE = /^(EU|NAC|NAE|NAW|NA|BR|ASIA|ME|OCE)(v\d+)?$|^mg\d*$|^v\d+$/i;

/** Aus "Week4Final" wird "Week 4 Final", aus "LastChanceLobby" "Last Chance Lobby". */
function lesbar(stueck: string): string {
  return stueck
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/([0-9])([A-Za-z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim();
}

/** Die Stuecke der Kennung ohne Saison, Cup-Kern und Region. */
function stuecke(windowId: string): string[] {
  const teile = windowId.split('_').filter(Boolean);
  while (teile.length > 1 && REGION_ENDE.test(teile[teile.length - 1])) teile.pop();
  if (teile.length > 1 && /^S\d+$/i.test(teile[0])) teile.shift();
  // Das erste Stueck ist der Name des Cups - der steht auf der Kachel
  // ohnehin. Nur wenn danach noch etwas bleibt.
  if (teile.length > 1) teile.shift();
  return teile;
}

/** "S42_FNCSSolo_Final_Day1_EU" -> "Final · Day 1". */
export function fensterName(windowId: string): string {
  return stuecke(windowId).map(lesbar).join(' · ');
}

/**
 * Der gemeinsame Name mehrerer Spieltage desselben Finales.
 *
 * "Final · Day 1" und "Final · Day 2" sind ein Finale an zwei Tagen; auf
 * der Kachel steht "Final". Bleibt nichts Gemeinsames (beim LAN heissen die
 * Fenster nur "Day 1" und "Day 2"), bleibt der Name leer - dann traegt die
 * Kachel den Cupnamen allein.
 */
export function gruppenName(windowIds: string[]): string {
  if (!windowIds.length) return '';
  if (windowIds.length === 1) return fensterName(windowIds[0]);
  const listen = windowIds.map(stuecke);
  const gemeinsam: string[] = [];
  for (let i = 0; i < listen[0].length; i++) {
    const s = listen[0][i];
    if (!listen.every((l) => l[i] === s)) break;
    gemeinsam.push(s);
  }
  return gemeinsam.map(lesbar).join(' · ');
}
