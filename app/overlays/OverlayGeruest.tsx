'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { useZugang } from '@/app/lib/zugang';
import MeineOverlays from './MeineOverlays';
import Startansicht from './Startansicht';
import LadeSchirm from '@/app/components/LadeSchirm';
import VipVorhang from './VipVorhang';

/*
 * Das gemeinsame Geruest der Overlay-Seiten.
 *
 * Der Betreiber wollte jede Art auf einer eigenen Seite: "das Leaderboard ist
 * eine eigene Page, die Overlays ist eine eigene Page". Was sie teilen, ist
 * die Leiste links und der Kasten rechts, in dem die eigenen Overlays stehen -
 * und der Weg, wie eine Einstellung gespeichert wird.
 *
 * Der Kern ist die Kennung: sie steht in der Adresse, die in OBS liegt, und
 * bleibt dieselbe. Alles andere wandert ueber /api/overlay-config und wird
 * vom Overlay im Takt nachgeholt. Wer hier etwas umstellt, sieht es im Stream,
 * ohne die Browserquelle anzufassen.
 */

export interface OverlayEintrag {
  id: string;
  typ: string;
  name: string;
  stand: number;
  geaendert: string;
  config: Record<string, unknown>;
  /*
   * Wer es angelegt und wer es zuletzt angefasst hat.
   *
   * Nur bei einem Manager-Zugang gefuellt, den sich mehrere teilen. Sonst
   * leer - dort ist ohnehin klar, wer es war.
   */
  angelegtVon?: string | null;
  geaendertVon?: string | null;
}

/** Die Arten, die es gibt - dieselbe Reihenfolge wie in der Leiste. */
export const ARTEN: Array<{
  schluessel: string; pfad: string; titel: string; datei: string; was: string;
  /**
   * Braucht diese Art keinen Cup?
   *
   * Dann fuehrt "Neues Overlay" direkt in den Baukasten. Der Betreiber zum
   * Offspawn: "muss man kein Cup auswaehlen" - und fuer den eigenen Text
   * gibt es erst recht keinen.
   */
  ohneCup?: boolean;
}> = [
  {
    schluessel: 'teamkarte', pfad: '/overlays/teamkarte', titel: 'Team card',
    datei: 'banner.html',
    was: 'Zwei Spieler nebeneinander, mit Foto und Werten',
  },
  {
    schluessel: 'standings', pfad: '/overlays/standings', titel: 'Standings',
    datei: 'standings.html',
    was: 'Die vordersten Plätze des laufenden Spieltags',
  },
  /*
   * Der Countdown - der Betreiber wollte ihn in der Leiste sehen: "links
   * daneben fehlt zum Beispiel ein Timer von einem Cup."
   */
  {
    schluessel: 'timer', pfad: '/overlays/timer', titel: 'Cup timer',
    datei: 'timer.html',
    was: 'Countdown bis zum Start des Spieltags',
  },
  /*
   * Der Offspawn-Stand. Er holt als einziger nichts von Epic - was dort
   * steht, gibt der Betreiber selbst ein.
   */
  {
    schluessel: 'offspawn', pfad: '/overlays/offspawn', titel: 'Custom overlay',
    datei: 'offspawn.html',
    was: 'Zwei Teams und ein Stand, von Hand gepflegt',
    ohneCup: true,
  },
  /*
   * Der eigene Text. Er war ein Balken unter dem Offspawn-Stand; der
   * Betreiber wollte ihn fuer sich: "das gibt's dann einfach als Overlay,
   * einfach selber."
   */
  {
    schluessel: 'text', pfad: '/overlays/text', titel: 'Custom text',
    datei: 'text.html',
    was: 'Eine Zeile Text, frei geschrieben, mit Balken oder ohne',
    ohneCup: true,
  },
  {
    schluessel: 'qual', pfad: '/overlays/qual', titel: 'Qual line',
    datei: 'qual.html',
    was: 'Wie viele Punkte es zum Weiterkommen braucht',
  },
];

/** Die Adresse, die in OBS gehoert. */
export function overlayAdresse(typ: string, id: string): string {
  const datei = ARTEN.find((a) => a.schluessel === typ)?.datei ?? 'standings.html';
  const basis = typeof window === 'undefined' ? '' : window.location.origin;
  return `${basis}/overlay/${datei}?id=${id}`;
}

/**
 * Die eigenen Overlays laden, anlegen, aendern und entfernen.
 *
 * Alles ueber dieselbe Schnittstelle - die Seiten unterscheiden sich nur in
 * dem, was sie einstellen lassen.
 */
export function useOverlays(typ: string) {
  const [liste, setListe] = useState<OverlayEintrag[] | null>(null);
  const [fehler, setFehler] = useState('');

  const laden = useCallback(async () => {
    try {
      const j = await (await fetch('/api/overlay-config?meine=1',
        { cache: 'no-store' })).json();
      setListe((j.overlays ?? []).filter((o: OverlayEintrag) => o.typ === typ));
    } catch {
      setListe([]);
    }
  }, [typ]);

  useEffect(() => { void laden(); }, [laden]);

  const speichern = useCallback(async (
    eintrag: { id?: string; name: string; config: Record<string, unknown> },
  ) => {
    setFehler('');
    try {
      const r = await fetch('/api/overlay-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...eintrag, typ }),
      });
      const j = await r.json();
      if (!r.ok) { setFehler(j?.error ?? 'Could not save'); return null; }
      await laden();
      /*
       * Im Studio steckt diese Seite in einem Rahmen. Dort wartet die Buehne
       * darauf, welches Overlay gerade gespeichert wurde - damit das Element
       * auf dem Stream-Bild sofort dieses Overlay zeigt.
       */
      if (typeof window !== 'undefined' && window.parent !== window) {
        window.parent.postMessage({ comphub: 'overlay-gespeichert', typ, id: j.id, name: eintrag.name }, window.location.origin);
      }
      return j.id as string;
    } catch (e) {
      setFehler((e as Error).message);
      return null;
    }
  }, [typ, laden]);

  const entfernen = useCallback(async (id: string) => {
    await fetch('/api/overlay-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, loeschen: true }),
    }).catch(() => {});
    await laden();
  }, [laden]);

  return { liste, fehler, speichern, entfernen, laden };
}

export default function OverlayGeruest({ aktiv, children }: {
  aktiv: string; children: React.ReactNode;
}) {
  const t = useT();
  const zugang = useZugang();
  /*
   * Baukasten oder Startseite?
   *
   * Wer die Seite blank aufruft, soll zuerst sehen, was er schon hat - so
   * wollte es der Betreiber: "wenn man draufkommt, sieht man alle seine
   * gespeicherten." In den Baukasten fuehrt der Knopf "Neues Overlay", der
   * einen Cup mitgibt, oder eine Adresse, die schon einen traegt.
   *
   * Entschieden wird an der Adresse und nicht an einem Zustand: ein neu
   * geladenes Fenster landet dann dort, wo es vorher stand.
   */
  const [imBaukasten, setImBaukasten] = useState(false);
  /*
   * Eingebettet im Studio: dieselbe Seite, nur ohne die Leiste links und
   * ohne "zurueck" - drumherum ist dann die Buehne, nicht die Overlay-Seite.
   */
  const [eingebettet, setEingebettet] = useState(false);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setImBaukasten(Boolean(p.get('bauen') || p.get('fenster') || p.get('id')));
    const drin = Boolean(p.get('eingebettet'));
    setEingebettet(drin);
    // Kopfzeile und schwebende Knoepfe ausblenden - siehe globals.css.
    document.documentElement.classList.toggle('eingebettet', drin);
  }, []);

  if (zugang.laedt) return <LadeSchirm />;

  // Ohne VIP: der Vorhang mit dem Weg zum Zugang (siehe VipVorhang).
  if (!zugang.vip) return <VipVorhang />;

  return (
    <main className={`flex-1 bg-zinc-950 text-slate-200 ${eingebettet ? 'px-4 py-4' : 'px-4 py-6'}`}>
      <div className="mx-auto flex max-w-[1500px] flex-col gap-6 lg:flex-row">

        {/* Die Leiste. Sie steht auf jeder Overlay-Seite gleich - nur im Studio nicht. */}
        {!eingebettet && <aside className="w-full shrink-0 lg:w-56">
          <p className="mb-2 px-2 text-[10px] font-semibold uppercase
                        tracking-[0.18em] text-slate-600">
            <T>Overlays</T>
          </p>
          <nav className="flex flex-wrap gap-1 lg:flex-col">
            {/*
              * Die Uebersicht: alle Overlays auf einem Stream-Bild anordnen.
              * Sie hiess "Studio", bis der Betreiber klarstellte, dass dort
              * nur Overlays liegen sollen und nichts, was nach Regiepult
              * aussieht - "unter Overview soll es nicht so eine Art Studio
              * sein ... sondern wirklich nur die Overlays."
              */}
            <Link href="/overlays/studio"
              className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm
                         font-semibold text-sky-400 transition hover:bg-sky-500/20">
              <T>Overview</T>
            </Link>
            {ARTEN.map((a) => (
              <Link key={a.schluessel} href={a.pfad}
                title={t(a.was)}
                className={`rounded-lg px-3 py-2 text-sm transition ${
                  aktiv === a.schluessel
                    ? 'bg-zinc-900 font-semibold text-sky-400'
                    : 'text-slate-400 hover:bg-zinc-900/60 hover:text-slate-200'}`}>
                {a.titel}
              </Link>
            ))}
          </nav>

          <p className="mt-6 px-2 text-[11px] leading-relaxed text-slate-600">
            <T>Die Adresse in OBS bleibt immer dieselbe. Was du hier umstellst,
            ist im Stream nach wenigen Sekunden zu sehen — ohne die
            Browserquelle anzufassen.</T>
          </p>

          {/*
            * Ein eigener Abschnitt mit mehr Luft darueber - so wollte es der
            * Betreiber. Er steht auf jeder Overlay-Seite gleich, denn was
            * jemand angelegt hat, gehoert nicht zu einer Art, sondern zu ihm.
            */}
          {/*
            * Auf der Startseite steht die Liste gross in der Mitte - hier
            * waere sie zweimal dasselbe.
            */}
          {imBaukasten && <MeineOverlays nurArt={aktiv} />}
        </aside>}

        <div className="min-w-0 flex-1">
          {imBaukasten ? (
            <>
              {!eingebettet && (
                <button onClick={() => { window.location.href = window.location.pathname; }}
                  className="mb-4 text-[11px] text-slate-500 transition
                             hover:text-sky-400">
                  ← <T>zurück zu deinen Overlays</T>
                </button>
              )}
              {children}
            </>
          ) : (
            <Startansicht art={aktiv} onWeiter={(e, w) => {
              /*
               * In den Baukasten, ohne die Seite zu wechseln.
               *
               * Ein router.push auf dieselbe Adresse zeichnet nichts neu -
               * der Betreiber drueckte auf die Art und es passierte nichts.
               * Deshalb wandert der Cup von Hand in die Adresse (damit ein
               * Neuladen dort landet) und der Baukasten wird direkt
               * aufgeschlagen.
               */
              // Ohne Cup bleiben event und fenster weg - die Adresse traegt
              // dann nur "bauen".
              const p = new URLSearchParams({ bauen: '1' });
              if (e) p.set('event', e);
              if (w) p.set('fenster', w);
              if (eingebettet) p.set('eingebettet', '1');
              window.history.replaceState(
                null, '', `${window.location.pathname}?${p.toString()}`);
              setImBaukasten(true);
            }} />
          )}
        </div>
      </div>
    </main>
  );
}
