import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bild, Leer, Marke, MedienKarte, SeitenKopf, Zaehler } from '../../../../ds/Bausteine';
import { useWer } from '../../../../teile/Anmeldung';
import KartenAnsicht, { kartenName, type KartenForm, type Punkt } from '../KartenAnsicht';
import KartenWerkzeug from '../zeichnen/KartenWerkzeug';
import { Dock, KopfBand, Werkbank } from '../Werkbank';
import { FehlerZeile, Laedt, SEITE, TeamFlagge, datumLang, useDaten } from '../teile';
import { RegionMarke } from './Maps';

/*
 * Die veroeffentlichten Turnierkarten (/maps der Seite, Ansicht fuer alle): ohne ?id die Liste (/api/turnier-karten?liste=1), mit ?id die Karte
 * (/api/turnier-karten?id=) samt Teamliste. Der Stand wandert mit (?nur=stand&seit= alle 20 s), wie auf der Seite. Bearbeitet wird im
 * Karten-Werkzeug - im Hub nachgebaut (../zeichnen/KartenWerkzeug, ?edit=1): der Admin bekommt dafuer einen Knopf, ebenso ein Pro, dessen Team auf
 * der Karte steht ("Move my team"). Ohne ?id, aber mit ?edit=1 (oder ?event=&window=) oeffnet der Admin eine neue Karte.
 * Aufbau (Design-System 3.0): Liste = Buehne mit der neuesten Karte gross, darunter alle als Bildkarten mit Belegungs-Balken. Karte = Werkbank:
 * links die Teams (Klick fliegt zum Landepunkt), Mitte die Karte ueber die ganze Hoehe, rechts die belegten Stellen (umkaempfte zuerst).
 */

interface Spot { id: string; punkte: Punkt[]; teams: string[]; name?: string; farbe?: string | null }
interface Team { id: string; spieler: string[]; ids?: string[]; farbe?: string; laender?: Array<string | null> }
interface Karte { id: string; titel: string; cupTitel?: string; region?: string; windowId?: string; bildId?: string; bildTitel?: string; spots: Spot[]; teams: Team[]; geaendert: number; gesperrt?: boolean; spiele?: string; ersatz?: boolean }
interface ListenKarte { id: string; titel: string; cupTitel?: string; region: string | null; windowId: string | null; bildTitel?: string; teams: number; platziert: number; geaendert: number; datum: number | null; bild: string | null }

const titelSauber = (t: string) => t.replace(/\s*·\s*/g, ' – ');

/** Wie viele Teams schon auf der Karte stehen - als feiner Balken. */
function Belegung({ platziert, teams }: { platziert: number; teams: number }) {
  const voll = teams > 0 && platziert >= teams;
  return (
    <div className="mt-2.5 flex items-center gap-2.5">
      <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.07]"><span className={`block h-full rounded-full ${voll ? 'bg-emerald-400' : 'bg-akz'}`} style={{ width: `${teams ? Math.min(100, (platziert / teams) * 100) : 0}%` }} /></span>
      <span className="zahl text-[11px] font-semibold text-white/50">{platziert}/{teams} placed</span>
    </div>
  );
}

function Liste() {
  const { wer } = useWer();
  const [s] = useDaten<{ karten: ListenKarte[] }>('/api/turnier-karten?liste=1');
  const [q, setQ] = useState('');
  const alle = s.art === 'ok' ? s.d.karten : [];
  const karten = alle.filter((k) => !q || `${k.titel} ${k.cupTitel ?? ''} ${k.region ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  const [erste, ...rest] = karten;
  return (
    <div>
      <SeitenKopf ueber="Maps · live" titel="Tournament maps" text="Every published drop map — live, as the admins place the teams."
        rechts={<>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a map …" className="eingabe w-full sm:w-64" />
          {wer?.isAdmin && <Link to="/competitive/maps/view?edit=1" className="knopf-prim !bg-amber-400">Open the map tool</Link>}
          <Link to="/competitive/maps" className="knopf">All cup maps</Link>
          <a href={`${SEITE}/tournament-maps`} target="_blank" rel="noreferrer" className="knopf-leer !text-xs !text-white/45 hover:!text-white">Classic view ↗</a>
        </>} />
      {s.art === 'laedt' && <Laedt />}
      {s.art !== 'ok' && s.art !== 'laedt' && <FehlerZeile text="The tournament maps could not be loaded." />}
      {s.art === 'ok' && !karten.length && <Leer text={alle.length ? 'No map matches the search.' : 'No tournament map has been published yet.'} />}
      {erste && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          {/* Die neueste Karte gross */}
          <Link to={`/competitive/maps/view?id=${encodeURIComponent(erste.id)}`} className="fl-fest fl-klick group relative isolate flex min-h-[300px] flex-col justify-end overflow-hidden p-6 lg:min-h-[380px]">
            <Bild src={erste.bild} className="absolute inset-0 -z-10 h-full w-full transition duration-700 group-hover:scale-[1.04]" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-t from-fl via-fl/60 to-transparent" />
            <div className="absolute left-5 top-5 flex gap-1.5"><Marke ton="akz">Latest map</Marke>{erste.region && <RegionMarke r={erste.region} />}</div>
            <p className="ueber">{erste.cupTitel || erste.bildTitel || 'Tournament map'}</p>
            <h2 className="titel mt-1 text-4xl sm:text-5xl">{titelSauber(erste.titel)}</h2>
            <p className="zahl mt-1 text-sm text-white/55">{[erste.bildTitel, erste.datum ? datumLang(erste.datum) : ''].filter(Boolean).join(' · ')}</p>
            <div className="max-w-md"><Belegung platziert={erste.platziert} teams={erste.teams} /></div>
          </Link>
          {/* Zahlen und die naechsten zwei */}
          <div className="grid content-start gap-4">
            <div className="fl-fest grid grid-cols-3 divide-x divide-white/[0.06] py-5 text-center">
              {([['Maps', alle.length], ['Teams placed', alle.reduce((n, k) => n + k.platziert, 0)], ['Complete', alle.filter((k) => k.teams > 0 && k.platziert >= k.teams).length]] as Array<[string, number]>).map(([l, v]) => (
                <div key={l}><Zaehler wert={v} className="titel text-5xl !text-akz" /><p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/45">{l}</p></div>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {rest.slice(0, 2).map((k, i) => <KartenKachel key={k.id} k={k} i={i} />)}
            </div>
          </div>
        </div>
      )}
      {rest.length > 2 && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
          {rest.slice(2).map((k, i) => <KartenKachel key={k.id} k={k} i={i} />)}
        </div>
      )}
    </div>
  );
}

function KartenKachel({ k, i }: { k: ListenKarte; i: number }) {
  return (
    <MedienKarte verz={Math.min(i, 10) * 0.03} bild={k.bild} zu={`/competitive/maps/view?id=${encodeURIComponent(k.id)}`} titel={titelSauber(k.titel)}
      unter={<span className="zahl">{[k.bildTitel, k.datum ? datumLang(k.datum) : ''].filter(Boolean).join(' · ')}</span>} ecke={k.region ? <RegionMarke r={k.region} /> : undefined}>
      <Belegung platziert={k.platziert} teams={k.teams} />
    </MedienKarte>
  );
}

export default function TurnierKarte() {
  const [adresse] = useSearchParams();
  if (adresse.get('edit') === '1' || (!adresse.get('id') && adresse.get('event') && adresse.get('window'))) return <KartenWerkzeug key={adresse.toString()} />;
  return <Ansicht />;
}

function Ansicht() {
  const [adresse] = useSearchParams();
  const id = adresse.get('id');
  const { wer } = useWer();
  const [k, setK] = useState<Karte | null>(null);
  const [fehler, setFehler] = useState('');

  useEffect(() => {
    if (!id) return undefined;
    let weg = false; let seit = 0;
    setK(null); setFehler('');
    fetch(`/api/turnier-karten?id=${encodeURIComponent(id)}`, { cache: 'no-store' }).then(async (r) => {
      const j = await r.json().catch(() => null);
      if (weg) return;
      if (!r.ok || !j?.spots) { setFehler(j?.error || 'Unknown map.'); return; }
      seit = j.geaendert ?? 0; setK(j);
    }).catch(() => { if (!weg) setFehler('The map could not be loaded.'); });
    // Der Stand wandert mit: nur, wenn sich etwas geaendert hat, kommt die ganze Belegung.
    const i = setInterval(() => {
      if (document.visibilityState !== 'visible' || !seit) return;
      fetch(`/api/turnier-karten?id=${encodeURIComponent(id)}&nur=stand&seit=${seit}`, { cache: 'no-store' }).then((r) => r.json()).then((j) => {
        if (weg || !j || j.unveraendert || !j.spots) return;
        seit = j.geaendert ?? seit;
        setK((alt) => (alt ? { ...alt, ...j } : alt));
      }).catch(() => { /* naechster Takt */ });
    }, 20_000);
    return () => { weg = true; clearInterval(i); };
  }, [id]);

  const teamNach = useMemo(() => new Map((k?.teams ?? []).map((t) => [t.id, t])), [k]);
  const formen = useMemo<KartenForm[]>(() => (k?.spots ?? []).map((sp) => {
    const ts = sp.teams.map((t) => teamNach.get(t)).filter((t): t is Team => Boolean(t));
    const zeilen = ts.length > 1 ? ts.map((t) => t.spieler.join(' ')) : ts.flatMap((t) => t.spieler);
    return { punkte: sp.punkte, zeilen, teams: ts.length, farbe: sp.farbe, alle: ts.flatMap((t) => t.spieler), name: sp.name };
  }), [k, teamNach]);
  const spotVon = useMemo(() => {
    const m = new Map<string, string>();
    for (const sp of k?.spots ?? []) for (const t of sp.teams) m.set(t, sp.name?.trim() || '');
    return m;
  }, [k]);
  const solo = (k?.teams ?? []).every((t) => t.spieler.length <= 1);
  const meinTeam = wer?.epicId ? (k?.teams ?? []).find((t) => (t.ids ?? []).includes(wer.epicId!)) : undefined;

  const [q, setQ] = useState('');
  const [zeige, setZeige] = useState<{ namen: string[]; n: number } | null>(null);
  const springe = (namen: string[]) => setZeige((alt) => ({ namen, n: (alt?.n ?? 0) + 1 }));

  if (!id) return <Liste />;
  if (fehler) return <FehlerZeile text={fehler} />;
  if (!k) return <Laedt text="Loading the map …" />;
  const teams = (k.teams ?? []).filter((t) => !q || t.spieler.some((s) => s.toLowerCase().includes(q.toLowerCase())));
  const bild = k.bildId ? `/bilder/karten/${encodeURIComponent(k.bildId)}.png` : null;
  const belegt = k.spots.filter((s) => s.teams.length).sort((a, b) => b.teams.length - a.teams.length);
  const platziert = (k.teams ?? []).filter((t) => spotVon.has(t.id)).length;

  return (
    <div className="-mt-2 space-y-3">
      <KopfBand zurueck="/competitive/maps/view" zurueckTitel="Tournament maps" ueber={k.cupTitel || 'Tournament map'} titel={k.titel.replace(/\s*·\s*/g, ' – ')}
        marken={<>
          {k.region && <RegionMarke r={k.region} />}
          {k.bildTitel && <Marke>{k.bildTitel}</Marke>}
          {k.spiele && <Marke>Games {k.spiele}</Marke>}
          <Marke><span className="zahl">{belegt.length}</span> spots · <span className="zahl">{k.teams.length}</span> {solo ? 'players' : 'teams'}</Marke>
          {k.gesperrt && <Marke ton="gold">Locked</Marke>}
          <Marke ton="gruen" puls>Updates live</Marke>
        </>}
        rechts={<>
          {(wer?.isAdmin || (meinTeam && (wer?.rolle === 'pro' || wer?.rolle === 'manager'))) && (
            <Link to={`/competitive/maps/view?id=${encodeURIComponent(k.id)}&edit=1`} className="knopf-prim !bg-amber-400">{wer?.isAdmin ? 'Edit in the map tool' : 'Move my team'}</Link>
          )}
          <a href={`${SEITE}/maps?id=${encodeURIComponent(k.id)}`} target="_blank" rel="noreferrer" className="knopf-leer !text-xs !text-white/45 hover:!text-white">Classic view ↗</a>
        </>} />
      {k.ersatz && <FehlerZeile text="This is the last saved copy — the live store is not answering right now." />}
      <Werkbank
        links={(
          <Dock titel={solo ? 'Players' : 'Teams'} zahl={`${platziert}/${k.teams.length} placed`}
            kopf={<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a player …" className="eingabe w-full !py-2 !text-[13px]" />}
            fuss="Click a team to fly to its drop spot.">
            <ul>
              {teams.map((t) => {
                const drauf = spotVon.has(t.id);
                return (
                  <li key={t.id}>
                    <button type="button" disabled={!drauf} onClick={() => springe(t.spieler)} title={drauf ? 'Show on the map' : undefined}
                      className={`flex w-full items-center gap-3 border-b border-white/[0.05] px-3 py-2 text-left transition ${t === meinTeam ? 'bg-akz/10' : ''} ${drauf ? 'hover:bg-akz/[0.08]' : ''}`}>
                      <TeamFlagge groesse={t.spieler.length > 1 ? 26 : 20} laender={t.laender ?? t.spieler.map(() => null)} />
                      <span className="flex min-w-0 flex-1 flex-col text-[11px] font-bold uppercase leading-[1.3] tracking-wide text-white">{t.spieler.map((s, i) => <span key={i} className="truncate">{kartenName(s)}</span>)}</span>
                      {t === meinTeam && <Marke ton="akz">You</Marke>}
                      <span className="max-w-[40%] truncate text-right text-[11px] text-white/45">{drauf ? (spotVon.get(t.id) || 'placed') : <span className="text-white/25">not placed</span>}</span>
                    </button>
                  </li>
                );
              })}
              {!teams.length && <li className="px-4 py-6 text-center text-sm text-white/45">{k.teams.length ? 'No player found.' : 'No teams yet.'}</li>}
            </ul>
          </Dock>
        )}
        rechts={(
          <Dock titel="Spots" zahl={`${belegt.filter((s) => s.teams.length > 1).length} contested`} fuss="Wheel zooms, drag moves, double-click zooms in, Ctrl + F searches.">
            <ul>
              {belegt.map((sp) => {
                const ts = sp.teams.map((t) => teamNach.get(t)).filter((t): t is Team => Boolean(t));
                return (
                  <li key={sp.id}>
                    <button type="button" onClick={() => springe(ts.flatMap((t) => t.spieler))} className={`flex w-full items-start gap-3 border-b border-white/[0.05] px-3 py-2.5 text-left transition ${ts.length > 1 ? 'hover:bg-red-500/[0.08]' : 'hover:bg-akz/[0.08]'}`}>
                      <span className={`titel w-7 shrink-0 text-center text-3xl ${ts.length > 1 ? '!text-red-400' : '!text-white/30'}`}>{ts.length}</span>
                      <span className="min-w-0 flex-1">
                        {sp.name?.trim() && <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">{sp.name}</span>}
                        {ts.map((t) => <span key={t.id} className="block truncate text-[11px] font-bold uppercase tracking-wide text-white">{t.spieler.map(kartenName).join(' · ')}</span>)}
                      </span>
                    </button>
                  </li>
                );
              })}
              {!belegt.length && <li className="px-4 py-6 text-center text-sm text-white/45">No team is placed yet.</li>}
            </ul>
          </Dock>
        )}>
        <KartenAnsicht formen={formen} bild={bild} rotAb={2} deckel="none" zeige={zeige} titel={k.titel} />
      </Werkbank>
    </div>
  );
}
