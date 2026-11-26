import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Glas } from '../../../../teile/Glas';
import { useWer } from '../../../../teile/Anmeldung';
import { FehlerZeile, Laedt, SEITE, SeitenKopf, Suche, chip, datumLang, useDaten } from '../teile';
import { REGION_FARBE } from '../../events/gemeinsam';

/*
 * Maps im Hub - die Landepunkt-Karten aller Cups, nach Kapitel und Saison (wie /tournament-maps der Seite, /api/maps-liste).
 * Kapitel als Bildstreifen (grau, solange nicht gewaehlt; "0" wo nichts vorliegt), darunter die Saisons, dann die Cups als 16:9-Kacheln
 * oder als Liste. Filter Art (FNCS, Performance, Division, Reload, Cups) und Region, Suche. Dazu die eigenen Karten (/api/turnier-karten?liste=1),
 * die zu keinem bekannten Spieltag gehoeren. Kein "All time" - waere zu viel (Betreiber).
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
  return (
    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] backdrop-blur ${s === 'live' ? 'bg-rose-500/90 text-white'
      : s === 'upcoming' ? 'bg-sky-400/90 text-[#06080f]' : 'bg-black/55 text-white/75 ring-1 ring-white/15'}`}>
      {s === 'live' ? 'Live' : s === 'upcoming' ? 'Upcoming' : 'Ended'}
    </span>
  );
}

function Marke({ text, farbe }: { text: string; farbe?: string }) {
  return farbe
    ? <span className="rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ borderColor: `${farbe}55`, color: farbe, background: `${farbe}14` }}>{text}</span>
    : <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/55">{text}</span>;
}

function Kachel({ titel, bild, href, i, oben, unten, datum }: { titel: string; bild: string | null; href: string; i: number; oben?: React.ReactNode; unten?: React.ReactNode; datum: number | null }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 14) * 0.035, duration: 0.45, ease: [0.22, 1, 0.36, 1] }} whileHover={{ y: -5 }}>
      <Link to={href} className="group block overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] backdrop-blur-xl transition hover:border-sky-400/40">
        <div className="relative aspect-video overflow-hidden bg-[#0a0e18]">
          {bild ? <img src={bild} alt="" loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
            : <div className="grid h-full w-full place-items-center bg-gradient-to-br from-sky-950 via-[#0a0e18] to-[#06080f] text-3xl font-black tracking-widest text-sky-400/30">MAP</div>}
          <div className="absolute inset-0 bg-gradient-to-t from-[#06080f] via-[#06080f]/20 to-transparent" />
          <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">{oben}</div>
          <p className="absolute inset-x-4 bottom-3 line-clamp-2 text-lg font-extrabold leading-tight text-white drop-shadow">{titel.replace(/\s*·\s*/g, ' – ')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1 px-4 py-3">
          {unten}
          <span className="ml-auto text-[11px] tabular-nums text-white/40">{datum ? datumLang(datum) : ''}</span>
        </div>
      </Link>
    </motion.div>
  );
}

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
  const [filterOffen, setFilterOffen] = useState(false);
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

  const titelZeile = saison ? (() => { const s = saisons.find((x) => x.kennung === saison); return s ? `${s.name}${s.titel ? ` · ${s.titel}` : ''}` : ''; })() : (kapitel ? `Chapter ${kapitel}` : '');
  const filterZahl = (typ ? 1 : 0) + (region ? 1 : 0);

  return (
    <div className="space-y-6">
      <SeitenKopf ueber="Drop spots" titel="Maps" text="Where every team landed — every cup, every season."
        rechts={<>
          {eintraege && <Glas className="px-5 py-3 text-right"><p className="text-3xl font-extrabold tabular-nums text-sky-400">{eintraege.length.toLocaleString('en')}</p><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">Maps</p></Glas>}
          <Link to="/community/map-evolution" className="rounded-2xl border border-teal-400/30 bg-teal-400/[0.06] px-4 py-3 text-sm font-semibold text-teal-200 backdrop-blur-xl transition hover:border-teal-300/60 hover:text-white">Map evolution →</Link>
          <Link to="/competitive/maps/view" className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm font-semibold text-white/80 backdrop-blur-xl transition hover:border-sky-400/50 hover:text-white">Tournament maps →</Link>
          {wer?.isAdmin && <a href={`${SEITE}/admin/alte-maps`} target="_blank" rel="noreferrer" className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-200 transition hover:border-amber-300">Manage old maps ↗</a>}
        </>} />

      {/* Kapitel als Bildstreifen */}
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2" role="tablist">
        {kapitelListe.length === 0 && liste.art === 'laedt' && <Laedt />}
        {[...kapitelListe].reverse().map((k, i) => {
          const an = k.nr === kapitel;
          return (
            <motion.button key={k.nr} type="button" role="tab" aria-selected={an} onClick={() => { setKapitel(k.nr); setSaison(''); }}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} whileHover={{ y: -3 }}
              className={`group relative h-24 w-44 shrink-0 overflow-hidden rounded-2xl border text-left transition ${an ? 'border-sky-400 ring-2 ring-sky-400/30' : 'border-white/10 hover:border-white/30'}`}>
              {KAPITEL_BILD[k.nr]
                ? <img src={`${SEITE}${encodeURI(KAPITEL_BILD[k.nr])}`} alt="" loading="lazy" className={`absolute inset-0 h-full w-full object-cover transition duration-500 ${an ? 'scale-105' : 'grayscale brightness-[.5] group-hover:brightness-75'}`} />
                : <span className={`absolute inset-0 bg-gradient-to-br ${an ? 'from-sky-900 to-[#0a0e18]' : 'from-white/10 to-[#0a0e18]'}`} />}
              <span className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
              <span className="relative flex h-full flex-col justify-end px-3 pb-2.5">
                <span className="text-base font-extrabold uppercase tracking-wide text-white">Chapter {k.nr}</span>
                <span className="text-[11px] font-semibold tabular-nums text-white/60">{k.n} maps</span>
              </span>
            </motion.button>
          );
        })}
      </div>

      {offen && (
        <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap">
          <button type="button" onClick={() => setSaison('')} className={chip(saison === '')}>All</button>
          {offen.saisons.map((s) => {
            const n = zahlJe.get(s.kennung) ?? 0;
            return (
              <button key={s.kennung} type="button" onClick={() => setSaison(s.kennung)} className={`${chip(saison === s.kennung)} ${n || saison === s.kennung ? '' : 'opacity-40'}`}>
                {s.kurz}{s.titel && <span className="ml-1.5 font-normal opacity-70">{s.titel}</span>}<span className="ml-2 tabular-nums opacity-60">{n}</span>
              </button>
            );
          })}
        </div>
      )}

      <Glas className="space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 text-lg font-extrabold text-white">{titelZeile}<span className="ml-2 text-xs font-semibold text-white/40">{sichtbar.length}</span></h2>
          <Suche wert={suche} setze={setSuche} platz="Search a cup …" />
          <button type="button" onClick={() => setFilterOffen((v) => !v)} className={`ml-auto ${chip(filterOffen)}`}>
            Filter{filterZahl ? ` (${filterZahl})` : ''}
          </button>
          {(['kacheln', 'liste'] as const).map((k) => (
            <button key={k} type="button" onClick={() => { setAnsicht(k); try { localStorage.setItem('hub_maps_ansicht', k); } catch { /* ohne Speicher */ } }} className={chip(ansicht === k)}>{k === 'kacheln' ? 'Tiles' : 'List'}</button>
          ))}
        </div>
        {filterOffen && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="flex flex-wrap items-center gap-x-6 gap-y-2.5 border-t border-white/5 pt-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Type</span>
              {TYPEN.map(([k, t]) => <button key={k} type="button" onClick={() => setTyp(typ === k ? '' : k)} className={chip(typ === k)}>{t}</button>)}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Region</span>
              <button type="button" onClick={() => setRegion('')} className={chip(region === '')}>All</button>
              {REGIONEN.filter((r) => (zahlRegion.get(r) ?? 0) > 0 || r === region).map((r) => {
                const an = region === r; const f = REGION_FARBE[r] ?? '#94a3b8';
                return (
                  <button key={r} type="button" onClick={() => setRegion(an ? '' : r)} className="rounded-full border px-3 py-1.5 text-xs font-semibold transition"
                    style={an ? { background: f, borderColor: f, color: '#06080f' } : { borderColor: `${f}55`, color: f }}>
                    {r === 'GLOBAL' ? 'Global' : r}<span className="ml-1.5 tabular-nums opacity-60">{zahlRegion.get(r) ?? 0}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </Glas>

      {liste.art === 'fehler' && <FehlerZeile text="The maps could not be loaded right now. Please try again in a moment." />}
      {eintraege && offen && offen.n === 0 && <Glas className="px-6 py-10 text-center text-sm text-white/45">No maps for this chapter yet.</Glas>}
      {eintraege && offen && offen.n > 0 && sichtbar.length === 0 && nurEigene.length === 0 && <p className="text-sm text-white/45">No map found.</p>}

      {ansicht === 'kacheln' ? (
        <div key={`${kapitel}|${saison}|${typ}|${region}`} className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {sichtbar.map((e, i) => {
            const r = regionAnzeige(e);
            return (
              <Kachel key={`${e.turnierId}|${e.region}|${e.windowId}`} i={i} titel={e.titel} bild={e.bild} href={kartenLink(e)} datum={e.datum}
                oben={<><StandMarke s={stand(e)} /><span className="rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold tracking-wider text-white ring-1 ring-white/15 backdrop-blur">{r}</span></>}
                unten={<>
                  {e.lan && <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#06080f]">LAN</span>}
                  <Marke text={r} farbe={REGION_FARBE[r] ?? '#94a3b8'} />
                  {e.saisonKurz && <Marke text={e.saisonKurz} />}
                  <Marke text={TYP_NAME[e.typ]} />
                  {e.fenster && <Marke text={e.fenster} />}
                </>} />
            );
          })}
          {nurEigene.map((k, i) => (
            <Kachel key={k.id} i={sichtbar.length + i} titel={k.titel} bild={k.bild} href={`/competitive/maps/view?id=${encodeURIComponent(k.id)}`} datum={k.datum}
              oben={<><span />{k.region && k.region !== 'GLOBAL' && <span className="rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold tracking-wider text-white ring-1 ring-white/15">{k.region}</span>}</>}
              unten={<Marke text="Tournament map" farbe="#a78bfa" />} />
          ))}
        </div>
      ) : (
        <Glas className="divide-y divide-white/5 overflow-hidden">
          {sichtbar.map((e) => (
            <Link key={`${e.turnierId}|${e.region}|${e.windowId}`} to={kartenLink(e)} className="flex items-center gap-3 px-4 py-3 text-sm transition hover:bg-white/[0.04]">
              <span className="w-24 shrink-0 text-[11px] tabular-nums text-white/40">{e.datum ? datumLang(e.datum).slice(5) : ''}</span>
              <Marke text={regionAnzeige(e)} farbe={REGION_FARBE[regionAnzeige(e)] ?? '#94a3b8'} />
              <span className="min-w-0 flex-1 truncate font-semibold text-white">{e.titel}</span>
              <span className="hidden shrink-0 text-xs text-white/40 sm:inline">{e.saisonKurz}</span>
              <StandMarke s={stand(e)} />
            </Link>
          ))}
          {nurEigene.map((k) => (
            <Link key={k.id} to={`/competitive/maps/view?id=${encodeURIComponent(k.id)}`} className="flex items-center gap-3 px-4 py-3 text-sm transition hover:bg-white/[0.04]">
              <span className="w-24 shrink-0 text-[11px] tabular-nums text-white/40">{k.datum ? datumLang(k.datum).slice(5) : ''}</span>
              <Marke text="Map" farbe="#a78bfa" />
              <span className="min-w-0 flex-1 truncate font-semibold text-white">{k.titel}</span>
            </Link>
          ))}
        </Glas>
      )}
    </div>
  );
}
