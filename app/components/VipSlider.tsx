'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';

/*
 * Die Partnerleiste auf der Startseite.
 *
 * Wer das Werkzeug benutzt oder mit dem Betreiber zusammenarbeitet, steht
 * hier mit Bild, Namen und Twitch-Konto. Ausgewaehlt wird von Hand in der
 * Verwaltung - VIP zu sein genuegt nicht, und wer hier nicht steht, bleibt
 * trotzdem VIP.
 *
 * Der Ton ist bewusst zurueckhaltend: "hochwertig, kompakt und als dezente
 * Promo-/Partner-Sektion". Also keine grossen Flaechen und kein Werbeton -
 * eine Reihe Gesichter, die von selbst weiterlaeuft und die man auch mit
 * der Hand schieben kann.
 *
 * Ist niemand ausgewaehlt, erscheint der Bereich gar nicht. Eine leere
 * Partnerleiste ist schlechter als keine.
 */

interface Vip {
  id: string;
  name: string;
  bild: string | null;
  twitch: string | null;
  x: string | null;
  tiktok: string | null;
}

/*
 * Die drei Netze, jeweils mit ihrem Zeichen.
 *
 * Als Pfad gezeichnet und nicht als Schrift: eine Ikonenschrift fuer drei
 * Zeichen nachzuladen waere ein eigener Netzabruf fuer nichts.
 */
const NETZE: Array<{
  schluessel: 'twitch' | 'x' | 'tiktok'; adresse: string; pfad: string;
}> = [
  {
    schluessel: 'twitch', adresse: 'https://twitch.tv/',
    pfad: 'M4 2 2.5 6v14H7v2.5h2.5L12 20h4l5-5V2H4Zm2 2h13v10l-3 3h-4'
      + 'l-2.5 2.5V17H6V4Zm5 4v5h2V8h-2Zm5 0v5h2V8h-2Z',
  },
  {
    schluessel: 'x', adresse: 'https://x.com/',
    pfad: 'M18.9 2H22l-7 8 8.2 12H16l-5-7.3L5.3 22H2l7.5-8.6L1.7 2h7.2'
      + 'l4.5 6.6L18.9 2zm-1.1 18h1.7L7.3 3.8H5.5L17.8 20z',
  },
  {
    schluessel: 'tiktok', adresse: 'https://tiktok.com/@',
    pfad: 'M16.5 2h-3v13a2.5 2.5 0 1 1-2.5-2.5c.3 0 .5 0 .8.1V9.5a5.6 5.6 0 0 0-.8-.1'
      + 'A5.5 5.5 0 1 0 16.5 15V8.3c1 .8 2.3 1.2 3.5 1.2V6.5c-1.9 0-3.5-1.6-3.5-3.5V2Z',
  },
];

/** Wie lange eine Karte steht, bevor weitergerueckt wird. */
const TAKT = 4000;

export default function VipSlider() {
  const t = useT();
  const [vips, setVips] = useState<Vip[]>([]);
  const bahn = useRef<HTMLDivElement | null>(null);
  /*
   * Waehrend jemand selbst schiebt oder mit der Maus darueber ist, laeuft
   * nichts von allein weiter. Ein Bild, das unter dem Zeiger wegrutscht,
   * ist aergerlicher als eine Leiste, die kurz stillsteht.
   */
  const [haelt, setHaelt] = useState(false);

  useEffect(() => {
    let weg = false;
    void (async () => {
      try {
        const j = await (await fetch('/api/vips')).json();
        if (!weg) setVips(Array.isArray(j?.vips) ? j.vips : []);
      } catch { /* ohne Auskunft bleibt der Bereich leer */ }
    })();
    return () => { weg = true; };
  }, []);

  /** Eine Karte weiter - und am Ende wieder von vorn. */
  const weiter = useCallback((richtung: 1 | -1) => {
    const el = bahn.current;
    if (!el) return;
    const karte = el.querySelector('[data-karte]') as HTMLElement | null;
    const schritt = karte ? karte.offsetWidth + 16 : 240;
    const ende = el.scrollWidth - el.clientWidth;

    if (richtung === 1 && el.scrollLeft >= ende - 8) {
      el.scrollTo({ left: 0, behavior: 'smooth' });
      return;
    }
    if (richtung === -1 && el.scrollLeft <= 8) {
      el.scrollTo({ left: ende, behavior: 'smooth' });
      return;
    }
    el.scrollBy({ left: schritt * richtung, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (haelt || vips.length < 2) return undefined;
    const uhr = setInterval(() => weiter(1), TAKT);
    return () => clearInterval(uhr);
  }, [haelt, vips.length, weiter]);

  if (!vips.length) return null;

  return (
    <section className="border-t border-zinc-900 px-4 py-16">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap items-end gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em]
                          text-sky-400">
              <T>Im Einsatz</T>
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-100">
              <T>Streamer und Creator, die CompHub nutzen</T>
            </h2>
          </div>

          {/* Die Pfeile stehen rechts und nur, wenn es etwas zu schieben gibt. */}
          {vips.length > 2 && (
            <div className="ml-auto flex gap-1.5">
              {([['-1', '‹', 'zurück'], ['1', '›', 'weiter']] as const).map(
                ([r, zeichen, wort]) => (
                  <button key={r} type="button"
                    onClick={() => weiter(Number(r) as 1 | -1)}
                    aria-label={t(wort)}
                    className="grid h-9 w-9 place-items-center rounded-full border
                               border-zinc-800 text-lg leading-none text-slate-400
                               transition hover:border-sky-500 hover:text-sky-400">
                    {zeichen}
                  </button>
                ))}
            </div>
          )}
        </div>

        {/*
          * Die Bahn selbst.
          *
          * Waagerecht scrollbar mit Einrastpunkten, damit eine Karte nach
          * dem Schieben nicht halb angeschnitten stehen bleibt. Die
          * Scrollleiste ist versteckt - geschoben wird mit den Pfeilen, dem
          * Finger oder dem Rad.
          */}
        <div ref={bahn}
          onMouseEnter={() => setHaelt(true)}
          onMouseLeave={() => setHaelt(false)}
          onTouchStart={() => setHaelt(true)}
          className="vip-bahn flex snap-x snap-mandatory gap-4 overflow-x-auto
                     pb-2">
          {vips.map((v) => (
            <article key={v.id} data-karte
              className="group w-[180px] shrink-0 snap-start overflow-hidden
                         rounded-2xl border border-zinc-800 bg-zinc-950/60
                         transition hover:border-sky-500/60">
              <div className="relative h-[180px] overflow-hidden bg-zinc-900">
                {v.bild ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={v.bild} alt={v.name} loading="lazy"
                    /* Derselbe Zuschnitt wie bei den Spielerfotos: ein
                       Viertel von oben trifft das Gesicht zuverlaessig. */
                    style={{ objectPosition: 'center 25%' }}
                    className="h-full w-full object-cover transition
                               group-hover:scale-105" />
                ) : (
                  <div className="grid h-full place-items-center text-3xl
                                  text-zinc-700">
                    {v.name.trim().charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              <div className="px-4 py-3">
                <p className="truncate text-sm font-bold text-slate-100">
                  {v.name}
                </p>
                {/*
                  * Was hinterlegt ist, steht da - eins, zwei oder alle drei.
                  * Wer nur auf X unterwegs ist, kommt genauso auf die Karte.
                  */}
                {NETZE.filter((n) => v[n.schluessel]).map((n) => (
                  <a key={n.schluessel}
                    href={`${n.adresse}${v[n.schluessel]}`}
                    target="_blank" rel="noreferrer"
                    className="mt-0.5 flex items-center gap-1 text-[11px]
                               text-slate-500 transition hover:text-sky-400">
                    <svg viewBox="0 0 24 24" aria-hidden
                      className="h-3 w-3 shrink-0 fill-current">
                      <path d={n.pfad} />
                    </svg>
                    <span className="truncate">{v[n.schluessel]}</span>
                  </a>
                ))}
              </div>
            </article>
          ))}
        </div>

        {/*
          * Der Weg zum eigenen Zugang.
          *
          * Fuehrt in den Abschnitt direkt darunter, der die drei Bedingungen
          * nennt und mit "Zugang anfragen" auf X endet. Eine zweite
          * Kontaktmoeglichkeit hier daneben waere doppelt gemoppelt - und
          * wer klickt, soll erst lesen, worum es geht.
          */}
        <div className="mt-8 flex justify-center">
          <a href="#vip-zugang"
            className="group inline-flex items-center gap-2 rounded-full border
                       border-zinc-800 bg-zinc-950/60 px-5 py-2.5 text-sm
                       text-slate-400 transition hover:border-sky-500/60
                       hover:text-sky-400">
            <T>Du willst auch einen VIP-Zugang?</T>
            <span aria-hidden className="transition group-hover:translate-x-0.5">
              →
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}
