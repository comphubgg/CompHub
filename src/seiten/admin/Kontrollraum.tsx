import { motion } from 'framer-motion';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Abschnitt, Flaeche, Kennzahl, Marke, SeitenKopf, dauer, useJetzt } from '../../ds/Bausteine';
import { CupBild, LiveMarke, RegionMarke } from '../comp/events/teile';
import { REGION_NAME, cupLink, laeuft, stufeName, type Cup, type Fenster } from '../comp/events/gemeinsam';
import { GRUPPEN, WERKZEUGE, passt } from './werkzeuge';
import { langsam, laufText, laufZeile, ms, replayStand, replaysAuffaellig, useAbruf, vor, type Job, type Zentrale } from './daten';

/*
 * Der Kontrollraum - die Startseite des Admin-Bereichs (Design-System 3.0, 28.11.2026; Betreiber: "nichts 1:1 gleich").
 * Wofuer die Seite da ist: in drei Sekunden sehen, was JETZT Aufmerksamkeit braucht. Lesereihenfolge:
 *   1. Kopf mit einem Satz ("2 things need you" / "All quiet") und der Zahlenleiste (online, Posteingang, Cups live, Laeufe mit Problem, Replays)
 *   2. links "Needs you": eine nach Dringlichkeit sortierte Liste (gescheiterte Laeufe rot, Warnungen/Wartendes amber), darunter alle Laeufe und
 *      die Ladezeiten; rechts was live ist (laufende Cups mit Banner und Restzeit, der Replay-Sammler), der Posteingang und wer online ist
 *   3. alle Werkzeuge als Kacheln mit Suche (Enter oeffnet den ersten Treffer)
 * Nur echte Daten: /api/admin/zentrale, /api/replays (+ ?live=1), /api/cup-catalog, /api/kontakt, /api/admin/anwesend, /api/admin/vip-panel,
 * /api/admin/foto-credits, /api/vips?alle=1. Was nicht antwortet, fehlt still bzw. steht als eine Zeile da - nie eine erfundene Zahl.
 */

interface Person { kennung: string; name: string; art: 'konto' | 'vip'; zuletzt: number; online: boolean; sitzungen?: Array<{ von: number; bis: number; geraet?: { art: string; system: string; browser: string; land?: string } }> }
interface Meldung { id: string; zeit: number; thema: string; text: string; vonName: string; erledigt: boolean }
interface VipZugang { name: string; vipBis: number | null; fristLoescht: boolean; aktiv: boolean }
interface CreditZeile { foto: boolean; credit: { quelle?: string; fotograf?: string; bestaetigt: boolean } | null }
interface Sammler { schleife?: { zeit?: string; beendet?: boolean; verlauf?: Array<{ zeit: string; live: number | null }> } | null; schnell?: { ok?: boolean; quelle?: string; fehler?: string; zeit?: string } | null }

type Ton = 'rot' | 'gelb' | 'still';
interface Punkt { ton: Ton; titel: ReactNode; text?: ReactNode; zu?: string; extern?: string; knopf: string }
const TON: Record<Ton, { strich: string; punkt: string }> = {
  rot: { strich: 'bg-red-500 shadow-[0_0_18px_rgba(239,68,68,0.7)]', punkt: 'bg-red-500' },
  gelb: { strich: 'bg-akz shadow-[0_0_18px_rgb(var(--akz)/0.6)]', punkt: 'bg-akz' },
  still: { strich: 'bg-white/25', punkt: 'bg-white/40' },
};
const AMPEL: Record<Job['ampel'], string> = { ok: 'bg-emerald-400', warnung: 'bg-akz', fehler: 'bg-red-500', unbekannt: 'bg-white/30' };
const THEMA: Record<string, string> = { hilfe: 'help', idee: 'idea', anderes: 'other' };
const TAG = 864e5;

/** Verlauf als feine Linie, letzter Wert als Punkt. */
function Linie({ werte, warn }: { werte: number[]; warn: boolean }) {
  if (werte.length < 2) return <div className="h-8" />;
  const max = Math.max(...werte, 1);
  const pkt = werte.map((w, i) => [(i / (werte.length - 1)) * 100, 30 - (w / max) * 27] as const);
  const [lx, ly] = pkt[pkt.length - 1];
  const farbe = warn ? 'rgb(var(--akz))' : 'rgba(255,255,255,0.55)';
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-8 w-full overflow-visible">
      <polygon points={`0,32 ${pkt.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} 100,32`} fill={warn ? 'rgb(var(--akz) / 0.12)' : 'rgba(255,255,255,0.05)'} />
      <polyline points={pkt.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} fill="none" stroke={farbe} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r="2" fill={farbe} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Kopfzeile({ titel, rechts }: { titel: ReactNode; rechts?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3.5">
      <span className="h-4 w-1 rounded-full bg-akz" />
      <h2 className="titel text-2xl">{titel}</h2>
      {rechts && <div className="ml-auto flex items-center gap-2 text-xs text-white/45">{rechts}</div>}
    </div>
  );
}

export default function Kontrollraum() {
  const jetzt = useJetzt(1000);
  const zentrale = useAbruf<Zentrale>('/api/admin/zentrale', 5 * 60_000);
  const replays = useAbruf<{ fenster?: Array<{ datum?: number; zaehler?: Record<string, number> }> }>('/api/replays', 5 * 60_000);
  const sammler = useAbruf<Sammler>('/api/replays?live=1', 30_000);
  const katalog = useAbruf<{ cups?: Cup[] }>('/api/cup-catalog?modus=alle', 5 * 60_000);
  const kontakt = useAbruf<{ meldungen?: Meldung[] }>('/api/kontakt', 60_000);
  const anwesend = useAbruf<{ leute?: Person[] }>('/api/admin/anwesend', 20_000);
  const vipPanel = useAbruf<{ zugaenge?: VipZugang[] }>('/api/admin/vip-panel');
  const credits = useAbruf<{ ok?: boolean; zeilen?: CreditZeile[] }>('/api/admin/foto-credits');
  const vips = useAbruf<{ vips?: Array<{ aktiv: boolean }> }>('/api/vips?alle=1');

  const z = zentrale.daten;
  const rs = useMemo(() => replayStand(replays.daten), [replays.daten]);
  const offen = useMemo(() => (kontakt.daten?.meldungen ?? []).filter((m) => !m.erledigt).sort((a, b) => b.zeit - a.zeit), [kontakt.daten]);
  const online = (anwesend.daten?.leute ?? []).filter((p) => p.online);
  const kontaktZahl = kontakt.daten ? offen.length : z?.kontaktOffen ?? null;

  // Laufende Cup-Spieltage, je Cup zusammengefasst (Regionen nebeneinander)
  const live = useMemo(() => {
    const m = new Map<string, { cup: Cup; fenster: Fenster[] }>();
    for (const c of katalog.daten?.cups ?? []) for (const f of Object.values(c.regionen).flat()) {
      if (!laeuft(f, jetzt)) continue;
      const e = m.get(c.id) ?? { cup: c, fenster: [] }; e.fenster.push(f); m.set(c.id, e);
    }
    return [...m.values()].sort((a, b) => b.fenster.length - a.fenster.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [katalog.daten, Math.floor(jetzt / 30_000)]);
  const naechster = useMemo(() => {
    let best: { cup: Cup; f: Fenster } | null = null;
    for (const c of katalog.daten?.cups ?? []) for (const f of Object.values(c.regionen).flat()) if (f.begin > jetzt && (!best || f.begin < best.f.begin)) best = { cup: c, f };
    return best;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [katalog.daten, Math.floor(jetzt / 60_000)]);

  // Was jetzt Aufmerksamkeit braucht - rot vor amber vor still
  const punkte = useMemo(() => {
    const p: Punkt[] = [];
    for (const j of z?.jobs ?? []) {
      if (j.ampel === 'fehler') p.push({ ton: 'rot', titel: <>{laufText(j.name)} failed</>, text: `${laufText(j.was)} · ${laufZeile(j)}${j.hinweis ? ` · ${laufText(j.hinweis)}` : ''}`, extern: (j.letzter ?? j.aktiv)?.url, knopf: 'Open run' });
      else if (j.ampel === 'warnung') p.push({ ton: 'gelb', titel: <>{laufText(j.name)}: {laufText(j.hinweis || 'unbekannt')}</>, text: `${laufText(j.was)} · ${laufZeile(j)}`, extern: (j.letzter ?? j.aktiv)?.url, knopf: 'Open run' });
    }
    const schnell = sammler.daten?.schnell;
    if (schnell && schnell.ok === false) p.push({ ton: 'rot', titel: 'Fast lane: its source does not answer', text: [schnell.quelle, schnell.fehler, schnell.zeit ? vor(schnell.zeit) : ''].filter(Boolean).join(' · '), zu: '/admin/replays', knopf: 'Replays' });
    if (kontaktZahl) p.push({ ton: 'gelb', titel: `${kontaktZahl} open ${kontaktZahl === 1 ? 'message' : 'messages'} in the inbox`, text: offen[0] ? `Latest from ${offen[0].vonName} · ${vor(offen[0].zeit)}` : undefined, zu: '/admin/contact', knopf: 'Answer' });
    if (rs && replaysAuffaellig(rs)) p.push({ ton: 'gelb', titel: `${rs.offenInFrist.toLocaleString('en')} replays still open within the 31-day deadline`, text: 'Epic keeps replays for 31 days – collect them before they expire.', zu: '/admin/replays', knopf: 'Replays' });
    for (const l of (z?.ladezeiten ?? []).filter(langsam)) p.push({ ton: 'gelb', titel: `${l.titel} loads in ${ms(l.jetzt)}`, text: `Usually about ${ms(l.median)} (site check, last 24 hours)`, zu: '/admin/status', knopf: 'Status' });
    for (const v of (vipPanel.daten?.zugaenge ?? []).filter((x) => x.vipBis && x.vipBis > jetzt && x.vipBis - jetzt < 7 * TAG).sort((a, b) => (a.vipBis ?? 0) - (b.vipBis ?? 0))) {
      p.push({ ton: 'gelb', titel: `VIP access of ${v.name} ends in ${dauer((v.vipBis ?? 0) - jetzt)}`, text: v.fristLoescht ? 'The access is deleted at the deadline.' : 'The access falls back to a free account at the deadline.', zu: '/admin/vip-access', knopf: 'Extend' });
    }
    const zuBestaetigen = (credits.daten?.zeilen ?? []).filter((x) => x.foto && !x.credit?.bestaetigt && (x.credit?.quelle || x.credit?.fotograf)).length;
    if (zuBestaetigen) p.push({ ton: 'still', titel: `${zuBestaetigen} photo ${zuBestaetigen === 1 ? 'credit waits' : 'credits wait'} for your confirmation`, text: 'Named source or photographer, not confirmed yet – the credit is not public until you confirm it.', zu: '/admin/fotos-credits', knopf: 'Confirm' });
    for (const a of z?.auftraege ?? []) p.push({ ton: 'still', titel: <><span className="zahl mr-2 text-white/35">#{a.id}</span>{a.titel}</>, text: [a.hinweis, a.seit ? `open since ${vor(a.seit)}` : ''].filter(Boolean).join(' · ') || undefined, knopf: '' });
    const rang: Record<Ton, number> = { rot: 0, gelb: 1, still: 2 };
    return p.sort((a, b) => rang[a.ton] - rang[b.ton]);
  }, [z, sammler.daten, kontaktZahl, offen, rs, vipPanel.daten, credits.daten, jetzt]);

  const dringend = punkte.filter((x) => x.ton !== 'still').length;
  const probleme = (z?.jobs ?? []).filter((j) => j.ampel === 'fehler' || j.ampel === 'warnung').length;
  const satz = !z && zentrale.fehler === 'recht' ? 'Sign in with the admin account to see the jobs and the inbox.'
    : dringend ? `${dringend} ${dringend === 1 ? 'thing needs' : 'things need'} you right now${live.length ? ` – and ${live.length} ${live.length === 1 ? 'cup is' : 'cups are'} live.` : '.'}`
      : z ? `All quiet – every job runs${live.length ? `, ${live.length} ${live.length === 1 ? 'cup is' : 'cups are'} live` : ''}.` : 'Checking the jobs …';

  const schleife = sammler.daten?.schleife;
  const sammlerLive = schleife?.verlauf?.length ? schleife.verlauf[schleife.verlauf.length - 1].live : null;

  return (
    <>
      <SeitenKopf ueber="Admin" titel="Control room" text={satz}
        rechts={<>
          {z?.stand && <span className="text-xs text-white/40">as of {new Date(z.stand).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>}
          <button type="button" className="knopf" disabled={zentrale.laedt} onClick={() => { void zentrale.neu(true); void replays.neu(); void kontakt.neu(); void anwesend.neu(); void sammler.neu(); }}>
            <svg viewBox="0 0 20 20" className={`h-4 w-4 ${zentrale.laedt ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M16 10a6 6 0 1 1-1.8-4.3M16 4v3.5h-3.5" /></svg>
            Refresh
          </button>
          <Link to="/admin/status" className="knopf-prim">Status & visitors <span aria-hidden>→</span></Link>
        </>}>
        <div className="fl-fest grid grid-cols-2 divide-white/[0.06] sm:grid-cols-3 xl:grid-cols-6 xl:divide-x">
          {[
            { label: 'Needs you', wert: z ? dringend : null, ton: dringend ? 'akz' : 'gruen', unter: dringend ? 'see the list below' : 'nothing urgent' },
            { label: 'Jobs with a problem', wert: z ? probleme : null, ton: probleme ? 'rot' : 'gruen', unter: z ? `of ${z.jobs.length} jobs` : '' },
            { label: 'Cups live', wert: katalog.daten ? live.reduce((n, l) => n + l.fenster.length, 0) : null, ton: live.length ? 'rot' : 'weiss', unter: live.length ? `${live.length} ${live.length === 1 ? 'cup' : 'cups'}` : naechster ? `next in ${dauer(naechster.f.begin - jetzt)}` : '' },
            { label: 'Open messages', wert: kontaktZahl, ton: kontaktZahl ? 'akz' : 'weiss', unter: 'contact inbox' },
            { label: 'Online now', wert: anwesend.daten ? online.length : null, ton: 'weiss', unter: anwesend.daten ? `${anwesend.daten.leute?.length ?? 0} people recorded` : '' },
            { label: 'Replays analysed', wert: rs && rs.gesamt ? `${(rs.ausgewertet / rs.gesamt * 100).toFixed(1)}%` : null, ton: 'weiss', unter: rs ? `${rs.offenInFrist.toLocaleString('en')} open in the deadline` : '' },
          ].map((k, i) => (
            <motion.div key={k.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }} className="border-white/[0.06] px-5 py-4 [&:nth-child(n+3)]:border-t sm:[&:nth-child(n+3)]:border-t-0 sm:[&:nth-child(n+4)]:border-t xl:[&:nth-child(n+4)]:border-t-0">
              <Kennzahl label={k.label} wert={k.wert} ton={k.ton as 'weiss'} unter={k.unter || undefined} />
            </motion.div>
          ))}
        </div>
      </SeitenKopf>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        {/* links: was wartet, Laeufe, Ladezeiten */}
        <div className="min-w-0 space-y-5">
          <Flaeche fest className="overflow-hidden">
            <Kopfzeile titel="Needs you" rechts={punkte.length ? <span className="zahl">{punkte.length} {punkte.length === 1 ? 'item' : 'items'}</span> : null} />
            {zentrale.fehler === 'recht' && !punkte.length ? (
              <p className="px-5 py-6 text-sm text-white/50">The jobs, the inbox and the accesses need the real admin sign-in – nothing to show without it.</p>
            ) : !z && !punkte.length ? (
              <div className="space-y-2 p-5">{[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-2xl bg-white/[0.04]" />)}</div>
            ) : !punkte.length ? (
              <div className="flex items-center gap-3 px-5 py-7">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/15 text-emerald-300"><svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 10.5l3.5 3.5 7.5-8" /></svg></span>
                <div><p className="font-bold text-white">All quiet</p><p className="text-sm text-white/50">Every job runs, the inbox is empty and nothing expires this week.</p></div>
              </div>
            ) : (
              <ul className="divide-y divide-white/[0.05]">
                {punkte.map((x, i) => {
                  const inhalt = (
                    <>
                      <span className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${TON[x.ton].strich}`} />
                      <div className="min-w-0 flex-1">
                        <p className={`text-[15px] font-bold leading-snug ${x.ton === 'still' ? 'text-white/85' : 'text-white'}`}>{x.titel}</p>
                        {x.text && <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-white/50">{x.text}</p>}
                      </div>
                      {x.knopf && <span className={`shrink-0 self-center rounded-lg px-3 py-1.5 text-xs font-bold transition ${x.ton === 'rot' ? 'bg-red-500/15 text-red-200 group-hover:bg-red-500/25' : x.ton === 'gelb' ? 'bg-akz/15 text-akz group-hover:bg-akz/25' : 'bg-white/[0.06] text-white/70 group-hover:text-white'}`}>{x.knopf} {x.extern ? '↗' : '→'}</span>}
                    </>
                  );
                  const klasse = 'group relative flex gap-4 px-5 py-3.5 pl-6 transition hover:bg-white/[0.03]';
                  return (
                    <motion.li key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(0.4, i * 0.04) }}>
                      {x.zu ? <Link to={x.zu} className={klasse}>{inhalt}</Link> : x.extern ? <a href={x.extern} target="_blank" rel="noreferrer" className={klasse}>{inhalt}</a> : <div className={klasse}>{inhalt}</div>}
                    </motion.li>
                  );
                })}
              </ul>
            )}
          </Flaeche>

          <Flaeche fest verz={0.05} className="overflow-hidden">
            <Kopfzeile titel="Jobs" rechts={<Link to="/admin/status" className="knopf-leer !text-xs">All runs →</Link>} />
            <div className="grid grid-cols-2 gap-px bg-white/[0.05] 2xl:grid-cols-4">
              {(z?.jobs ?? Array.from({ length: zentrale.fehler ? 0 : 8 }, () => null)).map((j, i) => j ? (
                <a key={j.schluessel} href={(j.aktiv ?? j.letzter)?.url ?? undefined} target="_blank" rel="noreferrer" title={laufText(j.was)} className="group bg-fl px-4 py-3.5 transition hover:bg-white/[0.04]">
                  <span className="flex items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${AMPEL[j.ampel]} ${j.aktiv ? 'animate-pulse' : ''}`} />
                    <span className="truncate text-sm font-bold text-white">{laufText(j.name)}</span>
                  </span>
                  <span className={`mt-1 block text-xs ${j.aktiv ? 'text-akz' : j.ampel === 'fehler' ? 'text-red-300' : j.ampel === 'warnung' ? 'text-akz' : 'text-white/45'}`}>{laufZeile(j)}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-white/30">{laufText(j.was)}</span>
                </a>
              ) : <div key={i} className="h-[78px] animate-pulse bg-fl" />)}
            </div>
            {zentrale.fehler && <p className="px-5 py-4 text-sm text-white/45">{zentrale.fehler === 'recht' ? 'The job status needs the admin sign-in.' : 'The job status could not be loaded right now.'}</p>}
          </Flaeche>

          {!!z?.ladezeiten?.length && (
            <Flaeche fest verz={0.1} className="overflow-hidden">
              <Kopfzeile titel="Page load times" rechts="last 24 hours" />
              <div className="grid grid-cols-2 gap-px bg-white/[0.05] 2xl:grid-cols-4">
                {z.ladezeiten.map((l) => (
                  <div key={l.titel} className="bg-fl px-4 py-3">
                    <p className="flex items-baseline justify-between gap-2"><span className="truncate text-[13px] font-semibold text-white/80">{l.titel}</span><span className={`zahl text-lg font-extrabold ${langsam(l) ? 'text-akz' : 'text-white'}`}>{ms(l.jetzt)}</span></p>
                    <Linie werte={l.verlauf} warn={langsam(l)} />
                    <p className="text-[11px] text-white/35">usually {ms(l.median)}</p>
                  </div>
                ))}
              </div>
            </Flaeche>
          )}
        </div>

        {/* rechts: live, Posteingang, online */}
        <div className="min-w-0 space-y-5">
          <Flaeche fest verz={0.05} className="overflow-hidden">
            <Kopfzeile titel="Live now" rechts={sammlerLive !== null && schleife?.zeit ? <span>collector · {vor(schleife.zeit)}</span> : null} />
            {!katalog.daten ? <div className="m-4 aspect-video animate-pulse rounded-2xl bg-white/[0.04]" /> : live.length ? (
              <div className="divide-y divide-white/[0.05]">
                {live.slice(0, 4).map(({ cup, fenster }, i) => {
                  const ende = Math.min(...fenster.map((f) => f.end ?? Infinity));
                  return (
                    <Link key={cup.id} to={cupLink(cup, fenster[0])} className="group flex gap-4 p-4 transition hover:bg-white/[0.03]">
                      <div className={`relative shrink-0 overflow-hidden rounded-xl bg-black ${i === 0 ? 'aspect-video w-40 sm:w-52' : 'aspect-video w-28'}`}>
                        <CupBild c={cup} className="transition duration-700 group-hover:scale-105" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <LiveMarke text="Live" />
                        <p className="mt-1.5 line-clamp-2 font-bold leading-snug text-white">{cup.titel}</p>
                        <p className="mt-0.5 truncate text-xs text-white/50">{stufeName(fenster[0])}{Number.isFinite(ende) ? ` · ends in ${dauer(ende - jetzt)}` : ''}</p>
                        <div className="mt-2 flex flex-wrap gap-1">{fenster.map((f) => <RegionMarke key={f.windowId} r={f.region} klein />)}</div>
                      </div>
                    </Link>
                  );
                })}
                {live.length > 4 && <p className="px-4 py-2.5 text-xs text-white/45">+ {live.length - 4} more live – <Link to="/competitive/events" className="text-akz">all events</Link></p>}
              </div>
            ) : naechster ? (
              <Link to={cupLink(naechster.cup, naechster.f)} className="group flex gap-4 p-4 transition hover:bg-white/[0.03]">
                <div className="relative aspect-video w-40 shrink-0 overflow-hidden rounded-xl bg-black sm:w-52"><CupBild c={naechster.cup} className="transition duration-700 group-hover:scale-105" /></div>
                <div className="min-w-0">
                  <Marke ton="akz">No cup live · next</Marke>
                  <p className="mt-1.5 line-clamp-2 font-bold leading-snug text-white">{naechster.cup.titel}</p>
                  <p className="mt-0.5 text-xs text-white/50">{REGION_NAME[naechster.f.region] ?? naechster.f.region} · {stufeName(naechster.f)}</p>
                  <p className="titel mt-2 text-3xl text-akz">{dauer(naechster.f.begin - jetzt)}</p>
                </div>
              </Link>
            ) : <p className="px-5 py-6 text-sm text-white/45">No cup live and none scheduled.</p>}
            {schleife && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/[0.06] px-5 py-3 text-xs text-white/50">
                <span className="flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${schleife.beendet ? 'bg-white/30' : 'animate-pulse bg-emerald-400'}`} />Replay collector {schleife.beendet ? 'idle' : 'running'}</span>
                {sammlerLive !== null && <span>{sammlerLive} live {sammlerLive === 1 ? 'window' : 'windows'} on the last pass</span>}
                {sammler.daten?.schnell && <span>Fast lane {sammler.daten.schnell.ok === false ? <b className="text-red-300">down</b> : 'ok'}</span>}
                <Link to="/admin/replays" className="ml-auto text-akz">Replays →</Link>
              </div>
            )}
          </Flaeche>

          <Flaeche fest verz={0.1} className="overflow-hidden">
            <Kopfzeile titel="Inbox" rechts={<Link to="/admin/contact" className="knopf-leer !text-xs">Open inbox →</Link>} />
            {kontakt.fehler ? <p className="px-5 py-5 text-sm text-white/45">{kontakt.fehler === 'recht' ? 'The inbox needs the admin sign-in.' : 'The inbox could not be loaded.'}</p>
              : !kontakt.daten ? <div className="space-y-2 p-4">{[0, 1].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-white/[0.04]" />)}</div>
                : !offen.length ? <p className="px-5 py-5 text-sm text-white/45">No open message – the inbox is empty.</p> : (
                  <ul className="divide-y divide-white/[0.05]">
                    {offen.slice(0, 4).map((m) => (
                      <li key={m.id}>
                        <Link to={`/admin/contact?gespraech=${encodeURIComponent(m.id)}`} className="block px-5 py-3 transition hover:bg-white/[0.03]">
                          <p className="flex items-center gap-2 text-xs"><span className="font-bold text-white">{m.vonName || 'Guest'}</span><span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/55">{THEMA[m.thema] ?? m.thema}</span><span className="ml-auto text-white/35">{vor(m.zeit)}</span></p>
                          <p className="mt-1 line-clamp-2 text-sm text-white/65">{m.text}</p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
          </Flaeche>

          <Flaeche fest verz={0.15} className="overflow-hidden">
            <Kopfzeile titel="Online now" rechts={<Link to="/admin/live" className="knopf-leer !text-xs">Live →</Link>} />
            {anwesend.fehler ? <p className="px-5 py-5 text-sm text-white/45">{anwesend.fehler === 'recht' ? 'Presence needs the admin sign-in.' : 'Presence could not be loaded.'}</p>
              : !anwesend.daten ? <div className="h-16 animate-pulse" />
                : !online.length ? <p className="px-5 py-5 text-sm text-white/45">Nobody else is online right now.</p> : (
                  <ul className="flex flex-wrap gap-2 p-4">
                    {online.map((p) => {
                      const g = p.sitzungen?.[0]?.geraet;
                      return (
                        <li key={p.kennung} className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2">
                          <span className="relative flex h-2 w-2"><span className="absolute h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative h-2 w-2 rounded-full bg-emerald-400" /></span>
                          <span className="text-sm font-bold text-white">{p.name}</span>
                          {p.art === 'vip' && <span className="rounded bg-akz/15 px-1.5 text-[10px] font-bold uppercase text-akz">VIP</span>}
                          {g && <span className="text-xs text-white/40">{g.art === 'Handy' ? 'Phone' : g.art} · {g.browser === 'Anderer Browser' ? 'Other' : g.browser}</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
          </Flaeche>
        </div>
      </div>

      <AlleWerkzeuge vips={vips.daten ? (vips.daten.vips ?? []).filter((v) => v.aktiv).length : undefined} kontakt={kontaktZahl ?? undefined} />
    </>
  );
}

/** Alle Werkzeuge nach Gruppen - gleich grosse Kacheln, Suche oben, Enter oeffnet den ersten Treffer. */
function AlleWerkzeuge({ vips, kontakt }: { vips?: number; kontakt?: number }) {
  const [suche, setSuche] = useState('');
  const nav = useNavigate();
  const liste = WERKZEUGE.filter((w) => passt(w, suche));
  let n = 0;
  return (
    <Abschnitt className="mt-10" ueber={`${WERKZEUGE.length} tools`} titel="Every tool"
      rechts={<input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Search tools …" spellCheck={false}
        onKeyDown={(e) => { if (e.key === 'Enter' && liste[0]) nav(`/admin/${liste[0].slug}`); }} className="eingabe w-full max-w-xs !py-2 sm:w-72" />}>
      <div className="space-y-6">
        {GRUPPEN.map((g) => {
          const teil = liste.filter((w) => w.gruppe === g.id);
          if (!teil.length) return null;
          return (
            <div key={g.id} className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)]">
              <p className="ueber pt-3 !text-white/45">{g.titel}</p>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {teil.map((w) => {
                  const zahl = w.zaehler === 'kontakt' ? kontakt : w.slug === 'vips' ? vips : undefined;
                  const i = n++;
                  return (
                    <motion.div key={w.slug} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: Math.min(i, 20) * 0.015 }}>
                      <Link to={`/admin/${w.slug}`} className="fl-fest fl-klick group flex h-full items-start gap-3 !rounded-2xl px-4 py-3">
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2"><span className="truncate font-bold text-white group-hover:text-akz">{w.titel}</span>{!!zahl && <span className="zahl rounded-full bg-akz px-1.5 text-[10px] font-bold text-black">{zahl}</span>}</span>
                          <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-white/45">{w.text}</span>
                        </span>
                        {w.hub && <span className="mt-0.5 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-white/35" title={`Opens ${w.hub.split('?')[0]}`}>{w.hub.split('/')[1]} ↗</span>}
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {!liste.length && <p className="text-sm text-white/45">No tool matches “{suche}”.</p>}
      </div>
    </Abschnitt>
  );
}
