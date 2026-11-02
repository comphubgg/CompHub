'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/app/components/SprachProvider';
import { MARKE } from '@/lib/marke';

/*
 * Das grosse VIP-Fenster - ein Entwurf, zwei Anlaesse (Betreiber, 2.11.2026: "mit Logo, Animationen, Bild ... ein Dankeschoen"):
 *
 *   pruefung / falsch   Der Schluessel ruht, bis sich sein Inhaber mit Twitch bestaetigt (lib/vipZugaenge, twitchPflicht; verify meldet
 *                       grund 'twitch'). Wer das Twitch-Konto nicht hat, fragt auf Discord oder X nach einem neuen Schluessel.
 *   bestaetigt          Der Rueckweg von Twitch (?twitch=bestaetigt): Haken, Konfetti, "Welcome back".
 *   willkommen          Das erste Anmelden auf einem Geraet (gemerkt im Browser, je Zugang) - fuer Streamer, Pros und den Betreiber selbst.
 *
 * Links das Foto des Zugangs (lib/vipBild), rechts der Inhalt; dahinter Punkteraster, blauer Schimmer und die schwebenden Kaertchen der
 * VIP-Sperre (app/overlays/VipVorhang). Ohne Foto steht links das Logo. Alle Bewegung steht bei "Bewegung reduzieren" still.
 *
 * Zum Ansehen (Betreiber): ?twitch=vorschau (Pruefung), ?twitch=willkommen (Willkommen) - ohne dass ein Schluessel betroffen ist.
 */

type Lage = 'pruefung' | 'falsch' | 'bestaetigt' | 'willkommen';
interface Wer { name: string; bild: string | null }

const MERKER = 'comphub-willkommen:';

/** 24 Konfetti-Teilchen in den Farben der Seite - nur beim Haken. */
const KONFETTI = Array.from({ length: 24 }, (_, i) => ({
  links: 8 + ((i * 37) % 84), verzug: (i % 6) * 0.12, dreh: (i * 53) % 360, dauer: 1.6 + (i % 4) * 0.25,
  farbe: ['#38bdf8', '#0ea5e9', '#a970ff', '#f1f5f9', '#34d399'][i % 5], breit: 6 + (i % 3) * 3,
}));

const STIL = `
@keyframes vipf-rein { from { opacity: 0; transform: translateY(18px) scale(.985); } to { opacity: 1; transform: none; } }
@keyframes vipf-bild { from { opacity: 0; transform: scale(1.06); } to { opacity: 1; transform: none; } }
@keyframes vipf-atmen { 0%, 100% { opacity: .55; transform: scale(1); } 50% { opacity: 1; transform: scale(1.12); } }
@keyframes vipf-schweben { 0%, 100% { transform: translateY(0) rotate(var(--dreh, 0deg)); } 50% { transform: translateY(-14px) rotate(var(--dreh, 0deg)); } }
@keyframes vipf-schimmer { 0%, 70% { left: -30%; } 100% { left: 130%; } }
@keyframes vipf-haken { to { stroke-dashoffset: 0; } }
@keyframes vipf-kreis { from { transform: scale(.6); opacity: 0; } 60% { transform: scale(1.08); opacity: 1; } to { transform: scale(1); } }
@keyframes vipf-konfetti { 0% { transform: translateY(0) rotate(0deg); opacity: 1; } 100% { transform: translateY(260px) rotate(var(--dreh)); opacity: 0; } }
.vipf-rein { animation: vipf-rein .55s cubic-bezier(.2,.8,.2,1) both; }
.vipf-bild { animation: vipf-bild 1.1s cubic-bezier(.2,.8,.2,1) both; }
.vipf-atmen { animation: vipf-atmen 3.2s ease-in-out infinite; }
.vipf-schweben { animation: vipf-schweben 7s ease-in-out infinite; }
.vipf-schimmer::after { content: ''; position: absolute; top: -40%; bottom: -40%; width: 60px; left: -30%; background: linear-gradient(90deg, transparent, rgba(255,255,255,.35), transparent); transform: skewX(-20deg); animation: vipf-schimmer 3.4s ease-in-out infinite; }
.vipf-haken { stroke-dasharray: 60; stroke-dashoffset: 60; animation: vipf-haken .5s .35s ease-out forwards; }
.vipf-kreis { animation: vipf-kreis .5s cubic-bezier(.2,.8,.2,1) both; }
.vipf-konfetti { animation: vipf-konfetti var(--dauer) var(--verzug) cubic-bezier(.2,.6,.4,1) forwards; }
@media (prefers-reduced-motion: reduce) { .vipf-rein, .vipf-bild, .vipf-atmen, .vipf-schweben, .vipf-schimmer::after, .vipf-haken, .vipf-kreis, .vipf-konfetti { animation: none !important; } .vipf-haken { stroke-dashoffset: 0; } }
`;

function Schemen({ klasse, verzug, kind }: { klasse: string; verzug: string; kind: React.ReactNode }) {
  return (
    <div aria-hidden style={{ animationDelay: verzug }}
      className={`vipf-schweben pointer-events-none fixed hidden rounded-2xl border border-sky-400/20 bg-sky-950/30 p-3 shadow-[0_0_40px_rgba(14,165,233,0.12)] backdrop-blur-[2px] lg:block ${klasse}`}>
      {kind}
    </div>
  );
}

export default function VipFenster() {
  const t = useT();
  const [lage, setLage] = useState<Lage | null>(null);
  const [wer, setWer] = useState<Wer>({ name: '', bild: null });

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const rueck = p.get('twitch');
    const vorschau = rueck === 'vorschau' || rueck === 'willkommen';
    if (rueck) {
      p.delete('twitch');
      const rest = p.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`);
    }
    fetch('/api/auth/verify', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j: { authorized?: boolean; grund?: string; user?: string; anzeige?: string; bild?: string | null }) => {
        setWer({ name: j.anzeige || j.user || '', bild: j.bild ?? null });
        if (vorschau) { setLage(rueck === 'willkommen' ? 'willkommen' : 'pruefung'); return; }
        if (rueck === 'bestaetigt') { setLage('bestaetigt'); return; }
        if (rueck === 'falsches-konto') { setLage('falsch'); return; }
        if (j.grund === 'twitch') { setLage('pruefung'); return; }
        // Das erste Mal auf diesem Geraet (je Zugang gemerkt) - einmal Willkommen, danach nie wieder.
        if (j.authorized && j.user) { willkommenEinmal(j.user); return; }
        /*
         * Kein Schluessel: vielleicht ein Konto - ein Pro ueber seine POV-Einladung (app/api/pov/einladung legt das Pro-Konto an), ein
         * Manager, ein Admin oder ein VIP mit Konto. Gewoehnliche Besucher mit Konto bekommen kein Fenster.
         */
        return fetch('/api/konto', { cache: 'no-store' }).then((r) => r.json())
          .then((k: { angemeldet?: boolean; konto?: { id?: string; name?: string; rolle?: string | null; vip?: boolean } | null; bild?: string | null }) => {
            const konto = k.angemeldet ? k.konto : null;
            if (!konto?.id || !(konto.rolle || konto.vip)) return;
            setWer({ name: konto.name || '', bild: k.bild ?? null });
            willkommenEinmal(`konto:${konto.id}`);
          });
      })
      .catch(() => undefined);
    function willkommenEinmal(wer: string) {
      const k = `${MERKER}${wer.toLowerCase()}`;
      try {
        if (!localStorage.getItem(k)) { localStorage.setItem(k, String(Date.now())); setLage('willkommen'); }
      } catch { /* ohne Speicher kein Willkommen - lieber keins als jedes Mal */ }
    }
  }, []);

  useEffect(() => {
    if (!lage) return undefined;
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') setLage(null); };
    window.addEventListener('keydown', taste);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', taste); document.body.style.overflow = ''; };
  }, [lage]);

  if (!lage) return null;

  const zu = () => setLage(null);
  const weiter = () => { if (lage === 'bestaetigt') window.location.reload(); else zu(); };
  const name = wer.name || 'VIP';
  const gut = lage === 'bestaetigt' || lage === 'willkommen';

  const kopf = gut ? t('Willkommen') : t('Sicherheitsprüfung');
  const titel = lage === 'willkommen' ? t('Du bist drin.')
    : lage === 'bestaetigt' ? t('Alles wieder frei.')
    : lage === 'falsch' ? t('Das war nicht das richtige Twitch-Konto.')
    : t('Dein Zugangsschlüssel ist kurz pausiert.');
  const text = lage === 'willkommen'
    ? t('Dein VIP-Zugang ist aktiv: Streams, Overlays, POVs, Tierlists - alles gehört dir. Wenn dir etwas fehlt oder nervt, sag es uns, wir bauen es.')
    : lage === 'bestaetigt' ? t('Danke fürs Bestätigen. Dein Zugang ist sofort wieder aktiv, nichts hat sich verändert.')
    : t('Damit dein VIP-Zugang sicher bleibt, bestätige einmal kurz, dass du es wirklich bist. Melde dich mit deinem Twitch-Konto an, danach ist sofort alles wieder frei.');

  const knopf = 'relative inline-flex w-full items-center justify-center gap-3 overflow-hidden rounded-2xl text-[16px] font-extrabold transition';
  return (
    <div role="dialog" aria-modal="true" aria-label={kopf}
      className="fixed inset-0 z-[300] overflow-y-auto bg-[rgba(3,7,18,0.6)] backdrop-blur-[2px]"
      style={{ backgroundImage: 'radial-gradient(rgba(148,163,184,0.10) 1px, transparent 1px), radial-gradient(55% 45% at 50% 0%, rgba(14,165,233,0.22), transparent 70%), radial-gradient(40% 35% at 85% 90%, rgba(14,165,233,0.10), transparent 70%)', backgroundSize: '22px 22px, 100% 100%, 100% 100%' }}>
      <style>{STIL}</style>

      <Schemen verzug="0s" klasse="left-[5%] top-[16%] w-56 [--dreh:-4deg]" kind={
        <div className="space-y-1.5"><div className="mb-2 h-2 w-20 rounded bg-sky-400/40" />
          {[88, 76, 70, 61, 55].map((b, i) => <div key={i} className="flex items-center gap-2"><span className="h-2 w-3 rounded bg-sky-300/30" /><span className="h-2 rounded bg-slate-300/20" style={{ width: `${b}%` }} /></div>)}
        </div>} />
      <Schemen verzug="-2.5s" klasse="right-[6%] top-[20%] [--dreh:3deg]" kind={
        <div className="flex items-center gap-3"><span className="h-12 w-12 rounded-xl bg-sky-400/25" /><span className="h-12 w-12 rounded-xl bg-sky-400/15" />
          <span className="space-y-2"><span className="block h-2 w-24 rounded bg-slate-200/25" /><span className="block h-2 w-16 rounded bg-sky-300/30" /></span></div>} />
      <Schemen verzug="-4.5s" klasse="bottom-[14%] left-[12%] [--dreh:2deg]" kind={
        <div className="flex items-center gap-3"><span className="h-3 w-3 rounded-full bg-sky-400/60" /><span className="font-mono text-xl font-bold tracking-widest text-sky-200/40">12:47</span></div>} />

      <div className="flex min-h-full items-center justify-center p-0 sm:p-6">
        <section className="vipf-rein relative grid w-full max-w-[960px] overflow-hidden bg-[#111114] shadow-[0_30px_90px_rgba(0,0,0,.6),0_0_0_1px_rgba(14,165,233,.06),0_0_120px_rgba(14,165,233,.10)] sm:rounded-[28px] sm:border sm:border-white/[0.08] md:grid-cols-[5fr_6fr]">
          {/* Links: das Bild */}
          <div className="relative min-h-[300px] overflow-hidden bg-[#0b1220] md:min-h-[560px]">
            {wer.bild ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={wer.bild} alt="" className="vipf-bild absolute inset-0 h-full w-full object-cover object-[50%_18%]" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(60%_60%_at_50%_40%,rgba(14,165,233,.35),transparent_70%)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={MARKE.logoFrei} alt="CompHub" className="vipf-bild h-36 w-36 object-contain opacity-90" />
              </div>
            )}
            <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,9,11,.05)_0%,rgba(9,9,11,.15)_45%,rgba(9,9,11,.92)_100%),linear-gradient(90deg,transparent_70%,rgba(17,17,20,.6)_100%)]" />
            <span className="absolute left-6 top-5 z-[2] inline-flex items-center gap-2 rounded-full border border-white/10 bg-[rgba(9,9,11,.55)] px-3 py-1.5 text-[12px] font-semibold backdrop-blur-md">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,.2)]" />{gut ? 'VIP' : 'VIP · Streamer'}
            </span>
            <span className="absolute right-5 top-5 z-[2] grid h-[58px] w-[58px] place-items-center rounded-2xl border border-white/10 bg-[rgba(9,9,11,.6)] backdrop-blur-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={MARKE.logoFrei} alt="CompHub" className="h-10 w-10 object-contain" />
            </span>
            <div className="absolute inset-x-5 bottom-5 z-[2] md:inset-x-7 md:bottom-7">
              <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-sky-300">{lage === 'willkommen' ? t('Willkommen an Bord') : t('Willkommen zurück')}</p>
              <h2 className="mt-2 text-balance font-[family-name:var(--font-anzeige)] text-[34px] font-extrabold leading-[.95] tracking-[-.02em] text-slate-50 md:text-[44px]">
                {t('Hey')} <span className="text-sky-300">{name}</span>,<br />{gut ? t('schön, dass du da bist.') : t('ein kurzer Check.')}
              </h2>
              <p className="mt-3 max-w-[32ch] text-[14px] text-slate-400">
                {gut ? t('Dein VIP-Zugang ist freigeschaltet.') : t('Dein VIP-Zugang wartet direkt hinter diesem Schritt.')}
              </p>
            </div>
          </div>

          {/* Rechts: der Inhalt */}
          <div className="flex flex-col px-6 pb-6 pt-6 md:px-11 md:pb-8 md:pt-10">
            <div className="relative hidden h-16 w-16 md:block">
              <div className="vipf-atmen absolute -inset-[18px] rounded-full bg-sky-500/35 blur-2xl" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={MARKE.logoFrei} alt="" className="relative h-16 w-16 object-contain" />
            </div>

            <span className={`inline-flex w-max items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.22em] md:mt-6 ${gut
              ? 'border-emerald-400/35 bg-emerald-400/10 text-emerald-300' : 'border-amber-400/35 bg-amber-400/10 text-amber-300'}`}>
              <svg viewBox="0 0 24 24" className="h-[13px] w-[13px]" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                {gut ? <path d="M5 12l5 5L20 7" /> : <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></>}
              </svg>
              {kopf}
            </span>

            {lage === 'bestaetigt' && (
              <div className="relative mt-5 h-20 w-20">
                <div className="vipf-kreis grid h-20 w-20 place-items-center rounded-full bg-emerald-400/15 ring-2 ring-emerald-400/60">
                  <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="#34d399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path className="vipf-haken" d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                </div>
                <div aria-hidden className="pointer-events-none absolute -left-24 -top-6 h-40 w-[360px]">
                  {KONFETTI.map((k, i) => (
                    <span key={i} className="vipf-konfetti absolute top-0 block rounded-[2px]"
                      style={{ left: `${k.links}%`, width: k.breit, height: k.breit * 1.6, background: k.farbe, '--dreh': `${k.dreh}deg`, '--dauer': `${k.dauer}s`, '--verzug': `${k.verzug}s` } as React.CSSProperties} />
                  ))}
                </div>
              </div>
            )}

            <h1 className="mt-4 text-balance font-[family-name:var(--font-anzeige)] text-[27px] font-extrabold leading-[1.05] tracking-[-.02em] text-slate-50 md:text-[34px]">{titel}</h1>
            <p className="mt-3 max-w-[44ch] text-[15px] leading-[1.55] text-slate-400">{text}</p>

            {gut ? (
              <button type="button" onClick={weiter} className={`${knopf} vipf-schimmer mt-6 h-14 bg-gradient-to-b from-sky-400 to-sky-500 text-white shadow-[0_10px_30px_rgba(14,165,233,.35),inset_0_1px_0_rgba(255,255,255,.25)] hover:from-sky-300`}>
                {t('Los geht’s')}
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </button>
            ) : (
              <>
                <a href="/api/auth/twitch/authorize?zweck=vip" className={`${knopf} vipf-schimmer mt-6 h-14 bg-gradient-to-b from-[#a970ff] to-[#9146ff] text-white shadow-[0_10px_30px_rgba(145,70,255,.35),inset_0_1px_0_rgba(255,255,255,.25)] hover:from-[#b98aff]`}>
                  <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="currentColor"><path d="M4.3 2 2 7.6V20h4.9v3h2.8l2.9-3h4.3L22 14.3V2H4.3zm15.7 11.3-3.3 3.3h-5.3l-2.9 2.9v-2.9H4.3V4h15.7v9.3zM17 7.3h-2v5.8h2V7.3zm-5.3 0h-2v5.8h2V7.3z" /></svg>
                  {t('Mit Twitch bestätigen')}
                </a>
                <p className="mt-2.5 text-center text-[12px] text-slate-500">{t('Dauert etwa 5 Sekunden · für dich ändert sich nichts')}</p>
                <div className="my-5 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500 before:h-px before:flex-1 before:bg-white/[0.08] after:h-px after:flex-1 after:bg-white/[0.08]">
                  {t('Kein Zugriff auf dieses Twitch-Konto?')}
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <a href={MARKE.discord} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-3.5 py-3 text-[14px] font-bold text-slate-100 transition hover:border-[#5865f2]/60">
                    <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl bg-[#5865f2]/20 text-[#8b9cff]">
                      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor"><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.2.5a18.3 18.3 0 0 1 4.5 1.6 16.5 16.5 0 0 0-15.4 0A18.3 18.3 0 0 1 8.8 3.5L8.6 3a19.8 19.8 0 0 0-4.9 1.4C.6 9 .1 13.5.3 18a19.9 19.9 0 0 0 6 3l1.3-2.1a12.9 12.9 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 11.8 0l.5.4a12.9 12.9 0 0 1-2 1L17.7 21a19.9 19.9 0 0 0 6-3c.3-5.2-.6-9.7-3.4-13.6ZM8.4 15.3c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.1 1.1 2.1 2.4-.9 2.4-2.1 2.4Zm7.2 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.1 1.1 2.1 2.4-.9 2.4-2.1 2.4Z" /></svg>
                    </span>
                    <span>{t('Auf Discord fragen')}<small className="mt-px block text-[11px] font-medium text-slate-500">{t('neuer Schlüssel in Minuten')}</small></span>
                  </a>
                  <a href="https://x.com/juanitofnbr" target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-3.5 py-3 text-[14px] font-bold text-slate-100 transition hover:border-slate-400/60">
                    <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl bg-white/[0.08] text-slate-200">
                      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor"><path d="M18.2 2h3.4l-7.4 8.5L23 22h-6.8l-5.3-7-6.1 7H1.4l7.9-9.1L1 2h7l4.8 6.4L18.2 2zm-1.2 18h1.9L7.1 3.9H5.1L17 20z" /></svg>
                    </span>
                    <span>{t('DM auf X')}<small className="mt-px block text-[11px] font-medium text-slate-500">@juanitofnbr</small></span>
                  </a>
                </div>
              </>
            )}

            <div className="mt-6 flex items-center justify-between gap-3 text-[12.5px] text-slate-500 md:mt-auto md:pt-6">
              <span>{t('Danke, dass du CompHub nutzt')} <span className="text-rose-500">♥</span> <b className="font-semibold text-slate-400">{t('- das bedeutet uns viel.')}</b></span>
              <button type="button" onClick={zu} className="text-[12px] font-semibold text-slate-500 transition hover:text-slate-300">{t('Schließen')}</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
