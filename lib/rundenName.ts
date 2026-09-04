/**
 * Der lesbare Name einer Runde, gebildet aus Epics eigener Fenster-Kennung.
 *
 * Epic steckt die Runde in die Kennung: "…_Event1Round2_EU",
 * "…_Week3Final_NAC", "Escargo_Day2". Genau diese Bestandteile werden hier
 * uebersetzt und nichts dazuerfunden - eine Runde heisst nur dann "Week 3",
 * wenn Epic sie selbst so nennt. Steht nichts Erkennbares drin, bleibt der
 * Name leer und der Cup-Titel steht fuer sich allein.
 *
 * "Week", "Quali" und "Event" bleiben, wie Epic sie schreibt; "Runde", "Tag"
 * und "Finale" laufen durch die Uebersetzung, damit auf einer englischen
 * Seite nicht plotzlich ein deutsches Wort steht.
 */
export function rundenName(
  windowId: string,
  istFinale: boolean,
  uebs: (s: string) => string = (s) => s,
): string {
  const w = windowId ?? '';
  const teile: string[] = [];
  const hol = (r: RegExp) => w.match(r)?.[1];
  const woche = hol(/Week(\d+)/i);   if (woche) teile.push(`Week ${woche}`);
  const quali = hol(/Qual(\d+)/i);   if (quali) teile.push(`Quali ${quali}`);
  const event = hol(/Event(\d+)/i);  if (event) teile.push(`Event ${event}`);
  const runde = hol(/Round(\d+)/i);  if (runde) teile.push(`${uebs('Runde')} ${runde}`);
  const tag   = hol(/Day(\d+)/i);    if (tag)   teile.push(`${uebs('Tag')} ${tag}`);
  if (istFinale || /Final/i.test(w)) teile.push(uebs('Finale'));
  return teile.join(' · ');
}

/**
 * Wie eine Turnierkarte heissen soll: Cup und Runde, beides aus echten
 * Angaben. Der Cup-Titel traegt oft noch den Zeitraum hinter einem
 * Mittelpunkt - der gehoert nicht in die Ueberschrift.
 */
export function kartenTitel(
  cupTitel: string | undefined,
  f: { windowId: string; istFinale: boolean } | null | undefined,
  uebs: (s: string) => string = (s) => s,
): string {
  const cupName = (cupTitel ?? '').split('·')[0].trim();
  const runde = f ? rundenName(f.windowId, f.istFinale, uebs) : '';
  return [cupName, runde].filter(Boolean).join(' · ');
}
