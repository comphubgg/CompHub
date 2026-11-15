'use client';

/*
 * Rechte Leiste der Replay-Ansicht (Betreiber, 15.11.2026): Reiter Spieler | Kill-Feed, Kopf mit Cup/Game und "Match-ID kopieren".
 * Ein angetippter Spieler oeffnet seine Seite: Flagge und Name, vier Kacheln (Platz, Elims, Schaden gemacht/genommen), dazu
 * "Verlauf" (jedes Ereignis mit Spielzeit, filterbar) und "Waffen" (Treffer und Schaden je Waffe, die er beim Treffer in der Hand hielt).
 */

import { useMemo, useState, type ReactNode } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { Fach, artVon, bildVon, fundZu, hpBei, istVorrat, ortBei, seltenText, wertBei, type Aufbereitet, type KillWaffe } from '@/app/replays/SpielerEbene';
import { Flagge, ElimSymbol, FeedWaffe, KnockSymbol } from '@/app/replays/Werkzeuge';
import type { RMatch, RSpieler, REreignis } from '@/app/replays/ReplayAnsicht';

const uhr = (s: number) => { const v = Math.max(0, Math.round(s)); return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`; };

export interface FeedEintrag { e: REreignis; waffe: string | null; echt: KillWaffe | null; gutschrift: number | null; rueckkehr: boolean }

interface Props {
  match: RMatch & { match?: string; sturmVerlauf?: number[][]; truhen?: number[][] };
  sd: Aufbereitet; zeit: number; tStart: number;
  nachId: Map<number, RSpieler>; echte: RSpieler[];
  farbeVon: (id?: number) => string; nameVon: (p?: RSpieler) => string; landVon: (id?: number) => string | undefined;
  feed: FeedEintrag[]; schadenBis: Map<number, number>;
  gewaehlt: number | null; waehle: (id: number | null) => void; springe: (t: number) => void;
  /** zu einem Ort heranfahren */
  zeigeOrt?: (x: number, y: number) => void;
  kopf?: string; matchId?: string;
  /** weitere Reiter (Treffer, Teams) aus der Ansicht */
  extraReiter: Array<{ k: string; name: string; inhalt: ReactNode }>;
}

type Zustand = 'lebt' | 'unten' | 'tot';

export default function SeitenPanel(p: Props) {
  const t = useT();
  const [reiter, setReiter] = useState<string>('spieler');
  const [suche, setSuche] = useState('');
  const [kopiert, setKopiert] = useState(false);

  // Elims bis jetzt (wem der Kill gutgeschrieben wird) und wer gerade am Boden liegt.
  const elimsBis = useMemo(() => {
    const m = new Map<number, number>();
    for (const f of p.feed) if (f.e.t <= p.zeit && f.gutschrift !== null) m.set(f.gutschrift, (m.get(f.gutschrift) ?? 0) + 1);
    return m;
  }, [p.feed, p.zeit]);
  const zustand = useMemo(() => {
    const z = new Map<number, Zustand>();
    for (const f of p.feed) {
      if (f.e.t > p.zeit || f.e.opfer === undefined) continue;
      if (f.e.art === 'unten') z.set(f.e.opfer, 'unten');
      else if (f.e.art === 'auf' || f.rueckkehr) z.set(f.e.opfer, 'lebt');
    }
    for (const s of p.echte) if (typeof s.tod === 'number' && s.tod <= p.zeit) z.set(s.id, 'tot');
    return z;
  }, [p.feed, p.zeit, p.echte]);

  const liste = useMemo(() => {
    const q = suche.trim().toLowerCase();
    const rang = (s: RSpieler) => ({ lebt: 0, unten: 1, tot: 2 }[zustand.get(s.id) ?? 'lebt']);
    return p.echte.filter((s) => !q || p.nameVon(s).toLowerCase().includes(q))
      .sort((a, b) => rang(a) - rang(b) || (elimsBis.get(b.id) ?? 0) - (elimsBis.get(a.id) ?? 0) || (p.schadenBis.get(b.id) ?? 0) - (p.schadenBis.get(a.id) ?? 0));
  }, [p, suche, zustand, elimsBis]);

  const kopiere = async () => {
    if (!p.matchId) return;
    try { await navigator.clipboard.writeText(p.matchId); setKopiert(true); setTimeout(() => setKopiert(false), 1600); } catch { /* ohne Zwischenablage nichts */ }
  };

  const reiterListe = [{ k: 'spieler', name: 'Players' }, { k: 'feed', name: 'Killfeed' }, ...p.extraReiter.map(({ k, name }) => ({ k, name }))];
  const gew = p.gewaehlt !== null ? p.nachId.get(p.gewaehlt) : undefined;

  return (
    <aside className="flex min-w-0 flex-col rounded-2xl border border-white/[0.08] bg-zinc-900/40 lg:sticky lg:top-4">
      <div className="flex items-center gap-2 border-b border-white/[0.08] px-3 py-2.5">
        <p className="min-w-0 flex-1 truncate text-[13px] font-black text-slate-50">{p.kopf}</p>
        {p.matchId && (
          <button type="button" onClick={kopiere} title={p.matchId}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:border-sky-500/60 hover:text-sky-300">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></svg>
            {kopiert ? <T>Copied</T> : <T>Copy match ID</T>}
          </button>
        )}
      </div>

      {gew ? (
        <SpielerSeite {...p} s={gew} elims={elimsBis.get(gew.id) ?? 0} />
      ) : (
        <>
          <div className="flex flex-wrap gap-1 border-b border-white/[0.08] p-1.5">
            {reiterListe.map(({ k, name }) => (
              <button key={k} type="button" onClick={() => setReiter(k)}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] transition ${reiter === k ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-slate-100'}`}><T>{name}</T></button>
            ))}
          </div>
          <div className="max-h-[640px] overflow-y-auto">
            {reiter === 'spieler' && (
              <>
                <div className="sticky top-0 z-10 bg-zinc-900/95 p-2">
                  <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={t('Search player …')}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-[12px] text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500" />
                  <div className="mt-1.5 grid grid-cols-[1fr_44px_56px] px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    <span><T>Player</T></span><span className="text-right">Elims</span><span className="text-right">Dmg</span>
                  </div>
                </div>
                <ul>
                  {liste.map((s) => {
                    const z = zustand.get(s.id) ?? 'lebt';
                    return (
                      <li key={s.id}>
                        <button type="button" onClick={() => p.waehle(s.id)} className="grid w-full grid-cols-[1fr_44px_56px] items-center gap-1 border-b border-white/[0.04] px-3 py-1.5 text-left transition hover:bg-sky-500/[0.06]">
                          <span className="flex min-w-0 items-center gap-2">
                            <span title={z} className={`h-2 w-2 shrink-0 rounded-full ${z === 'tot' ? 'bg-rose-500' : z === 'unten' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                            <Flagge land={p.landVon(s.id)} />
                            <span className="min-w-0 flex-1">
                              <span className={`block truncate text-[12px] font-semibold ${z === 'tot' ? 'text-slate-500' : 'text-slate-100'}`}>{p.nameVon(s)}</span>
                              {z !== 'tot' && p.sd.da && <MiniBalken hp={hpBei(p.sd.leben.get(s.id), p.zeit)} schild={p.sd.schild.size ? wertBei(p.sd.schild.get(s.id), p.zeit) ?? 0 : null} />}
                            </span>
                          </span>
                          <span className="text-right text-[12px] font-bold tabular-nums text-slate-200">{elimsBis.get(s.id) ?? 0}</span>
                          <span className="text-right text-[12px] tabular-nums text-slate-400">{Math.round(p.schadenBis.get(s.id) ?? 0)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            {reiter === 'feed' && <FeedListe {...p} />}
            {p.extraReiter.map((x) => (reiter === x.k ? <div key={x.k}>{x.inhalt}</div> : null))}
          </div>
        </>
      )}
    </aside>
  );
}

function FeedListe(p: Props) {
  // Wie oft ein Spieler bis zu diesem Eintrag gutgeschrieben bekam (laufender Elim-Zaehler) - in Spielreihenfolge gerechnet.
  const zaehler = new Map<number, number>(); const nr = new Map<FeedEintrag, number>();
  for (const f of p.feed) if (f.gutschrift !== null) { const n = (zaehler.get(f.gutschrift) ?? 0) + 1; zaehler.set(f.gutschrift, n); nr.set(f, n); }
  const alle = p.feed.filter((f) => f.e.art !== 'auf' && !f.rueckkehr);
  const elims = alle.filter((f) => f.e.art === 'tot' && f.e.t <= p.zeit).length;
  const zeilen = [...alle].reverse().slice(0, 200);
  if (!zeilen.length) return <p className="px-4 py-6 text-sm text-slate-500"><T>Nothing has happened yet. Press play.</T></p>;
  return (
    <>
    <p className="border-b border-white/[0.06] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{elims} Elims</p>
    <ul>
      {zeilen.map((f, i) => {
        const von = f.e.taeter !== undefined && f.e.taeter !== f.e.opfer ? p.nachId.get(f.e.taeter) : undefined;
        const an = p.nachId.get(f.e.opfer ?? -1);
        const waffe = von ? f.echt : null;
        return (
          <li key={`${f.e.t}-${i}`} className={f.e.t > p.zeit ? 'opacity-40' : ''}>
            <button type="button" onClick={() => { p.springe(f.e.t); if (typeof f.e.x === 'number' && typeof f.e.y === 'number' && (f.e.x || f.e.y)) p.zeigeOrt?.(f.e.x, f.e.y); }} className="flex w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 border-b border-white/[0.04] px-3 py-1.5 text-left text-[12px] transition hover:bg-sky-500/[0.06]">
              <span className="w-9 shrink-0 text-[10px] tabular-nums text-slate-500">{uhr(f.e.t - p.tStart)}</span>
              {von ? <><Flagge land={p.landVon(von.id)} klein /><b className="max-w-[34%] truncate" style={{ color: p.farbeVon(von.id) }}>{p.nameVon(von)}</b></> : <span className="text-slate-500"><T>Storm</T></span>}
              {f.e.art === 'tot' ? <ElimSymbol /> : <KnockSymbol />}
              <FeedWaffe echt={waffe} waffe={f.waffe} gross={22} />
              <Flagge land={p.landVon(an?.id)} klein /><b className="min-w-0 truncate" style={{ color: p.farbeVon(an?.id) }}>{p.nameVon(an)}</b>
              {typeof f.e.abstand === 'number' && f.e.abstand > 0 && <span className="ml-auto shrink-0 text-[10px] tabular-nums text-slate-500">{Math.round(f.e.abstand / 100)} m</span>}
              {(waffe || nr.get(f)) && (
                <span className="flex w-full items-center gap-1.5 pl-[42px] text-[10px] text-slate-500">
                  {waffe && <span style={{ color: seltenText(waffe.selten) }}>{bildVon(waffe.roh)?.name ?? (waffe.bild ? bildVon(waffe.bild)?.name : null) ?? artVon(waffe.roh).name}</span>}
                  {nr.get(f) ? <span className="ml-auto rounded bg-white/[0.06] px-1.5 font-semibold text-slate-300">{p.nameVon(p.nachId.get(f.gutschrift ?? -1))} · {nr.get(f)}</span> : null}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
    </>
  );
}

function seltenFarbe(roh: string) { const m = roh.match(/_(C|UC|R|VR|SR|UR)(?:_Ore_T0\d|_T0\d)?$/i); return seltenText(m?.[1]?.toUpperCase() ?? null); }

function MiniBalken({ hp, schild }: { hp: number | null; schild: number | null }) {
  return (
    <span className="mt-0.5 flex w-24 gap-[2px]">
      {schild !== null && <span className="h-1 flex-1 overflow-hidden rounded-sm bg-white/10"><span className="block h-full bg-blue-500" style={{ width: `${Math.max(0, Math.min(100, schild))}%` }} /></span>}
      <span className="h-1 flex-1 overflow-hidden rounded-sm bg-white/10"><span className="block h-full bg-lime-600" style={{ width: `${Math.max(0, Math.min(100, hp ?? 0))}%` }} /></span>
    </span>
  );
}

/* ------------------------------------------------------------------ Spieler-Seite */

type Art = 'damage' | 'loot' | 'heal' | 'zone' | 'kampf' | 'sonst';
interface VerlaufZeile { t: number; art: Art; text: ReactNode; wert?: ReactNode; bild?: string; ort?: { x: number; y: number }; trenner?: boolean }

function SpielerSeite(p: Props & { s: RSpieler; elims: number }) {
  const [reiter, setReiter] = useState<'verlauf' | 'waffen'>('verlauf');
  const [filter, setFilter] = useState<'alle' | 'damage' | 'loot' | 'heal'>('alle');
  const [zonenZeigen, setZonenZeigen] = useState(true);
  const { s, sd, match } = p;
  // Bis zur aktuellen Zeit (wie die Kacheln): eingesteckter Schaden ohne Treffer auf den schon Umgehauenen.
  const genommenBis = useMemo(() => (match.treffer ?? []).reduce((a, h) => (h[2] === s.id && h[1] !== s.id && h[0] <= p.zeit && !h[5] ? a + h[3] : a), 0), [match.treffer, s.id, p.zeit]);

  const verlauf = useMemo<VerlaufZeile[]>(() => {
    const z: VerlaufZeile[] = [];
    const name = (id?: number) => <b style={{ color: p.farbeVon(id) }}>{p.nameVon(p.nachId.get(id ?? -1))}</b>;
    // Gelandet: der erste Ort, ab dem die Hoehe sich kaum noch aendert (unter 3 m je Sekunde), nach dem Absprung.
    const orte = sd.orte.get(s.id) ?? [];
    for (let i = 1; i < orte.length; i += 1) {
      const a = orte[i - 1]; const b = orte[i];
      if (typeof a[3] !== 'number' || typeof b[3] !== 'number') break;
      if (b[0] - a[0] >= 0.5 && Math.abs(b[3] - a[3]) / (b[0] - a[0]) < 300) { z.push({ t: a[0], art: 'sonst', text: <T>Landed</T> }); break; }
    }
    // Loot: aufgehoben (ohne Munition und Material), Herkunft Truhe/Behaelter, wenn er kurz davor ganz in der Naehe einen geoeffnet hat.
    const truhen = (match.truhen ?? []).filter((x) => x[5] === s.id);
    for (const l of sd.loot) {
      if (l[1] !== s.id || l[5] !== 1) continue;
      const roh = sd.namen[l[2]] ?? '';
      if (istVorrat(roh)) continue;
      // Herkunft: eine Kiste, die er kurz davor ganz in der Naehe geoeffnet hat (Art 0 Truhe, 1 Munitionskiste), sonst Boden.
      const kiste = truhen.find((x) => x[4] !== 2 && l[0] - x[0] >= -0.5 && l[0] - x[0] <= 5 && Math.hypot(x[1] - l[3], x[2] - l[4]) < 600);
      const herkunft = kiste ? (kiste[4] === 1 ? 'ammo box' : 'chest') : 'floor';
      z.push({ t: l[0], art: 'loot', bild: roh, ort: { x: l[3], y: l[4] }, text: <><T>Picked up</T> <b style={{ color: seltenFarbe(roh) }}>{bildVon(roh)?.name ?? artVon(roh).name}</b></>, wert: <span className="text-[10px] text-slate-500"><T>{herkunft}</T></span> });
    }
    // Treffer: aufeinanderfolgende auf/von denselben Gegner innerhalb von 3 s zusammengefasst.
    const treffer = (match.treffer ?? []).filter((h) => h[1] === s.id || h[2] === s.id).sort((a, b) => a[0] - b[0]);
    let grp: { t: number; ende: number; gemacht: boolean; gegner: number; summe: number; n: number; schild: number } | null = null;
    const schliesse = () => {
      if (!grp) return;
      const g = grp;
      const o = ortBei(sd.orte.get(g.gegner), g.t);
      z.push({
        t: g.t, art: 'damage', ort: o ? { x: o.x, y: o.y } : undefined,
        text: g.gemacht ? <><T>Damage dealt to</T> {name(g.gegner)}{g.n > 1 ? <span className="text-slate-500"> (x{g.n})</span> : null}</> : <><T>Damage taken from</T> {name(g.gegner)}{g.n > 1 ? <span className="text-slate-500"> (x{g.n})</span> : null}</>,
        wert: <b className={g.gemacht ? (g.schild >= g.summe / 2 ? 'text-sky-300' : 'text-emerald-300') : 'text-rose-400'}>{g.gemacht ? '+' : '−'}{Math.round(g.summe)}</b>,
      });
      grp = null;
    };
    for (const h of treffer) {
      const gemacht = h[1] === s.id; const gegner = gemacht ? h[2] : h[1];
      if (gemacht && h[2] === s.id) continue;
      if (!grp || grp.gemacht !== gemacht || grp.gegner !== gegner || h[0] - grp.ende > 3) { schliesse(); grp = { t: h[0], ende: h[0], gemacht, gegner, summe: 0, n: 0, schild: 0 }; }
      grp.ende = h[0]; grp.summe += h[3]; grp.n += 1; if (h[7]) grp.schild += h[3];
    }
    schliesse();
    // Knocks und Eliminierungen
    for (const f of p.feed) {
      const e = f.e;
      if (e.art === 'auf' || f.rueckkehr) continue;
      const m = typeof e.abstand === 'number' && e.abstand > 0 ? <span className="text-slate-500"> ({Math.round(e.abstand / 100)} m)</span> : null;
      const ort = typeof e.x === 'number' && typeof e.y === 'number' && (e.x || e.y) ? { x: e.x, y: e.y } : undefined;
      if (e.taeter === s.id && e.opfer !== s.id) z.push({ t: e.t, art: 'kampf', ort, text: <>{e.art === 'tot' ? <T>Eliminated</T> : <T>Knocked</T>} {name(e.opfer)}{m}</>, wert: e.art === 'tot' ? <ElimSymbol gross={14} /> : <KnockSymbol gross={14} /> });
      else if (e.opfer === s.id) z.push({ t: e.t, art: 'kampf', ort, text: <>{e.art === 'tot' ? <T>Eliminated by</T> : <T>Knocked by</T>} {e.taeter !== undefined && e.taeter !== s.id ? name(e.taeter) : <T>storm / fall</T>}{m}</>, wert: e.art === 'tot' ? <ElimSymbol gross={14} /> : <KnockSymbol gross={14} /> });
    }
    // Heilung: Anstiege von Schild und Leben, innerhalb von 4 s zusammengefasst.
    const heil = (l: number[][] | undefined, was: string, farbe: string) => {
      if (!l) return;
      let ab = -1; let summe = 0; let letzte = -99;
      const fertig = () => { if (summe >= 5) z.push({ t: ab, art: 'heal', text: <T>{was}</T>, wert: <b className={farbe}>+{Math.round(summe)}</b> }); summe = 0; };
      for (let i = 1; i < l.length; i += 1) {
        const d = l[i][1] - l[i - 1][1];
        if (d <= 0 || l[i - 1][1] < 0) continue;
        if (l[i][0] - letzte > 4) { fertig(); ab = l[i][0]; }
        summe += d; letzte = l[i][0];
      }
      fertig();
    };
    heil(sd.schild.get(s.id), 'Shield healed', 'text-sky-300');
    heil(sd.leben.get(s.id), 'Health healed', 'text-emerald-300');
    // Sturm: rein und raus (Flackern unter 2 s zusammengefasst).
    const sturm = (match.sturmVerlauf ?? []).filter((x) => x[0] === s.id).sort((a, b) => a[1] - b[1]);
    let drin = false; let seit = 0;
    for (const x of sturm) {
      const neu = x[2] === 1;
      if (neu === drin) continue;
      if (!neu && x[1] - seit < 2) { drin = false; z.pop(); continue; }
      drin = neu; seit = x[1];
      z.push({ t: x[1], art: 'zone', text: <T>{neu ? 'Entered the storm' : 'Left the storm'}</T> });
    }
    // Zonen als Trenner: "Zone n schliesst" zum Beginn jedes Schrumpfens.
    match.zonen.forEach((zo, i) => { if (typeof zo.schrumpftAb === 'number') z.push({ t: zo.schrumpftAb, art: 'zone', trenner: true, text: <>Zone {i + 1} <T>closing</T></> }); });
    return z.sort((a, b) => a.t - b.t);
  }, [s.id, sd, match, p]);

  const gezeigt = verlauf.filter((v) => (v.art === 'zone' ? zonenZeigen : filter === 'alle' || v.art === filter || (filter === 'damage' && v.art === 'kampf')));

  // Waffen: jeder Treffer der Waffe zugeordnet, die er da in der Hand hielt.
  const waffen = useMemo(() => {
    const m = new Map<string, { roh: string; selten: string | null; wid: string | null; treffer: number; schaden: number; kopf: number; knocks: number }>();
    const RANG = ['C', 'UC', 'R', 'VR', 'SR', 'UR'];
    const hand = sd.hand.get(s.id);
    for (const h of match.treffer ?? []) {
      if (h[1] !== s.id || h[2] === s.id) continue;
      const nr = wertBei(hand, h[0]);
      const roh = nr === null ? '?' : sd.waffenNamen[nr] ?? '?';
      const x = m.get(roh) ?? { roh, selten: null, wid: null, treffer: 0, schaden: 0, kopf: 0, knocks: 0 };
      // Seltenheit: die hoechste, mit der er diese Waffe bis zum Treffer aufgehoben hatte (der Bauplan in der Hand fuehrt keine).
      const fund = roh === '?' ? null : fundZu(sd, s.id, roh, h[0]);
      if (fund) x.wid = fund.wid;
      if (fund?.selten && RANG.indexOf(fund.selten) > RANG.indexOf(x.selten ?? '')) x.selten = fund.selten;
      x.treffer += 1; x.schaden += h[3]; if (h[4]) x.kopf += 1; if (h[6]) x.knocks += 1;
      m.set(roh, x);
    }
    return [...m.values()].sort((a, b) => b.schaden - a.schaden);
  }, [s.id, sd, match.treffer]);
  const maxSchaden = Math.max(1, ...waffen.map((w) => w.schaden));

  const kachel = (k: string, w: ReactNode) => (
    <div className="rounded-lg border border-white/[0.06] bg-black/30 px-2.5 py-2">
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500"><T>{k}</T></p>
      <p className="mt-0.5 text-lg font-black tabular-nums text-slate-50">{w}</p>
    </div>
  );
  const chip = (an: boolean) => `rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition ${an ? 'bg-sky-500 text-white' : 'border border-white/10 text-slate-400 hover:text-slate-100'}`;

  return (
    <div className="flex min-h-0 flex-col">
      <div className="border-b border-white/[0.08] p-3">
        <button type="button" onClick={() => p.waehle(null)} className="text-[11px] font-semibold text-sky-300 hover:underline">← <T>All players</T></button>
        <p className="mt-2 flex items-center gap-2 text-lg font-black text-slate-50">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: p.farbeVon(s.id) }} />
          <Flagge land={p.landVon(s.id)} />
          <span className="truncate">{p.nameVon(s)}</span>
        </p>
        <div className="mt-2.5 grid grid-cols-4 gap-1.5">
          {kachel('Placement', s.platz && s.platz < 999 ? `#${s.platz}` : '–')}
          {kachel('Elims', p.elims)}
          {kachel('Dmg dealt', Math.round(p.schadenBis.get(s.id) ?? 0))}
          {kachel('Dmg taken', Math.round(genommenBis))}
        </div>
      </div>
      <div className="flex gap-1 border-b border-white/[0.08] p-1.5">
        {([['verlauf', 'Timeline'], ['waffen', 'Weapon breakdown']] as const).map(([k, n]) => (
          <button key={k} type="button" onClick={() => setReiter(k)} className={`rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] transition ${reiter === k ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-slate-100'}`}><T>{n}</T></button>
        ))}
      </div>
      {reiter === 'verlauf' ? (
        <>
          <div className="flex flex-wrap gap-1 p-2">
            {([['alle', 'All'], ['damage', 'Damage'], ['loot', 'Loot'], ['heal', 'Heals']] as const).map(([k, n]) => (
              <button key={k} type="button" onClick={() => setFilter(k)} className={chip(filter === k)}><T>{n}</T></button>
            ))}
            <button type="button" onClick={() => setZonenZeigen((x) => !x)} className={`ml-auto ${chip(zonenZeigen)}`} aria-pressed={zonenZeigen}><T>Zone</T></button>
          </div>
          <ul className="max-h-[520px] overflow-y-auto">
            {gezeigt.map((v, i) => (v.trenner ? (
              <li key={i} className={`border-y border-violet-500/20 bg-violet-500/[0.07] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-violet-300 ${v.t > p.zeit ? 'opacity-45' : ''}`}>
                <button type="button" onClick={() => p.springe(v.t)} className="w-full text-left">{v.text} · {uhr(v.t - p.tStart)}</button>
              </li>
            ) : (
              <li key={i}>
                <button type="button" onClick={() => { p.springe(v.t); if (v.ort) p.zeigeOrt?.(v.ort.x, v.ort.y); }}
                  className={`flex w-full items-center gap-2 border-b border-white/[0.04] px-3 py-1.5 text-left text-[12px] transition hover:bg-sky-500/[0.06] ${v.t > p.zeit ? 'opacity-45' : ''}`}>
                  <span className="w-9 shrink-0 text-[10px] tabular-nums text-slate-500">{uhr(v.t - p.tStart)}</span>
                  {v.bild ? <Fach roh={v.bild} gross={22} /> : null}
                  <span className="min-w-0 flex-1 truncate text-slate-300">{v.text}</span>
                  {v.wert && <span className="shrink-0 tabular-nums">{v.wert}</span>}
                </button>
              </li>
            )))}
            {!gezeigt.length && <li className="px-4 py-6 text-sm text-slate-500"><T>No events.</T></li>}
          </ul>
        </>
      ) : (
        <ul className="max-h-[560px] overflow-y-auto p-2">
          {waffen.map((w) => (
            <li key={w.roh} className="mb-1.5 flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-black/30 p-2">
              {w.roh !== '?' ? <Fach roh={!bildVon(w.roh) && w.wid && bildVon(w.wid) ? w.wid : w.roh} selten={w.selten} gross={32} /> : <span className="h-8 w-8 rounded-md bg-white/5" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-bold" style={{ color: w.roh === '?' ? '#e2e8f0' : seltenText(w.selten) }}>{w.roh === '?' ? <T>Unknown</T> : bildVon(w.roh)?.name ?? (w.wid ? bildVon(w.wid)?.name : null) ?? artVon(w.roh).name}</span>
                <span className="mt-1 block h-1.5 overflow-hidden rounded bg-white/5"><span className="block h-full bg-sky-500" style={{ width: `${(w.schaden / maxSchaden) * 100}%` }} /></span>
                <span className="mt-1 block text-[10px] text-slate-500">{w.treffer} <T>hits to players</T> · {w.kopf} <T>headshots</T>{w.knocks ? <> · {w.knocks} <T>finishing hits</T></> : null}</span>
              </span>
              <span className="shrink-0 text-[13px] font-black tabular-nums text-slate-50">{Math.round(w.schaden)}</span>
            </li>
          ))}
          {!waffen.length && <li className="px-2 py-6 text-sm text-slate-500"><T>No hits in this game.</T></li>}
        </ul>
      )}
    </div>
  );
}

