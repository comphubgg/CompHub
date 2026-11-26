import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWer } from '../../teile/Anmeldung';
import { ARTEN, FREIE_ARTEN, darfArt, overlayAdresse, type OverlayEintrag } from './ov/OverlayGeruest';
import { Buehne, KopierFeld, ObsSchritte, obsGroesse, type OverlayGroesse } from './ov/Bausteine';
import { customParamUrl, STANDARD as CUSTOM_STANDARD } from './ov/custom/Baukasten';
import { GLOBALS_EVENT, GLOBALS_TAGE } from './ov/lib/globalsCup';
import HubLink from './ov/Link';
import { OV } from './ov/ort';
import { useZugang } from './ov/zugang';
import { Laedt, VIOLETT } from '../community/Teile';

/*
 * Die Overlay-Uebersicht (main: app/overlays/page.tsx, 11/2026) im Hub: je Overlay die echte Overlay-Datei von thecomphub.com mit
 * Beispielwerten auf einer 16:9-Buehne, in klaren Worten was es zeigt, wann man es nimmt, woher die Zahlen kommen und die OBS-Groesse - dazu
 * die eigenen gespeicherten Overlays dieser Art mit ihrer OBS-Adresse zum Kopieren, und der Weg in den Baukasten.
 * Kostenlos: Cup timer, Offspawn (und der versteckte eigene Text); alles mit Live-Cupdaten fuer VIPs (darfArt in ov/OverlayGeruest).
 * Darunter die Globals-2026-Overlays und - nur wer sie sehen darf - die privaten Partner-Kacheln (/api/partner-kacheln).
 */

const TAG1 = GLOBALS_TAGE[0].windowId;
const json = (o: unknown) => encodeURIComponent(JSON.stringify(o));

/** Beispiel-Einstellungen je Overlay - und der Ausschnitt, in dem es auf der Flaeche sitzt (die Groessenmeldung kommt nicht ueber die Domaingrenze). */
function vorschauVon(schluessel: string, duo: string, start: number): { src: string; b: number; h: number; aus: OverlayGroesse } | null {
  switch (schluessel) {
    case 'custom':
      return { src: `${OV}/overlay/custom.html?vorschau=${json({ ...CUSTOM_STANDARD, punkte1: 2, punkte2: 1 })}`, b: 1920, h: 1080, aus: { x: 360, y: 0, w: 1200, h: 675 } };
    case 'teamkarte':
      return { src: `${OV}/overlay/banner.html?event=${encodeURIComponent(GLOBALS_EVENT)}&window=${encodeURIComponent(TAG1)}&klar=70&hoehe=190${duo ? `&id=${encodeURIComponent(duo)}` : '&probe=1&spieler=2'}`, b: 1280, h: 720, aus: { x: 160, y: 0, w: 960, h: 540 } };
    case 'standings':
      return {
        src: `${OV}/overlay/standings.html?vorschau=${json({
          event: GLOBALS_EVENT, window: TAG1, fenster: [], titel: 'LEADERBOARD', kopfrechts: 'POINTS', thema: '', ecken: 10, marke: 0, von: 1, bis: 5, takt: 15,
          grund: '11 17 32', deckkraft: 0.85, akzent: '#a78bfa', schrift: 16, breite: 420, bilder: false, gold: 1, pausiert: 0, sichtbar: 15, seitenBis: 0, seitenTakt: 8,
        })}`, b: 960, h: 540, aus: { x: 0, y: 0, w: 480, h: 270 },
      };
    case 'timer':
      return {
        src: `${OV}/overlay/timer.html?vorschau=${json({ event: GLOBALS_EVENT, window: TAG1, beginn: start, cup: 'FNCS Global Championship', wort: 'STARTS IN', cupZeigen: true, grund: '0 0 0', deckkraft: 0.72, akzent: '#a78bfa', schrift: 34, abStunden: 12, anordnung: 'zwei', immer: true })}`,
        b: 960, h: 540, aus: { x: 0, y: 0, w: 400, h: 225 },
      };
    case 'qual':
      return {
        src: `${OV}/overlay/qual.html?vorschau=${json({ event: GLOBALS_EVENT, window: TAG1, schwelle: 50, wort: 'QUAL ~', takt: 15, grund: '0 0 0', deckkraft: 0.72, akzent: '#a78bfa', schrift: 18, pausiert: 0, sichtbar: 15, anordnung: 'zwei' })}`,
        b: 960, h: 540, aus: { x: 0, y: 0, w: 400, h: 225 },
      };
    case 'offspawn':
      return {
        src: `${OV}/overlay/offspawn.html?vorschau=${json({ kopf: 'OFFSPAWN', kopfZeigen: true, name1: 'TEAM 1', name2: 'TEAM 2', punkte1: 2, punkte2: 1, farbe1: '#ffffff', farbe2: '#ffffff', breite: 0, massstab: 1, bilder1: [], bilder2: [], bild1: '', bild2: '', grund: '0 0 0', deckkraft: 0.72, schrift: 30, thema: '', ecken: 12 })}`,
        b: 960, h: 540, aus: { x: 0, y: 0, w: 400, h: 225 },
      };
    default:
      return null;
  }
}

const REIHENFOLGE = ['timer', 'offspawn', 'custom', 'teamkarte', 'standings', 'qual'];

/** Private Partner-Kacheln: der Server schickt nur die, die diese Person sehen darf (app/api/partner-kacheln). */
interface PartnerKachel { id: string; titel: string; text: string; href: string; logo: string; farbe: string; knopf: string }
function PartnerKacheln() {
  const [kacheln, setKacheln] = useState<PartnerKachel[]>([]);
  useEffect(() => {
    let weg = false;
    fetch('/api/partner-kacheln', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!weg && Array.isArray(j?.kacheln)) setKacheln(j.kacheln as PartnerKachel[]); }).catch(() => {});
    return () => { weg = true; };
  }, []);
  return (
    <>
      {kacheln.map((k) => (
        <article key={k.id} id={k.id} className="overflow-hidden rounded-3xl border bg-white/[0.035] backdrop-blur-xl" style={{ borderColor: `${k.farbe}40` }}>
          <div className="h-2" style={{ background: `repeating-linear-gradient(-45deg,#111 0 10px,${k.farbe} 10px 20px)` }} />
          <div className="flex flex-wrap items-center justify-between gap-5 p-6">
            <div className="flex min-w-0 items-center gap-4">
              <img src={k.logo} alt="" className="h-12 w-auto shrink-0" />
              <div className="min-w-0">
                <h2 className="text-2xl font-black tracking-tight" style={{ color: k.farbe }}>{k.titel}</h2>
                <p className="text-sm text-white/55">{k.text}</p>
              </div>
            </div>
            <HubLink href={k.href} className="rounded-full px-5 py-2.5 text-sm font-bold text-black" style={{ background: k.farbe }}>{k.knopf} →</HubLink>
          </div>
        </article>
      ))}
    </>
  );
}

/** Die eigenen gespeicherten Overlays aller Arten - eine Anfrage fuer die ganze Seite. */
function useMeine(an: boolean) {
  const { wer } = useWer();
  const [liste, setListe] = useState<OverlayEintrag[] | null>(null);
  useEffect(() => {
    if (!an) { setListe([]); return; }
    fetch('/api/overlay-config?meine=1', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { overlays: [] }))
      .then((j) => setListe(j.overlays ?? [])).catch(() => setListe([]));
  }, [an, wer?.userName]);
  return liste;
}

function Gesperrt() {
  const { oeffnen } = useWer();
  return (
    <div className="absolute inset-3 grid place-items-center rounded-2xl bg-[#06080f]/45 sm:inset-4">
      <div className="text-center">
        <span className="rounded-full bg-violet-400 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-[#06080f]">VIP</span>
        <p className="mt-2 text-sm text-white/70">Live cup data on your stream</p>
        <button type="button" onClick={() => oeffnen('schluessel')} className="mt-3 rounded-full border border-violet-300/40 px-4 py-1.5 text-xs font-bold text-violet-100 transition hover:bg-violet-400/10">Unlock with an access key</button>
      </div>
    </div>
  );
}

export default function Overlays() {
  const zugang = useZugang();
  const [groessen, setGroessen] = useState<Record<string, OverlayGroesse>>({});
  const [start] = useState(() => Date.now() + 2 * 3_600_000 + 14 * 60_000);
  const meine = useMeine(zugang.nutzer);

  // Ein echtes Duo der Global Championship fuer das Team-Banner-Beispiel.
  const [duo, setDuo] = useState('');
  useEffect(() => {
    let weg = false;
    fetch(`/api/globals-teams?fenster=${encodeURIComponent(TAG1)}`).then((r) => r.json())
      .then((j) => { if (weg) return; const ids = ((j?.teams ?? [])[0]?.spieler ?? []).map((s: { turnierId: string }) => s.turnierId).filter(Boolean); if (ids.length) setDuo(ids.join(',')); })
      .catch(() => {});
    return () => { weg = true; };
  }, []);

  const arten = useMemo(() => REIHENFOLGE.map((k) => ARTEN.find((a) => a.schluessel === k)).filter((a): a is (typeof ARTEN)[number] => Boolean(a && !a.versteckt)), []);
  if (zugang.laedt) return <Laedt farbe={VIOLETT} text="Checking your access …" />;

  return (
    <div className="space-y-8">
      {/* ------------------------------------------------ Kopf */}
      <motion.header initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] px-6 py-8 backdrop-blur-xl sm:px-10">
        <span aria-hidden className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full bg-violet-500/25 blur-3xl" />
        <span aria-hidden className="pointer-events-none absolute -bottom-32 left-10 h-64 w-64 rounded-full bg-fuchsia-500/10 blur-3xl" />
        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:items-end">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-violet-300">Streamer · OBS browser source</p>
            <h1 className="mt-2 text-5xl font-extrabold tracking-tight text-white">Stream overlays</h1>
            <p className="mt-3 max-w-2xl text-white/55">Live cup numbers and scoreboards that sit on top of your gameplay. Pick one, set it up, copy the URL into OBS — done. The URL never changes: whatever you adjust later shows up on stream within seconds.</p>
            <nav className="mt-6 flex flex-wrap gap-1.5" aria-label="Overlays">
              {arten.map((a) => (
                <a key={a.schluessel} href={`#${a.schluessel}`} className="rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-xs font-semibold text-white/70 transition hover:border-violet-300/50 hover:text-white">
                  {a.titel}{!FREIE_ARTEN.includes(a.schluessel) && <span className="ml-1.5 text-[9px] font-black text-violet-300">VIP</span>}
                </a>
              ))}
              <a href="#globals" className="rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-xs font-semibold text-white/70 transition hover:border-violet-300/50 hover:text-white">Globals 2026</a>
            </nav>
          </div>
          <div className="min-w-0 rounded-2xl border border-white/10 bg-black/25 p-4">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-white/55">How to add an overlay in OBS</p>
            <ObsSchritte breite={1920} hoehe={1080} kompakt />
          </div>
        </div>
      </motion.header>

      {/* ------------------------------------------------ eine Reihe je Overlay */}
      <div className="space-y-6">
        {arten.map((a, i) => {
          const v = vorschauVon(a.schluessel, duo, start);
          const frei = darfArt(zugang, a.schluessel);
          const istCustom = a.schluessel === 'custom';
          const eigene = (meine ?? []).filter((o) => o.typ === a.schluessel);
          const g = groessen[a.schluessel] ?? null;
          return (
            <motion.article key={a.schluessel} id={a.schluessel} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.08 * i }}
              className={`scroll-mt-32 overflow-hidden rounded-3xl border bg-white/[0.035] backdrop-blur-xl ${FREIE_ARTEN.includes(a.schluessel) ? 'border-white/10' : 'border-violet-300/20'}`}>
              <div className="grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                <div className={`relative min-w-0 p-3 sm:p-4 ${i % 2 ? 'lg:order-2' : ''}`}>
                  {v && <Buehne src={v.src} breite={v.b} hoehe={v.h} szene titel={a.titel} ersatz={v.aus} maxMass={2}
                    onGroesse={(n) => setGroessen((alt) => (alt[a.schluessel]?.w === n.w && alt[a.schluessel]?.h === n.h && alt[a.schluessel]?.x === n.x ? alt : { ...alt, [a.schluessel]: n }))}
                    kopf={<><span className="font-mono uppercase tracking-[0.18em]">Live preview · sample values</span><span className="font-mono text-white/45">OBS {obsGroesse(g).b} × {obsGroesse(g).h}</span></>} />}
                  {!frei && <Gesperrt />}
                </div>
                <div className="flex min-w-0 flex-col p-6 sm:p-7">
                  <div className="flex items-center gap-2">
                    <h2 className="text-3xl font-extrabold tracking-tight text-white">{a.titel}</h2>
                    {FREIE_ARTEN.includes(a.schluessel)
                      ? <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/60">Free</span>
                      : <span className="rounded-full bg-violet-400 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#06080f]">VIP</span>}
                  </div>
                  <p className="text-sm font-medium text-violet-200/90">{a.kurz}</p>
                  <dl className="mt-4 space-y-3 text-sm leading-relaxed">
                    <div><dt className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">What it shows</dt><dd className="mt-0.5 text-white/70">{a.zeigt}</dd></div>
                    <div><dt className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">When to use it</dt><dd className="mt-0.5 text-white/70">{a.wann}</dd></div>
                    <div className="flex flex-wrap gap-x-6 gap-y-2">
                      <div><dt className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">Data</dt><dd className="mt-0.5 text-xs text-white/55">{a.quelle}</dd></div>
                      <div><dt className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">OBS size</dt><dd className="mt-0.5 font-mono text-xs text-white/70">{obsGroesse(g).b} × {obsGroesse(g).h}</dd></div>
                    </div>
                  </dl>
                  {frei && istCustom && (
                    <div className="mt-4">
                      <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">Try it right now</p>
                      <KopierFeld wert={customParamUrl(CUSTOM_STANDARD, OV)} knopf="Copy OBS URL" klein />
                    </div>
                  )}
                  {frei && eigene.length > 0 && (
                    <div className="mt-4 space-y-1.5">
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">Your {a.titel} overlays</p>
                      {eigene.slice(0, 3).map((o) => (
                        <div key={o.id} className="flex items-center gap-2">
                          <Link to={`${a.pfad}?id=${encodeURIComponent(o.id)}&bauen=1`} reloadDocument className="w-32 shrink-0 truncate text-xs font-semibold text-white/80 hover:text-violet-200">{o.name}</Link>
                          <div className="min-w-0 flex-1"><KopierFeld wert={overlayAdresse(o.typ, o.id)} klein /></div>
                        </div>
                      ))}
                      {eigene.length > 3 && <Link to={a.pfad} className="text-[11px] text-violet-300 hover:underline">+{eigene.length - 3} more</Link>}
                    </div>
                  )}
                  <div className="mt-auto flex flex-wrap gap-2 pt-5">
                    {frei ? (
                      <>
                        <Link to={a.ohneCup ? a.pfad : `${a.pfad}?neu=1`} className="rounded-full bg-violet-400 px-5 py-2.5 text-sm font-bold text-[#06080f] transition hover:-translate-y-0.5 hover:bg-violet-300">{istCustom ? 'Open configurator' : 'Create overlay'} →</Link>
                        {!istCustom && <Link to={a.pfad} className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-white/75 transition hover:border-violet-300/50 hover:text-white">My overlays</Link>}
                        {istCustom && <Link to="/streamer/overlays/custom/control" className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-white/75 transition hover:border-violet-300/50 hover:text-white">Control panel</Link>}
                      </>
                    ) : <span className="text-sm text-white/45">Part of VIP – enter your access key to set it up.</span>}
                  </div>
                </div>
              </div>
            </motion.article>
          );
        })}
      </div>

      {/* ------------------------------------------------ Globals 2026 */}
      <Link to="/streamer/overlays/globals" id="globals" className="group block scroll-mt-32">
        <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} whileHover={{ y: -4 }}
          className="relative grid overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] backdrop-blur-xl lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
          <div className="relative z-10 p-7 sm:p-9">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-300">FNCS · Global Championship</p>
            <h2 className="mt-1 text-4xl font-extrabold tracking-tight text-white">Globals <span className="text-sky-400">2026</span> overlays</h2>
            <p className="mt-2 max-w-xl text-white/55">Leaderboard, player banner and a free overlay in the look of the Global Championship – the cup is fixed, you only pick the day.</p>
            <span className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-5 py-2.5 text-sm font-bold text-white transition group-hover:bg-white/15">{zugang.vip ? 'Open Globals overlays →' : '🔒 VIP – Open Globals overlays'}</span>
          </div>
          <div className="relative aspect-video lg:aspect-auto">
            <img src="/cups/fncs-global-championship-2026-hd.jpg" alt="FNCS Global Championship 2026" className="absolute inset-0 h-full w-full object-cover opacity-80 transition duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0b0d16] via-[#0b0d16]/30 to-transparent" />
          </div>
        </motion.section>
      </Link>

      <PartnerKacheln />

      <section className="grid gap-5 rounded-3xl border border-white/10 bg-white/[0.035] p-6 backdrop-blur-xl sm:grid-cols-3 sm:p-7">
        <div><h3 className="text-sm font-bold text-white">Crisp at 1080p</h3><p className="mt-1 text-xs leading-relaxed text-white/55">Add every overlay as a 1920 × 1080 source and never stretch it — make it bigger with its own size setting instead. Blurry text almost always means the source was scaled in the scene.</p></div>
        <div><h3 className="text-sm font-bold text-white">Transparent by default</h3><p className="mt-1 text-xs leading-relaxed text-white/55">Everything outside the overlay is see-through. Leave the custom CSS field in OBS empty.</p></div>
        <div><h3 className="text-sm font-bold text-white">Saved overlays</h3><p className="mt-1 text-xs leading-relaxed text-white/55">All overlays you created are in your archive. <Link to="/streamer/vip#archiv" className="text-violet-300 underline-offset-2 hover:underline">VIP → My archive</Link></p></div>
      </section>
    </div>
  );
}
