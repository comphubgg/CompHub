'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT, useSprache } from '@/app/components/SprachProvider';
import { useZugang } from '@/app/lib/zugang';
import type { WegDaten, WegKante, WegKennung, WegKnoten, WegStand, WegZahl } from '@/lib/solosWeg';

/*
 * Der Plan des Weges ins Grand Final (Betreiber, 20.10.2026: eine fremde Seite zeigt ihn als Karte aus Kaesten und Pfeilen - "kannst du die auch noch anmachen?").
 *
 * Je Runde ein Kasten mit Datum, Spielerzahl und der Punkteschwelle; zwischen den Kaesten Pfeile mit dem, was weiterkommt. Jeder Pfeil ist eine Marke von Epic:
 * die Belohnung einer Runde ist die Zugangsbedingung der naechsten. Gepunktet sind die Plaetze, die Epic ohne Marke setzt. Alle Zahlen liefert lib/solosWeg
 * (aus Epics Auszahlungstabellen und Bestenlisten); was Epic nicht fuehrt, fehlt - hier steht nichts Geschaetztes ohne "ca.".
 *
 * Breit: ein Raster mit den Kaesten in Spalten, die Pfeile in den Spalten dazwischen. Schmal: die Wege untereinander, die Pfeile als Zeilen dazwischen.
 */

type Lage = { s: number; z: number };

/** Wo jeder Kasten im Raster steht (Spalte, Zeile) - Spalten 1, 3, 5, 7 sind Kaesten, 2, 4, 6 die Pfeile dazwischen. */
const ORT: Record<WegKennung, Lage> = {
  q1r1: { s: 1, z: 2 }, q1r2: { s: 3, z: 2 }, q1r3: { s: 5, z: 2 }, ft: { s: 7, z: 2 },
  q2r1: { s: 1, z: 5 }, q2r2: { s: 3, z: 5 }, q2r3: { s: 5, z: 5 }, heats: { s: 7, z: 5 },
  lcq: { s: 5, z: 8 }, lcl: { s: 7, z: 8 }, finale: { s: 9, z: 2 },
};
const FINALE_ZEILEN = 7;

function useOrt() {
  const { sprache } = useSprache();
  return sprache === 'de' ? 'de-DE' : 'en-GB';
}

function Zahl({ z }: { z: WegZahl }) {
  const ort = useOrt();
  return <>{z.mind ? '≥ ' : z.ca ? '≈ ' : ''}{(z.ca ? Math.round(z.zahl / 100) * 100 : z.zahl).toLocaleString(ort)}</>;
}

/** "28. Sept." / "Sep 28" - und bei mehreren Tagen "28.–29. Sept.". */
function useDatum() {
  const ort = useOrt();
  return useMemo(() => {
    const monat = new Intl.DateTimeFormat(ort, { month: 'short' });
    const tag = new Intl.DateTimeFormat(ort, { day: 'numeric' });
    const voll = new Intl.DateTimeFormat(ort, { day: 'numeric', month: 'short' });
    return (von: number, bis: number | null) => {
      const a = new Date(von), b = bis ? new Date(bis) : a;
      if (a.toDateString() === b.toDateString()) return voll.format(a);
      if (monat.format(a) === monat.format(b)) return ort.startsWith('de') ? `${tag.format(a)}.–${voll.format(b)}` : `${monat.format(a)} ${tag.format(a)}–${tag.format(b)}`;
      return `${voll.format(a)} – ${voll.format(b)}`;
    };
  }, [ort]);
}

const NAME: Record<WegKennung, string> = {
  q1r1: 'Runde 1', q1r2: 'Runde 2', q1r3: 'Runde 3', ft: 'Fast Track', q2r1: 'Runde 1', q2r2: 'Runde 2', q2r3: 'Runde 3',
  heats: 'Heats', lcq: 'LCQ', lcl: 'Last Chance Lobby', finale: 'Finale',
};

function Kasten({ k, hier, kante }: { k: WegKnoten; hier?: boolean; kante?: ReactNode }) {
  const t = useT();
  const ort = useOrt();
  const datum = useDatum();
  const live = k.status === 'live';
  const mehrTage = k.id === 'q1r1' || k.id === 'q2r1';
  const tage = k.fenster.length;
  return (
    <div className={`flex h-full min-w-0 flex-col rounded-xl border p-3.5 ${live ? 'border-sky-500 bg-sky-500/10 shadow-[0_0_0_1px_rgba(14,165,233,.35)]' : hier ? 'border-sky-400/70 bg-zinc-900' : k.status === 'kommt' ? 'border-zinc-800 bg-zinc-900/60' : 'border-zinc-800 bg-zinc-900'}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[15px] font-extrabold leading-tight text-slate-100">{t(NAME[k.id])}</p>
        {live && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sky-500 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /><T>Live</T></span>}
        {!live && k.status === 'kommt' && <span className="shrink-0 rounded-full border border-zinc-700 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500"><T>Kommt</T></span>}
      </div>
      <p className="mt-0.5 text-[11px] text-slate-500">
        {datum(k.von, k.bis)}
        {mehrTage && ` · ${tage} ${t('Tage')}`}
        {k.id === 'heats' && ` · ${tage} Heats`}
      </p>
      <div className="mt-2 space-y-0.5 text-xs">
        {k.jeTag && k.jeTag.length > 0 && (
          <p className="font-semibold text-slate-200">
            {k.jeTag.map((z, i) => <span key={i}>{i > 0 && ' / '}<span className="tabular-nums"><Zahl z={z} /></span></span>)} <span className="font-normal text-slate-400"><T>Spieler je Tag</T></span>
          </p>
        )}
        {k.spieler && <p className="font-semibold text-slate-200"><span className="tabular-nums"><Zahl z={k.spieler} /></span> <span className="font-normal text-slate-400"><T>Spieler</T></span></p>}
        {k.schnitt.length > 0 && (
          <p className="font-semibold text-slate-300">
            {k.schnitt.map((s) => s.punkte).every((p) => p === null)
              ? <span className="font-normal text-slate-500">#{k.schnitt[0].rang.toLocaleString(ort)} · <T>noch keine Punkte</T></span>
              : <>#{k.schnitt[0].rang.toLocaleString(ort)} = <span className="tabular-nums">{k.schnitt.map((s) => (s.punkte === null ? '–' : s.punkte)).join(' / ')}</span> pts{live && <span className="ml-1 font-normal text-sky-400">(<T>live</T>)</span>}</>}
          </p>
        )}
        {k.sofortPunkte && <p className="font-semibold text-sky-400">{k.sofortPunkte.toLocaleString(ort)} pts = <T>sofort durch</T></p>}
      </div>
      {kante}
    </div>
  );
}

/** Ein Pfeil: Strich mit Spitze, der Text darueber - waagerecht (Spalten) oder senkrecht (Zeilen). */
function Pfeil({ k, senkrecht }: { k: WegKante; senkrecht?: boolean }) {
  const t = useT();
  const ort = useOrt();
  const farbe = k.art === 'finale' ? 'text-sky-400' : k.art === 'gesetzt' ? 'text-sky-300' : 'text-slate-500';
  const strich = k.art === 'gesetzt' ? 'border-dashed' : 'border-solid';
  const text = k.spanne ? k.text : k.text.replace(/Top (\d+)/, (_, n) => `Top ${Number(n).toLocaleString(ort)}`);
  const beschriftung = <>{text}{k.jeHeat && <span className="block text-[9px] font-semibold normal-case opacity-80"><T>je Heat</T></span>}</>;
  if (senkrecht) {
    return (
      <div className={`flex h-full min-h-[2.75rem] items-stretch justify-center gap-2 ${farbe}`}>
        <span className="flex flex-col items-center">
          <span className={`min-h-[1.5rem] flex-1 border-l-2 ${strich} border-current`} />
          <svg viewBox="0 0 10 10" className="-mt-1 h-2.5 w-2.5 rotate-90" fill="currentColor" aria-hidden><path d="M0 0l10 5-10 5z" /></svg>
        </span>
        <span className="self-center text-center text-[10px] font-extrabold leading-tight">{beschriftung}</span>
      </div>
    );
  }
  return (
    <div className={`flex h-full flex-col items-center justify-center gap-1 px-1 ${farbe}`} title={k.art === 'gesetzt' ? t('Von Epic gesetzt - ohne Marke') : undefined}>
      <span className="text-center text-[10px] font-extrabold leading-tight">{beschriftung}</span>
      <span className="flex w-full items-center">
        <span className={`flex-1 border-t-2 ${strich} border-current`} />
        <svg viewBox="0 0 10 10" className="-ml-1 h-2.5 w-2.5" fill="currentColor" aria-hidden><path d="M0 0l10 5-10 5z" /></svg>
      </span>
    </div>
  );
}

function Gruppe({ children }: { children: ReactNode }) {
  return <p className="self-end text-[11px] font-bold uppercase tracking-[0.16em] text-sky-400">{children}</p>;
}

function FinaleKasten({ k, daten }: { k: WegKnoten; daten: WegDaten }) {
  const t = useT();
  const ort = useOrt();
  const datum = useDatum();
  const plaetze = daten.herkunft.reduce((a, h) => a + h.zahl, 0);
  const anzahl = k.spieler?.zahl ?? (daten.herkunft.length === 3 ? plaetze : null);
  return (
    <div className="flex h-full min-w-0 flex-col rounded-xl border-2 border-sky-500/70 bg-sky-500/10 p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-400"><T>Grand Finals</T></p>
      <p className="mt-1 text-2xl font-black leading-tight text-slate-100"><T>Finale</T></p>
      <p className="mt-1 text-xs text-slate-300">{datum(k.von, k.bis)} · {k.fenster.length} {t('Tage')}</p>
      {anzahl !== null && <p className="mt-1 text-xs font-semibold text-slate-200"><span className="tabular-nums">{anzahl.toLocaleString(ort)}</span> <T>Spieler</T></p>}
      {k.preisgeld ? (
        <>
          <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-sky-400"><T>Preisgeld</T></p>
          <p className="text-2xl font-black tabular-nums text-sky-300">${k.preisgeld.toLocaleString(ort)}</p>
          {k.erster ? <p className="text-xs font-semibold text-slate-300">{t('1. Platz')} · ${k.erster.toLocaleString(ort)}</p> : null}
        </>
      ) : null}
      {daten.herkunft.length > 0 && (
        <ul className="mt-4 space-y-0.5 text-[11px] text-slate-400">
          {daten.herkunft.map((h) => (
            <li key={h.von}><span className="font-semibold tabular-nums text-slate-300">{h.zahl.toLocaleString(ort)}</span> {h.von === 'ft' ? <T>aus dem Fast Track</T> : h.von === 'heats' ? <T>aus den Heats</T> : <T>aus der Last Chance Lobby</T>}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Wo steht dieses Konto - die Leiste oben ("YOU ARE HERE"). */
function Standleiste({ region, plan, auf }: { region: string; plan: WegDaten; auf: (k: WegKennung | null) => void }) {
  const t = useT();
  const zugang = useZugang();
  const epicId = zugang.epicId;
  const [stand, setStand] = useState<{ stand: WegStand | null; durchsucht: number; tief: boolean } | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState('');

  useEffect(() => {
    setStand(null); setFehler(''); auf(null);
    if (!epicId) return undefined;
    let weg = false;
    setLaedt(true);
    void (async () => {
      try {
        const r = await fetch(`/api/solos-weg?region=${encodeURIComponent(region)}&wo=${epicId}`, { cache: 'no-store' });
        const j = await r.json() as { ok?: boolean; stand?: WegStand | null; durchsucht?: number; fehler?: string };
        if (weg) return;
        if (!j.ok) { setFehler(j.fehler ?? ''); return; }
        setStand({ stand: j.stand ?? null, durchsucht: j.durchsucht ?? 0, tief: false });
        auf(j.stand?.knoten ?? null);
      } catch { if (!weg) setFehler(t('Die Suche hat nicht geklappt.')); } finally { if (!weg) setLaedt(false); }
    })();
    return () => { weg = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epicId, region]);

  const tiefer = async () => {
    setLaedt(true); setFehler('');
    try {
      const r = await fetch(`/api/solos-weg?region=${encodeURIComponent(region)}&wo=${epicId}&tief=1`, { cache: 'no-store' });
      const j = await r.json() as { ok?: boolean; stand?: WegStand | null; durchsucht?: number; fehler?: string };
      if (!j.ok) { setFehler(j.fehler ?? ''); return; }
      setStand({ stand: j.stand ?? null, durchsucht: j.durchsucht ?? 0, tief: true });
      auf(j.stand?.knoten ?? null);
    } catch { setFehler(t('Die Suche hat nicht geklappt.')); } finally { setLaedt(false); }
  };

  const knoten = stand?.stand ? plan.knoten.find((k) => k.id === stand.stand!.knoten) : null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm">
      <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400"><T>Du bist hier</T></span>
      {!epicId && <span className="text-slate-300"><T>Mit einem verknüpften Epic-Konto siehst du, wo du auf dem Weg stehst.</T> <Link href="/account" className="font-semibold text-sky-400 hover:underline"><T>Zum Konto</T> →</Link></span>}
      {epicId && laedt && <span className="text-slate-400"><T>Wird gesucht …</T></span>}
      {epicId && !laedt && fehler && <span className="text-slate-400">{fehler}</span>}
      {epicId && !laedt && !fehler && stand && stand.stand && (
        <span className="text-slate-200">
          <span className="font-bold text-sky-300">{knoten ? t(NAME[knoten.id]) : stand.stand.name}</span>
          {knoten && knoten.fenster.length > 1 ? ` · ${stand.stand.name}` : ''} — <T>Platz</T> <span className="font-bold tabular-nums">{stand.stand.rang.toLocaleString()}</span>, <span className="tabular-nums">{stand.stand.punkte}</span> pts
        </span>
      )}
      {epicId && !laedt && !fehler && stand && !stand.stand && (
        <span className="text-slate-400">
          {stand.tief ? <T>Dein Konto steht in keiner Bestenliste dieser Region.</T> : <T>Dein Konto steht in keiner Liste ab Runde 3 (Top 1.000).</T>}
          {!stand.tief && <> <button type="button" onClick={() => void tiefer()} className="font-semibold text-sky-400 hover:underline"><T>Runde 1 und 2 und die Last Chance auch durchsuchen</T></button></>}
        </span>
      )}
    </div>
  );
}

export default function WegPlan({ region }: { region: string }) {
  const t = useT();
  const [plan, setPlan] = useState<WegDaten | null>(null);
  const [fehler, setFehler] = useState('');
  const [hier, setHier] = useState<WegKennung | null>(null);

  useEffect(() => {
    let weg = false;
    setPlan(null); setFehler('');
    const holen = async () => {
      try {
        const r = await fetch(`/api/solos-weg?region=${encodeURIComponent(region)}`, { cache: 'no-store' });
        const j = await r.json() as ({ ok: true } & WegDaten) | { ok: false; fehler?: string };
        if (weg) return;
        if (!j.ok) { setFehler(j.fehler ?? t('Der Plan lässt sich gerade nicht laden.')); return; }
        setPlan(j); setFehler('');
      } catch { if (!weg) setFehler(t('Der Plan lässt sich gerade nicht laden.')); }
    };
    void holen();
    const takt = setInterval(() => { if (document.visibilityState === 'visible') void holen(); }, 120_000);
    return () => { weg = true; clearInterval(takt); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region]);

  if (fehler && !plan) return <p className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-8 text-center text-sm text-slate-400">{fehler}</p>;
  if (!plan) return <p className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-10 text-center text-sm text-slate-500"><T>Der Plan wird geladen …</T></p>;

  const knoten = (id: WegKennung) => plan.knoten.find((k) => k.id === id);
  const kante = (von: WegKennung, nach: WegKennung) => plan.kanten.find((e) => e.von === von && e.nach === nach);
  const gibt = (id: WegKennung) => !!knoten(id);

  // Waagerechte Pfeile liegen in der Spalte zwischen zwei Kaesten derselben Zeile.
  const waag: Array<[WegKennung, WegKennung]> = [['q1r1', 'q1r2'], ['q1r2', 'q1r3'], ['q1r3', 'ft'], ['q2r1', 'q2r2'], ['q2r2', 'q2r3'], ['lcq', 'lcl']];
  const nachFinale: WegKennung[] = ['ft', 'heats', 'lcl'];
  const lueckeMitte = kante('ft', 'heats');

  return (
    <div className="space-y-4">
      <Standleiste region={region} plan={plan} auf={setHier} />

      {/* Breit: das Raster. */}
      <div className="hidden overflow-x-auto lg:block">
        <div className="grid min-w-[1040px] gap-y-1" style={{ gridTemplateColumns: 'minmax(0,1fr) 5.2rem minmax(0,1fr) 5.2rem minmax(0,1fr) 5.2rem minmax(0,1fr) 5.2rem minmax(0,1.15fr)' }}>
          {gibt('q1r1') && <div style={{ gridColumn: 1, gridRow: 1 }}><Gruppe>Qualifier 1</Gruppe></div>}
          {gibt('q2r1') && <div style={{ gridColumn: 1, gridRow: 4 }}><Gruppe>Qualifier 2</Gruppe></div>}
          {gibt('lcq') && <div style={{ gridColumn: 5, gridRow: 7 }}><Gruppe><T>Last Chance</T></Gruppe></div>}

          {plan.knoten.filter((k) => k.id !== 'finale').map((k) => (
            <div key={k.id} style={{ gridColumn: ORT[k.id].s, gridRow: ORT[k.id].z }}><Kasten k={k} hier={hier === k.id} /></div>
          ))}
          {waag.map(([a, b]) => {
            const e = kante(a, b);
            return e && gibt(a) && gibt(b) ? <div key={`${a}-${b}`} style={{ gridColumn: ORT[a].s + 1, gridRow: ORT[a].z }}><Pfeil k={e} /></div> : null;
          })}
          {kante('q2r3', 'heats') && <div style={{ gridColumn: 6, gridRow: 5 }}><Pfeil k={kante('q2r3', 'heats')!} /></div>}
          {lueckeMitte && <div style={{ gridColumn: 7, gridRow: 3 }}><Pfeil k={lueckeMitte} senkrecht /></div>}
          {kante('heats', 'lcl') && <div style={{ gridColumn: 7, gridRow: '6 / 8' }}><Pfeil k={kante('heats', 'lcl')!} senkrecht /></div>}
          {nachFinale.map((a) => {
            const e = kante(a, 'finale');
            return e && gibt(a) ? <div key={`${a}-f`} style={{ gridColumn: 8, gridRow: ORT[a].z }}><Pfeil k={e} /></div> : null;
          })}
          {knoten('finale') && <div style={{ gridColumn: 9, gridRow: `2 / ${FINALE_ZEILEN + 2}` }}><FinaleKasten k={knoten('finale')!} daten={plan} /></div>}
        </div>
      </div>

      {/* Schmal: die Wege untereinander. */}
      <div className="space-y-5 lg:hidden">
        {([['Qualifier 1', ['q1r1', 'q1r2', 'q1r3', 'ft']], ['Qualifier 2', ['q2r1', 'q2r2', 'q2r3', 'heats']], ['Last Chance', ['lcq', 'lcl']]] as Array<[string, WegKennung[]]>).map(([titel, ids]) => {
          const da = ids.filter(gibt);
          if (!da.length) return null;
          return (
            <div key={titel}>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-sky-400">{t(titel)}</p>
              <div className="space-y-1">
                {da.map((id, i) => {
                  const e = i > 0 ? kante(da[i - 1], id) ?? (id === 'heats' ? kante('q2r3', 'heats') : null) : null;
                  return (
                    <div key={id}>
                      {e && <div className="h-12"><Pfeil k={e} senkrecht /></div>}
                      <Kasten k={knoten(id)!} hier={hier === id} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {knoten('finale') && <FinaleKasten k={knoten('finale')!} daten={plan} />}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-zinc-800 pt-4 text-[11px] text-slate-400">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-sky-500 bg-sky-500/20" /><T>Läuft gerade</T></span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-zinc-700 bg-zinc-900" /><T>Vorbei oder kommt</T></span>
        <span className="inline-flex items-center gap-1.5"><span className="w-6 border-t-2 border-solid border-slate-500" /><T>Marke von Epic</T></span>
        <span className="inline-flex items-center gap-1.5"><span className="w-6 border-t-2 border-dashed border-sky-300" /><T>Von Epic gesetzt (ohne Marke)</T></span>
        <span className="inline-flex items-center gap-1.5"><span className="w-6 border-t-2 border-solid border-sky-400" /><T>Ins Finale</T></span>
      </div>
      <p className="text-[11px] leading-relaxed text-slate-500">
        <T>Zahlen aus Epics Bestenlisten und Auszahlungstabellen. Gibt Epic nur die ersten 10.000 Plätze einer Liste heraus, ist die Spielerzahl daraus abgeleitet (ca.). Runde 1 zählt beide Tage zusammen; die Schwelle nach zwei Tagen lässt sich aus den Tageslisten nicht sicher bestimmen, deshalb steht dort die Spielerzahl je Tag. Gesetzt: Epic füllt die Heats auf 200 Plätze - Qualifier 2, Runde 3 stellt die Plätze, die der Fast Track übrig lässt.</T>
      </p>
    </div>
  );
}
