/*
 * Aus dem Land eines Spielers die Wettkampf-Region - wo kein Profil die Region ausdruecklich fuehrt (Betreiber, 20.10.2026: in der Prognose stand bei 85 % der Teams
 * "unbekannt", obwohl jedem Spieler eine Flagge zugeordnet war). Die Region eines Spielers ist die, in der er spielt; sie folgt hier dem Land:
 *
 *   EU    Europa einschliesslich Russland, Ukraine, Tuerkei und Israel (dort spielen sie auf den EU-Servern)
 *   NA    USA und Kanada - NA Central und NA West lassen sich am Land nicht trennen, deshalb bleibt es "NA"
 *   BR    Brasilien und Lateinamerika
 *   ASIA  Ost-, Suedost- und Suedasien
 *   ME    Naher Osten und Nordafrika
 *   OCE   Australien und Neuseeland
 *
 * Wo ein Land hier fehlt, kommt "" zurueck - es wird nichts geraten.
 */
const LISTE: Record<string, string[]> = {
  EU: ['AL', 'AD', 'AT', 'BY', 'BE', 'BA', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IS', 'IE', 'IT', 'XK', 'LV', 'LI', 'LT', 'LU', 'MT', 'MD', 'MC', 'ME', 'NL', 'MK', 'NO', 'PL', 'PT', 'RO', 'RU', 'SM', 'RS', 'SK', 'SI', 'ES', 'SE', 'CH', 'TR', 'UA', 'GB', 'UK', 'IL', 'GE', 'AM', 'AZ', 'KZ'],
  NA: ['US', 'CA', 'MX', 'PR'],
  BR: ['BR', 'AR', 'CL', 'CO', 'PE', 'UY', 'PY', 'BO', 'EC', 'VE', 'CR', 'PA', 'DO', 'GT', 'SV', 'HN', 'NI', 'CU'],
  ASIA: ['JP', 'KR', 'CN', 'HK', 'TW', 'MO', 'MN', 'IN', 'PK', 'BD', 'LK', 'NP', 'PH', 'ID', 'MY', 'SG', 'TH', 'VN', 'KH', 'LA', 'MM', 'BN'],
  ME: ['SA', 'AE', 'QA', 'KW', 'OM', 'BH', 'JO', 'LB', 'SY', 'YE', 'IQ', 'IR', 'EG', 'DZ', 'MA', 'TN', 'LY', 'PS', 'SD'],
  OCE: ['AU', 'NZ', 'FJ', 'PG'],
};

const NACH_LAND = new Map<string, string>(Object.entries(LISTE).flatMap(([r, laender]) => laender.map((l) => [l, r] as const)));

/** Die Region zu einem Landescode ("de", "DE") - oder "". */
export function regionVonLand(code?: string | null): string {
  return NACH_LAND.get(String(code ?? '').trim().toUpperCase()) ?? '';
}

/** Die haeufigste Region aus mehreren Laendern (ein Duo, ein Trio) - bei Gleichstand die des ersten Spielers. */
export function regionVonLaendern(codes: Array<string | null | undefined>): string {
  const zaehler = new Map<string, number>();
  for (const c of codes) { const r = regionVonLand(c); if (r) zaehler.set(r, (zaehler.get(r) ?? 0) + 1); }
  let beste = '', n = 0;
  for (const c of codes) { const r = regionVonLand(c); if (r && (zaehler.get(r) ?? 0) > n) { beste = r; n = zaehler.get(r) ?? 0; } }
  return beste;
}
