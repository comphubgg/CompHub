import SPIEL_SYMBOL_TABELLE from './spielSymbole.json';

/*
 * Name und Spiel-Symbol einer Waffe aus dem Bauplan im Replay (B_Shotgun_CoreDPS_Athena_Weap_C) - dieselbe Zuordnung wie auf main
 * (app/replays/SpielerEbene.tsx bildVon): zuerst die von Hand gepruefte Liste, dann die 200 Gegenstaende aller fortnite.gg-Pools
 * (spielSymbole.json, Kopie von main app/replays/spielSymbole.json; Bilder unter /waffen), zuletzt das Fortnite-Wiki (/api/waffen-bilder).
 */
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
  [/GraftedCrunchy/i, "Zoro's Three Sword Style", 't_icon_weapons_sword_graftedcrunchy_mouth_ui_l'],
  [/Stimpulse|Shockwave_Athena_STim/i, 'Overdrive Grenade', 't_icon_br_gadget_stimpulsegrenade_l'],
  [/HeatSnake/i, "Rebecca's Guns", 't_icon_weapons_heatsnake_l'],
  [/HappyGhost/i, 'Harpoon Gun', 't-icon-weapons-happyghostgun-l'],
];
/** Nur das Symbol ist sicher (liegt unter /waffen), der Name nicht - dann bleibt der Name aus dem Bauplan. */
const NUR_BILD: Array<[RegExp, string]> = [[/Pistol_Vigilante/i, 't-icon-weapons-sk-vigilante-l']];
export const kern = (s: string) => s.replace(/^(B|BP|WID|WMID|AGID|CID)_/i, '').replace(/_C$/i, '').replace(/_(C|UC|R|VR|SR|UR|X|XR|Exotic)(_Ore_T0\d|_T0\d)?$/i, '')
  .split('_').filter((t) => t && !/^(athena|weap|weapon|child|held|spytech|figment)$/i.test(t)).join('_').toLowerCase();
const SYMBOLE = SPIEL_SYMBOL_TABELLE as unknown as Record<string, [string, string]>;

/** Lesbarer Ersatzname aus dem Bauplan, wenn keine Quelle ihn kennt. */
const ersatz = (roh: string) => roh.replace(/^(WID|AGID|BP?|Athena)_/i, '').replace(/_?(Athena|Weap|Ore|T0\d|C)$/gi, '').replace(/_?(Athena|Weap)_?/gi, ' ').replace(/_/g, ' ').trim();

export function waffeVon(roh: string, wiki?: Map<string, { name: string; bild: string }>): { name: string; bild: string | null } {
  const s = SPIEL_SYMBOLE.find(([m]) => m.test(roh));
  if (s) return { name: s[1], bild: `/waffen/${s[2]}.webp` };
  // Auch ohne angehaengte Ziffer ("Assault_Chrono_Pan_Rifle2" ist dieselbe Waffe wie "Assault_Chrono_Pan_Rifle").
  for (const k of [kern(roh), kern(roh).replace(/\d+$/, '')]) {
    const t = SYMBOLE[k];
    if (t) return { name: t[0], bild: `/waffen/${t[1]}.webp` };
    const w = wiki?.get(k);
    if (w) return w;
  }
  const nurBild = NUR_BILD.find(([m]) => m.test(roh));
  return { name: ersatz(roh), bild: nurBild ? `/waffen/${nurBild[1]}.webp` : null };
}

/** Bild nach dem Anzeigenamen (fuer Waffen ohne Bauplan, z. B. aus dem Fortnite Wiki): eigene Symbole, dann /api/waffen-bilder. */
let nachName: Map<string, string> | null = null;
const nameKey = (n: string) => n.toLowerCase().replace(/[^a-z0-9]/g, '');
export function bildNachName(name: string, wiki?: Map<string, { name: string; bild: string }>): string | null {
  if (!nachName) {
    nachName = new Map();
    for (const [, n, b] of SPIEL_SYMBOLE) nachName.set(nameKey(n), `/waffen/${b}.webp`);
    for (const [n, b] of Object.values(SYMBOLE)) if (!nachName.has(nameKey(n))) nachName.set(nameKey(n), `/waffen/${b}.webp`);
  }
  const k = nameKey(name);
  const eigen = nachName.get(k);
  if (eigen) return eigen;
  for (const v of wiki?.values() ?? []) if (nameKey(v.name) === k) return v.bild;
  return null;
}
