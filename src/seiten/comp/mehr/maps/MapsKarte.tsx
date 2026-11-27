import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bild, Flaeche, Marke, Segment } from '../../../../ds/Bausteine';
import { useWer } from '../../../../teile/Anmeldung';
import KartenAnsicht, { type KartenForm, type Punkt } from '../KartenAnsicht';
import { Dock, Werkbank } from '../Werkbank';
import { FehlerZeile, LaenderListe, Laedt, Reiter, TeamFlagge, TeamFotos, datumKurz, datumLang, flaggenPfad, landName } from '../teile';
import { type MapEintrag, RegionMarke, StandMarke, regionAnzeige } from './Maps';
import KartenUpdateWahl from './KartenUpdateWahl';
import SpielerDetail from './SpielerDetail';
import { CupTierlist, Platzierungen, RangAusTeams, RangTabelle, TeamKarten, type MSpieler, type MTeam, type PlatzZeile } from './Mannschaften';

/*
 * Die Seite eines Cups in Maps (wie /tournament-maps/karte). Aufbau (Design-System 3.0): ein schmales Kopfband (Cup-Bild, Titel, Marken, die
 * Ansichten als Umschalter, alle Spieltage als Chips) - darunter fuellt die Werkbank den Bildschirm: links angedockt die Bestenliste, in der Mitte
 * die Karte, rechts "On the map" (Teams mit Fotos - Klick springt auf der Karte zu ihrem Landepunkt - und die umkaempften Stellen).
 * Weitere Ansichten: Teams, Leaderboard, Tierlist, Nationalities; bei Finals an zwei Tagen Day 1 / Day 2 / Combined. Karte von /api/maps-karte,
 * gewaehltes Kartenbild von /api/maps-bild (Admin kann es aendern, auch fuer die ganze Saison - aus der Auswahl oder jeder Update-Karte,
 * KartenUpdateWahl), Replays-Knopf wenn /api/replay?tag= etwas hat. Klick auf eine Zeile der Epic-Rangliste oeffnet den Match-Verlauf (SpielerDetail).
 */

interface Fenster {
  windowId: string; name: string; start: string | null; end: string | null; bild: string | null; quelle?: string;
  spieler: MSpieler[]; teams: MTeam[];
  formen: Array<{ punkte: Punkt[]; spieler: string[]; teams?: number; gruppen?: string[][] }>;
}
type ReiterK = 'karte' | 'spieler' | 'leaderboard' | 'tierlist' | 'laender';

function zustand(e: { datum: number | null; ende: number | null } | null, f: Fenster | null): 'ended' | 'live' | 'upcoming' | null {
  const beginn = e?.datum ?? (f?.start ? Date.parse(f.start) : null);
  const ende = e?.ende ?? (f?.end ? Date.parse(f.end) : null);
  const jetzt = Date.now();
  if (!beginn) return null;
  if (jetzt < beginn) return 'upcoming';
  if (ende && jetzt > ende) return 'ended';
  if (!ende) return jetzt - beginn > 12 * 3600_000 ? 'ended' : 'live';
  return 'live';
}

/** Die Formen der Quelle in die Form der Kartenansicht: ein Team -> jeder Spieler eine Zeile, mehrere -> eine Zeile je Team. */
export function formenVon(formen: Fenster['formen']): KartenForm[] {
  return formen.map((fo) => {
    const teams = fo.teams ?? fo.spieler.length;
    const zeilen = teams > 1 && fo.gruppen?.length ? fo.gruppen.filter((g) => g.length).map((g) => g.join(' ')) : fo.spieler;
    return { punkte: fo.punkte, zeilen, teams, alle: fo.spieler };
  });
}

export default function MapsKarte() {
  const { wer } = useWer();
  const [adresse, setAdresse] = useSearchParams();
  const params = useMemo(() => {
    const [t, r, w] = [adresse.get('t') ?? '', adresse.get('r') ?? '', adresse.get('w') ?? ''];
    return t && r && w ? { t, r, w } : null;
  }, [adresse]);
  const [fenster, setFenster] = useState<Fenster | null>(null);
  const [tag, setTag] = useState('gesamt');
  const [tage, setTage] = useState<Array<{ name: string; windowId: string }>>([]);
  const [platzierungen, setPlatzierungen] = useState<PlatzZeile[]>([]);
  const [hatReplays, setHatReplays] = useState(false);
  const [liste, setListe] = useState<MapEintrag[]>([]);
  const [fehler, setFehler] = useState('');
  const [reiter, setReiter] = useState<ReiterK>('karte');
  const [wahlBild, setWahlBild] = useState<string | null>(null);
  const [auswahl, setAuswahl] = useState<Array<{ u: string; titel: string }>>([]);
  const [speichert, setSpeichert] = useState(false);
  const [bilderOffen, setBilderOffen] = useState(false);
  const [fuerSaison, setFuerSaison] = useState(false);
  const [panel, setPanel] = useState<{ id: string; name: string } | null>(null);
  const [zeige, setZeige] = useState<{ namen: string[]; n: number } | null>(null);
  const [dock, setDock] = useState<'teams' | 'heiss'>('teams');
  const [teamSuche, setTeamSuche] = useState('');
  useEffect(() => {
    if (!panel) return undefined;
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') setPanel(null); };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [panel]);

  useEffect(() => { setFenster(null); setFehler(''); setTag('gesamt'); setTage([]); setPlatzierungen([]); }, [params]);

  useEffect(() => {
    if (!params) return undefined;
    let weg = false;
    fetch(`/api/maps-karte?t=${encodeURIComponent(params.t)}&r=${encodeURIComponent(params.r)}&w=${encodeURIComponent(params.w)}&tag=${encodeURIComponent(tag)}`, { cache: 'no-store' })
      .then((x) => x.json())
      .then((j) => { if (weg) return; if (j?.ok) { setFenster(j.fenster); setTage(j.tage ?? []); setPlatzierungen(j.platzierungen ?? []); } else setFehler(j?.error || 'The map could not be loaded.'); })
      .catch(() => { if (!weg) setFehler('The map could not be loaded.'); });
    return () => { weg = true; };
  }, [params, tag]);

  useEffect(() => {
    if (!params) return undefined;
    let weg = false;
    fetch(`/api/maps-bild?w=${encodeURIComponent(params.w)}`, { cache: 'no-store' }).then((x) => x.json())
      .then((j) => { if (!weg && j?.ok) { setWahlBild(j.u ?? null); setAuswahl(j.auswahl ?? []); } }).catch(() => { /* Bild der Spielversion */ });
    setHatReplays(false);
    fetch(`/api/replay?tag=${encodeURIComponent(params.w)}`).then((x) => { if (!weg && x.ok) setHatReplays(true); }).catch(() => { /* kein Knopf */ });
    return () => { weg = true; };
  }, [params]);

  useEffect(() => {
    let weg = false;
    fetch('/api/maps-liste').then((x) => x.json()).then((j) => { if (!weg && j?.ok) setListe(j.eintraege); }).catch(() => { /* ohne Kopf */ });
    return () => { weg = true; };
  }, []);

  const meta = useMemo(() => liste.find((e) => params && e.windowId === params.w && e.region === params.r) ?? null, [liste, params]);
  const wochen = useMemo(() => liste.filter((e) => meta && e.turnierId === meta.turnierId && e.region === meta.region)
    .sort((a, b) => (a.alt && b.alt ? 0 : (a.datum ?? 0) - (b.datum ?? 0)) || (a.reihe ?? 0) - (b.reihe ?? 0)), [liste, meta]);
  const laender = useMemo(() => new Map((fenster?.spieler ?? []).map((s) => [s.id, s.land])), [fenster]);
  const anzeigen = useMemo(() => new Map((fenster?.teams ?? []).flatMap((x) => x.spieler.map((s) => [s.id, s.anzeige] as const))), [fenster]);
  const bilder = useMemo(() => new Map([...(fenster?.spieler ?? []), ...(fenster?.teams ?? []).flatMap((x) => x.spieler)].map((s) => [s.id, s.bild])), [fenster]);
  const formen = useMemo(() => formenVon(fenster?.formen ?? []), [fenster]);
  const bild = wahlBild ?? fenster?.bild ?? null;
  const st = zustand(meta, fenster);
  const nurPlatzierungen = platzierungen.length > 0 && !(fenster?.teams ?? []).some((x) => x.rang != null) && !(!meta?.alt && meta?.eventId);
  const tageFenster = useMemo(() => {
    if (tage.length < 2) return [] as string[];
    const nr = Number(tag);
    return Number.isInteger(nr) && nr >= 1 && nr <= tage.length ? [tage[nr - 1].windowId] : tage.map((d) => d.windowId);
  }, [tage, tag]);
  const solo = (fenster?.teams ?? []).every((x) => x.spieler.length <= 1);

  /** Wer auf der Karte steht (Namen der Formen) - nur solche Teams lassen sich anspringen. */
  const aufKarte = useMemo(() => new Set((fenster?.formen ?? []).flatMap((fo) => fo.spieler.map((n) => n.toLowerCase()))), [fenster]);
  const teamListe = useMemo(() => {
    const ts = fenster?.teams ?? [];
    const hatRang = ts.some((x) => x.rang !== null);
    const q = teamSuche.trim().toLowerCase();
    return [...ts].sort((a, b) => (hatRang ? (a.rang ?? 9999) - (b.rang ?? 9999) : 0))
      .filter((x) => !q || x.spieler.some((s) => s.anzeige.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)));
  }, [fenster, teamSuche]);
  /** Stellen, an denen mehr als ein Team landet - die meisten zuerst. */
  const heiss = useMemo(() => (fenster?.formen ?? []).map((fo) => ({ teams: fo.teams ?? fo.spieler.length, gruppen: fo.gruppen?.filter((g) => g.length) ?? [], spieler: fo.spieler }))
    .filter((x) => x.teams > 1).sort((a, b) => b.teams - a.teams), [fenster]);
  const laenderGruppen = useMemo(() => {
    const m = new Map<string, MSpieler[]>();
    for (const s of new Map((fenster?.spieler ?? []).map((x) => [x.id, x])).values()) { const k = (s.land ?? '').toUpperCase(); m.set(k, [...(m.get(k) ?? []), s]); }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [fenster]);

  const bildSpeichern = useCallback(async (u: string) => {
    if (!params) return;
    setSpeichert(true);
    try {
      const ws = fuerSaison && meta?.saison ? liste.filter((e) => e.saison === meta.saison).map((e) => e.windowId) : [];
      const r = await fetch('/api/maps-bild', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ws.length ? { ws, u } : { w: params.w, u }) });
      const j = await r.json().catch(() => null);
      if (j?.ok) setWahlBild(j.u ?? null);
    } finally { setSpeichert(false); }
  }, [params, fuerSaison, liste, meta]);

  const rangliste = (schmal: boolean) => (nurPlatzierungen ? <Platzierungen zeilen={platzierungen} schmal={schmal} />
    : meta?.alt || !meta?.eventId || fenster?.quelle === 'hand' ? <RangAusTeams teams={fenster?.teams ?? []} schmal={schmal} />
      : <RangTabelle eventId={meta.eventId} windowId={tageFenster.length === 1 ? tageFenster[0] : (meta.epicFenster ?? fenster?.windowId ?? '')}
          windows={tageFenster.length > 1 ? tageFenster : undefined} laender={laender} anzeigen={anzeigen} bilder={bilder} schmal={schmal}
          aufKlick={tageFenster.length > 1 ? undefined : setPanel} />);

  if (!params) return <FehlerZeile text="This map is not specified." />;
  const region = meta ? regionAnzeige(meta) : params.r;
  const springe = (namen: string[]) => setZeige((alt) => ({ namen, n: (alt?.n ?? 0) + 1 }));
  const teamZahl = (fenster?.teams ?? []).length;

  return (
    <div className="-mt-2 space-y-3">
      {/* Kopfband: zurueck, Cup-Bild, Titel und Marken, rechts die Ansichten */}
      <motion.header initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="fl-fest flex flex-wrap items-center gap-x-4 gap-y-3 p-2.5 pr-4">
        <Link to={meta?.saison ? `/competitive/maps?saison=${meta.saison}` : '/competitive/maps'} title={`Back to ${meta?.saisonKurz || 'all maps'}`}
          className="grid h-[72px] w-10 shrink-0 place-items-center rounded-2xl border border-white/[0.07] bg-black/40 text-white/60 transition hover:border-akz/50 hover:text-white">
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5l-5 5 5 5" /></svg>
        </Link>
        {meta?.bild && <Bild src={meta.bild} className="hidden aspect-video h-[72px] shrink-0 rounded-2xl sm:block" />}
        <div className="min-w-0 flex-1 basis-[280px]">
          <p className="ueber truncate !tracking-[0.25em]">{[meta?.saisonKurz, meta?.saisonTitel && meta.saisonTitel !== meta.saisonKurz ? meta.saisonTitel : '', meta?.fenster, (fenster?.start || meta?.datum) ? datumLang(fenster?.start ?? (meta?.datum as number)) : ''].filter(Boolean).join(' · ') || 'Drop map'}</p>
          <h1 className="titel mt-0.5 truncate text-3xl sm:text-4xl">{meta?.cup || fenster?.name || 'Map'}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {st && <StandMarke s={st} />}
            {meta?.lan && <Marke ton="gold">LAN</Marke>}
            <RegionMarke r={region} />
            {teamZahl > 0 && <Marke><span className="zahl">{teamZahl}</span> {solo ? 'players' : 'teams'}</Marke>}
            {hatReplays && <Link to={`/competitive/replays?tag=${encodeURIComponent(params.w)}`} className="inline-flex items-center gap-1.5 rounded-full bg-akz px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#04050a] transition hover:brightness-110">▶ Replays</Link>}
          </div>
        </div>
        {fenster && (
          <div className="flex max-w-full flex-col items-end gap-1.5">
            <Reiter<ReiterK> wert={reiter} setze={setReiter} liste={[['karte', 'Drop spots'], ['spieler', solo ? 'Players' : 'Teams'], ['leaderboard', 'Leaderboard'], ['tierlist', 'Tierlist'], ['laender', 'Nationalities']]} />
            {tage.length > 1 && <Reiter wert={tag} setze={setTag} klein liste={[...tage.map((d, i) => [String(i + 1), d.name] as [string, string]), ['gesamt', 'Combined']]} />}
          </div>
        )}
      </motion.header>

      {/* Alle Spieltage dieses Cups */}
      {wochen.length > 1 && (
        <div className="ohne-leiste flex items-center gap-1.5 overflow-x-auto">
          <span className="mr-1 shrink-0 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">Match days</span>
          {wochen.map((w) => (
            <button key={w.windowId} type="button" onClick={() => setAdresse({ t: w.turnierId, r: w.region, w: w.windowId }, { replace: true })}
              className={`chip ${w.windowId === params.w ? 'chip-an' : ''}`}>
              {w.fenster}{w.datum ? <span className="zahl font-normal text-white/50">{datumKurz(w.datum)}</span> : null}
            </button>
          ))}
        </div>
      )}

      {fehler && !fenster && <FehlerZeile text={fehler} />}
      {!fenster && !fehler && <Laedt text="Loading the map …" />}

      {fenster && reiter === 'karte' && (
        <>
          {wer?.isAdmin && (
            <div className="fl-fest flex flex-wrap items-center gap-2 !rounded-2xl border-amber-400/20 px-3 py-2 text-xs">
              <Marke ton="gold">Admin</Marke>
              <a href={`/admin/alte-maps/bearbeiten?t=${encodeURIComponent(params.t)}&r=${encodeURIComponent(params.r)}&w=${encodeURIComponent(params.w)}`}
                className="rounded-lg bg-amber-400 px-3 py-1.5 font-bold text-[#04050a] transition hover:bg-amber-300">Edit this map</a>
              <button type="button" onClick={() => setBilderOffen((v) => !v)} className={`chip ${bilderOffen ? 'chip-an' : ''}`}>Choose map image</button>
              {wahlBild && <button type="button" disabled={speichert} onClick={() => void bildSpeichern('')} className="chip hover:!border-rose-400/60 hover:!text-rose-300">Game-version default</button>}
              <label className="ml-auto flex items-center gap-2 font-semibold text-white/55"><input type="checkbox" checked={fuerSaison} onChange={(e) => setFuerSaison(e.target.checked)} className="accent-amber-400" />Apply to every day of this season</label>
              {speichert && <span className="text-white/45">Saving …</span>}
              {bilderOffen && (
                <div className="mt-2 grid w-full grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-8 2xl:grid-cols-10">
                  {auswahl.map((a) => (
                    <button key={a.u} type="button" disabled={speichert} title={a.titel} onClick={() => { void bildSpeichern(a.u); setBilderOffen(false); }}
                      className={`overflow-hidden rounded-xl border bg-black/40 text-left transition ${wahlBild === a.u ? 'border-akz' : 'border-white/10 hover:border-akz/50'}`}>
                      <img src={encodeURI(a.u)} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                      <span className="block truncate px-1.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-white/50">{a.titel}</span>
                    </button>
                  ))}
                </div>
              )}
              {bilderOffen && <KartenUpdateWahl aktuell={wahlBild} vorgabe={meta?.saisonKurz} speichert={speichert} waehle={(u) => { void bildSpeichern(u); setBilderOffen(false); }} />}
            </div>
          )}
          <Werkbank
            links={<Dock titel="Leaderboard" rechts={<button type="button" onClick={() => setReiter('leaderboard')} className="knopf-leer !text-xs">Full table →</button>}>{rangliste(true)}</Dock>}
            rechts={(
              <Dock titel="On the map" zahl={`${formen.filter((f) => f.teams > 0).length} spots`}
                kopf={<div className="flex flex-wrap items-center gap-2">
                  <Segment id="maps-dock" klein wert={dock} onWahl={setDock} wahl={[{ k: 'teams', titel: solo ? 'Players' : 'Teams' }, { k: 'heiss', titel: <>Contested <span className="zahl opacity-60">{heiss.length}</span></> }]} />
                  {dock === 'teams' && <input value={teamSuche} onChange={(e) => setTeamSuche(e.target.value)} placeholder="Search …" className="eingabe min-w-0 flex-1 !px-3 !py-1.5 !text-xs" />}
                </div>}
                fuss="Click a team to fly to its drop spot. Wheel zooms, drag moves, Ctrl + F searches.">
                {dock === 'teams' ? (
                  <ul>
                    {teamListe.map((x, i) => {
                      const drauf = x.spieler.some((s) => aufKarte.has(s.name.toLowerCase()) || aufKarte.has(s.anzeige.toLowerCase()));
                      return (
                        <li key={x.id}>
                          <button type="button" disabled={!drauf} onClick={() => springe(x.spieler.flatMap((s) => [s.name, s.anzeige]))} title={drauf ? 'Show on the map' : 'No drop spot recorded'}
                            className={`flex w-full items-center gap-2.5 border-t border-white/[0.05] px-3 py-2 text-left transition ${drauf ? 'hover:bg-akz/[0.08]' : 'opacity-50'}`}>
                            <span className={`zahl w-6 shrink-0 text-xs font-black ${(x.rang ?? i + 1) <= 3 ? 'text-amber-300' : 'text-white/40'}`}>{x.rang ?? i + 1}</span>
                            <TeamFlagge groesse={x.spieler.length > 1 ? 26 : 20} laender={x.spieler.map((s) => s.land)} />
                            <span className="flex min-w-0 flex-1 flex-col text-[11px] font-bold uppercase leading-[1.3] tracking-wide text-white">{x.spieler.map((s) => <span key={s.id} className="truncate">{s.anzeige}</span>)}</span>
                            <TeamFotos klein spieler={x.spieler} />
                          </button>
                        </li>
                      );
                    })}
                    {!teamListe.length && <li className="px-4 py-6 text-center text-sm text-white/45">{teamZahl ? 'No player found.' : 'No teams for this day yet.'}</li>}
                  </ul>
                ) : (
                  <ul>
                    {heiss.map((h, i) => (
                      <li key={i}>
                        <button type="button" onClick={() => springe(h.spieler)} className="flex w-full items-start gap-3 border-t border-white/[0.05] px-3 py-2.5 text-left transition hover:bg-red-500/[0.08]">
                          <span className="titel w-8 shrink-0 text-center text-3xl !text-red-400">{h.teams}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">{solo ? 'players' : 'teams'} on one spot</span>
                            {(h.gruppen.length ? h.gruppen.map((g) => g.join(' · ')) : h.spieler).map((z, k) => <span key={k} className="block truncate text-[11px] font-bold uppercase tracking-wide text-white">{z}</span>)}
                          </span>
                        </button>
                      </li>
                    ))}
                    {!heiss.length && <li className="px-4 py-6 text-center text-sm text-white/45">Nobody shares a drop spot on this day.</li>}
                  </ul>
                )}
              </Dock>
            )}>
            <KartenAnsicht formen={formen} bild={bild} rotAb={2} deckel="none" zeige={zeige} titel={`${meta?.cup ?? 'map'} ${meta?.fenster ?? ''}`} />
          </Werkbank>
        </>
      )}

      {fenster && reiter === 'spieler' && <TeamKarten teams={fenster.teams ?? []} />}
      {fenster && reiter === 'leaderboard' && (
        <Flaeche fest className="overflow-x-auto">{rangliste(false)}</Flaeche>
      )}
      {fenster && reiter === 'tierlist' && <CupTierlist windowId={fenster.windowId} teams={fenster.teams ?? []} />}
      {fenster && reiter === 'laender' && (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-start">
          <Flaeche fest className="p-5 lg:sticky lg:top-[7.5rem]">
            <p className="ueber">{laenderGruppen.length} countries</p>
            <h2 className="titel mb-4 mt-1 text-3xl">Players by country</h2>
            <LaenderListe spieler={[...new Map(fenster.spieler.map((s) => [s.id, s])).values()]} />
          </Flaeche>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {laenderGruppen.map(([land, sp], i) => (
              <Flaeche key={land || 'x'} fest verz={Math.min(i, 10) * 0.03} className="p-4">
                <div className="mb-2.5 flex items-center gap-2.5 border-b border-white/[0.06] pb-2.5">
                  <img src={flaggenPfad(land)} alt="" className="h-6 w-6 rounded-full object-cover" />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-white">{land ? landName(land) : 'Unknown'}</span>
                  <span className="titel text-2xl !text-akz">{sp.length}</span>
                </div>
                <ul className="space-y-1.5">{sp.map((p) => (
                  <li key={p.id}><Link to={`/competitive/player/${p.id}`} className="group flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-white/80 hover:text-akz">
                    {p.bild && <img src={p.bild} alt="" loading="lazy" className="h-8 w-6 shrink-0 rounded-md object-cover object-top" />}<span className="truncate">{p.anzeige}</span>
                  </Link></li>
                ))}</ul>
              </Flaeche>
            ))}
          </div>
        </div>
      )}

      {/* Match-Verlauf eines Spielers (Klick auf die Rangliste) - wie das Fenster auf der Seite */}
      <AnimatePresence>
        {panel && meta?.eventId && fenster && tageFenster.length <= 1 && (
          <motion.div key="panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPanel(null)}
            className="fixed inset-0 z-[500] flex items-start justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()} className="fl-fest relative my-8 w-full max-w-6xl p-5 shadow-2xl sm:p-6">
              <button type="button" aria-label="Close" onClick={() => setPanel(null)} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full border border-white/10 text-white/60 transition hover:border-akz hover:text-white">
                <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5.5 5.5l9 9M14.5 5.5l-9 9" /></svg>
              </button>
              <p className="ueber mb-4 pr-10">Match history · {meta.titel}</p>
              <SpielerDetail eventId={meta.eventId} windowId={tageFenster.length === 1 ? tageFenster[0] : (meta.epicFenster ?? fenster.windowId)} solo={solo} spieler={panel} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
