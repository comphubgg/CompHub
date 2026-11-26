import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Glas } from '../../../teile/Glas';
import { SEITE, SeitenKopf } from './teile';
import { EN, MAIL, ZAEHLEN_EN, type Quelle } from './howText';

/*
 * How it works im Hub (wie /how-it-works): woher die Zahlen kommen, wie die Replays gelesen werden, wie jede Stat gezaehlt wird (How we count) und was
 * jede Seite zeigt. Text 1:1 die englische Fassung der Seite (howText.ts); Videos von der Seite (/media), fehlt eins, bleibt seine Stelle leer.
 * Inhaltsverzeichnis als Sprungmarken, links im Hub zeigen auf die Hub-Seiten.
 */

const HUB: Record<string, string> = {
  '/replays': '/competitive/replays', '/power-rankings': '/competitive/rankings', '/statistics': '/competitive/statistics', '/streams': '/streamer/streams',
  '/fncs': '/competitive/fncs', '/predictions': '/competitive/predictions', '/tournament-maps': '/competitive/maps', '/overlays': '/streamer/overlays',
};
const MARKE: Record<Quelle, string> = { epic: 'border-white/15 text-white/70', replay: 'border-sky-400/40 text-sky-300', beide: 'border-violet-400/40 text-violet-300' };

function Video({ name, titel }: { name: string; titel: string }) {
  // Erst zeigen, wenn das Vorschaubild da ist - fehlt das Video auf der Seite, bleibt die Stelle leer (wie dort).
  const [da, setDa] = useState(false);
  const [weg, setWeg] = useState(false);
  useEffect(() => { const i = new Image(); i.onload = () => setDa(true); i.src = `${SEITE}/media/${name}.jpg`; }, [name]);
  if (weg || !da) return null;
  return (
    <figure className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
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
    <>
      <p className="mt-3 text-sm leading-relaxed text-white/70">{t.einleitung}</p>
      <h3 className="mt-6 font-bold text-white">{t.quellenTitel}</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-sm font-semibold text-white">{t.epicTitel}</p><p className="mt-1.5 text-sm leading-relaxed text-white/60">{t.epicText}</p></div>
        <div className="rounded-2xl border border-sky-400/30 bg-sky-400/[0.05] p-4"><p className="text-sm font-semibold text-sky-300">{t.replayTitel}</p><p className="mt-1.5 text-sm leading-relaxed text-white/60">{t.replayText}</p></div>
      </div>
      <p className="mt-3 text-xs text-white/40">{t.lanText}</p>
      {t.gruppen.map((g) => (
        <div key={g.titel} className="mt-8">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">{g.titel}</h3>
          <div className="mt-3 divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
            {g.werte.map((w) => (
              <div key={w.name} className="px-4 py-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold text-white">{w.name}</h4><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${MARKE[w.quelle]}`}>{t.marke[w.quelle]}</span></div>
                <p className="mt-1 text-sm leading-relaxed text-white/55">{w.text}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="mt-3 text-xs text-white/40">{t.fehltText}</p>
      <h3 className="mt-8 font-bold text-white">{t.zeitTitel}</h3>
      {t.zeitAbsaetze.map((p) => <p key={p} className="mt-3 text-sm leading-relaxed text-white/70">{p}</p>)}
    </>
  );
}

export default function HowItWorks() {
  const z = ZAEHLEN_EN;
  return (
    <div className="grid gap-8 xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="xl:sticky xl:top-32 xl:h-fit">
        <Glas className="p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">{EN.inhalt}</p>
          <ul className="mt-3 flex flex-wrap gap-2 xl:flex-col xl:gap-1">
            {EN.abschnitte.map((a) => <li key={a.id}><a href={`#${a.id}`} className="block rounded-xl border border-white/10 px-3 py-1.5 text-xs text-white/70 transition hover:border-sky-400/50 hover:text-white xl:border-transparent xl:hover:bg-white/5">{a.titel}</a></li>)}
          </ul>
        </Glas>
      </aside>
      <article className="min-w-0 max-w-4xl space-y-6">
        <SeitenKopf ueber="CompHub" titel={EN.titel} text={EN.einleitung} />
        <p className="text-xs text-white/35">{EN.stand}</p>
        {EN.abschnitte.map((a, i) => (
          <motion.section key={a.id} id={a.id} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.45, delay: Math.min(i, 3) * 0.04 }} className="scroll-mt-36">
            <Glas className="p-6">
              <h2 className="text-xl font-extrabold text-white"><a href={`#${a.id}`} className="hover:text-sky-300">{a.titel}</a></h2>
              {a.id === 'how-we-count' ? <Zaehlen /> : (
                <>
                  {a.absaetze?.map((p) => <p key={p} className="mt-3 text-sm leading-relaxed text-white/70">{p}</p>)}
                  {a.punkte && <ul className="mt-3 divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">{a.punkte.map((p) => <li key={p} className="px-4 py-3 text-sm leading-relaxed text-white/60">{p}</li>)}</ul>}
                  {a.nachher?.map((p) => <p key={p} className="mt-3 text-sm leading-relaxed text-white/70">{p}</p>)}
                </>
              )}
              {a.video && <Video name={a.video} titel={EN.videoTitel[a.video]} />}
              {a.link && <p className="mt-4 text-sm"><Link to={HUB[a.link.href] ?? a.link.href} className="font-semibold text-sky-400 hover:text-sky-300">{a.link.text}</Link></p>}
            </Glas>
          </motion.section>
        ))}
        <Glas className="p-6">
          <h2 className="text-xl font-extrabold text-white">{z.fehlerTitel}</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/70">{z.fehlerText} {z.mailVor} <a href={`mailto:${MAIL}`} className="text-sky-400 hover:text-sky-300">{MAIL}</a> {z.discordVor} <a href="https://discord.gg/8jQ3tf37sQ" target="_blank" rel="noreferrer" className="text-sky-400 hover:text-sky-300">{z.discordKanal}</a> {z.fehlerSchluss}</p>
        </Glas>
      </article>
    </div>
  );
}
