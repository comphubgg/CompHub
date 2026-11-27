import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { flagge } from './Glas';

/*
 * Podest-Karte fuer alle Treppchen im Hub (Rankings, Statistics, FNCS). Betreiber (26.11.2026): "nur das Profilbild hochkant und die Zahlen
 * unten links, ohne extra Rand" - die Karte IST das Hochkant-Foto (4:5), Name und Zahlen liegen unten links darauf. Platz 1 etwas groesser.
 * Auf dem Handy (drei Karten je ~110 px) kleinere Schrift, Unterzeile/Extras ausgeblendet - sonst ueberlappten Zahlen und Namen.
 */
const MEDAILLE = ['#facc15', '#cbd5e1', '#f59e0b'];

export interface PodestDaten {
  platz: 1 | 2 | 3;
  bild?: string | null;
  land?: string | null;
  name: string;
  unter?: string;
  label: string;
  wert: ReactNode;
  extra?: ReactNode;
  rechts?: ReactNode;
  link?: string;
}

export function PodestKarte({ d }: { d: PodestDaten }) {
  const farbe = MEDAILLE[d.platz - 1];
  const inhalt = (
    <>
      {d.bild ? <img src={d.bild} alt="" className="absolute inset-0 h-full w-full object-cover object-top transition duration-700 group-hover:scale-105" />
        : <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-sky-500/15 via-violet-500/10 to-transparent"><span className="text-8xl font-black text-white/10">{d.name.slice(0, 2).toUpperCase()}</span></div>}
      <div className="absolute inset-0 bg-gradient-to-t from-[#06080f] via-[#06080f]/30 via-45% to-transparent" />
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: farbe }} />
      <span className="absolute left-2.5 top-1.5 text-4xl font-black sm:left-4 sm:top-3 sm:text-6xl drop-shadow-lg" style={{ color: farbe }}>{d.platz}</span>
      {d.land && <img src={flagge(d.land)} alt="" className="absolute right-2.5 top-2.5 h-5 w-5 rounded-full object-cover ring-2 ring-white/30 sm:right-4 sm:top-4 sm:h-8 sm:w-8" />}
      <div className="absolute inset-x-0 bottom-0 p-2.5 sm:p-5">
        <p className="truncate text-sm font-bold text-white sm:text-xl">{d.name}</p>
        {d.unter && <p className="hidden truncate text-xs text-white/55 sm:block">{d.unter}</p>}
        <p className="mt-1 truncate text-[8px] font-semibold uppercase tracking-[0.2em] text-white/55 sm:mt-3 sm:text-[10px] sm:tracking-[0.25em]">{d.label}</p>
        <div className="flex items-end justify-between gap-2">
          <p className="text-base font-extrabold tabular-nums text-white sm:text-3xl">{d.wert}</p>
          {d.rechts && <span className="hidden sm:block">{d.rechts}</span>}
        </div>
        {d.extra && <p className="mt-1 hidden text-xs text-white/55 sm:block">{d.extra}</p>}
      </div>
    </>
  );
  const klasse = 'group relative block aspect-[4/5] overflow-hidden rounded-3xl';
  return (
    <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: d.platz === 1 ? 0.1 : 0.25, duration: 0.55 }} whileHover={{ y: -6 }}
      className={d.platz === 1 ? 'w-full min-w-0 max-w-[300px]' : 'mt-6 w-full min-w-0 max-w-[260px] sm:mt-10'}>
      {d.link ? <Link to={d.link} className={klasse}>{inhalt}</Link> : <div className={klasse}>{inhalt}</div>}
    </motion.div>
  );
}

/** Drei Podest-Karten nebeneinander, Platz 1 in der Mitte. */
export function Treppchen({ plaetze }: { plaetze: Array<PodestDaten | null | undefined> }) {
  const [eins, zwei, drei] = plaetze;
  return (
    <div className="flex items-start justify-center gap-2 sm:gap-6">
      {zwei && <PodestKarte d={zwei} />}
      {eins && <PodestKarte d={eins} />}
      {drei && <PodestKarte d={drei} />}
    </div>
  );
}
