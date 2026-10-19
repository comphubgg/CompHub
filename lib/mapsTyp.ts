/*
 * Die Art eines Cups - fuer die Filter der Maps-Seite. Eigene Datei, damit lib/mapsVerzeichnis und lib/alteMaps
 * sie beide nutzen koennen, ohne sich gegenseitig einzubinden.
 */

export type MapTyp = 'fncs' | 'performance' | 'division' | 'reload' | 'sonst';

export function typVon(name: string): MapTyp {
  const n = name.toLowerCase();
  if (/reload/.test(n)) return 'reload';
  if (/division/.test(n)) return 'division';
  if (/performance/.test(n)) return 'performance';
  if (/fncs|global championship|major|last chance|solos/.test(n)) return 'fncs';
  return 'sonst';
}

/*
 * Die Namen der Saisons, wie das Vorbild sie zeigt ("Chapter 3 Season 3 - Vibin'"). Der Betreiber (13.10.2026): "jede Season
 * mit ihrem Namen". Chapter 4 Season OG (S27) und Galactic Battle (S35) gibt es in den Maps nicht - sie stehen auch nicht hier.
 */
export const SAISON_TITEL: Record<string, string> = {
  S9: 'The Future Is Yours',
  S14: 'Nexus War', S15: 'Zero Point', S16: 'Primal', S17: 'Invasion', S18: 'Cubed',
  S19: 'Flipped', S20: 'Resistance', S21: "Vibin'", S22: 'Paradise',
  S23: 'A New Beginning', S24: 'MEGA', S25: 'Wilds', S26: 'Last Resort',
  S28: 'Underground', S29: 'Myths & Mortals', S30: 'Wrecked', S31: 'Absolute Doom',
  S33: 'Hunters', S34: 'Lawless', S36: 'Super', S37: "Shock 'N Awesome", S38: 'The Simpsons',
  S39: 'Pacific Break', S40: 'Showdown', S41: 'Runners', S42: 'Override',
};

/**
 * Saisons, die in den Maps nicht vorkommen: die OG-Saison und die Mini-Saison Galactic Battle (S27, S35) - und die Saisons ohne
 * einen einzigen Cup, zu dem es Informationen gibt (Chapter 1 Season 8 und X, Chapter 2 Season 1 bis 3). Der Betreiber
 * (13.10.2026): "wenn du dazu keine Infos hast, kannst du die loeschen, leer zu haben ist unnoetig."
 */
export const SAISON_OHNE_MAPS = new Set(['S8', 'S10', 'S11', 'S12', 'S13', 'S27', 'S35']);

/*
 * Die Vorschaubilder der Cups - die, die der Betreiber geschickt hat (13.10.2026). Nach dem Namen des Cups; wo keins passt, bleibt
 * null und das Bild der Art (BILD_JE_TYP) oder Epics eigenes gilt.
 */
export function cupBild(name: string): string | null {
  const n = name.toLowerCase();
  if (/mobiles*tests*cup/.test(n)) return '/cups/mobile-test-cup.jpg';
  if (/summit/.test(n)) return '/cups/major-1-summit-2026.webp';
  if (/world cup/.test(n)) return '/cups/world-cup.webp';
  if (/invitational/.test(n)) return '/cups/fncs-invitational-2022.webp';
  if (/gamers8/.test(n)) return '/cups/gamers8.webp';
  if (/elite cup/.test(n)) return '/cups/elite-cup.webp';
  if (/console/.test(n)) return '/cups/console-champions-cup.webp';
  if (/reload cup/.test(n)) return '/cups/reload-cup.webp';
  if (/solo series/.test(n)) return '/cups/solo-series.webp';
  if (/cash cup/.test(n)) return '/cups/cash-cup.webp';
  if (/global championship 2026/.test(n)) return null;
  if (/global championship|globals 2024/.test(n)) return '/cups/global-championship-2025.webp';
  if (/reload/.test(n)) return '/cups/reload-road-to-ewc.webp';
  if (/major/.test(n)) return '/cups/fncs-major.webp';
  return null;
}
