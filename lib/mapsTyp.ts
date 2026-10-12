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
