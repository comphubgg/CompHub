import { motion } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Marke } from '../../../ds/Bausteine';
import { ART_NAME, MODUS_NAME, REGION_FARBE, REGION_NAME, cupLink, datum, modiVon, stufeName, tagKurz, type Cup, type Lage } from './gemeinsam';

/*
 * Gemeinsame Teile aller Cup-Ansichten (Uebersicht, Events, Cup-Seite) im Design-System 3.0:
 *   <CupBild>     das Banner eines Cups; fehlt es, ein Plakat aus Cup-Farbe und Titel (kein leerer Kasten)
 *   <CupKarte>    die Karte eines Cups: Banner 16:9 oben, fester dunkler Teil unten (Art, Titel, Spieltag, Regionen, Zeit)
 *   <RegionMarke> Region mit ihrem Farbpunkt
 *   <Uhrwerk>     Countdown in Kacheln (Tage ab 24 h)
 *   <Hochkant>    Spielerfoto im Hochformat - ohne Foto gar nichts (Betreiber: "Profilbild oder gar nichts")
 *   <TeamFotos>   die Fotos eines Teams nebeneinander - nur wenn JEDER im Team eines hat
 */

const SANFT = [0.22, 1, 0.36, 1] as const;

/** Plakat fuer Cups ohne Banner: Farbe des Cups, sein Titel gross und leise. */
function Plakat({ c, className = '' }: { c: Pick<Cup, 'titel' | 'farbe'>; className?: string }) {
  const farbe = c.farbe || 'rgb(var(--akz))';
  return (
    <div className={`overflow-hidden bg-fl ${className}`} aria-hidden>
      <div className="absolute inset-0" style={{ background: `radial-gradient(120% 130% at 0% 0%, ${farbe}, transparent 62%)`, opacity: 0.45 }} />
      <div className="absolute inset-0 opacity-[0.1]" style={{ backgroundImage: 'repeating-linear-gradient(115deg, rgba(255,255,255,.7) 0 1px, transparent 1px 22px)' }} />
      <p className="titel absolute inset-x-4 top-[18%] line-clamp-2 text-[15cqw] leading-[0.82] !text-white/[0.14]">{c.titel.split(/[·(]/)[0]}</p>
    </div>
  );
}

/** Das Banner eines Cups (fuellt seinen Kasten, der Kasten gibt das Format vor). */
export function CupBild({ c, className = '', lage }: { c: Pick<Cup, 'titel' | 'farbe' | 'bild'>; className?: string; lage?: string }) {
  const [kaputt, setKaputt] = useState(false);
  useEffect(() => setKaputt(false), [c.bild]);
  if (!c.bild || kaputt) return <Plakat c={c} className={`absolute inset-0 [container-type:inline-size] ${className}`} />;
  return <img src={c.bild} alt="" loading="lazy" draggable={false} onError={() => setKaputt(true)} style={lage ? { objectPosition: lage } : undefined} className={`absolute inset-0 h-full w-full object-cover ${className}`} />;
}

export function RegionMarke({ r, klein, zeit }: { r: string; klein?: boolean; zeit?: string }) {
  const farbe = REGION_FARBE[r] ?? '#94a3b8';
  return (
    <span title={REGION_NAME[r] ?? r} className={`inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.04] ${klein ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]'} font-bold uppercase tracking-wider text-white/85`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: farbe, boxShadow: `0 0 8px ${farbe}` }} />{r}
      {zeit && <span className="zahl font-medium normal-case tracking-normal text-white/50">{zeit}</span>}
    </span>
  );
}

export function LiveMarke({ text = 'Live' }: { text?: string }) {
  return <Marke ton="rot" puls>{text}</Marke>;
}

/** Wird von den alten Ansichten noch gebraucht, bis sie neu gebaut sind. */
export const knopf = (an: boolean) => `chip ${an ? 'chip-an' : ''}`;

/** Countdown in Kacheln: Tage (ab 24 h), Stunden, Minuten, Sekunden. `ton`: rot fuer "endet in", akz fuer "startet in". */
export function Uhrwerk({ ms, ton = 'akz', klein = false }: { ms: number; ton?: 'akz' | 'rot'; klein?: boolean }) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const teile: Array<[number, string]> = [[Math.floor(s / 86400), 'days'], [Math.floor((s % 86400) / 3600), 'hrs'], [Math.floor((s % 3600) / 60), 'min'], [s % 60, 'sec']];
  const zeigen = teile[0][0] > 0 ? teile : teile.slice(1);
  return (
    <div className="flex items-stretch gap-1.5" role="timer">
      {zeigen.map(([n, e]) => (
        <div key={e} className={`rounded-xl border border-white/[0.08] bg-black/60 text-center backdrop-blur ${klein ? 'min-w-[44px] px-2 py-1.5' : 'min-w-[58px] px-2.5 py-2 sm:min-w-[70px] sm:px-3'}`}>
          <p className={`titel zahl ${klein ? 'text-3xl' : 'text-4xl sm:text-5xl'} ${ton === 'rot' ? '!text-red-300' : ''}`}>{String(n).padStart(2, '0')}</p>
          <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.25em] text-white/40">{e}</p>
        </div>
      ))}
    </div>
  );
}

export interface FotoSpieler { id: string; name: string; anzeige?: string | null; img?: string | null }
export const spielerName = (p: { anzeige?: string | null; name: string }) => p.anzeige || p.name;

/** Spielerfoto hochkant mit Link zum Profil. Ohne Foto: nichts. `mass` z. B. "h-12 w-9". */
export function Hochkant({ p, mass = 'h-12 w-9', rund = 'rounded-lg' }: { p: FotoSpieler; mass?: string; rund?: string }) {
  const [kaputt, setKaputt] = useState(false);
  if (!p.img || kaputt) return null;
  return (
    <Link to={`/competitive/player/${p.id}`} title={spielerName(p)} onClick={(e) => e.stopPropagation()} className={`group/f relative block shrink-0 overflow-hidden bg-white/[0.05] ring-1 ring-white/10 ${mass} ${rund}`}>
      <img src={p.img} alt="" loading="lazy" onError={() => setKaputt(true)} className="h-full w-full object-cover object-top transition duration-500 group-hover/f:scale-110" />
    </Link>
  );
}

/** Die Fotos eines Teams nebeneinander - nur wenn jeder eines hat (sonst keine, Betreiber). */
export function TeamFotos({ spieler, mass, rund }: { spieler: FotoSpieler[]; mass?: string; rund?: string }) {
  if (!spieler.length || !spieler.every((p) => p.img)) return null;
  return <div className="flex shrink-0 gap-1">{spieler.map((p) => <Hochkant key={p.id} p={p} mass={mass} rund={rund} />)}</div>;
}

/** Die Namen eines Teams als Links, mit Punkt getrennt. */
export function TeamNamen({ spieler, className = '' }: { spieler: FotoSpieler[]; className?: string }) {
  return (
    <span className={className}>
      {spieler.map((p, i) => (
        <span key={p.id}>{i > 0 && <span className="text-white/25"> · </span>}<Link to={`/competitive/player/${p.id}`} onClick={(e) => e.stopPropagation()} className="transition hover:text-akz">{spielerName(p)}</Link></span>
      ))}
    </span>
  );
}

/** Art und Spielart eines Cups als Marken (Battle Royale ist der Normalfall und steht nicht da). */
export function CupMarken({ c }: { c: Cup }) {
  return (
    <>
      <Marke>{ART_NAME[c.art] ?? 'Cup'}</Marke>
      {[...modiVon(c)].filter((m) => m !== 'br').map((m) => <Marke key={m}>{MODUS_NAME[m]}</Marke>)}
    </>
  );
}

/**
 * Die Karte eines Cups. Banner 16:9 oben (Live-Marke, Spielart, Countdown in der Ecke), unten fest und dunkel: Art, Titel, Spieltag, Regionen und
 * wann. Ueberall gleich gross und gleich aufgebaut (Betreiber: einheitliche Kacheln). `dauerText` liefert den Countdown (tickt beim Aufrufer).
 */
export function CupKarte({ c, lage, dauerText, verz = 0, zeiten, children }: {
  c: Cup; lage: Lage; dauerText?: string; verz?: number;
  /** Startzeiten je Region statt blosser Regionsmarken. */
  zeiten?: Array<{ r: string; zeit: string }>; children?: ReactNode;
}) {
  const f = lage.fenster;
  const regionen = lage.wo.length ? lage.wo : Object.keys(c.regionen);
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-30px' }} transition={{ delay: verz, duration: 0.45, ease: SANFT }} className="h-full">
      <Link to={cupLink(c, f)} className="fl-fest fl-klick group flex h-full flex-col overflow-hidden">
        <div className="relative aspect-video shrink-0 overflow-hidden">
          <CupBild c={c} className="transition duration-700 group-hover:scale-[1.06]" />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-fl to-transparent" />
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            {lage.status === 'live' && <LiveMarke />}
            {[...modiVon(c)].filter((m) => m !== 'br').map((m) => <Marke key={m}>{MODUS_NAME[m]}</Marke>)}
          </div>
          {dauerText && <span className={`zahl absolute right-3 top-3 rounded-lg bg-black/75 px-2.5 py-1 text-xs font-bold backdrop-blur ${lage.status === 'live' ? 'text-red-300' : 'text-akz'}`}>{dauerText}</span>}
        </div>
        <div className="flex flex-1 flex-col px-4 pb-4 pt-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-akz/90">{ART_NAME[c.art] ?? 'Cup'}</p>
          <h3 className="mt-0.5 line-clamp-1 text-[15px] font-bold leading-snug text-white">{c.titel}</h3>
          <p className="line-clamp-1 text-xs text-white/45">{f ? stufeName(f) : c.untertitel ?? ''}{f?.matchCap ? ` · ${f.matchCap} matches` : ''}</p>
          <div className="mt-auto flex flex-wrap items-center gap-1 pt-3">
            {zeiten ? zeiten.map((z) => <RegionMarke key={z.r + z.zeit} r={z.r} zeit={z.zeit} klein />)
              : regionen.length >= 6 ? <span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/60">All {regionen.length} regions</span>
                : regionen.map((r) => <RegionMarke key={r} r={r} klein />)}
            <span className="zahl ml-auto text-[11px] text-white/45">
              {lage.status === 'kommt' && lage.naechster ? datum(lage.naechster) : lage.status === 'vorbei' && lage.letzter ? `Finished ${tagKurz(lage.letzter)}` : ''}
            </span>
          </div>
          {children}
        </div>
      </Link>
    </motion.div>
  );
}
