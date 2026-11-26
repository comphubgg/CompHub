import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Glas, SEITE, flagge } from '../../teile/Glas';
import { zahl } from './events/gemeinsam';

/*
 * Spielerprofil im Hub (/competitive/player/:id) - wie /player/[id] der Seite: grosses Foto, Flagge, Org, Socials, Karrierezahlen,
 * letzte Ergebnisse, FNCS-Platzierungen, Erfolge und LANs. Daten: /api/szene-stats?spieler=<id>, die Org aus /api/orgs.
 */

interface Werte { eliminations?: number; matchesPlayed?: number; damageDealt?: number }
interface Zeile {
  event: string; titel?: string; windowId: string; region?: string; season?: string; datum?: number | null; platz?: number | null; punkte?: number | null;
  matches?: number; werte?: Werte; verdienst?: number | null; gesamt?: boolean; replayElims?: number;
  mitspieler?: Array<{ epicId: string; name: string; land?: string }>;
}
interface Lan { kennung?: string; name?: string; fenster?: string; ort?: string; platz?: number; betrag?: number; season?: string; datum?: number; mit?: Array<{ epicId: string; name: string }> }
interface Profil {
  success?: boolean;
  spieler?: {
    epicId: string; name: string; anzeige?: string; land?: string | null; heimat?: string; bild?: string | null; x?: string | null; twitch?: string | null;
    events?: number; matches?: number; elims?: number; damage?: number; hits?: number; builds?: number; timeAlive?: number; quote?: number;
    elimsProMatch?: number; damageProMatch?: number; regionen?: string[];
  } | null;
  perzentile?: Record<string, number> & { feldgroesse?: number };
  rang?: { global: number; globalVon: number; regional: number | null; regionalVon: number; region: string } | null;
  fncs?: { titel: number; saisons: Array<{ saison: string; platz: number }> } | null;
  fncsTafel?: Array<{ saison: string; platz: number; typ: string; mitspieler: Array<{ epicId: string; name: string; land?: string }>; datum: number | null }>;
  erfolge?: Array<{ titel: string; season: string; platz: number; typ: string; datum: number; saisonName?: string; mitspieler: Array<{ epicId: string; name: string }> }>;
  lan?: Lan[]; verlauf?: Zeile[]; epicZeilen?: Zeile[];
  tagesbest?: Array<{ event: string; elims: number; damage: number; matches: number; saisonName?: string; region: string }>;
  saisonNamen?: Record<string, string>;
}
interface OrgSpieler { epicId: string; x?: string | null; twitch?: string | null; tiktok?: string | null; youtube?: string | null; betrag?: number; seit?: string }
interface Org { id: string; name: string; logo?: string | null; farbe?: string | null; spieler: OrgSpieler[] }

const landName = (l?: string | null) => {
  if (!l || !/^[a-z]{2}$/i.test(l)) return null;
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(l.toUpperCase()) ?? l.toUpperCase(); } catch { return l.toUpperCase(); }
};
const geld = (n: number) => `$${zahl(Math.round(n))}`;
/** Die Seite liefert Spieltag-Namen teils deutsch - fuer die englische Oberflaeche. */
const englisch = (s: string) => s.replace(/\bRunde\b/g, 'Round').replace(/\bTag\b/g, 'Day').replace(/\bFinale\b/g, 'Final').replace(/\bFinals - Day/g, 'Finals · Day');

/** Karrierepreisgeld aus Verlauf + LAN-Datei - jeder Posten genau einmal (wie die Seite). */
function preisgeld(alle: Zeile[], lan: Lan[]): number {
  let s = 0;
  for (const z of alle) if (typeof z.verdienst === 'number' && z.verdienst > 0) s += z.verdienst;
  for (const l of lan) {
    if (!(typeof l.betrag === 'number' && l.betrag > 0)) continue;
    const kern = (l.fenster ?? '').split('_')[0];
    if (kern && alle.some((z) => (z.verdienst ?? 0) > 0 && z.windowId.split('_')[0] === kern)) continue;
    s += l.betrag;
  }
  return s;
}

/** Zahl, die beim Erscheinen hochzaehlt. */
function Hochzaehlen({ wert, format = (n) => zahl(Math.round(n)) }: { wert: number; format?: (n: number) => string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let rahmen = 0; const start = performance.now();
    const schritt = (t: number) => { const p = Math.min(1, (t - start) / 1100); setN(wert * (1 - Math.pow(1 - p, 3))); if (p < 1) rahmen = requestAnimationFrame(schritt); };
    rahmen = requestAnimationFrame(schritt);
    return () => cancelAnimationFrame(rahmen);
  }, [wert]);
  return <>{format(n)}</>;
}

function Kachel({ titel, wert, format, unter, farbe = 'text-white', i }: { titel: string; wert: number | null | undefined; format?: (n: number) => string; unter?: string; farbe?: string; i: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.04 }} whileHover={{ y: -3 }}
      className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-xl">
      <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">{titel}</p>
      <p className={`mt-1 text-3xl font-extrabold tabular-nums tracking-tight ${farbe}`}>{typeof wert === 'number' && wert > 0 ? <Hochzaehlen wert={wert} format={format} /> : '—'}</p>
      {unter && <p className="mt-0.5 text-xs text-white/45">{unter}</p>}
    </motion.div>
  );
}

const SOZIAL: Array<{ feld: 'x' | 'twitch' | 'youtube' | 'tiktok'; name: string; url: (h: string) => string; farbe: string }> = [
  { feld: 'x', name: 'X', url: (h) => `https://x.com/${h}`, farbe: '#e2e8f0' },
  { feld: 'twitch', name: 'Twitch', url: (h) => `https://twitch.tv/${h}`, farbe: '#a78bfa' },
  { feld: 'youtube', name: 'YouTube', url: (h) => (h.startsWith('http') ? h : `https://youtube.com/@${h.replace(/^@/, '')}`), farbe: '#f87171' },
  { feld: 'tiktok', name: 'TikTok', url: (h) => `https://tiktok.com/@${h.replace(/^@/, '')}`, farbe: '#2dd4bf' },
];
const PERZENTILE: Array<[string, string]> = [['elims', 'Eliminations'], ['damage', 'Damage'], ['quote', 'Damage ratio'], ['builds', 'Builds'], ['timeAlive', 'Time alive'], ['headshots', 'Headshots'], ['mats', 'Mats'], ['genauigkeit', 'Accuracy']];

export default function Spieler() {
  const { id = '' } = useParams();
  const [p, setP] = useState<Profil | null>(null);
  const [fehler, setFehler] = useState(false);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [bildKaputt, setBildKaputt] = useState(false);
  const [alleErgebnisse, setAlleErgebnisse] = useState(false);

  useEffect(() => {
    let weg = false;
    setP(null); setFehler(false); setBildKaputt(false);
    fetch(`/api/szene-stats?spieler=${encodeURIComponent(id)}`).then((r) => r.json()).then((d) => { if (!weg) setP(d); }).catch(() => { if (!weg) setFehler(true); });
    fetch('/api/orgs').then((r) => r.json()).then((d) => { if (!weg) setOrgs(d.orgs ?? []); }).catch(() => {});
    return () => { weg = true; };
  }, [id]);

  const sp = p?.spieler ?? null;
  const org = useMemo(() => orgs.find((o) => o.spieler?.some((s) => s.epicId?.toLowerCase() === id.toLowerCase())) ?? null, [orgs, id]);
  const orgSp = org?.spieler.find((s) => s.epicId?.toLowerCase() === id.toLowerCase()) ?? null;
  const alle = useMemo(() => [...(p?.verlauf ?? []), ...(p?.epicZeilen ?? [])], [p]);
  const geldSumme = useMemo(() => preisgeld(alle, p?.lan ?? []), [alle, p]);
  const ergebnisse = useMemo(() => {
    // Derselbe Spieltag steht in beiden Listen - einmal genuegt (der Verlauf mit den eigenen Werten zuerst).
    const gesehen = new Set<string>();
    return alle.filter((z) => !z.gesamt && typeof z.platz === 'number' && z.platz > 0 && !gesehen.has(z.windowId) && gesehen.add(z.windowId))
      .sort((a, b) => (b.datum ?? 0) - (a.datum ?? 0));
  }, [alle]);
  const plaetze = ergebnisse.map((z) => z.platz as number);
  const siege = plaetze.filter((x) => x === 1).length;
  const top10 = plaetze.filter((x) => x <= 10).length;
  const titel = (p?.fncs?.titel ?? 0) + (p?.lan ?? []).filter((l) => l.platz === 1).length;

  if (fehler) return <Glas className="p-12 text-center text-white/60">This profile isn't reachable right now.</Glas>;
  if (!p) return <div className="space-y-6"><div className="h-[400px] animate-pulse rounded-[2rem] bg-white/[0.03]" /><div className="grid grid-cols-4 gap-4">{[...Array(8)].map((_, i) => <div key={i} className="h-28 animate-pulse rounded-3xl bg-white/[0.03]" />)}</div></div>;

  const anzeige = (sp?.anzeige || sp?.name || id.slice(0, 8)).trim();
  const inGame = sp?.name && sp.name.trim().toLowerCase() !== anzeige.toLowerCase() ? sp.name : null;
  const land = sp?.land ?? null;
  const sozial = SOZIAL.map((s) => ({ ...s, h: (s.feld === 'x' ? orgSp?.x || sp?.x : s.feld === 'twitch' ? orgSp?.twitch || sp?.twitch : orgSp?.[s.feld]) ?? null })).filter((s) => s.h);
  const perz = PERZENTILE.filter(([k]) => (p.perzentile?.[k] ?? 0) > 0);
  const fncsTafel = (p.fncsTafel ?? []).filter((x) => x.platz > 0).sort((a, b) => a.platz - b.platz || (b.datum ?? 0) - (a.datum ?? 0));
  const farbe = org?.farbe || '#38bdf8';

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------ Kopf */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#080b14]">
        <div className="absolute inset-0" style={{ background: `radial-gradient(70% 120% at 15% 0%, ${farbe}2e, transparent 60%), radial-gradient(60% 100% at 100% 100%, #8b5cf622, transparent 60%)` }} />
        <div className="absolute inset-0 opacity-[0.12]" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.5) 1px, transparent 1px)', backgroundSize: '18px 18px' }} />
        {land && <img src={flagge(land)} alt="" className="pointer-events-none absolute -right-16 -top-16 h-80 w-80 rounded-full object-cover opacity-[0.06] blur-sm" />}
        <div className="relative flex flex-col gap-8 p-6 md:flex-row md:items-end lg:p-10">
          <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="relative h-[340px] w-[272px] shrink-0 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-slate-800/60 to-slate-950">
            {sp?.bild && !bildKaputt ? <img src={sp.bild} alt={anzeige} onError={() => setBildKaputt(true)} className="h-full w-full object-cover object-top" />
              : <span className="grid h-full w-full place-items-center text-7xl font-black uppercase text-white/10">{anzeige.slice(0, 2)}</span>}
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />
            {p.rang?.global ? <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1 text-xs font-bold text-white backdrop-blur">Global #{zahl(p.rang.global)}</span> : null}
          </motion.div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-sm text-white/60">
              {land && <img src={flagge(land)} alt="" className="h-6 w-6 rounded-full object-cover ring-1 ring-white/20" />}
              <span className="font-medium">{landName(land) ?? 'Competitive Fortnite player'}</span>
              {sp?.heimat && <><span className="text-white/25">·</span><span>{sp.heimat}</span></>}
            </div>
            <h1 className="mt-2 break-words text-5xl font-extrabold leading-none tracking-tight text-white lg:text-7xl">{anzeige}</h1>
            {inGame && <p className="mt-2 text-sm text-white/45">In-game: <span className="text-white/75">{inGame}</span></p>}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {org && (
                <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] py-1 pl-1 pr-3 text-sm font-semibold text-white">
                  {org.logo ? <img src={org.logo.startsWith('http') ? org.logo : `${SEITE}${org.logo}`} alt="" className="h-6 w-6 rounded-full bg-black/40 object-contain p-0.5" /> : <span className="h-6 w-6 rounded-full bg-white/10" />}
                  {org.name}{orgSp?.seit && <span className="text-xs font-normal text-white/40">since {new Date(orgSp.seit).getFullYear()}</span>}
                </span>
              )}
              {sozial.map((s) => (
                <a key={s.feld} href={s.url(s.h as string)} target="_blank" rel="noreferrer" className="rounded-full border px-3 py-1 text-xs font-semibold transition hover:-translate-y-0.5"
                  style={{ borderColor: `${s.farbe}44`, color: s.farbe, background: `${s.farbe}10` }}>{s.name} ↗</a>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-8">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/40">Career earnings</p>
                <p className="text-5xl font-black tabular-nums tracking-tight text-emerald-300">{geldSumme > 0 ? <Hochzaehlen wert={geldSumme} format={geld} /> : '—'}</p>
              </div>
              {p.rang?.regional ? (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/40">{p.rang.region} rank</p>
                  <p className="text-5xl font-black tabular-nums tracking-tight text-sky-300">#{zahl(p.rang.regional)}</p>
                  <p className="text-xs text-white/40">of {zahl(p.rang.regionalVon)} · global #{zahl(p.rang.global)} of {zahl(p.rang.globalVon)}</p>
                </div>
              ) : null}
              {titel > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/40">Titles</p>
                  <p className="text-5xl font-black tabular-nums tracking-tight text-amber-300">{titel}</p>
                  <p className="text-xs text-white/40">FNCS & LAN</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* ------------------------------------------------ Karrierezahlen */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
        <Kachel i={0} titel="Tournaments" wert={sp?.events} />
        <Kachel i={1} titel="Matches" wert={sp?.matches} />
        <Kachel i={2} titel="Eliminations" wert={sp?.elims} unter={sp?.elimsProMatch ? `${zahl(sp.elimsProMatch, 2)} per match` : undefined} />
        <Kachel i={3} titel="Damage" wert={sp?.damage} unter={sp?.damageProMatch ? `${zahl(sp.damageProMatch)} per match` : undefined} />
        <Kachel i={4} titel="Damage ratio" wert={sp?.quote} format={(n) => zahl(n, 2)} />
        <Kachel i={5} titel="Best placement" wert={plaetze.length ? Math.min(...plaetze) : null} format={(n) => `#${zahl(Math.round(n))}`} farbe="text-amber-300" />
        <Kachel i={6} titel="Wins" wert={siege} farbe="text-amber-300" />
        <Kachel i={7} titel="Top 10 finishes" wert={top10} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* ------------------------------------------------ Letzte Ergebnisse */}
        <Glas className="overflow-hidden" verzoegerung={0.25}>
          <div className="flex items-baseline justify-between border-b border-white/5 px-5 py-4">
            <h2 className="text-lg font-bold text-white">Recent results</h2>
            <span className="text-xs text-white/40">{zahl(ergebnisse.length)} placements</span>
          </div>
          <div className="divide-y divide-white/[0.05]">
            {ergebnisse.slice(0, alleErgebnisse ? 60 : 12).map((z, i) => (
              <motion.div key={`${z.windowId}-${i}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 12) * 0.03 }}
                className="grid grid-cols-[64px_minmax(0,1fr)_80px_80px_100px] items-center gap-3 px-5 py-3 hover:bg-white/[0.025]">
                <span className={`text-lg font-extrabold tabular-nums ${z.platz === 1 ? 'text-amber-300' : (z.platz ?? 99) <= 10 ? 'text-sky-300' : 'text-white/70'}`}>#{zahl(z.platz)}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{englisch(z.titel || z.event)}</p>
                  <p className="truncate text-xs text-white/40">
                    {[z.region, z.season && (p.saisonNamen?.[z.season] ?? z.season), z.datum ? new Date(z.datum).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : null].filter(Boolean).join(' · ')}
                    {z.mitspieler?.length ? <> · with {z.mitspieler.map((m, k) => <span key={m.epicId}>{k ? ', ' : ''}<Link to={`/competitive/player/${m.epicId}`} className="text-white/60 hover:text-sky-300">{m.name}</Link></span>)}</> : null}
                  </p>
                </div>
                <span className="text-right text-sm tabular-nums text-white/70">{typeof z.punkte === 'number' ? `${zahl(z.punkte)} pts` : ''}</span>
                <span className="text-right text-sm tabular-nums text-white/55">{(z.werte?.eliminations ?? z.replayElims) != null ? `${z.werte?.eliminations ?? z.replayElims} el.` : ''}</span>
                <span className="text-right text-sm font-semibold tabular-nums text-emerald-300">{z.verdienst ? geld(z.verdienst) : ''}</span>
              </motion.div>
            ))}
            {!ergebnisse.length && <p className="p-8 text-center text-sm text-white/45">No tournament placements recorded.</p>}
          </div>
          {ergebnisse.length > 12 && <button type="button" onClick={() => setAlleErgebnisse((x) => !x)} className="w-full border-t border-white/5 py-3 text-sm font-semibold text-white/60 hover:bg-white/[0.03] hover:text-white">{alleErgebnisse ? 'Show less' : `Show more (${Math.min(60, ergebnisse.length) - 12})`}</button>}
        </Glas>

        <div className="space-y-6">
          {/* ------------------------------------------------ FNCS */}
          {fncsTafel.length > 0 && (
            <Glas className="p-5" verzoegerung={0.3}>
              <h2 className="text-lg font-bold text-white">FNCS placements</h2>
              <div className="mt-4 grid grid-cols-2 gap-2.5">
                {fncsTafel.slice(0, 10).map((x, i) => (
                  <motion.div key={`${x.saison}-${i}`} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.35 + i * 0.04 }}
                    className={`rounded-2xl border p-3 ${x.platz === 1 ? 'border-amber-300/40 bg-amber-300/10' : x.platz <= 3 ? 'border-sky-400/30 bg-sky-400/[0.06]' : 'border-white/10 bg-white/[0.03]'}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-2xl font-black tabular-nums ${x.platz === 1 ? 'text-amber-300' : 'text-white'}`}>#{x.platz}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${x.typ === 'LAN' ? 'bg-violet-400/15 text-violet-300' : 'bg-white/10 text-white/50'}`}>{x.typ}</span>
                    </div>
                    <p className="mt-1 truncate text-xs font-semibold text-white/70">{x.saison}</p>
                    {x.mitspieler?.length ? <p className="truncate text-[11px] text-white/40">with {x.mitspieler.map((m) => m.name).join(', ')}</p> : null}
                  </motion.div>
                ))}
              </div>
            </Glas>
          )}

          {/* ------------------------------------------------ LAN */}
          {(p.lan?.length ?? 0) > 0 && (
            <Glas className="p-5" verzoegerung={0.35}>
              <h2 className="text-lg font-bold text-white">LAN events</h2>
              <ul className="mt-3 space-y-2">
                {[...(p.lan ?? [])].sort((a, b) => (b.datum ?? 0) - (a.datum ?? 0)).map((l, i) => (
                  <li key={`${l.kennung}-${i}`} className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5">
                    <span className={`w-10 text-lg font-black tabular-nums ${l.platz === 1 ? 'text-amber-300' : 'text-white'}`}>#{l.platz ?? '—'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{l.name}</p>
                      <p className="truncate text-xs text-white/40">{[l.ort, l.mit?.length ? `with ${l.mit.map((m) => m.name).join(', ')}` : null].filter(Boolean).join(' · ')}</p>
                    </div>
                    {l.betrag ? <span className="text-sm font-bold tabular-nums text-emerald-300">{geld(l.betrag)}</span> : null}
                  </li>
                ))}
              </ul>
            </Glas>
          )}

          {/* ------------------------------------------------ Perzentile */}
          {perz.length > 0 && (
            <Glas className="p-5" verzoegerung={0.4}>
              <div className="flex items-baseline justify-between"><h2 className="text-lg font-bold text-white">Compared to the field</h2><span className="text-[11px] text-white/40">{zahl(p.perzentile?.feldgroesse)} players</span></div>
              <ul className="mt-4 space-y-3">
                {perz.map(([k, t], i) => (
                  <li key={k} className="flex items-center gap-3">
                    <span className="w-28 text-sm text-white/70">{t}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-teal-300" initial={{ width: 0 }} animate={{ width: `${p.perzentile?.[k]}%` }} transition={{ duration: 0.9, delay: 0.45 + i * 0.06 }} /></div>
                    <span className="w-16 text-right text-xs font-bold tabular-nums text-white">top {Math.max(1, 100 - (p.perzentile?.[k] ?? 0))}%</span>
                  </li>
                ))}
              </ul>
            </Glas>
          )}
        </div>
      </div>

      {/* ------------------------------------------------ Erfolge und beste Tage */}
      <div className="grid gap-6 lg:grid-cols-2">
        {(p.erfolge?.length ?? 0) > 0 && (
          <Glas className="p-5" verzoegerung={0.45}>
            <h2 className="text-lg font-bold text-white">Top finishes</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {(p.erfolge ?? []).slice(0, 12).map((e, i) => (
                <li key={`${e.titel}-${i}`} className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2">
                  <span className={`w-8 text-base font-black tabular-nums ${e.platz === 1 ? 'text-amber-300' : 'text-white/80'}`}>#{e.platz}</span>
                  <div className="min-w-0"><p className="truncate text-sm text-white">{e.titel}</p><p className="truncate text-[11px] text-white/40">{e.saisonName ?? e.season}</p></div>
                </li>
              ))}
            </ul>
          </Glas>
        )}
        {(p.tagesbest?.length ?? 0) > 0 && (
          <Glas className="p-5" verzoegerung={0.5}>
            <h2 className="text-lg font-bold text-white">Best match days</h2>
            <ul className="mt-3 space-y-2">
              {(p.tagesbest ?? []).map((t, i) => (
                <li key={i} className="flex items-center gap-4 rounded-xl bg-white/[0.03] px-4 py-3">
                  <span className="text-3xl font-black tabular-nums text-sky-300">{t.elims}</span>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white">{englisch(t.event)}</p><p className="text-xs text-white/40">elims in {t.matches} matches · {t.region}{t.saisonName ? ` · ${t.saisonName}` : ''}</p></div>
                  {t.damage > 0 && <span className="text-sm tabular-nums text-white/60">{zahl(t.damage)} dmg</span>}
                </li>
              ))}
            </ul>
          </Glas>
        )}
      </div>

      <Glas className="flex flex-wrap items-center gap-3 p-5" verzoegerung={0.55}>
        <a href={`${SEITE}/statistics?spieler=${id}`} target="_blank" rel="noreferrer" className="rounded-xl bg-sky-400 px-4 py-2.5 text-sm font-bold text-[#06080f] transition hover:bg-sky-300">Full interactive profile on thecomphub.com ↗</a>
        <a href={`${SEITE}/player/${id}`} target="_blank" rel="noreferrer" className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-white/75 hover:border-sky-400/40 hover:text-white">Public player page ↗</a>
        <Link to="/competitive/rankings" className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-white/75 hover:border-sky-400/40 hover:text-white">Power Rankings</Link>
        <span className="ml-auto font-mono text-[11px] text-white/30">{id}</span>
      </Glas>
    </div>
  );
}
