/*
 * Was im Dashboard zu sehen ist (Betreiber, 19.10.2026: "man kann unter den Settings einstellen, dass man 'Für alle' ausblenden kann, die VIP-Sektion, den
 * Twitch-Chat, den Zugangsschlüssel, Mein Archiv"). Eine persönliche Anzeigeeinstellung dieses Browsers, kein Konto-Datum: sie liegt im localStorage und
 * wird als Attribut an <html> gesetzt (data-dash-<teil>="an"|"aus"); die Regeln dazu stehen in design.css.
 *
 * Gezeigt wird alles - ausser dem Twitch-Chat, den kaum jemand braucht: er ist von Anfang an aus und im Zahnrad einschaltbar.
 */

export const DASH_TEILE: Array<[teil: string, titel: string, anfang: boolean]> = [
  ['alle', 'Für alle', true],
  ['vip', 'VIP', true],
  ['hier', 'Nur im Dashboard', true],
  ['chat', 'Twitch-Chat', false],
  ['schluessel', 'Zugangsschlüssel', true],
  ['archiv', 'Mein Archiv', true],
];

const SCHLUESSEL = 'comphub_dash';

export function liesDash(): Record<string, boolean> {
  const raus: Record<string, boolean> = {};
  for (const [teil, , anfang] of DASH_TEILE) raus[teil] = anfang;
  try {
    const roh = JSON.parse(localStorage.getItem(SCHLUESSEL) ?? '{}') as Record<string, unknown>;
    for (const [teil] of DASH_TEILE) if (typeof roh[teil] === 'boolean') raus[teil] = roh[teil] as boolean;
  } catch { /* ohne Speicher gelten die Anfangswerte */ }
  return raus;
}

/** Die Werte als Attribute an <html> setzen. */
export function wendeDashAn(werte: Record<string, boolean> = liesDash()): void {
  const h = document.documentElement;
  for (const [teil] of DASH_TEILE) h.setAttribute(`data-dash-${teil}`, werte[teil] ? 'an' : 'aus');
}

export function setzeDash(teil: string, an: boolean): Record<string, boolean> {
  const neu = { ...liesDash(), [teil]: an };
  try { localStorage.setItem(SCHLUESSEL, JSON.stringify(neu)); } catch { /* dann gilt es nur bis zum Neuladen */ }
  wendeDashAn(neu);
  return neu;
}
