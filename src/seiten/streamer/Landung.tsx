import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Abschnitt, Flaeche, Kennzahl, Leer } from '../../ds/Bausteine';
import { useWer } from '../../teile/Anmeldung';
import { ARTEN, FREIE_ARTEN } from './ov/OverlayGeruest';
import { MARKE, vorOrt } from './ov/ort';
import { REIHENFOLGE, probeVon, useProbeDaten, type Probe } from './ov/proben';
import { Kanalbild, LiveMarke, ProbeBuehne, StufenMarke, Zeichen, Zuschauer } from './Teile';
import { GRUPPEN, kurzZahl, useLive, vorschaubild, type Kanal } from './live';

/*
 * Die Landung des Streamer-Bereichs - fuer alle, die nicht angemeldet sind (Betreiber: "kein blosses Tor"). Sie zeigt, was drin ist:
 *   Aufbau seit 28.11.2026 siehe unten (Landung). Daten: /api/streamers + /api/live-status, die Overlay-Dateien der Seite als Vorschau.
 */

/*
 * Mehrere Overlays auf einem Stream-Bild: jede Datei laeuft ueber die ganze Flaeche und setzt sich selbst an ihren Platz. Die Flaeche ist hier
 * 1280 x 720 statt 1920 x 1080 - auf dem verkleinerten Bild waeren die Overlays sonst nur noch Briefmarken.
 */
const FL_B = 1280; const FL_H = 720;
function Sendebild({ k, takt, proben }: { k: Kanal | null; takt: number; proben: Probe[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [b, setB] = useState(0);
  const [bildFehlt, setBildFehlt] = useState(false);
  useEffect(() => {
    const el = box.current; if (!el) return undefined;
    const messen = () => setB(el.clientWidth);
    messen();
    const ro = new ResizeObserver(messen); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => setBildFehlt(false), [k?.login]);
  return (
    <div ref={box} className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black ring-1 ring-white/10 shadow-[0_40px_90px_-40px_rgb(var(--akz)/0.7)]">
      {k && !bildFehlt
        ? <img src={vorschaubild(k.login, takt, 1280, 720)} alt="" draggable={false} onError={() => setBildFehlt(true)} className="absolute inset-0 h-full w-full object-cover" />
        : <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_25%_120%,rgb(var(--akz)/0.35),transparent_60%),radial-gradient(ellipse_at_90%_-10%,rgba(56,189,248,0.18),transparent_55%),linear-gradient(180deg,#171a27,#07080d)]" aria-hidden />}
      <div className="absolute inset-0 bg-black/25" aria-hidden />
      {b > 0 && proben.map((p) => (
        <iframe key={p.src} title="Overlay preview" src={vorOrt(p.src)} scrolling="no" tabIndex={-1}
          className="pointer-events-none absolute left-0 top-0 origin-top-left border-0" style={{ width: FL_B, height: FL_H, transform: `scale(${b / FL_B})`, background: 'transparent' }} />
      ))}
      {k && <div className="absolute left-3 top-3 flex items-center gap-2"><LiveMarke klein /><Zuschauer n={k.viewers} /></div>}
    </div>
  );
}

/* Was jedes Konto bekommt und was VIP dazu bringt - als eine Vergleichstabelle (frei = in beiden Spalten). */
const LEISTUNGEN: Array<{ z: string; titel: string; text: string; frei: boolean }> = [
  { z: 'wand', titel: 'Live Streams & multiview', text: 'Every pro and creator who is live – several at once on your own wall.', frei: true },
  { z: 'uhr', titel: 'Cup timer overlay', text: 'A countdown to any cup day for your starting-soon screen.', frei: true },
  { z: 'overlay', titel: 'Offspawn score overlay', text: 'Two sides, photos and a score you count by hand.', frei: true },
  { z: 'seite', titel: 'Your channel on CompHub', text: 'See how your stream shows up for CompHub viewers.', frei: true },
  { z: 'pokal', titel: 'Live cup overlays', text: 'Team banner, leaderboard, qual line and the custom scoreboard – fed by the live leaderboard.', frei: false },
  { z: 'overlay', titel: 'Globals 2026 overlays', text: 'The same overlays in the look of the Global Championship.', frei: false },
  { z: 'bot', titel: 'Twitch bot', text: 'Your own chat commands and rules, around the clock.', frei: false },
  { z: 'kurve', titel: 'Twitch statistics', text: 'Peak with and without raids, average, followers, chatters.', frei: false },
  { z: 'finder', titel: 'Match-ID finder', text: 'The running match ID of the pros you follow.', frei: false },
  { z: 'replay', titel: 'Replays & Pro POVs', text: 'Every cup game in 2D and 3D, and private POVs of pros.', frei: false },
];

/** Kleines Vorschaubild eines laufenden Streams fuer die Wand; faellt es aus, bleibt die dunkle Flaeche. */
function WandBild({ k, takt }: { k: Kanal; takt: number }) {
  const [kaputt, setKaputt] = useState(false);
  useEffect(() => setKaputt(false), [k.login]);
  if (kaputt) return <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_120%,rgb(var(--akz)/0.28),transparent_60%),linear-gradient(180deg,#141722,#07080d)]" aria-hidden />;
  return <img src={vorschaubild(k.login, takt, 640, 360)} alt="" loading="lazy" draggable={false} onError={() => setKaputt(true)} className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" />;
}

/*
 * Neu komponiert (28.11.2026, Betreiber: "nichts 1:1 gleich"): dieselbe Reihenfolge wie die gebauten Seiten des Bereichs -
 *   1. Sendung zuerst: links gross das Sendebild mit drei echten Overlays, rechts Satz, Knoepfe und Zahlen
 *   2. Die Overlays wie auf der Overlay-Seite in drei Spalten: Waehlen (Liste) · grosse laufende Vorschau · was es zeigt und wie man es bekommt
 *   3. Wer live ist wie in der Multiview: links eine 2x2-Wand der groessten Streams, rechts die Seitenleiste mit allen Kanaelen
 *   4. Free gegen VIP als eine Vergleichstabelle mit den Knoepfen im Kopf
 */
export default function Landung({ wunsch }: { wunsch?: string }) {
  const { oeffnen } = useWer();
  const { liste, takt } = useLive();
  const daten = useProbeDaten();
  const [start] = useState(() => Date.now() + 2 * 3_600_000 + 14 * 60_000);
  const live = useMemo(() => (liste ?? []).filter((k) => k.isLive).sort((a, b) => b.viewers - a.viewers), [liste]);
  const zuschauer = live.reduce((s, k) => s + k.viewers, 0);
  const vorn = live[0] ?? null;
  // Drei Overlays auf dem Sendebild, jedes an seinem Platz
  const aufSendung = useMemo(() => [
    probeVon('standings', daten, start, { vert: 'middle', horiz: 'left', rand: 40 }),
    probeVon('custom', daten, start, { vert: 'bottom', horiz: 'center', rand: 36 }),
    probeVon('timer', daten, start, { vert: 'top', horiz: 'right', rand: 40 }),
  ].filter((p): p is Probe => !!p), [daten, start]);
  const arten = useMemo(() => REIHENFOLGE.map((s) => ARTEN.find((a) => a.schluessel === s)).filter((a): a is (typeof ARTEN)[number] => !!a), []);
  const [art, setArt] = useState(REIHENFOLGE[0]);
  const gewaehlt = arten.find((a) => a.schluessel === art) ?? arten[0];
  const gewaehltVip = !FREIE_ARTEN.includes(gewaehlt.schluessel);
  const wand = live.slice(vorn ? 1 : 0, vorn ? 5 : 4);

  return (
    <div className="space-y-8">
      {/* ------------------------------------------------ 1. Sendung zuerst */}
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] xl:items-stretch">
        <motion.div initial={{ opacity: 0, y: 20, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="min-w-0">
          <Sendebild k={vorn} takt={takt} proben={aufSendung} />
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-white/45">
            {vorn && <span className="inline-flex items-center gap-2 text-sm font-bold text-white"><Kanalbild src={vorn.bild} className="h-7 w-7 rounded-lg ring-1 ring-white/15" />{vorn.anzeige || vorn.login}<span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">{GRUPPEN[vorn.gruppe] ?? vorn.gruppe}</span></span>}
            <span className="min-w-0 flex-1">{vorn ? 'is live right now – with' : 'On stream:'} three real CompHub overlays on top: leaderboard, scoreboard and cup timer.</span>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1, duration: 0.55, ease: [0.22, 1, 0.36, 1] }} className="fl-fest relative isolate order-first flex min-w-0 flex-col overflow-hidden p-6 sm:p-8 xl:order-none">
          <div className="pointer-events-none absolute -right-32 -top-32 -z-10 h-[420px] w-[420px] rounded-full bg-akz/20 blur-[110px]" aria-hidden />
          <p className="ueber">Streamer area · free for every streamer</p>
          <h1 className="titel mt-2 text-6xl sm:text-7xl">Your stream.<br /><span className="text-akz">Live cup data.</span></h1>
          <p className="mt-4 text-[15px] leading-relaxed text-white/60">Overlays that update themselves, a multiview of every pro who is live, a Twitch bot and your stream statistics. A free account gets you the tools for small streamers – a VIP key unlocks everything with live cup data.</p>
          {wunsch && <p className="mt-4 inline-flex items-center gap-2 self-start rounded-xl bg-akz/10 px-3 py-2 text-sm text-white/80 ring-1 ring-akz/30"><Zeichen name="schloss" className="h-4 w-4 text-akz" />Sign in to open <b className="text-white">{wunsch}</b>.</p>}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => oeffnen('registrieren')} className="knopf-prim !px-6 !py-3 !text-[15px]">Create free account</button>
            <button type="button" onClick={() => oeffnen('konto')} className="knopf !px-6 !py-3 !text-[15px]">Sign in</button>
          </div>
          <button type="button" onClick={() => oeffnen('schluessel')} className="mt-3 inline-flex items-center gap-2 self-start py-1 text-sm font-semibold text-amber-200 transition hover:text-amber-100"><Zeichen name="schluessel" className="h-4 w-4" />I have a VIP access key</button>
          <div className="mt-auto grid grid-cols-2 gap-x-6 gap-y-5 border-t border-white/[0.07] pt-6">
            <Kennzahl label="Live right now" wert={liste ? live.length : null} ton="rot" />
            <Kennzahl label="Watching" wert={liste ? zuschauer : null} />
            <Kennzahl label="Channels tracked" wert={liste ? liste.length : null} />
            <Kennzahl label="Overlays" wert={arten.length} unter={`${arten.filter((a) => FREIE_ARTEN.includes(a.schluessel)).length} free · ${arten.filter((a) => !FREIE_ARTEN.includes(a.schluessel)).length} VIP`} />
          </div>
        </motion.div>
      </section>

      {/* ------------------------------------------------ 2. Overlays: waehlen · Vorschau · bekommen (wie die Overlay-Seite) */}
      <Abschnitt ueber="OBS browser source" titel="Overlays that update themselves" rechts={<span className="hidden text-xs text-white/45 md:block">Choose · adjust · copy the URL into OBS</span>}>
        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)] 2xl:grid-cols-[280px_minmax(0,1fr)_340px]">
          <Flaeche fest className="ohne-leiste flex gap-2 overflow-x-auto p-2 lg:flex-col lg:overflow-visible">
            {arten.map((a) => {
              const an = a.schluessel === gewaehlt.schluessel; const vip = !FREIE_ARTEN.includes(a.schluessel);
              return (
                <button key={a.schluessel} type="button" onClick={() => setArt(a.schluessel)}
                  className={`relative flex min-w-[180px] items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition lg:min-w-0 ${an ? 'bg-akz/15 ring-1 ring-akz/50' : 'hover:bg-white/[0.04]'}`}>
                  <span className="min-w-0"><span className={`block font-bold ${an ? 'text-white' : 'text-white/75'}`}>{a.titel}</span><span className="block truncate text-xs text-white/45">{a.kurz}</span></span>
                  <StufenMarke vip={vip} />
                </button>
              );
            })}
          </Flaeche>
          <Flaeche fest verz={0.05} className="min-w-0 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3">
              <h3 className="titel text-3xl">{gewaehlt.titel}</h3>
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">Live preview · sample values · OBS {gewaehlt.obs.b} × {gewaehlt.obs.h}</span>
            </div>
            <ProbeBuehne key={gewaehlt.schluessel} probe={probeVon(gewaehlt.schluessel, daten, start)} titel={gewaehlt.titel} maxMass={2.2} className="aspect-[16/8]" />
          </Flaeche>
          <Flaeche fest verz={0.1} className="flex flex-col gap-4 p-5 lg:col-span-2 2xl:col-span-1">
            {([['What it shows', gewaehlt.zeigt], ['When to use it', gewaehlt.wann], ['Where the data comes from', gewaehlt.quelle]] as const).map(([k, v]) => (
              <div key={k}><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">{k}</p><p className="mt-1 text-sm leading-relaxed text-white/75">{v}</p></div>
            ))}
            <div className="mt-auto border-t border-white/[0.06] pt-4">
              {gewaehltVip
                ? <button type="button" onClick={() => oeffnen('schluessel')} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-bold text-black transition hover:brightness-110"><Zeichen name="schluessel" className="h-4 w-4" />Unlock with a VIP key</button>
                : <button type="button" onClick={() => oeffnen('registrieren')} className="knopf-prim w-full">Free with an account – create one</button>}
            </div>
          </Flaeche>
        </div>
      </Abschnitt>

      {/* ------------------------------------------------ 3. Wer live ist - wie die Multiview: Wand + Seitenleiste */}
      <Abschnitt ueber="On air" titel={<>Live right now {liste && <span className="ml-1 text-red-400">{live.length}</span>}</>}
        rechts={<button type="button" onClick={() => oeffnen('registrieren')} className="knopf-leer">Watch them side by side <span aria-hidden>→</span></button>}>
        {!liste ? <div className="fl-fest aspect-[21/9] animate-pulse" />
          : !live.length ? <Leer text="Nobody on CompHub's list is live right now – the list refreshes every minute." />
          : (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {wand.map((k, i) => (
                  <motion.a key={k.login} href={`https://twitch.tv/${k.login}`} target="_blank" rel="noreferrer" initial={{ opacity: 0, scale: 0.98 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}
                    className="group relative aspect-video overflow-hidden rounded-2xl bg-black ring-1 ring-white/[0.07] transition hover:ring-akz/50">
                    <WandBild k={k} takt={takt} />
                    <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 to-transparent" />
                    <div className="absolute left-3 top-3 flex items-center gap-2"><LiveMarke klein /><Zuschauer n={k.viewers} /></div>
                    <div className="absolute inset-x-3 bottom-3 flex items-end gap-2.5">
                      <Kanalbild src={k.bild} className="h-9 w-9 rounded-lg ring-1 ring-white/15" />
                      <div className="min-w-0"><p className="truncate font-bold text-white">{k.anzeige || k.login}</p><p className="truncate text-xs text-white/55">{k.title}</p></div>
                    </div>
                  </motion.a>
                ))}
              </div>
              <Flaeche fest className="flex max-h-[560px] flex-col overflow-hidden">
                <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3"><p className="ueber">All live channels</p><span className="zahl text-xs text-white/40">{kurzZahl(zuschauer)} watching</span></div>
                <ul className="ohne-leiste flex-1 overflow-y-auto">
                  {live.map((k) => (
                    <li key={k.login}>
                      <a href={`https://twitch.tv/${k.login}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-white/[0.04]">
                        <Kanalbild src={k.bild} className="h-8 w-8 rounded-lg ring-1 ring-white/10" />
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-white">{k.anzeige || k.login}</span><span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">{GRUPPEN[k.gruppe] ?? k.gruppe}</span></span>
                        <span className="zahl text-xs font-bold text-red-300">{kurzZahl(k.viewers)}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </Flaeche>
            </div>
          )}
      </Abschnitt>

      {/* ------------------------------------------------ 4. Free gegen VIP als Tabelle */}
      <Abschnitt ueber="Access" titel="Free account or VIP">
        <Flaeche fest className="overflow-hidden">
          <div className="grid grid-cols-[minmax(0,1fr)_72px_72px] items-end gap-x-2 border-b border-white/[0.06] px-4 py-4 sm:grid-cols-[minmax(0,1fr)_200px_200px] sm:px-6">
            <p className="text-sm text-white/50">Streamers and pros get their key from CompHub. Overlays and Globals come with every VIP, the other tools are switched on per streamer.</p>
            <div className="text-center"><StufenMarke vip={false} /><button type="button" onClick={() => oeffnen('registrieren')} className="knopf-prim mt-2 hidden w-full sm:inline-flex">Create account</button></div>
            <div className="text-center"><StufenMarke vip /><button type="button" onClick={() => oeffnen('schluessel')} className="mt-2 hidden w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-black transition hover:brightness-110 sm:inline-flex"><Zeichen name="schluessel" className="h-4 w-4" />Enter key</button></div>
          </div>
          <ul>
            {LEISTUNGEN.map((x) => (
              <li key={x.titel} className="grid grid-cols-[minmax(0,1fr)_72px_72px] items-center gap-x-2 border-t border-white/[0.04] px-4 py-3 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_200px_200px] sm:px-6">
                <span className="flex min-w-0 items-center gap-3.5">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1 ${x.frei ? 'bg-akz/10 text-akz ring-akz/25' : 'bg-amber-400/10 text-amber-200 ring-amber-300/25'}`}><Zeichen name={x.z} className="h-[18px] w-[18px]" /></span>
                  <span className="min-w-0"><span className="block font-semibold text-white">{x.titel}</span><span className="block text-xs text-white/50 sm:text-sm">{x.text}</span></span>
                </span>
                <span className="grid place-items-center">{x.frei ? <Zeichen name="haken" className="h-5 w-5 text-akz" /> : <Zeichen name="schloss" className="h-4 w-4 text-white/20" />}</span>
                <span className="grid place-items-center"><Zeichen name="haken" className="h-5 w-5 text-amber-300" /></span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] px-4 py-4 sm:px-6">
            <button type="button" onClick={() => oeffnen('registrieren')} className="knopf-prim sm:hidden">Create free account</button>
            <button type="button" onClick={() => oeffnen('konto')} className="knopf">Sign in</button>
            <a href={MARKE.discord} target="_blank" rel="noreferrer" className="knopf">Ask for VIP on Discord</a>
            <a href={`https://x.com/${MARKE.x}`} target="_blank" rel="noreferrer" className="knopf">Write on X</a>
            <span className="ml-auto text-xs text-white/40">The same account works on thecomphub.com.</span>
          </div>
        </Flaeche>
      </Abschnitt>
    </div>
  );
}
