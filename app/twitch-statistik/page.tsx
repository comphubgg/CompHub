'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import T from '@/app/components/T';
import LadeSchirm from '@/app/components/LadeSchirm';
import { useZugang } from '@/app/lib/zugang';
import { t } from '@/app/lib/i18n';

/*
 * Twitch-Statistik fuer VIPs (Betreiber, 27.10.2026): Tag, Woche, Monat, Jahr, gesamt - Spitze mit und ohne Raid, Durchschnitt, neue Follower, Chatter,
 * Raids. Der Admin traegt ein, welcher Kanal gezaehlt wird und welcher VIP ihn sieht. Daten: /api/twitch-statistik (lib/twitchStatistik).
 */

interface Periode {
  periode: string; streams: number; stunden: number; peak: number; peakOhneRaid: number; durchschnitt: number;
  chatter: number; chatterMax: number; nachrichten: number; raids: number; raidZuschauer: number; neueFollower: number | null;
}
interface Stream { id: string; start: string; live: boolean; titel: string; spiel: string; minuten: number; peak: number; peakOhneRaid: number; durchschnitt: number; chatter: number; raids: number; raidZuschauer: number }
interface Auswertung {
  login: string; name: string; follower: number | null; zaehltSeit: string | null; perioden: Periode[]; streams: Stream[];
  verlauf: { start: string; live: boolean; punkte: Array<[number, number]>; raids: Array<{ von: string; zuschauer: number; zeit: string }> } | null;
}
interface Antwort {
  ok: boolean; error?: string; admin: boolean; gewaehlt: string | null; auswertung: Auswertung | null;
  kanaele: Array<{ login: string; id: string | null; name: string; vipName: string; seit: number }>;
  vips?: Array<{ ident: string; name: string }>;
}

const PERIODEN: Record<string, string> = { tag: 'Heute', woche: 'Woche', monat: 'Monat', jahr: 'Jahr', gesamt: 'Gesamt' };
const karte = 'rounded-xl border border-zinc-800 bg-zinc-900/40 p-5';
const zahl = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString());

/** Der Zuschauerverlauf des letzten Streams als Flaeche, Raids als Marken. */
function Verlauf({ v }: { v: NonNullable<Auswertung['verlauf']> }) {
  if (v.punkte.length < 2) return <p className="text-xs text-slate-500"><T>Noch zu wenige Werte für einen Verlauf.</T></p>;
  const B = 800; const H = 160; const maxM = v.punkte[v.punkte.length - 1][0] || 1; const maxV = Math.max(...v.punkte.map((p) => p[1]), 1);
  const x = (m: number) => (m / maxM) * B; const y = (z: number) => H - (z / maxV) * (H - 14) - 4;
  const linie = v.punkte.map(([m, z], i) => `${i ? 'L' : 'M'}${x(m).toFixed(1)},${y(z).toFixed(1)}`).join(' ');
  const start = Date.parse(v.start);
  return (
    <svg viewBox={`0 0 ${B} ${H + 18}`} className="w-full" role="img" aria-label={t('Zuschauerverlauf')}>
      <path d={`${linie} L${B},${H} L0,${H} Z`} fill="rgb(56 189 248 / 0.15)" />
      <path d={linie} fill="none" stroke="rgb(56 189 248)" strokeWidth="2" />
      {v.raids.map((r) => {
        const m = (Date.parse(r.zeit) - start) / 60_000;
        if (m < 0 || m > maxM) return null;
        return <g key={r.zeit}><line x1={x(m)} x2={x(m)} y1={4} y2={H} stroke="rgb(168 85 247)" strokeDasharray="3 3" /><text x={x(m) + 4} y={14} fill="rgb(192 132 252)" fontSize="11">Raid {r.zuschauer}</text></g>;
      })}
      <text x={0} y={H + 15} fill="rgb(100 116 139)" fontSize="11">0 min</text>
      <text x={B} y={H + 15} fill="rgb(100 116 139)" fontSize="11" textAnchor="end">{maxM} min</text>
      <text x={B} y={14} fill="rgb(100 116 139)" fontSize="11" textAnchor="end">{maxV.toLocaleString()}</text>
    </svg>
  );
}

export default function TwitchStatistik() {
  const zugang = useZugang();
  const [d, setD] = useState<Antwort | null>(null);
  const [kanal, setKanal] = useState('');
  const [periode, setPeriode] = useState('woche');
  const [fehler, setFehler] = useState('');
  const [neu, setNeu] = useState({ login: '', vip: '' });
  const darf = zugang.vip || zugang.admin;

  const laden = useCallback(() => {
    fetch(`/api/twitch-statistik${kanal ? `?kanal=${encodeURIComponent(kanal)}` : ''}`, { cache: 'no-store' }).then((r) => r.json())
      .then((j: Antwort) => { if (j?.ok) { setD(j); setFehler(''); } else setFehler(j?.error ? t(j.error) : t('Nicht ladbar')); })
      .catch(() => setFehler(t('Nicht ladbar')));
  }, [kanal]);
  useEffect(() => {
    if (!darf) return undefined;
    laden();
    const id = window.setInterval(laden, 60_000);
    return () => window.clearInterval(id);
  }, [darf, laden]);

  const aendern = async (body: Record<string, unknown>) => {
    const j = await fetch('/api/twitch-statistik', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => null);
    if (!j?.ok) { setFehler(j?.error ? t(j.error) : t('Das hat nicht geklappt.')); return; }
    setFehler(''); setNeu({ login: '', vip: '' }); laden();
  };

  if (zugang.laedt) return <LadeSchirm />;
  if (!darf) {
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-950 px-4 text-center text-slate-100">
        <div className="max-w-md">
          <h1 className="text-xl font-bold"><T>Nur für VIPs</T></h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-500"><T>Die Twitch-Statistik gibt es für VIPs, denen CompHub sie freigeschaltet hat.</T></p>
          <Link href="/sign-in" className="mt-6 inline-block rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400"><T>Zur Anmeldung</T></Link>
        </div>
      </main>
    );
  }

  const a = d?.auswertung ?? null;
  const p = a?.perioden.find((x) => x.periode === periode) ?? null;
  const werte: Array<[string, string, string?]> = p ? [
    [t('Spitze'), zahl(p.peak), t('mit Raids')],
    [t('Spitze ohne Raid'), zahl(p.peakOhneRaid)],
    [t('Ø Zuschauer'), zahl(p.durchschnitt)],
    [t('Neue Follower'), p.neueFollower === null ? '—' : `${p.neueFollower >= 0 ? '+' : ''}${p.neueFollower.toLocaleString()}`],
    [t('Chatter'), zahl(p.chatter), `${t('max.')} ${zahl(p.chatterMax)} ${t('je Stream')}`],
    [t('Nachrichten'), zahl(p.nachrichten)],
    [t('Raids'), zahl(p.raids), p.raids ? `${zahl(p.raidZuschauer)} ${t('Zuschauer')}` : undefined],
    [t('Streams'), zahl(p.streams), `${p.stunden.toLocaleString()} h`],
  ] : [];

  return (
    <main className="min-h-screen bg-zinc-950 text-slate-100">
      <div className="mx-auto max-w-[1300px] px-4 py-6">
        <section className="relative mb-5 overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8">
          <span aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-violet-500/25 blur-3xl" />
          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-400">Twitch</p>
              <h1 className="mt-1 text-3xl font-extrabold text-white sm:text-4xl">{a?.name ?? <T>Twitch-Statistik</T>}</h1>
              {a && <p className="mt-2 text-sm text-slate-400">{zahl(a.follower)} <T>Follower</T>{a.zaehltSeit ? <> · <T>gezählt seit</T> {new Date(a.zaehltSeit).toLocaleDateString()}</> : null}</p>}
            </div>
            {d && d.kanaele.length > 1 && (
              <select value={d.gewaehlt ?? ''} onChange={(e) => setKanal(e.target.value)}
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500">
                {d.kanaele.map((k) => <option key={k.login} value={k.id ?? k.login}>{k.name}{d.admin ? ` (${k.vipName})` : ''}</option>)}
              </select>
            )}
          </div>
        </section>

        {fehler && <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">{fehler}</p>}
        {!d && !fehler && <p className="text-sm text-slate-500"><T>Wird geladen …</T></p>}
        {d && !d.kanaele.length && (
          <p className={`${karte} text-sm text-slate-400`}>
            {d.admin ? <T>Noch kein Kanal eingetragen - unten einen Twitch-Kanal und den VIP wählen, der ihn sehen darf.</T>
              : <T>Für dein Konto ist noch kein Twitch-Kanal freigeschaltet. Melde dich bei CompHub auf Discord.</T>}
          </p>
        )}
        {d && d.kanaele.length > 0 && !a && (
          <p className={`${karte} text-sm text-slate-400`}><T>Der Kanal ist eingetragen - die ersten Werte kommen beim nächsten Stream (gezählt wird ab jetzt, Twitch gibt keine Vergangenheit heraus).</T></p>
        )}

        {a && (
          <>
            <div className="mb-4 inline-flex gap-1 rounded-full border border-zinc-800 bg-zinc-900 p-1">
              {Object.entries(PERIODEN).map(([k, name]) => (
                <button key={k} type="button" onClick={() => setPeriode(k)}
                  className={`rounded-full px-4 py-2 text-sm font-bold transition ${periode === k ? 'bg-violet-500 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>
                  <T>{name}</T>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {werte.map(([titel, wert, unter]) => (
                <div key={titel} className={karte}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{titel}</p>
                  <p className="mt-1 text-2xl font-extrabold tabular-nums text-white">{wert}</p>
                  {unter && <p className="mt-0.5 text-[11px] text-slate-500">{unter}</p>}
                </div>
              ))}
            </div>

            {a.verlauf && (
              <section className={`${karte} mt-5`}>
                <h2 className="mb-3 text-sm font-semibold">{a.verlauf.live ? <T>Laufender Stream</T> : <T>Letzter Stream</T>} · <T>Zuschauer</T></h2>
                <Verlauf v={a.verlauf} />
              </section>
            )}

            <section className={`${karte} mt-5 overflow-x-auto`}>
              <h2 className="mb-3 text-sm font-semibold"><T>Letzte Streams</T></h2>
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="py-2 pr-3"><T>Datum</T></th><th className="py-2 pr-3"><T>Titel</T></th>
                    <th className="py-2 pr-3 text-right"><T>Dauer</T></th><th className="py-2 pr-3 text-right"><T>Spitze</T></th>
                    <th className="py-2 pr-3 text-right"><T>ohne Raid</T></th><th className="py-2 pr-3 text-right">Ø</th>
                    <th className="py-2 pr-3 text-right"><T>Chatter</T></th><th className="py-2 text-right"><T>Raids</T></th>
                  </tr>
                </thead>
                <tbody>
                  {a.streams.map((s) => (
                    <tr key={s.id} className="border-t border-zinc-800/80">
                      <td className="py-2 pr-3 tabular-nums text-slate-400">{s.live ? <span className="font-bold text-red-400">LIVE</span> : new Date(s.start).toLocaleDateString()}</td>
                      <td className="max-w-[320px] truncate py-2 pr-3 text-slate-200" title={s.titel}>{s.titel}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-400">{Math.floor(s.minuten / 60)}:{String(s.minuten % 60).padStart(2, '0')}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-100">{zahl(s.peak)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-300">{zahl(s.peakOhneRaid)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-300">{zahl(s.durchschnitt)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-300">{zahl(s.chatter)}</td>
                      <td className="py-2 text-right tabular-nums text-slate-300">{s.raids ? `${s.raids} (${zahl(s.raidZuschauer)})` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}

        {d?.admin && (
          <section className={`${karte} mt-5`}>
            <h2 className="text-sm font-semibold"><T>Kanäle freigeben (Admin)</T></h2>
            <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void aendern({ aktion: 'eintragen', login: neu.login, vip: neu.vip }); }}>
              <input value={neu.login} onChange={(e) => setNeu({ ...neu, login: e.target.value })} placeholder={t('Twitch-Name')}
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500" />
              <select value={neu.vip} onChange={(e) => setNeu({ ...neu, vip: e.target.value })}
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500">
                <option value="">{t('VIP wählen')}</option>
                {(d.vips ?? []).map((v) => <option key={v.ident} value={v.ident}>{v.name}</option>)}
              </select>
              <button type="submit" disabled={!neu.login || !neu.vip} className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:opacity-40">
                <T>Freigeben</T>
              </button>
            </form>
            {d.kanaele.length > 0 && (
              <ul className="mt-4 space-y-1.5 text-sm">
                {d.kanaele.map((k) => (
                  <li key={k.login} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                    <span className="text-slate-200">{k.name} <span className="text-xs text-slate-500">→ {k.vipName}</span></span>
                    <button type="button" onClick={() => void aendern({ aktion: 'austragen', login: k.login })} className="text-xs text-slate-500 transition hover:text-rose-400"><T>Entfernen</T></button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
