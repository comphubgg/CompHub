import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Glas } from '../../../teile/Glas';
import { useWer } from '../../../teile/Anmeldung';
import KartenAnsicht, { kartenName, type KartenForm, type Punkt } from './KartenAnsicht';
import { formenVon } from './maps/MapsKarte';
import type { MTeam } from './maps/Mannschaften';
import { FehlerZeile, Laedt, Leer, Reiter, SeitenKopf, Suche, TeamFlagge, chip, flaggenPfad, landName } from './teile';

/*
 * Predictions im Hub (wie /predictions der Seite). Zwei Gesichter:
 *  - "Call the final": jeder tippt selbst - die Finals aus /api/maps-liste, Feld und Landepunkte aus /api/maps-karte. Teams anklicken oder in die
 *    Reihenfolge ziehen, verschieben, tauschen, herausnehmen, MVP waehlen, zuruecksetzen (mit Rueckgaengig), als Text teilen. Gemerkt im Browser und mit
 *    Konto auch dort (/api/user-storage). Steht das Ergebnis fest, steht daneben, wie nah der Tipp lag.
 *  - "CompHub's prediction": die Prognose des Betreibers (/api/prognosen) mit Duos, Karte, Reihenfolge, Regionen, Nationalitaeten, Preisgeld (/api/cup-preise);
 *    der Admin kann unter Duos ein Duo von Hand ergaenzen oder entfernen.
 */

const TAGE = 86_400_000;
const REGIONEN = ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'];
const MEDAILLE = ['bg-amber-300 text-[#06080f]', 'bg-slate-200 text-[#06080f]', 'bg-orange-400 text-[#06080f]'];

interface Final { turnierId: string; region: string; windowId: string; cup: string; fenster: string; titel: string; datum: number | null; ende: number | null; saisonKurz?: string; bild: string | null; eventId: string | null; alt?: boolean }
interface Tipp { plaetze: Array<string | null>; mvp: string | null; geaendert: number }
interface FFenster { windowId: string; spieler: MTeam['spieler']; teams: MTeam[]; bild: string | null; formen: Parameters<typeof formenVon>[0] }

const nameVon = (t: MTeam) => t.spieler.map((s) => s.anzeige || s.name).join(' & ');

/** Fotos eines Teams als kleine Hochkant-Rechtecke - nur wenn jeder eines hat, sonst die Flagge. */
function Gesicht({ t, gross }: { t: MTeam; gross?: boolean }) {
  if (t.spieler.length && t.spieler.every((s) => s.bild)) {
    return <span className="flex shrink-0 gap-0.5">{t.spieler.map((s) => <img key={s.id} src={s.bild!} alt="" draggable={false} className={`${gross ? 'h-10 w-[30px]' : 'h-9 w-[27px]'} rounded-md object-cover object-top`} />)}</span>;
  }
  return <TeamFlagge groesse={gross ? 32 : 28} laender={t.spieler.map((s) => s.land)} />;
}

/* ================================================================ Call the final */

function Tippen() {
  const { wer } = useWer();
  const [adresse, setAdresse] = useSearchParams();
  const [liste, setListe] = useState<Final[] | null>(null);
  const [fehler, setFehler] = useState('');
  const [wahl, setWahl] = useState<Final | null>(null);
  const [f, setF] = useState<FFenster | null>(null);
  const [feldFehler, setFeldFehler] = useState('');
  const [tipp, setTipp] = useState<Tipp>({ plaetze: [], mvp: null, geaendert: 0 });
  const [gespeichert, setGespeichert] = useState<'' | 'lokal' | 'konto'>('');
  const [suche, setSuche] = useState('');
  const [sortierung, setSortierung] = useState<'rang' | 'name' | 'land'>('rang');
  const [bereich, setBereich] = useState<'spieler' | 'karte' | 'tipp'>('tipp');
  const [resetFrage, setResetFrage] = useState(false);
  const [zurueck, setZurueck] = useState<Tipp | null>(null);
  const [kopiert, setKopiert] = useState(false);
  const zug = useRef<string | null>(null);
  const [ueber, setUeber] = useState<number | null>(null);
  const geladenFuer = useRef('');

  useEffect(() => {
    let weg = false;
    fetch('/api/maps-liste').then((r) => r.json()).then((j) => {
      if (weg) return;
      if (!j?.ok) { setFehler('The list of finals cannot be loaded right now.'); setListe([]); return; }
      const jetzt = Date.now();
      const l = (j.eintraege as Final[]).filter((e) => !e.alt && (/final/i.test(e.fenster) || /_final/i.test(e.windowId)) && e.datum && e.datum > jetzt - 2 * TAGE && e.datum < jetzt + 120 * TAGE)
        .sort((a, b) => (a.datum ?? 0) - (b.datum ?? 0));
      setListe(l);
      const w = adresse.get('finale'), r = adresse.get('r');
      setWahl(l.find((e) => e.windowId === w && (!r || e.region === r)) ?? l[0] ?? null);
    }).catch(() => { if (!weg) { setFehler('The list of finals cannot be loaded right now.'); setListe([]); } });
    return () => { weg = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!wahl) { setF(null); return undefined; }
    let weg = false; setF(null); setFeldFehler(''); geladenFuer.current = '';
    fetch(`/api/maps-karte?t=${encodeURIComponent(wahl.turnierId)}&r=${encodeURIComponent(wahl.region)}&w=${encodeURIComponent(wahl.windowId)}`, { cache: 'no-store' })
      .then((r) => r.json()).then((j) => { if (!weg) { if (j?.ok && j.fenster) setF(j.fenster); else setFeldFehler('There is no field for this final yet.'); } })
      .catch(() => { if (!weg) setFeldFehler('The field cannot be loaded right now.'); });
    const p = new URLSearchParams(adresse); p.set('finale', wahl.windowId); p.set('r', wahl.region); setAdresse(p, { replace: true });
    return () => { weg = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wahl]);

  const teams: MTeam[] = useMemo(() => (!f ? [] : f.teams?.length ? f.teams : f.spieler.map((s) => ({ id: s.id, spieler: [s], rang: null, punkte: null }))), [f]);
  const teamVon = useMemo(() => new Map(teams.map((x) => [x.id, x])), [teams]);
  const spielerVon = useMemo(() => new Map(teams.flatMap((x) => x.spieler.map((s) => [s.id, s] as const))), [teams]);
  const anzahl = teams.length;
  const schluessel = wahl ? `tipp:${wahl.windowId}:${wahl.region}` : '';

  // Laden: Browser, dann (mit Konto) der neuere Stand vom Konto.
  useEffect(() => {
    if (!wahl || !anzahl) return undefined;
    let weg = false;
    const pruefen = (roh: Tipp | null): Tipp => {
      const gueltig = new Set(teams.map((x) => x.id)); const gesehen = new Set<string>();
      const plaetze = Array.from({ length: anzahl }, (_, i) => { const id = roh?.plaetze?.[i] ?? null; if (!id || !gueltig.has(id) || gesehen.has(id)) return null; gesehen.add(id); return id; });
      return { plaetze, mvp: roh?.mvp && spielerVon.has(roh.mvp) ? roh.mvp : null, geaendert: roh?.geaendert ?? 0 };
    };
    let lokal: Tipp | null = null;
    try { const r = localStorage.getItem(schluessel); if (r) lokal = JSON.parse(r); } catch { /* leer */ }
    setTipp(pruefen(lokal)); geladenFuer.current = schluessel;
    if (wer?.userName) {
      fetch(`/api/user-storage?key=${encodeURIComponent(schluessel)}`).then((r) => (r.ok ? r.json() : null)).then((d) => {
        const c = d?.value as Tipp | undefined;
        if (weg || !c || (lokal && (lokal.geaendert ?? 0) >= (c.geaendert ?? 0))) return;
        setTipp(pruefen(c));
      }).catch(() => { /* nur Browser */ });
    }
    return () => { weg = true; };
  }, [wahl, anzahl, teams, spielerVon, wer?.userName, schluessel]);

  const uhr = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tippRef = useRef(tipp);
  useEffect(() => { tippRef.current = tipp; }, [tipp]);
  const aendere = useCallback((neu: (alt: Tipp) => Tipp) => {
    const n = { ...neu(tippRef.current), geaendert: Date.now() };
    tippRef.current = n; setTipp(n);
    if (!schluessel || geladenFuer.current !== schluessel) return;
    try { localStorage.setItem(schluessel, JSON.stringify(n)); setGespeichert('lokal'); } catch { /* nur bis zum Neuladen */ }
    if (wer?.userName) {
      if (uhr.current) clearTimeout(uhr.current);
      uhr.current = setTimeout(() => { void fetch('/api/user-storage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: schluessel, value: n }) }).then((r) => { if (r.ok) setGespeichert('konto'); }).catch(() => {}); }, 700);
    }
  }, [schluessel, wer?.userName]);

  const platz = useMemo(() => new Map(tipp.plaetze.flatMap((id, i) => (id ? [[id, i + 1] as const] : []))), [tipp.plaetze]);
  const setze = (id: string, nr?: number) => aendere((alt) => {
    const p = alt.plaetze.slice(); const von = p.indexOf(id);
    if (von >= 0 && nr === undefined) return alt;
    const ziel = nr ?? p.findIndex((x) => !x); if (ziel < 0 || von === ziel) return alt;
    const dort = p[ziel]; if (von >= 0) p[von] = dort ?? null; p[ziel] = id;
    return { ...alt, plaetze: p };
  });
  const nimm = (nr: number) => aendere((alt) => { const p = alt.plaetze.slice(); p[nr] = null; return { ...alt, plaetze: p }; });
  const mvp = (id: string) => aendere((alt) => ({ ...alt, mvp: alt.mvp === id ? null : id }));
  const reset = () => { setZurueck(tipp); aendere((alt) => ({ ...alt, plaetze: alt.plaetze.map(() => null), mvp: null })); setResetFrage(false); setTimeout(() => setZurueck(null), 10_000); };

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return teams.filter((x) => !q || x.spieler.some((s) => `${s.anzeige} ${s.name}`.toLowerCase().includes(q))).sort((a, b) => (
      sortierung === 'name' ? nameVon(a).localeCompare(nameVon(b))
        : sortierung === 'land' ? (a.spieler[0]?.land ?? 'zz').localeCompare(b.spieler[0]?.land ?? 'zz') || nameVon(a).localeCompare(nameVon(b))
          : (a.rang ?? 9999) - (b.rang ?? 9999) || nameVon(a).localeCompare(nameVon(b))));
  }, [teams, suche, sortierung]);

  const ergebnis = useMemo(() => {
    if (!wahl?.ende || Date.now() < wahl.ende || !platz.size) return null;
    if (teams.filter((x) => x.rang).length < teams.length * 0.8) return null;
    let genau = 0, nah = 0, abstand = 0, n = 0;
    tipp.plaetze.forEach((id, i) => { const tm = id ? teamVon.get(id) : null; if (!tm?.rang) return; const d = Math.abs(tm.rang - (i + 1)); n++; abstand += d; if (!d) genau++; if (d <= 3) nah++; });
    return n ? { genau, nah, schnitt: abstand / n, n } : null;
  }, [wahl, teams, teamVon, tipp.plaetze, platz.size]);

  const teilen = async () => {
    if (!wahl) return;
    const zeilen = tipp.plaetze.slice(0, 10).map((id, i) => `${i + 1}. ${id ? nameVon(teamVon.get(id)!) : '-'}`);
    const m = tipp.mvp ? spielerVon.get(tipp.mvp) : null;
    const text = [`My ${wahl.titel} ${wahl.region} prediction:`, '', ...zeilen, ...(tipp.plaetze.length > 10 ? ['…'] : []), '', ...(m ? [`MVP: ${m.anzeige || m.name}`] : []), `Call the final yourself: https://www.thecomphub.com/predictions?finale=${encodeURIComponent(wahl.windowId)}&r=${encodeURIComponent(wahl.region)}`].join('\n');
    try { await navigator.clipboard.writeText(text); setKopiert(true); setTimeout(() => setKopiert(false), 2500); } catch { window.prompt('Copy:', text); }
  };

  if (liste === null) return <Laedt />;
  if (fehler) return <FehlerZeile text={fehler} />;
  if (!liste.length) return <Leer text="No final in the next weeks — as soon as one is scheduled, you can call it here." />;
  const stand = !wahl?.datum ? '' : Date.now() < wahl.datum ? 'kommt' : wahl.ende && Date.now() > wahl.ende ? 'vorbei' : 'live';
  const mvpS = tipp.mvp ? spielerVon.get(tipp.mvp) : null;
  const regionenGleich = wahl ? liste.filter((e) => e.turnierId === wahl.turnierId && e.fenster === wahl.fenster) : [];

  const teamZeile = (tm: MTeam) => {
    const nr = platz.get(tm.id);
    return (
      <div key={tm.id} draggable onDragStart={(e) => { zug.current = tm.id; try { e.dataTransfer.setData('text/plain', tm.id); } catch { /* */ } }} onDragEnd={() => { zug.current = null; setUeber(null); }}
        onClick={() => setze(tm.id)} title={nr ? `Place ${nr}` : 'Click or drag into your order'}
        className={`flex cursor-grab items-center gap-2.5 rounded-xl border px-2 py-1.5 transition active:cursor-grabbing ${nr ? 'border-white/5 bg-white/[0.02] opacity-45 hover:opacity-80' : 'border-white/10 bg-black/25 hover:border-sky-400/50'}`}>
        <Gesicht t={tm} />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-xs font-bold uppercase text-white">{nameVon(tm)}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-white/40">{tm.spieler.map((s) => <img key={s.id} src={flaggenPfad(s.land)} alt="" className="h-3 w-3 rounded-full object-cover" />)}{tm.rang ? <span className="tabular-nums">#{tm.rang}</span> : null}</span>
        </span>
        {tm.spieler.map((s) => <button key={s.id} type="button" onClick={(e) => { e.stopPropagation(); mvp(s.id); }} title={`MVP: ${s.anzeige}`} className={`rounded-md p-1 text-sm leading-none transition ${tipp.mvp === s.id ? 'bg-amber-300 text-[#06080f]' : 'text-white/25 hover:text-amber-300'}`}>★</button>)}
        {nr ? <span className="rounded-md bg-sky-400/20 px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums text-sky-300">#{nr}</span> : null}
      </div>
    );
  };
  const slot = (i: number) => {
    const id = tipp.plaetze[i]; const tm = id ? teamVon.get(id) : null; const echt = tm?.rang && ergebnis ? tm.rang : null;
    return (
      <div key={i} onDragOver={(e) => { e.preventDefault(); if (ueber !== i) setUeber(i); }} onDragLeave={() => setUeber((u) => (u === i ? null : u))}
        onDrop={(e) => { e.preventDefault(); const d = zug.current; zug.current = null; setUeber(null); if (d) setze(d, i); }}
        className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 transition ${ueber === i ? 'border-sky-400 bg-sky-400/10' : tm ? 'border-white/10 bg-black/25' : 'border-dashed border-white/10'}`}>
        <span className={`grid h-7 w-8 shrink-0 place-items-center rounded-md text-[11px] font-extrabold tabular-nums ${i < 3 ? MEDAILLE[i] : 'bg-white/5 text-white/45'}`}>{i + 1}</span>
        {tm ? (
          <div draggable onDragStart={(e) => { zug.current = tm.id; try { e.dataTransfer.setData('text/plain', tm.id); } catch { /* */ } }} onDragEnd={() => { zug.current = null; setUeber(null); }} className="flex min-w-0 flex-1 cursor-grab items-center gap-2">
            <Gesicht t={tm} />
            <span className="min-w-0 flex-1 leading-tight"><span className="block truncate text-xs font-bold uppercase text-white">{nameVon(tm)}</span>
              {echt ? <span className={`text-[10px] font-semibold tabular-nums ${echt === i + 1 ? 'text-emerald-400' : Math.abs(echt - i - 1) <= 3 ? 'text-sky-300' : 'text-white/40'}`}>was #{echt}</span> : null}</span>
            {tm.spieler.some((s) => s.id === tipp.mvp) && <span className="rounded-md bg-amber-300 px-1.5 py-0.5 text-[10px] font-extrabold text-[#06080f]">MVP</span>}
            <button type="button" onClick={() => nimm(i)} className="rounded-md px-1.5 text-white/30 hover:bg-rose-500/20 hover:text-rose-300">×</button>
          </div>
        ) : <span className="flex-1 text-[11px] text-white/25">Drag a player here or click one</span>}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <Glas className="flex flex-wrap items-center gap-3 p-4">
        <select value={wahl ? `${wahl.windowId}|${wahl.region}` : ''} onChange={(e) => { const [w, r] = e.target.value.split('|'); setWahl(liste.find((x) => x.windowId === w && x.region === r) ?? null); }}
          className="min-w-0 max-w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-sky-400/60 focus:outline-none">
          {liste.map((e) => <option key={`${e.windowId}|${e.region}`} value={`${e.windowId}|${e.region}`}>{e.titel}{e.saisonKurz ? ` · ${e.saisonKurz}` : ''} · {e.region}</option>)}
        </select>
        {regionenGleich.length > 1 && <div className="flex flex-wrap gap-1">{regionenGleich.map((e) => <button key={e.region} type="button" onClick={() => setWahl(e)} className={chip(e.region === wahl?.region)}>{e.region}</button>)}</div>}
        {wahl?.datum && <span className="text-xs text-white/50">{new Date(wahl.datum).toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
        {stand === 'live' && <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white">Live</span>}
        {stand === 'vorbei' && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase text-white/60">Ended</span>}
        <span className="ml-auto text-xs text-white/40">{gespeichert === 'konto' ? 'Saved to your account' : gespeichert === 'lokal' ? 'Saved in this browser' : wer?.userName ? '' : 'Sign in to keep your call on every device'}</span>
      </Glas>
      {feldFehler && <Leer text={feldFehler} />}
      {!f && !feldFehler && <Laedt text="Loading the field …" />}
      {f && (
        <>
          {ergebnis && (
            <Glas className="flex flex-wrap items-center gap-6 border-emerald-400/30 px-5 py-4">
              <p className="text-sm font-bold text-emerald-300">How close was your call?</p>
              <p className="text-sm text-white/75"><b className="text-white">{ergebnis.genau}</b> exact · <b className="text-white">{ergebnis.nah}</b> within 3 places · average {ergebnis.schnitt.toFixed(1)} places off</p>
            </Glas>
          )}
          <div className="lg:hidden"><Reiter wert={bereich} setze={setBereich} liste={[['spieler', 'Players'], ['karte', 'Map'], ['tipp', 'My call']]} /></div>
          <div className="grid gap-5 lg:grid-cols-[minmax(260px,330px)_minmax(0,1fr)_minmax(300px,380px)] lg:items-start">
            <Glas className={`flex flex-col p-3 lg:sticky lg:top-32 lg:max-h-[calc(100vh-9rem)] ${bereich === 'spieler' ? '' : 'max-lg:hidden'}`}>
              <div className="mb-2 flex items-center justify-between"><h3 className="font-bold text-white">{teams.every((x) => x.spieler.length <= 1) ? 'Players' : 'Teams'} <span className="text-white/40">{anzahl}</span></h3>
                <div className="flex gap-1">{(['rang', 'name', 'land'] as const).map((s) => <button key={s} type="button" onClick={() => setSortierung(s)} className={`rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase ${sortierung === s ? 'bg-white/10 text-white' : 'text-white/40'}`}>{s === 'rang' ? 'Rank' : s === 'name' ? 'Name' : 'Country'}</button>)}</div></div>
              <Suche wert={suche} setze={setSuche} platz="Search …" className="mb-2 sm:w-full" />
              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">{gefiltert.map(teamZeile)}</div>
            </Glas>
            <div className={bereich === 'karte' ? '' : 'max-lg:hidden'}>
              <KartenAnsicht formen={formenVon(f.formen ?? [])} bild={f.bild} rotAb={2} titel={`${wahl?.titel ?? 'final'}-map`} />
            </div>
            <Glas className={`flex flex-col p-3 lg:sticky lg:top-32 lg:max-h-[calc(100vh-9rem)] ${bereich === 'tipp' ? '' : 'max-lg:hidden'}`}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-white">My call <span className="text-white/40">{platz.size}/{anzahl}</span></h3>
                <button type="button" onClick={() => void teilen()} className="ml-auto rounded-lg border border-white/10 px-2.5 py-1 text-xs font-semibold text-white/70 hover:border-sky-400/50">{kopiert ? 'Copied ✓' : 'Share'}</button>
                {resetFrage ? <><button type="button" onClick={reset} className="rounded-lg bg-rose-500 px-2.5 py-1 text-xs font-bold text-white">Clear all?</button><button type="button" onClick={() => setResetFrage(false)} className="text-xs text-white/50">No</button></>
                  : <button type="button" onClick={() => setResetFrage(true)} disabled={!platz.size && !tipp.mvp} className="rounded-lg border border-white/10 px-2.5 py-1 text-xs font-semibold text-white/70 hover:border-rose-400/50 disabled:opacity-30">Reset</button>}
              </div>
              {zurueck && <button type="button" onClick={() => { const a = zurueck; aendere(() => a); setZurueck(null); }} className="mb-2 rounded-xl bg-sky-400/15 px-3 py-1.5 text-xs font-semibold text-sky-200">Cleared — undo</button>}
              <div className="mb-3 flex items-center gap-2 rounded-xl border border-amber-300/30 bg-amber-300/[0.06] px-3 py-2">
                <span className="rounded-md bg-amber-300 px-1.5 py-0.5 text-[10px] font-extrabold text-[#06080f]">MVP</span>
                {mvpS ? <><span className="flex-1 truncate text-sm font-bold uppercase text-white">{mvpS.anzeige || mvpS.name}</span><button type="button" onClick={() => mvp(mvpS.id)} className="text-white/40 hover:text-rose-300">×</button></> : <span className="text-xs text-white/40">Tap ★ next to a player</span>}
              </div>
              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">{tipp.plaetze.map((_, i) => slot(i))}</div>
            </Glas>
          </div>
        </>
      )}
    </div>
  );
}

/* ================================================================ Die Prognose des Betreibers */

interface Spot { id: string; punkte: Punkt[]; farbe?: string | null }
interface PKarte { id: string; bildId: string; titel: string; spots: Spot[]; aufSpot: Record<string, string[]> }
interface PTeam { key: string; namen: string[]; ids: string[]; herkunft: string[]; besterPlatz: number; region: string }
interface Prognose {
  id: string; titel: string; cupTitel: string; gruppe?: string; quellen: Array<{ eventId: string; windowId: string; region: string; titel: string; topN: number | null }>;
  plaetze: Array<string | null>; feld?: PTeam[]; karten?: PKarte[]; bildId?: string; kartenTitel?: string; spots?: Spot[]; aufSpot?: Record<string, string[]>;
  manuell?: PTeam[]; geaendert: number; oeffentlich: boolean;
}
interface Profil { id?: string; land?: string; anzeige?: string; namen?: string[]; name?: string; region?: string }
type Abschnitt = 'duos' | 'karte' | 'leaderboard' | 'regionen' | 'nationen' | 'preise';
const schl = (n: string) => n.toLowerCase().replace(/^\[.*?\]\s*/, '').replace(/[^a-z0-9]/g, '');
const ordnung = (n: number) => { const r = n % 100; return r >= 11 && r <= 13 ? `${n}th` : `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`; };

function Betreiber() {
  const { wer } = useWer();
  const [adresse] = useSearchParams();
  const [prognosen, setPrognosen] = useState<Prognose[] | null>(null);
  const [gewaehlt, setGewaehlt] = useState('');
  const [ab, setAb] = useState<Abschnitt>('duos');
  const [profile, setProfile] = useState<Record<string, Profil>>({});
  const [herkunft, setHerkunft] = useState<{ laender: Record<string, string>; heimat: Record<string, string> }>({ laender: {}, heimat: {} });
  const [feld, setFeld] = useState<PTeam[]>([]);
  const [feldLaedt, setFeldLaedt] = useState(false);
  const [preise, setPreise] = useState<{ geld: Array<{ art: string; schwelle: number; betrag: number; von?: number }>; proPerson: boolean } | null>(null);
  const [kartenNr, setKartenNr] = useState(0);
  const admin = !!wer?.isAdmin;

  useEffect(() => {
    void Promise.all([
      fetch('/api/prognosen').then((r) => r.json()).then((d) => d.prognosen ?? []).catch(() => []),
      fetch('/api/spieler-profile').then((r) => r.json()).then((j) => j.profile ?? {}).catch(() => ({})),
    ]).then(([l, p]: [Prognose[], Record<string, Profil>]) => {
      setProfile(p);
      const s = l.filter((x) => x.oeffentlich || admin);
      setPrognosen(s);
      const w = adresse.get('id');
      setGewaehlt(w && s.some((x) => x.id === w) ? w : s[0]?.id ?? '');
    });
    fetch('/api/spieler-laender').then((r) => r.json()).then((j) => setHerkunft({ laender: j.laender ?? {}, heimat: j.heimat ?? {} })).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin]);
  const pg = useMemo(() => prognosen?.find((x) => x.id === gewaehlt) ?? null, [prognosen, gewaehlt]);

  const profilVon = useCallback((name: string, id?: string): Profil | undefined => {
    let p: Profil | undefined = id ? profile[id] : undefined; let konto = id;
    if (!p) { const k = schl(name); const paar = Object.entries(profile).find(([, x]) => (x.namen ?? [x.name ?? '']).some((n) => schl(n) === k)); if (paar) { p = paar[1]; konto = paar[1].id || konto; } }
    const land = p?.land || (konto ? herkunft.laender[konto] : undefined); const region = p?.region || (konto ? herkunft.heimat[konto] : undefined);
    return p || land || region ? { ...p, land, region } : undefined;
  }, [profile, herkunft]);
  const zeigName = useCallback((n: string, id?: string) => kartenName(profilVon(n, id)?.anzeige || n), [profilVon]);

  // Das Feld: gespeichert, sonst aus Epics Bestenlisten der Spieltage; dazu die von Hand ergaenzten Duos.
  useEffect(() => {
    if (!pg) { setFeld([]); return undefined; }
    let weg = false; setFeldLaedt(true);
    (async () => {
      const g = new Map<string, PTeam>();
      for (const t of pg.feld ?? []) g.set(t.key, t);
      for (const q of g.size ? [] : pg.quellen) {
        try {
          const d = await fetch(`/api/cup-leaderboard?event=${encodeURIComponent(q.eventId)}&window=${encodeURIComponent(q.windowId)}&limit=${q.topN ?? 200}`).then((r) => r.json());
          for (const e of (d.entries ?? []).slice(0, q.topN ?? undefined) as Array<{ rank: number; players: Array<{ name: string; id?: string }> }>) {
            const ids = e.players.map((p) => p.id ?? ''); const namen = e.players.map((p) => p.name);
            const key = ids.filter(Boolean).length ? ids.filter(Boolean).sort().join('|') : namen.map(schl).sort().join('|');
            const h = `${q.titel} · #${e.rank}`; const da = g.get(key);
            if (da) { da.herkunft.push(h); da.besterPlatz = Math.min(da.besterPlatz, e.rank); } else g.set(key, { key, namen, ids, herkunft: [h], besterPlatz: e.rank, region: q.region });
          }
        } catch { /* Spieltag fehlt */ }
      }
      for (const m of pg.manuell ?? []) if (!g.has(m.key)) g.set(m.key, m);
      if (!weg) { setFeld([...g.values()].sort((a, b) => a.besterPlatz - b.besterPlatz)); setFeldLaedt(false); }
    })();
    return () => { weg = true; };
  }, [pg]);

  useEffect(() => {
    if (!pg?.quellen.length) { setPreise(null); return; }
    const q = pg.quellen[pg.quellen.length - 1];
    fetch(`/api/cup-preise?window=${encodeURIComponent(q.windowId)}&region=${encodeURIComponent(q.region)}&event=${encodeURIComponent(q.eventId)}&finale=1`).then((r) => r.json())
      .then((j) => setPreise({ geld: j.geld ?? [], proPerson: !!j.proPerson })).catch(() => setPreise(null));
  }, [pg]);

  const teamVon = useCallback((k: string | null) => (k ? feld.find((x) => x.key === k) ?? null : null), [feld]);
  const regionVon = useCallback((t: PTeam) => (REGIONEN.includes(t.region) ? t.region : t.namen.map((n, k) => profilVon(n, t.ids[k])?.region).find(Boolean) ?? ''), [profilVon]);
  const karten: PKarte[] = useMemo(() => (!pg ? [] : pg.karten?.length ? pg.karten : pg.bildId ? [{ id: 'eine', bildId: pg.bildId, titel: pg.kartenTitel ?? pg.titel, spots: pg.spots ?? [], aufSpot: pg.aufSpot ?? {} }] : []), [pg]);
  const karte = karten[Math.min(kartenNr, Math.max(0, karten.length - 1))] ?? null;
  const formen: KartenForm[] = useMemo(() => (karte?.spots ?? []).map((sp) => {
    const keys = karte!.aufSpot[sp.id] ?? [];
    const ts = keys.map(teamVon).filter((t): t is PTeam => Boolean(t));
    const namen = (t: PTeam) => t.namen.map((n, k) => zeigName(n, t.ids[k]));
    return { punkte: sp.punkte, teams: keys.length, farbe: keys.length ? null : sp.farbe, zeilen: ts.length === 1 ? namen(ts[0]) : ts.map((t) => namen(t).join(' ')), alle: ts.flatMap(namen) };
  }), [karte, teamVon, zeigName]);

  // Duo von Hand (nur Admin)
  const [neuOffen, setNeuOffen] = useState(false);
  const [neu, setNeu] = useState<[string, string]>(['', '']);
  const [treffer, setTreffer] = useState<Array<Array<{ epicId: string; anzeige: string; name: string }>>>([[], []]);
  const [gw, setGw] = useState<Array<{ epicId: string; name: string } | null>>([null, null]);
  const [neuRegion, setNeuRegion] = useState('EU');
  const sucheSp = (nr: 0 | 1, w: string) => {
    setNeu((a) => (nr ? [a[0], w] : [w, a[1]])); setGw((a) => (nr ? [a[0], null] : [null, a[1]]));
    if (w.trim().length < 2) { setTreffer((a) => (nr ? [a[0], []] : [[], a[1]])); return; }
    fetch(`/api/szene-stats?ansicht=suche&q=${encodeURIComponent(w.trim())}`).then((r) => r.json()).then((j) => setTreffer((a) => (nr ? [a[0], j.spieler ?? []] : [j.spieler ?? [], a[1]]))).catch(() => {});
  };
  const speichern = async (manuell: PTeam[]) => {
    if (!pg) return;
    const r = await fetch('/api/prognosen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...pg, manuell }) });
    const j = await r.json().catch(() => null);
    if (r.ok && j?.prognose) setPrognosen((a) => (a ?? []).map((x) => (x.id === j.prognose.id ? j.prognose : x)));
  };

  if (!prognosen) return <Laedt />;
  if (!prognosen.length) return <Leer text="No prediction published yet." />;
  const gruppen = (() => { const m = new Map<string, PTeam[]>(); for (const t of feld) { const k = t.herkunft[0]?.split(' · ')[0] ?? ''; (m.get(k) ?? m.set(k, []).get(k)!).push(t); } return [...m.entries()]; })();
  const regionen = (() => { const m = new Map<string, PTeam[]>(); for (const t of feld) { const r = regionVon(t) || 'unknown'; (m.get(r) ?? m.set(r, []).get(r)!).push(t); } return [...m.entries()].sort((a, b) => b[1].length - a[1].length); })();
  const nationen = (() => { const m = new Map<string, string[]>(); let ohne = 0; for (const t of feld) t.namen.forEach((n, k) => { const l = profilVon(n, t.ids[k])?.land?.toUpperCase(); if (!l) { ohne++; return; } (m.get(l) ?? m.set(l, []).get(l)!).push(zeigName(n, t.ids[k])); }); return { l: [...m.entries()].sort((a, b) => b[1].length - a[1].length), ohne }; })();
  const flaggen = (t: PTeam) => t.namen.map((n, k) => profilVon(n, t.ids[k])?.land ?? null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-extrabold text-white">{pg?.titel}</h2>
        <select value={gewaehlt} onChange={(e) => { setGewaehlt(e.target.value); setKartenNr(0); }} className="ml-auto rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:outline-none">
          {prognosen.map((p) => <option key={p.id} value={p.id}>{p.cupTitel} · {p.gruppe || p.titel}</option>)}
        </select>
      </div>
      <Reiter<Abschnitt> wert={ab} setze={setAb} liste={[['duos', 'Duos'], ['karte', 'Map'], ['leaderboard', 'Leaderboard'], ['regionen', 'Regions'], ['nationen', 'Nationalities'], ['preise', 'Prize pool']]} />
      {feldLaedt && !feld.length ? <Laedt /> : ab === 'duos' ? (
        <div className="space-y-4">
          {admin && <div className="flex items-center gap-2"><button type="button" onClick={() => setNeuOffen((o) => !o)} className="rounded-xl border border-sky-400/50 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:bg-sky-400/10">+ Add a duo</button><span className="text-[11px] text-white/35">Only you see this button.</span></div>}
          {admin && neuOffen && (
            <Glas className="p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {([0, 1] as const).map((nr) => (
                  <div key={nr} className="relative">
                    <input value={neu[nr]} onChange={(e) => sucheSp(nr, e.target.value)} placeholder="Search a player …" className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:outline-none" />
                    {gw[nr] && <p className="mt-1 text-[11px] text-emerald-400">{gw[nr]!.name}</p>}
                    {!gw[nr] && treffer[nr].length > 0 && <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-white/10 bg-[#0a0e18] shadow-xl">{treffer[nr].map((s) => (
                      <button key={s.epicId} type="button" onClick={() => { setGw((a) => (nr ? [a[0], { epicId: s.epicId, name: s.name }] : [{ epicId: s.epicId, name: s.name }, a[1]])); setNeu((a) => (nr ? [a[0], s.anzeige] : [s.anzeige, a[1]])); }} className="block w-full px-3 py-2 text-left text-sm text-white hover:bg-white/5">{s.anzeige} <span className="text-white/40">{s.name}</span></button>))}</div>}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <select value={neuRegion} onChange={(e) => setNeuRegion(e.target.value)} className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white">{REGIONEN.map((r) => <option key={r}>{r}</option>)}</select>
                <button type="button" disabled={!gw[0] || !gw[1]} onClick={() => { const ids = [gw[0]!.epicId, gw[1]!.epicId]; const t: PTeam = { key: ids.slice().sort().join('|'), namen: [gw[0]!.name, gw[1]!.name], ids, herkunft: ['by hand'], besterPlatz: 999, region: neuRegion }; void speichern([...(pg?.manuell ?? []).filter((m) => m.key !== t.key), t]).then(() => { setNeuOffen(false); setNeu(['', '']); setGw([null, null]); }); }}
                  className="rounded-lg bg-sky-400 px-3 py-1.5 text-xs font-bold text-[#06080f] disabled:opacity-40">Add</button>
              </div>
            </Glas>
          )}
          {!feld.length && <Leer text={pg?.quellen.length ? 'Epic has no leaderboard for this cup yet.' : 'No match day set for this cup yet.'} />}
          {gruppen.map(([titel, ts]) => (
            <Glas key={titel} className="overflow-hidden">
              <p className="border-b border-white/5 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">{titel || 'Field'} <span className="ml-1 text-white/30">{ts.length}</span></p>
              <div className="grid gap-px bg-white/[0.03] sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {ts.map((t) => (
                  <div key={t.key} className="flex items-center gap-3 bg-[#06080f]/60 px-4 py-2.5">
                    <TeamFlagge groesse={24} laender={flaggen(t)} />
                    <span className="flex min-w-0 flex-1 flex-col text-xs font-bold uppercase leading-tight text-white">{t.namen.map((n, k) => <span key={k} className="truncate">{zeigName(n, t.ids[k])}</span>)}</span>
                    <span className="text-[10px] tabular-nums text-white/35">{t.besterPlatz < 999 ? `#${t.besterPlatz}` : 'by hand'}</span>
                    {admin && (pg?.manuell ?? []).some((m) => m.key === t.key) && <button type="button" onClick={() => void speichern((pg?.manuell ?? []).filter((m) => m.key !== t.key))} className="text-white/30 hover:text-rose-300">×</button>}
                  </div>
                ))}
              </div>
            </Glas>
          ))}
        </div>
      ) : ab === 'karte' ? (
        <div className="space-y-3">
          {karten.length > 1 && <div className="flex flex-wrap gap-1.5">{karten.map((k, i) => <button key={k.id} type="button" onClick={() => setKartenNr(i)} className={chip(i === kartenNr)}>{k.titel}</button>)}</div>}
          {karte ? <KartenAnsicht formen={formen} bild={`/bilder/karten/${encodeURIComponent(karte.bildId)}.png`} rotAb={2} titel={pg?.titel ?? 'prediction'} /> : <Leer text="No map for this prediction yet." />}
        </div>
      ) : ab === 'leaderboard' ? (
        !pg?.plaetze.some(Boolean) ? <Leer text="The order is not set yet." /> : (
          <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {pg.plaetze.map((k, i) => { const t = teamVon(k); return (
              <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 30) * 0.015 }} className="flex items-center gap-2">
                <span className={`w-10 shrink-0 text-right text-[11px] font-semibold tabular-nums ${i === 0 ? 'text-amber-300' : i < 3 ? 'text-sky-300' : 'text-white/40'}`}>{ordnung(i + 1)}</span>
                <span className={`flex min-h-[40px] flex-1 items-center gap-2 rounded-xl border px-3 ${i === 0 ? 'border-amber-300/50 bg-amber-300/[0.06]' : 'border-white/10 bg-white/[0.03]'}`}>
                  {t ? <><TeamFlagge groesse={20} laender={flaggen(t)} /><span className="truncate text-xs font-bold uppercase text-white">{t.namen.map((n, x) => zeigName(n, t.ids[x])).join(' · ')}</span></> : null}
                </span>
              </motion.div>); })}
          </div>
        )
      ) : ab === 'regionen' ? (
        <div className="flex flex-wrap items-start gap-3">
          {regionen.map(([r, ts]) => (
            <Glas key={r} className="min-w-[200px] overflow-hidden">
              <p className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-2 text-[11px]"><span className="rounded bg-white/10 px-1.5 py-0.5 font-semibold text-white/80">{r}</span><span className="text-white/40">{ts.length} ({Math.round((ts.length / Math.max(1, feld.length)) * 100)}%)</span></p>
              {ts.map((t) => <div key={t.key} className="flex items-center gap-3 border-b border-white/[0.03] px-4 py-2"><TeamFlagge groesse={18} laender={flaggen(t)} /><span className="flex flex-col text-xs font-bold uppercase leading-tight text-white">{t.namen.map((n, k) => <span key={k}>{zeigName(n, t.ids[k])}</span>)}</span></div>)}
            </Glas>
          ))}
        </div>
      ) : ab === 'nationen' ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            {nationen.l.map(([l, namen]) => (
              <Glas key={l} className="p-4"><div className="mb-2 flex items-center gap-2 border-b border-white/5 pb-2"><img src={flaggenPfad(l)} alt="" className="h-5 w-5 rounded-full object-cover" /><span className="min-w-0 flex-1 truncate text-sm font-bold text-white">{landName(l)}</span><span className="text-xs text-white/40">{namen.length}</span></div>
                <ul className="space-y-0.5 text-center text-xs font-semibold uppercase text-white/80">{namen.map((n, i) => <li key={i} className="truncate">{n}</li>)}</ul></Glas>
            ))}
          </div>
          {nationen.ohne > 0 && <p className="text-xs text-white/35">{nationen.ohne} players without a known country</p>}
        </div>
      ) : (
        !preise ? <Laedt /> : !preise.geld.length ? <Leer text="Epic has no payout table for this cup." /> : (
          <Glas className="overflow-hidden">
            <div className="divide-y divide-white/[0.04]">
              {preise.geld.filter((s) => s.art !== 'value').map((s, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-2.5">
                  <span className={`w-24 text-sm font-bold tabular-nums ${i === 0 ? 'text-amber-300' : 'text-white/70'}`}>{s.von && s.von !== s.schwelle ? `${ordnung(s.von)}–${ordnung(s.schwelle)}` : ordnung(s.schwelle)}</span>
                  <span className="text-lg font-bold tabular-nums text-emerald-300">${Math.round(s.betrag).toLocaleString('en')}</span>
                </div>
              ))}
            </div>
            {preise.proPerson && <p className="border-t border-white/5 px-5 py-2.5 text-[11px] text-white/35">Amounts per player.</p>}
          </Glas>
        )
      )}
    </div>
  );
}

export default function Predictions() {
  const [adresse, setAdresse] = useSearchParams();
  const ansicht = adresse.get('id') || adresse.get('ansicht') === 'info' ? 'info' : 'tipp';
  return (
    <div className="space-y-6">
      <SeitenKopf ueber="Predictions" titel={ansicht === 'tipp' ? 'Call the final' : "CompHub's prediction"}
        text={ansicht === 'tipp' ? 'Order every team of the next final, pick your MVP and share your call — see how close you were once it is over.' : 'Where every duo lands and who comes out on top — the prediction from the CompHub team.'}
        rechts={<Reiter wert={ansicht} setze={(k) => { const p = new URLSearchParams(adresse); if (k === 'info') p.set('ansicht', 'info'); else { p.delete('ansicht'); p.delete('id'); } setAdresse(p); }} liste={[['tipp', 'Make your call'], ['info', "CompHub's prediction"]]} />} />
      {ansicht === 'tipp' ? <Tippen /> : <Betreiber />}
    </div>
  );
}
