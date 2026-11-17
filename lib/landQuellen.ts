import { liesJson } from '@/lib/ablage';
import { landNorm } from '@/lib/spielerFlagge.mjs';

/*
 * Die Laender je Konto aus allen Quellen, die wir rechtmaessig haben (16.11.2026) - fuer die Flaggen in Posts (lib/ftPostsDaten, lib/ergebnisPosts,
 * lib/ergebnisSofort, lib/discordStats) und als Rueckfall auf Profil- und Statistikseiten. Die Reihenfolge und die Regionspruefung stehen in
 * lib/spielerFlagge.mjs; hier wird nur gelesen:
 *   profil  spieler-profile.json (land)
 *   spiel   power-rankings/spiel-flaggen.json (scripts/spiel-flaggen.mjs: die Flagge aus Fortnite, Epics playerFlagTokens) und ersatzweise die Weltrangliste
 *           (power-rankings/global.json, dieselbe Angabe)
 *   noble   scrims/_laender.json (scripts/scrims-holen.mjs): das Land, das Noble am haeufigsten nennt
 * Alle Schluessel klein. Fuenf Minuten vorgehalten.
 */
export interface LandQuellen {
  profil: Record<string, string>;
  spiel: Record<string, string>;
  noble: Record<string, string>;
}

let vorrat: { bis: number; wert: Promise<LandQuellen> } | null = null;

export function landQuellen(): Promise<LandQuellen> {
  if (vorrat && vorrat.bis > Date.now()) return vorrat.wert;
  const wert = laden();
  vorrat = { bis: Date.now() + 5 * 60_000, wert };
  wert.catch(() => { vorrat = null; });
  return wert;
}

const idVon = (roh: unknown) => String(roh ?? '').replace(/-/g, '').trim().toLowerCase();
const istId = (id: string) => /^[0-9a-f]{32}$/.test(id);

async function laden(): Promise<LandQuellen> {
  const [profile, spiel, pr, noble] = await Promise.all([
    liesJson<Record<string, { id?: string; epicId?: string; land?: string }> | Array<{ id?: string; epicId?: string; land?: string }>>('spieler-profile.json', {}).catch(() => ({})),
    liesJson<{ konten?: Record<string, [string, number]> } | null>('power-rankings/spiel-flaggen.json', null).catch(() => null),
    liesJson<{ spieler?: Array<{ id?: string; land?: string }> } | null>('power-rankings/global.json', null).catch(() => null),
    liesJson<{ konten?: Record<string, Record<string, number>> } | null>('scrims/_laender.json', null).catch(() => null),
  ]);
  const q: LandQuellen = { profil: {}, spiel: {}, noble: {} };
  const eintraege = Array.isArray(profile) ? profile.map((p) => [p.id ?? p.epicId ?? '', p] as const) : Object.entries(profile ?? {});
  for (const [schl, p] of eintraege) {
    const id = idVon(p?.id || p?.epicId || schl);
    const l = landNorm(p?.land);
    if (istId(id) && l) q.profil[id] = l;
  }
  // Die Weltrangliste zuerst, die gesammelten Spiel-Flaggen (auch aus Turnier-Bestenlisten, mit Zeitstempel) gehen vor.
  for (const s of pr?.spieler ?? []) { const id = idVon(s?.id); const l = landNorm(s?.land); if (istId(id) && l) q.spiel[id] = l; }
  for (const [roh, w] of Object.entries(spiel?.konten ?? {})) { const id = idVon(roh); const l = landNorm(Array.isArray(w) ? w[0] : w); if (istId(id) && l) q.spiel[id] = l; }
  // Noble: das am haeufigsten genannte Land (bei Gleichstand keines - nicht raten).
  for (const [roh, zaehl] of Object.entries(noble?.konten ?? {})) {
    const id = idVon(roh);
    const liste = Object.entries(zaehl ?? {}).sort((a, b) => b[1] - a[1]);
    if (!istId(id) || !liste.length || (liste[1] && liste[1][1] === liste[0][1])) continue;
    const l = landNorm(liste[0][0]);
    if (l) q.noble[id] = l;
  }
  return q;
}
