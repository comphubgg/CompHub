import { motion } from 'framer-motion';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bild, Flaeche, Laedt, Leer, Marke, MedienKarte, Segment, Zaehler } from '../../../../ds/Bausteine';
import { useWer } from '../../../../teile/Anmeldung';
import { FehlerZeile, SEITE, chip, datumLang, useDaten } from '../teile';
import { REGION_FARBE } from '../../events/gemeinsam';

/*
 * Maps im Hub - die Landepunkt-Karten aller Cups, nach Kapitel und Saison (wie /tournament-maps der Seite, /api/maps-liste).
 * Aufbau (Design-System 3.0, 27.11.2026): links eine klebende Leiste - Titel, Suche, die Kapitel als grosse Ziffern mit Mengenbalken, die Wege
 * zu Map Evolution und den Turnierkarten; rechts die Buehne des gewaehlten Kapitels (Kapitelbild, Saisons als Chips), darunter die Filter (Art,
 * Region - immer sichtbar) und die Cups je Saison als Bildkarten oder als Liste. Dazu die eigenen Karten (/api/turnier-karten?liste=1), die zu
 * keinem bekannten Spieltag gehoeren. Kein "All time" - waere zu viel (Betreiber).
 */

type Typ = 'fncs' | 'performance' | 'division' | 'reload' | 'sonst';
export interface MapEintrag {
  turnierId: string; region: string; windowId: string; cup: string; fenster: string; titel: string;
  datum: number | null; ende: number | null; saison: string; saisonKurz: string; saisonName: string; typ: Typ; bild: string | null;
  eventId?: string | null; reihe?: number; lan?: boolean; alt?: boolean; saisonTitel?: string; epicFenster?: string;
}
interface Saison { kennung: string; nr: number; name: string; kurz: string; kapitel: number; titel?: string }
interface Eigene { id: string; titel: string; region: string | null; windowId: string | null; datum: number | null; bild: string | null }

const TYPEN: Array<[Typ, string]> = [['fncs', 'FNCS'], ['performance', 'Performance'], ['division', 'Division'], ['reload', 'Reload'], ['sonst', 'Cups']];
const TYP_NAME: Record<Typ, string> = { fncs: 'FNCS', performance: 'Performance', division: 'Division', reload: 'Reload', sonst: 'Cup' };
const REGIONEN = ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE', 'GLOBAL'];
const KAPITEL_BILD: Record<number, string> = {
  7: '/saisonbilder/CH7S4.jpg', 6: '/saisonbilder/CH6S4.webp', 5: '/saisonbilder/CH5S4.jpg', 4: '/saisonbilder/CH4.jpg',
  3: '/saisonbilder/CH3.jpg', 2: '/saisonbilder/Chapter 2 Remix.jpg', 1: '/saisonbilder/CH1.jpg',
};

/** LAN-Finals, Global Championship, Invitational und Summit sind weltweit - "Global", nicht "EU". */
export const regionAnzeige = (e: { region: string; lan?: boolean; cup?: string; titel?: string }) =>
  (e.lan || /global championship|invitational|summit|world cup|ewc/i.test(`${e.cup ?? ''} ${e.titel ?? ''}`) ? 'GLOBAL' : e.region);

export function stand(e: { datum: number | null; ende: number | null }): 'ended' | 'live' | 'upcoming' {
  const jetzt = Date.now();
  if (e.datum && jetzt < e.datum) return 'upcoming';
  if (e.ende && jetzt > e.ende) return 'ended';
  if (!e.ende && e.datum && jetzt - e.datum > 12 * 3600_000) return 'ended';
  return e.datum ? 'live' : 'ended';
}
export const kartenLink = (e: { turnierId: string; region: string; windowId: string }) =>
  `/competitive/maps/cup?t=${encodeURIComponent(e.turnierId)}&r=${encodeURIComponent(e.region)}&w=${encodeURIComponent(e.windowId)}`;

export function StandMarke({ s }: { s: 'ended' | 'live' | 'upcoming' }) {
  return s === 'live' ? <Marke ton="rot" puls>Live</Marke> : s === 'upcoming' ? <Marke ton="akz">Upcoming</Marke> : <Marke>Ended</Marke>;
}

/** Region als kleine farbige Marke (jede Region hat ihre feste Farbe - wie in Events). */
export function RegionMarke({ r }: { r: string }) {
  const f = REGION_FARBE[r] ?? '#94a3b8';
  return <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 backdrop-blur" style={{ color: f, background: 'rgba(0,0,0,.6)', boxShadow: `inset 0 0 0 1px ${f}55` }}>{r === 'GLOBAL' ? 'Global' : r}</span>;
}

const titelSauber = (t: string) => t.replace(/\s*·\s*/g, ' – ');
const klein = 'rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/50';

export default function Maps() {
  const { wer } = useWer();
  const [adresse] = useSearchParams();
  const [liste] = useDaten<{ ok: boolean; eintraege: MapEintrag[]; saisons: Saison[] }>('/api/maps-liste');
  const [eigeneStand] = useDaten<{ karten: Eigene[] }>('/api/turnier-karten?liste=1');
  const eintraege = liste.art === 'ok' && liste.d.ok ? liste.d.eintraege : null;
  const saisons = useMemo(() => (liste.art === 'ok' ? liste.d.saisons ?? [] : []), [liste]);
  const eigene = eigeneStand.art === 'ok' ? eigeneStand.d.karten ?? [] : [];

  const [suche, setSuche] = useState('');
  const [typ, setTyp] = useState<Typ | ''>('');
  const [kapitel, setKapitel] = useState(0);
  const [saison, setSaison] = useState('');
  const [region, setRegion] = useState('');
  const [ansicht, setAnsicht] = useState<'kacheln' | 'liste'>(() => { try { return localStorage.getItem('hub_maps_ansicht') === 'liste' ? 'liste' : 'kacheln'; } catch { return 'kacheln'; } });

  const zahlJe = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of eintraege ?? []) if (e.saison) m.set(e.saison, (m.get(e.saison) ?? 0) + 1);
    return m;
  }, [eintraege]);
  const kapitelListe = useMemo(() => {
    const m = new Map<number, { nr: number; saisons: Saison[]; n: number }>();
    for (const s of saisons) {
      const k = m.get(s.kapitel) ?? { nr: s.kapitel, saisons: [], n: 0 };
      k.saisons.push(s); k.n += zahlJe.get(s.kennung) ?? 0; m.set(s.kapitel, k);
    }
    return [...m.values()].sort((a, b) => a.nr - b.nr);
  }, [saisons, zahlJe]);

  // Beim ersten Laden: das juengste Kapitel mit Karten - oder ?saison= / ?typ= / ?region= aus der Adresse.
  useEffect(() => {
    if (!kapitelListe.length || kapitel) return;
    const w = adresse.get('typ'); if (w && TYPEN.some(([k]) => k === w)) setTyp(w as Typ);
    const rg = (adresse.get('region') ?? '').toUpperCase(); if (REGIONEN.includes(rg)) setRegion(rg);
    const s = saisons.find((x) => x.kennung === adresse.get('saison'));
    if (s) { setKapitel(s.kapitel); setSaison(s.kennung); return; }
    const j = [...kapitelListe].reverse().find((k) => k.n > 0); if (j) setKapitel(j.nr);
  }, [kapitelListe, saisons, adresse, kapitel]);

  const offen = kapitelListe.find((k) => k.nr === kapitel) ?? null;
  const ohneRegion = useMemo(() => {
    const q = suche.trim().toLowerCase();
    const kennungen = new Set((offen?.saisons ?? []).map((s) => s.kennung));
    return (eintraege ?? []).filter((e) => kennungen.has(e.saison) && (!saison || e.saison === saison) && (!typ || e.typ === typ)
      && (!q || `${e.titel} ${e.cup} ${e.fenster} ${e.region} ${e.saisonKurz}`.toLowerCase().includes(q)));
  }, [eintraege, offen, saison, typ, suche]);
  const sichtbar = useMemo(() => (region ? ohneRegion.filter((e) => regionAnzeige(e) === region) : ohneRegion), [ohneRegion, region]);
  const zahlRegion = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of ohneRegion) m.set(regionAnzeige(e), (m.get(regionAnzeige(e)) ?? 0) + 1);
    return m;
  }, [ohneRegion]);
  const bekannt = useMemo(() => new Set((eintraege ?? []).map((e) => e.windowId)), [eintraege]);
  const juengstes = Math.max(0, ...kapitelListe.filter((k) => k.n > 0).map((k) => k.nr));
  const nurEigene = useMemo(() => {
    if (typ || saison || region || (offen && offen.nr !== juengstes)) return [];
    const q = suche.trim().toLowerCase();
    return eigene.filter((k) => !(k.windowId && bekannt.has(k.windowId)) && (!q || `${k.titel} ${k.region ?? ''}`.toLowerCase().includes(q)));
  }, [eigene, bekannt, typ, saison, region, suche, offen, juengstes]);

  /** Die sichtbaren Karten je Saison, die juengste Saison zuerst - so liest sich ein Kapitel von oben nach unten durch seine Saisons. */
  const gruppen = useMemo(() => {
    const reihe = [...(offen?.saisons ?? [])].sort((a, b) => b.nr - a.nr);
    return reihe.map((s) => ({ s, l: sichtbar.filter((e) => e.saison === s.kennung) })).filter((g) => g.l.length);
  }, [offen, sichtbar]);

  const gewaehlteSaison = saison ? saisons.find((x) => x.kennung === saison) ?? null : null;
  const maxKapitel = Math.max(1, ...kapitelListe.map((k) => k.n));
  const merkeAnsicht = (k: 'kacheln' | 'liste') => { setAnsicht(k); try { localStorage.setItem('hub_maps_ansicht', k); } catch { /* ohne Speicher */ } };

  const karte = (e: MapEintrag, i: number) => {
    const r = regionAnzeige(e);
    return (
      <MedienKarte key={`${e.turnierId}|${e.region}|${e.windowId}`} verz={Math.min(i, 10) * 0.03} bild={e.bild} zu={kartenLink(e)} titel={titelSauber(e.titel)}
        unter={<span className="zahl">{[e.fenster, e.datum ? datumLang(e.datum) : ''].filter(Boolean).join(' · ')}</span>}
        marke={<><StandMarke s={stand(e)} />{e.lan && <Marke ton="gold">LAN</Marke>}</>} ecke={<RegionMarke r={r} />}>
        <p className="mt-2.5 flex flex-wrap gap-1"><span className={klein}>{TYP_NAME[e.typ]}</span>{e.saisonKurz && <span className={klein}>{e.saisonKurz}</span>}</p>
      </MedienKarte>
    );
  };
  const eigeneKarte = (k: Eigene, i: number) => (
    <MedienKarte key={k.id} verz={Math.min(i, 10) * 0.03} bild={k.bild} zu={`/competitive/maps/view?id=${encodeURIComponent(k.id)}`} titel={titelSauber(k.titel)}
      unter={<span className="zahl">{k.datum ? datumLang(k.datum) : 'Tournament map'}</span>} marke={<Marke ton="akz">Tournament map</Marke>}
      ecke={k.region && k.region !== 'GLOBAL' ? <RegionMarke r={k.region} /> : undefined} />
  );
  const zeile = (key: string, href: string, bild: string | null, titel: string, datum: number | null, mitte: ReactNode, rechts: ReactNode) => (
    <Link key={key} to={href} className="group flex items-center gap-3 border-t border-white/[0.05] px-3 py-2 text-sm transition first:border-t-0 hover:bg-white/[0.035]">
      <Bild src={bild} ersatz={titel} className="aspect-video h-10 shrink-0 rounded-lg" />
      <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-white group-hover:text-akz">{titelSauber(titel)}</span><span className="zahl block text-[11px] text-white/40">{datum ? datumLang(datum) : ''}</span></span>
      <span className="hidden shrink-0 items-center gap-1 sm:flex">{mitte}</span>
      {rechts}
    </Link>
  );

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start">
      {/* Linke Leiste: Titel, Suche, Kapitel */}
      <aside className="min-w-0 space-y-3 lg:sticky lg:top-[7.5rem]">
        <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }} className="fl-fest p-5">
          <p className="ueber">Drop spots</p>
          <h1 className="titel mt-1 text-6xl">Maps</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-white/50">Where every team landed — every cup, every season.</p>
          {eintraege && <p className="mt-4 flex items-baseline gap-2"><Zaehler wert={eintraege.length} className="titel text-4xl !text-akz" /><span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/45">maps in {saisons.length} seasons</span></p>}
          <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Search a cup …" className="eingabe mt-4 w-full" />
        </motion.div>

        <div className="fl-fest p-2">
          <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">Chapter</p>
          {kapitelListe.length === 0 && liste.art === 'laedt' && <Laedt />}
          <div role="tablist" className="ohne-leiste flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {[...kapitelListe].reverse().map((k) => {
              const an = k.nr === kapitel;
              return (
                <button key={k.nr} type="button" role="tab" aria-selected={an} onClick={() => { setKapitel(k.nr); setSaison(''); }}
                  className={`group relative flex shrink-0 items-center gap-3 rounded-2xl px-3 py-2 text-left transition lg:w-full ${an ? 'bg-akz/[0.12]' : 'hover:bg-white/[0.04]'} ${k.n ? '' : 'opacity-45'}`}>
                  {an && <motion.span layoutId="maps-kapitel" className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-akz shadow-[0_0_14px_rgb(var(--akz)/0.9)]" />}
                  <span className={`titel w-9 text-center text-4xl ${an ? '!text-akz' : '!text-white/35 group-hover:!text-white/70'}`}>{k.nr}</span>
                  <span className="min-w-[5.5rem] flex-1">
                    <span className={`block text-[13px] font-bold ${an ? 'text-white' : 'text-white/70'}`}>Chapter {k.nr}</span>
                    <span className="mt-1 hidden h-1 overflow-hidden rounded-full bg-white/[0.06] lg:block"><span className={`block h-full rounded-full ${an ? 'bg-akz' : 'bg-white/25'}`} style={{ width: `${(k.n / maxKapitel) * 100}%` }} /></span>
                  </span>
                  <span className="zahl text-xs font-semibold text-white/45">{k.n}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="fl-fest flex flex-wrap divide-white/[0.06] overflow-hidden text-sm font-semibold max-lg:gap-x-2 lg:block lg:divide-y">
          <Link to="/competitive/maps/view" className="flex items-center justify-between gap-2 px-4 py-3 text-white/80 transition hover:bg-white/[0.04] hover:text-akz">Tournament maps <span aria-hidden>→</span></Link>
          <Link to="/community/map-evolution" className="flex items-center justify-between gap-2 px-4 py-3 text-white/80 transition hover:bg-white/[0.04] hover:text-akz">Map evolution <span aria-hidden>→</span></Link>
          {wer?.isAdmin && <Link to="/admin/alte-maps" className="flex items-center justify-between gap-2 px-4 py-3 text-amber-200 transition hover:bg-amber-400/10">Manage old maps <span aria-hidden>→</span></Link>}
        </div>
      </aside>

      {/* Rechts: Buehne des Kapitels, Filter, Karten je Saison */}
      <div className="min-w-0 space-y-5">
        {offen && (
          <motion.header key={offen.nr} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="fl-fest relative isolate overflow-hidden">
            {KAPITEL_BILD[offen.nr] && <Bild src={`${SEITE}${encodeURI(KAPITEL_BILD[offen.nr])}`} className="absolute inset-y-0 right-0 -z-10 h-full w-full sm:w-[58%]" />}
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-fl via-fl/85 to-fl/5" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-t from-fl via-fl/20 to-transparent" />
            <div className="px-5 pb-4 pt-10 sm:px-7 sm:pt-14">
              <p className="ueber">Chapter {offen.nr}{gewaehlteSaison ? ` · ${gewaehlteSaison.kurz}` : ` · ${offen.saisons.length} seasons`}</p>
              <h2 className="titel mt-1 text-5xl sm:text-6xl">{gewaehlteSaison ? (gewaehlteSaison.titel || gewaehlteSaison.name) : `Chapter ${offen.nr}`}</h2>
              <p className="zahl mt-1 text-sm text-white/55">{sichtbar.length === offen.n ? `${offen.n} maps` : `${sichtbar.length} of ${offen.n} maps`}{nurEigene.length > 0 && ` · ${nurEigene.length} tournament maps`}</p>
              <div className="ohne-leiste -mx-1 mt-5 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap">
                <button type="button" onClick={() => setSaison('')} className={chip(saison === '')}>All seasons</button>
                {[...offen.saisons].sort((a, b) => b.nr - a.nr).map((s) => {
                  const n = zahlJe.get(s.kennung) ?? 0;
                  return (
                    <button key={s.kennung} type="button" onClick={() => setSaison(s.kennung)} className={`${chip(saison === s.kennung)} ${n || saison === s.kennung ? '' : 'opacity-40'}`}>
                      {s.kurz}{s.titel && s.titel !== s.kurz && <span className="font-normal text-white/55">{s.titel}</span>}<span className="zahl text-white/45">{n}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.header>
        )}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
          <div className="ohne-leiste flex max-w-full items-center gap-1.5 overflow-x-auto">
            <span className="mr-1 shrink-0 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">Type</span>
            <button type="button" onClick={() => setTyp('')} className={chip(typ === '')}>All</button>
            {TYPEN.map(([k, t]) => <button key={k} type="button" onClick={() => setTyp(typ === k ? '' : k)} className={chip(typ === k)}>{t}</button>)}
          </div>
          <div className="ohne-leiste flex max-w-full items-center gap-1.5 overflow-x-auto">
            <span className="mr-1 shrink-0 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">Region</span>
            <button type="button" onClick={() => setRegion('')} className={chip(region === '')}>All</button>
            {REGIONEN.filter((r) => (zahlRegion.get(r) ?? 0) > 0 || r === region).map((r) => {
              const an = region === r; const f = REGION_FARBE[r] ?? '#94a3b8';
              return (
                <button key={r} type="button" onClick={() => setRegion(an ? '' : r)} className="chip" style={an ? { background: f, borderColor: f, color: '#04050a' } : { color: f }}>
                  {r === 'GLOBAL' ? 'Global' : r}<span className="zahl opacity-60">{zahlRegion.get(r) ?? 0}</span>
                </button>
              );
            })}
          </div>
          <div className="ml-auto"><Segment id="maps-ansicht" klein wert={ansicht} onWahl={merkeAnsicht} wahl={[{ k: 'kacheln', titel: 'Tiles' }, { k: 'liste', titel: 'List' }]} /></div>
        </div>

        {liste.art === 'laedt' && <Laedt text="Loading the maps" />}
        {liste.art === 'fehler' && <FehlerZeile text="The maps could not be loaded right now. Please try again in a moment." />}
        {eintraege && offen && offen.n === 0 && <Leer text="No maps for this chapter yet." />}
        {eintraege && offen && offen.n > 0 && sichtbar.length === 0 && nurEigene.length === 0 && <Leer text="No map matches these filters." />}

        <div key={`${kapitel}|${saison}|${typ}|${region}|${ansicht}`} className="space-y-8">
          {gruppen.map((g) => (
            <section key={g.s.kennung}>
              <SaisonKopf titel={g.s.titel || g.s.name} unter={g.s.kurz === g.s.name ? `Chapter ${g.s.kapitel}` : `${g.s.kurz} · ${g.s.name}`} n={g.l.length} />
              {ansicht === 'kacheln' ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{g.l.map(karte)}</div> : (
                <Flaeche fest className="overflow-hidden">
                  {g.l.map((e) => zeile(`${e.turnierId}|${e.region}|${e.windowId}`, kartenLink(e), e.bild, e.titel, e.datum,
                    <><span className={klein}>{TYP_NAME[e.typ]}</span>{e.fenster && <span className={klein}>{e.fenster}</span>}<RegionMarke r={regionAnzeige(e)} /></>, <StandMarke s={stand(e)} />))}
                </Flaeche>
              )}
            </section>
          ))}
          {nurEigene.length > 0 && (
            <section>
              <SaisonKopf titel="Tournament maps" unter="Published by the admins" n={nurEigene.length} />
              {ansicht === 'kacheln' ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{nurEigene.map(eigeneKarte)}</div>
                : <Flaeche fest className="overflow-hidden">{nurEigene.map((k) => zeile(k.id, `/competitive/maps/view?id=${encodeURIComponent(k.id)}`, k.bild, k.titel, k.datum, null, <Marke ton="akz">Map</Marke>))}</Flaeche>}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function SaisonKopf({ titel, unter, n }: { titel: string; unter: string; n: number }) {
  return (
    <div className="mb-3 flex items-end gap-3">
      <span className="mb-1 h-6 w-1 rounded-full bg-akz shadow-[0_0_14px_rgb(var(--akz)/0.8)]" />
      <div className="min-w-0"><p className="truncate text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">{unter}</p><h3 className="titel truncate text-3xl">{titel}</h3></div>
      <span className="zahl mb-1 text-sm font-semibold text-white/35">{n}</span>
      <span className="mb-2.5 h-px flex-1 bg-white/[0.07]" />
    </div>
  );
}
