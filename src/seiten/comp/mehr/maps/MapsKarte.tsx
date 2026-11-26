import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Glas } from '../../../../teile/Glas';
import { useWer } from '../../../../teile/Anmeldung';
import KartenAnsicht, { type KartenForm, type Punkt } from '../KartenAnsicht';
import { FehlerZeile, LaenderListe, Laedt, Reiter, SEITE, datumKurz, datumLang } from '../teile';
import { REGION_FARBE } from '../../events/gemeinsam';
import { type MapEintrag, regionAnzeige } from './Maps';
import KartenUpdateWahl from './KartenUpdateWahl';
import SpielerDetail from './SpielerDetail';
import { CupTierlist, Platzierungen, RangAusTeams, RangTabelle, TeamKarten, type MSpieler, type MTeam, type PlatzZeile } from './Mannschaften';

/*
 * Die Seite eines Cups in Maps (wie /tournament-maps/karte): Kopf mit Cup-Bild und allen Spieltagen zum Umschalten, Reiter Drop spots /
 * Teams / Leaderboard / Tierlist / Nationalities, bei Finals an zwei Tagen Day 1 / Day 2 / Combined. Karte von /api/maps-karte, gewaehltes
 * Kartenbild von /api/maps-bild (Admin kann es aendern, auch fuer die ganze Saison - aus der Auswahl oder jeder Update-Karte, KartenUpdateWahl),
 * Replays-Knopf wenn /api/replay?tag= etwas hat. Klick auf eine Zeile der Epic-Rangliste oeffnet den Match-Verlauf (SpielerDetail) im Fenster.
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
          windows={tageFenster.length > 1 ? tageFenster : undefined} laender={laender} anzeigen={anzeigen} schmal={schmal}
          aufKlick={tageFenster.length > 1 ? undefined : setPanel} />);

  if (!params) return <FehlerZeile text="This map is not specified." />;
  const region = meta ? regionAnzeige(meta) : params.r;

  return (
    <div className="space-y-6">
      <Link to={meta?.saison ? `/competitive/maps?saison=${meta.saison}` : '/competitive/maps'}
        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-4 py-1.5 text-xs font-semibold text-white/70 backdrop-blur-xl transition hover:border-sky-400/50 hover:text-white">
        ← {meta?.saisonKurz || 'All maps'}
      </Link>

      {/* Buehne: Cup-Bild unter dunklem Verlauf, Titel, Marken, Spieltage */}
      <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="relative isolate overflow-hidden rounded-3xl border border-white/10 bg-[#0a0e18]">
        {meta?.bild && <img src={meta.bild} alt="" aria-hidden className="absolute inset-0 -z-10 h-full w-full scale-110 object-cover opacity-40 blur-xl" />}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#06080f] via-[#06080f]/80 to-[#06080f]/40" />
        <div className="flex flex-col gap-6 p-6 sm:p-8">
          <div className="flex flex-wrap items-end gap-5">
            {meta?.bild && <img src={meta.bild} alt="" className="hidden aspect-video w-56 rounded-2xl border border-white/15 object-cover shadow-2xl sm:block" />}
            <div className="min-w-0">
              <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">{meta?.cup || fenster?.name || 'Map'}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/65">
                {meta?.lan && <span className="rounded-full bg-amber-400 px-2 py-0.5 font-black text-[#06080f]">LAN</span>}
                {meta?.saisonKurz && <span>{meta.saisonKurz}{meta.saisonTitel && meta.saisonTitel !== meta.saisonKurz ? ` — ${meta.saisonTitel}` : ''}</span>}
                <span className="rounded-full border px-2 py-0.5" style={{ borderColor: `${REGION_FARBE[region] ?? '#94a3b8'}66`, color: REGION_FARBE[region] ?? '#94a3b8' }}>{region}</span>
                {hatReplays && <Link to={`/competitive/replays?tag=${encodeURIComponent(params.w)}`} className="rounded-full bg-sky-400 px-2 py-0.5 font-black text-[#06080f] transition hover:bg-sky-300">▶ Replays</Link>}
                {(fenster?.teams ?? []).length > 0 && <span className="rounded-full bg-white/10 px-2 py-0.5 text-white/85">{fenster!.teams.length} {solo ? 'players' : 'teams'}</span>}
                {(fenster?.start || meta?.datum) && <span>{datumLang(fenster?.start ?? (meta?.datum as number))}</span>}
                {st && <span className={`rounded-full px-2 py-0.5 ${st === 'live' ? 'bg-rose-500/90 text-white' : st === 'upcoming' ? 'bg-sky-400/25 text-sky-200' : 'bg-white/10 text-white/70'}`}>{st === 'live' ? 'Live' : st === 'upcoming' ? 'Upcoming' : 'Ended'}</span>}
              </div>
            </div>
          </div>
          {wochen.length > 1 && (
            <div className="flex gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-black/40 p-1.5 backdrop-blur sm:flex-wrap">
              {wochen.map((w) => (
                <button key={w.windowId} type="button" onClick={() => setAdresse({ t: w.turnierId, r: w.region, w: w.windowId }, { replace: true })}
                  className={`shrink-0 rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition ${w.windowId === params.w ? 'bg-white text-[#06080f]' : 'text-white/65 hover:bg-white/10 hover:text-white'}`}>
                  {w.fenster}{w.datum ? <span className="ml-1.5 font-semibold opacity-60">{datumKurz(w.datum)}</span> : null}
                </button>
              ))}
            </div>
          )}
        </div>
      </motion.section>

      {fehler && !fenster && <FehlerZeile text={fehler} />}
      {!fenster && !fehler && <Laedt text="Loading the map …" />}

      {fenster && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Reiter<ReiterK> wert={reiter} setze={setReiter} liste={[['karte', 'Drop spots'], ['spieler', solo ? 'Players' : 'Teams'], ['leaderboard', 'Leaderboard'], ['tierlist', 'Tierlist'], ['laender', 'Nationalities']]} />
            {tage.length > 1 && <Reiter wert={tag} setze={setTag} klein liste={[...tage.map((d, i) => [String(i + 1), d.name] as [string, string]), ['gesamt', 'Combined']]} />}
          </div>

          {reiter === 'karte' && (
            <div className="space-y-3">
              {wer?.isAdmin && (
                <Glas className="flex flex-wrap items-center gap-2 border-amber-400/25 bg-amber-400/[0.05] px-4 py-3 text-xs">
                  <span className="font-bold uppercase tracking-[0.2em] text-amber-300">Admin</span>
                  <a href={`${SEITE}/admin/alte-maps/bearbeiten?t=${encodeURIComponent(params.t)}&r=${encodeURIComponent(params.r)}&w=${encodeURIComponent(params.w)}`} target="_blank" rel="noreferrer"
                    className="rounded-lg bg-amber-400 px-3 py-1.5 font-bold text-[#06080f] transition hover:bg-amber-300">Edit this map ↗</a>
                  <button type="button" onClick={() => setBilderOffen((v) => !v)} className={`rounded-lg border px-3 py-1.5 font-semibold transition ${bilderOffen ? 'border-sky-400 bg-sky-400/15 text-sky-200' : 'border-white/10 bg-white/[0.04] text-white/80 hover:border-sky-400/50'}`}>Choose map image</button>
                  {wahlBild && <button type="button" disabled={speichert} onClick={() => void bildSpeichern('')} className="rounded-lg border border-white/10 px-3 py-1.5 text-white/55 transition hover:border-rose-400/60 hover:text-rose-300">Game-version default</button>}
                  <label className="ml-auto flex items-center gap-2 font-semibold text-white/55"><input type="checkbox" checked={fuerSaison} onChange={(e) => setFuerSaison(e.target.checked)} className="accent-sky-400" />Apply to every day of this season</label>
                  {speichert && <span className="text-white/45">Saving …</span>}
                  {bilderOffen && (
                    <div className="mt-2 grid w-full grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                      {auswahl.map((a) => (
                        <button key={a.u} type="button" disabled={speichert} title={a.titel} onClick={() => { void bildSpeichern(a.u); setBilderOffen(false); }}
                          className={`overflow-hidden rounded-xl border text-left transition ${wahlBild === a.u ? 'border-sky-400' : 'border-white/10 hover:border-sky-400/50'}`}>
                          <img src={encodeURI(a.u)} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                          <span className="block truncate px-1.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-white/50">{a.titel}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {bilderOffen && <KartenUpdateWahl aktuell={wahlBild} vorgabe={meta?.saisonKurz} speichert={speichert} waehle={(u) => { void bildSpeichern(u); setBilderOffen(false); }} />}
                </Glas>
              )}
              <div className="grid gap-5 lg:grid-cols-[minmax(300px,1fr)_minmax(0,1.6fr)] lg:items-start">
                <aside className="lg:sticky lg:top-32">
                  <h2 className="mb-2 text-lg font-extrabold text-white">Leaderboard</h2>
                  <div className="max-h-[78vh] overflow-y-auto rounded-3xl">{rangliste(true)}</div>
                </aside>
                <KartenAnsicht formen={formen} bild={bild} rotAb={2} titel={`${meta?.cup ?? 'map'} ${meta?.fenster ?? ''}`} />
              </div>
            </div>
          )}
          {reiter === 'spieler' && <TeamKarten teams={fenster.teams ?? []} />}
          {reiter === 'leaderboard' && rangliste(false)}
          {reiter === 'tierlist' && <CupTierlist windowId={fenster.windowId} teams={fenster.teams ?? []} />}
          {reiter === 'laender' && (
            <Glas className="max-w-3xl p-6">
              <h2 className="mb-4 text-lg font-extrabold text-white">Players by country</h2>
              <LaenderListe spieler={fenster.spieler} />
            </Glas>
          )}
        </>
      )}

      {/* Match-Verlauf eines Spielers (Klick auf die Rangliste) - wie das Fenster auf der Seite */}
      <AnimatePresence>
        {panel && meta?.eventId && fenster && tageFenster.length <= 1 && (
          <motion.div key="panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPanel(null)}
            className="fixed inset-0 z-[500] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()} className="relative my-8 w-full max-w-6xl rounded-3xl border border-white/10 bg-[#0a0e18]/95 p-5 shadow-2xl backdrop-blur-xl sm:p-6">
              <button type="button" aria-label="Close" onClick={() => setPanel(null)} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full border border-white/15 text-white/60 transition hover:border-sky-400 hover:text-white">
                <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5.5 5.5l9 9M14.5 5.5l-9 9" /></svg>
              </button>
              <p className="mb-4 pr-10 text-xs font-bold uppercase tracking-[0.2em] text-sky-300">Match history · {meta.titel}</p>
              <SpielerDetail eventId={meta.eventId} windowId={tageFenster.length === 1 ? tageFenster[0] : (meta.epicFenster ?? fenster.windowId)} solo={solo} spieler={panel} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
