import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bild, Flaeche, Leer, Marke, Segment } from '../../../ds/Bausteine';
import { useWer } from '../../../teile/Anmeldung';
import KartenAnsicht, { kartenName, type KartenForm, type Punkt } from './KartenAnsicht';
import { formenVon } from './maps/MapsKarte';
import { RegionMarke } from './maps/Maps';
import type { MTeam } from './maps/Mannschaften';
import { Dock, Werkbank, useRestHoehe } from './Werkbank';
import { FehlerZeile, Laedt, Reiter, TeamFlagge, TeamFotos, chip, flaggenPfad, landName } from './teile';

/*
 * Predictions im Hub (wie /predictions der Seite). Zwei Gesichter:
 *  - "Call the final": jeder tippt selbst - die Finals aus /api/maps-liste, Feld und Landepunkte aus /api/maps-karte. Teams anklicken oder in die
 *    Reihenfolge ziehen, verschieben, tauschen, herausnehmen, MVP waehlen, zuruecksetzen (mit Rueckgaengig), als Text teilen. Gemerkt im Browser und mit
 *    Konto auch dort (/api/user-storage). Steht das Ergebnis fest, steht daneben, wie nah der Tipp lag.
 *  - "CompHub's prediction": die Prognose des Betreibers (/api/prognosen) mit Duos, Karte, Reihenfolge, Regionen, Nationalitaeten, Preisgeld (/api/cup-preise);
 *    der Admin kann unter Duos ein Duo von Hand ergaenzen oder entfernen.
 * Aufbau (Design-System 3.0, 27.11.2026): oben die Finals als Bildstreifen (Cup-Bild, Region, Datum - kein Auswahlfeld mehr). Darunter fuellt
 * das Tipp-Brett den Bildschirm: links das Feld, in der Mitte der eigene Tipp - die ersten drei als grosses Treppchen, darunter alle weiteren
 * Plaetze -, rechts die Karte mit den Landepunkten und der MVP. Die CompHub-Prognose: Prognosen als Chips, Ansichten als Umschalter; die Karte
 * als Werkbank mit der getippten Reihenfolge daneben.
 */

const TAGE = 86_400_000;
const REGIONEN = ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'];
const MEDAILLE = ['bg-amber-300 text-[#04050a]', 'bg-slate-200 text-[#04050a]', 'bg-orange-400 text-[#04050a]'];
const MEDAILLE_FARBE = ['#facc15', '#cbd5e1', '#f59e0b'];

interface Final { turnierId: string; region: string; windowId: string; cup: string; fenster: string; titel: string; datum: number | null; ende: number | null; saisonKurz?: string; bild: string | null; eventId: string | null; alt?: boolean }
interface Tipp { plaetze: Array<string | null>; mvp: string | null; geaendert: number }
interface FFenster { windowId: string; spieler: MTeam['spieler']; teams: MTeam[]; bild: string | null; formen: Parameters<typeof formenVon>[0] }

const nameVon = (t: MTeam) => t.spieler.map((s) => s.anzeige || s.name).join(' & ');

/** Fotos eines Teams als kleine Hochkant-Rechtecke - nur wenn jeder eines hat, sonst die Flagge. */
function Gesicht({ t, gross }: { t: MTeam; gross?: boolean }) {
  if (t.spieler.length && t.spieler.every((s) => s.bild)) {
    return <span className="flex shrink-0 gap-1">{t.spieler.map((s) => <img key={s.id} src={s.bild!} alt="" draggable={false} className={`${gross ? 'h-20 w-[60px] rounded-xl' : 'h-10 w-[30px] rounded-lg'} object-cover object-top`} />)}</span>;
  }
  return <TeamFlagge groesse={gross ? 44 : 28} laender={t.spieler.map((s) => s.land)} />;
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
  const [brett, hoehe] = useRestHoehe(520);

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
  const mvpS = tipp.mvp ? spielerVon.get(tipp.mvp) : null;

  const zieh = (id: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => { zug.current = id; try { e.dataTransfer.setData('text/plain', id); } catch { /* */ } },
    onDragEnd: () => { zug.current = null; setUeber(null); },
  });
  const ablage = (i: number) => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); if (ueber !== i) setUeber(i); },
    onDragLeave: () => setUeber((u) => (u === i ? null : u)),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); const d = zug.current; zug.current = null; setUeber(null); if (d) setze(d, i); },
  });

  const teamZeile = (tm: MTeam) => {
    const nr = platz.get(tm.id);
    return (
      <div key={tm.id} {...zieh(tm.id)} onClick={() => setze(tm.id)} title={nr ? `Place ${nr}` : 'Click or drag into your order'}
        className={`flex h-[52px] cursor-grab items-center gap-2.5 rounded-xl border px-2 transition active:cursor-grabbing ${nr ? 'border-white/[0.04] bg-black/20 opacity-45 hover:opacity-80' : 'border-white/[0.08] bg-black/40 hover:border-akz/50'}`}>
        <Gesicht t={tm} />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-xs font-bold uppercase text-white">{nameVon(tm)}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-white/40">{tm.spieler.map((s) => <img key={s.id} src={flaggenPfad(s.land)} alt="" className="h-3 w-3 rounded-full object-cover" />)}{tm.rang ? <span className="zahl">#{tm.rang}</span> : null}</span>
        </span>
        {tm.spieler.map((s) => <button key={s.id} type="button" onClick={(e) => { e.stopPropagation(); mvp(s.id); }} title={`MVP: ${s.anzeige}`} className={`rounded-md p-1 text-sm leading-none transition ${tipp.mvp === s.id ? 'bg-amber-300 text-[#04050a]' : 'text-white/25 hover:text-amber-300'}`}>★</button>)}
        {nr ? <span className="zahl rounded-md bg-akz/20 px-1.5 py-0.5 text-[10px] font-extrabold text-akz">#{nr}</span> : null}
      </div>
    );
  };
  const wie = (echt: number | null, i: number) => (echt ? <span className={`zahl text-[10px] font-semibold ${echt === i + 1 ? 'text-emerald-400' : Math.abs(echt - i - 1) <= 3 ? 'text-akz' : 'text-white/40'}`}>was #{echt}</span> : null);
  /** Die ersten drei: grosse Ablagen wie ein Treppchen - mit den Hochkant-Fotos des Teams. */
  const stufe = (i: number, hoehe: string) => {
    const id = tipp.plaetze[i]; const tm = id ? teamVon.get(id) : null; const echt = tm?.rang && ergebnis ? tm.rang : null;
    if (i >= tipp.plaetze.length) return null;
    return (
      <div key={i} {...ablage(i)} className={`relative flex min-w-0 flex-1 flex-col justify-end overflow-hidden rounded-2xl border p-3 transition ${hoehe} ${ueber === i ? 'border-akz bg-akz/10' : tm ? 'border-white/[0.08] bg-black/40' : 'border-dashed border-white/10 bg-black/20'}`}>
        <div className="absolute inset-x-0 top-0 h-1" style={{ background: MEDAILLE_FARBE[i] }} />
        <span className="titel absolute left-3 top-3 text-5xl" style={{ color: MEDAILLE_FARBE[i] }}>{i + 1}</span>
        {tm ? (
          <div {...zieh(tm.id)} className="flex min-w-0 cursor-grab flex-col items-end gap-2">
            <Gesicht t={tm} gross />
            <span className="w-full min-w-0 leading-tight">
              <span className="block truncate text-sm font-extrabold uppercase text-white">{nameVon(tm)}</span>
              <span className="flex items-center gap-2">{wie(echt, i)}{tm.spieler.some((s) => s.id === tipp.mvp) && <span className="rounded-md bg-amber-300 px-1.5 py-0.5 text-[10px] font-extrabold text-[#04050a]">MVP</span>}</span>
            </span>
            <button type="button" onClick={() => nimm(i)} aria-label="Take out" className="absolute right-2 top-2 rounded-md px-1.5 text-white/40 hover:bg-rose-500/20 hover:text-rose-300">×</button>
          </div>
        ) : <span className="text-[11px] text-white/30">Drag a team here or click one</span>}
      </div>
    );
  };
  const slot = (i: number) => {
    const id = tipp.plaetze[i]; const tm = id ? teamVon.get(id) : null; const echt = tm?.rang && ergebnis ? tm.rang : null;
    return (
      <div key={i} {...ablage(i)} className={`flex h-[52px] items-center gap-2 rounded-xl border px-2 transition ${ueber === i ? 'border-akz bg-akz/10' : tm ? 'border-white/[0.08] bg-black/40' : 'border-dashed border-white/10'}`}>
        <span className="zahl grid h-7 w-8 shrink-0 place-items-center rounded-md bg-white/5 text-[11px] font-extrabold text-white/45">{i + 1}</span>
        {tm ? (
          <div {...zieh(tm.id)} className="flex min-w-0 flex-1 cursor-grab items-center gap-2">
            <Gesicht t={tm} />
            <span className="min-w-0 flex-1 leading-tight"><span className="block truncate text-xs font-bold uppercase text-white">{nameVon(tm)}</span>{wie(echt, i)}</span>
            {tm.spieler.some((s) => s.id === tipp.mvp) && <span className="rounded-md bg-amber-300 px-1.5 py-0.5 text-[10px] font-extrabold text-[#04050a]">MVP</span>}
            <button type="button" onClick={() => nimm(i)} className="rounded-md px-1.5 text-white/30 hover:bg-rose-500/20 hover:text-rose-300">×</button>
          </div>
        ) : <span className="flex-1 text-[11px] text-white/25">Drag a team here or click one</span>}
      </div>
    );
  };
  const standMarke = (e: Final) => (!e.datum ? null : Date.now() < e.datum ? null : e.ende && Date.now() > e.ende ? <Marke>Ended</Marke> : <Marke ton="rot" puls>Live</Marke>);
  const zeit = (ms: number) => new Date(ms).toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  // Je Finale (Cup + Spieltag) eine Karte im Streifen; die Regionen desselben Finals stehen als Chips darauf.
  const streifen = liste.filter((e, i) => liste.findIndex((x) => x.turnierId === e.turnierId && x.fenster === e.fenster) === i);

  return (
    <div className="space-y-3">
      {/* Die Finals als Bildstreifen */}
      <div className="ohne-leiste -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
        {streifen.map((e) => {
          const an = !!wahl && e.turnierId === wahl.turnierId && e.fenster === wahl.fenster;
          const gezeigt = an && wahl ? wahl : e;
          const regionen = liste.filter((x) => x.turnierId === e.turnierId && x.fenster === e.fenster);
          return (
            <div key={`${e.turnierId}|${e.fenster}`} role="button" tabIndex={0} onClick={() => { if (!an) setWahl(e); }} onKeyDown={(ev) => { if (ev.key === 'Enter' && !an) setWahl(e); }}
              className={`fl-fest group flex w-[300px] shrink-0 cursor-pointer gap-3 !rounded-2xl p-2 transition ${an ? '!border-akz/60 shadow-[0_0_24px_-8px_rgb(var(--akz)/0.7)]' : 'hover:border-white/20'}`}>
              <Bild src={e.bild} className={`aspect-video h-[68px] shrink-0 rounded-xl transition ${an ? '' : 'opacity-60 group-hover:opacity-100'}`} />
              <div className="min-w-0 flex-1 py-0.5">
                <p className={`truncate text-[13px] font-bold ${an ? 'text-white' : 'text-white/70'}`}>{e.titel}</p>
                <p className="zahl truncate text-[11px] text-white/45">{gezeigt.datum ? zeit(gezeigt.datum) : e.saisonKurz}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  {regionen.length > 1 ? regionen.map((x) => <button key={x.region} type="button" onClick={(ev) => { ev.stopPropagation(); setWahl(x); }} className={`chip !px-2 !py-0.5 !text-[10px] ${an && x.region === wahl?.region ? 'chip-an' : ''}`}>{x.region}</button>) : <RegionMarke r={e.region} />}
                  {standMarke(gezeigt)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {feldFehler && <Leer text={feldFehler} />}
      {!f && !feldFehler && <Laedt text="Loading the field …" />}
      {f && (
        <>
          {ergebnis && (
            <div className="fl-fest flex flex-wrap items-center gap-x-8 gap-y-2 !rounded-2xl !border-emerald-400/30 px-5 py-3">
              <p className="titel text-2xl !text-emerald-300">How close was your call?</p>
              {([[ergebnis.genau, 'exact'], [ergebnis.nah, 'within 3 places'], [ergebnis.schnitt.toFixed(1), 'places off on average']] as Array<[number | string, string]>).map(([v, l]) => (
                <p key={l} className="flex items-baseline gap-1.5"><span className="titel text-3xl">{v}</span><span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">{l}</span></p>
              ))}
            </div>
          )}
          <div className="xl:hidden"><Reiter wert={bereich} setze={setBereich} liste={[['spieler', 'Players'], ['karte', 'Map'], ['tipp', 'My call']]} /></div>
          <div ref={brett} style={{ '--wb': `${hoehe}px` } as React.CSSProperties} className="grid grid-cols-1 gap-3 xl:h-[var(--wb)] xl:grid-cols-[minmax(270px,330px)_minmax(0,1fr)_minmax(0,min(calc(var(--wb)_-_76px),34vw))]">
            {/* Das Feld */}
            <div className={`flex max-h-[75vh] min-h-0 min-w-0 flex-col xl:max-h-none ${bereich === 'spieler' ? '' : 'max-xl:hidden'}`}>
              <Dock fest titel={teams.every((x) => x.spieler.length <= 1) ? 'Players' : 'Teams'} zahl={anzahl}
                kopf={<div className="flex items-center gap-2">
                  <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Search …" className="eingabe min-w-0 flex-1 !px-3 !py-1.5 !text-xs" />
                  <Segment id="tipp-sort" klein wert={sortierung} onWahl={setSortierung} wahl={[{ k: 'rang', titel: 'Rank' }, { k: 'name', titel: 'Name' }, { k: 'land', titel: 'Country' }]} />
                </div>}>
                <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">{gefiltert.map(teamZeile)}</div>
              </Dock>
            </div>
            {/* Der eigene Tipp */}
            <div className={`flex max-h-[80vh] min-h-0 min-w-0 flex-col xl:max-h-none ${bereich === 'tipp' ? '' : 'max-xl:hidden'}`}>
              <Dock fest titel="My call" zahl={`${platz.size}/${anzahl}`}
                rechts={<>
                  <span className="hidden text-[11px] text-white/40 2xl:inline">{gespeichert === 'konto' ? 'Saved to your account' : gespeichert === 'lokal' ? 'Saved in this browser' : wer?.userName ? '' : 'Sign in to keep your call on every device'}</span>
                  <button type="button" onClick={() => void teilen()} className="knopf !px-3 !py-1 !text-xs">{kopiert ? 'Copied ✓' : 'Share'}</button>
                  {resetFrage ? <><button type="button" onClick={reset} className="rounded-xl bg-rose-500 px-3 py-1 text-xs font-bold text-white">Clear all?</button><button type="button" onClick={() => setResetFrage(false)} className="text-xs text-white/50">No</button></>
                    : <button type="button" onClick={() => setResetFrage(true)} disabled={!platz.size && !tipp.mvp} className="knopf !px-3 !py-1 !text-xs hover:!border-rose-400/50">Reset</button>}
                </>}>
                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  {zurueck && <button type="button" onClick={() => { const a = zurueck; aendere(() => a); setZurueck(null); }} className="mb-2 w-full rounded-xl bg-akz/15 px-3 py-1.5 text-xs font-semibold text-white">Cleared — undo</button>}
                  <div className="flex items-end gap-2">{stufe(1, 'h-[168px]')}{stufe(0, 'h-[196px]')}{stufe(2, 'h-[150px]')}</div>
                  <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-1.5">{tipp.plaetze.map((_, i) => (i < 3 ? null : slot(i)))}</div>
                </div>
              </Dock>
            </div>
            {/* Karte und MVP */}
            <div className={`flex min-h-0 min-w-0 flex-col gap-3 ${bereich === 'karte' ? '' : 'max-xl:hidden'}`}>
              <KartenAnsicht formen={formenVon(f.formen ?? [])} bild={f.bild} rotAb={2} deckel="min(100%, 86vh)" titel={`${wahl?.titel ?? 'final'}-map`} />
              <div className="fl-fest flex items-center gap-3 !rounded-2xl !border-amber-300/25 px-3 py-2.5">
                <span className="rounded-md bg-amber-300 px-1.5 py-0.5 text-[10px] font-extrabold text-[#04050a]">MVP</span>
                {mvpS ? <>{mvpS.bild && <img src={mvpS.bild} alt="" className="h-10 w-[30px] rounded-lg object-cover object-top" />}<span className="titel min-w-0 flex-1 truncate text-2xl">{mvpS.anzeige || mvpS.name}</span><button type="button" onClick={() => mvp(mvpS.id)} className="text-white/40 hover:text-rose-300">×</button></> : <span className="text-xs text-white/40">Tap ★ next to a player to pick your MVP</span>}
              </div>
            </div>
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
  const [ab, setAb] = useState<Abschnitt>('karte');
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
  // Zuerst die Karte mit der Reihenfolge daneben (fuellt den Bildschirm) - hat die Prognose keine Karte, die Duos.
  useEffect(() => { if (pg && !karten.length) setAb((x) => (x === 'karte' ? 'duos' : x)); }, [pg, karten.length]);
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

  const [zeige, setZeige] = useState<{ namen: string[]; n: number } | null>(null);

  if (!prognosen) return <Laedt />;
  if (!prognosen.length) return <Leer text="No prediction published yet." />;
  const gruppen = (() => { const m = new Map<string, PTeam[]>(); for (const t of feld) { const k = t.herkunft[0]?.split(' · ')[0] ?? ''; (m.get(k) ?? m.set(k, []).get(k)!).push(t); } return [...m.entries()]; })();
  const regionen = (() => { const m = new Map<string, PTeam[]>(); for (const t of feld) { const r = regionVon(t) || 'unknown'; (m.get(r) ?? m.set(r, []).get(r)!).push(t); } return [...m.entries()].sort((a, b) => b[1].length - a[1].length); })();
  const nationen = (() => { const m = new Map<string, string[]>(); let ohne = 0; for (const t of feld) t.namen.forEach((n, k) => { const l = profilVon(n, t.ids[k])?.land?.toUpperCase(); if (!l) { ohne++; return; } (m.get(l) ?? m.set(l, []).get(l)!).push(zeigName(n, t.ids[k])); }); return { l: [...m.entries()].sort((a, b) => b[1].length - a[1].length), ohne }; })();
  const flaggen = (t: PTeam) => t.namen.map((n, k) => profilVon(n, t.ids[k])?.land ?? null);
  const namen = (t: PTeam) => t.namen.map((n, k) => zeigName(n, t.ids[k]));
  const springe = (t: PTeam) => setZeige((alt) => ({ namen: namen(t), n: (alt?.n ?? 0) + 1 }));
  const gesetzt = (pg?.plaetze ?? []).map((k, i) => ({ t: teamVon(k), i })).filter((x): x is { t: PTeam; i: number } => !!x.t);
  const eingabe = 'eingabe w-full !py-2';
  const geld = (preise?.geld ?? []).filter((x) => x.art !== 'value');
  const maxGeld = Math.max(1, ...geld.map((x) => x.betrag));

  return (
    <div className="space-y-3">
      {/* Welche Prognose, welche Ansicht */}
      <div className="fl-fest flex flex-wrap items-center gap-x-5 gap-y-3 !rounded-2xl px-4 py-3">
        <div className="min-w-0"><p className="ueber truncate !tracking-[0.25em]">{pg?.cupTitel}{pg?.gruppe ? ` · ${pg.gruppe}` : ''}</p><h2 className="titel truncate text-3xl">{pg?.titel}</h2></div>
        <div className="ohne-leiste flex max-w-full gap-1.5 overflow-x-auto">
          {prognosen.map((x) => <button key={x.id} type="button" onClick={() => { setGewaehlt(x.id); setKartenNr(0); }} title={x.cupTitel} className={chip(x.id === gewaehlt)}>{x.gruppe || x.titel}{!x.oeffentlich && <span className="text-amber-300">hidden</span>}</button>)}
        </div>
        <div className="ml-auto max-w-full"><Reiter<Abschnitt> wert={ab} setze={setAb} liste={[['karte', 'Map'], ['duos', 'Duos'], ['leaderboard', 'Leaderboard'], ['regionen', 'Regions'], ['nationen', 'Nationalities'], ['preise', 'Prize pool']]} /></div>
      </div>
      {feldLaedt && !feld.length ? <Laedt /> : ab === 'duos' ? (
        <div className="space-y-3">
          {admin && <div className="flex items-center gap-2"><button type="button" onClick={() => setNeuOffen((o) => !o)} className={`chip ${neuOffen ? 'chip-an' : ''}`}>+ Add a duo</button><span className="text-[11px] text-white/35">Only you see this button.</span></div>}
          {admin && neuOffen && (
            <Flaeche fest className="relative z-10 p-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-start">
                {([0, 1] as const).map((nr) => (
                  <div key={nr} className="relative">
                    <input value={neu[nr]} onChange={(e) => sucheSp(nr, e.target.value)} placeholder="Search a player …" className={eingabe} />
                    {gw[nr] && <p className="mt-1 text-[11px] text-emerald-400">{gw[nr]!.name}</p>}
                    {!gw[nr] && treffer[nr].length > 0 && <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-white/10 bg-fl shadow-xl">{treffer[nr].map((sp) => (
                      <button key={sp.epicId} type="button" onClick={() => { setGw((x) => (nr ? [x[0], { epicId: sp.epicId, name: sp.name }] : [{ epicId: sp.epicId, name: sp.name }, x[1]])); setNeu((x) => (nr ? [x[0], sp.anzeige] : [sp.anzeige, x[1]])); }} className="block w-full px-3 py-2 text-left text-sm text-white hover:bg-akz/10">{sp.anzeige} <span className="text-white/40">{sp.name}</span></button>))}</div>}
                  </div>
                ))}
                <div className="flex flex-wrap gap-1">{REGIONEN.map((r) => <button key={r} type="button" onClick={() => setNeuRegion(r)} className={`chip !px-2.5 ${neuRegion === r ? 'chip-an' : ''}`}>{r}</button>)}</div>
                <button type="button" disabled={!gw[0] || !gw[1]} onClick={() => { const ids = [gw[0]!.epicId, gw[1]!.epicId]; const t: PTeam = { key: ids.slice().sort().join('|'), namen: [gw[0]!.name, gw[1]!.name], ids, herkunft: ['by hand'], besterPlatz: 999, region: neuRegion }; void speichern([...(pg?.manuell ?? []).filter((m) => m.key !== t.key), t]).then(() => { setNeuOffen(false); setNeu(['', '']); setGw([null, null]); }); }}
                  className="knopf-prim !py-2">Add</button>
              </div>
            </Flaeche>
          )}
          {!feld.length && <Leer text={pg?.quellen.length ? 'Epic has no leaderboard for this cup yet.' : 'No match day set for this cup yet.'} />}
          {gruppen.map(([titel, ts]) => (
            <section key={titel}>
              <div className="mb-2.5 flex items-center gap-3"><span className="h-5 w-1 rounded-full bg-akz" /><h3 className="titel text-2xl">{titel || 'Field'}</h3><span className="zahl text-sm font-semibold text-white/35">{ts.length}</span><span className="h-px flex-1 bg-white/[0.07]" /></div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {ts.map((t) => (
                  <div key={t.key} className="fl-fest flex h-[60px] items-center gap-3 !rounded-2xl px-3.5">
                    <span className="titel w-9 shrink-0 text-2xl !text-white/30">{t.besterPlatz < 999 ? t.besterPlatz : '+'}</span>
                    <TeamFlagge groesse={26} laender={flaggen(t)} />
                    <span className="flex min-w-0 flex-1 flex-col text-xs font-bold uppercase leading-tight text-white">{t.namen.map((n, k) => <span key={k} className="truncate">{zeigName(n, t.ids[k])}</span>)}</span>
                    {t.besterPlatz >= 999 && <span className="text-[10px] text-white/35">by hand</span>}
                    {admin && (pg?.manuell ?? []).some((m) => m.key === t.key) && <button type="button" onClick={() => void speichern((pg?.manuell ?? []).filter((m) => m.key !== t.key))} className="text-white/30 hover:text-rose-300">×</button>}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : ab === 'karte' ? (
        <>
          {karten.length > 1 && <div className="flex flex-wrap gap-1.5">{karten.map((k, i) => <button key={k.id} type="button" onClick={() => setKartenNr(i)} className={chip(i === kartenNr)}>{k.titel}</button>)}</div>}
          {karte ? (
            <Werkbank rechts={(
              <Dock titel="Predicted order" zahl={`${gesetzt.length} places`} fuss="Click a team to fly to its drop spot.">
                <ul className="grid grid-cols-1 2xl:grid-cols-2">
                  {gesetzt.map(({ t, i }) => (
                    <li key={t.key}>
                      <button type="button" onClick={() => springe(t)} className="flex h-12 w-full items-center gap-2.5 border-b border-white/[0.05] px-3 text-left transition hover:bg-akz/[0.08]">
                        <span className="titel w-8 shrink-0 text-2xl" style={{ color: MEDAILLE_FARBE[i] ?? 'rgba(255,255,255,.35)' }}>{i + 1}</span>
                        <TeamFlagge groesse={22} laender={flaggen(t)} />
                        <span className="flex min-w-0 flex-1 flex-col text-[11px] font-bold uppercase leading-[1.3] tracking-wide text-white">{namen(t).map((n, k) => <span key={k} className="truncate">{n}</span>)}</span>
                      </button>
                    </li>
                  ))}
                  {!gesetzt.length && <li className="px-4 py-6 text-center text-sm text-white/45">The order is not set yet.</li>}
                </ul>
              </Dock>
            )}>
              <KartenAnsicht formen={formen} bild={`/bilder/karten/${encodeURIComponent(karte.bildId)}.png`} rotAb={2} deckel="none" zeige={zeige} titel={pg?.titel ?? 'prediction'} />
            </Werkbank>
          ) : <Leer text="No map for this prediction yet." />}
        </>
      ) : ab === 'leaderboard' ? (
        !pg?.plaetze.some(Boolean) ? <Leer text="The order is not set yet." /> : (
          <div className="space-y-3">
            {/* Die ersten drei gross, darunter alle weiteren Plaetze */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[0, 1, 2].map((i) => { const t = teamVon(pg.plaetze[i] ?? null); return (
                <Flaeche key={i} fest verz={i * 0.06} className="relative overflow-hidden p-4">
                  <div className="absolute inset-x-0 top-0 h-1" style={{ background: MEDAILLE_FARBE[i] }} />
                  <div className="flex items-center gap-4">
                    <span className="titel text-7xl" style={{ color: MEDAILLE_FARBE[i] }}>{i + 1}</span>
                    {t ? <><TeamFlagge groesse={40} laender={flaggen(t)} /><span className="flex min-w-0 flex-1 flex-col">{namen(t).map((n, k) => <span key={k} className="titel truncate text-3xl">{n}</span>)}</span></> : <span className="text-sm text-white/30">open</span>}
                  </div>
                </Flaeche>); })}
            </div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {pg.plaetze.map((k, i) => { if (i < 3) return null; const t = teamVon(k); return (
                <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 30) * 0.015 }} className={`flex h-12 items-center gap-2.5 rounded-xl border px-3 ${t ? 'border-white/[0.07] bg-fl' : 'border-dashed border-white/10'}`}>
                  <span className="zahl w-9 shrink-0 text-[11px] font-bold text-white/40">{ordnung(i + 1)}</span>
                  {t ? <><TeamFlagge groesse={22} laender={flaggen(t)} /><span className="truncate text-xs font-bold uppercase text-white">{namen(t).join(' · ')}</span></> : null}
                </motion.div>); })}
            </div>
          </div>
        )
      ) : ab === 'regionen' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {regionen.map(([r, ts], i) => (
            <Flaeche key={r} fest verz={i * 0.04} className="overflow-hidden">
              <div className="border-b border-white/[0.06] px-4 py-3">
                <div className="flex items-end justify-between"><h3 className="titel text-4xl">{r}</h3><span className="zahl text-xs font-semibold text-white/45">{ts.length} · {Math.round((ts.length / Math.max(1, feld.length)) * 100)}%</span></div>
                <span className="mt-2 block h-1 overflow-hidden rounded-full bg-white/[0.06]"><span className="block h-full rounded-full bg-akz" style={{ width: `${(ts.length / Math.max(1, feld.length)) * 100}%` }} /></span>
              </div>
              {ts.map((t) => <div key={t.key} className="flex items-center gap-3 border-b border-white/[0.05] px-4 py-2 last:border-b-0"><TeamFlagge groesse={22} laender={flaggen(t)} /><span className="flex min-w-0 flex-col text-xs font-bold uppercase leading-tight text-white">{namen(t).map((n, k) => <span key={k} className="truncate">{n}</span>)}</span></div>)}
            </Flaeche>
          ))}
        </div>
      ) : ab === 'nationen' ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {nationen.l.map(([l, ns], i) => (
              <Flaeche key={l} fest verz={Math.min(i, 12) * 0.03} className="p-4"><div className="mb-2.5 flex items-center gap-2.5 border-b border-white/[0.06] pb-2.5"><img src={flaggenPfad(l)} alt="" className="h-6 w-6 rounded-full object-cover" /><span className="min-w-0 flex-1 truncate text-sm font-bold text-white">{landName(l)}</span><span className="titel text-2xl !text-akz">{ns.length}</span></div>
                <ul className="space-y-1 text-xs font-semibold uppercase tracking-wide text-white/80">{ns.map((n, k) => <li key={k} className="truncate">{n}</li>)}</ul></Flaeche>
            ))}
          </div>
          {nationen.ohne > 0 && <p className="text-xs text-white/35">{nationen.ohne} players without a known country</p>}
        </div>
      ) : (
        !preise ? <Laedt /> : !geld.length ? <Leer text="Epic has no payout table for this cup." /> : (
          <Flaeche fest className="overflow-hidden">
            <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3"><span className="h-4 w-1 rounded-full bg-akz" /><h3 className="titel text-xl">Prize pool</h3>{preise.proPerson && <span className="text-[11px] text-white/40">Amounts per player.</span>}</div>
            <ul>
              {geld.map((x, i) => (
                <li key={i} className="flex items-center gap-4 border-b border-white/[0.05] px-4 py-2.5 last:border-b-0">
                  <span className="titel w-28 shrink-0 text-2xl" style={{ color: MEDAILLE_FARBE[i] ?? 'rgba(255,255,255,.45)' }}>{x.von && x.von !== x.schwelle ? `${ordnung(x.von)}–${ordnung(x.schwelle)}` : ordnung(x.schwelle)}</span>
                  <span className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.06]"><motion.span className="absolute inset-y-0 left-0 rounded-full bg-emerald-400" initial={{ width: 0 }} whileInView={{ width: `${(x.betrag / maxGeld) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.8, delay: Math.min(i, 12) * 0.03 }} /></span>
                  <span className="zahl w-24 shrink-0 text-right text-lg font-bold text-emerald-300">${Math.round(x.betrag).toLocaleString('en')}</span>
                </li>
              ))}
            </ul>
          </Flaeche>
        )
      )}
    </div>
  );
}

export default function Predictions() {
  const [adresse, setAdresse] = useSearchParams();
  const ansicht = adresse.get('id') || adresse.get('ansicht') === 'info' ? 'info' : 'tipp';
  return (
    <div className="-mt-2 space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45 }} className="min-w-0">
          <p className="ueber">Predictions</p>
          <h1 className="titel mt-1 text-5xl lg:text-6xl">{ansicht === 'tipp' ? 'Call the final' : "CompHub's prediction"}</h1>
          <p className="mt-1.5 max-w-3xl text-sm text-white/55">{ansicht === 'tipp' ? 'Order every team of the next final, pick your MVP and share your call — see how close you were once it is over.' : 'Where every duo lands and who comes out on top — the prediction from the CompHub team.'}</p>
        </motion.div>
        <Segment id="pred-ansicht" wert={ansicht} wahl={[{ k: 'tipp', titel: 'Make your call' }, { k: 'info', titel: "CompHub's prediction" }]}
          onWahl={(k) => { const p = new URLSearchParams(adresse); if (k === 'info') p.set('ansicht', 'info'); else { p.delete('ansicht'); p.delete('id'); } setAdresse(p); }} />
      </header>
      {ansicht === 'tipp' ? <Tippen /> : <Betreiber />}
    </div>
  );
}
