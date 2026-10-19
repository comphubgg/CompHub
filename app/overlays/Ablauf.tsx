'use client';

import { useState, type ReactNode } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { MeineListe } from './Teile';
import { overlayAdresse, type OverlayEintrag } from './OverlayGeruest';

/*
 * Der neue Einstellungsablauf der Overlays - ein Weg in Schritten statt eine lange Seite voller Regler.
 *
 * Der Betreiber (19.10.2026): "Overlays: Einstellungsablauf komplett neu, nicht nur Optik" - und frueher: fertige Vorlagen statt vieler Einzelregler.
 * Deshalb vier Schritte, die der Reihe nach sinnvoll sind (eine echte Folge, darum nummeriert):
 *
 *   1 Was zeigen   - der Cup und welche Plaetze
 *   2 Vorlage      - ein fertiger Look aus mehreren, jede mit ihrer echten Vorschau (ein Klick, kein Regler)
 *   3 Feinschliff  - die Einzelregler, fuer wen sie wollen; ohne sie ist man schon fertig
 *   4 Fertig       - benennen, speichern, die Adresse fuer OBS kopieren - mit den vier Handgriffen in OBS dazu
 *
 * Die Vorschau oben bleibt stehen und folgt jeder Aenderung. Alles, was gespeichert wird, bleibt wie bisher in /api/overlay-config - der Ablauf aendert
 * nur, in welcher Reihenfolge und wie uebersichtlich man dorthin kommt.
 */

export interface AblaufSchritt {
  schluessel: string;
  titel: string;
  /** Ein Satz unter der Ueberschrift: was in diesem Schritt zu tun ist. */
  hinweis: string;
  inhalt: ReactNode;
}

export default function Ablauf({ schritte, start = 0 }: { schritte: AblaufSchritt[]; start?: number }) {
  const [aktuell, setAktuell] = useState(Math.min(start, schritte.length - 1));
  const [besucht, setBesucht] = useState<Set<number>>(() => new Set([Math.min(start, schritte.length - 1)]));
  const gehe = (i: number) => {
    const n = Math.max(0, Math.min(schritte.length - 1, i));
    setAktuell(n);
    setBesucht((alt) => new Set(alt).add(n));
  };
  const s = schritte[aktuell];
  const naechster = schritte[aktuell + 1];
  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap gap-2" aria-label="Schritte">
        {schritte.map((x, i) => {
          const an = i === aktuell;
          const getan = !an && besucht.has(i) && i < aktuell;
          return (
            <li key={x.schluessel}>
              <button type="button" onClick={() => gehe(i)} aria-current={an ? 'step' : undefined}
                className={`flex items-center gap-2.5 rounded-full border py-1.5 pl-1.5 pr-4 text-sm font-bold transition ${an
                  ? 'border-sky-500 bg-sky-500/15 text-sky-300' : 'border-zinc-800 bg-zinc-900 text-slate-400 hover:border-sky-500/50 hover:text-slate-100'}`}>
                <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-black tabular-nums ${an
                  ? 'bg-sky-500 text-white' : getan ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-800 text-slate-400'}`}>
                  {getan ? '✓' : i + 1}
                </span>
                <T>{x.titel}</T>
              </button>
            </li>
          );
        })}
      </ol>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
        <h2 className="text-lg font-extrabold text-slate-100"><T>{s.titel}</T></h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-400"><T>{s.hinweis}</T></p>
        <div className="mt-5">{s.inhalt}</div>
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-zinc-800 pt-4">
          {aktuell > 0 && (
            <button type="button" onClick={() => gehe(aktuell - 1)}
              className="rounded-full border border-zinc-700 px-5 py-2 text-sm font-bold text-slate-300 transition hover:border-sky-500 hover:text-sky-400">
              ← <T>Zurück</T>
            </button>
          )}
          {naechster && (
            <button type="button" onClick={() => gehe(aktuell + 1)}
              className="ml-auto rounded-full bg-sky-500 px-6 py-2 text-sm font-bold text-white transition hover:bg-sky-400">
              <T>Weiter</T>: <T>{naechster.titel}</T> →
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ Vorlagen */

export interface Vorlage<C> {
  schluessel: string;
  titel: string;
  text: string;
  /** Was diese Vorlage in der Einstellung aendert. */
  setzt: Partial<C>;
}

/**
 * Fertige Looks als Karten, jede mit der echten Vorschau - ein Klick uebernimmt ihn.
 *
 * @param vorschauUrl die Adresse des echten Overlays mit dieser Einstellung (wie die grosse Vorschau oben)
 * @param gilt ob die Vorlage zur aktuellen Einstellung passt (dann ist sie markiert)
 */
export function Vorlagen<C>({ vorlagen, basis, vorschauUrl, gilt, waehle, hoehe = 130 }: {
  vorlagen: Array<Vorlage<C>>;
  basis: C;
  vorschauUrl: (cfg: C) => string;
  gilt: (v: Vorlage<C>) => boolean;
  waehle: (v: Vorlage<C>) => void;
  hoehe?: number;
}) {
  const t = useT();
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {vorlagen.map((v) => {
        const an = gilt(v);
        return (
          <button key={v.schluessel} type="button" onClick={() => waehle(v)} aria-pressed={an}
            className={`group overflow-hidden rounded-2xl border text-left transition ${an
              ? 'border-sky-500 shadow-[0_0_0_2px_rgba(14,165,233,.25)]' : 'border-zinc-800 hover:border-sky-500/60'}`}>
            <span className="pointer-events-none relative block overflow-hidden bg-zinc-950" style={{ height: hoehe }}>
              <span className="absolute inset-0 opacity-60" style={{ backgroundImage: 'linear-gradient(45deg,#27272a 25%,transparent 25%),linear-gradient(-45deg,#27272a 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#27272a 75%),linear-gradient(-45deg,transparent 75%,#27272a 75%)', backgroundSize: '16px 16px', backgroundPosition: '0 0,0 8px,8px -8px,-8px 0' }} />
              <iframe title={t(v.titel)} src={vorschauUrl({ ...basis, ...v.setzt })} scrolling="no" tabIndex={-1}
                className="absolute left-0 top-0 border-0"
                style={{ width: '200%', height: '200%', transform: 'scale(.5)', transformOrigin: 'top left' }} />
            </span>
            <span className="block px-4 py-3">
              <span className="flex items-center gap-2">
                <span className="text-sm font-extrabold text-slate-100"><T>{v.titel}</T></span>
                {an && <span className="rounded-full bg-sky-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white"><T>Gewählt</T></span>}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-slate-500"><T>{v.text}</T></span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ Letzter Schritt */

/**
 * Benennen, speichern und die Adresse fuer OBS - mit den Handgriffen in OBS, damit niemand suchen muss.
 */
export function FertigSchritt({ typ, id, name, setName, sichern, gespeichert, schmutzig, fehler, neu, liste, waehlen, entfernen, listeTitel, zusatz }: {
  typ: string;
  id: string | null;
  name: string;
  setName: (n: string) => void;
  sichern: () => void;
  gespeichert: boolean;
  schmutzig: boolean;
  fehler: string;
  neu: () => void;
  liste: OverlayEintrag[] | null;
  waehlen: (o: OverlayEintrag) => void;
  entfernen: (id: string) => void;
  listeTitel: string;
  /** Etwas, das nur zu dieser Art gehoert (z. B. der Hinweis zur Schaerfe in OBS) - steht unter der Adresse. */
  zusatz?: ReactNode;
}) {
  const t = useT();
  const [kopiert, setKopiert] = useState(false);
  const adresse = id ? overlayAdresse(typ, id) : '';
  const kopieren = async () => {
    try { await navigator.clipboard.writeText(adresse); setKopiert(true); setTimeout(() => setKopiert(false), 1800); } catch { /* dann von Hand markieren */ }
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Name im Dashboard')}
          className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-500 sm:max-w-sm" />
        <button type="button" onClick={sichern}
          className="rounded-full bg-sky-500 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-sky-400">
          {gespeichert ? t('gespeichert') : (id ? t('Übernehmen') : t('Speichern'))}
        </button>
        {id && (
          <button type="button" onClick={neu}
            className="rounded-full border border-zinc-700 px-4 py-2.5 text-xs font-bold text-slate-400 transition hover:border-sky-500/60 hover:text-sky-400">
            <T>Neues Overlay beginnen</T>
          </button>
        )}
      </div>
      {fehler && <p className="text-xs text-rose-400">{fehler}</p>}
      {id && schmutzig && <p className="text-xs text-amber-400"><T>Nicht übernommen — im Stream steht noch der vorige Stand.</T></p>}

      {id ? (
        <div className="rounded-2xl border border-sky-500/30 bg-sky-500/[0.06] p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-400"><T>Deine Adresse für OBS</T></p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-zinc-950 px-3 py-2 text-xs text-slate-200">{adresse}</code>
            <button type="button" onClick={kopieren}
              className="rounded-full bg-sky-500 px-5 py-2 text-xs font-bold text-white transition hover:bg-sky-400">
              {kopiert ? t('kopiert') : t('Adresse kopieren')}
            </button>
          </div>
          <ol className="mt-4 grid gap-2 text-xs leading-relaxed text-slate-400 sm:grid-cols-2">
            <li><b className="text-slate-200">1.</b> <T>In OBS bei „Quellen“ auf + klicken und „Browser“ wählen.</T></li>
            <li><b className="text-slate-200">2.</b> <T>Die Adresse oben bei „URL“ einfügen.</T></li>
            <li><b className="text-slate-200">3.</b> <T>Breite 1920 und Höhe 1080 eintragen, den Hintergrund lässt du, wie er ist.</T></li>
            <li><b className="text-slate-200">4.</b> <T>Fertig. Was du hier später änderst, ist im Stream nach wenigen Sekunden zu sehen — die Adresse bleibt dieselbe.</T></li>
          </ol>
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-zinc-800 px-4 py-5 text-sm text-slate-500">
          <T>Speichere das Overlay, dann bekommst du hier die Adresse für OBS.</T>
        </p>
      )}

      {zusatz}

      <div>
        <h3 className="mb-3 text-sm font-semibold text-slate-100">{listeTitel}</h3>
        <MeineListe liste={liste} typ={typ} offen={id} waehlen={waehlen} entfernen={entfernen} />
      </div>
    </div>
  );
}
