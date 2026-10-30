'use client';

/*
 * Die Spieler in der 2D-Ansicht (Betreiber, 30.10.2026: "wie bei Osirion ... mindestens HP und wie man schiesst ... Loot auch ... Zoom"; danach: Spieler
 * als Pfeil wie in Fortnite, Schild, und ein HUD mit Bildern der Waffen statt Namen).
 *
 * Was das volle Replay dafuer hergibt (tools/replay-voll, ab 30.10.2026):
 *   orte      [Zeit, x, y] je Spieler - schubweise, dazu jeder Einschlag auf ihn und jeder Ort, an dem er Loot aufhebt. Dazwischen laeuft der Pfeil
 *             geradlinig von Ort zu Ort; die durchgehenden Laufwege stecken verschluesselt im Replay.
 *   leben     [Zeit, HP] je Spieler - jeder Wert, auch jeder Sturm-Tick.
 *   hand      [Zeit, Nr in waffenNamen] - was er gerade in der Hand haelt (Bauplan: B_SMG_..., DefaultBuildingTool_C ...).
 *   blick     [Zeit, Yaw] - wohin die Figur schaut, wo das Replay es fuehrt; sonst zeigt der Pfeil in Laufrichtung.
 *   schuesse  [Zeit, Schuetze, x, y, Schaden, Art] - jeder Einschlag: 0 Bauteil/Umgebung, 1 Spieler, 2 Spieler Kopftreffer.
 *   loot      [Zeit, Spieler, Gegenstand, x, y, 1 aufgehoben / 0 fallen gelassen] mit den Namen in lootNamen.
 *   treffer   [Zeit, Schuetze, Ziel, Schaden, Kopf, am Boden, toedlich, auf den Schild].
 * Den Schild selbst fuehrt das Replay nicht (dort immer 0). Er wird geschaetzt: getrunkene Schilde (lange genug in der Hand) heben ihn, Treffer auf den
 * Schild senken ihn, ein Treffer aufs Leben heisst: Schild leer. Die Anzeige sagt das dazu.
 */

import { useMemo, useState, type ReactNode } from 'react';
import T from '@/app/components/T';
import LOOT_BILDER from '@/app/replays/lootBilder.json';

export interface SpielerDaten {
  orte?: Record<string, number[][]>;
  leben?: Record<string, number[][]>;
  hand?: Record<string, number[][]>;
  blick?: Record<string, number[][]>;
  waffenNamen?: string[];
  schuesse?: number[][];
  loot?: number[][];
  lootNamen?: string[];
  treffer?: number[][];
}

/** Wie lange eine Schusslinie stehen bleibt (Sekunden Spielzeit). */
const SCHUSS_DAUER = 1.4;
/** Wie lange ein aufgehobener Gegenstand an der Stelle angezeigt wird. */
const LOOT_DAUER = 5;

/** Der letzte Eintrag mit Zeit <= t (binaere Suche) - Index oder -1. */
function bisIndex(liste: number[][], t: number): number {
  let lo = 0; let hi = liste.length - 1; let r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (liste[m][0] <= t) { r = m; lo = m + 1; } else hi = m - 1; }
  return r;
}

/** Wo ein Spieler zur Zeit t stand: zwischen zwei bekannten Orten geradlinig, nach dem letzten stehend; vor dem ersten unbekannt. Dazu die Laufrichtung. */
export function ortBei(liste: number[][] | undefined, t: number): { x: number; y: number; richtung: number | null; alt: number } | null {
  if (!liste?.length) return null;
  const i = bisIndex(liste, t);
  if (i < 0) return null;
  const a = liste[i]; const b = liste[i + 1];
  const vor = b ?? null; const nach = vor ? a : liste[i - 1];
  const richtung = vor && (vor[1] !== a[1] || vor[2] !== a[2]) ? Math.atan2(vor[2] - a[2], vor[1] - a[1]) * 180 / Math.PI
    : nach && (a[1] !== nach[1] || a[2] !== nach[2]) ? Math.atan2(a[2] - nach[2], a[1] - nach[1]) * 180 / Math.PI : null;
  if (!b) return { x: a[1], y: a[2], richtung, alt: t - a[0] };
  const f = (t - a[0]) / Math.max(0.001, b[0] - a[0]);
  return { x: a[1] + (b[1] - a[1]) * f, y: a[2] + (b[2] - a[2]) * f, richtung, alt: Math.min(t - a[0], b[0] - t) };
}

/** Der letzte Wert vor t. */
function wertBei(liste: number[][] | undefined, t: number): number | null {
  if (!liste?.length) return null;
  const i = bisIndex(liste, t);
  return i < 0 ? null : liste[i][1];
}
export const hpBei = wertBei;

/* ------------------------------------------------------------------ Gegenstaende */

type Art = 'shotgun' | 'ar' | 'smg' | 'pistol' | 'sniper' | 'schildKlein' | 'schild' | 'chug' | 'medkit' | 'bandage' | 'fisch' | 'essen' | 'hacke' | 'bauen'
  | 'edit' | 'granate' | 'schluessel' | 'munition' | 'material' | 'sonst';
const ARTEN: Array<[RegExp, Art, string]> = [
  [/Shotgun|TacSG|VampireStake/i, 'shotgun', 'Shotgun'], [/Assault|Rifle/i, 'ar', 'Assault Rifle'], [/SMG|BoneRattler/i, 'smg', 'SMG'],
  [/HeatSnake|Sniper|Drift/i, 'sniper', 'Sniper'], [/Pistol|Dualies|FiendHunter/i, 'pistol', 'Pistol'],
  [/MiniShield|ShieldSmall/i, 'schildKlein', 'Small Shield'], [/HalfShield|ShieldPot/i, 'schild', 'Shield Potion'], [/ChugJug|AgileChug/i, 'chug', 'Chug'],
  [/Medkit|MedBox/i, 'medkit', 'Med Kit'], [/Bandage/i, 'bandage', 'Bandages'], [/Flopper|Fish|Jelly/i, 'fisch', 'Fish'],
  [/Apple|Pepper|CandyCorn|DuckSnack|Rabbit|Banana|Mushroom/i, 'essen', 'Food'], [/Pickaxe|StarWand|Melee/i, 'hacke', 'Pickaxe'],
  [/BuildingTool/i, 'bauen', 'Build'], [/EditingTool/i, 'edit', 'Edit'], [/Grenade|Stim|ChillBronco|Shockwave/i, 'granate', 'Throwable'],
  [/Key/i, 'schluessel', 'Key'], [/AmmoData/i, 'munition', 'Ammo'], [/^(Wood|Stone|Metal)ItemData|Wads/i, 'material', 'Material'],
];
export function artVon(roh: string): { art: Art; name: string } {
  for (const [m, art, name] of ARTEN) if (m.test(roh)) return { art, name };
  return { art: 'sonst', name: roh.replace(/^(WID|AGID|BP?|Athena)_/i, '').replace(/_?(Athena|Weap|Ore|T0\d|_C)$/gi, '').replace(/_/g, ' ') };
}
/** Seltenheit aus der Kennung: Farbe wie im Spiel. */
export function seltenheit(roh: string): string {
  const m = roh.match(/_(C|UC|R|VR|SR|UR)(?:_|$)/);
  return ({ C: '#6b7280', UC: '#16a34a', R: '#0284c7', VR: '#9333ea', SR: '#d97706', UR: '#d97706' } as Record<string, string>)[m?.[1] ?? ''] ?? '#475569';
}
const istVorrat = (roh: string) => ['munition', 'material'].includes(artVon(roh).art);

/** Eigene Symbole je Art (kein fremdes Bild): weisse Umrisse auf der Farbe der Seltenheit. */
export function Symbol({ art, gross = 28 }: { art: Art; gross?: number }) {
  const p: Record<Art, ReactNode> = {
    shotgun: <><rect x="3" y="12" width="20" height="4" rx="1" /><rect x="22" y="12" width="7" height="3" /><path d="M5 16 l-2 6 h4 l2-6z" /><rect x="11" y="16" width="5" height="2.5" /></>,
    ar: <><rect x="3" y="11" width="22" height="4" rx="1" /><rect x="24" y="12" width="6" height="2" /><path d="M8 15 l-1 7 h3 l1-7z" /><path d="M14 15 l1 6 h2.5 l-1-6z" /><rect x="10" y="8" width="7" height="3" /></>,
    smg: <><rect x="6" y="11" width="17" height="5" rx="1" /><rect x="22" y="12" width="5" height="2.5" /><path d="M10 16 l-1 6 h3 l1-6z" /><path d="M16 16 v6 h2.5 v-6z" /></>,
    pistol: <><rect x="7" y="10" width="16" height="4.5" rx="1" /><path d="M9 14 l-2 8 h4.5 l1.5-8z" /></>,
    sniper: <><rect x="2" y="13" width="26" height="3" rx="1" /><rect x="10" y="9" width="9" height="3" rx="1.5" /><path d="M6 16 l-2 5 h4 l1.5-5z" /></>,
    schildKlein: <><path d="M12 6 h6 v4 l3 4 v9 a2 2 0 0 1 -2 2 h-8 a2 2 0 0 1 -2-2 v-9 l3-4z" /></>,
    schild: <><path d="M12 4 h6 v4 l4 5 v11 a2 2 0 0 1 -2 2 h-10 a2 2 0 0 1 -2-2 v-11 l4-5z" /></>,
    chug: <><ellipse cx="15" cy="17" rx="8" ry="8" /><rect x="12" y="5" width="6" height="5" /></>,
    medkit: <><rect x="5" y="8" width="20" height="15" rx="2" /><path d="M13 11 h4 v3.5 h3.5 v4 h-3.5 v3.5 h-4 v-3.5 h-3.5 v-4 h3.5z" fill="#000" fillOpacity=".55" /></>,
    bandage: <><rect x="6" y="11" width="18" height="8" rx="4" transform="rotate(-30 15 15)" /></>,
    fisch: <><ellipse cx="13" cy="15" rx="9" ry="5" /><path d="M21 15 l6-5 v10z" /></>,
    essen: <><circle cx="15" cy="16" r="8" /><rect x="14" y="5" width="2" height="5" /></>,
    hacke: <><path d="M6 9 q9-6 18 0 l-2 2 q-7-4-14 0z" /><rect x="14" y="9" width="2.5" height="15" rx="1" /></>,
    bauen: <><path d="M6 22 h18 v-8 l-9-7 l-9 7z" /></>,
    edit: <><rect x="6" y="6" width="18" height="18" rx="1" fill="none" stroke="#fff" strokeWidth="2.5" /><rect x="15" y="6" width="9" height="9" /></>,
    granate: <><circle cx="15" cy="17" r="7" /><rect x="13" y="6" width="4" height="5" /></>,
    schluessel: <><circle cx="10" cy="15" r="5" /><rect x="14" y="13.5" width="12" height="3" /><rect x="22" y="16" width="2.5" height="4" /></>,
    munition: <><rect x="8" y="9" width="4" height="13" rx="2" /><rect x="13.5" y="9" width="4" height="13" rx="2" /><rect x="19" y="9" width="4" height="13" rx="2" /></>,
    material: <><rect x="6" y="8" width="18" height="14" rx="1" /></>,
    sonst: <><circle cx="15" cy="15" r="7" /></>,
  };
  return <svg viewBox="0 0 30 30" width={gross} height={gross} fill="#fff" className="block drop-shadow">{p[art]}</svg>;
}

/** Ein Fach im HUD: das Symbol auf der Farbe der Seltenheit, das Gehaltene weiss umrandet. */
/*
 * Echte Bilder der Gegenstaende (Betreiber, 30.10.2026: "Loot hat wirklich echte Bilder"): aus dem Fortnite-Wiki, dessen Seiten die internen Kennungen
 * (WID_...) fuehren - je Kennung nur zugeordnet, wo die Kennung auf der Seite steht (app/replays/lootBilder.json). Der Browser des Besuchers laedt sie;
 * fehlt eins oder laedt es nicht, steht das eigene Symbol da.
 */
const BILDER = LOOT_BILDER as Record<string, { name: string; bild: string }>;
const BAUPLAN_ZU_WID: Array<[RegExp, string]> = [
  [/MiniShield/i, 'WID_Paprika_ShieldSmall'], [/HalfShield/i, 'WID_Paprika_ShieldPot'], [/ConsumableSmall_Medkit/i, 'WID_Paprika_MedBox'],
  [/ConsumableSmall_Bandages/i, 'WID_Paprika_Bandage'], [/ArcadeWeaponShotgun/i, 'WID_ArcadeShotgun'], [/Assault_Heavy/i, 'WID_Assault_Heavy_Athena'],
  [/B_Shotgun_Standard/i, 'WID_Shotgun_Standard_Athena'], [/CrimsonMist/i, 'WID_CrimsonMist_TacSG'], [/FiendHunter/i, 'WID_Athena_FiendHunter_Dualies'],
  [/Pistol_Muster/i, 'WID_Pistol_Muster_S39_Athena'], [/VampireStake/i, 'WID_VampireStake_Shotgun'], [/ShieldFlopper/i, 'WID_Athena_Flopper_Shield'],
  [/JellyFish/i, 'WID_Athena_Flopper_JellyFish'], [/DuckSnacks/i, 'WID_DuckSnacks'], [/B_Apple/i, 'WID_Athena_Apple'], [/B_Pepper/i, 'WID_Athena_Pepper'],
  [/CandyCorn/i, 'WID_Athena_CandyCorn'], [/HappyGhost/i, 'WID_Athena_HappyGhost'], [/WitchBroom/i, 'WID_Athena_WitchBroom_Durability'],
  [/FloppingRabbit.*HighTier/i, 'WID_Athena_FloppingRabbit_HighTier'], [/FloppingRabbit/i, 'WID_Athena_FloppingRabbit'],
];
export function bildVon(roh: string): { name: string; bild: string } | null {
  if (/^(WID|AGID)_/i.test(roh)) {
    return BILDER[roh] ?? BILDER[roh.replace(/_(C|UC|R|VR|SR|UR|X)(_Ore_T0\d|_T0\d)?$/i, '').replace(/_Ore_T0\d$/i, '')] ?? null;
  }
  const w = BAUPLAN_ZU_WID.find(([m]) => m.test(roh));
  return w ? BILDER[w[1]] ?? null : null;
}

function Fach({ roh, aktiv, gross = 40 }: { roh: string; aktiv?: boolean; gross?: number }) {
  const { art, name } = artVon(roh);
  const echt = bildVon(roh);
  const [kaputt, setKaputt] = useState(false);
  return (
    <span title={echt?.name ?? name} className="grid place-items-center overflow-hidden rounded-md" style={{
      width: gross, height: gross, background: `linear-gradient(180deg, ${seltenheit(roh)}, #0b1220)`,
      boxShadow: aktiv ? '0 0 0 2px #fff, 0 0 10px rgba(255,255,255,.5)' : 'inset 0 0 0 1px rgba(255,255,255,.18)',
    }}>
      {echt && !kaputt
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={echt.bild} alt={echt.name} loading="lazy" referrerPolicy="no-referrer" onError={() => setKaputt(true)} className="h-[86%] w-[86%] object-contain drop-shadow" draggable={false} />
        : <Symbol art={art} gross={Math.round(gross * 0.72)} />}
    </span>
  );
}

/* ------------------------------------------------------------------ Aufbereiten */

const SCHILD_GEBEN: Array<[RegExp, number, number, number]> = [
  // Bauplan, Sekunden in der Hand bis getrunken, Schild dazu, hoechstens bis
  [/MiniShield|ShieldSmall/i, 1.8, 25, 50], [/HalfShield|ShieldPot/i, 4.5, 50, 100], [/ShieldFlopper|Flopper_Shield/i, 1.0, 50, 100],
  [/ChugJug/i, 8, 100, 100], [/AgileChug/i, 2, 50, 100],
];

/** Geschaetzter Schild je Spieler [Zeit, Schild] - siehe Kopf der Datei. */
function schildSchaetzen(id: number, hand: number[][], namen: string[], treffer: number[][]): number[][] {
  const ereignisse: Array<[number, number, number]> = []; // [Zeit, Art (1 dazu, 2 Schild-Treffer, 3 Treffer aufs Leben), Wert/Grenze]
  const grenzen = new Map<number, number>();
  for (let i = 0; i < hand.length; i += 1) {
    const roh = namen[hand[i][1]] ?? '';
    const g = SCHILD_GEBEN.find(([m]) => m.test(roh));
    if (!g) continue;
    const ende = hand[i + 1]?.[0] ?? hand[i][0];
    if (ende - hand[i][0] >= g[1]) { ereignisse.push([hand[i][0] + g[1], 1, g[2]]); grenzen.set(ereignisse.length - 1, g[3]); }
  }
  for (const h of treffer) if (h[2] === id) ereignisse.push([h[0], h[7] ? 2 : 3, h[3]]);
  ereignisse.sort((a, b) => a[0] - b[0]);
  const raus: number[][] = [[0, 0]];
  let s = 0;
  ereignisse.forEach((e, k) => {
    if (e[1] === 1) { const grenze = grenzen.get(k) ?? 100; if (s < grenze) s = Math.min(grenze, s + e[2]); }
    else if (e[1] === 2) s = Math.max(0, s - e[2]);
    else s = 0;
    raus.push([e[0], Math.round(s)]);
  });
  return raus;
}

/** Die Daten einmal sortiert - die Replays bringen sie nach Lesereihenfolge. */
export function useSpielerDaten(m: SpielerDaten) {
  return useMemo(() => {
    const sortiert = (r?: Record<string, number[][]>) => new Map(Object.entries(r ?? {}).map(([k, v]) => [Number(k), [...v].sort((a, b) => a[0] - b[0])]));
    const hand = sortiert(m.hand);
    const waffenNamen = m.waffenNamen ?? [];
    const treffer = [...(m.treffer ?? [])].sort((a, b) => a[0] - b[0]);
    const mitSchild = treffer.some((h) => h.length > 7);
    const schild = new Map<number, number[][]>();
    if (mitSchild) for (const [id, l] of hand) schild.set(id, schildSchaetzen(id, l, waffenNamen, treffer));
    return {
      orte: sortiert(m.orte), leben: sortiert(m.leben), hand, blick: sortiert(m.blick), waffenNamen, schild,
      schuesse: [...(m.schuesse ?? [])].sort((a, b) => a[0] - b[0]),
      loot: [...(m.loot ?? [])].sort((a, b) => a[0] - b[0]),
      namen: m.lootNamen ?? [],
      da: Boolean(m.orte && Object.keys(m.orte).length),
    };
  }, [m.orte, m.leben, m.hand, m.blick, m.waffenNamen, m.schuesse, m.loot, m.lootNamen, m.treffer]);
}
export type Aufbereitet = ReturnType<typeof useSpielerDaten>;

/** Die Eintraege einer nach Zeit sortierten Liste zwischen a und b. */
function zwischen(liste: number[][], a: number, b: number): number[][] {
  const bis = bisIndex(liste, b);
  const raus: number[][] = [];
  for (let i = bis; i >= 0 && liste[i][0] > a; i -= 1) raus.push(liste[i]);
  return raus;
}

/** Was ein Spieler zur Zeit t bei sich hat (aufgehoben minus fallen gelassen) und was er in der Hand haelt. */
function ausruestung(d: Aufbereitet, id: number, zeit: number) {
  const bestand = new Map<string, number>();
  for (const l of d.loot) {
    if (l[0] > zeit) break;
    if (l[1] !== id) continue;
    const roh = d.namen[l[2]] ?? '';
    bestand.set(roh, (bestand.get(roh) ?? 0) + (l[5] === 1 ? 1 : -1));
  }
  const faecher = [...bestand.entries()].filter(([roh, n]) => n > 0 && !istVorrat(roh)).map(([roh]) => roh);
  const handNr = wertBei(d.hand.get(id), zeit);
  const hand = handNr === null ? null : d.waffenNamen[handNr] ?? null;
  return { faecher, hand, handArt: hand ? artVon(hand).art : null };
}

/** Schild- und Lebensbalken wie im Spiel: blau oben, gruen unten, mit Zahl. */
function Balken({ hp, schild, schmal }: { hp: number | null; schild: number | null; schmal?: boolean }) {
  const h = schmal ? 5 : 13;
  const zeile = (wert: number, farbe: string) => (
    <div className="relative overflow-hidden rounded-sm bg-black/70" style={{ height: h }}>
      <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, wert))}%`, background: farbe }} />
      {!schmal && <span className="absolute inset-0 pl-1 text-[9px] font-black leading-[13px] text-white" style={{ textShadow: '0 0 2px #000' }}>{Math.round(wert)}/100</span>}
    </div>
  );
  return (
    <div className="grid gap-[2px]">
      {schild !== null && zeile(schild, '#3b82f6')}
      {zeile(hp ?? 0, '#65a30d')}
    </div>
  );
}

/* ------------------------------------------------------------------ Karte */

interface EbeneProps {
  d: Aufbereitet; zeit: number;
  spieler: Array<{ id: number; name: string; tod?: number | null; team?: number }>;
  pzx: (v: number) => number; pzy: (v: number) => number;
  farbeVon: (id?: number) => string; sichtbar: (id?: number) => boolean;
  gewaehlt: number | null; waehle: (id: number | null) => void; namenZeigen: boolean;
}

/** Spieler als Pfeil wie in Fortnite (Blick- oder Laufrichtung), darueber Schild und Leben - als HTML ueber der Karte, gegen den Zoom gegengerechnet. */
export function SpielerPunkte({ d, zeit, spieler, pzx, pzy, farbeVon, sichtbar, gewaehlt, waehle, namenZeigen }: EbeneProps) {
  if (!d.da) return null;
  return (
    <>
      {spieler.map((s) => {
        if (typeof s.tod === 'number' && s.tod <= zeit) return null;
        const o = ortBei(d.orte.get(s.id), zeit);
        if (!o) return null;
        const hp = hpBei(d.leben.get(s.id), zeit);
        const schild = d.schild.size ? wertBei(d.schild.get(s.id), zeit) ?? 0 : null;
        const blick = d.blick.get(s.id);
        const bi = blick ? bisIndex(blick, zeit) : -1;
        const winkel = bi >= 0 && zeit - blick![bi][0] < 6 ? blick![bi][1] : o.richtung ?? 0;
        const an = s.id === gewaehlt;
        const handNr = wertBei(d.hand.get(s.id), zeit);
        const hand = handNr === null ? null : d.waffenNamen[handNr];
        return (
          <button key={s.id} type="button" data-marker onClick={() => waehle(an ? null : s.id)} aria-label={s.name}
            className="absolute z-20 block border-0 bg-transparent p-1"
            style={{ left: `${pzx(o.x)}%`, top: `${pzy(o.y)}%`, transform: `translate(-50%, -50%) scale(calc(${an ? 1.35 : 1} / var(--z, 1)))`, opacity: sichtbar(s.id) ? 1 : 0.45 }}>
            <span className="relative block">
              <span className="absolute left-1/2 -translate-x-1/2" style={{ bottom: 'calc(100% + 3px)', width: 34 }}>
                <Balken hp={hp} schild={schild} schmal />
              </span>
              <svg viewBox="0 0 20 20" width={26} height={26} className="block" style={{ transform: `rotate(${winkel}deg)`, filter: an ? 'drop-shadow(0 0 4px #fff)' : 'drop-shadow(0 1px 1px #000)' }}>
                <path d="M18 10 L3 3 L6.5 10 L3 17 Z" fill={farbeVon(s.id)} stroke={an ? '#fff' : '#000'} strokeWidth="2" strokeLinejoin="round" />
              </svg>
              {(namenZeigen || an) && (
                <span className="pointer-events-none absolute left-1/2 top-full mt-0.5 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded bg-black/80 px-1.5 py-px text-[11px] font-bold leading-tight text-white">
                  {hand && <Symbol art={artVon(hand).art} gross={14} />}{s.name}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </>
  );
}

/** Schuesse der letzten Augenblicke: Linie vom Schuetzen zum Einschlag, Schaden an der Stelle; dazu frisch aufgehobener Loot als Symbol. */
export function SchussEbene({ d, zeit, pzx, pzy, sichtbar, gewaehlt }: Pick<EbeneProps, 'd' | 'zeit' | 'pzx' | 'pzy' | 'sichtbar' | 'gewaehlt'>) {
  if (!d.da) return null;
  const jetzt = zwischen(d.schuesse, zeit - SCHUSS_DAUER, zeit);
  const loot = zwischen(d.loot, zeit - LOOT_DAUER, zeit).filter((l) => l[5] === 1 && !istVorrat(d.namen[l[2]] ?? ''));
  return (
    <>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 z-[15] h-full w-full">
        {jetzt.map((s, i) => {
          if (!sichtbar(s[1]) && gewaehlt === null) return null;
          /*
           * Die Linie endet am Einschlag. Wo der Schuetze stand, ist nur nahe an einem bekannten Ort sicher (Betreiber, 30.10.2026: "Schussrichtungen
           * duerfen nur bis zum Gegner gehen, nicht durch die ganze Map"): ist sein Ort aelter als 3 s oder liegt er weiter als 120 m weg, steht nur ein
           * kurzer Strich (12 m) in Richtung des vermuteten Schuetzen; Treffer auf Bauteile dann gar nicht.
           */
          const ort = ortBei(d.orte.get(s[1]), s[0]);
          if (!ort) return null;
          const dx = ort.x - s[2]; const dy = ort.y - s[3]; const weit = Math.hypot(dx, dy);
          const sicher = ort.alt <= 3 && weit <= 12_000;
          if (!sicher && s[5] === 0) return null;
          const lang = sicher ? weit : Math.min(weit, 1_200);
          const von = { x: s[2] + (weit ? (dx / weit) * lang : 0), y: s[3] + (weit ? (dy / weit) * lang : 0) };
          const alter = (zeit - s[0]) / SCHUSS_DAUER;
          const farbe = s[5] === 2 ? '#facc15' : s[5] === 1 ? '#f87171' : '#e2e8f0';
          return (
            <line key={i} x1={pzx(von.x)} y1={pzy(von.y)} x2={pzx(s[2])} y2={pzy(s[3])} stroke={farbe}
              strokeOpacity={(s[5] ? 0.95 : 0.4) * (1 - alter * 0.8)} strokeWidth={s[5] ? 1.6 : 0.9} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
          );
        })}
      </svg>
      {jetzt.filter((s) => s[5] > 0).map((s, i) => (
        <span key={`z${i}`} className="pointer-events-none absolute z-30 font-black tabular-nums"
          style={{
            left: `${pzx(s[2])}%`, top: `${pzy(s[3])}%`, fontSize: 11, color: s[5] === 2 ? '#facc15' : '#fff', textShadow: '0 0 3px #000, 0 0 2px #000',
            transform: `translate(-50%, calc(-100% - ${((zeit - s[0]) / SCHUSS_DAUER) * 14}px)) scale(calc(1 / var(--z, 1)))`, opacity: 1 - (zeit - s[0]) / SCHUSS_DAUER,
          }}>{s[4]}</span>
      ))}
      {loot.map((l, i) => (
        <span key={`l${i}`} className="pointer-events-none absolute z-[25]"
          style={{ left: `${pzx(l[3])}%`, top: `${pzy(l[4])}%`, transform: 'translate(-50%, 40%) scale(calc(1 / var(--z, 1)))', opacity: 1 - (zeit - l[0]) / LOOT_DAUER }}>
          <Fach roh={d.namen[l[2]] ?? ''} gross={26} />
        </span>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ HUD */

/** Das HUD des gewaehlten Spielers wie im Spiel: Name, Schild, Leben, die Faecher mit Bildern, das Gehaltene umrandet. */
export function SpielerFenster({ d, zeit, s, farbe, schliessen }: { d: Aufbereitet; zeit: number; s: { id: number; name: string; tod?: number | null; kills?: number }; farbe: string; schliessen: () => void }) {
  const tot = typeof s.tod === 'number' && s.tod <= zeit;
  const hp = tot ? 0 : hpBei(d.leben.get(s.id), zeit);
  const schild = tot ? 0 : d.schild.size ? wertBei(d.schild.get(s.id), zeit) ?? 0 : null;
  const { faecher, hand } = ausruestung(d, s.id, zeit);
  const handArt = hand ? artVon(hand).art : null;
  const meine = d.schuesse.filter((x) => x[1] === s.id && x[5] > 0 && x[0] <= zeit);
  return (
    <div className="rounded-xl border border-white/10 bg-black/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 text-lg font-black text-white">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: farbe }} />
          <span className="truncate">{s.name}</span>
          {tot && <span className="text-xs font-bold uppercase text-rose-400"><T>Ausgeschieden</T></span>}
        </p>
        <button type="button" onClick={schliessen} className="rounded-md px-2 text-lg leading-none text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Close">×</button>
      </div>
      <div className="mt-2"><Balken hp={hp} schild={schild} /></div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {faecher.map((roh) => <Fach key={roh} roh={roh} aktiv={handArt !== null && artVon(roh).art === handArt} />)}
        {(handArt === 'bauen' || handArt === 'edit' || handArt === 'hacke') && hand && <Fach roh={hand} aktiv />}
        {!faecher.length && !hand && <span className="text-xs text-slate-500"><T>Noch nichts aufgehoben.</T></span>}
      </div>
      <p className="mt-2.5 text-[11px] text-slate-400">
        <T>Treffer</T> <b className="tabular-nums text-slate-100">{meine.length}</b> · Damage <b className="tabular-nums text-slate-100">{Math.round(meine.reduce((a, x) => a + x[4], 0))}</b> · <T>Kopftreffer</T> <b className="tabular-nums text-slate-100">{meine.filter((x) => x[5] === 2).length}</b>
      </p>
      {schild !== null && <p className="mt-1 text-[10px] text-slate-500"><T>Schild geschätzt aus getrunkenen Schilden und Schild-Treffern - das Replay führt ihn nicht.</T></p>}
    </div>
  );
}

/** Alle Lebenden mit Schild, Leben und dem Gehaltenen - antippen waehlt den Spieler. */
export function AlleSpieler({ d, zeit, spieler, farbeVon, waehle }: { d: Aufbereitet; zeit: number; spieler: Array<{ id: number; name: string; tod?: number | null }>; farbeVon: (id?: number) => string; waehle: (id: number) => void }) {
  if (!d.da) return null;
  const lebend = spieler.filter((s) => !(typeof s.tod === 'number' && s.tod <= zeit) && d.orte.has(s.id));
  return (
    <div className="max-h-[360px] overflow-y-auto p-1.5">
      <p className="px-1.5 pb-1.5 text-[11px] text-slate-400"><T>Spieler antippen - auf der Karte oder hier.</T></p>
      <div className="grid grid-cols-2 gap-1.5">
        {lebend.map((s) => {
          const handNr = wertBei(d.hand.get(s.id), zeit);
          const hand = handNr === null ? null : d.waffenNamen[handNr];
          return (
            <button key={s.id} type="button" onClick={() => waehle(s.id)} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-black/30 p-1.5 text-left transition hover:border-sky-500/60">
              {hand ? <Fach roh={hand} gross={26} /> : <span className="h-[26px] w-[26px] rounded-md bg-white/5" />}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 truncate text-[11px] font-bold text-slate-100"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: farbeVon(s.id) }} />{s.name}</span>
                <span className="mt-1 block"><Balken hp={hpBei(d.leben.get(s.id), zeit)} schild={d.schild.size ? wertBei(d.schild.get(s.id), zeit) ?? 0 : null} schmal /></span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Das HUD unten in der Karte wie bei Osirion: Steuerung, Name, Schild und Leben breit mit Zahl, die Faecher mit Bildern. */
export function KartenHud({ d, zeit, s, farbe, steuerung }: { d: Aufbereitet; zeit: number; s: { id: number; name: string; tod?: number | null } | null; farbe: string; steuerung: ReactNode }) {
  const tot = s ? typeof s.tod === 'number' && s.tod <= zeit : false;
  const hp = s ? (tot ? 0 : hpBei(d.leben.get(s.id), zeit)) : null;
  const schild = s ? (tot ? 0 : d.schild.size ? wertBei(d.schild.get(s.id), zeit) ?? 0 : null) : null;
  const aus = s ? ausruestung(d, s.id, zeit) : null;
  return (
    <div className="pointer-events-auto absolute bottom-2 left-1/2 z-40 w-[min(560px,calc(100%-16px))] -translate-x-1/2 rounded-lg border border-white/15 bg-black/75 p-1.5 text-white shadow-2xl backdrop-blur-sm" data-knopf>
      {steuerung}
      {s && aus && (
        <>
          <p className="mt-1.5 flex items-center gap-2 rounded bg-white/10 px-2 py-1 text-base font-bold leading-tight">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: farbe }} />
            <span className="truncate">{s.name}</span>
            {tot && <span className="ml-auto text-[10px] font-bold uppercase text-rose-400"><T>Ausgeschieden</T></span>}
          </p>
          <div className="mt-1"><Balken hp={hp} schild={schild} /></div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {aus.faecher.map((roh) => <Fach key={roh} roh={roh} gross={44} aktiv={aus.handArt !== null && artVon(roh).art === aus.handArt} />)}
            {(aus.handArt === 'bauen' || aus.handArt === 'edit' || aus.handArt === 'hacke') && aus.hand && <Fach roh={aus.hand} gross={44} aktiv />}
          </div>
        </>
      )}
    </div>
  );
}
