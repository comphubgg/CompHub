import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { Glas } from '../../teile/Glas';
import { Laedt, NurAdmins, WerkzeugKopf, her, wann } from './teile';

/*
 * Live - wer gerade da ist und wer wann zuletzt (app/admin/live auf main, GET /api/admin/anwesend, alle 20 s). Alles wie dort: "gerade da" (letzte
 * zwei Minuten ein Lebenszeichen), der ganze Verlauf der letzten Sitzungen mit Geraet, und je Person aufklappbar Geraete und Sitzungen.
 */
interface Geraet { art: string; modell?: string; system: string; browser: string; land?: string }
interface Person {
  kennung: string; name: string; art: 'konto' | 'vip'; zuletzt: number; letzteAnmeldung?: number; ersteAnmeldung?: number; anmeldungen?: number; online: boolean;
  sitzungen?: Array<{ von: number; bis: number; geraet?: Geraet }>;
  geraete?: Array<{ geraet: Geraet; zuerst: number; zuletzt: number; sitzungen: number }>;
}
const ART: Record<string, string> = { Handy: 'Phone', Tablet: 'Tablet', Computer: 'Computer' };
const geraetText = (g?: Geraet) => (g ? [ART[g.art] ?? g.art, g.modell, g.system === 'Unbekannt' ? 'Unknown' : g.system, g.browser === 'Anderer Browser' ? 'Other browser' : g.browser, g.land].filter(Boolean).join(' · ') : '');
const dauer = (von: number, bis: number) => { const m = Math.max(1, Math.round((bis - von) / 60_000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
const uhr = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export default function Live({ klassisch }: { klassisch: () => void }) {
  const [leute, setLeute] = useState<Person[] | null>(null);
  const [fehler, setFehler] = useState<'' | 'recht' | 'netz'>('');
  const [offen, setOffen] = useState<string | null>(null);
  const holen = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/anwesend', { cache: 'no-store' });
      if (!r.ok) { setFehler('recht'); return; }
      const j = await r.json(); setLeute(j.leute ?? []); setFehler('');
    } catch { setFehler('netz'); }
  }, []);
  useEffect(() => { void holen(); const t = setInterval(() => void holen(), 20_000); return () => clearInterval(t); }, [holen]);

  const kopf = <WerkzeugKopf ueber="Live & Cups" titel="Live" text="Who is online right now and when everyone signed in. Refreshes every 20 seconds." klassisch={klassisch} />;
  if (fehler === 'recht') return <>{kopf}<NurAdmins /></>;
  if (!leute) return <>{kopf}{fehler ? <Glas className="p-6 text-sm text-amber-200">No connection to the server.</Glas> : <Laedt />}</>;

  const online = leute.filter((p) => p.online);
  const rest = leute.filter((p) => !p.online);
  const verlauf = leute.flatMap((p) => (p.sitzungen ?? []).map((s) => ({ ...s, name: p.name, kennung: p.kennung }))).sort((a, b) => b.von - a.von).slice(0, 80);
  const heute = verlauf.filter((v) => Date.now() - v.von < 86_400_000).length;

  const zeile = (p: Person, i: number) => (
    <motion.li key={p.kennung} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 20) * 0.02 }}
      className={`overflow-hidden rounded-2xl border bg-white/[0.025] ${p.online ? 'border-emerald-400/25' : 'border-white/5'}`}>
      <button type="button" onClick={() => setOffen((o) => (o === p.kennung ? null : p.kennung))} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left transition hover:bg-white/[0.03]">
        <span className="relative flex h-2.5 w-2.5">
          {p.online && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${p.online ? 'bg-emerald-400' : 'bg-rose-500/80'}`} />
        </span>
        <span className="font-semibold text-white">{p.name}</span>
        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/45">{p.art === 'vip' ? 'Key' : 'Account'}</span>
        <span className="text-xs text-white/45">{her(p.zuletzt)}</span>
        <span className="ml-auto text-right text-[11px] leading-relaxed text-white/40">
          <span className="block">last here: <span className="text-white/65">{wann(p.zuletzt)}</span></span>
          <span className="block">signed in: <span className="text-white/65">{wann(p.letzteAnmeldung)}</span>{p.anmeldungen ? ` · ${p.anmeldungen}×` : ''}</span>
          <span className="block">{p.sitzungen?.length ?? 0} sessions {offen === p.kennung ? '▴' : '▾'}</span>
        </span>
      </button>
      <AnimatePresence initial={false}>
        {offen === p.kennung && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="space-y-3 border-t border-white/5 px-4 py-3">
              {!p.sitzungen?.length && <p className="text-xs text-white/40">No history yet — it starts with the next session.</p>}
              {!!p.geraete?.length && (
                <div className="rounded-xl border border-white/5 bg-black/20 px-3 py-2">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">Devices · {p.geraete.length}</p>
                  {p.geraete.map((g) => <p key={g.zuerst} className="text-xs text-white/75">{geraetText(g.geraet)}<span className="text-white/40"> · {g.sitzungen} sessions · last {wann(g.zuletzt)}</span></p>)}
                </div>
              )}
              {!!p.sitzungen?.length && (
                <ul className="space-y-0.5 border-l border-white/10 pl-3">
                  {[...p.sitzungen].reverse().slice(0, 30).map((s, k) => {
                    const laeuft = k === 0 && p.online;
                    return (
                      <li key={s.von} className="text-[11px] text-white/45">
                        <span className="text-white/65">{new Date(s.von).toLocaleDateString('en-GB')}</span> · {uhr(s.von)}–{laeuft ? 'now' : uhr(s.bis)} · {dauer(s.von, laeuft ? Date.now() : s.bis)}
                        {laeuft && <span className="ml-2 text-emerald-300">running</span>}
                        {s.geraet && <span className="ml-2 text-white/60">{geraetText(s.geraet)}</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );

  return (
    <>
      {kopf}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {[{ t: 'Online now', w: online.length, f: 'text-emerald-300' }, { t: 'Sessions in the last 24 h', w: heute, f: 'text-akz' }, { t: 'People recorded', w: leute.length, f: 'text-white' }].map((k, i) => (
          <Glas key={k.t} verzoegerung={i * 0.05} className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">{k.t}</p>
            <p className={`mt-1 text-4xl font-extrabold tabular-nums ${k.f}`}>{k.w}</p>
          </Glas>
        ))}
      </div>
      {!leute.length ? (
        <Glas className="p-8 text-sm text-white/55">Nobody recorded yet. The list fills as soon as someone signs in or opens a page — there is nothing retroactive.</Glas>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Online now{online.length ? ` · ${online.length}` : ''}</h2>
              {online.length ? <ul className="space-y-2">{online.map(zeile)}</ul> : <Glas className="px-4 py-3 text-sm text-white/45">Nobody right now.</Glas>}
              <p className="mt-2 text-[11px] text-white/35">Every open page reports once a minute. Whoever is silent for two minutes counts as gone — a closed browser turns red within two minutes. Signing out removes someone at once.</p>
            </section>
            {rest.length > 0 && (
              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/45">Last seen</h2>
                <ul className="space-y-2">{rest.map(zeile)}</ul>
              </section>
            )}
          </div>
          {verlauf.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-akz">History</h2>
              <Glas className="divide-y divide-white/5 overflow-hidden">
                {verlauf.map((v, i) => (
                  <motion.div key={`${v.kennung}-${v.von}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 30) * 0.015 }}
                    className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2 text-[13px]">
                    <span className="font-semibold text-white">{v.name}</span>
                    <span className="tabular-nums text-white/55">{wann(v.von)}</span>
                    <span className="tabular-nums text-white/40">{dauer(v.von, v.bis)}</span>
                    {v.geraet && <span className="text-white/55">{geraetText(v.geraet)}</span>}
                  </motion.div>
                ))}
              </Glas>
            </section>
          )}
        </div>
      )}
    </>
  );
}
