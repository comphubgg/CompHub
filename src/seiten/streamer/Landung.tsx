import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Abschnitt, Flaeche, Kennzahl, Leer } from '../../ds/Bausteine';
import { useWer } from '../../teile/Anmeldung';
import { ARTEN, FREIE_ARTEN } from './ov/OverlayGeruest';
import { MARKE, vorOrt } from './ov/ort';
import { REIHENFOLGE, probeVon, useProbeDaten, type Probe } from './ov/proben';
import { Kanalbild, LiveMarke, ProbeBuehne, StreamKarte, StufenMarke, Zeichen, Zuschauer } from './Teile';
import { GRUPPEN, useLive, vorschaubild, type Kanal } from './live';

/*
 * Die Landung des Streamer-Bereichs - fuer alle, die nicht angemeldet sind (Betreiber: "kein blosses Tor"). Sie zeigt, was drin ist:
 *   1. Buehne: links der Einstieg (Create account / Sign in / VIP-Schluessel), rechts ein Sendebild - das Vorschaubild des groessten laufenden
 *      Streams, darauf drei echte Overlays an ihrem Platz (Leaderboard, Custom-Scoreboard, Cup timer). So sieht ein Stream mit CompHub aus.
 *   2. Wer gerade live ist: Vorschaubilder mit Zuschauern (/api/streamers + /api/live-status)
 *   3. Die Overlays: jede Art als laufende Vorschau, kostenlos oder VIP
 *   4. Kostenlos gegen VIP - was jedes Konto bekommt und was der Zugangsschluessel dazu freischaltet
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

const FREI: Array<{ z: string; titel: string; text: string }> = [
  { z: 'wand', titel: 'Live Streams & multiview', text: 'Every pro and creator who is live – watch several at once on your own wall.' },
  { z: 'uhr', titel: 'Cup timer overlay', text: 'A countdown to any cup day for your starting-soon screen.' },
  { z: 'overlay', titel: 'Offspawn score overlay', text: 'Two sides, photos and a score you count by hand.' },
  { z: 'seite', titel: 'Your channel on CompHub', text: 'See how your stream shows up for CompHub viewers.' },
];
const VIP: Array<{ z: string; titel: string; text: string }> = [
  { z: 'pokal', titel: 'Live cup overlays', text: 'Team banner, leaderboard, qual line and the custom scoreboard – fed by the live leaderboard.' },
  { z: 'overlay', titel: 'Globals 2026 overlays', text: 'The same overlays in the look of the Global Championship.' },
  { z: 'bot', titel: 'Twitch bot', text: 'Your own chat commands and rules, around the clock.' },
  { z: 'kurve', titel: 'Twitch statistics', text: 'Peak with and without raids, average, followers, chatters.' },
  { z: 'finder', titel: 'Match-ID finder', text: 'The running match ID of the pros you follow.' },
  { z: 'replay', titel: 'Replays & Pro POVs', text: 'Every cup game in 2D and 3D, and private POVs of pros.' },
];

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

  return (
    <div className="space-y-10">
      {/* ------------------------------------------------ Buehne */}
      <section className="fl-fest relative isolate overflow-hidden">
        <div className="pointer-events-none absolute -left-40 -top-40 -z-10 h-[520px] w-[520px] rounded-full bg-akz/20 blur-[120px]" aria-hidden />
        <div className="grid items-center gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10 lg:p-10">
          <motion.div initial={{ opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }} className="min-w-0">
            <p className="ueber">Streamer area · free for every streamer</p>
            <h1 className="titel mt-2 text-6xl sm:text-7xl 2xl:text-8xl">Your stream.<br /><span className="text-akz">Live cup data.</span></h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/60">
              Overlays that update themselves, a multiview of every pro who is live, a Twitch bot and your stream statistics. A free account gets you the tools for small streamers – a VIP key unlocks everything with live cup data.
            </p>
            {wunsch && <p className="mt-4 inline-flex items-center gap-2 rounded-xl bg-akz/10 px-3 py-2 text-sm text-white/80 ring-1 ring-akz/30"><Zeichen name="schloss" className="h-4 w-4 text-akz" />Sign in to open <b className="text-white">{wunsch}</b>.</p>}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => oeffnen('registrieren')} className="knopf-prim !px-6 !py-3 !text-[15px]">Create free account</button>
              <button type="button" onClick={() => oeffnen('konto')} className="knopf !px-6 !py-3 !text-[15px]">Sign in</button>
              <button type="button" onClick={() => oeffnen('schluessel')} className="inline-flex items-center gap-2 px-2 py-3 text-sm font-semibold text-amber-200 transition hover:text-amber-100"><Zeichen name="schluessel" className="h-4 w-4" />I have a VIP access key</button>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-10 gap-y-4 border-t border-white/[0.07] pt-6">
              <Kennzahl label="Live right now" wert={liste ? live.length : null} ton="rot" />
              <Kennzahl label="Watching" wert={liste ? zuschauer : null} />
              <Kennzahl label="Channels tracked" wert={liste ? liste.length : null} />
              <Kennzahl label="Overlays" wert={arten.length} unter="2 free · 4 VIP" />
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 22, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.12, duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="min-w-0">
            <Sendebild k={vorn} takt={takt} proben={aufSendung} />
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-white/45">
              {vorn && <span className="inline-flex items-center gap-2 text-sm font-bold text-white"><Kanalbild src={vorn.bild} className="h-7 w-7 rounded-lg ring-1 ring-white/15" />{vorn.anzeige || vorn.login}<span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">{GRUPPEN[vorn.gruppe] ?? vorn.gruppe}</span></span>}
              <span className="min-w-0 flex-1">{vorn ? 'is live right now – with' : 'On stream:'} three real CompHub overlays on top: leaderboard, scoreboard and cup timer.</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ------------------------------------------------ wer live ist */}
      <Abschnitt ueber="On air" titel={<>Live right now {liste && <span className="ml-1 text-red-400">{live.length}</span>}</>}
        rechts={<button type="button" onClick={() => oeffnen('registrieren')} className="knopf-leer">Watch them side by side <span aria-hidden>→</span></button>}>
        {!liste ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="fl-fest aspect-[16/12] animate-pulse" />)}</div>
          : live.length ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {live.slice(vorn ? 1 : 0, 9).map((k, i) => (
                <motion.div key={k.login} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: Math.min(i, 8) * 0.04, duration: 0.45 }}>
                  <StreamKarte k={k} takt={takt} />
                </motion.div>
              ))}
            </div>
          ) : <Leer text="Nobody on CompHub's list is live right now – the list refreshes every minute." />}
      </Abschnitt>

      {/* ------------------------------------------------ Overlays */}
      <Abschnitt ueber="OBS browser source" titel="Overlays that update themselves"
        rechts={<span className="hidden text-xs text-white/45 md:block">Pick one · adjust it · copy the URL into OBS</span>}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {arten.map((a, i) => {
            const vip = !FREIE_ARTEN.includes(a.schluessel);
            return (
              <Flaeche key={a.schluessel} fest verz={i * 0.05} className="overflow-hidden">
                <ProbeBuehne probe={probeVon(a.schluessel, daten, start)} titel={a.titel} />
                <div className="flex items-start justify-between gap-3 px-5 pb-5 pt-4">
                  <div className="min-w-0">
                    <h3 className="titel text-2xl">{a.titel}</h3>
                    <p className="mt-1 text-sm leading-snug text-white/55">{a.zeigt}</p>
                  </div>
                  <StufenMarke vip={vip} />
                </div>
              </Flaeche>
            );
          })}
        </div>
      </Abschnitt>

      {/* ------------------------------------------------ kostenlos gegen VIP */}
      <Abschnitt ueber="Access" titel="Free account or VIP">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          <Flaeche fest className="flex flex-col p-6 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <div><p className="ueber">For small streamers</p><h3 className="titel mt-1 text-4xl">Free account</h3></div>
              <StufenMarke vip={false} />
            </div>
            <ul className="mt-5 space-y-4">
              {FREI.map((x) => (
                <li key={x.titel} className="flex gap-3.5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-akz/10 text-akz ring-1 ring-akz/25"><Zeichen name={x.z} /></span>
                  <div><p className="font-semibold text-white">{x.titel}</p><p className="text-sm text-white/50">{x.text}</p></div>
                </li>
              ))}
            </ul>
            <div className="mt-auto flex flex-wrap gap-2 pt-7">
              <button type="button" onClick={() => oeffnen('registrieren')} className="knopf-prim">Create free account</button>
              <button type="button" onClick={() => oeffnen('konto')} className="knopf">Sign in</button>
            </div>
            <p className="mt-3 text-xs text-white/40">The same account works on thecomphub.com.</p>
          </Flaeche>

          <Flaeche fest verz={0.08} className="relative flex flex-col overflow-hidden p-6 sm:p-7 !border-amber-300/20">
            <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-amber-400/10 blur-3xl" aria-hidden />
            <div className="relative flex items-center justify-between gap-3">
              <div><p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-amber-300">Everything in Free, plus</p><h3 className="titel mt-1 text-4xl">VIP</h3></div>
              <StufenMarke vip />
            </div>
            <ul className="relative mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {VIP.map((x) => (
                <li key={x.titel} className="flex gap-3.5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-400/10 text-amber-200 ring-1 ring-amber-300/25"><Zeichen name={x.z} /></span>
                  <div><p className="font-semibold text-white">{x.titel}</p><p className="text-sm text-white/50">{x.text}</p></div>
                </li>
              ))}
            </ul>
            <div className="relative mt-auto flex flex-wrap items-center gap-2 pt-7">
              <button type="button" onClick={() => oeffnen('schluessel')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-bold text-black transition hover:brightness-110"><Zeichen name="schluessel" className="h-4 w-4" />Enter VIP access key</button>
              <a href={MARKE.discord} target="_blank" rel="noreferrer" className="knopf">Ask for VIP on Discord</a>
              <a href={`https://x.com/${MARKE.x}`} target="_blank" rel="noreferrer" className="knopf">Write on X</a>
            </div>
            <p className="relative mt-3 text-xs text-white/40">Streamers and pros get their key from CompHub. Overlays and Globals come with every VIP, the other tools are switched on per streamer.</p>
          </Flaeche>
        </div>
      </Abschnitt>
    </div>
  );
}
