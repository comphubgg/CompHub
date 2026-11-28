import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SEITE } from './teile';
import { EN, MAIL, ZAEHLEN_EN, type Quelle } from './howText';

/*
 * How it works im Hub (wie /how-it-works): woher die Zahlen kommen, wie die Replays gelesen werden, wie jede Stat gezaehlt wird (How we count) und was
 * jede Seite zeigt. Text 1:1 die englische Fassung der Seite (howText.ts); Videos von der Seite (/media), fehlt eins, bleibt seine Stelle leer.
 * Aufbau (Design-System 3.0, 27.11.2026): links klebt das Inhaltsverzeichnis mit Nummern - der Abschnitt, den man gerade liest, leuchtet. Rechts
 * laufen die Abschnitte ueber die volle Breite: grosse Nummer und Titel links, der Text in der Mitte, Video oder Punkte-Liste daneben (kein
 * schmaler Textstreifen mit leerem Rand). "How we count" zeigt die beiden Quellen nebeneinander und jede Stat als Kachel in einem Raster.
 * Links im Hub zeigen auf die Hub-Seiten.
 */

const HUB: Record<string, string> = {
  '/replays': '/competitive/replays', '/power-rankings': '/competitive/rankings', '/statistics': '/competitive/statistics', '/streams': '/streamer/streams',
  '/fncs': '/competitive/fncs', '/predictions': '/competitive/predictions', '/tournament-maps': '/competitive/maps', '/overlays': '/streamer/overlays',
};
const MARKE: Record<Quelle, string> = { epic: 'border-white/15 text-white/70', replay: 'border-akz/40 text-akz', beide: 'border-amber-300/40 text-amber-200' };

function Video({ name, titel, melde }: { name: string; titel: string; melde?: (da: boolean) => void }) {
  // Erst zeigen, wenn das Vorschaubild da ist - fehlt das Video auf der Seite, bleibt die Stelle leer (wie dort).
  const [da, setDa] = useState(false);
  const [weg, setWeg] = useState(false);
  useEffect(() => { const i = new Image(); i.onload = () => setDa(true); i.src = `${SEITE}/media/${name}.jpg`; }, [name]);
  useEffect(() => { melde?.(da && !weg); }, [da, weg]); // eslint-disable-line react-hooks/exhaustive-deps
  if (weg || !da) return null;
  return (
    <figure className="overflow-hidden rounded-2xl border border-white/[0.07] bg-black/50">
      <video controls preload="none" playsInline poster={`${SEITE}/media/${name}.jpg`} onError={() => setWeg(true)} className="aspect-video w-full bg-black">
        <source src={`${SEITE}/media/${name}.mp4`} type="video/mp4" onError={() => setWeg(true)} />
      </video>
      <figcaption className="px-4 py-2 text-xs text-white/40">{titel}</figcaption>
    </figure>
  );
}

function Zaehlen() {
  const t = ZAEHLEN_EN;
  return (
    <div className="space-y-6">
      <p className="max-w-4xl text-[15px] leading-relaxed text-white/70">{t.einleitung}</p>
      <div>
        <h3 className="titel text-2xl">{t.quellenTitel}</h3>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-white/[0.08] bg-black/40 p-5"><p className="titel text-2xl">{t.epicTitel}</p><p className="mt-2 text-sm leading-relaxed text-white/60">{t.epicText}</p></div>
          <div className="rounded-2xl border border-akz/30 bg-akz/[0.07] p-5"><p className="titel text-2xl !text-akz">{t.replayTitel}</p><p className="mt-2 text-sm leading-relaxed text-white/60">{t.replayText}</p></div>
        </div>
        <p className="mt-3 text-xs text-white/40">{t.lanText}</p>
      </div>
      {t.gruppen.map((g) => (
        <div key={g.titel}>
          <div className="mb-3 flex items-center gap-3"><span className="h-4 w-1 rounded-full bg-akz" /><h3 className="titel text-xl">{g.titel}</h3><span className="zahl text-xs font-semibold text-white/35">{g.werte.length}</span><span className="h-px flex-1 bg-white/[0.07]" /></div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 2xl:grid-cols-3">
            {g.werte.map((w) => (
              <div key={w.name} className="rounded-2xl border border-white/[0.06] bg-black/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-bold text-white">{w.name}</h4><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${MARKE[w.quelle]}`}>{t.marke[w.quelle]}</span></div>
                <p className="mt-1.5 text-sm leading-relaxed text-white/55">{w.text}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="text-xs text-white/40">{t.fehltText}</p>
      <div>
        <h3 className="titel text-2xl">{t.zeitTitel}</h3>
        <div className="mt-2 grid grid-cols-1 gap-x-8 gap-y-3 lg:grid-cols-2">{t.zeitAbsaetze.map((p) => <p key={p} className="text-sm leading-relaxed text-white/70">{p}</p>)}</div>
      </div>
    </div>
  );
}

const nr = (i: number) => String(i + 1).padStart(2, '0');

export default function HowItWorks() {
  const z = ZAEHLEN_EN;
  const [aktiv, setAktiv] = useState(EN.abschnitte[0]?.id ?? '');
  // Welche Videos es auf der Seite wirklich gibt - nur dann bekommt der Abschnitt die zweite Spalte dafuer.
  const [videos, setVideos] = useState<Record<string, boolean>>({});
  // Der Abschnitt, der gerade oben im Bild steht, leuchtet im Inhaltsverzeichnis.
  useEffect(() => {
    const b = new IntersectionObserver((e) => { const s = e.filter((x) => x.isIntersecting).sort((x, y) => x.boundingClientRect.top - y.boundingClientRect.top)[0]; if (s) setAktiv(s.target.id); }, { rootMargin: '-140px 0px -55% 0px' });
    for (const a of EN.abschnitte) { const el = document.getElementById(a.id); if (el) b.observe(el); }
    return () => b.disconnect();
  }, []);
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[280px_minmax(0,1fr)] xl:items-start">
      <aside className="fl-fest min-w-0 p-2 xl:sticky xl:top-[7.5rem] xl:max-h-[calc(100vh-8.5rem)] xl:overflow-y-auto">
        <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">{EN.inhalt}</p>
        <ul className="ohne-leiste flex gap-1 overflow-x-auto xl:flex-col xl:overflow-visible">
          {EN.abschnitte.map((a, i) => {
            const an = aktiv === a.id;
            return (
              <li key={a.id} className="shrink-0">
                <a href={`#${a.id}`} className={`relative flex items-center gap-3 rounded-xl px-3 py-2 transition ${an ? 'bg-akz/[0.12] text-white' : 'text-white/60 hover:bg-white/[0.04] hover:text-white'}`}>
                  {an && <motion.span layoutId="how-inhalt" className="absolute inset-y-2 left-0 hidden w-[3px] rounded-full bg-akz shadow-[0_0_14px_rgb(var(--akz)/0.9)] xl:block" />}
                  <span className={`titel zahl text-2xl ${an ? '!text-akz' : '!text-white/30'}`}>{nr(i)}</span>
                  <span className="whitespace-nowrap text-[13px] font-semibold xl:whitespace-normal">{a.titel}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </aside>
      <article className="min-w-0 space-y-4">
        <header className="fl-fest px-6 py-8 sm:px-9">
          <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
            <p className="ueber">CompHub · {EN.stand}</p>
            <h1 className="titel mt-2 text-6xl sm:text-7xl xl:text-8xl">{EN.titel}</h1>
            <p className="mt-3 max-w-4xl text-base leading-relaxed text-white/60">{EN.einleitung}</p>
          </motion.div>
        </header>
        {EN.abschnitte.map((a, i) => {
          const seite = (a.video && videos[a.video]) || a.punkte;
          return (
            <motion.section key={a.id} id={a.id} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.45 }} className="fl-fest scroll-mt-36 p-6 sm:p-8">
              <div className="mb-5 flex items-end gap-4 border-b border-white/[0.06] pb-4">
                <span className="titel zahl text-6xl !text-akz">{nr(i)}</span>
                <h2 className="titel text-4xl sm:text-5xl"><a href={`#${a.id}`} className="hover:text-akz">{a.titel}</a></h2>
              </div>
              {a.id === 'how-we-count' ? <Zaehlen /> : (
                <div className={`grid grid-cols-1 gap-x-8 gap-y-5 ${seite ? 'lg:grid-cols-2' : ''}`}>
                  <div className={`space-y-3 ${seite ? '' : 'lg:columns-2 lg:gap-8 lg:space-y-0 [&>p]:lg:mb-3 [&>p]:lg:break-inside-avoid'}`}>
                    {a.absaetze?.map((p) => <p key={p} className="text-[15px] leading-relaxed text-white/70">{p}</p>)}
                    {a.nachher?.map((p) => <p key={p} className="text-[15px] leading-relaxed text-white/70">{p}</p>)}
                    {a.link && <p className="pt-1"><Link to={HUB[a.link.href] ?? a.link.href} className="knopf-leer">{a.link.text}</Link></p>}
                  </div>
                  {(a.video || a.punkte) && (
                    <div className="space-y-4 empty:hidden">
                      {a.video && <Video name={a.video} titel={EN.videoTitel[a.video]} melde={(da) => setVideos((v) => (v[a.video!] === da ? v : { ...v, [a.video!]: da }))} />}
                      {a.punkte && <ul className="overflow-hidden rounded-2xl border border-white/[0.07] bg-black/30">{a.punkte.map((p, k) => <li key={p} className="flex gap-3 border-b border-white/[0.05] px-4 py-3 text-sm leading-relaxed text-white/65 last:border-b-0"><span className="titel zahl text-xl !text-white/25">{k + 1}</span><span>{p}</span></li>)}</ul>}
                    </div>
                  )}
                </div>
              )}
            </motion.section>
          );
        })}
        <section className="fl-fest flex flex-wrap items-center gap-x-8 gap-y-3 p-6 sm:p-8">
          <h2 className="titel text-4xl">{z.fehlerTitel}</h2>
          <p className="min-w-0 flex-1 basis-[320px] text-[15px] leading-relaxed text-white/70">{z.fehlerText} {z.mailVor} <a href={`mailto:${MAIL}`} className="text-akz hover:underline">{MAIL}</a> {z.discordVor} <a href="https://discord.gg/8jQ3tf37sQ" target="_blank" rel="noreferrer" className="text-akz hover:underline">{z.discordKanal}</a> {z.fehlerSchluss}</p>
        </section>
      </article>
    </div>
  );
}
