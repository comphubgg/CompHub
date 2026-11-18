'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import {
  ADMIN_GRUPPEN, ADMIN_WERKZEUGE, aktivesWerkzeug, pfadVon, type AdminGruppe, type AdminWerkzeug,
} from '@/lib/adminTools';

/*
 * The sidebar of every admin page (operator, 18.11.2026) - replaces the pill bar on top, which overflowed ("you can't even see all entries").
 *
 * Wide: a column on the left, sticky under the header, collapsible to a narrow rail (the browser remembers it). Narrow: a bar with the current tool on
 * top; it opens the same list as a drawer. At the top a search ("/" focuses it, Enter opens the first hit) and "Recently used" (this browser only).
 * Everything comes from lib/adminTools.ts - the cards on /admin use the same list.
 *
 * Only for the admin (AdminRahmen decides); a manager keeps the pages without it, as before.
 */

const ZULETZT = 'comphub-admin-zuletzt';
const ZU = 'comphub-admin-leiste-zu';
const lies = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const schreib = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ohne Speicher */ } };

/** Notify the dashboard (app/admin/page.tsx) that an area of /admin was chosen - it switches without reloading. */
export const BEREICH_WAHL = 'comphub-admin-bereich-wahl';
/** The dashboard reports the area it now shows (it writes it into the address with replaceState, which nobody hears). */
export const BEREICH_GEZEIGT = 'comphub-admin-bereich';

const GRUPPE = new Map(ADMIN_GRUPPEN.map((g) => [g.id, g]));

/** Lower case without accents, so "zugange" finds "Zugänge" and "loot routen" finds "Loot-Routen". */
const flach = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[-_/&.,]+/g, ' ');

function Eintrag({ w, g, aktiv, zahl, schmal, onWahl, onDrueck }: {
  w: AdminWerkzeug; g: AdminGruppe; aktiv: boolean; zahl?: number; schmal?: boolean;
  onWahl: (w: AdminWerkzeug, e: MouseEvent) => void; onDrueck?: () => void;
}) {
  const t = useT();
  return (
    <Link href={w.href} prefetch={false} aria-current={aktiv ? 'page' : undefined} title={schmal ? t(w.titel) : t(w.text)}
      data-admin-werkzeug={w.href}
      onClick={(e) => { onWahl(w, e); onDrueck?.(); }}
      className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition ${
        aktiv ? `${g.aktiv} font-semibold` : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-100'}`}>
      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${g.punkt} ${aktiv ? '' : 'opacity-50 group-hover:opacity-100'}`} />
      <span className="min-w-0 flex-1 truncate"><T>{w.titel}</T></span>
      {!!zahl && (
        <span className="shrink-0 rounded-full bg-rose-500 px-1.5 py-px text-[10px] font-bold tabular-nums text-white" title={t('offene Meldungen')}>{zahl}</span>
      )}
    </Link>
  );
}

function Liste({ aktiv, zahlen, zuletzt, onWahl, onDrueck }: {
  aktiv: AdminWerkzeug | null; zahlen: Record<string, number>; zuletzt: string[];
  onWahl: (w: AdminWerkzeug, e: MouseEvent) => void; onDrueck?: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const [filter, setFilter] = useState('');
  const feld = useRef<HTMLInputElement>(null);
  // "/" anywhere (outside a text field) jumps into the search - only the visible list listens.
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const ziel = e.target as HTMLElement | null;
      if (ziel && (ziel.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(ziel.tagName))) return;
      if (!feld.current || feld.current.offsetParent === null) return;
      e.preventDefault(); feld.current.focus();
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, []);

  const treffer = useMemo(() => {
    const q = flach(filter.trim());
    if (!q) return null;
    const woerter = q.split(/\s+/).filter(Boolean);
    return ADMIN_WERKZEUGE.filter((w) => {
      const g = GRUPPE.get(w.gruppe)!;
      const heu = flach([w.titel, t(w.titel), w.text, t(w.text), g.titel, t(g.titel), w.href, w.stichworte ?? ''].join(' '));
      return woerter.every((x) => heu.includes(x));
    });
  }, [filter, t]);

  // The current page is highlighted below anyway - "Recently used" shows the ones before it.
  const zuletztListe = zuletzt.filter((h) => h !== aktiv?.href)
    .map((h) => ADMIN_WERKZEUGE.find((w) => w.href === h)).filter((w): w is AdminWerkzeug => !!w).slice(0, 4);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
        <input ref={feld} type="search" value={filter} onChange={(e) => setFilter(e.target.value)} data-admin-suche
          placeholder={t('Werkzeug suchen …')} aria-label={t('Werkzeug suchen')}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setFilter(''); (e.target as HTMLInputElement).blur(); }
            if (e.key === 'Enter' && treffer?.[0]) {
              e.preventDefault();
              const w = treffer[0];
              if (pfadVon(w.href) === '/admin' && window.location.pathname === '/admin') {
                window.dispatchEvent(new CustomEvent(BEREICH_WAHL, { detail: new URLSearchParams(w.href.split('?')[1] ?? '').get('bereich') ?? 'start' }));
              } else router.push(w.href);
              setFilter(''); onDrueck?.();
            }
          }}
          className="w-full rounded-lg border border-zinc-800 bg-zinc-950 py-1.5 pl-8 pr-8 text-[13px] text-slate-100 placeholder:text-slate-500" />
        {!filter && <kbd aria-hidden className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-zinc-700 px-1 text-[10px] text-slate-500 lg:block">/</kbd>}
      </div>

      {treffer ? (
        <div data-admin-treffer={treffer.length}>
          {treffer.length === 0
            ? <p className="px-2.5 py-2 text-xs text-slate-500"><T>Kein Werkzeug gefunden.</T></p>
            : treffer.map((w) => (
              <Eintrag key={w.href} w={w} g={GRUPPE.get(w.gruppe)!} aktiv={aktiv?.href === w.href} zahl={w.zaehler ? zahlen[w.zaehler] : undefined}
                onWahl={(x, e) => { onWahl(x, e); setFilter(''); }} onDrueck={onDrueck} />
            ))}
        </div>
      ) : (
        <>
          {zuletztListe.length > 0 && (
            <div>
              <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500"><T>Zuletzt benutzt</T></p>
              {zuletztListe.map((w) => (
                <Eintrag key={`z-${w.href}`} w={w} g={GRUPPE.get(w.gruppe)!} aktiv={false} zahl={w.zaehler ? zahlen[w.zaehler] : undefined} onWahl={onWahl} onDrueck={onDrueck} />
              ))}
            </div>
          )}
          {ADMIN_GRUPPEN.map((g) => (
            <div key={g.id} data-admin-gruppe={g.id}>
              <p className="mb-1 flex items-center gap-2 px-2.5 text-[10px] font-semibold uppercase tracking-[0.16em]">
                <span aria-hidden className={`h-2 w-2 rounded-full ${g.punkt}`} />
                <span className={g.titelFarbe}><T>{g.titel}</T></span>
              </p>
              {ADMIN_WERKZEUGE.filter((w) => w.gruppe === g.id).map((w) => (
                <Eintrag key={w.href} w={w} g={g} aktiv={aktiv?.href === w.href} zahl={w.zaehler ? zahlen[w.zaehler] : undefined} onWahl={onWahl} onDrueck={onDrueck} />
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export default function AdminSeitenleiste() {
  const t = useT();
  const pfad = usePathname() ?? '';
  const [suche, setSuche] = useState('');
  const [zu, setZu] = useState(false);
  const [offen, setOffen] = useState(false);
  const [zahlen, setZahlen] = useState<Record<string, number>>({});

  // The ?bereich= of /admin: from the address after every page change, and from the dashboard when it switches by itself.
  useEffect(() => { setSuche(window.location.search); }, [pfad]);
  useEffect(() => {
    const neu = () => setSuche(window.location.search);
    window.addEventListener(BEREICH_GEZEIGT, neu);
    window.addEventListener('popstate', neu);
    return () => { window.removeEventListener(BEREICH_GEZEIGT, neu); window.removeEventListener('popstate', neu); };
  }, []);
  useEffect(() => { setZu(lies(ZU) === '1'); }, []);

  const aktiv = aktivesWerkzeug(pfad, suche);

  // Recently used: the current tool goes to the front (max. 6 kept; shown are up to 4 besides the current one).
  const [zuletzt, setZuletzt] = useState<string[]>([]);
  useEffect(() => {
    let alt: string[] = [];
    try { const l = JSON.parse(lies(ZULETZT) ?? '[]'); if (Array.isArray(l)) alt = l.filter((x): x is string => typeof x === 'string'); } catch { /* leer */ }
    const liste = aktiv ? [aktiv.href, ...alt.filter((h) => h !== aktiv.href)].slice(0, 6) : alt;
    schreib(ZULETZT, JSON.stringify(liste));
    setZuletzt(liste);
  }, [aktiv?.href]); // eslint-disable-line react-hooks/exhaustive-deps

  // Badges: open contact messages (/api/kontakt?zaehlen=1), every five minutes.
  const zaehlen = useCallback(() => {
    fetch('/api/kontakt?zaehlen=1', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { offen?: number } | null) => { if (typeof j?.offen === 'number') setZahlen((z) => ({ ...z, kontakt: j.offen! })); })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    zaehlen();
    const uhr = window.setInterval(zaehlen, 5 * 60_000);
    return () => window.clearInterval(uhr);
  }, [zaehlen, pfad]);

  // Drawer: closes when an entry is chosen (onDrueck) and with Escape; no scrolling of the page behind it.
  useEffect(() => {
    if (!offen) return undefined;
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') setOffen(false); };
    window.addEventListener('keydown', taste);
    const vorher = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', taste); document.body.style.overflow = vorher; };
  }, [offen]);

  /** On /admin itself an area switches without loading the page again (the dashboard listens). */
  const onWahl = (w: AdminWerkzeug, e: MouseEvent) => {
    if (pfadVon(w.href) !== '/admin' || pfad !== '/admin' || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    window.dispatchEvent(new CustomEvent(BEREICH_WAHL, { detail: new URLSearchParams(w.href.split('?')[1] ?? '').get('bereich') ?? 'start' }));
  };

  const umschalten = () => setZu((z) => { schreib(ZU, z ? '0' : '1'); return !z; });
  const abmelden = () => { window.location.href = '/api/auth/logout'; };
  const g = aktiv ? GRUPPE.get(aktiv.gruppe) : null;

  return (
    <>
      {/* Narrow: one bar with the current tool; it opens the drawer. */}
      <div className="px-4 pt-3 lg:hidden">
        <button type="button" onClick={() => setOffen(true)} aria-expanded={offen} aria-controls="admin-schublade" data-admin-menue
          className="flex w-full items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/70 px-3.5 py-2.5 text-left text-sm font-semibold text-slate-200">
          <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500"><T>Admin</T></span>
          {aktiv && g && <span className="flex min-w-0 items-center gap-2"><span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${g.punkt}`} /><span className="truncate"><T>{aktiv.titel}</T></span></span>}
          {!!zahlen.kontakt && <span className="ml-auto shrink-0 rounded-full bg-rose-500 px-1.5 py-px text-[10px] font-bold text-white">{zahlen.kontakt}</span>}
        </button>
      </div>
      {offen && (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label={t('Admin-Werkzeuge')}>
          <button type="button" aria-label={t('Schließen')} onClick={() => setOffen(false)} className="absolute inset-0 bg-black/60" />
          <nav id="admin-schublade" aria-label={t('Admin-Werkzeuge')}
            className="absolute inset-y-0 left-0 flex w-[min(320px,86vw)] flex-col border-r border-zinc-800 bg-zinc-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <span className="text-sm font-extrabold text-slate-100"><T>Admin-Werkzeuge</T></span>
              <button type="button" onClick={() => setOffen(false)} aria-label={t('Schließen')}
                className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/[0.06] hover:text-slate-100">✕</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
              <Liste aktiv={aktiv} zahlen={zahlen} zuletzt={zuletzt} onWahl={onWahl} onDrueck={() => setOffen(false)} />
            </div>
            <button type="button" onClick={abmelden}
              className="border-t border-zinc-800 px-5 py-3 text-left text-[13px] font-semibold text-slate-400 hover:text-rose-400"><T>Abmelden</T></button>
          </nav>
        </div>
      )}

      {/* Wide: the column on the left, sticky under the header, scrolling by itself. */}
      <aside aria-label={t('Admin-Werkzeuge')} data-admin-leiste={zu ? 'zu' : 'auf'}
        className={`sticky top-[var(--admin-kopf,64px)] hidden h-[calc(100dvh-var(--admin-kopf,64px))] shrink-0 flex-col border-r border-zinc-800 bg-zinc-900 lg:flex ${zu ? 'w-14' : 'w-64'}`}>
        {zu ? (
          <div className="flex flex-1 flex-col items-center gap-3 py-3">
            <button type="button" onClick={umschalten} aria-label={t('Leiste aufklappen')} title={t('Leiste aufklappen')}
              className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-white/[0.06] hover:text-slate-100">»</button>
            {aktiv && g && <span title={t(aktiv.titel)} className={`h-2.5 w-2.5 rounded-full ${g.punkt}`} />}
            {!!zahlen.kontakt && (
              <Link href="/admin/contact" prefetch={false} title={t('offene Meldungen')}
                className="rounded-full bg-rose-500 px-1.5 py-px text-[10px] font-bold text-white">{zahlen.kontakt}</Link>
            )}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 py-3">
            <Liste aktiv={aktiv} zahlen={zahlen} zuletzt={zuletzt} onWahl={onWahl} />
          </div>
        )}
        <div className="flex flex-col gap-0.5 border-t border-zinc-800 p-2">
          {!zu && (
            <button type="button" onClick={abmelden}
              className="rounded-lg px-2.5 py-1.5 text-left text-[13px] font-medium text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-400"><T>Abmelden</T></button>
          )}
          {!zu && (
            <button type="button" onClick={umschalten} aria-label={t('Leiste einklappen')}
              className="rounded-lg px-2.5 py-1.5 text-left text-xs text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-300">« <T>Einklappen</T></button>
          )}
        </div>
      </aside>
    </>
  );
}
