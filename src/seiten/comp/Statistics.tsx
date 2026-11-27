import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Flaeche, Kennzahl, Laedt, Leer, Marke, Segment, SeitenKopf } from '../../ds/Bausteine';
import { SEITE, flagge } from '../../teile/Glas';
import { Treppchen } from '../../teile/Podest';
import { Balken, Chip, Klein, Portraet, zahl } from './stats/teile';

/*
 * Statistics im Hub - dieselben Zahlen wie thecomphub.com/statistics (/api/szene-stats):
 *   ohne Angaben            -> Saisons und Regionen fuer die Filter
 *   ?saison&region&sort&q   -> die sortierbare Spielertabelle (Epics Turnierdaten + eigene Replay-Auswertung)
 *   ?ansicht=jahr&jahr&saison&region -> die Bestenlisten (Preisgeld, Team-Elims, Elims, Schaden, Treffer, Bauteile, Quote)
 *   ?ansicht=start&saison   -> die juengsten Spieltage mit ihrem besten Spieler
 *
 * Aufbau (Design-System 3.0, neu komponiert): oben EINE Frage - "wer fuehrt die Saison an?" - als Buehne: links das Rennen in der gewaehlten
 * Wertung (Treppchen + Verfolger 4-8), rechts die Fuehrenden aller sieben Wertungen zum Aufklappen. Darunter die Spieltags-Besten als Raster und
 * die ganze Tabelle. Jeder Spieler zeigt sein Foto ueberall, wo er vorkommt (Betreiber: nie ein vorhandenes Foto verstecken); ohne Foto steht nichts.
 */

interface Saison { kennung: string; name: string }
interface Spieler {
  epicId: string; name: string; anzeige?: string; land?: string | null; bild?: string | null; echtesFoto?: boolean; heimat?: string; regionen?: string[];
  events: number; matches: number; elims: number; damage: number; damageTaken?: number; hits: number; builds: number; headshots?: number; assists?: number; mats?: number;
  quote: number; genauigkeit: number; elimsProMatch: number; damageProMatch: number; verdienst?: number; teamElims?: number;
}
interface Liste { feld: string; titel: string; nachkomma: number; einheit: string | null; mindestMatches: number | null; plaetze: Spieler[] }
interface Kachel { turnier: { name: string; region: string; windowId: string; spieler: number; matches: number; datum: number }; spitze: Spieler; platz: number; stand?: { platz: number; punkte: number } }

const anzeige = (s: { anzeige?: string; name: string }) => s.anzeige || s.name;
/** Nur echte Fotos; die kleinen Bilder (/spielerbilder-klein) laufen nicht ueber den Proxy, also direkt von der Seite. */
const foto = (s: Spieler) => (s.echtesFoto !== false && s.bild ? (s.bild.startsWith('/spielerbilder-klein') ? SEITE + s.bild : s.bild) : null);
/** Saison -> Jahr fuer die Jahresansicht (Chapter 7 = 2026). */
const jahrVon = (saison: string) => { const n = Number(saison.replace(/\D/g, '')); return n >= 39 ? 2026 : n >= 32 ? 2025 : 2024; };

/* Die Spalten der Tabelle - die meisten sortiert der Server. */
const SPALTEN: Array<{ feld: keyof Spieler; titel: string; kurz: string; nachkomma?: number; sortierbar?: boolean }> = [
  { feld: 'events', kurz: 'Events', titel: 'Events' },
  { feld: 'matches', kurz: 'Games', titel: 'Most games', sortierbar: true },
  { feld: 'elims', kurz: 'Elims', titel: 'Most eliminations', sortierbar: true },
  { feld: 'elimsProMatch', kurz: 'Elims/G', titel: 'Elims per game', nachkomma: 2, sortierbar: true },
  { feld: 'damage', kurz: 'Damage', titel: 'Most damage', sortierbar: true },
  { feld: 'damageProMatch', kurz: 'Dmg/G', titel: 'Damage per game', sortierbar: true },
  { feld: 'quote', kurz: 'Dmg ratio', titel: 'Best damage ratio', nachkomma: 2, sortierbar: true },
  { feld: 'hits', kurz: 'Hits', titel: 'Most hits', sortierbar: true },
  { feld: 'builds', kurz: 'Builds', titel: 'Most builds', sortierbar: true },
];
const BRETT: Record<string, { titel: string; farbe: string }> = {
  verdienst: { titel: 'Prize money', farbe: '#facc15' },
  elims: { titel: 'Eliminations', farbe: '#38bdf8' },
  damage: { titel: 'Damage', farbe: '#f472b6' },
  teamElims: { titel: 'Team eliminations', farbe: '#2dd4bf' },
  hits: { titel: 'Hits', farbe: '#a78bfa' },
  builds: { titel: 'Builds', farbe: '#fb923c' },
  quote: { titel: 'Damage ratio', farbe: '#34d399' },
};

const feldWert = (s: Spieler, feld: string) => Number((s as unknown as Record<string, number>)[feld] ?? 0);
function wert(s: Spieler, feld: string, nachkomma = 0) {
  const v = feldWert(s, feld);
  return feld === 'verdienst' ? `$${zahl(v)}` : zahl(v, nachkomma);
}

/* ------------------------------------------------------------------ Die Fuehrenden aller Wertungen (rechts in der Buehne) */

function Wertungen({ bretter, offen, setOffen }: { bretter: Liste[]; offen: string; setOffen: (f: string) => void }) {
  return (
    <ul className="divide-y divide-white/[0.06]">
      {bretter.map((l) => {
        const info = BRETT[l.feld] ?? { titel: l.titel, farbe: 'rgb(var(--akz))' };
        const an = offen === l.feld;
        const erster = l.plaetze[0];
        const max = erster ? feldWert(erster, l.feld) : 1;
        return (
          <li key={l.feld}>
            <button type="button" onClick={() => setOffen(an ? '' : l.feld)} aria-expanded={an}
              className={`flex w-full items-center gap-3 px-5 py-3 text-left transition ${an ? 'bg-white/[0.04]' : 'hover:bg-white/[0.03]'}`}>
              <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: info.farbe }} />
              <span className="min-w-0 flex-1">
                <Klein>{info.titel}{l.mindestMatches ? ` · min. ${l.mindestMatches} games` : ''}</Klein>
                <span className="mt-0.5 flex items-center gap-1.5">
                  {erster?.land && <img src={flagge(erster.land)} alt="" className="h-3.5 w-3.5 rounded-full object-cover" />}
                  <span className="truncate text-[15px] font-bold text-white">{erster ? anzeige(erster) : '–'}</span>
                </span>
              </span>
              <span className="zahl font-titel text-2xl tracking-wide text-white">{erster ? wert(erster, l.feld, l.nachkomma) : ''}</span>
              <svg viewBox="0 0 20 20" className={`h-4 w-4 shrink-0 text-white/35 transition ${an ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8l5 5 5-5" /></svg>
            </button>
            <AnimatePresence initial={false}>
              {an && (
                <motion.ol initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden bg-black/25">
                  {l.plaetze.slice(0, 5).map((s, k) => (
                    <li key={s.epicId}>
                      <Link to={`/competitive/player/${s.epicId}`} className="group flex items-center gap-3 px-5 py-1.5 transition hover:bg-white/[0.04]">
                        <span className={`zahl w-5 text-right text-xs font-black ${k === 0 ? 'text-amber-300' : 'text-white/35'}`}>{k + 1}</span>
                        <Portraet bild={foto(s)} gross={36} platz />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-1.5">
                              {s.land && <img src={flagge(s.land)} alt="" className="h-3.5 w-3.5 rounded-full object-cover" />}
                              <span className="truncate text-sm font-semibold text-white group-hover:text-akz">{anzeige(s)}</span>
                            </span>
                            <span className="zahl shrink-0 text-sm font-bold text-white">{wert(s, l.feld, l.nachkomma)}</span>
                          </span>
                          <span className="mt-1 block"><Balken wert={feldWert(s, l.feld)} max={max} farbe={info.farbe} hoehe="h-1" verzoegerung={0.05 + k * 0.03} /></span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </motion.ol>
              )}
            </AnimatePresence>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ Seite */

export default function Statistics() {
  const [saisons, setSaisons] = useState<Saison[]>([]);
  const [regionen, setRegionen] = useState<string[]>([]);
  const [spieltage, setSpieltage] = useState<number | null>(null);
  const [saison, setSaison] = useState('');
  const [region, setRegion] = useState('');
  const [sort, setSort] = useState<keyof Spieler>('elims');
  const [q, setQ] = useState('');
  const [liste, setListe] = useState<Spieler[] | null>(null);
  const [gesamt, setGesamt] = useState(0);
  const [mindest, setMindest] = useState<number | null>(null);
  const [fehler, setFehler] = useState(false);
  const [bretter, setBretter] = useState<Liste[] | null>(null);
  const [kacheln, setKacheln] = useState<Kachel[]>([]);
  const [zeigen, setZeigen] = useState(50);
  /** Die Spitze der gewaehlten Wertung OHNE Suche - das Treppchen bleibt stehen, waehrend man in der Tabelle sucht. */
  const [rennen, setRennen] = useState<{ schluessel: string; liste: Spieler[] } | null>(null);
  const [offen, setOffen] = useState('verdienst');
  const nr = useRef(0);

  // Filter: Saisons und Regionen.
  useEffect(() => {
    fetch('/api/szene-stats').then((r) => r.json()).then((j) => {
      setSaisons(j.saisons ?? []); setRegionen(j.regionen ?? []); setSpieltage(j.spieltage ?? null);
      setSaison((alt) => alt || j.saisons?.[0]?.kennung || 'alle');
    }).catch(() => { setFehler(true); setSaison('alle'); });
  }, []);

  // Die Tabelle - der Server sortiert und sucht.
  useEffect(() => {
    if (!saison) return undefined;
    const meine = ++nr.current;
    const z = setTimeout(() => {
      const p = new URLSearchParams({ saison, sort: String(sort), limit: '300' });
      if (region) p.set('region', region);
      if (q.trim()) p.set('q', q.trim());
      setListe(null);
      fetch(`/api/szene-stats?${p}`, { signal: AbortSignal.timeout(30000) }).then((r) => r.json()).then((j) => {
        if (meine !== nr.current) return;
        if (!Array.isArray(j.spieler)) throw new Error('keine Liste');
        setListe(j.spieler); setGesamt(j.gesamt ?? 0); setMindest(typeof j.mindestMatches === 'number' ? j.mindestMatches : null); setFehler(false); setZeigen(50);
        if (!q.trim()) setRennen({ schluessel: `${saison}|${region}|${String(sort)}`, liste: j.spieler.slice(0, 18) });
      }).catch(() => { if (meine === nr.current) { setListe([]); setFehler(true); } });
    }, q ? 300 : 0);
    return () => clearTimeout(z);
  }, [saison, region, sort, q]);

  // Wird gesucht und die Wertung/Saison/Region wechselt, holt sich das Treppchen seine Spitze selbst (18 Zeilen, ohne Suche).
  const rennSchluessel = `${saison}|${region}|${String(sort)}`;
  useEffect(() => {
    if (!saison || !q.trim() || rennen?.schluessel === rennSchluessel) return undefined;
    let weg = false;
    const p = new URLSearchParams({ saison, sort: String(sort), limit: '18' });
    if (region) p.set('region', region);
    fetch(`/api/szene-stats?${p}`).then((r) => r.json()).then((j) => { if (!weg && Array.isArray(j.spieler)) setRennen({ schluessel: rennSchluessel, liste: j.spieler.slice(0, 18) }); }).catch(() => {});
    return () => { weg = true; };
  }, [saison, region, sort, q, rennen?.schluessel, rennSchluessel]);

  // Bestenlisten aus der Jahresansicht (mit Saison und Region).
  useEffect(() => {
    if (!saison) return;
    setBretter(null);
    const p = new URLSearchParams({ ansicht: 'jahr', jahr: String(saison === 'alle' ? 2026 : jahrVon(saison)) });
    if (saison !== 'alle') p.set('saison', saison);
    if (region) p.set('region', region);
    fetch(`/api/szene-stats?${p}`).then((r) => r.json()).then((j) => setBretter(((j.listen ?? []) as Liste[]).filter((l) => l.plaetze?.length))).catch(() => setBretter([]));
  }, [saison, region]);

  // Die juengsten Spieltage der Saison - je Spieltag der Spieler mit den meisten Elims.
  useEffect(() => {
    if (!saison || saison === 'alle') { setKacheln([]); return; }
    fetch(`/api/szene-stats?ansicht=start&saison=${encodeURIComponent(saison)}`).then((r) => r.json())
      .then((j) => setKacheln(((j.kacheln ?? []) as Kachel[]).filter((k) => k.platz === 1))).catch(() => setKacheln([]));
  }, [saison]);

  const spalte = SPALTEN.find((s) => s.feld === sort) ?? SPALTEN[2];
  const regionenSichtbar = useMemo(() => ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'OCE', 'ME'].filter((r) => regionen.includes(r)), [regionen]);
  const saisonName = saison === 'alle' ? 'All seasons' : saisons.find((s) => s.kennung === saison)?.name ?? saison;
  const maxSort = liste?.[0] ? feldWert(liste[0], String(sort)) : 1;
  const nk = spalte.nachkomma ?? 0;
  const podest = rennen && rennen.schluessel === rennSchluessel ? rennen.liste : null;
  const maxRennen = podest?.[0] ? feldWert(podest[0], String(sort)) : 1;
  const brettOffen = bretter?.some((l) => l.feld === offen) || offen === '' ? offen : bretter?.[0]?.feld ?? '';

  return (
    <div className="space-y-6">
      <SeitenKopf ueber={`Season statistics · ${saisonName}${region ? ` · ${region}` : ''}`} titel="Statistics"
        text="Every competitive player, every stat – from Epic's tournament data and CompHub's own replay analysis."
        rechts={<div className="flex gap-8"><Kennzahl label="Match days" wert={spieltage} /><Kennzahl label="Players" wert={gesamt || null} ton="akz" /></div>}>
        {/* Filter in EINER ruhigen Zeile (Betreiber: keine Wand aus Pillen): Saison als Auswahlfeld, Region als Umschalter, Suche rechts */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative shrink-0">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">Season</span>
            <select value={saison} onChange={(e) => setSaison(e.target.value)} className="eingabe w-full cursor-pointer appearance-none !py-2 !pl-[5.2rem] !pr-9 font-semibold lg:w-72">
              {saisons.map((s) => <option key={s.kennung} value={s.kennung} className="bg-fl">{s.name}</option>)}
              <option value="alle" className="bg-fl">All seasons</option>
            </select>
            <svg viewBox="0 0 20 20" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8l5 5 5-5" /></svg>
          </label>
          <div className="ohne-leiste -mx-1 min-w-0 overflow-x-auto px-1">
            <Segment id="stat-region" klein wert={region} onWahl={setRegion} wahl={[{ k: '', titel: 'Global' }, ...regionenSichtbar.map((r) => ({ k: r, titel: r }))]} />
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a player…" className="eingabe w-full shrink-0 !py-2 lg:ml-auto lg:w-72" />
        </div>
      </SeitenKopf>

      {/* Buehne: links das Rennen in der gewaehlten Wertung, rechts die Fuehrenden aller Wertungen */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Flaeche className="flex flex-col overflow-hidden p-5 lg:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><p className="ueber">The race</p><h2 className="titel mt-1 text-4xl">{spalte.titel}</h2></div>
            <div className="ohne-leiste -mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1">
              {SPALTEN.filter((s) => s.sortierbar).map((s) => <Chip key={String(s.feld)} an={sort === s.feld} onClick={() => setSort(s.feld)}>{s.kurz}</Chip>)}
            </div>
          </div>
          {!podest ? <Laedt /> : podest.length < 3 ? <div className="mt-5"><Leer text="Not enough players in this selection for a podium." /></div> : (
            <>
              <div className="mt-6">
                <Treppchen plaetze={podest.slice(0, 3).map((s, i) => ({
                  platz: (i + 1) as 1 | 2 | 3, bild: foto(s), land: s.land, name: anzeige(s), unter: `${s.name}${s.heimat ? ` · ${s.heimat}` : ''}`,
                  label: spalte.kurz, wert: wert(s, String(sort), nk), link: `/competitive/player/${s.epicId}`,
                  extra: `${zahl(s.matches)} games · ${zahl(s.elims)} elims · ${zahl(s.damage)} dmg`,
                }))} />
              </div>
              {/* Die Verfolger: Plaetze 4-18 als gleich grosse Felder (auf dem Handy 4-9) */}
              <div className="mt-auto grid grid-cols-2 gap-2 pt-5 sm:grid-cols-5">
                {podest.slice(3, 18).map((s, i) => (
                  <Link key={s.epicId} to={`/competitive/player/${s.epicId}`} className={`group items-center gap-2.5 rounded-2xl border border-white/[0.07] bg-black/30 p-2 transition hover:border-akz/40 ${i >= 6 ? 'hidden sm:flex' : 'flex'}`}>
                    <span className="zahl w-5 shrink-0 text-center font-titel text-xl text-white/35">{i + 4}</span>
                    <Portraet bild={foto(s)} gross={48} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">{s.land && <img src={flagge(s.land)} alt="" className="h-3 w-3 rounded-full object-cover" />}<span className="truncate text-[13px] font-bold text-white group-hover:text-akz">{anzeige(s)}</span></span>
                      <span className="zahl block text-sm font-extrabold text-white">{wert(s, String(sort), nk)}</span>
                      <Balken wert={feldWert(s, String(sort))} max={maxRennen} hoehe="h-0.5" verzoegerung={0.2 + i * 0.05} />
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </Flaeche>

        <Flaeche className="flex flex-col overflow-hidden" verz={0.08}>
          <div className="flex items-end justify-between gap-3 px-5 pb-3 pt-5 lg:pt-6">
            <div><p className="ueber">Category leaders</p><h2 className="titel mt-1 text-4xl">Who leads what</h2></div>
            <span className="text-right text-[11px] text-white/40">{saison === 'alle' ? 'The year 2026 so far' : saisonName}<br />{region || 'all regions'}</span>
          </div>
          {!bretter ? <Laedt /> : bretter.length === 0 ? <div className="p-5"><Leer text="No leaderboards for this selection." /></div>
            : <Wertungen bretter={bretter} offen={brettOffen} setOffen={setOffen} />}
        </Flaeche>
      </div>

      {/* Juengste Spieltage: wer hatte die meisten Elims */}
      {kacheln.length > 0 && (
        <section>
          <div className="mb-3 flex items-end justify-between gap-4">
            <div><p className="ueber">Latest match days</p><h2 className="titel mt-1 text-3xl">Top fragger of every match day</h2></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {kacheln.slice(0, kacheln.length >= 10 ? 10 : kacheln.length >= 5 ? 5 : kacheln.length).map((k, i) => (
              <Flaeche key={k.turnier.windowId + k.spitze.epicId} fest klick verz={Math.min(i, 9) * 0.03}>
                <Link to={`/competitive/player/${k.spitze.epicId}`} className="flex h-full gap-3 p-3">
                  <Portraet bild={foto(k.spitze)} gross={92} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-center gap-2"><Marke>{k.turnier.region}</Marke><span className="text-[11px] text-white/40">{new Date(k.turnier.datum).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} · {k.turnier.matches} games</span></div>
                    <p className="mt-1.5 flex items-center gap-1.5 truncate text-base font-extrabold text-white">{k.spitze.land && <img src={flagge(k.spitze.land)} alt="" className="h-3.5 w-3.5 rounded-full object-cover" />}<span className="truncate">{anzeige(k.spitze)}</span></p>
                    <p className="zahl text-xs text-white/60"><b className="text-akz">{k.spitze.elims}</b> elims · {zahl(k.spitze.damage)} dmg{k.stand ? ` · team #${k.stand.platz}` : ''}</p>
                    <p className="mt-auto line-clamp-2 pt-1.5 text-[11px] leading-snug text-white/40">{k.turnier.name.replace(/Runde/g, 'Round')}</p>
                  </div>
                </Link>
              </Flaeche>
            ))}
          </div>
        </section>
      )}

      {/* Die ganze Tabelle */}
      <Flaeche fest className="overflow-hidden" verz={0.05}>
        <div className="flex flex-wrap items-end justify-between gap-3 px-5 pb-3 pt-5">
          <div><p className="ueber">The full table</p><h2 className="titel mt-1 text-3xl">All players</h2></div>
          <p className="text-xs text-white/40">{zahl(gesamt)} players · sorted by {spalte.titel.toLowerCase()}{mindest ? ` · min. ${mindest} games` : ''} · click a column to sort</p>
        </div>
        <div className="overflow-x-auto">
          <table className="tabelle min-w-[1080px]">
            <thead>
              <tr>
                <th className="w-12 !pl-5">#</th>
                <th>Player</th>
                <th>Region</th>
                {SPALTEN.map((s) => (
                  <th key={String(s.feld)} className="!text-right">
                    {s.sortierbar ? (
                      <button type="button" onClick={() => setSort(s.feld)} className={`uppercase tracking-[0.2em] transition ${sort === s.feld ? 'text-akz' : 'hover:text-white'}`}>{s.kurz}{sort === s.feld ? ' ▾' : ''}</button>
                    ) : s.kurz}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(liste ?? []).slice(0, zeigen).map((s, i) => (
                <tr key={s.epicId}>
                  <td className={`zahl !pl-5 text-sm font-bold ${i < 3 && !q ? 'text-amber-300' : 'text-white/40'}`}>{i + 1}</td>
                  <td className="!py-1.5">
                    <Link to={`/competitive/player/${s.epicId}`} className="group flex items-center gap-2.5">
                      <Portraet bild={foto(s)} gross={40} platz />
                      {s.land ? <img src={flagge(s.land)} alt="" className="h-4 w-4 rounded-full object-cover" /> : <span className="w-4" />}
                      <span className="max-w-[220px] truncate font-semibold text-white group-hover:text-akz">{anzeige(s)}</span>
                      {s.anzeige && s.anzeige !== s.name && <span className="hidden max-w-[160px] truncate text-xs text-white/30 xl:inline">{s.name}</span>}
                    </Link>
                  </td>
                  <td className="text-xs font-semibold text-white/50">{s.heimat || s.regionen?.[0] || '–'}</td>
                  {SPALTEN.map((c) => (
                    <td key={String(c.feld)} className={`zahl text-right ${sort === c.feld ? 'font-bold text-white' : 'text-white/65'}`}>
                      {sort === c.feld ? (
                        <span className="inline-flex w-full flex-col items-end gap-1">
                          {zahl(feldWert(s, String(c.feld)), c.nachkomma ?? 0)}
                          <span className="w-16"><Balken wert={feldWert(s, String(c.feld))} max={maxSort} hoehe="h-0.5" /></span>
                        </span>
                      ) : zahl(feldWert(s, String(c.feld)), c.nachkomma ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!liste && <Laedt />}
        {liste && liste.length === 0 && <p className="p-8 text-center text-sm text-white/40">{fehler ? 'The stats could not be loaded right now – try again in a moment.' : 'No player found.'}</p>}
        {liste && liste.length > zeigen && (
          <div className="border-t border-white/[0.06] p-3 text-center">
            <button type="button" onClick={() => setZeigen((z) => z + 50)} className="knopf">Show 50 more <span className="text-white/40">({liste.length - zeigen} left)</span></button>
          </div>
        )}
      </Flaeche>
    </div>
  );
}
