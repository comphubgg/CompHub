import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { Flaeche, Zaehler } from '../../ds/Bausteine';
import { useHubDatei, useJetzt } from './Bausteine';
import { useAblage } from './kosmetik/daten';
import { AblageHinweis } from './kosmetik/Raster';

/*
 * Saison-Seiten: XP Calculator (Season Countdown: SaisonSeite.tsx, Map Rotation: RotationSeite.tsx).
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

/* ---------------------------------------------- XP Calculator (Design 3.0, neu komponiert 28.11.2026)
 * Ergebnis zuerst: links die Buehne mit der grossen Zahl "XP pro Tag", darunter die Stufenleiste (heute, Ziel, Soll-Stand) und die
 * Meilensteine; rechts das Pult mit allen Eingaben (Stufen mit +/-, Schnellziele, Spieltage als Chips). Darunter Spielzeit-XP je Modus
 * und die XP-Tabelle je Stufe - beides gleichzeitig sichtbar statt hinter einem Reiter.
 */
function Stepper({ titel, wert, setzen, min = 1, max = 1000, schritt = 1 }: { titel: string; wert: number; setzen: (n: number) => void; min?: number; max?: number; schritt?: number }) {
  const klemm = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">{titel}</p>
      <div className="mt-1.5 flex items-stretch overflow-hidden rounded-xl border border-white/10 bg-black/40 focus-within:border-akz/60">
        <button type="button" onClick={() => setzen(klemm(wert - schritt))} className="w-11 shrink-0 text-xl font-bold text-white/60 hover:bg-white/5 hover:text-white" aria-label={`Lower ${titel}`}>−</button>
        <input type="number" min={min} max={max} step={schritt} value={wert} onChange={(e) => setzen(klemm(Number(e.target.value) || min))} className="titel zahl w-full min-w-0 bg-transparent text-center text-4xl text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
        <button type="button" onClick={() => setzen(klemm(wert + schritt))} className="w-11 shrink-0 text-xl font-bold text-white/60 hover:bg-white/5 hover:text-white" aria-label={`Raise ${titel}`}>+</button>
      </div>
    </div>
  );
}
export function XpRechner() {
  const { s } = useSaison();
  const jetzt = useJetzt(60_000);
  const ende = Date.parse(s.end); const start = s.start ? Date.parse(s.start) : null;
  const tage = Math.max(0, Math.ceil((ende - jetzt) / 864e5));
  // Extras: Stand wird gemerkt (Konto oder Browser), Spieltage pro Woche, Restlevel-Fortschritt (XP in der aktuellen Stufe).
  const gemerkt = useAblage<{ stufe: number; ziel: number; tageProWoche: number; inStufe: number }>('xp-rechner', { stufe: 1, ziel: 100, tageProWoche: 7, inStufe: 0 });
  const { stufe, ziel, tageProWoche, inStufe } = { ...{ tageProWoche: 7, inStufe: 0 }, ...gemerkt.wert };
  const merken = (x: Partial<typeof gemerkt.wert>) => gemerkt.setzen((v) => ({ ...v, ...x }));
  const noetig = Math.max(0, Math.max(0, ziel - stufe) * XP_PRO_STUFE - inStufe);
  const spieltage = Math.max(1, Math.round((tage * tageProWoche) / 7));
  const proSpieltag = tage ? Math.ceil(noetig / spieltage) : noetig;
  const proTag = tage ? Math.ceil(noetig / tage) : noetig;
  // "Heute Stufe X sein": gleichmaessiger Weg vom Saisonstart bis zum Ende.
  const heuteSoll = (z: number) => (start ? Math.max(1, Math.floor(((jetzt - start) / (ende - start)) * z)) : null);
  const zeigeProTag = tageProWoche < 7 ? proSpieltag : proTag;
  // Stufenleiste: von 1 bis zum groesseren Wert aus Ziel und 200
  const oben = Math.max(ziel, stufe, 200);
  const pos = (l: number) => `${Math.min(100, Math.max(0, ((l - 1) / (oben - 1)) * 100))}%`;
  const soll = heuteSoll(ziel);
  const plan = useMemo(() => {
    const n = Math.min(tage, 14); const out: Array<{ tag: string; stufe: number; spielt: boolean; anteil: number }> = [];
    let gespielt = 0;
    for (let i = 0; i < n; i += 1) {
      const spielt = tageProWoche >= 7 || Math.ceil(((i + 1) * tageProWoche) / 7) > Math.ceil((i * tageProWoche) / 7);
      if (spielt) gespielt += 1;
      const xp = Math.min(noetig, gespielt * (tageProWoche < 7 ? proSpieltag : proTag));
      const st = Math.min(ziel, stufe + Math.floor((inStufe + xp) / XP_PRO_STUFE));
      out.push({ tag: new Date(jetzt + i * 864e5).toLocaleDateString('en-GB', { weekday: 'short' }), stufe: st, spielt, anteil: noetig ? xp / noetig : 1 });
    }
    return out;
  }, [tage, tageProWoche, noetig, proSpieltag, proTag, ziel, stufe, inStufe, jetzt]);
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="ueber">Community · Season</p><h1 className="titel mt-1 text-6xl lg:text-7xl">XP calculator</h1></div>
        <p className="max-w-md text-sm text-white/50">How much XP you need every day to hit your level before <b className="text-white/80">{s.name}</b> ends – {tage} days left, ends {zeit(s.end)}.</p>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* ------------------------------------------------ Buehne: die eine Zahl */}
        <Flaeche fest className="relative overflow-hidden p-6 lg:p-8">
          <div className="pointer-events-none absolute -right-20 -top-28 h-80 w-80 rounded-full bg-akz/15 blur-3xl" />
          <p className="ueber relative">{tageProWoche < 7 ? `On each of your ${spieltage} play days` : 'Every day until the season ends'}</p>
          <p className="relative mt-2 flex flex-wrap items-baseline gap-x-4">
            <span className="titel text-8xl text-white lg:text-9xl"><Zaehler wert={zeigeProTag} /></span>
            <span className="titel text-4xl text-akz">XP</span>
          </p>
          <p className="relative mt-1 text-sm text-white/55">
            {noetig.toLocaleString('en')} XP in total · {(noetig / XP_PRO_STUFE).toFixed(1)} levels · ≈ {(zeigeProTag / XP_PRO_STUFE).toFixed(1)} levels per {tageProWoche < 7 ? 'session' : 'day'}
            {tageProWoche < 7 && <> · {proTag.toLocaleString('en')} XP if you played daily</>}
          </p>

          {/* Stufenleiste */}
          <div className="relative mt-10 pb-10">
            <div className="h-2 rounded-full bg-white/[0.07]">
              <motion.div className="h-full rounded-full bg-gradient-to-r from-akz/40 to-akz" initial={{ width: 0 }} animate={{ width: pos(stufe) }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
            </div>
            {([[stufe, 'You', 'bg-white text-[#04050a]'], [ziel, 'Goal', 'bg-akz text-[#04050a]'], ...(soll ? [[soll, 'On pace today', 'bg-amber-300 text-[#04050a]']] : [])] as Array<[number, string, string]>).map(([l, t, f], i) => (
              <motion.div key={t} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.08 }} className="absolute top-0 -translate-x-1/2" style={{ left: pos(l) }}>
                <span className={`mx-auto block h-4 w-1 -translate-y-1 rounded-full ${f.split(' ')[0]}`} />
                <span className={`mt-1 block whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-bold ${f} ${i === 2 ? 'mt-6' : ''}`}>{t} · {l}</span>
              </motion.div>
            ))}
            <div className="absolute inset-x-0 -bottom-1 flex justify-between text-[10px] text-white/30"><span>Level 1</span><span className="zahl">Level {oben}</span></div>
          </div>

          {/* Plan Tag fuer Tag: Spieltage gleichmaessig ueber die Woche verteilt, Stufe am Ende jedes Tages */}
          {plan.length > 0 && (
            <div className="mt-8">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">Your plan, day by day{tage > plan.length ? ` · first ${plan.length} of ${tage} days` : ''}</p>
              <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${plan.length}, minmax(0, 1fr))` }}>
                {plan.map((p, i) => (
                  <div key={i} className="flex min-w-0 flex-col items-center gap-1">
                    <span className="zahl text-[11px] font-bold text-white/80">{p.stufe}</span>
                    <div className="relative h-20 w-full overflow-hidden rounded-md bg-white/[0.05]">
                      <motion.div className={`absolute inset-x-0 bottom-0 rounded-md ${p.spielt ? 'bg-akz/80' : 'bg-white/15'}`} initial={{ height: 0 }} animate={{ height: `${Math.max(4, p.anteil * 100)}%` }} transition={{ duration: 0.6, delay: i * 0.03 }} />
                    </div>
                    <span className="truncate text-[10px] text-white/40">{p.tag}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {start && (
            <div className="mt-6 grid grid-cols-2 gap-3">
              {[100, 200].map((z) => <div key={z} className="rounded-2xl bg-white/[0.04] p-4"><p className="text-xs text-white/45">To reach level {z} by the end</p><p className="text-xl font-bold text-white">Be level <span className="text-akz">{heuteSoll(z)}</span> today</p></div>)}
            </div>
          )}
        </Flaeche>

        {/* ------------------------------------------------ Pult: alle Eingaben */}
        <Flaeche fest verz={0.06} className="space-y-5 p-6">
          <div className="flex items-center justify-between gap-3"><p className="ueber">Your numbers</p><AblageHinweis ort={gemerkt.ort} /></div>
          <div className="grid grid-cols-2 gap-3">
            <Stepper titel="Your level" wert={stufe} setzen={(n) => merken({ stufe: n })} />
            <Stepper titel="Level to reach" wert={ziel} setzen={(n) => merken({ ziel: n })} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="mr-1 self-center text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">Quick goal</span>
            {[50, 100, 140, 200, 300].map((z) => <button key={z} type="button" onClick={() => merken({ ziel: z })} className={`chip ${ziel === z ? 'chip-an' : ''}`}>{z}</button>)}
          </div>
          <Stepper titel="XP already in this level" wert={inStufe} min={0} max={XP_PRO_STUFE - 1} schritt={1000} setzen={(n) => merken({ inStufe: n })} />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">Days you play per week</p>
            <div className="mt-1.5 grid grid-cols-7 gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7].map((n) => <button key={n} type="button" onClick={() => merken({ tageProWoche: n })} className={`rounded-lg py-2 text-sm font-bold transition ${n <= tageProWoche ? 'bg-akz text-[#04050a]' : 'bg-white/[0.05] text-white/50 hover:text-white'}`}>{n}</button>)}
            </div>
          </div>
          <p className="text-[11px] text-white/40">{XP_PRO_STUFE.toLocaleString('en')} XP per level – the Battle Pass rule since Chapter 4.</p>
        </Flaeche>
      </div>

      <div className={`grid gap-4 ${s.xpPerMinute?.length ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]' : ''}`}>
        {s.xpPerMinute?.length ? (
          <Flaeche fest verz={0.08} className="p-6">
            <h2 className="titel text-3xl">Playtime XP</h2>
            <ul className="mt-3 space-y-2">{s.xpPerMinute.map((m) => (
              <li key={m.mode} className="flex items-baseline justify-between gap-3 rounded-xl bg-white/[0.04] px-3 py-2 text-sm">
                <span className="font-semibold text-white">{m.title}</span>
                <span className="zahl text-right text-white/70">{m.xp.toLocaleString('en')} XP / min{m.weeklyLimit ? ` · weekly limit ${m.weeklyLimit.toLocaleString('en')}` : ''} · <b className="text-akz">{Math.ceil(zeigeProTag / m.xp)} min / day</b></span>
              </li>
            ))}</ul>
          </Flaeche>
        ) : null}
        <Flaeche fest verz={0.1} className="p-6">
          <div className="flex flex-wrap items-end justify-between gap-3"><h2 className="titel text-3xl">XP per level</h2><span className="text-xs text-white/40">total XP to reach the level</span></div>
          <div className={`mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 ${s.xpPerMinute?.length ? '' : 'xl:grid-cols-8'}`}>
            {[1, 25, 50, 100, 150, 200, 500, 1000].map((l) => (
              <div key={l} className={`rounded-xl p-3 ${l === ziel ? 'bg-akz/15 ring-1 ring-akz/40' : 'bg-white/[0.04]'}`}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">Level {l}</p>
                <p className="titel zahl text-2xl text-white">{((l - 1) * XP_PRO_STUFE).toLocaleString('en')}</p>
              </div>
            ))}
          </div>
          {!s.xpPerMinute?.length && <p className="mt-3 text-xs text-white/40">XP per minute per mode changes every season and isn't published for {s.name} yet.</p>}
        </Flaeche>
      </div>
    </div>
  );
}

/* Map Rotation: RotationSeite.tsx (Design 3.0) */
