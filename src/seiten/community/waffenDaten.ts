import { useEffect, useState } from 'react';
import { kern } from './waffenNamen';

/*
 * Waffen-Datenbank aus den Spieldateien (Betreiber, 26.11.2026: "alles wie fortnite.gg/weapons"). fortnite.gg darf nicht abgegriffen werden -
 * die Werte kommen aus dem eigenen Export (CUE4Parse auf dem PC des Betreibers), abgelegt als public/hub-daten/waffen.json.
 * Auftrag fuer den Export: scratchpad/waffen-export-auftrag.md. Fehlt die Datei, zeigt die Seite nur die Turnierwerte und sagt das ehrlich.
 *
 * Format (Version 1) - alle Zahlen so, wie sie im Spiel gelten:
 * {
 *   "format": 1,
 *   "season": 43, "build": "++Fortnite+Release-xx.xx-CL-12345678", "exportedAt": "2026-11-27T12:00:00Z", "playlist": "Playlist_DefaultSolo",
 *   "weapons": [{
 *     "id": "assault_heavy_recoil",            // stabil, klein, ohne WID_/_Athena/Seltenheit (wie kern() in waffenNamen.ts)
 *     "name": "Hammer Assault Rifle",          // englischer Anzeigename aus der WID (ItemName)
 *     "class": "ar",                           // ar | shotgun | smg | pistol | sniper | launcher | melee | throwable | special
 *     "icon": "/hub-daten/icons/assault_heavy_recoil.png",   // optional; sonst Symbol aus waffenNamen.ts
 *     "ammo": "Medium Bullets",                // optional
 *     "blueprints": ["B_Assault_Heavy_Recoil_Athena_C"],     // optional: Bauplaene, wie sie in Replays stehen (Abgleich mit Turnierwerten)
 *     "rarities": [{
 *       "rarity": "common",                    // common | uncommon | rare | epic | legendary | mythic | exotic (auch C/UC/R/VR/SR/UR)
 *       "wid": "WID_Assault_Heavy_Recoil_Athena_C", "statsRow": "Assault_Heavy_Recoil_Athena_C",   // optional, Herkunft
 *       "damage": 30,                          // Koerpertreffer je Kugel/Schrot (DmgPB)
 *       "pellets": 1,                          // Kugeln je Schuss (Schrotflinten > 1), Standard 1
 *       "headshotMultiplier": 1.5,
 *       "fireRate": 5.5,                       // Schuss je Sekunde
 *       "dps": 165,                            // optional; fehlt er, rechnet die Seite damage x pellets x fireRate (gekennzeichnet)
 *       "magazine": 25, "reloadTime": 2.3,     // Sekunden
 *       "structureDamage": 30,                 // EnvDmgPB
 *       "loot": { "floor": 0.81, "chest": 1.2, "ammoBox": null, "supplyDrop": null }   // Prozent (0..100) je Behaelter, optional
 *     }],
 *     "loot": { "floor": 3.2, "chest": 4.1 }   // optional: alle Seltenheiten zusammen; fehlt es, wird ueber rarities[].loot summiert
 *   }]
 * }
 */

export type Klasse = 'ar' | 'shotgun' | 'smg' | 'pistol' | 'sniper' | 'launcher' | 'melee' | 'throwable' | 'special';
export interface Chancen { floor?: number | null; chest?: number | null; ammoBox?: number | null; supplyDrop?: number | null }
export interface Stufe {
  rarity: string; wid?: string; statsRow?: string;
  damage?: number; pellets?: number; headshotMultiplier?: number; fireRate?: number; dps?: number; dpsGerechnet?: boolean;
  magazine?: number; reloadTime?: number; structureDamage?: number; loot?: Chancen;
}
export interface DbWaffe { id: string; name: string; class: Klasse; icon?: string; ammo?: string; blueprints: string[]; rarities: Stufe[]; loot?: Chancen }
export interface Datenbank { season?: number; build?: string; exportedAt?: string; playlist?: string; weapons: DbWaffe[] }

export const SELTENHEITEN = [
  { k: 'common', kurz: 'C', titel: 'Common', farbe: '#9ca3af' },
  { k: 'uncommon', kurz: 'UC', titel: 'Uncommon', farbe: '#22c55e' },
  { k: 'rare', kurz: 'R', titel: 'Rare', farbe: '#38bdf8' },
  { k: 'epic', kurz: 'VR', titel: 'Epic', farbe: '#a855f7' },
  { k: 'legendary', kurz: 'SR', titel: 'Legendary', farbe: '#f59e0b' },
  { k: 'mythic', kurz: 'UR', titel: 'Mythic', farbe: '#facc15' },
  { k: 'exotic', kurz: 'X', titel: 'Exotic', farbe: '#67e8f9' },
];
export const selten = (k: string) => SELTENHEITEN.find((s) => s.k === k) ?? SELTENHEITEN[0];
const SELTEN_NAMEN: Record<string, string> = {
  c: 'common', common: 'common', uc: 'uncommon', uncommon: 'uncommon', r: 'rare', rare: 'rare', vr: 'epic', epic: 'epic',
  sr: 'legendary', legendary: 'legendary', ur: 'mythic', mythic: 'mythic', x: 'exotic', exotic: 'exotic', transcendent: 'mythic',
};

export const KLASSEN_DB: Array<{ k: Klasse; titel: string }> = [
  { k: 'ar', titel: 'Assault Rifles' }, { k: 'shotgun', titel: 'Shotguns' }, { k: 'smg', titel: 'SMGs' }, { k: 'pistol', titel: 'Pistols' },
  { k: 'sniper', titel: 'Snipers & DMRs' }, { k: 'launcher', titel: 'Launchers' }, { k: 'melee', titel: 'Melee' },
  { k: 'throwable', titel: 'Throwables' }, { k: 'special', titel: 'Specials' },
];
const KLASSE_ALIAS: Record<string, Klasse> = {
  ar: 'ar', assault: 'ar', rifle: 'ar', assaultrifle: 'ar', shotgun: 'shotgun', smg: 'smg', submachinegun: 'smg', pistol: 'pistol',
  sniper: 'sniper', dmr: 'sniper', marksman: 'sniper', launcher: 'launcher', explosive: 'launcher', melee: 'melee',
  throwable: 'throwable', grenade: 'throwable', consumable: 'special', special: 'special', other: 'special',
};

const zahl = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
function chancen(v: unknown): Chancen | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const c = { floor: zahl(o.floor), chest: zahl(o.chest), ammoBox: zahl(o.ammoBox), supplyDrop: zahl(o.supplyDrop) };
  return Object.values(c).some((x) => x !== undefined) ? c : undefined;
}

/** Prueft und vereinheitlicht die Datei - Unbekanntes faellt weg, nichts wird ergaenzt ausser dem gekennzeichneten DPS. */
export function lesen(roh: unknown): Datenbank | null {
  if (!roh || typeof roh !== 'object') return null;
  const j = roh as Record<string, unknown>;
  const liste = Array.isArray(j.weapons) ? j.weapons : Array.isArray(roh) ? (roh as unknown[]) : [];
  const weapons: DbWaffe[] = [];
  for (const w of liste as Array<Record<string, unknown>>) {
    if (!w || typeof w.name !== 'string') continue;
    const rarities: Stufe[] = [];
    for (const r of (Array.isArray(w.rarities) ? w.rarities : []) as Array<Record<string, unknown>>) {
      const k = SELTEN_NAMEN[String(r?.rarity ?? '').toLowerCase()];
      if (!k || rarities.some((x) => x.rarity === k)) continue;
      const s: Stufe = {
        rarity: k, wid: typeof r.wid === 'string' ? r.wid : undefined, statsRow: typeof r.statsRow === 'string' ? r.statsRow : undefined,
        damage: zahl(r.damage), pellets: zahl(r.pellets), headshotMultiplier: zahl(r.headshotMultiplier), fireRate: zahl(r.fireRate), dps: zahl(r.dps),
        magazine: zahl(r.magazine), reloadTime: zahl(r.reloadTime), structureDamage: zahl(r.structureDamage), loot: chancen(r.loot),
      };
      if (s.dps === undefined && s.damage !== undefined && s.fireRate !== undefined) { s.dps = s.damage * (s.pellets ?? 1) * s.fireRate; s.dpsGerechnet = true; }
      rarities.push(s);
    }
    rarities.sort((a, b) => SELTENHEITEN.findIndex((x) => x.k === a.rarity) - SELTENHEITEN.findIndex((x) => x.k === b.rarity));
    const id = typeof w.id === 'string' && w.id ? w.id : kern(w.name);
    weapons.push({
      id, name: w.name, class: KLASSE_ALIAS[String(w.class ?? '').toLowerCase().replace(/[\s_-]/g, '')] ?? 'special',
      icon: typeof w.icon === 'string' ? w.icon : undefined, ammo: typeof w.ammo === 'string' ? w.ammo : undefined,
      blueprints: (Array.isArray(w.blueprints) ? w.blueprints : []).filter((b): b is string => typeof b === 'string'),
      rarities, loot: chancen(w.loot),
    });
  }
  if (!weapons.length) return null;
  return {
    weapons, season: zahl(j.season), build: typeof j.build === 'string' ? j.build : undefined,
    exportedAt: typeof j.exportedAt === 'string' ? j.exportedAt : undefined, playlist: typeof j.playlist === 'string' ? j.playlist : undefined,
  };
}

/** Gesamtchance einer Waffe je Behaelter: aus "loot", sonst Summe ueber die Seltenheiten. */
export function gesamtChance(w: DbWaffe, wo: keyof Chancen): number | undefined {
  const direkt = w.loot?.[wo];
  if (typeof direkt === 'number') return direkt;
  const teile = w.rarities.map((r) => r.loot?.[wo]).filter((x): x is number => typeof x === 'number');
  return teile.length ? teile.reduce((a, b) => a + b, 0) : undefined;
}

/** Schluessel fuer den Abgleich mit den Turnier-Bauplaenen (B_..._Athena_C -> kern). */
export function abgleichSchluessel(w: DbWaffe): string[] {
  const s = new Set<string>([w.id.toLowerCase(), kern(w.id)]);
  for (const b of w.blueprints) s.add(kern(b));
  for (const r of w.rarities) { if (r.wid) s.add(kern(r.wid)); if (r.statsRow) s.add(kern(r.statsRow)); }
  return [...s].filter(Boolean);
}

export type Status = 'laedt' | 'fehlt' | 'da';
export function useDatenbank(): { db: Datenbank | null; status: Status } {
  const [zustand, setZustand] = useState<{ db: Datenbank | null; status: Status }>({ db: null, status: 'laedt' });
  useEffect(() => {
    let weg = false;
    fetch('/hub-daten/waffen.json', { cache: 'no-store' }).then((r) => {
      // Vite liefert fuer fehlende Dateien index.html - also nur echtes JSON zaehlt.
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) throw new Error('fehlt');
      return r.json();
    }).then((j) => { const db = lesen(j); if (!weg) setZustand({ db, status: db ? 'da' : 'fehlt' }); })
      .catch(() => { if (!weg) setZustand({ db: null, status: 'fehlt' }); });
    return () => { weg = true; };
  }, []);
  return zustand;
}

/** Die vergleichbaren Werte - "hoeher" sagt, ob mehr besser ist (fuer Hervorhebung im Vergleich). */
export const WERTE: Array<{ k: string; titel: string; kurz: string; einheit?: string; hoeher: boolean; wert: (s: Stufe) => number | undefined; text?: (s: Stufe) => string }> = [
  { k: 'damage', titel: 'Damage', kurz: 'DMG', hoeher: true, wert: (s) => (s.damage === undefined ? undefined : s.damage * (s.pellets ?? 1)),
    text: (s) => ((s.pellets ?? 1) > 1 ? `${fmt(s.damage! * s.pellets!)}` : fmt(s.damage!)) },
  { k: 'dps', titel: 'DPS', kurz: 'DPS', hoeher: true, wert: (s) => s.dps },
  { k: 'fireRate', titel: 'Fire rate', kurz: 'RATE', einheit: '/s', hoeher: true, wert: (s) => s.fireRate },
  { k: 'magazine', titel: 'Magazine', kurz: 'MAG', hoeher: true, wert: (s) => s.magazine },
  { k: 'reloadTime', titel: 'Reload time', kurz: 'RELOAD', einheit: 's', hoeher: false, wert: (s) => s.reloadTime },
  { k: 'headshotMultiplier', titel: 'Headshot', kurz: 'HEAD', einheit: '×', hoeher: true, wert: (s) => s.headshotMultiplier },
  { k: 'structureDamage', titel: 'Structure damage', kurz: 'STRUCT', hoeher: true, wert: (s) => s.structureDamage },
];
export function fmt(n: number, stellen?: number) {
  const d = stellen ?? (Math.abs(n) >= 100 || Number.isInteger(n) ? 0 : Math.abs(n) >= 10 ? 1 : 2);
  return n.toLocaleString('en', { maximumFractionDigits: d, minimumFractionDigits: 0 });
}
export const pro = (n: number | undefined | null) => (typeof n === 'number' ? `${n < 1 && n > 0 ? n.toFixed(2) : n.toFixed(1)} %` : '—');
