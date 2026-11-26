import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useWer } from '../../teile/Anmeldung';
import { Ueberschrift, VIOLETT } from '../community/Teile';
import { SEITE, istVip } from './zugang';

/*
 * Die Overlays der Seite (main: app/overlays, OverlayGeruest ARTEN) - je Overlay die echte Overlay-Datei als Vorschau (/overlay/*.html?vorschau=...
 * auf thecomphub.com, wie die Overlay-Seite auf main) und der Weg in den Baukasten auf thecomphub.com. Einfache Overlays fuer jedes Konto,
 * die mit Live-Cupdaten fuer VIPs.
 */

const GLOBALS_EVENT = 'epicgames_MannekenPis_Official';
const TAG1 = 'MannekenPis_Day1';
const json = (o: unknown) => encodeURIComponent(JSON.stringify(o));

interface Art { schluessel: string; titel: string; kurz: string; zeigt: string; vip: boolean; vorschau?: (start: number) => Vorschau }
/** aus: der sichtbare Ausschnitt in Overlay-Pixeln (die Overlays sitzen klein oben links in ihrer Flaeche - so fuellen sie die Karte). */
interface Vorschau { src: string; b: number; h: number; aus?: { x: number; y: number; b: number } }
export const OVERLAYS: Art[] = [
  {
    schluessel: 'timer', titel: 'Cup timer', kurz: 'Countdown to the cup', vip: false,
    zeigt: 'A countdown to the start of a cup day with the cup name. It hides itself the moment the cup starts.',
    vorschau: (start) => ({ src: `${SEITE}/overlay/timer.html?vorschau=${json({ event: GLOBALS_EVENT, window: TAG1, beginn: start, cup: 'FNCS Global Championship', wort: 'STARTS IN', cupZeigen: true, grund: '0 0 0', deckkraft: 0.72, akzent: '#a78bfa', schrift: 34, abStunden: 12, anordnung: 'zwei', immer: true })}`, b: 960, h: 540, aus: { x: 0, y: 0, b: 300 } }),
  },
  {
    schluessel: 'offspawn', titel: 'Offspawn', kurz: '1v1 · 2v2 score', vip: false,
    zeigt: 'Two sides with a score you count by hand – a compact box for offspawn fights, 1v1s and 2v2s.',
    vorschau: () => ({ src: `${SEITE}/overlay/offspawn.html?vorschau=${json({ kopf: 'OFFSPAWN', kopfZeigen: true, name1: 'TEAM 1', name2: 'TEAM 2', punkte1: 2, punkte2: 1, farbe1: '#ffffff', farbe2: '#ffffff', breite: 0, massstab: 1, bilder1: [], bilder2: [], bild1: '', bild2: '', grund: '0 0 0', deckkraft: 0.72, schrift: 30, thema: '', ecken: 12 })}`, b: 960, h: 540, aus: { x: 0, y: 0, b: 300 } }),
  },
  {
    schluessel: 'text', titel: 'Custom text', kurz: 'One free line', vip: false,
    zeigt: 'One line of your own text, with or without a bar – for a sub goal, a giveaway or the next cup.',
  },
  {
    schluessel: 'teamkarte', titel: 'Team Banner', kurz: 'Your team, live stats', vip: true,
    zeigt: 'You, your duo or trio with photos and the live numbers of the cup day: place, points, games, eliminations.',
    vorschau: () => ({ src: `${SEITE}/overlay/banner.html?event=${encodeURIComponent(GLOBALS_EVENT)}&window=${encodeURIComponent(TAG1)}&klar=70&hoehe=190&probe=1&spieler=2`, b: 1280, h: 720, aus: { x: 200, y: 0, b: 560 } }),
  },
  {
    schluessel: 'standings', titel: 'Leaderboard', kurz: 'Top places, live', vip: true,
    zeigt: 'The top places of a running cup day with points, optional photos and pages that flip through more places.',
    vorschau: () => ({ src: `${SEITE}/overlay/standings.html?vorschau=${json({ event: GLOBALS_EVENT, window: TAG1, fenster: [], titel: 'LEADERBOARD', kopfrechts: 'POINTS', thema: '', ecken: 10, marke: 0, von: 1, bis: 5, takt: 15, grund: '11 17 32', deckkraft: 0.85, akzent: '#a78bfa', schrift: 16, breite: 420, bilder: false, gold: 1, pausiert: 0, sichtbar: 15, seitenBis: 0, seitenTakt: 8 })}`, b: 960, h: 540, aus: { x: 0, y: 0, b: 380 } }),
  },
  {
    schluessel: 'qual', titel: 'Qual line', kurz: 'Points needed to qualify', vip: true,
    zeigt: 'How many points it takes to qualify: an estimate from earlier editions of the same cup, next to the live points at the qualifying place.',
  },
  {
    schluessel: 'custom', titel: 'Custom scoreboard', kurz: 'Tokens / showmatches', vip: true,
    zeigt: 'A broadcast scoreboard: both teams with their players, a big score, the event title and a LIVE tag. Colours, fonts, flags and logos are yours.',
  },
];

/** Die echte Overlay-Datei, auf die Breite der Karte verkleinert (das Overlay rechnet in seiner eigenen Groesse). */
function Buehne({ src, b, h, aus = { x: 0, y: 0, b } }: Vorschau) {
  const ref = useRef<HTMLDivElement>(null);
  const [breite, setBreite] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const ro = new ResizeObserver(() => setBreite(el.clientWidth)); ro.observe(el); return () => ro.disconnect();
  }, []);
  const m = breite / aus.b;
  return (
    <div ref={ref} className="relative aspect-video w-full overflow-hidden">
      {breite > 0 && <iframe src={src} title="Overlay preview" loading="lazy" className="pointer-events-none absolute left-0 top-0 origin-top-left border-0" style={{ width: b, height: h, transform: `translate(${-aus.x * m}px, ${-aus.y * m}px) scale(${m})`, background: 'transparent' }} />}
    </div>
  );
}

export function OverlayKarte({ a, frei, i }: { a: Art; frei: boolean; i: number }) {
  const { oeffnen } = useWer();
  const [start] = useState(() => Date.now() + 2 * 3_600_000 + 14 * 60_000);
  const v = a.vorschau?.(start);
  return (
    <motion.article initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }} whileHover={frei ? { y: -4 } : undefined}
      className={`overflow-hidden rounded-3xl border bg-white/[0.035] backdrop-blur-xl ${a.vip ? 'border-violet-300/20' : 'border-white/10'}`}>
      {/* Buehne: Schachbrett wie in OBS, damit man sieht, was durchsichtig ist */}
      <div className="relative bg-[#0b0d16] bg-[linear-gradient(45deg,rgba(255,255,255,0.03)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.03)_75%),linear-gradient(45deg,rgba(255,255,255,0.03)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.03)_75%)] bg-[length:24px_24px] bg-[position:0_0,12px_12px]">
        {v ? <Buehne {...v} /> : (
          <div className="grid aspect-video place-items-center">
            <span className="text-3xl font-black uppercase tracking-tight text-white/15">{a.titel}</span>
          </div>
        )}
        {!frei && (
          <div className="absolute inset-0 grid place-items-center bg-[#06080f]/70 backdrop-blur-[3px]">
            <div className="text-center">
              <span className="rounded-full bg-violet-400 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-[#06080f]">VIP</span>
              <p className="mt-2 text-sm text-white/70">Live cup data on your stream</p>
            </div>
          </div>
        )}
      </div>
      <div className="p-5">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-white">{a.titel}</h3>
          {a.vip && <span className="rounded-full border border-violet-300/40 px-2 py-px text-[9px] font-bold uppercase tracking-wider text-violet-200">VIP</span>}
        </div>
        <p className="text-xs text-white/40">{a.kurz}</p>
        <p className="mt-1.5 text-sm text-white/55">{a.zeigt}</p>
        {frei
          ? <a href={`${SEITE}/overlays/${a.schluessel}`} target="_blank" rel="noreferrer" className="mt-4 inline-flex rounded-full bg-violet-400 px-4 py-2 text-sm font-bold text-[#06080f] transition hover:bg-violet-300">Set it up →</a>
          : <button type="button" onClick={() => oeffnen('schluessel')} className="mt-4 inline-flex rounded-full border border-violet-300/40 px-4 py-2 text-sm font-bold text-violet-100 transition hover:bg-violet-400/10">Unlock with an access key</button>}
      </div>
    </motion.article>
  );
}

export default function Overlays() {
  const { wer } = useWer();
  const vip = istVip(wer);
  const basis = OVERLAYS.filter((a) => !a.vip);
  const mehr = OVERLAYS.filter((a) => a.vip);
  return (
    <div className="space-y-8">
      <Ueberschrift ueber="Streamer · Overlays" titel="Overlays for OBS" farbe={VIOLETT}
        text="Real previews of the overlays – every one is a browser source you paste into OBS. Set them up on thecomphub.com, the link stays the same forever." />
      <section className="space-y-4">
        <h2 className="text-2xl font-extrabold tracking-tight text-white">Basic <span className="ml-1 text-sm font-semibold text-white/40">every account</span></h2>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{basis.map((a, i) => <OverlayKarte key={a.schluessel} a={a} frei i={i} />)}</div>
      </section>
      <section className="space-y-4">
        <h2 className="text-2xl font-extrabold tracking-tight text-white">Live cup overlays <span className="ml-1 rounded-full bg-violet-400 px-2 py-0.5 align-middle text-[10px] font-black uppercase tracking-wider text-[#06080f]">VIP</span></h2>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">{mehr.map((a, i) => <OverlayKarte key={a.schluessel} a={a} frei={vip} i={i} />)}</div>
      </section>
    </div>
  );
}
