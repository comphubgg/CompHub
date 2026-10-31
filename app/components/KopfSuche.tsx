'use client';

/*
 * Die Spielersuche als kleines, dezentes Feld oben rechts auf der Startseite, direkt unter der Kopfzeile.
 *
 * Betreiber (31.10.2026, zweite Notiz zu chef-14): "Die Suche gehoert NICHT in die Kopfzeile/Navigation - die Lupe dort bitte wieder
 * entfernen. Gewuenscht ist ein kleines, unauffaelliges Suchfeld auf der Seite selbst, oben rechts direkt unter der Kopfzeile (ueber dem
 * Hintergrund der Startseite). Klein, dezent, nicht fett - es soll nicht ins Auge springen."
 *
 * Betreiber (31.10.2026, zu chef-14): "Die Suche will ich, aber nicht so gross und fett mitten im Kopf der Startseite. Bitte klein und
 * unauffaellig oben rechts in der Kopfzeile (z. B. nur ein kleines Lupen-Symbol, das beim Klick die Suche oeffnet)." Ein Klick auf die
 * Lupe oeffnet darunter ein Feld; Escape oder ein Klick daneben schliesst es wieder. Ein Treffer oeffnet das Profil mit derselben Adresse, die die Statistikseite selbst schreibt: /statistics?spieler=<Anzeigename>.
 *
 * Ehrlichkeit: schlaegt die Anfrage fehl, steht "Suche gerade nicht erreichbar" da - nie "Kein Spieler gefunden", denn das waere eine Behauptung.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/app/components/SprachProvider';
import T from '@/app/components/T';
import SpielerPlatzhalter from '@/app/components/SpielerPlatzhalter';
import TeamFlagge from '@/components/TeamFlagge';

interface Treffer {
  epicId: string; name: string; anzeige?: string; land?: string | null;
  bild?: string | null; heimat?: string; regionen?: string[];
}

type Stand = 'leer' | 'laedt' | 'fertig' | 'fehler';

const MAX = 8;

export default function KopfSuche() {
  const t = useT();
  const router = useRouter();
  const listeId = useId();
  const [frage, setFrage] = useState('');
  const [treffer, setTreffer] = useState<Treffer[]>([]);
  const [stand, setStand] = useState<Stand>('leer');
  const [offen, setOffen] = useState(false);
  const [aktiv, setAktiv] = useState(-1);
  const feld = useRef<HTMLDivElement>(null);
  const eingabe = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = frage.trim();
    if (q.length < 2) return;
    const abbruch = new AbortController();
    const zeiger = setTimeout(async () => {
      try {
        const r = await fetch(`/api/szene-stats?ansicht=suche&q=${encodeURIComponent(q)}`, { signal: abbruch.signal });
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        if (!j || j.success === false || !Array.isArray(j.spieler)) throw new Error('Antwort');
        setTreffer((j.spieler as Treffer[]).slice(0, MAX));
        setAktiv(-1);
        setStand('fertig');
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        setTreffer([]);
        setStand('fehler');
      }
    }, 250);
    return () => { clearTimeout(zeiger); abbruch.abort(); };
  }, [frage]);

  // Ein Klick ausserhalb schliesst die Liste.
  useEffect(() => {
    const aus = (e: PointerEvent) => { if (!feld.current?.contains(e.target as Node)) { setOffen(false); } };
    document.addEventListener('pointerdown', aus);
    return () => document.removeEventListener('pointerdown', aus);
  }, []);

  const oeffne = (sp: Treffer) => {
    setOffen(false); setFrage(''); eingabe.current?.blur(); setStand('leer'); setTreffer([]);
    router.push(`/statistics?spieler=${encodeURIComponent(sp.anzeige || sp.name)}`);
  };

  const zeigeListe = offen && stand !== 'leer';

  return (
    <div ref={feld} className="relative text-left">
      <div className="relative">
        <input ref={eingabe}
          type="search" role="combobox" aria-expanded={zeigeListe} aria-controls={listeId} aria-autocomplete="list"
          aria-activedescendant={aktiv >= 0 ? `${listeId}-${aktiv}` : undefined}
          aria-label={t('Spieler suchen — Namen eintippen')}
          autoComplete="off" autoCorrect="off" spellCheck={false}
          value={frage}
          onChange={(e) => { setFrage(e.target.value); setOffen(true); setStand(e.target.value.trim().length >= 2 ? 'laedt' : 'leer'); }}
          onFocus={() => setOffen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && treffer.length) {
              e.preventDefault(); setOffen(true); setAktiv((a) => (a + 1) % treffer.length);
            } else if (e.key === 'ArrowUp' && treffer.length) {
              e.preventDefault(); setOffen(true); setAktiv((a) => (a <= 0 ? treffer.length - 1 : a - 1));
            } else if (e.key === 'Enter') {
              const sp = treffer[aktiv >= 0 ? aktiv : 0];
              if (zeigeListe && stand === 'fertig' && sp) { e.preventDefault(); oeffne(sp); }
            } else if (e.key === 'Escape') {
              setOffen(false); setAktiv(-1); eingabe.current?.blur();
            }
          }}
          placeholder={t('Spieler suchen …')}
          className="w-full rounded-lg border border-zinc-800/80 bg-zinc-950/60 py-1.5 pl-8 pr-8 text-sm font-normal text-slate-300 outline-none
                     backdrop-blur placeholder:text-slate-500 focus:border-sky-500 focus:bg-zinc-950 [&::-webkit-search-cancel-button]:appearance-none" />
        <svg className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" width="14" height="14" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" />
        </svg>
        {stand === 'laedt' && (
          <span role="status" aria-label={t('Suche läuft')}
            className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin rounded-full border-2 border-zinc-600 border-t-sky-500" />
        )}
      </div>

      {zeigeListe && (
        <div className="absolute right-0 z-40 mt-2 w-[min(92vw,24rem)] overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl">
          {stand === 'fehler' && (
            <p role="alert" className="px-4 py-3 text-sm text-slate-300"><T>Suche gerade nicht erreichbar</T></p>
          )}
          {stand === 'fertig' && treffer.length === 0 && (
            <p className="px-4 py-3 text-sm text-slate-400"><T>Kein Spieler gefunden</T></p>
          )}
          {treffer.length > 0 && (
            <ul id={listeId} role="listbox">
              {treffer.map((sp, i) => {
                const region = sp.heimat || sp.regionen?.[0] || '';
                return (
                  <li key={sp.epicId} id={`${listeId}-${i}`} role="option" aria-selected={i === aktiv}>
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => oeffne(sp)} onMouseEnter={() => setAktiv(i)}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${i === aktiv ? 'bg-zinc-800' : 'hover:bg-zinc-900'}`}>
                      <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-zinc-900">
                        {sp.bild ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={sp.bild} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover object-top" />
                        ) : (
                          <SpielerPlatzhalter name={sp.anzeige || sp.name} />
                        )}
                      </span>
                      <TeamFlagge groesse={16} laender={[sp.land ?? undefined]} />
                      <span className="min-w-0 flex-1 truncate text-base font-semibold text-slate-100">{sp.anzeige || sp.name}</span>
                      {region && <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-sky-500">{region}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
