import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bild, Marke } from '../../../ds/Bausteine';
import { kurz } from './daten';
import { useInselInfos, type Eintrag, type Rangliste } from './fn';

/*
 * Gemeinsame Teile der Live-Seiten (Design-System 3.0): das Insel-Thumbnail, die Insel-Karte (Bild oben, dunkler Teil unten), die Zeile einer
 * Rangliste und die ehrliche Quellenzeile. Thumbnails: zuerst das Bild aus /api/fn-entdecken, sonst /api/fn-inseln (epic/fn.ts) - gibt es
 * keines, bleibt die Flaeche ruhig (nie Buchstaben, nie ein hochgezogenes Mini-Bild).
 */

export const inselPfad = (code: string) => `/community/creative/${encodeURIComponent(code)}`;
export const vonWem = (e: Pick<Eintrag, 'epic' | 'creator'>) => (e.epic ? 'Epic Games' : e.creator ? `@${e.creator}` : '');

/** Thumbnail einer Insel (fuellt den Elternkasten). */
export function InselBild({ code, bild, className = '' }: { code: string; bild?: string | null; className?: string }) {
  const info = useInselInfos(bild ? [] : [code]);
  return <Bild src={bild ?? info(code)?.bild ?? null} className={`h-full w-full ${className}`} />;
}

/** Karte einer Insel: Bild 16:9, Platz oben links, Spieler oben rechts, unten Titel und Creator. Alle Karten eines Rasters sind gleich gebaut. */
export function InselKarte({ e, platz, verz = 0, unten, klein = false }: { e: Eintrag; platz?: number; verz?: number; unten?: ReactNode; klein?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-20px' }} transition={{ delay: verz, duration: 0.45, ease: [0.22, 1, 0.36, 1] }} className="fl-fest fl-klick group h-full overflow-hidden">
      <Link to={inselPfad(e.code)} className="block h-full">
        <div className="relative aspect-video overflow-hidden">
          <InselBild code={e.code} bild={e.bild} className="absolute inset-0 transition duration-700 group-hover:scale-[1.06]" />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-fl to-transparent" />
          {platz !== undefined && <span className={`titel absolute left-3 top-2 leading-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] ${klein ? 'text-3xl' : 'text-4xl'} ${platz === 1 ? 'text-amber-300' : 'text-white'}`}>{platz}</span>}
          {e.spieler > 0 && <div className="absolute right-3 top-3"><Marke ton="still" puls><span className="zahl text-white">{kurz(e.spieler)}</span></Marke></div>}
        </div>
        <div className="px-4 pb-4 pt-1">
          <p className={`truncate font-bold text-white ${klein ? 'text-sm' : 'text-[15px]'}`}>{e.titel}</p>
          <p className="truncate text-xs text-white/50">{vonWem(e) || <span className="font-mono">{e.code}</span>}</p>
          {unten}
        </div>
      </Link>
    </motion.div>
  );
}

/** Woher die Zahlen kommen und wie frisch sie sind - eine Zeile, nie eine ganze Karte. */
export function QuellenZeile({ r, className = '' }: { r: Rangliste; className?: string }) {
  if (r.laedt || !r.quelle) return <p className={`text-xs text-white/40 ${className}`}>Asking for live player numbers …</p>;
  if (r.quelle === 'seite') {
    const min = r.stand ? Math.max(0, Math.round((Date.now() - r.stand) / 60_000)) : null;
    return <p className={`flex items-center gap-2 text-xs text-white/45 ${className}`}><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Live from Fortnite's Discover{min === null ? '' : min < 1 ? ' · updated just now' : ` · updated ${min} min ago`}</p>;
  }
  if (!r.liste.length) return <p className={`flex items-center gap-2 text-xs text-amber-200/75 ${className}`}><span className="h-1.5 w-1.5 rounded-full bg-amber-300" />Live player numbers aren't answering right now – this fills in as soon as they do.</p>;
  return (
    <p className={`flex items-start gap-2 text-xs text-amber-200/75 ${className}`}>
      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300" />
      <span>Sample only: the live Discover feed isn't answering, so this shows {r.geprueft?.toLocaleString('en') ?? 0} of {r.von?.toLocaleString('en') ?? 0} islands from Epic's public list. Epic's own modes and the biggest islands are missing – don't read this as the real ranking.</span>
    </p>
  );
}

/** Anteil als feine Linie unter einer Zeile. */
export function AnteilLinie({ anteil }: { anteil: number }) {
  return <motion.span className="absolute bottom-0 left-0 h-px bg-akz/60" initial={{ width: 0 }} whileInView={{ width: `${Math.min(100, anteil * 100)}%` }} viewport={{ once: true }} transition={{ duration: 0.7 }} />;
}
