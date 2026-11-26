/** Platzhalter, solange ein Bereich noch gebaut wird. */
export default function Baustelle({ text = 'Wird gebaut …' }: { text?: string }) {
  return (
    <div className="grid h-full place-items-center bg-[#05070d]">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-sky-500/20 border-t-sky-400" />
        <p className="font-titel text-2xl tracking-[0.2em] text-slate-400">{text}</p>
      </div>
    </div>
  );
}
