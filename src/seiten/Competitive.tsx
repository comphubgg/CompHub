import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Abschnitt, Bild, Flaeche, Marke, MedienKarte, Zaehler, dauer, useJetzt } from '../ds/Bausteine';
import { flagge } from '../teile/Glas';
import { REGION_NAME, cupLink, datum, istRanked, laeuft, lageVon, stufeName, tagKurz, vorbei, type Cup, type Fenster, type Lage } from './comp/events/gemeinsam';
import { CupBild, CupKarte, CupMarken, LiveMarke, RegionMarke, TeamFotos, TeamNamen, Uhrwerk, type FotoSpieler } from './comp/events/teile';

/*
 * Competitive-Uebersicht - die Titelseite der Szene (Design-System 3.0, Betreiber 27.11.2026: "alles wird neu gebaut ... nichts 1:1 gleich").
 *
 *   1. Buehne ueber die volle Breite: der laufende Cup (sonst der naechste wichtige) mit seinem Banner, Countdown in Kacheln, daneben die Top 5
 *      mit Hochkant-Fotos - live alle 15 s frisch, vor dem Start das Ergebnis des letzten Spieltags desselben Cups. Darunter der Puls der Szene.
 *   2. Magazin-Raster: links "Coming up" (nur wichtige Cups: kein Ranked, EU/NA dabei) und "Latest winners" mit Banner und Siegerfotos,
 *      rechts ueber beide Reihen die Power Rankings (Nummer 1, Verfolger, Auf- und Absteiger).
 *   3. Werkzeuge: eine grosse Kachel und sechs kleine, jede mit einem echten 16:9-Bild.
 *
 * Daten: /api/cup-catalog?modus=alle, /api/cup-leaderboard, /api/power-rankings.
 */

interface PR { rank: number; id: string; name: string; anzeige?: string; land?: string; wertung: number; bestwert?: number; deltaPlatz: number; deltaWertung?: number; bild?: string | null }
interface LbEintrag { rank: number; points: number; elims: number; games: number; wins: number; players: FotoSpieler[] }
interface Termin { cup: Cup; f: Fenster }

const HAUPT = ['EU', 'NAC', 'NAW'];
const GEWICHT: Record<string, number> = { EU: 0, NAC: 1, NAW: 2, BR: 3, ASIA: 4, ME: 5, OCE: 6 };
const gewicht = (r: string) => GEWICHT[r] ?? 9;
/** Wichtig fuer die Titelseite: kein Ranked Cup, und Europa oder Nordamerika spielt mit (Betreiber). */
const wichtig = (c: Cup) => !istRanked(c) && Object.keys(c.regionen).some((r) => HAUPT.includes(r));
/** Auf die Buehne gehoert der naechste GROSSE Cup - Test-Cups und Mobile-Cups stehen nur im Kalender darunter. */
const buehnenReif = (c: Cup) => wichtig(c) && c.art !== 'mobile' && !/\btest\b/i.test(c.titel);
const name = (p: { anzeige?: string; name: string }) => p.anzeige || p.name;
const uhrzeit = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
/** "Scott Pilgrim Cup · Duos (Battle Royale)" -> gross "Scott Pilgrim Cup", klein "Duos · Battle Royale". */
const titelTeile = (t: string) => { const [haupt, ...rest] = t.split(/\s·\s|\s\(/); return { haupt, zusatz: rest.map((x) => x.replace(/\)$/, '')).join(' · ') }; };
const TAG = 86400e3;
/** Ersatzbild der Buehne, wenn der Cup kein eigenes Banner hat (Bild des Betreibers). */
const BUEHNE_ERSATZ = '/slider/eis-trio.webp';

function einteilen(cups: Cup[], jetzt: number) {
  const live: Termin[] = [];
  let bald = 0, gewesen = 0;
  for (const c of cups) for (const f of Object.values(c.regionen).flat()) {
    if (laeuft(f, jetzt)) live.push({ cup: c, f });
    else if (f.begin > jetzt && f.begin - jetzt < 7 * TAG) bald += 1;
    else if (f.end && f.end <= jetzt && jetzt - f.end < 7 * TAG) gewesen += 1;
  }
  live.sort((a, b) => Number(!wichtig(a.cup)) - Number(!wichtig(b.cup)) || gewicht(a.f.region) - gewicht(b.f.region));
  const kommend = cups.filter(wichtig).map((c) => ({ c, lage: lageVon(c, 'alle', jetzt) }))
    .filter((x) => x.lage.status === 'kommt' && (x.lage.naechster ?? 0) - jetzt < 21 * TAG).sort((a, b) => (a.lage.naechster ?? 0) - (b.lage.naechster ?? 0));
  // Sieger: je Cup der zuletzt beendete Spieltag (Europa vor Nordamerika), feste Cups vor Skin-Cups, nie Ranked oder Mobile
  const sieger: Termin[] = [];
  for (const c of cups) {
    if (!wichtig(c) || c.art === 'mobile') continue;
    const fertig = Object.values(c.regionen).flat().filter((f) => HAUPT.includes(f.region) && f.end && vorbei(f, jetzt) && jetzt - f.end < 7 * TAG && f.eventId && f.windowId)
      .sort((a, b) => gewicht(a.region) - gewicht(b.region) || (b.end ?? 0) - (a.end ?? 0));
    if (fertig[0]) sieger.push({ cup: c, f: fertig[0] });
  }
  sieger.sort((a, b) => Number(a.cup.art === 'skin') - Number(b.cup.art === 'skin') || (b.f.end ?? 0) - (a.f.end ?? 0));
  return { live, kommend, sieger: sieger.slice(0, 4).sort((a, b) => (b.f.end ?? 0) - (a.f.end ?? 0)), bald, gewesen };
}

/** Der Spieltag, mit dem ein kommender Cup auf die Buehne geht: der naechste - in Europa, wenn Europa am selben Tag spielt. */
function naechsterTermin(c: Cup, jetzt: number): Termin | null {
  const kommt = Object.values(c.regionen).flat().filter((f) => f.begin > jetzt).sort((a, b) => a.begin - b.begin);
  if (!kommt.length) return null;
  const tag = kommt.filter((f) => f.begin - kommt[0].begin < TAG).sort((a, b) => gewicht(a.region) - gewicht(b.region));
  return { cup: c, f: tag[0] };
}

/* ------------------------------------------------------------------------------------------------ Buehne */

/** Die Top 5 eines Spieltags. Laeuft er, alle 15 Sekunden frisch. */
function TopFuenf({ f, live }: { f: Fenster; live: boolean }) {
  const [liste, setListe] = useState<LbEintrag[] | null>(null);
  useEffect(() => {
    setListe(null);
    let aus = false;
    const holen = () => fetch(`/api/cup-leaderboard?event=${encodeURIComponent(f.eventId)}&window=${encodeURIComponent(f.windowId)}&limit=5`)
      .then((r) => r.json()).then((j) => { if (!aus) setListe((j.entries ?? []).slice(0, 5)); }).catch(() => { if (!aus) setListe((l) => l ?? []); });
    holen();
    const i = live ? setInterval(holen, 15000) : undefined;
    return () => { aus = true; if (i) clearInterval(i); };
  }, [f.eventId, f.windowId, live]);
  if (!liste) return <div className="space-y-px">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-16 animate-pulse bg-white/[0.03]" />)}</div>;
  if (!liste.length) return <p className="px-4 py-8 text-sm text-white/55">{live ? 'First games are still running – the leaderboard fills after the first results.' : 'No result published for this match day.'}</p>;
  return (
    <ol>
      <AnimatePresence initial={false}>
        {liste.map((e, i) => (
          <motion.li layout key={e.players.map((p) => p.id).join()} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ delay: i * 0.04 }}
            className="flex min-h-[64px] items-center gap-3 border-t border-white/[0.05] px-4 py-2 first:border-t-0">
            <span className={`titel zahl w-6 shrink-0 text-center text-3xl ${e.rank === 1 ? '!text-amber-300' : e.rank > 3 ? '!text-white/40' : ''}`}>{e.rank}</span>
            <TeamFotos spieler={e.players.slice(0, 4)} mass="h-10 w-[30px] sm:h-12 sm:w-9" />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-white sm:line-clamp-1 sm:text-sm"><TeamNamen spieler={e.players} /></p>
              <p className="zahl text-[11px] text-white/45">{e.games} games · {e.elims} elims{e.wins ? ` · ${e.wins} win${e.wins > 1 ? 's' : ''}` : ''}</p>
            </div>
            <span className="shrink-0 text-right"><span className="titel zahl block text-3xl">{e.points}</span><span className="block text-[9px] font-semibold uppercase tracking-[0.25em] text-white/35">pts</span></span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  );
}

function PulsZelle({ label, zu, children, unter }: { label: string; zu: string; children: ReactNode; unter: ReactNode }) {
  return (
    <Link to={zu} className="group bg-fl px-5 py-4 transition hover:bg-white/[0.03] lg:px-7">
      <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">{label}</p>
      <p className="titel mt-1 text-4xl transition group-hover:!text-akz">{children}</p>
      <p className="mt-0.5 truncate text-xs text-white/45">{unter}</p>
    </Link>
  );
}

function Buehne({ live, naechster, jetzt, puls }: { live: Termin[]; naechster: Termin | null; jetzt: number; puls: ReactNode }) {
  const [wahl, setWahl] = useState<string | null>(null);
  const [bildFehlt, setBildFehlt] = useState<string | null>(null);
  const liveWichtig = live.filter((t) => wichtig(t.cup));
  const haupt = live.find((t) => t.f.windowId === wahl) ?? liveWichtig[0] ?? naechster ?? live[0] ?? null;
  if (!haupt) return <div className="fl-fest h-[560px] animate-pulse" />;
  const { cup, f } = haupt;
  const istLive = laeuft(f, jetzt);
  const { haupt: titel, zusatz } = titelTeile(cup.titel);
  // Ranked-Banner sind keine Deko fuer die Titelseite - dann das Bild des Betreibers
  const bild = !istRanked(cup) && cup.bild && bildFehlt !== cup.bild ? cup.bild : BUEHNE_ERSATZ;
  const regionenLive = live.filter((t) => t.cup.id === cup.id);
  const auchLive = live.filter((t) => t.cup.id !== cup.id);
  // vor dem Start: wann welche Region dran ist, und das Ergebnis des letzten Spieltags
  const tagesFenster = istLive ? [] : Object.values(cup.regionen).flat().filter((x) => x.begin > jetzt && x.begin - f.begin < TAG && x.begin >= f.begin - TAG)
    .sort((a, b) => gewicht(a.region) - gewicht(b.region) || a.begin - b.begin).filter((x, i, l) => l.findIndex((y) => y.region === x.region) === i).slice(0, 7);
  const letzter = istLive ? null : [...(cup.regionen[f.region] ?? []), ...HAUPT.flatMap((r) => (r === f.region ? [] : cup.regionen[r] ?? []))]
    .filter((x) => vorbei(x, jetzt) && x.eventId && x.windowId).sort((a, b) => Number(b.region === f.region) - Number(a.region === f.region) || b.begin - a.begin)[0] ?? null;
  const tafel = istLive ? f : letzter;
  const anteil = istLive && f.end ? Math.min(1, Math.max(0, (jetzt - f.begin) / (f.end - f.begin))) : 0;
  const kommende = Object.values(cup.regionen).flat().filter((x) => x.begin > jetzt).sort((a, b) => a.begin - b.begin).slice(0, 6);
  return (
    <section className="fl-fest relative isolate overflow-hidden">
      <motion.img key={bild} src={bild} alt="" draggable={false} onError={() => setBildFehlt(cup.bild ?? null)} initial={{ opacity: 0, scale: 1.06 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }} className="absolute inset-0 -z-10 h-full w-full object-cover object-[center_30%]" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-fl via-fl/70 to-transparent" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-fl via-fl/20 to-transparent" />

      <div className="grid gap-7 p-5 sm:p-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.95fr)] lg:gap-10 lg:p-10 xl:min-h-[540px]">
        <div className="flex min-w-0 flex-col justify-end">
          <div className="flex flex-wrap items-center gap-1.5">
            {istLive ? <LiveMarke text="Live now" /> : <Marke ton="akz">Up next</Marke>}
            <CupMarken c={cup} />
            {zusatz && <Marke>{zusatz}</Marke>}
          </div>
          <h1 className="titel mt-4 text-[2.9rem] drop-shadow-[0_6px_30px_rgba(0,0,0,0.85)] sm:text-7xl 2xl:text-8xl">{titel}</h1>
          <p className="mt-3 text-[15px] text-white/65"><span className="font-semibold text-white">{stufeName(f)}</span> · {REGION_NAME[f.region] ?? f.region} · {datum(f.begin)}{f.end ? `–${uhrzeit(f.end)}` : ''}{f.matchCap ? ` · ${f.matchCap} matches` : ''}</p>
          <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/45">{istLive ? 'Ends in' : 'Starts in'}</p>
              <div className="mt-1.5"><Uhrwerk ms={(istLive ? f.end ?? jetzt : f.begin) - jetzt} ton={istLive ? 'rot' : 'akz'} /></div>
            </div>
            {istLive ? (
              <div className="min-w-[180px] flex-1 pb-1 sm:max-w-xs">
                <div className="flex justify-between text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45"><span>{uhrzeit(f.begin)}</span><span>{Math.round(anteil * 100)}% played</span><span>{f.end ? uhrzeit(f.end) : ''}</span></div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full rounded-full bg-gradient-to-r from-red-400 to-amber-300" initial={{ width: 0 }} animate={{ width: `${anteil * 100}%` }} transition={{ duration: 1 }} /></div>
              </div>
            ) : tagesFenster.length > 0 && (
              <div className="pb-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/45">Start per region</p>
                <div className="mt-1.5 flex max-w-md flex-wrap gap-1">{tagesFenster.map((x) => <RegionMarke key={x.windowId} r={x.region} zeit={uhrzeit(x.begin)} />)}</div>
              </div>
            )}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Link to={cupLink(cup, f)} className="knopf-prim">{istLive ? 'Full live leaderboard' : 'Event page'} <span aria-hidden>→</span></Link>
            {istLive && regionenLive.length > 1 && regionenLive.map((t) => (
              <button key={t.f.windowId} type="button" onClick={() => setWahl(t.f.windowId)} className={`chip !py-2 ${t === haupt ? 'chip-an' : ''}`}>{t.f.region}</button>
            ))}
            <Link to="/competitive/events" className="knopf">All events</Link>
          </div>
        </div>

        <div className="flex min-w-0 flex-col justify-end">
          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-fl/[0.88] backdrop-blur-xl">
            {tafel ? (
              <>
                <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
                  <div className="min-w-0">
                    <p className="ueber">{istLive ? 'Live top 5' : 'Last match day · top 5'}</p>
                    <p className="mt-0.5 truncate text-xs text-white/45">{REGION_NAME[tafel.region] ?? tafel.region} · {stufeName(tafel)}{istLive ? '' : ` · ${tagKurz(tafel.begin)}`}</p>
                  </div>
                  {istLive ? <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-white/45"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />every 15 s</span>
                    : <Link to={cupLink(cup, tafel)} className="knopf-leer shrink-0 !text-xs">Full result <span aria-hidden>→</span></Link>}
                </div>
                <TopFuenf f={tafel} live={istLive} />
              </>
            ) : (
              <>
                <div className="border-b border-white/[0.06] px-4 py-3"><p className="ueber">Match days</p><p className="mt-0.5 text-xs text-white/45">First edition – no earlier result</p></div>
                <ul>{kommende.map((x) => (
                  <li key={x.windowId} className="flex items-center gap-3 border-t border-white/[0.05] px-4 py-3 first:border-t-0">
                    <RegionMarke r={x.region} />
                    <span className="min-w-0 flex-1 truncate text-sm text-white">{stufeName(x)} <span className="text-white/40">· {datum(x.begin)}</span></span>
                    <span className="zahl text-sm font-bold text-akz">{dauer(x.begin - jetzt)}</span>
                  </li>))}</ul>
              </>
            )}
          </div>
        </div>
      </div>

      {auchLive.length > 0 && (
        <div className="ohne-leiste flex items-center gap-2 overflow-x-auto border-t border-white/[0.07] bg-fl/90 px-5 py-2.5 lg:px-10">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.25em] text-red-300">Also live</span>
          {auchLive.map((t) => (
            <button key={t.f.windowId} type="button" onClick={() => setWahl(t.f.windowId)} className="chip"><span className="font-bold text-red-300">{t.f.region}</span>{t.cup.titel}</button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-px border-t border-white/[0.07] bg-white/[0.06] lg:grid-cols-4">{puls}</div>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------------ Magazin */

/** Ein einzelner kommender Cup: quer, Banner links, rechts alles Wichtige - fuellt die Breite, statt als kleine Karte allein zu stehen. */
function QuerKarte({ c, lage, jetzt, zeiten }: { c: Cup; lage: Lage; jetzt: number; zeiten: Array<{ r: string; zeit: string }> }) {
  const f = lage.fenster;
  return (
    <Flaeche fest klick className="group overflow-hidden">
      <Link to={cupLink(c, f)} className="grid md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="relative aspect-video overflow-hidden"><CupBild c={c} className="transition duration-700 group-hover:scale-[1.05]" /></div>
        <div className="flex flex-col justify-center gap-3 p-6">
          <div className="flex flex-wrap gap-1.5"><CupMarken c={c} /></div>
          <h3 className="titel text-5xl">{titelTeile(c.titel).haupt}</h3>
          <p className="text-sm text-white/55">{f ? stufeName(f) : ''}{lage.naechster ? ` · ${datum(lage.naechster)}` : ''}</p>
          {lage.naechster && <Uhrwerk ms={lage.naechster - jetzt} klein />}
          <div className="flex flex-wrap gap-1">{zeiten.map((z) => <RegionMarke key={z.r} r={z.r} zeit={z.zeit} klein />)}</div>
        </div>
      </Link>
    </Flaeche>
  );
}

function Demnaechst({ kommend, jetzt }: { kommend: Array<{ c: Cup; lage: Lage }>; jetzt: number }) {
  if (!kommend.length) return null;
  const zeige = kommend.slice(0, kommend.length >= 6 ? 6 : 3);
  const zeiten = (c: Cup, start: number) => Object.values(c.regionen).flat().filter((f) => f.begin >= start && f.begin - start < TAG)
    .sort((a, b) => gewicht(a.region) - gewicht(b.region) || a.begin - b.begin).filter((x, i, l) => l.findIndex((y) => y.region === x.region) === i).slice(0, 4).map((f) => ({ r: f.region, zeit: uhrzeit(f.begin) }));
  return (
    <Abschnitt ueber="Calendar" titel="Coming up" zu="/competitive/events" zuText="All events">
      {zeige.length === 1 ? <QuerKarte c={zeige[0].c} lage={zeige[0].lage} jetzt={jetzt} zeiten={zeiten(zeige[0].c, zeige[0].lage.naechster ?? jetzt)} /> : (
        <div className={`grid gap-5 sm:grid-cols-2 ${zeige.length >= 3 ? 'lg:grid-cols-3' : ''}`}>
          {zeige.map((x, i) => <CupKarte key={x.c.id} c={x.c} lage={x.lage} verz={i * 0.05} dauerText={`in ${dauer((x.lage.naechster ?? jetzt) - jetzt)}`} zeiten={zeiten(x.c, x.lage.naechster ?? jetzt)} />)}
        </div>
      )}
    </Abschnitt>
  );
}

/** Die Sieger der zuletzt beendeten Spieltage - Banner des Cups, darunter die Fotos und Namen. */
function LetzteSieger({ sieger }: { sieger: Termin[] }) {
  const schluessel = sieger.map((t) => t.f.windowId).join();
  const [erste, setErste] = useState<Record<string, LbEintrag | null>>({});
  useEffect(() => {
    for (const t of sieger) {
      const k = t.f.windowId;
      fetch(`/api/cup-leaderboard?event=${encodeURIComponent(t.f.eventId)}&window=${encodeURIComponent(k)}&limit=1`).then((r) => r.json())
        .then((j) => setErste((s) => ({ ...s, [k]: j.entries?.[0] ?? null }))).catch(() => setErste((s) => ({ ...s, [k]: null })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schluessel]);
  if (!sieger.length) return null;
  return (
    <Abschnitt ueber="Results" titel="Latest winners" zu="/competitive/events" zuText="All results">
      <div className="grid gap-5 md:grid-cols-2">
        {sieger.map((t, i) => {
          const s = erste[t.f.windowId];
          const { haupt, zusatz } = titelTeile(t.cup.titel);
          return (
            <Flaeche key={t.f.windowId} fest klick verz={i * 0.05} className="group grid grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] overflow-hidden">
              <Link to={cupLink(t.cup, t.f)} className="relative block min-h-[150px] overflow-hidden">
                <CupBild c={t.cup} className="transition duration-700 group-hover:scale-[1.06]" />
                <div className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-fl to-transparent" />
                <span className="absolute left-3 top-3 rounded-full bg-black/75 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300 ring-1 ring-amber-300/40 backdrop-blur">Winner</span>
              </Link>
              <div className="flex min-w-0 flex-col justify-center gap-2 py-4 pl-2 pr-4">
                <div className="flex items-center gap-2"><RegionMarke r={t.f.region} klein /><span className="zahl text-[11px] text-white/45">{tagKurz(t.f.end ?? t.f.begin)}</span></div>
                <div className="min-w-0">
                  <Link to={cupLink(t.cup, t.f)} className="block truncate text-[13px] font-semibold text-white/80 transition hover:text-akz">{haupt}</Link>
                  <p className="truncate text-[11px] text-white/40">{[zusatz, stufeName(t.f)].filter(Boolean).join(' · ')}</p>
                </div>
                {s === undefined ? <div className="h-12 animate-pulse rounded-lg bg-white/[0.04]" /> : s ? (
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                    <TeamFotos spieler={s.players.slice(0, 4)} />
                    <div className="min-w-[7rem] flex-1">
                      <p className="line-clamp-2 text-sm font-bold leading-snug text-white"><TeamNamen spieler={s.players} /></p>
                      <p className="zahl mt-0.5 truncate text-[11px] text-white/50">{s.points} pts · {s.elims} elims{s.wins ? ` · ${s.wins} win${s.wins > 1 ? 's' : ''}` : ''}</p>
                    </div>
                  </div>
                ) : <p className="text-sm text-white/40">No result published.</p>}
              </div>
            </Flaeche>
          );
        })}
      </div>
    </Abschnitt>
  );
}

function Wechsel({ n }: { n: number }) {
  if (!n) return <span className="zahl w-12 text-right text-[11px] text-white/25">–</span>;
  return <span className={`zahl w-12 text-right text-[11px] font-bold ${n > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{n > 0 ? '▲' : '▼'} {Math.abs(n).toLocaleString('en')}</span>;
}

/** Power Rankings als hohe Tafel am rechten Rand: Nummer 1 mit Hochkant-Foto, die Verfolger, Auf- und Absteiger. */
function RanglistenTafel({ spitze, aufsteiger, absteiger }: { spitze: PR[]; aufsteiger: PR[]; absteiger: PR[] }) {
  const [eins, ...rest] = spitze;
  return (
    <Flaeche fest className="flex h-full flex-col overflow-hidden xl:absolute xl:inset-0">
      <div className="flex items-end justify-between gap-3 px-5 pt-5">
        <div><p className="ueber">Power Rankings</p><h2 className="titel mt-1 text-3xl">The top right now</h2></div>
        <Link to="/competitive/rankings" className="knopf-leer">All 10,000 <span aria-hidden>→</span></Link>
      </div>
      {!eins ? <div className="m-5 h-56 animate-pulse rounded-2xl bg-white/[0.04]" /> : (
        <Link to={`/competitive/player/${eins.id}`} className="group relative mx-5 mt-4 flex h-56 shrink-0 overflow-hidden rounded-2xl border border-white/[0.07] bg-black/40 transition hover:border-amber-300/40">
          <span className="absolute inset-x-0 top-0 z-10 h-[3px] bg-amber-300" />
          {eins.bild && <div className="relative w-[44%] shrink-0 overflow-hidden"><Bild src={eins.bild} className="absolute inset-0 h-full w-full object-top transition duration-700 group-hover:scale-105" /></div>}
          <div className="flex min-w-0 flex-1 flex-col justify-between p-4">
            <div className="flex items-start justify-between"><span className="titel zahl text-6xl !text-amber-300">1</span>{eins.land && <img src={flagge(eins.land)} alt="" className="h-5 w-7 rounded-sm object-cover" />}</div>
            <div>
              <p className="titel truncate text-5xl">{name(eins)}</p>
              <p className="truncate text-xs text-white/45">{eins.name}</p>
              <div className="mt-2 flex gap-5">
                <div><p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/40">Score</p><p className="text-xl font-extrabold text-white"><Zaehler wert={eins.wertung} /></p></div>
                {eins.deltaWertung != null && <div><p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/40">This week</p><p className={`zahl text-xl font-extrabold ${eins.deltaWertung >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{eins.deltaWertung >= 0 ? '+' : ''}{eins.deltaWertung.toLocaleString('en')}</p></div>}
              </div>
            </div>
          </div>
        </Link>
      )}
      {/* Verfolger: so viele, wie in die Hoehe passen - unten laeuft die Liste aus */}
      <div className="relative mt-2 min-h-[180px] flex-1 overflow-hidden px-2">
        {rest.slice(0, 9).map((s) => (
          <Link key={s.id} to={`/competitive/player/${s.id}`} className="group flex h-[58px] items-center gap-3 rounded-xl px-3 transition hover:bg-white/[0.04]">
            <span className="titel zahl w-6 text-center text-2xl !text-white/50">{s.rank}</span>
            {s.bild ? <Bild src={s.bild} className="h-12 w-9 shrink-0 rounded-lg object-top ring-1 ring-white/10" /> : <span className="w-9 shrink-0" />}
            {s.land && <img src={flagge(s.land)} alt="" className="h-3 w-[18px] shrink-0 rounded-sm object-cover" />}
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white group-hover:text-akz">{name(s)}</span>
            <Wechsel n={s.deltaPlatz} />
            <span className="zahl w-14 text-right text-sm font-bold text-white">{s.wertung.toLocaleString('en')}</span>
          </Link>
        ))}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-fl to-transparent" />
      </div>
      <div className="grid shrink-0 grid-cols-2 gap-px border-t border-white/[0.07] bg-white/[0.06]">
        {([['Biggest climbers', aufsteiger, true], ['Biggest fallers', absteiger, false]] as Array<[string, PR[], boolean]>).map(([titel, liste, hoch]) => (
          <div key={titel} className="bg-fl px-3 py-3">
            <p className={`px-1 text-[10px] font-semibold uppercase tracking-[0.22em] ${hoch ? 'text-emerald-300' : 'text-red-300'}`}>{titel}</p>
            <ul className="mt-1">
              {liste.slice(0, 5).map((s) => (
                <li key={s.id}><Link to={`/competitive/player/${s.id}`} className="flex items-center gap-1.5 rounded-md px-1 py-1 transition hover:bg-white/[0.05]">
                  {s.land ? <img src={flagge(s.land)} alt="" className="h-2.5 w-[15px] shrink-0 rounded-[2px] object-cover" /> : <span className="w-[15px] shrink-0" />}
                  <span className="min-w-0 flex-1 truncate text-xs text-white/85">{name(s)}</span>
                  <span className={`zahl shrink-0 text-[11px] font-bold ${hoch ? 'text-emerald-400' : 'text-red-400'}`}>{hoch ? '▲' : '▼'} {Math.abs(s.deltaPlatz).toLocaleString('en')}</span>
                </Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Flaeche>
  );
}

/* ------------------------------------------------------------------------------------------------ Werkzeuge */

// Nur eigene Bilder des Betreibers und feste Cup-Banner im 16:9-Format - keine Ranked- oder Skin-Cup-Motive als Deko, jedes Bild nur einmal.
const WERKZEUGE = [
  { titel: 'Deep Stats', text: 'Damage per weapon, third parties, heatmaps', pfad: 'deep-stats', bild: '/cups/console-champions-cup.webp' },
  { titel: 'Replays', text: 'Rewatch any cup game in 2D', pfad: 'replays', bild: '/cups/gamers8.webp' },
  { titel: 'Match Finder', text: 'Live match IDs of the pros', pfad: 'match-finder', bild: '/cups/elite-cup.webp' },
  { titel: 'Maps', text: 'Drop maps of every cup', pfad: 'maps', bild: '/cups/reload-cup.webp' },
  { titel: 'FNCS', text: 'Finals, champions, all-time', pfad: 'fncs', bild: '/cups/fncs-grand-finals.webp' },
  { titel: 'Tierlist', text: 'Build your own tier list', pfad: 'tierlist', bild: '/cups/zb-duos-cash-cup.webp' },
];

function Werkzeuge() {
  return (
    <Abschnitt ueber="Tools" titel="Go deeper">
      <div className="grid gap-5 xl:grid-cols-12">
        <Flaeche fest klick className="group overflow-hidden xl:col-span-5">
          <Link to="/competitive/statistics" className="flex h-full flex-col">
            <div className="relative aspect-video overflow-hidden xl:aspect-auto xl:min-h-[240px] xl:flex-1">
              <Bild src="/slider/victory-cup.webp" className="absolute inset-0 h-full w-full transition duration-700 group-hover:scale-[1.05]" />
              <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-fl to-transparent" />
            </div>
            <div className="flex shrink-0 flex-wrap items-end justify-between gap-4 px-6 pb-6 pt-2">
              <div className="min-w-0">
                <p className="ueber">Every pro · every cup</p>
                <h3 className="titel mt-1 text-5xl">Statistics</h3>
                <p className="mt-1.5 max-w-md text-sm text-white/55">Damage, eliminations, mats and earnings of every pro – per match day or over a whole season.</p>
              </div>
              <span className="knopf-prim shrink-0">Open statistics <span aria-hidden>→</span></span>
            </div>
          </Link>
        </Flaeche>
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-3 xl:col-span-7">
          {WERKZEUGE.map((w, i) => <MedienKarte key={w.pfad} bild={w.bild} titel={w.titel} unter={w.text} zu={`/competitive/${w.pfad}`} verz={i * 0.04} />)}
        </div>
      </div>
    </Abschnitt>
  );
}

/* ------------------------------------------------------------------------------------------------ Seite */

export default function Competitive() {
  const jetzt = useJetzt();
  const [cups, setCups] = useState<Cup[] | null>(null);
  const [pr, setPr] = useState<{ spitze: PR[]; aufsteiger: PR[]; absteiger: PR[]; total: number; stand: number | null }>({ spitze: [], aufsteiger: [], absteiger: [], total: 0, stand: null });
  useEffect(() => {
    const katalog = () => fetch('/api/cup-catalog?modus=alle').then((r) => r.json()).then((j) => setCups(j.cups ?? [])).catch(() => setCups((c) => c ?? []));
    // erst der kleine Katalog (live + kommend), damit die Buehne sofort steht - der ganze mit den beendeten Cups kommt nach
    fetch('/api/cup-catalog?modus=alle-aktuell').then((r) => r.json()).then((j) => setCups((c) => c ?? j.cups ?? null)).catch(() => {});
    katalog(); const i = setInterval(katalog, 5 * 60e3);
    fetch('/api/power-rankings?uebersicht=1').then((r) => r.json())
      .then((j) => setPr((v) => ({ ...v, spitze: v.spitze.length ? v.spitze : j.spitze ?? [], aufsteiger: j.aufsteiger ?? [], absteiger: j.absteiger ?? [], total: j.total ?? 0, stand: j.fetchedAt ?? null }))).catch(() => {});
    // die Uebersicht liefert nur die Top 3 - die Verfolger kommen aus der ersten Seite der Liste
    fetch('/api/power-rankings?page=1&pageSize=10').then((r) => r.json()).then((j) => { if (j.players?.length) setPr((v) => ({ ...v, spitze: j.players.slice(0, 10) })); }).catch(() => {});
    return () => clearInterval(i);
  }, []);
  // Einteilung nur jede Minute neu, die Countdowns ticken trotzdem sekundengenau
  const minute = Math.floor(jetzt / 60000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ein = useMemo(() => einteilen(cups ?? [], Date.now()), [cups, minute]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const naechster = useMemo(() => {
    const t = Date.now();
    const gross = ein.kommend.find((x) => buehnenReif(x.c) && (x.lage.naechster ?? 0) - t < 14 * TAG) ?? ein.kommend[0];
    return gross ? naechsterTermin(gross.c, t) : null;
  }, [ein]);
  const aufBuehne = ein.live.some((t) => wichtig(t.cup)) ? null : naechster?.cup.id;
  const liveCups = new Set(ein.live.map((t) => t.cup.id)).size;
  const puls = (
    <>
      <PulsZelle label="Live now" zu="/competitive/events" unter={liveCups ? [...new Set(ein.live.map((t) => t.f.region))].join(' · ') : 'no cup is running right now'}>
        <span className={liveCups ? 'text-red-300' : ''}><Zaehler wert={liveCups} /></span> <span className="text-xl text-white/40">{liveCups === 1 ? 'cup' : 'cups'}</span>
      </PulsZelle>
      <PulsZelle label="Next 7 days" zu="/competitive/events" unter="match days on the calendar, all regions"><Zaehler wert={ein.bald} /></PulsZelle>
      <PulsZelle label="Last 7 days" zu="/competitive/events" unter="match days played, with full results"><Zaehler wert={ein.gewesen} /></PulsZelle>
      <PulsZelle label="Power Rankings" zu="/competitive/rankings" unter={pr.stand ? `updated ${new Date(pr.stand).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Epic’s global ranking'}>
        <Zaehler wert={pr.total} /> <span className="text-xl text-white/40">players</span>
      </PulsZelle>
    </>
  );
  // Der Cup auf der Buehne steht nicht noch einmal unter "Coming up" (jedes Banner nur einmal auf dem Schirm)
  const kommend = ein.kommend.filter((x) => x.c.id !== aufBuehne);
  return (
    <div className="space-y-9">
      {cups === null ? <div className="fl-fest h-[560px] animate-pulse" /> : <Buehne live={ein.live} naechster={naechster} jetzt={jetzt} puls={puls} />}
      <div className="grid gap-x-5 gap-y-9 xl:grid-cols-12">
        <div className="space-y-9 xl:col-span-8">
          <Demnaechst kommend={kommend} jetzt={jetzt} />
          <LetzteSieger sieger={ein.sieger} />
        </div>
        <aside className="relative xl:col-span-4 xl:min-h-[800px]"><RanglistenTafel spitze={pr.spitze} aufsteiger={pr.aufsteiger} absteiger={pr.absteiger} /></aside>
      </div>
      <Werkzeuge />
    </div>
  );
}
