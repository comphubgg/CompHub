'use client';

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { ADMIN_GRUPPEN, ADMIN_WERKZEUGE, aktivesWerkzeug, pfadVon, type AdminWerkzeug } from '@/lib/adminTools';

/*
 * Die Leiste oben auf jeder Admin-Seite: alle Werkzeuge als Kapseln, wie vorher (14.10.2026) - aber umbrechend statt waagrecht scrollend.
 *
 * Betreiber, 18.11.2026: die Kapsel-Leiste lief ueber ("man sieht nicht alle Eintraege"); die Seitenleiste links, die sie kurz ersetzte, war ihm zu
 * verwirrend: "ich will es wie vorher. Nur dass die Seite fuer mich laenger ist - die Tools gehen weiter nach unten." Also: dieselben Kapseln, nach
 * Gruppen (kleiner Punkt + Name davor), die Reihen brechen um und die Seite wird laenger. Darueber ein Suchfeld, das die Kapseln filtert (Enter oeffnet
 * den ersten Treffer). Alles aus lib/adminTools.ts - dieselbe Liste wie die Kacheln im Dashboard.
 *
 * Nur fuer den Admin (AdminRahmen entscheidet); VIP (/vip) und Manager sehen sie nicht.
 */

/** Dem Dashboard (app/admin/page.tsx) sagen, dass ein Bereich von /admin gewaehlt wurde - es schaltet um, ohne neu zu laden. */
export const BEREICH_WAHL = 'comphub-admin-bereich-wahl';
/** Das Dashboard meldet den Bereich, den es jetzt zeigt (es schreibt ihn mit replaceState in die Adresse, das hoert sonst niemand). */
export const BEREICH_GEZEIGT = 'comphub-admin-bereich';

const GRUPPE = new Map(ADMIN_GRUPPEN.map((g) => [g.id, g]));
const flach = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[-_/&.,]+/g, ' ');
const bereichAus = (href: string) => new URLSearchParams(href.split('?')[1] ?? '').get('bereich') ?? 'start';

export default function AdminLeiste() {
  const t = useT();
  const router = useRouter();
  const pfad = usePathname() ?? '';
  const [suche, setSuche] = useState('');
  const [filter, setFilter] = useState('');
  const [kontakt, setKontakt] = useState(0);

  // Das ?bereich= von /admin: nach jedem Seitenwechsel aus der Adresse, und vom Dashboard, wenn es selbst umschaltet.
  useEffect(() => { setSuche(window.location.search); }, [pfad]);
  useEffect(() => {
    const neu = () => setSuche(window.location.search);
    window.addEventListener(BEREICH_GEZEIGT, neu);
    window.addEventListener('popstate', neu);
    return () => { window.removeEventListener(BEREICH_GEZEIGT, neu); window.removeEventListener('popstate', neu); };
  }, []);
  const aktiv = aktivesWerkzeug(pfad, suche);

  // Offene Kontakt-Meldungen (/api/kontakt?zaehlen=1), alle fuenf Minuten.
  const zaehlen = useCallback(() => {
    fetch('/api/kontakt?zaehlen=1', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { offen?: number } | null) => { if (typeof j?.offen === 'number') setKontakt(j.offen); })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    zaehlen();
    const uhr = window.setInterval(zaehlen, 5 * 60_000);
    return () => window.clearInterval(uhr);
  }, [zaehlen, pfad]);

  const treffer = useMemo(() => {
    const q = flach(filter.trim());
    if (!q) return null;
    const woerter = q.split(/\s+/).filter(Boolean);
    return new Set(ADMIN_WERKZEUGE.filter((w) => {
      const g = GRUPPE.get(w.gruppe)!;
      const heu = flach([w.titel, t(w.titel), w.text, t(w.text), g.titel, t(g.titel), w.href, w.stichworte ?? ''].join(' '));
      return woerter.every((x) => heu.includes(x));
    }).map((w) => w.href));
  }, [filter, t]);

  /** Auf /admin selbst schaltet ein Bereich um, ohne die Seite neu zu laden (das Dashboard hoert zu). */
  const oeffne = (w: AdminWerkzeug, e?: MouseEvent) => {
    const hier = pfadVon(w.href) === '/admin' && pfad === '/admin';
    if (e && (!hier || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0)) return;
    e?.preventDefault();
    if (hier) window.dispatchEvent(new CustomEvent(BEREICH_WAHL, { detail: bereichAus(w.href) }));
    else router.push(w.href);
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 pt-4">
      <nav aria-label={t('Admin-Werkzeuge')} data-admin-leiste
        className="rounded-3xl border border-zinc-800 bg-zinc-900 p-2.5 shadow-[0_6px_20px_rgba(15,23,42,.14)]">
        <div className="relative mb-2">
          <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
          <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} data-admin-suche
            placeholder={t('Werkzeug suchen …')} aria-label={t('Werkzeug suchen')}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setFilter('');
              if (e.key === 'Enter' && treffer?.size) {
                e.preventDefault();
                const w = ADMIN_WERKZEUGE.find((x) => treffer.has(x.href));
                if (w) { setFilter(''); oeffne(w); }
              }
            }}
            className="w-full rounded-full border border-zinc-800 bg-zinc-950 py-1.5 pl-8 pr-3 text-xs text-slate-100 placeholder:text-slate-500 sm:max-w-xs" />
        </div>
        {treffer && treffer.size === 0 && <p className="px-2 py-1 text-xs text-slate-500"><T>Kein Werkzeug gefunden.</T></p>}
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
          {ADMIN_GRUPPEN.map((g) => {
            const liste = ADMIN_WERKZEUGE.filter((w) => w.gruppe === g.id && (!treffer || treffer.has(w.href)));
            if (!liste.length) return null;
            return (
              <span key={g.id} data-admin-gruppe={g.id} className="contents">
                <span className="ml-1.5 mr-0.5 flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]">
                  <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${g.punkt}`} />
                  <span className={g.titelFarbe}><T>{g.titel}</T></span>
                </span>
                {liste.map((w) => {
                  const an = aktiv?.href === w.href;
                  return (
                    <Link key={w.href} href={w.href} prefetch={false} title={t(w.text)} aria-current={an ? 'page' : undefined}
                      data-admin-werkzeug={w.href} onClick={(e) => oeffne(w, e)}
                      className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition ${
                        an ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:bg-zinc-800 hover:text-slate-100'}`}>
                      <T>{w.titel}</T>
                      {w.zaehler === 'kontakt' && kontakt > 0 && (
                        <span className="rounded-full bg-rose-500 px-1.5 py-px text-[10px] font-bold tabular-nums text-white" title={t('offene Meldungen')}>{kontakt}</span>
                      )}
                    </Link>
                  );
                })}
              </span>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
