import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWer } from '../../../../teile/Anmeldung';
import { Laedt, TeamFlagge } from '../teile';

/*
 * Der Match-Verlauf eines Spielers in einem Cup (wie app/events/[id]/SpielerDetail auf main, Fassung "kompakt" fuer das Fenster an der Rangliste
 * der Cup-Karte): /api/spieler-detail?event=&window=&id= - Rang, Top-Prozent, Punkte (Platz/Elims), Punktekurve ueber die Matches, Werte je
 * Mitglied (mit Pfeilen fuer den Besten/Schlechtesten im Team), Wellen je Match (kumuliert umschaltbar), Team je Spiel. Laedt alle 5 min nach;
 * ist man selbst im Team und fehlen Replay-Werte, wird wie auf der Seite die eigene Auswertung bestellt (/api/eigene-auswertung).
 */

interface Match {
  sessionId?: string; placement?: number; elims?: number; timeAlive?: number; wins?: number; damage?: number; damageTaken?: number; headshots?: number;
  punktePlatz?: number; punkteElim?: number;
}
interface Eintrag { rank: number; points: number; elims: number; games: number; wins: number; kd: number; timeAlive: number; damage: number; damageTaken: number; headshots: number; punktePlatz?: number; punkteElims?: number; matches: Match[] }
type Replay = Record<string, number | null | undefined> & { jeSpiel?: Array<Array<string | number | null>> };
interface Mitglied { id: string; name: string; land: string | null; ich: boolean; szene: Record<string, number> | null; replay: Replay | null }
interface Antwort {
  ok: boolean; error?: string; id: string; name: string; dabei: boolean; ausserhalbListe?: boolean; frischerStand?: boolean;
  rank: number | null; gesamt: number; top: number | null; eintrag: Eintrag | null; mitglieder: Mitglied[]; aktualisiert: string | null;
  replayTeil?: { matches?: number; vonMindestens?: number } | null; jeSpalten?: string[];
  eigeneAuswertung?: { gelesen: number; sitzungen: number; fassung?: number } | null;
}

const num = (v: number) => Math.round(v).toLocaleString('en-GB');
const dez = (v: number, n: number) => v.toLocaleString('en-GB', { minimumFractionDigits: n, maximumFractionDigits: n });
const dauer = (s: number) => { const st = Math.floor(s / 3600), mi = Math.floor((s % 3600) / 60); return st ? `${st}h ${mi}m` : `${mi}m ${Math.round(s % 60)}s`; };

type Wert = number | null;
interface Ctx { e: Eintrag | null; solo: boolean; mitglieder: Mitglied[]; echtSolo: boolean; fenster?: string }
interface Zeile { titel: string; wert: (m: Mitglied, c: Ctx) => Wert; zeige: (v: number) => string; je?: (m: Match) => number | undefined; rot?: boolean; weniger?: boolean; nurMitWert?: boolean }
const pos = (v: number | undefined | null) => (typeof v === 'number' && v > 0 ? v : null);
const sz = (m: Mitglied, k: string): Wert => (m.szene && typeof m.szene[k] === 'number' ? m.szene[k] : null);
const rp = (m: Mitglied, k: string): Wert => { const v = m.replay?.[k]; return typeof v === 'number' ? v : null; };
const rpDa = (m: Mitglied, k: string) => m.replay?.[k] !== undefined;

const kills = (m: Mitglied, c: Ctx): Wert => (c.solo && c.e && typeof c.e.elims === 'number' ? c.e.elims : null) ?? sz(m, 'eliminations') ?? rp(m, 'kills');
const dmg = (m: Mitglied, c: Ctx): Wert => sz(m, 'damageDealt') ?? rp(m, 'damage') ?? (c.solo ? pos(c.e?.damage) : null);
const dmgT = (m: Mitglied, c: Ctx): Wert => sz(m, 'damageTakenFromPlayers') ?? rp(m, 'damageTaken') ?? (c.solo ? pos(c.e?.damageTaken) : null);
const treffer = (m: Mitglied): Wert => sz(m, 'hitsToPlayers') ?? rp(m, 'hits');
const kopf = (m: Mitglied, c: Ctx): Wert => sz(m, 'headshots') ?? rp(m, 'headshots') ?? (c.solo ? pos(c.e?.headshots) : null);
const vomMitspieler = (m: Mitglied, c: Ctx, w: (x: Mitglied) => Wert): Wert => {
  if (c.echtSolo) return 0;
  if (c.mitglieder.length !== 2) return null;
  const a = c.mitglieder.find((x) => x.id !== m.id); return a ? w(a) : null;
};
const summe3 = (m: Mitglied, a: string, b: string, c: string): Wert => (rpDa(m, a) ? (rp(m, a) ?? 0) + (rp(m, b) ?? 0) + (rp(m, c) ?? 0) : null);

const REIHE = ['Eliminations', 'Damage To Players', 'Damage From Players', 'Damage Ratio', 'K/D Ratio', 'Health Healed', 'Shield Healed', 'Player Accuracy', 'Headshots',
  'Edit Accuracy', 'Avg Edit Time', 'Mats Farmed', 'Time Alive', 'Assists', 'Overshield Healed', 'Hits To Players', 'Shots', 'Overall Accuracy', 'Weakpoint Accuracy',
  'Players Revived', 'Got Revived', 'Players Rebooted', 'Got Rebooted', 'Wood Farmed', 'Stone Farmed', 'Metal Farmed', 'Mats Collected', 'Wood Collected', 'Stone Collected',
  'Metal Collected', 'Time in Storm', 'Storm Damage Taken', 'Surge Hits', 'Distance Traveled', 'Deaths', 'Player Eliminations (After Out)', 'Damage Done',
  'Damage To Knocked Players', 'Health Taken', 'Shield Taken', 'Own Builds Placed', 'Wood Builds Placed', 'Stone Builds Placed', 'Metal Builds Placed', 'Builds Edited',
  'Edit Attempts', 'Time spent Editing', 'Thanked Bus Driver'];
const NUR_KOPF = new Set(['Points', 'Matches', 'Wins']);
const rang = (t: string) => { const i = REIHE.indexOf(t); return i < 0 ? REIHE.length : i; };

const KERN: Zeile[] = [
  { titel: 'Points', wert: (_m, c) => (c.e ? c.e.points : null), zeige: num, je: (m) => (m.punktePlatz === undefined && m.punkteElim === undefined ? undefined : (m.punktePlatz ?? 0) + (m.punkteElim ?? 0)) },
  { titel: 'Matches', wert: (_m, c) => (c.e ? c.e.games : null), zeige: num },
  { titel: 'Wins', wert: (_m, c) => (c.e ? c.e.wins : null), zeige: num, je: (m) => m.wins },
  { titel: 'Avg Time Alive', wert: (_m, c) => (c.e && c.e.games && c.e.timeAlive ? c.e.timeAlive / c.e.games : null), zeige: dauer, je: (m) => m.timeAlive },
  { titel: 'Avg Placement', wert: (_m, c) => { const p = (c.e?.matches ?? []).map((x) => x.placement).filter((v): v is number => typeof v === 'number' && v > 0); return p.length ? p.reduce((s, v) => s + v, 0) / p.length : null; }, zeige: (v) => dez(v, 2), je: (m) => m.placement, weniger: true },
  { titel: 'Avg Points', wert: (_m, c) => (c.e && c.e.games ? c.e.points / c.e.games : null), zeige: (v) => dez(v, 1) },
  { titel: 'Eliminations', wert: kills, zeige: num, je: (m) => m.elims },
  { titel: 'K/D Ratio', wert: (m, c) => { const k = kills(m, c); if (k === null) return null; if (rpDa(m, 'killsNachAus')) return k / Math.max(1, rp(m, 'tode') ?? 0); if (c.e && c.e.games && /reload/i.test(c.fenster ?? '')) return null; return c.e && c.e.games ? k / Math.max(1, c.e.games - c.e.wins) : null; }, zeige: (v) => dez(v, 2) },
];
const ZUSATZ: Zeile[] = [
  { titel: 'Knocks', wert: (m) => rp(m, 'knocks'), zeige: num },
  { titel: 'Player Eliminations (After Out)', wert: (m) => rp(m, 'killsNachAus'), zeige: num, nurMitWert: true },
  { titel: 'Deaths', wert: (m) => rp(m, 'tode'), zeige: num, rot: true, weniger: true },
  { titel: 'Damage To Players', wert: dmg, zeige: num, je: (m) => m.damage },
  { titel: 'Damage per Match', wert: (m, c) => { const a = dmg(m, c); return a !== null && c.e?.games ? a / c.e.games : null; }, zeige: num },
  { titel: 'Damage From Players', wert: dmgT, zeige: num, je: (m) => m.damageTaken, rot: true, weniger: true },
  { titel: 'Damage Ratio', wert: (m, c) => { const a = dmg(m, c), b = dmgT(m, c); return a !== null && b ? a / b : null; }, zeige: (v) => dez(v, 2) },
  { titel: 'Damage Done', wert: (m) => (rpDa(m, 'schadenAlle') ? Math.round(rp(m, 'schadenAlle') ?? 0) : null), zeige: num },
  { titel: 'Damage To Knocked Players', wert: (m) => (rpDa(m, 'schadenBoden') ? Math.round(rp(m, 'schadenBoden') ?? 0) : null), zeige: num },
  { titel: 'Health Taken', wert: (m) => (rpDa(m, 'lebenWeg') ? Math.round(rp(m, 'lebenWeg') ?? 0) : null), zeige: num, rot: true, weniger: true },
  { titel: 'Shield Taken', wert: (m) => rp(m, 'schildWegEcht') ?? rp(m, 'schildWeg'), zeige: num, rot: true, weniger: true },
  { titel: 'Storm Damage Taken', wert: (m) => (rpDa(m, 'sturmSchaden') ? Math.round(rp(m, 'sturmSchaden') ?? 0) : null), zeige: num, rot: true, weniger: true },
  { titel: 'Thanked Bus Driver', wert: (m) => rp(m, 'busDank'), zeige: num },
  { titel: 'Hits To Players', wert: treffer, zeige: num },
  { titel: 'Health Healed', wert: (m) => rp(m, 'heilHp'), zeige: num },
  { titel: 'Shield Healed', wert: (m) => rp(m, 'schildHeilEcht') ?? rp(m, 'schildWeg'), zeige: num },
  { titel: 'Player Accuracy', wert: (m) => { const s = rp(m, 'schussEcht'); const h = treffer(m); return s && h !== null ? (h / s) * 100 : null; }, zeige: (v) => `${dez(v, 2)} %` },
  { titel: 'Shots', wert: (m) => rp(m, 'schussEcht'), zeige: num },
  { titel: 'Edit Accuracy', wert: (m) => { const z = rp(m, 'editZahl'); if (z === 0) return 0; const ok = rp(m, 'editOk'); return z && ok !== null ? Math.min(100, (ok / z) * 100) : null; }, zeige: (v) => `${dez(v, 2)} %` },
  { titel: 'Avg Edit Time', wert: (m) => { if (rp(m, 'editZahl') === 0) return 0; const n = rp(m, 'editOk') || rp(m, 'editZahl'); return n ? (rp(m, 'editSek') ?? 0) / n : null; }, zeige: (v) => `${dez(v, 1)} s`, weniger: true },
  { titel: 'Mats Farmed', wert: (m) => summe3(m, 'farmHolz', 'farmStein', 'farmMetall'), zeige: num },
  { titel: 'Wood Farmed', wert: (m) => rp(m, 'farmHolz'), zeige: num }, { titel: 'Stone Farmed', wert: (m) => rp(m, 'farmStein'), zeige: num }, { titel: 'Metal Farmed', wert: (m) => rp(m, 'farmMetall'), zeige: num },
  { titel: 'Mats Collected', wert: (m) => summe3(m, 'samHolz', 'samStein', 'samMetall'), zeige: num },
  { titel: 'Wood Collected', wert: (m) => rp(m, 'samHolz'), zeige: num }, { titel: 'Stone Collected', wert: (m) => rp(m, 'samStein'), zeige: num }, { titel: 'Metal Collected', wert: (m) => rp(m, 'samMetall'), zeige: num },
  { titel: 'Own Builds Placed', wert: (m) => summe3(m, 'selbstHolz', 'selbstStein', 'selbstMetall'), zeige: num },
  { titel: 'Wood Builds Placed', wert: (m) => rp(m, 'selbstHolz'), zeige: num }, { titel: 'Stone Builds Placed', wert: (m) => rp(m, 'selbstStein'), zeige: num }, { titel: 'Metal Builds Placed', wert: (m) => rp(m, 'selbstMetall'), zeige: num },
  { titel: 'Builds Edited', wert: (m) => rp(m, 'editOk') ?? rp(m, 'editZahl'), zeige: num },
  { titel: 'Edit Attempts', wert: (m) => rp(m, 'editZahl'), zeige: num },
  { titel: 'Time spent Editing', wert: (m) => { const z = rp(m, 'editZahl'); return z === null ? null : z ? rp(m, 'editSek') ?? 0 : 0; }, zeige: dauer },
  { titel: 'Pickaxe Hits', wert: (m) => rp(m, 'axt'), zeige: num },
  { titel: 'Headshots', wert: kopf, zeige: num },
  { titel: 'Headshot Rate', wert: (m, c) => { const a = kopf(m, c), b = treffer(m); return a !== null && b ? (a / b) * 100 : null; }, zeige: (v) => `${dez(v, 1)} %` },
  { titel: 'Solo Clutch Points', wert: (m) => rp(m, 'clutch'), zeige: num, nurMitWert: true },
  { titel: 'Time Alive', wert: (m, c) => (c.e?.timeAlive ? c.e.timeAlive : rp(m, 'lebenSek')), zeige: dauer, je: (m) => m.timeAlive },
  { titel: 'Distance Traveled', wert: (m) => rp(m, 'streckeM'), zeige: (v) => `${dez(v / 1000, 1)} km` },
  { titel: 'Time in Storm', wert: (m) => sz(m, 'timeInStorm') ?? rp(m, 'sturmSek'), zeige: dauer, rot: true, weniger: true },
  { titel: 'Builds Placed', wert: (m) => summe3(m, 'bauHolz', 'bauStein', 'bauMetall'), zeige: num },
  { titel: 'Wood Placed', wert: (m) => rp(m, 'bauHolz'), zeige: num }, { titel: 'Stone Placed', wert: (m) => rp(m, 'bauStein'), zeige: num }, { titel: 'Metal Placed', wert: (m) => rp(m, 'bauMetall'), zeige: num },
  { titel: 'Players Revived', wert: (m, c) => vomMitspieler(m, c, (x) => rp(x, 'wiederbelebt')), zeige: num },
  { titel: 'Got Revived', wert: (m, c) => (c.echtSolo ? 0 : rp(m, 'wiederbelebt')), zeige: num },
  { titel: 'Players Rebooted', wert: (m, c) => vomMitspieler(m, c, (x) => rp(x, 'rebootet')), zeige: num },
  { titel: 'Got Rebooted', wert: (m, c) => (c.echtSolo ? 0 : rp(m, 'rebootet')), zeige: num },
];
const TEAM_TITEL = new Set(['Points', 'Matches', 'Wins', 'Avg Time Alive', 'Avg Placement', 'Avg Points', 'Builds Placed', 'Wood Placed', 'Stone Placed', 'Metal Placed']);

type JeW = (name: string) => number | undefined;
const teile = (a: number | undefined, b: number | undefined, mal = 1) => (a === undefined || !b ? undefined : (a / b) * mal);
const summe = (...x: Array<number | undefined>) => (x.every((v) => v === undefined) ? undefined : x.reduce<number>((s, v) => s + (v ?? 0), 0));
const JE_KURVE: Record<string, (w: JeW) => number | undefined> = {
  Eliminations: (w) => w('killsEcht'), 'Damage To Players': (w) => w('dmg'), 'Damage From Players': (w) => w('erlitten'), 'Damage Ratio': (w) => teile(w('dmg'), w('erlitten')),
  'K/D Ratio': (w) => (w('killsEcht') === undefined || w('todeEcht') === undefined ? undefined : (w('killsEcht') ?? 0) / Math.max(1, w('todeEcht') ?? 0)),
  Deaths: (w) => w('todeEcht'), 'Player Eliminations (After Out)': (w) => w('killsNachAus'), 'Health Healed': (w) => w('heilHp'), 'Shield Healed': (w) => w('schildHeilEcht'),
  'Player Accuracy': (w) => teile(w('treffer'), w('schussEcht'), 100), Headshots: (w) => w('krit'), 'Headshot Rate': (w) => teile(w('krit'), w('treffer'), 100),
  'Edit Accuracy': (w) => teile(w('editOk'), w('editZahl'), 100), 'Avg Edit Time': (w) => teile(w('editSek'), w('editOk')),
  'Mats Farmed': (w) => summe(w('farmHolz'), w('farmStein'), w('farmMetall')) ?? w('matsAlt'), 'Wood Farmed': (w) => w('farmHolz'), 'Stone Farmed': (w) => w('farmStein'), 'Metal Farmed': (w) => w('farmMetall'),
  'Mats Collected': (w) => summe(w('samHolz'), w('samStein'), w('samMetall')), 'Wood Collected': (w) => w('samHolz'), 'Stone Collected': (w) => w('samStein'), 'Metal Collected': (w) => w('samMetall'),
  'Time Alive': (w) => w('leben'), 'Hits To Players': (w) => w('treffer'), Shots: (w) => w('schussEcht'), 'Got Revived': (w) => w('wiederbelebt'), 'Got Rebooted': (w) => w('rebootet'),
  'Time in Storm': (w) => w('sturm'), 'Storm Damage Taken': (w) => w('sturmSchaden'), 'Distance Traveled': (w) => w('strecke'), 'Damage Done': (w) => w('dmgAlle'),
  'Damage To Knocked Players': (w) => (w('dmgAlle') === undefined || w('dmg') === undefined ? undefined : Math.max(0, (w('dmgAlle') ?? 0) - (w('dmg') ?? 0))),
  'Health Taken': (w) => w('lebenWeg'), 'Shield Taken': (w) => w('schildWegEcht'), 'Own Builds Placed': (w) => summe(w('selbstHolz'), w('selbstStein'), w('selbstMetall')),
  'Wood Builds Placed': (w) => w('selbstHolz'), 'Stone Builds Placed': (w) => w('selbstStein'), 'Metal Builds Placed': (w) => w('selbstMetall'),
  'Builds Edited': (w) => w('editOk') ?? w('editZahl'), 'Edit Attempts': (w) => w('editZahl'), 'Time spent Editing': (w) => w('editSek'), 'Pickaxe Hits': (w) => w('axt'), 'Thanked Bus Driver': (w) => w('busDank'),
};
const ZUERST = 13;

function abschnitte(w: Array<number | null>, x: (i: number) => number, y: (v: number) => number) {
  const out: Array<Array<[number, number]>> = []; let akt: Array<[number, number]> = [];
  w.forEach((v, i) => { if (v === null) { if (akt.length) out.push(akt); akt = []; } else akt.push([x(i), y(v)]); });
  if (akt.length) out.push(akt);
  return out;
}

function PunkteKurve({ platz, elim }: { platz: Array<number | null>; elim: Array<number | null> }) {
  const n = platz.length; const max = Math.max(1, ...platz.map((v) => v ?? 0), ...elim.map((v) => v ?? 0));
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * 300 : 0); const y = (v: number) => 70 - (v / max) * 62;
  const linie = (w: Array<number | null>) => abschnitte(w, x, y).map((a) => (a.length === 1 ? `M${a[0][0]},${a[0][1]} h0.01` : a.map(([px, py], i) => `${i ? 'L' : 'M'}${px},${py}`).join(' '))).join(' ');
  const flaeche = (w: Array<number | null>) => abschnitte(w, x, y).filter((a) => a.length > 1).map((a) => `${a.map(([px, py], i) => `${i ? 'L' : 'M'}${px},${py}`).join(' ')} L${a[a.length - 1][0]},70 L${a[0][0]},70 Z`).join(' ');
  const letzter = (w: Array<number | null>) => { for (let i = w.length - 1; i >= 0; i -= 1) { const v = w[i]; if (v !== null) return v; } return 0; };
  const oben = (w: Array<number | null>) => `${Math.max(0, (y(letzter(w)) / 72) * 100 - 14)}%`;
  return (
    <div className="relative">
      <svg viewBox="0 0 300 72" preserveAspectRatio="none" className="h-32 w-full">
        <path d={flaeche(platz)} fill="#a1a1aa" fillOpacity={0.14} /><path d={linie(platz)} fill="none" stroke="#d4d4d8" strokeWidth={1.6} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <path d={flaeche(elim)} fill="#38bdf8" fillOpacity={0.2} /><path d={linie(elim)} fill="none" stroke="#38bdf8" strokeWidth={1.8} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <line x1="0" x2="300" y1="70" y2="70" stroke="#52525b" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="absolute right-1 text-[10px] font-semibold text-white/70" style={{ top: oben(platz) }}>Placement</span>
      <span className="absolute right-1 text-[10px] font-semibold text-akz" style={{ top: oben(elim) }}>Elimination</span>
    </div>
  );
}

function Welle({ werte, rot, kumuliert }: { werte: Array<number | undefined>; rot?: boolean; kumuliert: boolean }) {
  const farbe = rot ? '#f87171' : '#38bdf8';
  if (werte.length < 2 || werte.every((v) => !v)) return <svg viewBox="0 0 300 26" preserveAspectRatio="none" className="h-[26px] w-full"><line x1="0" x2="300" y1="25" y2="25" stroke="#3f3f46" strokeWidth="1" /></svg>;
  let reihe: Array<number | null> = werte.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : null));
  if (kumuliert) { let a = 0; reihe = reihe.map((v) => (v === null ? null : (a += v))); }
  const bekannt = reihe.filter((v): v is number => v !== null);
  const max = Math.max(...bekannt, 1), min = kumuliert ? 0 : Math.min(...bekannt, 0);
  const ab = abschnitte(reihe, (i) => (i / (reihe.length - 1)) * 300, (v) => 24 - ((v - min) / Math.max(1e-9, max - min)) * 22);
  const kurve = (a: Array<[number, number]>) => { let d = `M${a[0][0]},${a[0][1]}`; for (let i = 1; i < a.length; i += 1) { const cx = (a[i - 1][0] + a[i][0]) / 2; d += ` C${cx},${a[i - 1][1]} ${cx},${a[i][1]} ${a[i][0]},${a[i][1]}`; } return d; };
  return (
    <svg viewBox="0 0 300 26" preserveAspectRatio="none" className="h-[26px] w-full">
      {ab.filter((a) => a.length > 1).map((a, k) => <path key={`f${k}`} d={`${kurve(a)} L${a[a.length - 1][0]},25 L${a[0][0]},25 Z`} fill={farbe} fillOpacity={0.22} />)}
      {ab.filter((a) => a.length > 1).map((a, k) => <path key={`l${k}`} d={kurve(a)} fill="none" stroke={farbe} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />)}
      {ab.filter((a) => a.length === 1).map((a, k) => <path key={`p${k}`} d={`M${a[0][0]},${a[0][1]} h0.01`} fill="none" stroke={farbe} strokeWidth={3} strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}
      <line x1="0" x2="300" y1="25" y2="25" stroke="#3f3f46" strokeWidth="1" />
    </svg>
  );
}

function vorMinuten(iso: string | null, jetzt: number): string | null {
  if (!iso) return null; const ms = Date.parse(iso); if (!Number.isFinite(ms)) return null;
  const m = Math.max(0, Math.round((jetzt - ms) / 60000));
  return m < 1 ? 'just now' : m === 1 ? '1 minute ago' : m < 90 ? `${m} minutes ago` : `${Math.round(m / 60)} hours ago`;
}
const TAKT_MS = 5 * 60_000;

export default function SpielerDetail({ eventId, windowId, solo, spieler }: { eventId: string; windowId: string; solo: boolean; spieler: { id: string; name: string } }) {
  const { wer } = useWer();
  const meinEpic = wer?.epicId ?? null;
  const [daten, setDaten] = useState<Antwort | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState('');
  const [kumuliert, setKumuliert] = useState(false);
  const [mehr, setMehr] = useState(false);
  const [jetzt, setJetzt] = useState(() => Date.now());
  const [geholt, setGeholt] = useState(0);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [auswertung, setAuswertung] = useState<{ stand: 'angefragt' | 'fertig' | 'fehler'; fehler?: string } | null>(null);
  const bestellt = useRef(new Set<string>());

  const laden = useCallback((still = false) => {
    if (!still) { setLaedt(true); setDaten(null); }
    setFehler('');
    return fetch(`/api/spieler-detail?event=${encodeURIComponent(eventId)}&window=${encodeURIComponent(windowId)}&id=${encodeURIComponent(spieler.id)}`)
      .then((r) => r.json()).then((j: Antwort) => { if (j?.ok) { setDaten(j); setGeholt(Date.now()); } else setFehler(j?.error ?? 'Epic is not delivering anything right now.'); })
      .catch(() => setFehler('Epic is not delivering anything right now.')).finally(() => setLaedt(false));
  }, [eventId, windowId, spieler.id]);
  useEffect(() => { void laden(); setGewaehlt(null); setMehr(false); setAuswertung(null); }, [laden]);
  useEffect(() => { const u = setInterval(() => void laden(true), TAKT_MS); return () => clearInterval(u); }, [laden]);
  useEffect(() => { const u = setInterval(() => setJetzt(Date.now()), 15_000); return () => clearInterval(u); }, []);

  /* Ist man selbst im Team und fehlen Replay-Werte: die eigene Auswertung bestellen (wie auf der Seite) und jede Minute nachsehen. */
  useEffect(() => {
    if (!daten || !daten.dabei || !meinEpic) return;
    const ich = daten.mitglieder.find((m) => m.id === meinEpic); if (!ich) return;
    const veraltet = !!daten.eigeneAuswertung && (daten.eigeneAuswertung.fassung ?? 0) < 5;
    if (!veraltet && (rp(ich, 'damage') != null || ich.szene?.damageDealt != null || daten.eigeneAuswertung)) { setAuswertung(daten.eigeneAuswertung ? { stand: 'fertig' } : null); return; }
    const key = `${eventId}|${windowId}|${meinEpic}`;
    if (bestellt.current.has(key)) return;
    bestellt.current.add(key);
    fetch('/api/eigene-auswertung', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId, windowId }) })
      .then((r) => r.json()).then((j) => setAuswertung(j?.ok ? { stand: j.stand === 'fertig' ? 'fertig' : 'angefragt' } : { stand: 'fehler', fehler: j?.error }))
      .catch(() => setAuswertung({ stand: 'fehler', fehler: 'The request could not be sent right now.' }));
  }, [daten, meinEpic, eventId, windowId]);
  useEffect(() => {
    if (auswertung?.stand !== 'angefragt') return undefined;
    const u = setInterval(() => void laden(true), 60_000); return () => clearInterval(u);
  }, [auswertung, laden]);

  const e = daten?.eintrag ?? null;
  const spiele = useMemo(() => e?.matches ?? [], [e]);
  const nr = spiele.map((_m, i) => i + 1);
  const mitglieder = useMemo(() => daten?.mitglieder ?? [], [daten]);
  const team = !solo && mitglieder.length > 1;
  const aktiv = mitglieder.find((m) => m.id === gewaehlt) ?? mitglieder.find((m) => m.ich) ?? mitglieder[0];
  const eigeneSpiele = aktiv?.replay?.jeSpiel;
  const jeSpalten = daten?.jeSpalten ?? [];
  const ctx: Ctx = { e, solo: !team, mitglieder, echtSolo: solo, fenster: windowId };
  const kurve = (z: Zeile): Array<number | undefined> => {
    const f = JE_KURVE[z.titel] as ((w: JeW) => number | undefined) | undefined;
    const ausReplay = f && eigeneSpiele?.length ? spiele.map((m) => {
      const r = m.sessionId ? eigeneSpiele.find((x) => x[0] === m.sessionId) : undefined; if (!r) return undefined;
      const v = f((name) => { const i = jeSpalten.indexOf(name); const x = i < 0 ? undefined : r[i + 1]; return typeof x === 'number' ? x : undefined; });
      return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
    }) : [];
    if (z.je && (!ausReplay.some((v) => v !== undefined) || (!team && z.titel === 'Time Alive'))) return spiele.map((m) => z.je?.(m));
    return ausReplay;
  };
  const zeilen = useMemo(() => [
    ...KERN.filter((z) => (team ? !TEAM_TITEL.has(z.titel) && mitglieder.every((m) => z.wert(m, ctx) !== null) : !NUR_KOPF.has(z.titel))),
    ...ZUSATZ.filter((z) => !(team && TEAM_TITEL.has(z.titel)) && mitglieder.length > 0 && mitglieder.every((m) => z.wert(m, ctx) !== null) && (!z.nurMitWert || mitglieder.some((m) => (z.wert(m, ctx) ?? 0) > 0))),
  ].sort((a, b) => rang(a.titel) - rang(b.titel)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [mitglieder, e, solo]);
  const kumPlatz = useMemo(() => { let a = 0; return spiele.map((m) => (m.punktePlatz === undefined ? null : (a += m.punktePlatz))); }, [spiele]);
  const kumElim = useMemo(() => { let a = 0; return spiele.map((m) => (m.punkteElim === undefined ? null : (a += m.punkteElim))); }, [spiele]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const teamReihen = useMemo(() => [...KERN.filter((z) => TEAM_TITEL.has(z.titel)), ...ZUSATZ.filter((z) => TEAM_TITEL.has(z.titel) && !!mitglieder[0] && z.wert(mitglieder[0], ctx) !== null)], [mitglieder, e]);
  const pfeil = (z: Zeile, werte: Wert[], i: number) => {
    const v = werte[i]; const alle = werte.filter((x): x is number => x !== null);
    if (v === null || alle.length < 2) return null;
    const hoch = Math.max(...alle), tief = Math.min(...alle); if (hoch === tief) return null;
    const vorn = z.weniger ? v === tief : v === hoch, hinten = z.weniger ? v === hoch : v === tief;
    if (!vorn && !hinten) return null;
    return <span className={`ml-1.5 text-[10px] ${vorn ? 'text-emerald-400' : 'text-rose-400'}`}>{v === hoch ? '▲' : '▼'}</span>;
  };
  const naechste = geholt ? Math.max(0, Math.ceil((geholt + TAKT_MS - jetzt) / 60000)) : null;
  const letzte = vorMinuten(daten?.aktualisiert ?? null, jetzt);
  const sichtbar = mehr ? zeilen : zeilen.slice(0, ZUERST);
  const kum = <label title="Shows the running total over the matches instead of the value per match" className="flex cursor-pointer items-center gap-1.5 text-[12px] text-white/50"><input type="checkbox" checked={kumuliert} onChange={(ev) => setKumuliert(ev.target.checked)} className="accent-akz" /> Cumulative</label>;
  const nummern = <p className="flex justify-between text-[10px] tabular-nums text-white/35">{nr.map((n) => <span key={n}>{n}</span>)}</p>;

  if (laedt) return <Laedt text="Loading the match history …" />;
  if (fehler) return <p className="rounded-2xl border border-rose-400/30 bg-rose-400/[0.06] px-4 py-3 text-sm text-rose-200">{fehler}</p>;
  if (!daten) return null;
  if (!daten.dabei) return <p className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/70"><b className="text-white">{daten.name || spieler.name}</b> {daten.frischerStand ? 'is not in this cup\'s leaderboard yet — while the cup is running it can take a while to show up; after the cup the values come from the replays.' : 'did not play in this cup.'}</p>;
  if (!e && !daten.ausserhalbListe) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <div className={`grid items-center gap-x-4 border-b border-white/[0.06] pb-3 ${!team ? 'grid-cols-1' : mitglieder.length >= 4 ? 'grid-cols-2 sm:grid-cols-4' : mitglieder.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {mitglieder.map((m, i) => (
                <p key={m.id} className={`flex items-center justify-center gap-2 text-center text-[14px] font-bold text-white ${i ? 'border-l border-white/[0.08]' : ''}`}><span className="truncate">{m.name}</span><TeamFlagge groesse={16} laender={[m.land]} /></p>
              ))}
            </div>
            <div className="mt-3 flex items-baseline justify-between gap-3">
              <p className="flex items-baseline gap-2">
                {e ? <span className="text-2xl font-black text-white">Rank #{daten.rank}</span> : <span className="text-[15px] font-bold text-white/70">Outside the top 10,000</span>}
                {e && daten.top !== null && <span className="text-[13px] font-semibold text-white/45">Top {daten.top} %</span>}
              </p>
              {e && <p className="text-2xl font-black tabular-nums text-white">{num(e.points)} points</p>}
            </div>
            {e && (e.punktePlatz !== undefined || e.punkteElims !== undefined) && (
              <div className="mt-2 space-y-1 border-t border-white/[0.06] pt-2 text-[13px]">
                <p className="flex justify-between"><span className="text-white/50">Placement</span><span className="tabular-nums text-white/85">{num(e.punktePlatz ?? 0)} points</span></p>
                <p className="flex justify-between"><span className="text-akz">Elimination</span><span className="tabular-nums text-white/85">{num(e.punkteElims ?? 0)} points</span></p>
              </div>
            )}
          </div>
          <p className="mt-2 flex justify-between px-1 text-[11px] text-white/40"><span>Last update <b className="text-white/70">{letzte ?? '–'}</b></span><span>Next update <b className="text-white/70">in {naechste ?? '–'} {naechste === 1 ? 'minute' : 'minutes'}</b></span></p>
        </div>
        {spiele.length > 1 && e && (e.punktePlatz !== undefined || e.punkteElims !== undefined) && (
          <div className="flex flex-col justify-end"><PunkteKurve platz={kumPlatz} elim={kumElim} />{nummern}<p className="text-center text-[10px] text-white/35">Match number</p></div>
        )}
      </div>

      {meinEpic && mitglieder.some((m) => m.id === meinEpic) && auswertung?.stand === 'angefragt' && (
        <p className="flex items-start gap-2 rounded-2xl border border-akz/30 bg-akz/[0.06] px-3 py-2.5 text-[12px] text-akz"><span className="mt-1 h-2 w-2 shrink-0 animate-pulse rounded-full bg-akz" />We are analysing the replays of your games in this cup — damage, hits and headshots will be added. This usually takes 10 to 30 minutes; this window updates itself.</p>
      )}
      {auswertung?.stand === 'fehler' && auswertung.fehler && <p className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-[12px] text-white/50">{auswertung.fehler}</p>}
      {daten.eigeneAuswertung && daten.eigeneAuswertung.gelesen < daten.eigeneAuswertung.sitzungen && (
        <p className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-[12px] text-white/50">{daten.eigeneAuswertung.gelesen} / {daten.eigeneAuswertung.sitzungen} games could be analysed — Epic no longer keeps all replays. Damage and hits count only these games.</p>
      )}
      {!daten.replayTeil?.matches && e && e.games > 0 && mitglieder.some((m) => typeof rp(m, 'spiele') === 'number' && (rp(m, 'spiele') ?? 0) < e.games) && (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm"><p className="font-semibold text-amber-300">Not finished yet</p>
          <p className="mt-0.5 text-amber-100/80">{Math.min(...mitglieder.map((m) => rp(m, 'spiele') ?? 0))} / {e.games} matches of this player analysed. Points, elims and placement are live from Epic; hits, healing and the other replay values are still rising.</p></div>
      )}
      {daten.replayTeil?.matches && (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm"><p className="font-semibold text-amber-300">Not finished yet</p>
          <p className="mt-0.5 text-amber-100/80">{daten.replayTeil.matches.toLocaleString('en-GB')} / {(daten.replayTeil.vonMindestens ?? 0).toLocaleString('en-GB')} matches analysed. Damage, healing and the other replay values are interim and still rising.</p></div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          {zeilen.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto">
              <div className="w-[150px] shrink-0">
                <p className="flex h-[40px] items-center px-2 text-[13px] font-bold text-white/85">Stat</p>
                {sichtbar.map((z) => <p key={z.titel} className="flex h-[34px] items-center px-2 text-[13px] font-semibold text-white/60">{z.titel}</p>)}
              </div>
              {mitglieder.map((m, i) => {
                const an = m.id === aktiv?.id || !team;
                return (
                  <div key={m.id} role={team ? 'button' : undefined} tabIndex={team ? 0 : undefined} onClick={team ? () => setGewaehlt(m.id) : undefined}
                    onKeyDown={team ? (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setGewaehlt(m.id); } } : undefined}
                    className={`min-w-[112px] flex-1 rounded-2xl border bg-black/25 ${team ? 'cursor-pointer transition hover:border-akz/40' : ''} ${an ? 'border-akz/60' : 'border-white/[0.06]'}`}>
                    <p className={`flex h-[40px] items-center justify-center border-b border-white/[0.06] px-2 text-center text-[13px] font-bold ${an ? 'text-white' : 'text-white/45'}`}><span className="truncate">{m.name}</span></p>
                    {sichtbar.map((z) => {
                      const werte = mitglieder.map((x) => z.wert(x, ctx)); const w = werte[i];
                      return <p key={z.titel} className="flex h-[34px] items-center justify-center border-b border-white/[0.03] px-2 text-[13px] last:border-b-0">
                        {w === null ? <span className="text-white/25">–</span> : <><span className={`font-bold tabular-nums ${an ? (z.rot ? 'text-rose-300' : 'text-white') : 'text-white/45'}`}>{z.zeige(w)}</span>{team ? pfeil(z, werte, i) : null}</>}
                      </p>;
                    })}
                  </div>
                );
              })}
            </div>
          ) : <p className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-[12px] text-white/50">Values per player only exist in the replays — they are not available for this cup yet. Epic counts points, eliminations and time per team (right).</p>}
          {zeilen.length > ZUERST && <button type="button" onClick={() => setMehr((x) => !x)} className="mx-auto mt-2 block text-[12px] font-semibold text-white/50 transition hover:text-akz">{mehr ? 'Show less ▲' : 'Show more ▼'}</button>}
        </div>
        <div>
          {!team && spiele.length > 1 && <>
            <div className="flex h-[40px] items-center justify-end">{kum}</div>
            {sichtbar.map((z) => <div key={z.titel} className="flex h-[34px] items-end border-b border-white/[0.03]"><Welle werte={kurve(z)} rot={z.rot} kumuliert={kumuliert} /></div>)}
            {nummern}
          </>}
          {team && !!eigeneSpiele?.length && spiele.length > 1 && (
            <div className="mb-4">
              <div className="flex h-[40px] items-center justify-between"><span className="truncate text-[13px] font-bold text-akz">{aktiv?.name} · per game</span>{kum}</div>
              {sichtbar.map((z) => <div key={z.titel} className="flex h-[34px] items-end border-b border-white/[0.03]"><Welle werte={kurve(z)} rot={z.rot} kumuliert={kumuliert} /></div>)}
              {nummern}
            </div>
          )}
          {team && (
            <div className="rounded-2xl border border-white/10 bg-black/30">
              <div className="flex h-[40px] items-center justify-between border-b border-white/[0.06] px-3"><span className="text-[13px] font-bold text-white/85">Team per game</span>{spiele.length > 1 && kum}</div>
              {teamReihen.map((z) => {
                const w = mitglieder[0] ? z.wert(mitglieder[0], ctx) : null; if (w === null) return null;
                return (
                  <div key={z.titel} className="grid h-[34px] grid-cols-[130px_70px_minmax(0,1fr)] items-center gap-2 border-b border-white/[0.03] px-3 last:border-b-0">
                    <span className="text-[13px] font-semibold text-white/60">{z.titel}</span><span className="text-right text-[13px] font-bold tabular-nums text-white">{z.zeige(w)}</span>
                    {z.je && spiele.length > 1 ? <Welle werte={spiele.map((m) => z.je?.(m))} rot={z.rot} kumuliert={kumuliert} /> : <span />}
                  </div>
                );
              })}
              {spiele.length > 1 && <p className="flex justify-between px-3 pb-1 pl-[218px] text-[10px] tabular-nums text-white/35">{nr.map((n) => <span key={n}>{n}</span>)}</p>}
            </div>
          )}
        </div>
      </div>
      <p className="text-[11px] leading-relaxed text-white/35">
        {mitglieder.some((m) => m.szene) ? 'Damage, hits, storm and distance come from our own replay analysis and count per match day together, not per match. '
          : daten.eigeneAuswertung ? 'Damage, hits and headshots are counted from the replays of your lobbies; eliminations, time and points come from Epic. '
            : mitglieder.some((m) => m.replay) ? `Eliminations, deaths, damage and hits are counted from the analysed replays of this match day. ${mitglieder.some((m) => rpDa(m, 'editZahl')) ? 'Health healed, shots, accuracy, mats, builds and edit accuracy are estimated from the replay and may differ slightly. ' : ''}`
              : 'For this cup Epic delivers placement, points, eliminations and time alive per match; the other values only show up when a source has them for this match day. '}
        {team && 'Epic counts points, eliminations and time per team.'}
      </p>
    </motion.div>
  );
}
