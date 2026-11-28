import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Glas } from '../../teile/Glas';
import { Countdown, DatenFehlen, Hinweis, KalenderKnopf, LinkKopieren, restText, useHubDatei, useJetzt } from './Bausteine';
import { Laedt, TEAL, Ueberschrift } from './Teile';
import { useAblage } from './kosmetik/daten';
import { AblageHinweis } from './kosmetik/Raster';
import { RotationLive } from './epic/Rotation';

/*
 * Saison-Seiten: XP Calculator, Map Rotation (Season Countdown: SaisonSeite.tsx).
 *
 * Saison-Stand: fest hier (wie in der Uebersicht - Betreiber 26.11.2026: neues Chapter am 5. Dezember, Uhrzeit Epics uebliche Wartung, nicht
 * bestaetigt) und ueberschreibbar per /hub-daten/saison.json:
 *   { season, name, sub, start?, end, endConfirmed?, liveEvent?: { name, doorsOpen?, start }, modes?: [{ mode, title, end }],
 *     xpPerMinute?: [{ mode, title, xp, weeklyLimit? }], history?: [{ chapter, season, name, start, end, battlePass? }] }
 * Map Rotation: /hub-daten/rotation.json - { modes: { reload: { anchor: ISO, slotMinutes: 20, maps: [{ name, image? }] }, blitz: {...} } }.
 * Fehlt etwas, sagt die Seite das, statt zu raten.
 */

interface Saison {
  season: number; name: string; sub?: string; start?: string; end: string; endConfirmed?: boolean;
  liveEvent?: { name: string; doorsOpen?: string; start: string };
  modes?: Array<{ mode: string; title: string; end: string }>;
  xpPerMinute?: Array<{ mode: string; title: string; xp: number; weeklyLimit?: number }>;
  history?: Array<{ chapter: number; season: string | number; name: string; start: string; end: string; battlePass?: boolean }>;
}
const STANDARD: Saison = { season: 43, name: 'Treasure Hunters', sub: 'Chapter 7 · Mini season', end: '2026-12-05T09:00:00Z', endConfirmed: false };
/** Battle-Pass-Regel seit Chapter 4: jede Stufe kostet gleich viel XP. */
const XP_PRO_STUFE = 80_000;

export function useSaison(): { s: Saison; ausDatei: boolean; laedt: boolean } {
  const { daten, status } = useHubDatei<Saison>('saison.json');
  return { s: daten?.end ? { ...STANDARD, ...daten } : STANDARD, ausDatei: !!daten?.end, laedt: status === 'laedt' };
}
const zeit = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });

/* Season Countdown: SaisonSeite.tsx (Design 3.0) */

/* ---------------------------------------------- XP Calculator */
export function XpRechner() {
  const { s } = useSaison();
  const jetzt = useJetzt(60_000);
  const ende = Date.parse(s.end); const start = s.start ? Date.parse(s.start) : null;
  const tage = Math.max(0, Math.ceil((ende - jetzt) / 864e5));
  // Extras: Stand wird gemerkt (Konto oder Browser), Spieltage pro Woche, Restlevel-Fortschritt (XP in der aktuellen Stufe).
  const gemerkt = useAblage<{ stufe: number; ziel: number; tageProWoche: number; inStufe: number }>('xp-rechner', { stufe: 1, ziel: 100, tageProWoche: 7, inStufe: 0 });
  const { stufe, ziel, tageProWoche, inStufe } = { ...{ tageProWoche: 7, inStufe: 0 }, ...gemerkt.wert };
  const merken = (x: Partial<typeof gemerkt.wert>) => gemerkt.setzen((v) => ({ ...v, ...x }));
  const setStufe = (n: number) => merken({ stufe: n }); const setZiel = (n: number) => merken({ ziel: n });
  const [tab, setTab] = useState<'rechner' | 'stufen'>('rechner');
  const noetig = Math.max(0, Math.max(0, ziel - stufe) * XP_PRO_STUFE - inStufe);
  const spieltage = Math.max(1, Math.round((tage * tageProWoche) / 7));
  const proSpieltag = tage ? Math.ceil(noetig / spieltage) : noetig;
  const proTag = tage ? Math.ceil(noetig / tage) : noetig;
  // "Heute Stufe X sein": gleichmaessiger Weg vom Saisonstart bis zum Ende.
  const heuteSoll = (z: number) => (start ? Math.max(1, Math.floor(((jetzt - start) / (ende - start)) * z)) : null);
  const zahlFeld = 'w-24 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-lg font-bold tabular-nums text-white focus:border-teal-300/60 focus:outline-none';
  return (
    <div className="space-y-6">
      <Ueberschrift ueber="Community · Season" titel="XP calculator" farbe={TEAL} text={<>How much XP you need every day to hit your level before {s.name} ends.</>} />
      <div className="inline-flex rounded-xl border border-white/10 bg-black/30 p-0.5 text-sm font-bold">
        {([['rechner', 'XP Calculator'], ['stufen', 'XP per level']] as const).map(([k, t]) => <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-lg px-3.5 py-1.5 ${tab === k ? 'bg-teal-300 text-[#06080f]' : 'text-white/55 hover:text-white'}`}>{t}</button>)}
      </div>
      {tab === 'rechner' ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <Glas className="p-6">
            <p className="text-sm text-white/55">{tage} days left in {s.name}.</p>
            <div className="mt-5 flex flex-wrap items-end gap-6">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">Your level<input type="number" min={1} max={1000} value={stufe} onChange={(e) => setStufe(Math.max(1, Number(e.target.value) || 1))} className={`mt-1.5 block ${zahlFeld}`} /></label>
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">Level to reach<input type="number" min={1} max={1000} value={ziel} onChange={(e) => setZiel(Math.max(1, Number(e.target.value) || 1))} className={`mt-1.5 block ${zahlFeld}`} /></label>
            </div>
            <div className="mt-6 rounded-2xl border border-teal-300/25 bg-teal-300/[0.07] p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-teal-300">You need</p>
              <p className="mt-1 text-5xl font-black tabular-nums text-white">{proTag.toLocaleString('en')} <span className="text-2xl text-white/50">XP / day</span></p>
              <p className="mt-1 text-sm text-white/50">{noetig.toLocaleString('en')} XP in total · {XP_PRO_STUFE.toLocaleString('en')} XP per level (Battle Pass rule since Chapter 4)</p>
              {tageProWoche < 7 && <p className="mt-2 text-sm font-semibold text-teal-100">Playing {tageProWoche} days a week: <b className="text-white">{proSpieltag.toLocaleString('en')} XP</b> on each of your {spieltage} play days · ≈ {(proSpieltag / 80_000).toFixed(1)} levels per session</p>}
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-6">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">XP already in this level<input type="number" min={0} max={XP_PRO_STUFE - 1} step={1000} value={inStufe} onChange={(e) => merken({ inStufe: Math.min(XP_PRO_STUFE - 1, Math.max(0, Number(e.target.value) || 0)) })} className="mt-1.5 block w-32 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-lg font-bold tabular-nums text-white focus:border-teal-300/60 focus:outline-none" /></label>
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">Days you play per week <span className="ml-1 text-teal-200">{tageProWoche}</span>
                <input type="range" min={1} max={7} value={tageProWoche} onChange={(e) => merken({ tageProWoche: Number(e.target.value) })} className="mt-3 block w-48 accent-teal-300" /></label>
              <AblageHinweis ort={gemerkt.ort} />
            </div>
            {start && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                {[100, 200].map((z) => <div key={z} className="rounded-2xl bg-white/[0.04] p-4"><p className="text-xs text-white/45">To reach level {z}</p><p className="text-xl font-bold text-white">Be level <span className="text-teal-300">{heuteSoll(z)}</span> today</p></div>)}
              </div>
            )}
          </Glas>
          <Glas className="p-6" verzoegerung={0.08}>
            <h3 className="font-bold text-white">Playtime XP</h3>
            {s.xpPerMinute?.length ? (
              <ul className="mt-3 space-y-2">{s.xpPerMinute.map((m) => (
                <li key={m.mode} className="flex items-baseline justify-between rounded-xl bg-white/[0.04] px-3 py-2 text-sm">
                  <span className="font-semibold text-white">{m.title}</span>
                  <span className="tabular-nums text-white/70">{m.xp.toLocaleString('en')} XP / min{m.weeklyLimit ? ` · weekly limit ${m.weeklyLimit.toLocaleString('en')}` : ''} · <b className="text-teal-200">{Math.ceil(proTag / m.xp)} min / day</b></span>
                </li>
              ))}</ul>
            ) : <p className="mt-2 text-sm leading-relaxed text-white/50">XP per minute and weekly limits per mode change with every season and aren't in our data yet – they come with <code className="text-teal-200">saison.json</code>. Then this shows how many minutes per day each mode needs.</p>}
          </Glas>
        </div>
      ) : (
        <Glas className="p-6">
          <p className="text-sm text-white/55">Every Battle Pass level costs the same since Chapter 4.</p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            {[1, 25, 50, 100, 150, 200, 500, 1000].map((l) => <div key={l} className="rounded-xl bg-white/[0.04] p-3 text-center"><p className="text-xs text-white/45">Level {l}</p><p className="font-bold tabular-nums text-white">{((l - 1) * XP_PRO_STUFE).toLocaleString('en')}</p><p className="text-[10px] text-white/35">XP total</p></div>)}
          </div>
        </Glas>
      )}
    </div>
  );
}

/* ---------------------------------------------- Map Rotation */
interface Rotation { modes: Record<string, { anchor: string; slotMinutes: number; maps: Array<{ name: string; image?: string }> }> }
export function KartenRotation() {
  const { daten, status } = useHubDatei<Rotation>('rotation.json');
  const jetzt = useJetzt();
  const modi = Object.keys(daten?.modes ?? {});
  const [modus, setModus] = useState<string | null>(null);
  const m = modus ?? modi[0];
  const plan = useMemo(() => {
    const r = m ? daten?.modes[m] : undefined;
    if (!r?.maps?.length) return null;
    const slot = (r.slotMinutes || 20) * 60_000; const anker = Date.parse(r.anchor);
    const k = Math.floor((jetzt - anker) / slot);
    return Array.from({ length: Math.min(r.maps.length, 8) }, (_, i) => {
      const n = k + i; const karte = r.maps[((n % r.maps.length) + r.maps.length) % r.maps.length];
      return { karte, start: anker + n * slot, ende: anker + (n + 1) * slot };
    });
  }, [daten, m, jetzt]);
  const uhr = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  // Bilder der Reload-Inseln aus den Spieldateien (wie in der Uebersicht): /api/karten-bild
  const [bilder, setBilder] = useState<Array<{ id: string; name: string }>>([]);
  const [liveNamen, setLiveNamen] = useState<string[]>([]); // diese Bilder stehen schon oben - nicht doppelt zeigen
  useEffect(() => {
    fetch('/api/karten-bild').then((r) => r.json()).then((j) => setBilder(((j?.karten ?? []) as Array<{ id: string; titel: string }>).filter((k) => k.id.startsWith('reload-') && !/-(png|nah)$/.test(k.id)).map((k) => ({ id: k.id, name: k.titel.replace(/^Reload - /, '') })))).catch(() => {});
  }, []);
  if (status === 'laedt') return <Laedt farbe={TEAL} />;
  return (
    <div className="space-y-6">
      <Ueberschrift ueber="Community · Island" titel="Map rotation" farbe={TEAL} text="Which map is live in Reload and Blitz right now – and what's next. Times in your time zone." />
      {!plan ? (
        <>
          <RotationLive bilder={bilder} live={setLiveNamen} />
          {bilder.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-2xl font-extrabold tracking-tight text-white">Reload islands</h2>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
                {bilder.filter((b) => !liveNamen.includes(b.name.toLowerCase())).map((b, i) => (
                  <motion.div key={b.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.04 }} whileHover={{ y: -5 }} className="group relative aspect-square overflow-hidden rounded-3xl border border-white/10 bg-[#0a1a2a]">
                    <img src={`/api/karten-bild?id=${encodeURIComponent(b.id)}&datei=1`} alt={b.name} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-110" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#06080f] via-transparent to-transparent" />
                    <p className="absolute bottom-3 left-4 font-extrabold text-white">{b.name}</p>
                  </motion.div>
                ))}
              </div>
            </section>
          )}
          <Hinweis mehr={<>Epic rotates Reload and Blitz maps on a fixed clock but doesn't publish the order. With the order and one known start time in <code className="text-teal-200">hub-daten/rotation.json</code>, this page also shows exact countdowns and what's up next.</>}>
            Live map detection from Epic's player numbers – exact "up next" times need the rotation schedule.
          </Hinweis>
        </>
      ) : (
        <>
          <div className="inline-flex rounded-xl border border-white/10 bg-black/30 p-0.5 text-sm font-bold">
            {modi.map((k) => <button key={k} type="button" onClick={() => setModus(k)} className={`rounded-lg px-4 py-1.5 capitalize ${m === k ? 'bg-teal-300 text-[#06080f]' : 'text-white/55 hover:text-white'}`}>{k}</button>)}
          </div>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            {plan.slice(0, 2).map((p, i) => (
              <Glas key={i} className="relative overflow-hidden" verzoegerung={i * 0.06}>
                <div className="relative aspect-video">
                  {p.karte.image ? <img src={p.karte.image} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 bg-gradient-to-br from-teal-500/20 to-violet-500/10" />}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#06080f] via-[#06080f]/40 to-transparent" />
                  <div className="absolute bottom-0 p-6">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-teal-300">{i ? 'Up next' : 'Current rotation'}</p>
                    <h2 className={`font-black tracking-tight text-white ${i ? 'text-3xl' : 'text-5xl'}`}>{p.karte.name}</h2>
                    <p className="text-sm text-white/60">{uhr(p.start)} – {uhr(p.ende)}</p>
                    {!i && <p className="mt-2 text-4xl font-black tabular-nums text-teal-300">{restText(p.ende - jetzt)} <span className="text-sm font-semibold text-white/45">remaining</span></p>}
                  </div>
                </div>
              </Glas>
            ))}
          </div>
          <Glas className="divide-y divide-white/5">
            {plan.map((p, i) => (
              <div key={i} className={`flex items-center gap-4 px-5 py-3 ${i ? '' : 'bg-teal-300/[0.06]'}`}>
                <span className="w-6 text-sm font-bold text-white/40">{i + 1}</span>
                <span className="flex-1 font-semibold text-white">{p.karte.name}</span>
                <span className="text-sm text-white/55">{i ? `Starts in ${restText(p.start - jetzt)}` : `Live · ${restText(p.ende - jetzt)}`}</span>
                <span className="w-28 text-right text-sm tabular-nums text-white/45">{uhr(p.start)} – {uhr(p.ende)}</span>
              </div>
            ))}
          </Glas>
        </>
      )}
    </div>
  );
}
