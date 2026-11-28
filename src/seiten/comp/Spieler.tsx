import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Flaeche, Marke, Zaehler } from '../../ds/Bausteine';
import { SEITE, flagge } from '../../teile/Glas';
import { zahl } from './events/gemeinsam';

/*
 * Spielerprofil im Hub (/competitive/player/:id), neu komponiert (Design-System 3.0, 28.11.2026).
 * Betreiber: "zu wenig Infos - die alten haben mir viel mehr gefallen" -> alles, was das alte Profil (Hub und /statistics der Seite) hatte, und dazu
 * ein Zeitraum-Waehler (alle Zeit, Jahre, jede Saison mit Daten), der die Zahlen umschaltet.
 *
 *   Buehne     Foto hochkant, Name, Land/Region, Epic-Name (auch fruehere Namen), Org (seit), Socials, Power Ranking, Regional-/Weltrang,
 *              Ranked (nur laufende Rangsaisons), rechts Preisgeld (Karriere, dieses Jahr) und Titel. Dahinter ein echtes Event-Foto aus der Galerie.
 *   Zeitraum   Chips: All time · Jahre · Saisons (mit Saisonbild) - steht in der Adresse (?zeit=S42 / ?zeit=jahr:2026), klebt beim Scrollen
 *   Kennzahlen Preisgeld, Spieltage, Matches, Siege, Top 10, Bester Platz, Schnitt, Elims, Schaden, Quote - fuer den Zeitraum
 *   Mitte      links der ganze Turnierverlauf des Zeitraums als dichte Tabelle (Filter: alle / Finals / Top 10 / Preisgeld),
 *              rechts alle Werte, Vergleich mit dem Feld, Platzierungsverteilung, Preisgeld je Jahr (Klick waehlt das Jahr)
 *   Unten      FNCS-Platzierungen, LAN-Events, Top-Platzierungen, Beste Spieltage, Teamverlauf, Galerie mit Clips, Links
 *
 * Daten: /api/szene-stats?spieler=<id>[&saison=S42|&jahr=2026] (Werte, Verlauf, FNCS, LAN, Erfolge, Perzentile, Rang),
 * /api/spieler-verlauf?id=<id> (jeder Spieltag aus Epics Bestenlisten, Power Ranking, zuletzt gesehen), /api/orgs (Org + Socials),
 * /api/teamverlauf?spieler=<id>, /api/cup-ranked?ids=<id> + ?tracks=1, /api/galerie?spieler=<id>.
 * Fotos: hochkant oder gar nichts - nie Buchstaben (Betreiber).
 */

/* ---------------------------------------------------------------- Typen */
interface Werte { eliminations?: number; matchesPlayed?: number; damageDealt?: number }
interface Mit { epicId?: string; id?: string; name: string; land?: string }
interface Zeile {
  event: string; titel?: string; windowId: string; region?: string; season?: string; datum?: number | null; platz?: number | null; punkte?: number | null;
  matches?: number; werte?: Werte; verdienst?: number | null; gesamt?: boolean; replayElims?: number; mitspieler?: Mit[];
}
interface Lan { kennung?: string; name?: string; fenster?: string; ort?: string; platz?: number; betrag?: number; season?: string; datum?: number; mit?: Mit[] }
interface Sp {
  epicId: string; name: string; namen?: string[]; anzeige?: string; land?: string | null; heimat?: string; bild?: string | null; x?: string | null; twitch?: string | null;
  regionen?: string[]; events?: number; matches?: number; elims?: number; assists?: number; reboots?: number; shots?: number; hits?: number; headshots?: number;
  damage?: number; damageTaken?: number; heals?: number; stormDamage?: number; mats?: number; builds?: number; distanz?: number; timeInStorm?: number;
  timeAlive?: number; quote?: number; genauigkeit?: number; elimsProMatch?: number; damageProMatch?: number; matchesElims?: number; matchesSchaden?: number;
}
interface Profil {
  spieler?: Sp | null;
  perzentile?: Record<string, number> & { feldgroesse?: number };
  rang?: { global: number; globalVon: number; regional: number | null; regionalVon: number; region: string } | null;
  fncs?: { titel: number; saisons: Array<{ saison: string; platz: number }> } | null;
  fncsTafel?: Array<{ saison: string; platz: number; typ: string; mitspieler: Mit[]; datum: number | null }>;
  erfolge?: Array<{ titel: string; season: string; platz: number; typ: string; datum: number; saisonName?: string; mitspieler: Mit[] }>;
  lan?: Lan[]; verlauf?: Zeile[]; epicZeilen?: Zeile[];
  tagesbest?: Array<{ event: string; elims: number; damage: number; matches: number; saisonName?: string; region: string }>;
  saisonNamen?: Record<string, string>; saisonBilder?: Record<string, string | null>;
}
/** Ein Spieltag aus Epics Bestenlisten (/api/spieler-verlauf). */
interface Tag {
  w: string; titel: string; runde?: string; region: string; saison: string; finale?: boolean; datum: number;
  teams?: number; platz?: number; punkte?: number; matches?: number; preis?: number; mitspieler?: Array<{ id: string; name: string }>;
}
interface Index { name?: string; epicName?: string; alteNamen?: string[]; pr?: { platz: number; punkte: number } | null; region?: string; zuletzt?: number; saisonNamen?: Record<string, string>; zeilen?: Tag[] }
interface OrgSpieler { epicId: string; x?: string | null; twitch?: string | null; tiktok?: string | null; youtube?: string | null; seit?: string; liquipedia?: string | null; rolle?: string }
interface Org { id: string; name: string; logo?: string | null; spieler: OrgSpieler[] }
interface TeamEintrag { team: string; logo?: string | null; seit?: string; bis?: string | null; aktuell?: boolean }
interface Rang { trackguid: string; rankingType: string; division: number; divisionName?: string; ranking: number | null; gespielt?: boolean }
interface GalerieEintrag { id: string; eventId?: string; art: 'bild' | 'video'; datei?: string; url?: string; titel?: string }
interface Galerie { events?: Array<{ id: string; name: string }>; eintraege?: GalerieEintrag[] }

/* ---------------------------------------------------------------- Helfer */
const landName = (l?: string | null) => {
  if (!l || !/^[a-z]{2}$/i.test(l)) return null;
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(l.toUpperCase()) ?? l.toUpperCase(); } catch { return l.toUpperCase(); }
};
const geld = (n: number) => `$${zahl(Math.round(n))}`;
const geldKurz = (n: number) => (n >= 1e6 ? `$${zahl(n / 1e6, 2)}M` : n >= 1e5 ? `$${zahl(n / 1e3, 0)}K` : geld(n));
/** Die Seite liefert Spieltag-Namen teils deutsch - fuer die englische Oberflaeche. */
const englisch = (s = '') => s.replace(/\bRunde\b/g, 'Round').replace(/\bTag\b/g, 'Day').replace(/\bFinale\b/g, 'Final').replace(/\bFinals - Day/g, 'Finals · Day');
const tagText = (ms?: number | null) => (ms ? new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const zeitText = (s?: number) => { if (!s) return '—'; const h = Math.floor(s / 3600); const m = Math.round((s % 3600) / 60); return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`; };
const jahrVon = (ms?: number | null) => (ms ? new Date(ms).getFullYear() : 0);
const saisonNr = (k: string) => Number(k.replace(/\D/g, '')) || 0;
/** Epic benennt Rangsaisons mit Decknamen - nur was sich sicher ablesen laesst (wie die Seite), sonst faellt die Zeile weg. */
function rangArt(typ: string): string | null {
  const k = typ.toLowerCase();
  if (k.includes('-solo-')) return 'Solo';
  if (k.includes('-duos-')) return 'Duos';
  if (k.includes('-trios-')) return 'Trios';
  if (k.includes('competitive')) return 'Competitive';
  if (k.includes('-br-') || k.endsWith('-br')) return 'Battle Royale';
  if (k.includes('-zb-') || k.endsWith('-zb')) return 'Zero Build';
  if (k.includes('reload')) return 'Reload';
  if (k.includes('-og-') || k.endsWith('-og')) return 'OG';
  return null;
}

/** Preisgeld aus Verlauf + LAN-Datei - jeder Posten genau einmal (dieselbe Rechnung wie die Seite). */
function preisgeld(alle: Zeile[], lan: Lan[]): number {
  let s = 0;
  for (const z of alle) if (typeof z.verdienst === 'number' && z.verdienst > 0) s += z.verdienst;
  for (const l of lan) if (l.betrag && l.betrag > 0 && !lanDoppelt(l, alle)) s += l.betrag;
  return s;
}
const lanDoppelt = (l: Lan, alle: Zeile[]) => { const kern = (l.fenster ?? '').split('_')[0]; return !!kern && alle.some((z) => (z.verdienst ?? 0) > 0 && z.windowId.split('_')[0] === kern); };
/** Holt JSON mit Frist und Wiederholung (ein nie geoeffnetes Profil rechnet der Server erst - wie auf der Seite). */
async function holen<T>(url: string, versuche = 3): Promise<T> {
  let letzter: unknown = null;
  for (let i = 0; i < versuche; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(25_000) });
      if (r.ok) return await r.json() as T;
      letzter = new Error(String(r.status));
    } catch (e) { letzter = e; }
    await new Promise((w) => setTimeout(w, 1500 * (i + 1)));
  }
  throw letzter;
}

const SOZIAL: Array<{ feld: 'x' | 'twitch' | 'youtube' | 'tiktok' | 'liquipedia'; name: string; url: (h: string) => string }> = [
  { feld: 'x', name: 'X', url: (h) => `https://x.com/${h}` },
  { feld: 'twitch', name: 'Twitch', url: (h) => `https://twitch.tv/${h}` },
  { feld: 'youtube', name: 'YouTube', url: (h) => (h.startsWith('http') ? h : `https://youtube.com/@${h.replace(/^@/, '')}`) },
  { feld: 'tiktok', name: 'TikTok', url: (h) => `https://tiktok.com/@${h.replace(/^@/, '')}` },
  { feld: 'liquipedia', name: 'Liquipedia', url: (h) => `https://liquipedia.net/fortnite/${h}` },
];
const PERZENTILE: Array<[string, string]> = [['elims', 'Eliminations'], ['damage', 'Damage'], ['quote', 'Damage ratio'], ['builds', 'Builds'], ['timeAlive', 'Time alive'], ['headshots', 'Headshots'], ['mats', 'Materials'], ['genauigkeit', 'Accuracy'], ['reboots', 'Reboots']];
type Filter = 'alle' | 'finals' | 'top10' | 'geld';

/* ---------------------------------------------------------------- kleine Teile */
function Karte({ titel, rechts, children, className = '' }: { titel: ReactNode; rechts?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Flaeche fest className={`overflow-hidden ${className}`}>
      <div className="flex items-baseline justify-between gap-3 border-b border-white/[0.06] px-5 py-3.5">
        <h2 className="titel text-2xl">{titel}</h2>
        {rechts && <span className="zahl truncate text-[11px] text-white/40">{rechts}</span>}
      </div>
      {children}
    </Flaeche>
  );
}
function Platz({ p, gross = false }: { p?: number | null; gross?: boolean }) {
  if (!p) return <span className="text-white/30">—</span>;
  const farbe = p === 1 ? '!text-amber-300' : p <= 3 ? '!text-akz' : p <= 10 ? '!text-white' : '!text-white/60';
  return <span className={`titel zahl ${gross ? 'text-3xl' : 'text-xl'} ${farbe}`}>#{zahl(p)}</span>;
}
function Mitspieler({ mit, className = '' }: { mit?: Mit[]; className?: string }) {
  if (!mit?.length) return null;
  return (
    <span className={className}>with {mit.map((m, k) => {
      const mid = m.epicId || m.id;
      return <span key={mid || k}>{k ? ', ' : ''}{mid ? <Link to={`/competitive/player/${mid}`} className="text-white/60 transition hover:text-akz">{m.name}</Link> : m.name}</span>;
    })}</span>
  );
}

/* ---------------------------------------------------------------- Seite */
export default function Spieler() {
  const { id: idRoh = '' } = useParams();
  const id = idRoh.toLowerCase();
  const [adresse, setAdresse] = useSearchParams();
  const zeit = adresse.get('zeit') || 'alle';
  const [basis, setBasis] = useState<Profil | null>(null);
  const [zeitraum, setZeitraum] = useState<{ zeit: string; p: Profil } | null>(null);
  const [laedtZeit, setLaedtZeit] = useState(false);
  const [fehler, setFehler] = useState(false);
  const [index, setIndex] = useState<Index | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [teams, setTeams] = useState<TeamEintrag[]>([]);
  const [ranked, setRanked] = useState<Rang[]>([]);
  const [galerie, setGalerie] = useState<Galerie | null>(null);
  const [bildKaputt, setBildKaputt] = useState(false);
  const [filter, setFilter] = useState<Filter>('alle');
  const [zeige, setZeige] = useState(25);
  const [nochmal, setNochmal] = useState(0);

  // ---- Grunddaten (alle Zeit) und alles, was nicht vom Zeitraum abhaengt
  useEffect(() => {
    let weg = false;
    setBasis(null); setFehler(false); setBildKaputt(false); setIndex(null); setTeams([]); setRanked([]); setGalerie(null);
    holen<Profil>(`/api/szene-stats?spieler=${encodeURIComponent(id)}`).then((d) => { if (!weg) setBasis(d); }).catch(() => { if (!weg) setFehler(true); });
    fetch(`/api/spieler-verlauf?id=${encodeURIComponent(id)}`).then((r) => r.json()).then((d) => { if (!weg && d?.ok) setIndex(d); }).catch(() => {});
    fetch('/api/orgs').then((r) => r.json()).then((d) => { if (!weg) setOrgs(d.orgs ?? []); }).catch(() => {});
    fetch(`/api/teamverlauf?spieler=${encodeURIComponent(id)}`).then((r) => r.json()).then((d) => { if (!weg) setTeams(d.eintraege ?? []); }).catch(() => {});
    fetch(`/api/galerie?spieler=${encodeURIComponent(id)}`).then((r) => r.json()).then((d) => { if (!weg && d?.success) setGalerie(d); }).catch(() => {});
    // Ranked: nur die Rangsaisons, die gerade laufen (Epic sagt welche) - ein Rang von 2023 ist kein Stand.
    Promise.all([fetch(`/api/cup-ranked?ids=${encodeURIComponent(id)}`).then((r) => r.json()), fetch('/api/cup-ranked?tracks=1').then((r) => r.json())]).then(([j, tj]) => {
      if (weg) return;
      const aktiv = new Set(((tj?.tracks ?? []) as Array<{ trackguid: string }>).map((t) => t.trackguid));
      setRanked(((j?.spieler?.[0]?.ranks ?? []) as Rang[]).filter((r) => r.gespielt && aktiv.has(r.trackguid) && rangArt(r.rankingType)));
    }).catch(() => {});
    return () => { weg = true; };
  }, [id, nochmal]);

  // ---- Werte des gewaehlten Zeitraums (die alten bleiben halb durchsichtig stehen, bis die neuen da sind)
  useEffect(() => {
    if (zeit === 'alle') { setLaedtZeit(false); return; }
    let weg = false;
    setLaedtZeit(true);
    const q = new URLSearchParams({ spieler: id });
    if (zeit.startsWith('jahr:')) q.set('jahr', zeit.slice(5)); else q.set('saison', zeit);
    holen<Profil>(`/api/szene-stats?${q}`).then((d) => { if (!weg) setZeitraum({ zeit, p: d }); }).catch(() => {}).finally(() => { if (!weg) setLaedtZeit(false); });
    return () => { weg = true; };
  }, [id, zeit]);
  useEffect(() => { setZeige(25); }, [zeit, filter]);

  const waehle = (z: string) => { const n = new URLSearchParams(adresse); if (z === 'alle') n.delete('zeit'); else n.set('zeit', z); setAdresse(n, { replace: true }); };
  const imZeitraum = (season?: string, datum?: number | null) => zeit === 'alle' || (zeit.startsWith('jahr:') ? jahrVon(datum) === Number(zeit.slice(5)) : season === zeit);

  /** Profil des Zeitraums (All time = Grunddaten); waehrend ein neuer Zeitraum laedt, stehen die alten Zahlen. */
  const p = zeit === 'alle' ? basis : zeitraum?.zeit === zeit ? zeitraum.p : (zeitraum?.p ?? basis);
  const pAktuell = zeit === 'alle' || zeitraum?.zeit === zeit;
  const sp = basis?.spieler ?? null;
  const spZ = p?.spieler ?? null;
  const namen: Record<string, string> = { ...(index?.saisonNamen ?? {}), ...(basis?.saisonNamen ?? {}) };
  const bilder = basis?.saisonBilder ?? {};
  const alleZeilen = useMemo(() => [...(basis?.verlauf ?? []), ...(basis?.epicZeilen ?? [])], [basis]);

  // ---- Zeitraeume mit Daten: Jahre und Saisons aus dem Turnierindex und dem Profil
  const { jahre, saisons } = useMemo(() => {
    const tg = index?.zeilen ?? [];
    const j = new Set<number>([...tg.map((t) => jahrVon(t.datum)), ...alleZeilen.map((z) => jahrVon(z.datum))].filter((x) => x > 2015));
    const s = new Set<string>([...tg.map((t) => t.saison), ...alleZeilen.map((z) => z.season ?? '')].filter((x) => /^S\d+$/.test(x)));
    return { jahre: [...j].sort((a, b) => b - a), saisons: [...s].sort((a, b) => saisonNr(b) - saisonNr(a)) };
  }, [index, alleZeilen]);

  // ---- Org und Socials
  const org = useMemo(() => orgs.find((o) => o.spieler?.some((s) => s.epicId?.toLowerCase() === id)) ?? null, [orgs, id]);
  const orgSp = org?.spieler.find((s) => s.epicId?.toLowerCase() === id) ?? null;

  // ---- Turnierverlauf des Zeitraums: Epics Index (jeder Spieltag), sonst die Zeilen des Profils
  const { elimsVon, geldVon } = useMemo(() => {
    const e = new Map<string, number>(); const g = new Map<string, number>();
    for (const z of alleZeilen) {
      const el = z.werte?.eliminations ?? z.replayElims;
      if (typeof el === 'number' && el > 0) e.set(z.windowId, el);
      if ((z.verdienst ?? 0) > 0) g.set(z.windowId, z.verdienst!);
    }
    return { elimsVon: e, geldVon: g };
  }, [alleZeilen]);
  const tage: Tag[] = useMemo(() => {
    // LAN-Spieltage (Saison "LAN") gehoeren zu allen Zeiten und zu ihrem Jahr, aber zu keiner Saison
    if (index?.zeilen?.length) return index.zeilen.filter((t) => (t.saison === 'LAN' ? !/^S\d+$/.test(zeit) && imZeitraum(undefined, t.datum) : imZeitraum(t.saison, t.datum)));
    const gesehen = new Set<string>();
    return [...(p?.verlauf ?? []), ...(p?.epicZeilen ?? [])].filter((z) => !z.gesamt && !gesehen.has(z.windowId) && gesehen.add(z.windowId)).map((z) => ({
      w: z.windowId, titel: z.titel || z.event, region: z.region ?? '', saison: z.season ?? '', datum: z.datum ?? 0, platz: z.platz ?? undefined, punkte: z.punkte ?? undefined,
      matches: z.matches ?? z.werte?.matchesPlayed, preis: z.verdienst ?? undefined, mitspieler: (z.mitspieler ?? []).map((m) => ({ id: m.epicId ?? '', name: m.name })),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, p, zeit]);
  const gefiltert = useMemo(() => [...tage].sort((a, b) => b.datum - a.datum).filter((t) => filter === 'alle'
    || (filter === 'finals' ? t.finale || /final/i.test(`${t.runde ?? ''} ${t.titel}`)
      : filter === 'top10' ? (t.platz ?? 999) <= 10 : (t.preis || geldVon.get(t.w) || 0) > 0)), [tage, filter, geldVon]);

  const plaetze = tage.map((t) => t.platz ?? 0).filter((x) => x > 0);
  const siege = plaetze.filter((x) => x === 1).length;
  const top10 = plaetze.filter((x) => x <= 10).length;
  const bester = plaetze.length ? Math.min(...plaetze) : 0;
  const lanZeit = (basis?.lan ?? []).filter((l) => imZeitraum(l.season, l.datum));
  const geldZeit = p ? preisgeld([...(p.verlauf ?? []), ...(p.epicZeilen ?? [])], lanZeit) : 0;
  const geldKarriere = basis ? preisgeld(alleZeilen, basis.lan ?? []) : 0;
  const diesesJahr = new Date().getFullYear();

  /** Preisgeld, Spieltage und Siege je Jahr (alle Zeit). */
  const proJahr = useMemo(() => {
    const m = new Map<number, { geld: number; tage: number; siege: number }>();
    const plus = (j: number, k: 'geld' | 'tage' | 'siege', v: number) => { if (!j) return; const e = m.get(j) ?? { geld: 0, tage: 0, siege: 0 }; e[k] += v; m.set(j, e); };
    for (const z of alleZeilen) if ((z.verdienst ?? 0) > 0) plus(jahrVon(z.datum), 'geld', z.verdienst!);
    for (const l of basis?.lan ?? []) if (l.betrag && l.betrag > 0 && !lanDoppelt(l, alleZeilen)) plus(jahrVon(l.datum), 'geld', l.betrag);
    for (const t of index?.zeilen ?? []) { plus(jahrVon(t.datum), 'tage', 1); if (t.platz === 1) plus(jahrVon(t.datum), 'siege', 1); }
    return [...m.entries()].sort((a, b) => b[0] - a[0]);
  }, [basis, index, alleZeilen]);
  const verteilung = useMemo(() => {
    const stufen: Array<[string, number]> = [['#1', 1], ['2–3', 3], ['4–10', 10], ['11–25', 25], ['26–100', 100], ['101–1K', 1000], ['1K+', Infinity]];
    const n = stufen.map(() => 0);
    for (const x of plaetze) n[stufen.findIndex(([, bis]) => x <= bis)] += 1;
    return stufen.map(([t], i) => ({ t, n: n[i] }));
  }, [plaetze]);
  const besteTage = useMemo(() => {
    const aus = (p?.verlauf ?? []).filter((z) => (z.werte?.eliminations ?? 0) > 0).sort((a, b) => b.werte!.eliminations! - a.werte!.eliminations!).slice(0, 6)
      .map((z) => ({ event: z.titel || z.event, elims: z.werte!.eliminations!, damage: z.werte?.damageDealt ?? 0, matches: z.werte?.matchesPlayed ?? 0, region: z.region ?? '', saison: namen[z.season ?? ''] ?? z.season ?? '', tagesbester: false }));
    const schon = new Set(aus.map((a) => a.event));
    const tb = (p?.tagesbest ?? []).filter((t) => !schon.has(t.event)).map((t) => ({ event: t.event, elims: t.elims, damage: t.damage, matches: t.matches, region: t.region, saison: t.saisonName ?? '', tagesbester: true }));
    return [...tb, ...aus].sort((a, b) => b.elims - a.elims).slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p]);

  if (fehler) return (
    <Flaeche fest className="flex flex-col items-center gap-4 p-12 text-center text-white/60">
      This profile isn't reachable right now.
      <button type="button" onClick={() => setNochmal((n) => n + 1)} className="knopf-prim">Try again</button>
    </Flaeche>
  );
  if (!basis) return <div className="space-y-5"><div className="fl-fest h-[420px] animate-pulse" /><div className="fl-fest h-14 animate-pulse" /><div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{[...Array(10)].map((_, i) => <div key={i} className="fl-fest h-28 animate-pulse" />)}</div></div>;

  const anzeige = (sp?.anzeige || sp?.name || index?.name || id.slice(0, 8)).trim();
  const epicName = (index?.epicName || sp?.name || '').trim();
  const epicAnders = !!epicName && epicName.toLowerCase() !== anzeige.toLowerCase();
  const alteNamen = [...new Set([...(index?.alteNamen ?? []), ...(sp?.namen ?? [])])].filter((n) => n && n.toLowerCase() !== epicName.toLowerCase() && n.toLowerCase() !== anzeige.toLowerCase());
  const land = sp?.land ?? null;
  const region = sp?.heimat || index?.region || sp?.regionen?.[0] || null;
  const sozial = SOZIAL.map((s) => ({ ...s, h: (s.feld === 'x' ? orgSp?.x || sp?.x : s.feld === 'twitch' ? orgSp?.twitch || sp?.twitch : orgSp?.[s.feld]) ?? null })).filter((s) => s.h);
  const lanSiege = (basis.lan ?? []).filter((l) => l.platz === 1 && !/global/i.test(l.name ?? '')).length;
  const titel = (basis.fncs?.titel ?? 0) + lanSiege;
  const jahrGeld = proJahr.find(([j]) => j === diesesJahr)?.[1].geld ?? 0;
  const fncsTafel = (basis.fncsTafel ?? []).filter((x) => x.platz > 0).sort((a, b) => a.platz - b.platz || (b.datum ?? 0) - (a.datum ?? 0));
  const erfolge = (basis.erfolge ?? []).filter((e) => imZeitraum(e.season, e.datum));
  const perz = PERZENTILE.filter(([k]) => (p?.perzentile?.[k] ?? 0) > 0);
  const bilderGal = (galerie?.eintraege ?? []).filter((e) => e.art === 'bild' && e.datei);
  const videos = (galerie?.eintraege ?? []).filter((e) => e.art === 'video' && e.url);
  const galBild = (e: GalerieEintrag) => `/api/galerie?bild=${encodeURIComponent(e.datei ?? '')}`;
  const galEvent = (e: GalerieEintrag) => galerie?.events?.find((x) => x.id === e.eventId);
  const zeitName = zeit === 'alle' ? 'All time' : zeit.startsWith('jahr:') ? zeit.slice(5) : namen[zeit] ?? zeit;
  const geldMax = Math.max(1, ...proJahr.map(([, v]) => v.geld));
  const vertMax = Math.max(1, ...verteilung.map((v) => v.n));
  const mitFoto = !!sp?.bild && !bildKaputt;
  const mitGeld = geldKarriere > 0 || (basis.fncs?.titel ?? 0) + (basis.lan ?? []).filter((l) => l.platz === 1).length > 0;

  const werte: Array<[string, string, string?]> = spZ ? ([
    ['Eliminations', zahl(spZ.elims), spZ.matchesElims ? `over ${zahl(spZ.matchesElims)} matches with replay data` : undefined],
    ['Elims / match', spZ.elimsProMatch ? zahl(spZ.elimsProMatch, 2) : ''],
    ['Damage', zahl(spZ.damage), spZ.matchesSchaden ? `over ${zahl(spZ.matchesSchaden)} matches with replay data` : undefined],
    ['Damage / match', spZ.damageProMatch ? zahl(spZ.damageProMatch) : ''],
    ['Damage taken', zahl(spZ.damageTaken)], ['Damage ratio', spZ.quote ? zahl(spZ.quote, 2) : ''],
    ['Hits', zahl(spZ.hits)], ['Shots', zahl(spZ.shots)], ['Accuracy', spZ.genauigkeit ? `${zahl(spZ.genauigkeit, 1)} %` : ''],
    ['Headshots', zahl(spZ.headshots)], ['Assists', zahl(spZ.assists)], ['Reboots', zahl(spZ.reboots)],
    ['Materials', zahl(spZ.mats)], ['Builds', zahl(spZ.builds)], ['Heals', zahl(spZ.heals)], ['Storm damage', zahl(spZ.stormDamage)],
    ['Time alive', spZ.timeAlive ? zeitText(spZ.timeAlive) : ''], ['Time in storm', spZ.timeInStorm ? zeitText(spZ.timeInStorm) : ''],
    ['Distance', spZ.distanz ? `${zahl(spZ.distanz, 1)} km` : ''],
  ] as Array<[string, string, string?]>).filter(([, v]) => v && v !== '0' && v !== '—') : [];

  const kennzahlen: Array<[string, string, string, string?]> = [
    ['Earnings', geldZeit > 0 ? geldKurz(geldZeit) : '—', zeit === 'alle' ? 'career' : zeitName, '!text-emerald-300'],
    ['Match days', zahl(tage.length || spZ?.events || 0), spZ?.events ? `${zahl(spZ.events)} with stats` : ''],
    ['Matches', zahl(spZ?.matches || tage.reduce((a, t) => a + (t.matches ?? 0), 0)), ''],
    ['Wins', zahl(siege), plaetze.length ? `${zahl((siege / plaetze.length) * 100, 1)}% of match days` : '', '!text-amber-300'],
    ['Top 10', zahl(top10), plaetze.length ? `${Math.round((top10 / plaetze.length) * 100)}% of match days` : ''],
    ['Best place', bester ? `#${zahl(bester)}` : '—', bester ? `${zahl(plaetze.filter((x) => x === bester).length)}×` : '', bester === 1 ? '!text-amber-300' : undefined],
    ['Avg. place', plaetze.length ? `#${zahl(plaetze.reduce((a, x) => a + x, 0) / plaetze.length)}` : '—', 'per match day'],
    ['Eliminations', spZ?.elims ? zahl(spZ.elims) : '—', spZ?.elimsProMatch ? `${zahl(spZ.elimsProMatch, 2)} per match` : ''],
    ['Damage', spZ?.damage ? zahl(spZ.damage) : '—', spZ?.damageProMatch ? `${zahl(spZ.damageProMatch)} per match` : ''],
    ['Damage ratio', spZ?.quote ? zahl(spZ.quote, 2) : '—', spZ?.damageTaken ? `${zahl(spZ.damageTaken)} taken` : ''],
  ];

  return (
    <div className="space-y-5">
      {/* ================================================================ Buehne */}
      <motion.header initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="fl-fest relative isolate overflow-hidden">
        {bilderGal[0] && <img src={galBild(bilderGal[0])} alt="" className="absolute inset-y-0 right-0 -z-10 h-full w-full object-cover opacity-60 lg:w-[72%]" />}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-fl via-fl/90 to-fl/35" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-fl via-fl/25 to-transparent" />
        <div className={`grid gap-6 p-5 sm:p-7 lg:items-end lg:gap-8 lg:p-8 ${mitFoto ? (mitGeld ? 'lg:grid-cols-[auto_minmax(0,1fr)_auto]' : 'lg:grid-cols-[auto_minmax(0,1fr)]') : mitGeld ? 'lg:grid-cols-[minmax(0,1fr)_auto]' : ''}`}>
          {mitFoto && (
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6 }}
              className="relative mx-auto h-[300px] w-[225px] shrink-0 overflow-hidden rounded-2xl ring-1 ring-white/10 lg:mx-0 lg:h-[360px] lg:w-[270px]">
              <img src={sp!.bild!} alt={anzeige} onError={() => setBildKaputt(true)} className="h-full w-full object-cover object-top" />
              <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/75 to-transparent" />
              {index?.pr?.platz ? <span className="zahl absolute bottom-3 left-3 rounded-full bg-black/70 px-3 py-1 text-xs font-bold text-akz ring-1 ring-akz/40 backdrop-blur">PR #{zahl(index.pr.platz)}</span> : null}
            </motion.div>
          )}
          {/* ohne Foto stehen die Raenge rechts neben dem Namen - sonst bliebe die Buehne rechts leer */}
          <div className={`min-w-0 ${mitFoto ? '' : 'lg:flex lg:items-end lg:justify-between lg:gap-10'}`}>
            <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-sm text-white/65">
              {land && <img src={flagge(land)} alt="" className="h-4 w-6 rounded-[3px] object-cover ring-1 ring-white/15" />}
              <span className="font-semibold">{landName(land) ?? 'Competitive Fortnite player'}</span>
              {region && <><span className="text-white/25">·</span><span>{region}</span></>}
              {index?.zuletzt ? <><span className="text-white/25">·</span><span className="text-white/45">last seen {tagText(index.zuletzt)}</span></> : null}
            </div>
            <h1 className="titel mt-2 break-words text-6xl drop-shadow-[0_6px_30px_rgba(0,0,0,0.85)] sm:text-7xl 2xl:text-8xl">{anzeige}</h1>
            {(epicAnders || alteNamen.length > 0) && (
              <p className="mt-1.5 text-sm text-white/45">
                {epicAnders && <>Epic: <span className="text-white/75">{epicName}</span></>}
                {alteNamen.length > 0 && <span className="text-white/35">{epicAnders ? ' · ' : ''}also played as {alteNamen.slice(0, 4).join(', ')}</span>}
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {org && (
                <span className="flex items-center gap-2 rounded-full border border-white/10 bg-black/50 py-1 pl-1 pr-3 text-sm font-semibold text-white backdrop-blur">
                  {org.logo ? <img src={org.logo} alt="" className="h-6 w-6 rounded-full bg-black/40 object-contain p-0.5" /> : <span className="w-1" />}
                  {org.name}{orgSp?.seit && <span className="text-xs font-normal text-white/45">since {new Date(orgSp.seit).getFullYear()}</span>}
                </span>
              )}
              {sozial.map((s) => <a key={s.feld} href={s.url(s.h as string)} target="_blank" rel="noreferrer" className="chip">{s.name}{s.feld === 'x' ? ` @${s.h}` : ''} ↗</a>)}
            </div>
            </div>
            <div className={`mt-5 flex flex-wrap gap-x-7 gap-y-4 ${mitFoto ? '' : 'lg:shrink-0 lg:justify-end'}`}>
              {index?.pr?.platz ? (
                <div><p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/45">Power Ranking</p>
                  <p className="titel zahl text-4xl !text-akz">#{zahl(index.pr.platz)}</p><p className="zahl text-[11px] text-white/40">{zahl(index.pr.punkte)} pts</p></div>
              ) : null}
              {basis.rang?.regional ? (
                <div><p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/45">{basis.rang.region} rank</p>
                  <p className="titel zahl text-4xl">#{zahl(basis.rang.regional)}</p><p className="zahl text-[11px] text-white/40">of {zahl(basis.rang.regionalVon)}</p></div>
              ) : null}
              {basis.rang?.global ? (
                <div><p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/45">World rank</p>
                  <p className="titel zahl text-4xl">#{zahl(basis.rang.global)}</p><p className="zahl text-[11px] text-white/40">of {zahl(basis.rang.globalVon)}</p></div>
              ) : null}
              {ranked.length > 0 && (
                <div><p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/45">Ranked now</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {ranked.slice(0, 4).map((r) => (
                      <span key={r.trackguid} className="zahl inline-flex items-baseline gap-1.5 rounded-lg border border-white/10 bg-black/50 px-2.5 py-1 text-xs backdrop-blur">
                        <span className="uppercase tracking-wider text-white/45">{rangArt(r.rankingType)}</span>
                        {r.ranking !== null ? <b className="text-amber-300">#{zahl(r.ranking)}</b> : <b className="text-white">{r.divisionName ?? `Div ${r.division}`}</b>}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* Preisgeld und Titel - nur, wenn es welche gibt (keine Kasten voller Striche) */}
          {mitGeld && <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] lg:w-[300px] lg:grid-cols-1">
            <div className="col-span-2 bg-fl/90 px-5 py-4 backdrop-blur lg:col-span-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/45">Career earnings</p>
              <p className="titel mt-1 text-5xl !text-emerald-300">{geldKarriere > 0 ? <Zaehler wert={geldKarriere} format={geld} /> : '—'}</p>
              {proJahr.length > 0 && <p className="zahl text-[11px] text-white/40">{proJahr[proJahr.length - 1][0]}–{proJahr[0][0]} · {zahl(index?.zeilen?.length ?? alleZeilen.length)} match days</p>}
            </div>
            <div className="bg-fl/90 px-5 py-3.5 backdrop-blur">
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/45">{diesesJahr} earnings</p>
              <p className="titel zahl mt-0.5 text-3xl">{jahrGeld > 0 ? geld(jahrGeld) : '—'}</p>
            </div>
            <div className="bg-fl/90 px-5 py-3.5 backdrop-blur">
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/45">Titles</p>
              <p className="titel zahl mt-0.5 text-3xl !text-amber-300">{titel || '—'}</p>
              {titel > 0 && <p className="truncate text-[11px] text-white/40">{[basis.fncs?.titel ? `${basis.fncs.titel} FNCS` : '', lanSiege ? `${lanSiege} LAN` : ''].filter(Boolean).join(' · ')}</p>}
            </div>
          </div>}
        </div>
      </motion.header>

      {/* ================================================================ Zeitraum (klebt unter der Navigation) */}
      <div className="fl-fest sticky top-[108px] z-20 flex items-center gap-3 px-3 py-2 sm:px-4">
        <span className="hidden shrink-0 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40 sm:block">Period</span>
        <div className="ohne-leiste flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          <button type="button" onClick={() => waehle('alle')} className={`chip shrink-0 ${zeit === 'alle' ? 'chip-an' : ''}`}>All time</button>
          {jahre.length > 0 && <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-white/10" />}
          {jahre.map((j) => <button key={j} type="button" onClick={() => waehle(`jahr:${j}`)} className={`chip zahl shrink-0 ${zeit === `jahr:${j}` ? 'chip-an' : ''}`}>{j}</button>)}
          {saisons.length > 0 && <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-white/10" />}
          {saisons.map((s) => (
            <button key={s} type="button" onClick={() => waehle(s)} title={s} className={`chip shrink-0 !py-1 !pl-1 ${zeit === s ? 'chip-an' : ''}`}>
              {bilder[s] ? <img src={bilder[s]!} alt="" className="h-6 w-10 rounded-md object-cover" /> : <span className="zahl px-1 text-[10px] text-white/40">{s}</span>}
              <span className="whitespace-nowrap">{namen[s] ?? s}</span>
            </button>
          ))}
        </div>
        {laedtZeit && <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/15 border-t-akz" />}
      </div>

      <div className={`space-y-5 transition-opacity duration-300 ${pAktuell ? '' : 'opacity-50'}`}>
        {/* ================================================================ Kennzahlen des Zeitraums */}
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-white/[0.07] bg-white/[0.06] sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-10">
          {kennzahlen.map(([k, v, u, ton], i) => (
            <motion.div key={k} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + i * 0.03 }} className="bg-fl px-4 py-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">{k}</p>
              <p className={`titel zahl mt-1 text-4xl ${ton ?? ''}`}>{v}</p>
              <p className="mt-0.5 truncate text-[11px] text-white/40">{u || ' '}</p>
            </motion.div>
          ))}
        </div>

        {/* ================================================================ Mitte: Turnierverlauf | Werte */}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
          <Flaeche fest className="min-w-0 self-start overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] px-5 py-3.5">
              <h2 className="titel text-2xl">Results</h2>
              <span className="zahl text-xs text-white/40">{zahl(gefiltert.length)} match days · {zeitName}</span>
              <div className="ml-auto flex flex-wrap gap-1.5">
                {([['alle', 'All'], ['finals', 'Finals'], ['top10', 'Top 10'], ['geld', 'Prize money']] as Array<[Filter, string]>).map(([k, t]) => (
                  <button key={k} type="button" onClick={() => setFilter(k)} className={`chip !py-1 !text-xs ${filter === k ? 'chip-an' : ''}`}>{t}</button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full sm:min-w-[720px] border-separate border-spacing-0 text-[13px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.16em] text-white/40">
                    <th className="border-b border-white/[0.07] py-2 pl-5 pr-2 text-left font-semibold">Place</th>
                    <th className="border-b border-white/[0.07] px-2 py-2 text-left font-semibold">Tournament</th>
                    <th className="w-16 border-b border-white/[0.07] px-2 py-2 text-right font-semibold">Pts</th>
                    <th className="hidden w-16 border-b border-white/[0.07] px-2 py-2 text-right font-semibold sm:table-cell">Games</th>
                    <th className="hidden w-16 border-b border-white/[0.07] px-2 py-2 text-right font-semibold sm:table-cell">Elims</th>
                    <th className="w-24 border-b border-white/[0.07] py-2 pl-2 pr-5 text-right font-semibold">Prize</th>
                  </tr>
                </thead>
                <tbody>
                  {gefiltert.slice(0, zeige).map((t) => {
                    const prize = t.preis || geldVon.get(t.w) || 0;
                    const el = elimsVon.get(t.w);
                    return (
                      <tr key={t.w} className="transition hover:bg-white/[0.03]">
                        <td className="w-[72px] border-b border-white/[0.04] py-1.5 pl-4 pr-2 sm:w-[92px] sm:pl-5">
                          <Platz p={t.platz} />{t.teams ? <span className="zahl block text-[10px] leading-none text-white/30">of {zahl(t.teams)}</span> : null}
                        </td>
                        <td className="max-w-0 border-b border-white/[0.04] px-2 py-1.5">
                          <p className="truncate font-semibold text-white">
                            {t.finale && <span className="mr-2 rounded bg-akz/15 px-1.5 py-px align-middle text-[9px] font-bold uppercase tracking-wider text-akz">Final</span>}
                            {englisch(t.titel)}{t.runde ? <span className="font-normal text-white/55"> · {englisch(t.runde)}</span> : null}
                          </p>
                          <p className="truncate text-[11px] text-white/40">
                            {[t.region, namen[t.saison] ?? t.saison, tagText(t.datum)].filter(Boolean).join(' · ')}
                            {t.mitspieler?.length ? <> · <Mitspieler mit={t.mitspieler} /></> : null}
                          </p>
                        </td>
                        <td className="zahl whitespace-nowrap border-b border-white/[0.04] px-2 py-1.5 text-right text-white/75">{t.punkte != null ? zahl(t.punkte) : '—'}</td>
                        <td className="zahl hidden whitespace-nowrap border-b border-white/[0.04] px-2 py-1.5 text-right text-white/55 sm:table-cell">{t.matches ? zahl(t.matches) : '—'}</td>
                        <td className="zahl hidden whitespace-nowrap border-b border-white/[0.04] px-2 py-1.5 text-right text-white/55 sm:table-cell">{el ? zahl(el) : '—'}</td>
                        <td className={`zahl whitespace-nowrap border-b border-white/[0.04] py-1.5 pl-2 pr-5 text-right ${prize ? 'font-semibold text-emerald-300' : 'text-white/25'}`}>{prize ? geld(prize) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!gefiltert.length && <p className="p-8 text-center text-sm text-white/45">No match days in this period.</p>}
            </div>
            {gefiltert.length > zeige && <button type="button" onClick={() => setZeige((z) => z + 50)} className="w-full border-t border-white/[0.06] py-3 text-sm font-semibold text-white/60 transition hover:bg-white/[0.03] hover:text-white">Show more ({zahl(gefiltert.length - zeige)})</button>}
          </Flaeche>

          <div className="space-y-5">
            <Karte titel="Stats" rechts={spZ?.events ? `${zeitName} · ${zahl(spZ.events)} days · ${zahl(spZ.matches)} matches` : zeitName}>
              {werte.length ? (
                <dl className="grid grid-cols-2 gap-x-5 px-5 py-2">
                  {werte.map(([k, v, u]) => (
                    <div key={k} title={u} className="flex items-baseline justify-between gap-3 border-b border-white/[0.04] py-2">
                      <dt className="truncate text-[11px] uppercase tracking-wider text-white/45">{k}</dt><dd className="zahl text-sm font-semibold text-white">{v}</dd>
                    </div>
                  ))}
                </dl>
              ) : <p className="px-5 py-5 text-sm text-white/45">No replay stats for this period – placements and prize money are in the results.</p>}
              {spZ?.matchesElims && spZ.matches && spZ.matchesElims < spZ.matches
                ? <p className="border-t border-white/[0.05] px-5 py-2 text-[11px] text-white/35">Eliminations and damage come from {zahl(spZ.matchesElims)} of {zahl(spZ.matches)} matches with replay data.</p> : null}
            </Karte>

            {perz.length > 0 && (
              <Karte titel="Compared to the field" rechts={`${zahl(p?.perzentile?.feldgroesse)} players`}>
                <ul className="space-y-2.5 px-5 py-4">
                  {perz.map(([k, t], i) => {
                    const w = p?.perzentile?.[k] ?? 0;
                    return (
                      <li key={k} className="grid grid-cols-[100px_minmax(0,1fr)_58px] items-center gap-3">
                        <span className="truncate text-[13px] text-white/70">{t}</span>
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full rounded-full bg-akz" initial={{ width: 0 }} animate={{ width: `${w}%` }} transition={{ duration: 0.8, delay: 0.1 + i * 0.05 }} /></div>
                        <span className="zahl text-right text-xs font-bold text-white">top {Math.max(1, 100 - w)}%</span>
                      </li>
                    );
                  })}
                </ul>
              </Karte>
            )}

            {plaetze.length > 0 && (
              <Karte titel="Placements" rechts={`${zahl(plaetze.length)} match days · ${zeitName}`}>
                <div className="flex h-36 items-end gap-2 px-5 pb-3 pt-4">
                  {verteilung.map((v, i) => (
                    <div key={v.t} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                      <span className="zahl text-[11px] font-bold text-white/80">{v.n || ''}</span>
                      <motion.div className={`w-full rounded-t-md ${i === 0 ? 'bg-amber-300' : i < 3 ? 'bg-akz' : 'bg-white/20'}`} initial={{ height: 0 }} animate={{ height: `${(v.n / vertMax) * 100}%` }} transition={{ duration: 0.7, delay: i * 0.04 }} style={{ minHeight: v.n ? 3 : 0 }} />
                      <span className="zahl whitespace-nowrap text-[10px] text-white/40">{v.t}</span>
                    </div>
                  ))}
                </div>
              </Karte>
            )}

            {proJahr.some(([, v]) => v.geld > 0) && (
              <Karte titel="Earnings by year" rechts="click a year to switch">
                <ul className="space-y-0.5 px-4 py-3">
                  {proJahr.map(([j, v]) => (
                    <li key={j}>
                      <button type="button" onClick={() => waehle(`jahr:${j}`)} className={`grid w-full grid-cols-[42px_minmax(0,1fr)_96px] items-center gap-3 rounded-lg px-1.5 py-1.5 text-left transition hover:bg-white/[0.04] ${zeit === `jahr:${j}` ? 'bg-akz/10' : ''}`}>
                        <span className={`zahl text-sm font-bold ${j === diesesJahr ? 'text-akz' : 'text-white/70'}`}>{j}</span>
                        <span className="h-1.5 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-emerald-400" style={{ width: `${(v.geld / geldMax) * 100}%` }} /></span>
                        <span className="zahl text-right text-sm font-semibold text-white">{v.geld ? geld(v.geld) : '—'}<span className="block text-[10px] font-normal text-white/35">{v.tage} days · {v.siege} W</span></span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Karte>
            )}
          </div>
        </div>

        {/* ================================================================ Erfolge */}
        <div className="grid items-start gap-5 lg:grid-cols-2 2xl:grid-cols-4">
          {fncsTafel.length > 0 && (
            <Karte titel="FNCS placements" rechts="all time">
              <div className="grid grid-cols-2 gap-px bg-white/[0.05]">
                {fncsTafel.slice(0, 12).map((x, i) => (
                  <div key={`${x.saison}-${i}`} className={`px-4 py-3 ${x.platz === 1 ? 'bg-gradient-to-br from-amber-300/[0.12] to-fl' : 'bg-fl'}`}>
                    <div className="flex items-center justify-between gap-2"><Platz p={x.platz} gross /><span className={`text-[9px] font-bold uppercase tracking-wider ${x.typ === 'LAN' ? 'text-akz' : 'text-white/35'}`}>{x.typ}</span></div>
                    <p className="mt-0.5 truncate text-xs font-semibold text-white/80">{x.saison}</p>
                    <Mitspieler mit={x.mitspieler} className="block truncate text-[11px] text-white/40" />
                  </div>
                ))}
              </div>
            </Karte>
          )}
          {(basis.lan?.length ?? 0) > 0 && (
            <Karte titel="LAN events" rechts={zeit === 'alle' ? `${zahl(basis.lan!.length)} events` : `${zahl(lanZeit.length)} in ${zeitName}`}>
              <ul>
                {[...(basis.lan ?? [])].sort((a, b) => (b.datum ?? 0) - (a.datum ?? 0)).map((l, i) => (
                  <li key={`${l.kennung}-${i}`} className={`flex items-center gap-3 border-b border-white/[0.04] px-5 py-2 transition-opacity ${imZeitraum(l.season, l.datum) ? '' : 'opacity-35'}`}>
                    <span className="w-12 shrink-0"><Platz p={l.platz} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-white">{l.name}</p>
                      <p className="truncate text-[11px] text-white/40">{[l.ort, tagText(l.datum)].filter(Boolean).join(' · ')}{l.mit?.length ? <> · <Mitspieler mit={l.mit} /></> : null}</p>
                    </div>
                    {l.betrag ? <span className="zahl text-sm font-bold text-emerald-300">{geld(l.betrag)}</span> : null}
                  </li>
                ))}
              </ul>
            </Karte>
          )}
          {erfolge.length > 0 && (
            <Karte titel="Top finishes" rechts={`${zahl(erfolge.length)} · ${zeitName}`}>
              <ul>
                {erfolge.slice(0, 12).map((e, i) => (
                  <li key={`${e.titel}-${i}`} className="flex items-center gap-3 border-b border-white/[0.04] px-5 py-2">
                    <span className="w-10 shrink-0"><Platz p={e.platz} /></span>
                    <div className="min-w-0 flex-1"><p className="truncate text-[13px] text-white">{englisch(e.titel)}</p>
                      <p className="truncate text-[11px] text-white/40">{[e.saisonName ?? namen[e.season] ?? e.season, tagText(e.datum)].filter(Boolean).join(' · ')}{e.mitspieler?.length ? <> · <Mitspieler mit={e.mitspieler} /></> : null}</p></div>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-white/30">{e.typ}</span>
                  </li>
                ))}
              </ul>
            </Karte>
          )}
          {besteTage.length > 0 && (
            <Karte titel="Best match days" rechts={`by eliminations · ${zeitName}`}>
              <ul>
                {besteTage.map((t, i) => (
                  <li key={`${t.event}-${i}`} className="flex items-center gap-4 border-b border-white/[0.04] px-5 py-2.5">
                    <span className="titel zahl w-10 shrink-0 text-center text-4xl !text-akz">{t.elims}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-white">{englisch(t.event)}</p>
                      <p className="truncate text-[11px] text-white/40">elims in {t.matches} matches · {[t.region, t.saison].filter(Boolean).join(' · ')}</p>
                    </div>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      {t.damage > 0 && <span className="zahl text-xs text-white/55">{zahl(t.damage)} dmg</span>}
                      {t.tagesbester && <Marke ton="akz">Best of the day</Marke>}
                    </span>
                  </li>
                ))}
              </ul>
            </Karte>
          )}
        </div>

        {/* ================================================================ Teamverlauf, Galerie */}
        {(teams.length > 0 || bilderGal.length > 1) && (
          <div className={`grid items-start gap-5 ${teams.length && bilderGal.length > 1 ? 'xl:grid-cols-[380px_minmax(0,1fr)]' : ''}`}>
            {teams.length > 0 && (
              <Karte titel="Team history" rechts="Liquipedia">
                <ol className="relative px-5 py-3">
                  <span aria-hidden className="absolute bottom-6 left-[31px] top-6 w-px bg-white/10" />
                  {teams.map((t, i) => (
                    <li key={`${t.team}-${i}`} className="relative flex items-center gap-3 py-2">
                      <span className={`relative z-10 grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-full ring-1 ${t.aktuell ? 'bg-akz/20 ring-akz/60' : 'bg-fl ring-white/15'}`}>
                        {t.logo ? <img src={t.logo} alt="" className="h-5 w-5 object-contain" /> : <span className={`h-1.5 w-1.5 rounded-full ${t.aktuell ? 'bg-akz' : 'bg-white/30'}`} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-[13px] font-semibold ${t.aktuell ? 'text-white' : 'text-white/70'}`}>{t.team}{t.aktuell && <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-akz">current</span>}</p>
                        <p className="zahl text-[11px] text-white/40">{(t.seit ?? '').slice(0, 7).replace('-', '/')} – {t.bis ? t.bis.slice(0, 7).replace('-', '/').replace(/\/?\?+/g, '') : 'today'}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </Karte>
            )}
            {bilderGal.length > 1 && (
              <Karte titel="Gallery" rechts={`${zahl(bilderGal.length)} photos${videos.length ? ` · ${videos.length} clips` : ''}`}>
                <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 2xl:grid-cols-4">
                  {/* das erste Foto steht schon hinter der Buehne */}
                  {bilderGal.slice(1, 9).map((b) => {
                    const ev = galEvent(b);
                    return (
                      <a key={b.id} href={galBild(b)} target="_blank" rel="noreferrer" className="group relative aspect-video overflow-hidden rounded-xl bg-white/[0.04]">
                        <img src={galBild(b)} alt={b.titel ?? ''} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                        {ev && <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2.5 pb-1.5 pt-5 text-[11px] font-semibold text-white/85">{ev.name}</span>}
                      </a>
                    );
                  })}
                </div>
                {videos.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 border-t border-white/[0.06] px-4 py-3">
                    {videos.slice(0, 8).map((v) => <a key={v.id} href={v.url} target="_blank" rel="noreferrer" className="chip !py-1 !text-xs">▶ {v.titel || 'Clip'}{galEvent(v) ? ` · ${galEvent(v)!.name}` : ''}</a>)}
                  </div>
                )}
              </Karte>
            )}
          </div>
        )}
      </div>

      <Flaeche fest className="flex flex-wrap items-center gap-2.5 p-4">
        <a href={`${SEITE}/statistics?spieler=${id}`} target="_blank" rel="noreferrer" className="knopf-prim">Full profile on thecomphub.com ↗</a>
        <a href={`${SEITE}/player/${id}`} target="_blank" rel="noreferrer" className="knopf">Public player page ↗</a>
        <Link to="/competitive/rankings" className="knopf">Power Rankings</Link>
        <AnimatePresence>{laedtZeit && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs text-white/45">Loading {zeitName} …</motion.span>}</AnimatePresence>
        <span className="ml-auto font-mono text-[11px] text-white/30">{id}</span>
      </Flaeche>
    </div>
  );
}
