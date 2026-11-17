'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import LadeSchirm from '@/app/components/LadeSchirm';
import { useZugang } from '@/app/lib/zugang';
import VipVorhang from './VipVorhang';
import { ARTEN } from './OverlayGeruest';
import { Buehne, KopierFeld, ObsSchritte, obsGroesse, type OverlayGroesse } from './Bausteine';
import { customParamUrl, STANDARD as CUSTOM_STANDARD } from './custom/Baukasten';
import { GLOBALS_EVENT, GLOBALS_TAGE } from '@/lib/globalsCup';

/*
 * Private partner tabs (e.g. a demo for a potential partner): the server
 * sends only the ones this person may see - nothing about them is in this
 * page's code. See app/api/partner-kacheln.
 */
interface PartnerKachel { id: string; titel: string; text: string; href: string; logo: string; farbe: string; knopf: string }
function PartnerKacheln() {
  const [kacheln, setKacheln] = useState<PartnerKachel[]>([]);
  useEffect(() => {
    let weg = false;
    fetch('/api/partner-kacheln', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!weg && Array.isArray(j?.kacheln)) setKacheln(j.kacheln as PartnerKachel[]); })
      .catch(() => { /* none */ });
    return () => { weg = true; };
  }, []);
  return (
    <>
      {kacheln.map((k) => (
        <article key={k.id} id={k.id} className="mt-6 overflow-hidden rounded-3xl border bg-[#0d0d10]" style={{ borderColor: `${k.farbe}40` }}>
          <div className="h-2" style={{ background: `repeating-linear-gradient(-45deg,#111 0 10px,${k.farbe} 10px 20px)` }} />
          <div className="flex flex-wrap items-center justify-between gap-5 p-5 sm:p-7">
            <div className="flex min-w-0 items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={k.logo} alt="" className="h-12 w-auto shrink-0" />
              <div className="min-w-0">
                <h2 className="text-2xl font-black tracking-tight" style={{ color: k.farbe }}>{k.titel}</h2>
                <p className="text-sm text-slate-400"><T>{k.text}</T></p>
              </div>
            </div>
            <Link href={k.href} prefetch={false} className="rounded-lg px-5 py-2.5 text-sm font-bold text-black" style={{ background: k.farbe }}>
              <T>{k.knopf}</T> →
            </Link>
          </div>
        </article>
      ))}
    </>
  );
}

/*
 * The overlay overview - redesigned 11/2026.
 *
 * The operator: "die komplette Overlay-Seite neu und cleaner und besser
 * erklaert". Every overlay gets one calm row: the real overlay on a 16:9
 * stage (sample values), then in plain words what it shows, when to use it,
 * where the numbers come from and the OBS size - and one button into its
 * configurator, where every option, the URL to copy and the OBS steps are.
 *
 * The previews are the real overlay files fed with sample settings - not a
 * picture that drifts away from the real thing.
 */

const TAG1 = GLOBALS_TAGE[0].windowId;
const json = (o: unknown) => encodeURIComponent(JSON.stringify(o));

/** Sample settings per overlay. */
function vorschauVon(schluessel: string, duo: string, start: number): { src: string; b: number; h: number } | null {
  switch (schluessel) {
    case 'custom':
      return { src: `/overlay/custom.html?vorschau=${json({ ...CUSTOM_STANDARD, punkte1: 2, punkte2: 1 })}`, b: 1920, h: 1080 };
    case 'teamkarte':
      return {
        src: `/overlay/banner.html?event=${encodeURIComponent(GLOBALS_EVENT)}&window=${encodeURIComponent(TAG1)}&klar=70&hoehe=190${duo ? `&id=${encodeURIComponent(duo)}` : '&probe=1&spieler=2'}`,
        b: 1280, h: 720,
      };
    case 'standings':
      return {
        src: `/overlay/standings.html?vorschau=${json({
          event: GLOBALS_EVENT, window: TAG1, fenster: [], titel: 'LEADERBOARD', kopfrechts: 'POINTS',
          thema: '', ecken: 10, marke: 0, von: 1, bis: 5, takt: 15, grund: '11 17 32', deckkraft: 0.85,
          akzent: '#38bdf8', schrift: 16, breite: 420, bilder: false, gold: 1, pausiert: 0, sichtbar: 15, seitenBis: 0, seitenTakt: 8,
        })}`,
        b: 960, h: 540,
      };
    case 'timer':
      return {
        src: `/overlay/timer.html?vorschau=${json({
          event: GLOBALS_EVENT, window: TAG1, beginn: start, cup: 'FNCS Global Championship',
          wort: 'STARTS IN', cupZeigen: true, grund: '0 0 0', deckkraft: 0.72, akzent: '#38bdf8', schrift: 34, abStunden: 12, anordnung: 'zwei', immer: true,
        })}`,
        b: 960, h: 540,
      };
    case 'qual':
      return {
        src: `/overlay/qual.html?vorschau=${json({
          event: GLOBALS_EVENT, window: TAG1, schwelle: 50, wort: 'QUAL ~', takt: 15,
          grund: '0 0 0', deckkraft: 0.72, akzent: '#38bdf8', schrift: 18, pausiert: 0, sichtbar: 15, anordnung: 'zwei',
        })}`,
        b: 960, h: 540,
      };
    case 'offspawn':
      return {
        src: `/overlay/offspawn.html?vorschau=${json({
          kopf: 'OFFSPAWN', kopfZeigen: true, name1: 'TEAM 1', name2: 'TEAM 2', punkte1: 2, punkte2: 1,
          farbe1: '#ffffff', farbe2: '#ffffff', breite: 0, massstab: 1, bilder1: [], bilder2: [], bild1: '', bild2: '',
          grund: '0 0 0', deckkraft: 0.72, schrift: 30, thema: '', ecken: 12,
        })}`,
        b: 960, h: 540,
      };
    default:
      return null;
  }
}

const REIHENFOLGE = ['custom', 'teamkarte', 'standings', 'timer', 'qual', 'offspawn'];

export default function OverlaysSeite() {
  const zugang = useZugang();
  const [basis, setBasis] = useState('');
  // The real size each preview reports (look.js) - for an honest OBS size.
  const [groessen, setGroessen] = useState<Record<string, OverlayGroesse>>({});
  // A sample start a little over two hours from now - fixed once, so the preview does not reload.
  const [start] = useState(() => Date.now() + 2 * 3_600_000 + 14 * 60_000);
  useEffect(() => { setBasis(window.location.origin); }, []);

  // A real duo of the Global Championship for the Team Banner sample.
  const [duo, setDuo] = useState('');
  useEffect(() => {
    let weg = false;
    fetch(`/api/globals-teams?fenster=${encodeURIComponent(TAG1)}`)
      .then((r) => r.json())
      .then((j) => {
        if (weg) return;
        const ids = ((j?.teams ?? [])[0]?.spieler ?? []).map((s: { turnierId: string }) => s.turnierId).filter(Boolean);
        if (ids.length) setDuo(ids.join(','));
      })
      .catch(() => { /* sample without a duo */ });
    return () => { weg = true; };
  }, []);

  const arten = useMemo(() => REIHENFOLGE
    .map((k) => ARTEN.find((a) => a.schluessel === k))
    .filter((a): a is (typeof ARTEN)[number] => Boolean(a && !a.versteckt)), []);

  if (zugang.laedt) return <LadeSchirm />;
  if (!zugang.vip) return <VipVorhang />;

  return (
    <main className="flex-1 bg-[#07090d] px-4 pb-16 pt-6 text-slate-200 sm:pt-8">
      <div className="mx-auto max-w-[1240px]">

        {/* ------------------------------------------------ head */}
        <header className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-[#0c1018] px-5 py-7 sm:px-10 sm:py-10">
          <span aria-hidden className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full bg-sky-500/20 blur-3xl" />
          <span aria-hidden className="pointer-events-none absolute -bottom-32 left-10 h-64 w-64 rounded-full bg-indigo-500/15 blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,480px)] lg:items-end">
            <div className="min-w-0">
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-sky-400"><T>For your stream · OBS browser source</T></p>
              <h1 className="mt-2 text-4xl font-black tracking-tight text-white sm:text-5xl"><T>Stream overlays</T></h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-400">
                <T>Live cup numbers and scoreboards that sit on top of your gameplay. Pick one, set it up, copy the URL into OBS — done. The URL never changes: whatever you adjust later shows up on stream within seconds.</T>
              </p>
              <nav className="mt-6 flex flex-wrap gap-1.5" aria-label="Overlays">
                {arten.map((a) => (
                  <a key={a.schluessel} href={`#${a.schluessel}`}
                    className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3.5 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-sky-400/50 hover:text-white">
                    <T>{a.titel}</T>
                  </a>
                ))}
              </nav>
            </div>
            <div className="min-w-0 rounded-2xl border border-white/[0.07] bg-black/30 p-4">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400"><T>How to add an overlay in OBS</T></p>
              <ObsSchritte breite={1920} hoehe={1080} kompakt />
            </div>
          </div>
        </header>

        {/* ------------------------------------------------ one row per overlay */}
        <div className="mt-8 space-y-6">
          {arten.map((a, i) => {
            const v = vorschauVon(a.schluessel, duo, start);
            const istCustom = a.schluessel === 'custom';
            return (
              <article key={a.schluessel} id={a.schluessel}
                className="scroll-mt-24 overflow-hidden rounded-3xl border border-white/[0.07] bg-[#0c1018]">
                <div className="grid lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
                  <div className={`min-w-0 p-3 sm:p-4 ${i % 2 ? 'lg:order-2' : ''}`}>
                    {v && <Buehne src={v.src} breite={v.b} hoehe={v.h} szene titel={a.titel}
                      onGroesse={(g) => setGroessen((alt) => (alt[a.schluessel]?.w === g.w && alt[a.schluessel]?.h === g.h && alt[a.schluessel]?.x === g.x ? alt : { ...alt, [a.schluessel]: g }))}
                      kopf={<>
                        <span className="font-mono uppercase tracking-[0.18em]"><T>Sample values</T></span>
                        <span className="font-mono text-slate-500">OBS {obsGroesse(groessen[a.schluessel] ?? null).b} × {obsGroesse(groessen[a.schluessel] ?? null).h}</span>
                      </>} />}
                  </div>
                  <div className="flex min-w-0 flex-col p-5 sm:p-7">
                    <div className="flex items-center gap-2">
                      <h2 className="text-2xl font-black tracking-tight text-white"><T>{a.titel}</T></h2>
                      {istCustom && <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-300"><T>New</T></span>}
                    </div>
                    <p className="text-sm font-medium text-sky-300/90"><T>{a.kurz}</T></p>
                    <dl className="mt-4 space-y-3 text-sm leading-relaxed">
                      <div>
                        <dt className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500"><T>What it shows</T></dt>
                        <dd className="mt-0.5 text-slate-300"><T>{a.zeigt}</T></dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500"><T>When to use it</T></dt>
                        <dd className="mt-0.5 text-slate-300"><T>{a.wann}</T></dd>
                      </div>
                      <div className="flex flex-wrap gap-x-6 gap-y-2">
                        <div>
                          <dt className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500"><T>Data</T></dt>
                          <dd className="mt-0.5 text-xs text-slate-400"><T>{a.quelle}</T></dd>
                        </div>
                        <div>
                          <dt className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500"><T>OBS size</T></dt>
                          <dd className="mt-0.5 font-mono text-xs text-slate-300">{obsGroesse(groessen[a.schluessel] ?? null).b} × {obsGroesse(groessen[a.schluessel] ?? null).h}</dd>
                        </div>
                      </div>
                    </dl>
                    {istCustom && basis && (
                      <div className="mt-4">
                        <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500"><T>Try it right now</T></p>
                        <KopierFeld wert={customParamUrl(CUSTOM_STANDARD, basis)} knopf="Copy OBS URL" klein />
                      </div>
                    )}
                    <div className="mt-auto flex flex-wrap gap-2 pt-5">
                      <Link href={a.ohneCup ? a.pfad : `${a.pfad}?neu=1`}
                        className="rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-sky-400">
                        <T>{istCustom ? 'Open configurator' : 'Create overlay'}</T> →
                      </Link>
                      {!istCustom && (
                        <Link href={a.pfad}
                          className="rounded-lg border border-white/[0.1] px-5 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-sky-400/50 hover:text-white">
                          <T>My overlays</T>
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <PartnerKacheln />

        <section className="mt-8 grid gap-5 rounded-3xl border border-white/[0.07] bg-[#0c1018] p-5 sm:grid-cols-3 sm:p-7">
          <div>
            <h3 className="text-sm font-bold text-white"><T>Crisp at 1080p</T></h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-400"><T>Add every overlay as a 1920 × 1080 source and never stretch it — make it bigger with its own size setting instead. Blurry text almost always means the source was scaled in the scene.</T></p>
          </div>
          <div>
            <h3 className="text-sm font-bold text-white"><T>Transparent by default</T></h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-400"><T>Everything outside the overlay is see-through. Leave the custom CSS field in OBS empty.</T></p>
          </div>
          <div>
            <h3 className="text-sm font-bold text-white"><T>Saved overlays</T></h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              <T>All overlays you created are in your dashboard.</T>{' '}
              <Link href="/admin#archiv" className="text-sky-300 underline-offset-2 hover:underline"><T>Dashboard → My archive</T></Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
