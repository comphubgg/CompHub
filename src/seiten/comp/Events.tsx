import { motion } from 'framer-motion';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Flaeche, Kennzahl, Leer, Segment, SeitenKopf } from '../../ds/Bausteine';
import {
  ART_NAME, MODI, MODUS_NAME, REGIONEN, REGION_NAME, cupLink, datum, dauer, fensterIn, istRanked, laeuft, lageVon, modiVon, stufeName, tagKurz, useJetzt, vorbei,
  type Cup, type Fenster, type Lage, type Modus,
} from './events/gemeinsam';
import { BildMarke, CupBild, CupKarte, CupKarteQuer, CupMarken, LiveMarke, RegionMarke, Uhrwerk, spiele } from './events/teile';

/*
 * Alle Cups im Hub (/api/cup-catalog), neu komponiert (Design-System 3.0):
 *   links   der wichtigste Cup als geteilte Karte (Banner ganz zu sehen, daneben Countdown-Kacheln, Startzeiten je Region), darunter eine
 *           Filterzeile (Stand, Suche, Region, Spielart, Ranked) und die Cups als gleich grosse Karten - Beendete nach Monaten gegliedert
 *   rechts  der Spielplan: die naechsten Spieltage als Tagesliste, klebt beim Rollen
 * Jeder Cup zeigt hier sein eigenes Thumbnail, auch Ranked- und Skin-Cups (Betreiber). Zuerst nur Live/Demnaechst (modus=alle-aktuell, klein),
 * der ganze Katalog mit den beendeten Cups kommt im Hintergrund nach (modus=alle).
 */

/** Nach Wichtigkeit wie auf der Seite: FNCS, Globals, Division, Majors zuerst - Arena, Test, Mobile zuletzt. */
const gewicht = (c: Cup) => (/FNCS|Global|Championship|Division|Major|LAN|Elite/i.test(c.titel) ? 0 : /Arena|Test|Fight Night|Mobile/i.test(c.titel) ? 2 : 1);
const GEWICHT_REGION: Record<string, number> = { EU: 0, NAC: 1, NAW: 2, BR: 3, ASIA: 4, ME: 5, OCE: 6 };
const uhrzeit = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const TAG = 86400e3;
type Stand = 'alle' | 'live' | 'kommt' | 'vorbei';
/** Wann welche Region am Tag des naechsten Spieltags dran ist. */
function zeitenVon(c: Cup, region: string, f: Fenster | null) {
  if (!f) return [];
  return fensterIn(c, region).filter((x) => x.begin >= f.begin && x.begin - f.begin < TAG)
    .sort((a, b) => (GEWICHT_REGION[a.region] ?? 9) - (GEWICHT_REGION[b.region] ?? 9) || a.begin - b.begin).filter((x, i, l) => l.findIndex((y) => y.region === x.region) === i);
}
interface Zeile { c: Cup; lage: Lage }

/** Der Kopf: der wichtigste laufende Cup - sonst der naechste. Banner links ganz zu sehen, rechts alles zum Spieltag. */
function Held({ c, lage, jetzt, region }: { c: Cup; lage: Lage; jetzt: number; region: string }) {
  const f = lage.fenster;
  const live = lage.status === 'live';
  const ziel = live ? f?.end ?? null : lage.naechster;
  const anteil = live && f?.end ? Math.min(1, Math.max(0, (jetzt - f.begin) / (f.end - f.begin))) : 0;
  // wann welche Region am selben Tag dran ist (live: wo es gerade laeuft)
  const zeiten = live ? [] : zeitenVon(c, region, f);
  return (
    <Flaeche fest className="group overflow-hidden">
      <div className="grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Link to={cupLink(c, f)} className="relative block aspect-video overflow-hidden lg:aspect-auto lg:min-h-[340px]">
          <CupBild c={c} className="transition duration-700 group-hover:scale-[1.04]" />
          <div className="absolute inset-y-0 right-0 hidden w-24 bg-gradient-to-l from-fl to-transparent lg:block" />
          <div className="absolute left-4 top-4 flex flex-wrap gap-1.5">{live ? <LiveMarke text="Live now" /> : <BildMarke>Up next</BildMarke>}</div>
        </Link>
        <div className="flex min-w-0 flex-col justify-center gap-4 p-6 lg:p-8">
          <div className="flex flex-wrap gap-1.5"><CupMarken c={c} /></div>
          <div>
            <h2 className="titel text-5xl 2xl:text-6xl">{c.titel.split(/\s·\s|\s\(/)[0]}</h2>
            {f && <p className="mt-2 text-[15px] text-white/60"><span className="font-semibold text-white">{stufeName(f)}</span>{f.matchCap ? ` · ${spiele(f.matchCap)}` : ''}{ziel ? ` · ${live ? 'ends ' : ''}${datum(ziel)}` : ''}</p>}
          </div>
          {ziel && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/45">{live ? 'Ends in' : 'Starts in'}</p>
              <div className="mt-1.5"><Uhrwerk ms={ziel - jetzt} ton={live ? 'rot' : 'akz'} /></div>
              {live && <div className="mt-3 h-1.5 max-w-sm overflow-hidden rounded-full bg-white/10"><motion.div className="h-full rounded-full bg-gradient-to-r from-red-400 to-amber-300" initial={{ width: 0 }} animate={{ width: `${anteil * 100}%` }} transition={{ duration: 1 }} /></div>}
            </div>
          )}
          <div className="flex flex-wrap gap-1">
            {live ? lage.wo.map((r) => <RegionMarke key={r} r={r} />) : zeiten.map((x) => <RegionMarke key={x.windowId} r={x.region} zeit={uhrzeit(x.begin)} />)}
          </div>
          <div><Link to={cupLink(c, f)} className="knopf-prim">{live ? 'Open live leaderboard' : 'Open event'} <span aria-hidden>→</span></Link></div>
        </div>
      </div>
    </Flaeche>
  );
}

/** Der Spielplan am rechten Rand: was laeuft und was kommt, nach Tagen - je Cup eine Zeile mit den Startzeiten der Regionen. */
function Spielplan({ cups, region, jetzt }: { cups: Cup[]; region: string; jetzt: number }) {
  const [alle, setAlle] = useState(false);
  const minute = Math.floor(jetzt / 60_000);
  const tage = useMemo(() => {
    const t = Date.now();
    const je = new Map<string, { c: Cup; tag: number; fenster: Fenster[]; live: boolean }>();
    for (const c of cups) for (const f of fensterIn(c, region)) {
      const l = laeuft(f, t);
      if (!l && !(f.begin > t && f.begin - t < 14 * TAG)) continue;
      const d = new Date(l ? t : f.begin); const tag = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const k = `${c.id}|${tag}`;
      const e = je.get(k) ?? { c, tag, fenster: [], live: false };
      e.fenster.push(f); e.live = e.live || l; je.set(k, e);
    }
    const zeilen = [...je.values()].map((e) => ({ ...e, fenster: e.fenster.sort((a, b) => a.begin - b.begin), start: Math.min(...e.fenster.map((f) => f.begin)) }))
      .sort((a, b) => a.tag - b.tag || Number(b.live) - Number(a.live) || a.start - b.start);
    const gruppen: Array<{ tag: number; zeilen: typeof zeilen }> = [];
    for (const z of zeilen) { const g = gruppen[gruppen.length - 1]; if (g && g.tag === z.tag) g.zeilen.push(z); else gruppen.push({ tag: z.tag, zeilen: [z] }); }
    return gruppen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cups, region, minute]);
  const heute = new Date(); const h0 = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate()).getTime();
  const tagName = (t: number) => (t === h0 ? 'Today' : t === h0 + TAG ? 'Tomorrow' : new Date(t).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short' }));
  const anzahl = tage.reduce((n, g) => n + g.zeilen.length, 0);
  // Rueckblick: die zuletzt gespielten Spieltage (7 Tage), neueste zuerst - je Cup und Tag eine Zeile
  const gespielt = useMemo(() => {
    const t = Date.now();
    const je = new Map<string, { c: Cup; ende: number; fenster: Fenster[] }>();
    for (const c of cups) for (const f of fensterIn(c, region)) {
      if (!vorbei(f, t) || t - (f.end ?? f.begin) > 7 * TAG) continue;
      const d = new Date(f.begin); const k = `${c.id}|${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const e = je.get(k) ?? { c, ende: 0, fenster: [] };
      e.fenster.push(f); e.ende = Math.max(e.ende, f.end ?? f.begin); je.set(k, e);
    }
    return [...je.values()].sort((a, b) => b.ende - a.ende).slice(0, 14)
      .map((e) => ({ ...e, fenster: e.fenster.sort((a, b) => (GEWICHT_REGION[a.region] ?? 9) - (GEWICHT_REGION[b.region] ?? 9) || b.begin - a.begin) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cups, region, minute]);
  let rest = alle ? Infinity : 6;
  const kopfzeile = 'sticky top-0 z-10 flex items-center justify-between bg-fl px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/45';
  return (
    <Flaeche fest className="flex flex-col overflow-hidden xl:max-h-[calc(100vh-128px)]">
      <div className="flex items-end justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
        <div><p className="ueber">Schedule</p><h2 className="titel mt-1 text-3xl">Match days</h2></div>
        <span className="zahl text-right text-xs text-white/40">{region === 'alle' ? 'all regions' : REGION_NAME[region] ?? region}<br />your local time</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!anzahl && <p className="px-5 py-5 text-sm text-white/45">Nothing scheduled in the next 14 days with these filters – Epic announces cups about a week ahead.</p>}
        {tage.map((g) => {
          if (rest <= 0) return null;
          const zeilen = g.zeilen.slice(0, rest); rest -= zeilen.length;
          return (
            <div key={g.tag}>
              <p className={kopfzeile}>
                <span className={g.tag === h0 ? 'text-akz' : ''}>{tagName(g.tag)}</span>
                {g.tag > h0 && <span className="zahl normal-case tracking-normal text-white/30">in {dauer(g.zeilen[0].start - jetzt)}</span>}
              </p>
              {zeilen.map((z) => (
                <Link key={z.c.id} to={cupLink(z.c, z.fenster.find((f) => laeuft(f, jetzt)) ?? z.fenster[0])} className="group flex gap-3 border-t border-white/[0.04] px-5 py-2.5 transition hover:bg-white/[0.035]">
                  <div className="relative h-[46px] w-[82px] shrink-0 overflow-hidden rounded-lg bg-black/40"><CupBild c={z.c} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-[13px] font-semibold text-white group-hover:text-akz">
                      {z.live && <span className="relative flex h-1.5 w-1.5 shrink-0"><span className="absolute h-full w-full animate-ping rounded-full bg-red-400 opacity-70" /><span className="relative h-1.5 w-1.5 rounded-full bg-red-500" /></span>}
                      <span className="truncate">{z.c.titel}</span>
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {z.fenster.filter((f, i, l) => l.findIndex((y) => y.region === f.region) === i).slice(0, 7).map((f) => <RegionMarke key={f.windowId} r={f.region} zeit={laeuft(f, jetzt) ? 'live' : uhrzeit(f.begin)} klein />)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          );
        })}
        {anzahl > 6 && <button type="button" onClick={() => setAlle((x) => !x)} className="w-full border-t border-white/[0.06] py-2.5 text-xs font-semibold text-akz transition hover:bg-white/[0.03]">{alle ? 'Show less' : `Show all ${anzahl} upcoming entries`}</button>}
        {gespielt.length > 0 && (
          <div className="border-t border-white/[0.07]">
            <p className={kopfzeile}><span>Just played · results</span><span className="zahl normal-case tracking-normal text-white/30">last 7 days</span></p>
            {gespielt.map((z, i) => (
              <Link key={`${z.c.id}-${z.ende}`} to={cupLink(z.c, z.fenster[0])} className={`group gap-3 ${i >= 5 ? 'hidden xl:flex' : 'flex'} border-t border-white/[0.04] px-5 py-2.5 transition hover:bg-white/[0.035]`}>
                <div className="relative h-[46px] w-[82px] shrink-0 overflow-hidden rounded-lg bg-black/40"><CupBild c={z.c} /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-white group-hover:text-akz">{z.c.titel}</p>
                  <p className="zahl mt-0.5 truncate text-[11px] text-white/45">{stufeName(z.fenster[0])} · {tagKurz(z.ende)} · {[...new Set(z.fenster.map((f) => f.region))].slice(0, 7).join(' ')}</p>
                </div>
                <span aria-hidden className="self-center text-white/25 transition group-hover:text-akz">→</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Flaeche>
  );
}

function Teil({ titel, zahl: n, rechts, children }: { titel: string; zahl: number; rechts?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="h-6 w-1 rounded-full bg-akz shadow-[0_0_14px_rgb(var(--akz)/0.8)]" />
          <h2 className="titel text-3xl">{titel}</h2><span className="zahl mt-1 rounded-md bg-white/[0.06] px-2 py-0.5 text-xs font-bold text-white/55">{n}</span>
        </div>
        {rechts}
      </div>
      {children}
    </section>
  );
}

export default function Events() {
  const [cups, setCups] = useState<Cup[] | null>(null);
  const [ganz, setGanz] = useState(false);
  const [fehler, setFehler] = useState(false);
  const [region, setRegion] = useState('alle');
  const [modus, setModus] = useState<'alle' | Modus>('alle');
  const [ranked, setRanked] = useState(false);
  const [suche, setSuche] = useState('');
  const [stand, setStand] = useState<Stand>('alle');
  const [mehr, setMehr] = useState(12);
  const jetzt = useJetzt();

  useEffect(() => {
    let weg = false;
    fetch('/api/cup-catalog?modus=alle-aktuell').then((r) => r.json()).then((d) => { if (!weg && d.cups) setCups((alt) => alt ?? d.cups); }).catch(() => {});
    fetch('/api/cup-catalog?modus=alle').then((r) => r.json()).then((d) => { if (!weg && d.cups) { setCups(d.cups); setGanz(true); } })
      .catch(() => { if (!weg) setFehler(true); });
    return () => { weg = true; };
  }, []);

  // Die Lage aendert sich nur im Minutentakt merklich - die Einteilung wird darum nicht jede Sekunde neu gerechnet.
  const minute = Math.floor(jetzt / 60_000);
  const ein = useMemo(() => {
    const t = Date.now();
    const q = suche.trim().toLowerCase();
    const gefiltert = (cups ?? []).filter((c) => (region === 'alle' || c.global || c.regionen[region])
      && (modus === 'alle' || modiVon(c).has(modus))
      && (ranked || q || !istRanked(c))
      && (!q || `${c.titel} ${c.untertitel ?? ''} ${c.art} ${ART_NAME[c.art] ?? ''}`.toLowerCase().includes(q)));
    const liste: Zeile[] = gefiltert.map((c) => ({ c, lage: lageVon(c, region, t) }));
    const live = liste.filter((x) => x.lage.status === 'live').sort((a, b) => gewicht(a.c) - gewicht(b.c));
    const kommt = liste.filter((x) => x.lage.status === 'kommt').sort((a, b) => (a.lage.naechster ?? 0) - (b.lage.naechster ?? 0));
    const vorbei = liste.filter((x) => x.lage.status === 'vorbei' && x.lage.letzter).sort((a, b) => (b.lage.letzter ?? 0) - (a.lage.letzter ?? 0));
    // Der Kopf nimmt keinen Ranked Cup, wenn es etwas anderes gibt.
    const kopfWahl = [...live, ...[...kommt].sort((a, b) => gewicht(a.c) - gewicht(b.c) || (a.lage.naechster ?? 0) - (b.lage.naechster ?? 0))];
    const kopf = kopfWahl.find((x) => x.c.bild && !istRanked(x.c)) ?? kopfWahl.find((x) => x.c.bild) ?? kopfWahl[0] ?? null;
    return { gefiltert, live, kommt, vorbei, kopf };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cups, region, modus, ranked, suche, minute]);

  const ohneKopf = (l: Zeile[]) => (stand === 'alle' ? l.filter((x) => x.c.id !== ein.kopf?.c.id) : l);
  const lebende = ohneKopf(ein.live);
  const kommende = ohneKopf(ein.kommt);
  // Beendete nach Monaten gegliedert
  const monate = useMemo(() => {
    const g: Array<{ titel: string; zeilen: Zeile[] }> = [];
    for (const x of ein.vorbei.slice(0, mehr)) {
      const titel = new Date(x.lage.letzter ?? 0).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      const l = g[g.length - 1]; if (l && l.titel === titel) l.zeilen.push(x); else g.push({ titel, zeilen: [x] });
    }
    return g;
  }, [ein.vorbei, mehr]);
  const mitSonst = (cups ?? []).some((c) => modiVon(c).has('sonst'));
  const raster = 'grid gap-5 sm:grid-cols-2 lg:grid-cols-3 min-[1900px]:grid-cols-4';
  const karte = (x: Zeile, i: number) => (
    <CupKarte key={x.c.id} c={x.c} lage={x.lage} verz={Math.min(i, 8) * 0.03}
      dauerText={x.lage.status === 'live' && x.lage.fenster?.end ? `ends in ${dauer(x.lage.fenster.end - jetzt)}` : x.lage.status === 'kommt' && x.lage.naechster ? `in ${dauer(x.lage.naechster - jetzt)}` : undefined} />
  );
  /** Ein oder zwei Cups stehen quer ueber die ganze Breite - eine einzelne kleine Karte in einer leeren Reihe gibt es nicht. */
  const reihe = (l: Zeile[]) => (l.length > 2 ? <div className={raster}>{l.map(karte)}</div> : (
    <div className={`grid gap-5 ${l.length === 2 ? 'min-[1900px]:grid-cols-2' : ''}`}>
      {l.map((x, i) => {
        const f = x.lage.fenster; const live = x.lage.status === 'live';
        return <CupKarteQuer key={x.c.id} c={x.c} lage={x.lage} verz={i * 0.04} ms={live ? (f?.end ? f.end - jetzt : null) : x.lage.naechster ? x.lage.naechster - jetzt : null}
          zeiten={live ? undefined : zeitenVon(x.c, region, f).map((y) => ({ r: y.region, zeit: uhrzeit(y.begin) }))} />;
      })}
    </div>
  ));
  const zeigt = (s: Stand) => stand === 'alle' || stand === s;
  const gefiltert = region !== 'alle' || modus !== 'alle' || ranked || !!suche.trim();

  return (
    <div>
      <SeitenKopf ueber="Tournaments" titel="Events" text="Every Fortnite competitive cup – live, upcoming and finished, straight from Epic's tournament data."
        rechts={cups && (
          <div className="flex gap-7">
            <Kennzahl label="Live now" wert={ein.live.length} ton={ein.live.length ? 'rot' : 'weiss'} />
            <Kennzahl label="Upcoming" wert={ein.kommt.length} ton="akz" />
            <Kennzahl label="Finished" wert={ganz ? ein.vorbei.length : '…'} />
          </div>
        )} />

      {!cups && !fehler && <div className="fl-fest h-[360px] animate-pulse" />}
      {fehler && !cups && <Leer text="The event catalogue isn't reachable right now. Try again in a moment." />}

      {cups && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_380px] xl:grid-rows-[auto_1fr]">
          {/* Auf dem Handy: Kopf, Spielplan, dann Filter und Karten. Am Bildschirm steht der Spielplan rechts ueber die ganze Hoehe und klebt. */}
          {ein.kopf && stand === 'alle' && <div className="min-w-0"><Held c={ein.kopf.c} lage={ein.kopf.lage} jetzt={jetzt} region={region} /></div>}
          <aside className="min-w-0 xl:col-start-2 xl:row-span-2 xl:row-start-1"><div className="xl:sticky xl:top-[112px]"><Spielplan cups={ein.gefiltert} region={region} jetzt={jetzt} /></div></aside>
          <div className="min-w-0 space-y-6 xl:col-start-1">

            {/* ------------------------------------------------ Filter: klebt unter der Leiste */}
            <div className="fl-fest sticky top-[104px] z-20 space-y-2.5 !rounded-2xl p-3">
              <div className="flex flex-wrap items-center gap-3">
                <Segment id="ev-stand" wert={stand} onWahl={setStand} klein wahl={[
                  { k: 'alle', titel: 'All' }, { k: 'live', titel: `Live ${ein.live.length}` }, { k: 'kommt', titel: `Upcoming ${ein.kommt.length}` }, { k: 'vorbei', titel: `Finished ${ganz ? ein.vorbei.length : '…'}` },
                ]} />
                <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
                  <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Search a cup…" className="eingabe w-full !py-2 !pl-9" />
                  <svg className="absolute left-3 top-2.5 h-4 w-4 text-white/35" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                </div>
                <button type="button" onClick={() => setRanked((x) => !x)} aria-pressed={ranked} className="ml-auto flex items-center gap-2.5 text-xs font-semibold text-white/65 transition hover:text-white">
                  <span className={`relative h-4 w-7 rounded-full transition ${ranked ? 'bg-akz' : 'bg-white/15'}`}><span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${ranked ? 'left-3.5' : 'left-0.5'}`} /></span>
                  Ranked cups
                </button>
              </div>
              <div className="ohne-leiste -mx-1 flex items-center gap-1.5 overflow-x-auto px-1">
                <button type="button" className={`chip ${region === 'alle' ? 'chip-an' : ''}`} onClick={() => setRegion('alle')}>All regions</button>
                {REGIONEN.map((r) => <button key={r} type="button" title={REGION_NAME[r]} className={`chip ${region === r ? 'chip-an' : ''}`} onClick={() => setRegion(r)}>{r}</button>)}
                <span aria-hidden className="mx-1.5 h-5 w-px shrink-0 bg-white/10" />
                <button type="button" className={`chip ${modus === 'alle' ? 'chip-an' : ''}`} onClick={() => setModus('alle')}>All modes</button>
                {MODI.filter((m) => m !== 'sonst' || mitSonst).map((m) => <button key={m} type="button" className={`chip ${modus === m ? 'chip-an' : ''}`} onClick={() => setModus(m)}>{MODUS_NAME[m]}</button>)}
                {gefiltert && <button type="button" className="knopf-leer ml-1 shrink-0 !text-xs" onClick={() => { setRegion('alle'); setModus('alle'); setRanked(false); setSuche(''); }}>Reset</button>}
              </div>
            </div>

            {zeigt('live') && (lebende.length > 0 || stand === 'live') && (
              <Teil titel="Live now" zahl={ein.live.length}>
                {lebende.length ? reihe(lebende) : <Leer text="No cup is live right now with these filters." />}
              </Teil>
            )}
            {zeigt('kommt') && (
              <Teil titel="Upcoming" zahl={ein.kommt.length}>
                {kommende.length ? reihe(kommende)
                  : <Leer text={ein.kommt.length ? 'The next cup is the one on top – nothing else is announced with these filters.' : 'No upcoming cups match these filters – Epic announces cups about a week ahead.'} />}
              </Teil>
            )}
            {zeigt('vorbei') && (
              <Teil titel="Finished" zahl={ein.vorbei.length} rechts={!ganz && <span className="text-xs text-white/40">loading the full archive…</span>}>
                {ein.vorbei.length ? (
                  <div className="space-y-6">
                    {monate.map((m) => (
                      <div key={m.titel}>
                        <p className="mb-3 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/45">{m.titel}<span className="h-px flex-1 bg-white/[0.07]" /></p>
                        <div className={raster}>{m.zeilen.map(karte)}</div>
                      </div>
                    ))}
                    {ein.vorbei.length > mehr && <div className="flex justify-center"><button type="button" onClick={() => setMehr((m) => m + 12)} className="knopf">Show more ({ein.vorbei.length - mehr})</button></div>}
                  </div>
                ) : ganz && <Leer text="No finished cups match these filters." />}
              </Teil>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
