import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { Glas, SEITE } from '../../teile/Glas';
import { Laedt, NurAdmins, WerkzeugKopf, feld } from './teile';

/*
 * Sections (app/admin/sections auf main, /api/sektionen): jeden Bereich der Seite auf Online, Standby (sichtbar, gesperrt, mit Hinweis) oder Offline
 * (fuer alle ausser dem Admin weg) stellen; bei Standby einen der vier Hinweise waehlen oder einen eigenen Text. Liste und Hinweise kommen von der
 * Schnittstelle selbst - ein neuer Bereich auf der Seite steht so auch hier.
 */
type Zustand = 'online' | 'standby' | 'offline';
interface Stand { zustand: Zustand; hinweis: string; eigenerTitel?: string; eigenerText?: string; geaendert?: number }
interface Sektion { schluessel: string; pfad: string; titel: string }
interface Hinweis { schluessel: string; name: string; titel: string; text: string }
const ZUSTAENDE: Array<{ wert: Zustand; punkt: string; titel: string; was: string }> = [
  { wert: 'online', punkt: 'bg-emerald-400', titel: 'Online', was: 'visible and usable for everyone' },
  { wert: 'standby', punkt: 'bg-amber-400', titel: 'Standby', was: 'visible but locked — with a notice' },
  { wert: 'offline', punkt: 'bg-rose-500', titel: 'Offline', was: 'hidden for everyone except you' },
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
  const zaehl = (z: Zustand) => daten.sektionen.filter((s) => (daten.staende[s.schluessel]?.zustand ?? 'online') === z).length;
  return (
    <>
      {kopf}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {ZUSTAENDE.map((z, i) => (
          <Glas key={z.wert} verzoegerung={i * 0.05} className="flex items-center gap-4 p-5">
            <span className={`h-3 w-3 rounded-full ${z.punkt} shadow-[0_0_14px_currentColor]`} />
            <span><span className="block text-4xl font-extrabold tabular-nums text-white">{zaehl(z.wert)}</span><span className="text-xs text-white/45">{z.titel} · {z.was}</span></span>
          </Glas>
        ))}
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {daten.sektionen.map((s, i) => {
          const e = daten.staende[s.schluessel] ?? { zustand: 'online' as Zustand, hinweis: 'ueberarbeitung' };
          const z = ZUSTAENDE.find((x) => x.wert === e.zustand) ?? ZUSTAENDE[0];
          const auf = offen === s.schluessel;
          return (
            <motion.div key={s.schluessel} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
              className={`rounded-2xl border bg-white/[0.03] p-4 backdrop-blur-xl ${e.zustand === 'offline' ? 'border-rose-400/30' : e.zustand === 'standby' ? 'border-amber-400/30' : 'border-white/10'}`}>
              <div className="flex flex-wrap items-center gap-3">
                <span className={`h-2.5 w-2.5 rounded-full ${z.punkt}`} />
                <span className="font-semibold text-white">{s.titel}</span>
                <code className="font-mono text-[10px] text-white/30">{s.pfad}</code>
                <span className="ml-auto flex items-center gap-1 rounded-full border border-white/10 bg-black/30 p-1">
                  {ZUSTAENDE.map((x) => (
                    <button key={x.wert} type="button" title={x.was} onClick={() => setzen(s.schluessel, { zustand: x.wert })}
                      className={`relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${e.zustand === x.wert ? 'text-white' : 'text-white/45 hover:text-white/80'}`}>
                      {e.zustand === x.wert && <motion.span layoutId={`sek-${s.schluessel}`} className="absolute inset-0 rounded-full bg-white/10" transition={{ type: 'spring', stiffness: 420, damping: 32 }} />}
                      <span className={`relative h-1.5 w-1.5 rounded-full ${x.punkt}`} /><span className="relative">{x.titel}</span>
                    </button>
                  ))}
                </span>
              </div>
              <p className="mt-2 text-[11px] text-white/40">{z.was}{e.geaendert ? ` · changed ${new Date(e.geaendert).toLocaleDateString('en-GB')}` : ''}</p>
              {e.zustand === 'standby' && (
                <div className="mt-3 border-t border-white/5 pt-3">
                  <button type="button" onClick={() => setOffen(auf ? null : s.schluessel)} className="flex w-full items-center gap-2 text-left">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">What the lock page says</span>
                    <span className="ml-auto text-white/40">{auf ? '−' : '+'}</span>
                  </button>
                  <AnimatePresence initial={false}>
                    {auf && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {daten.hinweise.map((h) => (
                            <button key={h.schluessel} type="button" onClick={() => setzen(s.schluessel, { zustand: 'standby', hinweis: h.schluessel })}
                              className={`rounded-xl border p-3 text-left transition ${e.hinweis === h.schluessel ? 'border-akz bg-akz/10' : 'border-white/10 hover:border-white/25'}`}>
                              <span className="block text-xs font-semibold text-white">{HINWEIS_EN[h.schluessel]?.name ?? h.name}</span>
                              <span className="mt-1 block text-[11px] leading-snug text-white/45">{(HINWEIS_EN[h.schluessel]?.titel ?? h.titel).replace('{bereich}', s.titel)}</span>
                            </button>
                          ))}
                        </div>
                        <p className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">or your own text</p>
                        <input defaultValue={e.eigenerTitel ?? ''} onBlur={(ev) => { if (ev.target.value !== (e.eigenerTitel ?? '')) void setzen(s.schluessel, { zustand: 'standby', eigenerTitel: ev.target.value }); }}
                          placeholder="Headline — leave empty for the choice above" className={`${feld} mb-2 w-full`} />
                        <textarea defaultValue={e.eigenerText ?? ''} rows={3} onBlur={(ev) => { if (ev.target.value !== (e.eigenerText ?? '')) void setzen(s.schluessel, { zustand: 'standby', eigenerText: ev.target.value }); }}
                          placeholder="Text below — leave empty for the choice above" className={`${feld} w-full resize-y`} />
                        <a href={`${SEITE}${s.pfad}`} target="_blank" rel="noreferrer" className="mt-3 inline-block text-[11px] text-white/45 transition hover:text-akz">View lock page →</a>
                        <p className="mt-1 text-[10px] text-white/30">As admin you see the area itself there — the lock page only shows to the others.</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </>
  );
}
