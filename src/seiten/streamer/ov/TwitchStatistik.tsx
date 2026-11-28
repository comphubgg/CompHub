import { motion } from 'framer-motion';
import { Laedt, Leer, Marke, Segment } from '../../../ds/Bausteine';
import { useCallback, useEffect, useState } from 'react';
import T from './T';
import LadeSchirm from './LadeSchirm';
import NurVip from './NurVip';
import { useZugang } from './zugang';
import { useSprache, useT } from './sprache';

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
const zahl = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString());
const dauer = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;

/** Der Zuschauerverlauf eines Streams als Flaeche, Raids als Marken. */
function Verlauf({ v }: { v: NonNullable<Auswertung['verlauf']> }) {
  const t = useT();
  if (v.punkte.length < 2) return <p className="text-xs text-white/45"><T>Noch zu wenige Werte für einen Verlauf.</T></p>;
  const B = 800; const H = 160; const maxM = v.punkte[v.punkte.length - 1][0] || 1; const maxV = Math.max(...v.punkte.map((p) => p[1]), 1);
  const x = (m: number) => (m / maxM) * B; const y = (z: number) => H - (z / maxV) * (H - 30) - 4; // oben Platz fuer die Beschriftung (Spitze, Raid) - sonst lag die Zahl auf der Kurve
  const linie = v.punkte.map(([m, z], i) => `${i ? 'L' : 'M'}${x(m).toFixed(1)},${y(z).toFixed(1)}`).join(' ');
  const start = Date.parse(v.start);
  return (
    <svg viewBox={`0 0 ${B} ${H + 18}`} className="w-full" role="img" aria-label={t('Zuschauerverlauf')}>
      <defs><linearGradient id="ts-flaeche" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="rgb(var(--akz))" stopOpacity="0.35" /><stop offset="1" stopColor="rgb(var(--akz))" stopOpacity="0" /></linearGradient></defs>
      <path d={`${linie} L${B},${H} L0,${H} Z`} fill="url(#ts-flaeche)" />
      <path d={linie} fill="none" stroke="rgb(var(--akz))" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      {v.raids.map((r) => {
        const m = (Date.parse(r.zeit) - start) / 60_000;
        if (m < 0 || m > maxM) return null;
        return <g key={r.zeit}><line x1={x(m)} x2={x(m)} y1={4} y2={H} stroke="rgb(34 197 94)" strokeDasharray="3 3" /><text x={x(m) + 4} y={14} fill="rgb(74 222 128)" fontSize="11">Raid {r.zuschauer}</text></g>;
      })}
      <text x={0} y={H + 15} fill="rgba(255,255,255,0.4)" fontSize="11">0 min</text>
      <text x={B} y={H + 15} fill="rgba(255,255,255,0.4)" fontSize="11" textAnchor="end">{maxM} min</text>
      <text x={B} y={14} fill="rgba(255,255,255,0.4)" fontSize="11" textAnchor="end">{maxV.toLocaleString()}</text>
    </svg>
  );
}

function Kachel({ titel, wert, unter, ton, gross = false }: { titel: string; wert: string; unter?: string; ton?: 'live' | 'akz'; gross?: boolean }) {
  return (
    <div className={`rounded-2xl border ${gross ? 'flex flex-col justify-center border-white/[0.07] bg-fl p-5' : 'p-4'} ${ton === 'live' ? 'border-red-500/25 bg-red-500/[0.07]' : gross ? '' : 'border-white/[0.06] bg-black/25'}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">{titel}</p>
      <p className={`zahl mt-1 font-extrabold leading-none tracking-tight ${gross ? 'text-4xl' : 'text-2xl'} ${ton === 'akz' ? 'text-akz' : 'text-white'}`}>{wert}</p>
      {unter && <p className="mt-1.5 text-[11px] text-white/45">{unter}</p>}
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
  if (!darf && zugang.vip) return <NurVip titel="Twitch statistics isn’t switched on for your account yet" text="CompHub switches it on per VIP – write us a quick message on Discord." />;
  if (!darf) return <NurVip text="Twitch statistics are for VIPs that CompHub has switched them on for." />;

  const a = d?.auswertung ?? null;
  const w = a?.werte ?? null;
  const verfuegbar = a ? ARTEN.filter(([k]) => a.einheiten[k]?.length) : [];

  const live = a?.live ?? null;
  return (
    <div className="space-y-5 text-white">
      {/* ------------------------------------------- Kopf: Kanal links, Zeitraum rechts */}
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
        <motion.div initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45 }} className="min-w-0">
          <p className="ueber">Twitch · Statistics</p>
          <h1 className="titel mt-1 truncate text-6xl lg:text-7xl">{a?.name ?? <T>Twitch-Statistik</T>}</h1>
          {a && <p className="mt-2 text-[15px] text-white/55"><span className="zahl font-semibold text-white">{zahl(a.follower)}</span> <T>Follower</T>{a.zaehltSeit ? <> · <T>gezählt seit</T> {new Date(a.zaehltSeit).toLocaleDateString(ort)}</> : null}
            {' · '}<a href={`https://twitch.tv/${a.login}`} target="_blank" rel="noreferrer" className="text-akz hover:brightness-125">twitch.tv/{a.login}</a></p>}
        </motion.div>
        <div className="flex flex-wrap items-center gap-2">
          {d && d.kanaele.length > 1 && (
            <select value={d.gewaehlt ?? ''} onChange={(e) => { setKanal(e.target.value); setWahl({}); }} className="eingabe !py-2">
              {d.kanaele.map((k) => <option key={k.login} value={k.id ?? k.login}>{k.name}{d.admin ? ` (${k.vipName})` : ''}</option>)}
            </select>
          )}
          {a && verfuegbar.length > 0 && <Segment id="ts-art" wert={a.art} wahl={verfuegbar.map(([k, name]) => ({ k, titel: t(name) }))} onWahl={(k) => setWahl({ art: k })} />}
          {a && (a.art === 'tag' || a.art === 'woche') && (
            <select value={a.einheit} onChange={(e) => setWahl({ art: a.art, einheit: e.target.value })} className="eingabe !py-2">
              {a.einheiten[a.art].map((e) => <option key={e} value={e}>{einheitText(a.art, e)}</option>)}
            </select>
          )}
        </div>
      </header>
      {a && (a.art === 'monat' || a.art === 'jahr') && (
        <div className="ohne-leiste -mt-1 flex gap-1.5 overflow-x-auto">
          {a.einheiten[a.art].map((e) => <button key={e} type="button" onClick={() => setWahl({ art: a.art, einheit: e })} className={`chip ${a.einheit === e ? 'chip-an' : ''}`}>{einheitText(a.art, e)}</button>)}
        </div>
      )}

      {fehler && <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">{fehler}</p>}
      {!d && !fehler && <Laedt text={t('Wird geladen …').replace(/ …$/, '')} />}
      {d && !d.kanaele.length && (
        <Leer text={d.admin ? <T>Noch kein Kanal eingetragen - unten einen Twitch-Kanal und den VIP wählen, der ihn sehen darf.</T>
          : <T>Für dein Konto ist noch kein Twitch-Kanal freigeschaltet. Melde dich bei CompHub auf Discord.</T>} />
      )}

      {/* ------------------------------------------- Buehne: Zuschauerverlauf gross, die vier wichtigsten Zahlen daneben */}
      {a && (a.verlauf || w) && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <section className={`fl-fest overflow-hidden ${live ? '!border-red-500/30' : ''}`}>
            {live && (
              <div className="flex flex-wrap items-center gap-3 border-b border-red-500/20 bg-red-500/[0.06] px-5 py-3">
                <Marke ton="rot" puls>Live</Marke>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{live.titel}</span>
                <span className="text-xs text-white/55">{live.spiel} · {dauer(live.minuten)} h</span>
              </div>
            )}
            <div className="p-5">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="titel text-3xl">{a.verlauf?.live ? <T>Laufender Stream</T> : <T>Letzter Stream</T>}</h2>
                <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40"><T>Zuschauer</T></span>
              </div>
              {a.verlauf ? <Verlauf v={a.verlauf} /> : <p className="text-xs text-white/45"><T>Noch zu wenige Werte für einen Verlauf.</T></p>}
              {live && (
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  <Kachel ton="live" titel={t('Zuschauer jetzt')} wert={zahl(live.zuschauer)} />
                  <Kachel ton="live" titel={t('Spitze bisher')} wert={zahl(live.peak)} />
                  <Kachel ton="live" titel={t('Ø bisher')} wert={zahl(live.durchschnitt)} />
                  <Kachel ton="live" titel={t('Chatter')} wert={zahl(live.chatter)} />
                  <Kachel ton="live" titel={t('Nachrichten')} wert={zahl(live.nachrichten)} />
                  <Kachel ton="live" titel={t('Raids')} wert={zahl(live.raids.length)} unter={live.raids.length ? live.raids.map((r) => `${r.von} (${r.zuschauer})`).join(', ') : undefined} />
                </div>
              )}
            </div>
          </section>
          {w && (
            <section className="grid grid-cols-2 gap-3 xl:grid-cols-1">
              <Kachel gross ton="akz" titel={t('Spitze')} wert={zahl(w.peak)} unter={t('mit Raids')} />
              <Kachel gross titel={t('Spitze ohne Raid')} wert={zahl(w.peakOhneRaid)} />
              <Kachel gross titel={t('Ø Zuschauer')} wert={zahl(w.durchschnitt)} />
              <Kachel gross titel={t('Neue Follower')} wert={w.neueFollower === null ? '—' : `${w.neueFollower >= 0 ? '+' : ''}${w.neueFollower.toLocaleString()}`} />
            </section>
          )}
        </div>
      )}

      {/* ------------------------------------------- weitere Zahlen des Zeitraums und die letzten 30 Tage (TwitchTracker) */}
      {w && (
        <section className="fl-fest p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="titel text-2xl">{a ? einheitText(a.art, a.einheit) : ''}</h2>
            {w.nurArchiv && <p className="text-xs text-white/45"><T>Für diesen Zeitraum gibt es nur Twitchs gespeicherte Streams (Dauer und Titel) - Zuschauer, Chatter und Raids zählt CompHub ab dem Eintragen.</T></p>}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kachel titel={t('Chatter')} wert={zahl(w.chatter)} unter={w.chatterMax !== null ? `${t('max.')} ${zahl(w.chatterMax)} ${t('je Stream')}` : undefined} />
            <Kachel titel={t('Nachrichten')} wert={zahl(w.nachrichten)} />
            <Kachel titel={t('Raids')} wert={zahl(w.raids)} unter={w.raids ? `${zahl(w.raidZuschauer)} ${t('Zuschauer')}` : undefined} />
            <Kachel titel={t('Streams')} wert={zahl(w.streams)} unter={`${w.stunden.toLocaleString()} h`} />
          </div>
        </section>
      )}
      {a?.tracker && (
        <section className="fl-fest p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="titel text-2xl"><T>Letzte 30 Tage</T></h2>
            <span className="text-[11px] text-white/40"><T>Quelle</T>: TwitchTracker</span>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Kachel titel={t('Ø Zuschauer')} wert={zahl(a.tracker.avgViewers)} />
            <Kachel titel={t('Spitze')} wert={zahl(a.tracker.maxViewers)} />
            <Kachel titel={t('Gestreamt')} wert={`${a.tracker.stunden.toLocaleString()} h`} />
            <Kachel titel={t('Watch-Hours')} wert={zahl(a.tracker.watchHours)} />
            <Kachel titel={t('Neue Follower')} wert={`${a.tracker.follower >= 0 ? '+' : ''}${a.tracker.follower.toLocaleString()}`} />
          </div>
        </section>
      )}

      {/* ------------------------------------------- jeder Stream des Zeitraums */}
      {a && a.streams.length > 0 && (
        <section className="fl-fest overflow-x-auto p-2 sm:p-3">
          <h2 className="titel px-3 pb-1 pt-2 text-2xl"><T>Streams</T> <span className="zahl text-base text-white/35">{a.streams.length}</span></h2>
          <table className="tabelle min-w-[680px]">
            <thead>
              <tr>
                <th><T>Datum</T></th><th><T>Titel</T></th>
                <th className="!text-right"><T>Dauer</T></th><th className="!text-right"><T>Spitze</T></th>
                <th className="!text-right"><T>ohne Raid</T></th><th className="!text-right">Ø</th>
                <th className="!text-right"><T>Chatter</T></th><th className="!text-right"><T>Raids</T></th>
              </tr>
            </thead>
            <tbody>
              {a.streams.map((s) => (
                <tr key={s.id}>
                  <td className="zahl whitespace-nowrap text-white/55">{s.live ? <Marke ton="rot">Live</Marke> : new Date(s.start).toLocaleDateString(ort)}</td>
                  <td className="max-w-[360px] truncate text-white/85" title={s.titel}>
                    {s.titel}{s.nurArchiv && <span className="ml-2 rounded bg-white/[0.07] px-1.5 py-0.5 text-[10px] text-white/55"><T>Archiv</T></span>}
                  </td>
                  <td className="zahl text-right text-white/55">{dauer(s.minuten)}</td>
                  <td className="zahl text-right font-semibold text-white">{s.nurArchiv ? '—' : zahl(s.peak)}</td>
                  <td className="zahl text-right text-white/70">{s.nurArchiv ? '—' : zahl(s.peakOhneRaid)}</td>
                  <td className="zahl text-right text-white/70">{s.nurArchiv ? '—' : zahl(s.durchschnitt)}</td>
                  <td className="zahl text-right text-white/70">{s.nurArchiv ? '—' : zahl(s.chatter)}</td>
                  <td className="zahl text-right text-white/70">{s.raids ? `${s.raids} (${zahl(s.raidZuschauer)})` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {d?.admin && (
        <section className="fl-fest p-5">
          <h2 className="titel text-2xl"><T>Kanäle freigeben (Admin)</T></h2>
          <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void aendern({ aktion: 'eintragen', login: neu.login, vip: neu.vip }); }}>
            <input value={neu.login} onChange={(e) => setNeu({ ...neu, login: e.target.value })} placeholder={t('Twitch-Name')} className="eingabe !py-2" />
            <select value={neu.vip} onChange={(e) => setNeu({ ...neu, vip: e.target.value })} className="eingabe !py-2">
              <option value="">{t('VIP wählen')}</option>
              {(d.vips ?? []).map((v) => <option key={v.ident} value={v.ident}>{v.name}</option>)}
            </select>
            <button type="submit" disabled={!neu.login || !neu.vip} className="knopf-prim"><T>Freigeben</T></button>
          </form>
          {d.kanaele.length > 0 && (
            <ul className="mt-4 grid gap-1.5 text-sm sm:grid-cols-2 xl:grid-cols-3">
              {d.kanaele.map((k) => (
                <li key={k.login} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/25 px-3 py-2">
                  <span className="min-w-0 truncate text-white/85">{k.name} <span className="text-xs text-white/45">→ {k.vipName}</span></span>
                  <button type="button" onClick={() => void aendern({ aktion: 'austragen', login: k.login })} className="text-xs text-white/45 transition hover:text-rose-400"><T>Entfernen</T></button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
