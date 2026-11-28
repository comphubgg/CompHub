import { motion } from 'framer-motion';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Bild, Flaeche, Leer, Marke, Segment, Zaehler } from '../../../ds/Bausteine';
import { useWer } from '../../../teile/Anmeldung';
import KartenAnsicht from './KartenAnsicht';
import { formenVon } from './maps/MapsKarte';
import { Dock, KopfBand, Werkbank } from './Werkbank';
import { FehlerZeile, LaenderListe, Laedt, Suche, TeamFlagge, chip, datumKurz, flaggenPfad, landName } from './teile';
import { REGION_FARBE, REGION_NAME } from '../events/gemeinsam';

/*
 * FNCS Solos im Hub (wie /globals-solos der Seite, /api/globals-solos): fuer jede Region der Weg ins Grand Final (/api/solos-weg, mit "You are here"
 * fuer das verknuepfte Epic-Konto), Qualifizierte nach Weg, Heat-Einteilung, jeder Spieltag mit Karte / Bestenliste / Spieler / Laender, Preisgeld
 * (/api/solos-preisgeld). Laufende Reihe oder Archiv (?reihe=S42). Erneuert sich alle zwei Minuten, die Bestenliste waehrend eines Heats alle 30 s.
 * Die alten Unterseiten (/heats, /qualifiziert, /map, /laender) fuehren auf die Ansichten.
 * Aufbau (Design-System 3.0, 27.11.2026): schmales Kopfband (Turnierbild, Reihe, Live) und die Regionen als Chips; darunter links eine klebende
 * Leiste "Stages" - der Weg, die Qualifizierten, die Heats und jeder Spieltag als Zeitleiste mit Datum und Stand -, rechts der gewaehlte Teil.
 * Ein Spieltag zeigt die Karte als Werkbank (Karte ueber die Hoehe, daneben die Spieler - Klick fliegt zum Landepunkt).
 */

const REGIONEN = ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'];
const HAT_KARTE = new Set(['EU', 'NAC', 'NAW', 'ME', 'OCE']);
type Ansicht = 'karte' | 'bestenliste' | 'spieler' | 'laender';
const FEST = ['weg', 'qualifiziert', 'preisgeld', 'karte', 'heats'];

interface SSpieler { id: string; name: string; anzeige: string; land: string | null; bild?: string | null; rang?: number | null; punkte?: number | null }
interface SFenster { windowId: string; name: string; art: string; start: string | null; end: string | null; bild: string | null; spieler: SSpieler[]; formen: Array<{ punkte: Array<{ x: number; y: number }>; spieler: string[]; teams?: number; gruppen?: string[][] }> }
interface SStufe { windowId: string; eventId: string; name: string; art: string; status: 'live' | 'kommt' | 'vorbei'; begin: number; end: number; qualifiziert?: number; marken?: Array<{ token: string; bis: number }> }
interface SGruppe { quelle: string; art: string; windowId?: string; spieler: SSpieler[] }
interface Heats { quelle: string; ausMarken?: boolean; heats: Array<{ nr: number; begin: number; spieler: Array<{ id: string; name: string; land: string; rang: number; punkte: number }> }> }
interface Daten { region: string; stufen: SStufe[]; fenster: SFenster[]; qualifiziert: SGruppe[]; heatsPlan?: Heats[]; leereKarte?: { titel: string; url: string } }

const regionText = (r: string) => (r === 'GLOBAL' ? 'Global' : r);

/* ---------------------------------------------------------------- Spieler-Kachel */

/** Ein Spieler als Hochkant-Fotokarte (4:5), Name darunter. */
function Kachel({ s, unter }: { s: SSpieler; unter?: string }) {
  return (
    <Link to={`/competitive/player/${s.id}`} title={s.anzeige} className="group flex min-w-0 flex-col gap-2 text-left">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-black/50">
        <img src={s.bild!} alt="" loading="lazy" className="h-full w-full object-cover object-top transition duration-700 group-hover:scale-[1.06]" />
      </div>
      <p className="flex min-w-0 items-start gap-1.5 text-[11px] font-bold uppercase leading-tight text-white group-hover:text-akz">
        <img src={flaggenPfad(s.land)} alt="" className="mt-px h-3 w-3 shrink-0 rounded-full object-cover" /><span className="line-clamp-2 min-w-0 break-words">{s.anzeige}</span>
      </p>
      {unter && <p className="zahl -mt-1 text-[11px] font-semibold text-white/40">{unter}</p>}
    </Link>
  );
}
const RASTER = 'grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-9';
/** Spieler mit Foto als Fotokarten; wer keines hat, steht darunter als gleich grosse Namens-Zeile (kein Ersatzbild - Betreiber: "Profilbild oder gar nichts"). */
function Spielerliste({ spieler, unter, klein }: { spieler: SSpieler[]; unter?: (s: SSpieler) => string | undefined; klein?: boolean }) {
  const mit = spieler.filter((x) => x.bild), ohne = spieler.filter((x) => !x.bild);
  return (
    <>
      {mit.length > 0 && <div className={klein ? 'grid grid-cols-3 gap-x-2.5 gap-y-4 sm:grid-cols-4 lg:grid-cols-5' : RASTER}>{mit.map((x) => <Kachel key={x.id} s={x} unter={unter?.(x)} />)}</div>}
      {ohne.length > 0 && (
        <div className={`grid gap-1.5 ${klein ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'} ${mit.length ? 'mt-5' : ''}`}>
          {ohne.map((x) => (
            <Link key={x.id} to={`/competitive/player/${x.id}`} className="flex h-10 min-w-0 items-center gap-2 rounded-xl border border-white/[0.07] bg-black/30 px-2.5 text-[11px] font-bold uppercase tracking-wide text-white transition hover:border-akz/50">
              <img src={flaggenPfad(x.land)} alt="" className="h-4 w-4 shrink-0 rounded-full object-cover" /><span className="min-w-0 flex-1 truncate">{x.anzeige}</span>
              {unter?.(x) && <span className="zahl shrink-0 text-[10px] font-semibold text-white/40">{unter(x)}</span>}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
const Tafel = ({ children, className = '' }: { children: ReactNode; className?: string }) => <Flaeche fest className={`p-5 ${className}`}>{children}</Flaeche>;
const Kopf2 = ({ titel, zahl, rechts }: { titel: ReactNode; zahl?: ReactNode; rechts?: ReactNode }) => (
  <div className="flex flex-wrap items-center gap-3"><span className="h-6 w-1 rounded-full bg-akz" /><h2 className="titel text-3xl">{titel}</h2>{zahl != null && <span className="titel text-3xl !text-akz">{zahl}</span>}{rechts && <span className="ml-auto">{rechts}</span>}</div>
);

/* ---------------------------------------------------------------- Der Weg */

interface WZahl { zahl: number; ca?: boolean; mind?: boolean }
interface WKnoten { id: string; gruppe: string; status: 'live' | 'kommt' | 'vorbei'; spieler: WZahl | null; jeTag?: WZahl[]; schnitt: Array<{ rang: number; punkte: number | null }>; fenster: Array<{ name: string }>; von: number; bis: number | null; sofortPunkte?: number; preisgeld?: number; erster?: number }
interface WKante { von: string; nach: string; art: 'marke' | 'gesetzt' | 'finale'; text: string; spanne?: boolean; jeHeat?: boolean }
interface WDaten { knoten: WKnoten[]; kanten: WKante[]; herkunft: Array<{ von: string; zahl: number }> }
const KNAME: Record<string, string> = { q1r1: 'Round 1', q1r2: 'Round 2', q1r3: 'Round 3', ft: 'Fast Track', q2r1: 'Round 1', q2r2: 'Round 2', q2r3: 'Round 3', heats: 'Heats', lcq: 'LCQ', lcl: 'Last Chance Lobby', finale: 'Finals' };
const zz = (z: WZahl) => `${z.mind ? '≥ ' : z.ca ? '≈ ' : ''}${(z.ca ? Math.round(z.zahl / 100) * 100 : z.zahl).toLocaleString('en')}`;
const spanne = (von: number, bis: number | null) => {
  const a = datumKurz(von), b = bis ? datumKurz(bis) : a;
  return a === b ? a : `${a} – ${b}`;
};

function Kasten({ k, hier }: { k: WKnoten; hier: boolean }) {
  const live = k.status === 'live';
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`min-w-[170px] flex-1 rounded-2xl border p-3.5 ${live ? 'border-akz bg-akz/10 shadow-[0_0_24px_rgb(var(--akz)/0.25)]' : hier ? 'border-amber-300/70 bg-amber-300/[0.06]' : k.status === 'kommt' ? 'border-dashed border-white/10 bg-black/20' : 'border-white/[0.08] bg-black/40'}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="titel text-2xl">{KNAME[k.id] ?? k.id}</p>
        {live && <span className="inline-flex items-center gap-1 rounded-full bg-akz px-2 py-0.5 text-[10px] font-bold uppercase text-[#04050a]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#04050a]" />Live</span>}
        {!live && k.status === 'kommt' && <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-bold uppercase text-white/45">Upcoming</span>}
        {hier && <span className="rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-black uppercase text-[#04050a]">You</span>}
      </div>
      <p className="mt-0.5 text-[11px] text-white/40">{spanne(k.von, k.bis)}{(k.id === 'q1r1' || k.id === 'q2r1') && k.fenster.length > 1 ? ` · ${k.fenster.length} days` : ''}{k.id === 'heats' ? ` · ${k.fenster.length} heats` : ''}</p>
      <div className="mt-2 space-y-0.5 text-xs">
        {k.jeTag?.length ? <p className="font-semibold text-white/85">{k.jeTag.map(zz).join(' / ')} <span className="font-normal text-white/45">players per day</span></p> : null}
        {k.spieler && <p className="font-semibold text-white/85">{zz(k.spieler)} <span className="font-normal text-white/45">players</span></p>}
        {k.schnitt.length > 0 && (k.schnitt.every((s) => s.punkte === null)
          ? <p className="text-white/40">#{k.schnitt[0].rang.toLocaleString('en')} · no points yet</p>
          : <p className="font-semibold text-white/70">#{k.schnitt[0].rang.toLocaleString('en')} = <span className="tabular-nums">{k.schnitt.map((s) => (s.punkte === null ? '–' : s.punkte)).join(' / ')}</span> pts{live && <span className="ml-1 font-normal text-akz">(live)</span>}</p>)}
        {k.sofortPunkte ? <p className="font-semibold text-akz">{k.sofortPunkte.toLocaleString('en')} pts = straight through</p> : null}
      </div>
    </motion.div>
  );
}
function Pfeil({ k }: { k?: WKante }) {
  if (!k) return <span className="hidden w-6 shrink-0 sm:block" />;
  const farbe = k.art === 'finale' ? 'text-akz' : k.art === 'gesetzt' ? 'text-akz' : 'text-white/45';
  return (
    <div className={`flex shrink-0 flex-col items-center justify-center gap-1 px-1 py-1 sm:w-24 ${farbe}`}>
      <span className="text-center text-[11px] font-extrabold leading-tight">{k.text.replace(/Top (\d+)/, (_, n) => `Top ${Number(n).toLocaleString('en')}`)}{k.jeHeat && <span className="block text-[10px] font-semibold opacity-80">per heat</span>}</span>
      <span className="flex w-full items-center max-sm:h-6 max-sm:w-auto max-sm:flex-col">
        <span className={`flex-1 border-current max-sm:border-l-2 sm:border-t-2 ${k.art === 'gesetzt' ? 'border-dashed' : 'border-solid'}`} />
        <svg viewBox="0 0 10 10" className="h-2.5 w-2.5 max-sm:rotate-90 sm:-ml-1" fill="currentColor"><path d="M0 0l10 5-10 5z" /></svg>
      </span>
    </div>
  );
}

function WegPlan({ region }: { region: string }) {
  const { wer } = useWer();
  const [plan, setPlan] = useState<WDaten | null>(null);
  const [fehler, setFehler] = useState('');
  const [hier, setHier] = useState<{ knoten: string; name: string; rang: number; punkte: number } | null | 'keins'>(null);
  const [tief, setTief] = useState(false);
  const [sucht, setSucht] = useState(false);
  useEffect(() => {
    let weg = false; setPlan(null); setFehler('');
    const los = () => fetch(`/api/solos-weg?region=${encodeURIComponent(region)}`, { cache: 'no-store' }).then((r) => r.json())
      .then((j) => { if (!weg) { if (j.ok) setPlan(j); else setFehler(j.fehler || 'The road cannot be loaded right now.'); } })
      .catch(() => { if (!weg) setFehler('The road cannot be loaded right now.'); });
    void los();
    const i = setInterval(() => { if (document.visibilityState === 'visible') void los(); }, 120_000);
    return () => { weg = true; clearInterval(i); };
  }, [region]);
  const suche = useCallback(async (mitTief: boolean) => {
    if (!wer?.epicId) return;
    setSucht(true);
    try {
      const j = await fetch(`/api/solos-weg?region=${encodeURIComponent(region)}&wo=${wer.epicId}${mitTief ? '&tief=1' : ''}`, { cache: 'no-store' }).then((r) => r.json());
      setHier(j.ok && j.stand ? j.stand : 'keins'); setTief(mitTief);
    } catch { setHier('keins'); } finally { setSucht(false); }
  }, [region, wer?.epicId]);
  useEffect(() => { setHier(null); if (wer?.epicId) void suche(false); }, [suche, wer?.epicId]);

  if (fehler && !plan) return <FehlerZeile text={fehler} />;
  if (!plan) return <Laedt text="Loading the road …" />;
  const kn = (id: string) => plan.knoten.find((k) => k.id === id);
  const ka = (a: string, b: string) => plan.kanten.find((e) => e.von === a && e.nach === b);
  const hierId = hier && hier !== 'keins' ? hier.knoten : '';
  const reihen: Array<[string, string[]]> = [
    ['Qualifier 1', ['q1r1', 'q1r2', 'q1r3', kn('ft') ? 'ft' : 'heats']],
    ['Qualifier 2', kn('q2r1') ? ['q2r1', 'q2r2', 'q2r3', 'heats'] : []],
    ['Last Chance', ['lcq', 'lcl']],
  ];
  const finale = kn('finale');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-white/[0.08] bg-black/40 px-4 py-3 text-sm">
        <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-white/55">You are here</span>
        {!wer?.epicId && <span className="text-white/60">Link your Epic account on thecomphub.com to see where you stand on the road.</span>}
        {wer?.epicId && sucht && <span className="text-white/45">Searching …</span>}
        {wer?.epicId && !sucht && hier && hier !== 'keins' && <span className="text-white/85"><b className="text-akz">{KNAME[hier.knoten] ?? hier.name}</b> · {hier.name} — place <b className="tabular-nums">{hier.rang.toLocaleString('en')}</b>, {hier.punkte} pts</span>}
        {wer?.epicId && !sucht && hier === 'keins' && (
          <span className="text-white/50">{tief ? 'Your account is in no leaderboard of this region.' : 'Your account is in no list from round 3 (top 1,000).'}
            {!tief && <button type="button" onClick={() => void suche(true)} className="ml-1 font-semibold text-akz hover:underline">Search round 1, 2 and the Last Chance too</button>}</span>
        )}
      </div>
      {finale && (
        <div className="grid gap-x-8 gap-y-3 rounded-2xl border border-akz/40 bg-akz/[0.08] p-5 sm:grid-cols-[auto_auto_1fr] sm:items-end">
          <div>
            <p className="ueber">Grand Finals</p>
            <p className="titel mt-1 text-5xl">Finals</p>
            <p className="mt-1 text-xs text-white/60">{spanne(finale.von, finale.bis)}{finale.fenster.length > 1 ? ` · ${finale.fenster.length} days` : ''}{finale.spieler ? ` · ${zz(finale.spieler)} players` : ''}</p>
          </div>
          {finale.preisgeld ? <div><p className="ueber">Prize pool</p><p className="titel mt-1 text-5xl !text-amber-300">${finale.preisgeld.toLocaleString('en')}</p>{finale.erster ? <p className="mt-1 text-xs text-white/60">1st place · ${finale.erster.toLocaleString('en')}</p> : null}</div> : <span />}
          {plan.herkunft.length > 0 && <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-white/55 sm:justify-end">{plan.herkunft.map((h) => <li key={h.von}><b className="titel mr-1 text-2xl !text-white">{h.zahl}</b>{h.von === 'ft' ? 'from the Fast Track' : h.von === 'heats' ? 'from the heats' : 'from the Last Chance Lobby'}</li>)}</ul>}
        </div>
      )}
      <div className="space-y-5">
        {reihen.map(([titel, ids]) => {
          const da = ids.filter((id) => kn(id));
          if (!da.length) return null;
          return (
            <div key={titel}>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-akz">{titel}</p>
              <div className="flex flex-col items-stretch sm:flex-row">
                {da.map((id, i) => (
                  <div key={id} className="flex flex-1 flex-col sm:flex-row">
                    {i > 0 && <Pfeil k={ka(da[i - 1], id)} />}
                    <Kasten k={kn(id)!} hier={hierId === id} />
                  </div>
                ))}
                {ka(da[da.length - 1], 'finale') && <Pfeil k={ka(da[da.length - 1], 'finale')} />}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/5 pt-4 text-[11px] text-white/45">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-akz bg-akz/20" />Live now</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-6 border-t-2 border-white/45" />Epic token</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-6 border-t-2 border-dashed border-akz" />Set by Epic (no token)</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-6 border-t-2 border-akz" />Into the finals</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Bestenliste */

interface LbEintrag { rank: number; points: number; elims: number; games: number; wins: number; players: Array<{ id: string; name: string }>; matches?: Array<{ sessionId?: string; placement?: number; elims?: number; endTime?: string }> }

function Bestenliste({ f, stufe, zielText }: { f: SFenster; stufe?: SStufe; zielText?: string }) {
  const [e, setE] = useState<LbEintrag[] | null>(null);
  const [offen, setOffen] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const zuletzt = useRef(0);
  const live = stufe?.status === 'live';
  const abrufbar = !!stufe?.eventId && stufe.status !== 'kommt';
  useEffect(() => {
    if (!abrufbar || !stufe) { setE([]); return undefined; }
    let weg = false; zuletzt.current = 0; setE(null);
    const los = () => fetch(`/api/cup-leaderboard?event=${encodeURIComponent(stufe.eventId)}&window=${encodeURIComponent(stufe.windowId)}&limit=100`, { cache: 'no-store' }).then((r) => r.json()).then((j) => {
      if (weg || !Array.isArray(j?.entries)) return;
      // Nie zurueck auf einen aelteren Stand.
      const t = Date.parse(j.updated ?? '') || Date.now(); if (t < zuletzt.current) return; zuletzt.current = t;
      setE(j.entries);
    }).catch(() => { if (!weg) setE((x) => x ?? []); });
    void los();
    const i = live ? setInterval(() => { if (document.visibilityState === 'visible') void los(); }, 30_000) : null;
    return () => { weg = true; if (i) clearInterval(i); };
  }, [abrufbar, stufe, live]);
  const nach = useMemo(() => new Map(f.spieler.map((s) => [s.id, s])), [f]);
  const schwelle = stufe?.qualifiziert ?? stufe?.marken?.[0]?.bis;
  if (e === null) return <Laedt />;
  // Vor dem Start: die Startliste.
  const zeilen = e.length ? e.map((x) => ({ key: `${x.rank}`, rang: x.rank, s: nach.get(x.players[0]?.id) ?? { id: x.players[0]?.id ?? '', name: x.players[0]?.name ?? '—', anzeige: x.players[0]?.name ?? '—', land: null }, x }))
    : f.spieler.map((s, i) => ({ key: s.id, rang: i + 1, s, x: null as LbEintrag | null }));
  const gefiltert = q ? zeilen.filter((z) => z.s.anzeige.toLowerCase().includes(q.toLowerCase())) : zeilen;
  return (
    <Flaeche fest className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] px-4 py-3">
        <span className="h-4 w-1 rounded-full bg-akz" /><h3 className="titel text-2xl">{f.name}</h3>
        {live && <Marke ton="rot" puls>Live · every 30 s</Marke>}
        {!e.length && <span className="text-xs text-white/45">Not started yet — start list</span>}
        <Suche wert={q} setze={setQ} platz="Search a player …" className="ml-auto" />
      </div>
      <div className="overflow-x-auto">
        <table className="tabelle min-w-[560px]">
          <thead><tr><th className="w-12">#</th><th>Player</th><th className="w-20 !text-right">Points</th><th className="w-20 !text-right">Matches</th><th className="w-16 !text-right">Wins</th><th className="w-16 !text-right">Elims</th></tr></thead>
          <tbody>
            {gefiltert.map((z) => (
              <Fragment key={z.key}>
                <tr onClick={() => z.x && setOffen(offen === z.key ? null : z.key)} className={`${z.x ? 'cursor-pointer' : ''} ${schwelle && z.rang === schwelle ? '[&>td]:border-b-2 [&>td]:border-b-emerald-400/60' : ''}`}>
                  <td className={`zahl text-xs font-black ${schwelle && z.rang <= schwelle ? 'text-emerald-300' : 'text-white/40'}`}>{z.rang}</td>
                  <td><span className="flex items-center gap-2.5"><TeamFlagge groesse={20} laender={[z.s.land]} />{z.s.bild && <img src={z.s.bild} alt="" loading="lazy" className="h-9 w-[27px] shrink-0 rounded-md object-cover object-top" />}<span className="truncate font-bold uppercase text-white">{z.s.anzeige}</span></span></td>
                  <td className="zahl text-right font-bold text-white">{z.x ? z.x.points : '–'}</td>
                  <td className="zahl text-right text-white/60">{z.x?.games ?? '–'}</td>
                  <td className="zahl text-right text-white/60">{z.x?.wins ?? '–'}</td>
                  <td className="zahl text-right text-white/60">{z.x?.elims ?? '–'}</td>
                </tr>
                {offen === z.key && z.x && (
                  <tr className="!bg-black/40">
                    <td colSpan={6}>
                      <div className="flex flex-wrap gap-2">
                        {(z.x.matches ?? []).map((m, i) => (
                          <span key={m.sessionId ?? i} className="rounded-xl border border-white/[0.08] bg-black/40 px-3 py-1.5 text-xs text-white/70">Game {i + 1}: <b className={m.placement === 1 ? 'text-amber-300' : 'text-white'}>#{m.placement ?? '–'}</b> · {m.elims ?? 0} elims</span>
                        ))}
                        {!(z.x.matches ?? []).length && <span className="text-xs text-white/40">No match details.</span>}
                        <Link to={`/competitive/player/${z.s.id}`} className="knopf-leer ml-auto !text-xs">Player profile →</Link>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {schwelle && e.length > 0 && <p className="border-t border-white/[0.06] px-4 py-2.5 text-[11px] text-emerald-300/80">Top {schwelle} → {zielText ?? 'next stage'}</p>}
    </Flaeche>
  );
}

/* ---------------------------------------------------------------- Heats */

function HeatsPlan({ plan }: { plan: Heats }) {
  const [q, setQ] = useState('');
  const [nur, setNur] = useState<number | null>(null);
  const x = q.trim().toLowerCase();
  const passt = (s: { name: string; land: string }) => !x || s.name.toLowerCase().includes(x) || (!!s.land && (s.land.toLowerCase() === x || (x.length >= 3 && landName(s.land).toLowerCase().includes(x))));
  const treffer = x ? plan.heats.reduce((a, h) => a + h.spieler.filter(passt).length, 0) : 0;
  return (
    <div className="space-y-3">
      <div className="fl-fest flex flex-wrap items-center gap-x-4 gap-y-2.5 !rounded-2xl px-4 py-3">
        <div className="ohne-leiste flex max-w-full gap-1.5 overflow-x-auto">{[null, ...plan.heats.map((h) => h.nr)].map((n) => <button key={String(n)} type="button" onClick={() => setNur(n)} className={chip(nur === n)}>{n === null ? 'All heats' : `Heat ${n}`}</button>)}</div>
        <p className="text-xs text-white/45">{x ? `${treffer} players found` : plan.ausMarken ? 'Assignment confirmed by Epic.' : "Assigned by Epic's rule from the last round's placement — Epic confirms it later."}</p>
        <Suche wert={q} setze={setQ} platz="Search a player or country …" className="ml-auto sm:!w-72" />
      </div>
      <div className={`grid grid-cols-1 gap-3 ${nur === null ? '2xl:grid-cols-2' : ''}`}>
        {plan.heats.filter((h) => nur === null || h.nr === nur).map((h) => (
          <Flaeche key={h.nr} fest className="overflow-hidden">
            <div className="flex items-end justify-between border-b border-white/[0.06] px-5 py-3"><h3 className="titel text-4xl">Heat {h.nr}</h3><span className="zahl text-xs text-white/45">{datumKurz(h.begin)} · {h.spieler.length} players</span></div>
            <ol className={`columns-1 gap-0 sm:columns-2 ${nur === null ? '' : 'xl:columns-3'}`}>
              {h.spieler.map((s, i) => (
                <li key={s.id} className={`flex break-inside-avoid items-center gap-2.5 border-b border-white/[0.05] px-4 py-2 text-sm ${x ? (passt(s) ? 'bg-akz/10' : 'opacity-30') : ''}`}>
                  <span className={`zahl w-5 text-right text-xs font-bold ${i < 3 ? 'text-white' : 'text-white/40'}`}>{i + 1}</span>
                  <span className="zahl rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-white/45">{plan.quelle} #{s.rang}</span>
                  <TeamFlagge groesse={14} laender={[s.land || null]} />
                  <span className="min-w-0 flex-1 truncate font-extrabold uppercase text-white">{s.name}</span>
                  <span className="zahl font-bold text-white/70">{s.punkte}</span>
                </li>
              ))}
            </ol>
          </Flaeche>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Preisgeld */

function Preisgeld({ region }: { region: string }) {
  const [d, setD] = useState<{ ok: boolean; gruppen?: Array<{ id: string; name: string; waehrung: string; summe: number; plaetze: Array<{ platz: number; proSpieler: number; spanne: [number, number] }> }>; error?: string } | null>(null);
  useEffect(() => { let weg = false; setD(null); fetch(`/api/solos-preisgeld?region=${encodeURIComponent(region)}`).then((r) => r.json()).then((j) => { if (!weg) setD(j); }).catch(() => { if (!weg) setD({ ok: false }); }); return () => { weg = true; }; }, [region]);
  if (!d) return <Laedt />;
  if (!d.ok || !d.gruppen?.length) return <Leer text="Epic is not publishing a payout table for this region right now." />;
  const usd = (n: number) => `$${n.toLocaleString('en')}`;
  const gold = ['#facc15', '#cbd5e1', '#f59e0b'];
  return (
    <div className={`grid grid-cols-1 gap-3 ${d.gruppen.length > 1 ? '2xl:grid-cols-2' : ''}`}>
      {d.gruppen.map((g) => {
        const max = Math.max(1, ...g.plaetze.map((p) => p.proSpieler));
        return (
          <Flaeche key={g.id} fest className="overflow-hidden">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
              <div><p className="ueber">{g.name}</p><p className="titel mt-1 text-6xl !text-amber-300"><Zaehler wert={g.summe} format={usd} /></p></div>
              <p className="zahl text-sm text-white/50">{g.plaetze.length} paid places · {g.waehrung || 'USD'}</p>
            </div>
            <ul>
              {g.plaetze.map((p, i) => (
                <li key={p.platz} className="flex items-center gap-4 border-b border-white/[0.05] px-5 py-2 last:border-b-0">
                  <span className="titel w-20 shrink-0 text-2xl" style={{ color: gold[i] ?? 'rgba(255,255,255,.45)' }}>{p.spanne[0] !== p.spanne[1] ? `${p.spanne[0]}–${p.spanne[1]}` : `#${p.platz}`}</span>
                  <span className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.06]"><motion.span className="absolute inset-y-0 left-0 rounded-full" style={{ background: gold[i] ?? 'rgb(var(--akz))' }} initial={{ width: 0 }} whileInView={{ width: `${(p.proSpieler / max) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.8, delay: Math.min(i, 12) * 0.03 }} /></span>
                  <span className="zahl w-24 shrink-0 text-right text-base font-bold text-white">{usd(p.proSpieler)}</span>
                </li>
              ))}
            </ul>
          </Flaeche>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- Seite */

export default function GlobalsSolos() {
  const { wer } = useWer();
  const ort = useLocation();
  const [adresse, setAdresse] = useSearchParams();
  const alt = ort.pathname.split('/')[3] ?? '';
  const archiv = /^S\d{2}$/.test((adresse.get('reihe') ?? '').toUpperCase()) ? (adresse.get('reihe') ?? '').toUpperCase() : '';
  const [region, setRegion] = useState(() => {
    const r = (adresse.get('region') ?? (() => { try { return localStorage.getItem('solos_region'); } catch { return null; } })() ?? 'EU').toUpperCase();
    return REGIONEN.includes(r) ? r : 'EU';
  });
  const [stufe, setStufe] = useState('');
  const [ansicht, setAnsicht] = useState<Ansicht>(() => (['karte', 'bestenliste', 'spieler', 'laender'].includes(adresse.get('ansicht') ?? '') ? adresse.get('ansicht') as Ansicht : alt === 'laender' ? 'laender' : 'karte'));
  const [daten, setDaten] = useState<Daten | null>(null);
  const [fehler, setFehler] = useState('');
  const [neuLaedt, setNeuLaedt] = useState(false);
  const gewaehltFuer = useRef('');

  const merke = (r: string, st: string, an: Ansicht | '') => {
    try { localStorage.setItem('solos_region', r); } catch { /* ohne Speicher */ }
    const p = new URLSearchParams(adresse); p.set('region', r); p.set('stufe', st); if (an) p.set('ansicht', an); else p.delete('ansicht'); p.delete('tab');
    setAdresse(p, { replace: true });
  };
  const holen = useCallback(async (veraltet: () => boolean, frisch = false) => {
    try {
      const r = await fetch(`/api/globals-solos?region=${encodeURIComponent(region)}${archiv ? `&reihe=${archiv}` : ''}${frisch ? '&frisch=1' : ''}`, { cache: 'no-store' });
      const j = await r.json();
      if (veraltet()) return;
      if (!r.ok || !j.ok) throw new Error(j.error || 'Not available');
      setDaten(j); setFehler('');
    } catch (e) { if (!veraltet()) setFehler((e as Error).message); }
  }, [region, archiv]);
  useEffect(() => {
    let weg = false; setDaten(null); setFehler(''); gewaehltFuer.current = '';
    void holen(() => weg);
    const i = setInterval(() => { if (document.visibilityState === 'visible') void holen(() => weg); }, 120_000);
    return () => { weg = true; clearInterval(i); };
  }, [holen]);

  const spieltage = useMemo(() => (daten?.fenster ?? []).filter((x) => x.art === 'heat' || x.art === 'finale' || /fast|last chance|lcq/i.test(x.name))
    .sort((a, b) => String(a.start ?? '').localeCompare(String(b.start ?? ''))), [daten]);
  const stufeZu = useCallback((x: SFenster | undefined): SStufe | undefined => {
    if (!x || !daten) return undefined;
    const genau = daten.stufen.find((y) => y.windowId === x.windowId); if (genau) return genau;
    const b = Date.parse(x.start ?? ''); if (!Number.isFinite(b)) return undefined;
    const lc = /last chance|lcq/i.test(x.name);
    return daten.stufen.filter((y) => y.art !== 'qualifier' && (lc ? y.art === 'lcq' || y.art === 'lcq-finale' : true))
      .sort((p, q) => Math.abs(p.begin - b) - Math.abs(q.begin - b)).find((y) => Math.abs(y.begin - b) < 6 * 3_600_000);
  }, [daten]);
  const statusVon = (x: SFenster) => stufeZu(x)?.status ?? (Date.parse(x.start ?? '') > Date.now() ? 'kommt' : 'vorbei');
  const heatsPlan = daten?.heatsPlan?.[0] ?? null;

  // Erste Wahl: Adresse (auch alte Unterseiten), sonst die laufende Stufe, sonst die Heat-Einteilung, sonst das Finale mit Karte, sonst der Weg.
  useEffect(() => {
    if (!daten || gewaehltFuer.current === region) return;
    gewaehltFuer.current = region;
    const nameZu = (w: (x: SFenster) => boolean) => spieltage.find(w)?.name ?? '';
    const altZu: Record<string, string> = { heats: heatsPlan ? 'heats' : nameZu((x) => x.art === 'heat'), qualifiziert: 'qualifiziert', map: nameZu((x) => x.art === 'finale') || 'karte', laender: nameZu((x) => x.art === 'finale') };
    let ziel = stufe || adresse.get('stufe') || altZu[adresse.get('tab') ?? ''] || altZu[alt] || '';
    if (ziel && !FEST.includes(ziel) && !spieltage.some((x) => x.name === ziel)) ziel = '';
    if (!ziel) {
      const laufend = spieltage.find((x) => statusVon(x) === 'live');
      const finale = HAT_KARTE.has(region) ? spieltage.find((x) => x.art === 'finale' && x.formen.length) : undefined;
      ziel = laufend?.name ?? (heatsPlan ? 'heats' : finale?.name) ?? 'weg';
    }
    setStufe(ziel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daten, region, spieltage]);

  const waehleRegion = (r: string) => { setRegion(r); merke(r, stufe, FEST.includes(stufe) ? '' : ansicht); };
  const waehleStufe = (st: string) => { setStufe(st); merke(region, st, FEST.includes(st) ? '' : ansicht); };
  const waehleAnsicht = (a: Ansicht) => { setAnsicht(a); merke(region, stufe, a); };

  const reihe = (daten?.fenster.length ? daten.fenster : daten?.stufen ?? []).some((s) => /reload/i.test(s.windowId)) ? 'reload' : 'br';
  const bild = reihe === 'reload' ? '/cups/fncs-solo-reload.webp' : '/cups/fncs-solos.jpg';
  const live = daten?.stufen.some((s) => s.status === 'live');
  const f = spieltage.find((x) => x.name === stufe);
  const st = stufeZu(f);
  const aufKarte = f ? new Set(f.formen.flatMap((fo) => fo.spieler)).size : 0;
  const formen = useMemo(() => formenVon(f?.formen ?? []), [f]);
  const qualZahl = daten?.qualifiziert.reduce((a, g) => a + g.spieler.length, 0) ?? 0;
  const zielText = `FNCS Solos${reihe === 'reload' ? ' Reload' : ''} ${st?.art === 'heat' || /fast/i.test(st?.name ?? '') ? 'Grand Finals' : 'next stage'}`;
  const [zeige, setZeige] = useState<{ namen: string[]; n: number } | null>(null);
  const [kartenSuche, setKartenSuche] = useState('');
  const springe = (namen: string[]) => setZeige((alt) => ({ namen, n: (alt?.n ?? 0) + 1 }));
  const aufKarteNamen = useMemo(() => new Set((f?.formen ?? []).flatMap((fo) => fo.spieler.map((n) => n.toLowerCase()))), [f]);

  /** Ein Eintrag der Leiste "Stages" - auf dem Rechner eine Zeile der Zeitleiste, auf dem Handy ein Chip. */
  const stufeKnopf = (k: string, titel: ReactNode, unter?: string, zustand?: 'live' | 'kommt' | 'vorbei') => {
    const an = stufe === k;
    return (
      <button key={k} type="button" onClick={() => waehleStufe(k)}
        className={`relative flex shrink-0 items-center gap-3 rounded-xl px-3 py-2 text-left transition lg:w-full ${an ? 'bg-akz/[0.12] text-white' : 'text-white/60 hover:bg-white/[0.04] hover:text-white'}`}>
        {an && <motion.span layoutId="solos-stufe" className="absolute inset-y-2 left-0 hidden w-[3px] rounded-full bg-akz shadow-[0_0_14px_rgb(var(--akz)/0.9)] lg:block" />}
        <span className={`h-2 w-2 shrink-0 rounded-full ${zustand === 'live' ? 'animate-pulse bg-red-400' : zustand === 'vorbei' ? 'bg-emerald-400/70' : zustand === 'kommt' ? 'border border-white/30' : an ? 'bg-akz' : 'bg-white/20'}`} />
        <span className="min-w-0 flex-1"><span className="block whitespace-nowrap text-[13px] font-semibold lg:truncate">{titel}</span>{unter && <span className="zahl hidden text-[10px] text-white/40 lg:block">{unter}</span>}</span>
        {zustand === 'live' && <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-red-300">Live</span>}
      </button>
    );
  };
  const tagUnter = (x: SFenster) => [x.start ? datumKurz(x.start) : '', x.spieler.length ? `${x.spieler.length} players` : ''].filter(Boolean).join(' · ');

  return (
    <div className="-mt-2 space-y-3">
      <KopfBand bild={<Bild src={bild} className="hidden aspect-video h-[72px] shrink-0 rounded-2xl sm:block" />}
        ueber={reihe === 'reload' ? 'FNCS · Reload · Road to the Grand Finals' : 'FNCS · Battle Royale · Road to the Grand Finals'}
        titel={<>FNCS Solos{reihe === 'reload' ? ' Reload' : ''} <span className="text-akz">{regionText(region)}</span></>}
        marken={<>
          {live && <Marke ton="rot" puls>Live</Marke>}
          {daten && <Marke><span className="zahl">{qualZahl}</span> qualified</Marke>}
          <span className="text-xs text-white/45">Qualifiers, fast tracks, heats, last chance, finals and the drop spots — for every region.</span>
        </>}
        rechts={<Segment id="solos-reihe" wert={archiv === 'S42' ? 'archiv' : 'jetzt'} wahl={[{ k: 'jetzt', titel: 'FNCS Reload Solo' }, { k: 'archiv', titel: 'FNCS Solos' }]}
          onWahl={(k) => { const p = new URLSearchParams(adresse); if (k === 'archiv') p.set('reihe', 'S42'); else p.delete('reihe'); setAdresse(p); }} />} />

      <div className="ohne-leiste flex items-center gap-1.5 overflow-x-auto">
        <span className="mr-1 shrink-0 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">Region</span>
        {REGIONEN.map((r) => {
          const fb = REGION_FARBE[r] ?? '#38bdf8';
          return <button key={r} type="button" onClick={() => waehleRegion(r)} title={REGION_NAME[r]} className="chip !px-4 !font-bold"
            style={region === r ? { background: fb, borderColor: fb, color: '#04050a' } : { color: fb }}>{r}</button>;
        })}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[230px_minmax(0,1fr)] lg:items-start">
        {/* Leiste: alle Teile der Reihe als Zeitleiste */}
        <aside className="fl-fest min-w-0 p-2 lg:sticky lg:top-[7.5rem] lg:max-h-[calc(100vh-8.5rem)] lg:overflow-y-auto">
          <p className="hidden px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40 lg:block">Stages</p>
          <nav className="ohne-leiste flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {stufeKnopf('weg', 'The road', 'How to reach the finals')}
            {stufeKnopf('qualifiziert', 'Qualified', daten ? `${qualZahl} players` : undefined)}
            {heatsPlan && stufeKnopf('heats', 'Heat assignment', `${heatsPlan.heats.length} heats`)}
            {!spieltage.length && daten?.leereKarte && stufeKnopf('karte', 'Map')}
            {spieltage.length > 0 && <span className="mx-1 my-1 w-px shrink-0 bg-white/10 lg:mx-3 lg:my-1.5 lg:h-px lg:w-auto" />}
            {spieltage.map((x) => stufeKnopf(x.name, x.name, tagUnter(x), statusVon(x)))}
            <span className="mx-1 my-1 w-px shrink-0 bg-white/10 lg:mx-3 lg:my-1.5 lg:h-px lg:w-auto" />
            {stufeKnopf('preisgeld', 'Prize pool')}
            {wer?.isAdmin && <button type="button" disabled={neuLaedt} onClick={async () => { setNeuLaedt(true); try { await holen(() => false, true); } finally { setNeuLaedt(false); } }}
              className="knopf shrink-0 !py-1.5 !text-xs lg:mt-1">
              <svg viewBox="0 0 20 20" className={`h-3.5 w-3.5 ${neuLaedt ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M16 10a6 6 0 1 1-1.8-4.3M16 3v4h-4" /></svg>Reload</button>}
          </nav>
        </aside>

        <div className="min-w-0 space-y-3">
          {f && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <h2 className="titel text-4xl">{f.name}</h2>
              {statusVon(f) === 'live' ? <Marke ton="rot" puls>Live</Marke> : statusVon(f) === 'kommt' ? <Marke ton="akz">Upcoming</Marke> : <Marke>Ended</Marke>}
              {f.start && <span className="zahl text-xs text-white/45">{datumKurz(f.start)}</span>}
              <span className="ml-auto"><Segment id="solos-ansicht" wert={ansicht} onWahl={waehleAnsicht} wahl={[{ k: 'karte', titel: 'Map' }, { k: 'bestenliste', titel: 'Leaderboard' }, { k: 'spieler', titel: 'Players' }, { k: 'laender', titel: 'Countries' }]} /></span>
            </div>
          )}

          {!daten && !fehler && stufe !== 'preisgeld' && <Laedt />}
          {fehler && !daten && stufe !== 'preisgeld' && <FehlerZeile text={fehler} />}

          {daten && stufe === 'weg' && (
            <>
              <Tafel>
                <Kopf2 titel="The road to the Grand Finals" />
                <p className="mt-2 max-w-3xl text-sm text-white/50">Every arrow is an Epic token: the reward of one round is the entry requirement of the next. All numbers come from Epic's leaderboards and payout tables.</p>
                <div className="mt-5"><WegPlan region={region} /></div>
              </Tafel>
              {qualZahl > 0 && (
                <Tafel>
                  <Kopf2 titel="Already in the Grand Finals" zahl={qualZahl} rechts={<button type="button" onClick={() => waehleStufe('qualifiziert')} className="knopf-leer">See all →</button>} />
                  <div className="mt-5"><Spielerliste spieler={(() => { const a = daten.qualifiziert.flatMap((g) => g.spieler); return [...a.filter((s) => s.bild), ...a.filter((s) => !s.bild)].slice(0, 18); })()} /></div>
                </Tafel>
              )}
            </>
          )}
          {daten && stufe === 'karte' && daten.leereKarte && (
            <Tafel><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><Kopf2 titel={daten.leereKarte.titel} /><p className="text-xs text-white/45">Drop spots appear once the first round is played.</p></div>
              <img src={daten.leereKarte.url} alt="" className="mx-auto block w-full max-w-4xl rounded-2xl" /></Tafel>
          )}
          {daten && stufe === 'qualifiziert' && (
            <>
              <Kopf2 titel="Qualified for the Grand Finals" zahl={qualZahl} rechts={<span className="text-xs text-white/45">Grouped by the road: fast tracks, heats, last chance.</span>} />
              {!daten.qualifiziert.length ? <Leer text="Nobody has qualified yet." /> : daten.qualifiziert.map((g) => {
                const titel = g.art === 'heat' ? g.quelle : /fast/i.test(g.quelle) ? 'Fast Tracks' : /last chance|lcq/i.test(g.quelle) ? g.quelle : 'Other';
                const text = g.art === 'heat' ? 'Through the heat into the Grand Finals' : /fast/i.test(g.quelle) ? 'Straight into the Grand Finals' : /last chance|lcq/i.test(g.quelle) ? 'Through the Last Chance into the Grand Finals' : 'Another road — not tied to a stage';
                const ft = /fast/i.test(g.quelle) ? daten.stufen.find((s) => s.art === 'fasttrack')?.qualifiziert : undefined;
                return (
                  <Tafel key={g.windowId ?? g.quelle}>
                    <div className="flex flex-wrap items-end gap-x-3 gap-y-1"><h3 className="titel text-3xl">{titel}</h3><span className="titel text-3xl !text-akz">{g.spieler.length}</span>{ft && <Marke ton="akz">Top {ft} → Grand Finals</Marke>}<p className="ml-auto text-[11px] text-white/40">{text}</p></div>
                    <div className="mt-4"><Spielerliste spieler={g.spieler} unter={(s) => (s.rang != null ? `#${s.rang}${s.punkte != null ? ` · ${s.punkte} pts` : ''}` : undefined)} /></div>
                  </Tafel>
                );
              })}
              {daten.fenster.some((x) => x.art === 'heat') && (
                <>
                  <Kopf2 titel="Qualified for the heats" zahl={daten.fenster.filter((x) => x.art === 'heat').reduce((a, x) => a + x.spieler.length, 0)} />
                  <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {daten.fenster.filter((x) => x.art === 'heat').map((h) => (
                      <Tafel key={h.windowId}><p className="titel text-2xl">{h.name} <span className="zahl font-text text-xs font-semibold normal-case tracking-normal text-white/40">{h.spieler.length}</span></p><div className="mt-3 max-h-[26rem] overflow-y-auto pr-1"><Spielerliste spieler={h.spieler} klein /></div></Tafel>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
          {stufe === 'heats' && heatsPlan && <HeatsPlan plan={heatsPlan} />}
          {stufe === 'preisgeld' && <Preisgeld region={region} />}

          {daten && f && ansicht === 'karte' && (
            !HAT_KARTE.has(region) ? <Leer text="There is no drop-spot source for this region." />
              : !f.formen.length ? <Leer text="No drop spots for this day yet." />
                : (
                  <Werkbank rechts={(
                    <Dock titel="On the map" zahl={`${aufKarte}/${f.spieler.length || aufKarte} players`}
                      kopf={<input value={kartenSuche} onChange={(e) => setKartenSuche(e.target.value)} placeholder="Search a player …" className="eingabe w-full !py-2 !text-[13px]" />}
                      fuss="Click a player to fly to the drop spot. Wheel zooms, drag moves, Ctrl + F searches.">
                      <ul className="grid grid-cols-1 2xl:grid-cols-2">
                        {f.spieler.filter((x) => !kartenSuche.trim() || x.anzeige.toLowerCase().includes(kartenSuche.trim().toLowerCase())).map((x, i) => {
                          const drauf = aufKarteNamen.has(x.name.toLowerCase()) || aufKarteNamen.has(x.anzeige.toLowerCase());
                          return (
                            <li key={x.id}>
                              <button type="button" disabled={!drauf} onClick={() => springe([x.name, x.anzeige])} className={`flex h-12 w-full items-center gap-2.5 border-b border-white/[0.05] px-3 text-left transition ${drauf ? 'hover:bg-akz/[0.08]' : 'opacity-45'}`}>
                                <span className="zahl w-7 shrink-0 text-xs font-black text-white/40">{x.rang ?? i + 1}</span>
                                <TeamFlagge groesse={18} laender={[x.land]} />
                                <span className="min-w-0 flex-1 truncate text-[12px] font-bold uppercase tracking-wide text-white">{x.anzeige}</span>
                                {x.punkte != null && <span className="zahl text-[11px] font-semibold text-white/50">{x.punkte}</span>}
                                {x.bild && <img src={x.bild} alt="" loading="lazy" className="h-9 w-[27px] shrink-0 rounded-md object-cover object-top" />}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </Dock>
                  )}>
                    <KartenAnsicht key={f.windowId} formen={formen} bild={f.bild} rotAb={2} deckel="none" zeige={zeige} titel={`fncs-solos-${region}-${f.name}`} />
                  </Werkbank>
                )
          )}
          {daten && f && ansicht === 'bestenliste' && <Bestenliste key={f.windowId} f={f} stufe={st} zielText={zielText} />}
          {daten && f && ansicht === 'spieler' && <Tafel><Kopf2 titel="Players" zahl={f.spieler.length} /><div className="mt-4">{f.spieler.length ? <Spielerliste spieler={f.spieler} /> : <p className="py-6 text-center text-sm text-white/45">No players yet.</p>}</div></Tafel>}
          {daten && f && ansicht === 'laender' && <Tafel className="max-w-4xl"><Kopf2 titel="Players by country" /><div className="mt-4"><LaenderListe spieler={[...new Map(f.spieler.map((s) => [s.id, s])).values()]} /></div></Tafel>}
        </div>
      </div>
    </div>
  );
}
