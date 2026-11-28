import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Flaeche, Leer, Marke, Segment } from '../../ds/Bausteine';
import { REGION_FARBE, REGION_NAME, datum, dauer, laeuft, stufeName, tagKurz, useJetzt, zahl, type Cup, type Fenster } from './events/gemeinsam';
import { CupBild, CupMarken, LiveMarke, TeamFotos, TeamNamen, Uhrwerk, spiele } from './events/teile';
import Bestenliste, { type Eintrag, type LbSpieler } from './events/Bestenliste';
import SpielerStats from './events/SpielerStats';
import Matches from './events/Matches';

/*
 * Die Cup-Seite im Hub, neu komponiert (Design-System 3.0) als Spielzentrale:
 *   Kopf     Banner des Cups, Titel, Countdown-Kacheln - und sobald es Ergebnisse gibt, die ersten drei des Spieltags mit Fotos. Am unteren Rand
 *            des Kopfs die Steuerung: Region und Spieltag.
 *   links    die Tafel mit Leaderboard / Player stats / Matches (das, wofuer die Seite da ist - steht direkt unter dem Kopf)
 *   rechts   klebend: Kennzahlen des Spieltags, das Rennen um die Qualifikationslinie (wer knapp drin ist, wer knapp draussen), ueber den Cup
 * Daten: Bestenliste (/api/cup-leaderboard) mit Qualifikationslinie (Epics Rangschwelle aus dem Katalog, Punkte-Prognose aus /api/qualifikation),
 * Spieler-Stats (/api/cup-spieler), Matches (/api/cup-matches). Laeuft der Spieltag, wird die Spitze alle 10 s nachgefasst und die ganze Liste
 * jede Minute; Rangwechsel leuchten kurz auf.
 */

interface Quali { mitte: number | null; tatsaechlich: number | null; schwelle?: number; fuerBelohnung?: boolean; ausVorlauf?: boolean; hergeleitet?: boolean; laeuft?: boolean }
type Reiter = 'tabelle' | 'spieler' | 'matches';
const MEDAILLE = ['#facc15', '#cbd5e1', '#f59e0b'];
const uhrzeit = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** Neue Spitze vorn, dahinter die alte Liste ab dem ersten Platz, den die Spitze nicht abdeckt. */
function mischen(alt: Eintrag[], neu: Eintrag[]): Eintrag[] {
  if (!neu.length) return alt;
  const bis = Math.max(...neu.map((e) => e.rank));
  const ids = new Set(neu.map((e) => e.teamId));
  return [...neu, ...alt.filter((e) => e.rank > bis && !ids.has(e.teamId))];
}

function Wert({ titel, wert, unter, ton = 'text-white' }: { titel: string; wert: ReactNode; unter?: ReactNode; ton?: string }) {
  return (
    <div className="bg-fl px-5 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">{titel}</p>
      <p className={`titel zahl mt-1 text-4xl ${ton}`}>{wert}</p>
      {unter && <p className="mt-0.5 text-xs leading-snug text-white/45">{unter}</p>}
    </div>
  );
}

/** Die ersten drei des Spieltags im Kopf: Platz in Medaillenfarbe, Fotos hochkant, Namen, Punkte. */
function Spitze({ tabelle, live }: { tabelle: Eintrag[]; live: boolean }) {
  const drei = tabelle.filter((e) => e.rank <= 3).slice(0, 3);
  if (!drei.length) return null;
  return (
    <div className="w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-fl/[0.88] backdrop-blur-xl lg:w-[440px]">
      <p className="ueber border-b border-white/[0.06] px-4 py-2.5">{live ? 'Leading right now' : 'Winners of this match day'}</p>
      {drei.map((e, i) => (
        <motion.div key={e.teamId} layout="position" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
          className="flex min-h-[60px] items-center gap-3 border-t border-white/[0.05] px-4 py-1.5 first:border-t-0">
          <span className="titel zahl w-5 text-center text-3xl" style={{ color: MEDAILLE[e.rank - 1] }}>{e.rank}</span>
          <TeamFotos spieler={e.players.slice(0, 4)} mass="h-12 w-9" />
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 text-sm font-semibold leading-snug text-white sm:line-clamp-1"><TeamNamen spieler={e.players} /></span>
            <span className="zahl block text-[11px] text-white/45">{e.elims} elims{e.wins ? ` · ${e.wins} win${e.wins > 1 ? 's' : ''}` : ''}</span>
          </span>
          <span className="shrink-0 text-right"><span className="titel zahl block text-3xl">{zahl(e.points)}</span><span className="block text-[9px] font-semibold uppercase tracking-[0.25em] text-white/35">pts</span></span>
        </motion.div>
      ))}
    </div>
  );
}

/** Das Rennen um die Linie: die Teams direkt ueber und unter der Qualifikationsgrenze mit ihrem Abstand in Punkten. */
function Linie({ tabelle, schnitt, ziel, live }: { tabelle: Eintrag[]; schnitt: number; ziel: string | null; live: boolean }) {
  const grenze = tabelle.find((e) => e.rank === schnitt);
  const erster = tabelle.find((e) => e.rank === schnitt + 1);
  if (!grenze) return null;
  const drin = tabelle.filter((e) => e.rank > schnitt - 3 && e.rank <= schnitt);
  const raus = tabelle.filter((e) => e.rank > schnitt && e.rank <= schnitt + 3);
  const reihe = (e: Eintrag, inne: boolean) => {
    // drin: Vorsprung auf den ersten Platz draussen - draussen: Rueckstand auf den letzten Platz drin
    const abstand = inne ? e.points - (erster?.points ?? e.points) : e.points - grenze.points;
    return (
      <div key={e.teamId} className="flex items-center gap-2.5 px-5 py-1.5">
        <span className={`titel zahl w-7 text-xl ${inne ? '!text-akz' : '!text-white/40'}`}>{e.rank}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-white/85"><TeamNamen spieler={e.players} /></span>
        <span className="zahl text-[13px] font-bold text-white">{zahl(e.points)}</span>
        <span className={`zahl w-10 text-right text-[11px] font-bold ${inne ? 'text-emerald-400' : 'text-red-400'}`}>{abstand > 0 ? `+${abstand}` : abstand < 0 ? `−${Math.abs(abstand)}` : '±0'}</span>
      </div>
    );
  };
  return (
    <Flaeche fest className="overflow-hidden">
      <div className="px-5 pb-2 pt-4">
        <p className="ueber">{live ? 'Race for the line' : 'On the line'}</p>
        <p className="mt-1 text-xs text-white/45">Top {zahl(schnitt)} {ziel ? `advance to ${ziel}` : 'qualify'} – points and gap to the cut.</p>
      </div>
      {drin.map((e) => reihe(e, true))}
      <div className="flex items-center gap-3 px-5 py-1"><span className="h-px flex-1 bg-gradient-to-r from-akz to-akz/20" /><span className="text-[9px] font-bold uppercase tracking-[0.25em] text-akz">cut · {zahl(grenze.points)} pts</span><span className="h-px flex-1 bg-gradient-to-l from-akz to-akz/20" /></div>
      {raus.map((e) => reihe(e, false))}
      <div className="h-3" />
    </Flaeche>
  );
}

export default function EventDetail() {
  const { id = '' } = useParams();
  const [adresse, setAdresse] = useSearchParams();
  const [cup, setCup] = useState<Cup | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [reiter, setReiter] = useState<Reiter>('tabelle');
  const [tabelle, setTabelle] = useState<Eintrag[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [stand, setStand] = useState<string | null>(null);
  const [quali, setQuali] = useState<Quali | null>(null);
  const [wechsel, setWechsel] = useState<Record<string, number>>({});
  const [suche, setSuche] = useState('');
  const vorher = useRef<Map<string, number>>(new Map());
  const neuester = useRef(0);
  const tageLeiste = useRef<HTMLDivElement>(null);
  const jetzt = useJetzt();

  // ---- Cup aus dem Katalog
  useEffect(() => {
    let weg = false;
    setCup(null); setFehler(null);
    fetch('/api/cup-catalog?modus=alle').then((r) => r.json()).then((d) => {
      if (weg) return;
      const gesucht = id.split('~')[0];
      const c = (d.cups as Cup[] | undefined)?.find((x) => x.id === gesucht);
      if (!c) setFehler('There is no data for this cup any more — Epic only keeps past tournaments for a while.');
      else setCup(c);
    }).catch(() => { if (!weg) setFehler("The event catalogue isn't reachable right now."); });
    return () => { weg = true; };
  }, [id]);

  // ---- Region und Spieltag: aus der Adresse, sonst wo es laeuft, sonst was als Naechstes kommt, sonst das letzte
  const regionen = cup ? Object.keys(cup.regionen) : [];
  const wahl = useMemo(() => {
    if (!cup) return null;
    const t = Date.now();
    const gewuenscht = (adresse.get('region') ?? '').toUpperCase();
    const live = regionen.find((r) => cup.regionen[r].some((f) => laeuft(f, t)));
    const region = regionen.includes(gewuenscht) ? gewuenscht : live ?? (regionen.includes('EU') ? 'EU' : regionen[0]);
    const liste = [...(cup.regionen[region] ?? [])].sort((a, b) => a.begin - b.begin);
    const fw = adresse.get('fenster');
    const fenster = liste.find((f) => f.windowId === fw) ?? liste.find((f) => laeuft(f, t)) ?? liste.find((f) => f.begin > t) ?? liste[liste.length - 1] ?? null;
    return { region, liste, fenster };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cup, adresse]);
  const f = wahl?.fenster ?? null;
  const istLive = !!f && laeuft(f, jetzt);
  const kommt = !!f && f.begin > jetzt;
  const waehle = (region: string, fenster?: Fenster) => {
    const p = new URLSearchParams({ region });
    if (fenster) p.set('fenster', fenster.windowId);
    setAdresse(p, { replace: true });
  };
  // der gewaehlte Spieltag rollt in der Leiste ins Bild
  useEffect(() => {
    const el = tageLeiste.current?.querySelector<HTMLElement>('[data-an="1"]'); const huelle = tageLeiste.current;
    if (el && huelle) huelle.scrollTo({ left: el.offsetLeft - huelle.clientWidth / 2 + el.clientWidth / 2, behavior: 'smooth' });
  }, [f?.windowId, wahl?.region]);

  // ---- Bestenliste
  const setzen = useCallback((neu: Eintrag[], updated?: string) => {
    const zeit = Date.parse(updated ?? '') || Date.now();
    if (zeit < neuester.current) return false;
    neuester.current = zeit;
    // Rangwechsel gegenueber dem letzten Stand - leuchten acht Sekunden.
    const alt = vorher.current;
    if (alt.size) {
      const w: Record<string, number> = {};
      for (const e of neu.slice(0, 500)) { const r = alt.get(e.teamId); if (r && r !== e.rank) w[e.teamId] = r - e.rank; }
      if (Object.keys(w).length) { setWechsel(w); setTimeout(() => setWechsel((x) => (x === w ? {} : x)), 8000); }
    }
    setStand(new Date(zeit).toLocaleTimeString('en-GB'));
    return true;
  }, []);
  useEffect(() => { vorher.current = new Map(tabelle.map((e) => [e.teamId, e.rank])); }, [tabelle]);

  useEffect(() => {
    if (!f) return;
    let weg = false;
    setTabelle([]); setStand(null); setWechsel({}); vorher.current = new Map(); neuester.current = 0;
    if (f.begin > Date.now()) { setLaedt(false); return; }
    setLaedt(true);
    const basis = `/api/cup-leaderboard?event=${encodeURIComponent(f.eventId)}&window=${encodeURIComponent(f.windowId)}`;
    const lebt = () => laeuft(f, Date.now()) || Date.now() - (f.end ?? 0) < 6 * 3_600_000;
    const spitze = () => fetch(`${basis}&von=0&seiten=1`).then((r) => r.json()).then((d: { entries?: Eintrag[]; updated?: string }) => {
      if (weg || !d.entries?.length) return;
      if (setzen(d.entries, d.updated)) setTabelle((alt) => mischen(alt, d.entries!));
      setLaedt(false);
    }).catch(() => {});
    const ganz = () => fetch(`${basis}&ganz=1&ab=${Math.round(lebt() ? Date.now() - 120_000 : (f.end ?? 0) + 600_000)}${lebt() ? '&live=1' : ''}`)
      .then((r) => r.json()).then((d: { entries?: Eintrag[]; updated?: string }) => {
        if (weg || !d.entries?.length) return;
        const zeit = Date.parse(d.updated ?? '') || 0;
        // Aelter als die Spitze, die schon dasteht: nur dahinter auffuellen.
        if (zeit && zeit < neuester.current) setTabelle((alt) => { const bis = alt.length ? Math.max(...alt.map((e) => e.rank)) : 0; return [...alt, ...d.entries!.filter((e) => e.rank > bis)]; });
        else { setzen(d.entries, d.updated); setTabelle(d.entries); }
        setLaedt(false);
      }).catch(() => { if (!weg) setLaedt(false); });
    spitze(); ganz();
    let n = 0;
    const takt = setInterval(() => {
      if (!laeuft(f, Date.now())) return;
      n += 1;
      if (n % 6 === 0) ganz(); else spitze();
    }, 10_000);
    return () => { weg = true; clearInterval(takt); };
  }, [f?.windowId, f?.eventId, setzen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Qualifikation (Prognose / tatsaechliche Grenze)
  useEffect(() => {
    if (!f) return;
    let weg = false;
    setQuali(null);
    const holen = () => fetch(`/api/qualifikation?window=${encodeURIComponent(f.windowId)}&event=${encodeURIComponent(f.eventId)}&region=${f.region}`)
      .then((r) => r.json()).then((q) => { if (!weg) setQuali(q); }).catch(() => {});
    holen();
    const i = setInterval(() => { if (laeuft(f, Date.now())) holen(); }, 60_000);
    return () => { weg = true; clearInterval(i); };
  }, [f?.windowId]); // eslint-disable-line react-hooks/exhaustive-deps

  const spielerInfo = useMemo(() => new Map<string, LbSpieler>(tabelle.flatMap((e) => e.players.map((p) => [p.id, p] as const))), [tabelle]);

  const schnitt = useMemo(() => {
    if (!f) return 0;
    const marke = f.marken?.length ? Math.max(...f.marken.map((m) => m.bis)) : 0;
    return f.qualifiziert || marke || (quali && !quali.fuerBelohnung && !quali.ausVorlauf && !quali.hergeleitet ? quali.schwelle ?? 0 : 0);
  }, [f, quali]);
  const ziel = f?.marken?.[0]?.token ? stufeName({ windowId: f.marken[0].token, istFinale: /final/i.test(f.marken[0].token) }) : null;
  const grenzPunkte = tabelle.find((e) => e.rank === schnitt)?.points ?? null;
  const qualiPunkte = quali?.tatsaechlich ?? quali?.mitte ?? null;
  const schnittText = `Top ${zahl(schnitt)}${ziel ? ` → ${ziel}` : ' qualify'}${grenzPunkte !== null ? ` · ${zahl(grenzPunkte)} pts${istLive ? ' now' : ''}` : ''}`;

  if (fehler) return <Leer text={<><span className="block text-lg font-bold text-white">Cup not found</span>{fehler}</>}><Link to="/competitive/events" className="knopf-prim">← All events</Link></Leer>;
  if (!cup || !wahl) return <div className="space-y-6"><div className="fl-fest h-[340px] animate-pulse" /><div className="fl-fest h-[500px] animate-pulse" /></div>;

  const { haupt: titel, zusatz } = (() => { const [haupt, ...rest] = cup.titel.split(/\s·\s|\s\(/); return { haupt, zusatz: rest.map((x) => x.replace(/\)$/, '')).join(' · ') }; })();
  const anteil = istLive && f?.end ? Math.min(1, Math.max(0, (jetzt - f.begin) / (f.end - f.begin))) : 0;
  const solo = tabelle[0]?.players.length === 1;
  return (
    <div className="space-y-6">
      {/* ------------------------------------------------ Kopf mit Steuerung */}
      <motion.header initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="fl-fest relative isolate overflow-hidden">
        <div className="absolute inset-y-0 right-0 -z-10 w-full lg:w-[70%]"><CupBild c={cup} lage="center 30%" /></div>
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-fl via-fl/85 to-fl/15" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-fl via-fl/30 to-transparent" />
        <div className="flex flex-col gap-6 p-5 sm:p-8 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
          <div className="min-w-0">
            <Link to="/competitive/events" className="text-xs font-semibold text-white/50 transition hover:text-akz">← All events</Link>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {istLive ? <LiveMarke text="Live now" /> : kommt ? <Marke ton="akz">Upcoming</Marke> : <Marke>Finished</Marke>}
              <CupMarken c={cup} />
              {zusatz && <Marke>{zusatz}</Marke>}
            </div>
            <h1 className="titel mt-3 text-5xl drop-shadow-[0_6px_30px_rgba(0,0,0,0.85)] sm:text-6xl 2xl:text-7xl">{titel}</h1>
            {f && <p className="mt-2.5 text-[15px] text-white/65"><span className="font-semibold text-white">{stufeName(f)}</span> · {REGION_NAME[f.region] ?? f.region} · {datum(f.begin)}{f.end ? `–${uhrzeit(f.end)}` : ''}{f.matchCap ? ` · ${spiele(f.matchCap)}` : ''}</p>}
            {f && (istLive || kommt) && (
              <div className="mt-5 flex flex-wrap items-end gap-x-6 gap-y-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/45">{istLive ? 'Ends in' : 'Starts in'}</p>
                  <div className="mt-1.5"><Uhrwerk ms={istLive ? (f.end ?? jetzt) - jetzt : f.begin - jetzt} ton={istLive ? 'rot' : 'akz'} klein /></div>
                </div>
                {istLive && f.end && (
                  <div className="min-w-[180px] flex-1 pb-1 sm:max-w-xs">
                    <div className="zahl flex justify-between text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45"><span>{uhrzeit(f.begin)}</span><span>{Math.round(anteil * 100)}% played</span><span>{uhrzeit(f.end)}</span></div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full rounded-full bg-gradient-to-r from-red-400 to-amber-300" animate={{ width: `${anteil * 100}%` }} /></div>
                  </div>
                )}
              </div>
            )}
          </div>
          {!kommt && <Spitze tabelle={tabelle} live={istLive} />}
        </div>

        {/* Steuerung: Region, dann die Spieltage dieser Region */}
        <div className="flex flex-col gap-2.5 border-t border-white/[0.07] bg-fl/90 px-5 py-3 backdrop-blur sm:px-8 lg:flex-row lg:items-center lg:gap-5">
          {regionen.length > 1 && (
            <div className="ohne-leiste flex shrink-0 items-center gap-1.5 overflow-x-auto">
              <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">Region</span>
              {regionen.map((r) => (
                <button key={r} type="button" title={REGION_NAME[r]} onClick={() => waehle(r)} className={`chip ${wahl.region === r ? 'chip-an' : ''}`}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: REGION_FARBE[r] ?? '#94a3b8' }} />{r}
                  {cup.regionen[r].some((x) => laeuft(x, jetzt)) && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />}
                </button>
              ))}
            </div>
          )}
          {regionen.length > 1 && <span aria-hidden className="hidden h-8 w-px shrink-0 bg-white/10 lg:block" />}
          <div ref={tageLeiste} className="ohne-leiste relative flex min-w-0 flex-1 items-stretch gap-1.5 overflow-x-auto">
            {wahl.liste.map((w) => {
              const an = w.windowId === f?.windowId;
              const l = laeuft(w, jetzt);
              return (
                <button key={w.windowId} type="button" data-an={an ? '1' : '0'} onClick={() => waehle(wahl.region, w)}
                  className={`shrink-0 rounded-xl border px-3.5 py-1.5 text-left transition ${an ? 'border-akz/60 bg-akz/15' : 'border-white/[0.08] bg-white/[0.03] hover:border-white/25'}`}>
                  <span className="flex items-center gap-1.5 whitespace-nowrap text-[13px] font-bold text-white">{l && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />}{stufeName(w)}</span>
                  <span className={`zahl block whitespace-nowrap text-[11px] ${w.begin > jetzt ? 'text-akz/90' : 'text-white/40'}`}>{tagKurz(w.begin)} · {uhrzeit(w.begin)}</span>
                </button>
              );
            })}
            {!wahl.liste.length && <p className="py-2 text-sm text-white/45">No match day in this region.</p>}
          </div>
        </div>
      </motion.header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* ------------------------------------------------ Tafel: Leaderboard / Player stats / Matches */}
        <Flaeche fest className="order-2 min-w-0 self-start overflow-hidden xl:order-none">
          <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] p-3 sm:px-5">
            <Segment id="ev-reiter" wert={reiter} onWahl={setReiter} wahl={[{ k: 'tabelle', titel: 'Leaderboard' }, { k: 'spieler', titel: 'Player stats' }, { k: 'matches', titel: 'Matches' }]} />
            {istLive && reiter === 'tabelle' && <span className="flex items-center gap-2 text-xs text-white/45"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />auto-refresh every 10 s</span>}
            {!istLive && stand && reiter === 'tabelle' && <span className="zahl text-xs text-white/35">as of {stand}</span>}
            {reiter === 'tabelle' && <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Search a player…" className="eingabe ml-auto w-full !py-2 sm:w-60" />}
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={`${reiter}-${f?.windowId}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              {!f ? <p className="p-10 text-center text-white/50">No match day in this region.</p>
                : kommt ? (
                  <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
                    <p className="ueber">Not started yet</p>
                    <Uhrwerk ms={f.begin - jetzt} />
                    <p className="max-w-md text-sm text-white/55">{stufeName(f)} in {REGION_NAME[f.region] ?? f.region} begins {datum(f.begin)} (in {dauer(f.begin - jetzt)}). The leaderboard, player stats and matches fill in as soon as the first games end.</p>
                  </div>
                ) : reiter === 'tabelle' ? (laedt && !tabelle.length
                  ? <div className="space-y-px">{[...Array(12)].map((_, i) => <div key={i} className="h-16 animate-pulse bg-white/[0.025]" />)}</div>
                  : <Bestenliste tabelle={tabelle} wechsel={wechsel} schnitt={schnitt} schnittText={schnittText} suche={suche} />)
                  : reiter === 'spieler' ? <SpielerStats eventId={f.eventId} windowId={f.windowId} live={istLive} spielerInfo={spielerInfo} />
                    : <Matches eventId={f.eventId} windowId={f.windowId} live={istLive} spielerInfo={spielerInfo} />}
            </motion.div>
          </AnimatePresence>
        </Flaeche>

        {/* ------------------------------------------------ Rand: klebt am Bildschirm; auf dem Handy stehen die Kennzahlen vor der Tafel, der Rest danach */}
        <aside className="contents xl:block">
          <div className="contents xl:sticky xl:top-[112px] xl:block xl:space-y-6">
            {f && (
              <Flaeche fest className="order-1 overflow-hidden xl:order-none">
                <div className="grid grid-cols-2 gap-px bg-white/[0.06]">
                  <Wert titel={solo ? 'Players' : 'Teams'} wert={tabelle.length ? zahl(tabelle.length) : '—'} unter={stand ? `as of ${stand}${istLive ? ' · live' : ''}` : kommt ? 'not started yet' : undefined} />
                  <Wert titel="Matches" wert={f.matchCap ? zahl(f.matchCap) : '—'} unter={f.matchCap ? `max. games per ${solo ? 'player' : 'team'}` : undefined} />
                  <Wert titel="Qualification" wert={schnitt ? `Top ${zahl(schnitt)}` : '—'} unter={schnitt ? (ziel ? `advance to ${ziel}` : 'advance') : 'no qualification spots'} ton="!text-akz" />
                  <Wert titel={quali?.tatsaechlich != null ? 'Cut-off (final)' : 'Cut-off (predicted)'} wert={qualiPunkte != null ? `${zahl(qualiPunkte)}` : grenzPunkte != null && schnitt ? `${zahl(grenzPunkte)}` : '—'}
                    unter={qualiPunkte != null ? (grenzPunkte != null && istLive ? `${zahl(grenzPunkte)} pts on #${schnitt} right now` : 'points needed for the last spot') : grenzPunkte != null && schnitt ? `points on #${schnitt} right now` : undefined} ton="!text-emerald-300" />
                </div>
              </Flaeche>
            )}
            {schnitt > 0 && !kommt && tabelle.length > schnitt && <div className="order-3 xl:order-none"><Linie tabelle={tabelle} schnitt={schnitt} ziel={ziel} live={istLive} /></div>}
            {cup.beschreibung && (
              <Flaeche fest className="order-4 p-5 xl:order-none">
                <p className="ueber">About this cup</p>
                <p className="mt-2 text-sm leading-relaxed text-white/55">{cup.beschreibung}</p>
              </Flaeche>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
