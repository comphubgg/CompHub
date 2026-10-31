'use client';

/*
 * Die Spielersuche mitten auf der Startseite.
 *
 * Vorher musste man erst nach /statistics und dort das kleine Feld oben rechts finden. Dieselbe Suche (ansicht=suche) steht jetzt im Kopf der
 * Startseite. Ein Treffer oeffnet das Profil mit derselben Adresse, die die Statistikseite selbst schreibt: /statistics?spieler=<Anzeigename>.
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

export default function StartSuche() {
  const t = useT();
  const router = useRouter();
  const listeId = useId();
  const [frage, setFrage] = useState('');
  const [treffer, setTreffer] = useState<Treffer[]>([]);
  const [stand, setStand] = useState<Stand>('leer');
  const [offen, setOffen] = useState(false);
  const [aktiv, setAktiv] = useState(-1);
  const feld = useRef<HTMLDivElement>(null);

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
    const aus = (e: PointerEvent) => { if (!feld.current?.contains(e.target as Node)) setOffen(false); };
    document.addEventListener('pointerdown', aus);
    return () => document.removeEventListener('pointerdown', aus);
  }, []);

  const oeffne = (sp: Treffer) => {
    setOffen(false);
    router.push(`/statistics?spieler=${encodeURIComponent(sp.anzeige || sp.name)}`);
  };

  const zeigeListe = offen && stand !== 'leer';

  return (
    <div ref={feld} className="relative mx-auto mt-6 w-full max-w-xl text-left">
      <div className="relative">
        <input
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
              setOffen(false); setAktiv(-1);
            }
          }}
          placeholder={t('Spieler suchen — Namen eintippen')}
          className="w-full rounded-2xl border border-zinc-700 bg-zinc-950/60 py-4 pl-5 pr-12 text-base text-slate-100 shadow-lg outline-none
                     backdrop-blur placeholder:text-slate-500 focus:border-sky-500 sm:text-lg [&::-webkit-search-cancel-button]:appearance-none" />
        {stand === 'laedt' && (
          <span role="status" aria-label={t('Suche läuft')}
            className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin rounded-full border-2 border-zinc-600 border-t-sky-500" />
        )}
      </div>

      {zeigeListe && (
        <div className="absolute left-0 right-0 z-40 mt-2 overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl">
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
