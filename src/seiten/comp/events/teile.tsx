import { REGION_FARBE } from './gemeinsam';

/* Kleine Marken der Events-Seiten: Region, Live, Umschaltknopf. */

export function RegionMarke({ r, klein }: { r: string; klein?: boolean }) {
  const farbe = REGION_FARBE[r] ?? '#94a3b8';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 ${klein ? 'py-0.5 text-[10px]' : 'py-1 text-xs'} font-semibold uppercase tracking-wider`}
      style={{ borderColor: `${farbe}55`, color: farbe, background: `${farbe}12` }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: farbe }} />{r}
    </span>
  );
}

export function LiveMarke() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white shadow-lg shadow-rose-500/30">
      <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" /></span>Live
    </span>
  );
}

export const knopf = (an: boolean) => `rounded-full px-3 py-1.5 text-xs font-semibold transition ${an ? 'bg-sky-400 text-[#06080f] shadow shadow-sky-500/30' : 'text-white/60 hover:bg-white/5 hover:text-white'}`;
