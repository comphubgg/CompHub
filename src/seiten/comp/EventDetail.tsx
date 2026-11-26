import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Glas } from '../../teile/Glas';
import {
  ART_NAME, MODUS_NAME, REGION_NAME, datum, dekoBild, dauer, laeuft, modiVon, stufeName, tagKurz, useJetzt, zahl, type Cup, type Fenster,
} from './events/gemeinsam';
import { LiveMarke, knopf } from './events/teile';
import Bestenliste, { type Eintrag, type LbSpieler } from './events/Bestenliste';
import SpielerStats from './events/SpielerStats';
import Matches from './events/Matches';

/*
 * Die Cup-Seite im Hub: Region und Spieltag waehlen, darunter die Bestenliste (/api/cup-leaderboard) mit Qualifikationslinie
 * (Epics Rangschwelle aus dem Katalog, Punkte-Prognose aus /api/qualifikation), Spieler-Stats (/api/cup-spieler) und Matches (/api/cup-matches).
 * Laeuft der Spieltag, wird die Spitze alle 10 s nachgefasst und die ganze Liste jede Minute; Rangwechsel leuchten kurz auf.
 */

interface Quali { mitte: number | null; tatsaechlich: number | null; schwelle?: number; fuerBelohnung?: boolean; ausVorlauf?: boolean; hergeleitet?: boolean; laeuft?: boolean }
type Reiter = 'tabelle' | 'spieler' | 'matches';

/** Neue Spitze vorn, dahinter die alte Liste ab dem ersten Platz, den die Spitze nicht abdeckt. */
function mischen(alt: Eintrag[], neu: Eintrag[]): Eintrag[] {
  if (!neu.length) return alt;
  const bis = Math.max(...neu.map((e) => e.rank));
  const ids = new Set(neu.map((e) => e.teamId));
  return [...neu, ...alt.filter((e) => e.rank > bis && !ids.has(e.teamId))];
}

function Kennzahl({ titel, wert, unter, farbe = 'text-white', i }: { titel: string; wert: string; unter?: string; farbe?: string; i: number }) {
  return (
    <Glas className="p-5" verzoegerung={0.1 + i * 0.05}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">{titel}</p>
      <p className={`mt-1 text-3xl font-extrabold tabular-nums tracking-tight ${farbe}`}>{wert}</p>
      {unter && <p className="mt-0.5 truncate text-xs text-white/45">{unter}</p>}
    </Glas>
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

  if (fehler) return <Glas className="p-12 text-center"><p className="text-lg font-bold text-white">Cup not found</p><p className="mt-1 text-sm text-white/50">{fehler}</p><Link to="/competitive/events" className="mt-5 inline-block rounded-xl bg-sky-400 px-5 py-2.5 text-sm font-bold text-[#06080f]">← All events</Link></Glas>;
  if (!cup || !wahl) return <div className="space-y-6"><div className="h-[320px] animate-pulse rounded-[2rem] bg-white/[0.03]" /><div className="h-[500px] animate-pulse rounded-3xl bg-white/[0.03]" /></div>;

  const modi = [...modiVon(cup)];
  const endeIn = istLive && f?.end ? f.end - jetzt : null;
  const anteil = istLive && f?.end ? Math.min(1, (jetzt - f.begin) / (f.end - f.begin)) : 0;
  return (
    <div className="space-y-6">
      {/* ------------------------------------------------ Kopf */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#070a12]">
        {dekoBild(cup) && <motion.img src={dekoBild(cup)} alt="" initial={{ scale: 1.06 }} animate={{ scale: 1 }} transition={{ duration: 1.4 }} className="absolute inset-0 h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
        <div className="absolute inset-0" style={{ background: `radial-gradient(90% 140% at 0% 0%, ${cup.farbe ?? '#38bdf8'}33, transparent 60%)` }} />
        <div className="absolute inset-0 bg-gradient-to-r from-[#06080f] via-[#06080f]/85 to-[#06080f]/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#06080f] via-transparent to-transparent" />
        <div className="relative flex min-h-[300px] flex-wrap items-end justify-between gap-6 p-8 lg:p-10">
          <div className="max-w-4xl">
            <Link to="/competitive/events" className="text-xs font-semibold text-white/45 transition hover:text-sky-300">← All events</Link>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {istLive ? <LiveMarke /> : kommt ? <span className="rounded-full bg-sky-400/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300">Upcoming</span>
                : <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">Finished</span>}
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/70">{ART_NAME[cup.art] ?? cup.art}</span>
              {modi.map((m) => <span key={m} className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/70">{MODUS_NAME[m]}</span>)}
            </div>
            <h1 className="mt-3 text-4xl font-extrabold leading-[1.05] tracking-tight text-white lg:text-5xl">{cup.titel}</h1>
            {f && <p className="mt-2 text-lg font-medium text-white/70">{stufeName(f)} <span className="text-white/40">· {REGION_NAME[f.region] ?? f.region} · {datum(f.begin)}</span></p>}
          </div>
          {f && (istLive || kommt) && (
            <div className="rounded-3xl border border-white/10 bg-black/40 p-5 backdrop-blur-xl lg:min-w-[280px]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/45">{istLive ? 'Ends in' : 'Starts in'}</p>
              <p className={`mt-1 text-4xl font-black tabular-nums ${istLive ? 'text-rose-300' : 'text-sky-300'}`}>{dauer(istLive ? endeIn ?? 0 : f.begin - jetzt)}</p>
              {istLive && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full rounded-full bg-gradient-to-r from-rose-400 to-amber-300" animate={{ width: `${anteil * 100}%` }} /></div>}
            </div>
          )}
        </div>
      </motion.div>

      {/* ------------------------------------------------ Region und Spieltag */}
      <Glas className="space-y-3 p-4" verzoegerung={0.05}>
        {regionen.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">Region</span>
            <div className="flex flex-wrap rounded-full border border-white/10 bg-black/20 p-1">
              {regionen.map((r) => (
                <button key={r} type="button" onClick={() => waehle(r)} className={`${knopf(wahl.region === r)} flex items-center gap-1.5`}>
                  {r}{cup.regionen[r].some((x) => laeuft(x, jetzt)) && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {wahl.liste.map((w) => {
            const an = w.windowId === f?.windowId;
            const l = laeuft(w, jetzt);
            return (
              <button key={w.windowId} type="button" onClick={() => waehle(wahl.region, w)}
                className={`shrink-0 rounded-2xl border px-4 py-2.5 text-left transition ${an ? 'border-sky-400/60 bg-sky-400/10' : 'border-white/10 bg-white/[0.02] hover:border-white/25'}`}>
                <span className="flex items-center gap-1.5 text-sm font-bold text-white">{l && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />}{stufeName(w)}</span>
                <span className={`block text-[11px] tabular-nums ${w.begin > jetzt ? 'text-sky-300/80' : 'text-white/40'}`}>{tagKurz(w.begin)} · {new Date(w.begin).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
              </button>
            );
          })}
        </div>
      </Glas>

      {/* ------------------------------------------------ Kennzahlen */}
      {f && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Kennzahl i={0} titel={tabelle[0]?.players.length === 1 ? 'Players' : 'Teams'} wert={tabelle.length ? zahl(tabelle.length) : '—'} unter={stand ? `as of ${stand}${istLive ? ' · live' : ''}` : kommt ? 'not started yet' : undefined} />
          <Kennzahl i={1} titel="Matches" wert={f.matchCap ? zahl(f.matchCap) : '—'} unter={f.matchCap ? 'max. games per team' : undefined} />
          <Kennzahl i={2} titel="Qualification" wert={schnitt ? `Top ${zahl(schnitt)}` : '—'} unter={schnitt ? (ziel ? `advance to ${ziel}` : 'advance') : 'no qualification spots'} farbe="text-sky-300" />
          <Kennzahl i={3} titel={quali?.tatsaechlich != null ? 'Cut-off (final)' : 'Cut-off (predicted)'} wert={qualiPunkte != null ? `${zahl(qualiPunkte)} pts` : grenzPunkte != null && schnitt ? `${zahl(grenzPunkte)} pts` : '—'}
            unter={qualiPunkte != null ? (grenzPunkte != null && istLive ? `${zahl(grenzPunkte)} pts on #${schnitt} right now` : 'points needed for the last spot') : grenzPunkte != null ? `on #${schnitt} right now` : undefined} farbe="text-teal-300" />
        </div>
      )}

      {/* ------------------------------------------------ Reiter */}
      <Glas className="overflow-hidden" verzoegerung={0.2}>
        <div className="flex flex-wrap items-center gap-3 border-b border-white/5 p-3">
          <div className="flex rounded-full border border-white/10 bg-black/20 p-1">
            {([['tabelle', 'Leaderboard'], ['spieler', 'Player stats'], ['matches', 'Matches']] as Array<[Reiter, string]>).map(([k, t]) => (
              <button key={k} type="button" onClick={() => setReiter(k)} className={`relative rounded-full px-4 py-1.5 text-sm font-semibold transition ${reiter === k ? 'text-[#06080f]' : 'text-white/60 hover:text-white'}`}>
                {reiter === k && <motion.span layoutId="ev-reiter" className="absolute inset-0 rounded-full bg-sky-400" transition={{ type: 'spring', stiffness: 400, damping: 34 }} />}
                <span className="relative">{t}</span>
              </button>
            ))}
          </div>
          {istLive && reiter === 'tabelle' && <span className="flex items-center gap-2 text-xs text-white/45"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />auto-refresh every 10 s</span>}
          {reiter === 'tabelle' && <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Search a player…" className="ml-auto w-60 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-sky-400/60 focus:outline-none" />}
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={`${reiter}-${f?.windowId}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            {!f ? <p className="p-10 text-center text-white/50">No match day in this region.</p>
              : kommt ? <p className="p-12 text-center text-white/55">This match day hasn't started yet — it begins {datum(f.begin)} (in {dauer(f.begin - jetzt)}).</p>
                : reiter === 'tabelle' ? (laedt && !tabelle.length
                  ? <div className="space-y-1.5 p-4">{[...Array(12)].map((_, i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-white/[0.03]" />)}</div>
                  : <Bestenliste tabelle={tabelle} wechsel={wechsel} schnitt={schnitt} schnittText={schnittText} suche={suche} />)
                  : reiter === 'spieler' ? <SpielerStats eventId={f.eventId} windowId={f.windowId} live={istLive} spielerInfo={spielerInfo} />
                    : <Matches eventId={f.eventId} windowId={f.windowId} live={istLive} spielerInfo={spielerInfo} />}
          </motion.div>
        </AnimatePresence>
      </Glas>
      {cup.beschreibung && <Glas className="p-6 text-sm leading-relaxed text-white/55" verzoegerung={0.3}><p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">About this cup</p>{cup.beschreibung}</Glas>}
    </div>
  );
}
