import { liesJson } from '@/lib/ablage';
import { istKennungName } from '@/lib/kennungName';
import { landQuellen } from '@/lib/landQuellen';
import { LAND_QUELLEN, landNorm } from '@/lib/spielerFlagge.mjs';

/*
 * Name und Land je Konto aus unseren eigenen Quellen (17.11.2026) - fuer alles, was einen Namen oder eine Flagge zu einer Konto-Id braucht und
 * kein gepflegtes Profil findet:
 *   name  Epics Anzeigename (epic-namen.json, scripts/pro-namen-erneuern.mjs und die Turnier-Bestenlisten)
 *   land  in der Reihenfolge von lib/spielerFlagge.mjs: gepflegtes Profil, die Flagge aus Fortnite (Epics GeoIdentity in den Bestenlisten),
 *         Noble - ohne Regionspruefung (die Region kennt hier niemand)
 * Alle Schluessel klein. Fuenf Minuten vorgehalten.
 */
export interface EigenerSpieler { name: string; land: string }

let vorrat: { bis: number; wert: Promise<Map<string, EigenerSpieler>> } | null = null;

export function eigeneSpielerliste(): Promise<Map<string, EigenerSpieler>> {
  if (vorrat && vorrat.bis > Date.now()) return vorrat.wert;
  const wert = laden();
  vorrat = { bis: Date.now() + 5 * 60_000, wert };
  wert.catch(() => { vorrat = null; });
  return wert;
}

async function laden(): Promise<Map<string, EigenerSpieler>> {
  const [namen, q] = await Promise.all([
    liesJson<Record<string, string>>('epic-namen.json', {}).catch(() => ({} as Record<string, string>)),
    landQuellen().catch(() => null),
  ]);
  const karte = new Map<string, EigenerSpieler>();
  const nachId = new Map(Object.entries(namen ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  const ids = new Set<string>([...nachId.keys(), ...Object.keys(q?.profil ?? {}), ...Object.keys(q?.spiel ?? {}), ...Object.keys(q?.noble ?? {})]);
  for (const id of ids) {
    if (!/^[0-9a-f]{32}$/.test(id)) continue;
    const roh = String(nachId.get(id) ?? '').trim();
    const name = roh && !istKennungName(roh, id) ? roh : '';
    let land = '';
    for (const quelle of LAND_QUELLEN as string[]) {
      const l = landNorm((q as unknown as Record<string, Record<string, string>> | null)?.[quelle]?.[id]);
      if (l) { land = l.toUpperCase(); break; }
    }
    if (name || land) karte.set(id, { name, land });
  }
  return karte;
}
