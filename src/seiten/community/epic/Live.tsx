import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Glas } from '../../../teile/Glas';
import { Hinweis, LinkKopieren, ZeitChips } from '../Bausteine';
import { Laedt, TEAL, Ueberschrift } from '../Teile';
import { useAblage } from '../kosmetik/daten';
import { AblageHinweis, Auswahl, Schalter } from '../kosmetik/Raster';
import {
  aktuell, gesamt, inselHolen, inselLink, kurz, letzter, METRIK_NAMEN, metrikenZeitraum, POOL_SEITEN, spitze, useEpicErreichbar, useInselPool, useModi, useTopInseln, wertFuer,
  type Insel, type Metriken, type MetrikName, type ModusDaten, type Zeitraum,
} from './daten';
import { MiniVerlauf, Verlauf, Zahl } from './Diagramm';
import { SPIELMODI } from './modi';

/*
 * Live-Seiten auf Epics offizieller Fortnite Data API (siehe epic/daten.ts):
 *   Player Count   Spielerzahlen je Modus (BR, ZB, Reload, OG, Ranked, Blitz - Codes in epic/modi.ts) mit Verlauf, Stundentabelle
 *   Discover       "Top islands right now" - Rangliste nach Spitzenspielern (1H / 1D / 1W), sortiert sich live um, waehrend sie laedt
 *   Creators       dieselben Inseln nach Creator-Code zusammengezaehlt, "Following" pro Konto/Browser
 *   Creative       Inseln durchsuchen und filtern, Code direkt oeffnen; Detailseite /community/creative/<code> mit allen Metriken
 */

const Z: Zeitraum[] = ['1H', '1D', '1W'];
const Z_TEXT: Record<Zeitraum, string> = { '1H': 'last hour', '1D': 'last 24 hours', '1W': 'last 7 days' };

/** Kleiner Hinweis, wenn Epics API nicht antwortet (Sandbox, Netzwerk) - die Seite bleibt trotzdem gefuellt. */
function EpicHinweis({ offline }: { offline: boolean }) {
  const e = useEpicErreichbar();
  if (!offline && e !== 'aus') return null;
  return (
    <Hinweis ton="amber" mehr={<>The hub asks <code className="text-teal-200">api.fortnite.com/ecosystem/v1</code> through the local proxy <code className="text-teal-200">/epic-daten</code> (vite.config.ts). It's Epic's free, public data API – no key needed. If your network or a blocker stops it, numbers stay empty; everything else on the page still works.</>}>
      <span className="font-semibold text-white/70">Epic's Fortnite Data API isn't answering right now</span> – live numbers fill in as soon as it does.
    </Hinweis>
  );
}

/** Bild einer Insel - oder (Epic liefert nicht immer eines) eine eigene Kachel in einer Farbe aus dem Code, nie ein hochgezogenes Mini-Bild. */
const farbeAus = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
function InselBild({ i, klein = false }: { i: Insel; klein?: boolean }) {
  const [kaputt, setKaputt] = useState(false);
  const h = farbeAus(i.code);
  if (i.bild && !kaputt) return <img src={i.bild} alt="" loading="lazy" onError={() => setKaputt(true)} className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" />;
  const modus = SPIELMODI.find((m) => m.titel === i.titel && i.epic);
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: modus ? `radial-gradient(120% 120% at 20% 10%, ${modus.farbe}55, #070a12 70%)` : `radial-gradient(120% 120% at 15% 0%, hsl(${h} 70% 45% / 0.45), hsl(${(h + 60) % 360} 60% 20% / 0.35) 45%, #070a12 80%)` }}>
      <div className="absolute -right-6 -top-10 h-32 w-32 rounded-full blur-2xl" style={{ background: modus ? `${modus.farbe}40` : `hsl(${(h + 120) % 360} 80% 60% / 0.25)` }} />
      {klein ? <p className="absolute inset-0 grid place-items-center text-sm font-black uppercase tracking-tight text-white/85">{i.titel.split(/\s+/).slice(0, 2).map((w) => w[0]).join('')}</p>
        : <p className="absolute bottom-2 left-3 right-3 line-clamp-2 text-2xl font-black uppercase leading-[0.95] tracking-tight text-white/85">{i.titel}</p>}
    </div>
  );
}

/* ================================================================== Player Count */
/*
 * Epics eigene Modi (BR, ZB, Reload, OG, Ranked, Blitz) stehen bisher NICHT in Epics oeffentlicher Data API (alle Codes aus modi.ts -> 404).
 * Die Seite fragt sie trotzdem leise weiter (falls Epic sie ergaenzt) - antwortet mindestens einer, zeigt sie die Modus-Ansicht (nur Modi mit
 * Zahlen). Sonst wird sie zu "Most played islands right now": die meistgespielten oeffentlichen Inseln aus derselben Liste wie Discover.
 */
export function Spielerzahl() {
  const [z, setZ] = useState<Zeitraum>('1D');
  const modi = useModi(z);
  const da = SPIELMODI.filter((m) => modi.daten[m.k]);
  const chips = <div className="flex items-center gap-2"><ZeitChips wert={z} setzen={(w) => setZ(w as Zeitraum)} optionen={Z} /><LinkKopieren /></div>;
  return da.length ? <ModusAnsicht z={z} chips={chips} daten={modi.daten} /> : <InselAnsicht z={z} chips={chips} />;
}

/** Farben fuer die Top 10 im gestapelten Verlauf (jede Insel eine eigene, gut unterscheidbare Farbe). */
const TOP_FARBEN = ['#5eead4', '#38bdf8', '#a78bfa', '#f59e0b', '#f472b6', '#34d399', '#fb7185', '#facc15', '#818cf8', '#fdba74'];
/** Fenster fuer den Verlauf: 1H zeigt die letzten 6 Stunden (Epic liefert Stundenwerte), sonst den Zeitraum selbst. */
const VERLAUF_FENSTER: Record<Zeitraum, number> = { '1H': 6 * 36e5, '1D': 864e5, '1W': 7 * 864e5 };

function InselAnsicht({ z, chips }: { z: Zeitraum; chips: React.ReactNode }) {
  const r = useTopInseln(z, true);
  const [n, setN] = useState(25);
  const top100 = r.liste.slice(0, 100);
  const summe = top100.reduce((s, x) => s + x.v, 0);
  const top10 = r.liste.slice(0, 10);
  const ab = Date.now() - VERLAUF_FENSTER[z] - 36e5;
  const serien = top10.map((x, k) => ({ name: x.i.titel, farbe: TOP_FARBEN[k], punkte: x.w.serie.filter((p) => p.t >= ab) }));
  const max = r.liste[0]?.v ?? 1;
  const wartet = !r.liste.length && (r.laedt || !r.fertig);
  const pruefen = r.inseln.filter((i) => !i.epic).length;
  return (
    <div className="space-y-6">
      <Ueberschrift ueber="Community · Player count" titel="Most played islands right now" farbe={TEAL} text="Fortnite's public islands ranked by how many people play them at the same time – live from Epic's official Fortnite Data API." rechts={chips} />
      <p className="flex items-start gap-2 text-xs text-white/45">
        <svg viewBox="0 0 20 20" className="mt-px h-3.5 w-3.5 shrink-0 text-teal-300/80" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="10" cy="10" r="7.5" /><path d="M10 9v5M10 6.2v.1" strokeLinecap="round" /></svg>
        Epic's own modes (Battle Royale, Zero Build, Reload …) aren't in Epic's public data yet – these are the most played public islands.
      </p>
      <EpicHinweis offline={r.offline && !r.liste.length} />

      <Glas className="relative overflow-hidden p-6 md:p-8">
        <div className="pointer-events-none absolute -left-20 -top-24 h-80 w-80 rounded-full bg-teal-400/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-teal-300">Top {top100.length || 100} islands · peak players combined</p>
            {r.liste.length
              ? <p className="mt-1 text-6xl font-black tracking-tight text-white md:text-7xl"><Zahl wert={summe} /></p>
              : <div className="mt-4 h-[72px]"><Laedt farbe={TEAL} text={wartet ? 'Asking Epic for island numbers …' : 'No island numbers from Epic right now.'} /></div>}
            <p className="mt-1 text-sm text-white/45">Sum of each island's peak · {Z_TEXT[z]}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {r.liste[0] && (
              <Link to={`/community/creative/${encodeURIComponent(r.liste[0].i.code)}`} className="text-right">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.25em] text-white/35">#1 · {Z_TEXT[z]}</span>
                <span className="block max-w-[22rem] truncate text-lg font-extrabold text-white hover:text-teal-200">{r.liste[0].i.titel}</span>
                <span className="block text-sm font-bold text-teal-200">{kurz(r.liste[0].v)} playing</span>
              </Link>
            )}
            <Fortschritt geprueft={r.geprueft} gesamt={pruefen} laedt={r.laedt} />
          </div>
        </div>
        <div className="relative mt-6 pb-5">
          {top10.length >= 2 ? <Verlauf gestapelt hoehe={280} serien={[...serien].reverse()} />
            : <div className="grid h-[280px] place-items-center rounded-2xl border border-dashed border-white/10 text-sm text-white/35">{wartet ? 'The chart appears as soon as the first islands answer.' : 'Not enough islands with players for a chart.'}</div>}
        </div>
        {top10.length > 0 && (
          <div className="relative flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
            {top10.map((x, k) => <span key={x.i.code} className="flex min-w-0 items-center gap-1.5 text-white/60"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: TOP_FARBEN[k] }} /><span className="max-w-[14rem] truncate">{x.i.titel}</span></span>)}
          </div>
        )}
        <p className="relative mt-3 text-[11px] text-white/30">Chart: the top 10 islands stacked · hourly peaks · {z === '1H' ? 'last 6 hours' : Z_TEXT[z]}</p>
      </Glas>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Glas className="overflow-hidden">
          <div className="flex items-baseline justify-between px-5 pt-5"><h2 className="text-xl font-extrabold text-white">Ranking</h2><span className="text-xs text-white/40">Peak players · {Z_TEXT[z]}</span></div>
          <LayoutGroup>
            <ol className="mt-3">
              {r.liste.slice(0, n).map((x, k) => (
                <motion.li layout key={x.i.code} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ layout: { type: 'spring', stiffness: 320, damping: 34 } }} className="border-t border-white/5">
                  <Link to={`/community/creative/${encodeURIComponent(x.i.code)}`} className="group relative flex items-center gap-4 px-4 py-2.5 hover:bg-white/[0.03]">
                    <motion.span className="absolute inset-y-0 left-0 bg-teal-300/[0.06]" initial={{ width: 0 }} animate={{ width: `${(x.v / max) * 100}%` }} transition={{ duration: 0.7 }} />
                    <span className="relative w-7 text-right text-sm font-black tabular-nums" style={{ color: k < 10 ? TOP_FARBEN[k] : 'rgba(255,255,255,0.35)' }}>{k + 1}</span>
                    <span className="relative h-10 w-[72px] shrink-0 overflow-hidden rounded-lg"><InselBild i={x.i} klein /></span>
                    <span className="relative min-w-0 flex-1"><span className="block truncate font-bold text-white">{x.i.titel}</span><span className="block truncate text-[11px] text-white/40">{x.i.creator || 'unknown'} · <span className="font-mono">{x.i.code}</span></span></span>
                    <span className="relative hidden w-32 sm:block"><MiniVerlauf punkte={x.w.serie.filter((p) => p.t >= ab)} farbe={k < 10 ? TOP_FARBEN[k] : '#5eead4'} hoehe={26} /></span>
                    <span className="relative hidden w-14 text-right text-[11px] tabular-nums text-white/40 md:block">{summe ? `${((x.v / summe) * 100).toFixed(1)} %` : ''}</span>
                    <span className="relative w-20 text-right font-black tabular-nums text-teal-200">{kurz(x.v)}</span>
                  </Link>
                </motion.li>
              ))}
            </ol>
          </LayoutGroup>
          {r.liste.length > n && <button type="button" onClick={() => setN((v) => v + 25)} className="w-full border-t border-white/5 py-3 text-sm font-semibold text-teal-200 hover:bg-white/[0.03]">Show more ({r.liste.length - n} left)</button>}
          {!r.liste.length && <div className="border-t border-white/5 p-5"><Laedt farbe={TEAL} text={wartet ? 'Asking Epic for player numbers …' : 'No islands with players found.'} /></div>}
        </Glas>
        <div className="space-y-5">
          <Glas className="p-5" verzoegerung={0.05}>
            <h3 className="font-bold text-white">Top 10 share</h3>
            <p className="text-xs text-white/40">of the top {top100.length || 100} islands' combined peak</p>
            <ul className="mt-4 space-y-2.5">
              {top10.map((x, k) => (
                <li key={x.i.code}>
                  <div className="flex items-baseline justify-between gap-3 text-xs"><span className="truncate font-semibold text-white/75">{x.i.titel}</span><span className="shrink-0 tabular-nums text-white/45">{summe ? `${((x.v / summe) * 100).toFixed(1)} %` : ''}</span></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><motion.div className="h-full rounded-full" style={{ background: TOP_FARBEN[k] }} initial={{ width: 0 }} animate={{ width: `${summe ? (x.v / summe) * 100 : 0}%` }} transition={{ duration: 0.8, delay: k * 0.04 }} /></div>
                </li>
              ))}
            </ul>
            {!top10.length && <p className="mt-4 text-sm text-white/35">{wartet ? 'Waiting for the first islands …' : 'No numbers yet.'}</p>}
          </Glas>
          <Glas className="p-5 text-xs text-white/45" verzoegerung={0.1}>
            <p className="font-bold text-white">How this is counted</p>
            <p className="mt-2">Each island's peak concurrent players from Epic's Fortnite Data API, ranked among the first {r.seiten * 100 || POOL_SEITEN * 100} islands of Epic's public island list. Islands with fewer than 5 players get no number from Epic and are left out.</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {r.mehr && <button type="button" disabled={r.laedt} onClick={() => r.mehr?.()} className="rounded-lg border border-white/10 px-2.5 py-1 font-semibold text-white/60 hover:text-white disabled:opacity-40">Check more islands</button>}
              <Link to="/community/discover" className="py-1 font-semibold text-teal-200/80 hover:text-white">Discover with pictures →</Link>
            </div>
          </Glas>
        </div>
      </div>
    </div>
  );
}

/** Modus-Ansicht (nur, wenn Epic mindestens einen Modus beantwortet) - es erscheinen nur Modi mit Zahlen, nie leere Karten. */
function ModusAnsicht({ z, chips, daten }: { z: Zeitraum; chips: React.ReactNode; daten: Record<string, ModusDaten | null> }) {
  const da = SPIELMODI.filter((m) => daten[m.k]);
  const [wahl, setGewaehlt] = useState('br');
  const gewaehlt = da.some((m) => m.k === wahl) ? wahl : da[0].k;
  const modus = SPIELMODI.find((m) => m.k === gewaehlt)!;
  const summeJetzt = da.reduce((s, m) => s + (letzter(daten[m.k]!.m.peakCCU) ?? 0), 0);
  const d = daten[gewaehlt];
  // Stundentabelle (bzw. je Intervall) fuer den gewaehlten Modus: Spitze, Veraenderung zum Intervall davor, eindeutige Spieler
  const tabelle = useMemo(() => {
    const r = d?.m.peakCCU ?? []; const u = new Map((d?.m.uniquePlayers ?? []).map((p) => [p.t, p.v]));
    return r.map((p, i) => ({ t: p.t, v: p.v, diff: i ? p.v - r[i - 1].v : null, u: u.get(p.t) ?? null })).reverse().slice(0, 14);
  }, [d]);
  const ivText = d?.iv === 'minute' ? '10-minute' : d?.iv === 'day' ? 'daily' : 'hourly';
  return (
    <div className="space-y-6">
      <Ueberschrift ueber="Community · Live" titel="Player count" farbe={TEAL} text="How many people play each Fortnite mode – straight from Epic's official Fortnite Data API." rechts={chips} />

      <Glas className="relative overflow-hidden p-6 md:p-8">
        <div className="pointer-events-none absolute -left-20 -top-24 h-80 w-80 rounded-full bg-teal-400/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-teal-300">All modes · latest peak</p>
            <p className="mt-1 text-6xl font-black tracking-tight text-white md:text-7xl"><Zahl wert={summeJetzt} /></p>
            <p className="mt-1 text-sm text-white/45">Sum of each mode's most recent {ivText} peak · {Z_TEXT[z]}</p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            {da.map((m) => <span key={m.k} className="flex items-center gap-1.5 text-white/60"><span className="h-2 w-2 rounded-full" style={{ background: m.farbe }} />{m.kurz}</span>)}
          </div>
        </div>
        <div className="relative mt-6 pb-5">
          <Verlauf gestapelt hoehe={260} serien={[...da].reverse().map((m) => ({ name: m.titel, farbe: m.farbe, punkte: daten[m.k]!.m.peakCCU }))} />
        </div>
      </Glas>

      <LayoutGroup>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {da.map((m, i) => {
            const x = daten[m.k]; const an = m.k === gewaehlt;
            return (
              <motion.button key={m.k} type="button" onClick={() => setGewaehlt(m.k)} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} whileHover={{ y: -4 }}
                className={`relative overflow-hidden rounded-3xl border p-4 text-left backdrop-blur-xl transition-colors ${an ? 'border-white/25 bg-white/[0.07]' : 'border-white/10 bg-white/[0.035] hover:border-white/20'}`}>
                {an && <motion.span layoutId="modus-karte" className="absolute inset-x-0 top-0 h-[3px]" style={{ background: m.farbe, boxShadow: `0 0 16px ${m.farbe}` }} />}
                <p className="flex items-center gap-2 text-sm font-bold text-white"><span className="h-2 w-2 rounded-full" style={{ background: m.farbe }} />{m.titel}</p>
                <p className="mt-2 text-3xl font-black text-white"><Zahl wert={letzter(x!.m.peakCCU)} format={(n) => kurz(n)} /></p>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35">latest peak</p>
                <div className="mt-2"><MiniVerlauf punkte={x?.m.peakCCU ?? []} farbe={m.farbe} hoehe={36} /></div>
                <div className="mt-2 flex justify-between text-[11px] text-white/45"><span>Peak <b className="text-white/80">{kurz(spitze(x?.m.peakCCU ?? []))}</b></span><span>Unique <b className="text-white/80">{kurz(gesamt(x?.m.uniquePlayers ?? []))}</b></span></div>
              </motion.button>
            );
          })}
        </div>
      </LayoutGroup>

      <AnimatePresence mode="wait">
        <motion.div key={gewaehlt + z} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Glas className="p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-extrabold text-white"><span style={{ color: modus.farbe }}>●</span> {modus.titel}</h2>
              <span className="text-xs text-white/40">{d ? `${ivText} · ${Z_TEXT[z]}` : ''}</span>
            </div>
            <div className="mt-4 pb-5">
              {d ? <Verlauf hoehe={300} serien={[{ name: 'Peak players', farbe: modus.farbe, punkte: d.m.peakCCU }, ...(d.m.uniquePlayers.length && z !== '1H' ? [] : [])]} />
                : <div className="grid h-[300px] place-items-center text-sm text-white/40">No numbers for this mode yet.</div>}
            </div>
            {d && d.m.uniquePlayers.length > 1 && (
              <div className="mt-4 border-t border-white/5 pt-4">
                <p className="mb-2 text-xs font-semibold text-white/50">Unique players & plays per interval</p>
                <div className="pb-5"><Verlauf hoehe={150} flaeche={false} serien={[{ name: 'Unique players', farbe: '#c4b5fd', punkte: d.m.uniquePlayers }, { name: 'Plays', farbe: '#fde047', punkte: d.m.plays }]} /></div>
              </div>
            )}
          </Glas>
          <Glas className="overflow-hidden" verzoegerung={0.05}>
            <div className="flex items-baseline justify-between px-5 pt-5"><h3 className="font-bold text-white">By {d?.iv === 'minute' ? '10 minutes' : d?.iv === 'day' ? 'day' : 'hour'}</h3><span className="text-xs text-white/40">newest first</span></div>
            <table className="mt-2 w-full text-sm">
              <thead className="text-left text-[10px] uppercase tracking-wider text-white/35"><tr><th className="px-5 py-2">Time</th><th className="text-right">Peak</th><th className="text-right">Change</th><th className="px-5 text-right">Unique</th></tr></thead>
              <tbody>
                {tabelle.map((r, i) => (
                  <motion.tr key={r.t} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 16) * 0.02 }} className="border-t border-white/5">
                    <td className="px-5 py-1.5 text-white/60">{new Date(r.t).toLocaleString('en-GB', d?.iv === 'day' ? { weekday: 'short', day: 'numeric', month: 'short' } : { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="text-right font-bold tabular-nums text-white">{Math.round(r.v).toLocaleString('en')}</td>
                    <td className={`text-right tabular-nums ${r.diff === null ? 'text-white/30' : r.diff >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{r.diff === null ? '—' : `${r.diff >= 0 ? '+' : ''}${kurz(r.diff)}`}</td>
                    <td className="px-5 text-right tabular-nums text-white/55">{kurz(r.u)}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
            {!tabelle.length && <p className="px-5 pb-5 text-sm text-white/40">No intervals yet.</p>}
          </Glas>
        </motion.div>
      </AnimatePresence>

      <details className="text-[11px] text-white/35">
        <summary className="cursor-pointer select-none hover:text-white/60">Source: Epic's Fortnite Data API · which codes answered</summary>
        <ul className="mt-2 space-y-1">{SPIELMODI.map((m) => <li key={m.k}><b className="text-white/55">{m.titel}:</b> {daten[m.k] ? `${daten[m.k]!.set ? 'set' : `${daten[m.k]!.quelle.length} playlists summed`} – ${daten[m.k]!.quelle.slice(0, 6).join(', ')}${daten[m.k]!.quelle.length > 6 ? ' …' : ''}` : daten[m.k] === null ? 'no answer' : 'loading'}</li>)}</ul>
        <p className="mt-1">Peaks of single playlists are added up per interval, so the total can be slightly higher than the true simultaneous peak.</p>
      </details>
    </div>
  );
}

/* ================================================================== Discover - Top islands */
function Fortschritt({ geprueft, gesamt: g, laedt }: { geprueft: number; gesamt: number; laedt: boolean }) {
  if (!laedt && geprueft >= g) return null;
  const p = g ? Math.min(100, (geprueft / g) * 100) : 5;
  return (
    <div className="flex items-center gap-3 text-xs text-white/45">
      <div className="h-1 w-40 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full bg-teal-300" animate={{ width: `${p}%` }} transition={{ duration: 0.4 }} /></div>
      Checking islands {geprueft.toLocaleString('en')} / {g.toLocaleString('en')}
    </div>
  );
}
const useRangliste = useTopInseln;
export function Entdecken() {
  const [z, setZ] = useState<Zeitraum>('1H');
  const [ohneEpic, setOhneEpic] = useState(false);
  const [n, setN] = useState(30);
  const r = useRangliste(z, ohneEpic);
  const top = r.liste.slice(0, 3); const rest = r.liste.slice(3, n);
  const max = r.liste[0]?.v ?? 1;
  return (
    <div className="space-y-6">
      <Ueberschrift ueber="Community · Live" titel="Top islands right now" farbe={TEAL} text="Fortnite islands ranked by how many people play them at the same time – Epic's own modes included."
        rechts={<div className="flex flex-wrap items-center gap-2"><ZeitChips wert={z} setzen={(w) => setZ(w as Zeitraum)} optionen={Z} /><Schalter titel="Hide Epic modes" an={ohneEpic} setzen={setOhneEpic} /></div>} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Fortschritt geprueft={r.geprueft} gesamt={r.inseln.filter((i) => !i.code.startsWith('modus:') && !i.epic).length} laedt={r.laedt} />
        <span className="text-xs text-white/35">Peak players · {Z_TEXT[z]}</span>
      </div>
      <EpicHinweis offline={r.offline && !r.liste.length} />
      <LayoutGroup>
        <div className="grid gap-4 lg:grid-cols-3">
          {(top.length ? top : Array.from({ length: 3 }, () => null)).map((x, k) => x ? (
            <motion.div layout key={x.i.code} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ layout: { type: 'spring', stiffness: 300, damping: 32 } }} whileHover={{ y: -5 }}>
              <Link to={`/community/creative/${encodeURIComponent(x.i.code)}`} className="group block overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] backdrop-blur-xl hover:border-white/25">
                <div className="relative aspect-video"><InselBild i={x.i} />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#06080f] via-transparent to-transparent" />
                  <span className="absolute left-3 top-3 grid h-10 w-10 place-items-center rounded-2xl bg-black/60 text-xl font-black text-white backdrop-blur">{k + 1}</span>
                  <span className="absolute bottom-3 right-3 rounded-xl bg-black/65 px-2.5 py-1 text-lg font-black text-teal-200 backdrop-blur"><Zahl wert={x.v} format={kurz} /> <span className="text-[10px] font-semibold text-white/50">playing</span></span>
                </div>
                <div className="p-4">
                  <p className="truncate text-lg font-extrabold text-white">{x.i.titel}</p>
                  <p className="truncate text-xs text-white/45">{x.i.epic ? 'Epic Games' : `by ${x.i.creator || 'unknown'}`} · <span className="font-mono">{x.i.code.startsWith('modus:') ? 'Epic mode' : x.i.code}</span></p>
                  <div className="mt-3"><MiniVerlauf punkte={x.w.serie} farbe="#5eead4" hoehe={34} /></div>
                  {x.i.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{x.i.tags.slice(0, 4).map((t) => <span key={t} className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-white/55">{t}</span>)}</div>}
                </div>
              </Link>
            </motion.div>
          ) : <div key={k} className="aspect-[4/3] animate-pulse rounded-3xl bg-white/[0.03]" />)}
        </div>
        <Glas className="overflow-hidden">
          <ol>
            {rest.map((x, k) => (
              <motion.li layout key={x.i.code} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ layout: { type: 'spring', stiffness: 320, damping: 34 } }} className="border-t border-white/5 first:border-0">
                <Link to={`/community/creative/${encodeURIComponent(x.i.code)}`} className="group relative flex items-center gap-4 px-4 py-2.5 hover:bg-white/[0.03]">
                  <motion.span className="absolute inset-y-0 left-0 bg-teal-300/[0.06]" initial={{ width: 0 }} animate={{ width: `${(x.v / max) * 100}%` }} transition={{ duration: 0.7 }} />
                  <span className="relative w-7 text-right text-sm font-black tabular-nums text-white/35">{k + 4}</span>
                  <span className="relative h-10 w-[72px] shrink-0 overflow-hidden rounded-lg"><InselBild i={x.i} klein /></span>
                  <span className="relative min-w-0 flex-1"><span className="block truncate font-bold text-white">{x.i.titel}</span><span className="block truncate text-[11px] text-white/40">{x.i.epic ? 'Epic Games' : x.i.creator} · {x.i.tags.slice(0, 3).join(', ') || x.i.kategorie || ''}</span></span>
                  <span className="relative hidden w-32 sm:block"><MiniVerlauf punkte={x.w.serie} farbe="#5eead4" hoehe={26} /></span>
                  <span className="relative w-20 text-right font-black tabular-nums text-teal-200">{kurz(x.v)}</span>
                </Link>
              </motion.li>
            ))}
          </ol>
          {r.liste.length > n && <button type="button" onClick={() => setN((v) => v + 30)} className="w-full border-t border-white/5 py-3 text-sm font-semibold text-teal-200 hover:bg-white/[0.03]">Show more ({r.liste.length - n} left)</button>}
          {!r.liste.length && <div className="p-5"><Laedt farbe={TEAL} text={r.laedt ? 'Asking Epic for player numbers …' : 'No islands with players found.'} /></div>}
        </Glas>
      </LayoutGroup>
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-white/30">
        <span>Ranked among the first {r.seiten * 100 || POOL_SEITEN * 100} islands of Epic's public island list plus Epic's own modes.</span>
        {r.mehr && <button type="button" disabled={r.laedt} onClick={() => r.mehr?.()} className="rounded-lg border border-white/10 px-2.5 py-1 font-semibold text-white/60 hover:text-white disabled:opacity-40">Check more islands</button>}
        <Link to="/community/creative" className="font-semibold text-teal-200/80 hover:text-white">Browse & search all islands →</Link>
      </div>
    </div>
  );
}

/* ================================================================== Creators */
export function Creators() {
  const [z, setZ] = useState<Zeitraum>('1D');
  const r = useRangliste(z, true);
  const folge = useAblage<string[]>('creators-folgen', []);
  const [reiter, setReiter] = useState<'alle' | 'folge'>('alle');
  const [suche, setSuche] = useState(''); const [sort, setSort] = useState('spieler'); const [offen, setOffen] = useState<string | null>(null); const [n, setN] = useState(50);
  const creators = useMemo(() => {
    const m = new Map<string, { name: string; spieler: number; inseln: Array<{ i: Insel; v: number }> }>();
    for (const x of r.liste) {
      const k = x.i.creator || 'unknown';
      const c = m.get(k) ?? { name: k, spieler: 0, inseln: [] };
      c.spieler += x.v; c.inseln.push({ i: x.i, v: x.v }); m.set(k, c);
    }
    return [...m.values()];
  }, [r.liste]);
  const liste = creators.filter((c) => (reiter === 'alle' || folge.wert.includes(c.name)) && c.name.toLowerCase().includes(suche.toLowerCase()))
    .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'maps' ? b.inseln.length - a.inseln.length : b.spieler - a.spieler));
  const max = Math.max(1, ...liste.map((c) => c.spieler));
  return (
    <div className="space-y-6">
      <Ueberschrift ueber="Community · Live" titel="Creators" farbe={TEAL} text="Creative makers ranked by the players on all their islands together – from Epic's Fortnite Data API."
        rechts={<div className="flex flex-wrap items-center gap-2"><ZeitChips wert={z} setzen={(w) => setZ(w as Zeitraum)} optionen={Z} /><AblageHinweis ort={folge.ort} /></div>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[['Creators', creators.length], ['Islands with players', r.liste.length], ['Players (sum of peaks)', creators.reduce((s, c) => s + c.spieler, 0)], ['Following', folge.wert.length]].map(([k, v], i) => (
          <Glas key={k as string} className="p-5" verzoegerung={i * 0.05}><p className="text-3xl font-black text-teal-200"><Zahl wert={v as number} format={kurz} /></p><p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">{k as string}</p></Glas>
        ))}
      </div>
      <EpicHinweis offline={r.offline && !r.liste.length} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-white/10 bg-black/30 p-0.5 text-sm font-bold">
          {([['alle', 'All creators'], ['folge', `Following ${folge.wert.length}`]] as const).map(([k, t]) => (
            <button key={k} type="button" onClick={() => setReiter(k)} className="relative rounded-lg px-3.5 py-1.5">
              {reiter === k && <motion.span layoutId="creator-reiter" className="absolute inset-0 rounded-lg bg-teal-300" />}<span className={`relative ${reiter === k ? 'text-[#06080f]' : 'text-white/55 hover:text-white'}`}>{t}</span>
            </button>
          ))}
        </div>
        <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Find a creator…" className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-teal-300/60 focus:outline-none" />
        <Auswahl titel="Sort" wert={sort} setzen={setSort} optionen={[['spieler', 'Players'], ['maps', 'Islands'], ['name', 'Name']]} />
        <div className="ml-auto"><Fortschritt geprueft={r.geprueft} gesamt={r.inseln.filter((i) => !i.epic).length} laedt={r.laedt} /></div>
      </div>
      <Glas className="overflow-hidden">
        <LayoutGroup>
          <ul>
            {liste.slice(0, n).map((c, k) => {
              const an = folge.wert.includes(c.name); const auf = offen === c.name;
              return (
                <motion.li layout key={c.name} className="border-t border-white/5 first:border-0">
                  <div className="relative flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03]">
                    <motion.span className="absolute bottom-0 left-0 h-[2px] rounded-full bg-gradient-to-r from-violet-400/60 to-teal-300/60" initial={{ width: 0 }} animate={{ width: `${(c.spieler / max) * 100}%` }} transition={{ duration: 0.7 }} />
                    <span className="relative w-7 text-right text-sm font-black tabular-nums text-white/35">{k + 1}</span>
                    <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-black text-white" style={{ background: `hsl(${farbeAus(c.name)} 55% 35%)` }}>{c.name.slice(0, 1).toUpperCase()}</span>
                    <button type="button" onClick={() => setOffen(auf ? null : c.name)} className="relative min-w-0 flex-1 text-left">
                      <span className="block truncate font-bold text-white">{c.name}</span>
                      <span className="block truncate text-[11px] text-white/40">{c.inseln.length} island{c.inseln.length === 1 ? '' : 's'} · top: {c.inseln[0]?.i.titel}</span>
                    </button>
                    <span className="relative w-20 text-right font-black tabular-nums text-teal-200">{kurz(c.spieler)}</span>
                    <button type="button" title={an ? 'Unfollow' : 'Follow'} onClick={() => folge.setzen((v) => (an ? v.filter((x) => x !== c.name) : [...v, c.name]))} className={`relative rounded-lg px-2 py-1 text-base ${an ? 'text-teal-300' : 'text-white/30 hover:text-white'}`}>{an ? '★' : '☆'}</button>
                  </div>
                  <AnimatePresence initial={false}>
                    {auf && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="grid gap-2 px-4 pb-4 pl-14 sm:grid-cols-2 xl:grid-cols-4">
                          {c.inseln.slice(0, 8).map(({ i, v }) => (
                            <Link key={i.code} to={`/community/creative/${encodeURIComponent(i.code)}`} className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-2 hover:border-white/25">
                              <span className="relative h-9 w-16 shrink-0 overflow-hidden rounded-lg"><InselBild i={i} klein /></span>
                              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-white">{i.titel}</span><span className="font-mono text-[10px] text-white/40">{i.code}</span></span>
                              <span className="text-xs font-bold tabular-nums text-teal-200">{kurz(v)}</span>
                            </Link>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.li>
              );
            })}
          </ul>
        </LayoutGroup>
        {liste.length > n && <button type="button" onClick={() => setN((v) => v + 50)} className="w-full border-t border-white/5 py-3 text-sm font-semibold text-teal-200 hover:bg-white/[0.03]">Show more ({liste.length - n} left)</button>}
        {!liste.length && <div className="p-5 text-sm text-white/45">{r.laedt ? <Laedt farbe={TEAL} text="Adding up players per creator …" /> : reiter === 'folge' ? 'You don’t follow anyone yet – tap ☆ next to a creator.' : 'No creators found.'}</div>}
      </Glas>
      <p className="text-[11px] text-white/30">Players = the peak of each island in the chosen period, added up per creator code. Epic's own modes are left out here.</p>
    </div>
  );
}

/* ================================================================== Creative - durchsuchen */
export function Creative() {
  const p = useInselPool();
  const geh = useNavigate();
  const [suche, setSuche] = useState(''); const [ohneEpic, setOhneEpic] = useState(false); const [tag, setTag] = useState('alle');
  const [art, setArt] = useState('alle'); const [sort, setSort] = useState('tag'); const [code, setCode] = useState(''); const [n, setN] = useState(48);
  const tags = useMemo(() => { const m = new Map<string, number>(); for (const i of p.inseln) for (const t of i.tags) m.set(t, (m.get(t) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([t]) => t); }, [p.inseln.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const arten = useMemo(() => [...new Set(p.inseln.map((i) => i.erstelltIn).filter(Boolean) as string[])], [p.inseln.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const q = suche.toLowerCase();
  const liste = p.inseln.filter((i) => (!ohneEpic || !i.epic) && (tag === 'alle' || i.tags.includes(tag)) && (art === 'alle' || i.erstelltIn === art)
    && (!q || `${i.titel} ${i.creator} ${i.code} ${i.tags.join(' ')}`.toLowerCase().includes(q)))
    .map((i) => ({ i, w: p.werte.get(i.code) }))
    .sort((a, b) => (sort === 'name' ? a.i.titel.localeCompare(b.i.titel) : (wertFuer(b.w, sort === 'jetzt' ? '1H' : sort === 'woche' ? '1W' : '1D') ?? -1) - (wertFuer(a.w, sort === 'jetzt' ? '1H' : sort === 'woche' ? '1W' : '1D') ?? -1)));
  const codeOk = /^\d{4}-\d{4}-\d{4}$/.test(code.trim()) || /^(set_|playlist_)/i.test(code.trim());
  return (
    <div className="space-y-6">
      <Ueberschrift ueber="Community · Live" titel="Creative" farbe={TEAL} text="Browse Fortnite islands with live player numbers from Epic – search, filter by tag and engine, or open any island by its code." />
      <form onSubmit={(e) => { e.preventDefault(); if (codeOk) geh(`/community/creative/${encodeURIComponent(code.trim())}`); }} className="flex flex-wrap items-center gap-2">
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Island code, e.g. 1234-5678-9012" className="w-72 rounded-xl border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm text-white placeholder:text-white/30 focus:border-teal-300/60 focus:outline-none" />
        <button type="submit" disabled={!codeOk} className="rounded-xl bg-teal-300 px-4 py-2 text-sm font-bold text-[#06080f] transition hover:bg-teal-200 disabled:opacity-30">Open island</button>
        <Link to="/community/discover" className="ml-auto text-sm font-semibold text-teal-200/80 hover:text-white">Top islands right now →</Link>
      </form>
      <div className="flex flex-wrap items-center gap-2">
        <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Search islands, creators, tags…" className="w-72 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-teal-300/60 focus:outline-none" />
        {arten.length > 1 && <Auswahl titel="Made in" wert={art} setzen={setArt} optionen={[['alle', 'All'], ...arten.map((a): [string, string] => [a, a])]} />}
        <Auswahl titel="Sort" wert={sort} setzen={setSort} optionen={[['jetzt', 'Players now'], ['tag', 'Peak 24h'], ['woche', 'Peak 7 days'], ['name', 'Name']]} />
        <Schalter titel="Hide Epic" an={ohneEpic} setzen={setOhneEpic} />
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {['alle', ...tags].map((t) => (
            <button key={t} type="button" onClick={() => setTag(t)} className="relative rounded-full px-3 py-1 text-xs font-semibold capitalize">
              {tag === t && <motion.span layoutId="creative-tag" className="absolute inset-0 rounded-full bg-teal-300/20 ring-1 ring-teal-300/50" />}
              <span className={`relative ${tag === t ? 'text-white' : 'text-white/50 hover:text-white'}`}>{t === 'alle' ? 'All tags' : t}</span>
            </button>
          ))}
        </div>
      )}
      <EpicHinweis offline={p.offline && !p.inseln.length} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-6">
        {liste.slice(0, n).map(({ i, w }, k) => (
          <motion.div key={i.code} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(k, 18) * 0.025 }} whileHover={{ y: -4 }}>
            <Link to={`/community/creative/${encodeURIComponent(i.code)}`} className="group block overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] hover:border-white/25">
              <div className="relative aspect-video"><InselBild i={i} />
                {w?.jetzt ? <span className="absolute left-2 top-2 flex items-center gap-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-bold text-white"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />{kurz(w.jetzt)} playing</span> : null}
                {i.erstelltIn && <span className="absolute right-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white/70">{i.erstelltIn}</span>}
              </div>
              <div className="p-3">
                <p className="truncate font-bold text-white">{i.titel}</p>
                <p className="truncate text-xs text-white/45">{i.epic ? 'Epic Games' : i.creator} · <span className="font-mono">{i.code.startsWith('modus:') ? 'Epic mode' : i.code}</span></p>
                <div className="mt-2 flex items-center justify-between text-[11px] text-white/40"><span>24h peak <b className="text-white/75">{kurz(w?.tag)}</b></span><span>7d <b className="text-white/75">{kurz(w?.woche)}</b></span></div>
              </div>
            </Link>
          </motion.div>
        ))}
        {!liste.length && Array.from({ length: p.laedt ? 8 : 0 }, (_, k) => <div key={k} className="aspect-[4/3] animate-pulse rounded-2xl bg-white/[0.03]" />)}
      </div>
      {!liste.length && !p.laedt && <Glas className="p-6 text-sm text-white/50">No island matches these filters.</Glas>}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {liste.length > n && <button type="button" onClick={() => setN((v) => v + 48)} className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-white/75 hover:text-white">Show more ({liste.length - n})</button>}
        {p.mehr && <button type="button" disabled={p.laedt} onClick={() => p.mehr?.()} className="rounded-xl border border-teal-300/30 px-4 py-2 text-sm font-semibold text-teal-200 hover:text-white disabled:opacity-40">{p.laedt ? 'Loading islands …' : 'Load more islands from Epic'}</button>}
      </div>
      <p className="text-[11px] text-white/30">{p.inseln.length.toLocaleString('en')} islands loaded from Epic's public island list · numbers: Epic's Fortnite Data API (peak concurrent players).</p>
    </div>
  );
}

/* ================================================================== Insel-Detail */
const METRIKEN: Array<{ k: MetrikName; farbe: string }> = [
  { k: 'peakCCU', farbe: '#5eead4' }, { k: 'uniquePlayers', farbe: '#c4b5fd' }, { k: 'plays', farbe: '#fde047' }, { k: 'minutesPlayed', farbe: '#7dd3fc' },
  { k: 'averageMinutesPerPlayer', farbe: '#fdba74' }, { k: 'favorites', farbe: '#f9a8d4' }, { k: 'recommendations', farbe: '#86efac' },
];
export function InselDetail() {
  const { code: roh = '' } = useParams();
  const code = decodeURIComponent(roh);
  const [insel, setInsel] = useState<Insel | null | undefined>(undefined);
  const [z, setZ] = useState<Zeitraum>('1D');
  const [m, setM] = useState<(Metriken & { iv: string }) | null | undefined>(undefined);
  const [tage, setTage] = useState<Metriken | null>(null);
  const [metrik, setMetrik] = useState<MetrikName>('peakCCU');
  const pool = useInselPool();
  const ausPool = pool.inseln.find((i) => i.code === code);
  useEffect(() => { let weg = false; setInsel(undefined); inselHolen(code).then((i) => { if (!weg) setInsel(i); }).catch(() => { if (!weg) setInsel(null); }); return () => { weg = true; }; }, [code]);
  useEffect(() => { let weg = false; setM(undefined); metrikenZeitraum(code, z).then((x) => { if (!weg) setM(x); }).catch(() => { if (!weg) setM(null); }); return () => { weg = true; }; }, [code, z]);
  useEffect(() => { let weg = false; metrikenZeitraum(code, '1W').then((x) => { if (!weg) setTage(x); }).catch(() => {}); return () => { weg = true; }; }, [code]);
  const i: Insel = insel ?? ausPool ?? { code, titel: code, creator: '', tags: [], epic: /^(set_|playlist_)/i.test(code) };
  const jetzt = Date.now();
  const kacheln: Array<[string, number | null | undefined, string?]> = [
    ['Players now', tage ? aktuell(tage) : m ? aktuell(m) : null], ['Peak 24h', spitze(tage?.peakCCU ?? [], jetzt - 864e5)], ['Peak 7 days', spitze(tage?.peakCCU ?? [])],
    ['Unique players 24h', gesamt(tage?.uniquePlayers ?? [], jetzt - 864e5)], ['Plays 24h', gesamt(tage?.plays ?? [], jetzt - 864e5)],
    ['Minutes played 24h', gesamt(tage?.minutesPlayed ?? [], jetzt - 864e5)],
  ];
  const ret = (tage?.retention ?? []).filter((r) => r.d1 !== undefined || r.d7 !== undefined).at(-1);
  const verfuegbar = METRIKEN.filter((x) => (m?.[x.k]?.length ?? 0) > 1);
  const aktiv = verfuegbar.find((x) => x.k === metrik) ?? verfuegbar[0];
  return (
    <div className="space-y-6">
      <Link to="/community/creative" className="text-sm font-semibold text-white/50 hover:text-white">← All islands</Link>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="group relative aspect-video overflow-hidden rounded-3xl border border-white/10"><InselBild i={i} /></motion.div>
        <div className="flex flex-col justify-end gap-3">
          <Ueberschrift ueber={i.epic ? 'Epic Games' : `Island by ${i.creator || '…'}`} titel={i.titel} farbe={TEAL} text={i.text} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-xl border border-white/10 bg-black/30 px-3 py-1.5 font-mono text-sm text-white/80">{code}</span>
            <LinkKopieren text="Copy code" url={code} />
            <a href={inselLink(i)} target="_blank" rel="noreferrer" className="rounded-xl bg-teal-300 px-3.5 py-1.5 text-sm font-bold text-[#06080f] hover:bg-teal-200">Open on fortnite.com ↗</a>
            {i.creator && !i.epic && <Link to="/community/creators" className="rounded-xl border border-white/10 px-3 py-1.5 text-sm font-semibold text-white/70 hover:text-white">Creators ranking</Link>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[i.kategorie, i.erstelltIn].filter(Boolean).map((t) => <span key={t} className="rounded-full bg-teal-300/10 px-2.5 py-0.5 text-[11px] font-semibold text-teal-200">{t}</span>)}
            {i.tags.map((t) => <span key={t} className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[11px] font-semibold text-white/60">{t}</span>)}
          </div>
        </div>
      </div>
      {insel === null && m === null && <EpicHinweis offline />}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kacheln.map(([k, v], n) => <Glas key={k} className="p-4" verzoegerung={n * 0.04}><p className="text-2xl font-black text-white"><Zahl wert={v} format={kurz} /></p><p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">{k}</p></Glas>)}
      </div>
      <Glas className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1">
            {verfuegbar.map((x) => (
              <button key={x.k} type="button" onClick={() => setMetrik(x.k)} className="relative rounded-xl px-3 py-1.5 text-xs font-bold">
                {aktiv?.k === x.k && <motion.span layoutId="insel-metrik" className="absolute inset-0 rounded-xl bg-white/10 ring-1 ring-white/20" />}
                <span className="relative flex items-center gap-1.5" style={{ color: aktiv?.k === x.k ? 'white' : 'rgba(255,255,255,0.5)' }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: x.farbe }} />{METRIK_NAMEN[x.k].titel}</span>
              </button>
            ))}
          </div>
          <ZeitChips wert={z} setzen={(w) => setZ(w as Zeitraum)} optionen={Z} />
        </div>
        <div className="mt-4 pb-5">
          {m === undefined ? <div className="h-[300px] animate-pulse rounded-2xl bg-white/[0.03]" /> : aktiv && m ? (
            <AnimatePresence mode="wait"><motion.div key={aktiv.k + z} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <Verlauf hoehe={300} serien={[{ name: METRIK_NAMEN[aktiv.k].titel, farbe: aktiv.farbe, punkte: m[aktiv.k] }]} />
            </motion.div></AnimatePresence>
          ) : <p className="grid h-[200px] place-items-center text-sm text-white/40">No metrics for this island in the {Z_TEXT[z]}.</p>}
        </div>
        {aktiv && <p className="text-[11px] text-white/35">{METRIK_NAMEN[aktiv.k].text} · {m?.iv === 'minute' ? '10-minute' : m?.iv === 'day' ? 'daily' : 'hourly'} intervals</p>}
      </Glas>
      {ret && (
        <div className="grid gap-3 sm:grid-cols-2">
          {([['Day-1 retention', ret.d1], ['Day-7 retention', ret.d7]] as const).map(([k, v], n) => (
            <Glas key={k} className="p-5" verzoegerung={n * 0.05}>
              <div className="flex items-baseline justify-between"><p className="font-bold text-white">{k}</p><p className="text-2xl font-black text-teal-200">{v !== undefined ? `${Math.round(v * (v <= 1 ? 100 : 1))} %` : '—'}</p></div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full rounded-full bg-gradient-to-r from-teal-300 to-violet-400" initial={{ width: 0 }} animate={{ width: `${Math.min(100, (v ?? 0) * (v !== undefined && v <= 1 ? 100 : 1))}%` }} transition={{ duration: 1 }} /></div>
              <p className="mt-2 text-[11px] text-white/40">Share of new players who came back {k.startsWith('Day-1') ? 'the next day' : 'a week later'}.</p>
            </Glas>
          ))}
        </div>
      )}
      <p className="text-[11px] text-white/30">Source: Epic's Fortnite Data API (api.fortnite.com/ecosystem/v1) – last 7 days.</p>
    </div>
  );
}
