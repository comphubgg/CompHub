import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { Flaeche, Leer, Zaehler } from '../../ds/Bausteine';
import { Laedt, NurAdmins, WerkzeugKopf, her, wann } from './teile';

/*
 * Live - wer gerade da ist und wer wann zuletzt. Design-System 3.0 (28.11.2026): links die grosse Online-Zahl mit allen, die gerade da sind; rechts
 * eine 24-Stunden-Leiste (jede Sitzung ein Balken); darunter alle Personen als aufklappbare Zeilen und der Verlauf als feste Spalte.
 * Urspruenglich (app/admin/live auf main, GET /api/admin/anwesend, alle 20 s). Alles wie dort: "gerade da" (letzte
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
  if (!leute) return <>{kopf}{fehler ? <Leer text="No connection to the server." /> : <Laedt />}</>;

  const online = leute.filter((p) => p.online);
  const rest = leute.filter((p) => !p.online);
  const verlauf = leute.flatMap((p) => (p.sitzungen ?? []).map((s) => ({ ...s, name: p.name, kennung: p.kennung }))).sort((a, b) => b.von - a.von).slice(0, 80);
  const heute = verlauf.filter((v) => Date.now() - v.von < 86_400_000).length;

  // 24-Stunden-Leiste: wer in den letzten 24 h da war, je Person ihre Sitzungen als Balken (online bis jetzt)
  const jetzt = Date.now(); const anfang = jetzt - 86_400_000;
  const imTag = leute.filter((p) => (p.sitzungen ?? []).some((s) => s.bis > anfang) || p.online).sort((a, b) => Number(b.online) - Number(a.online) || b.zuletzt - a.zuletzt);
  const lage = (t: number) => `${Math.max(0, Math.min(100, ((t - anfang) / 86_400_000) * 100))}%`;
  const stunden = Array.from({ length: 7 }, (_, i) => anfang + i * 4 * 3_600_000);

  const zeile = (p: Person, i: number) => (
    <motion.li key={p.kennung} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 20) * 0.02 }}>
      <button type="button" onClick={() => setOffen((o) => (o === p.kennung ? null : p.kennung))} aria-expanded={offen === p.kennung}
        className={`grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-5 py-3 text-left transition hover:bg-white/[0.03] md:grid-cols-[auto_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] ${offen === p.kennung ? 'bg-white/[0.03]' : ''}`}>
        <span className="relative flex h-2.5 w-2.5">
          {p.online && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${p.online ? 'bg-emerald-400' : 'bg-white/20'}`} />
        </span>
        <span className="flex min-w-0 items-center gap-2"><span className="truncate font-bold text-white">{p.name}</span><span className={`shrink-0 rounded px-1.5 text-[10px] font-bold uppercase ${p.art === 'vip' ? 'bg-akz/15 text-akz' : 'bg-white/[0.06] text-white/50'}`}>{p.art === 'vip' ? 'Key' : 'Account'}</span></span>
        <span className="col-start-2 text-xs text-white/50 md:col-start-auto"><span className={p.online ? 'text-emerald-300' : 'text-white/70'}>{p.online ? 'online now' : her(p.zuletzt)}</span><span className="hidden md:block text-[11px] text-white/35">last here {wann(p.zuletzt)}</span></span>
        <span className="col-start-2 text-xs text-white/45 md:col-start-auto">signed in {wann(p.letzteAnmeldung)}{p.anmeldungen ? ` · ${p.anmeldungen}×` : ''}</span>
        <span className="col-start-3 row-span-3 row-start-1 flex items-center gap-1 text-xs text-white/40 md:col-start-auto md:row-span-1 md:row-start-auto"><span className="zahl">{p.sitzungen?.length ?? 0}</span> sessions
          <svg viewBox="0 0 20 20" className={`h-3.5 w-3.5 transition ${offen === p.kennung ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
      </button>
      <AnimatePresence initial={false}>
        {offen === p.kennung && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="grid gap-4 border-t border-white/[0.05] bg-black/20 px-5 py-4 md:grid-cols-2">
              {!p.sitzungen?.length && <p className="text-xs text-white/40">No history yet — it starts with the next session.</p>}
              {!!p.geraete?.length && (
                <div>
                  <p className="ueber mb-2 !text-white/40">Devices · {p.geraete.length}</p>
                  <ul className="space-y-1.5">{p.geraete.map((g) => <li key={g.zuerst} className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-xs"><span className="font-semibold text-white/85">{geraetText(g.geraet)}</span><span className="block text-white/40">{g.sitzungen} sessions · first {wann(g.zuerst)} · last {wann(g.zuletzt)}</span></li>)}</ul>
                </div>
              )}
              {!!p.sitzungen?.length && (
                <div>
                  <p className="ueber mb-2 !text-white/40">Sessions</p>
                  <ul className="max-h-64 space-y-0.5 overflow-y-auto border-l border-akz/30 pl-3">
                    {[...p.sitzungen].reverse().slice(0, 30).map((s, k) => {
                      const laeuft = k === 0 && p.online;
                      return (
                        <li key={s.von} className="text-[11px] text-white/45">
                          <span className="text-white/70">{new Date(s.von).toLocaleDateString('en-GB')}</span> · {uhr(s.von)}–{laeuft ? 'now' : uhr(s.bis)} · {dauer(s.von, laeuft ? Date.now() : s.bis)}
                          {laeuft && <span className="ml-2 text-emerald-300">running</span>}
                          {s.geraet && <span className="ml-2 text-white/60">{geraetText(s.geraet)}</span>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
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
      {!leute.length ? (
        <Leer text="Nobody recorded yet. The list fills as soon as someone signs in or opens a page — there is nothing retroactive." />
      ) : (
        <>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <Flaeche fest className="relative overflow-hidden p-6">
              <span aria-hidden className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl" />
              <p className="ueber !text-emerald-300">Online now</p>
              <p className="titel mt-1 text-8xl"><Zaehler wert={online.length} /></p>
              <div className="mt-2 flex gap-6 text-sm text-white/50"><span><b className="zahl text-white">{heute}</b> sessions in 24 h</span><span><b className="zahl text-white">{leute.length}</b> people recorded</span></div>
              <ul className="mt-5 space-y-2">
                {online.map((p) => {
                  const s = p.sitzungen?.[p.sitzungen.length - 1];
                  return (
                    <li key={p.kennung} className="flex items-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.05] px-4 py-2.5">
                      <span className="relative flex h-2.5 w-2.5"><span className="absolute h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative h-2.5 w-2.5 rounded-full bg-emerald-400" /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate font-bold text-white">{p.name}</span><span className="block truncate text-[11px] text-white/45">{geraetText(s?.geraet)}</span></span>
                      {s && <span className="zahl shrink-0 text-xs text-white/50">since {uhr(s.von)}</span>}
                    </li>
                  );
                })}
                {!online.length && <li className="text-sm text-white/45">Nobody right now.</li>}
              </ul>
              <p className="mt-4 text-[11px] leading-relaxed text-white/35">Every open page reports once a minute. Whoever is silent for two minutes counts as gone. Signing out removes someone at once.</p>
            </Flaeche>

            <Flaeche fest verz={0.05} className="overflow-hidden">
              <div className="flex flex-wrap items-baseline gap-x-3 border-b border-white/[0.06] px-5 py-3.5"><h2 className="titel text-3xl">Last 24 hours</h2><span className="text-xs text-white/40">{imTag.length} people · every bar is a session</span></div>
              <div className="ohne-leiste overflow-x-auto">
                <div className="min-w-[560px] px-5 pb-4 pt-2">
                  <div className="relative ml-36 h-6 text-[10px] text-white/35">
                    {stunden.slice(1, -1).map((t) => <span key={t} className="zahl absolute -translate-x-1/2" style={{ left: lage(t) }}>{uhr(t)}</span>)}
                    <span className="absolute right-0 font-bold text-emerald-300">now</span>
                  </div>
                  <ul className="space-y-1.5">
                    {imTag.slice(0, 24).map((p, i) => (
                      <li key={p.kennung} className="flex items-center gap-3">
                        <span className={`w-[8.25rem] shrink-0 truncate text-right text-xs font-semibold ${p.online ? 'text-white' : 'text-white/55'}`}>{p.name}</span>
                        <div className="relative h-5 flex-1 rounded-md bg-white/[0.03]">
                          {stunden.slice(1).map((t) => <span key={t} className="absolute inset-y-0 w-px bg-white/[0.05]" style={{ left: lage(t) }} />)}
                          {(p.sitzungen ?? []).filter((s) => s.bis > anfang).map((s, k, alle) => {
                            const bis = p.online && k === alle.length - 1 ? jetzt : s.bis;
                            return (
                              <motion.span key={s.von} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.02 * i, duration: 0.5 }} title={`${uhr(s.von)}–${uhr(bis)} · ${geraetText(s.geraet)}`}
                                className={`absolute inset-y-1 origin-left rounded ${p.online && k === alle.length - 1 ? 'bg-emerald-400' : p.art === 'vip' ? 'bg-akz/80' : 'bg-white/45'}`}
                                style={{ left: lage(Math.max(s.von, anfang)), width: `max(3px, calc(${lage(bis)} - ${lage(Math.max(s.von, anfang))}))` }} />
                            );
                          })}
                        </div>
                      </li>
                    ))}
                    {!imTag.length && <li className="py-6 text-center text-sm text-white/45">Nobody was here in the last 24 hours.</li>}
                  </ul>
                  <p className="mt-3 flex gap-4 text-[11px] text-white/40"><span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded bg-emerald-400" />online now</span><span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded bg-akz/80" />access key</span><span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded bg-white/45" />account</span></p>
                </div>
              </div>
            </Flaeche>
          </div>

          <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Flaeche fest verz={0.05} className="overflow-hidden">
              <div className="flex flex-wrap items-baseline gap-x-3 border-b border-white/[0.06] px-5 py-3.5"><h2 className="titel text-3xl">Everyone</h2><span className="text-xs text-white/40">online first, then by last visit · click for devices and sessions</span></div>
              <ul className="divide-y divide-white/[0.05]">{[...online, ...rest].map(zeile)}</ul>
            </Flaeche>
            {verlauf.length > 0 && (
              <Flaeche fest verz={0.1} className="overflow-hidden xl:sticky xl:top-32 xl:self-start">
                <div className="flex flex-wrap items-baseline gap-x-3 border-b border-white/[0.06] px-5 py-3.5"><h2 className="titel text-3xl">History</h2><span className="text-xs text-white/40">latest {verlauf.length} sessions</span></div>
                <ul className="max-h-[70vh] divide-y divide-white/[0.04] overflow-y-auto">
                  {verlauf.map((v) => (
                    <li key={`${v.kennung}-${v.von}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-5 py-2 text-[13px]">
                      <span className="truncate font-semibold text-white">{v.name}</span>
                      <span className="zahl text-white/40">{dauer(v.von, v.bis)}</span>
                      <span className="zahl truncate text-xs text-white/50">{wann(v.von)}{v.geraet ? ` · ${geraetText(v.geraet)}` : ''}</span>
                    </li>
                  ))}
                </ul>
              </Flaeche>
            )}
          </div>
        </>
      )}
    </>
  );
}
