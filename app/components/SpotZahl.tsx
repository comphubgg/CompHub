/*
 * Wie viele Personen auf einer Stelle der Karte stehen (Betreiber, 21.10.2026: "bei jeder Map - Solos, Tournament Maps, ueberall - soll stehen, wie viele Personen auf einem Spot sind").
 *
 * Ein kleines Zeichen in der oberen rechten Ecke der Stelle: eine Person und die Zahl. Es sitzt im Beschriftungskasten der Stelle (der die Groesse der Form hat und
 * absolut liegt) und rechnet seine Schrift gegen --z, bleibt also beim Zoomen auf dem Bildschirm gleich gross - wie die Namen.
 */
export default function SpotZahl({ n }: { n: number }) {
  if (!n || n < 2) return null;   // Eine Person steht mit ihrem Namen da - die Zahl hilft erst, wo es mehr sind.
  return (
    <span aria-hidden title={`${n}`} className="karten-zahl pointer-events-none absolute right-0 top-0 z-20 -translate-y-1/3 translate-x-1/4">
      <span className="inline-flex items-center gap-[0.25em] rounded-full bg-zinc-950/90 px-[0.6em] py-[0.18em] font-extrabold leading-none text-white shadow-md ring-1 ring-sky-400/80"
        style={{ fontSize: 'calc(1.15cqw / var(--z, 1))' }}>
        <svg viewBox="0 0 24 24" className="h-[1em] w-[1em] fill-current text-sky-300" aria-hidden>
          <circle cx="12" cy="7.5" r="4.2" />
          <path d="M3.5 21c0-4.7 3.8-8 8.5-8s8.500 3.300 8.500 8z" />
        </svg>
        <span className="tabular-nums">{n}</span>
      </span>
    </span>
  );
}
