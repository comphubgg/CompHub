import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Abschnitt, Flaeche, Kennzahl } from '../../../ds/Bausteine';
import Besucherherkunft from '../port/app/components/Besucherherkunft';
import Nutzungszahlen from '../port/app/components/Nutzungszahlen';
import { NurAdmins, WerkzeugKopf, knopfHaupt, knopfLeise } from '../teile';
import { langsam, laufText, laufZeile, ms, replayStand, replaysAuffaellig, useAbruf, vor, type Job, type Zentrale } from '../daten';

/*
 * Status & Besucher (main: /admin?bereich=statistik), Design-System 3.0 (28.11.2026), neu komponiert:
 *   oben eine Buehne "Laeuft alles?": links die Gesundheit als grosse Zahl (x von y Laeufen ok) mit Ampel-Leiste und den vier Wartezahlen
 *   (Posteingang, Replays in der Frist, Laeufe mit Problem, Anteil ausgewertet), rechts JEDER Lauf als Zeile mit Zustand, Zeit und Link zum Lauf.
 *   Darunter Ladezeiten (grosse Linien, langsame amber) neben offenen Auftraegen und den Offline-Seiten; ganz unten Nutzung und Besucherherkunft.
 * Alle Funktionen wie vorher: Aktualisieren (frisch), "Alles aktualisieren" (POST /api/admin/alles-aktualisieren, fragt vorher), 5-Minuten-Takt.
 * Daten: /api/admin/zentrale, /api/replays, /api/sektionen, /api/statistik/nutzung, /api/statistik/besucher.
 */
const AMPEL: Record<Job['ampel'], { punkt: string; text: string; balken: string }> = {
  ok: { punkt: 'bg-emerald-400', text: 'text-emerald-300', balken: 'bg-emerald-400' },
  warnung: { punkt: 'bg-akz', text: 'text-akz', balken: 'bg-akz' },
  fehler: { punkt: 'bg-red-500', text: 'text-red-300', balken: 'bg-red-500' },
  unbekannt: { punkt: 'bg-white/30', text: 'text-white/45', balken: 'bg-white/25' },
};
interface Sektion { schluessel: string; pfad: string; titel: string }

function Linie({ werte, warn }: { werte: number[]; warn: boolean }) {
  if (werte.length < 2) return <div className="h-14" />;
  const max = Math.max(...werte, 1);
  const pkt = werte.map((w, i) => `${((i / (werte.length - 1)) * 100).toFixed(1)},${(54 - (w / max) * 48).toFixed(1)}`);
  const farbe = warn ? 'rgb(var(--akz))' : 'rgba(255,255,255,0.6)';
  return (
    <svg viewBox="0 0 100 56" preserveAspectRatio="none" className="h-14 w-full">
      <polygon points={`0,56 ${pkt.join(' ')} 100,56`} fill={warn ? 'rgb(var(--akz) / 0.14)' : 'rgba(255,255,255,0.05)'} />
      <polyline points={pkt.join(' ')} fill="none" stroke={farbe} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function StatusSeite({ klassisch }: { klassisch?: () => void }) {
  const zentrale = useAbruf<Zentrale>('/api/admin/zentrale', 5 * 60_000);
  const replays = useAbruf<{ fenster?: Array<{ datum?: number; zaehler?: Record<string, number> }> }>('/api/replays', 5 * 60_000);
  const sektionen = useAbruf<{ sektionen?: Sektion[]; staende?: Record<string, { zustand: string }> }>('/api/sektionen');
  const [alles, setAlles] = useState<null | 'laeuft' | { ok: boolean; text: string }>(null);
  const z = zentrale.daten;
  const rs = useMemo(() => replayStand(replays.daten), [replays.daten]);
  const [stand, setStand] = useState('');
  useEffect(() => { if (z) setStand(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })); }, [z]);

  // "Alles aktualisieren": startet Datenlauf, Org-Kader und Team-Verlauf (Betreiber 2.10.2026: "ein Knopf fuer alles")
  const allesAktualisieren = async () => {
    if (!window.confirm('Refresh everything? This starts the data run (statistics, Power Rankings, start page), the org rosters and the team history. It takes a good hour.')) return;
    setAlles('laeuft');
    try {
      const r = await fetch('/api/admin/alles-aktualisieren', { method: 'POST' });
      const j = await r.json() as { ok?: boolean; fehler?: string; laeufe?: Array<{ name: string; ok: boolean }> };
      if (j.laeufe) {
        const gut = j.laeufe.filter((l) => l.ok).length;
        setAlles({ ok: !!j.ok, text: `${gut} of ${j.laeufe.length} runs started${j.ok ? '' : ` — ${j.laeufe.filter((l) => !l.ok).map((l) => laufText(l.name)).join(', ')} did not start`}` });
      } else setAlles({ ok: false, text: j.fehler ?? 'That did not work.' });
    } catch { setAlles({ ok: false, text: 'That did not work.' }); }
    window.setTimeout(() => void zentrale.neu(true), 4000);
  };

  const kopf = (
    <WerkzeugKopf ueber="Live & Cups" titel="Status & visitors" klassisch={klassisch}
      text="Do all jobs run (incl. the fast lane)? What waits for you, open tasks, page load times of the last 24 hours, offline pages, visitors and usage."
      rechts={<>
        {stand && <span className="text-xs text-white/40">as of {stand}</span>}
        <button type="button" className={knopfLeise} disabled={zentrale.laedt} onClick={() => { void zentrale.neu(true); void replays.neu(); }}>{zentrale.laedt ? 'Loading …' : 'Refresh'}</button>
        <button type="button" className={knopfHaupt} disabled={alles === 'laeuft'} onClick={() => void allesAktualisieren()}>{alles === 'laeuft' ? 'Starting …' : 'Refresh everything'}</button>
      </>} />
  );
  if (zentrale.fehler === 'recht') return <>{kopf}<NurAdmins /></>;

  const jobs = z?.jobs ?? [];
  const gut = jobs.filter((j) => j.ampel === 'ok').length;
  const probleme = jobs.filter((j) => j.ampel === 'fehler' || j.ampel === 'warnung').length;
  const offenPost = z?.kontaktOffen ?? 0;
  const ruhig = z && !probleme && !offenPost && (!rs || !replaysAuffaellig(rs));
  const raus = (sektionen.daten?.sektionen ?? []).map((s) => ({ s, zustand: sektionen.daten?.staende?.[s.schluessel]?.zustand })).filter((x) => x.zustand === 'offline' || x.zustand === 'standby');
  const reihenfolge: Record<Job['ampel'], number> = { fehler: 0, warnung: 1, unbekannt: 2, ok: 3 };

  return (
    <>
      {kopf}
      {alles && alles !== 'laeuft' && <p className={`mb-4 text-sm ${alles.ok ? 'text-emerald-300' : 'text-red-300'}`}>{alles.text}</p>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Flaeche fest className="relative overflow-hidden p-6">
          <span aria-hidden className={`pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full blur-3xl ${probleme ? 'bg-red-500/15' : 'bg-emerald-500/10'}`} />
          <p className="ueber">Is everything running?</p>
          <p className="titel mt-2 text-7xl">{z ? <>{gut}<span className="text-white/30">/{jobs.length}</span></> : '…'}</p>
          <p className="mt-1 text-sm text-white/55">{!z ? (zentrale.fehler ? 'The job status could not be loaded right now.' : 'Loading the jobs …') : probleme ? `${probleme} ${probleme === 1 ? 'job needs' : 'jobs need'} a look` : 'All jobs are fine'}</p>
          <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-white/[0.06]">
            {[...jobs].sort((a, b) => reihenfolge[a.ampel] - reihenfolge[b.ampel]).map((j, i) => (
              <motion.span key={j.schluessel} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.05 * i }} style={{ width: `${100 / jobs.length}%` }} className={`origin-left border-r border-fl ${AMPEL[j.ampel].balken}`} />
            ))}
          </div>
          <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5">
            <Link to="/admin/contact"><Kennzahl label="Inbox" wert={z ? offenPost : null} ton={offenPost ? 'akz' : 'gruen'} unter="open messages" /></Link>
            <Link to="/admin/replays"><Kennzahl label="Replays open" wert={rs ? rs.offenInFrist : null} ton={rs && replaysAuffaellig(rs) ? 'akz' : 'gruen'} unter="within the 31-day deadline" /></Link>
            <Kennzahl label="Runs with a problem" wert={z ? probleme : null} ton={probleme ? 'rot' : 'gruen'} unter={`of ${jobs.length} jobs`} />
            <Kennzahl label="Analysed" wert={rs && rs.gesamt ? `${(rs.ausgewertet / rs.gesamt * 100).toFixed(1)}%` : null} unter="of all replays" />
          </div>
          {ruhig && <p className="mt-5 flex items-center gap-2 text-sm text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />All quiet — nothing waits for you.</p>}
        </Flaeche>

        <Flaeche fest verz={0.05} className="overflow-hidden">
          <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto] gap-4 border-b border-white/[0.06] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40 md:grid">
            <span>Job</span><span>What it does</span><span>State</span><span />
          </div>
          <ul className="divide-y divide-white/[0.05]">
            {(z ? jobs : Array.from({ length: 8 }, () => null)).map((j, i) => j ? (
              <motion.li key={j.schluessel} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.03 * i }}
                className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 px-5 py-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto] ${j.ampel === 'fehler' ? 'bg-red-500/[0.06]' : ''}`}>
                <span className="flex min-w-0 items-center gap-2.5"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${AMPEL[j.ampel].punkt} ${j.aktiv ? 'animate-pulse' : ''}`} /><span className="truncate font-bold text-white">{laufText(j.name)}</span></span>
                <span className="col-start-1 truncate text-xs text-white/45 md:col-start-auto md:text-sm">{laufText(j.was)}</span>
                <span className={`col-start-1 text-xs md:col-start-auto md:text-sm ${j.aktiv ? 'text-akz' : AMPEL[j.ampel].text}`}>
                  {laufZeile(j)}
                  {j.hinweis && j.ampel !== 'ok' && j.letzter && <span className="block text-[11px] text-white/40">{laufText(j.hinweis)}</span>}
                </span>
                {(j.aktiv ?? j.letzter)?.url ? <a href={(j.aktiv ?? j.letzter)?.url} target="_blank" rel="noreferrer" className="knopf col-start-2 row-span-3 row-start-1 !rounded-lg !px-2.5 !py-1 !text-xs md:col-start-auto md:row-span-1 md:row-start-auto">Run ↗</a> : <span />}
              </motion.li>
            ) : <li key={i} className="h-12 animate-pulse" />)}
          </ul>
        </Flaeche>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Flaeche fest verz={0.05} className="p-5">
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3"><h2 className="titel text-3xl">Page load times</h2><span className="text-xs text-white/40">last 24 hours, from the site check</span></div>
          {!z ? <div className="h-40 animate-pulse rounded-2xl bg-white/[0.03]" /> : !z.ladezeiten?.length ? <p className="text-sm text-white/45">The history starts with the next site check.</p> : (
            <div className="grid gap-3 sm:grid-cols-2">
              {z.ladezeiten.map((l) => (
                <div key={l.titel} className={`rounded-2xl border bg-black/30 p-4 ${langsam(l) ? 'border-akz/40' : 'border-white/[0.06]'}`}>
                  <p className="flex items-baseline justify-between gap-2"><span className="truncate text-sm font-semibold text-white/85">{l.titel}</span><span className={`titel text-3xl ${langsam(l) ? '!text-akz' : ''}`}>{ms(l.jetzt)}</span></p>
                  <Linie werte={l.verlauf} warn={langsam(l)} />
                  <p className="text-[11px] text-white/40">usually about {ms(l.median)}{langsam(l) ? ' · slow right now' : ''}</p>
                </div>
              ))}
            </div>
          )}
        </Flaeche>
        <div className="space-y-5">
          <Flaeche fest verz={0.1} className="overflow-hidden">
            <div className="flex flex-wrap items-baseline gap-x-3 border-b border-white/[0.06] px-5 py-3.5"><h2 className="titel text-3xl">Open tasks</h2><span className="zahl text-xs text-white/40">{z?.auftraege?.length ?? 0}</span><span className="ml-auto text-[11px] text-white/35">same list as #admin-aufgaben</span></div>
            {z?.auftraege?.length ? (
              <ul className="max-h-80 divide-y divide-white/[0.05] overflow-y-auto">
                {z.auftraege.map((a) => (
                  <li key={a.id} className="px-5 py-3"><p className="text-sm font-semibold text-white/90"><span className="zahl mr-2 text-white/35">#{a.id}</span>{a.titel}</p>{(a.hinweis || a.seit) && <p className="mt-0.5 text-xs text-white/40">{[a.hinweis, a.seit ? `open since ${vor(a.seit)}` : ''].filter(Boolean).join(' · ')}</p>}</li>
                ))}
              </ul>
            ) : <p className="px-5 py-4 text-sm text-white/45">{z ? 'No open task.' : '…'}</p>}
          </Flaeche>
          <Flaeche fest verz={0.15} className="overflow-hidden">
            <div className="flex items-baseline gap-3 border-b border-white/[0.06] px-5 py-3.5"><h2 className="titel text-3xl">Offline pages</h2><Link to="/admin/sections" className="knopf-leer ml-auto !text-xs">Sections →</Link></div>
            {sektionen.fehler ? <p className="px-5 py-4 text-sm text-red-300">The state of the pages could not be loaded.</p>
              : !sektionen.daten ? <p className="px-5 py-4 text-sm text-white/40">Loading …</p>
                : !raus.length ? <p className="flex items-center gap-2 px-5 py-4 text-sm text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Every page is online.</p> : (
                  <ul className="divide-y divide-white/[0.05]">
                    {raus.map(({ s, zustand }) => (
                      <li key={s.schluessel} className="flex items-center gap-3 px-5 py-3">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${zustand === 'offline' ? 'bg-red-500' : 'bg-akz'}`} />
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-white">{s.titel}</span><span className="block text-[11px] text-white/40">{zustand === 'offline' ? 'Offline · gone for everyone but you' : 'Standby · visible, but visitors read a notice'}</span></span>
                        <a href={s.pfad} target="_blank" rel="noreferrer" className="text-xs font-semibold text-akz">View ↗</a>
                      </li>
                    ))}
                    <li className="px-5 py-2.5 text-[11px] text-white/35">A page only goes back online when you say so – the switch is under Sections.</li>
                  </ul>
                )}
          </Flaeche>
        </div>
      </div>

      <Abschnitt className="mt-10" ueber="Only visible to you" titel="Usage & visitors">
        <div className="grid gap-5 2xl:grid-cols-2">
          <Flaeche fest className="p-5 [&>section]:mt-0 [&>section]:border-0 [&>section]:bg-transparent [&>section]:p-0"><Nutzungszahlen /></Flaeche>
          <Flaeche fest verz={0.05} className="p-5 [&>section]:mt-0 [&>section]:border-0 [&>section]:bg-transparent [&>section]:p-0"><Besucherherkunft /></Flaeche>
        </div>
      </Abschnitt>
    </>
  );
}
