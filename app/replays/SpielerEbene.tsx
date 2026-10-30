'use client';

/*
 * Die Spieler in der 2D-Ansicht (Betreiber, 30.10.2026: "wie bei Osirion ... mindestens HP und wie man schiesst ... Loot auch ... Zoom").
 *
 * Was das volle Replay dafuer hergibt (tools/replay-voll, ab 30.10.2026):
 *   orte      [Zeit, x, y] je Spieler - schubweise, dazu jeder Einschlag auf ihn und jeder Ort, an dem er Loot aufhebt. Dazwischen laeuft der Punkt
 *             geradlinig von Ort zu Ort; die durchgehenden Laufwege stecken verschluesselt im Replay.
 *   leben     [Zeit, HP] je Spieler - jeder Wert, auch jeder Sturm-Tick. Den Schild fuehrt das Replay nicht (dort immer 0).
 *   schuesse  [Zeit, Schuetze, x, y, Schaden, Art] - jeder Einschlag: 0 Bauteil/Umgebung, 1 Spieler, 2 Spieler Kopftreffer.
 *   loot      [Zeit, Spieler, Gegenstand, x, y, 1 aufgehoben / 0 fallen gelassen] mit den Namen in lootNamen.
 */

import { useMemo } from 'react';
import T from '@/app/components/T';

export interface SpielerDaten {
  orte?: Record<string, number[][]>;
  leben?: Record<string, number[][]>;
  schuesse?: number[][];
  loot?: number[][];
  lootNamen?: string[];
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

/** Wo ein Spieler zur Zeit t stand: zwischen zwei bekannten Orten geradlinig, nach dem letzten stehend; vor dem ersten unbekannt. */
export function ortBei(liste: number[][] | undefined, t: number): { x: number; y: number; alt: number } | null {
  if (!liste?.length) return null;
  const i = bisIndex(liste, t);
  if (i < 0) return null;
  const a = liste[i]; const b = liste[i + 1];
  if (!b) return { x: a[1], y: a[2], alt: t - a[0] };
  const f = (t - a[0]) / Math.max(0.001, b[0] - a[0]);
  return { x: a[1] + (b[1] - a[1]) * f, y: a[2] + (b[2] - a[2]) * f, alt: Math.min(t - a[0], b[0] - t) };
}

/** Lebenspunkte zur Zeit t (der letzte Wert davor). */
export function hpBei(liste: number[][] | undefined, t: number): number | null {
  if (!liste?.length) return null;
  const i = bisIndex(liste, t);
  return i < 0 ? null : liste[i][1];
}

const NAMEN: Array<[RegExp, string]> = [
  [/AmmoDataBulletsLight/i, 'Light Ammo'], [/AmmoDataBulletsMedium/i, 'Medium Ammo'], [/AmmoDataBulletsHeavy/i, 'Heavy Ammo'], [/AmmoDataShells/i, 'Shells'],
  [/AmmoDataRockets/i, 'Rockets'], [/^WoodItemData/i, 'Wood'], [/^StoneItemData/i, 'Brick'], [/^MetalItemData/i, 'Metal'],
  [/ShieldPot/i, 'Shield Potion'], [/ShieldSmall/i, 'Small Shield Potion'], [/Bandage/i, 'Bandages'], [/MedBox|Medkit/i, 'Med Kit'], [/ChugJug/i, 'Chug Jug'],
  [/Flopper_Shield/i, 'Shield Fish'], [/Flopper_JellyFish/i, 'Jellyfish'], [/Flopper_Effective/i, 'Flopper'], [/Flopper$/i, 'Flopper'], [/WadsItemData/i, 'Gold'],
  [/Pistol_Muster/i, 'Pistol'], [/ArcadeShotgun/i, 'Arcade Shotgun'], [/CrimsonMist_TacSG/i, 'Tactical Shotgun'], [/Shotgun_Standard/i, 'Pump Shotgun'],
  [/VampireStake_Shotgun/i, 'Stake Shotgun'], [/Assault_AutoHigh/i, 'Assault Rifle'], [/Assault_Heavy/i, 'Heavy Assault Rifle'], [/SMG_BoneRattler/i, 'SMG'],
  [/HeatSnake_Drift/i, 'Sniper'], [/FiendHunter_Dualies/i, 'Dual Pistols'], [/WitchBroom/i, 'Witch Broom'], [/ChillBronco/i, 'Chill Bronco'], [/Stimpulse/i, 'Stim Pulse'],
  [/AgileChug/i, 'Agile Chug'], [/DuckSnacks/i, 'Duck Snacks'], [/FloppingRabbit/i, 'Flopping Rabbit'], [/Apple/i, 'Apple'], [/Pepper/i, 'Pepper'],
  [/CandyCorn/i, 'Candy Corn'], [/HappyGhost/i, 'Happy Ghost'], [/DentRemover/i, 'Dent Remover'], [/VaultKey|SkeletonKey|Vault_Access/i, 'Key'],
];

/** Lesbarer Name eines Gegenstands aus seiner Kennung (WID_Assault_AutoHigh_Athena_R_Ore_T03 -> Assault Rifle). */
export function gegenstandName(roh: string): string {
  for (const [m, n] of NAMEN) if (m.test(roh)) return n;
  return roh.replace(/^(WID|AGID|Athena)_/i, '').replace(/_?(Athena|Ore|T0\d|S\d\d|Durability|HighTier)/gi, '').replace(/_(C|UC|R|VR|SR|UR|X)$/i, '')
    .replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim() || roh;
}

/** Seltenheit aus der Kennung: Farbe wie im Spiel. */
export function seltenheit(roh: string): string {
  const m = roh.match(/_(C|UC|R|VR|SR|UR)(?:_|$)/);
  return ({ C: '#9ca3af', UC: '#4ade80', R: '#38bdf8', VR: '#c084fc', SR: '#fbbf24', UR: '#fbbf24' } as Record<string, string>)[m?.[1] ?? ''] ?? '#cbd5e1';
}
const istMunition = (roh: string) => /AmmoData|ItemData$|WadsItemData/i.test(roh) && !/^WID_/i.test(roh);

/** Die Daten einmal sortiert - die Replays bringen sie nach Lesereihenfolge. */
export function useSpielerDaten(m: SpielerDaten) {
  return useMemo(() => {
    const sortiert = (r?: Record<string, number[][]>) => new Map(Object.entries(r ?? {}).map(([k, v]) => [Number(k), [...v].sort((a, b) => a[0] - b[0])]));
    return {
      orte: sortiert(m.orte), leben: sortiert(m.leben),
      schuesse: [...(m.schuesse ?? [])].sort((a, b) => a[0] - b[0]),
      loot: [...(m.loot ?? [])].sort((a, b) => a[0] - b[0]),
      namen: m.lootNamen ?? [],
      da: Boolean(m.orte && Object.keys(m.orte).length),
    };
  }, [m.orte, m.leben, m.schuesse, m.loot, m.lootNamen]);
}
export type Aufbereitet = ReturnType<typeof useSpielerDaten>;

/** Die Eintraege einer nach Zeit sortierten Liste zwischen a und b. */
function zwischen(liste: number[][], a: number, b: number): number[][] {
  const bis = bisIndex(liste, b);
  const raus: number[][] = [];
  for (let i = bis; i >= 0 && liste[i][0] > a; i -= 1) raus.push(liste[i]);
  return raus;
}

interface EbeneProps {
  d: Aufbereitet; zeit: number;
  spieler: Array<{ id: number; name: string; tod?: number | null; team?: number }>;
  pzx: (v: number) => number; pzy: (v: number) => number;
  farbeVon: (id?: number) => string; sichtbar: (id?: number) => boolean;
  gewaehlt: number | null; waehle: (id: number | null) => void; namenZeigen: boolean;
}

/** Spieler als Punkte mit Lebensbalken, Name ab etwas Zoom - als HTML ueber der Karte (gegen den Zoom gegengerechnet wie die anderen Zeichen). */
export function SpielerPunkte({ d, zeit, spieler, pzx, pzy, farbeVon, sichtbar, gewaehlt, waehle, namenZeigen }: EbeneProps) {
  if (!d.da) return null;
  return (
    <>
      {spieler.map((s) => {
        if (typeof s.tod === 'number' && s.tod <= zeit) return null;
        const o = ortBei(d.orte.get(s.id), zeit);
        if (!o) return null;
        const hp = hpBei(d.leben.get(s.id), zeit);
        const an = s.id === gewaehlt;
        const blass = !sichtbar(s.id);
        return (
          <button key={s.id} type="button" data-marker onClick={() => waehle(an ? null : s.id)} aria-label={s.name}
            className="absolute z-20 block border-0 bg-transparent p-0"
            style={{ left: `${pzx(o.x)}%`, top: `${pzy(o.y)}%`, transform: 'translate(-50%, -50%) scale(calc(1 / var(--z, 1)))', opacity: blass ? 0.18 : 1 }}>
            <span className="relative block">
              <span className="block rounded-full border-2" style={{ width: an ? 16 : 11, height: an ? 16 : 11, background: farbeVon(s.id), borderColor: an ? '#fff' : '#000', boxShadow: an ? '0 0 0 3px rgba(255,255,255,.35)' : undefined }} />
              {hp !== null && (
                <span className="absolute left-1/2 block -translate-x-1/2 overflow-hidden rounded-sm bg-black/80" style={{ top: -7, width: 20, height: 4 }}>
                  <span className="block h-full" style={{ width: `${Math.max(0, Math.min(100, hp))}%`, background: hp > 50 ? '#4ade80' : hp > 25 ? '#facc15' : '#f87171' }} />
                </span>
              )}
              {(namenZeigen || an) && (
                <span className="pointer-events-none absolute left-1/2 top-full mt-0.5 -translate-x-1/2 whitespace-nowrap rounded bg-black/75 px-1 text-[9px] font-bold leading-tight text-white">{s.name}</span>
              )}
            </span>
          </button>
        );
      })}
    </>
  );
}

/** Schuesse der letzten Augenblicke: Linie vom Schuetzen zum Einschlag, Schaden an der Stelle; dazu frisch aufgehobener Loot. */
export function SchussEbene({ d, zeit, pzx, pzy, sichtbar, gewaehlt }: Pick<EbeneProps, 'd' | 'zeit' | 'pzx' | 'pzy' | 'sichtbar' | 'gewaehlt'>) {
  if (!d.da) return null;
  const jetzt = zwischen(d.schuesse, zeit - SCHUSS_DAUER, zeit);
  const loot = zwischen(d.loot, zeit - LOOT_DAUER, zeit).filter((l) => l[5] === 1 && !istMunition(d.namen[l[2]] ?? ''));
  return (
    <>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 z-[15] h-full w-full">
        {jetzt.map((s, i) => {
          if (!sichtbar(s[1]) && gewaehlt === null) return null;
          const von = ortBei(d.orte.get(s[1]), s[0]);
          if (!von) return null;
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
      {loot.map((l, i) => {
        const roh = d.namen[l[2]] ?? '';
        return (
          <span key={`l${i}`} className="pointer-events-none absolute z-[25] whitespace-nowrap rounded border px-1 text-[9px] font-bold leading-tight"
            style={{ left: `${pzx(l[3])}%`, top: `${pzy(l[4])}%`, transform: 'translate(-50%, 60%) scale(calc(1 / var(--z, 1)))', borderColor: seltenheit(roh), color: seltenheit(roh), background: 'rgba(0,0,0,.72)', opacity: 1 - (zeit - l[0]) / LOOT_DAUER }}>
            {gegenstandName(roh)}
          </span>
        );
      })}
    </>
  );
}

/** Der gewaehlte Spieler: Lebenspunkte, was er bei sich hat (aufgehoben minus fallen gelassen), seine letzten Treffer. */
export function SpielerFenster({ d, zeit, s, farbe, schliessen }: { d: Aufbereitet; zeit: number; s: { id: number; name: string; tod?: number | null; kills?: number }; farbe: string; schliessen: () => void }) {
  const hp = hpBei(d.leben.get(s.id), zeit);
  const tot = typeof s.tod === 'number' && s.tod <= zeit;
  // Inventar: jeder aufgehobene Gegenstand, ein fallen gelassener derselben Art geht wieder ab.
  const bestand = new Map<string, number>();
  for (const l of d.loot) {
    if (l[0] > zeit) break;
    if (l[1] !== s.id) continue;
    const roh = d.namen[l[2]] ?? '';
    bestand.set(roh, (bestand.get(roh) ?? 0) + (l[5] === 1 ? 1 : -1));
  }
  const waffen = [...bestand.entries()].filter(([roh, n]) => n > 0 && !istMunition(roh)).map(([roh]) => roh);
  const vorrat = [...bestand.entries()].filter(([roh, n]) => n > 0 && istMunition(roh)).map(([roh]) => roh);
  const meine = d.schuesse.filter((x) => x[1] === s.id && x[5] > 0 && x[0] <= zeit);
  const schaden = meine.reduce((a, x) => a + x[4], 0);
  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900/80 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 text-base font-black text-white">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: farbe }} />
          <span className="truncate">{s.name}</span>
        </p>
        <button type="button" onClick={schliessen} className="rounded-md px-2 text-lg leading-none text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Close">×</button>
      </div>
      <div className="mt-3">
        <div className="flex items-baseline justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          <span>HP</span><span className="tabular-nums text-slate-200">{tot ? <T>Ausgeschieden</T> : hp ?? '–'}</span>
        </div>
        <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${tot ? 0 : Math.max(0, Math.min(100, hp ?? 0))}%`, background: (hp ?? 0) > 50 ? '#4ade80' : (hp ?? 0) > 25 ? '#facc15' : '#f87171' }} />
        </div>
      </div>
      <p className="mt-3 text-[11px] text-slate-400">
        <T>Treffer</T> <b className="tabular-nums text-slate-100">{meine.length}</b> · Damage <b className="tabular-nums text-slate-100">{Math.round(schaden)}</b> · <T>Kopftreffer</T> <b className="tabular-nums text-slate-100">{meine.filter((x) => x[5] === 2).length}</b>
      </p>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500"><T>Inventar</T></p>
      {waffen.length ? (
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {waffen.map((roh) => (
            <span key={roh} className="truncate rounded-lg border bg-black/40 px-2 py-1 text-xs font-bold" style={{ borderColor: seltenheit(roh), color: seltenheit(roh) }}>{gegenstandName(roh)}</span>
          ))}
        </div>
      ) : <p className="mt-1 text-xs text-slate-500"><T>Noch nichts aufgehoben.</T></p>}
      {vorrat.length > 0 && <p className="mt-2 text-[11px] text-slate-400">{vorrat.map(gegenstandName).join(' · ')}</p>}
    </div>
  );
}
