import { useEffect, useState } from 'react';
import LOOT_BILDER from './lootBilder.json';
import SPIEL_SYMBOL_TABELLE from './spielSymbole.json';
import WIKI_SYMBOL_TABELLE from './wikiSymbole.json';

/*
 * Waffen-Symbole wie auf thecomphub.com (app/replays/SpielerEbene): Bauplan aus dem Replay -> Name und Bild unter /waffen.
 * Reihenfolge: feste Spiel-Symbole, Tabelle von fortnite.gg, lokale Wiki-Bilder, /api/waffen-bilder, zuletzt die Loot-Tabelle.
 */

export type Art = 'shotgun' | 'ar' | 'smg' | 'pistol' | 'sniper' | 'hacke' | 'sonst';
const ARTEN: Array<[RegExp, Art, string]> = [
  [/Shotgun|TacSG|VampireStake/i, 'shotgun', 'Shotgun'], [/Assault|Rifle/i, 'ar', 'Assault Rifle'], [/SMG|BoneRattler/i, 'smg', 'SMG'],
  [/HeatSnake|Sniper|Drift/i, 'sniper', 'Sniper'], [/Pistol|Dualies|FiendHunter/i, 'pistol', 'Pistol'], [/Pickaxe|StarWand|Melee/i, 'hacke', 'Pickaxe'],
];
export function artVon(roh: string): { art: Art; name: string } {
  for (const [m, art, name] of ARTEN) if (m.test(roh)) return { art, name };
  return { art: 'sonst', name: roh.replace(/^(WID|AGID|BP?|Athena)_/i, '').replace(/_?(Athena|Weap|Ore|T0\d|_C)$/gi, '').replace(/_/g, ' ') };
}
export function seltenheit(roh: string): string {
  const m = roh.match(/_(C|UC|R|VR|SR|UR)(?:_|$)/);
  return ({ C: '#6b7280', UC: '#16a34a', R: '#0284c7', VR: '#9333ea', SR: '#d97706', UR: '#d97706' } as Record<string, string>)[m?.[1] ?? ''] ?? '#334155';
}

const BILDER = LOOT_BILDER as Record<string, { name: string; bild: string }>;
const BAUPLAN_ZU_WID: Array<[RegExp, string]> = [
  [/ArcadeWeaponShotgun/i, 'WID_ArcadeShotgun'], [/Assault_Heavy/i, 'WID_Assault_Heavy_Athena'], [/B_Shotgun_Standard/i, 'WID_Shotgun_Standard_Athena'],
  [/CrimsonMist/i, 'WID_CrimsonMist_TacSG'], [/FiendHunter/i, 'WID_Athena_FiendHunter_Dualies'], [/Pistol_Muster/i, 'WID_Pistol_Muster_S39_Athena'],
  [/VampireStake/i, 'WID_VampireStake_Shotgun'], [/HappyGhost/i, 'WID_Athena_HappyGhost'],
];
const SPIEL_SYMBOLE: Array<[RegExp, string, string]> = [
  [/Assault_Flintlock/i, 'Bundlebuss Repeater Rifle', 't_icon_weapons_rifle_knockvalley_goldrepaint_l'],
  [/Assault_Heavy_Recoil/i, 'Hammer Assault Rifle', 't-icon-weapons-recoilweapon-l'],
  [/Shotgun_Break_Flintlock/i, 'Gilded Dragoon Shotgun', 't_icon_weapons_shotgun_dragoon_goldrepaint_l'],
  [/Shotgun_CoreDPS/i, 'Auto Shotgun', 't-icon-weapons-corerapidfireshotgunweapon-l'],
  [/Shotgun_Pump_FirePetal/i, 'Sentinel Pump Shotgun', 't_icon_weapons_shotgun_pump_firepetal_l'],
  [/Pistol_PostApocalyptic|Pistol_Scavenger/i, 'Tactical Submachine Gun', 't-icon-weapons-sk-post-apocalyptic-pistol-l'],
  [/Pistol_Machine/i, 'Machine SMG', 't-icon-weapons-sk-machinepistol-br-l'],
  [/Delilah_Slingshot_HarmlessThrift/i, "Usopp's Slingshot", 't_icon_weapons_launcher_slingshot_harmlessthrift_l'],
  [/Pistol_Flintlock/i, 'Flint-Knock Pistol', 't-icon-weapons-sk-flintlock-pistol-single-shot-l'],
  [/Pistol_CorePistol/i, 'Sidearm Pistol', 't-icon-weapons-corepistolweapon-l'],
  [/HappyGhost/i, 'Harpoon Gun', 't-icon-weapons-happyghostgun-l'],
  [/GraftedCrunchy/i, "Zoro's Three Sword Style", 't_icon_weapons_sword_graftedcrunchy_mouth_ui_l'],
  [/Stimpulse|Shockwave_Athena_STim/i, 'Overdrive Grenade', 't_icon_br_gadget_stimpulsegrenade_l'],
  [/HeatSnake/i, "Rebecca's Guns", 't_icon_weapons_heatsnake_l'],
];
const kern = (s: string) => s.replace(/^(B|BP|WID|WMID|AGID|CID)_/i, '').replace(/_C$/i, '').replace(/_(C|UC|R|VR|SR|UR|X|XR|Exotic)(_Ore_T0\d|_T0\d)?$/i, '')
  .split('_').filter((t) => t && !/^(athena|weap|weapon|child|held|spytech|figment)$/i.test(t)).join('_').toLowerCase();
const SYMBOLE = SPIEL_SYMBOL_TABELLE as unknown as Record<string, [string, string]>;
const WIKI_LOKAL = WIKI_SYMBOL_TABELLE as unknown as Record<string, [string, string]>;

let wiki: Map<string, { name: string; bild: string }> | null = null;
let wikiLaedt = false;
const hoerer = new Set<() => void>();
/** Laedt einmal /api/waffen-bilder nach (neue Waffen nach einem Update). */
export function useWiki() {
  const [, neu] = useState(0);
  useEffect(() => {
    if (wiki) return undefined;
    const f = () => neu((x) => x + 1);
    hoerer.add(f);
    if (!wikiLaedt) {
      wikiLaedt = true;
      fetch('/api/waffen-bilder').then((r) => r.json()).then((j: Record<string, { name: string; bild: string }>) => {
        const m = new Map<string, { name: string; bild: string }>();
        for (const [k, v] of Object.entries(j ?? {})) { const n = kern(k); if (!m.has(n)) m.set(n, v); }
        wiki = m; hoerer.forEach((h) => h());
      }).catch(() => { wikiLaedt = false; });
    }
    return () => { hoerer.delete(f); };
  }, []);
}

export function bildVon(roh: string): { name: string; bild: string } | null {
  const spiel = SPIEL_SYMBOLE.find(([m]) => m.test(roh));
  if (spiel) return { name: spiel[1], bild: `/waffen/${spiel[2]}.webp` };
  const symbol = SYMBOLE[kern(roh)];
  if (symbol) return { name: symbol[0], bild: `/waffen/${symbol[1]}.webp` };
  const lokal = WIKI_LOKAL[kern(roh)];
  if (lokal) return { name: lokal[0], bild: `/waffen/${lokal[1]}.webp` };
  const ausWiki = wiki?.get(kern(roh));
  if (ausWiki) return ausWiki;
  if (/^(WID|AGID)_/i.test(roh)) return BILDER[roh] ?? BILDER[roh.replace(/_(C|UC|R|VR|SR|UR|X)(_Ore_T0\d|_T0\d)?$/i, '')] ?? null;
  const w = BAUPLAN_ZU_WID.find(([m]) => m.test(roh));
  return w ? BILDER[w[1]] ?? null : null;
}
export const waffenName = (roh: string) => (roh === '?' ? 'Unknown' : bildVon(roh)?.name ?? artVon(roh).name);

/** Das Fach einer Waffe: das Original-Symbol auf der Farbe der Seltenheit; ohne Symbol nur das farbige Fach. */
export function Waffe({ roh, gross = 40 }: { roh: string; gross?: number }) {
  useWiki();
  const echt = roh === '?' ? null : bildVon(roh);
  const [kaputt, setKaputt] = useState(false);
  return (
    <span title={echt?.name ?? artVon(roh).name} className="grid shrink-0 place-items-center overflow-hidden rounded-xl"
      style={{ width: gross, height: gross, background: `linear-gradient(160deg, ${seltenheit(roh)}cc, #0b1220)`, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.14)' }}>
      {echt && !kaputt
        ? <img src={echt.bild} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setKaputt(true)} className="h-[84%] w-[84%] object-contain drop-shadow" draggable={false} />
        : null /* ohne Symbol bleibt das Fach leer - keine Buchstaben-Kuerzel (Betreiber: Bild oder nichts) */}
    </span>
  );
}
