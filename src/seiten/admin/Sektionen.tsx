import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { SEITE } from '../../teile/Glas';
import { Laedt, NurAdmins, WerkzeugKopf, feld } from './teile';

/*
 * Sections (app/admin/sections auf main, /api/sektionen): jeden Bereich der Seite auf Online, Standby (sichtbar, gesperrt, mit Hinweis) oder Offline
 * (fuer alle ausser dem Admin weg) stellen; bei Standby einen der vier Hinweise waehlen oder einen eigenen Text. Liste und Hinweise kommen von der
 * Schnittstelle selbst - ein neuer Bereich auf der Seite steht so auch hier.
 * Design-System 3.0 (28.11.2026): drei Spalten Online / Standby / Offline wie eine Schalttafel - jeder Bereich als Karte in seiner Spalte, der
 * Schalter auf der Karte schiebt sie hinueber; der Hinweis einer Standby-Seite wird direkt auf der Karte gewaehlt oder geschrieben.
 */
type Zustand = 'online' | 'standby' | 'offline';
interface Stand { zustand: Zustand; hinweis: string; eigenerTitel?: string; eigenerText?: string; geaendert?: number }
interface Sektion { schluessel: string; pfad: string; titel: string }
interface Hinweis { schluessel: string; name: string; titel: string; text: string }
const ZUSTAENDE: Array<{ wert: Zustand; punkt: string; titel: string; was: string }> = [
  { wert: 'online', punkt: 'bg-emerald-400', titel: 'Online', was: 'visible and usable for everyone' },
  { wert: 'standby', punkt: 'bg-akz', titel: 'Standby', was: 'visible but locked — with a notice' },
  { wert: 'offline', punkt: 'bg-red-500', titel: 'Offline', was: 'hidden for everyone except you' },
];
const HINWEIS_EN: Record<string, { name: string; titel: string }> = {
  ueberarbeitung: { name: 'Being reworked', titel: '{bereich} is being reworked right now.' },
  bald: { name: 'Coming soon', titel: '{bereich} is coming soon.' },
  wartung: { name: 'Short maintenance', titel: '{bereich} is in short maintenance.' },
  stoerung: { name: 'Source not answering', titel: '{bereich} is not reachable right now.' },
};

export default function Sektionen({ klassisch }: { klassisch: () => void }) {
  const [daten, setDaten] = useState<{ sektionen: Sektion[]; hinweise: Hinweis[]; staende: Record<string, Stand> } | null>(null);
  const [erlaubt, setErlaubt] = useState(true);
  const [stand, setStand] = useState('');
  const [offen, setOffen] = useState<string | null>(null);
  const holen = useCallback(async () => {
    try {
      const j = await (await fetch('/api/sektionen', { cache: 'no-store' })).json();
      if (!j?.admin) { setErlaubt(false); return; }
      setDaten({ sektionen: j.sektionen ?? [], hinweise: j.hinweise ?? [], staende: j.staende ?? {} });
    } catch { setErlaubt(false); }
  }, []);
  useEffect(() => { void holen(); }, [holen]);

  async function setzen(schluessel: string, a: Partial<Stand>) {
    if (!daten) return;
    const jetzt = daten.staende[schluessel];
    setStand('saving …');
    try {
      const r = await fetch('/api/sektionen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schluessel, zustand: a.zustand ?? jetzt?.zustand ?? 'online', ...a }) });
      const j = await r.json();
      if (!r.ok) { setStand(j?.fehler ?? 'not saved'); return; }
      setDaten((d) => (d ? { ...d, staende: j.staende ?? d.staende } : d)); setStand('saved'); setTimeout(() => setStand(''), 2000);
    } catch (e) { setStand((e as Error).message); }
  }

  const kopf = <WerkzeugKopf ueber="Users & Access" titel="Sections" text="You yourself can open every area, whatever it says here — even an offline one. That is the point: keep building while nobody else sees it." klassisch={klassisch}
    rechts={<>{stand && <span className="text-xs text-emerald-300">{stand}</span>}{daten && <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-white/70">{daten.sektionen.length} areas</span>}</>} />;
  if (!erlaubt) return <>{kopf}<NurAdmins /></>;
  if (!daten) return <>{kopf}<Laedt /></>;
  const zustandVon = (k: string): Zustand => daten.staende[k]?.zustand ?? 'online';

  const karte = (s: Sektion, i: number) => {
    const e = daten.staende[s.schluessel] ?? { zustand: 'online' as Zustand, hinweis: 'ueberarbeitung' };
    const auf = offen === s.schluessel;
    return (
      <motion.div key={s.schluessel} layout layoutId={`sektion-${s.schluessel}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 20) * 0.02, layout: { type: 'spring', stiffness: 380, damping: 34 } }}
        className="rounded-2xl border border-white/[0.07] bg-black/30 p-3.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold text-white">{s.titel}</p>
            <a href={`${SEITE}${s.pfad}`} target="_blank" rel="noreferrer" className="font-mono text-[10px] text-white/35 hover:text-akz">{s.pfad}</a>
          </div>
          {e.geaendert ? <span className="shrink-0 text-[10px] text-white/30">{new Date(e.geaendert).toLocaleDateString('en-GB')}</span> : null}
        </div>
        <div className="mt-2.5 grid grid-cols-3 gap-1 rounded-xl bg-white/[0.04] p-1">
          {ZUSTAENDE.map((x) => (
            <button key={x.wert} type="button" title={x.was} onClick={() => { if (x.wert !== e.zustand) void setzen(s.schluessel, { zustand: x.wert }); }}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-bold transition ${e.zustand === x.wert ? 'bg-white/[0.12] text-white' : 'text-white/40 hover:text-white/80'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${x.punkt}`} />{x.titel}
            </button>
          ))}
        </div>
        {e.zustand === 'standby' && (
          <div className="mt-2.5">
            <button type="button" onClick={() => setOffen(auf ? null : s.schluessel)} className="flex w-full items-center gap-2 rounded-lg px-1 text-left text-[11px] text-white/55 hover:text-white">
              <span className="truncate">Notice: <b className="text-white/80">{e.eigenerTitel || (HINWEIS_EN[e.hinweis]?.name ?? e.hinweis)}</b></span>
              <span className="ml-auto text-akz">{auf ? 'Close' : 'Edit'}</span>
            </button>
            <AnimatePresence initial={false}>
              {auf && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="mt-2 grid gap-1.5">
                    {daten.hinweise.map((h) => (
                      <button key={h.schluessel} type="button" onClick={() => setzen(s.schluessel, { zustand: 'standby', hinweis: h.schluessel })}
                        className={`rounded-xl border p-2.5 text-left transition ${e.hinweis === h.schluessel ? 'border-akz bg-akz/10' : 'border-white/10 hover:border-white/25'}`}>
                        <span className="block text-xs font-semibold text-white">{HINWEIS_EN[h.schluessel]?.name ?? h.name}</span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-white/45">{(HINWEIS_EN[h.schluessel]?.titel ?? h.titel).replace('{bereich}', s.titel)}</span>
                      </button>
                    ))}
                  </div>
                  <p className="ueber mb-1.5 mt-3 !text-white/40">or your own text</p>
                  <input defaultValue={e.eigenerTitel ?? ''} onBlur={(ev) => { if (ev.target.value !== (e.eigenerTitel ?? '')) void setzen(s.schluessel, { zustand: 'standby', eigenerTitel: ev.target.value }); }}
                    placeholder="Headline — empty uses the choice above" className={`${feld} mb-2 w-full`} />
                  <textarea defaultValue={e.eigenerText ?? ''} rows={3} onBlur={(ev) => { if (ev.target.value !== (e.eigenerText ?? '')) void setzen(s.schluessel, { zustand: 'standby', eigenerText: ev.target.value }); }}
                    placeholder="Text below — empty uses the choice above" className={`${feld} w-full resize-y`} />
                  <a href={`${SEITE}${s.pfad}`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[11px] text-white/45 transition hover:text-akz">View lock page →</a>
                  <p className="mt-0.5 text-[10px] text-white/30">As admin you see the area itself there — the lock page only shows to the others.</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    );
  };

  return (
    <>
      {kopf}
      <LayoutGroup>
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]">
          {ZUSTAENDE.map((z, zi) => {
            const teil = daten.sektionen.filter((s) => zustandVon(s.schluessel) === z.wert);
            return (
              <motion.div key={z.wert} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: zi * 0.06 }} className="fl-fest overflow-hidden">
                <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3.5">
                  <span className={`h-3 w-3 rounded-full ${z.punkt} shadow-[0_0_14px_currentColor]`} />
                  <div className="min-w-0"><p className="titel text-3xl">{z.titel}</p><p className="text-[11px] text-white/40">{z.was}</p></div>
                  <span className="titel ml-auto text-4xl text-white/80">{teil.length}</span>
                </div>
                <div className={`grid gap-2 p-3 ${z.wert === 'online' ? 'sm:grid-cols-2' : ''}`}>
                  {teil.map(karte)}
                  {!teil.length && <p className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-white/35">{z.wert === 'online' ? 'Every area is switched off.' : `No area is ${z.titel.toLowerCase()}.`}</p>}
                </div>
              </motion.div>
            );
          })}
        </div>
      </LayoutGroup>
    </>
  );
}
