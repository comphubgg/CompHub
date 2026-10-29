'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import T from '@/app/components/T';
import LadeSchirm from '@/app/components/LadeSchirm';
import VipVorhang from '@/app/overlays/VipVorhang';
import { useZugang } from '@/app/lib/zugang';
import { useSprache, useT } from '@/app/components/SprachProvider';

/*
 * Twitch-Statistik fuer VIPs (Betreiber, 27.10.2026): Tag, Woche, Monat, Jahr, gesamt - Spitze mit und ohne Raid, Durchschnitt, neue Follower, Chatter, Raids.
 * 29.10.2026: Zeitraeume wie im Kalender und nur die mit Daten, Vergangenheit aus Twitchs gespeicherten Streams und TwitchTracker, Live-Werte waehrend des
 * Streams. Der Admin traegt ein, welcher Kanal gezaehlt wird und welcher VIP ihn sieht. Daten: /api/twitch-statistik (lib/twitchStatistik).
 */

interface Werte {
  streams: number; stunden: number; peak: number | null; peakOhneRaid: number | null; durchschnitt: number | null; chatter: number | null; chatterMax: number | null;
  nachrichten: number | null; raids: number; raidZuschauer: number; neueFollower: number | null; nurArchiv: boolean;
}
interface Stream { id: string; start: string; live: boolean; titel: string; minuten: number; peak: number; peakOhneRaid: number; durchschnitt: number; chatter: number; raids: number; raidZuschauer: number; nurArchiv: boolean }
type Art = 'tag' | 'woche' | 'monat' | 'jahr' | 'gesamt';
interface Auswertung {
  login: string; name: string; follower: number | null; zaehltSeit: string | null;
  einheiten: Record<Art, string[]>; art: Art; einheit: string; werte: Werte; streams: Stream[];
  verlauf: { start: string; live: boolean; punkte: Array<[number, number]>; raids: Array<{ von: string; zuschauer: number; zeit: string }> } | null;
  live: { seit: string; zuschauer: number; titel: string; spiel: string; minuten: number; peak: number; durchschnitt: number | null; chatter: number | null; nachrichten: number | null; raids: Array<{ von: string; zuschauer: number }> } | null;
  tracker: { avgViewers: number; maxViewers: number; stunden: number; watchHours: number; follower: number; followerGesamt: number } | null;
}
interface Antwort {
  ok: boolean; error?: string; admin: boolean; gewaehlt: string | null; auswertung: Auswertung | null;
  kanaele: Array<{ login: string; id: string | null; name: string; vipName: string; seit: number }>;
  vips?: Array<{ ident: string; name: string }>;
}

const ARTEN: Array<[Art, string]> = [['tag', 'Tag'], ['woche', 'Woche'], ['monat', 'Monat'], ['jahr', 'Jahr'], ['gesamt', 'Gesamt']];
const karte = 'rounded-xl border border-zinc-800 bg-zinc-900/40 p-5';
const zahl = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString());
const dauer = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;

/** Der Zuschauerverlauf eines Streams als Flaeche, Raids als Marken. */
function Verlauf({ v }: { v: NonNullable<Auswertung['verlauf']> }) {
  const t = useT();
  if (v.punkte.length < 2) return <p className="text-xs text-slate-500"><T>Noch zu wenige Werte für einen Verlauf.</T></p>;
  const B = 800; const H = 160; const maxM = v.punkte[v.punkte.length - 1][0] || 1; const maxV = Math.max(...v.punkte.map((p) => p[1]), 1);
  const x = (m: number) => (m / maxM) * B; const y = (z: number) => H - (z / maxV) * (H - 14) - 4;
  const linie = v.punkte.map(([m, z], i) => `${i ? 'L' : 'M'}${x(m).toFixed(1)},${y(z).toFixed(1)}`).join(' ');
  const start = Date.parse(v.start);
  return (
    <svg viewBox={`0 0 ${B} ${H + 18}`} className="w-full" role="img" aria-label={t('Zuschauerverlauf')}>
      <path d={`${linie} L${B},${H} L0,${H} Z`} fill="rgb(139 92 246 / 0.15)" />
      <path d={linie} fill="none" stroke="rgb(167 139 250)" strokeWidth="2" />
      {v.raids.map((r) => {
        const m = (Date.parse(r.zeit) - start) / 60_000;
        if (m < 0 || m > maxM) return null;
        return <g key={r.zeit}><line x1={x(m)} x2={x(m)} y1={4} y2={H} stroke="rgb(34 197 94)" strokeDasharray="3 3" /><text x={x(m) + 4} y={14} fill="rgb(74 222 128)" fontSize="11">Raid {r.zuschauer}</text></g>;
      })}
      <text x={0} y={H + 15} fill="rgb(100 116 139)" fontSize="11">0 min</text>
      <text x={B} y={H + 15} fill="rgb(100 116 139)" fontSize="11" textAnchor="end">{maxM} min</text>
      <text x={B} y={14} fill="rgb(100 116 139)" fontSize="11" textAnchor="end">{maxV.toLocaleString()}</text>
    </svg>
  );
}

function Kachel({ titel, wert, unter, ton }: { titel: string; wert: string; unter?: string; ton?: 'live' }) {
  return (
    <div className={`rounded-xl border p-4 ${ton === 'live' ? 'border-red-500/30 bg-red-500/10' : 'border-zinc-800 bg-zinc-900/40'}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{titel}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums text-white">{wert}</p>
      {unter && <p className="mt-0.5 text-[11px] text-slate-500">{unter}</p>}
    </div>
  );
}

export default function TwitchStatistik() {
  const zugang = useZugang();
  const { sprache, t } = useSprache();
  const ort = sprache === 'de' ? 'de-DE' : 'en-GB';
  const [d, setD] = useState<Antwort | null>(null);
  const [kanal, setKanal] = useState('');
  const [wahl, setWahl] = useState<{ art?: Art; einheit?: string }>({});
  const [fehler, setFehler] = useState('');
  const [neu, setNeu] = useState({ login: '', vip: '' });
  const darf = zugang.admin || (zugang.vip && zugang.rechte.includes('twitchstatistik'));

  const laden = useCallback(() => {
    const q = new URLSearchParams();
    if (kanal) q.set('kanal', kanal);
    if (wahl.art) q.set('art', wahl.art);
    if (wahl.einheit) q.set('einheit', wahl.einheit);
    fetch(`/api/twitch-statistik?${q}`, { cache: 'no-store' }).then((r) => r.json())
      .then((j: Antwort) => { if (j?.ok) { setD(j); setFehler(''); } else setFehler(j?.error ? t(j.error) : t('Nicht ladbar')); })
      .catch(() => setFehler(t('Nicht ladbar')));
  }, [kanal, wahl]);
  const istLive = Boolean(d?.auswertung?.live);
  useEffect(() => {
    if (!darf) return undefined;
    laden();
    // Waehrend eines Streams alle dreissig Sekunden (Live-Werte), sonst jede Minute.
    const id = window.setInterval(laden, istLive ? 30_000 : 60_000);
    return () => window.clearInterval(id);
  }, [darf, laden, istLive]);

  const aendern = async (body: Record<string, unknown>) => {
    const j = await fetch('/api/twitch-statistik', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => null);
    if (!j?.ok) { setFehler(j?.error ? t(j.error) : t('Das hat nicht geklappt.')); return; }
    setFehler(''); setNeu({ login: '', vip: '' }); laden();
  };

  /** Eine Kalender-Einheit lesbar: Tag "29.10.2026", Woche "KW 44 · 2026", Monat "Oktober 2026", Jahr "2026". */
  const einheitText = (art: Art, e: string) => {
    if (art === 'tag') return new Date(`${e}T12:00:00Z`).toLocaleDateString(ort, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    if (art === 'woche') { const [j, w] = e.split('-W'); return `${t('KW')} ${Number(w)} · ${j}`; }
    if (art === 'monat') return new Date(`${e}-15T12:00:00Z`).toLocaleDateString(ort, { month: 'long', year: 'numeric' });
    if (art === 'jahr') return e;
    return t('Gesamt');
  };

  if (zugang.laedt) return <LadeSchirm />;
  if (!darf && zugang.vip) return <VipVorhang titel="Die Twitch-Statistik ist für dein Konto noch nicht freigeschaltet." text="CompHub schaltet es je VIP frei - schreib uns kurz auf Discord." />;
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
  const w = a?.werte ?? null;
  const verfuegbar = a ? ARTEN.filter(([k]) => a.einheiten[k]?.length) : [];

  return (
    <main className="min-h-screen bg-zinc-950 text-slate-100">
      <div className="mx-auto max-w-[1300px] px-4 py-6">
        <section className="relative mb-5 overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8">
          <span aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-violet-500/25 blur-3xl" />
          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-400">Twitch</p>
              <h1 className="mt-1 text-3xl font-extrabold text-white sm:text-4xl">{a?.name ?? <T>Twitch-Statistik</T>}</h1>
              {a && <p className="mt-2 text-sm text-slate-400">{zahl(a.follower)} <T>Follower</T>{a.zaehltSeit ? <> · <T>gezählt seit</T> {new Date(a.zaehltSeit).toLocaleDateString(ort)}</> : null}</p>}
            </div>
            {d && d.kanaele.length > 1 && (
              <select value={d.gewaehlt ?? ''} onChange={(e) => { setKanal(e.target.value); setWahl({}); }}
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

        {/* ------------------------------------------- Live */}
        {a?.live && (
          <section className="mb-5 rounded-2xl border border-red-500/40 bg-red-500/5 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-2 rounded-full bg-red-500 px-3 py-1 text-xs font-extrabold text-white"><span className="h-2 w-2 animate-pulse rounded-full bg-white" />LIVE</span>
              <span className="text-sm font-semibold text-slate-100">{a.live.titel}</span>
              <span className="text-xs text-slate-400">{a.live.spiel} · {dauer(a.live.minuten)} h</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-6">
              <Kachel ton="live" titel={t('Zuschauer jetzt')} wert={zahl(a.live.zuschauer)} />
              <Kachel ton="live" titel={t('Spitze bisher')} wert={zahl(a.live.peak)} />
              <Kachel ton="live" titel={t('Ø bisher')} wert={zahl(a.live.durchschnitt)} />
              <Kachel ton="live" titel={t('Chatter')} wert={zahl(a.live.chatter)} />
              <Kachel ton="live" titel={t('Nachrichten')} wert={zahl(a.live.nachrichten)} />
              <Kachel ton="live" titel={t('Raids')} wert={zahl(a.live.raids.length)} unter={a.live.raids.length ? a.live.raids.map((r) => `${r.von} (${r.zuschauer})`).join(', ') : undefined} />
            </div>
          </section>
        )}

        {a && verfuegbar.length > 0 && (
          <>
            {/* ------------------------------------------- Zeitraum wie im Kalender */}
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <div className="inline-flex gap-1 rounded-full border border-zinc-800 bg-zinc-900 p-1">
                {verfuegbar.map(([k, name]) => (
                  <button key={k} type="button" onClick={() => setWahl({ art: k })}
                    className={`rounded-full px-4 py-2 text-sm font-bold transition ${a.art === k ? 'bg-violet-500 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>
                    <T>{name}</T>
                  </button>
                ))}
              </div>
              {a.art !== 'gesamt' && (a.art === 'tag' || a.art === 'woche') && (
                <select value={a.einheit} onChange={(e) => setWahl({ art: a.art, einheit: e.target.value })}
                  className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-violet-500">
                  {a.einheiten[a.art].map((e) => <option key={e} value={e}>{einheitText(a.art, e)}</option>)}
                </select>
              )}
            </div>
            {(a.art === 'monat' || a.art === 'jahr') && (
              <div className="mb-4 flex flex-wrap gap-2">
                {a.einheiten[a.art].map((e) => (
                  <button key={e} type="button" onClick={() => setWahl({ art: a.art, einheit: e })}
                    className={`rounded-lg border px-3 py-1.5 text-sm transition ${a.einheit === e ? 'border-violet-500 bg-violet-500/15 text-violet-200' : 'border-zinc-800 text-slate-400 hover:border-zinc-600 hover:text-slate-200'}`}>
                    {einheitText(a.art, e)}
                  </button>
                ))}
              </div>
            )}

            {w && (
              <>
                {w.nurArchiv && (
                  <p className="mb-3 text-xs text-slate-500"><T>Für diesen Zeitraum gibt es nur Twitchs gespeicherte Streams (Dauer und Titel) - Zuschauer, Chatter und Raids zählt CompHub ab dem Eintragen.</T></p>
                )}
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Kachel titel={t('Spitze')} wert={zahl(w.peak)} unter={t('mit Raids')} />
                  <Kachel titel={t('Spitze ohne Raid')} wert={zahl(w.peakOhneRaid)} />
                  <Kachel titel={t('Ø Zuschauer')} wert={zahl(w.durchschnitt)} />
                  <Kachel titel={t('Neue Follower')} wert={w.neueFollower === null ? '—' : `${w.neueFollower >= 0 ? '+' : ''}${w.neueFollower.toLocaleString()}`} />
                  <Kachel titel={t('Chatter')} wert={zahl(w.chatter)} unter={w.chatterMax !== null ? `${t('max.')} ${zahl(w.chatterMax)} ${t('je Stream')}` : undefined} />
                  <Kachel titel={t('Nachrichten')} wert={zahl(w.nachrichten)} />
                  <Kachel titel={t('Raids')} wert={zahl(w.raids)} unter={w.raids ? `${zahl(w.raidZuschauer)} ${t('Zuschauer')}` : undefined} />
                  <Kachel titel={t('Streams')} wert={zahl(w.streams)} unter={`${w.stunden.toLocaleString()} h`} />
                </div>
              </>
            )}
          </>
        )}

        {/* ------------------------------------------- TwitchTracker: die letzten 30 Tage, auch vor dem Eintragen */}
        {a?.tracker && (
          <section className={`${karte} mt-5`}>
            <h2 className="text-sm font-semibold"><T>Letzte 30 Tage</T> <span className="text-xs font-normal text-slate-500">· <T>Quelle</T>: TwitchTracker</span></h2>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
              <Kachel titel={t('Ø Zuschauer')} wert={zahl(a.tracker.avgViewers)} />
              <Kachel titel={t('Spitze')} wert={zahl(a.tracker.maxViewers)} />
              <Kachel titel={t('Gestreamt')} wert={`${a.tracker.stunden.toLocaleString()} h`} />
              <Kachel titel={t('Watch-Hours')} wert={zahl(a.tracker.watchHours)} />
              <Kachel titel={t('Neue Follower')} wert={`${a.tracker.follower >= 0 ? '+' : ''}${a.tracker.follower.toLocaleString()}`} />
            </div>
          </section>
        )}

        {a?.verlauf && (
          <section className={`${karte} mt-5`}>
            <h2 className="mb-3 text-sm font-semibold">{a.verlauf.live ? <T>Laufender Stream</T> : <T>Letzter Stream</T>} · <T>Zuschauer</T></h2>
            <Verlauf v={a.verlauf} />
          </section>
        )}

        {a && a.streams.length > 0 && (
          <section className={`${karte} mt-5 overflow-x-auto`}>
            <h2 className="mb-3 text-sm font-semibold"><T>Streams</T> · {einheitText(a.art, a.einheit)}</h2>
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
                    <td className="py-2 pr-3 tabular-nums text-slate-400">{s.live ? <span className="font-bold text-red-400">LIVE</span> : new Date(s.start).toLocaleDateString(ort)}</td>
                    <td className="max-w-[320px] truncate py-2 pr-3 text-slate-200" title={s.titel}>
                      {s.titel}{s.nurArchiv && <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-slate-400"><T>Archiv</T></span>}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-400">{dauer(s.minuten)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-100">{s.nurArchiv ? '—' : zahl(s.peak)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-300">{s.nurArchiv ? '—' : zahl(s.peakOhneRaid)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-300">{s.nurArchiv ? '—' : zahl(s.durchschnitt)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-300">{s.nurArchiv ? '—' : zahl(s.chatter)}</td>
                    <td className="py-2 text-right tabular-nums text-slate-300">{s.raids ? `${s.raids} (${zahl(s.raidZuschauer)})` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
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
