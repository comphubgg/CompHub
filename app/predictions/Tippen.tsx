'use client';

/*
 * Call the Final - jeder tippt selbst (Betreiber, 21.10.2026: "Predictions muss fuer jeden im Dashboard sein ... eine Map und daneben die Spieler, die man in eine Art Ranking
 * einpacken kann - Platz 1 bis 70, bei anderen Cups 1 bis 100 oder 1 bis 50, so viele Spieler wie drin sind - plus MVP. Fuer die Globals, die FNCS, die Solos, den Performance Cup,
 * fuer jedes Finale, oeffentlich. Bei der Map Vollbild, reinzoomen, Doppelklick" - Vorbild: nobleprac.com/predictions).
 *
 * Links die Spieler des Finales (Suche, Foto, Flagge), in der Mitte die Karte mit den Landepunkten (dieselbe wie auf den Karten-Seiten: Vollbild, Zoom, Doppelklick,
 * Strg + F), rechts die eigene Reihenfolge mit einem Platz je Team und der MVP. Ein Spieler wird in die Reihenfolge gezogen oder angeklickt (dann nimmt er den
 * naechsten freien Platz); in der Reihenfolge laesst er sich verschieben, herausnehmen und tauschen.
 *
 * Das Feld und die Landepunkte kommen aus derselben Quelle wie die Karten-Seiten (/api/maps-liste, /api/maps-karte); nichts davon ist hier erfunden. Der Tipp bleibt im
 * Browser und, wer ein Konto hat, auch dort (/api/user-storage). Steht das Ergebnis des Finales fest, zeigt die Seite daneben, wie nah der Tipp lag.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import SeitenKopf from '@/app/components/SeitenKopf';
import LadeSchirm from '@/app/components/LadeSchirm';
import TeamFlagge from '@/components/TeamFlagge';
import SpielerPlatzhalter from '@/app/components/SpielerPlatzhalter';
import { Karte } from '@/app/globals-solos/Bausteine';
import { useZugang } from '@/app/lib/zugang';
import { loadUserStorageCloud, saveUserStorageCloud } from '@/app/lib/userStorage';
import { regionAnzeige } from '@/lib/regionFarbe';
import type { SolosFenster, SolosSpieler, SolosTeam } from '@/lib/globalsSolos';

interface Eintrag {
  turnierId: string; region: string; windowId: string; cup: string; fenster: string; titel: string;
  datum: number | null; ende: number | null; saisonKurz?: string; bild: string | null; eventId: string | null; alt?: boolean;
}
interface Tipp { plaetze: Array<string | null>; mvp: string | null; geaendert: number }

const TAGE = 86_400_000;
const istFinale = (e: Eintrag) => /final/i.test(e.fenster) || /_final/i.test(e.windowId);
const schluessel = (e: Eintrag) => `tipp:${e.windowId}:${e.region}`;
const nameVon = (t: SolosTeam) => t.spieler.map((s) => s.anzeige || s.name).join(' & ');
const MEDAILLE = ['bg-amber-400 text-zinc-950', 'bg-slate-300 text-zinc-950', 'bg-orange-400 text-zinc-950'];

/** Das Foto eines Spielers als Quadrat mit abgerundeten Ecken - ohne Foto das Platzhalterfoto. */
function Foto({ s, px = 40 }: { s: SolosSpieler; px?: number }) {
  return (
    <span className="relative inline-block shrink-0 overflow-hidden rounded-lg bg-zinc-800" style={{ width: px, height: px }}>
      {s.bild
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={s.bild} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover object-top" />
        : <SpielerPlatzhalter name={s.anzeige} />}
    </span>
  );
}

function TeamFotos({ t, px }: { t: SolosTeam; px?: number }) {
  return <span className="flex shrink-0 gap-0.5">{t.spieler.map((s) => <Foto key={s.id} s={s} px={px} />)}</span>;
}

function Flaggen({ t }: { t: SolosTeam }) {
  return <span className="flex shrink-0 gap-0.5">{t.spieler.map((s) => <TeamFlagge key={s.id} groesse={13} laender={[s.land ?? undefined]} />)}</span>;
}

export default function Tippen() {
  const t = useT();
  const zugang = useZugang();
  const [liste, setListe] = useState<Eintrag[] | null>(null);
  const [fehler, setFehler] = useState('');
  const [wahl, setWahl] = useState<Eintrag | null>(null);
  const [fenster, setFenster] = useState<SolosFenster | null>(null);
  const [laedtFeld, setLaedtFeld] = useState(false);
  const [feldFehler, setFeldFehler] = useState('');
  const [tipp, setTipp] = useState<Tipp>({ plaetze: [], mvp: null, geaendert: 0 });
  const [gespeichert, setGespeichert] = useState<'' | 'lokal' | 'konto'>('');
  const [suche, setSuche] = useState('');
  const [sortierung, setSortierung] = useState<'rang' | 'name' | 'land'>('rang');
  const [bereich, setBereich] = useState<'spieler' | 'karte' | 'tipp'>('tipp');
  const [resetFrage, setResetFrage] = useState(false);
  const [zuruecknehmen, setZuruecknehmen] = useState<Tipp | null>(null);
  const [kopiert, setKopiert] = useState(false);
  const drag = useRef<{ art: 'liste' | 'slot'; id: string; von?: number } | null>(null);
  const [ueber, setUeber] = useState<number | null>(null);
  const geladenFuer = useRef('');

  /* ---------------------------------------------------------------- die Finals */
  useEffect(() => {
    let weg = false;
    fetch('/api/maps-liste').then((r) => r.json()).then((j) => {
      if (weg) return;
      if (!j?.ok) { setFehler(t('Die Liste der Finals lässt sich gerade nicht laden.')); setListe([]); return; }
      const jetzt = Date.now();
      const finals = (j.eintraege as Eintrag[]).filter((e) => !e.alt && istFinale(e) && e.datum && e.datum > jetzt - 2 * TAGE && e.datum < jetzt + 120 * TAGE)
        .sort((a, b) => (a.datum ?? 0) - (b.datum ?? 0));
      setListe(finals);
      const p = new URLSearchParams(window.location.search);
      const w = p.get('finale'), r = p.get('r');
      setWahl(finals.find((e) => e.windowId === w && (!r || e.region === r)) ?? finals[0] ?? null);
    }).catch(() => { if (!weg) { setFehler(t('Die Liste der Finals lässt sich gerade nicht laden.')); setListe([]); } });
    return () => { weg = true; };
  }, [t]);

  /* ---------------------------------------------------------------- Feld und Karte des gewaehlten Finales */
  useEffect(() => {
    if (!wahl) { setFenster(null); return undefined; }
    let weg = false;
    setLaedtFeld(true); setFeldFehler(''); setFenster(null); geladenFuer.current = '';
    fetch(`/api/maps-karte?t=${encodeURIComponent(wahl.turnierId)}&r=${encodeURIComponent(wahl.region)}&w=${encodeURIComponent(wahl.windowId)}`, { cache: 'no-store' })
      .then((r) => r.json()).then((j) => {
        if (weg) return;
        if (j?.ok && j.fenster) setFenster(j.fenster as SolosFenster); else setFeldFehler(t('Zu diesem Finale gibt es noch kein Feld.'));
      }).catch(() => { if (!weg) setFeldFehler(t('Das Feld lässt sich gerade nicht laden.')); })
      .finally(() => { if (!weg) setLaedtFeld(false); });
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('finale', wahl.windowId); u.searchParams.set('r', wahl.region);
      window.history.replaceState(null, '', u.toString());
    } catch { /* ohne Adresszeile bleibt es bei der Wahl */ }
    return () => { weg = true; };
  }, [wahl, t]);

  /** Die Teams des Finales - bei Solos je Spieler eines. */
  const teams: SolosTeam[] = useMemo(() => {
    if (!fenster) return [];
    if (fenster.teams?.length) return fenster.teams;
    return fenster.spieler.map((s) => ({ id: s.id, spieler: [s], rang: null, punkte: null, siege: null }));
  }, [fenster]);
  const teamVon = useMemo(() => new Map(teams.map((x) => [x.id, x])), [teams]);
  const spielerVon = useMemo(() => new Map(teams.flatMap((x) => x.spieler.map((s) => [s.id, s] as const))), [teams]);
  const anzahl = teams.length;

  /* ---------------------------------------------------------------- der Tipp: laden und speichern */
  useEffect(() => {
    if (!wahl || !anzahl) return undefined;
    const k = schluessel(wahl);
    let weg = false;
    const pruefen = (roh: Tipp | null): Tipp => {
      const gueltig = new Set(teams.map((x) => x.id));
      const plaetze = Array.from({ length: anzahl }, (_, i) => { const id = roh?.plaetze?.[i] ?? null; return id && gueltig.has(id) ? id : null; });
      // Jedes Team hoechstens einmal.
      const gesehen = new Set<string>();
      for (let i = 0; i < plaetze.length; i++) { const id = plaetze[i]; if (id) { if (gesehen.has(id)) plaetze[i] = null; else gesehen.add(id); } }
      const mvp = roh?.mvp && spielerVon.has(roh.mvp) ? roh.mvp : null;
      return { plaetze, mvp, geaendert: roh?.geaendert ?? 0 };
    };
    let lokal: Tipp | null = null;
    try { const roh = window.localStorage.getItem(k); if (roh) lokal = JSON.parse(roh) as Tipp; } catch { /* ohne Speicher beginnt der Tipp leer */ }
    setTipp(pruefen(lokal));
    geladenFuer.current = k;
    if (zugang.nutzer) {
      void loadUserStorageCloud<Tipp>(k).then((c) => {
        if (weg || !c || (lokal && (lokal.geaendert ?? 0) >= (c.geaendert ?? 0))) return;
        setTipp(pruefen(c));
      });
    }
    return () => { weg = true; };
  }, [wahl, anzahl, teams, spielerVon, zugang.nutzer]);

  const speicherUhr = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tippRef = useRef(tipp);
  useEffect(() => { tippRef.current = tipp; }, [tipp]);
  const aendere = useCallback((neu: (alt: Tipp) => Tipp) => {
    const n = { ...neu(tippRef.current), geaendert: Date.now() };
    tippRef.current = n;
    setTipp(n);
    if (wahl && geladenFuer.current === schluessel(wahl)) {
      const k = schluessel(wahl);
      try { window.localStorage.setItem(k, JSON.stringify(n)); setGespeichert('lokal'); } catch { /* ohne Speicher geht der Tipp nur bis zum Neuladen */ }
      if (zugang.nutzer) {
        if (speicherUhr.current) clearTimeout(speicherUhr.current);
        speicherUhr.current = setTimeout(() => { void saveUserStorageCloud(k, n).then(() => setGespeichert('konto')); }, 700);
      }
    }
  }, [wahl, zugang.nutzer]);

  /* ---------------------------------------------------------------- Handgriffe */
  const platz = useMemo(() => new Map(tipp.plaetze.map((id, i) => [id, i + 1] as const).filter(([id]) => id) as Array<[string, number]>), [tipp.plaetze]);
  const gesetzt = platz.size;

  const setze = (id: string, nr?: number) => aendere((alt) => {
    const p = alt.plaetze.slice();
    const von = p.indexOf(id);
    // Ein Klick auf einen Spieler, der schon einen Platz hat, aendert nichts - verschoben wird nur durch Ziehen.
    if (von >= 0 && nr === undefined) return alt;
    const ziel = nr ?? p.findIndex((x) => !x);
    if (ziel < 0) return alt;                      // alle Plaetze belegt
    if (von === ziel) return alt;
    const dort = p[ziel];
    if (von >= 0) p[von] = dort ?? null;           // aus der Reihenfolge verschoben: der andere rueckt auf den frei gewordenen Platz (Tausch)
    p[ziel] = id;
    return { ...alt, plaetze: p };
  });
  const nimmHeraus = (nr: number) => aendere((alt) => { const p = alt.plaetze.slice(); p[nr] = null; return { ...alt, plaetze: p }; });
  const setzeMvp = (id: string | null) => aendere((alt) => ({ ...alt, mvp: alt.mvp === id ? null : id }));
  const zuruecksetzen = () => { setZuruecknehmen(tipp); aendere((alt) => ({ ...alt, plaetze: alt.plaetze.map(() => null), mvp: null })); setResetFrage(false); setTimeout(() => setZuruecknehmen(null), 10_000); };
  const zurueck = () => { if (zuruecknehmen) { const alt = zuruecknehmen; aendere(() => alt); setZuruecknehmen(null); } };

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    const l = teams.filter((x) => !q || x.spieler.some((s) => `${s.anzeige} ${s.name}`.toLowerCase().includes(q)));
    return l.slice().sort((a, b) => {
      if (sortierung === 'name') return nameVon(a).localeCompare(nameVon(b));
      if (sortierung === 'land') return (a.spieler[0]?.land ?? 'zz').localeCompare(b.spieler[0]?.land ?? 'zz') || nameVon(a).localeCompare(nameVon(b));
      return (a.rang ?? 9999) - (b.rang ?? 9999) || nameVon(a).localeCompare(nameVon(b));
    });
  }, [teams, suche, sortierung]);

  /* ---------------------------------------------------------------- das Ergebnis, wenn es feststeht */
  const ergebnis = useMemo(() => {
    if (!wahl?.ende || Date.now() < wahl.ende || !gesetzt) return null;
    const echte = teams.filter((x) => x.rang);
    if (echte.length < teams.length * 0.8) return null;
    let genau = 0, nah = 0, abstand = 0, n = 0;
    tipp.plaetze.forEach((id, i) => {
      const tm = id ? teamVon.get(id) : null;
      if (!tm?.rang) return;
      const d = Math.abs(tm.rang - (i + 1));
      n += 1; abstand += d; if (d === 0) genau += 1; if (d <= 3) nah += 1;
    });
    return n ? { genau, nah, schnitt: abstand / n, n } : null;
  }, [wahl, teams, teamVon, tipp.plaetze, gesetzt]);

  const teilen = async () => {
    if (!wahl) return;
    const zeilen = tipp.plaetze.slice(0, 10).map((id, i) => `${i + 1}. ${id ? nameVon(teamVon.get(id)!) : '-'}`);
    const mvp = tipp.mvp ? spielerVon.get(tipp.mvp) : null;
    const text = [`My ${wahl.titel} ${regionAnzeige({ region: wahl.region })} prediction:`, '', ...zeilen, ...(tipp.plaetze.length > 10 ? ['…'] : []), '', mvp ? `MVP: ${mvp.anzeige || mvp.name}` : '', `Call the final yourself: ${window.location.origin}/predictions?finale=${encodeURIComponent(wahl.windowId)}&r=${encodeURIComponent(wahl.region)}`].filter((z, i, a) => z !== '' || (a[i - 1] !== '' && i < a.length - 1)).join('\n');
    try { await navigator.clipboard.writeText(text); setKopiert(true); setTimeout(() => setKopiert(false), 2500); } catch { window.prompt(t('Zum Kopieren:'), text); }
  };

  /* ---------------------------------------------------------------- Anzeige */
  if (liste === null) return <LadeSchirm />;

  const wahlListe = liste.map((e) => ({ e, name: `${e.titel}${e.saisonKurz ? ` · ${e.saisonKurz}` : ''}` }));
  const gleicheCupRegionen = wahl ? liste.filter((e) => e.turnierId === wahl.turnierId && e.fenster === wahl.fenster) : [];
  const stand = !wahl?.datum ? '' : Date.now() < wahl.datum ? 'kommt' : wahl.ende && Date.now() > wahl.ende ? 'vorbei' : 'live';
  const beginnText = wahl?.datum ? new Date(wahl.datum).toLocaleString(undefined, { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

  const teamzeile = (tm: SolosTeam) => {
    const nr = platz.get(tm.id);
    return (
      <div key={tm.id} draggable onDragStart={(e) => { drag.current = { art: 'liste', id: tm.id }; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', tm.id); } catch { /* manche Browser verlangen es */ } }}
        onDragEnd={() => { drag.current = null; setUeber(null); }}
        onClick={() => setze(tm.id)}
        title={nr ? `${t('Platz')} ${nr}` : t('Anklicken oder in die Reihenfolge ziehen')}
        className={`group flex cursor-grab items-center gap-2.5 rounded-xl border px-2 py-1.5 text-left transition active:cursor-grabbing ${nr ? 'border-zinc-800 bg-zinc-900/40 opacity-50 hover:opacity-80' : 'border-zinc-800 bg-zinc-900 hover:border-sky-500/60'}`}>
        <TeamFotos t={tm} px={36} />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-xs font-bold uppercase text-slate-100">{nameVon(tm)}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500"><Flaggen t={tm} />{tm.rang ? <span className="tabular-nums">#{tm.rang}</span> : null}</span>
        </span>
        {tm.spieler.map((s) => (
          <button key={s.id} type="button" onClick={(e) => { e.stopPropagation(); setzeMvp(s.id); }}
            title={tipp.mvp === s.id ? t('MVP entfernen') : `${t('Als MVP wählen')}: ${s.anzeige || s.name}`}
            className={`shrink-0 rounded-md p-1 text-sm leading-none transition ${tipp.mvp === s.id ? 'bg-amber-400 text-zinc-950' : 'text-slate-600 hover:bg-zinc-800 hover:text-amber-300'}`}>★</button>
        ))}
        {nr ? <span className="shrink-0 rounded-md bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums text-sky-300">#{nr}</span> : null}
      </div>
    );
  };

  const slot = (i: number) => {
    const id = tipp.plaetze[i];
    const tm = id ? teamVon.get(id) : null;
    const echt = tm?.rang && ergebnis ? tm.rang : null;
    return (
      <div key={i} onDragOver={(e) => { e.preventDefault(); if (ueber !== i) setUeber(i); }} onDragLeave={() => setUeber((u) => (u === i ? null : u))}
        onDrop={(e) => { e.preventDefault(); const d = drag.current; drag.current = null; setUeber(null); if (d) setze(d.id, i); }}
        className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 transition ${ueber === i ? 'border-sky-400 bg-sky-500/10' : tm ? 'border-zinc-700 bg-zinc-900' : 'border-dashed border-zinc-800 bg-zinc-950/40'}`}>
        <span className={`grid h-7 w-8 shrink-0 place-items-center rounded-md text-[11px] font-extrabold tabular-nums ${i < 3 ? MEDAILLE[i] : 'bg-zinc-800 text-slate-400'}`}>{i + 1}</span>
        {tm ? (
          <div draggable onDragStart={(e) => { drag.current = { art: 'slot', id: tm.id, von: i }; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', tm.id); } catch { /* s. o. */ } }}
            onDragEnd={() => { drag.current = null; setUeber(null); }}
            className="flex min-w-0 flex-1 cursor-grab items-center gap-2 active:cursor-grabbing">
            <TeamFotos t={tm} px={30} />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-xs font-bold uppercase text-slate-100">{nameVon(tm)}</span>
              <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500"><Flaggen t={tm} />
                {echt ? <span className={`tabular-nums font-semibold ${echt === i + 1 ? 'text-emerald-400' : Math.abs(echt - (i + 1)) <= 3 ? 'text-sky-300' : 'text-slate-400'}`}>{t('war')} #{echt}</span> : null}
              </span>
            </span>
            {tm.spieler.some((s) => s.id === tipp.mvp) && <span title="MVP" className="rounded-md bg-amber-400 px-1.5 py-0.5 text-[10px] font-extrabold text-zinc-950">MVP</span>}
            <button type="button" onClick={() => nimmHeraus(i)} aria-label={t('Aus der Reihenfolge nehmen')} className="shrink-0 rounded-md px-1.5 text-slate-600 transition hover:bg-rose-950 hover:text-rose-300">×</button>
          </div>
        ) : <span className="flex-1 text-[11px] text-slate-600"><T>Spieler hierher ziehen oder anklicken</T></span>}
      </div>
    );
  };

  const mvpSpieler = tipp.mvp ? spielerVon.get(tipp.mvp) ?? null : null;
  const reiterKnopf = (k: 'spieler' | 'karte' | 'tipp', titel: string) => (
    <button key={k} type="button" onClick={() => setBereich(k)} className={`rounded-full px-4 py-2 text-sm font-bold transition ${bereich === k ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-slate-100'}`}>{titel}</button>
  );

  return (
    <main className="min-h-screen bg-zinc-950 text-slate-100">
      <div className="mx-auto max-w-[1700px] space-y-4 px-4 pb-10 sm:px-6">
        <SeitenKopf className="mt-4" marke={<T>Call the Final</T>} titel={wahl ? <>{wahl.titel} <span className="text-sky-500">{regionAnzeige({ region: wahl.region })}</span></> : <T>Predictions</T>}
          text={<T>Tippe das Finale: ziehe die Spieler in deine Reihenfolge, wähle deinen MVP und sieh dir daneben die Landepunkte auf der Karte an.</T>}
          rechts={liste.length > 0 ? (
            <select value={wahl ? `${wahl.windowId}|${wahl.region}` : ''} onChange={(e) => { const [w, r] = e.target.value.split('|'); setWahl(liste.find((x) => x.windowId === w && x.region === r) ?? null); setSuche(''); }}
              className="max-w-[18rem] rounded-full border border-zinc-700 bg-zinc-950/60 px-4 py-2 text-sm text-slate-200 outline-none focus:border-sky-500">
              {wahlListe.map(({ e, name }) => <option key={`${e.windowId}|${e.region}`} value={`${e.windowId}|${e.region}`}>{name} · {regionAnzeige({ region: e.region })}</option>)}
            </select>
          ) : undefined} />

        {!liste.length ? (
          <p className="rounded-2xl border border-zinc-800 bg-zinc-900 px-6 py-12 text-center text-sm text-slate-400">{fehler || <T>Gerade steht kein Finale an, das sich tippen lässt. Sobald Epic das nächste Feld veröffentlicht, erscheint es hier.</T>}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {gleicheCupRegionen.length > 1 && gleicheCupRegionen.map((e) => (
                <button key={e.region} type="button" onClick={() => { setWahl(e); setSuche(''); }}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${wahl?.region === e.region ? 'border-sky-500 bg-sky-500 text-white' : 'border-zinc-800 bg-zinc-900 text-slate-400 hover:border-sky-500/50'}`}>{regionAnzeige({ region: e.region })}</button>
              ))}
              {stand && (
                <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${stand === 'live' ? 'bg-sky-500 text-white' : 'border border-zinc-700 text-slate-400'}`}>
                  {stand === 'live' ? <T>Läuft gerade</T> : stand === 'kommt' ? <>{t('Start')}: {beginnText}</> : <T>Beendet</T>}
                </span>
              )}
              {anzahl > 0 && <span className="text-xs text-slate-500">{anzahl} <T>Plätze</T> · <span className="font-semibold text-slate-300">{gesetzt}</span>/{anzahl} <T>getippt</T></span>}
              <span className="ml-auto text-[11px] text-slate-600">{gespeichert === 'konto' ? t('Im Konto gespeichert') : gespeichert === 'lokal' ? (zugang.nutzer ? t('Gespeichert …') : t('Im Browser gespeichert - mit einem Konto auch auf anderen Geräten')) : ''}</span>
            </div>

            {laedtFeld && <LadeSchirm />}
            {feldFehler && !laedtFeld && <p className="rounded-2xl border border-zinc-800 bg-zinc-900 px-6 py-10 text-center text-sm text-slate-400">{feldFehler}</p>}
            {!laedtFeld && !feldFehler && fenster && anzahl === 0 && (
              <p className="rounded-2xl border border-zinc-800 bg-zinc-900 px-6 py-10 text-center text-sm text-slate-400"><T>Das Feld dieses Finales steht noch nicht fest - es füllt sich, sobald die Qualifikation durch ist.</T></p>
            )}

            {anzahl > 0 && (
              <>
                {/* Auf schmalen Schirmen ein Bereich nach dem anderen. */}
                <div className="flex gap-1 self-start rounded-full border border-zinc-800 bg-zinc-900 p-1 xl:hidden">
                  {reiterKnopf('tipp', t('Dein Tipp'))}{reiterKnopf('spieler', t('Spieler'))}{reiterKnopf('karte', t('Karte'))}
                </div>

                <div className="grid items-start gap-4 xl:grid-cols-[340px_minmax(0,1fr)_380px]">
                  {/* Links: die Spieler */}
                  <section className={`${bereich === 'spieler' ? 'block' : 'hidden'} xl:block`}>
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3 xl:sticky xl:top-3">
                      <div className="flex items-center gap-2">
                        <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={t('Spieler suchen …')} spellCheck={false}
                          className="min-w-0 flex-1 rounded-full border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500" />
                        <select value={sortierung} onChange={(e) => setSortierung(e.target.value as typeof sortierung)} aria-label={t('Sortierung')}
                          className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-slate-300 outline-none focus:border-sky-500">
                          <option value="rang">{t('Nach Platz')}</option><option value="name">A–Z</option><option value="land">{t('Nach Land')}</option>
                        </select>
                      </div>
                      <div className="mt-3 max-h-[75vh] space-y-1.5 overflow-y-auto pr-1">
                        {gefiltert.map((tm) => teamzeile(tm))}
                        {!gefiltert.length && <p className="py-6 text-center text-xs text-slate-500"><T>Niemand gefunden.</T></p>}
                      </div>
                    </div>
                  </section>

                  {/* Mitte: die Karte */}
                  <section className={`${bereich === 'karte' ? 'block' : 'hidden'} min-w-0 xl:block`}>
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
                      {fenster && fenster.formen.length > 0
                        ? <Karte f={fenster} bild={fenster.bild} rotAb={teams.some((x) => x.spieler.length > 1) ? 3 : 2} />
                        : <p className="px-4 py-16 text-center text-sm text-slate-500"><T>Zu diesem Finale gibt es noch keine Landepunkte - du kannst trotzdem schon tippen.</T></p>}
                    </div>
                  </section>

                  {/* Rechts: dein Tipp */}
                  <section className={`${bereich === 'tipp' ? 'block' : 'hidden'} xl:block`}>
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3 xl:sticky xl:top-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <h2 className="text-sm font-extrabold uppercase tracking-[0.14em] text-sky-400"><T>Dein Tipp</T></h2>
                        <div className="flex items-center gap-1.5">
                          <button type="button" onClick={() => void teilen()} disabled={!gesetzt}
                            className="rounded-full border border-zinc-700 px-3 py-1 text-[11px] font-bold text-slate-300 transition hover:border-sky-500 hover:text-sky-300 disabled:opacity-40">{kopiert ? t('Kopiert') : t('Teilen')}</button>
                          {!resetFrage
                            ? <button type="button" onClick={() => setResetFrage(true)} disabled={!gesetzt && !tipp.mvp} className="rounded-full border border-zinc-700 px-3 py-1 text-[11px] font-bold text-slate-400 transition hover:border-rose-500/60 hover:text-rose-300 disabled:opacity-40">Reset</button>
                            : <span className="flex items-center gap-1 text-[11px]"><span className="text-slate-400"><T>Alles leeren?</T></span>
                                <button type="button" onClick={zuruecksetzen} className="rounded-full bg-rose-600 px-2.5 py-1 font-bold text-white"><T>Ja</T></button>
                                <button type="button" onClick={() => setResetFrage(false)} className="rounded-full border border-zinc-700 px-2.5 py-1 font-bold text-slate-300"><T>Nein</T></button></span>}
                        </div>
                      </div>
                      {zuruecknehmen && <button type="button" onClick={zurueck} className="mb-2 w-full rounded-lg border border-sky-500/50 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:bg-sky-500/10"><T>Rückgängig machen</T></button>}

                      <div className={`mb-2 flex items-center gap-2 rounded-xl border px-2 py-1.5 ${mvpSpieler ? 'border-amber-400/60 bg-amber-400/10' : 'border-dashed border-zinc-700'}`}>
                        <span className="grid h-7 w-10 shrink-0 place-items-center rounded-md bg-amber-400 text-[11px] font-extrabold text-zinc-950">MVP</span>
                        {mvpSpieler ? (
                          <>
                            <Foto s={mvpSpieler} px={30} />
                            <span className="min-w-0 flex-1 truncate text-xs font-bold uppercase text-slate-100">{mvpSpieler.anzeige || mvpSpieler.name}</span>
                            <TeamFlagge groesse={14} laender={[mvpSpieler.land ?? undefined]} />
                            <button type="button" onClick={() => setzeMvp(null)} aria-label={t('MVP entfernen')} className="rounded-md px-1.5 text-slate-500 hover:bg-rose-950 hover:text-rose-300">×</button>
                          </>
                        ) : <span className="text-[11px] text-slate-500"><T>Wähle links mit dem Stern, wer dein MVP ist.</T></span>}
                      </div>

                      {ergebnis && (
                        <p className="mb-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-200">
                          <T>Ergebnis</T>: <b>{ergebnis.genau}</b> <T>genau richtig</T>, <b>{ergebnis.nah}</b> <T>höchstens drei Plätze daneben</T> · Ø <b>{ergebnis.schnitt.toFixed(1)}</b> <T>Plätze Abstand</T>
                        </p>
                      )}

                      <div className="max-h-[70vh] space-y-1 overflow-y-auto pr-1">
                        {Array.from({ length: anzahl }, (_, i) => slot(i))}
                      </div>
                    </div>
                  </section>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
